# Nhật ký nghiệm thu Văn phòng AI

## 2026-10-23 — baseline và audit

- Clone Claude-Office thành công, commit `1a9ba71251326b34c3caa90d49468e75420d0dd4`.
- Đã đọc source và license; bản upstream nằm ở `.upstream/Claude-Office`, không sửa/xóa.
- DTApp baseline: TypeScript check thành công; Vite production build thành công; bio-slug 2/2 tests thành công.
- API/ảnh baseline chạy sau audit: 7/7 thành công, có suy luận U²-Net thật.
- Máy có Node 24.16.0; npm shim trong PATH bị hỏng, dùng `node "C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js"`.
- Docker client có mặt nhưng chưa kết nối được daemon (pipe docker_engine không tồn tại trong sandbox). Chưa xác nhận container deployment.
- Files: ARCHITECTURE.md, IMPLEMENTATION_PLAN.md, docs/office/VALIDATION.md, .gitignore.
- Commit: `7cc5aa5` — docs(office): audit Claude-Office and plan staged architecture.
- Bước kế: schema/RLS, typed client, auth/agent/project vertical slice, tests PostgreSQL.

## Checkpoint nền tảng backend và Supabase

Files: `supabase/migrations/20261023000000_virtual_office.sql`, `supabase/seed-office.sql`, `apps/office-api/{package.json,tsconfig.json,src/*}`, `scripts/{generate-office-types,import-office-sqlite,office-import-lib}.*`, `src/office/{database.types,state}.ts`, `tests/office/{schema,engine,api.integration}.test.ts`, `vitest.office.config.ts`, `eslint.config.mjs`, package.json/lock, .env.example.

Đã xây: schema 32 bảng, UUID/FK/index/updated_at/CHECK, RLS và quyền cột; Auth/RBAC; model/agent/project/task CRUD endpoints; dependency checks; queue/outbox; custom durable orchestration engine; provider adapters; checkpoint/tool ledger; scope/tool approvals; memory/A2A persistence; artifact/test tools; integer USD accounting/reservation; audit; pause/resume/cancel/emergency stop. Kết thúc run/task/avatar có transaction và completion receipt. Task từ kế hoạch đã duyệt mới được auto dispatch; task thủ công chờ người dùng start.

Kiểm thử thực thi:

| Kiểm tra | Kết quả | Giới hạn bằng chứng |
|---|---|---|
| PostgreSQL migration/RLS/FK, storage policies, approval, budget, enqueue, run controls, completion | 15 tests thành công | PostgreSQL WASM/PGlite; Supabase-owned schemas/Auth claims là fixture |
| Orchestrator, policy, usage/pricing, provider contracts, GLB asset | 19 tests thành công | Model và tool receipts có fixture trong engine tests; HTTP contract không gọi provider thật |
| Compiled Nest REST integration | 5 tests thành công | HTTP server thật; Supabase identity/data endpoint fixture |
| TypeScript backend | Thành công | `tsc -p apps/office-api/tsconfig.json` |
| ESLint phạm vi Office | Thành công | src/office, apps/office-api/src, tests/office |
| SQLite import | Fixture SQLite thật → PostgreSQL, chạy hai lần không trùng; thread/content kiểm chứng | Chưa có chat.db người dùng; chưa import hosted Supabase |

Chưa PASS: hosted Auth/RLS/Storage/Realtime, Redis/BullMQ runtime, provider gọi thật, runner container thực, chạy tools trên repository thực. Missing keys được kiểm tra trước reservation; không dựng kết quả thay thế. Unknown provider/tool outcome giữ reservation hoặc quarantine để con người đối chiếu.

Commit checkpoint backend: ghi trong Git log với message `feat(office): add Supabase schema and durable agent execution foundation`.

## Checkpoint frontend 3D và hạ tầng

Files: `src/App.tsx`, `src/office/{OfficeApp,OfficeScene}.tsx`, `src/office/{client,state,database.types}.ts`, `src/office/ui/button.tsx`, `src/office/office.css`, `public/office/*`, `scripts/generate-office-avatar.mjs`, `playwright.office.config.ts`, `tests/office/e2e/office.spec.ts`, `vite.config.ts`, `infra/office/*`, Docker Compose/.dockerignore, README/THIRD_PARTY_NOTICES và tài liệu `docs/office/`.

Đã xây: entry lazy trong DTApp; dashboard/navigation tiếng Việt; form org/agent/config/provider/project/task; board/run controls; approvals; Markdown chat có persistence/recipient; tài liệu/artifact downloads; tài chính; settings; 3D orbit/zoom/pan/isometric/perspective/day-night, GLB có 12 clip cơ bản và state projection từ agent status, inspector và mobile list fallback.

Đã phát hiện khi QA hình ảnh: ContactShadows làm sai hình render với bộ thư viện hiện tại; Html overlay có lỗi DOM khi đổi cảnh. Đã bỏ ContactShadows và chuyển nhãn sang DOM overlay trong cùng React tree, cập nhật tọa độ bằng ref trong frame. Chạy lại test chuyển cảnh nhiều lần không còn pageerror. Không chỉ kiểm tra có thẻ canvas: đã mở và kiểm tra ảnh `artifacts/office/desktop-office.png` thực sự thấy geometry/nhân vật.

| Kiểm tra | Kết quả |
|---|---|
| Frontend TypeScript | Thành công |
| Production Vite build | Thành công; Three.js tách chunk lazy (~747 kB), không còn warning chunk >900 kB |
| Playwright desktop + mobile viewport | 8/8 thành công, không skip; UI dùng fixtures có ghi rõ trong tests |
| DTApp regression | 9/9 thành công, gồm U²-Net inference thật, API token/CORS, vision contract và bio slug |
| GLB | Header glTF v2, meshes và đủ 12 clips được kiểm tra |
| Docker Compose syntax | `docker compose --env-file .env.example config --no-interpolate --quiet` thành công |
| Docker daemon/build/start | Chưa chạy được: `dockerDesktopLinuxEngine` pipe không tồn tại kể cả ngoài sandbox |
| Importer/runner JS syntax | `node --check` thành công; không tương đương chạy sandbox container |
| git diff --check | Thành công sau khi sửa trailing blank line trong notices |

Test UI đã sửa hai lỗi thực, rồi chạy lại. Chưa kiểm thử Electron đóng gói, iPhone Safari thật, hay hosted deployment. Tất cả Office secret variables hiện chưa cấu hình; `.env` mẫu local đã tạo, Git bỏ qua, không in giá trị key vào log.

Commit checkpoint frontend: ghi trong Git log với message `feat(office): integrate Vietnamese 3D workspace and deployment runbooks`.

## Bước tiếp theo và phạm vi còn thiếu

1. Nhập secrets vào `.env`/secret manager local, chọn Supabase project staging, chạy migration và kiểm thử hai tenant + Google Auth + Realtime/Storage trên project đó.
2. Khởi động Docker Linux engine, Redis, API, worker và runner; thực thi smoke provider → tool → approval → artifact → test → usage. Chỉ khi có receipt/log thực mới nghiệm thu execution.
3. Phát triển phần còn thiếu trong `docs/office/README.md`: chuỗi PM/BA/scope/Dev/Tester repair loop/PM review/deploy, GitHub/worktrees, workspace builds, streaming/attachments/threads/meeting automation và các màn hình quản trị còn lại.

Không đánh dấu hoàn thành toàn bộ 12 phase của master prompt. Đây là checkpoint nền tảng đã có kiểm thử cục bộ; còn các cổng nghiệm thu môi trường thật và các chức năng được liệt kê ở trên.
