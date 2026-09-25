// tests/ai.test.mjs — node:test suite for AI behaviours incl. exhaustive "hard never loses"
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { legalMoves, nextPlayer } from '../js/engine/board.js';
import { getVariant } from '../js/engine/rules.js';
import { chooseMove, bestMoves, winningMoves, blockingMoves, losingMoves, clearCache } from '../js/engine/ai.js';

/** Deterministic PRNG (mulberry32). */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Exhaustively play every opponent line against EVERY tied-best AI reply.
 * Returns { leaves, losses }.
 */
function exhaust(variantId, aiPlayer) {
  const variant = getVariant(variantId);
  let leaves = 0;
  let losses = 0;
  const walk = (state) => {
    if (state.status === 'over') {
      leaves++;
      if (state.outcome.type === 'win' && state.outcome.player !== aiPlayer) losses++;
      return;
    }
    const moves = state.current === aiPlayer ? bestMoves(state, variantId) : legalMoves(state.board);
    for (const m of moves) walk(variant.applyMove(state, m));
  };
  walk(variant.init({ startedBy: aiPlayer === 1 ? 1 : 2 }));
  return { leaves, losses };
}

/** Random ongoing position reached by a random playout of `plies` moves. */
function randomPosition(variantId, rng, maxPlies = 6) {
  const variant = getVariant(variantId);
  let s = variant.init({});
  const plies = Math.floor(rng() * maxPlies);
  for (let i = 0; i < plies && s.status === 'playing'; i++) {
    const legal = legalMoves(s.board);
    s = variant.applyMove(s, legal[Math.floor(rng() * legal.length)]);
  }
  return s;
}

describe('hard is unbeatable (exhaustive over every opponent line)', () => {
  for (const variantId of ['classic', 'misere']) {
    for (const aiPlayer of [1, 2]) {
      test(`${variantId}: AI as player ${aiPlayer} (${aiPlayer === 1 ? 'moves first' : 'moves second'}) never loses`, () => {
        clearCache();
        const t0 = performance.now();
        const { leaves, losses } = exhaust(variantId, aiPlayer);
        const ms = performance.now() - t0;
        assert.ok(leaves > 50, `explored ${leaves} terminal games`);
        assert.equal(losses, 0, `${losses} losing lines out of ${leaves}`);
        assert.ok(ms < 5000, `exhaustive search took ${ms.toFixed(0)}ms`);
      });
    }
  }

  test('hard takes an immediate win and blocks an immediate threat', () => {
    const variant = getVariant('classic');
    // P1 threatens 0-1-2; P2 to move must block at 2.
    let s = variant.init({});
    [0, 3, 1].forEach((m) => { s = variant.applyMove(s, m); });
    assert.deepEqual(bestMoves(s, 'classic'), [2]);
    // P1 can win at 2 right now.
    s = variant.applyMove(s, 4);
    assert.deepEqual(bestMoves(s, 'classic'), [2]);
    assert.equal(chooseMove(s, 'classic', 'hard', seeded(1)), 2);
  });

  test('alpha-beta + transposition table matches a plain minimax reference on 300 random positions', () => {
    // Independent, cache-free, prune-free reference.
    const ref = (state, variant, me, depth) => {
      if (state.status === 'over') {
        const o = state.outcome;
        if (!o || o.type === 'draw') return 0;
        return o.player === me ? 10 - depth : depth - 10;
      }
      const scores = legalMoves(state.board).map((m) => ref(variant.applyMove(state, m), variant, me, depth + 1));
      return state.current === me ? Math.max(...scores) : Math.min(...scores);
    };
    const rng = seeded(31337);
    let checked = 0;
    for (const variantId of ['classic', 'misere']) {
      const variant = getVariant(variantId);
      for (let i = 0; i < 150; i++) {
        const s = randomPosition(variantId, rng, 8);
        if (s.status !== 'playing') { i--; continue; }
        const me = s.current;
        const expected = new Map(legalMoves(s.board).map((m) => [m, ref(variant.applyMove(s, m), variant, me, 1)]));
        const top = Math.max(...expected.values());
        const expectedBest = [...expected].filter(([, v]) => v === top).map(([m]) => m).sort();
        assert.deepEqual(bestMoves(s, variantId).sort(), expectedBest, `${variantId} position ${s.board.map((c) => c ?? '.').join('')} (${me} to move)`);
        checked++;
      }
    }
    assert.equal(checked, 300);
  });

  test('blitz uses the classic engine', () => {
    const b = getVariant('blitz').init({ timerSeconds: 3 });
    const c = getVariant('classic').init({});
    assert.deepEqual(bestMoves(b, 'blitz').sort(), bestMoves(c, 'classic').sort());
  });
});

