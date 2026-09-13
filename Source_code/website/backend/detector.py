import sys
import os
import time
import cv2
import numpy as np

# Thêm đường dẫn backend vào sys.path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from db_helper import get_db_connection, init_db
from event_engine import event_engine

# Re-export tất cả các phần tử chung từ detectors.common để tương thích tuyệt đối với app.py, db_helper.py, event_engine.py
from detectors.common import (
    face_app, optimize_face_image, reload_face_database,
    camera_models, camera_configs, CAM_CROWD_SETTINGS, crowd_state,
    id_smooth_names, DB_PATH, SIMILARITY_THRESHOLD, LOCK_THRESHOLD,
    VOTE_THRESHOLD, MAX_RETRY_IDENTIFY, MIN_FACE_SIZE, FACE_CHECK_COOLDOWN,
    CLASS_NAMES_VN, CLASS_COLORS, MODEL_PATH, WEAPON_MODEL_PATH, PERSON_MODEL_PATH,
    calculate_iou, get_center, get_motion_instant, draw_hud_box
)

# Import các bộ xử lý chuyên biệt độc lập (Modular Detectors)
from detectors.behavior_detector import process_behavior_frame
from detectors.face_detector import process_face_frame
from detectors.weapon_detector import process_weapon_frame
from detectors.crowd_detector import process_crowd_frame

def load_camera_models():
    """Tải và phân loại cấu hình API của từng camera từ SQL Server."""
    global camera_models, CAM_CROWD_SETTINGS, camera_configs
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT c.camera_id, c.camera_name, c.rtsp_url, z.zone_name, c.crowd_threshold, c.crowd_duration 
            FROM cameras c
            LEFT JOIN camera_zones z ON c.zone_id = z.zone_id
            WHERE c.status != N'Đã xóa' OR c.status IS NULL
        """)
        rows = cursor.fetchall()
        conn.close()
        
        for row in rows:
            db_id = row[0]
            cam_id = f"cam{db_id}"
            cam_name = (row[1] or '').upper()
            zone_name = row[3] or "Hành lang"
            c_thresh = int(row[4]) if (len(row) > 4 and row[4] is not None) else 8
            c_dur = int(row[5]) if (len(row) > 5 and row[5] is not None) else 30

            if any(x in cam_name for x in ['VŨ KHÍ', 'WEAPON']):
                api_type = 'weapon'
            elif any(x in cam_name for x in ['ĐÁM ĐÔNG', 'CROWD', 'SÂN TRƯỜNG', 'BÃI XE', 'CỔNG TRƯỜNG', 'SÂN', 'PARKING']):
                api_type = 'crowd'
            elif any(x in cam_name for x in ['HÀNH LANG', 'BEHAVIOR', 'HÀNH VI', 'ĐÁNH NHAU', 'FIGHT']):
                api_type = 'behavior'
            else:
                api_type = 'face'
                
            camera_configs[cam_id] = api_type
            camera_configs[str(db_id)] = api_type

            crowd_setting = {
                "threshold": c_thresh,
                "duration": c_dur,
                "location": zone_name,
                "roi": [(0, 0, 9999, 9999)]
            }
            CAM_CROWD_SETTINGS[cam_id] = crowd_setting
            CAM_CROWD_SETTINGS[str(db_id)] = crowd_setting
            print(f"📷 [Camera Loader] {cam_id} ({cam_name}) -> Loại API: {api_type} | Ngưỡng: {c_thresh} người, {c_dur}s")
    except Exception as e:
        print(f"❌ Lỗi tải Cấu hình camera: {e}")

# Load cấu hình camera trên startup
load_camera_models()

def detect_logic(frame, cam_id, force_api_type=None):
    """
    Dispatcher chính: Điều hướng xử lý sang từng Detector chuyên biệt độc lập.
    Đảm bảo không bị nhầm lẫn giữa các luồng model AI (Weapon / Behavior / Face / Crowd).
    """
    now = time.time()
    
    # Xác định api_type của camera
    if force_api_type:
        api_type = force_api_type
    else:
        api_type = camera_configs.get(cam_id, 'face')
        
    # Điều hướng gọi module xử lý riêng biệt
    if api_type == 'weapon':
        return process_weapon_frame(frame, cam_id, now)
    elif api_type == 'behavior':
        return process_behavior_frame(frame, cam_id, now)
    elif api_type == 'crowd':
        return process_crowd_frame(frame, cam_id, now)
    else:
        return process_face_frame(frame, cam_id, now)

# Helper khử trùng lặp cho backend endpoints
def deduplicate_boxes(processed_objects):
    return event_engine.filter_noise_boxes(processed_objects)
