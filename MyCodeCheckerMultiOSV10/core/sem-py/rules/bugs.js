'use strict';

// Bugs: exceptions, control flow, calls and types.

const { define } = require('./def');
const { FUNC_TYPES, dotted, isNone, walkLocal, short, children } = require('../ast');
const { BUILTIN } = require('../scope');
const { EXC_BUILTINS, BUILTIN_TYPES, typeName, T } = require('../project');
const U = require('./util');

const RULES = [];
const R = define(RULES);

// builtin exception hierarchy (child -> parent)
const EXC_PARENT = {
  BaseException: null, BaseExceptionGroup: 'BaseException', Exception: 'BaseException', GeneratorExit: 'BaseException', KeyboardInterrupt: 'BaseException',
  SystemExit: 'BaseException', ExceptionGroup: 'Exception', ArithmeticError: 'Exception', AssertionError: 'Exception', AttributeError: 'Exception',
  BufferError: 'Exception', EOFError: 'Exception', ImportError: 'Exception', LookupError: 'Exception', MemoryError: 'Exception', NameError: 'Exception',
  OSError: 'Exception', ReferenceError: 'Exception', RuntimeError: 'Exception', StopAsyncIteration: 'Exception', StopIteration: 'Exception',
  SyntaxError: 'Exception', SystemError: 'Exception', TypeError: 'Exception', ValueError: 'Exception', Warning: 'Exception',
  FloatingPointError: 'ArithmeticError', OverflowError: 'ArithmeticError', ZeroDivisionError: 'ArithmeticError', ModuleNotFoundError: 'ImportError',
  IndexError: 'LookupError', KeyError: 'LookupError', UnboundLocalError: 'NameError', BlockingIOError: 'OSError', ChildProcessError: 'OSError',
  ConnectionError: 'OSError', FileExistsError: 'OSError', FileNotFoundError: 'OSError', InterruptedError: 'OSError', IsADirectoryError: 'OSError',
  NotADirectoryError: 'OSError', PermissionError: 'OSError', ProcessLookupError: 'OSError', TimeoutError: 'OSError', EnvironmentError: 'Exception',
  IOError: 'Exception', BrokenPipeError: 'ConnectionError', ConnectionAbortedError: 'ConnectionError', ConnectionRefusedError: 'ConnectionError',
  ConnectionResetError: 'ConnectionError', NotImplementedError: 'RuntimeError', RecursionError: 'RuntimeError', IndentationError: 'SyntaxError',
  TabError: 'IndentationError', UnicodeError: 'ValueError', UnicodeDecodeError: 'UnicodeError', UnicodeEncodeError: 'UnicodeError',
  UnicodeTranslateError: 'UnicodeError', DeprecationWarning: 'Warning', UserWarning: 'Warning', RuntimeWarning: 'Warning', FutureWarning: 'Warning',
  PendingDeprecationWarning: 'Warning', SyntaxWarning: 'Warning', ImportWarning: 'Warning', UnicodeWarning: 'Warning', BytesWarning: 'Warning',
  ResourceWarning: 'Warning', EncodingWarning: 'Warning',
};
// OSError aliases
const EXC_ALIAS = { EnvironmentError: 'OSError', IOError: 'OSError', WindowsError: 'OSError' };

// Is the expression a class that is definitely NOT an exception? returns name or null
function nonException(c, e) {
  if (!e) return null;
  if (e.type === 'Constant') {
    if (e.kind === 'None') return 'None';
    return e.kind === 'str' ? 'a string' : e.kind === 'bytes' ? 'bytes' : e.kind === 'Ellipsis' ? null : `the ${e.kind} literal`;
  }
  if (e.type === 'JoinedStr') return 'a string';
  if (e.type === 'List' || e.type === 'Dict' || e.type === 'Set' || e.type === 'ListComp' || e.type === 'DictComp') return 'a collection';
  if (e.type === 'Name' && e.sym === BUILTIN) {
    if (e.id === 'NotImplemented') return 'NotImplemented';
    if (BUILTIN_TYPES[e.id] && e.id !== 'object') return `'${e.id}'`;
    if (e.id === 'object') return "'object'";
    return null;
  }
  const t = e.type === 'Call' ? c.type(e.func) : c.type(e);
  if (t && t.k === 'class' && t.cls) {
    if (c.project.isException(t.cls) === false && !t.cls.special) return `class '${t.cls.name}'`;
  }
  if (e.type === 'Call' && t && t.k === 'class' && !t.cls && BUILTIN_TYPES[t.name] && t.name !== 'object' && t.name !== 'type') return `'${t.name}' instance`;
  return null;
}

R('raise-non-exception', 'B', 'CR', 10, ['error-handling', 'cwe-704'], 'S5632',
  ['Raising something that is not an exception', '예외가 아닌 것을 raise합니다'],
  ['Only instances or subclasses of BaseException can be raised; anything else turns into a TypeError at the raise site.', 'BaseException의 인스턴스나 하위 클래스만 raise할 수 있고, 그 밖의 값은 raise 위치에서 TypeError가 됩니다.'],
  ['Raise an exception class or instance, for example ValueError("...").', 'ValueError("...")처럼 예외 클래스나 인스턴스를 raise하세요.'],
  {
    on: {
      Raise(n, c, r) {
        if (!n.exc) return;
        const what = nonException(c, n.exc);
        if (what) r.report(n.exc, `Raise an exception instead of ${what}; this raises TypeError.`, `${what} 대신 예외를 raise하세요. 이대로면 TypeError가 납니다.`);
      },
    },
  });

