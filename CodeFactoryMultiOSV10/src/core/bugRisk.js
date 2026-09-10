// Bug-risk (lint) analysis: the patterns that are wrong often enough to be
// worth surfacing without running a language-specific toolchain.
//
// Ported from the Windows build's PatternBugRiskAnalyzer + MetricsBugRiskAnalyzer.
// Structural rules run on the masked source; only the resource-leak rule needs
// the original text, and it reads it line by line.

import { lineFromStarts } from './text.js';

export const BUG_RISK_CATEGORIES = {
  exceptionSwallowing: { label: '예외 무음 처리', labelEn: 'Exception swallowing', severity: 'critical' },
  deadCode: { label: '도달 불가 코드', labelEn: 'Unreachable code', severity: 'warning' },
  constantCondition: { label: '상수 조건', labelEn: 'Constant condition', severity: 'warning' },
  alwaysTrue: { label: '항상 참인 조건', labelEn: 'Always-true condition', severity: 'warning' },
  alwaysFalse: { label: '항상 거짓인 조건', labelEn: 'Always-false condition', severity: 'warning' },
  compareToSelf: { label: '자기 자신과 비교', labelEn: 'Comparison to self', severity: 'warning' },
  resourceLeak: { label: '리소스 누수', labelEn: 'Resource leak', severity: 'warning' },
  emptyBlock: { label: '빈 블록', labelEn: 'Empty block', severity: 'info' },
  asyncVoidMethod: { label: 'async void', labelEn: 'async void method', severity: 'critical' },
  highComplexityNesting: { label: '높은 복잡도 + 깊은 중첩', labelEn: 'High complexity & nesting', severity: 'critical' },
  magicNumberAbuse: { label: '매직 넘버 과다', labelEn: 'Magic number abuse', severity: 'info' },
  possiblyUnused: { label: '미사용 가능 함수', labelEn: 'Possibly unused function', severity: 'info' },
  duplicateCondition: { label: '중복 조건', labelEn: 'Duplicate condition', severity: 'warning' },
  assignInCondition: { label: '조건문 내 대입', labelEn: 'Assignment in condition', severity: 'warning' },
};

