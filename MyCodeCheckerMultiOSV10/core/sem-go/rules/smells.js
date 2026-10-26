'use strict';

// Code smells: complexity, size, structure, duplication, dead code.

const { rule, gf } = require('./core');
const A = require('../ast');
const H = require('./h');
const { parseGo } = require('../parser');

// ── complexity ──
function cognitive(fn) {
  let total = 0;
  const logical = (e) => {
    const ops = [];
    const flat = (x) => {
      x = A.strip(x);
      if (x && x.k === 'Binary' && (x.op === '&&' || x.op === '||')) { flat(x.x); ops.push(x.op); flat(x.y); }
    };
    flat(e);
    let n = 0;
    for (let i = 0; i < ops.length; i++) if (i === 0 || ops[i] !== ops[i - 1]) n++;
    return n;
  };
  const visitExpr = (e, nest) => {
    if (!e) return;
    A.walk(e, (x) => {
      if (x.k === 'FuncLit') { visit(x.body, nest + 1); return false; }
      if (x.k === 'Binary' && (x.op === '&&' || x.op === '||')) {
        total += logical(x);
        const ops = [];
        const leaves = (y) => { y = A.strip(y); if (y && y.k === 'Binary' && (y.op === '&&' || y.op === '||')) { leaves(y.x); leaves(y.y); } else ops.push(y); };
        leaves(x);
        for (const l of ops) visitExpr(l, nest);
        return false;
      }
      return true;
    });
  };
  const visit = (s, nest) => {
    if (!s) return;
    switch (s.k) {
      case 'Block': for (const x of s.stmts) visit(x, nest); return;
      case 'If': {
        total += 1 + nest;
        if (s.init) visit(s.init, nest);
        visitExpr(s.cond, nest);
        visit(s.then, nest + 1);
        let e = s.els;
        while (e && e.k === 'If') {
          total += 1;
          if (e.init) visit(e.init, nest);
          visitExpr(e.cond, nest);
          visit(e.then, nest + 1);
          e = e.els;
        }
        if (e) { total += 1; visit(e, nest + 1); }
        return;
      }
      case 'For':
        total += 1 + nest;
        if (s.init) visit(s.init, nest);
        visitExpr(s.cond, nest);
        if (s.post) visit(s.post, nest);
        visit(s.body, nest + 1);
        return;
      case 'Range':
        total += 1 + nest;
        visitExpr(s.x, nest);
        visit(s.body, nest + 1);
        return;
      case 'Switch': case 'TypeSwitch': case 'Select':
        total += 1 + nest;
        if (s.init) visit(s.init, nest);
        if (s.k === 'Switch' && s.tag) visitExpr(s.tag, nest);
        for (const c of s.cases) {
          for (const e of c.list || []) visitExpr(e, nest + 1);
          if (c.comm) visit(c.comm, nest + 1);
          for (const x of c.body) visit(x, nest + 1);
        }
        return;
      case 'Labeled': visit(s.stmt, nest); return;
      case 'Branch': if (s.label || s.tok === 'goto') total += 1; return;
      default:
        A.eachChild(s, (c) => { if (c.k === 'Block') visit(c, nest); else visitExpr(c, nest); });
    }
  };
  visit(fn.body, 0);
  return total;
}

rule({
  id: 'cognitive-complexity', type: 'S', sev: 'CR', debt: 20, tags: ['brain-overload'], ref: 'S3776',
  en: ['Cognitive Complexity of functions should not be too high', 'Deeply nested and branching code is hard to read, test and change.', 'Split the function, return early and extract helpers.'],
  ko: ['함수의 인지 복잡도가 너무 높으면 안 됩니다', '깊이 중첩되고 분기가 많은 코드는 읽고 시험하고 바꾸기 어렵습니다.', '함수를 나누고 일찍 반환하며 도우미 함수로 뽑아내세요.'],
  on: {
    FuncDecl(fn, cx) {
      if (!fn.body) return;
      const max = Number(cx.opts.cognitiveThreshold) || 15;
      const c = cognitive(fn);
      if (c > max) cx.report(fn.name, `Refactor '${fn.name.name}' to reduce its Cognitive Complexity from ${c} to the ${max} allowed.`, `'${fn.name.name}'의 인지 복잡도를 ${c}에서 허용치 ${max} 이하로 줄이세요.`);
    },
  },
  bad: gf(`
func classify(a, b, c int) int { // Noncompliant
	if b > 0 {
		if c > 0 {
			a++
		}
	}
	if a > 0 {
		for i := 0; i < b; i++ {
			if c > i {
				switch {
				case a > b && b > c || a > c:
					return 1
				}
			} else if c == 0 {
				return 2
			} else {
				return 3
			}
		}
	}
	return 0
}
`),
  good: gf(`
func classify(a, b int) int {
	if a > b {
		return 1
	}
	for i := 0; i < b; i++ {
		if i == a {
			return 2
		}
	}
	return 0
}
`),
});

rule({
  id: 'expression-complexity', type: 'S', sev: 'CR', debt: 5, tags: ['brain-overload'], ref: 'S1067',
  en: ['Expressions should not be too complex', 'Long chains of && and || are hard to understand.', 'Extract parts of the condition into named variables or functions.'],
  ko: ['식이 너무 복잡하면 안 됩니다', '&&와 ||가 길게 이어지면 이해하기 어렵습니다.', '조건 일부를 이름 있는 변수나 함수로 뽑아내세요.'],
  on: {
    Binary(n, cx) {
      if (n.op !== '&&' && n.op !== '||') return;
      let p = n.parent;
      while (p && p.k === 'Paren') p = p.parent;
      if (p && p.k === 'Binary' && (p.op === '&&' || p.op === '||')) return;
      let count = 0;
      A.walk(n, (x) => { if (x.k === 'FuncLit') return false; if (x.k === 'Binary' && (x.op === '&&' || x.op === '||')) count++; return true; });
      const max = Number(cx.opts.maxBooleanOperators) || 3;
      if (count > max) cx.report(n, `Reduce the number of conditional operators (${count}) used in this expression (maximum allowed ${max}).`, `이 식의 조건 연산자 수(${count})를 허용치 ${max} 이하로 줄이세요.`);
    },
  },
  bad: gf(`
func ok(a, b, c, d, e bool) bool {
	return a && b || c && d || e // Noncompliant
}
`),
  good: gf(`
func ok(a, b, c bool) bool {
	return a && b || c
}
`),
});