R('except-non-exception', 'B', 'CR', 10, ['error-handling'], 'S5708',
  ['Except clause names something that is not an exception class', 'except 절이 예외 클래스가 아닌 것을 지정합니다'],
  ['When an exception is raised, Python checks the except clauses; a non-exception class there raises TypeError instead of handling the error.', '예외가 나면 Python이 except 절을 검사하는데, 예외가 아닌 클래스가 있으면 처리하지 못하고 TypeError가 납니다.'],
  ['List only classes that derive from BaseException.', 'BaseException에서 파생된 클래스만 쓰세요.'],
  {
    on: {
      ExceptHandler(n, c, r) {
        if (!n.etype || n.etype.type === 'BoolOp') return;
        const ts = n.etype.type === 'Tuple' ? n.etype.elts : [n.etype];
        for (const t of ts) {
          if (t.type === 'Call' && isExceptionClassExpr(c, t.func)) { r.report(t, `'${short(c.slice(t), 30)}' is an instance, not an exception class.`, `'${short(c.slice(t), 30)}'는 예외 클래스가 아니라 인스턴스입니다.`); continue; }
          const what = nonException(c, t);
          if (what) r.report(t, `${what} is not an exception class.`, `${what}은(는) 예외 클래스가 아닙니다.`);
        }
      },
    },
  });

R('except-boolean-expression', 'B', 'CR', 5, ['error-handling'], 'S5714',
  ['Boolean expression in an except clause', 'except 절에 불리언 식이 있습니다'],
  ['"except A or B" evaluates to A only, so B is never caught.', '"except A or B"는 A로만 평가되어 B는 잡히지 않습니다.'],
  ['Use a tuple: except (A, B):', '튜플을 쓰세요: except (A, B):'],
  {
    on: {
      ExceptHandler(n, c, r) {
        if (n.etype && n.etype.type === 'BoolOp') r.report(n.etype, `Replace '${short(c.slice(n.etype), 40)}' with a tuple; only the first class is caught.`, `'${short(c.slice(n.etype), 40)}'을 튜플로 바꾸세요. 첫 클래스만 잡힙니다.`);
      },
    },
  });

function isExceptionClassExpr(c, e) {
  if (e.type === 'Name' && e.sym === BUILTIN) return EXC_BUILTINS.has(e.id);
  const t = c.type(e);
  return !!(t && t.k === 'class' && t.cls && c.project.isException(t.cls) === true);
}

// every ancestor is a plain project class (no metaclass / decorators / unknown base)
function plainHierarchy(c, cls, seen = new Set()) {
  if (seen.has(cls)) return false;
  seen.add(cls);
  if (cls.metaclass || cls.special || cls.decorators.length || cls.dynamicBody) return false;
  for (const b of cls.bases(c.project)) {
    if (b.builtin === 'object') continue;
    if (!b.cls || !plainHierarchy(c, b.cls, seen)) return false;
  }
  return true;
}

// a project subclass of cls redefines 
function overriddenBelow(c, cls, name) {
  const P = c.project;
  if (!P._below) {
    // method names redefined by some project subclass, per class
    P._below = new Map();
    for (const m of P.modules) {
      for (const k of m.allClasses) {
        const seen = new Set();
        const up = (x) => {
          for (const b of x.bases(P)) {
            if (!b.cls || seen.has(b.cls)) continue;
            seen.add(b.cls);
            if (!P._below.has(b.cls)) P._below.set(b.cls, new Set());
            for (const name2 of k.methods.keys()) P._below.get(b.cls).add(name2);
            up(b.cls);
          }
        };
        up(k);
      }
    }
  }
  const s2 = P._below.get(cls);
  return !!s2 && s2.has(name);
}

function excAncestors(c, e) {
  // returns a Set of names the class is a subclass of (inclusive), or null if unknown
  const name = U.lastPart(dotted(e) || '');
  if (e.type === 'Name' && e.sym === BUILTIN) {
    const out = new Set();
    let n = EXC_ALIAS[e.id] || e.id;
    if (!(n in EXC_PARENT)) return null;
    while (n) { out.add(n); n = EXC_PARENT[n]; }
    return out;
  }
  const t = c.type(e);
  if (t && t.k === 'class' && t.cls) {
    const out = new Set();
    const seen = new Set();
    const visit = (cls) => {
      if (seen.has(cls)) return true;
      seen.add(cls);
      out.add(`cls:${cls.mod.path}:${cls.name}`);
      for (const b of cls.bases(c.project)) {
        if (b.cls) { if (!visit(b.cls)) return false; } else if (b.builtin) {
          let n = EXC_ALIAS[b.builtin] || b.builtin;
          if (!(n in EXC_PARENT)) return b.builtin === 'object';
          while (n) { out.add(n); n = EXC_PARENT[n]; }
        } else return false;
      }
      return true;
    };
    if (!visit(t.cls)) return null;
    return out;
  }
  void name;
  return null;
}

function excKey(c, e) {
  if (e.type === 'Name' && e.sym === BUILTIN) return EXC_ALIAS[e.id] || e.id;
  const t = c.type(e);
  if (t && t.k === 'class' && t.cls) return `cls:${t.cls.mod.path}:${t.cls.name}`;
  return null;
}

R('except-unreachable', 'B', 'MA', 10, ['error-handling', 'cwe-561'], 'S1045',
  ['Except clause can never be reached', '도달할 수 없는 except 절'],
  ['An earlier except clause already catches this exception class or one of its parents, so this handler is dead code.', '앞의 except 절이 이미 이 예외 클래스나 그 부모를 잡아서 이 처리기는 죽은 코드입니다.'],
  ['Put the more specific except clause first, or remove the duplicate.', '더 구체적인 except 절을 앞에 두거나 중복을 지우세요.'],
  {
    on: {
      'Try|TryStar'(n, c, r) {
        const caught = []; // [{key, line, text}]
        for (const h of n.handlers) {
          if (!h.etype) {
            if (h !== n.handlers[n.handlers.length - 1]) r.report(h, "A bare 'except:' must be the last except clause.", "맨 'except:'는 마지막 except 절이어야 합니다.");
            continue;
          }
          const ts = h.etype.type === 'Tuple' ? h.etype.elts : [h.etype];
          const keys = [];
          let allCovered = ts.length > 0;
          let by = null;
          for (const t of ts) {
            const anc = excAncestors(c, t);
            const key = excKey(c, t);
            if (!anc || !key) { allCovered = false; continue; }
            keys.push(key);
            const hit = caught.find((k) => anc.has(k.key));
            if (!hit) allCovered = false; else by = by || hit;
          }
          if (allCovered && by) {
            r.report(h.etype, `This except clause is unreachable: '${by.text}' on line ${by.line} already catches it.`, `이 except 절은 도달할 수 없습니다. ${by.line}행의 '${by.text}'가 이미 잡습니다.`,
              { events: [{ line: by.line, tag: 'path', text: { en: `'${by.text}' is caught here first`, ko: `'${by.text}'를 여기서 먼저 잡습니다` }, main: false }] });
          }
          for (let i = 0; i < ts.length; i++) {
            const key = excKey(c, ts[i]);
            if (key) caught.push({ key, line: ts[i].line, text: short(c.slice(ts[i]), 30) });
          }
          void keys;
        }
      },
    },
  });

