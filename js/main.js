// main.js — bootstrap: wires modules together and starts the app
import { initScreens, show, currentScreen, isModalOpen, openModal, confirm as confirmDialog } from './ui/screens.js';
import { initTheme, toggleTheme, setTheme, setAccent, getThemeMode, getResolvedTheme, onThemeChange } from './ui/theme.js';
import { initCursor, setCursorEnabled, setTrailEnabled, isCursorActive, cursorStats } from './ui/cursor.js';
import * as audio from './ui/audio.js';
import { buildResultText, shareText, pageUrl } from './features/share.js';
import { STATS_KEY, normalizeStats, recordGame, addTime, statsKey } from './features/stats.js';
import { UNLOCKS_KEY, normalizeUnlocks, evaluate as evaluateAchievements, getAchievement } from './features/achievements.js';
import { initKonami, isTypingTarget } from './features/shortcuts.js';
import { renderSettings, renderStats, renderBadges } from './ui/panels.js';
import { evaluateCursor } from './ui/cursor.js';
import { initPwa, applyUpdate } from './pwa.js';

/**
 * Decorative effects are loaded lazily; if the module fails to load the game still runs.
 * Every method starts as a no-op and is replaced once effects.js arrives.
 */
const effects = {
  loaded: false,
  initBackground() {}, initInteractions() {}, applyScanlines() {}, refreshBackgroundColors() {},
  setBackgroundEnabled() {}, setBackgroundStyle() {}, celebrate() {}, drawRipple() {}, edgeGlow() {},
  isBackgroundRunning() { return false; }, backgroundStats() { return { nodes: 0, running: false, enabled: false }; },
  startBackground() {}, stopBackground() {},
};
import * as storage from './state/storage.js';
import { createStore, createInitialState } from './state/store.js';
import { getVariant, undoMove, nextToVanish } from './engine/rules.js';
import { legalMoves, toRC, nextPlayer } from './engine/board.js';
import { chooseMove, bestMoves } from './engine/ai.js';
import {
  initBoard, renderBoard, clearBoard, drawWinLine, clearWinLine, shakeCell, pulseCell, setSymbolPack, clearGhosts, focusCell, relayoutWinLine,
} from './ui/render.js';
import { renderHud, setTurnText, announce, toast, consoleLog, showResult, hideResult, isResultOpen, timer } from './ui/hud.js';

export const APP_VERSION = '1.1.0';

const DEBUG = new URLSearchParams(location.search).get('debug') === '1';
/** Debug logger, silent unless ?debug=1 is present. */
const debug = (...args) => { if (DEBUG) console.info('[ttt]', ...args); };

const $ = (id) => document.getElementById(id);
const store = createStore(createInitialState(storage.get('ttt.settings', {})));

/** Persistent progress (validated on load). */
let stats = normalizeStats(storage.get(STATS_KEY, null));
let unlocks = normalizeUnlocks(storage.get(UNLOCKS_KEY, null));
/** Human move timestamps for the Speedrun badge. */
let humanMoveDurations = [];
let turnStartedAt = 0;

/** Sound + haptics (Web Audio synth, no files). */
const sfx = { play: (name, player) => audio.play(name, player), haptic: (kind) => audio.haptic(kind) };

/**
 * Persist settings (`ttt.settings` is the source of truth; `ttt.sound` / `ttt.haptics` are mirrored).
 * @param {object} partial
 */
