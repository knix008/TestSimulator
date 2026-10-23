// S-expression reader/writer for KiCad files (.kicad_sch, .kicad_pcb,
// .kicad_sym, .kicad_mod).
//
// parseSexpr(text) turns the text into nested JS arrays:
//   (kicad_sch (version 20231120) (paper "A4"))
//   -> ["kicad_sch", ["version", 20231120], ["paper", "A4"]]
// Quoted strings become JS strings (escapes resolved), unquoted atoms that
// look like numbers become numbers, every other unquoted atom (keywords such
// as `yes`, `hide`, `input`) becomes a JS string. A quoted string that looks
// like a number ("1") stays a string, which matters for pin and pad numbers.
//
// The helpers below read a node: head(), child(), children(), value(),
// num(), str(), flag(), xy(), at(). They never throw on missing data; they
// return the given default instead, so importers can stay terse.

export class SexprError extends Error {
  constructor(message, pos, line, col) {
    super(`${message} (line ${line}, column ${col})`);
    this.pos = pos;
    this.line = line;
    this.col = col;
  }
}

const NUM_RE = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/;

function lineCol(text, pos) {
  let line = 1;
  let last = -1;
  for (let i = 0; i < pos && i < text.length; i++) if (text.charCodeAt(i) === 10) { line++; last = i; }
  return [line, pos - last];
}

const ESCAPES = { n: "\n", t: "\t", r: "\r", "\\": "\\", '"': '"', "'": "'", a: "\x07", b: "\b", f: "\f", v: "\v" };

// Parse one or more top-level expressions. Returns the first expression, or
// all of them when { all: true }.
export function parseSexpr(text, { all = false } = {}) {
  const src = String(text ?? "");
  const n = src.length;
  let i = 0;
  if (src.charCodeAt(0) === 0xfeff) i = 1; // BOM
  const fail = (msg, at = i) => { const [l, c] = lineCol(src, at); throw new SexprError(msg, at, l, c); };
  const top = [];
  const stack = [];
  let cur = null;
  const push = (v) => { if (cur) cur.push(v); else top.push(v); };
  while (i < n) {
    const c = src.charCodeAt(i);
    // whitespace
    if (c === 32 || c === 9 || c === 10 || c === 13 || c === 12 || c === 11) { i++; continue; }
    if (c === 40) { // (
      const list = [];
      list._pos = i;
      if (cur) stack.push(cur);
      cur = list;
      i++;
      continue;
    }
    if (c === 41) { // )
      if (!cur) fail("unexpected ')'");
      const done = cur;
      delete done._pos;
      cur = stack.length ? stack.pop() : null;
      push(done);
      i++;
      if (!cur && !all) break;
      continue;
    }
    if (c === 34) { // "
      let out = "";
      let j = i + 1;
      let start = j;
      for (;;) {
        if (j >= n) fail("unterminated string", i);
        const d = src.charCodeAt(j);
        if (d === 34) break;
        if (d === 92) { // backslash
          out += src.slice(start, j);
          const e = src[j + 1];
          if (e === undefined) fail("unterminated string", i);
          if (e === "x" && /^[0-9a-fA-F]{2}$/.test(src.substr(j + 2, 2))) {
            out += String.fromCharCode(parseInt(src.substr(j + 2, 2), 16));
            j += 4;
          } else if (/[0-7]/.test(e) && /^[0-7]{3}$/.test(src.substr(j + 1, 3))) {
            out += String.fromCharCode(parseInt(src.substr(j + 1, 3), 8));
            j += 4;
          } else {
            out += e in ESCAPES ? ESCAPES[e] : e;
            j += 2;
          }
          start = j;
          continue;
        }
        j++;
      }
      out += src.slice(start, j);
      push(out);
      i = j + 1;
      continue;
    }
    if (c === 35 && !cur && (i === 0 || src[i - 1] === "\n")) { // '#' comment line outside any list
      while (i < n && src.charCodeAt(i) !== 10) i++;
      continue;
    }
    // bare atom
    let j = i;
    while (j < n) {
      const d = src.charCodeAt(j);
      if (d === 32 || d === 9 || d === 10 || d === 13 || d === 40 || d === 41 || d === 34 || d === 12 || d === 11) break;
      j++;
    }
    const tok = src.slice(i, j);
    push(NUM_RE.test(tok) ? Number(tok) : tok);
    i = j;
  }
  if (cur) fail("unterminated list (missing ')')", cur._pos ?? n);
  if (all) return top;
  if (!top.length) fail("empty input", 0);
  return top[0];
}

