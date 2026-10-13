import { planGrid } from './aspect.js';
import { STYLE_PRESETS, convertToText } from './converter.js';
import { measureCell, sampleGlyph } from './measure.js';
import { exportPixelWidth, layoutAspect, makePreviewUrl, paintAscii } from './render.js';
import { toHtml } from './export.js';
import { saveAs } from './save.js';
import { loadBitmap } from './decode.js';
import { acceptAttribute, formatList } from './formats.js';
import { buildInfo } from './generated/build-info.js';
import { fileFromEncoded, isTauri, pathOf, pickImages, readImage, saveTexts } from './files.js';
import { clearRecent, rememberRecent, removeRecent } from './recent.js';
import { applyDom, getLanguage, setLanguage, t } from './i18n.js';
import { DEFAULT_THEME, THEMES, applyFont, applyTheme, nextThemeId, themeById, themeLabel } from './themes.js';

const SETTINGS_KEY = 'image2text.settings.v3';
const LEGACY_SETTINGS_KEY = 'image2text.settings.v2';
const DEFAULTS = {
  cols: 100,
  styles: STYLE_PRESETS.map((style) => style.id),
  custom: false,
  customChars: '@#*+:. ',
  contrast: 50,
  brightness: 50,
  invert: false,
  edge: false,
  color: false,
  fontFamily: 'Consolas, "Courier New", monospace',
  language: 'ko',
  theme: DEFAULT_THEME,
  customThemes: [],
  uiSize: 13,
  uiBold: false,
  uiItalic: false,
};

const els = {
  fileInput: document.querySelector('#file-input'),
  add: document.querySelector('#btn-add'),
  convert: document.querySelector('#btn-convert'),
  clearSources: document.querySelector('#btn-clear-sources'),
  sourceList: document.querySelector('#source-list'),
  sourceEmpty: document.querySelector('#source-empty'),
  fileButton: document.querySelector('#btn-file'),
  fileMenu: document.querySelector('#file-menu'),
  recentList: document.querySelector('#recent-list'),
  recentEmpty: document.querySelector('#recent-empty'),
  clearRecent: document.querySelector('#btn-clear-recent'),
  stageEmpty: document.querySelector('#stage-empty'),
  compare: document.querySelector('#compare'),
  sourceSlot: document.querySelector('#source-slot'),
  textSlot: document.querySelector('#text-slot'),
  sourceFrame: document.querySelector('#source-frame'),
  textFrame: document.querySelector('#text-frame'),
  sourcePreview: document.querySelector('#source-preview'),
  textPreview: document.querySelector('#text-preview'),
  editor: document.querySelector('#text-editor'),
  sourceCaption: document.querySelector('#source-caption'),
  textCaption: document.querySelector('#text-caption'),
  resultCount: document.querySelector('#result-count'),
  plan: document.querySelector('#plan'),
  galleryEmpty: document.querySelector('#gallery-empty'),
  galleryTrack: document.querySelector('#gallery-track'),
  galleryPrev: document.querySelector('#gallery-prev'),
  galleryNext: document.querySelector('#gallery-next'),
  resultMenu: document.querySelector('#result-menu'),
  cols: document.querySelector('#cols'),
  colsOut: document.querySelector('#cols-out'),
  customOn: document.querySelector('#custom-on'),
  customChars: document.querySelector('#custom-chars'),
  contrast: document.querySelector('#contrast'),
  contrastOut: document.querySelector('#contrast-out'),
  brightness: document.querySelector('#brightness'),
  brightnessOut: document.querySelector('#brightness-out'),
  invert: document.querySelector('#invert'),
  edge: document.querySelector('#edge'),
  color: document.querySelector('#color'),
  font: document.querySelector('#font'),
  edit: document.querySelector('#btn-edit'),
  copy: document.querySelector('#btn-copy'),
  txt: document.querySelector('#btn-txt'),
  html: document.querySelector('#btn-html'),
  png: document.querySelector('#btn-png'),
  reset: document.querySelector('#btn-reset'),
  themeButton: document.querySelector('#btn-theme'),
  themeMenuButton: document.querySelector('#btn-theme-menu'),
  themeMenu: document.querySelector('#theme-menu'),
  themeCurrent: document.querySelector('#theme-current'),
  themeSwatch: document.querySelector('#theme-swatch'),
  themeSwatchDot: document.querySelector('#theme-swatch-dot'),
  themeMenuDark: document.querySelector('#theme-menu-dark'),
  themeMenuLight: document.querySelector('#theme-menu-light'),
  themeMenuCustom: document.querySelector('#theme-menu-custom'),
  themeManage: document.querySelector('#btn-theme-manage'),
  languageButton: document.querySelector('#btn-language'),
  flagUk: document.querySelector('#flag-uk'),
  flagKr: document.querySelector('#flag-kr'),
  settingsButton: document.querySelector('#btn-settings'),
  customEmpty: document.querySelector('#custom-empty'),
  customForm: document.querySelector('#custom-form'),
  customPick: document.querySelector('#custom-pick'),
  customName: document.querySelector('#custom-name'),
  customBg: document.querySelector('#custom-bg'),
  customPanel: document.querySelector('#custom-panel'),
  customText: document.querySelector('#custom-text'),
  customAccent: document.querySelector('#custom-accent'),
  customTitlebar: document.querySelector('#custom-titlebar'),
  customDelete: document.querySelector('#btn-custom-delete'),
  aboutButton: document.querySelector('#btn-about'),
  settingsDialog: document.querySelector('#settings-dialog'),
  aboutDialog: document.querySelector('#about-dialog'),
  uiSize: document.querySelector('#ui-size'),
  uiSizeOut: document.querySelector('#ui-size-out'),
  uiBold: document.querySelector('#ui-bold'),
  uiItalic: document.querySelector('#ui-italic'),
  resetAll: document.querySelector('#btn-reset-all'),
  copyAbout: document.querySelector('#btn-copy-about'),
  aboutRuntime: document.querySelector('#about-runtime'),
  aboutPlatform: document.querySelector('#about-platform'),
  aboutFormats: document.querySelector('#about-formats'),
  aboutAuthor: document.querySelector('#about-author'),
  aboutBuild: document.querySelector('#about-build'),
  saveDialog: document.querySelector('#save-dialog'),
  savePrompt: document.querySelector('#save-prompt'),
  statusMessage: document.querySelector('#status-message'),
  statusDetail: document.querySelector('#status-detail'),
};

let fontListLoaded = false;
let fontListTask = null;

const state = {
  sources: [],
  recent: rememberRecent([]),
  results: [],
  selectedId: null,
  editing: false,
  busy: false,
  maximized: false,
  statusKey: 'ready',
  statusVars: null,
  viewZoom: 1,
};

renderStyleChips();
applySettings(loadSettings());
bind();
void loadFontChoices();
void setupWindowControls();
refreshChrome();
renderSources();
renderRecent();
renderStage();
new ResizeObserver(() => renderStage()).observe(els.compare);

