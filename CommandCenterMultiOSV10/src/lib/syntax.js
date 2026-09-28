// Syntax highlighting for the viewer (F3) and the editor (F4).
//
// A source file is coloured; a plain text file is not. Which it is depends on
// the name alone (`languageOf`): an extension this knows a grammar for, or one
// of the few well-known names without an extension (Makefile, Dockerfile …).
// Anything else — .txt, .log, .csv, a file with no extension — stays as it is.
//
// The output is an HTML string, not React elements: a 5 000-line file is tens
// of thousands of tokens, and one `innerHTML` is far cheaper to build and to
// mount than that many elements — the editor rebuilds it on every keystroke.
// Everything that comes from the file goes through `esc`, and the only markup
// is `<span class="sx-…">` with a class from this file, so the content cannot
// escape into markup. The classes are coloured in styles.css (per theme mode).
//
// The grammars are deliberately shallow: comments, strings, numbers, keywords,
// types, the name in front of a `(`, and the language's own decorations
// (preprocessor lines, annotations, `$variables`, tags and attributes). That is
// what "colour the reserved words" asks for, and it stays fast and predictable.
// Nothing here parses — a construct the scanner does not know stays plain text.

const words = (s) => new Set(s.trim().split(/\s+/));

// ── Keyword sets ──
const KW_JS = 'as async await break case catch class const continue debugger default delete do else enum export extends finally for from function get if implements import in instanceof interface let new of package private protected public return satisfies set static super switch this throw try typeof var void while with yield';
const KW_TS = `${KW_JS} abstract any asserts assert bigint boolean declare infer is keyof module namespace never number object out override readonly require string symbol type undefined unique unknown`;
const KW_JAVA = 'abstract assert break case catch class const continue default do else enum extends final finally for goto if implements import instanceof interface native new package private protected public return static strictfp super switch synchronized this throw throws transient try var volatile while yield record sealed permits';
// the primitive types are left out on purpose: they are listed as types below, and a type reads better in
// the type colour than in the keyword one (`int x` — `int` is not `if`).
const KW_C = 'alignas alignof asm auto break case const constexpr continue default delete do else enum explicit export extern friend goto if inline mutable namespace new noexcept operator private protected public register restrict return sizeof static static_assert struct switch template this thread_local throw try typedef typeid typename union using virtual volatile while';
const KW_CS = 'abstract as base break case catch checked class const continue default delegate do else enum event explicit extern finally fixed for foreach get goto if implicit in interface internal is lock namespace new operator out override params partial private protected public readonly ref return sealed set sizeof stackalloc static struct switch this throw try typeof unchecked unsafe using value virtual void volatile where while yield async await record init';
const KW_PY = 'and as assert async await break class continue def del elif else except finally for from global if import in is lambda match nonlocal not or pass raise return try while with yield case';
const KW_GO = 'break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var';
const KW_RUST = 'as async await break const continue crate dyn else enum extern fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait type unsafe use where while';
const KW_PHP = 'abstract and array as break callable case catch class clone const continue declare default do echo else elseif empty enddeclare endfor endforeach endif endswitch endwhile enum extends final finally fn for foreach function global goto if implements include include_once instanceof insteadof interface isset list match namespace new or print private protected public readonly require require_once return static switch throw trait try unset use var while xor yield';
const KW_RUBY = 'alias and begin break case class def defined? do else elsif end ensure false for if in module next nil not or redo rescue retry return self super then true undef unless until when while yield attr_accessor attr_reader attr_writer require require_relative';
const KW_SWIFT = 'associatedtype class deinit enum extension fileprivate func import init inout internal let open operator private protocol public rethrows static struct subscript typealias var where while break case continue default defer do else fallthrough for guard if in repeat return switch throw catch as any is try some await async';
const KW_KOTLIN = 'as break by catch class companion const constructor continue crossinline data do dynamic else enum external false finally for fun get if import in infix init inline inner interface internal is lateinit noinline null object open operator out override package private protected public reified return sealed set super suspend tailrec this throw true try typealias typeof val var vararg when where while';
const KW_LUA = 'and break do else elseif end false for function goto if in local nil not or repeat return then true until while';
const KW_SQL = 'add all alter and any as asc between by case cast check column constraint create cross database default delete desc distinct drop else end exists foreign from full group having if in index inner insert intersect into is join key left like limit not null offset on or order outer primary references right select set table then top truncate union unique update using values view when where with';
const KW_SH = 'if then else elif fi for while until do done case esac in function select time return break continue local export readonly declare typeset unset shift eval exec exit source alias trap set let';
const KW_PS = 'begin break catch class continue data define do dynamicparam else elseif end enum exit filter finally for foreach from function hidden if in param process return switch throw trap try until using var while workflow';
const KW_BAT = 'call cd chdir cls copy del dir echo else endlocal erase exit for goto if in md mkdir move not off on pause popd prompt pushd rd rem ren rename rmdir set setlocal shift start title type ver verify vol errorlevel exist defined equ neq lss leq gtr geq';

