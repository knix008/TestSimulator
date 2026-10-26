'use strict';

// Security rules that do not need taint tracking (core/taint covers
// injection flows): crypto, TLS, cookies, CORS, headers, Electron, etc.

const { rule, m } = require('./define');
const W = require('../walk');
const U = require('./util');
const B = require('./bugs');

const { unwrapTS, propName, dottedName, staticValue, isFunction, keyName } = W;

function calls(ctx) {
  return ctx.nodesOf('CallExpression', 'NewExpression');
}

function tgt(ctx, call) {
  return ctx.target(call.callee);
}

// module function call: module name(s) + path
function isModuleCall(t, modules, path) {
  if (!t || !t.module) return false;
  if (!modules.includes(t.module)) return false;
  return t.path.join('.') === path;
}

function propValue(ctx, obj, name) {
  const o = U.resolveObject(ctx, obj);
  if (!o) return undefined;
  const p = W.objectProp(o, name);
  if (!p) return undefined;
  return p.value;
}

function constOf(ctx, node) {
  if (!node) return null;
  const v = U.constValue(ctx, node);
  return v ? v.value : undefined;
}

// Object literals reached as the value of property `name`.
function propsNamed(ctx, name) {
  const out = [];
  for (const p of ctx.nodes('Property')) {
    if (p.parent && p.parent.type === 'ObjectExpression' && keyName(p.key, p.computed) === name) out.push(p);
  }
  return out;
}

function boolProp(ctx, name, value) {
  return propsNamed(ctx, name).filter((p) => { const v = staticValue(p.value); return v && v.value === value; });
}

function cryptoTarget(ctx, call) {
  const t = tgt(ctx, call);
  if (!t) return null;
  if (t.module === 'crypto') return t.path.join('.');
  if (t.global && t.base === 'crypto') return t.path.join('.');
  return null;
}

// ---------------------------------------------------------------- crypto
const WEAK_HASHES = /^(md2|md4|md5|sha1|sha-1|ripemd|ripemd-?160|rmd160)$/i;

rule('weak-hash', {
  t: 'H', s: 'CR', debt: 30, sonar: 'S4790', cwe: ['CWE-328', 'CWE-327'], owasp: ['A02'], tags: ['cryptography'],
  name: ['Using weak hashing algorithms is security-sensitive', '약한 해시 알고리즘 사용은 보안에 민감합니다'],
  why: ['MD5 and SHA-1 collisions are practical; they must not protect integrity, signatures or passwords.', 'MD5와 SHA-1은 충돌을 실제로 만들 수 있어 무결성, 서명, 비밀번호 보호에 쓰면 안 됩니다.'],
  fix: ['Use SHA-256 or stronger (and a password hash such as bcrypt / scrypt / argon2 for passwords).', 'SHA-256 이상을 쓰세요 (비밀번호에는 bcrypt / scrypt / argon2 같은 비밀번호 해시).'],
}, (ctx) => {
  for (const call of calls(ctx)) {
    const c = cryptoTarget(ctx, call);
    let alg = null;
    if (c === 'createHash' || c === 'createHmac' || c === 'hash') alg = U.constString(ctx, call.arguments[0]);
    else if (c === 'subtle.digest') alg = U.constString(ctx, call.arguments[0]);
    else {
      const t = tgt(ctx, call);
      if (t && t.module === 'crypto-js' && /^(MD5|SHA1|HmacMD5|HmacSHA1|RIPEMD160)$/.test(t.path[0] || '')) alg = t.path[0];
      else if (t && t.base === 'CryptoJS' && /^(MD5|SHA1|HmacMD5|HmacSHA1|RIPEMD160)$/.test(t.path[0] || '')) alg = t.path[0];
      else if (t && (t.module === 'md5' || t.module === 'sha1') && t.path.length === 0) alg = t.module;
    }
    if (!alg) continue;
    const norm = alg.replace(/^Hmac/i, '');
    if (WEAK_HASHES.test(norm)) ctx.report(call, m(`Make sure this weak hash algorithm (${alg}) is not used in a sensitive context here.`, `약한 해시 알고리즘(${alg})을 민감한 곳에 쓰지 않는지 확인하세요.`));
  }
});

const WEAK_CIPHERS = /^(des|des-|des3|des-ede|rc2|rc4|bf|bf-|blowfish|cast|cast5|idea|seed)/i;

rule('weak-cipher', {
  t: 'V', s: 'CR', debt: 30, sonar: 'S5547', cwe: 'CWE-327', owasp: ['A02'], tags: ['cryptography'],
  name: ['Cipher algorithms should be robust', '암호 알고리즘은 강력해야 합니다'],
  why: ['DES, 3DES, RC2, RC4 and Blowfish are broken or have too small keys / blocks.', 'DES, 3DES, RC2, RC4, Blowfish는 깨졌거나 키 / 블록이 너무 작습니다.'],
  fix: ['Use AES-GCM or ChaCha20-Poly1305.', 'AES-GCM이나 ChaCha20-Poly1305를 쓰세요.'],
}, (ctx) => {
  for (const call of calls(ctx)) {
    const c = cryptoTarget(ctx, call);
    let alg = null;
    if (c === 'createCipheriv' || c === 'createDecipheriv' || c === 'createCipher' || c === 'createDecipher') alg = U.constString(ctx, call.arguments[0]);
    else {
      const t = tgt(ctx, call);
      const p = t && t.path.join('.');
      if (t && (t.module === 'crypto-js' || t.base === 'CryptoJS') && /^(DES|TripleDES|RC4|RC4Drop|Rabbit)\.(encrypt|decrypt)$/.test(p)) alg = p.split('.')[0];
    }
    if (alg && WEAK_CIPHERS.test(alg)) ctx.report(call, m(`Use a strong cipher algorithm instead of "${alg}".`, `"${alg}" 대신 강력한 암호 알고리즘을 쓰세요.`));
  }
});

rule('insecure-cipher-mode', {
  t: 'V', s: 'CR', debt: 30, sonar: 'S5542', cwe: 'CWE-327', owasp: ['A02'], tags: ['cryptography'],
  name: ['Encryption algorithms should be used with secure mode and padding scheme', '암호 알고리즘은 안전한 모드와 패딩으로 써야 합니다'],
  why: ['ECB leaks patterns of the plaintext, CBC with PKCS#7 padding is open to padding-oracle attacks, and RSA PKCS#1 v1.5 padding is malleable.', 'ECB는 평문의 패턴을 드러내고 PKCS#7 패딩의 CBC는 패딩 오라클 공격에 열려 있으며 RSA PKCS#1 v1.5 패딩은 변조될 수 있습니다.'],
  fix: ['Use an authenticated mode such as AES-GCM, and OAEP padding for RSA.', 'AES-GCM 같은 인증 모드와 RSA에는 OAEP 패딩을 쓰세요.'],
}, (ctx) => {
  for (const call of calls(ctx)) {
    const c = cryptoTarget(ctx, call);
    if (c === 'createCipheriv' || c === 'createDecipheriv' || c === 'createCipher') {
      const alg = U.constString(ctx, call.arguments[0]);
      if (alg && /-(ecb|cbc)$/i.test(alg)) ctx.report(call, m(`Use a secure mode and padding scheme instead of "${alg}".`, `"${alg}" 대신 안전한 모드와 패딩을 쓰세요.`));
    } else if (c === 'publicEncrypt' || c === 'privateDecrypt') {
      const pad = propValue(ctx, call.arguments[0], 'padding');
      if (pad && /RSA_PKCS1_PADDING$/.test(dottedName(pad) || '')) ctx.report(call, m('Use OAEP padding (RSA_PKCS1_OAEP_PADDING) instead of PKCS#1 v1.5.', 'PKCS#1 v1.5 대신 OAEP 패딩(RSA_PKCS1_OAEP_PADDING)을 쓰세요.'));
    } else {
      const t = tgt(ctx, call);
      if (t && (t.module === 'crypto-js' || t.base === 'CryptoJS') && /\.(encrypt|decrypt)$/.test(t.path.join('.'))) {
        const opts = call.arguments[2];
        const mode = propValue(ctx, opts, 'mode');
        if (mode && /mode\.ECB$/.test(dottedName(mode) || '')) ctx.report(call, m('Use a secure mode instead of ECB.', 'ECB 대신 안전한 모드를 쓰세요.'));
      }
    }
  }
});

function staticIv(ctx, n) {
  n = unwrapTS(n);
  if (!n) return false;
  if (n.type === 'Literal' && typeof n.value === 'string') return true;
  if (n.type === 'TemplateLiteral' && !n.expressions.length) return true;
  if (n.type === 'CallExpression' || n.type === 'NewExpression') {
    const dn = dottedName(n.callee) || '';
    if (/^Buffer\.(from|alloc)$/.test(dn)) {
      const a = unwrapTS(n.arguments[0]);
      if (dn === 'Buffer.alloc') return true;
      return !!a && ((a.type === 'Literal' && typeof a.value === 'string') || (a.type === 'ArrayExpression' && a.elements.every((e) => e && W.isLiteral(e))));
    }
    if (/^(Uint8Array|Buffer)$/.test(dn) && n.arguments.length === 1 && W.isLiteral(n.arguments[0])) return true;
  }
  if (n.type === 'Identifier') {
    const v = ctx.varOf(n);
    const d = v && v.defs.length === 1 ? v.defs[0] : null;
    if (d && d.kind === 'const' && d.node && d.node.type === 'VariableDeclarator' && d.node.id === d.id && d.node.init && d.node.init !== n) return staticIv(ctx, d.node.init);
  }
  return false;
}

rule('cipher-static-iv', {
  t: 'V', s: 'CR', debt: 15, sonar: 'S3329', cwe: 'CWE-329', owasp: ['A02'], tags: ['cryptography'],
  name: ['Cipher algorithms should be used with a secure, random IV', '암호 알고리즘은 안전한 무작위 IV와 함께 써야 합니다'],
  why: ['A fixed or missing initialization vector makes identical plaintexts encrypt to identical ciphertexts.', '고정되었거나 없는 IV는 같은 평문을 같은 암호문으로 만듭니다.'],
  fix: ['Generate a new IV with crypto.randomBytes() for every encryption.', '암호화할 때마다 crypto.randomBytes()로 새 IV를 만드세요.'],
}, (ctx) => {
  for (const call of calls(ctx)) {
    const c = cryptoTarget(ctx, call);
    if (c === 'createCipher') ctx.report(call, m('"crypto.createCipher" derives a fixed IV from the key; use createCipheriv() with a random IV.', '"crypto.createCipher"는 키에서 고정 IV를 만듭니다. 무작위 IV와 createCipheriv()를 쓰세요.'));
    else if (c === 'createCipheriv') {
      const alg = U.constString(ctx, call.arguments[0]) || '';
      if (/-ecb$/i.test(alg)) continue;
      if (staticIv(ctx, call.arguments[2])) ctx.report(call.arguments[2], m('Use a randomly generated IV instead of a static one.', '고정 IV 대신 무작위로 만든 IV를 쓰세요.'));
    }
  }
});

