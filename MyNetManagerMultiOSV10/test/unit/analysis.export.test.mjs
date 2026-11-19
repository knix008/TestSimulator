import test from 'node:test';
import assert from 'node:assert/strict';
import {
  exportText, exportCsv, exportJson, jsonLayers, exportPdml, exportPsml, exportCArrays, exportObjects,
  exportPacketBytes, exportSpecified, selectFrames, rangeCounts, hexDump, showValue,
} from '../../src/domain/analysis/export.js';
import { httpConversation, makeDissector, makeFrame, resetClock, ethIp, udpDgram } from './analysis.fixtures.mjs';

const dec = new TextDecoder();

test('plain text: summary only = header + one row per packet', () => {
  const { frames, summaries, getDissection } = httpConversation();
  const t = exportText(frames, summaries, getDissection, { details: 'none' }).split('\n');
  assert.equal(t[0], 'No.     Time           Source                Destination           Protocol Length Info');
  assert.equal(t[1], '      1 0.000000       10.0.0.1              10.0.0.2              TCP      54     1234 → 80 Len=0');
  assert.equal(t.length, frames.length + 2);
});

test('plain text: expanded details, generated in brackets, hidden skipped, bytes', () => {
  const { frames, summaries, getDissection } = httpConversation();
  const t = exportText(frames.slice(3, 4), summaries.slice(3, 4), getDissection, { details: 'expanded', bytes: true });
  const lines = t.split('\n');
  assert.ok(lines[0].startsWith('No.'));
  assert.ok(lines[1].includes('GET /dir/a.txt?x=1 HTTP/1.1'));
  assert.equal(lines[2], '');
  assert.ok(lines[3].startsWith('Frame 4: '));
  assert.ok(lines.includes('    Frame Number: 4'));
  assert.ok(lines.includes('    [Time since reference or first frame: 0.000000000 seconds]'));
  assert.ok(!lines.some((l) => l.includes('Address: 00:aa')), 'hidden eth.addr not printed');
  assert.ok(lines.includes('        .... .... ..0. = Syn: Not set'));
  assert.ok(lines.includes('0000  00 aa bb cc dd ee 00 11 22 33 44 55 08 00 45 00   ........"3DU..E.'));
});

test('plain text: collapsed and "as displayed"', () => {
  const { frames, summaries, getDissection } = httpConversation();
  const one = [frames[0]];
  const col = exportText(one, summaries, getDissection, { details: 'collapsed', summary: false }).split('\n').filter(Boolean);
  assert.deepEqual(col.map((l) => l.split(':')[0].split(',')[0]), ['Frame 1', 'Ethernet II', 'Internet Protocol Version 4', 'Transmission Control Protocol']);
  const disp = exportText(one, summaries, getDissection, { details: 'displayed', summary: false, expanded: (n) => n.abbrev === 'tcp' }).split('\n');
  assert.ok(disp.includes('    Source Port: 1234'));
  assert.ok(!disp.includes('    Frame Number: 1'));
});

test('CSV quotes every cell and doubles quotes', () => {
  const { frames, summaries, getDissection } = httpConversation();
  const s = summaries.map((x) => ({ ...x }));
  s[0].info = 'say "hi", ok';
  const csv = exportCsv(frames, s, getDissection).split('\n');
  assert.equal(csv[0], '"No.","Time","Source","Destination","Protocol","Length","Info"');
  assert.equal(csv[1], '"1","0.000000","10.0.0.1","10.0.0.2","TCP","54","say ""hi"", ok"');
  const custom = exportCsv(frames, s, getDissection, { columns: [{ id: 'no', title: 'No.' }, { field: 'ip.ttl', title: 'TTL' }] }).split('\n');
  assert.equal(custom[1], '"1","64"');
  assert.equal(exportCsv(frames, s, getDissection, { only: [2, 3] }).trim().split('\n').length, 3);
});

