import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

// A small stand-in for the browser's storage, so the settings module can be tested on its own.
const store = new Map();
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => { store.set(key, String(value)); },
  removeItem: (key) => { store.delete(key); },
};

const { applyInstallLanguage, loadSettings, saveSettings } = await import('../../src/domain/settings.js');

describe('Installer language', () => {
  test('the language chosen in the installer wins over an earlier choice, once', () => {
    const settings = loadSettings();
    settings.language = 'ko';
    saveSettings();
    assert.equal(applyInstallLanguage('en', 'en-1').language, 'en');
    assert.equal(JSON.parse(store.get('myworkforce-settings')).language, 'en');
    // The person switches back inside the program; the same installation does not undo that.
    loadSettings().language = 'ko';
    saveSettings();
    assert.equal(applyInstallLanguage('en', 'en-1').language, 'ko');
    // A new installation in Korean applies again.
    assert.equal(applyInstallLanguage('ko', 'ko-2').language, 'ko');
    assert.equal(applyInstallLanguage('en', 'en-3').language, 'en');
  });

  test('ignores anything but Korean and English', () => {
    const before = loadSettings().language;
    assert.equal(applyInstallLanguage('fr', 'fr-1').language, before);
    assert.equal(applyInstallLanguage(undefined, undefined).language, before);
  });
});

describe('Installer language dialog', () => {
  const read = async (file) => (await import('node:fs')).readFileSync(new URL(`../../${file}`, import.meta.url));

  test('the installer offers Korean and English and asks every time, even after an earlier installation', async () => {
    const conf = JSON.parse(String(await read('src-tauri/tauri.conf.json')));
    const nsis = conf.bundle.windows.nsis;
    assert.deepEqual(nsis.languages, ['Korean', 'English']);
    assert.equal(nsis.displayLanguageSelector, true);
    const hooks = await read('src-tauri/windows/hooks.nsh');
    // A remembered language would otherwise skip the question for good.
    assert.match(String(hooks), /^﻿?!define MUI_LANGDLL_ALWAYSSHOW$/m);
    // Korean text in the hooks needs the BOM, or makensis reads it in the system code page.
    assert.deepEqual([...hooks.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  });

  test('the chosen language is handed to the program for its first start', async () => {
    const hooks = String(await read('src-tauri/windows/hooks.nsh'));
    assert.match(hooks, /StrCmp \$LANGUAGE 1042/);
    assert.match(hooks, /install-language/);
  });
});
