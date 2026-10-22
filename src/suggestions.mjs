export function nameFromFile(fileName = '') {
  const value = fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!value || /^(img|dsc|image|photo|screenshot|anh|ảnh|hình|hinh|untitled|zalo|received)[\s\d_().-]*$/i.test(value)) return '';
  return value.slice(0, 64);
}
const categoryNames = {
  'Làm đẹp & chăm sóc': ['Nét Dịu Dàng', 'Khoảnh Khắc Chăm Mình', 'Dấu Ấn Riêng'],
  'Đồ ăn & thức uống': ['Vị Ngon Mỗi Ngày', 'Chút Vị Thân Quen', 'Hương Vị Gặp Gỡ'],
  'Thời trang & phụ kiện': ['Phong Cách Riêng', 'Điểm Nhấn Mỗi Ngày', 'Nét Chạm Cá Tính'],
  'Công nghệ': ['Nhịp Sống Mới', 'Kết Nối Mỗi Ngày', 'Chạm Tới Tương Lai'],
  'Đồ thủ công & trang trí': ['Góc Nhỏ An Yên', 'Nét Mộc', 'Chút Xinh Cho Nhà'],
};
export function localSuggestions({ name = '', category = '', fileName = '' } = {}, variant = 0) {
  const names = categoryNames[category] || ['Điểm Nhấn Mỗi Ngày', 'Dấu Ấn Của Bạn', 'Khám Phá Điều Mới'];
  const inferred = nameFromFile(fileName);
  const titles = inferred ? [inferred, ...names.slice(0, 2)] : names;
  const subject = name.trim() || titles[0];
  const descriptions = [
    `${subject} — một điểm nhấn cho ngày thêm cảm hứng. Khám phá và chọn điều phù hợp với bạn.`,
    `Thêm một lựa chọn, thêm một cách thể hiện mình. Cùng khám phá ${subject.toLocaleLowerCase('vi')}.`,
    `Có những điều nhỏ làm nên một ngày khác biệt. Để ${subject.toLocaleLowerCase('vi')} trở thành một phần câu chuyện của bạn.`,
  ];
  return { names: titles, descriptions: descriptions.map((_, i) => descriptions[(i + variant) % descriptions.length]), source: 'local' };
}
