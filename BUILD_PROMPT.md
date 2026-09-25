# TicTacTech — Master Build Prompt (Step-by-Step, Zero to Deploy-Ready)

> **How to use this file (read this first):**
>
> 1. Open a fresh coding-model session (Claude Code, Cursor, etc.) inside this folder: `Akshays_Project`.
> 2. Paste **everything below the line "PROMPT STARTS HERE"** as the first message.
> 3. Then send: `Start Step 0.`
> 4. The model builds ONE step and stops with the line `STEP N COMPLETE — READY FOR QC`.
> 5. Open `QC_CHECKLIST.md`, run section **QC-N** (same session or a second session — both work).
> 6. Reply with either `QC PASS STEP N — proceed to Step N+1` or `QC FAIL STEP N` followed by the defect list from the QC report.
> 7. Repeat until Step 15 passes, then run the **Final Release QC** in `QC_CHECKLIST.md`.
> 8. Deploy to GitHub Pages yourself using the instructions the model writes into `README.md` in Step 15.
>
> Companion file: `QC_CHECKLIST.md` (the quality gate for every step).
> Tracking file the model will create: `QC_LOG.md` (one row per step: status, date, defects, fixes).
>
> **Revision 2 (2026-09-26):** the "Link Duel" (play-by-link) mode was removed from the product at the owner's request. Multiplayer means Local 2-Player on one device only. Step 12 now covers modal and cursor robustness (the fixes that came out of manual testing), and the file tree, achievements list and test command reflect the shipped v1.1.0.

---

# PROMPT STARTS HERE

## 1. Role and mission

You are a senior front-end engineer, game developer, and UI/UX designer. You write clean, dependency-free, production-quality web code, and you test everything you build.

Your mission: build **TicTacTech**, a tech-themed, colorful, ultra-smooth, fully responsive Tic-Tac-Toe game that runs as a **100% static site** (plain HTML + CSS + JavaScript, no framework, no build step, no backend, no external runtime dependencies). It will be deployed by the project owner **manually to GitHub Pages** and must work perfectly when the shared link is opened on any laptop or phone.

You will build it **one step at a time** (Steps 0 to 15 below). After each step you STOP and wait for a QC verdict. You never skip ahead, never merge steps, and never declare a step done without running that step's self-checks.

## 2. Hard constraints (non-negotiable — violating any of these fails QC)

1. **Static only.** No server, no backend, no database, no websockets, no WebRTC signaling, no third-party APIs, no analytics, no CDN scripts, no Google Fonts link, no external images. Everything the page needs must live inside this repository. The site must work fully offline after first load.
2. **GitHub Pages compatible.** The site will be served from a sub-path like `https://<user>.github.io/<repo>/`. Therefore every URL in HTML/CSS/JS/manifest/service-worker is **relative** (`./css/base.css`, `./js/main.js`, `./`), never root-absolute (`/css/base.css`). Include an empty `.nojekyll` file at the repo root.
3. **No build tooling.** No npm packages, no bundler, no TypeScript, no Sass, no minifier required. The repo must run by serving the folder as-is. (Node.js is used ONLY for running unit tests and an optional icon-generation script, both with zero dependencies.)
4. **Vanilla stack.** HTML5, modern CSS (custom properties, grid, flex, clamp, media queries), and ES2020+ JavaScript as **ES modules** (`<script type="module">`). No jQuery, no React, no libraries of any kind.
5. **Tech theme is mandatory** in copy, visuals, naming, sounds, and achievements (see Section 4.4). This is not a generic X/O game.
6. **Both mobile and desktop are first-class.** Every screen must be usable and beautiful from 320 px wide phones to 4K desktops, in portrait and landscape, with touch, mouse, and keyboard.
7. **Smoothness.** Animate only `transform` and `opacity` (plus `stroke-dashoffset` on SVG). No layout-thrashing animations. Respect `prefers-reduced-motion`. Pause all `requestAnimationFrame` loops when the tab is hidden.
8. **Dark mode toggle button** with persistence and no flash of wrong theme on load.
9. **Cursor animations** on desktop (fine pointer) that are automatically disabled on touch devices and under reduced motion.
10. **No console errors or warnings** at any time in any step.
11. **Accessibility** is required, not optional: semantic HTML, keyboard playability, ARIA live announcements, visible focus, WCAG AA contrast in both themes.
12. **Multiplayer without a server** means Local 2-Player pass-and-play on one device. Online or link-based remote play is explicitly out of scope; never add it.

## 3. Product specification (what the finished product is)

### 3.1 Name and identity
- Working name: **TicTacTech**. Tagline: `// three in a row, zero dependencies`.
- Visual identity: neon-on-dark "developer terminal meets circuit board". Glassy panels, glowing accents, monospace display text, subtle animated circuit/particle background.
- Players are called **USER_1** and **USER_2** in local play; the computer opponent is **BOT.exe**. The human in bot mode is **USER**.

### 3.2 Play modes (who plays)
| Mode | Description |
|---|---|
| **Vs BOT.exe** | Human vs AI with three difficulty levels: `easy`, `medium`, `hard` (see Section 3.4). |
| **Local 2P** | Two humans on the same device, alternating turns (pass-and-play). |

### 3.3 Game variants (how the board behaves) — all must work in every play mode unless stated
| Variant | Rules |
|---|---|
| **Classic** | Standard 3×3, three in a row wins, full board = draw. |
| **Infinity** | Each player may have at most **3** marks on the board. Placing a 4th removes that player's **oldest** mark. The mark that will vanish next is visually faded and pulsing as a warning. Draws are impossible; play continues until someone wins. |
| **Blitz** | Classic rules plus a per-move countdown (configurable 3 / 5 / 10 seconds, default 5). If time runs out, a random empty cell is auto-played for that player with the message `TIMEOUT → auto-commit`. Undo and hints are disabled in Blitz. |
| **Misère** | Classic board, but making three in a row **loses**. Full board = draw. |
| **Ultimate** *(optional stretch, Step 7, only if all required items pass)* | 9 small boards inside a big board; your move's cell index decides the opponent's next board. Local 2P and easy/medium bot only. |

### 3.4 AI difficulty (must be exactly this behaviour)
- **easy** — Random legal move. Exception: with 30% probability, if an immediate winning move exists, it takes it. Never blocks intentionally. Must be easily beatable.
- **medium** — Deterministic core plus noise: (1) if it can win now, it wins (100%); (2) else if the opponent can win next move, it blocks (100%); (3) else with 70% probability it plays a priority heuristic (center → corners → edges, corners chosen randomly among available), and with 30% probability a random legal move. Beatable by forks, but never loses to a one-move threat.
- **hard** — Perfect play via **minimax with alpha-beta pruning**. Terminal scores: AI win = `10 - depth`, AI loss = `depth - 10`, draw = `0` (prefers fastest win and slowest loss). Ties between equally-scored moves are broken randomly so games feel varied. Hard must **never lose** in Classic and Misère (prove it with an exhaustive test in Step 6). For Infinity, use depth-limited minimax (depth 6) with a heuristic evaluation (open lines count). For Blitz, use the Classic engine.
- All bot moves are delayed by a randomized "thinking" time (350–900 ms) with a visible `BOT.exe computing…` indicator; input is locked while the bot thinks and while animations play.

