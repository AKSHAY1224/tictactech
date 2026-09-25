// ui/cursor.js — custom cursor (dot + ring + trail), fine-pointer devices only

const FINE = '(hover: hover) and (pointer: fine)';
const REDUCED = '(prefers-reduced-motion: reduce)';
const LERP = 0.18;
const TRAIL_MAX = 24;
const TRAIL_LIFE = 400;

const HOVER_SEL = 'a, button:not(:disabled), [role="button"], .segmented__label, label, summary, [data-cursor="hover"]';
const TEXT_SEL = 'input:not([type="radio"]):not([type="checkbox"]):not([type="range"]), textarea, [contenteditable="true"]';

const state = {
  settingOn: true,
  trailOn: false,
  active: false,
  visible: false,
  x: -100, y: -100,
  rx: -100, ry: -100,
  scale: 1,
  targetScale: 1,
  pressed: false,
  hover: '',
  appliedHover: '',
  raf: 0,
  /** @type {HTMLElement | null} */ layer: null,
  /** @type {boolean | null} */ popover: null,
  suspended: false,
  /** @type {HTMLElement | null} */ dot: null,
  /** @type {HTMLElement | null} */ ring: null,
  /** @type {HTMLCanvasElement | null} */ trail: null,
  /** @type {CanvasRenderingContext2D | null} */ tctx: null,
  particles: /** @type {{ x: number, y: number, t: number }[]} */ ([]),
  lastTrailAt: 0,
};

const reduced = () => window.matchMedia(REDUCED).matches || document.documentElement.dataset.motion === 'reduced';
const shouldActivate = () => state.settingOn && window.matchMedia(FINE).matches && !reduced();

/**
 * All cursor visuals live in one fixed, click-through layer. Modals (<dialog>) render in the
 * browser's top layer above everything, so the layer is itself a manual popover (also top layer)
 * and is re-raised whenever a modal opens. Without Popover support we fall back to the native cursor
 * while a modal is open.
 */
function ensureElements() {
  if (state.dot) return;
  const layer = document.createElement('div');
  layer.className = 'cursor-layer';
  layer.setAttribute('aria-hidden', 'true');
  state.popover = typeof layer.showPopover === 'function';
  if (state.popover) layer.setAttribute('popover', 'manual');
  const dot = document.createElement('div');
  dot.className = 'cursor-dot';
  const ring = document.createElement('div');
  ring.className = 'cursor-ring';
  layer.append(ring, dot);
  document.body.appendChild(layer);
  state.layer = layer;
  state.dot = dot;
  state.ring = ring;
}

/** Put the cursor layer above every open modal (top layer order = show order). */
function raiseLayer() {
  const { layer } = state;
  if (!layer || !state.active || !state.popover) return;
  try {
    if (layer.matches(':popover-open')) layer.hidePopover();
    layer.showPopover();
  } catch {
    /* ignore */
  }
}

function lowerLayer() {
  const { layer } = state;
  if (!layer || !state.popover) return;
  try { if (layer.matches(':popover-open')) layer.hidePopover(); } catch { /* ignore */ }
}

function ensureTrail() {
  if (state.trail) return;
  const c = document.createElement('canvas');
  c.className = 'cursor-trail';
  c.setAttribute('aria-hidden', 'true');
  (state.layer || document.body).prepend(c);
  state.trail = c;
  state.tctx = c.getContext('2d');
  const size = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = Math.round(window.innerWidth * dpr);
    c.height = Math.round(window.innerHeight * dpr);
    state.tctx && state.tctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  size();
  let t = 0;
  window.addEventListener('resize', () => { clearTimeout(t); t = window.setTimeout(size, 150); });
}

/**
 * Classify what is under the pointer (read-only; applied in the rAF loop).
 * @param {EventTarget | null} target
 * @returns {string}
 */
function classify(target) {
  if (!(target instanceof Element)) return '';
  if (target.closest(TEXT_SEL)) return 'text';
  const cell = target.closest('.board__cell');
  if (cell) return cell.classList.contains('is-taken') ? 'taken' : 'hover';
  if (target.closest(HOVER_SEL)) return 'hover';
  return '';
}

function onMove(e) {
  if (e.pointerType && e.pointerType !== 'mouse') return;
  state.x = e.clientX;
  state.y = e.clientY;
  state.hover = classify(e.target);
  if (!state.visible) { state.visible = true; state.rx = state.x; state.ry = state.y; }
  if (state.trailOn && !reduced()) {
    const now = performance.now();
    if (now - state.lastTrailAt > 16) {
      state.lastTrailAt = now;
      if (state.particles.length >= TRAIL_MAX) state.particles.shift();
      state.particles.push({ x: state.x, y: state.y, t: now });
    }
  }
}
function onDown(e) { if (!e.pointerType || e.pointerType === 'mouse') state.pressed = true; }
function onUp(e) { if (!e.pointerType || e.pointerType === 'mouse') state.pressed = false; }
function onLeave(e) { if (!e.relatedTarget && !e.toElement) state.visible = false; }
function onEnter() { state.visible = true; }
function onClick(e) {
  if (reduced() || !state.active) return;
  if (e.pointerType && e.pointerType !== 'mouse') return;
  const burst = document.createElement('div');
  burst.className = 'cursor-burst';
  burst.setAttribute('aria-hidden', 'true');
  burst.style.setProperty('--x', `${e.clientX}px`);
  burst.style.setProperty('--y', `${e.clientY}px`);
  (state.layer || document.body).appendChild(burst);
  burst.addEventListener('animationend', () => burst.remove(), { once: true });
  setTimeout(() => burst.isConnected && burst.remove(), 600);
}

