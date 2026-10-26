// core/integrations: SMTP, notifications, issue trackers, ALM decoration,
// LDAP and the shared HTTP client. Every test talks to local fake servers on
// 127.0.0.1; nothing reaches the internet. TLS uses a fixed self-signed test
// certificate for localhost / 127.0.0.1 (valid until 2126, test use only).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import net from 'node:net';
import tls from 'node:tls';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const smtp = require('../core/integrations/smtp.js');
const notify = require('../core/integrations/notify.js');
const tracker = require('../core/integrations/tracker.js');
const alm = require('../core/integrations/alm.js');
const ldap = require('../core/integrations/ldap.js');
const httpc = require('../core/integrations/http.js');
const integrations = require('../core/integrations/index.js');
const pullrequest = require('../core/platform/pullrequest.js');

const TEST_KEY = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQg9aXHpN9FQSYvjk/K
asSvGb+vSOb7JLlcNq7kwSPgko2hRANCAARbrzhfZMruchm5lL7qnEzZiXuTd/Ow
f9Kr9MoSyDZTXp8WNzEtGNR/JVNbxHRjb1Zq2uUmat4zckUK/nx+qiiv
-----END PRIVATE KEY-----
`;
const TEST_CERT = `-----BEGIN CERTIFICATE-----
MIIBmzCCAUGgAwIBAgIUQN6jbiJAyJ7nX5bve4r3Hf+JsO4wCgYIKoZIzj0EAwIw
FDESMBAGA1UEAwwJbG9jYWxob3N0MCAXDTI2MTAyNjAwMTg0NVoYDzIxMjYxMDAy
MDAxODQ1WjAUMRIwEAYDVQQDDAlsb2NhbGhvc3QwWTATBgcqhkjOPQIBBggqhkjO
PQMBBwNCAARbrzhfZMruchm5lL7qnEzZiXuTd/Owf9Kr9MoSyDZTXp8WNzEtGNR/
JVNbxHRjb1Zq2uUmat4zckUK/nx+qiivo28wbTAdBgNVHQ4EFgQUFur0f5HcXlD/
N1nbCmZMhnZj6o0wHwYDVR0jBBgwFoAUFur0f5HcXlD/N1nbCmZMhnZj6o0wDwYD
VR0TAQH/BAUwAwEB/zAaBgNVHREEEzARgglsb2NhbGhvc3SHBH8AAAEwCgYIKoZI
zj0EAwIDSAAwRQIgA5Vy5q5JLSaonvrWa640jS+TK884g8C5pzOmPB3n07ICIQCD
xCFHhV8FwnIrCuKm+fEEbcYhOFC5qqmLiBFRT5Gg5A==
-----END CERTIFICATE-----
`;
const secureContext = tls.createSecureContext({ key: TEST_KEY, cert: TEST_CERT });

// ---------------------------------------------------------------------------
// Server bookkeeping: every server and socket is closed at the end.

const servers = [];
const sockets = new Set();

function track(server) {
  servers.push(server);
  server.on('connection', (s) => { sockets.add(s); s.on('close', () => sockets.delete(s)); });
  server.on('secureConnection', (s) => { sockets.add(s); s.on('close', () => sockets.delete(s)); });
  return server;
}

function listen(server) {
  track(server);
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
}

test.after(async () => {
  for (const s of sockets) s.destroy();
  await Promise.all(servers.map((s) => new Promise((resolve) => {
    if (typeof s.closeAllConnections === 'function') s.closeAllConnections();
    s.close(() => resolve());
  })));
});

// ---------------------------------------------------------------------------
// Fake SMTP server

const SMTP_USER = 'mailer@ex.com';
const SMTP_PASS = 'p@ss-워드';

function fakeSmtp({ offerStartTls = false, implicitTls = false, authMethods = ['PLAIN', 'LOGIN'], silent = false } = {}) {
  const state = { sessions: [] };
  const handle = (socket) => {
    const s = { commands: [], messages: [], auth: null, authMethod: null, tls: implicitTls, wire: [], ehlo: 0 };
    state.sessions.push(s);
    socket.on('error', () => {});
    if (silent) return;
    let cur = socket;
    let buf = '';
    let mode = 'cmd';
    let data = [];
    let env = { from: null, rcpts: [] };
    let login = null;
    const send = (l) => cur.write(`${l}\r\n`);
    const onData = (chunk) => {
      buf += chunk.toString('utf8');
      let i;
      while ((i = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        onLine(line);
      }
    };
    const checkAuth = (user, pass, method) => {
      if (user === SMTP_USER && pass === SMTP_PASS) { s.auth = user; s.authMethod = method; send('235 2.7.0 Authentication successful'); } else send('535 5.7.8 Authentication credentials invalid');
    };
    function onLine(line) {
      if (mode === 'data') {
        s.wire.push(line);
        if (line === '.') {
          mode = 'cmd';
          s.messages.push({ ...env, data: data.join('\r\n') });
          data = [];
          env = { from: null, rcpts: [] };
          send('250 2.0.0 Ok: queued');
        } else data.push(line.startsWith('.') ? line.slice(1) : line);
        return;
      }
      if (login) {
        const v = Buffer.from(line, 'base64').toString('utf8');
        if (login.step === 'user') { login = { step: 'pass', user: v }; send(`334 ${Buffer.from('Password:').toString('base64')}`); return; }
        const user = login.user;
        login = null;
        checkAuth(user, v, 'LOGIN');
        return;
      }
      s.commands.push(line);
      const verb = line.split(' ')[0].toUpperCase();
      if (verb === 'EHLO') {
        s.ehlo++;
        const ext = ['250-fake.smtp.local hello', '250-PIPELINING', '250-8BITMIME'];
        if (offerStartTls && !s.tls) ext.push('250-STARTTLS');
        if (authMethods.length) ext.push(`250-AUTH ${authMethods.join(' ')}`);
        ext.push('250 SMTPUTF8');
        for (const l of ext) send(l);
      } else if (verb === 'STARTTLS') {
        send('220 2.0.0 Ready to start TLS');
        cur.removeListener('data', onData);
        const t = new tls.TLSSocket(cur, { isServer: true, secureContext });
        t.on('error', () => {});
        sockets.add(t);
        t.on('close', () => sockets.delete(t));
        t.on('data', onData);
        cur = t;
        s.tls = true;
      } else if (verb === 'AUTH') {
        const [, method, initial] = line.split(' ');
        if (method === 'PLAIN') {
          const [, user, pass] = Buffer.from(initial || '', 'base64').toString('utf8').split('\0');
          checkAuth(user, pass, 'PLAIN');
        } else if (method === 'LOGIN') {
          login = { step: 'user' };
          send(`334 ${Buffer.from('Username:').toString('base64')}`);
        } else send('504 5.5.4 Unrecognized authentication type');
      } else if (verb === 'MAIL') {
        env.from = /<([^>]*)>/.exec(line)[1];
        send('250 2.1.0 Ok');
      } else if (verb === 'RCPT') {
        const to = /<([^>]*)>/.exec(line)[1];
        if (to.endsWith('@bad.example')) send('550 5.1.1 No such user');
        else { env.rcpts.push(to); send('250 2.1.5 Ok'); }
      } else if (verb === 'DATA') {
        mode = 'data';
        send('354 End data with <CR><LF>.<CR><LF>');
      } else if (verb === 'QUIT') {
        send('221 2.0.0 Bye');
        cur.end();
      } else send('502 5.5.2 Command not recognized');
    }
    cur.on('data', onData);
    send('220 fake.smtp.local ESMTP ready');
  };
  const server = implicitTls ? tls.createServer({ key: TEST_KEY, cert: TEST_CERT }, handle) : net.createServer(handle);
  return { server, state };
}

async function startSmtp(opts) {
  const f = fakeSmtp(opts);
  f.port = await listen(f.server);
  return f;
}

/** Tiny MIME reader for assertions: headers (unfolded) + parts. */
function parseMime(raw) {
  const idx = raw.indexOf('\r\n\r\n');
  const headText = raw.slice(0, idx).replace(/\r\n[ \t]+/g, ' ');
  const body = raw.slice(idx + 4);
  const headers = {};
  for (const l of headText.split('\r\n')) {
    const c = l.indexOf(':');
    headers[l.slice(0, c).toLowerCase()] = l.slice(c + 1).trim();
  }
  const out = { headers, body, parts: [] };
  const m = /boundary="([^"]+)"/.exec(headers['content-type'] || '');
  if (m) {
    const segs = body.split(`--${m[1]}`).slice(1);
    for (const seg of segs) {
      if (seg.startsWith('--')) break;
      out.parts.push(parseMime(seg.replace(/^\r\n/, '').replace(/\r\n$/, '')));
    }
  }
  return out;
}

function decodedBody(part) {
  return Buffer.from(part.body.replace(/\s+/g, ''), 'base64').toString('utf8');
}

// ---------------------------------------------------------------------------
// SMTP

test('buildMessage writes UTF-8 B-encoded subject, multipart/alternative and base64 bodies', () => {
  const { data, messageId } = smtp.buildMessage({
    from: { name: '코드 검사기', address: 'noreply@ex.com' },
    to: ['kim@ex.com', 'Lee Jun <lee@ex.com>'],
    subject: '품질 게이트 실패: 프로젝트 알파',
    text: '새 버그가 3개 있습니다.\n두 번째 줄',
    html: '<p>새 버그가 <b>3개</b> 있습니다.</p>',
  });
  assert.match(messageId, /^<[^@]+@ex\.com>$/);
  const mime = parseMime(data);
  assert.match(mime.headers.subject, /^=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=/);
  assert.equal(smtp.decodeWords(mime.headers.subject), '품질 게이트 실패: 프로젝트 알파');
  assert.equal(smtp.decodeWords(mime.headers.from), '코드 검사기 <noreply@ex.com>');
  assert.equal(mime.headers.to, 'kim@ex.com, "Lee Jun" <lee@ex.com>');
  assert.equal(mime.headers['mime-version'], '1.0');
  assert.match(mime.headers['content-type'], /^multipart\/alternative; boundary="/);
  assert.equal(mime.parts.length, 2);
  assert.equal(mime.parts[0].headers['content-type'], 'text/plain; charset=UTF-8');
  assert.equal(mime.parts[0].headers['content-transfer-encoding'], 'base64');
  assert.equal(decodedBody(mime.parts[0]), '새 버그가 3개 있습니다.\r\n두 번째 줄');
  assert.equal(mime.parts[1].headers['content-type'], 'text/html; charset=UTF-8');
  assert.equal(decodedBody(mime.parts[1]), '<p>새 버그가 <b>3개</b> 있습니다.</p>');
  for (const line of data.split('\r\n')) assert.ok(line.length <= 998, 'no line longer than 998');
  assert.ok(!/[^\x00-\x7f]/.test(data), 'the message is 7-bit clean');
});

test('long Korean subjects split into encoded words of at most 75 characters without breaking a character', () => {
  const subject = '[MyCodeChecker] 아주 긴 제목입니다 '.repeat(6);
  const enc = smtp.encodeWord(subject);
  const words = enc.split('\r\n ');
  assert.ok(words.length > 2);
  for (const w of words) {
    assert.ok(w.length <= 75, `word too long: ${w.length}`);
    const b64 = /^=\?UTF-8\?B\?(.*)\?=$/.exec(w)[1];
    assert.ok(!Buffer.from(b64, 'base64').toString('utf8').includes('�'), 'each word decodes on its own');
  }
  assert.equal(smtp.decodeWords(enc), subject);
  assert.equal(smtp.encodeWord('Plain ASCII'), 'Plain ASCII');
});

test('attachments go into multipart/mixed with RFC 2231 file names', () => {
  const { data } = smtp.buildMessage({
    from: 'a@ex.com', to: 'b@ex.com', subject: 'Report', text: 'see attached', html: '<p>see attached</p>',
    attachments: [{ filename: '보고서.csv', content: 'a,b\n1,2\n', contentType: 'text/csv' }, { filename: 'raw.bin', content: Buffer.from([0, 1, 2, 255]) }],
  });
  const mime = parseMime(data);
  assert.match(mime.headers['content-type'], /^multipart\/mixed/);
  assert.equal(mime.parts.length, 3);
  assert.match(mime.parts[0].headers['content-type'], /^multipart\/alternative/);
  assert.equal(mime.parts[0].parts.length, 2);
  const csv = mime.parts[1];
  assert.match(csv.headers['content-disposition'], /^attachment; filename="=\?UTF-8\?B\?/);
  assert.match(csv.headers['content-disposition'], /filename\*=UTF-8''%EB%B3%B4%EA%B3%A0%EC%84%9C\.csv/);
  assert.equal(decodedBody(csv), 'a,b\n1,2\n');
  assert.deepEqual([...Buffer.from(mime.parts[2].body.replace(/\s+/g, ''), 'base64')], [0, 1, 2, 255]);
  assert.match(mime.parts[2].headers['content-type'], /^application\/octet-stream; name="raw\.bin"/);
});

test('dotStuff doubles leading dots and normalizes line ends', () => {
  assert.equal(smtp.dotStuff('.a\nb\r\n..c\n.'), '..a\r\nb\r\n...c\r\n..');
  assert.equal(smtp.dotStuff('no dots'), 'no dots');
});

test('header injection through subject or custom headers is neutralized', () => {
  const { data } = smtp.buildMessage({ from: 'a@ex.com', to: 'b@ex.com', subject: 'Hi\r\nBcc: evil@ex.com', text: 'x', headers: { 'X-Test': 'v\r\nBcc: evil@ex.com', 'Bad Header': 'x' } });
  const head = data.slice(0, data.indexOf('\r\n\r\n'));
  assert.ok(!/^Bcc:/m.test(head));
  assert.ok(!/Bad Header/.test(head));
  assert.match(head, /^X-Test: v Bcc: evil@ex\.com$/m);
});

test('sendMail over plain SMTP with AUTH LOGIN delivers the message and reports rejected recipients', async () => {
  const f = await startSmtp({ authMethods: ['LOGIN'] });
  const res = await smtp.sendMail(
    { host: '127.0.0.1', port: f.port, secure: 'none', user: SMTP_USER, pass: SMTP_PASS, from: 'MyCodeChecker <noreply@ex.com>', name: 'tester.local', timeoutMs: 3000 },
    { to: ['kim@ex.com', 'ghost@bad.example'], cc: 'lee@ex.com', bcc: 'audit@ex.com', subject: '새 이슈 알림', text: '본문', html: '<p>본문</p>' },
  );
  assert.deepEqual(res.accepted, ['kim@ex.com', 'lee@ex.com', 'audit@ex.com']);
  assert.deepEqual(res.rejected, ['ghost@bad.example']);
  assert.equal(res.auth, 'LOGIN');
  assert.equal(res.tls, false);
  const s = f.state.sessions[0];
  assert.equal(s.auth, SMTP_USER);
  assert.equal(s.authMethod, 'LOGIN');
  assert.equal(s.commands[0], 'EHLO tester.local');
  assert.ok(s.commands.includes('MAIL FROM:<noreply@ex.com>'));
  assert.equal(s.commands[s.commands.length - 1], 'QUIT');
  assert.equal(s.messages.length, 1);
  const msg = s.messages[0];
  assert.deepEqual(msg.rcpts, ['kim@ex.com', 'lee@ex.com', 'audit@ex.com']);
  const mime = parseMime(msg.data);
  assert.equal(smtp.decodeWords(mime.headers.subject), '새 이슈 알림');
  assert.equal(mime.headers.cc, 'lee@ex.com');
  assert.equal(mime.headers.bcc, undefined, 'Bcc never appears in the headers');
  assert.equal(decodedBody(mime.parts[0]), '본문');
});

test('sendMail uses AUTH PLAIN when offered and fails clearly on a wrong password', async () => {
  const f = await startSmtp({ authMethods: ['PLAIN', 'LOGIN'] });
  const base = { host: '127.0.0.1', port: f.port, secure: 'none', user: SMTP_USER, from: 'noreply@ex.com', timeoutMs: 3000 };
  const ok = await smtp.sendMail({ ...base, pass: SMTP_PASS }, { to: 'kim@ex.com', subject: 's', text: 't' });
  assert.equal(ok.auth, 'PLAIN');
  assert.equal(f.state.sessions[0].authMethod, 'PLAIN');
  await assert.rejects(smtp.sendMail({ ...base, pass: 'wrong' }, { to: 'kim@ex.com', subject: 's', text: 't' }), (err) => {
    assert.equal(err.name, 'SmtpError');
    assert.equal(err.code, 'EAUTH');
    assert.equal(err.smtpCode, 535);
    assert.match(err.text.ko, /로그인을 거부했습니다/);
    return true;
  });
  assert.equal(f.state.sessions[1].messages.length, 0);
  await assert.rejects(smtp.sendMail({ ...base, pass: '' }, { to: 'kim@ex.com', subject: 's', text: 't' }), { code: 'EAUTH' });
});

test('raw messages are dot-stuffed on the wire and arrive unchanged', async () => {
  const f = await startSmtp({ authMethods: [] });
  const raw = 'From: a@ex.com\r\nTo: b@ex.com\r\nSubject: dots\r\n\r\n.hidden line\r\n..two dots\r\nnormal\r\n.';
  await smtp.sendMail({ host: '127.0.0.1', port: f.port, secure: 'none', from: 'a@ex.com', timeoutMs: 3000 }, { to: 'b@ex.com', raw });
  const s = f.state.sessions[0];
  assert.ok(s.wire.includes('..hidden line'));
  assert.ok(s.wire.includes('...two dots'));
  assert.ok(s.wire.includes('..'));
  assert.equal(s.wire[s.wire.length - 1], '.');
  assert.equal(s.messages[0].data, raw);
});

test('STARTTLS upgrades the connection, greets again and logs in over TLS', async () => {
  const f = await startSmtp({ offerStartTls: true });
  const res = await smtp.sendMail(
    { host: '127.0.0.1', port: f.port, secure: 'starttls', user: SMTP_USER, pass: SMTP_PASS, from: 'noreply@ex.com', ca: TEST_CERT, requireTLS: true, timeoutMs: 5000 },
    { to: 'kim@ex.com', subject: 'TLS 메일', text: '암호화됨' },
  );
  assert.equal(res.tls, true);
  const s = f.state.sessions[0];
  assert.equal(s.tls, true);
  assert.equal(s.ehlo, 2);
  assert.deepEqual(s.commands.slice(0, 3).map((c) => c.split(' ')[0]), ['EHLO', 'STARTTLS', 'EHLO']);
  assert.equal(s.auth, SMTP_USER);
  assert.equal(smtp.decodeWords(parseMime(s.messages[0].data).headers.subject), 'TLS 메일');
});

test('STARTTLS rejects an untrusted certificate unless verification is turned off', async () => {
  const f = await startSmtp({ offerStartTls: true });
  const base = { host: '127.0.0.1', port: f.port, secure: 'starttls', from: 'noreply@ex.com', timeoutMs: 5000 };
  await assert.rejects(smtp.sendMail(base, { to: 'kim@ex.com', subject: 's', text: 't' }), { code: 'ETLS' });
  const ok = await smtp.sendMail({ ...base, rejectUnauthorized: false }, { to: 'kim@ex.com', subject: 's', text: 't' });
  assert.equal(ok.tls, true);
});

test('implicit TLS on a dedicated port and verify() for the connection test', async () => {
  const f = await startSmtp({ implicitTls: true });
  const cfg = { host: '127.0.0.1', port: f.port, secure: 'tls', user: SMTP_USER, pass: SMTP_PASS, from: 'noreply@ex.com', ca: TEST_CERT, timeoutMs: 5000 };
  const v = await smtp.verify(cfg);
  assert.equal(v.ok, true);
  assert.equal(v.tls, true);
  assert.ok(v.extensions.includes('AUTH'));
  const res = await smtp.sendMail(cfg, { to: 'kim@ex.com', subject: 'x', text: 'y' });
  assert.equal(res.tls, true);
  assert.equal(f.state.sessions[1].messages.length, 1);
});

test('SMTP errors: STARTTLS not offered, envelope problems, timeout and refused connection', async () => {
  const f = await startSmtp({ offerStartTls: false });
  await assert.rejects(smtp.sendMail({ host: '127.0.0.1', port: f.port, secure: 'starttls', from: 'a@ex.com', timeoutMs: 3000 }, { to: 'b@ex.com', subject: 's', text: 't' }), (err) => err.code === 'ETLS' && /STARTTLS/.test(err.text.en));
  await assert.rejects(smtp.sendMail({ host: '127.0.0.1', port: f.port, from: 'a@ex.com' }, { to: [], subject: 's' }), { code: 'EENVELOPE' });
  await assert.rejects(smtp.sendMail({ host: '127.0.0.1', port: f.port, from: 'not-an-address' }, { to: 'b@ex.com' }), { code: 'EENVELOPE' });
  await assert.rejects(smtp.sendMail({ host: '127.0.0.1', port: f.port, from: 'a@ex.com', timeoutMs: 3000 }, { to: 'x@bad.example', subject: 's', text: 't' }), { code: 'EENVELOPE' });
  const silent = await startSmtp({ silent: true });
  await assert.rejects(smtp.sendMail({ host: '127.0.0.1', port: silent.port, from: 'a@ex.com', timeoutMs: 200 }, { to: 'b@ex.com', subject: 's', text: 't' }), { code: 'TIMEOUT' });
  const probe = net.createServer();
  const freePort = await listen(probe);
  await new Promise((r) => probe.close(r));
  await assert.rejects(smtp.sendMail({ host: '127.0.0.1', port: freePort, from: 'a@ex.com', timeoutMs: 3000 }, { to: 'b@ex.com', subject: 's', text: 't' }), (err) => err.name === 'SmtpError' && err.code === 'ECONNREFUSED');
});

// ---------------------------------------------------------------------------
// Notifications

const USERS = [
  { login: 'kim', name: '김민수', email: 'kim@ex.com', lang: 'ko', active: true },
  { login: 'lee', name: 'Lee Jun', email: 'lee@ex.com', active: true },
  { login: 'park', name: 'Park', email: 'park@ex.com', active: false },
  { login: 'choi', name: 'Choi', email: 'choi@ex.com', active: true },
  { login: 'jung', name: 'Jung', email: 'jung@ex.com', active: true },
];
const SUBS = [
  { login: 'kim', events: ['gate-changed', 'issues-assigned', 'exception-approved'], projects: [] },
  { login: 'lee', events: ['gate-changed', 'issues-assigned', 'exception-pending'], projects: ['other'] },
  { login: 'park', events: ['gate-changed'] },
  { login: 'choi', events: ['scan-failed', 'defect-high-impact', 'gate-changed', 'unknown-event'], projects: ['proj'], email: 'choi.alerts@ex.com' },
  { login: 'jung', events: ['exception-pending'] },
];
const PROJECT = { key: 'proj', name: '<Proj & Co>' };

test('recipients follow subscriptions, projects, active users and personal targeting', () => {
  const gate = notify.recipients('gate-changed', { project: PROJECT }, { subscriptions: SUBS, users: USERS });
  assert.deepEqual(gate.map((r) => r.login).sort(), ['choi', 'kim']);
  assert.equal(gate.find((r) => r.login === 'choi').email, 'choi.alerts@ex.com', 'subscription e-mail overrides the account e-mail');
  assert.equal(gate.find((r) => r.login === 'kim').lang, 'ko');
  const assigned = notify.recipients('issues-assigned', { project: PROJECT, issues: [{ assignee: 'kim' }, { assignee: 'lee' }, { assignee: 'choi' }] }, { subscriptions: SUBS, users: USERS });
  assert.deepEqual(assigned.map((r) => r.login), ['kim'], 'lee is subscribed only for another project, choi is not subscribed');
  const pending = notify.recipients('exception-pending', { project: PROJECT, request: { approvers: ['jung', 'kim'] } }, { subscriptions: SUBS, users: USERS });
  assert.deepEqual(pending.map((r) => r.login), ['jung']);
  assert.deepEqual(notify.recipients('nope', {}, { subscriptions: SUBS, users: USERS }), []);
  assert.deepEqual(notify.normalizeSubscription(SUBS[3]).events, ['scan-failed', 'defect-high-impact', 'gate-changed']);
  assert.equal(notify.EVENTS.length, 7);
  for (const e of notify.EVENTS) assert.ok(e.name.en && e.name.ko);
});

test('render produces Korean and English subject, text and escaped html for every event', () => {
  const ctxs = {
    'gate-changed': { project: PROJECT, branch: 'main', previousGate: 'OK', gate: 'ERROR', failedConditions: [{ metric: 'new_bugs', actual: 2, op: 'GT', threshold: 0 }], url: 'http://mcc.local/p?id=proj&b=main' },
    'issues-assigned': { project: PROJECT, issues: [{ assignee: 'kim', rule: 'js:S1', message: { en: 'Remove <script>', ko: '<script>를 제거합니다' }, file: 'a.js', line: 3, severity: 'MAJOR', type: 'BUG' }] },
    'defect-high-impact': { project: PROJECT, stream: 'proj-main', snapshot: 1012, defects: [{ cid: 501, checker: 'RESOURCE_LEAK', file: 'b.c', line: 9, message: { en: 'Leak of fd', ko: 'fd 누수' } }] },
    'exception-pending': { project: PROJECT, request: { id: 'EX-1', rule: 'c:MISRA-15.5', requester: 'lee', reason: { en: 'legacy', ko: '레거시 코드' } } },
    'exception-approved': { project: PROJECT, request: { id: 'EX-1', rule: 'c:MISRA-15.5', decidedBy: 'kim' } },
    'exception-rejected': { project: PROJECT, request: { id: 'EX-1', rule: 'c:MISRA-15.5', decidedBy: 'kim', comment: 'fix it' } },
    'scan-failed': { project: PROJECT, branch: 'dev', error: { en: 'Out of memory', ko: '메모리가 부족합니다' } },
  };
  const koExpect = { 'gate-changed': '품질 게이트', 'issues-assigned': '할당', 'defect-high-impact': '높은 영향도', 'exception-pending': '승인을 기다립니다', 'exception-approved': '승인되었습니다', 'exception-rejected': '반려되었습니다', 'scan-failed': '분석에 실패했습니다' };
  for (const id of notify.EVENT_IDS) {
    const en = notify.render(id, ctxs[id], 'en', { login: 'kim' });
    const ko = notify.render(id, ctxs[id], 'ko', { login: 'kim' });
    assert.ok(en.subject.startsWith('[MyCodeChecker] '), id);
    assert.ok(ko.subject.includes(koExpect[id]), `${id}: ${ko.subject}`);
    assert.ok(!/[가-힣]/.test(en.subject.replace(PROJECT.name, '')), `${id} English subject has no Korean`);
    assert.ok(en.html.includes('&lt;Proj &amp; Co&gt;'), `${id} escapes the project name`);
    assert.ok(!en.html.includes('<Proj'), id);
    assert.ok(ko.text.includes('프로젝트: <Proj & Co>'), id);
  }
  const gate = notify.render('gate-changed', ctxs['gate-changed'], 'en');
  assert.match(gate.subject, /quality gate is now Failed/);
  assert.match(gate.text, /from Passed to Failed/);
  assert.match(gate.text, /new_bugs: 2 \(GT 0\)/);
  assert.ok(gate.html.includes('href="http://mcc.local/p?id=proj&amp;b=main"'));
  const issues = notify.render('issues-assigned', ctxs['issues-assigned'], 'ko', { login: 'kim' });
  assert.ok(issues.html.includes('&lt;script&gt;를 제거합니다'));
  assert.throws(() => notify.render('bogus', {}, 'en'), /Unknown notification event/);
});

test('dispatch sends each assignee only their issues and each component owner only their defects', async () => {
  const sent = [];
  const send = async (m) => { sent.push(m); return { ok: true }; };
  const subs = [...SUBS, { login: 'lee', events: ['issues-assigned'], projects: ['proj'] }];
  const ctx = {
    project: PROJECT,
    issues: [
      { assignee: 'kim', rule: 'r1', message: { en: 'one', ko: '하나' }, file: 'a.js', line: 1, severity: 'MAJOR', type: 'BUG' },
      { assignee: 'kim', rule: 'r2', message: { en: 'two', ko: '둘' }, file: 'a.js', line: 2, severity: 'MINOR', type: 'CODE_SMELL' },
      { assignee: 'lee', rule: 'r3', message: { en: 'three', ko: '셋' }, file: 'b.js', line: 3, severity: 'MAJOR', type: 'BUG' },
    ],
  };
  const r1 = await notify.dispatch('issues-assigned', ctx, { subscriptions: subs, users: USERS, send, from: 'noreply@ex.com' });
  assert.equal(r1.sent.length, 2);
  const kimMail = sent.find((m) => m.to.address === 'kim@ex.com');
  const leeMail = sent.find((m) => m.to.address === 'lee@ex.com');
  assert.match(kimMail.subject, /새 이슈 2개/);
  assert.ok(kimMail.text.includes('하나') && kimMail.text.includes('둘') && !kimMail.text.includes('셋'));
  assert.match(leeMail.subject, /1 new issue assigned/);
  assert.ok(leeMail.text.includes('three') && !leeMail.text.includes('one'));
  assert.equal(kimMail.headers['X-MyCodeChecker-Event'], 'issues-assigned');
  assert.equal(kimMail.from, 'noreply@ex.com');

  sent.length = 0;
  const cov = {
    project: PROJECT, stream: 'proj-main', snapshot: 77,
    defects: [
      { cid: 1, checker: 'NULL_RETURNS', impact: 'High', file: 'net/a.c', line: 5, component: 'net', message: { en: 'null', ko: '널' } },
      { cid: 2, checker: 'OVERRUN', impact: 'High', file: 'ui/b.c', line: 6, component: 'ui', message: { en: 'overrun', ko: '오버런' } },
    ],
    componentOwners: { net: 'lee' },
  };
  const r2 = await notify.dispatch('defect-high-impact', cov, { subscriptions: SUBS, users: USERS, send });
  assert.deepEqual(r2.sent.map((s) => s.login).sort(), ['choi', 'lee']);
  const choiMail = sent.find((m) => m.to.address === 'choi.alerts@ex.com');
  const ownerMail = sent.find((m) => m.to.address === 'lee@ex.com');
  assert.ok(choiMail.text.includes('CID 1') && choiMail.text.includes('CID 2'));
  assert.ok(ownerMail.text.includes('CID 1') && !ownerMail.text.includes('CID 2'));
  assert.match(ownerMail.subject, /stream proj-main: 1 new high-impact defect$/);
});

test('dispatch reports a failed recipient without throwing', async () => {
  const send = async (m) => { if (m.to.address === 'kim@ex.com') throw new Error('mailbox full'); return {}; };
  const r = await notify.dispatch('gate-changed', { project: PROJECT, previousGate: 'ERROR', gate: 'OK' }, { subscriptions: SUBS, users: USERS, send });
  assert.deepEqual(r.sent.map((s) => s.login), ['choi']);
  assert.deepEqual(r.failed, [{ login: 'kim', email: 'kim@ex.com', error: 'mailbox full' }]);
  await assert.rejects(notify.dispatch('bogus', {}, {}), /Unknown notification event/);
});

test('dispatch sends real mail through SMTP with a Korean subject', async () => {
  const f = await startSmtp({ authMethods: ['PLAIN'] });
  const smtpConfig = { host: '127.0.0.1', port: f.port, secure: 'none', user: SMTP_USER, pass: SMTP_PASS, from: 'MyCodeChecker <noreply@ex.com>', timeoutMs: 3000 };
  const r = await notify.dispatch('gate-changed', { project: { key: 'proj', name: '알파' }, previousGate: 'OK', gate: 'ERROR' }, { subscriptions: [SUBS[0]], users: USERS, smtpConfig });
  assert.equal(r.sent.length, 1);
  const msg = f.state.sessions[0].messages[0];
  assert.deepEqual(msg.rcpts, ['kim@ex.com']);
  assert.equal(msg.from, 'noreply@ex.com');
  const mime = parseMime(msg.data);
  assert.match(mime.headers.subject, /=\?UTF-8\?B\?/);
  assert.equal(smtp.decodeWords(mime.headers.subject), '[MyCodeChecker] 알파: 품질 게이트가 실패(으)로 바뀌었습니다');
  assert.equal(smtp.decodeWords(mime.headers.to), '김민수 <kim@ex.com>');
  assert.equal(mime.headers['x-mycodechecker-event'], 'gate-changed');
  assert.match(decodedBody(mime.parts[0]), /통과에서 실패\(으\)로 바뀌었습니다/);
  assert.match(decodedBody(mime.parts[1]), /^<!doctype html>/);
});

// ---------------------------------------------------------------------------
// Fake HTTP server

async function fakeHttp(handler) {
  const reqs = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      let json = null;
      try { json = body ? JSON.parse(body) : null; } catch { json = body; }
      const rec = { method: req.method, url: req.url, headers: req.headers, body: json };
      reqs.push(rec);
      const out = handler(rec, reqs, res);
      if (out === 'hold') return;
      const o = out || { status: 200, json: {} };
      res.writeHead(o.status || 200, { 'content-type': 'application/json', ...(o.headers || {}) });
      res.end(o.json === undefined ? '' : JSON.stringify(o.json));
    });
  });
  const port = await listen(server);
  return { reqs, base: `http://127.0.0.1:${port}` };
}

