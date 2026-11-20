// Configuration profiles as project files (src/domain/profile.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProfile, LOCAL_SETTINGS, parseProfile, PROFILE_FORMAT, profileText } from '../../src/domain/profile.js';
import { normalizeSettings } from '../../src/domain/settings.js';

test('profile: settings, colouring rules, filters and macros round-trip; local settings stay out', () => {
  const settings = { ...normalizeSettings({}, 'ko'), timeFormat: 'utc', lastDirectory: 'C:/Users/me/caps', captureInterface: '\\Device\\NPF_{X}', language: 'en', decodeAs: [{ table: 'tcp.port', value: 8080, proto: 'http' }] };
  const coloring = [{ name: 'Mine', filter: 'dns', fg: '#000000', bg: '#ffff00', enabled: true, extra: 1 }];
  const filters = { display: [{ name: 'Web', filter: 'http', button: true }], capture: [{ name: 'DNS', filter: 'port 53' }] };
  const text = profileText(buildProfile({ name: 'Lab', settings, coloring, filters, macros: [{ name: 'host', text: 'ip.addr == $1' }] }, new Date('2026-11-20T00:00:00Z')));
  const raw = JSON.parse(text);
  assert.equal(raw.format, PROFILE_FORMAT);
  for (const key of LOCAL_SETTINGS) assert.ok(!(key in raw.settings), `${key} is local`);
  assert.equal(raw.coloring[0].extra, undefined);
  const parsed = parseProfile(text);
  assert.ok(parsed.ok);
  assert.equal(parsed.profile.name, 'Lab');
  assert.equal(parsed.profile.settings.timeFormat, 'utc');
  assert.deepEqual(parsed.profile.settings.decodeAs, settings.decodeAs);
  assert.deepEqual(parsed.profile.coloring, [{ name: 'Mine', filter: 'dns', fg: '#000000', bg: '#ffff00', enabled: true }]);
  assert.deepEqual(parsed.profile.filters, filters);
  assert.deepEqual(parsed.profile.macros, [{ name: 'host', text: 'ip.addr == $1' }]);
});

test('profile: wrong files are refused, missing parts stay null, local keys in a file are ignored', () => {
  assert.equal(parseProfile('nope').ok, false);
  assert.match(parseProfile('{"format":"other"}').error, /not a MyNetManager profile/);
  assert.match(parseProfile(JSON.stringify({ format: PROFILE_FORMAT, version: 99 })).error, /newer version/);
  const p = parseProfile(JSON.stringify({ format: PROFILE_FORMAT, version: 1, settings: { lastDirectory: '/etc', timeFormat: 'epoch' }, coloring: [{ bad: true }] })).profile;
  assert.deepEqual(p.settings, { timeFormat: 'epoch' });
  assert.deepEqual(p.coloring, []);
  assert.equal(p.filters, null);
  assert.equal(p.macros, null);
});
