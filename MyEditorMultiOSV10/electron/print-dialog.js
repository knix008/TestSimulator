// Printer dialog HTML: page preview + destination / copies / colour / layout.
// Electron's Windows print dialog has no Chromium preview WebUI, so this
// window is the printer dialog. The document itself is printed from a hidden
// BrowserWindow (see printHtml in main.js).
const DEFAULT_LABELS = {
  print: '인쇄',
  close: '취소',
  destination: '프린터',
  copies: '매수',
  color: '색',
  colorColor: '컬러',
  colorMono: '흑백',
  layout: '방향',
  portrait: '세로',
  landscape: '가로',
  noPrinters: '설치된 프린터가 없습니다. 기본 프린터로 인쇄합니다.',
  printing: '인쇄하는 중…',
  failed: '인쇄하지 못했습니다',
};

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function mergeLabels(labels) {
  const src = labels && typeof labels === 'object' ? labels : {};
  return {
    ...DEFAULT_LABELS,
    print: src.print || DEFAULT_LABELS.print,
    close: src.close || DEFAULT_LABELS.close,
    destination: src.destination || DEFAULT_LABELS.destination,
    copies: src.copies || DEFAULT_LABELS.copies,
    color: src.color || DEFAULT_LABELS.color,
    colorColor: src.colorColor || DEFAULT_LABELS.colorColor,
    colorMono: src.colorMono || DEFAULT_LABELS.colorMono,
    layout: src.layout || DEFAULT_LABELS.layout,
    portrait: src.portrait || DEFAULT_LABELS.portrait,
    landscape: src.landscape || DEFAULT_LABELS.landscape,
    noPrinters: src.noPrinters || DEFAULT_LABELS.noPrinters,
    printing: src.printing || DEFAULT_LABELS.printing,
    failed: src.failed || DEFAULT_LABELS.failed,
  };
}

function normalizePrinters(list) {
  const rows = Array.isArray(list) ? list : [];
  return rows
    .map((p) => ({
      name: String((p && (p.name || p.displayName)) || '').trim(),
      displayName: String((p && (p.displayName || p.name)) || '').trim(),
      isDefault: !!(p && p.isDefault),
    }))
    .filter((p) => p.name);
}

function printerOptionsHtml(printers) {
  const rows = normalizePrinters(printers);
  if (!rows.length) return '<option value="">(default)</option>';
  const hasDefault = rows.some((p) => p.isDefault);
  return rows.map((p, i) => {
    const sel = p.isDefault || (!hasDefault && i === 0) ? ' selected' : '';
    return `<option value="${escapeHtml(p.name)}"${sel}>${escapeHtml(p.displayName || p.name)}</option>`;
  }).join('');
}

