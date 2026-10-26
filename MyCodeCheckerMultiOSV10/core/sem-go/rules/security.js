'use strict';

// Security rules: credentials, crypto, TLS, HTTP servers and clients,
// cookies, file permissions. Injection flows live in core/taint.

const { rule, gf } = require('./core');
const A = require('../ast');
const H = require('./h');

// composite literal of a type from a given package path: tls.Config, http.Cookie ...
function litOf(n, pkgPath, typeName) {
  if (n.k !== 'CompositeLit' || !n.type) return false;
  const t = A.strip(n.type);
  if (!t || t.k !== 'Selector' || t.sel.name !== typeName) return false;
  const x = A.strip(t.x);
  return !!x && x.k === 'Ident' && x.sym && x.sym.kind === 'pkg' && x.sym.path === pkgPath;
}
function field(n, name) {
  for (const e of n.elts) if (e.k === 'KeyValue' && A.isIdent(e.key, name)) return e;
  return null;
}
function isTrue(e) { e = A.strip(e); return !!e && e.k === 'Ident' && e.name === 'true'; }

// ── credentials ──
const CRED_NAME = /(password|passwd|pwd|passphrase|secret|apikey|api_key|accesskey|access_key|privatekey|private_key|authtoken|auth_token)$/i;
function credName(name) {
  return !!name && CRED_NAME.test(name.replace(/[^A-Za-z0-9_]/g, '')) && !/(^|_)(file|path|env|field|key_?name|prompt|label|hint|header|policy|regex|pattern|length|len|min|max|url|type)/i.test(name);
}
function credValue(e) {
  e = A.strip(e);
  if (!e || e.k !== 'BasicLit' || e.kind !== 'string') return false;
  const v = e.s || '';
  if (v.length < 2 || /\s/.test(v) || /^\$\{?\w+\}?$|^%[sv]$|^<.*>$|^\*+$|^x+$/i.test(v)) return false;
  return true;
}
rule({
  id: 'hardcoded-credentials', type: 'H', sev: 'BL', debt: 30, tags: ['cwe-798', 'cwe-259', 'owasp-a07'], sonar: 'S2068',
  en: ['Credentials should not be hard-coded', 'Passwords and secrets in source code end up in version control and binaries where anyone can read them.', 'Load them from the environment, a secret store or a configuration file outside the repository.'],
  ko: ['자격 증명을 코드에 박아 두면 안 됩니다', '소스 코드의 비밀번호와 비밀 값은 버전 관리와 실행 파일에 남아 누구나 읽을 수 있습니다.', '환경 변수, 비밀 저장소, 저장소 밖 설정 파일에서 읽으세요.'],
  on: {
    Assign(n, cx) {
      n.lhs.forEach((l, i) => {
        const x = A.strip(l);
        const name = x && (x.k === 'Ident' ? x.name : x.k === 'Selector' ? x.sel.name : null);
        if (credName(name) && n.rhs.length === n.lhs.length && credValue(n.rhs[i])) cx.report(n.rhs[i], `'${name}' is assigned a hard-coded credential; review this.`, `'${name}'에 자격 증명을 직접 적어 대입합니다. 검토하세요.`);
      });
    },
    VarSpec(n, cx) {
      n.names.forEach((nm, i) => {
        if (credName(nm.name) && n.values.length === n.names.length && credValue(n.values[i])) cx.report(n.values[i], `'${nm.name}' is initialised with a hard-coded credential; review this.`, `'${nm.name}'을(를) 직접 적은 자격 증명으로 초기화합니다. 검토하세요.`);
      });
    },
    KeyValue(n, cx) {
      const k = A.strip(n.key);
      const name = k && (k.k === 'Ident' ? k.name : (k.k === 'BasicLit' && k.kind === 'string' ? k.s : null));
      if (credName(name) && credValue(n.value)) cx.report(n.value, `'${name}' is set to a hard-coded credential; review this.`, `'${name}'에 자격 증명을 직접 적어 넣습니다. 검토하세요.`);
    },
    BasicLit(n, cx) {
      if (n.kind !== 'string') return;
      const v = n.s || '';
      if (/\b(password|pwd|passwd)=[^&;\s'"%{}$]{2,}/i.test(v) || /^[a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:[^/\s@{}$]{2,}@/i.test(v)) cx.report(n, 'This string contains a hard-coded password; review this.', '이 문자열에 비밀번호가 직접 들어 있습니다. 검토하세요.');
    },
  },
  bad: gf(`
type dbConf struct{ User, Password string }

func connect() (string, dbConf) {
	password := "s3cr3t!" // Noncompliant
	dsn := "postgres://admin:hunter22@db:5432/app" // Noncompliant
	_ = password
	return dsn, dbConf{User: "app", Password: "pa55word"} // Noncompliant
}
`),
  good: gf(`
import "os"

type dbConf struct{ User, Password string }

func connect() (string, dbConf) {
	password := os.Getenv("DB_PASSWORD")
	passwordFile := "/run/secrets/db"
	_ = passwordFile
	return "postgres://db:5432/app", dbConf{User: "app", Password: password}
}
`),
});

rule({
  id: 'hardcoded-ip', type: 'H', sev: 'MI', debt: 30, tags: ['cwe-547'], sonar: 'S1313',
  en: ['IP addresses should not be hard-coded', 'Hard-coded addresses need a rebuild to change and can expose infrastructure details.', 'Read the address from configuration.'],
  ko: ['IP 주소를 코드에 박아 두면 안 됩니다', '직접 적은 주소는 바꾸려면 다시 빌드해야 하고 인프라 정보를 드러낼 수 있습니다.', '주소를 설정에서 읽으세요.'],
  on: {
    BasicLit(n, cx) {
      if (n.kind !== 'string') return;
      const v = (n.s || '').trim();
      const m = /^(?:[a-z]+:\/\/)?((\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3}))(:\d{1,5})?(\/.*)?$/.exec(v);
      if (!m) return;
      const oct = [m[2], m[3], m[4], m[5]].map(Number);
      if (oct.some((o) => o > 255)) return;
      if (oct[0] === 127 || oct[0] === 0 || m[1] === '255.255.255.255' || (oct[0] === 192 && oct[1] === 0 && oct[2] === 2) || (oct[0] === 198 && (oct[1] === 51 || oct[1] === 18 || oct[1] === 19)) || (oct[0] === 203 && oct[1] === 0 && oct[2] === 113)) return;
      if (/^\d+\.\d+\.\d+\.\d+$/.test(v) && cx.pf.isTest) return;
      cx.report(n, `Make sure using the hard-coded IP address '${m[1]}' is safe here.`, `직접 적은 IP 주소 '${m[1]}'을(를) 여기서 써도 안전한지 확인하세요.`);
    },
  },
  bad: gf(`
func addr() string {
	return "10.0.12.7:8080" // Noncompliant
}
`),
  good: gf(`
import "os"

func addr() string {
	if a := os.Getenv("ADDR"); a != "" {
		return a
	}
	return "127.0.0.1:8080"
}
`),
});

// ── crypto ──
rule({
  id: 'weak-hash', type: 'H', sev: 'CR', debt: 30, tags: ['cwe-328', 'cwe-327', 'owasp-a02'], sonar: 'S4790',
  en: ['Weak hashing algorithms should not be used for security', 'MD5 and SHA-1 are broken for collision resistance.', 'Use SHA-256 or stronger; for passwords use bcrypt, scrypt or argon2.'],
  ko: ['보안 용도로 약한 해시 알고리즘을 쓰면 안 됩니다', 'MD5와 SHA-1은 충돌 저항성이 깨졌습니다.', 'SHA-256 이상을 쓰고, 비밀번호에는 bcrypt, scrypt, argon2를 쓰세요.'],
  on: {
    Call(n, cx) {
      const q = H.q(n);
      if (q && /^crypto\/(md5|sha1)\.(New|Sum)$/.test(q)) cx.report(n, `Make sure that hashing with ${q.split('/')[1].split('.')[0].toUpperCase()} is safe here.`, `${q.split('/')[1].split('.')[0].toUpperCase()}로 해시해도 안전한지 확인하세요.`);
    },
  },
  bad: gf(`
import "crypto/md5"

func digest(b []byte) [16]byte {
	return md5.Sum(b) // Noncompliant
}
`),
  good: gf(`
import "crypto/sha256"

func digest(b []byte) [32]byte {
	return sha256.Sum256(b)
}
`),
});

rule({
  id: 'weak-cipher', type: 'V', sev: 'CR', debt: 30, tags: ['cwe-327', 'owasp-a02'], sonar: 'S5547',
  en: ['Cipher algorithms should be robust', 'DES, 3DES, RC4 and Blowfish are weak and can be broken.', 'Use AES (GCM) or ChaCha20-Poly1305.'],
  ko: ['암호 알고리즘은 튼튼해야 합니다', 'DES, 3DES, RC4, Blowfish는 약해서 깨질 수 있습니다.', 'AES(GCM)나 ChaCha20-Poly1305를 쓰세요.'],
  on: {
    Call(n, cx) {
      const q = H.q(n);
      if (q && (/^crypto\/(des|rc4)\.New/.test(q) || /blowfish\.NewCipher$/.test(q))) cx.report(n, `'${q}' uses a weak cipher algorithm.`, `'${q}'은(는) 약한 암호 알고리즘을 씁니다.`);
    },
  },
  bad: gf(`
import "crypto/des"

func enc(key []byte) {
	c, _ := des.NewCipher(key) // Noncompliant
	_ = c
}
`),
  good: gf(`
import "crypto/aes"

func enc(key []byte) {
	c, _ := aes.NewCipher(key)
	_ = c
}
`),
});

rule({
  id: 'weak-rsa-key', type: 'V', sev: 'CR', debt: 5, tags: ['cwe-326', 'owasp-a02'], sonar: 'S4426',
  en: ['Cryptographic keys should be robust', 'RSA keys shorter than 2048 bits can be factored.', 'Generate keys of at least 2048 bits.'],
  ko: ['암호 키는 튼튼해야 합니다', '2048비트보다 짧은 RSA 키는 인수분해될 수 있습니다.', '2048비트 이상의 키를 만드세요.'],
  on: {
    Call(n, cx) {
      if (H.q(n) !== 'crypto/rsa.GenerateKey' || n.args.length < 2) return;
      const bits = H.numVal(n.args[1]);
      if (bits != null && bits < 2048) cx.report(n.args[1], `Use a key length of at least 2048 bits instead of ${bits}.`, `${bits}비트 대신 2048비트 이상의 키 길이를 쓰세요.`);
    },
  },
  bad: gf(`
import (
	"crypto/rand"
	"crypto/rsa"
)

func key() (*rsa.PrivateKey, error) {
	return rsa.GenerateKey(rand.Reader, 1024) // Noncompliant
}
`),
  good: gf(`
import (
	"crypto/rand"
	"crypto/rsa"
)

func key() (*rsa.PrivateKey, error) {
	return rsa.GenerateKey(rand.Reader, 3072)
}
`),
});

rule({
  id: 'insecure-random', type: 'H', sev: 'CR', debt: 10, tags: ['cwe-338', 'cwe-330', 'owasp-a02'], sonar: 'S2245',
  en: ['Pseudorandom number generators should not be used for security', 'math/rand is predictable; tokens, keys and nonces built from it can be guessed.', 'Use crypto/rand for anything security-sensitive.'],
  ko: ['보안 용도로 의사 난수 생성기를 쓰면 안 됩니다', 'math/rand는 예측할 수 있어 이것으로 만든 토큰, 키, nonce는 추측될 수 있습니다.', '보안에 민감한 값에는 crypto/rand를 쓰세요.'],
  on: {
    Call(n, cx) {
      const q = H.q(n);
      if (q && /^math\/rand(\/v2)?\./.test(q)) cx.report(n, `Make sure that using the pseudorandom '${q.replace(/^math\//, '')}' is safe here.`, `의사 난수 '${q.replace(/^math\//, '')}'을(를) 여기서 써도 안전한지 확인하세요.`);
    },
  },
  bad: gf(`
import "math/rand"

func token() int {
	return rand.Intn(1000000) // Noncompliant
}
`),
  good: gf(`
import (
	"crypto/rand"
	"math/big"
)

func token() (*big.Int, error) {
	return rand.Int(rand.Reader, big.NewInt(1000000))
}
`),
});

// ── TLS ──
rule({
  id: 'tls-min-version', type: 'V', sev: 'CR', debt: 5, tags: ['cwe-327', 'owasp-a02'], sonar: 'S4423',
  en: ['Weak SSL/TLS protocols should not be used', 'SSL 3.0, TLS 1.0 and TLS 1.1 have known weaknesses.', 'Set MinVersion to tls.VersionTLS12 or higher.'],
  ko: ['약한 SSL/TLS 프로토콜을 쓰면 안 됩니다', 'SSL 3.0, TLS 1.0, TLS 1.1에는 알려진 약점이 있습니다.', 'MinVersion을 tls.VersionTLS12 이상으로 정하세요.'],
  on: {
    KeyValue(n, cx) {
      if (!A.isIdent(n.key, 'MinVersion') && !A.isIdent(n.key, 'MaxVersion')) return;
      const v = A.strip(n.value);
      const name = v && v.k === 'Selector' ? v.sel.name : '';
      const num = H.numVal(v);
      if (/^Version(SSL30|TLS10|TLS11)$/.test(name) || (num != null && num > 0 && num < 0x0303)) cx.report(n.value, `Change this code to use TLS 1.2 or higher instead of '${cx.norm(n.value)}'.`, `'${cx.norm(n.value)}' 대신 TLS 1.2 이상을 쓰도록 고치세요.`);
    },
  },
  bad: gf(`
import "crypto/tls"

func conf() *tls.Config {
	return &tls.Config{MinVersion: tls.VersionTLS10} // Noncompliant
}
`),
  good: gf(`
import "crypto/tls"

func conf() *tls.Config {
	return &tls.Config{MinVersion: tls.VersionTLS12}
}
`),
});

rule({
  id: 'tls-skip-verify', type: 'V', sev: 'CR', debt: 5, tags: ['cwe-295', 'owasp-a07'], sonar: 'S4830',
  en: ['Server certificates should be verified during SSL/TLS connections', 'InsecureSkipVerify accepts any certificate and allows man-in-the-middle attacks.', 'Remove InsecureSkipVerify; configure RootCAs for private CAs.'],
  ko: ['SSL/TLS 연결에서 서버 인증서를 검증해야 합니다', 'InsecureSkipVerify는 아무 인증서나 받아들여 중간자 공격을 허용합니다.', 'InsecureSkipVerify를 지우고, 사설 CA라면 RootCAs를 설정하세요.'],
  on: {
    KeyValue(n, cx) {
      if (A.isIdent(n.key, 'InsecureSkipVerify') && isTrue(n.value)) cx.report(n, 'Enable server certificate validation on this TLS configuration.', '이 TLS 설정에서 서버 인증서 검증을 켜세요.');
    },
    Assign(n, cx) {
      n.lhs.forEach((l, i) => {
        const x = A.strip(l);
        if (x && x.k === 'Selector' && x.sel.name === 'InsecureSkipVerify' && isTrue(n.rhs[i])) cx.report(l, 'Enable server certificate validation on this TLS configuration.', '이 TLS 설정에서 서버 인증서 검증을 켜세요.');
      });
    },
  },
  bad: gf(`
import "crypto/tls"

func conf() *tls.Config {
	c := &tls.Config{InsecureSkipVerify: true} // Noncompliant
	c.InsecureSkipVerify = true // Noncompliant
	return c
}
`),
  good: gf(`
import "crypto/tls"

func conf() *tls.Config {
	return &tls.Config{MinVersion: tls.VersionTLS12}
}
`),
});

// ── HTTP ──
rule({
  id: 'http-server-timeouts', type: 'V', sev: 'MA', debt: 10, tags: ['cwe-400', 'owasp-a05'], sonar: '',
  en: ['HTTP servers should set read timeouts', 'A server without ReadHeaderTimeout/ReadTimeout can be exhausted by slow clients (Slowloris).', 'Use an http.Server with ReadHeaderTimeout (and ReadTimeout/WriteTimeout).'],
  ko: ['HTTP 서버는 읽기 시간 제한을 정해야 합니다', 'ReadHeaderTimeout/ReadTimeout이 없는 서버는 느린 클라이언트(Slowloris)에 자원이 고갈될 수 있습니다.', 'ReadHeaderTimeout(과 ReadTimeout/WriteTimeout)을 정한 http.Server를 쓰세요.'],
  on: {
    Call(n, cx) {
      const q = H.q(n);
      if (q === 'net/http.ListenAndServe' || q === 'net/http.ListenAndServeTLS' || q === 'net/http.Serve') cx.report(n, `'${q.replace('net/', '')}' starts a server without timeouts; use an http.Server with ReadHeaderTimeout.`, `'${q.replace('net/', '')}'은(는) 시간 제한 없는 서버를 시작합니다. ReadHeaderTimeout을 정한 http.Server를 쓰세요.`);
    },
    CompositeLit(n, cx) {
      if (!litOf(n, 'net/http', 'Server')) return;
      if (!field(n, 'ReadHeaderTimeout') && !field(n, 'ReadTimeout')) cx.report(n, 'This http.Server has no ReadHeaderTimeout or ReadTimeout.', '이 http.Server에는 ReadHeaderTimeout이나 ReadTimeout이 없습니다.');
    },
  },
  bad: gf(`
import "net/http"

func serve(h http.Handler) error {
	s := &http.Server{Addr: ":8080", Handler: h} // Noncompliant
	go s.ListenAndServe()
	return http.ListenAndServe(":9090", h) // Noncompliant
}
`),
  good: gf(`
import (
	"net/http"
	"time"
)

func serve(h http.Handler) error {
	s := &http.Server{Addr: ":8080", Handler: h, ReadHeaderTimeout: 5 * time.Second}
	return s.ListenAndServe()
}
`),
});

rule({
  id: 'http-client-timeout', type: 'B', sev: 'MA', debt: 5, tags: ['cwe-400'], sonar: '',
  en: ['HTTP clients should set a timeout', 'An http.Client without Timeout waits forever on a stalled server.', 'Set Timeout on the client (or use contexts with deadlines).'],
  ko: ['HTTP 클라이언트는 시간 제한을 정해야 합니다', 'Timeout이 없는 http.Client는 멈춘 서버를 영원히 기다립니다.', '클라이언트에 Timeout을 정하세요(또는 기한 있는 컨텍스트를 쓰세요).'],
  on: {
    CompositeLit(n, cx) {
      if (litOf(n, 'net/http', 'Client') && !field(n, 'Timeout')) cx.report(n, 'This http.Client has no Timeout.', '이 http.Client에는 Timeout이 없습니다.');
    },
  },
  bad: gf(`
import "net/http"

var client = &http.Client{} // Noncompliant
`),
  good: gf(`
import (
	"net/http"
	"time"
)

var client = &http.Client{Timeout: 10 * time.Second}
`),
});

function cookieRule(id, sonar, fieldName, en, ko) {
  rule({
    id, type: 'H', sev: 'MI', debt: 5, tags: id === 'cookie-secure' ? ['cwe-614', 'cwe-311', 'owasp-a05'] : ['cwe-1004', 'owasp-a05'], sonar,
    en, ko,
    on: {
      CompositeLit(n, cx) {
        if (!litOf(n, 'net/http', 'Cookie')) return;
        const f = field(n, fieldName);
        if (!f || !isTrue(f.value)) cx.report(n, `Make sure creating this cookie without the '${fieldName}' flag is safe.`, `'${fieldName}' 플래그 없이 이 쿠키를 만들어도 안전한지 확인하세요.`);
      },
    },
    bad: gf(`
import "net/http"

func set(w http.ResponseWriter, v string) {
	http.SetCookie(w, &http.Cookie{Name: "session", Value: v}) // Noncompliant
}
`),
    good: gf(`
import "net/http"

func set(w http.ResponseWriter, v string) {
	http.SetCookie(w, &http.Cookie{Name: "session", Value: v, Secure: true, HttpOnly: true})
}
`),
  });
}
cookieRule('cookie-secure', 'S2092', 'Secure',
  ['Cookies should be "secure"', 'Without Secure the cookie is also sent over plain HTTP and can be intercepted.', 'Set Secure: true.'],
  ['쿠키는 "Secure"여야 합니다', 'Secure가 없으면 쿠키가 평문 HTTP로도 전송되어 가로챌 수 있습니다.', 'Secure: true를 정하세요.']);
cookieRule('cookie-httponly', 'S3330', 'HttpOnly',
  ['Creating cookies without the "HttpOnly" flag is security-sensitive', 'Without HttpOnly scripts can read the cookie, which makes session theft through XSS easier.', 'Set HttpOnly: true.'],
  ['"HttpOnly" 플래그 없이 쿠키를 만드는 것은 보안에 민감합니다', 'HttpOnly가 없으면 스크립트가 쿠키를 읽을 수 있어 XSS로 세션을 훔치기 쉬워집니다.', 'HttpOnly: true를 정하세요.']);

rule({
  id: 'clear-text-url', type: 'H', sev: 'CR', debt: 5, tags: ['cwe-319', 'owasp-a02'], sonar: 'S5332',
  en: ['Using clear-text protocols is security-sensitive', 'http://, ftp:// and telnet:// transmit data without encryption.', 'Use https:// (or another encrypted protocol).'],
  ko: ['평문 프로토콜을 쓰는 것은 보안에 민감합니다', 'http://, ftp://, telnet://은 데이터를 암호화하지 않고 보냅니다.', 'https://(또는 다른 암호화 프로토콜)를 쓰세요.'],
  on: {
    BasicLit(n, cx) {
      if (n.kind !== 'string') return;
      const m = /^(http|ftp|telnet):\/\/([^/:?#\s]*)/i.exec(n.s || '');
      if (!m) return;
      const host = m[2].toLowerCase();
      if (!host || /^(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|\[::1\]|::1)$/.test(host) || /(^|\.)(example\.(com|org|net)|test|local|localhost|invalid)$/.test(host)) return;
      if (/^https?:\/\/(www\.)?w3\.org\//i.test(n.s) || /xmlns|schemas?\./i.test(n.s)) return;
      cx.report(n, `Make sure that using the clear-text protocol '${m[1].toLowerCase()}' is safe here.`, `평문 프로토콜 '${m[1].toLowerCase()}'을(를) 여기서 써도 안전한지 확인하세요.`);
    },
  },
  bad: gf(`
const api = "http://api.payments.io/v1" // Noncompliant
`),
  good: gf(`
const api = "https://api.payments.io/v1"
const local = "http://localhost:8080"
`),
});

rule({
  id: 'cors-wildcard', type: 'H', sev: 'MI', debt: 5, tags: ['cwe-346', 'cwe-942', 'owasp-a05'], sonar: 'S5122',
  en: ['Having a permissive Cross-Origin Resource Sharing policy is security-sensitive', 'Access-Control-Allow-Origin: * lets any web site read the responses.', 'Allow only the origins that need access.'],
  ko: ['허용 범위가 넓은 CORS 정책은 보안에 민감합니다', 'Access-Control-Allow-Origin: *는 아무 웹 사이트나 응답을 읽게 합니다.', '접근이 필요한 출처만 허용하세요.'],
  on: {
    Call(n, cx) {
      const f = A.strip(n.fun);
      if (!f || f.k !== 'Selector' || !['Set', 'Add'].includes(f.sel.name) || n.args.length !== 2) return;
      const k = A.strip(n.args[0]);
      const v = A.strip(n.args[1]);
      if (A.isStr(k) && /^access-control-allow-origin$/i.test(k.s) && A.isStr(v) && v.s.trim() === '*') cx.report(n, 'Make sure this permissive CORS policy is safe here.', '이렇게 넓게 허용하는 CORS 정책이 안전한지 확인하세요.');
    },
    KeyValue(n, cx) {
      if (!A.isIdent(n.key, 'AllowedOrigins') && !A.isIdent(n.key, 'AllowOrigins')) return;
      const v = A.strip(n.value);
      if (v && v.k === 'CompositeLit' && v.elts.some((e) => A.isStr(e) && A.strip(e).s === '*')) cx.report(n, 'Make sure this permissive CORS policy is safe here.', '이렇게 넓게 허용하는 CORS 정책이 안전한지 확인하세요.');
    },
  },
  bad: gf(`
import "net/http"

func h(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*") // Noncompliant
}
`),
  good: gf(`
import "net/http"

func h(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "https://app.example.com")
}
`),
});

rule({
  id: 'pprof-exposed', type: 'H', sev: 'MI', debt: 5, tags: ['cwe-489', 'cwe-215', 'owasp-a05'], sonar: 'S4507',
  en: ['Debug endpoints should not be exposed in production', 'Importing net/http/pprof registers profiling handlers on the default mux, which reveal internals and can be abused.', 'Serve pprof on a separate, internal-only listener, or remove the import.'],
  ko: ['운영 환경에 디버그 엔드포인트를 드러내면 안 됩니다', 'net/http/pprof를 가져오면 기본 mux에 프로파일링 핸들러가 등록되어 내부 정보를 드러내고 악용될 수 있습니다.', 'pprof는 내부 전용 별도 리스너에서 제공하거나 import를 지우세요.'],
  file(pf, cx) {
    for (const imp of pf.importNodes) if (imp.path === 'net/http/pprof') cx.report(imp.node, 'Make sure exposing the pprof debug endpoints is safe here.', 'pprof 디버그 엔드포인트를 드러내도 안전한지 확인하세요.');
  },
  bad: gf(`
import (
	"net/http"
	_ "net/http/pprof" // Noncompliant
)

var mux = http.DefaultServeMux
`),
  good: gf(`
import "net/http"

var mux = http.NewServeMux()
`),
});

rule({
  id: 'unsafe-usage', type: 'H', sev: 'MI', debt: 10, tags: ['cwe-242'], sonar: '',
  en: ['Using the unsafe package is security-sensitive', 'unsafe bypasses the type and memory safety of Go.', 'Avoid unsafe, or isolate and review every use.'],
  ko: ['unsafe 패키지를 쓰는 것은 보안에 민감합니다', 'unsafe는 Go의 타입 안전성과 메모리 안전성을 우회합니다.', 'unsafe를 피하거나 모든 사용을 격리하고 검토하세요.'],
  file(pf, cx) {
    for (const imp of pf.importNodes) if (imp.path === 'unsafe') cx.report(imp.node, 'Make sure that using the unsafe package is safe here.', 'unsafe 패키지를 여기서 써도 안전한지 확인하세요.');
  },
  bad: gf(`
import "unsafe" // Noncompliant

func size() uintptr {
	return unsafe.Sizeof(0)
}
`),
  good: gf(`
func size() int {
	return 8
}
`),
});

const PERM_ARG = {
  'os.WriteFile': 2, 'io/ioutil.WriteFile': 2, 'os.OpenFile': 2, 'os.Mkdir': 1, 'os.MkdirAll': 1, 'os.Chmod': 1,
};
rule({
  id: 'file-permissions', type: 'H', sev: 'MA', debt: 5, tags: ['cwe-732', 'cwe-266', 'owasp-a01'], sonar: 'S2612',
  en: ['File permissions should not grant access to everyone', 'Permissions that let "others" read or write expose the file to every local user.', 'Use 0600/0640 for files and 0700/0750 for directories.'],
  ko: ['파일 권한을 모두에게 주면 안 됩니다', '"기타 사용자"에게 읽기나 쓰기를 허용하면 모든 로컬 사용자에게 파일이 노출됩니다.', '파일은 0600/0640, 디렉터리는 0700/0750을 쓰세요.'],
  on: {
    Call(n, cx) {
      const q = H.q(n);
      const i = q ? PERM_ARG[q] : undefined;
      if (i === undefined || n.args.length <= i) return;
      const v = H.numVal(n.args[i]);
      if (v != null && (v & 0o007) !== 0) cx.report(n.args[i], `Make sure granting permission ${'0' + v.toString(8)} to others is safe here.`, `기타 사용자에게 권한 ${'0' + v.toString(8)}을(를) 주어도 안전한지 확인하세요.`);
    },
  },
  bad: gf(`
import "os"

func save(p string, b []byte) error {
	return os.WriteFile(p, b, 0666) // Noncompliant
}
`),
  good: gf(`
import "os"

func save(p string, b []byte) error {
	return os.WriteFile(p, b, 0600)
}
`),
});

rule({
  id: 'predictable-temp-file', type: 'H', sev: 'CR', debt: 10, tags: ['cwe-377', 'cwe-379', 'owasp-a01'], sonar: 'S5443',
  en: ['Using publicly writable directories is security-sensitive', 'Fixed names under /tmp can be pre-created or linked by other users.', 'Use os.CreateTemp / os.MkdirTemp.'],
  ko: ['누구나 쓸 수 있는 디렉터리를 쓰는 것은 보안에 민감합니다', '/tmp 아래의 고정된 이름은 다른 사용자가 미리 만들거나 링크할 수 있습니다.', 'os.CreateTemp / os.MkdirTemp를 쓰세요.'],
  on: {
    Call(n, cx) {
      const q = H.q(n);
      if (!q || !/^(os\.(Create|OpenFile|WriteFile|Mkdir|MkdirAll)|io\/ioutil\.WriteFile)$/.test(q) || !n.args.length) return;
      const s = A.strip(n.args[0]);
      if (A.isStr(s) && /^\/(tmp|var\/tmp|dev\/shm)\//.test(s.s)) cx.report(s, `Make sure that using the publicly writable path '${s.s}' is safe here.`, `누구나 쓸 수 있는 경로 '${s.s}'을(를) 여기서 써도 안전한지 확인하세요.`);
    },
  },
  bad: gf(`
import "os"

func scratch() (*os.File, error) {
	return os.Create("/tmp/app.lock") // Noncompliant
}
`),
  good: gf(`
import "os"

func scratch() (*os.File, error) {
	return os.CreateTemp("", "app-*.lock")
}
`),
});
