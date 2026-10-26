'use strict';

// Coverity Connect workflow on top of the line rules:
// CID, merge key, impact, checker, CWE, defect events, triage,
// streams/snapshots, components, policies and an intraprocedural pass
// (null, leak, use-after-free, dead code). Not a whole-program compiler.

const crypto = require('crypto');

const IMPACT_OF = { BLOCKER: 'High', CRITICAL: 'High', MAJOR: 'Medium', MINOR: 'Low', INFO: 'Low' };
const NULLISH = 'NULL|null|nullptr|nil|None';

const KNOWN = {
  'secrets:private-key': ['SENSITIVE_DATA_LEAK', 'Security', 'CWE-798', ''],
  'secrets:aws-access-key': ['HARDCODED_CREDENTIALS', 'Security', 'CWE-798', ''],
  'secrets:github-token': ['HARDCODED_CREDENTIALS', 'Security', 'CWE-798', ''],
  'secrets:slack-token': ['HARDCODED_CREDENTIALS', 'Security', 'CWE-798', ''],
  'secrets:hardcoded-password': ['HARDCODED_CREDENTIALS', 'Security', 'CWE-798', ''],
  'secrets:hardcoded-token': ['HARDCODED_CREDENTIALS', 'Security', 'CWE-798', ''],
  'secrets:connection-string': ['HARDCODED_CREDENTIALS', 'Security', 'CWE-798', ''],
  'js:eval': ['TAINTED_STRING', 'Security', 'CWE-95', ''],
  'js:function-constructor': ['TAINTED_STRING', 'Security', 'CWE-95', ''],
  'js:innerhtml': ['XSS', 'Security', 'CWE-79', ''],
  'js:document-write': ['XSS', 'Security', 'CWE-79', ''],
  'js:dangerous-html': ['XSS', 'Security', 'CWE-79', ''],
  'js:child-process': ['OS_CMD_INJECTION', 'Security', 'CWE-78', ''],
  'js:sql-concat': ['SQLI', 'Security', 'CWE-89', ''],
  'js:timeout-string': ['TAINTED_STRING', 'Security', 'CWE-95', ''],
  'py:eval': ['TAINTED_STRING', 'Security', 'CWE-95', ''],
  'py:pickle': ['UNSAFE_DESERIALIZATION', 'Security', 'CWE-502', ''],
  'py:yaml-load': ['UNSAFE_DESERIALIZATION', 'Security', 'CWE-502', ''],
  'py:shell-true': ['OS_CMD_INJECTION', 'Security', 'CWE-78', ''],
  'py:os-system': ['OS_CMD_INJECTION', 'Security', 'CWE-78', ''],
  'py:sql-format': ['SQLI', 'Security', 'CWE-89', ''],
  'java:runtime-exec': ['OS_CMD_INJECTION', 'Security', 'CWE-78', ''],
  'java:sql-concat': ['SQLI', 'Security', 'CWE-89', ''],
  'java:xxe': ['XML_EXTERNAL_ENTITY', 'Security', 'CWE-611', ''],
  'go:sql-concat': ['SQLI', 'Security', 'CWE-89', ''],
  'c:strcpy': ['BUFFER_SIZE', 'Quality', 'CWE-120', 'CERT STR31-C'],
  'c:scanf-s': ['BUFFER_SIZE', 'Quality', 'CWE-120', 'CERT STR31-C'],
  'c:system': ['OS_CMD_INJECTION', 'Security', 'CWE-78', ''],
  'rs:unwrap': ['UNCAUGHT_EXCEPT', 'Quality', 'CWE-248', ''],
};

