// Language-aware security smell rules ("정보 보호 및 보안" view).
//
// These are heuristics, not a replacement for a dedicated SAST tool: they find
// the shapes that are almost always worth a second look (hardcoded secrets,
// string-concatenated SQL, shelling out with user input, weak crypto), and they
// run on the *original* text — the literal contents are exactly what matters
// here, so the mask would hide the evidence.

import { normalizeRuleLanguage } from './languages.js';
import { lineFromStarts } from './text.js';

const ALL = [];

function rule(id, label, labelEn, pattern, languages, severity, remediation) {
  return { id, label, labelEn, pattern, languages, severity, remediation };
}

export const SECURITY_RULES = [
  // --- every language ------------------------------------------------------
  rule(
    'hardcoded-secret',
    '하드코딩 비밀',
    'Hardcoded secret',
    /(password|passwd|pwd|api[_-]?key|secret|token|access[_-]?key|auth)\s*[:=]\s*["'][^"'\n]{4,}["']/gi,
    ALL,
    'critical',
    '비밀 값을 소스에서 제거하고 환경 변수·시크릿 관리자(Key Vault, Secrets Manager 등)에서 주입하세요. 이미 커밋된 값은 폐기·회전해야 합니다.',
  ),
  rule(
    'sql-concat',
    'SQL 문자열 연결',
    'SQL string concatenation',
    /(?:SELECT|INSERT|UPDATE|DELETE)\s+[^;\n"']*["']\s*\+|(?:execute|executeQuery|executeUpdate|query|rawQuery)\s*\(\s*["'][^"'\n]*["']\s*\+/gi,
    ALL,
    'critical',
    '문자열 연결 대신 파라미터 바인딩(Prepared Statement)을 사용하세요. SQL 인젝션의 가장 흔한 경로입니다.',
  ),
  rule(
    'private-key-literal',
    '개인 키 리터럴',
    'Private key literal',
    /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g,
    ALL,
    'critical',
    '개인 키를 저장소에서 제거하고 즉시 재발급하세요.',
  ),
  rule(
    'http-url',
    '평문 HTTP URL',
    'Plaintext HTTP URL',
    /["']http:\/\/(?!localhost|127\.0\.0\.1|0\.0\.0\.0|schemas?\.|www\.w3\.org|xmlns)/gi,
    ALL,
    'info',
    '전송 구간 암호화를 위해 https를 사용하세요.',
  ),

  // --- C# / VB.NET ---------------------------------------------------------
  rule('sync-over-async', '동기 대기(.Result/.Wait)', 'Sync over async', /\.Result\b|\.Wait\s*\(\s*\)/g, ['csharp', 'vbnet'], 'warning', 'await를 사용하세요. 동기 대기는 UI/ASP.NET 컨텍스트에서 교착 상태를 만들 수 있습니다.'),
  rule('weak-crypto', '취약 암호화(MD5/SHA1/DES)', 'Weak cryptography', /\b(?:MD5|SHA1|DES|RC2|TripleDES)\.(?:Create|ComputeHash)\b/g, ['csharp', 'vbnet'], 'critical', 'SHA-256 이상, 비밀번호에는 PBKDF2/bcrypt/Argon2를 사용하세요.'),
  rule('cert-validation-off', '인증서 검증 비활성화', 'Certificate validation disabled', /ServerCertificateValidationCallback|CheckCertificateRevocationList\s*=\s*false/g, ['csharp', 'vbnet'], 'critical', 'TLS 인증서 검증을 우회하면 중간자 공격에 노출됩니다.'),
  rule('binary-formatter', 'BinaryFormatter 역직렬화', 'BinaryFormatter deserialization', /\bBinaryFormatter\b/g, ['csharp'], 'critical', 'BinaryFormatter는 원격 코드 실행 위험이 있어 폐기되었습니다. System.Text.Json 등으로 교체하세요.'),

  // --- Java / Kotlin -------------------------------------------------------
  rule('runtime-exec', 'Runtime.exec', 'Runtime.exec', /Runtime\.getRuntime\s*\(\s*\)\.exec\s*\(/g, ['java'], 'warning', '외부 명령 실행 시 인자를 배열로 전달하고 사용자 입력을 검증하세요.'),
  rule('jdbc-concat', 'JDBC 문자열 연결', 'JDBC concatenation', /(?:Statement|PreparedStatement)[^;\n]*\.execute(?:Query|Update)?\s*\(\s*["'][^"'\n]*["']\s*\+/g, ['java'], 'critical', 'PreparedStatement의 ? 바인딩을 사용하세요.'),
  rule('insecure-hostname', '호스트명 검증 우회', 'Hostname verification bypass', /setHostnameVerifier\s*\(|ALLOW_ALL_HOSTNAME_VERIFIER/g, ['java'], 'critical', '호스트명 검증을 비활성화하지 마세요.'),

  // --- Python --------------------------------------------------------------
  rule('py-eval-exec', 'eval/exec', 'eval/exec', /\b(?:eval|exec)\s*\(/g, ['python'], 'critical', '동적 코드 실행 대신 명시적 분기나 ast.literal_eval을 사용하세요.'),
  rule('pickle-loads', 'pickle 역직렬화', 'pickle deserialization', /pickle\.loads?\s*\(/g, ['python'], 'critical', '신뢰할 수 없는 데이터를 pickle로 역직렬화하면 임의 코드가 실행됩니다. JSON을 쓰세요.'),
  rule('subprocess-shell', 'subprocess shell=True', 'subprocess shell=True', /subprocess\.(?:call|run|Popen|check_output)\s*\([^)\n]*shell\s*=\s*True/g, ['python'], 'critical', 'shell=True를 끄고 인자를 리스트로 전달하세요.'),
  rule('os-system', 'os.system', 'os.system', /os\.system\s*\(/g, ['python'], 'warning', 'subprocess.run([...])으로 교체하세요.'),
  rule('yaml-unsafe-load', 'YAML unsafe load', 'YAML unsafe load', /yaml\.load\s*\((?![^)]*SafeLoader)/g, ['python'], 'critical', 'yaml.safe_load를 사용하세요.'),

  // --- JavaScript / TypeScript --------------------------------------------
  rule('inner-html', 'innerHTML 할당', 'innerHTML assignment', /\.innerHTML\s*=/g, ['javascript'], 'warning', 'textContent를 쓰거나 DOMPurify로 정화하세요. XSS의 주요 경로입니다.'),
  rule('dangerous-html', 'dangerouslySetInnerHTML', 'dangerouslySetInnerHTML', /dangerouslySetInnerHTML/g, ['javascript'], 'warning', '삽입 전에 반드시 정화(sanitize)하세요.'),
  rule('js-eval', 'eval()', 'eval()', /\beval\s*\(|new\s+Function\s*\(/g, ['javascript'], 'critical', 'eval/new Function을 제거하세요.'),
  rule('document-write', 'document.write', 'document.write', /document\.write(?:ln)?\s*\(/g, ['javascript'], 'warning', 'DOM API로 교체하세요.'),
  rule('child-process-exec', 'child_process.exec', 'child_process.exec', /child_process\s*\)?\.exec\s*\(|\bexec\s*\(\s*`/g, ['javascript'], 'warning', 'execFile/spawn에 인자 배열을 전달하세요.'),

  // --- PHP -----------------------------------------------------------------
  rule('php-shell', '명령 실행 함수', 'Command execution', /\b(?:shell_exec|system|passthru|proc_open|popen)\s*\(/g, ['php'], 'critical', 'escapeshellarg로 인자를 이스케이프하거나 명령 실행을 제거하세요.'),
  rule('php-eval', 'eval()', 'eval()', /\beval\s*\(/g, ['php'], 'critical', 'eval을 제거하세요.'),
  rule('php-mysql', 'mysql_query(폐기 API)', 'Deprecated mysql_query', /mysql_query\s*\(/g, ['php'], 'critical', 'PDO 또는 mysqli의 prepared statement로 교체하세요.'),
  rule('php-superglobal-sql', '슈퍼전역 직접 사용', 'Superglobal in query', /\$_(?:GET|POST|REQUEST|COOKIE)\s*\[[^\]]*\][^;\n]*(?:query|exec)/gi, ['php'], 'critical', '사용자 입력을 직접 쿼리에 넣지 말고 바인딩하세요.'),

  // --- Go ------------------------------------------------------------------
  rule('go-sql-fmt', 'SQL fmt 연결', 'SQL built with fmt', /(?:Query|Exec|QueryRow)\s*\(\s*fmt\.Sprintf?/g, ['go'], 'critical', 'db.Query("… ?", args…) 형태의 플레이스홀더를 사용하세요.'),
  rule('go-exec', 'exec.Command 동적 인자', 'exec.Command with dynamic args', /exec\.Command\s*\([^)\n]*\+/g, ['go'], 'warning', '사용자 입력을 명령 문자열에 연결하지 마세요.'),
  rule('go-ignored-error', '오류 무시(_ =)', 'Ignored error', /_\s*[,)]\s*=\s*\w+\(/g, ['go'], 'info', '오류를 무시하면 실패가 조용히 지나갑니다.'),

  // --- Ruby ----------------------------------------------------------------
  rule('ruby-eval', 'eval/system/백틱', 'eval/system/backtick', /\b(?:eval|system)\s*\(|`[^`\n]+`/g, ['ruby'], 'critical', '동적 실행을 제거하고 인자를 배열로 전달하세요.'),

  // --- Rust ----------------------------------------------------------------
  rule('rust-unwrap', 'unwrap/expect', 'unwrap/expect', /\.(?:unwrap|expect)\s*\(/g, ['rust'], 'info', '실패 가능 지점에서 패닉합니다. ? 연산자나 명시적 오류 처리를 검토하세요.'),
  rule('rust-unsafe', 'unsafe 블록', 'unsafe block', /\bunsafe\s*\{/g, ['rust'], 'warning', 'unsafe 블록의 불변식을 주석으로 증명하고 범위를 최소화하세요.'),

  // --- C / C++ -------------------------------------------------------------
  rule('cpp-unsafe-func', '취약 C 함수', 'Unsafe C function', /\b(?:strcpy|strcat|gets|sprintf|vsprintf|scanf)\s*\(/g, ['cpp'], 'critical', 'strncpy_s/snprintf 등 길이를 받는 안전한 대체 함수를 사용하세요.'),
  rule('cpp-system', 'system() 호출', 'system() call', /\bsystem\s*\(/g, ['cpp'], 'warning', '외부 명령 실행을 피하고 필요하면 인자를 검증하세요.'),
  rule('cpp-malloc-nocheck', 'malloc 결과 미검사', 'Unchecked malloc', /=\s*(?:malloc|calloc|realloc)\s*\([^)\n]*\)\s*;(?![^\n]*\n\s*if)/g, ['cpp'], 'warning', '할당 실패(NULL)를 검사하세요.'),

  // --- Swift ---------------------------------------------------------------
  rule('swift-force-unwrap', '강제 언래핑', 'Force unwrap', /\b[a-z]\w*!\s*\./g, ['swift'], 'info', 'nil일 때 크래시합니다. 옵셔널 바인딩을 쓰세요.'),
];

/**
 * Runs the security rules over one file.
 * @returns {Array<{ruleId, label, severity, line, snippet, remediation}>}
 */
export function scanSecurity(file, limitPerRule = 50) {
  const lang = normalizeRuleLanguage(file.languageId);
  const hits = [];
  const lines = file.text.split('\n');

  for (const rule of SECURITY_RULES) {
    if (rule.languages.length > 0 && !rule.languages.includes(lang)) continue;

    rule.pattern.lastIndex = 0;
    let m;
    let count = 0;
    while ((m = rule.pattern.exec(file.text)) !== null) {
      if (m[0].length === 0) {
        rule.pattern.lastIndex++;
        continue;
      }
      const line = lineFromStarts(file.lineStarts, m.index);
      hits.push({
        ruleId: rule.id,
        label: rule.label,
        labelEn: rule.labelEn,
        severity: rule.severity,
        filePath: file.path,
        languageId: file.languageId,
        line,
        snippet: (lines[line - 1] || '').trim().slice(0, 240),
        remediation: rule.remediation,
      });
      if (++count >= limitPerRule) break;
    }
  }

  return hits;
}

const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 };

/** Groups findings for the security view and the report. */
export function summarizeSecurity(hits) {
  const byRule = new Map();
  const byFile = new Map();

  for (const hit of hits) {
    if (!byRule.has(hit.ruleId)) {
      byRule.set(hit.ruleId, {
        ruleId: hit.ruleId,
        label: hit.label,
        labelEn: hit.labelEn,
        severity: hit.severity,
        remediation: hit.remediation,
        hits: [],
      });
    }
    byRule.get(hit.ruleId).hits.push(hit);

    if (!byFile.has(hit.filePath)) byFile.set(hit.filePath, []);
    byFile.get(hit.filePath).push(hit);
  }

  const rules = [...byRule.values()].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.hits.length - a.hits.length,
  );

  return {
    total: hits.length,
    criticalCount: hits.filter((h) => h.severity === 'critical').length,
    warningCount: hits.filter((h) => h.severity === 'warning').length,
    infoCount: hits.filter((h) => h.severity === 'info').length,
    affectedFileCount: byFile.size,
    rules,
    byFile: [...byFile.entries()]
      .map(([filePath, list]) => ({ filePath, count: list.length, hits: list }))
      .sort((a, b) => b.count - a.count),
  };
}
