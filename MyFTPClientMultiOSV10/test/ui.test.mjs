// UI helpers: settings payload, dialog cloning, themes, i18n, path/host formatting.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SETTINGS_DEFAULTS, pickSettingsValues } from '../src/lib/settings.js';
import { serializablePayload, detachedDialogsEnabled } from '../src/lib/dialogWindows.js';
import { THEMES, DEFAULT_THEME, themeById, nextThemeId, themeSwatchStyle } from '../src/themes.js';
import { I18N, setLanguage, getLanguage, t } from '../src/lib/i18n.js';
import {
  formatSize, formatSpeed, timeStamp, setSeparator, getSeparator,
  joinLocal, baseName, dirName, posixJoin, posixParent, samePath, isUnder,
  truncateMiddle, parseHostInput, iconFor,
} from '../src/lib/format.js';
import { describeError } from '../src/lib/errors.js';

const root = path.dirname(fileURLToPath(new URL('.', import.meta.url)));

test('settings: pickSettingsValues fills defaults and drops extra session fields', () => {
  const picked = pickSettingsValues({
    language: 'en',
    theme: 'nord',
    lastProfile: 'work',
    windowBounds: { x: 1 },
    lastLocalPath: 'C:\\old',
  }, { localDir: 'D:\\now' });
  assert.equal(picked.language, 'en');
  assert.equal(picked.theme, 'nord');
  assert.equal(picked.fontSize, SETTINGS_DEFAULTS.fontSize);
  assert.equal(picked.terminalFont, '');
  assert.equal(picked.terminalFontSize, 13);
  assert.equal(picked.terminalMaxLines, 10000);
  assert.equal(picked.powershellPrompt, 'PS {path}> ');
  assert.equal(picked.shellPrompts.cmd, '{path}>');
  assert.notEqual(picked.shellPrompts.cmd, picked.shellPrompts.powershell);
  assert.notEqual(picked.shellPrompts['git-bash'], picked.shellPrompts.wsl);
  assert.equal(picked.lastLocalPath, 'D:\\now');
  assert.equal(picked.lastProfile, undefined);
  assert.equal(picked.windowBounds, undefined);
  assert.equal(picked.onPreviewTheme, undefined);
});

test('settings: empty values still produce a complete form payload', () => {
  const picked = pickSettingsValues(null, {});
  for (const k of Object.keys(SETTINGS_DEFAULTS)) {
    if (typeof SETTINGS_DEFAULTS[k] === 'object' && SETTINGS_DEFAULTS[k]) assert.deepEqual(picked[k], SETTINGS_DEFAULTS[k], k);
    else assert.equal(picked[k], SETTINGS_DEFAULTS[k], k);
  }
  assert.equal(picked.lastLocalPath, '');
});

test('dialogs: serializablePayload strips functions so IPC can clone the spec', () => {
  const out = serializablePayload({
    title: '설정',
    values: { theme: 'midnight' },
    onPreviewTheme: () => {},
    nested: { ok: true, fn: () => 1 },
  });
  assert.equal(out.title, '설정');
  assert.equal(out.values.theme, 'midnight');
  assert.equal(out.onPreviewTheme, undefined);
  assert.equal(out.nested.ok, true);
  assert.equal(out.nested.fn, undefined);
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(out)));
  assert.equal(detachedDialogsEnabled(), false);
});

test('dialogs: every popup is locked; only non-settings windows fit to content', () => {
  const src = fs.readFileSync(path.join(root, 'electron', 'dialogs.js'), 'utf8');
  assert.match(src, /settings:\s*\{[^}]*width:\s*540/);
  assert.match(src, /settings:\s*\{[^}]*height:\s*520/);
  assert.match(src, /settings:\s*\{[^}]*fit:\s*false/);
  assert.match(src, /resizable:\s*false/);
  assert.match(src, /maximizable:\s*false/);
  assert.match(src, /applyLockedDialogSize/);
  assert.match(src, /spec\.fit === false/);
  assert.doesNotMatch(src, /!win\.isResizable\(\)/);
  const win = fs.readFileSync(path.join(root, 'src', 'DialogWindow.jsx'), 'utf8');
  assert.match(win, /ResizeObserver/);
  assert.match(win, /kind === 'settings'/);
});

