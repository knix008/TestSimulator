'use strict';

// MISRA C:2012 / 2023 chapter 5: identifiers.
// Significant-character limits come from options.misra.significantExternal
// (default 31, the C99 minimum) and options.misra.significantInternal
// (default 63); macro names use the internal limit.

const U = require('../lib/a-util');
const { meta, msg } = U;

function limits(api) {
  const o = U.misraOpts(api);
  return { ext: Number(o.significantExternal) || 31, int: Number(o.significantInternal) || 63, extCase: !!o.externalCaseInsensitive };
}
const at = (s) => { const l = U.symLoc(s); return l ? `${l.file}:${l.line}` : '?'; };
const nsOf = (s) => (s.kind === 'tag' ? 'tag' : s.kind === 'label' ? 'label' : s.kind === 'field' ? 'member' : 'ordinary');

// every user symbol in the project, one entry per declared entity
function allSymbols(project) {
  const m = new Map();
  for (const u of project.units) {
    for (const s of u.symbols) {
      if (!U.isUserSym(s) || !s.name || s.name === '__func__') continue;
      const k = s.linkage === 'external' ? `ext|${s.kind}|${s.qname}` : U.symKey(s);
      if (!m.has(k)) m.set(k, { key: k, sym: s, unit: u });
    }
  }
  return [...m.values()];
}
const ALL = new WeakMap();
function symbolsOf(project) {
  let a = ALL.get(project);
  if (!a) ALL.set(project, (a = allSymbols(project)));
  return a;
}
function byName(list) {
  const m = new Map();
  for (const e of list) {
    let a = m.get(e.sym.name);
    if (!a) m.set(e.sym.name, (a = []));
    a.push(e);
  }
  return m;
}

// Report pairs of names that differ but agree in the first `n` characters.
function prefixClashes(items, n, nameOf, cb, fold) {
  const groups = new Map();
  for (const it of items) {
    const name = nameOf(it);
    if (name.length <= n && !fold) continue;
    const key = (fold ? name.toLowerCase() : name).slice(0, n);
    let a = groups.get(key);
    if (!a) groups.set(key, (a = []));
    a.push(it);
  }
  for (const a of groups.values()) {
    const names = [...new Set(a.map(nameOf))];
    if (names.length < 2) continue;
    const first = a[0];
    for (const it of a) if (nameOf(it) !== nameOf(first)) cb(it, first);
  }
}

function r51(project, api) {
  const L = limits(api);
  const ext = symbolsOf(project).filter((e) => e.sym.linkage === 'external' && (e.sym.kind === 'function' || e.sym.kind === 'variable'));
  prefixClashes(ext, L.ext, (e) => e.sym.name, (e, first) => {
    api.report(U.symLoc(e.sym), msg(
      `External identifier '${e.sym.name}' is not distinct from '${first.sym.name}' (${at(first.sym)}) within the first ${L.ext} characters.`,
      `외부 식별자 '${e.sym.name}'가 처음 ${L.ext}자 안에서 '${first.sym.name}'(${at(first.sym)})와 구별되지 않습니다.`));
  }, L.extCase);
}

const SCOPE_IDS = new WeakMap();
let scopeCounter = 0;
function scopeSerial(scope) {
  let id = SCOPE_IDS.get(scope);
  if (id == null) SCOPE_IDS.set(scope, (id = `#${++scopeCounter}`));
  return id;
}

function r52(project, api) {
  const L = limits(api);
  const groups = new Map();
  for (const e of symbolsOf(project)) {
    const s = e.sym;
    const scopeId = s.scope ? (s.scope.kind === 'file' ? `file|${e.unit.file}` : `scope|${s.scope.node && s.scope.node.loc ? U.locKey(s.scope.node.loc) : scopeSerial(s.scope)}`) : '?';
    const k = `${scopeId}|${nsOf(s)}`;
    let a = groups.get(k);
    if (!a) groups.set(k, (a = []));
    a.push(e);
  }
  for (const a of groups.values()) {
    prefixClashes(a, L.int, (e) => e.sym.name, (e, first) => {
      api.report(U.symLoc(e.sym), msg(
        `'${e.sym.name}' is not distinct from '${first.sym.name}' in the same scope within the first ${L.int} characters.`,
        `'${e.sym.name}'가 같은 범위에서 처음 ${L.int}자 안에 '${first.sym.name}'와 구별되지 않습니다.`));
    });
  }
}

