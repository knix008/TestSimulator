'use strict';

// Code smells: complexity, size, redundancy, naming, idioms, error handling.

const { define } = require('./def');
const { FUNC_TYPES, STMT_TYPES, dotted, same, sameList, isPure, walkLocal, short, children, isNone, isTrue, isFalse, isBoolConst, targetNames } = require('../ast');
const { BUILTIN } = require('../scope');
const U = require('./util');
const { ifChain } = require('./bugs2');
const { parse } = require('../parser');

const RULES = [];
const R = define(RULES);

// ── complexity / size ───────────────────────────────────────
function cognitive(fn) {
  let total = 0;
  const events = [];
  const add = (node, inc, why) => { total += inc; if (events.length < 30) events.push({ line: node.line, inc, why }); };
  const boolSeq = (e) => {
    // +1 per sequence of like boolean operators
    const visit = (n, parentOp) => {
      if (!n) return;
      if (n.type === 'BoolOp') {
        if (n.op !== parentOp) add(n, 1, n.op === 'And' ? 'and' : 'or');
        for (const v of n.values) visit(v, n.op);
        return;
      }
      if (n.type === 'Lambda' || n.type === 'IfExp') return;
      if (n.type === 'UnaryOp' && n.op === 'Not') { visit(n.operand, null); return; }
      for (const ch of children(n)) visit(ch, null);
    };
    visit(e, null);
  };
  const expr = (e, nest) => {
    if (!e) return;
    if (e.type === 'IfExp') {
      add(e, 1 + nest, 'conditional expression');
      expr(e.test, nest + 1); expr(e.body, nest + 1); expr(e.orelse, nest + 1);
      return;
    }
    if (e.type === 'BoolOp') { boolSeq(e); for (const v of e.values) exprNoBool(v, nest); return; }
    if (e.type === 'Lambda') { expr(e.body, nest + 1); return; }
    for (const ch of children(e)) expr(ch, nest);
  };
  const exprNoBool = (e, nest) => {
    if (!e) return;
    if (e.type === 'BoolOp') { for (const v of e.values) exprNoBool(v, nest); return; }
    expr(e, nest);
  };
  const stmts = (list, nest) => { for (const s of list) stmt(s, nest); };
  const stmt = (s, nest) => {
    switch (s.type) {
      case 'If': {
        add(s, s.isElif ? 1 : 1 + nest, s.isElif ? 'elif' : 'if');
        expr(s.test, nest);
        stmts(s.body, nest + 1);
        if (s.orelse.length === 1 && s.orelse[0].type === 'If' && s.orelse[0].isElif) stmt(s.orelse[0], nest);
        else if (s.orelse.length) { add(s.orelse[0], 1, 'else'); stmts(s.orelse, nest + 1); }
        return;
      }
      case 'For': case 'AsyncFor': case 'While':
        add(s, 1 + nest, s.type === 'While' ? 'while' : 'for');
        expr(s.type === 'While' ? s.test : s.iter, nest);
        stmts(s.body, nest + 1);
        if (s.orelse.length) { add(s.orelse[0], 1, 'else'); stmts(s.orelse, nest + 1); }
        return;
      case 'Try': case 'TryStar':
        stmts(s.body, nest);
        for (const h of s.handlers) { add(h, 1 + nest, 'except'); stmts(h.body, nest + 1); }
        stmts(s.orelse, nest);
        stmts(s.finalbody, nest);
        return;
      case 'Match':
        add(s, 1 + nest, 'match');
        expr(s.subject, nest);
        for (const cs of s.cases) { if (cs.guard) expr(cs.guard, nest + 1); stmts(cs.body, nest + 1); }
        return;
      case 'With': case 'AsyncWith':
        for (const it of s.items) expr(it.context_expr, nest);
        stmts(s.body, nest);
        return;
      case 'FunctionDef': case 'AsyncFunctionDef':
        stmts(s.body, nest + 1);
        return;
      case 'ClassDef':
        stmts(s.body, nest + 1);
        return;
      default:
        for (const ch of children(s)) expr(ch, nest);
    }
  };
  stmts(fn.body, 0);
  return { total, events };
}

R('cognitive-complexity', 'S', 'CR', 30, ['brain-overload'], 'S3776',
  ['Cognitive complexity of a function is too high', '함수의 인지 복잡도가 너무 높습니다'],
  ['Deeply nested and branchy code is hard to understand, test and change; cognitive complexity counts breaks in linear flow, weighted by nesting.', '깊게 중첩되고 분기가 많은 코드는 이해, 테스트, 변경이 어렵습니다. 인지 복잡도는 중첩 깊이로 가중한 흐름 단절 횟수입니다.'],
  ['Extract parts into well-named functions and flatten nesting with early returns.', '일부를 이름 있는 함수로 추출하고 조기 반환으로 중첩을 줄이세요.'],
  {
    on: {
      'FunctionDef|AsyncFunctionDef'(n, c, r) {
        if (U.enclosingDef(n)) return; // nested functions count toward the outer one
        const max = (c.opts.options && c.opts.options.cognitiveMax) || 15;
        const { total, events } = cognitive(n);
        if (total <= max) return;
        r.report(n, `Refactor '${n.name}' to reduce its cognitive complexity from ${total} to the ${max} allowed.`, `'${n.name}'의 인지 복잡도를 ${total}에서 허용치 ${max} 이하로 줄이세요.`,
          { events: events.map((e) => ({ line: e.line, tag: 'path', text: { en: `+${e.inc} (${e.why})`, ko: `+${e.inc} (${e.why})` }, main: false })) });
      },
    },
  });

function cyclomatic(fn) {
  let n = 1;
  walkLocal(fn, (m) => {
    switch (m.type) {
      case 'If': case 'For': case 'AsyncFor': case 'While': case 'ExceptHandler': case 'IfExp': case 'match_case': n++; break;
      case 'BoolOp': n += m.values.length - 1; break;
      case 'comprehension': n += 1 + m.ifs.length; break;
      default: break;
    }
    return true;
  });
  return n;
}

R('cyclomatic-complexity', 'S', 'MA', 20, ['brain-overload'], 'S1541',
  ['Cyclomatic complexity of a function is too high', '함수의 순환 복잡도가 너무 높습니다'],
  ['Many independent paths make a function hard to test exhaustively.', '독립 경로가 많으면 함수를 빠짐없이 테스트하기 어렵습니다.'],
  ['Split the function into smaller ones.', '함수를 더 작게 나누세요.'],
  {
    on: {
      'FunctionDef|AsyncFunctionDef'(n, c, r) {
        const max = 15;
        const v = cyclomatic(n);
        if (v > max) r.report(n, `'${n.name}' has a cyclomatic complexity of ${v} (maximum ${max}).`, `'${n.name}'의 순환 복잡도가 ${v}입니다(최대 ${max}).`);
      },
    },
  });

R('too-many-parameters', 'S', 'MA', 20, ['brain-overload'], 'S107',
  ['Function has too many parameters', '함수의 매개변수가 너무 많습니다'],
  ['A long parameter list is hard to call correctly and often means the function does too much.', '긴 매개변수 목록은 올바르게 호출하기 어렵고 함수가 너무 많은 일을 한다는 신호입니다.'],
  ['Group related parameters into an object or split the function.', '관련 매개변수를 객체로 묶거나 함수를 나누세요.'],
  {
    on: {
      'FunctionDef|AsyncFunctionDef'(n, c, r) {
        const a = n.args;
        let params = [...a.posonlyargs, ...a.args, ...a.kwonlyargs];
        if (n.info && n.info.cls && n.info.kind !== 'staticmethod' && params.length) params = params.slice(1);
        const max = 13;
        if (params.length > max) r.report(n, `'${n.name}' has ${params.length} parameters, which is more than the ${max} authorized.`, `'${n.name}'의 매개변수가 ${params.length}개로 허용치 ${max}개를 넘습니다.`);
      },
    },
  });

R('too-many-returns', 'S', 'MA', 20, ['brain-overload'], 'S1142',
  ['Function has too many return statements', '함수의 return 문이 너무 많습니다'],
  ['Many exit points make the control flow of a function hard to follow.', '종료 지점이 많으면 함수의 흐름을 따라가기 어렵습니다.'],
  ['Reduce the number of returns, for example with a result variable or by splitting the function.', '결과 변수를 쓰거나 함수를 나눠 return 수를 줄이세요.'],
  {
    on: {
      'FunctionDef|AsyncFunctionDef'(n, c, r) {
        let k = 0;
        walkLocal(n, (m) => { if (m.type === 'Return') k++; return true; });
        if (k > 6) r.report(n, `'${n.name}' has ${k} return statements, more than the 6 allowed.`, `'${n.name}'의 return 문이 ${k}개로 허용치 6개를 넘습니다.`);
      },
    },
  });

R('nesting-too-deep', 'S', 'CR', 10, ['brain-overload'], 'S134',
  ['Control flow statements nested too deeply', '제어문이 너무 깊게 중첩됩니다'],
  ['Code nested more than 4 levels of if/for/while/try/with is hard to read.', 'if/for/while/try/with가 4단계 넘게 중첩된 코드는 읽기 어렵습니다.'],
  ['Extract inner blocks into functions or use early returns.', '안쪽 블록을 함수로 추출하거나 조기 반환을 쓰세요.'],
  {
    on: {
      'If|For|AsyncFor|While|Try|TryStar|With|AsyncWith|Match'(n, c, r) {
        if (n.type === 'If' && n.isElif) return;
        let depth = 1;
        for (let p = n.parent; p && !FUNC_TYPES.has(p.type) && p.type !== 'ClassDef' && p.type !== 'Module' && p.type !== 'Lambda'; p = p.parent) {
          if (/^(?:If|For|AsyncFor|While|Try|TryStar|With|AsyncWith|Match)$/.test(p.type) && !(p.type === 'If' && p.isElif)) depth++;
        }
        if (depth === 5) r.report({ line: n.line, col: n.col, endLine: n.line, endCol: n.col + 2 }, 'Refactor this code to not nest more than 4 control flow statements.', '제어문이 4단계를 넘게 중첩되지 않도록 코드를 고치세요.');
      },
    },
  });

