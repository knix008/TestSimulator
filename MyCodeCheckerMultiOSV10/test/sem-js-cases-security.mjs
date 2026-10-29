// Samples for the security rules (core/sem-js/rules/security.js) and the
// CFG / symbolic-execution rules (core/sem-js/rules/flow-rules.js).
export default {
  // ---------------------------------------------------------------- flow rules
  'null-dereference': [
    {
      bad: `function describe(user) {
  if (user == null) {
    console.log('missing user', user.name); // Noncompliant
  }
  return user.name;
}

function firstLabel(items) {
  let label = null;
  if (items.length > 3) {
    label = items[0].label;
  }
  return label.trim(); // Noncompliant
}

describe({ name: 'a' });
firstLabel([]);
`,
      good: `function describe(user) {
  if (user == null) {
    console.log('missing user');
    return '';
  }
  return user.name;
}

function firstLabel(items) {
  let label = null;
  if (items.length > 3) {
    label = items[0].label;
  }
  return label ? label.trim() : '';
}

function lazy() {
  let cache = null;
  cache = { size: 1 };
  return cache.size;
}

describe({ name: 'a' });
firstLabel([]);
lazy();
`,
    },
    {
      lang: 'ts',
      bad: `interface Config { port: number }

export function portOf(cfg: Config | undefined): number {
  if (cfg === undefined) {
    return cfg.port; // Noncompliant
  }
  return cfg.port;
}
`,
      good: `interface Config { port: number }

export function portOf(cfg: Config | undefined): number {
  if (cfg === undefined) {
    return 8080;
  }
  return cfg!.port;
}
`,
    },
    {
      bad: `
function open(p) {
  let v = null;
  try {
    if (p.ok) v = p.value;
  } finally {
    p.close();
  }
  return v.length; // Noncompliant
}
function warnOnly(t) {
  let prm;
  if (t.id) prm = { name: t.v };
  else t.warn('bad parameter');
  return prm.name; // Noncompliant
}
open({}); warnOnly({});
`,
      good: `
// a throw inside try leaves through finally: the read after the try is not reached
function parseSuffix(p) {
  let pl;
  try {
    pl = p.parseParamList();
  } finally {
    p.popScope();
  }
  return pl.params;
}
// this.fail() and die() always throw
class Parser {
  fail(msg) {
    const e = new Error(msg);
    e.pos = this.i;
    throw e;
  }
  type(opts) {
    let t;
    if (this.isId()) t = this.node('Type');
    else this.fail('expected type');
    t.nullable = opts.nullable;
    return t;
  }
}
function die(msg) {
  throw new Error(msg);
}
function param(t) {
  let prm;
  if (t.id) prm = { name: t.v };
  else die('bad parameter');
  return prm.name;
}
parseSuffix({}); new Parser().type({}); param({});
`,
    },
  ],

  'unreachable-branch': {
    bad: `function status(code) {
  if (code == null) {
    if (code) { // Noncompliant
      return 'set';
    }
    return 'none';
  }
  return code > 0 ? 'ok' : 'error';
}

function pick(flag) {
  if (!flag) {
    return flag ? 'yes' : 'no'; // Noncompliant
  }
  return 'yes';
}

status(1);
pick(true);
`,
    good: `function status(code) {
  if (code == null) {
    return 'none';
  }
  if (code) {
    return 'set';
  }
  return 'zero';
}

function pick(flag, other) {
  if (!flag) {
    return other ? 'yes' : 'no';
  }
  return 'yes';
}

status(1);
pick(true, false);
`,
  },

  'gratuitous-condition': {
    bad: `function render(node) {
  if (node) {
    if (node) { // Noncompliant
      return node.title;
    }
  }
  return '';
}

function size(list) {
  if (!list) return 0;
  return list && list.length; // Noncompliant
}

render({ title: 'x' });
size([]);
`,
    good: `function render(node) {
  if (node) {
    if (node.visible) {
      return node.title;
    }
  }
  return '';
}

function size(list) {
  return list && list.length;
}

render({ title: 'x' });
size([]);
`,
  },

  'dead-store': [
    {
      bad: `function total(items, tax) {
  let sum = items.reduce((a, b) => a + b.price, 0); // Noncompliant
  sum = items.length * 10;
  return sum * tax;
}

function label(user) {
  let text;
  text = user.first + ' ' + user.last; // Noncompliant
  text = user.nick;
  return text;
}

total([], 1);
label({});
`,
      good: `function total(items, tax) {
  let sum = items.reduce((a, b) => a + b.price, 0);
  if (!items.length) sum = 10;
  return sum * tax;
}

function label(user) {
  let text = '';
  if (user.nick) text = user.nick;
  else text = user.first + ' ' + user.last;
  return text;
}

function counter() {
  let n = 0;
  for (let i = 0; i < 3; i++) n += i;
  return n;
}

total([], 1);
label({});
counter();
`,
    },
    {
      lang: 'ts',
      bad: `export function parse(raw: string): number {
  let value: number = Number.parseInt(raw, 10); // Noncompliant
  value = Number(raw);
  return value;
}
`,
      good: `export function parse(raw: string): number {
  let value: number = Number.parseInt(raw, 10);
  if (Number.isNaN(value)) value = Number(raw);
  return value;
}
`,
    },
    {
      path: 'src/Flag.jsx',
      bad: `import { FLAGS } from './flags';
export function Flag({ lang }) {
  let Icon = FLAGS[0].Icon; // Noncompliant
  Icon = FLAGS[1].Icon;
  return <Icon lang={lang} />;
}
`,
      good: `import { FLAGS } from './flags';
// <Icon /> reads Icon
export function Flag({ lang, ...rest }) {
  const Icon = (FLAGS.find((f) => f.lang === lang) || FLAGS[0]).Icon;
  return <Icon {...rest} />;
}
export function Finally(p) {
  let state = 'start';
  try {
    state = p.run();
  } finally {
    p.done(state);
  }
  return state;
}
`,
    },
  ],

  'unreachable-code': {
    bad: `function check(a) {
  return a > 0;
  console.log('checked'); // Noncompliant
}

function choose(a) {
  if (a) {
    throw new Error('bad');
  } else {
    return 1;
  }
  a += 1; // Noncompliant
}

function scan(list) {
  for (const x of list) {
    if (x) {
      break;
      console.log(x); // Noncompliant
    }
  }
}

check(1);
choose(0);
scan([]);
`,
    good: `function check(a) {
  console.log('checked');
  return a > 0;
}

function choose(a) {
  if (a) {
    throw new Error('bad');
  }
  return helper();
  function helper() { return 1; }
}

function scan(list) {
  for (const x of list) {
    if (x) {
      console.log(x);
      break;
    }
  }
  switch (list.length) {
    case 0:
      return 'empty';
    default:
      return 'full';
  }
}

check(1);
choose(0);
scan([]);
// the statement after a call that always throws is not reported
class Reader {
  fail(msg) { throw new Error(msg); }
  next() {
    if (this.ok) return 1;
    this.fail('eof');
    return null;
  }
}
new Reader().next();
class Ev {
  fail(m) { throw new Error(m); }
  op(o, a, b) {
    switch (o) {
      case '+': return a + b;
      case '-': return a - b;
      default: this.fail('op ' + o);
    }
    return 0;
  }
}
new Ev().op('+', 1, 2);
`,
  },

  // ---------------------------------------------------------------- crypto
  'weak-hash': [
    {
      bad: `const crypto = require('crypto');

function fingerprint(data) {
  return crypto.createHash('md5').update(data).digest('hex'); // Noncompliant
}

function sign(data, key) {
  return crypto.createHmac('sha1', key).update(data).digest('hex'); // Noncompliant
}

module.exports = { fingerprint, sign };
`,
      good: `const crypto = require('crypto');

function fingerprint(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function sign(data, key) {
  return crypto.createHmac('sha512', key).update(data).digest('hex');
}

module.exports = { fingerprint, sign };
`,
    },
    {
      lang: 'ts',
      bad: `import { createHash } from 'crypto';
import CryptoJS from 'crypto-js';

const ALG = 'sha1';

export function etag(body: string): string {
  return createHash(ALG).update(body).digest('base64'); // Noncompliant
}

export function legacy(body: string): string {
  return CryptoJS.MD5(body).toString(); // Noncompliant
}
`,
      good: `import { createHash } from 'crypto';
import CryptoJS from 'crypto-js';

const ALG = 'sha384';

export function etag(body: string): string {
  return createHash(ALG).update(body).digest('base64');
}

export function modern(body: string): string {
  return CryptoJS.SHA256(body).toString();
}
`,
    },
  ],

  'weak-cipher': {
    bad: `const crypto = require('crypto');
const CryptoJS = require('crypto-js');

function seal(key, iv, text) {
  const c = crypto.createCipheriv('des-ede3-cbc', key, iv); // Noncompliant
  return c.update(text, 'utf8', 'hex') + c.final('hex');
}

function legacy(text, key) {
  return CryptoJS.RC4.encrypt(text, key).toString(); // Noncompliant
}

module.exports = { seal, legacy };
`,
    good: `const crypto = require('crypto');
const CryptoJS = require('crypto-js');

function seal(key, iv, text) {
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  return c.update(text, 'utf8', 'hex') + c.final('hex');
}

function modern(text, key) {
  return CryptoJS.AES.encrypt(text, key).toString();
}

module.exports = { seal, modern };
`,
  },

  'insecure-cipher-mode': {
    bad: `const crypto = require('crypto');
const CryptoJS = require('crypto-js');

function seal(key, iv, text) {
  const a = crypto.createCipheriv('aes-256-ecb', key, null); // Noncompliant
  const b = crypto.createCipheriv('aes-128-cbc', key, iv); // Noncompliant
  return [a.update(text), b.update(text)];
}

function wrap(publicKey, buf) {
  return crypto.publicEncrypt({ key: publicKey, padding: crypto.constants.RSA_PKCS1_PADDING }, buf); // Noncompliant
}

function legacy(text, key) {
  return CryptoJS.AES.encrypt(text, key, { mode: CryptoJS.mode.ECB }); // Noncompliant
}

module.exports = { seal, wrap, legacy };
`,
    good: `const crypto = require('crypto');
const CryptoJS = require('crypto-js');

function seal(key, iv, text) {
  const a = crypto.createCipheriv('aes-256-gcm', key, iv);
  return a.update(text);
}

function wrap(publicKey, buf) {
  return crypto.publicEncrypt({ key: publicKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING }, buf);
}

function modern(text, key, iv) {
  return CryptoJS.AES.encrypt(text, key, { mode: CryptoJS.mode.CTR, iv });
}

module.exports = { seal, wrap, modern };
`,
  },

  'cipher-static-iv': {
    bad: `const crypto = require('crypto');

const FIXED_IV = Buffer.from('0123456789abcdef');

function seal(key, text) {
  const a = crypto.createCipheriv('aes-128-gcm', key, FIXED_IV); // Noncompliant
  const b = crypto.createCipheriv('aes-256-gcm', key, Buffer.alloc(12)); // Noncompliant
  const c = crypto.createCipher('aes-256-gcm', key); // Noncompliant
  return [a.update(text), b.update(text), c.update(text)];
}

module.exports = { seal };
`,
    good: `const crypto = require('crypto');

function seal(key, text) {
  const iv = crypto.randomBytes(12);
  const a = crypto.createCipheriv('aes-256-gcm', key, iv);
  return { iv, data: a.update(text) };
}

function legacyEcb(key, text) {
  return crypto.createDecipheriv('aes-256-gcm', key, Buffer.from('0123456789ab')).update(text);
}

module.exports = { seal, legacyEcb };
`,
  },

  'weak-key-size': {
    bad: `const crypto = require('crypto');
const forge = require('node-forge');

const rsa = crypto.generateKeyPairSync('rsa', { modulusLength: 1024 }); // Noncompliant
crypto.generateKeyPair('ec', { namedCurve: 'secp112r1' }, () => {}); // Noncompliant
const dh = crypto.createDiffieHellman(1024); // Noncompliant
const pair = forge.pki.rsa.generateKeyPair({ bits: 512 }); // Noncompliant

module.exports = { rsa, dh, pair };
`,
    good: `const crypto = require('crypto');
const forge = require('node-forge');

const rsa = crypto.generateKeyPairSync('rsa', { modulusLength: 4096 });
crypto.generateKeyPair('ec', { namedCurve: 'prime256v1' }, () => {});
const dh = crypto.createDiffieHellman(2048);
const pair = forge.pki.rsa.generateKeyPair({ bits: 2048 });

module.exports = { rsa, dh, pair };
`,
  },

  'weak-tls': {
    bad: `const https = require('https');
const tls = require('tls');

const agent = new https.Agent({ secureProtocol: 'TLSv1_method' }); // Noncompliant
const socket = tls.connect({
  host: 'api.example.com',
  port: 443,
  minVersion: 'TLSv1.1', // Noncompliant
});

module.exports = { agent, socket };
`,
    good: `const https = require('https');
const tls = require('tls');

const agent = new https.Agent({ secureProtocol: 'TLS_method' });
const socket = tls.connect({
  host: 'api.example.com',
  port: 443,
  minVersion: 'TLSv1.2',
  maxVersion: 'TLSv1.3',
});

module.exports = { agent, socket };
`,
  },

  'tls-reject-unauthorized': {
    bad: `const https = require('https');
const request = require('request');

https.get({ hostname: 'api.example.com', rejectUnauthorized: false }, (res) => res.resume()); // Noncompliant

request({
  url: 'https://api.example.com/items',
  strictSSL: false, // Noncompliant
});
`,
    good: `const fs = require('fs');
const https = require('https');
const request = require('request');

https.get({ hostname: 'api.example.com', ca: fs.readFileSync('ca.pem'), rejectUnauthorized: true }, (res) => res.resume());

request({
  url: 'https://api.example.com/items',
  strictSSL: true,
});
`,
  },

  'tls-env-disabled': {
    bad: `function insecureMode() {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // Noncompliant
}

if (process.argv.includes('--insecure')) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = 0; // Noncompliant
}

insecureMode();
`,
    good: `function secureMode() {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '1';
  process.env.NODE_EXTRA_CA_CERTS = '/etc/ssl/company-ca.pem';
}

const current = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
secureMode();
console.log(current === '0');
`,
  },

  'hostname-not-verified': {
    bad: `const tls = require('tls');
const https = require('https');

const socket = tls.connect({
  host: 'api.example.com',
  checkServerIdentity: () => undefined, // Noncompliant
});

const agent = new https.Agent({
  checkServerIdentity(host, cert) { // Noncompliant
    console.log(host, cert.subject);
    return;
  },
});

module.exports = { socket, agent };
`,
    good: `const tls = require('tls');
const https = require('https');

const PINS = ['AA:BB'];

const socket = tls.connect({
  host: 'api.example.com',
  checkServerIdentity: (host, cert) => tls.checkServerIdentity(host, cert),
});

const agent = new https.Agent({
  checkServerIdentity(host, cert) {
    const err = tls.checkServerIdentity(host, cert);
    if (err) return err;
    if (!PINS.includes(cert.fingerprint256)) return new Error('certificate pin mismatch');
    return undefined;
  },
});

module.exports = { socket, agent };
`,
  },

  // ---------------------------------------------------------------- web
  'cors-any-origin': {
    bad: `const express = require('express');
const cors = require('cors');

const app = express();
app.disable('x-powered-by');
app.use(cors()); // Noncompliant
app.use('/api', cors({ origin: '*' })); // Noncompliant
app.get('/data', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*'); // Noncompliant
  res.json({});
});
const headers = { 'Access-Control-Allow-Origin': '*' }; // Noncompliant

module.exports = { app, headers };
`,
    good: `const express = require('express');
const cors = require('cors');

const app = express();
app.disable('x-powered-by');
app.use(cors({ origin: 'https://app.example.com' }));
app.get('/data', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', 'https://app.example.com');
  res.setHeader('Cache-Control', '*');
  res.json({});
});

module.exports = { app };
`,
  },

  'cookie-not-secure': {
    bad: `const session = require('express-session');
const cookieSession = require('cookie-session');

function login(app, res, id) {
  res.cookie('sid', id, { httpOnly: true, secure: false }); // Noncompliant
  app.use(session({ secret: process.env.SECRET, cookie: { secure: false } })); // Noncompliant
  app.use(cookieSession({ name: 'sess', keys: ['k'], secure: false })); // Noncompliant
}

module.exports = { login };
`,
    good: `const session = require('express-session');

function login(app, res, id) {
  res.cookie('sid', id, { httpOnly: true, secure: true, sameSite: 'strict' });
  app.use(session({ secret: process.env.SECRET, cookie: { secure: true } }));
  const cache = new Map();
  cache.set('secure', false);
}

module.exports = { login };
`,
  },

  'cookie-not-httponly': {
    bad: `const cookie = require('cookie');

function login(res, id) {
  res.cookie('sid', id, { secure: true, httpOnly: false }); // Noncompliant
  res.setHeader('Set-Cookie', cookie.serialize('token', id, { secure: true, httpOnly: false })); // Noncompliant
}

module.exports = { login };
`,
    good: `const cookie = require('cookie');

function login(res, id) {
  res.cookie('sid', id, { secure: true, httpOnly: true });
  res.setHeader('Set-Cookie', cookie.serialize('token', id, { secure: true, httpOnly: true }));
}

module.exports = { login };
`,
  },

  'cookie-write': {
    bad: `function rememberTheme(theme) {
  document.cookie = 'theme=' + encodeURIComponent(theme) + '; path=/'; // Noncompliant
}

function forget() {
  window.document.cookie = 'theme=; max-age=0'; // Noncompliant
}

rememberTheme('dark');
forget();
`,
    good: `function readTheme() {
  const match = document.cookie.match(/theme=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : 'light';
}

function rememberTheme(theme) {
  localStorage.setItem('theme', theme);
}

readTheme();
rememberTheme('dark');
`,
  },

  'jwt-weak-algorithm': {
    bad: `const jwt = require('jsonwebtoken');

function issue(payload, key) {
  return jwt.sign(payload, key, { algorithm: 'none' }); // Noncompliant
}

function check(token, key) {
  return jwt.verify(token, key, { algorithms: ['RS256', 'none'] }); // Noncompliant
}

module.exports = { issue, check };
`,
    good: `const jwt = require('jsonwebtoken');

function issue(payload, key) {
  return jwt.sign(payload, key, { algorithm: 'RS256', expiresIn: '15m' });
}

function check(token, key) {
  return jwt.verify(token, key, { algorithms: ['RS256'] });
}

module.exports = { issue, check };
`,
  },

  'jwt-ignore-expiration': {
    bad: `import jwt from 'jsonwebtoken';

export function check(token, key) {
  return jwt.verify(token, key, { algorithms: ['HS256'], ignoreExpiration: true }); // Noncompliant
}
`,
    good: `import jwt from 'jsonwebtoken';

export function check(token, key) {
  return jwt.verify(token, key, { algorithms: ['HS256'], ignoreExpiration: false, maxAge: '1h' });
}
`,
  },

  'jwt-decode-unverified': {
    bad: `const jwt = require('jsonwebtoken');

function isAdmin(req) {
  const claims = jwt.decode(req.headers.authorization); // Noncompliant
  return !!claims && claims.role === 'admin';
}

module.exports = { isAdmin };
`,
    good: `const jwt = require('jsonwebtoken');

function isAdmin(req, key) {
  const claims = jwt.verify(req.headers.authorization, key, { algorithms: ['RS256'] });
  return claims.role === 'admin';
}

function expiresAt(token) {
  const header = jwt.decode(token, { complete: true });
  return header && header.payload.exp;
}

module.exports = { isAdmin, expiresAt };
`,
  },

  'dynamic-code-execution': {
    bad: `const vm = require('vm');

function run(code, body, n, sandbox) {
  const r = eval(code); // Noncompliant
  const fn = new Function('a', body); // Noncompliant
  setTimeout('tick(' + n + ')', 100); // Noncompliant
  return vm.runInNewContext(code, sandbox) + r + fn(1); // Noncompliant
}

module.exports = { run };
`,
    good: `const vm = require('vm');

const handlers = { add: (a, b) => a + b };

function run(name, n) {
  const four = eval('2 + 2');
  setTimeout(() => console.log(n), 100);
  const script = vm.runInNewContext('1 + 1', {});
  return handlers[name](four, script);
}

module.exports = { run };
`,
  },

  'postmessage-origin': {
    bad: `function notifyParent(data) {
  window.parent.postMessage(data, '*'); // Noncompliant
}

window.addEventListener('message', (event) => { // Noncompliant
  document.title = event.data.title;
});

notifyParent({ ready: true });
`,
    good: `const TRUSTED = 'https://app.example.com';

function notifyParent(data) {
  window.parent.postMessage(data, TRUSTED);
}

window.addEventListener('message', (event) => {
  if (event.origin !== TRUSTED) return;
  document.title = event.data.title;
});

function toWorker(worker, msg) {
  worker.postMessage(msg, []);
}

notifyParent({ ready: true });
toWorker(null, {});
`,
  },

  'hardcoded-ip': {
    bad: `const config = {
  db: '10.12.34.56', // Noncompliant
  api: 'http://192.168.1.20:8080/v1', // Noncompliant
  ipv6: '2001:0db9:85a3:0000:0000:8a2e:0370:7334', // Noncompliant
};

module.exports = config;
`,
    good: `const config = {
  db: process.env.DB_HOST || 'localhost',
  local: '127.0.0.1',
  docs: '192.0.2.10',
  loop6: '::1',
  version: '10.12.34.56',
  short: '1.2.3.4',
};

module.exports = config;
`,
  },

  'file-permissions': {
    bad: `const fs = require('fs');

function setup(dir, file, data) {
  fs.chmodSync(file, 0o777); // Noncompliant
  fs.writeFileSync(file, data, { mode: 0o666 }); // Noncompliant
  fs.mkdirSync(dir, 0o775); // Noncompliant
  process.umask(0o000); // Noncompliant
}

module.exports = { setup };
`,
    good: `const fs = require('fs');

function setup(dir, file, data) {
  fs.chmodSync(file, 0o600);
  fs.writeFileSync(file, data, { mode: 0o640 });
  fs.mkdirSync(dir, { recursive: true, mode: 0o750 });
  process.umask(0o077);
}

module.exports = { setup };
`,
  },

  'web-sql': {
    bad: `const db = openDatabase('notes', '1.0', 'Notes', 2 * 1024 * 1024); // Noncompliant
const cache = window.openDatabase('cache', '1.0', 'Cache', 1024); // Noncompliant

export { db, cache };
`,
    good: `function openDatabase(name) {
  return indexedDB.open(name, 1);
}

const db = openDatabase('notes');

export { db };
`,
  },

  'window-open-noopener': {
    bad: `function openPartner() {
  window.open('https://partner.example.com/offer'); // Noncompliant
}

function openUrl(url) {
  window.open(url, '_blank'); // Noncompliant
}

openPartner();
openUrl('https://x.example.com');
`,
    good: `function openPartner() {
  window.open('https://partner.example.com/offer', '_blank', 'noopener,noreferrer');
}

function openHelp() {
  window.open('/help/index.html');
}

function openUrl(url) {
  window.open(url, 'preview');
}

openPartner();
openHelp();
openUrl('https://x.example.com');
`,
  },

  'jsx-target-blank': [
    {
      path: 'src/Links.jsx',
      bad: `export function Links({ url }) {
  return (
    <div>
      <a href="https://example.com" target="_blank">Example</a>{/* Noncompliant */}
      <a href={url} target="_blank" rel="nofollow">Docs</a>{/* Noncompliant */}
    </div>
  );
}
`,
      good: `export function Links({ url }) {
  return (
    <div>
      <a href="https://example.com" target="_blank" rel="noopener noreferrer">Example</a>
      <a href={url} target="_blank" rel="noreferrer">Docs</a>
      <a href="/about" target="_blank">About</a>
    </div>
  );
}
`,
    },
    {
      lang: 'ts',
      path: 'src/Links.tsx',
      bad: `type Props = { href: string };

export function External({ href }: Props) {
  return <a href={href} target="_blank">Open</a>; // Noncompliant
}
`,
      good: `type Props = { href: string };

export function External({ href }: Props) {
  return <a href={href} target="_blank" rel="noopener noreferrer">Open</a>;
}
`,
    },
  ],

  'disabled-auto-escaping': {
    bad: `const Handlebars = require('handlebars');
const nunjucks = require('nunjucks');
const MarkdownIt = require('markdown-it');
const Mustache = require('mustache');

const page = Handlebars.compile('<p>{{name}}</p>', { noEscape: true }); // Noncompliant
nunjucks.configure('views', { autoescape: false }); // Noncompliant
const md = new MarkdownIt({ html: true }); // Noncompliant
Mustache.escape = function (text) { return text; }; // Noncompliant

module.exports = { page, md };
`,
    good: `const Handlebars = require('handlebars');
const nunjucks = require('nunjucks');
const MarkdownIt = require('markdown-it');

const page = Handlebars.compile('<p>{{name}}</p>', { noEscape: false });
nunjucks.configure('views', { autoescape: true });
const md = new MarkdownIt({ html: false, linkify: true });

module.exports = { page, md };
`,
  },

  // ---------------------------------------------------------------- helmet / express
  'csp-disabled': {
    bad: `const express = require('express');
const helmet = require('helmet');

const app = express();
app.use(helmet({ contentSecurityPolicy: false })); // Noncompliant
app.use(helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "'unsafe-inline'"], // Noncompliant
  },
}));

module.exports = app;
`,
    good: `const express = require('express');
const helmet = require('helmet');

const app = express();
app.use(helmet());
app.use(helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", 'https://cdn.example.com'],
  },
}));

module.exports = app;
`,
  },

  'clickjacking-protection-disabled': {
    bad: `const express = require('express');
const helmet = require('helmet');

const app = express();
app.use(helmet({ frameguard: false })); // Noncompliant
app.use('/v7', helmet({ xFrameOptions: false })); // Noncompliant

module.exports = app;
`,
    good: `const express = require('express');
const helmet = require('helmet');

const app = express();
app.use(helmet({ frameguard: { action: 'deny' } }));

module.exports = app;
`,
  },

  'content-sniffing-enabled': {
    bad: `const express = require('express');
const helmet = require('helmet');

const app = express();
app.use(helmet({ noSniff: false })); // Noncompliant
app.use('/v7', helmet({ xContentTypeOptions: false })); // Noncompliant

module.exports = app;
`,
    good: `const express = require('express');
const helmet = require('helmet');

const app = express();
app.use(helmet({ noSniff: true }));

module.exports = app;
`,
  },

  'referrer-policy-unsafe': {
    bad: `const express = require('express');
const helmet = require('helmet');

const app = express();
app.use(helmet({ referrerPolicy: false })); // Noncompliant
app.use(helmet.referrerPolicy({ policy: 'unsafe-url' })); // Noncompliant

module.exports = app;
`,
    good: `const express = require('express');
const helmet = require('helmet');

const app = express();
app.use(helmet());
app.use(helmet.referrerPolicy({ policy: 'strict-origin-when-cross-origin' }));

module.exports = app;
`,
  },

  'hsts-disabled': {
    bad: `const express = require('express');
const helmet = require('helmet');

const app = express();
app.use(helmet({ hsts: false })); // Noncompliant
app.use(helmet.hsts({ maxAge: 3600 })); // Noncompliant
app.use(helmet.hsts({
  maxAge: 31536000,
  includeSubDomains: false, // Noncompliant
}));

module.exports = app;
`,
    good: `const express = require('express');
const helmet = require('helmet');

const app = express();
app.use(helmet());
app.use(helmet.hsts({ maxAge: 31536000, includeSubDomains: true }));

module.exports = app;
`,
  },

  'dns-prefetch-allowed': {
    bad: `const express = require('express');
const helmet = require('helmet');

const app = express();
app.use(helmet({ dnsPrefetchControl: false })); // Noncompliant
app.use(helmet.dnsPrefetchControl({ allow: true })); // Noncompliant

module.exports = app;
`,
    good: `const express = require('express');
const helmet = require('helmet');

const app = express();
app.use(helmet());
app.use(helmet.dnsPrefetchControl({ allow: false }));

module.exports = app;
`,
  },

  'x-powered-by': [
    {
      bad: `const express = require('express');

const app = express(); // Noncompliant
app.get('/', (req, res) => res.send('ok'));
app.listen(3000);
`,
      good: `const express = require('express');

const app = express();
app.disable('x-powered-by');
app.get('/', (req, res) => res.send('ok'));
app.listen(3000);
`,
    },
    {
      good: `import express from 'express';
import helmet from 'helmet';

const app = express();
app.use(helmet());
app.listen(3000);
`,
    },
  ],

  'express-static-dotfiles': {
    bad: `const express = require('express');
const serveStatic = require('serve-static');

const app = express();
app.disable('x-powered-by');
app.use(express.static('public', { dotfiles: 'allow' })); // Noncompliant
app.use('/files', serveStatic('files', { index: false, dotfiles: 'allow' })); // Noncompliant

module.exports = app;
`,
    good: `const express = require('express');
const serveStatic = require('serve-static');

const app = express();
app.disable('x-powered-by');
app.use(express.static('public', { dotfiles: 'ignore' }));
app.use('/files', serveStatic('files', { index: false, dotfiles: 'deny' }));

module.exports = app;
`,
  },

  'upload-size-limit': {
    bad: `const express = require('express');
const multer = require('multer');
const bodyParser = require('body-parser');

const app = express();
app.disable('x-powered-by');
const upload = multer({ dest: 'uploads/' }); // Noncompliant
const big = multer({ dest: 'uploads/', limits: { fileSize: 50 * 1024 * 1024 } }); // Noncompliant
app.use(express.json({ limit: '50mb' })); // Noncompliant
app.use(bodyParser.urlencoded({ extended: true, limit: '20mb' })); // Noncompliant

module.exports = { app, upload, big };
`,
    good: `const express = require('express');
const multer = require('multer');
const bodyParser = require('body-parser');

const app = express();
app.disable('x-powered-by');
const upload = multer({ dest: 'uploads/', limits: { fileSize: 2 * 1024 * 1024 } });
app.use(express.json({ limit: '1mb' }));
app.use(bodyParser.urlencoded({ extended: true }));

module.exports = { app, upload };
`,
  },

  'archive-expansion': {
    bad: `const tar = require('tar');
const AdmZip = require('adm-zip');

function unpack(archive, dest) {
  tar.x({ file: archive, cwd: dest }); // Noncompliant
  const zip = new AdmZip(archive);
  zip.extractAllTo(dest, true); // Noncompliant
}

module.exports = { unpack };
`,
    good: `const tar = require('tar');
const AdmZip = require('adm-zip');

const MAX_FILES = 10000;
const MAX_SIZE = 1000000000;

function unpackTar(archive, dest) {
  let files = 0;
  let size = 0;
  return tar.x({
    file: archive,
    cwd: dest,
    filter: (path, entry) => {
      files++;
      size += entry.size;
      return files <= MAX_FILES && size <= MAX_SIZE;
    },
  });
}

function unpackZip(archive, dest) {
  const zip = new AdmZip(archive);
  let size = 0;
  const entries = zip.getEntries();
  if (entries.length > MAX_FILES) throw new Error('too many entries');
  for (const entry of entries) {
    size += entry.header.size;
    if (size > MAX_SIZE) throw new Error('archive too large');
    zip.extractEntryTo(entry.entryName, dest, false, true);
  }
}

module.exports = { unpackTar, unpackZip };
`,
  },

  'resource-integrity': {
    bad: `function loadLibrary() {
  const script = document.createElement('script');
  script.src = 'https://cdn.example.com/lib.min.js'; // Noncompliant
  document.head.appendChild(script);
}

loadLibrary();
`,
    good: `function loadLibrary() {
  const script = document.createElement('script');
  script.src = 'https://cdn.example.com/lib.min.js';
  script.integrity = 'sha384-oqVuAfXRKap7fdgcCY5uykM6+R9GqQ8K/uxy9rx7HNQlGYl1kPzQho1wx4JwY8wC';
  script.crossOrigin = 'anonymous';
  document.head.appendChild(script);
}

function loadLocal() {
  const script = document.createElement('script');
  script.src = '/js/app.js';
  document.head.appendChild(script);
}

loadLibrary();
loadLocal();
`,
  },

  'publicly-writable-dir': {
    bad: `const fs = require('fs');

function save(id, data) {
  fs.writeFileSync('/tmp/upload.dat', data); // Noncompliant
  const cache = '/var/tmp/app-cache.json'; // Noncompliant
  const file = \`/dev/shm/job-\${id}.lock\`; // Noncompliant
  return [cache, file];
}

module.exports = { save };
`,
    good: `const fs = require('fs');
const os = require('os');
const path = require('path');

function save(data) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-'));
  fs.writeFileSync(path.join(dir, 'upload.dat'), data, { mode: 0o600 });
  const route = '/tmpl/index';
  return [dir, route];
}

module.exports = { save };
`,
  },

  'permissions-api': {
    bad: `async function start(onPos) {
  navigator.geolocation.getCurrentPosition(onPos); // Noncompliant
  const stream = await navigator.mediaDevices.getUserMedia({ video: true }); // Noncompliant
  await Notification.requestPermission(); // Noncompliant
  const state = await navigator.permissions.query({ name: 'camera' }); // Noncompliant
  return [stream, state];
}

start(() => {});
`,
    good: `async function start(text) {
  await navigator.clipboard.writeText(text);
  const state = await navigator.permissions.query({ name: 'clipboard-write' });
  return state;
}

start('x');
`,
  },

  'ip-forwarding': {
    bad: `const httpProxy = require('http-proxy');

const proxy = httpProxy.createProxyServer({
  target: 'https://backend.internal',
  xfwd: true, // Noncompliant
});

module.exports = proxy;
`,
    good: `const httpProxy = require('http-proxy');

const proxy = httpProxy.createProxyServer({
  target: 'https://backend.internal',
  xfwd: false,
});

module.exports = proxy;
`,
  },

  'debug-feature': {
    bad: `const express = require('express');
const errorhandler = require('errorhandler');

const app = express();
app.disable('x-powered-by');
app.use(errorhandler()); // Noncompliant

if (process.env.NODE_ENV === 'production') {
  app.use(errorhandler({ log: true })); // Noncompliant
}

module.exports = app;
`,
    good: `const express = require('express');
const errorhandler = require('errorhandler');

const app = express();
app.disable('x-powered-by');

if (process.env.NODE_ENV === 'development') {
  app.use(errorhandler());
}

if (app.get('env') !== 'production') app.use(errorhandler({ log: false }));

module.exports = app;
`,
  },

  'angular-bypass-security': [
    {
      lang: 'ts',
      bad: `import { Component } from '@angular/core';
import { DomSanitizer, SafeHtml, SafeResourceUrl } from '@angular/platform-browser';

@Component({ selector: 'app-preview', template: '<div [innerHTML]="html"></div>' })
export class PreviewComponent {
  html!: SafeHtml;
  frame!: SafeResourceUrl;

  constructor(private sanitizer: DomSanitizer) {}

  show(raw: string, url: string): void {
    this.html = this.sanitizer.bypassSecurityTrustHtml(raw); // Noncompliant
    this.frame = this.sanitizer.bypassSecurityTrustResourceUrl(url); // Noncompliant
  }
}
`,
      good: `import { Component, SecurityContext } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Component({ selector: 'app-preview', template: '<div [innerHTML]="html"></div>' })
export class PreviewComponent {
  html!: SafeHtml;
  safe: string | null = null;

  constructor(private sanitizer: DomSanitizer) {}

  show(raw: string): void {
    this.safe = this.sanitizer.sanitize(SecurityContext.HTML, raw);
    this.html = this.sanitizer.bypassSecurityTrustHtml('<b>Static banner</b>');
  }
}
`,
    },
  ],

  'path-hijacking': {
    bad: `const cp = require('child_process');
const { execFileSync } = require('child_process');

function status(cb) {
  cp.exec('git status --short', cb); // Noncompliant
  cp.spawn('node', ['server.js']); // Noncompliant
  return execFileSync('convert', ['a.png', 'b.jpg']); // Noncompliant
}

module.exports = { status };
`,
    good: `const cp = require('child_process');
const { execFileSync } = require('child_process');

function status(cb) {
  cp.exec('/usr/bin/git status --short', cb);
  cp.spawn(process.execPath, ['server.js']);
  return execFileSync('./bin/convert', ['a.png', 'b.jpg']);
}

module.exports = { status };
`,
  },

  // ---------------------------------------------------------------- electron
  'electron-node-integration': [
    {
      path: 'src/main.js',
      bad: `const { BrowserWindow } = require('electron');

function createWindow() {
  return new BrowserWindow({
    width: 800,
    webPreferences: {
      nodeIntegration: true, // Noncompliant
      nodeIntegrationInWorker: true, // Noncompliant
    },
  });
}

module.exports = { createWindow };
`,
      good: `const path = require('path');
const { BrowserWindow } = require('electron');

function createWindow() {
  return new BrowserWindow({
    width: 800,
    webPreferences: {
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
}

const features = { nodeIntegration: true };

module.exports = { createWindow, features };
`,
    },
    {
      lang: 'ts',
      path: 'src/main.ts',
      bad: `import { BrowserWindow, WebPreferences } from 'electron';

const webPreferences: WebPreferences = {
  nodeIntegration: true, // Noncompliant
};

export const win = new BrowserWindow({ width: 640, webPreferences });
`,
      good: `import { BrowserWindow, WebPreferences } from 'electron';

const webPreferences: WebPreferences = {
  nodeIntegration: false,
  contextIsolation: true,
};

export const win = new BrowserWindow({ width: 640, webPreferences });
`,
    },
  ],

  'electron-context-isolation': {
    path: 'src/main.js',
    bad: `const { BrowserWindow } = require('electron');

const win = new BrowserWindow({
  webPreferences: { contextIsolation: false }, // Noncompliant
});

module.exports = win;
`,
    good: `const { BrowserWindow } = require('electron');

const win = new BrowserWindow({
  webPreferences: { contextIsolation: true },
});

module.exports = win;
`,
  },

  'electron-web-security': {
    path: 'src/main.js',
    bad: `const { BrowserWindow } = require('electron');

const win = new BrowserWindow({
  webPreferences: {
    webSecurity: false, // Noncompliant
  },
});

module.exports = win;
`,
    good: `const { BrowserWindow } = require('electron');

const win = new BrowserWindow({
  webPreferences: {
    webSecurity: true,
  },
});

module.exports = win;
`,
  },

  'electron-insecure-content': {
    path: 'src/main.js',
    bad: `const { BrowserWindow } = require('electron');

const win = new BrowserWindow({
  webPreferences: {
    allowRunningInsecureContent: true, // Noncompliant
  },
});

module.exports = win;
`,
    good: `const { BrowserWindow } = require('electron');

const win = new BrowserWindow({
  webPreferences: {
    allowRunningInsecureContent: false,
  },
});

module.exports = win;
`,
  },

  'electron-sandbox-disabled': {
    path: 'src/main.js',
    bad: `const { BrowserWindow, BrowserView } = require('electron');

const win = new BrowserWindow({
  webPreferences: { sandbox: false }, // Noncompliant
});
const view = new BrowserView({ webPreferences: { sandbox: false } }); // Noncompliant

module.exports = { win, view };
`,
    good: `const { BrowserWindow } = require('electron');

const win = new BrowserWindow({
  webPreferences: { sandbox: true },
});
const jest = { sandbox: false };

module.exports = { win, jest };
`,
  },

  'electron-remote-module': {
    path: 'src/main.js',
    bad: `const { BrowserWindow } = require('electron');

const win = new BrowserWindow({
  webPreferences: {
    enableRemoteModule: true, // Noncompliant
  },
});

module.exports = win;
`,
    good: `const { BrowserWindow } = require('electron');

const win = new BrowserWindow({
  webPreferences: {
    enableRemoteModule: false,
  },
});

module.exports = win;
`,
  },

  'electron-open-external': {
    path: 'src/main.js',
    bad: `const { shell } = require('electron');

function openLink(url) {
  shell.openExternal(url); // Noncompliant
}

module.exports = { openLink };
`,
    good: `const { shell } = require('electron');

function openLink(url) {
  const parsed = new URL(url);
  if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
    shell.openExternal(parsed.href);
  }
}

function openDocs() {
  shell.openExternal('https://docs.example.com');
}

module.exports = { openLink, openDocs };
`,
  },

  'weak-password-hash': {
    bad: `const crypto = require('crypto');
const bcrypt = require('bcrypt');

async function store(password, salt) {
  const a = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512'); // Noncompliant
  const b = await bcrypt.hash(password, 5); // Noncompliant
  const s = bcrypt.genSaltSync(4); // Noncompliant
  return [a, b, s];
}

module.exports = { store };
`,
    good: `const crypto = require('crypto');
const bcrypt = require('bcrypt');

async function store(password, salt) {
  const a = crypto.pbkdf2Sync(password, salt, 600000, 64, 'sha512');
  const b = await bcrypt.hash(password, 12);
  const s = bcrypt.genSaltSync(12);
  return [a, b, s];
}

module.exports = { store };
`,
  },
};