function saveSettings(partial) {
  const next = { ...store.getState().settings, ...partial };
  store.setState({ settings: next });
  storage.set('ttt.settings', next);
  if ('sound' in partial) storage.set('ttt.sound', next.sound);
  if ('haptics' in partial) storage.set('ttt.haptics', next.haptics);
  return next;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const BOT_NAME = 'BOT.exe';
const MODE_LABEL = { bot: 'vs BOT.exe', local: 'local 2p' };

/** Display names for players 1 and 2 under the active config. */
function names() {
  const { config, settings } = store.getState();
  if (config && config.mode === 'bot') return { 1: settings.names.user, 2: BOT_NAME };
  return { 1: settings.names[1], 2: settings.names[2] };
}

/** True when the player to move is controlled from this device. */
function isHumanTurn(game) {
  const { config } = store.getState();
  if (!game) return false;
  if (config && config.mode === 'bot') return game.current === 1;
  return true;
}

/** Viewport center of the board (origin for confetti / ripples). */
function boardCenter() {
  const b = $('board');
  if (!b) return {};
  const r = b.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** "(r,c)" zero-based, matching the console-log microcopy. */
function rc(index) {
  const { row, col } = toRC(index);
  return `(${row},${col})`;
}

function turnText(game) {
  const n = names();
  if (game.status !== 'playing') return '';
  if (!isHumanTurn(game)) return `> ${BOT_NAME} computing…`;
  const suffix = game.variant === 'misere' ? ' (avoid 3-in-a-row)' : '';
  return `> ${n[game.current]} turn${suffix}`;
}

function viewOpts(game, extra = {}) {
  const { settings, ui } = store.getState();
  return {
    names: names(),
    pack: settings.symbols,
    vanishing: nextToVanish(game),
    locked: !isHumanTurn(game) || ui.animating || ui.botThinking,
    ...extra,
  };
}

function hudView(game, extraStatus) {
  const { session } = store.getState();
  return {
    names: names(),
    scores: session.scores,
    current: game.current,
    variant: game.variant,
    status: extraStatus || game.status,
    turnText: turnText(game),
    timer: game.variant === 'blitz',
  };
}

function canUndo() {
  const { game, config, ui } = store.getState();
  if (!game || !config || game.status !== 'playing') return false;
  if (!getVariant(game.variant).supports.undo) return false;
  if (ui.botThinking || ui.animating) return false;
  if (config.mode === 'bot') return game.history.length >= 1 && isHumanTurn(game);
  return game.history.length >= 1;
}

function canHint() {
  const { game, config, ui } = store.getState();
  if (!game || !config || game.status !== 'playing') return false;
  if (config.mode !== 'bot' || config.difficulty === 'hard') return false;
  if (!getVariant(game.variant).supports.hint) return false;
  return isHumanTurn(game) && !ui.botThinking && !ui.animating;
}

function hint() {
  if (!canHint()) return;
  const { game } = store.getState();
  const best = bestMoves(game, game.variant);
  if (best.length === 0) return;
  const index = best[Math.floor(Math.random() * best.length)];
  pulseCell(index);
  focusCell(index);
  audio.play('hint');
  consoleLog.line(`> hint: cell ${rc(index)}`, 'sys');
  announce(`Hint: row ${toRC(index).row + 1}, column ${toRC(index).col + 1}.`);
}

function updateActionButtons() {
  const undoBtn = $('btn-undo');
  const hintBtn = $('btn-hint');
  if (undoBtn) undoBtn.disabled = !canUndo();
  if (hintBtn) hintBtn.disabled = !canHint();
}

/* ------------------------------------------------------------------ */
/* Game flow                                                           */
/* ------------------------------------------------------------------ */

/**
 * Decide who starts: settings for the first bot game, then loser-starts / alternate.
 * @param {object} config
 * @param {object} session
 * @param {object} settings
 * @returns {number}
 */
function pickStarter(config, session, settings) {
  if (config.mode === 'bot') {
    switch (settings.firstMove) {
      case 'bot': return 2;
      case 'random': return Math.random() < 0.5 ? 1 : 2;
      case 'alternate': return session.lastStarter ? nextPlayer(session.lastStarter) : 1;
      default: return 1;
    }
  }
  if (session.lastLoser) return session.lastLoser;
  if (session.lastStarter) return nextPlayer(session.lastStarter);
  return 1;
}

/**
 * Start a new game with the given config (mode, variant, difficulty).
 * @param {{ mode: string, variant: string, difficulty: string }} config
 */
function startGame(config) {
  const s = store.getState();
  const variant = getVariant(config.variant);
  const key = `${config.mode}:${config.variant}:${config.difficulty}`;
  let session = s.session.key === key ? s.session : { scores: { 1: 0, 2: 0 }, draws: 0, lastStarter: null, lastLoser: null, key };
  const startedBy = pickStarter(config, session, s.settings);
  const game = variant.init({ startedBy, timerSeconds: s.settings.blitzSeconds });
  session = { ...session, lastStarter: startedBy };
  botToken++;
  humanMoveDurations = [];
  timer.hide();
  hideResult();
  store.setState({ game, config, session, screen: 'game', ui: { ...s.ui, botThinking: false, animating: false, resultOpen: false } });
  setSymbolPack(s.settings.symbols);
  clearBoard(names());
  consoleLog.reset();
  consoleLog.line(`> session started · ${variant.name.toLowerCase()} · ${MODE_LABEL[config.mode] || config.mode}`, 'sys');
  if (currentScreen() !== 'game') show('game');
  renderBoard(game, viewOpts(game));
  renderHud(hudView(game));
  updateActionButtons();
  announce(`New ${variant.name} game. ${names()[game.current]} starts.`);
  // Blitz: let the board entry animation finish before the first countdown starts.
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'reduced';
  if (config.variant === 'blitz' && !reduced) {
    const token = botToken;
    setTimeout(() => { if (token === botToken && store.getState().game === game) afterTurnStart(); }, 450);
  } else {
    afterTurnStart();
  }
}

/** Called whenever a new turn begins (after a move, undo, or start). */
function afterTurnStart() {
  const { game } = store.getState();
  if (!game || game.status !== 'playing') return;
  renderHud(hudView(game));
  updateActionButtons();
  if (game.variant === 'blitz') {
    timer.start(game.meta.timerSeconds, {
      onTick: (left) => { if (left > 0 && left <= 3) sfx.play('tick'); },
      onTimeout: handleTimeout,
    });
  }
  turnStartedAt = performance.now();
  if (!isHumanTurn(game)) botTurn();
}

/* ------------------------------------------------------------------ */
/* Progress: stats, achievements, time played                          */
/* ------------------------------------------------------------------ */

function persistProgress() {
  storage.set(STATS_KEY, stats);
  storage.set(UNLOCKS_KEY, unlocks);
}

/**
 * Fire an achievement event, toast + sound for anything newly unlocked.
 * @param {string} event
 * @param {object} [ctx]
 */
function achieve(event, ctx = {}) {
  const res = evaluateAchievements(unlocks, event, ctx);
  unlocks = res.unlocks;
  if (res.newly.length) {
    persistProgress();
    res.newly.forEach((id, i) => {
      const a = getAchievement(id);
      if (!a) return;
      setTimeout(() => {
        toast(`${a.icon} ${a.title} — unlocked`, { type: 'ok', duration: 3200 });
        audio.play('achievement');
        audio.haptic('achievement');
        consoleLog.line(`> badge unlocked: ${a.title}`, 'ok');
      }, 900 + i * 700);
    });
  }
  return res.newly;
}

/**
 * Record a finished game into stats + achievements.
 * @param {object} game finished engine state
 */
function recordProgress(game) {
  const { config } = store.getState();
  if (!config) return;
  const o = game.outcome;
  let result = 'draw';
  if (o.type === 'win') result = o.player === 1 ? 'win' : 'loss';
  stats = recordGame(stats, { key: statsKey(config), result, countsForStreak: config.mode === 'bot' });
  const blitzFast = game.variant === 'blitz' && humanMoveDurations.length > 0 && humanMoveDurations.every((ms) => ms < 2000);
  achieve('game_over', { mode: config.mode, variant: game.variant, difficulty: config.difficulty, result, streak: stats.streak.current, blitzFast });
  persistProgress();
}

let timeTick = 0;
let timeAccum = 0;
function startTimeTracking() {
  if (timeTick) return;
  let last = performance.now();
  timeTick = window.setInterval(() => {
    const now = performance.now();
    const dt = now - last;
    last = now;
    if (document.hidden || currentScreen() !== 'game') return;
    timeAccum += dt;
    if (timeAccum >= 10000) { stats = addTime(stats, timeAccum); timeAccum = 0; storage.set(STATS_KEY, stats); }
  }, 1000);
}
function flushTime() {
  if (timeAccum > 0) { stats = addTime(stats, timeAccum); timeAccum = 0; storage.set(STATS_KEY, stats); }
}

/** Incremented to cancel a pending bot move (menu, reboot, undo). */
let botToken = 0;

/** BOT.exe's turn: lock input, show the thinking indicator, then commit after a human-like delay. */
function botTurn() {
  const { game, config } = store.getState();
  const token = ++botToken;
  store.setState((s) => ({ ui: { ...s.ui, botThinking: true } }));
  renderHud(hudView(game));
  renderBoard(game, viewOpts(game));
  updateActionButtons();
  const t0 = performance.now();
  const index = chooseMove(game, game.variant, config.difficulty);
  debug('bot move', index, `${(performance.now() - t0).toFixed(1)}ms`);
  const delay = 350 + Math.random() * 550;
  setTimeout(() => {
    if (token !== botToken) return;
    const s = store.getState();
    if (!s.game || s.game !== game || s.game.status !== 'playing' || currentScreen() !== 'game') return;
    store.setState((st) => ({ ui: { ...st.ui, botThinking: false } }));
    commitMove(index);
  }, delay);
}

/**
 * Human selection from click / keyboard.
 * @param {number} index
 */
function select(index) {
  const { game, ui } = store.getState();
  if (!game || game.status !== 'playing' || ui.animating || ui.botThinking || !isHumanTurn(game) || isModalOpen() || isResultOpen()) return;
  const variant = getVariant(game.variant);
  if (!variant.canMove(game, index)) {
    if (game.board[index] !== null) {
      shakeCell(index);
      toast('ERR_CELL_OCCUPIED', { type: 'error', duration: 1400 });
      consoleLog.line('> ERR_CELL_OCCUPIED', 'err');
      sfx.play('error');
      sfx.haptic('error');
    }
    return;
  }
  commitMove(index);
}

/**
 * Apply a legal move for the current player (human, bot, or timeout) and advance.
 * @param {number} index
 */
function commitMove(index) {
  const { game } = store.getState();
  const variant = getVariant(game.variant);
  const player = game.current;
  if (isHumanTurn(game) && turnStartedAt) humanMoveDurations.push(performance.now() - turnStartedAt);
  const next = variant.applyMove(game, index);
  timer.stop();
  clearGhosts();
  store.setState({ game: next });
  const last = next.history[next.history.length - 1];
  consoleLog.line(`> ${names()[player]} placed at ${rc(index)}`, `p${player}`);
  if (last.removed !== null) consoleLog.line(`> mark at ${rc(last.removed)} garbage-collected`, 'sys');
  sfx.play('place', player);
  sfx.haptic('place');
  const { row, col } = toRC(index);
  const done = renderBoard(next, viewOpts(next));
  if (next.status === 'over') {
    store.setState((s) => ({ ui: { ...s.ui, animating: true } }));
    updateActionButtons();
    announce(`${names()[player]} placed at row ${row + 1} column ${col + 1}.`);
    done.then(() => gameOver(next));
  } else {
    announce(`${names()[player]} placed at row ${row + 1} column ${col + 1}. ${names()[next.current]}'s turn.`);
    done.then(afterTurnStart);
  }
}

/**
 * Finish the game: score, win line, overlay.
 * @param {object} game finished engine state
 */
function gameOver(game) {
  const { config, session } = store.getState();
  const o = game.outcome;
  const n = names();
  const next = { ...session, scores: { ...session.scores } };
  let status; let title; let sub = ''; let tone = 'ok';
  if (o.type === 'draw') {
    next.draws += 1;
    next.lastLoser = null;
    status = 'process exited with code 0';
    title = 'draw';
    tone = 'draw';
    consoleLog.line('> process exited with code 0 (draw)', 'sys');
    sfx.play('draw');
    effects.drawRipple(boardCenter());
  } else {
    next.scores[o.player] += 1;
    next.lastLoser = nextPlayer(o.player);
    const botWon = config.mode === 'bot' && o.player === 2;
    status = botWon ? 'RUNTIME ERROR ✖' : 'BUILD SUCCESSFUL ✔';
    title = `${n[o.player]} wins`;
    tone = botWon ? 'err' : 'ok';
    if (o.loser) sub = `${n[o.loser]} completed a line → ${n[o.player]} wins`;
    consoleLog.line(`> ${botWon ? 'RUNTIME ERROR' : 'BUILD SUCCESSFUL'}: ${title}`, botWon ? 'err' : 'ok');
    renderBoard(game, viewOpts(game, { winnerLine: o.line, lineDanger: !!o.loser, locked: true }));
    drawWinLine(o.line, o.player, !!o.loser);
    sfx.play(botWon ? 'lose' : 'win');
    sfx.haptic('win');
    const winColor = getComputedStyle(document.documentElement).getPropertyValue(`--p${o.player}`).trim();
    if (!botWon) {
      effects.celebrate([winColor, getComputedStyle(document.documentElement).getPropertyValue('--ok').trim(), getComputedStyle(document.documentElement).getPropertyValue('--violet').trim()], boardCenter());
    }
    effects.edgeGlow(botWon ? getComputedStyle(document.documentElement).getPropertyValue('--danger').trim() : winColor);
  }
  store.setState({ session: next });
  flushTime();
  recordProgress(game);
  renderHud(hudView(game));
  setTurnText(o.type === 'draw' ? '> draw' : `> ${title}`, false);
  announce(`${status}. ${title}. ${sub}`.trim());
  updateActionButtons();
  const delay = o.type === 'win' ? 700 : 320;
  setTimeout(() => {
    store.setState((s) => ({ ui: { ...s.ui, animating: false, resultOpen: true } }));
    showResult({ status, title, sub, tone });
  }, delay);
}

/** Blitz: time ran out for the current player — auto-commit a random legal cell. */
function handleTimeout() {
  const { game, ui } = store.getState();
  if (!game || game.status !== 'playing' || ui.animating) return;
  const moves = legalMoves(game.board);
  if (moves.length === 0) return;
  const index = moves[Math.floor(Math.random() * moves.length)];
  const { row, col } = toRC(index);
  consoleLog.line(`> TIMEOUT → auto-commit ${rc(index)}`, 'err');
  toast(`TIMEOUT → auto-commit (cell ${row},${col})`, { type: 'error' });
  sfx.play('error');
  store.setState((s) => ({ ui: { ...s.ui, botThinking: false } }));
  commitMove(index);
}

/** Share the finished game's result (Web Share → clipboard → selectable fallback). */
async function shareResult() {
  const { game, config } = store.getState();
  if (!game || game.status !== 'over' || !game.outcome || !config) return;
  const url = pageUrl();
  const text = buildResultText({ outcome: game.outcome, mode: config.mode, difficulty: config.difficulty, variant: game.variant, names: names() }, url);
  const fallback = $('share-fallback');
  const area = /** @type {HTMLTextAreaElement | null} */ ($('share-fallback-text'));
  if (fallback) fallback.hidden = true;
  const method = await shareText(text, { title: 'TicTacTech' });
  debug('share', method);
  if (method === 'clipboard') toast('copied to clipboard', { type: 'ok' });
  else if (method === 'share') toast('shared ✔', { type: 'ok' });
  else if (method === 'fallback' && fallback && area) {
    area.value = text;
    fallback.hidden = false;
    area.focus();
    area.select();
  }
}

function undo() {
  if (!canUndo()) return;
  const { game, config } = store.getState();
  const count = config.mode === 'bot' && game.history.length >= 2 ? 2 : 1;
  const prev = undoMove(game, count);
  timer.stop();
  clearWinLine();
  store.setState({ game: prev });
  renderBoard(prev, viewOpts(prev, { instant: true }));
  consoleLog.line(`> undo (${count} move${count > 1 ? 's' : ''})`, 'sys');
  announce(`Undo. ${names()[prev.current]}'s turn.`);
  afterTurnStart();
}

function reboot() {
  const { config } = store.getState();
  if (!config) return;
  consoleLog.line('> reboot', 'sys');
  startGame(config);
}

async function leaveToMenu() {
  const { game } = store.getState();
  if (game && game.status === 'playing' && game.moveCount > 0) {
    const ok = await confirmDialog({ title: 'abort session?', text: 'The current game will be lost.', yes: 'Yes, abort' });
    if (!ok) return;
  }
  botToken++;
  timer.hide();
  hideResult();
  store.setState((s) => ({ screen: 'menu', game: null, ui: { ...s.ui, botThinking: false, animating: false, resultOpen: false } }));
  show('menu');
}

/* ------------------------------------------------------------------ */
/* Wiring                                                              */
/* ------------------------------------------------------------------ */

/** Temporary variant descriptions come from the rules engine. */
function wireMenu() {
  const cards = document.querySelectorAll('.mode-card');
  const difficulty = $('difficulty-group');
  const desc = $('variant-desc');
  const syncDesc = () => { const { menu } = store.getState(); if (desc) desc.textContent = getVariant(menu.variant).description; };

  cards.forEach((card) => {
    card.addEventListener('click', () => {
      cards.forEach((c) => c.setAttribute('aria-pressed', String(c === card)));
      const mode = card.dataset.mode || 'bot';
      store.setState((s) => ({ menu: { ...s.menu, mode } }));
      if (difficulty) difficulty.hidden = mode !== 'bot';
      audio.play('toggle');
    });
  });

  document.querySelectorAll('input[name="variant"]').forEach((input) => {
    input.addEventListener('change', () => {
      store.setState((s) => ({ menu: { ...s.menu, variant: /** @type {HTMLInputElement} */ (input).value } }));
      syncDesc();
    });
  });

  document.querySelectorAll('input[name="difficulty"]').forEach((input) => {
    input.addEventListener('change', () => {
      store.setState((s) => ({ menu: { ...s.menu, difficulty: /** @type {HTMLInputElement} */ (input).value } }));
    });
  });

  $('btn-run')?.addEventListener('click', () => {
    const { menu } = store.getState();
    startGame({ mode: menu.mode, variant: menu.variant, difficulty: menu.difficulty });
  });
  syncDesc();
}

function wireGame() {
  initBoard({
    onSelect: select,
    canGhost: () => {
      const { game, ui } = store.getState();
      if (!game || game.status !== 'playing' || ui.animating || ui.botThinking || !isHumanTurn(game) || isResultOpen()) return null;
      return game.current;
    },
  });
  $('btn-undo')?.addEventListener('click', undo);
  $('btn-hint')?.addEventListener('click', hint);
  $('btn-reboot')?.addEventListener('click', reboot);
  $('btn-again')?.addEventListener('click', reboot);
  $('btn-menu')?.addEventListener('click', leaveToMenu);
  $('btn-result-menu')?.addEventListener('click', leaveToMenu);
  $('btn-share')?.addEventListener('click', shareResult);

  const consoleBtn = $('btn-console');
  consoleBtn?.addEventListener('click', () => consoleLog.setOpen(!consoleLog.isOpen()));
  $('btn-console-clear')?.addEventListener('click', () => consoleLog.clear());
  consoleLog.setOpen(window.matchMedia('(min-width: 1024px) and (min-height: 501px)').matches);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) timer.pause(); else timer.resume();
  });

  let resizeT = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeT);
    resizeT = window.setTimeout(() => {
      const { game } = store.getState();
      if (game && game.status === 'over' && game.outcome && game.outcome.type === 'win') {
        relayoutWinLine(game.line, game.winner, !!game.outcome.loser);
      }
    }, 150);
  });
}

