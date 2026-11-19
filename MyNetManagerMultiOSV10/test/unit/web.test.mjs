// Web and text protocols: HTTP/1.x (+ reassembly, chunked, matching, media), SSDP, WebSocket,
// HTTP/2 + HPACK, FTP/FTP-DATA, SMTP/IMF, POP, IMAP, Telnet, SSH.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSession, dissect } from '../../src/domain/dissect/index.js';
import { hpackDecode, huffmanDecode } from '../../src/domain/dissect/proto/http2.js';
import * as S from '../../src/domain/capture/synth.js';
import * as W from '../../src/domain/capture/build/web.js';
import { writePcapng, readCapture } from '../../src/domain/capture/pcap.js';

const PC = { mac: 'a4:83:e7:12:34:56', ip: '192.168.0.10' };
const SV = { mac: '00:1a:a0:01:02:03', ip: '192.168.0.20' };

function run(file) {
  const s = createSession(file, { resolve: { mac: false, transport: false, network: false } });
  for (const f of file.frames) s.firstPass(f);
  const ds = file.frames.map((f) => dissect(s, f));
  assert.deepEqual(s.bugs, [], 'no dissector exceptions');
  return { s, ds, f: (no) => ds[no - 1] };
}
const val = (d, a) => (d.fields.get(a) || []).map((n) => n.value);
const one = (d, a) => val(d, a)[0];
const proto = (d) => d.layers.slice(1).join(':');
const find = (ds, pred) => ds.find(pred);

test('HTTP request/response fields, Info and matching', () => {
  const cap = new S.Capture();
  const c = new S.TcpConversation(cap, { ...PC, port: 50000 }, { ...SV, port: 80 });
  c.handshake();
  c.send('c', W.httpRequest({ path: '/index.html?a=1&b=2', host: 'example.com', headers: [['User-Agent', 'curl/8'], ['Cookie', 'x=1; y=2']] }));
  c.send('s', W.httpResponse({ headers: [['Content-Type', 'text/html'], ['Server', 'nginx']], body: '<html>\n</html>\n' }));
  const { ds } = run(cap.file());
  const rq = find(ds, (d) => d.columns.protocol === 'HTTP' && one(d, 'http.request'));
  const rs = find(ds, (d) => d.columns.protocol === 'HTTP' && one(d, 'http.response'));
  assert.equal(rq.columns.info, 'GET /index.html?a=1&b=2 HTTP/1.1 ');
  assert.equal(one(rq, 'http.request.method'), 'GET');
  assert.equal(one(rq, 'http.request.uri'), '/index.html?a=1&b=2');
  assert.equal(one(rq, 'http.request.uri.path'), '/index.html');
  assert.deepEqual(val(rq, 'http.request.uri.query.parameter'), ['a=1', 'b=2']);
  assert.equal(one(rq, 'http.host'), 'example.com');
  assert.equal(one(rq, 'http.user_agent'), 'curl/8');
  assert.deepEqual(val(rq, 'http.cookie_pair'), ['x=1', 'y=2']);
  assert.equal(one(rq, 'http.request.full_uri'), 'http://example.com/index.html?a=1&b=2');
  assert.equal(rs.columns.info, 'HTTP/1.1 200 OK  (text/html)');
  assert.equal(proto(rs), 'eth:ethertype:ip:tcp:http:data-text-lines');
  assert.equal(one(rs, 'http.response.code'), 200);
  assert.equal(one(rs, 'http.response.phrase'), 'OK');
  assert.equal(one(rs, 'http.content_length'), 15n);
  assert.equal(one(rs, 'http.server'), 'nginx');
  assert.equal(one(rq, 'http.response_in'), rs.fields.get('frame.number')[0].value);
  assert.equal(one(rs, 'http.request_in'), rq.fields.get('frame.number')[0].value);
  assert.ok(one(rs, 'http.time') > 0);
  assert.equal(one(rs, 'http.request.uri'), '/index.html?a=1&b=2');
});

