import os
import time
import cv2
import numpy as np
import math
from collections import defaultdict, deque
from sklearn.metrics.pairwise import cosine_similarity
import detectors.common as common
from detectors.common import (
    get_shared_yolo_model, MODEL_PATH, TRACKER_PATH,
    face_app, draw_hud_box
)
from event_engine import event_engine

# ================= CONFIG - TỪ THÀNH CÔNG CỦA tracking_fight_face.py =================
FIGHT_CONFIRM_FRAMES = 3   # Số frame tích lũy để xác nhận đánh nhau
YOLO_CONF = 0.25           # Ngưỡng phát hiện YOLO nhạy hơn
FACE_SIM_THRESHOLD = 0.40  # Ngưỡng nhận diện danh tính khuôn mặt
FRAME_SIZE = (960, 540)     # Kích thước chuẩn hóa khung hình

# Ngưỡng nhận diện hành vi
MIN_FIGHT_CONF = 0.55       # Ngưỡng tin cậy class fight
MOTION_SENSITIVITY = 12.0  # Ngưỡng vận tốc xô xát
STRICT_IOU = 0.2           # Ngưỡng va chạm IOU
EMA_ALPHA = 0.85           # Hệ số mượt khung hình EMA

# Bộ nhớ trạng thái độc lập theo từng Camera ID
cam_states = {}

