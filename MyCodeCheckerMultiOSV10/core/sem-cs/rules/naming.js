'use strict';

// Naming conventions (sonar-dotnet naming family plus the .NET design
// guidelines on suffixes, prefixes and casing).

const { R } = require('../registry');
const { hasMod, attrNamed } = require('../ast');
const U = require('../util');
const T = require('../types');

// ───────────────────────────────────────── helpers
const INTEROP_ATTRS = ['DllImport', 'LibraryImport', 'ComImport', 'StructLayout', 'Guid', 'InterfaceType'];

// the name is dictated by a base type, an interface or native code
function dictated(m) {
  if (!m) return false;
  if (hasMod(m, 'override') || hasMod(m, 'extern') || m.iface) return true;
  if (attrNamed(m.attrs, INTEROP_ATTRS)) return true;
  return false;
}

function ownerOf(m) {
  if (m.owner) return m.owner;
  return U.typeDeclOf(m);
}

function interopType(td) {
  for (let t = td; t; t = t.outer || null) {
    if (attrNamed(t.attrs, INTEROP_ATTRS)) return true;
    if (/Native|Interop|Win32|PInvoke|Unsafe/.test(t.name || '')) return true;
  }
  return false;
}

function fileHasInterop(pf) {
  if (pf._nmInterop !== undefined) return pf._nmInterop;
  pf._nmInterop = (pf.byKind.get('Attribute') || []).some((a) => a.name === 'DllImport' || a.name === 'LibraryImport');
  return pf._nmInterop;
}

function accessOf(m, owner) {
  const mods = m.mods && m.mods.has ? m.mods : new Set();
  if (owner && owner.kind === 'interface') return 'public';
  if (mods.has('public')) return 'public';
  if (mods.has('protected')) return 'protected';
  if (mods.has('internal')) return 'internal';
  return 'private';
}

function isTestish(m, pf) {
  return U.isTestMethod(m) || U.isTestFile(pf);
}

function typeLabel(td) {
  if (td.k === 'Delegate') return { en: 'delegate', ko: '대리자' };
  switch (td.kind) {
    case 'interface': return { en: 'interface', ko: '인터페이스' };
    case 'struct': case 'record struct': return { en: 'struct', ko: '구조체' };
    case 'enum': return { en: 'enum', ko: '열거형' };
    case 'record': return { en: 'record', ko: '레코드' };
    default: return { en: 'class', ko: '클래스' };
  }
}

function memberLabel(m) {
  switch (m.k) {
    case 'Property': return { en: 'property', ko: '속성' };
    case 'Event': return { en: 'event', ko: '이벤트' };
    case 'LocalFunc': return { en: 'local function', ko: '지역 함수' };
    case 'Field': return { en: 'field', ko: '필드' };
    default: return { en: 'method', ko: '메서드' };
  }
}

function isBoolType(t) { return !!t && !t.ranks && (t.name === 'bool' || t.name === 'Boolean'); }

const CAMEL = /^[a-z][A-Za-z0-9]*$/;
const allUnderscore = (n) => /^_+$/.test(n);

// variables declared inside function bodies: [{ node, name, atName, type }]
function localDecls(pf, cx) {
  const out = [];
  for (const d of pf.byKind.get('LocalDecl') || []) {
    if (d.isConst) continue;
    for (const v of d.vars) out.push({ node: v, name: v.name, atName: false, type: T.symType(v.sym, cx.project) });
  }
  for (const f of pf.byKind.get('Foreach') || []) if (f.name) out.push({ node: f, name: f.name, atName: true, type: T.symType(f.sym, cx.project) });
  for (const c of pf.byKind.get('Catch') || []) if (c.name) out.push({ node: c, name: c.name, atName: false, type: null, line: c.nameLine });
  for (const p of pf.byKind.get('DeclPattern') || []) if (p.name && p.name !== '_') out.push({ node: p, name: p.name, atName: true, type: T.fromTypeNode(p.type) });
  for (const s of pf.byKind.get('SingleDesignation') || []) if (!s.discard && s.name) out.push({ node: s, name: s.name, atName: false, type: s.sym ? T.symType(s.sym, cx.project) : null });
  return out;
}

function paramDecls(pf) {
  const out = [];
  for (const p of pf.byKind.get('Param') || []) {
    if (!p.name || p.name === '__arglist') continue;
    const par = p.parent;
    if (!par) continue;
    if (par.k === 'TypeDecl' && (par.kind === 'record' || par.kind === 'record struct')) continue;
    if (dictated(par)) continue;
    out.push(p);
  }
  return out;
}

function reportVar(cx, d, en, ko) {
  if (d.line && d.line !== d.node.line) cx.report({ line: d.line, col: d.node.col }, en, ko);
  else cx.report(d.node, en, ko, d.atName ? { atName: true } : undefined);
}

// ───────────────────────────────────────── casing
R('type-naming', 'S101', 'S', 'MI', 5, ['convention'],
  ['Type names should use PascalCase', 'Types in .NET are named in PascalCase; a type starting with a lower-case letter or an underscore reads like a variable.', 'Rename the type so that it starts with an upper-case letter.'],
  ['타입 이름은 PascalCase여야 합니다', '.NET 타입은 PascalCase로 이름을 짓습니다. 소문자나 밑줄로 시작하는 타입은 변수처럼 읽힙니다.', '대문자로 시작하도록 타입 이름을 바꾸세요.'],
  { kinds: {
    TypeDecl(n, cx) { checkTypeCase(n, cx); },
    Delegate(n, cx) { checkTypeCase(n, cx); },
  } });
function checkTypeCase(n, cx) {
  if (!n.name || /^[A-Z]/.test(n.name)) return;
  if (interopType(n)) return;
  const l = typeLabel(n);
  cx.report(n, `Rename ${l.en} '${n.name}' to match PascalCase.`, `${l.ko} '${n.name}'의 이름을 PascalCase로 바꾸세요.`, { atName: true });
}

R('method-naming', 'S100', 'S', 'MI', 5, ['convention'],
  ['Methods, properties and events should use PascalCase', 'Members are named in PascalCase in .NET; a lower-case name looks like a local variable or a field.', 'Rename the member so that it starts with an upper-case letter.'],
  ['메서드, 속성, 이벤트 이름은 PascalCase여야 합니다', '.NET 멤버는 PascalCase로 이름을 짓습니다. 소문자 이름은 지역 변수나 필드처럼 보입니다.', '대문자로 시작하도록 멤버 이름을 바꾸세요.'],
  { kinds: {
    Method(n, cx) { checkMemberCase(n, cx); },
    Property(n, cx) { checkMemberCase(n, cx); },
    Event(n, cx) { checkMemberCase(n, cx); },
    LocalFunc(n, cx) { checkMemberCase(n, cx); },
  } });
