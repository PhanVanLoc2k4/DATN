-- =========================================================
-- CƠ SỞ DỮ LIỆU: WebAnNinh
-- Hệ thống quản lý và giám sát sự kiện an ninh
-- =========================================================

USE master;
GO

CREATE DATABASE WebAnNinh;
GO

USE WebAnNinh;
GO


-- =========================================================
-- 1. DANH MỤC NGƯỜI DÙNG & NHÂN VIÊN
-- =========================================================

-- 1.1 Bảng vai trò
CREATE TABLE roles (
    role_id INT IDENTITY(1,1) PRIMARY KEY,
    role_name NVARCHAR(50) NOT NULL UNIQUE,
    description NVARCHAR(255)
);
GO


-- 1.2 Bảng tài khoản người dùng
CREATE TABLE users (
    user_id INT IDENTITY(1,1) PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role_id INT NOT NULL,
    created_at DATETIME DEFAULT GETDATE(),
    is_active BIT DEFAULT 1,

    CONSTRAINT FK_Users_Roles
        FOREIGN KEY (role_id)
        REFERENCES roles(role_id)
);
GO


-- 1.3 Bảng nhân viên an ninh
CREATE TABLE security_staff (
    staff_id INT IDENTITY(1,1) PRIMARY KEY,
    user_id INT UNIQUE NOT NULL,
    full_name NVARCHAR(100) NOT NULL,
    phone_number VARCHAR(15),
    shift_preference NVARCHAR(50),
    status NVARCHAR(50) DEFAULT N'Đang làm việc',

    CONSTRAINT FK_Staff_Users
        FOREIGN KEY (user_id)
        REFERENCES users(user_id)
);
GO


-- =========================================================
-- 2. QUẢN LÝ CAMERA & KHU VỰC
-- =========================================================

-- 2.1 Bảng khu vực giám sát
CREATE TABLE camera_zones (
    zone_id INT IDENTITY(1,1) PRIMARY KEY,
    zone_name NVARCHAR(100) NOT NULL,
    description NVARCHAR(255)
);
GO


-- 2.2 Bảng camera
CREATE TABLE cameras (
    camera_id INT IDENTITY(1,1) PRIMARY KEY,
    camera_name NVARCHAR(100) NOT NULL,
    rtsp_url VARCHAR(255) NOT NULL,
    zone_id INT NOT NULL,
    resolution VARCHAR(50),
    status NVARCHAR(50) DEFAULT N'Hoạt động',

    CONSTRAINT FK_Cameras_Zones
        FOREIGN KEY (zone_id)
        REFERENCES camera_zones(zone_id)
);
GO


-- =========================================================
-- 3. QUẢN LÝ DANH TÍNH & KHUÔN MẶT
-- =========================================================

-- 3.1 Bảng danh tính
CREATE TABLE identities (
    identity_id INT IDENTITY(1,1) PRIMARY KEY,
    identifier_code VARCHAR(50) UNIQUE NOT NULL,
    full_name NVARCHAR(100) NOT NULL,
    person_type NVARCHAR(50) NOT NULL,
    department NVARCHAR(100),
    created_at DATETIME DEFAULT GETDATE()
);
GO


-- 3.2 Bảng vector khuôn mặt
CREATE TABLE face_embeddings (
    embedding_id INT IDENTITY(1,1) PRIMARY KEY,
    identity_id INT NOT NULL,
    embedding_vector NVARCHAR(MAX) NOT NULL,
    image_url VARCHAR(255),
    created_at DATETIME DEFAULT GETDATE(),

    CONSTRAINT FK_Embeddings_Identities
        FOREIGN KEY (identity_id)
        REFERENCES identities(identity_id)
        ON DELETE CASCADE
);
GO


-- =========================================================
-- 4. SỰ KIỆN AI & CẢNH BÁO
-- =========================================================

-- 4.1 Bảng loại sự kiện
CREATE TABLE event_types (
    event_type_id INT IDENTITY(1,1) PRIMARY KEY,
    event_name NVARCHAR(100) NOT NULL UNIQUE,
    default_alert_level NVARCHAR(50) NOT NULL
);
GO


