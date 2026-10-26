'use strict';

// Security hotspots and vulnerabilities found from the code shape alone
// (SonarJava / sonar-kotlin scope). Data-flow injection rules (SQL, XSS, path,
// command injection ...) live in core/taint and are not repeated here.

const { rule, jm, jc, km, kc } = require('./core');
const A = require('../ast');

const JK = ['java', 'kt'];
const OWASP_CRYPTO = ['A02'];
const OWASP_CONFIG = ['A05'];
const OWASP_AUTH = ['A07'];

// ── helpers ──
function str(cx, e) {
  const v = cx.constValue(e);
  return typeof v === 'string' ? v : undefined;
}

function num(cx, e) {
  const v = cx.constValue(e);
  return typeof v === 'number' ? v : undefined;
}

function varName(e) {
  const k = A.varKey(e);
  return k ? k.replace(/^this\./, '') : null;
}

// Name of the variable a freshly created value is stored in (x = <node>,
// T x = <node>, val x = <node>), or null.
function assignedVar(cx, node) {
  for (let i = 1; i < 4; i++) {
    const p = cx.parent(i);
    if (!p) return null;
    if (p.k === 'Paren' || p.k === 'Cast') continue;
    if (p.k === 'Var' && p.init && A.strip(p.init) === node) return p.name;
    if (p.k === 'Var') return null;
    if (p.k === 'Assign' && p.op === '=') return varName(p.t);
    return null;
  }
  return null;
}

// Code region in which later configuration of a value is searched: the
// enclosing method body, else the enclosing class.
function scopeOf(cx) {
  const m = cx.method;
  if (m && m.body) return m.body;
  return cx.cls || cx.unit;
}

function callsOn(scope, name, ids) {
  return A.findAll(scope, (x) => x.k === 'Call' && ids.includes(x.id) && !!x.o && varName(x.o) === name);
}

function propSets(scope, name, props) {
  return A.findAll(scope, (x) => {
    if (x.k !== 'Assign') return false;
    const t = A.strip(x.t);
    return !!t && t.k === 'Sel' && props.includes(t.id) && varName(t.o) === name;
  });
}

// Is the value configured with `true` (setter call or Kotlin property)?
function configured(scope, name, setters, props, want) {
  for (const c of callsOn(scope, name, setters)) if (c.args.length && A.isBoolLit(c.args[0], want)) return true;
  for (const a of propSets(scope, name, props)) if (A.isBoolLit(a.v, want)) return true;
  return false;
}

function lambdaAlwaysTrue(l) {
  l = A.strip(l);
  if (!l || l.k !== 'Lambda') return false;
  const b = l.body;
  if (!b) return false;
  if (b.k !== 'Block') return A.isBoolLit(b, true);
  if (b.stmts.length !== 1) return false;
  const s = b.stmts[0];
  if (s.k === 'Return') return A.isBoolLit(s.e, true);
  return s.k === 'ExprStmt' && A.isBoolLit(s.e, true);
}

function methodAlwaysTrue(m) {
  const b = m.body;
  if (!b || b.stmts.length !== 1) return false;
  const s = b.stmts[0];
  return (s.k === 'Return' && A.isBoolLit(s.e, true)) || (s.k === 'ExprStmt' && A.isBoolLit(s.e, true));
}

// Byte arrays whose content is fixed in the code: "x".getBytes(),
// new byte[]{...}, new byte[16], byteArrayOf(...), ByteArray(16), or a local
// initialised that way and never filled by nextBytes().
function constBytes(cx, e, depth = 0) {
  e = A.strip(e);
  if (!e || depth > 2) return false;
  if (e.k === 'Call' && (e.id === 'getBytes' || e.id === 'toByteArray' || e.id === 'encodeToByteArray') && e.o && str(cx, e.o) !== undefined) return true;
  if (e.k === 'New' && e.type && /^byte$/.test(A.typeName(e.type)) && (e.init || (e.dims && e.dims.length))) return true;
  if (e.k === 'ArrInit') return true;
  if (e.k === 'Call' && !e.o && e.id === 'byteArrayOf') return true;
  if (e.k === 'Call' && !e.o && e.id === 'ByteArray' && e.args.length === 1) return true;
  if (e.k === 'Name') {
    const l = cx.env.locals.get(e.id);
    if (!l || !l.init) return false;
    const scope = scopeOf(cx);
    if (A.find(scope, (x) => x.k === 'Call' && x.id === 'nextBytes' && x.args.some((a) => varName(a) === e.id))) return false;
    return constBytes(cx, l.init, depth + 1);
  }
  return false;
}

function localInit(cx, e) {
  const n = varName(e);
  if (!n) return null;
  const l = cx.env.locals.get(n);
  if (l && l.init) return A.strip(l.init);
  const c = cx.cls;
  if (c) {
    for (const m of c.members) if (m.k === 'Field') for (const v of m.vars) if (v.name === n && v.init) return A.strip(v.init);
  }
  return null;
}

// ids of a fluent call chain, outermost last: a.b().c().d() -> ['b','c','d']
function chainIds(call) {
  const ids = [];
  let x = A.strip(call);
  while (x && x.k === 'Call') {
    ids.unshift(x.id);
    x = A.strip(x.o);
  }
  return { ids, root: x ? A.dotted(x) : null };
}

const DIGEST_WEAK = new Set(['MD2', 'MD4', 'MD5', 'SHA', 'SHA1', 'SHA-1', 'SHA-0', 'SHA0']);
const DIGEST_UTILS_WEAK = new Set(['md2', 'md2Hex', 'md5', 'md5Hex', 'sha', 'sha1', 'sha1Hex', 'shaHex', 'getMd2Digest', 'getMd5Digest', 'getSha1Digest', 'getShaDigest']);

// ── cryptography ──
rule({
  id: 'weak-hash-algorithm', langs: JK, type: 'H', sev: 'CR', debt: 30, tags: ['cwe-328', 'cwe-327', 'owasp-a2'], sonar: 'S4790', ktSonar: 'S4790', owasp: OWASP_CRYPTO,
  en: ['Weak hashing algorithms should not be used for security', 'MD2, MD4, MD5 and SHA-1 have practical collision attacks; signatures, integrity checks and password hashes built on them can be forged.', 'Use SHA-256 or stronger; for passwords use bcrypt, scrypt, Argon2 or PBKDF2.'],
  ko: ['보안 용도로 약한 해시 알고리즘을 쓰면 안 됩니다', 'MD2, MD4, MD5, SHA-1은 실용적인 충돌 공격이 있어 이를 쓴 서명·무결성 검사·비밀번호 해시를 위조할 수 있습니다.', 'SHA-256 이상을 쓰고 비밀번호에는 bcrypt, scrypt, Argon2, PBKDF2를 쓰세요.'],
  msg: ['Make sure "{0}" is safe here: it is a weak hashing algorithm.', '"{0}"은(는) 약한 해시 알고리즘입니다. 여기서 안전한지 확인하세요.'],
  on: {
    Call(n, cx) {
      if (n.id === 'getInstance' && A.isCall(n, 'getInstance', 'MessageDigest') && n.args.length) {
        const alg = str(cx, n.args[0]);
        if (alg && DIGEST_WEAK.has(alg.toUpperCase())) cx.report(n, [alg]);
        return;
      }
      if (DIGEST_UTILS_WEAK.has(n.id) && A.isCall(n, n.id, 'DigestUtils')) { cx.report(n, [n.id.replace(/Hex$|Digest$|^get/g, '').toUpperCase()]); return; }
      if ((n.id === 'md5' || n.id === 'sha1') && A.isCall(n, n.id, 'Hashing') && n.args.length === 0) cx.report(n, [n.id.toUpperCase()]);
    },
  },
  bad: {
    java: jm(`    java.security.MessageDigest md = java.security.MessageDigest.getInstance("MD5"); // Noncompliant
    String h = org.apache.commons.codec.digest.DigestUtils.sha1Hex(s); // Noncompliant`),
    kt: km(`    val md = MessageDigest.getInstance("SHA-1") // Noncompliant
    val h = DigestUtils.md5Hex(s) // Noncompliant`),
  },
  good: {
    java: jm(`    java.security.MessageDigest md = java.security.MessageDigest.getInstance("SHA-256");
    String h = org.apache.commons.codec.digest.DigestUtils.sha256Hex(s);`),
    kt: km(`    val md = MessageDigest.getInstance("SHA-512")
    val h = DigestUtils.sha256Hex(s)`),
  },
});

const WEAK_CIPHER = /^(DES|DESEDE|3DES|TRIPLEDES|RC2|RC4|ARCFOUR|BLOWFISH)(\/|$)/i;

rule({
  id: 'weak-cipher-algorithm', langs: JK, type: 'V', sev: 'CR', debt: 30, tags: ['cwe-327', 'owasp-a2'], sonar: 'S5547', ktSonar: 'S5547', owasp: OWASP_CRYPTO,
  en: ['Cipher algorithms should be robust', 'DES, 3DES, RC2, RC4 and Blowfish have small keys or blocks and known attacks; data encrypted with them can be recovered.', 'Use AES (128 bits or more) in GCM mode, or ChaCha20-Poly1305.'],
  ko: ['암호 알고리즘은 견고해야 합니다', 'DES, 3DES, RC2, RC4, Blowfish는 키나 블록이 작고 알려진 공격이 있어 암호화한 데이터를 복구할 수 있습니다.', 'GCM 모드의 AES(128비트 이상)나 ChaCha20-Poly1305를 쓰세요.'],
  msg: ['Use a strong cipher algorithm instead of "{0}".', '"{0}" 대신 강한 암호 알고리즘을 쓰세요.'],
  on: {
    Call(n, cx) {
      if (n.id === 'getInstance' && A.isCall(n, 'getInstance', ['Cipher', 'KeyGenerator', 'SecretKeyFactory']) && n.args.length) {
        const alg = str(cx, n.args[0]);
        if (alg && WEAK_CIPHER.test(alg)) cx.report(n, [alg.split('/')[0]]);
      }
    },
    New(n, cx) { if (A.ctorType(n) === 'NullCipher') cx.report(n, ['NullCipher']); },
  },
  bad: {
    java: jm(`    javax.crypto.Cipher c = javax.crypto.Cipher.getInstance("DESede/CBC/PKCS5Padding"); // Noncompliant
    javax.crypto.Cipher none = new javax.crypto.NullCipher(); // Noncompliant`),
    kt: km(`    val c = Cipher.getInstance("RC4") // Noncompliant`),
  },
  good: {
    java: jm(`    javax.crypto.Cipher c = javax.crypto.Cipher.getInstance("AES/GCM/NoPadding");`),
    kt: km(`    val c = Cipher.getInstance("ChaCha20-Poly1305")`),
  },
});

function weakMode(alg) {
  const parts = alg.toUpperCase().split('/');
  const a = parts[0];
  if (a === 'RSA') return parts.length < 3 || !/OAEP/.test(parts[2]) ? 'RSA without OAEP padding' : null;
  if (parts.length === 1) return /^(AES|DES|DESEDE|BLOWFISH|RC2)$/.test(a) ? 'ECB (default mode)' : null;
  if (parts[1] === 'ECB') return 'ECB';
  if (parts[1] === 'CBC' && parts[2] && /PKCS[57]PADDING/.test(parts[2])) return 'CBC with PKCS#5 padding';
  return null;
}

rule({
  id: 'weak-cipher-mode', langs: JK, type: 'V', sev: 'CR', debt: 20, tags: ['cwe-327', 'owasp-a2'], sonar: 'S5542', ktSonar: 'S5542', owasp: OWASP_CRYPTO,
  en: ['Encryption algorithms should be used with secure mode and padding scheme', 'ECB leaks patterns of the plaintext, CBC with PKCS#5 padding allows padding-oracle attacks and RSA without OAEP is malleable.', 'Use AES/GCM/NoPadding for symmetric encryption and RSA/ECB/OAEPWithSHA-256AndMGF1Padding for RSA.'],
  ko: ['암호화 알고리즘은 안전한 모드와 패딩으로 써야 합니다', 'ECB는 평문의 패턴이 드러나고, PKCS#5 패딩의 CBC는 패딩 오라클 공격이 가능하며, OAEP 없는 RSA는 변조가 가능합니다.', '대칭 암호에는 AES/GCM/NoPadding, RSA에는 RSA/ECB/OAEPWithSHA-256AndMGF1Padding을 쓰세요.'],
  msg: ['Use a secure mode and padding scheme; "{0}" uses {1}.', '안전한 모드와 패딩을 쓰세요. "{0}"은(는) {1}을(를) 씁니다.'],
  on: {
    Call(n, cx) {
      if (n.id !== 'getInstance' || !A.isCall(n, 'getInstance', 'Cipher') || !n.args.length) return;
      const alg = str(cx, n.args[0]);
      if (!alg) return;
      const w = weakMode(alg);
      if (w) cx.report(n, [alg, w]);
    },
  },
  bad: {
    java: jm(`    javax.crypto.Cipher a = javax.crypto.Cipher.getInstance("AES"); // Noncompliant
    javax.crypto.Cipher b = javax.crypto.Cipher.getInstance("AES/CBC/PKCS5Padding"); // Noncompliant
    javax.crypto.Cipher r = javax.crypto.Cipher.getInstance("RSA/NONE/NoPadding"); // Noncompliant`),
    kt: km(`    val a = Cipher.getInstance("AES/ECB/NoPadding") // Noncompliant`),
  },
  good: {
    java: jm(`    javax.crypto.Cipher a = javax.crypto.Cipher.getInstance("AES/GCM/NoPadding");
    javax.crypto.Cipher r = javax.crypto.Cipher.getInstance("RSA/ECB/OAEPWithSHA-256AndMGF1Padding");`),
    kt: km(`    val a = Cipher.getInstance("AES/GCM/NoPadding")`),
  },
});

const WEAK_TLS = new Set(['SSL', 'SSLV2', 'SSLV3', 'TLSV1', 'TLSV1.0', 'TLSV1.1', 'DTLSV1.0', 'SSLV2HELLO']);
const WEAK_TLS_ENUM = new Set(['TLS_1_0', 'TLS_1_1', 'SSL_3_0']);

