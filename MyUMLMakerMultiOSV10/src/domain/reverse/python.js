// Python reverse engineering: a tolerant line-based parser. The source is cut
// into logical lines (brackets and backslashes join lines, comments are
// dropped, strings kept), then indentation decides what belongs to a class.
// Extracted: classes (bases, Generic[T] → template parameters, ABC / Protocol
// → abstract classes or interfaces, Enum subclasses → enumerations with their
// literals), docstrings, class attributes (annotated ones are instance fields,
// as in dataclasses; plain assignments are static), instance attributes set
// on self in __init__ (type from the annotation, the parameter's annotation
// or the literal), methods with parameters / defaults / return annotations,
// @staticmethod / @classmethod / @abstractmethod, @property (an attribute).
// Leading underscores give the visibility (_x protected, __x private) and are
// removed from the name. Returns the description used by reverse/index.js.
import { newDecl } from './java.js';

const ENUM_BASES = new Set(['Enum', 'IntEnum', 'StrEnum', 'Flag', 'IntFlag']);
const SKIP_BASES = new Set(['object', 'ABC', 'Protocol', 'Generic', 'NamedTuple', 'TypedDict', ...ENUM_BASES]);

/** Logical lines: [{ indent, text, line }]. */
export function logicalLines(src) {
  const out = [];
  const n = src.length;
  let i = 0;
  let line = 1;
  let text = '';
  let indent = -1;
  let depth = 0;
  let startLine = 1;
  const flush = () => {
    if (text.trim()) out.push({ indent: Math.max(0, indent), text: text.trim(), line: startLine });
    text = '';
    indent = -1;
  };
  while (i < n) {
    const ch = src[i];
    if (indent < 0) { // start of a logical line: measure indentation
      let width = 0;
      while (i < n && (src[i] === ' ' || src[i] === '\t')) { width += src[i] === '\t' ? 8 - (width % 8) : 1; i += 1; }
      if (src[i] === '\n' || src[i] === '\r' || src[i] === '#' || i >= n) { // blank or comment-only line
        while (i < n && src[i] !== '\n') i += 1;
        i += 1;
        line += 1;
        continue;
      }
      indent = width;
      startLine = line;
      continue;
    }
    if (ch === '#') { while (i < n && src[i] !== '\n') i += 1; continue; }
    if (ch === '\\' && (src[i + 1] === '\n' || (src[i + 1] === '\r' && src[i + 2] === '\n'))) { i += src[i + 1] === '\r' ? 3 : 2; line += 1; text += ' '; continue; }
    if (ch === '\n') {
      line += 1;
      i += 1;
      if (depth > 0) { text += ' '; continue; }
      flush();
      continue;
    }
    if (ch === '\r') { i += 1; continue; }
    if (ch === '"' || ch === "'") {
      const triple = src.startsWith(ch.repeat(3), i);
      const quote = triple ? ch.repeat(3) : ch;
      let j = i + quote.length;
      while (j < n) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src.startsWith(quote, j)) { j += quote.length; break; }
        if (!triple && src[j] === '\n') break;
        j += 1;
      }
      const literal = src.slice(i, j);
      line += (literal.match(/\n/g) ?? []).length;
      text += literal;
      i = j;
      continue;
    }
    if ('([{'.includes(ch)) depth += 1;
    else if (')]}'.includes(ch)) depth = Math.max(0, depth - 1);
    text += ch;
    i += 1;
  }
  flush();
  return out;
}

/** Splits at top-level commas (brackets and strings respected). */
export function splitTopLevel(text, sep = ',') {
  const out = [];
  let depth = 0;
  let start = 0;
  let quote = null;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) { if (ch === '\\') i += 1; else if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'") quote = ch;
    else if ('([{'.includes(ch)) depth += 1;
    else if (')]}'.includes(ch)) depth -= 1;
    else if (ch === sep && depth === 0) { out.push(text.slice(start, i).trim()); start = i + 1; }
  }
  out.push(text.slice(start).trim());
  return out.filter((s) => s !== '');
}

