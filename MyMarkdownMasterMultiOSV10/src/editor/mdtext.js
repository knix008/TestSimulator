// Pure Markdown text helpers for the note editor (no CodeMirror, no DOM): line prefixes (lists, quotes,
// tasks), headings, wrapping marks, smart punctuation, focus ranges, the contexts that start
// autocompletion, front matter and footnotes. Everything works on plain strings so node --test can
// check it; the editor (commands.js, complete.js, focus.js) maps the results onto CodeMirror changes.

// ───────────────────────── lines

/** `- `, `* `, `+ `, `1. `, `1) ` with an optional task box: [indent, marker, space, box, boxChar]. */
export const LIST_RE = /^(\s*)([-*+]|\d{1,9}[.)])([ \t]+)(\[([^\]])\][ \t]+)?/;
export const QUOTE_RE = /^(\s*>[ \t]?)+/;
export const HEADING_RE = /^ {0,3}(#{1,6})(?:[ \t]+|$)(.*?)(?:[ \t]+#+[ \t]*)?$/;

/** Splits a line into { quote, indent, marker, space, box, boxChar, body }. */
export function parseLine(line) {
  const quote = QUOTE_RE.exec(line)?.[0] ?? '';
  const rest = line.slice(quote.length);
  const m = LIST_RE.exec(rest);
  if (!m) {
    const indent = /^\s*/.exec(rest)[0];
    return { quote, indent, marker: '', space: '', box: '', boxChar: null, body: rest.slice(indent.length) };
  }
  return { quote, indent: m[1], marker: m[2], space: m[3], box: m[4] ?? '', boxChar: m[5] ?? null, body: rest.slice(m[0].length) };
}

export const isBulletMarker = (marker) => marker === '-' || marker === '*' || marker === '+';
export const isOrderedMarker = (marker) => /^\d+[.)]$/.test(marker);

/** What a prefix given to toggleLinePrefix stands for. */
export function prefixKind(prefix) {
  const p = prefix.trim();
  if (p === '>') return 'quote';
  if (/^[-*+] \[.\]$/.test(p)) return 'task';
  if (/^\d+[.)]$/.test(p)) return 'ordered';
  if (/^[-*+]$/.test(p)) return 'bullet';
  return 'raw';
}

function hasKind(info, kind, prefix) {
  if (kind === 'task') return info.boxChar != null;
  if (kind === 'bullet') return isBulletMarker(info.marker) && info.boxChar == null;
  if (kind === 'ordered') return isOrderedMarker(info.marker) && info.boxChar == null;
  return false;
}

/**
 * Toggles a line prefix on every line (Obsidian/Typora "bulleted list", "numbered list", "quote",
 * "task list"): when every non-empty line already has it, it is removed; otherwise it is set on each
 * line (a different list marker is replaced, numbers run 1, 2, 3 per indent level). Returns the new lines.
 */
export function toggleLinePrefixLines(lines, prefix) {
  const kind = prefixKind(prefix);
  const consider = lines.length === 1 ? lines : lines.filter((line) => line.trim() !== '');
  const indices = lines.map((line, i) => i).filter((i) => lines.length === 1 || lines[i].trim() !== '');
  if (kind === 'quote') {
    const all = consider.length > 0 && consider.every((line) => /^\s*>/.test(line));
    return lines.map((line, i) => {
      if (!indices.includes(i)) return line;
      if (all) return line.replace(/^(\s*)>[ \t]?/, '$1');
      return `> ${line}`;
    });
  }
  if (kind === 'raw') {
    const all = consider.length > 0 && consider.every((line) => line.startsWith(prefix));
    return lines.map((line, i) => (!indices.includes(i) ? line : all ? line.slice(prefix.length) : prefix + line));
  }
  const infos = lines.map(parseLine);
  const all = indices.length > 0 && indices.every((i) => hasKind(infos[i], kind, prefix));
  const counters = new Map();
  return lines.map((line, i) => {
    if (!indices.includes(i)) return line;
    const info = infos[i];
    if (all) return info.quote + info.indent + info.body;
    let marker;
    if (kind === 'ordered') {
      const level = info.indent.length;
      for (const key of [...counters.keys()]) if (key > level) counters.delete(key);
      const first = Number.parseInt(prefix, 10) || 1;
      const n = (counters.get(level) ?? first - 1) + 1;
      counters.set(level, n);
      marker = `${n}${/\)/.test(prefix) ? ')' : '.'} `;
    } else if (kind === 'task') {
      const bullet = isBulletMarker(info.marker) ? info.marker : prefix.trim()[0];
      marker = `${bullet} [${info.boxChar ?? ' '}] `;
    } else {
      marker = `${prefix.trim()} `;
    }
    return info.quote + info.indent + marker + info.body;
  });
}

