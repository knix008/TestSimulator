// MyBroadcasting main window: the menu bar (also the title bar), the toolbar, the left panel (Scenes ·
// Sources), the centre (preview — in studio mode preview and program with the transition controls — or
// the multiview), the right panel (the selected source: Properties · Filters · Transform · Audio), the
// bottom panel (Audio mixer · Transitions · Controls · Media · Stats · Messages · Problems) and the
// status bar (LIVE / REC times, CPU, FPS, dropped frames, bitrate).
//
// The shell (menus as popup windows, the toolbar folding into », panels with grips, the start page of
// movable cards over a moving background, settings, themes, progress popups, window memory) is
// MySketchBook's. The broadcasting itself is studio/studio.js (collection, engine, mixer, outputs).
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import APP_ICON from '../assets/icon-256.png';
import { ANIMATIONS, loadSettings, PANEL_MIN, RECENT_KEY, STORAGE_KEY, storeSettings } from './domain/settings.js';
import { addRecent, loadRecent, removeRecent, storeRecent } from './domain/recent.js';
import { baseName } from './domain/paths.js';
import { switchFlag } from './flags.js';
import { getLanguage, setLanguage, t } from './i18n.js';
import { icon } from './icons.js';
import * as native from './platform/native.js';
import { PopupHost } from './platform/popups.js';
import { applyFont, applyTheme, customTheme, DARK_THEMES, LIGHT_THEMES, randomThemeId, resolveTheme, themeName } from './themes.js';
import { escapeHtml, frameThrottle, isMac, keyLabel, pointerDrag } from './ui/dom.js';
import { AnimatedBackground } from './ui/background.js';
import { startPageHtml } from './ui/startpage.js';
import { startBoard } from './ui/startboard.js';
import { STEPS as TUTORIAL_STEPS, Tutorial } from './ui/tutorial.js';
import { bindSteppers } from './stepper.js';
import { DOC_KINDS, docLabel, docWindowTitle } from './domain/helpdocs.js';
import { printDirect, printToPdfFile } from './lib/platform.js';
import { FILTER_TYPES, SOURCE_MENU, SOURCE_TYPES, TRANSITION_TYPES } from './bc/catalog.js';
import * as M from './bc/model.js';
import * as P from './bc/platform.js';
import { faderToMul, mulToFader } from './bc/engine/audio.js';
import { SAMPLE_COLLECTIONS, sampleCollection } from './bc/samples.js';
import { recommendedBitrate } from './bc/services.js';
import { Studio, COLLECTIONS_KEY } from './studio/studio.js';
import { PROFILES_KEY, sizeOf } from './studio/profile.js';
import { Workspace } from './studio/workspace.js';
import { comboOf, toAccelerator } from './studio/hotkeys.js';
import { readField, setPath } from './studio/propform.js';
import * as Panels from './studio/panels.js';
import { connectAccount } from './studio/accounts.js';
import { loadTools, Tools, TOOLS_KEY } from './studio/tools.js';
import { RemoteControl } from './studio/wsproto.js';
import { buildReport, REPORTS } from './studio/reports.js';

const root = document.querySelector('#app');
const desktop = native.isDesktop();
const appWindow = desktop ? getCurrentWindow() : null;
const popups = new PopupHost();
const prefersDark = () => Boolean(globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches);
const VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '1.0.0';
const lang = () => getLanguage();

const state = {
  settings: loadSettings(globalThis.localStorage),
  recent: loadRecent(globalThis.localStorage),
  notice: null,
  info: null,
  openMenu: null,
  lastMenuClose: { name: null, at: 0 },
  quitting: false,
  dropActive: false,
  minWidth: 0,
  maximized: false,
  showStart: true,
  problems: [],
  logFilter: 'all',
  toolbarHidden: [],
  filter: null,
  devices: [],
  fonts: null,
  sys: null,
  meters: {},
};

const studio = new Studio({ t: (k, p) => t(k, p) });
let workspace = null;
let tools = null;
let remote = null;

// ───────────────────────── notices & errors

let noticeTimer = 0;
function notify(kind, message, detail = '') {
  state.notice = { kind, text: message, at: Date.now() };
  studio.log(kind === 'error' ? 'error' : kind === 'warning' ? 'warning' : 'info', message, detail);
  renderStatus();
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { state.notice = null; renderStatus(); }, kind === 'error' ? 12000 : 6000);
}

function formatError(error) {
  const message = errorMessage(error);
  return { message, detail: error?.stack && !String(error.stack).startsWith(message) ? error.stack : error?.stack?.split('\n').slice(1).join('\n') ?? '' };
}
/** Known error codes get a readable sentence (FFmpeg missing, no encoder, capture refused …). */
function errorMessage(error) {
  const text = native.errorText(error);
  const known = { 'ffmpeg-missing': 'error.ffmpegMissing', 'relay-unreachable': 'error.relayUnreachable', 'capture-unsupported': 'error.captureUnsupported', NotAllowedError: 'error.permission', NotFoundError: 'error.deviceMissing', 'audio-worklet-unavailable': 'error.noWorklet' };
  const key = known[text] ?? known[error?.name];
  return key ? t(key) : text;
}

function showError(titleKey, error, context = '') {
  const { message, detail } = formatError(error);
  console.error(titleKey, error);
  notify('error', `${t(titleKey)}: ${message}`, [context, detail].filter(Boolean).join('\n'));
  const info = state.info;
  return popups.open('error', {
    title: t(titleKey), message, detail: detail ?? '', context, time: new Date().toLocaleString(),
    app: info ? `${info.name} ${info.version} (${info.web ? 'web' : `${info.os}/${info.arch}`}, ${info.commit})` : `MyBroadcasting ${VERSION}`,
  });
}

window.addEventListener('error', (event) => { if (event.error || event.message) showError('error.unexpected', event.error ?? event.message, event.filename ? `${event.filename}:${event.lineno}` : ''); });
window.addEventListener('unhandledrejection', (event) => showError('error.unexpected', event.reason));

// ───────────────────────── helpers

const S = () => state.settings;
const c = () => studio.c;
const selItem = () => studio.selectedItems()[0] ?? null;
const selSource = () => c().sources[selItem()?.source ?? studio.selection.source] ?? null;
const selSourceId = () => selItem()?.source ?? studio.selection.source ?? null;
const hasSel = () => studio.selection.items.size > 0;
const onStart = () => state.showStart;
const fmt = (s) => { const v = Math.max(0, Math.floor(s)); return `${String(Math.floor(v / 3600)).padStart(2, '0')}:${String(Math.floor((v % 3600) / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`; };

async function ask(params) { const result = await popups.open('confirm', params); return result?.choice ?? 'cancel'; }
async function prompt(title, label, value = '', glyph = 'rename') { const r = await popups.open('prompt', { title, label, value, icon: glyph }); return r?.value == null ? null : String(r.value).trim(); }
async function confirmYes(titleKey, messageKey, params = {}, { danger = false, glyph = 'warning', yesKey = 'common.yes' } = {}) {
  const choice = await ask({ icon: glyph, title: t(titleKey, params), message: t(messageKey, params), buttons: [{ id: 'cancel', label: t('common.cancel') }, { id: 'yes', label: t(yesKey), icon: 'check', primary: !danger, danger }] });
  return choice === 'yes';
}

async function refreshDevices() {
  try {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    state.devices = await navigator.mediaDevices.enumerateDevices();
  } catch { state.devices = []; }
}
async function loadFonts() {
  if (state.fonts) return state.fonts;
  try { state.fonts = await native.listFonts(); } catch { state.fonts = []; }
  return state.fonts;
}
const formCtx = () => ({ devices: state.devices, fonts: state.fonts ?? [], audioSources: Object.values(c().sources).filter((s) => s.audio && s.id !== selSourceId()).map((s) => ({ id: s.id, name: s.name })), filter: state.filter });

// ───────────────────────── outputs (with confirmations and "start together" options)

/** Missing settings stop a stream before anything starts; the user is offered Settings › Stream. */
const STREAM_BLOCKERS = ['noServer', 'badServer', 'noKey'];
async function streamSettingsMissing() {
  const blocker = studio.streamTarget().problems.find((x) => STREAM_BLOCKERS.includes(x));
  if (!blocker) return false;
  const choice = await ask({ icon: 'stream', title: t('error.stream'), message: `${t(`stream.problem.${blocker}`)}. ${t('stream.fixInSettings')} ${t('stream.orDirect')}`, buttons: [{ id: 'cancel', label: t('common.cancel') }, { id: 'direct', label: t('action.useDirect'), icon: 'webrtc' }, { id: 'settings', label: t('action.openStreamSettings'), icon: 'gear', primary: true }] });
  if (choice === 'settings') popups.open('settings', { tab: 'stream' });
  // Direct viewing needs neither server nor key: switch the profile to it and go on.
  if (choice === 'direct') { studio.updateProfile((p) => { p.stream = { ...p.stream, service: 'direct' }; return p; }); return false; }
  return true;
}

/** Direct viewing: the addresses viewers open, with a button that copies the first one. */
async function showViewerLinks() {
  const urls = studio.outputs.stream?.urls ?? [];
  if (!urls.length) return;
  const choice = await ask({ icon: 'webrtc', title: t('direct.title'), message: t('direct.started', { urls: urls.join('  ·  ') }), items: urls, buttons: [{ id: 'ok', label: t('common.ok') }, { id: 'copy', label: t('direct.copy'), icon: 'copy', primary: true }] });
  if (choice === 'copy') await copyText(urls[0]);
}

/**
 * Settings › Stream › Connect: signs in with the user's own Client ID and puts the stream key into the profile.
 * Twitch shows a code to type on its page; YouTube signs in in the browser and comes back by itself.
 */
async function connectAccountFlow(service) {
  const a = studio.profile.stream.accounts?.[service] ?? {};
  const signal = { cancelled: false };
  let waiting = null;
  const showWait = (message, extra = []) => {
    waiting = ask({ icon: 'user', title: t('settings.account.title'), message, buttons: [{ id: 'cancel', label: t('common.cancel') }, ...extra] });
    waiting.then((choice) => { if (choice === 'copy') copyText(lastCode); else signal.cancelled = true; });
  };
  let lastCode = '';
  try {
    if (service === 'youtube') showWait(t('account.youtubeWait'));
    const result = await connectAccount(service, {
      clientId: a.clientId, clientSecret: a.clientSecret, io: P.accountIo(), signal,
      onCode: ({ code, url }) => { lastCode = code; showWait(t('account.twitchCode', { code, url }), [{ id: 'copy', label: t('account.copyCode'), icon: 'copy', primary: true }]); },
    });
    signal.done = true;
    popups.close('confirm');
    studio.updateProfile((p) => { p.stream = { ...p.stream, service, key: result.key, accounts: { ...p.stream.accounts, [service]: { ...p.stream.accounts[service], login: result.login } } }; return p; });
    notify('success', t('account.connected', { name: result.login }));
  } catch (error) {
    popups.close('confirm');
    if (error?.code === 'cancelled') return;
    const known = ['no-client-id', 'desktop-only', 'youtube-no-stream', 'expired'];
    showError('account.failed', known.includes(error?.code) ? new Error(t(`account.error.${error.code}`)) : error);
  }
}

/** A program that shows nothing goes out black: say so before going live (a screen capture is one click away). */
async function programShowsSomething() {
  if (M.showsPicture(studio.c, studio.c.current)) return true;
  const choice = await ask({ icon: 'warning', title: t('empty.streamTitle'), message: t('empty.streamText'), buttons: [{ id: 'cancel', label: t('common.cancel'), primary: true }, { id: 'camera', label: t('empty.addCamera'), icon: 'srcCamera' }, { id: 'capture', label: t('empty.addCapture'), icon: 'srcDisplay' }, { id: 'go', label: t('empty.goAnyway'), icon: 'stream' }] });
  if (choice === 'camera' || choice === 'capture') { showStartPage(false); await addSourceAsk(choice === 'camera' ? 'dshow_input' : 'monitor_capture'); return false; }
  return choice === 'go';
}

async function startStream({ confirmed = false } = {}) {
  if (studio.outputs.stream) return;
  if (await streamSettingsMissing()) return;
  if (!confirmed && !(await programShowsSomething())) return;
  if (S().confirmStartStream && !confirmed && !(await confirmYes('confirm.startStreamTitle', 'confirm.startStreamMessage', {}, { glyph: 'stream', yesKey: 'action.startStream' }))) return;
  await studio.startAudio();
  try {
    await withProgress('progress.connecting', studio.streamTarget().service.name, () => studio.startStream(), { delay: 400 });
    notify('success', t('notice.streamStarted'));
    if (studio.outputs.stream?.urls?.length) showViewerLinks();
    if (S().recordWhenStreaming && !studio.outputs.recording) await startRecording();
    if (S().replayWhenStreaming && !studio.outputs.replay) await toggleReplay();
  } catch (error) { showError('error.stream', error); }
  renderAll();
}
async function stopStream({ confirmed = false } = {}) {
  if (!studio.outputs.stream) return;
  if (S().confirmStopStream && !confirmed && !(await confirmYes('confirm.stopStreamTitle', 'confirm.stopStreamMessage', {}, { glyph: 'streamStop', danger: true, yesKey: 'action.stopStream' }))) return;
  await studio.stopStream();
  if (!S().keepRecordingWhenStreamStops && studio.outputs.recording) await stopRecording({ confirmed: true });
  if (!S().keepReplayWhenStreamStops && studio.outputs.replay) await studio.stopReplay();
  notify('info', t('notice.streamStopped'));
  renderAll();
}
async function startRecording() {
  if (studio.outputs.recording) return;
  await studio.startAudio();
  try { await studio.startRecording(); notify('success', t('notice.recordingStarted', { path: studio.outputs.recording?.part?.path ?? '' })); } catch (error) { showError('error.record', error); }
  renderAll();
}
async function stopRecording({ confirmed = false } = {}) {
  if (!studio.outputs.recording) return;
  if (S().confirmStopRecord && !confirmed && !(await confirmYes('confirm.stopRecordTitle', 'confirm.stopRecordMessage', {}, { glyph: 'recordStop', danger: true, yesKey: 'action.stopRecording' }))) return;
  const paths = await studio.stopRecording();
  if (paths?.length) { notify('success', t('notice.recordingSaved', { path: paths.at(-1) })); rememberFolder(paths.at(-1)); }
  renderAll();
}
async function toggleReplay() {
  try {
    if (studio.outputs.replay) await studio.stopReplay();
    else { await studio.startAudio(); await studio.startReplay(); notify('info', t('notice.replayStarted')); }
  } catch (error) { showError('error.replay', error); }
  renderAll();
}
async function saveReplay() {
  try { const path = await studio.saveReplay(); if (path) notify('success', t('notice.replaySaved', { path })); } catch (error) { showError('error.replay', error); }
}
/**
 * Virtual camera: the camera device when it is installed (Windows); if it is not, the user is asked whether to
 * install it — that needs administrator rights, and Windows asks once more with its own prompt — or to use
 * the window instead.
 */
/** Installs (remove: removes) the camera device as administrator; the status after it. */
async function installVcam(remove = false) {
  try {
    const status = await P.vcamDevice.register(remove);
    notify('success', t(remove ? 'vcam.removed' : 'vcam.installed'));
    return status;
  } catch (error) {
    if (/cancelled/.test(String(error?.message ?? error))) { notify('warning', t('vcam.adminCancelled')); return P.vcamDevice.status(); }
    throw error;
  }
}

async function toggleVirtualCam() {
  try {
    if (studio.outputs.vcam) { studio.stopVirtualCam(); return; }
    let status = await P.vcamDevice.status();
    if (status.supported && status.dll && !status.installed) {
      const choice = await ask({ icon: 'vcam', title: t('vcam.installTitle'), message: t('vcam.installMessage'), buttons: [{ id: 'cancel', label: t('common.cancel') }, { id: 'window', label: t('vcam.useWindow'), icon: 'projector' }, { id: 'install', label: t('vcam.installAdmin'), icon: 'shield', primary: true }] });
      if (choice === 'cancel') return;
      if (choice === 'install') status = await installVcam();
    }
    await studio.startVirtualCam({ device: Boolean(status.supported && status.installed) });
    notify('info', t(studio.outputs.vcam === 'device' ? 'vcam.startedDevice' : 'notice.vcamStarted'));
  } catch (error) { showError('error.vcam', error); }
  renderAll();
}
async function screenshot(which) {
  try { const path = await studio.screenshot(which); if (path) notify('success', t('notice.screenshot', { path })); } catch (error) { showError('error.screenshot', error); }
}
function rememberFolder(path) {
  if (!desktop || !path) return;
  const dir = String(path).replace(/[\\/][^\\/]*$/, '');
  updateSettings({ lastDirectory: dir }, { quiet: true });
}

// ───────────────────────── scenes, sources, items

async function addSceneAsk() {
  const name = await prompt(t('action.addScene'), t('scene.name'), M.uniqueName(c(), t('scene.default')), 'srcScene');
  if (!name) return;
  if (M.nameTaken(c(), name)) { notify('warning', t('notice.nameTaken', { name })); return; }
  const s = studio.addScene(name);
  studio.selectScene(s.id);
}
async function renameSceneAsk(id = studio.editScene.id) {
  const scene = M.sceneById(c(), id);
  if (!scene) return;
  const name = await prompt(t('action.renameScene'), t('scene.name'), scene.name, 'rename');
  if (!name || name === scene.name) return;
  if (!studio.renameScene(id, name)) notify('warning', t('notice.nameTaken', { name }));
}
async function removeSceneAsk(id = studio.editScene.id) {
  const scene = M.sceneById(c(), id);
  if (!scene || c().scenes.length <= 1) return;
  if (S().confirmDelete && !(await confirmYes('confirm.removeTitle', 'confirm.removeScene', { name: scene.name }, { danger: true, glyph: 'trash', yesKey: 'common.remove' }))) return;
  studio.removeScene(id);
}
async function duplicateSceneAsk(id = studio.editScene.id) {
  const scene = M.sceneById(c(), id);
  const name = await prompt(t('action.duplicateScene'), t('scene.name'), M.uniqueName(c(), scene.name), 'copy');
  if (name) studio.duplicateScene(id, name);
}

/** The Add source menu: every type (grouped) and "existing" sources and scenes. */
function addSourceMenu(anchor) {
  const handlers = {};
  const items = SOURCE_MENU.map((type) => {
    if (type === '-') return { separator: true };
    if (type === 'scene') {
      const scenes = c().scenes.filter((s) => s.id !== studio.editScene.id && !M.sceneContains(c(), s.id, studio.editScene.id));
      return { id: 'submenu:addScene', label: t('src.scene'), icon: 'srcScene', submenu: true, disabled: !scenes.length, children: scenes.map((s) => { handlers[`custom:nest:${s.id}`] = () => studio.addExisting(s.id); return { id: `custom:nest:${s.id}`, label: s.name, icon: 'srcScene' }; }) };
    }
    if (type === 'group') { handlers['custom:add:group'] = () => groupSelected(); return { id: 'custom:add:group', label: t('action.groupSelected'), icon: 'srcGroup', disabled: !hasSel() }; }
    handlers[`custom:add:${type}`] = () => addSourceAsk(type);
    return { id: `custom:add:${type}`, label: t(`src.${type}`), icon: SOURCE_TYPES[type].icon };
  });
  const existing = Object.values(c().sources).filter((s) => !s.global && s.type !== 'group');
  items.push({ separator: true });
  items.push({ id: 'submenu:existing', label: t('action.addExisting'), icon: 'sourceExisting', submenu: true, disabled: !existing.length, children: existing.map((s) => { handlers[`custom:existing:${s.id}`] = () => studio.addExisting(s.id); return { id: `custom:existing:${s.id}`, label: s.name, icon: SOURCE_TYPES[s.type].icon }; }) });
  return showMenu(items, anchor, 'context', { handlers, header: { icon: 'plus', title: t('action.addSource') } });
}

async function addSourceAsk(type, settings = {}) {
  const name = await prompt(t('action.newSource', { type: t(`src.${type}`) }), t('source.name'), M.uniqueName(c(), t(`src.${type}`)), SOURCE_TYPES[type].icon);
  if (!name) return null;
  if (M.nameTaken(c(), name)) { notify('warning', t('notice.nameTaken', { name })); return null; }
  await studio.startAudio();
  const made = studio.addSource(type, name, settings);
  updateSettings({ rightTab: 'props', showRightPanel: true });
  // Captures need a click to choose what to capture: the picker opens at once.
  if (['monitor_capture', 'window_capture', 'game_capture', 'wasapi_output_capture', 'wasapi_process_output_capture'].includes(type)) await pickCapture(made.source.id);
  // A file source without a file: choose one now.
  if (type === 'image_source' || (type === 'ffmpeg_source' && settings.is_local_file !== false)) await chooseFormFile(`src:${made.source.id}`, type === 'image_source' ? 'file' : 'local_file', type === 'image_source' ? SOURCE_TYPES.image_source.props[0].accept : SOURCE_TYPES.ffmpeg_source.props[1].accept);
  await refreshDevices();
  renderAll();
  return made;
}

