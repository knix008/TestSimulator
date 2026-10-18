// C++ reverse engineering: a tolerant parser for headers and sources (.h,
// .hpp, .hh, .hxx, .cpp, .cc, .cxx). It reads namespaces (nested and
// "a::b"), #include lines, template<…> heads, classes, structs, unions and
// enums (enum class too), base lists with their access, the public: /
// protected: / private: sections, fields (static, const/constexpr → read-only,
// default values with = or {}), methods (virtual, pure virtual "= 0" →
// abstract, static, const, parameters with default values, return types),
// constructors (destructors, operators and friends are skipped), and /** */ or
// /// doc comments. A class with only pure virtual methods and no fields becomes
// an interface (StarUML's C++ importer does the same). Method bodies written
// outside the class ("void A::f() { … }") are ignored. Returns the neutral
// description used by reverse/index.js; base lists go into `bases`.
import { Cursor, newDecl, normType, splitTop, tokenize } from './java.js';

const SKIPPED = { skipped: true };
const TYPE_KEYWORDS = new Set(['class', 'struct', 'union', 'enum']);
const SPECIFIERS = new Set(['virtual', 'static', 'inline', 'explicit', 'constexpr', 'consteval', 'constinit', 'mutable', 'extern', 'volatile', 'register', 'thread_local', 'friend', 'typename']);
const ACCESS = new Set(['public', 'protected', 'private']);

/** Preprocessor lines are blanked (same length, so token positions stay), #include targets kept. */
function preprocess(src) {
  const includes = [];
  const text = src.replace(/^[ \t]*#(?:[^\n\\]|\\[\s\S])*$/gm, (line) => {
    const m = /#\s*include\s*[<"]([^>"]+)[>"]/.exec(line);
    if (m) includes.push(m[1]);
    return line.replace(/[^\n]/g, ' ');
  });
  return { text, includes };
}

export function parse(src) {
  const { text, includes } = preprocess(String(src ?? ''));
  const c = new Cursor(tokenize(text, { tripleSlashDoc: true }), text);
  const out = [];
  scope(c, [], out, true);
  if (!out.length) return { package: [], imports: includes, types: [] };
  const first = out[0].ns.join('::');
  if (out.every((g) => g.ns.join('::') === first)) return { package: out[0].ns, imports: includes, types: out.map((g) => g.decl) };
  return { package: [], imports: includes, types: out.map((g) => ({ ...g.decl, package: g.ns })) };
}

/** A namespace body (or the file): nested namespaces, templates, type declarations; everything else is skipped. */
function scope(c, ns, out, top) {
  while (!c.done) {
    if (c.is('}')) { if (top) { c.next(); continue; } return; }
    if (c.is('namespace')) {
      c.next();
      const names = [];
      while (c.isId() || c.is('::')) { const t = c.next(); if (t.t === 'id' && t.v !== 'inline') names.push(t.v); }
      if (c.is('=')) { c.recover(); continue; } // namespace alias
      if (!c.eat('{')) { c.recover(); continue; }
      scope(c, [...ns, ...names], out, false);
      c.eat('}');
      continue;
    }
    if (c.is('extern') && c.peek(1)?.t === 'str') { // extern "C" { … }
      c.next(); c.next();
      if (c.eat('{')) { scope(c, ns, out, false); c.eat('}'); }
      continue;
    }
    if (c.is('using') || c.is('typedef') || c.is('static_assert')) { c.recover(); continue; }
    const decl = declaration(c, 'public');
    if (decl === SKIPPED) continue;
    if (decl) { out.push({ ns, decl }); continue; }
    // A function, variable or out-of-class definition: skipped.
    skipStatement(c);
  }
}

/** Up to the end of a statement: ';' or a block (with an optional ';' after it). */
function skipStatement(c) {
  while (!c.done) {
    if (c.is(';')) { c.next(); return; }
    if (c.is('}')) return;
    if (c.is('{')) { c.skipBalanced(); c.eat(';'); return; }
    if (c.is('(') || c.is('[')) c.skipBalanced(); else c.next();
  }
}