function buildPrintDialogHtml({ title, html, printers, labels } = {}) {
  const L = mergeLabels(labels);
  const heading = escapeHtml(title || L.print);
  const rows = normalizePrinters(printers);
  const options = printerOptionsHtml(rows);
  const emptyHint = rows.length ? '' : `<p class="hint" id="med-noprinter">${escapeHtml(L.noPrinters)}</p>`;
  const docJson = JSON.stringify(String(html || ''));
  const labelJson = JSON.stringify(L);
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>${heading}</title>
<style>
html,body{margin:0;height:100%;background:#525659;color:#1b1b1b;font:13px/1.4 "Segoe UI","Malgun Gothic","Apple SD Gothic Neo",sans-serif}
#med-print-dialog{display:flex;height:100%;min-height:0}
#med-preview-pane{flex:1;min-width:0;display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:28px 24px;box-sizing:border-box}
#med-sheet{width:794px;min-height:1123px;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.28),0 10px 28px rgba(0,0,0,.28);transform-origin:top center;flex:none}
#med-sheet.landscape{width:1123px;min-height:794px}
#med-sheet iframe{display:block;width:100%;height:100%;border:0;background:#fff}
#med-sidebar{width:320px;flex:none;display:flex;flex-direction:column;background:#fff;border-left:1px solid #c8c9cc;box-sizing:border-box}
#med-sidebar h1{margin:0;padding:16px 18px 10px;font-size:16px;font-weight:600}
#med-sidebar .fields{flex:1;overflow:auto;padding:4px 18px 12px}
#med-sidebar label{display:block;margin:12px 0 4px;color:#444;font-size:12px}
#med-sidebar select,#med-sidebar input[type=number]{width:100%;box-sizing:border-box;height:32px;padding:0 8px;border:1px solid #b6b8bb;border-radius:4px;background:#fff;font:inherit}
#med-sidebar .hint{margin:10px 0 0;color:#666;font-size:12px}
#med-err{min-height:1.3em;margin:10px 18px 0;color:#b3261e;font-size:12px}
#med-actions{display:flex;justify-content:flex-end;gap:8px;padding:14px 18px 16px;border-top:1px solid #e3e4e6}
#med-actions button{font:inherit;padding:6px 16px;border:1px solid #b6b8bb;background:#fff;border-radius:4px;cursor:pointer}
#med-actions button.primary{background:#0b57d0;color:#fff;border-color:#0b57d0}
#med-actions button:disabled{opacity:.55;cursor:default}
</style>
</head>
<body>
<div id="med-print-dialog">
  <div id="med-preview-pane">
    <div id="med-sheet"><iframe id="med-preview" title="${heading}" sandbox="allow-same-origin"></iframe></div>
  </div>
  <aside id="med-sidebar">
    <h1>${heading}</h1>
    <div class="fields">
      <label for="med-printer">${escapeHtml(L.destination)}</label>
      <select id="med-printer">${options}</select>
      ${emptyHint}
      <label for="med-copies">${escapeHtml(L.copies)}</label>
      <input id="med-copies" type="number" min="1" max="99" value="1">
      <label for="med-layout">${escapeHtml(L.layout)}</label>
      <select id="med-layout">
        <option value="portrait" selected>${escapeHtml(L.portrait)}</option>
        <option value="landscape">${escapeHtml(L.landscape)}</option>
      </select>
      <label for="med-color">${escapeHtml(L.color)}</label>
      <select id="med-color">
        <option value="color" selected>${escapeHtml(L.colorColor)}</option>
        <option value="mono">${escapeHtml(L.colorMono)}</option>
      </select>
    </div>
    <div id="med-err"></div>
    <div id="med-actions">
      <button type="button" id="med-cancel">${escapeHtml(L.close)}</button>
      <button type="button" class="primary" id="med-go">${escapeHtml(L.print)}</button>
    </div>
  </aside>
</div>
<script>
const DOC_HTML = ${docJson};
const LABELS = ${labelJson};
const pane = document.getElementById('med-preview-pane');
const sheet = document.getElementById('med-sheet');
const frame = document.getElementById('med-preview');
const layout = document.getElementById('med-layout');
function paperSize() {
  const land = layout.value === 'landscape';
  return { w: land ? 1123 : 794, h: land ? 794 : 1123 };
}
function fit() {
  const { w, h } = paperSize();
  const pad = 56;
  const sx = Math.max(0.2, (pane.clientWidth - pad) / w);
  const sy = Math.max(0.2, (pane.clientHeight - pad) / Math.max(h, sheet.offsetHeight || h));
  const s = Math.min(1, sx, sy);
  sheet.style.width = w + 'px';
  sheet.style.transform = 'scale(' + s + ')';
  const usedH = Math.max(sheet.offsetHeight, h) * s;
  pane.style.paddingTop = Math.max(16, (pane.clientHeight - usedH) / 2) + 'px';
}
function applyLayout() {
  sheet.classList.toggle('landscape', layout.value === 'landscape');
  const { h } = paperSize();
  const doc = frame.contentDocument;
  const contentH = doc ? Math.max(doc.documentElement.scrollHeight, (doc.body && doc.body.scrollHeight) || 0, h) : h;
  sheet.style.minHeight = contentH + 'px';
  sheet.style.height = contentH + 'px';
  fit();
}
frame.addEventListener('load', applyLayout);
layout.addEventListener('change', applyLayout);
new ResizeObserver(fit).observe(pane);
frame.srcdoc = DOC_HTML;
document.getElementById('med-cancel').addEventListener('click', () => {
  if (window.medPrint) window.medPrint.cancel();
  else window.close();
});
document.getElementById('med-go').addEventListener('click', async () => {
  const btn = document.getElementById('med-go');
  const err = document.getElementById('med-err');
  err.textContent = '';
  const prev = btn.textContent;
  btn.disabled = true;
  btn.textContent = LABELS.printing;
  const opts = {
    deviceName: document.getElementById('med-printer').value,
    copies: Number(document.getElementById('med-copies').value) || 1,
    color: document.getElementById('med-color').value !== 'mono',
    landscape: layout.value === 'landscape',
  };
  try {
    const r = window.medPrint ? await window.medPrint.print(opts) : null;
    if (r && r.success) {
      if (window.medPrint) window.medPrint.cancel();
      else window.close();
      return;
    }
    err.textContent = (r && r.failureReason) || LABELS.failed;
  } catch (e) {
    err.textContent = LABELS.failed;
  }
  btn.disabled = false;
  btn.textContent = prev;
});
</script>
</body>
</html>`;
}

module.exports = {
  DEFAULT_LABELS,
  mergeLabels,
  normalizePrinters,
  printerOptionsHtml,
  buildPrintDialogHtml,
};
