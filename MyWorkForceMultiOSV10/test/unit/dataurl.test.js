import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';

function storage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return { getItem: (key) => (map.has(key) ? map.get(key) : null), setItem: (key, value) => map.set(key, String(value)), removeItem: (key) => map.delete(key), map };
}

async function load(location, saved = {}) {
  globalThis.location = location;
  globalThis.localStorage = storage(saved);
  // A fresh copy of the module for each case.
  return import(`../../src/platform/data.js?case=${Math.random()}`);
}

describe('Where the data service is', () => {
  afterEach(() => { delete globalThis.location; delete globalThis.localStorage; });

  test('the installed program (tauri.localhost) uses the service it started on this computer', async () => {
    const data = await load({ hostname: 'tauri.localhost', protocol: 'http:' });
    assert.equal(data.dataUrl(), 'http://127.0.0.1:1481');
  });

  test('an address an older version saved from tauri.localhost is dropped', async () => {
    const data = await load({ hostname: 'tauri.localhost', protocol: 'http:' }, { 'myworkforce-data-url': 'http://tauri.localhost:1481' });
    assert.equal(data.dataUrl(), 'http://127.0.0.1:1481');
    assert.equal(globalThis.localStorage.getItem('myworkforce-data-url'), null);
    data.rememberDataUrl('http://tauri.localhost:1481');
    assert.equal(globalThis.localStorage.getItem('myworkforce-data-url'), null);
  });

  test('a web page uses the computer it came from; a chosen server is kept, the default is not pinned', async () => {
    const data = await load({ hostname: 'work.example.com', protocol: 'http:' });
    assert.equal(data.dataUrl(), 'http://work.example.com:1481');
    data.rememberDataUrl('http://work.example.com:1481');
    assert.equal(globalThis.localStorage.getItem('myworkforce-data-url'), null);
    data.rememberDataUrl('http://10.0.0.5:1481/');
    assert.equal(data.dataUrl(), 'http://10.0.0.5:1481');
  });

  test('when nothing answers, the error says the data service did not answer', async () => {
    const data = await load({ hostname: 'tauri.localhost', protocol: 'http:' });
    const original = globalThis.fetch;
    globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
    try {
      await assert.rejects(() => data.dataStatus(), (error) => error.message === 'service' && /127\.0\.0\.1:1481/.test(error.detail));
      await assert.rejects(() => data.waitForService(300), /service/);
    } finally {
      globalThis.fetch = original;
    }
  });
});