function before(outer, inner) {
  const a = U.symLoc(outer), b = U.symLoc(inner);
  if (!a || !b) return false;
  if (a.file === b.file) return (a.start != null ? a.start : a.line) < (b.start != null ? b.start : b.line);
  return true;
}

function r53(unit, api) {
  for (const s of unit.symbols) {
    if (!U.isUserSym(s) || !s.scope || s.scope.kind === 'file' || s.scope.kind === 'prototype' || s.scope.kind === 'class' || s.scope.kind === 'enum') continue;
    if (s.name === '__func__' || s.kind === 'label') continue;
    const tag = s.kind === 'tag';
    for (let sc = s.scope.parent; sc; sc = sc.parent) {
      if (sc.kind === 'prototype' || sc.kind === 'class') continue;
      const o = (tag ? sc.tags : sc.names) && (tag ? sc.tags : sc.names).get(s.name);
      if (o && o !== s && o.kind !== 'label' && !o.system && before(o, s)) {
        const d = s.decls && s.decls[0];
        if (d && !U.userLoc(d)) break;
        api.report(U.symLoc(s), msg(
          `'${s.name}' hides the ${o.kind === 'tag' ? 'tag' : o.kind} '${s.name}' declared in an outer scope (${at(o)}).`,
          `'${s.name}'가 바깥 범위(${at(o)})에 선언된 같은 이름을 가립니다.`));
        break;
      }
    }
  }
}

function userMacros(unit) {
  return (unit.macros || []).filter((m) => !U.isBuiltin(m.file) && !m.predefined && !m.commandLine);
}

function r54(unit, api) {
  const L = limits(api);
  const ms = userMacros(unit);
  const uniq = new Map();
  for (const m of ms) if (!uniq.has(m.name)) uniq.set(m.name, m);
  prefixClashes([...uniq.values()], L.int, (m) => m.name, (m, first) => {
    api.report({ file: m.file, line: m.line, col: m.col }, msg(
      `Macro '${m.name}' is not distinct from macro '${first.name}' within the first ${L.int} characters.`,
      `매크로 '${m.name}'가 처음 ${L.int}자 안에서 매크로 '${first.name}'와 구별되지 않습니다.`));
  });
  for (const m of ms) {
    if (m.kind !== 'function' || !m.params || m.params.length < 2) continue;
    prefixClashes(m.params.map((p) => ({ p })), L.int, (x) => x.p, (x, first) => {
      api.report({ file: m.file, line: m.line, col: m.col }, msg(
        `Parameter '${x.p}' of macro '${m.name}' is not distinct from '${first.p}' within the first ${L.int} characters.`,
        `매크로 '${m.name}'의 매개변수 '${x.p}'가 처음 ${L.int}자 안에서 '${first.p}'와 구별되지 않습니다.`));
    });
  }
}

function r55(unit, api) {
  const L = limits(api);
  const names = new Map();
  for (const m of userMacros(unit)) {
    names.set(m.name, m);
    if (m.name.length > L.int) names.set('\u0000' + m.name.slice(0, L.int), m);
  }
  if (!names.size) return;
  for (const s of unit.symbols) {
    if (!U.isUserSym(s) || !s.name) continue;
    const m = names.get(s.name) || (s.name.length > L.int ? names.get('\u0000' + s.name.slice(0, L.int)) : null);
    if (!m) continue;
    api.report(U.symLoc(s), msg(
      `Identifier '${s.name}' is the same as macro '${m.name}' (${m.file}:${m.line}).`,
      `식별자 '${s.name}'가 매크로 '${m.name}'(${m.file}:${m.line})와 같습니다.`));
  }
}

