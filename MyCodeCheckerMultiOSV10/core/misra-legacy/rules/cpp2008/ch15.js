'use strict';

// MISRA C++:2008 chapter 15 — exception handling.

const { CPP08, M } = require('../../lib/meta');
const U = require('../../lib/util');
const CP = require('../../lib/cpp');

const { cf, T } = U;
const X = CP.X;

const canonT = (t) => (t ? T.canonical(t) : null);
const fnOf = (n) => cf.enclosing(n, ['FunctionDecl', 'LambdaExpr']);

// A function body that contains a throw expression not caught inside it.
function throwsOut(fd) {
  if (!fd || !fd.body) return null;
  for (const t of cf.findAll(fd.body, 'ThrowExpr')) {
    if (fnOf(t) !== fd) continue;
    if (!X.caughtIn(t, fd, X.thrownType(t))) return t;
  }
  return null;
}
const defOf = (s) => (s && s.definition && s.definition.type === 'FunctionDecl' ? s.definition : (s && (s.decls || []).find((d) => d.type === 'FunctionDecl' && d.body)) || null);

function jumpsIntoTry(unit, api) {
  for (const g of U.get(unit, 'GotoStmt')) {
    const fd = fnOf(g);
    if (!fd || !g.label) continue;
    const lbl = cf.findFirst(fd.body, (n) => n.type === 'LabelStmt' && n.label === g.label);
    if (!lbl) continue;
    const blocks = cf.ancestors(lbl).filter((a) => a.type === 'CatchClause' || (a.type === 'CompoundStmt' && cf.parentOf(a) && cf.parentOf(a).type === 'TryStmt'));
    const gAnc = new Set(cf.ancestors(g));
    if (blocks.some((b) => !gAnc.has(b))) api.report(g, M(`'goto ${g.label}' jumps into a try or catch block.`, `'goto ${g.label}'가 try 또는 catch 블록 안으로 점프합니다.`));
  }
  for (const c of U.get(unit, 'CaseStmt', 'DefaultStmt')) {
    const sw = cf.enclosing(c, 'SwitchStmt');
    if (!sw) continue;
    for (const a of cf.ancestors(c)) {
      if (a === sw) break;
      if (a.type === 'TryStmt' || a.type === 'CatchClause') { api.report(c, M('A switch label is placed inside a try or catch block.', 'switch 레이블이 try 또는 catch 블록 안에 있습니다.')); break; }
    }
  }
}

function throwMayThrow(unit, api) {
  for (const t of U.get(unit, 'ThrowExpr')) {
    if (!t.arg) continue;
    let hit = null;
    cf.walk(t.arg, (n) => {
      if (hit) return cf.walk.STOP;
      if (n.type === 'NewExpr') hit = n;
      if (n.type === 'CallExpr' && n.calleeSymbol && throwsOut(defOf(n.calleeSymbol))) hit = n;
      return undefined;
    });
    if (hit) api.report(t, M(`Evaluating the operand of this throw may itself throw (${U.code(unit, hit)}).`, `이 throw의 피연산자를 평가할 때 예외가 발생할 수 있습니다(${U.code(unit, hit)}).`));
  }
}

function throwNull(unit, api) {
  for (const t of U.get(unit, 'ThrowExpr')) {
    const a = U.strip(t.arg);
    if (a && a.loc && a.loc.macro === 'NULL') api.report(t, M('NULL is thrown explicitly.', 'NULL을 명시적으로 throw했습니다.'));
  }
}

