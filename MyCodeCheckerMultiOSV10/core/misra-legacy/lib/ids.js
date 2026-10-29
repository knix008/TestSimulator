'use strict';

// Identifier collections across a project (MISRA C:2004 chapter 5, C++:2008 2-10-x).

const U = require('./util');

const { M } = U;

const KINDS = new Set(['variable', 'parameter', 'function', 'typedef', 'tag', 'enumerator', 'label', 'field', 'namespace']);

function declOf(s) {
  const d = s.definition || (s.decls && s.decls[0]);
  return d || null;
}
function locOf(s) {
  const d = declOf(s);
  return d ? (d.nameLoc || d.loc) : null;
}

// Entity identity: external-linkage entities are one entity across units.
function entityKey(s) {
  if (s.linkage === 'external' && (s.kind === 'function' || s.kind === 'variable')) return `ext|${s.qname || s.name}`;
  const l = locOf(s);
  return `${s.kind}|${s.qname || s.name}|${l ? `${l.file}:${l.line}:${l.col}` : s.id}`;
}

function isUserSym(s) {
  if (!s || s.system || s.predefined || s.implicit || !s.name) return false;
  if (s.kind === 'templateParam') return false;
  const d = declOf(s);
  return !!(d && d.loc && !U.isBuiltin(d.loc.file));
}

// [{ sym, key, unit, loc }] of every user identifier of the project, deduplicated by entity.
const CACHE = new WeakMap();
function entities(project) {
  const real = project;
  let res = CACHE.get(real.units || real);
  if (res) return res;
  res = [];
  const seen = new Set();
  for (const unit of project.units || []) {
    for (const s of unit.symbols || []) {
      if (!KINDS.has(s.kind) || !isUserSym(s)) continue;
      if (s.implicit || (s.kind === 'function' && s.name.startsWith('operator'))) continue;
      const key = entityKey(s);
      if (seen.has(key)) continue;
      seen.add(key);
      const loc = locOf(s);
      if (!loc) continue;
      res.push({ sym: s, key, unit, loc, name: s.name });
    }
  }
  res.sort((a, b) => (a.loc.file === b.loc.file ? (a.loc.line - b.loc.line) || (a.loc.col - b.loc.col) : (a.loc.file < b.loc.file ? -1 : 1)));
  CACHE.set(real.units || real, res);
  return res;
}

function staticStorage(s) {
  if (s.kind === 'function') return !s.member;
  return s.kind === 'variable' && s.storage === 'static' && !s.member;
}

const ORDINARY = new Set(['variable', 'parameter', 'function', 'typedef', 'enumerator']);

// Identifiers that are equal in their first `n` characters but differ after.
function significance(project, api, n) {
  const first = new Map();
  for (const e of entities(project)) {
    if (e.sym.kind === 'label' || e.name.length <= n) continue;
    const p = e.name.slice(0, n);
    const prev = first.get(p);
    if (!prev) { first.set(p, e); continue; }
    if (prev.name !== e.name) {
      api.report(e.loc, M(`'${e.name}' and '${prev.name}' are the same in their first ${n} characters.`, `'${e.name}'와 '${prev.name}'는 처음 ${n}자가 같습니다.`));
    }
  }
}

// Names of static-storage objects and functions reused by any other identifier.
function staticReuse(project, api) {
  const all = entities(project);
  const owners = new Map();
  for (const e of all) if (staticStorage(e.sym) && !owners.has(e.name)) owners.set(e.name, e);
  for (const e of all) {
    const o = owners.get(e.name);
    if (!o || o.key === e.key || e.sym.kind === 'label') continue;
    // the owner itself reported once against the second user
    api.report(e.loc, M(`'${e.name}' reuses the name of an object or function with static storage duration.`, `'${e.name}'가 정적 저장 기간을 갖는 객체나 함수의 이름을 재사용합니다.`));
  }
}

// Same spelling in different C name spaces (tags, labels, ordinary identifiers).
function nameSpaces(project, api) {
  const ord = new Map();
  const tags = new Map();
  const labels = [];
  for (const e of entities(project)) {
    if (ORDINARY.has(e.sym.kind)) { if (!ord.has(e.name)) ord.set(e.name, e); }
    else if (e.sym.kind === 'tag') { if (!tags.has(e.name)) tags.set(e.name, e); }
    else if (e.sym.kind === 'label') labels.push(e);
  }
  for (const [name, t] of tags) {
    const o = ord.get(name);
    if (o && o.sym.kind !== 'typedef') {
      const later = o.loc.line >= t.loc.line ? o : t;
      api.report(later.loc, M(`'${name}' is used both as a tag and as an ordinary identifier.`, `'${name}'를 태그와 일반 식별자로 함께 사용했습니다.`));
    } else if (o && o.sym.kind === 'typedef' && o.loc.file !== t.loc.file) {
      api.report(o.loc, M(`'${name}' is used both as a tag and as a typedef name.`, `'${name}'를 태그와 typedef 이름으로 함께 사용했습니다.`));
    }
  }
  for (const l of labels) {
    if (ord.has(l.name) || tags.has(l.name)) api.report(l.loc, M(`Label '${l.name}' has the same spelling as another identifier.`, `레이블 '${l.name}'의 철자가 다른 식별자와 같습니다.`));
  }
}

function sameTagKind(a, b) {
  const x = U.canon(a.type), y = U.canon(b.type);
  return !!(x && y && x.kind === y.kind && (x.tag || '') === (y.tag || ''));
}

// Any identifier name used for two different entities.
function reuse(project, api) {
  const first = new Map();
  for (const e of entities(project)) {
    if (e.sym.kind === 'field') continue;
    const prev = first.get(e.name);
    if (!prev) { first.set(e.name, e); continue; }
    if (prev.key === e.key) continue;
    // a struct tag and its typedef of the same name are one declaration in practice
    if ((prev.sym.kind === 'tag' && e.sym.kind === 'typedef') || (prev.sym.kind === 'typedef' && e.sym.kind === 'tag')) continue;
    // `struct S *p;` or `struct S;` refers to the tag declared elsewhere (one type)
    if (prev.sym.kind === 'tag' && e.sym.kind === 'tag' && !(prev.sym.definition && e.sym.definition) && sameTagKind(prev.sym, e.sym)) continue;
    api.report(e.loc, M(`The identifier '${e.name}' is reused.`, `식별자 '${e.name}'를 재사용했습니다.`));
  }
}

module.exports = {
  significance, staticReuse, nameSpaces, reuse, entities, entityKey, isUserSym, locOf, staticStorage, ORDINARY };
