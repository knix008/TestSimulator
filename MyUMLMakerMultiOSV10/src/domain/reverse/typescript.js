// TypeScript reverse engineering: a tolerant parser for .ts sources that
// extracts exported or local classes (abstract, generics, extends,
// implements, decorators, properties with optional "?" / initializers,
// #private names, accessors, methods, constructors and their parameter
// properties), interfaces (properties and method signatures) and enums.
// Statements are not required to end with ';' (a line break ends a member
// when the line is complete). Namespaces become packages below the file's
// folder packages (added by reverse/index.js). Other code is skipped.
import { Cursor, newDecl, normType, splitTop, tokenize } from './java.js';

const MEMBER_MODIFIERS = new Set(['public', 'private', 'protected', 'static', 'readonly', 'abstract', 'declare', 'override', 'async', 'accessor']);
/** Tokens after which a type is not complete yet. */
const TYPE_CONTINUES = new Set(['|', '&', '=>', ':', ',', '<', '(', '[', '{', '.', '?', 'extends', 'keyof', 'typeof', 'infer', 'is', 'readonly', 'unique']);
const CONTINUES = new Set(['|', '&', '=>', '.', '?.', '??', '+', '-', '*', '/', '%', '&&', '||', '?', ':', ',', '=', '==', '===', '!=', '!==', '<', '>', '(', '[', '{', 'extends', 'keyof', 'typeof', 'in', 'as', 'instanceof']);

export function parse(src) {
  const c = new Cursor(tokenize(src, { hashNames: true, templates: true }), src);
  const types = [];
  statements(c, [], types, true);
  return { package: [], imports: [], types };
}

function statements(c, ns, types, top) {
  while (!c.done) {
    if (c.is('}')) { if (top) { c.next(); continue; } return; }
    if (c.is('import') && !c.is('(', 1) && !c.is('.', 1)) { skipImport(c); continue; }
    const start = c.i;
    const doc = c.peek()?.doc ?? '';
    const prev = c.toks[c.i - 1];
    if (prev && (prev.v === '.' || prev.v === '?.')) { c.next(); continue; }
    while (c.is('@')) skipDecorator(c);
    let isAbstract = false;
    for (;;) {
      if (c.is('export') || c.is('declare') || c.is('default')) c.next();
      else if (c.is('abstract') && c.is('class', 1)) { c.next(); isAbstract = true; } else if (c.is('const') && c.is('enum', 1)) c.next();
      else break;
    }
    if ((c.is('namespace') || c.is('module')) && c.isId(1)) {
      c.next();
      const from = c.i;
      while (!c.done && !c.is('{')) c.next();
      const name = c.text(from).replace(/\s/g, '').split('.').filter(Boolean);
      c.next();
      statements(c, [...ns, ...name], types, false);
      c.eat('}');
      continue;
    }
    if (c.is('class') && (c.isId(1) || c.is('{', 1) || c.is('<', 1) || c.is('extends', 1) || c.is('implements', 1))) {
      c.next();
      const decl = classDecl(c, doc, isAbstract);
      if (ns.length) decl.package = ns;
      types.push(decl);
      continue;
    }
    if (c.is('interface') && c.isId(1)) {
      c.next();
      const decl = interfaceDecl(c, doc);
      if (ns.length) decl.package = ns;
      types.push(decl);
      continue;
    }
    if (c.is('enum') && c.isId(1)) {
      c.next();
      const decl = newDecl('enum', c.next().v, doc);
      if (c.is('{')) enumBody(c, decl);
      if (ns.length) decl.package = ns;
      types.push(decl);
      continue;
    }
    if (c.i === start) c.next();
  }
}

function skipImport(c) {
  c.next();
  while (!c.done) {
    const t = c.next();
    if (t.t === 'str') break;
    if (t.v === 'require' && c.is('(')) { c.skipBalanced(); break; }
    if (t.v === ';') return;
  }
  c.eat(';');
}

function skipDecorator(c) {
  c.next();
  while (c.isId() && c.is('.', 1)) { c.next(); c.next(); }
  if (c.isId()) c.next();
  if (c.is('<')) c.skipBalanced();
  if (c.is('(')) c.skipBalanced();
}

