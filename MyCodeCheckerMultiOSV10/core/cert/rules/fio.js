'use strict';

// SEI CERT C — FIO: input / output.

const { rule } = require('../lib/meta');
const U = require('../lib/util');
const F = require('../lib/fmt');
const XE = require('../lib/expr');
const { M, T, cf } = U;

// Format-string argument index of the printf / scanf families.
const PRINTF = {
  printf: 0, fprintf: 1, sprintf: 1, snprintf: 2, dprintf: 1, asprintf: 1,
  vprintf: 0, vfprintf: 1, vsprintf: 1, vsnprintf: 2, vdprintf: 1, vasprintf: 1,
  wprintf: 0, fwprintf: 1, swprintf: 2, vwprintf: 0, vfwprintf: 1, vswprintf: 2,
  syslog: 1, vsyslog: 1, printf_s: 0, fprintf_s: 1, sprintf_s: 2, snprintf_s: 3,
  err: 1, errx: 1, warn: 0, warnx: 0, _snprintf: 2, _vsnprintf: 2,
};
const SCANF = { scanf: 0, fscanf: 1, sscanf: 1, vscanf: 0, vfscanf: 1, vsscanf: 1, wscanf: 0, fwscanf: 1, swscanf: 1 };
const VA = new Set(Object.keys(PRINTF).filter((n) => /^v|^_v/.test(n)).concat(['vscanf', 'vfscanf', 'vsscanf', 'vsyslog']));

// A format expression that is effectively constant: literal, conditional of literals,
// const char array / const pointer initialised with a literal, or a macro expanding to one.
function constantFormat(e, depth = 0) {
  e = U.strip(e);
  if (!e || depth > 4) return false;
  if (e.type === 'StringLiteral') return true;
  if (e.type === 'ConditionalExpr') return constantFormat(e.consequent || e.test, depth + 1) && constantFormat(e.alternate, depth + 1);
  if (e.type === 'CallExpr' && ['gettext', '_', 'dgettext', 'ngettext', 'tr'].includes(U.callName(e))) return true;
  if (e.type === 'IndexExpr') {
    // table of literal formats: fmts[i]
    const s = U.idSym(e.object);
    return !!(s && constTable(s));
  }
  const s = U.idSym(e);
  if (!s || (s.kind !== 'variable')) return false;
  const d = s.definition || (s.decls || [])[0];
  if (!d || !d.init) return false;
  const t = s.type && T.canonical(s.type);
  const constObj = t && (t.kind === 'array' ? T.canonical(t.of).const : t.const);
  if (!constObj) {
    // non-const pointer never reassigned
    if ((s.uses || []).some((u) => { const p = U.parent(u); return p && p.type === 'AssignExpr' && p.left === u; })) return false;
  }
  return constantFormat(d.init, depth + 1);
}

function constTable(s) {
  const d = s.definition || (s.decls || [])[0];
  const t = s.type && T.canonical(s.type);
  if (!d || !d.init || !t || t.kind !== 'array') return false;
  const init = d.init;
  return init.type === 'InitList' && init.items.length > 0 && init.items.every((i) => U.strLit(i) != null);
}

function formatIndex(call) {
  const n = U.callName(call);
  if (PRINTF[n] != null) return PRINTF[n];
  if (SCANF[n] != null) return SCANF[n];
  return null;
}

// Parameter forwarded by a variadic / va_list wrapper (void log(const char *fmt, ...) { vfprintf(f, fmt, ap); }).
function forwardedParam(e, call) {
  const s = U.idSym(e);
  if (!s || s.kind !== 'parameter') return false;
  const fn = U.enclosingFn(call);
  if (!fn) return false;
  if (fn.variadic) return true;
  // va_list parameter in the same function
  return (fn.params || []).some((p) => p.ctype && /va_list|__builtin_va_list/.test(U.tstr(p.ctype)) || (p.specs && p.specs.typeSpec && /va_list/.test(p.specs.typeSpec.name || '')));
}

const GETC = new Set(['getc', 'fgetc', 'getchar', 'getwc', 'fgetwc', 'getwchar']);
const OUT_FN = { fwrite: 3, fputs: 1, fputc: 1, putc: 1, fprintf: 0, vfprintf: 0, fputws: 1, fputwc: 1, fwprintf: 0 };
const IN_FN = { fread: 3, fgets: 2, fgetc: 0, getc: 0, fscanf: 0, vfscanf: 0, fgetws: 2, fgetwc: 0, fwscanf: 0, ungetc: 1 };
const SYNC_FN = { fflush: 0, fseek: 0, fsetpos: 0, rewind: 0, fseeko: 0 };

