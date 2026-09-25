// ui/render.js — board DOM rendering, SVG marks, win line, ghost hover preview
import { toRC } from '../engine/board.js';

const SIZE = 3;
const NS = 'http://www.w3.org/2000/svg';

/**
 * Symbol packs. Every shape is drawn on a 100×100 viewBox with pathLength="100" so the
 * stroke-draw animation works for any geometry. `fill: true` fades a fill in after the stroke.
 * @type {Record<string, { name: string, 1: { paths: string[], fill?: boolean }, 2: { paths: string[], circle?: boolean, fill?: boolean } }>}
 */
export const SYMBOL_PACKS = {
  code: {
    name: 'Code',
    1: { paths: ['M35 30 L15 50 L35 70', 'M65 30 L85 50 L65 70', 'M58 22 L42 78'] },
    2: { paths: ['M42 20 C30 20 32 32 32 40 C32 48 26 50 22 50 C26 50 32 52 32 60 C32 68 30 80 42 80', 'M58 20 C70 20 68 32 68 40 C68 48 74 50 78 50 C74 50 68 52 68 60 C68 68 70 80 58 80'] },
  },
  binary: {
    name: 'Binary',
    1: { paths: ['M40 30 L55 22 L55 78', 'M40 78 L70 78'] },
    2: { paths: ['M50 22 C64 22 70 36 70 50 C70 64 64 78 50 78 C36 78 30 64 30 50 C30 36 36 22 50 22 Z', 'M41 66 L59 34'] },
  },
  classic: {
    name: 'Classic',
    1: { paths: ['M25 25 L75 75', 'M75 25 L25 75'] },
    2: { paths: [], circle: true },
  },
  circuit: {
    name: 'Circuit',
    1: { paths: ['M36 30 H64 A6 6 0 0 1 70 36 V64 A6 6 0 0 1 64 70 H36 A6 6 0 0 1 30 64 V36 A6 6 0 0 1 36 30 Z', 'M40 30 V18 M50 30 V18 M60 30 V18 M40 70 V82 M50 70 V82 M60 70 V82 M30 40 H18 M30 50 H18 M30 60 H18 M70 40 H82 M70 50 H82 M70 60 H82'] },
    2: { paths: ['M55 15 L30 55 H50 L45 85 L70 45 H50 Z'], fill: true },
  },
};

/**
 * Build an inline SVG mark element for a player.
 * @param {number} player 1 | 2
 * @param {string} [pack='code']
 * @param {{ ghost?: boolean, animate?: boolean }} [opts]
 * @returns {SVGSVGElement}
 */
export function createMark(player, pack = 'code', opts = {}) {
  const spec = (SYMBOL_PACKS[pack] || SYMBOL_PACKS.code)[player];
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('mark', `mark--p${player}`);
  if (opts.ghost) svg.classList.add('mark--ghost');
  if (opts.animate === false) svg.classList.add('mark--static');
  if (spec.fill) svg.classList.add('mark--fill');
  let i = 0;
  if (spec.circle) {
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('cx', '50'); c.setAttribute('cy', '50'); c.setAttribute('r', '26'); c.setAttribute('pathLength', '100');
    c.style.setProperty('--i', String(i++));
    svg.appendChild(c);
  }
  for (const d of spec.paths) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('pathLength', '100');
    p.style.setProperty('--i', String(i++));
    svg.appendChild(p);
  }
  return svg;
}

/** @type {HTMLElement | null} */
let boardEl = null;
/** @type {HTMLButtonElement[]} */
let cells = [];
/** @type {SVGSVGElement | null} */
let winline = null;
let focusIndex = 0;
/** @type {{ onSelect: (index: number) => void, canGhost: () => number | null }} */
let handlers = { onSelect: () => {}, canGhost: () => null };
const finePointer = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches;

/**
 * Human-readable cell label, e.g. "Row 2, Column 3: USER_1".
 * @param {number} index
 * @param {string} occupant
 * @returns {string}
 */
export function cellLabel(index, occupant) {
  const { row, col } = toRC(index, SIZE);
  return `Row ${row + 1}, Column ${col + 1}: ${occupant}`;
}

/**
 * Wire the board once: delegated clicks, roving-tabindex arrow navigation, hover ghosts.
 * @param {{ onSelect: (index: number) => void, canGhost: () => number | null }} h
 */
