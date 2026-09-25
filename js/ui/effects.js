// ui/effects.js — confetti canvas, background particle/circuit canvas, shake
// Every effect here is decorative: the game stays fully playable if this module is disabled.

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
  || document.documentElement.dataset.motion === 'reduced';
const finePointer = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches;
const dprCap = () => Math.min(window.devicePixelRatio || 1, 2);

function cssVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/* ------------------------------------------------------------------ */
/* Background: slow circuit / particle network                          */
/* ------------------------------------------------------------------ */

const BG_FPS = 30;
const LINK_DIST = 120;
const bg = {
  /** @type {HTMLCanvasElement | null} */ canvas: null,
  /** @type {CanvasRenderingContext2D | null} */ ctx: null,
  nodes: /** @type {{ x: number, y: number, vx: number, vy: number, r: number, c: number }[]} */ ([]),
  raf: 0,
  last: 0,
  enabled: true,
  w: 0,
  h: 0,
  colors: ['#22d3ee', '#f472b6'],
  style: 'network',
};

function bgNodeCount() {
  return window.innerWidth < 768 ? 25 : 60;
}

function bgResize() {
  if (!bg.canvas || !bg.ctx) return;
  const dpr = dprCap();
  bg.w = window.innerWidth;
  bg.h = window.innerHeight;
  bg.canvas.width = Math.round(bg.w * dpr);
  bg.canvas.height = Math.round(bg.h * dpr);
  bg.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const n = bgNodeCount();
  while (bg.nodes.length < n) {
    bg.nodes.push({ x: Math.random() * bg.w, y: Math.random() * bg.h, vx: (Math.random() - 0.5) * 0.25, vy: (Math.random() - 0.5) * 0.25, r: 1.2 + Math.random() * 1.6, c: Math.random() < 0.5 ? 0 : 1 });
  }
  bg.nodes.length = n;
  bg.nodes.forEach((p) => { p.x = Math.min(p.x, bg.w); p.y = Math.min(p.y, bg.h); });
  if (bg.style === 'rain') rainResize();
}

/** Re-read accent colors (call after a theme/accent change). */
export function refreshBackgroundColors() {
  bg.colors = [cssVar('--p1', '#22d3ee'), cssVar('--p2', '#f472b6')];
  drawBackgroundFrame();
}

/* Digital rain (Konami unlock): falling glyph columns. */
const RAIN_CHARS = '01<>{}[]/#=;:+-*&|~^%$';
const rain = { cols: 0, drops: /** @type {number[]} */ ([]), size: 16 };

function rainResize() {
  rain.cols = Math.ceil(bg.w / rain.size);
  rain.drops = Array.from({ length: rain.cols }, (_, i) => rain.drops[i] ?? Math.random() * (bg.h / rain.size));
}

function drawRainFrame() {
  const { ctx, w, h, colors } = bg;
  if (!ctx) return;
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'source-over';
  ctx.font = `${rain.size - 2}px ${getComputedStyle(document.documentElement).getPropertyValue('--font-mono') || 'monospace'}`;
  for (let i = 0; i < rain.cols; i++) {
    const ch = RAIN_CHARS[Math.floor(Math.random() * RAIN_CHARS.length)];
    const y = rain.drops[i] * rain.size;
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = colors[i % 2];
    ctx.fillText(ch, i * rain.size, y);
    if (y > h && Math.random() > 0.975) rain.drops[i] = 0;
    rain.drops[i] += 1;
  }
  ctx.globalAlpha = 1;
}

/**
 * Switch the background style ('network' | 'rain').
 * @param {'network'|'rain'} style
 */
export function setBackgroundStyle(style) {
  bg.style = style === 'rain' ? 'rain' : 'network';
  if (bg.ctx) bg.ctx.clearRect(0, 0, bg.w, bg.h);
  if (bg.style === 'rain') rainResize();
  drawBackgroundFrame();
}