async function pickCapture(id) {
  const rt = studio.engine.runtime(id);
  if (!rt?.pick) return;
  try { await rt.pick(); await studio.startAudio(); studio.attachAudio(rt); notify('success', t('notice.capturePicked', { label: rt.label || '' })); } catch (error) { if (error?.name !== 'NotAllowedError' && error?.name !== 'AbortError') showError('error.capture', error); else notify('info', t('notice.captureCancelled')); }
  renderRight();
}

async function renameItemAsk() {
  const id = selSourceId();
  if (!id) return;
  const src = c().sources[id] ?? M.sceneById(c(), id);
  const name = await prompt(t('action.renameSource'), t('source.name'), src.name, 'rename');
  if (name && name !== src.name && !studio.renameSource(id, name)) notify('warning', t('notice.nameTaken', { name }));
}
async function removeItemsAsk() {
  const items = studio.selectedItems();
  if (!items.length) return;
  if (S().confirmDelete && !(await confirmYes('confirm.removeTitle', 'confirm.removeItems', { count: items.length, name: c().sources[items[0].source]?.name ?? M.sceneById(c(), items[0].source)?.name }, { danger: true, glyph: 'trash', yesKey: 'common.remove' }))) return;
  studio.removeItems();
}
function groupSelected() {
  if (studio.selection.items.size < 1) return;
  const g = studio.groupSelected(t('src.group'));
  if (g) studio.select([g.id]);
}

// ───────────────────────── collections and profiles

async function newCollectionAsk() {
  const name = await prompt(t('action.newCollection'), t('collection.name'), studio.uniqueCollectionName(t('collection.untitled')), 'collection');
  if (!name) return;
  studio.newCollection(name);
  showStartPage(false);
  notify('success', t('notice.collectionCreated', { name }));
}
async function switchCollection(name) {
  if (studio.isLive && !(await confirmYes('confirm.switchLiveTitle', 'confirm.switchLive', { name }))) return;
  studio.switchCollection(name);
  showStartPage(false);
}
async function renameCollectionAsk() {
  const name = await prompt(t('action.renameCollection'), t('collection.name'), studio.collections.current, 'rename');
  if (name && name !== studio.collections.current && !studio.renameCollection(name)) notify('warning', t('notice.nameTaken', { name }));
}
async function duplicateCollectionAsk() {
  const name = await prompt(t('action.duplicateCollection'), t('collection.name'), studio.uniqueCollectionName(`${studio.collections.current} ${t('common.copySuffix')}`), 'copy');
  if (name) studio.duplicateCollection(name);
}
async function removeCollectionAsk() {
  if (studio.collections.names.length <= 1) return;
  if (!(await confirmYes('confirm.removeTitle', 'confirm.removeCollection', { name: studio.collections.current }, { danger: true, glyph: 'trash', yesKey: 'common.remove' }))) return;
  studio.removeCollection();
}
async function importCollection() {
  try {
    let text; let name;
    if (desktop) {
      const [path] = await native.chooseFiles(S().lastDirectory, [{ name: t('file.collections'), extensions: ['mybc', 'json'] }], false);
      if (!path) return;
      text = await native.readTextFile(path, ''); name = baseName(path).replace(/\.[^.]+$/, '');
      rememberRecent(path);
    } else {
      const [file] = await native.pickWithInput('.mybc,.json', false);
      if (!file) return;
      text = await file.text(); name = file.name.replace(/\.[^.]+$/, '');
    }
    const { name: made, skipped } = studio.importCollection(text, name);
    showStartPage(false);
    notify(skipped.length ? 'warning' : 'success', skipped.length ? t('notice.importedSkipped', { name: made, list: skipped.join(', ') }) : t('notice.imported', { name: made }));
  } catch (error) { showError('error.import', error); }
}
async function exportCollection({ sceneJson = false } = {}) {
  const text = studio.exportCollection({ sceneJson });
  const file = `${studio.collections.current}${sceneJson ? '.scenes' : ''}.${sceneJson ? 'json' : 'mybc'}`;
  try {
    if (desktop) {
      const path = await native.chooseSavePath(P.joinPath(S().lastDirectory ?? '', file), [sceneJson ? 'json' : 'mybc']);
      if (!path) return;
      await native.writeTextFile(path, text, '');
      rememberRecent(path);
      notify('success', t('notice.exported', { path }));
    } else { P.downloadBlob(new Blob([text], { type: 'application/json' }), file); notify('success', t('notice.exported', { path: file })); }
  } catch (error) { showError('error.export', error); }
}
async function newProfileAsk({ copy = false } = {}) {
  const name = await prompt(t(copy ? 'action.duplicateProfile' : 'action.newProfile'), t('profile.name'), copy ? `${studio.profile.name} ${t('common.copySuffix')}` : t('profile.untitled'), 'profile');
  if (!name) return;
  studio.newProfile(name, { copy });
  notify('success', t('notice.profileCreated', { name: studio.profile.name }));
}
async function renameProfileAsk() {
  const name = await prompt(t('action.renameProfile'), t('profile.name'), studio.profile.name, 'rename');
  if (name && name !== studio.profile.name && !studio.renameProfile(name)) notify('warning', t('notice.nameTaken', { name }));
}
async function removeProfileAsk() {
  if (studio.profiles.list.length <= 1) return;
  if (!(await confirmYes('confirm.removeTitle', 'confirm.removeProfile', { name: studio.profile.name }, { danger: true, glyph: 'trash', yesKey: 'common.remove' }))) return;
  studio.removeProfile();
}
async function importProfile() {
  try {
    let text;
    if (desktop) { const [path] = await native.chooseFiles(S().lastDirectory, [{ name: 'JSON', extensions: ['json'] }], false); if (!path) return; text = await native.readTextFile(path, ''); }
    else { const [file] = await native.pickWithInput('.json', false); if (!file) return; text = await file.text(); }
    const name = studio.importProfile(text);
    notify('success', t('notice.profileImported', { name }));
  } catch (error) { showError('error.import', error); }
}
async function exportProfile() {
  const text = studio.exportProfile();
  const file = `${studio.profile.name}.profile.json`;
  if (desktop) { const path = await native.chooseSavePath(P.joinPath(S().lastDirectory ?? '', file), ['json']); if (path) { await native.writeTextFile(path, text, ''); notify('success', t('notice.exported', { path })); } }
  else P.downloadBlob(new Blob([text], { type: 'application/json' }), file);
}
function rememberRecent(path) {
  if (!desktop || !path) return;
  state.recent = addRecent(loadRecent(globalThis.localStorage), { path, title: baseName(path), kind: 'file' });
  storeRecent(globalThis.localStorage, state.recent);
}
async function openRecent(path) {
  if (!desktop) return;
  const [exists] = await native.pathsExist([path]);
  if (!exists) { if ((await ask({ icon: 'warning', title: t('recent.missingTitle'), message: t('recent.missingMessage'), items: [path], buttons: [{ id: 'keep', label: t('recent.keep') }, { id: 'remove', label: t('recent.remove'), icon: 'trash', danger: true, primary: true }] })) === 'remove') forgetRecent(path); return; }
  try { const { name } = studio.importCollection(await native.readTextFile(path, ''), baseName(path).replace(/\.[^.]+$/, '')); rememberRecent(path); showStartPage(false); notify('success', t('notice.imported', { name })); } catch (error) { showError('error.import', error, path); }
}
function forgetRecent(path) { state.recent = removeRecent(state.recent, path); storeRecent(globalThis.localStorage, state.recent); renderStartPage(); }

// ───────────────────────── projectors

async function projectorMenu(anchor, fixed = null) {
  const monitors = await P.listMonitors();
  const handlers = {};
  const targets = fixed ? [fixed] : [['preview', t('projector.preview'), 'preview'], ['program', t('projector.program'), 'program'], ['multiview', t('projector.multiview'), 'multiview'], ...c().scenes.map((s) => [`scene:${s.id}`, t('projector.scene', { name: s.name }), 'srcScene']), ...(selSource() ? [[`source:${selSource().id}`, t('projector.source', { name: selSource().name }), 'sources']] : [])];
  const items = targets.map(([which, label, glyph]) => {
    const kids = [{ id: `custom:proj:${which}:w`, label: t('projector.windowed'), icon: 'window' }, ...monitors.map((m, i) => ({ id: `custom:proj:${which}:${i}`, label: t('projector.fullscreen', { name: m }), icon: 'fullscreen' }))];
    for (const k of kids) handlers[k.id] = () => openProjector(which, label, k.id.endsWith(':w') ? null : Number(k.id.split(':').pop()));
    return { id: `submenu:proj-${which}`, label, icon: glyph, submenu: true, children: kids };
  });
  return showMenu(items, anchor, 'context', { handlers, header: { icon: 'projector', title: t('action.projector') } });
}
let projectorSeq = 0;
async function openProjector(which, title, monitor = null) {
  try { await P.openProjector({ label: `projector-${(projectorSeq += 1)}`, query: encodeURIComponent(which), title: `${title} — MyBroadcasting`, monitor }); notify('info', t('notice.projectorOpened', { name: title })); } catch (error) { showError('error.projector', error); }
}

// ───────────────────────── reports (printing)

let printHtml = '';
let printing = false;
async function printReport() {
  const result = await popups.open('print', { at: Date.now(), reports: REPORTS, report: S().report });
  if (result?.printed) notify('success', t('status.printSent'));
}
async function sendPrintContent(data = {}) {
  try {
    if (data.report) updateSettings({ report: data.report, reportThumbnails: data.thumbnails ?? S().reportThumbnails }, { quiet: true });
    printHtml = await buildReport(S().report, { studio, t, lang: lang(), thumbnails: S().reportThumbnails, version: state.info?.version ?? VERSION, sys: state.sys });
    const printers = await native.listPrinters().catch(() => ({ printers: [], defaultPrinter: '', filePrinters: [] }));
    popups.post('print', { type: 'print-content', html: printHtml, printers });
  } catch (error) { showError('error.print', error); }
}
async function runPrint(job) {
  if (printing) return;
  printing = true;
  const page = printHtml.includes('</head>') ? printHtml.replace('</head>', `${job.css}</head>`) : job.css + printHtml;
  try {
    const printers = await native.listPrinters().catch(() => ({ printers: [], filePrinters: [] }));
    let mode = job.mode;
    if (!desktop) mode = 'dialog';
    else if (mode === 'direct' && (!printers.printers.length || !job.printer)) mode = 'dialog';
    else if (mode === 'direct' && printers.filePrinters.includes(job.printer)) mode = 'pdf';
    if (mode === 'pdf') {
      const path = await native.chooseSavePath(P.joinPath(S().lastDirectory ?? '', `${t(`report.${S().report}`)} ${new Date().toISOString().slice(0, 10)}.pdf`), ['pdf']);
      if (!path) { popups.post('print', { type: 'print-done', ok: false, error: t('status.exportCancel'), keep: true }); return; }
      await printToPdfFile({ html: page, path, widthMm: job.widthMm, heightMm: job.heightMm });
      notify('success', t('status.exported', { path }));
    } else if (mode === 'dialog') {
      const { printDocument } = await import('./lib/platform.js');
      await printDocument({ html: page });
    } else {
      await printDirect({ html: page, printer: job.printer, copies: job.copies, widthMm: job.widthMm, heightMm: job.heightMm, pageRanges: job.pageRanges });
      notify('success', t('status.printedTo', { printer: job.printer }));
    }
    popups.post('print', { type: 'print-done', ok: true });
  } catch (error) {
    popups.post('print', { type: 'print-done', ok: false, error: native.errorText(error), keep: true });
    showError('error.print', error);
  } finally { printing = false; }
}

// ───────────────────────── tool windows (form popup)

async function openForm(kind) {
  const ts = tools.settings;
  const p = studio.profile;
  const forms = {
    outputTimer: { icon: 'timer', fields: [
      { key: 'stream.enabled', type: 'bool', label: 'timer.stream' }, { key: 'stream.h', type: 'number', min: 0, max: 99, step: 1, unit: 'h', label: 'timer.hours' }, { key: 'stream.m', type: 'number', min: 0, max: 59, step: 1, unit: 'm', label: 'timer.minutes' }, { key: 'stream.s', type: 'number', min: 0, max: 59, step: 1, unit: 's', label: 'timer.seconds' },
      { key: 'record.enabled', type: 'bool', label: 'timer.record' }, { key: 'record.h', type: 'number', min: 0, max: 99, step: 1, unit: 'h', label: 'timer.hours' }, { key: 'record.m', type: 'number', min: 0, max: 59, step: 1, unit: 'm', label: 'timer.minutes' }, { key: 'record.s', type: 'number', min: 0, max: 59, step: 1, unit: 's', label: 'timer.seconds' },
      { key: 'autoStart', type: 'bool', label: 'timer.autoStart' }], values: ts.timer, note: timerNote() },
    sceneSwitcher: { icon: 'switcher', fields: [
      { key: 'enabled', type: 'bool', label: 'switcher.enabled' }, { key: 'interval', type: 'number', min: 50, max: 10000, step: 50, unit: 'ms', label: 'switcher.interval' },
      { key: 'rulesText', type: 'textarea', rows: 5, label: 'switcher.rules' }, { key: 'noMatch', type: 'select', options: [['none', 'switcher.noMatch.none'], ['switch', 'switcher.noMatch.switch']], label: 'switcher.noMatch' },
      { key: 'noMatchScene', type: 'select', options: c().scenes.map((s) => [s.name, s.name]), label: 'switcher.noMatchScene' },
      { key: 'rotation.enabled', type: 'bool', label: 'switcher.rotation' }, { key: 'rotationText', type: 'textarea', rows: 4, label: 'switcher.rotationList' }],
      values: { ...ts.switcher, rulesText: ts.switcher.rules.map((r) => `${r.regex ? '/' : ''}${r.window}${r.regex ? '/' : ''} => ${r.scene}`).join('\n'), rotationText: ts.switcher.rotation.items.map((r) => `${r.scene} => ${r.seconds}`).join('\n'), noMatchScene: ts.switcher.noMatchScene || c().scenes[0]?.name }, note: t('switcher.help') },
    scripts: { icon: 'script', width: 820, height: 680, fields: [{ key: 'enabled', type: 'bool', label: 'scripts.enabled' }, { key: 'code', type: 'textarea', rows: 18, label: 'scripts.code' }], values: { enabled: ts.scripts[0]?.enabled ?? false, code: ts.scripts[0]?.code ?? t('scripts.example') }, note: t('scripts.help') },
    captions: { icon: 'captions', fields: [{ key: 'enabled', type: 'bool', label: 'captions.enabled' }, { key: 'language', type: 'select', options: [['ko-KR', 'captions.lang.ko'], ['en-US', 'captions.lang.en'], ['ja-JP', 'captions.lang.ja'], ['zh-CN', 'captions.lang.zh']], label: 'captions.language' }, { key: 'source', type: 'text', label: 'captions.source' }, { key: 'lines', type: 'number', min: 1, max: 6, step: 1, unit: '', label: 'captions.lines' }], values: ts.captions, note: tools.captionsAvailable ? t('captions.help') : t('captions.unavailable') },
    websocket: { icon: 'remote', fields: [{ key: 'enabled', type: 'bool', label: 'ws.enabled' }, { key: 'port', type: 'number', min: 1024, max: 65535, step: 1, unit: '', label: 'ws.port' }, { key: 'all', type: 'bool', label: 'ws.all' }, { key: 'auth', type: 'bool', label: 'ws.auth' }, { key: 'password', type: 'text', label: 'ws.password' }], values: { ...p.advanced.websocket }, note: desktop ? t('ws.help', { port: p.advanced.websocket.port, state: remote ? t('ws.running') : t('ws.stopped') }) : t('ws.desktopOnly') },
    remux: { icon: 'remux', fields: [{ key: 'input', type: 'text', label: 'remux.input' }, { key: 'format', type: 'select', options: ['mp4', 'mov', 'mkv', 'flv', 'ts'].map((x) => [x, `remux.format.${x}`]), label: 'remux.format' }], values: { input: studio.lastRecording?.path ?? '', format: p.advanced.remuxFormat }, note: desktop ? t('remux.help') : t('remux.desktopOnly'), ok: 'remux.run' },
    autoconfig: { icon: 'wizard', fields: [{ key: 'usage', type: 'select', options: [['stream', 'auto.usage.stream'], ['record', 'auto.usage.record'], ['vcam', 'auto.usage.vcam']], label: 'auto.usage' }, { key: 'base', type: 'select', options: ['3840x2160', '2560x1440', '1920x1080', '1280x720'].map((x) => [x, x]), label: 'auto.base' }, { key: 'fps', type: 'select', options: [['60', 'auto.fps.60'], ['30', 'auto.fps.30'], ['either', 'auto.fps.either']], label: 'auto.fps' }, { key: 'service', type: 'select', options: [['twitch', 'Twitch'], ['youtube', 'YouTube'], ['chzzk', 'CHZZK'], ['soop', 'SOOP'], ['kick', 'Kick'], ['custom', 'auto.service.custom']], label: 'auto.service' }, { key: 'key', type: 'text', label: 'auto.key' }], values: { usage: 'stream', base: p.video.base, fps: 'either', service: p.stream.service, key: p.stream.key }, note: t('auto.help'), ok: 'auto.run' },
  };
  const f = forms[kind];
  if (!f) return;
  const result = await popups.open('form', { title: t(`tool.${kind}`), icon: f.icon, fields: f.fields, values: f.values, note: f.note, ok: f.ok }, f.width ? { width: f.width, height: f.height } : undefined);
  if (!result?.values) return;
  const v = result.values;
  if (kind === 'outputTimer') { tools.update({ timer: v }); for (const k of ['stream', 'record']) { if (v[k].enabled && (k === 'stream' ? studio.outputs.stream : studio.outputs.recording)) tools.startTimer(k); else if (!v[k].enabled) tools.stopTimer(k); } }
  if (kind === 'sceneSwitcher') {
    const rules = String(v.rulesText ?? '').split('\n').map((l) => l.split('=>')).filter((x) => x.length === 2).map(([w, s]) => { const raw = w.trim(); const regex = /^\/.*\/$/.test(raw); return { window: regex ? raw.slice(1, -1) : raw, regex, scene: s.trim() }; });
    const items = String(v.rotationText ?? '').split('\n').map((l) => l.split('=>')).filter((x) => x.length === 2).map(([s, sec]) => ({ scene: s.trim(), seconds: Math.max(1, Number(sec) || 10) }));
    tools.update({ switcher: { enabled: v.enabled, interval: v.interval, rules, noMatch: v.noMatch, noMatchScene: v.noMatchScene, rotation: { enabled: v.rotation?.enabled, items } } });
  }
  if (kind === 'scripts') tools.update({ scripts: [{ name: 'main', code: v.code, enabled: v.enabled }] });
  if (kind === 'captions') tools.update({ captions: { ...ts.captions, ...v } });
  if (kind === 'websocket') { studio.updateProfile((pr) => { pr.advanced.websocket = { ...pr.advanced.websocket, ...v }; return pr; }); await applyRemote(); }
  if (kind === 'remux') await remuxFile(v.input, v.format);
  if (kind === 'autoconfig') autoConfigure(v);
}
const timerNote = () => ['stream', 'record'].map((k) => { const r = tools.remaining(k); return r == null ? '' : t('timer.remaining', { what: t(`timer.${k}`), time: fmt(r / 1000) }); }).filter(Boolean).join(' · ') || t('timer.help');

async function remuxFile(input, format) {
  if (!desktop) { notify('info', t('remux.desktopOnly')); return; }
  let path = input;
  if (!path) { [path] = await native.chooseFiles(S().lastDirectory, [{ name: t('file.recordings'), extensions: ['mkv', 'mp4', 'mov', 'flv', 'ts', 'webm'] }], false); if (!path) return; }
  const out = path.replace(/\.[^.\\/]+$/, `.${format}`) === path ? path.replace(/\.([^.\\/]+)$/, `.remuxed.${format}`) : path.replace(/\.[^.\\/]+$/, `.${format}`);
  try { await withProgress('progress.remux', baseName(path), () => P.remux(path, out, { ffmpeg: studio.profile.advanced.ffmpegPath }), { delay: 0 }); notify('success', t('notice.remuxed', { path: out })); } catch (error) { showError('error.remux', error); }
}

/** The auto-configuration wizard: picks sizes, rate and bitrates from the usage and a GPU timing. */
function autoConfigure(v) {
  const base = v.base;
  const [w, h] = sizeOf(base);
  // A short timing of the compositor tells whether 60 fps is safe here.
  const fast = studio.engine.stats.renderMs < 6;
  const fps = v.fps === 'either' ? (fast ? '60' : '30') : v.fps;
  const out = v.usage === 'stream' && w > 1920 ? '1920x1080' : base;
  const [ow, oh] = sizeOf(out);
  const bitrate = recommendedBitrate(ow, oh, Number(fps));
  studio.updateProfile((pr) => {
    pr.video = { ...pr.video, base, output: out, fps };
    pr.output.mode = 'simple';
    pr.output.simple = { ...pr.output.simple, videoBitrate: v.usage === 'record' ? Math.max(bitrate, 8000) : bitrate, recQuality: v.usage === 'record' ? 'high' : 'stream' };
    if (v.usage === 'stream') { pr.stream = { ...pr.stream, service: v.service, key: v.key ?? pr.stream.key }; }
    return pr;
  });
  notify('success', t('auto.done', { base, out, fps, bitrate }));
}

