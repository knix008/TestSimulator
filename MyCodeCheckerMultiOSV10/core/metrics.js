'use strict';

// Line classification, size metrics, and structural issues (complexity,
// length, parameters, nesting, empty catch). Heuristic, not a full parser.

const STRUCTURAL = [
  { key: 'common:cognitive-complexity', type: 'CODE_SMELL', severity: 'CRITICAL', debtMin: 20, tags: ['complexity'], threshold: 'cognitive',
    name: { en: 'Cognitive complexity is high', ko: '인지 복잡도가 높습니다' },
    why: { en: 'A function with many nested decisions is hard to change safely.', ko: '중첩된 분기가 많은 함수는 안전하게 바꾸기 어렵습니다.' },
    fix: { en: 'Split the function and flatten the branches.', ko: '함수를 나누고 분기를 평평하게 하세요.' } },
  { key: 'common:cyclomatic-complexity', type: 'CODE_SMELL', severity: 'MAJOR', debtMin: 15, tags: ['complexity'], threshold: 'cyclomatic',
    name: { en: 'Cyclomatic complexity is high', ko: '순환 복잡도가 높습니다' },
    why: { en: 'Each decision adds a path that tests must cover.', ko: '결정마다 테스트가 덮어야 할 경로가 늘어납니다.' },
    fix: { en: 'Extract branches into named functions.', ko: '분기를 이름이 있는 함수로 빼세요.' } },
  { key: 'common:function-length', type: 'CODE_SMELL', severity: 'MAJOR', debtMin: 15, tags: ['size'], threshold: 'functionLength',
    name: { en: 'Function is too long', ko: '함수가 너무 깁니다' },
    why: { en: 'A long function mixes several jobs.', ko: '긴 함수는 여러 일을 섞습니다.' },
    fix: { en: 'Extract a part that has its own name.', ko: '이름이 따로 있는 부분을 빼세요.' } },
  { key: 'common:too-many-parameters', type: 'CODE_SMELL', severity: 'MAJOR', debtMin: 10, tags: ['design'], threshold: 'parameters',
    name: { en: 'Too many parameters', ko: '매개변수가 너무 많습니다' },
    why: { en: 'A long parameter list is easy to call in the wrong order.', ko: '긴 매개변수 목록은 순서를 틀리기 쉽습니다.' },
    fix: { en: 'Group related parameters into an object.', ko: '관련 매개변수를 객체로 묶으세요.' } },
  { key: 'common:nesting-depth', type: 'CODE_SMELL', severity: 'MAJOR', debtMin: 15, tags: ['complexity'], threshold: 'nesting',
    name: { en: 'Nesting is too deep', ko: '중첩이 너무 깊습니다' },
    why: { en: 'Deep nesting hides the main path.', ko: '깊은 중첩은 주요 경로를 숨깁니다.' },
    fix: { en: 'Return early and extract the inner block.', ko: '일찍 반환하고 안쪽 블록을 빼세요.' } },
  { key: 'common:file-length', type: 'CODE_SMELL', severity: 'MAJOR', debtMin: 30, tags: ['size'], threshold: 'fileLength',
    name: { en: 'File is too long', ko: '파일이 너무 깁니다' },
    why: { en: 'A very long file is hard to navigate and review.', ko: '아주 긴 파일은 이동하고 검토하기 어렵습니다.' },
    fix: { en: 'Split it by responsibility.', ko: '책임에 따라 나누세요.' } },
  { key: 'common:empty-catch', type: 'CODE_SMELL', severity: 'MAJOR', debtMin: 10, tags: ['error-handling'],
    name: { en: 'Empty catch', ko: '빈 catch' },
    why: { en: 'An empty catch drops the error.', ko: '빈 catch는 오류를 버립니다.' },
    fix: { en: 'Log, handle, or rethrow.', ko: '기록하거나 처리하거나 다시 던지세요.' } },
  { key: 'common:commented-code', type: 'CODE_SMELL', severity: 'MINOR', debtMin: 5, tags: ['obsolete'],
    name: { en: 'Commented-out code', ko: '주석 처리된 코드' },
    why: { en: 'Commented-out code rots and confuses the next reader.', ko: '주석 처리된 코드는 썩고 다음 독자를 혼란스럽게 합니다.' },
    fix: { en: 'Delete it. History still has it.', ko: '지우세요. 이력에 남아 있습니다.' } },
];