// The typedef `td` names the tag symbol `tag`
function typedefNamesTag(td, tag) {
  const c = U.canon(td.type);
  const tt = U.canon(tag.type);
  return !!(c && tt && (c === tt || (c.decl && tt.decl && c.decl === tt.decl) || (c.kind === tt.kind && c.name === tt.name && c.name)));
}

function uniqueness(project, api, pick, en, ko, exempt) {
  const all = symbolsOf(project);
  const names = byName(all);
  for (const e of all) {
    if (!pick(e.sym)) continue;
    for (const o of names.get(e.sym.name) || []) {
      if (o === e || o.key === e.key) continue;
      if (exempt && exempt(e.sym, o.sym)) continue;
      api.report(U.symLoc(o.sym), msg(en(e.sym, o.sym), ko(e.sym, o.sym)));
    }
  }
}

function r56(project, api) {
  uniqueness(project, api, (s) => s.kind === 'typedef',
    (s, o) => `Identifier '${o.name}' reuses the typedef name '${s.name}' declared at ${at(s)}.`,
    (s, o) => `식별자 '${o.name}'가 ${at(s)}에 선언된 typedef 이름 '${s.name}'를 다시 씁니다.`,
    (s, o) => (o.kind === 'tag' && typedefNamesTag(s, o)) || (o.kind === 'typedef' && typedefNamesTag(s, o) && U.typeStr(s.type) === U.typeStr(o.type) && false));
}

function r57(project, api) {
  uniqueness(project, api, (s) => s.kind === 'tag',
    (s, o) => `Identifier '${o.name}' reuses the tag name '${s.name}' declared at ${at(s)}.`,
    (s, o) => `식별자 '${o.name}'가 ${at(s)}에 선언된 태그 이름 '${s.name}'를 다시 씁니다.`,
    (s, o) => (o.kind === 'typedef' && typedefNamesTag(o, s)) || sameTagReference(s, o));
}

// Two declarations of one tag where at least one only refers to it (`struct
// timeval *tv;`, `struct S;`) name the same type, e.g. one from a header in
// several files: only two definitions of the tag are two types.
function sameTagReference(s, o) {
  if (s.kind !== 'tag' || o.kind !== 'tag' || (s.definition && o.definition)) return false;
  const a = U.canon(s.type), b = U.canon(o.type);
  return !!(a && b && a.kind === b.kind && (a.tag || '') === (b.tag || ''));
}

function r58(project, api) {
  uniqueness(project, api, (s) => s.linkage === 'external' && (s.kind === 'function' || s.kind === 'variable'),
    (s, o) => `Identifier '${o.name}' reuses the name of the external ${s.kind} declared at ${at(s)}.`,
    (s, o) => `식별자 '${o.name}'가 ${at(s)}에 선언된 외부 ${s.kind === 'function' ? '함수' : '객체'}의 이름을 다시 씁니다.`);
}

function r59(project, api) {
  uniqueness(project, api, (s) => s.linkage === 'internal' && (s.kind === 'function' || s.kind === 'variable'),
    (s, o) => `Identifier '${o.name}' reuses the name of the internal-linkage ${s.kind} declared at ${at(s)}.`,
    (s, o) => `식별자 '${o.name}'가 ${at(s)}에 선언된 내부 링크 ${s.kind === 'function' ? '함수' : '객체'}의 이름을 다시 씁니다.`,
    (s, o) => s.isInline && o.isInline && o.linkage === 'internal');
}

