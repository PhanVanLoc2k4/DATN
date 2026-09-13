# Phát triển ứng dụng Web, Mobile quản lý và giám sát sự kiện an ninh trong trường đại học

**SpectraGuard** là một hệ thống giám sát an ninh toàn diện tích hợp Trí tuệ Nhân tạo (Smart Security Camera Dashboard). Hệ thống kết hợp sức mạnh của Thị giác Máy tính (Computer Vision) để nhận diện khuôn mặt, phát hiện hành vi bạo lực và Trí tuệ Nhân tạo Tạo sinh (Generative AI) để hỗ trợ nghiệp vụ an ninh nhanh chóng, tự động hóa quy trình báo cáo.

---

## 🌟 Các tính năng nổi bật

### 1. Phân tích Hình ảnh / Video Trực tiếp (Computer Vision)
- **Nhận diện khuôn mặt (Face Recognition):** Tích hợp công nghệ *InsightFace* kết hợp *YOLO*, cho phép trích xuất đặc trưng khuôn mặt (embeddings) và đối chiếu với cơ sở dữ liệu trong thời gian thực. Bắt diện mạo nhanh ngay cả khi đối tượng di chuyển.
- **Phát hiện hành vi bất thường (Behavior Detection):** Nhận diện hành vi đánh nhau, xô xát bằng cách tính toán vector chuyển động, mức độ chồng lấn (IoU) và heuristics từ *YOLO*.
- **Quản lý Camera Động:** Hệ thống cho phép thêm mới Camera từ giao diện web (bằng cách upload tệp video hoặc cấu hình luồng trực tiếp) và tự động chỉ định Model AI phù hợp (Face/Behavior) cấu hình riêng cho từng loại Camera mà không cần khởi động lại.

### 2. Quản lý Danh tính (Identity Management)
- Giao diện thân thiện để thêm, sửa, xóa danh tính và cập nhật hình ảnh nhận diện của các cá nhân (Sinh viên, Cán bộ giảng viên, ...).
- Liên kết trực tiếp giữa ảnh khuôn mặt với thông tin MSSV, Lớp từ SQL Database.

### 3. Trợ lý An ninh Thông minh ASA (AI Security Assistant)
- **Tích hợp Gemini 2.5 Flash:** Một Chatbot "Bộ não An ninh" (ASA Brain) đóng vai trò như một Thiếu tá An ninh.
- **Tư vấn & Cảnh báo:** Trả lời các nghiệp vụ bảo vệ dựa trên tài liệu (Ví dụ: `security_procedures.txt`) kết hợp truy vấn dữ liệu theo thời gian thực từ SQL Server.
- **Lập báo cáo ca trực (Shift Auto-Report):** Chỉ bằng 1 cú click, AI tự động đánh giá mức độ vi phạm, quét qua hàng loạt sự kiện trong ca và tạo báo cáo giao ca chi tiết, chuyên nghiệp.

### 4. Hệ thống Dashboard & Báo cáo Giao diện Trực quan
- Thống kê trực quan số lượng sự kiện, đối tượng vi phạm.
- Biểu đồ phân bổ vi phạm theo giờ, theo ngày và theo camera.
- Lịch sử vi phạm ghi lại ảnh cắt sự cố, chi tiết các cá nhân liên quan.

---

## 🛠️ Công nghệ sử dụng (Tech Stack)

### **Backend**
- **Ngôn ngữ:** Python 3.9+
- **Web Framework:** Flask
- **Trí tuệ nhân tạo (AI & GenAI):**
  - *Ultralytics YOLO* (Object tracking & Behavior classification)
  - *InsightFace* (Buffalo_L Model - Face Landmarks & Embedding)
  - *Google Gemini SDK* (Generative AI cho ASA Brain Chatbot)
- **Xử lý số liệu & ảnh:** OpenCV, NumPy, Pillow, Scikit-learn
- **Giao tiếp CSDL:** PyODBC

### **Frontend**
- HTML5, CSS3, JavaScript (Fetch API) không phụ thuộc Framework lớn, giúp hệ thống tải nhanh và phản hồi tức thì.
- Giao diện Dark-mode mang xu hướng bảo mật/cyber security thân thiện, dễ nhìn vào ban đêm.

