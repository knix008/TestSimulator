'use strict';

// Design rules (.NET reference analyzer design family): visibility of fields and
// constructors, IDisposable / ISerializable / IEquatable patterns, operator
// consistency, overload layout, generics in signatures, type size limits.

const { R } = require('../registry');
const { unparen, dotted, callName, callTarget, forEachChild, hasMod, attrNamed, enclosing } = require('../ast');
const T = require('../types');
const { resolveCall } = require('../types');

function opt(cx, name, def) {
  const o = cx.engine.opts || {};
  return o[name] != null ? o[name] : def;
}

// ───────────────────────────────────────── helpers
function accessOfMods(mods, def) {
  if (!mods || !mods.size) return def;
  if (mods.has('public')) return 'public';
  if (mods.has('protected') && mods.has('internal')) return 'protected internal';
  if (mods.has('private') && mods.has('protected')) return 'private protected';
  if (mods.has('protected')) return 'protected';
  if (mods.has('internal') || mods.has('file')) return 'internal';
  if (mods.has('private')) return 'private';
  return def;
}
function typeAccess(td) { return accessOfMods(td.mods, td.outer ? 'private' : 'internal'); }
function memberAccess(m, td) {
  if (td && td.kind === 'interface') return accessOfMods(m.mods, 'public');
  if (m.iface) return 'public';
  return accessOfMods(m.mods, 'private');
}
const OPEN = new Set(['public', 'protected', 'protected internal']);
function typeVisible(td) {
  for (let d = td; d; d = d.outer) if (!OPEN.has(typeAccess(d))) return false;
  return true;
}
function memberVisible(m, td) { return !!td && OPEN.has(memberAccess(m, td)) && typeVisible(td); }
function isClass(td) { return td.kind === 'class'; }
function firstDecl(td) { return !td.typeInfo || td.typeInfo.decls[0] === td; }
function allMembers(td) { return td.typeInfo ? td.typeInfo.decls.flatMap((d) => d.members) : td.members; }
function directBase(td, name) { return (td.typeInfo ? td.typeInfo.decls : [td]).some((d) => (d.bases || []).some((b) => b.name === name)); }
function hasAttrAny(td, names) { return (td.typeInfo ? td.typeInfo.decls : [td]).some((d) => !!attrNamed(d.attrs, names)); }
function isUnity(td) { return !!td.typeInfo && ['MonoBehaviour', 'ScriptableObject', 'NetworkBehaviour'].some((b) => td.typeInfo.inheritsFrom(b)); }
function typeKey(t) {
  if (!t) return '?';
  const args = (t.args || []).map(typeKey).join(',');
  return `${T.normName(t.name)}${args ? `<${args}>` : ''}${'[]'.repeat(t.ranks || 0)}${t.nullable ? '?' : ''}`;
}
function typeMentions(t, names) {
  if (!t) return false;
  if (names.has(t.name) && (!t.parts || t.parts.length <= 1)) return true;
  for (const a of t.args || []) if (typeMentions(a, names)) return true;
  for (const e of t.tuple || []) if (typeMentions(e.type, names)) return true;
  return false;
}
function methodsNamed(td, name) { return allMembers(td).filter((m) => m.k === 'Method' && m.name === name); }
function opsOf(td) { return allMembers(td).filter((m) => m.k === 'Operator'); }
function overridesEquals(td) {
  return methodsNamed(td, 'Equals').some((m) => hasMod(m, 'override') && m.params.length === 1);
}
function overridesHash(td) { return methodsNamed(td, 'GetHashCode').some((m) => hasMod(m, 'override') && !m.params.length); }
function getterExpr(p) {
  if (p.exprBody) return p.exprBody;
  const g = (p.accessors || []).find((a) => a.kind === 'get');
  if (!g) return null;
  if (g.exprBody) return g.exprBody;
  if (g.body && g.body.stmts.length === 1 && g.body.stmts[0].k === 'Return') return g.body.stmts[0].expr;
  return null;
}
function singleReturn(m) {
  if (m.exprBody) return m.exprBody;
  if (m.body && m.body.stmts.length === 1 && m.body.stmts[0].k === 'Return') return m.body.stmts[0].expr;
  return null;
}
function isOverrideOrIface(m) { return hasMod(m, 'override') || !!m.iface || hasMod(m, 'extern'); }
function visitNoTypes(node, fn) {
  forEachChild(node, (c) => {
    if (c.k === 'TypeDecl' || c.k === 'Delegate') return;
    fn(c);
    visitNoTypes(c, fn);
  });
}

// ───────────────────────────────────────── fields
R('public-field', 'S1104', 'S', 'MI', 10, ['cwe-493', 'pitfall'],
  ['Fields should not have public accessibility', 'A public field exposes the internal state of the class: any caller can change it without validation, and turning it into a property later breaks binary compatibility.', 'Make the field private and expose it through a property.'],
  ['필드를 public으로 두면 안 됩니다', 'public 필드는 클래스 내부 상태를 드러내 누구나 검증 없이 바꿀 수 있고, 나중에 속성으로 바꾸면 바이너리 호환성이 깨집니다.', '필드를 private으로 만들고 속성으로 노출하세요.'],
  { kinds: { Field(n, cx) {
    const td = n.owner;
    if (!td || !isClass(td) || n.isConst || hasMod(n, 'static') || hasMod(n, 'readonly') || hasMod(n, 'const')) return;
    if (memberAccess(n, td) !== 'public' || isUnity(td)) return;
    for (const v of n.vars) cx.report(v, `Make '${v.name}' private and expose it through a property.`, `'${v.name}'를 private으로 만들고 속성으로 노출하세요.`);
  } } });

R('static-mutable-field', 'S2223', 'S', 'CR', 20, ['multi-threading'],
  ['Non-constant static fields should not be visible', 'A visible static field that is not readonly can be changed by any code, at any time, from any thread.', 'Make the field readonly, a constant, private, or replace it with a property.'],
  ['상수가 아닌 static 필드를 외부에 노출하면 안 됩니다', 'readonly가 아닌 노출된 static 필드는 어떤 코드든, 언제든, 어느 스레드에서든 바꿀 수 있습니다.', 'readonly나 상수, private으로 만들거나 속성으로 바꾸세요.'],
  { kinds: { Field(n, cx) {
    const td = n.owner;
    if (!td || td.kind === 'interface' || n.isConst || !hasMod(n, 'static') || hasMod(n, 'readonly')) return;
    if (!OPEN.has(memberAccess(n, td))) return;
    for (const v of n.vars) cx.report(v, `Change the visibility of static field '${v.name}', or make it readonly or constant.`, `static 필드 '${v.name}'의 접근 범위를 줄이거나 readonly 또는 상수로 만드세요.`);
  } } });

R('public-constant', 'S2339', 'S', 'CR', 10, [],
  ['Public constant members should not be used', 'The value of a public const is copied into every assembly that uses it, so changing it later requires recompiling all of them.', 'Use a static readonly field, or reduce the visibility of the constant.'],
  ['public 상수 멤버를 쓰면 안 됩니다', 'public const의 값은 이를 쓰는 모든 어셈블리에 복사되므로 나중에 바꾸면 모두 다시 컴파일해야 합니다.', 'static readonly 필드를 쓰거나 상수의 접근 범위를 줄이세요.'],
  { kinds: { Field(n, cx) {
    const td = n.owner;
    if (!td || !n.isConst || !isClass(td) || !memberVisible(n, td)) return;
    for (const v of n.vars) cx.report(v, `Change '${v.name}' to a 'static readonly' field, or make it non-public.`, `'${v.name}'를 'static readonly' 필드로 바꾸거나 public이 아니게 만드세요.`);
  } } });

