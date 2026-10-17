// Java reverse engineering: a tolerant hand-written parser that turns a .java
// source into a language-neutral description (package, imports, type
// declarations with fields, methods, enum literals, generics, extends and
// implements). reverse/index.js turns that description into model elements.
//
// This file also holds the tokenizer and token cursor shared by the C-family
// parsers (C#, TypeScript): comments are dropped (a /** … *\/ or /// doc
// comment is attached to the next token as `doc`), strings and numbers become
// single tokens, and every token knows its source offsets so that types and
// default values are copied from the source text. '<' and '>' are never
// merged with other characters so that nested generics stay countable.
//
// Not a compiler: anything not understood is skipped up to the next ';' or
// balanced block.

// ───────────────────────── shared: errors

export function reverseError(code, detail) {
  const error = new Error(code);
  error.code = code;
  error.detail = detail;
  return error;
}

// ───────────────────────── shared: tokenizer

const MULTI = ['===', '!==', '...', '=>', '::', '==', '!=', '&&', '||', '++', '--', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '->', '?.', '??'];
const isIdStart = (ch) => /[A-Za-z_$]/.test(ch) || (ch > '\u007f' && /[\p{L}\p{Nl}]/u.test(ch));
const isIdPart = (ch) => /[\w$]/.test(ch) || (ch > '\u007f' && /[\p{L}\p{N}\p{Mn}\p{Mc}]/u.test(ch));

/**
 * Tokens of a C-family source: { t: 'id'|'num'|'str'|'op', v, s, e, nl, doc? }.
 * opts.tripleSlashDoc (C# ///), opts.hashNames (TS #private), opts.templates (TS `…`).
 */
export function tokenize(src, opts = {}) {
  const tokens = [];
  const n = src.length;
  let i = 0;
  let nl = true;
  let doc = null;
  let slashDoc = null;
  while (i < n) {
    const c = src[i];
    if (c === '\n') { nl = true; i += 1; continue; }
    if (c === ' ' || c === '\t' || c === '\r' || c === '\f' || c === '\v' || c === '﻿') { i += 1; continue; }
    if (c === '/' && src[i + 1] === '/') {
      const end = src.indexOf('\n', i);
      const stop = end < 0 ? n : end;
      if (opts.tripleSlashDoc && src[i + 2] === '/' && src[i + 3] !== '/') (slashDoc ??= []).push(src.slice(i + 3, stop));
      i = stop;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end < 0 ? n : end + 2;
      if (src[i + 2] === '*' && src[i + 3] !== '/') doc = cleanBlockDoc(src.slice(i + 3, Math.max(i + 3, stop - 2)));
      i = stop;
      continue;
    }
    const start = i;
    let t;
    if (c === '"' || c === "'" || (c === '`' && opts.templates) || (c === '@' && src[i + 1] === '"') || (c === '$' && (src[i + 1] === '"' || (src[i + 1] === '@' && src[i + 2] === '"')))) {
      i = skipString(src, i);
      t = 'str';
    } else if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      i += 1;
      while (i < n && (/[\w]/.test(src[i]) || (src[i] === '.' && /[0-9]/.test(src[i + 1] ?? '')))) i += 1;
      t = 'num';
    } else if (isIdStart(c) || (c === '#' && opts.hashNames && isIdStart(src[i + 1] ?? '')) || (c === '@' && opts.verbatimIds && isIdStart(src[i + 1] ?? ''))) {
      i += 1;
      while (i < n && isIdPart(src[i])) i += 1;
      t = 'id';
    } else {
      const multi = MULTI.find((op) => src.startsWith(op, i));
      i += multi ? multi.length : 1;
      t = 'op';
    }
    const token = { t, v: src.slice(start, i), s: start, e: i, nl };
    if (slashDoc) { doc = cleanSlashDoc(slashDoc); slashDoc = null; }
    if (doc !== null) { if (doc) token.doc = doc; doc = null; }
    tokens.push(token);
    nl = false;
  }
  return tokens;
}

