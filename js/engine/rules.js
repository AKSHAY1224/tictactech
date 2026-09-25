// engine/rules.js — PURE: variant rule sets (classic, infinity, blitz, misere) as strategy objects (no DOM)
import { P1, P2, createBoard, applyMove as placeMark, getWinner, isFull, nextPlayer } from './board.js';

/**
 * Game state shape (immutable: every applyMove returns a new object):
 * {
 *   variant:   'classic' | 'infinity' | 'blitz' | 'misere',
 *   board:     (1|2|null)[9],
 *   current:   1 | 2                       — player to move
 *   history:   { index, player, removed }[] — removed: index of a mark that vanished (Infinity) or null
 *   winner:    1 | 2 | null,
 *   line:      number[] | null             — the completed line (also set for the loser in Misère)
 *   status:    'playing' | 'over',
 *   outcome:   null | { type: 'win', player, line, loser? } | { type: 'draw' },
 *   startedBy: 1 | 2,
 *   moveCount: number,
 *   meta:      variant-specific data (e.g. Infinity queues, Blitz timerSeconds)
 * }
 */

export const MAX_INFINITY_MARKS = 3;
export const BLITZ_DEFAULT_SECONDS = 5;
export const BLITZ_OPTIONS = [3, 5, 10];

/**
 * Build the initial state shared by all variants.
 * @param {string} variant
 * @param {{ startedBy?: number }} [opts]
 * @returns {object}
 */
function baseInit(variant, opts = {}) {
  const startedBy = opts.startedBy === P2 ? P2 : P1;
  return {
    variant,
    board: createBoard(3),
    current: startedBy,
    history: [],
    winner: null,
    line: null,
    status: 'playing',
    outcome: null,
    startedBy,
    moveCount: 0,
    meta: {},
  };
}

/**
 * Generic legality check: game running and the cell is empty.
 * @param {object} state
 * @param {number} index
 * @returns {boolean}
 */
function baseCanMove(state, index) {
  return state.status === 'playing' && Number.isInteger(index) && index >= 0 && index < state.board.length && state.board[index] === null;
}

/**
 * Finalise a state after a move: compute the outcome and set winner/line/status.
 * @param {object} state
 * @param {(s: object) => object} getOutcome
 * @returns {object}
 */
function finalize(state, getOutcome) {
  const outcome = getOutcome(state);
  if (outcome.type === 'win') {
    return { ...state, outcome, winner: outcome.player, line: outcome.line, status: 'over' };
  }
  if (outcome.type === 'draw') {
    return { ...state, outcome, winner: null, line: null, status: 'over' };
  }
  return { ...state, outcome: null, winner: null, line: null, status: 'playing' };
}

/* ------------------------------------------------------------------ */
/* Classic                                                             */
/* ------------------------------------------------------------------ */

function classicOutcome(state) {
  const w = getWinner(state.board);
  if (w) return { type: 'win', player: w.player, line: w.line };
  if (isFull(state.board)) return { type: 'draw' };
  return { type: 'ongoing' };
}

function classicApply(state, index) {
  if (state.status !== 'playing') throw new Error('ERR_GAME_OVER');
  const board = placeMark(state.board, index, state.current);
  const next = {
    ...state,
    board,
    history: [...state.history, { index, player: state.current, removed: null }],
    moveCount: state.moveCount + 1,
    current: nextPlayer(state.current),
  };
  return finalize(next, classicOutcome);
}

export const classic = {
  id: 'classic',
  name: 'Classic',
  description: 'Three in a row wins. Full board is a draw.',
  supports: { undo: true, hint: true, bot: true },
  /** @param {{ startedBy?: number }} [opts] */
  init: (opts = {}) => baseInit('classic', opts),
  canMove: baseCanMove,
  applyMove: classicApply,
  getOutcome: classicOutcome,
};

/* ------------------------------------------------------------------ */
/* Misère — completing a line LOSES                                    */
/* ------------------------------------------------------------------ */

function misereOutcome(state) {
  const w = getWinner(state.board);
  if (w) return { type: 'win', player: nextPlayer(w.player), line: w.line, loser: w.player };
  if (isFull(state.board)) return { type: 'draw' };
  return { type: 'ongoing' };
}

function misereApply(state, index) {
  if (state.status !== 'playing') throw new Error('ERR_GAME_OVER');
  const board = placeMark(state.board, index, state.current);
  const next = {
    ...state,
    board,
    history: [...state.history, { index, player: state.current, removed: null }],
    moveCount: state.moveCount + 1,
    current: nextPlayer(state.current),
  };
  return finalize(next, misereOutcome);
}