const PATH_CHECKERS = [
  spec('cov:FORWARD_NULL', 'FORWARD_NULL', 'BUG', 'CRITICAL', 'Quality', 'CWE-476', 'CERT EXP34-C', 'Null pointer dereferences',
    ['c', 'cpp', 'java', 'js', 'ts', 'cs', 'py', 'go', 'kt'],
    { en: 'Dereference after a null check failed', ko: '널이라고 본 값을 역참조합니다' },
    { en: 'The condition says this value is null, and a later statement still uses it.', ko: '조건은 이 값이 널이라고 말하는데, 이어서 그 값을 사용합니다.' },
    { en: 'Return or assign a new value before using it.', ko: '쓰기 전에 반환하거나 새 값을 넣으세요.' }),
  spec('cov:NULL_RETURNS', 'NULL_RETURNS', 'BUG', 'CRITICAL', 'Quality', 'CWE-476', 'CERT EXP34-C', 'Null pointer dereferences',
    ['c', 'cpp'],
    { en: 'Allocator result used without a null check', ko: '할당 결과를 널 확인 없이 사용합니다' },
    { en: 'malloc, calloc, realloc and strdup can return null.', ko: 'malloc, calloc, realloc, strdup는 널을 반환할 수 있습니다.' },
    { en: 'Check the pointer before dereferencing it.', ko: '역참조하기 전에 포인터를 확인하세요.' }),
  spec('cov:RESOURCE_LEAK', 'RESOURCE_LEAK', 'BUG', 'MAJOR', 'Quality', 'CWE-401', 'CERT MEM31-C', 'Resource leaks',
    ['c', 'cpp'],
    { en: 'Allocated resource is not released', ko: '할당한 자원을 해제하지 않습니다' },
    { en: 'The pointer leaves the function without free or fclose.', ko: '함수가 끝나도록 free나 fclose가 없습니다.' },
    { en: 'Free it on every path, or return ownership to the caller.', ko: '모든 경로에서 해제하거나 소유권을 호출자에게 넘기세요.' }),
  spec('cov:USE_AFTER_FREE', 'USE_AFTER_FREE', 'BUG', 'CRITICAL', 'Quality', 'CWE-416', 'CERT MEM30-C', 'Memory - illegal accesses',
    ['c', 'cpp'],
    { en: 'Use after free', ko: '해제한 뒤 사용합니다' },
    { en: 'This pointer was already passed to free or fclose.', ko: '이 포인터는 이미 free나 fclose에 전달되었습니다.' },
    { en: 'Do not use the pointer after it is released.', ko: '해제한 포인터는 다시 쓰지 마세요.' }),
  spec('cov:DOUBLE_FREE', 'DOUBLE_FREE', 'BUG', 'CRITICAL', 'Quality', 'CWE-415', 'CERT MEM30-C', 'Memory - corruptions',
    ['c', 'cpp'],
    { en: 'Double free', ko: '두 번 해제합니다' },
    { en: 'The same pointer is released twice.', ko: '같은 포인터를 두 번 해제합니다.' },
    { en: 'Release it once, or set it to null after the first free.', ko: '한 번만 해제하거나, 첫 해제 뒤에 널로 두세요.' }),
  spec('cov:DIVIDE_BY_ZERO', 'DIVIDE_BY_ZERO', 'BUG', 'CRITICAL', 'Quality', 'CWE-369', '', 'Integer handling issues',
    ['c', 'cpp', 'java', 'js', 'ts', 'cs', 'py', 'go', 'kt', 'php', 'rb'],
    { en: 'Division by zero', ko: '0으로 나눕니다' },
    { en: 'A divisor of 0 crashes or yields NaN.', ko: '나누는 값이 0이면 죽거나 NaN이 됩니다.' },
    { en: 'Guard the divisor.', ko: '나누는 값을 확인하세요.' }),
  spec('cov:DEADCODE', 'DEADCODE', 'BUG', 'MAJOR', 'Quality', 'CWE-561', 'CERT MSC12-C', 'Control flow issues',
    ['c', 'cpp', 'java', 'js', 'ts', 'cs', 'py', 'go', 'kt'],
    { en: 'Dead code', ko: '도달할 수 없는 조건입니다' },
    { en: 'The condition is a constant false.', ko: '조건이 항상 거짓입니다.' },
    { en: 'Delete the branch or fix the condition.', ko: '분기를 지우거나 조건을 고치세요.' }),
  spec('cov:UNREACHABLE', 'UNREACHABLE', 'BUG', 'MAJOR', 'Quality', 'CWE-561', 'CERT MSC12-C', 'Control flow issues',
    ['c', 'cpp', 'java', 'js', 'ts', 'cs'],
    { en: 'Unreachable code', ko: '도달하지 않는 코드입니다' },
    { en: 'A return or throw already left this block.', ko: 'return이나 throw가 이미 이 블록을 떠났습니다.' },
    { en: 'Remove the statement or move it before the return.', ko: '문장을 지우거나 return 앞으로 옮기세요.' }),
  spec('cov:IDENTICAL_BRANCHES', 'IDENTICAL_BRANCHES', 'BUG', 'MINOR', 'Quality', 'CWE-570', '', 'Control flow issues',
    ['c', 'cpp', 'java', 'js', 'ts', 'cs'],
    { en: 'Identical branches', ko: '같은 분기입니다' },
    { en: 'Both sides of the if do the same thing.', ko: 'if의 양쪽이 같은 일을 합니다.' },
    { en: 'Make the branches differ, or drop the condition.', ko: '분기를 다르게 하거나 조건을 지우세요.' }),
  spec('cov:LOCK', 'LOCK', 'BUG', 'MAJOR', 'Quality', 'CWE-667', '', 'Concurrency',
    ['c', 'cpp', 'java'],
    { en: 'Missing unlock', ko: '잠금을 풀지 않습니다' },
    { en: 'A lock was taken and not released before the function returned.', ko: '잠금을 얻었지만 함수가 끝나기 전에 풀지 않습니다.' },
    { en: 'Unlock on every path.', ko: '모든 경로에서 잠금을 푸세요.' }),
  spec('cov:UNINIT', 'UNINIT', 'BUG', 'MAJOR', 'Quality', 'CWE-457', 'CERT EXP33-C', 'Uninitialized variables',
    ['c', 'cpp'],
    { en: 'Uninitialized variable', ko: '초기화하지 않은 변수입니다' },
    { en: 'The variable is read before it is assigned.', ko: '대입보다 먼저 읽습니다.' },
    { en: 'Assign it before the read.', ko: '읽기 전에 값을 넣으세요.' }),
];

function spec(key, checker, type, severity, kind, cwe, cert, category, langs, name, why, fix) {
  return {
    key, checker, type, severity: severity || 'MAJOR', impact: IMPACT_OF[severity] || 'Medium', kind, cwe, cert, category, langs,
    name, why, fix, debtMin: type === 'BUG' ? 15 : 10, tags: ['coverity', cwe.toLowerCase()].filter(Boolean),
  };
}

const BY_KEY = new Map(PATH_CHECKERS.map((c) => [c.key, c]));

function checkerCatalog() {
  return PATH_CHECKERS.map((c) => ({
    key: c.key,
    langs: c.langs,
    type: c.type,
    severity: c.severity,
    debtMin: c.debtMin,
    tags: c.tags,
    name: c.name,
    why: c.why,
    fix: c.fix,
    checker: c.checker,
    category: c.category,
    cwe: c.cwe,
    cert: c.cert,
  }));
}