-- 4.2 Bảng sự kiện phát hiện
CREATE TABLE detection_events (
    event_id INT IDENTITY(1,1) PRIMARY KEY,

    event_code VARCHAR(50) UNIQUE NOT NULL,

    event_type_id INT NOT NULL,
    camera_id INT NOT NULL,
    zone_id INT NOT NULL,

    detected_at DATETIME DEFAULT GETDATE(),

    alert_level NVARCHAR(50) NOT NULL
        CHECK (
            alert_level IN (
                N'Mức 1 - Thông tin',
                N'Mức 2 - Cảnh báo',
                N'Mức 3 - Khẩn cấp'
            )
        ),

    confidence_score DECIMAL(5,2) NOT NULL,

    primary_evidence_url VARCHAR(255),

    processing_status NVARCHAR(50)
        DEFAULT N'mới'
        CHECK (
            processing_status IN (
                N'mới',
                N'đang xử lý',
                N'đã xử lý',
                N'cảnh báo sai'
            )
        ),

    handled_by_staff_id INT NULL,

    notes NVARCHAR(MAX),

    CONSTRAINT FK_Events_EventTypes
        FOREIGN KEY (event_type_id)
        REFERENCES event_types(event_type_id),

    CONSTRAINT FK_Events_Cameras
        FOREIGN KEY (camera_id)
        REFERENCES cameras(camera_id),

    CONSTRAINT FK_Events_Zones
        FOREIGN KEY (zone_id)
        REFERENCES camera_zones(zone_id),

    CONSTRAINT FK_Events_Staff
        FOREIGN KEY (handled_by_staff_id)
        REFERENCES security_staff(staff_id)
);
GO


-- 4.3 Bảng cầu nối giữa sự kiện và danh tính
CREATE TABLE event_involved_persons (
    event_id INT NOT NULL,
    identity_id INT NOT NULL,

    confidence_score DECIMAL(5,2),

    PRIMARY KEY (event_id, identity_id),

    CONSTRAINT FK_Involved_Events
        FOREIGN KEY (event_id)
        REFERENCES detection_events(event_id)
        ON DELETE CASCADE,

    CONSTRAINT FK_Involved_Identities
        FOREIGN KEY (identity_id)
        REFERENCES identities(identity_id)
        ON DELETE CASCADE
);
GO


-- 4.4 Bảng lịch sử cảnh báo
CREATE TABLE alert_logs (
    log_id INT IDENTITY(1,1) PRIMARY KEY,

    event_id INT NOT NULL,

    alert_method NVARCHAR(50),

    sent_at DATETIME DEFAULT GETDATE(),

    delivery_status NVARCHAR(50),

    handled_by_staff_id INT NULL,

    CONSTRAINT FK_Alerts_Events
        FOREIGN KEY (event_id)
        REFERENCES detection_events(event_id)
        ON DELETE CASCADE,

    CONSTRAINT FK_Alerts_Staff
        FOREIGN KEY (handled_by_staff_id)
        REFERENCES security_staff(staff_id)
);
GO


-- 4.5 Bảng file minh chứng
CREATE TABLE evidence_files (
    file_id INT IDENTITY(1,1) PRIMARY KEY,

    event_id INT NOT NULL,

    file_path VARCHAR(255) NOT NULL,

    file_type NVARCHAR(50) NOT NULL,

    uploaded_at DATETIME DEFAULT GETDATE(),

    CONSTRAINT FK_Evidence_Events
        FOREIGN KEY (event_id)
        REFERENCES detection_events(event_id)
        ON DELETE CASCADE
);
GO


-- =========================================================
-- 5. BÁO CÁO & TRỢ LÝ ẢO ASA
-- =========================================================

-- 5.1 Bảng báo cáo ca trực
CREATE TABLE shift_reports (
    report_id INT IDENTITY(1,1) PRIMARY KEY,

    staff_id INT NOT NULL,

    shift_start DATETIME NOT NULL,

    shift_end DATETIME NOT NULL,

    total_events INT DEFAULT 0,

    report_summary NVARCHAR(MAX),

    created_at DATETIME DEFAULT GETDATE(),

    CONSTRAINT FK_ShiftReports_Staff
        FOREIGN KEY (staff_id)
        REFERENCES security_staff(staff_id)
);
GO


-- 5.2 Bảng tài liệu quy trình SOP
CREATE TABLE sop_documents (
    sop_id INT IDENTITY(1,1) PRIMARY KEY,

    event_type_id INT NOT NULL,

    title NVARCHAR(200) NOT NULL,

    content NVARCHAR(MAX) NOT NULL,

    last_updated DATETIME DEFAULT GETDATE(),

    CONSTRAINT FK_SOP_EventTypes
        FOREIGN KEY (event_type_id)
        REFERENCES event_types(event_type_id)
);
GO