test('HTTP message spanning three TCP segments is reassembled', () => {
  const cap = new S.Capture();
  const c = new S.TcpConversation(cap, { ...PC, port: 50001 }, { ...SV, port: 80 }, { mss: 600 });
  c.handshake();
  c.send('c', W.httpRequest({ path: '/', host: 'h' }));
  const body = 'x'.repeat(1500) + '\n';
  c.send('s', W.httpResponse({ headers: [['Content-Type', 'text/plain']], body }));
  const { ds } = run(cap.file());
  const segs = ds.filter((d) => /TCP PDU reassembled in/.test(d.columns.info));
  assert.equal(segs.length, 2);
  const fin = find(ds, (d) => one(d, 'http.response'));
  assert.equal(fin.sources.length, 2);
  assert.match(fin.sources[1].name, /^Reassembled TCP \(\d+ bytes\)$/);
  assert.equal(val(fin, 'tcp.segment').length, 3);
  assert.equal(one(fin, 'http.content_length'), BigInt(body.length));
  const finNo = one(fin, 'frame.number');
  for (const sgm of segs) assert.equal(one(sgm, 'tcp.reassembled_in'), finNo);
  const fileData = fin.fields.get('http.file_data')[0];
  assert.equal(fileData.source, 1);
  assert.equal(fileData.length, body.length);
});

test('chunked body is de-chunked into its own source; JSON body gets a json layer', () => {
  const cap = new S.Capture();
  const c = new S.TcpConversation(cap, { ...PC, port: 50002 }, { ...SV, port: 8080 });
  c.handshake();
  c.send('c', W.httpRequest({ path: '/api', host: 'h' }));
  c.send('s', W.httpResponse({ headers: [['Content-Type', 'application/json; charset=utf-8']], body: '{"ok":true,"n":[1,2.5],"s":"a\\"b"}', chunked: 10 }));
  const { ds } = run(cap.file());
  const rs = find(ds, (d) => one(d, 'http.response'));
  assert.equal(proto(rs), 'eth:ethertype:ip:tcp:http:json');
  assert.equal(rs.columns.protocol, 'HTTP/JSON');
  assert.equal(rs.columns.info, 'HTTP/1.1 200 OK , JSON (application/json)');
  assert.ok(rs.sources.some((x) => /^De-chunked entity body/.test(x.name)));
  assert.deepEqual(val(rs, 'http.chunk_size'), [10, 10, 10, 4, 0]);
  assert.deepEqual(val(rs, 'json.key'), ['ok', 'n', 's']);
  assert.deepEqual(val(rs, 'json.value.number'), [1, 2.5]);
  assert.deepEqual(val(rs, 'json.value.string'), ['a"b']);
  assert.deepEqual(val(rs, 'json.path'), ['/ok', '/n', '/s']);
});

test('pipelined requests, HEAD, 304 and a lost segment refilled by a retransmission', () => {
  const cap = new S.Capture();
  const c = new S.TcpConversation(cap, { ...PC, port: 50003 }, { ...SV, port: 80 }, { mss: 400 });
  c.handshake();
  c.send('c', S.bytes(W.httpRequest({ path: '/a', host: 'h' }), W.httpRequest({ path: '/b', host: 'h' })));
  c.send('s', W.httpResponse({ headers: [['Content-Type', 'image/png']], body: S.hex('89504e470d0a1a0a0000000d49484452000000100000001008060000001f15c489') }));
  c.send('s', W.httpResponse({ code: 404, headers: [['Content-Type', 'text/html']], body: 'nope\n' }));
  c.send('c', W.httpRequest({ method: 'HEAD', path: '/h', host: 'h' }));
  c.send('s', W.httpResponse({ headers: [['Content-Length', '9999']] }).subarray(0));
  c.send('c', W.httpRequest({ path: '/lost', host: 'h' }));
  c.send('s', W.httpResponse({ headers: [['Content-Type', 'text/plain']], body: 'abc\n'.repeat(300) }), { lose: [1] });
  const { ds } = run(cap.file());
  const pip = find(ds, (d) => /GET \/a/.test(d.columns.info));
  assert.equal(pip.columns.info, 'GET /a HTTP/1.1 GET /b HTTP/1.1 ');
  assert.deepEqual(val(pip, 'http.request.method'), ['GET', 'GET']);
  const png = find(ds, (d) => /\(PNG\)/.test(d.columns.info));
  assert.equal(proto(png), 'eth:ethertype:ip:tcp:http:png');
  assert.equal(one(png, 'png.ihdr.width'), 16);
  const head = find(ds, (d) => /HEAD/.test(d.columns.info));
  const headResp = ds[one(head, 'http.response_in') - 1];
  assert.equal(one(headResp, 'http.response.code'), 200);
  const lostResp = find(ds, (d) => one(d, 'http.response') && /text\/plain/.test(d.columns.info));
  assert.match(lostResp.columns.info, /^\[TCP (Fast )?Retransmission\] HTTP\/1\.1 200 OK/);
  assert.equal(one(lostResp, 'http.content_length'), 1200n);
  assert.ok(ds.some((d) => /Previous segment not captured.*TCP PDU reassembled in/.test(d.columns.info)));
});

