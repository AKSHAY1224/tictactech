// engine/ai.js — PURE: easy/medium/hard opponents, minimax with alpha-beta pruning, heuristics (no DOM)
import { legalMoves, linesFor, sizeOf, nextPlayer, boardToString } from './board.js';
import { getVariant } from './rules.js';

export const DIFFICULTIES = ['easy', 'medium', 'hard'];

/** Move ordering: center, corners, edges (better pruning, nicer play). */
const ORDER = [4, 0, 2, 6, 8, 1, 3, 5, 7];
const INFINITY_DEPTH = 6;
const CACHE_LIMIT = 60000;

/**
 * Transposition table. Alpha-beta results are only exact inside the search window, so every
 * entry records whether its value is exact, a lower bound (fail-high) or an upper bound (fail-low).
 * @type {Map<string, { value: number, flag: 'exact' | 'lower' | 'upper' }>}
 */
const cache = new Map();

/** Clear the transposition cache (tests / memory). */
export function clearCache() {
  cache.clear();
}

/**
 * Legal moves in preferred order.
 * @param {object} state
 * @returns {number[]}
 */
function orderedMoves(state) {
  const legal = legalMoves(state.board);
  if (legal.length === state.board.length) return ORDER.slice();
  return ORDER.filter((i) => state.board[i] === null);
}

/**
 * Pick a random element with an injectable rng.
 * @template T
 * @param {T[]} arr
 * @param {() => number} rng
 * @returns {T}
 */
function pick(arr, rng) {
  return arr[Math.floor(rng() * arr.length) % arr.length];
}

/**
 * Moves that end the game as a win for the player to move.
 * @param {object} state
 * @param {string} variantId
 * @returns {number[]}
 */
export function winningMoves(state, variantId) {
  const variant = getVariant(variantId);
  const me = state.current;
  return legalMoves(state.board).filter((m) => {
    const next = variant.applyMove(state, m);
    return next.outcome && next.outcome.type === 'win' && next.outcome.player === me;
  });
}

/**
 * Moves that end the game as a LOSS for the player to move (Misère: completing a line).
 * @param {object} state
 * @param {string} variantId
 * @returns {number[]}
 */
export function losingMoves(state, variantId) {
  const variant = getVariant(variantId);
  const me = state.current;
  return legalMoves(state.board).filter((m) => {
    const next = variant.applyMove(state, m);
    return next.outcome && next.outcome.type === 'win' && next.outcome.player !== me;
  });
}

/**
 * Cells where the opponent would win immediately if it were their turn (threats to block).
 * @param {object} state
 * @param {string} variantId
 * @returns {number[]}
 */
export function blockingMoves(state, variantId) {
  if (variantId === 'misere') return [];
  const asOpponent = { ...state, current: nextPlayer(state.current) };
  return winningMoves(asOpponent, variantId);
}

/**
 * Number of lines still available to `player` (no opponent mark on them).
 * @param {(number|null)[]} board
 * @param {number} player
 * @returns {number}
 */
function openLines(board, player) {
  const opp = nextPlayer(player);
  let n = 0;
  for (const line of linesFor(sizeOf(board))) {
    if (line.every((i) => board[i] !== opp)) n++;
  }
  return n;
}

/**
 * Static evaluation for depth-limited search (Infinity), from `me`'s perspective.
 * @param {object} state
 * @param {number} me
 * @returns {number}
 */
function heuristic(state, me) {
  return (openLines(state.board, me) - openLines(state.board, nextPlayer(me))) * 0.5;
}

function cacheKey(state, me, depth, maxDepth) {
  const q = state.meta && state.meta.queues ? `${state.meta.queues[1].join('')}/${state.meta.queues[2].join('')}` : '';
  return `${state.variant}|${boardToString(state.board)}|${state.current}|${me}|${depth}|${maxDepth}|${q}`;
}

/**
 * Alpha-beta search. Scores: win for `me` = 10 - depth, loss = depth - 10, draw = 0.
 * @param {object} state
 * @param {object} variant
 * @param {number} me
 * @param {number} depth
 * @param {number} alpha
 * @param {number} beta
 * @param {number} maxDepth
 * @returns {number}
 */