function bind() {
  els.fileInput.accept = acceptAttribute();
  els.add.addEventListener('click', () => void chooseImages());
  els.fileButton.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleFileMenu();
  });
  els.fileMenu.addEventListener('click', (event) => {
    const command = event.target.closest('[data-file]')?.dataset.file;
    if (command === 'open') {
      closeFileMenu();
      void chooseImages(t('fileOpen'));
    } else if (command === 'save') {
      closeFileMenu();
      void saveAllResults();
    }
  });
  els.fileMenu.addEventListener('contextmenu', (event) => event.preventDefault());
  els.fileInput.addEventListener('change', () => {
    void addEntries([...els.fileInput.files].map((file) => ({ file, path: pathOf(file) })));
    els.fileInput.value = '';
  });
  els.clearSources.addEventListener('click', clearSources);
  els.clearRecent.addEventListener('click', () => {
    state.recent = clearRecent();
    renderRecent();
    setStatus('recentCleared');
  });
  els.recentList.addEventListener('click', (event) => {
    const remove = event.target.closest('[data-remove-recent]');
    if (remove) {
      state.recent = removeRecent(remove.dataset.removeRecent);
      renderRecent();
      setStatus('recentRemoved');
      return;
    }
    const open = event.target.closest('[data-open-recent]');
    if (open) {
      closeFileMenu();
      void openRecent(open.dataset.openRecent);
    }
  });
  els.convert.addEventListener('click', () => void convertAll());
  els.cols.addEventListener('input', refreshChrome);
  els.customOn.addEventListener('change', refreshChrome);
  els.customChars.addEventListener('input', refreshChrome);
  for (const input of document.querySelectorAll('input[name="style"]')) {
    input.addEventListener('change', refreshChrome);
  }
  els.contrast.addEventListener('input', refreshChrome);
  els.brightness.addEventListener('input', refreshChrome);
  els.invert.addEventListener('change', refreshChrome);
  els.edge.addEventListener('change', refreshChrome);
  els.color.addEventListener('change', refreshChrome);
  els.font.addEventListener('pointerdown', () => {
    if (!fontListLoaded) void loadFontChoices();
  });
  els.font.addEventListener('change', refreshChrome);
  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-nudge]');
    if (!button || button.disabled) return;
    const input = button.closest('.meter')?.querySelector('input[type="range"]');
    if (!input) return;
    nudgeInput(input, Number(button.dataset.nudge));
  });
  els.edit.addEventListener('click', toggleEdit);
  els.copy.addEventListener('click', () => void copySelected());
  els.txt.addEventListener('click', () => void saveSelected('txt'));
  els.html.addEventListener('click', () => void saveSelected('html'));
  els.png.addEventListener('click', () => void saveSelected('png'));
  els.reset.addEventListener('click', resetSettings);
  els.themeButton.addEventListener('click', cycleTheme);
  els.themeMenuButton.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleThemeMenu();
  });
  els.themeManage.addEventListener('click', () => {
    closeThemeMenu();
    openSettings('theme');
  });
  els.themeMenu.addEventListener('click', (event) => {
    const item = event.target.closest('[data-theme-id]');
    if (!item) return;
    applyChosenTheme(item.dataset.themeId);
    closeThemeMenu();
  });
  document.addEventListener('pointerdown', (event) => {
    if (!els.themeMenu.hidden && !event.target.closest('#theme-menu') && !event.target.closest('#btn-theme-menu')) {
      closeThemeMenu();
    }
    if (!els.fileMenu.hidden && !event.target.closest('#file-menu') && !event.target.closest('#btn-file')) {
      closeFileMenu();
    }
    if (!els.resultMenu.hidden && !event.target.closest('#result-menu')) closeResultMenu();
  });
  els.resultMenu.addEventListener('click', (event) => {
    const kind = event.target.closest('[data-save]')?.dataset.save;
    if (!kind) return;
    const result = state.results.find((item) => item.id === els.resultMenu.dataset.resultId);
    closeResultMenu();
    void saveResult(result, kind);
  });
  els.resultMenu.addEventListener('contextmenu', (event) => event.preventDefault());
  els.galleryTrack.addEventListener('scroll', () => {
    closeResultMenu();
    if (!els.galleryPrev.hidden) syncGalleryNavEnds();
  });
  els.galleryPrev.addEventListener('click', () => scrollGallery(-1));
  els.galleryNext.addEventListener('click', () => scrollGallery(1));
  els.textFrame.addEventListener('contextmenu', (event) => {
    if (state.editing) return;
    const result = selected();
    if (!result) return;
    event.preventDefault();
    openResultMenu(result.id, event.clientX, event.clientY);
  });
  window.addEventListener('resize', () => {
    if (!els.themeMenu.hidden) placeThemeMenu();
    closeFileMenu();
    closeResultMenu();
    updateGalleryNav();
  });
  for (const button of document.querySelectorAll('[data-settings-tab]')) {
    button.addEventListener('click', () => showSettingsPage(button.dataset.settingsTab));
  }
  document.querySelector('#btn-custom-new').addEventListener('click', addCustomTheme);
  els.customDelete.addEventListener('click', deleteCustomTheme);
  els.customPick.addEventListener('change', () => {
    applyChosenTheme(els.customPick.value);
    renderCustomEditor();
  });
  els.customName.addEventListener('input', () => {
    patchCustom({ label: els.customName.value.slice(0, 40) });
    const option = els.customPick.selectedOptions[0];
    if (option) option.textContent = els.customName.value || t('customThemeDefault');
  });
  for (const input of document.querySelectorAll('input[name="custom-mode"]')) {
    input.addEventListener('change', () => {
      if (input.checked) patchCustom({ mode: input.value === 'light' ? 'light' : 'dark' });
    });
  }
  for (const [key, element] of [['bg', els.customBg], ['panel', els.customPanel], ['text', els.customText], ['accent', els.customAccent], ['titlebar', els.customTitlebar]]) {
    element.addEventListener('input', () => patchCustom({ [key]: element.value }));
  }
  els.languageButton.addEventListener('click', () => applyLanguage(getLanguage() === 'en' ? 'ko' : 'en'));
  els.settingsButton.addEventListener('click', () => openSettings('general'));
  els.aboutButton.addEventListener('click', openAbout);
  els.resetAll.addEventListener('click', resetAllSettings);
  els.copyAbout.addEventListener('click', () => void copyAbout());
  for (const input of document.querySelectorAll('input[name="language"]')) {
    input.addEventListener('change', () => {
      if (input.checked) applyLanguage(input.value);
    });
  }
  els.uiSize.addEventListener('input', () => {
    els.uiSizeOut.textContent = els.uiSize.value;
    applyFont(fontBundle());
    refreshChrome();
  });
  els.uiBold.addEventListener('change', () => {
    applyFont(fontBundle());
    refreshChrome();
  });
  els.uiItalic.addEventListener('change', () => {
    applyFont(fontBundle());
    refreshChrome();
  });
  for (const dialog of [els.settingsDialog, els.aboutDialog, els.saveDialog]) {
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close(dialog === els.saveDialog ? 'cancel' : '');
    });
  }
  els.saveDialog.addEventListener('click', (event) => {
    const choice = event.target.closest('[data-close]')?.dataset.close;
    if (choice) els.saveDialog.close(choice);
  });
  els.editor.addEventListener('input', () => {
    const result = selected();
    if (!result) return;
    const text = els.editor.value.replaceAll('\r\n', '\n');
    if (text !== result.text) {
      result.text = text;
      result.colors = null;
      result.edited = true;
      renderStage();
    }
  });

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('dragover', (event) => {
    if (!event.dataTransfer?.types?.includes('Files')) return;
    event.preventDefault();
    document.body.classList.add('dragover');
  });
  window.addEventListener('dragleave', () => document.body.classList.remove('dragover'));
  window.addEventListener('drop', (event) => {
    if (!event.dataTransfer?.files?.length) return;
    event.preventDefault();
    document.body.classList.remove('dragover');
    void addEntries([...event.dataTransfer.files].map((file) => ({ file, path: pathOf(file) })));
  });
  els.compare.addEventListener('wheel', onViewWheel, { passive: false });
  els.compare.addEventListener('dblclick', (event) => {
    if (event.target.closest('textarea, button, input')) return;
    if (!event.target.closest('.slot')) return;
    state.viewZoom = 1;
    renderStage();
  });
  let pan = null;
  els.compare.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || event.target.closest('textarea, button, input')) return;
    const slot = event.target.closest('.slot');
    if (!slot || !slotCanPan(slot)) return;
    pan = {
      id: event.pointerId,
      slot,
      x: event.clientX,
      y: event.clientY,
      left: slot.scrollLeft,
      top: slot.scrollTop,
    };
    slot.classList.add('is-panning');
    slot.setPointerCapture(event.pointerId);
  });
  els.compare.addEventListener('pointermove', (event) => {
    if (!pan || event.pointerId !== pan.id) return;
    pan.slot.scrollLeft = pan.left - (event.clientX - pan.x);
    pan.slot.scrollTop = pan.top - (event.clientY - pan.y);
  });
  const endPan = (event) => {
    if (!pan || (event && event.pointerId !== pan.id)) return;
    pan.slot.classList.remove('is-panning');
    pan = null;
  };
  els.compare.addEventListener('pointerup', endPan);
  els.compare.addEventListener('pointercancel', endPan);
}

