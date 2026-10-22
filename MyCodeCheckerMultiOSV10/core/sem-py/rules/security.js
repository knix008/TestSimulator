'use strict';

// Security hotspots and vulnerabilities that are not taint flows (injection
// flows belong to core/taint): crypto, TLS, framework settings, secrets,
// deserialization, file system, network binding, AWS CDK basics.

const { define } = require('./def');
const { dotted, numValue, isTrue, isFalse, short, walk, arg } = require('../ast');
const { BUILTIN } = require('../scope');
const U = require('./util');

const RULES = [];
const R = define(RULES);

const kw = (call, name) => { for (const k of call.keywords) if (k.arg === name) return k.value; return null; };
const q = (c, e) => c.q(e) || '';

// ── crypto ──────────────────────────────────────────────────
const WEAK_HASHES = /^(?:md2|md4|md5|sha1|sha|ripemd160|md5-sha1)$/i;

R('weak-hash', 'H', 'CR', 10, ['cwe-328', 'owasp-a02', 'crypto'], 'S4790',
  ['Weak hashing algorithm', '약한 해시 알고리즘'],
  ['MD5 and SHA-1 have practical collision attacks; using them for signatures, integrity or passwords is unsafe.', 'MD5와 SHA-1은 실용적인 충돌 공격이 있어 서명, 무결성, 비밀번호에 쓰면 안전하지 않습니다.'],
  ['Use SHA-256 or stronger (or a password KDF); pass usedforsecurity=False for non-security checksums.', 'SHA-256 이상(또는 비밀번호 KDF)을 쓰고, 보안과 무관한 체크섬에는 usedforsecurity=False를 넘기세요.'],
  {
    on: {
      Call(n, c, r) {
        const name = q(c, n.func);
        if (!name) return;
        const ufs = kw(n, 'usedforsecurity');
        if (ufs && isFalse(ufs)) return;
        let algo = null;
        let m;
        if ((m = /^hashlib\.(md5|sha1|md4)$/.exec(name))) algo = m[1];
        else if (name === 'hashlib.new' && n.args[0]) { const v = U.strValue(n.args[0]); if (v && WEAK_HASHES.test(v)) algo = v; } else if ((m = /^(?:Crypto|Cryptodome)\.Hash\.(MD2|MD4|MD5|SHA1|SHA)(?:\.new)?$/.exec(name))) algo = m[1];
        else if ((m = /^cryptography\.hazmat\.primitives\.hashes\.(MD5|SHA1)$/.exec(name))) algo = m[1];
        else if (name === 'hmac.new' || name === 'hmac.digest') {
          const d = arg(n, 2, 'digestmod') || (name === 'hmac.digest' ? arg(n, 2, 'digest') : null);
          const dn = d ? (q(c, d) || U.strValue(d) || '') : '';
          if (/(?:^|\.)(?:md5|sha1)$/i.test(dn)) algo = dn.split('.').pop();
        }
        if (algo) r.report(n, `Make sure this weak hash algorithm (${algo.toUpperCase()}) is not used in a security context.`, `이 약한 해시 알고리즘(${algo.toUpperCase()})을 보안 용도로 쓰지 않는지 확인하세요.`);
      },
    },
  });

R('weak-cipher', 'V', 'CR', 15, ['cwe-327', 'owasp-a02', 'crypto'], 'S5547',
  ['Weak encryption algorithm', '약한 암호화 알고리즘'],
  ['DES, 3DES, RC2, RC4, Blowfish, CAST and IDEA use small keys or blocks and can be broken.', 'DES, 3DES, RC2, RC4, Blowfish, CAST, IDEA는 키나 블록이 작아 깨질 수 있습니다.'],
  ['Use AES (GCM) or ChaCha20-Poly1305.', 'AES(GCM)나 ChaCha20-Poly1305를 쓰세요.'],
  {
    on: {
      Call(n, c, r) {
        const name = q(c, n.func);
        let m;
        if ((m = /^(?:Crypto|Cryptodome)\.Cipher\.(DES3?|ARC2|ARC4|Blowfish|CAST|XOR)\.new$/.exec(name)) || (m = /^cryptography\.hazmat\.primitives\.ciphers\.algorithms\.(TripleDES|Blowfish|ARC4|CAST5|IDEA|SEED)$/.exec(name)) || (m = /^pyDes\.(des|triple_des)$/.exec(name))) {
          r.report(n, `Use a strong cipher instead of ${m[1]}.`, `${m[1]} 대신 강한 암호를 쓰세요.`);
        }
      },
    },
  });

R('insecure-cipher-mode', 'V', 'CR', 15, ['cwe-327', 'owasp-a02', 'crypto'], 'S5542',
  ['Insecure cipher mode or padding', '안전하지 않은 암호 모드나 패딩'],
  ['ECB leaks patterns of the plaintext, and RSA PKCS#1 v1.5 encryption is open to padding-oracle attacks.', 'ECB는 평문 패턴을 드러내고, RSA PKCS#1 v1.5 암호화는 패딩 오라클 공격에 취약합니다.'],
  ['Use an authenticated mode (GCM) and OAEP padding for RSA.', '인증 모드(GCM)와 RSA에는 OAEP 패딩을 쓰세요.'],
  {
    on: {
      Attribute(n, c, r) {
        if (n.attr !== 'MODE_ECB') return;
        const name = q(c, n);
        if (/^(?:Crypto|Cryptodome)\.Cipher\./.test(name) || (!name && n.value.type === 'Name')) r.report(n, 'Use a secure mode instead of ECB.', 'ECB 대신 안전한 모드를 쓰세요.');
      },
      Call(n, c, r) {
        const name = q(c, n.func);
        if (/^cryptography\.hazmat\.primitives\.ciphers\.modes\.ECB$/.test(name)) r.report(n, 'Use a secure mode instead of ECB.', 'ECB 대신 안전한 모드를 쓰세요.');
        else if (/^(?:Crypto|Cryptodome)\.Cipher\.PKCS1_v1_5\.new$/.test(name)) r.report(n, 'Use PKCS1_OAEP instead of PKCS#1 v1.5 for RSA encryption.', 'RSA 암호화에는 PKCS#1 v1.5 대신 PKCS1_OAEP를 쓰세요.');
        else if (/^cryptography\.hazmat\.primitives\.asymmetric\.padding\.PKCS1v15$/.test(name) && n.parent && n.parent.type === 'Call' && n.parent.func.type === 'Attribute' && /^(?:encrypt|decrypt)$/.test(n.parent.func.attr)) r.report(n, 'Use OAEP padding instead of PKCS1v15 for RSA encryption.', 'RSA 암호화에는 PKCS1v15 대신 OAEP 패딩을 쓰세요.');
      },
    },
  });

function literalBytes(c, e) {
  if (!e) return false;
  if (e.type === 'Constant' && (e.kind === 'bytes' || e.kind === 'str')) return true;
  if (e.type === 'Name' && e.sym && e.sym !== BUILTIN && e.sym.bindings.length === 1) {
    const b = e.sym.bindings[0];
    return b.kind === 'assign' && b.stmt && b.stmt.type === 'Assign' && b.stmt.value.type === 'Constant' && (b.stmt.value.kind === 'bytes' || b.stmt.value.kind === 'str');
  }
  return false;
}

