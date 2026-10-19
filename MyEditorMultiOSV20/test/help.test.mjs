// The Help window, its content, the start-page / settings wiring around it,
// popups closing with the main window, and the window coming up before the
// previous documents are restored.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => fs.readFileSync(path.join(root, ...p), 'utf8');
const helpDir = path.join(root, 'src', 'help', 'ko');
const chapters = fs.readdirSync(helpDir).filter((f) => f.endsWith('.md')).sort();

test('help chapters are numbered, titled, and cover the main features', () => {
  assert.ok(chapters.length >= 15, `${chapters.length} chapters`);
  chapters.forEach((f, i) => assert.match(f, new RegExp(`^${String(i + 1).padStart(2, '0')}-`), f));
  for (const f of chapters) {
    const text = read('src', 'help', 'ko', f);
    assert.match(text, /^# \S/, `${f} starts with a title`);
    assert.ok(text.split('\n').filter((l) => l.startsWith('## ')).length >= 2, `${f} has sections`);
  }
  const all = chapters.map((f) => read('src', 'help', 'ko', f)).join('\n');
  for (const word of ['시작 화면', '사용법 보기', '시작 시 항상 시작 화면 보기', '찾기', '바꾸기', '인코딩', 'Markdown', '터미널', '인쇄', '테마', '단축키', '창 나누기']) {
    assert.ok(all.includes(word), word);
  }
  assert.ok(!/튜토리얼 영상/.test(all), 'no tutorial videos in the app any more');
});

for (const lang of ['ko', 'en']) {
  test(`every ${lang} help image and chapter link resolves`, () => {
    const files = fs.readdirSync(path.join(root, 'src', 'help', lang)).filter((f) => f.endsWith('.md')).sort();
    const images = new Set(fs.readdirSync(path.join(root, 'src', 'help', 'images', lang)));
    let count = 0;
    for (const f of files) {
      const text = read('src', 'help', lang, f);
      for (const [, name] of text.matchAll(/\]\(images\/([^)]+)\)/g)) { count++; assert.ok(images.has(name), `${lang}/${f}: ${name}`); }
      for (const [, link] of text.matchAll(/\]\((\d\d-[^)#]+\.md)(?:#[^)]*)?\)/g)) assert.ok(files.includes(link), `${lang}/${f}: ${link}`);
    }
    assert.ok(count >= 40, `${count} images used`);
  });
}

test('the English help has the same chapters and sections as the Korean one, and follows the UI language', () => {
  const en = fs.readdirSync(path.join(root, 'src', 'help', 'en')).filter((f) => f.endsWith('.md')).sort();
  assert.deepEqual(en.map((f) => f.slice(0, 2)), chapters.map((f) => f.slice(0, 2)));
  const sections = (text) => text.split('\n').filter((l) => l.startsWith('## ')).length;
  en.forEach((f, i) => assert.equal(sections(read('src', 'help', 'en', f)), sections(read('src', 'help', 'ko', chapters[i])), f));
  const win = read('src', 'components', 'HelpWindow.jsx');
  assert.match(win, /const lang = useLanguage\(\);/);
  assert.match(win, /helpChapter\(lang, id\)/);
  assert.match(read('src', 'help', 'index.js'), /import\.meta\.glob\('\.\/images\/\*\/\*\.png'/);
});

test('the Help window opens from the Help menu, F1 and the start page, in its own window', () => {
  const app = read('src', 'App.jsx');
  assert.match(app, /\{ id: 'openHelp', icon: 'help', label: t\('help_menu'\), shortcut: 'F1' \}/);
  assert.match(app, /e\.key === 'F1'\) action\('openHelp'\)/);
  assert.match(app, /case 'openHelp': openHelp\(/);
  const start = read('src', 'components', 'StartPage.jsx');
  // Right under the task grid.
  assert.match(start, /task-grid[\s\S]*?<\/div>\s*<button[^>]*id="start-help"[^>]*onClick=\{\(\) => onAction\('openHelp'\)\}/);
  // Loaded on demand: the help text (both languages) stays out of the main bundle.
  const popup = read('src', 'PopupWindow.jsx');
  assert.match(popup, /const HelpWindow = lazy\(\(\) => import\('\.\/components\/HelpWindow'\)\)/);
  assert.match(popup, /kind === 'help'\) return <Suspense fallback=\{[^}]*\}><HelpWindow/);
  assert.doesNotMatch(popup, /import \{ HelpWindow \}/);
  assert.match(read('src', 'lib', 'tauri-host.js'), /help: \{ width: \d+, height: \d+, resizable: true \}/);
  assert.match(read('src', 'lib', 'backend.js'), /export function openHelp/);
});

test('every popup window is destroyed with the main window', () => {
  const lib = read('src-tauri', 'src', 'lib.rs');
  assert.match(lib, /for \(name, win\) in app\.webview_windows\(\) \{\s*if name != "main"/);
  assert.doesNotMatch(lib, /\["settings", "about", "shortcuts", "print"\]/);
});

test('settings has a start page tab with the launch option and the background controls', () => {
  const dlg = read('src', 'dialogs', 'SettingsDialog.jsx');
  assert.match(dlg, /\['start', t\('set_start_tab'\)\]/);
  assert.match(dlg, /tab === 'start'[\s\S]*?<Check id="showStartOnLaunch"[\s\S]*?<StartScreenControls/);
  assert.match(read('src', 'components', 'StartPage.jsx'), /<StartScreenControls settings=\{settings\} onScreen=\{onScreen\} \/>/);
  const i18n = read('src', 'lib', 'i18n.js');
  assert.match(i18n, /set_start_tab: '시작 화면'/);
  assert.match(i18n, /set_start_tab: 'Start page'/);
});

test('the window comes up before the previous documents are restored', () => {
  const app = read('src', 'App.jsx');
  const boot = app.slice(app.indexOf("const tabs = s.restoreSession"), app.indexOf('bootedRef.current = true;'));
  const ready = boot.indexOf('rendererReady();');
  const shown = boot.indexOf('setBooted(true);');
  const loop = boot.indexOf('for (let i = 0; i < tabs.length; i++)');
  assert.ok(shown > 0 && ready > 0 && loop > 0, 'boot steps found');
  assert.ok(shown < loop && ready < loop, 'UI before the restore loop');
  assert.doesNotMatch(boot, /withProgress\(\{ title: t\('prog_restore'\)/, 'no blocking progress dialog');
  // The reads start together; the session is saved only after the restore.
  assert.match(boot, /const reads = tabs\.map\(/);
  assert.match(app, /bootedRef\.current = true;\s*if \(!restored\) setStartOpen\(true\);\s*schedulePersist\(\);/);
});
