// The OpenSCAD code editor of the OpenSCAD feature's PropertyManager: a textarea over a highlighted copy of the
// code (comments, strings, numbers, keywords, built-in modules and functions, $ variables), completion of the
// word at the caret (keywords, built-ins with their arguments, and the program's own modules, functions and
// variables: Ctrl+Space or typing two letters; ↑ ↓ to choose, Enter / Tab to take, Esc to close), and the
// lines in the console that name a line jumping to it in the code.
import { escapeHtml } from './dom.js';

export const SCAD_KEYWORDS = ['module', 'function', 'if', 'else', 'let', 'for', 'each', 'true', 'false', 'undef', 'include', 'use', 'assert', 'echo', 'intersection_for'];
/** Built-in modules with the arguments a completion writes. */
export const SCAD_MODULES = {
  cube: 'cube(size = [10, 10, 10], center = false)', sphere: 'sphere(r = 5)', cylinder: 'cylinder(h = 10, r = 5, center = false)',
  polyhedron: 'polyhedron(points = [], faces = [])', square: 'square(size = [10, 10], center = false)', circle: 'circle(r = 5)',
  polygon: 'polygon(points = [])', text: 'text("text", size = 10)', import: 'import("file.stl")', surface: 'surface(file = "file.dat")',
  translate: 'translate([0, 0, 0])', rotate: 'rotate([0, 0, 0])', scale: 'scale([1, 1, 1])', mirror: 'mirror([1, 0, 0])',
  multmatrix: 'multmatrix(m = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0]])', resize: 'resize(newsize = [10, 10, 10])', color: 'color("red")',
  offset: 'offset(r = 1)', hull: 'hull()', minkowski: 'minkowski()', union: 'union()', difference: 'difference()', intersection: 'intersection()',
  render: 'render()', linear_extrude: 'linear_extrude(height = 10)', rotate_extrude: 'rotate_extrude(angle = 360)', projection: 'projection(cut = false)',
  roof: 'roof(method = "straight")', children: 'children()',
};
/** Built-in functions with their arguments. */
export const SCAD_FUNCTIONS = {
  abs: 'abs(x)', sign: 'sign(x)', sin: 'sin(a)', cos: 'cos(a)', tan: 'tan(a)', asin: 'asin(x)', acos: 'acos(x)', atan: 'atan(x)', atan2: 'atan2(y, x)',
  floor: 'floor(x)', ceil: 'ceil(x)', round: 'round(x)', sqrt: 'sqrt(x)', exp: 'exp(x)', ln: 'ln(x)', log: 'log(x)', pow: 'pow(x, y)', min: 'min(a, b)', max: 'max(a, b)',
  norm: 'norm(v)', cross: 'cross(a, b)', len: 'len(v)', concat: 'concat(a, b)', lookup: 'lookup(key, table)', str: 'str(a, b)', chr: 'chr(n)', ord: 'ord(c)',
  search: 'search(match, list)', rands: 'rands(min, max, count)', version: 'version()', version_num: 'version_num()',
  is_undef: 'is_undef(x)', is_bool: 'is_bool(x)', is_num: 'is_num(x)', is_string: 'is_string(x)', is_list: 'is_list(x)', is_function: 'is_function(x)', is_object: 'is_object(x)',
  object: 'object(name = value)', has_key: 'has_key(obj, "name")', textmetrics: 'textmetrics("text", size = 10)', fontmetrics: 'fontmetrics(size = 10)',
  parent_module: 'parent_module(0)', dxf_dim: 'dxf_dim(file = "", name = "")', dxf_cross: 'dxf_cross(file = "")',
};
const SPECIALS = ['$fn', '$fa', '$fs', '$t', '$preview', '$vpr', '$vpt', '$vpd', '$vpf', '$children', '$parent_modules'];

