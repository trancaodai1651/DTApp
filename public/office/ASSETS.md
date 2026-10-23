# Office 3D assets

`employee.glb` là nhân vật hình học gốc do DTApp tạo bằng `scripts/generate-office-avatar.mjs`; không sử dụng hình ảnh, nhân vật hoặc thương hiệu từ The Office. Có 12 animation clips: idle, walking, sitting, typing, reading, talking, thinking, meeting, waiting, error, completed, paused. Đây là nhân vật low-poly cơ bản, chưa phải bộ nhân vật nghệ thuật với skeletal walking/IK chuyên nghiệp. Quyền sử dụng theo license DTApp.

Bàn, ghế, máy tính và phòng được dựng bằng geometry Three.js trong `OfficeScene.tsx`. Khi nhập tài sản bên ngoài, phải bổ sung nguồn, license và tác giả vào manifest này và `office_assets`.