// ---------------------------------------------------------------------------
// HTTP client

test('http client retries 503 and 429 with backoff and honours Retry-After', async () => {
  let n = 0;
  const f = await fakeHttp(() => {
    n++;
    if (n === 1) return { status: 503, json: { error: 'busy' } };
    if (n === 2) return { status: 429, headers: { 'retry-after': '0' }, json: {} };
    return { status: 200, json: { ok: true } };
  });
  const res = await httpc.request({ method: 'POST', url: `${f.base}/x`, body: { a: 1 }, backoffMs: 5 });
  assert.equal(res.status, 200);
  assert.equal(res.attempts, 3);
  assert.deepEqual(res.json, { ok: true });
  assert.equal(f.reqs.length, 3);
  assert.deepEqual(f.reqs[2].body, { a: 1 });
  assert.equal(f.reqs[0].headers['content-type'], 'application/json');
});

test('http client gives up after the retry budget and does not retry 4xx', async () => {
  const f = await fakeHttp((r) => (r.url === '/bad' ? { status: 400, json: { msg: 'bad field' } } : { status: 502, json: {} }));
  await assert.rejects(httpc.request({ url: `${f.base}/bad`, backoffMs: 1 }), (err) => {
    assert.equal(err.name, 'HttpError');
    assert.equal(err.status, 400);
    assert.match(err.body, /bad field/);
    return true;
  });
  assert.equal(f.reqs.length, 1);
  await assert.rejects(httpc.request({ url: `${f.base}/down`, retries: 2, backoffMs: 1 }), { status: 502 });
  assert.equal(f.reqs.length, 4);
  await assert.rejects(httpc.request({ url: `${f.base}/bad`, headers: { authorization: 'x' } }), (err) => err.text.ko.includes('HTTP 400'));
});

