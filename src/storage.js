/*
 * Safe access to everything Intervo keeps in the browser. Stored data can be missing, corrupt or
 * written by an older build; reading it must never stop the app from starting.
 *
 * Bump STORAGE_VERSION whenever the shape of any stored value changes. On start,
 * migrateStorage() clears Intervo's own keys when the saved version differs.
 */
export const STORAGE_VERSION = 2;

const PREFIX = "intervo.";
const VERSION_KEY = "intervo.storageVersion";
const THEME_KEY = "intervo.theme"; // a harmless preference: kept on a version change, wiped on a manual reset
const FILES_DB = "intervo-files"; // IndexedDB with the original CV files (local mode)

const stores = () => {
  const list = [];
  try { list.push(window.localStorage); } catch { /* blocked */ }
  try { list.push(window.sessionStorage); } catch { /* blocked */ }
  return list;
};

/** Removes every Intervo key from local + session storage. Other sites' and apps' keys are never touched. */
function removeKeys(keep = []) {
  for (const s of stores()) {
    try {
      const doomed = [];
      for (let i = 0; i < s.length; i++) {
        const k = s.key(i);
        if (k && k.startsWith(PREFIX) && !keep.includes(k)) doomed.push(k);
      }
      doomed.forEach((k) => s.removeItem(k));
    } catch {
      /* blocked */
    }
  }
}

/** Raw string read; "" / null on any failure. */
export function readRaw(key, store = "local") {
  try {
    return (store === "session" ? window.sessionStorage : window.localStorage).getItem(key);
  } catch {
    return null;
  }
}

/**
 * Parsed JSON read. When the value is missing, not valid JSON, or fails `validate`,
 * only that key is deleted and `fallback` is returned.
 */
export function readJSON(key, validate, fallback = null) {
  const raw = readRaw(key);
  if (raw == null) return fallback;
  try {
    const value = JSON.parse(raw);
    if (!validate || validate(value)) return value;
  } catch {
    /* corrupt JSON */
  }
  try { window.localStorage.removeItem(key); } catch { /* blocked */ }
  return fallback;
}

export const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/** Call once, before the app renders. Clears Intervo's keys when the stored data is from another version. */
export function migrateStorage() {
  if (readRaw(VERSION_KEY) === String(STORAGE_VERSION)) return;
  removeKeys([THEME_KEY]);
  try { window.localStorage.setItem(VERSION_KEY, String(STORAGE_VERSION)); } catch { /* blocked */ }
}

/** The "Reset and reload" button: clears all of Intervo's data (not other sites') and reloads. */
export function resetAndReload() {
  removeKeys();
  try { window.indexedDB?.deleteDatabase(FILES_DB); } catch { /* blocked */ }
  try { window.localStorage.setItem(VERSION_KEY, String(STORAGE_VERSION)); } catch { /* blocked */ }
  try { window.location.hash = ""; } catch { /* ignore */ }
  window.location.reload();
}
