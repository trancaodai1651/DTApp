import type { Poster } from './model';
export interface SavedProject { id: string; name: string; savedAt: number; poster: Poster; thumbnail: string }
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('dt-poster-studio', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('projects', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Không thể mở bộ nhớ thiết bị.'));
  });
}
async function run<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('projects', mode);
    const req = operation(tx.objectStore('projects'));
    tx.oncomplete = () => { db.close(); resolve(req.result); };
    tx.onerror = () => { db.close(); reject(new Error('Không thể lưu. Bộ nhớ có thể đã đầy.')); };
    tx.onabort = () => { db.close(); reject(new Error('Thao tác bộ nhớ bị huỷ.')); };
  });
}
export async function saveProject(project: SavedProject) { await run('readwrite', store => store.put(project)); }
export async function getProjects() { return (await run('readonly', store => store.getAll()) as SavedProject[]).sort((a, b) => b.savedAt - a.savedAt); }
export async function deleteProject(id: string) { await run('readwrite', store => store.delete(id)); }