rule({
  id: 'weak-ssl-protocol', langs: JK, type: 'V', sev: 'CR', debt: 5, tags: ['cwe-327', 'owasp-a2'], sonar: 'S4423', ktSonar: 'S4423', owasp: OWASP_CRYPTO,
  en: ['Weak SSL/TLS protocols should not be used', 'SSLv2, SSLv3, TLS 1.0 and TLS 1.1 have known weaknesses (POODLE, BEAST) and are deprecated.', 'Request TLSv1.2 or TLSv1.3.'],
  ko: ['약한 SSL/TLS 프로토콜을 쓰면 안 됩니다', 'SSLv2, SSLv3, TLS 1.0, TLS 1.1은 알려진 취약점(POODLE, BEAST)이 있고 폐기되었습니다.', 'TLSv1.2나 TLSv1.3을 쓰세요.'],
  msg: ['Change this code to use a stronger protocol than "{0}".', '"{0}"보다 강한 프로토콜을 쓰도록 바꾸세요.'],
  on: {
    Call(n, cx) {
      if (n.id === 'getInstance' && A.isCall(n, 'getInstance', 'SSLContext') && n.args.length) {
        const p = str(cx, n.args[0]);
        if (p && WEAK_TLS.has(p.toUpperCase())) cx.report(n, [p]);
        return;
      }
      if (n.id === 'setEnabledProtocols' || n.id === 'tlsVersions') {
        for (const l of A.findAll(n, (x) => x.k === 'Lit' && x.t === 'str')) if (WEAK_TLS.has(String(l.v).toUpperCase())) { cx.report(n, [l.v]); return; }
      }
    },
    Sel(n, cx) {
      if (WEAK_TLS_ENUM.has(n.id) && A.simpleName(A.dotted(n.o) || '') === 'TlsVersion') cx.report(n, [n.id]);
    },
  },
  bad: {
    java: jm(`    javax.net.ssl.SSLContext ctx = javax.net.ssl.SSLContext.getInstance("TLSv1.1"); // Noncompliant
    okhttp3.ConnectionSpec spec = new okhttp3.ConnectionSpec.Builder(okhttp3.ConnectionSpec.MODERN_TLS)
        .tlsVersions(okhttp3.TlsVersion.TLS_1_0) // Noncompliant
        .build();`),
    kt: km(`    val ctx = SSLContext.getInstance("SSLv3") // Noncompliant`),
  },
  good: {
    java: jm(`    javax.net.ssl.SSLContext ctx = javax.net.ssl.SSLContext.getInstance("TLSv1.3");
    okhttp3.ConnectionSpec spec = new okhttp3.ConnectionSpec.Builder(okhttp3.ConnectionSpec.MODERN_TLS)
        .tlsVersions(okhttp3.TlsVersion.TLS_1_2)
        .build();`),
    kt: km(`    val ctx = SSLContext.getInstance("TLSv1.2")`),
  },
});

rule({
  id: 'trust-all-certificates', langs: JK, type: 'V', sev: 'CR', debt: 5, tags: ['cwe-295', 'owasp-a7'], sonar: 'S4830', ktSonar: 'S4830', owasp: OWASP_AUTH,
  en: ['Server certificates should be verified during SSL/TLS connections', 'A trust manager whose check methods accept everything lets any man-in-the-middle impersonate the server.', 'Use the default trust manager or validate the chain and throw CertificateException on failure.'],
  ko: ['SSL/TLS 연결에서 서버 인증서를 검증해야 합니다', '검사 메서드가 모든 것을 받아들이는 TrustManager는 중간자가 서버를 사칭하도록 허용합니다.', '기본 TrustManager를 쓰거나 체인을 검증하고 실패 시 CertificateException을 던지세요.'],
  msg: ['Enable server certificate validation: "{0}" accepts every certificate.', '서버 인증서 검증을 켜세요. "{0}"은(는) 모든 인증서를 받아들입니다.'],
  on: {
    Method(n, cx) {
      if ((n.name !== 'checkServerTrusted' && n.name !== 'checkClientTrusted') || n.params.length < 2 || !n.body) return;
      if (A.find(n.body, (x) => x.k === 'Throw' || x.k === 'Call')) return;
      cx.report({ line: n.nameLine || n.line, col: n.nameCol || n.col }, [n.name]);
    },
  },
  bad: {
    java: jc(`  javax.net.ssl.X509TrustManager tm = new javax.net.ssl.X509TrustManager() {
    @Override public void checkClientTrusted(java.security.cert.X509Certificate[] c, String a) { } // Noncompliant
    @Override public void checkServerTrusted(java.security.cert.X509Certificate[] c, String a) { } // Noncompliant
    @Override public java.security.cert.X509Certificate[] getAcceptedIssuers() { return null; }
  };`),
    kt: kc(`  val tm = object : X509TrustManager {
    override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String) {
      throw CertificateException("client auth not supported")
    }
    override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) {} // Noncompliant
    override fun getAcceptedIssuers(): Array<X509Certificate> = arrayOf()
  }`),
  },
  good: {
    java: jc(`  javax.net.ssl.X509TrustManager delegate;
  javax.net.ssl.X509TrustManager tm = new javax.net.ssl.X509TrustManager() {
    @Override public void checkClientTrusted(java.security.cert.X509Certificate[] c, String a) throws java.security.cert.CertificateException { delegate.checkClientTrusted(c, a); }
    @Override public void checkServerTrusted(java.security.cert.X509Certificate[] c, String a) throws java.security.cert.CertificateException { delegate.checkServerTrusted(c, a); }
    @Override public java.security.cert.X509Certificate[] getAcceptedIssuers() { return delegate.getAcceptedIssuers(); }
  };`),
    kt: kc(`  val tm = object : X509TrustManager {
    override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String) {
      throw CertificateException("client auth not supported")
    }
    override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) {
      if (chain.isEmpty()) throw CertificateException("empty chain")
    }
    override fun getAcceptedIssuers(): Array<X509Certificate> = arrayOf()
  }`),
  },
});

const HV_SETTERS = ['setHostnameVerifier', 'setDefaultHostnameVerifier', 'hostnameVerifier', 'setSSLHostnameVerifier'];

rule({
  id: 'hostname-verification-disabled', langs: JK, type: 'V', sev: 'CR', debt: 5, tags: ['cwe-297', 'owasp-a7'], sonar: 'S5527', ktSonar: 'S5527', owasp: OWASP_AUTH,
  en: ['Server hostnames should be verified during SSL/TLS connections', 'A hostname verifier that always returns true accepts a valid certificate issued for any other host.', 'Keep the default verifier, or compare the session peer host with the expected name.'],
  ko: ['SSL/TLS 연결에서 서버 호스트 이름을 검증해야 합니다', '항상 true를 돌려주는 HostnameVerifier는 다른 호스트용으로 발급된 유효한 인증서도 받아들입니다.', '기본 검증기를 유지하거나 세션의 상대 호스트를 기대하는 이름과 비교하세요.'],
  on: {
    Method(n, cx) {
      if (n.name !== 'verify' || n.params.length !== 2 || A.typeName(n.params[1].type) !== 'SSLSession') return;
      if (methodAlwaysTrue(n)) cx.report({ line: n.nameLine || n.line, col: n.nameCol || n.col });
    },
    Call(n, cx) {
      if (HV_SETTERS.includes(n.id) && n.args.some(lambdaAlwaysTrue)) cx.report(n);
    },
    New(n, cx) { if (A.ctorType(n) === 'NoopHostnameVerifier' || A.ctorType(n) === 'AllowAllHostnameVerifier') cx.report(n); },
    Sel(n, cx) {
      if (n.id === 'ALLOW_ALL_HOSTNAME_VERIFIER' || (n.id === 'INSTANCE' && A.simpleName(A.dotted(n.o) || '') === 'NoopHostnameVerifier')) cx.report(n);
    },
  },
  bad: {
    java: jm(`    javax.net.ssl.HttpsURLConnection c = (javax.net.ssl.HttpsURLConnection) new java.net.URL(s).openConnection();
    c.setHostnameVerifier((host, session) -> true); // Noncompliant
    Object v = org.apache.http.conn.ssl.NoopHostnameVerifier.INSTANCE; // Noncompliant`),
    kt: km(`    val client = OkHttpClient.Builder()
      .hostnameVerifier { _, _ -> true } // Noncompliant
      .build()`),
  },
  good: {
    java: jm(`    javax.net.ssl.HttpsURLConnection c = (javax.net.ssl.HttpsURLConnection) new java.net.URL(s).openConnection();
    c.setHostnameVerifier((host, session) -> "api.example.com".equals(host));`),
    kt: km(`    val client = OkHttpClient.Builder()
      .hostnameVerifier { host, _ -> host == "api.example.com" }
      .build()`),
  },
});

rule({
  id: 'insecure-random', langs: JK, type: 'H', sev: 'CR', debt: 10, tags: ['cwe-338', 'cwe-330', 'owasp-a2'], sonar: 'S2245', ktSonar: 'S2245', owasp: OWASP_CRYPTO,
  en: ['Using pseudorandom number generators (PRNGs) is security-sensitive', 'java.util.Random, Math.random() and kotlin.random.Random are predictable; tokens, keys or session ids derived from them can be guessed.', 'Use java.security.SecureRandom for anything security related.'],
  ko: ['의사 난수 생성기(PRNG) 사용은 보안에 민감합니다', 'java.util.Random, Math.random(), kotlin.random.Random은 예측 가능해서 이를 쓴 토큰·키·세션 ID를 추측할 수 있습니다.', '보안과 관련된 곳에는 java.security.SecureRandom을 쓰세요.'],
  msg: ['Make sure that using "{0}" is safe here.', '여기서 "{0}"을(를) 써도 안전한지 확인하세요.'],
  on: {
    New(n, cx) { if (A.ctorType(n) === 'Random') cx.report(n, ['Random']); },
    Call(n, cx) {
      const t = A.ctorType(n);
      if (t === 'Random' && cx.kt) { cx.report(n, ['Random']); return; }
      if (A.isCall(n, 'random', 'Math')) { cx.report(n, ['Math.random']); return; }
      if (A.isCall(n, 'current', 'ThreadLocalRandom')) { cx.report(n, ['ThreadLocalRandom']); return; }
      if (cx.kt && n.o && A.dotted(n.o) === 'Random' && /^next/.test(n.id)) { cx.report(n, ['Random.' + n.id]); return; }
      if (n.o && /^(RandomStringUtils|RandomUtils)$/.test(A.simpleName(A.dotted(n.o) || '')) && /^(random|next)/.test(n.id)) cx.report(n, [A.simpleName(A.dotted(n.o)) + '.' + n.id]);
    },
  },
  bad: {
    java: jm(`    java.util.Random r = new java.util.Random(); // Noncompliant
    double d = Math.random(); // Noncompliant
    String token = org.apache.commons.lang3.RandomStringUtils.randomAlphanumeric(20); // Noncompliant`),
    kt: km(`    val r = Random(42) // Noncompliant
    val pin = Random.nextInt(10000) // Noncompliant`),
  },
  good: {
    java: jm(`    java.security.SecureRandom r = new java.security.SecureRandom();
    int d = r.nextInt();`),
    kt: km(`    val r = SecureRandom()
    val pin = r.nextInt(10000)`),
  },
});

const KEY_MIN = { RSA: 2048, DSA: 2048, DH: 2048, DIFFIEHELLMAN: 2048, EC: 224, AES: 128 };
const WEAK_CURVES = /^(secp112r1|secp112r2|secp128r1|secp128r2|secp160k1|secp160r1|secp160r2|secp192k1|secp192r1|prime192v1|prime192v2|prime192v3|sect113r1|sect113r2|sect131r1|sect131r2|sect163k1|sect163r1|sect163r2|sect193r1|sect193r2|c2tnb191v1|c2pnb163v1|brainpoolP160r1|brainpoolP192r1)$/;

function keySpec(n, cx) {
  const t = A.ctorType(n);
  const args = A.ctorArgs(n);
  if (t === 'RSAKeyGenParameterSpec' && args.length) {
    const size = num(cx, args[0]);
    if (size !== undefined && size < 2048) cx.report(n, [2048, 'RSA']);
  } else if (t === 'ECGenParameterSpec' && args.length) {
    const c = str(cx, args[0]);
    if (c && WEAK_CURVES.test(c)) cx.report(n, [224, 'EC (' + c + ')']);
  }
}

rule({
  id: 'weak-key-size', langs: JK, type: 'V', sev: 'CR', debt: 2, tags: ['cwe-326', 'owasp-a2'], sonar: 'S4426', ktSonar: 'S4426', owasp: OWASP_CRYPTO,
  en: ['Cryptographic keys should be robust', 'RSA, DSA and DH keys below 2048 bits, EC keys below 224 bits and weak named curves can be broken with available computing power.', 'Use at least 2048-bit RSA/DSA/DH keys, 224-bit EC keys, and curves like secp256r1.'],
  ko: ['암호 키는 충분히 강해야 합니다', '2048비트 미만의 RSA·DSA·DH 키, 224비트 미만의 EC 키, 약한 곡선은 현재의 계산 능력으로 깨질 수 있습니다.', 'RSA/DSA/DH는 2048비트 이상, EC는 224비트 이상, secp256r1 같은 곡선을 쓰세요.'],
  msg: ['Use a key length of at least {0} bits for {1}.', '{1}에는 {0}비트 이상의 키 길이를 쓰세요.'],
  on: {
    Call(n, cx) {
      if ((n.id === 'initialize' || n.id === 'init') && n.o && n.args.length) {
        const size = num(cx, n.args[0]);
        if (size === undefined) return;
        const init = localInit(cx, n.o);
        if (!init || init.k !== 'Call' || init.id !== 'getInstance' || !init.args.length) return;
        if (!A.isCall(init, 'getInstance', n.id === 'initialize' ? 'KeyPairGenerator' : 'KeyGenerator')) return;
        const alg = (str(cx, init.args[0]) || '').toUpperCase();
        const min = KEY_MIN[alg];
        if (min && size < min) cx.report(n, [min, alg]);
        return;
      }
      if (cx.kt && A.ctorType(n)) keySpec(n, cx);
    },
    New(n, cx) { keySpec(n, cx); },
  },
  bad: {
    java: jm(`    java.security.KeyPairGenerator kpg = java.security.KeyPairGenerator.getInstance("RSA");
    kpg.initialize(1024); // Noncompliant
    java.security.spec.ECGenParameterSpec spec = new java.security.spec.ECGenParameterSpec("secp112r1"); // Noncompliant`),
    kt: km(`    val kpg = KeyPairGenerator.getInstance("DSA")
    kpg.initialize(1024) // Noncompliant
    val spec = RSAKeyGenParameterSpec(512, RSAKeyGenParameterSpec.F4) // Noncompliant`),
  },
  good: {
    java: jm(`    java.security.KeyPairGenerator kpg = java.security.KeyPairGenerator.getInstance("RSA");
    kpg.initialize(3072);
    java.security.spec.ECGenParameterSpec spec = new java.security.spec.ECGenParameterSpec("secp256r1");`),
    kt: km(`    val kpg = KeyPairGenerator.getInstance("EC")
    kpg.initialize(256)
    val spec = RSAKeyGenParameterSpec(4096, RSAKeyGenParameterSpec.F4)`),
  },
});

