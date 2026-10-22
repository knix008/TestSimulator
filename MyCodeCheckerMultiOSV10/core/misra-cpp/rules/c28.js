'use strict';

// MISRA C++:2023 chapters 28 (algorithms, std::move/forward) and 30 (input/output).

const { R, M } = require('../lib/meta');
const U = require('../lib/util');
const { cf } = U;

const S = (...a) => new Set(a);

const PRED_ALGOS = S('all_of', 'any_of', 'none_of', 'find_if', 'find_if_not', 'count_if', 'adjacent_find', 'search', 'search_n', 'mismatch', 'equal', 'remove_if', 'remove_copy_if',
  'replace_if', 'replace_copy_if', 'copy_if', 'partition', 'stable_partition', 'partition_copy', 'is_partitioned', 'partition_point', 'sort', 'stable_sort', 'partial_sort',
  'partial_sort_copy', 'nth_element', 'lower_bound', 'upper_bound', 'equal_range', 'binary_search', 'min_element', 'max_element', 'minmax_element', 'unique', 'unique_copy',
  'is_sorted', 'is_sorted_until', 'merge', 'inplace_merge', 'includes', 'set_union', 'set_intersection', 'set_difference', 'set_symmetric_difference',
  'lexicographical_compare', 'is_heap', 'is_heap_until', 'make_heap', 'push_heap', 'pop_heap', 'sort_heap', 'min', 'max', 'minmax', 'clamp', 'is_permutation', 'find_first_of', 'find_end');

const CSTDIO = S('printf', 'fprintf', 'sprintf', 'snprintf', 'vprintf', 'vfprintf', 'vsprintf', 'vsnprintf', 'scanf', 'fscanf', 'sscanf', 'vscanf', 'vfscanf', 'vsscanf',
  'fopen', 'freopen', 'fclose', 'fflush', 'fread', 'fwrite', 'fgets', 'fputs', 'puts', 'gets', 'getchar', 'putchar', 'fgetc', 'fputc', 'getc', 'putc', 'ungetc',
  'fseek', 'ftell', 'rewind', 'fgetpos', 'fsetpos', 'clearerr', 'feof', 'ferror', 'perror', 'rename', 'tmpfile', 'tmpnam', 'setbuf', 'setvbuf', 'remove',
  'wprintf', 'fwprintf', 'swprintf', 'wscanf', 'fwscanf', 'swscanf', 'fgetwc', 'fputwc', 'getwc', 'putwc', 'fgetws', 'fputws', 'getwchar', 'putwchar', 'ungetwc', 'fwide');

const isStdCall = (call, name) => {
  const cn = U.callName(call);
  return !!(cn && !cn.member && cn.name === name && cn.qualifier === 'std');
};

function lambdaLocals(lam) {
  const out = new Set();
  for (const p of lam.params || []) if (p.symbol) out.add(p.symbol);
  cf.walk(lam.body, (n) => { if (n.type === 'VarDecl' && n.symbol && n.symbol.storage === 'automatic') out.add(n.symbol); return undefined; });
  return out;
}

function forwardingParams(t) {
  const out = new Set();
  const names = new Set((t.params || []).filter((p) => p.kind === 'type' && p.name).map((p) => p.name));
  if (!names.size || !t.decl || t.decl.type !== 'Declaration') return { fn: null, params: out };
  const fn = (t.decl.declarators || []).find((d) => d.type === 'FunctionDecl' && d.body);
  if (!fn) return { fn: null, params: out };
  for (const p of fn.params || []) {
    const ts = p.specs && p.specs.typeSpec;
    const quals = (p.specs && p.specs.qualifiers) || [];
    const d = p.declarator;
    if (ts && ts.type === 'NamedType' && names.has(ts.name) && !ts.qualifier && !quals.length && d && d.type === 'ReferenceDeclarator' && d.rvalue && d.inner && d.inner.type === 'IdentDeclarator' && p.symbol) out.add(p.symbol);
  }
  return { fn, params: out };
}

