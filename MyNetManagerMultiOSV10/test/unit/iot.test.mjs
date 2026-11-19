// MQTT, Modbus/TCP, CoAP, NBSS/SMB2 dissection tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSession, dissect } from '../../src/domain/dissect/index.js';
import { Capture, udpFrame, TcpConversation, bytes, be16, te, le16 } from '../../src/domain/capture/synth.js';
import { samples, mqtt, mqttPacket, mbap, coapMessage, smb2, smb2Body, nbss } from '../../src/domain/capture/build/voip.js';

function run(file) {
  const s = createSession(file, { resolve: { mac: false, transport: false } });
  const sums = file.frames.map((f) => s.firstPass(f));
  return { s, sums, d: (n) => dissect(s, file.frames[n - 1]) };
}
const val = (d, f) => (d.fields.get(f) || []).map((n) => n.value);
const one = (d, f) => val(d, f)[0];
const conv = (cap, sport, dport, mss) => new TcpConversation(cap,
  { mac: 'a4:83:e7:12:34:56', ip: '192.168.0.20', port: sport }, { mac: '00:11:32:aa:bb:cc', ip: '192.168.0.10', port: dport }, { rtt: 0.002, mss });
const byInfo = (sums, re) => sums.filter((x) => re.test(x.info));

test('MQTT 3.1.1 connect, subscribe, publish, ack', () => {
  const cap = new Capture();
  const c = conv(cap, 40000, 1883);
  c.handshake();
  c.send('c', mqtt.connect('dev1', 45));
  c.send('s', mqtt.connack(0));
  c.send('c', mqtt.subscribe(3, 'a/+', 1));
  c.send('s', mqtt.suback(3, 1));
  c.send('c', mqtt.publish('a/b', 'hi', 1, 4));
  c.send('s', mqtt.puback(4));
  c.send('c', mqtt.pingreq());
  c.send('c', mqtt.disconnect());
  const { sums, d, s } = run(cap.file());
  assert.equal(s.bugs.length, 0);
  const infos = sums.filter((x) => x.protocol === 'MQTT').map((x) => x.info);
  assert.deepEqual(infos, ['Connect Command', 'Connect Ack', 'Subscribe Request (id=3) [a/+]', 'Subscribe Ack (id=3)',
    'Publish Message (id=4) [a/b]', 'Publish Ack (id=4)', 'Ping Request', 'Disconnect Req']);
  const n = sums.findIndex((x) => x.info === 'Connect Command') + 1;
  const x = d(n);
  assert.equal(one(x, 'mqtt.clientid'), 'dev1');
  assert.equal(one(x, 'mqtt.kalive'), 45);
  assert.equal(one(x, 'mqtt.ver'), 4);
  assert.equal(one(x, 'mqtt.conflag.cleansess'), true);
  const p = d(sums.findIndex((y) => y.info.startsWith('Publish Message')) + 1);
  assert.equal(one(p, 'mqtt.topic'), 'a/b');
  assert.equal(one(p, 'mqtt.qos'), 1);
  assert.equal(one(p, 'mqtt.msgid'), 4);
  assert.deepEqual([...one(p, 'mqtt.msg')], [...te('hi')]);
  assert.equal(one(p, 'mqtt.len'), 9n);
});

test('MQTT 5 properties, several messages per segment and reassembly', () => {
  const cap = new Capture();
  const c = conv(cap, 40001, 1883);
  c.handshake();
  const str = (s) => bytes(be16(s.length), te(s));
  c.send('c', mqttPacket(1, 0, bytes(str('MQTT'), Uint8Array.of(5, 0x02), be16(30), Uint8Array.of(5, 0x11, 0, 0, 0, 60), str('v5'))));
  c.send('s', bytes(mqttPacket(2, 0, Uint8Array.of(0, 0, 0)), mqtt.pingresp()));
  // v5 PUBLISH carries a (here empty) property block after the topic
  c.send('c', mqttPacket(3, 0, bytes(str('big'), Uint8Array.of(0), te('x'.repeat(3000)))));
  const { sums, d } = run(cap.file());
  const ci = sums.findIndex((x) => x.info === 'Connect Command') + 1;
  const x = d(ci);
  assert.equal(one(x, 'mqtt.ver'), 5);
  assert.equal(one(x, 'mqtt.property_id'), 0x11);
  assert.equal(one(x, 'mqtt.prop_number'), 60);
  assert.ok(sums.some((y) => y.info === 'Connect Ack, Ping Response'));
  const big = byInfo(sums, /^Publish Message \[big\]$/);
  assert.equal(big.length, 1);
  const bd = d(big[0].no);
  assert.equal(one(bd, 'mqtt.msg').length, 3000);
  assert.ok(bd.sources.length > 1);
});

