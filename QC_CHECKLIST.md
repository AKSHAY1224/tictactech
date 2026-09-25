# TicTacTech — QC Checklist (Step-Gated Quality Control)

> **How to use this file:**
>
> - This is the quality gate for `BUILD_PROMPT.md`. Every build step **N** has a matching section **QC-N** below.
> - When the builder prints `STEP N COMPLETE — READY FOR QC`, paste the block from **"QC ROLE PROMPT"** followed by the full **QC-N** section into the model (same session is fine; a fresh session is stricter and recommended for Steps 5, 6, 12, 13, 14, 15).
> - The QC model runs every check, collects evidence, and returns a **QC Report** (template in Section 3).
> - Verdict rule: **PASS** only if every `MUST` check passes and there are zero S1/S2 defects. S3/S4 defects may pass the gate only if logged in `QC_LOG.md` and fixed before Final Release QC.
> - On **FAIL**: send the defect list to the builder with `QC FAIL STEP N`. The builder fixes everything, then you re-run the **full** QC-N section (not just the failed items) plus **Smoke-10**.
> - Never skip a QC section. Never accept "should work" without evidence.

---

## 1. QC ROLE PROMPT (paste this before any QC-N section)

```
You are the QC engineer for the TicTacTech project (spec: BUILD_PROMPT.md in this folder).
Run EVERY check in the QC section below. For each check, actually execute the command, open the page in a
local server (python -m http.server 8080 or npx serve .), inspect the code, or reason from the actual file
contents — do not assume. Record PASS/FAIL with concrete evidence (command output, DOM query result,
file:line reference, or a description of what you observed). Use the severity scale:
  S1 Blocker  – crash, console error, hard-constraint violation (server dependency, absolute path, library, build step)
  S2 Major    – a required feature is missing, wrong, or unusable on phone or desktop
  S3 Minor    – visual/UX polish issue, small inconsistency, non-blocking a11y issue
  S4 Nit      – naming, comments, formatting
Verdict: PASS only if all MUST checks pass and there are no S1/S2 defects.
Output the QC Report exactly in the template from QC_CHECKLIST.md Section 3, then append a row to QC_LOG.md.
Do NOT modify project source files while acting as QC; only report.
```

---

## 2. Global rules, tools, and reusable snippets

### 2.1 Local serving (needed for ES modules and the service worker)
```bash
# from the project folder
python -m http.server 8080          # then open http://localhost:8080/
# GitHub Pages sub-path simulation: serve the PARENT folder
cd .. && python -m http.server 8080 # then open http://localhost:8080/Akshays_Project/
```
PowerShell alternative: `py -m http.server 8080` or `npx serve . -l 8080`.

### 2.2 Static checks (run from the project folder in Git Bash)
```bash
# C1: no root-absolute paths anywhere (must print nothing)
grep -rn --include=*.html --include=*.css --include=*.js --include=*.webmanifest -E '(src|href|url\()=?["'"'"'(]/[a-zA-Z]' . | grep -v node_modules

# C2: no external runtime URLs (only w3.org SVG namespace and README/LICENSE/comments allowed)
grep -rn --include=*.html --include=*.css --include=*.js --include=*.webmanifest -E 'https?://' . | grep -v -E 'w3.org/2000/svg|README|LICENSE|QC_|BUILD_PROMPT|^\S+:\s*//|\* '

# C3: no libraries / CDN / build tooling
ls package.json node_modules 2>/dev/null && echo "FAIL: build tooling present" || echo "OK"
grep -rn -iE 'jquery|react|vue|cdn\.|unpkg|jsdelivr|googleapis' --include=*.html --include=*.js --include=*.css . && echo "FAIL" || echo "OK"

# C4: no stray console.log in shipping code (debug() helper allowed)
grep -rn 'console\.log' js/ | grep -v 'debug' && echo "CHECK" || echo "OK"

# C5: engine/features are DOM-free
grep -n -E 'document\.|window\.' js/engine/*.js js/features/*.js js/state/store.js 2>/dev/null && echo "CHECK" || echo "OK"

# C6: sizes (KB)
du -ck css/*.css | tail -1; du -ck js/*.js js/**/*.js | tail -1; du -ck assets/icons/* | tail -1

# C7: unit tests
node --test
```

