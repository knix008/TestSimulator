// Behavior of the recent UI: the theme menu (40 themes, two columns, its own
// window), custom themes, clickable path crumbs, and the bottom dock controls.
// Components are bundled with esbuild so the test runs the real render.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import esbuild from 'esbuild';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  THEMES, themeById, setCustomThemes, getCustomThemes, customThemeDefs,
  buildCustomTheme, baseColorsOf, nextThemeId, applyTheme, allThemes, CUSTOM_COLOR_KEYS,
} from '../src/themes.js';
import { setLanguage, t } from '../src/lib/i18n.js';
import { themeMenuArgs, shouldWindowDrag } from '../src/lib/backend.js';
import { pickSettingsValues } from '../src/lib/settings.js';

const root = path.dirname(fileURLToPath(new URL('.', import.meta.url)));

const ui = await (async () => {
  const outfile = path.join(root, 'node_modules', '.cache', 'mfc-ui', `bundle-${process.pid}.mjs`);
  fs.mkdirSync(path.dirname(outfile), { recursive: true });
  await esbuild.build({
    stdin: {
      contents: `
        export { ThemeMenuBody } from './src/components/ThemePopup.jsx';
        export { pathCrumbs, PathCrumbs } from './src/components/PathCrumbs.jsx';
        export { customFrom } from './src/dialogs/SettingsDialog.jsx';
      `,
      resolveDir: root,
      sourcefile: 'ui-changes-entry.jsx',
      loader: 'jsx',
    },
    bundle: true,
    format: 'esm',
    platform: 'node',
    jsx: 'automatic',
    packages: 'external',
    plugins: [{
      name: 'share-app-modules',
      setup(build) {
        // The test and the rendered menu must share theme and language state.
        build.onResolve({ filter: /(?:^|[\\/])(?:themes|i18n)(?:\.js)?$/ }, (args) => {
          if (!args.resolveDir) return null;
          let abs = path.resolve(args.resolveDir, args.path);
          if (!abs.endsWith('.js')) abs += '.js';
          if (!abs.startsWith(root)) return null;
          return { path: pathToFileURL(abs).href, external: true };
        });
      },
    }],
    outfile,
    logLevel: 'silent',
  });
  return import(pathToFileURL(outfile).href);
})();

function walk(node, fn) {
  if (node == null || typeof node !== 'object') return;
  if (Array.isArray(node)) { node.forEach((n) => walk(n, fn)); return; }
  fn(node);
  if (node.props && node.props.children != null) walk(node.props.children, fn);
}

function buttonsOf(node) {
  const found = [];
  walk(node, (el) => { if (el.type === 'button') found.push(el); });
  return found;
}

function themeIds(html) {
  return [...html.matchAll(/data-theme-id="([^"]+)"/g)].map((m) => m[1]);
}

const SAMPLE = {
  id: 'custom-test', label: 'Mine', mode: 'light',
  colors: {
    bg: '#fff8f1', panel: '#ffeedd', raised: '#ffffff', hover: '#ffe1c7', active: '#fbd0a9',
    border: '#f7dcc3', borderStrong: '#e0b183', text: '#3c2a16', textDim: '#7c5c3a',
    accent: '#e07a1f', accentStrong: '#b85c0b', accentText: '#ffffff',
    folder: '#e0a020', file: '#a3845f', danger: '#c0392b',
  },
};

test('themes: dark then light, custom themes join lookup and cycling', () => {
  setCustomThemes([]);
  assert.deepEqual(THEMES.filter((th) => th.mode === 'dark').map((th) => th.id), THEMES.slice(0, 20).map((th) => th.id));
  assert.deepEqual(THEMES.filter((th) => th.mode === 'light').map((th) => th.id), THEMES.slice(20).map((th) => th.id));

  setCustomThemes([null, { id: 'no-colors' }, SAMPLE]);
  assert.deepEqual(customThemeDefs().map((c) => c.id), ['custom-test']);
  assert.equal(getCustomThemes()[0].custom, true);
  assert.equal(getCustomThemes()[0].mode, 'light');
  assert.equal(themeById('custom-test').tokens['--bg'], SAMPLE.colors.bg);
  assert.equal(themeById('custom-test').tokens['--accent'], SAMPLE.colors.accent);
  // Customs are cycled before the built-in list, then the walk returns to them.
  assert.equal(allThemes()[0].id, 'custom-test');
  assert.equal(nextThemeId(THEMES[THEMES.length - 1].id), 'custom-test');
  assert.equal(nextThemeId('custom-test'), 'midnight');
  const colors = baseColorsOf(themeById('nord'));
  const rebuilt = buildCustomTheme({ id: 'copy', label: 'Copy', mode: 'dark', colors });
  for (const key of CUSTOM_COLOR_KEYS) assert.equal(baseColorsOf(rebuilt)[key], colors[key], key);
  setCustomThemes([]);
  assert.equal(themeById('custom-test').id, 'midnight');
});