test('Modbus/TCP request/response pairing, registers, bits and exception', () => {
  const cap = new Capture();
  const c = conv(cap, 50000, 502);
  c.handshake();
  c.send('c', mbap(1, 1, Uint8Array.of(3, 0, 10, 0, 2)));
  c.send('s', mbap(1, 1, Uint8Array.of(3, 4, 0, 7, 1, 0)));
  c.send('c', mbap(2, 1, Uint8Array.of(1, 0, 0, 0, 4)));
  c.send('s', mbap(2, 1, Uint8Array.of(1, 1, 0b0101)));
  c.send('c', mbap(3, 1, Uint8Array.of(6, 0, 5, 0, 9)));
  c.send('s', mbap(3, 1, Uint8Array.of(0x86, 2)));
  const { sums, d } = run(cap.file());
  const mb = sums.filter((x) => x.protocol === 'Modbus/TCP');
  assert.equal(mb[0].info, '   Query: Trans:     1; Unit:   1, Func:   3: Read Holding Registers');
  assert.equal(mb[1].info, 'Response: Trans:     1; Unit:   1, Func:   3: Read Holding Registers');
  assert.equal(mb[5].info, 'Response: Trans:     3; Unit:   1, Func:   6: Write Single Register. Exception returned ');
  assert.equal(mb[0].layers, 'eth:ethertype:ip:tcp:mbtcp:modbus');
  const r = d(mb[1].no);
  assert.equal(one(r, 'modbus.request_frame'), mb[0].no);
  assert.deepEqual(val(r, 'modbus.regnum16'), [10, 11]);
  assert.deepEqual(val(r, 'modbus.regval_uint16'), [7, 256]);
  const bits = d(mb[3].no);
  assert.deepEqual(val(bits, 'modbus.bitval'), [true, false, true, false]);
  const ex = d(mb[5].no);
  assert.equal(one(ex, 'modbus.exception'), true);
  assert.equal(one(ex, 'modbus.exception_code'), 2);
});

test('CoAP request/response, options, payload as text lines', () => {
  const cap = new Capture();
  const C = { srcMac: 'a4:83:e7:12:34:56', dstMac: '24:0a:c4:aa:bb:01', src: '192.168.0.10', dst: '192.168.0.42' };
  const R = { srcMac: C.dstMac, dstMac: C.srcMac, src: C.dst, dst: C.src };
  cap.add(udpFrame({ ...C, sport: 40000, dport: 5683 }, coapMessage({ code: 1, mid: 100, token: Uint8Array.of(0xab), options: [[11, 'sensors'], [11, 'temp'], [15, 'u=c']] })));
  cap.add(udpFrame({ ...R, sport: 5683, dport: 40000 }, coapMessage({ type: 2, code: 69, mid: 100, token: Uint8Array.of(0xab), options: [[12, Uint8Array.of(0)]], payload: '21.5' })), { dt: 0.01 });
  cap.add(udpFrame({ ...C, sport: 40000, dport: 5683 }, coapMessage({ type: 2, code: 0, mid: 7 })), { dt: 0.01 });
  const { sums, d } = run(cap.file());
  assert.equal(sums[0].info, 'CON, MID:100, GET, TKN:ab, /sensors/temp');
  assert.equal(sums[1].info, 'ACK, MID:100, 2.05 Content, TKN:ab, /sensors/temp (text/plain)');
  assert.equal(sums[1].layers, 'eth:ethertype:ip:udp:coap:data-text-lines');
  assert.equal(sums[2].info, 'ACK, MID:7, Empty Message');
  const q = d(1);
  assert.deepEqual(val(q, 'coap.opt.uri_path'), ['sensors', 'temp']);
  assert.equal(one(q, 'coap.opt.uri_query'), 'u=c');
  assert.equal(one(q, 'coap.response_in'), 2);
  const r = d(2);
  assert.equal(one(r, 'coap.response_to'), 1);
  assert.ok(Math.abs(one(r, 'coap.response_time') - 0.01) < 1e-6);
  assert.equal(one(r, 'coap.opt.ctype'), 'text/plain; charset=utf-8');
  assert.equal(one(r, 'coap.payload_length'), 4);
});

test('CoAP bad option length is flagged without throwing', () => {
  const cap = new Capture();
  cap.add(udpFrame({ srcMac: 'a4:83:e7:12:34:56', dstMac: '24:0a:c4:aa:bb:01', src: '192.168.0.10', dst: '192.168.0.42', sport: 1, dport: 5683 }, Uint8Array.of(0x40, 1, 0, 1, 0xbf, 1)));
  const { sums, s, d } = run(cap.file());
  assert.equal(sums[0].protocol, 'CoAP');
  assert.equal(s.bugs.length, 0);
  assert.equal(d(1).expert.some((e) => e.abbrev === 'coap.option_length_bad'), true);
});

