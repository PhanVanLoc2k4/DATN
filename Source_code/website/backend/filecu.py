from flask import Flask, request, jsonify, send_from_directory, session, redirect, url_for
from flask_cors import CORS

import os
import cv2
import numpy as np
import base64
import pyodbc
from datetime import datetime, timedelta
from ultralytics import YOLO
import insightface
from sklearn.metrics.pairwise import cosine_similarity
from functools import wraps
from sqlalchemy import create_engine
from sqlalchemy.pool import QueuePool
from urllib.parse import quote_plus
from dotenv import load_dotenv
from PIL import Image, ImageDraw, ImageFont
from collections import Counter
from chatbot import ASABrain
import uuid

load_dotenv() # Load variables from .env

# ================= CẤU HÌNH ĐƯỜNG DẪN =================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.abspath(os.path.join(BASE_DIR, '..', 'frontend'))

app = Flask(
    __name__,
    static_folder=os.path.join(FRONTEND_DIR, 'static'),
    static_url_path='/static'
)
# Cấu hình CORS: Cho phép Mobile App và Web đều kết nối được
CORS(app, supports_credentials=True, resources={r"/api/*": {"origins": "*"}})

app.secret_key = os.getenv('SECRET_KEY', 'default_secret_key_if_env_missing')

# ================= CẤU HÌNH DATABASE & POOLING =================
def create_db_engine():
    server = os.getenv("DB_SERVER", "localhost")
    database = os.getenv("DB_DATABASE", "WebAnNinh")
    username = os.getenv("DB_USERNAME", "sa")
    password = os.getenv("DB_PASSWORD", "123")
    
    drivers = [
        '{ODBC Driver 17 for SQL Server}',
        '{ODBC Driver 18 for SQL Server}',
        '{SQL Server}'
    ]
    
    for driver in drivers:
        try:
            # Tạo connection string định dạng SQLAlchemy mssql+pyodbc
            connection_params = f"DRIVER={driver};SERVER={server};DATABASE={database};UID={username};PWD={password};TrustServerCertificate=yes;"
            connection_url = f"mssql+pyodbc:///?odbc_connect={quote_plus(connection_params)}"
            
            engine = create_engine(
                connection_url,
                pool_size=10,        # Số lượng kết nối duy trì trong pool
                max_overflow=20,     # Số lượng kết nối vượt mức tối đa khi cần
                pool_timeout=30,      # Thời gian chờ kết nối rảnh
                pool_recycle=1800,   # Tự động làm mới kết nối sau 30 phút
            )
            # Kiểm tra kết nối thử
            with engine.connect() as conn:
                print(f"✅ Kết nối Database thành công bằng: {driver}")
                return engine
        except Exception as e:
            print(f"⚠️ Thử driver {driver} thất bại: {e}")
            continue
            
    return None

# Khởi tạo Engine duy nhất cho toàn bộ ứng dụng
db_engine = create_db_engine()

def get_db_connection():
    if db_engine is None:
        raise Exception("Không thể khởi tạo Database Engine. Vui lòng kiểm tra cấu hình .env và Driver ODBC.")
    # Trả về kết nối từ Pool (đã được bọc bởi SQLAlchemy nhưng tương thích DB-API)
    return db_engine.raw_connection()

def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({"error": "Unauthorized"}), 401
        return f(*args, **kwargs)
    return decorated_function

def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session or session.get('role') != 'admin':
            return jsonify({"error": "Admin access required"}), 403
        return f(*args, **kwargs)
    return decorated_function

# Thư mục lưu ảnh vi phạm
UPLOAD_DIR = os.path.join(FRONTEND_DIR, 'static', 'uploads', 'violations')
if not os.path.exists(UPLOAD_DIR):
    os.makedirs(UPLOAD_DIR)

# ================= LOAD MODEL AI =================
MODEL_PATH = os.path.abspath(os.path.join(BASE_DIR, '../../model/behavior_model.pt'))
DB_PATH = os.path.abspath(os.path.join(BASE_DIR, '../../model/face_database/face_database.npz'))

# Khôi phục buffalo_l để tương thích database đặc trưng 512-dim
face_app = insightface.app.FaceAnalysis(name="buffalo_l", providers=['CPUExecutionProvider'])
face_app.prepare(ctx_id=-1, det_size=(640, 640)) # Tăng det_size để bắt mặt xa tốt hơn (giống test script)

if os.path.exists(DB_PATH):
    data = np.load(DB_PATH)
    db_embeddings = data["embeddings"] # Sử dụng toàn bộ vector để tăng độ chính xác
    db_names = data["names"]
    print(f"✅ Loaded {len(db_names)} vectors from database.")
else:
    db_embeddings, db_names = [], []

def reload_face_database():
    global db_embeddings, db_names
    if os.path.exists(DB_PATH):
        try:
            data = np.load(DB_PATH)
            db_embeddings = data["embeddings"]
            db_names = data["names"]
            print(f"📊 Database Reloaded: {len(db_names)} vectors.")
        except Exception as e:
            print(f"❌ Error reloading DB: {e}")
            return False
    return False

# ================= KHỞI TẠO BỘ NÃO AI =================
try:
    # Khởi tạo ASABrain để xử lý các nghiệp vụ chatbot
    # Lưu ý: Cần có key Gemini hợp lệ trong chatbot.py hoặc biến môi trường
    brain = ASABrain()
    print("✅ ASA Brain đã sẵn sàng trong App Server.")
except Exception as e:
    print(f"⚠️ Cảnh báo: Không thể khởi tạo ASA Brain: {e}")
    brain = None

# ================= QUẢN LÝ CAMERA ĐỘNG =================
camera_models = {}
camera_configs = {} # Lưu loại API (face/behavior) của từng camera

def init_db():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # 1. Tạo hoặc đồng bộ bảng cameras
        cursor.execute("""
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='cameras' AND xtype='U')
            BEGIN
                CREATE TABLE cameras (
                    id INT IDENTITY(1,1) PRIMARY KEY,
                    camera_name NVARCHAR(100),
                    location NVARCHAR(200),
                    src NVARCHAR(500),
                    api_type NVARCHAR(50),
                    created_at DATETIME DEFAULT GETDATE()
                )
            END
            ELSE
            BEGIN
                IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('cameras') AND name = 'name')
                BEGIN
                    EXEC sp_rename 'cameras.name', 'camera_name', 'COLUMN';
                END
                IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('cameras') AND name = 'id')
                   AND EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('cameras') AND name = 'camera_id')
                BEGIN
                    ALTER TABLE cameras ADD id AS camera_id;
                END
                IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('cameras') AND name = 'location')
                BEGIN
                    ALTER TABLE cameras ADD location NVARCHAR(200);
                END
                IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('cameras') AND name = 'src')
                BEGIN
                    ALTER TABLE cameras ADD src NVARCHAR(500);
                END
                IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('cameras') AND name = 'api_type')
                BEGIN
                    ALTER TABLE cameras ADD api_type NVARCHAR(50) DEFAULT 'face';
                END
            END
        """)
        
        # 2. Tạo hoặc Cập nhật bảng violation_history & identities_metadata
        cursor.execute("""
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='violation_history' AND xtype='U')
            BEGIN
                CREATE TABLE violation_history (
                    id INT IDENTITY(1,1) PRIMARY KEY,
                    camera_id INT,
                    camera_name NVARCHAR(100),
                    violation_type NVARCHAR(100),
                    detected_identities NVARCHAR(MAX),
                    image_url NVARCHAR(500),
                    status NVARCHAR(50),
                    user_id INT,
                    start_time DATETIME DEFAULT GETDATE(),
                    end_time DATETIME
                )
            END

            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='identities_metadata' AND xtype='U')
            BEGIN
                CREATE TABLE identities_metadata (
                    id INT IDENTITY(1,1) PRIMARY KEY,
                    full_name NVARCHAR(100) UNIQUE,
                    student_id NVARCHAR(50),
                    class_name NVARCHAR(50),
                    updated_at DATETIME DEFAULT GETDATE()
                )
            END
        """)

        # 3. Tạo hoặc đồng bộ bảng users
        cursor.execute("""
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='users' AND xtype='U')
            BEGIN
                CREATE TABLE users (
                    id INT IDENTITY(1,1) PRIMARY KEY,
                    username NVARCHAR(50) UNIQUE,
                    password NVARCHAR(100),
                    role NVARCHAR(50) DEFAULT 'user',
                    full_name NVARCHAR(100),
                    created_at DATETIME DEFAULT GETDATE()
                )
            END
            ELSE
            BEGIN
                IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('users') AND name = 'id')
                   AND EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('users') AND name = 'user_id')
                BEGIN
                    ALTER TABLE users ADD id AS user_id;
                END
                IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('users') AND name = 'password')
                BEGIN
                    ALTER TABLE users ADD password NVARCHAR(100);
                END
                IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('users') AND name = 'role')
                BEGIN
                    ALTER TABLE users ADD role NVARCHAR(50) DEFAULT 'user';
                END
            END
            
            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('users') AND name = 'full_name')
            BEGIN
                ALTER TABLE users ADD full_name NVARCHAR(100);
            END
            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('users') AND name = 'phone')
            BEGIN
                ALTER TABLE users ADD phone NVARCHAR(20);
            END
            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('users') AND name = 'email')
            BEGIN
                ALTER TABLE users ADD email NVARCHAR(100);
            END
            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('users') AND name = 'dob')
            BEGIN
                ALTER TABLE users ADD dob NVARCHAR(20);
            END
            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('users') AND name = 'avatar_url')
            BEGIN
                ALTER TABLE users ADD avatar_url NVARCHAR(500);
            END
        """)
        
        # Đồng bộ mật khẩu và vai trò cho các tài khoản cũ/mới nếu bị rỗng
        cursor.execute("""
            UPDATE users SET password = ISNULL(password, password_hash) WHERE password IS NULL AND password_hash IS NOT NULL;
            UPDATE users SET password = '123' WHERE password IS NULL;
            UPDATE users SET role = 'admin' WHERE username = 'admin' AND (role IS NULL OR role = '');
            UPDATE users SET role = 'user' WHERE (role IS NULL OR role = '');
        """)
        
        # Đảm bảo có ít nhất 1 admin
        cursor.execute("SELECT COUNT(*) FROM users")
        if cursor.fetchone()[0] == 0:
            cursor.execute("INSERT INTO users (username, password, role, full_name) VALUES (?, ?, ?, ?)", 
                         ('admin', '123', 'admin', 'Administrator'))
        
        # 4. Chèn dữ liệu mẫu Camera nếu bảng rỗng
        cursor.execute("SELECT COUNT(*) FROM cameras")
        count = cursor.fetchone()[0]
        if count == 0:
            cursor.execute("""
                INSERT INTO cameras (camera_name, location, src, api_type)
                VALUES 
                (N'CAM 01 - CỔNG CHÍNH', N'Lối vào chính', '/static/videos/hautruong2.mp4', 'face'),
                (N'CAM 02 - SÂN TRƯỜNG', N'Sân thể thao', '/static/videos/hautruong1.mp4', 'behavior')
            """)
        
        conn.commit()
        conn.close()
        print("✅ Khởi tạo CSDL thành công.")
    except Exception as e:
        print(f"❌ Lỗi khởi tạo CSDL: {e}")