/** End offset of the string literal starting at i. */
function skipString(src, i) {
  const n = src.length;
  let verbatim = false;
  while (src[i] === '@' || src[i] === '$') { if (src[i] === '@') verbatim = true; i += 1; }
  const q = src[i];
  if (q === '"' && src.startsWith('"""', i)) { // Java text block / C# raw string
    const end = src.indexOf('"""', i + 3);
    return end < 0 ? n : end + 3;
  }
  i += 1;
  let depth = 0;
  while (i < n) {
    const ch = src[i];
    if (verbatim) {
      if (ch === '"') { if (src[i + 1] === '"') { i += 2; continue; } return i + 1; }
      i += 1;
      continue;
    }
    if (ch === '\\') { i += 2; continue; }
    if (q === '`') {
      if (ch === '$' && src[i + 1] === '{') { depth += 1; i += 2; continue; }
      if (ch === '}' && depth > 0) { depth -= 1; i += 1; continue; }
      if (ch === '`' && depth === 0) return i + 1;
      if (ch === '`' && depth > 0) { i = skipString(src, i); continue; }
      i += 1;
      continue;
    }
    if (ch === q) return i + 1;
    if (ch === '\n') return i; // unterminated: stop at the line end
    i += 1;
  }
  return n;
}

function cleanBlockDoc(text) {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/^\s*\*\s?/, '').trimEnd());
  const out = [];
  for (const line of lines) {
    if (/^\s*@\w+/.test(line)) break; // @param, @return …: not part of the description
    out.push(line);
  }
  return out.join('\n').trim();
}

function cleanSlashDoc(lines) {
  const text = lines.map((l) => l.replace(/^ ?/, '')).join('\n');
  const summary = /<summary>([\s\S]*?)<\/summary>/.exec(text);
  return (summary ? summary[1] : text.replace(/<[^>]+>/g, '')).split('\n').map((l) => l.trim()).join('\n').trim();
}

// ───────────────────────── shared: cursor

const CLOSE = { '(': ')', '[': ']', '{': '}', '<': '>' };

export class Cursor {
  constructor(tokens, src) { this.toks = tokens; this.src = src; this.i = 0; }
  get done() { return this.i >= this.toks.length; }
  peek(k = 0) { return this.toks[this.i + k] ?? null; }
  is(v, k = 0) { const t = this.toks[this.i + k]; return Boolean(t) && t.t !== 'str' && t.v === v; }
  isId(k = 0) { return this.toks[this.i + k]?.t === 'id'; }
  next() { return this.toks[this.i++] ?? null; }
  eat(v) { if (this.is(v)) { this.i += 1; return true; } return false; }
  /** Source text of tokens [from, to), whitespace collapsed. */
  text(from, to = this.i) {
    if (to <= from) return '';
    return this.src.slice(this.toks[from].s, this.toks[to - 1].e).replace(/\s+/g, ' ').trim();
  }
  /**
   * At an opener ( [ { <: moves past its matching closer. An opener that is
   * never closed (broken source) is skipped alone so that the rest of the
   * file is still parsed.
   */
  skipBalanced() {
    const start = this.i;
    const open = this.peek()?.v;
    const close = CLOSE[open];
    if (!close) { this.next(); return false; }
    let depth = 0;
    while (!this.done) {
      const t = this.next();
      if (t.t !== 'op') continue;
      if (t.v === open) depth += 1;
      else if (t.v === close) { depth -= 1; if (depth === 0) return true; }
    }
    this.i = start + 1;
    return false;
  }
  /** Moves to the next token in `stops` at bracket depth 0 (not consumed); ( [ { are balanced. */
  skipUntil(stops) {
    while (!this.done) {
      const t = this.peek();
      if (t.t === 'op' && stops.includes(t.v)) return t.v;
      if (t.t === 'op' && (t.v === '(' || t.v === '[' || t.v === '{')) this.skipBalanced();
      else if (t.t === 'op' && (t.v === ')' || t.v === ']' || t.v === '}')) return t.v;
      else this.next();
    }
    return null;
  }
  /** Skips a statement or member that was not understood: up to ';' (consumed) or a block, or the enclosing '}'. */
  recover() {
    while (!this.done) {
      const t = this.peek();
      if (t.t === 'op' && t.v === ';') { this.next(); return; }
      if (t.t === 'op' && t.v === '}') return;
      if (t.t === 'op' && t.v === '{') { this.skipBalanced(); if (this.is(';')) this.next(); return; }
      if (t.t === 'op' && (t.v === '(' || t.v === '[')) this.skipBalanced();
      else this.next();
    }
  }
  /** If the '<' at offset k starts a type argument list (only type-like tokens), the index after its '>'; else -1. */
  angleEnd(k = 0) {
    let depth = 0;
    for (let j = this.i + k; j < this.toks.length; j += 1) {
      const t = this.toks[j];
      if (t.v === '<' && t.t === 'op') depth += 1;
      else if (t.v === '>' && t.t === 'op') { depth -= 1; if (depth === 0) return j + 1; } else if (!(t.t === 'id' || [',', '.', '?', '[', ']', '&', '*', '::'].includes(t.v))) return -1;
    }
    return -1;
  }
}

