'use strict';

// Standard library use checks shared by MISRA C:2004 chapter 20 and C++:2008 chapters 17-19, 27.

const U = require('./util');

const { M } = U;

// Uses of a library macro or identifier `name` (errno, offsetof, setjmp ...).
function macroOrIdent(unit, api, id, names, what) {
  const files = new Set(U.sourcesOnce(unit, api, id).map(([f]) => f));
  const seen = new Set();
  const say = (loc, n) => {
    const k = `${loc.file}:${loc.line}:${loc.col}`;
    if (seen.has(k)) return;
    seen.add(k);
    api.report(loc, M(`'${n}' is used${what ? ` (${what[0]})` : ''}.`, `'${n}'를 사용했습니다${what ? `(${what[1]})` : ''}.`));
  };
  for (const e of unit.expansions || []) if (files.has(e.file) && !e.nested && names.has(e.name)) say(e, e.name);
  for (const i of U.get(unit, 'Identifier')) {
    if (!names.has(i.name) || i.loc.macro || !files.has(i.loc.file)) continue;
    const s = i.symbol;
    if (s && !s.system && (s.decls || []).some((d) => U.user(d))) continue;
    say(i.loc, i.name);
  }
}

// Calls of library functions in `names`.
function libCalls(unit, api, names, what) {
  for (const c of U.get(unit, 'CallExpr')) {
    const n = U.isLibCall(c, names);
    if (n) api.report(c, M(`The library function '${n}' is called${what ? ` (${what[0]})` : ''}.`, `라이브러리 함수 '${n}'를 호출했습니다${what ? `(${what[1]})` : ''}.`));
  }
}

const offsetofUse = (unit, api, id) => {
  macroOrIdent(unit, api, id, new Set(['offsetof']));
  for (const o of U.get(unit, 'OffsetofExpr')) if (!o.loc.macro) api.report(o, M("'offsetof' is used.", "'offsetof'를 사용했습니다."));
};

module.exports = { macroOrIdent, libCalls, offsetofUse };