R('function-too-long', 'S', 'MA', 20, ['brain-overload'], 'S138',
  ['Function is too long', '함수가 너무 깁니다'],
  ['Very long functions mix several responsibilities and are hard to understand.', '아주 긴 함수는 여러 책임이 섞여 이해하기 어렵습니다.'],
  ['Split the function.', '함수를 나누세요.'],
  {
    on: {
      'FunctionDef|AsyncFunctionDef'(n, c, r) {
        // lines holding code tokens between the def line and the end of the body
        const lines = new Set();
        const from = n.nameLine || n.line;
        const to = n.endLine || n.line;
        for (const t of c.tokens) {
          if (t.line > to) break;
          if (t.endLine < from || t.t === 'NEWLINE' || t.t === 'INDENT' || t.t === 'DEDENT' || t.t === 'ENDMARKER') continue;
          for (let l = Math.max(t.line, from); l <= Math.min(t.endLine, to); l++) lines.add(l);
        }
        const max = 100;
        if (lines.size > max) r.report(n, `'${n.name}' has ${lines.size} lines of code, more than the ${max} authorized.`, `'${n.name}'의 코드가 ${lines.size}줄로 허용치 ${max}줄을 넘습니다.`);
      },
    },
  });

R('file-too-long', 'S', 'MA', 60, ['brain-overload'], 'S104',
  ['File has too many lines of code', '파일의 코드 줄이 너무 많습니다'],
  ['Very large modules are hard to navigate and usually hold several responsibilities.', '아주 큰 모듈은 탐색하기 어렵고 보통 여러 책임을 가집니다.'],
  ['Split the module.', '모듈을 나누세요.'],
  {
    module(c, r) {
      const code = new Set();
      for (const t of c.tokens) if (t.t !== 'NEWLINE' && t.t !== 'INDENT' && t.t !== 'DEDENT' && t.t !== 'ENDMARKER') for (let l = t.line; l <= t.endLine; l++) code.add(l);
      if (code.size > 1000) r.report({ line: 1, col: 0 }, `This file has ${code.size} lines of code, more than the 1000 authorized.`, `이 파일의 코드는 ${code.size}줄로 허용치 1000줄을 넘습니다.`);
    },
  });

R('too-many-branches', 'S', 'MA', 20, ['brain-overload'], null,
  ['Function has too many branches', '함수의 분기가 너무 많습니다'],
  ['More than 15 if/elif/for/while/except branches in one function make it hard to follow.', '한 함수에 if/elif/for/while/except 분기가 15개를 넘으면 따라가기 어렵습니다.'],
  ['Use a lookup table, polymorphism or smaller functions.', '조회 테이블, 다형성, 작은 함수를 쓰세요.'],
  {
    on: {
      'FunctionDef|AsyncFunctionDef'(n, c, r) {
        let k = 0;
        walkLocal(n, (m) => { if (/^(?:If|For|AsyncFor|While|ExceptHandler|match_case)$/.test(m.type)) k++; if (m.type === 'If' && m.orelse.length && !(m.orelse[0].type === 'If' && m.orelse[0].isElif)) k++; return true; });
        if (k > 15) r.report(n, `'${n.name}' has ${k} branches (maximum 15).`, `'${n.name}'의 분기가 ${k}개입니다(최대 15).`);
      },
    },
  });

R('too-many-methods', 'S', 'MA', 30, ['brain-overload'], 'S1448',
  ['Class has too many methods', '클래스의 메서드가 너무 많습니다'],
  ['A class with more than 20 methods probably does too much.', '메서드가 20개를 넘는 클래스는 너무 많은 일을 할 가능성이 큽니다.'],
  ['Split the class by responsibility.', '책임별로 클래스를 나누세요.'],
  {
    on: {
      ClassDef(n, c, r) {
        const k = n.body.filter((s) => FUNC_TYPES.has(s.type)).length;
        if (k > 20) r.report(n, `Class '${n.name}' has ${k} methods, more than the 20 authorized.`, `클래스 '${n.name}'의 메서드가 ${k}개로 허용치 20개를 넘습니다.`);
      },
    },
  });

R('expression-too-complex', 'S', 'CR', 10, ['brain-overload'], 'S1067',
  ['Boolean expression is too complex', '불리언 식이 너무 복잡합니다'],
  ['More than 3 and/or operators in one expression are hard to read and easy to get wrong.', '한 식에 and/or 연산자가 3개를 넘으면 읽기 어렵고 틀리기 쉽습니다.'],
  ['Extract parts into well-named variables or functions.', '일부를 이름 있는 변수나 함수로 추출하세요.'],
  {
    on: {
      BoolOp(n, c, r) {
        // only the outermost boolean expression
        // (the outer visit below descends through everything except calls,
        // lambdas and comprehensions, so a BoolOp reached that way is counted there)
        for (let p = n.parent; p && !STMT_TYPES.has(p.type) && p.type !== 'Module'; p = p.parent) {
          if (p.type === 'Call' || p.type === 'Lambda' || /Comp$|GeneratorExp/.test(p.type)) break;
          if (p.type === 'BoolOp') return;
        }
        let ops = 0;
        const visit = (m) => {
          if (!m) return;
          if (m.type === 'BoolOp') { ops += m.values.length - 1; for (const v of m.values) visit(v); return; }
          if (m.type === 'UnaryOp' && m.op === 'Not') { visit(m.operand); return; }
          if (m.type === 'Call' || m.type === 'Lambda' || /Comp$|GeneratorExp/.test(m.type)) return;
          for (const ch of children(m)) visit(ch);
        };
        visit(n);
        if (ops > 3) r.report(n, `Reduce the number of boolean operators (${ops}) in this expression to at most 3.`, `이 식의 불리언 연산자 수(${ops})를 3개 이하로 줄이세요.`);
      },
    },
  });

// ── redundancy ──────────────────────────────────────────────
R('collapsible-if', 'S', 'MA', 5, ['clumsy'], 'S1066',
  ['Nested if statements can be merged', '중첩된 if 문을 합칠 수 있습니다'],
  ['An if whose only content is another if without else reads better as one condition joined with and.', '내용이 else 없는 다른 if 하나뿐인 if는 and로 합친 조건 하나가 더 읽기 쉽습니다.'],
  ['Merge the conditions with "and".', '"and"로 조건을 합치세요.'],
  {
    on: {
      If(n, c, r) {
        if (n.orelse.length || n.body.length !== 1) return;
        const inner = n.body[0];
        if (inner.type !== 'If' || inner.orelse.length) return;
        if (n.test.type === 'NamedExpr' || inner.test.type === 'NamedExpr') return;
        if (U.hasCommentIn(c, { line: n.line + 0, endLine: inner.line - 1 }) && inner.line - 1 >= n.line) return;
        r.report({ line: inner.line, col: inner.col, endLine: inner.line, endCol: inner.col + 2 }, "Merge this 'if' statement with the enclosing one.", "이 'if' 문을 바깥 if와 합치세요.");
      },
    },
  });

function significant(body) {
  if (body.length >= 2) return true;
  const s = body[0];
  return !!s && /^(?:If|For|While|Try|With|Match|AsyncFor|AsyncWith)$/.test(s.type);
}

R('duplicated-branches', 'S', 'MA', 10, ['design', 'suspicious'], 'S1871',
  ['Two branches have the same implementation', '두 분기의 구현이 같습니다'],
  ['Identical branches in an if/elif chain are either a copy-paste error or should be merged.', 'if/elif 연쇄의 같은 분기는 복사-붙여넣기 실수이거나 합쳐야 합니다.'],
  ['Merge the conditions or fix the branch that should differ.', '조건을 합치거나 달라야 할 분기를 고치세요.'],
  {
    on: {
      If(n, c, r) {
        if (n.isElif) return;
        const { branches, orelse } = ifChain(n);
        const bodies = branches.map((b) => b.body);
        if (orelse) bodies.push(orelse);
        if (orelse && bodies.every((b) => sameList(b, bodies[0]))) return; // all-branches-identical
        for (let i = 1; i < bodies.length; i++) {
          if (!significant(bodies[i])) continue;
          for (let j = 0; j < i; j++) {
            if (sameList(bodies[i], bodies[j])) {
              r.report(bodies[i][0], `This branch duplicates the one on line ${bodies[j][0].line}.`, `이 분기는 ${bodies[j][0].line}행의 분기와 같습니다.`, { events: [{ line: bodies[j][0].line, tag: 'path', text: { en: 'original branch', ko: '원래 분기' }, main: false }] });
              break;
            }
          }
        }
      },
    },
  });

