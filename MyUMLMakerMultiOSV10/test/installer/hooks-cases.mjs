// Runs the real installer hooks (src-tauri/windows/hooks.nsh) against a fake installation:
// hooks-test.nsi includes the hooks file with every path and registry key pointed at a
// temporary folder and HKCU\Software\MyUMLMakerHookTest, and answers the questions through
// MessageBox /SD (it runs silently). The real installer is never run, and the user's
// installation, %APPDATA% and %LOCALAPPDATA% are never touched.
//
//   node test/installer/hooks-cases.mjs        (also part of `npm test -- --installer`)
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const HOOKS = path.join(root, 'src-tauri', 'windows', 'hooks.nsh');
const TESTKEY = 'HKCU\\Software\\MyUMLMakerHookTest';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function findMakensis() {
  const candidates = [path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local'), 'tauri', 'NSIS', 'makensis.exe'), 'C:\\Program Files (x86)\\NSIS\\makensis.exe'];
  return candidates.find((file) => fs.existsSync(file)) ?? null;
}

/** Calls check(name, fn) for every case; fn throws on failure. */
export async function runHookCases(check) {
  const makensis = findMakensis();
  if (!makensis) throw new Error('makensis.exe not found (it comes with the first `npm run build:win`)');
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'myumlmaker-hooks-'));
  const run = (cmd, args) => spawnSync(cmd, args, { encoding: 'utf8', windowsHide: true });
  const reg = (...args) => run('reg', args);
  const compile = (script, defines) => {
    const r = run(makensis, ['-V2', ...Object.entries(defines).map(([k, v]) => `-D${k}=${v}`), script]);
    if (r.status !== 0) throw new Error(`makensis ${path.basename(script)}\n${r.stdout}\n${r.stderr}`);
    const warnings = r.stdout.split(/\r?\n/).filter((line) => /warning/i.test(line));
    if (warnings.length) throw new Error(`makensis warnings:\n${warnings.join('\n')}`);
  };
  const base = path.join(work, 'case');
  const old = path.join(base, 'old', 'MyUMLMaker');
  const roaming = path.join(base, 'Roaming', 'com.shkwon.myumlmaker');
  const local = path.join(base, 'Local', 'com.shkwon.myumlmaker');
  const fake = path.join(work, 'fake-uninstall.exe');
  const builds = new Map();
  const desktop = path.join(base, 'Desktop');
  const programs = path.join(base, 'Programs');
  const installer = (mode, ask, running = 'IDOK', reinstall = 'IDYES') => {
    const key = `${mode}-${ask}-${running}-${reinstall}`;
    if (!builds.has(key)) {
      const out = path.join(work, `hooks-${key}.exe`);
      compile(path.join(here, 'hooks-test.nsi'), {
        HOOKS, OUT: out, MODE: mode, INST: path.join(base, 'new', 'MyUMLMaker'), RESULT: path.join(base, 'result.txt'),
        MUM_ROAMING: roaming, MUM_LOCAL: local, MUM_DESKTOP: desktop, MUM_SMPROGRAMS: programs,
        MUM_UNKEY: 'Software\\MyUMLMakerHookTest\\Uninstall\\MyUMLMaker', MUM_PRODKEY: 'Software\\MyUMLMakerHookTest\\SHKWON\\MyUMLMaker',
        MUM_SD_ASK: ask, MUM_SD_RUNNING: running, MUM_SD_REINSTALL: reinstall,
      });
      builds.set(key, out);
    }
    run(builds.get(key), ['/S']);
  };
  const result = () => {
    const file = path.join(base, 'result.txt');
    if (!fs.existsSync(file)) return null;
    return Object.fromEntries(fs.readFileSync(file, 'utf16le').replace(/^\uFEFF/, '').split('|').map((part) => part.split('=')).map(([k, ...v]) => [k, v.join('=')]));
  };
  const calls = () => { const file = path.join(base, 'old', 'uninstall-calls.log'); return fs.existsSync(file) ? fs.readFileSync(file, 'latin1') : ''; };
  const registered = () => reg('query', `${TESTKEY}\\Uninstall\\MyUMLMaker`).status === 0;
  const dataKept = () => fs.existsSync(path.join(roaming, 'window-state.json')) && fs.existsSync(path.join(local, 'EBWebView', 'Default', 'Local Storage'));
  const shortcuts = (folder = 'MyUMLMaker') => [path.join(desktop, 'MyUMLMaker.lnk'), path.join(programs, folder, 'MyUMLMaker.lnk'), path.join(programs, folder, "MyUMLMaker User's Guide.lnk")];
  const setup = ({ install = false, data = false, emptyLocal = false, stale = false, app = null, links = null } = {}) => {
    fs.rmSync(base, { recursive: true, force: true });
    fs.mkdirSync(base, { recursive: true });
    reg('delete', TESTKEY, '/f');
    if (install) {
      fs.mkdirSync(path.join(old, 'docs'), { recursive: true });
      fs.copyFileSync(fake, path.join(old, 'uninstall.exe'));
      fs.writeFileSync(path.join(old, 'docs', 'UsersGuide.html'), 'x');
      if (app) fs.copyFileSync(app, path.join(old, 'MyUMLMaker.exe'));
      else fs.writeFileSync(path.join(old, 'MyUMLMaker.exe'), 'x');
    }
    if (install || stale) reg('add', `${TESTKEY}\\Uninstall\\MyUMLMaker`, '/v', 'UninstallString', '/d', `"${stale ? path.join(base, 'gone', 'uninstall.exe') : path.join(old, 'uninstall.exe')}"`, '/f');
    if (data) {
      fs.mkdirSync(path.join(roaming, 'background'), { recursive: true });
      fs.writeFileSync(path.join(roaming, 'window-state.json'), '{}');
      fs.mkdirSync(path.join(local, 'EBWebView', 'Default', 'Local Storage'), { recursive: true });
    }
    if (emptyLocal) fs.mkdirSync(local, { recursive: true });
    if (links) {
      for (const file of shortcuts(links)) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, 'x'); }
      if (links !== 'MyUMLMaker') reg('add', `${TESTKEY}\\SHKWON\\MyUMLMaker`, '/v', 'StartMenuFolder', '/d', links, '/f');
    }
  };
  const expect = (ok, detail) => { if (!ok) throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail)); };

  try {
    compile(path.join(here, 'fake-uninstall.nsi'), { OUT: fake });
    await check('훅: 이전 설치도 사용자 데이터도 없으면 묻지 않음', () => {
      setup();
      installer('gui', 'IDYES');
      const r = result();
      expect(r && r.wipe === '0' && r.user === '' && calls() === '', r);
      setup({ emptyLocal: true });
      installer('gui', 'IDYES');
      expect(result()?.wipe === '0', 'an empty data folder is not user data');
    });
    await check('훅: 이전 설치 + 데이터, 아니오 → 제자리 제거(/S /UPDATE _?=), 폴더·등록 삭제, 데이터 유지', () => {
      setup({ install: true, data: true });
      installer('gui', 'IDNO');
      const r = result();
      expect(r && r.wipe === '0' && r.user === old, r);
      expect(calls().includes(`/S /UPDATE _?=${old}`), `uninstaller calls: ${calls()}`);
      expect(!fs.existsSync(old) && !registered(), 'old folder and registration removed');
      expect(dataKept(), 'user data kept');
      expect(r.ask.startsWith('이전에 사용하던 사용자 데이터(설정, 최근 파일·폴더, 열린 프로젝트 목록, 데이터베이스 연결, 배경 그림, 튜토리얼 기록, 창 위치)를 삭제할까요?'), `Korean question: ${r.ask}`);
    });
    await check('훅: 데이터만 있음, 예 → %APPDATA%·%LOCALAPPDATA% 데이터 폴더 삭제', () => {
      setup({ data: true });
      installer('gui', 'IDYES');
      const r = result();
      expect(r && r.wipe === '1' && !fs.existsSync(roaming) && !fs.existsSync(local), r);
    });
    await check('훅: 이전 설치만 있음 → 묻고 제거', () => {
      setup({ install: true });
      installer('gui', 'IDYES');
      expect(result()?.wipe === '1' && !fs.existsSync(old), result());
    });
    await check('훅: 이전 설치 → 완전히 삭제하고 다시 설치? 아니오 → 설치 중단, 아무것도 안 바뀜', () => {
      setup({ install: true, data: true, links: 'MyUMLMaker' });
      installer('gui', 'IDYES', 'IDOK', 'IDNO');
      expect(result() === null && fs.existsSync(path.join(old, 'uninstall.exe')) && registered() && calls() === '' && dataKept(), 'nothing changed');
      expect(shortcuts().every((file) => fs.existsSync(file)), 'shortcuts kept');
    });
    await check('훅: 이전 설치 제거 → 바탕 화면·시작 메뉴 바로가기(이름 바꾼 폴더 포함)도 삭제', () => {
      setup({ install: true, links: 'My Tools' });
      installer('gui', 'IDNO');
      expect(result() && !fs.existsSync(old), result());
      expect(shortcuts('My Tools').every((file) => !fs.existsSync(file)) && !fs.existsSync(path.join(programs, 'My Tools')), `old shortcuts and their folder removed: ${JSON.stringify(shortcuts('My Tools').filter((file) => fs.existsSync(file)))}`);
    });
    await check('훅: 취소 → 설치 중단, 이전 설치·등록·데이터 그대로', () => {
      setup({ install: true, data: true });
      installer('gui', 'IDCANCEL');
      expect(result() === null && fs.existsSync(path.join(old, 'uninstall.exe')) && registered() && calls() === '' && dataKept(), 'nothing changed');
    });
    await check('훅: 조용한 설치(/S) → 묻지 않음, 데이터 유지, 이전 설치 제거', () => {
      setup({ install: true, data: true });
      installer('silent', 'IDYES');
      const r = result();
      expect(r && r.wipe === '' && r.done === '1' && !fs.existsSync(old) && calls().includes('/S /UPDATE') && dataKept(), r);
    });
    await check('훅: 파일이 없어진 낡은 등록 → 지우고 설치로 치지 않음', () => {
      setup({ stale: true });
      installer('gui', 'IDYES');
      const r = result();
      expect(r && r.wipe === '0' && r.user === '' && !registered(), r);
    });
    const app = path.join(root, 'src-tauri', 'target', 'debug', 'myumlmaker.exe');
    if (fs.existsSync(app)) {
      await check('훅: 실행 중인 MyUMLMaker 두 개 → 취소면 그대로, 확인이면 모두 닫고 제거', async () => {
        setup({ install: true, data: true, app });
        const env = { ...process.env, MYUMLMAKER_LOCK_DIR: path.join(base, 'lock'), MYUMLMAKER_CONFIG_DIR: path.join(base, 'cfg'), MYUMLMAKER_DATA_DIR: path.join(base, 'cfg'), WEBVIEW2_USER_DATA_FOLDER: path.join(base, 'wv'), MYUMLMAKER_NO_OPEN: '1' };
        delete env.ELECTRON_RUN_AS_NODE;
        delete env.MYUMLMAKER_MULTI;
        const copies = [0, 1].map(() => spawn(path.join(old, 'MyUMLMaker.exe'), [], { env, stdio: 'ignore' }));
        try {
          await sleep(4000);
          expect(copies.every((p) => p.exitCode === null), 'both copies run');
          installer('gui', 'IDNO', 'IDCANCEL');
          await sleep(500);
          expect(result() === null && copies.every((p) => p.exitCode === null) && fs.existsSync(path.join(old, 'uninstall.exe')), 'Cancel keeps them running and changes nothing');
          installer('gui', 'IDNO', 'IDOK');
          for (let i = 0; i < 30 && copies.some((p) => p.exitCode === null); i++) await sleep(100);
          expect(result() && copies.every((p) => p.exitCode !== null) && !fs.existsSync(old), `OK closes both, then removes the old copy (exit ${copies.map((p) => p.exitCode)})`);
        } finally {
          for (const p of copies) if (p.exitCode === null) spawnSync('taskkill', ['/PID', String(p.pid), '/T', '/F'], { windowsHide: true });
        }
      });
    }
  } finally {
    reg('delete', TESTKEY, '/f');
    await sleep(300);
    fs.rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let failed = 0;
  await runHookCases(async (name, fn) => {
    try { await fn(); console.log(`ok   ${name}`); } catch (error) { failed++; console.log(`FAIL ${name}\n     ${error.message}`); }
  });
  process.exit(failed ? 1 : 0);
}