const TYP_C = 'bool char double float int long short signed size_t ssize_t unsigned void wchar_t int8_t int16_t int32_t int64_t uint8_t uint16_t uint32_t uint64_t string vector map set';
const TYP_JAVA = 'boolean byte char double float int long short void Boolean Byte Character Double Float Integer Long Short String Object List Map Set';
const TYP_CS = 'bool byte char decimal double float int long object sbyte short string uint ulong ushort var void Task List Dictionary IEnumerable';
const TYP_GO = 'bool byte complex64 complex128 error float32 float64 int int8 int16 int32 int64 rune string uint uint8 uint16 uint32 uint64 uintptr any';
const TYP_RUST = 'bool char f32 f64 i8 i16 i32 i64 i128 isize str u8 u16 u32 u64 u128 usize String Vec Option Result Box';

// ── Grammars ──
// line/block: comment markers. strings: the quotes, `esc` for backslash escapes,
// `multi` for ones that may span lines. word: what a bare word may be made of.
const clike = (o) => ({
  kind: 'code',
  line: ['//'], block: [['/*', '*/']],
  strings: [{ q: '"', esc: true }, { q: "'", esc: true }],
  lit: words('true false null'),
  call: true, ...o,
});

const LANGS = {
  js: clike({ kw: words(KW_JS), lit: words('true false null undefined NaN Infinity this'), strings: [{ q: '"', esc: true }, { q: "'", esc: true }, { q: '`', esc: true, multi: true }], meta: '@' }),
  ts: clike({ kw: words(KW_TS), lit: words('true false null undefined NaN Infinity this'), strings: [{ q: '"', esc: true }, { q: "'", esc: true }, { q: '`', esc: true, multi: true }], meta: '@' }),
  java: clike({ kw: words(KW_JAVA), typ: words(TYP_JAVA), lit: words('true false null this'), meta: '@' }),
  c: clike({ kw: words(KW_C), typ: words(TYP_C), lit: words('true false NULL nullptr'), pre: true }),
  cs: clike({ kw: words(KW_CS), typ: words(TYP_CS), lit: words('true false null this base'), pre: true, meta: '[' }),
  go: clike({ kw: words(KW_GO), typ: words(TYP_GO), lit: words('true false nil iota'), strings: [{ q: '"', esc: true }, { q: '`', multi: true }, { q: "'", esc: true }] }),
  rust: clike({ kw: words(KW_RUST), typ: words(TYP_RUST), lit: words('true false None Some Ok Err'), meta: '#' }),
  php: clike({ kw: words(KW_PHP), lit: words('true false null TRUE FALSE NULL'), line: ['//', '#'], vars: '$' }),
  ruby: { kind: 'code', line: ['#'], block: [], strings: [{ q: '"', esc: true }, { q: "'", esc: true }], kw: words(KW_RUBY), lit: words('true false nil self'), call: true, vars: '@$' },
  py: { kind: 'code', line: ['#'], block: [], strings: [{ q: '"""', esc: true, multi: true }, { q: "'''", esc: true, multi: true }, { q: '"', esc: true }, { q: "'", esc: true }], kw: words(KW_PY), lit: words('True False None self cls'), typ: words('bool bytes dict float int list object set str tuple'), call: true, meta: '@' },
  swift: clike({ kw: words(KW_SWIFT), lit: words('true false nil self') }),
  kotlin: clike({ kw: words(KW_KOTLIN), typ: words(TYP_JAVA), lit: words('true false null this it'), meta: '@' }),
  lua: { kind: 'code', line: ['--'], block: [['--[[', ']]']], strings: [{ q: '"', esc: true }, { q: "'", esc: true }], kw: words(KW_LUA), lit: words('true false nil self'), call: true },
  sql: { kind: 'code', line: ['--'], block: [['/*', '*/']], strings: [{ q: "'", esc: true }, { q: '"', esc: true }], kw: words(KW_SQL), lit: words('null true false'), call: true, fold: true },
  sh: { kind: 'code', line: ['#'], block: [], strings: [{ q: '"', esc: true, multi: true }, { q: "'", multi: true }], kw: words(KW_SH), lit: words('true false'), call: false, vars: '$' },
  ps: { kind: 'code', line: ['#'], block: [['<#', '#>']], strings: [{ q: '"', esc: true, multi: true }, { q: "'", multi: true }], kw: words(KW_PS), lit: words('$true $false $null'), call: true, vars: '$', fold: true },
  bat: { kind: 'code', line: ['rem ', '::'], block: [], strings: [{ q: '"' }], kw: words(KW_BAT), lit: words(''), call: false, vars: '%', fold: true },
  json: { kind: 'code', line: [], block: [], strings: [{ q: '"', esc: true }], kw: new Set(), lit: words('true false null'), call: false, jsonKeys: true },
  css: { kind: 'css' },
  html: { kind: 'html' },
  md: { kind: 'md' },
  yaml: { kind: 'yaml' },
  ini: { kind: 'ini' },
};