test('http client times out a silent server and accepts an injected transport', async () => {
  const f = await fakeHttp(() => 'hold');
  await assert.rejects(httpc.request({ url: `${f.base}/slow`, timeoutMs: 150, retries: 0 }), { code: 'TIMEOUT' });
  const seen = [];
  const transport = async (req) => { seen.push(req); return { status: 201, headers: {}, body: '{"id":5}' }; };
  const res = await httpc.request({ method: 'POST', url: 'https://example.invalid/api', body: { x: 1 }, transport });
  assert.equal(res.json.id, 5);
  assert.equal(seen[0].method, 'POST');
  assert.equal(seen[0].body, '{"x":1}');
  assert.equal(httpc.basicAuth('a@b.c', 'tok'), `Basic ${Buffer.from('a@b.c:tok').toString('base64')}`);
});

// ---------------------------------------------------------------------------
// Issue trackers

const ISSUE = {
  key: 'AX-1', rule: 'c:NULL_RETURNS', message: { en: 'Dereferencing null pointer "p"', ko: '널 포인터 "p"를 역참조합니다' },
  file: 'src/main.c', line: 42, severity: 'CRITICAL', type: 'BUG', cid: 10023, checker: 'NULL_RETURNS',
  events: [
    { line: 40, tag: 'returned_null', text: { en: 'malloc may return null', ko: 'malloc이 null을 반환할 수 있습니다' } },
    { line: 42, tag: 'dereference', text: { en: 'p is dereferenced', ko: 'p를 역참조합니다' }, main: true },
  ],
};