R('static-iv', 'V', 'CR', 15, ['cwe-329', 'owasp-a02', 'crypto'], 'S3329',
  ['Static initialization vector', '고정된 초기화 벡터'],
  ['A hard-coded IV makes CBC/CTR encryption deterministic: equal plaintexts give equal ciphertexts and nonce reuse breaks CTR/GCM entirely.', '하드코딩된 IV는 CBC/CTR 암호화를 결정적으로 만들어 같은 평문이 같은 암호문이 되고, CTR/GCM에서는 논스 재사용이 치명적입니다.'],
  ['Generate a random IV per message (os.urandom / get_random_bytes) and store it with the ciphertext.', '메시지마다 무작위 IV(os.urandom / get_random_bytes)를 만들어 암호문과 함께 저장하세요.'],
  {
    on: {
      Call(n, c, r) {
        const name = q(c, n.func);
        let iv = null;
        if (/^(?:Crypto|Cryptodome)\.Cipher\.AES\.new$/.test(name)) iv = kw(n, 'iv') || kw(n, 'nonce') || (n.args.length >= 3 ? n.args[2] : null);
        else if (/^cryptography\.hazmat\.primitives\.ciphers\.modes\.(?:CBC|CTR|GCM|OFB|CFB|CFB8)$/.test(name)) iv = n.args[0] || kw(n, 'initialization_vector') || kw(n, 'nonce') || kw(n, 'tweak');
        if (iv && literalBytes(c, iv)) r.report(iv, 'Use a random initialization vector instead of a hard-coded one.', '하드코딩된 값 대신 무작위 초기화 벡터를 쓰세요.');
      },
    },
  });

const WEAK_CURVES = /(?:SECP192R1|SECT163K1|SECT163R2|SECP160|SECT233|SECP224R1|BrainpoolP160)/i;

R('weak-key-size', 'V', 'CR', 15, ['cwe-326', 'owasp-a02', 'crypto'], 'S4426',
  ['Cryptographic key is too short', '암호 키가 너무 짧습니다'],
  ['RSA/DSA keys below 2048 bits and elliptic curves below 224 bits can be factored or broken with today\'s resources.', '2048비트 미만의 RSA/DSA 키와 224비트 미만의 타원 곡선은 오늘날의 자원으로 깨질 수 있습니다.'],
  ['Use at least 2048-bit RSA/DSA keys (3072 recommended) or a 256-bit curve.', '최소 2048비트 RSA/DSA 키(3072 권장)나 256비트 곡선을 쓰세요.'],
  {
    on: {
      Call(n, c, r) {
        const name = q(c, n.func);
        let size = null;
        if (/^cryptography\.hazmat\.primitives\.asymmetric\.(?:rsa|dsa)\.generate_private_key$/.test(name)) size = arg(n, name.includes('.rsa.') ? 1 : 0, 'key_size');
        else if (/^(?:Crypto|Cryptodome)\.PublicKey\.(?:RSA|DSA)\.generate$/.test(name)) size = arg(n, 0, 'bits');
        else if (/^OpenSSL\.crypto\.PKey$/.test(name)) size = null;
        else if (/^cryptography\.hazmat\.primitives\.asymmetric\.ec\.generate_private_key$/.test(name)) {
          const curve = arg(n, 0, 'curve');
          if (curve && WEAK_CURVES.test(c.slice(curve))) r.report(curve, 'Use a curve of at least 224 bits.', '최소 224비트 곡선을 쓰세요.');
          return;
        }
        if (n.func.type === 'Attribute' && n.func.attr === 'generate_key' && n.args.length >= 2 && /TYPE_RSA|TYPE_DSA/.test(c.slice(n.args[0]))) size = n.args[1];
        const v = numValue(size);
        if (v != null && v < 2048) r.report(size, `Use a key size of at least 2048 bits (${v} given).`, `최소 2048비트 키를 쓰세요(${v} 지정).`);
      },
    },
  });

const SECRETISH = /(?:token|passw|pwd|secret|salt|nonce|otp|session|csrf|api_?key|private_?key|auth|cred|pin_?code|verif\w*_?code|reset_?code|captcha)/i;
const RANDOM_FUNCS = /^random\.(?:random|randint|randrange|choice|choices|sample|shuffle|uniform|getrandbits|randbytes|triangular)$/;

R('insecure-random', 'H', 'CR', 10, ['cwe-338', 'owasp-a02'], 'S2245',
  ['Pseudorandom generator used for a security-sensitive value', '보안 민감 값에 의사난수 생성기를 씁니다'],
  ['The random module is predictable (Mersenne Twister); tokens, passwords, salts or session ids derived from it can be guessed.', 'random 모듈은 예측 가능(메르센 트위스터)해서 이것으로 만든 토큰, 비밀번호, 솔트, 세션 id는 추측될 수 있습니다.'],
  ['Use the secrets module (secrets.token_hex, secrets.choice) or os.urandom.', 'secrets 모듈(secrets.token_hex, secrets.choice)이나 os.urandom을 쓰세요.'],
  {
    on: {
      Call(n, c, r) {
        const name = q(c, n.func);
        if (!RANDOM_FUNCS.test(name)) return;
        // where does the value go?
        let ctxName = '';
        for (let p = n.parent; p; p = p.parent) {
          if (p.type === 'Assign') { ctxName = p.targets.map((t) => c.slice(t)).join(' '); break; }
          if (p.type === 'keyword' && p.arg) { ctxName = p.arg; break; }
          if (p.type === 'Return') { const fn = U.enclosingDef(p); ctxName = fn ? fn.name : ''; break; }
          if (/^(?:FunctionDef|AsyncFunctionDef|ClassDef|Module|Expr|For|While|If)$/.test(p.type)) break;
        }
        const fn = U.enclosingDef(n);
        if (!SECRETISH.test(ctxName) && !(fn && SECRETISH.test(fn.name))) return;
        r.report(n, `Make sure that using '${name}' is safe here: this value looks security-sensitive ('${short(ctxName || (fn && fn.name) || '', 30)}').`, `여기서 '${name}'를 써도 안전한지 확인하세요. 보안 민감 값으로 보입니다('${short(ctxName || (fn && fn.name) || '', 30)}').`);
      },
    },
  });

// ── TLS ─────────────────────────────────────────────────────
R('cert-validation-disabled', 'V', 'CR', 15, ['cwe-295', 'owasp-a07', 'tls'], 'S4830',
  ['Server certificate validation disabled', '서버 인증서 검증을 끕니다'],
  ['Without certificate validation any machine in the middle can impersonate the server and read or alter the traffic.', '인증서 검증이 없으면 중간의 어떤 컴퓨터든 서버를 사칭해 통신을 읽거나 바꿀 수 있습니다.'],
  ['Keep verification on (verify=True / CERT_REQUIRED) and trust the right CA bundle instead.', '검증을 켜 두고(verify=True / CERT_REQUIRED) 올바른 CA 묶음을 신뢰하세요.'],
  {
    on: {
      Call(n, c, r) {
        const name = q(c, n.func);
        const d = dotted(n.func) || '';
        if (name === 'ssl._create_unverified_context' || name === 'ssl._create_stdlib_context') { r.report(n, 'Enable server certificate validation on this SSL context.', '이 SSL 컨텍스트에서 서버 인증서 검증을 켜세요.'); return; }
        const verify = kw(n, 'verify');
        if (verify && isFalse(verify) && (/^(?:requests|httpx|aiohttp)\b/.test(name) || /\.(?:get|post|put|patch|delete|head|options|request|send|Session|Client|AsyncClient)$/.test(d))) { r.report(verify, 'Enable server certificate validation (verify=False disables it).', '서버 인증서 검증을 켜세요(verify=False는 검증을 끕니다).'); return; }
        for (const key of ['ssl', 'verify_ssl']) {
          const v = kw(n, key);
          if (v && isFalse(v) && /aiohttp|ClientSession|TCPConnector|\.(?:get|post|put|request)$/.test(name + ' ' + d)) r.report(v, `Enable server certificate validation (${key}=False disables it).`, `서버 인증서 검증을 켜세요(${key}=False는 검증을 끕니다).`);
        }
        const certReqs = kw(n, 'cert_reqs');
        if (certReqs && /CERT_NONE/.test(c.slice(certReqs))) r.report(certReqs, 'Require certificates instead of CERT_NONE.', 'CERT_NONE 대신 인증서를 요구하세요.');
        if (n.func.type === 'Attribute' && n.func.attr === 'set_verify' && n.args[0] && /VERIFY_NONE/.test(c.slice(n.args[0]))) r.report(n.args[0], 'Enable peer verification instead of VERIFY_NONE.', 'VERIFY_NONE 대신 상대 검증을 켜세요.');
      },
      Assign(n, c, r) {
        for (const t of n.targets) {
          if (t.type !== 'Attribute') continue;
          if (t.attr === 'verify_mode' && /CERT_NONE/.test(c.slice(n.value))) r.report(n, 'Require certificates instead of CERT_NONE.', 'CERT_NONE 대신 인증서를 요구하세요.');
          if (t.attr === 'verify' && isFalse(n.value)) r.report(n, 'Enable server certificate validation on this session.', '이 세션에서 서버 인증서 검증을 켜세요.');
        }
      },
    },
  });