function startupExceptions(unit, api) {
  for (const v of U.get(unit, 'VarDecl')) {
    const s = v.symbol;
    if (!s || s.storage !== 'static' || cf.enclosing(v, 'FunctionDecl')) continue;
    let culprit = null;
    if (v.init) {
      cf.walk(v.init, (n) => {
        if (culprit) return cf.walk.STOP;
        if (n.type === 'CallExpr' && n.calleeSymbol && throwsOut(defOf(n.calleeSymbol))) culprit = n.calleeSymbol.name;
        if (n.type === 'ThrowExpr') culprit = 'throw';
        return undefined;
      });
    }
    const rec = X.recordOf(v.ctype);
    if (!culprit && rec) {
      for (const cs of X.ctorSyms(rec)) if (throwsOut(defOf(cs))) { culprit = `${X.bareName(rec)} constructor`; break; }
    }
    if (culprit) api.report(v.nameLoc || v, M(`Initialising the static object '${v.name}' may throw (${culprit}) before main starts.`, `정적 객체 '${v.name}'의 초기화가 main 시작 전에 예외를 던질 수 있습니다(${culprit}).`));
  }
}

// Throws that can reach main without a matching handler.
function unhandledThrows(project, api) {
  const cg = project.callGraph;
  if (!cg) return;
  const keyOf = new Map();
  for (const n of cg.nodes.values()) for (const d of n.definitions || []) keyOf.set(d.node, n.key);
  const reachesMain = (key, thrown, seen) => {
    if (seen.has(key)) return false;
    seen.add(key);
    const node = cg.nodes.get(key);
    if (!node) return false;
    if (node.name === 'main') return true;
    for (const c of node.callers || []) {
      const cn = cg.nodes.get(c);
      if (!cn) continue;
      for (const call of cn.calls || []) {
        if (call.to !== key) continue;
        const fd = fnOf(call.node);
        if (fd && X.caughtIn(call.node, fd, thrown)) continue;
        if (reachesMain(c, thrown, seen)) return true;
      }
    }
    return false;
  };
  for (const unit of project.units || []) {
    for (const t of U.get(unit, 'ThrowExpr')) {
      if (!t.arg) continue;
      const fd = fnOf(t);
      if (!fd || fd.type !== 'FunctionDecl') continue;
      const thrown = X.thrownType(t);
      if (X.caughtIn(t, fd, thrown)) continue;
      const key = keyOf.get(fd);
      if (key == null) continue;
      if (reachesMain(key, thrown, new Set())) api.report(t, M(`The exception thrown here has no handler on a call path from main.`, `여기서 던진 예외에 대한 처리기가 main에서 오는 호출 경로에 없습니다.`));
    }
  }
}

function handlerOrder(unit, api) {
  for (const tr of U.get(unit, 'TryStmt')) {
    const hs = tr.handlers || [];
    hs.forEach((h, j) => {
      const hr = X.recordOf(X.handlerType(h), true);
      if (!hr) return;
      for (let i = 0; i < j; i++) {
        const br = X.recordOf(X.handlerType(hs[i]), true);
        if (br && X.isDerivedFrom(hr, br)) {
          api.report(h, M(`The handler for '${X.bareName(hr)}' follows the handler for its base '${X.bareName(br)}' and can never run.`, `'${X.bareName(hr)}' 처리기가 기반 '${X.bareName(br)}' 처리기 뒤에 있어 실행될 수 없습니다.`));
          break;
        }
      }
    });
  }
}

function catchAllLast(unit, api) {
  for (const tr of U.get(unit, 'TryStmt')) {
    const hs = tr.handlers || [];
    hs.forEach((h, i) => { if (h.catchAll && i < hs.length - 1) api.report(h, M('catch (...) is not the last handler.', 'catch (...)가 마지막 처리기가 아닙니다.')); });
  }
}

function specNorm(fd) {
  const n = CP.throwSpecNames(fd);
  return n == null ? null : n.map((x) => x.replace(/\s+/g, '')).sort().join(',');
}