function wireKeyboard() {
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (isTypingTarget(e.target)) return;
    if (isModalOpen()) return; // dialogs handle Escape themselves
    const key = e.key;
    if (key === 'Escape') {
      if (isResultOpen()) { hideResult(); store.setState((s) => ({ ui: { ...s.ui, resultOpen: false } })); focusCell(0); e.preventDefault(); }
      return;
    }
    if (key === '?') { e.preventDefault(); openModal('modal-shortcuts', $('btn-help')); return; }
    const lower = key.toLowerCase();
    if (lower === 't') { userToggleTheme(); return; }
    if (lower === 'm') { toggleSound(); return; }
    if (currentScreen() !== 'game') return;
    if (/^[1-9]$/.test(key)) { const idx = Number(key) - 1; focusCell(idx); select(idx); e.preventDefault(); return; }
    if (lower === 'r') { reboot(); return; }
    if (lower === 'u') { undo(); return; }
    if (lower === 'h') { hint(); return; }
    if (lower === 'c') { consoleLog.setOpen(!consoleLog.isOpen()); return; }
    if (lower === 'n') { const { game } = store.getState(); if (game && game.status === 'over') reboot(); }
  });
}

function syncSoundButton() {
  const soundBtn = $('btn-sound');
  if (!soundBtn) return;
  const on = store.getState().settings.sound !== false;
  soundBtn.setAttribute('aria-pressed', String(on));
  soundBtn.setAttribute('aria-label', on ? 'Mute sound' : 'Unmute sound');
}

