// The application's name and version appear in four places that cannot import
// from one another: src/appInfo.ts, electron/main.ts (compiled on its own),
// index.html and package.json. These tests are what keeps them in step.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { suite, test, expect } from '../helpers/runner.mjs';
import { appInfo } from '../helpers/core.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relative) => readFileSync(path.join(root, relative), 'utf8');

suite('app identity', () => {
  test('the title carries both the name and the version', () => {
    expect(appInfo.APP_TITLE).toContain(appInfo.APP_NAME);
    expect(appInfo.APP_TITLE).toContain('v1.0');
    expect(appInfo.APP_TITLE).toBe('DBTools v1.0');
  });

  test('the short label is the first two parts of the version', () => {
    expect(appInfo.APP_VERSION_LABEL).toBe('v1.0');
    expect(appInfo.APP_VERSION.startsWith('1.0')).toBeTruthy();
  });

  test('the version matches package.json', () => {
    const pkg = JSON.parse(read('package.json'));
    expect(pkg.version).toBe(appInfo.APP_VERSION);
  });

  test('the Electron startup title matches, though it cannot import it', () => {
    const main = read('electron/main.ts');
    const match = main.match(/const APP_TITLE = '([^']+)'/);
    expect(match).toBeTruthy('electron/main.ts declares APP_TITLE');
    expect(match[1]).toBe(appInfo.APP_TITLE);
  });

  test('the page title matches', () => {
    const match = read('index.html').match(/<title>([^<]+)<\/title>/);
    expect(match[1]).toBe(appInfo.APP_TITLE);
  });
});

suite('window title', () => {
  const { windowTitle, APP_TITLE } = appInfo;

  test('a document name comes first, the application after', () => {
    expect(windowTitle('C:/work/Shop.mdprj', false)).toBe(`C:/work/Shop.mdprj — ${APP_TITLE}`);
  });

  test('unsaved changes are marked', () => {
    expect(windowTitle('Shop', true)).toBe(`● Shop — ${APP_TITLE}`);
  });

  test('with no document the application name stands in', () => {
    expect(windowTitle(null, false)).toBe(`DBTools — ${APP_TITLE}`);
    expect(windowTitle('   ', false)).toBe(`DBTools — ${APP_TITLE}`);
  });
});
