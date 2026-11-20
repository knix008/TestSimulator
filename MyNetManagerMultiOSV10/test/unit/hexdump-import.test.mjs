// File › Import from Hex Dump (src/domain/capture/hexdump-import.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { SAMPLES } from '../../src/domain/capture/samples.js';
import { readCaptureAsync } from '../../src/domain/capture/pcap.js';
import { hexDump } from '../../src/domain/analysis/export.js';
import { guessLinktype, packetsToPcap, parseHexDump } from '../../src/domain/capture/hexdump-import.js';

test('hex dump import: our own hex dumps of every sample come back byte for byte', async () => {
  for (const sample of SAMPLES) {
    const file = sample.build();
    const frames = file.frames.slice(0, 40);
    const text = frames.map((f, i) => `Frame ${i + 1}\n${hexDump(f.data)}\n`).join('\n');
    const packets = parseHexDump(text);
    assert.equal(packets.length, frames.length, sample.id);
    packets.forEach((p, i) => assert.deepEqual([...p], [...frames[i].data], `${sample.id} frame ${i + 1}`));
  }
});

test('hex dump import: Wireshark / text2pcap styles, ASCII columns that look like hex, hex streams', () => {
  const wireshark = [
    '0000   ff ff ff ff ff ff 00 1a a0 01 02 03 08 06 00 01   ................',
    '0010   08 00 06 04 00 01 ab cd                           ....ab cd',
  ].join('\n');
  assert.deepEqual([...parseHexDump(wireshark)[0]], [0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x00, 0x1a, 0xa0, 0x01, 0x02, 0x03, 0x08, 0x06, 0x00, 0x01, 0x08, 0x00, 0x06, 0x04, 0x00, 0x01, 0xab, 0xcd]);
  const text2pcap = '000000 00 01 02 03 04 05 06 07  ab cd ef 01\n000008 08 09\n000000 aa bb\n';
  const two = parseHexDump(text2pcap);
  assert.equal(two.length, 2);
  assert.deepEqual([...two[0]], [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 'line length comes from the next offset');
  assert.deepEqual([...two[1]], [0xaa, 0xbb]);
  const streams = parseHexDump('No. 1\n45000014000100004006000000000000c0a80001\n\nffffffffffff001aa001020308060001\n');
  assert.equal(streams.length, 2);
  assert.equal(guessLinktype(streams), 101, 'an IPv4 header (total length = packet length) is Raw IP');
  assert.equal(guessLinktype([streams[1]]), 1);
  assert.deepEqual(parseHexDump('nothing here\n\nFrame 1: 60 bytes'), []);
});

test('hex dump import: the pcap it builds reads back with the same frames and link type', async () => {
  const packets = parseHexDump('0000  ff ff ff ff ff ff 00 1a a0 01 02 03 08 06\n0000  00 1a a0 01 02 03 ff ff ff ff ff ff 08 00');
  const file = await readCaptureAsync(packetsToPcap(packets, { linktype: 1, start: 1700000000 }), 'x.pcap');
  assert.equal(file.frames.length, 2);
  assert.deepEqual([...file.frames[1].data], [...packets[1]]);
  assert.equal(file.frames[0].sec, 1700000000);
  assert.ok(file.frames[1].sec * 1e6 + file.frames[1].nsec / 1e3 > file.frames[0].sec * 1e6 + file.frames[0].nsec / 1e3, 'stamps increase');
});
