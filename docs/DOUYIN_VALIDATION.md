# Kiểm chứng Douyin Studio — 2026-10-27

## Luồng đã kiểm tra

Link Douyin người dùng → bộ xử lý media thật → phiên Chromium khách → metadata/video MP4 → lưu kênh tác giả → OmniVoice CUDA tạo giọng Việt từ SRT → FFmpeg ghép MP4 mới.

| Hạng mục | Kết quả | Bằng chứng |
| --- | --- | --- |
| Link ngắn `https://v.douyin.com/aIfhanErl6g` | PASS | Giải ra video `7681298667634390739`, quét được metadata và tải MP4 |
| Link `jingxuan?modal_id=7681298667634390739` | PASS | Cùng video với link ngắn; lịch sử tránh tải trùng |
| Tải bằng phiên khách | PASS | Chromium profile riêng, không đăng nhập, không nhập cookie cá nhân |
| Lưu kênh tác giả | PASS | Tìm được “小小哆啦百宝袋”, URL `/user/MS4wLjABAAAArdY5BANnkPkvDNvzcRAyR-1xn0jrOYpfLVK2Yh5jIQguakwToop6FnWMHRXnlrxG` |
| Quét danh sách trang kênh trong phiên khách | BLOCKED | Không nhận được video sau 8 vòng; báo `blocked`, không báo tải toàn bộ thành công |
| Lọc ngày/tuần/tháng | UNIT PASS; LIVE CHANNEL BLOCKED | Kiểm tra biên ngày, tuần thứ Hai, tháng nhuận, ngày kết thúc; chưa xác minh lọc cả kênh thật khi Douyin chặn danh sách |
| Theo dõi video mới | UNIT PASS; LIVE PENDING | Kiểm tra scheduler không tạo tác vụ trùng, xếp tải ngay khi nhận response trước khi xong phân trang, watermark, retry/partial; chưa chứng kiến một bài đăng mới thật được phát hiện tự động |
| OmniVoice thật | PASS | Upstream `08be0b4ccbac3e13e374e86fbfead4b4cac343e2`, Torch `2.8.0+cu128`, Transformers `5.21.0`, RTX 2070 SUPER 8 GB, 16 bước, tiếng Việt, SRT hai đoạn |
| Ghép giọng thật | PASS | MP4 kết quả 68,60 giây, H.264 1920×1080, 30 fps, âm AAC; narration 48 kHz, RMS đoạn 16 giây đầu khoảng 2886/32768 |
| Giữ luồng hình gốc | PASS | SHA-256 của elementary video stream trước/sau giống nhau; không render lại hình |
| Giữ metadata nguồn | PASS | Bản demo cuối giữ metadata AIGC bằng `map_metadata` và `use_metadata_tags` |
| Worker đóng gói | PASS | Binary PyInstaller nhận JSON-lines, SQLite, gọi OmniVoice thật trong môi trường riêng và dùng FFmpeg đi kèm để xuất MP4; `shutdown` thoát mã 0 |
| Bộ cài Windows x64 | BUILD PASS | Tauri release + NSIS tạo bộ cài khoảng 55,39 MiB; chưa cài qua UI khi máy đang khóa |
| UI Tauri | PASS Google / tải lẻ / bookmark | Đăng nhập Google bằng Edge, quyền quản trị, khôi phục phiên sau mở lại, cài Chromium, quét/tải video và lưu kênh tác giả đã xác minh qua UI native |
| macOS Universal | BUILD + WORKER PASS; GUI PENDING | CI ghép app x86_64/arm64, kiểm tra hai worker, thực thi worker ARM64 từ `.app`; chưa kiểm tra GUI/MPS trên Mac của người dùng |

## Tệp bằng chứng cục bộ

- `artifacts/douyin-live/report.json`: kết quả quét/tải hai link chính xác người dùng cung cấp.
- `artifacts/douyin-live/channel-report.json`: lần quét trang kênh bị chặn trong phiên khách.
- `artifacts/douyin-live/voice-report.json`: tác vụ OmniVoice thật và đường dẫn MP4 kết quả.
- `artifacts/douyin-live/media-verification.json`: thời lượng, codec, kích thước, hash luồng hình, RMS giọng.
- `artifacts/douyin-live/douyin-omnivoice-demo.mp4`: video mẫu có giọng Việt; giữ nguyên video nguồn.
- `artifacts/omnivoice-live.log`: tiến độ tải model, sinh giọng và ghép video.
- `artifacts/tauri-windows-build-final.log`: nhật ký đóng gói Windows cuối.
- `artifacts/douyin-packaged/report.json` và `artifacts/packaged-voice.log`: tạo giọng/xuất video bằng worker PyInstaller đóng gói.

