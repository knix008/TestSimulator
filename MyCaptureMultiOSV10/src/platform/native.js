// JavaScript ↔ Rust boundary. Every call goes through here.
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { t } from '../i18n.js';

export const isDesktopShell = () => Boolean(window.__TAURI_INTERNALS__);

function call(command, args, options) {
  if (!isDesktopShell()) {
    return Promise.reject(new Error(t('native.desktopOnly')));
  }
  return invoke(command, args, options);
}

export const errorText = (error) => (error instanceof Error ? error.message : String(error ?? t('native.unknown')));

export const platformInfo = () => call('platform_info');
/** Backend error messages follow the UI language. */
export const setBackendLanguage = (language) => call('set_language', { language });
export const defaultDirectories = () => call('default_directories');
export const listSources = () => call('list_sources');
export const sourceThumbnail = (source, maxEdge = 640) => call('source_thumbnail', { source, maxEdge });
export const monitorInfo = (id) => call('monitor_info', { id });

export const grab = (source) => call('grab', { source });
export const savePending = (output, format, jpegQuality) => call('save_pending', { output, format, jpegQuality });
export const copyPending = () => call('copy_pending');
export const copyImageFile = (path) => call('copy_image_file', { path });
export const copyText = (text) => call('copy_text', { text });

export const beginRegionSelect = () => call('begin_region_select');
export const overlayReady = () => call('overlay_ready');
export const finishRegionSelect = (selection) => call('finish_region_select', { selection });
export const showMain = () => call('show_main');
export const showRecordingPanel = (monitorId) => call('show_recording_panel', { monitorId: monitorId ?? null });
export const hideRecordingPanel = () => call('hide_recording_panel');

/** Decodes the `[u32 width][u32 height][RGBA…]` frames the backend sends. */
export function decodeFrame(buffer) {
  const bytes = buffer instanceof ArrayBuffer ? buffer : new Uint8Array(buffer).buffer;
  const header = new DataView(bytes, 0, 8);
  const width = header.getUint32(0, true);
  const height = header.getUint32(4, true);
  return { width, height, pixels: new Uint8ClampedArray(bytes, 8, width * height * 4) };
}

export const overlayFrame = async () => decodeFrame(await call('overlay_frame'));
export const grabFrame = async (source) => decodeFrame(await call('grab_frame', { source }));
/** MyCapture's own main window as a capture source (normally it is left out of every capture). */
export const APP_SOURCE = Object.freeze({ kind: 'app' });
export const setSelfRecording = (on) => call('set_self_recording', { on });

export const recordingOpen = (output, format) => call('recording_open', { output, format });
export const recordingWrite = (id, bytes) =>
  call('recording_write', bytes, { headers: { 'x-recording-id': String(id) } });
export const recordingFinish = (id, durationMs) => call('recording_finish', { id, durationMs });
export const recordingAbort = (id) => call('recording_abort', { id });

export const revealPath = (path) => call('reveal_path', { path });
export const pathsExist = (paths) => call('paths_exist', { paths });
/** Allows the file for the viewer and returns its asset URL, or null when the file is gone. */
export async function previewUrl(path) {
  return (await call('allow_preview', { path })) ? convertFileSrc(path) : null;
}
export const openPath = (path) => call('open_path', { path });
