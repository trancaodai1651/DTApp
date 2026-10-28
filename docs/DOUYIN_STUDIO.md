# Douyin Studio — Tauri v2

## Sử dụng

1. Mở DT App desktop → **Tiếp tục với Google**, đăng nhập tài khoản được cấp quyền DT App, rồi chọn **Douyin Studio** trong menu. Bắt buộc Google cho DT App; Douyin vẫn dùng phiên khách, không cần tài khoản Douyin.
2. Trong **Cài đặt**, bấm **Cài / cập nhật Chromium** một lần. Bộ cài DT App chứa Python worker và FFmpeg; Chromium được tải riêng để giữ bộ cài nhỏ hơn.
3. Dán link chia sẻ `v.douyin.com`, link `/video/…`, link `jingxuan?modal_id=…`, hoặc trang `/user/…`, rồi **Quét video**. Với link video, app lưu kênh tác giả khi đọc được `sec_uid`.
4. Chọn **Toàn bộ**, **ngày**, **tuần**, **tháng**, hoặc **khoảng ngày**. Tuần từ thứ Hai đến Chủ nhật, ngày kết thúc được tính hết ngày; dùng múi giờ hệ điều hành. Có thể tự tải sau khi quét hoặc chọn từng video trong kết quả tác vụ.
5. **Kênh tham khảo** giữ tên, link, chủ đề, ghi chú và yêu thích trong SQLite. Có thể xuất danh sách JSON để sao lưu. Tham khảo không đồng nghĩa theo dõi tài khoản trên Douyin.
6. **Theo dõi mới** dành cho link `/user/…`: chỉ tự tải video đăng từ lúc bật, mặc định kiểm tra mỗi 60 giây, tối thiểu 30 giây. Bấm **Quét / tải kênh** để tải lịch sử. Lỗi làm chu kỳ chậm dần, tối đa một giờ, tránh lặp yêu cầu liên tục.
7. Đóng cửa sổ chính sẽ thu app xuống khay hệ thống và tiếp tục theo dõi. Chọn **Thoát DT App (dừng theo dõi)** trong menu khay để thoát hẳn. Máy ngủ, mất mạng hoặc thoát app thì không thể tải ngay; app kiểm tra tiếp khi chạy lại. Không có webhook/push từ Douyin.
8. Video đã tải có nút **Lồng tiếng**. Nhập văn bản tiếng Việt hoặc SRT, chọn giọng tự động/mô tả giọng/giọng mẫu và bản chép lời của mẫu. OmniVoice là TTS; bản này không tự nhận dạng hay dịch lời thoại Trung–Việt.

## Giới hạn phiên khách

- App tạo hồ sơ Chromium khách riêng trong thư mục dữ liệu DT App. Không đọc cookie tài khoản từ Chrome/Edge cá nhân, không gửi cookie hoặc video lên Supabase.
- Nếu Douyin trả CAPTCHA, giới hạn vùng/mạng hoặc yêu cầu đăng nhập, tác vụ báo bị chặn. Nút **Mở Douyin khách** cho phép xem trạng thái trang; app không tự vượt CAPTCHA hay yêu cầu đăng nhập.
- Chỉ đánh dấu đã lấy hết kênh nếu endpoint danh sách trả `has_more=0`. Nếu cuộn bị dừng, hết giới hạn quét hoặc thiếu dữ liệu thì báo **Chưa lấy hết**. Không suy ra “đã lấy tất cả” từ một trang rỗng.
- Video thiếu ngày đăng không được đưa vào tải theo ngày. Bài ảnh được hiển thị nhưng chưa hỗ trợ xuất thành video. Video đã tải/đang tải được bỏ qua để tránh trùng.
- Theo dõi kênh phụ thuộc khả năng đọc trang kênh của phiên khách. Tải được video lẻ không có nghĩa Douyin cho phép đọc toàn bộ kênh.

## OmniVoice

