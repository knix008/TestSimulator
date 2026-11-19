import test from 'node:test';
import assert from 'node:assert/strict';
import { activePresets, ALL, CAPTURE_PRESETS, DISPLAY_PRESETS, excludedPresets, NONE, orParts, togglePreset } from '../../src/domain/filter/presets.js';

test('presets: top-level OR parts, not inside parentheses or quotes', () => {
  assert.deepEqual(orParts('dns or udp'), ['dns', 'udp']);
  assert.deepEqual(orParts('(icmp || icmpv6) || arp'), ['(icmp || icmpv6)', 'arp']);
  assert.deepEqual(orParts('http.host == "a or b" or tcp'), ['http.host == "a or b"', 'tcp']);
  assert.deepEqual(orParts('tcp port 80'), ['tcp port 80'], '"port" is not "or"');
  assert.deepEqual(orParts(''), []);
});

test('presets: pressing presets one after another adds them with OR; none turns another off', () => {
  let f = togglePreset('', 'dns', DISPLAY_PRESETS);
  assert.equal(f, 'dns');
  f = togglePreset(f, 'udp', DISPLAY_PRESETS);
  assert.equal(f, 'dns or udp');
  f = togglePreset(f, 'icmp || icmpv6', DISPLAY_PRESETS);
  assert.equal(f, 'dns or udp or (icmp || icmpv6)');
  assert.deepEqual(activePresets(f, DISPLAY_PRESETS).sort(), ['dns', 'icmp || icmpv6', 'udp'].sort());
});

test('presets: pressing a preset that is on takes only that one out', () => {
  let f = 'dns or udp or (icmp || icmpv6)';
  f = togglePreset(f, 'udp', DISPLAY_PRESETS);
  assert.equal(f, 'dns or (icmp || icmpv6)');
  f = togglePreset(f, 'dns', DISPLAY_PRESETS);
  assert.equal(f, 'icmp || icmpv6', 'a single part loses its parentheses');
  assert.deepEqual(activePresets(f, DISPLAY_PRESETS), ['icmp || icmpv6']);
  assert.equal(togglePreset(f, 'icmp || icmpv6', DISPLAY_PRESETS), '');
});

test('presets: a typed filter stays and the presets join it with OR', () => {
  const f = togglePreset('frame.len > 60', 'dns', DISPLAY_PRESETS);
  assert.equal(f, '(frame.len > 60) or dns');
  assert.deepEqual(activePresets(f, DISPLAY_PRESETS), ['dns']);
  assert.equal(togglePreset(f, 'dns', DISPLAY_PRESETS), 'frame.len > 60');
});

test('presets: capture filters (BPF) with "or" inside a preset stay one preset', () => {
  let f = togglePreset('', 'tcp port 80 or tcp port 443', CAPTURE_PRESETS);
  assert.equal(f, 'tcp port 80 or tcp port 443');
  assert.deepEqual(activePresets(f, CAPTURE_PRESETS), ['tcp port 80 or tcp port 443']);
  f = togglePreset(f, 'port 53', CAPTURE_PRESETS);
  assert.equal(f, '(tcp port 80 or tcp port 443) or port 53');
  assert.deepEqual(activePresets(f, CAPTURE_PRESETS).sort(), ['port 53', 'tcp port 80 or tcp port 443'].sort());
  assert.equal(togglePreset(f, 'tcp port 80 or tcp port 443', CAPTURE_PRESETS), 'port 53');
});

test('presets: every preset has a name, a filter and an icon, without duplicates', () => {
  for (const list of [DISPLAY_PRESETS, CAPTURE_PRESETS]) {
    assert.ok(list.length >= 10);
    assert.equal(new Set(list.map(([n]) => n)).size, list.length);
    for (const [name, filter, glyph] of list) assert.ok(name && filter && glyph, String(name));
  }
});

