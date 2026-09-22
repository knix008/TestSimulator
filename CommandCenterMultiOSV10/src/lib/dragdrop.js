// Drag & drop between the panels and the outside world (Explorer / Finder / the
// desktop / the browser).
//
//   out   — a row is dragged: on the desktop the HTML5 drag is cancelled and a
//           native one takes its place (electron/ipc.js drag:start), so the
//           files land wherever the OS lets them; in the browser the drag
//           carries the paths (for the other panel) and, for a single file,
//           a DownloadURL that Chromium turns into a download on the desktop.
//   in    — a drop on a panel: paths of our own (the other panel, or the
//           native drag coming back), files from the OS (desktop: their paths;
//           browser: uploaded through server.js /api/upload, folders walked
//           with the FileSystem entry API).
//
// Copy is the default, Shift while dropping moves — the panels' own drags only:
// a drop from Explorer is always a copy, so the source never deletes anything.
import { isElectron, droppedFilePath, startNativeDrag } from './backend';

const MIME_PATHS = 'application/x-commandcenter-paths';

// The paths of the drag this window started (a native drag has no data of its own to read at the drop).
let dragging = null;

export function draggingPaths() { return dragging; }

// dragstart on a row: `paths` are the entries that travel (the selection, or the row alone).
export function beginDrag(ev, entries) {
  const paths = entries.map((e) => e.path);
  if (!paths.length) { ev.preventDefault(); return; }
  dragging = paths;
  if (isElectron) {
    ev.preventDefault();
    // The drop event of a drag that ends on one of our own panels can reach the renderer a moment
    // after the native drag has returned, so the paths stay known a little longer.
    startNativeDrag(paths).catch(() => {}).then(() => setTimeout(() => { if (dragging === paths) dragging = null; }, 300));
    return;
  }
  const dt = ev.dataTransfer;
  dt.effectAllowed = 'copyMove';
  dt.setData(MIME_PATHS, JSON.stringify(paths));
  dt.setData('text/plain', paths.join('\n'));
  if (entries.length === 1 && !entries[0].isDir) {
    // Chromium only: dropping the row on the desktop downloads the file.
    const url = new URL(`./api/download?path=${encodeURIComponent(paths[0])}`, window.location.href);
    try { const tok = sessionStorage.getItem('cc-token'); if (tok) url.searchParams.set('token', tok); } catch { /* no storage */ }
    dt.setData('DownloadURL', `application/octet-stream:${entries[0].name.replace(/[:]/g, '_')}:${url.href}`);
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