function checkMemberCase(n, cx) {
  if (!n.name || /^[A-Z]/.test(n.name) || allUnderscore(n.name)) return;
  if (dictated(n) || isTestish(n, cx.pf)) return;
  const owner = ownerOf(n);
  if (owner && interopType(owner)) return;
  const l = memberLabel(n);
  cx.report(n, `Rename ${l.en} '${n.name}' to match PascalCase.`, `${l.ko} '${n.name}'의 이름을 PascalCase로 바꾸세요.`, { atName: true });
}

R('interface-prefix', '', 'S', 'MI', 5, ['convention'],
  ['Interface names should start with "I"', 'The "I" prefix is the .NET convention that tells interfaces from classes at a glance.', 'Rename the interface to "I" followed by a PascalCase name.'],
  ['인터페이스 이름은 "I"로 시작해야 합니다', '"I" 접두사는 인터페이스와 클래스를 한눈에 구별하게 하는 .NET 관례입니다.', '"I" 뒤에 PascalCase 이름이 오도록 인터페이스 이름을 바꾸세요.'],
  { kinds: { TypeDecl(n, cx) {
    if (n.kind !== 'interface' || !/^[A-Z]/.test(n.name)) return;
    if (/^I[A-Z]/.test(n.name) || interopType(n)) return;
    cx.report(n, `Rename interface '${n.name}' to start with 'I', for example 'I${n.name}'.`, `인터페이스 '${n.name}'의 이름이 'I'로 시작하도록 바꾸세요. 예: 'I${n.name}'.`, { atName: true });
  } } });

R('class-interface-prefix', '', 'S', 'MI', 5, ['convention', 'confusing'],
  ['Classes should not use the interface "I" prefix', 'A class named like "IService" is mistaken for an interface by every reader.', 'Drop the "I" prefix from the class name.'],
  ['클래스에 인터페이스 접두사 "I"를 쓰면 안 됩니다', '"IService"처럼 이름 지은 클래스는 누구나 인터페이스로 착각합니다.', '클래스 이름에서 "I" 접두사를 빼세요.'],
  { kinds: { TypeDecl(n, cx) {
    if (n.kind === 'interface' || n.kind === 'enum') return;
    if (!/^I[A-Z][a-z]/.test(n.name)) return;
    if (hasMod(n, 'static') || /Extensions?$/.test(n.name)) return;
    const l = typeLabel(n);
    cx.report(n, `Remove the interface prefix 'I' from ${l.en} '${n.name}'.`, `${l.ko} '${n.name}'에서 인터페이스 접두사 'I'를 빼세요.`, { atName: true });
  } } });

R('local-naming', 'S117', 'S', 'MI', 2, ['convention'],
  ['Local variables and parameters should use camelCase', 'Locals and parameters are camelCase in .NET; upper-case or underscored names look like members or constants.', 'Rename the variable so that it starts with a lower-case letter and has no underscores.'],
  ['지역 변수와 매개변수 이름은 camelCase여야 합니다', '.NET에서 지역 변수와 매개변수는 camelCase입니다. 대문자나 밑줄이 있는 이름은 멤버나 상수처럼 보입니다.', '소문자로 시작하고 밑줄이 없도록 변수 이름을 바꾸세요.'],
  { file(pf, cx) {
    for (const d of localDecls(pf, cx)) {
      if (allUnderscore(d.name) || CAMEL.test(d.name)) continue;
      reportVar(cx, d, `Rename local variable '${d.name}' to match camelCase.`, `지역 변수 '${d.name}'의 이름을 camelCase로 바꾸세요.`);
    }
    for (const p of paramDecls(pf)) {
      if (allUnderscore(p.name) || CAMEL.test(p.name)) continue;
      cx.report(p, `Rename parameter '${p.name}' to match camelCase.`, `매개변수 '${p.name}'의 이름을 camelCase로 바꾸세요.`, { atName: true });
    }
  } });

R('type-param-naming', 'S119', 'S', 'MI', 5, ['convention'],
  ['Type parameter names should start with "T"', 'Generic type parameters are named "T" or "T" followed by a descriptive PascalCase word, so they never look like real types.', 'Rename the type parameter to "T" or "TSomething".'],
  ['타입 매개변수 이름은 "T"로 시작해야 합니다', '제네릭 타입 매개변수는 실제 타입처럼 보이지 않도록 "T" 또는 "T" 뒤에 설명하는 PascalCase 단어로 이름을 짓습니다.', '타입 매개변수 이름을 "T"나 "TSomething"으로 바꾸세요.'],
  { kinds: { TypeParam(n, cx) {
    if (/^T([A-Z][A-Za-z0-9]*)?$/.test(n.name)) return;
    if (n.parent && dictated(n.parent)) return;
    cx.report(n, `Rename type parameter '${n.name}' to 'T' or 'T${n.name.replace(/^[a-z]/, (c) => c.toUpperCase())}'.`, `타입 매개변수 '${n.name}'의 이름을 'T'나 'T${n.name.replace(/^[a-z]/, (c) => c.toUpperCase())}'로 바꾸세요.`);
  } } });

R('underscore-in-name', '', 'S', 'MI', 5, ['convention'],
  ['Type and member names should not contain underscores', 'PascalCase names separate words with capitals; underscores in type, method or property names break the convention.', 'Remove the underscores and capitalize each word.'],
  ['타입과 멤버 이름에 밑줄을 쓰면 안 됩니다', 'PascalCase 이름은 대문자로 단어를 구분합니다. 타입, 메서드, 속성 이름의 밑줄은 관례를 깹니다.', '밑줄을 지우고 단어마다 첫 글자를 대문자로 쓰세요.'],
  { kinds: {
    TypeDecl(n, cx) { underscoreType(n, cx); },
    Delegate(n, cx) { underscoreType(n, cx); },
    Method(n, cx) { underscoreMember(n, cx); },
    Property(n, cx) { underscoreMember(n, cx); },
    Event(n, cx) { underscoreMember(n, cx); },
    LocalFunc(n, cx) { underscoreMember(n, cx); },
  } });
