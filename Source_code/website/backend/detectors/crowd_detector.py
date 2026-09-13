import os
import time
import math
from datetime import datetime
import cv2
import numpy as np
from collections import defaultdict, deque
from detectors.common import (
    get_shared_yolo_model, PERSON_MODEL_PATH, TRACKER_PATH,
    calculate_iou, draw_hud_box, id_smooth_names, CAM_CROWD_SETTINGS,
    crowd_state
)

CROWD_THRESHOLD = 8
CROWD_MIN_DURATION = 3

# Ưu tiên sử dụng model YOLOv8s.pt chuẩn cho phát hiện đám đông (tốt hơn khi người bị che khuất)
CROWD_MODEL_PATH = os.path.abspath(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "yolov8s.pt"))
if not os.path.exists(CROWD_MODEL_PATH):
    CROWD_MODEL_PATH = PERSON_MODEL_PATH

CONTEXT_RULES = {
    "Hành lang": {
        "Trong giờ học": (10, 60, "Medium"),
        "Giờ nghỉ": (15, 45, "Low"),
        "Giờ tan học": (20, 30, "Low")
    },
    "Sân trường": {
        "Trong giờ học": (8, 30, "Medium"),
        "Giờ nghỉ": (999, 999, "None"),
        "Giờ tan học": (999, 999, "None")
    },
    "Cổng trường": {
        "Trong giờ học": (5, 15, "Medium"),
        "Giờ nghỉ": (12, 30, "Low"),
        "Giờ tan học": (25, 60, "Low")
    },
    "Bãi xe": {
        "Trong giờ học": (5, 10, "High"),
        "Giờ nghỉ": (8, 20, "Medium"),
        "Giờ tan học": (15, 30, "Low")
    }
}

GRID_ROWS = 3
GRID_COLS = 3
CELL_DENSITY_THRESHOLD = 4

ROI_DEFINITIONS = {
    "Cổng trường": {
        "points": np.array([[0.05, 0.45], [0.45, 0.45], [0.4, 0.95], [0.05, 0.95]]),
        "color": (255, 120, 0)
    },
    "Hành lang": {
        "points": np.array([[0.35, 0.15], [0.95, 0.15], [0.9, 0.55], [0.3, 0.55]]),
        "color": (255, 0, 255)
    },
    "Sân trường": {
        "points": np.array([[0.1, 0.55], [0.9, 0.55], [0.95, 0.95], [0.05, 0.95]]),
        "color": (0, 255, 255)
    },
    "Bãi xe": {
        "points": np.array([[0.55, 0.45], [0.95, 0.45], [0.95, 0.9], [0.55, 0.9]]),
        "color": (0, 165, 255)
    },
    "Toàn màn hình": {
        "points": np.array([[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0]]),
        "color": (0, 255, 0)
    }
}

def get_current_time_context():
    from datetime import datetime
    now_dt = datetime.now()
    current_hour = now_dt.hour
    current_minute = now_dt.minute
    current_weekday = now_dt.weekday()

    if current_weekday < 6:
        if (7, 0) <= (current_hour, current_minute) <= (11, 30):
            if (9, 0) <= (current_hour, current_minute) <= (9, 30):
                return "Giờ nghỉ"
            return "Trong giờ học"
        elif (13, 0) <= (current_hour, current_minute) <= (17, 0):
            if (15, 0) <= (current_hour, current_minute) <= (15, 30):
                return "Giờ nghỉ"
            return "Trong giờ học"
        elif (11, 30) < (current_hour, current_minute) < (13, 0):
            return "Giờ nghỉ"
def shrink_box(box, factor_x=0.07, factor_y=0.05):
    """Thu nhỏ bounding box lại một chút từ tâm để vừa vặn hơn, tránh chạm sát người bên cạnh."""
    x1, y1, x2, y2 = map(int, box)
    w = x2 - x1
    h = y2 - y1
    dx = int(w * factor_x)
    dy = int(h * factor_y)
    new_x1 = x1 + dx
    new_y1 = y1 + dy
    new_x2 = max(new_x1 + 10, x2 - dx)
    new_y2 = max(new_y1 + 10, y2 - dy)
    return [new_x1, new_y1, new_x2, new_y2]