const B = { cat: 'R', sev: 'MAJOR', debt: 5, dec: true };
module.exports = [
  { meta: meta('5.1', { ...B, cwe: ['CWE-758'], cert: 'DCL23-C', name: ['External identifiers shall be distinct', '외부 식별자는 구별되어야 함'],
    why: ['A linker may only look at the first significant characters, so two long external names can become the same symbol.', '링커는 앞쪽의 유효 문자만 볼 수 있어 긴 외부 이름 두 개가 같은 심볼이 될 수 있습니다.'],
    fix: ['Rename so that external names differ within the significant length.', '유효 길이 안에서 외부 이름이 다르도록 이름을 바꾸세요.'] }), project: r51 },
  { meta: meta('5.2', { ...B, cert: 'DCL23-C', name: ['Identifiers in one scope and name space shall be distinct', '같은 범위·이름 공간의 식별자는 구별되어야 함'],
    why: ['Names that agree in their significant characters may be treated as the same identifier.', '유효 문자가 같은 이름은 같은 식별자로 취급될 수 있습니다.'],
    fix: ['Shorten or rename so the names differ early.', '이름이 앞부분에서 달라지도록 줄이거나 바꾸세요.'] }), project: r52 },
  { meta: meta('5.3', { ...B, cert: 'DCL01-C', name: ['Inner identifier hides an outer one', '안쪽 식별자가 바깥 식별자를 가림'],
    why: ['Hiding makes it unclear which object a name refers to.', '가리기는 이름이 어느 객체를 가리키는지 불분명하게 만듭니다.'],
    fix: ['Rename the inner identifier.', '안쪽 식별자의 이름을 바꾸세요.'] }), check: r53 },
  { meta: meta('5.4', { ...B, name: ['Macro identifiers shall be distinct', '매크로 식별자는 구별되어야 함'],
    why: ['Macro names that agree in their significant characters can be treated as the same macro.', '유효 문자가 같은 매크로 이름은 같은 매크로로 취급될 수 있습니다.'],
    fix: ['Rename the macros or their parameters.', '매크로나 매개변수의 이름을 바꾸세요.'] }), check: r54 },
  { meta: meta('5.5', { ...B, name: ['Identifiers shall be distinct from macro names', '식별자는 매크로 이름과 구별되어야 함'],
    why: ['An identifier with a macro name is replaced, or not, depending on where it appears, which is confusing.', '매크로 이름과 같은 식별자는 위치에 따라 치환되거나 안 되어 혼란스럽습니다.'],
    fix: ['Rename the identifier or the macro.', '식별자나 매크로의 이름을 바꾸세요.'] }), check: r55 },
  { meta: meta('5.6', { ...B, name: ['Typedef names shall be unique', 'typedef 이름은 고유해야 함'],
    why: ['Reusing a typedef name for something else makes code hard to read.', 'typedef 이름을 다른 것에 다시 쓰면 코드를 읽기 어렵습니다.'],
    fix: ['Give the other entity a different name.', '다른 대상에 다른 이름을 주세요.'] }), project: r56 },
  { meta: meta('5.7', { ...B, name: ['Tag names shall be unique', '태그 이름은 고유해야 함'],
    why: ['Reusing a tag name for another type or identifier causes confusion.', '태그 이름을 다른 타입이나 식별자에 다시 쓰면 혼란이 생깁니다.'],
    fix: ['Use a different name (a typedef of the same tag is allowed).', '다른 이름을 쓰세요(같은 태그의 typedef는 허용됩니다).'] }), project: r57 },
  { meta: meta('5.8', { ...B, name: ['External linkage identifiers shall be unique', '외부 링크 식별자는 고유해야 함'],
    why: ['Reusing the name of an external object or function elsewhere invites mixing them up.', '외부 객체나 함수의 이름을 다른 곳에 다시 쓰면 혼동하기 쉽습니다.'],
    fix: ['Rename the other identifier.', '다른 식별자의 이름을 바꾸세요.'] }), project: r58 },
  { meta: meta('5.9', { ...B, cat: 'A', sev: 'MINOR', name: ['Internal linkage identifiers should be unique', '내부 링크 식별자는 고유해야 함'],
    why: ['Reusing the name of a static object or function elsewhere invites mixing them up.', 'static 객체나 함수의 이름을 다른 곳에 다시 쓰면 혼동하기 쉽습니다.'],
    fix: ['Rename the other identifier.', '다른 식별자의 이름을 바꾸세요.'] }), project: r59 },
];
