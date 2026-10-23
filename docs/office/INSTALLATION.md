# Cài đặt an toàn

Yêu cầu: Node 24, npm, Supabase project staging và Google Auth provider; Redis 7; Docker Linux cho runner. Dùng project Supabase riêng hoặc cùng project DTApp. Office có phiên Auth riêng, không dùng quyền app_users của Poster để thay thế quyền CEO trong tổ chức.

```powershell
npm ci
Copy-Item .env.example .env
npm run office:build
```

Nếu đã có `.env`, bổ sung các biến `OFFICE_*` thay vì ghi đè. File này bị Git bỏ qua. Nhập secrets trực tiếp trong editor local hoặc secret manager; không dán vào chat, không đưa vào `VITE_*`.

- `OFFICE_SUPABASE_URL`, `OFFICE_SUPABASE_ANON_KEY`: URL + publishable/anon key của cùng project.
- `OFFICE_SUPABASE_SERVICE_KEY`: server secret/service_role chỉ dùng worker và import. API dùng anon key + user JWT.
- `OFFICE_OPENAI_KEY` hoặc `OFFICE_ANTHROPIC_KEY`: key của provider được chọn.
- `OFFICE_REDIS_URL`: Redis private endpoint.
- `OFFICE_RUNNER_TOKEN`: random ít nhất 32 ký tự, giống nhau trên worker và runner; không dùng lại provider key.
- `VITE_OFFICE_SUPABASE_URL`, `VITE_OFFICE_SUPABASE_ANON_KEY`: cấu hình công khai tùy chọn; có thể nhập trên màn hình kết nối. `VITE_OFFICE_API_URL` để trống cho same-origin proxy; desktop đặt URL HTTPS của API.

## Database

Chạy `supabase/migrations/20261023000000_virtual_office.sql` trên **project staging** qua SQL Editor hoặc Supabase CLI. Với cùng project DTApp, áp sau các migration cũ. Với project riêng, Office migration tự chứa và chỉ cần schema Auth/Storage do Supabase cung cấp. Không chạy lại một migration đã áp; quản lý bằng migration history. Không dùng `db reset` trên database đang có dữ liệu.

Bật Google provider và redirect allowlist cho URL ứng dụng. Office từ chối phiên anonymous. Bật Realtime cho các bảng trong publication nếu deployment không có publication `supabase_realtime` lúc migrate. Bucket office-documents và office-artifacts là private.

## Development

```powershell
# Terminal 1
npm run office:dev
# Terminal 2 (cần Redis và secrets)
npm run office:worker
# Terminal 3
npm run dev
```

Mở `http://127.0.0.1:5173/#office`. Vite proxy `/api/office` sang 8790, API ảnh cũ `/api` sang 8787. Vẫn chạy `npm run server` để dùng xóa nền/vision của Poster như trước. Docker hướng dẫn ở PRODUCTION.md. Không chạy `infra/office/runner.mjs` trực tiếp trên Windows hoặc host API; script có guard yêu cầu Linux container.

Trong môi trường sandbox hiện tại, npm shim PATH bị hỏng; có thể chạy `node "C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js" run office:test` thay `npm run office:test`. Không cần thay npm global của người dùng.
