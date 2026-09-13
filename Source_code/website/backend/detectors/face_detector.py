import os
import time
import cv2
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity
from detectors.common import (
    get_shared_yolo_model, PERSON_MODEL_PATH, TRACKER_PATH,
    face_app, optimize_face_image, calculate_iou, draw_hud_box,
    db_embeddings, db_names, id_smooth_names, SIMILARITY_THRESHOLD,
    LOCK_THRESHOLD
)
from event_engine import event_engine

def process_face_frame(frame, cam_id, now):
    """
    Xử lý nhận diện khuôn mặt chuyên biệt cho các camera điểm danh / lối vào (Face API).
    1. Quét người bằng YOLOv8
    2. Cắt ảnh đa chiến lược + 5-step restoration
    3. Nhận diện danh tính và khóa nhận diện
    """
    model = get_shared_yolo_model(PERSON_MODEL_PATH, 'face', cam_id)
    results = model.track(
        frame,
        persist=True,
        conf=0.25,
        iou=0.85,
        classes=[0],
        agnostic_nms=True,
        tracker=TRACKER_PATH,
        verbose=False
    )

    processed_objects = []
    has_alert = False
    max_label = "Bình thường"
    alert_tids = []

    if cam_id not in id_smooth_names:
        id_smooth_names[cam_id] = {}
    cam_cache = id_smooth_names[cam_id]

    results_raw = results[0] if results else None
    if results_raw is None or results_raw.boxes is None:
        return processed_objects, has_alert, "Không xác định", alert_tids, []

    boxes = results_raw.boxes.xyxy.cpu().numpy()
    clss = results_raw.boxes.cls.cpu().numpy().astype(int)
    confs = results_raw.boxes.conf.cpu().numpy()

    if results_raw.boxes.id is not None:
        track_ids = results_raw.boxes.id.cpu().numpy().astype(int)
    else:
        track_ids = np.array([-1] * len(boxes))

    valid_mask = ~np.isnan(boxes).any(axis=1)
    boxes = boxes[valid_mask]
    clss = clss[valid_mask]
    confs = confs[valid_mask]
    track_ids = track_ids[valid_mask]

    for i, tid in enumerate(track_ids):
        if tid is None or tid == -1: continue
        box = boxes[i]
        if tid not in cam_cache:
            cam_cache[tid] = {
                "name": "unknown",
                "locked": False,
                "retry": 0,
                "unmatched_faces": 0,
                "smoothed_box": None,
                "missed_frames": 0,
                "last_time": now
            }
        
        info = cam_cache[tid]
        info["last_time"] = now
        info["missed_frames"] = 0

        # Cập nhật box trực tiếp không dùng EMA để bám sát người
        info["smoothed_box"] = list(map(int, box))

    current_tids_set = set(t for t in track_ids if t is not None and t != -1)
    for tid, info in list(cam_cache.items()):
        if tid not in current_tids_set:
            info["missed_frames"] += 1
            if info["missed_frames"] > 15:
                cam_cache.pop(tid, None)

    for i, tid in enumerate(track_ids):
        if tid is None or tid == -1: continue
        x1, y1, x2, y2 = map(int, boxes[i])
        info = cam_cache.get(tid)
        if not info: continue

        # Quét nhận diện khuôn mặt liên tục cho đến khi khóa thành công (Bỏ delay 0.3s)
        if not info["locked"]:
            info["retry"] += 1
            
            h, w, _ = frame.shape
            p_w = x2 - x1
            p_h = y2 - y1

            if p_w > 15 or p_h > 25:
                pad_w = int(p_w * 0.20)
                pad_h = int(p_h * 0.10)
                crop = frame[max(0, y1 - pad_h):min(h, y1 + int(p_h * 0.75)), max(0, x1 - pad_w):min(w, x2 + pad_w)]
                faces = []
                if crop.size > 0:
                    try:
                        faces = face_app.get(crop)
                        if not faces:
                            faces = face_app.get(optimize_face_image(crop))
                        if not faces:
                            full_crop = frame[max(0, y1):min(h, y2), max(0, x1):min(w, x2)]
                            if full_crop.size > 0:
                                faces = face_app.get(full_crop)

                        if faces and len(db_embeddings) > 0:
                            face = max(faces, key=lambda fx: (fx.bbox[2]-fx.bbox[0])*(fx.bbox[3]-fx.bbox[1]))
                            emb = face.embedding / np.linalg.norm(face.embedding)
                            sims = cosine_similarity(emb.reshape(1, -1), db_embeddings)[0]
                            top_idx = np.argmax(sims)
                            score = sims[top_idx]

                            if score >= SIMILARITY_THRESHOLD:
                                info["name"] = db_names[top_idx]
                                info["locked"] = True
                                print(f"[{cam_id}] ✅ Nhận diện thành công: {info['name']} (Score: {score:.2f})")
                            else:
                                info["unmatched_faces"] = info.get("unmatched_faces", 0) + 1
                                print(f"[{cam_id}] ❌ Điểm khớp thấp: {db_names[top_idx]} ({score:.2f} < {SIMILARITY_THRESHOLD})")
                        elif faces:
                            info["unmatched_faces"] = info.get("unmatched_faces", 0) + 1
                    except Exception as e:
                        print(f"[{cam_id}] AI Error: {e}")

        final_name = info["name"]
        if not info["locked"]:
            is_analyzing = info["retry"] < 12 or info.get("unmatched_faces", 0) < 3
        else:
            is_analyzing = False

        if final_name != "unknown":
            name_tag = final_name.upper()
            color = (0, 255, 0) # Xanh lá cho người quen
        else:
            if is_analyzing:
                name_tag = "ĐANG PHÂN TÍCH..."
                color = (0, 255, 255) # Vàng khi đang quét
            else:
                name_tag = "NGƯỜI LẠ"
                color = (0, 165, 255) # Cam cho người lạ

        is_unknown_alert = final_name == "unknown" and not is_analyzing
        if is_unknown_alert:
            has_alert = True
            max_label = "Đối tượng người lạ"
            alert_tids.append(int(tid))
            color = (0, 0, 255)

        render_box = info["smoothed_box"] if info["smoothed_box"] else [x1, y1, x2, y2]
        draw_hud_box(frame, render_box, color, name_tag)

        processed_objects.append({
            "track_id": tid,
            "name": final_name if final_name != "unknown" else ("Đối tượng người lạ" if is_unknown_alert else name_tag),
            "bbox": render_box,
            "status": name_tag,
            "has_alert": is_unknown_alert,
            "is_alert": is_unknown_alert,
            "color": color
        })

    return processed_objects, has_alert, max_label, alert_tids, []
