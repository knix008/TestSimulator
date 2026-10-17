// C# reverse engineering: a tolerant parser for .cs sources (block and
// file-scoped namespaces, using lines, [attributes], classes, structs,
// records, interfaces, enums, generics with where-constraints, base lists,
// fields, properties (attributes; get-only → read-only), events, methods with
// ref/out/params parameters and default values, constructors, /// doc
// comments). Returns the neutral description used by reverse/index.js; base
// lists go into `bases` (the builder tells classes from interfaces).
import { Cursor, newDecl, normType, splitTop, tokenize, typeParams } from './java.js';

const MODIFIERS = new Set(['public', 'protected', 'private', 'internal', 'static', 'abstract', 'sealed', 'virtual', 'override', 'readonly', 'const', 'partial', 'new', 'async', 'extern', 'unsafe', 'volatile', 'fixed', 'required', 'file', 'implicit', 'explicit']);
const SKIPPED = { skipped: true };
const TYPE_KEYWORDS = new Set(['class', 'struct', 'interface', 'enum', 'record']);

export function parse(src) {
  const c = new Cursor(tokenize(src, { tripleSlashDoc: true, verbatimIds: true }), src);
  const file = { imports: [] };
  const out = [];
  scope(c, [], file, out, true);
  return regroup(out, file.imports);
}

/** Types under different namespaces in one file: the first namespace is the file's, others are kept by name. */
function regroup(groups, imports) {
  if (!groups.length) return { package: [], imports, types: [] };
  const first = groups[0].ns;
  if (groups.every((g) => g.ns.join('.') === first.join('.'))) return { package: first, imports, types: groups.map((g) => g.decl) };
  // Mixed namespaces: types are given with a package of their own.
  return { package: [], imports, types: groups.map((g) => ({ ...g.decl, package: g.ns })) };
}

/** Namespace body (or file): usings, nested namespaces, type declarations. */
function scope(c, ns, file, out, top) {
  let current = ns;
  while (!c.done) {
    if (c.is('}')) { if (top) { c.next(); continue; } return; }
    if (c.is('global') && c.is('using', 1)) c.next();
    if (c.is('using') && !c.is('(', 1)) {
      c.next();
      c.eat('static');
      const from = c.i;
      c.skipUntil([';']);
      const text = c.text(from).replace(/\s/g, '');
      file.imports.push(text.includes('=') ? text.split('=').pop() : text);
      c.eat(';');
      continue;
    }
    if (c.is('namespace')) {
      c.next();
      const from = c.i;
      while (!c.done && !c.is('{') && !c.is(';')) c.next();
      const name = c.text(from).replace(/\s/g, '').split('.').filter(Boolean);
      if (c.eat(';')) { current = [...ns, ...name]; continue; }
      c.next(); // '{'
      scope(c, [...current, ...name], file, out, false);
      c.eat('}');
      continue;
    }
    const decl = typeDecl(c, false);
    if (decl === SKIPPED) continue;
    if (decl) out.push({ ns: current, decl });
    else if (!c.done) c.next();
  }
}

function skipAttributes(c) {
  while (c.is('[')) c.skipBalanced();
}

function modifiers(c) {
  const mods = new Set();
  for (;;) {
    skipAttributes(c);
    if (c.isId() && MODIFIERS.has(c.peek().v) && !c.is('(', 1) && !c.is(';', 1) && !c.is('=', 1)) mods.add(c.next().v);
    else break;
  }
  return mods;
}

const visibilityOf = (mods, fallback) => {
  if (mods.has('public')) return 'public';
  if (mods.has('protected')) return 'protected';
  if (mods.has('private')) return 'private';
  if (mods.has('internal')) return 'package';
  return fallback;
};