function underscoreType(n, cx) {
  if (!n.name || !n.name.includes('_') || interopType(n)) return;
  const l = typeLabel(n);
  cx.report(n, `Remove the underscores from ${l.en} name '${n.name}'.`, `${l.ko} 이름 '${n.name}'에서 밑줄을 지우세요.`, { atName: true });
}
function underscoreMember(n, cx) {
  if (!n.name || !n.name.includes('_') || allUnderscore(n.name)) return;
  if (dictated(n) || isTestish(n, cx.pf)) return;
  if (n.k === 'Method' && U.isEventHandler(n)) return;
  const owner = ownerOf(n);
  if (owner && interopType(owner)) return;
  const l = memberLabel(n);
  cx.report(n, `Remove the underscores from ${l.en} name '${n.name}'.`, `${l.ko} 이름 '${n.name}'에서 밑줄을 지우세요.`, { atName: true });
}

// longest acronym (run of capitals) inside a PascalCase name
function longAcronym(name) {
  let best = null;
  const re = /[A-Z]{3,}/g;
  let m;
  while ((m = re.exec(name))) {
    const next = name[m.index + m[0].length];
    const len = next && /[a-z]/.test(next) ? m[0].length - 1 : m[0].length;
    if (len >= 3 && (!best || len > best.length)) best = m[0].slice(0, len);
  }
  return best;
}

R('acronym-casing', '', 'S', 'MI', 5, ['convention'],
  ['Acronyms longer than two letters should be PascalCased', 'The .NET guidelines write long acronyms like words ("XmlReader", "HttpClient"); all-capital runs make word boundaries hard to see.', 'Capitalize only the first letter of acronyms of three letters or more.'],
  ['두 글자보다 긴 약어는 PascalCase로 써야 합니다', '.NET 지침은 긴 약어를 단어처럼 씁니다("XmlReader", "HttpClient"). 대문자가 이어지면 단어 경계가 잘 보이지 않습니다.', '세 글자 이상인 약어는 첫 글자만 대문자로 쓰세요.'],
  { kinds: {
    TypeDecl(n, cx) { acronymCheck(n, cx, true); },
    Delegate(n, cx) { acronymCheck(n, cx, true); },
    Method(n, cx) { acronymCheck(n, cx, false); },
    Property(n, cx) { acronymCheck(n, cx, false); },
    Event(n, cx) { acronymCheck(n, cx, false); },
  } });
function acronymCheck(n, cx, isType) {
  if (!n.name) return;
  if (isType ? interopType(n) : (dictated(n) || (ownerOf(n) && interopType(ownerOf(n))))) return;
  const name = isType && n.kind === 'interface' ? n.name.replace(/^I(?=[A-Z])/, '') : n.name;
  const acr = longAcronym(name);
  if (!acr) return;
  const fixed = acr[0] + acr.slice(1).toLowerCase();
  cx.report(n, `Rename '${n.name}': write the acronym '${acr}' as '${fixed}'.`, `'${n.name}'의 이름을 바꾸세요. 약어 '${acr}'는 '${fixed}'로 쓰세요.`, { atName: true });
}

const HUNGARIAN = /^(?:m_|s_|_)?(str|int|bln|bool|obj|arr|lst|dbl|flt|sz|lp|dw|lng|chr|byt)(?=[A-Z])/;

R('hungarian-notation', '', 'S', 'MI', 5, ['convention'],
  ['Names should not use Hungarian notation', 'Type prefixes such as "str" or "int" repeat what the compiler already knows and become wrong when the type changes.', 'Remove the type prefix and name the variable after its meaning.'],
  ['이름에 헝가리안 표기법을 쓰면 안 됩니다', '"str"이나 "int" 같은 타입 접두사는 컴파일러가 이미 아는 것을 반복하고, 타입이 바뀌면 틀린 이름이 됩니다.', '타입 접두사를 지우고 의미에 맞게 이름을 지으세요.'],
  { file(pf, cx) {
    const hit = (name) => { const m = HUNGARIAN.exec(name); return m ? m[1] : null; };
    for (const d of localDecls(pf, cx)) {
      const p = hit(d.name);
      if (p) reportVar(cx, d, `Remove the type prefix '${p}' from variable '${d.name}'.`, `변수 '${d.name}'에서 타입 접두사 '${p}'를 지우세요.`);
    }
    for (const prm of paramDecls(pf)) {
      const p = hit(prm.name);
      if (p) cx.report(prm, `Remove the type prefix '${p}' from parameter '${prm.name}'.`, `매개변수 '${prm.name}'에서 타입 접두사 '${p}'를 지우세요.`, { atName: true });
    }
    for (const f of pf.byKind.get('Field') || []) {
      if (dictated(f) || (ownerOf(f) && interopType(ownerOf(f)))) continue;
      for (const v of f.vars) {
        const p = hit(v.name);
        if (p) cx.report(v, `Remove the type prefix '${p}' from field '${v.name}'.`, `필드 '${v.name}'에서 타입 접두사 '${p}'를 지우세요.`);
      }
    }
  } });

// ───────────────────────────────────────── fields
R('private-field-naming', '', 'S', 'MI', 2, ['convention'],
  ['Private fields should use camelCase', 'Private instance fields are camelCase, optionally with a leading "_"; PascalCase private fields look like properties.', 'Rename the field to camelCase or _camelCase.'],
  ['private 필드 이름은 camelCase여야 합니다', 'private 인스턴스 필드는 camelCase이고 앞에 "_"를 붙일 수 있습니다. PascalCase private 필드는 속성처럼 보입니다.', '필드 이름을 camelCase나 _camelCase로 바꾸세요.'],
  { kinds: { Field(n, cx) {
    if (n.isConst || hasMod(n, 'static')) return;
    const owner = ownerOf(n);
    if (!owner || owner.kind === 'interface' || accessOf(n, owner) !== 'private') return;
    if (interopType(owner) || (n.attrs && n.attrs.length)) return;
    for (const v of n.vars) {
      if (/^(_|m_)?[a-z][A-Za-z0-9]*$/.test(v.name) || allUnderscore(v.name)) continue;
      cx.report(v, `Rename private field '${v.name}' to match camelCase.`, `private 필드 '${v.name}'의 이름을 camelCase로 바꾸세요.`);
    }
  } } });

