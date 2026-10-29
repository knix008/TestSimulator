'use strict';

// Scope-based rules: unused imports / variables / parameters / private
// members, undefined names.

const { define } = require('./def');
const { FUNC_TYPES, dotted, walk, walkLocal } = require('../ast');
const U = require('./util');
const { overriddenBelow } = require('./bugs');

const RULES = [];
const R = define(RULES);

function allNames(c) {
  if (c._allNames) return c._allNames;
  const s = new Set();
  for (const st of c.mod.module.body) {
    if ((st.type === 'Assign' || st.type === 'AugAssign') && (st.targets ? st.targets : [st.target]).some((t) => t.type === 'Name' && t.id === '__all__')) {
      walk(st.value, (n) => { if (n.type === 'Constant' && n.kind === 'str') s.add(n.value); return true; });
    }
  }
  c._allNames = s;
  return s;
}

// identifiers mentioned in string annotations and type comments
function typeMentions(c) {
  if (c._typeMentions) return c._typeMentions;
  const s = new Set();
  const addText = (t) => { for (const m of String(t).match(/[A-Za-z_][A-Za-z0-9_]*/g) || []) s.add(m); };
  for (const n of c.mod.allNodes) {
    if (n.type === 'Constant' && n.kind === 'str' && n.value.length < 200 && U.insideTypeContext(n)) addText(n.value);
    if (n.type === 'Constant' && n.kind === 'str' && n.parent && n.parent.type === 'Subscript' && n.value.length < 200) addText(n.value);
    if (n.type === 'Constant' && n.kind === 'str' && n.parent && n.parent.type === 'Call' && /(?:^|\.)(?:cast|TypeVar|NewType|ForwardRef)$/.test(dotted(n.parent.func) || '')) addText(n.value);
  }
  for (const cm of c.comments) if (/#\s*type:/.test(cm.text)) addText(cm.text.replace(/^#\s*type:/, ''));
  c._typeMentions = s;
  return s;
}

// A suppression comment on the alias line, or anywhere from the statement's
// first line down to it (from x import (  # noqa: F401 / a, / b)).
function noqa(c, line, from = line) {
  for (let n = Math.min(from, line); n <= line; n++) {
    const t = c.lines[n - 1] || '';
    if (/#\s*noqa(?![:\w])|#\s*noqa:\s*[^#]*\bF401\b|#\s*pylint:\s*disable=[\w,-]*unused-import/i.test(t)) return true;
  }
  return false;
}

function inAvailabilityTry(stmt) {
  let child = stmt;
  for (let p = stmt.parent; p && p.type !== 'Module' && !FUNC_TYPES.has(p.type); p = p.parent) {
    if ((p.type === 'Try' || p.type === 'TryStar') && p.body.includes(child)) {
      if (p.handlers.some((h) => !h.etype || /ImportError|ModuleNotFoundError|Exception|BaseException|AttributeError|OSError/.test(dotted(h.etype) || (h.etype.type === 'Tuple' ? h.etype.elts.map((e) => dotted(e)).join(',') : '')))) return true;
    }
    if (p.type === 'If' && /TYPE_CHECKING|version_info|platform|PY2|PY3/.test(JSON.stringify(dotted(p.test) || '') + (p.test.type === 'Compare' ? dotted(p.test.left) || '' : ''))) return true;
    child = p;
  }
  return false;
}

R('unused-import', 'S', 'MI', 2, ['unused'], 'S1128',
  ['Unused import', '사용하지 않는 import'],
  ['An import that is never used slows start-up, hides real dependencies and clutters the module.', '쓰지 않는 import는 시작을 느리게 하고 실제 의존성을 가리며 모듈을 어지럽힙니다.'],
  ['Remove the import.', 'import를 지우세요.'],
  {
    module(c, r) {
      if (c.isStub) return;
      const all = allNames(c);
      const mentions = typeMentions(c);
      for (const sc of c.mod.scopes.scopes) {
        if (sc.kind === 'class') continue;
        if (sc.kind === 'module' && c.mod.isPackageInit) continue;
        for (const sym of sc.symbols.values()) {
          if (sym.uses.length) continue;
          for (const b of sym.bindings) {
            if (b.kind !== 'import') continue;
            const a = b.node;
            const st = b.stmt;
            if (st.type === 'ImportFrom' && st.module === '__future__') continue;
            if (a.asname && a.asname === a.name) continue; // explicit re-export
            if (all.has(sym.name) || mentions.has(sym.name)) continue;
            if (noqa(c, a.line, st.line || a.line) || inAvailabilityTry(st)) continue;
            if (sym.bindings.length > 1 && sym.bindings.some((x) => x.kind !== 'import')) continue;
            if (sc.kind === 'module' && sym.globalAssigned) continue;
            const label = st.type === 'Import' ? a.name : `${st.module || '.'.repeat(st.level)}.${a.name}`;
            r.report(a, `Remove this unused import of '${label}'.`, `사용하지 않는 '${label}' import를 지우세요.`);
          }
        }
      }
    },
  });

R('unused-variable', 'S', 'MI', 5, ['unused'], 'S1481',
  ['Unused local variable', '사용하지 않는 지역 변수'],
  ['A local variable that is assigned but never read is dead code or a sign that the wrong variable is used later.', '대입만 하고 읽지 않는 지역 변수는 죽은 코드이거나 나중에 엉뚱한 변수를 쓰고 있다는 신호입니다.'],
  ['Remove the variable (or name it _ when a value must be ignored).', '변수를 지우세요(값을 버려야 한다면 _로 이름 붙이세요).'],
  {
    module(c, r) {
      for (const sc of c.mod.scopes.scopes) {
        if (sc.kind !== 'function' || sc.dynamic) continue;
        const fn = sc.node;
        if (fn.hasError) continue;
        for (const sym of sc.symbols.values()) {
          if (sym.uses.length || sym.name.startsWith('_') || sym.nonlocalAssigned || sym.globalAssigned) continue;
          if (sym.name === '__tracebackhide__' || sym.name === '__traceback_info__') continue;
          const kinds = new Set(sym.bindings.map((b) => b.kind));
          if (kinds.has('param') || kinds.has('import') || kinds.has('for') || kinds.has('unpack') || kinds.has('comprehension') || kinds.has('typeparam') || kinds.has('match') || kinds.has('annotation') && kinds.size === 1) continue;
          if (kinds.has('def') || kinds.has('class')) {
            const b = sym.bindings[0];
            if (sym.bindings.length === 1 && b.node.decorator_list && !b.node.decorator_list.length) r.report(b.node, `Remove the unused local ${b.kind === 'def' ? 'function' : 'class'} '${sym.name}'.`, `사용하지 않는 지역 ${b.kind === 'def' ? '함수' : '클래스'} '${sym.name}'를 지우세요.`);
            continue;
          }
          const b = sym.bindings[0];
          if (b.kind === 'except') {
            r.report(b.node, `Remove the unused exception variable '${sym.name}'.`, `사용하지 않는 예외 변수 '${sym.name}'를 지우세요.`);
            continue;
          }
          if (b.kind === 'with') {
            // with open(...) as f: nobody reads f -- still worth removing the name
            r.report(b.node, `Remove the unused local variable '${sym.name}'.`, `사용하지 않는 지역 변수 '${sym.name}'를 지우세요.`);
            continue;
          }
          r.report(b.node, `Remove the unused local variable '${sym.name}'.`, `사용하지 않는 지역 변수 '${sym.name}'를 지우세요.`);
        }
      }
    },
  });

function isCallbackFunction(fn, c) {
  const sym = fn.sym;
  if (sym && sym.uses.some((u) => !(u.parent && u.parent.type === 'Call' && u.parent.func === u))) return true;
  if (fn.info && fn.info.cls) {
    // self.handler passed somewhere as a callback
    return U.containsNode(c.mod.module, (m) => m.type === 'Attribute' && m.attr === fn.name && m.ctx === 'Load' && !(m.parent && m.parent.type === 'Call' && m.parent.func === m));
  }
  return false;
}

R('unused-parameter', 'S', 'MA', 5, ['unused'], 'S1172',
  ['Unused function parameter', '사용하지 않는 함수 매개변수'],
  ['A parameter the function never reads misleads callers, who must still pass a value.', '함수가 읽지 않는 매개변수는 호출자를 오도하며, 호출자는 여전히 값을 넘겨야 합니다.'],
  ['Remove the parameter (or prefix it with _ when the signature is imposed).', '매개변수를 지우세요(시그니처가 정해져 있다면 이름 앞에 _를 붙이세요).'],
  {
    module(c, r) {
      for (const fi of c.mod.allFunctions) {
        const fn = fi.node;
        if (fn.hasError || fi.isStub || fi.isAbstract || fi.isOverload || fn.decorator_list.length) continue;
        const sc = fn.scope;
        if (!sc || sc.dynamic) continue;
        if (fi.cls) {
          if (/^__\w+__$/.test(fn.name)) continue;
          if (fi.cls.node.bases.length || fi.cls.decorators.length || fi.cls.metaclass) continue;
          // overridden in a project subclass -> part of an interface
          if (overriddenBelow(c, fi.cls, fn.name)) continue;
        }
        if (isCallbackFunction(fn, c)) continue;
        // body that only raises / returns a constant: a deliberate placeholder
        const body = U.bodyNoDoc(fn.body);
        if (body.length === 1 && (body[0].type === 'Raise' || (body[0].type === 'Return' && (!body[0].value || body[0].value.type === 'Constant')))) continue;
        const a = fn.args;
        const params = [...a.posonlyargs, ...a.args, ...a.kwonlyargs];
        const skipFirst = fi.cls && fi.kind !== 'staticmethod';
        params.forEach((p, i) => {
          if (skipFirst && i === 0) return;
          if (/^_/.test(p.arg) || /^(?:self|cls|args|kwargs|unused|dummy|ignored)$/.test(p.arg)) return;
          const sym = sc.symbols.get(p.arg);
          if (!sym || sym.uses.length) return;
          r.report(p, `Remove the unused parameter '${p.arg}' of '${fn.name}'.`, `'${fn.name}'의 사용하지 않는 매개변수 '${p.arg}'를 지우세요.`);
        });
      }
    },
  });

function guardedByVersion(n) {
  for (let p = n.parent; p; p = p.parent) {
    if (p.type === 'If') {
      const txt = JSON.stringify(p.test, ['type', 'id', 'attr', 'value', 'left', 'comparators', 'func', 'args', 'values', 'operand']);
      if (/version_info|PY2|PY3|"version"|platform|hexversion|TYPE_CHECKING/.test(txt)) return true;
    }
  }
  return false;
}

R('undefined-variable', 'B', 'BL', 10, ['pitfall'], 'S3827',
  ['Name is not defined', '이름이 정의되지 않았습니다'],
  ['The name is neither assigned, imported nor a builtin anywhere in reach, so evaluating it raises NameError.', '이름이 어디에서도 대입, import되지 않았고 내장 이름도 아니어서 평가하면 NameError가 납니다.'],
  ['Define or import the name, or fix the typo.', '이름을 정의하거나 import하거나 오타를 고치세요.'],
  {
    module(c, r) {
      if (c.lineMap || c.isStub) return;
      const mod = c.mod;
      if (mod.scopes.scopes.some((s) => s.starImport)) return;
      if (U.containsNode(mod.module, (m) => m.type === 'Call' && (/^(?:globals|vars|locals|exec|execfile|setattr)$/.test(dotted(m.func) || '') && (dotted(m.func) !== 'setattr' || (m.args[0] && /sys\.modules|builtins/.test(JSON.stringify(m.args[0], ['type', 'id', 'attr', 'value']))))))) {
        // modules that populate their namespace dynamically
        if (U.containsNode(mod.module, (m) => m.type === 'Attribute' && m.attr === 'update' && m.value.type === 'Call' && /^(?:globals|vars|locals)$/.test(dotted(m.value.func) || ''))) return;
        if (U.containsNode(mod.module, (m) => m.type === 'Subscript' && m.ctx === 'Store' && m.value.type === 'Call' && /^(?:globals|vars|locals)$/.test(dotted(m.value.func) || ''))) return;
        if (U.containsNode(mod.module, (m) => m.type === 'Call' && /^(?:exec|execfile)$/.test(dotted(m.func) || ''))) return;
      }
      const seen = new Set();
      for (const { node, scope } of mod.scopes.undefined) {
        const name = node.id;
        if (seen.has(name) || name === '__class__' || name === '__error__' || allNames(c).has(name)) continue;
        if (node.ctx === 'Del') continue;
        if (U.caughtBy(node, ['NameError', 'Exception', 'BaseException', 'UnboundLocalError'])) continue;
        if (guardedByVersion(node)) continue;
        if (U.insideTypeContext(node)) continue;
        void scope;
        seen.add(name);
        r.report(node, `'${name}' is not defined.`, `'${name}'가 정의되지 않았습니다.`);
      }
    },
  });

R('unused-private-function', 'S', 'MA', 5, ['unused'], 'S5603',
  ['Unused private function', '사용하지 않는 비공개 함수'],
  ['A module-private function (leading underscore) that nothing references is dead code.', '아무도 참조하지 않는 모듈 비공개 함수(밑줄로 시작)는 죽은 코드입니다.'],
  ['Remove the function.', '함수를 지우세요.'],
  {
    module(c, r) {
      if (c.mod.isPackageInit || c.isStub) return;
      const all = allNames(c);
      for (const [name, fi] of c.mod.functions) {
        if (!/^_[^_]/.test(name) || /^__\w+__$/.test(name) || all.has(name) || fi.node.decorator_list.length || fi.redefined) continue;
        const sym = c.mod.scope.symbols.get(name);
        if (!sym || sym.uses.length || sym.globalAssigned) continue;
        if (textMentions(c, name) > 1 || usedElsewhere(c, name)) continue; // getattr(module, '_name') and friends
        r.report(fi.node, `Remove the unused private function '${name}'.`, `사용하지 않는 비공개 함수 '${name}'를 지우세요.`);
      }
    },
  });

// names imported from, or accessed as attributes of, some project module
function usedElsewhere(c, name) {
  const P = c.project;
  if (!P._usedNames) {
    P._usedNames = new Set();
    for (const m of P.modules) for (const n of m.allNodes) {
      if (n.type === 'ImportFrom') for (const a of n.names) P._usedNames.add(a.name);
      else if (n.type === 'Attribute' && n.ctx === 'Load') P._usedNames.add(n.attr);
    }
  }
  return P._usedNames.has(name);
}

function textMentions(c, name) {
  let k = 0;
  const re = new RegExp(`\\b${name.replace(/[$]/g, '\\$')}\\b`, 'g');
  const m = c.text.match(re);
  k = m ? m.length : 0;
  return k;
}

R('unused-private-method', 'S', 'MA', 5, ['unused'], 'S1144',
  ['Unused private method', '사용하지 않는 비공개 메서드'],
  ['A name-mangled method (__name) is only reachable from its own class; if the class never calls it, it is dead code.', '이름 변형 메서드(__name)는 자기 클래스에서만 접근할 수 있어, 클래스가 부르지 않으면 죽은 코드입니다.'],
  ['Remove the method.', '메서드를 지우세요.'],
  {
    module(c, r) {
      for (const cls of c.mod.allClasses) {
        for (const [name, m] of cls.methods) {
          if (!/^__\w+$/.test(name) || /__$/.test(name) || m.node.decorator_list.length) continue;
          let used = false;
          walk(cls.node, (x) => { if (used) return false; if (x.type === 'Attribute' && x.attr === name && x.ctx === 'Load') used = true; return true; });
          if (used || textMentions(c, name) > 1) continue;
          r.report(m.node, `Remove the unused private method '${name}'.`, `사용하지 않는 비공개 메서드 '${name}'를 지우세요.`);
        }
      }
    },
  });

R('unused-private-class', 'S', 'MA', 5, ['unused'], 'S3985',
  ['Unused private class', '사용하지 않는 비공개 클래스'],
  ['A module-private class (leading underscore) that nothing references is dead code.', '아무도 참조하지 않는 모듈 비공개 클래스(밑줄로 시작)는 죽은 코드입니다.'],
  ['Remove the class.', '클래스를 지우세요.'],
  {
    module(c, r) {
      if (c.mod.isPackageInit || c.isStub) return;
      const all = allNames(c);
      for (const [name, cls] of c.mod.classes) {
        if (!/^_[^_]/.test(name) || all.has(name) || cls.decorators.length) continue;
        const sym = c.mod.scope.symbols.get(name);
        if (!sym || sym.uses.length) continue;
        if (textMentions(c, name) > 1 || usedElsewhere(c, name)) continue;
        r.report(cls.node, `Remove the unused private class '${name}'.`, `사용하지 않는 비공개 클래스 '${name}'를 지우세요.`);
      }
    },
  });

R('unused-private-attribute', 'S', 'MA', 5, ['unused'], 'S4487',
  ['Private attribute written but never read', '비공개 속성을 쓰기만 하고 읽지 않습니다'],
  ['A name-mangled attribute (self.__x) that is assigned but never read anywhere in its class is useless.', '대입만 하고 클래스 어디에서도 읽지 않는 이름 변형 속성(self.__x)은 쓸모가 없습니다.'],
  ['Remove the attribute or use it.', '속성을 지우거나 사용하세요.'],
  {
    module(c, r) {
      for (const cls of c.mod.allClasses) {
        const stores = new Map();
        const loads = new Set();
        walk(cls.node, (x) => {
          if (x.type === 'Attribute' && /^__\w+$/.test(x.attr) && !/__$/.test(x.attr)) {
            if (x.ctx === 'Store') { if (!stores.has(x.attr)) stores.set(x.attr, x); } else loads.add(x.attr);
          }
          if (x.type === 'Call' && /^(?:getattr|hasattr|vars)$/.test(dotted(x.func) || '')) loads.add('*');
          return true;
        });
        if (loads.has('*') || cls.attrs.has('__slots__')) continue;
        for (const [name, node] of stores) {
          if (loads.has(name) || cls.methods.has(name)) continue;
          if (textMentions(c, name) > stores.size + 5) continue;
          r.report(node, `Remove the unused private attribute '${name}', or read it.`, `사용하지 않는 비공개 속성 '${name}'를 지우거나 읽으세요.`);
        }
      }
    },
  });

module.exports = { RULES };
void walkLocal;