/** The code as HTML with spans per token class (kw, mod, fn, num, str, com, sp). */
export function highlightScad(text) {
  const s = String(text);
  let out = ''; let i = 0;
  const span = (cls, str) => `<span class="sh-${cls}">${escapeHtml(str)}</span>`;
  while (i < s.length) {
    const c = s[i];
    if (c === '/' && s[i + 1] === '/') { const j = s.indexOf('\n', i); const e = j < 0 ? s.length : j; out += span('com', s.slice(i, e)); i = e; continue; }
    if (c === '/' && s[i + 1] === '*') { const j = s.indexOf('*/', i + 2); const e = j < 0 ? s.length : j + 2; out += span('com', s.slice(i, e)); i = e; continue; }
    if (c === '"') { let j = i + 1; while (j < s.length && s[j] !== '"' && s[j] !== '\n') { if (s[j] === '\\') j++; j++; } const e = Math.min(s.length, j + 1); out += span('str', s.slice(i, e)); i = e; continue; }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(s[i + 1] ?? ''))) { const m = /^(\d*\.?\d+(?:[eE][+-]?\d+)?|\d+\.)/.exec(s.slice(i)); out += span('num', m[0]); i += m[0].length; continue; }
    if (/[A-Za-z_$]/.test(c)) {
      const m = /^\$?[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(i)); const w = m ? m[0] : c;
      const cls = w[0] === '$' ? 'sp' : SCAD_KEYWORDS.includes(w) ? 'kw' : w in SCAD_MODULES ? 'mod' : w in SCAD_FUNCTIONS ? 'fn' : null;
      out += cls ? span(cls, w) : escapeHtml(w); i += w.length; continue;
    }
    out += escapeHtml(c); i++;
  }
  // A last empty line still takes its height.
  return `${out}${s.endsWith('\n') ? ' ' : ''}`;
}