/** "template <typename T, class U = int, int N>" → [{ name, bound }]. */
function templateHead(c) {
  if (!c.is('template')) return null;
  c.next();
  if (!c.is('<')) return [];
  const open = c.i;
  c.skipBalanced();
  const out = [];
  for (const [a, b] of splitTop(c.toks, open + 1, c.i - 1)) {
    const toks = c.toks.slice(a, b);
    const eq = toks.findIndex((t) => t.v === '=');
    const head = eq >= 0 ? toks.slice(0, eq) : toks;
    const name = [...head].reverse().find((t) => t.t === 'id' && !['typename', 'class', 'auto'].includes(t.v))?.v;
    if (!name) continue;
    const kind = head[0]?.v;
    out.push({ name, bound: kind === 'typename' || kind === 'class' ? '' : head.slice(0, -1).map((t) => t.v).join(' ') });
  }
  return out;
}

/** class / struct / union / enum declaration with a body; SKIPPED for a forward declaration; null when it is not one. */
function declaration(c, fallbackVisibility) {
  const start = c.i;
  const doc = c.peek()?.doc ?? '';
  const tparams = templateHead(c);
  if (c.is('alignas')) { c.next(); c.skipBalanced(); }
  if (!(c.isId() && TYPE_KEYWORDS.has(c.peek().v))) {
    if (tparams) { skipStatement(c); return SKIPPED; } // a template function
    c.i = start;
    return null;
  }
  const keyword = c.next().v;
  if (keyword === 'enum' && (c.is('class') || c.is('struct'))) c.next();
  while (c.is('[')) c.skipBalanced(); // [[attributes]]
  if (!c.isId()) { c.i = start; return null; } // anonymous: not a type of its own
  let name = c.next().v;
  while (c.is('::') && c.isId(1)) { c.next(); name = c.next().v; }
  if (c.is('<')) c.skipBalanced(); // a specialisation "class A<int>"
  const decl = newDecl(keyword === 'enum' ? 'enum' : 'class', name, doc);
  decl.visibility = fallbackVisibility;
  decl.templateParams = tparams ?? [];
  if (c.is('final')) { c.next(); decl.isFinal = true; }
  if (keyword === 'enum' && c.eat(':')) { while (!c.done && !c.is('{') && !c.is(';')) c.next(); }
  if (keyword !== 'enum' && c.eat(':')) {
    const from = c.i;
    while (!c.done && !c.is('{') && !c.is(';')) { if (c.is('<') || c.is('(')) c.skipBalanced(); else c.next(); }
    for (const [a, b] of splitTop(c.toks, from, c.i)) {
      const parts = c.toks.slice(a, b).filter((t) => !['public', 'protected', 'private', 'virtual'].includes(t.v));
      const text = normType(parts.map((t) => t.v).join(' ').replace(/\s*::\s*/g, '::')).replace(/^::/, '');
      if (text) decl.bases.push(text);
    }
  }
  if (!c.is('{')) { skipStatement(c); return SKIPPED; } // forward declaration
  if (keyword === 'enum') enumBody(c, decl); else body(c, decl, keyword === 'class' ? 'private' : 'public');
  // "} name;" declares a variable of the type too: skipped.
  while (!c.done && !c.is(';') && !c.is('}')) c.next();
  c.eat(';');
  // Only pure virtual methods and no fields: an interface.
  if (decl.kind === 'class' && decl.methods.length && !decl.fields.length && decl.methods.every((m) => m.isAbstract || m.isConstructor) && decl.methods.some((m) => m.isAbstract)) {
    decl.kind = 'interface';
    decl.methods = decl.methods.filter((m) => !m.isConstructor);
  }
  if (decl.methods.some((m) => m.isAbstract) && decl.kind === 'class') decl.isAbstract = true;
  return decl;
}