async function applyRemote() {
  const cfg = studio.profile.advanced.websocket;
  remote?.dispose();
  remote = null;
  if (!desktop) return;
  await native.invoke('remote_stop').catch(() => {});
  if (!cfg.enabled) return;
  try {
    await native.invoke('remote_start', { port: cfg.port, all: Boolean(cfg.all) });
    remote = new RemoteControl(studio, { send: (id, text) => native.invoke('remote_send', { id, text }).catch(() => {}), run: (id, ctx) => run(id, ctx), version: VERSION, password: cfg.password, auth: cfg.auth });
    notify('info', t('ws.started', { port: cfg.port }));
  } catch (error) { showError('error.websocket', error); }
}

// ───────────────────────── hotkeys

let keys = new Map();
function bindHotkeys() {
  keys = studio.keyMap();
  if (!desktop || !S().globalHotkeys) return;
  const bindings = [...keys].map(([combo, actions]) => ({ accelerator: toAccelerator(combo), down: () => actions.forEach((a) => runHotkey(a, true)), up: () => actions.forEach((a) => runHotkey(a, false)) }));
  P.setGlobalHotkeys(bindings).then((r) => { if (r.failed?.length) notify('warning', t('notice.hotkeysFailed', { list: r.failed.join(', ') })); });
}
function runHotkey(action, pressed) {
  if (!studio.runAction(action, pressed)) return;
  if (pressed) renderLater();
}
studio.on('action', (action) => {
  const map = {
    startStream: () => startStream({ confirmed: true }), stopStream: () => stopStream({ confirmed: true }), toggleStream: () => (studio.outputs.stream ? stopStream({ confirmed: true }) : startStream({ confirmed: true })),
    startRecording: () => startRecording(), stopRecording: () => stopRecording({ confirmed: true }), toggleRecording: () => (studio.outputs.recording ? stopRecording({ confirmed: true }) : startRecording()),
    pauseRecording: () => studio.pauseRecording(), unpauseRecording: () => studio.resumeRecording(), splitRecording: () => studio.splitRecording(), addChapter: () => studio.addChapter(),
    startReplay: () => !studio.outputs.replay && toggleReplay(), stopReplay: () => studio.outputs.replay && toggleReplay(), saveReplay: () => saveReplay(),
    startVirtualCam: () => !studio.outputs.vcam && toggleVirtualCam(), stopVirtualCam: () => studio.outputs.vcam && toggleVirtualCam(),
    toggleStudio: () => run('toggleStudio'), transition: () => studio.studioTransition(), resetStats: () => studio.resetStats(),
    screenshotOutput: () => screenshot('program'), screenshotSource: () => selSourceId() && screenshot(`source:${selSourceId()}`), toggleMultiview: () => run('multiview'),
  };
  map[action]?.();
});

// ───────────────────────── commands

const toggle = (key) => updateSettings({ [key]: !S()[key] });
const rightTab = (tab) => updateSettings({ rightTab: tab, showRightPanel: true });
const bottomTab = (tab) => updateSettings({ bottomTab: tab, showBottomPanel: true });
const live = () => Boolean(studio.outputs.stream);
const rec = () => Boolean(studio.outputs.recording);
const itemCmd = (fn) => ({ enabled: () => hasSel() && !onStart(), run: fn });

const commands = {
  // file
  newCollection: { icon: 'collectionNew', label: 'action.newCollection', key: 'Ctrl+N', run: () => newCollectionAsk() },
  importCollection: { icon: 'importFile', label: 'action.importCollection', key: 'Ctrl+O', run: () => importCollection() },
  exportCollection: { icon: 'exportFile', label: 'action.exportCollection', key: 'Ctrl+S', run: () => exportCollection() },
  exportCollectionJson: { icon: 'exportJson', label: 'action.exportCollectionJson', run: () => exportCollection({ sceneJson: true }) },
  duplicateCollection: { icon: 'copy', label: 'action.duplicateCollection', run: () => duplicateCollectionAsk() },
  renameCollection: { icon: 'rename', label: 'action.renameCollection', run: () => renameCollectionAsk() },
  removeCollection: { icon: 'trash', label: 'action.removeCollection', enabled: () => studio.collections.names.length > 1, run: () => removeCollectionAsk() },
  collectionMenu: { icon: 'collection', label: 'action.collectionMenu', run: (ctx) => collectionsMenu(ctx?.anchor) },
  newProfile: { icon: 'profileNew', label: 'action.newProfile', run: () => newProfileAsk() },
  duplicateProfile: { icon: 'copy', label: 'action.duplicateProfile', run: () => newProfileAsk({ copy: true }) },
  renameProfile: { icon: 'rename', label: 'action.renameProfile', run: () => renameProfileAsk() },
  removeProfile: { icon: 'trash', label: 'action.removeProfile', enabled: () => studio.profiles.list.length > 1 && !studio.isLive, run: () => removeProfileAsk() },
  importProfile: { icon: 'importFile', label: 'action.importProfile', run: () => importProfile() },
  exportProfile: { icon: 'exportFile', label: 'action.exportProfile', run: () => exportProfile() },
  profileMenu: { icon: 'profile', label: 'action.profileMenu', run: (ctx) => profilesMenu(ctx?.anchor) },
  showRecordings: { icon: 'folderOpen', label: 'action.showRecordings', enabled: () => desktop, run: async () => { const dir = await studio.recordingFolder(studio.profile.output.mode === 'simple' ? studio.profile.output.simple.recPath : studio.profile.output.record.path); if (dir) native.openExternal(dir).catch((e) => showError('error.openExternal', e, dir)); } },
  remux: { icon: 'remux', label: 'tool.remux', run: () => openForm('remux') },
  print: { icon: 'print', label: 'action.print', key: 'Ctrl+P', run: () => printReport() },
  startPage: { icon: 'home', label: 'action.startPage', key: 'Ctrl+Shift+H', checked: () => state.showStart, run: () => showStartPage(!state.showStart) },
  recent: { icon: 'recent', label: 'action.recent', key: 'Ctrl+R', run: () => popups.open('recent', {}) },
  exit: { icon: 'exit', label: 'action.exit', key: isMac ? 'Ctrl+Q' : 'Alt+F4', run: () => requestExit() },
  // edit
  undo: { icon: 'undo', label: 'action.undo', key: 'Ctrl+Z', enabled: () => studio.canUndo && !onStart(), run: () => { const l = studio.undo(); if (l) notify('info', t('notice.undone', { label: t(`op.${l.split(':')[0]}`, null, l) })); } },
  redo: { icon: 'redo', label: 'action.redo', key: 'Ctrl+Y', enabled: () => studio.canRedo && !onStart(), run: () => { const l = studio.redo(); if (l) notify('info', t('notice.redone', { label: t(`op.${l.split(':')[0]}`, null, l) })); } },
  copyItems: { icon: 'copy', label: 'action.copy', key: 'Ctrl+C', ...itemCmd(() => notify('info', t('notice.copiedItems', { count: studio.copyItems() }))) },
  pasteItems: { icon: 'paste', label: 'action.pasteReference', key: 'Ctrl+V', enabled: () => Boolean(studio.clipboard?.items?.length) && !onStart(), run: () => studio.pasteItems() },
  pasteDuplicate: { icon: 'pasteCopy', label: 'action.pasteDuplicate', enabled: () => Boolean(studio.clipboard?.items?.length) && !onStart(), run: () => studio.pasteItems({ duplicate: true }) },
  copyFilters: { icon: 'copyFilters', label: 'action.copyFilters', enabled: () => Boolean(selSourceId()), run: () => { studio.copyFilters(selSourceId()); notify('info', t('notice.filtersCopied')); renderRight(); } },
  pasteFilters: { icon: 'pasteFilters', label: 'action.pasteFilters', enabled: () => Boolean(studio.filterClip && selSourceId()), run: () => notify('info', t('notice.filtersPasted', { count: studio.pasteFilters(selSourceId()) })) },
  copyTransform: { icon: 'copyTransform', label: 'action.copyTransform', ...itemCmd(() => studio.copyTransform(selItem().id)) },
  pasteTransform: { icon: 'pasteTransform', label: 'action.pasteTransform', enabled: () => Boolean(studio.transformClip) && hasSel(), run: () => studio.pasteTransform() },
  removeItems: { icon: 'trash', label: 'action.removeItems', key: 'Delete', ...itemCmd(() => removeItemsAsk()) },
  renameItem: { icon: 'rename', label: 'action.renameSource', key: 'F2', enabled: () => Boolean(selSourceId()), run: () => renameItemAsk() },
  editTransform: { icon: 'transform', label: 'action.editTransform', key: 'Ctrl+E', ...itemCmd(() => rightTab('transform')) },
  'tf:fit': { icon: 'fitScreen', label: 'transform.cmd.fit', key: 'Ctrl+F', ...itemCmd(() => studio.transformSelected('fit')) },
  'tf:stretch': { icon: 'stretchScreen', label: 'transform.cmd.stretch', ...itemCmd(() => studio.transformSelected('stretch')) },
  'tf:center': { icon: 'centerScreen', label: 'transform.cmd.center', key: 'Ctrl+D', ...itemCmd(() => studio.transformSelected('center')) },
  'tf:centerH': { icon: 'centerH', label: 'transform.cmd.centerH', ...itemCmd(() => studio.transformSelected('centerH')) },
  'tf:centerV': { icon: 'centerV', label: 'transform.cmd.centerV', ...itemCmd(() => studio.transformSelected('centerV')) },
  'tf:flipH': { icon: 'flipH', label: 'transform.cmd.flipH', ...itemCmd(() => studio.transformSelected('flipH')) },
  'tf:flipV': { icon: 'flipV', label: 'transform.cmd.flipV', ...itemCmd(() => studio.transformSelected('flipV')) },
  'tf:rotCW': { icon: 'rotateCw', label: 'transform.cmd.rotCW', ...itemCmd(() => studio.transformSelected('rotCW')) },
  'tf:rotCCW': { icon: 'rotateCcw', label: 'transform.cmd.rotCCW', ...itemCmd(() => studio.transformSelected('rotCCW')) },
  'tf:rot180': { icon: 'rotate180', label: 'transform.cmd.rot180', ...itemCmd(() => studio.transformSelected('rot180')) },
  'tf:reset': { icon: 'reset', label: 'transform.cmd.reset', key: 'Ctrl+Shift+R', ...itemCmd(() => studio.transformSelected('reset')) },
  'tf:boundsFit': { icon: 'boundsFit', label: 'transform.cmd.boundsFit', ...itemCmd(() => studio.transformSelected('boundsFit')) },
  itemUp: { icon: 'arrowUp', label: 'action.itemUp', key: 'Ctrl+Up', ...itemCmd(() => studio.orderItem(selItem().id, 'up')) },
  itemDown: { icon: 'arrowDown', label: 'action.itemDown', key: 'Ctrl+Down', ...itemCmd(() => studio.orderItem(selItem().id, 'down')) },
  itemTop: { icon: 'toTop', label: 'action.itemTop', key: 'Ctrl+Home', ...itemCmd(() => studio.orderItem(selItem().id, 'top')) },
  itemBottom: { icon: 'toBottom', label: 'action.itemBottom', key: 'Ctrl+End', ...itemCmd(() => studio.orderItem(selItem().id, 'bottom')) },
  toggleVisible: { icon: 'eye', label: 'action.toggleVisible', ...itemCmd(() => studio.toggleVisible(selItem().id)) },
  toggleLock: { icon: 'lock', label: 'action.toggleLock', ...itemCmd(() => studio.setItem(selItem().id, (it) => ({ locked: !it.locked }), 'lockItem')) },
  group: { icon: 'srcGroup', label: 'action.groupSelected', key: 'Ctrl+G', ...itemCmd(() => groupSelected()) },
  ungroup: { icon: 'ungroup', label: 'action.ungroup', enabled: () => Boolean(selItem()?.children), run: () => studio.ungroup(selItem().id) },
  lockPreview: { icon: 'lockPreview', label: 'action.lockPreview', checked: () => S().previewLocked, run: () => toggle('previewLocked') },
  previewEnabled: { icon: 'preview', label: 'action.previewEnabled', checked: () => S().previewEnabled !== false, run: () => { toggle('previewEnabled'); workspace?.destroy(); renderCenter(); } },
  safeAreas: { icon: 'safeAreas', label: 'action.safeAreas', checked: () => S().safeAreas, run: () => toggle('safeAreas') },
  snapping: { icon: 'magnet', label: 'action.snapping', checked: () => S().snap.enabled, run: () => updateSettings({ snap: { ...S().snap, enabled: !S().snap.enabled } }) },
  // scenes
  addScene: { icon: 'sceneAdd', label: 'action.addScene', run: () => addSceneAsk() },
  removeScene: { icon: 'sceneRemove', label: 'action.removeScene', enabled: () => c().scenes.length > 1, run: () => removeSceneAsk() },
  renameScene: { icon: 'rename', label: 'action.renameScene', run: () => renameSceneAsk() },
  duplicateScene: { icon: 'copy', label: 'action.duplicateScene', run: () => duplicateSceneAsk() },
  sceneUp: { icon: 'arrowUp', label: 'action.sceneUp', enabled: () => c().scenes.indexOf(studio.editScene) > 0, run: () => studio.moveScene(studio.editScene.id, c().scenes.indexOf(studio.editScene) - 1) },
  sceneDown: { icon: 'arrowDown', label: 'action.sceneDown', enabled: () => c().scenes.indexOf(studio.editScene) < c().scenes.length - 1, run: () => studio.moveScene(studio.editScene.id, c().scenes.indexOf(studio.editScene) + 1) },
  sceneFilters: { icon: 'filters', label: 'action.sceneFilters', run: () => { studio.selection.items.clear(); studio.selection.source = studio.editScene.id; rightTab('filters'); } },
  sceneProperties: { icon: 'gear', label: 'action.sceneProperties', run: () => { studio.selection.items.clear(); studio.selection.source = studio.editScene.id; rightTab('props'); } },
  sceneScreenshot: { icon: 'screenshot', label: 'action.screenshotScene', run: () => screenshot(`scene:${studio.editScene.id}`) },
  sceneProjector: { icon: 'projector', label: 'action.sceneProjector', run: (ctx) => projectorMenu(ctx?.anchor ?? anchorFor('sceneProjector'), [`scene:${studio.editScene.id}`, t('projector.scene', { name: studio.editScene.name }), 'srcScene']) },
  // sources
  addSourceMenu: { icon: 'sourceAdd', label: 'action.addSource', enabled: () => !onStart(), run: (ctx) => addSourceMenu(ctx?.anchor ?? anchorFor('addSourceMenu')) },
  openProperties: { icon: 'gear', label: 'action.properties', enabled: () => Boolean(selSourceId()), run: () => rightTab('props') },
  openFilters: { icon: 'filters', label: 'action.filters', enabled: () => Boolean(selSourceId()), run: () => rightTab('filters') },
  openAudio: { icon: 'mixer', label: 'action.advancedAudio', enabled: () => Boolean(selSource()?.audio), run: () => rightTab('audio') },
  resetProperties: { icon: 'reset', label: 'action.resetProperties', enabled: () => Boolean(selSource()), run: () => studio.resetSettings(selSource().id) },
  sourceScreenshot: { icon: 'screenshot', label: 'action.screenshotSource', enabled: () => Boolean(selSourceId()), run: () => screenshot(`source:${selSourceId()}`) },
  sourceProjector: { icon: 'projector', label: 'action.sourceProjector', enabled: () => Boolean(selSourceId()), run: (ctx) => projectorMenu(ctx?.anchor ?? anchorFor('sourceProjector'), [`source:${selSourceId()}`, t('projector.source', { name: c().sources[selSourceId()]?.name ?? '' }), 'sources']) },
  interact: { icon: 'interact', label: 'action.interact', enabled: () => selSource()?.type === 'browser_source', checked: () => Boolean(workspace?.interacting), run: () => { if (workspace?.interacting) workspace.setInteract(null); else if (!workspace?.setInteract([...studio.selection.items][0] ?? null)) rightTab('props'); renderAll(); } },
  // outputs
  toggleStream: { icon: 'stream', label: 'action.toggleStream', checked: live, run: (ctx) => (live() ? stopStream(ctx) : startStream(ctx)) },
  startStream: { icon: 'stream', label: 'action.startStream', enabled: () => !live(), run: (ctx) => startStream(ctx) },
  stopStream: { icon: 'streamStop', label: 'action.stopStream', enabled: live, run: (ctx) => stopStream(ctx) },
  viewerLinks: { icon: 'webrtc', label: 'action.viewerLinks', enabled: () => Boolean(studio.outputs.stream?.urls?.length), run: () => showViewerLinks() },
  toggleRecording: { icon: 'record', label: 'action.toggleRecording', checked: rec, run: (ctx) => (rec() ? stopRecording(ctx) : startRecording()) },
  startRecording: { icon: 'record', label: 'action.startRecording', enabled: () => !rec(), run: () => startRecording() },
  stopRecording: { icon: 'recordStop', label: 'action.stopRecording', enabled: rec, run: (ctx) => stopRecording(ctx) },
  togglePause: { icon: 'pause', label: 'action.pauseRecording', enabled: rec, checked: () => Boolean(studio.outputs.recording?.paused), run: () => (studio.outputs.recording?.paused ? studio.resumeRecording() : studio.pauseRecording()) },
  splitRecording: { icon: 'split', label: 'action.splitRecording', enabled: rec, run: () => { studio.splitRecording(); notify('info', t('notice.split')); } },
  addChapter: { icon: 'chapter', label: 'action.addChapter', enabled: rec, run: async () => { const name = await prompt(t('action.addChapter'), t('chapter.name'), t('chapter.default', { n: (studio.outputs.recording?.chapters.length ?? 0) + 1 }), 'chapter'); if (name != null) { studio.addChapter(name); notify('info', t('notice.chapter', { name })); } } },
  toggleReplay: { icon: 'replay', label: 'action.toggleReplay', checked: () => Boolean(studio.outputs.replay), run: () => toggleReplay() },
  startReplay: { icon: 'replay', label: 'action.startReplay', enabled: () => !studio.outputs.replay, run: () => toggleReplay() },
  stopReplay: { icon: 'replayStop', label: 'action.stopReplay', enabled: () => Boolean(studio.outputs.replay), run: () => toggleReplay() },
  saveReplay: { icon: 'replaySave', label: 'action.saveReplay', enabled: () => Boolean(studio.outputs.replay), run: () => saveReplay() },
  toggleVirtualCam: { icon: 'vcam', label: 'action.toggleVirtualCam', checked: () => studio.outputs.vcam, run: () => toggleVirtualCam() },
  screenshotOutput: { icon: 'screenshot', label: 'action.screenshotOutput', key: 'Ctrl+Shift+S', run: () => screenshot('program') },
  // studio
  toggleStudio: { icon: 'studio', label: 'action.studioMode', checked: () => studio.studioMode, run: () => { studio.setStudioMode(!studio.studioMode); workspace?.render(); renderAll(); } },
  studioOn: { icon: 'studio', label: 'action.studioMode', run: () => { if (!studio.studioMode) run('toggleStudio'); } },
  studioOff: { icon: 'studio', label: 'action.studioMode', run: () => { if (studio.studioMode) run('toggleStudio'); } },
  studioTransition: { icon: 'transitionGo', label: 'action.transition', enabled: () => studio.studioMode, run: () => studio.studioTransition() },
  addQuick: { icon: 'plus', label: 'studio.addQuick', run: (ctx) => quickMenu(ctx?.anchor ?? anchorFor('addQuick')) },
  multiview: { icon: 'multiview', label: 'action.multiview', checked: () => S().multiview, run: () => { toggle('multiview'); workspace?.render(); } },
  projectorMenu: { icon: 'projector', label: 'action.projector', run: (ctx) => projectorMenu(ctx?.anchor ?? anchorFor('projectorMenu')) },
  // transitions
  addTransitionMenu: { icon: 'plus', label: 'trn.add', run: (ctx) => addTransitionMenu(ctx?.anchor ?? anchorFor('addTransitionMenu')) },
  removeTransition: { icon: 'minus', label: 'trn.remove', run: () => studio.removeTransition(c().transition) },
  renameTransition: { icon: 'rename', label: 'trn.rename', run: async () => { const tr = M.transitionById(c(), c().transition); const name = tr && (await prompt(t('trn.rename'), t('trn.name'), tr.name, 'rename')); if (name) studio.renameTransition(tr.id, name); } },
  // tools
  statsWindow: { icon: 'stats', label: 'action.statsWindow', run: () => openStats() },
  logWindow: { icon: 'log', label: 'action.logWindow', run: () => openLog() },
  resetStats: { icon: 'reset', label: 'action.resetStats', run: () => { studio.resetStats(); renderBottom(); } },
  outputTimer: { icon: 'timer', label: 'tool.outputTimer', run: () => openForm('outputTimer') },
  sceneSwitcher: { icon: 'switcher', label: 'tool.sceneSwitcher', run: () => openForm('sceneSwitcher') },
  scripts: { icon: 'script', label: 'tool.scripts', run: () => openForm('scripts') },
  captions: { icon: 'captions', label: 'tool.captions', run: () => openForm('captions') },
  websocket: { icon: 'remote', label: 'tool.websocket', run: () => openForm('websocket') },
  autoconfig: { icon: 'wizard', label: 'tool.autoconfig', run: () => openForm('autoconfig') },
  missingFiles: { icon: 'fileMissing', label: 'tool.missingFiles', run: async () => { await runProblems(); bottomTab('problems'); } },
  copyLog: { icon: 'copy', label: 'action.copyLog', run: () => copyText(studio.logLines.map((l) => `${l.at.toISOString()} [${l.level}] ${l.text}`).join('\n')) },
  saveLog: { icon: 'save', label: 'action.saveLog', run: () => saveLog() },
  clearLog: { icon: 'clearHistory', label: 'action.clearLog', run: () => { studio.logLines = []; renderBottom(); } },
  // view
  leftPanel: { icon: 'panelLeft', label: 'action.leftPanel', key: 'Ctrl+Shift+1', checked: () => S().showLeftPanel, run: () => toggle('showLeftPanel') },
  rightPanel: { icon: 'panelRight', label: 'action.rightPanel', key: 'Ctrl+Shift+2', checked: () => S().showRightPanel, run: () => toggle('showRightPanel') },
  bottomPanel: { icon: 'panelBottom', label: 'action.bottomPanel', key: 'Ctrl+J', checked: () => S().showBottomPanel, run: () => toggle('showBottomPanel') },
  statusBar: { icon: 'statusBar', label: 'action.statusBar', checked: () => S().showStatusBar, run: () => toggle('showStatusBar') },
  mixerLayout: { icon: 'mixerVertical', label: 'action.mixerLayout', checked: () => S().mixerLayout === 'vertical', run: () => updateSettings({ mixerLayout: S().mixerLayout === 'vertical' ? 'horizontal' : 'vertical' }) },
  mixerHidden: { icon: 'eye', label: 'action.mixerShowHidden', checked: () => S().mixerShowHidden, run: () => toggle('mixerShowHidden') },
  ...Object.fromEntries(Panels.RIGHT_TABS.map((id) => [`right:${id}`, { icon: { props: 'gear', filters: 'filters', transform: 'transform', audio: 'mixer' }[id], label: `right.${id}`, checked: () => S().rightTab === id, run: () => rightTab(id) }])),
  ...Object.fromEntries(Panels.BOTTOM_TABS.map((id) => [`bottom:${id}`, { icon: Panels.BOTTOM_ICONS[id], label: `bottom.${id}`, checked: () => S().bottomTab === id, run: () => bottomTab(id) }])),
  theme: { icon: 'palette', label: 'action.themeRandom', run: () => updateSettings({ theme: randomThemeId(S().theme) }) },
  themeMenu: { icon: 'chevronDown', label: 'action.themeChoose', run: (ctx) => openThemePicker(ctx?.anchor) },
  language: { icon: 'globe', label: 'action.language', key: 'Ctrl+Shift+L', run: () => updateSettings({ language: getLanguage() === 'ko' ? 'en' : 'ko' }) },
  shuffleBackground: { icon: 'dice', label: 'action.shuffleBackground', key: 'Ctrl+Shift+B', run: () => shuffleBackground() },
  backgroundImage: { icon: 'imageBg', label: 'action.backgroundImage', run: () => chooseBackground() },
  clearBackground: { icon: 'imageClear', label: 'action.clearBackground', enabled: () => Boolean(S().backgroundImage) || S().backgroundKind !== 'none', run: () => removeBackground() },
  // help
  welcome: { icon: 'bulb', label: 'action.welcome', run: () => openWelcome() },
  tutorial: { icon: 'tutorial', label: 'action.tutorial', key: 'F11', run: () => startTutorial() },
  userGuide: { icon: 'userGuide', label: 'action.userGuide', run: () => openDocWindow('guide') },
  tutorialDoc: { icon: 'tutorialDoc', label: 'action.tutorialDoc', run: () => openDocWindow('tutorial') },
  features: { icon: 'featureList', label: 'action.features', run: () => { updateSettings({ report: 'features' }, { quiet: true }); printReport(); } },
  shortcuts: { icon: 'keyboard', label: 'action.shortcuts', run: () => popups.open('settings', { tab: 'shortcuts' }) },
  hotkeys: { icon: 'keyboard', label: 'action.hotkeys', run: () => popups.open('settings', { tab: 'hotkeys' }) },
  settings: { icon: 'gear', label: 'action.settings', key: 'Ctrl+,', run: (ctx) => popups.open('settings', { tab: ctx?.tab ?? 'general' }) },
  about: { icon: 'info', label: 'action.about', key: 'F1', run: () => popups.open('about') },
};

