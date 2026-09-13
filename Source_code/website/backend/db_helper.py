import os
import sys
import io
import cv2
import numpy as np
from datetime import datetime
from PIL import Image, ImageDraw, ImageFont
from urllib.parse import quote_plus
from sqlalchemy import create_engine
from dotenv import load_dotenv
from flask import session
from werkzeug.security import generate_password_hash

# Fix encoding cho Windows terminal tránh lỗi UnicodeEncodeError khi print emoji
if sys.platform == "win32":
    try:
        if hasattr(sys.stdout, 'reconfigure'):
            sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        if hasattr(sys.stderr, 'reconfigure'):
            sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

load_dotenv()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.abspath(os.path.join(BASE_DIR, '..', 'frontend'))
UPLOAD_DIR = os.path.join(FRONTEND_DIR, 'static', 'uploads', 'violations')
if not os.path.exists(UPLOAD_DIR):
    os.makedirs(UPLOAD_DIR)

db_engine = None

def create_db_engine():
    global db_engine
    env_server = os.getenv("DB_SERVER", "localhost")
    database = os.getenv("DB_DATABASE", "WebAnNinh")
    username = os.getenv("DB_USERNAME", "sa")
    password = os.getenv("DB_PASSWORD")
    if not password and os.getenv("DB_USERNAME"):
        raise RuntimeError("DB_PASSWORD must be set when DB_USERNAME is configured")
    password = password or "123"
    
    servers = [env_server]
    for fallback_srv in ["localhost", "127.0.0.1", r".\SQLEXPRESS", r"localhost\SQLEXPRESS"]:
        if fallback_srv not in servers:
            servers.append(fallback_srv)
            
    drivers = [
        '{ODBC Driver 17 for SQL Server}',
        '{ODBC Driver 18 for SQL Server}',
        '{SQL Server}',
        '{ODBC Driver 13 for SQL Server}'
    ]
    
    for srv in servers:
        for driver in drivers:
            # Thử 1: SQL Authentication (Username / Password)
            try:
                connection_params = f"DRIVER={driver};SERVER={srv};DATABASE={database};UID={username};PWD={password};TrustServerCertificate=yes;"
                connection_url = f"mssql+pyodbc:///?odbc_connect={quote_plus(connection_params)}"
                
                engine = create_engine(
                    connection_url,
                    pool_size=10,
                    max_overflow=20,
                    pool_timeout=30,
                    pool_recycle=1800,
                )
                with engine.connect() as conn:
                    print(f"✅ Kết nối Database thành công bằng: {driver} trên server: {srv}")
                    db_engine = engine
                    return engine
            except Exception as e:
                pass

            # Thử 2: Windows Authentication (Trusted_Connection)
            try:
                connection_params = f"DRIVER={driver};SERVER={srv};DATABASE={database};Trusted_Connection=yes;TrustServerCertificate=yes;"
                connection_url = f"mssql+pyodbc:///?odbc_connect={quote_plus(connection_params)}"
                
                engine = create_engine(
                    connection_url,
                    pool_size=10,
                    max_overflow=20,
                    pool_timeout=30,
                    pool_recycle=1800,
                )
                with engine.connect() as conn:
                    print(f"✅ Kết nối Database (Windows Auth) thành công bằng: {driver} trên server: {srv}")
                    db_engine = engine
                    return engine
            except Exception as e:
                pass
            
    print("❌ Không thể kết nối tới SQL Server bằng bất kỳ driver hoặc phương thức nào.")
    return None

db_engine = create_db_engine()

def get_db_connection():
    global db_engine
    if db_engine is None:
        db_engine = create_db_engine()
    if db_engine is None:
        raise Exception("Không thể khởi tạo Database Engine. Vui lòng kiểm tra cấu hình .env và Driver ODBC.")
    return db_engine.raw_connection()

def preserve_weapon_details(enriched_identities, identities, violation_type, objs):
    import re
    source = ' '.join([str(identities or ''), str(violation_type or '')] + [
        str(obj.get(key, '')) for obj in objs for key in ('name', 'vtype', 'status')
    ])
    weapons = [name for name in ('Súng', 'Dao', 'Gậy')
               if re.search(r'(?<!\w)' + re.escape(name) + r'(?!\w)', source, re.IGNORECASE)]
    text = str(enriched_identities or '')
    missing = [name for name in weapons
               if not re.search(r'(?<!\w)' + re.escape(name) + r'(?!\w)', text, re.IGNORECASE)]
    if missing:
        text += ' (Mang ' + ', '.join(missing) + ')'
    return text