const ASYNC_VOID_RE = /\basync\s+void\s+\w+\s*[(<]/g;
const CONSTANT_BOOL_RE = /\b(if|while)\s*\(\s*(true|false)\s*\)/gi;
const SELF_COMPARE_RE = /\b(\w{2,})\s*[=!]==?\s*\1\b(?!\s*=>)/g;
const NULL_NULL_RE = /\b(?:null|nil|None)\s*[=!]==?\s*(?:null|nil|None)\b/gi;
const LITERAL_LITERAL_RE = /(?<![\w."'])(\d+)\s*[=!]==?\s*\1(?!\d)/g;
const EMPTY_CATCH_RE = /\bcatch\s*(?:\([^)\n]*\))?\s*\{\s*\}/g;
const EMPTY_BLOCK_RE = /\b(else|try|finally)\s*\{\s*\}/g;
const ASSIGN_IN_CONDITION_RE = /\b(?:if|while)\s*\(\s*[\w.]+\s*=(?!=)\s*[^=)]/g;
const TERMINATOR_RE = /^\s*(return|throw|break|continue|raise|exit|goto)\b/;

const DISPOSABLE_TYPES = [
  'FileStream', 'StreamReader', 'StreamWriter', 'BinaryReader', 'BinaryWriter',
  'MemoryStream', 'BufferedStream', 'GZipStream', 'DeflateStream',
  'SqlConnection', 'SqlCommand', 'SqlDataReader', 'SqlDataAdapter',
  'OleDbConnection', 'OdbcConnection', 'NpgsqlConnection', 'MySqlConnection',
  'HttpClient', 'WebClient', 'TcpClient', 'UdpClient', 'NetworkStream',
  'XmlReader', 'XmlWriter', 'XmlTextReader', 'XmlTextWriter',
  'Process', 'Mutex', 'Semaphore', 'AutoResetEvent', 'ManualResetEvent',
  'RegistryKey', 'WaitHandle', 'Bitmap', 'Graphics', 'Font',
];

const LEAK_RE = new RegExp(
  '(?<!using\\s*\\()(?<!await\\s)(?<![\\w.])new\\s+(' + DISPOSABLE_TYPES.join('|') + ')\\s*[<(]',
  'g',
);

/**
 * Pattern-based findings for one file.
 * @param {object} file `{path, languageId, text, masked, lineStarts}`
 */
export function scanBugRisk(file) {
  const findings = [];
  const lines = file.text.split('\n');
  const masked = file.masked;
  const lang = file.languageId;

  const add = (category, message, offset, extra) => {
    const line = lineFromStarts(file.lineStarts, offset);
    findings.push({
      category,
      severity: (BUG_RISK_CATEGORIES[category] || {}).severity || 'info',
      message,
      filePath: file.path,
      languageId: lang,
      line,
      snippet: (lines[line - 1] || '').trim().slice(0, 240),
      ...extra,
    });
  };

  const scan = (re, handler) => {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(masked)) !== null) {
      if (m[0].length === 0) {
        re.lastIndex++;
        continue;
      }
      handler(m);
    }
  };

  // 1. async void — the exception never reaches the caller (C#/VB only).
  if (lang === 'csharp' || lang === 'vbnet') {
    scan(ASYNC_VOID_RE, (m) =>
      add('asyncVoidMethod', 'async void 메서드는 예외가 호출자로 전파되지 않아 프로세스가 비정상 종료될 수 있습니다.', m.index),
    );
  }

  // 2. if(true) / if(false) — `while (true)` is idiomatic and excluded.
  scan(CONSTANT_BOOL_RE, (m) => {
    const isWhile = /^while/i.test(m[0].trim());
    const isTrue = /true/i.test(m[2]);
    if (isWhile && isTrue) return;
    add(
      isTrue ? 'alwaysTrue' : 'alwaysFalse',
      (isTrue ? '항상 참인 조건: ' : '항상 거짓인 조건: ') + m[0].trim(),
      m.index,
    );
  });

  // 3. x == x
  scan(SELF_COMPARE_RE, (m) => add('compareToSelf', '같은 값을 자기 자신과 비교합니다: ' + m[0].trim(), m.index));

  // 4. null == null
  scan(NULL_NULL_RE, (m) => add('constantCondition', 'null과 null을 비교합니다 — 결과가 항상 같습니다.', m.index));

  // 5. 1 == 1
  scan(LITERAL_LITERAL_RE, (m) =>
    add('constantCondition', '같은 리터럴 상수끼리 비교합니다 (항상 참/거짓): ' + m[0].trim(), m.index),
  );

  // 6. empty catch
  scan(EMPTY_CATCH_RE, (m) =>
    add('exceptionSwallowing', '예외를 처리하지 않는 빈 catch 블록입니다. 오류가 자동으로 무시됩니다.', m.index),
  );

  // 7. empty else / try / finally
  scan(EMPTY_BLOCK_RE, (m) => add('emptyBlock', "빈 블록: '" + m[1] + "' 블록의 본문이 비어 있습니다.", m.index));

  // 8. assignment where a comparison was probably meant
  scan(ASSIGN_IN_CONDITION_RE, (m) =>
    add('assignInCondition', '조건문 안에서 대입(=)이 수행됩니다. 비교(==)를 의도한 것인지 확인하세요.', m.index),
  );

  // 9. IDisposable created without `using` / Dispose (C#/VB).
  if (lang === 'csharp' || lang === 'vbnet') {
    scan(LEAK_RE, (m) => {
      const line = lineFromStarts(file.lineStarts, m.index);
      const text = (lines[line - 1] || '').trimStart();
      if (/^using\s/i.test(text) || /^(?:await\s+)?using\b/i.test(text)) return;
      add('resourceLeak', "'" + m[1] + "'이(가) using/Dispose 없이 생성됩니다 — 리소스가 누수될 수 있습니다.", m.index);
    });
  }

  // 10. unreachable statements after a terminator
  scanUnreachable(file, masked.split('\n'), findings, lines);

  // 11. duplicated conditions in an else-if chain
  scanDuplicateConditions(file, masked.split('\n'), findings, lines);

  return findings;
}

function scanUnreachable(file, maskedLines, findings, rawLines) {
  let depthAfterTerminator = -1;

  for (let i = 0; i < maskedLines.length; i++) {
    const text = maskedLines[i];
    const trimmed = text.trim();
    if (!trimmed) continue;

    if (depthAfterTerminator >= 0) {
      // A closing brace, `case`, `default`, a label or a decorator ends the
      // dead region legitimately — everything else after a terminator is dead.
      if (/^[})\]]/.test(trimmed) || /^(case|default|else|elif|catch|finally|except|when)\b/.test(trimmed) || /^[@#]/.test(trimmed)) {
        depthAfterTerminator = -1;
        continue;
      }
      findings.push({
        category: 'deadCode',
        severity: 'warning',
        message: 'return/throw/break 뒤에 있어 실행되지 않는 코드입니다.',
        filePath: file.path,
        languageId: file.languageId,
        line: i + 1,
        snippet: (rawLines[i] || '').trim().slice(0, 240),
      });
      depthAfterTerminator = -1;
      continue;
    }

    if (TERMINATOR_RE.test(trimmed) && !/^\s*(return|yield)\s*$/.test(trimmed)) {
      depthAfterTerminator = 0;
    }
  }
}

