'use strict';

// SEI CERT C++ — FIO: input/output.

const { rule } = require('../lib/meta');
const U = require('../lib/util');
const X = require('../lib/cpp');
const { M, T, cf } = U;

const FSTREAMS = new Set(['fstream', 'wfstream', 'basic_fstream', 'stringstream', 'wstringstream', 'basic_stringstream', 'iostream', 'basic_iostream', 'basic_filebuf', 'filebuf']);
const ANY_FSTREAM = new Set(['fstream', 'wfstream', 'basic_fstream', 'ofstream', 'wofstream', 'basic_ofstream', 'ifstream', 'wifstream', 'basic_ifstream']);
const OUT_CALLS = new Set(['write', 'put', 'sputn', 'sputc']);
const IN_CALLS = new Set(['read', 'get', 'getline', 'readsome', 'ignore', 'peek', 'sgetn', 'sgetc', 'unget', 'putback']);
const POS_CALLS = new Set(['seekg', 'seekp', 'flush', 'sync']);

// leftmost operand of a << / >> chain
function chainBase(e, op) {
  e = U.skip(e);
  while (e && e.type === 'BinaryExpr' && e.op === op) e = U.skip(e.left);
  return e;
}

const EXITS = new Set(['exit', '_Exit', 'quick_exit', 'abort', 'terminate', '_exit']);

