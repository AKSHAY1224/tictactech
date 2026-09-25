// tests/storage.test.mjs — node:test suite for the storage wrapper with a fake localStorage
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

/** Minimal in-memory Storage implementation. */
function fakeStorage() {
  const map = new Map();
  return {
    get length() { return map.size; },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    clear: () => map.clear(),
    _map: map,
  };
}

/** Import a fresh module instance (query string busts the ESM cache). */
const fresh = (tag) => import(`../js/state/storage.js?${tag}`);

describe('storage.js with a working localStorage', () => {
  test('round-trips JSON values and lists keys', async () => {
    const fake = fakeStorage();
    Object.defineProperty(globalThis, 'localStorage', { value: fake, configurable: true, writable: true });
    const s = await fresh('ok1');
    assert.equal(s.isPersistent(), true);
    assert.equal(s.set('ttt.obj', { a: [1, 2], b: 'x' }), true);
    assert.deepEqual(s.get('ttt.obj', null), { a: [1, 2], b: 'x' });
    assert.equal(s.get('ttt.missing', 'fb'), 'fb');
    s.set('ttt.str', 'light');
    assert.equal(fake.getItem('ttt.str'), '"light"');
    assert.deepEqual(s.keys().sort(), ['ttt.obj', 'ttt.str']);
    s.remove('ttt.obj');
    assert.equal(s.get('ttt.obj', 'gone'), 'gone');
  });

  test('corrupt JSON returns the fallback and removes the entry', async () => {
    const fake = fakeStorage();
    Object.defineProperty(globalThis, 'localStorage', { value: fake, configurable: true, writable: true });
    fake.setItem('ttt.theme', '{oops');
    const s = await fresh('corrupt');
    assert.equal(s.get('ttt.theme', 'system'), 'system');
    assert.equal(fake.getItem('ttt.theme'), null, 'corrupt entry removed');
  });

  test('ensureVersion writes the schema marker and clearAll keeps it', async () => {
    const fake = fakeStorage();
    Object.defineProperty(globalThis, 'localStorage', { value: fake, configurable: true, writable: true });
    const s = await fresh('version');
    assert.equal(s.ensureVersion(), s.SCHEMA_VERSION);
    assert.equal(fake.getItem('ttt.v'), String(s.SCHEMA_VERSION));
    s.set('ttt.a', 1);
    s.set('ttt.b', 2);
    s.clearAll();
    assert.deepEqual(s.keys(), ['ttt.v']);
  });
});

describe('storage.js when localStorage is blocked', () => {
  test('a throwing storage falls back to memory without throwing', async () => {
    const throwing = new Proxy({}, { get() { throw new Error('SecurityError'); } });
    Object.defineProperty(globalThis, 'localStorage', { value: throwing, configurable: true, writable: true });
    const s = await fresh('throwing');
    assert.equal(s.isPersistent(), false);
    assert.doesNotThrow(() => s.set('ttt.x', [1]));
    assert.deepEqual(s.get('ttt.x', null), [1]);
    assert.doesNotThrow(() => s.remove('ttt.x'));
    assert.equal(s.get('ttt.x', 'fb'), 'fb');
  });

  test('a missing localStorage global also falls back to memory', async () => {
    Object.defineProperty(globalThis, 'localStorage', { value: undefined, configurable: true, writable: true });
    const s = await fresh('missing');
    assert.equal(s.isPersistent(), false);
    s.set('ttt.k', 'v');
    assert.equal(s.get('ttt.k', null), 'v');
    assert.deepEqual(s.keys(), ['ttt.k']);
  });

  test('quota errors on setItem fall back to memory for that key', async () => {
    const fake = fakeStorage();
    fake.setItem = () => { throw new Error('QuotaExceededError'); };
    Object.defineProperty(globalThis, 'localStorage', { value: fake, configurable: true, writable: true });
    const s = await fresh('quota');
    assert.equal(s.isPersistent(), false, 'probe write fails → not persistent');
    assert.equal(s.set('ttt.big', 'x'), false);
    assert.equal(s.get('ttt.big', null), 'x');
  });
});
