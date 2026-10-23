# Xử lý lỗi

| Hiện tượng | Kiểm tra và xử lý |
|---|---|
| API offline/503 | API Nest 8790 có chạy, URL HTTPS/loopback đúng, Vite/Nginx proxy đúng; cấu hình OFFICE_SUPABASE_URL/ANON_KEY |
| 401 sau Google login | Client và API phải dùng cùng Supabase project; kiểm tra provider/redirect allowlist, đăng xuất và đăng nhập lại |
| 403 hoặc không thấy dữ liệu | Tài khoản phải có organization_members; admin DTApp không tự có quyền CEO tổ chức Office |
| Database rejected / table missing | Áp đúng migration, không dùng project khác hoặc server key trong trình duyệt |
| Task không bắt đầu | Agent có config, provider enabled, dependency đã done, project active, tổ chức không emergency stop, agent chưa có run khác |
| Run mãi queued | Redis/worker không chạy; outbox PostgreSQL còn giữ run, worker quét lại mỗi 5 giây |
| Run waiting_approval | CEO mở nội dung tool/input và duyệt/từ chối. Manager/agent không được tự duyệt |
| Thiếu provider key | Đặt OFFICE_OPENAI_KEY/ANTHROPIC_KEY trên worker và restart; không nhập key vào form hoặc VITE env |
| Model không khả dụng | Nhập model ID do tài khoản provider của bạn cấp quyền; không tự đổi model trong code |
| Budget exhausted / không resume được | Kiểm tra spent + reserved; reservation unknown giữ lại đến khi đối chiếu provider thật. Không xóa chỉ để ép chạy tiếp |
| Tool running khi worker chết | Unknown outcome cần human reconciliation; engine cố ý từ chối replay để tránh tạo tác dụng ngoài lặp |
| Tests không PASS | Chỉ Tester có receipt verified từ runner, exitCode 0, không timeout mới được complete_task. Đọc stdout/stderr thực |
| Runner chưa cấu hình | Dùng container Linux; không chạy code agent trên API/production host. Runner hiện chỉ hỗ trợ Node tests, không cài packages |
| UI không realtime | Kiểm tra publication và RLS. UI refetch mỗi 15 giây và khi reconnect; không dựng trạng thái giả |
| Canvas không hỗ trợ | Dùng chế độ Danh sách; giảm DPR, zoom out. Mobile mặc định danh sách để tiết kiệm pin |
| Playwright WebGL lỗi | Kiểm tra Chrome/Chromium executable và driver/software GL. Không coi có thẻ canvas là đã kiểm tra cảnh render đúng |
| Docker pipe không tồn tại | Khởi động/cài Docker Linux engine hoặc dùng VM Linux. `config --quiet` chỉ kiểm tra YAML, không kiểm chứng container |

Không đưa `.env`, token, Authorization header, provider response chứa bí mật hoặc dữ liệu riêng tư vào issue/log công khai.