test('SSDP over UDP uses the http.* fields', () => {
  const cap = new S.Capture();
  W.ssdpFrames(cap);
  const { ds } = run(cap.file());
  assert.equal(proto(ds[0]), 'eth:ethertype:ip:udp:ssdp');
  assert.equal(ds[0].columns.protocol, 'SSDP');
  assert.equal(ds[0].columns.info, 'M-SEARCH * HTTP/1.1 ');
  assert.equal(one(ds[0], 'http.request.method'), 'M-SEARCH');
  assert.equal(ds[1].columns.info, 'HTTP/1.1 200 OK ');
  assert.equal(ds[2].columns.info, 'NOTIFY * HTTP/1.1 ');
});

test('WebSocket upgrade, masked text frame is unmasked into a new source', () => {
  const cap = new S.Capture();
  const c = new S.TcpConversation(cap, { ...PC, port: 50004 }, { ...SV, port: 80 });
  c.handshake();
  c.send('c', W.httpRequest({ path: '/ws', host: 'h', headers: [['Upgrade', 'websocket'], ['Connection', 'Upgrade'], ['Sec-WebSocket-Key', 'k'], ['Sec-WebSocket-Version', '13']] }));
  c.send('s', W.httpResponse({ code: 101, headers: [['Upgrade', 'websocket'], ['Connection', 'Upgrade']] }));
  c.send('c', W.wsFrame({ payload: 'hello', mask: [1, 2, 3, 4] }));
  c.send('s', W.wsFrame({ opcode: 8, payload: S.bytes(S.be16(1001), 'bye') }));
  const { ds } = run(cap.file());
  const t = find(ds, (d) => d.columns.protocol === 'WebSocket' && /Text/.test(d.columns.info));
  assert.equal(t.columns.info, 'WebSocket Text [FIN] [MASKED]');
  assert.equal(proto(t), 'eth:ethertype:ip:tcp:http:websocket:data-text-lines');
  assert.equal(one(t, 'websocket.payload.text'), 'hello');
  assert.ok(t.sources.some((x) => /^Unmasked data/.test(x.name)));
  const cl = find(ds, (d) => /Connection Close/.test(d.columns.info));
  assert.equal(cl.columns.info, 'WebSocket Connection Close [FIN] ');
  assert.equal(one(cl, 'websocket.payload.close.status_code'), 1001);
  assert.equal(one(cl, 'websocket.payload.close.reason'), 'bye');
});

test('HPACK: RFC 7541 C.4 examples (Huffman + dynamic table)', () => {
  assert.equal(huffmanDecode(S.hex('f1e3c2e5f23a6ba0ab90f4ff'), 0, 12), 'www.example.com');
  const dyn = { list: [], size: 0, max: 4096 };
  const b1 = S.hex('828684418cf1e3c2e5f23a6ba0ab90f4ff');
  const h1 = hpackDecode(b1, 0, b1.length, dyn);
  assert.deepEqual(h1.map((h) => [h.name, h.value]), [[':method', 'GET'], [':scheme', 'http'], [':path', '/'], [':authority', 'www.example.com']]);
  const b2 = S.hex('828684be5886a8eb10649cbf');
  const h2 = hpackDecode(b2, 0, b2.length, dyn);
  assert.deepEqual(h2.map((h) => [h.name, h.value]), [[':method', 'GET'], [':scheme', 'http'], [':path', '/'], [':authority', 'www.example.com'], ['cache-control', 'no-cache']]);
  const b3 = S.hex('828785bf408825a849e95ba97d7f8925a849e95bb8e8b4bf');
  const h3 = hpackDecode(b3, 0, b3.length, dyn);
  assert.deepEqual(h3.map((h) => [h.name, h.value]).slice(2), [[':path', '/index.html'], [':authority', 'www.example.com'], ['custom-key', 'custom-value']]);
  assert.equal(dyn.list.length, 3);
});