function hasHandlerAncestor(n) {
  for (let p = n.parent; p && !FUNC_TYPES.has(p.type) && p.type !== 'Lambda' && p.type !== 'Module'; p = p.parent) if (p.type === 'ExceptHandler') return true;
  return false;
}

function insideHandler(n) {
  let child = n;
  let p = n.parent;
  while (p && !FUNC_TYPES.has(p.type) && p.type !== 'Lambda' && p.type !== 'Module' && p.type !== 'ClassDef') {
    if (p.type === 'ExceptHandler') return 'except';
    if ((p.type === 'Try' || p.type === 'TryStar') && p.finalbody.includes(child)) return 'finally';
    child = p;
    p = p.parent;
  }
  return null;
}

R('bare-raise-outside-except', 'B', 'CR', 5, ['error-handling'], 'S5747',
  ['Bare raise outside an except block', 'except 블록 밖에서 맨 raise를 씁니다'],
  ['A bare raise re-raises the exception being handled; outside an except block there is none and Python raises RuntimeError.', '맨 raise는 처리 중인 예외를 다시 던지는데, except 블록 밖에는 그런 예외가 없어 RuntimeError가 납니다.'],
  ['Raise a specific exception, or move the statement into the except block.', '구체적인 예외를 raise하거나 문장을 except 블록 안으로 옮기세요.'],
  {
    on: {
      Raise(n, c, r) {
        if (n.exc) return;
        const where = insideHandler(n);
        if (where) return;
        // inside a function the raise may run while a caller handles an exception
        if (U.enclosingFn(n)) return;
        r.report(n, 'Bare raise outside an except block raises RuntimeError: no active exception.', 'except 블록 밖의 맨 raise는 처리 중인 예외가 없어 RuntimeError가 납니다.');
      },
    },
  });

R('bare-raise-in-finally', 'S', 'CR', 5, ['error-handling'], 'S5704',
  ['Bare raise in a finally block', 'finally 블록에서 맨 raise를 씁니다'],
  ['In finally there may be no active exception (RuntimeError), and when there is one it is re-raised anyway.', 'finally에서는 처리 중인 예외가 없을 수 있고(RuntimeError), 있더라도 어차피 다시 던져집니다.'],
  ['Remove the bare raise or raise a specific exception.', '맨 raise를 지우거나 구체적인 예외를 raise하세요.'],
  {
    on: {
      Raise(n, c, r) {
        if (!n.exc && insideHandler(n) === 'finally' && !hasHandlerAncestor(n)) r.report(n, "Remove this bare 'raise' from the finally block.", "finally 블록의 맨 'raise'를 지우세요.");
      },
    },
  });

R('jump-in-finally', 'B', 'CR', 10, ['error-handling', 'cwe-584'], 'S1143',
  ['return, break or continue in a finally block', 'finally 블록에서 return, break, continue를 씁니다'],
  ['A jump out of finally silently discards any exception in flight and overrides earlier returns.', 'finally에서 빠져나가면 진행 중인 예외가 조용히 버려지고 앞선 return 값도 덮어씁니다.'],
  ['Move the jump out of the finally block.', '이동문을 finally 블록 밖으로 옮기세요.'],
  {
    on: {
      'Return|Break|Continue'(n, c, r) {
        let child = n;
        let p = n.parent;
        let loopInside = false;
        while (p && !FUNC_TYPES.has(p.type) && p.type !== 'Lambda' && p.type !== 'Module' && p.type !== 'ClassDef') {
          if ((p.type === 'For' || p.type === 'While' || p.type === 'AsyncFor') && p.body.includes(child)) loopInside = true;
          if ((p.type === 'Try' || p.type === 'TryStar') && p.finalbody.includes(child)) {
            if (n.type !== 'Return' && loopInside) return;
            const kw = n.type === 'Return' ? 'return' : n.type === 'Break' ? 'break' : 'continue';
            r.report(n, `Remove this '${kw}' from the finally block; it swallows exceptions.`, `finally 블록의 '${kw}'를 지우세요. 예외를 삼킵니다.`);
            return;
          }
          child = p;
          p = p.parent;
        }
      },
    },
  });

R('break-outside-loop', 'B', 'BL', 5, ['syntax'], 'S1716',
  ['break or continue outside a loop', '반복문 밖에서 break 또는 continue를 씁니다'],
  ['break and continue are only valid inside a loop body; elsewhere the file does not compile.', 'break와 continue는 반복문 본문 안에서만 쓸 수 있고, 그 밖에서는 파일이 컴파일되지 않습니다.'],
  ['Remove the statement or restructure the loop.', '문장을 지우거나 반복문을 다시 구성하세요.'],
  {
    on: {
      'Break|Continue'(n, c, r) {
        let child = n;
        let p = n.parent;
        while (p && !FUNC_TYPES.has(p.type) && p.type !== 'Lambda' && p.type !== 'Module' && p.type !== 'ClassDef') {
          if ((p.type === 'For' || p.type === 'While' || p.type === 'AsyncFor') && p.body.includes(child)) return;
          child = p;
          p = p.parent;
        }
        const kw = n.type === 'Break' ? 'break' : 'continue';
        r.report(n, `'${kw}' is outside a loop.`, `'${kw}'가 반복문 밖에 있습니다.`);
      },
    },
  });

