'use strict';

// Security rules and hotspots that do not need taint tracking: hard-coded
// secrets, weak cryptography, TLS settings, dynamic code execution, unsafe
// deserialization, OS commands, file permissions.

const { rule } = require('./core');
const A = require('../ast');
const H = require('./h');

const PASSWORD_NAME = /(?:^|_|-)(?:password|passwd|pwd|passphrase)(?:$|_|-)|^(?:password|passwd|pwd|passphrase)|(?:password|passwd|passphrase)$/i;
const SECRET_NAME = /(?:secret|token|api_?key|apikey|access_?key|auth_?key|private_?key|client_?secret)/i;

function assignedPairs(cx, fn) {
  // calls fn(nameNode, name, valueNode) for assignments and hash pairs
  for (const n of cx.all) {
    if (n.type === 'Assign' && n.op === '=') fn(n.target, H.targetName(n.target), n.value);
    else if (n.type === 'Pair') fn(n.key, H.targetName(n.key), n.value);
  }
}

const literalSecret = (v) => {
  const s = A.strValue(v);
  if (s == null || !s.trim()) return null;
  if (/^(?:<.*>|\*+|x+|changeme|\$\{.*\}|%\{.*\}|ENV\[.*\]|nil|null|none|password|secret|test|example)$/i.test(s.trim())) return null;
  return s;
};

rule({
  id: 'hard-coded-credentials', type: 'H', sev: 'BL', debt: 30, sonar: 'S2068', tags: ['cwe-798', 'owasp-a07', 'cert'],
  en: ['Hard-coded passwords are security-sensitive', 'A password written in source code ends up in version control, builds and logs where anyone with access can read it.', 'Load the password from an environment variable, Rails credentials or a secrets manager.'],
  ko: ['하드코딩된 비밀번호는 보안에 민감합니다', '소스 코드에 쓴 비밀번호는 버전 관리, 빌드, 로그에 남아 접근 권한이 있는 누구나 읽을 수 있습니다.', '환경 변수, Rails credentials, 비밀 관리 도구에서 비밀번호를 불러옵니다.'],
  msg: ['"{0}" detected here, make sure this is not a hard-coded credential.', '여기서 "{0}"가 발견되었습니다. 하드코딩된 자격 증명이 아닌지 확인합니다.'],
  file(cx) {
    assignedPairs(cx, (target, name, value) => {
      if (!name || !PASSWORD_NAME.test(name)) return;
      if (literalSecret(value) == null) return;
      cx.report(value, [name]);
    });
    for (const n of cx.all) {
      if (n.type !== 'Str' || n.interp || !n.value) continue;
      const m = /^[a-z][a-z0-9+.-]*:\/\/([^/\s:@]+):([^/\s@]+)@/i.exec(n.value);
      if (m && !/^(?:\*+|password|\$\{.*\}|%\{.*\})$/i.test(m[2])) cx.report(n, ['password in URL']);
    }
  },
  bad: `DB_PASSWORD = "s3cr3t!" # Noncompliant
config = { password: "hunter22" } # Noncompliant
URL = "postgres://admin:topsecret@db.local/app" # Noncompliant
`,
  good: `DB_PASSWORD = ENV.fetch("DB_PASSWORD")
config = { password: Rails.application.credentials.db_password }
URL = "postgres://db.local/app"
`,
});

rule({
  id: 'hard-coded-secret', type: 'H', sev: 'BL', debt: 30, sonar: 'S6418', tags: ['cwe-798', 'owasp-a07'],
  en: ['Hard-coded secrets are security-sensitive', 'API keys, tokens and private keys in source code leak through version control and builds.', 'Load the secret from the environment, Rails credentials or a secrets manager, and rotate the leaked value.'],
  ko: ['하드코딩된 비밀 값은 보안에 민감합니다', '소스 코드의 API 키, 토큰, 개인 키는 버전 관리와 빌드를 통해 새어 나갑니다.', '환경 변수, Rails credentials, 비밀 관리 도구에서 값을 불러오고 노출된 값은 교체합니다.'],
  msg: ['"{0}" detected here, make sure this is not a hard-coded secret.', '여기서 "{0}"가 발견되었습니다. 하드코딩된 비밀 값이 아닌지 확인합니다.'],
  file(cx) {
    assignedPairs(cx, (target, name, value) => {
      if (!name || !SECRET_NAME.test(name) || PASSWORD_NAME.test(name)) return;
      const s = literalSecret(value);
      if (s == null || s.length < 16 || /\s/.test(s)) return;
      if (!/[0-9]/.test(s) || !/[A-Za-z]/.test(s)) return;
      cx.report(value, [name]);
    });
  },
  bad: `Stripe.api_key = "sk_live_51HxQ2bE7ab39Zt8Lm0" # Noncompliant
`,
  good: `Stripe.api_key = ENV["STRIPE_API_KEY"]
TOKEN_HEADER = "X-Auth-Token"
`,
});

