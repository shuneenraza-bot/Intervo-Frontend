/*
 * Original CV files for local mode (no backend): kept in the browser's IndexedDB, not in
 * localStorage, because a CV can be up to 5 MB. With the backend on, the server stores the files
 * and none of this is used. Every function resolves (never throws): where IndexedDB is blocked
 * (some private windows) saving returns an entry without an `id`, and the page then says the
 * original file isn't available.
 */
const DB_NAME = "intervo-files";
const STORE = "cv";

function open() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("no indexedDB"));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run(mode, fn) {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req?.result);
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

const randomId = () => `cvf-${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;

/** Stores the file. Resolves with { id, name, size, contentType, uploadedAt } (id is null if it couldn't be stored). */
export async function saveCVFile(blob, name) {
  const info = { id: null, name, size: blob.size, contentType: blob.type || "application/octet-stream", uploadedAt: Date.now() };
  try {
    const id = randomId();
    await run("readwrite", (s) => s.put(blob, id));
    info.id = id;
  } catch {
    /* storage blocked — the CV is still analysed, only the original isn't kept */
  }
  return info;
}

/** The stored Blob, or null. */
export async function readCVFile(id) {
  if (!id) return null;
  try {
    return (await run("readonly", (s) => s.get(id))) || null;
  } catch {
    return null;
  }
}

export async function removeCVFile(id) {
  if (!id) return;
  try {
    await run("readwrite", (s) => s.delete(id));
  } catch {
    /* nothing to clean up */
  }
}