R('return-outside-function', 'B', 'BL', 5, ['syntax'], 'S2711',
  ['return or yield outside a function', '함수 밖에서 return 또는 yield를 씁니다'],
  ['return and yield are only allowed inside a function body; at module or class level they are syntax errors.', 'return과 yield는 함수 본문 안에서만 쓸 수 있고, 모듈이나 클래스 수준에서는 문법 오류입니다.'],
  ['Move the statement into a function or remove it.', '문장을 함수 안으로 옮기거나 지우세요.'],
  {
    on: {
      'Return|Yield|YieldFrom'(n, c, r) {
        if (c.lineMap) return;
        let p = n.parent;
        while (p) {
          if (FUNC_TYPES.has(p.type) || p.type === 'Lambda') return;
          if (/^(?:ListComp|SetComp|DictComp|GeneratorExp)$/.test(p.type) && n.type !== 'Return') return;
          if (p.type === 'Module' || p.type === 'ClassDef') break;
          p = p.parent;
        }
        const kw = n.type === 'Return' ? 'return' : 'yield';
        r.report(n, `'${kw}' outside a function.`, `'${kw}'가 함수 밖에 있습니다.`);
      },
    },
  });

// ── calls ────────────────────────────────────────────────────
function resolveCallee(c, call) {
  const f = call.func;
  const P = c.project;
  const ok = (fi) => fi && fi.plainDecorators && !fi.redefined && !fi.isOverload && !fi.conditional && !fi.nested && fi.kind !== 'property';
  if (f.type === 'Name') {
    const sym = f.sym;
    if (!sym || sym === BUILTIN || sym.bindings.length !== 1 || sym.globalAssigned || sym.nonlocalAssigned) return null;
    const b = sym.bindings[0];
    if (b.kind === 'def' && b.node.info) {
      const fi = b.node.info;
      if (fi.cls || !ok(fi)) return null;
      return { fn: fi, bound: false, label: `'${fi.name}'` };
    }
    if (b.kind === 'class' && b.node.info) return ctorOf(c, b.node.info);
    if (b.kind === 'import') {
      const t = P.importTarget(b, c.mod);
      if (t && t.fn && ok(t.fn)) return { fn: t.fn, bound: false, label: `'${t.fn.name}'` };
      if (t && t.cls) return ctorOf(c, t.cls);
    }
    return null;
  }
  if (f.type === 'Attribute' && f.value.type === 'Name') {
    if (f.value.id === 'self') {
      const fn = U.enclosingDef(call);
      if (!fn || !fn.info || !fn.info.cls || fn.info.kind !== 'method') return null;
      const first = fn.args.args[0] || fn.args.posonlyargs[0];
      if (!first || first.arg !== 'self' || !f.value.sym || f.value.sym.bindings[0].node !== first) return null;
      const cls = fn.info.cls;
      if (cls.instanceAttrs.has(f.attr) || cls.special || cls.decorators.length) return null;
      const m = P.findMethod(cls, f.attr);
      if (!m || !ok(m) || m.isStub || m.isAbstract || overriddenBelow(c, m.cls, f.attr)) return null;
      if (m.kind === 'staticmethod') return { fn: m, bound: false, label: `'${cls.name}.${m.name}'` };
      return { fn: m, bound: true, label: `'${m.cls.name}.${m.name}'` };
    }
    const t = c.type(f.value);
    // module.function(...) for a project module
    if (t && t.k === 'module') {
      const ft = c.type(f);
      if (ft && ft.k === 'func' && ft.fn && !ft.fn.cls && ok(ft.fn)) return { fn: ft.fn, bound: false, label: `'${ft.fn.name}'` };
      return null;
    }
    if (t && t.k === 'class' && t.cls && plainHierarchy(c, t.cls)) {
      const m = P.findMethod(t.cls, f.attr);
      if (!m || !ok(m)) return null;
      if (m.kind === 'staticmethod') return { fn: m, bound: false, label: `'${t.cls.name}.${m.name}'` };
      if (m.kind === 'classmethod') return { fn: m, bound: true, label: `'${t.cls.name}.${m.name}'` };
      return { fn: m, bound: false, label: `'${t.cls.name}.${m.name}'` };
    }
    // a method called on an instance of a plain project class: self is bound
    if (t && t.k === 'inst' && t.cls && plainHierarchy(c, t.cls) && !t.cls.instanceAttrs.has(f.attr) && !overriddenBelow(c, t.cls, f.attr)) {
      const m = P.findMethod(t.cls, f.attr);
      if (!m || !ok(m) || m.isStub || m.isAbstract) return null;
      if (m.kind === 'staticmethod') return { fn: m, bound: false, label: `'${t.cls.name}.${m.name}'` };
      return { fn: m, bound: true, label: `'${t.cls.name}.${m.name}'` };
    }
  }
  return null;
}

function ctorOf(c, cls) {
  const P = c.project;
  if (cls.special || cls.decorators.length || cls.metaclass || cls.conditional || cls.nested) return null;
  if (P.findMethod(cls, '__new__') !== null) return null;
  const init = P.findMethod(cls, '__init__');
  if (init === undefined) return null;
  if (init === null) {
    // no __init__ anywhere: object() takes no arguments -- only when every base is object
    const bases = cls.bases(P);
    if (bases.some((b) => !(b.builtin === 'object' || (b.cls && !b.cls.special)))) return null;
    return { fn: null, bound: true, label: `'${cls.name}()'`, noArgs: true };
  }
  if (!init.plainDecorators || init.redefined) return null;
  return { fn: init, bound: true, label: `'${cls.name}()'` };
}