function sameSpecs(project, api) {
  const byQ = new Map();
  for (const unit of project.units || []) {
    for (const f of U.get(unit, 'FunctionDecl')) {
      const q = String(f.qname || f.name).replace(/^::/, '');
      const sig = `${q}(${(f.params || []).map((p) => U.tstr(p.ctype)).join(',')})`;
      const k = `${f.loc.file}:${f.loc.line}:${f.loc.col}`;
      if (!byQ.has(sig)) byQ.set(sig, new Map());
      byQ.get(sig).set(k, f);
    }
  }
  for (const m of byQ.values()) {
    const list = [...m.values()];
    if (list.length < 2) continue;
    const ref = specNorm(list[0]);
    for (const f of list.slice(1)) {
      const s = specNorm(f);
      if (s !== ref) api.report(f.nameLoc ? { ...f.nameLoc, file: f.loc.file } : f, M(`'${f.name}' is declared with a different exception specification than another declaration.`, `'${f.name}'를 다른 선언과 다른 예외 사양으로 선언했습니다.`));
    }
  }
}

function dtorThrows(unit, api) {
  for (const fd of U.funcs(unit)) {
    if (fd.type !== 'FunctionDecl' || !(fd.isDestructor || (fd.name || '').startsWith('~'))) continue;
    const t = throwsOut(fd);
    if (t) api.report(t, M(`Destructor '${fd.name}' can exit with an exception.`, `소멸자 '${fd.name}'가 예외와 함께 끝날 수 있습니다.`));
  }
}

function specViolations(unit, api) {
  for (const fd of U.funcs(unit)) {
    if (fd.type !== 'FunctionDecl') continue;
    const decls = [fd, ...((fd.symbol && fd.symbol.decls) || [])];
    let names = null;
    for (const d of decls) { const n = d.type === 'FunctionDecl' ? CP.throwSpecNames(d) : null; if (n) { names = n; break; } }
    if (!names) continue;
    for (const t of cf.findAll(fd.body, 'ThrowExpr')) {
      if (fnOf(t) !== fd || !t.arg) continue;
      const tt = X.thrownType(t);
      if (!tt || X.caughtIn(t, fd, tt)) continue;
      const tn = CP.typeName(tt);
      const allowed = names.some((n) => {
        const bare = n.replace(/^const\s+|\s*[&*]\s*$/g, '').replace(/^.*::/, '').trim();
        if (bare === tn) return true;
        const r = X.recordOf(tt);
        return !!(r && X.baseRecords(r).length && (function up(x, d) { return d < 20 && X.baseRecords(x).some((b) => X.bareName(b) === bare || up(b, d + 1)); })(r, 0));
      });
      if (!allowed) api.report(t, M(`'${fd.name}' throws '${tn}', which its exception specification does not list.`, `'${fd.name}'가 예외 사양에 없는 '${tn}'를 던집니다.`));
    }
  }
}

const DOC = (id, name, why, fix) => CPP08({ id, cat: 'D', manual: true, name, why, fix });