function adfText(node) {
  if (!node) return '';
  if (node.type === 'text') return node.text;
  return (node.content || []).map(adfText).join(' ');
}

test('Jira v3 payload uses ADF, maps severity to priority and cleans labels', () => {
  const cfg = { baseUrl: 'https://acme.atlassian.net/', projectKey: 'SEC', email: 'bot@acme.com', apiToken: 'tok', labels: ['team a', 'static'] };
  const p = tracker.ticketPayload('jira', cfg, ISSUE, { issueUrl: 'http://mcc.local/issues?id=AX-1' });
  assert.equal(p.fields.project.key, 'SEC');
  assert.equal(p.fields.issuetype.name, 'Bug');
  assert.equal(p.fields.priority.name, 'High');
  assert.equal(p.fields.summary, '[CRITICAL] Dereferencing null pointer "p" (src/main.c:42)');
  assert.deepEqual(p.fields.labels, ['mycodechecker', 'team-a', 'static', 'bug', 'severity-critical', 'defectAnalysis-NULL_RETURNS']);
  for (const l of p.fields.labels) assert.ok(!/\s/.test(l));
  const d = p.fields.description;
  assert.equal(d.type, 'doc');
  assert.equal(d.version, 1);
  assert.deepEqual(d.content.map((c) => c.type), ['paragraph', 'table', 'heading', 'orderedList', 'paragraph']);
  const all = adfText(d);
  assert.ok(all.includes('10023') && all.includes('NULL_RETURNS') && all.includes('malloc may return null'));
  assert.equal(d.content[4].content[0].marks[0].attrs.href, 'http://mcc.local/issues?id=AX-1');
  const req = tracker.ticketRequest('jira', cfg, ISSUE);
  assert.equal(req.url, 'https://acme.atlassian.net/rest/api/3/issue');
  assert.equal(req.headers.authorization, `Basic ${Buffer.from('bot@acme.com:tok').toString('base64')}`);
  const ko = tracker.ticketPayload('jira', cfg, ISSUE, { lang: 'ko' });
  assert.equal(ko.fields.summary, '[CRITICAL] 널 포인터 "p"를 역참조합니다 (src/main.c:42)');
  const custom = tracker.ticketPayload('jira', { ...cfg, priorityMap: { CRITICAL: 'P1' }, extraFields: { customfield_100: 'x' } }, ISSUE);
  assert.equal(custom.fields.priority.name, 'P1');
  assert.equal(custom.fields.customfield_100, 'x');
  assert.equal(tracker.ticketPayload('jira', { ...cfg, usePriority: false }, ISSUE).fields.priority, undefined);
  const long = tracker.summaryOf({ ...ISSUE, message: { en: 'x'.repeat(400) } });
  assert.equal(long.length, 255);
});