/** Splits tokens [from, to) at depth-0 commas → arrays of [start, end) index pairs. */
export function splitTop(toks, from, to, { angles = true } = {}) {
  const parts = [];
  let depth = 0;
  let start = from;
  for (let j = from; j < to; j += 1) {
    const t = toks[j];
    if (t.t !== 'op') continue;
    if (t.v === '(' || t.v === '[' || t.v === '{' || (angles && t.v === '<')) depth += 1;
    else if (t.v === ')' || t.v === ']' || t.v === '}' || (angles && t.v === '>')) depth -= 1;
    else if (t.v === '=>' && angles) { /* arrow inside a type: not a closer */ } else if (t.v === ',' && depth === 0) { parts.push([start, j]); start = j + 1; }
  }
  if (to > start) parts.push([start, to]);
  return parts;
}

/** "Map< String ,List<X> >" → "Map<String, List<X>>". */
export function normType(text) {
  return String(text ?? '').replace(/\s+/g, ' ').replace(/\s*=>\s*/g, '\u0001').replace(/\s*([<>[\],.])\s*/g, '$1').replace(/,/g, ', ')
    .replace(/\u0001/g, ' => ').replace(/\s*\?$/, '?').trim();
}

/** Index of the token after the ')' matching the '(' at index `open`. */
export function closeParen(toks, open) {
  let depth = 0;
  for (let j = open; j < toks.length; j += 1) {
    const t = toks[j];
    if (t.t !== 'op') continue;
    if (t.v === '(') depth += 1;
    else if (t.v === ')') { depth -= 1; if (depth === 0) return j + 1; }
  }
  return toks.length;
}

// ───────────────────────── Java

const MODIFIERS = new Set(['public', 'protected', 'private', 'static', 'abstract', 'final', 'native', 'synchronized', 'transient', 'volatile', 'strictfp', 'default', 'sealed']);
const TYPE_KEYWORDS = new Set(['class', 'interface', 'enum', 'record']);

/** Parses one Java source → { package: [..], imports: [..], types: [Decl] }. */
export function parse(src) {
  const c = new Cursor(tokenize(src), src);
  const file = { package: [], imports: [], types: [] };
  while (!c.done) {
    if (c.is('package')) {
      c.next();
      const from = c.i;
      c.skipUntil([';']);
      file.package = c.text(from).replace(/\s/g, '').split('.').filter(Boolean);
      c.eat(';');
      continue;
    }
    if (c.is('import')) {
      c.next();
      c.eat('static');
      const from = c.i;
      c.skipUntil([';']);
      file.imports.push(c.text(from).replace(/\s/g, ''));
      c.eat(';');
      continue;
    }
    const decl = typeDecl(c, false);
    if (decl) file.types.push(decl);
    else if (!c.done) c.next();
  }
  return file;
}

function skipAnnotation(c) {
  c.next(); // '@'
  while (c.isId() && c.is('.', 1)) { c.next(); c.next(); }
  if (c.isId()) c.next();
  if (c.is('(')) c.skipBalanced();
}

/** Annotations and modifiers → Set of modifiers. */
function modifiers(c) {
  const mods = new Set();
  for (;;) {
    if (c.is('@') && !c.is('interface', 1)) skipAnnotation(c);
    else if (c.isId() && MODIFIERS.has(c.peek().v) && !c.is('(', 1)) mods.add(c.next().v);
    else if (c.is('non') && c.is('-', 1) && c.is('sealed', 2)) { c.next(); c.next(); c.next(); } else break;
  }
  return mods;
}

