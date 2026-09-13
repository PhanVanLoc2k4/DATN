import sys
import os
import cv2
import numpy as np
import time
import math
from datetime import datetime, timedelta
from collections import defaultdict, deque
import insightface
from sklearn.metrics.pairwise import cosine_similarity
from ultralytics import YOLO

# Shared Paths
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from db_helper import get_db_connection
from event_engine import event_engine

MODEL_PATH = os.path.abspath(os.path.join(BASE_DIR, '../../model/behavior_model.pt'))
DB_PATH = os.path.abspath(os.path.join(BASE_DIR, '../../model/face_database/face_database.npz'))
WEAPON_MODEL_PATH = os.path.abspath(os.path.join(BASE_DIR, '../../model/best.pt'))
if not os.path.exists(WEAPON_MODEL_PATH):
    raise FileNotFoundError(f"Không tìm thấy model vũ khí: {WEAPON_MODEL_PATH}")
PERSON_MODEL_PATH = os.path.abspath(os.path.join(BASE_DIR, '../../yolov8n.pt'))
TRACKER_PATH = os.path.join(BASE_DIR, "stable_tracker.yaml")

# Common Configs & Thresholds
SIMILARITY_THRESHOLD = 0.40
LOCK_THRESHOLD = 0.48
VOTE_THRESHOLD = 2
MAX_RETRY_IDENTIFY = 50
MIN_FACE_SIZE = 25
FACE_CHECK_COOLDOWN = 0.3

CLASS_NAMES_VN = {
    0: "Dao",
    1: "Gậy",
    2: "Súng"
}

CLASS_COLORS = {
    0: (0, 165, 255),
    1: (0, 255, 255),
    2: (0, 0, 255)
}

# Shared InsightFace App
print("--- Đang khởi tạo InsightFace App... ---")
face_app = insightface.app.FaceAnalysis(name="buffalo_l", providers=['CPUExecutionProvider'])
face_app.prepare(ctx_id=-1)

# Shared Memory Caches
db_embeddings = np.array([])
db_names = np.array([])
id_smooth_names = {}
camera_models = {}
camera_configs = {}
CAM_CROWD_SETTINGS = {}
crowd_state = {}
shared_models = {}

def get_shared_yolo_model(model_path, api_type, cam_id=None):
    key = f"{cam_id}_{model_path}" if cam_id else model_path
    if key not in shared_models:
        print(f"📦 Đang nạp Model AI cho {key} ({os.path.basename(model_path)})...")
        m = YOLO(model_path)
        m._loaded_api_type = api_type
        shared_models[key] = m
    return shared_models[key]

