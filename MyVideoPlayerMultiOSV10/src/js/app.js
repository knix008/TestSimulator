import { loadSettings, saveSettings, resetSettings } from './settings.js';
import { parseSubtitle, SubtitleRenderer, findSubtitleInFileList } from './subtitles.js';
import { SpectrumAnalyzer, SpectrumPainter, SPECTRUM_STYLES, normalizeSpectrumStyle } from './spectrum.js';
import { initTooltips } from './tooltip.js';
import { YouTubePlayerController, extractYouTubeId, isYouTubeUrl } from './youtube-player.js';
import { loadRecent, addRecent, clearRecent, removeRecent, RECENT_LIMIT } from './recent.js';
import {
  BUILTIN_THEMES,
  BUILTIN_THEME_NAME_KEYS,
  THEME_EDIT_KEYS,
  applyThemeToDocument,
  syncThemeToOverlays,
  getThemeDefinition,
  loadCustomThemes,
  upsertCustomTheme,
  deleteCustomTheme,
  createThemeId,
  cloneVarsFromTheme,
  ensureDerivedVars
} from './themes.js';
import { t, setLocale, applyI18n, resolveInitialLocale } from './i18n.js';
import { createErrorDialogController, mediaErrorDetail } from './error-dialog.js';
import { isEditableTarget, isModalOpen, isSpaceKey } from './hotkeys.js';

const isElectron = Boolean(window.desktopAPI?.isElectron);
if (isElectron) {
  document.documentElement.classList.add('is-electron');
  document.body.classList.add('is-electron');
}
const $ = (id) => document.getElementById(id);

const els = {
  media: $('media'),
  seekBar: $('seekBar'),
  volumeBar: $('volumeBar'),
  volumeValue: $('volumeValue'),
  timeCurrent: $('timeCurrent'),
  timeDuration: $('timeDuration'),
  btnPlay: $('btnPlay'),
  dropHint: $('dropHint'),
  stage: $('stage'),
  subtitleOverlay: $('subtitleOverlay'),
  playbackOverlay: $('playbackOverlay'),
  playbackOverlayLabel: $('playbackOverlayLabel'),
  videoWrap: $('videoWrap'),
  youtubeContainer: $('youtubeContainer'),
  settingsModal: $('settingsModal'),
  aboutModal: $('aboutModal'),
  youtubeModal: $('youtubeModal'),
  youtubeUrlInput: $('youtubeUrlInput'),
  youtubeError: $('youtubeError'),
  statusFile: $('statusFile'),
  statusFormat: $('statusFormat'),
  statusSubtitle: $('statusSubtitle'),
  statusState: $('statusState'),
  statusRate: $('statusRate'),
  statusTheme: $('statusTheme'),
  statusPlatform: $('statusPlatform'),
  webMediaInput: $('webMediaInput'),
  webSubInput: $('webSubInput'),
  btnSaveYt: $('btnSaveYt'),
  rateSelect: $('rateSelect'),
  btnRecent: $('btnRecent'),
  recentMenu: $('recentMenu'),
  recentList: $('recentList'),
  btnClearRecent: $('btnClearRecent'),
  btnLocale: $('btnLocale'),
  localeBtnLabel: $('localeBtnLabel'),
  btnTheme: $('btnTheme'),
  themeMenu: $('themeMenu'),
  themeList: $('themeList'),
  btnToolbarEditTheme: $('btnToolbarEditTheme'),
  errorModal: $('errorModal'),
  errorTitle: $('errorTitle'),
  errorMessage: $('errorMessage'),
  errorDetail: $('errorDetail'),
  errorCopied: $('errorCopied'),
  btnCopyError: $('btnCopyError'),
  btnCloseError: $('btnCloseError'),
  spectrumPopup: $('spectrumPopup'),
  spectrumCanvas: $('spectrumCanvas'),
  spectrumPopupDrag: $('spectrumPopupDrag'),
  spectrumStyleName: $('spectrumStyleName')
};

const errorDialog = createErrorDialogController({
  dialog: els.errorModal,
  titleEl: els.errorTitle,
  messageEl: els.errorMessage,
  detailEl: els.errorDetail,
  copyBtn: els.btnCopyError,
  closeBtn: els.btnCloseError,
  copiedEl: els.errorCopied,
  t
});

function showAppError({
  title,
  message,
  detail = '',
  error = null,
  context = {},
  statusMessage = null
} = {}) {
  const summary = message || t('errorDefaultMessage');
  errorDialog.show({
    title: title || t('errorDefaultTitle'),
    message: summary,
    detail,
    error,
    context
  });
  setStatus({ state: statusMessage || summary });
}

const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];

let settings = loadSettings();
let currentObjectUrl = null;
let currentMediaPath = null;
/** Paths already converted after a decode error: 'soft' | 'full'. */
const compatTriedPaths = new Map();
let compatInFlight = false;
let currentMediaName = null;
let seeking = false;
/** @type {number|null} */
let pendingSeekTarget = null;
let seekWatchdog = 0;
let appInfo = null;
let youtubeMode = false;
let currentYouTube = null; // { id, url, title }
let overlayTimer = 0;
/** @type {'paused' | 'stopped' | null} */
let holdOverlayMode = null;
let stopRequested = false;
let ytErrorDialogShown = false;

const subtitles = new SubtitleRenderer(els.subtitleOverlay);
let spectrumPopupOpen = false;

const spectrumPainter = els.spectrumCanvas ? new SpectrumPainter(els.spectrumCanvas) : null;

function syncSpectrumPainterTheme() {
  if (!spectrumPainter) return;
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg-panel').trim();
  spectrumPainter.setBackground(bg || '#161a22');
}

function pushSpectrumFrame(bins) {
  if (!spectrumPopupOpen || !settings.showSpectrum || !spectrumPainter) return;
  spectrumPainter.paint(bins);
}

const spectrum = new SpectrumAnalyzer(els.media, { onFrame: pushSpectrumFrame });

function openSpectrumPopup() {
  const popup = els.spectrumPopup;
  if (!popup || !spectrumPainter) return false;
  syncSpectrumPainterTheme();
  spectrumPainter.setStyle(settings.spectrumStyle);
  if (els.spectrumStyleName) {
    els.spectrumStyleName.textContent = spectrumStyleLabel(settings.spectrumStyle);
  }
  popup.hidden = false;
  spectrumPopupOpen = true;
  // Ensure it stays inside the video area after open/resize.
  clampSpectrumPopupPosition();
  spectrumPainter.resize();
  return true;
}

function closeSpectrumPopup({ updateSetting = false } = {}) {
  if (els.spectrumPopup) els.spectrumPopup.hidden = true;
  spectrumPopupOpen = false;
  spectrum.stop();
  spectrumPainter?.clear();
  if (updateSetting && settings.showSpectrum) {
    settings.showSpectrum = false;
    saveSettings(settings);
    $('btnSpectrum')?.setAttribute('aria-pressed', 'false');
    if ($('settingShowSpectrum')) $('settingShowSpectrum').checked = false;
  }
}

function clampSpectrumPopupPosition() {
  const popup = els.spectrumPopup;
  const parent = els.videoWrap;
  if (!popup || !parent || popup.hidden) return;
  const p = parent.getBoundingClientRect();
  const w = popup.offsetWidth;
  const h = popup.offsetHeight;
  let left = popup.offsetLeft;
  let top = popup.offsetTop;
  // If still using right/bottom defaults, resolve to left/top once moved/clamped.
  if (!popup.style.left && !popup.style.top) {
    left = Math.max(0, p.width - w - 14);
    top = Math.max(0, p.height - h - 14);
  }
  left = Math.max(0, Math.min(left, Math.max(0, p.width - w)));
  top = Math.max(0, Math.min(top, Math.max(0, p.height - h)));
  popup.style.left = `${left}px`;
  popup.style.top = `${top}px`;
  popup.style.right = 'auto';
  popup.style.bottom = 'auto';
}

function bindSpectrumPopupChrome() {
  const popup = els.spectrumPopup;
  const handle = els.spectrumPopupDrag;
  if (!popup || !handle) return;

  let dragging = false;
  let grabX = 0;
  let grabY = 0;

  handle.addEventListener('pointerdown', (e) => {
    if (e.button != null && e.button !== 0) return;
    if (e.target.closest?.('button')) return;
    const rect = popup.getBoundingClientRect();
    dragging = true;
    grabX = e.clientX - rect.left;
    grabY = e.clientY - rect.top;
    handle.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  });

  handle.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const parent = els.videoWrap.getBoundingClientRect();
    const w = popup.offsetWidth;
    const h = popup.offsetHeight;
    let left = e.clientX - parent.left - grabX;
    let top = e.clientY - parent.top - grabY;
    left = Math.max(0, Math.min(left, Math.max(0, parent.width - w)));
    top = Math.max(0, Math.min(top, Math.max(0, parent.height - h)));
    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;
    popup.style.right = 'auto';
    popup.style.bottom = 'auto';
  });

  const endDrag = () => { dragging = false; };
  handle.addEventListener('pointerup', endDrag);
  handle.addEventListener('pointercancel', endDrag);

  $('btnSpectrumPopupClose')?.addEventListener('click', (e) => {
    e.stopPropagation();
    closeSpectrumPopup({ updateSetting: true });
  });
  $('btnSpectrumPrev')?.addEventListener('click', (e) => {
    e.stopPropagation();
    cycleSpectrumStyle(-1);
  });
  $('btnSpectrumNext')?.addEventListener('click', (e) => {
    e.stopPropagation();
    cycleSpectrumStyle(1);
  });

  // Prevent clicks on popup from toggling play.
  popup.addEventListener('click', (e) => e.stopPropagation());
  popup.addEventListener('dblclick', (e) => e.stopPropagation());

  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => {
      if (!popup.hidden) {
        clampSpectrumPopupPosition();
        spectrumPainter?.resize();
      }
    });
    ro.observe(popup);
    if (els.videoWrap) ro.observe(els.videoWrap);
  } else {
    window.addEventListener('resize', () => {
      if (!popup.hidden) {
        clampSpectrumPopupPosition();
        spectrumPainter?.resize();
      }
    });
  }
}

function clearOverlayTimer() {
  if (overlayTimer) {
    clearTimeout(overlayTimer);
    overlayTimer = 0;
  }
}

const OVERLAY_ICON_MAP = {
  play: '.ov-play',
  paused: '.ov-pause',
  stopped: '.ov-stop'
};

function setOverlayIcon(card, mode) {
  const icons = card.querySelectorAll('.playback-overlay-icon svg');
  icons.forEach((svg) => svg.classList.remove('is-on'));
  const sel = OVERLAY_ICON_MAP[mode] || OVERLAY_ICON_MAP.play;
  card.querySelector(sel)?.classList.add('is-on');
}