R('public-field-naming', '', 'S', 'MI', 2, ['convention'],
  ['Non-private fields should use PascalCase', 'Fields visible outside the type are part of its API and are named like properties, in PascalCase.', 'Rename the field to PascalCase (or make it a property).'],
  ['private가 아닌 필드 이름은 PascalCase여야 합니다', '타입 밖에서 보이는 필드는 API의 일부라서 속성처럼 PascalCase로 이름을 짓습니다.', '필드 이름을 PascalCase로 바꾸거나 속성으로 만드세요.'],
  { kinds: { Field(n, cx) {
    if (n.isConst) return;
    const owner = ownerOf(n);
    if (!owner || owner.kind === 'interface' || accessOf(n, owner) === 'private') return;
    if (interopType(owner)) return;
    for (const v of n.vars) {
      if (/^[A-Z]/.test(v.name)) continue;
      cx.report(v, `Rename ${accessOf(n, owner)} field '${v.name}' to match PascalCase.`, `${accessOf(n, owner)} 필드 '${v.name}'의 이름을 PascalCase로 바꾸세요.`);
    }
  } } });

R('const-naming', '', 'S', 'MI', 2, ['convention'],
  ['Constants should use PascalCase', 'The .NET convention names constants in PascalCase; SCREAMING_CASE comes from C and Java and looks foreign.', 'Rename the constant to PascalCase, for example MaxRetries.'],
  ['상수 이름은 PascalCase여야 합니다', '.NET 관례는 상수 이름을 PascalCase로 짓습니다. SCREAMING_CASE는 C와 Java에서 온 방식이라 어색합니다.', '상수 이름을 MaxRetries처럼 PascalCase로 바꾸세요.'],
  { kinds: { Field(n, cx) {
    if (!n.isConst) return;
    const owner = ownerOf(n);
    if ((owner && interopType(owner)) || fileHasInterop(cx.pf)) return;
    for (const v of n.vars) {
      const screaming = /^[A-Z][A-Z0-9_]*$/.test(v.name) && /[A-Z]{3,}|_/.test(v.name);
      if (!screaming && !v.name.includes('_')) continue;
      const fixed = v.name.toLowerCase().split('_').filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join('');
      cx.report(v, `Rename constant '${v.name}' to PascalCase, for example '${fixed}'.`, `상수 '${v.name}'의 이름을 '${fixed}'처럼 PascalCase로 바꾸세요.`);
    }
  } } });

// ───────────────────────────────────────── async
const AWAITABLE = new Set(['Task', 'ValueTask', 'IAsyncEnumerable', 'IAsyncAction', 'IAsyncOperation', 'IAsyncOperationWithProgress', 'IAsyncActionWithProgress', 'IAsyncResult', 'ConfiguredTaskAwaitable', 'ConfiguredValueTaskAwaitable', 'IObservable', 'UniTask', 'Awaitable', 'IEnumerator']);
const WEB_BASES = ['Controller', 'ControllerBase', 'ApiController', 'Hub', 'PageModel', 'ComponentBase', 'BackgroundService', 'IHostedService', 'IMiddleware'];

function inFrameworkType(n) {
  const owner = ownerOf(n);
  if (!owner) return false;
  if (/Controller$|Hub$|Middleware$|Model$/.test(owner.name)) return true;
  const info = owner.typeInfo;
  return !!info && WEB_BASES.some((b) => info.inheritsFrom(b));
}

R('async-suffix', 'S4261', 'S', 'MI', 5, ['convention', 'async-await'],
  ['Methods returning Task should be named with an "Async" suffix', 'Callers rely on the "Async" suffix to know that a method must be awaited; without it the returned task is easily ignored.', 'Add "Async" to the method name.'],
  ['Task를 반환하는 메서드 이름에는 "Async" 접미사가 있어야 합니다', '호출자는 "Async" 접미사로 await해야 하는 메서드임을 압니다. 접미사가 없으면 반환된 작업을 무시하기 쉽습니다.', '메서드 이름 끝에 "Async"를 붙이세요.'],
  { kinds: { Method(n, cx) {
    if (!U.returnsTask(n) || /Async$/.test(n.name) || n.name === 'Main') return;
    if (dictated(n) || isTestish(n, cx.pf) || U.isEventHandler(n)) return;
    if (n.attrs && n.attrs.length) return;
    if (inFrameworkType(n)) return;
    const owner = ownerOf(n);
    // the name may be dictated by an interface (a project interface is reported at its own declaration)
    if (owner && owner.kind !== 'interface' && owner.typeInfo && owner.typeInfo.ifaceInfos.length + owner.typeInfo.externalBases.length && U.mayImplementInterface(owner.typeInfo, n.name)) return;
    cx.report(n, `Rename method '${n.name}' to '${n.name}Async'.`, `메서드 '${n.name}'의 이름을 '${n.name}Async'로 바꾸세요.`, { atName: true });
  } } });

R('async-suffix-not-awaitable', '', 'S', 'MI', 5, ['convention', 'async-await', 'confusing'],
  ['Only awaitable methods should be named with an "Async" suffix', 'The "Async" suffix promises an awaitable result; a synchronous method with that name makes callers look for a task that is not there.', 'Return a Task, or drop the "Async" suffix.'],
  ['await할 수 있는 메서드만 이름에 "Async" 접미사를 써야 합니다', '"Async" 접미사는 await할 수 있는 결과를 약속합니다. 이 이름의 동기 메서드는 호출자가 없는 작업을 찾게 만듭니다.', 'Task를 반환하거나 "Async" 접미사를 빼세요.'],
  { kinds: { Method(n, cx) {
    if (!/.Async$/.test(n.name) || dictated(n)) return;
    const rt = n.retType;
    if (!rt || hasMod(n, 'async')) return;
    if (AWAITABLE.has(rt.name) || /Task$|Awaitable$|Awaiter$/.test(rt.name)) return;
    const owner = ownerOf(n);
    if ((n.typeParams || []).some((p) => p.name === rt.name) || (owner && (owner.typeParams || []).some((p) => p.name === rt.name))) return;
    const label = rt.name === 'void' ? 'void' : rt.name;
    cx.report(n, `Remove the 'Async' suffix from '${n.name}': it returns '${label}', which cannot be awaited.`, `'${n.name}'에서 'Async' 접미사를 빼세요. 반환 타입 '${label}'은 await할 수 없습니다.`, { atName: true });
  } } });

// ───────────────────────────────────────── enums
const hasFlags = (td) => !!attrNamed(td.attrs, ['Flags']);