rule({
  id: 'nesting-depth', type: 'S', sev: 'CR', debt: 10, tags: ['brain-overload'], ref: 'S134',
  en: ['Control flow statements should not be nested too deeply', 'Deep nesting makes code hard to follow.', 'Return early, merge conditions or extract functions.'],
  ko: ['제어문을 너무 깊이 중첩하면 안 됩니다', '깊은 중첩은 코드 흐름을 따라가기 어렵게 합니다.', '일찍 반환하거나 조건을 합치거나 함수로 뽑아내세요.'],
  on: {
    If: (n, cx) => depthCheck(n, cx), For: (n, cx) => depthCheck(n, cx), Range: (n, cx) => depthCheck(n, cx),
    Switch: (n, cx) => depthCheck(n, cx), TypeSwitch: (n, cx) => depthCheck(n, cx), Select: (n, cx) => depthCheck(n, cx),
  },
  bad: gf(`
func deep(a int) {
	if a > 0 {
		for i := 0; i < a; i++ {
			switch i {
			case 1:
				if a > 2 {
					if a > 3 { // Noncompliant
						a--
					}
				}
			}
		}
	}
}
`),
  good: gf(`
func deep(a int) {
	if a <= 0 {
		return
	}
	for i := 0; i < a; i++ {
		if i == 1 && a > 3 {
			a--
		}
	}
}
`),
});
function depthCheck(n, cx) {
  if (n.parent && n.parent.k === 'If' && n.parent.els === n) return;
  let depth = 0;
  for (let p = n.parent; p; p = p.parent) {
    if (p.k === 'FuncDecl' || p.k === 'FuncLit') break;
    if (['If', 'For', 'Range', 'Switch', 'TypeSwitch', 'Select'].includes(p.k)) {
      if (p.k === 'If' && p.parent && p.parent.k === 'If' && p.parent.els === p) continue;
      depth++;
    }
  }
  const max = Number(cx.opts.maxNesting) || 4;
  if (depth >= max) {
    // report only the first statement that crosses the limit
    for (let p = n.parent; p; p = p.parent) {
      if (p.k === 'FuncDecl' || p.k === 'FuncLit') break;
      if (p._nestReported) return;
    }
    n._nestReported = true;
    cx.report(n, `Refactor this code to not nest more than ${max} control flow statements.`, `제어문 중첩이 ${max}단계를 넘지 않도록 고치세요.`, { line: n.line, col: n.col });
  }
}

rule({
  id: 'too-many-params', type: 'S', sev: 'MA', debt: 20, tags: ['brain-overload'], ref: 'S107',
  en: ['Functions should not have too many parameters', 'Long parameter lists are hard to call correctly.', 'Group related parameters into a struct.'],
  ko: ['함수 매개변수가 너무 많으면 안 됩니다', '긴 매개변수 목록은 올바르게 호출하기 어렵습니다.', '관련된 매개변수를 구조체로 묶으세요.'],
  on: {
    FuncDecl(fn, cx) {
      const max = Number(cx.opts.maxParams) || 7;
      const n = fn.params.length;
      if (n > max) cx.report(fn.name, `'${fn.name.name}' has ${n} parameters, which is greater than the ${max} authorized.`, `'${fn.name.name}'의 매개변수가 ${n}개로 허용치 ${max}개를 넘습니다.`);
    },
  },
  bad: gf(`
func build(a, b, c, d, e, f, g, h int) int { // Noncompliant
	return a + b + c + d + e + f + g + h
}
`),
  good: gf(`
type opts struct{ a, b, c, d, e, f, g, h int }

func build(o opts) int {
	return o.a + o.h
}
`),
});

rule({
  id: 'long-function', type: 'S', sev: 'MA', debt: 20, tags: ['brain-overload'], ref: 'S138',
  en: ['Functions should not have too many lines of code', 'Very long functions do too many things.', 'Split the function into smaller ones.'],
  ko: ['함수의 줄 수가 너무 많으면 안 됩니다', '아주 긴 함수는 너무 많은 일을 합니다.', '함수를 더 작은 함수로 나누세요.'],
  on: {
    FuncDecl(fn, cx) {
      if (!fn.body) return;
      const max = Number(cx.opts.maxFunctionLines) || 120;
      const n = A.lineCount(fn);
      if (n > max) cx.report(fn.name, `'${fn.name.name}' has ${n} lines, which is greater than the ${max} lines authorized. Split it into smaller functions.`, `'${fn.name.name}'은(는) ${n}줄로 허용치 ${max}줄을 넘습니다. 더 작은 함수로 나누세요.`);
    },
  },
  bad: gf(`func long() int { // Noncompliant\n\tx := 0\n${'\tx++\n'.repeat(120)}\treturn x\n}\n`),
  good: gf(`func short() int {\n\tx := 0\n${'\tx++\n'.repeat(10)}\treturn x\n}\n`),
});

rule({
  id: 'file-too-long', type: 'S', sev: 'MA', debt: 60, tags: ['brain-overload'], ref: 'S104',
  en: ['Files should not have too many lines of code', 'Huge files are hard to navigate and usually mix responsibilities.', 'Split the file by responsibility.'],
  ko: ['파일의 줄 수가 너무 많으면 안 됩니다', '아주 큰 파일은 다루기 어렵고 여러 책임이 섞여 있기 쉽습니다.', '책임별로 파일을 나누세요.'],
  file(pf, cx) {
    const max = Number(cx.opts.maxFileLines) || 1000;
    const n = pf.src.split('\n').length;
    if (n > max) cx.report({ line: 1, col: 1 }, `This file has ${n} lines, which is greater than ${max} authorized. Split it into smaller files.`, `이 파일은 ${n}줄로 허용치 ${max}줄을 넘습니다. 더 작은 파일로 나누세요.`);
  },
  bad: `package main // Noncompliant\n\n${'var _ = 1\n'.repeat(1000)}`,
  good: gf('var x = 1\n'),
});

