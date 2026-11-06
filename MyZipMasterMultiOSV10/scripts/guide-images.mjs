// npm run guide:images: the user's guide's pictures, in both languages, taken from the real program.
// It runs a debug build with its own settings and sample files in a temporary folder.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { freePort } from './free-port.mjs';
import { by, page, waitTarget } from '../test/e2e/ui.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const built = spawnSync(npm, ['run', '-s', 'build:debug'], { cwd: root, shell: process.platform === 'win32', stdio: 'inherit' });
if (built.status !== 0) process.exit(1);
const exe = path.join(process.env.CARGO_TARGET_DIR || path.join(root, 'target'), 'debug', process.platform === 'win32' ? 'myzipmaster.exe' : 'myzipmaster');

const NAMES = {
  ko: { folder: '프로젝트 자료', files: { '보고서.txt': '분기 보고서\n'.repeat(4000), '회의록.txt': '회의록\n'.repeat(3000), '예산.csv': 'a,b,c\n'.repeat(6000) }, archive: '프로젝트 자료.zip' },
  en: { folder: 'Project files', files: { 'report.txt': 'Quarterly report\n'.repeat(4000), 'minutes.txt': 'Minutes\n'.repeat(3000), 'budget.csv': 'a,b,c\n'.repeat(6000) }, archive: 'Project files.zip' },
};

async function shootLanguage(lang) {
  const out = path.join(root, 'doc', 'images', lang);
  fs.mkdirSync(out, { recursive: true });
  // Short, so the address bar in the pictures is readable.
  let base = path.join(path.parse(os.tmpdir()).root, 'zm-guide');
  try {
    fs.mkdirSync(base, { recursive: true });
  } catch {
    base = fs.mkdtempSync(path.join(os.tmpdir(), 'zm-guide-'));
  }
  const names = NAMES[lang];
  // A made-up home folder: the pictures must show nothing of this machine's own files.
  const home = path.join(base, 'home');
  for (const folder of ['Desktop', 'Documents', 'Downloads']) fs.mkdirSync(path.join(home, folder), { recursive: true });
  const work = path.join(home, 'Documents', names.folder);
  fs.mkdirSync(work, { recursive: true });
  for (const [name, text] of Object.entries(names.files)) fs.writeFileSync(path.join(work, name), text);
  fs.mkdirSync(path.join(base, 'config'));
  fs.writeFileSync(path.join(base, 'config', 'settings.json'), JSON.stringify({ 'zm-lang': lang, 'zm-theme': 'dark' }));

  const port = await freePort(9500);
  const child = spawn(exe, [], {
    env: {
      ...process.env,
      MYZIPMASTER_TEST: '1',
      MYZIPMASTER_SAMPLE_HOME: home,
      MYZIPMASTER_CONFIG_DIR: path.join(base, 'config'),
      WEBVIEW2_USER_DATA_FOLDER: path.join(os.tmpdir(), 'zm-guide-webview'),
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
    },
    stdio: 'ignore',
  });
  try {
    const main = await waitTarget(port, (t) => !t.url.includes('#') && (t.url.includes('index.html') || t.url.includes('tauri.localhost') || t.url.startsWith('tauri:')), 40000);
    const ui = await page(main);
    await ui.waitFor(by('start-screen'), 30000);
    await ui.js(`window.__zmDialogs = { open: [], folder: [], save: [] }; 1`);
    await ui.sleep(1800);
    await ui.shot(path.join(out, 'start.png'));

    await ui.click(by('start-browse'));
    await ui.until('window.__zmOpenFolder');
    await ui.c.evaluate(`window.__zmOpenFolder(${JSON.stringify(work)}); 1`);
    await ui.waitFor(ui.rowSel(Object.keys(names.files)[0]));
    for (const name of Object.keys(names.files)) await ui.click(ui.rowSel(name), { modifiers: 2 });
    await ui.sleep(300);
    await ui.shot(path.join(out, 'folder.png'));

    await ui.click(by('btn-pack'));
    await ui.waitFor(by('create-dialog'));
    await ui.sleep(300);
    await ui.shot(path.join(out, 'create.png'));
    await ui.choose(by('split'), 'custom');
    await ui.choose(by('split-unit'), 'MB');
    await ui.fill(by('split-text'), '10');
    await ui.sleep(200);
    await ui.shot(path.join(out, 'split.png'));
    await ui.choose(by('split'), 'none');
    const archive = path.join(path.dirname(work), names.archive);
    await ui.fill(by('output'), archive);
    await ui.click(by('create-start'));
    await ui.waitFor(by('result-dialog'), 30000);
    await ui.click(by('result-open'));
    await ui.waitFor(by('status-format'), 30000);
    await ui.sleep(500);
    await ui.shot(path.join(out, 'archive.png'));

    await ui.click(by('btn-unpack'));
    await ui.waitFor(by('extract-dialog'));
    await ui.sleep(200);
    await ui.shot(path.join(out, 'extract.png'));
    await ui.click(`${by('extract-dialog')} .modal-head .iconbtn`);
    await ui.click(by('btn-tools'));
    await ui.waitFor(by('tools-menu'));
    await ui.sleep(200);
    await ui.shot(path.join(out, 'tools.png'));
    await ui.click(by('btn-tools'));

    await ui.click(by('btn-settings'));
    const st = await waitTarget(port, (t) => t.url.endsWith('#settings'));
    const s = await page(st);
    await s.waitFor(by('settings-page'));
    await s.sleep(400);
    await s.shot(path.join(out, 'settings-general.png'));
    await s.click('[data-settings-tab="start"]');
    await s.sleep(200);
    await s.shot(path.join(out, 'settings-start.png'));
    await s.click('[data-settings-tab="appearance"]');
    await s.sleep(300);
    await s.shot(path.join(out, 'settings.png'));
    await s.click(by('settings-ok')).catch(() => {});
    s.c.close();

    await ui.sleep(500);
    // A real failure: a file that is no archive.
    const broken = path.join(work, lang === 'ko' ? '깨진 파일.zip' : 'broken.zip');
    fs.writeFileSync(broken, 'this is not an archive');
    await ui.js(`window.__zmDialogs.open.push(${JSON.stringify([broken])}); 1`);
    await ui.click(by('btn-file'));
    await ui.click(by('menu-open'));
    await ui.waitFor(by('error-dialog'), 20000);
    await ui.sleep(300);
    await ui.shot(path.join(out, 'error.png'));
    await ui.click(by('error-ok'));
    await ui.sleep(200);
    await ui.click(by('btn-theme'));
    const mt = await waitTarget(port, (t) => t.url.endsWith('#thememenu'));
    const m = await page(mt);
    await m.waitFor(by('theme-menu'));
    await m.sleep(500);
    await m.shot(path.join(out, 'themes.png'));
    m.c.close();
    console.log(`${lang}: ${fs.readdirSync(out).length} pictures`);
  } finally {
    child.kill();
    await new Promise((r) => setTimeout(r, 800));
    fs.rmSync(base, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  }
}

for (const lang of ['ko', 'en']) await shootLanguage(lang);
process.exit(0);
