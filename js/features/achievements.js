// features/achievements.js — achievement definitions, unlock logic, toasts (pure, DOM-free)

export const UNLOCKS_KEY = 'ttt.achievements';

/** @type {{ id: string, title: string, desc: string, hint: string, icon: string }[]} */
export const ACHIEVEMENTS = [
  { id: 'hello_world', title: 'Hello, World!', desc: 'Play your first game', hint: 'finish any game', icon: '👋' },
  { id: 'first_commit', title: 'First Commit', desc: 'Win your first game', hint: 'win once', icon: '✅' },
  { id: 'bug_squasher', title: 'Bug Squasher', desc: 'Beat BOT.exe on medium', hint: 'outsmart medium', icon: '🐛' },
  { id: 'stack_overflow', title: 'Stack Overflow', desc: 'Draw against hard 3 times', hint: 'survive hard ×3', icon: '📚' },
  { id: 'segfault', title: 'Segmentation Fault', desc: 'Lose to BOT.exe on easy', hint: 'how did this happen?', icon: '💥' },
  { id: 'overclocked', title: 'Overclocked', desc: 'Win 5 games in a row', hint: 'streak ×5 vs BOT.exe', icon: '🔥' },
  { id: 'speedrun', title: 'Speedrun', desc: 'Win a Blitz game with every move under 2 s', hint: 'be quick', icon: '⚡' },
  { id: 'infinite_loop', title: 'Infinite Loop', desc: 'Play 10 Infinity games', hint: 'while(true)', icon: '♾️' },
  { id: 'inverted', title: 'Inverted Logic', desc: 'Win a Misère game vs medium or hard', hint: 'lose to win', icon: '🔀' },
  { id: 'pair_programming', title: 'Pair Programming', desc: 'Finish a Local 2P game', hint: 'bring a friend', icon: '👥' },
  { id: 'night_owl', title: 'Night Owl', desc: 'Switch to dark theme', hint: 'lights off', icon: '🌙' },
  { id: 'konami', title: 'Konami', desc: 'Find the easter egg', hint: '↑↑↓↓←→←→BA', icon: '🕹️' },
  { id: 'centurion', title: 'Centurion', desc: 'Play 100 games', hint: 'keep going', icon: '💯' },
];

/** @returns {{ v: number, unlocked: Record<string, string>, counters: { games: number, hardDraws: number, infinityGames: number }, matrix: boolean }} */
export function emptyUnlocks() {
  return { v: 1, unlocked: {}, counters: { games: 0, hardDraws: 0, infinityGames: 0 }, matrix: false };
}

const num = (x) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? Math.floor(x) : 0);

/**
 * Validate a stored unlocks object.
 * @param {unknown} raw
 */
export function normalizeUnlocks(raw) {
  const base = emptyUnlocks();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
  const r = /** @type {any} */ (raw);
  const ids = new Set(ACHIEVEMENTS.map((a) => a.id));
  const unlocked = {};
  if (r.unlocked && typeof r.unlocked === 'object') {
    for (const [k, v] of Object.entries(r.unlocked)) if (ids.has(k) && typeof v === 'string') unlocked[k] = v;
  }
  return {
    v: 1,
    unlocked,
    counters: { games: num(r.counters && r.counters.games), hardDraws: num(r.counters && r.counters.hardDraws), infinityGames: num(r.counters && r.counters.infinityGames) },
    matrix: r.matrix === true,
  };
}

/**
 * Apply an event and return the updated unlocks plus newly unlocked ids.
 * Events: 'game_over' (ctx: mode, variant, difficulty, result, streak, blitzFast), 'theme_dark', 'konami'.
 * @param {ReturnType<typeof emptyUnlocks>} unlocks
 * @param {string} event
 * @param {{ mode?: string, variant?: string, difficulty?: string, result?: 'win'|'loss'|'draw', streak?: number, blitzFast?: boolean, at?: string }} [ctx]
 * @returns {{ unlocks: ReturnType<typeof emptyUnlocks>, newly: string[] }}
 */
export function evaluate(unlocks, event, ctx = {}) {
  const u = normalizeUnlocks(unlocks);
  const next = { ...u, unlocked: { ...u.unlocked }, counters: { ...u.counters } };
  const newly = [];
  const at = ctx.at || new Date().toISOString();
  const grant = (id) => { if (!next.unlocked[id]) { next.unlocked[id] = at; newly.push(id); } };

  if (event === 'game_over') {
    next.counters.games++;
    if (ctx.variant === 'infinity') next.counters.infinityGames++;
    if (ctx.mode === 'bot' && ctx.difficulty === 'hard' && ctx.result === 'draw') next.counters.hardDraws++;
    grant('hello_world');
    if (ctx.result === 'win') grant('first_commit');
    if (ctx.mode === 'bot' && ctx.difficulty === 'medium' && ctx.result === 'win') grant('bug_squasher');
    if (next.counters.hardDraws >= 3) grant('stack_overflow');
    if (ctx.mode === 'bot' && ctx.difficulty === 'easy' && ctx.result === 'loss') grant('segfault');
    if (ctx.mode === 'bot' && (ctx.streak || 0) >= 5) grant('overclocked');
    if (ctx.variant === 'blitz' && ctx.result === 'win' && ctx.blitzFast) grant('speedrun');
    if (next.counters.infinityGames >= 10) grant('infinite_loop');
    if (ctx.variant === 'misere' && ctx.mode === 'bot' && ctx.result === 'win' && (ctx.difficulty === 'medium' || ctx.difficulty === 'hard')) grant('inverted');
    if (ctx.mode === 'local') grant('pair_programming');
    if (next.counters.games >= 100) grant('centurion');
  } else if (event === 'theme_dark') {
    grant('night_owl');
  } else if (event === 'konami') {
    next.matrix = true;
    grant('konami');
  }
  return { unlocks: next, newly };
}

/**
 * Look up an achievement definition.
 * @param {string} id
 */
export function getAchievement(id) {
  return ACHIEVEMENTS.find((a) => a.id === id) || null;
}
