import test from 'node:test';
import assert from 'node:assert/strict';
import { followStream, formatFollow, followSegments, followFilter, followFilterOut, followStats, hexDumpLines, ebcdicToAscii } from '../../src/domain/analysis/follow.js';
import { httpConversation, makeDissector, makeFrame, resetClock, ethIp, tcpSeg, udpDgram, bytes } from './analysis.fixtures.mjs';

const dec = new TextDecoder();

test('follows a TCP stream, drops the retransmission, client = first sender', () => {
  const { frames, summaries, getDissection, req, resp } = httpConversation();
  const r = followStream('tcp', 0, frames, summaries, getDissection);
  assert.equal(r.chunks.length, 2);
  assert.deepEqual(r.chunks.map((c) => [c.dir, c.frame]), [[0, 4], [1, 5]]);
  assert.equal(dec.decode(r.chunks[0].data), req);
  assert.equal(dec.decode(r.chunks[1].data), resp);
  assert.deepEqual([r.client.addr, r.client.port, r.server.addr, r.server.port], ['10.0.0.1', 1234, '10.0.0.2', 80]);
  assert.equal(r.client.bytes, req.length);
  assert.equal(r.server.bytes, resp.length);
  assert.equal(r.client.packets, 4);
  assert.equal(r.server.packets, 3);
  assert.equal(r.filter, 'tcp.stream eq 0');
  assert.equal(r.filterOut, '!(tcp.stream eq 0)');
  assert.equal(r.streams, 1);
  assert.equal(followStats(r).total, req.length + resp.length);
});

test('works without summaries (every frame dissected)', () => {
  const { frames, getDissection } = httpConversation();
  const r = followStream('http', 0, frames, [], getDissection);
  assert.equal(r.chunks.length, 2);
  assert.equal(r.filter, 'tcp.stream eq 0');
});

test('reorders out-of-order segments and trims overlaps', () => {
  resetClock();
  const A = '10.1.1.1', B = '10.1.1.2';
  const pk = [
    ethIp(A, B, 6, tcpSeg(5000, 21, 1000, 0, 0x02)),
    ethIp(A, B, 6, tcpSeg(5000, 21, 1006, 0, 0x18, 'WORLD')),   // arrives before the gap is filled
    ethIp(A, B, 6, tcpSeg(5000, 21, 1001, 0, 0x18, 'HELLO')),
    ethIp(A, B, 6, tcpSeg(5000, 21, 1003, 0, 0x18, 'LLO!!')),   // old bytes 1003-1007: fully trimmed
  ];
  const frames = pk.map((p, i) => makeFrame(i + 1, p));
  const ds = makeDissector();
  frames.forEach(ds.dissect);
  const r = followStream('tcp', 0, frames, ds.summaries, ds.dissect);
  const all = dec.decode(Uint8Array.from(r.chunks.flatMap((c) => [...c.data])));
  assert.equal(all, 'HELLOWORLD');
});

test('follows a UDP stream', () => {
  resetClock();
  const frames = [
    ethIp('192.168.0.5', '8.8.8.8', 17, udpDgram(40000, 53, 'query')),
    ethIp('8.8.8.8', '192.168.0.5', 17, udpDgram(53, 40000, 'answer!')),
    ethIp('192.168.0.5', '8.8.4.4', 17, udpDgram(40001, 53, 'other')),
  ].map((p, i) => makeFrame(i + 1, p));
  const ds = makeDissector();
  frames.forEach(ds.dissect);
  const r = followStream('udp', 0, frames, ds.summaries, ds.dissect);
  assert.deepEqual(r.chunks.map((c) => [c.dir, dec.decode(c.data)]), [[0, 'query'], [1, 'answer!']]);
  assert.equal(r.filter, 'udp.stream eq 0');
  assert.equal(r.streams, 2);
  assert.equal(followStream('udp', 1, frames, ds.summaries, ds.dissect).chunks.length, 1);
});

