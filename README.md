# DT Poster Studio

Ứng dụng thiết kế poster sản phẩm bằng Tiếng Việt và English, với giao diện sáng/tối, responsive và dùng chung trên web, Windows x64/ARM64 và macOS Intel/Apple Silicon. AI chạy qua máy chủ do chủ dự án quản lý.

## Có trong bản 0.1

- 8 mẫu: thiên nhiên, tối giản, tạp chí, trẻ trung, cao cấp, khuyến mãi, công nghệ và thủ công. Bố cục tự thay đổi theo khổ ảnh.
- 6 khổ xuất: 1080×1080, 1080×1350, 1080×1920, 1920×1080, 1080×1440, A4 2480×3508 px.
- Nhập ảnh JPG/PNG/WebP, kéo thả, xoá nền trên server bằng U²-Net; khôi phục ảnh gốc.
- Gợi ý tên và mô tả từ ảnh bằng API thị giác trên server. Khi chưa có khóa API, chức năng này báo chưa cấu hình. Câu chữ tham khảo theo nhóm sản phẩm là chức năng riêng và được ghi rõ chưa phân tích ảnh.
- Sửa nội dung, thương hiệu, giá, nhãn, lời kêu gọi hành động; thay màu; chỉnh vị trí/kích thước/góc xoay/bóng đổ ảnh; hoàn tác và làm lại.
- Xuất PNG/JPG ở độ phân giải 1× hoặc 2×, lưu dự án trong IndexedDB và xuất/nhập tệp `.dtposter.json` để chuyển máy.
- Đồng bộ poster và ảnh riêng tư vào Supabase Storage/Postgres theo tài khoản đăng nhập, có Row Level Security.
- Giao diện song ngữ, giao diện sáng/tối, hoạt ảnh chuyển trạng thái và hỗ trợ tùy chọn giảm chuyển động của hệ điều hành.

Đồng bộ Supabase cần project URL, publishable/anon key và áp dụng SQL trong `supabase/migrations/`. Mở mục **Supabase Cloud** trong Cài đặt để kết nối và đăng nhập.

## Chạy trên máy Windows hiện tại

Cần Node.js 24 LTS và npm. PowerShell, tại thư mục dự án:

```powershell
npm ci
npm ci --prefix server
npm run build
npm run server
```

Mở `http://127.0.0.1:8787`. Server phục vụ cả thư mục web `dist/` và API. Chức năng xoá nền hoạt động không cần khóa trả phí. Lần cài đầu cần Internet tải mô hình 176 MB, sau đó mô hình nằm tại `server/models/u2net.onnx`; ảnh được xử lý trên server này.

Để phát triển giao diện, chạy `npm run dev` trong terminal thứ hai; Vite chuyển `/api` đến server cổng 8787.

### Cấu hình gợi ý tên và mô tả từ ảnh

```powershell
Copy-Item .env.example .env
```

Chọn `AI_PROVIDER=openai`, `gemini` hoặc `grok` trong `.env` trên **server**, rồi điền khóa tương ứng (`OPENAI_API_KEY`, `GEMINI_API_KEY` hoặc `XAI_API_KEY`). Xem [hướng dẫn cấu hình AI](docs/AI_SETUP.md). AI có thể phát sinh phí theo tài khoản nhà cung cấp.

Không đặt khóa AI trong mã frontend, biến `VITE_*`, GitHub Pages hay bộ cài desktop. Tệp `.env` đã được bỏ qua bởi Git. Chỉ ảnh nhỏ được gửi tới nhà cung cấp khi người dùng yêu cầu gợi ý; ảnh xoá nền được xử lý trên server.

### Đưa lên máy chủ Windows 10

1. Cài Node.js 24 LTS x64; sao chép mã nguồn, chạy các lệnh cài và build ở trên. Máy server có thể là Windows 10 x64; client là web, Windows hoặc macOS.
2. Mặc định Node chỉ nghe `127.0.0.1:8787`. Dùng IIS reverse proxy hoặc reverse proxy tương đương để cung cấp HTTPS cho `/` và `/api/` qua tên miền của bạn. Cho phép request body ít nhất 34 MB và timeout 120 giây.
3. Đặt `APP_ACCESS_TOKEN` đủ dài/ngẫu nhiên trong `.env` trước khi cho phép truy cập từ bên ngoài. Nếu trực tiếp bind `HOST=0.0.0.0`, server bắt buộc có token. Nhập token này trong Cài đặt kết nối trên client. Token là cơ chế truy cập cho nhóm nhỏ; cần bổ sung đăng nhập và hạn mức theo người dùng trước khi mở dịch vụ công cộng.
4. Thêm đúng origin web vào `ALLOWED_ORIGINS`, ví dụ `https://tenban.github.io,https://poster.tenmien.vn,app://dt`. Chỉ nhập scheme + host (+ port nếu có), không có đường dẫn `/DTApp` và không có dấu `/` cuối.
5. Chạy server bằng dịch vụ Windows/process manager đã cấu hình tự khởi động. Không đưa `.env` vào thư mục web công khai; chỉ `dist/` được phục vụ.