test('JSON: tshark -T json shape, _tree children, duplicate keys become arrays', () => {
  const { frames, getDissection } = httpConversation();
  const arr = exportJson(frames, getDissection, { asObject: true });
  assert.equal(arr.length, frames.length);
  assert.ok(/^packets-\d{4}-\d\d-\d\d$/.test(arr[0]._index));
  assert.equal(arr[0]._score, null);
  const L = arr[0]._source.layers;
  assert.deepEqual(Object.keys(L), ['frame', 'eth', 'ip', 'tcp']);
  assert.equal(L.frame['frame.number'], '1');
  assert.equal(L.frame['frame.time_relative'], '0.000000000');
  assert.equal(L.eth['eth.type'], '0x0800', 'hex shown like tshark');
  assert.equal(L.eth['eth.dst_tree']['eth.addr'], '00:aa:bb:cc:dd:ee', 'hidden fields included');
  assert.equal(L.tcp['tcp.flags_tree']['tcp.flags.syn'], '1');
  assert.equal(L.ip['ip.src'], '10.0.0.1');
  const http = arr[3]._source.layers.http;
  assert.equal(http['http.request.method'], 'GET');
  // duplicates
  const d = getDissection(frames[0]);
  const dup = { ...d, tree: [...d.tree, d.tree[2]] };
  const layers = jsonLayers(dup);
  assert.ok(Array.isArray(layers.ip) && layers.ip.length === 2);
  const text = exportJson(frames.slice(0, 1), getDissection);
  assert.ok(text.startsWith('[\n  {\n    "_index": "packets-'));
  assert.ok(exportJson(frames, getDissection, { legacyType: true, asObject: true })[0]._type === 'doc');
  assert.deepEqual(Object.keys(exportJson(frames, getDissection, { asObject: true, protocols: ['tcp'] })[0]._source.layers), ['tcp']);
});

test('showValue renders types like tshark', () => {
  const fields = new Map([['ip.id', { base: 'hex', bits: 16 }]]);
  assert.equal(showValue({ abbrev: 'ip.id', type: 'uint', value: 0, label: 'Identification: 0x0000 (0)' }, fields), '0x0000');
  assert.equal(showValue({ abbrev: 'ip.id', type: 'uint', value: 0, label: 'Identification: 0x0000 (0)' }), '0x0000');
  assert.equal(showValue({ abbrev: 'x', type: 'uint', value: 80, label: 'Port: 80 (0x50)' }), '80');
  assert.equal(showValue({ type: 'bool', value: true }, null, 'pdml'), 'True');
  assert.equal(showValue({ type: 'bytes', value: Uint8Array.from([1, 0xab]) }), '01:ab');
  assert.equal(showValue({ type: 'abs_time', value: { sec: 1700000000, nsec: 5 } }), '2023-11-14T22:13:20.000000005Z');
  assert.equal(showValue({ type: 'rel_time', value: 1.5 }), '1.500000000');
});

test('PDML and PSML', () => {
  const { frames, summaries, getDissection } = httpConversation();
  const x = exportPdml(frames.slice(0, 1), getDissection, { fileName: 'a.pcapng', time: 'T' });
  assert.ok(x.startsWith('<?xml version="1.0" encoding="utf-8"?>\n<?xml-stylesheet type="text/xsl" href="pdml2html.xsl"?>\n<pdml version="0" creator="wireshark/4.6.0" time="T" capture_file="a.pcapng">\n<packet>\n  <proto name="geninfo" pos="0" showname="General information" size="54">'));
  assert.ok(x.includes('<proto name="tcp" showname="Transmission Control Protocol, Src Port: 1234, Dst Port: 80, Len: 0" size="20" pos="34">'));
  assert.ok(x.includes('<field name="tcp.srcport" showname="Source Port: 1234" size="2" pos="34" show="1234" value="04d2"/>'));
  assert.ok(x.includes('<field name="eth.addr" showname="Address: 00:aa:bb:cc:dd:ee" hide="yes" size="6" pos="0" show="00:aa:bb:cc:dd:ee" value="00aabbccddee"/>'));
  assert.ok(x.includes('show="True"'), 'booleans as True/False');
  assert.ok(x.trim().endsWith('</pdml>'));
  const p = exportPsml(frames.slice(0, 1), summaries, getDissection);
  assert.equal(p, '<?xml version="1.0" encoding="utf-8"?>\n<psml version="0" creator="wireshark/4.6.0">\n<structure>\n<section>No.</section>\n<section>Time</section>\n<section>Source</section>\n<section>Destination</section>\n<section>Protocol</section>\n<section>Length</section>\n<section>Info</section>\n</structure>\n\n<packet>\n<section>1</section>\n<section>0.000000</section>\n<section>10.0.0.1</section>\n<section>10.0.0.2</section>\n<section>TCP</section>\n<section>54</section>\n<section>1234 → 80 Len=0</section>\n</packet>\n\n</psml>\n');
});