-- 5.3 Bảng lịch sử báo cáo do AI hỗ trợ tạo
CREATE TABLE ai_report_logs (
    ai_report_id INT IDENTITY(1,1) PRIMARY KEY,

    report_type NVARCHAR(100),

    generated_content NVARCHAR(MAX) NOT NULL,

    generated_at DATETIME DEFAULT GETDATE(),

    time_frame_start DATETIME,

    time_frame_end DATETIME
);
GO


-- =========================================================
-- 6. DỮ LIỆU KHỞI TẠO MẶC ĐỊNH
-- =========================================================


-- ---------------------------------------------------------
-- 6.1 Khởi tạo vai trò
-- role_id = 1 : Admin
-- role_id = 2 : Bảo vệ
-- ---------------------------------------------------------

SET IDENTITY_INSERT roles ON;
GO

INSERT INTO roles (
    role_id,
    role_name,
    description
)
VALUES
(
    1,
    N'Admin',
    N'Quản trị viên hệ thống'
),
(
    2,
    N'Bảo vệ',
    N'Nhân viên an ninh'
);
GO

SET IDENTITY_INSERT roles OFF;
GO


-- ---------------------------------------------------------
-- 6.2 Khởi tạo tài khoản Admin mặc định
--
-- Username : admin
-- Password : 123
-- Role     : Admin
--
-- Mật khẩu 123 đã được mã hóa bằng bcrypt cost = 12
-- ---------------------------------------------------------

INSERT INTO users (
    username,
    password_hash,
    role_id,
    created_at,
    is_active
)
VALUES (
    'admin',
    '$2b$12$YE5wh0dsb1ZVDL/p7UMepu2gwcyqTk4iK.8UyiLMbV3tNrCtXzgea',
    1,
    GETDATE(),
    1
);
GO


-- =========================================================
-- 7. DỮ LIỆU LOẠI SỰ KIỆN MẶC ĐỊNH
-- =========================================================

INSERT INTO event_types (
    event_name,
    default_alert_level
)
VALUES
(
    N'Người chưa xác minh',
    N'Mức 1 - Thông tin'
),
(
    N'Tụ tập đông người',
    N'Mức 2 - Cảnh báo'
),
(
    N'Đánh nhau',
    N'Mức 3 - Khẩn cấp'
),
(
    N'Vật thể nguy hiểm',
    N'Mức 3 - Khẩn cấp'
);
GO


-- =========================================================
-- 8. INDEX HỖ TRỢ TRUY VẤN
-- =========================================================

CREATE INDEX IX_DetectionEvents_DetectedAt
ON detection_events(detected_at);
GO

CREATE INDEX IX_DetectionEvents_Camera
ON detection_events(camera_id);
GO

CREATE INDEX IX_DetectionEvents_EventType
ON detection_events(event_type_id);
GO

CREATE INDEX IX_DetectionEvents_Status
ON detection_events(processing_status);
GO

CREATE INDEX IX_AlertLogs_Event
ON alert_logs(event_id);
GO

CREATE INDEX IX_EvidenceFiles_Event
ON evidence_files(event_id);
GO

CREATE INDEX IX_FaceEmbeddings_Identity
ON face_embeddings(identity_id);
GO


-- =========================================================
-- 9. KIỂM TRA DỮ LIỆU SAU KHI TẠO
-- =========================================================

PRINT N'============================================';
PRINT N'ĐÃ TẠO CSDL WebAnNinh THÀNH CÔNG';
PRINT N'============================================';
PRINT N'Tài khoản mặc định: admin';
PRINT N'Mật khẩu mặc định : 123';
PRINT N'role_id = 1       : Admin';
PRINT N'role_id = 2       : Bảo vệ';
PRINT N'============================================';
GO


SELECT
    role_id,
    role_name,
    description
FROM roles;
GO


SELECT
    u.user_id,
    u.username,
    u.role_id,
    r.role_name,
    u.is_active,
    u.created_at
FROM users u
INNER JOIN roles r
    ON u.role_id = r.role_id;
GO


SELECT
    event_type_id,
    event_name,
    default_alert_level
FROM event_types;
GO