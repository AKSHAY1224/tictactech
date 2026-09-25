// ui/theme.js — light/dark/system theme, accent themes, meta theme-color sync
import * as storage from '../state/storage.js';

const KEY_THEME = 'ttt.theme';
const KEY_ACCENT = 'ttt.accent';
export const THEME_MODES = ['dark', 'light', 'system'];
export const ACCENTS = ['neon', 'synthwave', 'matrix'];

const mq = window.matchMedia('(prefers-color-scheme: dark)');
/** @type {'dark'|'light'|'system'} */
let mode = 'system';
let accent = 'neon';
/** @type {Set<(info: { mode: string, resolved: string, accent: string }) => void>} */
const listeners = new Set();

/**
 * Resolve the effective theme for the current mode.
 * @returns {'dark'|'light'}
 */
export function getResolvedTheme() {
  if (mode === 'dark' || mode === 'light') return mode;
  return mq.matches ? 'dark' : 'light';
}

/** @returns {'dark'|'light'|'system'} */
export function getThemeMode() {
  return mode;
}

/**
 * Subscribe to theme/accent changes.
 * @param {(info: { mode: string, resolved: string, accent: string }) => void} fn
 * @returns {() => void}
 */
export function onThemeChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function updateMeta(resolved) {
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || (resolved === 'dark' ? '#0b0f1a' : '#f5f7fb');
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', bg));
}

function updateToggleButton(resolved) {
  const btn = document.getElementById('btn-theme');
  if (!btn) return;
  const next = resolved === 'dark' ? 'light' : 'dark';
  btn.setAttribute('aria-label', `Switch to ${next} theme`);
  btn.title = `Switch to ${next} theme`;
}

function apply() {
  const resolved = getResolvedTheme();
  const root = document.documentElement;
  root.setAttribute('data-theme', resolved);
  root.setAttribute('data-accent', accent);
  // Reading --bg must happen after the attribute change so the new tokens resolve.
  updateMeta(resolved);
  updateToggleButton(resolved);
  listeners.forEach((fn) => fn({ mode, resolved, accent }));
}

/**
 * Set the theme mode and persist it.
 * @param {'dark'|'light'|'system'} next
 */
export function setTheme(next) {
  if (!THEME_MODES.includes(next)) return;
  mode = next;
  storage.set(KEY_THEME, mode);
  apply();
}

/**
 * Toggle between dark and light based on the currently resolved theme.
 * @returns {'dark'|'light'} the new resolved theme
 */
export function toggleTheme() {
  const next = getResolvedTheme() === 'dark' ? 'light' : 'dark';
  setTheme(next);
  return next;
}

/**
 * Set the accent theme (neon | synthwave | matrix) and persist it.
 * @param {string} name
 */
export function setAccent(name) {
  if (!ACCENTS.includes(name)) return;
  accent = name;
  storage.set(KEY_ACCENT, accent);
  apply();
}

/**
 * Read persisted preferences, apply them, and follow OS changes while in system mode.
 */
export function initTheme() {
  const savedTheme = storage.get(KEY_THEME, 'system');
  mode = THEME_MODES.includes(savedTheme) ? savedTheme : 'system';
  const savedAccent = storage.get(KEY_ACCENT, 'neon');
  accent = ACCENTS.includes(savedAccent) ? savedAccent : 'neon';
  apply();
  const onOsChange = () => { if (mode === 'system') apply(); };
  if (typeof mq.addEventListener === 'function') mq.addEventListener('change', onOsChange);
  else mq.addListener(onOsChange);
}