// extension (lower case, no dot) → grammar
const BY_EXT = {
  js: 'js', jsx: 'js', mjs: 'js', cjs: 'js', ts: 'ts', tsx: 'ts', mts: 'ts', cts: 'ts',
  java: 'java', c: 'c', h: 'c', cc: 'c', cpp: 'c', cxx: 'c', hpp: 'c', hh: 'c', hxx: 'c', ino: 'c', m: 'c', mm: 'c',
  cs: 'cs', go: 'go', rs: 'rust', php: 'php', rb: 'ruby', py: 'py', pyw: 'py', swift: 'swift',
  kt: 'kotlin', kts: 'kotlin', gradle: 'java', groovy: 'java', scala: 'java', dart: 'java',
  lua: 'lua', sql: 'sql', sh: 'sh', bash: 'sh', zsh: 'sh', ksh: 'sh', ps1: 'ps', psm1: 'ps', psd1: 'ps',
  bat: 'bat', cmd: 'bat', json: 'json', jsonc: 'json', json5: 'json',
  css: 'css', scss: 'css', sass: 'css', less: 'css',
  html: 'html', htm: 'html', xhtml: 'html', xml: 'html', svg: 'html', vue: 'html', svelte: 'html', xaml: 'html', plist: 'html', rss: 'html', xsl: 'html',
  md: 'md', markdown: 'md', yml: 'yaml', yaml: 'yaml',
  ini: 'ini', cfg: 'ini', conf: 'ini', toml: 'ini', properties: 'ini', desktop: 'ini', editorconfig: 'ini', env: 'ini',
};
// files whose name is the whole story
const BY_NAME = {
  makefile: 'sh', gnumakefile: 'sh', dockerfile: 'sh', containerfile: 'sh', 'cmakelists.txt': 'sh',
  '.gitignore': 'ini', '.gitattributes': 'ini', '.npmrc': 'ini', '.editorconfig': 'ini', '.env': 'ini', '.bashrc': 'sh', '.zshrc': 'sh', '.profile': 'sh',
};

// The grammar for a file, or null when it is not source code (plain text: .txt,
// .log, .csv, anything unknown). Takes a path or a bare name.
export function languageOf(pathOrName) {
  const name = String(pathOrName || '').split(/[\\/]/).pop().toLowerCase();
  if (BY_NAME[name]) return BY_NAME[name];
  const dot = name.lastIndexOf('.');
  if (dot < 0) return null;
  const id = BY_EXT[name.slice(dot + 1)];
  return id && LANGS[id] ? id : null;
}

// Beyond this the file is left plain. The viewer colours once, when it opens
// (~25 ms of scanning at the limit, plus the browser's own work on the markup);
// the editor does it again on every keystroke, so its limit is the lower one.
export const MAX_CHARS = 400000;
export const MAX_EDIT_CHARS = 120000;

export const canHighlight = (text, lang, limit = MAX_CHARS) => !!lang && !!LANGS[lang] && text.length <= limit;