### 2.3 Browser console snippets (paste in DevTools Console)
```js
// B1: horizontal overflow check (must be false at every tested width)
document.documentElement.scrollWidth > window.innerWidth

// B2: theme state
({theme: document.documentElement.dataset.theme, accent: document.documentElement.dataset.accent, stored: localStorage.getItem('ttt.theme')})

// B3: tap target audit (lists interactive elements smaller than 44px)
[...document.querySelectorAll('button,a,[role=button],input,select')].filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.height&&(r.width<44||r.height<44)}).map(e=>e.outerHTML.slice(0,80))

// B4: FPS sampler (run, interact for 3 s, read result)
(()=>{let f=0,s=performance.now();const t=()=>{f++;performance.now()-s<3000?requestAnimationFrame(t):console.log('avg fps',(f/3).toFixed(1))};requestAnimationFrame(t)})()

// B5: service worker + manifest
navigator.serviceWorker.getRegistrations().then(r=>console.log(r.map(x=>x.scope))); fetch('./manifest.webmanifest').then(r=>r.json()).then(console.log)

// B6: custom cursor should be absent on touch emulation
({fine: matchMedia('(hover: hover) and (pointer: fine)').matches, cursorEls: document.querySelectorAll('.cursor-dot,.cursor-ring').length, bodyCursor: getComputedStyle(document.body).cursor})

// B7: storage keys used
Object.keys(localStorage).filter(k=>k.startsWith('ttt.'))

// B8: all icon buttons labelled (must be empty)
[...document.querySelectorAll('button')].filter(b=>!b.textContent.trim()&&!b.getAttribute('aria-label')).map(b=>b.outerHTML.slice(0,80))
```

### 2.4 Device / viewport matrix (DevTools device toolbar; real phone where marked)
| ID | Viewport | Notes |
|---|---|---|
| V1 | 320×568 | iPhone SE (1st gen) width — strictest |
| V2 | 360×800 | common Android |
| V3 | 390×844 | iPhone 12–15 |
| V4 | 414×896 | large phone |
| V5 | 844×390 | phone landscape |
| V6 | 768×1024 | tablet portrait |
| V7 | 1024×768 | tablet landscape / small laptop |
| V8 | 1280×800 | laptop |
| V9 | 1920×1080 | desktop |
| R1 | Real Android or iPhone | required at QC-2, QC-9, QC-13, QC-14, Final |

### 2.5 Smoke-10 regression (run after every step from QC-5 onward, and after every FAIL→fix cycle)
1. Load page from local server: 0 console errors/warnings.
2. Theme toggle works and persists across reload with no flash.
3. Menu → Vs Bot (hard) → Classic → Run → play to the end → result overlay → New session works.
4. Menu → Local 2P → Infinity → play 8+ moves → oldest mark vanishes correctly.
5. Occupied-cell click → shake + `ERR_CELL_OCCUPIED` toast, no state change.
6. Keyboard-only: `1–9` places, `R` reboots, `Esc` closes overlay/modal.
7. Resize to 320 px: no horizontal scroll (B1 false), board fully visible, all buttons reachable.
8. Landscape 844×390: board and HUD both visible without scrolling the board off-screen.
9. Undo enabled/disabled correctly (disabled in Blitz, after game over).
10. `node --test` green.

---

## 3. QC Report template (return exactly this)

```
QC REPORT — STEP N — <date>
Verdict: PASS | FAIL
Environment: <browser + version, OS, Node version, viewport(s) used, real device if any>

MUST checks:
  [PASS] N.1 <check name> — evidence: <...>
  [FAIL] N.2 <check name> — evidence: <...>
  ...
SHOULD checks:
  [PASS/FAIL] ...
Smoke-10 (if applicable): <10/10 PASS | list failures>

Defects:
  D-N-01 (S1) <title> — where: <file:line or screen/action> — expected: <...> — actual: <...> — fix hint: <...>
  D-N-02 (S3) ...

Notes / risks for next step: <...>
QC_LOG.md row appended: yes
```

Defect IDs are `D-<step>-<nn>`. The builder must reference these IDs in its `Fixes:` section.

---

## 4. Step gates

### QC-0 — Scaffold
**MUST**
- 0.1 Folder structure matches BUILD_PROMPT §4.1 exactly (run `find . -type f | sort` or `Get-ChildItem -Recurse`); missing/extra files listed.
- 0.2 `index.html` has: doctype, `lang`, charset, viewport with `viewport-fit=cover`, `color-scheme` meta, two `theme-color` metas with `media`, description, OG tags, SVG favicon link, manifest link, 5 stylesheets in the specified order, one `type="module"` script at the end of body.
- 0.3 Inline head script applies `data-theme` before paint: view source, confirm it reads `ttt.theme`, falls back to `prefers-color-scheme`, is ≤ 10 lines, and does not throw when `localStorage` is blocked (wrap in try/catch).
- 0.4 `.nojekyll` exists and is empty; `LICENSE` is MIT with the owner's name; `QC_LOG.md` has the required columns; `README.md` has all required headings.
- 0.5 Static check C1 prints nothing (no absolute paths). C2/C3 print OK.
- 0.6 Served page: 0 console errors (the manifest and PNG 404s are tolerated until QC-13 and must be the ONLY network failures).
- 0.7 `favicon.svg` renders in the tab and matches the description (gradient rounded square + 3×3 grid).

