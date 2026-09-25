// ui/audio.js — Web Audio synthesized sounds + haptics
// No audio files: every sound is a short synthesized blip. The AudioContext is created only after
// the first user gesture (pointerdown / keydown / touchend) to satisfy autoplay policies.

const MASTER_GAIN = 0.25;

const state = {
  /** @type {AudioContext | null} */ ctx: null,
  /** @type {GainNode | null} */ master: null,
  sound: true,
  haptics: true,
  unlocked: false,
  tapped: false,
  played: 0,
  last: '',
  lastPattern: /** @type {number | number[] | null} */ (null),
  vibrateCalls: 0,
};

function ensureContext() {
  if (state.ctx) return state.ctx;
  const AC = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
  if (!AC) return null;
  try {
    const ctx = new AC();
    const master = ctx.createGain();
    master.gain.value = MASTER_GAIN;
    master.connect(ctx.destination);
    state.ctx = ctx;
    state.master = master;
  } catch {
    state.ctx = null;
  }
  return state.ctx;
}

/** True once the page has had a real user activation (trusted gesture). */
function activated() {
  const ua = typeof navigator !== 'undefined' ? /** @type {any} */ (navigator).userActivation : null;
  if (ua && typeof ua.hasBeenActive === 'boolean') return ua.hasBeenActive;
  return state.unlocked;
}

function unlock(e) {
  if (e && e.isTrusted === false) return; // synthetic events never unlock audio
  state.unlocked = true;
  if (e && (e.type === 'pointerup' || e.type === 'touchend' || e.type === 'click')) state.tapped = true;
  const ctx = ensureContext();
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
}

/**
 * Play one oscillator note with a fast attack/decay envelope.
 * @param {number} freq
 * @param {number} dur seconds
 * @param {OscillatorType} [type='square']
 * @param {{ gain?: number, slideTo?: number, delay?: number }} [opts]
 */
export function blip(freq, dur, type = 'square', opts = {}) {
  if (!state.sound || !state.unlocked || !activated()) return;
  const ctx = ensureContext();
  if (!ctx || !state.master) return;
  try {
    const t0 = ctx.currentTime + (opts.delay || 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(opts.slideTo, t0 + dur);
    const peak = opts.gain ?? 1;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(state.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
    state.played++;
  } catch {
    /* never throw from audio */
  }
}

/**
 * Short white-noise burst (used for errors).
 * @param {number} [dur=0.08]
 * @param {number} [gain=0.35]
 */
export function noiseBurst(dur = 0.08, gain = 0.35) {
  if (!state.sound || !state.unlocked || !activated()) return;
  const ctx = ensureContext();
  if (!ctx || !state.master) return;
  try {
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(state.master);
    src.start();
    state.played++;
  } catch {
    /* ignore */
  }
}

/** Sound bank. */
const SOUNDS = {
  place: (player) => (player === 2 ? blip(660, 0.06, 'triangle') : blip(880, 0.06, 'square', { gain: 0.8 })),
  error: () => { blip(150, 0.09, 'sawtooth', { gain: 0.7 }); noiseBurst(0.07, 0.25); },
  win: () => [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => blip(f, 0.11, 'triangle', { delay: i * 0.08, gain: 0.8 })),
  lose: () => blip(220, 0.25, 'sawtooth', { slideTo: 110, gain: 0.6 }),
  draw: () => { blip(440, 0.12, 'triangle', { gain: 0.7 }); blip(330, 0.14, 'triangle', { delay: 0.13, gain: 0.7 }); },
  tick: () => blip(1200, 0.025, 'sine', { gain: 0.6 }),
  toggle: () => blip(2000, 0.03, 'square', { gain: 0.35 }),
  achievement: () => [660, 880, 1320].forEach((f, i) => blip(f, 0.09, 'triangle', { delay: i * 0.09, gain: 0.8 })),
  hint: () => blip(990, 0.05, 'sine', { gain: 0.5 }),
};

/**
 * Play a named sound.
 * @param {keyof typeof SOUNDS} name
 * @param {number} [player]
 */
export function play(name, player) {
  const fn = SOUNDS[name];
  if (!fn) return;
  state.last = name;
  fn(player);
}

/**
 * Vibrate on supported devices (silent no-op elsewhere).
 * @param {'place'|'error'|'win'|'achievement'} kind
 */
export function haptic(kind) {
  if (!state.haptics) return;
  const pattern = kind === 'place' ? 10 : kind === 'error' ? 30 : kind === 'achievement' ? [20, 30, 20] : [30, 40, 30, 40, 60];
  state.lastPattern = pattern;
  // Chrome blocks vibrate() until the user has tapped the page; stay silent before that.
  if (!state.tapped || !activated()) return;
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern);
      state.vibrateCalls++;
    }
  } catch {
    /* ignore */
  }
}

/** @param {boolean} on */
export function setSoundEnabled(on) {
  state.sound = !!on;
  if (state.sound && state.unlocked) unlock();
}

/** @param {boolean} on */
export function setHapticsEnabled(on) {
  state.haptics = !!on;
}

/**
 * Register the gesture unlock and initial settings.
 * @param {{ sound?: boolean, haptics?: boolean }} [opts]
 */
export function initAudio(opts = {}) {
  state.sound = opts.sound !== false;
  state.haptics = opts.haptics !== false;
  // Only user-activation events: pointerup/click (mouse + touch), keydown, touchend.
  // (pointerdown from a touch is NOT an activating gesture and would log an autoplay warning.)
  const listenerOpts = { passive: true };
  ['pointerup', 'click', 'keydown', 'touchend'].forEach((ev) => document.addEventListener(ev, unlock, listenerOpts));
}

/** Diagnostics for QC. */
export function audioStats() {
  return { hasContext: !!state.ctx, ctxState: state.ctx ? state.ctx.state : null, unlocked: state.unlocked, tapped: state.tapped, activated: activated(), sound: state.sound, haptics: state.haptics, played: state.played, last: state.last, lastPattern: state.lastPattern, vibrateCalls: state.vibrateCalls, masterGain: state.master ? state.master.gain.value : null };
}
