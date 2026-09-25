// tests/share.test.mjs — node:test suite for result sharing helpers
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildResultText, pageUrl, shareText } from '../js/features/share.js';

describe('share.js', () => {
  test('pageUrl strips the hash and the debug query', () => {
    assert.equal(pageUrl('https://x.github.io/ttt/?debug=1#zzz'), 'https://x.github.io/ttt/');
    assert.equal(pageUrl('https://x.github.io/ttt/?keep=1'), 'https://x.github.io/ttt/?keep=1');
    assert.equal(pageUrl('not a url#frag'), 'not a url');
  });

  test('buildResultText covers bot win / loss / draw and local games', () => {
    const bot = { 1: 'USER', 2: 'BOT.exe' };
    assert.match(buildResultText({ outcome: { type: 'win', player: 1 }, mode: 'bot', difficulty: 'hard', variant: 'classic', names: bot }, 'u'), /^I beat BOT\.exe on HARD in TicTacTech ⚡\nu$/);
    assert.match(buildResultText({ outcome: { type: 'win', player: 2 }, mode: 'bot', difficulty: 'easy', variant: 'misere', names: bot }, 'u'), /BOT\.exe \(EASY\) beat me in TicTacTech \[misere\]/);
    assert.match(buildResultText({ outcome: { type: 'draw' }, mode: 'bot', difficulty: 'medium', variant: 'blitz', names: bot }, 'u'), /I drew with BOT\.exe on MEDIUM/);
    const local = { 1: 'Ann', 2: 'Bob' };
    assert.match(buildResultText({ outcome: { type: 'win', player: 2 }, mode: 'local', variant: 'infinity', names: local }, 'u'), /Bob beat Ann in TicTacTech \[infinity\]/);
    assert.match(buildResultText({ outcome: { type: 'draw' }, mode: 'local', variant: 'classic', names: local }, 'u'), /Ann and Bob drew/);
  });

  test('shareText falls back gracefully without a browser', async () => {
    assert.equal(await shareText('hello'), 'fallback');
  });
});
