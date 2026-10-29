# DT App

Google sign-in, user roles, and multiple custom bio URLs are documented in [Google sign-in setup](docs/GOOGLE_LOGIN_SETUP.md). Configure the Supabase Google provider and redirect allowlist before deploying the access-gated build.

Không gian sáng tạo DT App gồm dashboard riêng và công cụ DT Poster Studio. Ứng dụng hỗ trợ Tiếng Việt và English, giao diện sáng/tối, responsive, chạy trên web, Windows x64/ARM64 và macOS Intel/Apple Silicon. API AI bên ngoài có thể tắt; khi tắt, gợi ý nội dung dùng câu chữ cục bộ. Xoá nền vẫn chạy bằng U²-Net trên server.

## Có trong bản 0.1

- 8 mẫu: thiên nhiên, tối giản, tạp chí, trẻ trung, cao cấp, khuyến mãi, công nghệ và thủ công. Bố cục tự thay đổi theo khổ ảnh.
- 6 khổ xuất: 1080×1080, 1080×1350, 1080×1920, 1920×1080, 1080×1440, A4 2480×3508 px.
- Nhập ảnh JPG/PNG/WebP, kéo thả, xoá nền trên server bằng U²-Net; khôi phục ảnh gốc.
- Gợi ý tên và mô tả từ ảnh qua OpenAI/ChatGPT, Gemini, Claude hoặc Grok trên server; có thể thêm nhiều API profile và chuyển provider/tài khoản ngay trong Cài đặt.
- Trang hướng dẫn song ngữ chỉ cách lấy API key từ trang chính thức. Web mã hóa profile trong hồ sơ trình duyệt; ứng dụng Windows/macOS dùng `safeStorage` của hệ điều hành. Khóa cá nhân không đồng bộ qua Supabase.
- Sửa nội dung, thương hiệu, giá, nhãn, lời kêu gọi hành động; thay màu; chỉnh vị trí/kích thước/góc xoay/bóng đổ ảnh; hoàn tác và làm lại.
- Xuất PNG/JPG ở độ phân giải 1× hoặc 2×, lưu dự án trong IndexedDB và xuất/nhập tệp `.dtposter.json` để chuyển máy.
- Đồng bộ bio, kênh bán hàng, poster và ảnh riêng tư vào Supabase Storage/Postgres qua tài khoản khách tự tạo hoặc tài khoản hiện có, có Row Level Security.
- Giao diện song ngữ, giao diện sáng/tối, hoạt ảnh chuyển trạng thái và hỗ trợ tùy chọn giảm chuyển động của hệ điều hành.

Đồng bộ Supabase cần project URL, publishable/anon key và áp dụng SQL trong `supabase/migrations/`. DT App tự tạo phiên khách khi lưu bio; đăng nhập email là tùy chọn.

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

### Thêm API cá nhân