test('HTTP/2 prior knowledge: frames, headers, request/response and Info', () => {
  const cap = new S.Capture();
  const c = new S.TcpConversation(cap, { ...PC, port: 50005 }, { ...SV, port: 80 });
  c.handshake();
  c.send('c', S.bytes(W.H2_PREFACE, W.h2Settings(), W.h2Frame(1, 5, 1, W.hpack([[':method', 'GET'], [':scheme', 'http'], [':path', '/'], [':authority', 'h']]))));
  c.send('s', S.bytes(W.h2Frame(1, 4, 1, W.hpack([[':status', '200'], ['content-type', 'text/plain']])), W.h2Frame(0, 1, 1, S.te('hi\n')), W.h2Frame(3, 0, 3, S.be32(8))));
  const { ds } = run(cap.file());
  const a = find(ds, (d) => /Magic/.test(d.columns.info));
  assert.equal(a.columns.info, 'Magic, SETTINGS[0], HEADERS[1]: GET /');
  assert.equal(proto(a), 'eth:ethertype:ip:tcp:http:http2');
  assert.deepEqual(val(a, 'http2.type'), [4, 1]);
  assert.equal(one(a, 'http2.headers.method'), 'GET');
  assert.equal(one(a, 'http2.request.full_uri'), 'http://h/');
  const b = find(ds, (d) => /200 OK/.test(d.columns.info));
  assert.equal(b.columns.info, 'HEADERS[1]: 200 OK, DATA[1] (text/plain), RST_STREAM[3]');
  assert.equal(one(b, 'http2.headers.status'), 200);
  assert.equal(one(b, 'http2.rst_stream.error'), 8);
  assert.equal(one(b, 'http2.request_in'), one(a, 'frame.number'));
});

test('FTP control: commands, PASV, cwd; FTP-DATA bound to the passive port', () => {
  const file = W.samples.find((x) => x.id === 'ftp-session').build();
  const { ds } = run(file);
  const user = find(ds, (d) => d.columns.info === 'Request: USER alice');
  assert.equal(one(user, 'ftp.request.command'), 'USER');
  assert.equal(one(user, 'ftp.request.arg'), 'alice');
  const pasv = find(ds, (d) => /^Response: 227/.test(d.columns.info));
  assert.equal(one(pasv, 'ftp.response.code'), 227);
  assert.equal(one(pasv, 'ftp.passive.ip'), '192.168.0.20');
  assert.equal(one(pasv, 'ftp.passive.port'), 40000);
  assert.equal(one(pasv, 'ftp.current-working-directory'), '/home/alice');
  const data = ds.filter((d) => d.columns.protocol === 'FTP-DATA');
  assert.ok(data.length >= 2);
  assert.equal(data[0].columns.info, 'FTP Data: 1460 bytes (PASV) (RETR report.txt)');
  assert.equal(proto(data[0]), 'eth:ethertype:ip:tcp:ftp-data:data-text-lines');
  assert.equal(one(data[0], 'ftp-data.setup-frame'), one(pasv, 'frame.number'));
});

test('SMTP commands, multi-line reply and the DATA message as IMF', () => {
  const file = W.samples.find((x) => x.id === 'smtp-mail').build();
  const { ds } = run(file);
  const ehlo = find(ds, (d) => /^C: EHLO/.test(d.columns.info));
  assert.equal(one(ehlo, 'smtp.req.command'), 'EHLO');
  const multi = find(ds, (d) => /PIPELINING/.test(d.columns.info));
  assert.equal(multi.columns.info, 'S: 250-mail.example.local | PIPELINING | SIZE 10240000 | 8BITMIME | SMTPUTF8');
  assert.equal(one(multi, 'smtp.response.code'), 250);
  assert.equal(val(multi, 'smtp.rsp.parameter').length, 5);
  const msg = find(ds, (d) => d.columns.protocol === 'SMTP/IMF');
  assert.equal(proto(msg), 'eth:ethertype:ip:tcp:smtp:imf:data-text-lines');
  assert.equal(msg.columns.info, 'from: Kim <kim@example.local>, subject: Weekly report,  (text/plain) | .');
  assert.equal(one(msg, 'imf.subject'), 'Weekly report');
  assert.equal(one(msg, 'imf.address'), 'kim@example.local');
});