function checkArgs(callee, call) {
  if (call.args.some((a) => a.type === 'Starred') || call.keywords.some((k) => k.arg === null)) return null;
  if (callee.noArgs) {
    if (call.args.length || call.keywords.length) return { en: `${callee.label} takes no arguments`, ko: `${callee.label}는 인자를 받지 않습니다` };
    return null;
  }
  const p = callee.fn.params();
  if (callee.bound && !p.pos.length && !p.vararg) return null;
  const pos = callee.bound ? p.pos.slice(1) : p.pos;
  const posonly = Math.max(0, p.posonly - (callee.bound ? 1 : 0));
  const nd = Math.min(p.ndefaults, pos.length);
  const required = pos.length - nd;
  const n = call.args.length;
  if (!p.vararg && n > pos.length) return { en: `${callee.label} takes at most ${pos.length} positional argument${pos.length === 1 ? '' : 's'} but ${n} ${n === 1 ? 'was' : 'were'} given`, ko: `${callee.label}는 위치 인자를 최대 ${pos.length}개 받는데 ${n}개를 넘깁니다` };
  const filled = new Set(pos.slice(0, n).map((a) => a.arg));
  const kwonly = p.kwonly.map((a) => a.arg);
  for (const k of call.keywords) {
    const idx = pos.findIndex((a) => a.arg === k.arg);
    if (idx >= 0 && idx < posonly) {
      if (!p.kwarg) return { en: `'${k.arg}' is positional-only in ${callee.label}`, ko: `'${k.arg}'는 ${callee.label}에서 위치 전용 인자입니다` };
      continue;
    }
    if (idx >= 0) {
      if (filled.has(k.arg)) return { en: `${callee.label} got multiple values for '${k.arg}'`, ko: `${callee.label}에 '${k.arg}' 값이 여러 번 전달됩니다` };
      filled.add(k.arg);
      continue;
    }
    if (kwonly.includes(k.arg)) { filled.add(k.arg); continue; }
    if (!p.kwarg) return { en: `${callee.label} has no parameter named '${k.arg}'`, ko: `${callee.label}에는 '${k.arg}'라는 매개변수가 없습니다` };
  }
  const missing = pos.slice(0, required).filter((a) => !filled.has(a.arg)).map((a) => a.arg);
  p.kwonly.forEach((a, i) => { if (p.kwDefaults[i] == null && !filled.has(a.arg)) missing.push(a.arg); });
  if (missing.length) return { en: `${callee.label} is missing required argument${missing.length > 1 ? 's' : ''} ${missing.map((m) => `'${m}'`).join(', ')}`, ko: `${callee.label}에 필수 인자 ${missing.map((m) => `'${m}'`).join(', ')}가 빠졌습니다` };
  return null;
}

R('call-arguments', 'B', 'BL', 10, ['pitfall'], 'S930',
  ['Wrong arguments in a call to a project function', '프로젝트 함수 호출의 인자가 잘못됐습니다'],
  ['The call passes too many or too few arguments, an unknown keyword, or the same parameter twice; Python raises TypeError at run time.', '호출이 인자를 너무 많거나 적게, 모르는 키워드로, 또는 같은 매개변수를 두 번 넘겨 실행 시 TypeError가 납니다.'],
  ['Match the call to the function signature.', '호출을 함수 시그니처에 맞추세요.'],
  {
    on: {
      Call(n, c, r) {
        const callee = resolveCallee(c, n);
        if (!callee) return;
        const m = checkArgs(callee, n);
        if (!m) return;
        const events = callee.fn ? [{ line: callee.fn.node.nameLine || callee.fn.node.line, tag: 'path', text: { en: `${callee.label} is defined here`, ko: `${callee.label}는 여기서 정의됩니다` }, main: false, file: callee.fn.mod.path !== c.path ? callee.fn.mod.path : undefined }] : undefined;
        r.report(n, `${m.en}.`, `${m.ko}.`, events ? { events: events.map((e) => (e.file ? e : { line: e.line, tag: e.tag, text: e.text, main: e.main })) } : undefined);
      },
    },
  });

// types that never support an operation
const NON_CALLABLE = new Set(['int', 'float', 'complex', 'bool', 'str', 'bytes', 'list', 'tuple', 'dict', 'set', 'frozenset', 'range', 'generator', 'iterator', 'ellipsis', 'file', 'bytearray']);
const NON_ITERABLE = new Set(['int', 'float', 'complex', 'bool', 'function', 'ellipsis']);
const NON_SUBSCRIPTABLE = new Set(['int', 'float', 'complex', 'bool', 'set', 'frozenset', 'function', 'generator', 'iterator', 'ellipsis', 'file']);
const IMMUTABLE_SEQ = new Set(['str', 'bytes', 'tuple', 'frozenset', 'range']);

function describe(t) {
  if (!t) return '?';
  if (t.k === 'none') return 'None';
  if (t.k === 'inst') return t.cls ? `'${t.cls.name}' instance` : `'${t.name}'`;
  if (t.k === 'func') return t.name ? `function '${t.name}'` : 'a function';
  if (t.k === 'class') return `class '${t.name}'`;
  return typeName(t);
}