function toggleSound() {
  const on = !(store.getState().settings.sound !== false);
  saveSettings({ sound: on });
  audio.setSoundEnabled(on);
  syncSoundButton();
  if (on) audio.play('toggle');
  toast(`sound ${on ? 'on' : 'off'}`, { duration: 1200 });
}

function wireToolbar() {
  $('btn-theme')?.addEventListener('click', () => userToggleTheme());
  $('btn-sound')?.addEventListener('click', toggleSound);
  syncSoundButton();
}

/** Theme toggle initiated by the user (toolbar / T key) — the only path that grants Night Owl. */
function userToggleTheme() {
  const next = toggleTheme();
  saveSettings({ theme: next });
  audio.play('toggle');
  toast(`theme: ${next}`, { duration: 1200 });
  if (next === 'dark') achieve('theme_dark');
}

/* ------------------------------------------------------------------ */
/* Settings / Stats / Badges panels                                    */
/* ------------------------------------------------------------------ */

/**
 * Apply one setting live and persist it.
 * @param {string} key dotted path (e.g. "names.user")
 * @param {any} value
 */
function applySetting(key, value) {
  const s = store.getState().settings;
  if (key.startsWith('names.')) {
    const which = key.slice(6);
    const clean = String(value).trim().slice(0, 12) || s.names[which];
    saveSettings({ names: { ...s.names, [which]: clean } });
    const { game } = store.getState();
    if (game) { renderHud(hudView(game)); renderBoard(game, viewOpts(game, { repaint: true, noAnimate: true })); }
    return;
  }
  saveSettings({ [key]: value });
  const { game } = store.getState();
  switch (key) {
    case 'theme': setTheme(value); if (getResolvedTheme() === 'dark') achieve('theme_dark'); break;
    case 'accent': setAccent(value); break;
    case 'symbols': setSymbolPack(value); if (game) renderBoard(game, viewOpts(game, { repaint: true, noAnimate: true })); break;
    case 'sound': audio.setSoundEnabled(value); syncSoundButton(); break;
    case 'haptics': audio.setHapticsEnabled(value); break;
    case 'cursor': setCursorEnabled(value); break;
    case 'cursorTrail': setTrailEnabled(value); break;
    case 'background': effects.setBackgroundEnabled(value); break;
    case 'backgroundStyle': effects.setBackgroundStyle(value); break;
    case 'scanlines': effects.applyScanlines(value, getResolvedTheme()); break;
    case 'reducedMotion':
      document.documentElement.toggleAttribute('data-motion', false);
      if (value) document.documentElement.setAttribute('data-motion', 'reduced');
      evaluateCursor();
      if (value) effects.stopBackground(); else effects.startBackground();
      effects.applyScanlines(store.getState().settings.scanlines, getResolvedTheme());
      break;
    default: break;
  }
  debug('setting', key, value);
}

