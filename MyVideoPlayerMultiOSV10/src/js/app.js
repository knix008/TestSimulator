import { loadSettings, saveSettings, resetSettings, normalizeVideoFit } from './settings.js';
import { parseSubtitle, SubtitleRenderer, findSubtitleInFileList } from './subtitles.js';
import { SpectrumAnalyzer, SPECTRUM_STYLES, normalizeSpectrumStyle } from './spectrum.js';
import {
  openSpectrumWindow,
  closeSpectrumWindow,
  focusSpectrumWindow,
  postSpectrumMessage,
  onSpectrumWindowEvent,
  markSpectrumWindowClosed,
  isSpectrumWindowSupported
} from './spectrum-bridge.js';
import {
  openHistoryWindow,
  closeHistoryWindow,
  postHistoryMessage,
  onHistoryWindowEvent,
  markHistoryWindowClosed,
  isHistoryWindowSupported
} from './history-bridge.js';
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
  progressModal: $('progressModal'),
  progressTitle: $('progressTitle'),
  progressName: $('progressName'),
  progressTrack: $('progressTrack'),
  progressFill: $('progressFill'),
  progressValue: $('progressValue'),
  progressDetail: $('progressDetail'),
  progressMeta: $('progressMeta'),
  progressSaved: $('progressSaved'),
  progressSavedName: $('progressSavedName'),
  progressSavedPath: $('progressSavedPath'),
  progressSavedSize: $('progressSavedSize'),
  progressSavedSizeRow: $('progressSavedSizeRow'),
  progressSavedElapsed: $('progressSavedElapsed'),
  progressSavedElapsedRow: $('progressSavedElapsedRow'),
  btnProgressCancel: $('btnProgressCancel'),
  btnProgressClose: $('btnProgressClose'),
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
  stageContextMenu: $('stageContextMenu'),
  ctxSaveMedia: $('ctxSaveMedia'),
  ctxSaveMediaLabel: $('ctxSaveMediaLabel'),
  ctxPlayPause: $('ctxPlayPause'),
  ctxPlayPauseLabel: $('ctxPlayPauseLabel'),
  ctxMute: $('ctxMute'),
  ctxMuteLabel: $('ctxMuteLabel'),
  rateSelect: $('rateSelect'),
  btnRecent: $('btnRecent'),
  recentMenu: $('recentMenu'),
  recentList: $('recentList'),
  btnClearRecent: $('btnClearRecent'),
  btnHistory: $('btnHistory'),
  btnLocale: $('btnLocale'),
  localeBtnLabel: $('localeBtnLabel'),
  btnTheme: $('btnTheme'),
  themeMenu: $('themeMenu'),
  themeList: $('themeList'),
  btnToolbarEditTheme: $('btnToolbarEditTheme'),
  btnFit: $('btnFit'),
  fitMenu: $('fitMenu'),
  fitList: $('fitList'),
  btnCompact: $('btnCompact'),
  appRoot: document.getElementById('app'),
  controlBar: $('controlBar'),
  statusBar: $('statusBar'),
  errorModal: $('errorModal'),
  errorTitle: $('errorTitle'),
  errorMessage: $('errorMessage'),
  errorDetail: $('errorDetail'),
  errorCopied: $('errorCopied'),
  btnCopyError: $('btnCopyError'),
  btnCloseError: $('btnCloseError')
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
/** @type {string|null} */
let currentRtspUrl = null;
let rtspRecording = false;
/** @type {'youtube' | 'rtsp' | 'open-youtube' | 'open-rtsp' | null} */
let saveProgressMode = null;
let saveProgressCloseTimer = 0;
/** Abort flag for in-flight YouTube/RTSP open. */
let openStreamCancelled = false;
/** Prevents double Play/Connect while YouTube/RTSP open is running. */
let openStreamInFlight = false;
/** Bounds to restore when leaving compact mode. */
let compactRestoreBounds = null;
/** Last non-zero local volume % (for mute toggle with Web Audio gain). */
let lastAudibleVolumePct = 80;
let overlayTimer = 0;
/** @type {'paused' | 'stopped' | null} */
let holdOverlayMode = null;
let stopRequested = false;
let ytErrorDialogShown = false;

const subtitles = new SubtitleRenderer(els.subtitleOverlay);
let spectrumWindowOpen = false;
let historyWindowOpen = false;

function getSpectrumThemePayload() {
  const def = getThemeDefinition(settings.theme);
  const vars = ensureDerivedVars(cloneVarsFromTheme(settings.theme));
  return {
    themeId: def.builtin ? def.id : 'custom',
    scheme: def.scheme === 'light' ? 'light' : 'dark',
    vars
  };
}

function getSpectrumInitPayload() {
  return {
    locale: settings.locale === 'ko' ? 'ko' : 'en',
    style: normalizeSpectrumStyle(settings.spectrumStyle),
    theme: getSpectrumThemePayload(),
    opacity: clampWindowOpacity(settings.spectrumOpacity),
    compact: Boolean(settings.compactMode)
  };
}

function pushSpectrumFrame(bins) {
  if (!spectrumWindowOpen || !settings.showSpectrum) return;
  // Structured-clone friendly copy for IPC / BroadcastChannel.
  postSpectrumMessage({ type: 'frame', bins: Array.from(bins) });
}

const spectrum = new SpectrumAnalyzer(els.media, { onFrame: pushSpectrumFrame });

async function openSpectrumPopup() {
  if (!isSpectrumWindowSupported()) return false;
  const ok = await openSpectrumWindow(getSpectrumInitPayload());
  if (!ok) return false;
  spectrumWindowOpen = true;
  postSpectrumMessage({ type: 'sync', ...getSpectrumInitPayload() });
  return true;
}

async function closeSpectrumPopup({ updateSetting = false } = {}) {
  spectrumWindowOpen = false;
  spectrum.stop();
  await closeSpectrumWindow();
  markSpectrumWindowClosed();
  if (updateSetting && settings.showSpectrum) {
    settings.showSpectrum = false;
    saveSettings(settings);
    $('btnSpectrum')?.setAttribute('aria-pressed', 'false');
    if ($('settingShowSpectrum')) $('settingShowSpectrum').checked = false;
  }
}

function bindSpectrumWindowBridge() {
  onSpectrumWindowEvent((msg) => {
    if (!msg) return;
    if (msg.type === 'closed') {
      spectrumWindowOpen = false;
      markSpectrumWindowClosed();
      spectrum.stop();
      if (settings.showSpectrum) {
        settings.showSpectrum = false;
        saveSettings(settings);
        $('btnSpectrum')?.setAttribute('aria-pressed', 'false');
        if ($('settingShowSpectrum')) $('settingShowSpectrum').checked = false;
      }
      return;
    }
    if (msg.type === 'ready') {
      postSpectrumMessage({ type: 'sync', ...getSpectrumInitPayload() });
      return;
    }
    if (msg.type === 'style' && msg.style) {
      applySpectrumStyle(msg.style, { persist: true, fromWindow: true });
      return;
    }
    if (msg.type === 'opacity' && msg.opacity != null) {
      void applySpectrumOpacity(msg.opacity, { persist: true });
    }
  });
}

function getHistoryInitPayload() {
  return {
    locale: getLocaleSafe() === 'ko' ? 'ko' : 'en',
    theme: getSpectrumThemePayload(),
    opacity: clampWindowOpacity(settings.historyOpacity),
    compact: Boolean(settings.compactMode),
    items: loadRecent()
  };
}

function syncHistoryWindowItems() {
  if (!historyWindowOpen) return;
  postHistoryMessage({ type: 'items', items: loadRecent() });
}

async function openHistoryPopup() {
  if (!isHistoryWindowSupported()) return false;
  const ok = await openHistoryWindow(getHistoryInitPayload());
  if (!ok) return false;
  historyWindowOpen = true;
  els.btnHistory?.setAttribute('aria-pressed', 'true');
  els.btnHistory?.classList.add('is-active');
  postHistoryMessage({ type: 'sync', ...getHistoryInitPayload() });
  return true;
}

async function closeHistoryPopup({ updateSetting = true } = {}) {
  historyWindowOpen = false;
  els.btnHistory?.setAttribute('aria-pressed', 'false');
  els.btnHistory?.classList.remove('is-active');
  await closeHistoryWindow();
  markHistoryWindowClosed();
  if (updateSetting && settings.showHistoryPanel) {
    settings.showHistoryPanel = false;
    saveSettings(settings);
  }
}

async function setHistoryWindowOpen(open, { persist = true } = {}) {
  const next = Boolean(open);
  if (next) {
    const ok = await openHistoryPopup();
    if (!ok) return false;
    if (persist && !settings.showHistoryPanel) {
      settings.showHistoryPanel = true;
      saveSettings(settings);
    }
    return true;
  }
  await closeHistoryPopup({ updateSetting: persist });
  return true;
}

function toggleHistoryWindow() {
  if (historyWindowOpen) {
    void setHistoryWindowOpen(false);
  } else {
    void setHistoryWindowOpen(true);
  }
}

function bindHistoryWindowBridge() {
  onHistoryWindowEvent((msg) => {
    if (!msg) return;
    if (msg.type === 'closed') {
      historyWindowOpen = false;
      markHistoryWindowClosed();
      els.btnHistory?.setAttribute('aria-pressed', 'false');
      els.btnHistory?.classList.remove('is-active');
      if (settings.showHistoryPanel) {
        settings.showHistoryPanel = false;
        saveSettings(settings);
      }
      return;
    }
    if (msg.type === 'ready') {
      postHistoryMessage({ type: 'sync', ...getHistoryInitPayload() });
      return;
    }
    if (msg.type === 'play' && msg.id) {
      const item = loadRecent().find((r) => r.id === msg.id);
      if (item) void playRecentItem(item);
      return;
    }
    if (msg.type === 'remove' && msg.id) {
      removeRecent(msg.id);
      renderPlayHistory();
      setStatus({ state: statusKey('statusRecentRemoved') });
      return;
    }
    if (msg.type === 'clear') {
      clearRecent();
      renderPlayHistory();
      setStatus({ state: statusKey('statusRecentCleared') });
      return;
    }
    if (msg.type === 'opacity' && msg.opacity != null) {
      void applyHistoryOpacity(msg.opacity, { persist: true });
    }
  });
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
  onChromePlaybackStarted();
}