function onCtor(names, fn) {
  return {
    New(n, cx) { const t = A.ctorType(n); if (t && names.includes(t)) fn(n, cx, t); },
    Call(n, cx) { if (!cx.kt) return; const t = A.ctorType(n); if (t && names.includes(t)) fn(n, cx, t); },
  };
}

rule({
  id: 'predictable-salt', langs: JK, type: 'V', sev: 'CR', debt: 30, tags: ['cwe-759', 'cwe-760', 'owasp-a2'], sonar: 'S2053', ktSonar: 'S2053', owasp: OWASP_CRYPTO,
  en: ['Password hashing functions should use an unpredictable salt', 'Without a salt, or with a salt fixed in the code, identical passwords hash identically and precomputed tables crack them.', 'Generate a random salt of at least 16 bytes with SecureRandom for every password and store it with the hash.'],
  ko: ['비밀번호 해시 함수는 예측할 수 없는 솔트를 써야 합니다', '솔트가 없거나 코드에 고정되어 있으면 같은 비밀번호가 같은 해시가 되어 미리 계산한 표로 깨집니다.', '비밀번호마다 SecureRandom으로 16바이트 이상의 무작위 솔트를 만들어 해시와 함께 저장하세요.'],
  msg: ['Use an unpredictable salt for "{0}".', '"{0}"에 예측할 수 없는 솔트를 쓰세요.'],
  on: onCtor(['PBEKeySpec', 'PBEParameterSpec'], (n, cx, t) => {
    const args = A.ctorArgs(n);
    if (t === 'PBEKeySpec') {
      if (args.length === 1 || (args.length >= 2 && constBytes(cx, args[1]))) cx.report(n, [t]);
    } else if (args.length >= 1 && constBytes(cx, args[0])) cx.report(n, [t]);
  }),
  bad: {
    java: jm(`    char[] pw = s.toCharArray();
    javax.crypto.spec.PBEKeySpec a = new javax.crypto.spec.PBEKeySpec(pw); // Noncompliant
    byte[] salt = "pepper".getBytes();
    javax.crypto.spec.PBEKeySpec b = new javax.crypto.spec.PBEKeySpec(pw, salt, 10000, 256); // Noncompliant`),
    kt: km(`    val spec = PBEKeySpec(s.toCharArray(), "fixed".toByteArray(), 10000, 256) // Noncompliant`),
  },
  good: {
    java: jm(`    char[] pw = s.toCharArray();
    byte[] salt = new byte[16];
    new java.security.SecureRandom().nextBytes(salt);
    javax.crypto.spec.PBEKeySpec b = new javax.crypto.spec.PBEKeySpec(pw, salt, 10000, 256);`),
    kt: km(`    val salt = ByteArray(16)
    SecureRandom().nextBytes(salt)
    val spec = PBEKeySpec(s.toCharArray(), salt, 10000, 256)`),
  },
});

rule({
  id: 'predictable-iv', langs: JK, type: 'V', sev: 'CR', debt: 15, tags: ['cwe-329', 'owasp-a2'], sonar: 'S3329', ktSonar: 'S3329', owasp: OWASP_CRYPTO,
  en: ['Cipher initialization vectors should be unpredictable', 'A constant or all-zero IV makes equal plaintexts encrypt to equal ciphertexts, and in GCM mode reusing an IV breaks authentication.', 'Generate a new IV with SecureRandom for each encryption and send it along with the ciphertext.'],
  ko: ['암호 초기화 벡터(IV)는 예측할 수 없어야 합니다', '고정되거나 0으로 채운 IV는 같은 평문을 같은 암호문으로 만들고, GCM에서 IV를 재사용하면 인증이 깨집니다.', '암호화할 때마다 SecureRandom으로 새 IV를 만들고 암호문과 함께 보내세요.'],
  msg: ['Use a random initialization vector for "{0}".', '"{0}"에 무작위 초기화 벡터를 쓰세요.'],
  on: onCtor(['IvParameterSpec', 'GCMParameterSpec'], (n, cx, t) => {
    const args = A.ctorArgs(n);
    const iv = t === 'IvParameterSpec' ? args[0] : args[1];
    if (iv && constBytes(cx, iv)) cx.report(n, [t]);
  }),
  bad: {
    java: jm(`    javax.crypto.spec.IvParameterSpec iv = new javax.crypto.spec.IvParameterSpec("0123456789abcdef".getBytes()); // Noncompliant
    byte[] zero = new byte[12];
    javax.crypto.spec.GCMParameterSpec g = new javax.crypto.spec.GCMParameterSpec(128, zero); // Noncompliant`),
    kt: km(`    val iv = IvParameterSpec(ByteArray(16)) // Noncompliant`),
  },
  good: {
    java: jm(`    byte[] nonce = new byte[12];
    new java.security.SecureRandom().nextBytes(nonce);
    javax.crypto.spec.GCMParameterSpec g = new javax.crypto.spec.GCMParameterSpec(128, nonce);`),
    kt: km(`    val bytes = ByteArray(16)
    SecureRandom().nextBytes(bytes)
    val iv = IvParameterSpec(bytes)`),
  },
});

rule({
  id: 'secure-random-seed', langs: JK, type: 'V', sev: 'CR', debt: 2, tags: ['cwe-330', 'cwe-332', 'owasp-a2'], sonar: 'S4347', ktSonar: 'S4347', owasp: OWASP_CRYPTO,
  en: ['"SecureRandom" seeds should not be predictable', 'Seeding SecureRandom with a constant or the current time makes its whole output sequence reproducible.', 'Let SecureRandom seed itself; do not call setSeed() with fixed or time-based values.'],
  ko: ['SecureRandom 시드는 예측할 수 없어야 합니다', 'SecureRandom에 상수나 현재 시각을 시드로 주면 전체 출력 순서를 재현할 수 있습니다.', 'SecureRandom이 스스로 시드를 정하게 하고 고정값이나 시각으로 setSeed()를 호출하지 마세요.'],
  on: {
    New(n, cx) { if (A.ctorType(n) === 'SecureRandom' && n.args.length && constBytes(cx, n.args[0])) cx.report(n); },
    Call(n, cx) {
      if (cx.kt && A.ctorType(n) === 'SecureRandom' && n.args.length && constBytes(cx, n.args[0])) { cx.report(n); return; }
      if (n.id !== 'setSeed' || !n.o || n.args.length !== 1) return;
      const t = cx.typeOf(n.o);
      const init = localInit(cx, n.o);
      if (t !== 'SecureRandom' && !(init && A.ctorType(init) === 'SecureRandom')) return;
      const a = A.strip(n.args[0]);
      if (num(cx, a) !== undefined || constBytes(cx, a) || A.isCall(a, ['currentTimeMillis', 'nanoTime'], 'System')) cx.report(n);
    },
  },
  bad: {
    java: jm(`    java.security.SecureRandom r = new java.security.SecureRandom();
    r.setSeed(123456789L); // Noncompliant
    java.security.SecureRandom t = new java.security.SecureRandom("seed".getBytes()); // Noncompliant`),
    kt: km(`    val r = SecureRandom()
    r.setSeed(System.currentTimeMillis()) // Noncompliant`),
  },
  good: {
    java: jm(`    java.security.SecureRandom r = new java.security.SecureRandom();
    byte[] b = new byte[16];
    r.nextBytes(b);`),
    kt: km(`    val r = SecureRandom()
    val x = r.nextInt()`),
  },
});

const CRYPTO_SPI = ['MessageDigest', 'MessageDigestSpi', 'CipherSpi', 'SignatureSpi', 'KeyGeneratorSpi', 'KeyPairGeneratorSpi', 'SecureRandomSpi', 'MacSpi', 'KeyAgreementSpi', 'Signature'];

rule({
  id: 'custom-cryptography', langs: JK, type: 'V', sev: 'CR', debt: 60, tags: ['cwe-327', 'owasp-a2'], sonar: 'S2257', ktSonar: 'S2257', owasp: OWASP_CRYPTO,
  en: ['Only standard cryptographic algorithms should be used', 'Home-made digest, cipher or signature implementations have not been reviewed by cryptographers and are almost always weaker than they look.', 'Use the algorithms of the JDK or a reviewed provider such as Bouncy Castle.'],
  ko: ['표준 암호 알고리즘만 써야 합니다', '직접 만든 다이제스트·암호·서명 구현은 암호학자의 검토를 거치지 않아 거의 항상 생각보다 약합니다.', 'JDK나 Bouncy Castle 같은 검증된 공급자의 알고리즘을 쓰세요.'],
  msg: ['Make sure "{0}" is a standard algorithm and not a custom implementation of "{1}".', '"{0}"이(가) "{1}"의 자체 구현이 아니라 표준 알고리즘인지 확인하세요.'],
  on: {
    Class(n, cx) {
      if (!n.name) return;
      const sup = [n.ext].concat(n.impls || []).concat((n.supers || []).map((s) => s && (s.type || s))).filter(Boolean).map((t) => A.typeName(t));
      const hit = sup.find((s) => CRYPTO_SPI.includes(s));
      if (hit) cx.report({ line: n.nameLine || n.line, col: n.nameCol || n.col }, [n.name, hit]);
    },
  },
  bad: {
    java: `abstract class MyDigest extends java.security.MessageDigest { // Noncompliant
  MyDigest() { super("my"); }
}
`,
    kt: `abstract class MyCipher : CipherSpi() // Noncompliant
`,
  },
  good: {
    java: `class Hasher {
  byte[] hash(byte[] in) throws Exception { return java.security.MessageDigest.getInstance("SHA-256").digest(in); }
}
`,
    kt: `class Hasher {
  fun hash(input: ByteArray): ByteArray = MessageDigest.getInstance("SHA-256").digest(input)
}
`,
  },
});

const WEAK_ENCODERS = ['StandardPasswordEncoder', 'Md5PasswordEncoder', 'ShaPasswordEncoder', 'LdapShaPasswordEncoder', 'Md4PasswordEncoder', 'MessageDigestPasswordEncoder', 'NoOpPasswordEncoder', 'PlaintextPasswordEncoder'];

rule({
  id: 'weak-password-encoder', langs: JK, type: 'V', sev: 'CR', debt: 30, tags: ['cwe-256', 'cwe-916', 'owasp-a2'], sonar: 'S5344', ktSonar: 'S5344', owasp: OWASP_CRYPTO,
  en: ['Passwords should not be stored in plaintext or with a fast hashing algorithm', 'Plain, MD5, SHA-1 or single SHA-256 password encoders are fast to brute force once the database leaks.', 'Use BCryptPasswordEncoder, Argon2PasswordEncoder, SCryptPasswordEncoder or Pbkdf2PasswordEncoder.'],
  ko: ['비밀번호를 평문이나 빠른 해시로 저장하면 안 됩니다', '평문, MD5, SHA-1, 단일 SHA-256 인코더는 데이터베이스가 유출되면 빠르게 무차별 대입됩니다.', 'BCryptPasswordEncoder, Argon2PasswordEncoder, SCryptPasswordEncoder, Pbkdf2PasswordEncoder를 쓰세요.'],
  msg: ['Use a secure password encoder instead of "{0}".', '"{0}" 대신 안전한 비밀번호 인코더를 쓰세요.'],
  on: {
    New(n, cx) { const t = A.ctorType(n); if (WEAK_ENCODERS.includes(t)) cx.report(n, [t]); },
    Call(n, cx) {
      if (n.id === 'getInstance' && A.isCall(n, 'getInstance', 'NoOpPasswordEncoder')) { cx.report(n, ['NoOpPasswordEncoder']); return; }
      if (cx.kt) { const t = A.ctorType(n); if (WEAK_ENCODERS.includes(t)) cx.report(n, [t]); }
    },
  },
  bad: {
    java: jc(`  @org.springframework.context.annotation.Bean
  org.springframework.security.crypto.password.PasswordEncoder encoder() {
    return org.springframework.security.crypto.password.NoOpPasswordEncoder.getInstance(); // Noncompliant
  }`),
    kt: kc(`  @Bean
  fun encoder(): PasswordEncoder = StandardPasswordEncoder() // Noncompliant`),
  },
  good: {
    java: jc(`  @org.springframework.context.annotation.Bean
  org.springframework.security.crypto.password.PasswordEncoder encoder() {
    return new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder();
  }`),
    kt: kc(`  @Bean
  fun encoder(): PasswordEncoder = BCryptPasswordEncoder()`),
  },
});

// ── credentials and addresses ──
const PWD_NAME = /(password|passwd|pwd|passphrase)/i;
const NOT_A_SECRET_NAME = /(key|field|param|prop|property|label|prompt|hint|name|pattern|regex|attr|attribute|header|title|message|msg|text|length|policy|file|path|url|uri|column|selector|id|xpath|placeholder|type|format|reset|change|forgot|encoder)s?$/i;

function secretLiteral(v) {
  return typeof v === 'string' && v.length > 0 && !/^\$\{.*\}$/.test(v) && !/^%\(.*\)s$/.test(v) && !/^\s+$/.test(v);
}

