'use strict';

// Security rules (.NET reference analyzer vulnerability / hotspot family) that are found
// from the syntax and the project model alone: weak cryptography, TLS and
// certificate checks, cookies, XML parsers, deserializers, CORS, JWT
// validation, hardcoded credentials, file permissions and similar. Tainted
// data flows are handled by core/taint.

const { R } = require('../registry');
const { unparen, dotted, callName, callTarget, enclosing } = require('../ast');
const U = require('../util');
const T = require('../types');

// ───────────────────────────────────────── helpers
function last(d) { return d ? d.split('.').pop() : null; }
function newTypeName(n) { return n && n.k === 'New' && n.type ? n.type.name : null; }
function targetName(inv) { const t = callTarget(inv); return t ? last(dotted(t)) : null; }
function isFalse(e) { e = unparen(e); return !!e && e.k === 'Literal' && e.kind === 'bool' && e.value === false; }
function isTrue(e) { e = unparen(e); return !!e && e.k === 'Literal' && e.kind === 'bool' && e.value === true; }
function memberIs(e, re) { const d = dotted(e); return !!d && re.test(d); }
function src(cx, n) { return n && n.pos != null && n.end != null ? cx.src.slice(n.pos, n.end) : ''; }

// creation node of an object initializer item
function initOwner(mi) {
  let p = mi.parent;
  while (p && (p.k === 'InitList' || p.k === 'ElementInit')) p = p.parent;
  if (p && p.k === 'MemberInit') return { member: p.name, node: p };
  return p && (p.k === 'New' || p.k === 'With') ? { node: p, type: newTypeName(p) } : null;
}

// Property assignment visitors: cb(name, value, node, cx, owner) where owner is
// { type?: string, recv?: string }  (receiver type name and receiver text).
function propSets(cb) {
  return {
    Assign(n, cx) {
      if (n.op !== '=' && n.op !== '+=') return;
      const l = unparen(n.left);
      if (!l) return;
      if (l.k === 'Member') {
        const t = T.typeOf(l.expr, cx.project);
        cb(l.name, n.right, n, cx, { type: t ? t.name : null, recv: dotted(l.expr) || '', op: n.op });
      } else if (l.k === 'Name') cb(l.name, n.right, n, cx, { type: null, recv: '', op: n.op });
    },
    MemberInit(n, cx) {
      const o = initOwner(n) || {};
      cb(n.name, n.value, n, cx, { type: o.type || null, recv: o.member || '', op: '=' });
    },
  };
}

function isConstStr(e) {
  e = unparen(e);
  if (!e) return false;
  if (e.k === 'Literal') return e.kind === 'string' || e.kind === 'char' || e.kind === 'int';
  if (e.k === 'Name') {
    if (e.sym) return !!e.sym.isConst;
    return !!(e.msym && e.msym.every((m) => m.kind === 'const'));
  }
  if (e.k === 'Member') { const d = dotted(e); return d === 'string.Empty' || d === 'String.Empty' || !!(e.msym && e.msym.every((m) => m.kind === 'const')); }
  if (e.k === 'Binary' && e.op === '+') return isConstStr(e.left) && isConstStr(e.right);
  if (e.k === 'InterpString') return e.parts.every((p) => p.k !== 'Interp' || isConstStr(p.expr));
  if (e.k === 'Invocation' && callName(e) === 'nameof') return true;
  return false;
}

function hasStrLit(e) {
  e = unparen(e);
  if (!e) return false;
  if (e.k === 'Literal' && e.kind === 'string') return true;
  if (e.k === 'Binary' && e.op === '+') return hasStrLit(e.left) || hasStrLit(e.right);
  return false;
}

// a string built at run time from non-constant parts
function dynamicString(e, depth = 0) {
  e = unparen(e);
  if (!e || depth > 2) return false;
  if (e.k === 'InterpString') return e.parts.some((p) => p.k === 'Interp' && !isConstStr(p.expr));
  if (e.k === 'Binary' && e.op === '+') return hasStrLit(e) && !isConstStr(e);
  if (e.k === 'Invocation') {
    const n = callName(e); const t = dotted(callTarget(e) || {});
    if ((n === 'Format' || n === 'Concat') && (t === 'string' || t === 'String')) return e.args.some((a, i) => (n === 'Concat' || i > 0) && !isConstStr(a.expr));
  }
  if (e.k === 'Name' && e.sym && e.sym.kind === 'local' && e.sym.init && e.sym.writes.length <= 1) return dynamicString(e.sym.init, depth + 1);
  return false;
}

// delegate / lambda that accepts everything
function alwaysTrue(e, cx) {
  e = unparen(e);
  if (!e) return false;
  if (e.k === 'Lambda') return bodyAlwaysTrue(e.body);
  if (e.k === 'Member' && e.name === 'DangerousAcceptAnyServerCertificateValidator') return true;
  if (e.k === 'New' && e.args && e.args.length === 1) return alwaysTrue(e.args[0].expr, cx);
  if (e.k === 'Name' && e.msym) {
    const ms = e.msym.filter((m) => m.kind === 'method');
    return ms.length > 0 && ms.every((m) => bodyAlwaysTrue(m.node.body || m.node.exprBody));
  }
  return false;
}
function bodyAlwaysTrue(b) {
  if (!b) return false;
  if (b.k !== 'Block') return isTrue(b);
  const rets = [];
  let other = false;
  const visit = (n) => {
    if (!n || typeof n !== 'object' || other) return;
    if (n.k === 'Return') { rets.push(n); return; }
    if (n.k === 'Lambda' || n.k === 'LocalFunc') return;
    if (n.k === 'Block') { for (const s of n.stmts) visit(s); return; }
    if (n.k === 'If') { visit(n.then); visit(n.else); return; }
  };
  visit(b);
  return rets.length > 0 && rets.every((r) => isTrue(r.expr));
}

function argNamed(inv, name) { return (inv.args || []).find((a) => a.name === name) || null; }

// constant byte arrays: new byte[] { 1, 2 }, Encoding.X.GetBytes("lit")
function constBytes(e, depth = 0) {
  e = unparen(e);
  if (!e || depth > 2) return false;
  if (e.k === 'ArrayNew' && e.init && e.init.items.length) return e.init.items.every((x) => { x = unparen(x); return x && x.k === 'Literal'; });
  if (e.k === 'Collection' && e.elems && e.elems.length) return e.elems.every((x) => { x = unparen(x && x.expr ? x.expr : x); return x && x.k === 'Literal'; });
  if (e.k === 'Invocation' && callName(e) === 'GetBytes' && e.args.length === 1 && /Encoding|UTF8|ASCII|Unicode|Latin1/.test(dotted(callTarget(e) || {}) || '')) {
    const a = unparen(e.args[0].expr);
    return (U.strVal(a) != null || (a && a.k === 'Name' && isConstStr(a))) || constStrRef(a);
  }
  if (e.k === 'Name' && e.sym && e.sym.kind === 'local' && e.sym.init && e.sym.writes.length <= 1) return constBytes(e.sym.init, depth + 1);
  if (e.k === 'Name' && e.msym && e.msym.length === 1 && e.msym[0].kind === 'field' && e.msym[0].v && e.msym[0].v.init && U.hasMod(e.msym[0].node, 'readonly')) return constBytes(e.msym[0].v.init, depth + 1);
  return false;
}
function constStrRef(e) {
  e = unparen(e);
  if (!e || e.k !== 'Name') return false;
  if (e.sym && e.sym.kind === 'local' && e.sym.init && e.sym.writes.length <= 1) return isConstStr(e.sym.init);
  if (e.msym && e.msym.length === 1 && (e.msym[0].kind === 'const' || (e.msym[0].kind === 'field' && U.hasMod(e.msym[0].node, 'readonly'))) && e.msym[0].v && e.msym[0].v.init) return isConstStr(e.msym[0].v.init);
  return false;
}

const SEC = 'cwe-327';

