# DT AI Virtual Office

Module mới của DTApp, mở qua menu **Văn phòng AI 3D** hoặc URL `/#office`. Đây là một nền tảng đang triển khai theo giai đoạn. Đọc [VALIDATION.md](VALIDATION.md) để biết phần nào đã chạy test và phần nào chưa được xác minh trên dịch vụ thật.

## Đã có mã và kiểm thử cục bộ

- Migration 32 bảng PostgreSQL, tenant FK/RLS, private buckets, đăng ký Realtime, RPC cho tổ chức, dự án, queue, approval, ngân sách, task graph.
- Nest REST dùng Supabase JWT của người dùng; RBAC CEO/manager/member/viewer; API validation và rate limit.
- Agent CRUD/config, nhiều role, OpenAI Responses và Anthropic Messages adapters. Không có câu trả lời giả khi thiếu key.
- BullMQ worker với outbox PostgreSQL, checkpoint, tool ledger, CEO approval, giới hạn vòng lặp/context/time, pause/resume/cancel và emergency stop.
- Tool: đọc context/memory, viết tài liệu, ghi nhớ, nhắn agent, đề xuất DAG, ghi/đọc source artifact, chạy Node tests qua runner cách ly, xem budget và hoàn thành bằng receipt.
- Dashboard tiếng Việt, dữ liệu thực, quản lý dự án/nhiệm vụ, approval cards, chat Markdown lưu trữ, báo cáo và chi phí.
- Cảnh R3F với camera isometric/perspective, orbit/zoom/pan, ngày/đêm; nhân vật GLB gốc có animation; lựa chọn nhân viên và fallback mobile.
- Import chat SQLite cũ, UUID xác định, thread/recipient/metadata và timestamps; không có SQLite trong application persistence.

## Chưa nghiệm thu đầy đủ theo master prompt

Chưa chạy thực trên Supabase Cloud, Google OAuth project mới, Redis/BullMQ, provider trả phí hay container Linux vì thiếu môi trường/secrets và Docker daemon chưa chạy. Không coi các bước đó là PASS.

Các hạng mục tiếp theo cần phát triển: toàn bộ chuỗi PM → BA → duyệt PRD → Dev → Tester sửa/retest tự động → PM review → duyệt/deploy; GitHub App/PR/worktree và workspace repository; build frontend/backend có dependency trong sandbox; streaming chat, upload attachments, gửi reply theo thread từ UI, meeting có điều phối lượt phát biểu, notification delivery; UI sửa dependency/membership/budget; policy network theo dự án; backup/restore thực và kiểm thử Electron/thiết bị thật. Hook/status-line, incident mode và desktop tray/widget upstream còn nguyên trong clone tham chiếu, chưa port sang multi-tenant API.

Không gọi cảnh 3D là bộ character animation hoàn chỉnh: GLB low-poly có clip cơ bản; chưa có pathfinding, skeletal walking/IK hay animation họp theo agent events chi tiết. Hiện không tự tạo progress hoặc tự cho nhân viên đi lại để giả công việc.

## Khởi động

1. Thực hiện [INSTALLATION.md](INSTALLATION.md).
2. Mở văn phòng, đăng nhập Google, tạo tổ chức. Tài khoản khởi tạo là CEO.
3. Thêm provider trong Cài đặt. Đặt key trong môi trường worker; **không gửi key qua chat**.
4. Tuyển nhân viên và cấu hình model ID, giá input/output, tool allowlist. Có thể áp `supabase/seed-office.sql` để tạo 5 role mẫu sau khi đã tạo tổ chức thực.
5. Tạo dự án và budget, giao task cho nhân viên, nhập acceptance criteria và nhấn Bắt đầu. Chưa cấu hình agent/provider hoặc dependency chưa xong sẽ bị từ chối.
6. CEO đọc chính xác tool/input trong approval card rồi duyệt hoặc từ chối. Run chưa có receipt không được đánh dấu hoàn thành.

Nhân viên Developer cần `write_artifact`; Tester cần `read_artifacts`, `run_tests` và `complete_task`. PM cần `create_tasks`, `write_document`, `complete_task`. BA/Kế toán cần `write_document` để lưu kết quả. Cấp `read_context` theo nhu cầu; mặc định chỉ cấp tối thiểu. Runner hiện chỉ hỗ trợ Node built-in tests `.test.mjs`/`.test.js`, không cài npm packages từ Internet.

Xem [DEVELOPMENT.md](DEVELOPMENT.md), [PRODUCTION.md](PRODUCTION.md) và [TROUBLESHOOTING.md](TROUBLESHOOTING.md).