def process_crowd_frame(frame, cam_id, now):
    """
    Xử lý theo dõi đám đông & mật độ ROI đồng bộ với crowd_detection_test.py:
    1. Tracking người với YOLOv8s.pt, imgsz=640, conf=0.22, classes=[0]
    2. Lọc bỏ tranh ảnh tĩnh / Poster đứng yên trên tường (is_static_poster)
    3. Phân tích mật độ theo ROI Polygon và ô lưới 3x3
    4. Optical flow + Vận tốc di chuyển phát hiện xô đẩy/hỗn loạn
    5. Vẽ HUD và đường trail lịch sử di chuyển chuẩn test_detection
    """
    model = get_shared_yolo_model(CROWD_MODEL_PATH, 'crowd', cam_id)
    results = model.track(
        frame,
        persist=True,
        verbose=False,
        conf=0.22,
        iou=0.45,
        imgsz=640,
        classes=[0],
        tracker=TRACKER_PATH
    )

    processed_objects = []
    has_alert = False
    max_label = "Bình thường"
    alert_tids = []

    results_raw = results[0] if results else None
    if results_raw is None or results_raw.boxes is None:
        return processed_objects, has_alert, "Không xác định", alert_tids, []

    boxes = results_raw.boxes.xyxy.cpu().numpy()
    clss = results_raw.boxes.cls.cpu().numpy().astype(int)
    confs = results_raw.boxes.conf.cpu().numpy()

    if results_raw.boxes.id is not None:
        track_ids = results_raw.boxes.id.cpu().numpy().astype(int)
    else:
        track_ids = np.array([idx + 1 for idx in range(len(boxes))])

    valid_mask = ~np.isnan(boxes).any(axis=1)
    boxes = boxes[valid_mask]
    clss = clss[valid_mask]
    confs = confs[valid_mask]
    track_ids = track_ids[valid_mask]

    cam_cfg = CAM_CROWD_SETTINGS.get(cam_id)
    if not cam_cfg and str(cam_id).startswith("cam"):
        cam_cfg = CAM_CROWD_SETTINGS.get(str(cam_id)[3:])
    if not cam_cfg and not str(cam_id).startswith("cam"):
        cam_cfg = CAM_CROWD_SETTINGS.get(f"cam{cam_id}")
    if not cam_cfg:
        cam_cfg = {
            "threshold": CROWD_THRESHOLD,
            "duration": CROWD_MIN_DURATION,
            "location": "Hành lang",
            "roi": [(0, 0, frame.shape[1], frame.shape[0])],
        }

    h_f, w_f = frame.shape[:2]

    if cam_id not in crowd_state:
        crowd_state[cam_id] = {
            "roi_timers": defaultdict(float),
            "roi_grace_timers": defaultdict(float),
            "last_time": now,
            "prev_gray": None,
            "shove_timer": 0.0,
            "track_history": defaultdict(lambda: deque(maxlen=20)),
            "track_last_seen": {},
            "smoothed_boxes": {}
        }

    c_state = crowd_state[cam_id]
    dt = max(0.001, now - c_state["last_time"])
    c_state["last_time"] = now

    active_location = cam_cfg.get("location", "Hành lang")
    effective_person_thresh = int(cam_cfg.get("threshold", CROWD_THRESHOLD))
    effective_duration_thresh = float(cam_cfg.get("duration", CROWD_MIN_DURATION))

    # Lưới 3x3
    cell_w, cell_h = max(1, w_f // GRID_COLS), max(1, h_f // GRID_ROWS)
    grid_counts = np.zeros((GRID_ROWS, GRID_COLS), dtype=int)

    # Scale tọa độ ROI Polygon theo độ phân giải ảnh
    active_polygon = None
    if active_location in ROI_DEFINITIONS:
        active_polygon = (ROI_DEFINITIONS[active_location]["points"] * np.array([w_f, h_f])).astype(np.int32)

    active_people_count = 0
    active_velocities = []

    # 1. Phân tích từng người & Lọc tranh ảnh tĩnh (is_static_poster như crowd_detection_test.py)
    for i, tid in enumerate(track_ids):
        raw_box = list(map(int, boxes[i]))
        if tid != -1:
            if tid in c_state["smoothed_boxes"]:
                sb = c_state["smoothed_boxes"][tid]
                dx = (raw_box[0] + raw_box[2]) / 2.0 - (sb[0] + sb[2]) / 2.0
                dy = (raw_box[1] + raw_box[3]) / 2.0 - (sb[1] + sb[3]) / 2.0
                disp = math.hypot(dx, dy)
                if disp > 6.0:
                    alpha = 1.0
                elif disp > 2.0:
                    alpha = 0.95
                else:
                    alpha = 0.82
                box = [int(sb[k] * (1 - alpha) + raw_box[k] * alpha) for k in range(4)]
                c_state["smoothed_boxes"][tid] = box
            else:
                c_state["smoothed_boxes"][tid] = raw_box
                box = raw_box
        else:
            box = raw_box

        cx, cy = int((box[0] + box[2]) / 2), int((box[1] + box[3]) / 2)
        velocity = 0.0
        is_static_poster = False

        if tid != -1:
            c_state["track_history"][tid].append((cx, cy))
            c_state["track_last_seen"][tid] = now
            history_len = len(c_state["track_history"][tid])
            if history_len >= 2:
                idx_prev = max(0, history_len - 6)
                pt_old = c_state["track_history"][tid][idx_prev]
                pt_current = c_state["track_history"][tid][-1]
                dist = math.hypot(pt_current[0] - pt_old[0], pt_current[1] - pt_old[1])
                velocity = dist / max(1, (history_len - 1 - idx_prev))
            if history_len >= 12:
                pts = list(c_state["track_history"][tid])
                xs = [p[0] for p in pts]
                ys = [p[1] for p in pts]
                max_disp = math.hypot(max(xs) - min(xs), max(ys) - min(ys))
                if max_disp < 8.0 and velocity < 0.25:
                    is_static_poster = True

        # Tranh/ảnh tĩnh trên tường không tính vào mật độ đám đông
        if is_static_poster:
            poster_box = shrink_box(box, 0.08, 0.05)
            draw_hud_box(frame, poster_box, (120, 120, 120), f"ID:{tid} [Static Poster]")
            processed_objects.append({
                "track_id": tid,
                "name": f"Người #{tid}",
                "bbox": poster_box,
                "status": "Poster tĩnh",
                "has_alert": False,
                "color": (120, 120, 120)
            })
            continue

        # Cập nhật ô lưới 3x3
        col = min(GRID_COLS - 1, max(0, cx // cell_w))
        row = min(GRID_ROWS - 1, max(0, cy // cell_h))
        grid_counts[row, col] += 1

        # Kiểm tra thuộc vùng quan tâm Active Location
        in_active_area = False
        if active_polygon is not None:
            if cv2.pointPolygonTest(active_polygon, (cx, cy), False) >= 0:
                in_active_area = True
        else:
            in_active_area = True

        if in_active_area:
            active_people_count += 1
            active_velocities.append(velocity)

    # Dọn dẹp bộ nhớ các ID đã rời khỏi camera > 10 giây
    inactive_ids = [t for t, lseen in list(c_state["track_last_seen"].items()) if (now - lseen) > 10.0]
    for t in inactive_ids:
        c_state["track_history"].pop(t, None)
        c_state["track_last_seen"].pop(t, None)

    # 2. Cập nhật Timer cảnh báo đám đông (chỉ kiểm tra mật độ trên TỪNG Ô LƯỚI - chia nhỏ vùng nhận diện)
    is_crowd_alert_active = False
    max_cell_density = int(np.max(grid_counts)) if grid_counts.size > 0 else 0

    # Bộ lọc ngữ cảnh: Xác định thời gian & vị trí hiện tại
    time_context = get_current_time_context()
    ctx_thresh, ctx_dur, ctx_level = CONTEXT_RULES.get(active_location, {}).get(time_context, (CROWD_THRESHOLD, CROWD_MIN_DURATION, "Medium"))

    # Phát hiện tụ tập đông người: Khi có ÍT NHẤT 1 Ô trong lưới 9 ô đạt ngưỡng số người
    if max_cell_density >= effective_person_thresh:
        c_state["roi_grace_timers"][active_location] = 0.0
        c_state["roi_timers"][active_location] += dt
        if c_state["roi_timers"][active_location] >= effective_duration_thresh:
            # Nếu Bộ lọc ngữ cảnh không cấm cảnh báo (hoặc người dùng đã chỉnh cấu hình riêng)
            if ctx_level != "None" or effective_person_thresh < 100:
                is_crowd_alert_active = True
    else:
        c_state["roi_grace_timers"][active_location] += dt
        if c_state["roi_grace_timers"][active_location] >= 2.0:
            c_state["roi_timers"][active_location] = max(0.0, c_state["roi_timers"][active_location] - dt * 2)

    # 3. Phân tích xô đẩy đã gỡ bỏ theo yêu cầu: camera này CHỈ nhận diện và cảnh báo đám đông
    is_shoving_active = False

    # 4. Xác định trạng thái cảnh báo & render HUD
    total_people = active_people_count
    has_alert = False
    max_label = f"TỤ TẬP ĐÔNG NGƯỜI BẤT THƯỜNG ({max_cell_density}/{effective_person_thresh} NGƯỜI/Ô)"

    if is_crowd_alert_active:
        has_alert = True  # CHỈ BÁO ĐỘNG ĐỎ VÀ LƯU LỊCH SỬ KHI ĐÃ ĐỦ THỜI GIAN (>= 10s)
        color_theme = (0, 0, 255) # Màu Đỏ - đủ người & đủ thời gian
    elif max_cell_density >= effective_person_thresh:
        color_theme = (0, 165, 255) # Màu Cam - vượt ngưỡng số người nhưng CHƯA đủ thời gian (đang đếm giây)
    else:
        color_theme = (0, 255, 0) # Màu Xanh - bình thường

    # 5. Vẽ trực quan Khung Lưới 3x3 (Grid Overlay) và mật độ ô
    grid_overlay = np.zeros_like(frame)
    for r in range(1, GRID_ROWS):
        cv2.line(grid_overlay, (0, r * cell_h), (w_f, r * cell_h), (80, 80, 80), 1)
    for c in range(1, GRID_COLS):
        cv2.line(grid_overlay, (c * cell_w, 0), (c * cell_w, h_f), (80, 80, 80), 1)

    for r in range(GRID_ROWS):
        for c in range(GRID_COLS):
            count = grid_counts[r, c]
            if count > 0:
                cell_col = (0, 0, 255) if (count >= effective_person_thresh and is_crowd_alert_active) else ((0, 165, 255) if count >= effective_person_thresh else (0, 255, 0))
                cv2.rectangle(grid_overlay, (c * cell_w, r * cell_h), ((c + 1) * cell_w, (r + 1) * cell_h), cell_col, -1)
                cv2.putText(frame, f"O[{r},{c}]: {count}", (c * cell_w + 6, r * cell_h + 22), cv2.FONT_HERSHEY_SIMPLEX, 0.45, cell_col, 1, cv2.LINE_AA)
    cv2.addWeighted(grid_overlay, 0.28, frame, 0.72, 0, frame)

    # 6. Vẽ Khung Vùng Quan Sát (ROI Polygon Overlay)
    if active_polygon is not None:
        cv2.polylines(frame, [active_polygon], True, (0, 255, 255), 2, cv2.LINE_AA)
        pt_x, pt_y = int(active_polygon[0][0]), max(20, int(active_polygon[0][1]) - 8)
        cv2.putText(frame, f"MONITORING: {active_location} ({active_people_count} NGƯỜI)", (pt_x, pt_y), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 2, cv2.LINE_AA)

    # 7. Vẽ Thanh Trạng Thái Đám Đông ở đỉnh Video (Top Status Banner HUD)
    banner_bg = (0, 0, 220) if is_crowd_alert_active else ((0, 140, 255) if max_cell_density >= effective_person_thresh else (25, 90, 25))
    cv2.rectangle(frame, (0, 0), (w_f, 32), banner_bg, -1)
    status_text = (
        f"🚨 BÁO ĐỘNG ĐỎ: TỤ TẬP ĐÔNG NGƯỜI ({max_cell_density}/{effective_person_thresh} NGƯỜI/Ô) - ĐÃ LƯU LỊCH SỬ" if is_crowd_alert_active else (
        f"⏳ CẢNH BÁO MÀU CAM: PHÁT HIỆN {max_cell_density}/{effective_person_thresh} NGƯỜI/Ô (ĐANG ĐẾM THỜI GIAN {int(c_state['roi_timers'][active_location])}/{effective_duration_thresh}s)" if max_cell_density >= effective_person_thresh else
        f"✅ AN TOÀN | {active_location} ({time_context}) | MẬT ĐỘ MAX: {max_cell_density}/{effective_person_thresh} NGƯỜI/Ô"
        )
    )
    cv2.putText(frame, status_text, (12, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 2, cv2.LINE_AA)

    # 8. Vẽ HUD cho các ID không phải poster tĩnh
    for i, tid in enumerate(track_ids):
        raw_box = list(map(int, boxes[i]))
        # Đã vẽ poster tĩnh ở bước trên
        if any(obj["track_id"] == tid and obj["status"] == "Poster tĩnh" for obj in processed_objects):
            continue

        # Sử dụng tọa độ đã được làm mượt EMA để bám sát thân người, không bị nhảy rung
        box = c_state["smoothed_boxes"].get(tid, raw_box)

        # Vẽ đường trail theo dõi di chuyển
        if tid in c_state["track_history"] and len(c_state["track_history"][tid]) > 1:
            pts_history = list(c_state["track_history"][tid])
            for pt_idx in range(1, len(pts_history)):
                cv2.line(frame, pts_history[pt_idx - 1], pts_history[pt_idx], color_theme, 1)

        draw_hud_box(frame, box, color_theme, f"NGƯỜI #{int(tid)}")
        processed_objects.append({
            "track_id": int(tid),
            "name": f"Người #{int(tid)}",
            "bbox": box,
            "status": "TỤ TẬP ĐÔNG NGƯỜI BẤT THƯỜNG" if is_crowd_alert_active else ("Đang theo dõi (Chưa đủ thời gian)" if max_cell_density >= effective_person_thresh else "Bình thường"),
            "has_alert": has_alert,
            "is_alert": has_alert,
            "color": color_theme
        })

    # 9. Chuẩn bị dữ liệu lưới 3x3 (grid_data) cho Web vẽ trên luồng camera trực tiếp (canvasAI)
    grid_data = []
    for r in range(GRID_ROWS):
        for c in range(GRID_COLS):
            count = int(grid_counts[r, c])
            if count >= effective_person_thresh:
                state = "alert" if is_crowd_alert_active else "warning"
            else:
                state = "normal"
            grid_data.append({
                "bbox": [int(c * cell_w), int(r * cell_h), int((c + 1) * cell_w), int((r + 1) * cell_h)],
                "count": count,
                "threshold": effective_person_thresh,
                "state": state
            })

    return processed_objects, has_alert, max_label, alert_tids, grid_data
