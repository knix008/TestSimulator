// The script window (010 Editor "Scripts"): the template language in script mode changes the document — Write*,
// InsertBytes, DeleteBytes, Printf … (crates/hexcore/src/pattern, `script`). The main window runs it on the active
// document and applies every edit as one undo step (host.js runScript); output and errors are shown here.
import { icon } from '../icons.js';
import { t } from '../i18n.js';

export const SCRIPT_KEY = 'myhexa.script.v1';
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Example scripts (the same language as the templates, plus Write*, InsertBytes, DeleteBytes, Printf …). */
export const SCRIPT_EXAMPLES = {
  xorSelection: `// XOR every byte of the selection (or the whole file) with a key
let start = SelectionLength() ? SelectionStart() : 0;
let n = SelectionLength() ? SelectionLength() : FileSize();
for (let i = 0; i < n; i++)
    WriteU8(start + i, ReadU8(start + i) ^ 0x5A);
Printf("XOR 5Ah: %d bytes from %08Xh\\n", n, start);`,
  report: `// Print a short report: size, hashes, how often "PK" occurs
Printf("Size     : %d bytes\\n", FileSize());
Printf("CRC-32   : %08X\\n", Checksum("crc32"));
Printf("SHA-256  : %s\\n", Hash("sha256"));
let n = FindAll("50 4B");
Printf("'PK'     : %d times\\n", n);
for (let i = 0; i < n && i < 5; i++)
    Printf("  at %08Xh\\n", FindAt(i));`,
  swap32: `// Swap the byte order of every 32-bit word in the selection
let start = SelectionStart();
let n = SelectionLength() / 4;
for (let i = 0; i < n; i++) {
    let o = start + i * 4;
    let v = ReadU32(o);
    WriteU32BE(o, v);
}
Printf("%d words swapped\\n", n);`,
  insertHeader: `// Put a 16-byte header in front: magic, version, the old size
let size = FileSize();
InsertBytes(0, 16, 0);
WriteString(0, "MYHX");
WriteU16(4, 1);
WriteU32(8, size);
Printf("Header added, %d → %d bytes\\n", size, FileSize());`,
  stripZeros: `// Delete the zero bytes at the end of the file
let n = 0;
while (FileSize() > 0 && ReadU8(FileSize() - 1) == 0) {
    DeleteBytes(FileSize() - 1, 1);
    n++;
}
Printf("%d trailing zero bytes removed\\n", n);`,
};

let s = null;
export function resetScript() { s = null; }

export function scriptBody(c) {
  const g = (s ??= { source: (() => { try { return localStorage.getItem(SCRIPT_KEY) ?? SCRIPT_EXAMPLES.xorSelection; } catch { return SCRIPT_EXAMPLES.xorSelection; } })(), result: null, example: 'xorSelection' });
  const examples = Object.keys(SCRIPT_EXAMPLES).map((id) => [id, t(`script.example.${id}`)]);
  let result = '';
  if (g.result) {
    const r = g.result;
    const summary = r.applied ? t('script.applied', { n: r.edits, size: r.size.toLocaleString() }) : r.edits ? t('script.notApplied') : t('script.noEdits');
    result = `<h3 class="section-title">${icon(r.completed === false ? 'warning' : 'check')}<span>${esc(summary)}</span>${r.returned != null ? `<span class="chip">${esc(t('script.returned'))}: ${esc(r.returned)}</span>` : ''}</h3>
      ${(r.errors ?? []).map((e) => `<div class="tw-error">${icon('error')}<span>${esc(`${t('template.line', { line: e.line, col: e.col })} ${e.message}`)}</span></div>`).join('')}
      <pre class="tw-output script-output" data-script-output>${esc(r.output || t('script.noOutput'))}</pre>`;
  }
  const html = `<div class="tw-line">${c.sel('script-example', examples, g.example, t('script.examples'), 'bulb')}${c.btn('script-example-load', t('script.useExample'), 'bulb', 'small')}
      ${c.btn('script-load', t('template.loadFile'), 'folderOpen', 'small')}${c.btn('script-save', t('template.saveFile'), 'save', 'small')}<span class="grow"></span>${c.btn('script-run', t('script.run'), 'play', 'primary')}</div>
    <p class="tw-message muted">${esc(t('script.hint'))}</p>
    <textarea class="tw-code script-code" data-tw="script-source" spellcheck="false" wrap="off">${esc(g.source)}</textarea>${c.errorLine()}${result}`;
  return { icon: 'code', title: t('tool.script'), html };
}

export async function scriptClick(c, target) {
  const act = target.closest('[data-tw-act]')?.dataset.twAct;
  if (!act?.startsWith('script-') || !s) return false;
  if (act === 'script-run') {
    try { localStorage.setItem(SCRIPT_KEY, s.source); } catch { /* full */ }
    const r = await c.guarded(() => c.call('runScript', { source: s.source }));
    if (r) { s.result = r; c.redraw(); }
  } else if (act === 'script-example-load') { s.source = SCRIPT_EXAMPLES[s.example] ?? s.source; s.result = null; c.redraw(); }
  else if (act === 'script-load') { const r = await c.guarded(() => c.call('loadTextFile', { types: ['1sc', 'hexscript'] })); if (r) { s.source = r.source; c.redraw(); } }
  else if (act === 'script-save') await c.guarded(() => c.call('saveTextFile', { source: s.source, name: 'script.hexscript' }));
  return true;
}

export function scriptChange(el) {
  if (!s) return false;
  if (el.dataset.tw === 'script-example') { s.example = el.value; return true; }
  if (el.dataset.tw === 'script-source') { s.source = el.value; return true; }
  return false;
}
