// Kotlin reverse engineering: a tolerant parser for .kt / .kts sources
// (package and import lines, @annotations, class / interface / object /
// enum class / data class / sealed / abstract / open / annotation class,
// primary constructors whose val / var parameters are properties, body
// properties (val → read-only, const → static read-only, getters and
// setters skipped), functions with default values, vararg, suspend,
// override, abstract, expression bodies, companion objects (static
// members), generics with bounds and where-clauses, supertype lists, KDoc).
// Returns the neutral description used by reverse/index.js: a supertype with
// a constructor call "Base()" goes into `extends`, the others into `bases`
// (the builder tells classes from interfaces).
//
// Kotlin has no semicolons: a statement ends at a line break unless the
// next line obviously continues it (".foo", "?: x", "&& y", …) or the line
// ends with an operator.
import { Cursor, newDecl, normType, splitTop, tokenize, typeParams } from './java.js';

const MODIFIERS = new Set(['public', 'private', 'protected', 'internal', 'abstract', 'open', 'final', 'override', 'sealed', 'data', 'enum', 'annotation', 'inner',
  'companion', 'inline', 'value', 'lateinit', 'const', 'suspend', 'tailrec', 'operator', 'infix', 'external', 'expect', 'actual', 'noinline', 'crossinline', 'vararg', 'reified']);
const PARAM_MODIFIERS = new Set(['public', 'private', 'protected', 'internal', 'override', 'open', 'final', 'vararg', 'noinline', 'crossinline', 'val', 'var']);
const ACCESSOR_MODIFIERS = new Set(['public', 'private', 'protected', 'internal', 'override', 'open', 'final', 'inline', 'external']);
const TYPE_KEYWORDS = new Set(['class', 'interface', 'object']);
/** A line ending with one of these continues on the next line. */
const END_OPS = new Set(['.', '?.', '=', '+', '-', '*', '/', '%', '&&', '||', '->', ',', '?', ':', '==', '!=', '===', '!==', '..', '!', '+=', '-=', '*=', '/=', '%=']);
/** A next line starting with one of these continues the statement. */
const START_WORDS = new Set(['as', 'is', 'else', 'catch', 'finally']);
const NOT_CONTINUING = new Set(['@', '}', ')', ']', ';', '(', '{', '[']);

/** Parses one Kotlin source → { package: [..], imports: [..], types: [Decl] }. */
export function parse(src) {
  const c = new Cursor(tokenize(src), src);
  const file = { package: [], imports: [], types: [] };
  while (!c.done) {
    if (c.is('package')) {
      c.next();
      file.package = lineText(c).replace(/\s/g, '').split('.').filter(Boolean);
      c.eat(';');
      continue;
    }
    if (c.is('import')) {
      c.next();
      file.imports.push(lineText(c).split(/\s+as\s+/)[0].replace(/\s/g, ''));
      c.eat(';');
      continue;
    }
    const decl = typeDecl(c);
    if (decl) { file.types.push(decl); continue; }
    if (c.is('@')) skipAnnotation(c);
    else if (c.is('{') || c.is('(') || c.is('[')) c.skipBalanced(); // top-level function bodies, scripts
    else c.next();
  }
  return file;
}

/** The rest of the line ("a.b.C" after package / import). */
function lineText(c) {
  const from = c.i;
  while (!c.done && !c.is(';') && (c.i === from || !c.peek().nl)) c.next();
  return c.text(from);
}

/** "@Ann", "@field:Json(name = "x")", "@a.b.Ann(…)". */
function skipAnnotation(c) {
  c.next(); // '@'
  if (c.isId() && c.is(':', 1)) { c.next(); c.next(); } // use-site target
  if (c.is('[')) { c.skipBalanced(); return; }
  while (c.isId() && c.is('.', 1)) { c.next(); c.next(); }
  if (c.isId()) c.next();
  if (c.is('<')) c.skipBalanced();
  if (c.is('(') && !c.peek().nl) c.skipBalanced();
}

/** Annotations and modifiers → Set of modifiers ("fun interface" counts as an interface). */
function modifiers(c) {
  const mods = new Set();
  for (;;) {
    if (c.is('@')) skipAnnotation(c);
    else if (c.isId() && MODIFIERS.has(c.peek().v) && (c.isId(1) || c.is('@', 1))) mods.add(c.next().v);
    else if (c.is('fun') && c.is('interface', 1)) c.next();
    else break;
  }
  return mods;
}

const visibilityOf = (mods) => {
  if (mods.has('private')) return 'private';
  if (mods.has('protected')) return 'protected';
  if (mods.has('internal')) return 'package';
  return 'public';
};