function drawBackgroundFrame() {
  const { ctx, w, h, nodes, colors } = bg;
  if (!ctx) return;
  if (bg.style === 'rain') { drawRainFrame(); return; }
  ctx.clearRect(0, 0, w, h);
  ctx.lineWidth = 1;
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j];
      const dx = a.x - b.x; const dy = a.y - b.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > LINK_DIST * LINK_DIST) continue;
      const alpha = (1 - Math.sqrt(d2) / LINK_DIST) * 0.18;
      ctx.strokeStyle = colors[a.c];
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      // circuit-trace look: orthogonal elbow instead of a straight line
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 0.55;
  for (const p of nodes) {
    ctx.fillStyle = colors[p.c];
    ctx.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
  }
  ctx.globalAlpha = 1;
}

function bgFrame(t) {
  bg.raf = requestAnimationFrame(bgFrame);
  if (t - bg.last < 1000 / BG_FPS) return;
  const dt = Math.min(64, t - bg.last || 16);
  bg.last = t;
  if (bg.style === 'rain') { drawRainFrame(); return; }
  const k = dt / 16.67;
  for (const p of bg.nodes) {
    p.x += p.vx * k; p.y += p.vy * k;
    if (p.x < 0 || p.x > bg.w) p.vx *= -1;
    if (p.y < 0 || p.y > bg.h) p.vy *= -1;
  }
  drawBackgroundFrame();
}

/** Start the background loop when allowed (enabled, visible, not reduced motion). */
export function startBackground() {
  if (!bg.canvas || bg.raf || !bg.enabled || document.hidden || reduced()) return;
  bg.last = 0;
  bg.raf = requestAnimationFrame(bgFrame);
}

/** Stop the background loop (keeps the last frame unless `clear`). */
export function stopBackground(clear = false) {
  if (bg.raf) cancelAnimationFrame(bg.raf);
  bg.raf = 0;
  if (clear && bg.ctx) bg.ctx.clearRect(0, 0, bg.w, bg.h);
}

/** @returns {boolean} */
export function isBackgroundRunning() {
  return bg.raf !== 0;
}

/** Diagnostics for QC. @returns {{ nodes: number, running: boolean, enabled: boolean, fpsCap: number, linkDist: number }} */
export function backgroundStats() {
  return { nodes: bg.nodes.length, running: bg.raf !== 0, enabled: bg.enabled, fpsCap: BG_FPS, linkDist: LINK_DIST };
}

/**
 * Enable/disable the background from settings.
 * @param {boolean} on
 */
export function setBackgroundEnabled(on) {
  bg.enabled = !!on;
  if (bg.canvas) bg.canvas.hidden = !bg.enabled;
  if (bg.enabled) startBackground(); else stopBackground(true);
}

/**
 * Initialise the background canvas.
 * @param {HTMLCanvasElement | null} canvas
 * @param {{ enabled?: boolean, style?: 'network'|'rain' }} [opts]
 */
export function initBackground(canvas, opts = {}) {
  if (!canvas) return;
  bg.canvas = canvas;
  bg.ctx = canvas.getContext('2d', { alpha: true });
  bg.enabled = opts.enabled !== false;
  bg.style = opts.style === 'rain' ? 'rain' : 'network';
  canvas.hidden = !bg.enabled;
  refreshBackgroundColors();
  bgResize();
  let t = 0;
  window.addEventListener('resize', () => { clearTimeout(t); t = window.setTimeout(() => { bgResize(); drawBackgroundFrame(); }, 150); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopBackground(); else startBackground(); });
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  const onMotion = () => { if (reduced()) { stopBackground(); drawBackgroundFrame(); } else startBackground(); };
  if (typeof mq.addEventListener === 'function') mq.addEventListener('change', onMotion);
  drawBackgroundFrame();
  startBackground();
}

/* ------------------------------------------------------------------ */
/* FX canvas: confetti + draw ripple                                    */
/* ------------------------------------------------------------------ */

const fx = {
  /** @type {HTMLCanvasElement | null} */ canvas: null,
  /** @type {CanvasRenderingContext2D | null} */ ctx: null,
  particles: /** @type {any[]} */ ([]),
  pool: /** @type {any[]} */ ([]),
  ripples: /** @type {{ x: number, y: number, r: number, max: number, t0: number, dur: number, color: string }[]} */ ([]),
  raf: 0,
  w: 0,
  h: 0,
};
const MAX_CONFETTI = 150;