R('hostname-verification-disabled', 'V', 'CR', 10, ['cwe-297', 'owasp-a07', 'tls'], 'S5527',
  ['Server hostname verification disabled', '서버 호스트 이름 검증을 끕니다'],
  ['A valid certificate for another host is accepted, so an attacker with any trusted certificate can impersonate the server.', '다른 호스트의 유효한 인증서도 받아들여, 신뢰받는 인증서만 있으면 공격자가 서버를 사칭할 수 있습니다.'],
  ['Keep check_hostname=True / assert_hostname on.', 'check_hostname=True / assert_hostname을 켜 두세요.'],
  {
    on: {
      Assign(n, c, r) {
        for (const t of n.targets) if (t.type === 'Attribute' && t.attr === 'check_hostname' && isFalse(n.value)) r.report(n, 'Enable hostname verification (check_hostname=False disables it).', '호스트 이름 검증을 켜세요(check_hostname=False는 검증을 끕니다).');
      },
      keyword(n, c, r) {
        if ((n.arg === 'assert_hostname' || n.arg === 'check_hostname') && isFalse(n.value)) r.report(n, `Enable hostname verification (${n.arg}=False disables it).`, `호스트 이름 검증을 켜세요(${n.arg}=False는 검증을 끕니다).`);
      },
    },
  });

R('weak-tls-version', 'V', 'CR', 10, ['cwe-327', 'owasp-a02', 'tls'], 'S4423',
  ['Weak SSL/TLS protocol version', '약한 SSL/TLS 프로토콜 버전'],
  ['SSLv2, SSLv3, TLS 1.0 and TLS 1.1 have known attacks (POODLE, BEAST) and are deprecated.', 'SSLv2, SSLv3, TLS 1.0, TLS 1.1은 알려진 공격(POODLE, BEAST)이 있고 폐기되었습니다.'],
  ['Use ssl.PROTOCOL_TLS_CLIENT / TLS_SERVER with minimum_version = TLSVersion.TLSv1_2.', 'ssl.PROTOCOL_TLS_CLIENT / TLS_SERVER와 minimum_version = TLSVersion.TLSv1_2를 쓰세요.'],
  {
    on: {
      Attribute(n, c, r) {
        const name = q(c, n);
        const m = /^(?:ssl\.(?:PROTOCOL_(SSLv2|SSLv3|SSLv23|TLSv1|TLSv1_1)|TLSVersion\.(SSLv3|TLSv1|TLSv1_1))|OpenSSL\.SSL\.(SSLv2_METHOD|SSLv3_METHOD|SSLv23_METHOD|TLSv1_METHOD|TLSv1_1_METHOD))$/.exec(name);
        if (!m) return;
        const v = m[1] || m[2] || m[3];
        r.report(n, `Use TLS 1.2 or later instead of ${v}.`, `${v} 대신 TLS 1.2 이상을 쓰세요.`);
      },
    },
  });

// ── frameworks ──────────────────────────────────────────────
function isDjangoSettings(c) {
  if (c._django != null) return c._django;
  const names = c.mod.scope.symbols;
  c._django = c.isSettings || names.has('INSTALLED_APPS') || names.has('MIDDLEWARE') || names.has('ROOT_URLCONF');
  return c._django;
}
function moduleAssign(n, name) {
  return n.parent && n.parent.type === 'Module' && n.targets && n.targets.length === 1 && n.targets[0].type === 'Name' && n.targets[0].id === name;
}
function configSubscript(t, key) {
  // app.config['KEY'] / app.config.KEY
  if (t.type === 'Subscript' && /(?:^|\.)config$/.test(dotted(t.value) || '') && U.strValue(t.slice) === key) return true;
  return false;
}

R('csrf-disabled', 'H', 'CR', 10, ['cwe-352', 'owasp-a01'], 'S4502',
  ['CSRF protection disabled', 'CSRF 보호를 끕니다'],
  ['Without CSRF protection a malicious site can make a logged-in user\'s browser submit state-changing requests.', 'CSRF 보호가 없으면 악성 사이트가 로그인한 사용자의 브라우저로 상태를 바꾸는 요청을 보내게 할 수 있습니다.'],
  ['Keep CsrfViewMiddleware / CSRFProtect enabled and avoid csrf_exempt on state-changing views.', 'CsrfViewMiddleware / CSRFProtect를 켜 두고 상태를 바꾸는 뷰에 csrf_exempt를 쓰지 마세요.'],
  {
    on: {
      'FunctionDef|AsyncFunctionDef|ClassDef'(n, c, r) {
        for (const d of n.decorator_list) {
          const name = q(c, d.type === 'Call' ? d.func : d) || dotted(d) || '';
          if (/(?:^|\.)csrf_exempt$/.test(name) || /^\w+\.exempt$/.test(dotted(d) || '') && /csrf/i.test(dotted(d) || '')) r.report(d, `Make sure disabling CSRF protection on '${n.name}' is safe.`, `'${n.name}'에서 CSRF 보호를 꺼도 안전한지 확인하세요.`);
        }
      },
      Assign(n, c, r) {
        if (!isFalse(n.value)) return;
        for (const t of n.targets) {
          if ((t.type === 'Name' && t.id === 'WTF_CSRF_ENABLED') || configSubscript(t, 'WTF_CSRF_ENABLED') || (t.type === 'Name' && t.id === 'CSRF_ENABLED')) r.report(n, 'Make sure disabling CSRF protection is safe here.', '여기서 CSRF 보호를 꺼도 안전한지 확인하세요.');
        }
      },
      'List|Tuple'(n, c, r) {
        const p = n.parent;
        if (!p || p.type !== 'Assign' || !moduleAssign(p, 'MIDDLEWARE') && !moduleAssign(p, 'MIDDLEWARE_CLASSES')) return;
        const vals = n.elts.map((e) => U.strValue(e)).filter((x) => x != null);
        if (!vals.some((v) => v.startsWith('django.'))) return;
        if (!vals.includes('django.middleware.csrf.CsrfViewMiddleware')) r.report(n, "Make sure removing 'CsrfViewMiddleware' is safe: CSRF protection is disabled.", "'CsrfViewMiddleware'를 빼도 안전한지 확인하세요. CSRF 보호가 꺼집니다.");
      },
    },
  });

