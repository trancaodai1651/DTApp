# Kế hoạch triển khai và cổng nghiệm thu

Không gộp “đã viết mã” với “đã xác minh chạy thật”. Mỗi checkpoint ghi files, test chạy, lỗi còn lại và commit trong `docs/office/VALIDATION.md`. Secrets đặt trong `.env`, không gửi qua chat. Không áp migration vào Supabase production khi chưa thử project staging.

| Giai đoạn | Kết quả cần tạo | Cổng nghiệm thu |
|---|---|---|
| 1. Audit | ARCHITECTURE.md, mapping, commit upstream, LICENSE/NOTICE | Clone/đọc source; baseline DTApp build/test; liệt kê chức năng cần giữ |
| 2. Foundation | Module office độc lập; Nest API/worker; configs | Typecheck/lint/build; DTApp vẫn hoạt động |
| 3. Supabase | 32 bảng, RLS, FK tenant, buckets, realtime, seed | Chạy migration trên PostgreSQL; 2 tenant đọc/ghi chéo bị chặn; restore staging |
| 4. SQLite import | Công cụ read-only, deterministic UUID, counts/threads | Import lặp không trùng, đối chiếu từng message/thread; chạy trên DB SQLite thực khi có |
| 5. Auth + agent | JWT, organization bootstrap, CEO/manager RBAC, CRUD | Sai JWT/khác tenant bị từ chối; không dùng service key ở browser |
| 6. Orchestration | Run/checkpoint, provider tool loop, budget, approvals | Tool thực có artifact/log, replay/idempotency, timeout/retry/cancel |
| 7. Projects/tasks | CRUD, phân công, DAG, PM/BA workflow | Cycle/khác project bị chặn, task blocked không chạy, CEO scope approval |
| 8. 3D | Canvas tương tác, nhân vật theo execution state | Orbit/zoom/pan; realtime state; mobile fallback; GLB license/animations |
| 9. Chat/meetings | Persistence, markdown, threads, mentions, attachments, streaming | Gửi/nhận thật, reconnect không trùng, tool/approval card đúng run |
| 10. Finance | Provider usage, reservation, budgets, expenses | Concurrent reservation không vượt ngân sách, không tự khai giá miễn phí |
| 11. Acceptance | Vitest, integration, Playwright + regression | Báo cáo pass/fail riêng local/hosted/provider/container; không bỏ qua test lỗi |
| 12. Deployment | Dockerfiles, Compose, docs Việt, health/backup | Build/start containers, migrate staging, auth→project→agent→tool→approval→artifact |

## Thứ tự xây dựng

Ưu tiên một lát cắt chạy thật: đăng nhập → tạo tổ chức → tạo agent → tạo project/task → run có tool gọi thật → artifact + usage → avatar phản ánh trạng thái. Khả năng chưa hoàn chỉnh không được hiển thị như sẵn sàng production. Giữ UI cũ; không nối legacy hooks chưa xác thực với execution API.

## Các đầu vào môi trường

- Supabase project staging URL, publishable/anon key và server secret; chọn dùng chung DTApp hoặc riêng.
- AI provider key, model ID khả dụng, giá input/output và giới hạn token do chủ tài khoản xác nhận.
- Redis và Docker Linux daemon cho thử nghiệm hàng đợi/runner.
- GitHub App/PAT giới hạn repo, repository cho phép và deployment target staging trước khi mở adapter write/deploy.
- Bộ nhân vật GLB có giấy phép và clips nếu cần hình ảnh sản xuất.

Thông tin không nhạy cảm có thể trả lời trong chat. Key/password phải nhập qua local `.env` hoặc secret manager của deployment; không ghi vào tài liệu, seed, log hay commit.

## Checkpoint hiện tại — 2026-10-23

Audit/kiến trúc đã commit `7cc5aa5`. Schema, typed client, importer, API, engine và kiểm thử foundation đã commit `be1cae8`. UI/3D, cấu hình container và runbooks đã có trong checkpoint tiếp theo. Kết quả cục bộ: 39 Vitest, 8 Playwright (API/Auth fixtures), 9 regression DTApp; typecheck/lint/build thành công.

Các phase còn có cổng nghiệm thu hosted và những tính năng chưa triển khai được liệt kê cụ thể ở `docs/office/README.md` và `docs/office/VALIDATION.md`. Không xem các checkpoint này là hoàn thành toàn bộ master prompt. Bước bắt buộc tiếp theo là secrets/project staging + Docker Linux để xác nhận execution thực trước khi mở rộng chuỗi repository/development/deployment.