// ───────────────────────────────────────── cryptography
const WEAK_HASH_NEW = new Set(['MD5CryptoServiceProvider', 'MD5Cng', 'SHA1Managed', 'SHA1CryptoServiceProvider', 'SHA1Cng', 'HMACMD5', 'HMACSHA1', 'RIPEMD160Managed', 'MD4']);
const WEAK_HASH_NAMES = /^(MD5|SHA1|SHA-1|System\.Security\.Cryptography\.(MD5|SHA1)|HMACMD5|HMACSHA1|RIPEMD160)$/i;
R('weak-hash', 'S4790', 'H', 'CR', 30, ['cwe-328', 'cwe-916', 'owasp-a2'],
  ['Using weak hashing algorithms is security-sensitive', 'MD5 and SHA-1 are broken: collisions can be produced cheaply, so they must not protect integrity, signatures or passwords.', 'Use SHA-256 or stronger; for passwords use a slow key derivation function.'],
  ['약한 해시 알고리즘 사용은 보안에 민감합니다', 'MD5와 SHA-1은 충돌을 쉽게 만들 수 있어 무결성, 서명, 비밀번호 보호에 쓰면 안 됩니다.', 'SHA-256 이상을 쓰고 비밀번호에는 느린 키 유도 함수를 쓰세요.'],
  { kinds: {
    New(n, cx) {
      const t = newTypeName(n);
      if (WEAK_HASH_NEW.has(t)) cx.report(n, `Make sure that hashing data with '${t}' is safe here.`, `여기서 '${t}'로 해시하는 것이 안전한지 확인하세요.`);
    },
    Invocation(n, cx) {
      const name = callName(n); const t = targetName(n);
      if ((t === 'MD5' || t === 'SHA1') && ['Create', 'HashData', 'HashDataAsync', 'TryHashData'].includes(name)) {
        cx.report(n, `Make sure that hashing data with '${t}' is safe here.`, `여기서 '${t}'로 해시하는 것이 안전한지 확인하세요.`);
      } else if ((name === 'Create' && (t === 'HashAlgorithm' || t === 'HMAC' || t === 'KeyedHashAlgorithm')) || (name === 'CreateFromName' && t === 'CryptoConfig')) {
        const v = n.args[0] && U.strVal(n.args[0].expr);
        if (v && WEAK_HASH_NAMES.test(v)) cx.report(n, `Make sure that hashing data with '${v}' is safe here.`, `여기서 '${v}'로 해시하는 것이 안전한지 확인하세요.`);
      }
    },
  } });

const WEAK_CIPHER_NEW = new Set(['DESCryptoServiceProvider', 'TripleDESCryptoServiceProvider', 'RC2CryptoServiceProvider', 'TripleDESCng', 'RijndaelManaged']);
R('weak-cipher', 'S5547', 'V', 'CR', 15, [SEC, 'owasp-a2'],
  ['Cipher algorithms should be robust', 'DES, 3DES and RC2 use small keys or blocks and can be broken; the data they protect is not confidential.', 'Use AES (Aes.Create()) with a 128-bit or longer key.'],
  ['암호 알고리즘은 견고해야 합니다', 'DES, 3DES, RC2는 키나 블록이 작아 깨질 수 있어 보호하는 데이터가 기밀이 아닙니다.', '128비트 이상의 키로 AES(Aes.Create())를 쓰세요.'],
  { kinds: {
    New(n, cx) {
      const t = newTypeName(n);
      if (WEAK_CIPHER_NEW.has(t) && t !== 'RijndaelManaged') cx.report(n, `Use a strong cipher algorithm instead of '${t}'.`, `'${t}' 대신 강한 암호 알고리즘을 쓰세요.`);
    },
    Invocation(n, cx) {
      const name = callName(n); const t = targetName(n);
      if (name === 'Create' && (t === 'DES' || t === 'TripleDES' || t === 'RC2')) cx.report(n, `Use a strong cipher algorithm instead of '${t}'.`, `'${t}' 대신 강한 암호 알고리즘을 쓰세요.`);
      else if (name === 'Create' && t === 'SymmetricAlgorithm') {
        const v = n.args[0] && U.strVal(n.args[0].expr);
        if (v && /^(DES|TripleDES|3DES|RC2)$/i.test(v)) cx.report(n, `Use a strong cipher algorithm instead of '${v}'.`, `'${v}' 대신 강한 암호 알고리즘을 쓰세요.`);
      }
    },
  } });

R('weak-cipher-mode', 'S5542', 'V', 'CR', 20, [SEC, 'owasp-a2'],
  ['Encryption algorithms should be used with secure mode and padding scheme', 'ECB mode leaks patterns of the plaintext and PKCS#1 v1.5 encryption padding is open to padding-oracle attacks.', 'Use an authenticated mode such as AES-GCM, and OAEP padding for RSA.'],
  ['암호화 알고리즘은 안전한 모드와 패딩으로 써야 합니다', 'ECB 모드는 평문의 패턴을 드러내고 PKCS#1 v1.5 암호화 패딩은 패딩 오라클 공격에 약합니다.', 'AES-GCM 같은 인증 모드와 RSA에는 OAEP 패딩을 쓰세요.'],
  { kinds: {
    Member(n, cx) {
      const d = dotted(n);
      if (!d) return;
      if (/(^|\.)CipherMode\.ECB$/.test(d)) cx.report(n, 'Use a secure cipher mode instead of ECB.', 'ECB 대신 안전한 암호 모드를 쓰세요.');
      else if (/(^|\.)RSAEncryptionPadding\.Pkcs1$/.test(d)) cx.report(n, 'Use OAEP padding instead of PKCS#1 v1.5 for RSA encryption.', 'RSA 암호화에 PKCS#1 v1.5 대신 OAEP 패딩을 쓰세요.');
    },
    Invocation(n, cx) {
      const name = callName(n);
      if ((name === 'Encrypt' || name === 'Decrypt') && n.args.length === 2 && isFalse(n.args[1].expr)) {
        const t = T.typeOf(callTarget(n), cx.project);
        if (t && /^RSA/.test(t.name)) cx.report(n, `Use OAEP padding: pass 'true' as the second argument of '${name}'.`, `OAEP 패딩을 쓰도록 '${name}'의 두 번째 인수에 'true'를 넘기세요.`);
      }
    },
  } });

const KEY_IMPORT = /^(ImportParameters|ImportCspBlob|FromXmlString|Import\w*Key|ImportFromPem|ImportFromEncryptedPem|ImportSubjectPublicKeyInfo|ImportPkcs8PrivateKey)$/;
// `var rsa = new RSACryptoServiceProvider(); rsa.ImportCspBlob(blob);`
function keyImported(n) {
  const v = n.parent && n.parent.k === 'VarDecl' && n.parent.init === n ? n.parent : null;
  const sym = v && v.sym;
  if (!sym || !sym.refs) return false;
  return sym.refs.some((r) => {
    const m = r.parent;
    if (!m || m.k !== 'Member' || m.expr !== r) return false;
    return KEY_IMPORT.test(m.name) && m.parent && m.parent.k === 'Invocation' && m.parent.expr === m;
  });
}
R('weak-key-size', 'S4426', 'V', 'CR', 5, ['cwe-326', 'owasp-a2'],
  ['Cryptographic keys should be robust', 'RSA and DSA keys shorter than 2048 bits can be factored or forged with today\'s computing power.', 'Use keys of at least 2048 bits.'],
  ['암호 키는 견고해야 합니다', '2048비트보다 짧은 RSA, DSA 키는 현재의 계산 능력으로 깨거나 위조할 수 있습니다.', '2048비트 이상의 키를 쓰세요.'],
  { kinds: {
    New(n, cx) {
      const t = newTypeName(n);
      if (!/^(RSACryptoServiceProvider|DSACryptoServiceProvider|RSACng|DSACng|RSAOpenSsl|DSAOpenSsl)$/.test(t || '')) return;
      if (!n.args.length) {
        // the default key is only generated when no key is loaded: an imported key keeps its own size
        if (/CryptoServiceProvider$/.test(t) && !keyImported(n)) cx.report(n, `'${t}' defaults to a 1024-bit key; pass a key size of at least 2048.`, `'${t}'의 기본 키는 1024비트입니다. 2048 이상의 키 크기를 넘기세요.`);
        return;
      }
      const v = U.numVal(n.args[0].expr);
      if (v != null && v < 2048) cx.report(n, `Use a key length of at least 2048 bits instead of ${v}.`, `${v} 대신 2048비트 이상의 키 길이를 쓰세요.`);
    },
    Invocation(n, cx) {
      const t = targetName(n);
      if (callName(n) !== 'Create' || (t !== 'RSA' && t !== 'DSA') || n.args.length !== 1) return;
      const v = U.numVal(n.args[0].expr);
      if (v != null && v < 2048) cx.report(n, `Use a key length of at least 2048 bits instead of ${v}.`, `${v} 대신 2048비트 이상의 키 길이를 쓰세요.`);
    },
    ...propSets((name, value, node, cx, owner) => {
      if (name !== 'KeySize') return;
      if (!/^(RSA|DSA)/.test(owner.type || '')) return;
      const v = U.numVal(value);
      if (v != null && v < 2048) cx.report(node, `Use a key length of at least 2048 bits instead of ${v}.`, `${v} 대신 2048비트 이상의 키 길이를 쓰세요.`);
    }),
  } });

