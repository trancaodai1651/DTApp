export type AIProviderId = 'openai' | 'gemini' | 'anthropic' | 'grok';

export interface AIProfile {
  id: string;
  name: string;
  provider: AIProviderId;
  apiKey: string;
  model: string;
}

const DB_NAME = 'dt-poster-secure-settings';
const DB_VERSION = 1;
const PROFILE_KEY = 'profiles';
const CRYPTO_KEY = 'device-key';
const providers = new Set<AIProviderId>(['openai', 'gemini', 'anthropic', 'grok']);

function cleanProfiles(value: unknown): AIProfile[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 20).flatMap((item): AIProfile[] => {
    if (!item || typeof item !== 'object') return [];
    const profile = item as Partial<AIProfile>;
    if (typeof profile.id !== 'string' || profile.id.length > 80 || typeof profile.name !== 'string' || profile.name.length > 80 || !providers.has(profile.provider as AIProviderId) || typeof profile.apiKey !== 'string' || profile.apiKey.length > 4096 || typeof profile.model !== 'string' || profile.model.length > 128) return [];
    return [{ id: profile.id, name: profile.name, provider: profile.provider as AIProviderId, apiKey: profile.apiKey, model: profile.model }];
  });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('keys')) db.createObjectStore('keys', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('vault')) db.createObjectStore('vault', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Không mở được kho API an toàn trên thiết bị.'));
  });
}

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Không đọc được kho API.'));
  });
}

async function browserKey(db: IDBDatabase): Promise<CryptoKey> {
  const existing = await requestValue(db.transaction('keys', 'readonly').objectStore('keys').get(CRYPTO_KEY)) as { id: string; key: CryptoKey } | undefined;
  if (existing?.key) return existing.key;
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('keys', 'readwrite');
    tx.objectStore('keys').put({ id: CRYPTO_KEY, key });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Không thể tạo kho API an toàn.'));
    tx.onabort = () => reject(tx.error || new Error('Không thể tạo kho API an toàn.'));
  });
  return key;
}

function toBase64(bytes: Uint8Array) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function fromBase64(value: string) {
  return Uint8Array.from(atob(value), character => character.charCodeAt(0));
}

export async function loadAIProfiles(): Promise<AIProfile[]> {
  if (window.dtPosterSecureStore) return cleanProfiles(await window.dtPosterSecureStore.loadAIProfiles());
  if (!globalThis.crypto?.subtle || !globalThis.indexedDB) throw new Error('Trình duyệt này chưa hỗ trợ kho API được mã hoá. Hãy cập nhật trình duyệt hoặc dùng app desktop.');
  const db = await openDatabase();
  try {
    const record = await requestValue(db.transaction('vault', 'readonly').objectStore('vault').get(PROFILE_KEY)) as { id: string; iv: string; data: string } | undefined;
    if (!record) return [];
    const key = await browserKey(db);
    const clear = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(record.iv) }, key, fromBase64(record.data));
    return cleanProfiles(JSON.parse(new TextDecoder().decode(clear)));
  } catch {
    throw new Error('Không giải mã được kho API trên trình duyệt này. Hãy thử xóa kho API cũ hoặc dùng lại đúng trình duyệt đã lưu.');
  } finally { db.close(); }
}

export async function saveAIProfiles(profiles: AIProfile[]): Promise<void> {
  const safe = cleanProfiles(profiles);
  if (safe.length > 20) throw new Error('Mỗi thiết bị lưu tối đa 20 API.');
  if (window.dtPosterSecureStore) return window.dtPosterSecureStore.saveAIProfiles(safe);
  if (!globalThis.crypto?.subtle || !globalThis.indexedDB) throw new Error('Trình duyệt này chưa hỗ trợ kho API được mã hoá. Hãy cập nhật trình duyệt hoặc dùng app desktop.');
  const db = await openDatabase();
  try {
    const key = await browserKey(db);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(safe)));
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('vault', 'readwrite');
      tx.objectStore('vault').put({ id: PROFILE_KEY, iv: toBase64(iv), data: toBase64(new Uint8Array(data)) });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Không thể lưu API trên thiết bị.'));
      tx.onabort = () => reject(tx.error || new Error('Không thể lưu API trên thiết bị.'));
    });
  } finally { db.close(); }
}

declare global {
  interface Window {
    dtPosterSecureStore?: {
      loadAIProfiles(): Promise<unknown>;
      saveAIProfiles(profiles: AIProfile[]): Promise<void>;
      openOAuthURL(url: string): Promise<void>;
      onOAuthCallback(callback: (url: string) => void): () => void;
    };
  }
}