R('duplicated-string-literal', 'S', 'CR', 5, ['design'], 'S1192',
  ['String literal duplicated many times', '문자열 리터럴이 여러 번 중복됩니다'],
  ['The same literal repeated in many places must be changed everywhere at once; a named constant avoids divergence.', '여러 곳에 반복된 같은 리터럴은 한꺼번에 바꿔야 하므로, 이름 있는 상수로 어긋남을 막으세요.'],
  ['Define a constant and use it.', '상수를 정의해 사용하세요.'],
  {
    module(c, r) {
      const map = new Map();
      for (const n of c.mod.allNodes) {
        if (n.type !== 'Constant' || n.kind !== 'str' || n.inFString) continue;
        const v = n.value;
        if (v.length < 5 || /^\s*$/.test(v) || !/\s|[^\w]/.test(v) && v.length < 10) continue;
        if (/^[\w.]+$/.test(v) && !/\s/.test(v)) continue; // identifiers / keys / dotted names
        const p = n.parent;
        if (!p) continue;
        if (p.type === 'Expr') continue; // docstrings
        if (p.type === 'keyword' || (p.type === 'Call' && p.func.type === 'Attribute' && /^(?:get|pop|setdefault|getattr|hasattr|startswith|endswith)$/.test(p.func.attr))) continue;
        if (p.type === 'Subscript' || p.type === 'Compare' || p.type === 'Dict' || U.insideTypeContext(n)) continue;
        if (!map.has(v)) map.set(v, []);
        map.get(v).push(n);
      }
      for (const [v, list] of map) {
        if (list.length < 3) continue;
        // NAME = "literal" already defines the constant: point at a repeated
        // use and name the constant instead of asking for a new one.
        const def = list.find((x) => x.parent.type === 'Assign' && x.parent.value === x && x.parent.targets.length === 1
          && x.parent.targets[0].type === 'Name' && /^_*[A-Z][A-Z0-9_]*$/.test(x.parent.targets[0].id));
        if (def) {
          const name = def.parent.targets[0].id;
          const uses = list.filter((x) => x !== def);
          r.report(uses[0], `Use the constant '${name}' instead of repeating the literal "${short(v, 40)}" ${uses.length} more times.`, `리터럴 "${short(v, 40)}"를 ${uses.length}번 더 반복하지 말고 상수 '${name}'를 쓰세요.`,
            { events: uses.slice(1, 10).map((x) => ({ line: x.line, tag: 'path', text: { en: 'duplicate', ko: '중복' }, main: false })) });
          continue;
        }
        const first = list[0];
        r.report(first, `Define a constant instead of duplicating the literal "${short(v, 40)}" ${list.length} times.`, `리터럴 "${short(v, 40)}"를 ${list.length}번 중복하지 말고 상수를 정의하세요.`,
          { events: list.slice(1, 10).map((x) => ({ line: x.line, tag: 'path', text: { en: 'duplicate', ko: '중복' }, main: false })) });
      }
    },
  });

// line of the ':' that ends the header of the block whose first statement is `first`
function headerLine(c, first) {
  let line = first.line;
  for (const t of c.tokens) {
    if (t.line > first.line || (t.line === first.line && t.col >= first.col)) break;
    if (t.t === 'OP' && t.v === ':') line = t.line;
  }
  return line;
}

// a comment inside the block (own-line comments or trailing ones on its
// statements); a trailing comment on the header line itself does not count
function blockHasComment(c, body) {
  if (!body.length) return false;
  const hl = headerLine(c, body[0]);
  const last = body[body.length - 1];
  const end = last.endLine || last.line;
  const oneLiner = body[0].line === hl;
  for (const cm of c.comments) if ((cm.line > hl || (oneLiner && cm.line === hl)) && cm.line <= end) return true;
  return false;
}

// keyword token ('else') that introduces `first`'s block
function blockKeyword(c, first, kw) {
  let tok = null;
  for (const t of c.tokens) {
    if (t.line > first.line || (t.line === first.line && t.col >= first.col)) break;
    if (t.t === 'NAME' && t.v === kw) tok = t;
  }
  return tok;
}

function inProtocolOrAbc(c, fn) {
  const cls = fn.info && fn.info.cls;
  if (!cls) return false;
  return cls.node.bases.some((b) => /(?:^|\.)(?:Protocol|ABC|ABCMeta|Interface)$/.test(dotted(b.type === 'Subscript' ? b.value : b) || '')) || cls.node.keywords.some((k) => k.arg === 'metaclass');
}

R('empty-function', 'S', 'CR', 5, ['suspicious'], 'S1186',
  ['Function body is empty', '함수 본문이 비어 있습니다'],
  ['An empty function without a comment leaves readers guessing whether it is unfinished, intentionally a no-op or should raise.', '주석 없는 빈 함수는 미완성인지, 의도적으로 아무것도 안 하는지, 예외를 던져야 하는지 알 수 없게 합니다.'],
  ['Add a comment explaining why it is empty, implement it, or raise NotImplementedError.', '왜 비었는지 주석을 달거나 구현하거나 NotImplementedError를 던지세요.'],
  {
    on: {
      'FunctionDef|AsyncFunctionDef'(n, c, r) {
        if (c.isStub) return;
        if (!(n.body.length === 1 && n.body[0].type === 'Pass')) return;
        if (n.decorator_list.length || DUNDER.test(n.name) || (n.info && (n.info.conditional || (n.info.cls && n.info.cls.conditional)))) return;
        if (n.parent && (n.parent.type === 'If' || n.parent.type === 'Try' || n.parent.type === 'ExceptHandler')) return;
        if (blockHasComment(c, n.body)) return;
        if (inProtocolOrAbc(c, n)) return;
        // an overriding no-op in a subclass of an imported class is usually intentional
        const cls = n.info && n.info.cls;
        if (cls && cls.node.bases.length && cls.bases(c.project).some((b) => b.unknown)) return;
        r.report(n, `Add a comment explaining why '${n.name}' is empty, or complete it.`, `'${n.name}'가 왜 비었는지 주석을 달거나 구현하세요.`);
      },
    },
  });

R('empty-block', 'S', 'MA', 5, ['suspicious'], 'S108',
  ['Empty block of code', '빈 코드 블록'],
  ['A block that only contains pass (and no comment) is unfinished code or a branch that can be removed.', 'pass만 있고 주석 없는 블록은 미완성 코드이거나 지워도 되는 분기입니다.'],
  ['Remove the block, invert the condition, or add a comment.', '블록을 지우거나 조건을 뒤집거나 주석을 다세요.'],
  {
    on: {
      'If|For|AsyncFor|While|With|AsyncWith'(n, c, r) {
        // reported on the keyword that opens the block (if / while / else ...)
        const check = (body, at) => {
          if (body.length === 1 && body[0].type === 'Pass' && !blockHasComment(c, body)) {
            r.report(at, 'Either remove or fill this block of code.', '이 코드 블록을 지우거나 채우세요.');
          }
        };
        check(n.body, { line: n.line, col: n.col, endLine: n.line, endCol: n.col + 2 });
        if ((n.type === 'If' || n.type === 'For' || n.type === 'AsyncFor' || n.type === 'While') && n.orelse.length === 1 && n.orelse[0].type === 'Pass') {
          const kw = blockKeyword(c, n.orelse[0], 'else');
          check(n.orelse, kw ? { line: kw.line, col: kw.col, endLine: kw.line, endCol: kw.endCol } : n.orelse[0]);
        }
      },
    },
  });

R('redundant-parentheses', 'S', 'MI', 1, ['clumsy'], 'S1110',
  ['Redundant pair of parentheses', '중복된 괄호 쌍'],
  ['Double parentheses around an expression add noise without changing anything.', '식을 두 겹 괄호로 감싸면 아무것도 바뀌지 않고 잡음만 늘어납니다.'],
  ['Remove the extra pair.', '여분의 괄호 쌍을 지우세요.'],
  {
    module(c, r) {
      const toks = c.tokens;
      for (let i = 0; i + 1 < toks.length; i++) {
        const a = toks[i];
        const b = toks[i + 1];
        if (a.t !== 'OP' || a.v !== '(' || b.t !== 'OP' || b.v !== '(') continue;
        // ignore call/def parentheses: '(' preceded by a name or ')' / ']'
        const pv = toks[i - 1];
        if (pv && ((pv.t === 'NAME' && !/^(?:and|or|not|in|is|if|elif|while|return|yield|assert|else|lambda|await|for|del|raise|with|from|import)$/.test(pv.v)) || (pv.t === 'OP' && (pv.v === ')' || pv.v === ']' || pv.v === '}')) || pv.t === 'STRING')) continue;
        // find closers
        let depth = 0;
        let close1 = -1;
        for (let j = i + 1; j < toks.length; j++) {
          const t = toks[j];
          if (t.t === 'OP' && (t.v === '(' || t.v === '[' || t.v === '{')) depth++;
          else if (t.t === 'OP' && (t.v === ')' || t.v === ']' || t.v === '}')) { depth--; if (depth === 0) { close1 = j; break; } }
        }
        if (close1 < 0) continue;
        const nxt = toks[close1 + 1];
        if (!nxt || nxt.t !== 'OP' || nxt.v !== ')') continue;
        // inner group must not be a tuple / generator (it is when it contains a top-level comma or 'for')
        let d = 0;
        let tupleish = false;
        for (let j = i + 2; j < close1; j++) {
          const t = toks[j];
          if (t.t === 'OP' && (t.v === '(' || t.v === '[' || t.v === '{')) d++;
          else if (t.t === 'OP' && (t.v === ')' || t.v === ']' || t.v === '}')) d--;
          else if (d === 0 && ((t.t === 'OP' && t.v === ',') || (t.t === 'NAME' && (t.v === 'for' || t.v === 'yield')))) tupleish = true;
        }
        if (tupleish || close1 === i + 2) continue;
        r.report({ line: a.line, col: a.col, endLine: nxt.line, endCol: nxt.endCol }, 'Remove these redundant parentheses.', '이 중복된 괄호를 지우세요.');
      }
    },
  });

R('keyword-parentheses', 'S', 'MI', 1, ['convention'], 'S1721',
  ['Parentheses after a keyword', '키워드 뒤에 괄호를 씁니다'],
  ['if, while, return, not, assert, del... are statements or operators, not functions; parentheses around their whole argument are noise.', 'if, while, return, not, assert, del 등은 함수가 아니라 문장이나 연산자이므로 인자 전체를 감싼 괄호는 잡음입니다.'],
  ['Remove the parentheses.', '괄호를 지우세요.'],
  {
    on: {
      'If|While|Return|Assert|Delete|UnaryOp|For'(n, c, r) {
        let e = null;
        let kw = null;
        if (n.type === 'If' || n.type === 'While') { e = n.test; kw = n.type === 'If' ? (n.isElif ? 'elif' : 'if') : 'while'; } else if (n.type === 'Return') { e = n.value; kw = 'return'; } else if (n.type === 'Assert') { e = n.test; kw = 'assert'; } else if (n.type === 'UnaryOp' && n.op === 'Not') { e = n.operand; kw = 'not'; } else if (n.type === 'Delete' && n.targets.length === 1) { e = n.targets[0]; kw = 'del'; } else if (n.type === 'For') { e = n.iter; kw = 'in'; }
        if (!e || !e.parenthesized || e.type === 'Tuple' || e.type === 'GeneratorExp' || e.type === 'Yield' || e.type === 'NamedExpr') return;
        if (e.endLine !== e.line || e.parenLine !== e.line) return; // parentheses used for line continuation
        if (kw === 'not' && (e.type === 'BoolOp' || e.type === 'Compare' || e.type === 'BinOp' || e.type === 'IfExp')) return;
        if (kw === 'return' && (e.type === 'BoolOp' || e.type === 'IfExp' || e.type === 'BinOp' || e.type === 'Compare')) return;
        const kwTok = n.type === 'UnaryOp' ? n : n;
        if (n.type === 'For') return; // the iterable may legitimately be wrapped
        r.report({ line: kwTok.line, col: kwTok.col, endLine: kwTok.line, endCol: kwTok.col + kw.length }, `Remove the parentheses after '${kw}'.`, `'${kw}' 뒤의 괄호를 지우세요.`);
      },
    },
  });