R('custom-crypto-algorithm', 'S2257', 'H', 'CR', 60, [SEC, 'owasp-a2'],
  ['Using non-standard cryptographic algorithms is security-sensitive', 'Home-made cryptography has not been reviewed by experts and is almost always weaker than standard algorithms.', 'Use the algorithms of System.Security.Cryptography instead of deriving your own.'],
  ['표준이 아닌 암호 알고리즘 사용은 보안에 민감합니다', '직접 만든 암호는 전문가 검토를 거치지 않아 거의 항상 표준 알고리즘보다 약합니다.', '직접 파생하지 말고 System.Security.Cryptography의 알고리즘을 쓰세요.'],
  { kinds: { TypeDecl(n, cx) {
    if (n.kind !== 'class') return;
    const base = (n.bases || []).find((b) => /^(HashAlgorithm|SymmetricAlgorithm|AsymmetricAlgorithm|KeyedHashAlgorithm|ICryptoTransform|AsymmetricSignatureFormatter|AsymmetricKeyExchangeFormatter)$/.test(b.name));
    if (!base) return;
    cx.report(n, `Make sure that the custom algorithm '${n.name}' (derived from '${base.name}') is safe here.`, `'${base.name}'에서 파생한 사용자 정의 알고리즘 '${n.name}'이 안전한지 확인하세요.`, { atName: true });
  } } });

R('weak-password-hashing', 'S5344', 'V', 'CR', 30, ['cwe-916', 'cwe-256', 'owasp-a2'],
  ['Passwords should not be stored with a fast hashing algorithm', 'PBKDF2 with few iterations (Rfc2898DeriveBytes defaults to 1000) lets an attacker test billions of guesses against a leaked hash.', 'Use at least 100,000 PBKDF2 iterations with SHA-256, or a dedicated password hasher.'],
  ['비밀번호를 빠른 해시 알고리즘으로 저장하면 안 됩니다', '반복 횟수가 적은 PBKDF2(Rfc2898DeriveBytes 기본값 1000)는 유출된 해시에 대해 수십억 번 추측할 수 있게 합니다.', 'SHA-256으로 PBKDF2를 100,000회 이상 반복하거나 전용 비밀번호 해셔를 쓰세요.'],
  { kinds: {
    New(n, cx) {
      if (newTypeName(n) !== 'Rfc2898DeriveBytes') return;
      if (n.args.length < 3) { cx.report(n, 'Pass an iteration count of at least 100,000: the default is only 1000.', '반복 횟수를 100,000 이상으로 넘기세요. 기본값은 1000뿐입니다.'); return; }
      const v = U.numVal(n.args[2].expr);
      if (v != null && v < 100000) cx.report(n, `Use at least 100,000 iterations instead of ${v}.`, `${v} 대신 100,000회 이상 반복하세요.`);
    },
    Invocation(n, cx) {
      if (callName(n) !== 'Pbkdf2' || targetName(n) !== 'Rfc2898DeriveBytes' || n.args.length < 3) return;
      const v = U.numVal(n.args[2].expr);
      if (v != null && v < 100000) cx.report(n, `Use at least 100,000 iterations instead of ${v}.`, `${v} 대신 100,000회 이상 반복하세요.`);
    },
    ...propSets((name, value, node, cx, owner) => {
      if (name !== 'IterationCount' || (owner.type && owner.type !== 'PasswordHasherOptions')) return;
      const v = U.numVal(value);
      if (v != null && v < 100000) cx.report(node, `Use at least 100,000 iterations instead of ${v}.`, `${v} 대신 100,000회 이상 반복하세요.`);
    }),
  } });

R('constant-iv', 'S3329', 'V', 'CR', 15, ['cwe-329', 'owasp-a2'],
  ['Cipher Block Chaining IVs should be unpredictable', 'A fixed initialization vector makes equal plaintexts encrypt to equal ciphertexts and enables chosen-plaintext attacks.', 'Generate a fresh random IV for every encryption (GenerateIV() or RandomNumberGenerator).'],
  ['CBC 초기화 벡터는 예측할 수 없어야 합니다', '고정된 초기화 벡터는 같은 평문을 같은 암호문으로 만들고 선택 평문 공격을 가능하게 합니다.', '암호화할 때마다 새 무작위 IV를 만드세요(GenerateIV() 또는 RandomNumberGenerator).'],
  { kinds: {
    Invocation(n, cx) {
      if (callName(n) !== 'CreateEncryptor' || n.args.length !== 2) return;
      const iv = n.args[1].expr;
      if (constBytes(iv)) cx.report(iv, 'Use a random initialization vector instead of this constant one.', '이 상수 대신 무작위 초기화 벡터를 쓰세요.');
    },
    ...propSets((name, value, node, cx) => {
      if (name !== 'IV') return;
      if (constBytes(value)) cx.report(node, 'Use a random initialization vector instead of this constant one.', '이 상수 대신 무작위 초기화 벡터를 쓰세요.');
    }),
  } });

R('insecure-random', 'S2245', 'H', 'CR', 10, ['cwe-338', 'cwe-330', 'owasp-a2'],
  ['Using pseudorandom number generators (PRNGs) is security-sensitive', 'System.Random is predictable: values used as tokens, keys, salts or passwords can be guessed.', 'Use RandomNumberGenerator for anything security related.'],
  ['의사 난수 생성기 사용은 보안에 민감합니다', 'System.Random은 예측할 수 있어 토큰, 키, 솔트, 비밀번호로 쓴 값을 추측할 수 있습니다.', '보안 관련 값에는 RandomNumberGenerator를 쓰세요.'],
  { kinds: {
    New(n, cx) {
      if (newTypeName(n) === 'Random' && (!n.type.qual || /^(System\.)?Random$/.test(n.type.qual))) cx.report(n, "Make sure that using this pseudorandom number generator is safe here.", '여기서 이 의사 난수 생성기를 쓰는 것이 안전한지 확인하세요.');
    },
    Member(n, cx) {
      if (memberIs(n, /^(System\.)?Random\.Shared$/)) cx.report(n, "Make sure that using this pseudorandom number generator is safe here.", '여기서 이 의사 난수 생성기를 쓰는 것이 안전한지 확인하세요.');
    },
  } });

R('hardcoded-jwt-key', 'S6781', 'V', 'BL', 30, ['cwe-798', 'cwe-321', 'owasp-a7'],
  ['JWT secret keys should not be disclosed', 'A signing key written in the source lets anyone who reads the code forge valid tokens.', 'Load the key from a secret store or protected configuration.'],
  ['JWT 비밀 키를 노출하면 안 됩니다', '소스에 적은 서명 키는 코드를 읽은 누구나 유효한 토큰을 위조하게 합니다.', '비밀 저장소나 보호된 설정에서 키를 읽어 오세요.'],
  { kinds: { New(n, cx) {
    if (newTypeName(n) !== 'SymmetricSecurityKey' || n.args.length !== 1) return;
    if (constBytes(n.args[0].expr)) cx.report(n, 'Do not hardcode this JWT signing key; load it from a secret store.', '이 JWT 서명 키를 하드코딩하지 말고 비밀 저장소에서 읽어 오세요.');
  } } });