test('NBSS + SMB2: tree and file names follow the session', () => {
  const cap = new Capture();
  const c = conv(cap, 50110, 445);
  c.handshake();
  const fid = new Uint8Array(16).fill(0x42);
  const x = (cmd, m, req, resp, status = 0) => {
    c.send('c', smb2({ cmd, msgId: m, sessId: 5n, treeId: 1 }, req));
    c.send('s', smb2({ cmd, response: true, status, msgId: m, sessId: 5n, treeId: 1 }, resp));
  };
  x(0, 0, smb2Body.negotiateReq(), smb2Body.negotiateResp());
  x(3, 1, smb2Body.treeConnectReq('\\\\srv\\data'), smb2Body.treeConnectResp());
  x(5, 2, smb2Body.createReq('a.txt'), smb2Body.createResp(fid));
  x(8, 3, smb2Body.readReq(fid, 100), smb2Body.readResp(te('abc')));
  x(5, 4, smb2Body.createReq('nope.txt'), smb2Body.error(), 0xc0000034);
  const { sums, d, s } = run(cap.file());
  assert.equal(s.bugs.length, 0);
  const smb = sums.filter((y) => y.protocol === 'SMB2').map((y) => y.info);
  assert.deepEqual(smb, ['Negotiate Protocol Request', 'Negotiate Protocol Response', "Tree Connect Request, Tree: '\\\\srv\\data'",
    "Tree Connect Response, Tree: '\\\\srv\\data'", 'Create Request, File: a.txt', 'Create Response, File: a.txt',
    'Read Request Len:100 Off:0, File: a.txt', 'Read Response, File: a.txt', 'Create Request, File: nope.txt',
    'Create Response, Error: STATUS_OBJECT_NAME_NOT_FOUND']);
  const neg = sums.find((y) => y.info === 'Negotiate Protocol Request');
  assert.equal(neg.layers, 'eth:ethertype:ip:tcp:nbss:smb2');
  const rr = sums.find((y) => y.info === 'Read Response, File: a.txt');
  assert.equal(rr.layers, 'eth:ethertype:ip:tcp:nbss:smb2:data');
  const nd = d(neg.no);
  assert.equal(one(nd, 'smb2.cmd'), 0);
  assert.deepEqual(val(nd, 'smb2.dialect'), [0x0202, 0x0210]);
  assert.ok(one(nd, 'smb2.response_in') > neg.no);
  const err = d(sums.find((y) => y.info.includes('Error')).no);
  assert.equal(one(err, 'smb2.nt_status'), 0xc0000034);
  assert.equal(one(err, 'smb2.flags.response'), true);
});

test('NBSS session request and truncated SMB2 header', () => {
  const cap = new Capture();
  const c = conv(cap, 50120, 139);
  c.handshake();
  c.send('c', bytes(Uint8Array.of(0x81, 0), be16(4), Uint8Array.of(1, 2, 3, 4)));
  c.send('c', nbss(bytes(Uint8Array.of(0xfe, 0x53, 0x4d, 0x42), le16(64), new Uint8Array(10))));
  const { sums, s } = run(cap.file());
  assert.ok(sums.some((y) => y.info === 'Session request'));
  assert.ok(sums.some((y) => y.layers.endsWith('smb2') && y.info.includes('[Malformed Packet]')));
  assert.equal(s.bugs.length, 0);
});

test('IoT and SMB sample captures decode without errors', () => {
  for (const id of ['mqtt-iot', 'modbus-tcp', 'coap', 'smb2-file-share']) {
    const sm = samples.find((x) => x.id === id);
    assert.ok(sm && sm.ko.length === 2 && sm.en.length === 2 && sm.group, id);
    const file = sm.build();
    const { s, sums } = run(file);
    assert.equal(s.bugs.length, 0, id);
    assert.ok(!sums.some((x) => x.info.includes('[Malformed Packet]')), id);
    assert.ok(file.frames.length > 10, id);
  }
});

test('performance: re-dissecting the samples is fast', () => {
  const files = samples.map((x) => x.build());
  const t0 = performance.now();
  let n = 0;
  for (let k = 0; k < 20; k++) {
    for (const f of files) {
      const s = createSession(f);
      for (const fr of f.frames) { s.firstPass(fr); dissect(s, fr); n++; }
    }
  }
  const ms = performance.now() - t0;
  assert.ok(ms / n < 0.5, `${(ms / n).toFixed(3)} ms per frame`);
});