rule({
  id: 'hardcoded-password', langs: JK, type: 'H', sev: 'BL', debt: 30, tags: ['cwe-798', 'cwe-259', 'owasp-a7'], sonar: 'S2068', ktSonar: 'S2068', owasp: OWASP_AUTH,
  en: ['Credentials should not be hard-coded', 'Passwords written in source code end up in version control and binaries, where anyone with access can read them, and they cannot be rotated without a release.', 'Load passwords from a secret store, environment variable or protected configuration file.'],
  ko: ['자격 증명을 코드에 하드코딩하면 안 됩니다', '소스 코드의 비밀번호는 버전 관리와 바이너리에 남아 접근할 수 있는 누구나 읽을 수 있고 배포 없이는 바꿀 수 없습니다.', '비밀번호는 비밀 저장소, 환경 변수, 보호된 설정 파일에서 읽으세요.'],
  msg: ['"{0}" detected here, make sure this is not a hard-coded credential.', '여기서 "{0}"이(가) 발견되었습니다. 하드코딩된 자격 증명이 아닌지 확인하세요.'],
  on: {
    Var(n, cx) {
      if (!n.init || !PWD_NAME.test(n.name) || NOT_A_SECRET_NAME.test(n.name)) return;
      if (secretLiteral(str(cx, n.init)) && A.isStrLit(n.init)) cx.report(n, [n.name]);
    },
    Assign(n, cx) {
      const t = A.strip(n.t);
      const name = t && (t.k === 'Name' || t.k === 'Sel') ? t.id : null;
      if (!name || !PWD_NAME.test(name) || NOT_A_SECRET_NAME.test(name)) return;
      if (A.isStrLit(n.v) && secretLiteral(str(cx, n.v))) cx.report(n, [name]);
    },
    Call(n, cx) {
      if ((n.id === 'setPassword' || n.id === 'password') && n.args.length === 1 && A.isStrLit(n.args[0]) && secretLiteral(str(cx, n.args[0]))) { cx.report(n, ['password']); return; }
      if (n.id === 'getConnection' && A.isCall(n, 'getConnection', 'DriverManager') && n.args.length === 3 && A.isStrLit(n.args[2]) && secretLiteral(str(cx, n.args[2]))) cx.report(n.args[2], ['password']);
    },
    Lit(n, cx) {
      if (n.t !== 'str') return;
      const m = /[?&;](password|pwd|passwd)=([^&;\s]+)/i.exec(String(n.v));
      if (m && !/^\$\{|^\{|^%s$|^\?$/.test(m[2])) cx.report(n, [m[1]]);
    },
  },
  bad: {
    java: jc(`  private static final String DB_PASSWORD = "s3cr3t!"; // Noncompliant
  java.sql.Connection open(String url) throws Exception {
    String jdbc = "jdbc:mysql://db/app?user=app&password=hunter2"; // Noncompliant
    return java.sql.DriverManager.getConnection(url, "app",
        "hunter2"); // Noncompliant
  }`),
    kt: kc(`  val password = "admin123" // Noncompliant
  fun conf(ds: DataSource) {
    ds.setPassword("changeit") // Noncompliant
  }`),
  },
  good: {
    java: jc(`  private static final String PASSWORD_KEY = "db.password";
  java.sql.Connection open(String url) throws Exception {
    String jdbc = "jdbc:mysql://db/app?user=app&password=\${DB_PASS}";
    return java.sql.DriverManager.getConnection(url, "app", System.getenv("DB_PASSWORD"));
  }`),
    kt: kc(`  val password = System.getenv("APP_PASSWORD") ?: ""
  val passwordField = "password"
  fun conf(ds: DataSource) {
    ds.setPassword(password)
  }`),
  },
});

const SECRET_NAME = /(secret|token|api_?key|apikey|private_?key|access_?key|auth_?key|client_?secret|credential|bearer)/i;

rule({
  id: 'hardcoded-secret', langs: JK, type: 'H', sev: 'BL', debt: 30, tags: ['cwe-798', 'owasp-a7'], sonar: 'S6418', ktSonar: 'S6418', owasp: OWASP_AUTH,
  en: ['Secrets should not be hard-coded', 'API keys, tokens and client secrets in the code leak through repositories and builds and give direct access to the protected service.', 'Read secrets from a vault or the environment at run time and rotate the leaked one.'],
  ko: ['비밀 값을 코드에 하드코딩하면 안 됩니다', '코드의 API 키·토큰·클라이언트 시크릿은 저장소와 빌드를 통해 새어 나가 보호된 서비스에 바로 접근하게 해 줍니다.', '실행 시점에 볼트나 환경 변수에서 읽고 유출된 값은 교체하세요.'],
  msg: ['"{0}" looks like a hard-coded secret; make sure it is not sensitive.', '"{0}"은(는) 하드코딩된 비밀 값으로 보입니다. 민감한 값이 아닌지 확인하세요.'],
  on: {
    Var(n, cx) {
      if (!n.init || !A.isStrLit(n.init) || !SECRET_NAME.test(n.name) || /(url|uri|name|header|path|endpoint|type|prefix|param|field|file)s?$/i.test(n.name)) return;
      const v = String(str(cx, n.init) || '');
      if (v.length >= 12 && !/\s/.test(v) && /[0-9]/.test(v) && /[a-zA-Z]/.test(v) && !/^\$\{/.test(v) && !/^https?:/.test(v)) cx.report(n, [n.name]);
    },
  },
  bad: {
    java: jc(`  private static final String API_KEY = "AKIA4F9X2Q7ZL0P3M8N1"; // Noncompliant
  String clientSecret = "9f8e7d6c5b4a39281706"; // Noncompliant`),
    kt: kc(`  private val authToken = "ghp_6Fq2Lr8Tz0Wb3Nc5Yd7Kx9Mv1Ps4Hj" // Noncompliant`),
  },
  good: {
    java: jc(`  private static final String API_KEY_HEADER = "X-Api-Key";
  String clientSecret = System.getenv("CLIENT_SECRET");
  String tokenType = "Bearer";`),
    kt: kc(`  private val authToken = System.getenv("AUTH_TOKEN")
  private val tokenUrl = "https://auth.example.com/token1234"`),
  },
});

function ipv4Of(v) {
  const m = /^(?:[a-z][a-z0-9+.-]*:\/\/)?(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?::\d{1,5})?(?:\/\S*)?$/i.exec(v);
  if (!m) return null;
  const o = m.slice(1, 5).map(Number);
  if (o.some((x) => x > 255)) return null;
  const ip = o.join('.');
  if (o[0] === 127 || o[0] === 0 || ip === '255.255.255.255' || /^(192\.0\.2|198\.51\.100|203\.0\.113)\./.test(ip + '.') || /^2\.5\./.test(ip)) return null;
  return ip;
}

rule({
  id: 'hardcoded-ip', langs: JK, type: 'H', sev: 'MI', debt: 30, tags: ['cwe-547'], sonar: 'S1313', ktSonar: 'S1313', owasp: OWASP_CONFIG,
  en: ['Using hardcoded IP addresses is security-sensitive', 'Fixed addresses force a rebuild when the infrastructure changes, can point to the wrong environment and reveal internal topology.', 'Read hosts from configuration; prefer DNS names.'],
  ko: ['하드코딩된 IP 주소 사용은 보안에 민감합니다', '고정 주소는 인프라가 바뀌면 다시 빌드해야 하고 잘못된 환경을 가리킬 수 있으며 내부 구조를 드러냅니다.', '호스트는 설정에서 읽고 DNS 이름을 쓰세요.'],
  msg: ['Make sure using the hardcoded IP address "{0}" is safe here.', '하드코딩된 IP 주소 "{0}"을(를) 써도 안전한지 확인하세요.'],
  on: {
    Lit(n, cx) {
      if (n.t !== 'str') return;
      const ip = ipv4Of(String(n.v));
      if (ip) cx.report(n, [ip]);
    },
  },
  bad: {
    java: jm(`    java.net.Socket sock = new java.net.Socket("10.12.0.7", 8080); // Noncompliant
    String url = "http://192.168.1.20:9000/api"; // Noncompliant`),
    kt: km(`    val host = "172.16.4.2" // Noncompliant`),
  },
  good: {
    java: jm(`    java.net.Socket sock = new java.net.Socket(System.getProperty("app.host"), 8080);
    String loop = "127.0.0.1";
    String doc = "192.0.2.15";
    String version = "1.2.3";`),
    kt: km(`    val host = System.getenv("HOST") ?: "localhost"
    val any = "0.0.0.0"`),
  },
});

rule({
  id: 'db-empty-password', langs: JK, type: 'V', sev: 'BL', debt: 45, tags: ['cwe-521', 'owasp-a7'], sonar: 'S2115', ktSonar: 'S2115', owasp: OWASP_AUTH,
  en: ['A secure password should be used when connecting to a database', 'Connecting with an empty password means the database account is not protected at all.', 'Protect the database account with a strong password loaded from configuration.'],
  ko: ['데이터베이스에 연결할 때 안전한 비밀번호를 써야 합니다', '빈 비밀번호로 연결한다는 것은 데이터베이스 계정이 전혀 보호되지 않는다는 뜻입니다.', '설정에서 읽은 강한 비밀번호로 데이터베이스 계정을 보호하세요.'],
  on: {
    Call(n, cx) {
      if (n.id === 'getConnection' && A.isCall(n, 'getConnection', 'DriverManager') && n.args.length === 3 && str(cx, n.args[2]) === '') cx.report(n.args[2]);
      if (n.id === 'setPassword' && n.args.length === 1 && str(cx, n.args[0]) === '' && /DataSource|ds$/i.test(cx.typeOf(n.o) || A.dotted(n.o) || '')) cx.report(n);
    },
  },
  bad: {
    java: jm(`    java.sql.Connection c = java.sql.DriverManager.getConnection("jdbc:derby:memory:db", "sa", ""); // Noncompliant`),
    kt: km(`    val c = DriverManager.getConnection("jdbc:h2:mem:db", "sa", "") // Noncompliant`),
  },
  good: {
    java: jm(`    java.sql.Connection c = java.sql.DriverManager.getConnection("jdbc:derby:memory:db", "sa", System.getenv("DB_PASS"));`),
    kt: km(`    val c = DriverManager.getConnection("jdbc:h2:mem:db", "sa", System.getenv("DB_PASS"))`),
  },
});

const CLEAR_SCHEMES = /^(http|ftp|telnet):\/\/([^/:?#]+)/i;
const CLEAR_OK_HOST = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|www\.w3\.org|w3\.org|xmlns\.[\w.]+|schemas\.[\w.]+|java\.sun\.com|xml\.org|www\.example\.(com|org|net)|example\.(com|org|net)|ns\.adobe\.com|purl\.org|apache\.org|xml\.apache\.org)$/i;

rule({
  id: 'clear-text-protocol', langs: JK, type: 'H', sev: 'CR', debt: 15, tags: ['cwe-319', 'owasp-a2'], sonar: 'S5332', ktSonar: 'S5332', owasp: OWASP_CRYPTO,
  en: ['Using clear-text protocols is security-sensitive', 'HTTP, FTP and Telnet send data, cookies and credentials unencrypted, so anyone on the network path can read or change them.', 'Use https://, sftp:// or ssh, or an FTPS/TLS-enabled client.'],
  ko: ['평문 프로토콜 사용은 보안에 민감합니다', 'HTTP, FTP, Telnet은 데이터·쿠키·자격 증명을 암호화 없이 보내 네트워크 경로의 누구나 읽거나 바꿀 수 있습니다.', 'https://, sftp://, ssh나 FTPS/TLS를 지원하는 클라이언트를 쓰세요.'],
  msg: ['Using "{0}" is insecure; use its encrypted counterpart.', '"{0}"은(는) 안전하지 않습니다. 암호화된 대체 프로토콜을 쓰세요.'],
  on: {
    Lit(n, cx) {
      if (n.t !== 'str') return;
      const m = CLEAR_SCHEMES.exec(String(n.v));
      if (m && !CLEAR_OK_HOST.test(m[2])) cx.report(n, [m[1].toLowerCase()]);
    },
    ...onCtor(['FTPClient', 'TelnetClient', 'SMTPClient'], (n, cx, t) => cx.report(n, [t.replace(/Client$/, '').toLowerCase()])),
  },
  bad: {
    java: jm(`    java.net.URL u = new java.net.URL("http://api.mycorp.io/v1/orders"); // Noncompliant
    org.apache.commons.net.ftp.FTPClient ftp = new org.apache.commons.net.ftp.FTPClient(); // Noncompliant`),
    kt: km(`    val endpoint = "ftp://files.mycorp.io/upload" // Noncompliant`),
  },
  good: {
    java: jm(`    java.net.URL u = new java.net.URL("https://api.mycorp.io/v1/orders");
    String ns = "http://www.w3.org/2001/XMLSchema";
    String dev = "http://localhost:8080/";`),
    kt: km(`    val endpoint = "sftp://files.mycorp.io/upload"`),
  },
});

// ── cookies ──
function cookieRule(id, sonar, setters, props, label, en, ko) {
  rule({
    id, langs: JK, type: 'H', sev: 'MI', debt: 5, tags: id === 'cookie-without-secure' ? ['cwe-311', 'cwe-614', 'owasp-a5'] : ['cwe-1004', 'owasp-a5'], sonar, ktSonar: sonar, owasp: OWASP_CONFIG,
    en, ko,
    msg: [`Make sure creating this cookie without the "${label}" flag is safe.`, `"${label}" 플래그 없이 이 쿠키를 만들어도 안전한지 확인하세요.`],
    on: {
      ...onCtor(['Cookie', 'NewCookie'], (n, cx) => {
        const v = assignedVar(cx, n);
        if (!v) return;
        if (!configured(scopeOf(cx), v, setters, props, true) && !configured(scopeOf(cx), v, setters, props, false)) cx.report(n);
      }),
      Call(n, cx) {
        if (setters.includes(n.id) && n.args.length === 1 && A.isBoolLit(n.args[0], false)) { cx.report(n); return; }
        if (cx.kt) {
          const t = A.ctorType(n);
          if (t === 'Cookie' || t === 'NewCookie') {
            const v = assignedVar(cx, n);
            if (v && !configured(scopeOf(cx), v, setters, props, true) && !configured(scopeOf(cx), v, setters, props, false)) cx.report(n);
          }
        }
      },
      Assign(n, cx) {
        const t = A.strip(n.t);
        if (t && t.k === 'Sel' && props.includes(t.id) && A.isBoolLit(n.v, false)) cx.report(n);
      },
    },
    bad: {
      java: jm(`    javax.servlet.http.Cookie c = new javax.servlet.http.Cookie("session", s); // Noncompliant
    javax.servlet.http.Cookie d = new javax.servlet.http.Cookie("pref", s);
    d.${setters[0]}(false); // Noncompliant`),
      kt: km(`    val c = Cookie("session", s) // Noncompliant
    val d = Cookie("pref", s)
    d.${props[0]} = false // Noncompliant`),
    },
    good: {
      java: jm(`    javax.servlet.http.Cookie c = new javax.servlet.http.Cookie("session", s);
    c.${setters[0]}(true);`),
      kt: km(`    val c = Cookie("session", s)
    c.${props[0]} = true`),
    },
  });
}

cookieRule('cookie-without-secure', 'S2092', ['setSecure', 'secure'], ['secure', 'isSecure'], 'secure',
  ['Creating cookies without the "secure" flag is security-sensitive', 'Without the secure flag the browser also sends the cookie over plain HTTP, where it can be intercepted.', 'Call setSecure(true) on every cookie that carries session or personal data.'],
  ['secure 플래그 없이 쿠키를 만드는 것은 보안에 민감합니다', 'secure 플래그가 없으면 브라우저가 평문 HTTP로도 쿠키를 보내 가로챌 수 있습니다.', '세션이나 개인 정보를 담는 모든 쿠키에 setSecure(true)를 호출하세요.']);

cookieRule('cookie-without-httponly', 'S3330', ['setHttpOnly', 'httpOnly'], ['isHttpOnly', 'httpOnly'], 'HttpOnly',
  ['Creating cookies without the "HttpOnly" flag is security-sensitive', 'Cookies without HttpOnly can be read by JavaScript, so a single XSS flaw is enough to steal the session.', 'Call setHttpOnly(true) on cookies that scripts do not need.'],
  ['HttpOnly 플래그 없이 쿠키를 만드는 것은 보안에 민감합니다', 'HttpOnly가 없는 쿠키는 자바스크립트에서 읽을 수 있어 XSS 하나로 세션을 훔칠 수 있습니다.', '스크립트가 필요 없는 쿠키에는 setHttpOnly(true)를 호출하세요.']);

// ── XML ──
const XML_FACTORIES = {
  DocumentBuilderFactory: ['newInstance', 'newDefaultInstance', 'newNSInstance', 'newDefaultNSInstance'],
  SAXParserFactory: ['newInstance', 'newDefaultInstance', 'newNSInstance', 'newDefaultNSInstance'],
  XMLInputFactory: ['newInstance', 'newFactory', 'newDefaultFactory'],
  TransformerFactory: ['newInstance', 'newDefaultInstance'],
  SAXTransformerFactory: ['newInstance'],
  SchemaFactory: ['newInstance', 'newDefaultInstance'],
  XMLReaderFactory: ['createXMLReader'],
};
const XXE_SAFE = /disallow-doctype-decl|external-general-entities|external-parameter-entities|load-external-dtd|FEATURE_SECURE_PROCESSING|ACCESS_EXTERNAL_DTD|ACCESS_EXTERNAL_SCHEMA|ACCESS_EXTERNAL_STYLESHEET|SUPPORT_DTD|IS_SUPPORTING_EXTERNAL_ENTITIES|secure-processing/;

function xxeCheck(n, cx, what) {
  const v = assignedVar(cx, n);
  if (!v) {
    const p = cx.parent(1);
    if (p && p.k === 'Call' && p.o && A.strip(p.o) === n) cx.report(n, [what]);
    return;
  }
  const scope = scopeOf(cx);
  const safe = A.find(scope, (x) => x.k === 'Call' && x.o && varName(x.o) === v && /^(setFeature|setAttribute|setProperty|setExpandEntityReferences)$/.test(x.id) &&
    (XXE_SAFE.test(cx.text(x)) || (x.id === 'setExpandEntityReferences' && A.isBoolLit(x.args[0], false))));
  if (!safe) cx.report(n, [what]);
}

rule({
  id: 'xxe-unsafe-parser', langs: JK, type: 'V', sev: 'BL', debt: 15, tags: ['cwe-611', 'cwe-827', 'owasp-a5'], sonar: 'S2755', ktSonar: 'S2755', owasp: OWASP_CONFIG,
  en: ['XML parsers should not be vulnerable to XXE attacks', 'With default settings XML parsers resolve external entities and DTDs, which lets an attacker read local files, reach internal hosts or exhaust memory.', 'Disable DOCTYPE declarations (disallow-doctype-decl) or set ACCESS_EXTERNAL_DTD / ACCESS_EXTERNAL_SCHEMA to "" on the factory.'],
  ko: ['XML 파서가 XXE 공격에 취약하면 안 됩니다', '기본 설정의 XML 파서는 외부 엔터티와 DTD를 해석해 공격자가 로컬 파일을 읽거나 내부 호스트에 접근하거나 메모리를 고갈시킬 수 있습니다.', '팩토리에서 DOCTYPE 선언을 막거나(disallow-doctype-decl) ACCESS_EXTERNAL_DTD / ACCESS_EXTERNAL_SCHEMA를 ""로 설정하세요.'],
  msg: ['Disable access to external entities in this "{0}".', '이 "{0}"에서 외부 엔터티 접근을 막으세요.'],
  on: {
    Call(n, cx) {
      if (!n.o) {
        if (cx.kt && (n.id === 'SAXBuilder' || n.id === 'SAXReader')) xxeCheck(n, cx, n.id);
        return;
      }
      const r = A.simpleName(A.dotted(n.o) || '');
      const ids = XML_FACTORIES[r];
      if (ids && ids.includes(n.id)) xxeCheck(n, cx, r);
    },
    New(n, cx) { const t = A.ctorType(n); if (t === 'SAXBuilder' || t === 'SAXReader') xxeCheck(n, cx, t); },
  },
  bad: {
    java: jm(`    javax.xml.parsers.DocumentBuilderFactory f = javax.xml.parsers.DocumentBuilderFactory.newInstance(); // Noncompliant
    f.setNamespaceAware(true);
    javax.xml.parsers.SAXParser p = javax.xml.parsers.SAXParserFactory.newInstance().newSAXParser(); // Noncompliant`),
    kt: km(`    val f = XMLInputFactory.newInstance() // Noncompliant
    val r = f.createXMLStreamReader(java.io.StringReader(s))`),
  },
  good: {
    java: jm(`    javax.xml.parsers.DocumentBuilderFactory f = javax.xml.parsers.DocumentBuilderFactory.newInstance();
    f.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
    javax.xml.transform.TransformerFactory tf = javax.xml.transform.TransformerFactory.newInstance();
    tf.setAttribute(javax.xml.XMLConstants.ACCESS_EXTERNAL_DTD, "");`),
    kt: km(`    val f = XMLInputFactory.newInstance()
    f.setProperty(XMLInputFactory.SUPPORT_DTD, false)`),
  },
});

// ── web configuration ──
function hasStar(cx, v) {
  if (!v) return false;
  return A.findAll(v, (x) => x.k === 'Lit' && x.t === 'str').some((l) => l.v === '*') || str(cx, v) === '*';
}

rule({
  id: 'permissive-cors', langs: JK, type: 'H', sev: 'MI', debt: 5, tags: ['cwe-346', 'cwe-942', 'owasp-a5'], sonar: 'S5122', ktSonar: 'S5122', owasp: OWASP_CONFIG,
  en: ['Having a permissive Cross-Origin Resource Sharing policy is security-sensitive', 'Allowing every origin lets any web site read responses of this API with the visitor\'s browser and credentials.', 'List the trusted origins explicitly instead of "*".'],
  ko: ['너무 관대한 CORS 정책은 보안에 민감합니다', '모든 출처를 허용하면 어느 웹 사이트든 방문자의 브라우저와 자격 증명으로 이 API의 응답을 읽을 수 있습니다.', '"*" 대신 신뢰하는 출처를 명시하세요.'],
  on: {
    Anno(n, cx) {
      if (A.annoName(n) !== 'CrossOrigin') return;
      const vals = (n.args || []).filter((a) => ['value', 'origins', 'originPatterns'].includes(a.name));
      if (!vals.length || vals.some((a) => hasStar(cx, a.value))) cx.report(n);
    },
    Call(n, cx) {
      if ((n.id === 'setHeader' || n.id === 'addHeader' || n.id === 'header') && n.args.length === 2) {
        const h = str(cx, n.args[0]);
        if (h && h.toLowerCase() === 'access-control-allow-origin' && str(cx, n.args[1]) === '*') cx.report(n);
        return;
      }
      if (['addAllowedOrigin', 'allowedOrigins', 'setAllowedOrigins', 'addAllowedOriginPattern', 'allowedOriginPatterns', 'setAllowedOriginPatterns'].includes(n.id) && n.args.some((a) => hasStar(cx, a))) cx.report(n);
    },
  },
  bad: {
    java: jc(`  @org.springframework.web.bind.annotation.CrossOrigin // Noncompliant
  @org.springframework.web.bind.annotation.GetMapping("/a") String a() { return "a"; }
  void b(javax.servlet.http.HttpServletResponse resp, org.springframework.web.cors.CorsConfiguration cfg) {
    resp.setHeader("Access-Control-Allow-Origin", "*"); // Noncompliant
    cfg.addAllowedOrigin("*"); // Noncompliant
  }`),
    kt: kc(`  @CrossOrigin(origins = ["*"]) // Noncompliant
  @GetMapping("/a") fun a() = "a"`),
  },
  good: {
    java: jc(`  @org.springframework.web.bind.annotation.CrossOrigin(origins = "https://app.example.com")
  @org.springframework.web.bind.annotation.GetMapping("/a") String a() { return "a"; }
  void b(javax.servlet.http.HttpServletResponse resp, org.springframework.web.cors.CorsConfiguration cfg) {
    resp.setHeader("Access-Control-Allow-Origin", "https://app.example.com");
    cfg.addAllowedOrigin("https://app.example.com");
  }`),
    kt: kc(`  @CrossOrigin(origins = ["https://app.example.com"])
  @GetMapping("/a") fun a() = "a"`),
  },
});

// Nested quantifiers over a sub-pattern that can match the same input in
// several ways: (a+)+, (\w+\s?)*, (.*)* ...
function redosVulnerable(p) {
  let i = 0;
  let vuln = false;
  function seq(depth) {
    let allQ = true;
    let unb = false;
    let any = false;
    let altAll = true;
    let altUnb = false;
    let alts = 0;
    while (i < p.length && p[i] !== ')') {
      if (p[i] === '|') { i++; alts++; altAll = altAll && allQ && any; altUnb = altUnb || unb; allQ = true; unb = false; any = false; continue; }
      let inner = null;
      const c = p[i];
      if (c === '\\') i += 2;
      else if (c === '[') {
        i++;
        if (p[i] === '^') i++;
        if (p[i] === ']') i++;
        while (i < p.length && p[i] !== ']') { if (p[i] === '\\') i++; i++; }
        i++;
      } else if (c === '(') {
        i++;
        let atomic = false;
        if (p[i] === '?') {
          i++;
          if (p[i] === '>') { atomic = true; i++; } else if (p[i] === ':' || p[i] === '=' || p[i] === '!') i++;
          else if (p[i] === '<' && (p[i + 1] === '=' || p[i + 1] === '!')) i += 2;
          else if (p[i] === '<') { while (i < p.length && p[i] !== '>') i++; i++; } else { while (i < p.length && /[a-zA-Z-]/.test(p[i])) i++; if (p[i] === ':') i++; }
        }
        inner = depth > 20 ? { allQ: false, unb: false } : seq(depth + 1);
        if (atomic) inner = { allQ: false, unb: false };
        i++;
      } else i++;
      let q = null;
      if (p[i] === '+' || p[i] === '*') { q = 'unb'; i++; } else if (p[i] === '?') { q = 'opt'; i++; } else if (p[i] === '{') {
        const m = /^\{(\d+)(,(\d*))?\}/.exec(p.slice(i));
        if (m) { i += m[0].length; q = m[2] && (m[3] === '' || Number(m[3]) > 9) ? 'unb' : (m[1] === '0' ? 'opt' : null); }
      }
      if (q && p[i] === '+') { i++; q = q === 'unb' ? 'poss' : q; } else if (q && p[i] === '?') i++;
      any = true;
      if (q === 'unb' && inner && inner.unb && inner.allQ) vuln = true;
      if (q === 'unb' || (inner && inner.unb)) unb = true;
      if (!q && !(inner && inner.allQ)) allQ = false;
    }
    if (alts) return { allQ: altAll && allQ && any, unb: altUnb || unb };
    return { allQ: allQ && any, unb };
  }
  while (i < p.length) { seq(0); i++; }
  return vuln;
}

function regexArg(n, cx) {
  if (A.isCall(n, ['compile', 'matches'], 'Pattern') && n.args.length) return n.args[0];
  if (n.o && ['matches', 'replaceAll', 'replaceFirst', 'split'].includes(n.id) && n.args.length && !cx.kt && cx.typeOf(n.o) === 'String') return n.args[0];
  if (n.o && n.id === 'toRegex' && n.args.length === 0) return n.o;
  if (cx.kt && !n.o && n.id === 'Regex' && n.args.length) return n.args[0];
  return null;
}

rule({
  id: 'regex-redos', langs: JK, type: 'H', sev: 'CR', debt: 30, tags: ['cwe-1333', 'cwe-400'], sonar: 'S5852', ktSonar: 'S5852', owasp: OWASP_CONFIG,
  en: ['Using slow regular expressions is security-sensitive', 'A repeated group that itself contains a repetition can match the same text in exponentially many ways; a crafted input then blocks the thread (ReDoS).', 'Rewrite the expression so that each part of the input can be matched in only one way, or use a possessive quantifier or atomic group.'],
  ko: ['느린 정규식 사용은 보안에 민감합니다', '반복을 포함한 그룹을 다시 반복하면 같은 텍스트를 지수적으로 많은 방법으로 매칭할 수 있어 조작된 입력이 스레드를 멈추게 합니다(ReDoS).', '입력의 각 부분이 한 가지 방법으로만 매칭되도록 식을 고치거나 소유 수량자나 원자 그룹을 쓰세요.'],
  msg: ['Make sure the regex "{0}" cannot backtrack catastrophically.', '정규식 "{0}"이(가) 파국적 역추적을 일으키지 않는지 확인하세요.'],
  on: {
    Call(n, cx) {
      const a = regexArg(n, cx);
      if (!a) return;
      const p = str(cx, a);
      if (p && redosVulnerable(p)) cx.report(n, [p.length > 40 ? p.slice(0, 37) + '...' : p]);
    },
  },
  bad: {
    java: jm(`    java.util.regex.Pattern p = java.util.regex.Pattern.compile("(a+)+b"); // Noncompliant
    boolean ok = s.matches("^(\\\\w+\\\\s?)*$"); // Noncompliant`),
    kt: km(`    val r = Regex("(\\\\s*\\\\w+)*x") // Noncompliant
    val t = "(\\\\d+)*".toRegex() // Noncompliant`),
  },
  good: {
    java: jm(`    java.util.regex.Pattern p = java.util.regex.Pattern.compile("a+b");
    boolean ok = s.matches("^\\\\w+(,\\\\s*\\\\w+)*$");
    boolean poss = s.matches("(a++)+b");`),
    kt: km(`    val r = Regex("[^,]*,x")
    val t = "\\\\d+".toRegex()`),
  },
});

function othersPerms(p) {
  return typeof p === 'string' && /^[r-][w-][x-][r-][w-][x-][r-][w-][x-]$/.test(p) && p.slice(6) !== '---';
}

rule({
  id: 'permissive-file-permissions', langs: JK, type: 'H', sev: 'MA', debt: 5, tags: ['cwe-732', 'cwe-266', 'owasp-a1'], sonar: 'S2612', ktSonar: 'S2612', owasp: ['A01'],
  en: ['Setting loose POSIX file permissions is security-sensitive', 'Granting read, write or execute rights to all users ("others") lets any local account read secrets or tamper with the file.', 'Remove the permissions for others; grant access to the owner (and group) only.'],
  ko: ['느슨한 POSIX 파일 권한 설정은 보안에 민감합니다', '모든 사용자(others)에게 읽기·쓰기·실행 권한을 주면 어떤 로컬 계정이든 비밀을 읽거나 파일을 변조할 수 있습니다.', 'others 권한을 없애고 소유자(와 그룹)에게만 접근을 허용하세요.'],
  on: {
    Call(n, cx) {
      if (A.isCall(n, 'fromString', 'PosixFilePermissions') && n.args.length && othersPerms(str(cx, n.args[0]))) { cx.report(n); return; }
      if (['setReadable', 'setWritable', 'setExecutable'].includes(n.id) && n.args.length === 2 && A.isBoolLit(n.args[0], true) && A.isBoolLit(n.args[1], false)) cx.report(n);
    },
    Sel(n, cx) {
      if (/^OTHERS_(READ|WRITE|EXECUTE)$/.test(n.id) && A.simpleName(A.dotted(n.o) || '') === 'PosixFilePermission') cx.report(n);
    },
  },
  bad: {
    java: jm(`    java.util.Set<java.nio.file.attribute.PosixFilePermission> p = java.nio.file.attribute.PosixFilePermissions.fromString("rwxrwxrwx"); // Noncompliant
    new java.io.File(s).setWritable(true, false); // Noncompliant
    p.add(java.nio.file.attribute.PosixFilePermission.OTHERS_READ); // Noncompliant`),
    kt: km(`    val p = PosixFilePermissions.fromString("rw-r--r--") // Noncompliant`),
  },
  good: {
    java: jm(`    java.util.Set<java.nio.file.attribute.PosixFilePermission> p = java.nio.file.attribute.PosixFilePermissions.fromString("rwx------");
    new java.io.File(s).setWritable(true, true);
    p.add(java.nio.file.attribute.PosixFilePermission.GROUP_READ);`),
    kt: km(`    val p = PosixFilePermissions.fromString("rw-r-----")`),
  },
});

const XSTREAM_SAFE = ['addPermission', 'allowTypes', 'allowTypesByWildcard', 'allowTypesByRegExp', 'allowTypeHierarchy', 'setupDefaultSecurity'];

rule({
  id: 'object-deserialization', langs: JK, type: 'H', sev: 'CR', debt: 30, tags: ['cwe-502', 'owasp-a8'], sonar: 'S5135', ktSonar: 'S5135', owasp: ['A08'],
  en: ['Deserializing objects without a class filter is security-sensitive', 'ObjectInputStream, XMLDecoder and an unrestricted XStream instantiate whatever classes the stream names; gadget chains in the class path then run attacker code.', 'Set an ObjectInputFilter (or override resolveClass) that allows only expected classes; restrict XStream types; avoid XMLDecoder on untrusted data.'],
  ko: ['클래스 필터 없이 객체를 역직렬화하는 것은 보안에 민감합니다', 'ObjectInputStream, XMLDecoder, 제한 없는 XStream은 스트림이 지정한 어떤 클래스든 만들어 클래스 경로의 가젯 체인이 공격자 코드를 실행합니다.', '예상한 클래스만 허용하는 ObjectInputFilter를 설정(또는 resolveClass 재정의)하고 XStream 타입을 제한하며 신뢰할 수 없는 데이터에 XMLDecoder를 쓰지 마세요.'],
  msg: ['Make sure deserializing with "{0}" is restricted to expected classes.', '"{0}"의 역직렬화가 예상한 클래스로 제한되는지 확인하세요.'],
  on: onCtor(['ObjectInputStream', 'XMLDecoder', 'XStream'], (n, cx, t) => {
    if (n.k === 'New' && n.body) return;
    if (t === 'XMLDecoder') { cx.report(n, [t]); return; }
    const v = assignedVar(cx, n);
    const scope = scopeOf(cx);
    if (t === 'ObjectInputStream') {
      if (v && callsOn(scope, v, ['setObjectInputFilter']).length) return;
      if (!v && A.find(scope, (x) => x.k === 'Call' && x.id === 'setObjectInputFilter')) return;
      cx.report(n, [t]);
    } else if (!(v && callsOn(scope, v, XSTREAM_SAFE).length)) cx.report(n, [t]);
  }),
  bad: {
    java: jm(`    java.io.ObjectInputStream in = new java.io.ObjectInputStream(new java.io.FileInputStream(s)); // Noncompliant
    Object x = in.readObject();
    java.beans.XMLDecoder d = new java.beans.XMLDecoder(new java.io.FileInputStream(s)); // Noncompliant`),
    kt: km(`    val xs = XStream() // Noncompliant
    val obj = xs.fromXML(s)`),
  },
  good: {
    java: jm(`    java.io.ObjectInputStream in = new java.io.ObjectInputStream(new java.io.FileInputStream(s));
    in.setObjectInputFilter(java.io.ObjectInputFilter.Config.createFilter("com.example.*;!*"));
    Object x = in.readObject();`),
    kt: km(`    val xs = XStream()
    xs.allowTypes(arrayOf(Order::class.java))
    val obj = xs.fromXML(s)`),
  },
});

rule({
  id: 'debug-feature-enabled', langs: JK, type: 'H', sev: 'MI', debt: 1, tags: ['cwe-489', 'cwe-215', 'owasp-a5'], sonar: 'S4507', ktSonar: 'S4507', owasp: OWASP_CONFIG,
  en: ['Delivering code in production with debug features activated is security-sensitive', 'Stack traces printed to the console, Spring Security debug mode and WebView remote debugging expose internals that help attackers.', 'Log through a logger at an appropriate level and disable debug switches in production builds.'],
  ko: ['디버그 기능을 켠 채로 운영 코드를 배포하는 것은 보안에 민감합니다', '콘솔에 출력한 스택 트레이스, Spring Security 디버그 모드, WebView 원격 디버깅은 공격에 도움이 되는 내부 정보를 드러냅니다.', '적절한 수준의 로거로 기록하고 운영 빌드에서는 디버그 스위치를 끄세요.'],
  msg: ['Make sure "{0}" is not enabled in production.', '운영 환경에서 "{0}"이(가) 켜져 있지 않은지 확인하세요.'],
  on: {
    Call(n, cx) {
      if (n.id === 'printStackTrace' && n.o && n.args.length === 0 && !cx.isTestClass()) { cx.report(n, ['printStackTrace()']); return; }
      if (n.id === 'setWebContentsDebuggingEnabled' && n.args.length === 1 && A.isBoolLit(n.args[0], true)) cx.report(n, ['WebView debugging']);
    },
    Anno(n, cx) {
      if (A.annoName(n) === 'EnableWebSecurity' && A.isBoolLit(A.annoArg(n, 'debug'), true)) cx.report(n, ['Spring Security debug']);
    },
  },
  bad: {
    java: jc(`  void m(Runnable r) {
    try { r.run(); } catch (RuntimeException e) {
      e.printStackTrace(); // Noncompliant
    }
    android.webkit.WebView.setWebContentsDebuggingEnabled(true); // Noncompliant
  }`),
    kt: `@EnableWebSecurity(debug = true) // Noncompliant
class SecurityConfig
`,
  },
  good: {
    java: jc(`  static final org.slf4j.Logger LOG = org.slf4j.LoggerFactory.getLogger(T.class);
  void m(Runnable r) {
    try { r.run(); } catch (RuntimeException e) {
      LOG.error("run failed", e);
    }
    android.webkit.WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
  }`),
    kt: `@EnableWebSecurity
class SecurityConfig
`,
  },
});

// x.outer().inner(), x.outer(c -> c.inner()), x.outer(C::inner), outer { inner() }
function dslSwitchedOff(n, outer, inner) {
  if (n.id === inner && n.o && A.isCall(n.o, outer)) return true;
  if (n.id !== outer) return false;
  return n.args.some((a) => {
    a = A.strip(a);
    if (!a) return false;
    if (a.k === 'MRef' && a.id === inner) return true;
    return a.k === 'Lambda' && !!A.find(a.body, (x) => x.k === 'Call' && x.id === inner);
  });
}

rule({
  id: 'csrf-protection-disabled', langs: JK, type: 'H', sev: 'CR', debt: 5, tags: ['cwe-352', 'owasp-a1'], sonar: 'S4502', ktSonar: 'S4502', owasp: ['A01'],
  en: ['Disabling CSRF protections is security-sensitive', 'Without CSRF tokens a malicious page can make a logged-in user\'s browser send state-changing requests to this application.', 'Keep Spring Security CSRF protection enabled for browser-facing endpoints; only disable it for stateless token-based APIs after review.'],
  ko: ['CSRF 보호를 끄는 것은 보안에 민감합니다', 'CSRF 토큰이 없으면 악성 페이지가 로그인한 사용자의 브라우저로 상태를 바꾸는 요청을 보내게 할 수 있습니다.', '브라우저용 엔드포인트에서는 Spring Security CSRF 보호를 유지하고 상태 없는 토큰 API에서만 검토 후 끄세요.'],
  on: { Call(n, cx) { if (dslSwitchedOff(n, 'csrf', 'disable')) cx.report(n); } },
  bad: {
    java: jc(`  void configure(org.springframework.security.config.annotation.web.builders.HttpSecurity http) throws Exception {
    http.csrf().disable(); // Noncompliant
  }
  void chain(org.springframework.security.config.annotation.web.builders.HttpSecurity http) throws Exception {
    http.csrf(c -> c.disable()); // Noncompliant
  }`),
    kt: kc(`  fun chain(http: HttpSecurity) {
    http {
      csrf { disable() } // Noncompliant
    }
  }`),
  },
  good: {
    java: jc(`  void configure(org.springframework.security.config.annotation.web.builders.HttpSecurity http) throws Exception {
    http.csrf().ignoringRequestMatchers("/webhook");
  }`),
    kt: kc(`  fun chain(http: HttpSecurity) {
    http {
      csrf { ignoringRequestMatchers("/webhook") }
    }
  }`),
  },
});

rule({
  id: 'session-fixation-disabled', langs: JK, type: 'V', sev: 'CR', debt: 5, tags: ['cwe-384', 'owasp-a7'], sonar: 'S5876', ktSonar: 'S5876', owasp: OWASP_AUTH,
  en: ['A new session should be created during user authentication', 'With session fixation protection turned off the session id chosen before login stays valid after it, so an attacker who planted it hijacks the account.', 'Keep the default (changeSessionId or migrateSession).'],
  ko: ['사용자 인증 시 새 세션을 만들어야 합니다', '세션 고정 보호를 끄면 로그인 전에 정한 세션 ID가 로그인 후에도 유효해서 이를 심은 공격자가 계정을 가로챕니다.', '기본값(changeSessionId 또는 migrateSession)을 유지하세요.'],
  on: { Call(n, cx) { if (dslSwitchedOff(n, 'sessionFixation', 'none')) cx.report(n); } },
  bad: {
    java: jc(`  void configure(org.springframework.security.config.annotation.web.builders.HttpSecurity http) throws Exception {
    http.sessionManagement().sessionFixation().none(); // Noncompliant
  }`),
    kt: kc(`  fun chain(http: HttpSecurity) {
    http.sessionManagement { it.sessionFixation { f -> f.none() } } // Noncompliant
  }`),
  },
  good: {
    java: jc(`  void configure(org.springframework.security.config.annotation.web.builders.HttpSecurity http) throws Exception {
    http.sessionManagement().sessionFixation().migrateSession();
  }`),
    kt: kc(`  fun chain(http: HttpSecurity) {
    http.sessionManagement { it.sessionFixation { f -> f.changeSessionId() } }
  }`),
  },
});

const JWT_KEY_IDS = ['setSigningKey', 'setSigningKeyResolver', 'verifyWith', 'keyLocator', 'decryptWith', 'signWith'];

rule({
  id: 'jwt-signature-not-verified', langs: JK, type: 'V', sev: 'CR', debt: 30, tags: ['cwe-347', 'owasp-a2'], sonar: 'S5659', ktSonar: 'S5659', owasp: OWASP_CRYPTO,
  en: ['JWT should be signed and verified with strong cipher algorithms', 'Tokens that are not signed, signed with "none" or parsed without checking the signature can be forged by anyone.', 'Sign with a strong algorithm (HS256 with a long secret, RS256, ES256) and parse with parseClaimsJws / a verifier configured with the key.'],
  ko: ['JWT는 강한 알고리즘으로 서명하고 검증해야 합니다', '서명하지 않았거나 "none"으로 서명했거나 서명 확인 없이 해석한 토큰은 누구나 위조할 수 있습니다.', '강한 알고리즘(긴 비밀키의 HS256, RS256, ES256)으로 서명하고 키를 설정한 검증기나 parseClaimsJws로 해석하세요.'],
  msg: ['The JWT signature is not verified here ("{0}").', '여기서 JWT 서명을 검증하지 않습니다("{0}").'],
  on: {
    Call(n, cx) {
      if (/^(parseClaimsJwt|parsePlaintextJwt|parseUnsecuredClaims|parseUnsecuredContent)$/.test(n.id)) { cx.report(n, [n.id]); return; }
      if (n.id === 'none' && A.isCall(n, 'none', 'Algorithm')) { cx.report(n, ['Algorithm.none()']); return; }
      if (n.id === 'parse' || n.id === 'compact') {
        const { ids, root } = chainIds(n);
        if (A.simpleName(root || '') !== 'Jwts') return;
        const start = n.id === 'parse' ? ['parser', 'parserBuilder'] : ['builder'];
        if (!start.includes(ids[0])) return;
        if (!ids.some((id) => JWT_KEY_IDS.includes(id))) cx.report(n, ['Jwts.' + ids[0] + '()...' + n.id + '()']);
        return;
      }
      if (n.id === 'decode' && A.isCall(n, 'decode', 'JWT') && !A.find(scopeOf(cx), (x) => x.k === 'Call' && x.id === 'verify')) cx.report(n, ['JWT.decode']);
    },
  },
  bad: {
    java: jm(`    Object claims = io.jsonwebtoken.Jwts.parser().parse(s); // Noncompliant
    String token = io.jsonwebtoken.Jwts.builder().setSubject("bob").compact(); // Noncompliant`),
    kt: km(`    val alg = Algorithm.none() // Noncompliant
    val jwt = JWT.decode(s) // Noncompliant`),
  },
  good: {
    java: jm(`    Object claims = io.jsonwebtoken.Jwts.parser().setSigningKey(KEY).parseClaimsJws(s);
    String token = io.jsonwebtoken.Jwts.builder().setSubject("bob").signWith(KEY).compact();`),
    kt: km(`    val alg = Algorithm.HMAC256(System.getenv("JWT_SECRET"))
    val jwt = JWT.require(alg).build().verify(s)`),
  },
});

function isAuthKey(cx, e) {
  const d = A.dotted(e);
  return (d && /(^|\.)SECURITY_AUTHENTICATION$/.test(d)) || str(cx, e) === 'java.naming.security.authentication';
}

rule({
  id: 'ldap-anonymous-bind', langs: JK, type: 'V', sev: 'CR', debt: 5, tags: ['cwe-521', 'owasp-a7'], sonar: 'S4433', ktSonar: 'S4433', owasp: OWASP_AUTH,
  en: ['LDAP connections should be authenticated', 'An anonymous ("none") LDAP bind lets anyone query or modify the directory without credentials.', 'Use "simple" over LDAPS or a stronger SASL mechanism with real credentials.'],
  ko: ['LDAP 연결은 인증되어야 합니다', '익명("none") LDAP 바인드는 자격 증명 없이 누구나 디렉터리를 조회하거나 수정하게 합니다.', 'LDAPS 위의 "simple"이나 더 강한 SASL 방식과 실제 자격 증명을 쓰세요.'],
  on: {
    Call(n, cx) {
      if (n.id === 'put' && n.args.length === 2 && isAuthKey(cx, n.args[0]) && String(str(cx, n.args[1]) || '').toLowerCase() === 'none') cx.report(n);
    },
    Assign(n, cx) {
      const t = A.strip(n.t);
      if (t && t.k === 'Idx' && isAuthKey(cx, t.i) && String(str(cx, n.v) || '').toLowerCase() === 'none') cx.report(n);
    },
  },
  bad: {
    java: jm(`    java.util.Hashtable<String, String> env = new java.util.Hashtable<>();
    env.put(javax.naming.Context.SECURITY_AUTHENTICATION, "none"); // Noncompliant`),
    kt: km(`    val env = Hashtable<String, String>()
    env[Context.SECURITY_AUTHENTICATION] = "none" // Noncompliant`),
  },
  good: {
    java: jm(`    java.util.Hashtable<String, String> env = new java.util.Hashtable<>();
    env.put(javax.naming.Context.SECURITY_AUTHENTICATION, "simple");`),
    kt: km(`    val env = Hashtable<String, String>()
    env[Context.SECURITY_AUTHENTICATION] = "simple"`),
  },
});

rule({
  id: 'ldap-returning-objects', langs: JK, type: 'V', sev: 'MA', debt: 5, tags: ['cwe-502', 'owasp-a8'], sonar: 'S4434', ktSonar: 'S4434', owasp: ['A08'],
  en: ['LDAP deserialization should be disabled', 'Asking an LDAP search to return objects makes the client deserialize Java objects stored in the directory, a known remote-code-execution path.', 'Pass false as returningObjFlag and read plain attributes.'],
  ko: ['LDAP 역직렬화는 꺼야 합니다', 'LDAP 검색이 객체를 돌려주게 하면 클라이언트가 디렉터리에 저장된 자바 객체를 역직렬화해 원격 코드 실행 경로가 됩니다.', 'returningObjFlag에 false를 주고 일반 속성을 읽으세요.'],
  on: {
    ...onCtor(['SearchControls'], (n, cx) => { const a = A.ctorArgs(n); if (a.length === 6 && A.isBoolLit(a[4], true)) cx.report(n); }),
    Call(n, cx) {
      if (cx.kt && A.ctorType(n) === 'SearchControls' && n.args.length === 6 && A.isBoolLit(n.args[4], true)) { cx.report(n); return; }
      if (n.id === 'setReturningObjFlag' && n.args.length === 1 && A.isBoolLit(n.args[0], true)) cx.report(n);
    },
  },
  bad: {
    java: jm(`    javax.naming.directory.SearchControls sc = new javax.naming.directory.SearchControls(2, 0, 0, null, true, true); // Noncompliant`),
    kt: km(`    val sc = SearchControls()
    sc.setReturningObjFlag(true) // Noncompliant`),
  },
  good: {
    java: jm(`    javax.naming.directory.SearchControls sc = new javax.naming.directory.SearchControls(2, 0, 0, null, false, true);`),
    kt: km(`    val sc = SearchControls()
    sc.setReturningObjFlag(false)`),
  },
});

// ── archives ──
const ENTRY_RE = /entry/i;
const ENTRY_TYPES = ['ZipEntry', 'JarEntry', 'TarArchiveEntry', 'ArchiveEntry', 'ZipArchiveEntry'];

function isEntryName(cx, e, depth = 0) {
  e = A.strip(e);
  if (!e || depth > 2) return false;
  const isEntry = (o) => ENTRY_TYPES.includes(cx.typeOf(o) || '') || ENTRY_RE.test(A.dotted(o) || '');
  if (e.k === 'Call' && e.id === 'getName' && e.o && e.args.length === 0) return isEntry(e.o);
  if (e.k === 'Sel' && e.id === 'name' && cx.kt) return isEntry(e.o);
  if (e.k === 'Name') { const l = cx.env.locals.get(e.id); return !!(l && l.init && isEntryName(cx, l.init, depth + 1)); }
  return false;
}

rule({
  id: 'zip-slip', langs: JK, type: 'V', sev: 'BL', debt: 15, tags: ['cwe-22', 'owasp-a1'], sonar: 'S6096', ktSonar: 'S6096', owasp: ['A01'],
  en: ['Extracting archives should not lead to zip slip vulnerabilities', 'Entry names like "../../etc/cron.d/x" escape the target directory when joined to it without a check, letting an archive overwrite arbitrary files.', 'Normalize the resulting path and verify that it still starts with the canonical target directory before writing.'],
  ko: ['압축 해제가 zip slip 취약점으로 이어지면 안 됩니다', '"../../etc/cron.d/x" 같은 항목 이름을 검사 없이 대상 폴더에 붙이면 폴더를 벗어나 임의 파일을 덮어쓸 수 있습니다.', '결과 경로를 정규화하고 쓰기 전에 정규화한 대상 폴더로 시작하는지 확인하세요.'],
  on: {
    ...onCtor(['File'], (n, cx) => {
      const a = A.ctorArgs(n);
      if (a.length === 2 && isEntryName(cx, a[1]) && !A.find(scopeOf(cx), (x) => x.k === 'Call' && x.id === 'startsWith')) cx.report(n);
    }),
    Call(n, cx) {
      if (cx.kt && A.ctorType(n) === 'File') {
        if (n.args.length === 2 && isEntryName(cx, n.args[1]) && !A.find(scopeOf(cx), (x) => x.k === 'Call' && x.id === 'startsWith')) cx.report(n);
        return;
      }
      const pathy = (n.id === 'resolve' && n.o && n.args.length === 1) || (A.isCall(n, 'get', 'Paths') || A.isCall(n, 'of', 'Path'));
      if (pathy && n.args.some((x) => isEntryName(cx, x)) && !A.find(scopeOf(cx), (x) => x.k === 'Call' && x.id === 'startsWith')) cx.report(n);
    },
  },
  bad: {
    java: jc(`  void unzip(java.util.zip.ZipInputStream zis, java.io.File dir) throws Exception {
    java.util.zip.ZipEntry entry;
    while ((entry = zis.getNextEntry()) != null) {
      java.io.File out = new java.io.File(dir, entry.getName()); // Noncompliant
      java.nio.file.Files.copy(zis, out.toPath());
    }
  }`),
    kt: kc(`  fun unzip(zip: ZipFile, dir: java.nio.file.Path) {
    for (entry in zip.entries()) {
      val target = dir.resolve(entry.name) // Noncompliant
      zip.getInputStream(entry).use { Files.copy(it, target) }
    }
  }`),
  },
  good: {
    java: jc(`  void unzip(java.util.zip.ZipInputStream zis, java.io.File dir) throws Exception {
    java.util.zip.ZipEntry entry;
    while ((entry = zis.getNextEntry()) != null) {
      java.io.File out = new java.io.File(dir, entry.getName());
      if (!out.getCanonicalPath().startsWith(dir.getCanonicalPath() + java.io.File.separator)) throw new SecurityException("bad entry");
      java.nio.file.Files.copy(zis, out.toPath());
    }
  }`),
    kt: kc(`  fun unzip(zip: ZipFile, dir: java.nio.file.Path) {
    for (entry in zip.entries()) {
      val target = dir.resolve(entry.name).normalize()
      require(target.startsWith(dir)) { "bad entry" }
      zip.getInputStream(entry).use { Files.copy(it, target) }
    }
  }`),
  },
});

rule({
  id: 'archive-expansion-unbounded', langs: JK, type: 'H', sev: 'CR', debt: 30, tags: ['cwe-409', 'owasp-a5'], sonar: 'S5042', ktSonar: 'S5042', owasp: OWASP_CONFIG,
  en: ['Expanding archive files without controlling resource consumption is security-sensitive', 'A small "zip bomb" can expand to terabytes or millions of entries and exhaust disk, memory or inodes.', 'Limit the number of entries, the total uncompressed size and the compression ratio while extracting.'],
  ko: ['자원 사용을 통제하지 않고 압축 파일을 푸는 것은 보안에 민감합니다', '작은 "zip 폭탄"이 테라바이트나 수백만 개 항목으로 풀려 디스크·메모리·inode를 고갈시킬 수 있습니다.', '압축을 풀 때 항목 수, 전체 압축 해제 크기, 압축률을 제한하세요.'],
  on: {
    Call(n, cx) {
      let hit = /^(getNextEntry|getNextZipEntry|getNextJarEntry|getNextTarEntry)$/.test(n.id) && !!n.o && n.args.length === 0;
      if (!hit && n.id === 'entries' && n.o && n.args.length === 0) {
        const init = localInit(cx, n.o);
        hit = ['ZipFile', 'JarFile'].includes(cx.typeOf(n.o) || '') || !!(init && ['ZipFile', 'JarFile'].includes(A.ctorType(init)));
      }
      if (!hit) return;
      const guarded = A.find(scopeOf(cx), (x) => (x.k === 'Call' && /^(getSize|getCompressedSize)$/.test(x.id)) ||
        (x.k === 'Sel' && (x.id === 'compressedSize' || (x.id === 'size' && ENTRY_RE.test(A.dotted(x.o) || '')))));
      if (!guarded) cx.report(n);
    },
  },
  bad: {
    java: jc(`  void unzip(java.util.zip.ZipInputStream zis) throws Exception {
    java.util.zip.ZipEntry e;
    while ((e = zis.getNextEntry()) != null) { // Noncompliant
      zis.transferTo(java.io.OutputStream.nullOutputStream());
    }
  }`),
    kt: kc(`  fun unzip(zip: ZipFile) {
    for (entry in zip.entries()) { // Noncompliant
      zip.getInputStream(entry).readBytes()
    }
  }`),
  },
  good: {
    java: jc(`  static final long MAX = 100_000_000L;
  void unzip(java.util.zip.ZipInputStream zis) throws Exception {
    java.util.zip.ZipEntry e;
    long total = 0;
    while ((e = zis.getNextEntry()) != null) {
      total += e.getSize();
      if (total > MAX) throw new java.io.IOException("archive too large");
    }
  }`),
    kt: kc(`  fun unzip(zip: ZipFile) {
    var total = 0L
    for (entry in zip.entries()) {
      total += entry.size
      check(total < 100_000_000L) { "archive too large" }
    }
  }`),
  },
});

// ── HTTP authentication and OS commands ──
function startsWithBasic(cx, e) {
  e = A.strip(e);
  if (!e) return false;
  const v = str(cx, e);
  if (typeof v === 'string') return /^basic\s/i.test(v);
  if (e.k === 'Bin' && e.op === '+') return startsWithBasic(cx, e.l);
  if (e.k === 'Tmpl') return /^"?basic\s/i.test(String(e.raw || '').replace(/^"+/, ''));
  return false;
}

rule({
  id: 'basic-authentication', langs: JK, type: 'V', sev: 'CR', debt: 30, tags: ['cwe-522', 'cwe-311', 'owasp-a7'], sonar: 'S2647', ktSonar: 'S2647', owasp: OWASP_AUTH,
  en: ['Basic authentication should not be used', 'Basic authentication sends the user name and password, only Base64-encoded, with every request, so any leak of a single request reveals the credentials.', 'Use token-based authentication (OAuth 2, signed tokens) or at least digest authentication over TLS.'],
  ko: ['기본(Basic) 인증을 쓰면 안 됩니다', 'Basic 인증은 사용자 이름과 비밀번호를 Base64로만 인코딩해 매 요청마다 보내므로 요청 하나만 새어도 자격 증명이 드러납니다.', '토큰 기반 인증(OAuth 2, 서명된 토큰)이나 최소한 TLS 위의 다이제스트 인증을 쓰세요.'],
  on: {
    Call(n, cx) {
      if (!['setRequestProperty', 'addRequestProperty', 'setHeader', 'addHeader', 'header'].includes(n.id) || n.args.length !== 2) return;
      const h = str(cx, n.args[0]);
      if (h && h.toLowerCase() === 'authorization' && startsWithBasic(cx, n.args[1])) cx.report(n);
    },
  },
  bad: {
    java: jm(`    java.net.HttpURLConnection c = (java.net.HttpURLConnection) new java.net.URL("https://api.example.com").openConnection();
    String enc = java.util.Base64.getEncoder().encodeToString(s.getBytes());
    c.setRequestProperty("Authorization", "Basic " + enc); // Noncompliant`),
    kt: km(`    val enc = Base64.getEncoder().encodeToString(s.toByteArray())
    val req = Request.Builder().url("https://api.example.com").header("Authorization", "Basic $enc").build() // Noncompliant`),
  },
  good: {
    java: jm(`    java.net.HttpURLConnection c = (java.net.HttpURLConnection) new java.net.URL("https://api.example.com").openConnection();
    c.setRequestProperty("Authorization", "Bearer " + s);`),
    kt: km(`    val req = Request.Builder().url("https://api.example.com").header("Authorization", "Bearer $s").build()`),
  },
});

function relativeCommand(cx, e) {
  e = A.strip(e);
  if (!e) return null;
  let first = str(cx, e);
  if (first === undefined) {
    let elems = null;
    if (e.k === 'New' && e.init) elems = e.init.elems;
    else if (e.k === 'ArrInit') elems = e.elems;
    else if (e.k === 'Call' && !e.o && (e.id === 'arrayOf' || e.id === 'listOf')) elems = e.args;
    else if (A.isCall(e, ['asList', 'of'], ['Arrays', 'List'])) elems = e.args;
    if (!elems || !elems.length) return null;
    first = str(cx, elems[0]);
    if (first === undefined) return null;
  } else first = first.trim().split(/\s+/)[0];
  if (!first || /^([/\\.~]|[A-Za-z]:[\\/]|\$)/.test(first)) return null;
  return first;
}

rule({
  id: 'os-command-from-path', langs: JK, type: 'H', sev: 'MI', debt: 10, tags: ['cwe-426', 'cwe-427', 'owasp-a8'], sonar: 'S4036', ktSonar: 'S4036', owasp: ['A08'],
  en: ['Searching OS commands in PATH is security-sensitive', 'A command given without a path is looked up in the PATH directories; whoever can write to one of them earlier in the list decides what actually runs.', 'Run commands through an absolute path from trusted configuration.'],
  ko: ['PATH에서 OS 명령을 찾는 것은 보안에 민감합니다', '경로 없이 준 명령은 PATH 폴더에서 찾으므로 목록 앞쪽 폴더에 쓸 수 있는 사람이 실제로 실행될 프로그램을 정합니다.', '신뢰할 수 있는 설정의 절대 경로로 명령을 실행하세요.'],
  msg: ['Make sure the "PATH" lookup used to find "{0}" is safe here.', '"{0}"을(를) 찾는 PATH 검색이 안전한지 확인하세요.'],
  on: {
    Call(n, cx) {
      let c = null;
      if (n.id === 'exec' && n.o && n.args.length && /Runtime|getRuntime/.test(cx.text(n.o))) c = relativeCommand(cx, n.args[0]);
      else if (cx.kt && n.id === 'ProcessBuilder' && n.args.length) c = relativeCommand(cx, n.args.length === 1 ? n.args[0] : n.args[0]);
      else if (n.id === 'command' && n.o && n.args.length && /ProcessBuilder/.test(cx.typeOf(n.o) || '')) c = relativeCommand(cx, n.args[0]);
      if (c) cx.report(n, [c]);
    },
    New(n, cx) {
      if (A.ctorType(n) !== 'ProcessBuilder' || !n.args.length) return;
      const c = relativeCommand(cx, n.args[0]);
      if (c) cx.report(n, [c]);
    },
  },
  bad: {
    java: jm(`    Process p = Runtime.getRuntime().exec("make install"); // Noncompliant
    ProcessBuilder pb = new ProcessBuilder("git", "status"); // Noncompliant`),
    kt: km(`    val p = ProcessBuilder("ls", "-l").start() // Noncompliant`),
  },
  good: {
    java: jm(`    Process p = Runtime.getRuntime().exec("/usr/bin/make install");
    ProcessBuilder pb = new ProcessBuilder("/usr/bin/git", "status");`),
    kt: km(`    val p = ProcessBuilder("/bin/ls", "-l").start()`),
  },
});

// ── Android ──
function boolSetting(n, cx, setters, props) {
  if (n.k === 'Call' && setters.includes(n.id) && n.args.length === 1 && A.isBoolLit(n.args[0], true)) return n.id;
  if (n.k === 'Assign') {
    const t = A.strip(n.t);
    if (t && t.k === 'Sel' && props.includes(t.id) && A.isBoolLit(n.v, true)) return t.id;
  }
  return null;
}

rule({
  id: 'webview-javascript-enabled', langs: JK, type: 'H', sev: 'MI', debt: 5, tags: ['cwe-79', 'android'], sonar: 'S6362', ktSonar: 'S6362', owasp: ['A03'],
  en: ['Enabling JavaScript support for WebViews is security-sensitive', 'JavaScript in a WebView that shows untrusted or remote content opens the app to cross-site scripting and, with JavaScript interfaces, to code running with the app\'s rights.', 'Enable JavaScript only for WebViews that load trusted content, and never together with addJavascriptInterface on remote pages.'],
  ko: ['WebView의 자바스크립트를 켜는 것은 보안에 민감합니다', '신뢰할 수 없거나 원격 콘텐츠를 보여 주는 WebView에서 자바스크립트를 켜면 XSS에 노출되고 자바스크립트 인터페이스가 있으면 앱 권한으로 코드가 실행됩니다.', '신뢰할 수 있는 콘텐츠를 여는 WebView에서만 켜고 원격 페이지에 addJavascriptInterface와 함께 쓰지 마세요.'],
  on: {
    Call(n, cx) { if (boolSetting(n, cx, ['setJavaScriptEnabled'], [])) cx.report(n); },
    Assign(n, cx) { if (boolSetting(n, cx, [], ['javaScriptEnabled'])) cx.report(n); },
  },
  bad: {
    java: jm(`    android.webkit.WebView w = new android.webkit.WebView(null);
    w.getSettings().setJavaScriptEnabled(true); // Noncompliant`),
    kt: km(`    val w = WebView(null)
    w.settings.javaScriptEnabled = true // Noncompliant`),
  },
  good: {
    java: jm(`    android.webkit.WebView w = new android.webkit.WebView(null);
    w.getSettings().setJavaScriptEnabled(false);`),
    kt: km(`    val w = WebView(null)
    w.settings.javaScriptEnabled = false`),
  },
});

const FILE_ACCESS = ['setAllowFileAccess', 'setAllowFileAccessFromFileURLs', 'setAllowUniversalAccessFromFileURLs', 'setAllowContentAccess'];
const FILE_ACCESS_PROPS = ['allowFileAccess', 'allowFileAccessFromFileURLs', 'allowUniversalAccessFromFileURLs', 'allowContentAccess'];

rule({
  id: 'webview-file-access', langs: JK, type: 'H', sev: 'MI', debt: 5, tags: ['cwe-73', 'android'], sonar: 'S6363', ktSonar: 'S6363', owasp: ['A01'],
  en: ['Enabling file access for WebViews is security-sensitive', 'File and content access lets pages loaded in the WebView read app-private files and, with file URL access, send them to other origins.', 'Leave file and content access disabled and serve local content through WebViewAssetLoader.'],
  ko: ['WebView의 파일 접근을 켜는 것은 보안에 민감합니다', '파일·콘텐츠 접근을 켜면 WebView에 열린 페이지가 앱 전용 파일을 읽고 파일 URL 접근이 있으면 다른 출처로 보낼 수 있습니다.', '파일·콘텐츠 접근은 끈 채로 두고 로컬 콘텐츠는 WebViewAssetLoader로 제공하세요.'],
  msg: ['Make sure that enabling "{0}" is safe here.', '여기서 "{0}"을(를) 켜도 안전한지 확인하세요.'],
  on: {
    Call(n, cx) { const s = boolSetting(n, cx, FILE_ACCESS, []); if (s) cx.report(n, [s]); },
    Assign(n, cx) { const s = boolSetting(n, cx, [], FILE_ACCESS_PROPS); if (s) cx.report(n, [s]); },
  },
  bad: {
    java: jm(`    android.webkit.WebSettings ws = new android.webkit.WebView(null).getSettings();
    ws.setAllowFileAccess(true); // Noncompliant
    ws.setAllowUniversalAccessFromFileURLs(true); // Noncompliant`),
    kt: km(`    val ws = WebView(null).settings
    ws.allowContentAccess = true // Noncompliant`),
  },
  good: {
    java: jm(`    android.webkit.WebSettings ws = new android.webkit.WebView(null).getSettings();
    ws.setAllowFileAccess(false);`),
    kt: km(`    val ws = WebView(null).settings
    ws.allowContentAccess = false`),
  },
});

const EXT_STORAGE = ['getExternalStorageDirectory', 'getExternalStoragePublicDirectory', 'getExternalFilesDir', 'getExternalFilesDirs', 'getExternalCacheDir', 'getExternalCacheDirs', 'getExternalMediaDirs', 'getObbDir', 'getObbDirs'];
const EXT_STORAGE_PROPS = ['externalCacheDir', 'externalCacheDirs', 'externalMediaDirs', 'obbDir', 'obbDirs', 'externalStorageDirectory'];

rule({
  id: 'android-external-storage', langs: JK, type: 'H', sev: 'CR', debt: 15, tags: ['cwe-312', 'cwe-922', 'android'], sonar: 'S5324', ktSonar: 'S5324', owasp: ['A04'],
  en: ['Accessing Android external storage is security-sensitive', 'Files on external storage can be read and replaced by other apps and by the user, so they are neither confidential nor trustworthy.', 'Keep sensitive data in internal storage and validate anything read back from external storage.'],
  ko: ['안드로이드 외부 저장소 접근은 보안에 민감합니다', '외부 저장소의 파일은 다른 앱과 사용자가 읽고 바꿀 수 있어 기밀도 아니고 믿을 수도 없습니다.', '민감한 데이터는 내부 저장소에 두고 외부 저장소에서 읽은 값은 검증하세요.'],
  on: {
    Call(n, cx) { if (EXT_STORAGE.includes(n.id)) cx.report(n); },
    Sel(n, cx) {
      if (!cx.kt || !EXT_STORAGE_PROPS.includes(n.id)) return;
      const p = cx.parent(1);
      if (p && p.k === 'Call' && p.o === n) return;
      cx.report(n);
    },
  },
  bad: {
    java: jc(`  java.io.File dir(android.content.Context ctx) {
    return ctx.getExternalFilesDir(null); // Noncompliant
  }`),
    kt: kc(`  fun dir(ctx: Context): File? = ctx.externalCacheDir // Noncompliant`),
  },
  good: {
    java: jc(`  java.io.File dir(android.content.Context ctx) {
    return ctx.getFilesDir();
  }`),
    kt: kc(`  fun dir(ctx: Context): File = ctx.filesDir`),
  },
});

rule({
  id: 'android-broadcast-without-permission', langs: JK, type: 'H', sev: 'CR', debt: 15, tags: ['cwe-927', 'android'], sonar: 'S5320', ktSonar: 'S5320', owasp: ['A01'],
  en: ['Broadcasting intents is security-sensitive', 'An implicit broadcast without a receiver permission is delivered to every app that registers for it, including malicious ones.', 'Pass a receiver permission, target a specific package, or use a local/in-process mechanism.'],
  ko: ['인텐트 브로드캐스트는 보안에 민감합니다', '수신 권한 없는 브로드캐스트는 그것을 등록한 모든 앱(악성 앱 포함)에 전달됩니다.', '수신 권한을 주거나 특정 패키지를 지정하거나 로컬/프로세스 내부 방식을 쓰세요.'],
  on: {
    Call(n, cx) {
      const recv = n.o ? cx.text(n.o) : '';
      if (/LocalBroadcastManager|localBroadcast/i.test(recv)) return;
      if ((n.id === 'sendBroadcast' && n.args.length === 1) || (n.id === 'sendBroadcastAsUser' && n.args.length === 2) ||
        /^sendSticky(Ordered)?Broadcast(AsUser)?$/.test(n.id) || (n.id === 'sendOrderedBroadcast' && n.args.length >= 2 && A.isNull(n.args[1]))) cx.report(n);
    },
  },
  bad: {
    java: jc(`  void m(android.content.Context ctx, android.content.Intent intent) {
    ctx.sendBroadcast(intent); // Noncompliant
  }`),
    kt: kc(`  fun m(ctx: Context, intent: Intent) {
    ctx.sendStickyBroadcast(intent) // Noncompliant
  }`),
  },
  good: {
    java: jc(`  void m(android.content.Context ctx, android.content.Intent intent) {
    ctx.sendBroadcast(intent, "com.example.permission.RECEIVE");
  }`),
    kt: kc(`  fun m(ctx: Context, intent: Intent) {
    ctx.sendBroadcast(intent, "com.example.permission.RECEIVE")
  }`),
  },
});

module.exports = { str, num, varName, assignedVar, scopeOf, callsOn, propSets, configured, constBytes, localInit, chainIds, onCtor };