function showPlaybackOverlay(mode, { hold = false, label } = {}) {
  const root = els.playbackOverlay;
  const card = root?.querySelector('.playback-overlay-card');
  if (!root || !card) return;

  clearOverlayTimer();
  holdOverlayMode = null;

  const labels = {
    play: t('overlayPlay'),
    paused: t('overlayPaused'),
    stopped: t('overlayStopped')
  };

  // Exclusive mode + single glyph (prevents pause+play icons stacking).
  card.dataset.mode = mode;
  setOverlayIcon(card, mode);
  els.playbackOverlayLabel.textContent = label || labels[mode] || mode;

  root.hidden = false;
  root.classList.remove('dimmed');
  root.classList.add('visible');

  // restart pop animation on the card only
  card.style.animation = 'none';
  void card.offsetHeight;
  card.style.animation = '';

  if (hold) {
    holdOverlayMode = mode === 'play' ? null : mode;
    return;
  }

  overlayTimer = window.setTimeout(() => {
    hidePlaybackOverlay(true);
  }, 700);
}

function hidePlaybackOverlay(force = false) {
  if (!force && holdOverlayMode) return;
  clearOverlayTimer();
  holdOverlayMode = null;
  const root = els.playbackOverlay;
  const card = root?.querySelector('.playback-overlay-card');
  if (!root) return;
  root.classList.remove('visible', 'dimmed');
  if (card) {
    card.querySelectorAll('.playback-overlay-icon svg').forEach((svg) => {
      svg.classList.remove('is-on');
    });
  }
  overlayTimer = window.setTimeout(() => {
    root.hidden = true;
    overlayTimer = 0;
  }, 160);
}

/** Coalesce overlay flashes so pause→play never stacks two glyphs. */
let lastOverlayNotify = { mode: '', at: 0 };
let overlaySeq = 0;

function notifyOverlayOnce(mode, options) {
  const now = Date.now();
  // Ignore duplicate same-mode events
  if (lastOverlayNotify.mode === mode && now - lastOverlayNotify.at < 350) {
    return;
  }
  // If switching quickly (e.g. pause then play), replace — never layer.
  lastOverlayNotify = { mode, at: now };
  const seq = ++overlaySeq;
  showPlaybackOverlay(mode, options);
  // Drop stale hide timers from a replaced flash
  if (seq !== overlaySeq) return;
}

function notifyPlaying() {
  stopRequested = false;
  holdOverlayMode = null;
  notifyOverlayOnce('play', { hold: false });
}

function notifyPaused() {
  if (stopRequested) return;
  // Keep pause icon visible until play / stop / new media.
  notifyOverlayOnce('paused', { hold: true });
}

function notifyStopped() {
  stopRequested = true;
  holdOverlayMode = null;
  notifyOverlayOnce('stopped', { hold: false, label: t('overlayStopped') });
}

const ytPlayer = new YouTubePlayerController(els.youtubeContainer, {
  onReady: (ctrl) => {
    setStatus({
      file: ctrl.title || currentYouTube?.title || currentYouTube?.id || 'YouTube',
      format: 'YouTube',
      state: settings.autoplay ? statusKey('statusPlaying') : statusKey('statusReady'),
      subtitle: statusKey('statusYtCaptions')
    });
    if (currentYouTube) {
      currentYouTube.title = ctrl.title || currentYouTube.title;
      rememberRecentYouTube({
        id: currentYouTube.id,
        url: currentYouTube.url,
        title: currentYouTube.title
      });
    }
    updateSaveButton();
    if (settings.autoplay) notifyPlaying();
  },
  onStateChange: (state) => {
    if (state === 'playing') {
      updatePlayIcons(true);
      setStatus({ state: statusKey('statusPlaying') });
      notifyPlaying();
    } else if (state === 'paused') {
      updatePlayIcons(false);
      if (stopRequested) {
        // stopPlayback() already showed the stopped overlay — only sync status.
        setStatus({ state: statusKey('statusStopped') });
      } else {
        setStatus({ state: statusKey('statusPaused') });
        notifyPaused();
      }
    } else if (state === 'ended') {
      updatePlayIcons(false);
      setStatus({ state: statusKey('statusEnded') });
      notifyOverlayOnce('stopped', { hold: false, label: t('overlayEnded') });
    } else if (state === 'buffering') {
      setStatus({ state: statusKey('statusBuffering') });
    } else if (state === 'cued' || state === 'unstarted') {
      if (stopRequested) {
        updatePlayIcons(false);
        setStatus({ state: statusKey('statusStopped') });
        // Overlay already shown by stopPlayback(); skip duplicate.
      }
    }
  },
  onError: (message) => {
    ytErrorDialogShown = true;
    showAppError({
      title: t('errorYoutubeTitle'),
      message,
      detail: String(message || ''),
      context: {
        mode: 'youtube',
        videoId: currentYouTube?.id || '',
        url: currentYouTube?.url || ''
      }
    });
  },
  onTime: (current, duration) => {
    if (!youtubeMode || seeking) return;
    els.timeCurrent.textContent = formatTime(current);
    els.timeDuration.textContent = formatTime(duration);
    if (duration > 0) {
      els.seekBar.value = String(Math.round((current / duration) * 1000));
      syncSeekBarFill();
    }
  }
});

function updateSaveButton() {
  const canSave = Boolean(youtubeMode && currentYouTube?.url && isElectron);
  els.btnSaveYt.disabled = !canSave;
}

function formatRecentTime(ts) {
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return '';
  }
}

function rememberRecentFile({ path: filePath, name, title, ext }) {
  if (!filePath) return;
  addRecent({
    type: 'file',
    id: `file:${filePath}`,
    path: filePath,
    name: name || filePath,
    title: title || name || filePath,
    ext: ext || ''
  });
  renderRecentMenu();
}

function rememberRecentYouTube({ id, url, title }) {
  if (!id || !url) return;
  addRecent({
    type: 'youtube',
    id: `youtube:${id}`,
    url,
    name: title || id,
    title: title || id
  });
  renderRecentMenu();
}

function renderRecentMenu() {
  const items = loadRecent();
  const list = els.recentList;
  if (!list || !els.recentMenu) return;
  list.innerHTML = '';
  els.recentMenu.classList.toggle('is-empty', items.length === 0);
  els.btnRecent?.setAttribute(
    'data-tooltip',
    items.length
      ? t('recentCount', { n: items.length, max: RECENT_LIMIT })
      : t('recentEmptyTip')
  );

  for (const item of items) {
    const li = document.createElement('li');
    li.className = 'recent-row';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'recent-item';
    btn.setAttribute('role', 'menuitem');
    btn.dataset.id = item.id;
    btn.title = item.type === 'file' ? (item.path || item.title) : (item.url || item.title);
    btn.innerHTML = `
      <span class="recent-badge ${item.type === 'youtube' ? 'yt' : 'file'}">${item.type === 'youtube' ? 'YT' : 'FILE'}</span>
      <span class="recent-title"></span>
      <span class="recent-meta"></span>
    `;
    btn.querySelector('.recent-title').textContent = item.title || item.name;
    btn.querySelector('.recent-meta').textContent = formatRecentTime(item.playedAt);
    btn.addEventListener('click', () => {
      closeRecentMenu();
      playRecentItem(item);
    });

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'recent-delete';
    del.title = t('recentDelete');
    del.setAttribute('aria-label', t('recentDelete'));
    del.textContent = '✕';
    del.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      removeRecent(item.id);
      renderRecentMenu();
      setStatus({ state: statusKey('statusRecentRemoved') });
    });

    li.appendChild(btn);
    li.appendChild(del);
    list.appendChild(li);
  }
}

function openRecentMenu() {
  closeToolbarMenus({ except: 'recent' });
  renderRecentMenu();
  syncThemeToOverlays();
  els.recentMenu.hidden = false;
  els.btnRecent.setAttribute('aria-expanded', 'true');
}

function closeRecentMenu() {
  if (!els.recentMenu) return;
  els.recentMenu.hidden = true;
  els.btnRecent?.setAttribute('aria-expanded', 'false');
}

function toggleRecentMenu() {
  if (els.recentMenu.hidden) openRecentMenu();
  else closeRecentMenu();
}

function closeToolbarMenus({ except = null } = {}) {
  if (except !== 'recent') closeRecentMenu();
  if (except !== 'theme') closeThemeMenu();
}

function updateLocaleToolbarButton() {
  const locale = getLocaleSafe();
  // Show the language you can switch to (not the current one).
  const nextLabel = locale === 'ko' ? 'ENG' : '한글';
  if (els.localeBtnLabel) els.localeBtnLabel.textContent = nextLabel;
  els.btnLocale?.setAttribute('data-tooltip', `${t('languageTip')}: ${nextLabel}`);
  els.btnLocale?.setAttribute('aria-label', `${t('language')}: ${nextLabel}`);
}

/** Keep the frameless window wide enough that toolbar controls stay visible. */
function syncWindowMinWidth() {
  if (!isElectron || !window.desktopAPI?.setMinimumSize) return;
  const toolbar = document.getElementById('toolbar');
  const left = toolbar?.querySelector('.toolbar-left');
  const right = toolbar?.querySelector('.toolbar-right');
  const caps = document.getElementById('windowControls');
  if (!toolbar || !left || !right) return;

  const measure = () => {
    const columnGap = 4 * 3;
    const spacerMin = 16;
    const safety = 12;
    const capsW =
      caps && getComputedStyle(caps).display !== 'none'
        ? caps.getBoundingClientRect().width
        : 0;
    const needed = Math.ceil(
      left.getBoundingClientRect().width +
        right.getBoundingClientRect().width +
        capsW +
        spacerMin +
        columnGap +
        safety
    );
    const minW = Math.max(800, Math.min(needed, 1100));
    void window.desktopAPI.setMinimumSize(minW, 420);
  };

  requestAnimationFrame(measure);
}

function toggleLocale() {
  const next = getLocaleSafe() === 'ko' ? 'en' : 'ko';
  applyLocale(next);
}

function renderThemeMenu() {
  const list = els.themeList;
  if (!list) return;
  const current = settings.theme;
  list.innerHTML = '';

  const addGroup = (label) => {
    const group = document.createElement('li');
    group.className = 'popup-group-label';
    group.textContent = label;
    list.appendChild(group);
  };

  const addItem = (id, label) => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `popup-item${id === current ? ' is-active' : ''}`;
    btn.setAttribute('role', 'menuitemradio');
    btn.setAttribute('aria-checked', String(id === current));
    btn.dataset.theme = id;
    btn.innerHTML = `<span class="popup-item-label"></span><span class="popup-item-check" aria-hidden="true"></span>`;
    btn.querySelector('.popup-item-label').textContent = label;
    btn.querySelector('.popup-item-check').textContent = id === current ? '✓' : '';
    btn.addEventListener('click', async () => {
      closeThemeMenu();
      await selectTheme(id);
    });
    li.appendChild(btn);
    list.appendChild(li);
  };

  addGroup(t('builtinGroup'));
  for (const theme of BUILTIN_THEMES) {
    addItem(theme.id, t(BUILTIN_THEME_NAME_KEYS[theme.id] || theme.name));
  }

  const customs = loadCustomThemes();
  if (customs.length) {
    addGroup(t('customGroup'));
    for (const theme of customs) {
      addItem(`custom:${theme.id}`, theme.name);
    }
  }

  els.btnTheme?.setAttribute('data-tooltip', `${t('themeTip')}: ${themeDisplayName(current)}`);
}

