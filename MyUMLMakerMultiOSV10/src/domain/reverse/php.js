// PHP reverse engineering: a tolerant parser for .php sources (namespace
// lines and namespace blocks, use imports with groups and aliases, classes,
// abstract / final / readonly classes, interfaces, traits, enums with backed
// cases, extends / implements, #[attributes], typed and untyped properties,
// constructor property promotion, constants (static read-only), methods with
// typed parameters, by-reference and variadic parameters, defaults and
// return types, static / abstract / final, PHPDoc descriptions and the
// @var / @param / @return / @throws types). Returns the neutral description
// used by reverse/index.js; namespaces become packages (split on "\").
//
// A PHPDoc type replaces a weak native type ("array", "iterable", "mixed",
// none): "@var Item[]" on "array $items" is a list of Item. "self" and
// "static" stand for the class itself.
import { Cursor, newDecl, splitTop, tokenize } from './java.js';

const MEMBER_MODIFIERS = new Set(['public', 'protected', 'private', 'static', 'abstract', 'final', 'readonly', 'var']);
const PROMOTION_MODIFIERS = new Set(['public', 'protected', 'private', 'readonly']);
const TYPE_KEYWORDS = new Set(['class', 'interface', 'trait', 'enum']);
const WEAK_TYPES = new Set(['', 'array', 'iterable', 'mixed', 'object', 'callable', '?array', '?iterable', '?object', 'array|null', 'iterable|null']);

/** Parses one PHP source → { package: [..], imports: [..], types: [Decl] }. */
export function parse(src) {
  const code = phpCode(String(src));
  const c = new Cursor(tokenize(code), code);
  const file = { imports: [] };
  const out = [];
  scope(c, [], file, out, true);
  return regroup(out, file.imports);
}

/**
 * The PHP code of a source with the same offsets: text outside <?php … ?>,
 * "#" comments and heredocs are blanked, line breaks inside strings become
 * spaces (the shared tokenizer ends a string at a line break).
 */