test('settings: items are grouped into tabs without a scrolling body', () => {
  const dlg = fs.readFileSync(path.join(root, 'src', 'dialogs', 'SettingsDialog.jsx'), 'utf8');
  assert.match(dlg, /set_tab_general/);
  assert.match(dlg, /set_tab_terminal/);
  assert.match(dlg, /set_tab_transfer/);
  assert.match(dlg, /settings-tabs/);
  assert.match(dlg, /className="settings-dlg"/);
  assert.match(dlg, /\bfill\b/);
  assert.doesNotMatch(dlg, /overflow:\s*(auto|scroll)/);
  const win = fs.readFileSync(path.join(root, 'src', 'DialogWindow.jsx'), 'utf8');
  assert.match(win, /kind === 'settings'/);
  assert.match(win, /dlg-window-fill/);
  const css = fs.readFileSync(path.join(root, 'src', 'styles.css'), 'utf8');
  assert.match(css, /\.dlg\.fill \.dlg-body/);
  assert.match(css, /overflow: hidden/);
  assert.match(css, /\.settings-pane/);
});

test('terminal: UI closes the tab when the session exits', () => {
  const panel = fs.readFileSync(path.join(root, 'src', 'components', 'LogPanel.jsx'), 'utf8');
  assert.match(panel, /onTerminalExit/);
  assert.match(panel, /closeTab\(msg\.id\)/);
  assert.match(panel, /onExit=\{\(\) => closeTab\(tab\.id\)\}/);
  const view = fs.readFileSync(path.join(root, 'src', 'components', 'TerminalView.jsx'), 'utf8');
  assert.match(view, /onExit/);
  assert.match(view, /fireExit/);
  assert.match(view, /alive === false/);
  const core = fs.readFileSync(path.join(root, 'core', 'terminal.js'), 'utf8');
  assert.match(core, /function parseExitLine/);
  assert.match(core, /Bye\.\\r\\n/);
  assert.match(core, /\\u0004/);
  assert.match(core, /this\.finish\(leaving\.code\)/);
});

test('installer: existing install asks to uninstall first', () => {
  const src = fs.readFileSync(path.join(root, 'build', 'installer.nsh'), 'utf8');
  assert.match(src, /이미 설치되어 있습니다/);
  assert.match(src, /기존 설치를 삭제한 뒤 새로 설치할까요/);
  assert.match(src, /MB_YESNO\|MB_ICONQUESTION/);
  assert.match(src, /\/SD IDYES IDYES MfcRemovePrevious/);
  assert.match(src, /^\s*Abort\s*$/m);
  assert.match(src, /PrevUninstaller/);
  assert.match(src, /--updated/);
  assert.match(src, /UNINSTALL_FILENAME/);
  assert.match(src, /taskkill \/F \/IM/);
});

test('main window minimum size keeps the window buttons visible', () => {
  const main = fs.readFileSync(path.join(root, 'electron', 'main.js'), 'utf8');
  assert.match(main, /MIN_WINDOW_WIDTH\s*=\s*1200/);
  assert.match(main, /MIN_WINDOW_HEIGHT\s*=\s*720/);
  assert.match(main, /minWidth:\s*MIN_WINDOW_WIDTH/);
  assert.match(main, /minHeight:\s*MIN_WINDOW_HEIGHT/);
  const tb = fs.readFileSync(path.join(root, 'src', 'components', 'Toolbar.jsx'), 'utf8');
  assert.match(tb, /className="tb-main"/);
  assert.match(tb, /WindowButtons/);
  assert.match(tb, /tb-theme-label/);
  const css = fs.readFileSync(path.join(root, 'src', 'styles.css'), 'utf8');
  assert.match(css, /\.tb-main/);
  assert.match(css, /1200/);
  assert.match(css, /flex-wrap: nowrap/);
  assert.match(css, /\.tb-theme-label/);
});

test('toolbar: font size cluster uses icon-only decrease / increase', () => {
  const src = fs.readFileSync(path.join(root, 'src', 'components', 'Toolbar.jsx'), 'utf8');
  assert.match(src, /fontDecrease/);
  assert.match(src, /fontIncrease/);
  assert.match(src, /tb-font-size/);
  assert.match(src, /fontDec/);
  assert.match(src, /fontInc/);
  assert.match(src, /\{size\}px/);
  const icons = fs.readFileSync(path.join(root, 'src', 'components', 'Icons.jsx'), 'utf8');
  assert.match(icons, /fontDecrease:/);
  assert.match(icons, /fontIncrease:/);
});

