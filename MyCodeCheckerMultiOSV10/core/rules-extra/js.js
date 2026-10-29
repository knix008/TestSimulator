'use strict';

// JavaScript / TypeScript (TypeScript files run the 'js' rules too).

const { maker, nestedTernary } = require('./util');

const R = maker('js', ['js']);

// ── Literal-aware matching ───────────────────────────────────
// A '/' starts a regular-expression literal (not a division) after these.
// Not after '<' (a JSX closing tag </div>).
const REGEX_BEFORE = /(?:^|[(,=:[!&|?{};+\-*%~^]|=>|\b(?:return|typeof|case|do|else|in|of|new|delete|void|throw|yield|await|instanceof))\s*$/;

// Lexer state carried from line to line: a stack of open templates (each
// with the ${ } depth of the code inside it) and an open block comment.
function freshState() {
  return { tpl: [], block: false };
}

function copyState(st) {
  return { tpl: st.tpl.map((t) => ({ ...t })), block: st.block };
}

// Scans one line from state st (updated in place). Returns a per-character
// map: 0 code, 1 inside a string / template / regex literal (the opening
// delimiter counts as code), 2 comment. ${ } inside a template is code. A
// quote that is not closed on the line is an apostrophe (JSX text), not a
// string.
function scanLine(line, st) {
  const s = String(line);
  const kind = new Uint8Array(s.length);
  let q = null;
  let inClass = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (st.block) {
      kind[i] = 2;
      if (c === '*' && s[i + 1] === '/') { kind[i + 1] = 2; i++; st.block = false; }
      continue;
    }
    const top = st.tpl[st.tpl.length - 1];
    if (!q && top && top.depth < 0) {
      // template text
      kind[i] = 1;
      if (c === '\\') { if (i + 1 < s.length) kind[i + 1] = 1; i++; continue; }
      if (c === '`') { st.tpl.pop(); continue; }
      if (c === '$' && s[i + 1] === '{') { kind[i + 1] = 1; i++; top.depth = 0; }
      continue;
    }
    if (q) {
      kind[i] = 1;
      if (c === '\\') { if (i + 1 < s.length) kind[i + 1] = 1; i++; continue; }
      if (q === '/') {
        if (c === '[') inClass = true;
        else if (c === ']') inClass = false;
        else if (c === '/' && !inClass) q = null;
        continue;
      }
      if (c === q) q = null;
      continue;
    }
    if (c === '/' && s[i + 1] === '/') { for (let j = i; j < s.length; j++) kind[j] = 2; break; }
    if (c === '/' && s[i + 1] === '*') { kind[i] = 2; kind[i + 1] = 2; i++; st.block = true; continue; }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < s.length && s[j] !== c) j += s[j] === '\\' ? 2 : 1;
      if (j < s.length) q = c;
      continue;
    }
    if (c === '`') { st.tpl.push({ depth: -1 }); continue; }
    if (top && c === '{') { top.depth++; continue; }
    if (top && c === '}') { if (top.depth === 0) { top.depth = -1; kind[i] = 1; } else top.depth--; continue; }
    if (c === '/' && REGEX_BEFORE.test(s.slice(0, i))) { q = '/'; inClass = false; }
  }
  return kind;
}

// Lexer state at the start of every line of a file, cached per lines array.
const FILE_STATES = new WeakMap();
function lineStates(lines) {
  let out = FILE_STATES.get(lines);
  if (out) return out;
  out = [];
  const st = freshState();
  for (const l of lines) {
    out.push(copyState(st));
    scanLine(l, st);
  }
  FILE_STATES.set(lines, out);
  return out;
}

// Literal map of one line: true inside a string, template or regex literal.
// ctx ({ index, lines }, when the caller passes it) gives the state at the
// line start, so a line inside a template that started above is literal.
function literalMask(line, ctx) {
  let st = freshState();
  if (ctx && Array.isArray(ctx.lines) && Number.isInteger(ctx.index)) {
    const states = lineStates(ctx.lines);
    if (states[ctx.index]) st = copyState(states[ctx.index]);
  }
  st.block = false; // the code line has its comments removed already
  const kind = scanLine(line, st);
  return Array.from(kind, (k) => k === 1);
}

// True when some match of re on the line touches code, i.e. does not lie
// wholly inside one string, template or regex literal.
function codeHit(re, line, ctx) {
  const s = String(line);
  const g = new RegExp(re.source, re.flags.replace(/[gy]/g, '') + 'g');
  let lit = null;
  let m;
  while ((m = g.exec(s))) {
    lit = lit || literalMask(s, ctx);
    const end = Math.max(m.index + 1, m.index + m[0].length);
    for (let i = m.index; i < end && i < s.length; i++) if (!lit[i]) return true;
    if (m[0].length === 0) g.lastIndex++;
  }
  return false;
}

// The line with the inside of every literal replaced by spaces.
function blankJs(line, ctx) {
  const s = String(line);
  const lit = literalMask(s, ctx);
  let out = '';
  for (let i = 0; i < s.length; i++) out += lit[i] ? ' ' : s[i];
  return out;
}

// js:eqeq: true when every == / != of the line (outside literals) is the
// idiom that compares like ===: against null / undefined (both nullish), or
// typeof against a string.
function looseEqualityIsIdiom(line, ctx) {
  const s = String(line);
  const lit = literalMask(s, ctx);
  const re = /(?<![=!<>])[=!]=(?!=)/g;
  let m;
  while ((m = re.exec(s))) {
    if (lit[m.index]) continue;
    const before = s.slice(0, m.index);
    const after = s.slice(m.index + 2);
    if (/^\s*(?:null|undefined)\b/.test(after) || /\b(?:null|undefined)\s*$/.test(before)) continue;
    if (/\btypeof\s+[\w$.]+\s*$/.test(before) || /^\s*typeof\b/.test(after)) continue;
    return false;
  }
  return true;
}

// Line rules of a JS/TS file only see code: a pattern that appears only
// inside a string, template or regex literal (a rule catalog, a message, a
// sample) is not reported. The optional fourth argument { index, lines }
// lets a line inside a multi-line template be recognized.
function codeOnly(rule) {
  const base = rule.skip;
  rule.skip = (rawLine, line, file, ctx) => !codeHit(rule.re, line, ctx) || (base ? base(rawLine, line, file, ctx) : false);
  return rule;
}

// ── Bugs ─────────────────────────────────────────────────────
R('self-assignment', 'B', 'MA', 5, ['pitfall'],
  /^\s*([A-Za-z_$][\w$.]*)\s*=(?!=)\s*\1\s*;?\s*$/,
  ['Variable is assigned to itself', 'Assigning a variable to itself does nothing and usually hides a typo.', 'Assign the intended value or delete the line.'],
  ['변수를 자기 자신에게 대입합니다', '자기 대입은 아무 일도 하지 않고 보통 오타를 숨깁니다.', '의도한 값을 대입하거나 줄을 지우세요.'],
  'total = total;', 'total = sum;');