// ── HTML ──
const MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };
const esc = (s) => (s.indexOf('&') < 0 && s.indexOf('<') < 0 && s.indexOf('>') < 0 ? s : s.replace(/[&<>]/g, (c) => MAP[c]));
const put = (out, cls, s) => { if (s) out.push(cls ? `<span class="sx-${cls}">${esc(s)}</span>` : esc(s)); };

const isWordCh = (c) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c === '_' || c === '$' || c >= '';
const isDigit = (c) => c >= '0' && c <= '9';

// ── The scanner for the code-shaped languages ──
function scanCode(text, L, out) {
  const n = text.length;
  let i = 0, plain = 0;                       // plain: start of the run that has no class yet
  const flush = (upto) => { if (upto > plain) put(out, '', text.slice(plain, upto)); };
  const take = (cls, from, to) => { flush(from); put(out, cls, text.slice(from, to)); plain = to; i = to; };
  const atLineStart = (at) => { let j = at - 1; while (j >= 0 && (text[j] === ' ' || text[j] === '\t')) j--; return j < 0 || text[j] === '\n'; };

  while (i < n) {
    const c = text[i];

    // a comment to the end of the line
    let hit = null;
    for (const m of L.line) {
      if (text.startsWith(m, i) && (!L.fold || true)) {
        // cmd's `rem` is a word, not a symbol: only at the start of a line
        if (/^[a-z]/i.test(m) && !atLineStart(i)) continue;
        hit = m; break;
      }
    }
    if (hit) { const e = text.indexOf('\n', i); take('com', i, e < 0 ? n : e); continue; }

    // a comment over several lines
    let blk = null;
    for (const [a, b] of L.block) if (text.startsWith(a, i)) { blk = b; break; }
    if (blk) { const e = text.indexOf(blk, i + 2); take('com', i, e < 0 ? n : e + blk.length); continue; }

    // a string
    const q = L.strings.find((s) => text.startsWith(s.q, i));
    if (q) {
      let j = i + q.q.length;
      for (; j < n; j++) {
        if (q.esc && text[j] === '\\') { j++; continue; }
        if (text.startsWith(q.q, j)) { j += q.q.length; break; }
        if (!q.multi && text[j] === '\n') break;
      }
      // in JSON the string before a ":" is the name of the field, not a value
      let cls = 'str';
      if (L.jsonKeys) { let k = Math.min(j, n); while (k < n && (text[k] === ' ' || text[k] === '\t')) k++; if (text[k] === ':') cls = 'att'; }
      take(cls, i, Math.min(j, n));
      continue;
    }

    // a preprocessor line (#include, #define) or an attribute line (#![…])
    if (L.pre && c === '#' && atLineStart(i)) { const e = text.indexOf('\n', i); take('pre', i, e < 0 ? n : e); continue; }

    // $variable, %VAR%, @ivar
    if (L.vars && L.vars.includes(c)) {
      let j = i + 1;
      if (text[j] === '{' || text[j] === '(') { const close = text[j] === '{' ? '}' : ')'; const e = text.indexOf(close, j); j = e < 0 ? n : e + 1; }
      else { while (j < n && isWordCh(text[j])) j++; if (c === '%' && text[j] === '%') j++; }
      if (j > i + 1) { take('var', i, j); continue; }
    }

    // a number
    if (isDigit(c) || (c === '.' && isDigit(text[i + 1]) && !isWordCh(text[i - 1] || ' '))) {
      let j = i;
      while (j < n && (isDigit(text[j]) || text[j] === '.' || text[j] === '_' || /[xXbBoOeEaAcCdDfF]/.test(text[j]) || ((text[j] === '+' || text[j] === '-') && /[eE]/.test(text[j - 1])))) j++;
      take('num', i, j);
      continue;
    }

    // an annotation / attribute marker that carries its word: @Override, #[derive]
    if (L.meta && L.meta.includes(c) && isWordCh(text[i + 1] || '')) {
      let j = i + 1;
      while (j < n && isWordCh(text[j])) j++;
      take('pre', i, j);
      continue;
    }

    // a word: keyword, literal, type, the name in front of a "(" — or nothing special
    if (isWordCh(c) && !isDigit(c)) {
      let j = i;
      while (j < n && isWordCh(text[j])) j++;
      let w = text.slice(i, j);
      if (L.fold) w = w.toLowerCase();   // SQL, PowerShell and cmd do not care about case
      let cls = '';
      if (L.kw.has(w)) cls = 'kw';
      else if (L.lit.has(w)) cls = 'lit';
      else if (L.typ && L.typ.has(w)) cls = 'typ';
      else if (L.call) {
        let k = j; while (k < n && (text[k] === ' ' || text[k] === '\t')) k++;
        if (text[k] === '(') cls = 'fn';
      }
      if (cls) take(cls, i, j); else i = j;
      continue;
    }

    i++;
  }
  flush(n);
}