test('npm test uses the custom reporter', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.match(pkg.scripts.test, /--test-reporter=\.\/test\/reporter\.mjs/);
  assert.match(pkg.scripts.test, /test\/\*\.test\.mjs/);
  assert.equal(fs.existsSync(path.join(root, 'test', 'reporter.mjs')), true);
});

test('themes: 16 themes, lookup, cycle, swatch', () => {
  assert.equal(THEMES.length, 16);
  assert.equal(DEFAULT_THEME, 'midnight');
  assert.equal(themeById('nord').id, 'nord');
  assert.equal(themeById('missing').id, DEFAULT_THEME);
  assert.ok(THEMES.every((th) => th.tokens['--bg'] && th.tokens['--accent'] && th.label && th.labelEn));
  const ids = THEMES.map((th) => th.id);
  assert.equal(new Set(ids).size, 16);
  let id = DEFAULT_THEME;
  for (let i = 0; i < THEMES.length; i++) id = nextThemeId(id);
  assert.equal(id, DEFAULT_THEME);
  const sw = themeSwatchStyle(themeById('graphite'));
  assert.match(sw.background, /linear-gradient/);
});

test('i18n: Korean and English catalogs share the same keys', () => {
  const koKeys = Object.keys(I18N.ko).sort();
  const enKeys = Object.keys(I18N.en).sort();
  assert.deepEqual(enKeys, koKeys);
  assert.ok(koKeys.length > 80);
  setLanguage('ko');
  assert.equal(getLanguage(), 'ko');
  assert.equal(t('settings_title'), '설정');
  assert.equal(t('items_count', { n: 3 }), '3개 항목');
  setLanguage('en');
  assert.equal(t('settings_title'), 'Settings');
  assert.equal(t('items_count', { n: 3 }), '3 items');
  setLanguage('xx');
  assert.equal(getLanguage(), 'ko');
  setLanguage('ko');
});

test('format: size, speed, paths, host paste, icons', () => {
  assert.equal(formatSize(500), '500 B');
  assert.equal(formatSize(2048), '2.0 KB');
  assert.equal(formatSpeed(0), '');
  assert.equal(formatSpeed(2048), '2 KB/s');
  assert.match(timeStamp(new Date(2026, 0, 1, 9, 8, 7)), /09:08:07/);

  setSeparator('\\');
  assert.equal(getSeparator(), '\\');
  assert.equal(joinLocal('C:\\a', 'b.txt'), 'C:\\a\\b.txt');
  assert.equal(baseName('C:\\a\\b.txt'), 'b.txt');
  assert.equal(dirName('C:\\a\\b.txt'), 'C:\\a');
  assert.equal(dirName('C:\\x'), 'C:\\');
  assert.equal(samePath('C:\\A', 'c:\\a'), true);
  assert.equal(isUnder('C:\\a\\b', 'C:\\a'), true);
  assert.match(truncateMiddle('C:\\very\\long\\path\\file.txt', 20), /file\.txt/);

  setSeparator('/');
  assert.equal(posixJoin('/', 'pub'), '/pub');
  assert.equal(posixJoin('/pub', 'a'), '/pub/a');
  assert.equal(posixParent('/pub/a'), '/pub');
  assert.equal(posixParent('/pub'), '/');

  assert.deepEqual(parseHostInput('sftp://user:pw@example.com:2222/home'), {
    protocol: 'SFTP', user: 'user', password: 'pw', host: 'example.com', port: '2222',
  });
  assert.deepEqual(parseHostInput('ftps://a.b.c'), { protocol: 'FTPS', host: 'a.b.c' });
  assert.deepEqual(parseHostInput('[::1]:21'), { host: '::1', port: '21' });

  assert.equal(iconFor('docs', true), 'folder');
  assert.equal(iconFor('a.png'), 'fileImage');
  assert.equal(iconFor('a.zip'), 'fileArchive');
  assert.equal(iconFor('a.js'), 'fileCode');
  assert.equal(iconFor('a.pdf'), 'filePdf');
  assert.equal(iconFor('a.bin'), 'file');
});

test('describeError: SFTP auth and NOT_CONNECTED', () => {
  setLanguage('en');
  const auth = describeError('All configured authentication methods failed');
  assert.match(auth.message, /password|login|auth/i);
  const nc = Object.assign(new Error('Not connected'), { code: 'NOT_CONNECTED' });
  const r = describeError(nc);
  assert.equal(r.fields.find((f) => f.key === 'code').value, 'NOT_CONNECTED');
  setLanguage('ko');
});
