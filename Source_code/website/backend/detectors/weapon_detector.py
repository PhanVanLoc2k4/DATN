import os
import time
import cv2
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity
from detectors.common import (
    get_shared_yolo_model, WEAPON_MODEL_PATH, PERSON_MODEL_PATH, TRACKER_PATH,
    face_app, optimize_face_image, calculate_iou, draw_hud_box,
    db_embeddings, db_names, id_smooth_names, SIMILARITY_THRESHOLD,
    CLASS_NAMES_VN, CLASS_COLORS, MIN_FACE_SIZE
)

# Biến toàn cục lưu BBoxTracker riêng cho từng camera (đồng bộ bám vết theo chuẩn test_detection.py)
cam_weapon_trackers = {}

class TrackedObject:
    """
    Lưu trữ thông tin của đối tượng đang được theo dõi qua các khung hình video
    """
    def __init__(self, track_id, class_id, bbox, conf):
        self.track_id = track_id
        self.class_id = class_id
        self.bbox = bbox  # [xmin, ymin, xmax, ymax]
        self.conf = conf
        self.frames_seen = 1
        self.frames_missing = 0
        self.confirmed = False

class BBoxTracker:
    """
    Bộ theo dõi hộp bao (BBox) dựa trên IoU để mượt hóa hiển thị và lọc nhiễu nhấp nháy trên Video (chuẩn test_detection.py)
    """
    def __init__(self, iou_threshold=0.3, max_disappeared=5, min_confirmed_frames=3):
        self.iou_threshold = iou_threshold
        self.max_disappeared = max_disappeared
        self.min_confirmed_frames = min_confirmed_frames
        self.tracked_objects = []
        self.next_track_id = 10000  # ID bắt đầu cho vũ khí

    @staticmethod
    def calculate_iou(box1, box2):
        x1 = max(box1[0], box2[0])
        y1 = max(box1[1], box2[1])
        x2 = min(box1[2], box2[2])
        y2 = min(box1[3], box2[3])
        
        intersection = max(0, x2 - x1) * max(0, y2 - y1)
        area1 = (box1[2] - box1[0]) * (box1[3] - box1[1])
        area2 = (box2[2] - box2[0]) * (box2[3] - box2[1])
        union = area1 + area2 - intersection
        
        if union == 0:
            return 0
        return intersection / union

    def update(self, detections):
        updated_tracked = []
        used_det_indices = set()
        
        for obj in self.tracked_objects:
            best_iou = 0
            best_idx = -1
            for idx, det in enumerate(detections):
                if idx in used_det_indices:
                    continue
                det_class = int(det.cls[0].item())
                if det_class != obj.class_id:
                    continue
                det_xyxy = det.xyxy[0].tolist()
                iou = self.calculate_iou(obj.bbox, det_xyxy)
                if iou > best_iou:
                    best_iou = iou
                    best_idx = idx
            
            if best_iou >= self.iou_threshold and best_idx != -1:
                det_box = detections[best_idx]
                obj.bbox = det_box.xyxy[0].tolist()
                obj.conf = 0.6 * obj.conf + 0.4 * det_box.conf[0].item()
                obj.frames_seen += 1
                obj.frames_missing = 0
                if obj.frames_seen >= self.min_confirmed_frames:
                    obj.confirmed = True
                updated_tracked.append(obj)
                used_det_indices.add(best_idx)
            else:
                obj.frames_missing += 1
                if obj.frames_missing <= self.max_disappeared:
                    updated_tracked.append(obj)
        
        for idx, det in enumerate(detections):
            if idx not in used_det_indices:
                det_class = int(det.cls[0].item())
                det_xyxy = det.xyxy[0].tolist()
                det_conf = det.conf[0].item()
                new_obj = TrackedObject(self.next_track_id, det_class, det_xyxy, det_conf)
                self.next_track_id += 1
                if self.min_confirmed_frames <= 1:
                    new_obj.confirmed = True
                updated_tracked.append(new_obj)
        
        self.tracked_objects = updated_tracked
        return [obj for obj in self.tracked_objects if obj.confirmed and obj.frames_missing <= 2]