def load_camera_models():
    global camera_models
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT id, api_type FROM cameras")
        rows = cursor.fetchall()
        conn.close()
        
        for row in rows:
            cam_id = f"cam{row[0]}"
            camera_configs[cam_id] = row[1] # Lưu loại API (face hoặc behavior)
            if cam_id not in camera_models:
                print(f"📦 Đang khởi tạo Model cho {cam_id} (Loại: {row[1]})...")
                camera_models[cam_id] = YOLO(MODEL_PATH)
    except Exception as e:
        print(f"❌ Lỗi tải Model camera: {e}")

# Chạy khởi tạo
init_db()
load_camera_models()

# ================= CẤU HÌNH AI CHI TIẾT =================
SIMILARITY_THRESHOLD = 0.42   # Ngưỡng tối thiểu (nhạy hơn)
LOCK_THRESHOLD = 0.50         # Ngưỡng khóa danh tính
VOTE_THRESHOLD = 2
MAX_RETRY_IDENTIFY = 50           # Tăng số lần thử để nhận diện trong lúc xô xát
MIN_FACE_SIZE = 35           # Cho phép nhận diện mặt nhỏ hơn
FACE_CHECK_COOLDOWN = 0.7    # Quét nhanh hơn (0.7s)

import time
import math

# { "cam1": {tid: info}, "cam2": {tid: info} }
id_smooth_names = {}

# Bộ nhớ đệm để tối ưu hóa việc lưu Database (Cooldown)
last_recorded_time = {}
RECORD_COOLDOWN = 60  # Giây (Hạn chế lưu 1 người nhiều lần trong thời gian ngắn)

def compute_iou(box1, box2):
    """Tính Intersection over Union (IoU) giữa 2 box [x1, y1, x2, y2]"""
    xA = max(box1[0], box2[0])
    yA = max(box1[1], box2[1])
    xB = min(box1[2], box2[2])
    yB = min(box1[3], box2[3])
    interArea = max(0, xB - xA) * max(0, yB - yA)
    box1Area = (box1[2] - box1[0]) * (box1[3] - box1[1])
    box2Area = (box2[2] - box2[0]) * (box2[3] - box2[1])
    if float(box1Area + box2Area - interArea) <= 0: return 0
    return interArea / float(box1Area + box2Area - interArea)

def get_motion_instant(track_history):
    """Tính vận tốc tức thời (frame-to-frame) giống hệt test script."""
    if len(track_history) < 2: return 0
    return math.hypot(track_history[-1][0] - track_history[-2][0],
                      track_history[-1][1] - track_history[-2][1])

def optimize_face_image(crop):
    """Tối ưu hóa ảnh khuôn mặt bị lóa sáng cực nặng (Aggressive Restoration)."""
    if crop is None or crop.size == 0: return crop
    
    # 1. Tính toán độ sáng trung bình
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    avg_brightness = np.mean(gray)
    
    # 2. Xử lý chống lóa (Gamma Correction) - Quyết liệt hơn
    gamma = 1.0
    if avg_brightness > 210: gamma = 2.5   # Cực lóa
    elif avg_brightness > 185: gamma = 1.8 # Lóa mạnh
    elif avg_brightness > 165: gamma = 1.4 # Lóa vừa
    elif avg_brightness < 60: gamma = 0.6  # Quá tối
    
    if gamma != 1.0:
        table = np.array([((i / 255.0) ** gamma) * 255 for i in np.arange(0, 256)]).astype("uint8")
        crop = cv2.LUT(crop, table)

    # 3. Chuẩn hóa Histogram (Normalization) - Kéo giãn dải tương phản
    crop = cv2.normalize(crop, None, 0, 255, cv2.NORM_MINMAX)

    # 4. Cân bằng tương phản thích nghi (CLAHE) trong hệ màu LAB - clipLimit cao hơn
    lab = cv2.cvtColor(crop, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=4.0, tileGridSize=(8, 8))
    cl = clahe.apply(l)
    limg = cv2.merge((cl, a, b))
    crop = cv2.cvtColor(limg, cv2.COLOR_LAB2BGR)
    
    # 5. Làm sắc nét (Unsharp Masking) - Quan trọng để lấy lại các nét mờ do lóa
    # Tạo một bản mờ và trừ vào bản gốc để làm nổi bật cạnh (edges)
    gaussian_3 = cv2.GaussianBlur(crop, (0, 0), 2.0)
    crop = cv2.addWeighted(crop, 1.5, gaussian_3, -0.5, 0)
    
    return crop

