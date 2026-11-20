// Show Packet Bytes (src/packet-bytes.js), Packet Diagram (src/packet-diagram.js) and display filter
// macros (src/domain/filter/index.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { SAMPLES } from '../../src/domain/capture/samples.js';
import { CaptureDoc } from '../../src/domain/capture/doc.js';
import { compileFilter, expandMacros, parseMacroLines, setFilterMacros } from '../../src/domain/filter/index.js';
import { decodeBytes, packetBytesView, showBytes } from '../../src/packet-bytes.js';
import { diagramFields, labelBits, packetDiagramView } from '../../src/packet-diagram.js';

const t = (key, args) => (args ? `${key} ${JSON.stringify(args)}` : key);
const bytes = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0));
const text = (b) => String.fromCharCode(...b);
async function open(id) {
  const doc = new CaptureDoc({ name: id, file: SAMPLES.find((s) => s.id === id).build() });
  await doc.firstPass();
  return doc;
}

test('show packet bytes: every "decode as" turns its encoding back into the bytes', () => {
  assert.equal(text(decodeBytes(bytes('SGVsbG8sIFdvcmxkIQ=='), 'base64').bytes), 'Hello, World!');
  assert.equal(text(decodeBytes(bytes('48 65:6c6c6f'), 'hex').bytes), 'Hello');
  assert.equal(text(decodeBytes(bytes('a%20b%2Fc%zz'), 'percent').bytes), 'a b/c%zz');
  assert.equal(text(decodeBytes(bytes('caf=C3=A9=\r\nlong'), 'quotedPrintable').bytes), 'caf\xc3\xa9long');
  assert.equal(text(decodeBytes(bytes('Uryyb'), 'rot13').bytes), 'Hello');
  const bad = decodeBytes(bytes('not base64!!'), 'base64');
  assert.ok(bad.error && text(bad.bytes) === 'not base64!!', 'undecodable bytes stay as they were');
});

test('show packet bytes: every "show as" form', () => {
  const b = Uint8Array.from([0x48, 0x69, 0x0a, 0x00, 0xff]);
  assert.equal(showBytes(b, 'ascii'), 'Hi\n..');
  assert.equal(showBytes(b, 'raw'), '48690a00ff');
  assert.equal(showBytes(b, 'hexdump'), `0000  ${'48 69 0a 00 ff'.padEnd(47)}   Hi...`);
  assert.match(showBytes(b, 'carray'), /char packet_bytes\[\] = \{\n {2}0x48, 0x69, 0x0a, 0x00, 0xff\n\};/);
  assert.match(showBytes(b, 'rustarray'), /\[u8; 5\]/);
  assert.equal(showBytes(Uint8Array.from([0xc8, 0x89, 0x40, 0xf1]), 'ebcdic'), 'Hi 1');
  assert.equal(showBytes(bytes('{"a":1}'), 'json'), '{\n  "a": 1\n}');
  assert.equal(showBytes(Uint8Array.from([0x41, 0, 0x42, 0]), 'utf16'), 'AB');
});

test('show packet bytes: a field of a real packet, with the choices', async () => {
  const doc = await open('http-page-load');
  const index = doc.frames.findIndex((_, i) => doc.dissection(i).fields.has('http.request.method'));
  const node = doc.dissection(index).fields.get('http.request.method')[0];
  const view = packetBytesView(doc, { index, start: node.start, length: node.length, showAs: 'ascii' }, t);
  assert.equal(view.text, 'GET');
  assert.deepEqual(view.choices.map((c) => c.key), ['decodeAs', 'showAs']);
  assert.equal(packetBytesView(doc, { index, showAs: 'raw' }, t).text.length, doc.frames[index].data.length * 2, 'no field: the whole frame');
});

