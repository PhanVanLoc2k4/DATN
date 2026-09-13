# 📖 HƯỚNG DẪN CÀI ĐẶT THƯ VIỆN & CHẠY HỆ THỐNG SPECTRA GUARD

Tài liệu này hướng dẫn chi tiết từ A đến Z cách cài đặt môi trường, tạo CSDL và khởi chạy toàn bộ hệ thống (Web Backend, AI Engine và Mobile App).

---

## 📋 THÔNG TIN CHUNG & NGUYÊN LÝ HOẠT ĐỘNG

Hệ thống bao gồm 3 phần chính:
1. **Database Server:** Microsoft SQL Server (Lưu trữ tài khoản, danh tính, log vi phạm, danh sách camera).
2. **Web Backend & AI Engine (Flask + Python):**
   - **Nhận diện khuôn mặt:** InsightFace (`buffalo_l`).
   - **Nhận diện hành vi / Vũ khí:** YOLOv8s + BoTSORT tracking.
   - **AI Assistant:** Google Gemini API (ASA Brain).
   - **Frontend Web Dashboard:** HTML5/CSS3/JavaScript (Dark Mode).
3. **Mobile App (React Native / Expo):** Ứng dụng dành cho lực lượng Bảo vệ nhận cảnh báo tức thời.

---

## 🛠️ YÊU CẦU PHẦN MỀM CẦN CHUẨN BỊ (PREREQUISITES)

Trước khi bắt đầu, hãy đảm bảo máy tính của bạn đã cài đặt các phần mềm sau:

