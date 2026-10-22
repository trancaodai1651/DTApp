export interface Connection { url: string; token: string }
export function connectionUrl(value: string) {
  if (!value.trim()) return '';
  const url = new URL(value.trim());
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Địa chỉ server phải là URL HTTP/HTTPS, không chứa thông tin đăng nhập hay tham số.');
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Kết nối server từ xa cần HTTPS để gửi ảnh an toàn.');
  return url.href.replace(/\/$/, '');
}
export async function apiRequest<T>(connection: Connection, endpoint: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const base = connectionUrl(connection.url);
  let response: Response;
  try { response = await fetch(`${base}/api/${endpoint}`, {
    method: body ? 'POST' : 'GET',
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(connection.token ? { Authorization: `Bearer ${connection.token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(90000)]) : AbortSignal.timeout(90000),
  }); } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error('Không thể kết nối server AI hoặc yêu cầu quá thời gian. Kiểm tra địa chỉ server và kết nối mạng.');
  }
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Chưa kết nối máy chủ AI. Mở Cài đặt và nhập địa chỉ server.');
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Server trả về lỗi ${response.status}.`);
  return data as T;
}