R('static-field-generic-type', 'S2743', 'S', 'MA', 10, ['pitfall'],
  ['Static fields should not be used in generic types', 'Every closed construction of a generic type (Box<int>, Box<string> ...) gets its own copy of a static field, which is rarely what the author intended when the field does not depend on the type parameter.', 'Move the field to a non-generic class, or make it depend on the type parameter.'],
  ['제네릭 타입에 static 필드를 두면 안 됩니다', '제네릭 타입을 닫은 형태(Box<int>, Box<string> 등)마다 static 필드가 따로 생깁니다. 필드가 타입 매개변수와 무관하면 대개 의도와 다릅니다.', '필드를 제네릭이 아닌 클래스로 옮기거나 타입 매개변수에 의존하게 만드세요.'],
  { kinds: { Field(n, cx) {
    const td = n.owner;
    if (!td || !td.typeParams || !td.typeParams.length || n.isConst || !hasMod(n, 'static')) return;
    const names = new Set(td.typeParams.map((p) => p.name));
    if (typeMentions(n.type, names)) return;
    for (const v of n.vars) cx.report(v, `A static field '${v.name}' in generic type '${td.name}' is not shared between constructed types.`, `제네릭 타입 '${td.name}'의 static 필드 '${v.name}'는 생성된 타입끼리 공유되지 않습니다.`);
  } } });

R('field-shadows-base-field', 'S2387', 'S', 'BL', 5, ['confusing'],
  ['Child class fields should not shadow parent class fields', 'A field with the same name as an accessible field of the base class hides it: code in the two classes silently works on different variables.', 'Rename the field, or use the base field.'],
  ['자식 클래스 필드가 부모 클래스 필드를 가리면 안 됩니다', '기반 클래스의 접근 가능한 필드와 같은 이름의 필드는 그 필드를 가려 두 클래스 코드가 서로 다른 변수를 쓰게 됩니다.', '필드 이름을 바꾸거나 기반 필드를 쓰세요.'],
  { kinds: { Field(n, cx) {
    const td = n.owner;
    const info = td && td.typeInfo;
    if (!info || !info.baseInfo || n.isConst) return;
    for (const v of n.vars) {
      const hit = info.baseInfo.lookup(v.name);
      if (!hit || !hit.some((e) => e.kind === 'field' && e.access !== 'private')) continue;
      cx.report(v, `'${v.name}' hides the field of the same name in base class '${info.baseInfo.name}'; rename it.`, `'${v.name}'가 기반 클래스 '${info.baseInfo.name}'의 같은 이름 필드를 가립니다. 이름을 바꾸세요.`);
    }
  } } });

R('inner-shadows-outer-static', 'S3218', 'S', 'MA', 10, ['confusing'],
  ['Inner class members should not shadow outer class static or type members', 'A member of a nested type with the name of a static member of the enclosing type hides it inside the nested type, so the unqualified name no longer means what a reader expects.', 'Rename the inner member.'],
  ['내부 클래스 멤버가 외부 클래스의 static 멤버나 타입 멤버를 가리면 안 됩니다', '중첩 타입의 멤버 이름이 바깥 타입의 static 멤버와 같으면 중첩 타입 안에서 그 멤버를 가려, 한정하지 않은 이름의 뜻이 읽는 사람의 예상과 달라집니다.', '내부 멤버 이름을 바꾸세요.'],
  { kinds: { TypeDecl(n, cx) {
    const outer = n.typeInfo && n.typeInfo.outer;
    if (!outer || n.kind === 'enum') return;
    const check = (name, at) => {
      const es = outer.members.get(name);
      if (!es || !es.some((e) => (e.isStatic && e.kind !== 'method') || e.kind === 'type' || (e.kind === 'method' && e.isStatic))) return;
      cx.report(at, `Rename '${name}': it hides a static or type member of '${outer.name}'.`, `'${name}'의 이름을 바꾸세요. '${outer.name}'의 static 멤버나 타입 멤버를 가립니다.`, at.nameLine ? { atName: true } : undefined);
    };
    for (const m of n.members) {
      if (hasMod(m, 'override')) continue;
      if (m.k === 'Field') for (const v of m.vars) check(v.name, v);
      else if (m.k === 'Property' || m.k === 'Method') check(m.name, m);
    }
  } } });

R('static-field-set-in-ctor', 'S3010', 'S', 'MA', 10, ['pitfall'],
  ['Static fields should not be updated in constructors', 'Every new instance overwrites the static value shared by all instances, so the field silently reflects only the most recent object.', 'Initialize the static field in a static constructor or initializer, or make it an instance field.'],
  ['생성자에서 static 필드를 바꾸면 안 됩니다', '인스턴스를 만들 때마다 모든 인스턴스가 공유하는 static 값을 덮어써 필드에는 마지막 객체의 값만 남습니다.', 'static 생성자나 초기화식에서 초기화하거나 인스턴스 필드로 바꾸세요.'],
  { kinds: { Ctor(n, cx) {
    if (hasMod(n, 'static')) return;
    const td = n.owner;
    if (!td) return;
    const body = n.body || n.exprBody;
    if (!body) return;
    const isStaticField = (e) => {
      e = unparen(e);
      if (!e) return null;
      if (e.k === 'Name' && e.msym && e.msym.some((x) => x.kind === 'field' && x.isStatic && x.info === td.typeInfo)) return e.name;
      if (e.k === 'Member' && unparen(e.expr).k === 'Name' && unparen(e.expr).name === td.name) {
        const es = td.typeInfo && td.typeInfo.members.get(e.name);
        if (es && es.some((x) => x.kind === 'field' && x.isStatic)) return e.name;
      }
      return null;
    };
    const visit = (x) => {
      if (x.k === 'Lambda' || x.k === 'LocalFunc') return;
      let name = null;
      if (x.k === 'Assign') name = isStaticField(x.left);
      else if (x.k === 'Unary' && (x.op === '++' || x.op === '--')) name = isStaticField(x.operand);
      if (name) cx.report(x, `Remove this update of static field '${name}' from the constructor.`, `생성자에서 static 필드 '${name}'를 바꾸는 이 코드를 지우세요.`);
      forEachChild(x, visit);
    };
    visit(body);
  } } });

// ───────────────────────────────────────── constructors / class shape
R('abstract-class-public-ctor', 'S3442', 'S', 'MA', 5, ['confusing'],
  ['Abstract classes should not have public constructors', 'Only derived classes can call the constructor of an abstract class, so declaring it public is misleading.', 'Make the constructor protected.'],
  ['추상 클래스에 public 생성자를 두면 안 됩니다', '추상 클래스의 생성자는 파생 클래스만 호출할 수 있어 public으로 선언하면 오해를 부릅니다.', '생성자를 protected로 만드세요.'],
  { kinds: { Ctor(n, cx) {
    const td = n.owner;
    if (!td || !hasMod(td, 'abstract') || hasMod(n, 'static')) return;
    const a = memberAccess(n, td);
    if (a !== 'public' && a !== 'protected internal') return;
    cx.report(n, `Make the constructor of abstract class '${td.name}' protected.`, `추상 클래스 '${td.name}'의 생성자를 protected로 만드세요.`, { atName: true });
  } } });

R('utility-class-ctor', 'S1118', 'S', 'MA', 30, ['design'],
  ['Utility classes should not have public constructors', 'A class with only static members is not meant to be instantiated, yet the implicit or public constructor lets callers create useless instances.', 'Make the class static, or add a private constructor.'],
  ['유틸리티 클래스에 public 생성자를 두면 안 됩니다', 'static 멤버만 있는 클래스는 인스턴스를 만들 이유가 없는데 암시적 또는 public 생성자 때문에 쓸모없는 인스턴스를 만들 수 있습니다.', '클래스를 static으로 만들거나 private 생성자를 추가하세요.'],
  { kinds: { TypeDecl(n, cx) {
    if (!isClass(n) || !firstDecl(n) || hasMod(n, 'static') || hasMod(n, 'abstract') || n.params) return;
    if ((n.typeInfo ? n.typeInfo.decls : [n]).some((d) => d.bases && d.bases.length)) return;
    const ms = allMembers(n).filter((m) => m.k !== 'TypeDecl' && m.k !== 'Delegate' && m.k !== 'ErrorMember');
    const ctors = ms.filter((m) => m.k === 'Ctor' && !hasMod(m, 'static'));
    const others = ms.filter((m) => !(m.k === 'Ctor'));
    if (!others.length) return;
    if (others.some((m) => m.k === 'Operator' || m.k === 'Conversion' || m.k === 'Destructor' || m.k === 'Indexer')) return;
    if (!others.every((m) => hasMod(m, 'static') || m.isConst)) return;
    if (others.some((m) => m.k === 'Method' && m.name === 'Main')) return;
    if (!ctors.length) {
      cx.report(n, `Add a private constructor to '${n.name}', or make the class static.`, `'${n.name}'에 private 생성자를 추가하거나 클래스를 static으로 만드세요.`, { atName: true });
      return;
    }
    for (const c of ctors) {
      const a = memberAccess(c, n);
      if (a === 'private') continue;
      cx.report(c, `Hide this ${a} constructor of utility class '${n.name}'.`, `유틸리티 클래스 '${n.name}'의 이 ${a} 생성자를 숨기세요.`, { atName: true });
    }
  } } });

