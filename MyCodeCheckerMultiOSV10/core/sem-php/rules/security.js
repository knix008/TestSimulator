'use strict';

// Security vulnerabilities and hotspots that do not need taint tracking
// (injection flows are reported by core/taint): weak cryptography, TLS
// configuration, cookies, credentials, risky PHP settings and APIs.

const { rule, php, fn, cls } = require('./core');
const A = require('../ast');
const H = require('./h');

void cls;

function iniSet(n) {
  if (!H.isCall(n, ['ini_set', 'ini_alter'])) return null;
  const name = A.strVal(H.arg(n, 0));
  if (name == null) return null;
  return { name: name.toLowerCase(), value: H.arg(n, 1) };
}

function mentions(e, re) {
  return A.contains(e, (x) => x.k === 'Name' && re.test(A.shortName(x.name)), true);
}

function lowerStr(e) {
  const s = H.strConst(e);
  return s == null ? null : s.toLowerCase();
}

// ── cryptography
const WEAK_HASH = new Set(['md2', 'md4', 'md5', 'sha1', 'ripemd128', 'haval128,3', 'tiger128,3']);
rule({
  id: 'weak-hash', sonar: 'S4790', type: 'H', sev: 'CR', debt: 30, tags: ['cwe-328', 'cwe-327'], owasp: ['A02'], checker: 'WEAK_HASH',
  en: ['Using weak hashing algorithms is security-sensitive', 'MD5 and SHA-1 have practical collision attacks and must not protect integrity or secrets.', 'Use SHA-256 or stronger, and password_hash() for passwords.'],
  ko: ['약한 해시 알고리즘을 쓰는 것은 보안에 민감합니다', 'MD5와 SHA-1은 실제 충돌 공격이 있어 무결성이나 비밀 보호에 쓰면 안 됩니다.', 'SHA-256 이상을 쓰고 비밀번호에는 password_hash()를 씁니다.'],
  msg: ['Make sure this weak hash algorithm ({0}) is not used in a sensitive context.', '이 약한 해시 알고리즘({0})이 민감한 곳에 쓰이지 않는지 확인합니다.'],
  on: {
    Call(n, cx) {
      const nm = A.callName(n);
      if (['md5', 'sha1', 'md5_file', 'sha1_file'].includes(nm)) { cx.report(n, nm.replace('_file', '')); return; }
      if (['hash', 'hash_file', 'hash_init'].includes(nm)) {
        const algo = lowerStr(H.arg(n, 0));
        if (algo && WEAK_HASH.has(algo)) cx.report(n, algo);
      }
    },
  },
  bad: fn('    $h = md5($a); // Noncompliant\n    return hash(\'sha1\', $b); // Noncompliant'),
  good: fn('    $h = hash(\'sha256\', $a);\n    return hash_hmac(\'sha256\', $b, $c) . $h;'),
});

const WEAK_CIPHER = /^(des|des-ede|des-ede3|des-ede3-cbc|des-cbc|rc2|rc4|rc4-40|bf|blowfish|cast5|idea|seed)(-|$)/i;
rule({
  id: 'weak-cipher', sonar: 'S5547', type: 'V', sev: 'CR', debt: 15, tags: ['cwe-327'], owasp: ['A02'], checker: 'RISKY_CRYPTO',
  en: ['Cipher algorithms should be robust', 'DES, 3DES, RC2, RC4 and Blowfish can be broken; mcrypt is unmaintained and removed from PHP.', 'Use AES-256-GCM through openssl_encrypt() or sodium.'],
  ko: ['암호 알고리즘은 견고해야 합니다', 'DES, 3DES, RC2, RC4, Blowfish는 깨질 수 있고 mcrypt는 유지보수되지 않아 PHP에서 제거되었습니다.', 'openssl_encrypt()나 sodium으로 AES-256-GCM을 씁니다.'],
  msg: ['Use a strong cipher algorithm instead of "{0}".', '"{0}" 대신 강한 암호 알고리즘을 씁니다.'],
  on: {
    Call(n, cx) {
      const nm = A.callName(n);
      if (nm.startsWith('mcrypt_') && ['mcrypt_encrypt', 'mcrypt_decrypt', 'mcrypt_module_open', 'mcrypt_cbc', 'mcrypt_ecb', 'mcrypt_cfb', 'mcrypt_ofb'].includes(nm)) { cx.report(n, nm); return; }
      if (nm === 'openssl_encrypt' || nm === 'openssl_decrypt' || nm === 'openssl_seal' || nm === 'openssl_open') {
        const idx = nm === 'openssl_seal' || nm === 'openssl_open' ? 4 : 1;
        const m = lowerStr(H.arg(n, idx, 'cipher_algo'));
        if (m && WEAK_CIPHER.test(m)) cx.report(n, m);
      }
    },
  },
  bad: fn('    return openssl_encrypt($a, \'des-ede3-cbc\', $b, 0, $c); // Noncompliant'),
  good: fn('    return openssl_encrypt($a, \'aes-256-gcm\', $b, 0, $c, $tag);'),
});

rule({
  id: 'ecb-mode', sonar: 'S5542', type: 'V', sev: 'CR', debt: 15, tags: ['cwe-327'], owasp: ['A02'], checker: 'RISKY_CRYPTO',
  en: ['Encryption algorithms should be used with secure mode and padding scheme', 'ECB mode encrypts identical blocks to identical output and leaks patterns of the plaintext.', 'Use an authenticated mode such as GCM.'],
  ko: ['암호화 알고리즘은 안전한 모드와 패딩으로 써야 합니다', 'ECB 모드는 같은 블록을 같은 결과로 암호화해 평문의 패턴을 드러냅니다.', 'GCM 같은 인증 모드를 씁니다.'],
  msg: ['Use a secure mode instead of ECB for "{0}".', '"{0}"에 ECB 대신 안전한 모드를 씁니다.'],
  on: {
    Call(n, cx) {
      const nm = A.callName(n);
      if (nm === 'openssl_encrypt' || nm === 'openssl_decrypt') {
        const m = lowerStr(H.arg(n, 1, 'cipher_algo'));
        if (m && /(^|-)ecb$/.test(m)) cx.report(n, m);
      } else if (nm.startsWith('mcrypt_') && n.args.some((a) => H.constName(a.e) === 'MCRYPT_MODE_ECB')) cx.report(n, nm);
    },
  },
  bad: fn('    return openssl_encrypt($a, \'aes-128-ecb\', $b); // Noncompliant'),
  good: fn('    return openssl_encrypt($a, \'aes-128-gcm\', $b, 0, $c, $tag);'),
});

const WEAK_TLS = /^(STREAM_CRYPTO_METHOD_(SSLv2|SSLv3|SSLv23|TLSv1_0|TLSv1_1)_(CLIENT|SERVER)|STREAM_CRYPTO_METHOD_TLS_(CLIENT|SERVER)|CURL_SSLVERSION_(SSLv2|SSLv3|TLSv1|TLSv1_0|TLSv1_1|MAX_TLSv1_0|MAX_TLSv1_1))$/;
rule({
  id: 'weak-tls', sonar: 'S4423', type: 'V', sev: 'CR', debt: 15, tags: ['cwe-327'], owasp: ['A02', 'A07'], checker: 'WEAK_TLS',
  en: ['Weak SSL/TLS protocols should not be used', 'SSLv2, SSLv3, TLS 1.0 and TLS 1.1 have known weaknesses and are deprecated.', 'Require TLS 1.2 or newer.'],
  ko: ['약한 SSL/TLS 프로토콜을 쓰면 안 됩니다', 'SSLv2, SSLv3, TLS 1.0, TLS 1.1은 알려진 약점이 있어 폐기되었습니다.', 'TLS 1.2 이상을 요구합니다.'],
  msg: ['Change this code to use a stronger protocol than "{0}".', '"{0}"보다 강한 프로토콜을 쓰도록 고칩니다.'],
  on: {
    Name(n, cx) { const s = A.shortName(n.name); if (WEAK_TLS.test(s) && !(n.parent && n.parent.k === 'Call' && n.parent.callee === n)) cx.report(n, s); },
  },
  bad: fn('    curl_setopt($a, CURLOPT_SSLVERSION, CURL_SSLVERSION_TLSv1_1); // Noncompliant'),
  good: fn('    curl_setopt($a, CURLOPT_SSLVERSION, CURL_SSLVERSION_TLSv1_2);'),
});

