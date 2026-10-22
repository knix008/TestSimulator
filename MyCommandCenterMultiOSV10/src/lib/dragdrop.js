// Drag & drop between the panels and the outside world (Explorer / Finder / the
// desktop / the browser).
//
//   out   — a row is dragged. The desktop starts a native OS drag, so the files
//           can land on Explorer / Finder, the desktop, or another Command Center
//           window. The browser carries the paths for the other panel and, for a
//           single file, a DownloadURL.
//   in    — a drop on a panel: paths of our own (the other panel, or the
//           native drag coming back), files from the OS (desktop: their paths;
//           browser: uploaded through server.js /api/upload, folders walked
//           with the FileSystem entry API).
//
// Copy is the default. Shift moves — while dropping on a panel, or held as a
// desktop drag starts (so Explorer / Finder moves instead of copying). A drop
// the browser received from the OS is always a copy: those bytes are uploaded,
// and the original stays where it was.
import { isElectron, isTauri, droppedFilePath, startNativeDrag, apiUrl, dragMoveRequested } from './backend';

const MIME_PATHS = 'application/x-commandcenter-paths';

// The paths of the drag this window started (a native drag has no data of its own to read at the drop).
let dragging = null;

export function draggingPaths() { return dragging; }

// dragstart on a row: `paths` are the entries that travel (the selection, or the row alone).
export function beginDrag(ev, entries) {
  const paths = entries.map((e) => e.path);
  if (!paths.length) { ev.preventDefault(); return; }
  dragging = paths;
  if (isElectron || isTauri) {
    ev.preventDefault();
    // Shift at the start is the move gesture the OS drop target sees (Explorer, Finder,
    // another Command Center window). The drop back onto one of our panels reads Shift
    // again, at the moment it lands. The paths stay known briefly after the native drag
    // returns: the drop can arrive a moment later.
    const move = !!(ev.shiftKey && !ev.ctrlKey && !ev.metaKey);
    startNativeDrag(paths, move).catch(() => {}).then(() => setTimeout(() => { if (dragging === paths) dragging = null; }, 300));
    return;
  }
  const dt = ev.dataTransfer;
  dt.effectAllowed = 'copyMove';
  dt.setData(MIME_PATHS, JSON.stringify(paths));
  dt.setData('text/plain', paths.join('\n'));
  if (entries.length === 1 && !entries[0].isDir) {
    // Chromium only: dropping the row on the desktop downloads the file.
    const url = apiUrl('api/download', { path: paths[0] });
    dt.setData('DownloadURL', `application/octet-stream:${entries[0].name.replace(/[:]/g, '_')}:${url}`);
  }
}

export function endDrag() { dragging = null; }

// Whether the thing being dragged over is something a panel can take.
export function carriesFiles(ev) {
  const types = ev.dataTransfer ? Array.from(ev.dataTransfer.types || []) : [];
  return types.includes('Files') || types.includes(MIME_PATHS);
}

// True when the drag started in one of our panels (this window or, in the browser, another tab of the app).
export function isOwnDrag(ev) {
  if (dragging) return true;
  const types = ev.dataTransfer ? Array.from(ev.dataTransfer.types || []) : [];
  return types.includes(MIME_PATHS);
}

// 'move' | 'copy' for the drop cursor and the operation.
export function dropEffectFor(ev) {
  return ev.shiftKey && isOwnDrag(ev) ? 'move' : 'copy';
}

// Reads what was dropped. Must be called inside the drop handler (the data
// transfer is only readable then); the folder walk itself finishes later.
//   { paths }    — absolute paths on this machine (desktop, or the other panel)
//   { uploads }  — browser files from the OS: [{ file, rel }], `file` null for an empty folder
export async function readDrop(ev) {
  const dt = ev.dataTransfer;
  if (!dt) return { paths: [] };
  const own = dt.getData(MIME_PATHS);
  if (own) { try { const paths = JSON.parse(own); if (Array.isArray(paths) && paths.length) return { paths }; } catch { /* fall through */ } }
  if (dragging && dragging.length) return { paths: dragging };
  const files = Array.from(dt.files || []);
  if (isElectron) {
    const paths = files.map((f) => droppedFilePath(f)).filter(Boolean);
    return { paths };
  }
  // Browser: folders need the entry API (a File of a folder has no contents).
  const items = Array.from(dt.items || []);
  const entries = items.map((it) => (it.kind === 'file' && it.webkitGetAsEntry ? it.webkitGetAsEntry() : null));
  if (entries.some(Boolean)) {
    const uploads = [];
    for (const entry of entries) if (entry) await walkEntry(entry, '', uploads);
    return { uploads };
  }
  return { uploads: files.map((f) => ({ file: f, rel: f.name })) };
}

// Desktop file drops are delivered by the OS (Tauri's drag-drop), not as an HTML drop,
// so the page would otherwise never see a file dragged in from Explorer or from another
// window. Each event becomes `cc-osdrop` in CSS pixels. FilePanel decides which folder
// is under the cursor. `move` is filled in only for a drop, from the keys held then.
export function listenOsDrops() {
  if (!isTauri || typeof window === 'undefined') return () => {};
  let unlisten = () => {};
  let dead = false;
  import('@tauri-apps/api/webview').then(async ({ getCurrentWebview }) => {
    const fn = await getCurrentWebview().onDragDropEvent((event) => {
      const payload = event.payload;
      if (!payload) return;
      if (payload.type === 'leave') {
        window.dispatchEvent(new CustomEvent('cc-osdrop', { detail: { type: 'leave' } }));
        return;
      }
      const scale = window.devicePixelRatio || 1;
      const pos = payload.position || { x: 0, y: 0 };
      const detail = {
        type: payload.type,
        x: pos.x / scale,
        y: pos.y / scale,
        paths: payload.paths || [],
        move: false,
        handled: false,
      };
      if (payload.type !== 'drop') {
        window.dispatchEvent(new CustomEvent('cc-osdrop', { detail }));
        return;
      }
      dragMoveRequested().then((move) => {
        detail.move = !!move;
        window.dispatchEvent(new CustomEvent('cc-osdrop', { detail }));
      }).catch(() => {
        window.dispatchEvent(new CustomEvent('cc-osdrop', { detail }));
      });
    });
    if (dead) fn();
    else unlisten = fn;
  }).catch(() => {});
  return () => {
    dead = true;
    try { unlisten(); } catch { /* already gone */ }
  };
}

async function walkEntry(entry, prefix, out) {
  const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
  if (entry.isFile) {
    const file = await new Promise((resolve, reject) => entry.file(resolve, reject));
    out.push({ file, rel });
    return;
  }
  if (!entry.isDirectory) return;
  const reader = entry.createReader();
  let any = false;
  for (;;) {
    const batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
    if (!batch.length) break;
    any = true;
    for (const child of batch) await walkEntry(child, rel, out);
  }
  if (!any) out.push({ file: null, rel });
}