function commandEnabled(id) { const cmd = commands[id]; return Boolean(cmd) && (cmd.enabled ? Boolean(cmd.enabled()) : true); }
function commandTip(id) {
  const cmd = commands[id];
  if (!cmd) return id;
  const label = id === 'toggleStream' ? t(live() ? 'action.stopStream' : 'action.startStream') : id === 'toggleRecording' ? t(rec() ? 'action.stopRecording' : 'action.startRecording') : t(cmd.label);
  const tip = t(`tip.${id.replace(':', '.')}`, null, '');
  return `${label}${cmd.key ? ` (${keyLabel(cmd.key)})` : ''}${tip ? ` — ${tip}` : ''}`;
}
async function run(id, context) {
  const cmd = commands[id];
  if (!cmd || !commandEnabled(id)) return undefined;
  try { const r = await cmd.run(context); renderLater(); return r; } catch (error) { return showError('error.command', error, t(cmd.label)); }
}

// ───────────────────────── menus

const SUBMENUS = {
  collections: { icon: 'collection', items: ['newCollection', 'duplicateCollection', 'renameCollection', 'removeCollection', '-', 'importCollection', 'exportCollection', 'exportCollectionJson'] },
  profiles: { icon: 'profile', items: ['newProfile', 'duplicateProfile', 'renameProfile', 'removeProfile', '-', 'importProfile', 'exportProfile'] },
  transform: { icon: 'transform', items: ['editTransform', 'copyTransform', 'pasteTransform', '-', 'tf:reset', 'tf:rotCW', 'tf:rotCCW', 'tf:rot180', '-', 'tf:flipH', 'tf:flipV', '-', 'tf:fit', 'tf:stretch', 'tf:center', 'tf:centerH', 'tf:centerV', 'tf:boundsFit'] },
  order: { icon: 'order', items: ['itemUp', 'itemDown', 'itemTop', 'itemBottom'] },
  panels: { icon: 'panelLeft', items: ['leftPanel', 'rightPanel', 'bottomPanel', 'statusBar', '-', ...Panels.RIGHT_TABS.map((x) => `right:${x}`), '-', ...Panels.BOTTOM_TABS.map((x) => `bottom:${x}`)] },
  appearance: { icon: 'palette', items: ['theme', 'themeMenu', 'language', '-', 'shuffleBackground', 'backgroundImage', 'clearBackground'] },
  preview: { icon: 'preview', items: ['previewEnabled', 'lockPreview', 'safeAreas', 'snapping'] },
  mixer: { icon: 'mixer', items: ['mixerLayout', 'mixerHidden'] },
};
const sub = (key) => ({ sub: key });
const MENUS = {
  file: [sub('collections'), sub('profiles'), '-', 'showRecordings', 'remux', '-', 'print', 'features', '-', 'startPage', 'recent', '-', 'settings', 'exit'],
  edit: ['undo', 'redo', '-', 'copyItems', 'pasteItems', 'pasteDuplicate', '-', 'copyFilters', 'pasteFilters', '-', sub('transform'), sub('order'), '-', 'renameItem', 'removeItems', '-', sub('preview')],
  scene: ['addScene', 'duplicateScene', 'renameScene', 'removeScene', '-', 'sceneUp', 'sceneDown', '-', 'sceneProperties', 'sceneFilters', 'sceneScreenshot', 'sceneProjector'],
  source: ['addSourceMenu', '-', 'openProperties', 'openFilters', 'openAudio', 'editTransform', '-', 'toggleVisible', 'toggleLock', 'group', 'ungroup', '-', 'interact', 'sourceScreenshot', 'sourceProjector'],
  controls: ['toggleStream', 'viewerLinks', 'toggleRecording', 'togglePause', 'splitRecording', 'addChapter', '-', 'toggleReplay', 'saveReplay', '-', 'toggleVirtualCam', 'screenshotOutput', '-', 'toggleStudio', 'studioTransition', 'multiview', 'projectorMenu'],
  view: [sub('panels'), sub('mixer'), '-', sub('appearance')],
  tools: ['autoconfig', 'outputTimer', 'sceneSwitcher', 'scripts', 'captions', 'websocket', '-', 'statsWindow', 'logWindow', 'missingFiles', 'remux', '-', 'hotkeys'],
  help: ['welcome', 'tutorial', 'tutorialDoc', 'userGuide', 'features', 'shortcuts', '-', 'settings', 'about'],
};
const MENU_ICONS = { file: 'file', edit: 'edit', scene: 'srcScene', source: 'sources', controls: 'controls', view: 'eye', tools: 'tools', help: 'question' };

const TOOLBAR = [
  ['collectionMenu', 'profileMenu', 'importCollection', 'exportCollection', 'print'],
  ['undo', 'redo'],
  ['addScene', 'addSourceMenu', 'openProperties', 'openFilters', 'editTransform'],
  ['toggleStream', 'toggleRecording', 'togglePause', 'toggleReplay', 'saveReplay', 'toggleVirtualCam', 'screenshotOutput'],
  ['toggleStudio', 'multiview', 'safeAreas', 'lockPreview', 'snapping', 'projectorMenu'],
  ['statsWindow', 'logWindow', 'autoconfig'],
];
const MENUBAR_PANELS = ['leftPanel', 'bottomPanel', 'rightPanel'];
const TOOLBAR_RIGHT = ['tutorial', 'themeSplit', 'language', 'settings', 'about'];
const TOOLBAR_MAIN = { themeSplit: 'theme' };
const ANCHORED = new Set(['themeMenu', 'addSourceMenu', 'collectionMenu', 'profileMenu', 'projectorMenu', 'addTransitionMenu', 'addQuick', 'sceneProjector', 'sourceProjector']);

function collectionsMenu(anchor) {
  const handlers = {};
  const items = studio.collections.names.map((n) => { handlers[`custom:col:${n}`] = () => switchCollection(n); return { id: `custom:col:${n}`, label: n, icon: 'collection', checked: n === studio.collections.current }; });
  return showMenu([...items, { separator: true }, ...menuItems(SUBMENUS.collections.items)], anchor ?? anchorFor('collectionMenu'), 'context', { handlers, header: { icon: 'collection', title: t('submenu.collections') } });
}
function profilesMenu(anchor) {
  const handlers = {};
  const items = studio.profiles.list.map((p) => { handlers[`custom:prof:${p.name}`] = () => { if (!studio.switchProfile(p.name)) notify('warning', t('notice.profileLive')); }; return { id: `custom:prof:${p.name}`, label: p.name, icon: 'profile', checked: p.name === studio.profiles.current }; });
  return showMenu([...items, { separator: true }, ...menuItems(SUBMENUS.profiles.items)], anchor ?? anchorFor('profileMenu'), 'context', { handlers, header: { icon: 'profile', title: t('submenu.profiles') } });
}
function addTransitionMenu(anchor) {
  const handlers = {};
  const items = Object.keys(TRANSITION_TYPES).filter((k) => !TRANSITION_TYPES[k].fixed).map((k) => { handlers[`custom:tr:${k}`] = async () => { const name = await prompt(t('trn.add'), t('trn.name'), t(`trn.${k}`), TRANSITION_TYPES[k].icon); if (name) studio.addTransition(k, name); }; return { id: `custom:tr:${k}`, label: t(`trn.${k}`), icon: TRANSITION_TYPES[k].icon }; });
  return showMenu(items, anchor, 'context', { handlers, header: { icon: 'transitionGo', title: t('trn.add') } });
}
function quickMenu(anchor) {
  const handlers = {};
  const items = c().transitions.map((x) => { handlers[`custom:q:${x.id}`] = () => studio.addQuick(x.id, c().duration); return { id: `custom:q:${x.id}`, label: `${x.name} · ${c().duration} ms`, icon: TRANSITION_TYPES[x.type].icon }; });
  if (c().quick.length) { items.push({ separator: true }); for (const q of c().quick) { handlers[`custom:qr:${q.id}`] = () => studio.removeQuick(q.id); items.push({ id: `custom:qr:${q.id}`, label: t('studio.removeQuick', { name: M.transitionById(c(), q.transition)?.name ?? '?', ms: q.duration }), icon: 'trash' }); } }
  return showMenu(items, anchor, 'context', { handlers, header: { icon: 'transitionGo', title: t('studio.addQuick') } });
}

// ───────────────────────── shell

function renderShell() {
  root.innerHTML = `
    <nav id="menubar" role="menubar"></nav>
    <div id="toolbar" role="toolbar"></div>
    <main id="shell">
      <aside id="left-panel" class="side-panel" aria-label="${escapeHtml(t('panel.left'))}"></aside>
      <div class="splitter vertical panel-split" data-split="left" role="separator" aria-orientation="vertical"></div>
      <section id="center">
        <div id="tabs"></div>
        <div id="center-body">
          <div id="workspace" class="workspace bc-workspace"></div>
          <div id="start-page" hidden></div>
          <div class="drop-overlay" aria-hidden="true"><div>${icon('drop')}<span>${escapeHtml(t('drop.hint'))}</span></div></div>
        </div>
        <div class="splitter horizontal bottom-split" data-split="bottom" title="${escapeHtml(t('bottom.splitter'))}" role="separator" aria-orientation="horizontal"></div>
        <section id="bottom-panel" aria-label="${escapeHtml(t('bottom.title'))}"></section>
      </section>
      <div class="splitter vertical panel-split" data-split="right" role="separator" aria-orientation="vertical"></div>
      <aside id="right-panel" class="side-panel" aria-label="${escapeHtml(t('panel.right'))}"></aside>
    </main>
    <footer id="statusbar" role="status"></footer>
    ${desktop ? `<div class="resize-grip" data-resize-grip title="${escapeHtml(t('tip.resize'))}" role="separator">${icon('grip')}</div>` : `<div class="resize-grip static" aria-hidden="true">${icon('grip')}</div>`}
    <div id="tutorial-layer"></div>`;
}

function renderMenubar() {
  const menubar = root.querySelector('#menubar');
  const home = `<button class="menubar-item menubar-home ${onStart() ? 'current' : ''}" data-home title="${escapeHtml(t('tip.home'))}" aria-pressed="${onStart()}">${icon('home')}<span>${escapeHtml(t('menu.home'))}</span></button><span class="menubar-sep" aria-hidden="true"></span>`;
  const brand = `<div class="app-brand" data-window-drag title="${escapeHtml(`MyBroadcasting v${VERSION}`)}"><img class="app-brand-icon" src="${APP_ICON}" alt="" data-window-drag /><span class="app-brand-name" data-window-drag>MyBroadcasting</span><span class="app-brand-version" data-window-drag>v${escapeHtml(VERSION)}</span></div>`;
  const button = (id, glyph, key) => `<button class="window-button ${id === 'close' ? 'close' : ''}" data-window="${id}" title="${escapeHtml(t(key))}" aria-label="${escapeHtml(t(key))}">${icon(glyph)}</button>`;
  const controls = desktop ? `<div class="window-controls">${button('minimize', 'winMinimize', 'window.minimize')}${state.maximized ? button('maximize', 'winRestore', 'window.restore') : button('maximize', 'winMaximize', 'window.maximize')}${button('close', 'winClose', 'window.close')}</div>` : '';
  const badges = `<span class="menubar-live" data-window-drag>${live() ? `<span class="live-badge" title="${escapeHtml(t('status.live'))}">${icon('stream')}LIVE</span>` : ''}${rec() ? `<span class="rec-badge ${studio.outputs.recording?.paused ? 'paused' : ''}" title="${escapeHtml(t('status.rec'))}">${icon('record')}REC</span>` : ''}</span>`;
  const project = `<span class="menubar-project" data-window-drag title="${escapeHtml(`${t('collection.label')}: ${studio.collections.current} · ${t('profile.label')}: ${studio.profile.name}`)}"><span class="app-brand-project-name" data-window-drag>${escapeHtml(onStart() ? '' : studio.collections.current)}</span></span>`;
  const panels = `<div class="menubar-panels" role="group" aria-label="${escapeHtml(t('submenu.panels'))}">${MENUBAR_PANELS.map((id) => `<button class="tool-button mini menubar-panel" data-command="${id}" title="${escapeHtml(commandTip(id))}" aria-label="${escapeHtml(t(commands[id].label))}" aria-pressed="${Boolean(commands[id].checked())}">${icon(commands[id].icon)}</button>`).join('')}</div>`;
  menubar.innerHTML = brand + home + Object.keys(MENUS).map((name) => `<button class="menubar-item ${state.openMenu === name ? 'open' : ''}" data-menu="${name}" role="menuitem" aria-haspopup="true" title="${escapeHtml(t(`menu.${name}`))}">${icon(MENU_ICONS[name])}<span>${escapeHtml(t(`menu.${name}`))}</span></button>`).join('') + project + badges + `<div class="menubar-drag" data-window-drag></div>${panels}${controls}`;
  const title = `${onStart() ? '' : `${live() ? '● LIVE · ' : rec() ? '● REC · ' : ''}${studio.collections.current} — `}MyBroadcasting v${state.info?.version ?? VERSION}`;
  if (document.title !== title) { document.title = title; if (desktop) appWindow.setTitle(title).catch(() => {}); }
}

function windowButton(id) {
  if (!desktop) return;
  if (id === 'minimize') appWindow.minimize().catch(() => {});
  else if (id === 'maximize') appWindow.toggleMaximize().catch(() => {});
  else if (id === 'close') requestExit();
}

async function trackMaximized() {
  if (!desktop) return;
  const update = async () => { const maximized = await appWindow.isMaximized().catch(() => false); if (maximized !== state.maximized) { state.maximized = maximized; renderMenubar(); } };
  await update();
  appWindow.onResized(() => update()).catch(() => {});
}

let toolbarLanguage = null;
function renderToolbar() {
  const toolbar = root.querySelector('#toolbar');
  toolbarLanguage = getLanguage();
  const plain = (id, extra = '') => {
    const cmd = commands[id];
    const glyph = id === 'language' ? switchFlag(getLanguage()) : icon(cmd.icon);
    const dropdown = ANCHORED.has(id) ? icon('chevronDown', 'icon tiny') : '';
    return `<button class="tool-button ${extra} ${id === 'toggleStream' ? 'tool-live' : id === 'toggleRecording' ? 'tool-rec' : ''}" data-command="${id}" title="${escapeHtml(commandTip(id))}" aria-label="${escapeHtml(t(cmd.label))}">${glyph}${dropdown}</button>`;
  };
  const split = (main, arrow, label) => `<span class="split-button">${plain(main)}<button class="tool-button split-arrow" data-command="${arrow}" title="${escapeHtml(commandTip(arrow))}" aria-label="${escapeHtml(t(label))}" aria-haspopup="true">${icon('chevronDown')}</button></span>`;
  const button = (id) => (id === 'themeSplit' ? split('theme', 'themeMenu', 'action.themeChoose') : plain(id));
  toolbar.innerHTML = `<div class="toolbar-inner">
    <div class="toolbar-left">${TOOLBAR.map((group, i) => `${i ? `<span class="tool-sep" data-group-sep="${i}" aria-hidden="true"></span>` : ''}<div class="tool-group" data-group="${i}">${group.map(button).join('')}</div>`).join('')}<button class="tool-button toolbar-more" data-toolbar-more hidden title="${escapeHtml(t('toolbar.more'))}" aria-label="${escapeHtml(t('toolbar.more'))}" aria-haspopup="true">${icon('toolbarMore')}</button></div>
    <span class="grow"></span>
    <div class="toolbar-right tool-group">${TOOLBAR_RIGHT.map(button).join('')}</div>
  </div>`;
  renderToolbarState();
  updateMinimumWidth();
  fitToolbar();
}