R('debug-mode-enabled', 'H', 'MA', 5, ['cwe-489', 'cwe-215', 'owasp-a05'], 'S4507',
  ['Debug mode enabled', '디버그 모드를 켭니다'],
  ['Debug mode shows stack traces, settings and an interactive console to anyone who triggers an error.', '디버그 모드는 오류를 낸 누구에게나 스택 추적, 설정, 대화형 콘솔을 보여 줍니다.'],
  ['Turn debug off in production (read it from the environment).', '운영 환경에서는 디버그를 끄세요(환경 변수에서 읽으세요).'],
  {
    on: {
      Assign(n, c, r) {
        if (!isTrue(n.value)) return;
        for (const t of n.targets) {
          if (t.type === 'Name' && (t.id === 'DEBUG' || t.id === 'DEBUG_PROPAGATE_EXCEPTIONS') && n.parent.type === 'Module' && isDjangoSettings(c)) r.report(n, `Make sure this debug feature (${t.id} = True) is deactivated before delivering the code to production.`, `운영 배포 전에 이 디버그 기능(${t.id} = True)을 끄세요.`);
          else if (configSubscript(t, 'DEBUG') || (t.type === 'Attribute' && t.attr === 'debug' && /^(?:app|application|server|flask_app)$/.test(dotted(t.value) || ''))) r.report(n, 'Make sure debug mode is deactivated in production.', '운영 환경에서 디버그 모드를 끄세요.');
        }
      },
      Call(n, c, r) {
        const d = dotted(n.func) || '';
        const debug = kw(n, 'debug');
        if (!debug || !isTrue(debug)) return;
        const name = q(c, n.func);
        if (/(?:^|\.)run$/.test(d) && (c.imported('flask') || /^(?:app|application)\.run$/.test(d))) r.report(debug, 'Make sure the Flask debugger is not enabled in production.', '운영 환경에서 Flask 디버거를 켜지 않았는지 확인하세요.');
        else if (/^(?:fastapi\.FastAPI|starlette\.applications\.Starlette|django\.conf\.settings\.configure)$/.test(name)) r.report(debug, 'Make sure debug mode is deactivated in production.', '운영 환경에서 디버그 모드를 끄세요.');
      },
    },
  });

R('allowed-hosts-wildcard', 'H', 'MA', 5, ['cwe-183', 'owasp-a05'], 'S5332',
  ['ALLOWED_HOSTS accepts any host', 'ALLOWED_HOSTS가 모든 호스트를 받아들입니다'],
  ['A wildcard host lets attackers poison password-reset links and caches through the Host header.', '와일드카드 호스트는 공격자가 Host 헤더로 비밀번호 재설정 링크와 캐시를 오염시키게 합니다.'],
  ['List the real host names.', '실제 호스트 이름을 나열하세요.'],
  {
    on: {
      Assign(n, c, r) {
        if (!moduleAssign(n, 'ALLOWED_HOSTS') || !(n.value.type === 'List' || n.value.type === 'Tuple')) return;
        const star = n.value.elts.find((e) => U.strValue(e) === '*');
        if (star) r.report(star, "Make sure accepting any host ('*') is safe here.", "모든 호스트('*')를 받아도 안전한지 확인하세요.");
      },
    },
  });

function looksPlaceholder(v) {
  return !v || /^\s*$/.test(v) || /\s/.test(v.trim()) || /^[<{[$%].*[>}\]]?$/.test(v) || /^\*+$/.test(v) || /^(?:x+|\.+|-+|none|null|changeme|change_me|placeholder|todo|dummy|example|secret|password)$/i.test(v);
}

R('hardcoded-secret-key', 'V', 'BL', 30, ['cwe-798', 'owasp-a07', 'secrets'], 'S6418',
  ['Framework secret key hard-coded', '프레임워크 비밀 키를 하드코딩합니다'],
  ['The secret key signs sessions, cookies and password-reset tokens; anyone who reads the source can forge them.', '비밀 키는 세션, 쿠키, 비밀번호 재설정 토큰에 서명하므로, 소스를 읽은 누구나 위조할 수 있습니다.'],
  ['Load the key from the environment or a secrets manager.', '키를 환경 변수나 비밀 관리자에서 읽으세요.'],
  {
    on: {
      Assign(n, c, r) {
        const v = U.strValue(n.value);
        if (v == null || v.length < 6) return;
        for (const t of n.targets) {
          const isKey = (t.type === 'Name' && /^(?:SECRET_KEY|JWT_SECRET_KEY|SECURITY_PASSWORD_SALT|SESSION_SECRET|COOKIE_SECRET)$/.test(t.id)) || configSubscript(t, 'SECRET_KEY') || configSubscript(t, 'JWT_SECRET_KEY') || (t.type === 'Attribute' && t.attr === 'secret_key');
          if (isKey) r.report(n.value, `Do not hard-code '${short(c.slice(t), 30)}'; load it from the environment.`, `'${short(c.slice(t), 30)}'를 하드코딩하지 말고 환경에서 읽으세요.`);
        }
      },
      Call(n, c, r) {
        if (!(n.func.type === 'Attribute' && n.func.attr === 'update' && /(?:^|\.)config$/.test(dotted(n.func.value) || ''))) return;
        for (const k of n.keywords) if (/^(?:SECRET_KEY|JWT_SECRET_KEY)$/.test(k.arg || '') && U.strValue(k.value) && U.strValue(k.value).length >= 6) r.report(k.value, `Do not hard-code '${k.arg}'; load it from the environment.`, `'${k.arg}'를 하드코딩하지 말고 환경에서 읽으세요.`);
      },
    },
  });

const CRED_NAME = /(?:^|_)(?:password|passwd|pwd|passphrase|secret|client_secret|api_?key|access_?token|auth_?token|private_?key|secret_?key|access_?key)$/i;

