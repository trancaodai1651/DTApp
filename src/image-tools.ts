import { loadImage } from './renderer';

export async function readProduct(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Hãy chọn ảnh JPG, PNG hoặc WebP.');
  if (file.size > 20 * 1024 * 1024) throw new Error('Ảnh tối đa 20 MB. Hãy giảm dung lượng rồi thử lại.');
  // Decode once with the browser, including EXIF orientation. Keep working memory bounded.
  const bitmap = await createImageBitmap(file);
  if (bitmap.width * bitmap.height > 80_000_000) { bitmap.close(); throw new Error('Ảnh quá lớn. Hãy dùng ảnh dưới 80 megapixel.'); }
  const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
  return canvas.toDataURL('image/png');
}

export async function visionImage(src: string) {
  const image = await loadImage(src); const scale = Math.min(1, 900 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas'); canvas.width = Math.round(image.naturalWidth * scale); canvas.height = Math.round(image.naturalHeight * scale);
  const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', .83);
}

export async function backgroundImage(src: string) {
  if (src.startsWith('data:')) return src;
  const image = await loadImage(src);
  const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  canvas.getContext('2d')!.drawImage(image, 0, 0);
  return canvas.toDataURL('image/png');
}
