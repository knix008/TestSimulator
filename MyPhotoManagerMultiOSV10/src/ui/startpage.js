// Start page: a moving 3D landscape, with buttons for the things the app can do.
// Laid out like MyCAD's start page — a column of ways to begin, then a grid of tasks.
import { getLanguage, onLanguageChange, t } from '../i18n.js';
import { app } from '../store.js';
import { clear, h } from './dom.js';
import { icon } from './icons.js';
import { StartBackground } from './startbg.js';

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
    const group = (id, glyph, title, ...nodes) => h('section.start-group', { dataset: { group: id } },
      h('h2', h('span', { html: icon(glyph) }), h('span', title)), ...nodes);
    const board = h('div.start-board',
      h('div.start-side',
        group('begin', 'play', t('start.begin'), h('div.start-actions', begin)),
        group('recent', 'clock', t('start.recent'),
          recentItems.length ? h('ul.recent-list', recentItems) : h('p.start-muted', t('start.noRecent')),
          h('p.start-tip', h('span', { html: icon('starFill') }), h('span', h('b', `${t('start.tip')} `), t(`start.tip.${tip}`))))),
      group('tasks', 'grid', t('start.tasks'), h('div.task-grid', tasks)));
    clear(scroll);
    scroll.append(h('div.start',
      h('header.start-head',
        h('span.start-logo', { html: icon('images') }),
        h('div', h('h1', 'MyPhotoManager'), h('p', t('start.lead')))),
      board));
    scroll.lang = getLanguage();
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
        app.on('settings', () => { if (shown) render(); });
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