module.exports = [
  rule('FIO50-CPP', {
    risk: 'LLL', cwe: ['CWE-664'], approx: true,
    name: ['Do not alternately input and output from a file stream without an intervening positioning call', '파일 스트림에서 위치 지정 호출 없이 입력과 출력을 번갈아 하지 마세요'],
    why: ['On a stream opened for both reading and writing, switching from output to input requires a flush or seek, and from input to output a seek; otherwise the buffered data and the file position disagree.', '읽기와 쓰기 모두 열린 스트림에서 출력에서 입력으로 바꿀 때는 flush 나 seek 가, 입력에서 출력으로 바꿀 때는 seek 가 필요합니다. 그렇지 않으면 버퍼 데이터와 파일 위치가 어긋납니다.'],
    fix: ['Call seekg()/seekp() (or flush() after output) between reading and writing.', '읽기와 쓰기 사이에 seekg()/seekp() (출력 뒤에는 flush() 도 가능)를 호출하세요.'],
  }, {
    check(unit, api) {
      for (const fn of U.functions(unit)) {
        const streams = new Map(); // sym -> events
        const ev = (sym, kind, node, name) => {
          if (!sym || !FSTREAMS.has(X.symStd(sym))) return;
          let l = streams.get(sym);
          if (!l) streams.set(sym, (l = []));
          l.push({ kind, node, name, at: node.loc.start });
        };
        cf.walk(fn.body, (n) => {
          if (n.type === 'LambdaExpr') return cf.walk.SKIP;
          if (n.type === 'BinaryExpr' && (n.op === '<<' || n.op === '>>')) {
            const p = U.parent(n);
            if (p && p.type === 'BinaryExpr' && p.op === n.op && U.pkey(n) === 'left') return undefined; // count the chain once
            const base = chainBase(n, n.op);
            const s = U.idSym(base);
            if (s) ev(s, n.op === '<<' ? 'out' : 'in', n, n.op === '<<' ? 'operator<<' : 'operator>>');
            // `f << std::flush` / std::endl flushes
            if (s && n.op === '<<' && /\bstd::(flush|endl)\b/.test(U.src(unit, n))) ev(s, 'flush', n, 'flush');
          } else if (n.type === 'CallExpr') {
            const o = X.memberObj(n);
            const s = o && U.idSym(o);
            const name = U.callName(n);
            if (s) {
              if (OUT_CALLS.has(name)) ev(s, 'out', n, name);
              else if (IN_CALLS.has(name)) ev(s, 'in', n, name);
              else if (POS_CALLS.has(name)) ev(s, name === 'flush' || name === 'sync' ? 'flush' : 'seek', n, name);
              else if (name === 'open' || name === 'close') ev(s, 'seek', n, name);
            } else if (X.stdCall(n, ['getline']) && n.args.length >= 1) ev(U.idSym(n.args[0]), 'in', n, 'std::getline');
          }
          return undefined;
        });
        for (const [sym, list] of streams) {
          list.sort((a, b) => a.at - b.at);
          let last = null;
          for (const e of list) {
            if (e.kind === 'seek') { last = null; continue; }
            if (e.kind === 'flush') { if (last && last.kind === 'out') last = { kind: 'flushed' }; continue; }
            if (last && last.kind === 'out' && e.kind === 'in') {
              api.report(e.node, M(`'${sym.name}' is read with ${e.name} right after being written (line ${last.node.loc.line}) without an intervening flush or seek.`, `'${sym.name}' 를 ${last.node.loc.line} 행에서 쓴 직후 flush 나 seek 없이 ${e.name} 로 읽습니다.`));
            } else if (last && (last.kind === 'in') && e.kind === 'out') {
              api.report(e.node, M(`'${sym.name}' is written with ${e.name} right after being read (line ${last.node.loc.line}) without an intervening seek.`, `'${sym.name}' 를 ${last.node.loc.line} 행에서 읽은 직후 seek 없이 ${e.name} 로 씁니다.`));
            } else if (last && last.kind === 'flushed' && e.kind === 'in') {
              /* flush between output and input is enough */
            }
            last = e;
          }
        }
      }
    },
  }),

  rule('FIO51-CPP', {
    risk: 'MPM', cwe: ['CWE-404', 'CWE-775'], approx: true,
    name: ['Close files when they are no longer needed', '더 이상 필요 없는 파일은 닫으세요'],
    why: ['A FILE * that is not fclosed on every path leaks the descriptor and may lose buffered data; std::exit() or std::terminate() skip the destructors of open file streams, so their buffers are never flushed.', '모든 경로에서 fclose 하지 않은 FILE * 는 디스크립터를 누수하고 버퍼 데이터를 잃을 수 있으며, std::exit() 나 std::terminate() 는 열린 파일 스트림의 소멸자를 건너뛰어 버퍼가 비워지지 않습니다.'],
    fix: ['Close the file on every path (or wrap it in an RAII object such as std::fstream / std::unique_ptr with fclose), and close streams explicitly before calling std::exit().', '모든 경로에서 파일을 닫거나(std::fstream, fclose 를 쓰는 std::unique_ptr 같은 RAII 객체로 감싸기) std::exit() 호출 전에 스트림을 명시적으로 닫으세요.'],
  }, {
    check(unit, api) {
      for (const c of U.libCalls(unit, new Set(['fopen', 'fdopen', 'tmpfile', 'popen', 'freopen']))) {
        const fn = U.enclosingFn(c);
        if (!fn || !fn.body) continue;
        const r = U.resultUse(c);
        if (r.kind !== 'var' || !r.sym || !X.isLocalOf(r.sym, fn)) continue;
        const sym = r.sym;
        const closeName = U.callName(c) === 'popen' ? 'pclose' : 'fclose';
        const uses = (sym.uses || []).filter((u) => u.loc.start > c.loc.end);
        const closes = uses.filter((u) => { const p = U.parent(u); return p && p.type === 'CallExpr' && U.isLib(p, new Set(['fclose', 'pclose'])); });
        // escapes: returned, stored elsewhere, handed to a user function that may close it
        const escapes = uses.some((u) => {
          const p = U.parent(u);
          if (!p) return false;
          if (p.type === 'ReturnStmt') return true;
          if (p.type === 'AssignExpr' && U.pkey(u) === 'right') return true;
          if (p.type === 'VarDecl' && p.init === u) return true;
          if (p.type === 'InitList' || p.type === 'ParenListInit') return true;
          if (p.type === 'CallExpr' && p.callee !== u && !U.isLib(p, new Set(['fclose', 'pclose', 'fprintf', 'fputs', 'fputc', 'fwrite', 'fread', 'fgets', 'fgetc', 'fscanf', 'fseek', 'ftell', 'rewind', 'fflush', 'feof', 'ferror', 'clearerr', 'getc', 'putc', 'setvbuf', 'setbuf', 'fileno', 'ungetc', 'vfprintf', 'fgetpos', 'fsetpos']))) return true;
          return false;
        });
        if (escapes) continue;
        if (!closes.length) {
          api.report(c, M(`File '${sym.name}' opened with ${U.callName(c)}() is never closed with ${closeName}() in '${U.fnName(fn)}'.`, `${U.callName(c)}() 로 연 파일 '${sym.name}' 가 '${U.fnName(fn)}' 에서 ${closeName}() 로 닫히지 않습니다.`));
          continue;
        }
        // early returns between the open and the last close that do not close the file
        const lastClose = closes[closes.length - 1];
        for (const ret of cf.findAll(fn.body, 'ReturnStmt')) {
          if (U.enclosingFn(ret) !== fn) continue;
          if (ret.loc.start < c.loc.end || ret.loc.start > lastClose.loc.start) continue;
          // the null-check path (if (!f) return;) does not own an open file
          const ifs = cf.ancestors(ret).filter((a) => a.type === 'IfStmt');
          const anc = [ret, ...cf.ancestors(ret)];
          if (ifs.some((i) => i.cond && U.refersTo(i.cond, sym) && anc.includes(i.then) && !/!=|>/.test(U.src(unit, i.cond)) && (/^\s*!/.test(U.src(unit, i.cond)) || /==/.test(U.src(unit, i.cond))))) continue;
          if (ifs.some((i) => i.cond && U.refersTo(i.cond, sym) && i.else && anc.includes(i.else) && !/==|^\s*!/.test(U.src(unit, i.cond)))) continue;
          const blk = U.parent(ret);
          const before = blk && blk.type === 'CompoundStmt' ? blk.body.slice(0, blk.body.indexOf(ret)) : [];
          if (before.some((s) => cf.findFirst(s, (n) => n.type === 'CallExpr' && U.isLib(n, new Set(['fclose', 'pclose'])) && U.refersTo(n, sym)))) continue;
          if (ret.arg && U.refersTo(ret.arg, sym)) continue;
          api.report(ret, M(`'${U.fnName(fn)}' returns here without closing '${sym.name}' (opened at line ${c.loc.line}).`, `'${U.fnName(fn)}' 가 여기서 '${sym.name}' (${c.loc.line} 행에서 엶)를 닫지 않고 반환합니다.`));
        }
      }
      // std::fstream open while std::exit()/terminate() ends the program
      for (const v of U.nodes(unit, 'VarDecl')) {
        const b = X.stdBare(U.declTypeName(v));
        if (!ANY_FSTREAM.has(b) || !v.symbol || v.symbol.storage !== 'automatic') continue;
        const fn = U.enclosingFn(v);
        if (!fn || !fn.body) continue;
        const sym = v.symbol;
        const opened = (v.init && X.initArgs(v.init).length) || (sym.uses || []).some((u) => { const p = U.parent(u); return p && p.type === 'MemberExpr' && p.member === 'open'; });
        if (!opened) continue;
        const ex = cf.findAll(fn.body, 'CallExpr').find((c) => c.loc.start > v.loc.end && U.enclosingFn(c) === fn && (U.isLib(c, EXITS) || X.stdCall(c, ['terminate', 'exit', 'quick_exit', 'abort', '_Exit'])));
        if (!ex) continue;
        const closed = (sym.uses || []).some((u) => { const p = U.parent(u); return p && p.type === 'MemberExpr' && p.member === 'close' && u.loc.start < ex.loc.start; });
        if (closed) continue;
        api.report(ex, M(`${U.callName(ex)}() ends the program while std::${b} '${v.name}' is open; its destructor does not run, so buffered data is lost.`, `std::${b} '${v.name}' 가 열린 상태에서 ${U.callName(ex)}() 가 프로그램을 끝내어 소멸자가 실행되지 않고 버퍼 데이터를 잃습니다.`));
      }
    },
  }),
];