// Coverity checker names for findings of the other engines, by rule id words
// first, then by CWE. Category names follow Coverity Connect's groups.
const BY_WORDS = [
  [/null-?(pointer|deref|dereference)|npe|forward-null|nullable-deref|optional-get/, 'FORWARD_NULL', 'Null pointer dereferences'],
  [/null-returns?|returns?-null/, 'NULL_RETURNS', 'Null pointer dereferences'],
  [/reverse-inull|null-check-after|redundant-null/, 'REVERSE_INULL', 'Null pointer dereferences'],
  [/resource-leak|not-closed|unclosed|disposable-not-disposed|close-resource|leak/, 'RESOURCE_LEAK', 'Resource leaks'],
  [/guarded-by|synchroniz|lock-not-released|missing-lock|unlock/, 'GUARDED_BY_VIOLATION', 'Concurrent data access violations'],
  [/double-checked|singleton-race|lazy-init/, 'SINGLETON_RACE', 'Concurrent data access violations'],
  [/atomic|check-then-act|race/, 'ATOMICITY', 'Concurrent data access violations'],
  [/wait-not-in-loop|wait-cond/, 'BAD_CHECK_OF_WAIT_COND', 'Concurrent data access violations'],
  [/infinite-loop|loop-never-ends|endless/, 'INFINITE_LOOP', 'Control flow issues'],
  [/identical-branch|same-branch|all-branches-same|duplicate-branch/, 'IDENTICAL_BRANCHES', 'Incorrect expression'],
  [/copy-paste|duplicated-condition|duplicate-condition/, 'COPY_PASTE_ERROR', 'Incorrect expression'],
  [/identical-operand|self-compar|self-assign|useless-assign|no-effect|ignored-result|result-unused|pure-call-ignored/, 'NO_EFFECT', 'Incorrect expression'],
  [/dead-store|unused-value|overwritten|unused-assign/, 'UNUSED_VALUE', 'Code maintainability issues'],
  [/unreachable|dead-code|after-return/, 'UNREACHABLE', 'Control flow issues'],
  [/always-(true|false)|constant-condition|gratuitous|condition-always/, 'CONSTANT_EXPRESSION_RESULT', 'Incorrect expression'],
  [/missing-break|fall-?through/, 'MISSING_BREAK', 'Control flow issues'],
  [/equals|reference-equal|string-compar|bad-eq/, 'BAD_EQ', 'Incorrect expression'],
  [/integer-division|int-division/, 'UNINTENDED_INTEGER_DIVISION', 'Integer handling issues'],
  [/overflow-before-widen|widening/, 'OVERFLOW_BEFORE_WIDEN', 'Integer handling issues'],
  [/divide-by-zero|division-by-zero/, 'DIVIDE_BY_ZERO', 'Integer handling issues'],
  [/swapped-arg|argument-order/, 'SWAPPED_ARGUMENTS', 'API usage errors'],
  [/super-call|call-super/, 'CALL_SUPER', 'API usage errors'],
  [/ignored-return|unchecked-return|return-value-ignored|checked-return/, 'CHECKED_RETURN', 'Error handling issues'],
  [/stray-semicolon|empty-statement/, 'STRAY_SEMICOLON', 'Control flow issues'],
  [/indent|misleading/, 'NESTING_INDENT_MISMATCH', 'Control flow issues'],
  [/uninit/, 'UNINIT', 'Uninitialized variables'],
  [/use-after-free|disposed-object-used/, 'USE_AFTER_FREE', 'Memory - illegal accesses'],
];

const BY_CWE = {
  476: 'FORWARD_NULL', 690: 'NULL_RETURNS', 404: 'RESOURCE_LEAK', 772: 'RESOURCE_LEAK', 775: 'RESOURCE_LEAK', 401: 'RESOURCE_LEAK',
  362: 'ATOMICITY', 366: 'ATOMICITY', 567: 'GUARDED_BY_VIOLATION', 667: 'LOCK', 833: 'ORDER_REVERSAL', 835: 'INFINITE_LOOP',
  561: 'UNREACHABLE', 563: 'UNUSED_VALUE', 570: 'CONSTANT_EXPRESSION_RESULT', 571: 'CONSTANT_EXPRESSION_RESULT', 484: 'MISSING_BREAK',
  252: 'CHECKED_RETURN', 369: 'DIVIDE_BY_ZERO', 190: 'INTEGER_OVERFLOW', 457: 'UNINIT', 416: 'USE_AFTER_FREE', 597: 'BAD_EQ', 595: 'BAD_EQ',
  89: 'SQLI', 79: 'XSS', 22: 'PATH_MANIPULATION', 23: 'PATH_MANIPULATION', 78: 'OS_CMD_INJECTION', 77: 'OS_CMD_INJECTION',
  798: 'HARDCODED_CREDENTIALS', 259: 'HARDCODED_CREDENTIALS', 321: 'HARDCODED_CREDENTIALS', 327: 'RISKY_CRYPTO', 326: 'RISKY_CRYPTO',
  328: 'WEAK_PASSWORD_HASH', 916: 'WEAK_PASSWORD_HASH', 759: 'WEAK_PASSWORD_HASH', 330: 'INSECURE_RANDOM', 338: 'INSECURE_RANDOM',
  611: 'XML_EXTERNAL_ENTITY', 502: 'UNSAFE_DESERIALIZATION', 601: 'OPEN_REDIRECT', 352: 'CSRF', 384: 'SESSION_FIXATION',
  614: 'INSECURE_COOKIE', 1004: 'INSECURE_COOKIE', 90: 'LDAP_INJECTION', 643: 'XPATH_INJECTION', 94: 'CODE_INJECTION', 95: 'CODE_INJECTION',
  117: 'LOG_INJECTION', 113: 'HEADER_INJECTION', 918: 'SSRF', 295: 'BAD_CERT_VERIFICATION', 297: 'BAD_CERT_VERIFICATION',
  319: 'CLEARTEXT_TRANSMISSION', 532: 'SENSITIVE_DATA_LEAK', 200: 'SENSITIVE_DATA_LEAK', 209: 'INFORMATION_EXPOSURE', 489: 'DEBUG_CODE',
  434: 'UNRESTRICTED_UPLOAD', 807: 'UNTRUSTED_SECURITY_DECISION', 488: 'SERVLET_ATOMICITY', 495: 'EXPOSED_PRIVATE_ARRAY', 496: 'EXPOSED_PRIVATE_ARRAY',
  350: 'DNS_TRUST', 676: 'DANGEROUS_API', 615: 'SENSITIVE_DATA_LEAK', 307: 'LOGIN_THROTTLING',
};