Ảnh chỉ tồn tại trong RAM trong khi xử lý; server không chủ động lưu ảnh hay ghi ảnh/khóa vào log. Máy chủ giới hạn một tác vụ xoá nền và hai tác vụ gợi ý đồng thời, tối đa 30 yêu cầu AI/phút/IP. Khi dùng reverse proxy, chưa dùng `X-Forwarded-For`: các client sẽ chia sẻ hạn mức IP của proxy; cần bổ sung cấu hình proxy đáng tin cậy cho môi trường nhiều người dùng.

## GitHub Pages

Workflow `.github/workflows/pages.yml` build và triển khai thư mục `dist/`, tương thích cả đường dẫn repo `/DTApp/` nhờ asset URL tương đối. Trong repo GitHub chọn **Settings → Pages → Source: GitHub Actions** rồi đẩy nhánh `main` hoặc chạy workflow thủ công.

GitHub Pages chỉ chứa frontend. Sau khi mở web, vào **Cài đặt kết nối**, nhập URL HTTPS của API server và mã truy cập server. Thêm origin GitHub Pages vào allowlist trên server. Không có khóa AI trong workflow Pages.

## Supabase

1. Tạo project Supabase ở khu vực gần người dùng.
2. Chạy `supabase/migrations/20261022000000_poster_cloud.sql` trong Supabase SQL Editor.
3. Trong **Settings → API Keys**, lấy Project URL và publishable key/anon key. Nhập hai giá trị trong mục **Supabase Cloud** của ứng dụng.
4. Đăng ký hoặc đăng nhập email, sau đó lưu poster để đồng bộ. Tắt tự động xác nhận email hoặc cấu hình URL chuyển hướng về site Pages nếu muốn xác nhận email.

Không bao giờ đưa `service_role` key vào frontend. Các bảng và bucket dùng RLS để mỗi tài khoản chỉ đọc và sửa dữ liệu của mình.

## Ứng dụng desktop

```powershell
npm run desktop
# Build riêng trên Windows:
npx electron-builder --win --x64 --publish never
npx electron-builder --win --arm64 --publish never
```

Sau `npm run build`, các lệnh electron-builder đóng gói đúng giao diện web hiện tại. Kết quả ở `release/`: bộ cài NSIS `.exe` và `.zip`. Người dùng desktop chỉ cần bộ cài và kết nối đến server; không cần cài Node.js trên máy client.

Trên máy macOS:

```text
npm ci
npm run pack:mac
```

Workflow `.github/workflows/desktop.yml` có 4 job cho Windows x64, Windows ARM64, macOS Intel và macOS ARM64, xuất artifact `.exe`/`.dmg`/`.zip`. Chạy thủ công hoặc đẩy tag `v*`. Phải build macOS trên runner/máy Mac. Các bản hiện chưa ký số hay notarize; cần chứng chỉ Windows/Apple của chủ dự án trước khi phát hành rộng rãi. Electron được chọn hỗ trợ Windows 10+ và macOS 13+; xác nhận lại yêu cầu tối thiểu khi nâng major Electron.

Client desktop được sandbox, tắt Node trong renderer, chặn điều hướng ngoài, chỉ truy cập server qua HTTP loopback/HTTPS. Không đóng gói API key hoặc mô hình AI trong client.

## Kiểm tra

```powershell
npm run build
npm test
```

Test bao gồm suy luận U²-Net thật trên ảnh sản phẩm, xác nhận nền trong suốt/vật thể còn lại, xác thực token và CORS, lỗi thiếu khóa AI, định dạng gợi ý và hợp đồng API thị giác. Kiểm tra hợp đồng AI dùng adapter giả lập; không khẳng định đã gọi nhà cung cấp thật khi chưa có khóa.

Kiểm tra UI gồm đổi tên, mẫu, tỷ lệ, lưu/mở dự án, xoá nền qua server và tải ảnh xuất. Báo cáo thực tế ở `docs/VALIDATION.md`.

## Tài liệu và nguồn

- Kiến trúc và hướng mở rộng: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
- Giấy phép thành phần và mô hình: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
- [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages) phục vụ web tĩnh; [Electron](https://github.com/electron/electron) hỗ trợ x64 và ARM64; phần thị giác dựa trên [OpenAI Responses image inputs](https://developers.openai.com/api/docs/guides/images-vision?api-mode=responses).
