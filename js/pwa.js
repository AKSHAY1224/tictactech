// pwa.js — service-worker registration, install prompt, update toast

let updateRequested = false;

/**
 * True when a service worker may be registered (secure context or local dev).
 * @returns {boolean}
 */
export function canRegister() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false;
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  return location.protocol === 'https:' || (location.protocol === 'http:' && local);
}

/**
 * Register ./sw.js and wire update + install events.
 * @param {{ onUpdate?: (worker: ServiceWorker) => void, onInstallable?: (prompt: () => Promise<any>) => void, onInstalled?: () => void, onRegistered?: (reg: ServiceWorkerRegistration) => void }} handlers
 */
export function initPwa(handlers = {}) {
  if (!canRegister()) return;

  const watch = (reg) => {
    const announce = (worker) => { if (worker && navigator.serviceWorker.controller && handlers.onUpdate) handlers.onUpdate(worker); };
    if (reg.waiting) announce(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      if (!nw) return;
      nw.addEventListener('statechange', () => { if (nw.state === 'installed') announce(nw); });
    });
  };

  const register = async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
      if (handlers.onRegistered) handlers.onRegistered(reg);
      watch(reg);
    } catch {
      /* registration is best-effort */
    }
  };
  if (document.readyState === 'complete') register(); else window.addEventListener('load', register, { once: true });

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Reload only for an update we asked for (never on the very first install).
    if (updateRequested) { updateRequested = false; location.reload(); }
  });

  let deferred = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    if (handlers.onInstallable) {
      handlers.onInstallable(async () => {
        if (!deferred) return null;
        deferred.prompt();
        const choice = await deferred.userChoice.catch(() => null);
        deferred = null;
        return choice;
      });
    }
  });
  window.addEventListener('appinstalled', () => { deferred = null; if (handlers.onInstalled) handlers.onInstalled(); });
}

/**
 * Activate a waiting worker; the page reloads on controllerchange.
 * @param {ServiceWorker} worker
 */
export function applyUpdate(worker) {
  updateRequested = true;
  worker.postMessage({ type: 'SKIP_WAITING' });
}