test('TLS without decrypted data says so', () => {
  const { frames, summaries, getDissection } = httpConversation();
  const r = followStream('tls', 0, frames, summaries, getDissection);
  assert.equal(r.note, 'no-decrypted-data');
  assert.equal(r.chunks.length, 0);
});

test('TLS uses decrypted data sources', () => {
  const { frames, summaries, getDissection } = httpConversation();
  const g = (f) => {
    const d = getDissection(f);
    if (f.no !== 4) return d;
    return { ...d, sources: [...d.sources, { name: 'Decrypted TLS (5 bytes)', data: bytes('plain') }] };
  };
  const r = followStream('tls', 0, frames, summaries, g);
  assert.equal(r.note, null);
  assert.equal(dec.decode(r.chunks[0].data), 'plain');
});

test('stream filters for every kind', () => {
  assert.equal(followFilter('tcp', 3), 'tcp.stream eq 3');
  assert.equal(followFilter('udp', 2), 'udp.stream eq 2');
  assert.equal(followFilter('http2', 1, 5), 'tcp.stream eq 1 and http2.streamid eq 5');
  assert.equal(followFilter('quic', 0, 4), 'quic.connection.number eq 0 and quic.stream.stream_id eq 4');
  assert.equal(followFilterOut('tls', 7), '!(tcp.stream eq 7)');
  assert.throws(() => followStream('sctp', 0, [], [], () => null));
});

// Expected texts below were produced by tshark 4.6 (-q -z follow,tcp,<mode>,0) on the same conversation.
test('tshark-style output matches tshark', () => {
  const { frames, summaries, getDissection } = httpConversation();
  const r = followStream('tcp', 0, frames, summaries, getDissection);
  const ascii = formatFollow(r, 'ascii', { style: 'tshark' });
  assert.ok(ascii.startsWith('\n===================================================================\nFollow: tcp,ascii\nFilter: tcp.stream eq 0\nNode 0: 10.0.0.1:1234\nNode 1: 10.0.0.2:80\n'));
  assert.ok(ascii.includes(`${r.chunks[0].data.length}\nGET /dir/a.txt?x=1 HTTP/1.1\r\n`));
  assert.ok(ascii.includes(`\t${r.chunks[1].data.length}\nHTTP/1.1 200 OK`));
  assert.ok(ascii.endsWith('hello\n===================================================================\n'));
  const hex = formatFollow(r, 'hexdump', { style: 'tshark' }).split('\n');
  assert.equal(hex[6], '00000000  47 45 54 20 2f 64 69 72  2f 61 2e 74 78 74 3f 78  GET /dir /a.txt?x');
  const lastServer = hex.filter((l) => l.startsWith('\t')).pop();
  assert.equal(lastServer, '\t00000050  65 6c 6c 6f                                       ello');
  const raw = formatFollow(r, 'raw', { style: 'tshark' }).split('\n');
  assert.equal(raw[6].slice(0, 8), '47455420');
  assert.ok(raw[7].startsWith('\t48545450'));
});

test('Follow dialog modes', () => {
  const { frames, summaries, getDissection } = httpConversation();
  const r = followStream('tcp', 0, frames, summaries, getDissection);
  const gui = formatFollow(r, 'hexdump');
  assert.ok(gui.split('\n').some((l) => l.startsWith('    00000000  48 54 54 50')), 'server side indented 4 spaces');
  const c = formatFollow(r, 'carrays');
  assert.ok(c.startsWith('char peer0_0[] = { /* Packet 4 */\n0x47, 0x45, 0x54, 0x20, 0x2f, 0x64, 0x69, 0x72, \n'));
  assert.ok(c.includes('char peer1_0[] = { /* Packet 5 */'));
  assert.ok(/0x6f };\n$/.test(c));
  const y = formatFollow(r, 'yaml', { frames: new Map(frames.map((f) => [f.no, f])) });
  assert.ok(y.startsWith('peers:\n  - peer: 0\n    host: 10.0.0.1\n    port: 1234\n  - peer: 1\n    host: 10.0.0.2\n    port: 80\npackets:\n  - packet: 4\n    peer: 0\n    timestamp: '));
  assert.ok(y.includes('data: !!binary |\n      R0VUIC9kaXIv'));
  for (const line of y.split('\n').filter((l) => l.startsWith('      '))) assert.ok(line.length <= 82);
  assert.equal(formatFollow(r, 'ascii', { dir: 1 }), dec.decode(r.chunks[1].data));
  assert.equal(formatFollow(r, 'utf8', { dir: 0 }), dec.decode(r.chunks[0].data));
  assert.equal(followSegments(r, 'raw').length, 2);
  assert.throws(() => formatFollow(r, 'nope'));
});