function frame(now) {
  state.raf = requestAnimationFrame(frame);
  const { dot, ring } = state;
  if (!dot || !ring) return;
  // ring follows with a lerp; dot is instant
  state.rx += (state.x - state.rx) * LERP;
  state.ry += (state.y - state.ry) * LERP;
  let target = 1;
  if (state.hover === 'hover') target = 1.6;
  else if (state.hover === 'taken') target = 1.2;
  if (state.pressed) target *= 0.6;
  state.scale += (target - state.scale) * 0.25;
  dot.style.transform = `translate3d(${state.x}px, ${state.y}px, 0) scale(${state.pressed ? 0.7 : 1})`;
  const textMode = state.hover === 'text';
  ring.style.transform = textMode
    ? `translate3d(${state.rx}px, ${state.ry}px, 0) scale(0.12, 0.75)`
    : `translate3d(${state.rx}px, ${state.ry}px, 0) scale(${state.scale.toFixed(3)})`;
  if (state.hover !== state.appliedHover) {
    ring.classList.toggle('is-hover', state.hover === 'hover');
    ring.classList.toggle('is-taken', state.hover === 'taken');
    ring.classList.toggle('is-text', textMode);
    state.appliedHover = state.hover;
  }
  const vis = state.visible ? 'is-visible' : '';
  if (dot.classList.contains('is-visible') !== !!vis) {
    dot.classList.toggle('is-visible', !!vis);
    ring.classList.toggle('is-visible', !!vis);
  }
  if (state.trailOn && state.tctx && state.trail) {
    const ctx = state.tctx;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    const color = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#22d3ee';
    for (let i = state.particles.length - 1; i >= 0; i--) {
      const p = state.particles[i];
      const k = (now - p.t) / TRAIL_LIFE;
      if (k >= 1) { state.particles.splice(i, 1); continue; }
      ctx.globalAlpha = (1 - k) * 0.5;
      ctx.fillStyle = color;
      const r = 3 * (1 - k) + 0.5;
      ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;
  }
}

function activate() {
  if (state.active) return;
  ensureElements();
  state.active = true;
  document.documentElement.classList.add('has-custom-cursor');
  document.addEventListener('pointermove', onMove, { passive: true });
  document.addEventListener('pointerdown', onDown, { passive: true });
  document.addEventListener('pointerup', onUp, { passive: true });
  document.addEventListener('click', onClick, true);
  document.documentElement.addEventListener('mouseleave', onLeave);
  document.documentElement.addEventListener('mouseenter', onEnter);
  if (state.trailOn) ensureTrail();
  raiseLayer();
  if (!state.raf) state.raf = requestAnimationFrame(frame);
}

function deactivate() {
  if (!state.active) return;
  state.active = false;
  lowerLayer();
  document.documentElement.classList.remove('has-custom-cursor');
  document.removeEventListener('pointermove', onMove);
  document.removeEventListener('pointerdown', onDown);
  document.removeEventListener('pointerup', onUp);
  document.removeEventListener('click', onClick, true);
  document.documentElement.removeEventListener('mouseleave', onLeave);
  document.documentElement.removeEventListener('mouseenter', onEnter);
  if (state.raf) cancelAnimationFrame(state.raf);
  state.raf = 0;
  state.visible = false;
  state.dot && state.dot.classList.remove('is-visible');
  state.ring && state.ring.classList.remove('is-visible');
  if (state.tctx) state.tctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  state.particles.length = 0;
}

/** Re-evaluate activation (setting, pointer type, reduced motion). */
export function evaluateCursor() {
  if (shouldActivate()) activate(); else deactivate();
}

/**
 * Initialise the custom cursor.
 * @param {{ enabled?: boolean, trail?: boolean }} [opts]
 */
export function initCursor(opts = {}) {
  state.settingOn = opts.enabled !== false;
  state.trailOn = !!opts.trail;
  const fine = window.matchMedia(FINE);
  const red = window.matchMedia(REDUCED);
  const on = () => evaluateCursor();
  if (typeof fine.addEventListener === 'function') { fine.addEventListener('change', on); red.addEventListener('change', on); }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (state.raf) cancelAnimationFrame(state.raf); state.raf = 0; }
    else if (state.active && !state.raf) state.raf = requestAnimationFrame(frame);
  });
  // Modals live in the top layer: re-raise the cursor layer above them, or (no Popover API)
  // hand back the native cursor while a modal is open.
  document.addEventListener('ttt:modal', (e) => {
    const open = !!(e.detail && e.detail.open);
    if (state.popover !== false && state.layer) { if (open) raiseLayer(); return; }
    if (open) { if (state.active) { state.suspended = true; deactivate(); } }
    else if (state.suspended) { state.suspended = false; evaluateCursor(); }
  });
  evaluateCursor();
}

/**
 * Settings toggle for the custom cursor.
 * @param {boolean} on
 */
export function setCursorEnabled(on) {
  state.settingOn = !!on;
  evaluateCursor();
}

/**
 * Settings toggle for the particle trail.
 * @param {boolean} on
 */
export function setTrailEnabled(on) {
  state.trailOn = !!on;
  if (state.trailOn && state.active) ensureTrail();
  if (!state.trailOn && state.tctx) { state.tctx.clearRect(0, 0, window.innerWidth, window.innerHeight); state.particles.length = 0; }
}

/** @returns {boolean} */
export function isCursorActive() {
  return state.active;
}

/** Diagnostics for QC. */
export function cursorStats() {
  return { active: state.active, visible: state.visible, hover: state.appliedHover, pressed: state.pressed, trail: state.trailOn, particles: state.particles.length, x: state.x, y: state.y, rx: Math.round(state.rx), ry: Math.round(state.ry), popover: state.popover, layerOpen: !!(state.layer && state.popover && state.layer.matches(':popover-open')), suspended: state.suspended };
}