/** "<T extends X = Y, U>" → [{ name, bound, defaultValue }]. */
function typeParams(c) {
  const open = c.i;
  skipAngles(c);
  const out = [];
  for (const [a, b] of splitTop(c.toks, open + 1, c.i - 1)) {
    const toks = c.toks.slice(a, b);
    const name = toks.find((t) => t.t === 'id' && !['in', 'out', 'const'].includes(t.v))?.v;
    if (!name) continue;
    const ext = toks.findIndex((t) => t.v === 'extends');
    const eq = toks.findIndex((t) => t.v === '=');
    out.push({ name, bound: ext >= 0 ? normType(c.text(a + ext + 1, eq > ext ? a + eq : b)) : '', defaultValue: eq >= 0 ? c.text(a + eq + 1, b) : '' });
  }
  return out;
}

/** At '<': past its matching '>' ('=>' inside does not close). */
function skipAngles(c) {
  let depth = 0;
  while (!c.done) {
    const t = c.next();
    if (t.t !== 'op') continue;
    if (t.v === '<') depth += 1;
    else if (t.v === '>') { depth -= 1; if (depth === 0) return; }
  }
}

/**
 * A type expression up to a stop token at depth 0 ('=', ';', ',', ')', '}',
 * a '{' that starts a body, or a line break after a complete type).
 */
function parseType(c, { braceEnds = false } = {}) {
  const from = c.i;
  let depth = 0;
  while (!c.done) {
    const t = c.peek();
    const prev = c.toks[c.i - 1];
    if (depth === 0 && c.i > from) {
      if (t.t === 'op' && [';', ',', ')', '}', ']', '='].includes(t.v)) break;
      if (t.v === '{' && braceEnds && !TYPE_CONTINUES.has(prev.v)) break;
      if (t.nl && !TYPE_CONTINUES.has(prev.v) && !['|', '&', '=>', '.', '[', '<'].includes(t.v)) break;
    }
    if (depth === 0 && c.i === from && t.t === 'op' && [';', ',', ')', '}', '='].includes(t.v)) break;
    if (t.t === 'op') {
      if (t.v === '(' || t.v === '[' || t.v === '{' || t.v === '<') depth += 1;
      else if (t.v === ')' || t.v === ']' || t.v === '}' || t.v === '>') { if (depth === 0) break; depth -= 1; }
    }
    c.next();
  }
  return normType(c.text(from));
}

/** An initializer expression up to ';', ',' (in enums) or the end of the line / member. */
function expression(c, stops = [';']) {
  const from = c.i;
  while (!c.done) {
    const t = c.peek();
    const prev = c.toks[c.i - 1];
    if (t.t === 'op' && (stops.includes(t.v) || t.v === '}' || t.v === ')')) break;
    if (c.i > from && t.nl && !CONTINUES.has(prev.v) && !['.', '?.', '|', '&', '+', '-', '*', '/', '?', ':', '&&', '||', '??', '=>', ')', ']'].includes(t.v)) break;
    if (t.t === 'op' && (t.v === '(' || t.v === '[' || t.v === '{')) { c.skipBalanced(); continue; }
    c.next();
  }
  return c.text(from);
}

function heritage(c) {
  const out = [];
  while (!c.done) {
    const from = c.i;
    while (c.isId() && (c.is('.', 1))) { c.next(); c.next(); }
    if (!c.isId()) break;
    c.next();
    if (c.is('<')) skipAngles(c);
    if (c.is('(')) c.skipBalanced(); // mixin call
    out.push(normType(c.text(from)));
    if (!c.eat(',')) break;
  }
  return out;
}

function classDecl(c, doc, isAbstract) {
  const name = c.isId() && !c.is('extends') && !c.is('implements') ? c.next().v : 'Default';
  const decl = newDecl('class', name, doc);
  decl.isAbstract = isAbstract;
  if (c.is('<')) decl.templateParams = typeParams(c);
  while (!c.done && !c.is('{')) {
    if (c.eat('extends')) decl.extends.push(...heritage(c).slice(0, 1));
    else if (c.eat('implements')) decl.implements.push(...heritage(c));
    else c.next();
  }
  if (c.is('{')) classBody(c, decl);
  return decl;
}

function interfaceDecl(c, doc) {
  const decl = newDecl('interface', c.next().v, doc);
  if (c.is('<')) decl.templateParams = typeParams(c);
  while (!c.done && !c.is('{')) {
    if (c.eat('extends')) decl.extends.push(...heritage(c));
    else c.next();
  }
  if (c.is('{')) interfaceBody(c, decl);
  return decl;
}