test('ASCII view replaces non-printables, EBCDIC translates', () => {
  const r = { kind: 'tcp', chunks: [{ dir: 0, frame: 1, data: Uint8Array.from([0x41, 0x00, 0x0a, 0xff]) }], client: { addr: 'a', port: 1 }, server: { addr: 'b', port: 2 } };
  assert.equal(formatFollow(r, 'ascii'), 'A.\n.');
  assert.equal(dec.decode(ebcdicToAscii(Uint8Array.from([0xc8, 0x85, 0x93, 0x93, 0x96, 0x40, 0xf1]))), 'Hello 1');
  assert.deepEqual(hexDumpLines(bytes('hello'), 0x40), ['00000040  68 65 6c 6c 6f                                    hello']);
});

// ───────────────────────── real samples (skipped until the dissectors and samples/ exist)

import { execFileSync } from 'node:child_process';
import { loadRealSamples, TSHARK } from './analysis.fixtures.mjs';

const real = await loadRealSamples();

test('real samples: follow every TCP/UDP stream without errors', { skip: !real.length && 'no samples/dissectors yet' }, () => {
  for (const s of real) {
    for (const kind of ['tcp', 'udp']) {
      const n = Math.min(followStream(kind, 0, s.frames, s.summaries, s.getDissection).streams, 20);
      for (let i = 0; i < n; i++) {
        const r = followStream(kind, i, s.frames, s.summaries, s.getDissection);
        for (const c of r.chunks) assert.equal(kind === 'tcp' ? s.summaries[c.frame - 1].tcpStream : s.summaries[c.frame - 1].udpStream, i, `${s.name} ${kind} ${i} frame ${c.frame}`);
        for (const m of ['ascii', 'hexdump', 'carrays', 'raw', 'yaml', 'utf8', 'ebcdic']) formatFollow(r, m);
      }
    }
  }
});

// tshark's follow output is the reference: raw hex of each stream must be identical.
test('real samples: TCP/UDP follow (raw, hex) equals tshark', { skip: (!real.length && 'no samples yet') || (!TSHARK && 'tshark not installed') }, (t) => {
  const diffs = [];
  let compared = 0;
  for (const s of real) {
    for (const kind of ['tcp', 'udp']) {
      const n = Math.min(followStream(kind, 0, s.frames, s.summaries, s.getDissection).streams, 8);
      for (let i = 0; i < n; i++) {
        const r = followStream(kind, i, s.frames, s.summaries, s.getDissection);
        for (const [mode, tm] of [['raw', 'raw'], ['hexdump', 'hex']]) {
          const ts = execFileSync(TSHARK, ['-r', s.path, '-q', '-z', `follow,${kind},${tm},${i}`], { maxBuffer: 1 << 28 }).toString().replace(/\r\n/g, '\n');
          const ours = formatFollow(r, mode, { style: 'tshark' });
          // Node lines may differ in name resolution / bracket style; compare the data lines only
          const body = (x) => x.split('\n').filter((l) => !/^(=+|Follow:|Filter:|Node [01]:)/.test(l)).join('\n').trim();
          compared++;
          if (body(ts) !== body(ours)) diffs.push(`${s.name} ${kind} ${i} ${mode}`);
        }
      }
    }
  }
  t.diagnostic(`compared ${compared} stream outputs, ${diffs.length} differ${diffs.length ? ': ' + diffs.join('; ') : ''}`);
  assert.deepEqual(diffs, []);
});