// ── CSS ──
function scanCss(text, out) {
  const n = text.length;
  let i = 0, plain = 0, inBlock = false;
  const flush = (upto) => { if (upto > plain) put(out, '', text.slice(plain, upto)); };
  const take = (cls, from, to) => { flush(from); put(out, cls, text.slice(from, to)); plain = to; i = to; };
  while (i < n) {
    const c = text[i];
    if (c === '/' && text[i + 1] === '*') { const e = text.indexOf('*/', i + 2); take('com', i, e < 0 ? n : e + 2); continue; }
    if (c === '"' || c === "'") { let j = i + 1; while (j < n && text[j] !== c && text[j] !== '\n') { if (text[j] === '\\') j++; j++; } take('str', i, Math.min(j + 1, n)); continue; }
    if (c === '@') { let j = i + 1; while (j < n && isWordCh(text[j])) j++; take('kw', i, j); continue; }
    if (c === '{') { inBlock = true; i++; continue; }
    if (c === '}') { inBlock = false; i++; continue; }
    if (c === '#' && /[0-9a-fA-F]/.test(text[i + 1] || '')) { let j = i + 1; while (j < n && /[0-9a-fA-F]/.test(text[j])) j++; take('num', i, j); continue; }
    if (isDigit(c) || (c === '.' && isDigit(text[i + 1]))) { let j = i; while (j < n && /[0-9.a-z%]/i.test(text[j])) j++; take('num', i, j); continue; }
    if (isWordCh(c) && !isDigit(c)) {
      let j = i; while (j < n && (isWordCh(text[j]) || text[j] === '-')) j++;
      let k = j; while (k < n && (text[k] === ' ' || text[k] === '\t')) k++;
      // inside a rule a word before ":" is a property; outside, a word is part of the selector
      take(inBlock ? (text[k] === ':' ? 'att' : 'lit') : 'tag', i, j);
      continue;
    }
    i++;
  }
  flush(n);
}

// ── HTML / XML ──
function scanHtml(text, out) {
  const n = text.length;
  let i = 0, plain = 0;
  const flush = (upto) => { if (upto > plain) put(out, '', text.slice(plain, upto)); };
  const take = (cls, from, to) => { flush(from); put(out, cls, text.slice(from, to)); plain = to; i = to; };
  while (i < n) {
    if (text.startsWith('<!--', i)) { const e = text.indexOf('-->', i + 4); take('com', i, e < 0 ? n : e + 3); continue; }
    if (text[i] !== '<') { i++; continue; }
    // <?xml …?>, <!DOCTYPE …>
    if (text[i + 1] === '?' || text[i + 1] === '!') { const e = text.indexOf('>', i); take('pre', i, e < 0 ? n : e + 1); continue; }
    const end = text.indexOf('>', i);
    const stop = end < 0 ? n : end + 1;
    // the tag name, then attribute="value" pairs until the closing bracket
    let j = i + 1;
    if (text[j] === '/') j++;
    while (j < stop && /[\w:.-]/.test(text[j])) j++;
    take('tag', i, j);
    while (i < stop) {
      const c = text[i];
      if (c === '"' || c === "'") { let k = i + 1; while (k < stop && text[k] !== c) k++; take('str', i, Math.min(k + 1, stop)); continue; }
      if (/[\w:.-]/.test(c)) { let k = i; while (k < stop && /[\w:.-]/.test(text[k])) k++; take('att', i, k); continue; }
      if (c === '>' || (c === '/' && text[i + 1] === '>')) { take('tag', i, stop); break; }
      i++;
    }
    if (i < stop) { flush(i); plain = i; }
  }
  flush(n);
}

