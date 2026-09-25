// ui/hud.js — turn indicator, scores, timer ring, toasts, console panel
const $ = (id) => document.getElementById(id);

/* ------------------------------------------------------------------ */
/* Scoreboard & turn indicator                                         */
/* ------------------------------------------------------------------ */

/**
 * Render chips, scores, active player, variant badge and the turn text.
 * @param {{ names: Record<number, string>, scores: Record<number, number>, current: number | null, variant: string, status: string, turnText?: string, timer?: boolean }} view
 */
export function renderHud(view) {
  const nameEls = { 1: $('name-p1'), 2: $('name-p2') };
  const scoreEls = { 1: $('score-p1'), 2: $('score-p2') };
  const chips = { 1: $('chip-p1'), 2: $('chip-p2') };
  for (const p of [1, 2]) {
    if (nameEls[p]) nameEls[p].textContent = view.names[p];
    if (scoreEls[p]) scoreEls[p].textContent = String(view.scores[p] ?? 0);
    if (chips[p]) chips[p].classList.toggle('is-active', view.status === 'playing' && view.current === p);
  }
  const badge = $('variant-badge');
  if (badge) badge.textContent = view.variant;
  const ring = $('timer-ring');
  if (ring) ring.hidden = !view.timer;
  if (view.turnText !== undefined) setTurnText(view.turnText, view.status === 'playing');
}

/**
 * Set the turn indicator text (a blinking block cursor is appended while playing).
 * @param {string} text
 * @param {boolean} [cursor=true]
 */
export function setTurnText(text, cursor = true) {
  const el = $('turn-indicator');
  if (!el) return;
  if (text.endsWith('…')) {
    // "computing…" → animated dots instead of the block cursor
    el.textContent = text.slice(0, -1);
    const d = document.createElement('span');
    d.className = 'dots';
    d.setAttribute('aria-hidden', 'true');
    d.textContent = '...';
    el.appendChild(d);
    return;
  }
  el.textContent = text;
  if (cursor) {
    const c = document.createElement('span');
    c.className = 'blink';
    c.setAttribute('aria-hidden', 'true');
    c.textContent = ' ▮';
    el.appendChild(c);
  }
}

/**
 * Announce to screen readers via the polite live region.
 * @param {string} text
 */
export function announce(text) {
  const el = $('live-region');
  if (!el) return;
  el.textContent = '';
  // Re-set on the next frame so identical consecutive messages are still announced.
  requestAnimationFrame(() => { el.textContent = text; });
}

/* ------------------------------------------------------------------ */
/* Toasts                                                              */
/* ------------------------------------------------------------------ */

/**
 * Show a toast. Returns the element (removed automatically after `duration` ms).
 * @param {string} message
 * @param {{ type?: 'info'|'error'|'ok', duration?: number, action?: { label: string, onClick: () => void } }} [opts]
 * @returns {HTMLElement | null}
 */
export function toast(message, opts = {}) {
  const host = $('toasts');
  if (!host) return null;
  const el = document.createElement('div');
  el.className = `toast${opts.type && opts.type !== 'info' ? ` toast--${opts.type}` : ''}`;
  el.setAttribute('role', opts.type === 'error' ? 'alert' : 'status');
  const text = document.createElement('span');
  text.textContent = message;
  el.appendChild(text);
  if (opts.action) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn--primary';
    btn.textContent = opts.action.label;
    btn.addEventListener('click', () => { opts.action?.onClick(); dismiss(); });
    el.appendChild(btn);
  }
  // keep at most 3 toasts on screen
  while (host.children.length >= 3) host.firstElementChild?.remove();
  host.appendChild(el);
  let timer = 0;
  const dismiss = () => {
    clearTimeout(timer);
    if (!el.isConnected) return;
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 230);
  };
  const duration = opts.duration ?? (opts.action ? 8000 : 2200);
  if (duration > 0) timer = window.setTimeout(dismiss, duration);
  return el;
}

/* ------------------------------------------------------------------ */
/* Console panel                                                       */
/* ------------------------------------------------------------------ */

const MAX_LINES = 100;
let consoleStart = performance.now();

function stamp() {
  const s = Math.floor((performance.now() - consoleStart) / 1000);
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `[${mm}:${ss}]`;
}

export const consoleLog = {
  /** Restart the timestamp clock (new session). */
  reset() { consoleStart = performance.now(); },
  /**
   * Append a line. `cls` is one of p1 | p2 | sys | err | ok.
   * @param {string} text
   * @param {string} [cls='sys']
   */
  line(text, cls = 'sys') {
    const list = $('console-lines');
    if (!list) return;
    const li = document.createElement('li');
    li.className = `is-${cls}`;
    li.textContent = `${stamp()} ${text}`;
    list.appendChild(li);
    while (list.children.length > MAX_LINES) list.firstElementChild?.remove();
    list.scrollTop = list.scrollHeight;
  },
  clear() {
    const list = $('console-lines');
    if (list) list.replaceChildren();
  },
  /** @param {boolean} open */
  setOpen(open) {
    const panel = $('console');
    const btn = $('btn-console');
    if (panel) panel.hidden = !open;
    if (btn) btn.setAttribute('aria-expanded', String(open));
    if (open) { const list = $('console-lines'); if (list) list.scrollTop = list.scrollHeight; }
  },
  isOpen() {
    const panel = $('console');
    return !!panel && !panel.hidden;
  },
};