R('only-private-ctors', 'S3453', 'B', 'MA', 5, ['design'],
  ['Classes should not have only "private" constructors', 'When every constructor is private and the class has no static member or nested type that could call one, nobody can ever create an instance.', 'Make a constructor accessible, or add a static factory member.'],
  ['private 생성자만 있는 클래스를 만들면 안 됩니다', '모든 생성자가 private이고 이를 호출할 static 멤버나 중첩 타입이 없으면 아무도 인스턴스를 만들 수 없습니다.', '생성자 하나를 접근 가능하게 하거나 static 팩터리 멤버를 추가하세요.'],
  { kinds: { TypeDecl(n, cx) {
    if (!isClass(n) || !firstDecl(n) || hasMod(n, 'static') || hasMod(n, 'abstract')) return;
    const ms = allMembers(n);
    const ctors = ms.filter((m) => m.k === 'Ctor' && !hasMod(m, 'static'));
    if (!ctors.length || ctors.some((c) => memberAccess(c, n) !== 'private')) return;
    if (ms.some((m) => m.k === 'TypeDecl' || m.k === 'Delegate' || ((hasMod(m, 'static') || m.isConst) && m.k !== 'Ctor'))) return;
    if (ms.some((m) => m.k === 'ErrorMember') || (n.attrs && n.attrs.length)) return;
    cx.report(n, `Make a constructor of '${n.name}' accessible, or add a static factory: no code can create an instance.`, `'${n.name}'의 생성자 하나를 접근 가능하게 하거나 static 팩터리를 추가하세요. 인스턴스를 만들 수 있는 코드가 없습니다.`, { atName: true });
  } } });

R('abstract-class-shape', 'S1694', 'S', 'MI', 10, ['design'],
  ['An abstract class should have both abstract and concrete members', 'An abstract class with only abstract members and no state is really an interface; one with no abstract member is a concrete class made abstract only to block instantiation.', 'Convert it into an interface, or into a concrete class with a protected constructor.'],
  ['추상 클래스에는 추상 멤버와 구체 멤버가 함께 있어야 합니다', '추상 멤버만 있고 상태가 없는 추상 클래스는 사실상 인터페이스이고, 추상 멤버가 없는 추상 클래스는 인스턴스 생성을 막으려고 abstract를 붙인 구체 클래스입니다.', '인터페이스로 바꾸거나 protected 생성자를 둔 구체 클래스로 바꾸세요.'],
  { kinds: { TypeDecl(n, cx) {
    if (!isClass(n) || !firstDecl(n) || !hasMod(n, 'abstract') || n.params) return;
    if ((n.typeInfo ? n.typeInfo.decls : [n]).some((d) => d.bases && d.bases.length)) return;
    const ms = allMembers(n).filter((m) => m.k !== 'TypeDecl' && m.k !== 'Delegate');
    if (!ms.length || ms.some((m) => m.k === 'ErrorMember')) return;
    const abs = ms.filter((m) => hasMod(m, 'abstract'));
    if (abs.length === ms.length) {
      cx.report(n, `Convert abstract class '${n.name}' into an interface.`, `추상 클래스 '${n.name}'를 인터페이스로 바꾸세요.`, { atName: true });
    } else if (!abs.length && !ms.some((m) => m.k === 'Ctor')) {
      cx.report(n, `Make '${n.name}' a concrete class with a protected constructor, or add abstract members.`, `'${n.name}'를 protected 생성자를 둔 구체 클래스로 만들거나 추상 멤버를 추가하세요.`, { atName: true });
    }
  } } });

R('private-class-not-sealed', 'S3260', 'S', 'MI', 5, ['performance'],
  ['Non-derived "private" classes and records should be "sealed"', 'A private nested class that nothing derives from can be sealed; it documents the intent and lets the runtime devirtualize calls.', 'Add the sealed modifier.'],
  ['파생되지 않는 private 클래스와 레코드는 sealed여야 합니다', '아무도 파생하지 않는 private 중첩 클래스는 sealed로 만들 수 있습니다. 의도를 드러내고 런타임이 가상 호출을 없앨 수 있습니다.', 'sealed 한정자를 추가하세요.'],
  { kinds: { TypeDecl(n, cx) {
    if ((n.kind !== 'class' && n.kind !== 'record') || !n.outer || !firstDecl(n)) return;
    if (typeAccess(n) !== 'private') return;
    if (['sealed', 'static', 'abstract', 'partial'].some((m) => hasMod(n, m))) return;
    if (!n.typeInfo || n.typeInfo.derived.length) return;
    if (allMembers(n).some((m) => hasMod(m, 'virtual'))) return;
    cx.report(n, `Make private ${n.kind} '${n.name}' sealed.`, `private ${n.kind === 'record' ? '레코드' : '클래스'} '${n.name}'를 sealed로 만드세요.`, { atName: true });
  } } });

R('empty-class', 'S2094', 'S', 'MI', 5, ['clumsy'],
  ['Classes should not be empty', 'An empty class with no base type and no attribute carries no behavior or data and only adds noise.', 'Remove the class, or use an interface if it is a marker.'],
  ['빈 클래스를 만들면 안 됩니다', '기반 타입도 특성도 없는 빈 클래스는 동작도 데이터도 없이 잡음만 더합니다.', '클래스를 지우거나 표시용이라면 인터페이스를 쓰세요.'],
  { kinds: { TypeDecl(n, cx) {
    if (!isClass(n) || !firstDecl(n) || n.partial || n.params || n.noBody) return;
    if (n.typeInfo && n.typeInfo.decls.length > 1) return;
    if ((n.bases && n.bases.length) || (n.attrs && n.attrs.length) || n.members.length) return;
    cx.report(n, `Remove empty class '${n.name}'.`, `빈 클래스 '${n.name}'를 지우세요.`, { atName: true });
  } } });

R('empty-interface', 'S4023', 'S', 'MI', 10, ['design'],
  ['Interfaces should not be empty', 'An empty interface declares no contract; as a marker an attribute expresses the intent better.', 'Add members, remove the interface, or use an attribute.'],
  ['빈 인터페이스를 만들면 안 됩니다', '빈 인터페이스는 아무 계약도 선언하지 않습니다. 표시용이라면 특성이 의도를 더 잘 드러냅니다.', '멤버를 추가하거나 인터페이스를 지우거나 특성을 쓰세요.'],
  { kinds: { TypeDecl(n, cx) {
    if (n.kind !== 'interface' || !firstDecl(n) || n.partial || (n.bases && n.bases.length) || n.members.length) return;
    if (n.attrs && n.attrs.length) return;
    cx.report(n, `Remove empty interface '${n.name}', or add members to it.`, `빈 인터페이스 '${n.name}'를 지우거나 멤버를 추가하세요.`, { atName: true });
  } } });

R('too-many-methods', 'S1448', 'S', 'MA', 30, ['brain-overload'],
  ['Types should not have too many methods', 'A type with a very large number of methods usually has too many responsibilities and is hard to understand and change.', 'Split the type into smaller, focused types.'],
  ['타입에 메서드가 너무 많으면 안 됩니다', '메서드가 매우 많은 타입은 대개 책임이 너무 많아 이해하고 바꾸기 어렵습니다.', '타입을 작고 집중된 여러 타입으로 나누세요.'],
  { kinds: { TypeDecl(n, cx) {
    if (!firstDecl(n) || n.kind === 'enum') return;
    const max = opt(cx, 'maxMethods', 35);
    const count = allMembers(n).filter((m) => m.k === 'Method').length;
    if (count <= max) return;
    cx.report(n, `'${n.name}' has ${count} methods, more than the ${max} authorized; split it.`, `'${n.name}'에 메서드가 ${count}개로 허용치 ${max}개보다 많습니다. 나누세요.`, { atName: true });
  } } });