Video gốc có 11.054.017 byte, dài 68,6 giây. Mẫu SRT chỉ có lời trong 16 giây đầu; phần còn lại giữ âm gốc ở mức đã chọn, không phải bản dịch toàn bộ lời video. Đây là kiểm tra TTS và căn thời gian, không phải đánh giá bản dịch hoặc chất lượng giọng bằng người nghe.

## Kiểm tra mã

- `npm test`: 12/12 kiểm thử poster/API/bio/chính sách Google đã qua, bao gồm U²-Net thật.
- `npm run test:media`: 15/15 kiểm thử đã qua: URL người dùng, chặn URL giả mạo, lịch ngày/tuần/tháng, SRT, MP4/CDN, SQLite/bookmark, scheduler, chống tải trùng, hủy tác vụ, xác thực Google, khóa phiên và phục hồi sau gián đoạn.
- `npm run build`: TypeScript và Vite đã qua.
- `cargo check --manifest-path src-tauri/Cargo.toml`: đã qua sau phần Tauri/khay hệ thống.
- `git diff --check`: đã qua.

## Các bước còn cần môi trường bên ngoài

- Kiểm tra trang kênh trong phiên khách có dữ liệu. Tải video lẻ đã hoạt động nhưng không chứng minh quyền xem/tải toàn bộ kênh ở chế độ khách.
- Kiểm tra GUI và OmniVoice MPS trên thiết bị Mac thật; build Universal và thực thi worker đã qua CI. OmniVoice tự cài trên Mac Intel chưa được hỗ trợ bởi wheel PyTorch mới chính thức.
- Ký số/notarize cần chứng chỉ chủ dự án; bộ cài kiểm thử chưa ký số.

## Cập nhật 0.2.1 — bắt buộc Google

- Đã xác minh live Supabase `external.google=true`, thêm và xác nhận redirect `dtapp://auth/callback` (giữ redirect web hiện có). Không đọc/ghi OAuth secret.
- UI Windows đã hiển thị màn hình Google duy nhất, không còn nút vào Studio dạng khách. Đã mở được trang chọn tài khoản Google thật bằng OAuth PKCE; đang chờ người dùng hoàn tất bước tài khoản.
- Bộ xử lý PyInstaller thực tế từ chối `snapshot` khi chưa đăng nhập và từ chối `save_channel` với token giả; không ghi bookmark; khóa phiên và thoát sạch đã qua. Bằng chứng `artifacts/google-auth/native-negative-results.json`.
- Kiểm thử mới: Node 12/12, Python 15/15, TypeScript/build đã qua. Xác minh phiên Google/allowlist, khóa worker trước đăng nhập, giữ phiên qua token refresh.
- Ảnh callback: `artifacts/google-auth/supabase-desktop-redirect.jpg`.
- Báo cáo 0.2.0 ở trên là lịch sử; thông tin “UI đang khóa Windows” đã được thay bằng kiểm tra màn hình Google ở mục này. Luồng sau Google, quét cả kênh và macOS vẫn cần chứng cứ thực tế.

- Khi thử thực tế, Google đứng ở trang chọn tài khoản trước khi trả về Supabase. Đã thêm email gợi ý (`login_hint`, không ép `select_account`) và chặn mở nhiều phiên OAuth đồng thời; cần người dùng thử lại luồng mới để xác nhận hết treo.

- Kiểm thử đăng xuất khi đang chạy tác vụ phát hiện worker nuốt tín hiệu hủy và chờ mãi. Đã sửa để thoát đúng lane, giữ hàng đợi khóa trước lần đăng nhập sau; kiểm thử có timeout 2 giây đã qua.
- CI bổ sung thực thi worker PyInstaller trên từng hệ điều hành, kiểm tra mặc định cần Google và không ghi bookmark khi chưa xác thực. macOS Universal còn kiểm tra `lipo` cho app/2 worker, chạy worker từ bên trong `.app` rồi xuất thêm ZIP portable.