/** A class / interface / object declaration at the cursor, or null (cursor unchanged). */
function typeDecl(c) {
  const start = c.i;
  const doc = c.peek()?.doc ?? '';
  const mods = modifiers(c);
  if (!(c.isId() && TYPE_KEYWORDS.has(c.peek().v) && c.isId(1)) || mods.has('companion')) { c.i = start; return null; }
  const keyword = c.next().v;
  const kind = keyword === 'interface' || mods.has('annotation') ? 'interface' : mods.has('enum') ? 'enum' : 'class';
  const decl = newDecl(kind, c.next().v, doc);
  decl.visibility = visibilityOf(mods);
  decl.isAbstract = kind === 'class' && (mods.has('abstract') || mods.has('sealed'));
  decl.isFinal = kind === 'class' && !mods.has('open') && !decl.isAbstract; // final unless open
  decl.isStatic = !mods.has('inner');
  if (c.is('<')) decl.templateParams = typeParams(c);
  // Primary constructor: "class A private constructor(…)", "class A @Inject constructor(…)", "class A(…)".
  const before = c.i;
  const ctorMods = modifiers(c);
  const explicit = c.eat('constructor');
  if (!explicit) c.i = before;
  if (c.is('(')) primaryConstructor(c, decl, explicit ? visibilityOf(ctorMods) : 'public', explicit);
  if (c.eat(':')) supertypes(c, decl);
  constraints(c, decl.templateParams);
  if (c.is('{')) body(c, decl, { isStatic: keyword === 'object', entries: kind === 'enum' });
  return decl;
}

function primaryConstructor(c, decl, visibility, explicit) {
  const ps = params(c);
  for (const p of ps) {
    if (!p.property) continue;
    decl.fields.push({ name: p.name, type: p.type, visibility: p.visibility, isStatic: false, isFinal: p.property === 'val', defaultValue: p.defaultValue, doc: p.doc });
  }
  if (explicit || ps.some((p) => !p.property)) {
    decl.methods.push({ name: decl.name, visibility, isStatic: false, isAbstract: false, isFinal: false, params: ps, returnType: '', doc: '', templateParams: [], isConstructor: true, throws: [] });
  }
}

/** ": Base(1), Iface, Other by delegate" → extends (constructor calls) and bases. */
function supertypes(c, decl) {
  for (;;) {
    const type = parseType(c);
    if (!type) break;
    let call = false;
    if (c.is('(')) { c.skipBalanced(); call = true; }
    if (c.is('by')) {
      c.next();
      while (!c.done && !c.is(',') && !c.is('{') && !c.is('where') && !c.peek().nl) { if (c.is('(') || c.is('[')) c.skipBalanced(); else c.next(); }
    }
    if (decl.kind === 'interface' || call) decl.extends.push(type);
    else decl.bases.push(type);
    if (!c.eat(',')) break;
  }
}

/** "where T : A, T : B" → bounds of the template parameters. */
function constraints(c, tparams) {
  if (!c.eat('where')) return;
  for (;;) {
    if (!c.isId()) break;
    const name = c.next().v;
    if (!c.eat(':')) break;
    const bound = parseType(c);
    const t = tparams.find((x) => x.name === name);
    if (t && bound) t.bound = t.bound ? `${t.bound}, ${bound}` : bound;
    if (!c.eat(',')) break;
  }
}

/** A type: "Int", "List<Order>?", "kotlin.collections.Map<K, V>", "(Int) -> Unit", "suspend () -> Unit". */
function parseType(c) {
  const from = c.i;
  while (c.is('@')) skipAnnotation(c);
  if (c.is('suspend') && c.is('(', 1)) c.next();
  const typeFrom = c.i;
  if (c.is('(')) {
    c.skipBalanced();
  } else {
    if (!c.isId()) { c.i = from; return ''; }
    c.next();
    for (;;) {
      if (c.is('<')) c.skipBalanced();
      if (c.is('.') && c.isId(1)) { c.next(); c.next(); continue; }
      break;
    }
  }
  if (c.is('?') && !c.is('.', 1)) c.next();
  if (c.is('.') && c.is('(', 1)) { c.next(); return parseFunctionTail(c, typeFrom); } // receiver: A.() -> B
  if (c.is('->')) return parseFunctionTail(c, typeFrom);
  return normType(c.text(typeFrom));
}

function parseFunctionTail(c, typeFrom) {
  if (c.is('(')) c.skipBalanced();
  if (c.eat('->')) parseType(c);
  return normType(c.text(typeFrom));
}