function typeDecl(c, inInterface) {
  const start = c.i;
  const doc = c.peek()?.doc ?? '';
  const mods = modifiers(c);
  if (c.is('delegate')) { c.recover(); return SKIPPED; }
  if (!(c.isId() && TYPE_KEYWORDS.has(c.peek().v))) { c.i = start; return null; }
  let kind = c.next().v;
  if (kind === 'record' && (c.is('class') || c.is('struct'))) c.next();
  if (!c.isId()) { c.i = start; return null; }
  const decl = newDecl(kind === 'interface' ? 'interface' : kind === 'enum' ? 'enum' : 'class', c.next().v.replace(/^@/, ''), doc);
  decl.visibility = visibilityOf(mods, inInterface ? 'public' : 'package');
  decl.isAbstract = mods.has('abstract');
  decl.isFinal = mods.has('sealed') || kind === 'struct';
  decl.isStatic = mods.has('static');
  if (c.is('<')) decl.templateParams = typeParams(c);
  if (c.is('(')) { // primary constructor / positional record
    for (const p of params(c)) decl.fields.push({ name: p.name, type: p.type, visibility: 'public', isStatic: false, isFinal: kind === 'record', defaultValue: p.defaultValue, doc: '' });
  }
  if (c.eat(':')) {
    const from = c.i;
    while (!c.done && !c.is('{') && !c.is(';') && !c.is('where')) { if (c.is('(')) c.skipBalanced(); else if (c.is('<')) c.skipBalanced(); else c.next(); }
    for (const [a, b] of splitTop(c.toks, from, c.i)) {
      const end = c.toks.slice(a, b).findIndex((t) => t.v === '(');
      const text = normType(c.text(a, end >= 0 ? a + end : b));
      if (kind === 'enum') continue; // underlying type
      if (text) decl.bases.push(text);
    }
  }
  constraints(c, decl.templateParams);
  if (c.is('{')) body(c, decl);
  else c.eat(';');
  return decl;
}

/** "where T : Base, new()" → bounds of the template parameters. */
function constraints(c, tparams) {
  while (c.is('where')) {
    c.next();
    const name = c.next()?.v;
    c.eat(':');
    const from = c.i;
    while (!c.done && !c.is('{') && !c.is(';') && !c.is('where') && !c.is('=>')) { if (c.is('(')) c.skipBalanced(); else if (c.is('<')) c.skipBalanced(); else c.next(); }
    const bound = splitTop(c.toks, from, c.i).map(([a, b]) => normType(c.text(a, b))).filter((t) => !['class', 'struct', 'new()', 'notnull', 'unmanaged'].includes(t)).join(', ');
    const t = tparams.find((x) => x.name === name);
    if (t && bound) t.bound = bound;
  }
}

/** A type: "int", "List<Foo>", "Foo?", "int[,]", "(int, string)", "global::A.B". */
function parseType(c) {
  const from = c.i;
  if (c.is('(')) { c.skipBalanced(); } else {
    if (!c.isId()) return '';
    c.next();
    for (;;) {
      if (c.is('<')) c.skipBalanced();
      if ((c.is('.') || c.is('::')) && c.isId(1)) { c.next(); c.next(); continue; }
      break;
    }
  }
  for (;;) {
    if (c.is('?') && !c.is('?', 1) && (c.isId(1) || c.is('[', 1) || c.is(')', 1) || c.is(',', 1) || c.is('>', 1))) { c.next(); continue; }
    if (c.is('[') && (c.is(']', 1) || c.is(',', 1))) { c.skipBalanced(); continue; }
    if (c.is('*')) { c.next(); continue; }
    break;
  }
  return normType(c.text(from).replace(/^global::/, ''));
}

function params(c) {
  const open = c.i;
  c.skipBalanced();
  const out = [];
  const toks = c.toks;
  for (const [a, b] of splitTop(toks, open + 1, c.i - 1)) {
    let j = a;
    while (j < b && toks[j].v === '[') { let depth = 0; for (; j < b; j += 1) { if (toks[j].v === '[') depth += 1; else if (toks[j].v === ']') { depth -= 1; if (depth === 0) { j += 1; break; } } } }
    let direction = 'in';
    let many = false;
    while (j < b && ['ref', 'out', 'in', 'params', 'this', 'scoped', 'readonly'].includes(toks[j].v)) {
      if (toks[j].v === 'ref') direction = 'inout';
      if (toks[j].v === 'out') direction = 'out';
      if (toks[j].v === 'params') many = true;
      j += 1;
    }
    const eq = toks.slice(j, b).findIndex((t) => t.v === '=');
    const end = eq >= 0 ? j + eq : b;
    const nameTok = toks[end - 1];
    if (!nameTok || nameTok.t !== 'id' || end - 1 <= j) continue;
    let type = normType(c.text(j, end - 1));
    if (many && !type.endsWith(']')) type += '[]';
    out.push({ name: nameTok.v.replace(/^@/, ''), type, defaultValue: eq >= 0 ? c.text(end + 1, b) : '', direction });
  }
  return out;
}