R('class-coupling', 'S1200', 'S', 'MA', 120, ['brain-overload'],
  ['Classes should not be coupled to too many other classes', 'A class that depends on many other types is fragile: a change in any of them can break it, and it is hard to test in isolation.', 'Split the class, or depend on fewer abstractions.'],
  ['클래스가 너무 많은 다른 클래스에 결합되면 안 됩니다', '많은 타입에 의존하는 클래스는 그중 하나만 바뀌어도 깨지기 쉽고 따로 테스트하기 어렵습니다.', '클래스를 나누거나 더 적은 추상화에 의존하세요.'],
  { kinds: { TypeDecl(n, cx) {
    if (!isClass(n) && n.kind !== 'struct' && n.kind !== 'record') return;
    const max = opt(cx, 'maxClassCoupling', 30);
    const own = new Set([n.name, 'var', 'dynamic', 'nint', 'nuint']);
    const tparams = new Set((n.typeParams || []).map((p) => p.name));
    visitNoTypes(n, (c) => { if (c.k === 'TypeParam') tparams.add(c.name); });
    for (const m of n.members) if (m.typeParams) for (const p of m.typeParams) tparams.add(p.name);
    const used = new Set();
    const addType = (t) => {
      if (!t || t.predefined || own.has(t.name) || tparams.has(t.name) || T.VALUE_TYPES.has(T.normName(t.name)) || T.normName(t.name) === 'string' || T.normName(t.name) === 'object') return;
      used.add(t.name);
    };
    for (const b of n.bases || []) addType(b);
    visitNoTypes(n, (c) => { if (c.k === 'Type') addType(c); });
    if (used.size <= max) return;
    cx.report(n, `'${n.name}' is coupled to ${used.size} other types; reduce it to ${max} or less.`, `'${n.name}'가 다른 타입 ${used.size}개에 결합되어 있습니다. ${max}개 이하로 줄이세요.`, { atName: true });
  } } });

// ───────────────────────────────────────── IDisposable / finalizers
R('disposable-pattern', 'S3881', 'S', 'MA', 10, ['pitfall'],
  ['"IDisposable" should be implemented correctly', 'An unsealed class that implements IDisposable should follow the dispose pattern, so derived classes can release their own resources: a protected virtual Dispose(bool) called by Dispose().', 'Add "protected virtual void Dispose(bool disposing)" and call it from Dispose(), or seal the class.'],
  ['IDisposable은 올바르게 구현해야 합니다', 'IDisposable을 구현하는 sealed가 아닌 클래스는 파생 클래스가 자기 자원을 해제할 수 있도록 dispose 패턴, 즉 Dispose()가 호출하는 protected virtual Dispose(bool)을 따라야 합니다.', '"protected virtual void Dispose(bool disposing)"을 추가해 Dispose()에서 호출하거나 클래스를 sealed로 만드세요.'],
  { kinds: { TypeDecl(n, cx) {
    if (!isClass(n) || !firstDecl(n) || hasMod(n, 'sealed') || hasMod(n, 'static')) return;
    if (!directBase(n, 'IDisposable')) return;
    const info = n.typeInfo;
    if (info && info.baseInfo && info.baseInfo.inheritsFrom('IDisposable')) return;
    const ds = methodsNamed(n, 'Dispose');
    if (ds.some((m) => m.params.length === 1 && m.params[0].type && T.normName(m.params[0].type.name) === 'bool' && (hasMod(m, 'virtual') || hasMod(m, 'abstract')))) return;
    cx.report(n, `Fix the implementation of IDisposable in '${n.name}': add 'protected virtual void Dispose(bool disposing)', or seal the class.`, `'${n.name}'의 IDisposable 구현을 고치세요. 'protected virtual void Dispose(bool disposing)'을 추가하거나 클래스를 sealed로 만드세요.`, { atName: true });
  } } });

R('dispose-not-idisposable', 'S2953', 'S', 'CR', 10, ['pitfall'],
  ['Methods named "Dispose" should implement "IDisposable.Dispose"', 'A public Dispose() on a type that does not implement IDisposable is not called by using statements and confuses readers who expect the dispose contract.', 'Implement IDisposable, or rename the method.'],
  ['Dispose라는 메서드는 IDisposable.Dispose를 구현해야 합니다', 'IDisposable을 구현하지 않는 타입의 public Dispose()는 using 문이 호출하지 않으며 dispose 계약을 기대하는 사람을 헷갈리게 합니다.', 'IDisposable을 구현하거나 메서드 이름을 바꾸세요.'],
  { kinds: { Method(n, cx) {
    if (n.name !== 'Dispose' || n.params.length || n.typeParams && n.typeParams.length) return;
    const td = n.owner;
    if (!td || (td.kind !== 'class' && td.kind !== 'struct' && td.kind !== 'record') || hasMod(td, 'ref')) return;
    if (!n.retType || n.retType.name !== 'void' || isOverrideOrIface(n) || memberAccess(n, td) !== 'public') return;
    const info = td.typeInfo;
    if (!info || info.inheritsFrom('IDisposable') || info.inheritsFrom('IAsyncDisposable') || info.externalBases.length || (info.baseInfo && info.baseInfo.hasExternalBase())) return;
    cx.report(n, `Make '${td.name}' implement IDisposable, or rename this 'Dispose' method.`, `'${td.name}'가 IDisposable을 구현하게 하거나 이 'Dispose' 메서드 이름을 바꾸세요.`, { atName: true });
  } } });

R('disposable-field-not-disposed-type', 'S2931', 'B', 'BL', 10, ['cwe-459'],
  ['Classes with "IDisposable" members should implement "IDisposable"', 'The class creates and owns a disposable object in a field but offers no Dispose to release it, so the resource lives until the garbage collector finalizes it, if ever.', 'Implement IDisposable and dispose the field in Dispose().'],
  ['IDisposable 멤버가 있는 클래스는 IDisposable을 구현해야 합니다', '클래스가 필드에 해제 가능한 객체를 만들어 소유하지만 해제할 Dispose가 없어 가비지 수집기가 종료할 때까지(어쩌면 끝까지) 자원이 남습니다.', 'IDisposable을 구현하고 Dispose()에서 필드를 해제하세요.'],
  { kinds: { TypeDecl(n, cx) {
    if (!isClass(n) || !firstDecl(n) || hasMod(n, 'static')) return;
    const info = n.typeInfo;
    if (!info || info.inheritsFrom('IDisposable') || info.inheritsFrom('IAsyncDisposable') || info.hasExternalBase() || info.externalBases.length) return;
    const ms = allMembers(n);
    const fields = new Map();
    for (const m of ms) {
      if (m.k !== 'Field' || hasMod(m, 'static') || m.isConst) continue;
      for (const v of m.vars) fields.set(v.name, v);
    }
    const owned = new Set();
    for (const [name, v] of fields) if (v.init && T.isDisposableCreation(v.init, cx.project)) owned.add(name);
    for (const c of ms) {
      if (c.k !== 'Ctor' || !c.body) continue;
      visitNoTypes(c.body, (x) => {
        if (x.k !== 'Assign' || x.op !== '=') return;
        const l = unparen(x.left);
        const nm = l && (l.k === 'Name' && !l.sym ? l.name : l.k === 'Member' && unparen(l.expr).k === 'This' ? l.name : null);
        if (nm && fields.has(nm) && T.isDisposableCreation(x.right, cx.project)) owned.add(nm);
      });
    }
    for (const name of owned) {
      const v = fields.get(name);
      cx.report(v, `Implement IDisposable in '${n.name}' and dispose field '${name}'.`, `'${n.name}'에 IDisposable을 구현하고 필드 '${name}'를 해제하세요.`);
    }
  } } });