function openThemeMenu() {
  closeToolbarMenus({ except: 'theme' });
  renderThemeMenu();
  // Apply scheme first so high-contrast menu colors resolve before paint.
  syncThemeToOverlays();
  els.themeMenu.hidden = false;
  els.btnTheme?.setAttribute('aria-expanded', 'true');
}

function closeThemeMenu() {
  if (!els.themeMenu) return;
  els.themeMenu.hidden = true;
  els.btnTheme?.setAttribute('aria-expanded', 'false');
}

function toggleThemeMenu() {
  if (els.themeMenu?.hidden) openThemeMenu();
  else closeThemeMenu();
}

async function selectTheme(themeId) {
  if (!themeId) return;
  settings.theme = themeId;
  saveSettings(settings);
  populateThemeSelect(themeId);
  await applyTheme(themeId);
  renderThemeMenu();
}

async function playRecentItem(item) {
  if (!item) return;
  if (item.type === 'youtube') {
    await playYouTubeFromInput(item.url || item.id.replace(/^youtube:/, ''));
    return;
  }
  if (item.type === 'file') {
    if (!isElectron || !item.path) {
      setStatus({ state: statusKey('statusRecentDesktopOnly') });
      return;
    }
    const result = await window.desktopAPI.openMediaPath(item.path);
    if (!result?.ok) {
      showAppError({
        title: t('errorFileTitle'),
        message: result?.error || t('statusFileOpenFail'),
        detail: result?.error || t('statusFileMissing'),
        context: { path: item.path, name: item.name || item.title || '' }
      });
      return;
    }
    await loadMedia({
      url: result.url,
      name: result.name,
      path: result.path,
      size: result.size,
      ext: result.ext,
      subtitle: result.subtitle
    });
  }
}

function resolveFilePath(file) {
  if (!file || !isElectron || !window.desktopAPI.getPathForFile) return '';
  try {
    return window.desktopAPI.getPathForFile(file) || '';
  } catch {
    return '';
  }
}

function formatTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) return '00:00';
  const s = Math.floor(sec % 60);
  const m = Math.floor((sec / 60) % 60);
  const h = Math.floor(sec / 3600);
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function formatBytes(n) {
  if (!n) return '';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i ? 1 : 0)} ${u[i]}`;
}

/** @typedef {{ key: string, vars?: Record<string, string|number>, styleId?: string } | { text: string }} StatusPart */

/** Kept as i18n parts so locale changes can re-render the status bar. */
const statusSnapshot = {
  /** @type {StatusPart} */
  file: { key: 'statusReady' },
  /** @type {StatusPart} */
  format: { text: '—' },
  /** @type {StatusPart} */
  subtitle: { key: 'statusNoSubtitle' },
  /** @type {StatusPart} */
  state: { key: 'statusIdle' },
  rate: '1',
  /** @type {string|null} */
  themeSetting: null,
  /** @type {StatusPart} */
  platform: { text: 'Web' }
};

/** @param {string} key @param {Record<string, string|number>} [vars] */
function statusKey(key, vars) {
  return vars ? { key, vars } : { key };
}

/** @param {string|number|null|undefined} value */
function statusText(value) {
  return { text: value == null || value === '' ? '—' : String(value) };
}

/** @param {unknown} value @returns {StatusPart|null} */
function asStatusPart(value) {
  if (value == null) return null;
  if (typeof value === 'object' && value !== null && ('key' in value || 'text' in value)) {
    return /** @type {StatusPart} */ (value);
  }
  return statusText(/** @type {string|number} */ (value));
}

/** @param {StatusPart|null|undefined} part */
function resolveStatusPart(part) {
  if (!part) return '—';
  if ('styleId' in part && part.styleId && part.key === 'spectrumStyle') {
    return `${t('spectrumStyle')}: ${spectrumStyleLabel(part.styleId)}`;
  }
  if ('key' in part && part.key) return t(part.key, part.vars || {});
  if ('text' in part) return part.text ?? '—';
  return '—';
}

function paintStatusBar() {
  if (els.statusFile) els.statusFile.textContent = resolveStatusPart(statusSnapshot.file);
  if (els.statusFormat) els.statusFormat.textContent = resolveStatusPart(statusSnapshot.format);
  if (els.statusSubtitle) els.statusSubtitle.textContent = resolveStatusPart(statusSnapshot.subtitle);
  if (els.statusState) els.statusState.textContent = resolveStatusPart(statusSnapshot.state);
  if (els.statusRate) els.statusRate.textContent = t('statusSpeed', { n: statusSnapshot.rate });
  if (els.statusTheme) {
    const themeId = statusSnapshot.themeSetting || settings.theme;
    els.statusTheme.textContent = t('statusTheme', { name: themeDisplayName(themeId) });
  }
  if (els.statusPlatform) els.statusPlatform.textContent = resolveStatusPart(statusSnapshot.platform);
}

function setStatus(partial = {}) {
  if (partial.file != null) statusSnapshot.file = asStatusPart(partial.file);
  if (partial.format != null) statusSnapshot.format = asStatusPart(partial.format);
  if (partial.subtitle != null) statusSnapshot.subtitle = asStatusPart(partial.subtitle);
  if (partial.state != null) statusSnapshot.state = asStatusPart(partial.state);
  if (partial.rate != null) statusSnapshot.rate = formatRateLabel(partial.rate);
  if (partial.platform != null) statusSnapshot.platform = asStatusPart(partial.platform);
  if (partial.themeSetting != null) statusSnapshot.themeSetting = String(partial.themeSetting);
  else if (partial.theme != null && typeof partial.theme === 'string') {
    // Prefer theme ids (dark/light/custom:…); ignore already-translated names.
    if (/^(dark|light|ocean|forest|custom:)/.test(partial.theme)) {
      statusSnapshot.themeSetting = partial.theme;
    }
  }
  paintStatusBar();
}

function themeDisplayName(themeSetting) {
  const def = getThemeDefinition(themeSetting);
  if (def.builtin) return t(BUILTIN_THEME_NAME_KEYS[def.id] || 'themeDark');
  return def.name || t('themeDark');
}

function formatRateLabel(rate) {
  const n = Number(rate);
  if (!Number.isFinite(n)) return '1';
  return Number.isInteger(n) ? String(n) : String(n);
}

function nearestPlaybackRate(rate) {
  const n = Number(rate) || 1;
  return PLAYBACK_RATES.reduce((best, cur) =>
    Math.abs(cur - n) < Math.abs(best - n) ? cur : best
  , PLAYBACK_RATES[0]);
}

function setPlaybackRate(rate, { persist = true, announce = true } = {}) {
  const next = nearestPlaybackRate(rate);
  settings.rate = next;
  els.media.playbackRate = next;
  if (youtubeMode) ytPlayer.setPlaybackRate(next);
  if (els.rateSelect) els.rateSelect.value = String(next);
  const settingRate = $('settingRate');
  if (settingRate) settingRate.value = String(next);
  els.rateSelect?.setAttribute('data-tooltip', t('speedTipValue', { n: formatRateLabel(next) }));
  if (persist) saveSettings(settings);
  if (announce) setStatus({ rate: formatRateLabel(next) });
}

function updatePlayIcons(playing) {
  const playIcon = els.btnPlay.querySelector('.icon-play');
  const pauseIcon = els.btnPlay.querySelector('.icon-pause');
  playIcon.classList.toggle('hidden', playing);
  pauseIcon.classList.toggle('hidden', !playing);
  els.btnPlay.setAttribute('data-tooltip', playing ? t('pauseTip') : t('playTip'));
  els.btnPlay.setAttribute('aria-label', playing ? t('pause') : t('play'));
  els.btnPlay.setAttribute('data-i18n-tooltip', playing ? 'pauseTip' : 'playTip');
  els.btnPlay.setAttribute('data-i18n-aria', playing ? 'pause' : 'play');
}

function syncRangeFill(el) {
  if (!el) return 0;
  const min = Number(el.min);
  const max = Number(el.max);
  const value = Number(el.value);
  const lo = Number.isFinite(min) ? min : 0;
  const hi = Number.isFinite(max) ? max : 100;
  const cur = Number.isFinite(value) ? value : lo;
  const clamped = Math.min(hi, Math.max(lo, Math.round(cur)));
  const pct = hi === lo ? 0 : Math.min(100, Math.max(0, ((clamped - lo) / (hi - lo)) * 100));
  el.style.setProperty('--fill', `${pct}%`);
  return clamped;
}

function syncSeekBarFill() {
  syncRangeFill(els.seekBar);
}

function syncVolumeBarFill() {
  const clamped = syncRangeFill(els.volumeBar);
  const el = els.volumeBar;
  if (!el) return;
  el.setAttribute('aria-valuenow', String(clamped));
  el.setAttribute('aria-valuetext', `${clamped}%`);
  if (els.volumeValue) els.volumeValue.textContent = `${clamped}%`;
}

function updateMuteIcons() {
  const muted = youtubeMode
    ? (ytPlayer.isMuted() || Number(els.volumeBar.value) === 0)
    : (els.media.muted || els.media.volume === 0);
  $('btnMute').querySelector('.icon-vol').classList.toggle('hidden', muted);
  $('btnMute').querySelector('.icon-muted').classList.toggle('hidden', !muted);
  syncVolumeBarFill();
}

function enterYouTubeMode() {
  youtubeMode = true;
  els.videoWrap.classList.add('youtube-mode');
  updateSpectrumVisibility();
  updateSaveButton();
}

function exitYouTubeMode() {
  if (!youtubeMode && !ytPlayer.active) return;
  ytPlayer.destroy();
  youtubeMode = false;
  currentYouTube = null;
  els.videoWrap.classList.remove('youtube-mode');
  updateSaveButton();
}

function showYoutubeError(msg) {
  if (!msg) {
    els.youtubeError.classList.add('hidden');
    els.youtubeError.textContent = '';
    return;
  }
  els.youtubeError.textContent = msg;
  els.youtubeError.classList.remove('hidden');
}

function fillLocaleSelect() {
  const select = $('settingLocale');
  if (!select) return;
  select.innerHTML = '';
  for (const loc of [
    { id: 'en', label: t('langEnglish') },
    { id: 'ko', label: t('langKorean') }
  ]) {
    const opt = document.createElement('option');
    opt.value = loc.id;
    opt.textContent = loc.label;
    select.appendChild(opt);
  }
  select.value = getLocaleSafe();
}

function getLocaleSafe() {
  return settings.locale === 'ko' ? 'ko' : settings.locale === 'en' ? 'en' : resolveInitialLocale(settings.locale);
}

/** @type {{ id: string|null, name: string, scheme: string, vars: Record<string,string> }} */
let themeDraft = { id: null, name: '', scheme: 'dark', vars: {} };

function populateThemeSelect(selected) {
  const select = $('settingTheme');
  if (!select) return;
  const current = selected ?? settings.theme;
  select.innerHTML = '';

  const builtinGroup = document.createElement('optgroup');
  builtinGroup.label = t('builtinGroup');
  for (const theme of BUILTIN_THEMES) {
    const opt = document.createElement('option');
    opt.value = theme.id;
    opt.textContent = t(BUILTIN_THEME_NAME_KEYS[theme.id] || theme.name);
    builtinGroup.appendChild(opt);
  }
  select.appendChild(builtinGroup);

  const customs = loadCustomThemes();
  if (customs.length) {
    const customGroup = document.createElement('optgroup');
    customGroup.label = t('customGroup');
    for (const theme of customs) {
      const opt = document.createElement('option');
      opt.value = `custom:${theme.id}`;
      opt.textContent = theme.name;
      customGroup.appendChild(opt);
    }
    select.appendChild(customGroup);
  }

  const values = [...select.options].map((o) => o.value);
  select.value = values.includes(current) ? current : 'dark';
  updateThemeActionButtons();
  renderThemeMenu();
}

function updateThemeActionButtons() {
  const value = $('settingTheme')?.value || settings.theme;
  const isCustom = String(value).startsWith('custom:');
  const del = $('btnDeleteTheme');
  if (del) del.hidden = !isCustom;
}

async function applyTheme(themeSetting) {
  const def = applyThemeToDocument(themeSetting);
  syncThemeToOverlays();
  setStatus({ themeSetting: themeSetting });
  if (isElectron && window.desktopAPI.setThemeSource) {
    const source = def.scheme === 'light' ? 'light' : 'dark';
    await window.desktopAPI.setThemeSource(source);
  }
  syncSpectrumPainterTheme();
  return def;
}

function openThemedDialog(dialogEl) {
  if (!dialogEl) return;
  syncThemeToOverlays();
  if (typeof dialogEl.showModal === 'function') dialogEl.showModal();
  else dialogEl.setAttribute('open', '');
}

function renderThemeColorGrid(vars) {
  const grid = $('themeColorGrid');
  if (!grid) return;
  grid.innerHTML = '';
  for (const item of THEME_EDIT_KEYS) {
    const value = vars[item.key] || '#000000';
    const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value) ? value : '#888888';
    const field = document.createElement('label');
    field.className = 'theme-color-field';
    field.innerHTML = `
      <span></span>
      <div class="color-row">
        <input type="color" data-key="${item.key}" value="${hex}" />
        <input type="text" data-key-text="${item.key}" value="${value}" spellcheck="false" />
      </div>
    `;
    field.querySelector('span').textContent = t(item.labelKey);
    const colorInput = field.querySelector('input[type="color"]');
    const textInput = field.querySelector('input[type="text"]');
    colorInput.addEventListener('input', () => {
      textInput.value = colorInput.value;
      themeDraft.vars[item.key] = colorInput.value;
      previewThemeDraft();
    });
    textInput.addEventListener('change', () => {
      const v = textInput.value.trim();
      themeDraft.vars[item.key] = v;
      if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) colorInput.value = v;
      previewThemeDraft();
    });
    grid.appendChild(field);
  }
}

function previewThemeDraft() {
  const vars = ensureDerivedVars(themeDraft.vars);
  const root = document.documentElement;
  root.setAttribute('data-theme', 'custom');
  root.setAttribute('data-color-scheme', themeDraft.scheme);
  root.style.colorScheme = themeDraft.scheme === 'light' ? 'light' : 'dark';
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value);
  }
  syncThemeToOverlays(root);
}

function openThemeEditor() {
  const selected = $('settingTheme').value || settings.theme;
  const def = getThemeDefinition(selected);
  themeDraft = {
    id: def.builtin ? null : def.id,
    name: def.builtin ? themeDisplayName(selected) : def.name,
    scheme: def.scheme || 'dark',
    vars: cloneVarsFromTheme(selected)
  };
  $('themeNameInput').value = themeDraft.name;
  $('themeSchemeSelect').value = themeDraft.scheme;
  renderThemeColorGrid(themeDraft.vars);
  previewThemeDraft();
  openThemedDialog($('themeEditorModal'));
}

function closeThemeEditor(restore = true) {
  $('themeEditorModal').close();
  if (restore) applyTheme(settings.theme);
}

function collectThemeDraftFromForm() {
  themeDraft.name = $('themeNameInput').value.trim() || t('themeNamePh');
  themeDraft.scheme = $('themeSchemeSelect').value === 'light' ? 'light' : 'dark';
  themeDraft.vars = ensureDerivedVars(themeDraft.vars);
  return themeDraft;
}

async function saveThemeDraft({ asNew }) {
  const draft = collectThemeDraftFromForm();
  const id = asNew || !draft.id ? createThemeId() : draft.id;
  const saved = upsertCustomTheme({
    id,
    name: draft.name,
    scheme: draft.scheme,
    vars: draft.vars
  });
  themeDraft.id = saved.id;
  settings.theme = `custom:${saved.id}`;
  saveSettings(settings);
  populateThemeSelect(settings.theme);
  await applyTheme(settings.theme);
  $('themeEditorModal').close();
  setStatus({
    state: asNew || !draft.id ? statusKey('statusThemeCreated') : statusKey('statusThemeSaved')
  });
}

async function deleteSelectedCustomTheme() {
  const value = $('settingTheme').value;
  if (!String(value).startsWith('custom:')) return;
  const id = value.slice('custom:'.length);
  deleteCustomTheme(id);
  settings.theme = 'dark';
  saveSettings(settings);
  populateThemeSelect('dark');
  await applyTheme('dark');
  setStatus({ state: statusKey('statusThemeDeleted') });
}

function applyLocale(locale, { persist = true } = {}) {
  const next = setLocale(locale === 'ko' ? 'ko' : 'en');
  if (persist) {
    settings.locale = next;
    saveSettings(settings);
  }
  applyI18n(document);
  fillLocaleSelect();
  populateThemeSelect(settings.theme);
  fillSpectrumStyleSelect();
  updateLocaleToolbarButton();
  applySpectrumStyle(settings.spectrumStyle, { persist: false });
  const playing = youtubeMode
    ? ytPlayer.isPlaying()
    : Boolean(els.media.src) && !els.media.paused;
  updatePlayIcons(playing);
  setPlaybackRate(settings.rate, { persist: false, announce: true });
  paintStatusBar();
  if ($('youtubeHint')) {
    $('youtubeHint').textContent = isElectron ? t('youtubeHintDesktop') : t('youtubeHintWeb');
  }
  if (appInfo) {
    $('aboutVersion').textContent = t('aboutVersion', { n: appInfo.version });
  }
  renderRecentMenu();
  syncWindowMinWidth();
  return next;
}

function applySettingsToPlayer({ applyVolume = false } = {}) {
  els.media.loop = Boolean(settings.loop);
  if (applyVolume) {
    const vol = Math.min(1, Math.max(0, (Number(settings.startVolume) || 80) / 100));
    els.media.volume = vol;
    els.volumeBar.value = String(Math.round(vol * 100));
    if (youtubeMode) ytPlayer.setVolume(Math.round(vol * 100));
  }
  setPlaybackRate(settings.rate, { persist: false, announce: true });
  subtitles.setEnabled(Boolean(settings.showSubtitles));
  subtitles.setFontSize(Number(settings.subSize) || 28);
  applySpectrumStyle(settings.spectrumStyle, { persist: false });
  updateMuteIcons();
  updateSpectrumVisibility();
  void applyWindowOpacity(settings.windowOpacity, { persist: false });
}

function stepPlaybackRate(delta) {
  const current = nearestPlaybackRate(settings.rate);
  const idx = PLAYBACK_RATES.indexOf(current);
  const nextIdx = Math.max(0, Math.min(PLAYBACK_RATES.length - 1, idx + delta));
  setPlaybackRate(PLAYBACK_RATES[nextIdx]);
}

async function updateSpectrumVisibility() {
  // Do not gate on spectrum.hasAudio: Chromium reports webkitAudioDecodedByteCount=0
  // until decode starts, which previously kept the popup closed forever.
  const want = !youtubeMode && Boolean(settings.showSpectrum) && Boolean(currentMediaName);
  const pressed = Boolean(settings.showSpectrum);
  $('btnSpectrum')?.setAttribute('aria-pressed', String(pressed));

  if (want) {
    openSpectrumPopup();
    await spectrum.start();
    // Layout may not be ready on the same frame after un-hiding.
    requestAnimationFrame(() => {
      clampSpectrumPopupPosition();
      spectrumPainter?.resize();
    });
  } else {
    closeSpectrumPopup({ updateSetting: false });
  }
}

function fillSettingsForm() {
  fillLocaleSelect();
  populateThemeSelect(settings.theme);
  fillSpectrumStyleSelect();
  $('settingRate').value = String(settings.rate);
  $('settingSeekStep').value = String(settings.seekStep);
  $('settingAutoplay').checked = settings.autoplay;
  $('settingLoop').checked = settings.loop;
  $('settingShowSpectrum').checked = settings.showSpectrum;
  $('settingShowSubtitles').checked = settings.showSubtitles;
  $('settingSubSize').value = String(settings.subSize);
  updateSubSizeValue(settings.subSize);
  $('settingStartVolume').value = String(clampStartVolume(settings.startVolume));
  updateStartVolumeValue(settings.startVolume);
  updateOpacityUi(settings.windowOpacity);
}

function clampStartVolume(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 80;
  return Math.min(100, Math.max(0, Math.round(n)));
}

function clampWindowOpacity(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 100;
  return Math.min(100, Math.max(20, Math.round(n)));
}

function updateOpacityUi(opacityPercent) {
  const value = clampWindowOpacity(opacityPercent);
  const toolbar = $('toolbarOpacityBar');
  const toolbarOut = $('toolbarOpacityValue');
  const setting = $('settingOpacity');
  const settingOut = $('settingOpacityValue');
  if (toolbar) {
    toolbar.value = String(value);
    syncRangeFill(toolbar);
    toolbar.setAttribute('aria-valuetext', `${value}%`);
  }
  if (toolbarOut) toolbarOut.textContent = `${value}%`;
  if (setting) {
    setting.value = String(value);
    syncRangeFill(setting);
    setting.setAttribute('aria-valuetext', `${value}%`);
  }
  if (settingOut) settingOut.textContent = `${value}%`;
}

async function applyWindowOpacity(opacityPercent, { persist = true } = {}) {
  const value = clampWindowOpacity(opacityPercent);
  settings.windowOpacity = value;
  updateOpacityUi(value);
  if (persist) saveSettings(settings);
  if (isElectron && window.desktopAPI?.setWindowOpacity) {
    await window.desktopAPI.setWindowOpacity(value / 100);
  }
}

function updateStartVolumeValue(volume) {
  const value = clampStartVolume(volume);
  const out = $('settingStartVolumeValue');
  const input = $('settingStartVolume');
  if (out) out.textContent = `${value}%`;
  if (input) {
    input.value = String(value);
    input.setAttribute('aria-valuetext', `${value}%`);
    syncRangeFill(input);
  }
}

function updateSubSizeValue(size) {
  const value = Number(size) || 28;
  const out = $('settingSubSizeValue');
  const input = $('settingSubSize');
  if (out) out.textContent = `${value}px`;
  if (input) input.setAttribute('aria-valuetext', `${value}px`);
}

function readSettingsForm() {
  return {
    locale: $('settingLocale')?.value === 'ko' ? 'ko' : 'en',
    theme: $('settingTheme').value,
    rate: Number($('settingRate').value),
    seekStep: Number($('settingSeekStep').value) || 10,
    autoplay: $('settingAutoplay').checked,
    loop: $('settingLoop').checked,
    showSpectrum: $('settingShowSpectrum').checked,
    spectrumStyle: normalizeSpectrumStyle($('settingSpectrumStyle')?.value || settings.spectrumStyle),
    showSubtitles: $('settingShowSubtitles').checked,
    subSize: Number($('settingSubSize').value) || 28,
    startVolume: clampStartVolume($('settingStartVolume').value),
    windowOpacity: clampWindowOpacity($('settingOpacity')?.value ?? settings.windowOpacity)
  };
}

function revokeObjectUrl() {
  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = null;
  }
}

function detectHasAudioTrack() {
  const media = els.media;
  if (!media) return false;
  if (media.tagName === 'AUDIO') return true;

  // Trust positive signals only. In Chromium/Electron, webkitAudioDecodedByteCount
  // is often 0 at loadedmetadata / early play — that must not mean "no audio".
  if (media.mozHasAudio === true) return true;
  if (typeof media.webkitAudioDecodedByteCount === 'number' && media.webkitAudioDecodedByteCount > 0) {
    return true;
  }
  try {
    if (media.audioTracks && media.audioTracks.length > 0) return true;
  } catch {
    /* audioTracks can throw when not enabled */
  }

  if (media.mozHasAudio === false) return false;

  // Most media has an audio track; assume yes until proven otherwise.
  return true;
}

async function loadMedia({
  url,
  name,
  path = null,
  size = null,
  ext = '',
  subtitle = null,
  skipRecent = false
} = {}) {
  exitYouTubeMode();
  revokeObjectUrl();
  stopRequested = false;
  hidePlaybackOverlay(true);
  currentMediaPath = path;
  currentMediaName = name;
  els.dropHint.classList.add('hidden');
  els.media.src = url;
  els.media.load();

  const extLabel = (ext || (name.includes('.') ? name.slice(name.lastIndexOf('.')) : '')).toUpperCase().replace('.', '') || 'MEDIA';
  setStatus({
    file: size ? `${name} (${formatBytes(size)})` : name,
    format: extLabel,
    state: statusKey('statusLoading'),
    subtitle: statusKey('statusNoSubtitle')
  });

  subtitles.setCues([]);

  if (subtitle?.content) {
    applySubtitle(subtitle);
  } else if (isElectron && path) {
    const found = await window.desktopAPI.findSubtitle(path);
    if (found) applySubtitle(found);
  }

  if (path && !skipRecent) {
    rememberRecentFile({ path, name, title: name, ext });
  }

  if (settings.autoplay) {
    try {
      await els.media.play();
    } catch {
      setStatus({ state: statusKey('statusReadyPlay') });
    }
  }
}

async function repairAndReloadMedia(sourcePath, options = {}) {
  if (!isElectron || !window.desktopAPI?.makeMediaCompatible || !sourcePath) {
    return { ok: false, error: t('statusCompatFailed') };
  }
  setStatus({ state: statusKey('statusCompatConverting'), format: statusKey('statusCodecError') });
  const unsub = window.desktopAPI.onMediaCompatProgress?.((progress) => {
    if (progress?.message) setStatus({ state: progress.message });
  });
  try {
    const result = await window.desktopAPI.makeMediaCompatible(sourcePath, options);
    return result;
  } finally {
    unsub?.();
  }
}

async function handleMediaElementError() {
  const err = els.media.error;
  const detail = mediaErrorDetail(err) || t('statusPlaybackError');
  const msg = err ? `${t('statusPlaybackError')} (${err.code})` : t('statusPlaybackError');
  const decodeLike =
    err?.code === 3 ||
    err?.code === 4 ||
    /DECODE|PIPELINE_ERROR_DECODE|DEMUXER_ERROR|not supported/i.test(String(err?.message || ''));

  const priorCompat = currentMediaPath ? compatTriedPaths.get(currentMediaPath) : null;
  const nextCompatMode = !priorCompat ? 'soft' : priorCompat === 'soft' ? 'full' : null;

  if (
    decodeLike &&
    isElectron &&
    currentMediaPath &&
    !compatInFlight &&
    nextCompatMode &&
    window.desktopAPI?.makeMediaCompatible
  ) {
    const originalPath = currentMediaPath;
    const originalName = currentMediaName;
    compatTriedPaths.set(originalPath, nextCompatMode);
    compatInFlight = true;
    try {
      const repaired = await repairAndReloadMedia(originalPath, {
        mode: nextCompatMode,
        force: nextCompatMode === 'full'
      });
      if (repaired?.ok && repaired.url) {
        if (repaired.mode === 'full') compatTriedPaths.set(originalPath, 'full');
        setStatus({ state: statusKey('statusCompatRetry') });
        await loadMedia({
          url: repaired.url,
          name: originalName || repaired.name,
          path: originalPath,
          size: repaired.size,
          ext: repaired.ext || '.mp4',
          skipRecent: true
        });
        setStatus({ state: statusKey('statusCompatDone') });
        return;
      }
      setStatus({ state: statusKey('statusCompatFailed'), format: statusKey('statusCodecError') });
      showAppError({
        title: t('errorMediaTitle'),
        message: t('statusCompatFailed'),
        detail: [detail, t('errorDecodeHint'), repaired?.error || ''].filter(Boolean).join('\n\n'),
        error: err,
        context: {
          src: els.media.currentSrc || els.media.src || '',
          file: originalName || '',
          path: originalPath,
          networkState: els.media.networkState,
          readyState: els.media.readyState
        },
        statusMessage: t('statusCompatFailed')
      });
      return;
    } finally {
      compatInFlight = false;
    }
  }

  setStatus({ state: msg, format: statusKey('statusCodecError') });
  showAppError({
    title: t('errorMediaTitle'),
    message: msg,
    detail: [detail, t('statusCodecError'), decodeLike ? t('errorDecodeHint') : '']
      .filter(Boolean)
      .join('\n'),
    error: err,
    context: {
      src: els.media.currentSrc || els.media.src || '',
      file: currentMediaName || '',
      path: currentMediaPath || '',
      networkState: els.media.networkState,
      readyState: els.media.readyState
    },
    statusMessage: msg
  });
}

function applySubtitle(subtitle) {
  const cues = parseSubtitle(subtitle.content, subtitle.ext || '');
  subtitles.setCues(cues);
  subtitles.setEnabled(Boolean(settings.showSubtitles));
  setStatus({
    subtitle: cues.length
      ? statusKey('statusSubtitle', { name: subtitle.name, n: cues.length })
      : statusKey('statusSubtitleEmpty', { name: subtitle.name })
  });
}

async function openMediaDesktop() {
  const result = await window.desktopAPI.openMedia();
  if (!result) return;
  await loadMedia({
    url: result.url,
    name: result.name,
    path: result.path,
    size: result.size,
    ext: result.ext,
    subtitle: result.subtitle
  });
}

function openMediaWeb() {
  els.webMediaInput.value = '';
  els.webMediaInput.click();
}

async function onWebMediaChosen(e) {
  const files = e.target.files;
  if (!files?.length) return;
  const file = files[0];
  const filePath = resolveFilePath(file);
  if (isElectron && filePath) {
    const result = await window.desktopAPI.openMediaPath(filePath);
    if (result?.ok) {
      await loadMedia({
        url: result.url,
        name: result.name,
        path: result.path,
        size: result.size,
        ext: result.ext,
        subtitle: result.subtitle
      });
      return;
    }
  }
  revokeObjectUrl();
  currentObjectUrl = URL.createObjectURL(file);
  let subtitle = await findSubtitleInFileList(file, files);
  await loadMedia({
    url: currentObjectUrl,
    name: file.name,
    size: file.size,
    ext: file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : '',
    subtitle
  });
}

async function openSubtitle() {
  if (isElectron) {
    const sub = await window.desktopAPI.openSubtitle();
    if (sub) applySubtitle(sub);
    return;
  }
  els.webSubInput.value = '';
  els.webSubInput.click();
}

async function onWebSubChosen(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  const content = await file.text();
  const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : '.srt';
  applySubtitle({ name: file.name, content, ext });
}

function togglePlay() {
  if (youtubeMode) {
    if (ytPlayer.isPlaying()) ytPlayer.pause();
    else ytPlayer.play();
    return;
  }
  if (!els.media.src) {
    isElectron ? openMediaDesktop() : openMediaWeb();
    return;
  }
  if (els.media.paused) els.media.play().catch(() => {});
  else els.media.pause();
}

function stopPlayback() {
  stopRequested = true;
  if (youtubeMode) {
    ytPlayer.stop();
    updatePlayIcons(false);
    setStatus({ state: statusKey('statusStopped') });
    notifyStopped();
    return;
  }
  if (!els.media.src) return;
  // pause/ended handlers also observe stopRequested — notify once here only.
  els.media.pause();
  els.media.currentTime = 0;
  updatePlayIcons(false);
  setStatus({ state: statusKey('statusStopped') });
  subtitles.clear();
  notifyStopped();
}

function seekBy(delta) {
  if (youtubeMode) {
    ytPlayer.seekBy(delta);
    return;
  }
  if (!Number.isFinite(els.media.duration)) return;
  els.media.currentTime = Math.min(
    els.media.duration,
    Math.max(0, els.media.currentTime + delta)
  );
}

function seekToPosition(seconds) {
  if (youtubeMode) {
    ytPlayer.seekTo(Math.max(0, seconds));
    return;
  }
  if (!Number.isFinite(els.media.duration)) return;
  els.media.currentTime = Math.min(els.media.duration, Math.max(0, seconds));
}

function seekToPercent(pct) {
  const d = youtubeMode ? ytPlayer.getDuration() : els.media.duration;
  if (!Number.isFinite(d) || d <= 0) return;
  seekToPosition((Math.min(100, Math.max(0, pct)) / 100) * d);
}

function getMediaDuration() {
  return youtubeMode ? ytPlayer.getDuration() : els.media.duration;
}

function adjustVolume(delta) {
  if (youtubeMode) {
    if (ytPlayer.isMuted()) ytPlayer.unmute();
    const v = Math.min(100, Math.max(0, Number(els.volumeBar.value) + delta));
    els.volumeBar.value = String(v);
    ytPlayer.setVolume(v);
  } else {
    els.media.muted = false;
    els.media.volume = Math.min(1, Math.max(0, els.media.volume + delta / 100));
    els.volumeBar.value = String(Math.round(els.media.volume * 100));
  }
  updateMuteIcons();
}

function toggleMute() {
  if (youtubeMode) {
    if (ytPlayer.isMuted()) ytPlayer.unmute();
    else ytPlayer.mute();
  } else {
    els.media.muted = !els.media.muted;
  }
  updateMuteIcons();
}

function toggleSpectrumPanel() {
  settings.showSpectrum = !settings.showSpectrum;
  saveSettings(settings);
  updateSpectrumVisibility();
}

function spectrumStyleLabel(styleId) {
  const style = SPECTRUM_STYLES.find((s) => s.id === styleId) || SPECTRUM_STYLES[0];
  return t(style.labelKey);
}

function fillSpectrumStyleSelect() {
  const select = $('settingSpectrumStyle');
  if (!select) return;
  const current = normalizeSpectrumStyle(settings.spectrumStyle);
  select.innerHTML = '';
  for (const style of SPECTRUM_STYLES) {
    const opt = document.createElement('option');
    opt.value = style.id;
    opt.textContent = t(style.labelKey);
    select.appendChild(opt);
  }
  select.value = current;
}

function applySpectrumStyle(styleId, { persist = true } = {}) {
  const next = normalizeSpectrumStyle(styleId);
  settings.spectrumStyle = next;
  if (persist) saveSettings(settings);
  if ($('settingSpectrumStyle')) $('settingSpectrumStyle').value = next;
  spectrumPainter?.setStyle(next);
  if (els.spectrumStyleName) els.spectrumStyleName.textContent = spectrumStyleLabel(next);
}

function cycleSpectrumStyle(delta = 1) {
  const ids = SPECTRUM_STYLES.map((s) => s.id);
  const current = normalizeSpectrumStyle(settings.spectrumStyle);
  const idx = Math.max(0, ids.indexOf(current));
  const next = ids[(idx + delta + ids.length) % ids.length];
  applySpectrumStyle(next);
  setStatus({ state: { key: 'spectrumStyle', styleId: next } });
}

function toggleSubtitlesVisible() {
  settings.showSubtitles = !settings.showSubtitles;
  saveSettings(settings);
  subtitles.setEnabled(Boolean(settings.showSubtitles));
  if ($('settingShowSubtitles')) {
    $('settingShowSubtitles').checked = settings.showSubtitles;
  }
}

function syncSeekBar() {
  if (seeking || pendingSeekTarget != null || youtubeMode) return;
  const d = els.media.duration;
  if (!Number.isFinite(d) || d <= 0) {
    els.seekBar.value = '0';
    syncSeekBarFill();
    return;
  }
  els.seekBar.value = String(Math.round((els.media.currentTime / d) * 1000));
  syncSeekBarFill();
  els.timeCurrent.textContent = formatTime(els.media.currentTime);
  els.timeDuration.textContent = formatTime(d);
  subtitles.update(els.media.currentTime);
}

function previewSeekBarTime() {
  const d = youtubeMode ? ytPlayer.getDuration() : els.media.duration;
  if (!Number.isFinite(d) || d <= 0) return;
  const t = (Number(els.seekBar.value) / 1000) * d;
  els.timeCurrent.textContent = formatTime(t);
  syncSeekBarFill();
}

function clearSeekWatchdog() {
  if (seekWatchdog) {
    clearTimeout(seekWatchdog);
    seekWatchdog = 0;
  }
}

function finishSeekInteraction(time) {
  clearSeekWatchdog();
  seeking = false;
  pendingSeekTarget = null;
  if (Number.isFinite(time)) {
    els.timeCurrent.textContent = formatTime(time);
    if (!youtubeMode) subtitles.update(time);
    const d = youtubeMode ? ytPlayer.getDuration() : els.media.duration;
    if (Number.isFinite(d) && d > 0) {
      els.seekBar.value = String(Math.round((time / d) * 1000));
    }
  }
  syncSeekBarFill();
}

/** Apply slider position. Keep blocking sync until media fires `seeked`. */
function commitSeekBar() {
  if (!seeking && pendingSeekTarget == null) return;
  const d = youtubeMode ? ytPlayer.getDuration() : els.media.duration;
  if (!Number.isFinite(d) || d <= 0) {
    finishSeekInteraction(null);
    return;
  }
  const t = Math.min(d, Math.max(0, (Number(els.seekBar.value) / 1000) * d));
  seeking = true;
  pendingSeekTarget = t;
  els.timeCurrent.textContent = formatTime(t);

  if (youtubeMode) {
    ytPlayer.seekTo(t);
    finishSeekInteraction(t);
    return;
  }

  try {
    els.media.currentTime = t;
  } catch {
    finishSeekInteraction(els.media.currentTime);
    return;
  }

  // Do not clear `seeking` yet — wait for `seeked` so timeupdate can't snap back.
  clearSeekWatchdog();
  seekWatchdog = window.setTimeout(() => {
    finishSeekInteraction(els.media.currentTime);
  }, 1000);
}

function beginSeekBar(e) {
  seeking = true;
  clearSeekWatchdog();
  try {
    els.seekBar.setPointerCapture?.(e.pointerId);
  } catch {
    /* ignore */
  }
}

function openYouTubeDialog(prefill = '') {
  showYoutubeError('');
  els.youtubeUrlInput.value = prefill || currentYouTube?.url || '';
  openThemedDialog(els.youtubeModal);
  queueMicrotask(() => {
    els.youtubeUrlInput.focus();
    els.youtubeUrlInput.select();
  });
}

async function playYouTubeFromInput(rawInput) {
  const id = extractYouTubeId(rawInput);
  if (!id) {
    showYoutubeError(t('youtubeInvalid'));
    return false;
  }
  const url = `https://www.youtube.com/watch?v=${id}`;
  showYoutubeError('');

  // Stop local media
  els.media.pause();
  els.media.removeAttribute('src');
  els.media.load();
  revokeObjectUrl();
  currentMediaPath = null;
  currentMediaName = null;
  subtitles.setCues([]);

  currentYouTube = { id, url, title: id };
  enterYouTubeMode();
  stopRequested = false;
  hidePlaybackOverlay(true);
  els.dropHint.classList.add('hidden');
  setStatus({
    file: `YouTube: ${id}`,
    format: 'YouTube',
    state: statusKey('statusLoading'),
    subtitle: statusKey('statusYtCaptions')
  });

  try {
    if (isElectron) {
      const res = await window.desktopAPI.getYouTubeInfo(url);
      if (res?.ok && res.info?.title) {
        currentYouTube.title = res.info.title;
        setStatus({ file: res.info.title });
      }
    }
  } catch {
    /* optional metadata */
  }

  ytErrorDialogShown = false;
  try {
    await ytPlayer.load(id, {
      autoplay: Boolean(settings.autoplay),
      startVolume: Number(settings.startVolume) || 80
    });
  } catch (err) {
    if (!ytErrorDialogShown) {
      showAppError({
        title: t('errorYoutubeTitle'),
        message: err?.message || t('statusPlaybackError'),
        error: err,
        context: { videoId: id, url }
      });
    }
    return false;
  }
  if (ytPlayer.title) currentYouTube.title = ytPlayer.title;
  setPlaybackRate(settings.rate, { persist: false });
  els.volumeBar.value = String(Number(settings.startVolume) || 80);
  updateMuteIcons();
  updateSaveButton();
  rememberRecentYouTube({
    id,
    url,
    title: currentYouTube.title || ytPlayer.title || id
  });
  els.youtubeModal.close();
  return true;
}

