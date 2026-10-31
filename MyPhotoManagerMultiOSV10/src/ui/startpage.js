// Start page: a moving 3D landscape, with buttons for the things the app can do.
// Laid out like MyCAD's start page — a column of ways to begin, then a grid of tasks.
import { getLanguage, onLanguageChange, t } from '../i18n.js';
import { app } from '../store.js';
import { clear, h } from './dom.js';
import { icon } from './icons.js';
import { StartBackground } from './startbg.js';
import { autoArrange, cardsOf, COLS, GAP, layoutText, place, ROW, rowsFor, START_CARDS, swapVertical } from './startlayout.js';
import { CHANNEL_DEFAULT, CHANNEL_MAX, channelPercent, START_SCENE_IDS, START_SPEED_CHANNELS, startSceneId, startSpeedPercent, startTransparency } from './startscenes.js';

const TIP_COUNT = 7;

/** Start page cards (startlayout.js START_CARDS): icon and title. */
const CARD_INFO = {
  begin: ['play', 'start.begin'],
  browse: ['grid', 'start.group.browse'],
  edit: ['pencil', 'start.group.edit'],
  tools: ['wand', 'start.group.tools'],
  recent: ['clock', 'start.recent'],
  tip: ['starFill', 'start.tipTitle'],
  scenes: ['image', 'start.background'],
  speeds: ['sliders', 'start.speedTitle'],
};

/** Which card each task button sits on. */
const TASK_GROUP = {
  manage: 'browse', view: 'browse', dashboard: 'browse', search: 'browse', folders: 'browse', calendar: 'browse', people: 'browse', map: 'browse',
  edit: 'edit', cutout: 'edit', panorama: 'edit', gif: 'edit', pdf: 'edit', hdr: 'edit',
  slideshow: 'tools', print: 'tools', compare: 'tools', duplicates: 'tools', batch: 'tools', organize: 'tools',
};

const TASKS = [
  ['manage', 'grid', 'mode.manage'],
  ['view', 'eye', 'mode.view'],
  ['edit', 'pencil', 'mode.edit'],
  ['cutout', 'cutout', 'edit.background'],
  ['dashboard', 'chart', 'mode.dashboard'],
  ['search', 'search', 'pane.search'],
  ['folders', 'folder', 'pane.folders'],
  ['calendar', 'calendar', 'pane.calendar'],
  ['people', 'user', 'pane.people'],
  ['map', 'map', 'pane.map'],
  ['slideshow', 'play', 'view.slideshow'],
  ['print', 'print', 'file.print'],
  ['compare', 'compare', 'tools.compare'],
  ['duplicates', 'layers', 'tools.duplicates'],
  ['panorama', 'images', 'create.panorama'],
  ['gif', 'filmstrip', 'create.gif'],
  ['pdf', 'file', 'create.pdf'],
  ['hdr', 'sun', 'create.hdr'],
  ['batch', 'rename', 'tools.batchRename'],
  ['organize', 'wand', 'analysis.toFolders'],
];

function folderLabel(path) {
  const clean = String(path).replace(/^@\d+:/, '');
  const parts = clean.split(/[\\/]/).filter(Boolean);
  return parts.at(-1) || clean;
}