### **Cơ sở dữ liệu**
- **Microsoft SQL Server (ODBC Driver 17/18)**.

---

## ⚙️ HƯỚNG DẪN CÀI ĐẶT THƯ VIỆN & CHẠY HỆ THỐNG

> 📘 **HƯỚNG DẪN CHI TIẾT:** Xem file [HUONG_DAN_CAI_DAT.md](file:///d:/22050044_PhanVanLoc/Source_code/HUONG_DAN_CAI_DAT.md) để xem chi tiết cách cài đặt từng bước từ A-Z.

### 📋 Tóm tắt các bước cài đặt nhanh (Quickstart)

#### 1. Khởi tạo Cơ sở dữ liệu (SQL Server)
- Mở **SQL Server Management Studio (SSMS)**.
- Chạy file script [`WebAnNinh.sql`](file:///d:/22050044_PhanVanLoc/Source_code/WebAnNinh.sql) để khởi tạo Database `WebAnNinh` cùng tất cả các bảng dữ liệu.

#### 2. Cài đặt Backend & AI Engine (Python)
Mở Terminal tại thư mục `Source_code`:
```bash
# Tạo và kích hoạt môi trường ảo
python -m venv venv
.\venv\Scripts\activate

# Cài đặt tất cả thư viện Python
pip install -r requirements.txt
```

#### 3. Cài đặt Mobile App (React Native / Expo)
Mở Terminal mới tại thư mục `Source_code`:
```bash
# Di chuyển vào thư mục mobile
cd mobile

# Cài đặt thư viện Node.js
npm install
```

#### 4. Khởi chạy hệ thống

**Chạy Web Backend & AI Engine:**
```bash
# Tại thư mục Source_code (đã kích hoạt venv)
python website/backend/app.py
```
👉 Trình duyệt sẽ mở tại địa chỉ: [http://localhost:5000](http://localhost:5000)

**Chạy Mobile App (Bảo vệ):**
```bash
# Tại thư mục mobile
npm start
```
👉 Dùng ứng dụng **Expo Go** trên điện thoại Android/iOS quét mã QR để khởi chạy app.

---

### 🔑 Tài khoản mặc định

| Hệ thống | Đường dẫn / Ứng dụng | Tài khoản (Username) | Mật khẩu (Password) |
|---|---|---|---|
| **Web Dashboard** | `http://localhost:5000/login` | `admin` | `123` |
| **Mobile App** | App Bảo vệ (Expo Go) | `bv1` | `123` |

---

## 🗂️ Cấu trúc thư mục định tuyến

```text
DAN_PHAN_VAN_LOC/
├── website/
│   ├── frontend/            # Giao diện cho Web app
│   │   ├── static/          # CSS, JS, Logos
│   │   ├── (html files)     # dashboard, analytics, login, v.v
│   │
│   ├── backend/
│   │   ├── app.py           # Core Web Server & Logic nhận diện YOLO + Face
│   │   ├── chatbot.py       # Trí tuệ nhân tạo Gemini (ASA Brain)
│   │   ├── yolo*.pt         # File mô hình YOLO Train sẵn
│   │   └── stable_tracker.yaml # Tracking config file (BoTSORT)
│
├── docs/                    # Tài liệu nghiệp vụ bảo vệ (.txt, .pdf)
├── dataset/                 # Dữ liệu ảnh training YOLO & GAN (nếu có)
├── mobile/                  # Ứng dụng di động (dành cho người dùng/bảo vệ)
├── model/                   # Thư mục lưu trữ các file mô hình định dạng ONNX/PT
├── src/                     # Source code test, scripts tiện ích bổ sung
└── README.md                # Tài liệu dự án
```
### Tài khoản admin
tài khoản: admin
mật khẩu: [123]

### Tài khoản android có sẳn cho bảo vệ
tài khoản: bv1
mật khẩu: [123]
---

*Dự án thực hiện cho đồ án hệ thống ứng dụng AI.*