R('enum-naming', 'S2342', 'S', 'MI', 5, ['convention'],
  ['Enum names should be singular, and plural for [Flags] enums', 'A plain enum holds one value ("Color"), a [Flags] enum holds a set ("FileAccessRights"); the number of the name tells readers which one it is.', 'Use a singular name for plain enums and a plural name for [Flags] enums.'],
  ['열거형 이름은 단수형이고, [Flags] 열거형은 복수형이어야 합니다', '일반 열거형은 값 하나("Color")를, [Flags] 열거형은 집합("FileAccessRights")을 담습니다. 이름의 단·복수로 어느 쪽인지 알 수 있습니다.', '일반 열거형은 단수형, [Flags] 열거형은 복수형 이름을 쓰세요.'],
  { kinds: { TypeDecl(n, cx) {
    if (n.kind !== 'enum' || !/^[A-Z]/.test(n.name)) return;
    const plural = /[^s]s$/.test(n.name) && !/(us|is|os|as|ics|ness|ss)$/.test(n.name);
    if (hasFlags(n)) {
      if (/s$/.test(n.name)) return;
      cx.report(n, `Rename [Flags] enum '${n.name}' to a plural name.`, `[Flags] 열거형 '${n.name}'의 이름을 복수형으로 바꾸세요.`, { atName: true });
    } else if (plural) {
      cx.report(n, `Rename enum '${n.name}' to a singular name, or mark it [Flags].`, `열거형 '${n.name}'의 이름을 단수형으로 바꾸거나 [Flags]를 붙이세요.`, { atName: true });
    }
  } } });

R('enum-suffix', 'S2344', 'S', 'MI', 5, ['convention'],
  ['Enum names should not end with "Enum" or "Flags"', 'The suffix repeats what the declaration already says and shows up in every use of the type.', 'Remove the "Enum" or "Flags" suffix.'],
  ['열거형 이름은 "Enum"이나 "Flags"로 끝나면 안 됩니다', '접미사는 선언이 이미 말하는 내용을 반복하고, 타입을 쓸 때마다 나타납니다.', '"Enum"이나 "Flags" 접미사를 지우세요.'],
  { kinds: { TypeDecl(n, cx) {
    if (n.kind !== 'enum') return;
    const m = /.(Enum|Flags)$/.exec(n.name);
    if (!m) return;
    cx.report(n, `Remove the '${m[1]}' suffix from enum '${n.name}'.`, `열거형 '${n.name}'에서 '${m[1]}' 접미사를 지우세요.`, { atName: true });
  } } });

R('enum-member-naming', '', 'S', 'MI', 2, ['convention'],
  ['Enum members should use PascalCase', 'Enum members are named like constants in .NET: PascalCase, without underscores.', 'Rename the member to PascalCase.'],
  ['열거형 멤버 이름은 PascalCase여야 합니다', '.NET에서 열거형 멤버는 상수처럼 밑줄 없는 PascalCase로 이름을 짓습니다.', '멤버 이름을 PascalCase로 바꾸세요.'],
  { kinds: { EnumMember(n, cx) {
    if (/^[A-Z][A-Za-z0-9]*$/.test(n.name)) return;
    const owner = ownerOf(n);
    if ((owner && interopType(owner)) || fileHasInterop(cx.pf)) return;
    cx.report(n, `Rename enum member '${n.name}' to match PascalCase.`, `열거형 멤버 '${n.name}'의 이름을 PascalCase로 바꾸세요.`);
  } } });

R('enum-member-type-prefix', '', 'S', 'MI', 5, ['convention'],
  ['Enum members should not repeat the enum name', 'Members are always written as "Color.Red"; a member "ColorRed" reads "Color.ColorRed".', 'Remove the enum name from the member name.'],
  ['열거형 멤버 이름에 열거형 이름을 반복하면 안 됩니다', '멤버는 항상 "Color.Red"처럼 쓰므로 "ColorRed" 멤버는 "Color.ColorRed"로 읽힙니다.', '멤버 이름에서 열거형 이름을 지우세요.'],
  { kinds: { EnumMember(n, cx) {
    const owner = ownerOf(n);
    if (!owner || !owner.name) return;
    const base = owner.name.replace(/s$/, '');
    for (const pre of [owner.name, base]) {
      if (n.name.length > pre.length && n.name.startsWith(pre) && /[A-Z_]/.test(n.name[pre.length])) {
        const rest = n.name.slice(pre.length).replace(/^_+/, '');
        cx.report(n, `Remove the prefix '${pre}' from enum member '${n.name}' (use '${rest}').`, `열거형 멤버 '${n.name}'에서 접두사 '${pre}'를 지우세요('${rest}').`);
        return;
      }
    }
  } } });

R('enum-reserved-member', '', 'S', 'MI', 5, ['convention'],
  ['Enums should not have "Reserved" members', 'A placeholder member for future use is part of the public contract; adding the real member later is the compatible way.', 'Remove the reserved member and add real members when they are needed.'],
  ['열거형에 "Reserved" 멤버를 두면 안 됩니다', '나중을 위한 자리 표시 멤버도 공개 계약의 일부가 됩니다. 실제 멤버는 필요할 때 추가하는 것이 호환되는 방법입니다.', '예약 멤버를 지우고 필요할 때 실제 멤버를 추가하세요.'],
  { kinds: { EnumMember(n, cx) {
    if (!/reserved/i.test(n.name)) return;
    cx.report(n, `Remove the reserved enum member '${n.name}'.`, `예약 열거형 멤버 '${n.name}'를 지우세요.`);
  } } });

// ───────────────────────────────────────── namespaces and types
R('namespace-naming', '', 'S', 'MI', 5, ['convention'],
  ['Namespace names should use PascalCase', 'Each part of a namespace is PascalCase in .NET ("Company.Product.Feature").', 'Rename the namespace parts so that each starts with an upper-case letter and has no underscores.'],
  ['네임스페이스 이름은 PascalCase여야 합니다', '.NET에서 네임스페이스의 각 부분은 PascalCase입니다("Company.Product.Feature").', '각 부분이 대문자로 시작하고 밑줄이 없도록 네임스페이스 이름을 바꾸세요.'],
  { kinds: { Namespace(n, cx) {
    if (!n.name) return;
    const bad = n.name.split('.').filter((s) => !/^[A-Z][A-Za-z0-9]*$/.test(s));
    if (!bad.length) return;
    cx.report({ line: n.line, col: n.col }, `Rename namespace '${n.name}': '${bad[0]}' does not match PascalCase.`, `네임스페이스 '${n.name}'의 이름을 바꾸세요. '${bad[0]}'가 PascalCase가 아닙니다.`);
  } } });

const FRAMEWORK_NS = new Set(['System', 'Collections', 'Generic', 'Linq', 'IO', 'Text', 'Threading', 'Tasks', 'Net', 'Http', 'Xml', 'Reflection',
  'Diagnostics', 'Runtime', 'Globalization', 'Drawing', 'ComponentModel', 'Microsoft', 'Concurrent', 'Serialization', 'Json']);