def filter_detections(boxes, img_shape, conf_thresholds=None, min_bbox_size=20, min_area_ratio=0.0005, aspect_ratio_limits=None):
    """
    Bộ lọc tĩnh (Static Filters) từ test_detection.py để loại bỏ nhiễu nhầm và nội thất (Bàn/Ghế)
    """
    if conf_thresholds is None:
        conf_thresholds = {0: 0.20, 1: 0.25, 2: 0.50}  # Súng cần độ tin cậy cao hơn để giảm nhầm dao/tay.
    if aspect_ratio_limits is None:
        aspect_ratio_limits = {1: 1.15}  # Gậy thuôn dài >= 1.15 (cho phép gậy cầm chéo)

    h, w = img_shape[:2]
    img_area = w * h
    filtered_boxes = []

    for box in boxes:
        class_id = int(box.cls[0].item())
        conf = box.conf[0].item()
        xyxy = box.xyxy[0].tolist()
        
        xmin, ymin, xmax, ymax = xyxy
        box_w = xmax - xmin
        box_h = ymax - ymin
        box_area = box_w * box_h
        
        # 1. Ngưỡng confidence theo từng lớp
        class_conf_limit = conf_thresholds.get(class_id, 0.25)
        if conf < class_conf_limit:
            continue
            
        # 2. Kích thước tối thiểu (tránh nhiễu xa, mờ)
        if box_w < min_bbox_size or box_h < min_bbox_size:
            continue
            
        # 3. Tỷ lệ diện tích tối thiểu so với khung hình
        if (box_area / img_area) < min_area_ratio:
            continue
            
        # 4. Kiểm tra tỉ lệ cạnh (Aspect Ratio) của Gậy
        if class_id in aspect_ratio_limits:
            limit = aspect_ratio_limits[class_id]
            aspect_ratio = max(box_w, box_h) / max(1.0, min(box_w, box_h))
            if aspect_ratio < limit:
                continue

        # 5. Bộ lọc nội thất cho Súng. Không giới hạn kích thước tối đa
        # của Dao theo pixel vì sẽ loại cả dao thật ở gần camera.
        if class_id == 2 and (box_w > 160 or box_h > 160 or box_area > 15000):
            continue
                
        filtered_boxes.append(box)
        
    return filtered_boxes

def calculate_box_distance(box1, box2):
    """Tính khoảng cách Euclidean ngắn nhất giữa 2 bounding box"""
    xmin1, ymin1, xmax1, ymax1 = box1
    xmin2, ymin2, xmax2, ymax2 = box2
    dx = max(0, xmin1 - xmax2, xmin2 - xmax1)
    dy = max(0, ymin1 - ymax2, ymin2 - ymax1)
    return np.sqrt(dx**2 + dy**2)

def associate_weapons_and_persons(weapons, p_boxes, p_ids, norm_threshold=0.25):
    """
    Liên kết các vũ khí phát hiện được với người gần nhất dựa trên khoảng cách chuẩn hóa (< 25% kích thước người)
    """
    associations = []
    unassociated_weapons = []

    for w in weapons:
        w_box = w.bbox
        closest_person_idx = None
        min_norm_dist = float('inf')
        min_dist = float('inf')
        
        for j, p_box in enumerate(p_boxes):
            p_w = p_box[2] - p_box[0]
            p_h = p_box[3] - p_box[1]
            person_size = max(1.0, p_w, p_h)
            
            dist = calculate_box_distance(w_box, p_box)
            norm_dist = dist / person_size
            
            if norm_dist < min_norm_dist:
                min_norm_dist = norm_dist
                min_dist = dist
                closest_person_idx = j
                
        if closest_person_idx is not None and min_norm_dist < norm_threshold:
            associations.append({
                'weapon': w,
                'person_box': p_boxes[closest_person_idx],
                'person_id': p_ids[closest_person_idx],
                'norm_dist': min_norm_dist,
                'dist': min_dist
            })
        else:
            unassociated_weapons.append(w)
            
    return associations, unassociated_weapons