const WEAK_CURVES = /^(secp112r[12]|secp128r[12]|secp160(k1|r1|r2)|secp192k1|prime192v[123]|sect113r[12]|sect131r[12]|sect163(k1|r1|r2)|c2pnb163v[123]|wap-wsg-idm-ecid-wtls\d+)$/i;

rule('weak-key-size', {
  t: 'V', s: 'CR', debt: 30, sonar: 'S4426', cwe: 'CWE-326', owasp: ['A02'], tags: ['cryptography'],
  name: ['Cryptographic keys should be robust', '암호 키는 강력해야 합니다'],
  why: ['RSA / DSA / DH keys under 2048 bits and short elliptic curves can be broken with today\'s computing power.', '2048비트 미만의 RSA / DSA / DH 키와 짧은 타원 곡선은 오늘날의 계산 능력으로 깨질 수 있습니다.'],
  fix: ['Use at least 2048-bit RSA keys or a 224-bit+ curve (e.g. P-256).', '최소 2048비트 RSA 키나 224비트 이상 곡선(예: P-256)을 쓰세요.'],
}, (ctx) => {
  for (const call of calls(ctx)) {
    const c = cryptoTarget(ctx, call);
    if (c === 'generateKeyPair' || c === 'generateKeyPairSync') {
      const type = U.constString(ctx, call.arguments[0]);
      const opts = call.arguments[1];
      if (type === 'rsa' || type === 'rsa-pss' || type === 'dsa' || type === 'dh') {
        const len = constOf(ctx, propValue(ctx, opts, 'modulusLength'));
        if (typeof len === 'number' && len < 2048) ctx.report(call, m(`Use a key length of at least 2048 bits for ${type.toUpperCase()} (found ${len}).`, `${type.toUpperCase()}에는 2048비트 이상의 키 길이를 쓰세요 (현재 ${len}).`));
      } else if (type === 'ec') {
        const curve = constOf(ctx, propValue(ctx, opts, 'namedCurve'));
        if (typeof curve === 'string' && WEAK_CURVES.test(curve)) ctx.report(call, m(`Use a stronger elliptic curve than "${curve}".`, `"${curve}"보다 강한 타원 곡선을 쓰세요.`));
      }
    } else if (c === 'createDiffieHellman') {
      const len = constOf(ctx, call.arguments[0]);
      if (typeof len === 'number' && len < 2048) ctx.report(call, m(`Use a prime length of at least 2048 bits (found ${len}).`, `2048비트 이상의 소수 길이를 쓰세요 (현재 ${len}).`));
    } else {
      const t = tgt(ctx, call);
      if (t && /(^|\.)rsa\.generateKeyPair$/.test(t.path.join('.')) && (t.module === 'node-forge' || t.base === 'forge')) {
        const a = call.arguments[0];
        const bits = constOf(ctx, a) ?? constOf(ctx, propValue(ctx, a, 'bits'));
        if (typeof bits === 'number' && bits < 2048) ctx.report(call, m(`Use a key length of at least 2048 bits (found ${bits}).`, `2048비트 이상의 키 길이를 쓰세요 (현재 ${bits}).`));
      }
    }
  }
});

const WEAK_PROTOCOLS = /^(SSLv2_method|SSLv3_method|TLSv1_method|TLSv1_1_method|SSLv2_client_method|SSLv2_server_method|SSLv3_client_method|SSLv3_server_method|TLSv1_client_method|TLSv1_server_method|TLSv1_1_client_method|TLSv1_1_server_method)$/;

rule('weak-tls', {
  t: 'V', s: 'CR', debt: 30, sonar: 'S4423', cwe: 'CWE-327', owasp: ['A02'], tags: ['cryptography', 'tls'],
  name: ['Weak SSL/TLS protocols should not be used', '약한 SSL/TLS 프로토콜을 쓰면 안 됩니다'],
  why: ['SSLv3, TLS 1.0 and TLS 1.1 have known attacks (POODLE, BEAST) and are deprecated.', 'SSLv3, TLS 1.0, TLS 1.1은 알려진 공격(POODLE, BEAST)이 있고 폐기되었습니다.'],
  fix: ['Require TLS 1.2 or later (minVersion: "TLSv1.2").', 'TLS 1.2 이상을 요구하세요 (minVersion: "TLSv1.2").'],
}, (ctx) => {
  for (const p of propsNamed(ctx, 'secureProtocol')) {
    const v = constOf(ctx, p.value);
    if (typeof v === 'string' && WEAK_PROTOCOLS.test(v)) ctx.report(p, m(`Change this code to use a stronger protocol than "${v}".`, `"${v}"보다 강한 프로토콜을 쓰도록 고치세요.`));
  }
  for (const name of ['minVersion', 'maxVersion']) {
    for (const p of propsNamed(ctx, name)) {
      const v = constOf(ctx, p.value);
      if (typeof v === 'string' && /^(TLSv1|TLSv1\.1|SSLv3)$/.test(v) && (name === 'minVersion' || true)) {
        if (name === 'maxVersion' && v !== 'TLSv1' && v !== 'TLSv1.1' && v !== 'SSLv3') continue;
        ctx.report(p, m(`Change this code to use TLS 1.2 or later instead of "${v}".`, `"${v}" 대신 TLS 1.2 이상을 쓰도록 고치세요.`));
      }
    }
  }
});

rule('tls-reject-unauthorized', {
  t: 'V', s: 'CR', debt: 30, sonar: 'S4830', cwe: 'CWE-295', owasp: ['A07'], tags: ['tls'],
  name: ['Server certificates should be verified during SSL/TLS connections', 'SSL/TLS 연결에서 서버 인증서를 검증해야 합니다'],
  why: ['With certificate validation disabled anyone on the network can impersonate the server (man-in-the-middle).', '인증서 검증을 끄면 네트워크의 누구나 서버를 사칭할 수 있습니다 (중간자 공격).'],
  fix: ['Keep rejectUnauthorized enabled and add the CA with the "ca" option if needed.', 'rejectUnauthorized를 켜 두고 필요하면 "ca" 옵션으로 CA를 추가하세요.'],
}, (ctx) => {
  for (const p of boolProp(ctx, 'rejectUnauthorized', false)) ctx.report(p, m('Enable server certificate validation on this SSL/TLS connection.', '이 SSL/TLS 연결에서 서버 인증서 검증을 켜세요.'));
  for (const p of boolProp(ctx, 'strictSSL', false)) ctx.report(p, m('Enable server certificate validation (strictSSL) on this request.', '이 요청에서 서버 인증서 검증(strictSSL)을 켜세요.'));
});

rule('tls-env-disabled', {
  t: 'V', s: 'CR', debt: 15, sonar: 'S4830', cwe: 'CWE-295', owasp: ['A07'], tags: ['tls'],
  name: ['TLS certificate validation should not be disabled globally', 'TLS 인증서 검증을 전역으로 끄면 안 됩니다'],
  why: ['NODE_TLS_REJECT_UNAUTHORIZED=0 disables certificate checks for every HTTPS request of the process.', 'NODE_TLS_REJECT_UNAUTHORIZED=0은 프로세스의 모든 HTTPS 요청에서 인증서 검사를 끕니다.'],
  fix: ['Remove this assignment; trust specific CAs instead.', '이 대입을 지우고 특정 CA를 신뢰하도록 하세요.'],
}, (ctx) => {
  for (const a of ctx.nodes('AssignmentExpression')) {
    const n = dottedName(a.left);
    if (n !== 'process.env.NODE_TLS_REJECT_UNAUTHORIZED') continue;
    const v = staticValue(a.right);
    if (v && (v.value === '0' || v.value === 0 || v.value === false || v.value === 'false')) ctx.report(a, m('Do not disable TLS certificate validation for the whole process.', '프로세스 전체에서 TLS 인증서 검증을 끄지 마세요.'));
  }
});

rule('hostname-not-verified', {
  t: 'V', s: 'CR', debt: 15, sonar: 'S5527', cwe: 'CWE-297', owasp: ['A07'], tags: ['tls'],
  name: ['Server hostnames should be verified during SSL/TLS connections', 'SSL/TLS 연결에서 서버 호스트 이름을 검증해야 합니다'],
  why: ['A checkServerIdentity callback that accepts everything lets any valid certificate impersonate the server.', '모든 것을 받아들이는 checkServerIdentity 콜백은 아무 유효한 인증서로나 서버를 사칭하게 합니다.'],
  fix: ['Remove the override or delegate to tls.checkServerIdentity().', '재정의를 지우거나 tls.checkServerIdentity()에 맡기세요.'],
}, (ctx) => {
  for (const p of propsNamed(ctx, 'checkServerIdentity')) {
    const f = unwrapTS(p.value);
    if (!isFunction(f)) continue;
    let accepts = false;
    if (f.body.type !== 'BlockStatement') accepts = W.isNullish(f.body);
    // a throw or a call to something that looks like a check (verify / pin / assert ...) may reject the certificate
    else accepts = !B.ownReturns(f).some((r) => r.argument && !W.isNullish(r.argument)) && !U.contains(f.body, (n) => n.type === 'ThrowStatement' || (n.type === 'CallExpression' && /check|verif|valid|assert|pin|match|compare|reject/i.test(W.calleeProp(n) || dottedName(n.callee) || '')), false);
    if (accepts) ctx.report(p, m('Enable server hostname verification; this callback accepts every certificate.', '서버 호스트 이름 검증을 켜세요. 이 콜백은 모든 인증서를 받아들입니다.'));
  }
});