async function chooseImages(title) {
  if (!isTauri()) {
    els.fileInput.click();
    return;
  }
  try {
    const picked = await pickImages(title);
    if (!picked.files.length && !picked.failed.length) return;
    const added = await addEntries(
      picked.files.map((image) => ({ file: fileFromEncoded(image), path: image.path })),
    );
    if (picked.failed.length) {
      setStatus(added ? 'addedFailed' : 'openFailed', { added, failed: picked.failed.join(', ') });
    }
  } catch (error) {
    setStatus('error', { message: errorText(error) });
  }
}

async function openRecent(path) {
  if (!isTauri()) {
    setStatus('recentBrowser');
    return;
  }
  try {
    const image = await readImage(path);
    await addEntries([{ file: fileFromEncoded(image), path: image.path }]);
  } catch (error) {
    setStatus('error', { message: errorText(error) });
  }
}

async function addEntries(entries) {
  const failed = [];
  const remembered = [];
  for (const entry of entries) {
    try {
      const bitmap = await loadBitmap(entry.file);
      state.sources.push({
        id: crypto.randomUUID(),
        name: entry.file.name,
        bitmap,
        width: bitmap.width,
        height: bitmap.height,
        previewUrl: makePreviewUrl(bitmap),
      });
      if (entry.path) remembered.push({ path: entry.path, name: entry.file.name });
    } catch {
      failed.push(entry.file.name);
    }
  }
  if (remembered.length) {
    state.recent = rememberRecent(remembered);
    renderRecent();
  }
  renderSources();
  refreshChrome();
  if (failed.length) {
    setStatus('openFailed', { failed: failed.join(', ') });
  } else if (entries.length) {
    setStatus('added', { n: entries.length });
  }
  return entries.length - failed.length;
}

function clearSources() {
  for (const source of state.sources) source.bitmap.close?.();
  state.sources = [];
  renderSources();
  refreshChrome();
  setStatus('sourcesCleared');
}

function iconSvg(markup) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('ico');
  svg.innerHTML = markup;
  return svg;
}

function renderRecent() {
  els.recentList.replaceChildren();
  els.recentEmpty.hidden = state.recent.length > 0;
  els.clearRecent.disabled = state.recent.length === 0;
  for (const item of state.recent) {
    const row = document.createElement('div');
    row.className = 'recent-item';
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'recent-open';
    const name = document.createElement('span');
    name.textContent = item.name;
    open.append(iconSvg('<path d="M4 1.8h5.2L13 5.6V14.2H4z"/><path d="M9 1.8V5.8h4"/>'), name);
    open.title = item.path;
    open.dataset.openRecent = item.path;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'source-remove';
    remove.append(iconSvg('<path d="M4 4l8 8M12 4 4 12"/>'));
    remove.title = t('recentRemove');
    remove.setAttribute('aria-label', t('recentRemoveNamed', { name: item.name }));
    remove.dataset.removeRecent = item.path;
    row.append(open, remove);
    els.recentList.append(row);
  }
}

function removeSource(id) {
  const index = state.sources.findIndex((source) => source.id === id);
  if (index < 0) return;
  state.sources[index].bitmap.close?.();
  state.sources.splice(index, 1);
  renderSources();
  refreshChrome();
}

function renderSources() {
  els.sourceList.replaceChildren();
  els.sourceEmpty.hidden = state.sources.length > 0;
  for (const source of state.sources) {
    const item = document.createElement('div');
    item.className = 'source';
    const image = document.createElement('img');
    image.src = source.previewUrl;
    image.alt = '';
    const text = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = source.name;
    name.title = source.name;
    const size = document.createElement('span');
    size.textContent = `${source.width}×${source.height}`;
    text.append(name, size);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'source-remove';
    remove.append(iconSvg('<path d="M4 4l8 8M12 4 4 12"/>'));
    remove.setAttribute('aria-label', t('removeNamed', { name: source.name }));
    remove.addEventListener('click', () => removeSource(source.id));
    item.append(image, text, remove);
    els.sourceList.append(item);
  }
}

async function convertAll() {
  if (state.busy) return;
  const styles = selectedStyles();
  if (state.sources.length === 0 || styles.length === 0) return;

  state.busy = true;
  refreshChrome();
  const settings = readSettings();
  const sources = [...state.sources];
  const made = [];
  const failures = [];
  const total = sources.length * styles.length;
  let index = 0;

  try {
    await document.fonts.ready;
    for (const source of sources) {
      for (const style of styles) {
        index += 1;
        setStatus('convertProgress', {
          index,
          total,
          name: source.name,
          style: labelOf(style.id, style.label),
        });
        await yieldToUi();
        try {
          made.push(buildResult(source, style, settings));
        } catch (error) {
          failures.push(`${source.name} / ${labelOf(style.id, style.label)}: ${errorText(error)}`);
        }
      }
    }
  } finally {
    state.busy = false;
    refreshChrome();
  }

  if (made.length === 0) {
    setStatus(failures[0] ? 'error' : 'convertNone', failures[0] ? { message: failures[0] } : null);
    return;
  }

  state.editing = false;
  state.results = made;
  renderGallery();
  selectResult(made[0].id);
  setStatus(failures.length ? 'convertDoneFail' : 'convertDone', {
    n: made.length,
    error: failures[0] || '',
  });
}

function buildResult(source, style, settings) {
  const measured = measureCell(settings.fontFamily, style.sample);
  const grid = planGrid(
    settings.cols,
    source.width,
    source.height,
    measured.charWidth,
    measured.lineHeight,
  );
  const converted = convertToText(source.bitmap, {
    cols: grid.cols,
    rows: grid.rows,
    chars: style.chars,
    contrast: settings.contrast,
    brightness: settings.brightness,
    invert: settings.invert,
    edge: settings.edge,
    color: settings.color,
  });

  return {
    id: crypto.randomUUID(),
    sourceId: source.id,
    sourceName: source.name,
    previewUrl: source.previewUrl,
    imageWidth: source.width,
    imageHeight: source.height,
    styleId: style.id,
    styleLabel: style.label,
    text: converted.text,
    colors: converted.colors,
    cols: grid.cols,
    rows: grid.rows,
    requestedCols: grid.requested,
    error: grid.error,
    cellRatio: measured.ratio,
    fontFamily: settings.fontFamily,
    edited: false,
  };
}

