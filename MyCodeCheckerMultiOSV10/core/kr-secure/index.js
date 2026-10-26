'use strict';

// Checks for the 행정안전부 SW 보안약점 items (2021 guide) that the other
// engines do not cover: unrestricted upload, security decisions on client
// input, secrets in comments, missing login-attempt limits, servlet/controller
// state shared between sessions, private arrays leaking through public
// methods, DNS-based trust and dangerous APIs. Light-weight source scans over
// comment- and string-aware lines, for Java, Kotlin, C#, JavaScript/TypeScript,
// Python, PHP, Go, Ruby and C/C++. Contract: core/ENGINE_CONTRACT.md.

const ALL = ['java', 'kt', 'cs', 'js', 'ts', 'py', 'php', 'go', 'rb', 'c', 'cpp'];

const RULES = [];
function R(def) {
  RULES.push(def);
}

// ---------------------------------------------------------------------------
// Source helpers: blank out comments and string bodies so patterns only see code.

function hashComments(lang) {
  return lang === 'py' || lang === 'rb';
}

/** { code: lines with strings and comments blanked, comments: [{line, text}] } */
function scan(text, lang) {
  const src = String(text);
  const code = [];
  const comments = [];
  let line = '';
  let lineNo = 1;
  let i = 0;
  const n = src.length;
  const hash = hashComments(lang) || lang === 'php';
  const slash = lang !== 'py' && lang !== 'rb';
  const pushLine = () => { code.push(line); line = ''; lineNo++; };
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === '\r') { i++; continue; }
    if (c === '\n') { pushLine(); i++; continue; }
    if (slash && c === '/' && d === '/') {
      let j = i;
      while (j < n && src[j] !== '\n') j++;
      comments.push({ line: lineNo, text: src.slice(i + 2, j) });
      i = j;
      continue;
    }
    if (hash && c === '#' && !(lang === 'php' && d === '[')) {
      let j = i;
      while (j < n && src[j] !== '\n') j++;
      comments.push({ line: lineNo, text: src.slice(i + 1, j) });
      i = j;
      continue;
    }
    if (slash && c === '/' && d === '*') {
      let j = i + 2;
      let buf = '';
      const start = lineNo;
      while (j < n && !(src[j] === '*' && src[j + 1] === '/')) {
        if (src[j] === '\n') { comments.push({ line: lineNo, text: buf }); buf = ''; pushLine(); }
        else if (src[j] !== '\r') buf += src[j];
        j++;
      }
      comments.push({ line: lineNo, text: buf, start });
      i = Math.min(n, j + 2);
      continue;
    }
    if (lang === 'py' && (src.startsWith('"""', i) || src.startsWith("'''", i))) {
      const q = src.slice(i, i + 3);
      let j = i + 3;
      line += q;
      while (j < n && !src.startsWith(q, j)) {
        if (src[j] === '\n') pushLine();
        j++;
      }
      line += q;
      i = Math.min(n, j + 3);
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      // keep the quotes and the literal (patterns look at literal names), but not across lines
      let j = i + 1;
      let lit = c;
      while (j < n && src[j] !== c && !(src[j] === '\n' && c !== '`')) {
        if (src[j] === '\\' && j + 1 < n) { lit += src[j] + src[j + 1]; j += 2; continue; }
        if (src[j] === '\n') { line += lit; lit = ''; pushLine(); j++; continue; }
        lit += src[j];
        j++;
      }
      line += lit + c;
      i = j + 1;
      continue;
    }
    line += c;
    i++;
  }
  code.push(line);
  return { code, comments };
}

const SECRET_WORDS = /\b(pass(word|wd)?|pwd|secret|api[_-]?key|access[_-]?key|private[_-]?key|token|credential|db[_-]?pass|비밀번호|패스워드|암호)\b/i;

// ---------------------------------------------------------------------------
// 1.6 Unrestricted file upload

