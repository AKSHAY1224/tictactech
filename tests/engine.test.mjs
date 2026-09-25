// tests/engine.test.mjs — node:test suite for board + rules
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  P1, P2, LINES, createBoard, applyMove, getWinner, isFull, legalMoves, nextPlayer, toRC,
  boardToString, boardFromString, linesFor, ERR_CELL_OCCUPIED, ERR_OUT_OF_RANGE,
} from '../js/engine/board.js';
import { classic, misere, infinity, blitz, VARIANTS, getVariant, undoMove, replay, nextToVanish, MAX_INFINITY_MARKS } from '../js/engine/rules.js';

describe('board.js', () => {
  test('createBoard returns 9 empty cells', () => {
    const b = createBoard();
    assert.equal(b.length, 9);
    assert.ok(b.every((c) => c === null));
  });

  test('LINES has exactly 8 lines for 3×3 and linesFor(4) has 10', () => {
    assert.equal(LINES.length, 8);
    assert.equal(linesFor(4).length, 10);
  });

  test('every line wins for both players, and no other 3-cell set does', () => {
    for (const line of LINES) {
      for (const p of [P1, P2]) {
        const b = createBoard();
        line.forEach((i) => { b[i] = p; });
        const w = getWinner(b);
        assert.ok(w, `line ${line} should win`);
        assert.equal(w.player, p);
        assert.deepEqual(w.line, line);
      }
    }
    // a non-line triple must not win
    const b = boardFromString('11.2.1...');
    assert.equal(getWinner(b), null);
  });

  test('no false positive on empty and partial boards', () => {
    assert.equal(getWinner(createBoard()), null);
    assert.equal(getWinner(boardFromString('12.21.12.')), null);
    assert.equal(getWinner(boardFromString('121212.12')), null);
  });

  test('applyMove is immutable and returns a new array', () => {
    const b = createBoard();
    const n = applyMove(b, 4, P1);
    assert.notEqual(n, b);
    assert.equal(b[4], null);
    assert.equal(n[4], P1);
  });

  test('applyMove throws on occupied and out-of-range cells', () => {
    const b = applyMove(createBoard(), 0, P1);
    assert.throws(() => applyMove(b, 0, P2), { message: ERR_CELL_OCCUPIED });
    assert.throws(() => applyMove(b, 9, P2), { message: ERR_OUT_OF_RANGE });
    assert.throws(() => applyMove(b, -1, P2), { message: ERR_OUT_OF_RANGE });
    assert.throws(() => applyMove(b, 1.5, P2), { message: ERR_OUT_OF_RANGE });
  });

  test('isFull, legalMoves, nextPlayer, toRC, string round-trip', () => {
    assert.equal(isFull(createBoard()), false);
    assert.equal(isFull(boardFromString('121221112')), true);
    assert.deepEqual(legalMoves(boardFromString('1.2.1.2..')), [1, 3, 5, 7, 8]);
    assert.equal(nextPlayer(P1), P2);
    assert.equal(nextPlayer(P2), P1);
    assert.deepEqual(toRC(5), { row: 1, col: 2 });
    assert.deepEqual(toRC(6), { row: 2, col: 0 });
    const s = '1.2..1.2.';
    assert.equal(boardToString(boardFromString(s)), s);
  });
});

describe('rules.js — classic', () => {
  test('init state shape', () => {
    const s = classic.init();
    assert.equal(s.variant, 'classic');
    assert.equal(s.current, P1);
    assert.equal(s.status, 'playing');
    assert.equal(s.moveCount, 0);
    assert.deepEqual(s.history, []);
    assert.equal(classic.init({ startedBy: P2 }).current, P2);
  });

  test('turns alternate and history records moves', () => {
    let s = classic.init();
    s = classic.applyMove(s, 0);
    assert.equal(s.current, P2);
    s = classic.applyMove(s, 4);
    assert.equal(s.current, P1);
    assert.deepEqual(s.history.map((h) => [h.index, h.player]), [[0, P1], [4, P2]]);
    assert.equal(s.moveCount, 2);
  });

  test('applyMove does not mutate the input state', () => {
    const s0 = classic.init();
    const frozenBoard = s0.board.slice();
    classic.applyMove(s0, 3);
    assert.deepEqual(s0.board, frozenBoard);
    assert.equal(s0.history.length, 0);
    assert.equal(s0.moveCount, 0);
  });

  test('win is detected with the right line and the game ends', () => {
    const s = replay('classic', [0, 3, 1, 4, 2]);
    assert.equal(s.status, 'over');
    assert.equal(s.winner, P1);
    assert.deepEqual(s.line, [0, 1, 2]);
    assert.equal(s.outcome.type, 'win');
    assert.throws(() => classic.applyMove(s, 5), { message: 'ERR_GAME_OVER' });
    assert.equal(classic.canMove(s, 5), false);
  });

  test('draw only when the board is full without a winner', () => {
    const s = replay('classic', [0, 1, 2, 4, 3, 5, 7, 6, 8]);
    assert.equal(boardToString(s.board), '121122211');
    assert.equal(s.status, 'over');
    assert.equal(s.outcome.type, 'draw');
    assert.equal(s.winner, null);
    const partial = replay('classic', [0, 1, 2, 4, 3, 5, 7, 6]);
    assert.equal(partial.status, 'playing');
    assert.equal(partial.outcome, null);
  });

  test('occupied / out-of-range moves throw and canMove reports false', () => {
    const s = classic.applyMove(classic.init(), 4);
    assert.throws(() => classic.applyMove(s, 4), { message: ERR_CELL_OCCUPIED });
    assert.throws(() => classic.applyMove(s, 42), { message: ERR_OUT_OF_RANGE });
    assert.equal(classic.canMove(s, 4), false);
    assert.equal(classic.canMove(s, 42), false);
    assert.equal(classic.canMove(s, 0), true);
  });

  test('undoMove reverts one or more moves by replay', () => {
    const s = replay('classic', [0, 4, 8]);
    const u1 = undoMove(s);
    assert.equal(u1.moveCount, 2);
    assert.equal(u1.board[8], null);
    assert.equal(u1.current, P1);
    const u2 = undoMove(s, 2);
    assert.equal(u2.moveCount, 1);
    assert.equal(u2.current, P2);
    const fresh = classic.init();
    assert.equal(undoMove(fresh), fresh, 'nothing to undo returns the same state');
  });
});