describe('medium', () => {
  test('always takes an immediate win (100 positions)', () => {
    const rng = seeded(42);
    let checked = 0;
    let guard = 0;
    while (checked < 100 && guard++ < 5000) {
      const s = randomPosition('classic', rng, 7);
      if (s.status !== 'playing') continue;
      const wins = winningMoves(s, 'classic');
      if (wins.length === 0) continue;
      const m = chooseMove(s, 'classic', 'medium', seeded(guard));
      assert.ok(wins.includes(m), `expected a winning move from ${wins}, got ${m}`);
      checked++;
    }
    assert.equal(checked, 100);
  });

  test('always blocks an immediate threat when it cannot win (100 positions)', () => {
    const rng = seeded(7);
    let checked = 0;
    let guard = 0;
    while (checked < 100 && guard++ < 8000) {
      const s = randomPosition('classic', rng, 7);
      if (s.status !== 'playing') continue;
      if (winningMoves(s, 'classic').length) continue;
      const blocks = blockingMoves(s, 'classic');
      if (blocks.length === 0) continue;
      const m = chooseMove(s, 'classic', 'medium', seeded(guard));
      assert.ok(blocks.includes(m), `expected a block from ${blocks}, got ${m}`);
      checked++;
    }
    assert.equal(checked, 100);
  });

  test('misère medium avoids completing a line when a safe move exists', () => {
    const variant = getVariant('misere');
    let t = variant.init({});
    [0, 4, 1, 8].forEach((m) => { t = variant.applyMove(t, m); }); // P1: 0,1 ; P2: 4,8 ; P1 to move → cell 2 completes 0-1-2 and LOSES
    const losing = losingMoves(t, 'misere');
    assert.deepEqual(losing, [2]);
    for (let i = 0; i < 40; i++) {
      const m = chooseMove(t, 'misere', 'medium', seeded(100 + i));
      assert.notEqual(m, 2, 'medium must not complete a line in misère while a safe move exists');
    }
  });
});

describe('easy', () => {
  test('always returns a legal move over 500 random positions (all variants)', () => {
    const rng = seeded(99);
    let checked = 0;
    for (const variantId of ['classic', 'infinity', 'misere', 'blitz']) {
      for (let i = 0; i < 125; i++) {
        const s = randomPosition(variantId, rng, 8);
        if (s.status !== 'playing') { i--; continue; }
        const m = chooseMove(s, variantId, 'easy', seeded(i));
        assert.ok(legalMoves(s.board).includes(m), `illegal move ${m}`);
        checked++;
      }
    }
    assert.equal(checked, 500);
  });

  test('easy takes an immediate win roughly 30% of the time', () => {
    const variant = getVariant('classic');
    let s = variant.init({});
    [0, 3, 1, 4].forEach((m) => { s = variant.applyMove(s, m); }); // P1 to move, wins at 2
    let taken = 0;
    const N = 2000;
    const rng = seeded(2024);
    for (let i = 0; i < N; i++) if (chooseMove(s, 'classic', 'easy', rng) === 2) taken++;
    // 30% deliberate + (70% × 1/5 random chance of hitting cell 2) ≈ 44%
    assert.ok(taken / N > 0.35 && taken / N < 0.55, `win rate ${taken / N}`);
  });
});

describe('infinity hard', () => {
  test('never produces an illegal state and wins vs random within 60 moves in ≥ 90% of 50 games', () => {
    const variant = getVariant('infinity');
    const rng = seeded(5);
    let wins = 0;
    let totalMs = 0;
    let moves = 0;
    for (let g = 0; g < 50; g++) {
      clearCache();
      const ai = g % 2 === 0 ? 1 : 2;
      let s = variant.init({ startedBy: 1 });
      let ply = 0;
      while (s.status === 'playing' && ply < 60) {
        let m;
        if (s.current === ai) {
          const t0 = performance.now();
          m = chooseMove(s, 'infinity', 'hard', rng);
          totalMs += performance.now() - t0;
          moves++;
        } else {
          const legal = legalMoves(s.board);
          m = legal[Math.floor(rng() * legal.length)];
        }
        assert.ok(legalMoves(s.board).includes(m));
        s = variant.applyMove(s, m);
        assert.ok(s.board.filter((c) => c === 1).length <= 3 && s.board.filter((c) => c === 2).length <= 3);
        ply++;
      }
      if (s.status === 'over' && s.outcome.player === ai) wins++;
    }
    assert.ok(wins >= 45, `won ${wins}/50`);
    const avg = totalMs / Math.max(1, moves);
    assert.ok(avg < 120, `average hard move ${avg.toFixed(1)}ms`);
  });
});

describe('helpers', () => {
  test('winningMoves / blockingMoves / losingMoves on a known position', () => {
    const variant = getVariant('classic');
    let s = variant.init({});
    [0, 3, 1, 4].forEach((m) => { s = variant.applyMove(s, m); }); // P1 to move
    assert.deepEqual(winningMoves(s, 'classic'), [2]);
    assert.deepEqual(blockingMoves(s, 'classic'), [5]);
    assert.deepEqual(losingMoves(s, 'classic'), []);
    const mis = getVariant('misere');
    let t = mis.init({});
    [0, 3, 1, 4].forEach((m) => { t = mis.applyMove(t, m); });
    assert.deepEqual(losingMoves(t, 'misere'), [2]);
    assert.deepEqual(winningMoves(t, 'misere'), []);
    assert.equal(nextPlayer(t.current), 2);
  });
});