module.exports = [
  DOC('15-0-1', ['Exceptions shall only be used for error handling', '예외는 오류 처리에만 사용해야 합니다'],
    ['Exceptions used for normal control flow obscure the program logic.', '정상 제어 흐름에 예외를 쓰면 프로그램 논리가 흐려집니다.'],
    ['Document that every throw reports an error condition.', '모든 throw가 오류 상황을 알린다는 것을 문서화하세요.']),
  CPP08({
    id: '15-0-2', cat: 'A', dec: true, cpp2023: '18.1.1',
    name: ['An exception object should not have pointer type', '예외 객체는 포인터 형식이면 안 됩니다'],
    why: ['It is unclear who deletes a thrown pointer.', '던진 포인터를 누가 해제하는지 불분명합니다.'],
    fix: ['Throw objects by value.', '객체를 값으로 던지세요.'],
    reuse: 'misra-cpp:18.1.1',
  }),
  CPP08({
    id: '15-0-3', cat: 'R', dec: true,
    name: ['Control shall not jump into a try or catch block', '제어가 try 또는 catch 블록 안으로 점프하면 안 됩니다'],
    why: ['Jumping into a handler or try block is ill-formed or bypasses exception set-up.', '처리기나 try 블록으로 점프하는 것은 잘못된 형식이거나 예외 설정을 건너뜁니다.'],
    fix: ['Restructure the code so the block is entered from its start.', '블록에 시작 지점으로 들어가도록 코드를 재구성하세요.'],
    check: jumpsIntoTry,
  }),
  CPP08({
    id: '15-1-1', cat: 'R', dec: false,
    name: ['The operand of a throw shall not itself throw', 'throw의 피연산자 자체가 예외를 던지면 안 됩니다'],
    why: ['An exception while creating the exception object calls std::terminate.', '예외 객체를 만드는 중의 예외는 std::terminate를 호출합니다.'],
    fix: ['Construct the exception object from values that cannot throw.', '예외를 던지지 않는 값으로 예외 객체를 만드세요.'],
    check: throwMayThrow,
  }),
  CPP08({
    id: '15-1-2', cat: 'R', dec: true,
    name: ['NULL shall not be thrown explicitly', 'NULL을 명시적으로 throw하지 않아야 합니다'],
    why: ['throw NULL throws an integer, not a pointer.', 'throw NULL은 포인터가 아니라 정수를 던집니다.'],
    fix: ['Throw an exception object.', '예외 객체를 던지세요.'],
    check: throwNull,
  }),
  CPP08({
    id: '15-1-3', cat: 'R', dec: true, cpp2023: '18.1.2',
    name: ['An empty throw shall only be used inside a catch handler', '빈 throw는 catch 처리기 안에서만 사용해야 합니다'],
    why: ['Rethrowing with no active exception calls std::terminate.', '활성 예외 없이 다시 던지면 std::terminate가 호출됩니다.'],
    fix: ['Move the rethrow into the handler.', '다시 던지기를 처리기 안으로 옮기세요.'],
    reuse: 'misra-cpp:18.1.2',
  }),
  CPP08({
    id: '15-3-1', cat: 'R', dec: false,
    name: ['Exceptions shall only be raised after start-up and before termination', '예외는 시작 후, 종료 전에만 발생해야 합니다'],
    why: ['An exception from a static initialiser cannot be caught and terminates the program.', '정적 초기화의 예외는 잡을 수 없어 프로그램이 종료됩니다.'],
    fix: ['Initialise static objects with operations that cannot throw.', '정적 객체를 예외를 던지지 않는 연산으로 초기화하세요.'],
    check: startupExceptions,
  }),
  CPP08({
    id: '15-3-2', cat: 'A', dec: true, cpp2023: '18.3.1',
    name: ['There should be a handler that catches all otherwise unhandled exceptions', '처리되지 않은 모든 예외를 잡는 처리기가 있어야 합니다'],
    why: ['An exception escaping main may skip stack unwinding.', 'main을 빠져나가는 예외는 스택 해제를 건너뛸 수 있습니다.'],
    fix: ['Wrap the body of main in try with a catch (...) handler.', 'main 본문을 try로 감싸고 catch (...) 처리기를 두세요.'],
    reuse: 'misra-cpp:18.3.1',
  }),
  CPP08({
    id: '15-3-3', cat: 'R', dec: true, type: 'BUG', cpp2023: '18.3.3',
    name: ['Function-try-block handlers of constructors and destructors shall not use members', '생성자와 소멸자의 함수 try 블록 처리기는 멤버를 사용하지 않아야 합니다'],
    why: ['The members may already be destroyed when the handler runs.', '처리기가 실행될 때 멤버는 이미 소멸되었을 수 있습니다.'],
    fix: ['Do not refer to non-static members in those handlers.', '그런 처리기에서는 비정적 멤버를 참조하지 마세요.'],
    reuse: 'misra-cpp:18.3.3',
  }),
  CPP08({
    id: '15-3-4', cat: 'R', dec: false,
    name: ['Every thrown exception shall have a compatible handler on all call paths', '던진 모든 예외는 모든 호출 경로에 호환되는 처리기가 있어야 합니다'],
    why: ['An unhandled exception calls std::terminate.', '처리되지 않은 예외는 std::terminate를 호출합니다.'],
    fix: ['Catch the exception on every path from main.', 'main에서 오는 모든 경로에서 예외를 잡으세요.'],
    project: unhandledThrows,
  }),
  CPP08({
    id: '15-3-5', cat: 'R', dec: true, cpp2023: '18.3.2',
    name: ['A class type exception shall be caught by reference', '클래스 형식 예외는 참조로 잡아야 합니다'],
    why: ['Catching by value slices the object and copies it.', '값으로 잡으면 객체가 잘리고 복사됩니다.'],
    fix: ['Catch by (const) reference.', '(const) 참조로 잡으세요.'],
    reuse: 'misra-cpp:18.3.2',
  }),
  CPP08({
    id: '15-3-6', cat: 'R', dec: true, type: 'BUG',
    name: ['Handlers shall be ordered from most derived to base class', '처리기는 가장 파생된 클래스에서 기반 클래스 순서여야 합니다'],
    why: ['A base handler before a derived one hides the derived handler.', '파생 처리기 앞의 기반 처리기는 파생 처리기를 가립니다.'],
    fix: ['Put the derived class handlers first.', '파생 클래스 처리기를 앞에 두세요.'],
    check: handlerOrder,
  }),
  CPP08({
    id: '15-3-7', cat: 'R', dec: true, type: 'BUG',
    name: ['catch (...) shall be the last handler', 'catch (...)는 마지막 처리기여야 합니다'],
    why: ['Handlers after catch (...) can never run.', 'catch (...) 뒤의 처리기는 실행될 수 없습니다.'],
    fix: ['Move catch (...) to the end.', 'catch (...)를 끝으로 옮기세요.'],
    check: catchAllLast,
  }),
  CPP08({
    id: '15-4-1', cat: 'R', dec: true,
    name: ['All declarations of a function shall have the same exception specification', '함수의 모든 선언은 같은 예외 사양을 가져야 합니다'],
    why: ['Different specifications are ill-formed or give unexpected std::unexpected calls.', '다른 사양은 잘못된 형식이거나 뜻밖의 std::unexpected 호출을 일으킵니다.'],
    fix: ['Use the same type-ids in every declaration.', '모든 선언에서 같은 형식 목록을 사용하세요.'],
    project: sameSpecs,
  }),
  CPP08({
    id: '15-5-1', cat: 'R', dec: true, type: 'BUG', cwe: 'CWE-248',
    name: ['A destructor shall not exit with an exception', '소멸자는 예외와 함께 끝나면 안 됩니다'],
    why: ['An exception from a destructor during unwinding calls std::terminate.', '스택 해제 중 소멸자의 예외는 std::terminate를 호출합니다.'],
    fix: ['Catch the exception inside the destructor.', '예외를 소멸자 안에서 잡으세요.'],
    check: dtorThrows,
  }),
  CPP08({
    id: '15-5-2', cat: 'R', dec: true, type: 'BUG',
    name: ['A function shall only throw the types listed in its exception specification', '함수는 예외 사양에 나열된 형식만 던져야 합니다'],
    why: ['Throwing another type calls std::unexpected.', '다른 형식을 던지면 std::unexpected가 호출됩니다.'],
    fix: ['Add the type to the specification or handle it inside.', '형식을 사양에 추가하거나 안에서 처리하세요.'],
    check: specViolations,
  }),
  CPP08({
    id: '15-5-3', cat: 'R', dec: false, type: 'BUG', cpp2023: '18.5.1', cwe: 'CWE-248',
    name: ['std::terminate shall not be called implicitly', 'std::terminate가 암시적으로 호출되면 안 됩니다'],
    why: ['Implicit termination skips cleanup and loses the error.', '암시적 종료는 정리를 건너뛰고 오류를 잃습니다.'],
    fix: ['Make sure no exception leaves a noexcept function or a destructor.', '어떤 예외도 noexcept 함수나 소멸자를 빠져나가지 않게 하세요.'],
    reuse: 'misra-cpp:18.5.1',
  }),
];
