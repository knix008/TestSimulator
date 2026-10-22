'use strict';

// SEI CERT C — WIN: Windows.

const { rule } = require('../lib/meta');
const U = require('../lib/util');
const S = require('../lib/sys');
const { M, cf } = U;

// allocator -> family, deallocator -> family
const ALLOC = {
  malloc: 'crt', calloc: 'crt', realloc: 'crt', strdup: 'crt', _strdup: 'crt', wcsdup: 'crt', _wcsdup: 'crt', aligned_alloc: 'crt',
  _aligned_malloc: 'aligned', _aligned_realloc: 'aligned',
  LocalAlloc: 'local', LocalReAlloc: 'local',
  GlobalAlloc: 'global', GlobalReAlloc: 'global',
  HeapAlloc: 'heap', HeapReAlloc: 'heap',
  VirtualAlloc: 'virtual', VirtualAllocEx: 'virtual',
  CoTaskMemAlloc: 'cotask', CoTaskMemRealloc: 'cotask',
  SysAllocString: 'bstr', SysAllocStringLen: 'bstr', SysAllocStringByteLen: 'bstr',
  CommandLineToArgvW: 'local',
};
const FREE = {
  free: 'crt', _aligned_free: 'aligned', LocalFree: 'local', GlobalFree: 'global', HeapFree: 'heap', VirtualFree: 'virtual', VirtualFreeEx: 'virtual',
  CoTaskMemFree: 'cotask', SysFreeString: 'bstr',
};
const FREE_ARG = { HeapFree: 2, VirtualFreeEx: 1 };
const FREE_FN = { crt: 'free()', aligned: '_aligned_free()', local: 'LocalFree()', global: 'GlobalFree()', heap: 'HeapFree()', virtual: 'VirtualFree()', cotask: 'CoTaskMemFree()', bstr: 'SysFreeString()' };

module.exports = [
  rule('WIN30-C', {
    risk: 'LPM', cwe: ['CWE-762', 'CWE-590'], approx: true,
    name: ['Properly pair allocation and deallocation functions', '할당 함수와 해제 함수를 올바르게 짝지으세요'],
    why: ['Windows has several heaps (CRT, Local/Global, Heap*, Virtual*, COM task memory, BSTR); releasing memory with the deallocator of a different family corrupts the heap or leaks.', 'Windows 에는 CRT, Local/Global, Heap*, Virtual*, COM 작업 메모리, BSTR 등 여러 힙이 있어 다른 계열의 해제 함수로 메모리를 풀면 힙이 깨지거나 누수됩니다.'],
    fix: ['Release memory with the function that matches its allocator: malloc/free, LocalAlloc/LocalFree, GlobalAlloc/GlobalFree, HeapAlloc/HeapFree, VirtualAlloc/VirtualFree, CoTaskMemAlloc/CoTaskMemFree, SysAllocString/SysFreeString.', '할당 함수에 맞는 함수로 해제하세요: malloc/free, LocalAlloc/LocalFree, GlobalAlloc/GlobalFree, HeapAlloc/HeapFree, VirtualAlloc/VirtualFree, CoTaskMemAlloc/CoTaskMemFree, SysAllocString/SysFreeString.'],
  }, {
    check(unit, api) {
      const project = api.project;
      const fam = new Map(); // sym -> { family, call } | null (conflicting)
      const note = (sym, family, call) => {
        if (!sym) return;
        if (fam.has(sym)) { const f = fam.get(sym); if (f && f.family !== family) fam.set(sym, null); return; }
        fam.set(sym, { family, call });
      };
      for (const c of S.calls(unit, Object.keys(ALLOC), project)) {
        const r = U.resultUse(c.node);
        if (r.kind === 'var') note(r.sym, ALLOC[c.name], c);
        else if (r.kind === 'used') {
          // (T *)HeapAlloc(...) assigned through a cast
          let n = c.node, p = cf.parentOf(n);
          while (p && (p.type === 'CastExpr' || p.type === 'ParenExpr')) { n = p; p = cf.parentOf(n); }
          if (p && p.type === 'VarDecl' && p.init === n) note(p.symbol, ALLOC[c.name], c);
          else if (p && p.type === 'AssignExpr' && p.right === n && p.op === '=') note(U.idSym(p.left), ALLOC[c.name], c);
        }
      }
      // FormatMessage(FORMAT_MESSAGE_ALLOCATE_BUFFER, ..., (LPTSTR)&buf, ...) allocates with LocalAlloc
      for (const c of S.calls(unit, ['FormatMessage', 'FormatMessageA', 'FormatMessageW'], project)) {
        if (!/FORMAT_MESSAGE_ALLOCATE_BUFFER/.test(U.src(unit, c.args[0]))) continue;
        const a = U.strip(c.args[4]);
        if (a && a.type === 'UnaryExpr' && a.op === '&') note(U.idSym(a.arg), 'local', c);
        // Front-end workaround: without <windows.h> `(LPTSTR)&buf` parses as `(LPTSTR) & buf` (bitwise and).
        else if (a && a.type === 'BinaryExpr' && a.op === '&') {
          const l = U.skip(a.left);
          if (a.left.type === 'ParenExpr' && l && l.type === 'Identifier' && !l.symbol) note(U.idSym(a.right), 'local', c);
        }
      }
      if (!fam.size) return;
      for (const c of S.calls(unit, Object.keys(FREE), project)) {
        const s = U.idSym(c.args[FREE_ARG[c.name] || 0]);
        const f = s && fam.get(s);
        if (!f || f.family === FREE[c.name]) continue;
        api.report(c.node, M(`'${s.name}' was allocated by ${f.call.name}() (line ${f.call.loc.line}) but is released with ${c.name}(); use ${FREE_FN[f.family]}.`, `'${s.name}' 는 ${f.call.name}()(${f.call.loc.line} 행)로 할당했는데 ${c.name}() 로 해제합니다. ${FREE_FN[f.family]} 를 사용하세요.`));
      }
    },
  }),
];