const IPV4 = /^(?:(?:https?|ftp|tcp|udp):\/\/)?((?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3})(?::\d+)?(?:\/.*)?$/;

rule({
  id: 'hard-coded-ip', type: 'H', sev: 'MI', debt: 30, sonar: 'S1313', tags: ['cert'],
  en: ['Using hard-coded IP addresses is security-sensitive', 'A literal IP address ties the code to one network layout and may expose an internal host.', 'Read the address from configuration or use a DNS name.'],
  ko: ['IP 주소를 하드코딩하는 것은 보안에 민감합니다', '리터럴 IP 주소는 코드를 특정 네트워크 구성에 묶고 내부 호스트를 드러낼 수 있습니다.', '주소를 설정에서 읽거나 DNS 이름을 씁니다.'],
  msg: ['Make sure using this hardcoded IP address "{0}" is safe here.', '하드코딩된 IP 주소 "{0}"를 여기서 써도 안전한지 확인합니다.'],
  on: {
    Str(n, cx) {
      if (n.interp || !n.value || cx.isTest) return;
      const m = IPV4.exec(n.value.trim());
      if (!m) return;
      const ip = m[1];
      if (/^(?:127\.|0\.0\.0\.0$|255\.255\.255\.255$|2\.5\.|1\.1\.1\.1$)/.test(ip)) return;
      if (n.parent && n.parent.type === 'Call' && /^(?:require|gem)$/.test(n.parent.name)) return;
      cx.report(n, [ip]);
    },
  },
  bad: `HOST = "10.0.4.21" # Noncompliant
`,
  good: `HOST = ENV.fetch("API_HOST", "127.0.0.1")
`,
});

const WEAK_DIGEST = /^(?:Digest::(?:MD5|SHA1|RMD160|MD4)|OpenSSL::Digest::(?:MD5|SHA1|MD4|RIPEMD160))$/;
const WEAK_DIGEST_NAME = /^(?:md5|md4|sha1|sha-1|ripemd160|rmd160)$/i;

rule({
  id: 'weak-hash', type: 'H', sev: 'CR', debt: 30, sonar: 'S4790', tags: ['cwe-328', 'owasp-a02'],
  en: ['Using weak hashing algorithms is security-sensitive', 'MD5 and SHA-1 have practical collision attacks and must not protect integrity or passwords.', 'Use SHA-256 or stronger; for passwords use bcrypt, scrypt or Argon2.'],
  ko: ['약한 해시 알고리즘을 쓰는 것은 보안에 민감합니다', 'MD5와 SHA-1은 실제 충돌 공격이 가능해 무결성이나 비밀번호 보호에 쓰면 안 됩니다.', 'SHA-256 이상을 쓰고, 비밀번호에는 bcrypt, scrypt, Argon2를 씁니다.'],
  msg: ['Make sure this weak hash algorithm ({0}) is not used in a sensitive context here.', '약한 해시 알고리즘({0})을 민감한 곳에 쓰지 않는지 확인합니다.'],
  on: {
    Call(n, cx) {
      const r = A.constPath(n.recv);
      if (r && WEAK_DIGEST.test(r)) { cx.report(n, [r.split('::').pop()]); return; }
      if ((r === 'OpenSSL::Digest' || r === 'OpenSSL::HMAC' || r === 'Digest') && /^(?:new|digest|hexdigest|base64digest)$/.test(n.name)) {
        const s = A.symOrStr(n.args[0]);
        if (s && WEAK_DIGEST_NAME.test(s)) cx.report(n, [s.toUpperCase()]);
      }
    },
  },
  bad: `def fingerprint(data)
  Digest::MD5.hexdigest(data) # Noncompliant
end
def mac(key, data) = OpenSSL::HMAC.hexdigest("SHA1", key, data) # Noncompliant
`,
  good: `def fingerprint(data)
  Digest::SHA256.hexdigest(data)
end
`,
});

const WEAK_CIPHER = /^(?:des|des3|des-ede|rc2|rc4|bf|blowfish|cast|cast5|idea|seed)(?:$|-)/i;