// ---------------------------------------------------------------- web
rule('cors-any-origin', {
  t: 'H', s: 'MI', debt: 10, sonar: 'S5122', cwe: ['CWE-346', 'CWE-942'], owasp: ['A05'], tags: ['cors'],
  name: ['Having a permissive Cross-Origin Resource Sharing policy is security-sensitive', '허용적인 CORS 정책은 보안에 민감합니다'],
  why: ['Access-Control-Allow-Origin: * lets any website read responses of this server from a user\'s browser.', 'Access-Control-Allow-Origin: *는 어떤 웹사이트든 사용자의 브라우저로 이 서버의 응답을 읽게 합니다.'],
  fix: ['Allow only the trusted origins explicitly.', '신뢰하는 출처만 명시적으로 허용하세요.'],
}, (ctx) => {
  for (const call of ctx.nodes('CallExpression')) {
    const t = tgt(ctx, call);
    if (t && t.module === 'cors' && t.path.length === 0) {
      const opts = call.arguments[0];
      if (!opts) { ctx.report(call, m('Make sure that enabling CORS for every origin is safe here.', '모든 출처에 CORS를 여는 것이 안전한지 확인하세요.')); continue; }
      const o = propValue(ctx, opts, 'origin');
      const v = o && staticValue(o);
      if (v && (v.value === '*')) ctx.report(call, m('Make sure that enabling CORS for every origin is safe here.', '모든 출처에 CORS를 여는 것이 안전한지 확인하세요.'));
      continue;
    }
    const p = W.calleeProp(call);
    if ((p === 'setHeader' || p === 'header' || p === 'set' || p === 'append') && call.arguments.length >= 2) {
      const h = U.constString(ctx, call.arguments[0]);
      const v = U.constString(ctx, call.arguments[1]);
      if (h && h.toLowerCase() === 'access-control-allow-origin' && v === '*') ctx.report(call, m('Make sure that allowing every origin with "Access-Control-Allow-Origin: *" is safe here.', '"Access-Control-Allow-Origin: *"로 모든 출처를 허용하는 것이 안전한지 확인하세요.'));
    }
  }
  for (const pr of ctx.nodes('Property')) {
    const k = keyName(pr.key, pr.computed);
    if (!k || k.toLowerCase() !== 'access-control-allow-origin') continue;
    const v = staticValue(pr.value);
    if (v && v.value === '*') ctx.report(pr, m('Make sure that allowing every origin with "Access-Control-Allow-Origin: *" is safe here.', '"Access-Control-Allow-Origin: *"로 모든 출처를 허용하는 것이 안전한지 확인하세요.'));
  }
});

function cookieOptionRule(id, sonar, cwe, flag, flagKo) {
  rule(id, {
    t: 'H', s: 'MI', debt: 5, sonar, cwe, owasp: ['A05'], tags: ['cookie'],
    name: [`Creating cookies without the "${flag}" flag is security-sensitive`, `"${flag}" 플래그 없이 쿠키를 만드는 것은 보안에 민감합니다`],
    why: [flag === 'secure' ? 'Without the secure flag the cookie is also sent over plain HTTP, where it can be intercepted.' : 'Without the HttpOnly flag the cookie is readable from JavaScript, so an XSS flaw can steal it.', flag === 'secure' ? 'secure 플래그가 없으면 쿠키가 평문 HTTP로도 전송되어 가로챌 수 있습니다.' : 'HttpOnly 플래그가 없으면 JavaScript에서 쿠키를 읽을 수 있어 XSS로 훔칠 수 있습니다.'],
    fix: [`Set ${flag}: true on the cookie options.`, `쿠키 옵션에 ${flag}: true를 설정하세요.`],
  }, (ctx) => {
    const optName = flag === 'secure' ? 'secure' : 'httpOnly';
    for (const call of ctx.nodes('CallExpression')) {
      const t = tgt(ctx, call);
      let opts = null;
      const p = W.calleeProp(call);
      if (p === 'cookie' && call.arguments.length >= 2 && unwrapTS(call.callee).type === 'MemberExpression') opts = call.arguments[2];
      else if (t && (t.module === 'cookie-session' || t.module === 'express-session' || t.module === 'csurf') && t.path.length === 0) {
        const o = call.arguments[0];
        opts = t.module === 'cookie-session' ? o : propValue(ctx, o, 'cookie');
      } else if (t && t.module === 'cookie' && t.path.join('.') === 'serialize') opts = call.arguments[2];
      if (!opts) continue;
      const v = propValue(ctx, opts, optName);
      const sv = v && staticValue(v);
      if (sv && sv.value === false) ctx.report(v, m(`Make sure creating this cookie without the "${flag}" flag is safe here.`, `"${flag}" 플래그 없이 이 쿠키를 만드는 것이 안전한지 확인하세요.`));
    }
  });
  void flagKo;
}
cookieOptionRule('cookie-not-secure', 'S2092', 'CWE-614', 'secure', 'secure');
cookieOptionRule('cookie-not-httponly', 'S3330', 'CWE-1004', 'HttpOnly', 'HttpOnly');

rule('cookie-write', {
  t: 'H', s: 'MI', debt: 5, sonar: 'S2255', cwe: 'CWE-565', tags: ['cookie'],
  name: ['Writing cookies is security-sensitive', '쿠키를 쓰는 것은 보안에 민감합니다'],
  why: ['Cookies written from JavaScript cannot be HttpOnly and are sent with every request; sensitive data must not be stored there.', 'JavaScript에서 쓴 쿠키는 HttpOnly가 될 수 없고 모든 요청에 함께 보내집니다. 민감한 데이터를 두면 안 됩니다.'],
  fix: ['Make sure the cookie contains no sensitive data, or set it from the server.', '쿠키에 민감한 데이터가 없는지 확인하거나 서버에서 설정하세요.'],
}, (ctx) => {
  for (const a of ctx.nodes('AssignmentExpression')) {
    if (/^((window|globalThis|self)\.)?document\.cookie$/.test(dottedName(a.left) || '')) ctx.report(a, m('Make sure that cookie is written safely here.', '여기서 쿠키를 안전하게 쓰는지 확인하세요.'));
  }
});

function jwtCall(ctx, call, fnName) {
  const t = tgt(ctx, call);
  return !!t && (t.module === 'jsonwebtoken' || (t.local && /^jwt$/i.test(t.base) && false)) && t.path.join('.') === fnName;
}

rule('jwt-weak-algorithm', {
  t: 'V', s: 'CR', debt: 30, sonar: 'S5659', cwe: 'CWE-347', owasp: ['A02'], tags: ['jwt'],
  name: ['JWT should be signed and verified with strong cipher algorithms', 'JWT는 강력한 알고리즘으로 서명하고 검증해야 합니다'],
  why: ['The "none" algorithm means the token is not signed at all, so anyone can forge it.', '"none" 알고리즘은 토큰에 서명하지 않는다는 뜻이라 누구나 위조할 수 있습니다.'],
  fix: ['Use HS256 / RS256 / ES256 and pin the accepted algorithms when verifying.', 'HS256 / RS256 / ES256을 쓰고 검증할 때 허용 알고리즘을 고정하세요.'],
}, (ctx) => {
  for (const call of ctx.nodes('CallExpression')) {
    if (jwtCall(ctx, call, 'sign')) {
      const alg = constOf(ctx, propValue(ctx, call.arguments[2], 'algorithm'));
      if (typeof alg === 'string' && alg.toLowerCase() === 'none') ctx.report(call, m('Use a strong signing algorithm instead of "none".', '"none" 대신 강력한 서명 알고리즘을 쓰세요.'));
    } else if (jwtCall(ctx, call, 'verify')) {
      const algs = unwrapTS(propValue(ctx, call.arguments[2], 'algorithms') || { type: 'X' });
      if (algs.type === 'ArrayExpression' && algs.elements.some((e) => e && (staticValue(e) || {}).value === 'none')) ctx.report(call, m('Do not accept the "none" algorithm when verifying JWTs.', 'JWT를 검증할 때 "none" 알고리즘을 받아들이지 마세요.'));
    }
  }
});

rule('jwt-ignore-expiration', {
  t: 'V', s: 'MA', debt: 15, sonar: 'S5659', cwe: 'CWE-613', owasp: ['A07'], tags: ['jwt'],
  name: ['JWT expiration should be verified', 'JWT 만료를 검증해야 합니다'],
  why: ['ignoreExpiration: true accepts tokens forever, so a leaked token never stops working.', 'ignoreExpiration: true는 토큰을 영원히 받아들여 유출된 토큰이 계속 동작합니다.'],
  fix: ['Remove ignoreExpiration and use short-lived tokens.', 'ignoreExpiration을 지우고 수명이 짧은 토큰을 쓰세요.'],
}, (ctx) => {
  for (const call of ctx.nodes('CallExpression')) {
    if (!jwtCall(ctx, call, 'verify')) continue;
    const v = propValue(ctx, call.arguments[2], 'ignoreExpiration');
    const sv = v && staticValue(v);
    if (sv && sv.value === true) ctx.report(v, m('Do not ignore the expiration of JWTs.', 'JWT 만료를 무시하지 마세요.'));
  }
});

rule('jwt-decode-unverified', {
  t: 'V', s: 'MA', debt: 15, sonar: 'S5659', cwe: 'CWE-347', owasp: ['A02'], tags: ['jwt'],
  name: ['JWT payloads should not be trusted without verification', '검증하지 않은 JWT 페이로드를 믿으면 안 됩니다'],
  why: ['jwt.decode() does not check the signature; using its result for authorization lets anyone forge claims.', 'jwt.decode()는 서명을 검사하지 않습니다. 그 결과로 권한을 판단하면 누구나 클레임을 위조할 수 있습니다.'],
  fix: ['Use jwt.verify() with the key before trusting the payload.', '페이로드를 믿기 전에 키와 함께 jwt.verify()를 쓰세요.'],
}, (ctx) => {
  const decodes = ctx.nodes('CallExpression').filter((c) => jwtCall(ctx, c, 'decode'));
  if (!decodes.length) return;
  if (ctx.nodes('CallExpression').some((c) => jwtCall(ctx, c, 'verify'))) return;
  for (const c of decodes) ctx.report(c, m('Make sure this token is verified elsewhere before its claims are trusted.', '클레임을 믿기 전에 이 토큰을 다른 곳에서 검증하는지 확인하세요.'));
});

function isGlobalFn(ctx, callee, names) {
  const c = unwrapTS(callee);
  if (c.type === 'Identifier') return names.includes(c.name) && B.isUnresolved(ctx, c);
  const dn = dottedName(c);
  return !!dn && /^(window|globalThis|self|global)\./.test(dn) && names.includes(dn.split('.').pop()) && B.isUnresolved(ctx, c.object.type === 'Identifier' ? c.object : { type: 'X' });
}

function dynamicCode(n) {
  n = unwrapTS(n);
  if (!n) return false;
  if (n.type === 'Literal' || (n.type === 'TemplateLiteral' && !n.expressions.length)) return false;
  return !isFunction(n);
}