/* ------------------------------------------------------------------ */
/* Result overlay                                                      */
/* ------------------------------------------------------------------ */

/**
 * Show the end-of-game overlay.
 * @param {{ status: string, title: string, sub?: string, tone?: 'ok'|'err'|'draw' }} r
 */
export function showResult(r) {
  const overlay = $('result-overlay');
  if (!overlay) return;
  const status = $('result-status');
  const title = $('result-title');
  const sub = $('result-sub');
  if (status) { status.textContent = r.status; status.className = `result-card__status mono tone-${r.tone || 'ok'}`; }
  if (title) title.textContent = r.title;
  if (sub) sub.textContent = r.sub || '';
  overlay.hidden = false;
  requestAnimationFrame(() => $('btn-again')?.focus({ preventScroll: true }));
}

/** Hide the end-of-game overlay. */
export function hideResult() {
  const overlay = $('result-overlay');
  if (overlay) overlay.hidden = true;
}

/** @returns {boolean} */
export function isResultOpen() {
  const overlay = $('result-overlay');
  return !!overlay && !overlay.hidden;
}

/* ------------------------------------------------------------------ */
/* Blitz timer (rAF, performance.now based, pausable)                  */
/* ------------------------------------------------------------------ */

const CIRC = 2 * Math.PI * 20; // r=20 in the 48×48 ring
let raf = 0;
let endAt = 0;
let total = 0;
let pausedRemaining = -1;
let lastWhole = -1;
/** @type {{ onTick?: (secondsLeft: number) => void, onTimeout?: () => void }} */
let callbacks = {};

function paint(remainingMs) {
  const ring = $('timer-ring');
  const fill = ring?.querySelector('.timer-ring__fill');
  const text = $('timer-text');
  const frac = total > 0 ? Math.max(0, remainingMs / total) : 0;
  if (fill instanceof SVGElement) fill.style.strokeDashoffset = String(CIRC * (1 - frac));
  const whole = Math.ceil(remainingMs / 1000);
  if (text) text.textContent = String(whole);
  if (ring) {
    ring.classList.toggle('is-warn', frac <= 0.4 && frac > 0.2);
    ring.classList.toggle('is-danger', frac <= 0.2);
  }
  if (whole !== lastWhole) {
    lastWhole = whole;
    if (callbacks.onTick) callbacks.onTick(whole);
  }
}

function tick() {
  const remaining = endAt - performance.now();
  if (remaining <= 0) {
    paint(0);
    raf = 0;
    const cb = callbacks.onTimeout;
    callbacks = {};
    if (cb) cb();
    return;
  }
  paint(remaining);
  raf = requestAnimationFrame(tick);
}

export const timer = {
  /**
   * Start (or restart) a countdown.
   * @param {number} seconds
   * @param {{ onTick?: (secondsLeft: number) => void, onTimeout?: () => void }} cbs
   */
  start(seconds, cbs = {}) {
    timer.stop();
    callbacks = cbs;
    total = seconds * 1000;
    endAt = performance.now() + total;
    lastWhole = -1;
    pausedRemaining = -1;
    const ring = $('timer-ring');
    if (ring) ring.hidden = false;
    paint(total);
    raf = requestAnimationFrame(tick);
  },
  /** Stop and clear callbacks (ring keeps its last frame). */
  stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    callbacks = {};
    pausedRemaining = -1;
  },
  /** Pause (e.g. tab hidden). */
  pause() {
    if (!raf) return;
    cancelAnimationFrame(raf);
    raf = 0;
    pausedRemaining = Math.max(0, endAt - performance.now());
  },
  /** Resume after pause. */
  resume() {
    if (pausedRemaining < 0 || raf) return;
    endAt = performance.now() + pausedRemaining;
    pausedRemaining = -1;
    raf = requestAnimationFrame(tick);
  },
  /** @returns {boolean} */
  isRunning() { return raf !== 0; },
  /** @returns {number} milliseconds left (also while paused) */
  remaining() { return pausedRemaining >= 0 ? pausedRemaining : (raf ? Math.max(0, endAt - performance.now()) : 0); },
  /** Hide the ring entirely. */
  hide() {
    timer.stop();
    const ring = $('timer-ring');
    if (ring) ring.hidden = true;
  },
};
