/**
 * ONNX 모델 파일을 IndexedDB에 저장/로드합니다.
 * 브라우저와 Electron 렌더러 모두에서 동작합니다.
 */
const DB_NAME    = '3darch-onnx-models';
const DB_VERSION = 1;
const STORE_NAME = 'models';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      e.target.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror   = (e) => reject(e.target.error);
  });
}

/** 모델 ArrayBuffer를 IndexedDB에 저장합니다. */
export async function saveModel(id, buffer) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(buffer, id);
    tx.oncomplete = () => resolve();
    tx.onerror    = (e) => reject(e.target.error);
  });
}

/** IndexedDB에서 모델 ArrayBuffer를 읽습니다. 없으면 null 반환. */
export async function loadModel(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(id);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror   = (e) => reject(e.target.error);
  });
}

/** IndexedDB에서 모델을 삭제합니다. */
export async function removeModel(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror    = (e) => reject(e.target.error);
  });
}

/** 모델이 IndexedDB에 저장되어 있는지 확인합니다. */
export async function modelExists(id) {
  const buf = await loadModel(id);
  return buf != null;
}

/**
 * URL에서 모델 파일을 다운로드하고 IndexedDB에 저장합니다.
 * @param {string} id         모델 ID
 * @param {string} url        다운로드 URL
 * @param {Function} onProgress  (0~1) 진행률 콜백
 */
export async function downloadAndSave(id, url, onProgress) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} — ${url}`);

  const total   = parseInt(response.headers.get('Content-Length') ?? '0', 10);
  const reader  = response.body.getReader();
  const chunks  = [];
  let received  = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (total > 0) onProgress?.(received / total);
  }

  const merged = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  onProgress?.(1);
  await saveModel(id, merged.buffer);
}