function fitToolbar() {
  const inner = root.querySelector('.toolbar-inner');
  const left = root.querySelector('.toolbar-left');
  const right = root.querySelector('.toolbar-right');
  const more = root.querySelector('[data-toolbar-more]');
  if (!inner || !left || !right || !more) return;
  const groups = [...left.querySelectorAll('[data-group]')];
  for (const el of left.querySelectorAll('[data-group], [data-group-sep]')) el.hidden = false;
  more.hidden = true;
  const room = inner.clientWidth - right.offsetWidth - 12;
  if (left.scrollWidth <= room) { state.toolbarHidden = []; return; }
  more.hidden = false;
  const limit = room - more.offsetWidth - 6;
  const start = left.getBoundingClientRect().left;
  let cut = groups.length;
  for (const [i, g] of groups.entries()) if (g.getBoundingClientRect().right - start > limit) { cut = Math.max(1, i); break; }
  for (const el of left.querySelectorAll('[data-group], [data-group-sep]')) el.hidden = Number(el.dataset.group ?? el.dataset.groupSep) >= cut;
  state.toolbarHidden = TOOLBAR.slice(cut);
}
function showToolbarMore(button) {
  const ids = state.toolbarHidden.flatMap((group, i) => [...(i ? ['-'] : []), ...group.map((id) => TOOLBAR_MAIN[id] ?? id)]).filter((id) => id === '-' || commands[id]);
  if (ids.length) showMenu(menuItems(ids), anchorBelow(button));
}

function renderToolbarState() {
  for (const el of root.querySelectorAll('#toolbar [data-command], #menubar [data-command], #tabs [data-command], #left-panel [data-command], #bottom-panel [data-command], #right-panel [data-command]')) {
    const id = el.dataset.command;
    if (!commands[id]) continue;
    el.disabled = !commandEnabled(id);
    const checked = commands[id]?.checked?.();
    el.classList.toggle('active', Boolean(checked));
    if (checked !== undefined) el.setAttribute('aria-pressed', String(Boolean(checked)));
    if (el.closest('#toolbar')) el.title = commandTip(id);
  }
  const undoBtn = root.querySelector('#toolbar [data-command="undo"]');
  if (undoBtn && studio.canUndo) undoBtn.title = `${commandTip('undo')}: ${t(`op.${studio.undoLabel?.split(':')[0]}`, null, studio.undoLabel)}`;
  const redoBtn = root.querySelector('#toolbar [data-command="redo"]');
  if (redoBtn && studio.canRedo) redoBtn.title = `${commandTip('redo')}: ${t(`op.${studio.redoLabel?.split(':')[0]}`, null, studio.redoLabel)}`;
}

function updateMinimumWidth() {
  const right = root.querySelector('.toolbar-right');
  if (!right) return;
  requestAnimationFrame(() => {
    const menus = [...root.querySelectorAll('.app-brand, .menubar-item, .menubar-panels, .window-controls')].reduce((sum, el) => sum + el.offsetWidth + 2, 48);
    const width = Math.ceil(Math.max(menus, right.scrollWidth + 360));
    const min = Math.min(window.screen?.availWidth || Infinity, Math.max(width, 980));
    if (Math.abs(min - state.minWidth) < 1) return;
    state.minWidth = min;
    document.documentElement.style.setProperty('--min-width', `${min}px`);
    native.setMinimumSize(min, 640).catch(() => {});
  });
}

/** Above the workspace: the collection and profile, the edited scene, studio-mode and multiview switches. */
function renderTabs() {
  const tabs = root.querySelector('#tabs');
  if (onStart()) { tabs.innerHTML = ''; return; }
  tabs.innerHTML = `<div class="tab-strip">
      <button class="ws-crumb" data-command="collectionMenu" title="${escapeHtml(t('submenu.collections'))}">${icon('collection')}<b>${escapeHtml(studio.collections.current)}</b>${icon('chevronDown', 'icon tiny')}</button>
      <button class="ws-crumb" data-command="profileMenu" title="${escapeHtml(t('submenu.profiles'))}">${icon('profile')}<span>${escapeHtml(studio.profile.name)}</span>${icon('chevronDown', 'icon tiny')}</button>
      <span class="ws-crumb muted">${icon('srcScene')}<span>${escapeHtml(studio.editScene.name)}</span></span>
      <span class="ws-crumb muted" title="${escapeHtml(t('status.canvas'))}">${icon('canvasSize')}<span>${escapeHtml(`${studio.profile.video.base} → ${studio.profile.video.output} · ${studio.profile.video.fps} fps`)}</span></span>
    </div><span class="grow"></span>
    <div class="tabs-right"><span class="seg-toggle" role="tablist">
      <button class="${!studio.studioMode && !S().multiview ? 'active' : ''}" data-view="single" title="${escapeHtml(t('view.single'))}">${icon('preview')}<span>${escapeHtml(t('view.single'))}</span></button>
      <button class="${studio.studioMode && !S().multiview ? 'active' : ''}" data-view="studio" title="${escapeHtml(t('view.studio'))}">${icon('studio')}<span>${escapeHtml(t('view.studio'))}</span></button>
      <button class="${S().multiview ? 'active' : ''}" data-view="multiview" title="${escapeHtml(t('view.multiview'))}">${icon('multiview')}<span>${escapeHtml(t('view.multiview'))}</span></button></span></div>`;
}

function setView(view) {
  if (view === 'multiview') { if (!S().multiview) updateSettings({ multiview: true }); }
  else { if (S().multiview) updateSettings({ multiview: false }, { quiet: true }); if ((view === 'studio') !== studio.studioMode) studio.setStudioMode(view === 'studio'); }
  workspace?.render();
  renderAll();
}

function renderCenter() {
  renderTabs();
  if (!onStart() && state.welcomeOpen) { state.welcomeOpen = false; popups.close('welcome'); }
  if (onStart()) { workspace?.destroy(); return; }
  if (!workspace) workspace = new Workspace(root.querySelector('#workspace'), studio, { settings: () => S(), contextMenu, openProperties: (id) => { studio.selection.source = id; rightTab('props'); }, notify, transformLive: () => scheduleRight() });
  workspace.render();
}

/** The collapse button at the right end of a panel's first header / tab row (the rail shows the expand button). */
const collapseButton = (command, glyph, key) => `<button class="icon-button panel-collapse" data-command="${command}" title="${escapeHtml(t(key))}" aria-label="${escapeHtml(t(key))}">${icon(glyph)}</button>`;

function renderLeft() {
  const panel = root.querySelector('#left-panel');
  if (!panel || onStart()) return;
  if (!S().showLeftPanel) { panel.innerHTML = `<div class="panel-rail"><button class="rail-button expand" data-command="leftPanel" title="${escapeHtml(t('panel.expandLeft'))}">${icon('panelLeftOpen')}<span class="rail-label">${escapeHtml(t('panel.expand'))}</span></button><div class="rail-title">${icon('srcScene')}<span>${escapeHtml(t('panel.leftShort'))}</span></div></div>`; return; }
  const scroll = [...panel.querySelectorAll('.dock-list')].map((x) => x.scrollTop);
  panel.innerHTML = `<div class="left-docks" style="--quick: ${S().quickAddOpen === false ? '34px' : 'auto'}">${Panels.scenesHtml(studio, collapseButton('leftPanel', 'panelLeftClose', 'panel.collapseLeft'))}<div class="splitter horizontal dock-split" data-split="docks"></div>${Panels.sourcesHtml(studio)}${Panels.quickAddHtml(S().quickAddOpen !== false)}</div>`;
  panel.style.setProperty('--scenes-share', `${S().explorerHeight}%`);
  [...panel.querySelectorAll('.dock-list')].forEach((x, i) => { x.scrollTop = scroll[i] ?? 0; });
}

let rightTimer = 0;
let leftTimer = 0;
function scheduleRight() { if (rightTimer) return; rightTimer = setTimeout(() => { rightTimer = 0; if (document.activeElement?.closest?.('#right-panel input, #right-panel textarea')) return; renderRight(); }, 120); }
function renderRight() {
  const panel = root.querySelector('#right-panel');
  if (!panel || onStart()) return;
  if (!S().showRightPanel) { panel.innerHTML = `<div class="panel-rail"><button class="rail-button expand" data-command="rightPanel" title="${escapeHtml(t('panel.expandRight'))}">${icon('panelRightOpen')}<span class="rail-label">${escapeHtml(t('panel.expand'))}</span></button><div class="rail-title">${icon('gear')}<span>${escapeHtml(t('panel.rightShort'))}</span></div></div>`; return; }
  const scroll = panel.querySelector('.right-body')?.scrollTop ?? 0;
  const focusKey = document.activeElement?.closest?.('#right-panel') ? document.activeElement.dataset.key ?? document.activeElement.closest('.stepper')?.dataset.stepper : null;
  panel.innerHTML = `<div class="right-dock">${Panels.rightHtml(studio, S().rightTab, { ...formCtx(), sys: state.sys, collapse: collapseButton('rightPanel', 'panelRightClose', 'panel.collapseRight') })}</div>`;
  const body = panel.querySelector('.right-body');
  if (body) body.scrollTop = scroll;
  if (focusKey) panel.querySelector(`[data-key="${CSS.escape(focusKey)}"], [data-stepper="${CSS.escape(focusKey)}"] input`)?.focus();
}

function renderBottom() {
  const host = root.querySelector('#bottom-panel');
  if (!host) return;
  if (!S().showBottomPanel || onStart()) { host.innerHTML = ''; return; }
  const tab = S().bottomTab;
  const counts = { problems: state.problems.length, messages: studio.logLines.length, mixer: Object.values(c().sources).filter((s) => s.audio && s.type !== 'group').length };
  const tabHtml = `<span class="segmented" role="tablist">${Panels.BOTTOM_TABS.map((id) => `<button class="segment ${tab === id ? 'active' : ''}" data-bottom-tab="${id}" role="tab" aria-selected="${tab === id}" title="${escapeHtml(t(`bottom.${id}`))}">${icon(Panels.BOTTOM_ICONS[id])}<span>${escapeHtml(t(`bottom.${id}`))}</span>${counts[id] != null ? `<i class="bottom-count">${counts[id]}</i>` : ''}</button>`).join('')}</span>`;
  const body = {
    mixer: () => Panels.mixerHtml(studio, S()), transitions: () => Panels.transitionsHtml(studio), controls: () => Panels.controlsHtml(studio), media: () => Panels.mediaDockHtml(studio),
    stats: () => Panels.statsHtml(studio, state.sys), messages: () => Panels.messagesHtml(studio.logLines, state.logFilter), problems: () => Panels.problemsHtml(state.problems),
  }[tab]?.() ?? '';
  const scroll = host.querySelector('.bottom-body')?.scrollTop ?? 0;
  const tools = tab === 'mixer' ? `<button class="icon-button" data-command="mixerLayout" title="${escapeHtml(commandTip('mixerLayout'))}">${icon('mixerVertical')}</button><button class="icon-button" data-command="mixerHidden" title="${escapeHtml(commandTip('mixerHidden'))}">${icon('eye')}</button>` : tab === 'problems' ? `<button class="small-button" data-command="missingFiles">${icon('refresh')}<span>${escapeHtml(t('bottom.problemsRefresh'))}</span></button>` : '';
  host.innerHTML = `<div class="problems-header">${tabHtml}<span class="grow"></span>${tools}<button class="icon-button" data-command="bottomPanel" title="${escapeHtml(t('bottom.hide'))}">${icon('close')}</button></div><div class="bottom-body bottom-${tab}" tabindex="0">${body}</div>`;
  host.querySelector('.bottom-body').scrollTop = scroll;
}

function renderStatus() {
  const bar = root.querySelector('#statusbar');
  if (!bar) return;
  const s = S();
  const notice = state.notice;
  const hint = notice?.text ?? t('status.ready');
  const items = [`<span class="status-notice ${notice?.kind ?? 'hint'}" title="${escapeHtml(hint)}">${icon(notice?.kind === 'error' ? 'error' : notice?.kind === 'success' ? 'check' : 'info')}<span>${escapeHtml(hint)}</span></span>`];
  if (!onStart()) {
    const st = studio.stats();
    const sys = state.sys;
    items.push(`<span class="status-item ${st.stream ? 'live' : 'off'}" title="${escapeHtml(t('status.streamTime'))}">${icon('stream')}<span>${st.stream ? `${t(`out.state.${st.stream.state}`)} ${fmt(st.stream.seconds)}` : fmt(0)}</span></span>`);
    if (st.stream) items.push(`<span class="status-item" title="${escapeHtml(t('status.bitrate'))}">${icon('bitrate')}<span>${Math.round(st.stream.kbps)} kb/s · ${t('stats.dropped')} ${st.stream.dropped}</span></span>`);
    items.push(`<span class="status-item ${st.recording ? (st.recording.paused ? 'warn' : 'rec') : 'off'}" title="${escapeHtml(t('status.recTime'))}">${icon('record')}<span>${st.recording ? `${st.recording.paused ? t('out.state.paused') : 'REC'} ${fmt(st.recording.seconds)}` : fmt(0)}</span></span>`);
    if (st.replay) items.push(`<span class="status-item" title="${escapeHtml(t('stats.replay'))}">${icon('replay')}<span>${st.replay.seconds.toFixed(0)} s</span></span>`);
    items.push(`<button class="status-item" data-command="statsWindow" title="${escapeHtml(t('status.fps'))}">${icon('fps')}<span>${st.fps.toFixed(0)} / ${Math.round(st.target)} fps · ${st.renderMs.toFixed(1)} ms</span></button>`);
    if (sys?.cpu != null) items.push(`<span class="status-item" title="${escapeHtml(t('stats.cpu'))}">${icon('cpu')}<span>CPU ${sys.cpu.toFixed(0)}%</span></span>`);
    const sev = { error: state.problems.filter((p) => p.severity === 'error').length, warning: state.problems.filter((p) => p.severity === 'warning').length, info: state.problems.filter((p) => p.severity === 'info').length };
    items.push(`<button class="status-item status-problems" data-command="bottom:problems" title="${escapeHtml(t('status.problemsTip', sev))}">${['error', 'warning', 'info'].map((k) => `<span class="sev-${k} ${sev[k] ? '' : 'zero'}">${icon(k)}<b>${sev[k]}</b></span>`).join('')}</button>`);
  }
  items.push(`<span class="status-item" title="${escapeHtml(t('status.theme', { name: themeName(s.theme, getLanguage()) }))}">${icon('palette')}<span>${escapeHtml(themeName(s.theme, getLanguage()))}</span></span>`);
  items.push(`<span class="status-item" title="${escapeHtml(t('status.language'))}">${icon('globe')}<span>${escapeHtml(t('status.language'))}</span></span>`);
  if (s.statusClock) items.push(`<span class="status-item clock" title="${escapeHtml(t('status.clock'))}">${icon('clock')}<span id="status-clock">${escapeHtml(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))}</span></span>`);
  bar.innerHTML = items.join('');
}

let renderQueued = false;
function renderLater() { if (renderQueued) return; renderQueued = true; queueMicrotask(() => { renderQueued = false; renderAll(); }); }

function renderAll() {
  root.classList.toggle('no-status', !S().showStatusBar);
  root.classList.toggle('no-left', !S().showLeftPanel);
  root.classList.toggle('no-right', !S().showRightPanel);
  root.classList.toggle('on-start', onStart());
  root.classList.toggle('no-bottom', !S().showBottomPanel);
  root.classList.toggle('is-live', live());
  root.style.setProperty('--bottom-height', `${S().bottomHeight}px`);
  root.style.setProperty('--left-width', `${S().leftWidth}px`);
  root.style.setProperty('--right-width', `${S().rightWidth}px`);
  root.style.setProperty('--zoom', String(S().zoom / 100));
  renderMenubar();
  if (toolbarLanguage !== getLanguage()) renderToolbar(); else renderToolbarState();
  const startHost = root.querySelector('#start-page');
  startHost.hidden = !onStart();
  root.querySelector('#workspace').hidden = onStart();
  renderCenter();
  renderLeft();
  renderRight();
  renderBottom();
  renderStatus();
  renderToolbarState();
  if (onStart()) renderStartPage(); else { startCards?.destroy(); startCards = null; startBackground?.destroy(); startBackground = null; startHost.innerHTML = ''; }
  updateBackgroundState();
}

// ───────────────────────── start page

let startCards = null;
let startBackground = null;
function renderStartPage() {
  const host = root.querySelector('#start-page');
  if (!host || host.hidden) return;
  const scrollTop = host.querySelector('.start-scroll')?.scrollTop ?? 0;
  startCards?.destroy();
  host.innerHTML = startPageHtml(panelApi);
  startCards = startBoard(host.querySelector('.start-board'), { saved: S().startLayout, reduced: Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches), onSave: (layout) => { state.settings.startLayout = layout; storeSettings(globalThis.localStorage, state.settings); } });
  host.querySelector('.start-scroll').scrollTop = scrollTop;
  for (const holder of host.querySelectorAll('.start-speed')) syncSliderSteps(holder);
  const canvas = host.querySelector('.start-bg');
  const carry = startBackground ? { time: startBackground.time, kind: startBackground.kind } : null;
  startBackground?.destroy();
  startBackground = new AnimatedBackground(canvas, { colors: backgroundColors, speed: () => S().animationSpeed / 100, kind: S().animation, vivid: true });
  if (carry && carry.kind === startBackground.kind) startBackground.time = carry.time;
  if (S().backgroundKind === 'animated') startBackground.start(); else startBackground.draw();
  canvas.classList.toggle('static', S().backgroundKind !== 'animated');
  host.querySelector('.start-scroll').style.setProperty('--start-image', state.backgroundUrl && S().backgroundKind === 'image' ? `url("${state.backgroundUrl}")` : 'none');
  host.classList.toggle('with-image', Boolean(state.backgroundUrl) && S().backgroundKind === 'image');
}
function syncSliderSteps(holder) {
  const input = holder?.querySelector('input[type="range"]');
  if (!input) return;
  for (const button of holder.querySelectorAll('[data-slider-step]')) button.disabled = Number(button.dataset.sliderStep) < 0 ? Number(input.value) <= Number(input.min) : Number(input.value) >= Number(input.max);
}
function showStartPage(show = true) {
  state.showStart = show;
  if (!show) studio.startAudio().catch(() => {});
  renderAll();
}

async function onStartAction(target) {
  const value = target.dataset.value;
  switch (target.dataset.start) {
    case 'new-collection': return newCollectionAsk();
    case 'import': return importCollection();
    case 'sample': studio.loadSample(value); showStartPage(false); return notify('success', t('notice.sampleLoaded', { name: t(`sample.${value}`) }));
    case 'open-collection': return switchCollection(value);
    case 'open-recent': return openRecent(value);
    case 'remove-recent': return forgetRecent(value);
    case 'clear-recent': state.recent = []; storeRecent(globalThis.localStorage, []); return renderStartPage();
    case 'arrange': return startCards?.arrange();
    case 'start-settings': return popups.open('settings', { tab: 'start' });
    case 'settings': return run('settings');
    case 'autoconfig': return run('autoconfig');
    case 'continue': return showStartPage(false);
    case 'about': return run('about');
    case 'exit': return run('exit');
    case 'help-menu': return showMenu(menuItems(MENUS.help), anchorBelow(target), 'help');
    case 'tutorial': return startTutorial();
    case 'guide': return openDocWindow('guide');
    case 'tutorial-doc': return openDocWindow('tutorial');
    case 'animation': updateSettings({ animation: value, backgroundKind: 'animated' }); return notify('info', t('notice.animation', { name: t(`animation.${value}`) }));
    case 'shuffle': return shuffleBackground();
    case 'background-image': return chooseBackground();
    default: return undefined;
  }
}

function backgroundColors() {
  const theme = resolveTheme(S().theme, prefersDark(), S().customTheme);
  return { bg: theme.colors.bg, accent: theme.colors.accent, text: theme.colors.text, dark: theme.dark, danger: '#e5484d' };
}
function updateBackgroundState() {
  const s = S();
  startBackground?.setKind(s.animation);
  if (onStart() && startBackground) { if (s.backgroundKind === 'animated') startBackground.start(); else { startBackground.stop(); startBackground.draw(); } }
  else startBackground?.stop();
}
let startBackgroundChangedAt = Date.now();
function randomAnimation(current) { const others = ANIMATIONS.filter((k) => k !== current); return others[Math.floor(Math.random() * others.length)]; }
function tickStartBackground() {
  const s = S();
  const showing = onStart() && s.backgroundKind === 'animated' && s.animationInterval > 0 && !document.hidden && !tutorial?.state().active;
  if (!showing) { startBackgroundChangedAt = Date.now(); return; }
  if (Date.now() - startBackgroundChangedAt >= s.animationInterval * 1000) { startBackgroundChangedAt = Date.now(); updateSettings({ animation: randomAnimation(s.animation) }, { quiet: true }); startBackground?.setKind(state.settings.animation); }
}
function shuffleBackground() { const next = startBackground?.shuffle() ?? randomAnimation(S().animation); updateSettings({ animation: next, backgroundKind: 'animated' }); notify('info', t('notice.animation', { name: t(`animation.${next}`) })); }
async function loadBackground() {
  try { state.backgroundUrl = await native.backgroundUrl(S()); } catch (error) { state.backgroundUrl = null; showError('error.background', error); }
  if (onStart()) renderStartPage();
}
async function chooseBackground() {
  try {
    if (desktop) { const path = await native.chooseImage(S().lastDirectory); if (path) { const stored = await withProgress('progress.background', baseName(path), (op) => native.importBackground(path, op)); updateSettings({ backgroundImage: stored, backgroundName: baseName(path), backgroundKind: 'image' }); await loadBackground(); } }
    else { const [file] = await native.pickWithInput('image/*'); if (file) { await native.storeWebBackground(file); updateSettings({ backgroundImage: `web:${file.name}:${Date.now()}`, backgroundName: file.name, backgroundKind: 'image' }); await loadBackground(); } }
  } catch (error) { showError('error.background', error); }
}
async function removeBackground() { await native.clearBackground(); state.backgroundUrl = null; updateSettings({ backgroundImage: null, backgroundName: '', backgroundKind: S().backgroundKind === 'image' ? 'animated' : 'none' }); }