function resetAllData() {
  storage.clearAll();
  stats = normalizeStats(null);
  unlocks = normalizeUnlocks(null);
  const fresh = createInitialState({}).settings;
  store.setState({ settings: fresh });
  storage.set('ttt.settings', fresh);
  setTheme('system'); setAccent('neon'); setSymbolPack('code');
  audio.setSoundEnabled(true); audio.setHapticsEnabled(true); syncSoundButton();
  setCursorEnabled(true); setTrailEnabled(false);
  effects.setBackgroundEnabled(true); effects.setBackgroundStyle('network');
  document.documentElement.removeAttribute('data-motion');
  effects.applyScanlines('auto', getResolvedTheme());
  openSettings();
  toast('all data reset', { type: 'ok' });
  consoleLog.line('> rm -rf ./data — reset complete', 'sys');
}

function openSettings() {
  const host = $('settings-body');
  if (!host) return;
  renderSettings(host, store.getState().settings, { matrix: unlocks.matrix }, { onChange: applySetting, onReset: resetAllData });
}

function wirePanels() {
  $('btn-settings')?.addEventListener('click', openSettings);
  $('btn-stats')?.addEventListener('click', () => { flushTime(); const host = $('stats-body'); if (host) renderStats(host, stats); });
  $('btn-badges')?.addEventListener('click', () => { const host = $('badges-body'); if (host) renderBadges(host, unlocks); });
  initKonami({
    logo: $('logo'),
    onTrigger: () => {
      const first = !unlocks.matrix;
      achieve('konami');
      persistProgress();
      if (first) { toast('🕹️ Matrix accent + digital rain unlocked (see Config)', { type: 'ok', duration: 4000 }); }
      applySetting('accent', 'matrix');
      applySetting('backgroundStyle', 'rain');
      openSettings();
      if (!isModalOpen()) openModal('modal-settings', $('btn-settings'));
    },
  });
  startTimeTracking();
  window.addEventListener('pagehide', flushTime);
  document.addEventListener('visibilitychange', () => { if (document.hidden) flushTime(); });
}