rule('dynamic-code-execution', {
  t: 'H', s: 'CR', debt: 30, sonar: 'S1523', cwe: 'CWE-95', owasp: ['A03'], tags: ['injection'],
  name: ['Dynamically executing code is security-sensitive', '코드를 동적으로 실행하는 것은 보안에 민감합니다'],
  why: ['eval, new Function, string timers and vm.run* execute arbitrary text as code; if any part comes from outside, it is code injection.', 'eval, new Function, 문자열 타이머, vm.run*은 임의의 문자열을 코드로 실행합니다. 일부라도 외부에서 오면 코드 주입입니다.'],
  fix: ['Avoid executing strings; map inputs to predefined functions.', '문자열을 실행하지 말고 입력을 미리 정의한 함수에 대응시키세요.'],
}, (ctx) => {
  for (const call of calls(ctx)) {
    const a0 = call.arguments[0];
    if (isGlobalFn(ctx, call.callee, ['eval']) && call.type === 'CallExpression' && dynamicCode(a0)) { ctx.report(call, m('Make sure that this dynamic injection or execution of code is safe.', '이 동적 코드 실행이 안전한지 확인하세요.')); continue; }
    if (isGlobalFn(ctx, call.callee, ['Function']) && call.arguments.length && call.arguments.some((a) => dynamicCode(a))) { ctx.report(call, m('Make sure that this dynamic injection or execution of code is safe.', '이 동적 코드 실행이 안전한지 확인하세요.')); continue; }
    if (isGlobalFn(ctx, call.callee, ['setTimeout', 'setInterval', 'setImmediate', 'execScript']) && a0) {
      const x = unwrapTS(a0);
      if (x.type === 'Literal' && typeof x.value === 'string' || x.type === 'TemplateLiteral' || (x.type === 'BinaryExpression' && x.operator === '+')) ctx.report(call, m('Pass a function instead of a string to this timer; strings are evaluated as code.', '이 타이머에는 문자열 대신 함수를 넘기세요. 문자열은 코드로 실행됩니다.'));
      continue;
    }
    const t = tgt(ctx, call);
    if (t && t.module === 'vm' && /^(runInNewContext|runInThisContext|runInContext|compileFunction|Script)$/.test(t.path.join('.')) && dynamicCode(a0)) ctx.report(call, m('Make sure that executing this code with the "vm" module is safe.', '"vm" 모듈로 이 코드를 실행하는 것이 안전한지 확인하세요.'));
  }
});

function handlerChecksOrigin(ctx, fn) {
  if (!fn) return true;
  fn = unwrapTS(fn);
  if (fn.type === 'Identifier') {
    const f = B.localFunction(ctx, fn);
    if (!f) return true;
    fn = f;
  }
  if (!isFunction(fn)) return true;
  if (!fn.params.length) return true;
  return U.contains(fn.body, (n) => (n.type === 'MemberExpression' && /^(origin|source)$/.test(propName(n) || '')) || (n.type === 'Identifier' && n.name === 'origin') || (n.type === 'Property' && keyName(n.key, n.computed) === 'origin'), true)
    || (fn.params[0] && fn.params[0].type === 'ObjectPattern' && fn.params[0].properties.some((p) => p.type === 'Property' && keyName(p.key, p.computed) === 'origin'));
}

rule('postmessage-origin', {
  t: 'H', s: 'MI', debt: 10, sonar: 'S2819', cwe: 'CWE-345', owasp: ['A01'], tags: ['html5'],
  name: ['Origins should be verified during cross-origin communications', '교차 출처 통신에서는 출처를 검증해야 합니다'],
  why: ['postMessage(data, "*") sends data to any page that is loaded in the target window, and a "message" listener without an origin check accepts messages from any site.', 'postMessage(data, "*")는 대상 창에 로드된 어떤 페이지에도 데이터를 보내고, 출처 검사 없는 "message" 리스너는 어떤 사이트의 메시지도 받아들입니다.'],
  fix: ['Pass the exact target origin, and check event.origin in message handlers.', '정확한 대상 출처를 넘기고 메시지 처리기에서 event.origin을 검사하세요.'],
}, (ctx) => {
  for (const call of ctx.nodes('CallExpression')) {
    const c = unwrapTS(call.callee);
    const p = W.calleeProp(call);
    if (p === 'postMessage' && call.arguments.length >= 2 && c.type === 'MemberExpression') {
      const o = U.constString(ctx, call.arguments[1]);
      const recv = dottedName(c.object) || '';
      if (o === '*' && !/(worker|port|channel|self)$/i.test(recv)) ctx.report(call, m('Specify a target origin instead of "*" for this postMessage call.', '이 postMessage 호출에는 "*" 대신 대상 출처를 지정하세요.'));
      continue;
    }
    if (p === 'addEventListener' && U.constString(ctx, call.arguments[0]) === 'message') {
      const recv = c.type === 'MemberExpression' ? dottedName(c.object) : (c.type === 'Identifier' && B.isUnresolved(ctx, c) ? 'window' : null);
      if (recv !== 'window' && recv !== 'globalThis') continue;
      if (/worker/i.test(ctx.file)) continue;
      if (!handlerChecksOrigin(ctx, call.arguments[1])) ctx.report(call, m('Verify the origin of the received message in this "message" listener.', '이 "message" 리스너에서 받은 메시지의 출처를 검증하세요.'));
    }
  }
  for (const a of ctx.nodes('AssignmentExpression')) {
    if (dottedName(a.left) === 'window.onmessage' && !handlerChecksOrigin(ctx, a.right)) ctx.report(a, m('Verify the origin of the received message in this "message" handler.', '이 "message" 처리기에서 받은 메시지의 출처를 검증하세요.'));
  }
});