function credValue(e) {
  const v = U.strValue(e);
  if (v == null || e.type === 'JoinedStr' && e.values.some((x) => x.type === 'FormattedValue')) return null;
  if (looksPlaceholder(v) || v.length < 4) return null;
  if (/^[A-Z][A-Z0-9_]+$/.test(v)) return null; // name of an environment variable
  if (/^(?:https?|file):\/\//.test(v) && !/:\/\/[^/\s:@]+:[^/\s@]+@/.test(v)) return null;
  return v;
}

R('hardcoded-credentials', 'H', 'BL', 30, ['cwe-798', 'cwe-259', 'owasp-a07', 'secrets'], 'S2068',
  ['Hard-coded credential', '하드코딩된 자격 증명'],
  ['A password or key written in the source ends up in version control, builds and logs where anyone can read and reuse it.', '소스에 쓴 비밀번호나 키는 버전 관리, 빌드, 로그에 남아 누구나 읽고 재사용할 수 있습니다.'],
  ['Read the credential from the environment, a vault or a protected configuration file.', '자격 증명을 환경 변수, 볼트, 보호된 설정 파일에서 읽으세요.'],
  {
    on: {
      Assign(n, c, r) {
        if (c.isTest) return;
        const v = credValue(n.value);
        if (!v) return;
        for (const t of n.targets) {
          const nm = t.type === 'Name' ? t.id : t.type === 'Attribute' ? t.attr : t.type === 'Subscript' ? U.strValue(t.slice) : null;
          if (!nm || !CRED_NAME.test(nm) || /^(?:SECRET_KEY|JWT_SECRET_KEY)$/.test(nm) || configSubscript(t, 'SECRET_KEY')) continue;
          if (v.toLowerCase().replace(/[^a-z]/g, '') === nm.toLowerCase().replace(/[^a-z]/g, '')) continue;
          r.report(n.value, `Review this hard-coded credential assigned to '${nm}'.`, `'${nm}'에 대입한 하드코딩된 자격 증명을 검토하세요.`);
        }
      },
      Dict(n, c, r) {
        if (c.isTest) return;
        n.keys.forEach((k, i) => {
          const nm = U.strValue(k);
          if (!nm || !CRED_NAME.test(nm)) return;
          const v = credValue(n.values[i]);
          if (!v || v.toLowerCase() === nm.toLowerCase()) return;
          r.report(n.values[i], `Review this hard-coded credential for key '${nm}'.`, `키 '${nm}'의 하드코딩된 자격 증명을 검토하세요.`);
        });
      },
      Constant(n, c, r) {
        if (c.isTest || n.kind !== 'str') return;
        const m = /^[a-z][a-z0-9+.-]*:\/\/([^/\s:@]+):([^/\s@]+)@/i.exec(n.value);
        if (!m || looksPlaceholder(m[2]) || /^[{$<%]/.test(m[2])) return;
        r.report(n, 'Review this URL: it embeds a hard-coded password.', '이 URL을 검토하세요. 하드코딩된 비밀번호가 들어 있습니다.');
      },
    },
  });

R('hardcoded-credentials-call', 'V', 'BL', 30, ['cwe-798', 'owasp-a07', 'secrets'], 'S6437',
  ['Credential passed as a literal to an API', 'API에 자격 증명을 리터럴로 넘깁니다'],
  ['Connecting with a literal password or key puts the credential in the source code.', '리터럴 비밀번호나 키로 연결하면 자격 증명이 소스 코드에 들어갑니다.'],
  ['Pass a value read from the environment or a secrets store.', '환경 변수나 비밀 저장소에서 읽은 값을 넘기세요.'],
  {
    on: {
      keyword(n, c, r) {
        if (c.isTest || !n.arg || !/^(?:password|passwd|pwd|passphrase|secret|client_secret|api_key|apikey|access_token|auth_token|token|secret_key|aws_secret_access_key|private_key)$/i.test(n.arg)) return;
        const v = credValue(n.value);
        if (!v) return;
        const call = n.parent;
        const name = c.q(call.func) || dotted(call.func) || '';
        if (/^(?:print|log|logging\.\w+|\w+\.(?:debug|info|warning|error))$/.test(name)) return;
        r.report(n.value, `Do not pass a hard-coded '${n.arg}' to '${short(name || 'this call', 40)}'.`, `'${short(name || '이 호출', 40)}'에 하드코딩된 '${n.arg}'를 넘기지 마세요.`);
      },
    },
  });

const DB_CONNECT = /^(?:psycopg2\.connect|psycopg\.connect|pymysql\.connect|MySQLdb\.connect|mysql\.connector\.connect|pymssql\.connect|cx_Oracle\.connect|oracledb\.connect|asyncpg\.connect|asyncpg\.create_pool|aiomysql\.connect|pyodbc\.connect|redis\.Redis|redis\.StrictRedis)$/;

R('empty-db-password', 'V', 'BL', 30, ['cwe-521', 'owasp-a07'], 'S2115',
  ['Database connection with an empty password', '빈 비밀번호로 데이터베이스에 연결합니다'],
  ['A database reachable without a password can be read and modified by anyone who reaches it.', '비밀번호 없이 접근 가능한 데이터베이스는 도달한 누구나 읽고 바꿀 수 있습니다.'],
  ['Protect the database with a strong password read from the environment.', '환경 변수에서 읽은 강한 비밀번호로 데이터베이스를 보호하세요.'],
  {
    on: {
      Call(n, c, r) {
        const name = q(c, n.func);
        if (!DB_CONNECT.test(name)) return;
        for (const key of ['password', 'passwd', 'pwd']) {
          const v = kw(n, key);
          if (v && U.strValue(v) === '') r.report(v, 'Use a non-empty database password.', '비어 있지 않은 데이터베이스 비밀번호를 쓰세요.');
        }
      },
      Dict(n, c, r) {
        if (!isDjangoSettings(c)) return;
        n.keys.forEach((k, i) => {
          if (U.strValue(k) === 'PASSWORD' && U.strValue(n.values[i]) === '' && n.keys.some((x) => U.strValue(x) === 'ENGINE' && !/sqlite/.test(U.strValue(n.values[n.keys.indexOf(x)]) || ''))) r.report(n.values[i], 'Use a non-empty database password.', '비어 있지 않은 데이터베이스 비밀번호를 쓰세요.');
        });
      },
    },
  });

// ── deserialization ─────────────────────────────────────────
const UNSAFE_LOADERS = /^(?:pickle|_pickle|cPickle|dill|cloudpickle)\.(?:load|loads|Unpickler)$|^(?:marshal)\.(?:load|loads)$|^shelve\.open$|^jsonpickle\.(?:decode|loads)$|^pandas\.read_pickle$|^joblib\.load$|^keras\.models\.load_model$/;

R('unsafe-deserialization', 'H', 'CR', 20, ['cwe-502', 'owasp-a08'], 'S5135',
  ['Unsafe deserialization', '안전하지 않은 역직렬화'],
  ['pickle-based formats (pickle, dill, joblib, shelve, pandas.read_pickle, torch.load, numpy allow_pickle) run arbitrary code while loading untrusted data.', 'pickle 기반 형식(pickle, dill, joblib, shelve, pandas.read_pickle, torch.load, numpy allow_pickle)은 신뢰할 수 없는 데이터를 읽는 동안 임의 코드를 실행합니다.'],
  ['Only load trusted data, or use a data-only format (JSON, safetensors, weights_only=True).', '신뢰할 수 있는 데이터만 읽거나 데이터 전용 형식(JSON, safetensors, weights_only=True)을 쓰세요.'],
  {
    on: {
      Call(n, c, r) {
        const name = q(c, n.func);
        if (!name) return;
        if (UNSAFE_LOADERS.test(name)) { r.report(n, `Make sure deserializing with '${name}' is safe here: it can execute code from the data.`, `여기서 '${name}'로 역직렬화해도 안전한지 확인하세요. 데이터의 코드를 실행할 수 있습니다.`); return; }
        if (name === 'torch.load') {
          const w = kw(n, 'weights_only');
          if (!w || isFalse(w)) r.report(n, "Pass weights_only=True to torch.load(); full unpickling can execute code.", "torch.load()에 weights_only=True를 넘기세요. 전체 언피클링은 코드를 실행할 수 있습니다.");
          return;
        }
        if (name === 'numpy.load') {
          const a = kw(n, 'allow_pickle');
          if (a && isTrue(a)) r.report(a, 'Make sure loading pickled objects with numpy.load is safe here.', 'numpy.load로 피클 객체를 읽어도 안전한지 확인하세요.');
        }
      },
    },
  });

R('unsafe-yaml-load', 'V', 'CR', 15, ['cwe-502', 'owasp-a08'], 'S5135',
  ['YAML loaded with an unsafe loader', '안전하지 않은 로더로 YAML을 읽습니다'],
  ['yaml.load without SafeLoader (or yaml.unsafe_load) can construct arbitrary Python objects and run code.', 'SafeLoader 없는 yaml.load(또는 yaml.unsafe_load)는 임의의 Python 객체를 만들고 코드를 실행할 수 있습니다.'],
  ['Use yaml.safe_load() or Loader=yaml.SafeLoader.', 'yaml.safe_load()나 Loader=yaml.SafeLoader를 쓰세요.'],
  {
    on: {
      Call(n, c, r) {
        const name = q(c, n.func);
        if (name === 'yaml.unsafe_load' || name === 'yaml.unsafe_load_all') { r.report(n, 'Use yaml.safe_load() instead of unsafe_load().', 'unsafe_load() 대신 yaml.safe_load()를 쓰세요.'); return; }
        if (name !== 'yaml.load' && name !== 'yaml.load_all') return;
        const loader = arg(n, 1, 'Loader');
        if (!loader) { r.report(n, 'Pass Loader=yaml.SafeLoader (or use yaml.safe_load()).', 'Loader=yaml.SafeLoader를 넘기거나 yaml.safe_load()를 쓰세요.'); return; }
        const ln = q(c, loader) || dotted(loader) || '';
        if (/(?:^|\.)(?:Loader|UnsafeLoader|FullLoader|CLoader|CUnsafeLoader|CFullLoader)$/.test(ln)) r.report(loader, `Use yaml.SafeLoader instead of ${ln.split('.').pop()}.`, `${ln.split('.').pop()} 대신 yaml.SafeLoader를 쓰세요.`);
      },
    },
  });

// ── files / processes / network ─────────────────────────────
R('insecure-temp-file', 'V', 'CR', 10, ['cwe-377', 'owasp-a01'], 'S5445',
  ['Insecure temporary file creation', '안전하지 않은 임시 파일 생성'],
  ['tempfile.mktemp / os.tempnam only return a name; another process can create that file first (race condition).', 'tempfile.mktemp / os.tempnam은 이름만 돌려주므로 다른 프로세스가 그 파일을 먼저 만들 수 있습니다(경쟁 상태).'],
  ['Use tempfile.mkstemp, NamedTemporaryFile or TemporaryDirectory.', 'tempfile.mkstemp, NamedTemporaryFile, TemporaryDirectory를 쓰세요.'],
  {
    on: {
      Call(n, c, r) {
        const name = q(c, n.func);
        if (/^(?:tempfile\.mktemp|os\.tempnam|os\.tmpnam)$/.test(name)) r.report(n, `'${name}' is insecure; use tempfile.mkstemp() or NamedTemporaryFile().`, `'${name}'는 안전하지 않습니다. tempfile.mkstemp()나 NamedTemporaryFile()을 쓰세요.`);
      },
    },
  });

R('publicly-writable-directory', 'H', 'CR', 10, ['cwe-377', 'cwe-379', 'owasp-a01'], 'S5443',
  ['File in a publicly writable directory', '누구나 쓸 수 있는 디렉터리의 파일'],
  ['Other users can pre-create or replace files under /tmp, /var/tmp or /dev/shm, leading to data leaks or tampering.', '다른 사용자가 /tmp, /var/tmp, /dev/shm 아래 파일을 미리 만들거나 바꿔 데이터가 새거나 변조될 수 있습니다.'],
  ['Use the tempfile module, which creates files with safe names and permissions.', '안전한 이름과 권한으로 파일을 만드는 tempfile 모듈을 쓰세요.'],
  {
    on: {
      Constant(n, c, r) {
        if (n.kind !== 'str' || c.isTest || !/^(?:\/tmp|\/var\/tmp|\/dev\/shm|\/usr\/tmp)(?:\/|$)/.test(n.value)) return;
        const p = n.parent;
        if (!p || !(p.type === 'Call' || p.type === 'keyword' || p.type === 'Assign' || p.type === 'BinOp' || p.type === 'JoinedStr')) return;
        r.report(n, `Make sure using the publicly writable directory '${short(n.value, 30)}' is safe here.`, `누구나 쓸 수 있는 디렉터리 '${short(n.value, 30)}'를 써도 안전한지 확인하세요.`);
      },
    },
  });

R('file-permissions-loose', 'H', 'MA', 10, ['cwe-732', 'cwe-266', 'owasp-a01'], 'S2612',
  ['Overly permissive file permissions', '지나치게 넓은 파일 권한'],
  ['Granting read/write/execute to others (or umask 0) exposes files to every user of the machine.', '다른 사용자에게 읽기/쓰기/실행을 주면(또는 umask 0) 컴퓨터의 모든 사용자에게 파일이 노출됩니다.'],
  ['Remove permissions for "others" (for example 0o600 / 0o750, umask 0o077).', '"다른 사용자" 권한을 빼세요(예: 0o600 / 0o750, umask 0o077).'],
  {
    on: {
      Call(n, c, r) {
        const name = q(c, n.func);
        if (/^(?:os\.chmod|os\.lchmod|os\.fchmod|pathlib\.Path\.chmod)$/.test(name) || (n.func.type === 'Attribute' && n.func.attr === 'chmod' && !name)) {
          const mode = name ? arg(n, 1, 'mode') : arg(n, 0, 'mode');
          const v = numValue(mode);
          if (v != null && (v & 0o007)) r.report(mode, `Make sure granting permissions to others (${'0o' + v.toString(8)}) is safe.`, `다른 사용자에게 권한(${'0o' + v.toString(8)})을 줘도 안전한지 확인하세요.`);
          else if (mode && /S_I(?:RWX|W|R|X)OTH/.test(c.slice(mode))) r.report(mode, 'Make sure granting permissions to others is safe.', '다른 사용자에게 권한을 줘도 안전한지 확인하세요.');
        } else if (name === 'os.umask') {
          const v = numValue(n.args[0]);
          if (v != null && (v & 0o007) !== 0o007) r.report(n, `Make sure this permissive umask (${'0o' + v.toString(8)}) is safe.`, `이 넓은 umask(${'0o' + v.toString(8)})가 안전한지 확인하세요.`);
        }
      },
    },
  });

R('archive-extraction', 'H', 'CR', 10, ['cwe-22', 'cwe-409', 'owasp-a01'], 'S5042',
  ['Archive extracted without validation', '검증 없이 압축을 풉니다'],
  ['Extracting untrusted archives can write outside the target directory (path traversal) or exhaust the disk (zip bomb).', '신뢰할 수 없는 압축 파일을 풀면 대상 디렉터리 밖에 쓰거나(경로 조작) 디스크를 고갈시킬 수 있습니다(zip bomb).'],
  ['Use tarfile extraction filters (filter="data"), validate member names and sizes, or limit the total size.', 'tarfile 추출 필터(filter="data")를 쓰고 항목 이름과 크기를 검증하거나 전체 크기를 제한하세요.'],
  {
    on: {
      Call(n, c, r) {
        const f = n.func;
        if (f.type !== 'Attribute' || (f.attr !== 'extractall' && f.attr !== 'extract')) return;
        const name = q(c, f) || '';
        const recv = f.value;
        const recvName = (recv.type === 'Call' ? q(c, recv.func) : '') || '';
        const tarish = /tarfile/.test(name + recvName) || c.imported('tarfile');
        const zipish = /zipfile/.test(name + recvName) || c.imported('zipfile');
        if (!tarish && !zipish && !c.imported('shutil')) return;
        if (kw(n, 'filter') || kw(n, 'members')) return;
        if (f.attr === 'extract' && !tarish) return;
        r.report(n, `Make sure that extracting this archive with '${f.attr}()' is safe (path traversal / decompression bomb).`, `'${f.attr}()'로 이 압축을 풀어도 안전한지 확인하세요(경로 조작 / 압축 폭탄).`);
      },
    },
  });

R('dynamic-code-execution', 'H', 'CR', 20, ['cwe-95', 'owasp-a03'], 'S1523',
  ['Dynamic code execution', '동적 코드 실행'],
  ['eval / exec run whatever string they receive; if any part of it can be influenced, it is arbitrary code execution.', 'eval / exec는 받은 문자열을 그대로 실행하므로, 일부라도 조작될 수 있으면 임의 코드 실행입니다.'],
  ['Avoid eval/exec; use ast.literal_eval, json or explicit dispatch.', 'eval/exec 대신 ast.literal_eval, json, 명시적 분기를 쓰세요.'],
  {
    on: {
      Call(n, c, r) {
        if (!(U.isBuiltinName(n.func, 'eval') || U.isBuiltinName(n.func, 'exec'))) return;
        const a = n.args[0];
        if (!a || (a.type === 'Constant' && a.kind === 'str')) return;
        r.report(n, `Make sure that this dynamic '${n.func.id}()' is safe here.`, `이 동적 '${n.func.id}()'가 안전한지 확인하세요.`);
      },
    },
  });

R('hardcoded-ip', 'H', 'MI', 5, ['cwe-547'], 'S1313',
  ['Hard-coded IP address', '하드코딩된 IP 주소'],
  ['A literal IP address ties the code to one network layout and may expose internal infrastructure.', '리터럴 IP 주소는 코드를 한 네트워크 구성에 묶고 내부 기반 시설을 드러낼 수 있습니다.'],
  ['Read the address from configuration or DNS.', '주소를 설정이나 DNS에서 읽으세요.'],
  {
    on: {
      Constant(n, c, r) {
        if (n.kind !== 'str' || c.isTest) return;
        const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?::\d+)?$/.exec(n.value);
        if (!m) return;
        const o = m.slice(1, 5).map(Number);
        if (o.some((x) => x > 255)) return;
        if (o[0] === 127 || o[0] === 0 || (o[0] === 255 && o[1] === 255) || (o[0] === 192 && o[1] === 0 && o[2] === 2) || (o[0] === 198 && o[1] === 51 && o[2] === 100) || (o[0] === 203 && o[1] === 0 && o[2] === 113) || o[0] >= 224) return;
        if (o.every((x) => x === o[0]) || /^\d+\.\d+\.\d+\.\d+$/.test(n.value) && o[0] < 10 && o[1] < 20 && o[3] < 20 && o[2] < 30 && !/(?:host|ip|addr|server|url|dns|gateway|bind)/i.test(c.lines[n.line - 1] || '')) return; // version numbers
        if (n.parent && n.parent.type === 'Expr') return;
        r.report(n, `Make sure using the hard-coded IP address '${n.value}' is safe here.`, `하드코딩된 IP 주소 '${n.value}'를 써도 안전한지 확인하세요.`);
      },
    },
  });

R('bind-all-interfaces', 'H', 'MA', 5, ['cwe-1327', 'owasp-a05'], null,
  ['Server bound to all network interfaces', '서버를 모든 네트워크 인터페이스에 바인딩합니다'],
  ['Binding to 0.0.0.0 (or "") exposes the service on every network the machine is connected to, not only localhost.', '0.0.0.0(또는 "")에 바인딩하면 localhost뿐 아니라 컴퓨터가 연결된 모든 네트워크에 서비스가 노출됩니다.'],
  ['Bind to 127.0.0.1 unless the service must be public, and protect it with authentication and a firewall.', '서비스가 공개되어야 하는 경우가 아니면 127.0.0.1에 바인딩하고, 인증과 방화벽으로 보호하세요.'],
  {
    on: {
      Call(n, c, r) {
        const f = n.func;
        const d = dotted(f) || '';
        if (f.type === 'Attribute' && f.attr === 'bind' && n.args[0] && n.args[0].type === 'Tuple' && n.args[0].elts.length >= 2) {
          const h = U.strValue(n.args[0].elts[0]);
          if (h === '0.0.0.0' || h === '' || h === '::') r.report(n.args[0].elts[0], 'Make sure binding the socket to all interfaces is safe.', '소켓을 모든 인터페이스에 바인딩해도 안전한지 확인하세요.');
          return;
        }
        const host = kw(n, 'host');
        if (host && (U.strValue(host) === '0.0.0.0' || U.strValue(host) === '::') && (/(?:^|\.)run$|serve|uvicorn|create_server|start_server|HTTPServer|launch/.test(d) || /uvicorn|flask|aiohttp|waitress|gradio/.test(q(c, f)))) {
          r.report(host, 'Make sure exposing this server on all interfaces is safe.', '이 서버를 모든 인터페이스에 노출해도 안전한지 확인하세요.');
        }
      },
    },
  });

R('ldap-anonymous-bind', 'V', 'BL', 15, ['cwe-521', 'owasp-a07'], 'S4433',
  ['LDAP connection without authentication', '인증 없는 LDAP 연결'],
  ['An anonymous or empty-password LDAP bind lets anyone query (or change) the directory.', '익명 또는 빈 비밀번호 LDAP 바인딩은 누구나 디렉터리를 조회(또는 변경)하게 합니다.'],
  ['Bind with a proper user and password.', '올바른 사용자와 비밀번호로 바인딩하세요.'],
  {
    on: {
      Call(n, c, r) {
        const f = n.func;
        if (f.type === 'Attribute' && /^simple_bind(?:_s)?$/.test(f.attr) && (c.imported('ldap') || c.imported('ldap3'))) {
          const pw = arg(n, 1, 'cred');
          if (n.args.length < 2 || (pw && (U.strValue(pw) === '' || (pw.type === 'Constant' && pw.kind === 'None')))) r.report(n, 'Provide a password when binding to LDAP.', 'LDAP에 바인딩할 때 비밀번호를 넘기세요.');
          return;
        }
        const name = q(c, f);
        if (/^ldap3\.Connection$/.test(name)) {
          const auth = kw(n, 'authentication');
          const pw = kw(n, 'password');
          if ((auth && /ANONYMOUS/.test(c.slice(auth))) || (pw && U.strValue(pw) === '')) r.report(n, 'Authenticate this LDAP connection.', '이 LDAP 연결을 인증하세요.');
        }
      },
    },
  });

R('signal-process', 'H', 'MI', 5, ['cwe-283'], 'S4828',
  ['Sending signals to processes', '프로세스에 시그널을 보냅니다'],
  ['Killing or signalling arbitrary process ids can stop unrelated services if the pid is wrong or attacker-controlled.', 'pid가 틀리거나 조작되면 임의의 프로세스에 시그널을 보내 관련 없는 서비스를 멈출 수 있습니다.'],
  ['Make sure the pid belongs to a process you started, and restrict who can trigger it.', 'pid가 직접 시작한 프로세스의 것인지 확인하고 실행할 수 있는 주체를 제한하세요.'],
  {
    on: {
      Call(n, c, r) {
        const name = q(c, n.func);
        if (name === 'os.kill' || name === 'os.killpg') r.report(n, `Make sure that sending a signal with '${name}' is safe here.`, `여기서 '${name}'로 시그널을 보내도 안전한지 확인하세요.`);
      },
    },
  });

R('hardcoded-jwt-secret', 'V', 'BL', 30, ['cwe-798', 'owasp-a07', 'secrets'], 'S6418',
  ['JWT signed or verified with a hard-coded secret', '하드코딩된 비밀로 JWT를 서명하거나 검증합니다'],
  ['Anyone who reads the source can mint valid tokens for any user.', '소스를 읽은 누구나 아무 사용자의 유효한 토큰을 만들 수 있습니다.'],
  ['Load the signing key from the environment or a key store.', '서명 키를 환경 변수나 키 저장소에서 읽으세요.'],
  {
    on: {
      Call(n, c, r) {
        const name = q(c, n.func);
        if (!/^(?:jwt\.encode|jwt\.decode|jose\.jwt\.encode|jose\.jwt\.decode)$/.test(name)) return;
        const key = arg(n, 1, 'key');
        const v = key ? U.strValue(key) : null;
        if (v && !looksPlaceholder(v) && v.length >= 3) r.report(key, 'Do not sign or verify JWTs with a hard-coded secret.', '하드코딩된 비밀로 JWT를 서명하거나 검증하지 마세요.');
      },
    },
  });

R('cleartext-http-url', 'H', 'MI', 5, ['cwe-319', 'owasp-a02'], 'S5332',
  ['Clear-text HTTP URL in a network call', '네트워크 호출에 평문 HTTP URL을 씁니다'],
  ['http:// traffic can be read and modified by anyone on the path.', 'http:// 통신은 경로 위의 누구나 읽고 바꿀 수 있습니다.'],
  ['Use https://.', 'https://를 쓰세요.'],
  {
    on: {
      Call(n, c, r) {
        const name = q(c, n.func);
        if (!/^(?:requests\.(?:get|post|put|patch|delete|head|request)|urllib\.request\.urlopen|urllib\.request\.Request|httpx\.(?:get|post|put|delete|request)|aiohttp\.request)$/.test(name)) return;
        const u = n.args[0] && (U.strValue(n.args[0]) || (n.args[0].type === 'JoinedStr' && n.args[0].values[0] && n.args[0].values[0].type === 'Constant' ? n.args[0].values[0].value : null));
        if (!u || !/^http:\/\//i.test(u)) return;
        if (/^http:\/\/(?:localhost|127\.|0\.0\.0\.0|\[::1\]|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|[^/]*\.local\b|[^/]*\.internal\b|example\.(?:com|org))/i.test(u)) return;
        r.report(n.args[0], 'Use HTTPS instead of clear-text HTTP for this request.', '이 요청에는 평문 HTTP 대신 HTTPS를 쓰세요.');
      },
    },
  });

R('assert-in-production', 'H', 'MI', 5, ['cwe-617'], null,
  ['Assert used to validate arguments', '인자 검증에 assert를 씁니다'],
  ['assert statements are removed when Python runs with -O, so validation done with them silently disappears in optimized deployments.', 'assert 문은 Python을 -O로 실행하면 제거되므로, 그것으로 한 검증은 최적화된 배포에서 조용히 사라집니다.'],
  ['Raise ValueError / TypeError / PermissionError explicitly.', 'ValueError / TypeError / PermissionError를 명시적으로 던지세요.'],
  {
    on: {
      Assert(n, c, r) {
        if (c.isTest || c.lineMap) return;
        const fn = U.enclosingDef(n);
        if (!fn || /^_/.test(fn.name)) return;
        const params = new Set([...fn.args.posonlyargs, ...fn.args.args, ...fn.args.kwonlyargs].map((p) => p.arg).filter((x) => x !== 'self' && x !== 'cls'));
        if (!params.size) return;
        let hit = null;
        walk(n.test, (m) => { if (!hit && m.type === 'Name' && params.has(m.id) && m.sym && m.sym.scope === fn.scope && m.sym.isParam) hit = m.id; return !hit; });
        if (!hit) return;
        r.report(n, `Argument '${hit}' is validated with assert; this check disappears under python -O.`, `인자 '${hit}'를 assert로 검증합니다. python -O에서는 이 검사가 사라집니다.`);
      },
    },
  });

// ── AWS CDK ─────────────────────────────────────────────────
function cdkCall(c, n, re) {
  const name = q(c, n.func);
  return re.test(name) && /^aws_cdk/.test(name);
}

R('cdk-s3-public-access', 'H', 'BL', 10, ['cwe-284', 'owasp-a01', 'aws'], 'S6265',
  ['S3 bucket allows public access', 'S3 버킷이 공개 접근을 허용합니다'],
  ['A publicly readable bucket exposes every object to the internet.', '공개 읽기 버킷은 모든 객체를 인터넷에 노출합니다.'],
  ['Remove public_read_access and keep BlockPublicAccess.BLOCK_ALL.', 'public_read_access를 빼고 BlockPublicAccess.BLOCK_ALL을 유지하세요.'],
  {
    on: {
      Call(n, c, r) {
        if (!cdkCall(c, n, /\.aws_s3\.Bucket$/)) return;
        const p = kw(n, 'public_read_access');
        if (p && isTrue(p)) r.report(p, 'Make sure granting public read access to this bucket is safe.', '이 버킷에 공개 읽기를 허용해도 안전한지 확인하세요.');
        const b = kw(n, 'block_public_access');
        if (b && b.type === 'Call' && b.keywords.some((k) => isFalse(k.value))) r.report(b, 'Make sure not blocking public access to this bucket is safe.', '이 버킷의 공개 접근을 막지 않아도 안전한지 확인하세요.');
      },
    },
  });

R('cdk-s3-unencrypted', 'H', 'MA', 10, ['cwe-311', 'owasp-a02', 'aws'], 'S6245',
  ['S3 bucket without server-side encryption', '서버 측 암호화 없는 S3 버킷'],
  ['Objects stored unencrypted are readable from leaked backups or misconfigured access.', '암호화 없이 저장한 객체는 유출된 백업이나 잘못된 접근 설정으로 읽힐 수 있습니다.'],
  ['Set encryption=BucketEncryption.S3_MANAGED or KMS.', 'encryption=BucketEncryption.S3_MANAGED 또는 KMS를 지정하세요.'],
  {
    on: {
      Call(n, c, r) {
        if (!cdkCall(c, n, /\.aws_s3\.Bucket$/)) return;
        const e = kw(n, 'encryption');
        if (e && /UNENCRYPTED/.test(c.slice(e))) r.report(e, 'Make sure using an unencrypted bucket is safe.', '암호화하지 않은 버킷을 써도 안전한지 확인하세요.');
        const ssl = kw(n, 'enforce_ssl');
        if (ssl && isFalse(ssl)) r.report(ssl, 'Make sure allowing clear-text access to this bucket is safe.', '이 버킷에 평문 접근을 허용해도 안전한지 확인하세요.');
      },
    },
  });

R('cdk-open-ingress', 'H', 'CR', 10, ['cwe-284', 'owasp-a01', 'aws'], 'S6321',
  ['Security group open to the whole internet', '인터넷 전체에 열린 보안 그룹'],
  ['Allowing ingress from 0.0.0.0/0 exposes the port (SSH, RDP, databases) to every attacker.', '0.0.0.0/0에서 들어오는 연결을 허용하면 포트(SSH, RDP, 데이터베이스)가 모든 공격자에게 노출됩니다.'],
  ['Restrict the source to known address ranges or security groups.', '출발지를 알려진 주소 범위나 보안 그룹으로 제한하세요.'],
  {
    on: {
      Call(n, c, r) {
        const f = n.func;
        if (f.type !== 'Attribute' || !/^(?:add_ingress_rule|allow_from|allow_default_port_from)$/.test(f.attr) || !c.imported('aws_cdk')) return;
        const peer = n.args[0];
        if (!peer) return;
        const txt = c.slice(peer);
        if (/any_ipv4|any_ipv6|0\.0\.0\.0\/0|::\/0/.test(txt)) r.report(peer, 'Make sure allowing traffic from the whole internet is safe.', '인터넷 전체의 트래픽을 허용해도 안전한지 확인하세요.');
      },
    },
  });

R('cdk-public-ip', 'H', 'MA', 10, ['cwe-668', 'owasp-a01', 'aws'], 'S6329',
  ['Cloud resource gets a public IP address', '클라우드 자원에 공인 IP를 부여합니다'],
  ['Instances with public addresses are directly reachable from the internet.', '공인 주소를 가진 인스턴스는 인터넷에서 바로 접근할 수 있습니다.'],
  ['Place the resource in a private subnet behind a load balancer or NAT.', '자원을 로드 밸런서나 NAT 뒤의 사설 서브넷에 두세요.'],
  {
    on: {
      Call(n, c, r) {
        if (!c.imported('aws_cdk')) return;
        const p = kw(n, 'associate_public_ip_address') || kw(n, 'publicly_accessible');
        if (p && isTrue(p)) r.report(p, 'Make sure giving this resource a public address is safe.', '이 자원에 공인 주소를 줘도 안전한지 확인하세요.');
      },
    },
  });

R('cdk-unencrypted-storage', 'H', 'MA', 10, ['cwe-311', 'owasp-a02', 'aws'], 'S6303',
  ['Database or queue storage not encrypted', '데이터베이스나 큐 저장소를 암호화하지 않습니다'],
  ['Unencrypted RDS volumes, SQS queues or SNS topics expose data from snapshots and backups.', '암호화하지 않은 RDS 볼륨, SQS 큐, SNS 토픽은 스냅숏과 백업에서 데이터가 노출됩니다.'],
  ['Enable storage_encrypted / encryption with a KMS key.', 'KMS 키로 storage_encrypted / encryption을 켜세요.'],
  {
    on: {
      Call(n, c, r) {
        if (!c.imported('aws_cdk')) return;
        const se = kw(n, 'storage_encrypted');
        if (se && isFalse(se)) { r.report(se, 'Make sure using unencrypted database storage is safe.', '암호화하지 않은 데이터베이스 저장소를 써도 안전한지 확인하세요.'); return; }
        const e = kw(n, 'encryption');
        if (e && /QueueEncryption\.UNENCRYPTED/.test(c.slice(e))) r.report(e, 'Make sure using an unencrypted queue is safe.', '암호화하지 않은 큐를 써도 안전한지 확인하세요.');
      },
    },
  });

module.exports = { RULES };
void walk;
