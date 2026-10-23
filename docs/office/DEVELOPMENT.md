# Phát triển và kiểm thử

```powershell
npm run typecheck
npm run office:typecheck
npm run lint
npm run office:test
npm test
npm run build
npm run office:e2e
git diff --check
```

`office:test` build API rồi chạy Vitest: PostgreSQL/PGlite migration và RLS thật trong engine WASM, orchestration state machine, provider HTTP contract, SQLite fixture import và compiled Nest HTTP integration. Auth của API integration dùng identity fixture, không xác nhận hosted OAuth. Playwright chạy Chrome desktop và mobile viewport; Supabase/API được fixture để kiểm tra UI/3D/approval/error. Mobile viewport Chromium không tương đương iPhone Safari thật.

Trên Linux cài Chromium bằng `npx playwright install --with-deps chromium`. Trên Windows config dùng Chrome đã cài; có thể đặt `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` đến executable khác. Screenshot/trace ở artifacts/office, test-results và playwright-report (Git bỏ qua).

Sau khi sửa SQL, chạy `npm run office:types`. Generator thực thi SQL trong PostgreSQL trước khi sinh types cho 32 bảng và RPC; frontend và backend có bản types đồng nhất. Tạo migration mới khi schema đã được triển khai; không sửa migration đã áp trên production.

Source map: `apps/office-api/src/controller.ts` (REST/auth/RBAC), `engine.ts` (checkpoint/tool loop), `store.ts` (Supabase persistence), `tools.ts` (tool schemas/evidence), `provider.ts` (provider adapters), `worker.ts` (queue/outbox), `src/office/` (UI/3D), `infra/office/` (container boundary).

## Import SQLite cũ

Sao lưu chat.db (và checkpoint WAL bằng công cụ SQLite phù hợp khi upstream đang chạy). Dùng bản backup, không lấy file đang ghi dở. Công cụ đọc source read-only bằng Node `node:sqlite`; ứng dụng không dùng SQLite.

```powershell
npm run office:import -- --file C:/backup/chat.db --org ORG_UUID --project PROJECT_UUID --source-id claude-office-workstation-01 --dry-run
npm run office:import -- --file C:/backup/chat.db --org ORG_UUID --project PROJECT_UUID --source-id claude-office-workstation-01
```

Giữ nguyên source-id khi chạy lại. Import upsert bằng UUID xác định, không trùng message; kiểm tra count, nội dung, timestamp, metadata và parent của từng batch. Thread root thiếu/cycle làm lệnh thất bại. Import có thể dừng giữa các batch; chạy lại cùng source-id để tiếp tục. Sender/recipient cũ được bảo tồn trong metadata, không tự gán identity người dùng hoặc agent mới. Công cụ hiện chuyển persistence messages của upstream; registry sessions/agents trong file chưa được chuyển thành lịch sử run giả.

Không log nội dung tin nhắn hoặc keys. Chỉ số kết quả in count và quan hệ xác minh. Chưa chạy importer trên database SQLite thực của người dùng vì chưa có file được cung cấp.
