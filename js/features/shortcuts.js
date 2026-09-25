// features/shortcuts.js — keyboard shortcut map, Konami code

/** Shortcut reference (also rendered statically in the Shortcuts modal). */
export const SHORTCUTS = [
  ['1–9', 'place mark (reading order)'],
  ['← ↑ ↓ →', 'move focus on board'],
  ['Enter / Space', 'place mark'],
  ['R', 'reboot game'],
  ['U', 'undo'],
  ['H', 'hint'],
  ['N', 'new session (after game over)'],
  ['T', 'toggle theme'],
  ['M', 'mute / unmute'],
  ['C', 'toggle console'],
  ['Esc', 'close'],
  ['?', 'shortcuts help'],
];

export const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
const LOGO_TAPS = 7;
const TAP_WINDOW_MS = 4000;

/**
 * True when a key event originates from a text-entry element (shortcuts must not fire).
 * @param {EventTarget | null} target
 */
export function isTypingTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

/**
 * Watch for the Konami sequence (keyboard) or 7 quick logo taps (touch/mouse).
 * @param {{ onTrigger: () => void, logo?: HTMLElement | null }} opts
 * @returns {() => void} dispose
 */
export function initKonami(opts) {
  let progress = 0;
  const onKey = (e) => {
    if (isTypingTarget(e.target)) return;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (key === KONAMI[progress]) {
      progress++;
      if (progress === KONAMI.length) { progress = 0; opts.onTrigger(); }
    } else {
      progress = key === KONAMI[0] ? 1 : 0;
    }
  };
  document.addEventListener('keydown', onKey);

  let taps = 0;
  let firstTapAt = 0;
  const onTap = () => {
    const now = performance.now();
    if (now - firstTapAt > TAP_WINDOW_MS) { taps = 0; firstTapAt = now; }
    taps++;
    if (taps >= LOGO_TAPS) { taps = 0; opts.onTrigger(); }
  };
  if (opts.logo) opts.logo.addEventListener('click', onTap);

  return () => {
    document.removeEventListener('keydown', onKey);
    if (opts.logo) opts.logo.removeEventListener('click', onTap);
  };
}