/** Parameter list at '(' → [{ name, type, defaultValue, direction, property, visibility, doc }]. */
function params(c) {
  const open = c.i;
  c.skipBalanced();
  const out = [];
  for (const [a, b] of splitTop(c.toks, open + 1, c.i - 1)) {
    const p = new Cursor(c.toks.slice(a, b), c.src);
    const doc = p.peek()?.doc ?? '';
    const mods = new Set();
    for (;;) {
      if (p.is('@')) skipAnnotation(p);
      else if (p.isId() && PARAM_MODIFIERS.has(p.peek().v) && p.isId(1)) mods.add(p.next().v);
      else break;
    }
    if (!p.isId()) continue;
    const name = p.next().v;
    let type = '';
    if (p.eat(':')) {
      const from = p.i;
      while (!p.done && !p.is('=')) { if (p.is('(') || p.is('[') || p.is('{')) p.skipBalanced(); else p.next(); }
      type = normType(p.text(from));
    }
    const defaultValue = p.eat('=') ? p.text(p.i, p.toks.length) : '';
    if (mods.has('vararg') && type) type += '...';
    out.push({ name, type, defaultValue, direction: 'in', property: mods.has('val') ? 'val' : mods.has('var') ? 'var' : '', visibility: visibilityOf(mods), doc });
  }
  return out;
}

/** True when the token at the cursor (first of a new line) continues the current statement. */
function continues(c) {
  const prev = c.toks[c.i - 1];
  if (prev && prev.t === 'op' && END_OPS.has(prev.v)) return true;
  const t = c.peek();
  if (t.t === 'op') return !NOT_CONTINUING.has(t.v);
  return t.t === 'id' && START_WORDS.has(t.v);
}

/** An expression up to the end of its statement (line break, ';', or a closer); generic arguments skipped. */
function expression(c) {
  const from = c.i;
  while (!c.done) {
    const t = c.peek();
    if (c.i > from && t.nl && !continues(c)) break;
    if (t.t === 'op') {
      if (t.v === ';' || t.v === ',' || t.v === ')' || t.v === ']' || t.v === '}') break;
      if (t.v === '(' || t.v === '[' || t.v === '{') { c.skipBalanced(); continue; }
      if (t.v === '<') { const end = c.angleEnd(); if (end > 0) { c.i = end; continue; } }
    }
    c.next();
  }
  return c.text(from);
}

/** Class body: enum entries, members, nested declarations, companion objects. */
function body(c, decl, scope) {
  c.next(); // '{'
  if (scope.entries) enumEntries(c, decl);
  const inInterface = decl.kind === 'interface';
  while (!c.done && !c.is('}')) {
    if (c.eat(';')) continue;
    const start = c.i;
    const doc = c.peek()?.doc ?? '';
    const mods = modifiers(c);
    if (c.is('init') && c.is('{', 1)) { c.next(); c.skipBalanced(); continue; }
    if (mods.has('companion') && c.is('object')) {
      c.next();
      if (c.isId()) c.next(); // name
      if (c.eat(':')) supertypes(c, newDecl('class', ''));
      if (c.is('{')) body(c, decl, { isStatic: true, entries: false });
      continue;
    }
    if (c.isId() && TYPE_KEYWORDS.has(c.peek().v) && c.isId(1)) {
      c.i = start;
      const nested = typeDecl(c);
      if (nested) { decl.nested.push(nested); continue; }
      c.i = start; c.next(); expression(c);
      continue;
    }
    const visibility = visibilityOf(mods);
    if (c.is('constructor')) {
      c.next();
      const ps = c.is('(') ? params(c) : [];
      if (c.eat(':')) { c.next(); if (c.is('(')) c.skipBalanced(); } // : this(…) / : super(…)
      if (c.is('{')) c.skipBalanced();
      decl.methods.push({ name: decl.name, visibility, isStatic: false, isAbstract: false, isFinal: false, params: ps, returnType: '', doc, templateParams: [], isConstructor: true, throws: [] });
      continue;
    }
    if (c.is('fun')) { fn(c, decl, mods, doc, scope, inInterface); continue; }
    if (c.is('val') || c.is('var')) { property(c, decl, mods, doc, scope); continue; }
    // typealias, stray statements: skip the line.
    c.i = start;
    c.next();
    expression(c);
  }
  c.eat('}');
}