R('type-name-matches-namespace', 'S4041', 'S', 'MI', 10, ['convention', 'confusing'],
  ['Type names should not match namespaces', 'A public type named like a namespace forces callers to qualify names and makes "using" directives ambiguous.', 'Rename the type.'],
  ['타입 이름이 네임스페이스와 같으면 안 됩니다', '네임스페이스와 이름이 같은 public 타입은 호출자가 이름을 한정하게 만들고 using 지시문을 모호하게 합니다.', '타입 이름을 바꾸세요.'],
  { kinds: { TypeDecl(n, cx) {
    if (n.outer || !hasMod(n, 'public')) return;
    let hit = FRAMEWORK_NS.has(n.name) ? n.name : null;
    if (!hit) {
      for (const ns of cx.project.namespaces) if (ns.split('.').includes(n.name)) { hit = ns; break; }
    }
    if (!hit) return;
    cx.report(n, `Rename type '${n.name}': it matches the namespace '${hit}'.`, `타입 '${n.name}'의 이름을 바꾸세요. 네임스페이스 '${hit}'와 같습니다.`, { atName: true });
  } } });

R('event-args-suffix', '', 'S', 'MI', 5, ['convention'],
  ['EventArgs subclasses should end with "EventArgs"', 'The suffix tells readers that the type carries event data and pairs it with its event.', 'Add "EventArgs" to the class name.'],
  ['EventArgs 하위 클래스 이름은 "EventArgs"로 끝나야 합니다', '접미사는 타입이 이벤트 데이터를 담는다는 것을 알리고 이벤트와 짝지어 줍니다.', '클래스 이름 끝에 "EventArgs"를 붙이세요.'],
  { kinds: { TypeDecl(n, cx) {
    if (n.kind !== 'class' && n.kind !== 'record') return;
    if (/EventArgs$/.test(n.name) || !n.typeInfo || !n.typeInfo.inheritsFrom('EventArgs')) return;
    cx.report(n, `Rename '${n.name}' to end with 'EventArgs'.`, `'${n.name}'의 이름이 'EventArgs'로 끝나도록 바꾸세요.`, { atName: true });
  } } });

R('attribute-suffix', '', 'S', 'MI', 5, ['convention'],
  ['Attribute classes should end with "Attribute"', 'C# lets callers drop the "Attribute" suffix in [Name] usages only when the class has it; without it the type also reads like a normal class.', 'Add "Attribute" to the class name.'],
  ['특성 클래스 이름은 "Attribute"로 끝나야 합니다', 'C#은 클래스 이름에 "Attribute" 접미사가 있을 때만 [Name]처럼 줄여 쓸 수 있습니다. 접미사가 없으면 일반 클래스처럼 읽힙니다.', '클래스 이름 끝에 "Attribute"를 붙이세요.'],
  { kinds: { TypeDecl(n, cx) {
    if (n.kind !== 'class' || /Attribute$/.test(n.name) || !n.typeInfo) return;
    const info = n.typeInfo;
    const isAttr = info.inheritsFrom('Attribute') || (n.bases || []).some((b) => /Attribute$/.test(b.name) && !info.baseInfo);
    if (!isAttr) return;
    cx.report(n, `Rename attribute class '${n.name}' to '${n.name}Attribute'.`, `특성 클래스 '${n.name}'의 이름을 '${n.name}Attribute'로 바꾸세요.`, { atName: true });
  } } });

R('delegate-suffix', '', 'S', 'MI', 5, ['convention'],
  ['Delegate types should not end with "Delegate"', 'The suffix repeats the kind of the type; name delegates after what they do ("Callback", "Handler", "Func").', 'Remove the "Delegate" suffix.'],
  ['대리자 타입 이름은 "Delegate"로 끝나면 안 됩니다', '접미사는 타입의 종류를 반복할 뿐입니다. 대리자는 하는 일("Callback", "Handler", "Func")로 이름을 지으세요.', '"Delegate" 접미사를 지우세요.'],
  { kinds: { Delegate(n, cx) {
    if (!/.Delegate$/.test(n.name)) return;
    cx.report(n, `Remove the 'Delegate' suffix from delegate '${n.name}'.`, `대리자 '${n.name}'에서 'Delegate' 접미사를 지우세요.`, { atName: true });
  } } });

R('event-handler-delegate-signature', '', 'S', 'MI', 10, ['convention', 'event'],
  ['"EventHandler" delegates should have the (object sender, TEventArgs e) shape', 'A delegate named "...EventHandler" promises the standard event pattern: void, an object "sender" and an event-args "e".', 'Declare it as void (object sender, XEventArgs e), or give it another name.'],
  ['"EventHandler" 대리자는 (object sender, TEventArgs e) 형태여야 합니다', '"...EventHandler"라는 대리자는 void 반환, object "sender", 이벤트 인수 "e"라는 표준 이벤트 패턴을 약속합니다.', 'void (object sender, XEventArgs e)로 선언하거나 다른 이름을 쓰세요.'],
  { kinds: { Delegate(n, cx) {
    if (!/EventHandler$/.test(n.name)) return;
    const ps = n.params || [];
    const ok = n.retType && n.retType.name === 'void' && ps.length === 2 && ps[0].type && (ps[0].type.name === 'object' || ps[0].type.name === 'Object')
      && ps[0].name === 'sender' && ps[1].name === 'e';
    if (ok) return;
    cx.report(n, `Declare '${n.name}' as 'void ${n.name}(object sender, EventArgs e)' or rename it.`, `'${n.name}'를 'void ${n.name}(object sender, EventArgs e)'로 선언하거나 이름을 바꾸세요.`, { atName: true });
  } } });

// ───────────────────────────────────────── events
R('event-before-after-prefix', '', 'S', 'MI', 5, ['convention', 'event'],
  ['Event names should not use "Before" or "After" prefixes', 'The .NET convention marks pre- and post-events with tense: "Closing" before, "Closed" after.', 'Rename the event with a present or past participle.'],
  ['이벤트 이름에 "Before"나 "After" 접두사를 쓰면 안 됩니다', '.NET 관례는 시제로 이전·이후 이벤트를 나타냅니다. 이전은 "Closing", 이후는 "Closed"입니다.', '현재분사나 과거분사로 이벤트 이름을 바꾸세요.'],
  { kinds: { Event(n, cx) {
    if (dictated(n)) return;
    for (const v of n.vars || [n]) {
      const m = /^(Before|After)(?=[A-Z])/.exec(v.name);
      if (!m) continue;
      const word = v.name.slice(m[1].length);
      const tip = m[1] === 'Before' ? `${word}ing` : `${word}ed`;
      cx.report(v === n ? n : v, `Rename event '${v.name}' without the '${m[1]}' prefix, for example '${tip}'.`, `이벤트 '${v.name}'에서 '${m[1]}' 접두사를 빼고 '${tip}'처럼 이름을 바꾸세요.`, v === n ? { atName: true } : undefined);
    }
  } } });