function renderGallery() {
  closeResultMenu();
  els.galleryTrack.replaceChildren();
  els.galleryEmpty.hidden = state.results.length > 0;
  els.resultCount.textContent = state.results.length ? t('resultCount', { n: state.results.length }) : '';
  const dpr = window.devicePixelRatio || 1;

  for (const result of state.results) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'card';
    card.dataset.id = result.id;
    card.setAttribute('aria-pressed', 'false');
    card.setAttribute('aria-label', `${result.sourceName} ${labelOf(result.styleId, result.styleLabel)}`);

    const thumb = document.createElement('div');
    thumb.className = 'thumb';
    const canvas = document.createElement('canvas');
    const showWidth = thumbWidth(result, 156, 108);
    paintAscii(canvas, result, showWidth, dpr);
    thumb.append(canvas);

    const name = document.createElement('strong');
    name.textContent = result.sourceName;
    name.title = result.sourceName;
    const meta = document.createElement('em');
    meta.textContent = `${labelOf(result.styleId, result.styleLabel)} · ${result.cols}×${result.rows}`;
    card.append(thumb, name, meta);
    card.addEventListener('click', () => selectResult(result.id));
    card.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      openResultMenu(result.id, event.clientX, event.clientY);
    });
    els.galleryTrack.append(card);
  }
  markSelectedCard();
  requestAnimationFrame(updateGalleryNav);
}

function galleryOverflows() {
  const track = els.galleryTrack;
  const shown = !els.galleryPrev.hidden;
  if (shown) {
    els.galleryPrev.hidden = true;
    els.galleryNext.hidden = true;
  }
  const overflow = track.scrollWidth - track.clientWidth > 2;
  if (shown) {
    els.galleryPrev.hidden = false;
    els.galleryNext.hidden = false;
  }
  return overflow;
}

function syncGalleryNavEnds() {
  const track = els.galleryTrack;
  els.galleryPrev.disabled = track.scrollLeft <= 1;
  els.galleryNext.disabled = track.scrollLeft + track.clientWidth >= track.scrollWidth - 2;
}

function updateGalleryNav() {
  const overflow = galleryOverflows();
  els.galleryPrev.hidden = !overflow;
  els.galleryNext.hidden = !overflow;
  if (overflow) syncGalleryNavEnds();
}

function scrollGallery(direction) {
  const track = els.galleryTrack;
  const view = track.getBoundingClientRect();
  const cards = [...track.querySelectorAll('.card')];
  const target = direction > 0
    ? cards.find((card) => card.getBoundingClientRect().right > view.right + 1)
    : [...cards].reverse().find((card) => card.getBoundingClientRect().left < view.left - 1);
  if (!target) return;
  const rect = target.getBoundingClientRect();
  const delta = direction > 0 ? rect.left - view.left : rect.right - view.right;
  track.scrollBy({ left: delta, behavior: 'smooth' });
}

function markSelectedCard() {
  for (const card of els.galleryTrack.children) {
    const on = card.dataset.id === state.selectedId;
    card.classList.toggle('selected', on);
    card.setAttribute('aria-pressed', String(on));
  }
}

function selectResult(id) {
  state.editing = false;
  state.viewZoom = 1;
  state.selectedId = id;
  markSelectedCard();
  renderStage();
  refreshChrome();
}

function renderStage() {
  const result = selected();
  const hasResult = Boolean(result);
  els.stageEmpty.hidden = hasResult;
  els.compare.hidden = !hasResult;
  if (!result) {
    els.statusDetail.textContent = '';
    return;
  }

  const imageAspect = result.imageWidth / result.imageHeight;
  const textAspect = layoutAspect(result);
  const sourceWidth = fitFrame(els.sourceSlot, els.sourceFrame, imageAspect, state.viewZoom);
  const textWidth = fitFrame(els.textSlot, els.textFrame, textAspect, state.viewZoom);
  els.compare.classList.toggle('is-zoomed', state.viewZoom > 1.01);
  els.sourcePreview.src = result.previewUrl;

  const showEditor = state.editing || result.edited;
  els.textFrame.classList.toggle('editing', showEditor);
  els.editor.readOnly = !state.editing;
  if (showEditor && document.activeElement !== els.editor) {
    els.editor.value = result.text;
  }
  els.editor.style.fontFamily = result.fontFamily;

  if (!showEditor && textWidth > 0) {
    paintAscii(
      els.textPreview,
      result,
      els.textFrame.clientWidth,
      window.devicePixelRatio || 1,
    );
  }

  els.sourceCaption.textContent = t('sourceCaption', { w: result.imageWidth, h: result.imageHeight });
  els.textCaption.textContent = captionFor(result);
  els.sourceCaption.title = els.sourceCaption.textContent;
  els.textCaption.title = els.textCaption.textContent;
  els.statusDetail.textContent = t('detail', {
    name: result.sourceName,
    style: labelOf(result.styleId, result.styleLabel),
    cols: result.cols,
    rows: result.rows,
  });
}

function captionFor(result) {
  if (result.edited) {
    return t('editedCaption');
  }
  const got = (result.cols * result.cellRatio) / result.rows;
  const want = result.imageWidth / result.imageHeight;
  const error = `${(result.error * 100).toFixed(2)}%`;
  const adjusted = result.cols === result.requestedCols
    ? ''
    : t('colsAdjusted', { from: result.requestedCols, to: result.cols });
  return t('textCaption', {
    cols: result.cols,
    rows: result.rows,
    got: got.toFixed(3),
    want: want.toFixed(3),
    error,
    adjusted,
  });
}

function onViewWheel(event) {
  if (!selected() || event.target.closest('textarea, button, input')) return;
  const slot = event.target.closest('.slot');
  if (!slot) return;
  event.preventDefault();
  const line = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? slot.clientHeight : 1;
  const delta = event.deltaY * line;
  if (!delta) return;
  const factor = Math.min(1.25, Math.max(0.8, Math.exp(-delta * 0.002)));
  const prev = state.viewZoom;
  const next = Math.min(4, Math.max(0.25, prev * factor));
  if (Math.abs(next - prev) < 0.001) return;
  const rect = slot.getBoundingClientRect();
  const anchorX = event.clientX - rect.left + slot.scrollLeft;
  const anchorY = event.clientY - rect.top + slot.scrollTop;
  const ratio = next / prev;
  state.viewZoom = next;
  renderStage();
  slot.scrollLeft = anchorX * ratio - (event.clientX - rect.left);
  slot.scrollTop = anchorY * ratio - (event.clientY - rect.top);
}

function slotCanPan(slot) {
  return slot.scrollWidth > slot.clientWidth + 1 || slot.scrollHeight > slot.clientHeight + 1;
}

function fitFrame(slot, frame, aspect, zoom = 1) {
  const maxWidth = slot.clientWidth;
  const maxHeight = slot.clientHeight;
  if (maxWidth < 8 || maxHeight < 8 || !Number.isFinite(aspect) || aspect <= 0) return 0;
  let width = maxWidth;
  let height = width / aspect;
  if (height > maxHeight) {
    height = maxHeight;
    width = height * aspect;
  }
  frame.style.width = `${Math.max(1, width * zoom)}px`;
  frame.style.height = `${Math.max(1, height * zoom)}px`;
  return width;
}

function thumbWidth(result, maxWidth, maxHeight) {
  const aspect = layoutAspect(result);
  const height = maxWidth / aspect;
  if (height <= maxHeight) return maxWidth;
  return maxHeight * aspect;
}

function toggleEdit() {
  const result = selected();
  if (!result) {
    setStatus('needEdit');
    return;
  }
  state.editing = !state.editing;
  renderStage();
  if (state.editing) els.editor.focus();
  refreshChrome();
}