R('disposable-needs-finalizer', 'S4002', 'S', 'MA', 10, ['pitfall'],
  ['Disposable types should declare finalizers', 'A disposable type that holds a raw native handle (IntPtr) leaks the handle when a caller forgets Dispose, unless a finalizer releases it.', 'Add a finalizer that calls Dispose(false), or wrap the handle in a SafeHandle.'],
  ['해제 가능한 타입은 종료자를 선언해야 합니다', '원시 네이티브 핸들(IntPtr)을 가진 해제 가능한 타입은 호출자가 Dispose를 잊으면 종료자가 해제하지 않는 한 핸들이 샙니다.', 'Dispose(false)를 호출하는 종료자를 추가하거나 핸들을 SafeHandle로 감싸세요.'],
  { kinds: { TypeDecl(n, cx) {
    if (!isClass(n) || !firstDecl(n)) return;
    const info = n.typeInfo;
    if (!info || !info.inheritsFrom('IDisposable')) return;
    const ms = allMembers(n);
    if (ms.some((m) => m.k === 'Destructor')) return;
    const handle = ms.find((m) => m.k === 'Field' && !hasMod(m, 'static') && m.type && ['IntPtr', 'UIntPtr'].includes(m.type.name) && !m.type.ranks);
    if (!handle) return;
    cx.report(n, `Add a finalizer to '${n.name}': it is disposable and holds native handle '${handle.vars[0].name}'.`, `'${n.name}'에 종료자를 추가하세요. 해제 가능한 타입이고 네이티브 핸들 '${handle.vars[0].name}'를 가집니다.`, { atName: true });
  } } });

R('suppress-finalize-misuse', 'S3971', 'S', 'MA', 10, ['pitfall'],
  ['"GC.SuppressFinalize" should only be called from "Dispose" with "this"', 'SuppressFinalize belongs to the dispose pattern: called elsewhere, or for another object, it can disable a finalizer that still has work to do.', 'Call GC.SuppressFinalize(this) only from Dispose().'],
  ['GC.SuppressFinalize는 Dispose에서 this로만 호출해야 합니다', 'SuppressFinalize는 dispose 패턴의 일부입니다. 다른 곳에서 또는 다른 객체에 호출하면 아직 할 일이 남은 종료자를 막을 수 있습니다.', 'GC.SuppressFinalize(this)는 Dispose()에서만 호출하세요.'],
  { kinds: { Invocation(n, cx) {
    if (callName(n) !== 'SuppressFinalize' || !/^(System\.)?GC$/.test(dotted(callTarget(n) || {}) || '')) return;
    const m = enclosing(n, ['Method', 'Ctor', 'Accessor', 'Destructor', 'Operator', 'LocalFunc']);
    const inDispose = m && m.k === 'Method' && ['Dispose', 'DisposeAsync'].includes(m.name);
    const arg = n.args[0] && unparen(n.args[0].expr);
    const self = arg && arg.k === 'This';
    if (inDispose && self) return;
    if (!inDispose) cx.report(n, 'Move this call to GC.SuppressFinalize into Dispose().', '이 GC.SuppressFinalize 호출을 Dispose()로 옮기세요.');
    else cx.report(n, "Pass 'this' to GC.SuppressFinalize.", "GC.SuppressFinalize에 'this'를 넘기세요.");
  } } });

// ───────────────────────────────────────── equality / comparison / serialization
R('iequatable-unsealed', 'S4035', 'S', 'MA', 5, ['pitfall'],
  ['Classes implementing "IEquatable<T>" should be sealed', 'In an unsealed class, a derived type inherits Equals(T) that ignores its own fields, so two different derived objects can compare equal.', 'Seal the class.'],
  ['IEquatable<T>을 구현하는 클래스는 sealed여야 합니다', 'sealed가 아닌 클래스에서는 파생 타입이 자기 필드를 무시하는 Equals(T)를 물려받아 다른 두 파생 객체가 같다고 비교될 수 있습니다.', '클래스를 sealed로 만드세요.'],
  { kinds: { TypeDecl(n, cx) {
    if (!isClass(n) || !firstDecl(n) || ['sealed', 'abstract', 'static'].some((m) => hasMod(n, m))) return;
    const eq = (n.typeInfo ? n.typeInfo.decls : [n]).some((d) => (d.bases || []).some((b) => b.name === 'IEquatable' && b.args.length === 1 && b.args[0] && b.args[0].name === n.name));
    if (!eq) return;
    cx.report(n, `Seal class '${n.name}' or implement IEquatable<${n.name}> differently.`, `클래스 '${n.name}'를 sealed로 만들거나 IEquatable<${n.name}>을 다르게 구현하세요.`, { atName: true });
  } } });

R('iequatable-missing', 'S3897', 'S', 'MI', 5, ['api-design'],
  ['Classes that provide "Equals(<T>)" should implement "IEquatable<T>"', 'A typed Equals(T) without IEquatable<T> is not found by generic collections and comparers, which fall back to the slower Equals(object).', 'Add IEquatable<T> to the base list.'],
  ['Equals(<T>)를 제공하는 클래스는 IEquatable<T>를 구현해야 합니다', 'IEquatable<T> 없이 만든 형식 지정 Equals(T)는 제네릭 컬렉션과 비교자가 찾지 못해 더 느린 Equals(object)를 씁니다.', '기반 목록에 IEquatable<T>를 추가하세요.'],
  { kinds: { Method(n, cx) {
    const td = n.owner;
    if (!td || (td.kind !== 'class' && td.kind !== 'struct') || n.name !== 'Equals' || n.params.length !== 1 || hasMod(n, 'static')) return;
    const p = n.params[0].type;
    if (!p || p.name !== td.name || memberAccess(n, td) !== 'public') return;
    if (directBase(td, 'IEquatable') || (td.typeInfo && td.typeInfo.inheritsFrom('IEquatable'))) return;
    cx.report(n, `Implement IEquatable<${td.name}> in '${td.name}' for this Equals method.`, `이 Equals 메서드를 위해 '${td.name}'에 IEquatable<${td.name}>을 구현하세요.`, { atName: true });
  } } });

R('icomparable-without-operators', 'S1210', 'S', 'MI', 30, ['api-design'],
  ['"Equals" and the comparison operators should be overridden when implementing "IComparable"', 'A type with a natural order should let callers use ==, <, > and Equals consistently with CompareTo.', 'Override Equals and define the comparison operators.'],
  ['IComparable을 구현하면 Equals와 비교 연산자도 재정의해야 합니다', '자연스러운 순서가 있는 타입은 호출자가 ==, <, >, Equals를 CompareTo와 일관되게 쓸 수 있어야 합니다.', 'Equals를 재정의하고 비교 연산자를 정의하세요.'],
  { kinds: { TypeDecl(n, cx) {
    if ((n.kind !== 'class' && n.kind !== 'struct') || !firstDecl(n) || !typeVisible(n)) return;
    if (!directBase(n, 'IComparable')) return;
    const ops = new Set(opsOf(n).map((o) => o.op));
    const missing = [];
    if (!overridesEquals(n)) missing.push('Equals');
    for (const op of ['==', '!=', '<', '>']) if (!ops.has(op)) missing.push(`operator${op}`);
    if (!missing.length) return;
    const list = missing.join(', ');
    cx.report(n, `When implementing IComparable, '${n.name}' should also define ${list}.`, `IComparable을 구현하는 '${n.name}'는 ${list}도 정의해야 합니다.`, { atName: true });
  } } });

