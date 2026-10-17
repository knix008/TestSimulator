// Start page: a moving 3D landscape, with buttons for the things the app can do.
// Laid out like MyCAD's start page — a column of ways to begin, then a grid of tasks.
import { getLanguage, onLanguageChange, t } from '../i18n.js';
import { app } from '../store.js';
import { clear, h } from './dom.js';
import { icon } from './icons.js';
import { StartBackground } from './startbg.js';
import { CHANNEL_DEFAULT, CHANNEL_MAX, channelPercent, START_SCENE_IDS, START_SPEED_CHANNELS, startSceneId, startSpeedPercent, startTransparency } from './startscenes.js';

const TIP_COUNT = 7;

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
  }, t(`start.scene.${id}`)));
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
    const group = (id, glyph, title, ...nodes) => h('section.start-group', { dataset: { group: id } },
      h('h2', h('span', { html: icon(glyph) }), h('span', title)), ...nodes);
    const board = h('div.start-board',
      group('begin', 'play', t('start.begin'), h('div.start-actions', begin)),
      group('tasks', 'grid', t('start.tasks'), h('div.task-grid', tasks)),
      group('recent', 'clock', t('start.recent'),
        recentItems.length ? h('ul.recent-list', recentItems) : h('p.start-muted', t('start.noRecent')),
        tipCard(tip)),
      group('scenes', 'image', t('start.background'),
        createStartScenes(scene, (id) => {
          app.settings.startScreen = { ...(app.settings.startScreen ?? {}), scene: id };
          app.saveSettings();
        }),
        createStartSpeed(screen, (values) => {
          app.settings.startScreen = { ...(app.settings.startScreen ?? {}), ...values };
          app.saveSettings();
        })));
    clear(scroll);
    scroll.append(h('div.start',
      h('header.start-head',
        h('span.start-logo', { html: icon('images') }),
        h('div', h('h1', 'MyPhotoManager'), h('p', t('start.lead')))),
      board));
    scroll.lang = getLanguage();
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
