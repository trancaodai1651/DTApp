# Linux / Proxmox deployment và backup

Triển khai trước trên Linux VM staging trong Proxmox, có Docker Compose v2, 4 CPU/8 GB RAM khuyến nghị ban đầu. Supabase Cloud là database/Auth/Storage bên ngoài. Chưa xác nhận deployment trên máy hiện tại: Docker daemon không chạy.

1. Cấu hình `.env` và áp migration staging theo INSTALLATION.md.
2. Đặt `OFFICE_ALLOWED_ORIGINS` bằng origin HTTPS thật; không dùng wildcard. Chỉ publish loopback cổng 8080 ở reverse proxy host.
3. Chạy `docker compose --env-file .env config --quiet` để xác minh cấu hình mà không in secrets. Không đưa output `docker compose config` đầy đủ lên chat/log công khai.
4. Chạy `docker compose up -d --build`, rồi `docker compose ps`. Web nằm ở `127.0.0.1:8080/#office`. Kiểm tra API health tại `/api/office/health`. Health endpoint là liveness/configuration flag, không chứng minh toàn bộ Supabase/provider hoạt động.
5. Đặt Caddy/Nginx/Traefik ngoài stack để terminate HTTPS và proxy tới `127.0.0.1:8080`. Nếu proxy ở VM khác, chỉ mở cổng qua private interface/firewall cụ thể.
6. Smoke test bằng hai tài khoản/tổ chức: đăng nhập → tạo project/agent/config → task → provider → CEO duyệt tool → artifact → test receipt → usage. Xác minh RLS/Realtime/Storage trên hosted Supabase trước khi mở cho người dùng.

API/worker chạy non-root, read-only filesystem. Redis chỉ ở mạng private và có volume `redis-data`, AOF + noeviction. Runner có controller giới hạn capability SETUID/SETGID/KILL để tạo mỗi test process bằng UID riêng; code agent chạy non-root, env được lọc, PID/time/output/RAM/CPU limit. Runner chỉ nằm ở mạng sandbox internal; worker là service duy nhất nối sandbox với backend và không mở listener. Không mount Docker socket, filesystem host hoặc provider/database credentials vào runner. Chưa pentest hoặc xác minh container thực; không gọi sandbox này đạt chứng nhận an toàn production.

Stack này phục vụ module Office và frontend DTApp. Server xử lý ảnh của Poster vẫn chạy riêng theo README gốc; client phải cấu hình URL và token server đó. Chưa đóng gói service U²-Net vào Compose Office. Không thay thế server Poster hiện có khi triển khai stack này.

## Backup / restore

- Dùng Supabase backup/PITR phù hợp gói thuê; xuất schema và data định kỳ bằng `pg_dump --format=custom` qua database connection có quyền backup. Credential lấy từ secret manager, không đặt trong shell history hay command-line URL.
- Backup storage.objects metadata không thay thế file bucket: sao lưu các object office-documents/office-artifacts cùng checksum/path ra nơi riêng, có retention và mã hóa.
- Snapshot Redis volume/AOF hỗ trợ queue recovery, nhưng PostgreSQL runs/checkpoints/tool ledger mới là nguồn dữ liệu chính.
- Restore database và Storage vào project staging mới trước; kiểm tra migrations, FK, counts, RLS hai tenant, signed URLs và Realtime. Chạy integration/smoke lại; chỉ đổi DNS/env sau khi CEO duyệt.
- Tắt worker trong quá trình restore. Run bị gián đoạn có tool `running` hoặc reservation chưa settle phải đối chiếu provider/artifact/executor; không tự phát lại hoặc xóa reservation.

Backup/restore strategy này chưa được diễn tập trên Supabase Cloud. Ghi runbook và bằng chứng restore trước khi nghiệm thu production.