R('operators-inconsistent', 'S4050', 'S', 'MA', 10, ['pitfall'],
  ['Operators should be overloaded consistently', 'A type that defines == must also override Equals and GetHashCode, and one with + or - should define ==; otherwise collections and callers see two different equalities.', 'Add the missing overrides and operators.'],
  ['연산자는 일관되게 오버로드해야 합니다', '==를 정의한 타입은 Equals와 GetHashCode도 재정의해야 하고, +나 -를 정의한 타입은 ==도 정의해야 합니다. 그렇지 않으면 컬렉션과 호출자가 서로 다른 동등성을 봅니다.', '빠진 재정의와 연산자를 추가하세요.'],
  { kinds: { TypeDecl(n, cx) {
    if ((n.kind !== 'class' && n.kind !== 'struct') || !firstDecl(n)) return;
    const ops = opsOf(n);
    const eq = ops.find((o) => o.op === '==');
    if (eq) {
      const missing = [];
      if (!overridesEquals(n)) missing.push('Equals(object)');
      if (!overridesHash(n)) missing.push('GetHashCode()');
      if (missing.length) cx.report(eq, `'${n.name}' defines operator== but does not override ${missing.join(' and ')}.`, `'${n.name}'가 operator==를 정의하지만 ${missing.join(', ')}를 재정의하지 않습니다.`);
      return;
    }
    const arith = ops.find((o) => (o.op === '+' || o.op === '-') && o.params.length === 2);
    if (arith) cx.report(arith, `'${n.name}' defines operator${arith.op} and should also define operator==.`, `'${n.name}'가 operator${arith.op}를 정의하므로 operator==도 정의해야 합니다.`);
  } } });

R('reference-type-equality-operator', 'S3875', 'S', 'MA', 30, ['pitfall'],
  ['"operator==" should not be overloaded on reference types', 'Callers expect == on a class to mean reference identity; overloading it on a type that is not value-like breaks that expectation.', 'Remove the operator and override Equals instead, or make the type a struct or record.'],
  ['참조 타입에서 operator==를 오버로드하면 안 됩니다', '호출자는 클래스의 ==가 참조 동일성이라고 기대합니다. 값 같은 타입이 아닌데 오버로드하면 이 기대가 깨집니다.', '연산자를 지우고 Equals를 재정의하거나 타입을 struct나 record로 만드세요.'],
  { kinds: { Operator(n, cx) {
    const td = n.owner;
    if (!td || td.kind !== 'class' || n.op !== '==') return;
    if (opsOf(td).some((o) => o.op === '+' || o.op === '-')) return;
    cx.report(n, `Remove operator== from reference type '${td.name}'.`, `참조 타입 '${td.name}'에서 operator==를 지우세요.`);
  } } });

R('serializable-pattern', 'S3925', 'S', 'MA', 10, ['pitfall'],
  ['"ISerializable" should be implemented correctly', 'A type implementing ISerializable needs the [Serializable] attribute and a protected serialization constructor (SerializationInfo, StreamingContext), or deserialization fails at run time.', 'Add [Serializable] and the serialization constructor.'],
  ['ISerializable은 올바르게 구현해야 합니다', 'ISerializable을 구현하는 타입에는 [Serializable] 특성과 protected 직렬화 생성자(SerializationInfo, StreamingContext)가 있어야 합니다. 없으면 역직렬화가 실행 중에 실패합니다.', '[Serializable]과 직렬화 생성자를 추가하세요.'],
  { kinds: { TypeDecl(n, cx) {
    if ((n.kind !== 'class' && n.kind !== 'struct') || !firstDecl(n) || !directBase(n, 'ISerializable')) return;
    const missing = [];
    if (!hasAttrAny(n, ['Serializable'])) missing.push('[Serializable]');
    const ok = allMembers(n).some((m) => m.k === 'Ctor' && m.params.length === 2 && m.params[0].type && m.params[0].type.name === 'SerializationInfo' && m.params[1].type && m.params[1].type.name === 'StreamingContext');
    if (!ok) missing.push('a serialization constructor');
    if (!missing.length) return;
    cx.report(n, `Add ${missing.join(' and ')} to '${n.name}'.`, `'${n.name}'에 ${missing.join(', ')}를 추가하세요.`, { atName: true });
  } } });

// ───────────────────────────────────────── members and overloads
R('overload-default-params', 'S3427', 'S', 'BL', 15, ['pitfall'],
  ['Method overloads with default parameter values should not overlap', 'When another overload matches the required parameters of a method with default values, calls that omit the optional arguments always bind to the other overload and the defaults are never used.', 'Remove the overlap: merge the overloads or drop the default values.'],
  ['기본값 매개변수가 있는 메서드 오버로드가 겹치면 안 됩니다', '기본값이 있는 메서드의 필수 매개변수와 맞는 다른 오버로드가 있으면 선택 인수를 생략한 호출은 늘 다른 오버로드로 가서 기본값이 쓰이지 않습니다.', '겹침을 없애세요. 오버로드를 합치거나 기본값을 지우세요.'],
  { kinds: { TypeDecl(n, cx) {
    if (!firstDecl(n)) return;
    const byName = new Map();
    for (const m of allMembers(n)) if (m.k === 'Method') { if (!byName.has(m.name)) byName.set(m.name, []); byName.get(m.name).push(m); }
    for (const [name, ms] of byName) {
      if (ms.length < 2) continue;
      for (const m1 of ms) {
        const req = m1.params.filter((p) => !p.def).length;
        if (req === m1.params.length || m1.params.some((p) => p.mods.includes('params'))) continue;
        const hit = ms.find((m2) => m2 !== m1 && (m2.typeParams || []).length === (m1.typeParams || []).length && m2.params.length >= req && m2.params.length < m1.params.length
          && !m2.params.some((p) => p.def || p.mods.includes('params'))
          && m2.params.every((p, i) => typeKey(p.type) === typeKey(m1.params[i].type)));
        if (!hit) continue;
        cx.report(m1, `This overload of '${name}' overlaps the one with ${hit.params.length} parameter(s) at line ${hit.nameLine || hit.line}; its default values are never used.`,
          `이 '${name}' 오버로드가 ${hit.nameLine || hit.line}행의 매개변수 ${hit.params.length}개짜리 오버로드와 겹쳐 기본값이 쓰이지 않습니다.`, { atName: true });
      }
    }
  } } });

R('overloads-not-adjacent', 'S4136', 'S', 'MI', 5, ['convention'],
  ['Method overloads should be grouped together', 'Overloads scattered through a type are easy to miss when reading or changing the method.', 'Move the overloads next to each other.'],
  ['메서드 오버로드는 함께 모아야 합니다', '타입 곳곳에 흩어진 오버로드는 메서드를 읽거나 바꿀 때 놓치기 쉽습니다.', '오버로드를 서로 붙여 두세요.'],
  { kinds: { TypeDecl(n, cx) {
    if (n.kind === 'enum') return;
    const seen = new Set();
    const reported = new Set();
    let prev = null;
    for (const m of n.members) {
      if (m.k === 'Method') {
        if (seen.has(m.name) && !(prev && prev.k === 'Method' && prev.name === m.name) && !reported.has(m.name)) {
          reported.add(m.name);
          cx.report(m, `Move this overload of '${m.name}' next to the other overloads.`, `이 '${m.name}' 오버로드를 다른 오버로드 옆으로 옮기세요.`, { atName: true });
        }
        seen.add(m.name);
      }
      prev = m;
    }
  } } });

R('event-never-raised', 'S3264', 'S', 'MA', 5, ['unused'],
  ['Events should be invoked', 'An event that the class never raises lets callers subscribe to something that never happens.', 'Raise the event where it should happen, or remove it.'],
  ['이벤트는 발생시켜야 합니다', '클래스가 한 번도 발생시키지 않는 이벤트는 호출자가 결코 일어나지 않을 일을 구독하게 합니다.', '알맞은 곳에서 이벤트를 발생시키거나 지우세요.'],
  { kinds: { TypeDecl(n, cx) {
    if ((n.kind !== 'class' && n.kind !== 'struct' && n.kind !== 'record') || !firstDecl(n) || hasMod(n, 'abstract')) return;
    const evs = [];
    for (const m of allMembers(n)) {
      if (m.k !== 'Event' || !m.fieldLike || m.iface) continue;
      if (['abstract', 'virtual', 'override', 'extern'].some((x) => hasMod(m, x))) continue;
      for (const v of m.vars) evs.push(v);
    }
    if (!evs.length) return;
    const raised = new Set();
    const names = new Set(evs.map((v) => v.name));
    for (const d of n.typeInfo ? n.typeInfo.decls : [n]) {
      const visit = (x) => {
        if ((x.k === 'Name' || (x.k === 'Member' && unparen(x.expr).k === 'This')) && names.has(x.name)) {
          const p = x.parent;
          const sub = p && p.k === 'Assign' && (p.op === '+=' || p.op === '-=') && p.left === x;
          if (!sub) raised.add(x.name);
        }
        forEachChild(x, visit);
      };
      visit(d);
    }
    for (const v of evs) {
      if (raised.has(v.name)) continue;
      cx.report(v, `Raise event '${v.name}' somewhere, or remove it.`, `이벤트 '${v.name}'를 어딘가에서 발생시키거나 지우세요.`);
    }
  } } });