R('boolean-literal-redundant', 'S', 'MI', 2, ['clumsy'], 'S1125',
  ['Redundant boolean literal', '불필요한 불리언 리터럴'],
  ['Comparing with True/False, "True if c else False" or combining with a boolean literal adds nothing.', 'True/False와 비교하거나 "True if c else False", 불리언 리터럴과 묶는 것은 의미가 없습니다.'],
  ['Use the condition directly (or bool(c), not c).', '조건을 바로 쓰세요(또는 bool(c), not c).'],
  {
    on: {
      Compare(n, c, r) {
        if (n.ops.length !== 1 || (n.ops[0] !== 'Eq' && n.ops[0] !== 'NotEq')) return;
        if (isBoolConst(n.left) || isBoolConst(n.comparators[0])) r.report(n, 'Remove the comparison to a boolean literal.', '불리언 리터럴과의 비교를 지우세요.');
      },
      IfExp(n, c, r) {
        if ((isTrue(n.body) && isFalse(n.orelse)) || (isFalse(n.body) && isTrue(n.orelse))) r.report(n, `Replace this conditional expression with '${isTrue(n.body) ? 'bool(...)' : 'not ...'}'.`, `이 조건식을 '${isTrue(n.body) ? 'bool(...)' : 'not ...'}'로 바꾸세요.`);
      },
      BoolOp(n, c, r) {
        const lit = n.values.find((v) => isBoolConst(v));
        if (lit && n.values.indexOf(lit) !== n.values.length - 1) r.report(lit, 'Remove this boolean literal from the expression.', '식에서 이 불리언 리터럴을 지우세요.');
      },
      UnaryOp(n, c, r) {
        if (n.op === 'Not' && isBoolConst(n.operand)) r.report(n, `Replace 'not ${n.operand.value ? 'True' : 'False'}' with '${n.operand.value ? 'False' : 'True'}'.`, `'not ${n.operand.value ? 'True' : 'False'}'를 '${n.operand.value ? 'False' : 'True'}'로 바꾸세요.`);
      },
    },
  });

R('return-boolean-directly', 'S', 'MI', 2, ['clumsy'], 'S1126',
  ['if/else returns boolean literals', 'if/else가 불리언 리터럴을 반환합니다'],
  ['"if c: return True else: return False" is a long way to write "return c".', '"if c: return True else: return False"는 "return c"를 길게 쓴 것입니다.'],
  ['Return the condition (wrapped in bool() if needed).', '조건을 반환하세요(필요하면 bool()로 감싸서).'],
  {
    on: {
      If(n, c, r) {
        if (n.isElif || n.body.length !== 1 || n.body[0].type !== 'Return' || !isBoolConst(n.body[0].value)) return;
        let other = null;
        if (n.orelse.length === 1 && n.orelse[0].type === 'Return') other = n.orelse[0];
        else if (!n.orelse.length && n.parent && Array.isArray(n.parent.body)) {
          const list = n.parent.body.includes(n) ? n.parent.body : n.parent.orelse && n.parent.orelse.includes(n) ? n.parent.orelse : null;
          if (list) { const nx = list[list.indexOf(n) + 1]; if (nx && nx.type === 'Return') other = nx; }
        }
        if (!other || !isBoolConst(other.value) || other.value.value === n.body[0].value.value) return;
        r.report(n, 'Return the condition directly instead of boolean literals.', '불리언 리터럴 대신 조건을 바로 반환하세요.');
      },
    },
  });

R('inverted-boolean-check', 'S', 'MI', 2, ['clumsy'], 'S1940',
  ['Inverted comparison', '뒤집힌 비교'],
  ['"not a == b" or "not x in y" reads worse than the opposite operator ("a != b", "x not in y").', '"not a == b"나 "not x in y"는 반대 연산자("a != b", "x not in y")보다 읽기 어렵습니다.'],
  ['Use the opposite operator.', '반대 연산자를 쓰세요.'],
  {
    on: {
      UnaryOp(n, c, r) {
        // "not (a == b)" is the same inversion as "not a == b"; chained comparisons have no single opposite
        if (n.op !== 'Not' || n.operand.type !== 'Compare' || n.operand.ops.length !== 1) return;
        const inv = { Eq: '!=', NotEq: '==', Lt: '>=', LtE: '>', Gt: '<=', GtE: '<', In: 'not in', NotIn: 'in', Is: 'is not', IsNot: 'is' }[n.operand.ops[0]];
        if (inv) r.report(n, `Use the opposite operator ('${inv}') instead of 'not'.`, `'not' 대신 반대 연산자('${inv}')를 쓰세요.`);
      },
    },
  });

R('nested-conditional-expression', 'S', 'MA', 5, ['confusing'], 'S3358',
  ['Nested conditional expressions', '중첩된 조건식'],
  ['A conditional expression inside another one is hard to read.', '조건식 안의 조건식은 읽기 어렵습니다.'],
  ['Use an if/elif statement or a helper.', 'if/elif 문이나 도우미 함수를 쓰세요.'],
  {
    on: {
      IfExp(n, c, r) {
        if (n.parent && n.parent.type === 'IfExp') return;
        const inner = [n.body, n.orelse, n.test].find((x) => x.type === 'IfExp');
        if (inner) r.report(inner, 'Extract this nested conditional expression into an independent statement.', '이 중첩 조건식을 별도 문장으로 추출하세요.');
      },
    },
  });

R('redundant-jump', 'S', 'MI', 1, ['clumsy'], 'S3626',
  ['Redundant return or continue', '불필요한 return 또는 continue'],
  ['A bare return at the end of a function, or continue at the end of a loop body, does nothing.', '함수 끝의 값 없는 return이나 반복 본문 끝의 continue는 아무 일도 하지 않습니다.'],
  ['Remove the statement.', '문장을 지우세요.'],
  {
    on: {
      'FunctionDef|AsyncFunctionDef'(n, c, r) {
        const last = n.body[n.body.length - 1];
        if (last && last.type === 'Return' && !last.value && n.body.length > 1) r.report(last, "Remove this redundant 'return'.", "이 불필요한 'return'을 지우세요.");
      },
      'For|AsyncFor|While'(n, c, r) {
        const last = n.body[n.body.length - 1];
        if (last && last.type === 'Continue' && n.body.length > 1) r.report(last, "Remove this redundant 'continue'.", "이 불필요한 'continue'를 지우세요.");
      },
    },
  });