export const misere = {
  id: 'misere',
  name: 'Misère',
  description: 'Reverse logic: making three in a row LOSES. Full board is a draw.',
  supports: { undo: true, hint: true, bot: true },
  init: (opts = {}) => baseInit('misere', opts),
  canMove: baseCanMove,
  applyMove: misereApply,
  getOutcome: misereOutcome,
};

/* ------------------------------------------------------------------ */
/* Infinity — max 3 marks each; the oldest vanishes on the 4th         */
/* ------------------------------------------------------------------ */

function infinityOutcome(state) {
  const w = getWinner(state.board);
  if (w) return { type: 'win', player: w.player, line: w.line };
  return { type: 'ongoing' };
}

function infinityApply(state, index) {
  if (state.status !== 'playing') throw new Error('ERR_GAME_OVER');
  const player = state.current;
  let board = placeMark(state.board, index, player);
  const queues = { 1: [...state.meta.queues[1]], 2: [...state.meta.queues[2]] };
  queues[player].push(index);
  let removed = null;
  if (queues[player].length > MAX_INFINITY_MARKS) {
    removed = queues[player].shift();
    board = board.slice();
    board[removed] = null;
  }
  const next = {
    ...state,
    board,
    history: [...state.history, { index, player, removed }],
    moveCount: state.moveCount + 1,
    current: nextPlayer(player),
    meta: { ...state.meta, queues },
  };
  return finalize(next, infinityOutcome);
}

/**
 * The mark that will vanish when the current player places next (or null).
 * @param {object} state
 * @returns {number | null}
 */
export function nextToVanish(state) {
  if (state.variant !== 'infinity' || state.status !== 'playing') return null;
  const q = state.meta.queues[state.current];
  return q.length >= MAX_INFINITY_MARKS ? q[0] : null;
}

export const infinity = {
  id: 'infinity',
  name: 'Infinity',
  description: 'Max 3 marks each. Placing a 4th removes your oldest. No draws.',
  supports: { undo: true, hint: true, bot: true },
  init: (opts = {}) => {
    const s = baseInit('infinity', opts);
    s.meta = { queues: { 1: [], 2: [] } };
    return s;
  },
  canMove: baseCanMove,
  applyMove: infinityApply,
  getOutcome: infinityOutcome,
  nextToVanish,
};

/* ------------------------------------------------------------------ */
/* Blitz — classic rules plus a per-move countdown                     */
/* ------------------------------------------------------------------ */

export const blitz = {
  id: 'blitz',
  name: 'Blitz',
  description: 'Classic rules with a per-move countdown. Timeout auto-commits a random cell.',
  supports: { undo: false, hint: false, bot: true },
  /** @param {{ startedBy?: number, timerSeconds?: number }} [opts] */
  init: (opts = {}) => {
    const s = baseInit('blitz', opts);
    const secs = Number(opts.timerSeconds);
    s.meta = { timerSeconds: BLITZ_OPTIONS.includes(secs) ? secs : BLITZ_DEFAULT_SECONDS };
    return s;
  },
  canMove: baseCanMove,
  applyMove: classicApply,
  getOutcome: classicOutcome,
};

/* ------------------------------------------------------------------ */
/* Registry & helpers                                                  */
/* ------------------------------------------------------------------ */

export const VARIANTS = { classic, infinity, blitz, misere };
export const VARIANT_IDS = Object.keys(VARIANTS);

/**
 * Look up a variant by id (falls back to classic).
 * @param {string} id
 * @returns {typeof classic}
 */
export function getVariant(id) {
  return VARIANTS[id] || classic;
}

/**
 * Undo the last move by replaying history. Returns the same state when nothing to undo.
 * @param {object} state
 * @param {number} [count=1] how many moves to revert
 * @returns {object}
 */
export function undoMove(state, count = 1) {
  const variant = getVariant(state.variant);
  const keep = Math.max(0, state.history.length - count);
  if (keep === state.history.length) return state;
  let s = variant.init({ startedBy: state.startedBy, timerSeconds: state.meta.timerSeconds });
  for (let i = 0; i < keep; i++) s = variant.applyMove(s, state.history[i].index);
  return s;
}

/**
 * Rebuild a state from a variant id, a starting player and an ordered move list.
 * @param {string} variantId
 * @param {number[]} moves
 * @param {{ startedBy?: number, timerSeconds?: number }} [opts]
 * @returns {object}
 */
export function replay(variantId, moves, opts = {}) {
  const variant = getVariant(variantId);
  let s = variant.init(opts);
  for (const index of moves) s = variant.applyMove(s, index);
  return s;
}
