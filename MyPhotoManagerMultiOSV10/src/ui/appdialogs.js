// Settings, About and keyboard shortcut dialogs.
import { t } from '../i18n.js';
import { fs } from '../platform/fs.js';
import { invoke, isDesktop } from '../platform/native.js';
import { app, saveCatalogNow } from '../store.js';
import { thumbs } from '../thumbs/thumbs.js';
import { confirmDialog, field, openDialog, selectEl, toast } from './dialog.js';
import { h } from './dom.js';
import { FLAG_EN, FLAG_KO } from './flags.js';
import { icon } from './icons.js';
import { slideshowSettingsFields } from './slideshow.js';
import { themeSelect } from './themepicker.js';

/** Language as a row of buttons — the flag with the language's own name; `.value` is the choice. */
function languageButtons(value) {
  const choices = [['system', icon('monitor'), t('settings.system')], ['ko', FLAG_KO, '한국어'], ['en', FLAG_EN, 'English']];
  const row = h('div.lang-choice', { role: 'radiogroup' });
  const pick = (id) => { row.value = id; for (const b of row.children) { b.classList.toggle('on', b.dataset.lang === id); b.setAttribute('aria-checked', String(b.dataset.lang === id)); } };
  for (const [id, mark, name] of choices) row.append(h('button.lang-button', { type: 'button', role: 'radio', dataset: { lang: id }, onclick: () => pick(id) }, h('span.lang-mark', { html: mark }), h('span', name)));
  pick(choices.some((c) => c[0] === value) ? value : 'system');
  return row;
}