function enumBody(c, decl) {
  c.next(); // '{'
  while (!c.done && !c.is('}')) {
    const doc = c.peek()?.doc ?? '';
    if (!c.isId()) { c.next(); continue; }
    decl.literals.push({ name: c.next().v, doc });
    while (c.is('[')) c.skipBalanced();
    if (c.eat('=')) c.skipUntil([',', '}']);
    c.eat(',');
  }
  c.eat('}');
}

/** "Type name", "const Type* name", "Type (&name)[3]" … from tokens [a, b): { type, name }. */
function typeAndName(c, a, b) {
  const toks = c.toks;
  let end = b;
  // Array suffix "name[10]".
  let suffix = '';
  if (toks[end - 1]?.v === ']') {
    let j = end - 1;
    while (j > a && toks[j].v !== '[') j -= 1;
    suffix = '[]';
    end = j;
  }
  const nameTok = toks[end - 1];
  if (!nameTok || nameTok.t !== 'id' || end - 1 <= a) return null;
  const type = normType(c.text(a, end - 1)).replace(/\s*([*&]+)/g, '$1').replace(/\s*::\s*/g, '::');
  return { name: nameTok.v, type: `${type}${suffix}` };
}

function params(c) {
  const open = c.i;
  c.skipBalanced();
  const out = [];
  const toks = c.toks;
  for (const [a, b] of splitTop(toks, open + 1, c.i - 1)) {
    if (b - a === 1 && toks[a].v === 'void') continue;
    if (toks[a]?.v === '...') continue;
    const eq = toks.slice(a, b).findIndex((t) => t.v === '=');
    const end = eq >= 0 ? a + eq : b;
    const named = typeAndName(c, a, end);
    // An unnamed parameter "int" or "const Foo&": the type alone.
    const type = named ? named.type : normType(c.text(a, end));
    const name = named ? named.name : '';
    const isRef = /&$/.test(type) && !/^const\b/.test(type);
    out.push({ name, type, defaultValue: eq >= 0 ? c.text(end + 1, b) : '', direction: isRef ? 'inout' : 'in' });
  }
  return out;
}

/** A class body with access sections. */
function body(c, decl, defaultVisibility) {
  c.next(); // '{'
  let visibility = defaultVisibility;
  while (!c.done && !c.is('}')) {
    if (c.eat(';')) continue;
    if (c.isId() && ACCESS.has(c.peek().v) && c.is(':', 1)) { visibility = c.next().v; c.next(); continue; }
    if (c.is('using') || c.is('typedef') || c.is('static_assert') || c.is('friend')) { skipStatement(c); continue; }
    const start = c.i;
    const doc = c.peek()?.doc ?? '';
    const nested = declaration(c, visibility);
    if (nested === SKIPPED) continue;
    if (nested) { decl.nested.push(nested); continue; }
    c.i = start;
    if (c.is('template')) { templateHead(c); }
    member(c, decl, visibility, doc);
  }
  c.eat('}');
}