function fn(c, decl, mods, doc, scope, inInterface) {
  c.next(); // 'fun'
  const tparams = c.is('<') ? typeParams(c) : [];
  if (!parseType(c)) { expression(c); return; } // receiver and name: "Order.total"
  while ((c.is('.') || c.is('?.')) && c.isId(1)) { c.next(); c.next(); } // nullable receiver "String?.foo"
  const name = c.toks[c.i - 1].v;
  if (!c.is('(')) { expression(c); return; }
  const ps = params(c);
  let returnType = '';
  if (c.eat(':')) returnType = parseType(c);
  constraints(c, tparams);
  let hasBody = false;
  if (c.is('{')) { c.skipBalanced(); hasBody = true; } else if (c.eat('=')) { expression(c); hasBody = true; }
  decl.methods.push({
    name, visibility: visibilityOf(mods), isStatic: Boolean(scope.isStatic), isAbstract: mods.has('abstract') || (inInterface && !hasBody), isFinal: mods.has('final'),
    params: ps, returnType: returnType === 'Unit' ? '' : returnType, doc, templateParams: tparams, isConstructor: false, throws: [],
  });
}

function property(c, decl, mods, doc, scope) {
  const readOnly = c.next().v === 'val';
  if (c.is('<')) c.skipBalanced();
  if (!c.isId()) { expression(c); return; } // destructuring
  let name = c.next().v;
  for (;;) { // extension property "Order.label"
    if (c.is('<')) { c.skipBalanced(); continue; }
    if (c.is('.') && c.isId(1)) { c.next(); name = c.next().v; continue; }
    break;
  }
  let type = '';
  if (c.eat(':')) type = parseType(c);
  let defaultValue = '';
  if (c.eat('=')) defaultValue = expression(c);
  else if (c.eat('by')) expression(c);
  accessors(c);
  decl.fields.push({
    name, type: type || inferType(defaultValue), visibility: visibilityOf(mods), isStatic: Boolean(scope.isStatic) || mods.has('const'),
    isFinal: readOnly || mods.has('const'), defaultValue, doc,
  });
}

/** "get() = …", "private set", "set(value) { … }" after a property. */
function accessors(c) {
  for (;;) {
    const save = c.i;
    while (c.is('@')) skipAnnotation(c);
    while (c.isId() && ACCESSOR_MODIFIERS.has(c.peek().v) && (c.is('get', 1) || c.is('set', 1) || c.isId(1))) c.next();
    if ((c.is('get') || c.is('set')) && (c.is('(', 1) || c.is('=', 1) || c.is('{', 1) || c.is(';', 1) || c.is('}', 1) || !c.peek(1) || c.peek(1).nl)) {
      c.next();
      if (c.is('(')) c.skipBalanced();
      if (c.eat(':')) parseType(c);
      if (c.is('{')) c.skipBalanced(); else if (c.eat('=')) expression(c);
      c.eat(';');
      continue;
    }
    c.i = save;
    return;
  }
}

/** The type of a literal initializer ("0" → Int, "listOf<Item>()" → List<Item>, "Order()" → Order). */
function inferType(value) {
  const v = String(value ?? '').trim();
  if (!v) return '';
  if (/^-?\d[\d_]*$/.test(v)) return 'Int';
  if (/^-?\d[\d_]*[lL]$/.test(v)) return 'Long';
  if (/^-?(\d[\d_]*)?\.?\d+([eE][+-]?\d+)?[fF]$/.test(v)) return 'Float';
  if (/^-?\d[\d_]*\.\d+([eE][+-]?\d+)?$/.test(v)) return 'Double';
  if (/^"/.test(v)) return 'String';
  if (/^'/.test(v)) return 'Char';
  if (v === 'true' || v === 'false') return 'Boolean';
  const collection = /^(mutableListOf|listOf|arrayListOf|setOf|mutableSetOf|hashSetOf|arrayOf)\s*<(.+)>\s*\(/.exec(v);
  if (collection) {
    const outer = { mutableListOf: 'MutableList', listOf: 'List', arrayListOf: 'ArrayList', setOf: 'Set', mutableSetOf: 'MutableSet', hashSetOf: 'HashSet', arrayOf: 'Array' }[collection[1]];
    return `${outer}<${normType(collection[2])}>`;
  }
  const ctor = /^([A-Z][\w.]*)\s*(<[^()]*>)?\s*\(/.exec(v);
  if (ctor) return normType(ctor[1] + (ctor[2] ?? ''));
  return '';
}

/** Enum entries up to ';' or '}': "A, B(1), C { override fun f() = 1 }". */
function enumEntries(c, decl) {
  while (!c.done && !c.is(';') && !c.is('}')) {
    const doc = c.peek()?.doc ?? '';
    while (c.is('@')) skipAnnotation(c);
    if (!c.isId()) { c.next(); continue; }
    decl.literals.push({ name: c.next().v, doc });
    if (c.is('(')) c.skipBalanced();
    if (c.is('{')) c.skipBalanced();
    c.eat(',');
  }
  c.eat(';');
}