/** Background names. `onPick` receives the scene id. */
export function createStartScenes(selected, onPick) {
  const buttons = START_SCENE_IDS.map((id) => h('button.start-scene', {
    type: 'button',
    dataset: { scene: id },
  }, h('span.start-scene-icon', { html: icon(`scene.${id}`) }), h('span.start-scene-name', t(`start.scene.${id}`))));
  const paint = (id) => {
    for (const button of buttons) {
      const on = button.dataset.scene === id;
      button.classList.toggle('on', on);
      button.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  };
  for (const button of buttons) button.addEventListener('click', () => {
    paint(button.dataset.scene);
    onPick(button.dataset.scene);
  });
  paint(startSceneId(selected));
  return h('div.start-scenes', buttons);
}

/** One speed row: label, − / + and a short bar. `onPick` receives the new percent (0–max). */
function speedRow({ key, label, value, max, step, onPick }) {
  let speed = value;
  const fill = h('span.start-speed-fill');
  const thumb = h('span.start-speed-thumb');
  const text = h('span.start-speed-value');
  const track = h('div.start-speed-track', {
    role: 'slider',
    tabindex: '0',
    'aria-valuemin': '0',
    'aria-valuemax': String(max),
    'aria-label': label,
  }, fill, thumb, text);
  const minus = h('button.start-speed-step', { type: 'button', 'aria-label': `${label} ${t('start.speedDown')}`, title: t('start.speedDown') }, '−');
  const plus = h('button.start-speed-step', { type: 'button', 'aria-label': `${label} ${t('start.speedUp')}`, title: t('start.speedUp') }, '+');
  const paint = () => {
    const ratio = `${(speed / max) * 100}%`;
    fill.style.width = ratio;
    thumb.style.left = ratio;
    text.textContent = `${speed}%`;
    track.setAttribute('aria-valuenow', String(speed));
    minus.disabled = speed <= 0;
    plus.disabled = speed >= max;
  };
  const clamp = (n) => Math.max(0, Math.min(max, Math.round(Number(n) || 0)));
  const set = (next) => {
    const n = clamp(next);
    if (n === speed) return;
    speed = n;
    paint();
    onPick(speed);
  };
  minus.addEventListener('click', () => set(speed - step));
  plus.addEventListener('click', () => set(speed + step));
  const fromPointer = (event) => {
    const rect = track.getBoundingClientRect();
    const ratio = rect.width ? (event.clientX - rect.left) / rect.width : 0;
    set(Math.round((Math.max(0, Math.min(1, ratio)) * max) / step) * step);
  };
  track.addEventListener('pointerdown', (event) => {
    track.setPointerCapture(event.pointerId);
    fromPointer(event);
  });
  track.addEventListener('pointermove', (event) => {
    if (track.hasPointerCapture(event.pointerId)) fromPointer(event);
  });
  track.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') { event.preventDefault(); set(speed - step); }
    else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') { event.preventDefault(); set(speed + step); }
    else if (event.key === 'Home') { event.preventDefault(); set(0); }
    else if (event.key === 'End') { event.preventDefault(); set(max); }
  });
  paint();
  const el = h('div.start-speed', { dataset: { speed: key } },
    h('span.start-speed-label', label),
    h('div.start-speed-control', minus, track, plus));
  el.setValue = (n) => {
    speed = clamp(n);
    paint();
  };
  return el;
}

/** The transparency and speeds of a `startScreen` setting, each in range. */
export function startSpeedValues(screen = {}) {
  const out = { transparency: startTransparency(screen.transparency), motion: startSpeedPercent(screen.motion) };
  for (const channel of START_SPEED_CHANNELS) out[channel.key] = channelPercent(screen[channel.key]);
  return out;
}

/** Speeds for a fresh start: the designed pace for everything. */
export function defaultStartSpeeds() {
  const out = { motion: 20 };
  for (const channel of START_SPEED_CHANNELS) out[channel.key] = CHANNEL_DEFAULT;
  return out;
}

/**
 * The background transparency, the overall speed, one row per clock (camera, objects, sky), and a
 * button that resets the speeds. `onPick(values)` receives every value after any change. `el.sync(screen)` repaints from settings.
 */