### 3.5 Side kicks (extra features — all required unless marked optional)
1. **Stats & logs** — per mode + variant + difficulty: played / won / lost / draw, current streak, best streak, total play time. Stored in `localStorage`. "Reset data" with confirmation.
2. **Achievements** — tech-flavoured badges (Appendix C) with toast notification and an achievements panel showing locked/unlocked.
3. **Symbol packs** — `Code` (`</>` vs `{ }`, default), `Binary` (`1` vs `0`), `Classic` (`X` vs `O`), `Circuit` (chip icon vs lightning-bolt icon). All marks are inline SVG drawn with stroke animation.
4. **Accent themes** — `Neon` (cyan/magenta, default), `Synthwave` (orange/purple), `Matrix` (green/black; unlocked by the Konami code easter egg, otherwise hidden).
5. **Console panel** — a collapsible terminal-styled move log: `> USER_1 placed at (0,2)`, `> BOT.exe computing…`, `> BUILD SUCCESSFUL: USER wins`, etc. Max 100 lines, auto-scroll, clearable.
6. **Sound** — synthesized with the Web Audio API (no audio files): place, win, draw, error, tick (Blitz), toggle. Mute toggle persisted. Audio context is created only after the first user gesture.
7. **Haptics** — `navigator.vibrate` on mobile for place (10 ms), error (30 ms), win (pattern). Toggle persisted. Silent fail where unsupported.
8. **Undo** — Vs Bot: undo reverts bot move + your move. Local 2P: reverts one move. Disabled in Blitz and after game over.
9. **Hint** — In Vs Bot (easy/medium only) highlights the best move computed by the hard engine; logged in the console panel.
10. **Keyboard shortcuts** — Appendix E. A `?` overlay lists them.
11. **Share result card** — after a game, "Share result" builds a text summary (`I beat BOT.exe on HARD in TicTacTech ⚡ <link>`) and uses the Web Share API when available, otherwise copies to clipboard with a toast.
12. **PWA** — installable, offline-capable (manifest + service worker with relative paths), "Install" button when eligible, update toast when a new version is deployed.
13. **Konami code** (`↑↑↓↓←→←→BA` on keyboard, or tapping the logo 7 times on touch) unlocks the Matrix accent theme and a "digital rain" background option.
14. **Boot screen** *(optional)* — a 700 ms terminal-style boot animation on first load per session (`> booting TicTacTech v1.0.0 … OK`), skippable by tap/click/key, never shown again in that session.

### 3.6 Screens
1. **Home / Menu** — logo, tagline, two big mode cards (Vs BOT.exe, Local 2P), variant selector (Classic / Infinity / Blitz / Misère), difficulty selector (visible only for bot mode), "Run" button, plus icon buttons: theme toggle, sound, install (when eligible), settings, stats, achievements, shortcuts help.
2. **Game** — HUD (player chips with symbol, name, score; turn indicator; Blitz timer ring), board, action bar (Undo, Hint, Reboot, Console, Menu), console panel (collapsible), win/draw overlay with animated result, "New session", "Share result", "Menu".
3. **Settings modal** — theme (Light / Dark / System), accent theme, symbol pack, player names, who goes first (You / Bot / Alternate / Random), Blitz seconds, sound, haptics, cursor effects, background animation, scanlines, reduced motion override, reset data.
4. **Stats modal**, **Badges modal**, **Shortcuts modal**, and a generic **confirm dialog** (used when leaving a game in progress).

## 4. Architecture, structure, and standards

### 4.1 Final file structure (create exactly this; add files only if justified and documented)
```
Akshays_Project/
├── index.html
├── manifest.webmanifest
├── sw.js
├── .nojekyll
├── .gitignore
├── README.md
├── LICENSE                      (MIT, owner's name)
├── QC_LOG.md                    (created in Step 0, updated every step)
├── assets/
│   └── icons/
│       ├── favicon.svg
│       ├── icon-192.png
│       ├── icon-512.png
│       └── icon-maskable-512.png
├── css/
│   ├── tokens.css               design tokens: colors, spacing, radii, shadows, light/dark, accents
│   ├── base.css                 reset, typography, layout primitives, utilities
│   ├── components.css           buttons, cards, chips, board, cells, modals, toasts, toggles, HUD, console
│   ├── animations.css           keyframes, transitions, reduced-motion overrides
│   └── cursor.css               custom cursor styles (fine-pointer only)
├── js/
│   ├── main.js                  bootstrap: wires modules, starts app
│   ├── engine/
│   │   ├── board.js             PURE: createBoard, applyMove, getWinner, isFull, legalMoves
│   │   ├── rules.js             PURE: variant rule sets (classic, infinity, blitz, misere) as strategy objects
│   │   └── ai.js                PURE: easy/medium/hard, minimax + alpha-beta, heuristics
│   ├── state/
│   │   ├── store.js             single app state + subscribe/setState (tiny pub/sub, immutable updates)
│   │   └── storage.js           versioned, safe localStorage wrapper (never throws)
│   ├── ui/
│   │   ├── screens.js           screen router (menu/game), modal manager, focus trapping
│   │   ├── render.js            board DOM rendering, SVG marks, win line, ghost hover preview
│   │   ├── hud.js               turn indicator, scores, timer ring, toasts, console panel
│   │   ├── effects.js           confetti canvas, background particles/circuit canvas, shake
│   │   ├── cursor.js            custom cursor (dot + ring + trail), fine-pointer only
│   │   ├── theme.js             light/dark/system, accent themes, meta theme-color sync
│   │   ├── audio.js             Web Audio synth + haptics
│   │   └── panels.js            Settings / Stats / Badges modal content (schema-driven form, tables, grid)
│   ├── features/
│   │   ├── achievements.js      definitions, unlock logic, toasts
│   │   ├── stats.js             counters, streaks, time played
│   │   ├── share.js             result text + Web Share / clipboard sharing
│   │   └── shortcuts.js         keyboard map, Konami code
│   └── pwa.js                   service-worker registration, install prompt, update toast
├── tests/
│   ├── engine.test.mjs          node:test — board + rules
│   ├── ai.test.mjs              node:test — AI behaviours incl. exhaustive "hard never loses"
│   ├── share.test.mjs           node:test — result sharing helpers
│   └── storage.test.mjs         node:test — storage wrapper with a fake localStorage
└── tools/
    └── make-icons.mjs           dependency-free Node script that writes the PNG icons (uses node:zlib)
```