function wirePwa() {
  const installBtn = $('btn-install');
  initPwa({
    onUpdate: (worker) => {
      toast('update available — reload', { duration: 0, action: { label: 'reload', onClick: () => applyUpdate(worker) } });
      consoleLog.line('> update available: new build cached', 'sys');
    },
    onInstallable: (prompt) => {
      if (!installBtn) return;
      installBtn.hidden = false;
      installBtn.onclick = async () => {
        const choice = await prompt();
        if (choice && choice.outcome === 'accepted') installBtn.hidden = true;
      };
    },
    onInstalled: () => { if (installBtn) installBtn.hidden = true; toast('installed ✔', { type: 'ok' }); },
    onRegistered: (reg) => debug('sw registered', reg.scope),
  });
}

/** Apply persisted settings that only take effect through their modules. */
function applyStoredSettingsOnBoot() {
  const s = store.getState().settings;
  if (s.reducedMotion) document.documentElement.setAttribute('data-motion', 'reduced');
  setSymbolPack(s.symbols);
}

function wireEffects() {
  import('./ui/effects.js').then((mod) => {
    Object.assign(effects, mod, { loaded: true });
    const { settings } = store.getState();
    effects.initBackground(/** @type {HTMLCanvasElement | null} */ ($('bg-canvas')), { enabled: settings.background !== false, style: settings.backgroundStyle });
    effects.initInteractions();
    effects.applyScanlines(settings.scanlines, getResolvedTheme());
    onThemeChange(({ resolved }) => {
      effects.refreshBackgroundColors();
      effects.applyScanlines(store.getState().settings.scanlines, resolved);
    });
  }).catch((err) => debug('effects unavailable', err));
}