def save_violation_to_db(cam_id, violation_type, frame, objs, identities):
    from detector import camera_configs
    try:
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        pil_img = Image.fromarray(frame_rgb)
        draw = ImageDraw.Draw(pil_img)
        
        try:
            font = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 30)
        except:
            font = ImageFont.load_default()

        # Tìm api_type từ cache (camera_configs được quản lý trong bộ nhớ bởi detector.py)
        api_type = camera_configs.get(cam_id, 'face')
        db_id = int(cam_id.replace("cam", ""))

        for obj in objs:
            x1, y1, x2, y2 = obj['bbox']
            if api_type == 'crowd':
                tid = obj.get('track_id')
                label = f"ID: {tid}" if tid is not None else "ID: ?"
                font_offset = 25
            else:
                label = obj.get('name', 'unknown')
                font_offset = 35
            
            if obj.get('is_alert') or obj.get('has_alert'):
                color = (255, 0, 0)  # Màu Đỏ (RGB) - Cảnh báo chính thức
            elif "đang theo dõi" in str(obj.get("status", "")).lower() or "đang xác minh" in str(obj.get("status", "")).lower() or "chưa đủ thời gian" in str(obj.get("status", "")).lower():
                color = (255, 165, 0)  # Màu Cam (RGB) - Đang đếm giây/theo dõi
            else:
                color = (0, 255, 0)  # Màu Xanh (RGB) - Bình thường
            
            draw.rectangle([x1, y1, x2, y2], outline=color, width=5)
            draw.rectangle([x1, y1 - font_offset, x1 + len(label)*14, y1], fill=color)
            draw.text((x1 + 5, y1 - font_offset), label, font=font, fill=(255, 255, 255))

        frame_processed = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
        filename = f"violation_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}.jpg"
        filepath = os.path.join(UPLOAD_DIR, filename)
        cv2.imwrite(filepath, frame_processed)
        
        enriched_identities = identities
        if identities and identities != "unknown":
            name_list = [n.strip() for n in identities.split(",")]
            enriched_list = []
            
            conn = get_db_connection()
            cursor = conn.cursor()
            for n in name_list:
                clean_name = n.replace('🔥', '').replace(' ĐANG ĐÁNH NHAU!', '').strip()
                if ' MANG ' in clean_name:
                    clean_name = clean_name.split(' MANG ')[0].strip()
                elif ' mang ' in clean_name:
                    clean_name = clean_name.split(' mang ')[0].strip()
                clean_name = clean_name.split('(')[0].strip()
                
                if clean_name.lower() in ('người lạ', 'đối tượng người lạ'):
                    enriched_list.append(clean_name)
                    continue
                
                cursor.execute("SELECT identifier_code, department FROM identities WHERE full_name = ?", (clean_name,))
                row = cursor.fetchone()
                if row and (row[0] or row[1]):
                    info = f"{clean_name} ({row[0] or 'N/A'} - {row[1] or 'N/A'})"
                    enriched_list.append(info)
                else:
                    enriched_list.append(n)
            conn.close()
            enriched_identities = ", ".join(enriched_list)

        enriched_identities = preserve_weapon_details(
            enriched_identities, identities, violation_type, objs)

        url_path = f"/static/uploads/violations/{filename}"
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # 1. Tìm thông tin camera và zone_id
        cursor.execute("SELECT camera_name, zone_id FROM cameras WHERE camera_id = ?", (db_id,))
        cam_row = cursor.fetchone()
        if cam_row:
            cam_full_name, zone_id = cam_row[0], cam_row[1]
        else:
            cam_full_name, zone_id = cam_id, 1 # Fallback
            
        # 2. Ánh xạ loại sự kiện sang event_type_id
        v_type_lower = violation_type.lower()
        if api_type == 'face':
            event_name = u'Người lạ'
        elif 'đánh nhau' in v_type_lower or 'gây gổ' in v_type_lower or 'fight' in v_type_lower:
            event_name = u'Đánh nhau'
        elif 'tụ tập' in v_type_lower or 'đông người' in v_type_lower or 'crowd' in v_type_lower:
            event_name = u'Tụ tập đông người'
        elif 'vũ khí' in v_type_lower or 'weapon' in v_type_lower:
            event_name = u'Vũ khí'
        else:
            event_name = u'Người lạ'
            
        cursor.execute("SELECT event_type_id, default_alert_level FROM event_types WHERE event_name = ?", (event_name,))
        et_row = cursor.fetchone()
        if et_row:
            event_type_id, alert_level = et_row[0], et_row[1]
        else:
            event_type_id, alert_level = 1, u'Mức 1 - Thông tin'
            
        if 'mức cao' in v_type_lower or 'khẩn cấp' in v_type_lower:
            alert_level = u'Mức 3 - Khẩn cấp'
        elif 'mức trung bình' in v_type_lower:
            alert_level = u'Mức 2 - Cảnh báo'
            
        # 3. Tạo mã sự kiện ngẫu nhiên duy nhất
        event_code = f"EVT_{datetime.now().strftime('%Y%m%d%H%M%S')}_{np.random.randint(100, 999)}"
        
        # 4. Ghi nhận sự kiện chính
        cursor.execute(
            """INSERT INTO detection_events 
               (event_code, event_type_id, camera_id, zone_id, alert_level, confidence_score, primary_evidence_url, processing_status, notes, detected_at) 
               VALUES (?, ?, ?, ?, ?, ?, ?, N'mới', ?, GETDATE())""",
            (event_code, event_type_id, db_id, zone_id, alert_level, 0.85, url_path, enriched_identities)
        )
        
        # Lấy event_id vừa insert
        cursor.execute("SELECT @@IDENTITY")
        event_id = int(cursor.fetchone()[0])

        # 4b. Ghi nhận file minh chứng vào bảng evidence_files
        try:
            cursor.execute(
                """INSERT INTO evidence_files (event_id, file_path, file_type, uploaded_at)
                   VALUES (?, ?, N'image', GETDATE())""",
                (event_id, url_path)
            )
            print(f"📷 [DB] Đã lưu ảnh minh chứng thành công vào bảng evidence_files cho event_id {event_id}.")
        except Exception as ex:
            print(f"⚠️ [DB] Lỗi lưu ảnh minh chứng vào bảng evidence_files: {ex}")
        
        # 5. Liên kết involved persons
        if identities and identities != "unknown":
            name_list = [n.strip() for n in identities.split(",")]
            for name in name_list:
                clean_name = name.replace('🔥', '').replace(' ĐANG ĐÁNH NHAU!', '').strip()
                if ' MANG ' in clean_name:
                    clean_name = clean_name.split(' MANG ')[0].strip()
                elif ' mang ' in clean_name:
                    clean_name = clean_name.split(' mang ')[0].strip()
                clean_name = clean_name.split('(')[0].strip()
                c_low = clean_name.lower()
                if not clean_name or c_low in ('unknown', 'người lạ', 'đối tượng người lạ') or 'tụ tập' in c_low or 'đông người' in c_low or 'cảnh báo' in c_low:
                    continue
                    
                cursor.execute("SELECT identity_id FROM identities WHERE full_name = ?", (clean_name,))
                ident_row = cursor.fetchone()
                if ident_row:
                    identity_id = ident_row[0]
                else:
                    # Tạo identity mới
                    identifier_code = f"STU_{datetime.now().strftime('%y%m%d%H%M')}_{np.random.randint(10, 99)}"
                    cursor.execute(
                        "INSERT INTO identities (identifier_code, full_name, person_type, department) VALUES (?, ?, N'Sinh viên', N'Chưa rõ')",
                        (identifier_code, clean_name)
                    )
                    cursor.execute("SELECT @@IDENTITY")
                    identity_id = int(cursor.fetchone()[0])
                    
                # Chèn vào bảng cầu nối event_involved_persons
                try:
                    cursor.execute(
                        "INSERT INTO event_involved_persons (event_id, identity_id, confidence_score) VALUES (?, ?, ?)",
                        (event_id, identity_id, 0.85)
                    )
                except Exception as ex:
                    print(f"Error binding identity to event: {ex}")
                    
        conn.commit()
        conn.close()
        
        return url_path
    except Exception as e:
        print(f"Error saving violation: {e}")
        return None