const inUnevaluated = (n) => cf.ancestors(n).some((a) => a.type === 'SizeofExpr' || a.type === 'DecltypeType' || a.type === 'AlignofExpr' || a.type === 'NoexceptExpr');

// Stream operations on C FILE* objects: [name, stream argument index ('last' = -1), kind]
const FILE_OPS = {
  fputs: [-1, 'w'], fputc: [-1, 'w'], putc: [-1, 'w'], fwrite: [-1, 'w'], fprintf: [0, 'w'], fputws: [-1, 'w'], fputwc: [-1, 'w'], fwprintf: [0, 'w'],
  fgets: [-1, 'r'], fgetc: [0, 'r'], getc: [0, 'r'], fread: [-1, 'r'], fscanf: [0, 'r'], ungetc: [-1, 'r'], fgetws: [-1, 'r'], fgetwc: [0, 'r'], fwscanf: [0, 'r'],
  fseek: [0, 'p'], fsetpos: [0, 'p'], rewind: [0, 'p'], fflush: [0, 'f'],
};
const MEMBER_OPS = { write: 'w', put: 'w', read: 'r', get: 'r', getline: 'r', ignore: 'r', peek: 'r', seekg: 'p', seekp: 'p', flush: 'f' };

function isFstreamSym(sym) {
  const d = sym && sym.decls && sym.decls[0];
  const ts = d && d.specs && d.specs.typeSpec;
  return !!(ts && ts.type === 'NamedType' && /^(std::)?(basic_|w)?fstream$/.test(ts.qname || ts.name || ''));
}