export function initBoard(h) {
  handlers = h;
  boardEl = document.getElementById('board');
  if (!boardEl) return;
  cells = /** @type {HTMLButtonElement[]} */ ([...boardEl.querySelectorAll('.board__cell')]);
  winline = /** @type {SVGSVGElement | null} */ (boardEl.querySelector('.board__winline'));

  boardEl.addEventListener('click', (e) => {
    const cell = /** @type {HTMLElement} */ (e.target).closest('.board__cell');
    if (!cell) return;
    const index = Number(cell.dataset.index);
    setFocusIndex(index);
    handlers.onSelect(index);
  });

  boardEl.addEventListener('keydown', (e) => {
    const cell = /** @type {HTMLElement} */ (e.target).closest('.board__cell');
    if (!cell) return;
    const idx = Number(cell.dataset.index);
    const { row, col } = toRC(idx, SIZE);
    let next = null;
    switch (e.key) {
      case 'ArrowLeft': next = row * SIZE + ((col + SIZE - 1) % SIZE); break;
      case 'ArrowRight': next = row * SIZE + ((col + 1) % SIZE); break;
      case 'ArrowUp': next = ((row + SIZE - 1) % SIZE) * SIZE + col; break;
      case 'ArrowDown': next = ((row + 1) % SIZE) * SIZE + col; break;
      case 'Home': next = 0; break;
      case 'End': next = SIZE * SIZE - 1; break;
      default: return;
    }
    e.preventDefault();
    focusCell(next);
  });

  boardEl.addEventListener('pointerover', (e) => {
    if (!finePointer()) return;
    const cell = /** @type {HTMLElement} */ (e.target).closest('.board__cell');
    if (!cell || cell.classList.contains('is-taken')) return;
    const player = handlers.canGhost();
    if (!player) return;
    if (cell.querySelector('.mark--ghost')) return;
    cell.appendChild(createMark(player, currentPack, { ghost: true, animate: false }));
  });
  boardEl.addEventListener('pointerout', (e) => {
    const cell = /** @type {HTMLElement} */ (e.target).closest('.board__cell');
    if (!cell) return;
    const related = /** @type {Node | null} */ (e.relatedTarget);
    if (related && cell.contains(related)) return;
    clearGhost(cell);
  });
}

let currentPack = 'code';

/**
 * Change the symbol pack used for new marks (re-render to apply to existing marks).
 * @param {string} pack
 */
export function setSymbolPack(pack) {
  currentPack = SYMBOL_PACKS[pack] ? pack : 'code';
}

function clearGhost(cell) {
  cell.querySelectorAll('.mark--ghost').forEach((g) => g.remove());
}

/** Remove every ghost preview from the board. */
export function clearGhosts() {
  cells.forEach(clearGhost);
}

function setFocusIndex(index) {
  focusIndex = index;
  cells.forEach((c, i) => c.setAttribute('tabindex', i === index ? '0' : '-1'));
}

/**
 * Move keyboard focus to a cell (roving tabindex).
 * @param {number} index
 */
export function focusCell(index) {
  if (!cells[index]) return;
  setFocusIndex(index);
  cells[index].focus({ preventScroll: true });
}

/**
 * Render the board from engine state. Only changed cells are touched so animations
 * play once per placement. Returns a promise that resolves when vanish animations finish.
 * @param {object} state engine state
 * @param {{ names: Record<number, string>, pack?: string, vanishing?: number | null, locked?: boolean, winnerLine?: number[] | null, lineColorPlayer?: number | null }} opts
 * @returns {Promise<void>}
 */
export function renderBoard(state, opts) {
  if (!boardEl) return Promise.resolve();
  const pack = opts.pack || currentPack;
  const waits = [];
  boardEl.dataset.locked = opts.locked ? 'true' : 'false';
  boardEl.classList.toggle('is-over', state.status === 'over');

  cells.forEach((cell, i) => {
    const player = state.board[i];
    const has = Number(cell.dataset.player || 0) || null;
    if (player !== has) {
      const existing = cell.querySelector('.mark:not(.mark--ghost)');
      if (player === null && existing && opts.instant) {
        existing.remove();
      } else if (player === null && existing) {
        // Infinity vanish: animate out, then remove.
        cell.classList.add('is-vanishing');
        waits.push(new Promise((resolve) => {
          const done = () => { existing.remove(); cell.classList.remove('is-vanishing'); resolve(); };
          const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'reduced';
          if (reduced) done();
          else { existing.classList.add('mark--vanish'); setTimeout(done, 240); }
        }));
      } else if (player !== null) {
        clearGhost(cell);
        if (existing) existing.remove();
        cell.appendChild(createMark(player, pack, { animate: !opts.noAnimate }));
      }
      cell.dataset.player = player === null ? '' : String(player);
    } else if (player !== null && opts.repaint) {
      const existing = cell.querySelector('.mark:not(.mark--ghost)');
      if (existing) existing.remove();
      cell.appendChild(createMark(player, pack, { animate: false }));
    }
    cell.classList.toggle('is-taken', player !== null);
    cell.classList.toggle('board__cell--p1', player === 1);
    cell.classList.toggle('board__cell--p2', player === 2);
    cell.classList.toggle('is-fading', opts.vanishing === i && player !== null);
    cell.classList.toggle('board__cell--winner', !!(opts.winnerLine && opts.winnerLine.includes(i)));
    cell.classList.toggle('is-losing', !!(opts.winnerLine && opts.winnerLine.includes(i) && opts.lineDanger));
    const occupant = player === null ? 'empty' : (opts.names[player] || `Player ${player}`);
    cell.setAttribute('aria-label', cellLabel(i, occupant));
  });
  return Promise.all(waits).then(() => undefined);
}