R('pinvoke-visible', 'S4214', 'S', 'MA', 5, ['api-design'],
  ['"P/Invoke" methods should not be visible', 'A public extern method lets any caller reach native code directly, skipping the argument checks and error handling a managed wrapper provides.', 'Make the P/Invoke method private or internal and expose a managed wrapper.'],
  ['P/Invoke 메서드를 노출하면 안 됩니다', 'public extern 메서드는 관리 래퍼가 하는 인수 검사와 오류 처리를 건너뛰고 누구나 네이티브 코드에 바로 닿게 합니다.', 'P/Invoke 메서드를 private이나 internal로 만들고 관리 래퍼를 노출하세요.'],
  { kinds: { Method(n, cx) {
    if (!attrNamed(n.attrs, ['DllImport', 'LibraryImport'])) return;
    const td = n.owner;
    if (!td || !memberVisible(n, td)) return;
    cx.report(n, `Make P/Invoke method '${n.name}' private or internal.`, `P/Invoke 메서드 '${n.name}'를 private이나 internal로 만드세요.`, { atName: true });
  } } });

R('indexer-param-type', 'S3876', 'S', 'MI', 10, ['api-design'],
  ['Strings or integral types should be used for indexers', 'Indexers are expected to look up by position or by key; other parameter types make the syntax obscure, and a method with a meaningful name reads better.', 'Use an integral or string parameter, or replace the indexer with a method.'],
  ['인덱서에는 문자열이나 정수 타입을 써야 합니다', '인덱서는 위치나 키로 찾는 것이라고 기대합니다. 다른 매개변수 타입은 문법을 모호하게 하므로 의미 있는 이름의 메서드가 더 읽기 좋습니다.', '정수나 문자열 매개변수를 쓰거나 인덱서를 메서드로 바꾸세요.'],
  { kinds: { Indexer(n, cx) {
    const td = n.owner;
    if (!td || n.params.length !== 1 || n.iface || hasMod(n, 'override')) return;
    const t = n.params[0].type;
    if (!t || t.ranks) return;
    const nm = T.normName(t.name);
    if (T.INTEGRAL.has(nm) || ['string', 'object', 'Index', 'Range', 'dynamic'].includes(nm)) return;
    if ((td.typeParams || []).some((p) => p.name === t.name)) return;
    const arr = cx.project.typesByName.get(t.name);
    if (arr && arr.some((i) => i.kind === 'enum')) return;
    cx.report(n.params[0], `Use a string or integral type for this indexer instead of '${t.name}'.`, `이 인덱서에 '${t.name}' 대신 문자열이나 정수 타입을 쓰세요.`, { atName: true });
  } } });

R('property-copies-collection', 'S2365', 'S', 'CR', 30, ['performance'],
  ['Properties should not make collection or array copies', 'Callers treat a property as cheap; one that copies a collection on every read wastes memory and lets loops like for (i < x.Items.Length) copy it again and again.', 'Turn the property into a method, or return a read-only view.'],
  ['속성이 컬렉션이나 배열을 복사하면 안 됩니다', '호출자는 속성을 가벼운 것으로 여깁니다. 읽을 때마다 컬렉션을 복사하는 속성은 메모리를 낭비하고 for (i < x.Items.Length) 같은 반복에서 계속 복사합니다.', '속성을 메서드로 바꾸거나 읽기 전용 뷰를 반환하세요.'],
  { kinds: { Property(n, cx) {
    const e = unparen(getterExpr(n));
    if (!e) return;
    let copy = false;
    if (e.k === 'Invocation') copy = ['ToArray', 'ToList', 'Clone', 'ToDictionary', 'ToHashSet'].includes(callName(e)) && !!callTarget(e);
    else if (e.k === 'New' && e.type && T.CONCRETE_COLLECTIONS.has(e.type.name) && e.args.length === 1) copy = true;
    if (!copy) return;
    cx.report(n, `Refactor property '${n.name}' into a method: it copies a collection on every read.`, `속성 '${n.name}'를 메서드로 바꾸세요. 읽을 때마다 컬렉션을 복사합니다.`, { atName: true });
  } } });

R('method-should-be-property', 'S4049', 'S', 'MI', 5, ['api-design'],
  ['Properties should be preferred', 'A public parameterless Get method that just returns a value is a property in disguise; a property is the idiomatic way to expose it.', 'Convert the method into a property.'],
  ['속성을 우선 써야 합니다', '값만 반환하는 매개변수 없는 public Get 메서드는 사실상 속성입니다. 속성으로 노출하는 것이 C# 관례입니다.', '메서드를 속성으로 바꾸세요.'],
  { kinds: { Method(n, cx) {
    if (!/^Get[A-Z]/.test(n.name) || n.params.length || (n.typeParams && n.typeParams.length)) return;
    const td = n.owner;
    if (!td || td.kind === 'interface' || !memberVisible(n, td) || isOverrideOrIface(n) || hasMod(n, 'virtual') || hasMod(n, 'abstract') || hasMod(n, 'async')) return;
    const rt = n.retType;
    if (!rt || rt.name === 'void' || rt.ranks || rt.name === 'Task' || rt.name === 'ValueTask' || n.refRet) return;
    const e = unparen(singleReturn(n));
    if (!e) return;
    const simple = e.k === 'Name' || e.k === 'Literal' || (e.k === 'Member' && (unparen(e.expr).k === 'This' || unparen(e.expr).k === 'Name'));
    if (!simple) return;
    const prop = n.name.slice(3);
    cx.report(n, `Convert method '${n.name}' into property '${prop}'.`, `메서드 '${n.name}'를 속성 '${prop}'로 바꾸세요.`, { atName: true });
  } } });

R('collection-property-writable', 'S4004', 'S', 'MA', 5, ['api-design'],
  ['Collection properties should be readonly', 'A public setter on a collection property lets callers replace the whole collection, which is rarely intended; they can already add and remove items.', 'Remove the setter, or make it private.'],
  ['컬렉션 속성은 읽기 전용이어야 합니다', '컬렉션 속성의 public setter는 호출자가 컬렉션 전체를 바꿔치게 합니다. 항목 추가와 제거는 이미 할 수 있으므로 대개 의도가 아닙니다.', 'setter를 지우거나 private으로 만드세요.'],
  { kinds: { Property(n, cx) {
    const td = n.owner;
    if (!td || td.kind === 'interface' || !memberVisible(n, td) || hasMod(n, 'override') || n.iface) return;
    if ((n.attrs && n.attrs.length) || hasAttrAny(td, ['Serializable', 'DataContract'])) return;
    const t = n.type;
    if (!t || t.ranks || !T.COLLECTIONS.has(t.name) || t.name === 'IEnumerable' || /^IReadOnly/.test(t.name)) return;
    const set = (n.accessors || []).find((a) => a.kind === 'set');
    if (!set || (set.mods && set.mods.size)) return;
    cx.report(n, `Make collection property '${n.name}' read-only by removing its setter or making it private.`, `컬렉션 속성 '${n.name}'의 setter를 지우거나 private으로 만들어 읽기 전용으로 만드세요.`, { atName: true });
  } } });

