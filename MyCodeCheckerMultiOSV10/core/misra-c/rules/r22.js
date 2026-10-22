'use strict';

// MISRA C:2012 / 2023 chapter 22 — resources (incl. Amendment 4 threads).

const B = require('../lib/b-common');
const L = require('../lib/b-stdlib');
const R = require('../lib/b-resource');

const { cf, T, rule, msg, nodes, functions, text, skipParens, stripCasts, calleeName, canon } = B;

const THREAD_TYPES = new Set(['thrd_t', 'mtx_t', 'cnd_t', 'tss_t', 'once_flag']);
const THREAD_FNS = new Set(L.FUNCS['threads.h']);
const SYNC_ACCESS = new Set(['mtx_lock', 'mtx_unlock', 'mtx_trylock', 'mtx_timedlock', 'mtx_destroy', 'cnd_wait', 'cnd_timedwait', 'cnd_signal', 'cnd_broadcast', 'cnd_destroy']);
const TSS_ACCESS = new Set(['tss_get', 'tss_set', 'tss_delete']);
const DESTROY = new Set(['mtx_destroy', 'cnd_destroy', 'tss_delete']);
const EOF_FNS = new Set(['fgetc', 'getc', 'getchar', 'fputc', 'putc', 'putchar', 'fputs', 'puts', 'ungetc', 'fclose', 'fflush', 'fscanf', 'scanf', 'sscanf', 'vfscanf', 'vscanf', 'vsscanf', 'fgetwc', 'getwc', 'getwchar', 'fputwc', 'putwc', 'putwchar', 'ungetwc', 'btowc', 'wctob']);

// Reporter for cached per-function events of one rule.
function fromEvents(id, analysis) {
  return (unit, api) => {
    for (const fd of functions(unit)) for (const e of analysis(fd, unit, api)) if (e.key === id) api.report(e.node, e.message);
  };
}

const res = (fd, unit) => R.resources(fd, unit);
const errno = (fd, unit) => R.errnoEvents(fd, unit);
const mutex = (fd, unit, api) => R.mutexEvents(fd, unit, R.projectInfo(api.project, unit));
const threads = (fd, unit) => R.threadEvents(fd, unit);

function isFilePtr(t) {
  const c = canon(t);
  if (!c || c.kind !== 'pointer') return false;
  return !!B.typedefNameIn(c.to, new Set(['FILE'])) || (canon(c.to) && canon(c.to).kind === 'record' && canon(c.to).name === '_IO_FILE');
}

function isEofMacro(e) {
  let x = e;
  for (let i = 0; i < 5 && x; i++) {
    if (x.loc && x.loc.macro === 'EOF') return true;
    if (x.type !== 'ParenExpr') return false;
    x = x.expr;
  }
  return false;
}

// Source-ordered calls of a function body.
function callsInOrder(fd) {
  return cf.findAll(fd.body, 'CallExpr').sort((a, b) => a.loc.start - b.loc.start);
}

function threadType(t) {
  return B.typedefNameIn(t, THREAD_TYPES);
}

