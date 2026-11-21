// Every setting survives being stored and read back (the app and its popups pass settings through storage
// on every change): the defaults come back unchanged, and a changed value comes back as it was set — for each
// setting on its own, so a failure names it. Found: a fraction (imageQuality 0.92) was rounded to 1 on load.
import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultSettings, loadSettings, storeSettings } from '../../src/domain/settings.js';

const memory = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const roundTrip = (settings) => { const s = memory(); storeSettings(s, settings); return loadSettings(s); };

for (const language of ['ko', 'en']) {
  const defaults = defaultSettings(language);
  const back = roundTrip(defaults);
  for (const key of Object.keys(defaults)) {
    test(`settings (${language}): the default ${key} survives a store and load`, () => {
      assert.deepEqual(back[key], defaults[key], `${key}: stored ${JSON.stringify(defaults[key])}, read back ${JSON.stringify(back[key])}`);
    });
  }
}

// Every on/off setting changed is kept as set (not reset to its default on load).
// (Starting from settings the app has stored once: they carry its migration markers.)
const defaults = roundTrip(defaultSettings('en'));
for (const [key, value] of Object.entries(defaults)) {
  if (typeof value === 'boolean') {
    test(`settings: ${key} turned ${value ? 'off' : 'on'} is kept`, () => {
      assert.equal(roundTrip({ ...defaults, [key]: !value })[key], !value);
    });
  }
}