function phpCode(src) {
  const out = src.split('');
  const n = src.length;
  const blank = (a, b) => { for (let k = a; k < b; k += 1) if (out[k] !== '\n') out[k] = ' '; };
  let php = !/<\?(php|=)?/i.test(src); // a snippet without an opening tag is all code
  let i = 0;
  while (i < n) {
    if (!php) {
      const open = src.indexOf('<?', i);
      if (open < 0) { blank(i, n); break; }
      let k = open + 2;
      if (src.slice(k, k + 3).toLowerCase() === 'php') k += 3; else if (src[k] === '=') k += 1;
      blank(i, k);
      i = k;
      php = true;
      continue;
    }
    const ch = src[i];
    if (ch === '?' && src[i + 1] === '>') { blank(i, i + 2); i += 2; php = false; continue; }
    if ((ch === '/' && src[i + 1] === '/') || (ch === '#' && src[i + 1] !== '[')) {
      let k = i;
      while (k < n && src[k] !== '\n' && !(src[k] === '?' && src[k + 1] === '>')) k += 1;
      blank(i, k);
      i = k;
      continue;
    }
    if (ch === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      i = end < 0 ? n : end + 2;
      continue;
    }
    if (ch === "'" || ch === '"') {
      let k = i + 1;
      while (k < n && src[k] !== ch) {
        if (src[k] === '\\') k += 1;
        else if (src[k] === '\n' || src[k] === '\r') out[k] = ' ';
        k += 1;
      }
      i = k + 1;
      continue;
    }
    if (ch === '<' && src.startsWith('<<<', i)) {
      const head = /^<<<[ \t]*(["']?)([A-Za-z_]\w*)\1[ \t]*\r?\n/.exec(src.slice(i, i + 200));
      if (head) {
        const id = head[2];
        let k = i + head[0].length;
        let end = n;
        while (k < n) {
          const lineEnd = src.indexOf('\n', k);
          const stop = lineEnd < 0 ? n : lineEnd;
          const line = src.slice(k, stop);
          const indent = line.length - line.trimStart().length;
          if (line.trimStart().startsWith(id) && !/\w/.test(line.trimStart()[id.length] ?? '')) { end = k + indent + id.length; break; }
          k = stop + 1;
        }
        blank(i, end);
        out[i] = "'"; out[i + 1] = "'"; // an empty string in its place
        i = end;
        continue;
      }
    }
    i += 1;
  }
  return out.join('');
}

/** Types under different namespaces in one file: the first namespace is the file's, others are kept by name. */
function regroup(groups, imports) {
  if (!groups.length) return { package: [], imports, types: [] };
  const first = groups[0].ns;
  if (groups.every((g) => g.ns.join('.') === first.join('.'))) return { package: first, imports, types: groups.map((g) => g.decl) };
  return { package: [], imports, types: groups.map((g) => ({ ...g.decl, package: g.ns })) };
}

/** File or namespace block: namespaces, use lines, type declarations; functions and statements are skipped. */
function scope(c, ns, file, out, top) {
  let current = ns;
  while (!c.done) {
    if (c.is('}')) { if (top) { c.next(); continue; } return; }
    if (c.is('namespace') && !c.is('\\', 1)) {
      c.next();
      const from = c.i;
      while (!c.done && !c.is('{') && !c.is(';')) c.next();
      const name = c.text(from).replace(/\s/g, '').split('\\').filter(Boolean);
      if (c.eat(';')) { current = name; continue; }
      c.next(); // '{'
      scope(c, name, file, out, false);
      c.eat('}');
      current = ns;
      continue;
    }
    if (c.is('use')) { useLine(c, file); continue; }
    if (c.is('function')) { c.next(); c.skipUntil(['{', ';']); if (c.is('{')) c.skipBalanced(); else c.eat(';'); continue; }
    const decl = typeDecl(c);
    if (decl) { out.push({ ns: current, decl }); continue; }
    if (c.is('{') || c.is('(') || c.is('[')) c.skipBalanced();
    else c.next();
  }
}

/** "use A\B\C;", "use A\B\{C, D as E};", "use function …;" → imports as dotted names. */
function useLine(c, file) {
  c.next(); // 'use'
  if (c.is('function') || c.is('const')) { c.skipUntil([';']); c.eat(';'); return; }
  const from = c.i;
  c.skipUntil([';']);
  const text = c.text(from).replace(/\s+/g, ' ');
  c.eat(';');
  const group = /^([^{]*)\{([^}]*)\}$/.exec(text);
  const names = group
    ? group[2].split(',').map((s) => `${group[1].trim().replace(/\\$/, '')}\\${s.trim()}`)
    : text.split(',');
  for (const raw of names) {
    const name = raw.trim().split(/\s+as\s+/i)[0].trim().replace(/^\\/, '');
    if (name && !/\\$/.test(name)) file.imports.push(name.split('\\').join('.'));
  }
}

function skipAttributes(c) {
  while (c.is('#') && c.is('[', 1)) { c.next(); c.skipBalanced(); }
}

const visibilityOf = (mods) => (mods.has('private') ? 'private' : mods.has('protected') ? 'protected' : 'public');

/** A class / interface / trait / enum declaration at the cursor, or null (cursor unchanged). */
function typeDecl(c) {
  const start = c.i;
  const doc = cleanDoc(c.peek()?.doc ?? '');
  skipAttributes(c);
  const mods = new Set();
  while (c.isId() && ['abstract', 'final', 'readonly'].includes(c.peek().v)) mods.add(c.next().v);
  if (!(c.isId() && TYPE_KEYWORDS.has(c.peek().v) && c.isId(1) && !c.peek(1).v.startsWith('$'))) { c.i = start; return null; }
  const keyword = c.next().v;
  const kind = keyword === 'interface' ? 'interface' : keyword === 'enum' ? 'enum' : 'class';
  const decl = newDecl(kind, c.next().v, doc);
  decl.isAbstract = mods.has('abstract');
  decl.isFinal = mods.has('final');
  if (kind === 'enum' && c.eat(':')) parseType(c); // backing type
  while (!c.done && !c.is('{') && !c.is(';')) {
    if (c.eat('extends')) decl.extends.push(...typeList(c));
    else if (c.eat('implements')) decl.implements.push(...typeList(c));
    else c.next();
  }
  if (c.is('{')) body(c, decl);
  else c.eat(';');
  return decl;
}

function typeList(c) {
  const out = [];
  while (!c.done) {
    const type = parseType(c);
    if (!type) break;
    out.push(type);
    if (!c.eat(',')) break;
  }
  return out;
}

const isVariable = (c, k = 0) => c.isId(k) && c.peek(k).v.startsWith('$');

/** A type: "int", "?Order", "\App\Model\Order", "Order|null", "A&B", "(A&B)|null"; '' when none. */
function parseType(c) {
  const from = c.i;
  c.eat('?');
  for (;;) {
    if (c.is('(')) c.skipBalanced();
    else {
      c.eat('\\');
      if (!c.isId() || isVariable(c)) { c.i = from; return ''; }
      c.next();
      while (c.is('\\') && c.isId(1)) { c.next(); c.next(); }
    }
    if (c.is('|')) { c.next(); continue; }
    if (c.is('&') && c.isId(1) && !isVariable(c, 1)) { c.next(); continue; }
    break;
  }
  return c.text(from).replace(/\s+/g, '').replace(/(^|[|&(?])\\/g, '$1');
}

/** Class body: cases, constants, properties, methods; trait "use" lines are skipped. */
function body(c, decl) {
  c.next(); // '{'
  const inInterface = decl.kind === 'interface';
  while (!c.done && !c.is('}')) {
    if (c.eat(';')) continue;
    const start = c.i;
    const first = c.peek();
    const doc = cleanDoc(first.doc ?? '');
    const tags = docTags(rawDoc(c.src, first.s));
    skipAttributes(c);
    if (c.is('use')) { c.next(); c.skipUntil([';', '{']); if (c.is('{')) c.skipBalanced(); else c.eat(';'); continue; }
    if (c.is('case') && decl.kind === 'enum') {
      c.next();
      if (c.isId()) decl.literals.push({ name: c.next().v, doc });
      c.skipUntil([';', '}']);
      c.eat(';');
      continue;
    }
    const mods = new Set();
    while (c.isId() && MEMBER_MODIFIERS.has(c.peek().v)) {
      mods.add(c.next().v);
      if (c.is('(') && c.is('set', 1)) c.skipBalanced(); // asymmetric visibility "private(set)"
    }
    const visibility = visibilityOf(mods);
    if (c.is('const')) {
      c.next();
      const type = c.isId() && c.is('=', 1) ? '' : parseType(c);
      for (;;) {
        if (!c.isId()) break;
        const name = c.next().v;
        let defaultValue = '';
        if (c.eat('=')) { const from = c.i; c.skipUntil([',', ';']); defaultValue = c.text(from); }
        decl.fields.push({ name, type: pickType(type, tags.var, decl.name) || inferType(defaultValue), visibility, isStatic: true, isFinal: true, defaultValue, doc });
        if (!c.eat(',')) break;
      }
      c.eat(';');
      continue;
    }
    if (c.is('function')) { method(c, decl, mods, doc, tags, inInterface); continue; }
    // Properties: "[type] $a [= 1], $b;" (with optional property hooks in braces).
    const type = isVariable(c) ? '' : parseType(c);
    if (!isVariable(c)) { c.i = start; c.next(); c.recover(); continue; }
    for (;;) {
      const name = c.next().v.slice(1);
      let defaultValue = '';
      if (c.eat('=')) { const from = c.i; c.skipUntil([',', ';', '{']); defaultValue = c.text(from); }
      if (c.is('{')) c.skipBalanced(); // property hooks
      const docType = tags.vars[name] ?? tags.var;
      decl.fields.push({
        name, type: pickType(type, docType, decl.name) || inferType(defaultValue), visibility, isStatic: mods.has('static'),
        isFinal: mods.has('readonly'), defaultValue, doc,
      });
      if (c.eat(',') && isVariable(c)) continue;
      break;
    }
    c.eat(';');
  }
  c.eat('}');
}

function method(c, decl, mods, doc, tags, inInterface) {
  c.next(); // 'function'
  c.eat('&');
  if (!c.isId()) { c.recover(); return; }
  const rawName = c.next().v;
  const isConstructor = rawName.toLowerCase() === '__construct';
  const ps = c.is('(') ? params(c, tags, decl.name) : [];
  let returnType = '';
  if (c.eat(':')) returnType = parseType(c);
  if (c.is('{')) c.skipBalanced(); else c.eat(';');
  for (const p of ps) {
    if (!isConstructor || !p.promoted) continue;
    decl.fields.push({ name: p.name, type: p.type, visibility: p.promoted.visibility, isStatic: false, isFinal: p.promoted.readOnly, defaultValue: p.defaultValue, doc: '' });
  }
  returnType = isConstructor ? '' : pickType(returnType, tags.return, decl.name);
  decl.methods.push({
    name: isConstructor ? decl.name : rawName, visibility: visibilityOf(mods), isStatic: mods.has('static'), isAbstract: mods.has('abstract') || inInterface,
    isFinal: mods.has('final'), params: ps.map(({ promoted, ...p }) => p), returnType: ['void', 'never'].includes(returnType) ? '' : returnType, doc,
    templateParams: [], isConstructor, throws: tags.throws,
  });
}

/** Parameter list at '(' → [{ name, type, defaultValue, direction, promoted }]. */
function params(c, tags, self) {
  const open = c.i;
  c.skipBalanced();
  const out = [];
  for (const [a, b] of splitTop(c.toks, open + 1, c.i - 1, { angles: false })) {
    const p = new Cursor(c.toks.slice(a, b), c.src);
    skipAttributes(p);
    const mods = new Set();
    while (p.isId() && PROMOTION_MODIFIERS.has(p.peek().v)) {
      mods.add(p.next().v);
      if (p.is('(') && p.is('set', 1)) p.skipBalanced();
    }
    const type = isVariable(p) || p.is('&') || p.is('...') ? '' : parseType(p);
    const byRef = p.eat('&');
    const many = p.eat('...');
    if (!isVariable(p)) continue;
    const name = p.next().v.slice(1);
    const defaultValue = p.eat('=') ? p.text(p.i, p.toks.length) : '';
    let finalType = pickType(type, tags.params[name], self);
    if (many) finalType = `${finalType || 'mixed'}...`;
    out.push({ name, type: finalType, defaultValue, direction: byRef ? 'inout' : 'in', promoted: mods.size ? { visibility: visibilityOf(mods), readOnly: mods.has('readonly') } : null });
  }
  return out;
}

/** The native type, or the PHPDoc type when the native one says little; self / static → the class. */
function pickType(native, docType, self) {
  const own = (t) => String(t ?? '').split('|').map((part) => {
    const optional = part.startsWith('?') ? '?' : '';
    const bare = part.slice(optional.length).replace(/^\\/, '');
    return optional + (['self', 'static', '$this'].includes(bare) ? self : bare);
  }).join('|');
  const n = own(native);
  const d = docType ? own(docType) : '';
  if (d && (WEAK_TYPES.has(n) || d.startsWith(`${n.replace(/^\?/, '')}<`))) return n.startsWith('?') && !/\|null|null\|/.test(d) ? `${d}|null` : d;
  return n;
}

function inferType(value) {
  const v = String(value ?? '').trim();
  if (!v) return '';
  if (/^-?\d[\d_]*$/.test(v) || /^0x[\da-f]+$/i.test(v)) return 'int';
  if (/^-?\d[\d_]*\.\d*([eE][+-]?\d+)?$/.test(v)) return 'float';
  if (/^['"]/.test(v)) return 'string';
  if (/^(true|false)$/i.test(v)) return 'bool';
  if (/^(\[|array\s*\()/i.test(v)) return 'array';
  const created = /^new\s+\\?([\w\\]+)/.exec(v);
  if (created) return created[1].split('\\').pop();
  return '';
}

/** The raw text of the /** … *\/ comment right before offset `pos`, or ''. */
function rawDoc(src, pos) {
  let j = pos - 1;
  while (j >= 0 && /\s/.test(src[j])) j -= 1;
  if (j < 1 || src[j] !== '/' || src[j - 1] !== '*') return '';
  const open = src.lastIndexOf('/**', j - 1);
  if (open < 0) return '';
  const text = src.slice(open + 3, j - 1);
  return text.includes('*/') ? '' : text;
}

/** "@var Item[] $x", "@param array<int, Item> $items", "@return static", "@throws E" → types. */
function docTags(raw) {
  const tags = { var: '', vars: {}, params: {}, return: '', throws: [] };
  if (!raw) return tags;
  const text = raw.split(/\r?\n/).map((l) => l.replace(/^\s*\*\s?/, '')).join('\n');
  const re = /@(var|param|return|throws|phpstan-var|psalm-var|phpstan-param|psalm-param|phpstan-return|psalm-return)\s+/g;
  let m;
  while ((m = re.exec(text))) {
    const [type, rest] = readDocType(text.slice(m.index + m[0].length));
    if (!type) continue;
    const tag = m[1].replace(/^(phpstan|psalm)-/, '');
    const variable = /^\s*(?:&\s*)?(?:\.\.\.)?\$(\w+)/.exec(rest)?.[1];
    if (tag === 'var') { if (variable) tags.vars[variable] = type; else tags.var = type; } else if (tag === 'param') { if (variable) tags.params[variable] = type; } else if (tag === 'return') tags.return = type;
    else tags.throws.push(...type.split('|').map((t) => t.replace(/^\\/, '')));
  }
  return tags;
}

/** A PHPDoc type at the start of `text` (generics, shapes and unions kept together) → [type, rest]. */
function readDocType(text) {
  let depth = 0;
  let k = 0;
  for (; k < text.length; k += 1) {
    const ch = text[k];
    if ('<({['.includes(ch)) depth += 1;
    else if ('>)}]'.includes(ch)) depth -= 1;
    else if (/\s/.test(ch) && depth <= 0) {
      // "array<int, Item>" may contain spaces; "Item | null" too.
      const after = text.slice(k).trimStart();
      if (/^[|&]/.test(after) || /[|&]$/.test(text.slice(0, k))) { continue; }
      break;
    }
  }
  return [text.slice(0, k).replace(/\s+/g, '').replace(/,/g, ', '), text.slice(k)];
}

/** A PHPDoc description without inline tags on its last line ("Lines. @var Item[]"). */
function cleanDoc(doc) {
  return String(doc).replace(/(^|\s)@[a-z][\s\S]*$/i, '').trim();
}