# ================= UTILS =================
def get_center(box):
    return ((box[0] + box[2]) // 2, (box[1] + box[3]) // 2)

def calculate_iou(box1, box2):
    x1, y1 = max(box1[0], box2[0]), max(box1[1], box2[1])
    x2, y2 = min(box1[2], box2[2]), min(box1[3], box2[3])
    inter = max(0, x2 - x1) * max(0, y2 - y1)
    area1 = (box1[2] - box1[0]) * (box1[3] - box1[1])
    area2 = (box2[2] - box2[0]) * (box2[3] - box2[1])
    return inter / (area1 + area2 - inter + 1e-6)

def get_motion(track):
    if len(track) < 2: return 0
    return math.hypot(track[-1][0] - track[-2][0], track[-1][1] - track[-2][1])

def optimize_face(crop):
    """Tiền xử lý khuôn mặt (Chống lóa / Phôi sáng / CLAHE) từ tracking_fight_face.py."""
    if crop is None or crop.size == 0: return crop
    
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    avg = np.mean(gray)
    
    gamma = 1.0
    if avg > 210: gamma = 2.5
    elif avg > 185: gamma = 1.8
    elif avg > 165: gamma = 1.4
    elif avg < 60: gamma = 0.6
    
    if gamma != 1.0:
        table = np.array([((i / 255.0) ** gamma) * 255 for i in np.arange(0, 256)]).astype("uint8")
        crop = cv2.LUT(crop, table)
        
    crop = cv2.normalize(crop, None, 0, 255, cv2.NORM_MINMAX)

    lab = cv2.cvtColor(crop, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=4.0, tileGridSize=(8, 8))
    cl = clahe.apply(l)
    l_merged = cv2.merge((cl, a, b))
    crop = cv2.cvtColor(l_merged, cv2.COLOR_LAB2BGR)
    
    gaussian = cv2.GaussianBlur(crop, (0, 0), 2.0)
    crop = cv2.addWeighted(crop, 1.5, gaussian, -0.5, 0)
    return crop

def process_behavior_frame(frame, cam_id, now):
    """
    Hệ thống phát hiện đánh nhau & nhận diện danh tính xây dựng lại từ đầu:
    Đồng bộ 100% với script benchmark tracking_fight_face.py.
    """
    # 1. Resize khung hình về kích thước chuẩn (960, 540)
    frame_h, frame_w = frame.shape[:2]
    if (frame_w, frame_h) != FRAME_SIZE:
        frame = cv2.resize(frame, FRAME_SIZE)

    # 2. Khởi tạo / Lấy Model YOLO dành riêng cho cam_id này (Bảo toàn ByteTrack state)
    model = get_shared_yolo_model(MODEL_PATH, 'behavior', cam_id)
    
    # 3. Chạy Tracking với cấu hình tracker chuẩn
    results = model.track(
        frame,
        persist=True,
        conf=YOLO_CONF,
        tracker=TRACKER_PATH,
        verbose=False,
        agnostic_nms=True
    )

    # Khởi tạo dữ liệu bộ nhớ riêng cho từng cam_id
    if cam_id not in cam_states:
        cam_states[cam_id] = {
            "id_to_name": {},
            "recognized_ids": set(),
            "track_history": defaultdict(lambda: deque(maxlen=20)),
            "smoothed_boxes": {},
            "fight_counter": defaultdict(int),
            "last_seen": {}
        }
        
    state = cam_states[cam_id]
    id_to_name = state["id_to_name"]
    recognized_ids = state["recognized_ids"]
    track_history = state["track_history"]
    smoothed_boxes = state["smoothed_boxes"]
    fight_counter = state["fight_counter"]
    last_seen = state["last_seen"]

    processed_objects = []
    has_alert = False
    max_label = "Bình thường"
    alert_tids = []

    results_raw = results[0] if results else None
    if results_raw is None or results_raw.boxes is None or len(results_raw.boxes) == 0:
        return processed_objects, has_alert, "Không xác định", alert_tids, []

    boxes = results_raw.boxes.xyxy.cpu().numpy()
    clss = results_raw.boxes.cls.cpu().numpy().astype(int)
    confs = results_raw.boxes.conf.cpu().numpy()
    if results_raw.boxes.id is not None:
        track_ids = results_raw.boxes.id.cpu().numpy().astype(int)
    else:
        track_ids = np.arange(100, 100 + len(boxes))

    # Lọc bỏ các box NaN
    valid_mask = ~np.isnan(boxes).any(axis=1)
    boxes = boxes[valid_mask]
    clss = clss[valid_mask]
    confs = confs[valid_mask]
    track_ids = track_ids[valid_mask]

    # Cập nhật thời gian xuất hiện lần cuối
    for tid in track_ids:
        last_seen[tid] = now

    # ================= 4. NHẬN DIỆN KHUÔN MẶT =================
    db_emb = common.db_embeddings
    db_names = common.db_names

    for i, tid in enumerate(track_ids):
        x1, y1, x2, y2 = map(int, boxes[i])
        center_pt = get_center(boxes[i])
        track_history[tid].append(center_pt)

        box_w = x2 - x1
        box_h = y2 - y1

        # Điều kiện kích thước người phù hợp (hỗ trợ người xa và người gần)
        if tid not in recognized_ids and (box_w > 15 or box_h > 25):
            h, w = frame.shape[:2]
            
            crops_to_try = []
            
            # Crop 1: Vùng đầu & ngực trên (Top 70%) có top padding
            pad_w = int(box_w * 0.15)
            pad_h = int(box_h * 0.15)
            c1 = frame[max(0, y1 - pad_h):min(h, y1 + int(box_h * 0.70)), max(0, x1 - pad_w):min(w, x2 + pad_w)]
            if c1.size > 0: crops_to_try.append(c1)
            
            # Crop 2: Full body box
            c2 = frame[max(0, y1):min(h, y2), max(0, x1):min(w, x2)]
            if c2.size > 0: crops_to_try.append(c2)

            for crp in crops_to_try:
                try:
                    # Giai đoạn 1: Quét trực tiếp trên crop gốc
                    faces = face_app.get(crp)
                    if not faces:
                        # Giai đoạn 2: Quét trên crop tối ưu hóa chống lóa
                        processed_crop = optimize_face(crp)
                        faces = face_app.get(processed_crop)

                    if faces and len(db_emb) > 0:
                        face = max(faces, key=lambda f: (f.bbox[2]-f.bbox[0])*(f.bbox[3]-f.bbox[1]))
                        emb = face.embedding / np.linalg.norm(face.embedding)
                        
                        sims = cosine_similarity(emb.reshape(1, -1), db_emb)[0]
                        best_idx = np.argmax(sims)
                        score = sims[best_idx]

                        if score >= FACE_SIM_THRESHOLD:
                            id_to_name[tid] = db_names[best_idx]
                            recognized_ids.add(tid)
                            print(f"[{cam_id}] ✅ Nhận diện thành công: ID {tid} -> {id_to_name[tid]} ({score:.2f})")
                            break
                except Exception as e:
                    print(f"[{cam_id}] AI Face Error: {e}")

    # ================= 5. LOGIC PHÁT HIỆN ĐÁNH NHAU =================
    current_fights = set()

    for i in range(len(track_ids)):
        tid_i = track_ids[i]
        box_i = boxes[i]

        # ĐIỀU KIỆN 1: Model phát hiện class Fight + confidence cao + vận tốc di chuyển
        if clss[i] == 1 and confs[i] > MIN_FIGHT_CONF:
            if get_motion(track_history[tid_i]) > 3.0:
                current_fights.add(tid_i)

        # ĐIỀU KIỆN 2: Va chạm cặp đôi (IOU > 0.2) + Cả 2 chuyển động mạnh
        for j in range(i + 1, len(track_ids)):
            tid_j = track_ids[j]
            if calculate_iou(box_i, boxes[j]) > STRICT_IOU:
                m_i = get_motion(track_history[tid_i])
                m_j = get_motion(track_history[tid_j])
                if m_i > 5.0 and m_j > 5.0:
                    current_fights.add(tid_i)
                    current_fights.add(tid_j)

    # ================= 6. VẼ BBOX & LÀM MỊN KHUNG HÌNH (EMA) =================
    all_names_in_frame = []

    for i, tid in enumerate(track_ids):
        if tid in current_fights:
            fight_counter[tid] += 1
        else:
            fight_counter[tid] = max(0, fight_counter[tid] - 1)

        is_fighting_raw = fight_counter[tid] >= FIGHT_CONFIRM_FRAMES

        # Đồng bộ với Event Engine lưu CSDL
        is_fighting, obj_alert_val = event_engine.process_behavior_event(cam_id, tid, is_fighting_raw, now)

        # Xác định màu sắc, trạng thái và cờ cảnh báo
        if obj_alert_val:
            color = (0, 0, 255)  # Màu Đỏ (BGR) - Cảnh báo đỏ chính thức
            status_str = "ĐÁNH NHAU"
            obj_has_alert = True
            obj_is_alert = True
        elif is_fighting:
            color = (0, 165, 255)  # Màu Cam (BGR) - Đang theo dõi, đếm giây
            status_str = "Đang theo dõi (Xác minh đánh nhau)"
            obj_has_alert = False
            obj_is_alert = False
        else:
            color = (0, 255, 0)  # Màu Xanh (BGR) - Bình thường
            status_str = "Bình thường"
            obj_has_alert = False
            obj_is_alert = False

        name = id_to_name.get(tid, "Đối tượng chưa xác định")
        label = f"{name} | {status_str}"

        # TẮT LÀM MỊN (EMA_ALPHA = 1.0) để Box bám sát chặt người, không bị trễ nhịp
        target_box = boxes[i]
        smoothed_boxes[tid] = target_box
        
        sx1, sy1, sx2, sy2 = map(int, smoothed_boxes[tid])
        draw_hud_box(frame, (sx1, sy1, sx2, sy2), color, label)

        if obj_alert_val:
            has_alert = True
            max_label = "ĐÁNH NHAU / XÔ XÁT"
            alert_tids.append(tid)
            all_names_in_frame.append(name)
        elif name != "Đối tượng chưa xác định":
            all_names_in_frame.append(name)

        # Scale back to original frame coordinates (from 960x540 back to frame_w x frame_h)
        orig_sx1 = int(sx1 * frame_w / FRAME_SIZE[0])
        orig_sy1 = int(sy1 * frame_h / FRAME_SIZE[1])
        orig_sx2 = int(sx2 * frame_w / FRAME_SIZE[0])
        orig_sy2 = int(sy2 * frame_h / FRAME_SIZE[1])

        processed_objects.append({
            "track_id": int(tid),
            "name": name,
            "bbox": [orig_sx1, orig_sy1, orig_sx2, orig_sy2],
            "status": status_str,
            "label": f"{name} | {status_str}",
            "has_alert": obj_has_alert,
            "is_alert": obj_is_alert,
            "color": color
        })

    # 7. Dọn dẹp cache cũ không hoạt động (> 30s)
    dead_ids = [t for t, t_seen in last_seen.items() if now - t_seen > 30.0]
    for t in dead_ids:
        last_seen.pop(t, None)
        smoothed_boxes.pop(t, None)
        fight_counter.pop(t, None)
        track_history.pop(t, None)

    identities_str = ", ".join(list(set(all_names_in_frame))) if all_names_in_frame else "Không xác định"

    return processed_objects, has_alert, identities_str, alert_tids, []