R('localizable-literal', 'S4055', 'S', 'MI', 5, ['localisation'],
  ['Literals should not be passed as localized parameters', 'A hard-coded string shown to the user cannot be translated.', 'Load the text from a resource file.'],
  ['지역화할 매개변수에 리터럴을 넘기면 안 됩니다', '사용자에게 보이는 하드코딩 문자열은 번역할 수 없습니다.', '리소스 파일에서 텍스트를 읽으세요.'],
  { kinds: { Invocation(n, cx) {
    const lit = (a) => { const e = a && unparen(a.expr); return e && e.k === 'Literal' && e.kind === 'string' && /[A-Za-z가-힣]/.test(e.value) ? e : null; };
    if (callName(n) === 'Show' && /(^|\.)MessageBox$/.test(dotted(callTarget(n) || {}) || '')) {
      for (const a of n.args.slice(0, 2)) {
        const e = lit(a);
        if (e) cx.report(e, 'Replace this literal with a string loaded from a resource.', '이 리터럴을 리소스에서 읽은 문자열로 바꾸세요.');
      }
      return;
    }
    const ms = resolveCall(n, cx.project);
    if (!ms || ms.length !== 1) return;
    const ps = ms[0].node.params;
    n.args.forEach((a, i) => {
      const p = a.name ? ps.find((x) => x.name === a.name) : ps[i];
      if (!p || !p.attrs) return;
      const loc = attrNamed(p.attrs, ['Localizable']);
      if (!loc) return;
      const v = loc.args[0] && unparen(loc.args[0].expr);
      if (v && v.k === 'Literal' && v.value === false) return;
      const e = lit(a);
      if (e) cx.report(e, `Replace this literal passed to localizable parameter '${p.name}' with a resource string.`, `지역화할 매개변수 '${p.name}'에 넘긴 이 리터럴을 리소스 문자열로 바꾸세요.`);
    });
  } } });

// ───────────────────────────────────────── signatures
const NESTED_OK = new Set(['Func', 'Action', 'Expression', 'Predicate', 'Converter', 'Comparison', 'Task', 'ValueTask', 'Nullable', 'IAsyncEnumerable']);
R('nested-generic-signature', 'S4017', 'S', 'MA', 10, ['api-design'],
  ['Method signatures should not contain nested generic types', 'Parameters like List<Dictionary<string, int>> are hard to read and to construct for callers.', 'Introduce a named type for the inner generic, or simplify the signature.'],
  ['메서드 시그니처에 중첩 제네릭 타입을 쓰면 안 됩니다', 'List<Dictionary<string, int>> 같은 매개변수는 호출자가 읽고 만들기 어렵습니다.', '안쪽 제네릭에 이름 있는 타입을 만들거나 시그니처를 단순하게 하세요.'],
  { kinds: { Method(n, cx) {
    const td = n.owner;
    if (!td || !memberVisible(n, td) || isOverrideOrIface(n)) return;
    for (const p of n.params) {
      const t = p.type;
      if (!t || NESTED_OK.has(t.name) || !t.args.length) continue;
      if (!t.args.some((a) => a && a.args && a.args.length && !NESTED_OK.has(a.name))) continue;
      cx.report(p, `Refactor this method to remove the nested generic type of parameter '${p.name}'.`, `매개변수 '${p.name}'의 중첩 제네릭 타입을 없애도록 이 메서드를 고치세요.`, { atName: true });
    }
  } } });

R('type-param-not-inferable', 'S4018', 'S', 'MA', 10, ['api-design'],
  ['All type parameters should be used in the parameter list to enable type inference', 'A type parameter that appears in no parameter cannot be inferred, so every caller must spell out the type arguments.', 'Use the type parameter in a parameter, or remove it.'],
  ['형식 유추가 되도록 모든 타입 매개변수를 매개변수 목록에 써야 합니다', '어떤 매개변수에도 나오지 않는 타입 매개변수는 유추할 수 없어 모든 호출자가 타입 인수를 직접 써야 합니다.', '타입 매개변수를 매개변수에 쓰거나 지우세요.'],
  { kinds: { Method(n, cx) {
    const td = n.owner;
    if (!td || !n.typeParams || !n.typeParams.length || !n.params.length || !memberVisible(n, td) || isOverrideOrIface(n)) return;
    const missing = n.typeParams.filter((tp) => !n.params.some((p) => typeMentions(p.type, new Set([tp.name]))));
    if (!missing.length) return;
    const list = missing.map((x) => x.name).join(', ');
    cx.report(n, `Use type parameter(s) ${list} of '${n.name}' in its parameter list to enable type inference.`, `형식 유추가 되도록 '${n.name}'의 타입 매개변수 ${list}를 매개변수 목록에 쓰세요.`, { atName: true });
  } } });

R('multidimensional-array-param', 'S2368', 'S', 'MA', 10, ['api-design'],
  ['Public methods should not have multidimensional array parameters', 'Multidimensional and jagged array parameters are awkward to build and easy to misuse for callers.', 'Use a collection type or a dedicated type instead.'],
  ['public 메서드에 다차원 배열 매개변수를 쓰면 안 됩니다', '다차원 배열과 가변 배열 매개변수는 호출자가 만들기 번거롭고 잘못 쓰기 쉽습니다.', '컬렉션 타입이나 전용 타입을 쓰세요.'],
  { kinds: { Method(n, cx) {
    const td = n.owner;
    if (!td || !memberVisible(n, td) || isOverrideOrIface(n)) return;
    for (const p of n.params) {
      const t = p.type;
      if (!t || !t.ranks || p.mods.includes('params')) continue;
      const suffix = cx.src.slice(t.end, t.end + 40).match(/^(\s*(\?|\[[\s,]*\]))*/);
      const multi = t.ranks > 1 || (suffix && suffix[0].includes(','));
      if (!multi) continue;
      cx.report(p, `Change parameter '${p.name}' so it is not a multidimensional array.`, `매개변수 '${p.name}'가 다차원 배열이 아니도록 바꾸세요.`, { atName: true });
    }
  } } });

R('out-ref-parameter', 'S3874', 'S', 'MA', 15, ['api-design'],
  ['"out" and "ref" parameters should not be used', 'Out and ref parameters make a method harder to call and to understand; returning a value (or a tuple) is clearer.', 'Return the values instead, except for the Try pattern.'],
  ['out과 ref 매개변수를 쓰면 안 됩니다', 'out과 ref 매개변수는 메서드를 호출하고 이해하기 어렵게 합니다. 값이나 튜플을 반환하는 편이 명확합니다.', 'Try 패턴이 아니라면 값을 반환하세요.'],
  { kinds: { Method(n, cx) {
    const td = n.owner;
    if (!td || !memberVisible(n, td) || isOverrideOrIface(n) || /^Try[A-Z]?/.test(n.name) || n.name === 'Deconstruct') return;
    if (attrNamed(n.attrs, ['DllImport', 'LibraryImport'])) return;
    for (const p of n.params) {
      const k = p.mods.find((x) => x === 'out' || x === 'ref');
      if (!k) continue;
      cx.report(p, `Consider refactoring this method so it does not use '${k}' parameter '${p.name}'.`, `'${k}' 매개변수 '${p.name}'를 쓰지 않도록 이 메서드를 고치는 것을 고려하세요.`, { atName: true });
    }
  } } });

R('optional-parameter', 'S2360', 'S', 'MA', 10, ['api-design'],
  ['Optional parameters should not be used', 'Default values are compiled into the callers, so changing a default later does not reach already compiled callers, and other .NET languages may not support them.', 'Use overloads instead of default values.'],
  ['선택적 매개변수를 쓰면 안 됩니다', '기본값은 호출하는 쪽에 컴파일되어 들어가므로 나중에 기본값을 바꿔도 이미 컴파일된 호출자에는 반영되지 않고, 다른 .NET 언어가 지원하지 않을 수도 있습니다.', '기본값 대신 오버로드를 쓰세요.'],
  { kinds: {
    Method(n, cx) { optionalParams(n, cx); },
    Ctor(n, cx) { optionalParams(n, cx); },
  } });
function optionalParams(n, cx) {
  const td = n.owner;
  if (!td || !memberVisible(n, td) || isOverrideOrIface(n)) return;
  for (const p of n.params) {
    if (!p.def) continue;
    if (attrNamed(p.attrs, ['CallerMemberName', 'CallerFilePath', 'CallerLineNumber', 'CallerArgumentExpression'])) continue;
    cx.report(p, `Use an overload instead of the default value of parameter '${p.name}'.`, `매개변수 '${p.name}'의 기본값 대신 오버로드를 쓰세요.`, { atName: true });
  }
}

module.exports = {};