def init_db():
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Đảm bảo các cột profile mở rộng tồn tại trong security_staff
        cursor.execute("""
            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('security_staff') AND name = 'email')
            BEGIN
                ALTER TABLE security_staff ADD email NVARCHAR(100);
            END
            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('security_staff') AND name = 'dob')
            BEGIN
                ALTER TABLE security_staff ADD dob NVARCHAR(20);
            END
            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('security_staff') AND name = 'avatar_url')
            BEGIN
                ALTER TABLE security_staff ADD avatar_url NVARCHAR(500);
            END
            
            -- Đảm bảo các cột profile mở rộng tồn tại trong users
            IF COL_LENGTH('dbo.users', 'employee_code') IS NULL
                ALTER TABLE dbo.users ADD employee_code NVARCHAR(30) NULL;
            IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('dbo.users') AND name = 'UX_users_employee_code')
                EXEC(N'CREATE UNIQUE INDEX UX_users_employee_code ON dbo.users(employee_code) WHERE employee_code IS NOT NULL');
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
            
            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('cameras') AND name = 'crowd_threshold')
            BEGIN
                ALTER TABLE cameras ADD crowd_threshold INT DEFAULT 8;
            END
            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('cameras') AND name = 'crowd_duration')
            BEGIN
                ALTER TABLE cameras ADD crowd_duration INT DEFAULT 30;
            END
        """)

        # Đảm bảo bảng face_embeddings tồn tại
        cursor.execute("""
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'face_embeddings')
            BEGIN
                CREATE TABLE face_embeddings (
                    embedding_id INT IDENTITY(1,1) PRIMARY KEY,
                    identity_id INT NOT NULL,
                    embedding_vector NVARCHAR(MAX) NOT NULL, 
                    image_url VARCHAR(255), 
                    created_at DATETIME DEFAULT GETDATE(),
                    CONSTRAINT FK_Embeddings_Identities FOREIGN KEY (identity_id) REFERENCES identities(identity_id) ON DELETE CASCADE
                );
            END
        """)
        


        # 2. Seed dữ liệu mặc định: roles
        cursor.execute("SELECT COUNT(*) FROM roles")
        if cursor.fetchone()[0] == 0:
            cursor.execute("INSERT INTO roles (role_name, description) VALUES ('admin', N'Quản trị viên')")
            cursor.execute("INSERT INTO roles (role_name, description) VALUES ('user', N'Nhân viên bảo vệ')")

        # 3. Seed dữ liệu mặc định: users & security_staff
        cursor.execute("SELECT COUNT(*) FROM users")
        if cursor.fetchone()[0] == 0:
            cursor.execute("SELECT role_id FROM roles WHERE role_name = 'admin'")
            admin_role_id = cursor.fetchone()[0]
            cursor.execute(
                "INSERT INTO users (username, password_hash, role_id, is_active) VALUES ('admin', ?, ?, 1)",
                (generate_password_hash(os.getenv('INITIAL_ADMIN_PASSWORD') or '123'), admin_role_id)
            )
            cursor.execute("SELECT @@IDENTITY")
            admin_user_id = int(cursor.fetchone()[0])
            cursor.execute(
                "INSERT INTO security_staff (user_id, full_name, phone_number, status) VALUES (?, N'Administrator', '0123456789', N'Đang làm việc')",
                (admin_user_id,)
            )

        # 4. Seed dữ liệu mặc định: camera_zones
        cursor.execute("SELECT COUNT(*) FROM camera_zones")
        if cursor.fetchone()[0] == 0:
            cursor.execute("INSERT INTO camera_zones (zone_name, description) VALUES (N'Khu vực mặc định', N'Tòa nhà chính')")

        # 5. Seed dữ liệu mặc định: event_types
        cursor.execute("SELECT COUNT(*) FROM event_types")
        if cursor.fetchone()[0] == 0:
            cursor.execute("INSERT INTO event_types (event_name, default_alert_level) VALUES (N'Người lạ', N'Mức 1 - Thông tin')")
            cursor.execute("INSERT INTO event_types (event_name, default_alert_level) VALUES (N'Đánh nhau', N'Mức 2 - Cảnh báo')")
            cursor.execute("INSERT INTO event_types (event_name, default_alert_level) VALUES (N'Tụ tập đông người', N'Mức 2 - Cảnh báo')")
            cursor.execute("INSERT INTO event_types (event_name, default_alert_level) VALUES (N'Vũ khí', N'Mức 3 - Khẩn cấp')")

        # 6. Seed dữ liệu mặc định: cameras
        cursor.execute("SELECT COUNT(*) FROM cameras")
        if cursor.fetchone()[0] == 0:
            cursor.execute("SELECT zone_id FROM camera_zones")
            zone_id = cursor.fetchone()[0]
            cursor.execute("""
                INSERT INTO cameras (camera_name, rtsp_url, zone_id, status)
                VALUES 
                (N'CAM 01 - CỔNG CHÍNH', '/static/videos/hautruong2.mp4', ?, N'Hoạt động'),
                (N'CAM 03 - HÀNH LANG', '/static/videos/scene3.mp4', ?, N'Hoạt động')
            """, (zone_id, zone_id))

        conn.commit()
        conn.close()
        print("✅ Khởi tạo và đồng bộ CSDL thành công.")
    except Exception as e:
        print(f"❌ Lỗi khởi tạo CSDL: {e}")