### 4.2 Coding standards
- ES modules (strict by default). No globals except an optional `window.__TTT` debug handle exposed only when `?debug=1` is in the URL.
- **Engine and features are DOM-free and pure** so they run in Node tests. UI modules are the only ones that touch `document`.
- Every module has a short header comment stating its responsibility. Every exported function has a JSDoc block with param/return types.
- Event delegation for board clicks (one listener on the board, `data-index` on cells). No inline `onclick`. No `innerHTML` with user-provided strings (player names are set with `textContent`).
- State is a single object in `store.js`; UI re-renders from state, never from ad-hoc DOM reads. Game flow is a state machine: `menu → playing → animating → gameover` (+ `botThinking` flag). Input is ignored unless status is `playing` and it is a human's turn.
- CSS: mobile-first, BEM-ish class naming (`.board`, `.board__cell`, `.board__cell--winner`), all colors via custom properties from `tokens.css`, `clamp()` for fluid type, `dvh` units with `vh` fallback, `env(safe-area-inset-*)` padding, `touch-action: manipulation`, `-webkit-tap-highlight-color: transparent` on interactive elements, `user-select: none` on the board.
- Performance budget: total JS ≤ 150 KB unminified, total CSS ≤ 80 KB, first load ≤ 400 KB including icons, zero long tasks > 50 ms during play, background canvas ≤ 5% CPU on a mid-range laptop and paused when hidden, `devicePixelRatio` capped at 2 for canvases.
- Lighthouse targets (mobile): Performance ≥ 90, Accessibility ≥ 95, Best Practices ≥ 95, SEO ≥ 90, PWA installable.
- Comments and identifiers in English. No dead code, no commented-out blocks, no `console.log` left in shipping code (a `debug()` helper gated by `?debug=1` is fine).

### 4.3 Design tokens (use these exact values as the starting palette; you may extend, not replace)
```
Dark (default when system prefers dark):
  --bg: #0b0f1a;  --surface: #121829;  --surface-2: #1a2238;  --border: rgba(255,255,255,.08)
  --text: #e6edf7;  --muted: #8a97b1
  --p1: #22d3ee (cyan)   --p2: #f472b6 (magenta)   --accent: var(--p1)
  --ok: #a3e635  --warn: #fbbf24  --danger: #f87171  --violet: #a78bfa
  glow: 0 0 24px color-mix(in srgb, var(--accent) 55%, transparent)
Light:
  --bg: #f5f7fb;  --surface: #ffffff;  --surface-2: #eef2f9;  --border: rgba(15,23,42,.10)
  --text: #0f172a;  --muted: #526079
  --p1: #0891b2   --p2: #db2777   --ok: #65a30d  --warn: #d97706  --danger: #dc2626  --violet: #7c3aed
Accents:
  neon:      p1 cyan #22d3ee / p2 magenta #f472b6
  synthwave: p1 orange #fb923c / p2 purple #c084fc
  matrix:    p1 green #22c55e / p2 lime #bef264 on near-black bg #050806 (locked until Konami)
Typography:
  --font-ui: "Segoe UI", Roboto, Inter, system-ui, -apple-system, sans-serif
  --font-mono: "JetBrains Mono", "Cascadia Code", "Fira Code", Consolas, "SF Mono", monospace
  Fluid sizes: --fs-1: clamp(.85rem,.8rem+.3vw,1rem) … --fs-hero: clamp(2rem,1.2rem+4vw,4rem)
Spacing scale: 4, 8, 12, 16, 24, 32, 48, 64 px as --s-1 … --s-8. Radii: 8 / 14 / 22 px.
Board size: min(92vw, 62dvh, 520px). Cell gap: clamp(6px, 1.5vw, 14px). Min touch target 44×44 px.
```
Contrast rule: all body text ≥ 4.5:1 against its background in both themes; large display text ≥ 3:1.

### 4.4 Tech theme rules (apply everywhere)
- Names: USER / USER_1 / USER_2 / BOT.exe. Buttons: `Run` (start), `Reboot` (restart), `New session` (play again), `Config` (settings), `Logs` (stats), `Badges` (achievements), `Console` (move log).
- Microcopy (Appendix B) uses developer language: `BUILD SUCCESSFUL`, `process exited with code 0` (draw), `ERR_CELL_OCCUPIED`, `TIMEOUT → auto-commit`, `> BOT.exe computing…`.
- Visuals: circuit-trace lines in the board grid, a blinking block cursor `▮` after the turn text, scanline overlay at 3% opacity (toggleable, off under reduced motion), glass panels with 1 px glowing borders, monospace headings.
- Sounds: 8-bit-ish square/triangle blips, short (< 120 ms), never annoying, all under a master gain of 0.25.

## 5. Work protocol (follow exactly)

1. Work on **one step only**. Read the step's Goal, Deliverables, Requirements, and Self-checks before writing code.
2. Create/modify only the files listed for that step (plus tiny wiring edits to `index.html` / `main.js` when the step says so).
3. After coding, run the step's **Self-checks**. Fix anything failing before reporting.
4. Update `QC_LOG.md`: add/refresh the row for the step with `Status: READY FOR QC`, the date, and a 1–3 line summary.
5. End your message with exactly:
   ```
   STEP N COMPLETE — READY FOR QC
   Files touched: <list>
   Self-checks: <each check → PASS/FAIL>
   Known limitations: <none | list>
   ```
6. Wait. Do NOT start the next step until you receive `QC PASS STEP N`.
7. On `QC FAIL STEP N` + defect list: fix **every** listed defect (S1–S4), re-run all self-checks for the step, run the Smoke-10 regression (defined in `QC_CHECKLIST.md`), then report again in the same format with a `Fixes:` section mapping each defect ID to what changed.
8. Never "fix" a defect by removing a requirement. If a requirement is genuinely impossible under the hard constraints, say so explicitly, propose the closest compliant alternative, and wait for a decision.
9. Local preview for testing at any time: `python -m http.server 8080` (or `npx serve .`) from the project folder, then open `http://localhost:8080/`. To simulate the GitHub Pages sub-path, serve the **parent** folder and open `http://localhost:8080/Akshays_Project/`.
10. Unit tests: `node --test` from the project root (Node 18+; no dependencies). Do not pass a directory argument — on Node 24 `node --test tests/` fails with MODULE_NOT_FOUND; default discovery finds `tests/*.test.mjs`.

---

## 6. The steps

### STEP 0 — Project scaffold, HTML skeleton, tracking files
**Goal:** An empty but valid, deployable shell with the complete folder structure.

**Deliverables:** all folders from 4.1 (empty JS/CSS files with header comments are fine), `index.html`, `.nojekyll`, `README.md` (placeholder headings), `LICENSE` (MIT), `QC_LOG.md`, `assets/icons/favicon.svg`.

