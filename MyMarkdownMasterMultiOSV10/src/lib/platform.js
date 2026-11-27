// Where the exports go, for lib/export.js. Desktop (Tauri): the system save dialog and the Rust file
// commands; PDF and printing through the render window (src/render.js). Web: downloads (or the File
// System Access save picker) and the browser's own print dialog ("Save as PDF").
import { listen } from '@tauri-apps/api/event';
import * as native from '../platform/native.js';
import { computePageMap, loadHtml, pagedPolyfill } from './paginate.js';

/** Set by the app: the folder the save dialogs open in, the dark/light look of the print window. */
const host = { defaultDir: () => null, dark: () => false, title: () => '' };
export function configurePlatform(options) { Object.assign(host, options); }

/** A path chosen beforehand (the app asks before showing the progress window): the next save uses it. */
let presetPath = null;
export function presetSavePath(path) { presetPath = path; }

export const canWriteInPlace = native.isDesktop();

const MIME = { md: 'text/markdown', html: 'text/html', doc: 'application/msword', pdf: 'application/pdf', txt: 'text/plain' };
const extensionOf = (name) => (/\.([a-z0-9]+)$/i.exec(name ?? '')?.[1] ?? '').toLowerCase();
const joinDir = (dir, name) => (dir ? `${dir.replace(/[\\/]+$/, '')}${dir.includes('\\') ? '\\' : '/'}${name}` : name);

/** The save dialog (desktop) for `defaultName`: the chosen path, or null. */
async function choosePath(defaultName) {
  if (presetPath) { const path = presetPath; presetPath = null; return path; }
  const type = extensionOf(defaultName);
  return native.chooseSavePath(joinDir(host.defaultDir(), defaultName), [native.SAVE_TYPES[type] ? type : 'txt']);
}

/** Saves text under a name the user confirms: the path (desktop), the file name (web), or null when cancelled. */
export async function saveText({ defaultName, content }) {
  if (native.isDesktop()) {
    const path = await choosePath(defaultName);
    if (!path) return null;
    await native.writeTextFile(path, content, '');
    return path;
  }
  const saved = await native.saveFileWeb(content, { name: defaultName, mime: `${MIME[extensionOf(defaultName)] ?? 'text/plain'};charset=utf-8` });
  return saved?.name ?? null;
}

/** Save (not Save as): over a file chosen earlier, no dialog. Desktop only. */
export async function writeTextTo(filePath, content) {
  if (!canWriteInPlace || !filePath) return null;
  await native.writeTextFile(filePath, content, '');
  return filePath;
}

/** Page numbers of headings and pictures from a layout pass (null when it fails). */
export const computeTocPageMap = (html) => computePageMap(html);

/** Waits for the render window's answer. */
function renderDone(timeout) {
  return new Promise((resolve, reject) => {
    let unlisten = null;
    const timer = setTimeout(() => { unlisten?.(); reject(new Error('The document could not be laid out in time')); }, timeout);
    listen('render-done', (event) => { clearTimeout(timer); unlisten?.(); resolve(event.payload ?? {}); }).then((stop) => { unlisten = stop; });
  });
}

/** Web: the document in a new tab, laid out by paged.js, then the browser's print dialog. */
async function printInTab(html) {
  const win = globalThis.open('', '_blank');
  if (!win) throw new Error('The browser blocked the print window (allow pop-ups for this page).');
  loadHtml(win.document, html);
  win.PagedConfig = { auto: true, after: () => setTimeout(() => { win.focus(); win.print(); }, 200) };
  const script = win.document.createElement('script');
  script.textContent = await pagedPolyfill();
  win.document.head.append(script);
}

/**
 * PDF: desktop on Windows writes the file itself (the save dialog first); elsewhere the print dialog
 * opens with the laid-out pages ("Save as PDF"). Returns the path / name, or null when cancelled.
 */
export async function exportPdf({ html, defaultName }) {
  if (!native.isDesktop()) { await printInTab(html); return defaultName; }
  const windows = /windows/i.test(navigator.userAgent);
  if (!windows) { await printDocument({ html }); return defaultName; }
  const path = await choosePath(defaultName);
  if (!path) return null;
  const answer = renderDone(180_000);
  try {
    await native.openRenderWindow({ mode: 'pdf', html, path, title: host.title() });
    const result = await answer;
    if (!result.ok) throw new Error(result.error || 'PDF failed');
    return path;
  } finally {
    native.closeRenderWindow();
  }
}

/** The print window's Print button: the pages straight to a printer (Windows), no dialog. */
export async function printDirect({ html, printer, copies, widthMm, heightMm, pageRanges }) {
  const answer = renderDone(180_000);
  try {
    await native.openRenderWindow({ mode: 'direct', html, path: '', title: host.title(), printer, copies, widthMm, heightMm, pageRanges });
    const result = await answer;
    if (!result.ok) throw new Error(result.error || 'Printing failed');
    return result;
  } finally {
    native.closeRenderWindow();
  }
}

/** The pages as a PDF at `path` (a file printer such as Microsoft Print to PDF: the app writes the file itself). */
export async function printToPdfFile({ html, path, widthMm, heightMm }) {
  const answer = renderDone(180_000);
  try {
    await native.openRenderWindow({ mode: 'pdf', html, path, title: host.title(), widthMm, heightMm });
    const result = await answer;
    if (!result.ok) throw new Error(result.error || 'PDF failed');
    return path;
  } finally {
    native.closeRenderWindow();
  }
}

/** Printing: the laid-out pages in a print-preview window with the system print dialog. */
export async function printDocument({ html }) {
  if (!native.isDesktop()) { await printInTab(html); return { success: true }; }
  const answer = renderDone(180_000);
  await native.openRenderWindow({ mode: 'print', html, path: '', title: host.title() }, host.dark());
  const result = await answer;
  if (!result.ok) throw new Error(result.error || 'Printing failed');
  return { success: true };
}