// ── Markdown ──
function scanMd(text, out) {
  const lines = text.split('\n');
  let fence = '';
  lines.forEach((line, idx) => {
    const nl = idx < lines.length - 1 ? '\n' : '';
    const f = line.match(/^\s*(```|~~~)/);
    if (fence) { put(out, 'str', line + nl); if (f && line.trim().startsWith(fence)) fence = ''; return; }
    if (f) { fence = f[1]; put(out, 'str', line + nl); return; }
    if (/^\s{0,3}#{1,6}\s/.test(line)) { put(out, 'kw', line + nl); return; }
    if (/^\s*>/.test(line)) { put(out, 'com', line + nl); return; }
    if (/^\s*([-*_])\s*\1\s*\1[\s-*_]*$/.test(line)) { put(out, 'pre', line + nl); return; }
    // inline: `code`, **bold**, *italic*, [text](link), and the bullet / number a list starts with
    const m = line.match(/^(\s*(?:[-*+]|\d+\.)\s)/);
    let rest = line;
    if (m) { put(out, 'pre', m[1]); rest = line.slice(m[1].length); }
    const re = /(`[^`\n]*`)|(\*\*[^*\n]+\*\*|__[^_\n]+__)|(\*[^*\n]+\*|_[^_\n]+_)|(\[[^\]\n]*\]\([^)\n]*\))/g;
    let at = 0, mm;
    while ((mm = re.exec(rest))) {
      put(out, '', rest.slice(at, mm.index));
      put(out, mm[1] ? 'str' : mm[2] ? 'kw' : mm[3] ? 'lit' : 'att', mm[0]);
      at = mm.index + mm[0].length;
    }
    put(out, '', rest.slice(at) + nl);
  });
}

// ── YAML ──
function scanYaml(text, out) {
  for (const [idx, line] of text.split('\n').entries()) {
    const nl = '\n';
    const tail = idx === text.split('\n').length - 1 ? '' : nl;
    const hash = line.indexOf('#');
    const code = hash >= 0 && (hash === 0 || /\s/.test(line[hash - 1])) ? line.slice(0, hash) : line;
    const comment = hash >= 0 && (hash === 0 || /\s/.test(line[hash - 1])) ? line.slice(hash) : '';
    const m = code.match(/^(\s*-?\s*)([^:\s][^:]*)(:)(\s|$)/);
    if (m) {
      put(out, '', m[1]);
      put(out, 'att', m[2]);
      put(out, 'op', m[3]);
      const rest = code.slice(m[1].length + m[2].length + 1);
      put(out, /^\s*(true|false|null|yes|no|~)\s*$/i.test(rest) ? 'lit' : /^\s*-?\d/.test(rest) ? 'num' : '', rest);
    } else if (/^\s*---\s*$/.test(code)) put(out, 'pre', code);
    else put(out, '', code);
    put(out, 'com', comment);
    put(out, '', tail);
  }
}

// ── INI / TOML / .env ──
function scanIni(text, out) {
  const lines = text.split('\n');
  lines.forEach((line, idx) => {
    const tail = idx === lines.length - 1 ? '' : '\n';
    if (/^\s*[#;]/.test(line)) { put(out, 'com', line + tail); return; }
    if (/^\s*\[.*\]\s*$/.test(line)) { put(out, 'kw', line + tail); return; }
    const eq = line.search(/[=:]/);
    if (eq > 0) {
      put(out, 'att', line.slice(0, eq));
      put(out, 'op', line[eq]);
      const v = line.slice(eq + 1);
      put(out, /^\s*(true|false|yes|no|on|off)\s*$/i.test(v) ? 'lit' : /^\s*-?[\d.]+\s*$/.test(v) ? 'num' : 'str', v);
      put(out, '', tail);
      return;
    }
    put(out, '', line + tail);
  });
}

// The file as HTML, coloured. `lang` comes from languageOf; an unknown one, or
// a file past MAX_CHARS, is the caller's business (canHighlight).
export function highlightHtml(text, lang) {
  const L = LANGS[lang];
  if (!L) return esc(text);
  const out = [];
  if (L.kind === 'css') scanCss(text, out);
  else if (L.kind === 'html') scanHtml(text, out);
  else if (L.kind === 'md') scanMd(text, out);
  else if (L.kind === 'yaml') scanYaml(text, out);
  else if (L.kind === 'ini') scanIni(text, out);
  else scanCode(text, L, out);
  return out.join('');
}

// The languages, for a settings hint or a test.
export const LANGUAGE_IDS = Object.keys(LANGS);
