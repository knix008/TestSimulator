'use strict';

/** 빌드·배포 설정과 정리(clean) 명령 — 포장에서 빠지는 파일이 없는지. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const pkg = require('../package.json');

test('npm 명령이 갖춰져 있다', () => {
  for (const name of ['start', 'test', 'clean', 'icons', 'pack', 'build', 'build:win', 'build:mac', 'build:linux']) {
    assert.ok(pkg.scripts[name], `npm run ${name} 이 없다`);
  }
  assert.match(pkg.scripts.test, /--test/, 'test 는 node:test 로 돌린다');
  assert.match(pkg.scripts.test, /test-reporter/, '보고서 형식을 쓴다');
  assert.match(pkg.scripts.clean, /scripts\/clean\.js/);
});

test('검사 파일이 모두 npm test 가 집는 자리에 있다', () => {
  const files = fs.readdirSync(path.join(ROOT, 'test')).filter((name) => name.endsWith('.test.js'));
  assert.ok(files.length >= 8, `검사 파일 수: ${files.length}`);
  assert.match(pkg.scripts.test, /test\/\*\.test\.js/);
});

test('포장에 들어가는 파일 목록이 실제 폴더와 맞는다', () => {
  const files = pkg.build.files;
  for (const needed of ['electron/**/*', 'src/**/*', 'package.json']) {
    assert.ok(files.includes(needed), `포장 목록에 ${needed} 가 없다`);
  }
  // 검사 파일과 도구는 포장에 들어가지 않는다 (들어가면 앱이 무거워진다).
  assert.ok(!files.some((entry) => entry.startsWith('test')), '검사 파일은 포장하지 않는다');
  assert.ok(!files.some((entry) => entry.startsWith('scripts')), '빌드 스크립트는 포장하지 않는다');
});

test('앱 정보와 아이콘 설정이 비어 있지 않다', () => {
  assert.equal(pkg.build.appId, 'com.shkwon.myclock');
  assert.equal(pkg.build.productName, 'MyClock');
  assert.equal(pkg.main, 'electron/main.js');
  assert.ok(fs.existsSync(path.join(ROOT, pkg.main)), 'main 이 가리키는 파일이 없다');
  assert.ok(fs.existsSync(path.join(ROOT, 'asset', 'icon.svg')), '아이콘 원본(svg)이 있어야 한다');

  for (const os of ['win', 'mac', 'linux']) {
    assert.ok(pkg.build[os], `${os} 포장 설정이 없다`);
    assert.ok(pkg.build[os].target, `${os} 산출물 종류가 없다`);
  }
});

test('src 안의 모든 창 문서가 포장 목록에 들어간다', () => {
  const htmls = fs.readdirSync(path.join(ROOT, 'src')).filter((name) => name.endsWith('.html'));
  assert.ok(htmls.length >= 5, `창 문서 수: ${htmls.length}`);
  assert.ok(pkg.build.files.includes('src/**/*'), 'src 전체가 포장된다');
});

test('빌드 산출물은 git 에 올라가지 않는다', () => {
  const ignore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
  for (const entry of ['node_modules/', 'dist/', 'asset/icons/', 'asset/icon.ico']) {
    assert.ok(ignore.includes(entry), `.gitignore 에 ${entry} 가 없다`);
  }
});

test('clean 은 빌드 산출물만 지우고 소스는 건드리지 않는다', () => {
  const source = fs.readFileSync(path.join(ROOT, 'scripts', 'clean.js'), 'utf8');

  // 지우는 목록에 소스·설정이 섞여 있지 않아야 한다.
  for (const forbidden of ["'src'", "'electron'", "'asset/icon.svg'", "'package.json'", "'build/installer.nsh'"]) {
    assert.ok(!source.includes(forbidden), `clean 이 ${forbidden} 을 지우려 한다`);
  }
  assert.match(source, /dist/, 'dist 는 지운다');
  // node_modules 는 --all 을 줄 때만.
  assert.match(source, /withModules && fs\.existsSync/);
  // 프로젝트 밖은 손대지 않는다는 보호 장치가 있다.
  assert.match(source, /프로젝트 밖의 경로/);
});