async function copySelected() {
  const result = selected();
  if (!result) {
    setStatus('needCopy');
    return;
  }
  try {
    await navigator.clipboard.writeText(result.text);
    setStatus('copied');
  } catch (error) {
    setStatus('copyFailed', { error: errorText(error) });
  }
}

async function saveSelected(kind) {
  return saveResult(selected(), kind);
}

async function saveAllResults() {
  if (state.results.length === 0) {
    setStatus('saveNothing');
    return;
  }
  const used = new Map();
  const files = state.results.map((result) => {
    const base = `${stem(result.sourceName)}-${labelOf(result.styleId, result.styleLabel)}`;
    const count = (used.get(base) || 0) + 1;
    used.set(base, count);
    return {
      name: count === 1 ? base : `${base}-${count}`,
      text: result.text.replaceAll('\n', '\r\n'),
    };
  });
  try {
    const saved = await saveTexts(files);
    if (saved) {
      for (const result of state.results) result.savedText = result.text;
      setStatus('savedMany', { n: files.length });
    } else {
      setStatus('saveCancelled');
    }
  } catch (error) {
    setStatus('saveFailed', { error: errorText(error) });
  }
}

async function saveResult(result, kind) {
  if (!result) {
    setStatus('needSave');
    return false;
  }
  const base = `${stem(result.sourceName)}-${labelOf(result.styleId, result.styleLabel)}`;
  try {
    let saved = false;
    if (kind === 'txt') {
      saved = await saveAs({
        text: result.text.replaceAll('\n', '\r\n'),
        defaultName: `${base}.txt`,
        filterName: t('filterText'),
        extensions: ['txt'],
        mime: 'text/plain;charset=utf-8',
      });
    } else if (kind === 'html') {
      saved = await saveAs({
        text: toHtml(result),
        defaultName: `${base}.html`,
        filterName: 'HTML',
        extensions: ['html'],
        mime: 'text/html;charset=utf-8',
      });
    } else {
      const canvas = paintAscii(document.createElement('canvas'), result, exportPixelWidth(result), 1);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      const bytes = new Uint8Array(await blob.arrayBuffer());
      saved = await saveAs({
        bytes,
        defaultName: `${base}.png`,
        filterName: t('filterPng'),
        extensions: ['png'],
        mime: 'image/png',
      });
    }
    if (saved) result.savedText = result.text;
    setStatus(saved ? 'saved' : 'saveCancelled');
    return saved;
  } catch (error) {
    setStatus('saveFailed', { error: errorText(error) });
    return false;
  }
}

function selectedStyles() {
  const settings = readSettings();
  const styles = STYLE_PRESETS.filter((style) => settings.styles.includes(style.id));
  if (settings.custom && settings.customChars.length > 0) {
    styles.push({
      id: 'Custom',
      label: t('custom'),
      chars: settings.customChars,
      sample: sampleGlyph(settings.customChars),
    });
  }
  return styles;
}

function selected() {
  return state.results.find((result) => result.id === state.selectedId) ?? null;
}

function refreshChrome() {
  const settings = readSettings();
  els.colsOut.textContent = String(settings.cols);
  els.contrastOut.textContent = String(settings.contrast);
  els.brightnessOut.textContent = String(settings.brightness);
  const styleCount = selectedStyles().length;
  const imageCount = state.sources.length;
  if (imageCount === 0) {
    els.plan.textContent = t('planEmpty');
  } else if (styleCount === 0 && settings.custom && settings.customChars.length === 0) {
    els.plan.textContent = t('planNeedChars');
  } else if (styleCount === 0) {
    els.plan.textContent = t('planNeedStyle');
  } else {
    els.plan.textContent = t('planCount', {
      images: imageCount,
      styles: styleCount,
      total: imageCount * styleCount,
    });
  }
  els.convert.disabled = state.busy || imageCount === 0 || styleCount === 0;
  els.convert.classList.toggle('is-running', state.busy);
  const convertLabel = els.convert.querySelector('.tb-label');
  if (convertLabel) convertLabel.textContent = state.busy ? t('converting') : t('convert');
  els.clearSources.disabled = imageCount === 0;
  els.edit.setAttribute('aria-pressed', String(state.editing));
  const editLabel = els.edit.querySelector('.tb-label');
  if (editLabel) editLabel.textContent = state.editing ? t('editOff') : t('edit');
  const exportOn = Boolean(selected()) && !state.busy;
  els.edit.disabled = !exportOn;
  els.copy.disabled = !exportOn;
  els.txt.disabled = !exportOn;
  els.html.disabled = !exportOn;
  els.png.disabled = !exportOn;
  syncNudges();
  saveSettings(settings);
}

function nudgeInput(input, direction) {
  const marked = input.closest('.meter')?.dataset.nudgeStep;
  const step = Number(marked || input.step);
  const amount = Number.isFinite(step) && step > 0 ? step : 1;
  const min = Number(input.min);
  const max = Number(input.max);
  const current = Number(input.value);
  const next = Math.min(max, Math.max(min, Math.round((current + direction * amount) * 1000) / 1000));
  if (next === current) return;
  input.value = String(next);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function syncNudges() {
  for (const input of document.querySelectorAll('.meter input[type="range"]')) {
    const meter = input.closest('.meter');
    const value = Number(input.value);
    const down = meter?.querySelector('[data-nudge="-1"]');
    const up = meter?.querySelector('[data-nudge="1"]');
    if (down) down.disabled = value <= Number(input.min);
    if (up) up.disabled = value >= Number(input.max);
  }
}

function onKeyDown(event) {
  if (event.key === 'Escape' && !els.fileMenu.hidden) {
    event.preventDefault();
    closeFileMenu();
    return;
  }
  if (event.key === 'Escape' && !els.resultMenu.hidden) {
    event.preventDefault();
    closeResultMenu();
    return;
  }
  const field = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
  if (event.key === 'F5') {
    event.preventDefault();
    void convertAll();
    return;
  }
  if (event.key === 'F1') {
    event.preventDefault();
    openAbout();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key === ',') {
    event.preventDefault();
    openSettings();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'o') {
    event.preventDefault();
    void chooseImages();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault();
    void saveSelected('txt');
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'e') {
    event.preventDefault();
    toggleEdit();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c' && !field) {
    const selection = window.getSelection()?.toString();
    if (selection) return;
    event.preventDefault();
    void copySelected();
    return;
  }
  if (field) return;
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  const current = state.results.findIndex((result) => result.id === state.selectedId);
  if (current < 0) return;
  const next = state.results[current + (event.key === 'ArrowRight' ? 1 : -1)];
  if (!next) return;
  event.preventDefault();
  selectResult(next.id);
  els.galleryTrack.querySelector(`[data-id="${CSS.escape(next.id)}"]`)?.scrollIntoView({
    block: 'nearest',
    inline: 'nearest',
  });
}

function readSettings() {
  return {
    cols: Number(els.cols.value),
    styles: [...document.querySelectorAll('input[name="style"]:checked')].map((input) => input.value),
    custom: els.customOn.checked,
    customChars: els.customChars.value,
    contrast: Number(els.contrast.value),
    brightness: Number(els.brightness.value),
    invert: els.invert.checked,
    edge: els.edge.checked,
    color: els.color.checked,
    fontFamily: els.font.value,
    language: document.querySelector('input[name="language"]:checked')?.value === 'en' ? 'en' : 'ko',
    theme: document.documentElement.dataset.theme || DEFAULT_THEME,
    customThemes: state.customThemes,
    uiSize: clampSize(els.uiSize.value),
    uiBold: els.uiBold.checked,
    uiItalic: els.uiItalic.checked,
  };
}

function renderStyleChips() {
  const grid = document.querySelector('#style-grid');
  const anchor = grid.querySelector('.chip-custom');
  for (const style of STYLE_PRESETS) {
    const label = document.createElement('label');
    label.className = 'chip';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.name = 'style';
    input.value = style.id;
    input.checked = true;
    const name = document.createElement('span');
    name.className = 'chip-name';
    name.textContent = getLanguage() === 'en' ? style.labelEn : style.label;
    const sample = document.createElement('span');
    sample.className = 'chip-sample';
    sample.textContent = Array.from(style.chars).filter((char) => char !== ' ').slice(0, 2).join('');
    label.append(input, name, sample);
    grid.insertBefore(label, anchor);
  }
}

function fontFamilyName(value) {
  return String(value || '').split(',')[0].trim().replace(/^["']+|["']+$/g, '');
}

function cssFontFamily(name) {
  return `"${String(name).replace(/["\\]/g, '')}"`;
}

async function installedFontNames() {
  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const names = await invoke('list_fonts');
      if (Array.isArray(names) && names.length) return names;
    } catch {
      /* The browser list is the fallback. */
    }
  }
  if (typeof window.queryLocalFonts === 'function') {
    try {
      const fonts = await window.queryLocalFonts();
      const names = fonts.map((font) => font.family).filter(Boolean);
      if (names.length) return names;
    } catch {
      /* Permission or an unsupported webview. */
    }
  }
  return null;
}

function fillFontSelect(names, preferredName) {
  const seen = new Set();
  const unique = [];
  for (const name of names) {
    const trimmed = String(name || '').trim();
    const key = trimmed.toLocaleLowerCase();
    if (!trimmed || trimmed.startsWith('@') || trimmed.startsWith('.') || seen.has(key)) continue;
    seen.add(key);
    unique.push(trimmed);
  }
  unique.sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }));
  const preferred = preferredName || fontFamilyName(els.font.value) || 'Consolas';
  const fragment = document.createDocumentFragment();
  for (const name of unique) {
    const option = document.createElement('option');
    option.value = cssFontFamily(name);
    option.textContent = name;
    option.style.fontFamily = option.value;
    fragment.append(option);
  }
  els.font.replaceChildren(fragment);
  const match = [...els.font.options].find((option) => option.textContent.localeCompare(preferred, undefined, { sensitivity: 'accent' }) === 0);
  if (match) els.font.value = match.value;
  else if (preferred) {
    const option = document.createElement('option');
    option.value = cssFontFamily(preferred);
    option.textContent = preferred;
    option.style.fontFamily = option.value;
    els.font.append(option);
    els.font.value = option.value;
  }
}