const visibilityOf = (mods, fallback) => (mods.has('public') ? 'public' : mods.has('protected') ? 'protected' : mods.has('private') ? 'private' : fallback);

/** A type declaration at the cursor (after optional doc/annotations/modifiers), or null (cursor unchanged). */
function typeDecl(c, inInterface) {
  const start = c.i;
  const doc = c.peek()?.doc ?? '';
  const mods = modifiers(c);
  let kind = null;
  if (c.is('@') && c.is('interface', 1)) { c.next(); c.next(); kind = 'annotation'; } else if (c.isId() && TYPE_KEYWORDS.has(c.peek().v) && c.isId(1)) kind = c.next().v;
  if (!kind) { c.i = start; return null; }
  const decl = newDecl(kind === 'annotation' ? 'interface' : kind === 'record' ? 'class' : kind, c.next().v, doc);
  decl.visibility = visibilityOf(mods, inInterface ? 'public' : 'package');
  decl.isAbstract = mods.has('abstract');
  decl.isFinal = mods.has('final') || kind === 'record';
  decl.isStatic = mods.has('static');
  if (c.is('<')) decl.templateParams = typeParams(c);
  if (kind === 'record' && c.is('(')) {
    for (const p of params(c)) decl.fields.push({ name: p.name, type: p.type, visibility: 'private', isStatic: false, isFinal: true, defaultValue: '', doc: '' });
  }
  while (!c.done && !c.is('{') && !c.is(';')) {
    if (c.is('extends')) { c.next(); decl.extends.push(...typeList(c)); } else if (c.is('implements')) { c.next(); decl.implements.push(...typeList(c)); } else if (c.is('permits')) { c.next(); typeList(c); } else c.next();
  }
  if (c.is('{')) body(c, decl, kind);
  else c.eat(';');
  return decl;
}

export function newDecl(kind, name, doc = '') {
  return { kind, name, visibility: 'public', isAbstract: false, isFinal: false, isStatic: false, doc, templateParams: [], extends: [], implements: [], bases: [], fields: [], methods: [], literals: [], nested: [] };
}

/** "<T extends A & B, U>" → [{ name, bound }]. */
export function typeParams(c) {
  const open = c.i;
  c.skipBalanced();
  const out = [];
  for (const [a, b] of splitTop(c.toks, open + 1, c.i - 1)) {
    const toks = c.toks.slice(a, b);
    const name = toks.find((t) => t.t === 'id' && !['in', 'out', 'reified'].includes(t.v))?.v;
    if (!name) continue;
    const at = toks.findIndex((t) => t.v === 'extends' || t.v === ':');
    const eq = toks.findIndex((t) => t.v === '=');
    const bound = at >= 0 ? c.text(a + at + 1, eq > at ? a + eq : b) : '';
    out.push({ name, bound: normType(bound) });
  }
  return out;
}

/** Comma-separated types up to '{', ';' or a keyword. */
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

/** A type at the cursor ("java.util.List<Foo>[]", "String...") or '' (cursor unchanged). */
export function parseType(c) {
  const from = c.i;
  while (c.is('@')) skipAnnotation(c);
  if (!c.isId()) { c.i = from; return ''; }
  const typeFrom = c.i;
  c.next();
  for (;;) {
    if (c.is('<')) c.skipBalanced();
    if (c.is('.') && c.isId(1)) { c.next(); c.next(); continue; }
    break;
  }
  while (c.is('[') && c.is(']', 1)) { c.next(); c.next(); }
  if (c.is('...')) c.next();
  return normType(c.text(typeFrom));
}

/** Parameter list at '(' → [{ name, type, defaultValue, direction }]. */
function params(c) {
  const open = c.i;
  c.skipBalanced();
  const out = [];
  for (const [a, b] of splitTop(c.toks, open + 1, c.i - 1)) {
    let j = a;
    const toks = c.toks;
    while (j < b && (toks[j].v === '@' || toks[j].v === 'final')) {
      if (toks[j].v === 'final') { j += 1; continue; }
      j += 1;
      while (j < b && toks[j].t === 'id' && toks[j + 1]?.v === '.') j += 2;
      j += 1;
      if (toks[j]?.v === '(') j = closeParen(toks, j);
    }
    let end = b;
    while (end > j && toks[end - 1].v === ']' && toks[end - 2]?.v === '[') end -= 2; // int a[]
    const nameTok = toks[end - 1];
    if (!nameTok || nameTok.t !== 'id' || end - 1 <= j) continue;
    let type = normType(c.text(j, end - 1));
    if (end < b) type += '[]';
    out.push({ name: nameTok.v, type, defaultValue: '', direction: 'in' });
  }
  return out;
}