test('C arrays', () => {
  const { frames, getDissection } = httpConversation();
  const c = exportCArrays(frames.slice(0, 1), getDissection).split('\n');
  assert.equal(c[0], '/* Frame (54 bytes) */');
  assert.equal(c[1], 'static const unsigned char pkt1[54] = {');
  assert.equal(c[2], '0x00, 0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0x00, 0x11, /* ........ */');
  assert.equal(c[8], '0xff, 0xff, 0x00, 0x00, 0x00, 0x00 /* ...... */');
  assert.equal(c[9], '};');
  const extra = exportCArrays(frames.slice(3, 4), (f) => ({ ...getDissection(f), sources: [...getDissection(f).sources, { name: 'Reassembled TCP (3 bytes)', data: Uint8Array.from([1, 2, 3]) }] }));
  assert.ok(extra.includes('/* Reassembled TCP (3 bytes) */\nstatic const unsigned char pkt4_1[3] = {\n0x01, 0x02, 0x03 /* ... */\n};'));
});

test('hex dump of packet bytes', () => {
  assert.equal(hexDump(new TextEncoder().encode(' x\r\n\r\n')), '0000  20 78 0d 0a 0d 0a                                  x....');
});

test('export objects: HTTP', () => {
  const { frames, summaries, getDissection } = httpConversation();
  const objs = exportObjects('http', frames, summaries, getDissection);
  assert.equal(objs.length, 2, 'response and its retransmission (Wireshark lists each response frame)');
  assert.deepEqual({ ...objs[0], data: dec.decode(objs[0].data) }, { frame: 5, hostname: 'example.com', contentType: 'text/plain', size: 5, filename: 'a.txt?x=1', data: 'hello' });
  assert.deepEqual(exportObjects('smb', frames, summaries, getDissection), []);
  assert.throws(() => exportObjects('foo', frames, summaries, getDissection));
});

test('export objects: TFTP transfer reassembled from blocks', () => {
  resetClock();
  const C = '10.0.0.9', S = '10.0.0.1';
  const block = (n, s) => udpDgram(3000, 40001, Uint8Array.from([0, 3, 0, n, ...new TextEncoder().encode(s)]));
  const pk = [
    ethIp(C, S, 17, udpDgram(40001, 69, Uint8Array.from([0, 1, ...new TextEncoder().encode('boot.cfg'), 0, ...new TextEncoder().encode('octet'), 0]))),
    ethIp(S, C, 17, block(1, 'abc')),
    ethIp(C, S, 17, udpDgram(40001, 3000, Uint8Array.from([0, 4, 0, 1]))),
    ethIp(S, C, 17, block(2, 'de')),
  ];
  const frames = pk.map((p, i) => makeFrame(i + 1, p));
  const ds = makeDissector();
  frames.forEach(ds.dissect);
  const objs = exportObjects('tftp', frames, ds.summaries, ds.dissect);
  assert.equal(objs.length, 1);
  assert.equal(objs[0].filename, 'boot.cfg');
  assert.equal(objs[0].hostname, S);
  assert.equal(dec.decode(objs[0].data), 'abcde');
  assert.equal(objs[0].frame, 4);
});

test('export packet bytes', () => {
  const { frames, getDissection } = httpConversation();
  const d = getDissection(frames[3]);
  assert.equal(exportPacketBytes(d).length, frames[3].caplen);
  const uri = d.fields.get('http.request.uri')[0];
  assert.equal(dec.decode(exportPacketBytes(d, uri)), '/dir/a.txt?x=1');
});