const UPLOAD = {
  java: [/\.transferTo\s*\(/, /\bgetOriginalFilename\s*\(\)/, /\bgetSubmittedFileName\s*\(\)/],
  kt: [/\.transferTo\s*\(/, /\boriginalFilename\b/],
  cs: [/\.SaveAs\s*\(/, /\bIFormFile\b.*\.FileName\b|\.FileName\b.*\bPath\.Combine\b|\bPath\.Combine\b.*\.FileName\b/, /\.CopyToAsync?\s*\(.*\bFileStream\b/],
  js: [/\bmulter\s*\(\s*\{(?![^}]*fileFilter)/, /\bmulter\s*\(\s*\)/, /\.mv\s*\(\s*[^)]*\.name\b/],
  py: [/request\.files\b.*\.save\s*\(/, /\.save\s*\(\s*os\.path\.join\([^)]*\.filename\b/],
  php: [/\bmove_uploaded_file\s*\(/],
  rb: [/\bFile\.(write|open)\s*\(.*\.original_filename\b/],
  go: [/\bFormFile\s*\(/],
};
const UPLOAD_GUARD = /\b(getExtension|extension|ext|allowed|whitelist|allowlist|mimetype|mime_type|content_?type|ContentType|endsWith|EndsWith|fileFilter|splitext|pathinfo|PATHINFO_EXTENSION|isAllowed|validate)\b/i;

R({
  key: 'kr-secure:unrestricted-upload', mois: '1.6', langs: ['java', 'kt', 'cs', 'js', 'ts', 'py', 'php', 'rb', 'go'],
  type: 'SECURITY_HOTSPOT', severity: 'CRITICAL', debtMin: 30, tags: ['cwe-434', 'owasp-a04', 'upload'], cwe: 'CWE-434',
  name: { en: 'Uploaded files should be checked before they are stored', ko: '업로드한 파일은 저장하기 전에 검사해야 합니다' },
  why: { en: 'Storing an uploaded file without checking its type, size and name lets an attacker place a script or an executable on the server.', ko: '형식·크기·이름을 확인하지 않고 업로드 파일을 저장하면 공격자가 서버에 스크립트나 실행 파일을 올릴 수 있습니다.' },
  fix: { en: 'Allow only known extensions and content types, limit the size, generate the stored name and keep uploads outside the web root.', ko: '허용한 확장자와 콘텐츠 형식만 받고, 크기를 제한하고, 저장 이름을 새로 만들고, 웹 루트 밖에 저장하세요.' },
  check(f, s, report) {
    const pats = UPLOAD[f.lang === 'ts' ? 'js' : f.lang] || [];
    const guarded = UPLOAD_GUARD.test(s.code.join('\n'));
    if (guarded) return;
    for (let i = 0; i < s.code.length; i++) {
      if (pats.some((re) => re.test(s.code[i]))) {
        report(i + 1, { en: 'This upload is stored without checking the file type or name.', ko: '파일 형식이나 이름을 확인하지 않고 업로드를 저장합니다.' });
        return;
      }
    }
  },
});

// ---------------------------------------------------------------------------
// 1.15 Security decision on client-controlled input

const CLIENT_INPUT = {
  java: /\b(getParameter|getHeader|getCookies?|getValue)\s*\(\s*"(role|admin|isAdmin|is_admin|auth|authorized|level|grade|userType|user_type|permission|perm|priv|privilege|logged|login|loggedIn)"/i,
  kt: /\b(getParameter|getHeader|getCookie)\s*\(\s*"(role|admin|isAdmin|auth|authorized|level|permission|privilege|loggedIn)"/i,
  cs: /\b(Request\.(Query|Form|Cookies|Headers)|QueryString|Cookies)\s*\[\s*"(role|admin|isAdmin|auth|authorized|level|permission|privilege|loggedIn)"\s*\]/i,
  js: /\breq\.(query|body|cookies|headers|params)\.(role|admin|isAdmin|is_admin|auth|authorized|level|permission|privilege|loggedIn)\b/i,
  py: /\brequest\.(args|form|cookies|headers|GET|POST|COOKIES|values)(\.get\s*\(\s*|\[\s*)['"](role|admin|is_admin|auth|authorized|level|permission|privilege|logged_in)['"]/i,
  php: /\$_(GET|POST|COOKIE|REQUEST)\s*\[\s*['"](role|admin|is_admin|auth|authorized|level|permission|privilege|logged_in)['"]\s*\]/i,
  rb: /\b(params|cookies)\s*\[\s*:?['"]?(role|admin|is_admin|auth|authorized|level|permission|privilege|logged_in)['"]?\s*\]/i,
  go: /\b(FormValue|Query\(\)\.Get|Cookie)\s*\(\s*"(role|admin|isAdmin|auth|authorized|level|permission|privilege|loggedIn)"/i,
};

R({
  key: 'kr-secure:client-security-decision', mois: '1.15', langs: ['java', 'kt', 'cs', 'js', 'ts', 'py', 'php', 'rb', 'go'],
  type: 'VULNERABILITY', severity: 'CRITICAL', debtMin: 30, tags: ['cwe-807', 'owasp-a04'], cwe: 'CWE-807',
  name: { en: 'Access decisions should not trust request parameters, headers or cookies', ko: '접근 결정에 요청 매개변수·헤더·쿠키 값을 믿으면 안 됩니다' },
  why: { en: 'A role, login flag or permission read from the request can be changed by the client, so the check can be bypassed.', ko: '요청에서 읽은 역할·로그인 여부·권한은 클라이언트가 바꿀 수 있어 검사를 우회할 수 있습니다.' },
  fix: { en: 'Read roles and login state from the server-side session or the authenticated principal.', ko: '역할과 로그인 상태는 서버 쪽 세션이나 인증된 사용자 정보에서 읽으세요.' },
  check(f, s, report) {
    const re = CLIENT_INPUT[f.lang === 'ts' ? 'js' : f.lang];
    if (!re) return;
    for (let i = 0; i < s.code.length; i++) {
      const m = re.exec(s.code[i]);
      if (!m) continue;
      const name = m[m.length - 1];
      report(i + 1, { en: `"${name}" comes from the request; take it from the server-side session instead.`, ko: `"${name}" 값이 요청에서 옵니다. 서버 쪽 세션에서 가져오세요.` });
    }
  },
});

// ---------------------------------------------------------------------------
// 2.13 Sensitive data in comments

const COMMENT_SECRET = new RegExp(`${SECRET_WORDS.source}\\s*(=|:|는|은|->)\\s*['"]?([^\\s'"<>]{3,})`, 'i');
const COMMENT_ACCOUNT = /\b(id|user(name)?|account|login|계정|아이디)\s*[:=/]\s*\w{2,}\s*[/,]\s*(pw|pass(word)?|pwd|비번|비밀번호)\s*[:=]?\s*\S{3,}/i;
const PLACEHOLDER = /^(\*+|x+|\.{3}|<[^>]*>|\$\{[^}]*\}|\{\{[^}]*\}\}|null|none|changeme|example|your[_-]?\w*|todo|xxx+|redacted|secret|password)$/i;

R({
  key: 'kr-secure:secret-in-comment', mois: '2.13', langs: ALL,
  type: 'VULNERABILITY', severity: 'MAJOR', debtMin: 5, tags: ['cwe-615', 'owasp-a05'], cwe: 'CWE-615',
  name: { en: 'Comments should not contain passwords or other secrets', ko: '주석에 비밀번호 등 중요 정보를 남기면 안 됩니다' },
  why: { en: 'Comments ship with the source and often with scripts sent to the browser, so an account or key written there is exposed.', ko: '주석은 소스와 함께, 때로는 브라우저로 가는 스크립트와 함께 배포되므로 그곳에 쓴 계정이나 키가 노출됩니다.' },
  fix: { en: 'Remove the secret from the comment and rotate it if it was ever committed.', ko: '주석에서 중요 정보를 지우고, 커밋된 적이 있다면 바꾸세요.' },
  check(f, s, report) {
    for (const c of s.comments) {
      const m = COMMENT_SECRET.exec(c.text);
      const acct = COMMENT_ACCOUNT.test(c.text);
      if (!acct && (!m || PLACEHOLDER.test(m[m.length - 1]))) continue;
      report(c.line, { en: 'This comment contains what looks like a password or key.', ko: '이 주석에 비밀번호나 키로 보이는 값이 있습니다.' });
    }
  },
});

// ---------------------------------------------------------------------------
// 2.16 No limit on repeated authentication attempts

const LOGIN_FN = {
  java: /\b(public|private|protected)?\s*[\w<>\[\]]+\s+(login|signIn|signin|authenticate|doLogin|processLogin)\s*\(/,
  kt: /\bfun\s+(login|signIn|authenticate|doLogin)\s*\(/,
  cs: /\b[\w<>\[\]]+\s+(Login|SignIn|Authenticate|DoLogin|LogOn)(Async)?\s*\(/,
  js: /\b(async\s+)?function\s+(login|signIn|authenticate)\b|\b(login|signIn|authenticate)\s*[:=]\s*(async\s*)?(\([^)]*\)|\w+)\s*=>|\.post\s*\(\s*['"`][^'"`]*\/(login|signin|auth)['"`]/i,
  py: /\bdef\s+(login|sign_in|signin|authenticate|do_login)\s*\(/,
  php: /\bfunction\s+(login|signIn|authenticate|doLogin)\s*\(/i,
  rb: /\bdef\s+(login|sign_in|authenticate|create)\b/,
  go: /\bfunc\s+(\([^)]*\)\s*)?(Login|SignIn|Authenticate|login|signIn)\s*\(/,
};
const PASSWORD_CHECK = /\b(password|passwd|pwd|checkPassword|verifyPassword|matches|BCrypt|bcrypt|check_password|password_verify|PasswordHasher|authenticate|compare)\b/i;
const ATTEMPT_LIMIT = /\b(fail(ed|ure)?[_-]?(count|attempts?|login)|login[_-]?(attempts?|fail)|attempts?|retry|retries|lock(out|ed)?|throttl|rate[_-]?limit|RateLimit|slowDown|express-rate-limit|brute|captcha|Lockout|AccessFailed|MaxFailedAccessAttempts|axes|django_ratelimit|Rack::Attack)\w*/i;

R({
  key: 'kr-secure:no-login-attempt-limit', mois: '2.16', langs: ['java', 'kt', 'cs', 'js', 'ts', 'py', 'php', 'rb', 'go'],
  type: 'SECURITY_HOTSPOT', severity: 'MAJOR', debtMin: 30, tags: ['cwe-307', 'owasp-a07'], cwe: 'CWE-307',
  name: { en: 'Login should limit repeated failed attempts', ko: '로그인은 반복된 실패 시도를 제한해야 합니다' },
  why: { en: 'Without a counter, lockout, delay or CAPTCHA an attacker can guess passwords without limit.', ko: '횟수 제한·잠금·지연·CAPTCHA가 없으면 공격자가 비밀번호를 끝없이 추측할 수 있습니다.' },
  fix: { en: 'Count failures per account and source, then lock, delay or require a CAPTCHA after a few attempts.', ko: '계정과 접속지별로 실패를 세고, 몇 번 실패하면 잠그거나 지연하거나 CAPTCHA를 요구하세요.' },
  check(f, s, report) {
    const re = LOGIN_FN[f.lang === 'ts' ? 'js' : f.lang];
    if (!re) return;
    const all = s.code.join('\n');
    if (!PASSWORD_CHECK.test(all) || ATTEMPT_LIMIT.test(all)) return;
    for (let i = 0; i < s.code.length; i++) {
      if (!re.test(s.code[i])) continue;
      report(i + 1, { en: 'This login function does not limit failed attempts.', ko: '이 로그인 함수는 실패 횟수를 제한하지 않습니다.' });
      return;
    }
  },
});

// ---------------------------------------------------------------------------
// 6.1 Data exposed to another session (servlet / controller instance fields)

const SHARED_CLASS = {
  java: /\bclass\s+\w+[^{]*\b(extends\s+(HttpServlet|GenericServlet)|implements\s+[^{]*\b(Servlet|Controller|Filter)\b)|@(Controller|RestController|Service|Component)\b/,
  kt: /@(Controller|RestController|Service|Component)\b|:\s*HttpServlet\s*\(/,
  cs: /\bclass\s+\w+\s*:\s*(Controller|ControllerBase|ApiController|Hub)\b/,
};
const HANDLER = {
  java: /\b(doGet|doPost|doPut|doDelete|service|doFilter)\s*\(|@(Get|Post|Put|Delete|Request|Patch)Mapping\b/,
  kt: /@(Get|Post|Put|Delete|Request|Patch)Mapping\b|\bfun\s+(doGet|doPost)\s*\(/,
  cs: /\[(Http(Get|Post|Put|Delete|Patch)|Route)\b|\bpublic\s+(async\s+)?(Task<)?(IActionResult|ActionResult|JsonResult|ViewResult)/,
};

R({
  key: 'kr-secure:session-shared-field', mois: '6.1', langs: ['java', 'kt', 'cs'],
  type: 'VULNERABILITY', severity: 'CRITICAL', debtMin: 30, tags: ['cwe-488', 'multi-threading'], cwe: 'CWE-488',
  name: { en: 'Request handlers should not keep request data in instance fields', ko: '요청 처리기는 요청 데이터를 인스턴스 필드에 두면 안 됩니다' },
  why: { en: 'A servlet or singleton controller serves every user at once; a field written while handling one request can be read by another user\'s request.', ko: '서블릿이나 싱글턴 컨트롤러는 모든 사용자를 동시에 처리하므로, 한 요청에서 쓴 필드를 다른 사용자의 요청이 읽을 수 있습니다.' },
  fix: { en: 'Use local variables, the request or the session instead of mutable fields.', ko: '변경 가능한 필드 대신 지역 변수, 요청, 세션을 쓰세요.' },
  check(f, s, report) {
    const cls = SHARED_CLASS[f.lang];
    const handler = HANDLER[f.lang];
    if (!cls || !cls.test(s.code.join('\n'))) return;
    const fields = new Map();
    const fieldRe = f.lang === 'kt'
      ? /^\s*(private\s+|protected\s+|internal\s+)?var\s+(\w+)\s*[:=]/
      : /^\s*(private|protected|public|internal)?\s*(?!static\b|final\b|readonly\b|const\b)((?:[\w.]+)(?:<[^>]*>)?(?:\[\])?)\s+(\w+)\s*(=[^;]*)?;\s*$/;
    let depth = 0;
    for (let i = 0; i < s.code.length; i++) {
      const line = s.code[i];
      if (depth === 1) {
        const m = fieldRe.exec(line);
        if (m && !/\b(static|final|readonly|const|val|@Autowired|@Inject)\b/.test(line) && !/\(/.test(line.replace(/=.*/, ''))) {
          const name = f.lang === 'kt' ? m[2] : m[3];
          if (name && !/^(serialVersionUID|log|logger|LOG)$/.test(name)) fields.set(name, i + 1);
        }
      }
      for (const ch of line) { if (ch === '{') depth++; else if (ch === '}') depth--; }
    }
    if (!fields.size) return;
    let inHandler = false;
    let handlerDepth = 0;
    depth = 0;
    const seen = new Set();
    for (let i = 0; i < s.code.length; i++) {
      const line = s.code[i];
      if (!inHandler && handler.test(line)) { inHandler = true; handlerDepth = depth; }
      if (inHandler) {
        for (const [name] of fields) {
          if (seen.has(name)) continue;
          const re = new RegExp(`(^|[^.\\w]|\\bthis\\.)${name}\\s*(=(?!=)|\\+=|-=|\\+\\+)`);
          if (re.test(line)) {
            seen.add(name);
            report(i + 1, { en: `Field "${name}" is written while handling a request and is shared by all users.`, ko: `요청을 처리하면서 필드 "${name}"에 쓰는데, 이 필드는 모든 사용자가 함께 씁니다.` });
          }
        }
      }
      for (const ch of line) { if (ch === '{') depth++; else if (ch === '}') { depth--; if (inHandler && depth <= handlerDepth) inHandler = false; } }
    }
  },
});

// ---------------------------------------------------------------------------
// 6.3 / 6.4 Private arrays and public methods (Java, Kotlin, C#)

function privateArrays(s, lang) {
  const out = new Map();
  const re = lang === 'kt'
    ? /^\s*private\s+(var|val)\s+(\w+)\s*(:\s*(Array<[^>]*>|\w+Array)|=\s*(arrayOf|\w+ArrayOf|Array\())/
    : /^\s*private\s+(?!static\s+final\b)(?:static\s+|readonly\s+)*(?:final\s+)?[\w.<>]+\s*\[\]\s+(\w+)\s*(=|;)/;
  for (let i = 0; i < s.code.length; i++) {
    const m = re.exec(s.code[i]);
    if (m) out.set(lang === 'kt' ? m[2] : m[1], i + 1);
  }
  return out;
}

R({
  key: 'kr-secure:public-returns-private-array', mois: '6.3', langs: ['java', 'kt', 'cs'],
  type: 'VULNERABILITY', severity: 'MAJOR', debtMin: 10, tags: ['cwe-495'], cwe: 'CWE-495',
  name: { en: 'Public methods should not return a private array', ko: 'public 메소드가 private 배열을 그대로 반환하면 안 됩니다' },
  why: { en: 'The caller gets the same array object and can change the class\'s private state.', ko: '호출한 쪽이 같은 배열 객체를 받아 클래스의 private 상태를 바꿀 수 있습니다.' },
  fix: { en: 'Return a copy (clone(), Arrays.copyOf, ToArray()) or an unmodifiable view.', ko: '복사본(clone(), Arrays.copyOf, ToArray())이나 수정할 수 없는 뷰를 반환하세요.' },
  check(f, s, report) {
    const arrays = privateArrays(s, f.lang);
    if (!arrays.size) return;
    let inPublic = false;
    for (let i = 0; i < s.code.length; i++) {
      const line = s.code[i];
      if (/\bpublic\b[^=;]*\(|^\s*fun\s+\w+\s*\(|\bpublic\s+[\w.<>\[\]]+\s+\w+\s*(\{|=>)/.test(line) && !/\bprivate\b/.test(line)) inPublic = true;
      if (!inPublic) continue;
      for (const [name] of arrays) {
        const re = new RegExp(`\\breturn\\s+(this\\.)?${name}\\s*;?\\s*$|=>\\s*(this\\.)?${name}\\s*;\\s*$|\\bget\\s*\\(\\)\\s*=\\s*${name}\\b|^\\s*(fun\\s+\\w+\\s*\\(\\)\\s*(:[^=]*)?=\\s*)${name}\\s*$`);
        if (re.test(line)) report(i + 1, { en: `Return a copy of the private array "${name}".`, ko: `private 배열 "${name}"의 복사본을 반환하세요.` });
      }
      if (/^\s*\}\s*$/.test(line)) inPublic = false;
    }
  },
});

R({
  key: 'kr-secure:private-array-assigned-public-data', mois: '6.4', langs: ['java', 'kt', 'cs'],
  type: 'VULNERABILITY', severity: 'MAJOR', debtMin: 10, tags: ['cwe-496'], cwe: 'CWE-496',
  name: { en: 'Private arrays should not store an array passed to a public method', ko: 'public 메소드로 받은 배열을 private 배열에 그대로 넣으면 안 됩니다' },
  why: { en: 'The caller keeps a reference to the same array and can change the private state later.', ko: '호출한 쪽이 같은 배열의 참조를 갖고 있어 나중에 private 상태를 바꿀 수 있습니다.' },
  fix: { en: 'Store a copy of the argument (clone(), Arrays.copyOf, ToArray()).', ko: '인수의 복사본(clone(), Arrays.copyOf, ToArray())을 저장하세요.' },
  check(f, s, report) {
    const arrays = privateArrays(s, f.lang);
    if (!arrays.size) return;
    let params = null;
    for (let i = 0; i < s.code.length; i++) {
      const line = s.code[i];
      const sig = /\bpublic\b[^=;(]*\(([^)]*)\)|^\s*fun\s+\w+\s*\(([^)]*)\)/.exec(line);
      if (sig && !/\bprivate\b/.test(line)) {
        const list = (sig[1] || sig[2] || '').split(',');
        params = new Set(list.map((p) => {
          const parts = p.trim().replace(/[:=].*$/, (x) => (f.lang === 'kt' ? '' : x)).split(/\s+/);
          return f.lang === 'kt' ? parts[parts.length - 1] : parts[parts.length - 1];
        }).filter((p) => /^\w+$/.test(p)));
        if (f.lang === 'kt') params = new Set(list.map((p) => p.trim().split(':')[0].replace(/^(vararg|val|var)\s+/, '').trim()).filter((p) => /^\w+$/.test(p)));
      }
      if (!params || !params.size) continue;
      for (const [name] of arrays) {
        const m = new RegExp(`(\\bthis\\.|^\\s*)${name}\\s*=\\s*(\\w+)\\s*;?\\s*$`).exec(line);
        if (m && params.has(m[2]) && m[2] !== name) report(i + 1, { en: `Store a copy of "${m[2]}" in the private array "${name}".`, ko: `private 배열 "${name}"에 "${m[2]}"의 복사본을 저장하세요.` });
        const self = new RegExp(`\\bthis\\.${name}\\s*=\\s*${name}\\s*;?\\s*$`).exec(line);
        if (self && params.has(name)) report(i + 1, { en: `Store a copy of "${name}" in the private array.`, ko: `private 배열에 "${name}"의 복사본을 저장하세요.` });
      }
    }
  },
});

// ---------------------------------------------------------------------------
// 7.1 Security decision based on DNS names

const DNS = {
  java: /\b(getCanonicalHostName|getHostName)\s*\(\s*\)/,
  kt: /\.(canonicalHostName|hostName)\b/,
  cs: /\bDns\.(GetHostEntry|GetHostByAddress|GetHostEntryAsync)\s*\(.*\)\s*\.HostName\b|\.HostName\b/,
  js: /\bdns\.(reverse|lookupService)\s*\(|\bdns\.promises\.reverse\s*\(/,
  py: /\bsocket\.(gethostbyaddr|getfqdn)\s*\(/,
  php: /\bgethostbyaddr\s*\(/,
  rb: /\bResolv\.getname\s*\(|\bSocket\.gethostbyaddr\b/,
  go: /\bnet\.LookupAddr\s*\(/,
  c: /\b(gethostbyaddr|getnameinfo)\s*\(/,
  cpp: /\b(gethostbyaddr|getnameinfo)\s*\(/,
};
const DECISION = /\b(if|elif|unless|when)\b|\?\s*[^:]+:|\b(equals|EndsWith|endsWith|ends_with|endswith|Contains|contains|startsWith|StartsWith|strcmp|strstr|strcasecmp|==|===)\b|==/;

R({
  key: 'kr-secure:dns-based-trust', mois: '7.1', langs: ['java', 'kt', 'cs', 'js', 'ts', 'py', 'php', 'rb', 'go', 'c', 'cpp'],
  type: 'VULNERABILITY', severity: 'MAJOR', debtMin: 15, tags: ['cwe-350', 'owasp-a07'], cwe: 'CWE-350',
  name: { en: 'Trust decisions should not depend on a reverse DNS name', ko: '신뢰 결정을 역방향 DNS 이름에 의존하면 안 됩니다' },
  why: { en: 'An attacker who controls the DNS answer can make any address look like a trusted host.', ko: 'DNS 응답을 조작할 수 있는 공격자는 어떤 주소든 신뢰된 호스트처럼 보이게 할 수 있습니다.' },
  fix: { en: 'Decide on the IP address against an allow list, or use real authentication (mutual TLS, tokens).', ko: 'IP 주소를 허용 목록과 비교하거나 상호 TLS·토큰 같은 실제 인증을 쓰세요.' },
  check(f, s, report) {
    const re = DNS[f.lang === 'ts' ? 'js' : f.lang];
    if (!re) return;
    const names = new Set();
    for (let i = 0; i < s.code.length; i++) {
      const line = s.code[i];
      if (!re.test(line)) {
        for (const v of names) {
          if (new RegExp(`\\b${v}\\b`).test(line) && DECISION.test(line)) {
            report(i + 1, { en: `"${v}" is a DNS name; do not base the check on it.`, ko: `"${v}"는 DNS 이름입니다. 이 값으로 검사하지 마세요.` });
            names.delete(v);
          }
        }
        continue;
      }
      if (DECISION.test(line.replace(re, ''))) {
        report(i + 1, { en: 'This check trusts a reverse DNS name.', ko: '이 검사는 역방향 DNS 이름을 믿습니다.' });
        continue;
      }
      const assign = /(?:\b(?:var|let|const|val|String|string|auto|char\s*\*)\s+|\$)?(\w+)\s*:?=\s*[^=]/.exec(line);
      if (assign) names.add(assign[1]);
    }
  },
});

// ---------------------------------------------------------------------------
// 7.2 Dangerous APIs (complements the C/C++ CERT and MISRA packs)

const DANGEROUS = {
  java: [/\bRuntime\.getRuntime\(\)\.(runFinalizersOnExit|traceInstructions)\b/, /\b(Thread\.currentThread\(\)|\w*[tT]hread\w*)\.(stop|suspend|resume)\s*\(\s*\)/, /\bSystem\.runFinalizersOnExit\s*\(/],
  kt: [/\bThread\.(stop|suspend|resume)\s*\(/],
  cs: [/\bThread\.(Abort|Suspend|Resume)\s*\(/, /\bAppDomain\.\w+\.SetPrincipalPolicy\b/],
  js: [/\bnew\s+Buffer\s*\(/, /\bdocument\.write\s*\(/],
  py: [/\bos\.tempnam\s*\(|\bos\.tmpnam\s*\(|\btempfile\.mktemp\s*\(/, /\binput\s*\(.*\)\s*$/],
  php: [/\b(ereg|eregi|split|mysql_query|mysql_connect|create_function)\s*\(/],
  c: [/\b(gets|tmpnam|tempnam|mktemp|getwd|chroot)\s*\(/],
  cpp: [/\b(gets|tmpnam|tempnam|mktemp|getwd)\s*\(/, /\bstd::auto_ptr\b/],
};

R({
  key: 'kr-secure:dangerous-api', mois: '7.2', langs: ['java', 'kt', 'cs', 'js', 'ts', 'php', 'c', 'cpp'],
  type: 'VULNERABILITY', severity: 'MAJOR', debtMin: 10, tags: ['cwe-676', 'cwe-477'], cwe: 'CWE-676',
  name: { en: 'Dangerous or obsolete APIs should not be used', ko: '위험하거나 폐기된 API를 쓰면 안 됩니다' },
  why: { en: 'These functions cannot be used safely (no bounds, races on temporary names, unsafe thread control) or were removed for security reasons.', ko: '이 함수들은 안전하게 쓸 수 없거나(경계 없음, 임시 이름 경쟁, 위험한 스레드 제어) 보안 문제로 폐기되었습니다.' },
  fix: { en: 'Use the safe replacement (fgets, mkstemp, Buffer.from, interrupt-based stopping, PDO or mysqli).', ko: '안전한 대체 함수(fgets, mkstemp, Buffer.from, 인터럽트 방식 중지, PDO·mysqli)를 쓰세요.' },
  check(f, s, report) {
    const pats = DANGEROUS[f.lang === 'ts' ? 'js' : f.lang] || [];
    for (let i = 0; i < s.code.length; i++) {
      for (const re of pats) {
        const m = re.exec(s.code[i]);
        if (m) { report(i + 1, { en: `"${m[0].replace(/\s*\($/, '').trim()}" is a dangerous API.`, ko: `"${m[0].replace(/\s*\($/, '').trim()}"는 위험한 API입니다.` }); break; }
      }
    }
  },
});

// ---------------------------------------------------------------------------

function catalog() {
  return RULES.map((r) => ({
    key: r.key,
    langs: r.langs,
    type: r.type,
    severity: r.severity,
    debtMin: r.debtMin,
    tags: [...r.tags, 'mois-2021'],
    name: r.name,
    why: r.why,
    fix: r.fix,
    cwe: r.cwe,
    category: 'Security',
    standards: { cwe: [r.cwe], mois2021: [r.mois] },
  }));
}

function analyze(files, ctx = {}) {
  const inactive = ctx.inactive || new Set();
  const active = RULES.filter((r) => !inactive.has(r.key));
  const out = [];
  for (const f of files || []) {
    const rules = active.filter((r) => r.langs.includes(f.lang));
    if (!rules.length) continue;
    let s;
    try { s = scan(f.text, f.lang); } catch { continue; }
    for (const rule of rules) {
      try {
        rule.check(f, s, (line, message) => out.push({ rule: rule.key, file: f.path, line, message }));
      } catch { /* a rule never breaks the analysis */ }
    }
  }
  return out;
}

module.exports = { catalog, analyze, scan, RULES };