R('not-callable', 'B', 'BL', 10, ['pitfall'], 'S5756',
  ['Calling an object that is not callable', '호출할 수 없는 객체를 호출합니다'],
  ['The value has a type without __call__ (a number, string, collection, None or a project class without __call__), so calling it raises TypeError.', '값의 타입에 __call__이 없어(숫자, 문자열, 컬렉션, None, __call__ 없는 프로젝트 클래스) 호출하면 TypeError가 납니다.'],
  ['Call the right object or drop the parentheses.', '올바른 객체를 호출하거나 괄호를 빼세요.'],
  {
    on: {
      Call(n, c, r) {
        const f = n.func;
        if (f.type === 'Constant' && f.kind !== 'Ellipsis') { r.report(f, `${f.kind === 'None' ? 'None' : 'This literal'} is not callable.`, `${f.kind === 'None' ? 'None' : '이 리터럴'}은 호출할 수 없습니다.`); return; }
        if (f.type === 'List' || f.type === 'Tuple' || f.type === 'Dict' || f.type === 'Set' || f.type === 'JoinedStr') { r.report(f, 'This literal is not callable.', '이 리터럴은 호출할 수 없습니다.'); return; }
        if (f.type !== 'Name') return;
        const t = c.type(f);
        if (!t) return;
        let bad = false;
        // None in a function local is the symbolic engine's job (none-dereference)
        if (t.k === 'none' && f.sym && f.sym !== BUILTIN && f.sym.scope && f.sym.scope.kind === 'function') return;
        if (t.k === 'none') bad = true;
        else if (t.k === 'inst' && !t.cls && NON_CALLABLE.has(t.name)) bad = true;
        else if (t.k === 'inst' && t.cls && c.project.hasMember(t.cls, '__call__') === false && c.project.hasMember(t.cls, '__getattr__') === false) bad = true;
        if (bad) r.report(f, `'${f.id}' is ${describe(t)} and is not callable.`, `'${f.id}'는 ${describe(t)}이라 호출할 수 없습니다.`);
      },
    },
  });

function iterProblem(c, e) {
  if (!e) return null;
  if (e.type === 'Constant' && (e.kind === 'int' || e.kind === 'float' || e.kind === 'complex' || e.kind === 'bool' || e.kind === 'None')) return e.kind === 'None' ? 'None' : `the ${e.kind} literal`;
  if (e.type !== 'Name' && e.type !== 'Call' && e.type !== 'Attribute') return null;
  if (e.type === 'Attribute') return null;
  const t = c.type(e);
  if (!t) return null;
  if (t.k === 'none' && e.type === 'Name') return null; // symbolic engine handles locals
  if (t.k === 'none') return 'None';
  if (t.k === 'inst' && !t.cls && NON_ITERABLE.has(t.name)) return describe(t);
  if (t.k === 'func') return describe(t);
  if (t.k === 'inst' && t.cls && c.project.hasMember(t.cls, '__iter__') === false && c.project.hasMember(t.cls, '__getitem__') === false && c.project.hasMember(t.cls, '__getattr__') === false) return describe(t);
  if (t.k === 'class' && t.cls && !t.cls.metaclass && !t.cls.special && c.project.hasMember(t.cls, '__class_getitem__') !== true) {
    // iterating over a class object (not an instance) -- only for plain project classes
    if (plainHierarchy(c, t.cls)) return describe(t);
  }
  return null;
}

R('iterate-non-iterable', 'B', 'BL', 10, ['pitfall'], 'S3862',
  ['Iterating over a value that is not iterable', '반복할 수 없는 값을 반복합니다'],
  ['for loops, comprehensions, unpacking and yield from need an iterable; numbers, functions, classes and objects without __iter__ raise TypeError.', 'for 반복, 컴프리헨션, 언패킹, yield from에는 반복 가능한 값이 필요하고, 숫자, 함수, 클래스, __iter__ 없는 객체는 TypeError가 납니다.'],
  ['Iterate over a collection, or call the function / implement __iter__.', '컬렉션을 반복하거나 함수를 호출하거나 __iter__를 구현하세요.'],
  {
    on: {
      'For|comprehension'(n, c, r) {
        if (n.is_async) return;
        const what = iterProblem(c, n.iter);
        if (what) r.report(n.iter, `${what} is not iterable.`, `${what}은(는) 반복할 수 없습니다.`);
      },
      YieldFrom(n, c, r) {
        const what = iterProblem(c, n.value);
        if (what) r.report(n.value, `${what} is not iterable.`, `${what}은(는) 반복할 수 없습니다.`);
      },
      Assign(n, c, r) {
        if (!n.targets.some((t) => t.type === 'Tuple' || t.type === 'List')) return;
        const what = iterProblem(c, n.value);
        if (what) r.report(n.value, `${what} cannot be unpacked.`, `${what}은(는) 언패킹할 수 없습니다.`);
      },
      Starred(n, c, r) {
        if (n.ctx !== 'Load' || !n.parent || (n.parent.type !== 'Call' && n.parent.type !== 'List' && n.parent.type !== 'Tuple' && n.parent.type !== 'Set')) return;
        const what = iterProblem(c, n.value);
        if (what) r.report(n.value, `${what} cannot be unpacked with '*'.`, `${what}은(는) '*'로 펼칠 수 없습니다.`);
      },
    },
  });

R('subscript-unsupported', 'B', 'BL', 10, ['pitfall'], 'S5644',
  ['Item access on a value that does not support it', '항목 접근을 지원하지 않는 값에 첨자를 씁니다'],
  ['Numbers, sets, functions and objects without __getitem__ cannot be subscripted, and strings, tuples, bytes and frozensets do not support item assignment or deletion.', '숫자, 집합, 함수, __getitem__ 없는 객체는 첨자로 접근할 수 없고, 문자열, 튜플, bytes, frozenset은 항목 대입이나 삭제를 지원하지 않습니다.'],
  ['Use a type that supports the operation (a list or dict) or fix the expression.', '연산을 지원하는 타입(list나 dict)을 쓰거나 식을 고치세요.'],
  {
    on: {
      Subscript(n, c, r) {
        if (U.insideTypeContext(n)) return;
        const v = n.value;
        let t;
        if (v.type === 'Constant') t = c.type(v);
        else if (v.type === 'Name' || v.type === 'Call') t = c.type(v);
        else if (v.type === 'List' || v.type === 'Tuple' || v.type === 'Set' || v.type === 'Dict' || v.type === 'JoinedStr') t = c.type(v);
        if (!t || t.k === 'none') return;
        const label = v.type === 'Name' ? `'${v.id}' (${describe(t)})` : describe(t);
        if (n.ctx === 'Load') {
          if ((t.k === 'inst' && !t.cls && NON_SUBSCRIPTABLE.has(t.name)) || t.k === 'func') { r.report(n, `${label} is not subscriptable.`, `${label}은(는) 첨자로 접근할 수 없습니다.`); return; }
          if (t.k === 'inst' && t.cls && c.project.hasMember(t.cls, '__getitem__') === false && c.project.hasMember(t.cls, '__getattr__') === false && c.project.hasMember(t.cls, '__class_getitem__') === false) r.report(n, `${label} has no __getitem__ and is not subscriptable.`, `${label}에는 __getitem__이 없어 첨자로 접근할 수 없습니다.`);
          return;
        }
        if (t.k === 'inst' && !t.cls && (IMMUTABLE_SEQ.has(t.name) || NON_SUBSCRIPTABLE.has(t.name))) {
          const op = n.ctx === 'Store' ? 'item assignment' : 'item deletion';
          r.report(n, `${label} does not support ${op}.`, `${label}은(는) ${n.ctx === 'Store' ? '항목 대입' : '항목 삭제'}을 지원하지 않습니다.`);
        }
      },
    },
  });