const DEFAULT_LIMITS = {
  cognitive: 15,
  cyclomatic: 15,
  functionLength: 80,
  parameters: 7,
  nesting: 4,
  fileLength: 1000,
};

function splitLines(text) {
  return String(text == null ? '' : text).split(/\r?\n/);
}

// Returns parallel arrays: raw lines, code with comments removed, and whether
// the raw line is entirely a comment.
function classify(text, kind) {
  const lines = splitLines(text);
  const code = [];
  const commentOnly = [];
  let block = false;
  let pyDoc = false;
  for (const line of lines) {
    let s = line;
    let only = false;
    if (kind === 'slash') {
      if (block) {
        const end = s.indexOf('*/');
        if (end >= 0) { block = false; s = s.slice(end + 2); only = s.trim() === ''; }
        else { s = ''; only = true; }
      }
      if (!block) {
        const start = indexOutside(s);
        if (start.block >= 0 && (start.line < 0 || start.block < start.line)) {
          const end = s.indexOf('*/', start.block + 2);
          if (end >= 0) s = s.slice(0, start.block) + s.slice(end + 2);
          else { block = true; s = s.slice(0, start.block); }
        } else if (start.line >= 0) {
          s = s.slice(0, start.line);
        }
        only = line.trim() !== '' && s.trim() === '' && start.line === 0 || (line.trim().startsWith('//') || line.trim().startsWith('/*') || line.trim().startsWith('*'));
        only = s.trim() === '' && line.trim() !== '';
      }
    } else if (kind === 'hash' || kind === 'dash') {
      const mark = kind === 'hash' ? '#' : '--';
      const i = s.indexOf(mark);
      if (i >= 0) s = s.slice(0, i);
      if (kind === 'hash') {
        const t = line.trim();
        if (t.startsWith('"""') || t.startsWith("'''")) pyDoc = !pyDoc || t.length > 3;
        if (pyDoc) { s = ''; only = true; }
      }
      only = only || (s.trim() === '' && line.trim() !== '');
    } else if (kind === 'xml') {
      s = s.replace(/<!--[\s\S]*?-->/g, '');
      only = s.trim() === '' && line.trim() !== '';
    }
    code.push(s);
    commentOnly.push(!!only);
  }
  return { lines, code, commentOnly };
}

function indexOutside(s) {
  // Best-effort: ignore markers that sit inside a simple quote.
  let q = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === q && s[i - 1] !== '\\') q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '/' && s[i + 1] === '/') return { line: i, block: -1 };
    if (c === '/' && s[i + 1] === '*') return { line: -1, block: i };
  }
  return { line: -1, block: -1 };
}

function metricsOf(text, kind) {
  const { lines, code, commentOnly } = classify(text, kind);
  let blank = 0;
  let comments = 0;
  let ncloc = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '') blank += 1;
    else if (commentOnly[i] || code[i].trim() === '') comments += 1;
    else ncloc += 1;
  }
  const statements = code.reduce((n, line) => n + ((line.match(/;/g) || []).length), 0);
  return {
    lines: lines.length,
    ncloc,
    commentLines: comments,
    blank,
    statements,
    commentDensity: (ncloc + comments) ? Math.round((comments / (ncloc + comments)) * 1000) / 10 : 0,
  };
}

const DECISION = /\b(if|for|while|catch|case|elif|except|when)\b|\?|&&|\|\|/;

function decisionCount(line) {
  let n = 0;
  const words = line.match(/\b(if|elif|for|while|catch|case|except|when)\b/g);
  if (words) n += words.length;
  const and = line.match(/&&|\|\|/g);
  if (and) n += and.length;
  const tern = line.match(/\?/g);
  if (tern) n += tern.length;
  return n;
}