/** The program's own names: modules, functions and variables (top-level assignments and parameters). */
export function scadNames(text) {
  const s = String(text).replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '');
  const mods = new Map(); const fns = new Map(); const vars = new Set();
  for (const m of s.matchAll(/\bmodule\s+([A-Za-z_]\w*)\s*\(([^)]*)\)/g)) mods.set(m[1], `${m[1]}(${m[2].trim()})`);
  for (const m of s.matchAll(/\bfunction\s+([A-Za-z_]\w*)\s*\(([^)]*)\)/g)) fns.set(m[1], `${m[1]}(${m[2].trim()})`);
  for (const m of s.matchAll(/(?:^|[;{(,\n])\s*([A-Za-z_]\w*)\s*=(?!=)/g)) vars.add(m[1]);
  return { mods, fns, vars };
}

/**
 * Completions of the word ending at `caret`: { from, word, items: [{ label, insert, kind }] } (at most 12, the
 * program's own names first, then built-ins; exact prefix matches only).
 */
export function completionsAt(text, caret) {
  const before = String(text).slice(0, caret);
  const m = /\$?[A-Za-z_][A-Za-z0-9_]*$/.exec(before);
  const word = m ? m[0] : '';
  const from = caret - word.length;
  const { mods, fns, vars } = scadNames(text);
  const items = [];
  const add = (label, insert, kind) => { if (label.startsWith(word) && label !== word && !items.some((x) => x.label === label)) items.push({ label, insert, kind }); };
  if (word.startsWith('$')) SPECIALS.forEach((x) => add(x, x, 'sp'));
  else {
    for (const [k, sig] of mods) add(k, sig, 'mod');
    for (const [k, sig] of fns) add(k, sig, 'fn');
    for (const v of vars) add(v, v, 'var');
    SCAD_KEYWORDS.forEach((k) => add(k, k, 'kw'));
    for (const [k, sig] of Object.entries(SCAD_MODULES)) add(k, sig, 'mod');
    for (const [k, sig] of Object.entries(SCAD_FUNCTIONS)) add(k, sig, 'fn');
  }
  return { from, word, items: items.slice(0, 12) };
}

/** The editor's HTML (highlighted layer + textarea + completion list). */
export function scadEditorHtml(source, label) {
  return `<div class="scad-editor"><pre class="scad-hl" aria-hidden="true">${highlightScad(source)}</pre><textarea class="scad-code" data-scad-source spellcheck="false" wrap="off" rows="14" aria-label="${escapeHtml(label)}" aria-autocomplete="list">${escapeHtml(source)}</textarea><ul class="scad-complete" role="listbox" hidden></ul></div>`;
}

/** The line a console message names ("… (line 12)", "line 12, column 3"), or null. */
export const messageLine = (msg) => { const m = /\bline (\d+)/.exec(String(msg)); return m ? Number(m[1]) : null; };

/** Selects line `n` (1-based) of a textarea and scrolls it into view. */
export function gotoLine(ta, n) {
  const lines = ta.value.split('\n');
  const k = Math.max(1, Math.min(lines.length, n)) - 1;
  let start = 0; for (let i = 0; i < k; i++) start += lines[i].length + 1;
  ta.focus();
  ta.setSelectionRange(start, start + lines[k].length);
  const lh = parseFloat(getComputedStyle(ta).lineHeight) || 17;
  ta.scrollTop = Math.max(0, k * lh - ta.clientHeight / 3);
  ta.dispatchEvent(new Event('scroll'));
}

/** Wires the editors under `root` (input, scroll, keys, clicks on console lines). Call once. */
export function attachScadEditor(root) {
  const state = new WeakMap(); // textarea → { items, index, from }
  const parts = (ta) => { const box = ta.closest('.scad-editor'); return { box, hl: box?.querySelector('.scad-hl'), list: box?.querySelector('.scad-complete') }; };
  const sync = (ta) => { const { hl } = parts(ta); if (!hl) return; hl.innerHTML = highlightScad(ta.value); hl.scrollTop = ta.scrollTop; hl.scrollLeft = ta.scrollLeft; };
  const close = (ta) => { const { list } = parts(ta); if (list) { list.hidden = true; list.innerHTML = ''; } state.delete(ta); };
  const show = (ta, force) => {
    const { list } = parts(ta);
    if (!list) return;
    const c = completionsAt(ta.value, ta.selectionStart);
    if (!c.items.length || (!force && c.word.length < 2)) { close(ta); return; }
    state.set(ta, { items: c.items, index: 0, from: c.from });
    list.innerHTML = c.items.map((x, i) => `<li role="option" data-scad-complete="${i}" class="${i === 0 ? 'on' : ''}"><span class="sh-${x.kind === 'var' ? 'id' : x.kind}">${escapeHtml(x.label)}</span><small>${escapeHtml(x.insert === x.label ? x.kind : x.insert)}</small></li>`).join('');
    list.hidden = false;
  };
  const take = (ta, i) => {
    const st = state.get(ta); if (!st) return;
    const item = st.items[i]; if (!item) return;
    // Built-ins and modules come with their arguments; the caret goes inside the brackets.
    let insert = item.insert;
    const after = ta.value.slice(ta.selectionStart, ta.selectionStart + 1);
    if (after === '(') insert = item.label;
    ta.setRangeText(insert, st.from, ta.selectionStart, 'end');
    const open = insert.indexOf('(');
    if (open > 0 && insert.endsWith(')')) ta.setSelectionRange(st.from + open + 1, st.from + insert.length - 1);
    close(ta); sync(ta);
  };
  const isCode = (el) => el?.matches?.('textarea[data-scad-source]');
  root.addEventListener('input', (e) => { if (isCode(e.target)) { sync(e.target); show(e.target, false); } });
  root.addEventListener('scroll', (e) => { if (isCode(e.target)) { const { hl } = parts(e.target); if (hl) { hl.scrollTop = e.target.scrollTop; hl.scrollLeft = e.target.scrollLeft; } } }, true);
  root.addEventListener('focusout', (e) => { if (isCode(e.target)) setTimeout(() => close(e.target), 150); });
  root.addEventListener('keydown', (e) => {
    const ta = e.target;
    if (!isCode(ta)) return;
    if (e.key === ' ' && e.ctrlKey) { e.preventDefault(); e.stopImmediatePropagation(); show(ta, true); return; }
    const st = state.get(ta);
    if (!st) return;
    const { list } = parts(ta);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); e.stopImmediatePropagation();
      st.index = (st.index + (e.key === 'ArrowDown' ? 1 : st.items.length - 1)) % st.items.length;
      list.querySelectorAll('li').forEach((li, i) => li.classList.toggle('on', i === st.index));
    } else if ((e.key === 'Enter' && !e.ctrlKey && !e.metaKey) || e.key === 'Tab') { e.preventDefault(); e.stopImmediatePropagation(); take(ta, st.index); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(ta); }
  }, true);
  root.addEventListener('mousedown', (e) => {
    const li = e.target.closest?.('[data-scad-complete]');
    if (li) { e.preventDefault(); const ta = li.closest('.scad-editor').querySelector('textarea'); take(ta, Number(li.dataset.scadComplete)); return; }
    const line = e.target.closest?.('[data-scad-line]');
    if (line) {
      const ta = root.querySelector('textarea[data-scad-source]');
      if (ta) { e.preventDefault(); gotoLine(ta, Number(line.dataset.scadLine)); }
    }
  });
}