// ───────────────────────────────────────── TLS / certificates
R('weak-tls-protocol', 'S4423', 'V', 'CR', 5, ['cwe-327', 'cwe-326', 'owasp-a2'],
  ['Weak SSL/TLS protocols should not be used', 'SSL 2/3 and TLS 1.0/1.1 have known weaknesses that let an attacker decrypt or tamper with traffic.', 'Use TLS 1.2 or later, or let the operating system choose (SslProtocols.None / SystemDefault).'],
  ['약한 SSL/TLS 프로토콜을 쓰면 안 됩니다', 'SSL 2/3과 TLS 1.0/1.1은 알려진 약점이 있어 공격자가 트래픽을 해독하거나 변조할 수 있습니다.', 'TLS 1.2 이상을 쓰거나 운영체제가 고르게 하세요(SslProtocols.None / SystemDefault).'],
  { kinds: { Member(n, cx) {
    const d = dotted(n);
    if (!d) return;
    const m = /(?:^|\.)(SslProtocols|SecurityProtocolType)\.(Ssl2|Ssl3|Tls|Tls11)$/.exec(d);
    if (m) cx.report(n, `Change this code to use a stronger protocol than '${m[1]}.${m[2]}'.`, `'${m[1]}.${m[2]}'보다 강한 프로토콜을 쓰도록 바꾸세요.`);
  } } });

const CERT_CB = new Set(['ServerCertificateValidationCallback', 'ServerCertificateCustomValidationCallback', 'RemoteCertificateValidationCallback', 'CertificateValidationCallback']);
R('certificate-validation-disabled', 'S4830', 'V', 'CR', 5, ['cwe-295', 'owasp-a7'],
  ['Server certificates should be verified during SSL/TLS connections', 'A validation callback that always returns true accepts any certificate, so a man-in-the-middle can read and change the traffic.', 'Remove the callback, or check the sslPolicyErrors argument and the certificate chain.'],
  ['SSL/TLS 연결에서는 서버 인증서를 검증해야 합니다', '항상 true를 반환하는 검증 콜백은 모든 인증서를 받아들여 중간자가 트래픽을 읽고 바꿀 수 있습니다.', '콜백을 지우거나 sslPolicyErrors 인수와 인증서 체인을 검사하세요.'],
  { kinds: {
    ...propSets((name, value, node, cx) => {
      if (!CERT_CB.has(name)) return;
      if (alwaysTrue(value, cx)) cx.report(node, `Enable server certificate validation: '${name}' accepts every certificate.`, `서버 인증서 검증을 켜세요. '${name}'이 모든 인증서를 받아들입니다.`);
    }),
    New(n, cx) {
      if (newTypeName(n) !== 'SslStream' || n.args.length < 3) return;
      if (alwaysTrue(n.args[2].expr, cx)) cx.report(n.args[2], 'Enable server certificate validation: this callback accepts every certificate.', '서버 인증서 검증을 켜세요. 이 콜백은 모든 인증서를 받아들입니다.');
    },
  } });