// ───────────────────────── settings, theme

function updateSettings(patch, { quiet = false } = {}) {
  const previous = state.settings;
  state.settings = { ...state.settings, ...patch };
  storeSettings(globalThis.localStorage, state.settings);
  if ('hideFromCapture' in patch && desktop) native.invoke('set_capture_hidden', { hidden: state.settings.hideFromCapture !== false, all: true }).catch(() => {});
  studio.general = state.settings;
  if (quiet) return;
  applySettings(previous);
}
function applySettings(previous = {}) {
  const s = S();
  const theme = resolveTheme(s.theme, prefersDark(), s.customTheme);
  applyTheme(theme);
  applyFont(s);
  native.setWindowTheme(theme.dark);
  studio.general = s;
  if (s.language !== getLanguage()) { setLanguage(s.language); native.setBackendLanguage(s.language); if (previous.language) notify('info', t('notice.language')); }
  if (s.backgroundImage !== previous.backgroundImage) loadBackground();
  if (s.theme !== previous.theme && previous.theme) notify('info', t('notice.theme', { name: themeName(s.theme, getLanguage()) }));
  if (s.globalHotkeys !== previous.globalHotkeys) bindHotkeys();
  renderAll();
  updateMinimumWidth();
}
async function openThemePicker(anchor) {
  const element = root.querySelector('.split-button [data-command="themeMenu"]')?.closest('.split-button') ?? root.querySelector('[data-command="themeMenu"]');
  const current = S().theme;
  const handlers = {};
  const item = (theme, glyph = null) => { const id = `custom:theme:${theme.id ?? theme}`; handlers[id] = () => updateSettings({ theme: theme.id ?? theme }); return { id, label: themeName(theme.id ?? theme, lang()), icon: glyph ?? 'palette', swatch: theme.swatch ?? null, checked: current === (theme.id ?? theme) }; };
  handlers['custom:theme-edit'] = () => popups.open('settings', { tab: 'appearance', themeGroup: 'custom' });
  handlers['custom:theme-random'] = () => updateSettings({ theme: randomThemeId(current) });
  const items = [
    { columns: [[item(customTheme(S().customTheme), 'palette')], [{ id: 'custom:theme-edit', label: t('theme.customSettings'), icon: 'gear' }]], row: true },
    { separator: true },
    { columns: [DARK_THEMES.map((x) => item(x)), LIGHT_THEMES.map((x) => item(x))], heads: [t('theme.darkGroup', { count: DARK_THEMES.length }), t('theme.lightGroup', { count: LIGHT_THEMES.length })], headIcons: ['moon', 'sun'] },
    { separator: true },
    { id: 'custom:theme-random', label: t('action.themeRandom'), icon: 'dice' },
  ];
  await showMenu(items, anchor ?? anchorBelow(element), 'theme', { handlers, header: { icon: 'palette', title: t('action.themeChoose') } });
}

// ───────────────────────── progress popup

const progressJobs = [];
let progressSeq = 0;
async function withProgress(titleKey, name, task, { delay = 250, cancellable = false } = {}) {
  const op = `op-${Date.now().toString(36)}-${(progressSeq += 1)}`;
  let shown = false;
  let last = null;
  const signal = { cancelled: false };
  const job = { op, reopen: null };
  const show = (wait = 0) => { shown = true; popups.open('progress', { title: t(titleKey), name, op, last, cancellable, delay: wait }, { delay: wait }).then((r) => { if (r?.cancel) signal.cancelled = true; }); };
  job.reopen = () => show(0);
  progressJobs.push(job);
  let timer = null;
  if (delay <= 0) { const drawn = popups.whenDrawn('progress'); show(0); await drawn; }
  else if (desktop && !popups.useFrames) show(delay);
  else timer = setTimeout(() => show(0), delay);
  const unlisten = await native.listen('io-progress', (progress) => { if (progress.op !== op) return; last = progress; if (shown) popups.post('progress', { type: 'progress', ...progress }); });
  try {
    return await task(op, (progress) => { last = { op, done: Math.round((progress.fraction ?? 0) * 1000), total: 1000, text: progress.text ?? '' }; if (shown) popups.post('progress', { type: 'progress', ...last }); }, signal);
  } finally {
    clearTimeout(timer);
    unlisten();
    progressJobs.splice(progressJobs.indexOf(job), 1);
    if (shown || (desktop && !popups.useFrames)) {
      popups.post('progress', { type: 'done' });
      const outer = progressJobs.at(-1);
      setTimeout(() => { if (progressJobs.at(-1) !== outer) return; if (outer) outer.reopen(); else popups.hide('progress'); }, shown ? 500 : 0);
    }
  }
}

// ───────────────────────── stats / log windows, problems

async function openStats() {
  const send = () => popups.post('stats', { type: 'stats', rows: Panels.statsRows(studio, state.sys).map(([k, v]) => [t(k), v]) });
  const timer = setInterval(send, 1000);
  setTimeout(send, 300);
  await popups.open('stats', { title: t('action.statsWindow') });
  clearInterval(timer);
}
async function openLog() {
  const send = () => popups.post('log', { type: 'log', lines: studio.logLines.slice(-1000).map((l) => ({ at: l.at.toLocaleTimeString(), level: l.level, text: l.text })) });
  const off = studio.on('log', () => send());
  setTimeout(send, 300);
  await popups.open('log', { title: t('action.logWindow') });
  off();
}
async function saveLog() {
  const text = studio.logLines.map((l) => `${l.at.toISOString()} [${l.level}] ${l.text}${l.detail ? `\n    ${l.detail.replace(/\n/g, '\n    ')}` : ''}`).join('\n');
  const name = `MyBroadcasting ${new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19)}.log`;
  if (desktop) { const path = await native.chooseSavePath(P.joinPath(S().lastDirectory ?? '', name), ['txt']); if (path) { await native.writeTextFile(path, text, ''); notify('success', t('notice.exported', { path })); } }
  else P.downloadBlob(new Blob([text], { type: 'text/plain' }), name);
}
async function runProblems() {
  const files = new Set();
  for (const s of Object.values(c().sources)) for (const v of [s.settings.file, s.settings.local_file, ...(s.settings.files ?? []), ...(s.settings.playlist ?? [])]) { const f = typeof v === 'object' && v ? v.value : v; if (typeof f === 'string' && P.isAbsolutePath(f)) files.add(f); }
  const list = [...files];
  const exists = desktop && list.length ? await native.pathsExist(list) : list.map(() => true);
  const ok = new Map(list.map((f, i) => [f, exists[i]]));
  state.problems = M.findProblems(c(), { exists: (f) => ok.get(f) !== false });
  for (const rt of studio.engine?.runtimes.values() ?? []) if (rt.status === 'error') state.problems.push({ kind: 'sourceError', severity: 'error', source: rt.id, params: { name: c().sources[rt.id]?.name ?? '?', error: rt.error } });
  if (S().bottomTab === 'problems') renderBottom();
  renderStatus();
}
async function copyText(value) {
  try { await native.clipboardWrite(value); } catch { await navigator.clipboard?.writeText(value).catch(() => {}); }
  notify('success', t('notice.copiedText'));
}

// ───────────────────────── menus (popup windows)

const screenOffset = { x: 0, y: 0, measured: false };
function estimateOffset() {
  if (screenOffset.measured) return;
  const border = Math.max(0, (window.outerWidth - window.innerWidth) / 2);
  screenOffset.x = window.screenX + border;
  screenOffset.y = window.screenY + Math.max(0, window.outerHeight - window.innerHeight - border);
}
window.addEventListener('pointermove', (event) => { if (!event.isTrusted) return; screenOffset.x = event.screenX - event.clientX; screenOffset.y = event.screenY - event.clientY; screenOffset.measured = true; }, { passive: true });
function toScreen(x, y) { if (popups.useFrames) return { x: window.screenX + x, y: window.screenY + y }; estimateOffset(); return { x: screenOffset.x + x, y: screenOffset.y + y }; }
function anchorBelow(element) { const rect = element.getBoundingClientRect(); const point = toScreen(rect.left, rect.bottom + 2); return { ...point, flipY: toScreen(rect.left, rect.top - 2).y }; }
const anchorFor = (command) => anchorBelow(root.querySelector(`[data-command="${command}"]`) ?? root.querySelector('#toolbar'));

function menuItems(ids) {
  return ids.map((id) => (id === '-' ? { separator: true } : typeof id === 'object' ? {
    id: `submenu:${id.sub}`, label: t(`submenu.${id.sub}`), icon: SUBMENUS[id.sub].icon, submenu: true,
    disabled: !SUBMENUS[id.sub].items.some((item) => item !== '-' && commandEnabled(item)),
  } : { id, label: id === 'toggleStream' ? t(live() ? 'action.stopStream' : 'action.startStream') : id === 'toggleRecording' ? t(rec() ? 'action.stopRecording' : 'action.startRecording') : t(commands[id].label), icon: commands[id].icon, shortcut: commands[id].key ? keyLabel(commands[id].key) : '', disabled: !commandEnabled(id), checked: commands[id].checked?.() }));
}
function withChildren(items, depth = 0) {
  return items.map((item) => {
    if (!item.submenu || depth > 3) return item;
    if (item.children) return { ...item, children: withChildren(item.children, depth + 1) };
    const key = item.id.slice('submenu:'.length);
    const children = SUBMENUS[key] ? menuItems(SUBMENUS[key].items) : null;
    return children ? { ...item, children: withChildren(children, depth + 1) } : item;
  });
}
async function showMenu(items, anchor, name = 'context', context = {}) {
  state.openMenu = name;
  renderMenubar();
  const header = context.header ?? (MENUS[name] ? { icon: MENU_ICONS[name], title: t(`menu.${name}`) } : { icon: 'appIcon', title: 'MyBroadcasting' });
  context = { ...context, handlers: { ...context.handlers } };
  items = withChildren(items);
  const result = await popups.open('menu', { items, name, header }, { anchor });
  if (state.openMenu === name) { state.openMenu = null; state.lastMenuClose = { name, at: Date.now() }; renderMenubar(); }
  const id = result?.id;
  if (!id) return undefined;
  if (id.startsWith('submenu:')) {
    const key = id.slice('submenu:'.length);
    if (!SUBMENUS[key]) return undefined;
    const at = result.at ?? anchor;
    return showMenu(menuItems(SUBMENUS[key].items), { x: at.x, y: at.y, flipY: at.flipY ?? at.y }, name, { ...context, header: { icon: SUBMENUS[key].icon, title: t(`submenu.${key}`) } });
  }
  await popups.whenHidden('menu');
  if (id.startsWith('custom:')) return context.handlers?.[id]?.();
  return run(id, context);
}
function openMenubarMenu(name) { const el = root.querySelector(`[data-menu="${name}"]`); if (el) showMenu(menuItems(MENUS[name]), anchorBelow(el), name); }

function contextMenu(event, kind, payload = {}) {
  const point = toScreen(event.clientX, event.clientY);
  const anchor = { x: point.x + 1, y: point.y + 1, flipY: point.y };
  const ctx = { anchor };
  const header = (glyph, title) => ({ header: { icon: glyph, title } });
  if (kind === 'scene') {
    const scene = M.sceneById(c(), payload.id);
    return showMenu(menuItems(['addScene', 'duplicateScene', 'renameScene', 'removeScene', '-', 'sceneUp', 'sceneDown', '-', 'sceneProperties', 'sceneFilters', 'sceneScreenshot', 'sceneProjector', '-', 'copyItems', 'pasteItems']), anchor, 'context', { ...ctx, ...header('srcScene', scene?.name ?? t('dock.scenes')) });
  }
  if (kind === 'item' || kind === 'source') {
    const src = selSource();
    const extra = [];
    if (src && ['monitor_capture', 'window_capture', 'game_capture', 'wasapi_output_capture', 'wasapi_process_output_capture'].includes(src.type)) extra.push({ id: 'custom:pick', label: t('prop.action.pick-capture'), icon: 'capturePick' });
    return showMenu([...extra, ...menuItems(['openProperties', 'openFilters', 'openAudio', 'renameItem', 'removeItems', '-', sub('transform'), sub('order'), '-', 'toggleVisible', 'toggleLock', 'group', 'ungroup', '-', 'copyItems', 'pasteItems', 'pasteDuplicate', 'copyFilters', 'pasteFilters', '-', 'sourceScreenshot', 'sourceProjector', 'interact'])], anchor, 'context', { ...ctx, handlers: { 'custom:pick': () => pickCapture(src.id) }, ...header(SOURCE_TYPES[src?.type]?.icon ?? 'sources', src?.name ?? t('dock.sources')) });
  }
  if (kind === 'preview') return showMenu(menuItems(['addSourceMenu', 'pasteItems', '-', 'previewEnabled', 'lockPreview', 'safeAreas', 'snapping', '-', 'toggleStudio', 'multiview', 'projectorMenu', 'screenshotOutput']), anchor, 'context', { ...ctx, ...header('preview', t('studio.preview')) });
  if (kind === 'program') return showMenu(menuItems(['studioTransition', 'projectorMenu', 'screenshotOutput', '-', 'toggleStudio']), anchor, 'context', { ...ctx, ...header('program', t('studio.program')) });
  if (kind === 'strip') {
    const src = c().sources[payload.id];
    if (!src) return undefined;
    const handlers = {
      'custom:adv': () => { studio.selection.source = src.id; studio.selection.items.clear(); rightTab('audio'); },
      'custom:filters': () => { studio.selection.source = src.id; studio.selection.items.clear(); rightTab('filters'); },
      'custom:props': () => { studio.selection.source = src.id; studio.selection.items.clear(); rightTab('props'); },
      'custom:hide': () => { studio.setAudio(src.id, { hidden: !src.audio.hidden }); renderBottom(); },
      'custom:unhideAll': () => { studio.change('unhide', (cc) => { for (const x of Object.values(cc.sources)) if (x.audio) x.audio.hidden = false; }); },
      'custom:rename': async () => { const name = await prompt(t('action.renameSource'), t('source.name'), src.name, 'rename'); if (name && !studio.renameSource(src.id, name)) notify('warning', t('notice.nameTaken', { name })); },
      'custom:monitor': () => { const order = ['off', 'monitorOnly', 'both']; studio.setAudio(src.id, { monitor: order[(order.indexOf(src.audio.monitor) + 1) % 3] }); renderBottom(); },
    };
    return showMenu([
      { id: 'custom:adv', label: t('action.advancedAudio'), icon: 'mixer' }, { id: 'custom:filters', label: t('action.filters'), icon: 'filters' }, { id: 'custom:props', label: t('action.properties'), icon: 'gear' },
      { separator: true }, { id: 'custom:monitor', label: t(`audio.monitor.${src.audio.monitor}`), icon: 'headphones' }, { id: 'custom:rename', label: t('action.renameSource'), icon: 'rename' }, { id: 'custom:hide', label: t(src.audio.hidden ? 'audio.unhide' : 'audio.hide'), icon: 'eyeOff' }, { id: 'custom:unhideAll', label: t('audio.unhideAll'), icon: 'eye' },
      { separator: true }, ...menuItems(['mixerLayout', 'mixerHidden']),
    ], anchor, 'context', { ...ctx, handlers, ...header('mixer', src.name) });
  }
  if (kind === 'start') return showMenu(menuItems(['newCollection', 'importCollection', 'recent', '-', 'shuffleBackground', 'backgroundImage', '-', 'tutorial', 'about']), anchor, 'context', { ...ctx, ...header('home', t('action.startPage')) });
  if (kind === 'status') return showMenu(menuItems(['statusBar', 'statsWindow', 'logWindow', '-', 'theme', 'language']), anchor, 'context', { ...ctx, ...header('statusBar', t('action.statusBar')) });
  if (kind === 'bottom') return showMenu(menuItems(['bottomPanel', '-', ...Panels.BOTTOM_TABS.map((x) => `bottom:${x}`)]), anchor, 'context', { ...ctx, ...header('panelBottom', t('bottom.title')) });
  return showMenu(menuItems(['addScene', 'addSourceMenu', '-', 'undo', 'redo', '-', 'leftPanel', 'rightPanel', 'bottomPanel', '-', 'settings', 'about']), anchor, 'context', { ...ctx, ...header('appIcon', 'MyBroadcasting') });
}

function textContextMenu(element, event) {
  const point = toScreen(event.clientX, event.clientY);
  const anchor = { x: point.x + 1, y: point.y + 1, flipY: point.y };
  const handlers = {
    'custom:cut': () => { element.focus(); document.execCommand('cut'); },
    'custom:copy': () => { element.focus(); document.execCommand('copy'); },
    'custom:paste': async () => { element.focus(); const value = await native.clipboardRead().catch(() => ''); document.execCommand('insertText', false, value ?? ''); },
    'custom:selectAll': () => { element.focus(); element.select?.(); },
  };
  const has = element.selectionStart !== element.selectionEnd;
  return showMenu([
    { id: 'custom:cut', label: t('action.cut'), icon: 'cut', disabled: !has }, { id: 'custom:copy', label: t('action.copy'), icon: 'copy', disabled: !has },
    { id: 'custom:paste', label: t('action.paste'), icon: 'paste' }, { separator: true }, { id: 'custom:selectAll', label: t('action.selectText'), icon: 'selectAll' },
  ], anchor, 'context', { handlers, header: { icon: 'edit', title: t('menu.edit') } });
}

// ───────────────────────── documents (help windows)

async function openDocWindow(kind) {
  const info = DOC_KINDS[kind];
  if (!info) return undefined;
  popups.hideMenu();
  const url = `${location.pathname}?viewer=${kind}&lang=${getLanguage() === 'en' ? 'en' : 'ko'}`;
  if (popups.inline) return openDocFrame(kind, url);
  if (!desktop) { globalThis.open(url, `mybroadcasting-${docLabel(kind)}`)?.focus?.(); return undefined; }
  const dark = resolveTheme(S().theme, prefersDark(), S().customTheme).dark;
  try { await native.invoke('open_doc_window', { kind, title: docWindowTitle(t(info.title)), width: info.width, height: info.height, dark }); } catch (error) { showError('error.docWindow', error); }
  return undefined;
}
function openDocFrame(kind, url) {
  const key = docLabel(kind);
  let frame = popups.frames.get(key);
  if (!frame) { frame = document.createElement('div'); frame.className = `web-popup web-popup-doc web-popup-${key}`; frame.dataset.kind = key; frame.innerHTML = `<iframe title="${escapeHtml(key)}" src="${escapeHtml(url)}"></iframe>`; document.body.append(frame); popups.frames.set(key, frame); }
  return frame;
}
function closeDocFrames() { for (const kind of Object.keys(DOC_KINDS)) if (popups.frames.has(docLabel(kind))) popups.close(docLabel(kind)); }

// ───────────────────────── drag & drop: media files become sources, collections are imported

