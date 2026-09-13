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

## ⚙️ Hướng dẫn Cài đặt & Sử dụng

### Yêu cầu hệ thống
1. Windows 10/11 với Python 3.9 trở lên.
2. Microsoft SQL Server (Đã cài đặt DB `DAN_AnNinh`).
3. (Tùy chọn) Máy tính có GPU để inference AI tốc độ cao (ONNX CUDA Execution Provider).

### Cài đặt môi trường
Đầu tiên, clone/download mã nguồn về máy:

#### 1. Môi trường Web/Backend (Python)
```bash
# Tạo môi trường ảo (Virtual Environment)
python -m venv venv
venv\Scripts\activate

# Cài đặt các thư viện yêu cầu
pip install flask pyodbc opencv-python numpy onnxruntime pillow scikit-learn ultralytics insightface google-genai pymupdf flask_cors
```

#### 2. Môi trường Mobile (React Native / Expo)
Yêu cầu: Máy tính cần cài đặt [Node.js](https://nodejs.org/).
```bash
# Chuyển vào thư mục mobile
cd mobile

# Cài đặt các gói thư viện
npm install
```

### Thiết lập Database & Model AI
1. **Model InsightFace:** Hệ thống dùng model `buffalo_l`. Lần chạy đầu tiên sẽ tự động tải model này lưu tại thư mục `C:\Users\<TênUser>\.insightface\models`.
2. **Model Behavior:** File `behavior_face.pt` phải nằm trong cùng thư mục `website/backend/`.
3. **Database:** Mở SQL Server, tạo cơ sở dữ liệu `DAN_AnNinh` và đảm bảo chuỗi kết nối trong `get_db_connection` tại `app.py` và `chatbot.py` trùng hợp với tên `Server` của bạn.

### Khởi động hệ thống
Bạn có thể tự chạy qua terminal hoặc dùng file batch tạo sẵn:

#### 1. Khởi động Web/Backend
```bash
python website\backend\app.py

##hoặc

.\venv\Scripts\python.exe website\backend\app.py
```
Trình duyệt sẽ mở tại: [http://localhost:5000](http://localhost:5000)

#### 2. Khởi động Mobile App (Android/iOS)
Mở một cửa sổ Terminal mới:
```bash
cd mobile

# Khởi động Expo Server
npm start

# Hoặc khởi động và mở luôn trên máy ảo/thiết bị Android
npm run android
```
*(Lưu ý: Bạn có thể cài ứng dụng **Expo Go** trên điện thoại để quét mã QR chạy thử)*

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