test('Jira v2 posts wiki markup with a Bearer PAT and returns the browse URL', async () => {
  const f = await fakeHttp(() => ({ status: 201, json: { id: '10001', key: 'SEC-7', self: 'x' } }));
  const cfg = { baseUrl: f.base, apiVersion: 2, projectKey: 'SEC', pat: 'pat-123', issueType: 'Task' };
  const t = await tracker.createTicket('jira', cfg, ISSUE, { issueUrl: 'http://mcc.local/i/1' });
  assert.deepEqual(t, { kind: 'jira', key: 'SEC-7', id: '10001', url: `${f.base}/browse/SEC-7` });
  const r = f.reqs[0];
  assert.equal(r.method, 'POST');
  assert.equal(r.url, '/rest/api/2/issue');
  assert.equal(r.headers.authorization, 'Bearer pat-123');
  assert.equal(r.body.fields.issuetype.name, 'Task');
  assert.equal(typeof r.body.fields.description, 'string');
  assert.match(r.body.fields.description, /\|\|Rule\|\{\{c:NULL_RETURNS\}\}\|/);
  assert.match(r.body.fields.description, /# \{\{src\/main\.c:40\}\} _returned\\_null_ malloc may return null/);
  assert.match(r.body.fields.description, /\[Open in MyCodeChecker\|http:\/\/mcc\.local\/i\/1\]/);
  await assert.rejects(tracker.createTicket('jira', { baseUrl: f.base, projectKey: 'SEC' }, ISSUE), { code: 'ECONFIG' });
});

test('Redmine ticket uses the API key header, project, tracker and priority ids', async () => {
  const f = await fakeHttp(() => ({ status: 201, json: { issue: { id: 42 } } }));
  const t = await tracker.createTicket('redmine', { baseUrl: `${f.base}/redmine/`, apiKey: 'rk', projectId: 'core', trackerId: '1' }, { ...ISSUE, severity: 'BLOCKER' });
  assert.deepEqual(t, { kind: 'redmine', key: '#42', id: 42, url: `${f.base}/redmine/issues/42` });
  const r = f.reqs[0];
  assert.equal(r.url, '/redmine/issues.json');
  assert.equal(r.headers['x-redmine-api-key'], 'rk');
  assert.equal(r.body.issue.project_id, 'core');
  assert.equal(r.body.issue.tracker_id, 1);
  assert.equal(r.body.issue.priority_id, 5);
  assert.match(r.body.issue.description, /\| CID \| `10023` \|/);
  const textile = tracker.ticketPayload('redmine', { projectId: 'core', textFormat: 'textile' }, ISSUE);
  assert.match(textile.issue.description, /\|_\. Rule \| @c:NULL_RETURNS@ \|/);
  assert.deepEqual(['INFO', 'MINOR', 'MAJOR', 'CRITICAL', 'BLOCKER'].map((s) => tracker.priorityFor('redmine', { severity: s })), [1, 2, 3, 4, 5]);
  assert.equal(tracker.priorityFor('jira', { impact: 'High' }), 'High');
});

test('GitHub and GitLab issues: paths, auth headers and labels', async () => {
  const f = await fakeHttp((r) => (r.url.startsWith('/repos/')
    ? { status: 201, json: { number: 12, html_url: 'https://github.com/o/r/issues/12' } }
    : { status: 201, json: { iid: 3, web_url: 'https://gitlab.local/g/p/-/issues/3' } }));
  const gh = await tracker.createTicket('github', { apiUrl: f.base, owner: 'acme', repo: 'web app', token: 'ghp', assignees: ['kim'] }, ISSUE);
  assert.deepEqual(gh, { kind: 'github', key: '#12', id: 12, url: 'https://github.com/o/r/issues/12' });
  assert.equal(f.reqs[0].url, '/repos/acme/web%20app/issues');
  assert.equal(f.reqs[0].headers.authorization, 'Bearer ghp');
  assert.equal(f.reqs[0].headers.accept, 'application/vnd.github+json');
  assert.deepEqual(f.reqs[0].body.assignees, ['kim']);
  assert.ok(f.reqs[0].body.labels.includes('severity-critical'));
  assert.match(f.reqs[0].body.body, /\*\*Events\*\*/);
  const gl = await tracker.createTicket('gitlab', { baseUrl: f.base, projectId: 'grp/proj', token: 'glp' }, ISSUE, { lang: 'ko' });
  assert.deepEqual(gl, { kind: 'gitlab', key: '#3', id: 3, url: 'https://gitlab.local/g/p/-/issues/3' });
  assert.equal(f.reqs[1].url, '/api/v4/projects/grp%2Fproj/issues');
  assert.equal(f.reqs[1].headers['private-token'], 'glp');
  assert.equal(f.reqs[1].body.labels, 'mycodechecker,bug,severity-critical,defectAnalysis-NULL_RETURNS');
  assert.match(f.reqs[1].body.description, /\*\*이벤트\*\*/);
  assert.throws(() => tracker.ticketPayload('trello', {}, ISSUE), (err) => err.code === 'ECONFIG');
});

// ---------------------------------------------------------------------------
// ALM decoration

function makePr(count, { severity = 'MAJOR', type = 'CODE_SMELL', file = 'src/a.js' } = {}) {
  const issues = [];
  for (let n = 1; n <= count; n++) issues.push({ key: `K${n}`, rule: 'js:S100', file, line: n, severity: n % 10 === 0 ? 'CRITICAL' : severity, type: n % 10 === 0 ? 'BUG' : type, message: { en: `Issue ${n}`, ko: `이슈 ${n}` }, status: 'OPEN', debtMin: 5 });
  const analysis = { issues, files: [{ path: file, ncloc: Math.max(count, 10) * 2 }] };
  return pullrequest.analyzePullRequest(analysis, { files: { [file]: { status: 'A', isNew: true } } }, { key: '5' });
}

function githubFake() {
  const state = { comments: [{ id: 1, body: 'Looks good to me' }], nextId: 100 };
  return fakeHttp((r) => {
    if (r.method === 'POST' && r.url === '/api/v3/repos/acme/web/check-runs') return { status: 201, json: { id: 77, html_url: 'https://ghe/acme/web/runs/77' } };
    if (r.method === 'PATCH' && r.url === '/api/v3/repos/acme/web/check-runs/77') return { status: 200, json: { id: 77 } };
    if (r.method === 'GET' && r.url.startsWith('/api/v3/repos/acme/web/issues/5/comments?')) return { status: 200, json: state.comments };
    if (r.method === 'POST' && r.url === '/api/v3/repos/acme/web/issues/5/comments') { const c = { id: state.nextId++, body: r.body.body }; state.comments.push(c); return { status: 201, json: c }; }
    const m = /^\/api\/v3\/repos\/acme\/web\/issues\/comments\/(\d+)$/.exec(r.url);
    if (r.method === 'PATCH' && m) { const c = state.comments.find((x) => x.id === Number(m[1])); c.body = r.body.body; return { status: 200, json: c }; }
    return { status: 404, json: { message: 'Not Found' } };
  }).then((f) => ({ ...f, state }));
}

test('GitHub decoration batches 120 annotations into 3 check-run requests and upserts one summary comment', async () => {
  const f = await githubFake();
  const pr = makePr(120);
  const cfg = { apiUrl: `${f.base}/api/v3`, token: 'ghs_x', owner: 'acme', repo: 'web', headSha: 'abc123', prNumber: 5 };
  const r = await alm.postDecoration('github', cfg, { pr });
  const checkReqs = f.reqs.filter((q) => q.url.includes('/check-runs'));
  assert.equal(checkReqs.length, 3);
  assert.deepEqual(checkReqs.map((q) => q.method), ['POST', 'PATCH', 'PATCH']);
  assert.deepEqual(checkReqs.map((q) => q.body.output.annotations.length), [50, 50, 20]);
  assert.equal(checkReqs[0].body.head_sha, 'abc123');
  assert.equal(checkReqs[0].body.status, 'completed');
  assert.equal(checkReqs[0].body.conclusion, 'failure');
  assert.equal(checkReqs[1].body.head_sha, undefined, 'updates only carry the output');
  assert.equal(checkReqs[0].headers.authorization, 'Bearer ghs_x');
  assert.equal(checkReqs[0].headers['x-github-api-version'], '2022-11-28');
  const allAnn = checkReqs.flatMap((q) => q.body.output.annotations);
  assert.equal(new Set(allAnn.map((a) => a.start_line)).size, 120);
  assert.equal(allAnn.find((a) => a.start_line === 10).annotation_level, 'failure');
  assert.equal(r.checkRunId, 77);
  assert.equal(r.annotations, 120);
  assert.equal(r.comment.action, 'created');
  assert.equal(f.state.comments.length, 2);
  assert.ok(f.state.comments[1].body.startsWith(alm.marker()));
  assert.match(f.state.comments[1].body, /Quality Gate failed/);

  const before = f.reqs.length;
  const again = await alm.postDecoration('github', cfg, { pr: makePr(3) });
  assert.equal(again.comment.action, 'updated');
  assert.equal(again.comment.id, f.state.comments[1].id);
  assert.equal(f.state.comments.length, 2, 'no duplicate summary comment');
  const second = f.reqs.slice(before);
  assert.deepEqual(second.map((q) => q.method), ['POST', 'GET', 'PATCH']);
  assert.equal(again.requests, 3);
});

test('GitHub decoration accepts the api payload shape with prebuilt decorations', async () => {
  const f = await githubFake();
  const pr = makePr(60);
  const payload = { pr, markdown: pullrequest.summaryMarkdown(pr, { lang: 'ko' }), decorations: pullrequest.decorations(pr, { headSha: 'def456' }) };
  const r = await alm.postDecoration('github', { apiUrl: `${f.base}/api/v3`, token: 't', owner: 'acme', repo: 'web', prNumber: 5, markerKey: 'main' }, payload);
  assert.equal(r.annotations, 60);
  const checks = f.reqs.filter((q) => q.url.includes('/check-runs'));
  assert.deepEqual(checks.map((q) => q.body.output.annotations.length), [50, 10]);
  assert.equal(checks[0].body.head_sha, 'def456');
  assert.ok(f.state.comments[1].body.startsWith('<!-- mycodechecker:pr-summary:main -->'));
  assert.match(f.state.comments[1].body, /품질 게이트 실패/);
  await assert.rejects(alm.postDecoration('github', { apiUrl: f.base, token: 't', owner: 'acme', repo: 'web' }, { decorations: { github: pullrequest.githubCheckRun(makePr(1), {}) } }), { code: 'ECONFIG' });
});

test('GitLab decoration updates the existing MR note, sets the commit status and writes the Code Quality report', async () => {
  const state = { notes: [{ id: 1, system: true, body: `${alm.marker()} system notes are ignored` }, { id: 2, system: false, body: `${alm.marker()}\nold summary` }] };
  const f = await fakeHttp((r) => {
    const base = '/api/v4/projects/grp%2Fproj';
    if (r.method === 'GET' && r.url.startsWith(`${base}/merge_requests/3/notes?`)) return { json: state.notes };
    if (r.method === 'PUT' && r.url === `${base}/merge_requests/3/notes/2`) { state.notes[1].body = r.body.body; return { json: state.notes[1] }; }
    if (r.method === 'POST' && r.url === `${base}/merge_requests/3/notes`) return { status: 201, json: { id: 9 } };
    if (r.method === 'POST' && r.url === `${base}/statuses/abc123`) return { status: 201, json: {} };
    return { status: 404, json: {} };
  });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcc-integrations-'));
  try {
    const pr = makePr(10);
    const reportPath = path.join(dir, 'out', 'gl-code-quality-report.json');
    const r = await alm.postDecoration('gitlab', { baseUrl: f.base, token: 'glpat', projectId: 'grp/proj', mrIid: 3, headSha: 'abc123', detailsUrl: 'http://mcc.local/pr/3', reportPath }, { pr });
    assert.deepEqual(r.note, { id: 2, action: 'updated' });
    assert.match(state.notes[1].body, /Quality Gate failed/);
    assert.equal(f.reqs[0].headers['private-token'], 'glpat');
    assert.match(f.reqs[0].url, /sort=asc&order_by=created_at&per_page=100&page=1$/);
    const status = f.reqs.find((q) => q.url.endsWith('/statuses/abc123'));
    assert.deepEqual(status.body, { state: 'failed', name: 'MyCodeChecker', description: 'Quality Gate failed', target_url: 'http://mcc.local/pr/3' });
    const written = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    assert.deepEqual(written, pullrequest.gitlabCodeQuality(pr));
    assert.equal(written.length, 10);
    assert.equal(r.codeQuality.length, 10);
    assert.equal(r.requests, 3);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Azure DevOps decoration skips known threads, resolves fixed ones, upserts the summary and posts the status', async () => {
  const pr = makePr(10);
  const fp0 = pullrequest.fingerprint(pr.issues[0]);
  const state = {
    threads: [
      { id: 11, status: 1, properties: { mycodechecker: { $type: 'System.String', $value: fp0 } }, comments: [{ id: 1, content: 'old issue 1' }] },
      { id: 12, status: 1, properties: { mycodechecker: { $type: 'System.String', $value: 'gone-fingerprint' } }, comments: [{ id: 1, content: 'fixed issue' }] },
      { id: 13, status: 4, comments: [{ id: 1, content: `${alm.marker()}\nold summary` }] },
      { id: 14, status: 1, comments: [{ id: 1, content: 'human review comment' }] },
    ],
  };
  let next = 100;
  const prefix = '/org/My%20Proj/_apis/git/repositories/repo1/pullRequests/9';
  const f = await fakeHttp((r) => {
    if (!r.url.startsWith(prefix)) return { status: 404, json: {} };
    const p = r.url.slice(prefix.length);
    if (r.method === 'GET' && p === '/threads?api-version=7.1') return { json: { value: state.threads, count: state.threads.length } };
    if (r.method === 'POST' && p === '/threads?api-version=7.1') return { json: { id: next++ } };
    if (r.method === 'PATCH' && p === '/threads/12?api-version=7.1') return { json: {} };
    if (r.method === 'PATCH' && p === '/threads/13/comments/1?api-version=7.1') return { json: {} };
    if (r.method === 'POST' && p === '/statuses?api-version=7.1-preview.1') return { status: 201, json: {} };
    return { status: 404, json: {} };
  });
  const r = await alm.postDecoration('azure', { baseUrl: `${f.base}/org`, project: 'My Proj', repositoryId: 'repo1', pullRequestId: 9, token: 'azpat' }, { pr });
  assert.equal(r.created, 9);
  assert.equal(r.skipped, 1);
  assert.equal(r.resolved, 1);
  assert.deepEqual(r.summary, { id: 13, action: 'updated' });
  assert.equal(f.reqs[0].headers.authorization, `Basic ${Buffer.from(':azpat').toString('base64')}`);
  const posted = f.reqs.filter((q) => q.method === 'POST' && q.url.includes('/threads?'));
  assert.equal(posted.length, 9);
  assert.equal(posted[0].body.threadContext.filePath, '/src/a.js');
  assert.equal(posted[0].body.threadContext.rightFileStart.line, 2);
  const resolve = f.reqs.find((q) => q.url.includes('/threads/12?'));
  assert.deepEqual(resolve.body, { status: 2 });
  const summary = f.reqs.find((q) => q.url.includes('/threads/13/comments/1'));
  assert.ok(summary.body.content.startsWith(alm.marker()));
  const status = f.reqs.find((q) => q.url.includes('/statuses'));
  assert.equal(status.body.state, 'failed');
  assert.deepEqual(status.body.context, { name: 'quality-gate', genre: 'mycodechecker' });
  assert.equal(f.reqs.some((q) => q.url.includes('/threads/14')), false, 'human threads are left alone');
});

test('Bitbucket Cloud replaces the report and posts annotations 100 at a time', async () => {
  const f = await fakeHttp((r) => (r.method === 'DELETE' ? { status: 404, json: { error: 'none' } } : { status: 200, json: {} }));
  const pr = makePr(150);
  const r = await alm.postDecoration('bitbucket', { apiUrl: `${f.base}/2.0`, workspace: 'acme', repo: 'web', commit: 'c0ffee', user: 'bot', appPassword: 'app-pw' }, { pr });
  const p = '/2.0/repositories/acme/web/commit/c0ffee/reports/mycodechecker';
  assert.deepEqual(f.reqs.map((q) => `${q.method} ${q.url}`), [`DELETE ${p}`, `PUT ${p}`, `POST ${p}/annotations`, `POST ${p}/annotations`]);
  assert.equal(f.reqs[0].headers.authorization, `Basic ${Buffer.from('bot:app-pw').toString('base64')}`);
  assert.equal(f.reqs[1].body.result, 'FAILED');
  assert.equal(f.reqs[1].body.report_type, 'BUG');
  assert.deepEqual([f.reqs[2].body.length, f.reqs[3].body.length], [100, 50]);
  assert.equal(f.reqs[2].body[0].annotation_type, 'CODE_SMELL');
  assert.equal(r.annotations, 150);
  assert.equal(r.requests, 4);
});

test('Bitbucket Server uses the insights 1.0 API with its own field names', async () => {
  const f = await fakeHttp((r) => (r.method === 'DELETE' ? { status: 204, json: undefined } : { status: 200, json: {} }));
  const pr = makePr(12);
  await alm.postDecoration('bitbucket-server', { baseUrl: `${f.base}/bitbucket`, projectKey: 'PRJ', repo: 'web', commit: 'c0ffee', token: 'bbpat', reportKey: 'mcc' }, { pr });
  const p = '/bitbucket/rest/insights/1.0/projects/PRJ/repos/web/commits/c0ffee/reports/mcc';
  assert.deepEqual(f.reqs.map((q) => `${q.method} ${q.url}`), [`DELETE ${p}`, `PUT ${p}`, `POST ${p}/annotations`]);
  assert.equal(f.reqs[1].headers.authorization, 'Bearer bbpat');
  assert.equal(f.reqs[1].body.result, 'FAIL');
  assert.equal(f.reqs[1].body.report_type, undefined);
  const anns = f.reqs[2].body.annotations;
  assert.equal(anns.length, 12);
  const crit = anns.find((a) => a.line === 10);
  assert.deepEqual(Object.keys(crit).sort(), ['externalId', 'line', 'message', 'path', 'severity', 'type']);
  assert.equal(crit.severity, 'HIGH');
  assert.equal(crit.type, 'BUG');
  await assert.rejects(alm.postDecoration('svn', {}, {}), { code: 'ECONFIG' });
});

// ---------------------------------------------------------------------------
// Fake LDAP server

const { ber } = ldap;
const SVC_DN = 'cn=svc,dc=ex,dc=com';
const SVC_PW = 'svc-secret';
const DIRECTORY = [
  { dn: SVC_DN, password: SVC_PW, attrs: { objectClass: ['person'], cn: ['svc'] } },
  {
    dn: 'uid=kim,ou=people,dc=ex,dc=com', password: 'pw-kim',
    attrs: { objectClass: ['person', 'inetOrgPerson'], uid: ['kim'], cn: ['Kim Minsu'], displayName: ['김민수'], mail: ['kim@ex.com'], memberOf: ['cn=developers,ou=groups,dc=ex,dc=com', 'cn=Release\\, Team,ou=groups,dc=ex,dc=com'] },
  },
  { dn: 'cn=Lee Jun,ou=people,dc=ex,dc=com', password: 'pw-lee', attrs: { objectClass: ['person', 'user'], sAMAccountName: ['lee'], cn: ['Lee Jun'], mail: ['lee@ex.com'] } },
  { dn: 'uid=dup1,ou=people,dc=ex,dc=com', password: 'x', attrs: { objectClass: ['person'], uid: ['dup'], cn: ['Dup 1'] } },
  { dn: 'uid=dup2,ou=people,dc=ex,dc=com', password: 'x', attrs: { objectClass: ['person'], mail: ['dup'], cn: ['Dup 2'] } },
  { dn: 'cn=leads,ou=groups,dc=ex,dc=com', attrs: { objectClass: ['groupOfNames'], cn: ['leads'], member: ['cn=Lee Jun,ou=people,dc=ex,dc=com'] } },
  { dn: 'cn=all-staff,ou=groups,dc=ex,dc=com', attrs: { objectClass: ['groupOfNames'], cn: ['all-staff'], member: ['cn=Lee Jun,ou=people,dc=ex,dc=com', 'uid=kim,ou=people,dc=ex,dc=com'] } },
];

function valuesOf(entry, name) {
  const k = Object.keys(entry.attrs).find((x) => x.toLowerCase() === name.toLowerCase());
  return k ? entry.attrs[k] : [];
}

function matches(f, e) {
  const lc = (s) => String(s).toLowerCase();
  switch (f.type) {
    case 'and': return f.filters.every((x) => matches(x, e));
    case 'or': return f.filters.some((x) => matches(x, e));
    case 'not': return !matches(f.filter, e);
    case 'eq': return valuesOf(e, f.attr).some((v) => lc(v) === lc(f.value));
    case 'present': return f.attr.toLowerCase() === 'objectclass' || valuesOf(e, f.attr).length > 0;
    case 'substr': return valuesOf(e, f.attr).some((v) => {
      let s = lc(v);
      if (f.initial) { if (!s.startsWith(lc(f.initial))) return false; s = s.slice(f.initial.length); }
      for (const a of f.any) { const i = s.indexOf(lc(a)); if (i < 0) return false; s = s.slice(i + a.length); }
      return !f.final || s.endsWith(lc(f.final));
    });
    default: return false;
  }
}

function ldapResult(tag, code, diag = '') {
  return ber.tlv(tag, [ber.int(code, 0x0a), ber.str(''), ber.str(diag)]);
}

function ldapEntry(e, wanted) {
  const keys = Object.keys(e.attrs).filter((k) => !wanted.length || wanted.some((w) => w.toLowerCase() === k.toLowerCase()));
  return ber.tlv(0x64, [ber.str(e.dn), ber.tlv(0x30, keys.map((k) => ber.tlv(0x30, [ber.str(k), ber.tlv(0x31, e.attrs[k].map((v) => ber.str(v)))])))]);
}

function fakeLdap({ ldaps = false, startTls = false } = {}) {
  const state = { binds: [], searches: [], raw: [], unbinds: 0, startTls: 0, connections: 0 };
  const handle = (socket) => {
    state.connections++;
    let cur = socket;
    let buf = Buffer.alloc(0);
    let bound = null;
    socket.on('error', () => {});
    const reply = (id, op) => cur.write(ber.tlv(0x30, [ber.int(id), op]));
    const onData = (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      for (;;) {
        const h = ber.readHeader(buf, 0);
        if (!h) return;
        const raw = buf.subarray(0, h.end);
        buf = buf.subarray(h.end);
        state.raw.push(Buffer.from(raw));
        const msg = ber.decode(raw);
        const id = ber.nodeInt(msg.children[0]);
        const op = msg.children[1];
        if (op.tag === 0x60) {
          const [ver, name, auth] = op.children;
          const dn = ber.nodeStr(name);
          const password = auth.value.toString('utf8');
          state.binds.push({ dn, password, version: ber.nodeInt(ver), authTag: auth.tag });
          const e = DIRECTORY.find((x) => x.dn.toLowerCase() === dn.toLowerCase());
          if (e && e.password && e.password === password) { bound = dn; reply(id, ldapResult(0x61, 0)); } else { bound = null; reply(id, ldapResult(0x61, 49, '80090308: AcceptSecurityContext error, data 52e')); }
        } else if (op.tag === 0x63) {
          const k = op.children;
          const base = ber.nodeStr(k[0]);
          const scope = ber.nodeInt(k[1]);
          const sizeLimit = ber.nodeInt(k[3]);
          const filter = ldap.decodeFilter(k[6]);
          const attrs = (k[7].children || []).map(ber.nodeStr);
          state.searches.push({ base, scope, sizeLimit, filter, attrs, as: bound });
          if (!bound) { reply(id, ldapResult(0x65, 50, 'bind first')); continue; }
          const hits = DIRECTORY.filter((e) => e.dn.toLowerCase().endsWith(base.toLowerCase()) && matches(filter, e));
          const out = sizeLimit ? hits.slice(0, sizeLimit) : hits;
          for (const e of out) reply(id, ldapEntry(e, attrs));
          reply(id, ldapResult(0x65, sizeLimit && hits.length > sizeLimit ? 4 : 0));
        } else if (op.tag === 0x42) {
          state.unbinds++;
          cur.end();
        } else if (op.tag === 0x77) {
          const oid = ber.nodeStr(op.children[0]);
          if (!startTls || oid !== ldap.STARTTLS_OID) { reply(id, ber.tlv(0x78, [ber.int(2, 0x0a), ber.str(''), ber.str('unsupported')])); continue; }
          state.startTls++;
          reply(id, ber.tlv(0x78, [ber.int(0, 0x0a), ber.str(''), ber.str('')]));
          cur.removeListener('data', onData);
          const t = new tls.TLSSocket(cur, { isServer: true, secureContext });
          t.on('error', () => {});
          sockets.add(t);
          t.on('close', () => sockets.delete(t));
          t.on('data', onData);
          cur = t;
          return;
        }
      }
    };
    cur.on('data', onData);
  };
  const server = ldaps ? tls.createServer({ key: TEST_KEY, cert: TEST_CERT }, handle) : net.createServer(handle);
  return { server, state };
}

async function startLdap(opts) {
  const f = fakeLdap(opts);
  f.port = await listen(f.server);
  return f;
}

const LDAP_BASE = { bindDn: SVC_DN, bindPassword: SVC_PW, baseDn: 'ou=people,dc=ex,dc=com', timeoutMs: 3000 };

// ---------------------------------------------------------------------------
// LDAP

test('BER encoding of a simple bind request matches the RFC 4511 bytes', async () => {
  const f = await startLdap();
  await ldap.testConnection({ ...LDAP_BASE, url: `ldap://127.0.0.1:${f.port}` });
  const dn = Buffer.from(SVC_DN);
  const pw = Buffer.from(SVC_PW);
  const inner = 3 + 2 + dn.length + 2 + pw.length;
  const expected = Buffer.from([0x30, 3 + 2 + inner, 0x02, 0x01, 0x01, 0x60, inner, 0x02, 0x01, 0x03, 0x04, dn.length, ...dn, 0x80, pw.length, ...pw]);
  assert.equal(f.state.raw[0].toString('hex'), expected.toString('hex'));
  assert.deepEqual(f.state.raw[1].subarray(2).toString('hex'), Buffer.from([0x02, 0x01, 0x02, 0x42, 0x00]).toString('hex'), 'then an UnbindRequest');
});

test('LDAP filters parse, escape and encode to the expected BER', () => {
  assert.equal(ldap.encodeFilter('(uid=ab)').toString('hex'), Buffer.from([0xa3, 0x09, 0x04, 0x03, ...Buffer.from('uid'), 0x04, 0x02, ...Buffer.from('ab')]).toString('hex'));
  assert.equal(ldap.encodeFilter('(mail=*)').toString('hex'), Buffer.from([0x87, 0x04, ...Buffer.from('mail')]).toString('hex'));
  assert.equal(ldap.escapeFilterValue('a*(b)\\c\0'), 'a\\2a\\28b\\29\\5cc\\00');
  const tree = ldap.parseFilter('(&(objectClass=person)(|(uid=a\\2ab)(cn=Jo*n*th*))(!(mail=*))(cn~=kim)(age>=3))');
  assert.equal(tree.type, 'and');
  assert.deepEqual(tree.filters.map((x) => x.type), ['eq', 'or', 'not', 'approx', 'ge']);
  assert.equal(tree.filters[1].filters[0].value.toString(), 'a*b');
  const back = ldap.decodeFilter(ber.decode(ldap.encodeFilter(tree)));
  assert.equal(back.filters[1].filters[0].value, 'a*b');
  assert.deepEqual(back.filters[1].filters[1], { type: 'substr', attr: 'cn', initial: 'Jo', any: ['n', 'th'], final: null });
  assert.equal(back.filters[1].filters[1].initial, 'Jo');
  assert.deepEqual(back.filters[2], { type: 'not', filter: { type: 'present', attr: 'mail' } });
  assert.equal(ldap.decodeFilter(ber.decode(ldap.encodeFilter('(cn=김*)'))).initial, '김');
  for (const bad of ['(uid=a', '(&)', '(uid=a))', '((uid=a)']) assert.throws(() => ldap.parseFilter(bad), { code: 'EFILTER' }, bad);
  assert.equal(ldap.rdnValue('cn=Release\\, Team,ou=groups'), 'Release, Team');
  for (const n of [0, 1, 127, 128, 255, 256, 65535, 2 ** 31 - 1, -1, -128, -129]) assert.equal(ber.nodeInt(ber.decode(ber.int(n))), n, String(n));
  const long = ber.str('x'.repeat(300));
  assert.deepEqual([...long.subarray(0, 4)], [0x04, 0x82, 0x01, 0x2c]);
});

test('authenticate binds the service account, finds the user, binds as the user and maps memberOf groups', async () => {
  const f = await startLdap();
  const cfg = { ...LDAP_BASE, url: `ldap://127.0.0.1:${f.port}`, groupMap: { developers: 'dev-team', 'release, team': 'releasers', unrelated: 'x' } };
  const u = await ldap.authenticate(cfg, 'kim', 'pw-kim');
  assert.deepEqual(u, {
    dn: 'uid=kim,ou=people,dc=ex,dc=com', login: 'kim', name: '김민수', email: 'kim@ex.com',
    groups: ['developers', 'Release, Team'],
    groupDns: ['cn=developers,ou=groups,dc=ex,dc=com', 'cn=Release\\, Team,ou=groups,dc=ex,dc=com'],
    mappedGroups: ['dev-team', 'releasers'],
  });
  assert.deepEqual(f.state.binds.map((b) => b.dn), [SVC_DN, 'uid=kim,ou=people,dc=ex,dc=com']);
  assert.ok(f.state.binds.every((b) => b.version === 3 && b.authTag === 0x80));
  const s = f.state.searches[0];
  assert.equal(s.base, 'ou=people,dc=ex,dc=com');
  assert.equal(s.scope, 2);
  assert.equal(s.sizeLimit, 2);
  assert.equal(s.as, SVC_DN);
  assert.deepEqual(s.filter, { type: 'or', filters: [{ type: 'eq', attr: 'uid', value: 'kim' }, { type: 'eq', attr: 'sAMAccountName', value: 'kim' }, { type: 'eq', attr: 'mail', value: 'kim' }] });
  assert.ok(s.attrs.includes('memberOf') && s.attrs.includes('mail'));
  assert.equal(f.state.unbinds, 1);
});

test('authenticate reads groups with a group search and a custom user filter (Active Directory style)', async () => {
  const f = await startLdap();
  const cfg = {
    ...LDAP_BASE, url: `ldap://127.0.0.1:${f.port}`, baseDn: 'dc=ex,dc=com',
    userFilter: '(&(objectClass=user)(sAMAccountName={login}))', loginAttr: 'sAMAccountName',
    groupSearch: { baseDn: 'ou=groups,dc=ex,dc=com', filter: '(&(objectClass=groupOfNames)(member={dn}))' },
  };
  const u = await ldap.authenticate(cfg, 'lee', 'pw-lee');
  assert.equal(u.dn, 'cn=Lee Jun,ou=people,dc=ex,dc=com');
  assert.equal(u.name, 'Lee Jun');
  assert.equal(u.login, 'lee');
  assert.deepEqual(u.groups.sort(), ['all-staff', 'leads']);
  assert.deepEqual(u.mappedGroups.sort(), ['all-staff', 'leads']);
  const gs = f.state.searches[1];
  assert.equal(gs.as, SVC_DN, 'groups are read with the service account');
  assert.deepEqual(gs.filter.filters[1], { type: 'eq', attr: 'member', value: 'cn=Lee Jun,ou=people,dc=ex,dc=com' });
  assert.deepEqual(f.state.binds.map((b) => b.dn), [SVC_DN, 'cn=Lee Jun,ou=people,dc=ex,dc=com', SVC_DN]);
});

test('authenticate returns null for a wrong password, an unknown user, an ambiguous match and filter metacharacters', async () => {
  const f = await startLdap();
  const cfg = { ...LDAP_BASE, url: `ldap://127.0.0.1:${f.port}` };
  assert.equal(await ldap.authenticate(cfg, 'kim', 'wrong'), null);
  assert.equal(f.state.binds[1].dn, 'uid=kim,ou=people,dc=ex,dc=com');
  assert.equal(await ldap.authenticate(cfg, 'nobody', 'pw'), null);
  assert.equal(await ldap.authenticate(cfg, 'dup', 'x'), null);
  const before = f.state.searches.length;
  assert.equal(await ldap.authenticate(cfg, 'k*', 'pw-kim'), null);
  const s = f.state.searches[before];
  assert.deepEqual(s.filter.filters[0], { type: 'eq', attr: 'uid', value: 'k*' }, 'the * is a literal, not a wildcard');
  assert.equal(await ldap.authenticate(cfg, '*)(uid=*', 'pw-kim'), null);
  assert.equal(f.state.searches[before + 1].filter.type, 'or');
  assert.equal(f.state.searches[before + 1].filter.filters.length, 3);
  assert.equal(f.state.unbinds, 5);
});

test('empty passwords are rejected and never sent to the server', async () => {
  const f = await startLdap();
  const cfg = { ...LDAP_BASE, url: `ldap://127.0.0.1:${f.port}` };
  assert.equal(await ldap.authenticate(cfg, 'kim', ''), null);
  assert.equal(await ldap.authenticate(cfg, 'kim', undefined), null);
  assert.equal(await ldap.authenticate(cfg, '', 'pw-kim'), null);
  assert.equal(f.state.connections, 0, 'no connection at all');
  const client = await ldap.connect({ url: `ldap://127.0.0.1:${f.port}`, timeoutMs: 3000 });
  await assert.rejects(client.bind('uid=kim,ou=people,dc=ex,dc=com', ''), (err) => err.code === 'EMPTY_PASSWORD' && err.text.ko === '빈 비밀번호는 허용하지 않습니다.');
  await client.unbind();
  await assert.rejects(ldap.authenticate({ ...cfg, bindPassword: '' }, 'kim', 'pw-kim'), { code: 'ECONFIG' });
  await assert.rejects(ldap.authenticate({ ...cfg, bindDn: '' }, 'kim', 'pw-kim'), { code: 'ECONFIG' });
  assert.ok(f.state.binds.every((b) => b.password !== ''), 'no bind with an empty password ever reached the server');
});

test('a wrong service account password throws a clear configuration error', async () => {
  const f = await startLdap();
  await assert.rejects(ldap.authenticate({ ...LDAP_BASE, url: `ldap://127.0.0.1:${f.port}`, bindPassword: 'nope' }, 'kim', 'pw-kim'), (err) => {
    assert.equal(err.name, 'LdapError');
    assert.equal(err.code, 'ESERVICEBIND');
    assert.equal(err.resultCode, 49);
    assert.match(err.text.ko, /서비스 계정/);
    return true;
  });
  await assert.rejects(ldap.testConnection({ ...LDAP_BASE, url: `ldap://127.0.0.1:${f.port}`, bindPassword: 'nope' }), { code: 'ESERVICEBIND' });
  assert.deepEqual(await ldap.testConnection({ ...LDAP_BASE, url: `ldap://127.0.0.1:${f.port}` }), { ok: true });
});

test('StartTLS and LDAPS log in over TLS with the test certificate', async () => {
  const st = await startLdap({ startTls: true });
  const u1 = await ldap.authenticate({ ...LDAP_BASE, url: `ldap://127.0.0.1:${st.port}`, startTls: true, ca: TEST_CERT }, 'kim', 'pw-kim');
  assert.equal(u1.email, 'kim@ex.com');
  assert.equal(st.state.startTls, 1);
  const extReq = ber.decode(st.state.raw[0]).children[1];
  assert.equal(extReq.tag, 0x77);
  assert.equal(ber.nodeStr(extReq.children[0]), '1.3.6.1.4.1.1466.20037');
  await assert.rejects(ldap.authenticate({ ...LDAP_BASE, url: `ldap://127.0.0.1:${st.port}`, startTls: true }, 'kim', 'pw-kim'), { code: 'ETLS' });
  const plain = await startLdap();
  await assert.rejects(ldap.authenticate({ ...LDAP_BASE, url: `ldap://127.0.0.1:${plain.port}`, startTls: true, ca: TEST_CERT }, 'kim', 'pw-kim'), (err) => err.code === 'ETLS' && err.resultCode === 2);
  const ls = await startLdap({ ldaps: true });
  const u2 = await ldap.authenticate({ ...LDAP_BASE, url: `ldaps://127.0.0.1:${ls.port}`, ca: TEST_CERT }, 'kim', 'pw-kim');
  assert.equal(u2.name, '김민수');
  assert.equal(ls.state.binds.length, 2);
  await assert.rejects(ldap.authenticate({ ...LDAP_BASE, url: `ftp://127.0.0.1:${ls.port}` }, 'kim', 'pw-kim'), { code: 'ECONFIG' });
});

test('LDAP operations time out against a silent server', async () => {
  const server = net.createServer((s) => s.on('error', () => {}));
  const port = await listen(server);
  await assert.rejects(ldap.authenticate({ ...LDAP_BASE, url: `ldap://127.0.0.1:${port}`, timeoutMs: 200 }, 'kim', 'pw-kim'), { code: 'TIMEOUT' });
});

test('the index exposes every integration module', () => {
  assert.deepEqual(Object.keys(integrations).sort(), ['alm', 'http', 'ldap', 'notify', 'smtp', 'tracker']);
  assert.equal(typeof integrations.smtp.sendMail, 'function');
  assert.equal(typeof integrations.notify.dispatch, 'function');
  assert.equal(typeof integrations.tracker.createTicket, 'function');
  assert.equal(typeof integrations.alm.postDecoration, 'function');
  assert.equal(typeof integrations.ldap.authenticate, 'function');
  assert.equal(typeof integrations.http.request, 'function');
});