// ───────────────────────────────────────── credentials and addresses
const CRED_NAME = /(passw(or)?d|pwd|passphrase)/i;
const CRED_NAME_SKIP = /(Field|Label|Prompt|Hint|Text|Message|Msg|Regex|Pattern|Policy|Format|Url|Uri|Path|Key|Name|Length|Header|Column|Param|Placeholder|Title|Caption|Error|Expiry|Changed|Required|Reset|Hash|Salt)$/;
function credLiteral(v, name) {
  if (typeof v !== 'string' || !v.length) return false;
  if (/\s/.test(v)) return false;
  if (v.toLowerCase() === String(name).toLowerCase()) return false;
  if (/^[{$%[<]|^\*+$|^(null|none|changeme|secret|password)$/i.test(v)) return /^(changeme|secret|password)$/i.test(v) && !/^password$/i.test(name);
  return true;
}
function checkCred(name, value, node, cx) {
  if (!name || !CRED_NAME.test(name) || CRED_NAME_SKIP.test(name)) return;
  const e = unparen(value);
  if (!e || e.k !== 'Literal' || e.kind !== 'string') return;
  if (!credLiteral(e.value, name)) return;
  cx.report(node, `'${name}' detected here, make sure this is not a hard-coded credential.`, `여기서 '${name}'이 보입니다. 하드코딩한 자격 증명이 아닌지 확인하세요.`);
}
R('hardcoded-credentials', 'S2068', 'H', 'BL', 30, ['cwe-798', 'cwe-259', 'owasp-a7'],
  ['Hard-coded credentials are security-sensitive', 'Passwords in the source end up in version control, builds and decompiled binaries where anyone can read them.', 'Load credentials from a secret store, the environment or protected configuration.'],
  ['하드코딩한 자격 증명은 보안에 민감합니다', '소스의 비밀번호는 버전 관리, 빌드, 디컴파일한 바이너리에 남아 누구나 읽을 수 있습니다.', '비밀 저장소, 환경 변수, 보호된 설정에서 자격 증명을 읽어 오세요.'],
  { kinds: {
    VarDecl(n, cx) { if (n.init) checkCred(n.name, n.init, n, cx); },
    Property(n, cx) { if (n.init) checkCred(n.name, n.init, n, cx); },
    ...propSets((name, value, node, cx) => checkCred(name, value, node, cx)),
    New(n, cx) {
      if (newTypeName(n) !== 'NetworkCredential' || n.args.length < 2) return;
      const e = unparen(n.args[1].expr);
      if (e && e.k === 'Literal' && e.kind === 'string' && e.value) cx.report(n.args[1], "'password' detected here, make sure this is not a hard-coded credential.", "여기서 'password'가 보입니다. 하드코딩한 자격 증명이 아닌지 확인하세요.");
    },
    Literal(n, cx) {
      if (n.kind !== 'string' || typeof n.value !== 'string') return;
      const m = /(?:^|;)\s*(password|pwd)\s*=\s*([^;]*)/i.exec(n.value);
      if (!m) return;
      const v = m[2].trim();
      if (!v || /^[{$%'"]|^\*+$/.test(v)) return;
      cx.report(n, `'${m[1]}' detected in this connection string, make sure this is not a hard-coded credential.`, `이 연결 문자열에 '${m[1]}'가 보입니다. 하드코딩한 자격 증명이 아닌지 확인하세요.`);
    },
  } });

// name of the variable, field, property, method or named argument a literal is the value of
function holderName(n) {
  for (let p = n.parent, c = n; p; c = p, p = p.parent) {
    if (p.k === 'Paren' || p.k === 'Conditional' || p.k === 'Binary' && p.op === '??') continue;
    if (p.k === 'Arg') { if (p.name) return p.name; return null; }
    if (p.k === 'VarDecl' || p.k === 'Property' || p.k === 'Method' || p.k === 'AnonMember') return p.name || null;
    if (p.k === 'Return') continue;
    if (p.k === 'Block' || p.k === 'ExprStmt') continue;
    if (p.k === 'Assign' && p.right === c) { const l = unparen(p.left); return l && (l.k === 'Name' || l.k === 'Member') ? l.name : null; }
    return null;
  }
  return null;
}
const IP_RE = /^(?:[a-z][a-z0-9+.-]*:\/\/)?(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?::\d{1,5})?(?:[/?#].*)?$/i;
R('hardcoded-ip', 'S1313', 'H', 'MI', 30, ['cwe-547'],
  ['Using hardcoded IP addresses is security-sensitive', 'A fixed address forces a rebuild when the network changes and exposes infrastructure details in the source.', 'Read the address from configuration or resolve a host name.'],
  ['하드코딩한 IP 주소 사용은 보안에 민감합니다', '고정 주소는 네트워크가 바뀌면 다시 빌드해야 하고 인프라 정보를 소스에 드러냅니다.', '설정에서 주소를 읽거나 호스트 이름을 조회하세요.'],
  { kinds: { Literal(n, cx) {
    if (n.kind !== 'string' || typeof n.value !== 'string') return;
    const m = IP_RE.exec(n.value);
    if (!m) return;
    const o = m.slice(1, 5).map(Number);
    if (o.some((x) => x > 255)) return;
    const ip = o.join('.');
    if (o[0] === 127 || o[0] === 0 || ip === '255.255.255.255') return;
    if (/^(192\.0\.2|198\.51\.100|203\.0\.113)\./.test(ip)) return; // documentation ranges
    if (enclosing(n, ['Attribute'])) return;
    const p = n.parent && n.parent.k === 'Arg' ? n.parent.parent : n.parent;
    if (p && ((p.k === 'New' && newTypeName(p) === 'Version') || (p.k === 'Invocation' && targetName(p) === 'Version'))) return;
    // a four-part version number ("1.2.3.4") held by something named *Version*
    if (/version/i.test(holderName(n) || '')) return;
    cx.report(n, `Make sure using the hardcoded IP address '${ip}' is safe here.`, `여기서 하드코딩한 IP 주소 '${ip}'를 쓰는 것이 안전한지 확인하세요.`);
  } } });

// ───────────────────────────────────────── cookies
const COOKIE_TYPES = /^(HttpCookie|CookieOptions|CookieBuilder|Cookie|RequestPathBaseCookieBuilder)$/;
function cookieOwner(owner) { return COOKIE_TYPES.test(owner.type || '') || /cookie/i.test(owner.recv || ''); }
R('cookie-not-secure', 'S2092', 'H', 'MI', 5, ['cwe-311', 'cwe-614', 'owasp-a4'],
  ['Creating cookies without the "secure" flag is security-sensitive', 'Without the Secure flag the browser also sends the cookie over plain HTTP, where it can be intercepted.', 'Set Secure = true (or CookieSecurePolicy.Always).'],
  ['secure 플래그 없이 쿠키를 만드는 것은 보안에 민감합니다', 'Secure 플래그가 없으면 브라우저가 평문 HTTP로도 쿠키를 보내 가로챌 수 있습니다.', 'Secure = true(또는 CookieSecurePolicy.Always)로 설정하세요.'],
  { kinds: propSets((name, value, node, cx, owner) => {
    if (name === 'Secure' && isFalse(value) && cookieOwner(owner)) cx.report(node, "Make sure creating this cookie without the 'Secure' flag is safe.", "'Secure' 플래그 없이 이 쿠키를 만드는 것이 안전한지 확인하세요.");
    else if (name === 'SecurePolicy' && memberIs(value, /(^|\.)CookieSecurePolicy\.(None|SameAsRequest)$/)) cx.report(node, `Make sure '${dotted(unparen(value))}' is safe for this cookie.`, `이 쿠키에 '${dotted(unparen(value))}'가 안전한지 확인하세요.`);
  }) });

R('cookie-not-httponly', 'S3330', 'H', 'MI', 5, ['cwe-1004', 'owasp-a5'],
  ['Creating cookies without the "HttpOnly" flag is security-sensitive', 'A cookie readable from JavaScript can be stolen by any cross-site scripting flaw.', 'Set HttpOnly = true unless scripts really need the cookie.'],
  ['HttpOnly 플래그 없이 쿠키를 만드는 것은 보안에 민감합니다', '자바스크립트로 읽을 수 있는 쿠키는 크로스 사이트 스크립팅 결함으로 도난당할 수 있습니다.', '스크립트가 정말 쿠키를 써야 하는 경우가 아니면 HttpOnly = true로 설정하세요.'],
  { kinds: propSets((name, value, node, cx, owner) => {
    if (name === 'HttpOnly' && isFalse(value) && cookieOwner(owner)) cx.report(node, "Make sure creating this cookie without the 'HttpOnly' flag is safe.", "'HttpOnly' 플래그 없이 이 쿠키를 만드는 것이 안전한지 확인하세요.");
    else if (name === 'HttpOnly' && memberIs(value, /(^|\.)HttpOnlyPolicy\.None$/)) cx.report(node, "Make sure 'HttpOnlyPolicy.None' is safe for these cookies.", "이 쿠키들에 'HttpOnlyPolicy.None'이 안전한지 확인하세요.");
  }) });

// ───────────────────────────────────────── XML, deserialization
R('xml-external-entities', 'S2755', 'V', 'BL', 15, ['cwe-611', 'cwe-827', 'owasp-a5'],
  ['XML parsers should not be vulnerable to XXE attacks', 'Resolving DTDs and external entities lets a crafted document read local files, reach internal hosts or exhaust memory.', 'Keep XmlResolver null and DtdProcessing at Prohibit (the default on modern .NET).'],
  ['XML 파서는 XXE 공격에 취약하면 안 됩니다', 'DTD와 외부 엔터티를 해석하면 조작한 문서가 로컬 파일을 읽거나 내부 호스트에 접근하거나 메모리를 소진할 수 있습니다.', 'XmlResolver는 null로, DtdProcessing은 Prohibit(최신 .NET 기본값)으로 두세요.'],
  { kinds: propSets((name, value, node, cx) => {
    const v = unparen(value);
    if (name === 'XmlResolver' && v && v.k === 'New' && /^(XmlUrlResolver|XmlPreloadedResolver)$/.test(newTypeName(v) || '')) {
      cx.report(node, `Disable access to external entities: do not set '${newTypeName(v)}' as the XmlResolver.`, `외부 엔터티 접근을 막으세요. XmlResolver에 '${newTypeName(v)}'를 설정하지 마세요.`);
    } else if (name === 'DtdProcessing' && memberIs(v, /(^|\.)DtdProcessing\.Parse$/)) {
      cx.report(node, 'Disable DTD processing: do not use DtdProcessing.Parse.', 'DTD 처리를 끄세요. DtdProcessing.Parse를 쓰지 마세요.');
    } else if (name === 'ProhibitDtd' && isFalse(v)) {
      cx.report(node, 'Disable DTD processing: keep ProhibitDtd true.', 'DTD 처리를 끄세요. ProhibitDtd를 true로 두세요.');
    }
  }) });

R('xml-signature-unchecked', 'S6377', 'V', 'MA', 15, ['cwe-347', 'owasp-a2'],
  ['XML signatures should be validated securely', 'SignedXml.CheckSignature() without a key trusts the key embedded in the document, so an attacker can sign a forged document with his own key.', 'Call CheckSignature with the expected key or certificate.'],
  ['XML 서명은 안전하게 검증해야 합니다', '키 없이 SignedXml.CheckSignature()를 호출하면 문서에 들어 있는 키를 믿어 공격자가 자기 키로 위조 문서에 서명할 수 있습니다.', '기대하는 키나 인증서를 넘겨 CheckSignature를 호출하세요.'],
  { kinds: { Invocation(n, cx) {
    if (callName(n) !== 'CheckSignature' || n.args.length) return;
    const t = T.typeOf(callTarget(n), cx.project);
    if (t && t.name === 'SignedXml') cx.report(n, 'Pass the expected key or certificate to CheckSignature.', 'CheckSignature에 기대하는 키나 인증서를 넘기세요.');
  } } });

const UNSAFE_FORMATTERS = new Set(['BinaryFormatter', 'SoapFormatter', 'NetDataContractSerializer', 'LosFormatter', 'ObjectStateFormatter']);
R('insecure-deserializer', 'S5773', 'V', 'CR', 30, ['cwe-502', 'owasp-a8'],
  ['Types allowed to be deserialized should be restricted', 'Formatters that read type names from the payload instantiate any type the attacker chooses, which leads to remote code execution.', 'Use a serializer bound to known types (System.Text.Json, DataContractSerializer) or restrict types with a SerializationBinder.'],
  ['역직렬화할 수 있는 타입은 제한해야 합니다', '페이로드에서 타입 이름을 읽는 포매터는 공격자가 고른 아무 타입이나 만들어 원격 코드 실행으로 이어집니다.', '알려진 타입에 묶인 직렬화기(System.Text.Json, DataContractSerializer)를 쓰거나 SerializationBinder로 타입을 제한하세요.'],
  { kinds: { New(n, cx) {
    const t = newTypeName(n);
    if (UNSAFE_FORMATTERS.has(t)) {
      if (n.init && n.init.items.some((i) => i.k === 'MemberInit' && i.name === 'Binder')) return;
      cx.report(n, `Restrict the types '${t}' may deserialize, or use a safe serializer.`, `'${t}'가 역직렬화할 수 있는 타입을 제한하거나 안전한 직렬화기를 쓰세요.`);
    } else if (t === 'JavaScriptSerializer' && n.args.some((a) => { const e = unparen(a.expr); return e && e.k === 'New' && newTypeName(e) === 'SimpleTypeResolver'; })) {
      cx.report(n, "Do not use 'SimpleTypeResolver': it lets the payload choose the type to create.", "'SimpleTypeResolver'를 쓰지 마세요. 페이로드가 만들 타입을 고르게 됩니다.");
    }
  } } });

R('json-type-name-handling', '', 'V', 'CR', 15, ['cwe-502', 'owasp-a8'],
  ['Json.NET TypeNameHandling should be None', 'Any TypeNameHandling other than None makes Json.NET create the types named in the payload, which can execute attacker code.', 'Keep TypeNameHandling.None, or add an ISerializationBinder that allows only known types.'],
  ['Json.NET TypeNameHandling은 None이어야 합니다', 'None이 아닌 TypeNameHandling은 Json.NET이 페이로드에 적힌 타입을 만들게 해 공격자 코드를 실행할 수 있습니다.', 'TypeNameHandling.None을 유지하거나 알려진 타입만 허용하는 ISerializationBinder를 추가하세요.'],
  { kinds: { Member(n, cx) {
    const m = /(?:^|\.)TypeNameHandling\.(All|Auto|Objects|Arrays)$/.exec(dotted(n) || '');
    if (!m) return;
    const init = enclosing(n, ['InitList']);
    if (init && init.items.some((i) => i.k === 'MemberInit' && (i.name === 'SerializationBinder' || i.name === 'Binder'))) return;
    cx.report(n, `Use TypeNameHandling.None instead of 'TypeNameHandling.${m[1]}', or restrict the types with a binder.`, `'TypeNameHandling.${m[1]}' 대신 TypeNameHandling.None을 쓰거나 바인더로 타입을 제한하세요.`);
  } } });

// ───────────────────────────────────────── web
R('cors-permissive', 'S5122', 'H', 'MI', 5, ['cwe-346', 'cwe-942', 'owasp-a5'],
  ['Having a permissive Cross-Origin Resource Sharing policy is security-sensitive', 'Allowing every origin lets any web site read the responses of this service with the user\'s credentials.', 'Allow only the origins that need access.'],
  ['허용 범위가 넓은 CORS 정책은 보안에 민감합니다', '모든 출처를 허용하면 어떤 웹 사이트든 사용자의 자격 증명으로 이 서비스의 응답을 읽을 수 있습니다.', '접근이 필요한 출처만 허용하세요.'],
  { kinds: {
    Invocation(n, cx) {
      const name = callName(n);
      if (name === 'AllowAnyOrigin' && !n.args.length) { cx.report(n, 'Make sure allowing any origin is safe here.', '여기서 모든 출처를 허용하는 것이 안전한지 확인하세요.'); return; }
      if (name === 'WithOrigins' && n.args.some((a) => U.strVal(a.expr) === '*')) { cx.report(n, "Make sure allowing the '*' origin is safe here.", "여기서 '*' 출처를 허용하는 것이 안전한지 확인하세요."); return; }
      if (name === 'SetIsOriginAllowed' && n.args.length === 1 && alwaysTrue(n.args[0].expr, cx)) { cx.report(n, 'Make sure allowing every origin is safe here.', '여기서 모든 출처를 허용하는 것이 안전한지 확인하세요.'); return; }
      if ((name === 'Add' || name === 'Append' || name === 'AddHeader' || name === 'AppendHeader') && n.args.length === 2 && /^Access-Control-Allow-Origin$/i.test(U.strVal(n.args[0].expr) || '') && U.strVal(n.args[1].expr) === '*') {
        cx.report(n, "Make sure the 'Access-Control-Allow-Origin: *' header is safe here.", "여기서 'Access-Control-Allow-Origin: *' 헤더가 안전한지 확인하세요.");
      }
    },
    Assign(n, cx) {
      const l = unparen(n.left);
      if (n.op === '=' && l && l.k === 'Element' && l.args.length === 1 && /^Access-Control-Allow-Origin$/i.test(U.strVal(l.args[0].expr) || '') && U.strVal(n.right) === '*') {
        cx.report(n, "Make sure the 'Access-Control-Allow-Origin: *' header is safe here.", "여기서 'Access-Control-Allow-Origin: *' 헤더가 안전한지 확인하세요.");
      }
    },
    Attribute(n, cx) {
      if (n.name !== 'EnableCors') return;
      const a = n.args.find((x) => x.name === 'origins') || (n.args[0] && !n.args[0].name ? n.args[0] : null);
      if (a && U.strVal(a.expr) === '*') cx.report(n, "Make sure allowing the '*' origin is safe here.", "여기서 '*' 출처를 허용하는 것이 안전한지 확인하세요.");
    },
  } });

function inDevelopmentGuard(n, cx) {
  let child = n;
  for (let p = n.parent; p; child = p, p = p.parent) {
    if (p.k === 'If' && p.then === child && /IsDevelopment|IsEnvironment|IsStaging|IsDebug|DEBUG/.test(src(cx, p.cond))) return true;
    if (p.k === 'Conditional' && p.then === child && /IsDevelopment|IsEnvironment/.test(src(cx, p.cond))) return true;
  }
  return false;
}
R('debug-features', 'S4507', 'H', 'MI', 1, ['cwe-489', 'cwe-215', 'owasp-a5'],
  ['Delivering code in production with debug features activated is security-sensitive', 'The developer exception page and database error page show stack traces, source and configuration to any visitor.', 'Enable them only when the environment is Development.'],
  ['디버그 기능을 켠 채로 운영에 배포하는 것은 보안에 민감합니다', '개발자 예외 페이지와 데이터베이스 오류 페이지는 스택 추적, 소스, 설정을 방문자 누구에게나 보여 줍니다.', '환경이 Development일 때만 켜세요.'],
  { kinds: { Invocation(n, cx) {
    const name = callName(n);
    if (name !== 'UseDeveloperExceptionPage' && name !== 'UseDatabaseErrorPage' && name !== 'UseMigrationsEndPoint') return;
    if (inDevelopmentGuard(n, cx)) return;
    cx.report(n, `Make sure '${name}' is not enabled in production.`, `'${name}'가 운영 환경에서 켜지지 않는지 확인하세요.`);
  } } });

const SQL_CMD = /^(SqlCommand|OleDbCommand|OdbcCommand|SqlDataAdapter|OleDbDataAdapter|NpgsqlCommand|MySqlCommand|SqliteCommand|SQLiteCommand|OracleCommand)$/;
const SQL_RAW = new Set(['ExecuteSqlRaw', 'ExecuteSqlRawAsync', 'FromSqlRaw', 'SqlQueryRaw', 'ExecuteSqlCommand', 'ExecuteSqlCommandAsync', 'FromSql']);
R('sql-formatted-query', 'S2077', 'H', 'MA', 20, ['cwe-89', 'owasp-a3'],
  ['Formatting SQL queries is security-sensitive', 'A query text built by concatenation or interpolation becomes injectable as soon as one part comes from a user.', 'Use parameters (SqlParameter, ExecuteSqlInterpolated, FromSqlInterpolated) instead of building the text.'],
  ['SQL 쿼리를 문자열로 조립하는 것은 보안에 민감합니다', '연결이나 보간으로 만든 쿼리 텍스트는 한 부분이라도 사용자 입력이면 인젝션이 가능합니다.', '텍스트를 조립하지 말고 매개변수(SqlParameter, ExecuteSqlInterpolated, FromSqlInterpolated)를 쓰세요.'],
  { kinds: {
    New(n, cx) {
      if (SQL_CMD.test(newTypeName(n) || '') && n.args.length && dynamicString(n.args[0].expr)) cx.report(n.args[0], 'Make sure using a dynamically formatted SQL query is safe here.', '여기서 동적으로 조립한 SQL 쿼리를 쓰는 것이 안전한지 확인하세요.');
    },
    Invocation(n, cx) {
      if (SQL_RAW.has(callName(n)) && n.args.length && dynamicString(n.args[0].expr)) cx.report(n.args[0], 'Make sure using a dynamically formatted SQL query is safe here.', '여기서 동적으로 조립한 SQL 쿼리를 쓰는 것이 안전한지 확인하세요.');
    },
    ...propSets((name, value, node, cx) => {
      if (name === 'CommandText' && dynamicString(value)) cx.report(node, 'Make sure using a dynamically formatted SQL query is safe here.', '여기서 동적으로 조립한 SQL 쿼리를 쓰는 것이 안전한지 확인하세요.');
    }),
  } });

// ───────────────────────────────────────── JWT
R('jwt-signature-not-validated', 'S5659', 'V', 'CR', 30, ['cwe-347', 'owasp-a2'],
  ['JWT should be signed and verified with strong cipher algorithms', 'A token whose signature is not checked can be forged by anyone, so its claims cannot be trusted.', 'Require signed tokens and validate the signing key.'],
  ['JWT는 강한 알고리즘으로 서명하고 검증해야 합니다', '서명을 검사하지 않은 토큰은 누구나 위조할 수 있어 그 클레임을 믿을 수 없습니다.', '서명된 토큰을 요구하고 서명 키를 검증하세요.'],
  { kinds: {
    ...propSets((name, value, node, cx) => {
      if ((name === 'RequireSignedTokens' || name === 'ValidateIssuerSigningKey') && isFalse(value)) cx.report(node, `Do not set '${name}' to false: the token signature must be verified.`, `'${name}'를 false로 두지 마세요. 토큰 서명을 검증해야 합니다.`);
    }),
    Invocation(n, cx) {
      const name = callName(n);
      if (name === 'DoNotVerifySignature') { cx.report(n, 'Verify the token signature instead of skipping it.', '토큰 서명 검증을 건너뛰지 말고 검증하세요.'); return; }
      if (name === 'WithVerifySignature' && n.args.length === 1 && isFalse(n.args[0].expr)) { cx.report(n, 'Verify the token signature instead of skipping it.', '토큰 서명 검증을 건너뛰지 말고 검증하세요.'); return; }
      if (name === 'Decode') {
        const a = argNamed(n, 'verify');
        if (a && isFalse(a.expr)) cx.report(n, 'Verify the token signature instead of skipping it.', '토큰 서명 검증을 건너뛰지 말고 검증하세요.');
      }
    },
  } });

R('jwt-lifetime-not-validated', '', 'V', 'MA', 10, ['cwe-613', 'owasp-a7'],
  ['JWT expiration should be validated', 'Without lifetime validation a stolen or revoked token stays usable forever.', 'Keep ValidateLifetime and RequireExpirationTime true.'],
  ['JWT 만료는 검증해야 합니다', '수명을 검증하지 않으면 도난당하거나 폐기한 토큰을 영원히 쓸 수 있습니다.', 'ValidateLifetime과 RequireExpirationTime을 true로 두세요.'],
  { kinds: propSets((name, value, node, cx) => {
    if ((name === 'ValidateLifetime' || name === 'RequireExpirationTime') && isFalse(value)) cx.report(node, `Do not set '${name}' to false: expired tokens would be accepted.`, `'${name}'를 false로 두지 마세요. 만료된 토큰을 받아들이게 됩니다.`);
  }) });

R('jwt-issuer-not-validated', '', 'H', 'MA', 10, ['cwe-287', 'owasp-a7'],
  ['Disabling JWT issuer or audience validation is security-sensitive', 'Without issuer and audience checks a token minted for another application or by another authority is accepted.', 'Validate the issuer and the audience, and configure the expected values.'],
  ['JWT 발급자나 대상 검증을 끄는 것은 보안에 민감합니다', '발급자와 대상을 검사하지 않으면 다른 애플리케이션용이나 다른 기관이 만든 토큰도 받아들입니다.', '발급자와 대상을 검증하고 기대하는 값을 설정하세요.'],
  { kinds: propSets((name, value, node, cx) => {
    if ((name === 'ValidateIssuer' || name === 'ValidateAudience') && isFalse(value)) cx.report(node, `Make sure disabling '${name}' is safe here.`, `여기서 '${name}'를 끄는 것이 안전한지 확인하세요.`);
  }) });

// ───────────────────────────────────────── system
R('ldap-anonymous-bind', 'S4433', 'V', 'CR', 10, ['cwe-521', 'owasp-a7'],
  ['LDAP connections should be authenticated', 'An anonymous or unauthenticated bind lets anyone query or change the directory.', 'Bind with credentials and AuthenticationTypes.Secure.'],
  ['LDAP 연결은 인증해야 합니다', '익명 또는 인증 없는 바인드는 누구나 디렉터리를 조회하거나 바꾸게 합니다.', '자격 증명과 AuthenticationTypes.Secure로 바인드하세요.'],
  { kinds: {
    Member(n, cx) {
      const m = /(?:^|\.)(AuthenticationTypes\.(None|Anonymous)|AuthType\.Anonymous)$/.exec(dotted(n) || '');
      if (m) cx.report(n, `Use an authenticated bind instead of '${m[1]}'.`, `'${m[1]}' 대신 인증된 바인드를 쓰세요.`);
    },
  } });

R('permissive-file-access', 'S2612', 'H', 'MA', 10, ['cwe-732', 'cwe-266', 'owasp-a1'],
  ['Setting loose file permissions is security-sensitive', 'Granting access to everyone or to other users lets any local account read or tamper with the file.', 'Grant access only to the accounts that need it.'],
  ['느슨한 파일 권한 설정은 보안에 민감합니다', '모든 사용자나 다른 사용자에게 접근을 허용하면 어떤 로컬 계정이든 파일을 읽거나 변조할 수 있습니다.', '필요한 계정에만 접근을 허용하세요.'],
  { kinds: {
    New(n, cx) {
      if (!/^(FileSystemAccessRule|FileSystemAuditRule)$/.test(newTypeName(n) || '') || !n.args.length) return;
      if (n.args.some((a) => /AccessControlType\.Deny/.test(src(cx, a)))) return;
      const first = n.args[0].expr;
      const s = U.strVal(first);
      if ((s && /^(Everyone|Users|BUILTIN\\Users|Authenticated Users)$/i.test(s)) || /WellKnownSidType\.(WorldSid|BuiltinUsersSid|AuthenticatedUserSid)/.test(src(cx, first))) {
        cx.report(n, `Make sure granting access to '${s || 'everyone'}' is safe here.`, `여기서 '${s || 'everyone'}'에게 접근을 허용하는 것이 안전한지 확인하세요.`);
      }
    },
    Member(n, cx) {
      const m = /(?:^|\.)UnixFileMode\.(OtherRead|OtherWrite|OtherExecute)$/.exec(dotted(n) || '');
      if (m) cx.report(n, `Make sure granting '${m[1]}' permission is safe here.`, `여기서 '${m[1]}' 권한을 주는 것이 안전한지 확인하세요.`);
    },
  } });

R('logging-configuration', 'S4792', 'H', 'MI', 10, ['cwe-117', 'cwe-532', 'owasp-a9'],
  ['Configuring loggers is security-sensitive', 'Logger configuration decides what is recorded and where: too little hides attacks, too much leaks secrets.', 'Review that the configuration logs security events without personal data or secrets.'],
  ['로거 설정은 보안에 민감합니다', '로거 설정은 무엇을 어디에 기록할지 정합니다. 너무 적으면 공격을 숨기고 너무 많으면 비밀을 노출합니다.', '보안 이벤트는 기록하되 개인 정보나 비밀은 남기지 않는지 설정을 검토하세요.'],
  { kinds: {
    Invocation(n, cx) {
      const name = callName(n); const t = targetName(n);
      if (((t === 'XmlConfigurator' || t === 'BasicConfigurator') && /^Configure/.test(name)) || (t === 'LoggerFactory' && name === 'Create')) {
        cx.report(n, 'Make sure that this logger\'s configuration is safe.', '이 로거 설정이 안전한지 확인하세요.');
      }
    },
    New(n, cx) {
      if (newTypeName(n) === 'LoggerConfiguration' || newTypeName(n) === 'LoggingConfiguration') cx.report(n, 'Make sure that this logger\'s configuration is safe.', '이 로거 설정이 안전한지 확인하세요.');
    },
    Assign(n, cx) {
      const l = unparen(n.left);
      if (n.op === '=' && l && l.k === 'Member' && l.name === 'Configuration' && /(^|\.)LogManager$/.test(dotted(l.expr) || '')) cx.report(n, 'Make sure that this logger\'s configuration is safe.', '이 로거 설정이 안전한지 확인하세요.');
    },
  } });

R('insecure-temp-file', 'S5445', 'V', 'CR', 10, ['cwe-377', 'cwe-379', 'owasp-a1'],
  ['Insecure temporary file creation methods should not be used', 'Path.GetTempFileName creates a predictable name in a shared directory, opening race conditions and file hijacking.', 'Create the file with a random name (Path.GetRandomFileName) and FileMode.CreateNew in a private directory.'],
  ['안전하지 않은 임시 파일 생성 메서드를 쓰면 안 됩니다', 'Path.GetTempFileName은 공유 디렉터리에 예측 가능한 이름을 만들어 경쟁 조건과 파일 탈취를 일으킵니다.', '전용 디렉터리에 무작위 이름(Path.GetRandomFileName)과 FileMode.CreateNew로 파일을 만드세요.'],
  { kinds: { Invocation(n, cx) {
    if (callName(n) === 'GetTempFileName' && targetName(n) === 'Path') cx.report(n, "'Path.GetTempFileName' is insecure; use 'Path.GetRandomFileName' with FileMode.CreateNew.", "'Path.GetTempFileName'은 안전하지 않습니다. 'Path.GetRandomFileName'과 FileMode.CreateNew를 쓰세요.");
  } } });

const PUBLIC_DIR = /^(\/tmp|\/var\/tmp|\/usr\/tmp|\/dev\/shm|\/dev\/mqueue|\/run\/lock|\/var\/run\/lock|\/library\/caches|\/users\/shared|\/private\/tmp|\/private\/var\/tmp)(\/|$)|^[a-z]:[\\/]windows[\\/]temp([\\/]|$)|^%(temp|tmp|tmpdir)%/i;
R('publicly-writable-directory', 'S5443', 'H', 'CR', 10, ['cwe-377', 'cwe-379', 'owasp-a1'],
  ['Using publicly writable directories is security-sensitive', 'Other users can create, replace or link files in shared temporary directories before this program uses them.', 'Use a directory private to the application or user.'],
  ['모두가 쓸 수 있는 디렉터리 사용은 보안에 민감합니다', '공유 임시 디렉터리에는 다른 사용자가 이 프로그램보다 먼저 파일을 만들거나 바꾸거나 링크할 수 있습니다.', '애플리케이션이나 사용자 전용 디렉터리를 쓰세요.'],
  { kinds: {
    Literal(n, cx) {
      if (n.kind !== 'string' || typeof n.value !== 'string' || !PUBLIC_DIR.test(n.value)) return;
      cx.report(n, `Make sure publicly writable directories are used safely here ('${n.value.slice(0, 40)}').`, `여기서 모두가 쓸 수 있는 디렉터리('${n.value.slice(0, 40)}')를 안전하게 쓰는지 확인하세요.`);
    },
    Invocation(n, cx) {
      const name = callName(n); const t = targetName(n);
      if (name === 'GetTempPath' && t === 'Path') { cx.report(n, 'Make sure publicly writable directories are used safely here.', '여기서 모두가 쓸 수 있는 디렉터리를 안전하게 쓰는지 확인하세요.'); return; }
      if ((name === 'GetEnvironmentVariable' || name === 'ExpandEnvironmentVariables') && t === 'Environment' && n.args.length) {
        const v = U.strVal(n.args[0].expr);
        if (v && /^(TMP|TEMP|TMPDIR)$/i.test(v)) cx.report(n, 'Make sure publicly writable directories are used safely here.', '여기서 모두가 쓸 수 있는 디렉터리를 안전하게 쓰는지 확인하세요.');
      }
    },
  } });

function partialCommand(v) {
  if (typeof v !== 'string' || !v) return false;
  if (/[\\/]/.test(v) || /^[a-z][a-z0-9+.-]*:/i.test(v)) return false;
  if (/\s/.test(v)) return false;
  const ext = /\.([a-z0-9]+)$/i.exec(v);
  return !ext || /^(exe|com|bat|cmd|ps1|sh|vbs|msi)$/i.test(ext[1]);
}
R('os-command-partial-path', 'S4036', 'H', 'MI', 5, ['cwe-426', 'cwe-427', 'owasp-a8'],
  ['Searching OS commands in PATH is security-sensitive', 'A command given without a full path is looked up in PATH and the working directory, where an attacker may plant a program with the same name.', 'Start programs with their absolute path.'],
  ['PATH에서 OS 명령을 찾는 것은 보안에 민감합니다', '전체 경로 없이 준 명령은 PATH와 작업 디렉터리에서 찾기 때문에 공격자가 같은 이름의 프로그램을 심을 수 있습니다.', '프로그램을 절대 경로로 실행하세요.'],
  { kinds: {
    Invocation(n, cx) {
      if (callName(n) !== 'Start' || targetName(n) !== 'Process' || !n.args.length) return;
      const v = U.strVal(n.args[0].expr);
      if (partialCommand(v)) cx.report(n.args[0], `Make sure the '${v}' command is resolved from a safe location: use its full path.`, `'${v}' 명령을 안전한 위치에서 찾는지 확인하세요. 전체 경로를 쓰세요.`);
    },
    New(n, cx) {
      if (newTypeName(n) !== 'ProcessStartInfo' || !n.args.length) return;
      const v = U.strVal(n.args[0].expr);
      if (partialCommand(v)) cx.report(n.args[0], `Make sure the '${v}' command is resolved from a safe location: use its full path.`, `'${v}' 명령을 안전한 위치에서 찾는지 확인하세요. 전체 경로를 쓰세요.`);
    },
    ...propSets((name, value, node, cx, owner) => {
      if (name !== 'FileName') return;
      if (!(owner.type === 'ProcessStartInfo' || /(^|\.)StartInfo$/.test(owner.recv || ''))) return;
      const v = U.strVal(value);
      if (partialCommand(v)) cx.report(node, `Make sure the '${v}' command is resolved from a safe location: use its full path.`, `'${v}' 명령을 안전한 위치에서 찾는지 확인하세요. 전체 경로를 쓰세요.`);
    }),
  } });

const UNSAFE_MEMBER_KINDS = ['Method', 'Ctor', 'Operator', 'Conversion', 'Property', 'Indexer', 'Field', 'TypeDecl', 'LocalFunc', 'Destructor'];
R('unsafe-code', 'S6640', 'H', 'MA', 10, ['cwe-119', 'cwe-787'],
  ['Using unsafe code blocks is security-sensitive', 'Unsafe code bypasses the runtime\'s memory safety, so an indexing mistake becomes memory corruption.', 'Prefer Span<T>, Marshal or safe APIs; keep unsafe code small and reviewed.'],
  ['unsafe 코드 블록 사용은 보안에 민감합니다', 'unsafe 코드는 런타임의 메모리 안전성을 우회해 인덱스 실수가 메모리 손상이 됩니다.', 'Span<T>, Marshal 같은 안전한 API를 쓰고 unsafe 코드는 작게 유지하고 검토하세요.'],
  { file(pf, cx) {
    for (const kind of UNSAFE_MEMBER_KINDS) {
      for (const m of pf.byKind.get(kind) || []) {
        if (!U.hasMod(m, 'unsafe')) continue;
        const label = m.name || (m.vars && m.vars[0] && m.vars[0].name) || kind;
        cx.report(m, `Make sure that using 'unsafe' in '${label}' is safe here.`, `'${label}'에서 'unsafe'를 쓰는 것이 안전한지 확인하세요.`, { atName: true });
      }
    }
    for (const s of pf.byKind.get('UnsafeStmt') || []) cx.report(s, "Make sure that using this 'unsafe' block is safe here.", "이 'unsafe' 블록을 쓰는 것이 안전한지 확인하세요.");
  } });

R('archive-expansion', 'S5042', 'H', 'CR', 30, ['cwe-409', 'owasp-a1'],
  ['Expanding archive files without controlling resource consumption is security-sensitive', 'A small crafted archive (zip bomb) can expand to gigabytes or millions of files and exhaust disk and memory.', 'Check the number of entries, their uncompressed size and the compression ratio before extracting.'],
  ['자원 사용을 제한하지 않고 압축 파일을 푸는 것은 보안에 민감합니다', '조작한 작은 압축 파일(zip 폭탄)은 수 기가바이트나 수백만 개의 파일로 풀려 디스크와 메모리를 소진할 수 있습니다.', '풀기 전에 항목 수, 압축 해제 크기, 압축률을 확인하세요.'],
  { kinds: { Invocation(n, cx) {
    const name = callName(n);
    if (name === 'ExtractToDirectory') { cx.report(n, 'Make sure that expanding this archive is safe here.', '여기서 이 압축 파일을 푸는 것이 안전한지 확인하세요.'); return; }
    if (name !== 'ExtractToFile') return;
    const loop = enclosing(n, ['Foreach', 'For', 'While']);
    if (loop && /\.(Length|CompressedLength)\b/.test(src(cx, loop))) return;
    cx.report(n, 'Make sure that expanding this archive is safe here.', '여기서 이 압축 파일을 푸는 것이 안전한지 확인하세요.');
  } } });

module.exports = {};