export async function settingsDialog({ onApply }) {
  const s = app.settings;
  const language = languageButtons(s.language);
  const theme = themeSelect(s.theme);
  const check = (value, label) => { const input = h('input', { type: 'checkbox', checked: value }); return { input, el: h('label.check', input, label) }; };
  const hidden = check(s.showHidden, t('settings.showHidden'));
  const allFiles = check(s.showAllFiles, t('settings.showAllFiles'));
  const folders = check(s.showFolders, t('settings.showFolders'));
  const capName = check(s.caption.name, t('settings.captionName'));
  const capSize = check(s.caption.size, t('settings.captionSize'));
  const capDims = check(s.caption.dims, t('settings.captionDims'));
  const capDate = check(s.caption.date, t('settings.captionDate'));
  const overlay = check(s.caption.overlay, t('settings.overlay'));
  const confirmDelete = check(s.confirmDelete, t('settings.confirmDelete'));
  const useTrash = check(s.useTrash, t('settings.useTrash'));
  const wheel = selectEl([['navigate', t('settings.wheelNavigate')], ['zoom', t('settings.wheelZoom')]], s.viewer.wheel);
  const enlarge = check(s.viewer.enlarge, t('settings.enlarge'));
  const smooth = check(s.viewer.smooth, t('settings.smooth'));
  const quality = h('input.input', { type: 'number', min: 10, max: 100, value: s.jpegQuality });
  const xmp = check(s.xmpSidecar, t('settings.xmp'));
  const xmpEmbed = check(s.xmpEmbed, t('settings.xmpEmbed'));
  const tiles = check(s.mapTiles, t('settings.mapTiles'));
  const startup = selectEl([['last', t('settings.startLast')], ['pictures', t('settings.startPictures')], ['home', t('settings.startHome')]], s.startup);
  const slideshow = slideshowSettingsFields(s.slideshow, { field, selectEl });
  const cacheInfo = h('span.hint', '…');
  thumbs.cacheCount().then((n) => { cacheInfo.textContent = t('settings.cacheCount', { n }); });

  const tabs = [
    ['general', t('settings.general'), h('div', field(t('settings.language'), language), field(t('settings.theme'), theme), isDesktop() ? field(t('settings.startup'), startup) : null)],
    ['browse', t('settings.browse'), h('div', hidden.el, allFiles.el, folders.el, h('div.field-label', t('settings.captions')), capName.el, capSize.el, capDims.el, capDate.el, overlay.el)],
    ['view', t('settings.view'), h('div', field(t('settings.wheel'), wheel), enlarge.el, smooth.el)],
    ['slideshow', t('settings.slideshow'), slideshow.el],
    ['files', t('settings.files'), h('div', confirmDelete.el, fs.caps.trash ? useTrash.el : null, field(t('settings.jpegQuality'), quality), xmp.el, xmpEmbed.el, h('div.hint', t('settings.xmpHint')))],
    ['data', t('settings.data'), h('div', tiles.el, h('div.hint', t('settings.mapTilesHint')),
      h('div.row-buttons', h('button.btn.small', { type: 'button', onclick: async () => { await thumbs.clearCache(); cacheInfo.textContent = t('settings.cacheCount', { n: 0 }); toast(t('settings.cacheCleared'), 'success'); } }, t('settings.clearCache')), cacheInfo),
      h('div.row-buttons', h('button.btn.small', { type: 'button', onclick: exportCatalog }, t('settings.exportCatalog')), h('button.btn.small', { type: 'button', onclick: importCatalog }, t('settings.importCatalog'))),
      h('div.row-buttons', h('button.btn.small.danger', { type: 'button', onclick: resetCatalog }, t('settings.resetCatalog'))))],
  ];
  let current = 'general';
  const nav = h('div.settings-nav');
  const content = h('div.settings-content');
  const show = (id) => {
    current = id;
    for (const b of nav.children) b.classList.toggle('on', b.dataset.tab === id);
    content.replaceChildren(tabs.find((x) => x[0] === id)[2]);
  };
  for (const [id, label] of tabs) nav.append(h('button.settings-tab', { type: 'button', dataset: { tab: id }, onclick: () => show(id) }, label));
  // The window has one fixed size: reserve the height of the tallest tab so no tab is cut off.
  const probe = h('div.dialog-measure', h('div.dialog', { style: { width: '640px' } }, h('div.dialog-body', h('div.settings', nav, content))));
  document.body.append(probe);
  let tallest = 0;
  const first = current;
  for (const [id] of tabs) { show(id); tallest = Math.max(tallest, content.scrollHeight); }
  probe.remove();
  content.style.minHeight = `${tallest}px`;
  show(first); // measuring went through every tab: open on the first one
  const ok = await openDialog({ title: t('settings.title'), width: 640, body: h('div.settings', nav, content), buttons: [{ label: t('common.cancel'), value: false }, { label: t('common.save'), value: true, primary: true }], id: 'settings-dialog' });
  if (!ok) return;
  Object.assign(s, {
    language: language.value, theme: theme.value, showHidden: hidden.input.checked, showAllFiles: allFiles.input.checked, showFolders: folders.input.checked,
    caption: { name: capName.input.checked, size: capSize.input.checked, dims: capDims.input.checked, date: capDate.input.checked, overlay: overlay.input.checked },
    confirmDelete: confirmDelete.input.checked, useTrash: useTrash.input.checked, jpegQuality: Math.max(10, Math.min(100, Number(quality.value) || 92)),
    xmpSidecar: xmp.input.checked, xmpEmbed: xmpEmbed.input.checked, mapTiles: tiles.input.checked, startup: startup.value, slideshow: slideshow.read(),
  });
  s.viewer = { ...s.viewer, wheel: wheel.value, enlarge: enlarge.input.checked, smooth: smooth.input.checked };
  app.saveSettings();
  onApply?.();
}