R('identical-operands', 'B', 'MA', 5, ['pitfall'],
  /(?<![\w$.])(?<![=!<>+\-*\/%&|]\s*)([A-Za-z_$][\w$.]*)\s*(?:===|!==|==|!=|<=|>=|&&|\|\|)\s*\1(?![\w$.(\[])(?=\s*(?:[);,?:]|&&|\|\||$))/,
  ['Identical expressions on both sides of an operator', 'Comparing or combining an expression with itself is always the same result and is usually a copy-paste slip.', 'Fix the operand that was meant to differ; use Number.isNaN for NaN checks.'],
  ['연산자 양쪽 식이 같습니다', '같은 식끼리 비교하거나 묶으면 결과가 항상 같고 보통 복사 실수입니다.', '달라야 할 피연산자를 고치세요. NaN 검사는 Number.isNaN을 쓰세요.'],
  'if (a.length === a.length) {', 'if (a.length === b.length) {', { ns: true });
R('nan-comparison', 'B', 'CR', 5, ['pitfall'],
  /[=!]==?\s*NaN\b|\bNaN\s*[=!]==?/,
  ['Comparison with NaN', 'NaN is not equal to anything, itself included, so this test is always false (or always true for !==).', 'Use Number.isNaN(value).'],
  ['NaN과 비교합니다', 'NaN은 자기 자신을 포함해 어떤 값과도 같지 않아 결과가 항상 같습니다.', 'Number.isNaN(value)를 쓰세요.'],
  'if (x === NaN) {', 'if (Number.isNaN(x)) {', { ns: true });
R('empty-statement-after-control', 'B', 'MA', 5, ['pitfall'],
  /^\s*(?:if|for|while)\s*\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\)\s*;\s*$/,
  ['Semicolon right after if / for / while', 'The stray semicolon is the whole body, so the block below runs unconditionally or only once.', 'Remove the semicolon.'],
  ['if / for / while 바로 뒤에 세미콜론이 있습니다', '세미콜론이 본문 전체가 되어 아래 블록이 조건 없이 또는 한 번만 실행됩니다.', '세미콜론을 지우세요.'],
  'if (ready);', 'if (ready) start();');
