// The tool windows (each an OS window of its own, `popup-<kind>`; a frame on the web): find and replace, go to,
// strings, disassembler, calculator, file recovery (carving), disks and process memory, compare, the template
// editor, the edit history, file tools (split, join, wipe) and `form` — the general options dialog the main
// window fills with fields (fill, operations, encryption, export options, …).
//
// A tool never touches documents itself: it asks the main window (`call(op, args)` → action "tool" → src/tools/host.js
// → reply "tool-reply"), because on the web a popup is a separate page with its own core.
import { icon } from '../icons.js';
import { t } from '../i18n.js';
import { bindProcessor, processorBody } from './processor.js';
import { filesystemBody, forensicsChange, forensicsClick, forensicsInput, resetForensics, yaraBody } from './forensics.js';

export const TOOL_SIZES = {
  form: { width: 560, height: 300 },
  find: { width: 720, height: 640 },
  goto: { width: 520, height: 330 },
  strings: { width: 860, height: 660 },
  disasm: { width: 900, height: 680 },
  calc: { width: 600, height: 560 },
  carve: { width: 860, height: 640 },
  devices: { width: 860, height: 620 },
  compare: { width: 640, height: 400 },
  template: { width: 980, height: 720 },
  history: { width: 600, height: 560 },
  filetools: { width: 680, height: 520 },
  processor: { width: 1180, height: 760 },
  filesystem: { width: 940, height: 700 },
  yara: { width: 980, height: 720 },
};
export const TOOL_KINDS = Object.keys(TOOL_SIZES);

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const hex8 = (n) => Number(n).toString(16).toUpperCase().padStart(8, '0');
const PER_PAGE = { find: 11, strings: 14, disasm: 16, carve: 11, devices: 12, history: 12, fs: 11, yara: 8 };

let ctx = null;
const st = {};
let seq = 0;
const waiting = new Map();
let bound = false;

/** Asks the main window (src/tools/host.js) to do `op`. */
function call(op, args = {}) {
  seq += 1;
  const id = seq;
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    ctx.action('tool', { tool: ctx.kind, op, args, seq: id });
    setTimeout(() => { if (waiting.has(id)) { waiting.delete(id); reject(new Error(t('tool.timeout'))); } }, 120_000);
  });
}

/** A message from the main window for this tool. */
export function toolHostMessage(message) {
  if (message?.type === 'tool-reply') {
    const w = waiting.get(message.seq);
    if (!w) return true;
    waiting.delete(message.seq);
    if (message.error) w.reject(new Error(message.error)); else w.resolve(message.result);
    return true;
  }
  if (message?.type === 'tool-caret' && ctx?.kind === 'disasm' && st.disasm?.follow) { runDisasm(message.offset); return true; }
  return false;
}

const busy = (on) => { st.busy = on; ctx.root.querySelector('.popup')?.classList.toggle('busy', on); };
async function guarded(work) {
  busy(true);
  st.error = '';
  try { return await work(); } catch (error) { st.error = String(error?.message ?? error); draw(); return null; } finally { busy(false); }
}

function pager(name, items) {
  const per = PER_PAGE[name] ?? 12;
  const pages = Math.max(1, Math.ceil(items.length / per));
  const page = Math.min(pages - 1, st.page?.[name] ?? 0);
  st.page = { ...(st.page ?? {}), [name]: page };
  const nav = pages > 1 ? `<span class="pager"><button class="icon-button" data-tw-page="${name}:-1" ${page ? '' : 'disabled'} title="${esc(t('common.prevPage'))}" aria-label="${esc(t('common.prevPage'))}">${icon('chevronLeft')}</button><span>${page + 1} / ${pages}</span><button class="icon-button" data-tw-page="${name}:1" ${page < pages - 1 ? '' : 'disabled'} title="${esc(t('common.nextPage'))}" aria-label="${esc(t('common.nextPage'))}">${icon('chevronRight')}</button></span>` : '';
  return [items.slice(page * per, (page + 1) * per), nav, page * per];
}