const SECURITY_CHECKERS = new Set(['SQLI', 'XSS', 'PATH_MANIPULATION', 'OS_CMD_INJECTION', 'HARDCODED_CREDENTIALS', 'RISKY_CRYPTO', 'WEAK_PASSWORD_HASH',
  'INSECURE_RANDOM', 'XML_EXTERNAL_ENTITY', 'UNSAFE_DESERIALIZATION', 'OPEN_REDIRECT', 'CSRF', 'SESSION_FIXATION', 'INSECURE_COOKIE', 'LDAP_INJECTION',
  'XPATH_INJECTION', 'CODE_INJECTION', 'LOG_INJECTION', 'HEADER_INJECTION', 'SSRF', 'BAD_CERT_VERIFICATION', 'CLEARTEXT_TRANSMISSION', 'SENSITIVE_DATA_LEAK',
  'INFORMATION_EXPOSURE', 'DEBUG_CODE', 'UNRESTRICTED_UPLOAD', 'UNTRUSTED_SECURITY_DECISION', 'SERVLET_ATOMICITY', 'EXPOSED_PRIVATE_ARRAY', 'DNS_TRUST',
  'DANGEROUS_API', 'LOGIN_THROTTLING']);

function mappedChecker(issue, cweNum) {
  const id = String(issue.rule || '').split(':').slice(1).join(':').toLowerCase();
  if (/^(sem-|kr-secure|taint|absint)/.test(String(issue.rule || '')) || id) {
    for (const [re, name, category] of BY_WORDS) if (re.test(id)) return { checker: name, category };
  }
  if (cweNum && BY_CWE[cweNum]) {
    const name = BY_CWE[cweNum];
    return { checker: name, category: SECURITY_CHECKERS.has(name) ? 'Security best practices violations' : 'Control flow issues' };
  }
  return null;
}

function checkerFor(issue) {
  const known = KNOWN[issue.rule];
  if (known) {
    return { checker: known[0], kind: known[1], cwe: known[2], cert: known[3], category: known[1] === 'Security' ? 'Security' : 'Code maintainability' };
  }
  const path = BY_KEY.get(issue.rule);
  if (path) return path;
  const tags = issue.tags || [];
  const cweTag = tags.find((t) => /^cwe-?\d+/i.test(t));
  const cwe = cweTag ? cweTag.toUpperCase().replace('CWE', 'CWE-').replace('--', '-') : (issue.cwe || '');
  const security = issue.type === 'VULNERABILITY' || issue.type === 'SECURITY_HOTSPOT';
  const mapped = issue.type === 'CODE_SMELL' && !/^(sem-|kr-secure|taint)/.test(String(issue.rule || '')) ? null : mappedChecker(issue, Number(String(cwe).replace(/\D/g, '')) || 0);
  if (mapped) {
    return { checker: mapped.checker, kind: security || SECURITY_CHECKERS.has(mapped.checker) ? 'Security' : 'Quality', cwe, cert: '', category: mapped.category };
  }
  return {
    checker: String(issue.rule || 'UNKNOWN').replace(/[:.]/g, '_').replace(/-/g, '_').toUpperCase(),
    kind: security ? 'Security' : 'Quality',
    cwe,
    cert: '',
    category: security ? 'Security' : (issue.type === 'BUG' ? 'Control flow issues' : 'Code maintainability'),
  };
}

function cidFor(mergeKey) {
  return parseInt(crypto.createHash('sha1').update(String(mergeKey)).digest('hex').slice(0, 8), 16);
}

function normMessage(message) {
  const text = message && typeof message === 'object' ? (message.en || message.ko || '') : message;
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, 180);
}