function setDropActive(active) { if (state.dropActive === active) return; state.dropActive = active; root.classList.toggle('drop-active', active); }
const typeOfFile = (name) => {
  const ext = String(name).split('.').pop().toLowerCase();
  if (['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'avif', 'svg', 'tga', 'ico'].includes(ext)) return 'image_source';
  if (['mp4', 'm4v', 'mkv', 'webm', 'mov', 'avi', 'flv', 'ts', 'mts', 'mpg', 'mpeg', 'ogv', 'mp3', 'aac', 'm4a', 'wav', 'ogg', 'oga', 'opus', 'flac', 'm3u8'].includes(ext)) return 'ffmpeg_source';
  if (['html', 'htm'].includes(ext)) return 'browser_source';
  if (['txt'].includes(ext)) return 'text_gdiplus';
  if (['mybc', 'json'].includes(ext)) return 'collection';
  return null;
};
async function addDroppedFile(value, name) {
  const type = typeOfFile(name);
  if (!type) { notify('warning', t('drop.unsupported', { name })); return; }
  if (type === 'collection') { try { const text = P.isAbsolutePath(value) ? await native.readTextFile(value, '') : await P.readText(value); studio.importCollection(text, name.replace(/\.[^.]+$/, '')); showStartPage(false); } catch (error) { showError('error.import', error, name); } return; }
  if (onStart()) showStartPage(false);
  const settings = type === 'image_source' ? { file: value } : type === 'ffmpeg_source' ? { local_file: value, is_local_file: true } : type === 'browser_source' ? { mode: 'local', local_file: value } : { read_from_file: true, file: value };
  studio.addSource(type, M.uniqueName(c(), name.replace(/\.[^.]+$/, '')), settings);
  notify('success', t('notice.sourceAdded', { name }));
}
async function handleDroppedPaths(paths) { for (const p of paths) await addDroppedFile(p, baseName(p)); }

// ───────────────────────── form controls of the panels (properties, filters, transitions, transform, audio)

/** A control of a property form changed: scope "src:<id>" · "flt:<source>:<filter>" · "trn:<transition>". */
function formInput(scope, key, value, { live: liveEdit = false } = {}) {
  const [kind, a, b] = scope.split(':');
  if (kind === 'src') {
    const src = c().sources[a];
    if (!src) return;
    const top = key.split('.')[0];
    const next = key.includes('.') ? setPath({ [top]: src.settings[top] }, key, value)[top] : value;
    studio.updateSettings(a, { [top]: next });
  } else if (kind === 'flt') studio.setFilter(a, b, { settings: { [key]: value } });
  else if (kind === 'trn') studio.setTransitionSettings(a, { [key]: value });
  if (!liveEdit) scheduleRight();
}

async function chooseFormFile(scope, key, accept, { multiple = false } = {}) {
  const picked = await P.pickFiles(accept, { multiple, lastDir: S().lastDirectory });
  if (!picked.length) return [];
  if (desktop) rememberFolder(picked[0]);
  if (!multiple) formInput(scope, key, picked[0]);
  renderRight();
  return picked;
}

function transformInput(key, value) {
  const it = selItem();
  if (!it) return;
  const [w, h] = studio.sizeOf(it);
  studio.setItem(it.id, (item) => {
    const tr = JSON.parse(JSON.stringify(item.transform));
    if (key === 'w') tr.sx = Math.sign(tr.sx || 1) * (value / Math.max(1, w - tr.crop.l - tr.crop.r));
    else if (key === 'h') tr.sy = Math.sign(tr.sy || 1) * (value / Math.max(1, h - tr.crop.t - tr.crop.b));
    else if (key.startsWith('crop.')) tr.crop[key.slice(5)] = value;
    else if (key.startsWith('bounds.')) tr.bounds[key.slice(7)] = value;
    else tr[key] = value;
    if (key === 'bounds.type' && value !== 'none' && !tr.bounds.w) { tr.bounds.w = Math.abs(w * tr.sx); tr.bounds.h = Math.abs(h * tr.sy); }
    return { transform: tr };
  }, 'transform', `tf:${it.id}:${key}`);
}

function audioInput(id, key, value) {
  const src = c().sources[id];
  if (!src?.audio) return;
  if (key === 'db') studio.setAudio(id, { volume: value <= -100 ? 0 : 10 ** (value / 20) });
  else if (key.includes('.')) { const [k1, k2] = key.split('.'); studio.setAudio(id, { [k1]: { ...src.audio[k1], [k2]: value } }); }
  else studio.setAudio(id, { [key]: value });
  scheduleRight();
}

// ───────────────────────── events

function bindEvents() {
  root.addEventListener('pointerdown', () => { studio.startAudio().catch(() => {}); }, { capture: true, once: false });
  root.addEventListener('click', (event) => {
    const target = event.target;
    const menu = target.closest('[data-menu]');
    if (menu) { const name = menu.dataset.menu; if (state.lastMenuClose.name === name && Date.now() - state.lastMenuClose.at < 300) return undefined; return openMenubarMenu(name); }
    if (target.closest('[data-home]')) return showStartPage(!state.showStart);
    const start = target.closest('[data-start]');
    if (start && !start.disabled) return onStartAction(start);
    const more = target.closest('[data-toolbar-more]');
    if (more) return showToolbarMore(more);
    const view = target.closest('[data-view]');
    if (view) return setView(view.dataset.view);
    if (target.closest('[data-quick-toggle]')) { updateSettings({ quickAddOpen: S().quickAddOpen === false }); return renderLeft(); }
    const addSource = target.closest('[data-add-source]');
    if (addSource) return addSourceAsk(addSource.dataset.addSource);
    const command = target.closest('[data-command]');
    if (command && !command.disabled) { const id = command.dataset.command; return run(id, { anchor: ANCHORED.has(id) ? anchorBelow(command.closest('.split-button') ?? command) : undefined }); }
    const windowControl = target.closest('[data-window]');
    if (windowControl) return windowButton(windowControl.dataset.window);
    // Scenes and sources.
    const scene = target.closest('[data-scene]');
    if (scene && !target.closest('[data-scene-grip]')) { studio.selectScene(scene.dataset.scene); return renderAll(); }
    const eye = target.closest('[data-item-eye]');
    if (eye) { studio.toggleVisible(eye.dataset.itemEye); return undefined; }
    const lock = target.closest('[data-item-lock]');
    if (lock) { studio.setItem(lock.dataset.itemLock, (it) => ({ locked: !it.locked }), 'lockItem'); return undefined; }
    const collapse = target.closest('[data-item-collapse]');
    if (collapse) { studio.setItem(collapse.dataset.itemCollapse, (it) => ({ collapsed: !it.collapsed }), 'collapse'); return undefined; }
    const item = target.closest('[data-item]');
    if (item) { const id = item.dataset.item; if (event.ctrlKey || event.metaKey) { const next = new Set(studio.selection.items); if (next.has(id)) next.delete(id); else next.add(id); studio.select([...next]); } else studio.select([id]); return renderAll(); }
    // Right panel.
    const rt = target.closest('[data-right-tab]');
    if (rt) return updateSettings({ rightTab: rt.dataset.rightTab });
    const fileBtn = target.closest('[data-form-file]');
    if (fileBtn) { const [scope, key] = fileBtn.dataset.formFile.split('|'); return chooseFormFile(scope, key, fileBtn.dataset.accept); }
    const clear = target.closest('[data-form-clear]');
    if (clear) { const [scope, key] = clear.dataset.formClear.split('|'); return formInput(scope, key, ''); }
    const files = target.closest('[data-form-files]');
    if (files && !files.disabled) return filesAction(files);
    const ftoggle = target.closest('[data-form-toggle]');
    if (ftoggle) { const [scope, key] = ftoggle.dataset.formToggle.split('|'); const src = c().sources[scope.split(':')[1]]; const cur = key.split('.').reduce((o, k) => o?.[k], src?.settings); return formInput(scope, key, !cur); }
    const faction = target.closest('[data-form-action]');
    if (faction) return formAction(faction.dataset.formAction, faction.dataset.formScope);
    const filterRow = target.closest('[data-filter]');
    if (filterRow && !target.closest('input, button')) { state.filter = filterRow.dataset.filter; return renderRight(); }
    const fmove = target.closest('[data-filter-move]');
    if (fmove) { const [id, dir] = fmove.dataset.filterMove.split(':'); return studio.moveFilter(selSourceId(), id, Number(dir)); }
    const fremove = target.closest('[data-filter-remove]');
    if (fremove) return studio.removeFilter(selSourceId(), fremove.dataset.filterRemove);
    const tcmd = target.closest('[data-transform-cmd]');
    if (tcmd) return studio.transformSelected(tcmd.dataset.transformCmd);
    const media = target.closest('[data-media]');
    if (media) { studio.engine.runtime(media.dataset.media)?.control(media.dataset.action); return setTimeout(() => { renderRight(); if (S().bottomTab === 'media') renderBottom(); }, 60); }
    // Bottom panel.
    const bt = target.closest('[data-bottom-tab]');
    if (bt) return updateSettings({ bottomTab: bt.dataset.bottomTab });
    const mute = target.closest('[data-mute]');
    if (mute) { const src = c().sources[mute.dataset.mute]; studio.setAudio(src.id, { muted: !src.audio.muted }); return renderBottom(); }
    const mon = target.closest('[data-monitor]');
    if (mon) { const src = c().sources[mon.dataset.monitor]; const order = ['off', 'monitorOnly', 'both']; studio.setAudio(src.id, { monitor: order[(order.indexOf(src.audio.monitor) + 1) % 3] }); return renderBottom(); }
    const strip = target.closest('[data-strip-menu]');
    if (strip) return contextMenu(event, 'strip', { id: strip.dataset.stripMenu });
    const quick = target.closest('[data-quick]');
    if (quick) return studio.runQuick(quick.dataset.quick);
    const problem = target.closest('[data-problem]');
    if (problem) { const p = state.problems[Number(problem.dataset.problem)]; if (p?.source) { studio.selection.source = p.source; studio.selection.items.clear(); rightTab('props'); } else if (p?.scene) studio.selectScene(p.scene); return renderAll(); }
    return undefined;
  });

  root.addEventListener('dblclick', (event) => {
    const scene = event.target.closest('[data-scene]');
    if (scene) { if (studio.studioMode && S().doubleClickTransition !== false) studio.studioTransition(); else renameSceneAsk(scene.dataset.scene); return; }
    const item = event.target.closest('[data-item]');
    if (item && !event.target.closest('button')) { studio.select([item.dataset.item]); rightTab('props'); }
  });

  root.addEventListener('change', (event) => {
    const el = event.target;
    if (el.dataset.form) return formInput(el.dataset.form, el.dataset.key, readField(el));
    if ('renameSource' in el.dataset) { const name = el.value.trim(); if (name && !studio.renameSource(el.dataset.renameSource, name)) notify('warning', t('notice.nameTaken', { name })); return renderAll(); }
    if (el.dataset.filterAdd) { if (el.value) { const f = studio.addFilter(el.dataset.filterAdd, el.value); state.filter = f?.id; } return renderRight(); }
    if (el.dataset.filterEnabled) return studio.setFilter(selSourceId(), el.dataset.filterEnabled, { enabled: el.checked });
    if (el.dataset.filterName) return studio.setFilter(selSourceId(), el.dataset.filterName, { name: el.value.trim() || el.defaultValue });
    if (el.dataset.transformSelect) { const key = el.dataset.transformSelect; if (key === 'blend' || key === 'scaleFilter') return studio.setItem(selItem().id, { [key]: el.value }, 'blend'); return transformInput(key, el.value); }
    if (el.dataset.transformCheck) return transformInput(el.dataset.transformCheck, el.checked);
    if (el.dataset.itemTransition) { const key = el.dataset.itemTransition; return studio.setItem(selItem().id, { [key]: el.value ? { type: el.value, duration: selItem()[key]?.duration ?? 300, settings: {} } : null }, 'itemTransition'); }
    if (el.dataset.sceneOverride) { const scene = M.sceneById(c(), el.dataset.sceneOverride); studio.change('override', () => { scene.override = el.value ? { transition: el.value, duration: scene.override?.duration ?? c().duration } : null; }); return renderRight(); }
    if (el.dataset.audioCheck) { const [id, key] = el.dataset.audioCheck.split('|'); return audioInput(id, key, el.checked); }
    if (el.dataset.audioSelect) { const [id, key] = el.dataset.audioSelect.split('|'); return audioInput(id, key, el.value); }
    if (el.dataset.audioTrack) { const [id, i] = el.dataset.audioTrack.split('|'); const tracks = [...c().sources[id].audio.tracks]; tracks[Number(i)] = el.checked; return audioInput(id, 'tracks', tracks); }
    if ('transitionSelect' in el.dataset) return studio.setTransition(el.value);
    if ('logFilter' in el.dataset) { state.logFilter = el.value; return renderBottom(); }
    if ('startToggle' in el.dataset) return updateSettings({ showStartPage: el.checked }, { quiet: true });
    if ('startSpeed' in el.dataset) return updateSettings({ animationSpeed: Number(el.value) }, { quiet: true });
    if ('startOpacity' in el.dataset) return updateSettings({ startCardOpacity: Number(el.value) }, { quiet: true });
    if ('startRandom' in el.dataset) return updateSettings({ animationRandom: el.checked }, { quiet: true });
    if ('startInterval' in el.dataset) { startBackgroundChangedAt = Date.now(); return updateSettings({ animationInterval: Number(el.value) }, { quiet: true }); }
    if ('tbar' in el.dataset) return undefined;
    return undefined;
  });

  root.addEventListener('input', (event) => {
    const el = event.target;
    if (el.type === 'range' && el.dataset.form) { const out = el.parentElement.querySelector('output'); if (out) out.textContent = `${Number(el.value).toFixed(Number(out.dataset.digits ?? 0))}${out.dataset.unit ?? ''}`; formInput(el.dataset.form, el.dataset.key, Number(el.value), { live: true }); syncSliderSteps(el.parentElement); }
    if (el.dataset.fader) { const id = el.dataset.fader; studio.setAudio(id, { volume: faderToMul(Number(el.value)) }); const db = root.querySelector(`[data-strip-db="${CSS.escape(id)}"]`); const mul = faderToMul(Number(el.value)); if (db) db.textContent = mul > 0 ? `${(20 * Math.log10(mul)).toFixed(1)} dB` : '-∞ dB'; }
    if (el.dataset.audioRange) { const [id, key] = el.dataset.audioRange.split('|'); audioInput(id, key, Number(el.value)); const out = el.parentElement.querySelector('output'); if (out) out.textContent = String(Math.round((Number(el.value) - 0.5) * 200)); }
    if ('tbar' in el.dataset) studio.engine.setTBar(Number(el.value) / 1000, c().preview);
    if (el.dataset.mediaSeek) studio.engine.runtime(el.dataset.mediaSeek)?.control('seek', Number(el.value));
    if ('startSpeed' in el.dataset) { el.parentElement.querySelector('output').textContent = `${el.value}%`; state.settings.animationSpeed = Number(el.value); }
    if ('startOpacity' in el.dataset) { el.parentElement.querySelector('output').textContent = `${el.value}%`; root.querySelector('.start-inner')?.style.setProperty('--start-card-alpha', `${el.value}%`); }
    if (el.matches?.('.start-speed input[type="range"]')) syncSliderSteps(el.parentElement);
  });
  // The T-bar snaps back when released short of the end.
  root.addEventListener('pointerup', (event) => { if (event.target.dataset?.tbar != null && studio.engine.transition?.manual) { const v = Number(event.target.value) / 1000; if (v < 1) { studio.engine.setTBar(0); event.target.value = '0'; } } });

  // − / + beside sliders: one step (held down: again and again).
  const sliderStep = (button) => {
    const input = button.parentElement.querySelector('input[type="range"]');
    if (!input) return false;
    const before = input.value;
    input.value = String(Math.max(Number(input.min), Math.min(Number(input.max), Number(input.value) + Number(button.dataset.sliderStep) * (input.dataset.fader ? 0.01 : Number(input.step || 1)))));
    if (input.value === before) return false;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    syncSliderSteps(input.parentElement);
    return true;
  };
  root.addEventListener('pointerdown', (event) => {
    const button = event.target.closest?.('[data-slider-step]');
    if (!button || event.button !== 0 || button.disabled) return;
    event.preventDefault();
    if (!sliderStep(button)) return;
    let timer = setTimeout(function again() { if (sliderStep(button)) timer = setTimeout(again, 90); }, 420);
    const stop = () => { clearTimeout(timer); window.removeEventListener('pointerup', stop, true); window.removeEventListener('pointercancel', stop, true); };
    window.addEventListener('pointerup', stop, true);
    window.addEventListener('pointercancel', stop, true);
  });

  // Dragging scenes and sources by their grips reorders them (sources may go in and out of groups).
  root.addEventListener('pointerdown', (event) => {
    const grip = event.target.closest?.('[data-scene-grip], [data-item-grip]');
    if (!grip || event.button !== 0) return;
    event.preventDefault();
    const isScene = 'sceneGrip' in grip.dataset;
    const list = grip.closest('.dock-list');
    const rows = [...list.querySelectorAll(isScene ? '.scene-row' : '.source-row')];
    const row = grip.closest('.list-row');
    let target = null;
    row.classList.add('dragging');
    pointerDrag(event, {
      cursor: 'grabbing',
      move: (dx, dy, e) => {
        for (const r of rows) r.classList.remove('drop-before', 'drop-after', 'drop-into');
        target = rows.find((r) => { const b = r.getBoundingClientRect(); return e.clientY >= b.top && e.clientY < b.bottom; }) ?? null;
        if (!target || target === row) return;
        const b = target.getBoundingClientRect();
        const into = !isScene && c().sources[M.findItem(studio.editScene, target.dataset.item)?.item?.source]?.type === 'group' && Math.abs(e.clientY - (b.top + b.height / 2)) < b.height / 4;
        target.dataset.dropMode = into ? 'into' : e.clientY < b.top + b.height / 2 ? 'before' : 'after';
        target.classList.add(into ? 'drop-into' : `drop-${target.dataset.dropMode}`);
      },
      end: (e, moved) => {
        row.classList.remove('dragging');
        for (const r of rows) r.classList.remove('drop-before', 'drop-after', 'drop-into');
        if (!moved || !target || target === row) return;
        if (isScene) {
          const to = c().scenes.findIndex((s) => s.id === target.dataset.scene);
          const from = c().scenes.findIndex((s) => s.id === row.dataset.scene);
          studio.moveScene(row.dataset.scene, Math.max(0, to + (target.dataset.dropMode === 'after' ? (from < to ? 0 : 1) : (from < to ? -1 : 0))));
        } else {
          const id = row.dataset.item;
          const hit = M.findItem(studio.editScene, target.dataset.item);
          if (target.dataset.dropMode === 'into') studio.moveItemTo(id, hit.item.id, hit.item.children.length);
          else {
            // The list shows the top item first: "before" in the list is "above" = a higher index.
            const index = Number(target.dataset.index) + (target.dataset.dropMode === 'before' ? 1 : 0);
            const group = target.dataset.parent || null;
            const own = M.findItem(studio.editScene, id);
            const sameList = (own.parent?.id ?? null) === group;
            studio.moveItemTo(id, group, sameList && own.list.indexOf(own.item) < index ? index - 1 : index);
          }
        }
      },
    });
  });

  bindSteppers(root, (key, value) => {
    const [kind, a, b] = key.split('|');
    if (kind.startsWith('src:') || kind.startsWith('flt:') || kind.startsWith('trn:')) return formInput(kind, a, value);
    if (kind === 'tf') return transformInput(a, value);
    if (kind === 'aud') return audioInput(a, b, value);
    if (kind === 'duration') return studio.setDuration(value);
    if (kind === 'override') { const scene = M.sceneById(c(), a); return studio.change('override', () => { if (scene.override) scene.override.duration = value; }, { coalesce: `ov:${a}` }); }
    if (kind === 'itemtr') return studio.setItem(selItem().id, (it) => ({ [a]: it[a] ? { ...it[a], duration: value } : null }), 'itemTransition', `itr:${a}`);
    return undefined;
  });

  root.addEventListener('contextmenu', (event) => {
    const editable = event.target.closest('input:not([type="range"]):not([type="checkbox"]), textarea');
    if (editable) { event.preventDefault(); return textContextMenu(editable, event); }
    if (event.defaultPrevented) return undefined;
    event.preventDefault();
    const scene = event.target.closest('[data-scene]');
    if (scene) { studio.selectScene(scene.dataset.scene); return contextMenu(event, 'scene', { id: scene.dataset.scene }); }
    const item = event.target.closest('[data-item]');
    if (item) { if (!studio.selection.items.has(item.dataset.item)) studio.select([item.dataset.item]); return contextMenu(event, 'item', { id: item.dataset.item }); }
    const strip = event.target.closest('[data-strip]');
    if (strip) return contextMenu(event, 'strip', { id: strip.dataset.strip });
    if (event.target.closest('#bottom-panel')) return contextMenu(event, 'bottom');
    if (event.target.closest('#start-page')) return contextMenu(event, 'start');
    if (event.target.closest('#statusbar')) return contextMenu(event, 'status');
    return contextMenu(event, 'default');
  });

  root.querySelectorAll('[data-split="left"], [data-split="right"]').forEach((splitter) => splitter.addEventListener('pointerdown', (event) => {
    const side = splitter.dataset.split;
    if ((side === 'left' && !S().showLeftPanel) || (side === 'right' && !S().showRightPanel)) return;
    event.preventDefault();
    const key = side === 'left' ? 'leftWidth' : 'rightWidth';
    const startWidth = S()[key];
    pointerDrag(event, {
      cursor: 'col-resize',
      move: (dx) => { const width = Math.max(side === 'left' ? PANEL_MIN.left : PANEL_MIN.right, Math.min(800, startWidth + (side === 'left' ? dx : -dx))); root.style.setProperty(side === 'left' ? '--left-width' : '--right-width', `${width}px`); state.settings[key] = width; },
      end: (e, moved) => { if (moved) { updateSettings({ [key]: state.settings[key] }, { quiet: true }); fitToolbar(); workspace?.layout(); } },
    });
  }));
  root.querySelector('[data-split="bottom"]')?.addEventListener('pointerdown', (event) => {
    if (!S().showBottomPanel) return;
    event.preventDefault();
    const startH = S().bottomHeight;
    pointerDrag(event, {
      cursor: 'row-resize',
      move: (dx, dy) => { const h = Math.max(PANEL_MIN.bottom, Math.min(window.innerHeight * 0.6, startH - dy)); root.style.setProperty('--bottom-height', `${h}px`); state.settings.bottomHeight = Math.round(h); },
      end: (e, moved) => { if (moved) { updateSettings({ bottomHeight: state.settings.bottomHeight }, { quiet: true }); workspace?.layout(); } },
    });
  });
  // The splitter between the Scenes and Sources docks.
  root.addEventListener('pointerdown', (event) => {
    const splitter = event.target.closest?.('[data-split="docks"]');
    if (!splitter) return;
    event.preventDefault();
    const box = splitter.parentElement.getBoundingClientRect();
    pointerDrag(event, {
      cursor: 'row-resize',
      move: (dx, dy, e) => { const share = Math.round(Math.max(15, Math.min(85, ((e.clientY - box.top) / box.height) * 100))); splitter.parentElement.parentElement.style.setProperty('--scenes-share', `${share}%`); state.settings.explorerHeight = share; },
      end: (e, moved) => { if (moved) updateSettings({ explorerHeight: state.settings.explorerHeight }, { quiet: true }); },
    });
  });

  root.querySelector('#menubar')?.addEventListener('mousedown', (event) => {
    if (!desktop || event.button !== 0 || !event.target.closest?.('[data-window-drag]')) return;
    event.preventDefault();
    if (event.detail === 2) appWindow?.toggleMaximize().catch(() => {});
    else native.invoke('window_drag', {}).catch(() => {});
  });
  root.querySelector('[data-resize-grip]')?.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    native.invoke('window_drag', { edge: 'SouthEast' }).catch(() => appWindow?.startResizeDragging('SouthEast').catch(() => {}));
  });

  window.addEventListener('resize', frameThrottle(() => { fitToolbar(); workspace?.layout(); if (desktop && state.minWidth && window.innerWidth < state.minWidth - 1) native.setMinimumSize(state.minWidth, 640).catch(() => {}); }));
  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('keyup', (event) => { if (workspace?.interacting && event.key !== 'Escape' && !event.target.closest?.('input, textarea, select')) { workspace.interactKey(event, false); event.preventDefault(); } }, true);
  document.addEventListener('keyup', onKeyUp, true);

  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) { const previous = state.settings; state.settings = loadSettings(globalThis.localStorage); applySettings(previous); }
    else if (event.key === PROFILES_KEY) { studio.reloadProfiles(); bindHotkeys(); renderAll(); }
    else if (event.key === RECENT_KEY) { state.recent = loadRecent(globalThis.localStorage); if (onStart()) renderStartPage(); }
    else if (event.key === TOOLS_KEY) { tools.settings = loadTools(globalThis.localStorage); }
    else if (event.key === COLLECTIONS_KEY) { /* this window owns the collection list */ }
  });

  window.addEventListener('beforeunload', (event) => { if (!desktop && studio.isLive) { event.preventDefault(); event.returnValue = ''; } });

  if (!desktop) {
    let depth = 0;
    document.addEventListener('dragenter', (event) => { if ([...(event.dataTransfer?.types ?? [])].includes('Files')) { depth += 1; setDropActive(true); event.preventDefault(); } });
    document.addEventListener('dragover', (event) => { event.preventDefault(); });
    document.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) setDropActive(false); });
    document.addEventListener('drop', async (event) => {
      event.preventDefault(); depth = 0; setDropActive(false);
      for (const file of [...(event.dataTransfer?.files ?? [])]) {
        if (typeOfFile(file.name) === 'collection') { try { studio.importCollection(await file.text(), file.name.replace(/\.[^.]+$/, '')); showStartPage(false); } catch (error) { showError('error.import', error, file.name); } continue; }
        await addDroppedFile(await P.storeAsset(file), file.name);
      }
    });
  }

  setInterval(() => { const clock = root.querySelector('#status-clock'); if (clock) clock.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }, 15000);
}