/** Index of the first top-level occurrence of `ch` (outside brackets and strings). */
function topIndex(text, ch, from = 0) {
  let depth = 0;
  let quote = null;
  for (let i = from; i < text.length; i += 1) {
    const c = text[i];
    if (quote) { if (c === '\\') i += 1; else if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'") quote = c;
    else if ('([{'.includes(c)) depth += 1;
    else if (')]}'.includes(c)) depth -= 1;
    else if (c === ch && depth === 0) return i;
  }
  return -1;
}

const stringValue = (text) => {
  const m = /^[rRbBuUfF]{0,2}("""|'''|"|')([\s\S]*)\1$/.exec(text.trim());
  return m ? m[2] : null;
};
const cleanDoc = (text) => {
  const lines = text.replace(/\r/g, '').split('\n');
  const rest = lines.slice(1).filter((l) => l.trim());
  const pad = rest.length ? Math.min(...rest.map((l) => l.match(/^\s*/)[0].length)) : 0;
  return [lines[0].trim(), ...lines.slice(1).map((l) => l.slice(pad).trimEnd())].join('\n').trim();
};

/** "__x" → ['x', 'private'], "_x" → ['x', 'protected'], dunders stay public. */
function visibility(name) {
  if (/^__.*__$/.test(name)) return [name, 'public'];
  if (name.startsWith('__')) return [name.slice(2), 'private'];
  if (name.startsWith('_')) return [name.slice(1), 'protected'];
  return [name, 'public'];
}

const literalType = (value) => {
  const v = value.trim();
  if (/^-?\d+$/.test(v)) return 'int';
  if (/^-?\d*\.\d+([eE][-+]?\d+)?$/.test(v)) return 'float';
  if (/^(True|False)$/.test(v)) return 'bool';
  if (stringValue(v) !== null) return 'str';
  const call = /^([A-Z][\w.]*)\s*\(/.exec(v);
  if (call) return call[1];
  return '';
};

function parseParams(text) {
  const out = [];
  for (const part of splitTopLevel(text)) {
    if (part === '*' || part === '/') continue;
    const eq = topIndex(part, '=');
    const head = eq >= 0 ? part.slice(0, eq).trim() : part;
    const defaultValue = eq >= 0 ? part.slice(eq + 1).trim() : '';
    const colon = topIndex(head, ':');
    let name = (colon >= 0 ? head.slice(0, colon) : head).trim();
    let type = colon >= 0 ? head.slice(colon + 1).trim() : '';
    let multiplicity;
    if (name.startsWith('**')) { name = name.slice(2); type = type ? `dict[str, ${type}]` : 'dict'; } else if (name.startsWith('*')) { name = name.slice(1); multiplicity = '*'; }
    out.push({ name, type, defaultValue, direction: 'in', ...(multiplicity ? { multiplicity } : {}) });
  }
  return out;
}

export function parse(src) {
  const lines = logicalLines(src);
  const types = [];
  const stack = []; // { indent, kind: 'class'|'def', decl?, method?, cls?, isInit, first }
  let decorators = [];
  for (let k = 0; k < lines.length; k += 1) {
    const { indent } = lines[k];
    let { text } = lines[k];
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    const top = stack[stack.length - 1] ?? null;
    if (text.startsWith('@')) { decorators.push(text.slice(1).trim()); continue; }
    const decos = decorators;
    decorators = [];

    let m = /^class\s+([A-Za-z_]\w*)\s*(?:\[([^\]]*)\])?\s*(?:\((.*)\))?\s*:(.*)$/s.exec(text);
    if (m) {
      const decl = newDecl('class', m[1]);
      classHeader(decl, m[3] ?? '', m[2] ?? '', decos);
      if (!top) types.push(decl);
      else if (top.kind === 'class') { top.first = false; top.decl.nested.push(decl); }
      stack.push({ indent, kind: 'class', decl, first: true }); // a one-line body after ':' is ignored
      continue;
    }
    m = /^(?:async\s+)?def\s+([A-Za-z_]\w*)\s*(?:\[[^\]]*\])?\s*\((.*)\)\s*(?:->\s*(.+?))?\s*:(.*)$/s.exec(text);
    if (m) {
      const frame = { indent, kind: 'def', first: true, isInit: false };
      if (top && top.kind === 'class') {
        top.first = false;
        frame.cls = top.decl;
        frame.isInit = m[1] === '__init__';
        method(top.decl, m[1], m[2], m[3] ?? '', decos, frame);
      }
      stack.push(frame);
      continue;
    }
    if (!top) continue;

    // Docstrings.
    const str = stringValue(text);
    if (top.first && str !== null) {
      top.first = false;
      if (top.kind === 'class') top.decl.doc = cleanDoc(str);
      else if (top.method) top.method.doc = cleanDoc(str);
      continue;
    }
    top.first = false;

    if (top.kind === 'class') classStatement(top.decl, text);
    else if (top.kind === 'def' && top.isInit && top.cls && indent > top.indent) selfAssignment(top, text);
  }
  for (const decl of allDecls(types)) finish(decl);
  return { package: [], imports: [], types };
}

function* allDecls(list) {
  for (const decl of list) { yield decl; yield* allDecls(decl.nested); }
}

function classHeader(decl, basesText, pep695, decos) {
  const bases = splitTopLevel(basesText).filter((b) => !/^\w+\s*=/.test(b)); // metaclass=…, total=…
  const names = bases.map((b) => b.replace(/\[.*$/s, '').trim());
  const last = (n) => n.split('.').pop();
  decl.pyBases = names.map(last);
  if (names.some((n) => ENUM_BASES.has(last(n)))) decl.kind = 'enum';
  if (names.some((n) => last(n) === 'Protocol')) decl.pyProtocol = true;
  if (names.some((n) => last(n) === 'ABC') || /metaclass\s*=\s*(abc\.)?ABCMeta/.test(basesText)) decl.pyABC = true;
  const generic = bases.find((b) => /^(typing\.)?(Generic|Protocol)\[/.test(b));
  const tparams = [...(pep695 ? splitTopLevel(pep695) : []), ...(generic ? splitTopLevel(generic.slice(generic.indexOf('[') + 1, generic.lastIndexOf(']'))) : [])];
  for (const t of tparams) {
    const [name, bound] = t.split(':').map((s) => s.trim());
    if (/^\w+$/.test(name) && !decl.templateParams.some((x) => x.name === name)) decl.templateParams.push({ name, bound: bound ?? '' });
  }
  decl.bases = bases.filter((b, i) => !SKIP_BASES.has(last(names[i])) && !/^(typing\.)?(Generic|Protocol)\[/.test(b)).map((b) => b.trim());
  decl.isDataclass = decos.some((d) => /^(dataclasses\.)?dataclass\b/.test(d));
}

function method(decl, rawName, paramText, returnType, decos, frame) {
  const deco = (name) => decos.some((d) => d === name || d.endsWith(`.${name}`) || d.startsWith(`${name}(`));
  const params = parseParams(paramText);
  const isStatic = deco('staticmethod') || deco('classmethod');
  if (!deco('staticmethod') && params.length && (params[0].name === 'self' || params[0].name === 'cls' || deco('classmethod'))) params.shift();
  if (decos.some((d) => /\.(setter|deleter)$/.test(d))) {
    const field = decl.fields.find((f) => f.rawName === rawName);
    if (field) field.isFinal = false;
    return;
  }
  const [name, vis] = visibility(rawName);
  if (deco('property') || deco('cached_property')) {
    decl.fields.push({ rawName, name, type: returnType.trim(), visibility: vis, isStatic: false, isFinal: true, defaultValue: '', doc: '', property: true });
    return;
  }
  const isInit = rawName === '__init__';
  const m = {
    name: isInit ? decl.name : name, visibility: isInit ? 'public' : vis, isStatic, isAbstract: deco('abstractmethod'), isFinal: deco('final'),
    params, returnType: isInit ? '' : returnType.trim().replace(/^None$/, ''), doc: '', templateParams: [], isConstructor: isInit, throws: [],
  };
  frame.method = m;
  frame.params = params;
  if (isInit && !params.length) return; // a plain __init__ only sets fields
  decl.methods.push(m);
}

/** "x: int = 1", "x = 1", "x: int" in a class body. */
function classStatement(decl, text) {
  const eq = topIndex(text, '=');
  if (eq >= 0 && /[=!<>+\-*/%&|^@:]/.test(text[eq - 1] ?? '') && text[eq - 1] !== ':') return;
  if (eq >= 0 && text[eq + 1] === '=') return;
  const head = eq >= 0 ? text.slice(0, eq).trim() : text.trim();
  const value = eq >= 0 ? text.slice(eq + 1).trim() : '';
  const colon = topIndex(head, ':');
  const target = (colon >= 0 ? head.slice(0, colon) : head).trim();
  if (!/^[A-Za-z_]\w*$/.test(target)) return;
  if (colon < 0 && eq < 0) return; // a bare expression
  if (/^__\w+__$/.test(target)) return;
  let type = colon >= 0 ? head.slice(colon + 1).trim() : '';
  if (decl.kind === 'enum') { decl.literals.push({ name: target, doc: '' }); return; }
  const classVar = /^(typing\.)?ClassVar\[(.*)\]$/.exec(type);
  if (classVar) type = classVar[2];
  const [name, vis] = visibility(target);
  const isStatic = Boolean(classVar) || colon < 0;
  const existing = decl.fields.find((f) => f.rawName === target);
  if (existing) return;
  decl.fields.push({ rawName: target, name, type: type || (value ? literalType(value) : ''), visibility: vis, isStatic, isFinal: /^(typing\.)?Final\b/.test(type), defaultValue: value.replace(/^field\(.*\)$/, ''), doc: '' });
}

/** "self.x: int = value" in __init__. */
function selfAssignment(frame, text) {
  const m = /^self\.([A-Za-z_]\w*)\s*(?::\s*([^=]+?))?\s*=(?!=)\s*(.*)$/s.exec(text);
  if (!m) return;
  const decl = frame.cls;
  const [name, vis] = visibility(m[1]);
  if (decl.fields.some((f) => f.rawName === m[1])) return;
  let type = (m[2] ?? '').trim();
  const value = m[3].trim();
  const param = (frame.params ?? []).find((p) => p.name === value);
  if (!type && param) type = param.type + (param.multiplicity === '*' ? '[]' : '');
  if (!type) type = literalType(value);
  decl.fields.push({ rawName: m[1], name, type, visibility: vis, isStatic: false, isFinal: false, defaultValue: param || value === 'None' || (value === '[]' && type) ? '' : value, doc: '' });
}

/** Interface / abstract decisions once the whole class is known. */
function finish(decl) {
  if (decl.kind === 'enum') { decl.fields = []; return; }
  const abstractMethods = decl.methods.filter((m) => m.isAbstract);
  if (decl.pyProtocol || (decl.pyABC && decl.methods.length && abstractMethods.length === decl.methods.length && !decl.fields.length)) {
    decl.kind = 'interface';
    decl.methods.forEach((m) => { m.isAbstract = true; });
  } else if (decl.pyABC || abstractMethods.length) decl.isAbstract = true;
  for (const f of decl.fields) delete f.rawName;
  delete decl.pyBases; delete decl.pyProtocol; delete decl.pyABC; delete decl.isDataclass;
}