rule({
  id: 'weak-cipher', type: 'V', sev: 'CR', debt: 15, sonar: 'S5547', tags: ['cwe-327', 'owasp-a02'],
  en: ['Cipher algorithms should be robust', 'DES, 3DES, RC2, RC4 and Blowfish are broken or have too small keys/blocks.', 'Use AES (preferably AES-GCM) or ChaCha20-Poly1305.'],
  ko: ['암호 알고리즘은 견고해야 합니다', 'DES, 3DES, RC2, RC4, Blowfish는 깨졌거나 키나 블록이 너무 작습니다.', 'AES(가능하면 AES-GCM)나 ChaCha20-Poly1305를 씁니다.'],
  msg: ['Use a strong cipher algorithm instead of "{0}".', '"{0}" 대신 강한 암호 알고리즘을 씁니다.'],
  on: {
    Call(n, cx) {
      const r = A.constPath(n.recv);
      if (!r) return;
      if (r === 'OpenSSL::Cipher' && n.name === 'new') {
        const s = A.symOrStr(n.args[0]);
        if (s && WEAK_CIPHER.test(s)) cx.report(n, [s]);
        return;
      }
      const m = /^OpenSSL::Cipher::(DES|RC2|RC4|BF|CAST5|IDEA)$/.exec(r);
      if (m && n.name === 'new') cx.report(n, [m[1]]);
    },
  },
  bad: `def cipher
  OpenSSL::Cipher.new("des-cbc") # Noncompliant
end
`,
  good: `def cipher
  OpenSSL::Cipher.new("aes-256-gcm")
end
`,
});

rule({
  id: 'weak-cipher-mode', type: 'V', sev: 'CR', debt: 15, sonar: 'S5542', tags: ['cwe-327', 'owasp-a02'],
  en: ['Encryption algorithms should be used with secure mode and padding scheme', 'ECB mode encrypts equal blocks to equal output and leaks patterns of the plaintext.', 'Use an authenticated mode such as GCM, or CBC with a random IV and a MAC.'],
  ko: ['암호 알고리즘은 안전한 모드와 패딩으로 써야 합니다', 'ECB 모드는 같은 블록을 같은 결과로 암호화해 평문의 패턴을 드러냅니다.', 'GCM 같은 인증 모드나, 무작위 IV와 MAC을 쓰는 CBC를 씁니다.'],
  msg: ['Use a secure mode instead of ECB ("{0}").', 'ECB("{0}") 대신 안전한 모드를 씁니다.'],
  on: {
    Call(n, cx) {
      if (A.constPath(n.recv) !== 'OpenSSL::Cipher' || n.name !== 'new') return;
      const s = A.symOrStr(n.args[0]);
      if (s && /-ecb$/i.test(s)) cx.report(n, [s]);
    },
  },
  bad: `CIPHER = OpenSSL::Cipher.new("aes-128-ecb") # Noncompliant
`,
  good: `CIPHER = OpenSSL::Cipher.new("aes-128-gcm")
`,
});

const WEAK_TLS_SYM = /^(?:SSLv2|SSLv3|SSLv23|TLSv1|TLSv1_1|TLS1|TLS1_1)$/;
const WEAK_TLS_CONST = /(?:^|::)(?:SSL2_VERSION|SSL3_VERSION|TLS1_VERSION|TLS1_1_VERSION)$/;

rule({
  id: 'weak-tls', type: 'V', sev: 'CR', debt: 15, sonar: 'S4423', tags: ['cwe-327', 'owasp-a02'],
  en: ['Weak SSL/TLS protocols should not be used', 'SSLv2, SSLv3, TLS 1.0 and TLS 1.1 have known attacks and are deprecated.', 'Require TLS 1.2 or newer (min_version = OpenSSL::SSL::TLS1_2_VERSION).'],
  ko: ['약한 SSL/TLS 프로토콜을 쓰지 않아야 합니다', 'SSLv2, SSLv3, TLS 1.0, TLS 1.1은 알려진 공격이 있어 더 이상 권장되지 않습니다.', 'TLS 1.2 이상을 요구합니다(min_version = OpenSSL::SSL::TLS1_2_VERSION).'],
  msg: ['Change this code to use a stronger protocol than "{0}".', '"{0}"보다 강한 프로토콜을 쓰도록 이 코드를 고칩니다.'],
  file(cx) {
    const weak = (v) => {
      v = A.strip(v);
      if (!v) return null;
      if ((v.type === 'Sym' || v.type === 'Str') && WEAK_TLS_SYM.test(A.symOrStr(v) || '')) return A.symOrStr(v);
      const c = A.constPath(v);
      if (c && WEAK_TLS_CONST.test(c)) return c.split('::').pop();
      return null;
    };
    assignedPairs(cx, (target, name, value) => {
      if (!name || !/^(?:ssl_version|min_version|version)$/.test(name)) return;
      const w = weak(value);
      if (w) cx.report(value, [w]);
    });
    for (const n of cx.all) {
      if (n.type === 'Call' && A.constPath(n.recv) === 'OpenSSL::SSL::SSLContext' && n.name === 'new') {
        const w = weak(n.args[0]);
        if (w) cx.report(n.args[0], [w]);
      }
    }
  },
  bad: `ctx = OpenSSL::SSL::SSLContext.new
ctx.ssl_version = :TLSv1 # Noncompliant
http.min_version = OpenSSL::SSL::TLS1_1_VERSION # Noncompliant
`,
  good: `ctx = OpenSSL::SSL::SSLContext.new
ctx.min_version = OpenSSL::SSL::TLS1_2_VERSION
`,
});