function search(state, variant, me, depth, alpha, beta, maxDepth) {
  if (state.status === 'over') {
    const o = state.outcome;
    if (!o || o.type === 'draw') return 0;
    return o.player === me ? 10 - depth : depth - 10;
  }
  if (depth >= maxDepth) return heuristic(state, me);
  const key = cacheKey(state, me, depth, maxDepth);
  const alphaOrig = alpha;
  const betaOrig = beta;
  const hit = cache.get(key);
  if (hit) {
    if (hit.flag === 'exact') return hit.value;
    if (hit.flag === 'lower' && hit.value > alpha) alpha = hit.value;
    else if (hit.flag === 'upper' && hit.value < beta) beta = hit.value;
    if (alpha >= beta) return hit.value;
  }

  const maximizing = state.current === me;
  let best = maximizing ? -Infinity : Infinity;
  for (const m of orderedMoves(state)) {
    const score = search(variant.applyMove(state, m), variant, me, depth + 1, alpha, beta, maxDepth);
    if (maximizing) {
      if (score > best) best = score;
      if (best > alpha) alpha = best;
    } else {
      if (score < best) best = score;
      if (best < beta) beta = best;
    }
    if (beta <= alpha) break;
  }
  if (cache.size > CACHE_LIMIT) cache.clear();
  let flag = 'exact';
  if (best <= alphaOrig) flag = 'upper';
  else if (best >= betaOrig) flag = 'lower';
  cache.set(key, { value: best, flag });
  return best;
}

/**
 * Score every legal move for the player to move.
 * @param {object} state
 * @param {string} variantId
 * @returns {{ move: number, score: number }[]}
 */
export function minimax(state, variantId) {
  const variant = getVariant(variantId);
  const me = state.current;
  const maxDepth = variantId === 'infinity' ? INFINITY_DEPTH : 99;
  return orderedMoves(state).map((move) => ({
    move,
    score: search(variant.applyMove(state, move), variant, me, 1, -Infinity, Infinity, maxDepth),
  }));
}

/**
 * All moves that share the best minimax score (ties are equally perfect).
 * @param {object} state
 * @param {string} variantId
 * @returns {number[]}
 */
export function bestMoves(state, variantId) {
  const scored = minimax(state, variantId);
  if (scored.length === 0) return [];
  const top = Math.max(...scored.map((s) => s.score));
  return scored.filter((s) => s.score === top).map((s) => s.move);
}

/**
 * Priority heuristic: center → random corner → random edge, restricted to `allowed`.
 * @param {number[]} allowed
 * @param {() => number} rng
 * @returns {number | null}
 */
function priorityMove(allowed, rng) {
  if (allowed.includes(4)) return 4;
  const corners = allowed.filter((i) => [0, 2, 6, 8].includes(i));
  if (corners.length) return pick(corners, rng);
  const edges = allowed.filter((i) => [1, 3, 5, 7].includes(i));
  if (edges.length) return pick(edges, rng);
  return null;
}

/**
 * Choose the bot's move.
 * - easy:   random legal move; 30% chance to take an immediate win; never blocks on purpose.
 * - medium: win now (100%) → block (100%) → 70% priority heuristic / 30% random.
 * - hard:   perfect play (alpha-beta), random among equally best moves.
 * @param {object} state
 * @param {string} variantId
 * @param {'easy'|'medium'|'hard'} difficulty
 * @param {() => number} [rng=Math.random]
 * @returns {number}
 */
export function chooseMove(state, variantId, difficulty, rng = Math.random) {
  const legal = legalMoves(state.board);
  if (legal.length === 0) throw new Error('ERR_NO_MOVES');
  if (legal.length === 1) return legal[0];

  if (difficulty === 'hard') return pick(bestMoves(state, variantId), rng);

  const wins = winningMoves(state, variantId);
  if (difficulty === 'easy') {
    if (wins.length && rng() < 0.3) return pick(wins, rng);
    return pick(legal, rng);
  }

  // medium
  if (wins.length) return pick(wins, rng);
  const blocks = blockingMoves(state, variantId);
  if (blocks.length) return pick(blocks, rng);
  const losing = new Set(losingMoves(state, variantId));
  const safe = legal.filter((m) => !losing.has(m));
  const allowed = safe.length ? safe : legal;
  if (rng() < 0.7) {
    const p = priorityMove(allowed, rng);
    if (p !== null) return p;
  }
  return pick(allowed, rng);
}