**Requirements:**
- `index.html`: `<!doctype html>`, `lang="en"`, `<meta charset>`, `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`, `<meta name="color-scheme" content="dark light">`, `<meta name="theme-color">` (two entries with `media` for dark/light), `<meta name="description">`, Open Graph title/description, `<link rel="icon" href="./assets/icons/favicon.svg">`, `<link rel="apple-touch-icon" href="./assets/icons/icon-192.png">`, `<link rel="manifest" href="./manifest.webmanifest">` (the manifest file itself is created in Step 13; until then the link may 404, which is acceptable only in Steps 0–12), stylesheets in order tokens → base → components → animations → cursor, and `<script type="module" src="./js/main.js"></script>` at the end of `<body>`.
- An inline `<script>` in `<head>` (max 10 lines) that reads `localStorage['ttt.theme']` and applies `data-theme="dark|light"` to `<html>` before first paint (system preference fallback). This prevents theme flash.
- Semantic landmarks in the body: `<header>`, `<main id="app">`, `<footer>`. Placeholder text: logo `TicTacTech`, tagline, "loading…".
- `favicon.svg`: a 64×64 rounded square with a gradient (cyan→magenta) and a white 3×3 grid glyph.
- `QC_LOG.md` table with columns: Step | Status | Date | Summary | Defects (IDs) | Fixes.
- `README.md` headings: About, Features, Play modes, Tech stack, Run locally, Deploy to GitHub Pages, Project structure, Credits.

**Self-checks:** page opens via local server with no console errors; DevTools Network shows all linked CSS/JS resolve (except manifest/PNG icons, which are allowed to 404 until Steps 13); no absolute `/` paths (`grep -rn 'src="/\|href="/' index.html` returns nothing).

---

### STEP 1 — Design system (tokens, base, typography, utilities)
**Goal:** All visual primitives exist so every later step only composes them.

**Deliverables:** `css/tokens.css`, `css/base.css`, `css/animations.css` (base keyframes only), a temporary "style guide" section in `index.html` (buttons, chips, card, text sizes) that will be removed in Step 2.

**Requirements:**
- `tokens.css`: `:root` dark defaults; `:root[data-theme="light"]` overrides; `[data-accent="neon|synthwave|matrix"]` overrides for `--p1/--p2`; spacing, radii, shadows, glow, z-index scale, durations (`--d-fast: 120ms; --d-base: 220ms; --d-slow: 420ms`), easings (`--ease-out: cubic-bezier(.22,1,.36,1)`, `--ease-spring: cubic-bezier(.34,1.56,.64,1)`).
- `base.css`: modern reset, `html { color-scheme: dark light; }`, body uses `--bg/--text`, `min-height: 100dvh` with `100vh` fallback, safe-area padding, fluid type with `clamp()`, focus-visible ring (2 px `--accent` + 2 px offset), `.visually-hidden`, `.container` (max-width 1100 px, `padding-inline: max(16px, env(safe-area-inset-left))`), `@media (prefers-reduced-motion: reduce)` and `html[data-motion="reduced"]` both set `*{animation-duration:.001ms!important; transition-duration:.001ms!important}` except for opacity fades.
- `animations.css`: `fade-in`, `slide-up`, `pop` (scale spring), `pulse-glow`, `shake`, `blink-cursor`, `spin`.
- A theme transition: when `data-theme` changes, background/text colors cross-fade over 220 ms (`transition: background-color, color` on `body` and panels only; do NOT transition `all`).

**Self-checks:** style-guide section renders correctly at 320 px and 1440 px; contrast of `--text` on `--bg` and `--muted` on `--surface` ≥ 4.5:1 in both themes (compute or use DevTools); toggling `document.documentElement.dataset.theme` in the console flips colors smoothly; no console errors.

---

### STEP 2 — Responsive layout shell and screens (no game logic yet)
**Goal:** Every screen exists as real, responsive markup with final class names; navigation between them works.

**Deliverables:** `css/components.css` (initial), `js/ui/screens.js`, `js/main.js` (wiring), final `index.html` body markup. Remove the Step 1 style-guide section.

**Requirements:**
- Screens are `<section class="screen" data-screen="menu|game" hidden>`; `screens.js` exports `show(screenName)` that toggles `hidden`, moves focus to the screen's heading, and animates entry (`slide-up`).
- **Menu screen:** logo + tagline, mode cards (2, as `<button>` elements with `aria-pressed`), variant segmented control (radio group), difficulty segmented control (radio group, hidden unless Vs Bot), primary "Run" button, icon toolbar (theme, sound, install, settings, stats, badges, help; the toolbar wraps on narrow screens) — all real `<button>`s with `aria-label`s.
- **Game screen:** HUD (two player chips + center turn indicator + Blitz timer ring placeholder), `<div class="board" role="grid" aria-label="Tic Tac Toe board">` with nine `<button class="board__cell" role="gridcell" data-index="0..8" aria-label="Row 1, Column 1: empty">`, action bar (Undo, Hint, Reboot, Console, Menu), collapsible console panel (`<section class="console" aria-live="polite">`), result overlay (hidden).
- **Modals:** one generic `<dialog class="modal">` pattern used for Settings, Stats, Badges, Shortcuts and Confirm. `screens.js` provides `openModal(id)`/`closeModal()` with focus trap, Escape to close, click-outside to close, and `inert` on the background.
- Responsive rules: board = `min(92vw, 62dvh, 520px)` square with `aspect-ratio: 1`, 3×3 grid, gap from tokens; phone portrait: HUD above, actions below; phone landscape (`max-height: 500px`): board left, HUD + actions right in a column; tablet/desktop: board centered, console panel docked right at ≥ 1024 px; never any horizontal page scroll at 320 px; all tap targets ≥ 44 px.
- Toast container (`aria-live="polite"`) fixed bottom-center on mobile, bottom-right on desktop, respecting safe areas.

**Self-checks:** navigate Menu → Game → Menu with buttons; open/close each modal via mouse and keyboard; `document.documentElement.scrollWidth <= window.innerWidth` at 320, 375, 768, 1024, 1440; landscape 844×390 layout switches; no console errors.

---

### STEP 3 — Theme system and dark-mode toggle
**Goal:** Dark/Light/System switching with persistence, no flash, animated toggle.

**Deliverables:** `js/ui/theme.js`, `js/state/storage.js`, tokens/components updates, toggle button markup.