**SHOULD**
- 0.8 Every empty JS/CSS file has a one-line header comment describing its responsibility.

---

### QC-1 — Design system
**MUST**
- 1.1 `tokens.css` defines every token listed in BUILD_PROMPT §4.3 (grep for `--bg`, `--surface`, `--surface-2`, `--border`, `--text`, `--muted`, `--p1`, `--p2`, `--accent`, `--ok`, `--warn`, `--danger`, `--violet`, `--font-ui`, `--font-mono`, `--s-1`…`--s-8`, `--d-fast/base/slow`, `--ease-out`, `--ease-spring`, radii, z-index).
- 1.2 Light overrides exist under `:root[data-theme="light"]`; accent overrides exist under `[data-accent="neon"|"synthwave"|"matrix"]`.
- 1.3 Contrast: compute `--text` on `--bg` and `--muted` on `--surface` for both themes (use DevTools color picker contrast or any calculator) → all ≥ 4.5:1. Record the ratios.
- 1.4 `base.css` includes reset, `color-scheme`, `min-height: 100dvh` with `100vh` fallback, safe-area padding, focus-visible ring, `.visually-hidden`, `.container`, reduced-motion rules for both the media query and `html[data-motion="reduced"]`.
- 1.5 `animations.css` defines keyframes `fade-in`, `slide-up`, `pop`, `pulse-glow`, `shake`, `blink-cursor`, `spin`.
- 1.6 Theme flip in console (`document.documentElement.dataset.theme='light'` then `'dark'`) cross-fades over ~220 ms; no `transition: all` anywhere (`grep -rn 'transition: *all' css/` → nothing).
- 1.7 Style-guide section: no horizontal overflow at V1 and V9 (B1 false); fluid type visibly scales between them.
- 1.8 0 console errors.

**SHOULD**
- 1.9 Fonts: no Google Fonts / external `@import` (C2). If self-hosted fonts exist, `font-display: swap` is set and files are `.woff2` under `assets/fonts/`.

---

### QC-2 — Layout shell and screens
**MUST**
- 2.1 Style-guide section from Step 1 is gone.
- 2.2 Menu screen contains: logo, tagline, exactly 2 mode cards as `<button>` with `aria-pressed`, variant radio group (4 options), difficulty radio group (3 options, hidden unless Vs Bot), Run button, toolbar buttons (theme, sound, install, settings, stats, badges, help) each with `aria-label` (B8 returns empty); the toolbar wraps at 320 px when all buttons are visible.
- 2.3 Game screen contains: 2 player chips, turn indicator, timer ring placeholder, `.board[role=grid]` with exactly 9 `.board__cell[role=gridcell][data-index]` buttons with row/column `aria-label`s, action bar (Undo, Hint, Reboot, Console, Menu), console panel with `aria-live`, hidden result overlay, toast container.
- 2.4 Navigation: Run → game screen; Menu → menu screen; focus moves to the new screen's heading (check `document.activeElement`).
- 2.5 Modals: each of Settings/Stats/Badges/Shortcuts/Confirm opens, traps Tab focus inside, closes on Esc and on backdrop click, restores focus to the opener, and the background is `inert` (or aria-hidden) while open.
- 2.6 Responsive: at V1, V2, V3, V4, V6, V7, V8, V9 → B1 is false, the board is a perfect square (`getBoundingClientRect()` width ≈ height), and its size equals `min(92vw, 62dvh, 520px)` within ±2 px.
- 2.7 Landscape V5: board and HUD visible simultaneously; layout switches to side-by-side; no vertical scroll needed to see the whole board.
- 2.8 Tap targets: B3 returns empty on V1 and V3.
- 2.9 Real device R1: load, navigate, open a modal, rotate → no layout breakage, no zoom on double-tap (`touch-action: manipulation` present on interactive elements).
- 2.10 0 console errors.

**SHOULD**
- 2.11 Console panel is collapsed by default on phones and open at ≥ 1024 px.

---

### QC-3 — Theme system
**MUST**
- 3.1 Toggle button switches dark ↔ light with an animated sun/moon icon; `aria-label` updates to describe the next state.
- 3.2 Persistence: choose light → reload → still light; B2 shows `stored: "light"`.
- 3.3 No flash: DevTools → Performance → CPU 6× slowdown → reload → first paint already has the correct theme (or record a screen capture / check the head script sets the attribute before CSS loads).
- 3.4 System mode (via Settings or console `setTheme('system')` when exposed) follows the OS; emulate `prefers-color-scheme` change in DevTools Rendering panel → the UI updates live without reload.
- 3.5 `meta[name=theme-color]` content changes with the theme (inspect after toggling).
- 3.6 `storage.js`: try/catch on every access, JSON encode/decode, `ttt.v` version key written; set `localStorage['ttt.theme']='{{bad'` → reload → no error, falls back to default.
- 3.7 Matrix accent is not offered in the UI (only neon/synthwave selectable).
- 3.8 0 console errors.