1. **Python 3.9 trở lên (Khuyến nghị 3.10 hoặc 3.11)**
   - Tải tại: [python.org](https://www.python.org/downloads/)
   - ⚠️ **Lưu ý quan trọng:** Khi cài đặt tích chọn **"Add Python to PATH"**.
2. **Node.js (LTS v18 hoặc v20)** *(Dùng cho Mobile App)*
   - Tải tại: [nodejs.org](https://nodejs.org/)
3. **Microsoft SQL Server (2019 / 2022 / Express)**
   - Tải tại: [microsoft.com SQL Server](https://www.microsoft.com/en-us/sql-server/sql-server-downloads)
   - Cài đặt kèm theo **SQL Server Management Studio (SSMS)**.
4. **Microsoft ODBC Driver cho SQL Server**
   - Cần cài `ODBC Driver 17 cho SQL Server` hoặc `ODBC Driver 18 cho SQL Server`.
5. **Ứng dụng Expo Go** *(Dành cho điện thoại Android/iOS)*
   - Tải trên CH Play (Android) hoặc App Store (iOS) để chạy thử Mobile App.

---

## 🗄️ BƯỚC 1: KHỞI TẠO CƠ SỞ DỮ LIỆU (SQL SERVER)

1. Mở **SQL Server Management Studio (SSMS)** và đăng nhập vào SQL Server của bạn.
2. Mở file `WebAnNinh.sql` nằm trong thư mục nguồn `Source_code/WebAnNinh.sql`.
3. Bấm **Execute (F5)** để thực thi script. Script sẽ tự động:
   - Tạo CSDL có tên `WebAnNinh`.
   - Tạo toàn bộ các bảng: `Users`, `LogCanhBao`, `Cameras`, `Identities`, `NhanVien`, `ViPham`,...
   - Thêm sẵn dữ liệu tài khoản mặc định và cấu hình camera ban đầu.

4. **Cấu hình kết nối CSDL trong file `.env`:**
   - Mở file [`website/backend/.env`](file:///d:/22050044_PhanVanLoc/Source_code/website/backend/.env).
   - Kiểm tra và cập nhật các tham số kết nối phù hợp với máy của bạn:
     ```ini
     DB_SERVER=localhost       # Tên Server (VD: localhost, .\SQLEXPRESS hoặc tên máy)
     DB_DATABASE=WebAnNinh     # Tên Database
     DB_USERNAME=sa            # Tài khoản SQL Server (nếu có)
     DB_PASSWORD=123           # Mật khẩu SQL Server (nếu có)
     ```
   - *(Lưu ý: Không cần sửa trực tiếp trong file python `db_helper.py` hay `app.py`)*.

---

## 🐍 BƯỚC 2: CÀI ĐẶT THƯ VIỆN BACKEND & AI (PYTHON)

Mở **Terminal** / **PowerShell** tại thư mục gốc `Source_code`:

### 2.1. Tạo và kích hoạt Môi trường ảo (Virtual Environment)
```bash
# Tạo môi trường ảo venv
python -m venv venv

# Kích hoạt môi trường ảo trên Windows (PowerShell)
.\venv\Scripts\Activate.ps1

# Hoặc trên Command Prompt (cmd)
venv\Scripts\activate.bat
```
*(Sau khi kích hoạt, đầu dòng lệnh sẽ hiện chữ `(venv)`)*

### 2.2. Cài đặt các thư viện cần thiết
```bash
# Nâng cấp pip lên bản mới nhất
python -m pip install --upgrade pip

# Cài đặt tất cả thư viện từ file requirements.txt
pip install -r requirements.txt
```

---

## 📱 BƯỚC 3: CÀI ĐẶT THƯ VIỆN MOBILE APP (NODE.JS / EXPO)

Mở một cửa sổ **Terminal** mới và chuyển vào thư mục `mobile`:

```bash
# Di chuyển vào thư mục mobile
cd mobile

# Cài đặt các gói thư viện Node.js
npm install
```

---

## 🚀 BƯỚC 4: KHỞI ĐỘNG HỆ THỐNG

### 4.1. Khởi chạy Web Backend & AI Engine

Tại cửa sổ Terminal của Backend (đã kích hoạt `venv`):

```bash
# Chạy server Flask
python website/backend/app.py
```

- Khi thấy thông báo `* Running on http://127.0.0.1:5000`, hệ thống Flask và AI Engine đã khởi chạy thành công.
- Mở trình duyệt web bất kỳ và truy cập địa chỉ: [http://localhost:5000](http://localhost:5000)

### 4.2. Khởi chạy Mobile App (Dành cho Bảo vệ)

Tại cửa sổ Terminal của Mobile (thư mục `mobile`):

```bash
# Khởi động Expo Metro Bundler
npm start
```

- Sau khi chạy, màn hình terminal sẽ hiển thị một **mã QR (QR Code)**.
- Mở ứng dụng **Expo Go** trên điện thoại, chọn **Scan QR Code** và quét mã QR trên terminal để chạy ứng dụng trực tiếp trên điện thoại.
- *(Nếu dùng máy ảo Android trên máy tính, gõ phím `a` trong terminal)*.

---

## 🔑 TÀI KHOẢN ĐĂNG NHẬP MẶC ĐỊNH

### 1. Tài khoản Quản trị viên (Web Dashboard)
- **Truy cập:** `http://localhost:5000/login`
- **Tài khoản:** `admin`
- **Mật khẩu:** `123`

### 2. Tài khoản Bảo vệ (Mobile App)
- **Tài khoản:** `bv1`
- **Mật khẩu:** `123`

---

## ❓ CÁC LỖI THƯỜNG GẶP VÀ CÁCH KHẮC PHỤC (TROUBLESHOOTING)

### 1. Lỗi `pyodbc.OperationalError: ('08001', ...)`
- **Nguyên nhân:** Sai tên Server SQL hoặc chưa bật dịch vụ SQL Server.
- **Khắc phục:** Mở **Services.msc** tìm `SQL Server (MSSQLSERVER)` hoặc `SQL Server (SQLEXPRESS)` và chọn **Start/Restart**. Kiểm tra lại tham số Server name trong `db_helper.py`.

### 2. Lỗi `ONNXRuntime / CUDA Execution Provider`
- **Nguyên nhân:** Máy không có GPU NVIDIA hoặc chưa cài CUDA Toolkit.
- **Khắc phục:** Không sao cả! `insightface` và `onnxruntime` sẽ tự động chuyển về chạy trên CPU (CPU Execution Provider) hoàn toàn bình thường.

### 3. Lỗi Mobile App không kết nối được Backend
- **Nguyên nhân:** Điện thoại và máy tính chạy server chưa cùng mạng Wi-Fi, hoặc bị chặn bởi Windows Firewall.
- **Khắc phục:** 
  1. Kết nối điện thoại và máy tính vào **cùng 1 mạng Wi-Fi**.
  2. Tìm IP máy tính (`ipconfig` -> IPv4 Address, ví dụ `192.168.1.10`).
  3. Mở `mobile/services/api.ts` và sửa `configuredUrl` thành `http://192.168.1.10:5000`.

---

🎉 **Chúc mừng! Bạn đã hoàn thành cài đặt và vận hành hệ thống SpectraGuard.**