function exportCatalog() {
  const blob = new Blob([JSON.stringify(app.catalog.toJSON(), null, 1)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = h('a', { href: url, download: `myphotomanager-catalog-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

function importCatalog() {
  const input = h('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' } });
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    input.remove();
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!data.files) throw new Error('not a catalog');
      const merge = await confirmDialog(t('settings.importMerge', { n: Object.keys(data.files).length }), { ok: t('settings.merge') });
      if (!merge) return;
      for (const [path, record] of Object.entries(data.files)) app.catalog.files.set(path, { ...(app.catalog.get(path) ?? {}), ...record });
      for (const c of data.categories ?? []) app.catalog.addCategory(c);
      app.catalog.changed(Object.keys(data.files), 'import');
      saveCatalogNow();
      toast(t('settings.imported'), 'success');
    } catch (error) {
      toast(String(error.message ?? error), 'error');
    }
  });
  document.body.append(input);
  input.click();
}

async function resetCatalog() {
  if (!(await confirmDialog(t('settings.resetCatalogConfirm'), { danger: true, ok: t('settings.resetCatalog') }))) return;
  app.catalog.files.clear();
  app.catalog.basket = [];
  app.catalog.changed([], 'reset');
  saveCatalogNow();
}

export async function aboutDialog() {
  let info = null;
  if (isDesktop()) info = await invoke('app_info').catch(() => null);
  const version = info?.version ?? (typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '1.0.0');
  const rows = [
    [t('about.version'), version],
    [t('about.build'), info ? new Date(info.buildTime * 1000).toLocaleString() : (typeof __BUILD_DATE__ === 'string' ? new Date(__BUILD_DATE__).toLocaleString() : '')],
    [t('about.commit'), info?.commit ?? (typeof __BUILD_COMMIT__ === 'string' ? __BUILD_COMMIT__ : '')],
    [t('about.platform'), info ? `${info.os} ${info.arch} · Tauri ${info.tauri}` : t('about.web')],
    [t('about.dataFolder'), info?.dataDir ?? t('about.browserStorage')],
    [t('about.author'), 'SHKWON(knix008@naver.com)'],
    [t('about.copyright'), `© ${new Date().getFullYear()} SHKWON`],
    [t('about.creditsLabel'), t('about.credits')],
  ];
  await openDialog({
    title: t('about.title'), width: 560, id: 'about-dialog',
    body: h('div.about',
      h('div.about-top',
        h('img.about-icon', { src: new URL('./icon-192.png', document.baseURI).href, alt: '' }),
        h('div.about-text', h('h2', 'MyPhotoManager'), h('div.about-version', `${t('about.version')} ${version}`), h('p', t('about.tagline')), h('p.about-description', t('about.description')))),
      h('div.about-rows', rows.filter(([, v]) => v).map(([k, v]) => [h('div.about-key', k), h('div.about-value', { title: v }, v)]))),
  });
}

export const SHORTCUTS = [
  ['manage', [['Enter', 'shortcut.view'], ['Ctrl+E', 'shortcut.edit'], ['F2', 'shortcut.rename'], ['Del', 'shortcut.delete'], ['Ctrl+A', 'shortcut.selectAll'], ['Ctrl+C / Ctrl+X / Ctrl+V', 'shortcut.clipboard'],
    ['Backspace / Alt+↑', 'shortcut.up'], ['Alt+← / Alt+→', 'shortcut.history'], ['F5', 'shortcut.refresh'], ['Ctrl+F', 'shortcut.search'], ['Ctrl+Shift+N', 'shortcut.newFolder']]],
  ['organize', [['Ctrl+0 … 5', 'shortcut.rating'], ['Alt+1 … 5 / Alt+0', 'shortcut.label'], ['`', 'shortcut.tag'], ['Ctrl+B', 'shortcut.basket'], ['Ctrl+[ / Ctrl+]', 'shortcut.rotate']]],
  ['view', [['← → / Space', 'shortcut.navigate'], ['+ / - / * / /', 'shortcut.zoom'], ['F', 'shortcut.fullscreen'], ['I / H', 'shortcut.overlays'], ['E', 'shortcut.edit'], ['S', 'shortcut.slideshow'], ['Esc', 'shortcut.back']]],
  ['edit', [['Ctrl+Z / Ctrl+Y', 'shortcut.undoRedo'], ['Ctrl+S', 'shortcut.save'], ['B', 'shortcut.beforeAfter'], ['Enter', 'shortcut.applyCrop'], ['Esc', 'shortcut.cancel']]],
];

export function shortcutsDialog() {
  return openDialog({
    title: t('shortcuts.title'), width: 640,
    body: h('div.shortcuts', SHORTCUTS.map(([group, list]) => h('section', h('h4', t(`shortcuts.${group}`)), h('table.prop-table', list.map(([keys, label]) => h('tr', h('th', h('kbd', keys)), h('td', t(label)))))))),
  });
}