module.exports = [
  R({
    id: '28.3.1', cat: 'Required', dec: false, type: 'BUG', autosar: 'A25-1-1', cert: 'CTR58-CPP', sev: 'MAJOR', debt: 10,
    name: ['Predicates shall not have persistent side effects', '조건자는 지속되는 부작용을 가지면 안 됩니다'],
    why: ['Algorithms may copy predicates and call them any number of times in any order, so side effects give unpredictable results.', '알고리즘은 조건자를 복사하고 임의의 횟수와 순서로 호출할 수 있어 부작용이 예측할 수 없는 결과를 냅니다.'],
    fix: ['Make the predicate a pure function of its arguments.', '조건자를 인자만으로 결과가 정해지는 순수 함수로 만드세요.'],
    check(unit, api) {
      for (const c of U.ix(unit).get('CallExpr')) {
        const cn = U.callName(c);
        if (!cn || cn.member || cn.qualifier !== 'std' || !PRED_ALGOS.has(cn.name)) continue;
        for (const a of c.args) {
          const lam = U.strip(a);
          if (!lam || lam.type !== 'LambdaExpr') continue;
          const locals = lambdaLocals(lam);
          let hit = null;
          cf.walk(lam.body, (n) => {
            if (hit) return cf.walk.STOP;
            if (n.type === 'Identifier' && n.symbol && !locals.has(n.symbol) && (n.symbol.kind === 'variable' || n.symbol.kind === 'parameter' || n.symbol.kind === 'field')) {
              const w = U.writeKind(n);
              if (w === 'assign' || w === 'compound' || w === 'incdec') hit = n;
            }
            return undefined;
          });
          if (hit) api.report(lam, M(`The predicate passed to 'std::${cn.name}' modifies '${hit.name}'.`, `'std::${cn.name}' 에 넘긴 조건자가 '${hit.name}' 를 수정합니다.`));
        }
      }
    },
  }),
  R({
    id: '28.6.1', cat: 'Required', dec: true, autosar: 'A18-9-3', sev: 'MAJOR', debt: 5,
    name: ['The argument to std::move shall be a non-const lvalue', 'std::move 의 인자는 const 가 아닌 좌값이어야 합니다'],
    why: ['Moving from a const object silently copies, and std::move on an rvalue is redundant.', 'const 객체에서의 이동은 조용히 복사가 되고, 우값에 대한 std::move 는 불필요합니다.'],
    fix: ['Remove the std::move, or drop the const from the object.', 'std::move 를 없애거나 객체의 const 를 없애세요.'],
    check(unit, api) {
      for (const c of U.ix(unit).get('CallExpr')) {
        if (!isStdCall(c, 'move') || c.args.length !== 1) continue;
        const a = U.strip(c.args[0]);
        if (!a || !a.ctype) continue;
        const t = U.nonRef(a.ctype);
        let cat = null;
        try { cat = U.T.valueCategory(a, { lang: 'cpp' }); } catch (e) { cat = null; }
        if (U.T.qualsOf(t).const) api.report(c, M(`std::move is applied to the const object '${cf.sourceText(unit, a)}'.`, `const 객체 '${cf.sourceText(unit, a)}' 에 std::move 를 씁니다.`));
        else if (cat === 'prvalue' && !U.unknownT(a.ctype)) api.report(c, M(`std::move is applied to the rvalue '${cf.sourceText(unit, a)}'.`, `우값 '${cf.sourceText(unit, a)}' 에 std::move 를 씁니다.`));
      }
    },
  }),
  R({
    id: '28.6.2', cat: 'Required', dec: true, autosar: 'A18-9-2', sev: 'MAJOR', debt: 5,
    name: ['Forwarding references and std::forward shall be used together', '전달 참조와 std::forward 는 함께 써야 합니다'],
    why: ['Using a forwarding reference without std::forward loses its value category; std::forward on anything else is misleading.', 'std::forward 없이 전달 참조를 쓰면 값 범주를 잃고, 다른 것에 std::forward 를 쓰면 오해를 부릅니다.'],
    fix: ['Pass forwarding references on with std::forward<T>(x), and use std::move for ordinary rvalue references.', '전달 참조는 std::forward<T>(x) 로 넘기고, 일반 우값 참조에는 std::move 를 쓰세요.'],
    check(unit, api) {
      const fwdParams = new Set();
      for (const t of U.ix(unit).get('TemplateDecl')) {
        const { fn, params } = forwardingParams(t);
        if (!fn) continue;
        for (const s of params) {
          fwdParams.add(s);
          for (const id of U.usesIn(fn.body, s)) {
            if (inUnevaluated(id)) continue;
            const { p } = U.upParens(id);
            if (p && p.type === 'CallExpr' && isStdCall(p, 'forward')) continue;
            api.report(id, M(`Forwarding reference '${id.name}' is used without std::forward.`, `전달 참조 '${id.name}' 를 std::forward 없이 씁니다.`));
          }
        }
      }
      for (const c of U.ix(unit).get('CallExpr')) {
        if (!isStdCall(c, 'forward') || c.args.length !== 1) continue;
        const a = U.strip(c.args[0]);
        if (a && a.type === 'Identifier' && a.symbol && !fwdParams.has(a.symbol) && (a.symbol.kind === 'parameter' || a.symbol.kind === 'variable')) {
          const d = a.symbol.decls && a.symbol.decls[0];
          const autoRef = d && d.specs && d.specs.typeSpec && d.specs.typeSpec.type === 'AutoType' && d.declarator && d.declarator.type === 'ReferenceDeclarator' && d.declarator.rvalue;
          if (!autoRef) api.report(c, M(`std::forward is applied to '${a.name}', which is not a forwarding reference.`, `전달 참조가 아닌 '${a.name}' 에 std::forward 를 씁니다.`));
        }
      }
    },
  }),
  R({
    id: '28.6.3', cat: 'Required', dec: false, type: 'BUG', autosar: 'A12-8-3', cert: 'EXP63-CPP', sev: 'MAJOR', debt: 10,
    name: ['An object shall not be used while in a potentially moved-from state', '이동되었을 수 있는 상태의 객체는 쓰면 안 됩니다'],
    why: ['After a move the object is in a valid but unspecified state; reading it gives unpredictable results.', '이동 후 객체는 유효하지만 명시되지 않은 상태라서 읽으면 결과를 예측할 수 없습니다.'],
    fix: ['Assign a new value before using the object again, or do not move from it.', '객체를 다시 쓰기 전에 새 값을 대입하거나 이동하지 마세요.'],
    check(unit, api) {
      for (const fn of U.ix(unit).funcs) {
        const moves = cf.findAll(fn.body, (n) => n.type === 'CallExpr' && isStdCall(n, 'move') && n.args.length === 1 && U.strip(n.args[0]) && U.strip(n.args[0]).type === 'Identifier');
        if (!moves.length) continue;
        const syms = new Set(moves.map((m) => U.strip(m.args[0]).symbol).filter((s) => s && (s.storage === 'automatic' || s.kind === 'parameter')));
        for (const sym of syms) {
          const events = [];
          for (const m of moves) if (U.strip(m.args[0]).symbol === sym) events.push({ pos: m.loc.end, kind: 'move', node: m });
          for (const id of U.usesIn(fn.body, sym)) {
            const { p } = U.upParens(id);
            if (p && p.type === 'CallExpr' && moves.includes(p)) continue;
            const w = U.writeKind(id);
            let kind = 'use';
            if (w === 'assign') kind = 'reset';
            else if (p && p.type === 'MemberExpr' && ['clear', 'reset', 'assign', 'emplace', 'swap'].includes(p.member)) kind = 'reset';
            events.push({ pos: id.loc.start, kind, node: id });
          }
          events.sort((a, b) => a.pos - b.pos);
          let moved = null;
          for (const e of events) {
            if (e.kind === 'move') moved = e;
            else if (e.kind === 'reset') moved = null;
            else if (moved) { api.report(e.node, M(`'${sym.name}' is used after being moved from at line ${moved.node.loc.line}.`, `'${sym.name}' 가 ${moved.node.loc.line}행에서 이동된 뒤에 쓰입니다.`)); moved = null; }
          }
        }
      }
    },
  }),
  R({
    id: '28.6.4', cat: 'Required', dec: true, type: 'BUG', autosar: 'A0-1-2', cert: 'EXP63-CPP', cwe: 'CWE-252', sev: 'MAJOR', debt: 5,
    name: ['The result of std::remove, std::remove_if, std::unique and empty shall be used', 'std::remove, std::remove_if, std::unique, empty 의 결과는 써야 합니다'],
    why: ['remove/unique do not shrink the container and empty() does not clear it; ignoring the result is almost always a bug.', 'remove/unique 는 컨테이너를 줄이지 않고 empty() 는 비우지 않으므로 결과를 무시하면 거의 언제나 버그입니다.'],
    fix: ['Use the result (e.g. pass it to erase), or call clear() if that was intended.', '결과를 쓰거나 (예: erase 에 넘기기), 의도한 것이 비우기라면 clear() 를 호출하세요.'],
    check(unit, api) {
      for (const c of U.ix(unit).get('CallExpr')) {
        if (!U.isDiscarded(c)) continue;
        const cn = U.callName(c);
        if (!cn) continue;
        let what = null;
        if (cn.member && cn.name === 'empty' && c.args.length === 0) what = 'empty()';
        else if (!cn.member && cn.qualifier === 'std' && (cn.name === 'empty' || ((cn.name === 'remove' || cn.name === 'remove_if') && c.args.length >= 3) || (cn.name === 'unique' && c.args.length >= 2))) what = `std::${cn.name}`;
        if (what) api.report(c, M(`The result of ${what} is discarded.`, `${what} 의 결과가 버려집니다.`));
      }
    },
  }),
  R({
    id: '30.0.1', cat: 'Required', dec: true, type: 'VULNERABILITY', autosar: 'M27-0-1', cert: 'FIO47-C', cwe: 'CWE-134', sev: 'MAJOR', debt: 10,
    name: ['The C Library input/output functions shall not be used', 'C 라이브러리 입출력 함수는 쓰면 안 됩니다'],
    why: ['The <cstdio> functions are not type-safe and have much unspecified and undefined behaviour (format strings, buffer sizes).', '<cstdio> 함수는 타입 안전하지 않고 명시되지 않거나 정의되지 않은 동작이 많습니다 (형식 문자열, 버퍼 크기).'],
    fix: ['Use C++ streams or a type-safe formatting library.', 'C++ 스트림이나 타입 안전한 서식 라이브러리를 쓰세요.'],
    check(unit, api) {
      for (const c of U.ix(unit).get('CallExpr')) {
        const n = U.isLibCall(c, CSTDIO);
        if (!n || (n === 'remove' && c.args.length !== 1)) continue;
        api.report(c, M(`C I/O function '${n}' is used.`, `C 입출력 함수 '${n}' 를 씁니다.`));
      }
    },
  }),
  R({
    id: '30.0.2', cat: 'Required', dec: false, type: 'BUG', cert: 'FIO50-CPP', sev: 'MAJOR', debt: 10,
    name: ['Reads and writes on the same file stream shall be separated by a positioning operation', '같은 파일 스트림의 읽기와 쓰기 사이에는 위치 지정 연산이 있어야 합니다'],
    why: ['Switching between input and output on a stream without seeking (or flushing after output) is undefined behaviour.', '스트림에서 위치 지정 (또는 출력 뒤 flush) 없이 입력과 출력을 바꾸는 것은 정의되지 않은 동작입니다.'],
    fix: ['Call fseek/fsetpos/rewind (or seekg/seekp) between a write and a following read, and vice versa.', '쓰기와 이어지는 읽기 사이에 (또는 그 반대) fseek/fsetpos/rewind (또는 seekg/seekp) 를 호출하세요.'],
    check(unit, api) {
      for (const fn of U.ix(unit).funcs) {
        const ops = [];
        cf.walk(fn.body, (n) => {
          if (n.type === 'CallExpr') {
            const nm = U.isLibCall(n, new Set(Object.keys(FILE_OPS)));
            if (nm) {
              const [i, kind] = FILE_OPS[nm];
              const a = U.strip(n.args[i < 0 ? n.args.length - 1 : i]);
              if (a && a.type === 'Identifier' && a.symbol) ops.push({ sym: a.symbol, kind, node: n, name: nm });
              return undefined;
            }
            const cn = U.callName(n);
            if (cn && cn.member && MEMBER_OPS[cn.name] && !cn.arrow) {
              const o = U.strip(cn.object);
              if (o && o.type === 'Identifier' && o.symbol && isFstreamSym(o.symbol)) ops.push({ sym: o.symbol, kind: MEMBER_OPS[cn.name], node: n, name: cn.name });
            }
          }
          if (n.type === 'BinaryExpr' && (n.op === '<<' || n.op === '>>')) {
            let l = U.strip(n.left);
            while (l && l.type === 'BinaryExpr' && l.op === n.op) l = U.strip(l.left);
            if (l && l.type === 'Identifier' && l.symbol && isFstreamSym(l.symbol)) {
              const p = U.upParens(n).p;
              if (!(p && p.type === 'BinaryExpr' && p.op === n.op && U.upParens(n).key === 'left')) ops.push({ sym: l.symbol, kind: n.op === '<<' ? 'w' : 'r', node: n, name: `operator${n.op}` });
            }
          }
          return undefined;
        });
        ops.sort((a, b) => a.node.loc.start - b.node.loc.start);
        const last = new Map();
        for (const o of ops) {
          const prev = last.get(o.sym);
          if (o.kind === 'p') { last.set(o.sym, null); continue; }
          if (o.kind === 'f') { if (prev && prev.kind === 'w') last.set(o.sym, null); continue; }
          if (prev && prev.kind !== o.kind) api.report(o.node, M(`'${o.name}' ${o.kind === 'r' ? 'reads from' : 'writes to'} '${o.sym.name}' right after a ${prev.kind === 'r' ? 'read' : 'write'} at line ${prev.node.loc.line} with no positioning in between.`, `'${o.name}' 가 ${prev.node.loc.line}행의 ${prev.kind === 'r' ? '읽기' : '쓰기'} 직후 위치 지정 없이 '${o.sym.name}' ${o.kind === 'r' ? '에서 읽습니다' : '에 씁니다'}.`));
          last.set(o.sym, o);
        }
      }
    },
  }),
];
