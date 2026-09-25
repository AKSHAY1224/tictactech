// state/storage.js — versioned, safe localStorage wrapper that never throws (memory fallback)

/** Current schema version written to `ttt.v`. Bump when stored shapes change. */
export const SCHEMA_VERSION = 1;
const VERSION_KEY = 'ttt.v';
const PREFIX = 'ttt.';

/** In-memory fallback used when localStorage is unavailable (private mode, blocked storage). */
const memory = new Map();

/** @type {Storage | null} */
let backend = null;
let probed = false;

/**
 * Detect a usable Storage backend once. Returns null when storage is blocked.
 * @returns {Storage | null}
 */
function getBackend() {
  if (probed) return backend;
  probed = true;
  try {
    const store = globalThis.localStorage;
    if (!store) return (backend = null);
    const probe = `${PREFIX}__probe`;
    store.setItem(probe, '1');
    store.removeItem(probe);
    backend = store;
  } catch {
    backend = null;
  }
  return backend;
}

/**
 * True when values persist across reloads (real localStorage available).
 * @returns {boolean}
 */
export function isPersistent() {
  return getBackend() !== null;
}

/**
 * Read a JSON value. Corrupt entries are removed and the fallback returned.
 * @template T
 * @param {string} key full key, e.g. "ttt.theme"
 * @param {T} fallback
 * @returns {T}
 */
export function get(key, fallback) {
  const store = getBackend();
  let raw = null;
  try {
    raw = store ? store.getItem(key) : (memory.has(key) ? memory.get(key) : null);
  } catch {
    raw = null;
  }
  if (raw === null || raw === undefined) return fallback;
  try {
    return /** @type {T} */ (JSON.parse(raw));
  } catch {
    remove(key);
    return fallback;
  }
}

/**
 * Write a JSON-serialisable value. Never throws.
 * @param {string} key
 * @param {unknown} value
 * @returns {boolean} true when written to a persistent backend
 */
export function set(key, value) {
  let raw;
  try {
    raw = JSON.stringify(value);
  } catch {
    return false;
  }
  const store = getBackend();
  if (store) {
    try {
      store.setItem(key, raw);
      return true;
    } catch {
      /* quota or blocked: fall through to memory */
    }
  }
  memory.set(key, raw);
  return false;
}

/**
 * Remove a key from whichever backend holds it.
 * @param {string} key
 */
export function remove(key) {
  memory.delete(key);
  const store = getBackend();
  if (!store) return;
  try {
    store.removeItem(key);
  } catch {
    /* ignore */
  }
}

/**
 * List all app keys (prefixed with "ttt.").
 * @returns {string[]}
 */
export function keys() {
  const out = new Set(memory.keys());
  const store = getBackend();
  if (store) {
    try {
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i);
        if (k && k.startsWith(PREFIX)) out.add(k);
      }
    } catch {
      /* ignore */
    }
  }
  return [...out];
}

/**
 * Remove every app key except the schema version.
 */
export function clearAll() {
  keys().forEach((k) => { if (k !== VERSION_KEY) remove(k); });
}

/**
 * Ensure the schema version marker exists. Future migrations hook in here.
 * @returns {number} the version now stored
 */
export function ensureVersion() {
  const current = get(VERSION_KEY, 0);
  if (current !== SCHEMA_VERSION) set(VERSION_KEY, SCHEMA_VERSION);
  return SCHEMA_VERSION;
}
