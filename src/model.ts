export type StyleId = 'botanical' | 'minimal' | 'editorial' | 'playful' | 'luxury' | 'sale' | 'tech' | 'warm';
export type RatioId = '1:1' | '4:5' | '9:16' | '16:9' | '3:4' | 'A4';
export interface Poster {
  name: string; description: string; brand: string; category: string;
  price: string; cta: string; badge: string; style: StyleId; ratio: RatioId;
  accent: string; image: string; originalImage: string; fileName: string;
  imageScale: number; imageX: number; imageY: number; rotation: number;
  shadow: boolean; cutout: boolean;
}
export const styles: { id: StyleId; name: string; tag: string; bg: string; accent: string }[] = [
  { id: 'botanical', name: 'Lá xanh', tag: 'Thiên nhiên', bg: '#edf0e5', accent: '#31564a' },
  { id: 'minimal', name: 'Khoảng trắng', tag: 'Tối giản', bg: '#f2efe9', accent: '#323b3a' },
  { id: 'editorial', name: 'Tạp chí', tag: 'Thanh lịch', bg: '#f0e2d3', accent: '#9b4439' },
  { id: 'playful', name: 'Ngày rực rỡ', tag: 'Trẻ trung', bg: '#f6df9c', accent: '#82449b' },
  { id: 'luxury', name: 'Dấu ấn', tag: 'Cao cấp', bg: '#242c2a', accent: '#e8c794' },
  { id: 'sale', name: 'Deal nổi bật', tag: 'Khuyến mãi', bg: '#f8dfd6', accent: '#b74630' },
  { id: 'tech', name: 'Tương lai', tag: 'Công nghệ', bg: '#e4e8f4', accent: '#3e4fa0' },
  { id: 'warm', name: 'Mộc mạc', tag: 'Thủ công', bg: '#eddfc8', accent: '#806343' },
];
export const ratios: { id: RatioId; name: string; width: number; height: number }[] = [
  { id: '1:1', name: 'Bài đăng vuông', width: 1080, height: 1080 },
  { id: '4:5', name: 'Bài đăng dọc', width: 1080, height: 1350 },
  { id: '9:16', name: 'Story / Reels', width: 1080, height: 1920 },
  { id: '16:9', name: 'Banner ngang', width: 1920, height: 1080 },
  { id: '3:4', name: 'Poster dọc', width: 1080, height: 1440 },
  { id: 'A4', name: 'A4 · 210 × 297 mm', width: 2480, height: 3508 },
];
export const initialPoster: Poster = {
  name: 'Tinh dầu Thảo Mộc', description: 'Một chút an yên, một nét dịu dàng.\nCho những khoảnh khắc của riêng bạn.',
  brand: 'MỘC STUDIO', category: 'Làm đẹp & chăm sóc', price: '189.000đ', cta: 'Khám phá ngay', badge: 'BỘ SƯU TẬP MỚI',
  style: 'botanical', ratio: '1:1', accent: '#31564a',
  image: `${import.meta.env.BASE_URL}sample-product.svg`, originalImage: `${import.meta.env.BASE_URL}sample-product.svg`, fileName: 'Ảnh sản phẩm mẫu',
  imageScale: 1, imageX: 0, imageY: 0, rotation: -8, shadow: true, cutout: false,
};
export const categories = ['Sản phẩm khác', 'Làm đẹp & chăm sóc', 'Đồ ăn & thức uống', 'Thời trang & phụ kiện', 'Công nghệ', 'Đồ thủ công & trang trí'];