/** The heading level and text of an ATX heading line, or null. */
export function headingOf(line) {
  const m = HEADING_RE.exec(line);
  if (!m) return null;
  return { level: m[1].length, text: m[2].trim() };
}

/** The line as a heading of `level` (0: a paragraph). Keeps a quote prefix. */
export function setHeadingLine(line, level) {
  const quote = QUOTE_RE.exec(line)?.[0] ?? '';
  let rest = line.slice(quote.length);
  rest = rest.replace(/^ {0,3}#{1,6}(?:[ \t]+|$)/, '');
  if (level <= 0) return quote + rest;
  return `${quote}${'#'.repeat(Math.min(6, level))} ${rest}`;
}

/** Obsidian "toggle checkbox": text → `- [ ] text`, `- item` → `- [ ] item`, `[ ]` ↔ `[x]`. */
export function toggleTaskLine(line) {
  const info = parseLine(line);
  if (info.boxChar != null) {
    const next = info.boxChar === ' ' ? 'x' : ' ';
    return `${info.quote}${info.indent}${info.marker}${info.space}[${next}] ${info.body}`;
  }
  if (info.marker) return `${info.quote}${info.indent}${info.marker}${info.space}[ ] ${info.body}`;
  return `${info.quote}${info.indent}- [ ] ${info.body}`;
}

export const TASK_STATES = [' ', '/', 'x', '-'];
/** Cycles a task's state: to do → in progress (/) → done (x) → cancelled (-) → to do. */
export function cycleTaskLine(line) {
  const info = parseLine(line);
  if (info.boxChar == null) return toggleTaskLine(line);
  const index = TASK_STATES.indexOf(info.boxChar.toLowerCase());
  const next = TASK_STATES[(index + 1) % TASK_STATES.length];
  return `${info.quote}${info.indent}${info.marker}${info.space}[${next}] ${info.body}`;
}

// ───────────────────────── wrapping marks

function runOf(text, index, char, step) {
  let n = 0;
  for (let i = index; i >= 0 && i < text.length && text[i] === char; i += step) n++;
  return n;
}

/** True when `before`/`after` really surround [from, to) — `*` is not the half of a `**`. */
function surrounded(text, from, to, before, after) {
  if (text.slice(from - before.length, from) !== before || text.slice(to, to + after.length) !== after) return false;
  if (before === after && before.length <= 2 && /^(.)\1*$/.test(before) && '*_'.includes(before[0])) {
    const n = runOf(text, from - 1, before[0], -1);
    const m = runOf(text, to, before[0], 1);
    if (before.length === 1) return n % 2 === 1 && m % 2 === 1;
    return n >= 2 && m >= 2 && n !== 1;
  }
  return true;
}

/**
 * Toggles marks around a selection (bold, italic, ==highlight== …). Returns one change and the new
 * selection: { from, to, insert, selFrom, selTo } (document offsets after the change).
 */
export function toggleWrap(text, from, to, before, after = before, placeholder = '') {
  const selected = text.slice(from, to);
  if (surrounded(text, from, to, before, after)) {
    return { from: from - before.length, to: to + after.length, insert: selected, selFrom: from - before.length, selTo: to - before.length };
  }
  if (selected.length >= before.length + after.length && selected.startsWith(before) && selected.endsWith(after)) {
    const inner = selected.slice(before.length, selected.length - after.length);
    // `**bold**` selected and italic asked for: that is not italic text, wrap it instead.
    const halfOfDouble = before.length === 1 && '*_'.includes(before) && inner.startsWith(before) && !inner.startsWith(before + before);
    if (!halfOfDouble) {
      return { from, to, insert: inner, selFrom: from, selTo: from + inner.length };
    }
  }
  if (!selected) {
    const insert = before + placeholder + after;
    return { from, to, insert, selFrom: from + before.length, selTo: from + before.length + placeholder.length };
  }
  const lead = /^\s*/.exec(selected)[0];
  const trail = /\s*$/.exec(selected.slice(lead.length))[0];
  const core = selected.slice(lead.length, selected.length - trail.length);
  if (!core) {
    const insert = selected + before + placeholder + after;
    return { from, to, insert, selFrom: to + before.length, selTo: to + before.length + placeholder.length };
  }
  const insert = lead + before + core + after + trail;
  const selFrom = from + lead.length + before.length;
  return { from, to, insert, selFrom, selTo: selFrom + core.length };
}

// ───────────────────────── smart punctuation

const OPENING_BEFORE = /(^|[\s([{<“‘—–-])$/;

/**
 * Typographic replacements while typing (iA Writer / Typora "smart punctuation"): straight quotes →
 * curly, `--` → em dash, `...` → ellipsis. `before` is the text of the line before the cursor.
 * Returns { deleteBefore, insert } or null (type the character as is).
 */
export function smartPunctuation(before, typed) {
  if (typed === '"') return { deleteBefore: 0, insert: OPENING_BEFORE.test(before) ? '“' : '”' };
  if (typed === "'") return { deleteBefore: 0, insert: OPENING_BEFORE.test(before) ? '‘' : '’' };
  if (typed === '-') {
    if (!before.endsWith('-') || before.endsWith('--')) return null;
    if (/^\s*-$/.test(before) || /^[\s>]*-$/.test(before)) return null; // `---` rules, front matter, list items
    if (before.includes('|') || /<!-$/.test(before) || /^[\s-]*$/.test(before)) return null;
    return { deleteBefore: 1, insert: '—' };
  }
  if (typed === '.') {
    if (!before.endsWith('..') || before.endsWith('...')) return null;
    return { deleteBefore: 2, insert: '…' };
  }
  return null;
}

// ───────────────────────── focus ranges

/** [startIndex, endIndex] (inclusive, 0-based) of the paragraph (consecutive non-blank lines) around `index`. */
export function paragraphAt(lines, index) {
  if (!lines[index] || !lines[index].trim()) return [index, index];
  let a = index;
  let b = index;
  while (a > 0 && lines[a - 1].trim()) a--;
  while (b < lines.length - 1 && lines[b + 1].trim()) b++;
  return [a, b];
}

/** [from, to) of the sentence around `offset` in `text` (a paragraph). */
export function sentenceAt(text, offset) {
  const ends = /[.!?。！？…]+["'”’)\]]*(?=\s|$)|\n\s*\n/g;
  let start = 0;
  let m;
  while ((m = ends.exec(text))) {
    const end = m.index + m[0].length;
    if (offset < end || (offset === end && offset === text.length)) {
      return [start + /^\s*/.exec(text.slice(start))[0].length, end];
    }
    start = end;
  }
  const lead = /^\s*/.exec(text.slice(start))[0].length;
  return [Math.min(text.length, start + lead), text.replace(/\s+$/, '').length < start ? text.length : text.replace(/\s+$/, '').length];
}

// ───────────────────────── completion contexts

/**
 * The wiki link being typed before the cursor: { kind: 'note'|'heading'|'block'|'alias', embed,
 * start, query, target } (start: offset in `before` where the replaced query begins), or null.
 */
export function linkContext(before) {
  const open = before.lastIndexOf('[[');
  if (open < 0) return null;
  const inner = before.slice(open + 2);
  if (inner.includes(']]') || inner.includes('\n')) return null;
  const embed = open > 0 && before[open - 1] === '!';
  const bar = inner.indexOf('|');
  if (bar >= 0) return { kind: 'alias', embed, start: open + 2 + bar + 1, query: inner.slice(bar + 1), target: inner.slice(0, bar) };
  const hash = inner.indexOf('#');
  const caret = inner.indexOf('^');
  if (hash >= 0 && (caret < 0 || hash < caret)) {
    const target = inner.slice(0, hash);
    const rest = inner.slice(hash + 1);
    if (rest.startsWith('^')) return { kind: 'block', embed, start: open + 2 + hash + 2, query: rest.slice(1), target };
    return { kind: 'heading', embed, start: open + 2 + hash + 1, query: rest, target };
  }
  if (caret >= 0) return { kind: 'block', embed, start: open + 2 + caret + 1, query: inner.slice(caret + 1), target: inner.slice(0, caret) };
  return { kind: 'note', embed, start: open + 2, query: inner, target: '' };
}

/** `#tag` being typed (at a word start, at least one character): { start, query } or null. */
export function tagContext(before) {
  const m = /(^|[\s([{,;])#([\p{L}\p{N}_/-]+)$/u.exec(before);
  if (!m) return null;
  if (/^\d+$/.test(m[2]) && m[2].length > 3) return null;
  return { start: m.index + m[1].length, query: m[2] };
}

/** `:smi` → { start (of the colon), query: 'smi' } (two letters at least), or null. */
export function emojiContext(before) {
  const m = /(^|[\s([{])(:([a-z0-9_+-]{2,}))$/i.exec(before);
  if (!m || /^\d+$/.test(m[3])) return null;
  return { start: m.index + m[1].length, query: m[3].toLowerCase() };
}

/** `/command` at the line start or after a space: { start (of the slash), query } or null. */
export function slashContext(before) {
  const m = /(^|\s)\/([\p{L}\p{N}_-]*)$/u.exec(before);
  if (!m) return null;
  return { start: m.index + m[1].length, query: m[2] };
}

/** A property key being typed at the start of a front matter line: { start, query } or null. */
export function propertyContext(before) {
  const m = /^([\p{L}\p{N}_-]*)$/u.exec(before);
  return m ? { start: 0, query: m[1] } : null;
}

/** Filters `[{ label, keywords }]` by a query (prefix and substring matches; prefix first). */
export function filterByQuery(items, query, keysOf = (item) => [item.label, ...(item.keywords ?? [])]) {
  const q = query.toLowerCase();
  if (!q) return items.slice();
  const scored = [];
  for (const item of items) {
    const keys = keysOf(item).filter(Boolean).map((key) => String(key).toLowerCase());
    let score = -1;
    if (keys.some((key) => key.startsWith(q))) score = 2;
    else if (keys.some((key) => key.includes(q))) score = 1;
    if (score >= 0) scored.push([score, item]);
  }
  return scored.sort((a, b) => b[0] - a[0]).map(([, item]) => item);
}

// ───────────────────────── front matter, footnotes, links

/** The YAML front matter at the top: { from, to, contentFrom, contentTo, lastLine (0-based) } or null. */
export function frontMatterRange(text) {
  if (!/^---[ \t]*(\r?\n)/.test(text)) return null;
  const first = text.indexOf('\n') + 1;
  const re = /^(---|\.\.\.)[ \t]*$/gm;
  re.lastIndex = first;
  const m = re.exec(text);
  if (!m) return null;
  const to = m.index + m[0].length;
  return { from: 0, to, contentFrom: first, contentTo: Math.max(first, m.index - 1), lastLine: text.slice(0, m.index).split('\n').length - 1 };
}

/** The next free numeric footnote label in the text (`[^1]`, `[^2]` … → 3). */
export function nextFootnoteNumber(text) {
  let max = 0;
  for (const m of text.matchAll(/\[\^(\d+)\]/g)) max = Math.max(max, Number(m[1]));
  return max + 1;
}

/** Splits a wiki link body `target#sub|alias` → { target, subpath, alias }. */
export function splitWikiLink(body) {
  const bar = body.indexOf('|');
  const main = bar >= 0 ? body.slice(0, bar) : body;
  const alias = bar >= 0 ? body.slice(bar + 1) : '';
  const hash = main.indexOf('#');
  return { target: (hash >= 0 ? main.slice(0, hash) : main).trim(), subpath: hash >= 0 ? main.slice(hash + 1).trim() : '', alias: alias.trim() };
}

/** Splits a Markdown link URL: external (has a scheme) or a vault path with an optional #subpath. */
export function splitUrl(url) {
  const raw = String(url ?? '').trim().replace(/^<|>$/g, '');
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith('//')) return { target: raw, subpath: '', external: raw };
  const hash = raw.indexOf('#');
  let target = hash >= 0 ? raw.slice(0, hash) : raw;
  try { target = decodeURI(target); } catch { /* keep */ }
  return { target, subpath: hash >= 0 ? raw.slice(hash + 1) : '', external: undefined };
}

export const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|avif|ico)$/i;

export const IMAGE_ALIGNS = ['left', 'center', 'right'];

const decodeEntities = (s) => String(s).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

/**
 * A picture dragged from a web page (drop data: `text/uri-list`, `text/html`, `text/plain`) →
 * { url, alt } or null. An <img src> in the HTML wins; otherwise a URL that ends in a picture extension.
 */
export function droppedImage({ uriList = '', html = '', plain = '' } = {}) {
  const tag = /<img\b[^>]*>/i.exec(html ?? '');
  if (tag) {
    const attr = (name) => { const m = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag[0]); return m ? decodeEntities(m[1] ?? m[2] ?? m[3] ?? '') : ''; };
    const src = attr('src').trim();
    if (src && /^(https?:|data:image\/|file:)/i.test(src)) return { url: src, alt: attr('alt').trim() };
  }
  const urls = String(uriList || plain || '').split(/\r?\n/).map((s) => s.trim()).filter((s) => s && !s.startsWith('#'));
  const url = urls.find((u) => /^https?:\/\/\S+$/i.test(u) && IMAGE_EXT.test(u.replace(/[?#].*$/, '')));
  return url ? { url, alt: '' } : null;
}

/** `![alt](url)` with the URL made safe for Markdown (spaces, parentheses, angle brackets escaped). */
export function imageMarkdown(url, alt = '') {
  const safeUrl = String(url).replace(/[ ()<>]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  const safeAlt = String(alt ?? '').replace(/[[\]|\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  return `![${safeAlt}](${safeUrl})`;
}

/**
 * The options of an image embed's alias (wiki `![[img.png|…]]`) or alt text (`![…](url)`), split at `|`
 * in any order: a size `300` / `300x200`, an alignment `left` / `center` / `right`, the rest is the
 * caption. → { width, height, align, text } (undefined when absent; text '' when absent).
 */
export function imageOptions(alias) {
  let width; let height; let align;
  const text = [];
  for (const raw of String(alias ?? '').split('|')) {
    const part = raw.trim();
    const size = /^(\d+)(?:\s*[xX×]\s*(\d+))?$/.exec(part);
    if (size && width === undefined && Number(size[1]) > 0) { width = Number(size[1]); height = size[2] ? Number(size[2]) : undefined; continue; }
    if (!align && IMAGE_ALIGNS.includes(part.toLowerCase())) { align = part.toLowerCase(); continue; }
    text.push(raw);
  }
  return { width, height, align, text: text.join('|').trim() };
}

/** `img.png|300` or `|300x200` (also with an alignment in any order) → { width, height } (numbers or undefined). */
export function embedSize(alias) {
  const { width, height } = imageOptions(alias);
  return { width, height };
}

/** Options → the alias text: `caption|align|WxH` (the parts that are set). */
export function formatImageOptions({ text = '', align, width, height } = {}) {
  const parts = [];
  if (text) parts.push(text);
  if (align && IMAGE_ALIGNS.includes(align)) parts.push(align);
  if (width > 0) parts.push(height > 0 ? `${Math.round(width)}x${Math.round(height)}` : String(Math.round(width)));
  return parts.join('|');
}

/**
 * Rewrites one image embed's source (`![[img.png|…]]` or `![alt|…](url)`) with changed options:
 * `{ width }` (a number, or null to drop the size; a new width drops the height so the ratio stays),
 * `{ height }`, `{ align }` ('left'|'center'|'right', or null to drop it). Other text is kept.
 * Returns the source unchanged when it is not an image embed.
 */
export function setImageOptions(source, changes = {}) {
  const src = String(source ?? '');
  const apply = (alias) => {
    const opts = imageOptions(alias);
    if ('width' in changes) { opts.width = changes.width ?? undefined; opts.height = 'height' in changes ? (changes.height ?? undefined) : undefined; }
    else if ('height' in changes) opts.height = changes.height ?? undefined;
    if ('align' in changes) opts.align = changes.align ?? undefined;
    return formatImageOptions(opts);
  };
  const wiki = /^!\[\[([^\]|]*)(?:\|([^\]]*))?\]\]$/.exec(src);
  if (wiki) {
    const alias = apply(wiki[2] ?? '');
    return `![[${wiki[1]}${alias ? `|${alias}` : ''}]]`;
  }
  const md = /^!\[([^\]]*)\](\([\s\S]*\))$/.exec(src);
  if (md) return `![${apply(md[1])}]${md[2]}`;
  return src;
}

/** The heading the 0-based line `index` sits under: { text, level, line (1-based) } or null. */
export function headingBefore(lines, index, isCode = null) {
  const code = isCode ?? codeLineTest(lines);
  for (let i = Math.min(index, lines.length - 1); i >= 0; i--) {
    if (code(i)) continue;
    const h = headingOf(lines[i]);
    if (h) return { text: h.text, level: h.level, line: i + 1 };
  }
  return null;
}

/** A predicate: is the 0-based line inside a fenced code block or the front matter (incl. fences)? */
export function codeLineTest(lines) {
  const inCode = new Uint8Array(lines.length);
  let fence = null;
  let start = 0;
  if (/^---\s*$/.test(lines[0] ?? '')) {
    for (let i = 1; i < lines.length; i++) {
      if (/^(---|\.\.\.)\s*$/.test(lines[i])) { for (let j = 0; j <= i; j++) inCode[j] = 1; start = i + 1; break; }
    }
  }
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    const m = /^\s{0,3}(`{3,}|~{3,})/.exec(line.replace(/^(\s*>\s?)+/, ''));
    if (fence) {
      inCode[i] = 1;
      if (m && m[1][0] === fence[0] && m[1].length >= fence.length && !/\S/.test(line.replace(/^(\s*>\s?)+/, '').trim().slice(m[1].length))) fence = null;
    } else if (m) {
      fence = m[1];
      inCode[i] = 1;
    }
  }
  return (i) => inCode[i] === 1;
}

// ───────────────────────── widths

/** Display columns of a string: East Asian wide / fullwidth characters and emoji count as 2. */
export function displayWidth(text) {
  let width = 0;
  for (const ch of String(text)) {
    const c = ch.codePointAt(0);
    if (c < 0x20 || (c >= 0x300 && c <= 0x36f) || c === 0x200d || (c >= 0xfe00 && c <= 0xfe0f)) continue;
    width += isWide(c) ? 2 : 1;
  }
  return width;
}

function isWide(c) {
  return (c >= 0x1100 && c <= 0x115f) || (c >= 0x2e80 && c <= 0xa4cf) || (c >= 0xac00 && c <= 0xd7a3)
    || (c >= 0xf900 && c <= 0xfaff) || (c >= 0xfe30 && c <= 0xfe4f) || (c >= 0xff00 && c <= 0xff60)
    || (c >= 0xffe0 && c <= 0xffe6) || (c >= 0x1f300 && c <= 0x1faff) || (c >= 0x20000 && c <= 0x3fffd);
}