def process_weapon_frame(frame, cam_id, now):
    """
    Xử lý nhận diện vũ khí & định danh khuôn mặt theo CHUẨN test_detection.py:
    1. Bộ lọc tĩnh filter_detections (ngưỡng conf riêng, kích thước nhỏ nhất, aspect ratio gậy, loại nội thất bàn/ghế).
    2. Bộ theo dõi BBoxTracker (min_confirmed_frames=3, làm mượt conf EMA, chống nhấp nháy).
    3. Liên kết người - vũ khí theo khoảng cách chuẩn hóa (norm_dist < 0.25).
    4. Nhận diện khuôn mặt cho tất cả mọi người trong khung hình (chữa lỗi chưa nhận diện đối tượng).
    """
    frame_h, frame_w = frame.shape[:2]
    FRAME_SIZE = (frame_w, frame_h)

    weapon_model = get_shared_yolo_model(WEAPON_MODEL_PATH, 'weapon', cam_id)
    person_model = get_shared_yolo_model(PERSON_MODEL_PATH, 'weapon_person', cam_id)

    processed_objects = []
    has_alert = False
    alert_tids = []
    recognized_names = []
    all_names_in_frame = []

    if not weapon_model or not person_model:
        return processed_objects, False, "Không xác định", alert_tids, []

    # 1. Quét vũ khí stateless như test_detection.py và lọc tĩnh
    # Model cũ dễ bỏ sót lưỡi dao khi thu nhỏ ảnh xuống 640px.
    w_results = weapon_model.predict(frame, conf=0.15, iou=0.45, imgsz=1280, verbose=False)
    raw_boxes = w_results[0].boxes if (w_results and w_results[0].boxes is not None) else []
    filtered_boxes = filter_detections(raw_boxes, (FRAME_SIZE[1], FRAME_SIZE[0]))

    # 2. Cập nhật BBoxTracker theo Camera (min_confirmed_frames=1 để hiển thị ngay lập tức)
    tracker = cam_weapon_trackers.setdefault(cam_id, BBoxTracker(iou_threshold=0.3, max_disappeared=5, min_confirmed_frames=1))
    confirmed_weapons = tracker.update(filtered_boxes)

    # 3. Quét người với tracking chuẩn YOLOv8 (conf=0.40, imgsz=640 chuẩn test_detection.py)
    p_results = person_model.track(frame, persist=True, tracker=TRACKER_PATH, conf=0.40, iou=0.50, classes=[0], imgsz=640, verbose=False)
    p_boxes, p_ids = [], []
    if p_results and p_results[0].boxes is not None:
        p_boxes = p_results[0].boxes.xyxy.cpu().numpy()
        if p_results[0].boxes.id is not None:
            p_ids = p_results[0].boxes.id.cpu().numpy().astype(int)
        else:
            p_ids = [idx + 1 for idx in range(len(p_boxes))]

    # 4. Quản lý Cache danh tính khuôn mặt theo Camera ID
    if cam_id not in id_smooth_names:
        id_smooth_names[cam_id] = {}
    cam_cache = id_smooth_names[cam_id]

    current_tids_set = set(p_ids)
    for tid in p_ids:
        if tid not in cam_cache:
            cam_cache[tid] = {
                "name": "unknown",
                "locked": False,
                "bbox": None,
                "missed_frames": 0,
                "last_time": now,
                "last_face_time": 0.0
            }
        cam_cache[tid]["last_time"] = now
        cam_cache[tid]["missed_frames"] = 0

    # Dọn dẹp ID cũ (>15s)
    for tid in list(cam_cache.keys()):
        if str(tid).startswith("_"): continue
        if tid not in current_tids_set:
            cam_cache[tid]["missed_frames"] += 1
            if now - cam_cache[tid]["last_time"] > 15.0 or cam_cache[tid]["missed_frames"] > 30:
                cam_cache.pop(tid, None)

    # 5. QUÉT NHẬN DIỆN KHUÔN MẶT CHO TẤT CẢ MỌI NGƯỜI TRONG KHUNG HÌNH
    h, w = frame.shape[:2]
    for j, pbox in enumerate(p_boxes):
        tid = p_ids[j]
        info = cam_cache.get(tid)
        if not info: continue
        info["bbox"] = pbox
        
        if not info["locked"]:
            if now - info.get("last_face_time", 0.0) > 0.2:
                info["last_face_time"] = now
                px1, py1, px2, py2 = map(int, pbox)
                box_w = px2 - px1
                box_h = py2 - py1
                if box_w >= MIN_FACE_SIZE and box_h >= MIN_FACE_SIZE:
                    crops_to_try = []
                    pad_w = int(box_w * 0.15)
                    pad_h = int(box_h * 0.15)
                    c1 = frame[max(0, py1 - pad_h):min(h, py1 + int(box_h * 0.70)), max(0, px1 - pad_w):min(w, px2 + pad_w)]
                    if c1.size > 0: crops_to_try.append(c1)
                    c2 = frame[max(0, py1):min(h, py2), max(0, px1):min(w, px2)]
                    if c2.size > 0: crops_to_try.append(c2)

                    for crp in crops_to_try:
                        try:
                            faces = face_app.get(crp)
                            if not faces:
                                faces = face_app.get(optimize_face_image(crp))
                            if faces and len(db_embeddings) > 0:
                                face = max(faces, key=lambda fx: (fx.bbox[2]-fx.bbox[0])*(fx.bbox[3]-fx.bbox[1]))
                                emb = face.embedding / np.linalg.norm(face.embedding)
                                sims = cosine_similarity(emb.reshape(1, -1), db_embeddings)[0]
                                best_idx = np.argmax(sims)
                                score = sims[best_idx]
                                if score >= SIMILARITY_THRESHOLD:
                                    info["name"] = db_names[best_idx]
                                    info["locked"] = True
                                    print(f"[{cam_id}] ✅ Nhận diện thành công ID #{tid}: {info['name']} (Score: {score:.2f})")
                                    break
                        except Exception as e:
                            print(f"[{cam_id}] AI Weapon Face Error: {e}")

    # 6. Liên kết người và vũ khí theo khoảng cách chuẩn hóa (norm_dist < 0.25 như test_detection.py)
    associations, unassociated_weapons = associate_weapons_and_persons(confirmed_weapons, p_boxes, p_ids, norm_threshold=0.25)
    weapon_holder_map = {}  # mapping pid -> list(w_name)
    
    for assoc in associations:
        w = assoc['weapon']
        pid = assoc['person_id']
        w_name = CLASS_NAMES_VN.get(w.class_id, "Vũ khí")
        w_color = CLASS_COLORS.get(w.class_id, (0, 0, 255))
        
        has_alert = True
        alert_tids.append(int(w.track_id))
        alert_tids.append(int(pid))
        
        draw_hud_box(frame, w.bbox, w_color, f"--- {w_name.upper()} #{w.track_id} [{w.conf*100:.0f}%]")
        weapon_holder_map.setdefault(pid, []).append(w_name)
        
        processed_objects.append({
            "track_id": int(w.track_id),
            "name": f"--- {w_name.upper()} #{w.track_id} [{w.conf*100:.0f}%]",
            "bbox": list(map(int, w.bbox)),
            "status": f"CẢNH BÁO {w_name.upper()}",
            "has_alert": True,
            "is_alert": True,
            "color": w_color,
            "vtype": "VŨ KHÍ"
        })

    # 7. Vũ khí tự do (không liên kết với người): chỉ cảnh báo nếu độ tin cậy rất cao (>=0.70 theo test_detection.py)
    for w in unassociated_weapons:
        # Hiển thị Dao đã qua bộ lọc ngay cả khi chưa đủ ngưỡng cảnh báo.
        if w.class_id == 0 and w.conf < 0.70:
            w_name = CLASS_NAMES_VN[w.class_id]
            w_color = CLASS_COLORS[w.class_id]
            label = f"{w_name.upper()} #{w.track_id} [{w.conf*100:.0f}%]"
            draw_hud_box(frame, w.bbox, w_color, label)
            processed_objects.append({
                "track_id": int(w.track_id),
                "name": label,
                "bbox": list(map(int, w.bbox)),
                "status": f"Phát hiện {w_name} - chưa đủ ngưỡng cảnh báo",
                "has_alert": False,
                "is_alert": False,
                "color": w_color,
                "vtype": "VŨ KHÍ"
            })
        if w.conf >= 0.70:
            w_name = CLASS_NAMES_VN.get(w.class_id, "Vũ khí")
            w_color = CLASS_COLORS.get(w.class_id, (0, 0, 255))
            has_alert = True
            alert_tids.append(int(w.track_id))
            draw_hud_box(frame, w.bbox, w_color, f"--- {w_name.upper()} #{w.track_id} (Tự do) [{w.conf*100:.0f}%]")
            
            processed_objects.append({
                "track_id": int(w.track_id),
                "name": f"--- {w_name.upper()} #{w.track_id} (Tự do) [{w.conf*100:.0f}%]",
                "bbox": list(map(int, w.bbox)),
                "status": f"CẢNH BÁO {w_name.upper()}",
                "has_alert": True,
                "is_alert": True,
                "color": w_color,
                "vtype": "VŨ KHÍ"
            })

    # 8. Hiển thị HUD cho từng người trong khung hình
    for j, pbox in enumerate(p_boxes):
        tid = p_ids[j]
        info = cam_cache.get(tid)
        person_name = info["name"] if info else "unknown"

        if tid in weapon_holder_map:
            w_list = list(set(weapon_holder_map[tid]))
            w_str_person = ", ".join(w_list)
            person_label = f"ĐỐI TƯỢNG MANG {w_str_person.upper()}" if person_name == "unknown" else f"🔥 {person_name} MANG {w_str_person.upper()}"
            color = (0, 0, 255)
            status = f"MANG {w_str_person.upper()}"
            is_alert_person = True
            if person_name != "unknown":
                recognized_names.append(person_name)
                all_names_in_frame.append(person_name)
            else:
                all_names_in_frame.append("Đối tượng")
        else:
            person_label = f"👤 {person_name}" if person_name != "unknown" else f"👤 Người #{tid}"
            color = (0, 255, 0)
            status = "Bình thường"
            is_alert_person = False
            if person_name != "unknown":
                all_names_in_frame.append(person_name)

        draw_hud_box(frame, pbox, color, person_label)

        processed_objects.append({
            "track_id": int(tid),
            "name": person_label,
            "bbox": list(map(int, pbox)),
            "status": status,
            "has_alert": is_alert_person,
            "is_alert": is_alert_person,
            "color": color,
            "vtype": "VŨ KHÍ" if is_alert_person else "Bình thường"
        })

    detected_weapon_names = []
    for assoc in associations:
        wn = CLASS_NAMES_VN.get(assoc['weapon'].class_id, "Vũ khí")
        if wn not in detected_weapon_names:
            detected_weapon_names.append(wn)
    for w in unassociated_weapons:
        if w.conf >= 0.70:
            wn = CLASS_NAMES_VN.get(w.class_id, "Vũ khí")
            if wn not in detected_weapon_names:
                detected_weapon_names.append(wn)
    w_str = ", ".join(detected_weapon_names) if detected_weapon_names else "Vũ khí"

    if has_alert:
        names_str = ", ".join(list(set(recognized_names))) if recognized_names else "Đối tượng"
        identities_str = f"{names_str} (Mang {w_str})" if recognized_names else f"Đối tượng mang {w_str}"
    else:
        identities_str = ", ".join(list(set(all_names_in_frame))) if all_names_in_frame else "Không xác định"

    return processed_objects, has_alert, identities_str, alert_tids, []