async function saveCurrentYouTube() {
  if (!currentYouTube?.url) {
    openYouTubeDialog();
    return;
  }
  if (!isElectron) {
    setStatus({ state: statusKey('statusYtSaveDesktopOnly') });
    return;
  }

  setStatus({ state: statusKey('statusDownloading') });
  els.btnSaveYt.disabled = true;
  try {
    const result = await window.desktopAPI.downloadYouTube({
      url: currentYouTube.url,
      title: currentYouTube.title
    });
    if (result?.cancelled) {
      setStatus({ state: statusKey('statusDownloadCancelled') });
      return;
    }
    if (!result?.ok) {
      showAppError({
        title: t('errorDownloadTitle'),
        message: result?.error || t('statusDownloadFailed'),
        detail: result?.error || '',
        context: {
          url: currentYouTube.url,
          title: currentYouTube.title || currentYouTube.id
        }
      });
      return;
    }
    setStatus({
      state: statusKey('statusSaved'),
      file: `${currentYouTube.title || currentYouTube.id} → ${result.path}`
    });
  } catch (err) {
    showAppError({
      title: t('errorDownloadTitle'),
      message: err?.message || t('statusDownloadFailed'),
      error: err,
      context: {
        url: currentYouTube?.url || '',
        title: currentYouTube?.title || currentYouTube?.id || ''
      }
    });
  } finally {
    updateSaveButton();
  }
}