/** One member: a method, a constructor, or fields. */
function member(c, decl, visibility, doc) {
  const start = c.i;
  const specs = new Set();
  while (c.isId() && SPECIFIERS.has(c.peek().v)) specs.add(c.next().v);
  while (c.is('[')) c.skipBalanced(); // [[nodiscard]]
  // Destructor and operators are not modelled.
  if (c.is('~')) { skipMember(c); return; }
  // Constructor: "Name(" (possibly "explicit Name(").
  if (c.isId() && c.peek().v === decl.name && c.is('(', 1)) {
    c.next();
    const ps = params(c);
    skipMember(c);
    decl.methods.push({ name: decl.name, visibility, isStatic: false, isAbstract: false, isFinal: false, params: ps, returnType: '', doc, templateParams: [], isConstructor: true, throws: [] });
    return;
  }
  // Up to the end of the declaration head: '(' starts a method, ';' / '=' / '{' / ',' end fields.
  const from = c.i;
  let paren = -1;
  while (!c.done && !c.is(';') && !c.is('}')) {
    if (c.is('operator')) { c.i = start; skipMember(c); return; }
    if (c.is('<')) { const end = c.angleEnd(); if (end > 0) { c.i = end; continue; } }
    if (c.is('(')) { paren = c.i; break; }
    if (c.is('=') || c.is('{') || c.is(',') || c.is(':')) break;
    if (c.is('[')) { c.skipBalanced(); continue; }
    c.next();
  }
  if (paren >= 0) {
    const head = typeAndName(c, from, paren);
    if (!head) { c.i = start; skipMember(c); return; }
    c.i = paren;
    const ps = params(c);
    // Trailing: const, noexcept(…), override, final, -> ret, = 0 / = default / = delete, body or ';'.
    let isAbstract = false;
    let isFinal = false;
    let returnType = head.type;
    while (!c.done && !c.is(';') && !c.is('{') && !c.is('}')) {
      if (c.is('=') && c.peek(1)?.v === '0') { isAbstract = true; c.next(); c.next(); continue; }
      if (c.is('final')) isFinal = true;
      if (c.is('->')) { c.next(); const f = c.i; while (!c.done && !c.is(';') && !c.is('{') && !c.is('override') && !c.is('final') && !c.is('=')) { if (c.is('<')) c.skipBalanced(); else c.next(); } returnType = normType(c.text(f)); continue; }
      if (c.is('(')) { c.skipBalanced(); continue; }
      c.next();
    }
    if (c.is('{')) c.skipBalanced(); else c.eat(';');
    if (/^(auto|void)$/.test(returnType)) returnType = returnType === 'void' ? '' : returnType;
    decl.methods.push({ name: head.name, visibility, isStatic: specs.has('static'), isAbstract, isFinal, params: ps, returnType: returnType.replace(/^(virtual|static|inline)\s+/, ''), doc, templateParams: [], isConstructor: false, throws: [] });
    return;
  }
  // Fields: "int a = 1, b{2};" (a bit-field "int flags : 3;" too).
  let first = typeAndName(c, from, c.i);
  if (!first) { c.i = start; skipMember(c); return; }
  const baseType = first.type;
  const isFinal = /^(const|constexpr)\b/.test(baseType) || specs.has('constexpr');
  const isStatic = specs.has('static');
  for (;;) {
    let defaultValue = '';
    if (c.eat(':')) c.skipUntil([',', ';', '=', '{']); // bit-field width
    if (c.is('=')) { c.next(); const f = c.i; c.skipUntil([',', ';']); defaultValue = c.text(f); } else if (c.is('{')) { const f = c.i; c.skipBalanced(); defaultValue = c.text(f + 1, c.i - 1); }
    decl.fields.push({ name: first.name, type: first.type.replace(/^(const|constexpr|mutable)\s+/, ''), visibility, isStatic, isFinal, defaultValue, doc });
    if (!c.eat(',')) break;
    // Next declarator: pointer marks belong to it ("int a, *b;").
    const f = c.i;
    while (!c.done && !c.is(',') && !c.is(';') && !c.is('=') && !c.is('{') && !c.is('[')) c.next();
    const marks = c.toks.slice(f, c.i - 1).map((t) => t.v).join('');
    const nameTok = c.toks[c.i - 1];
    if (!nameTok || nameTok.t !== 'id') break;
    first = { name: nameTok.v, type: `${baseType.replace(/[*&]+$/, '')}${marks}` };
    if (c.is('[')) { c.skipBalanced(); first.type += '[]'; }
  }
  if (!c.eat(';')) skipMember(c);
}

/** Skips a member that is not modelled: up to ';' or past its body. */
function skipMember(c) {
  while (!c.done) {
    if (c.is(';')) { c.next(); return; }
    if (c.is('}')) return;
    if (c.is('{')) { c.skipBalanced(); c.eat(';'); return; }
    if (c.is('(') || c.is('[')) c.skipBalanced(); else c.next();
  }
}