test('presets: ARP DNS is a switch — off keeps ARP and DNS out (AND), on lets them in', () => {
  const sw = 'not arp and not dns';
  let f = togglePreset('', sw, DISPLAY_PRESETS);
  assert.equal(f, 'not arp and not dns');
  assert.deepEqual(excludedPresets(f, DISPLAY_PRESETS), [sw]);
  f = togglePreset(f, 'tcp', DISPLAY_PRESETS);
  assert.equal(f, 'tcp and (not arp and not dns)');
  f = togglePreset(f, 'udp', DISPLAY_PRESETS);
  assert.equal(f, '(tcp or udp) and (not arp and not dns)');
  assert.deepEqual(activePresets(f, DISPLAY_PRESETS).sort(), ['tcp', 'udp']);
  assert.equal(togglePreset(f, sw, DISPLAY_PRESETS), 'tcp or udp', 'on again: nothing excluded');
  assert.equal(togglePreset(f, NONE, DISPLAY_PRESETS), 'not arp and not dns', 'NONE leaves the switch alone');
  const all = togglePreset(f, ALL, DISPLAY_PRESETS);
  assert.deepEqual(excludedPresets(all, DISPLAY_PRESETS), [], 'ALL lets everything in');
  // A filter with && of its own keeps working under the switch.
  f = togglePreset(togglePreset('', 'tcp.flags.syn == 1 && tcp.flags.ack == 0', DISPLAY_PRESETS), sw, DISPLAY_PRESETS);
  assert.equal(f, '(tcp.flags.syn == 1 && tcp.flags.ack == 0) and (not arp and not dns)');
  assert.deepEqual(activePresets(f, DISPLAY_PRESETS), ['tcp.flags.syn == 1 && tcp.flags.ack == 0']);
  // Typed text without parentheses is read back too.
  assert.deepEqual(excludedPresets('tcp and not arp and not dns', DISPLAY_PRESETS), [sw]);
  assert.equal(togglePreset('tcp and not arp and not dns', sw, DISPLAY_PRESETS), 'tcp');
});

test('presets: the capture broadcast/multicast switch ANDs in BPF', () => {
  const sw = 'not broadcast and not multicast';
  let f = togglePreset('port 53', sw, CAPTURE_PRESETS);
  assert.equal(f, 'port 53 and (not broadcast and not multicast)');
  f = togglePreset(f, 'tcp port 80 or tcp port 443', CAPTURE_PRESETS);
  assert.equal(f, '(port 53 or (tcp port 80 or tcp port 443)) and (not broadcast and not multicast)');
  assert.equal(togglePreset(f, sw, CAPTURE_PRESETS), 'port 53 or (tcp port 80 or tcp port 443)');
});

test('presets: the ARP DNS switch really keeps ARP and DNS rows out of the packet list', async () => {
  const { SAMPLES } = await import('../../src/domain/capture/samples.js');
  const { CaptureDoc } = await import('../../src/domain/capture/doc.js');
  const doc = new CaptureDoc({ name: 'lan', file: SAMPLES.find((s) => s.id === 'mixed-office-lan').build() });
  await doc.firstPass();
  const count = async (f) => { const r = await doc.applyFilter(f); assert.ok(r.ok, `${f}: ${r.error}`); return r.count; };
  const sw = 'not arp and not dns';
  const [total, arp, dns, udp] = [await count(''), await count('arp'), await count('dns'), await count('udp')];
  assert.ok(arp > 0 && dns > 0, `sample has ARP ${arp} and DNS ${dns}`);
  assert.equal(await count(togglePreset('', sw, DISPLAY_PRESETS)), total - arp - dns);
  const udpNoDns = await count(togglePreset('udp', sw, DISPLAY_PRESETS));
  assert.equal(udpNoDns, udp - (await count('udp and dns')));
  assert.equal(await count(togglePreset(togglePreset('', sw, DISPLAY_PRESETS), ALL, DISPLAY_PRESETS)), await count(togglePreset('', ALL, DISPLAY_PRESETS)));
});