function boot() {
  const version = $('app-version');
  if (version) version.textContent = `v${APP_VERSION}`;
  storage.ensureVersion();
  initTheme();
  initScreens();
  {
    // Mirrored keys win if present (spec: ttt.sound / ttt.haptics persist independently).
    const s = store.getState().settings;
    const sound = storage.get('ttt.sound', s.sound);
    const haptics = storage.get('ttt.haptics', s.haptics);
    store.setState({ settings: { ...s, sound: sound !== false, haptics: haptics !== false } });
    audio.initAudio({ sound: sound !== false, haptics: haptics !== false });
  }
  applyStoredSettingsOnBoot();
  wireToolbar();
  wireMenu();
  wireGame();
  wireKeyboard();
  wireEffects();
  wirePanels();
  wirePwa();
  initCursor({ enabled: store.getState().settings.cursor !== false, trail: !!store.getState().settings.cursorTrail });
  show('menu');
  if (DEBUG) {
    window.__TTT = {
      version: APP_VERSION, store, select, undo, hint, reboot, startGame, leaveToMenu, currentScreen, isModalOpen,
      setTheme, setAccent, getThemeMode, getResolvedTheme, storage, timer, chooseMove, bestMoves, effects,
      cursor: { setCursorEnabled, setTrailEnabled, isCursorActive, cursorStats },
      audio, shareResult, saveSettings, applySetting, resetAllData, openSettings,
      getStats: () => stats, getUnlocks: () => unlocks, achieve,
    };
  }
  debug('booted', APP_VERSION);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