**SHOULD**
- 3.9 Theme transition is smooth (no flicker of unstyled panels); accent change re-tints the toggle glow.

---

### QC-4 — Engine + unit tests
**MUST**
- 4.1 `node --test` passes with 0 failures; report the assertion count (≥ 30).
- 4.2 `board.js` exports `createBoard`, `applyMove`, `getWinner`, `isFull`, `legalMoves`, `nextPlayer`, `LINES` (8 lines for 3×3). `applyMove` throws `ERR_CELL_OCCUPIED` and `ERR_OUT_OF_RANGE`, and returns a NEW array (`grep -n 'board\[.*\] *=' js/engine/board.js` should show no mutation of the input).
- 4.3 `rules.js` exports `classic`, `infinity`, `blitz`, `misere`, each with `id, name, description, init, canMove, applyMove, getOutcome, supports`.
- 4.4 Manual Node spot checks (paste into `node`):
  ```js
  const b = await import('./js/engine/board.js'); const r = await import('./js/engine/rules.js');
  let s = r.classic.init({}); [0,3,1,4,2].forEach(i => s = r.classic.applyMove(s, i)); console.log(r.classic.getOutcome(s)); // win P1, line [0,1,2]
  let m = r.misere.init({}); [0,3,1,4,2].forEach(i => m = r.misere.applyMove(m, i)); console.log(r.misere.getOutcome(m)); // win P2
  let f = r.infinity.init({}); [0,1,2,3,4,5,6].forEach(i => f = r.infinity.applyMove(f, i)); console.log(f.board.filter(x=>x===1).length, f.board[0]); // 3, null (cell 0 vanished)
  ```
- 4.5 C5 prints OK (no DOM access in engine/state except guarded `localStorage`).
- 4.6 Every exported function has JSDoc (spot-check 5).

**SHOULD**
- 4.7 Tests cover: all 8 lines both players, no false positive on empty/partial boards, draw only when full & no winner, immutability, Infinity `nextToVanish`, Misère line attribution, storage corrupt JSON + throwing storage.

---

### QC-5 — Local 2P gameplay, HUD, console
**MUST**
- 5.1 Play Local 2P Classic to a P1 win: marks draw with stroke animation; winning cells glow; win line animates across the correct 3 cells; overlay reads `BUILD SUCCESSFUL ✔ USER_1 wins`; console panel logged every move with `(r,c)` and timestamps.
- 5.2 Play to a draw: overlay `process exited with code 0 — draw`; no win line.
- 5.3 Infinity: after the 4th mark of a player, the oldest disappears; the next-to-vanish mark is faded/pulsing beforehand; no draw is ever declared.
- 5.4 Blitz: timer ring counts down from the configured seconds; color changes at 40% and 20%; timeout auto-commits a random empty cell with toast `TIMEOUT → auto-commit`; timer resets each move; hide the tab for 5 s → timer paused (remaining time unchanged on return).
- 5.5 Misère: completing a line makes the OTHER player win; overlay explains it; the losing line is drawn in `--danger`.
- 5.6 Occupied cell click → shake + toast `ERR_CELL_OCCUPIED`; board state unchanged; move count unchanged.
- 5.7 Undo: reverts one move in Local 2P; button disabled when there is nothing to undo, in Blitz, and after game over.
- 5.8 Reboot: same variant/players, scores kept, the loser starts (draw → alternates).
- 5.9 Menu button during a game asks for confirmation; after game over it does not.
- 5.10 Keyboard-only full game: Tab to board, arrows move focus (roving tabindex: exactly one cell has `tabindex="0"`), Enter/Space places, `1–9` places, `R` reboots, `Esc` closes the overlay. Shortcuts do nothing while a modal input is focused.
- 5.11 ARIA: cell labels update to `Row r, Column c: USER_x`; the live region announces turn changes and results (inspect the DOM text of the `aria-live` element).
- 5.12 Ghost preview appears on hover on desktop only (not on touch emulation) and is never left behind after a move.
- 5.13 Performance: B4 during rapid play ≥ 55 fps on a laptop; DevTools Performance shows no task > 50 ms during placement/win animations.
- 5.14 Input lock: during the win-line animation, clicking cells does nothing.
- 5.15 Smoke-10: 10/10. `node --test` green. 0 console errors.

**SHOULD**
- 5.16 Console panel: max 100 lines enforced; auto-scrolls; clear button works; `aria-expanded` toggles.
- 5.17 Turn indicator shows the blinking block cursor and uses monospace font.

---