const sel = (key, options, current, label, glyph = '') => `<select data-tw="${key}" ${glyph ? `data-icon="${glyph}"` : ''} title="${esc(label)}" aria-label="${esc(label)}">${options.map(([v, l, g]) => `<option value="${esc(v)}" ${g ? `data-icon="${g}"` : ''} ${String(v) === String(current) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
const check = (key, label, on, glyph = '') => `<label class="tw-check" title="${esc(label)}"><input type="checkbox" data-tw="${key}" ${on ? 'checked' : ''} />${glyph ? icon(glyph) : ''}<span>${esc(label)}</span></label>`;
const input = (key, value, placeholder, extra = '') => `<input type="text" data-tw="${key}" value="${esc(value ?? '')}" placeholder="${esc(placeholder)}" aria-label="${esc(placeholder)}" spellcheck="false" ${extra} />`;
const btn = (action, label, glyph, cls = '', extra = '') => `<button class="button ${cls}" data-tw-act="${action}" title="${esc(label)}" ${extra}>${icon(glyph)}<span>${esc(label)}</span></button>`;
const errorLine = () => (st.error ? `<div class="tw-error">${icon('error')}<span>${esc(st.error)}</span></div>` : '');

function draw() {
  if (!ctx) return;
  if (ctx.kind === 'processor') bindProcessor({ root: ctx.root, get kind() { return ctx.kind; }, call, btn, guarded, redraw: draw });
  const body = ({ filesystem: () => filesystemBody(fctx), yara: () => yaraBody(fctx), processor: processorBody, form: formBody, find: findBody, goto: gotoBody, strings: stringsBody, disasm: disasmBody, calc: calcBody, carve: carveBody, devices: devicesBody, compare: compareBody, template: templateBody, history: historyBody, filetools: fileToolsBody })[ctx.kind]();
  const focus = document.activeElement?.dataset?.tw;
  const caretPos = document.activeElement?.selectionStart;
  ctx.root.innerHTML = ctx.frame({ glyph: body.icon, title: body.title, body: `<div class="tw tw-${ctx.kind}">${body.html}</div>`, foot: body.foot ?? `<span class="grow"></span>${ctx.button('close', t('common.close'), 'close')}` });
  if (focus) { const el = ctx.root.querySelector(`[data-tw="${focus}"]`); if (el) { el.focus(); try { if (caretPos != null) el.setSelectionRange(caretPos, caretPos); } catch { /* not text */ } } }
  if (ctx.kind === 'form' || ctx.kind === 'goto' || ctx.kind === 'compare') ctx.fitHeight();
  ctx.ready();
}

// ───────── form (general dialog)

function formBody() {
  const p = ctx.params;
  st.values ??= Object.fromEntries((p.fields ?? []).filter((f) => f.key).map((f) => [f.key, f.value ?? (f.type === 'check' ? false : '')]));
  const v = st.values;
  const groups = [];
  for (const f of p.fields ?? []) {
    const g = f.group ?? '';
    if (!groups.length || groups.at(-1).name !== g) groups.push({ name: g, fields: [] });
    groups.at(-1).fields.push(f);
  }
  const fieldHtml = (f) => {
    if (f.when && !Object.entries(f.when).every(([k, want]) => (Array.isArray(want) ? want.includes(v[k]) : v[k] === want))) return '';
    const label = `<span class="row-label">${icon(f.icon ?? 'edit')}<span>${esc(f.label)}</span></span>`;
    if (f.type === 'check') return `<label class="tw-check" title="${esc(f.label)}"><input type="checkbox" data-tw-field="${f.key}" ${v[f.key] ? 'checked' : ''} /><span>${esc(f.label)}</span></label>`;
    if (f.type === 'info') return `<div class="row"><span class="row-label">${icon(f.icon ?? 'info')}<span>${esc(f.label)}</span></span><span class="row-control"><span class="muted">${esc(f.value)}</span></span></div>`;
    let control;
    if (f.type === 'select') control = `<select data-tw-field="${f.key}" ${f.icon ? `data-icon="${f.icon}"` : ''} aria-label="${esc(f.label)}">${f.options.map(([val, l, g]) => `<option value="${esc(val)}" ${g ? `data-icon="${g}"` : ''} ${String(val) === String(v[f.key]) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    else if (f.type === 'segmented') control = `<span class="segmented">${f.options.map(([val, l]) => `<button class="segment ${String(val) === String(v[f.key]) ? 'active' : ''}" data-tw-seg="${f.key}" data-value="${esc(val)}" title="${esc(l)}">${esc(l)}</button>`).join('')}</span>`;
    else if (f.type === 'textarea') control = `<textarea data-tw-field="${f.key}" rows="${f.rows ?? 4}" placeholder="${esc(f.placeholder ?? '')}" spellcheck="false">${esc(v[f.key])}</textarea>`;
    else control = `<input type="text" data-tw-field="${f.key}" value="${esc(v[f.key])}" placeholder="${esc(f.placeholder ?? '')}" spellcheck="false" aria-label="${esc(f.label)}" />`;
    return `<div class="row" title="${esc(f.hint ?? f.label)}">${label}<span class="row-control">${control}</span></div>`;
  };
  const html = `${p.message ? `<p class="tw-message">${esc(p.message)}</p>` : ''}${groups.map((g) => `${g.name ? `<h3 class="section-title">${esc(g.name)}</h3>` : ''}<div class="${p.columns ? `tw-grid cols-${p.columns}` : 'tw-rows'}">${g.fields.map(fieldHtml).join('')}</div>`).join('')}${p.error ? `<div class="tw-error">${icon('error')}<span>${esc(p.error)}</span></div>` : ''}`;
  const foot = `<span class="grow"></span>${ctx.button('close', t('common.cancel'), 'close')}${btn('form-ok', p.okLabel ?? t('common.ok'), p.okIcon ?? 'check', 'primary')}`;
  return { icon: p.icon ?? 'edit', title: p.title ?? '', html, foot };
}

// ───────── find and replace

const KINDS = () => [['hex', t('find.kind.hex'), 'hexCode'], ['text', t('find.kind.text'), 'editorText'], ['regex', t('find.kind.regex'), 'regex'], ['int', t('find.kind.int'), 'hash'], ['float', t('find.kind.float'), 'calculate']];
const ENCODINGS = [['utf8', 'UTF-8'], ['ascii', 'ASCII'], ['latin1', 'Latin-1'], ['cp1252', 'Windows-1252'], ['utf16le', 'UTF-16 LE'], ['utf16be', 'UTF-16 BE'], ['utf32le', 'UTF-32 LE'], ['utf32be', 'UTF-32 BE'], ['euc-kr', 'EUC-KR'], ['shift_jis', 'Shift_JIS'], ['gb18030', 'GB18030'], ['big5', 'Big5'], ['cp437', 'CP437'], ['ebcdic', 'EBCDIC']];

function findState() {
  const s = ctx.settings;
  return (st.find ??= { kind: s.searchKind, value: ctx.params.value ?? s.searchHistory?.[0]?.value ?? '', encoding: s.searchEncoding, caseSensitive: s.searchCase, width: 4, endian: s.endian, wrap: s.searchWrap, scope: 'all', rkind: 'hex', rvalue: '', results: null, replace: Boolean(ctx.params.replace) });
}
const patternOf = (f) => ({ kind: f.kind, value: f.value, encoding: f.encoding, caseSensitive: f.caseSensitive, width: Number(f.width), endian: f.endian });

function findBody() {
  const f = findState();
  const s = ctx.settings;
  const history = (s.searchHistory ?? []).slice(0, 12);
  const numeric = f.kind === 'int' || f.kind === 'float';
  const opts = `<div class="tw-line">
      ${sel('kind', KINDS(), f.kind, t('find.kind'), 'search')}
      ${f.kind === 'text' ? sel('encoding', ENCODINGS, f.encoding, t('find.encoding'), 'globe') : ''}
      ${numeric ? sel('width', (f.kind === 'float' ? [4, 8] : [1, 2, 4, 8]).map((w) => [w, t('find.width', { n: w })]), f.width, t('find.widthLabel'), 'ruler') : ''}
      ${numeric ? sel('endian', [['le', t('endian.le')], ['be', t('endian.be')]], f.endian, t('find.endian'), 'swap') : ''}
      ${f.kind === 'text' || f.kind === 'regex' ? check('caseSensitive', t('find.case'), f.caseSensitive, 'caseSensitive') : ''}
      ${check('wrap', t('find.wrap'), f.wrap, 'refresh')}
      ${sel('scope', [['all', t('scope.all')], ['selection', t('scope.selectionOnly')], ['files', t('find.inFiles')]], f.scope, t('find.scope'), 'selectAll')}
    </div>`;
  const files = f.scope === 'files' ? `<div class="tw-line">${btn('fif-files', t('find.addFiles'), 'plus', 'small')}${ctx.desktop ? btn('fif-folder', t('find.addFolder'), 'folderOpen', 'small') : ''}${ctx.desktop ? check('recursive', t('find.recursive'), f.recursive !== false, 'layers') : ''}
      <span class="muted tw-text">${esc((f.files ?? []).map((x) => x.name).join(', ') || t('find.noFiles'))}</span>${(f.files ?? []).length ? btn('fif-clear', t('find.clearFiles'), 'close', 'small') : ''}</div>` : '';
  const what = `<div class="row"><span class="row-label">${icon('search')}<span>${esc(t('find.what'))}</span></span><span class="row-control">${input('value', f.value, t(`find.placeholder.${f.kind}`), 'list="tw-history" data-autofocus')}<datalist id="tw-history">${history.map((x) => `<option value="${esc(x.value)}">${esc(t(`find.kind.${x.kind}`))}</option>`).join('')}</datalist></span></div>`;
  const repl = `<div class="row"><span class="row-label">${icon('replace')}<span>${esc(t('find.with'))}</span></span><span class="row-control">${sel('rkind', [['hex', t('find.kind.hex')], ['text', t('find.kind.text')], ['int', t('find.kind.int')]], f.rkind, t('find.kind'), 'replace')}${input('rvalue', f.rvalue, t(`find.placeholder.${f.rkind}`))}</span></div>`;
  const buttons = f.scope === 'files'
    ? `<div class="tw-line tw-buttons"><span class="grow"></span>${btn('fif-run', t('find.inFilesRun'), 'search', 'primary', (f.files ?? []).length ? '' : 'disabled')}</div>`
    : `<div class="tw-line tw-buttons">${btn('find-prev', t('find.prev'), 'arrowUp')}${btn('find-next', t('find.next'), 'arrowDown', 'primary')}${btn('find-all', t('find.all'), 'list')}${btn('find-count', t('find.count'), 'hash')}
      <span class="grow"></span>${btn('replace-one', t('find.replace'), 'replace')}${btn('replace-all', t('find.replaceAll'), 'replaceAll', 'danger')}</div>`;
  let results = '';
  if (f.scope === 'files' && f.fileResults) {
    const [items, nav, start] = pager('find', f.fileResults.matches);
    results = `<h3 class="section-title">${icon('list')}<span>${esc(t('find.inFilesResult', { n: f.fileResults.matches.length.toLocaleString(), files: f.fileResults.searched }))}${f.fileResults.truncated ? ` — ${esc(t('find.truncatedShort'))}` : ''}</span>${nav}</h3>
      <div class="tw-list">${items.map((m, i) => `<button class="tw-item" data-tw-file-match="${start + i}" title="${esc(m.path)}"><b>${start + i + 1}</b><span class="tw-text">${esc(m.path.split(/[\\/]/).pop())}</span><code>${hex8(m.offset)}h</code><span class="muted">${m.length} B</span><span class="muted tw-text">${esc(m.path)}</span></button>`).join('') || `<div class="muted">${esc(t('find.none'))}</div>`}</div>`;
  } else if (f.results) {
    const [items, nav, start] = pager('find', f.results.matches);
    results = `<h3 class="section-title">${icon('list')}<span>${esc(t('find.results', { n: f.results.count.toLocaleString() }))}${f.results.truncated ? ` — ${esc(t('find.truncated', { n: f.results.matches.length.toLocaleString() }))}` : ''}</span>${nav}<span class="grow"></span>${f.results.count ? btn('find-clear', t('find.clearMarks'), 'close', 'small') : ''}</h3>
      <div class="tw-list">${items.map(([o, l], i) => `<button class="tw-item" data-tw-goto="${o}" data-len="${l}" title="${esc(t('find.gotoMatch'))}"><b>${start + i + 1}</b><code>${hex8(o)}h</code><span class="muted">${l.toLocaleString()} B</span><code class="tw-preview">${esc(f.results.previews?.[start + i] ?? '')}</code></button>`).join('') || `<div class="muted">${esc(t('find.none'))}</div>`}</div>`;
  }
  const status = st.status ? `<div class="tw-status">${icon(st.statusKind === 'warning' ? 'warning' : 'info')}<span>${esc(st.status)}</span></div>` : '';
  return { icon: 'search', title: t('tool.find'), html: `${what}${f.scope === 'files' ? '' : repl}${opts}${files}${buttons}${status}${errorLine()}${results}` };
}

async function doFind(op) {
  const f = findState();
  if (!f.value.trim()) { st.error = t('find.empty'); draw(); return; }
  const pattern = patternOf(f);
  const replacement = { kind: f.rkind, value: f.rvalue, encoding: f.encoding, width: Number(f.width), endian: f.endian };
  const r = await guarded(() => call(op, { pattern, replacement, wrap: f.wrap, scope: f.scope }));
  if (!r) return;
  if (op === 'findAll') f.results = r;
  st.status = r.message ?? '';
  st.statusKind = r.found === false ? 'warning' : 'info';
  draw();
}

// ───────── go to

function gotoBody() {
  const g = (st.goto ??= { value: '', mode: 'absolute', base: 'hex', select: false });
  const html = `<div class="row"><span class="row-label">${icon('locate')}<span>${esc(t('goto.offset'))}</span></span><span class="row-control">${input('value', g.value, t('goto.placeholder'), 'data-autofocus')}</span></div>
    <div class="row"><span class="row-label">${icon('ruler')}<span>${esc(t('goto.mode'))}</span></span><span class="row-control"><span class="segmented">${[['absolute', t('goto.absolute')], ['forward', t('goto.forward')], ['back', t('goto.back')], ['end', t('goto.fromEnd')]].map(([v, l]) => `<button class="segment ${g.mode === v ? 'active' : ''}" data-tw-set="mode" data-value="${v}">${esc(l)}</button>`).join('')}</span></span></div>
    <div class="row"><span class="row-label">${icon('hash')}<span>${esc(t('goto.base'))}</span></span><span class="row-control"><span class="segmented">${[['hex', t('base.hex')], ['dec', t('base.dec')]].map(([v, l]) => `<button class="segment ${g.base === v ? 'active' : ''}" data-tw-set="base" data-value="${v}">${esc(l)}</button>`).join('')}</span>${check('select', t('goto.select'), g.select, 'selectAll')}</span></div>
    <p class="tw-message muted">${esc(t('goto.hint'))}</p>${errorLine()}`;
  return { icon: 'locate', title: t('tool.goto'), html, foot: `<span class="grow"></span>${ctx.button('close', t('common.cancel'), 'close')}${btn('goto-run', t('goto.go'), 'arrowRight', 'primary')}` };
}

// ───────── strings

function stringsBody() {
  const s = ctx.settings;
  const g = (st.strings ??= { min: s.stringsMin, encodings: new Set(s.stringsEncodings), scope: 'all', filter: '', items: null });
  const list = g.items ? g.items.filter((x) => !g.filter || x.text.toLowerCase().includes(g.filter.toLowerCase())) : null;
  const opts = `<div class="tw-line">${icon('ruler')}<span>${esc(t('strings.min'))}</span>${input('min', g.min, '4', 'class="narrow"')}
    ${['ascii', 'utf8', 'utf16le', 'utf16be'].map((e) => check(`enc:${e}`, e.toUpperCase().replace('LE', ' LE').replace('BE', ' BE'), g.encodings.has(e))).join('')}
    ${sel('scope', [['all', t('scope.all')], ['selection', t('scope.selectionOnly')]], g.scope, t('find.scope'), 'selectAll')}<span class="grow"></span>${btn('strings-run', t('strings.run'), 'play', 'primary')}</div>`;
  let results = '';
  if (list) {
    const [items, nav, start] = pager('strings', list);
    results = `<div class="tw-line">${input('filter', g.filter, t('strings.filter'))}<span class="muted">${esc(t('strings.count', { n: list.length.toLocaleString(), all: g.items.length.toLocaleString() }))}${g.truncated ? ` (${esc(t('find.truncatedShort'))})` : ''}</span><span class="grow"></span>${nav}${btn('strings-copy', t('strings.copyAll'), 'copy', 'small')}</div>
      <div class="tw-list">${items.map((x, i) => `<button class="tw-item" data-tw-goto="${x.offset}" data-len="${x.length}" title="${esc(x.text)}"><b>${start + i + 1}</b><code>${hex8(x.offset)}h</code><span class="chip">${esc(x.encoding)}</span><span class="muted">${x.length}</span><span class="tw-text">${esc(x.text)}</span></button>`).join('')}</div>`;
  }
  return { icon: 'textStrings', title: t('tool.strings'), html: `${opts}${errorLine()}${results}` };
}

// ───────── disassembler

const ARCHS = [['x86-64', 'x86-64'], ['x86-32', 'x86 (32)'], ['x86-16', 'x86 (16)'], ['arm64', 'ARM64'], ['arm32', 'ARM (A32)'], ['thumb', 'Thumb']];
async function runDisasm(offset) {
  const d = st.disasm;
  const r = await guarded(() => call('disasm', { arch: d.arch, syntax: d.syntax, offset: offset ?? d.from, base: d.base === '' ? null : d.base, length: 4096, max: 400 }));
  if (!r) return;
  d.items = r.items; d.next = r.next; d.start = r.start;
  st.page = { ...(st.page ?? {}), disasm: 0 };
  draw();
}

function disasmBody() {
  const s = ctx.settings;
  const d = (st.disasm ??= { arch: s.disasmArch, syntax: s.disasmSyntax, from: null, base: '', items: null, follow: false });
  const x86 = d.arch.startsWith('x86');
  const opts = `<div class="tw-line">${sel('arch', ARCHS, d.arch, t('disasm.arch'), 'cpu')}${x86 ? sel('syntax', [['intel', 'Intel'], ['nasm', 'NASM'], ['masm', 'MASM'], ['gas', 'AT&T (GAS)']], d.syntax, t('disasm.syntax'), 'code') : ''}
    ${icon('locate')}${input('base', d.base, t('disasm.base'), 'class="narrow"')}${check('follow', t('disasm.follow'), d.follow, 'locate')}<span class="grow"></span>
    ${btn('disasm-caret', t('disasm.fromCaret'), 'play', 'primary')}${d.items ? btn('disasm-more', t('disasm.more'), 'arrowDown') : ''}</div>`;
  let list = '';
  if (d.items) {
    const [items, nav] = pager('disasm', d.items);
    list = `<div class="tw-line"><span class="muted">${esc(t('disasm.count', { n: d.items.length }))}</span><span class="grow"></span>${nav}${btn('disasm-copy', t('disasm.copy'), 'copy', 'small')}</div>
      <div class="tw-list tw-asm">${items.map((x) => `<button class="tw-item" data-tw-goto="${x.offset}" data-len="${x.length}" title="${esc(x.text)}"><code>${hex8(x.address)}</code><code class="tw-bytes">${esc(x.bytes.match(/../g)?.join(' ') ?? '')}</code><b class="${x.mnemonic === 'db' ? 'muted' : ''}">${esc(x.mnemonic)}</b><code>${esc(x.operands)}</code></button>`).join('')}</div>`;
  }
  return { icon: 'cpu', title: t('tool.disasm'), html: `${opts}${errorLine()}${list || `<p class="tw-message muted">${esc(t('disasm.hint'))}</p>`}` };
}

// ───────── calculator

function calcBody() {
  const c = (st.calc ??= { expr: '', width: 32, signed: false, result: null });
  const r = c.result;
  const rows = r ? [['hex', 'Hex', r.hex], ['dec', t('calc.unsigned'), r.dec], ['signed', t('calc.signed'), r.signed], ['oct', 'Oct', r.oct], ['bin', 'Bin', r.bin], ['f32', 'Float32', r.float32], ['f64', 'Float64', r.float64], ['chars', t('calc.chars'), r.chars]] : [];
  const html = `<div class="row"><span class="row-label">${icon('calculate')}<span>${esc(t('calc.expr'))}</span></span><span class="row-control">${input('expr', c.expr, '0x1F * 4 + (1 << 8)', 'data-autofocus')}</span></div>
    <div class="row"><span class="row-label">${icon('ruler')}<span>${esc(t('calc.width'))}</span></span><span class="row-control"><span class="segmented">${[8, 16, 32, 64].map((w) => `<button class="segment ${c.width === w ? 'active' : ''}" data-tw-set="width" data-value="${w}">${w} bit</button>`).join('')}</span></span></div>
    ${errorLine()}
    <table class="prop-table tw-calc">${rows.map(([k, l, v]) => `<tr data-tw-copy="${esc(v)}" title="${esc(t('hash.copy'))}"><th>${esc(l)}</th><td>${esc(v)}</td></tr>`).join('')}</table>
    <div class="tw-line">${btn('calc-from-caret', t('calc.fromCaret'), 'download')}${btn('calc-write', t('calc.writeAtCaret'), 'edit', '', r ? '' : 'disabled')}<span class="grow"></span><span class="muted">${esc(t('calc.hint'))}</span></div>`;
  return { icon: 'calculate', title: t('tool.calc'), html };
}

async function evaluate() {
  const c = st.calc;
  if (!c.expr.trim()) { c.result = null; st.error = ''; draw(); return; }
  try { c.result = await call('core', { method: 'evaluate', args: { expr: c.expr, width: c.width } }); st.error = ''; } catch (error) { st.error = String(error?.message ?? error); }
  draw();
}

// ───────── recovery (carving)

function carveBody() {
  const g = (st.carve ??= { types: null, chosen: null, items: null });
  if (!g.types) { call('core', { method: 'signatures' }).then((list) => { g.types = list.filter((x) => x.carve); g.chosen = new Set(g.types.map((x) => x.id)); draw(); }).catch((e) => { st.error = String(e.message ?? e); draw(); }); }
  const types = g.types ? `<div class="tw-grid cols-6">${g.types.map((x) => check(`type:${x.id}`, x.ext.toUpperCase(), g.chosen.has(x.id))).join('')}</div>` : `<p class="muted">${esc(t('props.loading'))}</p>`;
  let list = '';
  if (g.items) {
    const [items, nav, start] = pager('carve', g.items);
    list = `<div class="tw-line"><span class="muted">${esc(t('carve.found', { n: g.items.length }))}${g.truncated ? ` (${esc(t('find.truncatedShort'))})` : ''}</span><span class="grow"></span>${nav}${g.items.length ? btn('carve-save-all', t('carve.saveAll'), 'saveAll', 'small') : ''}</div>
      <div class="tw-list">${items.map((x, i) => `<div class="tw-item"><b>${start + i + 1}</b><code>${hex8(x.offset)}h</code><span class="chip">${esc(x.ext.toUpperCase())}</span><span class="tw-text">${esc(x.name)}</span><span class="muted">${x.length.toLocaleString()} B${x.exact === false ? ' ~' : ''}</span>
        <button class="icon-button" data-tw-goto="${x.offset}" data-len="${x.length}" title="${esc(t('carve.goto'))}">${icon('locate')}</button><button class="icon-button" data-tw-carve-open="${start + i}" title="${esc(t('carve.open'))}">${icon('newTab')}</button><button class="icon-button" data-tw-carve-save="${start + i}" title="${esc(t('carve.save'))}">${icon('save')}</button></div>`).join('') || `<div class="muted">${esc(t('carve.none'))}</div>`}</div>`;
  }
  return { icon: 'recover', title: t('tool.carve'), html: `<p class="tw-message muted">${esc(t('carve.hint'))}</p>${types}<div class="tw-line">${btn('carve-all', t('carve.selectAll'), 'checkAll', 'small')}${btn('carve-none', t('carve.selectNone'), 'close', 'small')}<span class="grow"></span>${btn('carve-run', t('carve.run'), 'play', 'primary')}</div>${errorLine()}${list}` };
}

// ───────── disks and process memory

function devicesBody() {
  const g = (st.devices ??= { tab: ctx.params.tab ?? 'disks', disks: null, procs: null, filter: '' });
  if (!ctx.desktop) return { icon: 'drive', title: t('tool.devices'), html: `<p class="tw-message">${icon('info')} ${esc(t('devices.desktopOnly'))}</p>` };
  if (g.tab === 'disks' && !g.disks) call('disks').then((list) => { g.disks = list; draw(); }).catch((e) => { st.error = String(e.message ?? e); g.disks = []; draw(); });
  if (g.tab === 'processes' && !g.procs) call('processes').then((list) => { g.procs = list; draw(); }).catch((e) => { st.error = String(e.message ?? e); g.procs = []; draw(); });
  const tabs = `<div class="tw-line"><span class="segmented">${[['disks', t('devices.disks'), 'drive'], ['processes', t('devices.processes'), 'memory']].map(([v, l, gl]) => `<button class="segment ${g.tab === v ? 'active' : ''}" data-tw-set="tab" data-value="${v}">${icon(gl)}${esc(l)}</button>`).join('')}</span>
    ${g.tab === 'processes' ? input('filter', g.filter, t('devices.filter')) : ''}<span class="grow"></span>${btn('devices-refresh', t('devices.refresh'), 'refresh', 'small')}</div>`;
  let list = '';
  if (g.tab === 'disks') {
    const [items, nav] = pager('devices', g.disks ?? []);
    list = `<div class="tw-line"><span class="muted">${esc(t('devices.diskHint'))}</span><span class="grow"></span>${nav}</div><div class="tw-list">${g.disks ? items.map((d) => `<div class="tw-item">${icon(d.kind === 'physical' ? 'drive' : 'folder')}<b>${esc(d.name)}</b><code>${esc(d.path)}</code><span class="muted">${d.size ? `${(d.size / 1e9).toFixed(1)} GB` : ''}</span><span class="grow"></span><button class="button small" data-tw-open-disk="${esc(d.path)}" data-name="${esc(d.name)}">${icon('folderOpen')}<span>${esc(t('devices.open'))}</span></button></div>`).join('') || `<div class="muted">${esc(t('devices.none'))}</div>` : `<div class="muted">${esc(t('props.loading'))}</div>`}</div>`;
  } else {
    const all = (g.procs ?? []).filter((p) => !g.filter || `${p.name} ${p.pid}`.toLowerCase().includes(g.filter.toLowerCase()));
    const [items, nav] = pager('devices', all);
    list = `<div class="tw-line"><span class="muted">${esc(t('devices.procHint', { n: all.length }))}</span><span class="grow"></span>${nav}</div><div class="tw-list">${g.procs ? items.map((p) => `<div class="tw-item">${icon('memory')}<code>${p.pid}</code><b>${esc(p.name)}</b><span class="muted">${p.memory ? `${(p.memory / 1048576).toFixed(1)} MB` : ''}</span><span class="grow"></span><button class="button small" data-tw-open-proc="${p.pid}" data-name="${esc(p.name)}">${icon('folderOpen')}<span>${esc(t('devices.open'))}</span></button></div>`).join('') : `<div class="muted">${esc(t('props.loading'))}</div>`}</div>`;
  }
  return { icon: 'drive', title: t('tool.devices'), html: `${tabs}${errorLine()}${list}` };
}

// ───────── compare

function compareBody() {
  const g = (st.compare ??= { docs: null, a: null, b: null, mode: ctx.settings.compareMode });
  if (!g.docs) call('docs').then((list) => { g.docs = list; g.a ??= list.find((x) => x.active)?.id ?? list[0]?.id ?? null; g.b ??= list.find((x) => x.id !== g.a)?.id ?? null; draw(); });
  const opts = (g.docs ?? []).map((d) => [d.id, `${d.name} (${d.len.toLocaleString()} B)`, 'file']);
  const html = `<div class="row"><span class="row-label">${icon('file')}<span>${esc(t('compare.first'))}</span></span><span class="row-control">${sel('a', opts, g.a, t('compare.first'), 'file')}</span></div>
    <div class="row"><span class="row-label">${icon('file')}<span>${esc(t('compare.second'))}</span></span><span class="row-control">${sel('b', opts, g.b, t('compare.second'), 'file')}${btn('compare-open', t('compare.openFile'), 'folderOpen', 'small')}</span></div>
    <div class="row"><span class="row-label">${icon('compare')}<span>${esc(t('compare.mode'))}</span></span><span class="row-control"><span class="segmented">${[['bytes', t('compare.bytes')], ['sync', t('compare.sync')]].map(([v, l]) => `<button class="segment ${g.mode === v ? 'active' : ''}" data-tw-set="mode" data-value="${v}">${esc(l)}</button>`).join('')}</span></span></div>
    <p class="tw-message muted">${esc(t('compare.hint'))}</p>${errorLine()}`;
  return { icon: 'compare', title: t('tool.compare'), html, foot: `<span class="grow"></span>${ctx.button('close', t('common.cancel'), 'close')}${btn('compare-run', t('compare.run'), 'play', 'primary', g.a != null && g.b != null && g.a !== g.b ? '' : 'disabled')}` };
}

// ───────── template editor

function templateBody() {
  const g = (st.template ??= { builtins: null, users: [], source: '', name: '', current: '', offset: '0', result: null });
  if (!g.builtins) call('templates').then((r) => { g.builtins = r.builtins; g.users = r.users; if (!g.source) { const want = ctx.params.template ?? r.current ?? r.builtins[0]?.id; loadTemplate(want); } else draw(); });
  const options = [['', t('template.pick')], ...(g.builtins ?? []).map((b) => [b.id, `${b.name}`]), ...g.users.map((u) => [`user:${u.id}`, `★ ${u.name}`])];
  const errs = (g.result?.errors ?? []).map((e) => `<div class="tw-error">${icon(e.warning ? 'warning' : 'error')}<span>${esc(`${t('template.line', { line: e.line, col: e.col })} ${e.message}`)}</span></div>`).join('');
  const html = `<div class="tw-line">${sel('pick', options, g.current, t('template.choose'), 'structureTree')}${icon('locate')}${input('offset', g.offset, t('template.offset'), 'class="narrow"')}<span class="grow"></span>
      ${btn('tpl-load', t('template.loadFile'), 'folderOpen', 'small')}${btn('tpl-save-file', t('template.saveFile'), 'save', 'small')}${btn('tpl-save', t('template.saveUser'), 'star', 'small')}${g.current.startsWith('user:') ? btn('tpl-delete', t('template.deleteUser'), 'trash', 'small danger') : ''}</div>
    <textarea class="tw-code" data-tw="source" spellcheck="false" wrap="off">${esc(g.source)}</textarea>
    <div class="tw-line">${input('name', g.name, t('template.name'))}<span class="grow"></span>${g.result ? `<span class="muted">${esc(t('template.result', { name: '', n: (g.result.count ?? 0).toLocaleString() }))}</span>` : ''}${btn('tpl-help', t('template.help'), 'question', 'small')}${btn('tpl-run', t('template.run'), 'play', 'primary')}</div>
    ${errorLine()}${errs}`;
  return { icon: 'code', title: t('tool.template'), html };
}

async function loadTemplate(id) {
  const g = st.template;
  if (!id) return draw();
  const r = await guarded(() => call('templateSource', { template: id }));
  if (r) { g.source = r.source; g.name = r.name ?? ''; g.current = id; }
  draw();
}

// ───────── history

function historyBody() {
  const g = (st.history ??= { list: null });
  if (!g.list) call('history').then((r) => { g.list = r; draw(); }).catch((e) => { st.error = String(e.message ?? e); draw(); });
  const items = g.list ? [{ kind: 'open', depth: 0 }, ...g.list.undo.map((x, i) => ({ ...x, depth: i + 1, done: true })), ...g.list.redo.map((x, i) => ({ ...x, depth: g.list.undo.length + i + 1, done: false }))] : [];
  const [page, nav] = pager('history', items);
  const current = g.list?.undo.length ?? 0;
  const html = `<div class="tw-line"><span class="muted">${esc(t('history.hint'))}</span><span class="grow"></span>${nav}${btn('history-refresh', t('devices.refresh'), 'refresh', 'small')}</div>
    <div class="tw-list">${page.map((x) => `<button class="tw-item ${x.depth === current ? 'active' : ''} ${x.done || x.depth === 0 ? '' : 'muted'}" data-tw-history="${x.depth}"><b>${x.depth}</b>${icon(x.depth === 0 ? 'file' : x.done ? 'check' : 'redo')}<span>${esc(x.depth === 0 ? t('history.opened') : t(`history.kind.${x.kind}`, null, x.kind))}</span>${x.depth ? `<code>${hex8(x.offset)}h</code><span class="muted">${Number(x.length).toLocaleString()} B · ${Number(x.beforeLen).toLocaleString()} → ${Number(x.afterLen).toLocaleString()}</span>` : ''}</button>`).join('')}</div>${errorLine()}`;
  return { icon: 'history', title: t('tool.history'), html };
}

// ───────── file tools

function fileToolsBody() {
  const g = (st.files ??= { tab: ctx.params.tab ?? 'split', size: '1', unit: 'MB', files: [], passes: '3', method: 'random', status: '' });
  const tabs = `<div class="tw-line"><span class="segmented">${[['split', t('files.split'), 'cut'], ['concat', t('files.concat'), 'mergeDocs'], ['wipe', t('files.wipe'), 'shred']].map(([v, l, gl]) => `<button class="segment ${g.tab === v ? 'active' : ''}" data-tw-set="tab" data-value="${v}">${icon(gl)}${esc(l)}</button>`).join('')}</span></div>`;
  let body = '';
  if (g.tab === 'split') {
    body = `<p class="tw-message muted">${esc(t('files.splitHint'))}</p><div class="row"><span class="row-label">${icon('ruler')}<span>${esc(t('files.partSize'))}</span></span><span class="row-control">${input('size', g.size, '1', 'class="narrow"')}${sel('unit', [['B', 'B'], ['KB', 'KB'], ['MB', 'MB'], ['GB', 'GB']], g.unit, t('files.unit'))}</span></div>
      <div class="tw-line"><span class="grow"></span>${btn('files-split', t('files.splitRun'), 'cut', 'primary')}</div>`;
  } else if (g.tab === 'concat') {
    body = `<p class="tw-message muted">${esc(t('files.concatHint'))}</p><div class="tw-list">${g.files.map((f, i) => `<div class="tw-item"><b>${i + 1}</b><span class="tw-text">${esc(f.name)}</span><span class="muted">${f.size != null ? `${Number(f.size).toLocaleString()} B` : ''}</span><span class="grow"></span><button class="icon-button" data-tw-file-up="${i}" title="${esc(t('files.up'))}">${icon('arrowUp')}</button><button class="icon-button" data-tw-file-remove="${i}" title="${esc(t('files.remove'))}">${icon('close')}</button></div>`).join('') || `<div class="muted">${esc(t('files.noFiles'))}</div>`}</div>
      <div class="tw-line">${btn('files-add', t('files.add'), 'plus')}<span class="grow"></span>${btn('files-concat', t('files.concatRun'), 'mergeDocs', 'primary', g.files.length >= 1 ? '' : 'disabled')}</div>`;
  } else {
    body = ctx.desktop ? `<p class="tw-message">${icon('warning')} ${esc(t('files.wipeHint'))}</p>
      <div class="row"><span class="row-label">${icon('refresh')}<span>${esc(t('files.passes'))}</span></span><span class="row-control">${sel('passes', [['1', t('files.pass1')], ['3', t('files.pass3')], ['7', t('files.pass7')]], g.passes, t('files.passes'), 'refresh')}</span></div>
      <div class="row"><span class="row-label">${icon('shred')}<span>${esc(t('files.method'))}</span></span><span class="row-control">${sel('method', [['random', t('files.methodRandom')], ['zero', t('files.methodZero')], ['dod', t('files.methodDod')]], g.method, t('files.method'), 'shred')}</span></div>
      <div class="tw-line"><span class="grow"></span>${btn('files-wipe', t('files.wipeRun'), 'shred', 'danger')}</div>` : `<p class="tw-message">${icon('info')} ${esc(t('devices.desktopOnly'))}</p>`;
  }
  const status = g.status ? `<div class="tw-status">${icon('check')}<span>${esc(g.status)}</span></div>` : '';
  return { icon: 'fileTools', title: t('tool.filetools'), html: `${tabs}${body}${status}${errorLine()}` };
}

// ───────── events

/** What the forensics windows (forensics.js) use from here. */
const fctx = {
  call: (op, args) => call(op, args), redraw: () => draw(), guarded: (w) => guarded(w), pager: (n, items) => pager(n, items),
  btn: (...a) => btn(...a), check: (...a) => check(...a), sel: (...a) => sel(...a), errorLine: () => errorLine(),
  setError: (e) => { st.error = String(e?.message ?? e); draw(); }, resetPage: (n) => { st.page = { ...(st.page ?? {}), [n]: 0 }; },
};

async function onClick(event) {
  const target = event.target;
  if ((ctx.kind === 'filesystem' || ctx.kind === 'yara') && !target.closest('[data-tw-page], [data-tw-goto]') && await forensicsClick(fctx, target)) return undefined;
  const page = target.closest('[data-tw-page]');
  if (page) { const [name, step] = page.dataset.twPage.split(':'); st.page[name] += Number(step); return draw(); }
  const set = target.closest('[data-tw-set]');
  if (set) {
    const key = set.dataset.twSet; const raw = set.dataset.value; const value = /^\d+$/.test(raw) ? Number(raw) : raw;
    const obj = { goto: st.goto, calc: st.calc, devices: st.devices, compare: st.compare, filetools: st.files }[ctx.kind];
    obj[key] = value;
    if (ctx.kind === 'calc') return evaluate();
    if (ctx.kind === 'devices') st.page = {};
    return draw();
  }
  const seg = target.closest('[data-tw-seg]');
  if (seg) { st.values[seg.dataset.twSeg] = seg.dataset.value; return draw(); }
  const go = target.closest('[data-tw-goto]');
  if (go) return call('select', { offset: Number(go.dataset.twGoto), length: Number(go.dataset.len ?? 1) }).catch(() => {});
  const cp = target.closest('[data-tw-copy]');
  if (cp) return call('copy', { text: cp.dataset.twCopy });
  const fm = target.closest('[data-tw-file-match]');
  if (fm) { const m = st.find.fileResults.matches[Number(fm.dataset.twFileMatch)]; return guarded(() => call('openMatch', m)); }
  const hist = target.closest('[data-tw-history]');
  if (hist) { await guarded(() => call('gotoHistory', { depth: Number(hist.dataset.twHistory) })); st.history.list = null; return draw(); }
  const disk = target.closest('[data-tw-open-disk]');
  if (disk) return guarded(() => call('openDisk', { path: disk.dataset.twOpenDisk, name: disk.dataset.name })).then((r) => { if (r) ctx.close(); });
  const proc = target.closest('[data-tw-open-proc]');
  if (proc) return guarded(() => call('openProcess', { pid: Number(proc.dataset.twOpenProc), name: proc.dataset.name })).then((r) => { if (r) ctx.close(); });
  const co = target.closest('[data-tw-carve-open]');
  if (co) { const x = st.carve.items[Number(co.dataset.twCarveOpen)]; return guarded(() => call('extract', { offset: x.offset, length: x.length, name: `carved-${hex8(x.offset)}.${x.ext}` })); }
  const cs = target.closest('[data-tw-carve-save]');
  if (cs) { const x = st.carve.items[Number(cs.dataset.twCarveSave)]; return guarded(() => call('saveRange', { offset: x.offset, length: x.length, name: `carved-${hex8(x.offset)}.${x.ext}` })); }
  const up = target.closest('[data-tw-file-up]');
  if (up) { const i = Number(up.dataset.twFileUp); if (i > 0) [st.files.files[i - 1], st.files.files[i]] = [st.files.files[i], st.files.files[i - 1]]; return draw(); }
  const rm = target.closest('[data-tw-file-remove]');
  if (rm) { st.files.files.splice(Number(rm.dataset.twFileRemove), 1); return draw(); }
  const act = target.closest('[data-tw-act]');
  if (!act || act.disabled) return undefined;
  switch (act.dataset.twAct) {
    case 'form-ok': readForm(); return ctx.close({ values: st.values });
    case 'find-next': return doFind('findNext');
    case 'find-prev': return doFind('findPrev');
    case 'find-all': return doFind('findAll');
    case 'find-count': return doFind('count');
    case 'replace-one': return doFind('replace');
    case 'replace-all': return doFind('replaceAll');
    case 'find-clear': st.find.results = null; await call('clearMarks'); return draw();
    case 'fif-files': { const r = await guarded(() => call('pickFiles')); if (r) { st.find.files = [...(st.find.files ?? []), ...r]; draw(); } return undefined; }
    case 'fif-folder': { const r = await guarded(() => call('pickFolder')); if (r) { st.find.files = [...(st.find.files ?? []), r]; draw(); } return undefined; }
    case 'fif-clear': st.find.files = []; st.find.fileResults = null; return draw();
    case 'fif-run': {
      const f = findState();
      if (!f.value.trim()) { st.error = t('find.empty'); return draw(); }
      const r = await guarded(() => call('findInFiles', { pattern: patternOf(f), files: f.files, recursive: f.recursive !== false }));
      if (r) { f.fileResults = r; st.page = {}; draw(); }
      return undefined;
    }
    case 'goto-run': {
      const r = await guarded(() => call('goto', st.goto));
      if (r?.ok) return ctx.close();
      if (r?.error) { st.error = r.error; draw(); }
      return undefined;
    }
    case 'strings-run': {
      const g = st.strings;
      const r = await guarded(() => call('strings', { minLength: Number(g.min) || 4, encodings: [...g.encodings], scope: g.scope }));
      if (r) { g.items = r.items; g.truncated = r.truncated; st.page = {}; draw(); }
      return undefined;
    }
    case 'strings-copy': return call('copy', { text: (st.strings.items ?? []).filter((x) => !st.strings.filter || x.text.toLowerCase().includes(st.strings.filter.toLowerCase())).map((x) => `${hex8(x.offset)}\t${x.encoding}\t${x.text}`).join('\n') });
    case 'disasm-caret': return runDisasm(null);
    case 'disasm-more': { const d = st.disasm; const prev = d.items; await runDisasm(d.next); if (d.items && prev) d.items = [...prev, ...d.items]; return draw(); }
    case 'disasm-copy': return call('copy', { text: (st.disasm.items ?? []).map((x) => `${hex8(x.address)}  ${(x.bytes.match(/../g)?.join(' ') ?? '').padEnd(30)} ${x.text}`).join('\n') });
    case 'calc-from-caret': { const r = await guarded(() => call('valueAtCaret', { width: st.calc.width })); if (r) { st.calc.expr = r.expr; evaluate(); } return undefined; }
    case 'calc-write': return guarded(() => call('writeValue', { expr: st.calc.expr, width: st.calc.width }));
    case 'carve-all': st.carve.chosen = new Set(st.carve.types.map((x) => x.id)); return draw();
    case 'carve-none': st.carve.chosen = new Set(); return draw();
    case 'carve-run': { const r = await guarded(() => call('carve', { types: [...st.carve.chosen] })); if (r) { st.carve.items = r.items; st.carve.truncated = r.truncated; st.page = {}; draw(); } return undefined; }
    case 'carve-save-all': return guarded(() => call('saveCarved', { items: st.carve.items }));
    case 'devices-refresh': st.devices.disks = null; st.devices.procs = null; return draw();
    case 'compare-open': { const r = await guarded(() => call('openForCompare')); if (r) { st.compare.docs = null; st.compare.b = r.id; draw(); } return undefined; }
    case 'compare-run': { const g = st.compare; const r = await guarded(() => call('compare', { a: Number(g.a), b: Number(g.b), mode: g.mode })); if (r) ctx.close(); return undefined; }
    case 'tpl-run': { const g = st.template; const r = await guarded(() => call('runTemplate', { source: g.source, offset: g.offset, name: g.name || g.current })); if (r) { g.result = r; draw(); } return undefined; }
    case 'tpl-save': { const g = st.template; const r = await guarded(() => call('saveTemplate', { source: g.source, name: g.name, id: g.current.startsWith('user:') ? g.current.slice(5) : null })); if (r) { g.users = r.users; g.current = `user:${r.id}`; draw(); } return undefined; }
    case 'tpl-delete': { const g = st.template; const r = await guarded(() => call('deleteTemplate', { id: g.current.slice(5) })); if (r) { g.users = r.users; g.current = ''; draw(); } return undefined; }
    case 'tpl-load': { const r = await guarded(() => call('loadTemplateFile')); if (r) { st.template.source = r.source; st.template.name = r.name; draw(); } return undefined; }
    case 'tpl-save-file': return guarded(() => call('saveTemplateFile', { source: st.template.source, name: st.template.name || 'template' }));
    case 'tpl-help': return call('help', { topic: 'templates' });
    case 'history-refresh': st.history.list = null; return draw();
    case 'files-add': { const r = await guarded(() => call('pickFiles')); if (r) { st.files.files.push(...r); draw(); } return undefined; }
    case 'files-split': { const g = st.files; const mult = { B: 1, KB: 1024, MB: 1048576, GB: 1073741824 }[g.unit]; const r = await guarded(() => call('split', { size: Math.max(1, Math.round(Number(g.size) * mult)) })); if (r) { g.status = r.message; draw(); } return undefined; }
    case 'files-concat': { const g = st.files; const r = await guarded(() => call('concat', { files: g.files })); if (r) { g.status = r.message; draw(); } return undefined; }
    case 'files-wipe': { const g = st.files; const r = await guarded(() => call('wipe', { passes: Number(g.passes), method: g.method })); if (r) { g.status = r.message; draw(); } return undefined; }
    default: return undefined;
  }
}

function readForm() {
  for (const el of ctx.root.querySelectorAll('[data-tw-field]')) st.values[el.dataset.twField] = el.type === 'checkbox' ? el.checked : el.value;
}

function onChange(event) {
  const el = event.target;
  if ((ctx.kind === 'filesystem' || ctx.kind === 'yara') && forensicsChange(fctx, el)) return;
  if (el.dataset.twField) { st.values[el.dataset.twField] = el.type === 'checkbox' ? el.checked : el.value; if (el.tagName === 'SELECT' || el.type === 'checkbox') draw(); return; }
  const key = el.dataset.tw;
  if (!key) return;
  const value = el.type === 'checkbox' ? el.checked : el.value;
  if (ctx.kind === 'find') { const f = findState(); f[key] = value; if (key === 'kind' || key === 'rkind' || key === 'scope' || el.type === 'checkbox') draw(); return; }
  if (ctx.kind === 'strings') { const g = st.strings; if (key.startsWith('enc:')) { const e = key.slice(4); if (value) g.encodings.add(e); else g.encodings.delete(e); } else g[key] = value; if (key === 'filter') { st.page = {}; draw(); } return; }
  if (ctx.kind === 'disasm') { st.disasm[key] = value; if (key === 'arch' || key === 'syntax') runDisasm(st.disasm.start ?? null); else if (key === 'follow') draw(); return; }
  if (ctx.kind === 'carve' && key.startsWith('type:')) { const id = key.slice(5); if (value) st.carve.chosen.add(id); else st.carve.chosen.delete(id); return; }
  if (ctx.kind === 'compare') { st.compare[key] = value; draw(); return; }
  if (ctx.kind === 'template') { if (key === 'pick') loadTemplate(value); else st.template[key] = value; return; }
  if (ctx.kind === 'goto') { st.goto[key] = value; return; }
  if (ctx.kind === 'filetools') { st.files[key] = value; return; }
  if (ctx.kind === 'devices') { st.devices[key] = value; st.page = {}; draw(); }
}

let calcTimer = 0;
function onInput(event) {
  const el = event.target;
  if (ctx.kind === 'yara' && forensicsInput(el)) return;
  const key = el.dataset.tw;
  if (el.dataset.twField) { st.values[el.dataset.twField] = el.value; return; }
  if (!key) return;
  if (ctx.kind === 'find') findState()[key] = el.value;
  else if (ctx.kind === 'calc' && key === 'expr') { st.calc.expr = el.value; clearTimeout(calcTimer); calcTimer = setTimeout(evaluate, 160); }
  else if (ctx.kind === 'template') st.template[key] = el.value;
  else if (ctx.kind === 'goto') st.goto[key] = el.value;
  else if (ctx.kind === 'strings' && key === 'filter') { st.strings.filter = el.value; st.page = {}; clearTimeout(calcTimer); calcTimer = setTimeout(draw, 200); }
  else if (ctx.kind === 'devices' && key === 'filter') { st.devices.filter = el.value; st.page = {}; clearTimeout(calcTimer); calcTimer = setTimeout(draw, 200); }
  else if (ctx.kind === 'filetools') st.files[key] = el.value;
  else if (ctx.kind === 'disasm') st.disasm[key] = el.value;
}

function onKey(event) {
  if (event.key !== 'Enter' || event.isComposing) return;
  if (event.target.tagName === 'TEXTAREA') { if (ctx.kind === 'template' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); ctx.root.querySelector('[data-tw-act="tpl-run"]')?.click(); } return; }
  const primary = { find: event.shiftKey ? 'find-prev' : 'find-next', goto: 'goto-run', form: 'form-ok', strings: 'strings-run', compare: 'compare-run' }[ctx.kind];
  if (!primary) return;
  event.preventDefault();
  if (ctx.kind === 'form') readForm();
  ctx.root.querySelector(`[data-tw-act="${primary}"]`)?.click();
}

/** Draws the tool popup (called by popup.js render). */
export function renderTool(context) {
  ctx = context;
  if (!bound) {
    bound = true;
    ctx.root.addEventListener('click', (event) => { onClick(event).catch((error) => { st.error = String(error?.message ?? error); draw(); }); });
    ctx.root.addEventListener('change', onChange);
    ctx.root.addEventListener('input', onInput);
    ctx.root.addEventListener('keydown', onKey);
  }
  draw();
  requestAnimationFrame(() => ctx.root.querySelector('[data-autofocus]')?.focus());
}

/** The popup was opened again (new parameters): start over. */
export function resetTool() {
  resetForensics();
  for (const key of Object.keys(st)) delete st[key];
}