function loadFontChoices() {
  if (fontListLoaded) return Promise.resolve();
  if (fontListTask) return fontListTask;
  fontListTask = (async () => {
    const names = await installedFontNames();
    if (!names?.length) {
      fontListTask = null;
      return;
    }
    fillFontSelect(names, fontFamilyName(els.font.value));
    fontListLoaded = true;
    refreshChrome();
  })();
  return fontListTask;
}

function sanitizeCustoms(list) {
  if (!Array.isArray(list)) return [];
  return list.filter((item) => item && typeof item.id === 'string' && item.id.startsWith('custom-')).map((item) => ({
    id: item.id,
    label: String(item.label || t('customThemeDefault')).slice(0, 40),
    mode: item.mode === 'light' ? 'light' : 'dark',
    bg: item.bg,
    panel: item.panel,
    text: item.text,
    accent: item.accent,
    titlebar: item.titlebar,
  }));
}

function applySettings(settings) {
  state.customThemes = sanitizeCustoms(settings.customThemes);
  els.cols.value = String(settings.cols);
  els.customOn.checked = settings.custom;
  els.customChars.value = settings.customChars;
  els.contrast.value = String(settings.contrast);
  els.brightness.value = String(settings.brightness);
  els.invert.checked = settings.invert;
  els.edge.checked = settings.edge;
  els.color.checked = settings.color;
  const savedFont = fontFamilyName(settings.fontFamily);
  const savedOption = [...els.font.options].find((option) => option.value === settings.fontFamily || option.textContent.localeCompare(savedFont, undefined, { sensitivity: 'accent' }) === 0);
  if (savedOption) els.font.value = savedOption.value;
  for (const input of document.querySelectorAll('input[name="style"]')) {
    input.checked = settings.styles.includes(input.value);
  }
  applyAppearance(settings);
}

function loadSettings() {
  try {
    const current = localStorage.getItem(SETTINGS_KEY);
    const legacy = localStorage.getItem(LEGACY_SETTINGS_KEY);
    const raw = current ?? legacy;
    if (!raw) return { ...DEFAULTS, styles: [...DEFAULTS.styles] };
    const parsed = JSON.parse(raw);
    const known = new Set(STYLE_PRESETS.map((style) => style.id));
    const styles = Array.isArray(parsed.styles)
      ? parsed.styles.filter((id) => known.has(id))
      : [...DEFAULTS.styles];
    const hasNewStyles = styles.some((id) => id !== 'Detailed' && id !== 'Standard' && id !== 'Simple' && id !== 'Block');
    return {
      ...DEFAULTS,
      ...parsed,
      styles: hasNewStyles ? styles : [...DEFAULTS.styles],
      customThemes: sanitizeCustoms(parsed.customThemes),
    };
  } catch {
    return { ...DEFAULTS, styles: [...DEFAULTS.styles] };
  }
}

function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function resetSettings() {
  const current = readSettings();
  applySettings({
    ...DEFAULTS,
    styles: [...DEFAULTS.styles],
    language: current.language,
    theme: current.theme,
    uiSize: current.uiSize,
    uiBold: current.uiBold,
    uiItalic: current.uiItalic,
  });
  refreshChrome();
  renderStage();
  setStatus('resetDone');
}

function resetAllSettings() {
  applySettings({ ...DEFAULTS, styles: [...DEFAULTS.styles] });
  refreshChrome();
  renderSources();
  renderRecent();
  renderGallery();
  renderStage();
  setStatus('resetAllDone');
}