const NUMS = new Set(['int', 'float', 'complex', 'bool']);
const SEQS = new Set(['str', 'bytes', 'list', 'tuple', 'bytearray']);
function binopCompatible(op, a, b) {
  const na = NUMS.has(a);
  const nb = NUMS.has(b);
  switch (op) {
    case 'Add': return (na && nb) || (a === b && SEQS.has(a)) || ((a === 'bytes' || a === 'bytearray') && (b === 'bytes' || b === 'bytearray'));
    case 'Sub': return (na && nb) || ((a === 'set' || a === 'frozenset') && (b === 'set' || b === 'frozenset'));
    case 'Mult': return (na && nb) || (SEQS.has(a) && (b === 'int' || b === 'bool')) || (SEQS.has(b) && (a === 'int' || a === 'bool'));
    case 'Div': case 'FloorDiv': case 'Pow': return na && nb;
    case 'Mod': return (na && nb) || a === 'str' || a === 'bytes' || a === 'bytearray';
    case 'LShift': case 'RShift': return (a === 'int' || a === 'bool') && (b === 'int' || b === 'bool');
    case 'BitAnd': case 'BitOr': case 'BitXor': return ((a === 'int' || a === 'bool') && (b === 'int' || b === 'bool')) || ((a === 'set' || a === 'frozenset') && (b === 'set' || b === 'frozenset')) || (op === 'BitOr' && a === 'dict' && b === 'dict');
    default: return true;
  }
}
const KNOWN_OPERAND = new Set([...NUMS, ...SEQS, 'dict', 'set', 'frozenset', 'NoneType']);
const OPSYM = { Add: '+', Sub: '-', Mult: '*', Div: '/', FloorDiv: '//', Mod: '%', Pow: '**', LShift: '<<', RShift: '>>', BitAnd: '&', BitOr: '|', BitXor: '^', MatMult: '@' };

function operandType(c, e) {
  if (!e) return null;
  if (e.type === 'Constant' && e.kind === 'None') return 'NoneType';
  if (e.type === 'Name' && e.sym && e.sym !== BUILTIN) {
    // only trust names with a single literal-ish assignment
    const t = c.type(e);
    if (t && t.k === 'inst' && !t.cls && KNOWN_OPERAND.has(t.name)) return t.name;
    return null;
  }
  if (e.type === 'Constant' || e.type === 'List' || e.type === 'Tuple' || e.type === 'Dict' || e.type === 'Set' || e.type === 'JoinedStr' || e.type === 'ListComp' || e.type === 'DictComp' || e.type === 'SetComp') {
    const t = c.type(e);
    if (t && t.k === 'inst' && KNOWN_OPERAND.has(t.name)) return t.name;
  }
  if (e.type === 'Call' && e.func.type === 'Name' && e.func.sym === BUILTIN && ['str', 'int', 'float', 'list', 'dict', 'tuple', 'set', 'len', 'repr', 'bytes'].includes(e.func.id)) {
    const t = c.type(e);
    if (t && t.k === 'inst') return t.name;
  }
  return null;
}

R('incompatible-operands', 'B', 'BL', 10, ['pitfall'], 'S5607',
  ['Operator applied to incompatible types', '호환되지 않는 타입에 연산자를 씁니다'],
  ['Python does not convert between these types for this operator (for example str + int, list + tuple, None + 1), so the expression raises TypeError.', 'Python은 이 연산자에서 이 타입들을 변환하지 않아(str + int, list + tuple, None + 1 등) 식이 TypeError가 납니다.'],
  ['Convert one operand explicitly (str(), int(), list()...).', 'str(), int(), list() 등으로 피연산자 하나를 명시적으로 변환하세요.'],
  {
    on: {
      BinOp(n, c, r) {
        if (!OPSYM[n.op] || n.op === 'MatMult') return;
        const a = operandType(c, n.left);
        const b = operandType(c, n.right);
        if (!a || !b) return;
        if (n.op === 'Mod' && (a === 'str' || a === 'bytes')) return;
        if (a === 'NoneType' || b === 'NoneType' || !binopCompatible(n.op, a, b)) {
          r.report(n, `Unsupported operand types for ${OPSYM[n.op]}: '${a}' and '${b}'.`, `${OPSYM[n.op]} 연산에 지원하지 않는 피연산자 타입 '${a}'와 '${b}'입니다.`);
        }
      },
    },
  });