test('themes: applyTheme writes the chosen tokens, including a custom theme', () => {
  const props = {};
  const dataset = {};
  const style = { setProperty(name, value) { props[name] = value; } };
  globalThis.document = { documentElement: { style, dataset } };
  try {
    const built = applyTheme('daylight');
    assert.equal(dataset.theme, 'daylight');
    assert.equal(dataset.mode, 'light');
    assert.equal(style.colorScheme, 'light');
    assert.equal(props['--bg'], built.tokens['--bg']);
    assert.equal(props['--accent'], built.tokens['--accent']);
    setCustomThemes([SAMPLE]);
    const custom = applyTheme('custom-test');
    assert.equal(dataset.theme, 'custom-test');
    assert.equal(dataset.mode, 'light');
    assert.equal(props['--bg'], custom.tokens['--bg']);
    assert.equal(custom.custom, true);
  } finally {
    setCustomThemes([]);
    delete globalThis.document;
  }
});

test('theme menu: top buttons, then 20 dark in two columns, then 20 light', () => {
  setLanguage('ko');
  setCustomThemes([]);
  const html = renderToStaticMarkup(createElement(ui.ThemeMenuBody, { current: 'nord', onPick() {} }));
  const top = html.indexOf('theme-new-custom');
  const settings = html.indexOf('theme-open-settings');
  const dark = html.indexOf('data-mode="dark"');
  const light = html.indexOf('data-mode="light"');
  assert.ok(top >= 0 && settings > top && dark > settings && light > dark);
  assert.match(html.slice(top, settings), /사용자 정의 테마/);
  assert.match(html.slice(settings, dark), />설정</);
  assert.match(html.slice(dark, light), /어두운 테마/);
  assert.match(html.slice(dark, light), /\(20\)/);
  assert.match(html.slice(light), /밝은 테마/);
  assert.match(html.slice(light), /\(20\)/);
  assert.deepEqual(themeIds(html), THEMES.map((th) => th.id));
  assert.match(html.slice(dark, light), /data-theme-id="nord"[^>]*aria-checked="true"|aria-checked="true"[^>]*data-theme-id="nord"/);
  assert.equal((html.slice(dark, light).match(/data-theme-id="/g) || []).length, 20);
  assert.equal((html.slice(light).match(/data-theme-id="/g) || []).length, 20);
  assert.equal((html.match(/class="theme-list"/g) || []).length, 2);

  setLanguage('en');
  const english = renderToStaticMarkup(createElement(ui.ThemeMenuBody, { current: 'midnight', onPick() {} }));
  assert.match(english, /Custom theme/);
  assert.match(english, />Settings</);
  assert.match(english, /Dark themes/);
  assert.match(english, /Light themes/);
  assert.match(english, />Midnight</);
  setLanguage('ko');
});

test('theme menu: custom themes are listed under the two buttons and carry the stored colours', () => {
  setLanguage('ko');
  setCustomThemes([SAMPLE]);
  const html = renderToStaticMarkup(createElement(ui.ThemeMenuBody, { current: 'custom-test', onPick() {} }));
  const customAt = html.indexOf('data-theme-id="custom-test"');
  const darkAt = html.indexOf('data-mode="dark"');
  assert.ok(customAt > html.indexOf('theme-open-settings') && customAt < darkAt);
  assert.match(html.slice(customAt, darkAt), /theme-badge/);
  assert.match(html.slice(customAt, darkAt), /Mine/);
  assert.match(html, new RegExp(SAMPLE.colors.bg));
  assert.match(html, new RegExp(SAMPLE.colors.accent));
  assert.equal(themeIds(html)[0], 'custom-test');
  assert.equal(themeIds(html).length, 41);
  setCustomThemes([]);
});

test('theme menu: a new custom theme copies the current one and opens on the theme tab', () => {
  setLanguage('ko');
  const made = ui.customFrom(themeById('ocean'), 'ko');
  assert.match(made.id, /^custom-/);
  assert.equal(made.mode, 'dark');
  assert.match(made.label, /오션/);
  assert.match(made.label, /\(사용자\)/);
  assert.deepEqual(made.colors, baseColorsOf(themeById('ocean')));
  const picked = pickSettingsValues({ theme: 'ocean', customThemes: [made] }, {});
  assert.equal(picked.theme, 'ocean');
  assert.deepEqual(picked.customThemes, [made]);

  const app = fs.readFileSync(path.join(root, 'src', 'App.jsx'), 'utf8');
  assert.match(app, /id === 'settings' \|\| id === 'themeSettings' \|\| id === 'newCustomTheme'/);
  assert.match(app, /newCustom: id === 'newCustomTheme'/);
  assert.match(app, /tab: id === 'settings' \? undefined : 'theme'/);
  const dlg = fs.readFileSync(path.join(root, 'src', 'dialogs', 'Dialogs.jsx'), 'utf8');
  assert.match(dlg, /newCustom: extra\.newCustom === true/);
  assert.match(dlg, /tab: extra\.tab/);
  const settings = fs.readFileSync(path.join(root, 'src', 'dialogs', 'SettingsDialog.jsx'), 'utf8');
  assert.match(settings, /spec\.newCustom/);
  assert.match(settings, /set_tab_theme/);
  assert.match(settings, /CustomThemeEditor/);
  assert.match(settings, /ThemeColumns/);
});

test('theme menu: desktop window is independent and placed from the caret rectangle', () => {
  const data = { current: 'nord', language: 'ko', fontSize: 13, customThemes: [], bg: '#2e3440' };
  const args = themeMenuArgs({ left: 800, right: 824, top: 4, bottom: 28 }, data);
  assert.deepEqual(args.args.anchor, { left: 800, right: 824, top: 4, bottom: 28 });
  assert.equal(args.args.data, data);

  const rust = fs.readFileSync(path.join(root, 'src-tauri', 'src', 'dialogs.rs'), 'utf8');
  assert.match(rust, /const THEME_MENU: &str = "theme-menu"/);
  assert.match(rust, /\.decorations\(false\)/);
  assert.match(rust, /\.skip_taskbar\(true\)/);
  assert.match(rust, /\.visible\(false\)/);
  assert.match(rust, /builder\.parent\(&main\)/);
  assert.match(rust, /WindowEvent::Focused\(false\)/);
  assert.match(rust, /window\.__MFC_MENU__/);
  assert.match(rust, /emit_to\("main", "theme-menu:pick"/);
  const main = fs.readFileSync(path.join(root, 'src-tauri', 'src', 'main.rs'), 'utf8');
  for (const name of ['theme_menu_open', 'theme_menu_size', 'theme_menu_pick', 'theme_menu_close']) {
    assert.match(main, new RegExp(`dialogs::${name}`));
  }
  const page = fs.readFileSync(path.join(root, 'src', 'main.jsx'), 'utf8');
  assert.match(page, /__MFC_MENU__/);
  assert.match(page, /ThemeMenuWindow/);
  const css = fs.readFileSync(path.join(root, 'src', 'styles.css'), 'utf8');
  assert.match(css, /\.theme-modes \{[^}]*flex-direction:\s*column/);
  assert.match(css, /\.theme-list \{[^}]*grid-auto-flow:\s*column/);
  assert.match(css, /grid-template-rows:\s*repeat\(10,\s*auto\)/);
  assert.match(css, /grid-template-columns:\s*repeat\(2,\s*minmax\(150px,\s*1fr\)\)/);
  assert.match(css, /html\.menu-window \.ctx-menu\.theme-menu \{[^}]*position:\s*static/);
  const toolbar = fs.readFileSync(path.join(root, 'src', 'components', 'Toolbar.jsx'), 'utf8');
  assert.match(toolbar, /openThemeMenu\(button/);
  assert.match(toolbar, /ThemePopup/);
  assert.match(toolbar, /isDesktop/);
});

test('path crumbs: each directory is its own jump, without a doubled separator', () => {
  const { pathCrumbs } = ui;
  assert.deepEqual(pathCrumbs(''), []);
  assert.deepEqual(pathCrumbs('C:\\Users\\a\\b').map((c) => c.path), ['C:\\', 'C:\\Users', 'C:\\Users\\a', 'C:\\Users\\a\\b']);
  assert.deepEqual(pathCrumbs('C:\\Users\\a\\b').map((c) => c.sep), ['', '', '\\', '\\']);
  assert.deepEqual(pathCrumbs('\\\\server\\share\\dir').map((c) => c.path), ['\\\\server', '\\\\server\\share', '\\\\server\\share\\dir']);
  assert.deepEqual(pathCrumbs('/var/ftp/in').map((c) => [c.name, c.path, c.sep]), [
    ['/', '/', ''],
    ['var', '/var', ''],
    ['ftp', '/var/ftp', '/'],
    ['in', '/var/ftp/in', '/'],
  ]);

  const jumps = [];
  const tree = ui.PathCrumbs({ path: 'C:\\Users\\a', onJump: (p) => jumps.push(p) });
  const buttons = buttonsOf(tree);
  assert.deepEqual(buttons.map((b) => b.props.children), ['C:\\', 'Users', 'a']);
  buttons[1].props.onClick();
  buttons[2].props.onClick();
  assert.deepEqual(jumps, ['C:\\Users', 'C:\\Users\\a']);
  assert.equal(buttons[0].props.title, t('path_jump', { path: 'C:\\' }));

  const plain = ui.PathCrumbs({ path: '/var/ftp', onJump() {}, mark: false });
  let marked = false;
  walk(plain, (el) => { if (el.props && el.props.className === 'path-mark') marked = true; });
  assert.equal(marked, false);
  const markedTree = ui.PathCrumbs({ path: '/var/ftp', onJump() {} });
  let sawMark = false;
  walk(markedTree, (el) => { if (el.props && el.props.className === 'path-mark') sawMark = true; });
  assert.equal(sawMark, true);

  const local = fs.readFileSync(path.join(root, 'src', 'components', 'LocalTree.jsx'), 'utf8');
  const remote = fs.readFileSync(path.join(root, 'src', 'components', 'RemotePanel.jsx'), 'utf8');
  const start = fs.readFileSync(path.join(root, 'src', 'components', 'StartPage.jsx'), 'utf8');
  assert.match(local, /<LocalHeadPath onJump=\{expandTo\}/);
  assert.match(remote, /<PathCrumbs path=\{path\} onJump=\{onNavigate\}/);
  assert.match(start, /onJump=\{onJumpServer\}/);
  assert.match(start, /onJump=\{onJumpLocal\}/);
  assert.match(start, /mark=\{false\}/);
  const app = fs.readFileSync(path.join(root, 'src', 'App.jsx'), 'utf8');
  assert.match(app, /onJumpLocal=\{\(p\) => \{ setStartOn\(false\)/);
  assert.match(app, /onJumpServer=\{\(p\) => \{ setStartOn\(false\)/);
});

test('window drag: icon, name and version move the window; buttons do not', () => {
  const toolbar = fs.readFileSync(path.join(root, 'src', 'components', 'Toolbar.jsx'), 'utf8');
  const backend = fs.readFileSync(path.join(root, 'src', 'lib', 'backend.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'src', 'styles.css'), 'utf8');
  assert.match(toolbar, /<span className="tb-brand">/);
  assert.doesNotMatch(toolbar, /tb-brand" data-no-drag/);
  assert.match(toolbar, /tb-logo/);
  assert.match(toolbar, /tb-title/);
  assert.match(toolbar, /tb-version/);
  assert.doesNotMatch(toolbar, /closest\([^)]*tb-brand/);
  assert.match(backend, /DRAG_REGIONS = '\.toolbar, \.start-hero, \.dlg\.standalone \.dlg-title, \.doc-head'/);
  assert.match(backend, /NO_DRAG = 'button, select, input, textarea, a,/);
  assert.match(backend, /startDragging\(\)/);
  assert.match(toolbar, /onMouseDown=\{onDown\}/);
  assert.match(css, /\.tb-spacer \{[^}]*align-self:\s*stretch/);
  const hit = (drag, control) => ({ closest: (sel) => (control && /button|select|input|textarea|\.tb-conn|\.tb-font|\.tb-profile|data-no-drag/.test(sel) ? { control: true } : drag && /\.toolbar|\.start-hero|\.dlg-title|\.doc-head/.test(sel) ? { drag: true } : null) });
  assert.equal(shouldWindowDrag(hit(true, false)), true);
  assert.equal(shouldWindowDrag(hit(true, true)), false);
  assert.equal(shouldWindowDrag(hit(false, false)), false);
});

test('dock: collapse keeps the header, and add stays at the right edge', () => {
  const panel = fs.readFileSync(path.join(root, 'src', 'components', 'LogPanel.jsx'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'src', 'styles.css'), 'utf8');
  const toolbar = fs.readFileSync(path.join(root, 'src', 'components', 'Toolbar.jsx'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'src', 'App.jsx'), 'utf8');
  assert.match(panel, /dock-tab-tools[\s\S]*panelBottom[\s\S]*dock-tab-plus/);
  assert.match(panel, /aria-expanded=\{!collapsed\}/);
  assert.match(toolbar, /name="panelBottom"[\s\S]*\{t\(dockCollapsed \? 'dock_expand' : 'dock_collapse'\)\}/);
  assert.match(toolbar, /aria-pressed=\{!dockCollapsed\}/);
  assert.match(css, /\.log-dock\.collapsed \.h-splitter,\s*\n\.log-dock\.collapsed \.dock-body \{ display: none; \}/);
  assert.match(css, /\.dock-tab-plus \{[^}]*position:\s*absolute;\s*right:\s*4px/);
  assert.match(css, /\.log-head \{[^}]*padding:\s*2px 30px 0 6px/);
  assert.match(app, /id === 'toggleDock'/);
  assert.match(app, /logCollapsed: next/);
  assert.match(app, /logCollapsed: false/);
  const session = fs.readFileSync(path.join(root, 'core', 'session.js'), 'utf8');
  assert.match(session, /logCollapsed: false/);
});