const visibilityOf = (mods, name) => (mods.has('private') || name.startsWith('#') ? 'private' : mods.has('protected') ? 'protected' : 'public');

/** A member name: identifier, string, number or #private; '' for a computed / index member. */
function memberName(c) {
  const t = c.peek();
  if (!t) return '';
  if (t.t === 'id' || t.t === 'num') { c.next(); return t.v; }
  if (t.t === 'str') { c.next(); return t.v.slice(1, -1); }
  return '';
}

function params(c, ctorFields = null) {
  const open = c.i;
  c.skipBalanced();
  const out = [];
  const toks = c.toks;
  for (const [a, b] of splitTop(toks, open + 1, c.i - 1)) {
    let j = a;
    while (j < b && toks[j].v === '@') { // parameter decorators
      j += 1;
      while (j < b && (toks[j].t === 'id' || toks[j].v === '.')) j += 1;
      if (toks[j]?.v === '(') { let depth = 0; for (; j < b; j += 1) { if (toks[j].v === '(') depth += 1; else if (toks[j].v === ')') { depth -= 1; if (depth === 0) { j += 1; break; } } } }
    }
    const mods = new Set();
    while (j < b && MEMBER_MODIFIERS.has(toks[j].v) && toks[j + 1] && toks[j + 1].t === 'id') mods.add(toks[j++].v);
    let rest = false;
    if (toks[j]?.v === '...') { rest = true; j += 1; }
    if (!toks[j] || j >= b) continue;
    if (toks[j].v === '{' || toks[j].v === '[') { out.push({ name: 'options', type: '', defaultValue: '', direction: 'in' }); continue; } // destructuring
    const name = toks[j].v;
    if (name === 'this') continue;
    j += 1;
    let optional = false;
    if (toks[j]?.v === '?') { optional = true; j += 1; }
    let type = '';
    let defaultValue = '';
    const eqAt = (() => { let depth = 0; for (let k = j; k < b; k += 1) { const v = toks[k].v; if ('([{<'.includes(v)) depth += 1; else if (')]}>'.includes(v)) depth -= 1; else if (v === '=' && depth === 0) return k; } return -1; })();
    if (toks[j]?.v === ':') type = normType(c.text(j + 1, eqAt >= 0 ? eqAt : b));
    if (eqAt >= 0) defaultValue = c.text(eqAt + 1, b);
    if (rest && type && !/\[\]$/.test(type) && !/^Array</.test(type)) type += '[]';
    const multiplicity = optional && !rest && !defaultValue ? '0..1' : undefined;
    const p = { name, type, defaultValue, direction: 'in', ...(multiplicity ? { multiplicity } : {}) };
    out.push(p);
    if (ctorFields && (mods.size)) {
      ctorFields.push({ name, type, visibility: visibilityOf(mods, name), isStatic: false, isFinal: mods.has('readonly'), defaultValue, doc: '', ...(multiplicity ? { multiplicity } : {}) });
    }
  }
  return out;
}

