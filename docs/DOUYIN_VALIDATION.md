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
| UI Tauri | PARTIAL | App native đã khởi động; kiểm tra tương tác/screenshot bị dừng vì Windows đang khóa |
| macOS Universal | PENDING macOS runner/device | Đã cấu hình ghép worker Intel/ARM64 vào app Universal; chưa chạy build hoặc runtime trên macOS từ máy Windows này |

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

- `npm test`: 9/9 kiểm thử poster/API/bio đã qua, bao gồm U²-Net thật.
- `npm run test:media`: 11/11 kiểm thử mới đã qua: URL người dùng, chặn URL giả mạo, lịch ngày/tuần/tháng, SRT, MP4/CDN, SQLite/bookmark, scheduler, chống tải trùng, hủy tác vụ và phục hồi sau gián đoạn.
- `npm run build`: TypeScript và Vite đã qua.
- `cargo check --manifest-path src-tauri/Cargo.toml`: đã qua sau phần Tauri/khay hệ thống.
- `git diff --check`: đã qua.

## Các bước còn cần môi trường bên ngoài

- Mở khóa Windows để hoàn tất thao tác UI native và chụp giao diện. Không coi việc app biên dịch được là đã kiểm tra UI hoàn chỉnh.
- Kiểm tra trang kênh trong phiên khách có dữ liệu. Tải video lẻ đã hoạt động nhưng không chứng minh quyền xem/tải toàn bộ kênh ở chế độ khách.
- Chạy CI/macOS thật để xác minh Universal, Intel, Apple Silicon, MPS và quyền thực thi các worker. OmniVoice tự cài trên Mac Intel chưa được hỗ trợ bởi wheel PyTorch mới chính thức.
- Ký số/notarize cần chứng chỉ chủ dự án; bộ cài kiểm thử chưa ký số.

## Cập nhật 0.2.1 — bắt buộc Google

- Đã xác minh live Supabase `external.google=true`, thêm và xác nhận redirect `dtapp://auth/callback` (giữ redirect web hiện có). Không đọc/ghi OAuth secret.
- UI Windows đã hiển thị màn hình Google duy nhất, không còn nút vào Studio dạng khách. Đã mở được trang chọn tài khoản Google thật bằng OAuth PKCE; đang chờ người dùng hoàn tất bước tài khoản.
- Bộ xử lý PyInstaller thực tế từ chối `snapshot` khi chưa đăng nhập và từ chối `save_channel` với token giả; không ghi bookmark; khóa phiên và thoát sạch đã qua. Bằng chứng `artifacts/google-auth/native-negative-results.json`.
- Kiểm thử mới: Node 12/12, Python 14/14, TypeScript/build đã qua. Xác minh phiên Google/allowlist, khóa worker trước đăng nhập, giữ phiên qua token refresh.
- Ảnh callback: `artifacts/google-auth/supabase-desktop-redirect.jpg`.
- Báo cáo 0.2.0 ở trên là lịch sử; thông tin “UI đang khóa Windows” đã được thay bằng kiểm tra màn hình Google ở mục này. Luồng sau Google, quét cả kênh và macOS vẫn cần chứng cứ thực tế.

- Khi thử thực tế, Google đứng ở trang chọn tài khoản trước khi trả về Supabase. Đã thêm email gợi ý (`login_hint`, không ép `select_account`) và chặn mở nhiều phiên OAuth đồng thời; cần người dùng thử lại luồng mới để xác nhận hết treo.