R('identical-functions', 'S', 'MA', 15, ['confusing', 'duplicate'], 'S4144',
  ['Functions with identical implementations', '구현이 같은 함수들'],
  ['Two functions with the same body are duplicated code; the next change may be applied to only one of them.', '본문이 같은 두 함수는 중복 코드이며, 다음 변경이 한쪽에만 적용될 수 있습니다.'],
  ['Make one function call the other, or merge them.', '한 함수가 다른 함수를 호출하게 하거나 합치세요.'],
  {
    module(c, r) {
      const groups = new Map();
      for (const fi of c.mod.allFunctions) {
        const n = fi.node;
        const body = U.bodyNoDoc(n.body);
        let count = 0;
        walkLocal({ type: 'Module', body }, (m) => { if (/^(?:Assign|AugAssign|AnnAssign|Expr|Return|If|For|While|Try|With|Raise|Delete)$/.test(m.type)) count++; return true; });
        if (count < 3) continue;
        const key = `${fi.cls ? fi.cls.name : ''}|${body.length}|${body.map((s) => s.type).join(',')}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(fi);
      }
      for (const list of groups.values()) {
        for (let i = 1; i < list.length; i++) {
          for (let j = 0; j < i; j++) {
            const a = list[j].node;
            const b = list[i].node;
            if (a.name === b.name) continue;
            if (!same(a.args, b.args)) continue;
            if (!sameList(U.bodyNoDoc(a.body), U.bodyNoDoc(b.body))) continue;
            r.report(b, `'${b.name}' has the same implementation as '${a.name}' on line ${a.nameLine}.`, `'${b.name}'의 구현이 ${a.nameLine}행의 '${a.name}'과 같습니다.`, { events: [{ line: a.nameLine, tag: 'path', text: { en: 'original implementation', ko: '원래 구현' }, main: false }] });
            break;
          }
        }
      }
    },
  });

R('unnecessary-pass', 'S', 'MI', 1, ['clumsy'], 'S2772',
  ['Unnecessary pass statement', '불필요한 pass 문'],
  ['pass is only needed in an otherwise empty block; next to other statements (or a docstring) it is noise.', 'pass는 비어 있는 블록에만 필요하고, 다른 문장(또는 docstring) 옆에서는 잡음입니다.'],
  ['Remove the pass.', 'pass를 지우세요.'],
  {
    on: {
      Pass(n, c, r) {
        const p = n.parent;
        if (!p) return;
        for (const key of ['body', 'orelse', 'finalbody']) {
          const list = p[key];
          if (Array.isArray(list) && list.includes(n) && list.length > 1) { r.report(n, "Remove this unneeded 'pass'.", "이 불필요한 'pass'를 지우세요."); return; }
        }
      },
    },
  });

R('unnecessary-comprehension', 'S', 'MI', 2, ['clumsy'], 'S7500',
  ['Comprehension that only copies its input', '입력을 복사하기만 하는 컴프리헨션'],
  ['[x for x in items] is a slower, longer list(items) (likewise set() and dict()).', '[x for x in items]는 list(items)를 느리고 길게 쓴 것입니다(set(), dict()도 같음).'],
  ['Use list(), set() or dict() on the iterable.', '반복 가능한 객체에 list(), set(), dict()를 쓰세요.'],
  {
    on: {
      'ListComp|SetComp|DictComp'(n, c, r) {
        if (n.generators.length !== 1) return;
        const g = n.generators[0];
        if (g.ifs.length || g.is_async) return;
        let ok = false;
        if (n.type === 'DictComp') ok = g.target.type === 'Tuple' && g.target.elts.length === 2 && same(n.key, g.target.elts[0]) && same(n.value, g.target.elts[1]);
        else ok = same(n.elt, g.target) && (g.target.type === 'Name' || g.target.type === 'Tuple');
        if (!ok) return;
        const ctor = n.type === 'ListComp' ? 'list' : n.type === 'SetComp' ? 'set' : 'dict';
        r.report(n, `Replace this comprehension with ${ctor}(${short(c.slice(g.iter), 30)}).`, `이 컴프리헨션을 ${ctor}(${short(c.slice(g.iter), 30)})로 바꾸세요.`);
      },
    },
  });

R('literal-constructor', 'S', 'MI', 1, ['clumsy'], 'S7498',
  ['Empty collection created with a constructor call', '생성자 호출로 빈 컬렉션을 만듭니다'],
  ['dict(), list() and tuple() without arguments are slower and longer than {}, [] and ().', '인자 없는 dict(), list(), tuple()은 {}, [], ()보다 느리고 깁니다.'],
  ['Use the literal.', '리터럴을 쓰세요.'],
  {
    on: {
      Call(n, c, r) {
        const f = n.func;
        if (f.type !== 'Name' || f.sym !== BUILTIN || n.args.length) return;
        if (!['dict', 'list', 'tuple'].includes(f.id)) return;
        if (f.id === 'dict' && n.keywords.length && n.keywords.some((k) => !k.arg)) return;
        if (f.id !== 'dict' && n.keywords.length) return;
        const lit = { dict: '{}', list: '[]', tuple: '()' }[f.id];
        if (f.id === 'dict' && n.keywords.length) { r.report(n, 'Use a dict literal instead of dict() with keyword arguments.', '키워드 인자를 쓴 dict() 대신 dict 리터럴을 쓰세요.'); return; }
        r.report(n, `Replace '${f.id}()' with '${lit}'.`, `'${f.id}()'를 '${lit}'로 바꾸세요.`);
      },
    },
  });

R('defaultdict-lambda', 'S', 'MI', 1, ['clumsy'], 'S7507',
  ['defaultdict built with a lambda returning a literal', '리터럴을 반환하는 람다로 defaultdict를 만듭니다'],
  ['defaultdict(lambda: []) is a roundabout defaultdict(list) (likewise dict, set, int).', 'defaultdict(lambda: [])는 defaultdict(list)를 돌려 쓴 것입니다(dict, set, int도 같음).'],
  ['Pass the type directly.', '타입을 바로 넘기세요.'],
  {
    on: {
      Call(n, c, r) {
        const q = c.q(n.func) || dotted(n.func) || '';
        if (!/(?:^|\.)defaultdict$/.test(q) || !n.args[0] || n.args[0].type !== 'Lambda') return;
        const b = n.args[0].body;
        let t = null;
        if (b.type === 'List' && !b.elts.length) t = 'list';
        else if (b.type === 'Dict' && !b.keys.length) t = 'dict';
        else if (b.type === 'Constant' && b.kind === 'int' && b.value === 0) t = 'int';
        else if (b.type === 'Constant' && b.kind === 'float' && b.value === 0) t = 'float';
        else if (b.type === 'Constant' && b.kind === 'str' && b.value === '') t = 'str';
        else if (b.type === 'Call' && b.func.type === 'Name' && b.func.sym === BUILTIN && ['list', 'dict', 'set', 'int', 'str', 'float'].includes(b.func.id) && !b.args.length) t = b.func.id;
        if (t) r.report(n.args[0], `Replace this lambda with '${t}'.`, `이 람다를 '${t}'로 바꾸세요.`);
      },
    },
  });

R('redundant-collection-call', 'S', 'MI', 1, ['clumsy'], 'S7508',
  ['Redundant collection conversion', '불필요한 컬렉션 변환'],
  ['sorted(list(x)), list(sorted(x)), set(list(x)) and similar wrap a conversion that the outer call already performs.', 'sorted(list(x)), list(sorted(x)), set(list(x)) 등은 바깥 호출이 이미 하는 변환을 한 번 더 합니다.'],
  ['Remove the inner call.', '안쪽 호출을 지우세요.'],
  {
    on: {
      Call(n, c, r) {
        const f = n.func;
        // sorted() keeps its key= / reverse= options: sorted(list(x), key=f) is still redundant
        if (f.type !== 'Name' || f.sym !== BUILTIN || n.args.length !== 1 || (n.keywords.length && f.id !== 'sorted')) return;
        const a = n.args[0];
        if (a.type !== 'Call' || a.func.type !== 'Name' || a.func.sym !== BUILTIN || a.args.length !== 1) return;
        if (f.id === 'sorted' && n.keywords.length && a.func.id === 'sorted') return; // re-sorting with other options
        const outer = f.id;
        const inner = a.func.id;
        const redundant = (['sorted', 'set', 'list', 'tuple', 'frozenset', 'iter', 'reversed'].includes(outer) && ['list', 'tuple'].includes(inner) && !(outer === 'reversed' && inner === 'tuple') && !a.keywords.length)
          || (outer === 'list' && inner === 'sorted') || (outer === inner && ['list', 'tuple', 'set', 'sorted'].includes(outer) && !a.keywords.length);
        if (outer === 'reversed') return;
        if (redundant) r.report(a, `Remove the redundant '${inner}()' call inside '${outer}()'.`, `'${outer}()' 안의 불필요한 '${inner}()' 호출을 지우세요.`);
      },
    },
  });

R('min-max-via-sorted', 'S', 'MI', 2, ['performance'], 'S7510',
  ['sorted() used to get the smallest or largest item', 'sorted()로 최솟값이나 최댓값을 구합니다'],
  ['sorted(x)[0] sorts the whole collection (O(n log n)) just to read one item; min(x) is O(n).', 'sorted(x)[0]은 값 하나를 읽으려고 전체를 정렬(O(n log n))합니다. min(x)는 O(n)입니다.'],
  ['Use min() or max().', 'min()이나 max()를 쓰세요.'],
  {
    on: {
      Subscript(n, c, r) {
        const v = n.value;
        if (v.type !== 'Call' || !U.isBuiltinName(v.func, 'sorted') || v.args.length !== 1) return;
        const idx = require('../ast').numValue(n.slice);
        if (idx !== 0 && idx !== -1) return;
        const rev = v.keywords.some((k) => k.arg === 'reverse' && isTrue(k.value));
        const fnName = (idx === 0) !== rev ? 'min' : 'max';
        r.report(n, `Use '${fnName}()' instead of sorting to get one item.`, `값 하나를 얻으려고 정렬하지 말고 '${fnName}()'를 쓰세요.`);
      },
    },
  });

R('reversed-sorted', 'S', 'MI', 1, ['clumsy'], 'S7511',
  ['reversed(sorted(...))', 'reversed(sorted(...))를 씁니다'],
  ['sorted() takes reverse=True; wrapping it in reversed() is slower and less clear.', 'sorted()는 reverse=True를 받으므로 reversed()로 감싸면 느리고 덜 명확합니다.'],
  ['Use sorted(..., reverse=True).', 'sorted(..., reverse=True)를 쓰세요.'],
  {
    on: {
      Call(n, c, r) {
        if (U.isBuiltinName(n.func, 'reversed') && n.args.length === 1 && n.args[0].type === 'Call' && U.isBuiltinName(n.args[0].func, 'sorted')) r.report(n, "Use 'sorted(..., reverse=True)' instead of 'reversed(sorted(...))'.", "'reversed(sorted(...))' 대신 'sorted(..., reverse=True)'를 쓰세요.");
      },
    },
  });

R('dict-keys-iteration', 'S', 'MI', 1, ['clumsy'], 'S7512',
  ['Iterating or testing membership over dict.keys()', 'dict.keys()를 반복하거나 포함 검사합니다'],
  ['A dict iterates over its keys and supports "in" directly; .keys() adds nothing.', 'dict는 키를 바로 반복하고 "in"을 지원하므로 .keys()는 필요 없습니다.'],
  ['Drop the .keys() call.', '.keys() 호출을 빼세요.'],
  {
    on: {
      'For|comprehension'(n, c, r) {
        const it = n.iter;
        if (it.type === 'Call' && it.func.type === 'Attribute' && it.func.attr === 'keys' && !it.args.length && !it.keywords.length && isDictLike(c, it.func.value)) r.report(it, "Iterate over the dict directly instead of calling '.keys()'.", "'.keys()'를 부르지 말고 dict를 바로 반복하세요.");
      },
      Compare(n, c, r) {
        n.ops.forEach((op, i) => {
          if (op !== 'In' && op !== 'NotIn') return;
          const it = n.comparators[i];
          if (it.type === 'Call' && it.func.type === 'Attribute' && it.func.attr === 'keys' && !it.args.length && isDictLike(c, it.func.value)) r.report(it, "Test membership on the dict directly instead of '.keys()'.", "'.keys()' 대신 dict에 바로 포함 검사를 하세요.");
        });
      },
    },
  });
function isDictLike(c, e) {
  const t = c.type(e);
  if (t && t.k === 'inst' && !t.cls) return t.name === 'dict';
  return !t && (e.type === 'Name' || e.type === 'Attribute');
}

R('dict-fromkeys-comprehension', 'S', 'MI', 1, ['clumsy'], 'S7506',
  ['Dict comprehension with a constant value', '값이 상수인 dict 컴프리헨션'],
  ['{k: 0 for k in keys} is dict.fromkeys(keys, 0).', '{k: 0 for k in keys}는 dict.fromkeys(keys, 0)입니다.'],
  ['Use dict.fromkeys().', 'dict.fromkeys()를 쓰세요.'],
  {
    on: {
      DictComp(n, c, r) {
        if (n.generators.length !== 1 || n.generators[0].ifs.length) return;
        const g = n.generators[0];
        if (!same(n.key, g.target) || g.target.type !== 'Name') return;
        const v = n.value;
        if (!(v.type === 'Constant' && ['int', 'float', 'str', 'bool', 'None', 'bytes'].includes(v.kind))) return;
        r.report(n, `Replace this comprehension with 'dict.fromkeys(${short(c.slice(g.iter), 25)}, ${short(c.slice(v), 10)})'.`, `이 컴프리헨션을 'dict.fromkeys(${short(c.slice(g.iter), 25)}, ${short(c.slice(v), 10)})'로 바꾸세요.`);
      },
    },
  });

R('unnecessary-lambda', 'S', 'MI', 1, ['clumsy'], null,
  ['Lambda that only forwards its arguments', '인자를 그대로 넘기기만 하는 람다'],
  ['lambda x: f(x) is just f with an extra call layer.', 'lambda x: f(x)는 호출 단계만 하나 더한 f입니다.'],
  ['Pass the function itself.', '함수 자체를 넘기세요.'],
  {
    on: {
      Lambda(n, c, r) {
        const a = n.args;
        if (a.posonlyargs.length || a.kwonlyargs.length || a.vararg || a.kwarg || a.defaults.length) return;
        const b = n.body;
        if (b.type !== 'Call' || b.keywords.length || b.args.length !== a.args.length || !a.args.length) return;
        for (let i = 0; i < b.args.length; i++) if (b.args[i].type !== 'Name' || b.args[i].id !== a.args[i].arg) return;
        const params = new Set(a.args.map((p) => p.arg));
        if (U.containsNode(b.func, (m) => m.type === 'Name' && params.has(m.id))) return;
        if (!(b.func.type === 'Name' || (b.func.type === 'Attribute' && isPure(b.func)))) return;
        if (b.func.type === 'Attribute') return; // bound-method lookup timing may matter
        r.report(n, `Replace this lambda with '${short(c.slice(b.func), 30)}'.`, `이 람다를 '${short(c.slice(b.func), 30)}'로 바꾸세요.`);
      },
    },
  });

const NOT_CODE = /^\s*(?:type:|noqa|pragma|pylint:|mypy:|pyright:|fmt:|isort:|nosec|nomcc|-\*-|!|TODO|FIXME|XXX|NOTE|HACK|https?:|\$|>>>|\.\.\.|=+$|-+$|#)/i;

R('commented-out-code', 'S', 'MA', 5, ['unused'], 'S125',
  ['Commented-out code', '주석 처리된 코드'],
  ['Dead code kept in comments distracts readers and rots; version control already keeps the history.', '주석에 남긴 죽은 코드는 독자를 산만하게 하고 낡아 갑니다. 이력은 버전 관리가 이미 보관합니다.'],
  ['Remove the commented-out code.', '주석 처리된 코드를 지우세요.'],
  {
    module(c, r) {
      const cms = c.comments.filter((cm) => {
        const t = cm.text.replace(/^#+/, '');
        return t.trim() && !NOT_CODE.test(t) && !/[가-힣]/.test(t);
      });
      // group consecutive comment lines at the same column
      const groups = [];
      for (const cm of cms) {
        const g = groups[groups.length - 1];
        const lineText = c.lines[cm.line - 1] || '';
        const own = lineText.slice(0, cm.col).trim() === '';
        if (!own) continue;
        if (g && g.last === cm.line - 1 && g.col === cm.col) { g.items.push(cm); g.last = cm.line; } else groups.push({ items: [cm], last: cm.line, col: cm.col });
      }
      for (const g of groups) {
        const texts = g.items.map((cm) => cm.text.replace(/^#\s?/, ''));
        const code = dedent(texts).join('\n');
        if (!/[(=:\[]|^\s*(?:import|from|return|raise|pass|break|continue)\b/m.test(code)) continue;
        if (/[.?!]\s*$/.test(code.trim()) && !/\)\s*$/.test(code.trim())) continue;
        const words = code.split(/\s+/).filter((w) => /^[A-Za-z]{2,}$/.test(w));
        if (words.length > 6 && !/[=(]/.test(code)) continue;
        let parsed;
        try { parsed = parse(code + '\n'); } catch { continue; }
        if (parsed.errors.length || !parsed.module.body.length) continue;
        const body = parsed.module.body;
        const interesting = body.some((s) => s.type !== 'Expr' || (s.value.type === 'Call' && !/^[A-Z]/.test(code.trim())) );
        if (!interesting) continue;
        // natural-language false friends: "Note: ..." style annotations parse as AnnAssign
        if (body.every((s) => s.type === 'AnnAssign' && !s.value)) continue;
        if (body.length === 1 && body[0].type === 'Expr' && body[0].value.type === 'Call' && body[0].value.func.type === 'Name' && /^[a-z]+$/.test(body[0].value.func.id) && /\s/.test(c.slice ? '' : '')) continue;
        r.report({ line: g.items[0].line, col: g.items[0].col, endLine: g.last, endCol: 0 }, 'Remove this commented-out code.', '이 주석 처리된 코드를 지우세요.');
      }
    },
  });
function dedent(lines) {
  const ind = Math.min(...lines.filter((l) => l.trim()).map((l) => /^ */.exec(l)[0].length));
  return lines.map((l) => l.slice(Number.isFinite(ind) ? ind : 0));
}

// ── naming ──────────────────────────────────────────────────
const SNAKE = /^_{0,2}[a-z][a-z0-9_]*_{0,2}$|^_+$/;
const DUNDER = /^__\w+__$/;

// A base anywhere up the project's own hierarchy is foreign (class ToolButton(
// PaintedButton) where PaintedButton(QWidget): paintEvent overrides Qt).
function classHasForeignBase(c, cls, seen = new Set()) {
  if (!cls || seen.has(cls)) return false;
  seen.add(cls);
  return cls.bases(c.project).some((b) => b.unknown || (b.builtin && b.builtin !== 'object') || (b.cls && classHasForeignBase(c, b.cls, seen)));
}

R('function-naming', 'S', 'MI', 5, ['convention', 'pep8'], 'S1542',
  ['Function name does not follow snake_case', '함수 이름이 snake_case가 아닙니다'],
  ['PEP 8 names functions in lowercase with underscores; consistent naming makes code predictable.', 'PEP 8은 함수 이름을 소문자와 밑줄로 짓습니다. 일관된 이름은 코드를 예측 가능하게 합니다.'],
  ['Rename the function to snake_case.', '함수 이름을 snake_case로 바꾸세요.'],
  {
    on: {
      'FunctionDef|AsyncFunctionDef'(n, c, r) {
        if (SNAKE.test(n.name) || DUNDER.test(n.name)) return;
        const cls = n.info && n.info.cls;
        if (cls) return; // method-naming
        if (n.decorator_list.length) return;
        r.report(n, `Rename function '${n.name}' to match snake_case.`, `함수 '${n.name}'의 이름을 snake_case로 바꾸세요.`);
      },
    },
  });

R('method-naming', 'S', 'MI', 5, ['convention', 'pep8'], 'S100',
  ['Method name does not follow snake_case', '메서드 이름이 snake_case가 아닙니다'],
  ['PEP 8 names methods in lowercase with underscores.', 'PEP 8은 메서드 이름을 소문자와 밑줄로 짓습니다.'],
  ['Rename the method to snake_case.', '메서드 이름을 snake_case로 바꾸세요.'],
  {
    on: {
      'FunctionDef|AsyncFunctionDef'(n, c, r) {
        const cls = n.info && n.info.cls;
        if (!cls || SNAKE.test(n.name) || DUNDER.test(n.name)) return;
        // overriding an imported API (unittest setUp, Qt paintEvent, http do_GET...) keeps its name
        if (classHasForeignBase(c, cls) || n.decorator_list.length) return;
        if (/^(?:do_[A-Z]+|setUp|tearDown|setUpClass|tearDownClass|setUpModule|tearDownModule|asyncSetUp|asyncTearDown)$/.test(n.name)) return;
        r.report(n, `Rename method '${n.name}' to match snake_case.`, `메서드 '${n.name}'의 이름을 snake_case로 바꾸세요.`);
      },
    },
  });

R('class-naming', 'S', 'MI', 5, ['convention', 'pep8'], 'S101',
  ['Class name does not follow CapWords', '클래스 이름이 CapWords가 아닙니다'],
  ['PEP 8 names classes in CapWords; other styles make classes look like functions or variables.', 'PEP 8은 클래스 이름을 CapWords로 짓습니다. 다른 형식은 클래스를 함수나 변수처럼 보이게 합니다.'],
  ['Rename the class.', '클래스 이름을 바꾸세요.'],
  {
    on: {
      ClassDef(n, c, r) {
        if (/^_?(?:[A-Z_][a-zA-Z0-9]*|[a-z_][a-z0-9_]*)$/.test(n.name)) return;
        if (/^_*[a-z][a-z0-9_]*$/.test(n.name) && n.decorator_list.length) return;
        r.report(n, `Rename class '${n.name}' to match CapWords.`, `클래스 '${n.name}'의 이름을 CapWords로 바꾸세요.`);
      },
    },
  });

const LOCAL_OK = /^_{0,2}[a-z][a-z0-9_]*$|^_+$|^[A-Z][A-Z0-9_]*$|^[A-Z](?:_\w+)?$|^[A-Z][a-z]?[0-9]*$/;

R('variable-naming', 'S', 'MI', 2, ['convention', 'pep8'], 'S117',
  ['Local variable or parameter name does not follow snake_case', '지역 변수나 매개변수 이름이 snake_case가 아닙니다'],
  ['PEP 8 names variables and parameters in lowercase with underscores; camelCase names stand out as foreign.', 'PEP 8은 변수와 매개변수 이름을 소문자와 밑줄로 짓습니다. camelCase 이름은 이질적으로 보입니다.'],
  ['Rename the variable to snake_case.', '변수 이름을 snake_case로 바꾸세요.'],
  {
    module(c, r) {
      for (const sc of c.mod.scopes.scopes) {
        if (sc.kind !== 'function' && sc.kind !== 'lambda') continue;
        const fn = sc.node;
        const cls = fn && fn.info && fn.info.cls;
        for (const sym of sc.symbols.values()) {
          if (LOCAL_OK.test(sym.name) || sym.isImport) continue;
          const b = sym.bindings[0];
          if (!b || b.kind === 'def' || b.kind === 'class' || b.kind === 'import' || b.kind === 'typeparam') continue;
          if (b.kind === 'param' && cls && classHasForeignBase(c, cls)) continue; // overriding a foreign signature
          if (b.kind === 'param' && fn.decorator_list && fn.decorator_list.length) continue;
          const node = b.node;
          r.report(node, `Rename ${b.kind === 'param' ? 'parameter' : 'local variable'} '${sym.name}' to match snake_case.`, `${b.kind === 'param' ? '매개변수' : '지역 변수'} '${sym.name}'의 이름을 snake_case로 바꾸세요.`);
        }
      }
    },
  });

R('field-naming', 'S', 'MI', 2, ['convention', 'pep8'], 'S116',
  ['Attribute name does not follow snake_case', '속성 이름이 snake_case가 아닙니다'],
  ['PEP 8 names instance attributes in lowercase with underscores.', 'PEP 8은 인스턴스 속성 이름을 소문자와 밑줄로 짓습니다.'],
  ['Rename the attribute.', '속성 이름을 바꾸세요.'],
  {
    module(c, r) {
      for (const cls of c.mod.allClasses) {
        if (classHasForeignBase(c, cls) || cls.decorators.length) continue;
        const seen = new Set();
        for (const m of cls.methods.values()) {
          walkLocal(m.node, (x) => {
            if (x.type === 'Attribute' && x.ctx === 'Store' && x.value.type === 'Name' && x.value.id === 'self' && !seen.has(x.attr)) {
              seen.add(x.attr);
              if (!LOCAL_OK.test(x.attr)) r.report(x, `Rename attribute '${x.attr}' to match snake_case.`, `속성 '${x.attr}'의 이름을 snake_case로 바꾸세요.`);
            }
            return true;
          });
        }
      }
    },
  });

R('module-naming', 'S', 'MI', 5, ['convention', 'pep8'], 'S1578',
  ['Module file name does not follow snake_case', '모듈 파일 이름이 snake_case가 아닙니다'],
  ['Module names become import names; PEP 8 asks for short lowercase names (hyphens even make the module unimportable).', '모듈 이름은 import 이름이 되며, PEP 8은 짧은 소문자 이름을 권합니다(하이픈은 import조차 못 하게 합니다).'],
  ['Rename the file.', '파일 이름을 바꾸세요.'],
  {
    module(c, r) {
      if (c.lineMap) return;
      const base = c.path.split('/').pop().replace(/\.pyi?$/, '');
      if (/^_{0,2}[a-z][a-z0-9_]*_{0,2}$/.test(base)) return;
      if (!c.mod.module.body.length) return;
      r.report({ line: 1, col: 0 }, `Rename module '${base}' to match snake_case.`, `모듈 '${base}'의 이름을 snake_case로 바꾸세요.`);
    },
  });

R('builtin-shadowing', 'S', 'MA', 5, ['pitfall'], 'S5806',
  ['Name shadows a builtin', '이름이 내장 이름을 가립니다'],
  ['Rebinding a builtin such as list, dict, id or input hides it for the rest of the scope and confuses readers.', 'list, dict, id, input 같은 내장 이름을 다시 묶으면 나머지 범위에서 가려지고 독자를 혼란스럽게 합니다.'],
  ['Rename the variable.', '변수 이름을 바꾸세요.'],
  {
    module(c, r) {
      const NAMES = new Set(['list', 'dict', 'str', 'id', 'type', 'input', 'len', 'max', 'min', 'sum', 'set', 'map', 'filter', 'object', 'bytes', 'hash',
        'iter', 'next', 'range', 'format', 'open', 'vars', 'dir', 'all', 'any', 'compile', 'exec', 'eval', 'print', 'sorted', 'tuple', 'zip', 'float',
        'int', 'bool', 'round', 'abs', 'chr', 'ord', 'hex', 'oct', 'bin', 'callable', 'super', 'property', 'slice', 'frozenset', 'reversed',
        'enumerate', 'isinstance', 'getattr', 'setattr', 'hasattr', 'pow', 'divmod', 'repr', 'complex', 'bytearray', 'memoryview', 'globals', 'locals', 'help', 'file']);
      for (const sc of c.mod.scopes.scopes) {
        if (sc.kind === 'class' || sc.kind === 'comprehension') continue;
        for (const sym of sc.symbols.values()) {
          if (!NAMES.has(sym.name)) continue;
          const b = sym.bindings.find((x) => x.kind !== 'param' && x.kind !== 'global' && x.kind !== 'del');
          if (!b || sym.bindings.some((x) => x.kind === 'param')) continue;
          if (b.kind === 'import' && b.node.asname == null && b.stmt.type === 'ImportFrom') { /* from x import open */ }
          r.report(b.node, `'${sym.name}' shadows a builtin.`, `'${sym.name}'가 내장 이름을 가립니다.`);
        }
      }
    },
  });

R('field-shadows-class-name', 'S', 'MA', 5, ['confusing'], 'S1700',
  ['Attribute has the same name as its class', '속성 이름이 클래스 이름과 같습니다'],
  ['An attribute named like its class is confusing (Foo.foo).', '클래스와 같은 이름의 속성은 혼란스럽습니다(Foo.foo).'],
  ['Rename the attribute.', '속성 이름을 바꾸세요.'],
  {
    module(c, r) {
      for (const cls of c.mod.allClasses) {
        const lname = cls.name.toLowerCase();
        for (const s of cls.node.body) {
          if (s.type === 'Assign' || s.type === 'AnnAssign') {
            for (const t of s.type === 'Assign' ? s.targets : [s.target]) for (const nm of targetNames(t)) if (nm.id.toLowerCase() === lname) r.report(nm, `Rename field '${nm.id}': it has the same name as class '${cls.name}'.`, `필드 '${nm.id}'의 이름을 바꾸세요. 클래스 '${cls.name}'와 이름이 같습니다.`);
          }
        }
      }
    },
  });

R('object-inheritance', 'S', 'IN', 1, ['python3', 'clumsy'], null,
  ['Explicit inheritance from object', 'object를 명시적으로 상속합니다'],
  ['In Python 3 every class already derives from object.', 'Python 3에서는 모든 클래스가 이미 object를 상속합니다.'],
  ['Remove "(object)".', '"(object)"를 지우세요.'],
  {
    on: {
      ClassDef(n, c, r) {
        const b = n.bases.find((x) => U.isBuiltinName(x, 'object'));
        if (b) r.report(b, `Remove the redundant 'object' base of '${n.name}'.`, `'${n.name}'의 불필요한 'object' 기반 클래스를 지우세요.`);
      },
    },
  });

R('super-old-style', 'S', 'MI', 1, ['python3', 'clumsy'], null,
  ['super() called with explicit arguments', 'super()를 명시적 인자로 호출합니다'],
  ['In Python 3 super() finds the class and instance itself; repeating them invites copy-paste errors.', 'Python 3의 super()는 클래스와 인스턴스를 스스로 찾으므로 반복하면 복사-붙여넣기 실수를 부릅니다.'],
  ['Call super() without arguments.', '인자 없이 super()를 호출하세요.'],
  {
    on: {
      Call(n, c, r) {
        if (!U.isBuiltinName(n.func, 'super') || n.args.length !== 2) return;
        const fn = U.enclosingFn(n);
        if (!fn || !FUNC_TYPES.has(fn.type) || !fn.info || !fn.info.cls) return;
        const first = fn.args.args[0];
        if (n.args[0].type === 'Name' && n.args[0].id === fn.info.cls.name && n.args[1].type === 'Name' && first && n.args[1].id === first.arg) r.report(n, 'Use super() without arguments.', '인자 없이 super()를 쓰세요.');
      },
    },
  });

const DUNDER_FN = { __len__: 'len', __str__: 'str', __repr__: 'repr', __iter__: 'iter', __next__: 'next', __hash__: 'hash', __bool__: 'bool', __int__: 'int', __float__: 'float', __abs__: 'abs', __contains__: 'in', __getitem__: '[]' };

R('unnecessary-dunder-call', 'S', 'MI', 2, ['clumsy'], null,
  ['Special method called directly', '특수 메서드를 직접 호출합니다'],
  ['x.__len__() bypasses the builtin protocol (len(x)) and reads poorly.', 'x.__len__()는 내장 프로토콜(len(x))을 우회하고 읽기 어렵습니다.'],
  ['Use the builtin function or operator.', '내장 함수나 연산자를 쓰세요.'],
  {
    on: {
      Call(n, c, r) {
        const f = n.func;
        if (f.type !== 'Attribute' || !DUNDER_FN[f.attr]) return;
        if (f.value.type === 'Call' && U.isBuiltinName(f.value.func, 'super')) return;
        if (f.value.type === 'Name' && /^[A-Z]/.test(f.value.id)) return; // Base.__len__(self)
        const fn = U.enclosingFn(n);
        if (fn && FUNC_TYPES.has(fn.type) && fn.name === f.attr) return;
        const alt = DUNDER_FN[f.attr];
        r.report(n, `Use ${alt === 'in' ? "the 'in' operator" : alt === '[]' ? 'subscription' : `'${alt}()'`} instead of calling '${f.attr}' directly.`, `'${f.attr}'를 직접 부르지 말고 ${alt === 'in' ? "'in' 연산자" : alt === '[]' ? '첨자' : `'${alt}()'`}를 쓰세요.`);
      },
    },
  });

R('redundant-cast', 'S', 'MI', 1, ['clumsy'], null,
  ['Literal converted to its own type', '리터럴을 자기 타입으로 변환합니다'],
  ['str("x"), int(5), list([..]) and similar convert a literal to the type it already has.', 'str("x"), int(5), list([..]) 등은 리터럴을 이미 가진 타입으로 변환합니다.'],
  ['Remove the conversion.', '변환을 지우세요.'],
  {
    on: {
      Call(n, c, r) {
        const f = n.func;
        if (f.type !== 'Name' || f.sym !== BUILTIN || n.args.length !== 1 || n.keywords.length) return;
        const a = n.args[0];
        const k = { str: (x) => (x.type === 'Constant' && x.kind === 'str') || x.type === 'JoinedStr', int: (x) => x.type === 'Constant' && x.kind === 'int', float: (x) => x.type === 'Constant' && x.kind === 'float', bool: (x) => isBoolConst(x), list: (x) => x.type === 'List' || x.type === 'ListComp', tuple: (x) => x.type === 'Tuple', dict: (x) => x.type === 'Dict' || x.type === 'DictComp', set: (x) => x.type === 'Set' || x.type === 'SetComp' }[f.id];
        if (k && k(a)) r.report(n, `Remove the redundant '${f.id}()' conversion.`, `불필요한 '${f.id}()' 변환을 지우세요.`);
      },
    },
  });

R('first-param-naming', 'S', 'CR', 5, ['convention', 'pep8'], 'S5720',
  ['First method parameter is not named self / cls', '메서드 첫 매개변수 이름이 self / cls가 아닙니다'],
  ['By convention the first parameter of an instance method is self and of a class method cls; other names mislead readers and tools.', '관례상 인스턴스 메서드의 첫 매개변수는 self, 클래스 메서드는 cls이며, 다른 이름은 독자와 도구를 헷갈리게 합니다.'],
  ['Rename the parameter.', '매개변수 이름을 바꾸세요.'],
  {
    on: {
      'FunctionDef|AsyncFunctionDef'(n, c, r) {
        const fi = n.info;
        if (!fi || !fi.cls) return;
        const first = n.args.posonlyargs[0] || n.args.args[0];
        if (!first) return;
        const cls = fi.cls;
        const meta = cls.node.bases.some((b) => U.isBuiltinName(b, 'type') || /(?:^|\.)\w*Meta\w*$/.test(dotted(b) || ''));
        if (fi.kind === 'staticmethod') return;
        if (n.sym && n.sym.uses.length) return; // helper used inside the class body (decorator factory)
        if (fi.decorators.some((d) => !/^(?:classmethod|property|abstractmethod|abc\.abstractmethod|override|typing\.override|functools\.cached_property|cached_property|\w+\.(?:setter|getter|deleter))$/.test(d))) return;
        const classLevel = fi.kind === 'classmethod' || n.name === '__new__' || n.name === '__init_subclass__' || n.name === '__class_getitem__';
        const isCls = classLevel || meta;
        // methods of a metaclass receive a class; 'self' is still accepted there, never in a classmethod
        const ok = isCls ? /^(?:cls|mcs|mcls|metacls|klass|_cls|cls_)$/.test(first.arg) || (!classLevel && first.arg === 'self') : /^(?:self|_self|self_|_)$/.test(first.arg);
        if (!ok) r.report(first, `Rename '${first.arg}' to '${isCls ? 'cls' : 'self'}'.`, `'${first.arg}'의 이름을 '${isCls ? 'cls' : 'self'}'로 바꾸세요.`);
      },
    },
  });

R('open-without-encoding', 'S', 'MI', 2, ['portability'], null,
  ['Text file opened without an explicit encoding', '인코딩 지정 없이 텍스트 파일을 엽니다'],
  ['Without encoding=, open() uses the locale encoding (cp949 / cp1252 on Windows), so the same file reads differently across machines.', 'encoding= 없이 open()은 로캘 인코딩(Windows에서는 cp949 / cp1252)을 써서 같은 파일이 컴퓨터마다 다르게 읽힙니다.'],
  ['Pass encoding="utf-8" (or the real encoding).', 'encoding="utf-8"(또는 실제 인코딩)을 넘기세요.'],
  {
    on: {
      Call(n, c, r) {
        const q = U.callName(c, n);
        if (q !== 'open' && q !== 'io.open') return;
        if (n.keywords.some((k) => k.arg === 'encoding' || k.arg === null) || n.args.length >= 4 || n.args.some((a) => a.type === 'Starred')) return;
        const m = require('../ast').arg(n, 1, 'mode');
        if (m) {
          const mode = U.strValue(m);
          if (mode == null || mode.includes('b')) return;
        }
        r.report(n, "Pass an explicit 'encoding' to open() for text files.", "텍스트 파일을 열 때 open()에 'encoding'을 명시하세요.");
      },
    },
  });

// ── error handling ──────────────────────────────────────────
function handlerReraises(h) {
  return U.containsLocal({ type: 'Module', body: h.body }, (m) => m.type === 'Raise' || (m.type === 'Call' && /^(?:sys\.exit|os\._exit|exit|quit)$/.test(dotted(m.func) || '')));
}

R('exception-swallowed', 'S', 'MA', 5, ['error-handling', 'cwe-390'], 'S2486',
  ['Exception caught and ignored', '예외를 잡고 무시합니다'],
  ['An except block that only passes hides failures, making bugs silent and hard to diagnose.', 'pass만 하는 except 블록은 실패를 숨겨 버그가 조용해지고 진단이 어려워집니다.'],
  ['Handle the exception, log it, or add a comment explaining why ignoring it is safe.', '예외를 처리하거나 기록하거나, 무시해도 안전한 이유를 주석으로 남기세요.'],
  {
    on: {
      ExceptHandler(n, c, r) {
        const body = U.bodyNoDoc(n.body);
        if (!body.every((s) => s.type === 'Pass' || s.type === 'Continue' || (s.type === 'Expr' && s.value.type === 'Constant'))) return;
        if (blockHasComment(c, n.body)) return;
        const names = n.etype ? (n.etype.type === 'Tuple' ? n.etype.elts : [n.etype]).map((t) => U.lastPart(dotted(t) || '')) : [];
        if (names.length && names.every((x) => /^(?:ImportError|ModuleNotFoundError|KeyboardInterrupt|StopIteration|StopAsyncIteration|GeneratorExit|FileNotFoundError|FileExistsError|ProcessLookupError|NotImplementedError|BrokenPipeError|CancelledError|TimeoutError|queue\.Empty|Empty|ChildProcessError)$/.test(x))) return;
        r.report(n, 'Handle this exception or explain in a comment why it can be ignored.', '이 예외를 처리하거나 무시해도 되는 이유를 주석으로 설명하세요.');
      },
    },
  });

R('bare-except', 'S', 'CR', 5, ['error-handling', 'cwe-396'], 'S5754',
  ['Bare except or BaseException caught without re-raising', '맨 except나 BaseException을 잡고 다시 던지지 않습니다'],
  ['"except:" and "except BaseException:" also catch SystemExit and KeyboardInterrupt, so Ctrl+C and sys.exit() stop working.', '"except:"와 "except BaseException:"은 SystemExit와 KeyboardInterrupt까지 잡아 Ctrl+C와 sys.exit()가 동작하지 않습니다.'],
  ['Catch Exception (or something narrower), or re-raise.', 'Exception(또는 더 좁은 예외)을 잡거나 다시 던지세요.'],
  {
    on: {
      ExceptHandler(n, c, r) {
        let broad = !n.etype;
        if (n.etype) {
          const ts = n.etype.type === 'Tuple' ? n.etype.elts : [n.etype];
          broad = ts.some((t) => /^(?:BaseException|SystemExit|builtins\.BaseException)$/.test(dotted(t) || ''));
        }
        if (!broad || handlerReraises(n)) return;
        r.report(n.etype || { line: n.line, col: n.col, endLine: n.line, endCol: n.col + 6 }, n.etype ? `Catch a narrower exception than '${short(c.slice(n.etype), 30)}', or re-raise it.` : "Specify an exception class to catch, or re-raise the exception.", n.etype ? `'${short(c.slice(n.etype), 30)}'보다 좁은 예외를 잡거나 다시 던지세요.` : '잡을 예외 클래스를 지정하거나 예외를 다시 던지세요.');
      },
    },
  });

R('useless-except-reraise', 'S', 'MI', 2, ['error-handling', 'redundant'], 'S2737',
  ['Except clause that only re-raises', '다시 던지기만 하는 except 절'],
  ['"except E: raise" catches the exception only to raise it again unchanged; it adds nothing.', '"except E: raise"는 예외를 잡았다가 그대로 다시 던질 뿐 아무것도 더하지 않습니다.'],
  ['Remove the except clause (or add handling).', 'except 절을 지우세요(또는 처리를 추가하세요).'],
  {
    on: {
      'Try|TryStar'(n, c, r) {
        const hs = n.handlers;
        if (!hs.length) return;
        const only = (h) => h.body.length === 1 && h.body[0].type === 'Raise' && (!h.body[0].exc || (h.name && h.body[0].exc.type === 'Name' && h.body[0].exc.id === h.name && !h.body[0].cause));
        // a re-raising clause before broader ones narrows them on purpose
        const last = hs[hs.length - 1];
        if (only(last) && hs.every(only)) r.report(last, 'Remove this except clause: it only re-raises the exception.', '이 except 절을 지우세요. 예외를 다시 던지기만 합니다.');
      },
    },
  });

module.exports = { RULES, cognitive, cyclomatic };
void isNone; void walkLocal; void same;