// curl / stream options: CURLOPT_X => v in curl_setopt and curl_setopt_array, 'key' => v in stream contexts
function optionChecks(n, cx, curlOpt, streamKey, bad) {
  if (H.isCall(n, 'curl_setopt')) {
    if (H.constName(H.arg(n, 1)) === curlOpt && bad(H.arg(n, 2))) cx.report(n);
    return;
  }
  if (n.k === 'Item' && n.key) {
    const k = H.constName(n.key) || A.strVal(n.key);
    if ((k === curlOpt || (streamKey && k === streamKey)) && bad(n.value)) cx.report(n);
  }
}
rule({
  id: 'certificate-validation-disabled', sonar: 'S4830', type: 'V', sev: 'CR', debt: 5, tags: ['cwe-295'], owasp: ['A02', 'A07'], checker: 'SSL_VERIFY_DISABLED',
  en: ['Server certificates should be verified during SSL/TLS connections', 'Without certificate validation any attacker in the middle can impersonate the server.', 'Keep CURLOPT_SSL_VERIFYPEER and verify_peer enabled.'],
  ko: ['SSL/TLS 연결 중에는 서버 인증서를 검증해야 합니다', '인증서를 검증하지 않으면 중간자 공격자가 서버를 사칭할 수 있습니다.', 'CURLOPT_SSL_VERIFYPEER와 verify_peer를 켜 둡니다.'],
  msg: ['Enable server certificate validation on this SSL/TLS connection.', '이 SSL/TLS 연결에서 서버 인증서 검증을 켭니다.'],
  on: {
    Call(n, cx) { optionChecks(n, cx, 'CURLOPT_SSL_VERIFYPEER', null, H.falsyLit); },
    Item(n, cx) { optionChecks(n, cx, 'CURLOPT_SSL_VERIFYPEER', 'verify_peer', H.falsyLit); },
  },
  bad: fn('    curl_setopt($a, CURLOPT_SSL_VERIFYPEER, false); // Noncompliant\n    return stream_context_create([\'ssl\' => [\'verify_peer\' => false]]); // Noncompliant'),
  good: fn('    curl_setopt($a, CURLOPT_SSL_VERIFYPEER, true);\n    return stream_context_create([\'ssl\' => [\'verify_peer\' => true]]);'),
});

rule({
  id: 'hostname-verification-disabled', sonar: 'S5527', type: 'V', sev: 'CR', debt: 5, tags: ['cwe-297'], owasp: ['A02', 'A07'], checker: 'SSL_VERIFY_DISABLED',
  en: ['Server hostnames should be verified during SSL/TLS connections', 'A valid certificate for another host is accepted when the host name is not checked.', 'Set CURLOPT_SSL_VERIFYHOST to 2 and keep verify_peer_name enabled.'],
  ko: ['SSL/TLS 연결 중에는 서버 호스트 이름을 검증해야 합니다', '호스트 이름을 확인하지 않으면 다른 호스트의 유효한 인증서도 받아들입니다.', 'CURLOPT_SSL_VERIFYHOST를 2로 두고 verify_peer_name을 켜 둡니다.'],
  msg: ['Enable server hostname verification on this SSL/TLS connection.', '이 SSL/TLS 연결에서 서버 호스트 이름 검증을 켭니다.'],
  on: {
    Call(n, cx) { optionChecks(n, cx, 'CURLOPT_SSL_VERIFYHOST', null, (v) => H.falsyLit(v) || H.intConst(v) === 1); },
    Item(n, cx) { optionChecks(n, cx, 'CURLOPT_SSL_VERIFYHOST', 'verify_peer_name', (v) => H.falsyLit(v) || H.intConst(v) === 1); },
  },
  bad: fn('    curl_setopt($a, CURLOPT_SSL_VERIFYHOST, 0); // Noncompliant'),
  good: fn('    curl_setopt($a, CURLOPT_SSL_VERIFYHOST, 2);'),
});

rule({
  id: 'weak-random', sonar: 'S2245', type: 'H', sev: 'CR', debt: 10, tags: ['cwe-338', 'cwe-330'], owasp: ['A02'], checker: 'DC.WEAK_CRYPTO',
  en: ['Using pseudorandom number generators (PRNGs) is security-sensitive', 'rand(), mt_rand(), uniqid() and similar are predictable and must not create tokens, keys or passwords.', 'Use random_int() or random_bytes() for security purposes.'],
  ko: ['의사 난수 생성기를 쓰는 것은 보안에 민감합니다', 'rand(), mt_rand(), uniqid() 등은 예측 가능하므로 토큰, 키, 비밀번호 생성에 쓰면 안 됩니다.', '보안 용도에는 random_int()나 random_bytes()를 씁니다.'],
  msg: ['Make sure that using this pseudorandom number generator "{0}" is safe here.', '여기서 의사 난수 생성기 "{0}"를 써도 안전한지 확인합니다.'],
  on: {
    Call(n, cx) { const nm = A.callName(n); if (['rand', 'mt_rand', 'srand', 'mt_srand', 'array_rand', 'shuffle', 'str_shuffle', 'uniqid', 'lcg_value', 'mt_getrandmax'].includes(nm)) cx.report(n, nm); },
  },
  bad: fn('    return mt_rand(); // Noncompliant'),
  good: fn('    return random_int(0, PHP_INT_MAX);'),
});