function fxEnsure() {
  if (fx.canvas) return fx;
  const c = document.createElement('canvas');
  c.className = 'fx-canvas';
  c.setAttribute('aria-hidden', 'true');
  document.body.appendChild(c);
  fx.canvas = c;
  fx.ctx = c.getContext('2d');
  const size = () => {
    const dpr = dprCap();
    fx.w = window.innerWidth; fx.h = window.innerHeight;
    c.width = Math.round(fx.w * dpr); c.height = Math.round(fx.h * dpr);
    fx.ctx && fx.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  size();
  let t = 0;
  window.addEventListener('resize', () => { clearTimeout(t); t = window.setTimeout(size, 150); });
  return fx;
}

function fxFrame(now) {
  const { ctx, w, h } = fx;
  if (!ctx) return;
  ctx.clearRect(0, 0, w, h);
  // confetti
  for (let i = fx.particles.length - 1; i >= 0; i--) {
    const p = fx.particles[i];
    const age = now - p.t0;
    if (age > p.life) { fx.pool.push(fx.particles.splice(i, 1)[0]); continue; }
    p.vy += 0.18; // gravity
    p.vx *= 0.985; p.vy *= 0.985; // drag
    p.x += p.vx; p.y += p.vy; p.rot += p.vr;
    const alpha = age > p.life * 0.7 ? 1 - (age - p.life * 0.7) / (p.life * 0.3) : 1;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.fillStyle = p.color;
    ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
    ctx.restore();
  }
  // ripples
  for (let i = fx.ripples.length - 1; i >= 0; i--) {
    const r = fx.ripples[i];
    const k = (now - r.t0) / r.dur;
    if (k >= 1) { fx.ripples.splice(i, 1); continue; }
    ctx.save();
    ctx.globalAlpha = (1 - k) * 0.35;
    ctx.strokeStyle = r.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.max * (0.2 + 0.8 * k), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  if (fx.particles.length || fx.ripples.length) fx.raf = requestAnimationFrame(fxFrame);
  else { fx.raf = 0; ctx.clearRect(0, 0, w, h); }
}

function fxStart() {
  if (!fx.raf) fx.raf = requestAnimationFrame(fxFrame);
}

/**
 * Confetti burst from the top-center/board area in the given colors (≤150 pooled particles, ~1.6 s).
 * @param {string[]} [colors]
 * @param {{ x?: number, y?: number }} [origin] viewport coordinates (defaults to upper third center)
 */
export function celebrate(colors, origin = {}) {
  if (reduced()) return;
  fxEnsure();
  const palette = colors && colors.length ? colors : [cssVar('--p1', '#22d3ee'), cssVar('--p2', '#f472b6'), cssVar('--ok', '#a3e635'), cssVar('--violet', '#a78bfa')];
  const now = performance.now();
  const ox = origin.x ?? fx.w / 2;
  const oy = origin.y ?? fx.h * 0.35;
  const count = Math.min(MAX_CONFETTI, MAX_CONFETTI - fx.particles.length);
  for (let i = 0; i < count; i++) {
    const p = fx.pool.pop() || {};
    const ang = Math.random() * Math.PI * 2;
    const speed = 4 + Math.random() * 7;
    p.x = ox + (Math.random() - 0.5) * 40;
    p.y = oy + (Math.random() - 0.5) * 20;
    p.vx = Math.cos(ang) * speed;
    p.vy = Math.sin(ang) * speed - 4;
    p.rot = Math.random() * Math.PI;
    p.vr = (Math.random() - 0.5) * 0.3;
    p.s = 6 + Math.random() * 6;
    p.color = palette[i % palette.length];
    p.t0 = now;
    p.life = 1300 + Math.random() * 400;
    fx.particles.push(p);
  }
  fxStart();
}

/**
 * Subtle expanding ring (used on a draw).
 * @param {{ x?: number, y?: number }} [origin]
 */
export function drawRipple(origin = {}) {
  if (reduced()) return;
  fxEnsure();
  fx.ripples.push({ x: origin.x ?? fx.w / 2, y: origin.y ?? fx.h / 2, r: 0, max: Math.max(fx.w, fx.h) * 0.6, t0: performance.now(), dur: 700, color: cssVar('--muted', '#8a97b1') });
  fxStart();
}

/** @returns {number} live confetti particles (for QC) */
export function fxParticleCount() {
  return fx.particles.length;
}

/* ------------------------------------------------------------------ */
/* Edge glow, button ripple, card tilt, logo glitch                    */
/* ------------------------------------------------------------------ */

let glowEl = null;

/**
 * Pulse a glow around the viewport edges in a color.
 * @param {string} color
 */
export function edgeGlow(color) {
  if (reduced()) return;
  if (!glowEl) {
    glowEl = document.createElement('div');
    glowEl.className = 'edge-glow';
    glowEl.setAttribute('aria-hidden', 'true');
    document.body.appendChild(glowEl);
  }
  glowEl.style.setProperty('--fx-color', color);
  glowEl.classList.remove('is-on');
  void glowEl.offsetWidth;
  glowEl.classList.add('is-on');
  glowEl.addEventListener('animationend', () => glowEl && glowEl.classList.remove('is-on'), { once: true });
}

/**
 * Material-style ripple inside a button from the pointer position.
 * @param {HTMLElement} el
 * @param {number} clientX
 * @param {number} clientY
 */
export function ripple(el, clientX, clientY) {
  if (reduced()) return;
  const r = el.getBoundingClientRect();
  const size = Math.max(r.width, r.height) * 1.2;
  const span = document.createElement('span');
  span.className = 'ripple';
  span.style.width = span.style.height = `${size}px`;
  span.style.left = `${clientX - r.left - size / 2}px`;
  span.style.top = `${clientY - r.top - size / 2}px`;
  el.appendChild(span);
  span.addEventListener('animationend', () => span.remove(), { once: true });
  setTimeout(() => span.isConnected && span.remove(), 700);
}

/**
 * Pointer-follow tilt for cards (desktop only, max 6°, transform only).
 * @param {string} selector
 */
export function initTilt(selector) {
  if (!finePointer()) return;
  const MAX = 6;
  let pending = null;
  let raf = 0;
  const apply = () => {
    raf = 0;
    if (!pending) return;
    const { el, x, y } = pending;
    pending = null;
    const r = el.getBoundingClientRect();
    const px = (x - r.left) / r.width - 0.5;
    const py = (y - r.top) / r.height - 0.5;
    el.style.setProperty('--ry', `${(px * MAX * 2).toFixed(2)}deg`);
    el.style.setProperty('--rx', `${(-py * MAX * 2).toFixed(2)}deg`);
  };
  document.addEventListener('pointermove', (e) => {
    if (reduced()) return;
    const el = /** @type {HTMLElement} */ (e.target).closest(selector);
    if (!el) return;
    pending = { el, x: e.clientX, y: e.clientY };
    if (!raf) raf = requestAnimationFrame(apply);
  });
  document.addEventListener('pointerout', (e) => {
    const el = /** @type {HTMLElement} */ (e.target).closest(selector);
    if (!el) return;
    const rel = /** @type {Node | null} */ (e.relatedTarget);
    if (rel && el.contains(rel)) return;
    el.style.removeProperty('--rx');
    el.style.removeProperty('--ry');
  });
}

/**
 * Periodic 2-frame glitch on the logo text (every 8 s, skipped when hidden or reduced motion).
 * @param {HTMLElement | null} el
 */
export function initGlitch(el) {
  if (!el) return;
  setInterval(() => {
    if (document.hidden || reduced()) return;
    el.classList.remove('is-glitching');
    void el.offsetWidth;
    el.classList.add('is-glitching');
    setTimeout(() => el.classList.remove('is-glitching'), 350);
  }, 8000);
}

/**
 * Wire delegated button ripples, card tilt and the logo glitch.
 */
export function initInteractions() {
  document.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const el = /** @type {HTMLElement} */ (e.target).closest('.btn, .icon-btn, .mode-card, .segmented__label');
    if (el instanceof HTMLElement && !el.matches(':disabled')) ripple(el, e.clientX, e.clientY);
  });
  initTilt('.mode-card');
  initGlitch(document.querySelector('.logo__text'));
}

/**
 * Sync the scanline overlay from a setting ("auto" = on for the dark theme only).
 * @param {'auto'|'on'|'off'} mode
 * @param {'dark'|'light'} theme
 */
export function applyScanlines(mode, theme) {
  const on = !reduced() && (mode === 'on' || (mode === 'auto' && theme === 'dark'));
  document.documentElement.setAttribute('data-scanlines', on ? 'on' : 'off');
}