async function filesAction(button) {
  const [scope, key, op, index] = button.dataset.formFiles.split('|');
  const src = c().sources[scope.split(':')[1]];
  const list = [...(src?.settings[key] ?? [])];
  if (op === 'add') { const picked = await P.pickFiles(button.dataset.accept, { multiple: true, lastDir: S().lastDirectory }); if (!picked.length) return; list.push(...picked); }
  else if (op === 'remove') list.splice(Number(index), 1);
  else { const i = Number(index); const j = op === 'up' ? i - 1 : i + 1; [list[i], list[j]] = [list[j], list[i]]; }
  formInput(scope, key, list);
  renderRight();
}

async function formAction(action, scope) {
  const id = scope?.split(':')[1] ?? selSourceId();
  if (action === 'pick-capture') return pickCapture(id);
  if (action === 'refresh-browser') { await studio.engine.runtime(id)?.refresh?.(); return notify('info', t('notice.refreshed')); }
  if (action === 'refresh-devices') { await refreshDevices(); return renderRight(); }
  return undefined;
}

/** Ctrl+key shortcuts of the window: [key, shift, command]. */
const SHORTCUTS = [
  ['n', false, 'newCollection'], ['o', false, 'importCollection'], ['s', false, 'exportCollection'], ['p', false, 'print'],
  ['z', false, 'undo'], ['y', false, 'redo'], ['z', true, 'redo'], ['c', false, 'copyItems'], ['v', false, 'pasteItems'], ['e', false, 'editTransform'],
  ['f', false, 'tf:fit'], ['s', true, 'screenshotOutput'], ['d', false, 'tf:center'], ['r', true, 'tf:reset'], ['g', false, 'group'],
  ['arrowup', false, 'itemUp'], ['arrowdown', false, 'itemDown'], ['home', false, 'itemTop'], ['end', false, 'itemBottom'],
  [',', false, 'settings'], ['l', true, 'language'], ['!', true, 'leftPanel'], ['1', true, 'leftPanel'], ['@', true, 'rightPanel'], ['2', true, 'rightPanel'],
  ['q', false, 'exit'], ['h', true, 'startPage'], ['b', true, 'shuffleBackground'], ['r', false, 'recent'], ['j', false, 'bottomPanel'],
];

const pressed = new Set();
function onKeyDown(event) {
  // Interacting with a browser source: its page gets the keys (Esc ends it).
  if (workspace?.interacting && !event.target.closest?.('input, textarea, select, [contenteditable="true"]') && workspace.interactKey(event, true)) { event.preventDefault(); event.stopPropagation(); if (!workspace.interacting) renderAll(); return; }
  const key = event.key.toLowerCase();
  if (tutorial?.active && key === 'escape') { event.preventDefault(); tutorial.stop(); return; }
  const editing = event.target.closest?.('input, textarea, select, [contenteditable="true"]');
  // Hotkeys of the profile (in the browser, and on the desktop when global hotkeys are off).
  if (!editing && (!desktop || !S().globalHotkeys)) {
    const combo = comboOf(event);
    const actions = combo && keys.get(combo);
    if (actions?.length) { event.preventDefault(); if (!pressed.has(combo)) { pressed.add(combo); actions.forEach((a) => runHotkey(a, true)); } return; }
  }
  const mod = event.ctrlKey || event.metaKey;
  if (mod && !event.altKey) {
    if (editing && ['x', 'c', 'v', 'z', 'y', 'a'].includes(key)) return;
    const shortcut = SHORTCUTS.find(([k, shift]) => k === key && shift === event.shiftKey);
    if (shortcut) { event.preventDefault(); event.stopPropagation(); run(shortcut[2]); }
    return;
  }
  if (editing) { if (key === 'escape') event.target.blur(); return; }
  if (key === 'f1') { event.preventDefault(); run('about'); return; }
  if (key === 'f2') { event.preventDefault(); run('renameItem'); return; }
  if (key === 'f11') { event.preventDefault(); run('tutorial'); return; }
  if (key === 'delete' && hasSel() && !onStart()) { event.preventDefault(); run('removeItems'); return; }
  // Arrow keys nudge the selected items (Shift: 10 px).
  if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(key) && hasSel() && !onStart() && !S().previewLocked) {
    event.preventDefault();
    const d = event.shiftKey ? 10 : 1;
    studio.transformSelected('nudge', { arrowleft: [-d, 0], arrowright: [d, 0], arrowup: [0, -d], arrowdown: [0, d] }[key]);
    scheduleRight();
  }
}
function onKeyUp(event) {
  const combo = comboOf(event) ?? '';
  for (const k of [...pressed]) if (k === combo || k.endsWith(`+${combo.split('+').pop()}`) || !combo) { pressed.delete(k); (keys.get(k) ?? []).forEach((a) => runHotkey(a, false)); }
}

// ───────────────────────── popup actions

function bindPopupActions() {
  popups.on('error', (error) => showError('error.unexpected', error));
  popups.on('report-error', (data) => showError(data.titleKey ?? 'error.unexpected', Object.assign(new Error(data.message), { stack: data.detail ?? '' }), data.context ?? ''));
  popups.on('choose-background', () => chooseBackground());
  popups.on('clear-background', () => removeBackground());
  popups.on('shuffle-background', () => shuffleBackground());
  popups.on('open-recent', (data) => openRecent(data.path));
  popups.on('account-connect', (data) => connectAccountFlow(data.service));
  popups.on('vcam-install', async (data) => { try { if (studio.outputs.vcam === 'device') studio.stopVirtualCam(); await installVcam(Boolean(data.remove)); } catch (error) { showError('error.vcam', error); } popups.post('settings', { type: 'vcam-refresh' }); });
  popups.on('notice', (data) => notify(data.kind ?? 'info', data.text));
  popups.on('open-settings', (data) => popups.open('settings', { tab: data.tab ?? 'general', themeGroup: data.themeGroup }));
  popups.on('start-tutorial', () => startTutorial());
  popups.on('show-start', () => showStartPage(true));
  popups.on('progress-cancel', (data) => { popups.actions.get(`cancel:${data.op}`)?.(); });
  popups.on('print-content', (data) => sendPrintContent(data));
  popups.on('print-run', (job) => runPrint(job));
  popups.on('autoconfig', () => run('autoconfig'));
  popups.on('choose-folder', async (data) => { const dir = desktop ? await native.chooseFolder(data.value || S().lastDirectory) : await P.chooseWebFolder(); if (dir) popups.post('settings', { type: 'folder', key: data.key, value: dir }); });
  popups.on('choose-ffmpeg', async () => { const [path] = desktop ? await native.chooseFiles(null, [{ name: 'FFmpeg', extensions: isMac || !navigator.userAgent.includes('Windows') ? ['*'] : ['exe'] }], false) : []; if (path) popups.post('settings', { type: 'folder', key: 'ffmpegPath', value: path }); });
  popups.on('find-ffmpeg', async (data) => { const ff = await P.findFfmpeg(data.value ?? ''); popups.post('settings', { type: 'ffmpeg', info: ff }); });
  popups.on('devices', async () => { await refreshDevices(); popups.post('settings', { type: 'devices', devices: state.devices.map((d) => ({ kind: d.kind, deviceId: d.deviceId, label: d.label })) }); });
  popups.on('raise-test-panic', () => native.invoke('raise_test_panic').catch((error) => showError('error.unexpected', error)));
}

// ───────────────────────── tutorial

let tutorial = null;
async function startTutorial(options = {}) {
  tutorial ??= new Tutorial(appApi, root.querySelector('#tutorial-layer'));
  state.tutorial = tutorial;
  updateSettings({ tutorialOffered: true }, { quiet: true });
  await tutorial.start(options);
}

// ───────────────────────── start-up

/** What the start page reads. */
const panelApi = {
  state, commands, commandTip, commandEnabled, t, desktop, studio,
  settings: () => S(),
  version: () => state.info?.version ?? VERSION,
  samples: SAMPLE_COLLECTIONS,
};

/** What the tutorial and tests use. */
const appApi = {
  state, studio, t, run, commands, popups, notify, showError, showStartPage, updateSettings, renderAll, ask,
  settings: () => S(), anchorBelow, openMenubarMenu, showMenu, openDocWindow, closeDocFrames, withProgress, setView,
  version: () => state.info?.version ?? VERSION,
  loadSample: (id) => { studio.loadSample(id); showStartPage(false); },
  // The tutorial works on a sample that is never saved, and puts the user's collection back afterwards.
  takeDoc: () => ({ c: JSON.parse(JSON.stringify(studio.c)), name: studio.collections.current, studioMode: studio.studioMode }),
  openTemplate: (id) => { studio.noSave = true; studio.collection = studio.localize(M.normalizeCollection(sampleCollection(id, t))); studio.undoStack = []; studio.redoStack = []; studio.selection = { items: new Set(), source: null }; studio.engine.setCollection(studio.c); studio.emit('changed', { label: 'collection' }); },
  putDoc: (saved) => {
    studio.noSave = false;
    if (!saved) return;
    studio.collection = M.normalizeCollection(saved.c);
    studio.undoStack = []; studio.redoStack = [];
    studio.selection = { items: new Set(), source: null };
    studio.engine.setCollection(studio.c);
    if (studio.studioMode !== saved.studioMode) studio.setStudioMode(saved.studioMode);
    if (S().multiview) updateSettings({ multiview: false }, { quiet: true });
    workspace?.render();
    renderAll();
  },
};

/** Live parts that change without a re-render: meters, times, stats. */
function startLiveLoop() {
  const meterState = {};
  const frame = () => {
    if (!onStart() && S().showBottomPanel && S().bottomTab === 'mixer') Panels.updateMeters(root.querySelector('#bottom-panel'), studio, S(), meterState);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  setInterval(async () => {
    state.sys = await P.systemStats(null);
    if (onStart()) return;
    renderStatus();
    if (S().showRightPanel && root.querySelector('#right-panel [data-overview]')) renderRight();
    if (S().showBottomPanel && ['stats', 'controls', 'media'].includes(S().bottomTab) && !document.activeElement?.closest?.('#bottom-panel input')) renderBottom();
    if (S().showRightPanel && S().rightTab === 'props' && studio.engine?.runtime(selSourceId())?.mediaState?.()) { const box = root.querySelector(`[data-media-box="${CSS.escape(selSourceId())}"]`); const st = studio.engine.runtime(selSourceId()).mediaState(); if (box && document.activeElement?.dataset?.mediaSeek == null) box.outerHTML = Panels.mediaControlsHtml(selSourceId(), st); }
  }, 1000);
}

async function start() {
  renderShell();
  bindEvents();
  bindPopupActions();
  await popups.init();
  const welcomeLikely = desktop && S().showWelcome && S().showStartPage !== false && !globalThis.__MYBROADCASTING_NO_WELCOME && !new URLSearchParams(location.search).has('nowelcome');
  if (welcomeLikely) popups.prewarm('welcome');
  state.info = await native.appInfo().catch(() => null);
  if (S().animationRandom) updateSettings({ animation: randomAnimation(S().animation) }, { quiet: true });
  setInterval(tickStartBackground, 1000);
  native.setBackendLanguage(S().language);
  studio.general = S();
  studio.start();
  tools = new Tools(studio, { platform: P, run: (id, ctx) => run(id, ctx), notify: (kind, what) => notify('info', t('timer.fired', { what: t(`timer.${what}`) })) });
  tools.apply();
  studio.on('changed', () => { renderLater(); runProblemsSoon(); bindHotkeysSoon(); });
  studio.on('tweaked', () => {});
  studio.on('selection', () => renderLater());
  studio.on('program', () => renderLater());
  studio.on('preview', () => renderLater());
  studio.on('studio', () => renderLater());
  studio.on('outputs', () => renderLater());
  studio.on('collections', () => renderLater());
  studio.on('profile', () => { renderLater(); });
  const shownStatus = new Map();
  studio.on('source-changed', (rt) => {
    if (S().rightTab === 'props') scheduleRight();
    if (rt?.id && shownStatus.get(rt.id) !== rt.status) { shownStatus.set(rt.id, rt.status); if (!leftTimer) leftTimer = setTimeout(() => { leftTimer = 0; renderLeft(); }, 80); }
  });
  studio.on('log', () => { if (S().bottomTab === 'messages' && S().showBottomPanel) renderLaterBottom(); });
  studio.on('error', (error) => showError('error.unexpected', error));
  state.showStart = S().showStartPage !== false;
  applySettings({});
  await loadBackground();
  refreshDevices();
  loadFonts().then(() => scheduleRight());
  bindHotkeys();
  applyRemote();
  runProblemsSoon();
  startLiveLoop();

  if (desktop) {
    appWindow.onCloseRequested(async (event) => {
      if (state.quitting) return;
      event.preventDefault();
      if (await confirmExit()) { state.quitting = true; studio.save(); await native.quitApp(); }
    });
    getCurrentWebview().onDragDropEvent((event) => {
      const { type } = event.payload;
      if (type === 'enter' || type === 'over') setDropActive(true);
      else if (type === 'leave') setDropActive(false);
      else if (type === 'drop') { setDropActive(false); handleDroppedPaths(event.payload.paths ?? []); }
    });
    native.listen('fatal-error', (fatal) => { const error = new Error(fatal.message); error.stack = [fatal.location, fatal.backtrace].join('\n'); showError('error.fatal', error, fatal.location); });
    native.listen('remote-open', (e) => remote?.open(e.id));
    native.listen('remote-message', (e) => remote?.message(e.id, e.text));
    native.listen('remote-close', (e) => remote?.close(e.id));
  }
  trackMaximized();
  if (desktop) await appWindow.show();
  const startup = await native.startupFiles().catch(() => []);
  if (startup.length) { await handleDroppedPaths(startup); state.showStart = false; }
  renderAll();
  const welcome = S().showWelcome && state.showStart && !globalThis.__MYBROADCASTING_NO_WELCOME && !new URLSearchParams(location.search).has('nowelcome');
  if (welcome) openWelcome();
  else if (welcomeLikely) popups.close('welcome');
  if (desktop) {
    if (!welcome) await appWindow.setFocus();
    const warm = () => { popups.prewarm('menu').then(() => popups.prewarm('progress', { warm: true })); };
    if (welcome) popups.whenDrawn('welcome', 1500).then(() => setTimeout(warm, 200)); else setTimeout(warm, 400);
  }
}

let bottomQueued = 0;
function renderLaterBottom() { if (bottomQueued) return; bottomQueued = setTimeout(() => { bottomQueued = 0; renderBottom(); }, 200); }
let problemsTimer = 0;
function runProblemsSoon() { clearTimeout(problemsTimer); problemsTimer = setTimeout(runProblems, 600); }
let hotkeyTimer = 0;
function bindHotkeysSoon() { clearTimeout(hotkeyTimer); hotkeyTimer = setTimeout(bindHotkeys, 800); }

async function requestExit() { if (desktop) return appWindow.close(); return undefined; }
async function confirmExit() {
  if (!studio.isLive) return true;
  const choice = await ask({ kind: 'exit', icon: 'warning', title: t('confirm.exitTitle'), message: t('confirm.exitLive'), buttons: [{ id: 'cancel', label: t('common.cancel') }, { id: 'stop', label: t('confirm.exitStop'), icon: 'exit', danger: true, primary: true }] });
  if (choice !== 'stop') return false;
  await studio.stopAll();
  return true;
}

/** The welcome popup belongs to the start page: it opens there (Help › Welcome goes to the start page first) and closes when the start page is left. */
async function openWelcome() {
  if (!onStart()) showStartPage(true);
  updateSettings({ tutorialOffered: true }, { quiet: true });
  state.welcomeOpen = true;
  const result = await popups.open('welcome', {});
  state.welcomeOpen = false;
  if (result?.choice === 'tutorial') startTutorial();
  else if (result?.choice === 'sample') appApi.loadSample('talk');
}

// Test hook: E2E suites and the smoke script drive the app through this.
window.__mybroadcasting = {
  state, t, commands, popups, run, studio, M,
  menus: { MENUS, SUBMENUS, enabled: (id) => commandEnabled(id) },
  app: appApi,
  workspace: () => workspace,
  tools: () => tools,
  remote: () => remote,
  actions: { formInput, transformInput, audioInput, addSourceAsk, startStream, stopStream, startRecording, stopRecording, toggleReplay, saveReplay, screenshot, runProblems, importCollection, exportCollection, sendPrintContent, openForm, setView, pickCapture, autoConfigure, applyRemote, bindHotkeys, runHotkey },
  domain: { tutorialSteps: () => TUTORIAL_STEPS.length, SAMPLE_COLLECTIONS, FILTER_TYPES, SOURCE_TYPES, TRANSITION_TYPES },
  tutorial: () => tutorial,
  startBackground: () => startBackground,
  mulToFader,
};

start().catch((error) => showError('error.unexpected', error, 'start')).finally(() => { if (desktop) appWindow.show().then(() => appWindow.setFocus()).catch(() => {}); });
