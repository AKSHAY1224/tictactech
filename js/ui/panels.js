// ui/panels.js — Settings, Stats and Badges modal content (DOM rendering + bindings)
import { ACHIEVEMENTS } from '../features/achievements.js';
import { winRate, formatDuration } from '../features/stats.js';
import { NAME_MAX } from '../state/store.js';

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

/**
 * Settings schema. `ctx.matrix` reveals the Konami-locked options.
 * @param {{ matrix: boolean }} ctx
 */
function schema(ctx) {
  return [
    { section: 'appearance' },
    { key: 'theme', label: 'Theme', type: 'radio', options: [['dark', 'Dark'], ['light', 'Light'], ['system', 'System']] },
    { key: 'accent', label: 'Accent', type: 'radio', options: [['neon', 'Neon'], ['synthwave', 'Synthwave'], ...(ctx.matrix ? [['matrix', 'Matrix']] : [])] },
    { key: 'symbols', label: 'Symbol pack', type: 'select', options: [['code', 'Code  </>  { }'], ['binary', 'Binary  1  0'], ['classic', 'Classic  X  O'], ['circuit', 'Circuit  chip  bolt']] },
    { key: 'scanlines', label: 'Scanlines', type: 'select', options: [['auto', 'Auto (dark theme only)'], ['on', 'On'], ['off', 'Off']] },
    { key: 'background', label: 'Background animation', type: 'toggle' },
    ...(ctx.matrix ? [{ key: 'backgroundStyle', label: 'Background style', type: 'select', options: [['network', 'Circuit network'], ['rain', 'Digital rain']] }] : []),
    { section: 'players' },
    { key: 'names.user', label: 'Your name (vs BOT.exe)', type: 'text' },
    { key: 'names.1', label: 'Player 1 name (Local 2P)', type: 'text' },
    { key: 'names.2', label: 'Player 2 name (Local 2P)', type: 'text' },
    { key: 'firstMove', label: 'Who goes first (vs BOT.exe)', type: 'select', options: [['you', 'You'], ['bot', 'BOT.exe'], ['alternate', 'Alternate'], ['random', 'Random']] },
    { key: 'blitzSeconds', label: 'Blitz seconds per move', type: 'radio', options: [[3, '3 s'], [5, '5 s'], [10, '10 s']] },
    { section: 'feedback' },
    { key: 'sound', label: 'Sound', type: 'toggle' },
    { key: 'haptics', label: 'Haptics (vibration)', type: 'toggle' },
    { key: 'cursor', label: 'Cursor effects (desktop)', type: 'toggle' },
    { key: 'cursorTrail', label: 'Cursor trail', type: 'toggle' },
    { key: 'reducedMotion', label: 'Reduce motion', type: 'toggle' },
  ];
}

const getPath = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);

/**
 * Render the settings form into `host` and bind changes.
 * @param {HTMLElement} host
 * @param {object} settings
 * @param {{ matrix: boolean }} ctx
 * @param {{ onChange: (key: string, value: any) => void, onReset: () => void }} handlers
 */
export function renderSettings(host, settings, ctx, handlers) {
  host.replaceChildren();
  const form = el('div', 'settings');
  let uid = 0;
  for (const item of schema(ctx)) {
    if (item.section) { form.appendChild(el('h4', 'settings__section mono', `// ${item.section}`)); continue; }
    const row = el('div', 'field');
    const id = `set-${item.key.replace('.', '-')}-${uid++}`;
    const current = getPath(settings, item.key);
    if (item.type === 'toggle') {
      const label = el('label', 'switch');
      label.htmlFor = id;
      const input = el('input');
      input.type = 'checkbox';
      input.id = id;
      input.setAttribute('role', 'switch');
      input.checked = !!current;
      input.addEventListener('change', () => handlers.onChange(item.key, input.checked));
      label.append(input, el('span', 'switch__track'), el('span', 'switch__label', item.label));
      row.appendChild(label);
    } else if (item.type === 'text') {
      const label = el('label', 'field__label', item.label);
      label.htmlFor = id;
      const input = el('input', 'field__input mono');
      input.type = 'text';
      input.id = id;
      input.maxLength = NAME_MAX;
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.value = String(current ?? '');
      input.addEventListener('change', () => handlers.onChange(item.key, input.value));
      row.append(label, input);
    } else if (item.type === 'select') {
      const label = el('label', 'field__label', item.label);
      label.htmlFor = id;
      const select = el('select', 'field__input mono');
      select.id = id;
      for (const [value, text] of item.options) {
        const o = el('option', '', text);
        o.value = String(value);
        o.selected = String(current) === String(value);
        select.appendChild(o);
      }
      select.addEventListener('change', () => handlers.onChange(item.key, select.value));
      row.append(label, select);
    } else if (item.type === 'radio') {
      const fs = el('fieldset', 'segmented segmented--compact');
      fs.appendChild(el('legend', 'segmented__legend mono', item.label));
      for (const [value, text] of item.options) {
        const opt = el('label', 'segmented__opt');
        const input = el('input');
        input.type = 'radio';
        input.name = id;
        input.value = String(value);
        input.checked = String(current) === String(value);
        input.addEventListener('change', () => { if (input.checked) handlers.onChange(item.key, typeof value === 'number' ? Number(input.value) : input.value); });
        opt.append(input, el('span', 'segmented__label', text));
        fs.appendChild(opt);
      }
      row.appendChild(fs);
    }
    form.appendChild(row);
  }
  // Reset data (two-tap confirm)
  const danger = el('div', 'field field--danger');
  const btn = el('button', 'btn btn--ghost btn--danger', 'Reset all data');
  btn.type = 'button';
  let armed = 0;
  btn.addEventListener('click', () => {
    if (armed && Date.now() - armed < 3000) { armed = 0; btn.textContent = 'Reset all data'; handlers.onReset(); return; }
    armed = Date.now();
    btn.textContent = 'Tap again to confirm';
    setTimeout(() => { if (armed) { armed = 0; btn.textContent = 'Reset all data'; } }, 3000);
  });
  danger.append(el('p', 'small muted', 'Clears stats, badges and settings on this device.'), btn);
  form.appendChild(danger);
  host.appendChild(form);
}