describe('rules.js — misère', () => {
  test('completing a line makes the OTHER player win', () => {
    const s = replay('misere', [0, 3, 1, 4, 2]);
    assert.equal(s.status, 'over');
    assert.equal(s.winner, P2);
    assert.equal(s.outcome.loser, P1);
    assert.deepEqual(s.line, [0, 1, 2]);
  });

  test('full board without a line is a draw', () => {
    const s = replay('misere', [0, 1, 2, 4, 3, 5, 7, 6, 8]);
    assert.equal(s.outcome.type, 'draw');
  });
});

describe('rules.js — infinity', () => {
  test('never more than 3 marks per player; the oldest vanishes on the 4th', () => {
    // P1: 0,2,6 then 8 → 0 vanishes. P2: 1,3,5 stays at 3.
    const s = replay('infinity', [0, 1, 2, 3, 6, 5, 8]);
    assert.equal(s.board[0], null, 'oldest P1 mark removed');
    assert.equal(s.board.filter((c) => c === P1).length, MAX_INFINITY_MARKS);
    assert.equal(s.board.filter((c) => c === P2).length, 3);
    assert.equal(s.history[6].removed, 0);
    assert.deepEqual(s.meta.queues[1], [2, 6, 8]);
  });

  test('nextToVanish points at the current player oldest mark only when they hold 3', () => {
    let s = replay('infinity', [0, 1, 2, 3]);
    assert.equal(nextToVanish(s), null);
    s = replay('infinity', [0, 1, 2, 3, 6, 5]);
    assert.equal(s.current, P1);
    assert.equal(nextToVanish(s), 0);
    s = infinity.applyMove(s, 8); // P1 places 4th → 0 vanishes; now P2 to move with 3 marks
    assert.equal(nextToVanish(s), 1);
  });

  test('win is evaluated after the vanish, and draws are impossible', () => {
    // P1 marks 0,1 then 3(?) — build: P1 0, P2 4, P1 1, P2 5, P1 6, P2 8, P1 2 → P1 would have 0,1,2 but 0 vanishes first.
    const s = replay('infinity', [0, 4, 1, 5, 6, 8, 2]);
    assert.equal(s.board[0], null);
    assert.equal(s.status, 'playing', 'no win because the oldest mark vanished before the line completed');
    assert.equal(infinity.getOutcome(s).type, 'ongoing');
    // Now a real win: P2 has 4,5,8; P1 (1,6,2) plays 7 → 1 vanishes; P2 plays 3 → 4 vanishes... make P2 win with 3,4,5:
    const w = replay('infinity', [0, 3, 1, 4, 6, 5]);
    assert.equal(w.status, 'over');
    assert.equal(w.winner, P2);
    assert.deepEqual(w.line, [3, 4, 5]);
  });

  test('undo restores the vanished mark', () => {
    const s = replay('infinity', [0, 1, 2, 3, 6, 5, 8]);
    const u = undoMove(s);
    assert.equal(u.board[0], P1);
    assert.equal(u.board[8], null);
    assert.deepEqual(u.meta.queues[1], [0, 2, 6]);
  });
});

describe('rules.js — blitz & registry', () => {
  test('blitz uses classic rules with a validated timer', () => {
    assert.equal(blitz.init().meta.timerSeconds, 5);
    assert.equal(blitz.init({ timerSeconds: 3 }).meta.timerSeconds, 3);
    assert.equal(blitz.init({ timerSeconds: 7 }).meta.timerSeconds, 5);
    assert.equal(blitz.supports.undo, false);
    const s = replay('blitz', [0, 3, 1, 4, 2], { timerSeconds: 10 });
    assert.equal(s.winner, P1);
    assert.equal(s.meta.timerSeconds, 10);
  });

  test('registry exposes four variants with the full strategy API', () => {
    assert.deepEqual(Object.keys(VARIANTS), ['classic', 'infinity', 'blitz', 'misere']);
    for (const v of Object.values(VARIANTS)) {
      for (const k of ['id', 'name', 'description', 'supports', 'init', 'canMove', 'applyMove', 'getOutcome']) {
        assert.ok(k in v, `${v.id} missing ${k}`);
      }
    }
    assert.equal(getVariant('nope').id, 'classic');
  });
});
