import test from 'node:test';
import assert from 'node:assert/strict';
import { activePresets, CAPTURE_PRESETS, DISPLAY_PRESETS, orParts, togglePreset } from '../../src/domain/filter/presets.js';

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