**Requirements:**
- `storage.js` (create now): `get(key, fallback)`, `set(key, value)`, `remove(key)`, all wrapped in try/catch, JSON encoded, with a schema version key `ttt.v = 1`. Falls back to an in-memory map when `localStorage` is unavailable (private mode). Never throws.
- `theme.js` exports `initTheme()`, `setTheme('dark'|'light'|'system')`, `getResolvedTheme()`, `setAccent(name)`. Reads/writes `ttt.theme` and `ttt.accent` via `storage.js`.
- `System` follows `matchMedia('(prefers-color-scheme: dark)')` and reacts to live changes.
- The toggle button cycles `dark → light` (System is a Settings option). Its icon is an inline SVG sun/moon that morphs (rotate + scale via CSS transforms, 320 ms spring). `aria-label` updates ("Switch to light theme").
- `<meta name="theme-color">` content updates on change so the mobile browser chrome matches.
- Head inline script from Step 0 must agree with `theme.js` (same key, same attribute).
- Accent switching updates `--p1/--p2` and any glow; Matrix accent remains hidden in the UI until unlocked (Step 11).

**Self-checks:** reload keeps the chosen theme with no flash (test by throttling CPU in DevTools and watching first paint); OS theme change while in System mode updates instantly; both themes pass contrast; icon morph is smooth; no console errors.

---

### STEP 4 — Pure game engine + unit tests
**Goal:** Complete, DOM-free rules engine for all variants, fully unit-tested.

**Deliverables:** `js/engine/board.js`, `js/engine/rules.js`, `tests/engine.test.mjs`, `tests/storage.test.mjs`.

**Requirements:**
- `board.js`: `createBoard(size=3)` → `Array(size*size).fill(null)`; `applyMove(board, index, player)` → new board (immutable) or throws `Error('ERR_CELL_OCCUPIED' | 'ERR_OUT_OF_RANGE')`; `LINES` for 3×3 (8 lines) computed generically from size; `getWinner(board)` → `{ player, line } | null`; `isFull(board)`; `legalMoves(board)`; `nextPlayer(p)`.
- `rules.js`: each variant is an object `{ id, name, description, init(settings) → state, canMove(state, index), applyMove(state, index) → newState, getOutcome(state) → { type: 'win'|'draw'|'ongoing', player?, line? }, supports: { undo, hint, bot } }`. Variants: `classic`, `infinity` (tracks `history` per player, removes oldest on 4th, exposes `nextToVanish(state)`), `blitz` (same as classic + `timerSeconds`), `misere` (win detection inverted: the player who completes a line loses; `getOutcome` returns `{type:'win', player: other, line}`).
- Game state shape (document in a comment): `{ variant, board, current, history: [{index, player}], winner, line, status: 'playing'|'over', startedBy, moveCount, meta: {} }`.
- Tests (`node --test`): all 8 lines win for both players; no false positives; draw detected only when full and no winner; occupied/out-of-range moves throw; turn alternates; Infinity removes the correct oldest mark and never exceeds 3 per player; Misère assigns the win to the other player; immutability (input state untouched); storage wrapper survives corrupt JSON and a throwing fake `localStorage`.

**Self-checks:** `node --test` → 100% pass, ≥ 30 assertions; `grep -n "document\|window" js/engine/*.js js/state/storage.js` returns nothing except the guarded `localStorage` access in `storage.js`.

---

### STEP 5 — Board rendering, Local 2-Player gameplay, HUD, console panel
**Goal:** A complete, beautiful, playable Local 2P game in all variants (bot/link features come later).

**Deliverables:** `js/state/store.js`, `js/ui/render.js`, `js/ui/hud.js`, gameplay wiring in `main.js`, components/animations CSS.

**Requirements:**
- `store.js`: `createStore(initialState)` → `{ getState, setState(partial|fn), subscribe(fn) }`. App state includes `screen`, `settings`, `game`, `ui` (`botThinking`, `animating`, `consoleOpen`).
- Rendering: cells render marks as inline SVG from the active symbol pack (Appendix D provides paths). Placing a mark animates stroke drawing (`stroke-dasharray`/`dashoffset`, 260 ms) plus a subtle `pop`. Hover on an empty cell (fine pointer only) shows a 25%-opacity ghost of the current player's mark. Clicking an occupied cell triggers `shake` + error sound (Step 10) + toast `ERR_CELL_OCCUPIED`.
- Win: the three winning cells glow; an SVG line is drawn across them (animated `stroke-dashoffset`, 420 ms) in the winner's color; then the result overlay fades in (`BUILD SUCCESSFUL — USER_1 wins` / `process exited with code 0 — draw` / Misère: `USER_2 completed a line → USER_1 wins`). Overlay actions: New session, Share result (stub until Step 10), Menu.
- HUD: player chips (symbol SVG, name via `textContent`, score), active chip glows and scales 1.04; turn indicator text `> USER_1 turn ▮` with blinking cursor; Infinity: the next-to-vanish mark is faded (opacity .35) and pulsing.
- Blitz: timer ring (SVG circle, `stroke-dashoffset` driven by rAF, color shifts to `--warn` at 40% and `--danger` at 20%) + tick sound in the last 3 s (Step 10); on timeout auto-commit a random cell with toast; the timer resets each move and pauses when the tab is hidden.
- Console panel: append `<li>` lines with timestamp `[00:12]`, max 100 lines, toggle button with `aria-expanded`, collapsed by default on phones and open on ≥ 1024 px.
- Undo (per 3.5.8), Reboot (same players, same variant, scores kept; the loser starts, draw → alternate), Menu (confirm if a game is in progress).
- Score persists for the session; the "who goes first" setting is respected.
- Keyboard: arrows move focus among cells (roving tabindex), Enter/Space places, `1–9` places directly (reading order), `R` reboot, `U` undo, `M` mute, `T` theme, `Esc` closes overlay/modal.
- `aria-live="polite"` region announces turns and results; cell `aria-label` updates ("Row 2, Column 3: USER_1").

**Self-checks:** play full Local 2P games in Classic, Infinity, Blitz, Misère to win and draw outcomes; undo works and is disabled correctly; keyboard-only game possible; 60 fps during mark/line animations (DevTools Performance shows no long tasks); no console errors; `node --test` still passes.

---

### STEP 6 — AI opponent (easy / medium / hard) + exhaustive tests
**Goal:** BOT.exe with three difficulties, provably unbeatable on hard.

**Deliverables:** `js/engine/ai.js`, `tests/ai.test.mjs`, bot wiring in `main.js`, difficulty selector enabled, "thinking" indicator.

**Requirements:**
- `ai.js` exports `chooseMove(state, variant, difficulty, rng=Math.random)` → index, plus `minimax`, `bestMoves` (for hints). Injectable `rng` makes tests deterministic.
- Implement 3.4 exactly. Hard uses alpha-beta with move ordering (center, corners, edges) and a small transposition cache keyed by board string + player for speed; Misère uses inverted terminal scores; Infinity uses depth-limited search (6) with heuristic `openLines(ai) - openLines(human)`.
- Bot turn flow: lock input → show `> BOT.exe computing…` with animated dots → wait 350–900 ms (skip the wait in tests) → apply move → animations → unlock. If the user leaves the game screen during thinking, cancel the pending move.
- Hint (easy/medium only): `bestMoves` → pulse the suggested cell for 1.2 s, log `> hint: cell (r,c)`.
- Tests: `hard` never loses — **exhaustively** enumerate every opponent move sequence for both "AI first" and "AI second" in Classic and Misère (with a fixed rng), asserting the outcome is never a loss (3×3 has < 10k leaf games, runs in < 5 s). `medium` always takes an immediate win and always blocks an immediate loss (100 random positions each). `easy` picks only legal moves over 500 random positions. Infinity hard never produces an illegal state and wins vs random within 60 moves in ≥ 90% of 50 simulated games.