rule({
  id: 'line-too-long', type: 'S', sev: 'MA', debt: 1, tags: ['convention'], ref: 'S103',
  en: ['Lines should not be too long', 'Very long lines force horizontal scrolling and hurt readability.', 'Break the line or extract variables.'],
  ko: ['줄이 너무 길면 안 됩니다', '아주 긴 줄은 가로 스크롤이 필요하고 읽기 어렵습니다.', '줄을 나누거나 변수로 뽑아내세요.'],
  file(pf, cx) {
    const max = Number(cx.opts.maxLineLength) || 120;
    pf.src.split('\n').forEach((l, i) => {
      const len = l.replace(/\r$/, '').replace(/\t/g, '    ').length;
      if (len > max && !/^\s*(\/\/\s*)?(import\s|"[^"]*"\s*$)|https?:\/\/|go:generate|go:embed/.test(l)) cx.report({ line: i + 1, col: 1 }, `Split this ${len} characters long line (which is greater than ${max} authorized).`, `${len}자인 이 줄을 나누세요(허용치 ${max}자).`);
    });
  },
  bad: gf(`
func f() int {
	return 1 + 2 + 3 + 4 + 5 + 6 + 7 + 8 + 9 + 10 + 11 + 12 + 13 + 14 + 15 + 16 + 17 + 18 + 19 + 20 + 21 + 22 + 23 + 24 + 25 + 26 // Noncompliant
}
`),
  good: gf(`
func f() int {
	return 1 + 2 + 3
}
`),
});

// ── comments ──
function commentRule(id, ref, word, en, ko) {
  rule({
    id, type: 'S', sev: id === 'fixme' ? 'MA' : 'IN', debt: 0, tags: ['cwe-546'], ref,
    en, ko,
    file(pf, cx) {
      const re = new RegExp(`(^|[^A-Za-z])${word}([^A-Za-z]|$)`, 'i');
      for (const c of pf.comments) {
        const lines = c.text.split('\n');
        lines.forEach((l, i) => {
          if (re.test(l)) cx.report({ line: c.line + i, col: i === 0 ? c.col : 1 }, `Complete the task associated to this '${word}' comment.`, `이 '${word}' 주석에 적힌 작업을 마무리하세요.`);
        });
      }
    },
    bad: gf(`
func f() {
	// ${word}: handle the empty case // Noncompliant
}
`),
    good: gf(`
// f handles every case.
func f() {
}
`),
  });
}
commentRule('fixme', 'S1134', 'FIXME',
  ['Track uses of "FIXME" tags', 'FIXME marks a known defect that should not stay in the code.', 'Fix the problem and remove the comment.'],
  ['"FIXME" 태그 사용을 추적합니다', 'FIXME는 알려진 결함 표시이므로 코드에 남아 있으면 안 됩니다.', '문제를 고치고 주석을 지우세요.']);
commentRule('todo', 'S1135', 'TODO',
  ['Track uses of "TODO" tags', 'TODO marks unfinished work.', 'Finish the work or move it to the issue tracker.'],
  ['"TODO" 태그 사용을 추적합니다', 'TODO는 끝나지 않은 작업 표시입니다.', '작업을 마치거나 이슈 관리 도구로 옮기세요.']);

rule({
  id: 'commented-code', type: 'S', sev: 'MA', debt: 5, tags: ['unused'], ref: 'S125',
  en: ['Sections of code should not be commented out', 'Commented-out code is noise; version control keeps the history.', 'Delete the commented-out code.'],
  ko: ['코드를 주석으로 막아 두면 안 됩니다', '주석 처리한 코드는 잡음일 뿐이고 이력은 버전 관리가 보관합니다.', '주석 처리한 코드를 지우세요.'],
  file(pf, cx) {
    let group = null;
    const flush = () => {
      if (!group) return;
      const body = group.lines.join('\n');
      if (looksLikeCode(body)) cx.report({ line: group.line, col: group.col }, 'This block of commented-out lines of code should be removed.', '주석 처리한 이 코드 줄들을 지우세요.');
      group = null;
    };
    for (const c of pf.comments) {
      if (c.block) { flush(); if (looksLikeCode(c.text)) cx.report({ line: c.line, col: c.col }, 'This block of commented-out lines of code should be removed.', '주석 처리한 이 코드 줄들을 지우세요.'); continue; }
      if (/^\s*(go:|nolint|NOMCC|export\s|line\s)/.test(c.text)) { flush(); continue; }
      if (group && c.line === group.last + 1 && c.col === group.col) { group.lines.push(c.text); group.last = c.line; continue; }
      flush();
      group = { line: c.line, col: c.col, last: c.line, lines: [c.text] };
    }
    flush();
  },
  bad: gf(`
func f(x int) int {
	// if x > 0 { // Noncompliant
	//	x = compute(x)
	// }
	return x
}
`),
  good: gf(`
// f returns x unchanged; see the design notes (section 2).
func f(x int) int {
	return x
}
`),
});
function looksLikeCode(text) {
  const t = text.trim();
  if (!t || t.length < 6) return false;
  if (!/[;{}()]|:=/.test(t)) return false;
  if (/^[A-Z][a-z]+ [a-z]+ [a-z]+/.test(t) && !/[{}]|:=/.test(t)) return false;
  if (/[.!?]$/.test(t) && !/[{}]/.test(t)) return false;
  const res = parseGo(`package p\nfunc _() {\n${t}\n}\n`);
  if (res.errors.length) return false;
  const fn = res.file.decls[0];
  if (!fn || !fn.body || !fn.body.stmts.length) return false;
  return fn.body.stmts.some((s) => s.k !== 'ExprStmt' || (s.x && s.x.k === 'Call'));
}

// ── blocks ──
rule({
  id: 'empty-block', type: 'S', sev: 'MA', debt: 5, tags: ['suspicious'], ref: 'S108',
  en: ['Nested blocks of code should not be left empty', 'An empty block is either dead code or missing logic.', 'Add the missing code, a comment explaining why it is empty, or remove the block.'],
  ko: ['중첩된 코드 블록을 비워 두면 안 됩니다', '빈 블록은 죽은 코드이거나 빠진 로직입니다.', '빠진 코드나 비워 둔 이유를 적은 주석을 넣거나 블록을 지우세요.'],
  on: {
    Block(b, cx) {
      if (b.stmts.length || !b.parent) return;
      const p = b.parent;
      if (p.k === 'FuncDecl' || p.k === 'FuncLit') return;
      if (p.k === 'For' || p.k === 'Range') { if (p.k === 'Range' || !p.cond) return; }
      if (H.commentInside(cx.pf, b)) return;
      if (b.endLine === b.line && b.endCol - b.col < 2 && p.k === 'For') return;
      cx.report(b, 'Either remove or fill this block of code.', '이 코드 블록을 지우거나 내용을 채우세요.');
    },
  },
  bad: gf(`
func f(err error) {
	if err != nil {} // Noncompliant
}
`),
  good: gf(`
func f(err error) {
	if err != nil {
		// the error is reported by the caller
	}
	for range make(chan int) {
	}
}
`),
});

rule({
  id: 'empty-function', type: 'S', sev: 'CR', debt: 5, tags: ['suspicious'], ref: 'S1186',
  en: ['Functions should not be empty', 'An empty function without explanation looks like unfinished code.', 'Implement it, panic for unsupported operations or explain with a comment why it is empty.'],
  ko: ['함수를 비워 두면 안 됩니다', '설명 없는 빈 함수는 미완성 코드처럼 보입니다.', '구현하거나 지원하지 않는 동작이면 panic하고, 아니면 비워 둔 이유를 주석으로 적으세요.'],
  on: {
    FuncDecl(fn, cx) {
      if (!fn.body || fn.body.stmts.length) return;
      if (H.commentInside(cx.pf, fn.body)) return;
      if (fn.name.name === 'main' || fn.name.name === 'init') return;
      cx.report(fn.name, `Add a nested comment explaining why '${fn.name.name}' is empty, or complete the implementation.`, `'${fn.name.name}'이(가) 비어 있는 이유를 주석으로 적거나 구현을 마무리하세요.`);
    },
  },
  bad: gf(`
func handle() {} // Noncompliant
`),
  good: gf(`
type nopLogger struct{}

func (nopLogger) Log(string) {
	// intentionally discards everything
}
`),
});

// ── conditionals ──
rule({
  id: 'collapsible-if', type: 'S', sev: 'MA', debt: 5, tags: ['clumsy'], ref: 'S1066',
  en: ['Mergeable "if" statements should be combined', 'Nested ifs without else read better as one condition.', 'Merge the conditions with &&.'],
  ko: ['합칠 수 있는 "if" 문은 합쳐야 합니다', 'else가 없는 중첩 if는 하나의 조건으로 쓰는 편이 읽기 좋습니다.', '조건을 &&로 합치세요.'],
  on: {
    If(n, cx) {
      if (n.els || n.init) return;
      if (n.parent && n.parent.k === 'If' && n.parent.els === n) return;
      if (n.then.stmts.length !== 1) return;
      const inner = n.then.stmts[0];
      if (inner.k !== 'If' || inner.els || inner.init) return;
      cx.report(inner, 'Merge this if statement with the enclosing one.', '이 if 문을 바깥 if 문과 합치세요.', { line: inner.line, col: inner.col });
    },
  },
  bad: gf(`
func f(a, b bool) {
	if a {
		if b { // Noncompliant
			println("x")
		}
	}
}
`),
  good: gf(`
func f(a, b bool) {
	if a && b {
		println("x")
	}
	if a {
		if b {
			println("y")
		}
		println("z")
	}
}
`),
});

rule({
  id: 'if-constant', type: 'S', sev: 'MA', debt: 2, tags: ['cwe-571', 'cwe-570', 'suspicious'], ref: 'S1145',
  en: ['"if" statements should not have constant boolean conditions', 'if true / if false is dead or debug code.', 'Remove the condition or the dead branch.'],
  ko: ['"if" 문의 조건이 상수 불리언이면 안 됩니다', 'if true / if false는 죽은 코드이거나 디버그용 코드입니다.', '조건이나 죽은 분기를 지우세요.'],
  on: {
    If(n, cx) {
      const c = A.strip(n.cond);
      if (c && A.isBoolLit(c) && c.sym && c.sym.builtin) cx.report(c, `Remove this 'if ${c.name}' condition.`, `'if ${c.name}' 조건을 지우세요.`);
    },
  },
  bad: gf(`
func f() {
	if true { // Noncompliant
		println("x")
	}
}
`),
  good: gf(`
const debug = false

func f(on bool) {
	if on {
		println("x")
	}
}
`),
});

rule({
  id: 'boolean-literal', type: 'S', sev: 'MI', debt: 5, tags: ['clumsy'], ref: 'S1125',
  en: ['Boolean literals should not be redundant', 'Comparing with true/false or combining with literals adds noise.', 'Use the boolean expression directly.'],
  ko: ['불리언 리터럴을 쓸데없이 쓰면 안 됩니다', 'true/false와 비교하거나 리터럴과 결합하면 잡음만 늘어납니다.', '불리언 식을 그대로 쓰세요.'],
  on: {
    Binary(n, cx) {
      if (!['==', '!=', '&&', '||'].includes(n.op)) return;
      const lit = [n.x, n.y].map(A.strip).find((x) => A.isBoolLit(x) && x.sym && x.sym.builtin);
      if (lit) cx.report(lit, `Remove the unnecessary boolean literal '${lit.name}'.`, `불필요한 불리언 리터럴 '${lit.name}'을(를) 지우세요.`);
    },
    Unary(n, cx) {
      if (n.op !== '!') return;
      const x = A.strip(n.x);
      if (A.isBoolLit(x) && x.sym && x.sym.builtin) cx.report(x, `Remove the unnecessary boolean literal '${x.name}'.`, `불필요한 불리언 리터럴 '${x.name}'을(를) 지우세요.`);
    },
  },
  bad: gf(`
func f(ok bool) bool {
	if ok == true { // Noncompliant
		return false
	}
	return ok || false // Noncompliant
}
`),
  good: gf(`
func f(ok bool) bool {
	return !ok
}
`),
});

rule({
  id: 'return-boolean', type: 'S', sev: 'MI', debt: 2, tags: ['clumsy'], ref: 'S1126',
  en: ['Return of boolean expressions should not be wrapped in an "if-then-else" statement', 'if c { return true } else { return false } is just return c.', 'Return the condition directly.'],
  ko: ['불리언 식을 반환할 때 "if-then-else"로 감싸면 안 됩니다', 'if c { return true } else { return false }는 return c와 같습니다.', '조건을 바로 반환하세요.'],
  on: {
    If(n, cx) {
      if (n.init || (n.parent && n.parent.k === 'If' && n.parent.els === n)) return;
      const lit = (b) => { const s = b && A.stmtsOf(b); if (!s || s.length !== 1 || s[0].k !== 'Return' || s[0].results.length !== 1) return null; const r = A.strip(s[0].results[0]); return A.isBoolLit(r) ? r.name : null; };
      const t = lit(n.then);
      if (!t) return;
      let e = null;
      if (n.els && n.els.k === 'Block') e = lit(n.els);
      else if (!n.els) { const sib = H.siblings(n); const nx = sib && sib.list[sib.index + 1]; if (nx && nx.k === 'Return' && nx.results.length === 1 && A.isBoolLit(nx.results[0])) e = A.strip(nx.results[0]).name; }
      if (e && e !== t) cx.report(n, 'Replace this if-then-else statement by a single return statement.', '이 if-then-else 문을 return 문 하나로 바꾸세요.', { line: n.line, col: n.col });
    },
  },
  bad: gf(`
func positive(x int) bool {
	if x > 0 { // Noncompliant
		return true
	}
	return false
}
`),
  good: gf(`
func positive(x int) bool {
	return x > 0
}
`),
});

rule({
  id: 'identical-branches', type: 'S', sev: 'MA', debt: 10, tags: ['design', 'suspicious'], ref: 'S1871',
  en: ['Two branches in a conditional structure should not have exactly the same implementation', 'Duplicated branches are either a copy-paste error or should be merged.', 'Merge the conditions or fix the branch that is wrong.'],
  ko: ['조건 구조의 두 분기가 완전히 같은 구현이면 안 됩니다', '같은 분기는 복사-붙여넣기 실수이거나 하나로 합쳐야 합니다.', '조건을 합치거나 잘못된 분기를 고치세요.'],
  on: {
    If(n, cx) {
      if (n.parent && n.parent.k === 'If' && n.parent.els === n) return;
      const branches = [];
      let e = n;
      while (e && e.k === 'If') { branches.push(e.then); e = e.els; }
      if (e) branches.push(e);
      if (branches.length < 2) return;
      const complete = !!e;
      if (complete && branches.every((b) => A.same(b.stmts, branches[0].stmts))) return; // all-branches-same
      reportDupBranches(branches.map((b) => ({ node: b, stmts: b.stmts })), cx);
    },
    Switch(n, cx) {
      const cs = n.cases.map((c) => ({ node: c, stmts: c.body.filter((s) => !(s.k === 'Branch' && s.tok === 'break' && !s.label)) }));
      const complete = n.cases.some((c) => !c.list);
      if (complete && cs.length > 1 && cs.every((c) => A.same(c.stmts, cs[0].stmts))) return;
      reportDupBranches(cs, cx);
    },
  },
  bad: gf(`
func f(x int) int {
	if x > 10 {
		println("big")
		return 1
	} else if x > 5 { // Noncompliant
		println("big")
		return 1
	}
	return 0
}
`),
  good: gf(`
func f(x int) int {
	if x > 10 {
		println("big")
		return 1
	} else if x > 5 {
		println("medium")
		return 2
	}
	return 0
}
`),
});
function reportDupBranches(list, cx) {
  for (let i = 1; i < list.length; i++) {
    const cur = list[i];
    if (!cur.stmts.length) continue;
    if (cur.stmts.length === 1 && cur.stmts[0].k !== 'Block' && list.length < 3) continue;
    for (let j = 0; j < i; j++) {
      if (A.same(cur.stmts, list[j].stmts)) {
        const at = cur.node.k === 'Block' && cur.node.parent && cur.node.parent.k === 'If' ? cur.node.parent : cur.node;
        cx.report(at, `This branch's code block is the same as the block for the branch on line ${list[j].node.line}.`, `이 분기의 코드 블록이 ${list[j].node.line}행 분기와 같습니다.`, { line: at.line, col: at.col });
        break;
      }
    }
  }
}

rule({
  id: 'all-branches-same', type: 'B', sev: 'MA', debt: 15, tags: ['suspicious'], ref: 'S3923',
  en: ['All branches in a conditional structure should not have exactly the same implementation', 'When every branch does the same thing the condition is pointless or a branch is wrong.', 'Remove the conditional or fix the branches.'],
  ko: ['조건 구조의 모든 분기가 완전히 같은 구현이면 안 됩니다', '모든 분기가 같은 일을 하면 조건이 쓸모없거나 어느 분기가 틀렸습니다.', '조건문을 없애거나 분기를 고치세요.'],
  on: {
    If(n, cx) {
      if (n.parent && n.parent.k === 'If' && n.parent.els === n) return;
      const branches = [];
      let e = n;
      while (e && e.k === 'If') { branches.push(e.then); e = e.els; }
      if (!e) return;
      branches.push(e);
      if (!branches[0].stmts.length) return;
      if (branches.every((b) => A.same(b.stmts, branches[0].stmts))) cx.report(n, "Remove this conditional structure or edit its code blocks so that they're not all the same.", '이 조건 구조를 지우거나 모든 코드 블록이 같지 않도록 고치세요.', { line: n.line, col: n.col });
    },
    Switch(n, cx) {
      if (n.cases.length < 2 || !n.cases.some((c) => !c.list)) return;
      const b0 = n.cases[0].body;
      if (!b0.length) return;
      if (n.cases.every((c) => A.same(c.body, b0))) cx.report(n, "Remove this conditional structure or edit its code blocks so that they're not all the same.", '이 조건 구조를 지우거나 모든 코드 블록이 같지 않도록 고치세요.', { line: n.line, col: n.col });
    },
  },
  bad: gf(`
func f(x int) int {
	if x > 0 { // Noncompliant
		return 1
	} else {
		return 1
	}
}
`),
  good: gf(`
func f(x int) int {
	if x > 0 {
		return 1
	} else {
		return 2
	}
}
`),
});

rule({
  id: 'duplicated-condition', type: 'B', sev: 'MA', debt: 10, tags: ['suspicious', 'pitfall'], ref: 'S1862',
  en: ['Related "if/else if" statements and "switch" cases should not have the same condition', 'A repeated condition makes the second branch dead code.', 'Fix the condition or remove the duplicated branch.'],
  ko: ['이어지는 "if/else if" 문과 "switch" case의 조건이 같으면 안 됩니다', '조건이 반복되면 두 번째 분기는 죽은 코드가 됩니다.', '조건을 고치거나 중복된 분기를 지우세요.'],
  on: {
    If(n, cx) {
      if (n.parent && n.parent.k === 'If' && n.parent.els === n) return;
      const conds = [];
      for (let e = n; e && e.k === 'If'; e = e.els) {
        if (e.init) break;
        const prev = conds.find((c) => A.same(A.strip(c), A.strip(e.cond)));
        if (prev && !hasCall(e.cond)) cx.report(e.cond, `This branch duplicates the condition on line ${prev.line}.`, `이 분기는 ${prev.line}행의 조건과 같습니다.`);
        conds.push(e.cond);
      }
    },
    Switch(n, cx) {
      const seen = [];
      for (const c of n.cases) {
        for (const e of c.list || []) {
          const prev = seen.find((s) => A.same(A.strip(s), A.strip(e)));
          if (prev && !hasCall(e)) cx.report(e, `This case duplicates the case on line ${prev.line}.`, `이 case는 ${prev.line}행의 case와 같습니다.`);
          seen.push(e);
        }
      }
    },
  },
  bad: gf(`
func f(x int) string {
	if x == 1 {
		return "a"
	} else if x == 1 { // Noncompliant
		return "b"
	}
	return ""
}
`),
  good: gf(`
func f(x int) string {
	if x == 1 {
		return "a"
	} else if x == 2 {
		return "b"
	}
	return ""
}
`),
});
function hasCall(e) {
  let found = false;
  A.walk(e, (x) => { if (x.k === 'Call') { const c = A.callee(x); if (!(c && c.name === 'len')) found = true; } return !found; });
  return found;
}

// ── switch ──
rule({
  id: 'nested-switch', type: 'S', sev: 'CR', debt: 10, tags: ['brain-overload'], ref: 'S1821',
  en: ['"switch" statements should not be nested', 'Nested switches are hard to read.', 'Move the inner switch into its own function.'],
  ko: ['"switch" 문을 중첩하면 안 됩니다', '중첩된 switch는 읽기 어렵습니다.', '안쪽 switch를 별도 함수로 옮기세요.'],
  on: {
    Switch: (n, cx) => nestedSwitch(n, cx),
    TypeSwitch: (n, cx) => nestedSwitch(n, cx),
  },
  bad: gf(`
func f(a, b int) int {
	switch a {
	case 1:
		switch b { // Noncompliant
		case 2:
			return 3
		}
	}
	return 0
}
`),
  good: gf(`
func g(b int) int {
	switch b {
	case 2:
		return 3
	}
	return 0
}

func f(a, b int) int {
	switch a {
	case 1:
		return g(b)
	}
	return 0
}
`),
});
function nestedSwitch(n, cx) {
  for (let p = n.parent; p; p = p.parent) {
    if (p.k === 'FuncDecl' || p.k === 'FuncLit') return;
    if (p.k === 'Switch' || p.k === 'TypeSwitch') { cx.report(n, 'Refactor the code to eliminate this nested "switch".', '중첩된 "switch"가 없도록 코드를 고치세요.', { line: n.line, col: n.col }); return; }
  }
}

rule({
  id: 'switch-without-default', type: 'S', sev: 'CR', debt: 5, tags: ['cwe-478', 'clumsy'], ref: 'S131',
  en: ['"switch" statements should have "default" clauses', 'Without a default clause unexpected values are silently ignored.', 'Add a default clause, even if it only documents that nothing is done.'],
  ko: ['"switch" 문에는 "default" 절이 있어야 합니다', 'default 절이 없으면 예상하지 못한 값을 조용히 무시합니다.', '아무것도 하지 않더라도 default 절을 넣으세요.'],
  on: {
    Switch(n, cx) {
      if (n.cases.some((c) => !c.list)) return;
      cx.report(n, 'Add a "default" clause to this "switch" statement.', '이 "switch" 문에 "default" 절을 넣으세요.', { line: n.line, col: n.col });
    },
  },
  bad: gf(`
func f(x int) int {
	switch x { // Noncompliant
	case 1:
		return 1
	case 2:
		return 4
	}
	return 0
}
`),
  good: gf(`
func f(x int) int {
	switch x {
	case 1:
		return 1
	case 2:
		return 4
	default:
		return 0
	}
}
`),
});

rule({
  id: 'switch-too-few-cases', type: 'S', sev: 'MI', debt: 5, tags: ['clumsy'], ref: 'S1301',
  en: ['"switch" statements should have at least 3 "case" clauses', 'A switch with one or two cases is an if statement in disguise.', 'Use an if statement.'],
  ko: ['"switch" 문에는 "case" 절이 3개 이상 있어야 합니다', 'case가 한두 개인 switch는 사실상 if 문입니다.', 'if 문을 쓰세요.'],
  on: {
    Switch(n, cx) {
      const real = n.cases.filter((c) => c.list).length;
      if (n.cases.length < 3 && real >= 1) cx.report(n, 'Replace this "switch" statement by "if" statements to increase readability.', '읽기 쉽도록 이 "switch" 문을 "if" 문으로 바꾸세요.', { line: n.line, col: n.col });
    },
  },
  bad: gf(`
func f(x int) int {
	switch x { // Noncompliant
	case 1:
		return 1
	default:
		return 0
	}
}
`),
  good: gf(`
func f(x int) int {
	switch x {
	case 1:
		return 1
	case 2:
		return 4
	default:
		return 0
	}
}
`),
});

rule({
  id: 'too-many-cases', type: 'S', sev: 'MA', debt: 30, tags: ['brain-overload'], ref: 'S1479',
  en: ['"switch" statements should not have too many "case" clauses', 'Very large switches are hard to maintain.', 'Use a map lookup or split the logic.'],
  ko: ['"switch" 문의 "case" 절이 너무 많으면 안 됩니다', '아주 큰 switch는 유지 보수가 어렵습니다.', '맵 조회를 쓰거나 로직을 나누세요.'],
  on: {
    Switch(n, cx) {
      const max = Number(cx.opts.maxCases) || 30;
      const cnt = n.cases.filter((c) => c.list).length;
      if (cnt > max) cx.report(n, `Reduce the number of switch cases from ${cnt} to at most ${max}.`, `switch case 수를 ${cnt}개에서 ${max}개 이하로 줄이세요.`, { line: n.line, col: n.col });
    },
  },
  bad: gf(`func f(x int) int {\n\tswitch x { // Noncompliant\n${Array.from({ length: 31 }, (_, i) => `\tcase ${i}:\n\t\treturn ${i * 2}\n`).join('')}\tdefault:\n\t\treturn 0\n\t}\n}\n`),
  good: gf(`func f(x int) int {\n\tswitch x {\n${Array.from({ length: 5 }, (_, i) => `\tcase ${i}:\n\t\treturn ${i * 2}\n`).join('')}\tdefault:\n\t\treturn 0\n\t}\n}\n`),
});

// ── duplication ──
rule({
  id: 'duplicated-literal', type: 'S', sev: 'CR', debt: 2, tags: ['design'], ref: 'S1192',
  en: ['String literals should not be duplicated', 'Repeated literals must be changed in many places at once.', 'Define a constant and use it.'],
  ko: ['문자열 리터럴을 중복하면 안 됩니다', '반복된 리터럴은 바꿀 때 여러 곳을 함께 고쳐야 합니다.', '상수를 정의해서 쓰세요.'],
  file(pf, cx) {
    const min = Number(cx.opts.duplicateLiteralThreshold) || 3;
    const groups = new Map();
    A.walk(pf.ast, (n) => {
      if (n.k === 'GenDecl' && (n.kw === 'import' || n.kw === 'const')) return false;
      if (n.k === 'BasicLit' && n.kind === 'string') {
        const v = n.s || '';
        if (v.length < 5 || /^\s*$/.test(v)) return true;
        if (!groups.has(v)) groups.set(v, []);
        groups.get(v).push(n);
      }
      return true;
    });
    for (const [v, list] of groups) {
      if (list.length < min) continue;
      const shown = v.length > 40 ? `${v.slice(0, 40)}...` : v;
      cx.report(list[0], `Define a constant instead of duplicating this literal "${shown}" ${list.length} times.`, `리터럴 "${shown}"을(를) ${list.length}번 반복하지 말고 상수로 정의하세요.`, { events: list.slice(1).map((x) => ({ line: x.line, tag: 'path', text: { en: 'duplicate', ko: '중복' }, main: false })) });
    }
  },
  bad: gf(`
func f() []string {
	a := "application/json" // Noncompliant
	b := "application/json"
	return []string{a, b, "application/json"}
}
`),
  good: gf(`
const contentType = "application/json"

func f() []string {
	return []string{contentType, contentType, contentType}
}
`),
});

function bodySig(pf, fn) {
  return A.norm(pf.src, fn.body);
}
rule({
  id: 'identical-functions', type: 'S', sev: 'MA', debt: 15, tags: ['confusing', 'duplicate'], ref: 'S4144',
  en: ['Functions should not have identical implementations', 'Two functions with the same body are duplicated code; one of them is often a copy-paste mistake.', 'Make one function call the other, or remove one.'],
  ko: ['함수 구현이 똑같으면 안 됩니다', '본문이 같은 두 함수는 중복 코드이고, 흔히 하나는 복사-붙여넣기 실수입니다.', '한 함수가 다른 함수를 호출하게 하거나 하나를 지우세요.'],
  project(project, cx) {
    for (const pkg of project.packages) {
      const seen = new Map();
      for (const pf of pkg.files) {
        if (pf.skip) continue;
        for (const fn of H.funcDecls(pf)) {
          if (!fn.body || fn.body.stmts.length < 2 || A.lineCount(fn.body) < 4) continue;
          const sig = `${fn.params.map((p) => A.typeStr(p.type)).join(',')}|${fn.results.map((r) => A.typeStr(r.type)).join(',')}|${bodySig(pf, fn)}`;
          const prev = seen.get(sig);
          if (prev) cx.reportIn(pf, fn.name, `Update '${fn.name.name}' to not be identical to '${prev.fn.name.name}' (line ${prev.fn.name.line}).`, `'${fn.name.name}'이(가) '${prev.fn.name.name}'(${prev.fn.name.line}행)과 똑같지 않도록 고치세요.`);
          else seen.set(sig, { fn, pf });
        }
      }
    }
  },
  bad: gf(`
func sumA(xs []int) int {
	total := 0
	for _, x := range xs {
		total += x
	}
	return total
}

func sumB(xs []int) int { // Noncompliant
	total := 0
	for _, x := range xs {
		total += x
	}
	return total
}
`),
  good: gf(`
func sumA(xs []int) int {
	total := 0
	for _, x := range xs {
		total += x
	}
	return total
}

func sumB(xs []int) int {
	return sumA(xs)
}
`),
});

// ── unused code ──
rule({
  id: 'unused-param', type: 'S', sev: 'MA', debt: 5, tags: ['unused'], ref: 'S1172',
  en: ['Unused function parameters should be removed', 'An unused parameter misleads callers and hides mistakes.', 'Remove the parameter, or rename it to _ when the signature is imposed.'],
  ko: ['사용하지 않는 함수 매개변수는 지워야 합니다', '사용하지 않는 매개변수는 호출하는 쪽을 헷갈리게 하고 실수를 숨깁니다.', '매개변수를 지우고, 시그니처가 정해져 있다면 이름을 _로 바꾸세요.'],
  on: {
    FuncDecl(fn, cx) {
      if (!fn.body || fn.recv || !fn.body.stmts.length) return;
      if (fn.name.name === 'main' || fn.name.name === 'init' || cx.pf.isTest) return;
      const s = cx.pf.pkg.scope.names.get(fn.name.name);
      if (s && s.refs.some((r) => !(r.parent && r.parent.k === 'Call' && r.parent.fun === r))) return; // used as a value
      if (fn.body.stmts.length === 1 && fn.body.stmts[0].k === 'ExprStmt' && A.isExitCall(fn.body.stmts[0].x)) return;
      for (const f of fn.params) {
        for (const nm of f.names) {
          if (!nm.sym || nm.name === '_') continue;
          if (nm.sym.refs.length === 0) cx.report(nm, `Remove the unused function parameter '${nm.name}'.`, `사용하지 않는 함수 매개변수 '${nm.name}'을(를) 지우세요.`);
        }
      }
    },
  },
  bad: gf(`
func area(w, h, unused int) int { // Noncompliant
	return w * h
}

func main() {
	println(area(1, 2, 3))
}
`),
  good: gf(`
func area(w, h int) int {
	return w * h
}

func handler(_ string, n int) int {
	return n
}

func main() {
	println(area(1, 2))
	run(handler)
}

func run(f func(string, int) int) { println(f("", 1)) }
`),
});

rule({
  id: 'unused-local', type: 'S', sev: 'MI', debt: 5, tags: ['unused'], ref: 'S1481',
  en: ['Unused local variables should be removed', 'A variable that is only written, or only read by its own updates and blank assignments, does nothing useful.', 'Remove the variable and the code that only maintains it.'],
  ko: ['사용하지 않는 지역 변수는 지워야 합니다', '쓰기만 하거나 자기 자신의 갱신과 빈 식별자 대입에서만 읽는 변수는 하는 일이 없습니다.', '변수와 그 변수를 유지하기만 하는 코드를 지우세요.'],
  on: {
    FuncDecl: (fn, cx) => unusedLocals(fn, cx),
    FuncLit: (fn, cx) => unusedLocals(fn, cx),
  },
  bad: gf(`
func f(xs []int) int {
	seen := []int{} // Noncompliant
	n := 0
	for _, x := range xs {
		seen = append(seen, x)
		n += x
	}
	_ = seen
	return n
}
`),
  good: gf(`
func f(xs []int) int {
	seen := []int{}
	for _, x := range xs {
		seen = append(seen, x)
	}
	return len(seen)
}
`),
});
function unusedLocals(fn, cx) {
  for (const sym of fn.syms || []) {
    if (sym.kind !== 'var' || sym.fn !== fn || sym.name === '_' || sym.typeSwitchBind) continue;
    if (sym.addrTaken) continue;
    const reads = sym.refs.filter((r) => !r.lhs);
    if (!reads.length) {
      if (sym.refs.length) cx.report(sym.node, `Remove the unused local variable '${sym.name}': it is assigned but never read.`, `사용하지 않는 지역 변수 '${sym.name}'을(를) 지우세요. 대입만 하고 읽지 않습니다.`);
      continue;
    }
    const useless = reads.every((r) => selfOrBlank(r, sym));
    if (useless) cx.report(sym.node, `Remove the unused local variable '${sym.name}': it is only read to update itself or in blank assignments.`, `사용하지 않는 지역 변수 '${sym.name}'을(를) 지우세요. 자기 갱신이나 빈 식별자 대입에서만 읽습니다.`);
  }
}
function selfOrBlank(ref, sym) {
  for (let p = ref.parent; p; p = p.parent) {
    if (p.k === 'Assign') {
      if (p.lhs.every((l) => A.isIdent(l, '_'))) return true;
      if (p.lhs.some((l) => { const x = A.strip(l); return x && x.k === 'Ident' && x.sym === sym; })) return p.rhs.some((r) => isInside(ref, r));
      return false;
    }
    if (p.k === 'IncDec') return true;
    if (/Stmt$|^(If|For|Range|Return|Switch|Go|Defer|Send|Block|FuncLit|FuncDecl)$/.test(p.k)) return false;
  }
  return false;
}
function isInside(n, root) {
  for (let p = n; p; p = p.parent) if (p === root) return true;
  return false;
}

rule({
  id: 'unused-unexported', type: 'S', sev: 'MA', debt: 5, tags: ['unused'], ref: 'S1144',
  en: ['Unused unexported functions, types, variables and constants should be removed', 'Unexported declarations that nothing in the package uses are dead code.', 'Remove the declaration.'],
  ko: ['사용하지 않는 비공개 함수, 타입, 변수, 상수는 지워야 합니다', '패키지 안에서 아무도 쓰지 않는 비공개 선언은 죽은 코드입니다.', '선언을 지우세요.'],
  project(project, cx) {
    for (const pkg of project.packages) {
      if (pkg.files.every((f) => f.isTest)) continue;
      for (const s of pkg.syms) {
        if (!/^[a-z]/.test(s.name) || s.name === 'main' || s.name === 'init') continue;
        if (s.refs.length) continue;
        const pf = s.file;
        if (!pf || pf.skip || pf.isTest) continue;
        if (s.kind === 'func' && s.decl && hasDirective(pf, s.decl.line)) continue;
        if (s.kind === 'type' && pkg.methods.has(s.name)) continue;
        if (s.kind === 'var' && s.decl && s.decl.values.some((v) => A.strip(v).k === 'Call')) continue;
        const what = { func: 'function', type: 'type', var: 'variable', const: 'constant' }[s.kind] || 'declaration';
        const whatKo = { func: '함수', type: '타입', var: '변수', const: '상수' }[s.kind] || '선언';
        cx.reportIn(pf, s.node, `Remove the unused unexported ${what} '${s.name}'.`, `사용하지 않는 비공개 ${whatKo} '${s.name}'을(를) 지우세요.`);
      }
    }
  },
  bad: gf(`
func helper() int { // Noncompliant
	return 1
}

func main() {
	println("x")
}
`),
  good: gf(`
func helper() int {
	return 1
}

func main() {
	println(helper())
}
`),
});
function hasDirective(pf, line) {
  return pf.comments.some((c) => c.line === line - 1 && /^(export |go:linkname|go:noinline)/.test(c.text));
}

rule({
  id: 'redundant-paren', type: 'S', sev: 'MI', debt: 1, tags: ['confusing'], ref: 'S1110',
  en: ['Redundant pairs of parentheses should be removed', 'Doubled parentheses add nothing and suggest a mistake.', 'Remove the extra parentheses.'],
  ko: ['쓸데없는 괄호 쌍은 지워야 합니다', '겹친 괄호는 의미가 없고 실수처럼 보입니다.', '여분의 괄호를 지우세요.'],
  on: {
    Paren(n, cx) {
      if (n.x && n.x.k === 'Paren' && !(n.parent && n.parent.k === 'Paren')) cx.report(n, 'Remove these redundant parentheses.', '쓸데없는 괄호를 지우세요.');
    },
  },
  bad: gf(`
func f(a, b int) int {
	return ((a + b)) * 2 // Noncompliant
}
`),
  good: gf(`
func f(a, b int) int {
	return (a + b) * 2
}
`),
});

rule({
  id: 'goto-usage', type: 'S', sev: 'MA', debt: 10, tags: ['brain-overload'], ref: 'S907',
  en: ['"goto" statements should not be used', 'goto makes control flow hard to follow.', 'Use loops, labelled break/continue or functions.'],
  ko: ['"goto" 문을 쓰면 안 됩니다', 'goto는 제어 흐름을 따라가기 어렵게 합니다.', '반복문, 레이블 break/continue, 함수를 쓰세요.'],
  on: {
    Branch(n, cx) { if (n.tok === 'goto') cx.report(n, 'Remove this "goto" statement.', '이 "goto" 문을 지우세요.'); },
  },
  bad: gf(`
func f(n int) int {
again:
	n--
	if n > 0 {
		goto again // Noncompliant
	}
	return n
}
`),
  good: gf(`
func f(n int) int {
	for n > 0 {
		n--
	}
	return n
}
`),
});

module.exports = { cognitive, looksLikeCode };