const IPV4 = /^(?:(?:https?|ftp|wss?|tcp|udp):\/\/)?((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(:\d{1,5})?(\/.*)?$/;
const IPV6 = /^(?:[0-9a-f]{1,4}:){7}[0-9a-f]{1,4}$|^(?:[0-9a-f]{1,4}:){1,7}:$|^(?:[0-9a-f]{1,4}:){1,6}:[0-9a-f]{1,4}$|^::(?:[0-9a-f]{1,4}:){0,5}[0-9a-f]{1,4}$/i;

rule('hardcoded-ip', {
  t: 'H', s: 'MI', debt: 10, sonar: 'S1313', cwe: 'CWE-547', tags: ['configuration'],
  name: ['Using hardcoded IP addresses is security-sensitive', '하드코딩한 IP 주소를 쓰는 것은 보안에 민감합니다'],
  why: ['Hard-coded addresses need a redeploy to change, can leak internal topology and often bypass DNS-based protections.', '하드코딩한 주소는 바꾸려면 다시 배포해야 하고 내부 구조를 드러내며 DNS 기반 보호를 우회하기 쉽습니다.'],
  fix: ['Read the address from configuration or the environment.', '설정이나 환경 변수에서 주소를 읽으세요.'],
}, (ctx) => {
  for (const n of ctx.nodes('Literal')) {
    if (typeof n.value !== 'string' || n.value.length < 7 || n.value.length > 80) continue;
    const s = n.value.trim();
    let ip = null;
    const mm = IPV4.exec(s);
    if (mm) ip = s.replace(/^[a-z]+:\/\//i, '').split(/[:/]/)[0];
    else if (IPV6.test(s)) ip = s;
    if (!ip) continue;
    if (/^(127\.|0\.0\.0\.0$|255\.255\.255\.255$|192\.0\.2\.|198\.51\.100\.|203\.0\.113\.|2\.5\.|1\.1\.1\.1$|8\.8\.8\.8$|8\.8\.4\.4$)/.test(ip)) continue;
    if (/^(::1?|0:0:0:0:0:0:0:[01]|fe80:|ff0\d:|2001:db8:)/i.test(ip)) continue;
    if (!IPV6.test(s) && /^\d+\.\d+\.\d+\.\d+$/.test(ip) && ip.split('.').every((x) => x.length === 1)) continue;
    const p = n.parent;
    if (p && p.type === 'JSXAttribute' && /^(placeholder|title|aria-|alt|label)/i.test(U.attrName(p) || '')) continue;
    if (p && p.type === 'Property') {
      const k = keyName(p.key, p.computed) || '';
      if (/version|placeholder|example|hint|oid/i.test(k)) continue;
    }
    if (p && p.type === 'VariableDeclarator' && p.id.type === 'Identifier' && /version|example|placeholder/i.test(p.id.name)) continue;
    if (U.isTestFile(ctx)) continue;
    ctx.report(n, m(`Make sure using a hardcoded IP address (${ip}) is safe here.`, `하드코딩한 IP 주소(${ip})를 쓰는 것이 안전한지 확인하세요.`));
  }
});

function modeOf(ctx, n) {
  const v = constOf(ctx, n);
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && /^[0-7]{3,4}$/.test(v)) return parseInt(v, 8);
  return null;
}

rule('file-permissions', {
  t: 'H', s: 'MA', debt: 10, sonar: 'S2612', cwe: ['CWE-732', 'CWE-266'], owasp: ['A01'], tags: ['permissions'],
  name: ['Setting loose POSIX file permissions is security-sensitive', '느슨한 POSIX 파일 권한 설정은 보안에 민감합니다'],
  why: ['Granting permissions to "others" lets every local user read or modify the file.', '"기타" 사용자에게 권한을 주면 모든 로컬 사용자가 파일을 읽거나 바꿀 수 있습니다.'],
  fix: ['Restrict the mode to the owner (and group) only, e.g. 0o640 / 0o750.', '권한을 소유자(와 그룹)로만 제한하세요. 예: 0o640 / 0o750.'],
}, (ctx) => {
  for (const call of ctx.nodes('CallExpression')) {
    const t = tgt(ctx, call);
    if (!t || (t.module !== 'fs' && t.module !== 'fs/promises' && t.module !== 'fs-extra' && t.module !== 'process' && !(t.global && t.base === 'process'))) continue;
    const fn = t.path[t.path.length - 1];
    let mode = null;
    let node = null;
    if (/^(chmod|chmodSync|fchmod|fchmodSync|lchmod|lchmodSync)$/.test(fn)) { node = call.arguments[1]; mode = modeOf(ctx, node); }
    else if (/^(mkdir|mkdirSync|writeFile|writeFileSync|appendFile|appendFileSync|open|openSync|copyFile)$/.test(fn)) {
      const idx = /^(open|openSync)$/.test(fn) ? 2 : /^(mkdir|mkdirSync)$/.test(fn) ? 1 : 2;
      const arg = call.arguments[idx];
      if (!arg) continue;
      const o = U.resolveObject(ctx, arg);
      if (o) { const p = W.objectProp(o, 'mode'); node = p && p.value; } else if (/^(open|openSync|mkdir|mkdirSync)$/.test(fn)) node = arg;
      mode = node ? modeOf(ctx, node) : null;
    } else if (fn === 'umask' && (t.global || t.module === 'process')) {
      node = call.arguments[0];
      const u = modeOf(ctx, node);
      if (u != null && (u & 0o007) !== 0o007) ctx.report(call, m(`Make sure this permissive umask (0o${u.toString(8)}) is safe here.`, `이 허용적인 umask(0o${u.toString(8)})가 안전한지 확인하세요.`));
      continue;
    } else continue;
    if (mode != null && (mode & 0o007) !== 0) ctx.report(node || call, m(`Make sure this permission (0o${mode.toString(8)}) granted to "others" is safe here.`, `"기타" 사용자에게 준 이 권한(0o${mode.toString(8)})이 안전한지 확인하세요.`));
  }
});

rule('web-sql', {
  t: 'H', s: 'MA', debt: 10, sonar: 'S2817', cwe: 'CWE-312', tags: ['html5'],
  name: ['Web SQL databases should not be used', 'Web SQL 데이터베이스를 쓰면 안 됩니다'],
  why: ['Web SQL is deprecated and its data is readable by any script in the origin.', 'Web SQL은 폐기되었고 그 데이터는 같은 출처의 모든 스크립트가 읽을 수 있습니다.'],
  fix: ['Use IndexedDB, and do not store sensitive data client-side.', 'IndexedDB를 쓰고 민감한 데이터를 클라이언트에 저장하지 마세요.'],
}, (ctx) => {
  for (const call of ctx.nodes('CallExpression')) if (isGlobalFn(ctx, call.callee, ['openDatabase'])) ctx.report(call, m('Convert this use of a Web SQL database to another technology.', '이 Web SQL 데이터베이스 사용을 다른 기술로 바꾸세요.'));
});

rule('window-open-noopener', {
  t: 'V', s: 'MI', debt: 5, sonar: 'S5148', cwe: 'CWE-1022', owasp: ['A01'], tags: ['html5'],
  name: ['Opened windows should not be able to access the opener', '연 창이 원래 창에 접근할 수 있으면 안 됩니다'],
  why: ['A page opened with window.open() gets window.opener and can navigate the original tab to a phishing page (reverse tabnabbing).', 'window.open()으로 연 페이지는 window.opener를 얻어 원래 탭을 피싱 페이지로 이동시킬 수 있습니다 (역 탭내빙).'],
  fix: ['Pass "noopener,noreferrer" as window features.', '창 기능으로 "noopener,noreferrer"를 넘기세요.'],
}, (ctx) => {
  for (const call of ctx.nodes('CallExpression')) {
    const c = unwrapTS(call.callee);
    const isOpen = (c.type === 'MemberExpression' && /^(window|globalThis)$/.test(dottedName(c.object) || '') && propName(c) === 'open') || (c.type === 'Identifier' && c.name === 'open' && B.isUnresolved(ctx, c));
    if (!isOpen || !call.arguments.length) continue;
    const url = U.constString(ctx, call.arguments[0]);
    if (url != null && !/^(https?:)?\/\//i.test(url)) continue;
    const target = call.arguments[1] ? U.constString(ctx, call.arguments[1]) : '_blank';
    if (target != null && target !== '_blank') continue;
    const feats = call.arguments[2] ? U.constString(ctx, call.arguments[2]) : '';
    if (feats == null || /noopener/i.test(feats)) continue;
    ctx.report(call, m('Make sure not using "noopener" is safe here.', '"noopener"를 쓰지 않는 것이 안전한지 확인하세요.'));
  }
});

rule('jsx-target-blank', {
  t: 'V', s: 'MI', debt: 5, sonar: 'S5148', cwe: 'CWE-1022', owasp: ['A01'], tags: ['react', 'html5'],
  name: ['Links with target="_blank" should use rel="noopener noreferrer"', 'target="_blank" 링크는 rel="noopener noreferrer"를 써야 합니다'],
  why: ['An external page opened with target="_blank" can access window.opener in older browsers (reverse tabnabbing).', 'target="_blank"로 연 외부 페이지는 오래된 브라우저에서 window.opener에 접근할 수 있습니다 (역 탭내빙).'],
  fix: ['Add rel="noopener noreferrer".', 'rel="noopener noreferrer"를 넣으세요.'],
}, (ctx) => {
  for (const el of ctx.nodes('JSXElement')) {
    const name = U.elementName(el);
    if (name !== 'a' && name !== 'area' && name !== 'form') continue;
    const target = U.attrValue(U.attr(el, 'target'));
    if (!target || target.value !== '_blank') continue;
    if (U.hasSpreadAttr(el)) continue;
    const href = U.attrValue(U.attr(el, name === 'form' ? 'action' : 'href'));
    if (!href) continue;
    if (!href.dynamic && !/^(https?:)?\/\//i.test(String(href.value))) continue;
    const rel = U.attrValue(U.attr(el, 'rel'));
    if (rel && (rel.dynamic || /noreferrer|noopener/i.test(String(rel.value)))) continue;
    ctx.report(el.openingElement, m('Add rel="noopener noreferrer" to this link with target="_blank".', 'target="_blank"인 이 링크에 rel="noopener noreferrer"를 넣으세요.'));
  }
});

rule('disabled-auto-escaping', {
  t: 'V', s: 'MA', debt: 10, sonar: 'S5247', cwe: 'CWE-79', owasp: ['A03'], tags: ['xss'],
  name: ['Disabling auto-escaping in template engines is security-sensitive', '템플릿 엔진의 자동 이스케이프를 끄는 것은 보안에 민감합니다'],
  why: ['Without auto-escaping, any data rendered by the template can inject HTML and script (XSS).', '자동 이스케이프가 없으면 템플릿이 출력하는 어떤 데이터도 HTML과 스크립트를 주입할 수 있습니다 (XSS).'],
  fix: ['Keep auto-escaping enabled and mark only trusted values as raw.', '자동 이스케이프를 켜 두고 신뢰하는 값만 원본으로 표시하세요.'],
}, (ctx) => {
  // new MarkdownIt({...}) / new nunjucks.Environment(...) are constructor calls
  for (const call of calls(ctx)) {
    const t = tgt(ctx, call);
    const p = W.calleeProp(call);
    if (!t) continue;
    const mod = t.module || (t.base || '').toLowerCase();
    if ((/handlebars/.test(mod) || mod === 'hbs') && /compile|precompile/.test(p || '')) {
      const v = propValue(ctx, call.arguments[1], 'noEscape');
      if (v && (staticValue(v) || {}).value === true) ctx.report(v, m('Make sure disabling auto-escaping (noEscape) is safe here.', '자동 이스케이프(noEscape)를 끄는 것이 안전한지 확인하세요.'));
    }
    if (/^(nunjucks|swig|swig-templates)$/.test(mod) && /configure|setDefaults|Environment/.test(p || t.path.join('.'))) {
      for (const a of call.arguments) {
        const v = propValue(ctx, a, 'autoescape');
        if (v && (staticValue(v) || {}).value === false) ctx.report(v, m('Make sure disabling auto-escaping is safe here.', '자동 이스케이프를 끄는 것이 안전한지 확인하세요.'));
      }
    }
    if ((mod === 'markdown-it') && t.path.length === 0) {
      const v = propValue(ctx, call.arguments[0], 'html') || propValue(ctx, call.arguments[1], 'html');
      if (v && (staticValue(v) || {}).value === true) ctx.report(v, m('Make sure allowing raw HTML in markdown (html: true) is safe here.', '마크다운에서 원본 HTML(html: true)을 허용하는 것이 안전한지 확인하세요.'));
    }
  }
  for (const a of ctx.nodes('AssignmentExpression')) {
    const n = dottedName(a.left) || '';
    if (/^(Mustache|mustache)\.escape$/.test(n) && isFunction(unwrapTS(a.right))) ctx.report(a, m('Make sure overriding Mustache escaping is safe here.', 'Mustache 이스케이프를 재정의하는 것이 안전한지 확인하세요.'));
  }
});

// ---------------------------------------------------------------- helmet / express
function helmetOpts(ctx) {
  const out = [];
  for (const call of ctx.nodes('CallExpression')) {
    const t = tgt(ctx, call);
    if (t && t.module === 'helmet' && t.path.length === 0 && call.arguments[0]) out.push({ call, opts: call.arguments[0] });
  }
  return out;
}

// keys: the helmet option name, followed by its helmet 7+ alias
function helmetRule(id, sonar, cwe, keys, nameEn, nameKo, whyEn, whyKo, sub) {
  keys = [].concat(keys);
  rule(id, {
    t: 'H', s: 'MA', debt: 10, sonar, cwe, owasp: ['A05'], tags: ['helmet', 'http-headers'],
    name: [nameEn, nameKo], why: [whyEn, whyKo],
    fix: [`Keep the helmet "${keys[0]}" protection enabled.`, `helmet의 "${keys[0]}" 보호를 켜 두세요.`],
  }, (ctx) => {
    for (const { opts } of helmetOpts(ctx)) {
      for (const key of keys) {
        const v = propValue(ctx, opts, key);
        if (v && (staticValue(v) || {}).value === false) ctx.report(v, m(`Make sure disabling the "${key}" protection is safe here.`, `"${key}" 보호를 끄는 것이 안전한지 확인하세요.`));
      }
    }
    if (sub) sub(ctx);
  });
}

helmetRule('csp-disabled', 'S5728', 'CWE-693', 'contentSecurityPolicy', 'Disabling content security policy is security-sensitive', '콘텐츠 보안 정책을 끄는 것은 보안에 민감합니다',
  'Without a CSP, any injected script runs with the full privileges of the page.', 'CSP가 없으면 주입된 스크립트가 페이지의 모든 권한으로 실행됩니다.', (ctx) => {
    for (const call of ctx.nodes('CallExpression')) {
      const t = tgt(ctx, call);
      if (t && t.module === 'helmet' && t.path.join('.') === 'contentSecurityPolicy') {
        const dirs = U.resolveObject(ctx, propValue(ctx, call.arguments[0], 'directives'));
        if (!dirs) continue;
        for (const p of dirs.properties) {
          if (p.type !== 'Property') continue;
          const k = keyName(p.key, p.computed);
          if (k === 'scriptSrc' || k === 'script-src') {
            const arr = unwrapTS(p.value);
            if (arr.type === 'ArrayExpression' && arr.elements.some((e) => e && /^'?unsafe-(inline|eval)'?$/.test(String((staticValue(e) || {}).value)))) ctx.report(p, m('Make sure allowing unsafe inline / eval scripts in the CSP is safe here.', 'CSP에서 안전하지 않은 인라인 / eval 스크립트를 허용하는 것이 안전한지 확인하세요.'));
          }
        }
      }
    }
  });
helmetRule('clickjacking-protection-disabled', 'S5732', 'CWE-1021', ['frameguard', 'xFrameOptions'], 'Disabling clickjacking protection is security-sensitive', '클릭재킹 보호를 끄는 것은 보안에 민감합니다',
  'Without X-Frame-Options / frame-ancestors, other sites can frame the page and trick users into clicking.', 'X-Frame-Options / frame-ancestors가 없으면 다른 사이트가 페이지를 프레임에 넣어 사용자 클릭을 속일 수 있습니다.');
helmetRule('content-sniffing-enabled', 'S5734', 'CWE-430', ['noSniff', 'xContentTypeOptions'], 'Allowing browsers to sniff MIME types is security-sensitive', '브라우저의 MIME 추측을 허용하는 것은 보안에 민감합니다',
  'Without X-Content-Type-Options: nosniff, a browser may execute an uploaded file as script.', 'X-Content-Type-Options: nosniff가 없으면 브라우저가 올린 파일을 스크립트로 실행할 수 있습니다.');
helmetRule('referrer-policy-unsafe', 'S5736', 'CWE-200', 'referrerPolicy', 'Disabling strict HTTP referrer policy is security-sensitive', '엄격한 HTTP 리퍼러 정책을 끄는 것은 보안에 민감합니다',
  'Full URLs (with tokens or private paths) leak to third-party sites through the Referer header.', '토큰이나 비공개 경로가 담긴 전체 URL이 Referer 헤더로 외부 사이트에 새어 나갑니다.', (ctx) => {
    for (const call of ctx.nodes('CallExpression')) {
      const t = tgt(ctx, call);
      if (t && t.module === 'helmet' && t.path.join('.') === 'referrerPolicy') {
        const v = constOf(ctx, propValue(ctx, call.arguments[0], 'policy'));
        if (v === 'unsafe-url' || v === 'no-referrer-when-downgrade') ctx.report(call, m(`Make sure the "${v}" referrer policy is safe here.`, `"${v}" 리퍼러 정책이 안전한지 확인하세요.`));
      }
    }
  });
helmetRule('hsts-disabled', 'S5739', 'CWE-523', ['hsts', 'strictTransportSecurity'], 'Disabling Strict-Transport-Security policy is security-sensitive', 'Strict-Transport-Security 정책을 끄는 것은 보안에 민감합니다',
  'Without HSTS the first request can be downgraded to HTTP and intercepted.', 'HSTS가 없으면 첫 요청이 HTTP로 낮춰져 가로채질 수 있습니다.', (ctx) => {
    for (const call of ctx.nodes('CallExpression')) {
      const t = tgt(ctx, call);
      const isHsts = t && ((t.module === 'helmet' && /^(hsts|strictTransportSecurity)$/.test(t.path.join('.'))) || (t.module === 'hsts' && !t.path.length));
      if (!isHsts) continue;
      const age = constOf(ctx, propValue(ctx, call.arguments[0], 'maxAge'));
      if (typeof age === 'number' && age < 15552000) ctx.report(call, m(`Make sure a short HSTS max-age (${age}s) is safe here; use at least 180 days.`, `짧은 HSTS max-age(${age}초)가 안전한지 확인하세요. 최소 180일을 쓰세요.`));
      const sub = propValue(ctx, call.arguments[0], 'includeSubDomains');
      if (sub && (staticValue(sub) || {}).value === false) ctx.report(sub, m('Make sure disabling HSTS for subdomains is safe here.', '하위 도메인의 HSTS를 끄는 것이 안전한지 확인하세요.'));
    }
  });
helmetRule('dns-prefetch-allowed', 'S5743', 'CWE-200', ['dnsPrefetchControl', 'xDnsPrefetchControl'], 'Allowing browsers to perform DNS prefetching is security-sensitive', '브라우저의 DNS 미리 가져오기를 허용하는 것은 보안에 민감합니다',
  'DNS prefetching of links reveals to DNS servers which pages the user is looking at.', '링크의 DNS 미리 가져오기는 사용자가 보는 페이지를 DNS 서버에 드러냅니다.', (ctx) => {
    for (const call of ctx.nodes('CallExpression')) {
      const t = tgt(ctx, call);
      if (t && t.module === 'helmet' && /^(dnsPrefetchControl|xDnsPrefetchControl)$/.test(t.path.join('.'))) {
        const v = propValue(ctx, call.arguments[0], 'allow');
        if (v && (staticValue(v) || {}).value === true) ctx.report(v, m('Make sure allowing DNS prefetching is safe here.', 'DNS 미리 가져오기를 허용하는 것이 안전한지 확인하세요.'));
      }
    }
  });

rule('x-powered-by', {
  t: 'H', s: 'MI', debt: 5, sonar: 'S5689', cwe: 'CWE-200', owasp: ['A05'], tags: ['express', 'http-headers'],
  name: ['Disclosing fingerprints from web application technologies is security-sensitive', '웹 애플리케이션 기술의 지문을 드러내는 것은 보안에 민감합니다'],
  why: ['The default "X-Powered-By: Express" header tells attackers which framework (and known vulnerabilities) to target.', '기본 "X-Powered-By: Express" 헤더는 공격자에게 노릴 프레임워크(와 알려진 취약점)를 알려 줍니다.'],
  fix: ['Call app.disable("x-powered-by") or use helmet().', 'app.disable("x-powered-by")를 호출하거나 helmet()을 쓰세요.'],
}, (ctx) => {
  const apps = ctx.nodes('CallExpression').filter((c) => { const t = tgt(ctx, c); return t && t.module === 'express' && t.path.length === 0; });
  if (!apps.length) return;
  const src = ctx.src;
  if (/x-powered-by|hidePoweredBy|helmet/i.test(src)) return;
  for (const c of apps) {
    const d = c.parent;
    if (!d || d.type !== 'VariableDeclarator') continue;
    ctx.report(c, m('Make sure disclosing the fingerprint of this web technology (X-Powered-By) is safe here.', '이 웹 기술의 지문(X-Powered-By)을 드러내는 것이 안전한지 확인하세요.'));
  }
});

rule('express-static-dotfiles', {
  t: 'H', s: 'MI', debt: 5, sonar: 'S5691', cwe: 'CWE-538', owasp: ['A01'], tags: ['express'],
  name: ['Statically serving hidden files is security-sensitive', '숨김 파일을 정적으로 제공하는 것은 보안에 민감합니다'],
  why: ['dotfiles: "allow" serves .env, .git and other hidden files that often contain secrets.', 'dotfiles: "allow"는 비밀이 들어 있기 쉬운 .env, .git 같은 숨김 파일을 제공합니다.'],
  fix: ['Use dotfiles: "ignore" (the default) or "deny".', 'dotfiles: "ignore"(기본값)나 "deny"를 쓰세요.'],
}, (ctx) => {
  for (const call of ctx.nodes('CallExpression')) {
    const t = tgt(ctx, call);
    if (!t || !((t.module === 'express' && t.path.join('.') === 'static') || (t.module === 'serve-static' && !t.path.length))) continue;
    const v = propValue(ctx, call.arguments[1], 'dotfiles');
    if (v && constOf(ctx, v) === 'allow') ctx.report(v, m('Make sure serving hidden files is safe here.', '숨김 파일을 제공하는 것이 안전한지 확인하세요.'));
  }
});

function sizeOf(v) {
  if (typeof v === 'number') return v;
  if (typeof v !== 'string') return null;
  const mm = /^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/i.exec(v.trim());
  if (!mm) return null;
  const mult = { b: 1, kb: 1024, mb: 1024 * 1024, gb: 1024 * 1024 * 1024 }[(mm[2] || 'b').toLowerCase()];
  return Number(mm[1]) * mult;
}

rule('upload-size-limit', {
  t: 'H', s: 'MI', debt: 10, sonar: 'S5693', cwe: ['CWE-770', 'CWE-400'], owasp: ['A05'], tags: ['express', 'dos'],
  name: ['Allowing requests with excessive content length is security-sensitive', '지나치게 큰 요청을 허용하는 것은 보안에 민감합니다'],
  why: ['Without a size limit an attacker can exhaust memory or disk by uploading huge bodies.', '크기 제한이 없으면 공격자가 거대한 본문을 올려 메모리나 디스크를 고갈시킬 수 있습니다.'],
  fix: ['Set an explicit limit (8 MB or less unless needed).', '명시적인 제한을 두세요 (필요하지 않으면 8MB 이하).'],
}, (ctx) => {
  const MAX = 8 * 1024 * 1024;
  for (const call of ctx.nodes('CallExpression')) {
    const t = tgt(ctx, call);
    if (!t) continue;
    if (t.module === 'multer' && !t.path.length) {
      const o = call.arguments[0];
      const limits = U.resolveObject(ctx, propValue(ctx, o, 'limits'));
      const fs = limits && W.objectProp(limits, 'fileSize');
      if (!fs) ctx.report(call, m('Make sure the content length limit is safe here; multer has no file size limit.', '내용 길이 제한이 안전한지 확인하세요. multer에 파일 크기 제한이 없습니다.'));
      else { const n = sizeOf(constOf(ctx, fs.value)); if (n != null && n > MAX) ctx.report(fs, m('Make sure this large file size limit is safe here.', '이 큰 파일 크기 제한이 안전한지 확인하세요.')); }
      continue;
    }
    if (t.module === 'formidable') {
      const v = propValue(ctx, call.arguments[0], 'maxFileSize');
      const n = v ? sizeOf(constOf(ctx, v)) : null;
      if (n != null && n > MAX) ctx.report(v, m('Make sure this large maximum file size is safe here.', '이 큰 최대 파일 크기가 안전한지 확인하세요.'));
      continue;
    }
    const isBody = (t.module === 'body-parser' && /^(json|urlencoded|raw|text)$/.test(t.path.join('.'))) || (t.module === 'express' && /^(json|urlencoded|raw|text)$/.test(t.path.join('.')));
    if (isBody) {
      const v = propValue(ctx, call.arguments[0], 'limit');
      const n = v ? sizeOf(constOf(ctx, v)) : null;
      if (n != null && n > MAX) ctx.report(v, m('Make sure this large request body limit is safe here.', '이 큰 요청 본문 제한이 안전한지 확인하세요.'));
    }
  }
});

rule('archive-expansion', {
  t: 'H', s: 'CR', debt: 15, sonar: 'S5042', cwe: ['CWE-409', 'CWE-22'], owasp: ['A01'], tags: ['zip'],
  name: ['Expanding archive files without controlling resource consumption is security-sensitive', '자원 소비를 통제하지 않고 압축 파일을 푸는 것은 보안에 민감합니다'],
  why: ['A crafted archive can contain huge files (zip bomb) or paths like ../../ that escape the target folder (zip slip).', '조작된 압축 파일은 거대한 파일(zip 폭탄)이나 대상 폴더를 벗어나는 ../../ 경로(zip slip)를 담을 수 있습니다.'],
  fix: ['Check the number of entries, the total uncompressed size and every entry path before extracting.', '풀기 전에 항목 수, 전체 압축 해제 크기, 모든 항목 경로를 검사하세요.'],
}, (ctx) => {
  const imports = new Set([...ctx.imports().values()].map((i) => i.source));
  for (const call of ctx.nodes('CallExpression')) {
    const t = tgt(ctx, call);
    const p = W.calleeProp(call);
    let hit = false;
    // tar.x({ filter / onentry }) can count entries and sizes; adm-zip extractEntryTo inside a
    // getEntries() loop that checks entry sizes is the controlled form
    if (t && t.module === 'tar' && /^(x|extract)$/.test(t.path.join('.'))) hit = !(['filter', 'onentry', 'onReadEntry'].some((k) => propValue(ctx, call.arguments[0], k)));
    else if (t && t.module === 'unzipper' && /^Extract$/.test(t.path.join('.'))) hit = true;
    else if (t && (t.module === 'extract-zip' || t.module === 'decompress') && !t.path.length) hit = true;
    else if (imports.has('adm-zip') && (p === 'extractAllTo' || p === 'extractAllToAsync')) hit = true;
    else if (imports.has('adm-zip') && p === 'extractEntryTo') {
      const fn = W.enclosingFunction(call);
      const body = fn ? ctx.text(fn) : ctx.src;
      hit = !(/getEntries\s*\(/.test(body) && /\.(header\.size|size|compressedSize)\b/.test(body));
    }
    else if (imports.has('jszip') && p === 'loadAsync') hit = true;
    if (hit) ctx.report(call, m('Make sure that expanding this archive file is safe here.', '이 압축 파일을 푸는 것이 안전한지 확인하세요.'));
  }
});

rule('resource-integrity', {
  t: 'H', s: 'MI', debt: 10, sonar: 'S5725', cwe: 'CWE-353', owasp: ['A08'], tags: ['html5'],
  name: ['Using remote artifacts without integrity checks is security-sensitive', '무결성 검사 없이 원격 자원을 쓰는 것은 보안에 민감합니다'],
  why: ['A script loaded from a CDN without an integrity hash runs whatever the CDN (or an attacker in it) serves.', '무결성 해시 없이 CDN에서 불러온 스크립트는 CDN(또는 그 안의 공격자)이 주는 것을 그대로 실행합니다.'],
  fix: ['Set the "integrity" (and "crossOrigin") attribute on the script.', '스크립트에 "integrity"(와 "crossOrigin") 속성을 설정하세요.'],
}, (ctx) => {
  for (const call of ctx.nodes('CallExpression')) {
    if (dottedName(call.callee) !== 'document.createElement' || U.constString(ctx, call.arguments[0]) !== 'script') continue;
    const d = call.parent;
    if (!d || d.type !== 'VariableDeclarator' || d.id.type !== 'Identifier') continue;
    const v = d.id._var;
    if (!v) continue;
    let remote = null;
    let integrity = false;
    for (const r of v.refs) {
      const me = r.id.parent;
      if (!me || me.type !== 'MemberExpression' || me.object !== r.id) continue;
      const p = propName(me);
      const a = me.parent;
      if (p === 'integrity') integrity = true;
      if (p === 'setAttribute' && a.type === 'CallExpression' && U.constString(ctx, a.arguments[0]) === 'integrity') integrity = true;
      if (p === 'src' && a.type === 'AssignmentExpression' && a.left === me) {
        const s = U.constString(ctx, a.right);
        if (s && /^(https?:)?\/\//i.test(s)) remote = a;
      }
    }
    if (remote && !integrity) ctx.report(remote, m('Make sure not using resource integrity feature is safe here.', '자원 무결성 기능을 쓰지 않는 것이 안전한지 확인하세요.'));
  }
});

rule('publicly-writable-dir', {
  t: 'H', s: 'CR', debt: 15, sonar: 'S5443', cwe: ['CWE-377', 'CWE-379'], owasp: ['A01'], tags: ['permissions'],
  name: ['Using publicly writable directories is security-sensitive', '모두가 쓸 수 있는 디렉터리를 쓰는 것은 보안에 민감합니다'],
  why: ['Other local users can pre-create or replace files in /tmp-like folders (symlink attacks, race conditions).', '다른 로컬 사용자가 /tmp 같은 폴더에 파일을 미리 만들거나 바꿀 수 있습니다 (심볼릭 링크 공격, 경쟁 상태).'],
  fix: ['Use fs.mkdtemp() to create a private temporary directory.', 'fs.mkdtemp()로 비공개 임시 디렉터리를 만드세요.'],
}, (ctx) => {
  for (const n of ctx.nodesOf('Literal', 'TemplateLiteral')) {
    // `/tmp/${id}`: the leading text of a template literal is the path prefix
    const value = n.type === 'Literal' ? n.value : n.quasis[0] && n.quasis[0].value && (n.quasis[0].value.cooked ?? n.quasis[0].value.raw);
    if (typeof value !== 'string') continue;
    if (n.type === 'TemplateLiteral' && n.parent && n.parent.type === 'TaggedTemplateExpression') continue;
    if (!/^(\/tmp|\/var\/tmp|\/usr\/tmp|\/dev\/shm|\/dev\/mqueue|\/run\/lock|\/var\/run\/screen|\/library\/caches|\/users\/shared|\/private\/tmp|\/private\/var\/tmp)(\/|$)/i.test(value)) continue;
    if (n.parent && n.parent.type === 'Property' && n.parent.key === n) continue;
    if (U.isTestFile(ctx)) continue;
    ctx.report(n, m(`Make sure publicly writable directories ("${value.slice(0, 30)}") are used safely here.`, `모두가 쓸 수 있는 디렉터리("${value.slice(0, 30)}")를 안전하게 쓰는지 확인하세요.`));
  }
});

rule('permissions-api', {
  t: 'H', s: 'MA', debt: 10, sonar: 'S5604', cwe: 'CWE-250', tags: ['privacy'],
  name: ['Using intrusive permissions is security-sensitive', '침해적인 권한을 쓰는 것은 보안에 민감합니다'],
  why: ['Geolocation, camera, microphone and notification access affect user privacy and must be justified.', '위치, 카메라, 마이크, 알림 접근은 사용자 개인 정보에 영향을 주므로 근거가 있어야 합니다.'],
  fix: ['Request the permission only when needed and explain why.', '필요할 때만 권한을 요청하고 이유를 설명하세요.'],
}, (ctx) => {
  for (const call of ctx.nodes('CallExpression')) {
    const n = dottedName(call.callee) || '';
    let what = null;
    if (/^(window\.)?navigator\.geolocation\.(getCurrentPosition|watchPosition)$/.test(n)) what = 'geolocation';
    else if (/^(window\.)?navigator\.(mediaDevices\.getUserMedia|getUserMedia|webkitGetUserMedia|mozGetUserMedia)$/.test(n)) what = 'camera/microphone';
    else if (/^(window\.)?Notification\.requestPermission$/.test(n)) what = 'notifications';
    else if (/^(window\.)?navigator\.permissions\.query$/.test(n)) {
      const name = constOf(ctx, propValue(ctx, call.arguments[0], 'name'));
      if (typeof name === 'string' && /geolocation|camera|microphone|notifications|persistent-storage/.test(name)) what = name;
    }
    if (what) ctx.report(call, m(`Make sure the use of the ${what} permission is necessary.`, `${what} 권한의 사용이 꼭 필요한지 확인하세요.`));
  }
});

rule('ip-forwarding', {
  t: 'H', s: 'MI', debt: 5, sonar: 'S5759', cwe: 'CWE-16', tags: ['privacy'],
  name: ['Forwarding client IP addresses is security-sensitive', '클라이언트 IP 주소를 전달하는 것은 보안에 민감합니다'],
  why: ['xfwd: true adds X-Forwarded-For headers that disclose users\' IP addresses to the upstream service.', 'xfwd: true는 사용자 IP 주소를 드러내는 X-Forwarded-For 헤더를 상위 서비스에 추가합니다.'],
  fix: ['Remove xfwd unless the upstream really needs client addresses.', '상위 서비스에 클라이언트 주소가 꼭 필요하지 않으면 xfwd를 지우세요.'],
}, (ctx) => {
  for (const p of boolProp(ctx, 'xfwd', true)) ctx.report(p, m('Make sure forwarding client IP address is safe here.', '클라이언트 IP 주소를 전달하는 것이 안전한지 확인하세요.'));
});

rule('debug-feature', {
  t: 'H', s: 'MI', debt: 5, sonar: 'S4507', cwe: ['CWE-489', 'CWE-215'], owasp: ['A05'], tags: ['express'],
  name: ['Delivering code in production with debug features activated is security-sensitive', '디버그 기능을 켠 채 운영 코드를 배포하는 것은 보안에 민감합니다'],
  why: ['The errorhandler middleware sends stack traces and internals to every client.', 'errorhandler 미들웨어는 모든 클라이언트에 스택 추적과 내부 정보를 보냅니다.'],
  fix: ['Enable it only when NODE_ENV is "development".', 'NODE_ENV가 "development"일 때만 켜세요.'],
}, (ctx) => {
  for (const call of ctx.nodes('CallExpression')) {
    const t = tgt(ctx, call);
    if (!t || t.module !== 'errorhandler' || t.path.length) continue;
    // guarded: in the "development" branch of an environment test (if / ?: / &&)
    let child = call;
    let p = call.parent;
    let guarded = false;
    while (p && !isFunction(p)) {
      const test = p.type === 'IfStatement' || p.type === 'ConditionalExpression' ? p.test : p.type === 'LogicalExpression' && p.operator === '&&' && p.right === child ? p.left : null;
      if (test && test !== child) {
        const s = ctx.text(test);
        const inElse = (p.type === 'IfStatement' || p.type === 'ConditionalExpression') && p.alternate === child;
        const devTest = /development|\bdev\b|\btest\b|isDev|debug/i.test(s) || /!==?\s*['"]production['"]|['"]production['"]\s*!==?/.test(s);
        const prodTest = /(?<![!=])===?\s*['"]production['"]|['"]production['"]\s*===?|isProd/i.test(s);
        if ((!inElse && devTest && !prodTest) || (inElse && prodTest && !devTest)) { guarded = true; break; }
      }
      child = p;
      p = p.parent;
    }
    if (!guarded) ctx.report(call, m('Make sure this debug feature is deactivated before delivering the code in production.', '운영에 배포하기 전에 이 디버그 기능을 끄는지 확인하세요.'));
  }
});

rule('angular-bypass-security', {
  t: 'H', s: 'MA', debt: 10, sonar: 'S6268', cwe: 'CWE-79', owasp: ['A03'], tags: ['angular', 'xss'],
  name: ['Disabling Angular built-in sanitization is security-sensitive', 'Angular 기본 정화를 끄는 것은 보안에 민감합니다'],
  why: ['bypassSecurityTrust* marks a value as safe, so any attacker-controlled part is rendered unescaped.', 'bypassSecurityTrust*는 값을 안전하다고 표시해 공격자가 만든 부분이 이스케이프 없이 출력됩니다.'],
  fix: ['Sanitize the value first, or avoid binding raw HTML.', '먼저 값을 정화하거나 원본 HTML 바인딩을 피하세요.'],
}, (ctx) => {
  for (const call of ctx.nodes('CallExpression')) {
    const p = W.calleeProp(call);
    if (p && /^bypassSecurityTrust(Html|Style|Script|Url|ResourceUrl)$/.test(p) && call.arguments[0] && !W.isStringLike(call.arguments[0])) ctx.report(call, m('Make sure disabling Angular built-in sanitization is safe here.', 'Angular 기본 정화를 끄는 것이 안전한지 확인하세요.'));
  }
});

rule('path-hijacking', {
  t: 'H', s: 'MI', debt: 5, sonar: 'S4036', cwe: 'CWE-426', owasp: ['A08'], tags: ['os-command'],
  name: ['Searching OS commands in PATH is security-sensitive', 'PATH에서 OS 명령을 찾는 것은 보안에 민감합니다'],
  why: ['A command given by name is looked up in PATH, so a malicious executable earlier in PATH (or the current folder on Windows) runs instead.', '이름만 준 명령은 PATH에서 찾으므로 PATH 앞쪽(Windows에서는 현재 폴더)의 악성 실행 파일이 대신 실행됩니다.'],
  fix: ['Use the absolute path of the executable.', '실행 파일의 절대 경로를 쓰세요.'],
}, (ctx) => {
  for (const call of ctx.nodes('CallExpression')) {
    const t = tgt(ctx, call);
    if (!t || (t.module !== 'child_process' && t.module !== 'cross-spawn' && t.module !== 'execa')) continue;
    const fn = t.path.join('.');
    if (t.module === 'child_process' && !/^(exec|execSync|execFile|execFileSync|spawn|spawnSync)$/.test(fn)) continue;
    const cmd = U.constString(ctx, call.arguments[0]);
    if (cmd == null) continue;
    const first = /^(exec|execSync)$/.test(fn) ? cmd.trim().split(/\s+/)[0].replace(/^["']|["']$/g, '') : cmd;
    if (!first || /^([a-zA-Z]:[\\/]|\/|\.{1,2}[\\/]|\\\\)/.test(first)) continue;
    ctx.report(call.arguments[0], m(`Make sure the "PATH" used to find "${first}" only contains fixed, unwriteable directories.`, `"${first}"를 찾는 "PATH"에 고정된 쓰기 불가 디렉터리만 있는지 확인하세요.`));
  }
});

function inWebPreferences(p) {
  let q = p.parent;
  while (q && q.type === 'ObjectExpression') {
    const pp = q.parent;
    if (pp && pp.type === 'Property' && keyName(pp.key, pp.computed) === 'webPreferences') return true;
    if (pp && (pp.type === 'NewExpression' || pp.type === 'CallExpression') && /BrowserWindow|BrowserView|WebContentsView/.test(dottedName(pp.callee) || '')) return true;
    if (pp && pp.type === 'VariableDeclarator' && pp.id.type === 'Identifier' && /webPreferences|prefs/i.test(pp.id.name)) return true;
    break;
  }
  return false;
}

function electronRule(id, prop, bad, nameEn, nameKo, whyEn, whyKo, fixEn, fixKo) {
  rule(id, {
    t: 'V', s: 'CR', debt: 15, cwe: 'CWE-693', owasp: ['A05'], tags: ['electron'],
    name: [nameEn, nameKo], why: [whyEn, whyKo], fix: [fixEn, fixKo],
  }, (ctx) => {
    for (const name of [].concat(prop)) {
      for (const p of boolProp(ctx, name, bad)) {
        if (inWebPreferences(p)) ctx.report(p, m(`"${name}: ${bad}" weakens the Electron renderer sandbox.`, `"${name}: ${bad}"는 Electron 렌더러 격리를 약하게 만듭니다.`));
      }
    }
  });
}

electronRule('electron-node-integration', ['nodeIntegration', 'nodeIntegrationInWorker', 'nodeIntegrationInSubFrames'], true, 'Electron renderers should not enable Node.js integration', 'Electron 렌더러에서 Node.js 통합을 켜면 안 됩니다',
  'With Node integration any XSS in the page becomes full remote code execution on the user\'s machine.', 'Node 통합이 켜져 있으면 페이지의 XSS가 사용자 컴퓨터에서의 원격 코드 실행이 됩니다.',
  'Keep nodeIntegration false and expose a narrow API through a preload script and contextBridge.', 'nodeIntegration을 false로 두고 preload 스크립트와 contextBridge로 좁은 API만 노출하세요.');
electronRule('electron-context-isolation', 'contextIsolation', false, 'Electron renderers should keep context isolation enabled', 'Electron 렌더러는 컨텍스트 격리를 켜 둬야 합니다',
  'Without context isolation the page can tamper with the preload script\'s globals and reach privileged APIs.', '컨텍스트 격리가 없으면 페이지가 preload 스크립트의 전역을 조작해 권한 있는 API에 닿을 수 있습니다.',
  'Set contextIsolation: true (the default).', 'contextIsolation: true(기본값)로 두세요.');
electronRule('electron-web-security', 'webSecurity', false, 'Electron renderers should keep web security enabled', 'Electron 렌더러는 웹 보안을 켜 둬야 합니다',
  'webSecurity: false disables the same-origin policy and allows loading insecure content.', 'webSecurity: false는 동일 출처 정책을 끄고 안전하지 않은 콘텐츠를 허용합니다.',
  'Remove webSecurity: false.', 'webSecurity: false를 지우세요.');
electronRule('electron-insecure-content', 'allowRunningInsecureContent', true, 'Electron renderers should not run insecure content', 'Electron 렌더러에서 안전하지 않은 콘텐츠를 실행하면 안 됩니다',
  'HTTP scripts on an HTTPS page can be modified in transit.', 'HTTPS 페이지의 HTTP 스크립트는 전송 중에 바뀔 수 있습니다.',
  'Remove allowRunningInsecureContent: true.', 'allowRunningInsecureContent: true를 지우세요.');
electronRule('electron-sandbox-disabled', 'sandbox', false, 'Electron renderers should keep the sandbox enabled', 'Electron 렌더러는 샌드박스를 켜 둬야 합니다',
  'Without the Chromium sandbox a compromised renderer has the full rights of the user.', 'Chromium 샌드박스가 없으면 장악된 렌더러가 사용자 권한을 모두 가집니다.',
  'Set sandbox: true and move privileged work to the main process.', 'sandbox: true로 두고 권한 있는 작업은 메인 프로세스로 옮기세요.');
electronRule('electron-remote-module', 'enableRemoteModule', true, 'The Electron remote module should not be enabled', 'Electron remote 모듈을 켜면 안 됩니다',
  'The remote module gives the renderer direct access to main-process objects.', 'remote 모듈은 렌더러에 메인 프로세스 객체를 직접 쓰게 합니다.',
  'Use IPC with explicit handlers instead.', '대신 명시적인 처리기와 IPC를 쓰세요.');

rule('electron-open-external', {
  t: 'H', s: 'MA', debt: 10, cwe: 'CWE-939', owasp: ['A03'], tags: ['electron'],
  name: ['Opening external URLs with shell.openExternal is security-sensitive', 'shell.openExternal로 외부 URL을 여는 것은 보안에 민감합니다'],
  why: ['shell.openExternal launches the OS handler for any scheme (file:, smb:, custom protocols), which can execute programs.', 'shell.openExternal은 모든 스킴(file:, smb:, 사용자 프로토콜)의 OS 처리기를 실행해 프로그램이 실행될 수 있습니다.'],
  fix: ['Allow only http(s) URLs (parse with new URL and check the protocol) before opening.', '열기 전에 http(s) URL만 허용하세요 (new URL로 파싱해 프로토콜 확인).'],
}, (ctx) => {
  for (const call of ctx.nodes('CallExpression')) {
    const t = tgt(ctx, call);
    if (!t || t.module !== 'electron' || t.path.join('.') !== 'shell.openExternal') continue;
    const a = call.arguments[0];
    if (!a || W.isStringLike(a)) continue;
    const fn = W.enclosingFunction(call);
    const guarded = fn && /protocol|startsWith\(['"`]https?|\^https\?|https?:/i.test(ctx.text(fn));
    if (!guarded) ctx.report(call, m('Make sure the URL passed to shell.openExternal is validated (http/https only).', 'shell.openExternal에 넘기는 URL을 검증하는지(http/https만) 확인하세요.'));
  }
});

rule('weak-password-hash', {
  t: 'V', s: 'CR', debt: 30, sonar: 'S5344', cwe: 'CWE-916', owasp: ['A02'], tags: ['cryptography'],
  name: ['Passwords should be hashed with a slow, salted algorithm and enough work factor', '비밀번호는 느리고 솔트를 친 알고리즘과 충분한 작업량으로 해시해야 합니다'],
  why: ['Too few PBKDF2 iterations or bcrypt rounds let attackers brute-force stolen hashes quickly.', 'PBKDF2 반복이나 bcrypt 라운드가 너무 적으면 훔친 해시를 빠르게 무차별 대입할 수 있습니다.'],
  fix: ['Use at least 100 000 PBKDF2 iterations (600 000 for SHA-256) or a bcrypt cost of 10+.', 'PBKDF2 반복을 최소 100 000회(SHA-256은 600 000회) 이상 쓰거나 bcrypt 비용을 10 이상으로 하세요.'],
}, (ctx) => {
  for (const call of ctx.nodes('CallExpression')) {
    const c = cryptoTarget(ctx, call);
    if (c === 'pbkdf2' || c === 'pbkdf2Sync') {
      const it = constOf(ctx, call.arguments[2]);
      if (typeof it === 'number' && it < 100000) ctx.report(call.arguments[2], m(`Use at least 100 000 PBKDF2 iterations (found ${it}).`, `PBKDF2 반복을 최소 100 000회 쓰세요 (현재 ${it}).`));
      continue;
    }
    const t = tgt(ctx, call);
    if (t && (t.module === 'bcrypt' || t.module === 'bcryptjs') && /^(hash|hashSync|genSalt|genSaltSync)$/.test(t.path.join('.'))) {
      const idx = /^genSalt/.test(t.path[0]) ? 0 : 1;
      const r = constOf(ctx, call.arguments[idx]);
      if (typeof r === 'number' && r < 10) ctx.report(call.arguments[idx], m(`Use a bcrypt cost factor of at least 10 (found ${r}).`, `bcrypt 비용 인수를 최소 10으로 쓰세요 (현재 ${r}).`));
    }
  }
});

module.exports = {};