const VERIFY_KEYS = /^(?:verify|ssl_verify|verify_ssl|ssl_verify_peer|verify_peer|ssl_verifypeer)$/;

rule({
  id: 'certificate-validation-disabled', type: 'V', sev: 'CR', debt: 5, sonar: 'S4830', tags: ['cwe-295', 'owasp-a07'],
  en: ['Server certificates should be verified during SSL/TLS connections', 'Turning off certificate verification lets any man-in-the-middle impersonate the server.', 'Keep VERIFY_PEER (the default) and install the right CA certificates instead.'],
  ko: ['SSL/TLS 연결에서는 서버 인증서를 검증해야 합니다', '인증서 검증을 끄면 중간자 누구나 서버를 사칭할 수 있습니다.', '기본값인 VERIFY_PEER를 유지하고 올바른 CA 인증서를 설치합니다.'],
  msg: ['Enable server certificate validation on this SSL/TLS connection.', '이 SSL/TLS 연결에서 서버 인증서 검증을 켭니다.'],
  file(cx) {
    for (const n of cx.all) {
      if (n.type === 'Const' && n.name === 'VERIFY_NONE') {
        const p = n.parent;
        if (p && p.type === 'Bin' && (p.op === '==' || p.op === '!=')) continue;
        cx.report(n);
      } else if (n.type === 'Pair' && n.value && n.value.type === 'False' && VERIFY_KEYS.test(H.targetName(n.key) || '')) {
        cx.report(n);
      } else if (n.type === 'Assign' && n.value && n.value.type === 'False' && VERIFY_KEYS.test(H.targetName(n.target) || '')) {
        cx.report(n);
      }
    }
  },
  bad: `http = Net::HTTP.new(host, 443)
http.verify_mode = OpenSSL::SSL::VERIFY_NONE # Noncompliant
conn = Faraday.new(url, ssl: { verify: false }) # Noncompliant
`,
  good: `http = Net::HTTP.new(host, 443)
http.verify_mode = OpenSSL::SSL::VERIFY_PEER
`,
});

rule({
  id: 'weak-random', type: 'H', sev: 'CR', debt: 10, sonar: 'S2245', tags: ['cwe-338', 'owasp-a02'],
  en: ['Using pseudorandom number generators (PRNGs) is security-sensitive', 'rand and Random are predictable and must not generate tokens, passwords or keys.', 'Use SecureRandom for anything security related.'],
  ko: ['의사 난수 생성기(PRNG)를 쓰는 것은 보안에 민감합니다', 'rand와 Random은 예측 가능해서 토큰, 비밀번호, 키 생성에 쓰면 안 됩니다.', '보안과 관련된 값에는 SecureRandom을 씁니다.'],
  msg: ['Make sure that using this pseudorandom number generator is safe here.', '이 의사 난수 생성기를 여기서 써도 안전한지 확인합니다.'],
  on: {
    'Call|Ident'(n, cx) {
      if (cx.isTest) return;
      if (n.type === 'Ident') { if (!n.lvar && (n.name === 'rand' || n.name === 'srand')) cx.report(n); return; }
      const r = A.constPath(n.recv);
      if (!n.recv && (n.name === 'rand' || n.name === 'srand')) cx.report(n);
      else if ((r === 'Random' && (n.name === 'rand' || n.name === 'new' || n.name === 'bytes')) || (r === 'Kernel' && n.name === 'rand')) cx.report(n);
    },
  },
  bad: `def token
  rand(10**8).to_s # Noncompliant
end
def gen = Random.new.bytes(16) # Noncompliant
`,
  good: `def token
  SecureRandom.hex(16)
end
`,
});