function stem(name) {
  const bare = name.replace(/\.[^.]+$/, '').replace(/[<>:"/\\|?*]/g, '_').trim();
  return bare.slice(0, 80) || 'ascii';
}

function errorText(error) {
  return error instanceof Error ? error.message : String(error);
}

function yieldToUi() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function setStatus(key, vars) {
  state.statusKey = key;
  state.statusVars = vars || null;
  els.statusMessage.textContent = t(key, state.statusVars);
}

function labelOf(styleId, fallback) {
  const preset = STYLE_PRESETS.find((style) => style.id === styleId);
  if (preset) return getLanguage() === 'en' ? preset.labelEn : preset.label;
  if (styleId === 'Custom') return t('custom');
  return fallback || styleId;
}

function clampSize(value) {
  const size = Number(value);
  if (!Number.isFinite(size)) return 13;
  return Math.min(18, Math.max(12, Math.round(size)));
}

function fontBundle() {
  return { size: clampSize(els.uiSize.value), bold: els.uiBold.checked, italic: els.uiItalic.checked };
}

function applyAppearance(settings) {
  const language = settings.language === 'en' ? 'en' : 'ko';
  setLanguage(language);
  const radio = document.querySelector(`input[name="language"][value="${language}"]`);
  if (radio) radio.checked = true;
  const theme = applyTheme(settings.theme || DEFAULT_THEME, state.customThemes);
  markSelectedTheme(theme.id);
  renderThemeMenu();
  paintThemeButton();
  refreshThemeNames();
  const size = clampSize(settings.uiSize);
  els.uiSize.value = String(size);
  els.uiSizeOut.textContent = String(size);
  els.uiBold.checked = Boolean(settings.uiBold);
  els.uiItalic.checked = Boolean(settings.uiItalic);
  applyFont({ size, bold: settings.uiBold, italic: settings.uiItalic });
  refreshStyleLabels();
  applyDom();
  paintLanguageButton();
  paintThemeButton();
  paintWindowLabels();
  renderCustomEditor();
  if (els.aboutDialog.open) fillAbout();
  if (state.statusKey) els.statusMessage.textContent = t(state.statusKey, state.statusVars);
}

function paintLanguageButton() {
  const english = getLanguage() === 'en';
  els.flagUk.classList.toggle('is-off', english);
  els.flagKr.classList.toggle('is-off', !english);
}

function applyLanguage(language) {
  const settings = readSettings();
  settings.language = language === 'en' ? 'en' : 'ko';
  applyAppearance(settings);
  renderSources();
  renderRecent();
  renderGallery();
  renderStage();
  refreshChrome();
}

function themeItem(theme) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'theme-item';
  button.dataset.themeId = theme.id;
  button.setAttribute('role', 'menuitemradio');
  const swatch = document.createElement('span');
  swatch.className = 'mini-swatch';
  swatch.style.background = theme.tokens['--bg'];
  swatch.style.borderColor = theme.tokens['--border-strong'];
  const dot = document.createElement('i');
  dot.style.background = theme.tokens['--accent'];
  swatch.append(dot);
  const name = document.createElement('span');
  name.className = 'theme-name';
  name.textContent = themeLabel(theme, getLanguage());
  button.append(swatch, name);
  return button;
}

function renderThemeMenu() {
  const customs = state.customThemes.map((item) => themeById(item.id, state.customThemes));
  els.themeMenuDark.replaceChildren(...THEMES.filter((theme) => theme.mode === 'dark').map(themeItem));
  els.themeMenuLight.replaceChildren(...THEMES.filter((theme) => theme.mode === 'light').map(themeItem));
  els.themeMenuCustom.replaceChildren(...customs.map(themeItem));
  markSelectedTheme(document.documentElement.dataset.theme || DEFAULT_THEME);
}

function paintThemeButton() {
  const current = themeById(document.documentElement.dataset.theme || DEFAULT_THEME, state.customThemes);
  const next = themeById(nextThemeId(current.id, state.customThemes), state.customThemes);
  els.themeCurrent.textContent = themeLabel(current, getLanguage());
  els.themeSwatch.style.background = current.tokens['--bg'];
  els.themeSwatch.style.borderColor = current.tokens['--border-strong'];
  els.themeSwatchDot.style.background = current.tokens['--accent'];
  els.themeButton.title = `${t('themeTip')}: ${themeLabel(next, getLanguage())}`;
}

function cycleTheme() {
  applyChosenTheme(nextThemeId(document.documentElement.dataset.theme || DEFAULT_THEME, state.customThemes));
}

function applyChosenTheme(id) {
  const theme = applyTheme(id, state.customThemes);
  markSelectedTheme(theme.id);
  paintThemeButton();
  refreshChrome();
}

function toggleFileMenu() {
  if (!els.fileMenu.hidden) {
    closeFileMenu();
    return;
  }
  closeThemeMenu();
  closeResultMenu();
  renderRecent();
  els.fileMenu.hidden = false;
  els.fileButton.classList.add('open');
  els.fileButton.setAttribute('aria-expanded', 'true');
  placeFileMenu();
}

function placeFileMenu() {
  const anchor = els.fileButton.getBoundingClientRect();
  const menu = els.fileMenu;
  const margin = 8;
  const rect = menu.getBoundingClientRect();
  let left = anchor.left;
  if (left + rect.width > window.innerWidth - margin) {
    left = Math.max(margin, window.innerWidth - margin - rect.width);
  }
  let top = anchor.bottom + 6;
  if (top + rect.height > window.innerHeight - margin) {
    top = Math.max(margin, anchor.top - 6 - rect.height);
  }
  menu.style.left = `${Math.round(left)}px`;
  menu.style.top = `${Math.round(top)}px`;
}

function closeFileMenu() {
  els.fileMenu.hidden = true;
  els.fileButton.classList.remove('open');
  els.fileButton.setAttribute('aria-expanded', 'false');
}

function toggleThemeMenu() {
  if (els.themeMenu.hidden) closeFileMenu();
  const open = els.themeMenu.hidden;
  els.themeMenu.hidden = !open;
  els.themeMenuButton.classList.toggle('open', open);
  els.themeMenuButton.setAttribute('aria-expanded', String(open));
  if (open) {
    renderThemeMenu();
    placeThemeMenu();
  }
}

function openResultMenu(id, x, y) {
  const result = state.results.find((item) => item.id === id);
  if (!result) return;
  closeThemeMenu();
  closeFileMenu();
  selectResult(id);
  els.resultMenu.dataset.resultId = id;
  els.resultMenu.hidden = false;
  const menu = els.resultMenu.getBoundingClientRect();
  const left = Math.min(Math.max(8, x), Math.max(8, window.innerWidth - menu.width - 8));
  const top = Math.min(Math.max(8, y), Math.max(8, window.innerHeight - menu.height - 8));
  els.resultMenu.style.left = `${Math.round(left)}px`;
  els.resultMenu.style.top = `${Math.round(top)}px`;
}

function closeResultMenu() {
  els.resultMenu.hidden = true;
}

function placeThemeMenu() {
  const anchor = els.themeMenuButton.getBoundingClientRect();
  const menu = els.themeMenu;
  const margin = 8;
  const width = Math.min(640, window.innerWidth - margin * 2);
  menu.style.width = `${width}px`;
  let right = window.innerWidth - anchor.right;
  const maxRight = window.innerWidth - margin - width;
  right = Math.min(Math.max(margin, right), Math.max(margin, maxRight));
  menu.style.top = `${Math.round(anchor.bottom + 6)}px`;
  menu.style.right = `${Math.round(right)}px`;
  menu.style.left = 'auto';
}

function closeThemeMenu() {
  els.themeMenu.hidden = true;
  els.themeMenuButton.classList.remove('open');
  els.themeMenuButton.setAttribute('aria-expanded', 'false');
}

function markSelectedTheme(id) {
  for (const button of document.querySelectorAll('.theme-item')) {
    const on = button.dataset.themeId === id;
    button.classList.toggle('selected', on);
    button.setAttribute('aria-checked', String(on));
  }
}

function refreshThemeNames() {
  const language = getLanguage();
  for (const button of document.querySelectorAll('.theme-item')) {
    const theme = themeById(button.dataset.themeId, state.customThemes);
    const name = button.querySelector('.theme-name');
    if (theme && name) name.textContent = themeLabel(theme, language);
  }
  paintThemeButton();
}

function showSettingsPage(page) {
  const id = page === 'appearance' || page === 'theme' ? page : 'general';
  for (const button of document.querySelectorAll('[data-settings-tab]')) {
    const on = button.dataset.settingsTab === id;
    button.classList.toggle('active', on);
    button.setAttribute('aria-selected', String(on));
  }
  for (const section of document.querySelectorAll('[data-settings-page]')) {
    section.hidden = section.dataset.settingsPage !== id;
  }
  if (id === 'theme') renderCustomEditor();
}

function hexOf(value, fallback) {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function renderCustomEditor() {
  const list = state.customThemes;
  els.customEmpty.hidden = list.length > 0;
  els.customForm.hidden = list.length === 0;
  els.customDelete.disabled = list.length === 0;
  const previous = els.customPick.value;
  els.customPick.replaceChildren();
  for (const item of list) {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = item.label || t('customThemeDefault');
    els.customPick.append(option);
  }
  const active = list.find((item) => item.id === document.documentElement.dataset.theme)
    || list.find((item) => item.id === previous)
    || list[0];
  if (!active) return;
  els.customPick.value = active.id;
  els.customName.value = active.label || '';
  for (const input of document.querySelectorAll('input[name="custom-mode"]')) {
    input.checked = input.value === (active.mode === 'light' ? 'light' : 'dark');
  }
  els.customBg.value = hexOf(active.bg, '#1a1d27');
  els.customPanel.value = hexOf(active.panel, '#242836');
  els.customText.value = hexOf(active.text, '#e8eaf2');
  els.customAccent.value = hexOf(active.accent, '#7aa2f7');
  els.customTitlebar.value = hexOf(active.titlebar, '#13151c');
}

function patchCustom(fields) {
  const id = els.customPick.value;
  if (!id) return;
  state.customThemes = state.customThemes.map((item) => (item.id === id ? { ...item, ...fields } : item));
  if (document.documentElement.dataset.theme === id) applyChosenTheme(id);
  else {
    renderThemeMenu();
    refreshChrome();
  }
}

function addCustomTheme() {
  const id = `custom-${Date.now().toString(36)}`;
  state.customThemes = [...state.customThemes, {
    id,
    label: t('customThemeDefault'),
    mode: 'dark',
    bg: '#1a1d27',
    panel: '#242836',
    text: '#e8eaf2',
    accent: '#7aa2f7',
    titlebar: '#13151c',
  }];
  applyChosenTheme(id);
  renderCustomEditor();
}

function deleteCustomTheme() {
  const id = els.customPick.value;
  if (!id) return;
  state.customThemes = state.customThemes.filter((item) => item.id !== id);
  if (document.documentElement.dataset.theme === id) applyChosenTheme(DEFAULT_THEME);
  else renderThemeMenu();
  renderCustomEditor();
  refreshChrome();
}

function refreshStyleLabels() {
  for (const input of document.querySelectorAll('input[name="style"]')) {
    const preset = STYLE_PRESETS.find((style) => style.id === input.value);
    const name = input.parentElement?.querySelector('.chip-name');
    if (preset && name) name.textContent = getLanguage() === 'en' ? preset.labelEn : preset.label;
  }
}

function openSettings(page) {
  closeThemeMenu();
  showSettingsPage(page);
  if (els.aboutDialog.open) els.aboutDialog.close();
  if (!els.settingsDialog.open) els.settingsDialog.showModal();
}

function openAbout() {
  if (els.settingsDialog.open) els.settingsDialog.close();
  fillAbout();
  if (!els.aboutDialog.open) els.aboutDialog.showModal();
}

function fillAbout() {
  els.aboutRuntime.textContent = isTauri() ? t('runtimeTauri') : t('runtimeWeb');
  els.aboutPlatform.textContent = navigator.userAgentData?.platform || navigator.platform || '';
  els.aboutFormats.textContent = formatList();
  els.aboutBuild.textContent = buildSummary();
}

function buildSummary() {
  const when = new Intl.DateTimeFormat(getLanguage() === 'ko' ? 'ko-KR' : 'en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(buildInfo.time));
  const kind = t(buildInfo.config === 'release' ? 'buildRelease' : buildInfo.config === 'debug' ? 'buildDebug' : 'buildDevelopment');
  const tools = [
    buildInfo.vite ? `Vite ${buildInfo.vite}` : '',
    buildInfo.tauri ? `Tauri ${buildInfo.tauri}` : '',
  ].filter(Boolean).join(', ');
  return [when, kind, buildInfo.target, tools].filter(Boolean).join(' · ');
}

async function copyAbout() {
  const text = [
    'Image2Text',
    `${t('aboutVersion')}: 2.0.0`,
    `${t('aboutAuthor')}: ${els.aboutAuthor.textContent}`,
    `${t('aboutLicense')}: MIT`,
    `${t('aboutBuild')}: ${els.aboutBuild.textContent}`,
    `${t('aboutRuntime')}: ${els.aboutRuntime.textContent}`,
    `${t('aboutPlatform')}: ${els.aboutPlatform.textContent}`,
    `${t('aboutFormats')}: ${els.aboutFormats.textContent}`,
    t('aboutDescription'),
  ].join('\n');
  try {
    await navigator.clipboard.writeText(text);
    setStatus('infoCopied');
  } catch (error) {
    setStatus('copyFailed', { error: errorText(error) });
  }
}

function paintWindowLabels() {
  const maxButton = document.querySelector('#win-max');
  const controls = document.querySelector('#window-controls');
  if (!maxButton || !controls || controls.hidden) return;
  maxButton.setAttribute('aria-label', state.maximized ? t('restore') : t('maximize'));
}

function unsavedResults() {
  return state.results.filter((result) => result.savedText !== result.text);
}

let closePrompt = null;

function confirmClose() {
  if (unsavedResults().length === 0) return Promise.resolve(true);
  if (!closePrompt) {
    closePrompt = askSaveOnClose().then(async (choice) => {
      closePrompt = null;
      if (choice === 'cancel') return false;
      if (choice === 'save') return saveUnsavedResults();
      return true;
    });
  }
  return closePrompt;
}

function askSaveOnClose() {
  els.savePrompt.textContent = t('savePrompt', { n: unsavedResults().length });
  const dialog = els.saveDialog;
  return new Promise((resolve) => {
    const finish = () => {
      dialog.removeEventListener('close', finish);
      resolve(dialog.returnValue === 'save' || dialog.returnValue === 'discard' ? dialog.returnValue : 'cancel');
    };
    dialog.addEventListener('close', finish);
    dialog.showModal();
  });
}

async function saveUnsavedResults() {
  const pending = unsavedResults();
  const current = state.selectedId;
  pending.sort((a, b) => (a.id === current ? -1 : b.id === current ? 1 : 0));
  for (const result of pending) {
    selectResult(result.id);
    if (!(await saveSelected('txt'))) return false;
  }
  return true;
}

async function setupWindowControls() {
  if (!('__TAURI_INTERNALS__' in window)) {
    document.querySelector('#win-close').addEventListener('click', async () => {
      if (await confirmClose()) window.close();
    });
    window.addEventListener('beforeunload', (event) => {
      if (unsavedResults().length === 0) return;
      event.preventDefault();
      event.returnValue = '';
    });
    return;
  }
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  const win = getCurrentWindow();
  const controls = document.querySelector('#window-controls');
  const maxButton = document.querySelector('#win-max');
  const grip = document.querySelector('#resize-grip');
  controls.hidden = false;

  const sync = async () => {
    const maximized = await win.isMaximized();
    state.maximized = maximized;
    maxButton.classList.toggle('is-max', maximized);
    maxButton.setAttribute('aria-label', maximized ? t('restore') : t('maximize'));
    grip.hidden = maximized;
  };

  grip.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    void win.startResizeDragging('SouthEast');
  });

  document.querySelector('#win-min').addEventListener('click', () => win.minimize());
  maxButton.addEventListener('click', () => win.toggleMaximize());
  document.querySelector('#win-close').addEventListener('click', () => win.close());
  await win.onCloseRequested(async (event) => {
    if (!(await confirmClose())) event.preventDefault();
  });
  for (const region of document.querySelectorAll('#titlebar, .sources > .panel-head')) {
    region.addEventListener('dblclick', (event) => {
      if (event.target.closest('button, input, label, select, a')) return;
      win.toggleMaximize();
    });
  }
  await sync();
  window.addEventListener('resize', () => { void sync(); });
}