**Self-checks:** `node --test` passes with the exhaustive tests; manual: 5 games vs hard trying corner and edge traps → never a human win; 5 games vs medium → at least one human win via a fork; easy is obviously beatable; thinking delay visible; no console errors.

---

### STEP 7 — Variant polish and (optional) Ultimate mode
**Goal:** Every variant feels distinct and finished in both Local 2P and Vs Bot.

**Deliverables:** updates to `rules.js`, `render.js`, `hud.js`, `components.css`; optional `ultimate` variant.

**Requirements:**
- Variant selector cards show an icon, name, and one-line rule; a "?" tooltip / `aria-describedby` explains the rule; the game HUD shows the active variant badge.
- Infinity: vanish animation (mark shrinks + fades 220 ms) when a 4th mark is placed; the vanishing preview updates immediately after each move; console logs `> mark at (0,0) garbage-collected`.
- Blitz: settings-driven seconds; the first move's timer starts after the board entry animation; the bot in Blitz responds within the window; timeout auto-commit is logged.
- Misère: turn indicator shows `avoid 3-in-a-row`; the losing line is drawn in `--danger` and the overlay explains why.
- Optional Ultimate (only if everything above is complete): 9 sub-boards in a 3×3 macro grid; the active sub-board is highlighted; won sub-boards show a large mark overlay; macro win detection; bot easy/medium via heuristic; hard/hint disabled for Ultimate; responsive down to 320 px with cells ≥ 28 px.

**Self-checks:** each variant playable to completion in Local 2P and Vs Bot (all three difficulties); rule badges correct; animations smooth; tests pass; no console errors.

---

### STEP 8 — Visual polish, effects, and background
**Goal:** "Wow" factor: colorful, glowing, alive, still fast.

**Deliverables:** `js/ui/effects.js`, `animations.css` additions, `components.css` polish.

**Requirements:**
- Background: a full-screen canvas behind the UI drawing a slow circuit/particle network (≤ 60 nodes on desktop, ≤ 25 on mobile, connected by faint lines within 120 px), colored by the accent; updates at ≤ 30 fps via rAF with timestamp throttling; paused on `visibilitychange`, under reduced motion, and when disabled in settings; `devicePixelRatio` capped at 2; resize debounced 150 ms.
- Win celebration: canvas confetti (≤ 150 particles, pooled, accent + player colors, gravity + drag, 1.6 s) plus a screen-edge glow pulse; skip on draw (show a subtle gray ripple instead); none under reduced motion.
- Micro-interactions: buttons have hover lift (translateY(-1px) + glow), active press (scale .97), ripple from pointer position; mode cards tilt slightly toward the pointer on desktop (max 6°, via transform only); the logo has a subtle glitch animation every 8 s (2 frames, off under reduced motion).
- Scanline overlay (3% opacity repeating-linear-gradient) toggle in settings, default on for dark theme, off under reduced motion.
- Screen transitions: menu ↔ game cross-fade + slide (220 ms), result overlay `pop`.
- Every effect is a pure enhancement: the game must remain fully playable with `effects.js` disabled.

**Self-checks:** DevTools Performance during a full game: no long tasks, steady frame rate; CPU with the background on ≤ 5% idle on a laptop; the rAF loop stops when the tab is hidden; reduced motion removes all decorative animation; no console errors.

---

### STEP 9 — Custom cursor and pointer effects (desktop only)
**Goal:** Delightful cursor animations that never get in the way and never appear on touch.

**Deliverables:** `js/ui/cursor.js`, `css/cursor.css`, settings toggle.

**Requirements:**
- Activate only when `matchMedia('(hover: hover) and (pointer: fine)').matches`, `prefers-reduced-motion` is not `reduce`, and the setting is on. Re-evaluate on `change` of the media query (e.g., plugging a mouse into a tablet).
- Elements: `.cursor-dot` (8 px, follows the pointer instantly) and `.cursor-ring` (36 px, follows with lerp factor 0.18 per frame). Both `position: fixed; pointer-events: none; z-index: top; will-change: transform; mix-blend-mode: difference` (fall back to normal blend on the light theme if contrast suffers). Movement via `transform: translate3d()` only.
- States: hovering `a, button, [role=button], .board__cell:not(.is-taken)` → ring scales 1.6 and tints accent; over a taken cell → ring turns `--danger` and shows a tiny "×"; `mousedown` → dot scales 0.7 and ring scales 0.9; click → ripple burst (CSS `pop` on a cloned ring); pointer leaves the window → both fade out; text inputs → ring becomes a thin I-beam-like bar.
- Optional trail: up to 24 pooled particles drawn on the effects canvas, decaying 400 ms, accent-colored, controlled by a setting.
- `body { cursor: none }` only while the custom cursor is active, and all interactive elements keep `cursor: none` too; when inactive everything reverts to native cursors (`pointer` on buttons).
- No jank: single rAF loop, no per-mousemove DOM writes (only store coordinates).

**Self-checks:** desktop: cursor visible, smooth, correct hover states, no lag; DevTools device emulation (touch) and a real phone: native behaviour, no custom cursor elements visible; reduced motion → native cursor; setting toggle works live; no console errors.

---

### STEP 10 — Sound, haptics, share result card
**Goal:** Audio feedback without files; mobile vibration; shareable results.

**Deliverables:** `js/ui/audio.js`, `js/features/share.js`, settings toggles, toolbar mute button.

**Requirements:**
- `audio.js`: lazy `AudioContext` created on first gesture (`pointerdown`/`keydown`), `resume()` handling for iOS; synth helpers `blip(freq, dur, type)`, `chord([...])`, `noiseBurst()`; sounds: place (P1 880 Hz square 60 ms, P2 660 Hz triangle 60 ms), error (150 Hz saw 90 ms + noise), win (arpeggio C-E-G-C over 320 ms), draw (two descending tones), tick (1200 Hz sine 25 ms), toggle (click 30 ms), achievement (rising 3-note). Master gain 0.25. Mute persists (`ttt.sound`). Never throws when unsupported.
- Haptics: `vibrate()` wrapper with a setting (`ttt.haptics`), silent when unsupported.
- Share result: builds text + the current page URL (`location.href` without hash); uses `navigator.share` when available, else `navigator.clipboard.writeText` with toast `copied to clipboard`; falls back to a selectable text field if the clipboard is blocked.