test('packet diagram: bit fields from labels, IPv4 and TCP laid out like their RFC drawings', async () => {
  assert.deepEqual(labelBits('0100 .... = Version: 4', 1), { offset: 0, width: 4 });
  assert.deepEqual(labelBits('...0 0000 0000 0000 = Fragment Offset: 0', 2), { offset: 3, width: 13 });
  assert.equal(labelBits('Total Length: 52', 2), null);
  const doc = await open('tcp-3-way-handshake');
  const d = doc.dissection(0);
  const ip = diagramFields(d.tree.find((n) => n.abbrev === 'ip'));
  const at = (list, abbrev) => list.find((f) => f.abbrev === abbrev);
  assert.deepEqual([at(ip, 'ip.version').bit, at(ip, 'ip.version').bits], [0, 4]);
  assert.deepEqual([at(ip, 'ip.hdr_len').bit, at(ip, 'ip.hdr_len').bits], [4, 4]);
  assert.deepEqual([at(ip, 'ip.dsfield.dscp').bit, at(ip, 'ip.dsfield.dscp').bits], [8, 6], 'DS field drawn as DSCP and ECN');
  assert.deepEqual([at(ip, 'ip.len').bit, at(ip, 'ip.ttl').bit, at(ip, 'ip.src').bit, at(ip, 'ip.dst').bit], [16, 64, 96, 128]);
  assert.deepEqual([at(ip, 'ip.frag_offset').bit, at(ip, 'ip.frag_offset').bits], [51, 13]);
  for (let i = 1; i < ip.length; i++) assert.ok(ip[i].bit >= ip[i - 1].bit + ip[i - 1].bits, 'no overlaps');
  const eth = diagramFields(d.tree.find((n) => n.abbrev === 'eth'));
  assert.deepEqual(eth.map((f) => [f.abbrev, f.bit, f.bits]), [['eth.dst', 0, 48], ['eth.src', 48, 48], ['eth.type', 96, 16]], 'MAC addresses stay whole');
  const tcp = diagramFields(d.tree.find((n) => n.abbrev === 'tcp'));
  assert.deepEqual([at(tcp, 'tcp.srcport').bit, at(tcp, 'tcp.dstport').bit, at(tcp, 'tcp.seq_raw')?.bit ?? at(tcp, 'tcp.seq')?.bit], [0, 16, 32]);
  const view = packetDiagramView(doc, { index: 0 }, t);
  assert.deepEqual(view.sections.map((s) => s.abbrev).slice(0, 3), ['eth', 'ip', 'tcp']);
  for (const s of view.sections) assert.match(s.svg, /^<svg[^>]+class="pd-svg"[\s\S]*<\/svg>$/);
  assert.match(view.text, /Source Address/);
  assert.ok(!/<script|onload=/i.test(view.sections.map((s) => s.svg).join('')));
});

test('packet diagram: every packet of every sample draws without overlaps', async () => {
  for (const sample of SAMPLES) {
    const doc = await open(sample.id);
    for (let i = 0; i < Math.min(doc.passed, 30); i++) {
      const view = packetDiagramView(doc, { index: i, showValues: 'on' }, t);
      assert.ok(!view.error, `${sample.id} #${i + 1}`);
      for (const s of view.sections) for (let k = 1; k < s.fields.length; k++) assert.ok(s.fields[k].bit >= s.fields[k - 1].bit + s.fields[k - 1].bits, `${sample.id} #${i + 1} ${s.abbrev}`);
    }
  }
});

test('display filter macros: ${name:a;b}, $name(a, b), nesting, unknown macros, field references', async () => {
  const { macros, errors } = parseMacroLines('# note\nhost = ip.addr == $1\n\nweb: tcp.port in {80, 443}\npair = ${host:$1} && ${host:$2}\nbad line');
  assert.deepEqual(macros.map((m) => m.name), ['host', 'web', 'pair']);
  assert.deepEqual(errors, ['bad line']);
  setFilterMacros(macros);
  try {
    assert.equal(expandMacros('${host:10.0.0.5}').text, 'ip.addr == 10.0.0.5');
    assert.equal(expandMacros('$host(10.0.0.5) or ${web}').text, 'ip.addr == 10.0.0.5 or tcp.port in {80, 443}');
    assert.equal(expandMacros('${pair:1.1.1.1;2.2.2.2}').text, 'ip.addr == 1.1.1.1 && ip.addr == 2.2.2.2');
    assert.match(expandMacros('${nope:1}').error, /no display filter macro "nope"/);
    assert.equal(expandMacros('ip.src == ${ip.src}').text, 'ip.src == ${ip.src}', 'a field reference is not a macro');
    const c = compileFilter('${host:192.168.0.23}');
    assert.ok(c.ok && c.expanded === 'ip.addr == 192.168.0.23');
    const doc = await open('tcp-3-way-handshake');
    const viaMacro = (await doc.applyFilter('${host:192.168.0.23}')).count;
    assert.ok(viaMacro > 0);
    assert.equal(viaMacro, (await doc.applyFilter('ip.addr == 192.168.0.23')).count);
    setFilterMacros([{ name: 'loop', text: '${loop}' }]);
    assert.match(expandMacros('${loop}').error, /nested too deeply/);
  } finally {
    setFilterMacros([]);
  }
  assert.equal(compileFilter('${host:1.2.3.4}').ok, false, 'without the macro the text is not a filter');
});
