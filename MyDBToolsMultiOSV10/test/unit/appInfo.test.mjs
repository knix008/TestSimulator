// The application's name and version appear in places that cannot import from
// one another: src/appInfo.ts, the Tauri shell (lib.rs, tauri.conf.json,
// Cargo.toml), index.html, the guide viewer and package.json. These tests keep
// them in step.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { suite, test, expect } from '../helpers/runner.mjs';
import { appInfo } from '../helpers/core.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relative) => readFileSync(path.join(root, relative), 'utf8');

suite('app identity', () => {
  test('the title carries both the name and the version', () => {
    expect(appInfo.APP_TITLE).toContain(appInfo.APP_NAME);
    expect(appInfo.APP_TITLE).toContain('v1.0.1');
    expect(appInfo.APP_TITLE).toBe('DBTools v1.0.1');
  });

  test('the version is 1.0.1 and the label carries all of it', () => {
    expect(appInfo.APP_VERSION).toBe('1.0.1');
    expect(appInfo.APP_VERSION_LABEL).toBe('v1.0.1');
  });

  test('the version matches package.json', () => {
    const pkg = JSON.parse(read('package.json'));
    expect(pkg.version).toBe(appInfo.APP_VERSION);
  });

  test('the Tauri shell title matches, though it cannot import it', () => {
    const lib = read('src-tauri/src/lib.rs');
    const match = lib.match(/pub const TITLE: &str = "([^"]+)";/);
    expect(match).toBeTruthy('lib.rs declares TITLE');
    expect(match[1]).toBe(appInfo.APP_TITLE);
  });

  test('tauri.conf.json and Cargo.toml carry the same version', () => {
    const conf = JSON.parse(read('src-tauri/tauri.conf.json'));
    expect(conf.version).toBe(appInfo.APP_VERSION);
    expect(read('src-tauri/Cargo.toml')).toContain(`version = "${appInfo.APP_VERSION}"`);
  });

  test('the installer, the program and its window use the icons in assets/', () => {
    const conf = JSON.parse(read('src-tauri/tauri.conf.json'));
    expect(conf.bundle.icon.every((p) => p.startsWith('../assets/'))).toBeTruthy();
    expect(conf.bundle.icon).toContain('../assets/icon.ico');
    expect(conf.bundle.windows.nsis.installerIcon).toBe('../assets/icon.ico');
    expect(conf.bundle.resources['../assets/file-icon.ico']).toBe('file-icon.ico');
    for (const f of ['icon.ico', 'icon.png', 'file-icon.ico', 'file-icon.png', 'icons/256x256.png']) {
      expect(existsSync(path.join(root, 'assets', f))).toBeTruthy(f);
    }
  });

  test('the guide viewer shows the same version', () => {
    expect(read('public/doc/index.html')).toContain(appInfo.APP_TITLE);
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
