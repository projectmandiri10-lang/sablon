// Menyimpan hasil mentah AI di IndexedDB tepat setelah panggilan AI berhasil,
// agar proses lokal (trace/ZIP/PDF) bisa diulang tanpa memanggil API AI lagi.

const DB_NAME = 'design-mudah-pending-ai';
const DB_VERSION = 1;
const STORE_NAME = 'pending';

function available() {
  return typeof window !== 'undefined' && 'indexedDB' in window;
}

function openDb() {
  return new Promise((resolve, reject) => {
    if (!available()) {
      reject(new Error('IndexedDB tidak tersedia.'));
      return;
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: 'ownerId' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Gagal membuka IndexedDB.'));
  });
}

function run(mode, action) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const request = action(tx.objectStore(STORE_NAME));
        tx.oncomplete = () => {
          db.close();
          resolve(request?.result);
        };
        tx.onerror = tx.onabort = () => {
          db.close();
          reject(tx.error || new Error('IndexedDB transaction gagal.'));
        };
      })
  );
}

export async function savePendingAiRecovery(record) {
  if (!record?.ownerId || !(record.aiRawPngBlob instanceof Blob)) return;
  await run('readwrite', (store) => store.put({ ...record, savedAt: new Date().toISOString() }));
}

export async function loadPendingAiRecovery(ownerId) {
  if (!ownerId || !available()) return null;
  try {
    return (await run('readonly', (store) => store.get(ownerId))) || null;
  } catch {
    return null;
  }
}

export async function clearPendingAiRecovery(ownerId) {
  if (!ownerId || !available()) return;
  try {
    await run('readwrite', (store) => store.delete(ownerId));
  } catch {
    // abaikan
  }
}

export function isStaleChunkError(error) {
  const message = String(error?.message || error || '');
  return /Failed to fetch dynamically imported module|Importing a module script failed|MIME type|Expected a JavaScript/i.test(message);
}
