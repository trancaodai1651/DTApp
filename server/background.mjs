import * as ort from 'onnxruntime-node';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const modelPath = fileURLToPath(new URL('./models/u2net.onnx', import.meta.url));
let sessionPromise;
export function loadSession() {
  sessionPromise ??= ort.InferenceSession.create(modelPath, { executionProviders: ['cpu'], intraOpNumThreads: 2, interOpNumThreads: 1, graphOptimizationLevel: 'all' }).catch(error => { sessionPromise = undefined; throw error; });
  return sessionPromise;
}
export async function removeBackground(imageBuffer) {
  const session = await loadSession();
  const original = await sharp(imageBuffer, { limitInputPixels: 40_000_000 }).rotate().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = original.info;
  const rgb = await sharp(original.data, { raw: { width, height, channels: 4 } }).resize(320, 320, { fit: 'fill', kernel: 'lanczos3' }).removeAlpha().raw().toBuffer();
  const size = 320 * 320;
  const input = new Float32Array(3 * size); let max = 1;
  for (const value of rgb) max = Math.max(max, value);
  const means = [.485, .456, .406], std = [.229, .224, .225];
  for (let i = 0; i < size; i++) for (let c = 0; c < 3; c++) input[c * size + i] = (rgb[i * 3 + c] / max - means[c]) / std[c];
  const outputs = await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, 320, 320]) });
  const prediction = outputs[session.outputNames[0]].data;
  let min = Infinity, high = -Infinity;
  for (let i = 0; i < size; i++) { min = Math.min(min, prediction[i]); high = Math.max(high, prediction[i]); }
  if (high - min < 1e-6) throw new Error('Không thấy sản phẩm rõ ràng. Hãy thử ảnh có nền tương phản hơn.');
  const mask = Buffer.alloc(size);
  for (let i = 0; i < size; i++) mask[i] = Math.round((prediction[i] - min) / (high - min) * 255);
  // The model input was stretched to a square. Stretch back; Sharp's default
  // 'cover' fit would crop the mask and create a wide halo on non-square photos.
  const alpha = await sharp(mask, { raw: { width: 320, height: 320, channels: 1 } }).resize(width, height, { fit: 'fill', kernel: 'cubic' }).extractChannel(0).raw().toBuffer();
  if (alpha.length !== width * height) throw new Error('Mặt nạ nền không đúng kích thước. Hãy thử lại.');
  let left = width, right = 0, top = height, bottom = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const pixel = y * width + x;
    original.data[pixel * 4 + 3] = Math.round(original.data[pixel * 4 + 3] * alpha[pixel] / 255);
    if (original.data[pixel * 4 + 3] > 32) { left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); }
  }
  if (left > right || right - left < 4 || bottom - top < 4) throw new Error('Không tìm thấy sản phẩm. Hãy thử ảnh khác.');
  left = Math.max(0, left - 8); top = Math.max(0, top - 8); right = Math.min(width - 1, right + 8); bottom = Math.min(height - 1, bottom + 8);
  const output = await sharp(original.data, { raw: { width, height, channels: 4 } }).extract({ left, top, width: right - left + 1, height: bottom - top + 1 }).png().toBuffer();
  return { image: `data:image/png;base64,${output.toString('base64')}`, width: right - left + 1, height: bottom - top + 1 };
}