async function toggleFullscreen() {
  if (!document.fullscreenElement) {
    await els.videoWrap.requestFullscreen?.();
  } else {
    await document.exitFullscreen?.();
  }
}

function syncMaximizeButton(maximized) {
  const btn = $('btnMaximize');
  if (!btn) return;
  btn.textContent = maximized ? '❐' : '□';
  btn.setAttribute('data-tooltip', maximized ? t('restore') : t('maximize'));
  btn.setAttribute('data-i18n-tooltip', maximized ? 'restore' : 'maximize');
  btn.setAttribute('aria-label', maximized ? t('restore') : t('maximize'));
}

function bindToolbarWindowDrag() {
  const toolbar = $('toolbar');
  if (!toolbar || !isElectron || !window.desktopAPI?.beginWindowDrag) return;

  const handles = [...toolbar.querySelectorAll('.toolbar-drag-region')];
  if (!handles.length) return;

  let dragging = false;

  const onMove = (e) => {
    if (!dragging) return;
    window.desktopAPI.updateWindowDrag?.(e.screenX, e.screenY);
  };

  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    toolbar.classList.remove('is-dragging');
    window.removeEventListener('pointermove', onMove, true);
    window.removeEventListener('pointerup', endDrag, true);
    window.removeEventListener('pointercancel', endDrag, true);
    window.desktopAPI.endWindowDrag?.();
  };

  handles.forEach((handle) => {
    handle.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      // Only empty chrome — never start drag from nested controls.
      if (e.target.closest?.('button, input, select, a, label')) return;
      dragging = true;
      toolbar.classList.add('is-dragging');
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      try {
        handle.setPointerCapture?.(e.pointerId);
      } catch {
        /* ignore */
      }
      window.desktopAPI.beginWindowDrag();
      window.addEventListener('pointermove', onMove, true);
      window.addEventListener('pointerup', endDrag, true);
      window.addEventListener('pointercancel', endDrag, true);
      e.preventDefault();
    });
  });
}

