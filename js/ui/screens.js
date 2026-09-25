// ui/screens.js — screen router (menu/game), modal manager, focus trapping

const REDUCED = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
  || document.documentElement.dataset.motion === 'reduced';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** @type {Set<(name: string) => void>} */
const screenListeners = new Set();
let current = 'menu';

/** @type {{ dialog: HTMLDialogElement, opener: HTMLElement | null, resolve?: (v: boolean) => void }[]} */
const openStack = [];
/** Dialogs currently playing their close animation → pending close timer. */
const closing = new Map();

/**
 * Return the currently visible screen name.
 * @returns {string}
 */
export function currentScreen() {
  return current;
}

/**
 * Show a screen by its data-screen name, hide the others, move focus to its heading.
 * @param {string} name
 */
export function show(name) {
  const screens = document.querySelectorAll('.screen');
  let target = null;
  screens.forEach((s) => {
    const isTarget = s.dataset.screen === name;
    s.hidden = !isTarget;
    s.classList.remove('screen--enter');
    if (isTarget) target = s;
  });
  if (!target) return;
  current = name;
  if (!REDUCED()) {
    target.classList.add('screen--enter');
    target.addEventListener('animationend', () => target.classList.remove('screen--enter'), { once: true });
  }
  const heading = target.querySelector('[tabindex="-1"]') || target.querySelector('h1, h2');
  requestAnimationFrame(() => {
    if (heading) heading.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'auto' });
  });
  screenListeners.forEach((fn) => fn(name));
}

/**
 * Elements that become inert while a modal is open.
 * @returns {Element[]}
 */
function backgroundRoots() {
  return [...document.querySelectorAll('body > header, body > main, body > footer')];
}

function syncInert() {
  const on = openStack.length > 0;
  backgroundRoots().forEach((el) => {
    if (on) el.setAttribute('inert', '');
    else el.removeAttribute('inert');
  });
  document.documentElement.classList.toggle('has-modal', on);
  // Let overlays that must stay visible above modals (custom cursor) react.
  document.dispatchEvent(new CustomEvent('ttt:modal', { detail: { open: on, count: openStack.length } }));
}

/**
 * Open a modal <dialog> by id. Focus is trapped natively by showModal(); Escape and
 * backdrop clicks close it; focus returns to the opener on close.
 * @param {string} id
 * @param {HTMLElement | null} [opener]
 * @returns {HTMLDialogElement | null}
 */
export function openModal(id, opener = null) {
  const dialog = /** @type {HTMLDialogElement | null} */ (document.getElementById(id));
  if (!dialog) return null;
  const entry = { dialog, opener: opener || /** @type {HTMLElement} */ (document.activeElement) };
  if (dialog.open) {
    // Re-opened while its close animation is still running: cancel the close and keep it.
    const timer = closing.get(dialog);
    if (timer === undefined) return dialog;
    clearTimeout(timer);
    closing.delete(dialog);
    dialog.classList.remove('is-closing');
    openStack.push(entry);
    syncInert();
    return dialog;
  }
  openStack.push(entry);
  dialog.showModal();
  syncInert();
  const first = dialog.querySelector('input:not([type=hidden]), select, textarea, button:not([data-close]), [href]');
  requestAnimationFrame(() => {
    const focusTarget = first || dialog.querySelector('[data-close]');
    if (focusTarget instanceof HTMLElement) focusTarget.focus({ preventScroll: true });
  });
  return dialog;
}

/**
 * Close the top-most modal (or a specific one by id).
 * @param {string} [id]
 * @param {boolean} [result]
 */
export function closeModal(id, result = false) {
  let idx = openStack.length - 1;
  if (id) idx = openStack.findIndex((e) => e.dialog.id === id);
  if (idx < 0) return;
  const [entry] = openStack.splice(idx, 1);
  const finish = () => {
    closing.delete(entry.dialog);
    if (entry.dialog.open) entry.dialog.close();
    entry.dialog.classList.remove('is-closing');
    syncInert();
    if (entry.resolve) entry.resolve(result);
    const opener = entry.opener;
    // Restore focus to the opener, or (after a screen change hid it) to the visible screen's heading —
    // dialog.close() itself would otherwise drop focus onto <body>.
    if (openStack.length) return;
    if (opener instanceof HTMLElement && opener.isConnected && opener.offsetParent !== null) opener.focus({ preventScroll: true });
    else {
      const heading = document.querySelector('.screen:not([hidden]) [tabindex="-1"]');
      if (heading instanceof HTMLElement) heading.focus({ preventScroll: true });
    }
  };
  if (entry.resolve) entry.resolve(result);
  entry.resolve = undefined;
  if (REDUCED()) finish();
  else {
    entry.dialog.classList.add('is-closing');
    closing.set(entry.dialog, setTimeout(finish, 160));
  }
}

/**
 * Show the confirm dialog and resolve with the user's choice.
 * @param {{ title?: string, text?: string, yes?: string }} [opts]
 * @returns {Promise<boolean>}
 */
export function confirm(opts = {}) {
  const title = document.getElementById('confirm-title');
  const text = document.getElementById('confirm-text');
  const yes = document.getElementById('btn-confirm-yes');
  if (title && opts.title) title.textContent = opts.title;
  if (text && opts.text) text.textContent = opts.text;
  if (yes && opts.yes) { const span = yes.querySelector('span'); if (span) span.textContent = opts.yes; }
  return new Promise((resolve) => {
    const dialog = openModal('modal-confirm');
    if (!dialog) { resolve(false); return; }
    openStack[openStack.length - 1].resolve = resolve;
  });
}

/**
 * Wire global modal behaviour: [data-modal] openers, [data-close] buttons,
 * backdrop click, Escape (native cancel), and the confirm "yes" button.
 */
export function initScreens() {
  document.addEventListener('click', (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    const opener = t.closest('[data-modal]');
    if (opener instanceof HTMLElement) { openModal(opener.dataset.modal || '', opener); return; }
    const closer = t.closest('[data-close]');
    if (closer) { closeModal(); return; }
    if (t.closest('#btn-confirm-yes')) { closeModal(undefined, true); return; }
    if (t instanceof HTMLDialogElement && t.classList.contains('modal') && t.open) closeModal(t.id);
  });

  // Explicit Tab trap: native showModal() lets Tab reach the browser chrome; keep it in-page.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab' || openStack.length === 0) return;
    const { dialog } = openStack[openStack.length - 1];
    const focusables = [...dialog.querySelectorAll(FOCUSABLE)].filter((el) => el instanceof HTMLElement && !el.hidden && el.offsetParent !== null);
    if (focusables.length === 0) { e.preventDefault(); return; }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || !dialog.contains(active))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (active === last || !dialog.contains(active))) { e.preventDefault(); first.focus(); }
  });

  document.querySelectorAll('dialog.modal').forEach((d) => {
    d.addEventListener('cancel', (e) => { e.preventDefault(); closeModal(d.id); });
    d.addEventListener('close', () => {
      const idx = openStack.findIndex((en) => en.dialog === d);
      if (idx >= 0) { const [entry] = openStack.splice(idx, 1); syncInert(); if (entry.resolve) entry.resolve(false); }
    });
  });
}

/**
 * True when any modal is open.
 * @returns {boolean}
 */
export function isModalOpen() {
  return openStack.length > 0;
}