// ---------------------------------------------------------------- writer
const SAFE_SYM = /^[A-Za-z_*.~+\-/][A-Za-z0-9_*.~+\-/:#@$%&!?<>=|^]*$/;

function atom(v) {
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return "0";
    const s = String(v);
    // KiCad does not read exponents: spell tiny/huge values out.
    return /e/i.test(s) ? v.toFixed(12).replace(/\.?0+$/, "") : s;
  }
  if (typeof v === "boolean") return v ? "yes" : "no";
  const s = String(v);
  if (s && SAFE_SYM.test(s) && !NUM_RE.test(s)) return s;
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t")}"`;
}

// Serialize back to text. Strings that are safe keywords are written bare,
// everything else quoted, so parseSexpr(writeSexpr(x)) deep-equals x.
export function writeSexpr(node, indent = "") {
  if (!Array.isArray(node)) return atom(node);
  const simple = node.every((x) => !Array.isArray(x));
  if (simple) return `(${node.map(atom).join(" ")})`;
  const inner = indent + "  ";
  let out = "(";
  let first = true;
  for (const x of node) {
    if (Array.isArray(x)) out += `\n${inner}${writeSexpr(x, inner)}`;
    else { out += first ? atom(x) : ` ${atom(x)}`; }
    first = false;
  }
  return `${out}\n${indent})`;
}

// ---------------------------------------------------------------- helpers
export function isList(n) {
  return Array.isArray(n);
}

// The keyword at the start of a list ("" for atoms / empty lists).
export function head(n) {
  return Array.isArray(n) && typeof n[0] === "string" ? n[0] : "";
}

// First child list whose head is `name` (or one of several names).
export function child(n, name) {
  if (!Array.isArray(n)) return null;
  const names = Array.isArray(name) ? name : null;
  for (let k = 1; k < n.length; k++) {
    const c = n[k];
    if (Array.isArray(c) && (names ? names.includes(c[0]) : c[0] === name)) return c;
  }
  return null;
}

// Every child list whose head is `name` (or any list when name is omitted).
export function children(n, name) {
  if (!Array.isArray(n)) return [];
  const names = Array.isArray(name) ? name : null;
  const out = [];
  for (let k = 1; k < n.length; k++) {
    const c = n[k];
    if (!Array.isArray(c)) continue;
    if (name == null || (names ? names.includes(c[0]) : c[0] === name)) out.push(c);
  }
  return out;
}

// child(n, name)[index] — e.g. value(sym, "lib_id") -> "Device:R".
export function value(n, name, index = 1, def = undefined) {
  const c = child(n, name);
  if (!c || c.length <= index) return def;
  return c[index];
}

export function num(n, name, index = 1, def = 0) {
  const v = value(n, name, index);
  if (typeof v === "number") return v;
  if (typeof v === "string" && NUM_RE.test(v)) return Number(v);
  return def;
}

export function str(n, name, index = 1, def = "") {
  const v = value(n, name, index);
  return v == null ? def : String(v);
}

// Atom arguments of a list (everything after the head that is not a list).
export function atoms(n) {
  return Array.isArray(n) ? n.slice(1).filter((x) => !Array.isArray(x)) : [];
}

// Yes/no flags in either spelling KiCad has used:
//   (pin ... hide ...)        bare keyword (KiCad 6/7)
//   (pin ... (hide yes) ...)  list form   (KiCad 8/9)
//   (hide)                    list without a value
export function flag(n, name) {
  if (!Array.isArray(n)) return false;
  for (let k = 1; k < n.length; k++) {
    const c = n[k];
    if (c === name) return true;
    if (Array.isArray(c) && c[0] === name) {
      if (c.length === 1) return true;
      const v = c[1];
      return !(v === "no" || v === "false" || v === 0);
    }
  }
  return false;
}

// (xy 1 2) / (start 1 2) -> [1, 2]
export function xy(n, name) {
  const c = name ? child(n, name) : n;
  if (!c) return null;
  return [Number(c[1]) || 0, Number(c[2]) || 0];
}

// (at x y [angle]) -> {x, y, angle}
export function at(n, name = "at") {
  const c = child(n, name);
  if (!c) return null;
  return { x: Number(c[1]) || 0, y: Number(c[2]) || 0, angle: Number(c[3]) || 0 };
}

// (pts (xy ..) (xy ..) ...) -> [[x,y], ...]; (arc ...) entries are returned
// as {arc:{start,mid,end}} so callers can flatten them.
export function pts(n) {
  const p = child(n, "pts");
  if (!p) return [];
  const out = [];
  for (const c of children(p)) {
    if (c[0] === "xy") out.push([Number(c[1]) || 0, Number(c[2]) || 0]);
    else if (c[0] === "arc") out.push({ arc: { start: xy(c, "start"), mid: xy(c, "mid"), end: xy(c, "end") } });
  }
  return out;
}

// Depth-first walk over every list node.
export function walk(n, fn, parent = null) {
  if (!Array.isArray(n)) return;
  if (fn(n, parent) === false) return;
  for (let k = 1; k < n.length; k++) if (Array.isArray(n[k])) walk(n[k], fn, n);
}