Mở **Cài đặt kết nối → API cá nhân**, chọn OpenAI/ChatGPT, Gemini, Claude hoặc Grok, dán API key và nhấn **Lưu API trên thiết bị**. Có thể lưu nhiều profile và chọn **Dùng API này** để chuyển linh hoạt. Xem [hướng dẫn song ngữ lấy API](https://trancaodai1651.github.io/DTApp/api-guide.html) hoặc [hướng dẫn đầy đủ](docs/AI_SETUP.md).

Khi dùng gợi ý từ ảnh, key, ảnh và thông tin sản phẩm được gửi tới server AI đã cấu hình rồi chuyển tiếp tới provider. Chỉ kết nối tới server đáng tin cậy. Server không lưu key cá nhân; background removal dùng U²-Net và không cần provider key.

### API mặc định cho máy chủ (tuỳ chọn)

```powershell
Copy-Item .env.example .env
```

Quản trị viên có thể đặt API dự phòng trong `.env` trên **server** bằng `AI_PROVIDER` và khóa `OPENAI_API_KEY`, `GEMINI_API_KEY`, `ANTHROPIC_API_KEY` hoặc `XAI_API_KEY`. API cá nhân trong app sẽ ưu tiên hơn cấu hình dự phòng. API có thể phát sinh phí và hạn mức riêng theo tài khoản nhà cung cấp.

Không đóng gói khóa API vào mã frontend, biến `VITE_*`, GitHub Pages hay bộ cài desktop. `.env` đã được bỏ qua bởi Git. Các API cá nhân do người dùng nhập được lưu mã hóa tại chỗ, không gửi đến Supabase. Chỉ khi yêu cầu gợi ý thì ảnh, thông tin và key đang chọn mới gửi qua server tới nhà cung cấp; ảnh xóa nền được xử lý trên server.

### Đưa lên máy chủ Windows 10

1. Cài Node.js 24 LTS x64; sao chép mã nguồn, chạy các lệnh cài và build ở trên. Máy server có thể là Windows 10 x64; client là web, Windows hoặc macOS.
2. Mặc định Node chỉ nghe `127.0.0.1:8787`. Dùng IIS reverse proxy hoặc reverse proxy tương đương để cung cấp HTTPS cho `/` và `/api/` qua tên miền của bạn. Cho phép request body ít nhất 34 MB và timeout 120 giây.
3. Đặt `APP_ACCESS_TOKEN` đủ dài/ngẫu nhiên trong `.env` trước khi cho phép truy cập từ bên ngoài. Nếu trực tiếp bind `HOST=0.0.0.0`, server bắt buộc có token. Nhập token này trong Cài đặt kết nối trên client. Token là cơ chế truy cập cho nhóm nhỏ; cần bổ sung đăng nhập và hạn mức theo người dùng trước khi mở dịch vụ công cộng.
4. `.env.example` đã cho phép origin `https://trancaodai1651.github.io` dùng với GitHub Pages này. Nếu bạn dùng tên miền riêng, thêm đúng origin vào `ALLOWED_ORIGINS`, ví dụ `https://poster.tenmien.vn`; chỉ nhập scheme + host (+ port nếu có), không có đường dẫn `/DTApp` và không có dấu `/` cuối. Khởi động lại server sau khi sửa.
5. Chạy server bằng dịch vụ Windows/process manager đã cấu hình tự khởi động. Không đưa `.env` vào thư mục web công khai; chỉ `dist/` được phục vụ.

Ảnh chỉ tồn tại trong RAM trong khi xử lý; server không chủ động lưu ảnh hay ghi ảnh/khóa vào log. Máy chủ giới hạn một tác vụ xoá nền và hai tác vụ gợi ý đồng thời, tối đa 30 yêu cầu AI/phút/IP. Khi dùng reverse proxy, chưa dùng `X-Forwarded-For`: các client sẽ chia sẻ hạn mức IP của proxy; cần bổ sung cấu hình proxy đáng tin cậy cho môi trường nhiều người dùng.

## GitHub Pages

Workflow `.github/workflows/pages.yml` build và triển khai thư mục `dist/`, tương thích cả đường dẫn repo `/DTApp/` nhờ asset URL tương đối. Trong repo GitHub chọn **Settings → Pages → Source: GitHub Actions** rồi đẩy nhánh `main` hoặc chạy workflow thủ công.

GitHub Pages chỉ chứa frontend. Sau khi mở web, vào **Cài đặt kết nối**, nhập URL HTTPS của API server và mã truy cập server. Mẫu `.env.example` đã allowlist origin `https://trancaodai1651.github.io` cho site này; nếu dùng tên miền riêng, thêm origin đó vào `ALLOWED_ORIGINS`. API profiles được mã hóa trong trình duyệt của người dùng; workflow Pages không nhận các key này.

## Supabase

1. Tạo project Supabase ở khu vực gần người dùng.
2. Chạy `supabase/migrations/20261022000000_poster_cloud.sql` trong Supabase SQL Editor.
3. Trong **Settings → API Keys**, lấy Project URL và publishable key/anon key. Nhập hai giá trị trong mục **Supabase Cloud** của ứng dụng.
4. Trong **Authentication → Sign In / Providers**, bật **Anonymous sign-ins**. DT App tự tạo phiên khách khi lưu bio; khách dùng RLS và chỉ truy cập dữ liệu gắn với ID riêng của họ. Đăng nhập email vẫn là tùy chọn.
5. Phiên khách gắn với trình duyệt hoặc hồ sơ ứng dụng hiện tại. Nếu xóa dữ liệu trình duyệt hay đổi thiết bị, phiên và dữ liệu khách không thể khôi phục. Supabase khuyến nghị CAPTCHA để hạn chế tạo tài khoản tự động.

Không bao giờ đưa `service_role` key vào frontend. Các bảng và bucket dùng RLS để mỗi tài khoản chỉ đọc và sửa dữ liệu của mình.

## Ứng dụng desktop — Tauri v2

```text
npm ci
npm run desktop:setup
npm run desktop
# Windows x64:
npm run pack:win
# macOS Universal, sau khi có worker Intel + ARM64:
npm run pack:mac
```

Desktop đã chuyển sang Tauri v2. Bộ cài Windows NSIS ở `src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/`; bản macOS Universal được build trên Mac/CI, chứa cả worker Intel và Apple Silicon. Cần Rust, công cụ native của nền tảng và WebView2 trên Windows. Bản cài chưa ký số/notarize.

**Douyin Studio** lưu kênh tham khảo, tải video lẻ/kênh/theo lịch ngày–tuần–tháng, theo dõi video mới khi app chạy và lồng tiếng OmniVoice. Bắt buộc đăng nhập Google đã được cấp quyền DT App; Douyin vẫn dùng phiên khách, không cần tài khoản Douyin. Khả năng lấy danh sách kênh phụ thuộc giới hạn phiên khách của Douyin; xem [hướng dẫn và giới hạn thực tế](docs/DOUYIN_STUDIO.md), [báo cáo kiểm chứng](docs/DOUYIN_VALIDATION.md).

Bộ cài chứa Python riêng cùng OmniVoice, Whisper và thư viện dịch; không cần chọn hay cài Python hệ thống. Model tải khi dùng lần đầu. Windows có CPU sẵn và tự chuẩn bị CUDA khi phù hợp; Apple Silicon dùng MPS. Giọng trên Mac Intel hiện chưa được hỗ trợ. Mẫu `.env.example` cho phép origin Tauri cho các công cụ poster gọi server hiện có. Dữ liệu Electron cũ có thể chuyển bằng xuất/nhập JSON; khóa API cần nhập lại.

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
- [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages) phục vụ web tĩnh; [Tauri v2](https://v2.tauri.app/) dùng WebView của hệ điều hành; phần thị giác dựa trên [OpenAI Responses image inputs](https://developers.openai.com/api/docs/guides/images-vision?api-mode=responses).