function functionAt(lines, index) {
  for (let i = index; i >= 0 && i >= index - 80; i--) {
    const line = lines[i] || '';
    const named = line.match(/\b(?:function|func|fn|def)\s+([A-Za-z_]\w*)/);
    if (named) return { name: named[1], line: i + 1 };
    const sig = line.match(/\b([A-Za-z_]\w*)\s*\([^;]*\)\s*\{?\s*$/);
    if (sig && !/^(if|for|while|switch|catch|else|return|sizeof)$/.test(sig[1])) return { name: sig[1], line: i + 1 };
  }
  return { name: 'global', line: 1 };
}

const SONAR_KEY = /^([a-z]+:)?S\d+$/;

function decorateIssue(issue, lines, components) {
  const meta = checkerFor(issue);
  const fn = functionAt(lines || [], Math.max(0, (issue.line || 1) - 1));
  const mergeKey = `${meta.checker}|${issue.file}|${fn.name}|${normMessage(issue.message)}`;
  const comp = componentFor(issue.file, components);
  const events = issue.events && issue.events.length ? issue.events : defaultEvents(issue, lines || [], fn);
  return {
    ...issue,
    cid: cidFor(mergeKey),
    mergeKey,
    // Engines may put a Sonar key (S2259, python:S2068) in checker; keep it aside.
    checker: issue.checker && !SONAR_KEY.test(issue.checker) ? issue.checker : meta.checker,
    ...(issue.checker && SONAR_KEY.test(issue.checker) ? { sonarKey: issue.checker } : {}),
    category: meta.category,
    kind: meta.kind,
    cwe: meta.cwe || '',
    cert: meta.cert || '',
    impact: issue.impact || IMPACT_OF[issue.severity] || 'Medium',
    function: fn.name,
    events,
    component: comp.name,
    componentOwner: comp.owner || '',
    classification: issue.classification || 'Unclassified',
    action: issue.action || 'Undecided',
    owner: issue.owner || issue.assignee || '',
  };
}

function defaultEvents(issue, lines, fn) {
  const events = [];
  if (fn.name !== 'global') {
    events.push({ line: fn.line, tag: 'path', text: { en: `In ${fn.name}`, ko: `${fn.name} 안에서` }, main: false });
  }
  const from = Math.max(0, (issue.line || 1) - 35);
  for (let i = (issue.line || 1) - 2; i >= from; i--) {
    if (/^\s*(if|else if|while|for)\b/.test(lines[i] || '')) {
      events.push({ line: i + 1, tag: 'branch', text: { en: 'Following this condition', ko: '이 조건을 따라갑니다' }, main: false });
      break;
    }
  }
  const sink = lines[(issue.line || 1) - 1] || '';
  const ident = (sink.match(/\b([A-Za-z_]\w{1,40})\b/g) || []).find((name) => !/^(if|return|const|let|var|function|new|void|int)$/.test(name));
  if (ident) {
    const re = new RegExp(`\\b${escRe(ident)}\\s*=[^=]`);
    for (let i = (issue.line || 1) - 2; i >= from; i--) {
      if (re.test(lines[i] || '')) {
        events.push({ line: i + 1, tag: 'assign', text: { en: `${ident} is assigned here`, ko: `여기서 ${ident}에 값을 넣습니다` }, main: false });
        break;
      }
    }
  }
  events.push({ line: issue.line, tag: 'main', text: issue.message, main: true });
  return events.slice(-6);
}

function componentFor(file, components) {
  const rel = String(file || '').replace(/\\/g, '/');
  for (const component of components || []) {
    const patterns = component.patterns || [];
    if (patterns.some((p) => glob(rel, p))) return { name: component.name || 'Other', owner: component.owner || '' };
  }
  return { name: 'Other', owner: '' };
}

function glob(rel, pattern) {
  let p = String(pattern || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!p) return false;
  const body = p.split('**').map((part) => part.split('*').map((s) => s.replace(/[.+^${}()|[\]\\]/g, '\\$&')).join('[^/]*')).join('.*');
  return new RegExp(`(?:^|/)${body}$`, 'i').test(rel);
}

function isDismissed(issue) {
  if (!issue) return false;
  if (issue.classification === 'False Positive' || issue.classification === 'Intentional') return true;
  if (issue.action === 'Ignore') return true;
  if (issue.resolution === 'FALSE-POSITIVE' || issue.resolution === 'WONTFIX') return true;
  return false;
}

function summarizeCoverity(issues, options = {}) {
  const previous = new Set(options.previousCids || []);
  const hasBaseline = previous.size > 0 || options.hasBaseline;
  const byChecker = {};
  const byComponent = {};
  const byImpact = { High: 0, Medium: 0, Low: 0 };
  let outstanding = 0;
  let outstandingHigh = 0;
  let dismissed = 0;
  let newlyDetected = 0;
  let newHigh = 0;
  let newHighSecurity = 0;
  const cids = [];
  for (const issue of issues) {
    if (issue.cid) cids.push(issue.cid);
    const dismissedIssue = isDismissed(issue);
    const isNew = !hasBaseline || !previous.has(issue.cid);
    issue.coverityStatus = dismissedIssue ? 'Dismissed' : (isNew ? 'New' : 'Outstanding');
    if (dismissedIssue) { dismissed += 1; continue; }
    outstanding += 1;
    if (issue.impact === 'High') outstandingHigh += 1;
    byImpact[issue.impact] = (byImpact[issue.impact] || 0) + 1;
    byChecker[issue.checker] = (byChecker[issue.checker] || 0) + 1;
    byComponent[issue.component || 'Other'] = (byComponent[issue.component || 'Other'] || 0) + 1;
    if (isNew) {
      newlyDetected += 1;
      if (issue.impact === 'High') newHigh += 1;
      if (issue.impact === 'High' && issue.kind === 'Security') newHighSecurity += 1;
    }
  }
  const reference = !hasBaseline;
  const stats = {
    outstanding,
    outstandingHigh,
    dismissed,
    newlyDetected,
    newHigh,
    newHighSecurity,
    policyNewHigh: reference ? 0 : newHigh,
    policyNewHighSecurity: reference ? 0 : newHighSecurity,
    byChecker,
    byComponent,
    byImpact,
    cids,
    reference,
  };
  const fixed = fixedDefects(options.previousIssues, new Set(cids));
  stats.fixed = fixed.length;
  const policy = evaluatePolicy(options.policy || DEFAULT_POLICY, stats);
  return { ...stats, fixedDefects: fixed.slice(0, 300), policy };
}

function fixedDefects(previousIssues, current) {
  const out = [];
  const seen = new Set();
  for (const issue of previousIssues || []) {
    if (!issue || !issue.cid || seen.has(issue.cid) || current.has(issue.cid) || isDismissed(issue)) continue;
    seen.add(issue.cid);
    out.push({
      cid: issue.cid,
      checker: issue.checker,
      impact: issue.impact,
      file: issue.file,
      line: issue.line,
      function: issue.function,
      message: issue.message,
      component: issue.component,
      coverityStatus: 'Fixed',
    });
  }
  return out;
}

const DEFAULT_POLICY = {
  id: 'coverity-default',
  name: { en: 'Coverity default', ko: 'Coverity 기본' },
  isDefault: true,
  conditions: [
    { metric: 'policyNewHighSecurity', op: 'GT', threshold: 0 },
    { metric: 'policyNewHigh', op: 'GT', threshold: 0 },
  ],
};

const VIEWS = [
  { id: 'outstanding', name: { en: 'Outstanding', ko: '미해결' } },
  { id: 'new', name: { en: 'Newly detected', ko: '새로 발견' } },
  { id: 'high', name: { en: 'High impact', ko: '영향 높음' } },
  { id: 'dismissed', name: { en: 'Dismissed', ko: '기각' } },
  { id: 'fixed', name: { en: 'Fixed', ko: '수정됨' } },
];

function evaluatePolicy(policy, stats) {
  const conditions = (policy && policy.conditions ? policy.conditions : []).map((c) => {
    const actual = Number(stats[c.metric] || 0);
    const threshold = Number(c.threshold || 0);
    let fail = false;
    if (c.op === 'GT') fail = actual > threshold;
    else if (c.op === 'LT') fail = actual < threshold;
    else fail = actual !== threshold;
    return { metric: c.metric, op: c.op, threshold, actual, status: fail ? 'ERROR' : 'OK' };
  });
  return {
    id: policy && policy.id,
    name: policy && policy.name,
    status: conditions.some((c) => c.status === 'ERROR') ? 'ERROR' : 'OK',
    conditions,
  };
}

function pathDefects(text, lang, file, options = {}) {
  const inactive = new Set(options.inactive || []);
  const lines = String(text || '').split(/\r?\n/);
  const findings = [];
  const enabled = (key) => !inactive.has(key) && allows(key, lang);
  const py = lang === 'py';
  let depth = 0;
  let fn = 'global';
  let fnLine = 1;
  const alloc = new Map();
  const freed = new Set();
  const uninit = new Map();
  const guards = [];
  const nullArms = [];
  let locks = [];
  let returnDepth = -1;

  const flush = (atLine) => {
    if (enabled('cov:RESOURCE_LEAK')) {
      for (const [name, line] of alloc) {
        findings.push(found('cov:RESOURCE_LEAK', atLine, { en: `${name} is not freed`, ko: `${name}을 해제하지 않습니다` }, [
          ev(line, 'alloc', { en: `${name} is allocated here`, ko: `여기서 ${name}을 할당합니다` }),
          ev(atLine, 'leak', { en: `End of ${fn} without a free`, ko: `${fn}이 끝날 때까지 해제가 없습니다` }, true),
        ]));
      }
    }
    if (enabled('cov:LOCK')) {
      for (const lock of locks) {
        findings.push(found('cov:LOCK', atLine, { en: 'Lock is not released', ko: '잠금을 풀지 않습니다' }, [
          ev(lock, 'lock', { en: 'Lock acquired', ko: '잠금을 얻습니다' }),
          ev(atLine, 'main', { en: `End of ${fn}`, ko: `${fn}의 끝` }, true),
        ]));
      }
    }
    alloc.clear();
    freed.clear();
    uninit.clear();
    locks = [];
    returnDepth = -1;
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const code = codeOf(raw, lang);
    if (py) depth = indentOf(raw);
    guards.splice(0, guards.length, ...guards.filter((g) => depth >= g.depth));
    for (let a = nullArms.length - 1; a >= 0; a--) {
      if (depth < nullArms[a].depth || i > nullArms[a].limit) nullArms.splice(a, 1);
    }

    if ((!py && depth === 0) || (py && indentOf(raw) === 0)) {
      const sig = functionName(code);
      if (sig && sig !== fn) {
        flush(Math.max(1, i));
        fn = sig;
        fnLine = i + 1;
      }
    }
    if (returnDepth >= 0 && depth < returnDepth) returnDepth = -1;
    if (enabled('cov:UNREACHABLE') && returnDepth >= 0 && depth >= returnDepth && code.trim() && !/^\s*[{}]/.test(code) && !/^\s*(else|catch|finally|case|default)\b/.test(code)) {
      findings.push(found('cov:UNREACHABLE', i + 1, { en: 'This statement is unreachable', ko: '이 문장에는 도달하지 않습니다' }, [
        ev(Math.max(1, i), 'path', { en: 'Returned above this block', ko: '이 블록 위에서 이미 반환했습니다' }),
        ev(i + 1, 'main', { en: 'Unreachable', ko: '도달하지 않음' }, true),
      ]));
      returnDepth = -1;
    }

    const positive = positiveGuard(code);
    if (positive) guards.push({ name: positive, depth: depth + 1 });
    const negative = negativeGuard(code);
    if (negative && enabled('cov:FORWARD_NULL')) {
      const after = code.replace(/^[\s\S]*\)/, '');
      if (derefs(after, negative) && !/^\s*(return|throw|break|continue)\b/.test(after)) {
        findings.push(found('cov:FORWARD_NULL', i + 1, { en: `${negative} is null on this path`, ko: `이 경로에서 ${negative}은 널입니다` }, [
          ev(i + 1, 'branch', { en: `Assuming ${negative} is null`, ko: `${negative}이 널이라고 가정합니다` }),
          ev(i + 1, 'deref', { en: `${negative} is dereferenced`, ko: `${negative}을 역참조합니다` }, true),
        ]));
      } else {
        nullArms.push({ name: negative, depth: depth + 1, line: i + 1, limit: i + 12 });
      }
    }
    if (/^\s*(return|throw)\b/.test(code) && !/\bif\b/.test(code)) {
      for (const name of [...alloc.keys()]) {
        if (new RegExp(`\\b${escRe(name)}\\b`).test(code)) alloc.delete(name);
      }
      if (/;\s*$/.test(code.trim()) || py) returnDepth = depth;
    } else if (/\breturn\b/.test(code)) {
      for (const name of [...alloc.keys()]) {
        if (new RegExp(`\\b${escRe(name)}\\b`).test(code)) alloc.delete(name);
      }
    }

    seeAlloc(code, i + 1, alloc, lang, options.models);
    seeUninit(code, i + 1, uninit, lang);
    const freeName = freeCall(code);
    if (freeName) {
      if (freed.has(freeName) && enabled('cov:DOUBLE_FREE')) {
        findings.push(found('cov:DOUBLE_FREE', i + 1, { en: `${freeName} is freed twice`, ko: `${freeName}을 두 번 해제합니다` }, [
          ev(i + 1, 'main', { en: 'Second free', ko: '두 번째 해제' }, true),
        ]));
      }
      freed.add(freeName);
      alloc.delete(freeName);
      uninit.delete(freeName);
    }
    if (/pthread_mutex_lock\s*\(|\.lock\s*\(\s*\)/.test(code) && !/unlock/.test(code)) locks.push(i + 1);
    if (/pthread_mutex_unlock\s*\(|\.unlock\s*\(\s*\)/.test(code)) locks.pop();

    if (enabled('cov:DIVIDE_BY_ZERO') && /\/\s*0(?:\.0+)?\b/.test(stripStrings(code)) && !/^\s*\/[/*]/.test(code)) {
      findings.push(found('cov:DIVIDE_BY_ZERO', i + 1, { en: 'Divisor is zero', ko: '나누는 값이 0입니다' }, [
        ev(i + 1, 'main', { en: 'Division by zero', ko: '0으로 나눔' }, true),
      ]));
    }
    if (enabled('cov:DEADCODE') && /^\s*if\s*\(\s*(?:0|false|FALSE)\s*\)/.test(code)) {
      findings.push(found('cov:DEADCODE', i + 1, { en: 'Condition is always false', ko: '조건이 항상 거짓입니다' }, [
        ev(i + 1, 'main', { en: 'Dead code', ko: '죽은 코드' }, true),
      ]));
    }

    for (const arm of nullArms) {
      if (arm.fired || i + 1 === arm.line) continue;
      if (assigns(code, arm.name) || /^\s*(return|throw|break|continue)\b/.test(code)) {
        arm.fired = true;
        continue;
      }
      if (derefs(code, arm.name)) {
        arm.fired = true;
        findings.push(found('cov:FORWARD_NULL', i + 1, { en: `${arm.name} is null on this path`, ko: `이 경로에서 ${arm.name}은 널입니다` }, [
          ev(arm.line, 'branch', { en: `Assuming ${arm.name} is null`, ko: `${arm.name}이 널이라고 가정합니다` }),
          ev(i + 1, 'deref', { en: `${arm.name} is dereferenced`, ko: `${arm.name}을 역참조합니다` }, true),
        ]));
      }
    }

    if (enabled('cov:USE_AFTER_FREE')) {
      for (const name of freed) {
        if (!uses(code, name) || freeCall(code) === name) continue;
        findings.push(found('cov:USE_AFTER_FREE', i + 1, { en: `${name} is used after it was freed`, ko: `해제한 ${name}을 사용합니다` }, [
          ev(i + 1, 'main', { en: 'Use after free', ko: '해제한 뒤 사용' }, true),
        ]));
        freed.delete(name);
        break;
      }
    }

    if (enabled('cov:NULL_RETURNS')) {
      for (const [name] of alloc) {
        if (!derefs(code, name)) continue;
        const guarded = positive === name || guards.some((g) => g.name === name && depth >= g.depth);
        if (guarded) continue;
        if (alloc.get(name) === i + 1 && !derefs(code.split('=').slice(1).join('='), name)) continue;
        findings.push(found('cov:NULL_RETURNS', i + 1, { en: `${name} may be null`, ko: `${name}이 널일 수 있습니다` }, [
          ev(alloc.get(name), 'alloc', { en: `${name} comes from an allocator`, ko: `${name}은 할당 결과입니다` }),
          ev(i + 1, 'deref', { en: 'Dereferenced without a null check', ko: '널 확인 없이 역참조합니다' }, true),
        ]));
        guards.push({ name, depth: 0 });
      }
    }

    if (enabled('cov:UNINIT')) {
      for (const [name, line] of uninit) {
        if (new RegExp(`\\b${escRe(name)}\\s*=[^=]`).test(code) || new RegExp(`&\\s*${escRe(name)}\\b`).test(code)) {
          uninit.delete(name);
          continue;
        }
        if (uses(code, name) && !new RegExp(`\\b(?:int|char|long|short|float|double|unsigned|size_t)\\s+${escRe(name)}\\b`).test(code)) {
          findings.push(found('cov:UNINIT', i + 1, { en: `${name} is uninitialized`, ko: `${name}이 초기화되지 않았습니다` }, [
            ev(line, 'decl', { en: `${name} is declared here`, ko: `여기서 ${name}을 선언합니다` }),
            ev(i + 1, 'main', { en: 'Read before assign', ko: '대입 전에 읽음' }, true),
          ]));
          uninit.delete(name);
        }
      }
    }

    applyModels(code, i + 1, options.models, lang, findings);
    if (!py) depth = Math.max(0, depth + count(code, '{') - count(code, '}'));
    if (!py && depth === 0 && i > fnLine) {
      /* function body ended on this line if it closed the last brace */
    }
  }
  flush(lines.length || 1);

  if (enabled('cov:IDENTICAL_BRANCHES')) {
    const body = lines.map((line) => codeOf(line, lang)).join('\n');
    const re = /if\s*\([^)]*\)\s*\{([^{}]*)\}\s*else\s*\{([^{}]*)\}/g;
    let m;
    while ((m = re.exec(body))) {
      const left = m[1].replace(/\s+/g, ' ').trim();
      const right = m[2].replace(/\s+/g, ' ').trim();
      if (!left || left !== right) continue;
      const line = body.slice(0, m.index).split('\n').length;
      findings.push(found('cov:IDENTICAL_BRANCHES', line, { en: 'Both branches are the same', ko: '두 분기가 같습니다' }, [
        ev(line, 'main', { en: 'Identical branches', ko: '같은 분기' }, true),
      ]));
    }
  }

  const seen = new Set();
  return findings.filter((item) => {
    const id = `${item.rule}|${item.line}|${normMessage(item.message)}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  function found(key, line, message, events) {
    const meta = BY_KEY.get(key);
    return {
      rule: key,
      checker: meta.checker,
      type: meta.type,
      severity: meta.severity,
      impact: meta.impact,
      debtMin: meta.debtMin,
      tags: meta.tags,
      message,
      line,
      events: events.map((e) => ({ ...e, file })),
      function: fn,
    };
  }
}

function ev(line, tag, text, main) {
  return { line, tag, text, main: !!main };
}

function allows(key, lang) {
  const meta = BY_KEY.get(key);
  return meta && meta.langs.includes(lang);
}

function codeOf(raw, lang) {
  if (lang === 'py' || lang === 'sh' || lang === 'rb') return String(raw).replace(/#.*$/, '');
  return String(raw).replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');
}

function stripStrings(line) {
  return String(line).replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g, '""');
}

function indentOf(line) {
  const m = String(line).match(/^[ \t]*/);
  return m ? m[0].replace(/\t/g, '    ').length : 0;
}

function functionName(code) {
  const named = code.match(/\b(?:function|func|fn|def)\s+([A-Za-z_]\w*)/);
  if (named) return named[1];
  if (/^\s*(if|for|while|switch|catch|else|return)\b/.test(code)) return '';
  const sig = code.match(/([A-Za-z_]\w*)\s*\([^;]*\)\s*\{?\s*$/);
  if (sig && !/^(if|for|while|switch|catch|else|return|sizeof)$/.test(sig[1])) return sig[1];
  return '';
}

function positiveGuard(code) {
  const ne = code.match(new RegExp(`\\bif\\s*\\(\\s*([A-Za-z_]\\w*)\\s*(?:!=|!==)\\s*(?:${NULLISH})\\s*\\)`));
  if (ne) return ne[1];
  const plain = code.match(/\bif\s*\(\s*([A-Za-z_]\w*)\s*\)/);
  if (plain && !/[=!]/.test(code.slice(code.indexOf('('), code.indexOf(')') + 1))) return plain[1];
  return '';
}

function negativeGuard(code) {
  const eq = code.match(new RegExp(`\\bif\\s*\\(\\s*([A-Za-z_]\\w*)\\s*(?:==|===)\\s*(?:${NULLISH})\\s*\\)`));
  if (eq) return eq[1];
  const not = code.match(/\bif\s*\(\s*!\s*([A-Za-z_]\w*)\s*\)/);
  if (not) return not[1];
  const py = code.match(/\bif\s+([A-Za-z_]\w*)\s+is\s+None\b/);
  if (py) return py[1];
  return '';
}

function seeAlloc(code, line, alloc, lang, models) {
  if (lang === 'c' || lang === 'cpp') {
    const m = code.match(/\b([A-Za-z_]\w*)\s*=\s*(?:\(\s*[\w\s*]+\s*\)\s*)?(malloc|calloc|realloc|strdup|fopen)\s*\(/);
    if (m) alloc.set(m[1], line);
  }
  for (const model of compileModels(models)) {
    if (model.kind !== 'allocator' || !model.re.test(code)) continue;
    const m = code.match(/\b([A-Za-z_]\w*)\s*=/);
    if (m) alloc.set(m[1], line);
  }
}

function seeUninit(code, line, uninit, lang) {
  if (lang !== 'c' && lang !== 'cpp') return;
  const m = code.match(/^\s*(?:unsigned\s+|static\s+|const\s+)*(?:int|char|long|short|float|double|size_t)\s+([A-Za-z_]\w*)\s*;\s*$/);
  if (m) uninit.set(m[1], line);
}

function freeCall(code) {
  const m = code.match(/\b(?:free|fclose|close)\s*\(\s*([A-Za-z_]\w*)\s*\)/) || code.match(/\bdelete(?:\s*\[\s*\])?\s+([A-Za-z_]\w*)/);
  return m ? m[1] : '';
}

function derefs(code, name) {
  const n = escRe(name);
  return new RegExp(`\\*\\s*${n}\\b|\\b${n}\\s*->|\\b${n}\\s*\\.\\s*[A-Za-z_]|\\b${n}\\s*\\[`).test(code);
}

function assigns(code, name) {
  return new RegExp(`(^|[^\\w.*>-])${escRe(name)}\\s*=[^=]`).test(code);
}

function uses(code, name) {
  if (derefs(code, name)) return true;
  if (assigns(code, name)) return false;
  return new RegExp(`\\b${escRe(name)}\\b`).test(code);
}

function applyModels(code, line, models, lang, findings) {
  for (const model of compileModels(models)) {
    model.re.lastIndex = 0;
    if (model.langs && model.langs.length && !model.langs.includes('*') && !model.langs.includes(lang)) continue;
    if (!model.re.test(code)) continue;
    if (model.kind === 'sink') {
      findings.push({
        rule: model.key || `cov:model:${model.name}`,
        checker: model.checker || 'TAINTED_SCALAR',
        type: 'VULNERABILITY',
        severity: 'CRITICAL',
        impact: 'High',
        debtMin: 20,
        tags: ['coverity', 'model', 'cwe-20'],
        message: model.message || { en: `Model sink ${model.name}`, ko: `모델 싱크 ${model.name}` },
        line,
        events: [ev(line, 'main', { en: `Sink ${model.name}`, ko: `싱크 ${model.name}` }, true)],
      });
    }
  }
}

function compileModels(models) {
  const out = [];
  for (const model of models || []) {
    if (!model || !model.pattern || model.kind === 'allocator') {
      if (model && model.pattern && model.kind === 'allocator') {
        try { out.push({ ...model, re: new RegExp(model.pattern) }); } catch { /* skip bad pattern */ }
      }
      continue;
    }
    try { out.push({ ...model, re: new RegExp(model.pattern) }); } catch { /* skip */ }
  }
  return out;
}

function count(text, ch) {
  let n = 0;
  for (const c of text) if (c === ch) n += 1;
  return n;
}

function escRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function slimIssue(issue) {
  return {
    cid: issue.cid,
    checker: issue.checker,
    impact: issue.impact,
    kind: issue.kind,
    file: issue.file,
    line: issue.line,
    function: issue.function,
    message: issue.message,
    component: issue.component,
    classification: issue.classification,
    action: issue.action,
    resolution: issue.resolution,
  };
}

module.exports = {
  PATH_CHECKERS, DEFAULT_POLICY, VIEWS, checkerCatalog, checkerFor, decorateIssue, pathDefects,
  summarizeCoverity, evaluatePolicy, isDismissed, componentFor, cidFor, slimIssue, fixedDefects,
};