/**
 * Render the stats panel.
 * @param {HTMLElement} host
 * @param {ReturnType<import('../features/stats.js').emptyStats>} stats
 */
export function renderStats(host, stats) {
  host.replaceChildren();
  const wrap = el('div', 'stats');
  const t = stats.totals;
  const cards = el('div', 'stats__cards');
  for (const [label, value] of [['played', t.played], ['won', t.won], ['lost', t.lost], ['draw', t.draw]]) {
    const c = el('div', 'stat');
    c.append(el('span', 'stat__value mono', String(value)), el('span', 'stat__label', label));
    cards.appendChild(c);
  }
  wrap.appendChild(cards);

  const rate = Math.round(winRate(t) * 100);
  const bar = el('div', 'stats__rate');
  bar.append(el('span', 'small muted', `win rate ${rate}%`));
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 100 6');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('stats__bar');
  const track = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  track.setAttribute('width', '100'); track.setAttribute('height', '6'); track.setAttribute('rx', '3'); track.setAttribute('class', 'stats__bar-track');
  const fill = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  fill.setAttribute('width', String(rate)); fill.setAttribute('height', '6'); fill.setAttribute('rx', '3'); fill.setAttribute('class', 'stats__bar-fill');
  svg.append(track, fill);
  bar.appendChild(svg);
  wrap.appendChild(bar);

  const meta = el('div', 'stats__meta mono small');
  meta.append(
    el('span', '', `streak ${stats.streak.current} · best ${stats.streak.best}`),
    el('span', '', `time played ${formatDuration(stats.timePlayedMs)}`),
  );
  wrap.appendChild(meta);

  const keys = Object.entries(stats.byKey).sort((a, b) => b[1].played - a[1].played);
  if (keys.length) {
    const table = el('table', 'stats__table mono');
    const thead = el('thead');
    const hr = el('tr');
    for (const h of ['mode', 'P', 'W', 'L', 'D']) hr.appendChild(el('th', '', h));
    thead.appendChild(hr);
    const tbody = el('tbody');
    for (const [k, b] of keys) {
      const tr = el('tr');
      const [mode, variant, diff] = k.split(':');
      tr.appendChild(el('td', '', `${mode === 'bot' ? 'vs BOT' : mode} · ${variant}${diff && diff !== '-' ? ` · ${diff}` : ''}`));
      for (const v of [b.played, b.won, b.lost, b.draw]) tr.appendChild(el('td', '', String(v)));
      tbody.appendChild(tr);
    }
    table.append(thead, tbody);
    wrap.appendChild(table);
  } else {
    wrap.appendChild(el('p', 'muted small', 'No games logged yet. Run a session to start the log.'));
  }
  host.appendChild(wrap);
}

/**
 * Render the badges grid.
 * @param {HTMLElement} host
 * @param {ReturnType<import('../features/achievements.js').emptyUnlocks>} unlocks
 */
export function renderBadges(host, unlocks) {
  host.replaceChildren();
  const count = Object.keys(unlocks.unlocked).length;
  host.appendChild(el('p', 'mono small muted', `${count} / ${ACHIEVEMENTS.length} unlocked`));
  const grid = el('ul', 'badges');
  for (const a of ACHIEVEMENTS) {
    const date = unlocks.unlocked[a.id];
    const li = el('li', `badge${date ? '' : ' is-locked'}`);
    li.append(el('span', 'badge__icon', date ? a.icon : '🔒'));
    const body = el('div', 'badge__body');
    body.append(el('span', 'badge__title mono', date ? a.title : '???'), el('span', 'badge__desc small muted', date ? a.desc : a.hint));
    if (date) body.appendChild(el('span', 'badge__date small muted', new Date(date).toLocaleDateString()));
    li.appendChild(body);
    grid.appendChild(li);
  }
  host.appendChild(grid);
}
