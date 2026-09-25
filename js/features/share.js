// features/share.js — result sharing (Web Share → clipboard → caller fallback); no DOM access

/**
 * The page URL without hash or debug query (used in share texts).
 * @param {string} [href]
 * @returns {string}
 */
export function pageUrl(href) {
  const raw = href || (typeof location !== 'undefined' ? location.href : '');
  try {
    const u = new URL(raw);
    u.hash = '';
    u.searchParams.delete('debug');
    return u.toString();
  } catch {
    return raw.split('#')[0];
  }
}

/**
 * Human-readable result line for sharing.
 * @param {{ outcome: { type: string, player?: number }, mode: string, difficulty?: string, variant: string, names: Record<number, string> }} info
 * @param {string} url
 * @returns {string}
 */
export function buildResultText(info, url) {
  const { outcome, mode, difficulty, variant, names } = info;
  const v = variant === 'classic' ? '' : ` [${variant}]`;
  const diff = (difficulty || '').toUpperCase();
  let line;
  if (mode === 'bot') {
    if (outcome.type === 'draw') line = `I drew with BOT.exe on ${diff} in TicTacTech${v} 🤝`;
    else if (outcome.player === 1) line = `I beat BOT.exe on ${diff} in TicTacTech${v} ⚡`;
    else line = `BOT.exe (${diff}) beat me in TicTacTech${v} 🤖 — rematch?`;
  } else if (outcome.type === 'draw') {
    line = `${names[1]} and ${names[2]} drew in TicTacTech${v} 🤝`;
  } else {
    const w = outcome.player || 1;
    line = `${names[w]} beat ${names[w === 1 ? 2 : 1]} in TicTacTech${v} ⚡`;
  }
  return `${line}\n${url}`;
}

/**
 * Share text via the Web Share API (touch devices), else the clipboard. Returns which method worked.
 * @param {string} text
 * @param {{ title?: string, preferShare?: boolean, url?: string }} [opts]
 * @returns {Promise<'share'|'clipboard'|'fallback'|'cancelled'>}
 */
export async function shareText(text, opts = {}) {
  const nav = typeof navigator !== 'undefined' ? navigator : null;
  // The OS share sheet is the natural path on touch devices; on desktop the clipboard is quicker.
  const touchLike = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(hover: none), (pointer: coarse)').matches;
  if (nav && typeof nav.share === 'function' && (touchLike || opts.preferShare)) {
    try {
      await nav.share({ title: opts.title || 'TicTacTech', text, ...(opts.url ? { url: opts.url } : {}) });
      return 'share';
    } catch (err) {
      if (err && err.name === 'AbortError') return 'cancelled';
      /* fall through to the clipboard */
    }
  }
  if (nav && nav.clipboard && typeof nav.clipboard.writeText === 'function') {
    try {
      await nav.clipboard.writeText(text);
      return 'clipboard';
    } catch {
      /* blocked */
    }
  }
  return 'fallback';
}