## Cập nhật chẩn đoán 2026-10-28

- CI [40483265522](https://github.com/trancaodai1651/DTApp/actions/runs/40483265522) thành công cả 5 job trên commit `02ad02f`: worker Windows x64, macOS Intel, macOS ARM64; bộ cài NSIS; app/DMG/ZIP macOS Universal. Kiểm tra `lipo` xác nhận binary Tauri gồm arm64/x86_64, cả hai worker có đúng kiến trúc; worker ARM64 chạy thực tế từ trong `.app`, từ chối truy cập không Google và thoát sạch. Chưa kiểm tra GUI hoặc OmniVoice MPS trên thiết bị Mac của người dùng.
- Quan sát kênh công khai bằng Chrome khi chưa đăng nhập Douyin: trang ghi 84 tác phẩm, hiện một phần liên kết video và thông báo `登录后查看更多作品` (đăng nhập để xem thêm). Không thể xác nhận tải đủ kênh trong phiên khách. Bằng chứng `artifacts/douyin-live/channel-guest-observation.json` và `channel-guest-login-wall.jpg`.
- Người dùng báo link `/auth/v1/authorize` có email gợi ý vẫn treo. Kiểm tra HTTP độc lập, không dùng cookie/token người dùng: endpoint công khai trả HTTP 302 sang `accounts.google.com` trong 0,32 giây; DNS và HTTPS tới Supabase/Google phản hồi. Đây chỉ là kiểm tra kết nối/chuyển hướng, chưa chứng minh đăng nhập thành công hay xác định lỗi Chrome.
- Thêm lựa chọn trình duyệt Microsoft Edge trên Windows, phạm vi mở URL giới hạn project Supabase hiện tại. Cần người dùng hoàn tất Google để xác minh callback/quyền và Studio sau đăng nhập.
- Môi trường dev từng bị Vite dừng do EBUSY khi theo dõi bộ cài trong `release/`; đã bỏ theo dõi `release/` và `reports/`, khởi động lại dev. Không khẳng định đây là nguyên nhân khiến trình duyệt treo.

- Người dùng đã hoàn tất Google bằng Edge. Đã xác minh native hiện đúng email, vai trò quản trị và mở Studio; worker yêu cầu Google đã nhận phiên hợp lệ, cài Chromium thành công. Đóng/mở lại app khôi phục phiên, không cần đăng nhập lại.
- Kiểm tra UI phát hiện hai host `v5-dy-ov-experiment.zjcdn.com` / `v5-hl-mly-ov.zjcdn.com` do trang Douyin trả về chưa có trong allowlist. Đã thêm `zjcdn.com` với kiểm tra HTTPS/đuôi miền hiện có, bổ sung kiểm thử chặn HTTP và miền giả mạo. Tải lại qua UI thành công: video `7681298667634390739`, 11.054.017 byte, 68,60 giây; FFmpeg đọc toàn bộ luồng hình không lỗi, SHA-256 tệp `c366c9b24e6d98e059942848f897e13d3b7696194e866cc4bf657e4a9d78525d`.
- UI native xác nhận 1 kênh tham khảo và 1 video đã tải. Báo cáo `artifacts/google-auth/tauri-google-runtime-report.json`, ảnh `artifacts/google-auth/dtapp-google-download-pass.png`. SQLite không có trường token Google. Hai tác vụ tải lỗi trước bản sửa vẫn được giữ trong lịch sử.

## Cập nhật 0.2.2 — chất lượng nguồn, xem trước kênh và chép lời

- Bộ phân tích metadata xếp các URL `bit_rate` theo độ phân giải rồi bitrate, thử bản cao nhất trước, giữ URL dự phòng và không mã hóa lại video. Tải live bằng worker khách của link người dùng: MP4 19.163.250 byte, 3840×2160, 2.235.791 bit/s, 68,57 giây; FFmpeg giải mã luồng hình thành công. Đây là bản cao nhất Douyin đưa ra trong response, không khẳng định file master.
- Quét trang kênh chỉ nhận thẻ nằm trong `user-post-list`, không nhận liên kết gợi ý ở `page-footer`; khi có thẻ công khai thì app thử lấy metadata video. Lần kiểm tra khách hiện tại: Douyin báo `服务异常`, trang ghi 85 tác phẩm nhưng danh sách tác phẩm có 0 thẻ; API trang hồ sơ trả 200/status 0, không phát yêu cầu `/aweme/post/`. App báo bị chặn và không nhận nhầm video gợi ý thành bài kênh. Bằng chứng tóm tắt `artifacts/douyin-0.2.2-live-check.json`.
- `faster-whisper` 1.2.1 chạy SRT từ audio trên máy và trích đoạn 8 giây làm mẫu giọng. PyAV 19 không tương thích đối số `metadata_errors`; môi trường chép lời ghim `av<19` (kiểm tra thực tế dùng PyAV 18.1.0).
- OmniVoice đã chạy trên SRT tự nhận dạng và audio mẫu tự trích; kết quả MP4 12.274.308 byte, 68,57 giây. SHA-256 elementary video stream trước/sau giống nhau; âm thanh ghép lại, luồng hình giữ nguyên.
- `npm run typecheck`, `npm run build` và `py_compile` qua. CI commit `da354fd` build thành công worker Windows x64, macOS Intel và Apple Silicon; bộ cài Windows NSIS, macOS Universal DMG và ZIP đã tải về `release/`. `check-macos-bundle.py` xác nhận app có cả `x86_64`/`arm64`, kiểm tra worker đúng kiến trúc và chạy worker ARM64 trên runner. Unit suites được bỏ qua cho build xem trước của nhánh; chưa kiểm tra GUI/MPS trên máy Mac thật, bộ cài chưa ký/notarize.

## Cập nhật 0.2.3 — quét mọi bài công khai theo chế độ khách

- Sửa bộ quét trang kênh để tính liên kết bài mới trong DOM vào tiến độ phân trang và xử lý metadata xem trước theo lô, bỏ giới hạn 24 bài. Metadata lấy được từ thẻ kênh được chuyển tiếp vào hàng đợi theo dõi.
- Kiểm tra lại hồ sơ tác giả của video người dùng gửi bằng hồ sơ Chromium khách mới: Douyin trả `服务异常` và danh sách bài có 0 thẻ. Vì thế app vẫn phải báo bị chặn; không thể lấy các bài mà chính Douyin không trả cho khách hoặc yêu cầu tài khoản để xem. Không đăng nhập hay vượt CAPTCHA.
- `npm run build` và `py_compile` qua; unit suites chưa chạy trong lượt này. Cần quét lại kênh khi Douyin trả danh sách công khai để xác nhận số bài và trạng thái hoàn tất.


## Cập nhật 0.2.4 — tìm video và chọn kiểu tạo giọng

- Thêm tìm video theo từ khóa trong phiên khách Douyin. Bộ xử lý đọc kết quả công khai từ trang tìm kiếm của Douyin, lưu kết quả vào thư viện để tải từng video hoặc chọn nhiều video; trang chưa xác nhận phân trang đầy đủ thì đánh dấu kết quả chưa hoàn chỉnh. Không đăng nhập Douyin, đọc cookie trình duyệt cá nhân hoặc vượt CAPTCHA.
- Thêm hai chế độ OmniVoice: thuyết minh trộn giọng mới với audio gốc ở mức âm lượng chọn được (mặc định 25%); lồng tiếng thay audio gốc. Cả hai bắt buộc chép audio của video trước để tạo SRT và trích đoạn audio cùng bản chép đồng bộ làm mẫu giọng. Bản chép không tự dịch; người dùng sửa/dịch SRT và chọn ngôn ngữ đầu ra. Luồng hình gốc được copy nguyên.
- Kiểm tra trang tìm kiếm Douyin bằng hồ sơ khách sạch trên máy Windows ngày 2026-10-28: Douyin trả trang xác minh CAPTCHA trước khi hiển thị kết quả. Vì vậy luồng tìm kiếm thật chưa thể xác nhận trên phiên khách hiện tại; khi gặp trạng thái này, mở Douyin khách để tự xử lý xác minh nếu trang cho phép rồi tìm lại.
- Xác minh mã nguồn: `npm run build`, `py_compile` cho worker và `git diff --check` đều qua. Chưa tạo lại bộ cài Windows/macOS từ mã nguồn 0.2.4.