module.exports = [
  rule({
    id: '22.1', cat: 'Required', type: 'VULNERABILITY', sev: 'CRITICAL', debt: 20, decidable: false, cwe: 'CWE-772', cert: 'MEM31-C',
    name: ['Dynamically obtained resources shall be explicitly released', '동적으로 얻은 자원은 명시적으로 해제해야 합니다'],
    why: ['Memory and streams that are never released are leaked, and the system eventually runs out of them.', '해제하지 않은 메모리와 스트림은 누수되어 결국 시스템 자원이 고갈됩니다.'],
    fix: ['Free every allocation and close every stream on all paths, including error paths.', '오류 경로를 포함한 모든 경로에서 할당을 해제하고 스트림을 닫으세요.'],
    check: fromEvents('22.1', res),
  }),
  rule({
    id: '22.2', cat: 'Mandatory', type: 'VULNERABILITY', sev: 'BLOCKER', debt: 15, decidable: false, cwe: 'CWE-590', cert: 'MEM34-C',
    name: ['Only memory allocated by the standard library shall be freed', '표준 라이브러리로 할당한 메모리만 해제해야 합니다'],
    why: ['Freeing memory that was not allocated by malloc, calloc or realloc, or freeing it twice, is undefined behaviour and corrupts the heap.', 'malloc, calloc, realloc으로 할당하지 않은 메모리를 해제하거나 두 번 해제하면 정의되지 않은 동작이며 힙이 손상됩니다.'],
    fix: ['Free only pointers returned by the allocation functions, exactly once, and set them to NULL afterwards.', '할당 함수가 반환한 포인터만 정확히 한 번 해제하고, 해제 후 NULL로 설정하세요.'],
    check: fromEvents('22.2', res),
  }),
  rule({
    id: '22.3', cat: 'Required', type: 'BUG', debt: 15, decidable: false, cwe: 'CWE-362', cert: 'FIO24-C',
    name: ['A file shall not be open for reading and writing on different streams at once', '같은 파일을 서로 다른 스트림으로 동시에 읽기와 쓰기용으로 열면 안 됩니다'],
    why: ['Accessing one file through a read stream and a write stream at the same time has implementation-defined results because of buffering.', '한 파일을 읽기 스트림과 쓰기 스트림으로 동시에 접근하면 버퍼링 때문에 결과가 구현에 따라 달라집니다.'],
    fix: ['Close the first stream before opening the file again, or open it once in update mode.', '파일을 다시 열기 전에 첫 스트림을 닫거나, 갱신 모드로 한 번만 여세요.'],
    check(unit, api) {
      for (const fd of functions(unit)) {
        const open = [];
        for (const c of callsInOrder(fd)) {
          const nm = calleeName(c);
          if (nm === 'fopen' && B.isLibCall(c, ['fopen'])) {
            const f = stripCasts(c.args[0]);
            const m = stripCasts(c.args[1]);
            if (!f || f.type !== 'StringLiteral') continue;
            const mode = m && m.type === 'StringLiteral' ? m.value : '';
            const write = !mode.startsWith('r') || mode.includes('+');
            const read = mode.startsWith('r') || mode.includes('+');
            const p = cf.parentOf(c);
            let sym = null;
            if (p && p.type === 'VarDecl') sym = p.symbol;
            else if (p && p.type === 'AssignExpr' && skipParens(p.left).type === 'Identifier') sym = skipParens(p.left).symbol;
            const clash = open.find((o) => o.file === f.value && o.sym !== sym && ((o.write && read) || (o.read && write)));
            if (clash) api.report(c, msg(`'${f.value}' is opened again (mode "${mode}") while it is still open on another stream (line ${clash.call.loc.line}).`, `'${f.value}'이(가) 다른 스트림(${clash.call.loc.line}행)으로 열려 있는 상태에서 다시 열립니다(모드 "${mode}").`));
            open.push({ file: f.value, write, read, sym, call: c });
          } else if (nm === 'fclose') {
            const a = stripCasts(c.args[0]);
            if (a && a.type === 'Identifier') for (let i = open.length - 1; i >= 0; i--) if (open[i].sym === a.symbol) open.splice(i, 1);
          }
        }
      }
    },
  }),
  rule({
    id: '22.4', cat: 'Mandatory', type: 'BUG', sev: 'CRITICAL', debt: 10, decidable: false, cwe: 'CWE-664',
    name: ['A stream opened read-only shall not be written to', '읽기 전용으로 연 스트림에 쓰면 안 됩니다'],
    why: ['Writing to a read-only stream fails or is undefined behaviour.', '읽기 전용 스트림에 쓰면 실패하거나 정의되지 않은 동작입니다.'],
    fix: ['Open the stream with a mode that allows writing, or do not write to it.', '쓰기를 허용하는 모드로 스트림을 열거나 쓰지 마세요.'],
    check: fromEvents('22.4', res),
  }),
  rule({
    id: '22.5', cat: 'Mandatory', type: 'BUG', sev: 'CRITICAL', debt: 10, decidable: false, cert: 'FIO38-C',
    name: ['A pointer to a FILE object shall not be dereferenced', 'FILE 객체에 대한 포인터를 역참조하면 안 됩니다'],
    why: ['The contents of a FILE object belong to the library; copying or inspecting it is undefined or non-portable.', 'FILE 객체의 내용은 라이브러리 소유이므로 복사하거나 들여다보면 정의되지 않았거나 이식성이 없습니다.'],
    fix: ['Only pass the FILE pointer to the standard I/O functions.', 'FILE 포인터는 표준 입출력 함수에 넘기기만 하세요.'],
    check(unit, api) {
      for (const u of nodes(unit, 'UnaryExpr')) {
        if (u.op === '*' && isFilePtr(u.arg.ctype)) api.report(u, msg(`The FILE pointer '${text(unit, u.arg)}' is dereferenced.`, `FILE 포인터 '${text(unit, u.arg)}'을(를) 역참조합니다.`));
      }
      for (const m of nodes(unit, 'MemberExpr')) if (m.arrow && isFilePtr(m.object.ctype)) api.report(m, msg(`The FILE pointer '${text(unit, m.object)}' is dereferenced to access '${m.member}'.`, `FILE 포인터 '${text(unit, m.object)}'을(를) 역참조해 '${m.member}'에 접근합니다.`));
      for (const ix of nodes(unit, 'IndexExpr')) if (isFilePtr(ix.object.ctype)) api.report(ix, msg(`The FILE pointer '${text(unit, ix.object)}' is indexed.`, `FILE 포인터 '${text(unit, ix.object)}'에 인덱스를 적용합니다.`));
      for (const c of B.libCalls(unit, new Set(['memcpy', 'memmove', 'memcmp', 'memset']))) {
        const a = c.args.slice(0, 2).find((x) => isFilePtr(stripCasts(x).ctype));
        if (a) api.report(c, msg(`'${calleeName(c)}' accesses the FILE object through '${text(unit, a)}'.`, `'${calleeName(c)}'이(가) '${text(unit, a)}'을(를) 통해 FILE 객체에 접근합니다.`));
      }
    },
  }),
  rule({
    id: '22.6', cat: 'Mandatory', type: 'BUG', sev: 'CRITICAL', debt: 10, decidable: false, cwe: 'CWE-672', cert: 'FIO46-C',
    name: ['A FILE pointer shall not be used after its stream is closed', '스트림을 닫은 뒤 FILE 포인터를 사용하면 안 됩니다'],
    why: ['After fclose the pointer value is indeterminate; using it is undefined behaviour.', 'fclose 후 포인터 값은 불확정이므로 사용하면 정의되지 않은 동작입니다.'],
    fix: ['Set the pointer to NULL after closing and do not use it again.', '닫은 뒤 포인터를 NULL로 설정하고 다시 사용하지 마세요.'],
    check: fromEvents('22.6', res),
  }),
  rule({
    id: '22.7', cat: 'Required', type: 'BUG', debt: 10, decidable: false, cwe: 'CWE-197', cert: 'FIO34-C',
    name: ['EOF shall only be compared with the unmodified result of a function that can return it', 'EOF는 EOF를 반환할 수 있는 함수의 수정되지 않은 결과와만 비교해야 합니다'],
    why: ['Once the int result is converted, for example to char, a valid character can compare equal to EOF and EOF can be missed.', 'int 결과를 char 등으로 변환하면 유효한 문자가 EOF와 같다고 판단되거나 EOF를 놓칠 수 있습니다.'],
    fix: ['Store the result in an int and compare that int with EOF before converting it.', '결과를 int에 저장하고 변환하기 전에 그 int를 EOF와 비교하세요.'],
    check(unit, api) {
      const intSize = unit.target.int || 4;
      for (const b of nodes(unit, 'BinaryExpr')) {
        if (!['==', '!=', '<', '<=', '>', '>='].includes(b.op)) continue;
        let other = null;
        if (isEofMacro(b.right)) other = b.left;
        else if (isEofMacro(b.left)) other = b.right;
        if (!other) continue;
        const o = skipParens(other);
        let bad = null;
        if (o.type === 'CallExpr') {
          if (!EOF_FNS.has(calleeName(o) || '') && o.calleeSymbol && !o.calleeSymbol.system) bad = `'${calleeName(o)}' cannot return EOF`;
        } else if (o.type === 'CastExpr') bad = 'it is converted by a cast';
        else if (o.type === 'Identifier' || o.type === 'MemberExpr' || o.type === 'IndexExpr') {
          let sz = null;
          try { sz = T.sizeOf(canon(o.ctype), unit.target); } catch (err) { sz = null; }
          if (sz !== null && sz < intSize) bad = `'${text(unit, o)}' has type '${T.typeToString(o.ctype)}', narrower than int`;
        } else if (o.type === 'AssignExpr') {
          let sz = null;
          try { sz = T.sizeOf(canon(o.left.ctype), unit.target); } catch (err) { sz = null; }
          if (sz !== null && sz < intSize) bad = `the result is stored in '${text(unit, o.left)}' of type '${T.typeToString(o.left.ctype)}' first`;
        } else bad = 'it is the result of a computation';
        if (bad) api.report(b, msg(`EOF is compared with '${text(unit, other)}', but ${bad}.`, `EOF를 '${text(unit, other)}'와(과) 비교하지만 수정된 값입니다(${bad}).`));
      }
    },
  }),
  rule({
    id: '22.8', cat: 'Required', type: 'BUG', debt: 5, decidable: false, cert: 'ERR30-C',
    name: ['errno shall be set to zero before calling an errno-setting function', 'errno 설정 함수를 호출하기 전에 errno를 0으로 설정해야 합니다'],
    why: ['These functions only set errno on failure, so a stale non-zero value from earlier would be read as a new error.', '이 함수들은 실패할 때만 errno를 설정하므로 이전의 0이 아닌 값을 새 오류로 읽게 됩니다.'],
    fix: ['Write errno = 0; immediately before the call.', '호출 바로 앞에 errno = 0;을 쓰세요.'],
    check: fromEvents('22.8', errno),
  }),
  rule({
    id: '22.9', cat: 'Required', type: 'BUG', debt: 5, decidable: false, cwe: 'CWE-391', cert: 'ERR30-C',
    name: ['errno shall be tested after calling an errno-setting function', 'errno 설정 함수를 호출한 뒤 errno를 검사해야 합니다'],
    why: ['For these functions errno is the only reliable error indicator; not testing it ignores failures.', '이 함수들에서는 errno만이 믿을 수 있는 오류 표시이므로, 검사하지 않으면 실패를 무시하게 됩니다.'],
    fix: ['Test errno right after the call, before any other function call.', '다른 함수를 호출하기 전에 호출 직후 errno를 검사하세요.'],
    check: fromEvents('22.9', errno),
  }),
  rule({
    id: '22.10', cat: 'Required', type: 'BUG', debt: 5, decidable: false, cert: 'ERR30-C',
    name: ['errno shall only be tested right after an errno-setting function', 'errno는 errno 설정 함수 직후에만 검사해야 합니다'],
    why: ['Other functions may change errno even when they succeed, so its value after them means nothing.', '다른 함수는 성공해도 errno를 바꿀 수 있어 그 뒤의 errno 값은 의미가 없습니다.'],
    fix: ['Use the error indicator of the function you called, and test errno only after an errno-setting function.', '호출한 함수의 오류 표시를 사용하고, errno는 errno 설정 함수 뒤에서만 검사하세요.'],
    check: fromEvents('22.10', errno),
  }),
  rule({
    id: '22.11', cat: 'Required', type: 'BUG', debt: 10, decidable: false, amd: 'AMD4', cwe: 'CWE-675', cert: 'CON39-C',
    name: ['A thread shall not be joined or detached twice', '스레드를 두 번 join하거나 detach하면 안 됩니다'],
    why: ['Joining or detaching a thread that was already joined or detached is undefined behaviour.', '이미 join 또는 detach된 스레드를 다시 join하거나 detach하면 정의되지 않은 동작입니다.'],
    fix: ['Join or detach each created thread exactly once.', '생성한 각 스레드를 정확히 한 번만 join하거나 detach하세요.'],
    check: fromEvents('22.11', threads),
  }),
  rule({
    id: '22.12', cat: 'Mandatory', type: 'BUG', sev: 'CRITICAL', debt: 10, decidable: false, amd: 'AMD4', cwe: 'CWE-662',
    name: ['Thread and synchronisation objects shall only be accessed through the thread library', '스레드·동기화 객체는 스레드 라이브러리로만 접근해야 합니다'],
    why: ['thrd_t, mtx_t, cnd_t and tss_t are opaque; copying, comparing or modifying them directly is undefined behaviour.', 'thrd_t, mtx_t, cnd_t, tss_t는 불투명 형이므로 직접 복사·비교·수정하면 정의되지 않은 동작입니다.'],
    fix: ['Use only the <threads.h> functions (thrd_equal, mtx_lock, …) on these objects.', '이 객체에는 <threads.h> 함수(thrd_equal, mtx_lock 등)만 사용하세요.'],
    check(unit, api) {
      for (const n of nodes(unit, ['Identifier', 'MemberExpr', 'UnaryExpr', 'IndexExpr'])) {
        if (n.type === 'UnaryExpr' && n.op !== '*') continue;
        const tn = threadType(n.ctype);
        if (!tn || B.isPointerType(n.ctype)) continue;
        if (n.type === 'Identifier' && (!n.symbol || n.symbol.kind === 'function')) continue;
        let x = n;
        let p = cf.parentOf(x);
        while (p && p.type === 'ParenExpr') { x = p; p = cf.parentOf(p); }
        if (!p) continue;
        if (p.type === 'SizeofExpr' || p.type === 'AlignofExpr') continue;
        if (p.type === 'MemberExpr' && p.object === x && !p.arrow && threadType(p.ctype)) continue; // reported at the outer node
        if (p.type === 'IndexExpr' && p.object === x) continue;
        if (p.type === 'UnaryExpr' && p.op === '&') {
          let y = p;
          let q = cf.parentOf(y);
          while (q && (q.type === 'ParenExpr' || q.type === 'CastExpr')) { y = q; q = cf.parentOf(q); }
          if (q && q.type === 'CallExpr' && B.isLibCall(q, new Set(['memcpy', 'memmove', 'memset', 'memcmp']))) api.report(q, msg(`'${calleeName(q)}' accesses the ${tn} object '${text(unit, n)}' directly.`, `'${calleeName(q)}'이(가) ${tn} 객체 '${text(unit, n)}'에 직접 접근합니다.`));
          continue;
        }
        if (p.type === 'CallExpr' && p.callee !== x && THREAD_FNS.has(calleeName(p) || '')) continue;
        if (p.type === 'CallExpr' && p.callee === x) continue;
        api.report(n, msg(`The ${tn} object '${text(unit, n)}' is accessed other than through a <threads.h> function.`, `${tn} 객체 '${text(unit, n)}'에 <threads.h> 함수가 아닌 방법으로 접근합니다.`));
      }
    },
  }),
  rule({
    id: '22.13', cat: 'Required', type: 'BUG', debt: 10, decidable: true, amd: 'AMD4', cwe: 'CWE-562',
    name: ['Thread and synchronisation objects shall have static storage duration', '스레드·동기화 객체는 정적 저장 기간을 가져야 합니다'],
    why: ['An automatic or thread-local thread object, mutex or TSS key may cease to exist while other threads still use it.', '자동 또는 스레드 지역 스레드 객체, 뮤텍스, TSS 키는 다른 스레드가 아직 사용하는 동안 사라질 수 있습니다.'],
    fix: ['Declare these objects at file scope or with static.', '이 객체들을 파일 범위나 static으로 선언하세요.'],
    check(unit, api) {
      for (const d of nodes(unit, 'VarDecl')) {
        const tn = threadType(d.ctype);
        if (!tn || !d.symbol || B.isPointerType(d.ctype)) continue;
        if (d.symbol.storage === 'automatic' || d.symbol.storage === 'thread') api.report(d, msg(`The ${tn} object '${d.name}' has ${d.symbol.storage === 'thread' ? 'thread' : 'automatic'} storage duration.`, `${tn} 객체 '${d.name}'의 저장 기간이 ${d.symbol.storage === 'thread' ? '스레드' : '자동'}입니다.`));
      }
    },
  }),
  rule({
    id: '22.14', cat: 'Mandatory', type: 'BUG', sev: 'CRITICAL', debt: 10, decidable: false, amd: 'AMD4', cwe: 'CWE-908',
    name: ['Synchronisation objects shall be initialised before they are accessed', '동기화 객체는 접근하기 전에 초기화해야 합니다'],
    why: ['Locking or waiting on a mutex or condition variable that was never initialised is undefined behaviour.', '초기화하지 않은 뮤텍스나 조건 변수를 잠그거나 기다리면 정의되지 않은 동작입니다.'],
    fix: ['Call mtx_init or cnd_init (and check its result) before the object is first used.', '객체를 처음 사용하기 전에 mtx_init이나 cnd_init을 호출하고 결과를 검사하세요.'],
    project(project, api) {
      const info = R.projectInfo(project);
      for (const u of project.units) {
        for (const fd of functions(u)) {
          const seenInit = new Set();
          for (const c of callsInOrder(fd)) {
            const nm = calleeName(c);
            if ((nm === 'mtx_init' || nm === 'cnd_init') && c.args[0]) { seenInit.add(R.objKey(c.args[0], u).key); continue; }
            if (!SYNC_ACCESS.has(nm) || !c.args[0]) continue;
            const objs = nm === 'cnd_wait' || nm === 'cnd_timedwait' ? [c.args[0], c.args[1]] : [c.args[0]];
            for (const a of objs) {
              if (!a) continue;
              const k = R.objKey(a, u);
              if (k.sym && B.isPointerType(k.sym.type)) continue; // through a pointer: unknown object
              const ok = k.global ? info.inits.has(k.key) : (seenInit.has(k.key) || !k.sym);
              if (!ok && (k.sym || k.global)) api.report(c, msg(`'${nm}' accesses '${k.name}' before it is initialised.`, `'${nm}'이(가) 초기화 전의 '${k.name}'에 접근합니다.`));
            }
          }
        }
      }
    },
  }),
  rule({
    id: '22.15', cat: 'Required', type: 'BUG', debt: 15, decidable: false, amd: 'AMD4', cwe: 'CWE-416',
    name: ['Synchronisation objects shall not be destroyed while threads may still use them', '스레드가 아직 사용할 수 있는 동안 동기화 객체를 파괴하면 안 됩니다'],
    why: ['Destroying a mutex, condition variable or TSS key that a running thread still uses is undefined behaviour.', '실행 중인 스레드가 아직 사용하는 뮤텍스, 조건 변수, TSS 키를 파괴하면 정의되지 않은 동작입니다.'],
    fix: ['Join all threads that use the object before destroying it.', '객체를 파괴하기 전에 그것을 사용하는 모든 스레드를 join하세요.'],
    check(unit, api) {
      for (const fd of functions(unit)) {
        const running = new Map();
        for (const c of callsInOrder(fd)) {
          const nm = calleeName(c);
          if (nm === 'thrd_create' && c.args[0]) running.set(R.objKey(c.args[0], unit).key, R.objKey(c.args[0], unit).name);
          else if (nm === 'thrd_join' && c.args[0]) running.delete(R.objKey(c.args[0], unit).key);
          else if (DESTROY.has(nm) && c.args[0] && running.size) {
            const t = [...running.values()][0];
            api.report(c, msg(`'${nm}(${text(unit, c.args[0])})' is called while thread '${t}' may still be running.`, `스레드 '${t}'이(가) 아직 실행 중일 수 있는데 '${nm}(${text(unit, c.args[0])})'을(를) 호출합니다.`));
          }
        }
      }
    },
  }),
  rule({
    id: '22.16', cat: 'Required', type: 'BUG', debt: 15, decidable: false, amd: 'AMD4', cwe: 'CWE-667', cert: 'POS48-C',
    name: ['A mutex locked by a thread shall be unlocked by that thread', '스레드가 잠근 뮤텍스는 그 스레드가 잠금 해제해야 합니다'],
    why: ['A mutex left locked when the function returns blocks every other thread that needs it.', '함수가 반환할 때 잠긴 채 남은 뮤텍스는 그것이 필요한 다른 모든 스레드를 막습니다.'],
    fix: ['Unlock the mutex on every path out of the function, including error paths.', '오류 경로를 포함해 함수의 모든 종료 경로에서 뮤텍스를 잠금 해제하세요.'],
    check: fromEvents('22.16', mutex),
  }),
  rule({
    id: '22.17', cat: 'Required', type: 'BUG', debt: 10, decidable: false, amd: 'AMD4', cwe: 'CWE-667',
    name: ['A thread shall not unlock or wait on a mutex it has not locked', '스레드는 잠그지 않은 뮤텍스를 잠금 해제하거나 그것으로 대기하면 안 됩니다'],
    why: ['Unlocking a mutex not held, or calling cnd_wait without holding the mutex, is undefined behaviour.', '잡고 있지 않은 뮤텍스를 해제하거나 뮤텍스 없이 cnd_wait를 호출하면 정의되지 않은 동작입니다.'],
    fix: ['Lock the mutex before unlocking it or waiting on it, and unlock it only once.', '해제하거나 대기하기 전에 뮤텍스를 잠그고, 한 번만 해제하세요.'],
    check: fromEvents('22.17', mutex),
  }),
  rule({
    id: '22.18', cat: 'Required', type: 'BUG', debt: 10, decidable: false, amd: 'AMD4', cwe: 'CWE-764', cert: 'CON35-C',
    name: ['Non-recursive mutexes shall not be locked recursively', '재귀적이지 않은 뮤텍스를 재귀적으로 잠그면 안 됩니다'],
    why: ['Locking a plain mutex the thread already holds deadlocks or is undefined behaviour.', '스레드가 이미 잡고 있는 일반 뮤텍스를 다시 잠그면 교착 상태가 되거나 정의되지 않은 동작입니다.'],
    fix: ['Restructure the code so the mutex is locked once, or initialise it with mtx_recursive.', '뮤텍스를 한 번만 잠그도록 코드를 고치거나 mtx_recursive로 초기화하세요.'],
    check: fromEvents('22.18', mutex),
  }),
  rule({
    id: '22.19', cat: 'Required', type: 'BUG', debt: 10, decidable: false, amd: 'AMD4',
    name: ['A condition variable shall be used with only one mutex', '조건 변수는 하나의 뮤텍스와만 사용해야 합니다'],
    why: ['Waiting on one condition variable with different mutexes is undefined behaviour.', '하나의 조건 변수를 서로 다른 뮤텍스로 기다리면 정의되지 않은 동작입니다.'],
    fix: ['Associate each condition variable with exactly one mutex.', '각 조건 변수를 정확히 하나의 뮤텍스와 연결하세요.'],
    project(project, api) {
      const first = new Map();
      for (const u of project.units) {
        for (const c of B.nodes(u, 'CallExpr')) {
          const nm = calleeName(c);
          if ((nm !== 'cnd_wait' && nm !== 'cnd_timedwait') || c.args.length < 2) continue;
          const cv = R.objKey(c.args[0], u), mx = R.objKey(c.args[1], u);
          const f = first.get(cv.key);
          if (!f) first.set(cv.key, { mx, call: c });
          else if (f.mx.key !== mx.key) api.report(c, msg(`Condition variable '${cv.name}' is used with mutex '${mx.name}' here but with '${f.mx.name}' at line ${f.call.loc.line}.`, `조건 변수 '${cv.name}'이(가) 여기서는 뮤텍스 '${mx.name}'와(과), ${f.call.loc.line}행에서는 '${f.mx.name}'와(과) 쓰였습니다.`));
        }
      }
    },
  }),
  rule({
    id: '22.20', cat: 'Mandatory', type: 'BUG', sev: 'CRITICAL', debt: 10, decidable: false, amd: 'AMD4', cwe: 'CWE-908',
    name: ['Thread-specific storage keys shall be created before they are used', '스레드별 저장소 키는 사용하기 전에 생성해야 합니다'],
    why: ['Using a tss_t key that tss_create never set up is undefined behaviour.', 'tss_create로 만들지 않은 tss_t 키를 사용하면 정의되지 않은 동작입니다.'],
    fix: ['Call tss_create (and check its result) before the first tss_get, tss_set or tss_delete.', '첫 tss_get, tss_set, tss_delete 전에 tss_create를 호출하고 결과를 검사하세요.'],
    project(project, api) {
      const info = R.projectInfo(project);
      for (const u of project.units) {
        for (const fd of functions(u)) {
          const created = new Set();
          for (const c of callsInOrder(fd)) {
            const nm = calleeName(c);
            if (nm === 'tss_create' && c.args[0]) { created.add(R.objKey(c.args[0], u).key); continue; }
            if (!TSS_ACCESS.has(nm) || !c.args[0]) continue;
            const k = R.objKey(c.args[0], u);
            const keyAddr = R.objKey({ type: 'UnaryExpr', op: '&', arg: stripCasts(c.args[0]), loc: c.args[0].loc }, u);
            const ok = k.global ? info.tss.has(k.key) || info.tss.has(keyAddr.key) : created.has(k.key) || created.has(keyAddr.key) || !k.sym;
            if (!ok) api.report(c, msg(`'${nm}' uses the TSS key '${k.name}' before tss_create has created it.`, `tss_create로 만들기 전에 '${nm}'이(가) TSS 키 '${k.name}'을(를) 사용합니다.`));
          }
        }
      }
    },
  }),
];