export function createStartSpeed(screen, onPick) {
  let values = startSpeedValues(screen);
  const rows = [
    speedRow({ key: 'transparency', label: t('start.transparency'), value: values.transparency, max: 100, step: 5, onPick: (n) => { values = { ...values, transparency: n }; onPick(values); } }),
    speedRow({ key: 'motion', label: t('settings.startMotion'), value: values.motion, max: 100, step: 5, onPick: (n) => { values = { ...values, motion: n }; onPick(values); } }),
    ...START_SPEED_CHANNELS.map((channel) => speedRow({
      key: channel.key, label: t(channel.label), value: values[channel.key], max: CHANNEL_MAX, step: 10,
      onPick: (n) => { values = { ...values, [channel.key]: n }; onPick(values); },
    })),
  ];
  const sync = (next) => {
    values = startSpeedValues(next);
    for (const row of rows) row.setValue(values[row.dataset.speed]);
  };
  const reset = h('button.start-speed-reset', {
    type: 'button',
    onclick: () => {
      sync({ ...values, ...defaultStartSpeeds() });
      onPick(values);
    },
  }, t('start.speedReset'));
  const el = h('div.start-speeds', rows, reset);
  el.sync = sync;
  return el;
}

function actionCard(glyph, title, text, run, primary = false, id) {
  return h('button.action-card', {
    type: 'button',
    id,
    title,
    dataset: primary ? { primary: '' } : {},
    onclick: run,
  }, h('span.action-icon', { html: icon(glyph) }), h('span.action-text', h('b', title), h('small', text)));
}

/** One daily tip. The short line stays visible; More opens the longer explanation. */
function tipCard(index) {
  const more = h('p.start-tip-more', { hidden: true }, t(`start.tip.${index}.more`));
  const label = h('span.start-tip-more-label', t('start.tipMore'));
  const toggle = h('button.start-tip-toggle', {
    type: 'button',
    'aria-expanded': 'false',
    onclick: () => {
      const open = more.hidden;
      more.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
      label.textContent = t(open ? 'start.tipLess' : 'start.tipMore');
    },
  }, h('span', { html: icon('starFill') }), h('span.start-tip-text', h('b', `${t('start.tip')} `), t(`start.tip.${index}`)), label);
  return h('div.start-tip', toggle, more);
}

/**
 * ctx(): { recent: string[], showSamples: boolean, actions: Record<string, () => void> }
 */
