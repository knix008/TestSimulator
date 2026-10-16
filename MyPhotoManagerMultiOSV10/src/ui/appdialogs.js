// Settings, About and keyboard shortcut dialogs.
import { t } from '../i18n.js';
import { fs } from '../platform/fs.js';
import { invoke, isDesktop } from '../platform/native.js';
import { app, saveCatalogNow } from '../store.js';
import { thumbs } from '../thumbs/thumbs.js';
import { ARCHIVES, DICOM, EXTRA, HEIF, JP2, JXL, NATIVE, OUTPUT_FORMATS, PDF, PSD, RAW, SVG, TIFF, VIDEO } from '../formats/types.js';
import { confirmDialog, field, openDialog, selectEl, toast } from './dialog.js';
import { startSceneId, startSpeedPercent } from './startscenes.js';
import { createStartScenes, createStartSpeed } from './startpage.js';
import { h } from './dom.js';
import { FLAG_EN, FLAG_KO } from './flags.js';
import { icon } from './icons.js';
import { AUDIO_EXTENSIONS, slideshowSettingsFields } from './slideshow.js';
import { previewTheme, themeGrid } from './themepicker.js';

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
  const theme = themeGrid(s.theme);
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
  const colorManaged = check(s.colorManagement, t('settings.colorManagement'));
  const measureUnit = selectEl([['mm', t('settings.unitMm')], ['cm', t('settings.unitCm')], ['inch', t('settings.unitInch')]], s.measureUnit ?? 'mm');
  measureUnit.dataset.key = 'measure-unit';
  colorManaged.input.dataset.key = 'color-management';
  const quality = h('input.input', { type: 'number', min: 10, max: 100, value: s.jpegQuality });
  const xmp = check(s.xmpSidecar, t('settings.xmp'));
  const xmpEmbed = check(s.xmpEmbed, t('settings.xmpEmbed'));
  const tiles = check(s.mapTiles, t('settings.mapTiles'));
  const autoAnalysis = check(s.analysis?.auto !== false, t('analysis.auto'));
  autoAnalysis.input.dataset.key = 'analysis-auto';
  const startup = selectEl([['last', t('settings.startLast')], ['pictures', t('settings.startPictures')], ['home', t('settings.startHome')]], s.startup);
  let startScene = startSceneId(s.startScreen?.scene);
  let startSpeed = startSpeedPercent(s.startScreen?.motion);
  const startBackup = { scene: startScene, motion: startSpeed };
  const previewStart = () => {
    s.startScreen = { ...(s.startScreen ?? {}), scene: startScene, motion: startSpeed };
    app.emit('settings');
  };
  const slideshow = slideshowSettingsFields(s.slideshow, { field, selectEl });
  const vs = { autoplay: true, loop: false, muted: false, volume: 100, speed: 1, controls: true, fit: 'fit', resume: true, nextAtEnd: false, ...(s.video ?? {}) };
  const video = {
    autoplay: check(vs.autoplay, t('video.autoplay')), loop: check(vs.loop, t('video.loop')), muted: check(vs.muted, t('video.startMuted')),
    controls: check(vs.controls, t('video.controls')), resume: check(vs.resume, t('video.resume')), nextAtEnd: check(vs.nextAtEnd, t('video.nextAtEnd')),
    volume: h('input.input', { type: 'number', min: 0, max: 100, step: 5, value: vs.volume, dataset: { key: 'video-volume' } }),
    speed: selectEl([0.25, 0.5, 0.75, 1, 1.25, 1.5, 2].map((x) => [String(x), `${x}×`]), String(vs.speed)),
    fit: selectEl([['fit', t('video.fitWindow')], ['actual', t('video.fitActual')], ['fill', t('video.fitFill')]], vs.fit),
  };
  video.speed.dataset.key = 'video-speed-setting';
  video.fit.dataset.key = 'video-fit-setting';
  for (const [key, box] of Object.entries(video)) if (box.input) box.input.dataset.key = `video-${key}`;
  const cacheInfo = h('span.hint', '…');
  thumbs.cacheCount().then((n) => { cacheInfo.textContent = t('settings.cacheCount', { n }); });

  const group = (title, ...nodes) => h('section.settings-group', h('h3.settings-group-title', title), ...nodes);
  const tabs = [
    ['general', 'gear', t('settings.general'), h('div.settings-groups',
      group(t('settings.general'), field(t('settings.language'), language), isDesktop() ? field(t('settings.startup'), startup) : null))],
    ['start', 'home', t('settings.startScreen'), h('div.settings-groups',
      group(t('settings.startScreen'),
        h('div.field-label', t('settings.startScene')),
        createStartScenes(startScene, (id) => { startScene = id; previewStart(); }),
        createStartSpeed(startSpeed, (n) => { startSpeed = n; previewStart(); })))],
    ['view', 'eye', t('settings.view'), h('div.settings-groups',
      group(t('settings.view'), field(t('settings.wheel'), wheel), enlarge.el, smooth.el, field(t('settings.measureUnit'), measureUnit), colorManaged.el, h('div.hint', t('settings.colorManagementHint'))))],
    ['browse', 'folder', t('settings.browse'), h('div.settings-groups',
      group(t('settings.browse'), hidden.el, allFiles.el, folders.el, h('div.field-label', t('settings.captions')), capName.el, capSize.el, capDims.el, capDate.el, overlay.el))],
    ['theme', 'palette', t('settings.theme'), h('div', h('p.hint', t('theme.tabHint')), theme.el)],
    ['playback', 'play', t('settings.playback'), h('div.settings-groups',
      group(t('settings.slideshow'), slideshow.el),
      group(t('settings.video'), video.autoplay.el, video.loop.el, video.muted.el, video.controls.el, video.resume.el, video.nextAtEnd.el,
        h('div.field-row', field(t('video.volume'), video.volume), field(t('video.speed'), video.speed), field(t('video.fit'), video.fit))))],
    ['files', 'file', t('settings.files'), h('div.settings-groups',
      group(t('settings.files'), confirmDelete.el, fs.caps.trash ? useTrash.el : null, field(t('settings.jpegQuality'), quality), xmp.el, xmpEmbed.el, h('div.hint', t('settings.xmpHint'))),
      group(t('settings.data'), autoAnalysis.el, h('div.hint', t('analysis.autoHint')), tiles.el, h('div.hint', t('settings.mapTilesHint')),
        h('div.settings-actions',
          h('div.row-buttons', h('button.btn.small', { type: 'button', onclick: async () => { await thumbs.clearCache(); cacheInfo.textContent = t('settings.cacheCount', { n: 0 }); toast(t('settings.cacheCleared'), 'success'); } }, t('settings.clearCache')), cacheInfo),
          h('div.row-buttons', h('button.btn.small', { type: 'button', onclick: exportCatalog }, t('settings.exportCatalog')), h('button.btn.small', { type: 'button', onclick: importCatalog }, t('settings.importCatalog'))),
          h('div.row-buttons', h('button.btn.small.danger', { type: 'button', onclick: resetCatalog }, t('settings.resetCatalog'))))))],
  ];
  let current = 'general';
  const nav = h('div.settings-nav');
  const content = h('div.settings-content');
  const show = (id) => {
    current = id;
    for (const b of nav.children) b.classList.toggle('on', b.dataset.tab === id);
    content.replaceChildren(tabs.find((x) => x[0] === id)[3]);
  };
  for (const [id, glyph, label] of tabs) nav.append(h('button.settings-tab', { type: 'button', dataset: { tab: id }, onclick: () => show(id) }, h('span.settings-tab-icon', { html: icon(glyph) }), h('span', label)));
  // The window has one fixed size: reserve the height of the tallest tab so no tab is cut off.
  const probe = h('div.dialog-measure', h('div.dialog', { style: { width: '800px' }, id: 'settings-dialog' }, h('div.dialog-body', h('div.settings', nav, content))));
  document.body.append(probe);
  // One column of equal tab buttons. The window is wide enough for that column and the theme grid.
  const tabWidth = Math.max(...[...nav.children].map((el) => el.offsetWidth));
  for (const el of nav.children) el.style.width = `${tabWidth}px`;
  const dialogWidth = Math.min(Math.max(800, Math.ceil(tabWidth) + 640), Math.max(800, (screen.availWidth || 1280) - 48));
  probe.querySelector('.dialog').style.width = `${dialogWidth}px`;
  let tallest = 0;
  const first = current;
  for (const [id] of tabs) { show(id); tallest = Math.max(tallest, content.scrollHeight); }
  probe.remove();
  content.style.minHeight = `${tallest}px`;
  show(first); // measuring went through every tab: open on the first one
  const ok = await openDialog({ title: t('settings.title'), width: dialogWidth, body: h('div.settings', nav, content), buttons: [{ label: t('common.cancel'), value: false }, { label: t('common.save'), value: true, primary: true }], id: 'settings-dialog' });
  if (!ok) {
    previewTheme(s.theme, s.customTheme);
    s.startScreen = { ...(s.startScreen ?? {}), ...startBackup };
    app.emit('settings');
    return;
  }
  Object.assign(s, {
    language: language.value, theme: theme.value, showHidden: hidden.input.checked, showAllFiles: allFiles.input.checked, showFolders: folders.input.checked,
    caption: { name: capName.input.checked, size: capSize.input.checked, dims: capDims.input.checked, date: capDate.input.checked, overlay: overlay.input.checked },
    confirmDelete: confirmDelete.input.checked, useTrash: useTrash.input.checked, jpegQuality: Math.max(10, Math.min(100, Number(quality.value) || 92)),
    video: { autoplay: video.autoplay.input.checked, loop: video.loop.input.checked, muted: video.muted.input.checked, controls: video.controls.input.checked, resume: video.resume.input.checked, nextAtEnd: video.nextAtEnd.input.checked, volume: Math.max(0, Math.min(100, Number(video.volume.value) || 0)), speed: Number(video.speed.value) || 1, fit: video.fit.value },
    xmpSidecar: xmp.input.checked, xmpEmbed: xmpEmbed.input.checked, colorManagement: colorManaged.input.checked, measureUnit: measureUnit.value, mapTiles: tiles.input.checked, analysis: { ...(s.analysis ?? {}), auto: autoAnalysis.input.checked }, startup: startup.value, slideshow: slideshow.read(),
    startScreen: { scene: startSceneId(startScene), motion: startSpeedPercent(startSpeed) },
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

/** Every format the app reads (by group) and writes, for the About window. */
export function supportedFormats() {
  return [
    ['about.fmtPhotos', NATIVE], ['about.fmtTiff', TIFF], ['about.fmtHeif', HEIF], ['about.fmtPsd', PSD], ['about.fmtRaw', RAW],
    ['about.fmtVector', SVG], ['about.fmtJp2', [...JP2, ...JXL]], ['about.fmtExtra', EXTRA], ['about.fmtPdf', PDF], ['about.fmtDicom', DICOM],
    ['about.fmtVideo', VIDEO], ['about.fmtArchive', ARCHIVES], ['about.fmtOther', ['xmp', 'cube', 'gpx', ...AUDIO_EXTENSIONS]],
    ['about.fmtWrite', [...new Set(OUTPUT_FORMATS.map((f) => f.ext))]],
  ];
}

export async function aboutDialog() {
  let info = null;
  if (isDesktop()) info = await invoke('app_info').catch(() => null);
  const version = info?.version ?? (typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '1.0.0');
  const blank = '—';
  const program = [
    ['about.build', info ? new Date(info.buildTime * 1000).toLocaleString() : (typeof __BUILD_DATE__ === 'string' ? new Date(__BUILD_DATE__).toLocaleString() : blank)],
    ['about.commit', info?.commit || (typeof __BUILD_COMMIT__ === 'string' ? __BUILD_COMMIT__ : '') || blank],
    ['about.platform', info ? `${info.os} ${info.arch} · Tauri ${info.tauri}` : t('about.web')],
  ];
  const place = [
    ['about.dataFolder', info?.dataDir ?? t('about.browserStorage')],
    ['about.author', 'SHKWON(knix008@naver.com)'],
  ];
  const fact = ([key, value]) => h('div.about-fact', h('div.about-key', t(key)), h('div.about-value', { title: value }, value));
  const formats = supportedFormats();
  const formatRow = ([key, list]) => h('div.about-format-row', { dataset: { group: key } }, h('div.about-key', t(key)), h('div.about-exts', list.map((ext) => h('span.ext-chip', ext.toUpperCase()))));
  const formatMid = Math.ceil(formats.length / 2);
  const group = (title, ...nodes) => h('section.about-group', h('h3.about-group-title', title), ...nodes);
  await openDialog({
    title: t('about.title'), width: 960, id: 'about-dialog',
    body: h('div.about',
      h('div.about-top',
        h('img.about-icon', { src: new URL('./icon-192.png', document.baseURI).href, alt: '' }),
        h('div.about-text', h('h2', 'MyPhotoManager'), h('div.about-version', `${t('about.version')} ${version}`), h('p', t('about.tagline')), h('p.about-description', t('about.description')))),
      h('div.about-rows',
        h('div.about-groups',
          group(t('about.groupApp'), h('div.about-facts', program.map(fact))),
          group(t('about.groupInfo'), h('div.about-facts', place.map(fact)))),
        group(t('about.creditsLabel'), h('p.about-credits', t('about.credits'))),
        group(t('about.formats', { n: formats.slice(0, -1).reduce((sum, [, list]) => sum + list.length, 0) }),
          h('div.about-format-grid',
            h('div.about-format-col', formats.slice(0, formatMid).map(formatRow)),
            h('div.about-format-col', formats.slice(formatMid).map(formatRow)))))),
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