function scanDuplicateConditions(file, maskedLines, findings, rawLines) {
  const chain = new Map();
  let lastChainLine = -10;

  for (let i = 0; i < maskedLines.length; i++) {
    const trimmed = maskedLines[i].trim();
    const m = /^(?:\}\s*)?else\s+if\s*\((.+)\)|^if\s*\((.+)\)/.exec(trimmed);
    if (!m) continue;

    const condition = (m[1] || m[2] || '').replace(/\s+/g, '');
    const isElseIf = /else/.test(trimmed);

    if (!isElseIf || i - lastChainLine > 40) chain.clear();
    lastChainLine = i;

    if (condition && chain.has(condition)) {
      findings.push({
        category: 'duplicateCondition',
        severity: 'warning',
        message: 'else-if 체인에서 같은 조건이 반복됩니다 (' + (chain.get(condition) + 1) + '번째 줄과 동일) — 뒤쪽 분기는 실행되지 않습니다.',
        filePath: file.path,
        languageId: file.languageId,
        line: i + 1,
        snippet: (rawLines[i] || '').trim().slice(0, 240),
      });
    } else if (condition) {
      chain.set(condition, i);
    }
  }
}

/**
 * Metric-derived findings: risks that only show up once complexity has been
 * measured across the project.
 */
export function metricsBugRisk(functions, settings) {
  const findings = [];

  for (const fn of functions) {
    if (
      fn.cyclomaticComplexity >= settings.warnCyclomaticComplexity &&
      fn.maxNestingDepth >= settings.warnMaxNestingDepth
    ) {
      findings.push({
        category: 'highComplexityNesting',
        severity: 'critical',
        message:
          '순환 복잡도 ' + fn.cyclomaticComplexity + ', 중첩 깊이 ' + fn.maxNestingDepth +
          ' — 분기와 중첩이 함께 높아 결함이 숨기 쉽습니다.',
        filePath: fn.filePath,
        languageId: fn.languageId,
        line: fn.startLine,
        functionName: fn.displayName,
        snippet: fn.signature.slice(0, 240),
      });
    }

    if (fn.magicNumberCount >= settings.warnMagicNumbers * 2) {
      findings.push({
        category: 'magicNumberAbuse',
        severity: 'info',
        message: '매직 넘버 ' + fn.magicNumberCount + '개 — 이름 있는 상수로 추출하세요.',
        filePath: fn.filePath,
        languageId: fn.languageId,
        line: fn.startLine,
        functionName: fn.displayName,
        snippet: fn.signature.slice(0, 240),
      });
    }

    if (fn.isPossiblyUnused) {
      findings.push({
        category: 'possiblyUnused',
        severity: 'info',
        message: '호출 그래프에서 이 함수를 호출하는 곳을 찾지 못했습니다. 진입점·리플렉션·외부 API가 아니라면 삭제 후보입니다.',
        filePath: fn.filePath,
        languageId: fn.languageId,
        line: fn.startLine,
        functionName: fn.displayName,
        snippet: fn.signature.slice(0, 240),
      });
    }

    if (fn.emptyCatchCount > 0) {
      findings.push({
        category: 'exceptionSwallowing',
        severity: 'critical',
        message: '빈 catch 블록 ' + fn.emptyCatchCount + '개 — 예외가 조용히 무시됩니다.',
        filePath: fn.filePath,
        languageId: fn.languageId,
        line: fn.startLine,
        functionName: fn.displayName,
        snippet: fn.signature.slice(0, 240),
      });
    }
  }

  return findings;
}

const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 };

/** Sorts and indexes findings for the bug-risk view. */
export function summarizeBugRisk(findings) {
  const sorted = [...findings].sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      a.filePath.localeCompare(b.filePath) ||
      a.line - b.line,
  );

  const byCategory = new Map();
  for (const finding of sorted) {
    if (!byCategory.has(finding.category)) byCategory.set(finding.category, []);
    byCategory.get(finding.category).push(finding);
  }

  return {
    findings: sorted,
    total: sorted.length,
    criticalCount: sorted.filter((f) => f.severity === 'critical').length,
    warningCount: sorted.filter((f) => f.severity === 'warning').length,
    infoCount: sorted.filter((f) => f.severity === 'info').length,
    categories: [...byCategory.entries()]
      .map(([category, list]) => ({
        category,
        label: (BUG_RISK_CATEGORIES[category] || {}).label || category,
        labelEn: (BUG_RISK_CATEGORIES[category] || {}).labelEn || category,
        severity: (BUG_RISK_CATEGORIES[category] || {}).severity || 'info',
        count: list.length,
        findings: list,
      }))
      .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.count - a.count),
  };
}