**Self-checks:** sound plays only after a user gesture (no autoplay warnings on desktop or mobile emulation); mute toggle silences everything and persists across reload; vibration fires on Android (or fails silently elsewhere); share works on mobile and desktop; no console errors.

---

### STEP 11 — Stats, achievements, settings, shortcuts, Konami
**Goal:** Persistence-backed side kicks that make people come back.

**Deliverables:** `js/features/stats.js`, `js/features/achievements.js`, `js/features/shortcuts.js`, Settings/Stats/Badges/Shortcuts modals wired.

**Requirements:**
- Stats (`ttt.stats`): keyed by `mode:variant:difficulty` plus totals; streaks (current, best); time played (accumulate only while the game screen is visible); rendered as clean tables/cards with a tiny inline SVG bar for win rate; "Reset data" requires a two-tap confirm.
- Achievements (`ttt.achievements`): Appendix C list; unlock check runs after every game and on specific events; toast with badge icon + sound; Badges modal grid with locked (grayscale, title `???`, hint text) / unlocked (colored) states and unlock dates.
- Settings modal: every option from 3.6 item 3, each bound to `ttt.settings` and applied live (no reload). Player names max 12 chars, sanitized via `textContent`. "Who goes first" applies to the next game.
- Shortcuts: Appendix E; `?` opens the modal; shortcuts are ignored while typing in inputs.
- Konami code (keyboard) or 7 logo taps (touch) → unlock Matrix accent + digital-rain background option + achievement `konami`; persisted (`ttt.unlocks`).

**Self-checks:** stats update correctly for win/lose/draw in every mode; streak logic verified; achievements unlock exactly once with toast; settings persist and apply live; corrupt/garbage localStorage values are ignored safely (test by setting `localStorage['ttt.settings']='{oops'`); no console errors.

---

### STEP 12 — Modal and cursor robustness, share polish
**Goal:** Dialogs, overlays and the custom cursor behave under every interaction sequence, including the ones manual testers hit.

**Deliverables:** hardening in `js/ui/screens.js`, `js/ui/cursor.js`, `css/cursor.css`, `js/features/share.js`, `tests/share.test.mjs`.

**Requirements:**
- **Custom cursor over modals.** Native `<dialog>`s render in the browser's top layer, above any z-index. The cursor visuals must therefore live in their own top-layer element (a `popover="manual"` layer with every default popover style neutralised: no border/padding/background, `pointer-events: none`) that is re-raised whenever a modal opens. `screens.js` dispatches a `ttt:modal` event with `{ open, count }` on every open/close so the cursor layer can react. On browsers without the Popover API the custom cursor is suspended while a modal is open and the native cursor (pointer on buttons) is shown inside the dialog.
- **Open/close race.** Opening a dialog that is still playing its close animation must cancel the close and keep it open (no lost opens). Closing resolves any pending confirm promise immediately, and focus is restored to the opener only if it is still visible; after a screen change focus goes to the visible screen's heading instead of `<body>`.
- **Share result.** `share.js` builds the result text (bot win/loss/draw, local win/draw) plus the page URL without hash or debug query; uses the Web Share API only on touch devices, else the clipboard, else a selectable fallback textarea in the result card. Never throws.
- Tests: result text for every outcome/mode combination, `pageUrl` stripping, and the Node fallback of `shareText`.

**Self-checks:** with a modal open the cursor ring is visible over the dialog and reacts to its buttons (popover path), and the native cursor appears inside the dialog when `showPopover` is deleted (fallback path); rapidly close+reopen Settings → it stays open with `inert` on the background; leave a game via Menu → confirm → focus lands on the menu heading; `node --test` passes; no console errors.

---

### STEP 13 — PWA: manifest, service worker, install prompt, update flow
**Goal:** Installable and fully offline, with relative paths that work on the GitHub Pages sub-path.

**Deliverables:** `manifest.webmanifest`, `sw.js`, `js/pwa.js`, `tools/make-icons.mjs`, PNG icons.

**Requirements:**
- `manifest.webmanifest`: `name`, `short_name` (`TicTacTech`), `description`, `start_url: "./"`, `scope: "./"`, `display: "standalone"`, `orientation: "any"`, `background_color`, `theme_color`, `icons` (192, 512, maskable 512, plus the SVG with `"sizes":"any"`), `categories: ["games"]`.
- `tools/make-icons.mjs`: zero-dependency Node script that rasterizes the icon (gradient rounded square + 3×3 grid glyph) into an RGBA buffer and encodes PNG using `node:zlib` (write IHDR/IDAT/IEND with CRC32) to `assets/icons/`. If this proves impractical, document the limitation and ship the SVG-only manifest plus a note in README on how to add PNGs; QC will accept a documented fallback for PNGs only.
- `sw.js` (at repo root, registered as `./sw.js` with scope `./`): `CACHE_VERSION` constant (bump per deploy), precache the full app shell with **relative** URLs, cache-first for shell files, network-first with cache fallback for `index.html`, ignore non-GET and cross-origin, `skipWaiting` on message, `clients.claim()`. Delete old caches on activate.
- `pwa.js`: register the SW only on `https:` or `localhost`; listen for `updatefound` → when the new worker is installed and there is a controller, show toast `update available — reload` with a button that posts `SKIP_WAITING` and reloads on `controllerchange`; capture `beforeinstallprompt` and show an "Install" button in the toolbar; hide it after install (`appinstalled`).
- Add `<meta name="apple-mobile-web-app-capable">`, `apple-mobile-web-app-status-bar-style`, and `apple-touch-icon` for iOS.

**Self-checks:** DevTools → Application shows a valid manifest and an active SW with no errors; go offline → reload → the game loads and plays; served from `http://localhost:8080/Akshays_Project/` (parent folder), every asset resolves with the sub-path (Network tab: zero 404s) and the SW scope is `/Akshays_Project/`; changing `CACHE_VERSION` triggers the update toast; no console errors.

---

### STEP 14 — Accessibility, performance, cross-device hardening
**Goal:** Pass strict QA on every listed device/size and the Lighthouse targets.

**Deliverables:** fixes across files; results recorded in `QC_LOG.md`.

**Requirements:**
- Accessibility: run an audit (Lighthouse/axe). Fix all issues. Verify: full keyboard play; screen-reader announcements for turn, placement, result; modals trap focus and restore it; color is never the only indicator (marks differ by shape); all icon buttons labelled; reduced motion honoured everywhere; text zoom 200% doesn't break layout.
- Performance: Lighthouse mobile ≥ 90; no render-blocking beyond the 5 stylesheets; `content-visibility: auto` on modals; icons ≤ 40 KB total; fonts self-hosted with `font-display: swap` or system stack.
- Cross-device: verify at widths 320, 360, 390, 414, 768, 1024, 1280, 1920 and landscape 844×390; iOS Safari quirks (100dvh, rubber-band, tap zoom prevented via `touch-action: manipulation`, no 300 ms delay, safe-area padding), Android Chrome (address bar resize → no layout jump), Firefox, Edge.
- Robustness: rapid double-taps cannot place two marks; resizing mid-animation is safe; the app recovers if `localStorage` is unavailable (private mode) by falling back to memory.

