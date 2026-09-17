// Pure helpers of the settings dialog (src/renderer/js/settings-view.js):
// wallpaper paging, font size clamp, start-directory input, tab list.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pageOfLibrary,
  clampFontSize,
  normalizeStartDirectoryInput,
  normalizeSshProfiles,
  sshProfileLabel,
  newSshProfileId,
  normalizeTerminalProfiles,
  newTerminalProfileId,
  SETTINGS_TABS,
} from '../src/renderer/js/settings-view.js';
import { resolveTheme, themeOverridesFrom, normalizeThemeOverrides } from '../src/renderer/js/themes.js';

test('settings tabs: general · terminal · text · theme · colors · background · ssh · prompt · promptEdit', () => {
  assert.deepEqual(SETTINGS_TABS, ['general', 'terminal', 'text', 'theme', 'colors', 'background', 'ssh', 'prompt', 'promptEdit']);
});

test('themes.json: 20 dark + 20 light, all ids unique, no two of a kind share background and accent hue', async () => {
  const { createRequire } = await import('node:module');
  const themes = createRequire(import.meta.url)('../src/renderer/shared/themes/themes.json');
  const list = Object.values(themes);
  assert.equal(list.filter((t) => t.kind === 'dark').length, 20);
  assert.equal(list.filter((t) => t.kind === 'light').length, 20);
  assert.equal(new Set(list.map((t) => t.id)).size, 40);
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const dist = (a, b) => Math.hypot(...rgb(a).map((v, i) => v - rgb(b)[i]));
  const hue = (h) => {
    const [r, g, b] = rgb(h).map((v) => v / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    if (!d) return 0;
    const x = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return x * 60;
  };
  for (const a of list) for (const b of list) {
    if (a === b || a.kind !== b.kind || a.id > b.id) continue;
    const dh = Math.abs(hue(a.accent) - hue(b.accent));
    const similar = dist(a.background, b.background) < 10 && Math.min(dh, 360 - dh) < 25;
    assert.ok(!similar, `${a.id} ~ ${b.id}`);
  }
});

test('terminal profiles: cols/rows/font/scrollback clamped, ids required', () => {
  const list = normalizeTerminalProfiles([
    { id: 'term-1', name: ' Wide ', cols: '132', rows: '40', fontId: 'consolas', fontSize: '99', scrollback: '5', shellId: 'powershell' },
    { id: 'term-2', cols: 'x', rows: 1 },
    { id: '', cols: 80 },
  ]);
  assert.equal(list.length, 2);
  assert.deepEqual(list[0], { id: 'term-1', name: 'Wide', cols: 132, rows: 40, fontId: 'consolas', fontSize: 28, scrollback: 100, shellId: 'powershell' });
  assert.equal(list[1].cols, 80);
  assert.equal(list[1].rows, 5);
  assert.equal(list[1].fontSize, 14);
  assert.match(newTerminalProfileId(7), /^term-/);
});

test('ssh profiles: normalized, never carry a password, labelled by name or user@host', () => {
  const list = normalizeSshProfiles([
    { id: 'ssh-1', name: ' Build ', host: 'build.local', port: '2222', username: 'me', privateKey: '', password: 'nope' },
    { id: 'ssh-2', host: '10.0.0.5', port: 'x', username: 'root' },
    { id: '', host: 'dropped' },
    null,
  ]);
  assert.equal(list.length, 2);
  assert.equal(list[0].name, 'Build');
  assert.equal(list[0].port, 2222);
  assert.equal('password' in list[0], false);
  assert.equal(list[1].port, 22);
  assert.equal(sshProfileLabel(list[0]), 'Build');
  assert.equal(sshProfileLabel(list[1]), 'root@10.0.0.5');
  assert.deepEqual(normalizeSshProfiles('x'), []);
  assert.match(newSshProfileId(1000), /^ssh-/);
});

test('theme overrides: only differing keys are kept, per theme, and reset drops them', () => {
  const themes = {
    dark: { id: 'dark', background: '#1e1e1e', foreground: '#d4d4d4', cursor: '#aaa', selection: '#264f78', accent: '#3b82f6', toolbarBg: '#252526', toolbarFg: '#ccc', border: '#3c3c3c', buttonHover: '#2a2d2e', danger: '#e81123', terminal: {} },
    nord: { id: 'nord', background: '#2e3440', foreground: '#d8dee9', cursor: '#d8dee9', selection: '#434c5e', accent: '#88c0d0', toolbarBg: '#272c36', toolbarFg: '#e5e9f0', border: '#3b4252', buttonHover: '#3b4252', danger: '#bf616a', terminal: {} },
  };
  const diff = themeOverridesFrom({ background: '#1E1E1E', accent: '#ff0000', foreground: '#d4d4d4', cursor: '#111' }, themes.dark);
  assert.deepEqual(diff, { accent: '#ff0000', cursor: '#111' });
  const resolved = resolveTheme(themes, 'dark', diff);
  assert.equal(resolved.accent, '#ff0000');
  assert.equal(resolved.background, '#1e1e1e');
  // another theme is unaffected
  assert.equal(resolveTheme(themes, 'nord', undefined).accent, '#88c0d0');
  // saved map sanitised: unknown themes and no-op overrides dropped
  const saved = normalizeThemeOverrides({ dark: { accent: '#ff0000', background: '#1e1e1e' }, nope: { accent: '#1' }, nord: {} }, themes);
  assert.deepEqual(saved, { dark: { accent: '#ff0000' } });
  // a legacy "custom" theme id resolves to dark
  assert.equal(resolveTheme(themes, 'custom', { accent: '#123456' }).id, 'dark');
});

test('pageOfLibrary pages a wallpaper list into fixed-size pages and clamps the page', () => {
  const items = Array.from({ length: 23 }, (_, i) => ({ id: `bg${i}` }));
  const p0 = pageOfLibrary(items, 0, 10);
  assert.equal(p0.pages, 3);
  assert.equal(p0.items.length, 10);
  assert.equal(p0.items[0].id, 'bg0');
  const p2 = pageOfLibrary(items, 2, 10);
  assert.equal(p2.items.length, 3);
  assert.equal(p2.items[0].id, 'bg20');
  // past the end / before the start clamp to the last / first page
  assert.equal(pageOfLibrary(items, 9, 10).page, 2);
  assert.equal(pageOfLibrary(items, -3, 10).page, 0);
  // empty list still has one (empty) page
  assert.deepEqual(pageOfLibrary([], 0, 10), { items: [], page: 0, pages: 1 });
  assert.deepEqual(pageOfLibrary(null, 0, 10).items, []);
});

test('clampFontSize keeps the terminal font between 10 and 28', () => {
  assert.equal(clampFontSize('14'), 14);
  assert.equal(clampFontSize(4), 10);
  assert.equal(clampFontSize('99'), 28);
  assert.equal(clampFontSize('abc'), 14);
});

test('normalizeStartDirectoryInput trims and strips wrapping quotes', () => {
  assert.equal(normalizeStartDirectoryInput('  "C:\\Users\\me\\src"  '), 'C:\\Users\\me\\src');
  assert.equal(normalizeStartDirectoryInput("'/home/me'"), '/home/me');
  assert.equal(normalizeStartDirectoryInput(''), '');
  assert.equal(normalizeStartDirectoryInput(null), '');
  assert.equal(normalizeStartDirectoryInput('"'), '"');
});
