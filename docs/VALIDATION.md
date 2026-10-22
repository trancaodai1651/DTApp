# Kiểm tra bản 0.1 — 22/10/2026

## Môi trường thực tế

Windows 11 Pro x64, Node.js 24.16.0. Web được chạy bằng server Node tại `http://127.0.0.1:8787`. Windows 10 là nền tảng triển khai mục tiêu; chưa chạy thử trên một máy Windows 10 riêng trong phiên này.

## Đã đạt

- `npm run build`: TypeScript và Vite build thành công. Frontend nén gzip khoảng 88 KB JS, font tự lưu cùng web, không cần tải font từ CDN.
- `npm test`: 6/6 bài kiểm tra đạt. Có suy luận U²-Net thật, kiểm tra PNG alpha, giữ nắp chai và tỷ lệ mặt nạ trên ảnh dọc; có kiểm tra token, CORS, dữ liệu ảnh và lỗi chưa cấu hình AI.
- Tải ảnh JPG qua bộ chọn tệp trong trình duyệt, xoá nền thật qua server, hiển thị trạng thái hoàn tất và ảnh kết quả.
- Đối chiếu PNG nền trong suốt trên nền màu tương phản; sửa lỗi resize mask dùng `cover` thay vì `fill` và lỗi raw grayscale mở rộng thành nhiều kênh. Bài kiểm tra độ rộng nắp chai chống tái xuất hiện lỗi kéo giãn mask.
- Giữ tên người dùng đã nhập khi thay ảnh, thay mẫu, đổi tỷ lệ, hoàn tác và làm lại.
- Xác nhận sáu khổ thiết kế hoạt động: 1:1, 4:5, 9:16, 16:9, 3:4 và A4.
- Lưu thiết kế, mở lại từ thư viện và sau khi tải lại trang.
- Tải PNG 2×; kiểm tra tệp thật có kích thước **2160×2700 px** cho khổ 4:5.
- Tải JPG 1×; kiểm tra tệp thật là JPEG **1080×1350 px**.
- Xuất/nhập lại JSON dự án có ảnh gốc và ảnh tách nền; tên và thiết kế được khôi phục.
- Kiểm tra responsive ở **1440×1000** và **390×844**. Chiều rộng nội dung không vượt viewport điện thoại.

## Phân biệt kiểm tra thực và mô phỏng

Xoá nền dùng mô hình ONNX thật trên CPU. Gợi ý tên/mô tả đã được kiểm tra request/response với adapter giả lập OpenAI và Claude; chưa gọi API nhà cung cấp thật vì chưa có key người dùng. Khi thiếu key cá nhân và khóa dự phòng server, API trả thông báo rõ ràng, không tạo kết quả giả gắn nhãn AI.

## Nền tảng và phát hành

| Đầu ra | Trạng thái |
| --- | --- |
| Web tĩnh | Build và kiểm tra tương tác thực tế |
| Server Windows | API chạy và suy luận thật trên Windows 11 x64; hướng dẫn Windows 10 đã có |
| Windows x64 | Đóng gói NSIS/ZIP; kiểm tra cấu trúc PE và nội dung ASAR; chưa kiểm tra cài đặt trên máy sạch |
| Windows ARM64 | Đóng gói NSIS/ZIP; kiểm tra cấu trúc PE; chưa chạy trên thiết bị ARM64 |
| macOS Intel / ARM64 | Có cấu hình và workflow build trên runner Mac; chưa tạo bộ cài hoặc kiểm tra runtime |
| GitHub Pages | Có workflow; chưa triển khai vì chưa có repository đích |

Các bộ cài chưa được ký bằng chứng chỉ phát hành của chủ dự án. Các mẫu là bộ đầu tiên và chưa thay thế kiểm thử với ảnh sản phẩm thực tế của từng ngành hàng.

Ảnh minh chứng cục bộ nằm trong `artifacts/` (không nằm trong source zip), gồm giao diện desktop/điện thoại, kiểm tra nền tương phản và poster xuất 2×.