R('assignment-in-condition', 'B', 'MA', 5, ['pitfall', 'cwe-481'],
  /\b(?:if|while)\s*\(\s*[\w$.]+\s*=(?![=>])\s*[^=]/,
  ['Assignment inside a condition', 'A single = in a condition assigns instead of comparing.', 'Use === to compare, or move the assignment out of the condition.'],
  ['조건 안에서 대입합니다', '조건 안의 = 하나는 비교가 아니라 대입입니다.', '비교는 ===를 쓰거나 대입을 조건 밖으로 빼세요.'],
  'if (user = admin) {', 'if (user === admin) {', { ns: true });
R('constant-condition', 'B', 'MA', 5, ['pitfall', 'cwe-570'],
  /\bif\s*\(\s*(?:true|false|0|1|null|undefined)\s*\)/,
  ['Condition is a constant', 'A literal condition makes one branch dead code.', 'Remove the dead branch or test a real value.'],
  ['조건이 상수입니다', '리터럴 조건은 한쪽 분기를 죽은 코드로 만듭니다.', '죽은 분기를 지우거나 실제 값을 검사하세요.'],
  'if (false) { debugStuff(); }', 'if (flags.debug) { debugStuff(); }');
R('typeof-invalid', 'B', 'CR', 5, ['pitfall'],
  /typeof\s+[\w$.]+\s*[=!]==?\s*['"](?!(?:undefined|object|boolean|number|string|function|symbol|bigint)['"])\w*['"]/,
  ['typeof compared with an impossible string', 'typeof only returns a fixed set of names, so a misspelled one never matches.', 'Use one of undefined, object, boolean, number, string, function, symbol or bigint.'],
  ['typeof를 불가능한 문자열과 비교합니다', 'typeof는 정해진 이름만 돌려주므로 철자가 틀리면 절대 일치하지 않습니다.', 'undefined, object, boolean, number, string, function, symbol, bigint 중 하나를 쓰세요.'],
  "if (typeof cb === 'fucntion') {", "if (typeof cb === 'function') {");
R('array-delete', 'B', 'MA', 5, ['pitfall'],
  /\bdelete\s+[\w$.]+\[\s*(?:\d+|i|j|idx|index)\s*\](?!\s*[.[])/,
  ['delete on an array element', 'delete leaves a hole and does not change the length.', 'Use splice to remove the element.'],
  ['배열 요소에 delete를 씁니다', 'delete는 빈 칸을 남기고 길이를 바꾸지 않습니다.', 'splice로 요소를 지우세요.'],
  'delete items[i];', ['items.splice(i, 1);', 'delete rec[k];', 'delete doc.packages[0].versionInfo;']);
R('parseint-radix', 'B', 'MI', 2, ['pitfall'],
  /\bparseInt\s*\(\s*[^,()]+\)/,
  ['parseInt without a radix', 'Without a radix, strings with a leading 0x are read as hexadecimal.', 'Pass the radix, usually 10, or use Number().'],
  ['기수 없이 parseInt를 씁니다', '기수가 없으면 0x로 시작하는 문자열을 16진수로 읽습니다.', '보통 10인 기수를 넘기거나 Number()를 쓰세요.'],
  'const n = parseInt(text);', 'const n = parseInt(text, 10);');
R('primitive-wrapper', 'B', 'MA', 5, ['pitfall'],
  /\bnew\s+(?:String|Number|Boolean)\s*\(/,
  ['Primitive wrapper object', 'new Boolean(false) is a truthy object, and wrappers never equal their primitive with ===.', 'Call String(), Number() or Boolean() without new.'],
  ['원시값 래퍼 객체를 만듭니다', 'new Boolean(false)는 참으로 평가되는 객체이고 ===로 원시값과 같지 않습니다.', 'new 없이 String(), Number(), Boolean()을 호출하세요.'],
  'const ok = new Boolean(false);', 'const ok = Boolean(value);');
R('unreachable-same-line', 'B', 'MA', 5, ['unused', 'cwe-561'],
  /^\s*(?:return\b[^;{}]*|throw\b[^;{}]*|break|continue)\s*;\s*[A-Za-z_$][\w$]*\s*[(=.]/,
  ['Code after return on the same line', 'Statements after return, throw, break or continue never run.', 'Delete the dead statement or move it before the jump.'],
  ['같은 줄의 return 뒤에 코드가 있습니다', 'return, throw, break, continue 뒤의 문장은 실행되지 않습니다.', '죽은 문장을 지우거나 점프 앞으로 옮기세요.'],
  'return result; cleanup();', ['cleanup(); return result;', "return win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));"], { ns: true });
R('negative-zero-compare', 'B', 'MI', 5, ['pitfall'],
  /[=!]==\s*-0(?![\w.])/,
  ['Comparison with -0', '-0 === 0 is true, so the test cannot tell negative zero apart.', 'Use Object.is(value, -0).'],
  ['-0과 비교합니다', '-0 === 0 이 참이라 음의 0을 구분하지 못합니다.', 'Object.is(value, -0)을 쓰세요.'],
  'if (x === -0) {', 'if (Object.is(x, -0)) {', { ns: true });
R('async-promise-executor', 'B', 'MA', 10, ['async'],
  /\bnew\s+Promise\s*\(\s*async\b/,
  ['async Promise executor', 'Errors thrown inside an async executor are lost and do not reject the promise.', 'Use a plain executor or an async function without new Promise.'],
  ['Promise 실행 함수가 async입니다', 'async 실행 함수 안에서 던진 오류는 사라지고 promise를 거부하지 않습니다.', '일반 실행 함수를 쓰거나 new Promise 없이 async 함수를 쓰세요.'],
  'return new Promise(async (resolve) => {', 'return new Promise((resolve) => {');
R('async-foreach', 'B', 'MA', 10, ['async'],
  /\.forEach\s*\(\s*async\b/,
  ['async callback in forEach', 'forEach does not wait for the returned promises, so work runs unordered and errors are lost.', 'Use for...of with await, or await Promise.all(items.map(...)).'],
  ['forEach에 async 콜백을 넘깁니다', 'forEach는 반환된 promise를 기다리지 않아 순서가 없고 오류가 사라집니다.', 'await와 함께 for...of를 쓰거나 Promise.all(items.map(...))을 기다리세요.'],
  'items.forEach(async (item) => {', 'for (const item of items) {');
R('negated-instanceof', 'B', 'CR', 5, ['pitfall'],
  /!\s*[\w$.]+\s+(?:instanceof|in)\s/,
  ['Negation binds before instanceof / in', '!a instanceof B negates a first, so it tests false instanceof B.', 'Write !(a instanceof B).'],
  ['부정이 instanceof / in 보다 먼저 묶입니다', '!a instanceof B는 a를 먼저 부정해 false instanceof B를 검사합니다.', '!(a instanceof B)로 쓰세요.'],
  'if (!err instanceof HttpError) {', 'if (!(err instanceof HttpError)) {', { ns: true });
R('return-assignment', 'S', 'MA', 5, ['pitfall'],
  /^\s*return\s+[\w$.]+\s*=(?![=>])/,
  ['Assignment in a return statement', 'return x = y reads like a comparison and is usually a typo.', 'Assign first, then return, or use === if a comparison was meant.'],
  ['return 문에서 대입합니다', 'return x = y는 비교처럼 보여 보통 오타입니다.', '먼저 대입하고 반환하거나 비교라면 ===를 쓰세요.'],
  'return this.cache = value;', 'return this.cache === value;', { ns: true });
R('float-equality', 'B', 'MI', 5, ['pitfall'],
  /[=!]==?\s*-?\d+\.\d+(?![\d.])/,
  ['Strict equality on a floating-point literal', 'Floating-point results like 0.1 + 0.2 are rarely exactly equal to a literal.', 'Compare with a tolerance: Math.abs(a - b) < Number.EPSILON.'],
  ['부동소수점 리터럴과 동등 비교합니다', '0.1 + 0.2 같은 부동소수점 결과는 리터럴과 정확히 같은 경우가 드뭅니다.', '오차 범위로 비교하세요: Math.abs(a - b) < Number.EPSILON.'],
  'if (total === 0.3) {', 'if (Math.abs(total - 0.3) < 1e-9) {', { ns: true });
R('octal-literal', 'B', 'MA', 5, ['pitfall'],
  /(?<=[=(,:\s])0[0-7]+(?![\w.\]])/,
  ['Legacy octal literal', 'A leading 0 makes the number octal in sloppy mode, so 010 is 8.', 'Use 0o10 for octal or drop the leading zero.'],
  ['예전 8진수 리터럴입니다', '앞의 0 때문에 비엄격 모드에서 8진수가 되어 010은 8입니다.', '8진수는 0o10을 쓰고 아니면 앞의 0을 지우세요.'],
  'const mode = 0755;', 'const mode = 0o755;', { ns: true });
R('arguments-callee', 'B', 'MA', 10, ['deprecated'],
  /\barguments\.(?:callee|caller)\b/,
  ['arguments.callee or arguments.caller', 'These throw in strict mode and block optimizations.', 'Name the function and refer to it directly.'],
  ['arguments.callee 또는 caller를 씁니다', 'strict 모드에서 예외를 던지고 최적화를 막습니다.', '함수에 이름을 붙이고 직접 참조하세요.'],
  'return arguments.callee(n - 1);', 'return factorial(n - 1);');
R('discarded-new', 'S', 'MA', 5, ['pitfall'],
  /^\s*new\s+[A-Z][\w$.]*\s*\((?:[^;()]|\((?:[^;()]|\([^;()]*\))*\))*\)\s*;?\s*$/,
  ['Object created and dropped', 'Creating an object only for its constructor side effects hides what the code does.', 'Keep the instance, or call a named function for the side effect.'],
  ['객체를 만들고 버립니다', '생성자 부작용만을 위해 객체를 만들면 하는 일이 숨겨집니다.', '인스턴스를 보관하거나 부작용용 이름 있는 함수를 호출하세요.'],
  'new Logger(config);', ['const logger = new Logger(config);', 'new Flow(an).run();']);

// ── Vulnerabilities and hotspots ─────────────────────────────
R('weak-hash', 'H', 'CR', 15, ['cwe-328', 'owasp-a02', 'crypto'],
  /\bcreateHash\s*\(\s*['"](?:md5|md4|sha1|ripemd160)['"]/i,
  ['Weak hash algorithm', 'MD5 and SHA-1 have practical collisions and must not protect integrity or passwords.', 'Use SHA-256 or stronger; for passwords use scrypt, argon2 or bcrypt.'],
  ['약한 해시 알고리즘입니다', 'MD5와 SHA-1은 실제 충돌이 있어 무결성이나 비밀번호 보호에 쓰면 안 됩니다.', 'SHA-256 이상을 쓰고 비밀번호에는 scrypt, argon2, bcrypt를 쓰세요.'],
  "crypto.createHash('md5').update(data)", "crypto.createHash('sha256').update(data)");
R('weak-cipher', 'V', 'CR', 30, ['cwe-327', 'owasp-a02', 'crypto'],
  /\bcreateCipher(?:iv)?\s*\(\s*['"](?:des|des-ede|des-ede3|des3|rc2|rc4|bf|blowfish)[^'"]*['"]/i,
  ['Weak cipher algorithm', 'DES, 3DES, RC2, RC4 and Blowfish are broken or have too small a block or key.', 'Use AES-GCM or ChaCha20-Poly1305.'],
  ['약한 암호 알고리즘입니다', 'DES, 3DES, RC2, RC4, Blowfish는 깨졌거나 블록·키가 너무 작습니다.', 'AES-GCM이나 ChaCha20-Poly1305를 쓰세요.'],
  "crypto.createCipheriv('des-ede3-cbc', key, iv)", "crypto.createCipheriv('aes-256-gcm', key, iv)");
R('ecb-mode', 'V', 'CR', 30, ['cwe-327', 'owasp-a02', 'crypto'],
  /['"]aes-\d+-ecb['"]/i,
  ['ECB cipher mode', 'ECB encrypts equal blocks to equal output and leaks patterns.', 'Use an authenticated mode such as GCM.'],
  ['ECB 암호 모드입니다', 'ECB는 같은 블록을 같은 결과로 암호화해 패턴이 드러납니다.', 'GCM 같은 인증 모드를 쓰세요.'],
  "crypto.createCipheriv('aes-128-ecb', key, null)", "crypto.createCipheriv('aes-128-gcm', key, iv)");
R('create-cipher-no-iv', 'V', 'CR', 20, ['cwe-329', 'owasp-a02', 'crypto', 'deprecated'],
  /\bcrypto\.createCipher\s*\(/,
  ['crypto.createCipher derives the IV from the password', 'createCipher uses a weak key derivation and a fixed IV; it is removed from current Node.', 'Use createCipheriv with a random IV and a proper key.'],
  ['crypto.createCipher가 비밀번호에서 IV를 만듭니다', 'createCipher는 약한 키 유도와 고정 IV를 쓰며 최신 Node에서 제거됐습니다.', '무작위 IV와 올바른 키로 createCipheriv를 쓰세요.'],
  "const c = crypto.createCipher('aes192', pass);", "const c = crypto.createCipheriv('aes-256-gcm', key, iv);");
R('tls-reject-unauthorized', 'V', 'CR', 15, ['cwe-295', 'owasp-a07', 'tls'],
  /rejectUnauthorized\s*:\s*false/,
  ['TLS certificate check disabled', 'rejectUnauthorized: false accepts any certificate, allowing man-in-the-middle.', 'Keep verification on and add the CA with the ca option.'],
  ['TLS 인증서 검사를 끕니다', 'rejectUnauthorized: false는 아무 인증서나 받아들여 중간자 공격을 허용합니다.', '검증을 켜 두고 ca 옵션으로 CA를 추가하세요.'],
  'https.request({ host, rejectUnauthorized: false })', 'https.request({ host, ca })');
R('tls-env-disabled', 'V', 'CR', 15, ['cwe-295', 'owasp-a07', 'tls'],
  /NODE_TLS_REJECT_UNAUTHORIZED['"]?\]?\s*=\s*['"]?0/,
  ['NODE_TLS_REJECT_UNAUTHORIZED set to 0', 'This turns off certificate checks for every TLS connection in the process.', 'Remove it and trust the needed CA explicitly.'],
  ['NODE_TLS_REJECT_UNAUTHORIZED를 0으로 둡니다', '프로세스의 모든 TLS 연결에서 인증서 검사를 끕니다.', '지우고 필요한 CA를 명시적으로 신뢰하세요.'],
  "process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';", "process.env.NODE_EXTRA_CA_CERTS = caPath;");
R('cors-any-origin', 'H', 'MA', 10, ['cwe-942', 'owasp-a05'],
  /Access-Control-Allow-Origin['"]\s*,\s*['"]\*['"]|\borigin\s*:\s*['"]\*['"]|\bcors\s*\(\s*\)/,
  ['CORS allows any origin', 'A wildcard origin lets any site read responses meant for your front end.', 'List the allowed origins explicitly.'],
  ['CORS가 모든 origin을 허용합니다', '와일드카드 origin은 아무 사이트나 응답을 읽게 합니다.', '허용할 origin을 명시하세요.'],
  "res.setHeader('Access-Control-Allow-Origin', '*');", "res.setHeader('Access-Control-Allow-Origin', allowedOrigin);");
R('cookie-not-secure', 'H', 'MA', 5, ['cwe-614', 'owasp-a05', 'cookie'],
  /\bsecure\s*:\s*false\b/,
  ['Cookie without the Secure flag', 'Without Secure the cookie is also sent over plain HTTP.', 'Set secure: true.'],
  ['Secure 속성이 없는 쿠키입니다', 'Secure가 없으면 쿠키가 평문 HTTP로도 전송됩니다.', 'secure: true를 설정하세요.'],
  "res.cookie('sid', id, { secure: false });", "res.cookie('sid', id, { secure: true });");
R('cookie-not-httponly', 'H', 'MA', 5, ['cwe-1004', 'owasp-a05', 'cookie'],
  /\bhttpOnly\s*:\s*false\b/,
  ['Cookie readable from script', 'httpOnly: false lets injected script steal the cookie.', 'Set httpOnly: true for session cookies.'],
  ['스크립트가 읽을 수 있는 쿠키입니다', 'httpOnly: false면 주입된 스크립트가 쿠키를 훔칠 수 있습니다.', '세션 쿠키에는 httpOnly: true를 설정하세요.'],
  "res.cookie('sid', id, { httpOnly: false });", "res.cookie('sid', id, { httpOnly: true });");
R('jwt-none-algorithm', 'V', 'BL', 30, ['cwe-347', 'owasp-a02', 'jwt'],
  /algorithms?\s*:\s*\[?\s*['"]none['"]/i,
  ['JWT "none" algorithm accepted', 'An unsigned token can be forged by anyone.', 'Allow only the signing algorithms you issue, for example ["RS256"].'],
  ['JWT "none" 알고리즘을 허용합니다', '서명 없는 토큰은 누구나 위조할 수 있습니다.', '발급하는 서명 알고리즘만 허용하세요. 예: ["RS256"].'],
  "jwt.verify(token, key, { algorithms: ['none'] });", "jwt.verify(token, key, { algorithms: ['RS256'] });");
R('jwt-decode-unverified', 'H', 'MA', 10, ['cwe-347', 'owasp-a02', 'jwt'],
  /\bjwt\.decode\s*\(/,
  ['JWT decoded without verification', 'jwt.decode does not check the signature, so its claims cannot be trusted.', 'Use jwt.verify before trusting any claim.'],
  ['검증 없이 JWT를 디코딩합니다', 'jwt.decode는 서명을 확인하지 않아 클레임을 믿을 수 없습니다.', '클레임을 믿기 전에 jwt.verify를 쓰세요.'],
  'const claims = jwt.decode(token);', 'const claims = jwt.verify(token, key);');
R('jwt-ignore-expiration', 'V', 'MA', 10, ['cwe-613', 'owasp-a07', 'jwt'],
  /ignoreExpiration\s*:\s*true/,
  ['JWT expiry ignored', 'Expired tokens stay valid forever.', 'Remove ignoreExpiration and refresh tokens instead.'],
  ['JWT 만료를 무시합니다', '만료된 토큰이 영원히 유효합니다.', 'ignoreExpiration을 지우고 토큰을 갱신하세요.'],
  'jwt.verify(token, key, { ignoreExpiration: true });', 'jwt.verify(token, key, { maxAge: "1h" });');
R('insecure-websocket', 'H', 'MI', 5, ['cwe-319', 'owasp-a02'],
  /['"`]ws:\/\/(?!localhost|127\.0\.0\.1|\[::1\])/,
  ['Unencrypted WebSocket', 'ws:// traffic can be read and changed on the network.', 'Use wss://.'],
  ['암호화되지 않은 WebSocket입니다', 'ws:// 통신은 네트워크에서 읽고 바꿀 수 있습니다.', 'wss://를 쓰세요.'],
  "new WebSocket('ws://api.example.com/feed')", "new WebSocket('wss://api.example.com/feed')");
R('regexp-from-variable', 'H', 'MA', 10, ['cwe-1333', 'owasp-a03', 'redos'],
  /\bnew\s+RegExp\s*\(\s*(?!['"`\/]|String\.raw\b|[A-Z][A-Z0-9_]*\b(?!\s*[.[(])|[\w$.]+\.source\b)[\w$]/,
  ['Regular expression built from a variable', 'A pattern from input can be crafted to backtrack for a very long time (ReDoS).', 'Escape the input or match it with indexOf / includes.'],
  ['변수로 정규식을 만듭니다', '입력으로 만든 패턴은 오래 역추적하도록 조작될 수 있습니다(ReDoS).', '입력을 이스케이프하거나 indexOf / includes로 찾으세요.'],
  'const re = new RegExp(req.query.q);', ["const re = new RegExp('^[a-z]+$');", "const g = new RegExp(re.source, 'g');", 'const re = new RegExp(PATTERN);']);
R('open-redirect', 'V', 'CR', 20, ['cwe-601', 'owasp-a01'],
  /\b(?:res|response)\.redirect\s*\(\s*(?:\d{3}\s*,\s*)?req\.(?:query|params|body)/,
  ['Redirect to a request parameter', 'Redirecting to a user-supplied URL sends victims to phishing sites.', 'Redirect only to known paths or check the host against an allow list.'],
  ['요청 매개변수로 리다이렉트합니다', '사용자가 준 URL로 보내면 피싱 사이트로 유도됩니다.', '알려진 경로로만 보내거나 허용 목록으로 호스트를 확인하세요.'],
  'res.redirect(req.query.next);', "res.redirect('/home');");
R('reflected-xss', 'V', 'CR', 20, ['cwe-79', 'owasp-a03', 'xss'],
  /\bres\.(?:send|write|end)\s*\(\s*req\.(?:query|params|body)/,
  ['Request data sent back as the response body', 'Echoing request data unescaped is reflected XSS.', 'Escape the value or render it through a template that escapes.'],
  ['요청 데이터를 응답 본문으로 돌려보냅니다', '이스케이프 없이 요청 데이터를 되돌리면 반사형 XSS입니다.', '값을 이스케이프하거나 이스케이프하는 템플릿으로 그리세요.'],
  'res.send(req.query.name);', 'res.send(escapeHtml(name));');
R('path-traversal', 'V', 'CR', 20, ['cwe-22', 'owasp-a01'],
  /\b(?:readFile|readFileSync|createReadStream|sendFile|writeFile|writeFileSync|unlink|unlinkSync)\s*\(\s*(?:req\.|[^,)]*\+\s*req\.)/,
  ['File path from the request', 'A path built from input can use ../ to read or write any file.', 'Resolve the path and check that it stays inside the allowed folder.'],
  ['요청에서 온 파일 경로입니다', '입력으로 만든 경로는 ../로 아무 파일이나 읽고 쓸 수 있습니다.', '경로를 정규화하고 허용 폴더 안인지 확인하세요.'],
  "fs.readFile('uploads/' + req.params.name, cb);", 'fs.readFile(path.join(base, safeName), cb);');
R('nosql-where', 'V', 'CR', 20, ['cwe-943', 'owasp-a03'],
  /['"]?\$where['"]?\s*:/,
  ['MongoDB $where operator', '$where runs JavaScript on the server and is open to injection.', 'Express the filter with normal query operators.'],
  ['MongoDB $where 연산자입니다', '$where는 서버에서 JavaScript를 실행해 주입에 취약합니다.', '일반 쿼리 연산자로 조건을 쓰세요.'],
  "db.users.find({ $where: 'this.age > ' + age });", 'db.users.find({ age: { $gt: age } });');
R('csp-disabled', 'H', 'MA', 10, ['cwe-693', 'owasp-a05'],
  /contentSecurityPolicy\s*:\s*false/,
  ['Content-Security-Policy turned off', 'Without a CSP, injected scripts run freely.', 'Keep helmet\'s CSP on and allow only the sources you need.'],
  ['Content-Security-Policy를 끕니다', 'CSP가 없으면 주입된 스크립트가 자유롭게 실행됩니다.', 'helmet의 CSP를 켜 두고 필요한 출처만 허용하세요.'],
  'app.use(helmet({ contentSecurityPolicy: false }));', 'app.use(helmet());');
R('electron-node-integration', 'V', 'CR', 20, ['cwe-94', 'electron'],
  /\bnodeIntegration(?:InWorker|InSubFrames)?\s*:\s*true\b/,
  ['Electron nodeIntegration enabled', 'Any XSS in the window becomes full code execution on the machine.', 'Keep nodeIntegration off and expose a narrow API through a preload script.'],
  ['Electron nodeIntegration을 켭니다', '창의 XSS가 곧 컴퓨터의 코드 실행이 됩니다.', 'nodeIntegration을 끄고 preload로 좁은 API만 노출하세요.'],
  'webPreferences: { nodeIntegration: true },', 'webPreferences: { nodeIntegration: false },');
R('electron-context-isolation', 'V', 'CR', 20, ['cwe-653', 'electron'],
  /\bcontextIsolation\s*:\s*false\b/,
  ['Electron contextIsolation disabled', 'Page scripts can tamper with the preload script and reach Node APIs.', 'Keep contextIsolation: true and use contextBridge.'],
  ['Electron contextIsolation을 끕니다', '페이지 스크립트가 preload를 조작해 Node API에 닿을 수 있습니다.', 'contextIsolation: true를 유지하고 contextBridge를 쓰세요.'],
  'webPreferences: { contextIsolation: false },', 'webPreferences: { contextIsolation: true },');
R('electron-web-security', 'V', 'CR', 20, ['cwe-346', 'electron'],
  /\bwebSecurity\s*:\s*false\b|\ballowRunningInsecureContent\s*:\s*true\b/,
  ['Electron web security disabled', 'Turning off webSecurity removes the same-origin policy for the window.', 'Leave webSecurity on and serve content over a custom protocol.'],
  ['Electron 웹 보안을 끕니다', 'webSecurity를 끄면 창의 동일 출처 정책이 사라집니다.', 'webSecurity를 켜 두고 사용자 프로토콜로 콘텐츠를 제공하세요.'],
  'webPreferences: { webSecurity: false },', 'webPreferences: { webSecurity: true },');
R('weak-rsa-key', 'V', 'CR', 15, ['cwe-326', 'owasp-a02', 'crypto'],
  /\bmodulusLength\s*:\s*(?:512|768|1024)\b/,
  ['RSA key shorter than 2048 bits', 'Keys of 1024 bits or less can be factored with enough resources.', 'Use at least 2048 bits, 3072 for long-lived keys.'],
  ['2048비트보다 짧은 RSA 키입니다', '1024비트 이하 키는 충분한 자원으로 인수분해할 수 있습니다.', '최소 2048비트, 오래 쓸 키는 3072비트를 쓰세요.'],
  "generateKeyPairSync('rsa', { modulusLength: 1024 });", "generateKeyPairSync('rsa', { modulusLength: 3072 });");
R('pbkdf2-iterations', 'V', 'MA', 10, ['cwe-916', 'owasp-a02', 'crypto'],
  /\bpbkdf2(?:Sync)?\s*\([^,]+,[^,]+,\s*(?:\d{1,3}|[1-9]\d{3})\s*,/,
  ['PBKDF2 with too few iterations', 'Fewer than 10,000 iterations make password guessing cheap.', 'Use at least 600,000 iterations for SHA-256, or switch to scrypt / argon2.'],
  ['반복 횟수가 적은 PBKDF2입니다', '1만 회 미만 반복은 비밀번호 추측을 싸게 만듭니다.', 'SHA-256 기준 최소 60만 회를 쓰거나 scrypt / argon2로 바꾸세요.'],
  "crypto.pbkdf2Sync(pw, salt, 1000, 32, 'sha256');", "crypto.pbkdf2Sync(pw, salt, 600000, 32, 'sha256');");
R('file-permissions-777', 'V', 'MA', 10, ['cwe-732', 'owasp-a01'],
  /\bchmod(?:Sync)?\s*\([^,]+,\s*(?:0o?777|['"]777['"])\s*\)|\bmode\s*:\s*0o?777\b/,
  ['World-writable file permissions', 'Mode 777 lets every local user change or replace the file.', 'Grant only what is needed, for example 0o644 or 0o600.'],
  ['모두 쓸 수 있는 파일 권한입니다', '777 권한은 모든 로컬 사용자가 파일을 바꾸거나 교체하게 합니다.', '필요한 만큼만 주세요. 예: 0o644, 0o600.'],
  "fs.chmodSync(file, 0o777);", "fs.chmodSync(file, 0o600);");
R('dynamic-require', 'H', 'MA', 10, ['cwe-829', 'owasp-a08'],
  /(?<![\w$.])require\s*\(\s*(?!['"`])[A-Za-z_$][\w$.]*(?:\s*\+|\s*\)|\[)/,
  ['require() with a computed path', 'Loading a module chosen at run time can load attacker-controlled code.', 'Map allowed names to static require calls.'],
  ['계산된 경로로 require()를 합니다', '실행 중 고른 모듈을 불러오면 공격자 코드가 로드될 수 있습니다.', '허용 이름을 정적 require 호출에 대응시키세요.'],
  'const plugin = require(pluginName);', "const plugin = require('./plugins/csv');");
R('vm-run', 'H', 'CR', 20, ['cwe-94', 'owasp-a03'],
  /\bvm\.run(?:InNewContext|InThisContext|InContext)\s*\(|\bnew\s+vm\.Script\s*\(/,
  ['Code run with the vm module', 'The vm module is not a sandbox; code can escape to the host.', 'Avoid running untrusted code, or isolate it in a separate process.'],
  ['vm 모듈로 코드를 실행합니다', 'vm 모듈은 샌드박스가 아니라 코드가 호스트로 빠져나갈 수 있습니다.', '신뢰할 수 없는 코드는 실행하지 말거나 별도 프로세스로 격리하세요.'],
  'vm.runInNewContext(userCode, sandbox);', 'worker.postMessage({ task });');
R('jsx-target-blank', 'H', 'MI', 5, ['cwe-1022', 'react'],
  /<[A-Za-z][\w.]*\b[^<>]*\btarget\s*=\s*\{?\s*['"]_blank['"][^<>]*>/,
  ['target="_blank" without rel="noopener"', 'The opened page gets window.opener and can redirect your tab.', 'Add rel="noopener noreferrer".'],
  ['rel="noopener" 없는 target="_blank"', '열린 페이지가 window.opener로 원래 탭을 바꿀 수 있습니다.', 'rel="noopener noreferrer"를 추가하세요.'],
  '<a href={url} target="_blank">Docs</a>', '<a href={url} target="_blank" rel="noopener noreferrer">Docs</a>',
  { skip: (raw) => /\brel\s*=\s*\{?\s*['"][^'"]*noopener/.test(raw) });
R('html-insertion', 'V', 'MA', 15, ['cwe-79', 'owasp-a03', 'xss'],
  /\.outerHTML\s*=(?!=)|\.insertAdjacentHTML\s*\(/,
  ['HTML inserted with outerHTML / insertAdjacentHTML', 'Markup built from data can run script.', 'Create elements and set textContent, or sanitize first.'],
  ['outerHTML / insertAdjacentHTML로 HTML을 넣습니다', '데이터로 만든 마크업은 스크립트를 실행할 수 있습니다.', '요소를 만들어 textContent를 쓰거나 먼저 정화하세요.'],
  "list.insertAdjacentHTML('beforeend', item);", 'list.append(document.createTextNode(item));');
R('local-storage-secret', 'V', 'MA', 10, ['cwe-922', 'owasp-a04'],
  /\b(?:localStorage|sessionStorage)\.setItem\s*\(\s*['"`][^'"`]*(?:token|password|secret|jwt|apikey|api_key)/i,
  ['Secret kept in web storage', 'Any script on the page, including injected ones, can read localStorage.', 'Keep session tokens in an httpOnly cookie.'],
  ['웹 저장소에 비밀 값을 둡니다', '주입된 것을 포함해 페이지의 모든 스크립트가 localStorage를 읽을 수 있습니다.', '세션 토큰은 httpOnly 쿠키에 두세요.'],
  "localStorage.setItem('authToken', token);", "localStorage.setItem('theme', theme);");
R('document-domain', 'V', 'MA', 10, ['cwe-346'],
  /\bdocument\.domain\s*=(?!=)/,
  ['Assignment to document.domain', 'Relaxing document.domain lets sibling subdomains script this page.', 'Use postMessage with an origin check.'],
  ['document.domain에 대입합니다', 'document.domain을 완화하면 형제 서브도메인이 이 페이지를 조작합니다.', 'origin 검사와 함께 postMessage를 쓰세요.'],
  "document.domain = 'example.com';", 'window.parent.postMessage(msg, origin);');
R('cookie-write', 'H', 'MI', 5, ['cwe-614', 'cookie'],
  /\bdocument\.cookie\s*=(?!=)/,
  ['Cookie written from script', 'Script-set cookies cannot be httpOnly and often miss Secure and SameSite.', 'Set the cookie from the server with Secure, HttpOnly and SameSite.'],
  ['스크립트에서 쿠키를 씁니다', '스크립트로 만든 쿠키는 httpOnly가 될 수 없고 Secure, SameSite를 빠뜨리기 쉽습니다.', '서버에서 Secure, HttpOnly, SameSite와 함께 설정하세요.'],
  "document.cookie = 'sid=' + id;", 'const cookies = document.cookie;');
R('new-buffer', 'V', 'MA', 10, ['cwe-665', 'deprecated'],
  /\bnew\s+Buffer\s*\(/,
  ['Deprecated Buffer constructor', 'new Buffer(n) may return uninitialized memory containing old data.', 'Use Buffer.alloc, Buffer.from or Buffer.allocUnsafe deliberately.'],
  ['사용 중단된 Buffer 생성자입니다', 'new Buffer(n)는 예전 데이터가 남은 초기화되지 않은 메모리를 줄 수 있습니다.', 'Buffer.alloc, Buffer.from을 쓰고 allocUnsafe는 의도할 때만 쓰세요.'],
  'const buf = new Buffer(size);', 'const buf = Buffer.alloc(size);');

// ── Code smells ──────────────────────────────────────────────
R('empty-function', 'S', 'MI', 5, ['suspicious'],
  /\bfunction\s*\*?\s*[\w$]*\s*\([^)]*\)\s*\{\s*\}/,
  ['Empty function', 'An empty body is either unfinished or should say why nothing happens.', 'Implement it, or add a comment explaining why it is empty.'],
  ['빈 함수입니다', '빈 본문은 미완성이거나 왜 아무 일도 안 하는지 적어야 합니다.', '구현하거나 비어 있는 이유를 주석으로 남기세요.'],
  'function onReady() {}', 'function onReady() { start(); }');
R('empty-block', 'S', 'MA', 5, ['suspicious'],
  /\b(?:if|while)\s*\((?:[^()]|\([^()]*\))*\)\s*\{\s*\}|\belse\s*\{\s*\}/,
  ['Empty if / else / while block', 'An empty block does nothing and usually marks forgotten code.', 'Remove the block or fill it in.'],
  ['빈 if / else / while 블록입니다', '빈 블록은 아무 일도 하지 않고 보통 잊은 코드입니다.', '블록을 지우거나 채우세요.'],
  'if (err) {}', ['if (err) { report(err); }', 'if (moved) { /* still a click */ }'], { ns: true, skip: (raw) => /\{\s*\/[*\/]/.test(raw) });
R('nested-ternary', 'S', 'MA', 5, ['confusing'],
  /[\s)\]]\?\s.*[\s)\]]\?\s/,
  ['Nested ternary operator', 'Chained ?: expressions are hard to read and easy to get wrong.', 'Use if / else or a lookup table.'],
  ['중첩된 삼항 연산자입니다', '이어진 ?: 식은 읽기 어렵고 틀리기 쉽습니다.', 'if / else나 조회 표를 쓰세요.'],
  ["const s = a ? 'x' : b ? 'y' : 'z';", 'const k = a ? (b ? 1 : 2) : 3;'], ["const s = a ? 'x' : 'z';", 'const t = (a ? 1 : 2) + (b ? 3 : 4);', 'const o = { a: x ? 1 : 2, b: y ? 3 : 4 };', 'const v = a ?? b ? c : d;'],
  { skip: (raw, line) => !nestedTernary(line) });
R('redundant-boolean', 'S', 'MI', 2, ['clumsy'],
  /[^=!][=!]=(?!=)\s*(?:true|false)\b|\b(?:true|false)\s*[=!]=(?!=)/,
  ['Loose comparison with a boolean literal', 'x == true converts x first, so "1" == true is true while "2" == true is false.', 'Test the value directly, or convert it explicitly.'],
  ['불리언 리터럴과 비교합니다', 'x == true는 x를 먼저 변환해 "1" == true는 참, "2" == true는 거짓입니다.', '값을 직접 검사하거나 명시적으로 변환하세요.'],
  'if (isOpen == true) {', ['if (isOpen) {', 'if (flag === false) {'], { ns: true });
R('boolean-ternary', 'S', 'MI', 2, ['clumsy'],
  /\?\s*true\s*:\s*false\b|\?\s*false\s*:\s*true\b/,
  ['Ternary returning true / false', 'cond ? true : false is just the condition.', 'Use the condition, or Boolean(cond) / !cond.'],
  ['true / false를 돌려주는 삼항입니다', 'cond ? true : false는 조건 그대로입니다.', '조건을 그대로 쓰거나 Boolean(cond) / !cond를 쓰세요.'],
  'const done = count > 0 ? true : false;', 'const done = count > 0;', { ns: true });
R('label', 'S', 'MA', 5, ['confusing'],
  /^\s*[A-Za-z_$][\w$]*\s*:\s*(?:for|while|do)\b/,
  ['Labeled loop', 'Labels with break / continue make the control flow hard to follow.', 'Extract the inner loop into a function and return.'],
  ['레이블이 붙은 반복문입니다', '레이블과 break / continue는 흐름을 따라가기 어렵게 합니다.', '안쪽 반복을 함수로 빼고 return하세요.'],
  'outer: for (const row of rows) {', 'for (const row of rows) {');
R('global-isnan', 'S', 'MI', 2, ['pitfall'],
  /(?<![\w$.])isNaN\s*\(/,
  ['Global isNaN', 'isNaN coerces its argument, so isNaN("abc") is true.', 'Use Number.isNaN.'],
  ['전역 isNaN을 씁니다', 'isNaN은 인자를 변환해 isNaN("abc")가 참입니다.', 'Number.isNaN을 쓰세요.'],
  'if (isNaN(value)) {', 'if (Number.isNaN(value)) {');
R('empty-constructor-literal', 'S', 'MI', 2, ['clumsy'],
  /\bnew\s+(?:Array|Object)\s*\(\s*\)/,
  ['new Array() or new Object()', 'The literal forms [] and {} are shorter and cannot be shadowed.', 'Use [] or {}.'],
  ['new Array() 또는 new Object()', '리터럴 [] 와 {} 가 더 짧고 가려지지 않습니다.', '[] 또는 {}를 쓰세요.'],
  'const list = new Array();', 'const list = [];');
R('throw-literal', 'S', 'MA', 5, ['error-handling'],
  /\bthrow\s+(?:['"`]|\d)/,
  ['Literal thrown instead of an Error', 'A thrown string has no stack trace and breaks instanceof checks.', 'Throw new Error("...") or a subclass.'],
  ['Error 대신 리터럴을 던집니다', '던진 문자열에는 스택이 없고 instanceof 검사가 깨집니다.', 'new Error("...")나 하위 클래스를 던지세요.'],
  "throw 'not found';", "throw new Error('not found');");
R('useless-concat', 'S', 'MI', 2, ['clumsy'],
  /(['"])[^'"]*\1\s*\+\s*(['"])[^'"]*\2(?!\s*\+)/,
  ['Two string literals concatenated', 'Joining literals on one line adds noise.', 'Write a single literal.'],
  ['두 문자열 리터럴을 이어 붙입니다', '한 줄에서 리터럴을 이어 붙이면 잡음만 늘어납니다.', '리터럴 하나로 쓰세요.'],
  "const s = 'Hello, ' + 'world';", ["const s = 'Hello, ' + name;", "const ops = { '+': 9, '-': 9 };"], { ns: true });
R('class-naming', 'S', 'MI', 2, ['convention'],
  /\bclass\s+[a-z][\w$]*/,
  ['Class name not in PascalCase', 'Classes are expected to start with a capital letter.', 'Rename the class to PascalCase.'],
  ['클래스 이름이 PascalCase가 아닙니다', '클래스 이름은 대문자로 시작하는 것이 관례입니다.', '클래스 이름을 PascalCase로 바꾸세요.'],
  'class userStore {', 'class UserStore {', { ns: true });
R('has-own-property', 'S', 'MI', 2, ['pitfall'],
  /(?<!prototype)\.hasOwnProperty\s*\(/,
  ['hasOwnProperty called on the object', 'Objects created with Object.create(null) or with an own hasOwnProperty key break this call.', 'Use Object.hasOwn(obj, key).'],
  ['객체에서 hasOwnProperty를 직접 호출합니다', 'Object.create(null) 객체나 hasOwnProperty 키가 있는 객체에서 깨집니다.', 'Object.hasOwn(obj, key)를 쓰세요.'],
  'if (obj.hasOwnProperty(key)) {', 'if (Object.hasOwn(obj, key)) {');
R('async-without-await', 'S', 'MI', 5, ['async'],
  /\basync\s+(?:function\b[^{(]*)?\([^)]*\)\s*(?:=>\s*)?\{(?![^}]*\bawait\b)[^{}]*\}/,
  ['async function without await', 'Marking a function async without awaiting only wraps its result in a promise.', 'Remove async or await the asynchronous call.'],
  ['await 없는 async 함수입니다', 'await 없이 async를 붙이면 결과를 promise로 감쌀 뿐입니다.', 'async를 지우거나 비동기 호출을 await하세요.'],
  'const load = async () => { return cache; };', 'const load = async () => { return await fetchData(); };');
R('inverted-comparison', 'S', 'MI', 2, ['clumsy'],
  /!\s*\(\s*[\w$.]+\s*(?:===|!==|==|!=)\s*[\w$.'"]+\s*\)/,
  ['Negated comparison', '!(a === b) is easier to read as a !== b.', 'Use the opposite operator.'],
  ['부정된 비교입니다', '!(a === b)는 a !== b로 쓰는 편이 읽기 쉽습니다.', '반대 연산자를 쓰세요.'],
  'if (!(a === b)) {', 'if (a !== b) {');
R('deprecated-substr', 'S', 'MI', 2, ['deprecated'],
  /\.substr\s*\(/,
  ['String.prototype.substr', 'substr is a legacy feature and may be removed.', 'Use slice or substring.'],
  ['String.prototype.substr를 씁니다', 'substr는 예전 기능이라 사라질 수 있습니다.', 'slice나 substring을 쓰세요.'],
  'const head = text.substr(0, 3);', 'const head = text.slice(0, 3);');
R('ts-non-null-assertion', 'S', 'MI', 5, ['typescript'],
  /[\w$)\]]!\.[A-Za-z_$]/,
  ['Non-null assertion', 'x!.y tells the compiler to trust you; a null at run time still crashes.', 'Check for null, or use optional chaining.'],
  ['non-null 단언을 씁니다', 'x!.y는 컴파일러가 믿게 할 뿐 실행 중 null이면 여전히 죽습니다.', 'null을 검사하거나 옵셔널 체이닝을 쓰세요.'],
  'const n = user!.name;', 'const n = user?.name;', { ns: true, langs: ['ts'] });
R('ts-function-type', 'S', 'MI', 5, ['typescript'],
  /:\s*Function\b(?!\.)/,
  ['Function used as a type', 'The Function type accepts anything callable and checks no arguments.', 'Write the signature, for example (x: number) => void.'],
  ['Function을 타입으로 씁니다', 'Function 타입은 호출 가능한 모든 것을 받고 인자를 검사하지 않습니다.', '(x: number) => void 처럼 시그니처를 쓰세요.'],
  'let onDone: Function;', 'let onDone: (err?: Error) => void;', { ns: true, langs: ['ts'] });
R('ts-object-type', 'S', 'MI', 5, ['typescript'],
  /:\s*Object(?=\s*[;,)=|&>\]]|\s*$)/,
  ['Object used as a type', 'Object accepts almost any value, including strings and numbers.', 'Use object, Record<string, unknown> or a real interface.'],
  ['Object를 타입으로 씁니다', 'Object는 문자열과 숫자까지 거의 모든 값을 받습니다.', 'object, Record<string, unknown>, 또는 실제 인터페이스를 쓰세요.'],
  'function save(data: Object) {', 'function save(data: Record<string, unknown>) {', { ns: true, langs: ['ts'] });

for (const rule of R.rules) codeOnly(rule);

module.exports = { RULES: R.rules, literalMask, blankJs, codeHit, codeOnly, looseEqualityIsIdiom };
