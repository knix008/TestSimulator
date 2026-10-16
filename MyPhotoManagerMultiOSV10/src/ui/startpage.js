// Start page: a moving 3D landscape, with buttons for the things the app can do.
// Laid out like MyCAD's start page — a column of ways to begin, then a grid of tasks.
import { getLanguage, onLanguageChange, t } from '../i18n.js';
import { app } from '../store.js';
import { clear, h } from './dom.js';
import { icon } from './icons.js';
import { StartBackground } from './startbg.js';
import { START_SCENE_IDS, startSceneId, startSpeedPercent } from './startscenes.js';

const TIP_COUNT = 6;

const TASKS = [
  ['manage', 'grid', 'mode.manage'],
  ['view', 'eye', 'mode.view'],
  ['edit', 'pencil', 'mode.edit'],
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

/** Speed label, − / + and a short bar, on one line. `onPick` receives 0–100. */
export function createStartSpeed(selected, onPick) {
  let speed = startSpeedPercent(selected);
  const fill = h('span.start-speed-fill');
  const thumb = h('span.start-speed-thumb');
  const value = h('span.start-speed-value');
  const track = h('div.start-speed-track', {
    role: 'slider',
    tabindex: '0',
    'aria-valuemin': '0',
    'aria-valuemax': '100',
    'aria-label': t('settings.startMotion'),
  }, fill, thumb, value);
  const minus = h('button.start-speed-step', { type: 'button', 'aria-label': t('start.speedDown') }, '−');
  const plus = h('button.start-speed-step', { type: 'button', 'aria-label': t('start.speedUp') }, '+');
  const paint = () => {
    fill.style.width = `${speed}%`;
    thumb.style.left = `${speed}%`;
    value.textContent = `${speed}%`;
    track.setAttribute('aria-valuenow', String(speed));
    minus.disabled = speed <= 0;
    plus.disabled = speed >= 100;
  };
  const set = (next) => {
    const n = startSpeedPercent(next);
    if (n === speed) return;
    speed = n;
    paint();
    onPick(speed);
  };
  minus.addEventListener('click', () => set(speed - 5));
  plus.addEventListener('click', () => set(speed + 5));
  const fromPointer = (event) => {
    const rect = track.getBoundingClientRect();
    const ratio = rect.width ? (event.clientX - rect.left) / rect.width : 0;
    set(Math.round(Math.max(0, Math.min(1, ratio)) * 100));
  };
  track.addEventListener('pointerdown', (event) => {
    track.setPointerCapture(event.pointerId);
    fromPointer(event);
  });
  track.addEventListener('pointermove', (event) => {
    if (track.hasPointerCapture(event.pointerId)) fromPointer(event);
  });
  track.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') { event.preventDefault(); set(speed - 5); }
    else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') { event.preventDefault(); set(speed + 5); }
    else if (event.key === 'Home') { event.preventDefault(); set(0); }
    else if (event.key === 'End') { event.preventDefault(); set(100); }
  });
  paint();
  return h('div.start-speed',
    h('span.start-speed-label', t('settings.startMotion')),
    h('div.start-speed-control', minus, track, plus));
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
    const speed = startSpeedPercent(screen.motion);
    const group = (id, glyph, title, ...nodes) => h('section.start-group', { dataset: { group: id } },
      h('h2', h('span', { html: icon(glyph) }), h('span', title)), ...nodes);
    const board = h('div.start-board',
      group('begin', 'play', t('start.begin'), h('div.start-actions', begin)),
      group('tasks', 'grid', t('start.tasks'), h('div.task-grid', tasks)),
      group('recent', 'clock', t('start.recent'),
        recentItems.length ? h('ul.recent-list', recentItems) : h('p.start-muted', t('start.noRecent')),
        h('p.start-tip', h('span', { html: icon('starFill') }), h('span', h('b', `${t('start.tip')} `), t(`start.tip.${tip}`)))),
      group('scenes', 'image', t('start.background'),
        createStartScenes(scene, (id) => {
          app.settings.startScreen = { ...(app.settings.startScreen ?? {}), scene: id };
          app.saveSettings();
        }),
        createStartSpeed(speed, (n) => {
          app.settings.startScreen = { ...(app.settings.startScreen ?? {}), motion: n };
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
    const speed = startSpeedPercent(screen.motion);
    for (const button of scroll.querySelectorAll('.start-scene')) {
      const on = button.dataset.scene === scene;
      button.classList.toggle('on', on);
      button.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    const track = scroll.querySelector('.start-speed-track');
    const fill = scroll.querySelector('.start-speed-fill');
    const thumb = scroll.querySelector('.start-speed-thumb');
    const value = scroll.querySelector('.start-speed-value');
    if (track) track.setAttribute('aria-valuenow', String(speed));
    if (fill) fill.style.width = `${speed}%`;
    if (thumb) thumb.style.left = `${speed}%`;
    if (value) value.textContent = `${speed}%`;
    const steps = scroll.querySelectorAll('.start-speed-step');
    if (steps[0]) steps[0].disabled = speed <= 0;
    if (steps[1]) steps[1].disabled = speed >= 100;
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