export function createStartPage(ctx) {
  const bgHost = h('div.start-bg');
  const scroll = h('div.start-scroll');
  const el = h('div.start-page', bgHost, scroll);
  const bg = new StartBackground(bgHost);
  let stopLang = null;

  let stamp = '';
  let shown = false;

  function render() {
    const { recent, showSamples, actions } = ctx();
    const key = `${getLanguage()}|${showSamples ? 1 : 0}|${recent.slice(0, 8).join('\n')}`;
    if (key === stamp && scroll.childElementCount) return;
    stamp = key;
    const tip = Math.floor(Date.now() / 86400000) % TIP_COUNT;
    const begin = [
      actionCard('help', t('tut.menu'), t('tut.startText'), actions.tutorial, false, 'start-tutorial'),
      actionCard('folderOpen', t('file.openFolder'), t('start.openFolderText'), actions.openFolder, true, 'start-open-folder'),
      actionCard('images', t(showSamples ? 'web.openFiles' : 'file.openFiles'), t('start.openFilesText'), actions.openFiles, false, 'start-open-files'),
      actionCard('download', t('import.title'), t('start.importText'), actions.import),
      actionCard('play', t('view.slideshow'), t('start.slideshowText'), actions.slideshow),
      actionCard('gear', t('menu.settings'), t('start.settingsText'), actions.settings),
      actionCard('keyboard', t('shortcuts.title'), t('start.shortcutsText'), actions.shortcuts),
    ];
    const recentItems = recent.slice(0, 8).map((path) => h('li.recent-item', {
      title: path.replace(/^@\d+:/, ''),
      onclick: () => actions.recent(path),
    }, h('span', { html: icon('folder') }), h('span.recent-name', folderLabel(path))));
    const tasks = TASKS.map(([id, glyph, label]) => h('button.task-card', {
      type: 'button',
      dataset: { task: id },
      title: t(label),
      onclick: () => actions[id]?.(),
    }, h('span.task-icon', { html: icon(glyph) }), h('span.task-text', h('b', t(label)), h('small', t(`start.desc.${id}`)))));
    const screen = app.settings.startScreen ?? {};
    const scene = startSceneId(screen.scene);
    const tasksOf = (group) => h('div.task-grid', tasks.filter((card) => TASK_GROUP[card.dataset.task] === group));
    const body = {
      begin: h('div.start-actions', begin),
      browse: tasksOf('browse'),
      edit: tasksOf('edit'),
      tools: tasksOf('tools'),
      recent: recentItems.length ? h('ul.recent-list', recentItems) : h('p.start-muted', t('start.noRecent')),
      tip: tipCard(tip),
      scenes: createStartScenes(scene, (id) => {
        app.settings.startScreen = { ...(app.settings.startScreen ?? {}), scene: id };
        app.saveSettings();
      }),
      speeds: createStartSpeed(screen, (values) => {
        app.settings.startScreen = { ...(app.settings.startScreen ?? {}), ...values };
        app.saveSettings();
      }),
    };
    board = h('div.start-board');
    cards = {};
    for (const id of START_CARDS) {
      const [glyph, label] = CARD_INFO[id];
      const handle = h('button.card-handle', {
        type: 'button', title: `${t('start.moveCard')} (Alt+←↑↓→ · Alt+Shift: ${t('start.resizeCard')})`, 'aria-label': t('start.moveCard'),
        onpointerdown: (event) => startMove(event, id), onkeydown: (event) => keyMove(event, id),
      }, '⠿');
      cards[id] = h('section.start-card', { dataset: { card: id } },
        h('h2', handle, h('span.card-icon', { html: icon(glyph) }), h('span', t(label))),
        h('div.card-body', body[id]),
        h('span.card-resize', { title: `${t('start.resizeCard')} (Alt+Shift+←↑↓→)`, onpointerdown: (event) => startResize(event, id), ondblclick: () => saveLayout(place(saved(), id, { fit: true })) }));
      board.append(cards[id]);
    }
    outline = h('div.card-drop-outline', { 'aria-hidden': 'true', hidden: true });
    board.append(outline);
    const showBox = h('input', { type: 'checkbox', id: 'start-show-on-launch', checked: screen.showOnLaunch !== false });
    showBox.addEventListener('change', () => {
      app.settings.startScreen = { ...(app.settings.startScreen ?? {}), showOnLaunch: showBox.checked };
      app.saveSettings();
    });
    clear(scroll);
    scroll.append(h('div.start',
      h('header.start-head',
        h('span.start-logo', { html: icon('images') }),
        h('div.start-head-text', h('h1', 'MyPhotoManager'), h('p', t('start.lead'))),
        h('div.start-head-tools',
          h('label.check.start-show', showBox, t('start.showOnLaunch')),
          h('button.start-auto-arrange', { type: 'button', id: 'start-auto-arrange', title: t('start.autoArrangeTip'), onclick: () => saveLayout(autoArrange(measured)) }, h('span', { html: icon('grid') }), t('start.autoArrange')))),
      board));
    observer?.disconnect();
    observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => measure()) : null;
    for (const card of Object.values(cards)) observer?.observe(card);
    layoutBoard();
    scroll.lang = getLanguage();
  }

  // ───────── card layout (startlayout.js): a 3-column grid of 20 px rows. Cards move by
  // the ⠿ handle (or Alt+arrows), resize by the corner grip (Alt+Shift+arrows); a double
  // click on the grip fits the height to the content. Auto arrange packs them again.

  let board = null;
  let cards = {};
  let outline = null;
  let observer = null;
  let measured = {};
  let drag = null; // { id, mode: 'move' | 'resize', target }
  let rects = new Map();
  const burst = { at: 0, n: 0 };
  const saved = () => cardsOf(app.settings.startScreen?.layout, measured);

  function saveLayout(next) {
    app.settings.startScreen = { ...(app.settings.startScreen ?? {}), layout: layoutText(next) };
    layoutBoard();
    app.saveSettings();
  }

  const cell = (c) => ({ gridColumn: `${c.col + 1} / span ${c.w}`, gridRow: `${c.row + 1} / span ${c.h}` });

  function layoutBoard() {
    if (!board) return;
    const base = saved();
    const shown = drag?.target ? place(base, drag.id, drag.target) : base;
    for (const id of START_CARDS) {
      const card = cards[id];
      const mine = drag?.id === id;
      const c = mine ? base[id] : shown[id];
      Object.assign(card.style, cell(c), { height: c.fit ? '' : `${c.h * ROW - GAP}px` });
      card.classList.toggle('fit', c.fit);
      card.classList.toggle('fixed-height', !c.fit);
      card.classList.toggle('drag-origin', mine && drag.mode === 'move');
      card.classList.toggle('resizing', mine && drag.mode === 'resize');
    }
    outline.hidden = !drag?.target;
    if (drag?.target) Object.assign(outline.style, cell(shown[drag.id]), { height: `${shown[drag.id].h * ROW - GAP}px` });
    // The other cards slide to their new places.
    const now = new Map();
    for (const id of START_CARDS) {
      const card = cards[id];
      const r = card.getBoundingClientRect();
      now.set(id, r);
      const old = rects.get(id);
      if (!old || card.classList.contains('drag-origin') || !card.animate || !r.width) continue;
      const dx = old.left - r.left;
      const dy = old.top - r.top;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) card.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }], { duration: 180, easing: 'ease-out' });
    }
    rects = now;
  }

  /** Fit cards: the height follows the content (in rows). Growing always applies; shrinking by one row does not (no flip-flop). */
  function measure() {
    if (!board?.isConnected) return;
    const next = {};
    for (const id of START_CARDS) if (cards[id].classList.contains('fit') && cards[id].offsetHeight) next[id] = rowsFor(cards[id].offsetHeight);
    const changed = Object.keys(next).filter((k) => measured[k] === undefined || next[k] > measured[k] || measured[k] - next[k] > 1);
    if (!changed.length) return;
    const now = performance.now();
    if (now - burst.at > 1000) Object.assign(burst, { at: now, n: 0 });
    if (burst.n++ > 12) return;
    for (const k of changed) measured[k] = next[k];
    layoutBoard();
  }

  const cellAt = (x, y, w) => {
    const r = board.getBoundingClientRect();
    const colW = (r.width - GAP * (COLS - 1)) / COLS;
    return { col: Math.max(0, Math.min(COLS - w, Math.round((x - r.left) / (colW + GAP)))), row: Math.max(0, Math.round((y - r.top) / ROW)) };
  };
  const autoScroll = (event) => {
    const r = scroll.getBoundingClientRect();
    if (event.clientY > r.bottom - 36) scroll.scrollTop += 14;
    else if (event.clientY < r.top + 36) scroll.scrollTop -= 14;
  };
  /** Follows the pointer until it is released. */
  function follow(move, up) {
    const onMove = (event) => move(event);
    const onUp = (event) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      up(event);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }

  function startMove(event, id) {
    if (event.button !== 0) return;
    event.preventDefault();
    const card = cards[id];
    const rect = card.getBoundingClientRect();
    const offX = event.clientX - rect.left;
    const offY = event.clientY - rect.top;
    // A see-through copy of the card follows the pointer; the dashed outline shows where it lands.
    const ghost = card.cloneNode(true);
    ghost.classList.add('drag-ghost');
    ghost.removeAttribute('data-card');
    for (const n of ghost.querySelectorAll('[id]')) n.removeAttribute('id');
    Object.assign(ghost.style, { position: 'fixed', left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`, gridColumn: 'auto', gridRow: 'auto', margin: '0' });
    document.body.append(ghost);
    const c = saved()[id];
    let target = { col: c.col, row: c.row };
    drag = { id, mode: 'move', target };
    layoutBoard();
    follow((ev) => {
      ghost.style.left = `${ev.clientX - offX}px`;
      ghost.style.top = `${ev.clientY - offY}px`;
      autoScroll(ev);
      const next = cellAt(ev.clientX - offX, ev.clientY - offY, c.w);
      if (next.col !== target.col || next.row !== target.row) { target = next; drag = { id, mode: 'move', target }; layoutBoard(); }
    }, (ev) => {
      ghost.remove();
      drag = null;
      if (ev.type === 'pointerup' && (target.col !== c.col || target.row !== c.row)) saveLayout(place(saved(), id, target));
      else layoutBoard();
    });
  }

  function startResize(event, id) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = cards[id].getBoundingClientRect();
    const b = board.getBoundingClientRect();
    const colW = (b.width - GAP * (COLS - 1)) / COLS;
    const c = saved()[id];
    let target = { w: c.w, h: c.h };
    drag = { id, mode: 'resize', target: null };
    layoutBoard();
    follow((ev) => {
      autoScroll(ev);
      const w = Math.max(1, Math.min(COLS - c.col, Math.round((rect.width + ev.clientX - event.clientX + GAP) / (colW + GAP))));
      const hgt = Math.max(4, Math.round((rect.height + ev.clientY - event.clientY + GAP) / ROW));
      if (w !== target.w || hgt !== target.h) { target = { w, h: hgt }; drag = { id, mode: 'resize', target: { ...target, fit: false } }; layoutBoard(); }
    }, (ev) => {
      drag = null;
      if (ev.type === 'pointerup' && (target.w !== c.w || target.h !== c.h)) saveLayout(place(saved(), id, { ...target, fit: false }));
      else layoutBoard();
    });
  }

  /** Alt+arrows on the ⠿ handle move a card one cell; Alt+Shift+arrows resize it. */
  function keyMove(event, id) {
    if (!event.altKey || !event.key.startsWith('Arrow')) return;
    event.preventDefault();
    event.stopPropagation();
    const base = saved();
    const c = { ...base[id] };
    const dx = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
    const dy = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
    if (event.shiftKey) {
      c.w = Math.max(1, Math.min(COLS - c.col, c.w + dx));
      if (dy) { c.h = Math.max(4, c.h + dy); c.fit = false; }
      saveLayout(place(base, id, c));
    } else if (dy) {
      saveLayout(swapVertical(base, id, dy));
    } else {
      c.col = Math.max(0, Math.min(COLS - c.w, c.col + dx));
      saveLayout(place(base, id, c));
    }
    cards[id].querySelector('.card-handle').focus();
  }

  function markBackground() {
    const screen = app.settings.startScreen ?? {};
    const scene = startSceneId(screen.scene);
    for (const button of scroll.querySelectorAll('.start-scene')) {
      const on = button.dataset.scene === scene;
      button.classList.toggle('on', on);
      button.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    scroll.querySelector('.start-speeds')?.sync(screen);
    const showBox = scroll.querySelector('#start-show-on-launch');
    if (showBox) showBox.checked = screen.showOnLaunch !== false;
  }

  return {
    el,
    show() {
      shown = true;
      render();
      bg.show();
      stopLang?.();
      stopLang = onLanguageChange(render);
      if (!this.settingsWatch) {
        this.settingsWatch = true;
        app.on('settings', () => { if (shown) { render(); markBackground(); } });
      }
    },
    /** Build the buttons and compile the landscape before the user asks for the page. */
    warm() {
      render();
      bg.prewarm();
    },
    hide() {
      shown = false;
      bg.hide();
      stopLang?.();
      stopLang = null;
    },
  };
}