const CLEAR_SCHEME = /^(http|ftp|telnet):\/\/([^/:?#\s]*)/i;
const CLEAR_OK_HOST = /^(?:localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|\[::1\]|[\w.-]*example\.(?:com|org|net)|[\w.-]+\.local|[\w.-]+\.test|www\.w3\.org|schemas\.xmlsoap\.org|purl\.org|xmlns\.com|json-schema\.org)$/i;

rule({
  id: 'clear-text-protocol', type: 'H', sev: 'CR', debt: 5, sonar: 'S5332', tags: ['cwe-319', 'owasp-a02'],
  en: ['Using clear-text protocols is security-sensitive', 'HTTP, FTP and Telnet send data unencrypted, so anyone on the network can read or change it.', 'Use https://, sftp:// or ssh instead.'],
  ko: ['평문 프로토콜을 쓰는 것은 보안에 민감합니다', 'HTTP, FTP, Telnet은 데이터를 암호화하지 않아 네트워크의 누구나 읽거나 바꿀 수 있습니다.', '대신 https://, sftp://, ssh를 씁니다.'],
  msg: ['Using {0} protocol is insecure. Use {1} instead.', '{0} 프로토콜은 안전하지 않습니다. 대신 {1}를 씁니다.'],
  on: {
    Str(n, cx) {
      if (n.interp || !n.value || cx.isTest) return;
      const m = CLEAR_SCHEME.exec(n.value);
      if (!m || CLEAR_OK_HOST.test(m[2]) || !m[2]) return;
      const sch = m[1].toLowerCase();
      cx.report(n, [sch, sch === 'http' ? 'https' : sch === 'ftp' ? 'sftp, scp or ftps' : 'ssh']);
    },
  },
  bad: `API = "http://api.payments.io/v1" # Noncompliant
`,
  good: `API = "https://api.payments.io/v1"
DEV = "http://localhost:3000"
`,
});

// ── dynamic code ───────────────────────────────────────────
rule({
  id: 'dynamic-code-execution', type: 'H', sev: 'CR', debt: 15, sonar: 'S1523', tags: ['cwe-95', 'owasp-a03'],
  en: ['Dynamically executing code is security-sensitive', 'eval and the string forms of instance_eval / class_eval run arbitrary Ruby; with outside data this is code injection.', 'Avoid evaluating strings: use blocks, define_method, public_send with an allow-list, or a parser.'],
  ko: ['코드를 동적으로 실행하는 것은 보안에 민감합니다', 'eval과 문자열 형태의 instance_eval / class_eval은 임의의 Ruby를 실행하며, 외부 데이터가 섞이면 코드 주입이 됩니다.', '문자열 평가를 피하고 블록, define_method, 허용 목록을 둔 public_send, 파서를 씁니다.'],
  msg: ['Make sure that this dynamic injection or execution of code ("{0}") is safe.', '이 동적 코드 실행("{0}")이 안전한지 확인합니다.'],
  on: {
    Call(n, cx) {
      if (!n.args.length || n.block) return;
      if (n.name === 'eval' && (!n.recv || A.constPath(n.recv) === 'Kernel' || A.isVcall(n.recv, 'binding'))) cx.report(n, ['eval']);
      else if (/^(?:instance_eval|class_eval|module_eval|class_exec)$/.test(n.name) && n.args[0].type !== 'BlockPass') cx.report(n, [n.name]);
    },
  },
  bad: `def run(code)
  eval(code) # Noncompliant
  User.class_eval("def #{code}; end") # Noncompliant
end
`,
  good: `def run(name)
  User.class_eval { attr_reader :name }
  User.define_method(:hello) { name }
end
`,
});

rule({
  id: 'dynamic-method-call', type: 'H', sev: 'MA', debt: 10, sonar: 'S6331', tags: ['cwe-470'],
  en: ['Calling methods by a dynamic name is security-sensitive', 'send / public_send / __send__ with a computed name can call any method, including private and dangerous ones.', 'Check the name against an allow-list, or replace send with explicit calls.'],
  ko: ['동적 이름으로 메서드를 호출하는 것은 보안에 민감합니다', '계산된 이름을 쓴 send / public_send / __send__는 private이나 위험한 메서드까지 무엇이든 호출할 수 있습니다.', '이름을 허용 목록으로 검사하거나 send를 명시적인 호출로 바꿉니다.'],
  msg: ['Make sure the method name passed to "{0}" cannot be controlled by a user.', '"{0}"에 넘기는 메서드 이름을 사용자가 조종할 수 없는지 확인합니다.'],
  on: {
    Call(n, cx) {
      if (!/^(?:send|public_send|__send__|try|method)$/.test(n.name) || !n.args.length) return;
      const a = n.args[0];
      if (a.type === 'Sym' || (a.type === 'Str' && !a.interp) || a.type === 'BlockPass') return;
      if (n.name === 'try' || n.name === 'method') { if (!n.recv && n.name === 'method' && a.type === 'Ident' && a.lvar) cx.report(n, [n.name]); return; }
      cx.report(n, [n.name]);
    },
  },
  bad: `def apply(record, action)
  record.send(action) # Noncompliant
  record.public_send("#{action}!") # Noncompliant
end
`,
  good: `ALLOWED = %w[archive publish].freeze
def apply(record, action)
  record.public_send(:publish) if ALLOWED.include?(action)
end
`,
});

rule({
  id: 'dynamic-constant', type: 'H', sev: 'MA', debt: 10, tags: ['cwe-470', 'owasp-a03'],
  en: ['Resolving classes from dynamic strings is security-sensitive', 'constantize, safe_constantize and const_get with outside data let a user instantiate any class (unsafe reflection).', 'Map the allowed values to classes explicitly with a hash or case.'],
  ko: ['동적 문자열로 클래스를 찾는 것은 보안에 민감합니다', '외부 데이터로 constantize, safe_constantize, const_get을 쓰면 사용자가 아무 클래스나 만들 수 있습니다(안전하지 않은 리플렉션).', '허용하는 값과 클래스를 해시나 case로 명시적으로 짝지습니다.'],
  msg: ['Make sure that the class name resolved by "{0}" cannot be controlled by a user.', '"{0}"가 찾는 클래스 이름을 사용자가 조종할 수 없는지 확인합니다.'],
  on: {
    Call(n, cx) {
      if ((n.name === 'constantize' || n.name === 'safe_constantize') && n.recv && !A.isLiteral(n.recv)) cx.report(n, [n.name]);
      else if (n.name === 'const_get' && n.args.length && !A.isLiteral(n.args[0])) cx.report(n, [n.name]);
    },
  },
  bad: `def model_for(params)
  params[:type].constantize # Noncompliant
end
`,
  good: `MODELS = { "post" => Post, "page" => Page }.freeze
def model_for(params)
  MODELS.fetch(params[:type])
end
`,
});

rule({
  id: 'unsafe-deserialization', type: 'H', sev: 'CR', debt: 30, tags: ['cwe-502', 'owasp-a08'],
  en: ['Deserializing data with object-creating loaders is security-sensitive', 'Marshal.load, YAML.unsafe_load / YAML.load (Psych < 4), Oj.load and JSON.load can instantiate arbitrary objects and lead to remote code execution.', 'Use JSON.parse, YAML.safe_load with permitted_classes, or Oj.load with mode: :strict.'],
  ko: ['객체를 만드는 로더로 역직렬화하는 것은 보안에 민감합니다', 'Marshal.load, YAML.unsafe_load / YAML.load(Psych 4 미만), Oj.load, JSON.load는 임의의 객체를 만들 수 있어 원격 코드 실행으로 이어질 수 있습니다.', 'JSON.parse, permitted_classes를 지정한 YAML.safe_load, mode: :strict를 준 Oj.load를 씁니다.'],
  msg: ['Make sure that deserializing with "{0}" is safe here.', '여기서 "{0}"로 역직렬화해도 안전한지 확인합니다.'],
  on: {
    Call(n, cx) {
      const r = A.constPath(n.recv);
      if (!r) return;
      const t = `${r}.${n.name}`;
      if (/^Marshal\.(?:load|restore)$/.test(t) || /^(?:YAML|Psych)\.(?:load|unsafe_load|unsafe_load_file|load_documents|object_load)$/.test(t)) {
        if (/\.load$/.test(t)) {
          const kw = A.kwargs(n);
          if (kw && (A.hashGet(kw, 'permitted_classes') || A.hashGet(kw, 'safe'))) return;
        }
        cx.report(n, [t]);
      } else if (t === 'Oj.load' || t === 'Oj.object_load') {
        const kw = A.kwargs(n);
        const mode = kw && A.hashGet(kw, 'mode');
        if (mode && /^(?:strict|null|compat|json|rails)$/.test(A.symOrStr(mode.value) || '')) return;
        cx.report(n, [t]);
      } else if (t === 'JSON.load' || t === 'JSON.restore') cx.report(n, [t]);
    },
  },
  bad: `def restore(blob, text)
  Marshal.load(blob) # Noncompliant
  YAML.unsafe_load(text) # Noncompliant
end
`,
  good: `def restore(text)
  JSON.parse(text)
  YAML.safe_load(text, permitted_classes: [Date])
  Oj.load(text, mode: :strict)
end
`,
});

const CMD_METHODS = new Set(['system', 'exec', 'spawn', 'popen', 'popen2', 'popen3', 'popen2e', 'capture2', 'capture2e', 'capture3', 'pipeline', 'pipeline_r', 'pipeline_w', 'syscall']);

const dynamicString = (a) => {
  a = A.strip(a);
  if (!a) return false;
  if ((a.type === 'Str' || a.type === 'XStr') && a.interp) return true;
  if (a.type === 'Bin' && a.op === '+' && (a.l.type === 'Str' || a.r.type === 'Str' || dynamicString(a.l) || dynamicString(a.r))) return true;
  if (a.type === 'Call' && a.name === 'format' && !a.recv) return true;
  if (a.type === 'Bin' && a.op === '%' && a.l.type === 'Str') return true;
  return false;
};

rule({
  id: 'os-command', type: 'H', sev: 'CR', debt: 30, sonar: 'S4721', tags: ['cwe-78', 'owasp-a03'],
  en: ['Building OS commands from dynamic strings is security-sensitive', 'A command string built with interpolation goes through the shell, so a value containing ; | or $() runs extra commands.', 'Pass the program and its arguments separately (system("git", "log", ref)) or escape with Shellwords.escape.'],
  ko: ['동적 문자열로 OS 명령을 만드는 것은 보안에 민감합니다', '보간으로 만든 명령 문자열은 셸을 거치므로 ; | $() 가 든 값이 다른 명령을 실행합니다.', '프로그램과 인자를 따로 넘기거나(system("git", "log", ref)) Shellwords.escape로 이스케이프합니다.'],
  msg: ['Make sure that executing this OS command built from "{0}" is safe here.', '"{0}"로 만든 OS 명령을 실행해도 안전한지 확인합니다.'],
  on: {
    Call(n, cx) {
      const r = A.constPath(n.recv);
      const kernel = !n.recv || r === 'Kernel' || r === 'IO' || r === 'Open3' || r === 'Process' || r === 'PTY';
      if (!kernel || !CMD_METHODS.has(n.name)) {
        if (!(n.name === 'spawn' && r === 'PTY')) return;
      }
      if (!n.recv && (n.name === 'popen' || n.name.startsWith('capture') || n.name.startsWith('pipeline'))) return;
      let args = n.args.filter((a) => a.type !== 'Hash' && a.type !== 'BlockPass');
      if (args.length && args[0].type === 'Hash') args = args.slice(1);
      if (!args.length) return;
      if (args.length === 1 && (dynamicString(args[0]) || (args[0].type === 'Ident' && args[0].lvar))) cx.report(n, [cx.slice(args[0]).slice(0, 40)]);
    },
    XStr(n, cx) {
      if (n.interp) cx.report(n, [cx.slice(n).slice(0, 40)]);
    },
  },
  bad: `def archive(dir)
  system("tar czf out.tgz #{dir}") # Noncompliant
  \`ls #{dir}\` # Noncompliant
  Open3.capture2("du -sh " + dir) # Noncompliant
end
`,
  good: `def archive(dir)
  system("tar", "czf", "out.tgz", dir)
  \`date\`
  Open3.capture2("du", "-sh", dir)
end
`,
});

rule({
  id: 'kernel-open', type: 'H', sev: 'CR', debt: 15, tags: ['cwe-78', 'owasp-a03'],
  en: ['"Kernel#open" should not be called with a dynamic argument', 'Kernel#open (and URI.open) start a subprocess when the argument begins with "|", so a dynamic path can run commands.', 'Use File.open for files and Net::HTTP / URI.parse(..).open for URLs.'],
  ko: ['"Kernel#open"을 동적 인자로 호출하지 않아야 합니다', 'Kernel#open(과 URI.open)은 인자가 "|"로 시작하면 하위 프로세스를 띄우므로 동적 경로로 명령을 실행할 수 있습니다.', '파일에는 File.open, URL에는 Net::HTTP / URI.parse(..).open을 씁니다.'],
  msg: ['Use "File.open" instead of "{0}" with a dynamic argument.', '동적 인자에는 "{0}" 대신 "File.open"을 씁니다.'],
  on: {
    Call(n, cx) {
      if (n.name !== 'open' || !n.args.length) return;
      const r = A.constPath(n.recv);
      if (n.recv && r !== 'Kernel' && r !== 'URI') return;
      const a = n.args[0];
      if (A.isLiteral(a) && !(a.type === 'Str' && /^\|/.test(a.value || ''))) return;
      cx.report(n, [r ? `${r}.open` : 'open']);
    },
  },
  bad: `def read(path)
  open(path).read # Noncompliant
end
`,
  good: `def read(path)
  File.open(path).read
end
`,
});

rule({
  id: 'publicly-writable-directory', type: 'H', sev: 'CR', debt: 10, sonar: 'S5443', tags: ['cwe-377', 'cwe-379', 'owasp-a01'],
  en: ['Using publicly writable directories is security-sensitive', 'Files under /tmp can be pre-created or replaced by other users (symlink and race attacks).', 'Use Dir.mktmpdir / Tempfile, or a private application directory.'],
  ko: ['누구나 쓸 수 있는 디렉터리를 쓰는 것은 보안에 민감합니다', '/tmp 아래 파일은 다른 사용자가 미리 만들거나 바꿔치기할 수 있습니다(심볼릭 링크, 경쟁 공격).', 'Dir.mktmpdir / Tempfile이나 애플리케이션 전용 디렉터리를 씁니다.'],
  msg: ['Make sure publicly writable directories are used safely here.', '누구나 쓸 수 있는 디렉터리를 여기서 안전하게 쓰는지 확인합니다.'],
  on: {
    Str(n, cx) {
      if (!n.parts.length || cx.isTest) return;
      const first = n.parts[0];
      const s = first && first.s != null ? first.s : '';
      if (/^(?:\/tmp|\/var\/tmp|\/usr\/tmp|\/dev\/shm)(?:\/|$)/.test(s)) cx.report(n);
    },
  },
  bad: `def dump(data)
  File.write("/tmp/report.csv", data) # Noncompliant
end
`,
  good: `def dump(data)
  Tempfile.create("report") { |f| f.write(data) }
end
`,
});

rule({
  id: 'permissive-file-permissions', type: 'H', sev: 'MA', debt: 10, sonar: 'S2612', tags: ['cwe-732', 'owasp-a01'],
  en: ['Setting loose POSIX file permissions is security-sensitive', 'Granting read, write or execute rights to "others" exposes the file to every local user.', 'Grant permissions to the owner (and group if needed) only, e.g. 0o640 or 0o750.'],
  ko: ['느슨한 POSIX 파일 권한을 주는 것은 보안에 민감합니다', '"others"에 읽기·쓰기·실행 권한을 주면 모든 로컬 사용자에게 파일이 노출됩니다.', '소유자(필요하면 그룹)에게만 권한을 줍니다. 예: 0o640, 0o750.'],
  msg: ['Make sure this permission "{0}" is safe here.', '이 권한 "{0}"가 여기서 안전한지 확인합니다.'],
  on: {
    Call(n, cx) {
      const r = A.constPath(n.recv);
      let mode = null;
      if ((r === 'File' || r === 'FileUtils') && (n.name === 'chmod' || n.name === 'chmod_R' || n.name === 'lchmod')) mode = n.args[0];
      else if ((r === 'FileUtils' && /^(?:mkdir|mkdir_p|makedirs|install)$/.test(n.name)) || (r === 'Dir' && n.name === 'mkdir')) {
        const kw = A.kwargs(n);
        const p = kw && A.hashGet(kw, 'mode');
        mode = p ? p.value : r === 'Dir' ? n.args[1] : null;
      } else if (n.recv && n.name === 'chmod' && n.args.length === 1) mode = n.args[0];
      if (!mode) return;
      if (mode.type === 'Int') {
        const v = H.octal(mode.value);
        if (Number.isFinite(v) && (v & 0o007)) cx.report(mode, [mode.value]);
      } else if (mode.type === 'Str' && /(?:^|,)[oa]?[+=][rwx]+|^[ugo]*a/.test(mode.value || '') && /(?:^|,)(?:o|a|)[+=]/.test(mode.value || '')) {
        cx.report(mode, [mode.value]);
      }
    },
  },
  bad: `def publish(path)
  File.chmod(0777, path) # Noncompliant
  FileUtils.mkdir_p("out", mode: 0o775) # Noncompliant
end
`,
  good: `def publish(path)
  File.chmod(0o640, path)
  FileUtils.mkdir_p("out", mode: 0o750)
end
`,
});

module.exports = { dynamicString };