function updateToolbarBrand(info) {
  const el = $('toolbarBrandText');
  if (!el) return;
  const version = info?.version || '1.0.0';
  el.textContent = `MyVideo V${version}`;
  const brand = $('toolbarBrand');
  if (brand) brand.title = `MyVideo V${version}`;
  syncWindowMinWidth();
}

function bindWindowControls() {
  const opacity = $('toolbarOpacity');
  const opacityField = $('settingOpacityField');

  if (!isElectron) {
    if (opacity) opacity.hidden = true;
    if (opacityField) opacityField.hidden = true;
    return;
  }

  document.documentElement.classList.add('is-electron');
  document.body.classList.add('is-electron');
  if (opacity) opacity.hidden = false;
  if (opacityField) opacityField.hidden = false;
  const controls = $('windowControls');
  if (controls) {
    controls.hidden = false;
    controls.style.display = 'flex';
  }

  $('btnMinimize')?.addEventListener('click', () => window.desktopAPI.minimize());
  $('btnMaximize')?.addEventListener('click', async () => {
    const maximized = await window.desktopAPI.maximizeToggle();
    syncMaximizeButton(maximized);
  });
  $('btnClose')?.addEventListener('click', () => window.desktopAPI.close());

  // Double-click brand/spacer to maximize / restore (like a title bar).
  const toggleMaxOnDblClick = async (e) => {
    e.preventDefault();
    const maximized = await window.desktopAPI.maximizeToggle();
    syncMaximizeButton(maximized);
  };
  $('toolbar')?.querySelectorAll('.toolbar-drag-region').forEach((el) => {
    el.addEventListener('dblclick', toggleMaxOnDblClick);
  });

  bindToolbarWindowDrag();

  const onOpacityInput = (e) => {
    void applyWindowOpacity(e.target.value, { persist: true });
  };
  $('toolbarOpacityBar')?.addEventListener('input', onOpacityInput);
  $('settingOpacity')?.addEventListener('input', onOpacityInput);

  window.desktopAPI.isMaximized?.().then((maximized) => syncMaximizeButton(Boolean(maximized)));
  window.desktopAPI.onWindowState?.((state) => {
    if (state.maximized != null) syncMaximizeButton(Boolean(state.maximized));
  });

  syncWindowMinWidth();
}

function bindDragDrop() {
  const wrap = els.videoWrap;
  const prevent = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach((type) => {
    wrap.addEventListener(type, prevent);
  });
  wrap.addEventListener('dragenter', () => wrap.classList.add('dragover'));
  wrap.addEventListener('dragover', () => wrap.classList.add('dragover'));
  wrap.addEventListener('dragleave', () => wrap.classList.remove('dragover'));
  wrap.addEventListener('drop', async (e) => {
    wrap.classList.remove('dragover');
    const text = e.dataTransfer?.getData('text') || e.dataTransfer?.getData('text/uri-list') || '';
    if (text && isYouTubeUrl(text)) {
      await playYouTubeFromInput(text.trim());
      return;
    }
    const files = [...(e.dataTransfer?.files || [])];
    if (!files.length) return;
    const media = files.find((f) => /^(video|audio)\//.test(f.type) || /\.(mp4|mkv|webm|mov|avi|mp3|aac|m4a|wav|flac|opus|ogg|hevc|h265)$/i.test(f.name));
    if (!media) {
      setStatus({ state: statusKey('statusUnsupportedDrop') });
      return;
    }
    const filePath = resolveFilePath(media);
    if (isElectron && filePath) {
      const result = await window.desktopAPI.openMediaPath(filePath);
      if (result?.ok) {
        await loadMedia({
          url: result.url,
          name: result.name,
          path: result.path,
          size: result.size,
          ext: result.ext,
          subtitle: result.subtitle
        });
        return;
      }
    }
    revokeObjectUrl();
    currentObjectUrl = URL.createObjectURL(media);
    const subtitle = await findSubtitleInFileList(media, files);
    await loadMedia({
      url: currentObjectUrl,
      name: media.name,
      size: media.size,
      ext: media.name.includes('.') ? media.name.slice(media.name.lastIndexOf('.')) : '',
      subtitle
    });
  });
}

function bindMediaEvents() {
  els.media.addEventListener('loadedmetadata', () => {
    els.timeDuration.textContent = formatTime(els.media.duration);
    els.media.playbackRate = nearestPlaybackRate(settings.rate);
    setStatus({ state: statusKey('statusReady') });
    spectrum.hasAudio = detectHasAudioTrack();
    updateSpectrumVisibility();
  });
  els.media.addEventListener('ratechange', () => {
    if (youtubeMode) return;
    const rate = nearestPlaybackRate(els.media.playbackRate);
    if (rate !== nearestPlaybackRate(settings.rate)) {
      setPlaybackRate(rate, { persist: true, announce: true });
    }
  });
  els.media.addEventListener('play', () => {
    updatePlayIcons(true);
    setStatus({ state: statusKey('statusPlaying') });
    spectrum.hasAudio = detectHasAudioTrack();
    updateSpectrumVisibility();
    notifyPlaying();
  });
  els.media.addEventListener('pause', () => {
    updatePlayIcons(false);
    if (els.media.ended) return;
    if (stopRequested) {
      // stopPlayback() owns the stopped overlay — avoid a second flash.
      setStatus({ state: statusKey('statusStopped') });
      return;
    }
    setStatus({ state: statusKey('statusPaused') });
    notifyPaused();
  });
  els.media.addEventListener('ended', () => {
    updatePlayIcons(false);
    setStatus({ state: statusKey('statusEnded') });
    notifyOverlayOnce('stopped', { hold: false, label: t('overlayEnded') });
  });
  els.media.addEventListener('waiting', () => setStatus({ state: statusKey('statusBuffering') }));
  els.media.addEventListener('playing', () => {
    setStatus({ state: statusKey('statusPlaying') });
    stopRequested = false;
  });
  els.media.addEventListener('error', () => {
    void handleMediaElementError();
  });
  els.media.addEventListener('timeupdate', syncSeekBar);
  els.media.addEventListener('seeking', () => {
    // Keep UI locked while the engine is jumping.
    seeking = true;
  });
  els.media.addEventListener('seeked', () => {
    finishSeekInteraction(els.media.currentTime);
  });
  els.media.addEventListener('volumechange', () => {
    if (!seeking) els.volumeBar.value = String(Math.round((els.media.muted ? 0 : els.media.volume) * 100));
    updateMuteIcons();
  });
  // One stage click path only — stopPropagation prevents media+wrap double toggle.
  els.media.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePlay();
  });
  els.media.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    toggleFullscreen();
  });
  els.videoWrap?.addEventListener('click', (e) => {
    if (e.target.closest?.('.drop-hint')) return;
    if (e.target.closest?.('button, a, input, select, textarea')) return;
    togglePlay();
  });
  els.videoWrap?.addEventListener('dblclick', (e) => {
    if (e.target.closest?.('.drop-hint')) return;
    toggleFullscreen();
  });
}

function bindToolbar() {
  $('btnOpen').addEventListener('click', () => (isElectron ? openMediaDesktop() : openMediaWeb()));
  $('btnRecent').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleRecentMenu();
  });
  $('btnClearRecent').addEventListener('click', (e) => {
    e.stopPropagation();
    clearRecent();
    renderRecentMenu();
    setStatus({ state: statusKey('statusRecentCleared') });
  });
  els.btnLocale?.addEventListener('click', () => {
    toggleLocale();
  });
  els.btnTheme?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleThemeMenu();
  });
  els.btnToolbarEditTheme?.addEventListener('click', (e) => {
    e.stopPropagation();
    closeThemeMenu();
    fillSettingsForm();
    openThemeEditor();
  });
  document.addEventListener('click', (e) => {
    if (e.target.closest?.('.recent-wrap, .theme-wrap')) return;
    closeToolbarMenus();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeToolbarMenus();
  });
  $('btnOpenSub').addEventListener('click', openSubtitle);
  $('btnYouTube').addEventListener('click', () => openYouTubeDialog());
  $('btnSaveYt').addEventListener('click', () => saveCurrentYouTube());
  $('btnPlay').addEventListener('click', togglePlay);
  $('btnStop').addEventListener('click', stopPlayback);
  $('btnPrev').addEventListener('click', () => seekBy(-(Number(settings.seekStep) || 10)));
  $('btnNext').addEventListener('click', () => seekBy(Number(settings.seekStep) || 10));
  $('btnMute').addEventListener('click', () => {
    if (youtubeMode) {
      if (ytPlayer.isMuted()) ytPlayer.unmute();
      else ytPlayer.mute();
    } else {
      els.media.muted = !els.media.muted;
    }
    updateMuteIcons();
  });
  els.rateSelect.addEventListener('change', () => {
    setPlaybackRate(els.rateSelect.value);
  });
  $('btnRateDown').addEventListener('click', () => stepPlaybackRate(-1));
  $('btnRateUp').addEventListener('click', () => stepPlaybackRate(1));
  $('btnSpectrum').addEventListener('click', (e) => {
    if (e.shiftKey) {
      cycleSpectrumStyle(1);
      return;
    }
    toggleSpectrumPanel();
  });
  $('settingSpectrumStyle')?.addEventListener('change', () => {
    applySpectrumStyle($('settingSpectrumStyle').value);
  });
  bindSpectrumPopupChrome();
  $('btnFullscreen').addEventListener('click', toggleFullscreen);
  $('btnSettings').addEventListener('click', () => {
    fillSettingsForm();
    openThemedDialog(els.settingsModal);
  });
  $('btnAbout').addEventListener('click', () => openThemedDialog(els.aboutModal));

  els.seekBar.addEventListener('pointerdown', beginSeekBar);
  els.seekBar.addEventListener('pointerup', commitSeekBar);
  els.seekBar.addEventListener('pointercancel', commitSeekBar);
  els.seekBar.addEventListener('input', () => {
    seeking = true;
    previewSeekBarTime();
  });
  // Keyboard / accessibility path (and browsers that emit change after drag).
  els.seekBar.addEventListener('change', commitSeekBar);

  els.volumeBar.addEventListener('input', () => {
    const percent = Number(els.volumeBar.value);
    syncVolumeBarFill();
    if (youtubeMode) {
      ytPlayer.setVolume(percent);
    } else {
      els.media.volume = percent / 100;
      els.media.muted = percent === 0;
    }
    updateMuteIcons();
  });

  els.webMediaInput.addEventListener('change', onWebMediaChosen);
  els.webSubInput.addEventListener('change', onWebSubChosen);

  $('btnYtPlay').addEventListener('click', async () => {
    await playYouTubeFromInput(els.youtubeUrlInput.value);
  });
  $('btnYtSaveFromDialog').addEventListener('click', async () => {
    const input = els.youtubeUrlInput.value.trim();
    const id = extractYouTubeId(input);
    if (!id) {
      showYoutubeError(t('youtubeSaveNeedUrl'));
      return;
    }
    if (!youtubeMode || currentYouTube?.id !== id) {
      const ok = await playYouTubeFromInput(input);
      if (!ok) return;
    }
    await saveCurrentYouTube();
  });
  els.youtubeUrlInput.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      await playYouTubeFromInput(els.youtubeUrlInput.value);
    }
  });

  $('settingLocale')?.addEventListener('change', () => {
    applyLocale($('settingLocale').value);
  });
  $('settingSubSize')?.addEventListener('input', () => {
    updateSubSizeValue($('settingSubSize').value);
  });
  $('settingStartVolume')?.addEventListener('input', () => {
    updateStartVolumeValue($('settingStartVolume').value);
  });
  $('settingTheme').addEventListener('change', async () => {
    updateThemeActionButtons();
    await selectTheme($('settingTheme').value);
  });
  $('btnEditTheme').addEventListener('click', () => openThemeEditor());
  $('btnDeleteTheme').addEventListener('click', () => deleteSelectedCustomTheme());
  $('btnCloseThemeEditor').addEventListener('click', () => closeThemeEditor(true));
  $('btnThemeSave').addEventListener('click', (e) => {
    e.preventDefault();
    saveThemeDraft({ asNew: false });
  });
  $('btnThemeSaveAs').addEventListener('click', (e) => {
    e.preventDefault();
    saveThemeDraft({ asNew: true });
  });
  $('themeSchemeSelect').addEventListener('change', () => {
    themeDraft.scheme = $('themeSchemeSelect').value === 'light' ? 'light' : 'dark';
    previewThemeDraft();
  });
  $('themeEditorModal').addEventListener('cancel', (e) => {
    e.preventDefault();
    closeThemeEditor(true);
  });

  $('btnSaveSettings').addEventListener('click', async (e) => {
    e.preventDefault();
    settings = readSettingsForm();
    saveSettings(settings);
    applyLocale(settings.locale, { persist: false });
    await applyTheme(settings.theme);
    applySettingsToPlayer({ applyVolume: true });
    els.settingsModal.close();
    setStatus({ state: statusKey('statusSettingsSaved') });
  });

  $('btnResetSettings').addEventListener('click', async () => {
    settings = resetSettings();
    settings.locale = resolveInitialLocale('auto');
    saveSettings(settings);
    applyLocale(settings.locale, { persist: false });
    fillSettingsForm();
    await applyTheme(settings.theme);
    applySettingsToPlayer({ applyVolume: true });
    setStatus({ state: statusKey('statusSettingsReset') });
  });

  $('aboutEmail').addEventListener('click', (e) => {
    if (isElectron) {
      e.preventDefault();
      window.desktopAPI.openExternal('mailto:knix008@naver.com');
    }
  });
}