/**
 * Reset every cell to empty without animation (new game / undo).
 * @param {Record<number, string>} names
 */
export function clearBoard(names) {
  cells.forEach((cell, i) => {
    cell.querySelectorAll('.mark').forEach((m) => m.remove());
    cell.dataset.player = '';
    cell.className = 'board__cell';
    cell.setAttribute('aria-label', cellLabel(i, 'empty'));
  });
  clearWinLine();
  setFocusIndex(0);
}

/**
 * Draw and animate the winning line across three cells.
 * @param {number[]} line cell indexes
 * @param {number} player color owner (1 | 2)
 * @param {boolean} [danger=false] draw in the danger color (Misère loss)
 */
export function drawWinLine(line, player, danger = false) {
  if (!winline || !boardEl || line.length < 2) return;
  const b = boardEl.getBoundingClientRect();
  const c0 = cells[line[0]].getBoundingClientRect();
  const c2 = cells[line[line.length - 1]].getBoundingClientRect();
  const p0 = { x: c0.left + c0.width / 2 - b.left, y: c0.top + c0.height / 2 - b.top };
  const p2 = { x: c2.left + c2.width / 2 - b.left, y: c2.top + c2.height / 2 - b.top };
  // extend slightly beyond the end-cell centers
  const dx = p2.x - p0.x; const dy = p2.y - p0.y;
  const len = Math.hypot(dx, dy) || 1;
  const ext = Math.min(c0.width, c0.height) * 0.28;
  const ux = dx / len; const uy = dy / len;
  const x1 = p0.x - ux * ext; const y1 = p0.y - uy * ext;
  const x2 = p2.x + ux * ext; const y2 = p2.y + uy * ext;
  winline.setAttribute('viewBox', `0 0 ${b.width} ${b.height}`);
  const lineEl = winline.querySelector('line');
  if (!lineEl) return;
  lineEl.setAttribute('x1', String(x1)); lineEl.setAttribute('y1', String(y1));
  lineEl.setAttribute('x2', String(x2)); lineEl.setAttribute('y2', String(y2));
  lineEl.setAttribute('pathLength', '100');
  winline.classList.remove('is-visible', 'is-p1', 'is-p2', 'is-danger');
  void winline.getBoundingClientRect();
  winline.classList.add('is-visible', danger ? 'is-danger' : `is-p${player}`);
}

/** Hide the win line. */
export function clearWinLine() {
  if (!winline) return;
  winline.classList.remove('is-visible', 'is-p1', 'is-p2', 'is-danger');
}

/**
 * Play the shake animation on a cell (invalid move feedback).
 * @param {number} index
 */
export function shakeCell(index) {
  const cell = cells[index];
  if (!cell) return;
  cell.classList.remove('anim-shake');
  void cell.offsetWidth;
  cell.classList.add('anim-shake');
  cell.addEventListener('animationend', () => cell.classList.remove('anim-shake'), { once: true });
}

/**
 * Pulse a cell for ~1.2 s (hint).
 * @param {number} index
 */
export function pulseCell(index) {
  const cell = cells[index];
  if (!cell) return;
  cell.classList.add('is-hinted');
  setTimeout(() => cell.classList.remove('is-hinted'), 1200);
}

/**
 * Re-measure the win line after a resize (keeps it aligned to the cells).
 * @param {number[] | null} line
 * @param {number | null} player
 * @param {boolean} danger
 */
export function relayoutWinLine(line, player, danger) {
  if (!line || !player || !winline || !winline.classList.contains('is-visible')) return;
  winline.classList.add('no-anim');
  drawWinLine(line, player, danger);
  requestAnimationFrame(() => winline && winline.classList.remove('no-anim'));
}
