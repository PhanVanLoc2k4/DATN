# Khôi phục SQL của dự án

`SQLQuery.sql` được khôi phục nguyên bản từ Git HEAD, gồm lệnh tạo cơ sở dữ liệu `WebAnNinh`, 15 bảng và các quan hệ khóa ngoại. Đây là script cấu trúc, không phải bản sao lưu các bản ghi đã có trong SQL Server.

`SQLQuery_update.sql` bổ sung 10 cột hồ sơ người dùng, nhân viên và ngưỡng đám đông theo `website/backend/db_helper.py`, hàm `init_db()`. Script kiểm tra cột trước khi thêm và không xóa dữ liệu.

## Cách dùng trong SQL Server Management Studio

1. Nếu tạo cơ sở dữ liệu mới: chạy `SQLQuery.sql`, kiểm tra thành công, sau đó chạy `SQLQuery_update.sql`.
2. Nếu `WebAnNinh` đã tồn tại: không chạy lại script tạo cơ sở dữ liệu. Chỉ dùng `SQLQuery_update.sql` khi các bảng nền đã có và cần bổ sung cột.
3. Kiểm tra cấu hình kết nối backend trỏ đến đúng cơ sở dữ liệu. Khi khởi động, `init_db()` bổ sung dữ liệu mặc định cho các bảng mà hàm này kiểm tra là rỗng. Cấu hình `INITIAL_ADMIN_PASSWORD` trước lần khởi động tạo tài khoản admin.

## Đối chiếu sơ đồ

Sơ đồ có một số cột tương thích cũ như `users.id`, `users.password`, `cameras.id`, `cameras.api_type`, `cameras.location` không thuộc script gốc hoặc phần bổ sung của `init_db()` hiện tại. Hai script này giữ cấu trúc gốc và phần cập nhật của backend, không tái tạo các cột cũ chỉ dựa trên hình. Tài khoản hiện tại dùng `password_hash`.

Chỉ các file SQL được khôi phục/tạo thêm; chưa thực thi lên SQL Server. Đã kiểm tra tĩnh nội dung, chưa kiểm thử thực thi trên cơ sở dữ liệu mới.