test('npm run clean -- --dry-run 은 아무것도 지우지 않고 목록만 낸다', () => {
  const before = fs.readdirSync(ROOT).sort();
  const out = execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'clean.js'), '--dry-run'], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' }
  });

  assert.match(out, /지울 빌드 산출물이 없습니다|지우지 않았습니다/);
  assert.deepEqual(fs.readdirSync(ROOT).sort(), before, '파일이 하나도 사라지지 않았다');
  assert.ok(fs.existsSync(path.join(ROOT, 'src')), 'src 는 그대로');
  assert.ok(fs.existsSync(path.join(ROOT, 'electron')), 'electron 은 그대로');
});

test('clean 이 임시 산출물 폴더를 실제로 지운다 (복사본에서 확인)', () => {
  // 진짜 프로젝트에서 지워 버리면 쓰는 사람의 빌드 결과가 날아간다.
  // 그래서 임시 폴더에 흉내만 낸 프로젝트를 만들고 거기서 돌린다.
  const room = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'myclock-clean-'));
  fs.mkdirSync(path.join(room, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(room, 'dist', 'win-unpacked'), { recursive: true });
  fs.mkdirSync(path.join(room, 'asset', 'icons'), { recursive: true });
  fs.mkdirSync(path.join(room, 'src'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'scripts', 'clean.js'), path.join(room, 'scripts', 'clean.js'));
  fs.writeFileSync(path.join(room, 'dist', 'win-unpacked', 'MyClock.exe'), 'x');
  fs.writeFileSync(path.join(room, 'asset', 'icons', '256x256.png'), 'x');
  fs.writeFileSync(path.join(room, 'asset', 'icon.ico'), 'x');
  fs.writeFileSync(path.join(room, 'asset', 'icon.svg'), '<svg/>');
  fs.writeFileSync(path.join(room, 'MyClock-Setup-1.0.0.exe'), 'x');
  fs.writeFileSync(path.join(room, 'src', 'index.html'), 'x');

  const out = execFileSync(process.execPath, [path.join(room, 'scripts', 'clean.js')], {
    cwd: room,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' }
  });

  assert.match(out, /정리했습니다/);
  assert.equal(fs.existsSync(path.join(room, 'dist')), false, 'dist 를 지웠다');
  assert.equal(fs.existsSync(path.join(room, 'asset', 'icons')), false, '만들어진 아이콘 폴더를 지웠다');
  assert.equal(fs.existsSync(path.join(room, 'asset', 'icon.ico')), false, '만들어진 아이콘을 지웠다');
  assert.equal(fs.existsSync(path.join(room, 'MyClock-Setup-1.0.0.exe')), false, '설치 파일을 지웠다');
  assert.equal(fs.existsSync(path.join(room, 'asset', 'icon.svg')), true, '아이콘 원본은 남긴다');
  assert.equal(fs.existsSync(path.join(room, 'src', 'index.html')), true, '소스는 남긴다');

  fs.rmSync(room, { recursive: true, force: true });
});

test('문서가 npm 명령을 안내한다', () => {
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  for (const command of ['npm start', 'npm test', 'npm run clean']) {
    assert.ok(readme.includes(command), `README 에 ${command} 안내가 없다`);
  }
});

test('문서에 적힌 테마 수가 코드와 맞는다', () => {
  const { THEME_FAMILIES } = require('../src/js/data/themes');
  const count = THEME_FAMILIES.length;
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  const guide = fs.readFileSync(path.join(ROOT, 'UsersGuide.md'), 'utf8');

  assert.ok(readme.includes(`테마 ${count}색`), `README 의 테마 수가 ${count} 색과 다르다`);
  assert.ok(guide.includes(`${count}가지 색`), `UsersGuide 의 테마 수가 ${count} 가지와 다르다`);
});