// ── credentials
const PW_NAME = /(^|_|-|\b)(pass(word|wd|phrase)?|pwd|passcode)$|password|passwd/i;
const looksSecret = (s) => typeof s === 'string' && s.length > 0 && !/^\s*$/.test(s) && !/^(\{|\$|%|<|\*+$|changeme$|password$|null$)/i.test(s);
rule({
  id: 'hardcoded-credentials', sonar: 'S2068', type: 'H', sev: 'BL', debt: 30, tags: ['cwe-798', 'cwe-259'], owasp: ['A07'], checker: 'HARDCODED_CREDENTIALS',
  en: ['Hard-coded credentials are security-sensitive', 'Passwords in source code end up in version control and every copy of the application.', 'Load credentials from the environment, a vault or a protected configuration file.'],
  ko: ['하드코딩된 자격 증명은 보안에 민감합니다', '소스 코드의 비밀번호는 버전 관리와 애플리케이션의 모든 사본에 남습니다.', '자격 증명은 환경 변수, 볼트, 보호된 설정 파일에서 읽습니다.'],
  msg: ['"{0}" detected here, make sure this is not a hard-coded credential.', '여기서 "{0}"가 발견되었습니다. 하드코딩된 자격 증명이 아닌지 확인합니다.'],
  on: {
    Assign(n, cx) {
      if (n.op !== '=') return;
      const v = A.strVal(n.r);
      if (!looksSecret(v)) return;
      let name = null;
      if (n.l.k === 'Var') name = n.l.name;
      else if (n.l.k === 'Prop' && typeof n.l.name === 'string') name = n.l.name;
      else if (n.l.k === 'Index') name = A.strVal(n.l.idx);
      if (name && PW_NAME.test(name)) cx.report(n, name);
    },
    Item(n, cx) {
      const k = n.key && A.strVal(n.key);
      if (k && PW_NAME.test(k) && looksSecret(A.strVal(n.value))) cx.report(n, k);
    },
    PropItem(n, cx) { if (PW_NAME.test(n.name) && looksSecret(A.strVal(n.def))) cx.report(n, n.name); },
    ConstItem(n, cx) { if (PW_NAME.test(n.name) && looksSecret(A.strVal(n.value))) cx.report(n, n.name); },
    Call(n, cx) {
      if (!H.isCall(n, 'define')) return;
      const k = A.strVal(H.arg(n, 0));
      if (k && PW_NAME.test(k) && looksSecret(A.strVal(H.arg(n, 1)))) cx.report(n, k);
    },
    Lit(n, cx) {
      if (n.kind !== 'str') return;
      if (/^[a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:[^\s@/]+@/i.test(n.value) || /;\s*(password|pwd)\s*=\s*[^;\s{$]+/i.test(n.value)) cx.report(n, 'password');
    },
  },
  bad: fn('    $password = \'s3cr3t!\'; // Noncompliant\n    $db = [\'db_password\' => \'hunter2\']; // Noncompliant\n    return \'mysql://admin:topsecret@db/app\'; // Noncompliant'),
  good: fn('    $password = getenv(\'DB_PASSWORD\');\n    $db = [\'db_password\' => $password];\n    return \'mysql://db/app\';'),
});

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(:\d{1,5})?$/;
rule({
  id: 'hardcoded-ip', sonar: 'S1313', type: 'H', sev: 'MI', debt: 30, tags: ['cwe-547'], owasp: ['A05'], checker: 'HARDCODED_IP',
  en: ['Using hardcoded IP addresses is security-sensitive', 'Hard-coded addresses make deployments rigid and may expose internal hosts.', 'Read addresses from configuration.'],
  ko: ['하드코딩된 IP 주소를 쓰는 것은 보안에 민감합니다', '하드코딩된 주소는 배포를 경직되게 만들고 내부 호스트를 노출할 수 있습니다.', '주소는 설정에서 읽습니다.'],
  msg: ['Make sure using this hardcoded IP address "{0}" is safe here.', '하드코딩된 IP 주소 "{0}"를 여기서 써도 안전한지 확인합니다.'],
  on: {
    Lit(n, cx) {
      if (n.kind !== 'str') return;
      const m = IPV4.exec(n.value);
      if (!m) return;
      const o = m.slice(1, 5).map(Number);
      if (o.some((x) => x > 255)) return;
      if (o[0] === 127 || o.every((x) => x === 0) || o.every((x) => x === 255) || (o[0] === 2 && o[1] === 5)) return;
      cx.report(n, n.value);
    },
  },
  bad: fn('    return new Client(\'192.168.12.42\'); // Noncompliant'),
  good: fn('    return new Client(getenv(\'API_HOST\') ?: \'127.0.0.1\');'),
});

// ── cookies
function cookieFlag(n, cx, index, key, iniName) {
  const ini = iniSet(n);
  if (ini) { if (ini.name === iniName && H.falsyLit(ini.value)) cx.report(n, key); return; }
  if (!H.isCall(n, ['setcookie', 'setrawcookie'])) return;
  if (n.args.some((a) => a.spread)) return;
  const named = n.args.find((a) => a.name && a.name.toLowerCase() === key);
  if (named) { if (!H.truthyLit(named.e)) cx.report(n, key); return; }
  const opts = A.unparen(H.arg(n, 2));
  if (opts && opts.k === 'Arr') {
    const it = H.arrItem(opts, key);
    if (!it || !H.truthyLit(it.value)) cx.report(n, key);
    return;
  }
  if (opts && opts.k === 'Var' && n.args.length === 3) return;
  const flag = H.arg(n, index);
  if (!flag || !H.truthyLit(flag)) {
    if (flag && A.unparen(flag).k !== 'Lit') return;
    cx.report(n, key);
  }
}
rule({
  id: 'cookie-without-secure', sonar: 'S2092', type: 'H', sev: 'MI', debt: 5, tags: ['cwe-614', 'cwe-311'], owasp: ['A05'], checker: 'INSECURE_COOKIE',
  en: ['Creating cookies without the "secure" flag is security-sensitive', 'Without the secure flag the cookie is also sent over plain HTTP where it can be intercepted.', 'Set the secure flag to true (and session.cookie_secure).'],
  ko: ['secure 플래그 없이 쿠키를 만드는 것은 보안에 민감합니다', 'secure 플래그가 없으면 쿠키가 평문 HTTP로도 전송되어 가로챌 수 있습니다.', 'secure 플래그(및 session.cookie_secure)를 true로 설정합니다.'],
  msg: ['Make sure creating this cookie without the "{0}" flag is safe here.', '{0} 플래그 없이 이 쿠키를 만들어도 안전한지 확인합니다.'],
  on: { Call(n, cx) { cookieFlag(n, cx, 5, 'secure', 'session.cookie_secure'); } },
  bad: fn('    setcookie(\'sid\', $a, 0, \'/\', \'\', false, true); // Noncompliant\n    setcookie(\'theme\', $b); // Noncompliant'),
  good: fn('    setcookie(\'sid\', $a, 0, \'/\', \'\', true, true);\n    setcookie(\'theme\', $b, [\'secure\' => true, \'httponly\' => true]);'),
});

rule({
  id: 'cookie-without-httponly', sonar: 'S3330', type: 'H', sev: 'MI', debt: 5, tags: ['cwe-1004'], owasp: ['A05'], checker: 'INSECURE_COOKIE',
  en: ['Creating cookies without the "HttpOnly" flag is security-sensitive', 'Cookies without HttpOnly can be read by injected JavaScript and stolen through XSS.', 'Set the httponly flag to true (and session.cookie_httponly).'],
  ko: ['HttpOnly 플래그 없이 쿠키를 만드는 것은 보안에 민감합니다', 'HttpOnly가 없는 쿠키는 주입된 자바스크립트가 읽을 수 있어 XSS로 탈취됩니다.', 'httponly 플래그(및 session.cookie_httponly)를 true로 설정합니다.'],
  msg: ['Make sure creating this cookie without the "{0}" flag is safe here.', '{0} 플래그 없이 이 쿠키를 만들어도 안전한지 확인합니다.'],
  on: { Call(n, cx) { cookieFlag(n, cx, 6, 'httponly', 'session.cookie_httponly'); } },
  bad: fn('    setcookie(\'sid\', $a, 0, \'/\', \'\', true); // Noncompliant\n    ini_set(\'session.cookie_httponly\', 0); // Noncompliant'),
  good: fn('    setcookie(\'sid\', $a, 0, \'/\', \'\', true, true);\n    ini_set(\'session.cookie_httponly\', 1);'),
});

// ── XML
rule({
  id: 'xxe', sonar: 'S2755', type: 'V', sev: 'BL', debt: 15, tags: ['cwe-611', 'cwe-827'], owasp: ['A05'], checker: 'XML_EXTERNAL_ENTITY',
  en: ['XML parsers should not be vulnerable to XXE attacks', 'Substituting entities or loading DTDs lets a crafted document read local files or reach internal hosts.', 'Do not pass LIBXML_NOENT / LIBXML_DTDLOAD and keep the entity loader disabled.'],
  ko: ['XML 파서는 XXE 공격에 취약하면 안 됩니다', '엔티티를 치환하거나 DTD를 불러오면 조작된 문서가 로컬 파일을 읽거나 내부 호스트에 접근합니다.', 'LIBXML_NOENT / LIBXML_DTDLOAD를 넘기지 말고 엔티티 로더를 끈 채로 둡니다.'],
  msg: ['Disable access to external entities in XML parsing.', 'XML 파싱에서 외부 엔티티 접근을 끕니다.'],
  on: {
    Call(n, cx) {
      if (H.isCall(n, 'libxml_disable_entity_loader') && H.falsyLit(H.arg(n, 0))) { cx.report(n); return; }
      if (n.args.some((a) => mentions(a.e, /^LIBXML_(NOENT|DTDLOAD)$/))) cx.report(n);
    },
    MCall(n, cx) {
      if (n.args.some((a) => mentions(a.e, /^LIBXML_(NOENT|DTDLOAD)$/))) { cx.report(n); return; }
      if (typeof n.name === 'string' && n.name.toLowerCase() === 'setparserproperty' && H.constName(H.arg(n, 0)) === 'SUBST_ENTITIES' && H.truthyLit(H.arg(n, 1))) cx.report(n);
    },
    Assign(n, cx) {
      if (n.l.k === 'Prop' && n.l.name === 'substituteEntities' && H.truthyLit(n.r)) cx.report(n);
    },
  },
  bad: fn('    $doc = new DOMDocument();\n    $doc->loadXML($a, LIBXML_NOENT); // Noncompliant\n    return simplexml_load_string($b, \'SimpleXMLElement\', LIBXML_DTDLOAD); // Noncompliant'),
  good: fn('    $doc = new DOMDocument();\n    $doc->loadXML($a);\n    return simplexml_load_string($b, \'SimpleXMLElement\', LIBXML_NONET);'),
});

// ── clear text protocols
const SAFE_HOST = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|0\.0\.0\.0|([\w-]+\.)*(example\.(com|org|net)|w3\.org|xmlsoap\.org|json-schema\.org|purl\.org|openoffice\.org|microsoft\.com\/office|apache\.org\/xml|xmlns\.com|php\.net))(:\d+)?(\/|$)/i;
rule({
  id: 'clear-text-protocol', sonar: 'S5332', type: 'H', sev: 'CR', debt: 15, tags: ['cwe-319', 'cwe-311'], owasp: ['A02'], checker: 'CLEAR_TEXT',
  en: ['Using clear-text protocols is security-sensitive', 'http, ftp and telnet transmit data unencrypted, so it can be read and modified in transit.', 'Use https, sftp/ftps or ssh.'],
  ko: ['평문 프로토콜을 쓰는 것은 보안에 민감합니다', 'http, ftp, telnet은 암호화 없이 전송하므로 중간에 읽고 바꿀 수 있습니다.', 'https, sftp/ftps, ssh를 씁니다.'],
  msg: ['Using "{0}" protocol is insecure. Use "{1}" instead.', '"{0}" 프로토콜은 안전하지 않습니다. 대신 "{1}"를 씁니다.'],
  on: {
    Lit(n, cx) {
      if (n.kind !== 'str') return;
      const m = /^(http|ftp|telnet):\/\/(.*)$/i.exec(n.value);
      if (!m || !m[2] || SAFE_HOST.test(m[2])) return;
      const proto = m[1].toLowerCase();
      cx.report(n, proto, proto === 'http' ? 'https' : proto === 'ftp' ? 'sftp' : 'ssh');
    },
  },
  bad: fn('    return file_get_contents(\'http://api.vendor.io/data\'); // Noncompliant'),
  good: fn('    $ns = \'http://www.w3.org/2000/svg\';\n    return file_get_contents(\'https://api.vendor.io/data\') . $ns . \'http://localhost:8080/\';'),
});

// ── configuration
rule({
  id: 'debug-mode', sonar: 'S4507', type: 'H', sev: 'MI', debt: 1, tags: ['cwe-489', 'cwe-215'], owasp: ['A05'], checker: 'DEBUG_ENABLED',
  en: ['Delivering code in production with debug features activated is security-sensitive', 'Displayed errors and debug toolbars reveal paths, queries and configuration to attackers.', 'Disable display_errors and debug modes in production, and log errors instead.'],
  ko: ['디버그 기능을 켠 채 운영 환경에 배포하는 것은 보안에 민감합니다', '화면에 보이는 오류와 디버그 도구는 경로, 쿼리, 설정을 공격자에게 드러냅니다.', '운영 환경에서는 display_errors와 디버그 모드를 끄고 오류는 기록합니다.'],
  msg: ['Make sure this debug feature is deactivated before delivering the code in production.', '운영 환경에 배포하기 전에 이 디버그 기능이 꺼졌는지 확인합니다.'],
  on: {
    Call(n, cx) {
      const ini = iniSet(n);
      if (ini && (ini.name === 'display_errors' || ini.name === 'display_startup_errors') && H.truthyLit(ini.value)) { cx.report(n); return; }
      if (H.isCall(n, 'define') && ['WP_DEBUG', 'WP_DEBUG_DISPLAY', 'APP_DEBUG'].includes(A.strVal(H.arg(n, 0))) && H.truthyLit(H.arg(n, 1))) cx.report(n);
    },
    SCall(n, cx) {
      if (n.cls && n.cls.k === 'Name' && A.shortName(n.cls.name) === 'Debug' && typeof n.name === 'string' && n.name.toLowerCase() === 'enable') cx.report(n);
    },
  },
  bad: php('ini_set(\'display_errors\', 1); // Noncompliant\ndefine(\'WP_DEBUG\', true); // Noncompliant'),
  good: php('ini_set(\'display_errors\', 0);\nini_set(\'log_errors\', 1);\ndefine(\'WP_DEBUG\', false);'),
});

rule({
  id: 'permissive-file-permissions', sonar: 'S2612', type: 'H', sev: 'MA', debt: 15, tags: ['cwe-732', 'cwe-266'], owasp: ['A01'], checker: 'INSECURE_PERMISSIONS',
  en: ['Setting loose POSIX file permissions is security-sensitive', 'Files and directories readable or writable by "others" can be read or replaced by any local user.', 'Grant no permissions to others, for example 0750 or 0640, and a umask of at least 007.'],
  ko: ['느슨한 POSIX 파일 권한을 설정하는 것은 보안에 민감합니다', '"기타 사용자"가 읽거나 쓸 수 있는 파일과 디렉터리는 모든 로컬 사용자가 읽거나 바꿀 수 있습니다.', '기타 사용자에게 권한을 주지 않습니다. 예: 0750, 0640, umask 007 이상.'],
  msg: ['Make sure this permission "{0}" is safe here.', '이 권한 "{0}"가 여기서 안전한지 확인합니다.'],
  on: {
    Call(n, cx) {
      const nm = A.callName(n);
      const oct = (v) => '0' + v.toString(8);
      if (nm === 'chmod' || nm === 'mkdir') {
        const v = H.intConst(H.arg(n, 1));
        if (v != null && (v & 0o7) !== 0) cx.report(n, oct(v));
      } else if (nm === 'umask') {
        const v = H.intConst(H.arg(n, 0));
        if (v != null && (v & 0o7) !== 0o7) cx.report(n, oct(v));
      }
    },
  },
  bad: fn('    chmod($a, 0777); // Noncompliant\n    umask(0); // Noncompliant'),
  good: fn('    chmod($a, 0750);\n    umask(0027);\n    mkdir($b, 0700);'),
});

rule({
  id: 'session-fixation', sonar: 'S5876', type: 'V', sev: 'CR', debt: 10, tags: ['cwe-384'], owasp: ['A07'], checker: 'SESSION_FIXATION',
  en: ['A new session should be created during user authentication', 'Keeping the pre-login session identifier lets an attacker who planted it hijack the authenticated session.', 'Call session_regenerate_id(true) when the user logs in.'],
  ko: ['사용자 인증 중에는 새 세션을 만들어야 합니다', '로그인 전 세션 식별자를 유지하면 그것을 심어 둔 공격자가 인증된 세션을 가로챌 수 있습니다.', '사용자가 로그인할 때 session_regenerate_id(true)를 호출합니다.'],
  msg: ['Regenerate the session identifier in "{0}" after authenticating the user.', '"{0}"에서 사용자를 인증한 뒤 세션 식별자를 새로 만듭니다.'],
  on: {
    FuncDecl: fixation, Method: fixation,
  },
  bad: php('function login($user)\n{ // Noncompliant\n    session_start();\n    $_SESSION[\'user_id\'] = $user->id;\n}').replace('function login($user)\n{ // Noncompliant', 'function login($user) // Noncompliant\n{'),
  good: php('function login($user)\n{\n    session_start();\n    session_regenerate_id(true);\n    $_SESSION[\'user_id\'] = $user->id;\n}'),
});
function fixation(n, cx) {
  if (!n.body || !/(log_?in|sign_?in|authenticate)/i.test(n.name)) return;
  let writesSession = false;
  let regenerates = false;
  A.walk(n.body, (x) => {
    if (x.k === 'Assign' && x.l.k === 'Index') {
      let b = x.l;
      while (b && b.k === 'Index') b = b.obj;
      if (b && b.k === 'Var' && b.name === '_SESSION') writesSession = true;
    }
    if (H.isCall(x, ['session_regenerate_id']) || ((x.k === 'MCall') && typeof x.name === 'string' && /^(regenerate|migrate|invalidate)$/i.test(x.name))) regenerates = true;
  });
  if (writesSession && !regenerates) cx.reportName(n, n.name);
}

rule({
  id: 'csrf-protection-disabled', sonar: 'S4502', type: 'H', sev: 'CR', debt: 10, tags: ['cwe-352'], owasp: ['A01'], checker: 'CSRF',
  en: ['Disabling CSRF protections is security-sensitive', 'Without CSRF tokens a malicious site can make a logged-in user submit unwanted requests.', 'Keep CSRF protection enabled and do not exclude routes from it.'],
  ko: ['CSRF 보호를 끄는 것은 보안에 민감합니다', 'CSRF 토큰이 없으면 악성 사이트가 로그인한 사용자에게 원치 않는 요청을 보내게 할 수 있습니다.', 'CSRF 보호를 켜 두고 경로를 예외로 빼지 않습니다.'],
  msg: ['Make sure disabling CSRF protection is safe here.', '여기서 CSRF 보호를 꺼도 안전한지 확인합니다.'],
  on: {
    Item(n, cx) {
      const k = n.key && A.strVal(n.key);
      if (k && /^csrf_protection$|^csrf$/i.test(k) && H.falsyLit(n.value)) cx.report(n);
    },
    ClassDecl(n, cx) {
      if (!n.ext.some((e) => A.shortName(e.name) === 'VerifyCsrfToken')) return;
      for (const p of H.propsOf(n)) for (const it of p.props) {
        const d = A.unparen(it.def);
        if (it.name === 'except' && d && d.k === 'Arr' && d.items.length) cx.report(it);
      }
    },
  },
  bad: php('$options = [\'csrf_protection\' => false]; // Noncompliant\nclass VerifyToken extends VerifyCsrfToken\n{\n    protected $except = [\'api/*\']; // Noncompliant\n}'),
  good: php('$options = [\'csrf_protection\' => true];\nclass VerifyToken extends VerifyCsrfToken\n{\n    protected $except = [];\n}'),
});

rule({
  id: 'permissive-cors', sonar: 'S5122', type: 'H', sev: 'MI', debt: 5, tags: ['cwe-942', 'cwe-346'], owasp: ['A05'], checker: 'CORS',
  en: ['Having a permissive Cross-Origin Resource Sharing policy is security-sensitive', 'Allowing every origin lets any web site read responses that may contain user data.', 'Allow only the origins that must access the resource.'],
  ko: ['허용적인 CORS 정책은 보안에 민감합니다', '모든 출처를 허용하면 어떤 웹 사이트든 사용자 데이터가 담긴 응답을 읽을 수 있습니다.', '리소스에 접근해야 하는 출처만 허용합니다.'],
  msg: ['Make sure this permissive CORS policy is safe here.', '이 허용적인 CORS 정책이 여기서 안전한지 확인합니다.'],
  on: {
    Call(n, cx) {
      if (!H.isCall(n, 'header')) return;
      const s = H.strConst(H.arg(n, 0));
      if (s && /^\s*access-control-allow-origin\s*:\s*\*\s*$/i.test(s)) cx.report(n);
    },
    MCall(n, cx) {
      if (typeof n.name !== 'string' || !/^(header|set|withHeader|add)$/i.test(n.name)) return;
      const k = A.strVal(H.arg(n, 0));
      if (k && k.toLowerCase() === 'access-control-allow-origin' && A.strVal(H.arg(n, 1)) === '*') cx.report(n);
    },
    Item(n, cx) {
      const k = n.key && A.strVal(n.key);
      const v = A.unparen(n.value);
      if (k === 'allowed_origins' && v && v.k === 'Arr' && v.items.some((it) => it && A.strVal(it.value) === '*')) cx.report(n);
    },
  },
  bad: fn('    header(\'Access-Control-Allow-Origin: *\'); // Noncompliant\n    return $a->header(\'Access-Control-Allow-Origin\', \'*\'); // Noncompliant'),
  good: fn('    header(\'Access-Control-Allow-Origin: https://app.example.com\');\n    return $a->header(\'Access-Control-Allow-Origin\', \'https://app.example.com\');'),
});

rule({
  id: 'weak-salt', sonar: 'S2053', type: 'V', sev: 'CR', debt: 30, tags: ['cwe-759', 'cwe-760'], owasp: ['A02'], checker: 'WEAK_PASSWORD_HASH',
  en: ['Password hashing functions should use an unpredictable salt', 'A missing or constant salt lets attackers use precomputed tables against every password at once.', 'Use password_hash(), which generates a random salt, or random_bytes() for the salt.'],
  ko: ['비밀번호 해시 함수는 예측할 수 없는 솔트를 써야 합니다', '솔트가 없거나 고정이면 공격자가 미리 계산한 표로 모든 비밀번호를 한꺼번에 공격합니다.', '무작위 솔트를 만드는 password_hash()를 쓰거나 솔트에 random_bytes()를 씁니다.'],
  msg: ['Make this salt unpredictable.', '이 솔트를 예측할 수 없게 만듭니다.'],
  on: {
    Call(n, cx) {
      const nm = A.callName(n);
      if (nm === 'crypt') {
        const salt = H.arg(n, 1);
        if (!salt || H.strConst(salt) != null) cx.report(n);
      } else if (nm === 'hash_pbkdf2') {
        const salt = H.arg(n, 2);
        if (salt && H.strConst(salt) != null) cx.report(salt);
      } else if (nm === 'password_hash') {
        const opts = H.arg(n, 2);
        if (opts && H.arrItem(opts, 'salt')) cx.report(H.arrItem(opts, 'salt'));
      }
    },
  },
  bad: fn('    $h = crypt($a); // Noncompliant\n    return hash_pbkdf2(\'sha256\', $b, \'fixed-salt\', 100000); // Noncompliant'),
  good: fn('    $h = password_hash($a, PASSWORD_DEFAULT);\n    return hash_pbkdf2(\'sha256\', $b, random_bytes(16), 100000) . $h;'),
});

rule({
  id: 'weak-key-size', sonar: 'S4426', type: 'V', sev: 'CR', debt: 2, tags: ['cwe-326'], owasp: ['A02'], checker: 'RISKY_CRYPTO',
  en: ['Cryptographic keys should be robust', 'RSA, DSA and DH keys shorter than 2048 bits can be factored with modest resources.', 'Use at least 2048 bits (3072 recommended).'],
  ko: ['암호 키는 견고해야 합니다', '2048비트보다 짧은 RSA, DSA, DH 키는 적은 자원으로 인수분해할 수 있습니다.', '최소 2048비트(권장 3072비트)를 씁니다.'],
  msg: ['Use a key length of at least 2048 bits instead of {0}.', '{0}비트 대신 최소 2048비트 키 길이를 씁니다.'],
  on: {
    Call(n, cx) {
      if (!H.isCall(n, ['openssl_pkey_new', 'openssl_csr_new'])) return;
      const opts = H.arg(n, H.isCall(n, 'openssl_csr_new') ? 2 : 0);
      const it = opts && H.arrItem(opts, 'private_key_bits');
      const bits = it && H.intConst(it.value);
      if (bits != null && bits < 2048) cx.report(it, bits);
    },
  },
  bad: fn('    return openssl_pkey_new([\n        \'private_key_bits\' => 1024, // Noncompliant\n        \'private_key_type\' => OPENSSL_KEYTYPE_RSA,\n    ]);'),
  good: fn('    return openssl_pkey_new([\n        \'private_key_bits\' => 3072,\n        \'private_key_type\' => OPENSSL_KEYTYPE_RSA,\n    ]);'),
});

rule({
  id: 'jwt-unsafe', sonar: 'S5659', type: 'V', sev: 'CR', debt: 30, tags: ['cwe-347'], owasp: ['A02'], checker: 'JWT_NO_VERIFY',
  en: ['JWT should be signed and verified with strong cipher algorithms', 'The "none" algorithm disables the signature, so anyone can forge tokens.', 'Sign and verify tokens with HS256/RS256 or stronger and a secret key.'],
  ko: ['JWT는 강한 알고리즘으로 서명하고 검증해야 합니다', '"none" 알고리즘은 서명을 끄므로 누구나 토큰을 위조할 수 있습니다.', 'HS256/RS256 이상과 비밀 키로 토큰을 서명하고 검증합니다.'],
  msg: ['Use a strong cipher algorithm to sign and verify this token.', '이 토큰의 서명과 검증에 강한 알고리즘을 씁니다.'],
  on: {
    SCall(n, cx) {
      if (!n.cls || n.cls.k !== 'Name' || !/JWT$/i.test(A.shortName(n.cls.name))) return;
      if (n.args.some((a) => noneAlg(a.e))) cx.report(n);
    },
    New(n, cx) {
      if (n.cls && n.cls.k === 'Name' && A.shortName(n.cls.name) === 'Key' && n.args.some((a) => noneAlg(a.e))) cx.report(n);
    },
  },
  bad: fn('    return JWT::encode($a, $b, \'none\'); // Noncompliant'),
  good: fn('    return JWT::encode($a, $b, \'HS256\');'),
});
function noneAlg(e) {
  e = A.unparen(e);
  if (!e) return false;
  if (A.strVal(e) != null) return A.strVal(e).toLowerCase() === 'none';
  if (e.k === 'Arr') return e.items.some((it) => it && noneAlg(it.value));
  return false;
}

rule({
  id: 'unsafe-unserialize', sonar: 'S5135', type: 'V', sev: 'BL', debt: 30, tags: ['cwe-502'], owasp: ['A08'], checker: 'UNSAFE_DESERIALIZATION',
  en: ['Deserialization should not allow arbitrary classes', 'unserialize() on outside data can instantiate any class and trigger magic methods (object injection).', 'Use json_decode(), or pass ["allowed_classes" => false] (or an explicit list).'],
  ko: ['역직렬화가 임의의 클래스를 허용하면 안 됩니다', '외부 데이터에 unserialize()를 쓰면 어떤 클래스든 만들어 매직 메서드가 실행됩니다(객체 주입).', 'json_decode()를 쓰거나 ["allowed_classes" => false](또는 명시적 목록)를 넘깁니다.'],
  msg: ['Restrict the classes that "unserialize" may instantiate.', 'unserialize가 만들 수 있는 클래스를 제한합니다.'],
  on: {
    Call(n, cx) {
      if (!H.isCall(n, 'unserialize')) return;
      const data = A.unparen(H.arg(n, 0));
      if (!data || data.k === 'Lit') return;
      const opts = H.arg(n, 1, 'options');
      const it = opts && H.arrItem(opts, 'allowed_classes');
      if (it && (H.falsyLit(it.value) || A.unparen(it.value).k === 'Arr')) return;
      cx.report(n);
    },
  },
  bad: fn('    return unserialize($_COOKIE[\'prefs\']); // Noncompliant'),
  good: fn('    return unserialize($a, [\'allowed_classes\' => false]);'),
});

rule({
  id: 'dynamic-code-execution', sonar: 'S1523', type: 'H', sev: 'CR', debt: 15, tags: ['cwe-95'], owasp: ['A03'], checker: 'CODE_INJECTION',
  en: ['Dynamically executing code is security-sensitive', 'eval(), create_function(), assert() on strings and the /e modifier run text as PHP code, which leads to code injection.', 'Remove the dynamic execution and use closures or explicit dispatch.'],
  ko: ['코드를 동적으로 실행하는 것은 보안에 민감합니다', 'eval(), create_function(), 문자열 assert(), /e 수정자는 텍스트를 PHP 코드로 실행해 코드 주입으로 이어집니다.', '동적 실행을 지우고 클로저나 명시적 분기를 씁니다.'],
  msg: ['Make sure that this dynamic injection or execution of code ("{0}") is safe.', '이 동적 코드 실행("{0}")이 안전한지 확인합니다.'],
  on: {
    Call(n, cx) {
      const nm = A.callName(n);
      if (nm === 'eval' || nm === 'create_function') { cx.report(n, nm); return; }
      if (nm === 'assert') { const a = A.unparen(H.arg(n, 0)); if (a && (a.k === 'Interp' || (a.k === 'Lit' && a.kind === 'str'))) cx.report(n, nm); return; }
      if (nm === 'preg_replace') { const p = H.strConst(H.arg(n, 0)); if (p && /[a-zA-Z]*e[a-zA-Z]*$/.test(p.slice(p.lastIndexOf(p[0]) + 1)) && p.lastIndexOf(p[0]) > 0) cx.report(n, 'preg_replace /e'); }
    },
  },
  bad: fn('    eval($a); // Noncompliant\n    return create_function(\'$x\', $b); // Noncompliant'),
  good: fn('    $f = function ($x) {\n        return $x * 2;\n    };\n    return $f($a);'),
});

function iniRule(def, check) {
  rule(Object.assign(def, {
    on: { Call(n, cx) { const ini = iniSet(n); if (ini && check(ini)) cx.report(n, ini.name); } },
  }));
}
iniRule({
  id: 'open-basedir', sonar: 'S3333', type: 'H', sev: 'MA', debt: 10, tags: ['cwe-22'], owasp: ['A01'], checker: 'INSECURE_CONFIG',
  en: ['"open_basedir" should limit file access', 'An empty or root open_basedir lets the scripts open any file on the server.', 'Restrict open_basedir to the application directories.'],
  ko: ['open_basedir는 파일 접근을 제한해야 합니다', '비었거나 루트인 open_basedir는 스크립트가 서버의 모든 파일을 열게 합니다.', 'open_basedir를 애플리케이션 디렉터리로 제한합니다.'],
  msg: ['Restrict "{0}" to a narrower path.', '"{0}"를 더 좁은 경로로 제한합니다.'],
  bad: php('ini_set(\'open_basedir\', \'/\'); // Noncompliant'),
  good: php('ini_set(\'open_basedir\', \'/var/www/app:/tmp/app\');'),
}, (ini) => ini.name === 'open_basedir' && ['', '/', '.', '..', '/:/tmp'].includes(String(A.strVal(ini.value)).trim()));

iniRule({
  id: 'allow-url-include', sonar: 'S3334', type: 'H', sev: 'BL', debt: 10, tags: ['cwe-829', 'cwe-98'], owasp: ['A08'], checker: 'INSECURE_CONFIG',
  en: ['"allow_url_fopen" and "allow_url_include" should be disabled', 'Remote file access lets a manipulated path fetch and even include code from another server.', 'Disable both settings and download remote content with an HTTP client.'],
  ko: ['allow_url_fopen과 allow_url_include는 꺼야 합니다', '원격 파일 접근을 허용하면 조작된 경로로 다른 서버의 코드를 가져와 포함할 수 있습니다.', '두 설정을 끄고 원격 내용은 HTTP 클라이언트로 내려받습니다.'],
  msg: ['Disable "{0}".', '"{0}"를 끕니다.'],
  bad: php('ini_set(\'allow_url_include\', \'1\'); // Noncompliant'),
  good: php('ini_set(\'allow_url_include\', \'0\');'),
}, (ini) => (ini.name === 'allow_url_include' || ini.name === 'allow_url_fopen') && H.truthyLit(ini.value));

iniRule({
  id: 'session-use-trans-sid', sonar: 'S3336', type: 'H', sev: 'CR', debt: 10, tags: ['cwe-598'], owasp: ['A04'], checker: 'INSECURE_CONFIG',
  en: ['"session.use_trans_sid" should not be enabled', 'Session identifiers in URLs leak through logs, bookmarks and Referer headers.', 'Disable session.use_trans_sid and rely on cookies.'],
  ko: ['session.use_trans_sid를 켜면 안 됩니다', 'URL의 세션 식별자는 로그, 북마크, Referer 헤더로 새어 나갑니다.', 'session.use_trans_sid를 끄고 쿠키를 씁니다.'],
  msg: ['Disable "{0}".', '"{0}"를 끕니다.'],
  bad: php('ini_set(\'session.use_trans_sid\', 1); // Noncompliant'),
  good: php('ini_set(\'session.use_trans_sid\', 0);'),
}, (ini) => ini.name === 'session.use_trans_sid' && H.truthyLit(ini.value));

iniRule({
  id: 'enable-dl', sonar: 'S3337', type: 'H', sev: 'CR', debt: 10, tags: ['cwe-829'], owasp: ['A05'], checker: 'INSECURE_CONFIG',
  en: ['"enable_dl" should be disabled', 'Loading extensions at run time with dl() lets compromised code load native modules.', 'Disable enable_dl and load extensions through php.ini.'],
  ko: ['enable_dl은 꺼야 합니다', 'dl()로 실행 중에 확장을 불러오면 감염된 코드가 네이티브 모듈을 불러올 수 있습니다.', 'enable_dl을 끄고 확장은 php.ini로 불러옵니다.'],
  msg: ['Disable "{0}".', '"{0}"를 끕니다.'],
  bad: php('ini_set(\'enable_dl\', \'On\'); // Noncompliant'),
  good: php('ini_set(\'enable_dl\', \'Off\');'),
}, (ini) => ini.name === 'enable_dl' && H.truthyLit(ini.value));

// ── processes, files, includes
const CMD_FNS = new Set(['exec', 'system', 'shell_exec', 'passthru', 'proc_open', 'popen', 'pcntl_exec']);
rule({
  id: 'os-command', sonar: 'S4721', type: 'H', sev: 'CR', debt: 15, tags: ['cwe-78', 'cwe-88'], owasp: ['A03'], checker: 'OS_CMD_INJECTION',
  en: ['Using shell interpreter when executing OS commands is security-sensitive', 'Commands built from variables run through the shell and can be injected with extra commands.', 'Avoid the shell, pass an argument array to proc_open(), and escape with escapeshellarg().'],
  ko: ['OS 명령 실행에 셸 인터프리터를 쓰는 것은 보안에 민감합니다', '변수로 만든 명령은 셸을 거치므로 추가 명령이 주입될 수 있습니다.', '셸을 피하고 proc_open()에 인수 배열을 넘기며 escapeshellarg()로 이스케이프합니다.'],
  msg: ['Make sure that executing this OS command with "{0}" is safe here.', '"{0}"로 이 OS 명령을 실행해도 안전한지 확인합니다.'],
  on: {
    Call(n, cx) {
      const nm = A.callName(n);
      if (!CMD_FNS.has(nm)) return;
      const c = A.unparen(H.arg(n, 0));
      if (!c || c.k === 'Lit' || (nm === 'proc_open' && c.k === 'Arr')) return;
      if (A.contains(c, (x) => H.isCall(x, ['escapeshellarg', 'escapeshellcmd']), true) && !A.contains(c, (x) => x.k === 'Var' && !(x.parent && x.parent.k === 'Arg'), true)) return;
      cx.report(n, nm);
    },
    Shell(n, cx) { if (n.parts.some((p) => typeof p !== 'string')) cx.report(n, 'backtick'); },
  },
  bad: fn('    exec(\'ls \' . $a); // Noncompliant\n    return `cat $b`; // Noncompliant'),
  good: fn('    exec(\'ls -la\');\n    return proc_open([\'cat\', $b], [], $pipes);'),
});

rule({
  id: 'dynamic-file-inclusion', sonar: '', type: 'H', sev: 'CR', debt: 15, tags: ['cwe-98', 'cwe-829'], owasp: ['A03'], checker: 'PATH_MANIPULATION',
  en: ['Including files from a variable path is security-sensitive', 'include/require with a path built from variables can load an attacker-chosen file and execute it.', 'Map the input to a fixed list of files, or include constant paths only.'],
  ko: ['변수 경로로 파일을 포함하는 것은 보안에 민감합니다', '변수로 만든 경로의 include/require는 공격자가 고른 파일을 불러와 실행할 수 있습니다.', '입력을 고정된 파일 목록에 대응시키거나 상수 경로만 포함합니다.'],
  msg: ['Make sure the path of this "{0}" cannot be controlled by users.', '이 "{0}"의 경로를 사용자가 조작할 수 없는지 확인합니다.'],
  on: {
    Include(n, cx) {
      if (A.contains(n.e, (x) => x.k === 'Var' || x.k === 'VarVar' || (x.k === 'Call' && !H.isCall(x, ['dirname', 'basename', 'realpath'])) || x.k === 'MCall' || x.k === 'SCall', true)) cx.report(n, n.kind);
    },
  },
  bad: php('include_once \'pages/\' . $_GET[\'page\'] . \'.php\'; // Noncompliant'),
  good: php('include_once __DIR__ . \'/pages/home.php\';\nrequire_once dirname(__FILE__) . \'/lib.php\';'),
});

const SUPER_INPUT = new Set(['_GET', '_POST', '_REQUEST', '_COOKIE', '_FILES', '_SERVER', '_ENV', 'GLOBALS']);
rule({
  id: 'variable-overwrite', sonar: '', type: 'V', sev: 'CR', debt: 10, tags: ['cwe-621', 'cwe-473'], owasp: ['A03'], checker: 'VARIABLE_OVERWRITE',
  en: ['Request data should not be imported into the local symbol table', 'extract() on request data or parse_str() without a result array lets users create or overwrite any variable.', 'Read the values you need explicitly, and pass a result array to parse_str().'],
  ko: ['요청 데이터를 지역 기호 표로 가져오면 안 됩니다', '요청 데이터에 extract()를 쓰거나 결과 배열 없이 parse_str()을 쓰면 사용자가 아무 변수나 만들거나 덮어씁니다.', '필요한 값만 명시적으로 읽고 parse_str()에는 결과 배열을 넘깁니다.'],
  msg: ['Do not let "{0}" create variables from user input.', '"{0}"가 사용자 입력으로 변수를 만들지 않게 합니다.'],
  on: {
    Call(n, cx) {
      if (H.isCall(n, 'extract')) {
        const a = A.unparen(H.arg(n, 0));
        let b = a;
        while (b && b.k === 'Index') b = A.unparen(b.obj);
        if (b && b.k === 'Var' && SUPER_INPUT.has(b.name)) cx.report(n, 'extract');
      } else if (H.isCall(n, ['parse_str', 'mb_parse_str']) && n.args.length === 1) cx.report(n, A.callName(n));
    },
  },
  bad: fn('    extract($_POST); // Noncompliant\n    parse_str($a); // Noncompliant'),
  good: fn('    $name = $_POST[\'name\'] ?? \'\';\n    parse_str($a, $params);\n    return [$name, $params];'),
});

rule({
  id: 'empty-database-password', sonar: 'S2115', type: 'V', sev: 'BL', debt: 45, tags: ['cwe-521'], owasp: ['A07'], checker: 'WEAK_PASSWORD',
  en: ['A secure password should be used when connecting to a database', 'An empty database password lets anyone who reaches the server connect.', 'Protect the database account with a strong password from configuration.'],
  ko: ['데이터베이스에 연결할 때는 안전한 비밀번호를 써야 합니다', '빈 데이터베이스 비밀번호는 서버에 닿는 누구나 연결하게 합니다.', '설정에서 읽은 강한 비밀번호로 데이터베이스 계정을 보호합니다.'],
  msg: ['Add password protection to this database.', '이 데이터베이스에 비밀번호 보호를 추가합니다.'],
  on: {
    New(n, cx) {
      if (!n.cls || n.cls.k !== 'Name') return;
      const c = A.shortName(n.cls.name).toLowerCase();
      const idx = c === 'pdo' ? 2 : c === 'mysqli' ? 2 : -1;
      if (idx < 0) return;
      if (A.strVal(H.arg(n, idx, 'password')) === '') cx.report(n);
    },
    Call(n, cx) {
      if (H.isCall(n, ['mysqli_connect', 'mysqli_real_connect']) && A.strVal(H.arg(n, H.isCall(n, 'mysqli_real_connect') ? 3 : 2)) === '') cx.report(n);
    },
  },
  bad: fn('    return new PDO(\'mysql:host=localhost;dbname=app\', \'root\', \'\'); // Noncompliant'),
  good: fn('    return new PDO(\'mysql:host=localhost;dbname=app\', \'app\', getenv(\'DB_PASSWORD\'));'),
});

rule({
  id: 'signal-process', sonar: 'S4828', type: 'H', sev: 'CR', debt: 10, tags: ['cwe-283'], owasp: ['A01'], checker: 'S4828',
  en: ['Signaling processes is security-sensitive', 'Sending signals to arbitrary process ids can stop or disrupt other programs on the host.', 'Make sure the target pid and signal cannot be controlled by users.'],
  ko: ['프로세스에 신호를 보내는 것은 보안에 민감합니다', '임의의 프로세스 ID에 신호를 보내면 호스트의 다른 프로그램을 멈추거나 방해할 수 있습니다.', '대상 pid와 신호를 사용자가 조작할 수 없는지 확인합니다.'],
  msg: ['Make sure that sending signals is safe here.', '여기서 신호를 보내도 안전한지 확인합니다.'],
  on: { Call(n, cx) { if (H.isCall(n, ['posix_kill', 'proc_terminate'])) cx.report(n); } },
  bad: fn('    posix_kill($a, SIGKILL); // Noncompliant'),
  good: fn('    return getmypid();'),
});

rule({
  id: 'archive-expansion', sonar: 'S5042', type: 'H', sev: 'CR', debt: 15, tags: ['cwe-409', 'cwe-22'], owasp: ['A01'], checker: 'S5042',
  en: ['Expanding archive files without controlling resource consumption is security-sensitive', 'A crafted archive can expand to huge sizes (zip bomb) or write outside the target folder (zip slip).', 'Check entry count, sizes and paths before extracting.'],
  ko: ['자원 사용을 통제하지 않고 압축 파일을 푸는 것은 보안에 민감합니다', '조작된 압축 파일은 엄청난 크기로 풀리거나(zip bomb) 대상 폴더 밖에 쓸 수 있습니다(zip slip).', '풀기 전에 항목 수, 크기, 경로를 검사합니다.'],
  msg: ['Make sure that expanding this archive file is safe here.', '여기서 이 압축 파일을 풀어도 안전한지 확인합니다.'],
  on: { MCall(n, cx) { if (n.name === 'extractTo') cx.report(n); } },
  bad: fn('    $zip = new ZipArchive();\n    $zip->open($a);\n    $zip->extractTo($b); // Noncompliant'),
  good: fn('    $zip = new ZipArchive();\n    $zip->open($a);\n    return $zip->numFiles;'),
});

rule({
  id: 'reflection-accessibility', sonar: 'S3011', type: 'H', sev: 'MA', debt: 10, tags: ['cwe-284'], owasp: ['A01'], checker: 'S3011',
  en: ['Reflection should not be used to increase accessibility of classes, methods, or fields', 'setAccessible(true) bypasses encapsulation and the checks a private member protects.', 'Use the public API of the class instead.'],
  ko: ['리플렉션으로 클래스, 메서드, 필드의 접근성을 높이면 안 됩니다', 'setAccessible(true)는 캡슐화와 private 멤버가 지키는 검사를 우회합니다.', '대신 클래스의 공개 API를 씁니다.'],
  msg: ['Make sure that this accessibility update is safe here.', '이 접근성 변경이 여기서 안전한지 확인합니다.'],
  on: { MCall(n, cx) { if (n.name === 'setAccessible' && H.truthyLit(H.arg(n, 0))) cx.report(n); } },
  bad: fn('    $m = new ReflectionMethod($a, \'secret\');\n    $m->setAccessible(true); // Noncompliant\n    return $m->invoke($a);'),
  good: fn('    return $a->publicMethod();'),
});

rule({
  id: 'publicly-writable-directory', sonar: 'S5443', type: 'H', sev: 'CR', debt: 10, tags: ['cwe-377', 'cwe-379'], owasp: ['A01'], checker: 'INSECURE_TEMP_FILE',
  en: ['Using publicly writable directories is security-sensitive', 'Files in /tmp or similar shared folders can be read, replaced or pre-created by other local users.', 'Use an application-specific directory with restricted permissions, or tmpfile().'],
  ko: ['누구나 쓸 수 있는 디렉터리를 쓰는 것은 보안에 민감합니다', '/tmp 같은 공유 폴더의 파일은 다른 로컬 사용자가 읽거나 바꾸거나 미리 만들 수 있습니다.', '권한을 제한한 애플리케이션 전용 디렉터리나 tmpfile()을 씁니다.'],
  msg: ['Make sure publicly writable directories are used safely here.', '여기서 누구나 쓸 수 있는 디렉터리를 안전하게 쓰는지 확인합니다.'],
  on: {
    Lit(n, cx) { if (n.kind === 'str' && /^(\/tmp|\/var\/tmp|\/usr\/tmp|\/dev\/shm)(\/|$)/.test(n.value)) cx.report(n); },
    Call(n, cx) { if (H.isCall(n, 'sys_get_temp_dir')) cx.report(n); },
  },
  bad: fn('    return file_put_contents(\'/tmp/report.txt\', $a); // Noncompliant'),
  good: fn('    return file_put_contents(__DIR__ . \'/var/report.txt\', $a);'),
});

rule({
  id: 'autoescape-disabled', sonar: 'S5247', type: 'H', sev: 'MA', debt: 10, tags: ['cwe-79', 'cwe-80'], owasp: ['A03'], checker: 'XSS',
  en: ['Disabling auto-escaping in template engines is security-sensitive', 'Without auto-escaping every variable printed by a template must be escaped by hand, and one miss is an XSS.', 'Keep autoescape enabled and mark trusted HTML explicitly.'],
  ko: ['템플릿 엔진의 자동 이스케이프를 끄는 것은 보안에 민감합니다', '자동 이스케이프가 없으면 템플릿이 출력하는 모든 변수를 손으로 이스케이프해야 하고 하나만 빠져도 XSS입니다.', 'autoescape를 켜 두고 신뢰하는 HTML만 명시적으로 표시합니다.'],
  msg: ['Make sure disabling auto-escaping feature is safe here.', '여기서 자동 이스케이프를 꺼도 안전한지 확인합니다.'],
  on: {
    Item(n, cx) { const k = n.key && A.strVal(n.key); if (k === 'autoescape' && H.falsyLit(n.value)) cx.report(n); },
  },
  bad: fn('    return new Environment($a, [\'autoescape\' => false]); // Noncompliant'),
  good: fn('    return new Environment($a, [\'autoescape\' => \'html\']);'),
});

rule({
  id: 'fast-password-hash', sonar: 'S5344', type: 'V', sev: 'CR', debt: 30, tags: ['cwe-916', 'cwe-328'], owasp: ['A02'], checker: 'WEAK_PASSWORD_HASH',
  en: ['Passwords should not be stored with fast hashing algorithms', 'MD5, SHA-1 and plain SHA-2 are fast enough to brute-force stolen password hashes.', 'Use password_hash() with PASSWORD_ARGON2ID or PASSWORD_BCRYPT.'],
  ko: ['비밀번호를 빠른 해시 알고리즘으로 저장하면 안 됩니다', 'MD5, SHA-1, 단순 SHA-2는 빨라서 탈취된 비밀번호 해시를 무차별 대입할 수 있습니다.', 'PASSWORD_ARGON2ID나 PASSWORD_BCRYPT로 password_hash()를 씁니다.'],
  msg: ['Use password_hash() instead of "{0}" to hash this password.', '이 비밀번호를 해시할 때 "{0}" 대신 password_hash()를 씁니다.'],
  on: {
    Call(n, cx) {
      const nm = A.callName(n);
      let data = null;
      if (nm === 'md5' || nm === 'sha1') data = H.arg(n, 0);
      else if (nm === 'hash') data = H.arg(n, 1);
      if (!data) return;
      if (A.contains(data, (x) => (x.k === 'Var' && /pass(word|wd)?|pwd/i.test(x.name)) || (x.k === 'Index' && /pass(word|wd)?|pwd/i.test(String(A.strVal(x.idx)))) || (x.k === 'Prop' && /pass(word|wd)?|pwd/i.test(String(x.name))), true)) cx.report(n, nm);
    },
  },
  bad: fn('    $password = $a;\n    return md5($password); // Noncompliant'),
  good: fn('    $password = $a;\n    return password_hash($password, PASSWORD_DEFAULT);'),
});