function paramCount(header) {
  const open = header.indexOf('(');
  if (open < 0) return 0;
  let depth = 0;
  let end = -1;
  for (let i = open; i < header.length; i++) {
    if (header[i] === '(') depth += 1;
    else if (header[i] === ')') { depth -= 1; if (depth === 0) { end = i; break; } }
  }
  if (end < 0) return 0;
  const inside = header.slice(open + 1, end).trim();
  if (!inside || inside === 'void' || inside === 'self' || inside === 'this') return inside === 'self' || inside === 'this' ? 0 : 0;
  // drop trailing return types and default-looking noise by splitting on top-level commas
  const parts = [];
  let cur = '';
  let d = 0;
  for (const ch of inside) {
    if (ch === '(' || ch === '<' || ch === '[') d += 1;
    else if (ch === ')' || ch === '>' || ch === ']') d -= 1;
    if (ch === ',' && d === 0) { parts.push(cur); cur = ''; }
    else cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts.filter((p) => {
    const t = p.trim();
    return t && t !== 'self' && t !== 'this' && t !== 'void' && t !== '&self' && t !== '&mut self';
  }).length;
}

function structuralIssues(text, kind, limits) {
  const lim = { ...DEFAULT_LIMITS, ...(limits || {}) };
  const { lines, code, commentOnly } = classify(text, kind);
  const issues = [];
  const metrics = metricsOf(text, kind);
  if (metrics.ncloc > lim.fileLength) {
    issues.push(issue('common:file-length', 1, { en: `File has ${metrics.ncloc} lines of code (limit ${lim.fileLength}).`, ko: `코드 ${metrics.ncloc}줄입니다 (한계 ${lim.fileLength}).` }));
  }

  // Commented-out code: a comment line that still looks like a statement.
  const codeLike = /\b(if|for|while|return|function|const|let|var|class|def|import|public|private)\b|;\s*$/;
  for (let i = 0; i < lines.length; i++) {
    if (!commentOnly[i]) continue;
    const raw = lines[i].replace(/^\s*(\/\/|\/\*|\*|#|--)\s?/, '').trim();
    if (codeLike.test(raw) && raw.length > 8) {
      issues.push(issue('common:commented-code', i + 1, { en: 'This comment looks like code that was turned off.', ko: '이 주석은 꺼 둔 코드로 보입니다.' }));
    }
  }

  if (kind === 'hash') scanIndent(code, lines, lim, issues);
  else scanBraces(code, lines, lim, issues);
  return { issues, metrics, lines, code, commentOnly };
}

function issue(rule, line, message, extra) {
  return { rule, line, message, ...extra };
}

function looksLikeFunction(line) {
  if (/\b(function|func|fn)\b/.test(line)) return true;
  if (/=>\s*\{/.test(line)) return true;
  if (/\bdef\s+\w+\s*\(/.test(line)) return true;
  if (/\{\s*$/.test(line) && /\w+\s*\([^;]*\)\s*\{?\s*$/.test(line) && !/\b(if|for|while|switch|catch|else|do|class)\b/.test(line)) return true;
  return false;
}

function scanBraces(code, lines, lim, issues) {
  let depth = 0;
  let fn = null;
  const stack = [];
  for (let i = 0; i < code.length; i++) {
    const line = code[i];
    const opens = (line.match(/\{/g) || []).length;
    const closes = (line.match(/\}/g) || []).length;
    const looksFn = looksLikeFunction(line);
    if (looksFn && (fn == null || depth >= (fn.depth))) {
      const header = line;
      fn = {
        name: nameOf(header),
        line: i + 1,
        depth: depth + (opens ? 1 : 0),
        startDepth: depth,
        cognitive: 0,
        cyclomatic: 1,
        nest: 0,
        maxNest: 0,
        params: paramCount(header),
        end: i,
      };
      stack.push(fn);
    }
    const decisions = decisionCount(line);
    if (fn && decisions) {
      fn.cyclomatic += decisions;
      const nestAdd = Math.max(1, fn.nest);
      fn.cognitive += decisions * (fn.nest > 0 ? nestAdd : 1);
    }
    if (fn && /\b(if|for|while|catch|switch)\b/.test(line)) fn.nest += 1;
    if (fn) fn.maxNest = Math.max(fn.maxNest, fn.nest);
    // empty catch on one line, or catch { on this line and } with nothing between
    if (/\bcatch\b/.test(line) && /\{\s*\}/.test(line)) {
      issues.push(issue('common:empty-catch', i + 1, { en: 'This catch block is empty.', ko: '이 catch 블록이 비어 있습니다.' }));
    }
    depth += opens - closes;
    if (depth < 0) depth = 0;
    if (fn && /\b(if|for|while)\b/.test(line) && closes && !opens) fn.nest = Math.max(0, fn.nest - 1);
    while (stack.length && depth < stack[stack.length - 1].startDepth + (stack[stack.length - 1].depth > stack[stack.length - 1].startDepth ? 1 : 0) && closes) {
      const done = stack.pop();
      done.end = i + 1;
      emitFunction(done, lim, issues);
      fn = stack[stack.length - 1] || null;
      break;
    }
    if (fn && depth <= fn.startDepth && i > fn.line - 1 && closes) {
      fn.end = i + 1;
      emitFunction(fn, lim, issues);
      stack.pop();
      fn = stack[stack.length - 1] || null;
    }
  }
}

function scanIndent(code, lines, lim, issues) {
  const starts = [];
  for (let i = 0; i < code.length; i++) {
    const m = code[i].match(/^(\s*)def\s+(\w+)\s*\(([^)]*)\)/);
    if (!m) continue;
    starts.push({ index: i, indent: m[1].length, name: m[2], params: paramCount(code[i]), line: i + 1 });
  }
  for (let s = 0; s < starts.length; s++) {
    const cur = starts[s];
    let end = code.length;
    for (let j = cur.index + 1; j < code.length; j++) {
      if (code[j].trim() === '') continue;
      const ind = code[j].match(/^\s*/)[0].length;
      if (ind <= cur.indent && /^(def |class )/.test(code[j].trim())) { end = j; break; }
    }
    let cognitive = 0;
    let cyclomatic = 1;
    let maxNest = 0;
    const base = cur.indent;
    for (let j = cur.index + 1; j < end; j++) {
      if (code[j].trim() === '') continue;
      const ind = code[j].match(/^\s*/)[0].length;
      const nest = Math.max(0, Math.floor((ind - base) / 4));
      maxNest = Math.max(maxNest, nest);
      const d = decisionCount(code[j]);
      cyclomatic += d;
      cognitive += d * (nest > 0 ? nest : 1);
    }
    emitFunction({
      name: cur.name, line: cur.line, params: cur.params,
      cognitive, cyclomatic, maxNest, end: end, length: end - cur.index,
    }, lim, issues);
  }
}

function nameOf(header) {
  const m = header.match(/(?:function|func|fn)\s+(\w+)/) || header.match(/(\w+)\s*\(/);
  return (m && m[1]) || 'function';
}

function emitFunction(fn, lim, issues) {
  const length = fn.length || Math.max(1, (fn.end || fn.line) - fn.line);
  const where = { en: `Function ${fn.name}`, ko: `함수 ${fn.name}` };
  if (fn.cognitive > lim.cognitive) {
    issues.push(issue('common:cognitive-complexity', fn.line, {
      en: `${where.en} has cognitive complexity ${fn.cognitive} (limit ${lim.cognitive}).`,
      ko: `${where.ko}의 인지 복잡도는 ${fn.cognitive}입니다 (한계 ${lim.cognitive}).`,
    }));
  }
  if (fn.cyclomatic > lim.cyclomatic) {
    issues.push(issue('common:cyclomatic-complexity', fn.line, {
      en: `${where.en} has cyclomatic complexity ${fn.cyclomatic} (limit ${lim.cyclomatic}).`,
      ko: `${where.ko}의 순환 복잡도는 ${fn.cyclomatic}입니다 (한계 ${lim.cyclomatic}).`,
    }));
  }
  if (length > lim.functionLength) {
    issues.push(issue('common:function-length', fn.line, {
      en: `${where.en} is ${length} lines (limit ${lim.functionLength}).`,
      ko: `${where.ko}은 ${length}줄입니다 (한계 ${lim.functionLength}).`,
    }));
  }
  if (fn.params > lim.parameters) {
    issues.push(issue('common:too-many-parameters', fn.line, {
      en: `${where.en} has ${fn.params} parameters (limit ${lim.parameters}).`,
      ko: `${where.ko}의 매개변수는 ${fn.params}개입니다 (한계 ${lim.parameters}).`,
    }));
  }
  if ((fn.maxNest || 0) > lim.nesting) {
    issues.push(issue('common:nesting-depth', fn.line, {
      en: `${where.en} nests ${fn.maxNest} levels (limit ${lim.nesting}).`,
      ko: `${where.ko}의 중첩은 ${fn.maxNest}단계입니다 (한계 ${lim.nesting}).`,
    }));
  }
}

function structuralMeta() {
  return STRUCTURAL.map((r) => ({ ...r, langs: ['*'] }));
}

module.exports = {
  STRUCTURAL, DEFAULT_LIMITS, classify, metricsOf, structuralIssues, structuralMeta, splitLines, decisionCount, paramCount,
};