function streamKey(unit, call, table) {
  const i = table[U.callName(call)];
  return i == null ? null : U.key(unit, call.args[i]);
}

// Is the expression a printf argument of floating / integer / pointer kind?
function argKind(e) {
  const t = e && e.ctype && T.canonical(T.decay(T.nonRef(e.ctype)));
  if (!t) return null;
  if (T.isFloating(t)) return 'float';
  if (T.isInteger(t)) return 'int';
  if (t.kind === 'pointer' || t.kind === 'nullptr') return 'pointer';
  if (t.kind === 'record') return 'record';
  return null;
}

const ok = (k, conv) => {
  if (!k) return true;
  if ('diouxXc'.includes(conv)) return k === 'int';
  if ('eEfFgGaA'.includes(conv)) return k === 'float';
  if (conv === 's' || conv === 'p' || conv === 'n') return k === 'pointer';
  return true;
};

const KIND = { int: ['integer', '정수'], float: ['floating', '실수'], pointer: ['pointer', '포인터'], record: ['struct', '구조체'] };

module.exports = [
  rule('FIO30-C', {
    risk: 'HLM', cwe: ['CWE-134', 'CWE-20'], sec: true, checker: 'TAINTED_STRING',
    name: ['Exclude user input from format strings', '사용자 입력을 형식 문자열에 넣지 마세요'],
    why: ['A format string that is not a constant lets an attacker supply %s, %x or %n to read the stack or write memory.', '상수가 아닌 형식 문자열은 공격자가 %s, %x, %n 을 넣어 스택을 읽거나 메모리를 쓰게 합니다.'],
    fix: ['Always pass a literal format: printf("%s", msg) instead of printf(msg).', '항상 리터럴 형식을 넘기세요: printf(msg) 대신 printf("%s", msg).'],
  }, {
    check(unit, api) {
      for (const c of U.libCalls(unit, new Set([...Object.keys(PRINTF), ...Object.keys(SCANF)]))) {
        const i = formatIndex(c);
        const f = U.arg(c, i);
        if (!f || constantFormat(f)) continue;
        if (forwardedParam(f, c) && (VA.has(U.callName(c)) || U.enclosingFn(c).variadic)) continue;
        api.report(f, M(`${U.callName(c)}() uses the non-constant format '${U.src(unit, f)}'; pass a literal such as "%s".`, `${U.callName(c)}() 가 상수가 아닌 형식 '${U.src(unit, f)}' 를 씁니다. "%s" 같은 리터럴을 넘기세요.`));
      }
    },
  }),

  rule('FIO32-C', {
    risk: 'MUM', cwe: ['CWE-67', 'CWE-73'], sec: true, approx: true,
    name: ['Do not perform operations on devices that are only appropriate for files', '파일에만 적합한 작업을 장치에 하지 마세요'],
    why: ['A path from the user can name a device, FIFO or console (e.g. /dev/zero, CON); opening it can block or misbehave.', '사용자가 준 경로는 장치, FIFO, 콘솔(/dev/zero, CON 등)일 수 있어 열면 멈추거나 오동작할 수 있습니다.'],
    fix: ['Open with O_NONBLOCK, then fstat() the descriptor and require S_ISREG before using it as a file.', 'O_NONBLOCK 으로 연 뒤 fstat() 으로 S_ISREG 인지 확인하고 파일로 사용하세요.'],
  }, {
    check(unit, api) {
      const tainted = (e) => {
        e = U.strip(e);
        if (!e) return null;
        if (e.type === 'IndexExpr' && U.idSym(e.object) && /^argv$/.test(U.idSym(e.object).name)) return U.src(unit, e);
        if (e.type === 'CallExpr' && U.isLib(e, 'getenv')) return U.src(unit, e);
        const s = U.idSym(e);
        if (s && s.kind === 'variable') {
          const d = s.definition;
          if (d && d.init && tainted(d.init)) return `${s.name}`;
        }
        return null;
      };
      for (const c of U.libCalls(unit, new Set(['fopen', 'open', 'freopen', '_wfopen', 'creat', 'fopen_s']))) {
        const pi = U.callName(c) === 'fopen_s' ? 1 : 0;
        const what = tainted(c.args[pi]);
        if (!what) continue;
        const fn = U.enclosingFn(c);
        if (fn && U.libCallsIn(fn.body, new Set(['fstat', 'stat', 'lstat', '_fstat', 'S_ISREG'])).length) continue;
        api.report(c, M(`${U.callName(c)}() opens the externally supplied path '${what}' without checking that it is a regular file.`, `${U.callName(c)}() 가 외부에서 받은 경로 '${what}' 를 일반 파일인지 확인하지 않고 엽니다.`));
      }
    },
  }),

  rule('FIO34-C', {
    risk: 'HPM', cwe: ['CWE-197', 'CWE-20'], sec: true,
    name: ['Distinguish between characters read from a file and EOF or WEOF', '파일에서 읽은 문자와 EOF/WEOF 를 구분하세요'],
    why: ['Storing the int result of getc()/fgetc() in a char makes a valid 0xFF byte equal to EOF (or EOF never match), so loops stop early or never end.', 'getc()/fgetc() 의 int 결과를 char 에 저장하면 유효한 0xFF 바이트가 EOF 와 같아지거나 EOF 를 영영 못 만나 반복이 일찍 끝나거나 끝나지 않습니다.'],
    fix: ['Keep the result in an int (wint_t for wide input) and compare it to EOF before converting to char.', '결과를 int(넓은 문자는 wint_t)에 두고 EOF 와 비교한 뒤 char 로 바꾸세요.'],
  }, {
    check(unit, api) {
      const narrow = (t) => { const c = U.canon(t); return c && c.kind === 'int' && T.intRank(c) <= 2 && c.name !== 'wchar_t' && c.name !== 'bool'; };
      for (const c of U.libCalls(unit, GETC)) {
        let n = c, p = U.parent(c);
        while (p && p.type === 'ParenExpr') { n = p; p = U.parent(p); }
        let target = null;
        if (p && p.type === 'VarDecl' && p.init === n) target = p;
        else if (p && p.type === 'AssignExpr' && p.right === n) target = p.left;
        if (!target) continue;
        const tt = target.ctype;
        const wide = /w/.test(U.callName(c));
        const c2 = U.canon(tt);
        const bad = wide ? (c2 && c2.kind === 'int' && T.intRank(c2) < 3 && !/wint_t/.test(U.tstr(tt))) : narrow(tt);
        if (bad) api.report(c, M(`The result of ${U.callName(c)}() is stored in '${target.name || U.src(unit, target)}' of type ${U.tstr(tt)}; it can no longer be told apart from ${wide ? 'WEOF' : 'EOF'}.`, `${U.callName(c)}() 의 결과를 ${U.tstr(tt)} 형 '${target.name || U.src(unit, target)}' 에 저장해 ${wide ? 'WEOF' : 'EOF'} 와 구분할 수 없습니다.`));
      }
    },
  }),

  rule('FIO37-C', {
    risk: 'HPM', cwe: ['CWE-241', 'CWE-124'], sec: true,
    name: ['Do not assume that fgets() or fgetws() returns a nonempty string when successful', 'fgets()/fgetws() 가 성공하면 빈 문자열이 아니라고 가정하지 마세요'],
    why: ['Input can start with a null byte, so strlen(buf) may be 0 and buf[strlen(buf) - 1] writes before the buffer.', '입력이 널 바이트로 시작할 수 있어 strlen(buf) 가 0 이면 buf[strlen(buf) - 1] 이 버퍼 앞을 씁니다.'],
    fix: ['Strip the newline with p = strchr(buf, \'\\n\'); if (p) *p = \'\\0\'; or check the length first.', 'p = strchr(buf, \'\\n\'); if (p) *p = \'\\0\'; 로 줄바꿈을 지우거나 길이를 먼저 확인하세요.'],
  }, {
    check(unit, api) {
      for (const ix of U.nodes(unit, 'IndexExpr')) {
        const i = U.strip(ix.index);
        if (!i || i.type !== 'BinaryExpr' || i.op !== '-' || U.constInt(unit, i.right) !== 1n) continue;
        const l = U.strip(i.left);
        if (!l || l.type !== 'CallExpr' || !U.isLib(l, new Set(['strlen', 'wcslen']))) continue;
        const k = U.key(unit, l.args[0]);
        if (!k || k !== U.key(unit, ix.object)) continue;
        // guarded by a length test?
        const guarded = cf.ancestors(ix).some((a) => (a.type === 'IfStmt' || a.type === 'ConditionalExpr' || a.type === 'BinaryExpr' && a.op === '&&') && (() => {
          const cond = a.type === 'IfStmt' ? a.cond : a.type === 'ConditionalExpr' ? a.test : a.left;
          return cond && cond !== ix && !cf.ancestors(ix).includes(cond) && cf.findFirst(cond, (n) => n.type === 'CallExpr' && U.isLib(n, new Set(['strlen', 'wcslen'])) || (n.type === 'IndexExpr' && U.key(unit, n.object) === k) || (n.type === 'UnaryExpr' && n.op === '*' && U.key(unit, n.arg) === k));
        })());
        if (!guarded) api.report(ix, M(`'${U.src(unit, ix)}' indexes -1 when '${U.src(unit, ix.object)}' is empty (fgets() can return an empty string).`, `'${U.src(unit, ix.object)}' 가 비어 있으면 '${U.src(unit, ix)}' 가 -1 위치를 가리킵니다(fgets() 는 빈 문자열을 돌려줄 수 있음).`));
      }
    },
  }),

  rule('FIO38-C', {
    risk: 'LPM', cwe: ['CWE-758'],
    name: ['Do not copy a FILE object', 'FILE 객체를 복사하지 마세요'],
    why: ['The address of a FILE object may be significant; a copy is not a usable stream.', 'FILE 객체의 주소가 의미를 가질 수 있어 복사본은 쓸 수 있는 스트림이 아닙니다.'],
    fix: ['Copy the FILE * pointer, not the object it points to.', '가리키는 객체가 아니라 FILE * 포인터를 복사하세요.'],
  }, {
    check(unit, api) {
      const isFile = (t) => !!t && /^(const )?FILE$/.test(U.tstr(t).trim()) || (t && T.canonical(t) && T.canonical(t).kind === 'record' && /(^|\s)(_IO_FILE|__sFILE|_iobuf|__FILE)$/.test(T.canonical(t).name || ''));
      for (const d of U.nodes(unit, 'VarDecl')) {
        if (d.init && isFile(d.ctype)) api.report(d, M(`'${d.name}' is a copy of a FILE object; keep a FILE * instead.`, `'${d.name}' 는 FILE 객체의 복사본입니다. FILE * 를 사용하세요.`));
      }
      for (const a of U.nodes(unit, 'AssignExpr')) {
        if (a.op === '=' && isFile(a.left.ctype)) api.report(a, M(`Assignment copies a FILE object into '${U.src(unit, a.left)}'.`, `대입이 FILE 객체를 '${U.src(unit, a.left)}' 로 복사합니다.`));
      }
    },
  }),

  rule('FIO39-C', {
    risk: 'LLM', cwe: ['CWE-664'], approx: true,
    name: ['Do not alternately input and output from a stream without an intervening flush or positioning call', '플러시나 위치 지정 없이 한 스트림에서 입력과 출력을 번갈아 하지 마세요'],
    why: ['On an update stream, output followed by input (or input followed by output) without fflush/fseek is undefined behavior.', '갱신 모드 스트림에서 fflush/fseek 없이 출력 뒤 입력(또는 그 반대)을 하면 정의되지 않은 동작입니다.'],
    fix: ['Call fflush() after output and fseek()/fsetpos()/rewind() before switching direction.', '출력 뒤에는 fflush() 를, 방향을 바꾸기 전에는 fseek()/fsetpos()/rewind() 를 호출하세요.'],
  }, {
    check(unit, api) {
      const ALL = new Set([...Object.keys(OUT_FN), ...Object.keys(IN_FN), ...Object.keys(SYNC_FN)]);
      for (const fn of U.functions(unit)) {
        const last = new Map();
        for (const c of U.libCallsIn(fn.body, ALL)) {
          const n = U.callName(c);
          const dir = OUT_FN[n] != null ? 'out' : IN_FN[n] != null ? 'in' : 'sync';
          const k = streamKey(unit, c, dir === 'out' ? OUT_FN : dir === 'in' ? IN_FN : SYNC_FN);
          if (!k) continue;
          const prev = last.get(k);
          if (prev && prev.dir !== 'sync' && dir !== 'sync' && prev.dir !== dir) {
            api.report(c, M(`${n}() ${dir === 'in' ? 'reads from' : 'writes to'} '${k.replace(/^#\d+/, U.src(unit, c.args[(dir === 'out' ? OUT_FN : IN_FN)[n]]))}' right after ${U.callName(prev.call)}() on line ${prev.call.loc.line} without fflush/fseek in between.`, `${n}() 가 ${prev.call.loc.line}행의 ${U.callName(prev.call)}() 직후 fflush/fseek 없이 같은 스트림에서 ${dir === 'in' ? '읽습니다' : '씁니다'}.`));
          }
          last.set(k, { dir, call: c });
        }
      }
    },
  }),

  rule('FIO40-C', {
    risk: 'LPM', cwe: ['CWE-908'], approx: true,
    name: ['Reset strings on fgets() or fgetws() failure', 'fgets()/fgetws() 실패 시 문자열을 초기화하세요'],
    why: ['When fgets() fails the buffer contents are indeterminate; code that continues to use it reads garbage.', 'fgets() 가 실패하면 버퍼 내용이 불확정이라 계속 쓰면 쓰레기 값을 읽습니다.'],
    fix: ['In the failure branch set buf[0] = \'\\0\' (or return / stop using the buffer).', '실패 분기에서 buf[0] = \'\\0\' 으로 초기화하거나 반환해 버퍼 사용을 멈추세요.'],
  }, {
    check(unit, api) {
      for (const c of U.libCalls(unit, new Set(['fgets', 'fgetws']))) {
        const ifs = cf.enclosing(c, 'IfStmt');
        if (!ifs || !cf.ancestors(c).includes(ifs.cond) && ifs.cond !== c) continue;
        const cond = U.strip(ifs.cond);
        let failBranch = null;
        let matched = true;
        if (cond.type === 'BinaryExpr' && cond.op === '==' && (U.isNullConst(cond.right) || U.isNullConst(cond.left))) failBranch = ifs.then;
        else if (cond.type === 'UnaryExpr' && cond.op === '!') failBranch = ifs.then;
        else if (cond.type === 'BinaryExpr' && cond.op === '!=' && (U.isNullConst(cond.right) || U.isNullConst(cond.left))) failBranch = ifs.else;
        else if (U.strip(cond) === c) failBranch = ifs.else;
        else matched = false;
        if (!matched) continue;
        const k = U.key(unit, c.args[0]);
        if (!k) continue;
        if (failBranch && cf.findFirst(failBranch, (n) => ['ReturnStmt', 'GotoStmt', 'BreakStmt', 'ContinueStmt', 'ThrowExpr'].includes(n.type) || n.type === 'CallExpr' && U.isLib(n, new Set(['exit', 'abort', '_Exit', 'memset', 'strcpy', 'wcscpy'])) || n.type === 'AssignExpr' && (() => { const l = U.strip(n.left); return l && (l.type === 'IndexExpr' && U.key(unit, l.object) === k || l.type === 'UnaryExpr' && l.op === '*' && U.key(unit, l.arg) === k); })())) continue;
        // only when the buffer is used after the if
        const after = U.following(U.stmtOf(ifs) || ifs);
        if (!after.some((s) => cf.findFirst(s, (n) => (n.type === 'Identifier' || n.type === 'MemberExpr') && U.key(unit, n) === k))) continue;
        api.report(c, M(`If ${U.callName(c)}() fails, '${U.src(unit, c.args[0])}' is used afterwards without being reset.`, `${U.callName(c)}() 가 실패해도 '${U.src(unit, c.args[0])}' 를 초기화하지 않고 이후에 사용합니다.`));
      }
    },
  }),

  rule('FIO41-C', {
    risk: 'LUL', cwe: ['CWE-386'],
    name: ['Do not call getc(), putc(), getwc() or putwc() with a stream argument that has side effects', '부수 효과가 있는 스트림 인수로 getc()/putc()/getwc()/putwc() 를 호출하지 마세요'],
    why: ['These may be macros that evaluate the stream argument more than once, repeating its side effects.', '이 함수들은 스트림 인수를 여러 번 평가하는 매크로일 수 있어 부수 효과가 반복됩니다.'],
    fix: ['Evaluate the stream into a variable first, or use fgetc()/fputc().', '스트림을 먼저 변수에 담거나 fgetc()/fputc() 를 쓰세요.'],
  }, {
    check(unit, api) {
      const IDX = { getc: 0, getwc: 0, putc: 1, putwc: 1 };
      for (const c of U.libCalls(unit, new Set(Object.keys(IDX)))) {
        const s = c.args[IDX[U.callName(c)]];
        if (s && cf.findFirst(s, (n) => n.type === 'CallExpr' || n.type === 'AssignExpr' || n.type === 'UnaryExpr' && (n.op === '++' || n.op === '--'))) {
          api.report(c, M(`${U.callName(c)}() stream argument '${U.src(unit, s)}' has side effects and may be evaluated more than once.`, `${U.callName(c)}() 의 스트림 인수 '${U.src(unit, s)}' 에 부수 효과가 있어 여러 번 평가될 수 있습니다.`));
        }
      }
    },
  }),

  rule('FIO42-C', {
    langs: ['c'], risk: 'MUM', cwe: ['CWE-404', 'CWE-775'], approx: true, deep: 'absint:LEAK', checker: 'RESOURCE_LEAK',
    name: ['Close files when they are no longer needed', '더 이상 필요 없는 파일은 닫으세요'],
    why: ['Every open stream or descriptor holds an OS handle; leaking them eventually makes fopen()/open() fail and may leave data unflushed.', '열린 스트림과 디스크립터는 OS 핸들을 차지해 누수되면 결국 fopen()/open() 이 실패하고 데이터가 기록되지 않을 수 있습니다.'],
    fix: ['fclose()/close() the handle on every path, or return it to the caller.', '모든 경로에서 fclose()/close() 하거나 호출자에게 반환하세요.'],
  }, {
    check(unit, api) {
      const OPEN = new Set(['fopen', 'fdopen', 'freopen', 'tmpfile', 'popen', 'open', 'creat', 'opendir', '_wfopen']);
      const CLOSE = new Set(['fclose', 'close', 'pclose', 'closedir', '_close']);
      for (const fn of U.functions(unit)) {
        for (const c of U.libCallsIn(fn.body, OPEN)) {
          const r = U.resultUse(c);
          if (r.kind !== 'var' || !r.sym || r.sym.kind !== 'variable' || r.sym.storage !== 'automatic') continue;
          let escapes = false;
          for (const u of r.sym.uses || []) {
            const p = U.parent(u);
            if (!p) continue;
            if (p.type === 'CallExpr' && p.callee !== u) {
              if (CLOSE.has(U.callName(p)) || !U.isStdCall(p)) { escapes = true; break; }
              continue;
            }
            if (p.type === 'ReturnStmt' || p.type === 'AssignExpr' && p.right === u || p.type === 'VarDecl' && p.init === u || p.type === 'UnaryExpr' && p.op === '&' || p.type === 'InitList') { escapes = true; break; }
            if (cf.enclosing(u, 'ReturnStmt')) { escapes = true; break; }
          }
          if (!escapes) api.report(c, M(`'${r.sym.name}' opened by ${U.callName(c)}() is never closed in ${U.fnName(fn)}().`, `${U.callName(c)}() 로 연 '${r.sym.name}' 를 ${U.fnName(fn)}() 에서 닫지 않습니다.`));
        }
      }
    },
  }),

  rule('FIO44-C', {
    risk: 'MUM', cwe: ['CWE-628'],
    name: ['Only use values for fsetpos() that are returned from fgetpos()', 'fsetpos() 에는 fgetpos() 가 반환한 값만 사용하세요'],
    why: ['fpos_t is opaque; a value built by hand (memset, assignment of a number) is not a valid position.', 'fpos_t 는 불투명 형이라 직접 만든 값(memset, 숫자 대입)은 유효한 위치가 아닙니다.'],
    fix: ['Pass fsetpos() an fpos_t filled by fgetpos() on the same stream.', '같은 스트림에서 fgetpos() 로 채운 fpos_t 를 fsetpos() 에 넘기세요.'],
  }, {
    check(unit, api) {
      for (const c of U.libCalls(unit, 'fsetpos')) {
        const a = U.strip(c.args[1]);
        const s = a && a.type === 'UnaryExpr' && a.op === '&' ? U.idSym(a.arg) : null;
        if (!s || s.kind !== 'variable') continue;
        const filled = (s.uses || []).some((u) => {
          const p = U.parent(u);
          const pp = p && U.parent(p);
          return p && p.type === 'UnaryExpr' && p.op === '&' && pp && pp.type === 'CallExpr' && U.callName(pp) === 'fgetpos';
        });
        if (!filled) {
          api.report(c, M(`fsetpos() uses '${s.name}', which is not filled by fgetpos().`, `fsetpos() 가 fgetpos() 로 채우지 않은 '${s.name}' 를 사용합니다.`));
        }
      }
    },
  }),

  rule('FIO45-C', {
    risk: 'HPH', cwe: ['CWE-367'], sec: true, approx: true, checker: 'TOCTOU',
    name: ['Avoid TOCTOU race conditions while accessing files', '파일 접근 시 TOCTOU 경쟁 상태를 피하세요'],
    why: ['Checking a path with access()/stat() and then opening it by name lets an attacker swap the file (e.g. with a symlink) in between.', 'access()/stat() 로 경로를 확인한 뒤 이름으로 열면 그 사이에 공격자가 파일을(예: 심볼릭 링크로) 바꿀 수 있습니다.'],
    fix: ['Open first and check the descriptor (fstat), or use O_CREAT | O_EXCL / "x" mode instead of a separate existence test.', '먼저 열고 디스크립터를 fstat 으로 확인하거나 별도 존재 검사 대신 O_CREAT | O_EXCL / "x" 모드를 쓰세요.'],
  }, {
    check(unit, api) {
      const CHECK = new Set(['access', 'stat', 'lstat', '_access', 'faccessat', 'euidaccess', 'eaccess']);
      const USE = new Set(['fopen', 'open', 'creat', 'freopen', 'remove', 'unlink', 'rename', 'chmod', 'chown', 'truncate', '_wfopen', 'mkfifo', 'link', 'symlink']);
      for (const fn of U.functions(unit)) {
        const checks = U.libCallsIn(fn.body, CHECK);
        if (!checks.length) continue;
        const uses = U.libCallsIn(fn.body, USE);
        for (const chk of checks) {
          const pk = U.key(unit, chk.args[0]) || (U.strLit(chk.args[0]) != null ? JSON.stringify(U.strLit(chk.args[0])) : null);
          if (!pk) continue;
          for (const use of uses) {
            if (use.loc.start <= chk.loc.start) continue;
            const uk = U.key(unit, use.args[0]) || (U.strLit(use.args[0]) != null ? JSON.stringify(U.strLit(use.args[0])) : null);
            if (uk === pk) {
              api.report(use, M(`${U.callName(use)}() on '${U.src(unit, use.args[0])}' after ${U.callName(chk)}() on line ${chk.loc.line}: the file can change between the check and the use.`, `${chk.loc.line}행의 ${U.callName(chk)}() 뒤에 '${U.src(unit, use.args[0])}' 에 ${U.callName(use)}() 를 호출해 확인과 사용 사이에 파일이 바뀔 수 있습니다.`));
              break;
            }
          }
        }
      }
    },
  }),

  rule('FIO46-C', {
    risk: 'MUM', cwe: ['CWE-672', 'CWE-910'], approx: true, deep: 'absint:USE_AFTER_FREE',
    name: ['Do not access a closed file', '닫힌 파일에 접근하지 마세요'],
    why: ['After fclose() the FILE pointer is indeterminate; any use, including a second fclose(), is undefined behavior.', 'fclose() 뒤의 FILE 포인터는 불확정이라 두 번째 fclose() 를 포함한 모든 사용이 정의되지 않은 동작입니다.'],
    fix: ['Set the pointer to NULL after closing and do not use it afterwards.', '닫은 뒤 포인터를 NULL 로 만들고 이후에는 쓰지 마세요.'],
  }, {
    check(unit, api) {
      for (const c of U.libCalls(unit, new Set(['fclose', 'close', 'pclose', 'closedir']))) {
        const sym = U.idSym(c.args[0]);
        if (!sym) continue;
        const stmt = U.stmtOf(c);
        if (!stmt) continue;
        for (const s of U.following(stmt)) {
          let found = null;
          cf.walk(s, (n) => {
            if (n.type === 'AssignExpr' && U.idSym(n.left) === sym) { found = 'assign'; return cf.walk.STOP; }
            if (n.type === 'Identifier' && n.symbol === sym) { found = n; return cf.walk.STOP; }
            return undefined;
          });
          if (found === 'assign') break;
          if (found) {
            api.report(found, M(`'${sym.name}' is used after ${U.callName(c)}() on line ${c.loc.line}.`, `'${sym.name}' 를 ${c.loc.line}행의 ${U.callName(c)}() 뒤에 사용합니다.`));
            break;
          }
          if (cf.findFirst(s, ['ReturnStmt', 'GotoStmt', 'BreakStmt', 'ContinueStmt'])) break;
        }
      }
    },
  }),

  rule('FIO47-C', {
    risk: 'HUM', cwe: ['CWE-686', 'CWE-685', 'CWE-628'], approx: true, checker: 'PRINTF_ARGS',
    name: ['Use valid format strings', '올바른 형식 문자열을 사용하세요'],
    why: ['A conversion with no matching argument, or an argument of the wrong type, makes printf read arbitrary stack data (undefined behavior).', '대응하는 인수가 없거나 형이 틀린 변환은 printf 가 임의의 스택 데이터를 읽게 합니다(정의되지 않은 동작).'],
    fix: ['Make every conversion specifier match the number and type of the arguments.', '모든 변환 지정자가 인수의 개수와 형에 맞도록 하세요.'],
  }, {
    check(unit, api) {
      for (const c of U.libCalls(unit, new Set(Object.keys(PRINTF).filter((n) => !VA.has(n))))) {
        const fi = PRINTF[U.callName(c)];
        const fmt = U.strLit(c.args[fi]);
        if (fmt == null) continue;
        const convs = F.parse(fmt);
        const args = c.args.slice(fi + 1);
        let ai = 0;
        let reported = false;
        for (const cv of convs) {
          if (!/[diouxXcseEfFgGaApn]/.test(cv.conv) || cv.conv.length !== 1) {
            api.report(c, M(`${U.callName(c)}() format has the invalid conversion '${cv.text}'.`, `${U.callName(c)}() 형식에 잘못된 변환 '${cv.text}' 가 있습니다.`));
            reported = true;
            break;
          }
          if (cv.width === '*') ai++;
          if (cv.precision === '*') ai++;
          const a = args[ai++];
          if (!a) {
            api.report(c, M(`${U.callName(c)}() format "${fmt.replace(/\n/g, '\\n')}" needs more arguments than the ${args.length} given.`, `${U.callName(c)}() 형식 "${fmt.replace(/\n/g, '\\n')}" 은 주어진 ${args.length} 개보다 많은 인수가 필요합니다.`));
            reported = true;
            break;
          }
          const k = argKind(U.strip(a) || a);
          // the type of a call to an undeclared function (header not found) is a guess
          if (!ok(k, cv.conv) && !XE.fromImplicit(a)) {
            api.report(a, M(`'${cv.text}' expects a different type but '${U.src(unit, a)}' is ${KIND[k][0]}.`, `'${cv.text}' 는 다른 형을 기대하지만 '${U.src(unit, a)}' 는 ${KIND[k][1]} 형입니다.`));
            reported = true;
          }
        }
        if (!reported && ai < args.length && !convs.some((x) => x.conv === 'n')) {
          api.report(c, M(`${U.callName(c)}() gets ${args.length} arguments but its format uses only ${ai}.`, `${U.callName(c)}() 는 인수 ${args.length} 개를 받지만 형식은 ${ai} 개만 씁니다.`));
        }
      }
    },
  }),

  rule('FIO21-C', {
    risk: 'MPM', cwe: ['CWE-377', 'CWE-379'], approx: true,
    name: ['Do not create temporary files in shared directories', '공유 디렉터리에 임시 파일을 만들지 마세요'],
    why: ['tmpnam(), tempnam(), mktemp() and fixed /tmp paths are predictable; another user can pre-create or link the file between naming and opening it.', 'tmpnam(), tempnam(), mktemp() 와 고정된 /tmp 경로는 예측 가능해 이름을 정한 뒤 열기 전 다른 사용자가 파일을 먼저 만들거나 링크할 수 있습니다.'],
    fix: ['Create temporary files with mkstemp() (mode 0600) in a private directory, or use tmpfile_s() / O_TMPFILE.', '개인 디렉터리에서 mkstemp()(모드 0600)로 만들거나 tmpfile_s() / O_TMPFILE 을 쓰세요.'],
  }, {
    check(unit, api) {
      for (const c of U.libCalls(unit, new Set(['tmpnam', 'tmpnam_r', 'tempnam', 'mktemp', '_mktemp', '_tempnam', '_wtmpnam', 'tmpfile']))) {
        api.report(c, M(`${U.callName(c)}() creates a predictable temporary file name in a shared directory.`, `${U.callName(c)}() 는 공유 디렉터리에 예측 가능한 임시 파일 이름을 만듭니다.`));
      }
      for (const c of U.libCalls(unit, new Set(['fopen', 'open', 'creat', 'freopen']))) {
        const p = U.strLit(c.args[0]);
        if (p != null && /^\/(var\/)?tmp\//.test(p)) api.report(c, M(`${U.callName(c)}("${p}") opens a fixed name in a shared temporary directory.`, `${U.callName(c)}("${p}") 가 공유 임시 디렉터리의 고정 이름을 엽니다.`));
      }
    },
  }),
];