test('POP, IMAP and Telnet basics', () => {
  const cap = new S.Capture();
  let c = new S.TcpConversation(cap, { ...PC, port: 50010 }, { ...SV, port: 110 });
  c.handshake();
  c.send('s', '+OK ready\r\n'); c.send('c', 'USER kim\r\n');
  c = new S.TcpConversation(cap, { ...PC, port: 50011 }, { ...SV, port: 143 });
  c.handshake();
  c.send('c', 'a1 LOGIN kim pw\r\n'); c.send('s', 'a1 OK done\r\n');
  c = new S.TcpConversation(cap, { ...PC, port: 50012 }, { ...SV, port: 23 });
  c.handshake();
  c.send('s', S.bytes([255, 253, 24, 255, 251, 1], 'login: '));
  const { ds } = run(cap.file());
  const pop = ds.filter((d) => d.columns.protocol === 'POP');
  assert.deepEqual(pop.map((d) => d.columns.info), ['S: +OK ready', 'C: USER kim']);
  assert.equal(one(pop[1], 'pop.request.parameter'), 'kim');
  const imap = ds.filter((d) => d.columns.protocol === 'IMAP');
  assert.equal(imap[0].columns.info, 'Request: a1 LOGIN kim pw');
  assert.equal(one(imap[0], 'imap.request.username'), 'kim');
  assert.equal(one(imap[0], 'imap.response_in'), one(imap[1], 'frame.number'));
  assert.equal(one(imap[1], 'imap.response.status'), 'OK');
  const tn = find(ds, (d) => d.columns.protocol === 'TELNET');
  assert.equal(tn.columns.info, 'Do Terminal Type, Will Echo, 7 bytes data');
  assert.deepEqual(val(tn, 'telnet.cmd'), [253, 251]);
});

test('SSH banner, KEXINIT lists, ECDH and encrypted packets', () => {
  const file = W.samples.find((x) => x.id === 'ssh-session').build();
  const { ds } = run(file);
  const info = ds.filter((d) => d.columns.protocol === 'SSHv2').map((d) => d.columns.info);
  assert.equal(info[0], 'Client: Protocol (SSH-2.0-OpenSSH_9.6)');
  assert.equal(info[2], 'Client: Key Exchange Init');
  assert.equal(info[4], 'Client: Elliptic Curve Diffie-Hellman Key Exchange Init');
  assert.equal(info[5], 'Server: Elliptic Curve Diffie-Hellman Key Exchange Reply, New Keys');
  assert.match(info[7], /^Client: Encrypted packet \(len=\d+\)$/);
  const kex = find(ds, (d) => d.columns.info === 'Client: Key Exchange Init');
  assert.match(one(kex, 'ssh.kex_algorithms'), /^curve25519-sha256,/);
  const rep = find(ds, (d) => /Reply/.test(d.columns.info));
  assert.equal(one(rep, 'ssh.host_key.type'), 'ssh-ed25519');
});

test('every web sample builds, round-trips through pcapng and dissects cleanly', () => {
  for (const sm of W.samples) {
    assert.ok(sm.ko[0] && sm.en[0] && sm.ko[1] && sm.en[1], sm.id);
    const f = sm.build();
    const back = readCapture(writePcapng(f), sm.id + '.pcapng');
    assert.equal(back.frames.length, f.frames.length);
    const { ds } = run(back);
    assert.ok(!ds.some((d) => d.fields.has('_ws.malformed')), sm.id + ' has no malformed frames');
  }
});

test('performance: re-dissecting the HTTP sample is fast', () => {
  const f = W.samples.find((x) => x.id === 'http-page-load').build();
  const s = createSession(f);
  for (const fr of f.frames) s.firstPass(fr);
  const t0 = performance.now();
  let n = 0;
  while (n < 3000) for (const fr of f.frames) { dissect(s, fr); n++; }
  const per = (performance.now() - t0) / n;
  assert.ok(per < 1, `dissect took ${per.toFixed(3)} ms per frame`);
});
