// engine/board.js — PURE: createBoard, applyMove, getWinner, isFull, legalMoves, nextPlayer, LINES (no DOM)

/** Player identifiers. Empty cells are `null`. */
export const P1 = 1;
export const P2 = 2;

/** Error codes thrown by applyMove. */
export const ERR_CELL_OCCUPIED = 'ERR_CELL_OCCUPIED';
export const ERR_OUT_OF_RANGE = 'ERR_OUT_OF_RANGE';

/** @type {Map<number, number[][]>} */
const lineCache = new Map();

/**
 * All winning lines (rows, columns, two diagonals) for a square board.
 * @param {number} size
 * @returns {number[][]}
 */
export function linesFor(size) {
  const cached = lineCache.get(size);
  if (cached) return cached;
  const lines = [];
  for (let r = 0; r < size; r++) lines.push(Array.from({ length: size }, (_, c) => r * size + c));
  for (let c = 0; c < size; c++) lines.push(Array.from({ length: size }, (_, r) => r * size + c));
  lines.push(Array.from({ length: size }, (_, i) => i * size + i));
  lines.push(Array.from({ length: size }, (_, i) => i * size + (size - 1 - i)));
  lineCache.set(size, lines);
  return lines;
}

/** The 8 winning lines of a 3×3 board. */
export const LINES = linesFor(3);

/**
 * Create an empty board.
 * @param {number} [size=3]
 * @returns {(number|null)[]}
 */
export function createBoard(size = 3) {
  return Array(size * size).fill(null);
}

/**
 * Board side length.
 * @param {(number|null)[]} board
 * @returns {number}
 */
export function sizeOf(board) {
  return Math.round(Math.sqrt(board.length));
}

/**
 * Place a mark. Returns a NEW board; the input is never mutated.
 * @param {(number|null)[]} board
 * @param {number} index
 * @param {number} player
 * @returns {(number|null)[]}
 * @throws {Error} ERR_OUT_OF_RANGE | ERR_CELL_OCCUPIED
 */
export function applyMove(board, index, player) {
  if (!Number.isInteger(index) || index < 0 || index >= board.length) throw new Error(ERR_OUT_OF_RANGE);
  if (board[index] !== null) throw new Error(ERR_CELL_OCCUPIED);
  const next = board.slice();
  next[index] = player;
  return next;
}

/**
 * Find a completed line.
 * @param {(number|null)[]} board
 * @returns {{ player: number, line: number[] } | null}
 */
export function getWinner(board) {
  const lines = linesFor(sizeOf(board));
  for (const line of lines) {
    const first = board[line[0]];
    if (first === null) continue;
    let all = true;
    for (let i = 1; i < line.length; i++) {
      if (board[line[i]] !== first) { all = false; break; }
    }
    if (all) return { player: first, line };
  }
  return null;
}

/**
 * True when no empty cell remains.
 * @param {(number|null)[]} board
 * @returns {boolean}
 */
export function isFull(board) {
  return board.every((c) => c !== null);
}

/**
 * Indexes of empty cells.
 * @param {(number|null)[]} board
 * @returns {number[]}
 */
export function legalMoves(board) {
  const out = [];
  for (let i = 0; i < board.length; i++) if (board[i] === null) out.push(i);
  return out;
}

/**
 * The other player.
 * @param {number} player
 * @returns {number}
 */
export function nextPlayer(player) {
  return player === P1 ? P2 : P1;
}

/**
 * Convert a cell index to zero-based row/column.
 * @param {number} index
 * @param {number} [size=3]
 * @returns {{ row: number, col: number }}
 */
export function toRC(index, size = 3) {
  return { row: Math.floor(index / size), col: index % size };
}

/**
 * Compact string form, e.g. "1.2......" — used for cache keys and tests.
 * @param {(number|null)[]} board
 * @returns {string}
 */
export function boardToString(board) {
  return board.map((c) => (c === null ? '.' : String(c))).join('');
}

/**
 * Parse the compact string form produced by boardToString.
 * @param {string} str
 * @returns {(number|null)[]}
 */
export function boardFromString(str) {
  return [...str].map((ch) => (ch === '.' ? null : Number(ch)));
}