function focusPlaybackSurface() {
  const wrap = els.videoWrap;
  if (!wrap) return;
  if (!wrap.hasAttribute('tabindex')) wrap.setAttribute('tabindex', '-1');
  try {
    wrap.focus({ preventScroll: true });
  } catch {
    wrap.focus?.();
  }
}

function bindKeyboard() {
  // Keep Space (and other keys) on the app, not inside YouTube iframe / stray controls.
  els.videoWrap?.setAttribute('tabindex', '-1');
  els.stage?.addEventListener('pointerdown', () => {
    // Defer so click handlers still run, then reclaim focus for Space.
    queueMicrotask(() => focusPlaybackSurface());
  });
  els.controlBar?.addEventListener('pointerup', (e) => {
    if (isEditableTarget(e.target)) return;
    queueMicrotask(() => focusPlaybackSurface());
  });

  document.addEventListener(
    'keydown',
    (e) => {
      // Space Bar: pause / resume — highest priority media control.
      if (isSpaceKey(e) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (isEditableTarget(e.target) || isModalOpen()) return;
        e.preventDefault();
        e.stopPropagation();
        togglePlay();
        focusPlaybackSurface();
        return;
      }

      // Always allow Escape to dismiss overlays even when typing in non-modal UI.
      if (e.key === 'Escape') {
        if (document.fullscreenElement) {
          e.preventDefault();
          document.exitFullscreen?.();
          return;
        }
        if (!els.recentMenu?.hidden || !els.themeMenu?.hidden) {
          e.preventDefault();
          closeToolbarMenus();
          return;
        }
        return;
      }

      if (isEditableTarget(e.target) || isModalOpen()) return;
      if (e.altKey) return;

      const mod = e.ctrlKey || e.metaKey;
      const step = Number(settings.seekStep) || 10;
      const key = e.key;
      const code = e.code;

      // Media keys (keyboards / headsets)
      if (key === 'MediaPlayPause') {
        e.preventDefault();
        togglePlay();
        return;
      }
      if (key === 'MediaStop') {
        e.preventDefault();
        stopPlayback();
        return;
      }
      if (key === 'MediaTrackPrevious' || key === 'MediaRewind') {
        e.preventDefault();
        seekBy(-step);
        return;
      }
      if (key === 'MediaTrackNext' || key === 'MediaFastForward') {
        e.preventDefault();
        seekBy(step);
        return;
      }
      if (key === 'AudioVolumeMute') {
        e.preventDefault();
        toggleMute();
        return;
      }
      if (key === 'AudioVolumeUp') {
        e.preventDefault();
        adjustVolume(5);
        return;
      }
      if (key === 'AudioVolumeDown') {
        e.preventDefault();
        adjustVolume(-5);
        return;
      }

      if (mod) {
        const k = key.toLowerCase();
        if (k === 'o') {
          e.preventDefault();
          isElectron ? openMediaDesktop() : openMediaWeb();
          return;
        }
        if (k === 'r') {
          e.preventDefault();
          toggleRecentMenu();
          return;
        }
        if (k === 'y') {
          e.preventDefault();
          openYouTubeDialog();
          return;
        }
        if (k === 's' && youtubeMode) {
          e.preventDefault();
          saveCurrentYouTube();
          return;
        }
        if (k === ',' || code === 'Comma') {
          e.preventDefault();
          fillSettingsForm();
          openThemedDialog(els.settingsModal);
          return;
        }
        return;
      }

      // Digit keys → seek to 0%…90%
      if (/^[0-9]$/.test(key)) {
        e.preventDefault();
        seekToPercent(Number(key) * 10);
        return;
      }

      switch (key) {
        case 'k':
        case 'K':
          e.preventDefault();
          togglePlay();
          break;
        case 's':
        case 'S':
        case '.':
          e.preventDefault();
          stopPlayback();
          break;
        case 'ArrowLeft':
        case 'j':
        case 'J':
          e.preventDefault();
          seekBy(-step);
          break;
        case 'ArrowRight':
        case 'l':
        case 'L':
          e.preventDefault();
          seekBy(step);
          break;
        case 'Home':
          e.preventDefault();
          seekToPosition(0);
          break;
        case 'End': {
          e.preventDefault();
          const d = getMediaDuration();
          if (Number.isFinite(d) && d > 0) seekToPosition(d);
          break;
        }
        case 'ArrowUp':
          e.preventDefault();
          adjustVolume(5);
          break;
        case 'ArrowDown':
          e.preventDefault();
          adjustVolume(-5);
          break;
        case 'm':
        case 'M':
          e.preventDefault();
          toggleMute();
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          toggleFullscreen();
          break;
        case '[':
        case '<':
          e.preventDefault();
          stepPlaybackRate(-1);
          break;
        case ']':
        case '>':
          e.preventDefault();
          stepPlaybackRate(1);
          break;
        case 'a':
        case 'A':
          e.preventDefault();
          if (e.shiftKey) cycleSpectrumStyle(1);
          else toggleSpectrumPanel();
          break;
        case 'c':
        case 'C':
          e.preventDefault();
          toggleSubtitlesVisible();
          break;
        default:
          break;
      }
    },
    true
  );
}

document.addEventListener('fullscreenchange', () => {
  document.body.classList.toggle('is-fullscreen', Boolean(document.fullscreenElement));
});

async function init() {
  // migrate legacy system theme / locale
  if (settings.theme === 'system') {
    settings.theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    saveSettings(settings);
  }
  if (!settings.locale || settings.locale === 'auto') {
    settings.locale = resolveInitialLocale('auto');
    saveSettings(settings);
  }

  applyLocale(settings.locale, { persist: false });

  // One document-level tooltip host — nested roots were hiding tips via mouseleave races.
  initTooltips(document);

  window.addEventListener('error', (event) => {
    showAppError({
      title: t('errorGenericTitle'),
      message: event.message || t('errorDefaultMessage'),
      detail: [
        event.message || '',
        event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : '',
        event.error?.stack || ''
      ].filter(Boolean).join('\n'),
      error: event.error || event.message,
      context: { type: 'window.error' }
    });
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    showAppError({
      title: t('errorGenericTitle'),
      message: reason?.message || String(reason || t('errorDefaultMessage')),
      error: reason,
      context: { type: 'unhandledrejection' }
    });
  });

  bindWindowControls();
  bindToolbar();
  bindMediaEvents();
  bindDragDrop();
  bindKeyboard();

  populateThemeSelect(settings.theme);
  await applyTheme(settings.theme);
  applySettingsToPlayer({ applyVolume: true });
  updatePlayIcons(false);

  if (isElectron) {
    appInfo = await window.desktopAPI.getAppInfo();
    updateToolbarBrand(appInfo);
    $('aboutName').textContent = appInfo.name;
    $('aboutVersion').textContent = t('aboutVersion', { n: appInfo.version });
    setStatus({
      platform: `${appInfo.platform}/${appInfo.arch}`,
      file: statusKey('statusReady'),
      state: statusKey('statusIdle')
    });
    window.desktopAPI.onYouTubeDownloadProgress?.((progress) => {
      if (progress?.percent != null) {
        setStatus({ state: statusKey('statusDownloadingPct', { n: Math.round(progress.percent) }) });
      } else if (progress?.message) {
        setStatus({ state: progress.message });
      }
    });
  } else {
    updateToolbarBrand({ version: '1.0.0' });
    setStatus({ platform: 'Web', file: statusKey('statusReady'), state: statusKey('statusIdle') });
  }

  updateSaveButton();
  renderRecentMenu();
  syncWindowMinWidth();

  // OS file association / "Open with" / second-instance handoff
  window.desktopAPI?.onOpenMediaPaths?.(async (paths) => {
    const list = Array.isArray(paths) ? paths : [];
    for (const filePath of list) {
      if (!filePath || !isElectron) continue;
      const result = await window.desktopAPI.openMediaPath(filePath);
      if (result?.ok) {
        await loadMedia({
          url: result.url,
          name: result.name,
          path: result.path,
          size: result.size,
          ext: result.ext,
          subtitle: result.subtitle
        });
        break;
      }
    }
  });

  // Paste YouTube URL anywhere (except inputs)
  window.addEventListener('paste', async (e) => {
    const tag = (e.target?.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;
    const text = e.clipboardData?.getData('text') || '';
    if (isYouTubeUrl(text)) {
      e.preventDefault();
      await playYouTubeFromInput(text.trim());
    }
  });

}

init();