R('membership-unsupported', 'B', 'BL', 10, ['pitfall'], 'S5642',
  ['Membership test on a value that is not a container', '컨테이너가 아닌 값에 in 검사를 합니다'],
  ['"in" needs __contains__, __iter__ or __getitem__ on the right operand; numbers, None and such objects raise TypeError.', '"in"의 오른쪽 피연산자에는 __contains__, __iter__, __getitem__이 필요하고, 숫자나 None 같은 객체는 TypeError가 납니다.'],
  ['Test membership against a collection or string.', '컬렉션이나 문자열에 대해 포함 여부를 검사하세요.'],
  {
    on: {
      Compare(n, c, r) {
        n.ops.forEach((op, i) => {
          if (op !== 'In' && op !== 'NotIn') return;
          const right = n.comparators[i];
          if (right.type === 'Name' && right.sym && right.sym !== BUILTIN && c.type(right) && c.type(right).k === 'none') return;
          let t = null;
          if (right.type === 'Constant' || right.type === 'Name' || right.type === 'Call') t = c.type(right);
          if (!t) return;
          let bad = false;
          if (t.k === 'none') bad = true;
          else if (t.k === 'inst' && !t.cls && (NUMS.has(t.name) || t.name === 'ellipsis')) bad = true;
          else if (t.k === 'func') bad = true;
          else if (t.k === 'inst' && t.cls && ['__contains__', '__iter__', '__getitem__', '__getattr__'].every((m) => c.project.hasMember(t.cls, m) === false)) bad = true;
          if (bad) r.report(right, `${describe(t)} does not support the 'in' operator.`, `${describe(t)}은(는) 'in' 연산자를 지원하지 않습니다.`);
        });
      },
    },
  });

R('none-return-used', 'B', 'MA', 10, ['pitfall'], 'S3699',
  ['Using the result of a function that returns nothing', '아무것도 반환하지 않는 함수의 결과를 사용합니다'],
  ['The function never returns a value (or mutates in place, like list.sort), so the expression always gets None.', '함수가 값을 반환하지 않거나(list.sort처럼 제자리 변경) 식이 항상 None을 받습니다.'],
  ['Remove the use of the result, or return a value from the function.', '결과 사용을 지우거나 함수에서 값을 반환하세요.'],
  {
    on: {
      Call(n, c, r) {
        const p = n.parent;
        if (!p || p.type === 'Expr' || p.type === 'Return' || p.type === 'Lambda' || p.type === 'Await') return;
        if (p.type === 'Assign' && p.value === n && p.targets.every((t) => t.type === 'Name' && t.id === '_')) return;
        if (p.type === 'Call' && /^(?:sys\.exit|exit|quit|os\._exit|print)$/.test(dotted(p.func) || '')) return;
        if (p.type === 'Call' && /^(?:sys.exit|exit|quit|os._exit|print)$/.test(dotted(p.func) || '')) return;
        const t = c.type(n);
        if (!t || t.k !== 'none') return;
        // callee never returns normally? then there is nothing to use either
        let name = n.func.type === 'Attribute' ? n.func.attr : U.lastPart(dotted(n.func) || 'call');
        const callee = c.type(n.func);
        if (callee && callee.k === 'func' && callee.fn) {
          const fi = callee.fn;
          if (fi.isAbstract || fi.isStub || fi.isGenerator || fi.isAsync || fi.node.returns) return;
          if (!fi.returnsNone && endsInRaise(fi.node.body)) return;
          name = fi.name;
        }
        r.report(n, `'${name}' does not return anything; its result is always None.`, `'${name}'는 아무것도 반환하지 않아 결과가 항상 None입니다.`);
      },
    },
  });

function endsInRaise(body) {
  const last = body[body.length - 1];
  if (!last) return false;
  if (last.type === 'Raise') return true;
  if (last.type === 'If') return endsInRaise(last.body) && last.orelse.length > 0 && endsInRaise(last.orelse);
  return false;
}

R('exception-not-raised', 'B', 'MA', 5, ['error-handling'], 'S3984',
  ['Exception created but not raised', '예외를 만들고 raise하지 않습니다'],
  ['Creating an exception object as a statement does nothing; the raise keyword is missing.', '예외 객체를 문장으로 만들기만 하면 아무 일도 없습니다. raise가 빠졌습니다.'],
  ['Add raise in front of the expression.', '식 앞에 raise를 붙이세요.'],
  {
    on: {
      Expr(n, c, r) {
        const v = n.value;
        if (v.type !== 'Call') return;
        const f = v.func;
        let isExc = false;
        if (f.type === 'Name' && f.sym === BUILTIN && EXC_BUILTINS.has(f.id) && !/Warning$/.test(f.id)) isExc = true;
        else {
          const t = c.type(f);
          if (t && t.k === 'class' && t.cls && c.project.isException(t.cls) === true) isExc = true;
        }
        if (isExc) r.report(v, `'${short(c.slice(f), 30)}' is created but never raised; add 'raise'.`, `'${short(c.slice(f), 30)}'를 만들기만 하고 raise하지 않습니다. 'raise'를 붙이세요.`);
      },
    },
  });

R('async-not-awaited', 'B', 'MA', 5, ['async'], null,
  ['Coroutine called without await', '코루틴을 await 없이 호출합니다'],
  ['Calling an async function only creates a coroutine; without await (or create_task) its body never runs and Python warns "coroutine was never awaited".', 'async 함수를 호출하면 코루틴만 만들어지고, await(또는 create_task) 없이는 본문이 실행되지 않으며 "never awaited" 경고가 납니다.'],
  ['await the call, or schedule it with asyncio.create_task().', '호출을 await하거나 asyncio.create_task()로 예약하세요.'],
  {
    on: {
      Expr(n, c, r) {
        const v = n.value;
        if (v.type !== 'Call') return;
        const callee = resolveCallee(c, v);
        if (!callee || !callee.fn || !callee.fn.isAsync || callee.fn.isGenerator) return;
        r.report(v, `${callee.label} is a coroutine function; this call is never awaited.`, `${callee.label}는 코루틴 함수인데 이 호출을 await하지 않습니다.`);
      },
    },
  });

module.exports = { RULES, overriddenBelow, plainHierarchy, resolveCallee, checkArgs, nonException, describe, operandType, endsInRaise, NUMS };
void walkLocal; void isNone; void children; void T;