**Self-checks:** Lighthouse mobile numbers meet targets; zero console errors/warnings across a 10-minute manual session; the device matrix in QC-14 fully passes on emulation and at least one real phone.

---

### STEP 15 — README, docs, cleanup, deploy-readiness handoff
**Goal:** The repo can be uploaded to GitHub and go live with zero code changes.

**Deliverables:** final `README.md`, `LICENSE`, cleanup, `QC_LOG.md` finalized, version bump.

**Requirements:**
- `README.md`: project banner (text/emoji is fine), feature list, screenshots section with placeholders and instructions to add them, play modes and variants, controls/shortcuts table, tech stack, run locally (`python -m http.server 8080` / `npx serve .`), run tests (`node --test`), **Deploy to GitHub Pages** step-by-step: (1) create a public repo, (2) upload all files including `.nojekyll`, (3) Settings → Pages → Build and deployment → Source "Deploy from a branch" → Branch `main` / folder `/ (root)` → Save, (4) wait 1–3 minutes, (5) open `https://<user>.github.io/<repo>/`, (6) on every later update bump `CACHE_VERSION` in `sw.js`; troubleshooting (blank page → check relative paths and `.nojekyll`; old version showing → bump cache version / hard reload; install button missing → must be HTTPS + valid manifest).
- Remove debug code, unused CSS/JS, TODOs; ensure `?debug=1` still works but nothing logs otherwise.
- Set `APP_VERSION` (in `main.js`, shown in the footer and boot screen) to `1.0.0` and `CACHE_VERSION` to `ttt-v1.0.0`.
- Final `node --test` green; final Smoke-10 green; `QC_LOG.md` shows every step `PASS`.

**Self-checks:** a fresh copy served from a sub-path works with zero console errors; README instructions are complete for a non-developer; file sizes within budget; everything in the Definition of Done below is true.

---

## 7. Definition of Done (the whole project)
- All 16 steps have `PASS` in `QC_LOG.md`, and the Final Release QC in `QC_CHECKLIST.md` is PASS.
- Static-only, relative paths, `.nojekyll`, works from a sub-path and offline.
- Vs Bot (easy/medium/hard, hard provably unbeatable) and Local 2P; Classic, Infinity, Blitz, Misère all playable on phone and laptop.
- Dark/Light/System theme, accent themes, symbol packs, custom cursor (desktop only), sounds, haptics, stats, achievements, shortcuts, PWA, share.
- Zero console errors/warnings; Lighthouse targets met; accessibility verified; 60 fps animations.

## Appendix A — Screen and component checklist (for reference while building)
Menu: logo, tagline, mode cards ×2, variant control, difficulty control, Run, toolbar (theme, sound, settings, stats, badges, help, install*). Game: HUD chips ×2, turn indicator, timer ring*, variant badge, board 3×3, action bar (Undo, Hint, Reboot, Console, Menu), console panel, result overlay, toasts. Modals: Settings, Stats, Badges, Shortcuts, Confirm. (*conditional)

## Appendix B — Microcopy
- Turn: `> USER_1 turn ▮` · `> BOT.exe computing…` · Misère suffix ` (avoid 3-in-a-row)` · Blitz: ` 00:05`
- Win: `BUILD SUCCESSFUL ✔` + `USER_1 wins` · Bot wins: `RUNTIME ERROR ✖ BOT.exe wins` · Draw: `process exited with code 0` + `draw`
- Misère loss: `USER_2 completed a line → USER_1 wins`
- Errors: `ERR_CELL_OCCUPIED` · `ERR_NOT_YOUR_TURN`
- Blitz: `TIMEOUT → auto-commit (cell r,c)`
- Infinity: `> mark at (r,c) garbage-collected`
- Confirm dialog: heading `abort session?`, body `The current game will be lost.`, button `Yes, abort`
- Toasts: `copied to clipboard` · `update available — reload` · `installed ✔` · `sound on/off` · `theme: dark/light`
- Boot (optional): `> booting TicTacTech v1.0.0 … OK` `> loading engine … OK` `> mounting UI … OK`

## Appendix C — Achievements (id · title · description · trigger)
1. `hello_world` · Hello, World! · Play your first game · first game completes
2. `first_commit` · First Commit · Win your first game · first win (any mode)
3. `bug_squasher` · Bug Squasher · Beat BOT.exe on medium · win vs medium
4. `stack_overflow` · Stack Overflow · Draw against hard 3 times · 3 draws vs hard (cumulative)
5. `segfault` · Segmentation Fault · Lose to BOT.exe on easy · lose vs easy
6. `overclocked` · Overclocked · Win 5 games in a row · streak ≥ 5
7. `speedrun` · Speedrun · Win a Blitz game with every move under 2 s · tracked per move
8. `infinite_loop` · Infinite Loop · Play 10 Infinity games · count
9. `inverted` · Inverted Logic · Win a Misère game vs medium or hard · win
10. `pair_programming` · Pair Programming · Finish a Local 2P game · game completes
11. `night_owl` · Night Owl · Switch to dark theme · user toggles to dark (not on reset/boot)
12. `konami` · Konami · Find the easter egg · unlock
13. `centurion` · Centurion · Play 100 games · count

## Appendix D — Symbol packs (inline SVG on a 100×100 viewBox, stroke-width 10, round caps)
- Code: P1 `</>` = three strokes (`M35 30 L15 50 L35 70`, `M65 30 L85 50 L65 70`, `M58 22 L42 78`); P2 `{ }` = two curly-brace paths.
- Binary: P1 `1` (`M40 30 L55 22 L55 78` + base `M40 78 L70 78`); P2 `0` (ellipse rx 20 ry 28, optional inner slash).
- Classic: X (`M25 25 L75 75`, `M75 25 L25 75`); O (circle r 26).
- Circuit: chip (rounded rect 40×40 with 3 pins per side); bolt (`M55 15 L30 55 H50 L45 85 L70 45 H50 Z`, filled).
Each mark animates via `stroke-dasharray: <length>; stroke-dashoffset: <length> → 0` over 260 ms (`--ease-out`).

## Appendix E — Keyboard shortcuts
`1–9` place (reading order) · `←↑↓→` move focus · `Enter/Space` place · `R` reboot · `U` undo · `H` hint · `N` new session (after game over) · `T` theme · `M` mute · `C` console · `Esc` close · `?` shortcuts help · Konami sequence easter egg.

# PROMPT ENDS HERE