R('event-on-prefix', '', 'S', 'MI', 5, ['convention', 'event'],
  ['Event names should not start with "On"', 'By convention "OnSomething" is the protected method that raises the "Something" event; an event named "OnSomething" clashes with that pattern.', 'Remove the "On" prefix from the event name.'],
  ['이벤트 이름은 "On"으로 시작하면 안 됩니다', '관례상 "OnSomething"은 "Something" 이벤트를 발생시키는 protected 메서드입니다. "OnSomething" 이벤트는 이 패턴과 충돌합니다.', '이벤트 이름에서 "On" 접두사를 빼세요.'],
  { kinds: { Event(n, cx) {
    if (dictated(n)) return;
    for (const v of n.vars || [n]) {
      if (!/^On[A-Z]/.test(v.name)) continue;
      cx.report(v === n ? n : v, `Rename event '${v.name}' to '${v.name.slice(2)}'.`, `이벤트 '${v.name}'의 이름을 '${v.name.slice(2)}'로 바꾸세요.`, v === n ? { atName: true } : undefined);
    }
  } } });

// ───────────────────────────────────────── consistency
function paramTypesKey(m) {
  return (m.params || []).map((p) => (p.type ? `${p.type.name}${p.type.ranks ? '[]' : ''}` : '?')).join(',');
}

R('parameter-name-mismatch', 'S927', 'S', 'CR', 5, ['convention', 'suspicious'],
  ['Parameter names should match the base declaration', 'Callers using named arguments see the names of the declaration they call through; different names in an override or implementation break them and confuse readers.', 'Rename the parameter to the name used by the base or interface declaration.'],
  ['매개변수 이름은 기본 선언과 같아야 합니다', '이름 있는 인수를 쓰는 호출자는 호출하는 선언의 이름을 봅니다. 재정의나 구현에서 이름이 다르면 호출이 깨지고 읽는 사람이 헷갈립니다.', '기본 선언이나 인터페이스 선언의 이름으로 매개변수 이름을 바꾸세요.'],
  { kinds: { Method(n, cx) {
    const owner = ownerOf(n);
    const info = owner && owner.typeInfo;
    if (!info || !(n.params || []).length) return;
    const key = paramTypesKey(n);
    const cands = [];
    const collect = (entries, how) => {
      for (const e of entries || []) {
        if (e.kind !== 'method' || e.node === n || e.info === info) continue;
        if ((e.node.params || []).length !== n.params.length || paramTypesKey(e.node) !== key) continue;
        cands.push({ m: e.node, how, where: e.info.name });
      }
    };
    if (hasMod(n, 'override')) { if (info.baseInfo) collect(info.baseInfo.lookup(n.name), 'base'); }
    else if (n.iface) {
      const ifn = n.iface.split('.').pop().replace(/<.*$/, '');
      for (const i of info.ifaceInfos) if (i.name === ifn) collect(i.lookup(n.name), 'iface');
    } else if (accessOf(n, owner) === 'public') {
      for (const i of info.ifaceInfos) collect(i.lookup(n.name), 'iface');
    }
    if (cands.length !== 1) return;
    const base = cands[0];
    n.params.forEach((p, i) => {
      const bn = base.m.params[i].name;
      if (!bn || !p.name || bn === p.name) return;
      cx.report(p, `Rename parameter '${p.name}' to '${bn}' to match the declaration in '${base.where}'.`, `'${base.where}'의 선언과 같도록 매개변수 '${p.name}'의 이름을 '${bn}'로 바꾸세요.`, { atName: true });
    });
  } } });

R('local-shadows-field', 'S1117', 'S', 'MA', 5, ['pitfall'],
  ['Local variables should not shadow fields or properties', 'A local with the name of a field or property hides it, so later code in the method may read or write the wrong one.', 'Rename the local variable.'],
  ['지역 변수가 필드나 속성을 가리면 안 됩니다', '필드나 속성과 이름이 같은 지역 변수는 그것을 가려서, 메서드의 뒤쪽 코드가 엉뚱한 쪽을 읽거나 쓸 수 있습니다.', '지역 변수 이름을 바꾸세요.'],
  { file(pf, cx) {
    for (const d of localDecls(pf, cx)) {
      if (d.node.k === 'Catch') continue;
      const td = U.typeDeclOf(d.node);
      if (!td || !td.typeInfo) continue;
      const entries = td.typeInfo.lookup(d.name);
      if (!entries) continue;
      const fn = U.memberOf(d.node);
      const staticCtx = fn && hasMod(fn, 'static');
      const hit = entries.find((e) => (e.kind === 'field' || e.kind === 'property') && !(staticCtx && !e.isStatic) && (e.info === td.typeInfo || e.access !== 'private'));
      if (!hit) continue;
      const what = hit.kind === 'field' ? { en: 'field', ko: '필드' } : { en: 'property', ko: '속성' };
      reportVar(cx, d, `Rename '${d.name}': it hides the ${what.en} '${d.name}' of '${td.name}'.`, `'${d.name}'의 이름을 바꾸세요. '${td.name}'의 ${what.ko} '${d.name}'를 가립니다.`);
    }
  } });

R('property-matches-get-method', 'S4059', 'S', 'MA', 5, ['convention', 'confusing'],
  ['Property names should not match "Get" methods', 'A property "Value" next to a method "GetValue()" leaves callers guessing which one to use and whether they differ.', 'Rename or remove one of the two members.'],
  ['속성 이름이 "Get" 메서드와 맞물리면 안 됩니다', '"GetValue()" 메서드 옆의 "Value" 속성은 어느 쪽을 써야 하고 둘이 다른지 호출자가 추측하게 만듭니다.', '두 멤버 중 하나의 이름을 바꾸거나 지우세요.'],
  { kinds: { Property(n, cx) {
    const owner = ownerOf(n);
    if (!owner || !owner.typeInfo || dictated(n) || accessOf(n, owner) === 'private') return;
    const ms = owner.typeInfo.members.get(`Get${n.name}`);
    const m = ms && ms.find((e) => e.kind === 'method' && e.access !== 'private');
    if (!m) return;
    cx.report(n, `Rename property '${n.name}' or method 'Get${n.name}': their names match.`, `속성 '${n.name}'와 메서드 'Get${n.name}'의 이름이 겹칩니다. 둘 중 하나의 이름을 바꾸세요.`, { atName: true });
  } } });

