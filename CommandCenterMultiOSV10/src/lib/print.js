// Printing (Ctrl+P): the file under the cursor, or what the viewer / editor
// shows, on paper.
//
// A text file becomes a <pre> (optionally wrapped, with the file name and
// page numbers in the header / footer), an image an <img> scaled to the page.
// The document is self-contained — its own tiny stylesheet, black on white,
// nothing of the app's theme — and goes to
//
//   desktop  — electron/main.js printHtml: a hidden BrowserWindow renders it
//              and opens the system print dialog
//   web      — a hidden <iframe> and its window.print(): the browser's own
//              print dialog / preview
//
// Files the app cannot render itself (PDF, Office documents …) are handed to
// the OS instead (core: fs.print), which App decides on — see canPrintData.
import { isElectron } from './backend';

const electron = typeof window !== 'undefined' ? window.commandCenter : null;

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// True when the app can put this fs.readFile result on paper itself.
export function canPrintData(data) {
  if (!data) return false;
  if (data.kind === 'text') return !data.truncated;
  if (data.kind === 'image') return !data.truncated && !!data.base64;
  return false;
}

// spec: { title, name, kind: 'text' | 'image', text, mime, base64, wrap, fontSize, hex }
export function buildPrintHtml(spec) {
  const title = esc(spec.title || spec.name || '');
  const fontSize = Math.max(6, Math.min(24, Number(spec.fontSize) || 10));
  const body = spec.kind === 'image'
    ? `<div class="image"><img src="data:${esc(spec.mime || 'image/png')};base64,${spec.base64}" alt="${title}"></div>`
    : `<pre class="${spec.wrap === false ? 'nowrap' : 'wrap'}">${esc(spec.text)}</pre>`;
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>
  @page { margin: 15mm 14mm 16mm; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000; }
  body { font-family: -apple-system, "Segoe UI", "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans CJK KR", Roboto, Helvetica, Arial, sans-serif; font-size: ${fontSize}pt; }
  header { font-size: 8pt; color: #444; border-bottom: 1px solid #999; padding-bottom: 3px; margin-bottom: 8px; display: flex; justify-content: space-between; gap: 12px; }
  header .name { overflow-wrap: anywhere; }
  header .meta { white-space: nowrap; }
  pre { margin: 0; font-family: "Cascadia Mono", Consolas, "D2Coding", "Menlo", "DejaVu Sans Mono", monospace; font-size: ${fontSize}pt; line-height: 1.35; tab-size: ${Number(spec.tabSize) || 4}; }
  pre.wrap { white-space: pre-wrap; overflow-wrap: anywhere; }
  pre.nowrap { white-space: pre; }
  .image { text-align: center; }
  .image img { max-width: 100%; max-height: 250mm; object-fit: contain; }
  @media screen { body { padding: 16px; } }
</style>
</head>
<body>
<header><span class="name">${title}</span><span class="meta">${esc(spec.meta || '')}</span></header>
${body}
</body>
</html>`;
}

// Opens the print dialog for the document. Resolves { ok } when it was sent to the printer,
// { ok:false, cancelled:true } when the user backed out (not an error) — the browser cannot tell the
// two apart, so there every closed dialog counts as { ok: true }. Rejects on a real failure.
export async function printDocument({ html, title }) {
  if (isElectron && electron && electron.printHtml) {
    const r = await electron.printHtml({ html, title });
    if (!r || !r.ok) throw new Error(r && r.error ? r.error.message : 'print error');
    if (r.data && r.data.error) throw new Error(r.data.error);
    return r.data || { ok: true };
  }
  return printInFrame(html);
}

let frame = null;
function printInFrame(html) {
  return new Promise((resolve, reject) => {
    if (frame) { try { frame.remove(); } catch { /* gone */ } frame = null; }
    const f = document.createElement('iframe');
    f.setAttribute('aria-hidden', 'true');
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
    frame = f;
    let done = false;
    const finish = (fn) => { if (done) return; done = true; setTimeout(() => { if (frame === f) { f.remove(); frame = null; } }, 500); fn(); };
    f.onload = () => {
      const w = f.contentWindow;
      if (!w) { finish(() => reject(new Error('print frame unavailable'))); return; }
      // Wait for the image (if any) to decode, then print. afterprint fires once the dialog closes
      // — for a print or a cancel alike.
      const go = () => {
        w.addEventListener('afterprint', () => finish(() => resolve({ ok: true })));
        try { w.focus(); w.print(); } catch (err) { finish(() => reject(err)); return; }
        // Browsers that never fire afterprint (some mobile ones): tidy up after a while.
        setTimeout(() => finish(() => resolve({ ok: true })), 60000);
      };
      const img = w.document.querySelector('img');
      if (img && !img.complete) { img.onload = go; img.onerror = go; } else setTimeout(go, 50);
    };
    document.body.appendChild(f);
    f.srcdoc = html;
  });
}