Nguồn tích hợp: [k2-fsa/OmniVoice](https://github.com/k2-fsa/OmniVoice), cố định commit `08be0b4ccbac3e13e374e86fbfead4b4cac343e2`. API dùng `OmniVoice.from_pretrained`, `generate`, `language`, `ref_audio`, `ref_text`, `instruct`, `num_step`, theo mã upstream.

- Có Python 3.10+ trên máy: chọn thiết bị CUDA/MPS/CPU trong Cài đặt rồi **Cài OmniVoice vào môi trường riêng**, chọn tập tin Python. App tạo môi trường `omnivoice-venv` trong dữ liệu người dùng, cài PyTorch 2.8 và upstream, kiểm tra import rồi lưu cấu hình. Không cần Git trên máy client. Xem tiến độ/lỗi ở **Tác vụ**.
- Người phát triển cũng có thể chạy `python scripts/setup-omnivoice.py --device cuda` (Windows NVIDIA), `--device mps` (Apple Silicon), hoặc `--device cpu`, rồi chọn Python được in ra trong Cài đặt.
- Model tải ở lượt tạo giọng đầu; cần mạng và đủ đĩa/RAM/VRAM. TTS chạy ngoài worker tải video, nạp model một lần cho các đoạn của một tác vụ rồi giải phóng khi tiến trình thoát.
- macOS Universal hỗ trợ giao diện/tải video trên Intel và Apple Silicon. PyTorch mới không cung cấp wheel macOS Intel chính thức, trong khi OmniVoice yêu cầu Torch >=2.4: cài giọng tự động chỉ hỗ trợ Windows/Apple Silicon. Intel cần Python/PyTorch tự biên dịch tương thích; không cam kết OmniVoice cục bộ trên Intel khi chưa thử thực tế.
- SRT căn từng đoạn vào mốc thời gian, văn bản thường căn theo thời lượng toàn video bằng `atempo`. Từ chối khi cần thay tốc độ quá 4 lần để không âm thầm cắt lời. Không nhận SRT chồng thời gian hoặc vượt độ dài video.
- Giữ luồng hình gốc bằng `-c:v copy`, xuất âm AAC và MP4 mới, giữ metadata gốc (bao gồm nhãn AIGC nếu có). **Giữ âm gốc** giữ cả giọng cũ và nhạc, không phải tách nền nhạc.

## Phát triển và đóng gói

```text
npm ci
npm run desktop:setup
npm run desktop

# Windows x64, cần Rust + C++ Build Tools + WebView2
npm run pack:win

# macOS: build worker riêng trên mỗi kiến trúc native
python scripts/build-media.py --arch aarch64
# Chép worker x86_64 đã build trên Intel vào src-tauri/worker-runtime/x86_64
rustup target add aarch64-apple-darwin x86_64-apple-darwin
npm run pack:mac
```

CI `.github/workflows/desktop.yml` build Python worker trên Windows x64, macOS Intel, macOS ARM64; ghép hai worker vào tài nguyên của một app Tauri Universal. Tauri chọn worker theo kiến trúc tiến trình. `.tar` giữ quyền thực thi khi chuyển artifact macOS. Build Universal và DMG phải chạy trên macOS. Bộ cài chưa ký số/notarize.

Web vẫn có poster/bio; Douyin trên web chỉ hiện hướng dẫn dùng desktop. Dữ liệu poster/API cũ của Electron nằm trong profile Electron khác origin: xuất JSON dự án bằng bản cũ rồi nhập vào bản mới. Không tự chuyển khóa API đã mã hóa của Electron; nhập lại qua kho mã hóa Web Crypto/IndexedDB của Tauri.

## Kiến trúc và kiểm chứng

React → lệnh Tauri cho cửa sổ main → JSON-lines stdin/stdout → Python asyncio → SQLite/Chromium/FFmpeg/OmniVoice. Không mở cổng HTTP cho bộ xử lý. Trang Douyin ở trình duyệt độc lập không có quyền IPC của app.

- Một lane quét/phiên khách, hai lane tải video và một lane giọng chạy độc lập; model không chặn việc kiểm tra kênh. Khi theo dõi, video mới được xếp tải ngay từ response danh sách. Lượt sau dùng cursor và chồng lại hai ngày để giảm quét lịch sử; sau thời gian tắt app vẫn quét bù từ mốc phủ trước đó. Mốc phủ chỉ tiến khi đã đọc đủ khoảng cần kiểm tra.
- SQLite WAL lưu bookmark, video, cài đặt và hàng đợi. Sau crash, tác vụ đang chạy thành **Bị gián đoạn**, cho phép thử lại; tác vụ chờ tiếp tục.
- Tải theo streaming xuống `.part`, kiểm tra MP4 và kích thước trước khi đổi tên. URL CDN hết hạn được làm mới một lần. Lịch sử được giữ khi bỏ lưu kênh; tệp video không bị xóa theo bookmark.

```text
npm test
npm run test:media
npm run build
cargo check --manifest-path src-tauri/Cargo.toml
```

`scripts/verify-douyin.py` kiểm tra đúng hai link người dùng cung cấp, ghi bằng chứng vào `artifacts/douyin-live/report.json`. Tài liệu kiểm tra thực tế bổ sung ở `docs/DOUYIN_VALIDATION.md`.

## Bắt buộc Google từ 0.2.1

Không có lối mở Studio trước đăng nhập. Native worker mặc định từ chối mọi lệnh đọc dữ liệu/xử lý nếu không có phiên Google đã được Supabase xác thực và hàng `app_users.is_active=true`. Token chỉ nằm trong RAM/request, không lưu vào SQLite hoặc lịch sử tác vụ. Worker kiểm tra lại phiên/quyền mỗi 30 giây; đăng xuất dừng các lane đang chạy và đóng phiên khách, giữ tác vụ đang chờ. Truy cập lại cần Google.

Luồng desktop dùng PKCE và callback chính xác `dtapp://auth/callback`; callback đã thêm vào Supabase redirect allowlist. `opener:allow-default-urls` cho phép mở trang OAuth HTTPS. Làm mới token cùng tài khoản không khóa lại tác vụ. Không yêu cầu nhập Google secret vào frontend hoặc worker.

Nếu trang đăng nhập bị treo trong Chrome trên Windows, chọn **Microsoft Edge** trong **Trình duyệt đăng nhập**, nhập email và thử lại một lần. App tạo yêu cầu PKCE mới rồi mở Edge; không đổi trình duyệt mặc định, không lấy cookie Chrome và không xử lý mật khẩu Google. Quyền mở Edge chỉ áp dụng URL `/auth/v1/authorize` của project Supabase này. Hoàn tất Google và xác nhận mở DT App trong trình duyệt. Link đăng nhập cũ không nên dùng lại sau khi bắt đầu lượt mới.