function body(c, decl) {
  c.next(); // '{'
  if (decl.kind === 'enum') { enumBody(c, decl); return; }
  const inInterface = decl.kind === 'interface';
  const fallback = inInterface ? 'public' : 'private';
  while (!c.done && !c.is('}')) {
    if (c.eat(';')) continue;
    const start = c.i;
    const doc = c.peek()?.doc ?? '';
    const mods = modifiers(c);
    if (c.isId() && TYPE_KEYWORDS.has(c.peek().v) && (c.isId(1) || c.is('class', 1) || c.is('struct', 1))) {
      c.i = start;
      const nested = typeDecl(c, inInterface);
      if (nested === SKIPPED) continue;
      if (nested) { decl.nested.push(nested); continue; }
      c.i = start; c.next(); c.recover();
      continue;
    }
    if (c.is('delegate') || c.is('~') || c.is('operator')) { c.recover(); continue; }
    const visibility = visibilityOf(mods, fallback);
    const isStatic = mods.has('static') || mods.has('const');
    if (c.is('event')) {
      c.next();
      const type = parseType(c);
      const name = c.next()?.v ?? '';
      if (c.is('{')) c.skipBalanced(); else c.recover();
      if (name) decl.fields.push({ name, type, visibility, isStatic, isFinal: false, defaultValue: '', doc });
      continue;
    }
    if (c.isId() && c.is('(', 1) && c.peek().v === decl.name) { // constructor
      c.next();
      const ps = params(c);
      if (c.eat(':')) { c.next(); if (c.is('(')) c.skipBalanced(); } // : base(…) / : this(…)
      skipMethodBody(c);
      decl.methods.push({ name: decl.name, visibility, isStatic, isAbstract: false, isFinal: false, params: ps, returnType: '', doc, templateParams: [], isConstructor: true, throws: [] });
      continue;
    }
    const type = parseType(c);
    if (!type) { c.i = start; c.next(); c.recover(); continue; }
    if (c.is('operator') || c.is('this')) { c.recover(); continue; }
    if (!c.isId()) { c.recover(); continue; }
    // Name (possibly an explicit interface implementation "IFoo.Bar").
    let name = c.next().v;
    while (c.is('.') && c.isId(1)) { c.next(); name = c.next().v; }
    name = name.replace(/^@/, '');
    if (c.is('<') || c.is('(')) {
      const tparams = c.is('<') ? typeParams(c) : [];
      const ps = c.is('(') ? params(c) : [];
      constraints(c, tparams);
      const hasBody = c.is('{') || c.is('=>');
      skipMethodBody(c);
      decl.methods.push({
        name, visibility, isStatic, isAbstract: mods.has('abstract') || (inInterface && !hasBody && !isStatic), isFinal: mods.has('sealed'),
        params: ps, returnType: type === 'void' ? '' : type, doc, templateParams: tparams, isConstructor: false, throws: [],
      });
      continue;
    }
    if (c.is('{')) { // property
      const open = c.i;
      c.skipBalanced();
      const accessors = c.toks.slice(open, c.i).filter((t) => t.t === 'id').map((t) => t.v);
      let defaultValue = '';
      if (c.eat('=')) { const from = c.i; c.skipUntil([';']); defaultValue = c.text(from); c.eat(';'); }
      decl.fields.push({ name, type, visibility, isStatic, isFinal: !accessors.includes('set') && !accessors.includes('init'), defaultValue, doc, property: true });
      continue;
    }
    if (c.is('=>')) { // get-only expression-bodied property
      c.skipUntil([';']);
      c.eat(';');
      decl.fields.push({ name, type, visibility, isStatic, isFinal: true, defaultValue: '', doc, property: true });
      continue;
    }
    // Fields: "int a = 1, b;"
    let fieldName = name;
    for (;;) {
      let defaultValue = '';
      if (c.eat('=')) { const from = c.i; c.skipUntil([',', ';']); defaultValue = c.text(from); }
      decl.fields.push({ name: fieldName, type, visibility, isStatic, isFinal: mods.has('readonly') || mods.has('const'), defaultValue, doc });
      if (c.eat(',') && c.isId()) { fieldName = c.next().v; continue; }
      break;
    }
    if (!c.eat(';')) c.recover();
  }
  c.eat('}');
}

/** "{ … }", "=> expr;" or ";". */
function skipMethodBody(c) {
  if (c.is('{')) { c.skipBalanced(); return; }
  if (c.is('=>')) { c.skipUntil([';']); c.eat(';'); return; }
  c.eat(';');
}

function enumBody(c, decl) {
  while (!c.done && !c.is('}')) {
    const doc = c.peek()?.doc ?? '';
    skipAttributes(c);
    if (!c.isId()) { c.next(); continue; }
    decl.literals.push({ name: c.next().v, doc });
    if (c.eat('=')) c.skipUntil([',', '}']);
    c.eat(',');
  }
  c.eat('}');
}