R('type-param-shadows-outer', '', 'S', 'MA', 5, ['pitfall'],
  ['Type parameters should not hide outer type parameters', 'A method or nested type that redeclares a type parameter of its enclosing type hides it, so "T" means two different things in one class.', 'Rename the inner type parameter.'],
  ['타입 매개변수가 바깥 타입 매개변수를 가리면 안 됩니다', '바깥 타입의 타입 매개변수를 메서드나 중첩 타입이 다시 선언하면 가려져서 한 클래스 안에서 "T"가 서로 다른 뜻이 됩니다.', '안쪽 타입 매개변수 이름을 바꾸세요.'],
  { kinds: { TypeParam(n, cx) {
    const decl = n.parent;
    if (!decl || !['Method', 'TypeDecl', 'Delegate'].includes(decl.k) || dictated(decl)) return;
    for (let t = decl.k === 'Method' ? ownerOf(decl) : (decl.outer || null); t; t = t.outer || null) {
      if ((t.typeParams || []).some((p) => p.name === n.name)) {
        cx.report(n, `Rename type parameter '${n.name}': it hides the type parameter of '${t.name}'.`, `타입 매개변수 '${n.name}'의 이름을 바꾸세요. '${t.name}'의 타입 매개변수를 가립니다.`);
        return;
      }
    }
  } } });

R('members-differ-by-case', '', 'S', 'MA', 5, ['convention', 'confusing'],
  ['Visible members should not differ only by case', 'Languages such as Visual Basic are case-insensitive and cannot tell the members apart; readers mix them up too.', 'Give the members names that differ by more than letter case.'],
  ['보이는 멤버 이름이 대소문자만 달라서는 안 됩니다', 'Visual Basic처럼 대소문자를 구별하지 않는 언어는 두 멤버를 구별하지 못하고, 읽는 사람도 헷갈립니다.', '대소문자 말고도 다르게 멤버 이름을 지으세요.'],
  { kinds: { TypeDecl(n, cx) {
    if (!n.typeInfo || !hasMod(n, 'public')) return;
    const seen = new Map();
    for (const m of n.members) {
      if (!['Method', 'Property', 'Field', 'Event'].includes(m.k) || dictated(m)) continue;
      const acc = accessOf(m, n);
      if (acc !== 'public' && acc !== 'protected') continue;
      const names = m.vars ? m.vars.map((v) => ({ name: v.name, node: v, at: false })) : [{ name: m.name, node: m, at: true }];
      for (const x of names) {
        const low = x.name.toLowerCase();
        const prev = seen.get(low);
        if (prev && prev !== x.name) {
          cx.report(x.node, `Rename '${x.name}': it differs from '${prev}' only by case.`, `'${x.name}'의 이름을 바꾸세요. '${prev}'와 대소문자만 다릅니다.`, x.at ? { atName: true } : undefined);
        } else if (!prev) seen.set(low, x.name);
      }
    }
  } } });

const NEGATIVE = /^(?:_|m_)?(?:(?:is|has|can|should|Is|Has|Can|Should)Not|not|Not)(?=[A-Z])/;

R('negative-boolean-name', '', 'S', 'MI', 5, ['convention', 'confusing'],
  ['Boolean names should not be negative', 'Negated names such as "isNotValid" lead to double negatives ("!isNotValid") that are hard to read.', 'Use the positive form ("isValid") and invert the uses.'],
  ['불리언 이름을 부정형으로 지으면 안 됩니다', '"isNotValid" 같은 부정형 이름은 읽기 어려운 이중 부정("!isNotValid")을 만듭니다.', '긍정형("isValid")으로 이름을 짓고 사용하는 곳을 반대로 바꾸세요.'],
  { file(pf, cx) {
    for (const d of localDecls(pf, cx)) {
      if (isBoolType(d.type) && NEGATIVE.test(d.name)) reportVar(cx, d, `Rename boolean '${d.name}' to its positive form.`, `불리언 '${d.name}'의 이름을 긍정형으로 바꾸세요.`);
    }
    for (const p of paramDecls(pf)) {
      if (isBoolType(p.type) && NEGATIVE.test(p.name)) cx.report(p, `Rename boolean parameter '${p.name}' to its positive form.`, `불리언 매개변수 '${p.name}'의 이름을 긍정형으로 바꾸세요.`, { atName: true });
    }
    for (const f of pf.byKind.get('Field') || []) {
      if (!isBoolType(f.type) || dictated(f)) continue;
      for (const v of f.vars) if (NEGATIVE.test(v.name)) cx.report(v, `Rename boolean field '${v.name}' to its positive form.`, `불리언 필드 '${v.name}'의 이름을 긍정형으로 바꾸세요.`);
    }
    for (const p of pf.byKind.get('Property') || []) {
      if (isBoolType(p.type) && !dictated(p) && NEGATIVE.test(p.name)) cx.report(p, `Rename boolean property '${p.name}' to its positive form.`, `불리언 속성 '${p.name}'의 이름을 긍정형으로 바꾸세요.`, { atName: true });
    }
  } });

R('get-method-returns-void', '', 'S', 'MA', 5, ['convention', 'confusing'],
  ['"Get" methods should return a value', 'A method named "GetSomething" that returns void and has no out parameter does not get anything; the name hides what it really does.', 'Return the value, or rename the method after its effect.'],
  ['"Get" 메서드는 값을 반환해야 합니다', 'void를 반환하고 out 매개변수도 없는 "GetSomething" 메서드는 아무것도 가져오지 않습니다. 이름이 실제 동작을 숨깁니다.', '값을 반환하거나 하는 일에 맞게 메서드 이름을 바꾸세요.'],
  { kinds: { Method(n, cx) {
    if (!/^Get([A-Z]|$)/.test(n.name) || !n.retType || n.retType.name !== 'void' || n.retType.ptr) return;
    if (dictated(n) || (n.params || []).some((p) => p.mods.includes('out') || p.mods.includes('ref'))) return;
    if (n.params.some((p) => p.type && /^(Action|Func|IList|ICollection|List|Dictionary|IDictionary|HashSet|ISet|StringBuilder|Stream|TextWriter)$/.test(p.type.name))) return;
    cx.report(n, `Make '${n.name}' return a value, or rename it after what it does.`, `'${n.name}'가 값을 반환하게 하거나 하는 일에 맞게 이름을 바꾸세요.`, { atName: true });
  } } });

module.exports = { longAcronym };
