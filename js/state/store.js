// state/store.js — single app state with subscribe/setState (tiny pub/sub, immutable updates)

/** Default user settings (persisted under `ttt.settings` from Step 11). */
export const DEFAULT_SETTINGS = Object.freeze({
  theme: 'system',
  accent: 'neon',
  symbols: 'code',
  names: { 1: 'USER_1', 2: 'USER_2', user: 'USER' },
  firstMove: 'you',
  blitzSeconds: 5,
  sound: true,
  haptics: true,
  cursor: true,
  cursorTrail: false,
  background: true,
  backgroundStyle: 'network',
  scanlines: 'auto',
  reducedMotion: false,
});

export const SYMBOL_PACK_IDS = ['code', 'binary', 'classic', 'circuit'];
export const FIRST_MOVE_OPTIONS = ['you', 'bot', 'alternate', 'random'];
export const NAME_MAX = 12;

/**
 * Validate stored settings: unknown keys dropped, wrong types replaced by defaults, names trimmed.
 * @param {unknown} raw
 * @returns {typeof DEFAULT_SETTINGS}
 */
export function normalizeSettings(raw) {
  const d = DEFAULT_SETTINGS;
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? /** @type {any} */ (raw) : {};
  const bool = (v, fb) => (typeof v === 'boolean' ? v : fb);
  const oneOf = (v, list, fb) => (list.includes(v) ? v : fb);
  const name = (v, fb) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, NAME_MAX) : fb);
  const rn = r.names && typeof r.names === 'object' ? r.names : {};
  return {
    theme: oneOf(r.theme, ['dark', 'light', 'system'], d.theme),
    accent: oneOf(r.accent, ['neon', 'synthwave', 'matrix'], d.accent),
    symbols: oneOf(r.symbols, SYMBOL_PACK_IDS, d.symbols),
    names: { 1: name(rn[1], d.names[1]), 2: name(rn[2], d.names[2]), user: name(rn.user, d.names.user) },
    firstMove: oneOf(r.firstMove, FIRST_MOVE_OPTIONS, d.firstMove),
    blitzSeconds: [3, 5, 10].includes(r.blitzSeconds) ? r.blitzSeconds : d.blitzSeconds,
    sound: bool(r.sound, d.sound),
    haptics: bool(r.haptics, d.haptics),
    cursor: bool(r.cursor, d.cursor),
    cursorTrail: bool(r.cursorTrail, d.cursorTrail),
    background: bool(r.background, d.background),
    backgroundStyle: oneOf(r.backgroundStyle, ['network', 'rain'], 'network'),
    scanlines: oneOf(r.scanlines, ['auto', 'on', 'off'], d.scanlines),
    reducedMotion: bool(r.reducedMotion, d.reducedMotion),
  };
}

/**
 * Build the initial application state.
 * @param {unknown} [settings] raw stored settings (validated)
 * @returns {object}
 */
export function createInitialState(settings = {}) {
  return {
    screen: 'menu',
    settings: normalizeSettings(settings),
    menu: { mode: 'bot', variant: 'classic', difficulty: 'medium' },
    /** Active game config + engine state (null on the menu). */
    game: null,
    config: null,
    /** Per-session scoreboard; reset when the mode/variant changes. */
    session: { scores: { 1: 0, 2: 0 }, draws: 0, lastStarter: null, lastLoser: null, key: '' },
    ui: { botThinking: false, animating: false, consoleOpen: false, resultOpen: false },
  };
}

/**
 * Create a minimal store. `setState` accepts a partial object or an updater function
 * and always produces a new top-level state object.
 * @template T
 * @param {T} initial
 * @returns {{ getState: () => T, setState: (update: Partial<T> | ((s: T) => Partial<T> | null)) => T, subscribe: (fn: (s: T, prev: T) => void) => () => void }}
 */
export function createStore(initial) {
  let state = initial;
  /** @type {Set<(s: T, prev: T) => void>} */
  const subs = new Set();
  return {
    getState: () => state,
    setState(update) {
      const partial = typeof update === 'function' ? update(state) : update;
      if (!partial) return state;
      const prev = state;
      state = { ...state, ...partial };
      subs.forEach((fn) => fn(state, prev));
      return state;
    },
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
}