test('export specified packets: ranges, displayed, marked, ignored, renumbering', () => {
  const frames = Array.from({ length: 10 }, (_, i) => ({ no: i + 1, data: new Uint8Array(1) }));
  const file = { format: 'pcapng', name: 'x', interfaces: [{ name: 'eth0' }], frames, section: {} };
  const ids = (o) => selectFrames(frames, o).map((f) => f.no);
  assert.deepEqual(ids({ range: 'all' }).length, 10);
  assert.deepEqual(ids({ range: 'displayed', displayed: [2, 4, 6] }), [2, 4, 6]);
  assert.deepEqual(ids({ range: 'range', rangeText: '1-3,9-', which: 'displayed', displayed: new Set([2, 3, 9]) }), [2, 3, 9]);
  assert.deepEqual(ids({ range: 'selected', selected: 5 }), [5]);
  assert.deepEqual(ids({ range: 'marked', marked: [7, 3] }), [3, 7]);
  assert.deepEqual(ids({ range: 'first-last', marked: [7, 3] }), [3, 4, 5, 6, 7]);
  assert.deepEqual(ids({ range: 'all', ignored: [1, 2], removeIgnored: true }).length, 8);
  assert.throws(() => selectFrames(frames, { range: 'range', rangeText: 'a' }), /not a valid range/);
  const out = exportSpecified(file, frames, { range: 'range', rangeText: '4-5' });
  assert.deepEqual(out.frames.map((f) => [f.no, f.origNo]), [[1, 4], [2, 5]]);
  assert.equal(out.interfaces, file.interfaces);
  assert.equal(frames[3].no, 4, 'input frames untouched');
  const counts = rangeCounts(frames, { displayed: [1, 2], marked: [5], selected: 1 });
  assert.equal(counts.captured.all, 10);
  assert.equal(counts.displayed.all, 2);
  assert.equal(counts.displayed.marked, 0);
});

// ───────────────────────── real samples (skipped until the dissectors and samples/ exist)

import { execFileSync } from 'node:child_process';
import { loadRealSamples, TSHARK } from './analysis.fixtures.mjs';

const real = await loadRealSamples();

test('real samples: every export runs and is well formed', { skip: !real.length && 'no samples/dissectors yet' }, () => {
  for (const s of real) {
    const { frames, summaries, getDissection } = s;
    const txt = exportText(frames, summaries, getDissection, { details: 'expanded', bytes: true });
    assert.ok(txt.length > 0);
    assert.equal(exportCsv(frames, summaries, getDissection).trim().split('\n').length, frames.length + 1);
    const json = JSON.parse(exportJson(frames, getDissection, { fields: s.FIELDS }));
    assert.equal(json.length, frames.length);
    const pdml = exportPdml(frames, getDissection, { fields: s.FIELDS });
    assert.equal(pdml.split('<packet>').length - 1, frames.length);
    assert.equal((pdml.match(/<proto /g) || []).length >= frames.length, true);
    assert.equal(exportPsml(frames, summaries, getDissection).split('<packet>').length - 1, frames.length);
    assert.equal(exportCArrays(frames, getDissection).split('static const unsigned char pkt').length - 1 >= frames.length, true);
    for (const k of ['http', 'tftp', 'imf']) for (const o of exportObjects(k, frames, summaries, getDissection)) assert.equal(o.size, o.data.length);
  }
});

// Compare the layer keys of our JSON with tshark -T json, packet by packet (differences = dissector coverage).
test('real samples: JSON layers vs tshark -T json', { skip: (!real.length && 'no samples yet') || (!TSHARK && 'tshark not installed') }, (t) => {
  let packets = 0, same = 0;
  const diff = new Map();
  for (const s of real.slice(0, 12)) {
    const ts = JSON.parse(execFileSync(TSHARK, ['-r', s.path, '-T', 'json', '--no-duplicate-keys'], { maxBuffer: 1 << 29 }).toString());
    const ours = exportJson(s.frames, s.getDissection, { fields: s.FIELDS, asObject: true });
    ts.forEach((p, i) => {
      packets++;
      const a = Object.keys(p._source.layers).join(',');
      const b = Object.keys(ours[i]?._source.layers || {}).join(',');
      if (a === b) same++;
      else { const k = `${b} ≠ tshark ${a}`; diff.set(k, (diff.get(k) || 0) + 1); }
    });
    // field values that both sides have, on the first packet's eth/ip layers
    const L0 = ts[0]?._source.layers, O0 = ours[0]?._source.layers;
    for (const layer of ['eth', 'ip', 'tcp', 'udp']) {
      if (!L0?.[layer] || !O0?.[layer]) continue;
      for (const [k, v] of Object.entries(L0[layer])) {
        if (typeof v !== 'string' || !(k in O0[layer]) || typeof O0[layer][k] !== 'string') continue;
        if (O0[layer][k] !== v) { const key = `${s.name}: ${k} = ${O0[layer][k]} (tshark ${v})`; diff.set(key, 1); }
      }
    }
  }
  t.diagnostic(`${same}/${packets} packets have tshark's layer list`);
  for (const [k, n] of [...diff].slice(0, 40)) t.diagnostic(`${n}× ${k}`);
  assert.ok(packets > 0);
});
