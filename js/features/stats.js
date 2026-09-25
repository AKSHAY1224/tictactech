// features/stats.js — counters, streaks, time played (pure, DOM-free)

export const STATS_KEY = 'ttt.stats';

/** @returns {{ v: number, byKey: Record<string, { played: number, won: number, lost: number, draw: number }>, totals: { played: number, won: number, lost: number, draw: number }, streak: { current: number, best: number }, timePlayedMs: number, lastPlayedAt: string | null }} */
export function emptyStats() {
  return { v: 1, byKey: {}, totals: { played: 0, won: 0, lost: 0, draw: 0 }, streak: { current: 0, best: 0 }, timePlayedMs: 0, lastPlayedAt: null };
}

const num = (x) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? Math.floor(x) : 0);
const bucket = (b) => ({ played: num(b && b.played), won: num(b && b.won), lost: num(b && b.lost), draw: num(b && b.draw) });

/**
 * Validate a stored stats object; anything malformed becomes defaults.
 * @param {unknown} raw
 */
export function normalizeStats(raw) {
  const base = emptyStats();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
  const r = /** @type {any} */ (raw);
  const byKey = {};
  if (r.byKey && typeof r.byKey === 'object') {
    for (const [k, v] of Object.entries(r.byKey)) if (typeof k === 'string' && k.length < 64) byKey[k] = bucket(v);
  }
  return {
    v: 1,
    byKey,
    totals: bucket(r.totals),
    streak: { current: num(r.streak && r.streak.current), best: num(r.streak && r.streak.best) },
    timePlayedMs: num(r.timePlayedMs),
    lastPlayedAt: typeof r.lastPlayedAt === 'string' ? r.lastPlayedAt : null,
  };
}

/**
 * Stats key for a game configuration.
 * @param {{ mode: string, variant: string, difficulty?: string }} config
 * @returns {string}
 */
export function statsKey(config) {
  return `${config.mode}:${config.variant}:${config.mode === 'bot' ? config.difficulty : '-'}`;
}

/**
 * Record a finished game. `result` is from the device player's perspective
 * ('win' | 'loss' | 'draw'; in Local 2P, 'win' means USER_1 won). Streaks track bot games only.
 * @param {ReturnType<typeof emptyStats>} stats
 * @param {{ key: string, result: 'win'|'loss'|'draw', countsForStreak?: boolean, at?: string }} game
 */
export function recordGame(stats, game) {
  const s = normalizeStats(stats);
  const b = bucket(s.byKey[game.key]);
  b.played++;
  if (game.result === 'win') b.won++;
  else if (game.result === 'loss') b.lost++;
  else b.draw++;
  const totals = { ...s.totals, played: s.totals.played + 1 };
  if (game.result === 'win') totals.won++;
  else if (game.result === 'loss') totals.lost++;
  else totals.draw++;
  let streak = { ...s.streak };
  if (game.countsForStreak !== false) {
    if (game.result === 'win') { streak.current++; streak.best = Math.max(streak.best, streak.current); }
    else if (game.result === 'loss') streak.current = 0;
  }
  return { ...s, byKey: { ...s.byKey, [game.key]: b }, totals, streak, lastPlayedAt: game.at || new Date().toISOString() };
}

/**
 * Add play time.
 * @param {ReturnType<typeof emptyStats>} stats
 * @param {number} ms
 */
export function addTime(stats, ms) {
  const s = normalizeStats(stats);
  return { ...s, timePlayedMs: s.timePlayedMs + Math.max(0, Math.floor(ms)) };
}

/**
 * Win rate 0..1 (draws count as half).
 * @param {{ played: number, won: number, draw: number }} b
 */
export function winRate(b) {
  if (!b || !b.played) return 0;
  return (b.won + b.draw * 0.5) / b.played;
}

/**
 * "1h 02m" / "12m 05s" style duration.
 * @param {number} ms
 */
export function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m) return `${m}m ${String(sec).padStart(2, '0')}s`;
  return `${sec}s`;
}