function notifyPaused() {
  if (stopRequested) return;
  // Keep pause icon visible until play / stop / new media.
  notifyOverlayOnce('paused', { hold: true });
  onChromePlaybackPaused();
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
  const canSave = Boolean(
    isElectron &&
      ((youtubeMode && currentYouTube?.url) || currentRtspUrl || rtspRecording)
  );
  els.btnSaveYt.disabled = !canSave;
  if (els.btnSaveYt) {
    els.btnSaveYt.setAttribute(
      'data-tooltip',
      rtspRecording ? t('rtspStopRecordTip') : currentRtspUrl ? t('rtspSaveTip') : t('saveYtTip')
    );
    els.btnSaveYt.classList.toggle('is-recording', rtspRecording);
  }
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

function rememberRecentFile({ path: filePath, name, title, ext, size }) {
  if (!filePath) return;
  addRecent({
    type: 'file',
    id: `file:${filePath}`,
    path: filePath,
    name: name || filePath,
    title: title || name || filePath,
    ext: ext || '',
    size
  });
  renderPlayHistory();
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
  renderPlayHistory();
}

function isRtspUrl(input) {
  return /^rtsps?:\/\//i.test(String(input || '').trim());
}

function rtspDisplayName(url) {
  try {
    const u = new URL(url);
    return u.host || url;
  } catch {
    return url;
  }
}

function rememberRecentRtsp({ url, title }) {
  if (!url) return;
  addRecent({
    type: 'rtsp',
    id: `rtsp:${url}`,
    url,
    name: title || rtspDisplayName(url),
    title: title || rtspDisplayName(url)
  });
  renderPlayHistory();
}

function renderPlayHistory() {
  renderRecentMenu();
  syncHistoryWindowItems();
}

async function finalizeRtspRecordIfAny() {
  if (!isElectron || !window.desktopAPI?.stopRtspRecord) {
    rtspRecording = false;
    updateSaveButton();
    return null;
  }
  if (!rtspRecording) {
    try {
      const active = await window.desktopAPI.getRtspRecording?.();
      if (!active) return null;
    } catch {
      return null;
    }
  }
  try {
    const result = await window.desktopAPI.stopRtspRecord({ discard: false });
    rtspRecording = false;
    updateSaveButton();
    return result;
  } catch {
    rtspRecording = false;
    updateSaveButton();
    return null;
  }
}

async function stopRtspBridge({ finalizeRecord = false } = {}) {
  if (finalizeRecord) {
    const recorded = await finalizeRtspRecordIfAny();
    if (recorded?.ok && recorded.path) {
      setStatus({
        state: statusKey('statusRtspRecordSaved'),
        file: recorded.path
      });
    }
  }
  if (!currentRtspUrl && !(isElectron && window.desktopAPI?.stopRtsp)) {
    currentRtspUrl = null;
    updateSaveButton();
    return;
  }
  currentRtspUrl = null;
  if (isElectron && window.desktopAPI?.stopRtsp) {
    try {
      await window.desktopAPI.stopRtsp();
    } catch {
      /* ignore */
    }
  }
  updateSaveButton();
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
    const badgeClass =
      item.type === 'youtube' ? 'yt' : item.type === 'rtsp' ? 'rtsp' : 'file';
    const badgeLabel =
      item.type === 'youtube' ? 'YT' : item.type === 'rtsp' ? 'RTSP' : 'FILE';
    btn.innerHTML = `
      <span class="recent-badge ${badgeClass}">${badgeLabel}</span>
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
      renderPlayHistory();
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
  if (except !== 'fit') closeFitMenu();
  closeStageContextMenu();
}

function closeStageContextMenu() {
  const menu = els.stageContextMenu;
  if (!menu || menu.hidden) return;
  menu.hidden = true;
}

function openStageContextMenu(clientX, clientY) {
  const menu = els.stageContextMenu;
  if (!menu) return;

  closeToolbarMenus();

  const scheme = document.documentElement.getAttribute('data-color-scheme') || 'dark';
  menu.setAttribute('data-color-scheme', scheme);

  const canSave = Boolean(
    isElectron &&
      ((youtubeMode && currentYouTube?.url) || currentRtspUrl || rtspRecording)
  );
  if (els.ctxSaveMedia) {
    els.ctxSaveMedia.disabled = !canSave;
    if (els.ctxSaveMediaLabel) els.ctxSaveMediaLabel.textContent = t('save');
  }
  const playing = youtubeMode ? ytPlayer.isPlaying() : !els.media.paused && !els.media.ended;
  if (els.ctxPlayPauseLabel) els.ctxPlayPauseLabel.textContent = t(playing ? 'pause' : 'play');
  els.ctxPlayPause?.querySelector('.ctx-icon-play')?.classList.toggle('hidden', playing);
  els.ctxPlayPause?.querySelector('.ctx-icon-pause')?.classList.toggle('hidden', !playing);
  const muted = youtubeMode ? ytPlayer.isMuted() : els.media.muted || Number(els.volumeBar.value) === 0;
  if (els.ctxMuteLabel) els.ctxMuteLabel.textContent = t(muted ? 'unmute' : 'mute');
  els.ctxMute?.querySelector('.ctx-icon-volume')?.classList.toggle('hidden', muted);
  els.ctxMute?.querySelector('.ctx-icon-muted')?.classList.toggle('hidden', !muted);
  updateFitMenuSelection();

  menu.hidden = false;
  // Measure after show so clamping uses real size.
  const pad = 8;
  const rect = menu.getBoundingClientRect();
  const left = Math.min(Math.max(pad, clientX), window.innerWidth - rect.width - pad);
  const top = Math.min(Math.max(pad, clientY), window.innerHeight - rect.height - pad);
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
}

function bindStageContextMenu() {
  const wrap = els.videoWrap;
  const menu = els.stageContextMenu;
  if (!wrap || !menu) return;

  wrap.addEventListener('contextmenu', (e) => {
    if (e.target.closest?.('.save-progress-popup, .history-panel, button, a, input, select, textarea')) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    openStageContextMenu(e.clientX, e.clientY);
  });

  menu.addEventListener('click', (e) => {
    e.stopPropagation();
    const item = e.target.closest?.('button');
    if (!item || item.disabled) return;
    closeStageContextMenu();
    if (item.dataset.fit) {
      applyVideoFit(item.dataset.fit, { announce: true });
      return;
    }
    if (item === els.ctxSaveMedia) {
      void saveCurrentMedia();
      return;
    }
    if (item.dataset.action === 'play-pause') togglePlay();
    else if (item.dataset.action === 'stop') stopPlayback();
    else if (item.dataset.action === 'mute') toggleMute();
    else if (item.dataset.action === 'fullscreen') void toggleFullscreen();
  });
  menu.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  document.addEventListener(
    'pointerdown',
    (e) => {
      if (menu.hidden) return;
      if (menu.contains(e.target)) return;
      closeStageContextMenu();
    },
    true
  );
}

function fitLabelKey(mode) {
  if (mode === 'cover') return 'fitCover';
  if (mode === 'actual') return 'fitActual';
  return 'fitContain';
}

function fitStatusKey(mode) {
  if (mode === 'cover') return 'statusFitCover';
  if (mode === 'actual') return 'statusFitActual';
  return 'statusFitContain';
}

function updateActualMediaSize() {
  if (!els.media) return;
  if (normalizeVideoFit(settings.videoFit) !== 'actual' || youtubeMode) {
    els.media.style.width = '';
    els.media.style.height = '';
    return;
  }
  const w = els.media.videoWidth;
  const h = els.media.videoHeight;
  if (w > 0 && h > 0) {
    els.media.style.width = `${w}px`;
    els.media.style.height = `${h}px`;
  }
}

function updateFitMenuSelection() {
  const current = normalizeVideoFit(settings.videoFit);
  document.querySelectorAll('#fitList [data-fit], #stageContextMenu [data-fit]').forEach((btn) => {
    const active = btn.dataset.fit === current;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-checked', String(active));
    const check = btn.querySelector('.popup-item-check');
    if (check) check.textContent = active ? '✓' : '';
  });
}

function updateFitToolbarButton() {
  const current = normalizeVideoFit(settings.videoFit);
  const label = t(fitLabelKey(current));
  els.btnFit?.setAttribute('data-tooltip', `${t('fitTip')}: ${label}`);
  els.btnFit?.setAttribute('aria-label', `${t('fit')}: ${label}`);
  const labelEl = $('fitBtnLabel');
  if (labelEl) labelEl.textContent = label;
  const btn = els.btnFit;
  if (btn) {
    btn.querySelector('.icon-fit-cover')?.classList.toggle('hidden', current !== 'cover');
    btn.querySelector('.icon-fit-contain')?.classList.toggle('hidden', current !== 'contain');
    btn.querySelector('.icon-fit-actual')?.classList.toggle('hidden', current !== 'actual');
  }
}

function applyVideoFit(mode, { persist = true, announce = false } = {}) {
  const next = normalizeVideoFit(mode);
  settings.videoFit = next;
  if (persist) saveSettings(settings);
  els.videoWrap?.classList.remove('fit-contain', 'fit-cover', 'fit-actual');
  els.videoWrap?.classList.add(`fit-${next}`);
  updateActualMediaSize();
  updateFitMenuSelection();
  updateFitToolbarButton();
  if (announce) setStatus({ state: statusKey(fitStatusKey(next)) });
}

function openFitMenu() {
  closeToolbarMenus({ except: 'fit' });
  updateFitMenuSelection();
  syncThemeToOverlays();
  if (els.fitMenu) els.fitMenu.hidden = false;
  els.btnFit?.setAttribute('aria-expanded', 'true');
}

function closeFitMenu() {
  if (!els.fitMenu) return;
  els.fitMenu.hidden = true;
  els.btnFit?.setAttribute('aria-expanded', 'false');
}

function toggleFitMenu() {
  if (els.fitMenu?.hidden) openFitMenu();
  else closeFitMenu();
}

function updateLocaleToolbarButton() {
  const locale = getLocaleSafe();
  // Show the language you can switch to (not the current one).
  const nextLabel = locale === 'ko' ? 'ENG' : '한글';
  if (els.localeBtnLabel) els.localeBtnLabel.textContent = nextLabel;
  els.btnLocale?.setAttribute('data-tooltip', `${t('languageTip')}: ${nextLabel}`);
  els.btnLocale?.setAttribute('aria-label', `${t('language')}: ${nextLabel}`);
}

/** Compact chrome floors — buttons / sliders must not collide. */
const COMPACT_MIN_HEIGHT = 220;
const COMPACT_MIN_WIDTH_FLOOR = 520;

/**
 * Measure compact toolbar + control-bar content and apply Electron min size
 * so the window cannot shrink below a non-overlapping layout.
 */
function syncCompactWindowMinSize() {
  if (!isElectron || !window.desktopAPI?.setMinimumSize) return;
  if (!settings.compactMode) return;

  const measure = () => {
    const toolbar = document.getElementById('toolbar');
    const control = els.controlBar;
    let neededW = COMPACT_MIN_WIDTH_FLOOR;

    if (toolbar) {
      const left = toolbar.querySelector('.toolbar-left');
      const right = toolbar.querySelector('.toolbar-right');
      const caps = document.getElementById('windowControls');
      const parts = [left, right, caps].filter(Boolean);
      let fixed = 0;
      for (const el of parts) {
        if (getComputedStyle(el).display === 'none') continue;
        fixed += el.getBoundingClientRect().width;
      }
      // Spacer + chrome padding / gaps
      fixed += 24 + 20;
      neededW = Math.max(neededW, Math.ceil(fixed));
    }

    if (control && getComputedStyle(control).display !== 'none') {
      let controlNeed = 0;
      const fixedParts = control.querySelectorAll(
        '.transport-row > .toolbar-group, .transport-row > .fit-wrap, .transport-row > .volume-group, .transport-row > .toolbar-sep:not([hidden])'
      );
      fixedParts.forEach((el) => {
        if (getComputedStyle(el).display === 'none') return;
        controlNeed += el.getBoundingClientRect().width;
      });
      const seek = control.querySelector('.seek-row');
      if (seek && getComputedStyle(seek).display !== 'none') {
        const times = seek.querySelectorAll('.time-label');
        let timeW = 0;
        times.forEach((el) => {
          timeW += Math.max(el.getBoundingClientRect().width, 36);
        });
        // CSS min-width on seek track + time labels + gaps
        controlNeed += 140 + timeW + 12;
      }
      controlNeed += 24; // control-bar padding
      neededW = Math.max(neededW, Math.ceil(controlNeed));
    }

    const minW = Math.max(COMPACT_MIN_WIDTH_FLOOR, Math.min(neededW, 900));
    void window.desktopAPI.setMinimumSize(minW, COMPACT_MIN_HEIGHT).then(async () => {
      if (!window.desktopAPI?.getBounds || !window.desktopAPI?.setBounds) return;
      try {
        const cur = await window.desktopAPI.getBounds();
        if (!cur) return;
        if (cur.width < minW || cur.height < COMPACT_MIN_HEIGHT) {
          await window.desktopAPI.setBounds({
            x: cur.x,
            y: cur.y,
            width: Math.max(cur.width || 0, minW),
            height: Math.max(cur.height || 0, COMPACT_MIN_HEIGHT)
          });
        }
      } catch {
        /* ignore */
      }
    });
  };

  requestAnimationFrame(() => requestAnimationFrame(measure));
}

/** Keep the frameless window wide enough that toolbar controls stay visible. */
function syncWindowMinWidth() {
  if (!isElectron || !window.desktopAPI?.setMinimumSize) return;

  if (settings.compactMode) {
    syncCompactWindowMinSize();
    return;
  }

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

function updateCompactButton() {
  const on = Boolean(settings.compactMode);
  const btn = els.btnCompact;
  if (!btn) return;
  btn.classList.toggle('is-active', on);
  btn.setAttribute('aria-pressed', String(on));
  btn.querySelector('.icon-compact-enter')?.classList.toggle('hidden', on);
  btn.querySelector('.icon-compact-exit')?.classList.toggle('hidden', !on);
  if (on) {
    btn.setAttribute('data-tooltip', t('compactExpandTip'));
    btn.setAttribute('aria-label', t('compactExpand'));
    btn.setAttribute('data-i18n-tooltip', 'compactExpandTip');
    btn.setAttribute('data-i18n-aria', 'compactExpand');
  } else {
    btn.setAttribute('data-tooltip', t('compactTip'));
    btn.setAttribute('aria-label', t('compact'));
    btn.setAttribute('data-i18n-tooltip', 'compactTip');
    btn.setAttribute('data-i18n-aria', 'compact');
  }
}

let chromeHideTimer = 0;
const CHROME_HIDE_MS = 2000;

function isMediaPlayingNow() {
  if (youtubeMode) return Boolean(ytPlayer.isPlaying?.());
  return Boolean(els.media?.src) && !els.media.paused && !els.media.ended;
}

function setChromeVisibleClass(on) {
  els.appRoot?.classList.toggle('chrome-visible', on);
  document.body.classList.toggle('chrome-visible', on);
  document.documentElement.classList.toggle('chrome-visible', on);
  // Keep legacy compact class in sync for any remaining selectors.
  els.appRoot?.classList.toggle('compact-chrome-visible', on);
  document.body.classList.toggle('compact-chrome-visible', on);
  document.documentElement.classList.toggle('compact-chrome-visible', on);
}

function setChromePinnedClass(on) {
  els.appRoot?.classList.toggle('chrome-pinned', on);
  document.body.classList.toggle('chrome-pinned', on);
  document.documentElement.classList.toggle('chrome-pinned', on);
}

function isChromeAutoHideEnabled() {
  return settings.autoHideChrome !== false;
}

function applyChromeAutoHideSetting() {
  const autoHide = isChromeAutoHideEnabled();
  setChromePinnedClass(!autoHide);
  if (!autoHide) {
    if (chromeHideTimer) {
      clearTimeout(chromeHideTimer);
      chromeHideTimer = 0;
    }
    setChromeVisibleClass(true);
    return;
  }
  if (isMediaPlayingNow()) {
    showChromeOverlay();
    scheduleHideChromeOverlay();
  } else {
    showChromeOverlay({ sticky: true });
  }
}

function showChromeOverlay({ sticky = false } = {}) {
  setChromeVisibleClass(true);
  if (chromeHideTimer) {
    clearTimeout(chromeHideTimer);
    chromeHideTimer = 0;
  }
  if (!isChromeAutoHideEnabled()) return;
  // While playing, always schedule auto-hide after idle.
  if (!sticky || isMediaPlayingNow()) scheduleHideChromeOverlay();
}

function scheduleHideChromeOverlay() {
  if (!isChromeAutoHideEnabled()) return;
  if (chromeHideTimer) clearTimeout(chromeHideTimer);
  chromeHideTimer = window.setTimeout(() => {
    chromeHideTimer = 0;
    hideChromeOverlay();
  }, CHROME_HIDE_MS);
}

function hideChromeOverlay({ force = false } = {}) {
  if (!force && !isChromeAutoHideEnabled()) {
    setChromeVisibleClass(true);
    return;
  }
  const toolbar = $('toolbar');
  const bottom = $('bottomChrome');
  const control = els.controlBar;
  if (!force && toolbar?.classList.contains('is-dragging')) return;
  if (
    !force &&
    (toolbar?.matches(':hover, :focus-within') ||
      bottom?.matches(':hover, :focus-within') ||
      control?.matches(':hover, :focus-within') ||
      els.statusBar?.matches(':hover, :focus-within'))
  ) {
    if (isMediaPlayingNow()) scheduleHideChromeOverlay();
    return;
  }
  // Keep open while a toolbar popup menu is open.
  if (
    !force &&
    ((els.recentMenu && !els.recentMenu.hidden) ||
      (els.themeMenu && !els.themeMenu.hidden) ||
      (els.fitMenu && !els.fitMenu.hidden))
  ) {
    scheduleHideChromeOverlay();
    return;
  }
  setChromeVisibleClass(false);
}

function onChromePlaybackStarted() {
  if (!isChromeAutoHideEnabled()) {
    setChromeVisibleClass(true);
    return;
  }
  showChromeOverlay();
  scheduleHideChromeOverlay();
}

function onChromePlaybackPaused() {
  showChromeOverlay({ sticky: true });
  if (!isChromeAutoHideEnabled()) return;
  if (chromeHideTimer) {
    clearTimeout(chromeHideTimer);
    chromeHideTimer = 0;
  }
}

function bindChromeOverlay() {
  const chrome = $('chrome');
  if (!chrome) return;

  const onMove = () => {
    if (!isChromeAutoHideEnabled()) return;
    // Any mouse movement over the video (or chrome UI) reveals the bars;
    // the idle countdown hides them again while playing. This mirrors the
    // standard video-player behaviour and applies in compact mode too.
    showChromeOverlay();
  };

  chrome.addEventListener('mousemove', onMove);
  chrome.addEventListener('mouseenter', onMove);
  chrome.addEventListener('mouseleave', () => {
    if (!isChromeAutoHideEnabled()) return;
    if (chromeHideTimer) clearTimeout(chromeHideTimer);
    chromeHideTimer = window.setTimeout(() => {
      chromeHideTimer = 0;
      if ($('toolbar')?.classList.contains('is-dragging')) return;
      if (!isMediaPlayingNow()) return;
      setChromeVisibleClass(false);
    }, 280);
  });

  const stickShow = () => showChromeOverlay({ sticky: true });
  const stickHide = () => {
    if (!isChromeAutoHideEnabled()) return;
    if (isMediaPlayingNow()) scheduleHideChromeOverlay();
  };
  $('toolbar')?.addEventListener('pointerenter', stickShow);
  $('toolbar')?.addEventListener('pointerleave', stickHide);
  $('bottomChrome')?.addEventListener('pointerenter', stickShow);
  $('bottomChrome')?.addEventListener('pointerleave', stickHide);
}

async function setCompactMode(next, { persist = true, announce = false } = {}) {
  const on = Boolean(next);
  const wasOn = Boolean(settings.compactMode);
  settings.compactMode = on;
  if (persist) saveSettings(settings);

  document.documentElement.classList.toggle('is-compact', on);
  document.body.classList.toggle('is-compact', on);
  els.appRoot?.classList.toggle('is-compact', on);

  if (on) {
    closeToolbarMenus();
    applyChromeAutoHideSetting();
  } else {
    applyChromeAutoHideSetting();
  }

  updateCompactButton();

  if (spectrumWindowOpen) {
    postSpectrumMessage({ type: 'compact', compact: on });
  }
  if (historyWindowOpen) {
    postHistoryMessage({ type: 'compact', compact: on });
  }

  if (isElectron && window.desktopAPI?.setBounds && window.desktopAPI?.getBounds) {
    try {
      if (on) {
        if (await window.desktopAPI.isMaximized?.()) {
          await window.desktopAPI.maximizeToggle();
          await new Promise((r) => requestAnimationFrame(() => r()));
        }
        if (!wasOn) {
          compactRestoreBounds = await window.desktopAPI.getBounds();
        }
        // Provisional floor; refined by syncCompactWindowMinSize after layout.
        await window.desktopAPI.setMinimumSize(COMPACT_MIN_WIDTH_FLOOR, COMPACT_MIN_HEIGHT);
        const cur = compactRestoreBounds || (await window.desktopAPI.getBounds()) || {};
        await window.desktopAPI.setBounds({
          x: cur.x,
          y: cur.y,
          width: Math.max(COMPACT_MIN_WIDTH_FLOOR, Math.min(560, cur.width || 560)),
          height: Math.max(COMPACT_MIN_HEIGHT, Math.min(280, cur.height || 280))
        });
        syncCompactWindowMinSize();
      } else {
        const restore = compactRestoreBounds;
        compactRestoreBounds = null;
        syncWindowMinWidth();
        if (restore && restore.width >= 640 && restore.height >= 360) {
          await window.desktopAPI.setBounds(restore);
        } else {
          const cur = (await window.desktopAPI.getBounds()) || {};
          await window.desktopAPI.setBounds({
            x: cur.x,
            y: cur.y,
            width: Math.max(1100, cur.width || 0),
            height: Math.max(720, cur.height || 0)
          });
        }
      }
    } catch {
      syncWindowMinWidth();
    }
  } else {
    syncWindowMinWidth();
  }

  if (announce) {
    setStatus({ state: statusKey(on ? 'statusCompactOn' : 'statusCompactOff') });
  }
}

function toggleCompactMode() {
  void setCompactMode(!settings.compactMode, { announce: true });
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
  if (item.type === 'rtsp') {
    await playRtspFromInput(item.url || item.id.replace(/^rtsp:/, ''));
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
  // Live tooltip while adjusting (0–100%).
  const tip = t('volumeTipPct', { n: clamped });
  el.setAttribute('data-tooltip', tip);
  el.setAttribute('aria-label', tip);
  const tipEl = document.getElementById('tooltip');
  if (tipEl && !tipEl.hidden && (document.activeElement === el || el.matches?.(':hover'))) {
    tipEl.textContent = tip;
  }
}

/**
 * Local <video> volume. Once SpectrumAnalyzer owns the output graph, loudness
 * goes through a GainNode so the analyser still sees full-level audio.
 */
function setLocalVolumePercent(percent) {
  const p = Math.min(100, Math.max(0, Math.round(Number(percent) || 0)));
  if (p > 0) lastAudibleVolumePct = p;
  els.volumeBar.value = String(p);
  if (spectrum.hasWebAudioOutput()) {
    spectrum.setOutputLevel(p / 100);
    els.media.volume = 1;
    els.media.muted = false;
  } else {
    els.media.volume = p / 100;
    els.media.muted = p === 0;
  }
  syncVolumeBarFill();
}

function syncSpectrumOutputFromUi() {
  if (!spectrum.hasWebAudioOutput()) return;
  const p = Math.min(100, Math.max(0, Number(els.volumeBar.value) || 0));
  spectrum.setOutputLevel(p / 100);
  els.media.volume = 1;
  els.media.muted = false;
}

function updateMuteIcons() {
  const muted = youtubeMode
    ? (ytPlayer.isMuted() || Number(els.volumeBar.value) === 0)
    : spectrum.hasWebAudioOutput()
      ? Number(els.volumeBar.value) === 0
      : (els.media.muted || els.media.volume === 0);
  $('btnMute').querySelector('.icon-vol').classList.toggle('hidden', muted);
  $('btnMute').querySelector('.icon-muted').classList.toggle('hidden', !muted);
  syncVolumeBarFill();
}

function enterYouTubeMode() {
  youtubeMode = true;
  els.videoWrap.classList.add('youtube-mode');
  updateActualMediaSize();
  updateSpectrumVisibility();
  updateSaveButton();
}

function exitYouTubeMode() {
  if (!youtubeMode && !ytPlayer.active) return;
  ytPlayer.destroy();
  youtubeMode = false;
  currentYouTube = null;
  els.videoWrap.classList.remove('youtube-mode');
  updateActualMediaSize();
  updateSpectrumVisibility();
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
  if (spectrumWindowOpen) {
    postSpectrumMessage({ type: 'theme', theme: getSpectrumThemePayload() });
  }
  if (historyWindowOpen) {
    postHistoryMessage({ type: 'theme', theme: getSpectrumThemePayload() });
  }
  return def;
}

/**
 * Open a themed dialog.
 * Use modal:false (default) so Chromium does not mark the page inert and pause media.
 * Pass modal:true only when the flow should block the app (e.g. URL entry, errors).
 */
function openThemedDialog(dialogEl, { modal = false } = {}) {
  if (!dialogEl) return;
  syncThemeToOverlays();
  dialogEl.dataset.blocking = modal ? 'true' : 'false';
  if (modal) {
    if (typeof dialogEl.showModal === 'function') dialogEl.showModal();
    else dialogEl.setAttribute('open', '');
    return;
  }
  if (typeof dialogEl.show === 'function') dialogEl.show();
  else dialogEl.setAttribute('open', '');
}

function closeTopNonblockingDialog() {
  const open = [...document.querySelectorAll('dialog.modal[open][data-blocking="false"]')];
  const top = open[open.length - 1];
  if (!top) return false;
  if (typeof top.close === 'function') top.close();
  else top.removeAttribute('open');
  return true;
}

function clearSaveProgressCloseTimer() {
  if (saveProgressCloseTimer) {
    clearTimeout(saveProgressCloseTimer);
    saveProgressCloseTimer = 0;
  }
}

function isSaveProgressVisible() {
  return Boolean(els.progressModal && !els.progressModal.hidden);
}

function hideSavedInfo() {
  els.progressSaved?.classList.add('hidden');
  if (els.progressSavedName) els.progressSavedName.textContent = '';
  if (els.progressSavedPath) els.progressSavedPath.textContent = '';
  if (els.progressSavedSize) els.progressSavedSize.textContent = '';
  if (els.progressSavedElapsed) els.progressSavedElapsed.textContent = '';
  els.progressSavedSizeRow?.classList.add('hidden');
  els.progressSavedElapsedRow?.classList.add('hidden');
}

function showSavedInfo({ name = '', path: filePath = '', size = 0, elapsed = '' } = {}) {
  if (!els.progressSaved) return;
  const baseName = name || (filePath ? filePath.split(/[/\\]/).pop() : '') || '—';
  if (els.progressSavedName) els.progressSavedName.textContent = baseName;
  if (els.progressSavedPath) els.progressSavedPath.textContent = filePath || '—';
  if (size > 0) {
    els.progressSavedSizeRow?.classList.remove('hidden');
    if (els.progressSavedSize) els.progressSavedSize.textContent = formatBytes(size);
  } else {
    els.progressSavedSizeRow?.classList.add('hidden');
  }
  if (elapsed) {
    els.progressSavedElapsedRow?.classList.remove('hidden');
    if (els.progressSavedElapsed) els.progressSavedElapsed.textContent = elapsed;
  } else {
    els.progressSavedElapsedRow?.classList.add('hidden');
  }
  els.progressSaved.classList.remove('hidden');
}

function isOpenProgressMode(mode = saveProgressMode) {
  return mode === 'open-youtube' || mode === 'open-rtsp';
}

function showSaveProgress({ mode, title, name }) {
  if (!els.progressModal) return;
  clearSaveProgressCloseTimer();
  saveProgressMode = mode;
  hideSavedInfo();
  if (els.progressTitle) els.progressTitle.textContent = title || t('progressSaving');
  if (els.progressName) {
    els.progressName.textContent = name || '';
    els.progressName.classList.remove('hidden');
  }
  els.progressTrack?.classList.remove('hidden');
  els.progressMeta?.classList.remove('hidden');
  if (els.progressFill) els.progressFill.style.width = '0%';
  // Open (YouTube/RTSP) uses staged %; save/record may be indeterminate.
  const indeterminate = mode === 'rtsp' || mode === 'youtube';
  els.progressTrack?.classList.toggle('is-indeterminate', indeterminate);
  if (els.progressValue) {
    els.progressValue.textContent = mode === 'rtsp' ? '00:00' : isOpenProgressMode(mode) ? '8%' : '0%';
  }
  if (els.progressDetail) els.progressDetail.textContent = '';
  // Save: Stop keeps content. Open: Cancel aborts connect/load.
  if (els.btnProgressCancel) {
    els.btnProgressCancel.hidden = false;
    els.btnProgressCancel.classList.remove('hidden');
    els.btnProgressCancel.disabled = false;
    els.btnProgressCancel.textContent = isOpenProgressMode(mode)
      ? t('progressCancelOpen')
      : t('progressStopSave');
  }
  els.btnProgressClose?.classList.add('hidden');
  if (els.btnProgressClose) els.btnProgressClose.hidden = true;
  syncThemeToOverlays();
  els.progressModal.hidden = false;
}

function setUrlDialogBusy(busy) {
  const play = $('btnYtPlay');
  const save = $('btnYtSaveFromDialog');
  if (play) {
    play.disabled = busy;
    play.textContent = busy ? t('progressConnecting') : t('playAction');
  }
  if (save) save.disabled = busy;
  if (els.youtubeUrlInput) els.youtubeUrlInput.readOnly = busy;
}

/**
 * Close the URL modal so the floating progress popup is visible, then show stages.
 * (showModal() dialogs sit above the stage and previously hid open progress.)
 */
function beginOpenStreamProgress({ kind, name = '', detail = '' } = {}) {
  openStreamCancelled = false;
  setUrlDialogBusy(true);
  try {
    if (els.youtubeModal?.open) els.youtubeModal.close();
  } catch {
    /* ignore */
  }
  const mode = kind === 'rtsp' ? 'open-rtsp' : 'open-youtube';
  showSaveProgress({
    mode,
    title: kind === 'rtsp' ? t('progressOpeningRtsp') : t('progressOpeningYoutube'),
    name
  });
  // Determinate steps so the bar moves even when the backend has no byte %.
  updateSaveProgress({
    percent: 8,
    detail: detail || t('progressOpening'),
    indeterminate: false
  });
}

function updateOpenProgressStage(step, total, detail) {
  const safeTotal = Math.max(1, Number(total) || 1);
  const pct = Math.max(8, Math.min(96, Math.round((step / safeTotal) * 100)));
  updateSaveProgress({
    percent: pct,
    detail: detail || '',
    indeterminate: false
  });
}

function endOpenStreamInFlight() {
  openStreamInFlight = false;
  setUrlDialogBusy(false);
}

function reopenUrlDialogAfterOpenFailure(url, message) {
  endOpenStreamInFlight();
  closeSaveProgress();
  openYouTubeDialog(url || '');
  if (message) showYoutubeError(message);
}

function finishOpenProgress({ ok = true, message = '', autoCloseMs = 900 } = {}) {
  if (!isSaveProgressVisible() || !isOpenProgressMode()) {
    if (!ok && message) {
      /* open UI already gone */
    }
    return;
  }
  clearSaveProgressCloseTimer();
  els.progressTrack?.classList.remove('is-indeterminate');
  els.btnProgressCancel?.classList.add('hidden');
  if (els.btnProgressCancel) els.btnProgressCancel.hidden = true;

  if (!ok) {
    if (els.progressTitle) els.progressTitle.textContent = t('progressOpenFailed');
    hideSavedInfo();
    if (els.progressValue) els.progressValue.textContent = '—';
    if (message && els.progressDetail) els.progressDetail.textContent = message;
    els.btnProgressClose?.classList.remove('hidden');
    if (els.btnProgressClose) {
      els.btnProgressClose.hidden = false;
      els.btnProgressClose.textContent = t('ok');
    }
    saveProgressMode = null;
    return;
  }

  if (els.progressFill) els.progressFill.style.width = '100%';
  if (els.progressValue) els.progressValue.textContent = '100%';
  if (els.progressTitle) els.progressTitle.textContent = t('progressOpenReady');
  if (els.progressDetail) els.progressDetail.textContent = message || '';
  hideSavedInfo();
  els.btnProgressClose?.classList.add('hidden');
  if (els.btnProgressClose) els.btnProgressClose.hidden = true;
  saveProgressMode = null;
  if (autoCloseMs > 0) {
    saveProgressCloseTimer = setTimeout(() => closeSaveProgress(), autoCloseMs);
  } else {
    closeSaveProgress();
  }
}

function updateSaveProgress({ percent = null, elapsed = null, detail = '', indeterminate = null } = {}) {
  if (!isSaveProgressVisible()) return;

  const useIndeterminate =
    indeterminate != null
      ? indeterminate
      : saveProgressMode === 'rtsp' ||
        isOpenProgressMode() ||
        (saveProgressMode === 'youtube' && percent == null);
  els.progressTrack?.classList.toggle('is-indeterminate', useIndeterminate);

  if (percent != null && Number.isFinite(percent)) {
    const pct = Math.max(0, Math.min(100, percent));
    if (els.progressFill) els.progressFill.style.width = `${pct}%`;
    if (els.progressValue) els.progressValue.textContent = `${Math.round(pct)}%`;
  } else if (elapsed) {
    if (els.progressValue) els.progressValue.textContent = elapsed;
  }

  if (detail != null && els.progressDetail) {
    els.progressDetail.textContent = detail;
  }
}

function finishSaveProgress({
  ok = true,
  message = '',
  value = null,
  cancelled = false,
  saved = null
} = {}) {
  if (!els.progressModal) return;
  clearSaveProgressCloseTimer();
  els.progressModal.hidden = false;
  els.progressTrack?.classList.remove('is-indeterminate');
  if (cancelled) {
    closeSaveProgress();
    setStatus({ state: statusKey('progressCancelled') });
    return;
  }
  if (ok) {
    if (els.progressFill) els.progressFill.style.width = '100%';
    if (els.progressValue) els.progressValue.textContent = '100%';
    if (els.progressTitle) els.progressTitle.textContent = t('progressDone');
    const info = saved || {};
    const filePath = info.path || message || '';
    const fileName = info.name || (filePath ? filePath.split(/[/\\]/).pop() : '') || '';
    if (els.progressName) {
      els.progressName.textContent = fileName;
      els.progressName.classList.add('hidden');
    }
    if (els.progressDetail) {
      els.progressDetail.textContent = info.size ? formatBytes(info.size) : '';
    }
    showSavedInfo({
      name: fileName,
      path: filePath,
      size: Number(info.size) || 0,
      elapsed: info.elapsed || (value && value !== '100%' ? value : '') || ''
    });
  } else {
    if (els.progressTitle) els.progressTitle.textContent = t('progressFailed');
    hideSavedInfo();
    if (message && els.progressDetail) els.progressDetail.textContent = message;
  }
  els.btnProgressCancel?.classList.add('hidden');
  if (els.btnProgressCancel) els.btnProgressCancel.hidden = true;
  els.btnProgressClose?.classList.remove('hidden');
  if (els.btnProgressClose) {
    els.btnProgressClose.hidden = false;
    els.btnProgressClose.textContent = t('ok');
  }
  saveProgressMode = null;
}

function closeSaveProgress() {
  clearSaveProgressCloseTimer();
  saveProgressMode = null;
  if (els.progressModal) els.progressModal.hidden = true;
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
  updateFitToolbarButton();
  updateFitMenuSelection();
  updateCompactButton();
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
  renderPlayHistory();
  syncWindowMinWidth();
  if (spectrumWindowOpen) {
    postSpectrumMessage({
      type: 'locale',
      locale: next
    });
  }
  if (historyWindowOpen) {
    postHistoryMessage({
      type: 'locale',
      locale: next
    });
  }
  return next;
}

function applySettingsToPlayer({ applyVolume = false } = {}) {
  els.media.loop = Boolean(settings.loop);
  if (applyVolume) {
    const pct = Math.min(100, Math.max(0, Math.round(Number(settings.startVolume) || 80)));
    if (youtubeMode) {
      ytPlayer.setVolume(pct);
      els.volumeBar.value = String(pct);
    } else {
      setLocalVolumePercent(pct);
    }
  }
  setPlaybackRate(settings.rate, { persist: false, announce: true });
  subtitles.setEnabled(Boolean(settings.showSubtitles));
  subtitles.setFontSize(Number(settings.subSize) || 28);
  applySpectrumStyle(settings.spectrumStyle, { persist: false });
  applyVideoFit(settings.videoFit, { persist: false });
  updateMuteIcons();
  updateSpectrumVisibility();
  void applyWindowOpacity(settings.windowOpacity, { persist: false });
  applyChromeAutoHideSetting();
}

function stepPlaybackRate(delta) {
  const current = nearestPlaybackRate(settings.rate);
  const idx = PLAYBACK_RATES.indexOf(current);
  const nextIdx = Math.max(0, Math.min(PLAYBACK_RATES.length - 1, idx + delta));
  setPlaybackRate(PLAYBACK_RATES[nextIdx]);
}

async function updateSpectrumVisibility() {
  // Do not gate on spectrum.hasAudio: Chromium reports webkitAudioDecodedByteCount=0
  // until decode starts, which previously kept the window closed forever.
  const want = !youtubeMode && Boolean(settings.showSpectrum) && Boolean(currentMediaName);
  const pressed = Boolean(settings.showSpectrum);
  $('btnSpectrum')?.setAttribute('aria-pressed', String(pressed));

  if (want) {
    await openSpectrumPopup();
    await spectrum.start();
    syncSpectrumOutputFromUi();
    if (spectrum.isHoldingFrame()) spectrum.repaintLast();
  } else {
    await closeSpectrumPopup({ updateSetting: false });
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
  if ($('settingAutoHideChrome')) {
    $('settingAutoHideChrome').checked = settings.autoHideChrome !== false;
  }
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
  const tip = t('opacityTipPct', { n: value });
  if (toolbar) {
    toolbar.value = String(value);
    syncRangeFill(toolbar);
    toolbar.setAttribute('aria-valuenow', String(value));
    toolbar.setAttribute('aria-valuetext', `${value}%`);
    toolbar.setAttribute('data-tooltip', tip);
    toolbar.setAttribute('aria-label', tip);
    const tipEl = document.getElementById('tooltip');
    if (tipEl && !tipEl.hidden && (document.activeElement === toolbar || toolbar.matches?.(':hover'))) {
      tipEl.textContent = tip;
    }
  }
  if (toolbarOut) toolbarOut.textContent = `${value}%`;
}

async function applyWindowOpacity(opacityPercent, { persist = true } = {}) {
  const value = clampWindowOpacity(opacityPercent);
  settings.windowOpacity = value;
  updateOpacityUi(value);
  if (persist) saveSettings(settings);
  // Main player window only — never touches the spectrum window.
  if (isElectron && window.desktopAPI?.setWindowOpacity) {
    await window.desktopAPI.setWindowOpacity(value / 100);
  }
}

async function applySpectrumOpacity(opacityPercent, { persist = true } = {}) {
  const value = clampWindowOpacity(opacityPercent);
  settings.spectrumOpacity = value;
  if (persist) saveSettings(settings);
  // Spectrum window applies its own opacity; host only stores the preference.
}

async function applyHistoryOpacity(opacityPercent, { persist = true } = {}) {
  const value = clampWindowOpacity(opacityPercent);
  settings.historyOpacity = value;
  if (persist) saveSettings(settings);
  // History window applies its own opacity; host only stores the preference.
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
    autoHideChrome: $('settingAutoHideChrome') ? $('settingAutoHideChrome').checked : settings.autoHideChrome !== false,
    spectrumStyle: normalizeSpectrumStyle($('settingSpectrumStyle')?.value || settings.spectrumStyle),
    showSubtitles: $('settingShowSubtitles').checked,
    subSize: Number($('settingSubSize').value) || 28,
    startVolume: clampStartVolume($('settingStartVolume').value),
    windowOpacity: clampWindowOpacity(settings.windowOpacity),
    spectrumOpacity: clampWindowOpacity(settings.spectrumOpacity),
    historyOpacity: clampWindowOpacity(settings.historyOpacity)
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
  skipRecent = false,
  isRtsp = false,
  rtspUrl = null
} = {}) {
  exitYouTubeMode();
  if (!isRtsp) {
    await stopRtspBridge({ finalizeRecord: true });
  }
  revokeObjectUrl();
  stopRequested = false;
  hidePlaybackOverlay(true);
  currentMediaPath = path;
  currentMediaName = name;
  currentRtspUrl = isRtsp ? (rtspUrl || name || null) : null;
  els.dropHint.classList.add('hidden');
  els.media.src = url;
  els.media.load();

  const extLabel = isRtsp
    ? 'RTSP'
    : (ext || (name.includes('.') ? name.slice(name.lastIndexOf('.')) : '')).toUpperCase().replace('.', '') || 'MEDIA';
  setStatus({
    file: size ? `${name} (${formatBytes(size)})` : name,
    format: extLabel,
    state: statusKey(isRtsp ? 'statusRtspConnecting' : 'statusLoading'),
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
    rememberRecentFile({ path, name, title: name, ext, size });
  }

  updateSpectrumVisibility();

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

  if (currentRtspUrl) {
    setStatus({ state: statusKey('statusRtspFailed'), format: 'RTSP' });
    showAppError({
      title: t('errorRtspTitle'),
      message: msg,
      detail,
      context: { url: currentRtspUrl }
    });
    await stopRtspBridge();
    return;
  }

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
  // During RTSP recording, Stop finalizes the file and plays it.
  if (rtspRecording) {
    void stopCurrentRtspRecord({ playAfter: true });
    return;
  }
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
  if (currentRtspUrl) {
    void stopRtspBridge();
    els.media.removeAttribute('src');
    els.media.load();
  } else {
    els.media.currentTime = 0;
  }
  updatePlayIcons(false);
  setStatus({ state: statusKey('statusStopped') });
  subtitles.clear();
  notifyStopped();
}

async function playSavedLocalFile(filePath) {
  if (!isElectron || !filePath || !window.desktopAPI?.openMediaPath) return false;
  const result = await window.desktopAPI.openMediaPath(filePath);
  if (!result?.ok) {
    showAppError({
      title: t('errorFileTitle'),
      message: result?.error || t('statusFileOpenFail'),
      detail: result?.error || '',
      context: { path: filePath }
    });
    return false;
  }
  await loadMedia({
    url: result.url,
    name: result.name,
    path: result.path,
    size: result.size,
    ext: result.ext,
    subtitle: result.subtitle
  });
  // Always play after RTSP stop-save, even if autoplay setting is off.
  try {
    await els.media.play();
    updatePlayIcons(true);
    setStatus({ state: statusKey('statusPlaying') });
    notifyPlaying();
  } catch {
    setStatus({ state: statusKey('statusReadyPlay') });
  }
  return true;
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
    const v = Math.min(100, Math.max(0, Number(els.volumeBar.value) + delta));
    setLocalVolumePercent(v);
  }
  updateMuteIcons();
}

function toggleMute() {
  if (youtubeMode) {
    if (ytPlayer.isMuted()) ytPlayer.unmute();
    else ytPlayer.mute();
  } else if (spectrum.hasWebAudioOutput()) {
    const cur = Number(els.volumeBar.value) || 0;
    if (cur > 0) {
      lastAudibleVolumePct = cur;
      setLocalVolumePercent(0);
    } else {
      setLocalVolumePercent(lastAudibleVolumePct || Number(settings.startVolume) || 80);
    }
  } else {
    els.media.muted = !els.media.muted;
  }
  updateMuteIcons();
}

function toggleSpectrumPanel() {
  settings.showSpectrum = !settings.showSpectrum;
  saveSettings(settings);
  if ($('settingShowSpectrum')) {
    $('settingShowSpectrum').checked = settings.showSpectrum;
  }
  void updateSpectrumVisibility();
  if (settings.showSpectrum && currentMediaName && !youtubeMode) {
    void openSpectrumPopup().then(() => {
      if (spectrumWindowOpen) focusSpectrumWindow();
    });
  }
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

function applySpectrumStyle(styleId, { persist = true, fromWindow = false } = {}) {
  const next = normalizeSpectrumStyle(styleId);
  settings.spectrumStyle = next;
  if (persist) saveSettings(settings);
  if ($('settingSpectrumStyle')) $('settingSpectrumStyle').value = next;
  if (!fromWindow && spectrumWindowOpen) {
    postSpectrumMessage({ type: 'style', style: next });
  }
  // While paused, re-send last bins so the style change is visible in the window.
  if (spectrum.isHoldingFrame()) spectrum.repaintLast();
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
  openThemedDialog(els.youtubeModal, { modal: true });
  queueMicrotask(() => {
    els.youtubeUrlInput.focus();
    els.youtubeUrlInput.select();
  });
}

async function playRtspFromInput(rawInput) {
  const url = String(rawInput || '').trim();
  if (!isRtspUrl(url)) {
    showYoutubeError(t('rtspInvalid'));
    return false;
  }
  if (!isElectron || !window.desktopAPI?.openRtsp) {
    showYoutubeError(t('rtspDesktopOnly'));
    return false;
  }
  if (openStreamInFlight) {
    setStatus({ state: statusKey('statusOpenInProgress') });
    return false;
  }

  openStreamInFlight = true;
  showYoutubeError('');
  exitYouTubeMode();
  if (rtspRecording && currentRtspUrl && currentRtspUrl !== url) {
    await finalizeRtspRecordIfAny();
  }
  els.media.pause();
  els.media.removeAttribute('src');
  els.media.load();
  revokeObjectUrl();
  currentMediaPath = null;
  currentMediaName = null;
  subtitles.setCues([]);
  stopRequested = false;
  hidePlaybackOverlay(true);
  els.dropHint.classList.add('hidden');

  const label = rtspDisplayName(url);
  beginOpenStreamProgress({
    kind: 'rtsp',
    name: url,
    detail: t('statusRtspConnecting')
  });
  setStatus({
    file: url,
    format: 'RTSP',
    state: statusKey('statusRtspConnecting'),
    subtitle: statusKey('statusNoSubtitle')
  });

  try {
    updateOpenProgressStage(1, 3, t('statusRtspConnecting'));
    const result = await window.desktopAPI.openRtsp(url);
    if (openStreamCancelled) {
      closeSaveProgress();
      return false;
    }
    if (!result?.ok) {
      const errMsg = result?.error || t('statusRtspFailed');
      reopenUrlDialogAfterOpenFailure(url, errMsg);
      showAppError({
        title: t('errorRtspTitle'),
        message: errMsg,
        detail: result?.error || '',
        context: { url }
      });
      return false;
    }

    updateOpenProgressStage(2, 3, t('progressStartingStream'));
    currentRtspUrl = url;
    await loadMedia({
      url: result.playUrl,
      name: url,
      path: null,
      ext: 'rtsp',
      skipRecent: true,
      isRtsp: true,
      rtspUrl: url
    });
    if (openStreamCancelled) {
      await stopRtspBridge();
      closeSaveProgress();
      return false;
    }
    rememberRecentRtsp({ url, title: label });
    updateSaveButton();
    setStatus({
      file: url,
      format: 'RTSP',
      state: statusKey('statusRtspLive')
    });
    updateOpenProgressStage(3, 3, t('statusRtspLive'));
    finishOpenProgress({ ok: true, message: t('statusRtspLive') });
    return true;
  } finally {
    endOpenStreamInFlight();
  }
}

async function playNetworkFromInput(rawInput) {
  const input = String(rawInput || '').trim();
  if (isRtspUrl(input)) {
    return playRtspFromInput(input);
  }
  return playYouTubeFromInput(input);
}

async function playYouTubeFromInput(rawInput) {
  const id = extractYouTubeId(rawInput);
  if (!id) {
    showYoutubeError(t('youtubeInvalid'));
    return false;
  }
  if (openStreamInFlight) {
    setStatus({ state: statusKey('statusOpenInProgress') });
    return false;
  }

  const url = `https://www.youtube.com/watch?v=${id}`;
  openStreamInFlight = true;
  showYoutubeError('');

  // Stop local / RTSP media
  await stopRtspBridge({ finalizeRecord: true });
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
  beginOpenStreamProgress({
    kind: 'youtube',
    name: url,
    detail: t('progressFetchingInfo')
  });
  setStatus({
    file: `YouTube: ${id}`,
    format: 'YouTube',
    state: statusKey('statusLoading'),
    subtitle: statusKey('statusYtCaptions')
  });

  try {
    updateOpenProgressStage(1, 3, t('progressFetchingInfo'));
    try {
      if (isElectron) {
        const res = await window.desktopAPI.getYouTubeInfo(url);
        if (openStreamCancelled) {
          closeSaveProgress();
          return false;
        }
        if (res?.ok && res.info?.title) {
          currentYouTube.title = res.info.title;
          setStatus({ file: res.info.title });
          if (els.progressName) els.progressName.textContent = res.info.title;
        }
      }
    } catch {
      /* optional metadata */
    }

    if (openStreamCancelled) {
      closeSaveProgress();
      return false;
    }

    updateOpenProgressStage(2, 3, t('progressLoadingPlayer'));
    ytErrorDialogShown = false;
    try {
      await ytPlayer.load(id, {
        autoplay: Boolean(settings.autoplay),
        startVolume: Number(settings.startVolume) || 80
      });
    } catch (err) {
      if (openStreamCancelled) {
        closeSaveProgress();
        return false;
      }
      const errMsg = err?.message || t('statusPlaybackError');
      reopenUrlDialogAfterOpenFailure(url, errMsg);
      if (!ytErrorDialogShown) {
        showAppError({
          title: t('errorYoutubeTitle'),
          message: errMsg,
          error: err,
          context: { videoId: id, url }
        });
      }
      return false;
    }
    if (openStreamCancelled) {
      try {
        ytPlayer?.stop?.();
      } catch {
        /* ignore */
      }
      exitYouTubeMode();
      closeSaveProgress();
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
    updateOpenProgressStage(3, 3, currentYouTube.title || id);
    finishOpenProgress({
      ok: true,
      message: currentYouTube.title || id
    });
    return true;
  } finally {
    endOpenStreamInFlight();
  }
}

async function stopCurrentRtspRecord({ playAfter = false } = {}) {
  if (!isElectron || !window.desktopAPI?.stopRtspRecord) return null;
  setStatus({ state: statusKey('statusRtspRecordStopping') });
  updateSaveProgress({ detail: t('statusRtspRecordStopping'), indeterminate: true });
  els.btnSaveYt.disabled = true;
  if (els.btnProgressCancel) els.btnProgressCancel.disabled = true;
  try {
    // Finalize (keep file). Never discard here — "멈춤" must save up to now.
    const result = await window.desktopAPI.stopRtspRecord({ discard: false });
    rtspRecording = false;
    if (result?.cancelled) {
      finishSaveProgress({ cancelled: true });
      return result;
    }
    if (!result?.ok) {
      finishSaveProgress({
        ok: false,
        message: result?.error || t('statusRtspRecordFailed'),
        value: result?.elapsed || null
      });
      showAppError({
        title: t('errorRtspTitle'),
        message: result?.error || t('statusRtspRecordFailed'),
        detail: result?.error || '',
        context: { url: currentRtspUrl || '', path: result?.path || '' }
      });
      return result;
    }
    setStatus({
      state: statusKey('statusRtspRecordSaved'),
      file: result.path,
      format: 'RTSP'
    });
    finishSaveProgress({
      ok: true,
      value: '100%',
      saved: {
        path: result.path || '',
        name: result.name || '',
        size: result.size || 0,
        elapsed: result.elapsed || ''
      }
    });
    if (playAfter && result.path) {
      await playSavedLocalFile(result.path);
    }
    return result;
  } catch (err) {
    rtspRecording = false;
    finishSaveProgress({ ok: false, message: err?.message || t('statusRtspRecordFailed') });
    showAppError({
      title: t('errorRtspTitle'),
      message: err?.message || t('statusRtspRecordFailed'),
      error: err,
      context: { url: currentRtspUrl || '' }
    });
    return null;
  } finally {
    if (els.btnProgressCancel) els.btnProgressCancel.disabled = false;
    updateSaveButton();
  }
}

async function cancelSaveProgress() {
  if (!isSaveProgressVisible()) return;
  if (els.btnProgressCancel) els.btnProgressCancel.disabled = true;

  // Opening YouTube / RTSP for playback — cancel connect/load.
  if (isOpenProgressMode()) {
    openStreamCancelled = true;
    if (saveProgressMode === 'open-rtsp') {
      try {
        await stopRtspBridge();
      } catch {
        /* ignore */
      }
      els.media.removeAttribute('src');
      els.media.load();
    }
    if (saveProgressMode === 'open-youtube') {
      try {
        ytPlayer?.stop?.();
      } catch {
        /* ignore */
      }
      exitYouTubeMode();
    }
    closeSaveProgress();
    endOpenStreamInFlight();
    setStatus({ state: statusKey('progressCancelled') });
    return;
  }

  // RTSP "멈춤" → save what was recorded and play it.
  if (saveProgressMode === 'rtsp' || rtspRecording) {
    await stopCurrentRtspRecord({ playAfter: true });
    return;
  }

  // YouTube "멈춤" → keep downloaded portion, finalize, then play (handled by saveCurrentYouTube).
  if (saveProgressMode === 'youtube') {
    updateSaveProgress({ detail: t('statusDownloadStopping'), indeterminate: true });
    setStatus({ state: statusKey('statusDownloadStopping') });
    try {
      await window.desktopAPI.stopYouTubeDownload?.({ discard: false });
    } catch {
      try {
        await window.desktopAPI.cancelYouTubeDownload?.({ discard: false });
      } catch {
        /* download promise will settle */
      }
    }
  }
}

async function startCurrentRtspRecord(url = currentRtspUrl) {
  if (!url || !isRtspUrl(url)) {
    openYouTubeDialog(url || '');
    return;
  }
  if (!isElectron || !window.desktopAPI?.startRtspRecord) {
    setStatus({ state: statusKey('rtspDesktopOnly') });
    return;
  }
  if (rtspRecording) {
    await stopCurrentRtspRecord();
    return;
  }

  setStatus({ state: statusKey('statusRtspRecordStarting') });
  els.btnSaveYt.disabled = true;
  try {
    const result = await window.desktopAPI.startRtspRecord({ url });
    if (result?.cancelled) {
      setStatus({ state: statusKey('statusDownloadCancelled') });
      return;
    }
    if (!result?.ok) {
      showAppError({
        title: t('errorRtspTitle'),
        message: result?.error || t('statusRtspRecordFailed'),
        detail: result?.error || '',
        context: { url }
      });
      return;
    }
    rtspRecording = true;
    showSaveProgress({
      mode: 'rtsp',
      title: t('progressRecording'),
      name: result.path || url
    });
    updateSaveProgress({
      elapsed: '00:00',
      detail: t('progressElapsed', { time: '00:00' }),
      indeterminate: true
    });
    setStatus({
      state: statusKey('statusRtspRecording', { time: '00:00' }),
      file: result.path || url,
      format: 'RTSP'
    });
  } catch (err) {
    rtspRecording = false;
    showAppError({
      title: t('errorRtspTitle'),
      message: err?.message || t('statusRtspRecordFailed'),
      error: err,
      context: { url }
    });
  } finally {
    updateSaveButton();
  }
}

async function saveCurrentMedia() {
  if (rtspRecording) {
    // Toolbar Save / Ctrl+S while recording → 멈춤: keep file and play it.
    await stopCurrentRtspRecord({ playAfter: true });
    return;
  }
  if (currentRtspUrl) {
    await startCurrentRtspRecord(currentRtspUrl);
    return;
  }
  await saveCurrentYouTube();
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
  const displayName = currentYouTube.title || currentYouTube.id || currentYouTube.url;
  try {
    // Progress popup opens from downloadProgress after the native Save dialog.
    const result = await window.desktopAPI.downloadYouTube({
      url: currentYouTube.url,
      title: currentYouTube.title
    });
    if (result?.cancelled) {
      finishSaveProgress({ cancelled: true });
      setStatus({ state: statusKey('statusDownloadCancelled') });
      return;
    }
    if (!result?.ok) {
      if (!isSaveProgressVisible()) {
        showSaveProgress({
          mode: 'youtube',
          title: t('progressDownloading'),
          name: displayName
        });
      }
      finishSaveProgress({
        ok: false,
        message: result?.error || t('statusDownloadFailed')
      });
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
    if (!isSaveProgressVisible()) {
      showSaveProgress({
        mode: 'youtube',
        title: t('progressDownloading'),
        name: displayName
      });
    }
    setStatus({
      state: statusKey(result.stopped ? 'statusDownloadStoppedSaved' : 'statusSaved'),
      file: `${displayName} → ${result.path}`
    });
    finishSaveProgress({
      ok: true,
      value: '100%',
      saved: {
        path: result.path || '',
        name: result.name || displayName,
        size: result.size || 0
      }
    });
    if (result.stopped && result.path) {
      await playSavedLocalFile(result.path);
    }
  } catch (err) {
    if (!isSaveProgressVisible()) {
      showSaveProgress({
        mode: 'youtube',
        title: t('progressDownloading'),
        name: displayName
      });
    }
    finishSaveProgress({ ok: false, message: err?.message || t('statusDownloadFailed') });
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
    if (isMediaPlayingNow()) scheduleHideChromeOverlay();
  };

  const beginDragFromEvent = (e, handle) => {
    if (e.button !== 0) return false;
    // Buttons / inputs never start a window drag.
    if (e.target.closest?.('button, input, select, a, label, .win-btn, .window-controls')) {
      return false;
    }
    // Require visible overlay toolbar first (always true when auto-hide is off / chrome-pinned).
    const chromeReady =
      els.appRoot?.classList.contains('chrome-visible') ||
      els.appRoot?.classList.contains('chrome-pinned');
    if (!chromeReady) {
      showChromeOverlay({ sticky: true });
      return false;
    }
    dragging = true;
    toolbar.classList.add('is-dragging');
    showChromeOverlay({ sticky: true });
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
    return true;
  };

  // Empty toolbar chrome (not buttons) moves the window — including brand/spacer.
  toolbar.addEventListener('pointerdown', (e) => {
    beginDragFromEvent(e, toolbar);
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

  if (!isElectron) {
    if (opacity) opacity.hidden = true;
    return;
  }

  document.documentElement.classList.add('is-electron');
  document.body.classList.add('is-electron');
  if (opacity) opacity.hidden = false;
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

  $('toolbarOpacityBar')?.addEventListener('input', (e) => {
    void applyWindowOpacity(e.target.value, { persist: true });
  });

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
    if (text && (isYouTubeUrl(text) || isRtspUrl(text))) {
      await playNetworkFromInput(text.trim());
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
    updateActualMediaSize();
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
    if (seeking) return;
    // When Web Audio owns output, UI volume is driven by the gain node / slider.
    if (spectrum.hasWebAudioOutput()) {
      updateMuteIcons();
      return;
    }
    els.volumeBar.value = String(Math.round((els.media.muted ? 0 : els.media.volume) * 100));
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
    renderPlayHistory();
    setStatus({ state: statusKey('statusRecentCleared') });
  });
  els.btnHistory?.addEventListener('click', (e) => {
    e.stopPropagation();
    closeToolbarMenus();
    toggleHistoryWindow();
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
  els.btnFit?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleFitMenu();
  });
  els.fitList?.addEventListener('click', (e) => {
    const btn = e.target.closest?.('[data-fit]');
    if (!btn) return;
    e.stopPropagation();
    closeFitMenu();
    applyVideoFit(btn.dataset.fit, { announce: true });
  });
  document.addEventListener('click', (e) => {
    if (e.target.closest?.('.recent-wrap, .theme-wrap, .fit-wrap')) return;
    closeToolbarMenus();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeToolbarMenus();
  });
  $('btnOpenSub').addEventListener('click', openSubtitle);
  $('btnYouTube').addEventListener('click', () => openYouTubeDialog());
  $('btnSaveYt').addEventListener('click', () => saveCurrentMedia());
  els.btnProgressCancel?.addEventListener('click', () => {
    void cancelSaveProgress();
  });
  els.btnProgressClose?.addEventListener('click', () => closeSaveProgress());
  $('btnPlay').addEventListener('click', togglePlay);
  $('btnStop').addEventListener('click', stopPlayback);
  $('btnPrev').addEventListener('click', () => seekBy(-(Number(settings.seekStep) || 10)));
  $('btnNext').addEventListener('click', () => seekBy(Number(settings.seekStep) || 10));
  $('btnMute').addEventListener('click', () => {
    toggleMute();
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
  bindSpectrumWindowBridge();
  bindHistoryWindowBridge();
  $('btnFullscreen').addEventListener('click', toggleFullscreen);
  els.btnCompact?.addEventListener('click', (e) => {
    e.stopPropagation();
    closeToolbarMenus();
    toggleCompactMode();
  });
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
    if (youtubeMode) {
      ytPlayer.setVolume(percent);
      syncVolumeBarFill();
    } else {
      setLocalVolumePercent(percent);
    }
    updateMuteIcons();
  });

  els.webMediaInput.addEventListener('change', onWebMediaChosen);
  els.webSubInput.addEventListener('change', onWebSubChosen);

  $('btnYtPlay').addEventListener('click', async () => {
    if (openStreamInFlight) {
      setStatus({ state: statusKey('statusOpenInProgress') });
      return;
    }
    setUrlDialogBusy(true);
    try {
      await playNetworkFromInput(els.youtubeUrlInput.value);
    } finally {
      if (!openStreamInFlight) setUrlDialogBusy(false);
    }
  });
  $('btnYtSaveFromDialog').addEventListener('click', async () => {
    const input = els.youtubeUrlInput.value.trim();
    if (isRtspUrl(input)) {
      showYoutubeError('');
      if (rtspRecording && currentRtspUrl === input) {
        els.youtubeModal.close();
        await stopCurrentRtspRecord({ playAfter: true });
        return;
      }
      if (currentRtspUrl !== input) {
        const ok = await playRtspFromInput(input);
        if (!ok) return;
      } else {
        els.youtubeModal.close();
      }
      await startCurrentRtspRecord(input);
      return;
    }
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
      if (openStreamInFlight) {
        setStatus({ state: statusKey('statusOpenInProgress') });
        return;
      }
      await playNetworkFromInput(els.youtubeUrlInput.value);
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
    settings = {
      ...settings,
      ...readSettingsForm(),
      // Preserve fields not present on the settings form.
      videoFit: normalizeVideoFit(settings.videoFit),
      showHistoryPanel: Boolean(settings.showHistoryPanel),
      compactMode: Boolean(settings.compactMode)
    };
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
      // If nothing is open, minimize the desktop window.
      if (e.key === 'Escape') {
        if (document.fullscreenElement) {
          e.preventDefault();
          document.exitFullscreen?.();
          return;
        }
        if (!els.recentMenu?.hidden || !els.themeMenu?.hidden || !els.fitMenu?.hidden) {
          e.preventDefault();
          closeToolbarMenus();
          return;
        }
        if (closeTopNonblockingDialog()) {
          e.preventDefault();
          return;
        }
        // Native <dialog showModal()> handles its own Escape — do not minimize over it.
        if (isModalOpen()) return;
        if (isElectron && window.desktopAPI?.minimize) {
          e.preventDefault();
          void window.desktopAPI.minimize();
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
        if (k === 'l') {
          e.preventDefault();
          toggleHistoryWindow();
          return;
        }
        if (k === 'y') {
          e.preventDefault();
          openYouTubeDialog();
          return;
        }
        if (k === 's' && (youtubeMode || currentRtspUrl || rtspRecording)) {
          e.preventDefault();
          saveCurrentMedia();
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
  bindStageContextMenu();
  bindChromeOverlay();
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
      if (!progress) return;
      const name = currentYouTube?.title || currentYouTube?.id || currentYouTube?.url || '';
      if (!isSaveProgressVisible() || saveProgressMode !== 'youtube') {
        showSaveProgress({
          mode: 'youtube',
          title: t('progressDownloading'),
          name
        });
      }

      if (progress.percent != null && Number.isFinite(progress.percent)) {
        const pct = Math.round(progress.percent);
        setStatus({ state: statusKey('statusDownloadingPct', { n: pct }) });
        updateSaveProgress({
          percent: pct,
          detail: progress.message || t('statusDownloadingPct', { n: pct }),
          indeterminate: false
        });
        return;
      }

      let detail = progress.message || t('statusDownloading');
      if (progress.bytes != null && Number.isFinite(progress.bytes)) {
        const mb = Math.round((progress.bytes / 1024 / 1024) * 10) / 10;
        detail = t('progressBytes', { n: mb });
        setStatus({ state: detail });
      } else if (progress.message) {
        setStatus({ state: progress.message });
      }
      updateSaveProgress({ detail, indeterminate: true });
    });
    window.desktopAPI.onRtspRecordProgress?.((progress) => {
      if (!progress) return;
      if (progress.phase === 'recording' || progress.phase === 'started') {
        rtspRecording = true;
        updateSaveButton();
        if (!isSaveProgressVisible() || saveProgressMode !== 'rtsp') {
          showSaveProgress({
            mode: 'rtsp',
            title: t('progressRecording'),
            name: progress.path || currentRtspUrl || ''
          });
        }
        updateSaveProgress({
          elapsed: progress.elapsed || '00:00',
          detail: t('progressElapsed', { time: progress.elapsed || '00:00' }),
          indeterminate: true
        });
        setStatus({
          state: statusKey('statusRtspRecording', { time: progress.elapsed || '00:00' }),
          file: progress.path || currentRtspUrl || undefined,
          format: 'RTSP'
        });
        return;
      }
      if (progress.phase === 'stopping') {
        setStatus({ state: statusKey('statusRtspRecordStopping') });
        updateSaveProgress({ detail: t('statusRtspRecordStopping'), indeterminate: true });
        return;
      }
      if (progress.phase === 'cancelled') {
        rtspRecording = false;
        updateSaveButton();
        finishSaveProgress({ cancelled: true });
        return;
      }
      if (progress.phase === 'done') {
        rtspRecording = false;
        updateSaveButton();
        if (progress.path) {
          setStatus({
            state: statusKey('statusRtspRecordSaved'),
            file: progress.path,
            format: 'RTSP'
          });
        }
        if (isSaveProgressVisible()) {
          finishSaveProgress({
            ok: true,
            value: '100%',
            saved: {
              path: progress.path || '',
              name: progress.name || '',
              size: progress.size || 0,
              elapsed: progress.elapsed || ''
            }
          });
        }
        return;
      }
      if (progress.phase === 'error') {
        rtspRecording = false;
        updateSaveButton();
        if (isSaveProgressVisible()) {
          finishSaveProgress({
            ok: false,
            message: progress.error || t('statusRtspRecordFailed')
          });
        }
        showAppError({
          title: t('errorRtspTitle'),
          message: progress.error || t('statusRtspRecordFailed'),
          detail: progress.error || '',
          context: { url: currentRtspUrl || '', path: progress.path || '' }
        });
      }
    });
  } else {
    updateToolbarBrand({ version: '1.0.0' });
    setStatus({ platform: 'Web', file: statusKey('statusReady'), state: statusKey('statusIdle') });
  }

  updateSaveButton();
  renderPlayHistory();
  await setCompactMode(Boolean(settings.compactMode), { persist: false });
  if (settings.showHistoryPanel) {
    await setHistoryWindowOpen(true, { persist: false });
  }
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

  // Paste YouTube / RTSP URL anywhere (except inputs)
  window.addEventListener('paste', async (e) => {
    const tag = (e.target?.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;
    const text = e.clipboardData?.getData('text') || '';
    if (isYouTubeUrl(text) || isRtspUrl(text)) {
      e.preventDefault();
      await playNetworkFromInput(text.trim());
    }
  });

}

init();