def reload_face_database():
    """Tải và đồng bộ dữ liệu vector khuôn mặt từ SQL Server hoặc NPZ fallback."""
    global db_embeddings, db_names
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT i.full_name, fe.embedding_vector
            FROM face_embeddings fe
            JOIN identities i ON fe.identity_id = i.identity_id
        """)
        rows = cursor.fetchall()
        
        if not rows:
            if os.path.exists(DB_PATH):
                data = np.load(DB_PATH)
                embeddings = data["embeddings"]
                names = data["names"]
                print(f"🔄 Đang migrate {len(names)} vector từ NPZ sang SQL Server...")
                
                for name in set(names):
                    import random
                    mssv = f"SV_{datetime.now().strftime('%y%m')}_{random.randint(1000, 9999)}"
                    cursor.execute("""
                        IF NOT EXISTS (SELECT 1 FROM identities WHERE full_name = ?)
                        BEGIN
                            INSERT INTO identities (identifier_code, full_name, person_type, department)
                            VALUES (?, ?, N'Sinh viên', N'Khóa cũ')
                        END
                    """, (name, mssv, name))
                conn.commit()
                
                cursor.execute("SELECT identity_id, full_name FROM identities")
                id_rows = cursor.fetchall()
                name_to_id = {row[1]: row[0] for row in id_rows}
                
                for name, emb in zip(names, embeddings):
                    identity_id = name_to_id.get(name)
                    if identity_id:
                        emb_vector_str = ",".join(map(str, emb.tolist()))
                        cursor.execute("""
                            INSERT INTO face_embeddings (identity_id, embedding_vector, image_url)
                            VALUES (?, ?, NULL)
                        """, (identity_id, emb_vector_str))
                conn.commit()
                
                cursor.execute("""
                    SELECT i.full_name, fe.embedding_vector
                    FROM face_embeddings fe
                    JOIN identities i ON fe.identity_id = i.identity_id
                """)
                rows = cursor.fetchall()
        
        conn.close()
        
        if rows:
            embeddings_list = [np.fromstring(row[1], dtype=np.float32, sep=',') for row in rows]
            names_list = [row[0] for row in rows]
            db_embeddings = np.array(embeddings_list)
            db_names = np.array(names_list)
            if len(db_embeddings) > 0:
                norms = np.linalg.norm(db_embeddings, axis=1, keepdims=True)
                norms[norms == 0] = 1.0
                db_embeddings = db_embeddings / norms
            os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
            np.savez(DB_PATH, embeddings=db_embeddings, names=db_names)
            print(f"📊 Database Reloaded from SQL Server: {len(db_names)} vectors.")
            return True
        else:
            db_embeddings = np.array([])
            db_names = np.array([])
            print("📊 Database Reloaded: 0 vectors (database table is empty).")
            return True
    except Exception as e:
        print(f"❌ Error reloading DB from SQL Server: {e}")
        if os.path.exists(DB_PATH):
            try:
                data = np.load(DB_PATH)
                db_embeddings = data["embeddings"]
                db_names = data["names"]
                print(f"📊 Database Reloaded from local NPZ (fallback): {len(db_names)} vectors.")
                return True
            except Exception as ex:
                print(f"❌ Error loading fallback NPZ: {ex}")
        db_embeddings, db_names = np.array([]), np.array([])
        return False

# Nạp database ngay khi load common module
reload_face_database()

def optimize_face_image(crop):
    """
    Tiền xử lý ảnh khuôn mặt cực nặng (Aggressive Restoration).
    Trực tiếp đồng bộ 100% từ benchmark tracking_fight_face.py.
    """
    if crop is None or crop.size == 0: 
        return crop
    try:
        gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
        avg = np.mean(gray)
        
        gamma = 1.0
        if avg > 210: gamma = 2.5   # Cực lóa
        elif avg > 185: gamma = 1.8 # Lóa mạnh
        elif avg > 165: gamma = 1.4 # Lóa vừa
        elif avg < 60: gamma = 0.6  # Quá tối
        
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
    except Exception as e:
        print(f"Error in optimize_face_image: {e}")
        return crop

def calculate_iou(box1, box2):
    """Tính Intersection over Union (IoU) giữa 2 box [x1, y1, x2, y2]."""
    xA = max(box1[0], box2[0])
    yA = max(box1[1], box2[1])
    xB = min(box1[2], box2[2])
    yB = min(box1[3], box2[3])
    interArea = max(0, xB - xA) * max(0, yB - yA)
    box1Area = (box1[2] - box1[0]) * (box1[3] - box1[1])
    box2Area = (box2[2] - box2[0]) * (box2[3] - box2[1])
    if float(box1Area + box2Area - interArea) <= 0: return 0.0
    return interArea / float(box1Area + box2Area - interArea)

def get_center(box):
    """Lấy tọa độ tâm của bounding box [x1, y1, x2, y2]."""
    return ((box[0] + box[2]) // 2, (box[1] + box[3]) // 2)

def get_motion_instant(track_history):
    """Tính vận tốc tức thời frame-to-frame giống hệt tracking_fight_face.py."""
    if len(track_history) < 2: return 0.0
    return math.hypot(track_history[-1][0] - track_history[-2][0],
                      track_history[-1][1] - track_history[-2][1])

def draw_hud_box(img, box, color, label=None):
    """Vẽ bounding box phong cách HUD hiện đại."""
    x1, y1, x2, y2 = map(int, box)
    w, h = x2 - x1, y2 - y1
    cv2.rectangle(img, (x1, y1), (x2, y2), color, 1)
    length = min(15, max(5, w // 4), max(5, h // 4))
    cv2.line(img, (x1, y1), (x1 + length, y1), color, 3)
    cv2.line(img, (x1, y1), (x1, y1 + length), color, 3)
    cv2.line(img, (x2, y1), (x2 - length, y1), color, 3)
    cv2.line(img, (x2, y1), (x2, y1 + length), color, 3)
    cv2.line(img, (x1, y2), (x1 + length, y2), color, 3)
    cv2.line(img, (x1, y2), (x1, y2 - length), color, 3)
    cv2.line(img, (x2, y2), (x2 - length, y2), color, 3)
    cv2.line(img, (x2, y2), (x2, y2 - length), color, 3)
    
    if label:
        (text_w, text_h), baseline = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.4, 1)
        cv2.rectangle(img, (x1, y1 - text_h - 6), (x1 + text_w + 6, y1), color, -1)
        cv2.putText(img, label, (x1 + 3, y1 - 3), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 255, 255), 1, cv2.LINE_AA)