function classBody(c, decl) {
  c.next(); // '{'
  while (!c.done && !c.is('}')) {
    if (c.eat(';') || c.eat(',')) continue;
    const start = c.i;
    const doc = c.peek()?.doc ?? '';
    while (c.is('@')) skipDecorator(c);
    const mods = new Set();
    let accessor = '';
    for (;;) {
      const t = c.peek();
      if (!t || t.t !== 'id') break;
      const following = c.peek(1);
      const isName = !following || following.nl || ['(', ':', '?', '!', '=', ';', '<', '}', ','].includes(following.v);
      if (MEMBER_MODIFIERS.has(t.v) && !isName) { mods.add(c.next().v); continue; }
      if ((t.v === 'get' || t.v === 'set') && !isName) { accessor = c.next().v; continue; }
      break;
    }
    if (c.is('[')) { // index signature or computed name
      c.skipBalanced();
      if (c.is('(')) { c.skipBalanced(); if (c.is(':')) { c.next(); parseType(c, { braceEnds: true }); } if (c.is('{')) c.skipBalanced(); } else { if (c.is(':')) { c.next(); parseType(c); } if (c.eat('=')) expression(c); }
      continue;
    }
    if (c.is('constructor') && c.is('(', 1)) {
      c.next();
      const ctorFields = [];
      const ps = params(c, ctorFields);
      decl.fields.push(...ctorFields);
      if (c.is('{')) c.skipBalanced();
      decl.methods.push({ name: decl.name, visibility: visibilityOf(mods, ''), isStatic: false, isAbstract: false, isFinal: false, params: ps, returnType: '', doc, templateParams: [], isConstructor: true, throws: [] });
      continue;
    }
    if (c.is('*')) c.next(); // generator
    const name = memberName(c);
    if (!name) { if (c.i === start) c.next(); else c.recover(); continue; }
    let optional = false;
    if (c.is('?') || c.is('!')) optional = c.next().v === '?';
    const visibility = visibilityOf(mods, name);
    const cleanName = name.replace(/^#/, '');
    if (c.is('(') || c.is('<')) {
      const tparams = c.is('<') ? typeParams(c) : [];
      const ps = c.is('(') ? params(c) : [];
      let returnType = '';
      if (c.eat(':')) returnType = parseType(c, { braceEnds: true });
      const hasBody = c.is('{');
      if (hasBody) c.skipBalanced(); else c.eat(';');
      decl.methods.push({
        name: cleanName, visibility, isStatic: mods.has('static'), isAbstract: mods.has('abstract'), isFinal: false, params: ps,
        returnType: returnType === 'void' ? '' : accessor === 'set' ? '' : returnType, doc, templateParams: tparams, isConstructor: false, throws: [],
        isAccessor: Boolean(accessor),
      });
      continue;
    }
    // Property.
    let type = '';
    if (c.eat(':')) type = parseType(c);
    let defaultValue = '';
    if (c.eat('=')) defaultValue = expression(c);
    decl.fields.push({
      name: cleanName, type, visibility, isStatic: mods.has('static'), isFinal: mods.has('readonly'), defaultValue, doc,
      ...(optional ? { multiplicity: analyzeOptional(type) } : {}),
    });
    c.eat(';');
  }
  c.eat('}');
}

/** "x?: T" is 0..1 unless T is already a collection. */
function analyzeOptional(type) {
  return /\[\]$|^Array</.test(type) ? '*' : '0..1';
}

function interfaceBody(c, decl) {
  c.next(); // '{'
  while (!c.done && !c.is('}')) {
    if (c.eat(';') || c.eat(',')) continue;
    const start = c.i;
    const doc = c.peek()?.doc ?? '';
    let readonly = false;
    if (c.is('readonly') && (c.isId(1) || c.peek(1)?.t === 'str')) { c.next(); readonly = true; }
    if (c.is('[') || c.is('(') || c.is('<') || (c.is('new') && (c.is('(', 1) || c.is('<', 1)))) { // index / call / construct signature
      if (c.is('new')) c.next();
      if (c.is('<')) skipAngles(c);
      c.skipBalanced();
      if (c.is('(')) c.skipBalanced();
      if (c.eat(':')) parseType(c);
      continue;
    }
    const name = memberName(c);
    if (!name) { if (c.i === start) c.next(); continue; }
    let optional = false;
    if (c.is('?')) { c.next(); optional = true; }
    if (c.is('(') || c.is('<')) {
      const tparams = c.is('<') ? typeParams(c) : [];
      const ps = c.is('(') ? params(c) : [];
      let returnType = '';
      if (c.eat(':')) returnType = parseType(c);
      decl.methods.push({ name, visibility: 'public', isStatic: false, isAbstract: true, isFinal: false, params: ps, returnType: returnType === 'void' ? '' : returnType, doc, templateParams: tparams, isConstructor: false, throws: [] });
      continue;
    }
    let type = '';
    if (c.eat(':')) type = parseType(c);
    decl.fields.push({ name, type, visibility: 'public', isStatic: false, isFinal: readonly, defaultValue: '', doc, ...(optional ? { multiplicity: analyzeOptional(type) } : {}) });
  }
  c.eat('}');
}

function enumBody(c, decl) {
  c.next(); // '{'
  while (!c.done && !c.is('}')) {
    const doc = c.peek()?.doc ?? '';
    const name = memberName(c);
    if (!name) { c.next(); continue; }
    decl.literals.push({ name, doc });
    if (c.eat('=')) expression(c, [',']);
    c.eat(',');
  }
  c.eat('}');
}