### QC-6 — AI opponent
**MUST**
- 6.1 `node --testai.test.mjs` passes, including the exhaustive "hard never loses" tests for Classic and Misère, both AI-first and AI-second. Confirm by reading the test: it must enumerate ALL opponent replies (not random sampling) — check for recursion over `legalMoves`.
- 6.2 Manual hard: 5 games as human using (a) corner opening then opposite corner, (b) edge opening, (c) center opening → 0 human wins; the bot takes immediate wins and blocks forks.
- 6.3 Manual medium: the bot always blocks a one-move threat and always takes an immediate win (verify 5 situations each); human wins at least 1 of 5 games with a fork.
- 6.4 Manual easy: human wins ≥ 4 of 5 games; the bot visibly fails to block sometimes.
- 6.5 Thinking indicator `> BOT.exe computing…` shows for 350–900 ms; board input is locked while it shows (click a cell → nothing happens, no toast spam).
- 6.6 Leaving to the menu mid-thinking cancels the bot move (return to a new game → no stray mark, no error).
- 6.7 Hint (easy/medium only): pulses a sensible cell (verify it equals the hard engine's choice in a forced position, e.g., blocks an obvious threat); logged in console panel; Hint hidden/disabled on hard, in Local 2P, in Blitz.
- 6.8 Who-goes-first setting respected (You / Bot / Alternate / Random) — test each.
- 6.9 Vs Bot works in Classic, Infinity, Blitz, Misère on all three difficulties (12 combos, at least one full game each; Blitz bot replies within the time window).
- 6.10 `rng` injectable: `grep -n 'rng' js/engine/ai.js` shows it is a parameter with a default, and tests pass a seeded rng.
- 6.11 Smoke-10: 10/10. 0 console errors.

**SHOULD**
- 6.12 Hard move-ordering + transposition cache present; a full hard game shows no visible lag (< 50 ms compute per move on a laptop, measure with `performance.now()` around `chooseMove` via `?debug=1`).

---

### QC-7 — Variant polish (and optional Ultimate)
**MUST**
- 7.1 Variant cards show icon + name + one-line rule; rule explanation is accessible (`aria-describedby` or tooltip readable via keyboard).
- 7.2 Game HUD shows the active variant badge.
- 7.3 Infinity vanish animation plays (shrink + fade) and the console logs `garbage-collected`.
- 7.4 Blitz: timer starts only after the board entry animation; seconds follow Settings (3/5/10).
- 7.5 Misère: turn indicator suffix `(avoid 3-in-a-row)`; danger-colored losing line; overlay explanation.
- 7.6 All 4 variants × (Local 2P + Vs Bot easy/medium/hard) complete without errors (spot-check 8 combos beyond QC-6).
- 7.7 If Ultimate is implemented: correct next-board rule, sub-board win overlay, macro win, 320 px playable (cells ≥ 28 px), hard/hint disabled for it. If NOT implemented: it is absent from the UI entirely (no dead option).
- 7.8 Smoke-10: 10/10. Tests green. 0 console errors.

---

### QC-8 — Effects and background
**MUST**
- 8.1 Background canvas exists behind the UI (`z-index` below content, `pointer-events: none`), animates slowly, uses accent colors, and respects the node caps (≤ 60 desktop, ≤ 25 mobile: check the constants in `effects.js`).
- 8.2 Throttling: rAF loop is capped at ~30 fps for the background (check timestamp throttle in code) and STOPS when `document.hidden` (add a temporary `console.count` via `?debug=1` or inspect code for the `visibilitychange` handler + cancelAnimationFrame).
- 8.3 Reduced motion (DevTools Rendering → emulate `prefers-reduced-motion: reduce`): background static, no confetti, no glitch, no tilt, no scanlines; the game remains fully playable.
- 8.4 Settings toggles for background and scanlines take effect live.
- 8.5 Win → confetti (≤ 150 particles, ~1.6 s) + edge glow; draw → subtle ripple only.
- 8.6 Micro-interactions present: hover lift, press scale, ripple, card tilt (desktop only), logo glitch every ~8 s.
- 8.7 Performance: B4 ≥ 55 fps on the menu and during play with all effects on; DevTools Performance shows no long tasks; CPU idle with the background on ≤ ~5% (Task Manager / Performance monitor).
- 8.8 `devicePixelRatio` capped at 2 (grep `Math.min(.*devicePixelRatio` or equivalent); resize debounced.
- 8.9 Temporarily block `effects.js` (DevTools → Network → block request URL) → the game still works with no errors (graceful import failure or feature check).
- 8.10 Smoke-10: 10/10. 0 console errors.

---

### QC-9 — Custom cursor
**MUST**
- 9.1 Desktop (fine pointer): `.cursor-dot` and `.cursor-ring` present; body `cursor: none`; dot tracks instantly, ring lags smoothly (lerp); no visible jitter (B4 ≥ 55 fps while moving the mouse).
- 9.2 Hover states: buttons/links/empty cells → ring enlarges + accent; taken cell → danger + "×"; mousedown shrinks; click ripple; pointer leaving the window fades both out; text input → I-beam style.
- 9.3 Touch emulation (DevTools device toolbar, V3) → B6 shows `fine:false, cursorEls:0` (or elements hidden with `display:none`), body cursor `auto`.
- 9.4 Real device R1: no custom cursor artifacts anywhere, taps work normally.
- 9.5 Reduced motion emulation → native cursor (custom cursor disabled).
- 9.6 Settings "Cursor effects" off → native cursor immediately (no reload); on → custom cursor returns.
- 9.7 Implementation: single rAF loop; `mousemove` handler only stores coordinates (no DOM writes: inspect `cursor.js`); elements are `position: fixed; pointer-events: none; will-change: transform`; movement via `translate3d`.
- 9.8 Custom cursor never blocks clicks (click through on every interactive element works) and never appears above modals incorrectly (z-index highest, but still visible over modals — that is correct).
- 9.9 Smoke-10: 10/10. 0 console errors.

**SHOULD**
- 9.10 Trail particles (if on) are pooled (≤ 24) and disappear within ~400 ms; `mix-blend-mode: difference` remains legible on the light theme, otherwise a fallback blend is used.

---

### QC-10 — Sound, haptics, share
**MUST**
- 10.1 No `AudioContext` is created before the first user gesture (check code: created inside a `pointerdown`/`keydown` handler; console shows no autoplay-policy warnings on load).
- 10.2 Sounds: place (P1 and P2 differ), error, win, draw, tick (Blitz last 3 s), toggle, achievement — each audible and short (< 120 ms except win/draw/achievement); master gain ≈ 0.25.
- 10.3 Mute button toggles instantly, icon + `aria-label` update, persists across reload (`ttt.sound` in B7), toast `sound off/on`.
- 10.4 No audio files in the repo (`find . -iname '*.mp3' -o -iname '*.wav' -o -iname '*.ogg'` → nothing).
- 10.5 Haptics: `navigator.vibrate` wrapped, honors the setting, silent where unsupported (desktop shows no error).
- 10.6 Share result: on desktop without Web Share → copies text to clipboard and toasts `copied to clipboard`; text contains the outcome, mode/difficulty, and the page URL WITHOUT a hash; on mobile emulation with `navigator.share` → share sheet is invoked (or gracefully falls back).
- 10.7 Clipboard blocked (deny permission or run in an insecure context) → selectable text fallback appears; no uncaught rejection.
- 10.8 Smoke-10: 10/10. 0 console errors.

---

### QC-11 — Stats, achievements, settings, shortcuts, Konami
**MUST**
- 11.1 Stats: play 1 win, 1 loss, 1 draw vs bot → Logs modal shows correct counts under the right `mode:variant:difficulty` key and totals; current/best streak correct after a 2-win streak then a loss; time played increases only while on the game screen.
- 11.2 Reset data requires a two-tap confirm; afterwards B7 shows only the version key (or defaults).
- 11.3 Achievements: `hello_world` unlocks after the first completed game with a toast + sound, exactly once (second game → no duplicate toast); `night_owl` unlocks on switching to dark; Badges modal shows locked items as `???` with hint and unlocked items in color with a date. Verify at least 5 distinct achievements' triggers.
- 11.4 Settings: every option in BUILD_PROMPT §3.6 item 3 exists, applies live (no reload), and persists (`ttt.settings` in B7). Player names ≤ 12 chars, rendered via `textContent` (enter `<b>x</b>` as a name → displayed literally).
- 11.5 Corrupt storage: `localStorage['ttt.settings']='{oops'` → reload → defaults load, no error, and the bad value is replaced.
- 11.6 Shortcuts: every key in BUILD_PROMPT Appendix E works; `?` opens the Shortcuts modal; keys are ignored while typing in the name inputs.
- 11.7 Konami: keyboard `↑↑↓↓←→←→BA` unlocks the Matrix accent + digital-rain option + `konami` achievement; persisted (`ttt.unlocks`); on touch emulation, 7 logo taps do the same.
- 11.8 Smoke-10: 10/10. 0 console errors.

**SHOULD**
- 11.9 Stats view has a small inline SVG win-rate bar; numbers align; readable on V1.

---

### QC-12 — Modal and cursor robustness, share polish
**MUST**
- 12.1 Popover path (Chrome 114+ / Edge / Safari 17+ / Firefox 125+): open Settings → `.cursor-layer` is `:popover-open`, the cursor dot/ring stay visible over the dialog (screenshot), hovering a dialog button sets the ring hover state, clicks go through (`pointer-events: none` on the layer), and the layer has no border/padding/background.
- 12.2 Fallback path (delete `HTMLElement.prototype.showPopover` via an init script before load): opening a modal removes `html.has-custom-cursor` (native cursor, `pointer` on dialog buttons); closing it re-activates the custom cursor.
- 12.3 Stacking: with Settings open, opening the confirm dialog (or any second modal) keeps the cursor layer above the newest dialog (`ttt:modal` fires again with `open: true`).
- 12.4 Open/close race: click Settings, press Esc, click Settings again within ~100 ms → the dialog stays open, has no `is-closing` class, and `main` is `inert`.
- 12.5 Focus: close a modal → focus returns to its opener; leave a game via Menu → confirm "Yes, abort" → focus lands on the menu heading (never `<body>`); the confirm promise resolves on the click itself (the menu appears without waiting for the close animation).
- 12.6 Share result (desktop): with a clipboard spy → text copied and toast `copied to clipboard`; with the clipboard rejecting → fallback textarea shown, text selected and focused. Touch emulation with a `navigator.share` spy → `shared ✔`; an `AbortError` from share → no error toast. The text contains no `#` and no `debug` query.
- 12.7 `node --test` passes `tests/share.test.mjs` (result text for bot win/loss/draw and local win/draw, `pageUrl`, Node fallback of `shareText`).
- 12.8 Smoke-10: 10/10. 0 console errors.

---

### QC-13 — PWA
**MUST**
- 13.1 `manifest.webmanifest` validates in DevTools → Application → Manifest (no warnings): `start_url "./"`, `scope "./"`, `display standalone`, icons 192/512/maskable + SVG, name/short_name/theme/background colors.
- 13.2 PNG icons exist and open correctly (`file assets/icons/*.png` or open in browser); OR the documented fallback is in README and `QC_LOG.md` (accepted as S3, not a blocker).
- 13.3 `tools/make-icons.mjs` runs with `node tools/make-icons.mjs` and has zero imports outside `node:` builtins.
- 13.4 SW registered from `./sw.js` with scope ending in `/` (B5): served at root → scope `http://localhost:8080/`; served from the parent → scope `http://localhost:8080/Akshays_Project/`.
- 13.5 Offline: load once → DevTools Network "Offline" → reload → the app loads and a full game vs bot works; no failed requests except optional analytics-free noise (there must be none).
- 13.6 Precache list uses relative URLs only (`grep -n "'/" sw.js` and `grep -n '"/' sw.js` → nothing); `CACHE_VERSION` constant present; old caches deleted on activate (`caches.keys()` after a version bump shows one cache).
- 13.7 Update flow: bump `CACHE_VERSION`, reload → toast `update available — reload` → click → new version active (verify via footer `APP_VERSION` or a visible change).
- 13.8 Install: on Chrome desktop/Android the Install button appears when eligible and hides after install (`appinstalled`); iOS metas present (`apple-mobile-web-app-capable`, status bar style, `apple-touch-icon`).
- 13.9 SW is NOT registered on `file://` or plain `http://` non-localhost (code check).
- 13.10 Sub-path simulation: `http://localhost:8080/Akshays_Project/` → Network tab shows zero 404s for CSS/JS/icons/manifest/sw.
- 13.11 Real device R1 over LAN (`http://<laptop-ip>:8080/`, note SW requires https/localhost so only manifest/layout is verified here) → no errors.
- 13.12 Smoke-10: 10/10. 0 console errors.

---

### QC-14 — Accessibility, performance, cross-device
**MUST**
- 14.1 Lighthouse (mobile, incognito, served from localhost): Performance ≥ 90, Accessibility ≥ 95, Best Practices ≥ 95, SEO ≥ 90, PWA installable. Record all numbers.
- 14.2 axe or Lighthouse a11y: 0 serious/critical issues.
- 14.3 Keyboard: complete a game vs bot, open/close every modal, change 3 settings — mouse never used; focus always visible; focus restored after modals close.
- 14.4 Screen reader (NVDA/VoiceOver or at least inspecting `aria-live` text): turn changes, placements, and results are announced; cell labels are correct.
- 14.5 Marks are distinguishable by shape in every symbol pack (color is never the only signal).
- 14.6 Text zoom 200% (browser zoom) at V8 → no overlap, board still fits; V1 at 100% → all controls reachable.
- 14.7 Viewport matrix V1–V9: B1 false everywhere; board square; HUD readable; no clipped buttons; landscape V5 side-by-side.
- 14.8 Real device R1 (Android Chrome and/or iOS Safari): no double-tap zoom, no 300 ms delay, no rubber-band breaking layout, address-bar show/hide does not shift the board (dvh), safe-area padding present on notched phones, haptics fire on Android.
- 14.9 Firefox and Edge desktop: play a full game each; 0 console errors.
- 14.10 Robustness: rapid double-tap on one cell places exactly one mark; resize during animations → no error; simulate private mode by making `localStorage.setItem` throw (`Object.defineProperty(window,'localStorage',{get(){throw new Error('blocked')}})` before load via a snippet/override) → app runs from memory with a non-blocking notice or silently.
- 14.11 Budgets: C6 → JS ≤ 150 KB, CSS ≤ 80 KB, icons ≤ 40 KB; first load ≤ 400 KB (Network tab, disable cache).
- 14.12 10-minute manual session touching every feature → 0 console errors/warnings.
- 14.13 Smoke-10: 10/10. Tests green.

---

### QC-15 — Docs, cleanup, deploy-readiness
**MUST**
- 15.1 README contains every section from BUILD_PROMPT Step 15 including the exact GitHub Pages steps, the `CACHE_VERSION` bump reminder, troubleshooting, run-locally and test commands, controls table, and the project structure.
- 15.2 A non-developer read-through: the deploy instructions can be followed with no prior knowledge (QC states any ambiguity as S3).
- 15.3 `APP_VERSION` = `1.0.0` visible in the footer; `CACHE_VERSION` = `ttt-v1.0.0` in `sw.js`.
- 15.4 Cleanup: C4 OK (no stray logs), no TODO/FIXME (`grep -rn 'TODO\|FIXME' js css index.html` → nothing), no commented-out code blocks, no unused files (each file in §4.1 is referenced or documented).
- 15.5 Fresh-copy test: copy the folder to a new location, serve the parent, open `/<copy-name>/` → works with 0 console errors, SW scope correct, offline works after first load.
- 15.6 `QC_LOG.md` shows every step 0–15 as PASS with dates; all S3/S4 defects closed.
- 15.7 Static checks C1–C7 all OK. Tests green.

---

## 5. FINAL RELEASE QC (run once after QC-15 PASS; this is the ship gate)

**MUST — all of these:**
- F1 Static: C1–C7 OK; `.nojekyll` present; no absolute paths; no external runtime URLs; no libraries; no build files.
- F2 Sub-path simulation (`/Akshays_Project/`): zero 404s, SW scope correct, manifest OK, offline reload works.
- F3 Full feature walk (desktop Chrome + one real phone): Vs Bot easy/medium/hard; Local 2P; Classic/Infinity/Blitz/Misère; theme toggle + system; accents; symbol packs; cursor (desktop only); sound + mute; haptics; undo; hint; stats; badges; settings; shortcuts; Konami; share; install; update toast.
- F4 Hard bot: exhaustive tests green + 5 manual games → 0 human wins in Classic and Misère.
- F5 Lighthouse mobile: Perf ≥ 90, A11y ≥ 95, BP ≥ 95, SEO ≥ 90, installable.
- F6 Viewport matrix V1–V9 + R1: no overflow, no clipped controls, tap targets ≥ 44 px.
- F7 Reduced motion: decorative animation off, game playable.
- F8 0 console errors/warnings in a 15-minute session across Chrome, Firefox, Edge, and the phone.
- F9 Tests: `node --test` green; assertion count reported.
- F10 README deploy steps verified by reading; version strings set; `QC_LOG.md` complete.

**Release verdict:** SHIP only if F1–F10 all PASS. Otherwise produce defects `D-F-nn`, send back to the builder, and re-run the full Final Release QC after fixes.

---

## 6. QC_LOG.md row format (the QC model appends this)
```
| N | PASS or FAIL | YYYY-MM-DD | <one-line summary> | D-N-01, D-N-02 | <fix summary or "—"> |
```

## 7. Common failure modes and fix hints (for the builder)
- **Blank page on GitHub Pages** → an absolute path (`/js/main.js`) or a missing `.nojekyll`; use `./` everywhere and keep `sw.js` at the root.
- **Theme flash on load** → the head inline script is missing, placed after the stylesheets, or uses a different storage key than `theme.js`.
- **Custom cursor visible on phone** → activation must gate on `(hover: hover) and (pointer: fine)` and listen for media `change`.
- **Horizontal scroll at 320 px** → a fixed-width element, an un-wrapped toolbar, or `100vw` combined with padding; use `min()`/`clamp()` and `overflow-x: clip` on the shell as a last resort.
- **Sound not playing on iOS** → `AudioContext` must be created/resumed inside a user-gesture handler.
- **SW never updates** → `CACHE_VERSION` not bumped, or `index.html` served cache-first; use network-first for the HTML.
- **Hard bot loses** → wrong terminal scores (must include depth), wrong player perspective in recursion, or Misère not inverted.
- **Blitz timer drifts** → drive by `performance.now()` deltas, not by counting intervals; pause on `visibilitychange`.
- **Focus lost after modal closes** → store the opener element and `.focus()` it on close.