function body(c, decl, kind) {
  c.next(); // '{'
  if (kind === 'enum') enumConstants(c, decl);
  const inInterface = decl.kind === 'interface';
  while (!c.done && !c.is('}')) {
    if (c.eat(';')) continue;
    const start = c.i;
    const doc = c.peek()?.doc ?? '';
    const mods = modifiers(c);
    if (c.is('{')) { c.skipBalanced(); continue; } // initializer block
    if ((c.isId() && TYPE_KEYWORDS.has(c.peek().v) && c.isId(1)) || (c.is('@') && c.is('interface', 1))) {
      c.i = start;
      const nested = typeDecl(c, inInterface);
      if (nested) { decl.nested.push(nested); continue; }
      c.i = start;
      c.recover();
      continue;
    }
    const tparams = c.is('<') ? typeParams(c) : [];
    const visibility = visibilityOf(mods, inInterface ? 'public' : 'package');
    if (c.isId() && c.is('(', 1) && c.peek().v === decl.name) { // constructor
      c.next();
      const ps = params(c);
      const thrown = throwsList(c);
      if (c.is('{')) c.skipBalanced(); else c.eat(';');
      decl.methods.push({ name: decl.name, visibility, isStatic: false, isAbstract: false, isFinal: false, params: ps, returnType: '', doc, templateParams: tparams, isConstructor: true, throws: thrown });
      continue;
    }
    const type = parseType(c);
    if (!type || !c.isId()) { c.i = start; c.next(); c.recover(); continue; }
    const name = c.next().v;
    if (c.is('(')) {
      const ps = params(c);
      let returnType = type;
      while (c.is('[') && c.is(']', 1)) { c.next(); c.next(); returnType += '[]'; }
      const thrown = throwsList(c);
      if (c.is('default')) { c.next(); c.skipUntil([';']); }
      const hasBody = c.is('{');
      if (hasBody) c.skipBalanced(); else c.eat(';');
      decl.methods.push({
        name, visibility, isStatic: mods.has('static'), isAbstract: mods.has('abstract') || (inInterface && !hasBody && !mods.has('static')),
        isFinal: mods.has('final'), params: ps, returnType: returnType === 'void' ? '' : returnType, doc, templateParams: tparams, isConstructor: false, throws: thrown,
      });
      continue;
    }
    // Fields: "int a = 1, b[], c;"
    let fieldName = name;
    for (;;) {
      let fieldType = type;
      while (c.is('[') && c.is(']', 1)) { c.next(); c.next(); fieldType += '[]'; }
      let defaultValue = '';
      if (c.eat('=')) defaultValue = initializer(c);
      decl.fields.push({
        name: fieldName, type: fieldType, visibility, isStatic: mods.has('static') || inInterface, isFinal: mods.has('final') || inInterface,
        defaultValue, doc,
      });
      if (c.eat(',') && c.isId()) { fieldName = c.next().v; continue; }
      break;
    }
    if (!c.eat(';')) c.recover();
  }
  c.eat('}');
}

/** "throws A, B" → ['A', 'B']. */
function throwsList(c) {
  if (!c.eat('throws')) return [];
  return typeList(c);
}

/** An initializer expression up to ',' or ';' at depth 0 (generic arguments skipped). */
export function initializer(c) {
  const from = c.i;
  while (!c.done) {
    const t = c.peek();
    if (t.t === 'op') {
      if (t.v === ',' || t.v === ';' || t.v === '}' || t.v === ')') break;
      if (t.v === '(' || t.v === '[' || t.v === '{') { c.skipBalanced(); continue; }
      if (t.v === '<') { const end = c.angleEnd(); if (end > 0) { c.i = end; continue; } }
    }
    c.next();
  }
  return c.text(from);
}

/** Enum constants up to ';' or '}'. */
function enumConstants(c, decl) {
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