def detect_logic(frame, cam_id):
    # 1. Chọn model đúng cho từng camera để cô lập Tracker ID
    if cam_id not in camera_models:
        print(f"⚠️ Model cho {cam_id} chưa được tải. Đang tải...")
        camera_models[cam_id] = YOLO(MODEL_PATH)
        
    current_model = camera_models[cam_id]

    # Lấy thông tin camera từ ID
    db_id = int(cam_id.replace("cam", ""))
    
    # 2. Tầng 1: Phát hiện & Tracking
    # Kiểm tra loại AI từ CSDL hoặc mặc định (tối ưu: có thể cache loại api_type)
    # Ở đây ta giả sử cam_id chẵn/lẻ hoặc dựa trên logic cũ để demo, 
    # thực tế nên query DB hoặc cache api_type vào camera_models.
    
    # Lấy loại AI của camera này
    api_type = camera_configs.get(cam_id, 'face')

    if api_type == 'face':
        # Cam loại Khuôn mặt: Cổng - Chuyển động chậm, ưu tiên độ chính xác cao
        results = current_model.track(frame, persist=True, verbose=False, iou=0.4, conf=0.25)
    else:
        # Cam loại Hành vi: Sân trường - Sử dụng stable_tracker.yaml
        tracker_path = os.path.join(BASE_DIR, "stable_tracker.yaml")
        results = current_model.track(frame, persist=True, verbose=False, conf=0.25, iou=0.85, agnostic_nms=True, tracker=tracker_path, imgsz=640)
    
    processed_objects = []
    has_alert = False 
    alert_tids = []
    all_names_in_frame = []
    now = time.time()

    # ======================================================
    # CAM 2: LOGIC NGUYÊN BẢN TỪ src/tracking_fight_face.py
    # ======================================================
    if cam_id == "cam2":
        # Hằng số - giống hệt test script
        FIGHT_CONFIRM_FRAMES = 3
        YOLO_CONF = 0.25
        FACE_SIM_THRESHOLD = 0.45
        MIN_FIGHT_CONF = 0.55
        MOTION_SENSITIVITY = 12.0
        STRICT_IOU = 0.2
        EMA_ALPHA = 0.85

        if cam_id not in id_smooth_names:
            id_smooth_names[cam_id] = {}
        cam_cache = id_smooth_names[cam_id]

        results_raw = results[0] if results else None
        if results_raw is None or results_raw.boxes is None or results_raw.boxes.id is None:
            return processed_objects, has_alert, "Không xác định", alert_tids

        boxes   = results_raw.boxes.xyxy.cpu().numpy()
        clss    = results_raw.boxes.cls.cpu().numpy().astype(int)
        confs   = results_raw.boxes.conf.cpu().numpy()
        track_ids = results_raw.boxes.id.cpu().numpy().astype(int)

        # Lọc bỏ NaN để tránh crash
        valid_mask = ~np.isnan(boxes).any(axis=1)
        boxes = boxes[valid_mask]
        clss = clss[valid_mask]
        confs = confs[valid_mask]
        track_ids = track_ids[valid_mask]

        print(f"[cam2] YOLO phát hiện {len(boxes)} đối tượng.")

        for tid in track_ids:
            if tid not in cam_cache:
                cam_cache[tid] = {
                    "track_history": [],   # list of center points
                    "recognized":    False,
                    "name":          "Đối tượng chưa xác định",
                    "fight_counter": 0,
                    "fight_start_time": None,
                    "smoothed_box":  None,
                    "last_time":     now,
                }
            cam_cache[tid]["last_time"] = now

        # ====================================================
        # BƯỚC A: Cập nhật track_history + nhận diện khuôn mặt
        # ====================================================
        for i, tid in enumerate(track_ids):
            x1, y1, x2, y2 = map(int, boxes[i])
            center_pt = ((x1 + x2) // 2, (y1 + y2) // 2)
            info = cam_cache[tid]
            info["track_history"].append(center_pt)
            if len(info["track_history"]) > 20:
                info["track_history"] = info["track_history"][-20:]

            # Nhận diện danh tính (1 lần/ID cho đến khi thành công)
            if not info["recognized"] and (x2 - x1) > 40:
                h_f, w_f, _ = frame.shape
                crop = frame[max(0, y1):min(h_f, y2), max(0, x1):min(w_f, x2)]
                if crop.size > 0:
                    try:
                        # Áp dụng bộ lọc chống lóa trước khi nhận diện
                        faces = face_app.get(optimize_face_image(crop))
                        if faces:
                            face = max(faces, key=lambda fx: (fx.bbox[2]-fx.bbox[0])*(fx.bbox[3]-fx.bbox[1]))
                            emb = face.embedding / np.linalg.norm(face.embedding)
                            sims = cosine_similarity(emb.reshape(1, -1), db_embeddings)[0]
                            best_idx = np.argmax(sims)
                            if sims[best_idx] > 0.40:
                                info["name"] = db_names[best_idx]
                                info["recognized"] = True
                                print(f"[cam2] ✅ Nhận diện: ID {tid} → {info['name']} (Score: {sims[best_idx]:.2f})")
                    except Exception as e:
                        print(f"[cam2] AI Error: {e}")

        # ====================================================
        # BƯỚC B: Logic phát hiện đánh nhau (Điều kiện 1 + 2)
        # ====================================================
        current_fights = set()

        for i in range(len(track_ids)):
            tid_i = track_ids[i]
            box_i = boxes[i]
            info_i = cam_cache[tid_i]

            # ĐIỀU KIỆN 1: Model AI chắc chắn (fight class + conf cao + vận tốc tức thời)
            if clss[i] == 1 and confs[i] > MIN_FIGHT_CONF:
                if get_motion_instant(info_i["track_history"]) > 3.0:
                    current_fights.add(tid_i)

            # ĐIỀU KIỆN 2: Heuristic cặp đôi (Va chạm + cả 2 chuyển động mạnh)
            for j in range(i + 1, len(track_ids)):
                tid_j = track_ids[j]
                iou_val = compute_iou(box_i, boxes[j])
                if iou_val > STRICT_IOU:
                    m_i = get_motion_instant(info_i["track_history"])
                    m_j = get_motion_instant(cam_cache[tid_j]["track_history"])
                    if m_i > 5.0 and m_j > 5.0 and (m_i + m_j) > MOTION_SENSITIVITY:
                        current_fights.add(tid_i)
                        current_fights.add(tid_j)

        # ====================================================
        # BƯỚC C: Vẽ box, cập nhật fight_counter, EMA Smoothing
        # ====================================================
        for i, tid in enumerate(track_ids):
            x1, y1, x2, y2 = map(int, boxes[i])
            info = cam_cache[tid]

            # Cập nhật fight_counter (giống test script: +1 / max(0, n-1))
            if tid in current_fights:
                info["fight_counter"] = min(info["fight_counter"] + 1, 30)
            else:
                info["fight_counter"] = max(0, info["fight_counter"] - 1)

            is_fighting = info["fight_counter"] >= FIGHT_CONFIRM_FRAMES
            
            # Cơ chế xác thực thời gian (3 giây) cho Nhật ký vi phạm
            if is_fighting:
                if info.get("fight_start_time") is None:
                    info["fight_start_time"] = now
                
                # Nếu đã xô xát liên tục trên 3 giây -> Kích hoạt Alert thực sự
                duration = now - info["fight_start_time"]
                obj_alert = (duration >= 3.0)
            else:
                info["fight_start_time"] = None
                obj_alert = False

            # EMA Smoothing (giống test script: alpha 0.7)
            target_box = [x1, y1, x2, y2]
            if info["smoothed_box"] is not None:
                sb = info["smoothed_box"]
                smoothed = [
                    int(sb[k] * (1 - EMA_ALPHA) + target_box[k] * EMA_ALPHA)
                    for k in range(4)
                ]
                info["smoothed_box"] = smoothed
            else:
                info["smoothed_box"] = target_box
            sx1, sy1, sx2, sy2 = info["smoothed_box"]

            name  = info["name"]
            status = "FIGHTING" if is_fighting else "Normal"
            display_name = f"🔥 {name} ĐANG ĐÁNH NHAU!" if is_fighting else f"👤 {name}"

            if obj_alert:
                has_alert = True
                alert_tids.append(tid)

            vtype = "GÂY GỔ / ĐÁNH NHAU" if is_fighting else "CẢNH BÁO"
            processed_objects.append({
                "bbox": [sx1, sy1, sx2, sy2],
                "name": display_name,
                "is_alert": obj_alert,
                "vtype": vtype
            })

            # Thu thập danh tính cho báo cáo
            # Nếu đang có đánh nhau, chỉ ưu tiên hiện tên những người tham gia
            if is_fighting:
                all_names_in_frame.append(name)
            elif not name.startswith("Đối tượng chưa xác định"):
                all_names_in_frame.append(name)

        # Dọn dẹp cache cam2
        to_del = [t for t, inf in cam_cache.items() if now - inf["last_time"] > 20.0]
        for t in to_del: del cam_cache[t]

        # Lọc danh sách danh tính: Nếu có đánh nhau, chỉ lấy những người đang tham gia (alert_tids)
        if has_alert:
            fight_participants = []
            for tid in alert_tids:
                if tid in cam_cache:
                    fight_participants.append(cam_cache[tid]["name"])
            identities_str = ", ".join(list(set(fight_participants))) if fight_participants else "Đối tượng chưa xác định"
        else:
            identities_str = ", ".join(list(set(all_names_in_frame))) if all_names_in_frame else "Không xác định"

        return processed_objects, has_alert, identities_str, alert_tids

    # ======================================================
    # CAM 1 (và các cam khác): Giữ nguyên logic gốc
    # ======================================================
    if results and results[0].boxes is not None:
        print(f"[{cam_id}] YOLO phát hiện {len(results[0].boxes)} đối tượng.")
        boxes = results[0].boxes.xyxy.cpu().numpy()
        confs = results[0].boxes.conf.cpu().numpy()
        cls = results[0].boxes.cls.cpu().numpy()
        track_ids = results[0].boxes.id
        track_ids = track_ids.cpu().numpy().astype(int) if track_ids is not None else [None]*len(boxes)

        # Lọc bỏ NaN để tránh crash
        valid_mask = ~np.isnan(boxes).any(axis=1)
        boxes = boxes[valid_mask]
        confs = confs[valid_mask]
        cls = cls[valid_mask]
        track_ids = np.array(track_ids)[valid_mask]

        # Lấy bộ nhớ riêng cho từng Camera (Khởi tạo nếu chưa có)
        if cam_id not in id_smooth_names:
            id_smooth_names[cam_id] = {}
        cam_cache = id_smooth_names[cam_id]

        # --- LOGIC LOẠI BỎ BOX TRÙNG LẶP (Manual NMS) ---
        valid_indices = []
        sorted_indices = np.argsort(confs)[::-1]
        
        for i in sorted_indices:
            box_i = boxes[i]
            keep = True
            for j in valid_indices:
                if compute_iou(box_i, boxes[j]) > 0.6:
                    keep = False
                    break
            if keep:
                valid_indices.append(i)
        
        filtered_boxes = [boxes[i] for i in valid_indices]
        filtered_tids = [track_ids[i] for i in valid_indices]
        filtered_cls = [cls[i] for i in valid_indices]
        filtered_confs = [confs[i] for i in valid_indices]

        for box, tid, c, conf in zip(filtered_boxes, filtered_tids, filtered_cls, filtered_confs):
            class_name = current_model.names[int(c)]
            x1, y1, x2, y2 = map(int, box)

            
            final_identity = "unknown"
            is_analyzing = False
            
            if tid is not None:
                if tid not in cam_cache:
                    cam_cache[tid] = {
                        "name": "unknown", 
                        "votes": {}, 
                        "locked": False, 
                        "retry": 0, 
                        "total_frames": 0, 
                        "last_time": now,
                        "next_check_time": 0,
                        "bbox_history": [],
                        "fight_buffer": 0,
                        "is_fighting": False
                    }
                
                info = cam_cache[tid]
                info["last_time"] = now
                info["total_frames"] += 1

                # 1. CẬP NHẬT LỊCH SỬ VÀ LÀM MƯỢT (History & Smoothing) - DI CHUYỂN LÊN ĐẦU
                current_raw_bbox = [x1, y1, x2, y2]
                info["bbox_history"].append(current_raw_bbox)
                
                h_size = 5 if cam_id == "cam1" else 30
                if len(info["bbox_history"]) > h_size:
                    info["bbox_history"].pop(0)

                # Làm mượt tọa độ NGAY LẬP TỨC để các bước sau dùng tọa độ chuẩn
                if cam_id == "cam2" and len(info["bbox_history"]) > 1:
                    alpha = 0.7 # Theo src/tracking_fight_face.py
                    last_smooth = info["bbox_history"][-2]
                    # EMA Smoothing
                    smooth_bbox = [
                        int(alpha * current_raw_bbox[j] + (1 - alpha) * last_smooth[j])
                        for j in range(4)
                    ]
                    x1, y1, x2, y2 = smooth_bbox
                    info["bbox_history"][-1] = smooth_bbox 
                else:
                    # Cam 1 hoặc khi chưa đủ lịch sử: dùng trung bình cộng an toàn
                    if len(info["bbox_history"]) > 0:
                        avg_bbox = np.mean(info["bbox_history"], axis=0).astype(int)
                        x1, y1, x2, y2 = avg_bbox.tolist()
                if not info["locked"] and info["name"] == "unknown":
                    for other_tid, other_info in cam_cache.items():
                        if other_tid != tid and other_info["locked"] and other_info["name"] != "unknown":
                            if other_info.get("bbox_history"):
                                last_bbox = other_info["bbox_history"][-1]
                                # Kết hợp IOU và Khoảng cách tâm (tối ưu cho Cam 2 xô xát)
                                iou_score = compute_iou(box, last_bbox)
                                
                                c1 = ((box[0]+box[2])/2, (box[1]+box[3])/2)
                                c2 = ((last_bbox[0]+last_bbox[2])/2, (last_bbox[1]+last_bbox[3])/2)
                                center_dist = np.sqrt((c1[0]-c2[0])**2 + (c1[1]-c2[1])**2)
                                
                                # ĐIỀU KIỆN KẾ THỪA STRICT QUAN TRỌNG NHẤT:
                                # 1. ID cũ (other_tid) PHẢI LÀ ID KHÔNG CÒN HOẠT ĐỘNG TRONG FRAME HIỆN TẠI (đã chết/bị mất track)
                                # 2. IOU phải cực cao (> 0.8) hoặc tâm cực gần (< 20px) tránh việc 2 người đang đi cạnh nhau/cắt mặt nhau bị nhận nhầm
                                if other_tid not in filtered_tids:
                                    if iou_score > 0.8 or center_dist < 20:
                                        info["name"] = other_info["name"]
                                        info["locked"] = True
                                        print(f"[{cam_id}] ⚡ Kế thừa: ID {tid} lấy lại danh tính từ ID chết {other_tid} ({info['name']})")
                                        break

                # --- PHÂN TÍCH HÀNH VI (BEHAVIOR ANALYTICS) ---
                # 1. Tính toán chuyển động (Motion & Direction Changes)
                motion_intensity = 0
                dir_changes = 0
                if len(info["bbox_history"]) >= 3:
                    pts = [((b[0]+b[2])/2, (b[1]+b[3])/2) for b in info["bbox_history"]]
                    # Tính tổng độ dịch chuyển (Motion)
                    motion_intensity = np.sqrt((pts[-1][0] - pts[0][0])**2 + (pts[-1][1] - pts[0][1])**2)
                    
                    # Tính số lần đổi hướng đột ngột (Dir Changes)
                    for i in range(2, len(pts)):
                        v1 = (pts[i-1][0]-pts[i-2][0], pts[i-1][1]-pts[i-2][1])
                        v2 = (pts[i][0]-pts[i-1][0], pts[i][1]-pts[i-1][1])
                        # Kiểm tra tích vô hướng (Nếu v1.v2 < 0 nghĩa là đổi hướng ngược lại/đột ngột)
                        if v1[0]*v2[0] + v1[1]*v2[1] < 0:
                            dir_changes += 1

                    # 2. Cơ chế Temporal Buffer kết hợp Heuristic mới (Tích hợp từ tracking_fight_face.py)
                    if cam_id == "cam2":
                        # Định nghĩa các ngưỡng từ file test
                        STRICT_IOU = 0.2
                        MOTION_SENSITIVITY = 12.0
                        MIN_FIGHT_CONF = 0.55
                        
                        is_fight_triggered = False
                        
                        # ĐIỀU KIỆN 1: Model AI tự tin + có chuyển động thực tế
                        if class_name == "fight" and conf > MIN_FIGHT_CONF:
                            if motion_intensity > 3.0: # Ngưỡng vận tốc tối thiểu
                                is_fight_triggered = True

                        # ĐIỀU KIỆN 2: Heuristic cho cặp đôi (Va chạm + Chuyển động mạnh cùng lúc)
                        # Duyệt qua các đối tượng khác để tìm va chạm
                        for other_tid, other_info in cam_cache.items():
                            if other_tid != tid and other_info.get("bbox_history"):
                                other_box = other_info["bbox_history"][-1]
                                iou_val = compute_iou(box, other_box)
                                
                                if iou_val > STRICT_IOU:
                                    # Tính vận tốc đối tượng kia
                                    m_other = 0
                                    if len(other_info["bbox_history"]) >= 3:
                                        p_other = [((b[0]+b[2])/2, (b[1]+b[3])/2) for b in other_info["bbox_history"]]
                                        m_other = np.sqrt((p_other[-1][0] - p_other[0][0])**2 + (p_other[-1][1] - p_other[0][1])**2)
                                    
                                    # Cả hai phải có vận tốc cao và tổng vận tốc vượt ngưỡng
                                    if motion_intensity > 5.0 and m_other > 5.0 and (motion_intensity + m_other) > MOTION_SENSITIVITY:
                                        is_fight_triggered = True
                                        break

                        if is_fight_triggered:
                            # Tích lũy buffer (Confirm frames = 3) theo src/tracking_fight_face.py
                            info["fight_buffer"] = min(10, info["fight_buffer"] + 1) 
                        else:
                            info["fight_buffer"] = max(0, info["fight_buffer"] - 1)
                        
                    # Xác nhận đánh nhau (FIGHT_CONFIRM_FRAMES = 3)
                    if info["fight_buffer"] >= 3: # Ngưỡng kích hoạt 3 frame
                        info["is_fighting"] = True
                    elif info["fight_buffer"] <= 0:
                        info["is_fighting"] = False


                # NHẬN DIỆN DANH TÍNH: Luôn nhận diện ngầm cho cả 2 Cam để sẵn sàng dữ liệu
                should_identify = True

                if should_identify and not info["locked"] and info["retry"] < MAX_RETRY_IDENTIFY and now >= info["next_check_time"]:
                    h, w, _ = frame.shape
                    person_crop = frame[max(0,y1):min(h,y2), max(0,x1):min(w,x2)]
                    
                    if person_crop.size > 0:
                        try:
                            # Tần suất quét: LIÊN TỤC (cooldown = 0) cho đến khi lock được danh tính.
                            # Điều này giúp vớt được mọi góc mặt lướt qua nhanh mà không bị delay 0.7s.
                            current_cooldown = 0 
                            info["next_check_time"] = now + current_cooldown

                            # Tìm mặt trong vùng crop người - Áp dụng tối ưu ánh sáng
                            faces = face_app.get(optimize_face_image(person_crop))
                            
                            if not faces:
                                # Nếu không thấy mặt trong vùng hẹp, thử mở rộng vùng quét (Expanded Crop)
                                ew_pad = int((x2 - x1) * 0.35)
                                eh_pad = int((y2 - y1) * 0.35)
                                ex1, ey1 = max(0, x1 - ew_pad), max(0, y1 - eh_pad)
                                ex2, ey2 = min(w, x2 + ew_pad), min(h, y2 + eh_pad)
                                expanded_crop = frame[ey1:ey2, ex1:ex2]
                                if expanded_crop.size > 0:
                                    # Thử lại với crop rộng hơn - Áp dụng tối ưu ánh sáng
                                    faces = face_app.get(optimize_face_image(expanded_crop))
                            
                            if faces:
                                info["retry"] += 1
                                # Lấy mặt lớn nhất trong vùng phát hiện
                                face = max(faces, key=lambda x: (x.bbox[2]-x.bbox[0]) * (x.bbox[3]-x.bbox[1]))
                                fw = face.bbox[2]-face.bbox[0]
                                
                                if fw > MIN_FACE_SIZE:
                                    emb = face.embedding / np.linalg.norm(face.embedding)
                                    sims = cosine_similarity(emb.reshape(1, -1), db_embeddings)[0]
                                    top_idx = np.argmax(sims)
                                    score = sims[top_idx]
                                    candidate = db_names[top_idx]
                                    
                                    # Đối soát ngưỡng nhận diện (Test script dùng 0.45)
                                    effective_threshold = 0.45 if cam_id == "cam2" else SIMILARITY_THRESHOLD
                                    if score > effective_threshold:
                                        info["votes"][candidate] = info["votes"].get(candidate, 0) + 1
                                        
                                        # Nếu độ tin cậy rất cao hoặc tích lũy đủ số lần nhận diện
                                        if score > LOCK_THRESHOLD or info["votes"].get(candidate, 0) >= VOTE_THRESHOLD:
                                            info["name"] = candidate
                                            if cam_id == "cam1":
                                                info["locked"] = True
                                            print(f"[{cam_id}] ✅ Identifed: {candidate} (Score: {score:.2f})")
                                    else:
                                        # Nếu không đủ tin cậy, thỉnh thoảng hiện "NGƯỜI LẠ" để user biết
                                        pass
                        except Exception as e:
                            print(f"AI Error: {e}")

                final_identity = info["name"]
                
                # CHỈNH SỬA LOGIC HIỂN THỊ:
                if not info["locked"] and should_identify:
                    if info["retry"] < 5:
                        is_analyzing = True
                    else:
                        is_analyzing = False
                else:
                    is_analyzing = False

            # Hiển thị nhãn
            if api_type == 'behavior' and class_name != "fight" and final_identity == "unknown":
                name_tag = "ĐỐI TƯỢNG"
            else:
                name_tag = final_identity.upper() if final_identity != "unknown" else ("ĐANG PHÂN TÍCH..." if is_analyzing else "NGƯỜI LẠ")
            obj_alert = False
            
            if api_type == 'face':
                if final_identity == "unknown" and not is_analyzing:
                    display_name = f"⚠️ {name_tag}"
                    obj_alert = True
                else:
                    display_name = f"ID: {name_tag}"
            else: # behavior
                if info.get("is_fighting"):
                    display_name = f"🔥 {name_tag} ĐANG ĐÁNH NHAU!"
                    obj_alert = True
                else:
                    display_name = f"👤 {name_tag}"
            
            if obj_alert: 
                has_alert = True
                if tid is not None: alert_tids.append(tid)
            
            # TỐI ƯU HIỂN THỊ: 
            # - Cam hỗ trợ face: Luôn hiện
            # - Cam hỗ trợ behavior: Hiện tất cả đối tượng con người
            should_draw = True
            
            # Xác định loại vi phạm thuần túy để lưu Database
            clean_vtype = "NGƯỜI LẠ" if api_type == 'face' else ("GÂY GỔ / ĐÁNH NHAU" if info.get("is_fighting") else "CẢNH BÁO")

            if should_draw:
                processed_objects.append({
                    "bbox": [x1, y1, x2, y2], 
                    "name": display_name, 
                    "is_alert": obj_alert,
                    "vtype": clean_vtype # Thêm trường này
                })
            
            # Thêm vào danh sách định danh tổng quát
            if name_tag not in ["ĐANG PHÂN TÍCH...", "NGƯỜI LẠ", "ĐỐI TƯỢNG"]:
                 all_names_in_frame.append(name_tag)
            elif name_tag == "NGƯỜI LẠ":
                 all_names_in_frame.append("Người Lạ")

    # Dọn dẹp cache (định kỳ mỗi 20 giây xóa các ID biến mất quá 20 giây)
    cam_cache = id_smooth_names.get(cam_id, {})
    to_del = [tid for tid, inf in cam_cache.items() if now - inf["last_time"] > 20.0]
    for tid in to_del: del cam_cache[tid]

    # Join danh sách tên thành chuỗi
    identities_str = ", ".join(list(set(all_names_in_frame))) if all_names_in_frame else "Không xác định"

    return processed_objects, has_alert, identities_str, alert_tids


@app.route('/api/analytics/hourly', methods=['GET'])
@login_required
def get_analytics_hourly():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        start_date = request.args.get('start')
        end_date = request.args.get('end')
        ident = request.args.get('identity')
        filter_start = start_date if start_date else (datetime.now().date() - timedelta(days=30)).strftime('%Y-%m-%d')

        sql = "SELECT DATEPART(HOUR, start_time) as hr, COUNT(*) as cnt FROM violation_history WHERE 1=1"
        params = []
        
        if filter_start:
            sql += " AND start_time >= ?"
            params.append(filter_start)
        if end_date:
            sql += " AND CAST(start_time AS DATE) <= ?"
            params.append(end_date)
        if ident:
            sql += " AND detected_identities LIKE ?"
            params.append(f"%{ident}%")
            
        sql += " GROUP BY DATEPART(HOUR, start_time) ORDER BY hr"
        cursor.execute(sql, params)
        rows = cursor.fetchall()
        
        # Tạo mảng 24 giờ mặc định là 0
        hourly_data = [0] * 24
        for row in rows:
            hr = int(row[0])
            count = int(row[1])
            if 0 <= hr < 24:
                hourly_data[hr] = count
                
        conn.close()
        return jsonify(hourly_data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/identities')
def identities_page():
    if 'user_id' not in session:
        return redirect(url_for('login_page'))
    return send_from_directory(FRONTEND_DIR, 'identities.html')


@app.route('/api/identities', methods=['GET'])
@login_required
def get_identities():
    try:
        if not os.path.exists(DB_PATH):
            return jsonify([])
            
        data = np.load(DB_PATH)
        np_names = data["names"]
        unique_names, counts = np.unique(np_names, return_counts=True)
        
        # Lấy metadata từ Database
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT full_name, student_id, class_name FROM identities_metadata")
        rows = cursor.fetchall()
        meta_dict = {row[0]: {"mssv": row[1], "class": row[2]} for row in rows}
        conn.close()

        identities = []
        for name, count in zip(unique_names, counts):
            identities.append({
                "name": name,
                "count": int(count),
                "mssv": meta_dict.get(name, {}).get("mssv", ""),
                "class": meta_dict.get(name, {}).get("class", "")
            })
            
        return jsonify(identities)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/identities', methods=['POST'])
@login_required
def add_identity():
    try:
        # Nhận dữ liệu từ Form-Data
        name = request.form.get('name')
        img_file = request.files.get('image')
        
        if not name or not img_file:
            return jsonify({"success": False, "message": "Thiếu tên hoặc ảnh"}), 400
            
        # Đọc ảnh
        img_bytes = img_file.read()
        nparr = np.frombuffer(img_bytes, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if frame is None:
            return jsonify({"success": False, "message": "Không thể giải mã ảnh"}), 400
            
        # Lấy thêm MSSV và Lớp (Nếu có)
        mssv = request.form.get('mssv', '')
        class_name = request.form.get('class', '')

        # Lấy embedding (dùng model có sẵn) - Áp dụng tối ưu ánh sáng cho ảnh đầu vào
        faces = face_app.get(optimize_face_image(frame))
        if not faces:
            return jsonify({"success": False, "message": "Không tìm thấy khuôn mặt trong ảnh"}), 400
            
        # Lấy khuôn mặt lớn nhất
        face = max(faces, key=lambda x: (x.bbox[2]-x.bbox[0])*(x.bbox[3]-x.bbox[1]))
        new_emb = face.embedding / np.linalg.norm(face.embedding)
        
        # Lưu vào NPZ
        if os.path.exists(DB_PATH):
            data = np.load(DB_PATH)
            embeddings = data["embeddings"]
            names = data["names"]
            
            new_embeddings = np.vstack([embeddings, new_emb])
            new_names = np.concatenate([names, [name]])
        else:
            new_embeddings = np.array([new_emb])
            new_names = np.array([name])
            
        np.savez(DB_PATH, embeddings=new_embeddings, names=new_names)
        
        # LƯU METADATA VÀO SQL
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            IF EXISTS (SELECT 1 FROM identities_metadata WHERE full_name = ?)
                UPDATE identities_metadata SET student_id = ?, class_name = ?, updated_at = GETDATE() WHERE full_name = ?
            ELSE
                INSERT INTO identities_metadata (full_name, student_id, class_name) VALUES (?, ?, ?)
        """, (name, mssv, class_name, name, name, mssv, class_name))
        conn.commit()
        conn.close()

        # Reload AI globally
        reload_face_database()
        
        # Xóa cache để ép nhận diện lại với tên mới
        global id_smooth_names
        id_smooth_names = {}
        
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500


@app.route('/api/identities/<name>', methods=['DELETE'])
@login_required
def delete_identity(name):
    try:
        if not os.path.exists(DB_PATH):
            return jsonify({"success": False, "message": "Database không tồn tại"}), 404
            
        data = np.load(DB_PATH)
        embeddings = data["embeddings"]
        names = data["names"]
        
        # Tạo mask để giữ lại các tên KHÁC với tên cần xóa
        mask = (names != name)
        if np.sum(mask) == len(names):
             return jsonify({"success": False, "message": "Không tìm thấy tên này"}), 404
             
        new_embeddings = embeddings[mask]
        new_names = names[mask]
        
        if len(new_names) == 0:
            os.remove(DB_PATH)
        else:
            np.savez(DB_PATH, embeddings=new_embeddings, names=new_names)
            
        # XÓA METADATA TRONG SQL
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM identities_metadata WHERE full_name = ?", (name,))
        conn.commit()
        conn.close()

        # Reload AI globally
        reload_face_database()
        
        # Xóa cache để tránh còn lưu tên đã xóa
        global id_smooth_names
        id_smooth_names = {}
        
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500


@app.route('/api/identities/<old_name>', methods=['PUT'])
@login_required
def update_identity(old_name):
    try:
        data = request.json
        new_name = data.get('new_name')
        new_mssv = data.get('mssv', '')
        new_class = data.get('class_name', '')
        
        if not os.path.exists(DB_PATH):
            return jsonify({"success": False, "message": "Database không tồn tại"}), 404
            
        db_data = np.load(DB_PATH)
        embeddings = db_data["embeddings"]
        names = db_data["names"]
        
        # Kiểm tra sự tồn tại của tên cũ
        if old_name not in names:
            return jsonify({"success": False, "message": f"Không tìm thấy danh tính '{old_name}'"}), 404
            
        # 1. Cập nhật tên trong file .npz (Nếu đổi tên)
        if new_name and new_name != old_name:
            updated_names = np.where(names == old_name, new_name, names)
            np.savez(DB_PATH, embeddings=embeddings, names=updated_names)
        
        # 2. Cập nhật Metadata trong SQL
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Đổi tên trong metadata nếu cần
        if new_name and new_name != old_name:
            cursor.execute("UPDATE identities_metadata SET full_name = ? WHERE full_name = ?", (new_name, old_name))
        
        # Cập nhật MSSV và Lớp
        target_name = new_name if new_name else old_name
        cursor.execute("""
            IF EXISTS (SELECT 1 FROM identities_metadata WHERE full_name = ?)
                UPDATE identities_metadata SET student_id = ?, class_name = ?, updated_at = GETDATE() WHERE full_name = ?
            ELSE
                INSERT INTO identities_metadata (full_name, student_id, class_name) VALUES (?, ?, ?)
        """, (target_name, new_mssv, new_class, target_name, target_name, new_mssv, new_class))
        
        conn.commit()
        conn.close()

        # Reload AI globally
        reload_face_database()
        
        # Xóa cache để cập nhật tên mới ngay lập tức trên màn hình
        global id_smooth_names
        id_smooth_names = {}
        
        return jsonify({"success": True, "message": "Cập nhật thành công"})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500


@app.route('/')
def root():
    if 'user_id' in session:
        # Trả về trang chủ thay vì redirect
        return send_from_directory(FRONTEND_DIR, 'home.html')
    return redirect(url_for('login_page'))

@app.route('/dashboard')
def dashboard():
    if 'user_id' not in session:
        return redirect(url_for('login_page'))
    return send_from_directory(FRONTEND_DIR, 'dashboard.html')

@app.route('/analytics')
def analytics_page():
    if 'user_id' not in session:
        return redirect(url_for('login_page'))
    return send_from_directory(FRONTEND_DIR, 'analytics.html')

@app.route('/users')
def users_page():
    if 'user_id' not in session or session.get('role') != 'admin':
        return redirect(url_for('dashboard'))
    return send_from_directory(FRONTEND_DIR, 'users.html')

@app.route('/profile')
def profile_page():
    if 'user_id' not in session:
        return redirect(url_for('login_page'))
    return send_from_directory(FRONTEND_DIR, 'profile.html')

@app.route('/login')
def login_page():
    return send_from_directory(FRONTEND_DIR, 'login.html')

@app.route('/api/login', methods=['POST'])
def api_login():
    data = request.json
    username = data.get('username')
    password = data.get('password')
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT id, username, role, full_name FROM users WHERE username = ? AND password = ?", (username, password))
        user = cursor.fetchone()
        conn.close()
        
        if user:
            # Bỏ chặn require_admin để mọi user đều có thể vào web (phân quyền tính năng sau)
            session['user_id'] = user[0]
            session['username'] = user[1]
            session['role'] = user[2]
            session['full_name'] = user[3] if len(user) > 3 else user[1]
            return jsonify({"success": True, "user": {"id": user[0], "username": user[1], "role": user[2], "full_name": user[3] if len(user) > 3 else user[1]}})
        else:
            return jsonify({"success": False, "message": "Sai tài khoản hoặc mật khẩu"}), 401
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

@app.route('/api/logout')
def api_logout():
    session.clear()
    return redirect(url_for('login_page'))

@app.route('/api/history', methods=['GET'])
@login_required
def get_history():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Nhận tham số lọc thời gian
        days = request.args.get('days')
        
        query = "SELECT top 100 id, camera_name, violation_type, image_url, start_time, status, detected_identities FROM violation_history WHERE 1=1"
        params = []
        
        if days and days.isdigit():
            # SQL Server syntax for date comparison
            query += " AND start_time >= DATEADD(day, -?, GETDATE())"
            params.append(int(days))
            
        query += " ORDER BY start_time DESC"
        
        cursor.execute(query, params)
        rows = cursor.fetchall()
        
        history = []
        for row in rows:
            history.append({
                "id": row[0],
                "camera_name": row[1],
                "violation_type": row[2],
                "image_url": row[3],
                "detected_at": row[4].strftime('%H:%M:%S %d/%m/%Y') if row[4] else "N/A",
                "status": row[5],
                "identities": row[6]
            })
        conn.close()
        return jsonify(history)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/user/activities', methods=['GET'])
@login_required
def get_user_activities():
    try:
        user_id = session.get('user_id')
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Get processed violations by this user
        query = """
            SELECT top 50 id, camera_name, violation_type, start_time, status 
            FROM violation_history 
            WHERE user_id = ? AND status != N'Chưa xử lý' AND status != N'Đang diễn ra'
            ORDER BY start_time DESC
        """
        cursor.execute(query, (user_id,))
        rows = cursor.fetchall()
        
        activities = []
        for row in rows:
            activities.append({
                "id": row[0],
                "type": "action",
                "title": f"Xử lý vi phạm #{row[0]}",
                "description": f"Trạng thái: {row[4]} • Camera: {row[1]}",
                "time": row[3].strftime('%H:%M') if row[3] else "",
                "date": row[3].strftime('%d/%m/%Y') if row[3] else "",
                "raw_date": row[3].strftime('%Y-%m-%d %H:%M:%S') if row[3] else ""
            })
            
        conn.close()
        return jsonify(activities)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/stats', methods=['GET'])
@login_required
def get_stats():
    try:
        today = datetime.now().strftime('%Y-%m-%d')
        conn = get_db_connection()
        cursor = conn.cursor()
        # Lấy danh sách camera hiện có để chuẩn hóa JSON trả về
        cursor.execute("SELECT id FROM cameras")
        camera_ids = [f"cam{r[0]}" for r in cursor.fetchall()]
        
        # Thống kê hôm nay theo camera_id (hoặc camera_name nếu bạn chưa migrate hết dữ liệu)
        cursor.execute("""
            SELECT camera_id, COUNT(*) 
            FROM violation_history 
            WHERE CAST(start_time AS DATE) = ? 
            GROUP BY camera_id
        """, (today,))
        
        rows = cursor.fetchall()
        # stats: { "cam1": 10, "cam2": 5 }
        stats = {f"cam{row[0]}": row[1] for row in rows if row[0] is not None}
        
        # Đảm bảo các camera không có vi phạm vẫn trả về 0
        result_stats = {cid: stats.get(cid, 0) for cid in camera_ids}
        
        conn.close()
        return jsonify(result_stats)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/analytics/summary', methods=['GET'])
@login_required
def get_analytics_summary():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Nhận tham số lọc từ Request
        start_date = request.args.get('start')
        end_date = request.args.get('end')
        hour = request.args.get('hour')
        ident = request.args.get('identity') # Thêm lọc danh tính
        
        # Mặc định lấy mốc 30 ngày nếu không có tham số
        filter_start = start_date if start_date else (datetime.now().date() - timedelta(days=30)).strftime('%Y-%m-%d')
        
        def apply_filters(query, params):
            q = query
            if filter_start:
                q += " AND start_time >= ?"
                params.append(filter_start)
            if end_date:
                q += " AND CAST(start_time AS DATE) <= ?"
                params.append(end_date)
            if hour and hour != "all":
                q += " AND DATEPART(hour, start_time) = ?"
                params.append(int(hour))
            if ident: # Lọc theo danh tính (Individual Student Analytics)
                q += " AND detected_identities LIKE ?"
                params.append(f"%{ident}%")
            return q, params

        # 1. Tổng số vi phạm
        q_total, p_total = apply_filters("SELECT COUNT(*) FROM violation_history WHERE 1=1", [])
        cursor.execute(q_total, p_total)
        total = cursor.fetchone()[0]
        
        # 2. Tổng số hôm nay
        today = datetime.now().strftime('%Y-%m-%d')
        cursor.execute("SELECT COUNT(*) FROM violation_history WHERE CAST(start_time AS DATE) = ?", (today,))
        today_count = cursor.fetchone()[0]
        
        # 3. Số vi phạm chưa xử lý (Dùng N'...' để hỗ trợ Unicode)
        q_pending, p_pending = apply_filters("SELECT COUNT(*) FROM violation_history WHERE status = N'Chưa xử lý'", [])
        cursor.execute(q_pending, p_pending)
        pending_count = cursor.fetchone()[0]
        
        # 4. Số vi phạm đã xử lý (Tất cả hoặc trong hôm nay tùy nhu cầu)
        # Sửa lại để đếm tất cả các sự kiện đã được xác nhận hoặc báo nhầm
        is_me = request.args.get('me', 'false').lower() == 'true'
        processed_query = "SELECT COUNT(*) FROM violation_history WHERE status != N'Chưa xử lý' AND status != N'Đang diễn ra'"
        processed_params = []
        if is_me:
            processed_query += " AND user_id = ? AND CAST(start_time AS DATE) = ?"
            processed_params.extend([session.get('user_id'), today])
        
        cursor.execute(processed_query, processed_params)
        total_processed_count = cursor.fetchone()[0]

        # 5. Người vi phạm nhiều nhất
        q_off, p_off = apply_filters("""
            SELECT detected_identities 
            FROM violation_history 
            WHERE detected_identities IS NOT NULL 
            AND detected_identities != 'unknown' 
            AND detected_identities != ''
        """, [])
        cursor.execute(q_off, p_off)
        all_idents = cursor.fetchall()
        
        name_counter = Counter()
        for row in all_idents:
            idents_str = row[0]
            raw_names = [n.strip() for n in idents_str.split(',')]
            for name in raw_names:
                clean = name.replace('🔥', '').replace(' ĐANG ĐÁNH NHAU!', '').strip()
                clean = clean.split('(')[0].strip()
                if clean and clean.lower() != 'unknown' and len(clean) > 1:
                    name_counter[clean] += 1
        
        top_offender = name_counter.most_common(1)
        top_name = top_offender[0][0] if top_offender else "Chưa có"
        top_count = top_offender[0][1] if top_offender else 0

        # 6. Phân bổ theo Camera
        q_cam, p_cam = apply_filters("""
            SELECT c.camera_name, COUNT(v.id) 
            FROM violation_history v
            JOIN cameras c ON v.camera_id = c.id
            WHERE 1=1
        """, [])
        q_cam += " GROUP BY c.camera_name"
        cursor.execute(q_cam, p_cam)
        cam_dist = {row[0]: row[1] for row in cursor.fetchall()}
        
        conn.close()
        return jsonify({
            "total": total,
            "today": today_count,
            "pending": pending_count,
            "today_processed": total_processed_count,
            "top_offender_name": top_name,
            "top_offender_count": top_count,
            "cam_distribution": cam_dist
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/analytics/offenders_weekly', methods=['GET'])
@login_required
def get_offenders_weekly():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Nhận tham số lọc
        start_date = request.args.get('start')
        end_date = request.args.get('end')
        hour = request.args.get('hour')
        ident = request.args.get('identity')
        filter_start = start_date if start_date else (datetime.now().date() - timedelta(days=30)).strftime('%Y-%m-%d')

        def apply_filters(query, params):
            q = query
            if filter_start:
                q += " AND start_time >= ?"
                params.append(filter_start)
            if end_date:
                q += " AND CAST(start_time AS DATE) <= ?"
                params.append(end_date)
            if hour and hour != "all":
                q += " AND DATEPART(hour, start_time) = ?"
                params.append(int(hour))
            if ident: # Hỗ trợ lọc chéo identity
                q += " AND detected_identities LIKE ?"
                params.append(f"%{ident}%")
            return q, params

        # Nhóm Cam 1: Lấy tất cả (Tần suất ra vào)
        sql1, p1 = apply_filters("""
            SELECT detected_identities 
            FROM violation_history 
            WHERE camera_id = 1
            AND detected_identities IS NOT NULL 
            AND detected_identities != 'unknown' 
            AND detected_identities != ''
        """, [])
        cursor.execute(sql1, p1)
        cam1_rows = cursor.fetchall()
        
        # Nhóm Cam 2: Chỉ lấy hành vi Đánh nhau
        sql2, p2 = apply_filters("""
            SELECT detected_identities 
            FROM violation_history 
            WHERE camera_id = 2 
            AND (violation_type LIKE N'%ĐÁNH NHAU%' OR violation_type LIKE '%FIGHT%')
            AND detected_identities IS NOT NULL 
            AND detected_identities != 'unknown' 
            AND detected_identities != ''
        """, [])
        cursor.execute(sql2, p2)
        cam2_rows = cursor.fetchall()
        
        def count_names(rows):
            counter = Counter()
            for row in rows:
                idents_str = row[0]
                # Bóc tách tên sạch: Bỏ emoji 🔥 và bỏ đuôi " ĐANG ĐÁNH NHAU!"
                raw_names = [n.strip() for n in idents_str.split(',')]
                for name in raw_names:
                    # Làm sạch tên
                    clean = name.replace('🔥', '').replace(' ĐANG ĐÁNH NHAU!', '').strip()
                    clean = clean.split('(')[0].strip() # Bỏ (ID - Lớp)
                    if clean and clean.lower() != 'unknown' and len(clean) > 1:
                        counter[clean] += 1
            return [{"name": k, "count": v} for k, v in counter.most_common(10)]

        data = {
            "cam1": count_names(cam1_rows),
            "cam2": count_names(cam2_rows)
        }
        
        conn.close()
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/analytics/daily', methods=['GET'])
@login_required
def get_analytics_daily():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        # Nhận bộ lọc
        start_date = request.args.get('start')
        end_date = request.args.get('end')
        hour = request.args.get('hour')
        ident = request.args.get('identity')
        filter_start = start_date if start_date else (datetime.now().date() - timedelta(days=30)).strftime('%Y-%m-%d')

        sql, params = "SELECT CAST(start_time AS DATE) as d, COUNT(*) as cnt FROM violation_history WHERE 1=1", []
        if filter_start:
            sql += " AND start_time >= ?"
            params.append(filter_start)
        if end_date:
            sql += " AND CAST(start_time AS DATE) <= ?"
            params.append(end_date)
        if hour and hour != "all":
            sql += " AND DATEPART(hour, start_time) = ?"
            params.append(int(hour))
        if ident:
            sql += " AND detected_identities LIKE ?"
            params.append(f"%{ident}%")
            
        sql += " GROUP BY CAST(start_time AS DATE) ORDER BY d ASC"
        cursor.execute(sql, params)
        rows = cursor.fetchall()
        data = [{"date": row[0].strftime('%d/%m'), "count": row[1]} for row in rows]
        conn.close()
        return jsonify(data[::-1]) # Đảo ngược để scale từ trái sang phải
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/history/update_status', methods=['POST'])
@login_required
def update_violation_status():
    try:
        data = request.json
        violation_id = data.get('id')
        new_status = data.get('status')
        
        # Ánh xạ trạng thái (Mapping) để tương thích Android & Anh-Việt
        status_map = {
            'pending': u'Chưa xử lý',
            'confirmed': u'Đã xác nhận',
            'resolved': u'Đã xử lý',
            'false_alarm': u'Báo cáo nhầm',
            'processing': u'Đang diễn ra'
        }
        # Nếu gửi tiếng Anh hoặc không dấu từ Android, chuyển về Tiếng Việt chuẩn
        if new_status in status_map:
            new_status = status_map[new_status]
        elif new_status == 'Chua xu ly':
            new_status = u'Chưa xử lý'
        elif new_status == 'Da xac nhan':
            new_status = u'Đã xác nhận'
        
        if not violation_id or not new_status:
            return jsonify({"success": False, "message": "Thiếu thông tin ID hoặc Trạng thái"}), 400
            
        conn = get_db_connection()
        cursor = conn.cursor()
        # Cập nhật cả trạng thái và người xử lý (user_id từ session)
        cursor.execute("UPDATE violation_history SET status = ?, user_id = ? WHERE id = ?", 
                       (new_status, session.get('user_id'), violation_id))
        conn.commit()
        conn.close()
        
        return jsonify({"success": True, "message": "Đã cập nhật trạng thái"})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500


@app.route('/api/analytics/search', methods=['GET'])
@login_required
def get_analytics_search():
    try:
        cam = request.args.get('camera')
        v_type = request.args.get('type')
        start_date = request.args.get('start')
        end_date = request.args.get('end')
        hour = request.args.get('hour')
        ident = request.args.get('identity') # Thêm lọc theo tên
        
        query = """
            SELECT v.id, v.camera_name, v.violation_type, v.detected_identities, 
                   v.start_time, v.status, v.image_url, u.full_name as processor_name 
            FROM violation_history v
            LEFT JOIN users u ON v.user_id = u.id
            WHERE 1=1
        """
        params = []
        
        # Mặc định lấy 30 ngày nếu không có ngày bắt đầu
        if not start_date:
            start_date = (datetime.now().date() - timedelta(days=30)).strftime('%Y-%m-%d')
            query += " AND v.start_time >= ?"
            params.append(start_date)
            
        if cam and cam != "all":
            query += " AND v.camera_name = ?"
            params.append(cam)
        if v_type and v_type != "all":
            query += " AND v.violation_type LIKE ?"
            params.append(f"%{v_type}%")
        if start_date:
            query += " AND v.start_time >= ?"
            params.append(start_date)
        if end_date:
            query += " AND v.start_time <= ?"
            params.append(end_date + " 23:59:59")
            
        if hour and hour != "all":
            query += " AND DATEPART(hour, v.start_time) = ?"
            params.append(int(hour))

        if ident: # Lọc theo danh tính
            query += " AND v.detected_identities LIKE ?"
            params.append(f"%{ident}%")
            
        query += " ORDER BY v.start_time DESC"
        
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(query, params)
        rows = cursor.fetchall()
        
        results = []
        for row in rows:
            results.append({
                "id": row[0],
                "camera_name": row[1],
                "violation_type": row[2],
                "identities": row[3],
                "start_time": row[4].strftime('%Y-%m-%d %H:%M:%S') if row[4] else "N/A",
                "status": row[5],
                "image_url": row[6],
                "processor_name": row[7] if row[7] else "---" # Thêm người xử lý
            })
        conn.close()
        return jsonify(results)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

def save_violation_to_db(cam_id, violation_type, frame, objs, identities):
    try:
        # 1. Chuyển đổi Frame từ OpenCV (BGR) sang PIL (RGB) để vẽ chữ Tiếng Việt
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        pil_img = Image.fromarray(frame_rgb)
        draw = ImageDraw.Draw(pil_img)
        
        # Tải font Arial (Hệ thống Windows)
        try:
            font = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 30)
        except:
            font = ImageFont.load_default()

        # Vẽ các Box và Chữ
        for obj in objs:
            x1, y1, x2, y2 = obj['bbox']
            label = obj['name']
            
            # Màu sắc (RGB cho Pillow)
            color = (255, 0, 0) if obj.get('is_alert') else (0, 255, 0)
            
            # Vẽ hình chữ nhật (OpenCV vẫn vẽ được box nhanh hơn, nhưng vẽ chung Pillow cho đồng bộ)
            draw.rectangle([x1, y1, x2, y2], outline=color, width=5)
            
            # Vẽ nền cho chữ để dễ đọc
            draw.rectangle([x1, y1 - 35, x1 + len(label)*18, y1], fill=color)
            draw.text((x1 + 5, y1 - 35), label, font=font, fill=(255, 255, 255))

        # Chuyển ngược lại OpenCV để lưu
        frame_processed = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)

        # 2. Lưu ảnh
        filename = f"violation_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}.jpg"
        filepath = os.path.join(UPLOAD_DIR, filename)
        cv2.imwrite(filepath, frame_processed)
        
        # 3. Làm giàu thông tin định danh (Enrich Identities)
        enriched_identities = identities
        if identities and identities != "unknown":
            name_list = [n.strip() for n in identities.split(",")]
            enriched_list = []
            
            conn = get_db_connection()
            cursor = conn.cursor()
            for n in name_list:
                cursor.execute("SELECT student_id, class_name FROM identities_metadata WHERE full_name = ?", (n,))
                row = cursor.fetchone()
                if row and (row[0] or row[1]):
                    info = f"{n} ({row[0] or 'N/A'} - {row[1] or 'N/A'})"
                    enriched_list.append(info)
                else:
                    enriched_list.append(n)
            conn.close()
            enriched_identities = ", ".join(enriched_list)

        # 4. Lưu vào Database
        url_path = f"/static/uploads/violations/{filename}"
        db_id = int(cam_id.replace("cam", ""))
        user_id = session.get('user_id', 1) # Mặc định admin nếu lỗi session
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Lấy camera_name thực tế từ DB
        cursor.execute("SELECT camera_name FROM cameras WHERE id = ?", (db_id,))
        row = cursor.fetchone()
        cam_full_name = row[0] if row else cam_id

        cursor.execute(
            """INSERT INTO violation_history 
               (camera_id, camera_name, violation_type, detected_identities, image_url, status, user_id, start_time) 
               VALUES (?, ?, ?, ?, ?, ?, NULL, GETDATE())""",
            (db_id, cam_full_name, violation_type, enriched_identities, url_path, u'Chưa xử lý')
        )
        conn.commit()
        conn.close()
        
        return url_path
    except Exception as e:
        print(f"Error saving violation: {e}")
        return None

@app.route('/detect_faces', methods=['POST'])
@login_required
def api_faces(): 
    cam_id = request.json.get("cam_id", "cam1")
    return process_request(cam_id)

@app.route('/detect_behavior', methods=['POST'])
@login_required
def api_behavior(): 
    cam_id = request.json.get("cam_id", "cam2")
    return process_request(cam_id)

@app.route('/api/cameras', methods=['GET'])
@login_required
def get_cameras():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT id, camera_name, location, src, api_type FROM cameras")
        rows = cursor.fetchall()
        cameras = [{"id": f"cam{r[0]}", "db_id": r[0], "name": r[1], "location": r[2], "src": r[3], "api_type": r[4]} for r in rows]
        conn.close()
        return jsonify(cameras)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/cameras', methods=['POST'])
@login_required
def add_camera():
    try:
        data = request.json
        name = data.get('name')
        location = data.get('location')
        src = data.get('src')
        api_type = data.get('api_type', 'face')
        
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO cameras (camera_name, location, src, api_type) 
            VALUES (?, ?, ?, ?)
        """, (name, location, src, api_type))
        conn.commit()
        conn.close()
        
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

@app.route('/api/cameras/<int:db_id>', methods=['DELETE'])
@login_required
def delete_camera(db_id):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM cameras WHERE id = ?", (db_id,))
        conn.commit()
        conn.close()
        
        # Giải phóng model khỏi bộ nhớ
        cam_id = f"cam{db_id}"
        if cam_id in camera_models:
            del camera_models[cam_id]
        if cam_id in id_smooth_names:
            del id_smooth_names[cam_id]
            
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

def process_request(cam_id):
    try:
        data = request.json
        img_str = data.get("image")
        img_bytes = base64.b64decode(img_str.split(",")[1])
        nparr = np.frombuffer(img_bytes, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if frame is None:
            return jsonify({"error": "Failed to decode image"}), 400
            
        # TỐI ƯU TỐC ĐỘ: Resize frame xuống 640px nếu quá lớn
        h, w = frame.shape[:2]
        if max(h, w) > 640:
            scale = 640 / max(h, w)
            frame = cv2.resize(frame, (int(w * scale), int(h * scale)))
            
        objs, alert, identities, alert_tids = detect_logic(frame, cam_id)
        
        # 🎯 TỐI ƯU HÓA: Kiểm tra Cooldown theo Track ID
        if alert:
            # Xử lý từng đối tượng gây cảnh báo
            for tid in (alert_tids if alert_tids else [0]):
                v_type = objs[0].get('vtype', 'CẢNH BÁO') if objs else "CẢNH BÁO"
                
                # Cache key dựa trên Camera + Track ID + Loại vi phạm
                cache_key = f"{cam_id}_{tid}_{v_type}"
                now = time.time()
                
                if cache_key not in last_recorded_time or (now - last_recorded_time[cache_key] > RECORD_COOLDOWN):
                    save_violation_to_db(cam_id, v_type, frame, objs, identities)
                    last_recorded_time[cache_key] = now
                    # Bỏ break để nếu có nhiều người tham gia, hệ thống vẫn cập nhật cooldown cho từng người
                    # Tuy nhiên save_violation_to_db chỉ được gọi 1 lần cho cụm này vì identities đã gộp đủ.
                    break 

        return jsonify({"objects": objs, "alert": alert})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ================= QUẢN LÝ USER & HỒ SƠ =================

@app.route('/api/admin/users', methods=['GET'])
@admin_required
def get_users():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT id, username, role, full_name, created_at FROM users")
        rows = cursor.fetchall()
        users = [{"id": r[0], "username": r[1], "role": r[2], "full_name": r[3], "created_at": r[4]} for r in rows]
        conn.close()
        return jsonify(users)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/admin/users', methods=['POST'])
@admin_required
def add_user():
    try:
        data = request.json
        username = data.get('username')
        password = data.get('password')
        role = data.get('role', 'user')
        full_name = data.get('full_name', '')
        
        if not username or not password:
            return jsonify({"success": False, "message": "Thiếu thông tin đăng nhập"}), 400
            
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("INSERT INTO users (username, password, role, full_name) VALUES (?, ?, ?, ?)", 
                     (username, password, role, full_name))
        conn.commit()
        conn.close()
        return jsonify({"success": True, "message": "Thêm người dùng thành công"})
    except Exception as e:
        if 'UNIQUE' in str(e) or '2627' in str(e):
            return jsonify({"success": False, "message": "Tên đăng nhập đã tồn tại"}), 400
        return jsonify({"success": False, "message": str(e)}), 500

@app.route('/api/admin/users/<int:u_id>', methods=['PUT'])
@admin_required
def update_user_api(u_id):
    try:
        data = request.json
        password = data.get('password')
        role = data.get('role')
        full_name = data.get('full_name')
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        updates = []
        params = []
        if password:
            updates.append("password = ?")
            params.append(password)
        if role:
            updates.append("role = ?")
            params.append(role)
        if full_name is not None:
            updates.append("full_name = ?")
            params.append(full_name)
            
        if not updates:
            return jsonify({"success": False, "message": "Không có thông tin thay đổi"}), 400
            
        params.append(u_id)
        cursor.execute(f"UPDATE users SET {', '.join(updates)} WHERE id = ?", params)
        conn.commit()
        conn.close()
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

@app.route('/api/admin/users/<int:u_id>', methods=['DELETE'])
@admin_required
def delete_user_api(u_id):
    try:
        if u_id == session.get('user_id'):
            return jsonify({"success": False, "message": "Không thể tự xóa chính mình"}), 400
            
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM users WHERE id = ?", (u_id,))
        conn.commit()
        conn.close()
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

@app.route('/api/profile', methods=['GET'])
@login_required
def get_profile():
    try:
        u_id = session.get('user_id')
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT id, username, role, full_name, phone, email, dob, avatar_url FROM users WHERE id = ?", (u_id,))
        row = cursor.fetchone()
        conn.close()
        
        if row:
            return jsonify({
                "id": row[0], 
                "username": row[1], 
                "role": row[2], 
                "full_name": row[3],
                "phone": row[4] or "",
                "email": row[5] or "",
                "dob": row[6] or "",
                "avatar_url": row[7] or ""
            })
        return jsonify({"error": "User not found"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/profile', methods=['PUT'])
@login_required
def update_profile():
    try:
        u_id = session.get('user_id')
        data = request.json
        full_name = data.get('full_name')
        phone = data.get('phone')
        email = data.get('email')
        dob = data.get('dob')
        avatar_url = data.get('avatar_url')
        new_password = data.get('new_password')
        old_password = data.get('old_password')
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        if new_password:
            if not old_password:
                return jsonify({"success": False, "message": "Vui lòng nhập mật khẩu cũ"}), 400
            cursor.execute("SELECT password FROM users WHERE id = ?", (u_id,))
            current_pwd = cursor.fetchone()[0]
            if current_pwd != old_password:
                return jsonify({"success": False, "message": "Mật khẩu cũ không chính xác"}), 400
        
        updates = []
        params = []
        if full_name is not None:
            updates.append("full_name = ?")
            params.append(full_name)
        if phone is not None:
            updates.append("phone = ?")
            params.append(phone)
        if email is not None:
            updates.append("email = ?")
            params.append(email)
        if dob is not None:
            updates.append("dob = ?")
            params.append(dob)
        if avatar_url is not None:
            updates.append("avatar_url = ?")
            params.append(avatar_url)
        if new_password:
            updates.append("password = ?")
            params.append(new_password)
            
        if not updates:
            return jsonify({"success": False, "message": "Không có gì thay đổi"}), 400
            
        params.append(u_id)
        cursor.execute(f"UPDATE users SET {', '.join(updates)} WHERE id = ?", params)
        conn.commit()
        conn.close()
        
        if full_name:
            session['full_name'] = full_name
            
        return jsonify({"success": True, "message": "Cập nhật thành công"})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

@app.route('/api/user/upload_avatar', methods=['POST'])
@login_required
def upload_avatar():
    try:
        if 'file' not in request.files:
            return jsonify({"success": False, "message": "Không tìm thấy file"}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({"success": False, "message": "Tên file rỗng"}), 400
        
        # Tạo thư mục nếu chưa có
        avatar_dir = os.path.join(app.static_folder, 'uploads', 'avatars')
        os.makedirs(avatar_dir, exist_ok=True)
        
        # Lưu file với tên dựa trên user_id và timestamp
        u_id = session.get('user_id')
        ext = os.path.splitext(file.filename)[1].lower()
        if ext not in ['.jpg', '.jpeg', '.png', '.gif']:
            return jsonify({"success": False, "message": "Định dạng file không hỗ trợ"}), 400
            
        filename = f"avatar_{u_id}_{int(time.time())}{ext}"
        filepath = os.path.join(avatar_dir, filename)
        file.save(filepath)
        
        # Trả về URL đường dẫn tĩnh
        url_path = f"/static/uploads/avatars/{filename}"
        return jsonify({"success": True, "avatar_url": url_path})
        
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

# Quan ly lich su chat theo session (luu trong bo nho server)
chat_sessions = {}

@app.route('/api/chatbot/chat', methods=['POST'])
@login_required
def chatbot_chat():
    if not brain:
        return jsonify({"reply": "AI Assistant hiện đang bảo trì. Vui lòng thử lại sau."})
    
    data = request.json
    message = data.get('message')
    reset = data.get('reset', False)
    
    if not message:
        return jsonify({"reply": "Tôi có thể giúp gì cho bạn?"})
        
    # Lay hoac tao session_id rieng cho chat
    if 'chat_sid' not in session:
        session['chat_sid'] = str(uuid.uuid4())
    
    sid = session['chat_sid']
    if sid not in chat_sessions:
        chat_sessions[sid] = []
    
    try:
        user_name = session.get('full_name', 'Bảo vệ')
        context_msg = f"(User: {user_name}) {message}"
        
        # Pass session_history vao brain.chat
        reply = brain.chat(context_msg, chat_sessions[sid], reset=reset)
        
        # Gioi han lich su (giu 20 messages gan nhat de tranh day ram)
        if len(chat_sessions[sid]) > 20:
            chat_sessions[sid] = chat_sessions[sid][-20:]
            
        return jsonify({"reply": reply})
    except Exception as e:
        return jsonify({"reply": f"Lỗi hệ thống: {str(e)}"}), 500

@app.route('/api/chatbot/report', methods=['GET'])
@login_required
def chatbot_report():
    if not brain:
        return jsonify({"error": "AI Report không khả dụng."}), 503
        
    try:
        # Mặc định lấy báo cáo 8 tiếng gần nhất (ca trực)
        end = datetime.now()
        start = end - timedelta(hours=8)
        
        shift_name = request.args.get('shift', 'Ca trực hiện tại')
        guard_name = session.get('full_name', 'Nhân viên trực')
        
        report = brain.generate_shift_report(
            shift_start=start,
            shift_end=end,
            shift_name=shift_name,
            guard_name=guard_name
        )
        return jsonify({"report": report})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5010, debug=False)