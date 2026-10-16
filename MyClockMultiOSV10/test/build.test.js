'use strict';

/** 빌드·배포 설정과 정리(clean) 명령 — Tauri 포장에서 빠지는 파일이 없는지. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const pkg = require('../package.json');
const conf = require('../src-tauri/tauri.conf.json');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('npm 명령이 갖춰져 있다', () => {
  for (const name of ['start', 'test', 'test:js', 'test:rust', 'clean', 'icons', 'pack', 'build', 'build:win', 'build:mac', 'build:linux']) {
    assert.ok(pkg.scripts[name], `npm run ${name} 이 없다`);
  }
  assert.match(pkg.scripts['test:js'], /--test/, 'JS 검사는 node:test 로 돌린다');
  assert.match(pkg.scripts['test:js'], /test-reporter/, '보고서 형식을 쓴다');
  assert.match(pkg.scripts['test:rust'], /cargo test --manifest-path src-tauri\/Cargo\.toml/);
  assert.match(pkg.scripts.test, /test:js[\s\S]*test:rust/, 'npm test 는 JS 와 Rust 검사를 모두 돌린다');
  assert.match(pkg.scripts.clean, /scripts\/clean\.js/);
  assert.match(pkg.scripts.start, /scripts\/dev\.js/);
  assert.match(pkg.scripts['build:win'], /tauri build --bundles nsis/);
  for (const name of ['build', 'build:win', 'build:mac', 'build:linux']) {
    assert.match(pkg.scripts[name], /copy-installer-to-root\.js/, `${name} 은 설치 파일을 루트로 복사한다`);
  }
  // Electron 은 더 쓰지 않는다.
  assert.ok(!pkg.devDependencies.electron && !pkg.devDependencies['electron-builder'], 'Electron 의존성이 남아 있다');
  assert.ok(pkg.devDependencies['@tauri-apps/cli'], 'Tauri CLI 가 없다');
});

test('검사 파일이 모두 npm test 가 집는 자리에 있다', () => {
  const files = fs.readdirSync(path.join(ROOT, 'test')).filter((name) => name.endsWith('.test.js'));
  assert.ok(files.length >= 8, `검사 파일 수: ${files.length}`);
  assert.match(pkg.scripts['test:js'], /test\/\*\.test\.js/);
});

test('앱 정보가 package.json·tauri.conf.json·Cargo.toml 에서 같다', () => {
  const cargo = read('src-tauri/Cargo.toml');
  assert.equal(conf.identifier, 'com.shkwon.myclock');
  assert.equal(conf.productName, 'MyClock');
  assert.equal(conf.mainBinaryName, 'MyClock', '실행 파일 이름은 Electron 판과 같은 MyClock.exe');
  assert.equal(conf.version, pkg.version);
  assert.match(cargo, new RegExp(`^version = "${pkg.version.replace(/\./g, '\\.')}"`, 'm'));
  assert.ok(fs.existsSync(path.join(ROOT, 'asset', 'icon.svg')), '아이콘 원본(svg)이 있어야 한다');
});

test('포장에는 창 문서(src/)만 들어간다', () => {
  // Tauri 는 frontendDist 폴더를 실행 파일 안에 넣는다 — 검사·도구가 섞이면 앱이 무거워진다.
  assert.equal(conf.build.frontendDist, '../src');
  assert.equal(conf.app.withGlobalTauri, true, 'bridge.js 가 window.__TAURI__ 를 쓴다');
  const htmls = fs.readdirSync(path.join(ROOT, 'src')).filter((name) => name.endsWith('.html'));
  assert.ok(htmls.length >= 7, `창 문서 수: ${htmls.length}`);
  for (const name of fs.readdirSync(path.join(ROOT, 'src'))) {
    assert.ok(!/\.test\.js$|^test$|^scripts$|^node_modules$/.test(name), `src 에 포장되면 안 되는 것이 있다: ${name}`);
  }
});

test('설치 파일 종류와 아이콘이 갖춰져 있다', () => {
  for (const target of ['nsis', 'dmg', 'appimage', 'deb']) {
    assert.ok(conf.bundle.targets.includes(target), `${target} 산출물이 없다`);
  }
  // 아이콘은 npm run icons 가 asset/icon.svg 에서 만든다 — 목록의 파일을 그 스크립트가 만들어야 한다.
  const generator = read('scripts/generate-icons.js');
  for (const icon of conf.bundle.icon) {
    const rel = path.posix.normalize(path.posix.join('src-tauri', icon));
    assert.ok(rel.startsWith('asset/'), `아이콘은 asset/ 에 둔다: ${icon}`);
    assert.ok(generator.includes(`'${rel}'`), `generate-icons.js 가 ${rel} 를 만든다고 적혀 있지 않다`);
  }
  assert.ok(conf.bundle.icon.some((icon) => icon.endsWith('.ico')), 'Windows 아이콘');
  assert.ok(conf.bundle.icon.some((icon) => icon.endsWith('.icns')), 'macOS 아이콘');
  assert.match(conf.build.beforeBuildCommand, /generate-icons\.js/, '빌드 전에 아이콘을 만든다');
});

test('Windows 설치 프로그램 — 언어·사용자별 설치·훅·라이선스', () => {
  const nsis = conf.bundle.windows.nsis;
  assert.deepEqual(nsis.languages, ['Korean', 'English']);
  assert.equal(nsis.displayLanguageSelector, true);
  assert.equal(nsis.installMode, 'currentUser', 'Electron 판(perMachine: false)과 같이 사용자별 설치');
  assert.ok(fs.existsSync(path.join(ROOT, 'src-tauri', conf.bundle.licenseFile)), '라이선스 파일이 없다');

  const hookPath = path.join(ROOT, 'src-tauri', nsis.installerHooks);
  const bytes = fs.readFileSync(hookPath);
  assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf], 'NSIS 훅은 UTF-8 BOM 이어야 한글이 깨지지 않는다');
  const hooks = bytes.toString('utf8');
  // 훅은 Tauri 의 정의보다 먼저 읽히므로 이름을 그대로 적는다 — 설정과 같아야 한다.
  assert.ok(hooks.includes(`!define MC_IDENTIFIER "${conf.identifier}"`));
  assert.ok(hooks.includes(`Uninstall\\${conf.productName}"`), 'Tauri 제거 키 이름이 productName 과 다르다');
  // 설정 폴더는 Electron 판과 같은 MyClockMultiOS (lib.rs 의 config_dirs).
  assert.ok(hooks.includes('!define MC_DATA_DIR "MyClockMultiOS"'));
  assert.match(read('src-tauri/src/lib.rs'), /base\.join\("MyClockMultiOS"\)/);
  // 페이지와 훅
  for (const name of ['MC_PageReinstall', 'MC_PageShortcuts', 'MC_RemoveElectron', 'NSIS_HOOK_PREINSTALL', 'NSIS_HOOK_POSTINSTALL', 'NSIS_HOOK_POSTUNINSTALL']) {
    assert.ok(hooks.includes(name), `${name} 이 없다`);
  }
  // Electron 판은 데이터를 남긴 채(--updated) 지운다.
  assert.match(hooks, /\/S \/currentuser --updated/);
  // 함수 안에서는 Tauri 가 뒤에 선언하는 변수를 쓸 수 없다 (컴파일 오류).
  const functions = hooks.split('!macro NSIS_HOOK_PREINSTALL')[0].split('\n').filter((line) => !line.trim().startsWith(';'));
  for (const line of functions) {
    assert.ok(!/\$(PassiveMode|UpdateMode|NoShortcutMode)\b/.test(line), `함수 안에서 Tauri 변수를 쓴다: ${line.trim()}`);
  }
});

test('빌드 산출물은 git 에 올라가지 않는다', () => {
  const ignore = read('.gitignore');
  for (const entry of ['node_modules/', 'src-tauri/target/', 'src-tauri/gen/', 'asset/icons/', 'asset/icon.ico', 'asset/icon.icns', 'MyClock-Setup-*.exe']) {
    assert.ok(ignore.includes(entry), `.gitignore 에 ${entry} 가 없다`);
  }
  // Cargo.lock 은 올린다 (실행 파일의 의존성을 고정한다).
  assert.ok(!/^\s*(src-tauri\/)?Cargo\.lock\s*$/m.test(ignore), 'Cargo.lock 을 빼면 안 된다');
});

test('clean 은 빌드 산출물만 지우고 소스는 건드리지 않는다', () => {
  const source = read('scripts/clean.js');

  // 지우는 목록에 소스·설정이 섞여 있지 않아야 한다.
  for (const forbidden of ["'src'", "'src-tauri'", "'src-tauri/src'", "'asset/icon.svg'", "'package.json'", "'src-tauri/windows'"]) {
    assert.ok(!source.includes(forbidden), `clean 이 ${forbidden} 을 지우려 한다`);
  }
  assert.match(source, /'src-tauri\/target'/, 'Rust 빌드 결과는 지운다');
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
  assert.ok(fs.existsSync(path.join(ROOT, 'src-tauri', 'src')), 'src-tauri/src 는 그대로');
});

test('clean 이 임시 산출물 폴더를 실제로 지운다 (복사본에서 확인)', () => {
  // 진짜 프로젝트에서 지워 버리면 쓰는 사람의 빌드 결과가 날아간다.
  // 그래서 임시 폴더에 흉내만 낸 프로젝트를 만들고 거기서 돌린다.
  const room = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'myclock-clean-'));
  const make = (rel, text = 'x') => {
    fs.mkdirSync(path.dirname(path.join(room, rel)), { recursive: true });
    fs.writeFileSync(path.join(room, rel), text);
  };
  fs.mkdirSync(path.join(room, 'scripts'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'scripts', 'clean.js'), path.join(room, 'scripts', 'clean.js'));
  make('src-tauri/target/release/MyClock.exe');
  make('src-tauri/gen/schemas/desktop-schema.json');
  make('src-tauri/src/lib.rs');
  make('dist/win-unpacked/MyClock.exe');
  make('asset/icons/256x256.png');
  make('asset/icon.ico');
  make('asset/icon.icns');
  make('asset/icon.svg', '<svg/>');
  make('MyClock-Setup-1.0.0.exe');
  make('src/index.html');

  const out = execFileSync(process.execPath, [path.join(room, 'scripts', 'clean.js')], {
    cwd: room,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' }
  });

  const exists = (rel) => fs.existsSync(path.join(room, rel));
  assert.match(out, /정리했습니다/);
  assert.equal(exists('src-tauri/target'), false, 'Rust 빌드 결과를 지웠다');
  assert.equal(exists('src-tauri/gen'), false, 'Tauri 가 만든 스키마를 지웠다');
  assert.equal(exists('dist'), false, '옛 dist 를 지웠다');
  assert.equal(exists('asset/icons'), false, '만들어진 아이콘 폴더를 지웠다');
  assert.equal(exists('asset/icon.ico'), false, '만들어진 아이콘을 지웠다');
  assert.equal(exists('asset/icon.icns'), false, '만들어진 macOS 아이콘을 지웠다');
  assert.equal(exists('MyClock-Setup-1.0.0.exe'), false, '설치 파일을 지웠다');
  assert.equal(exists('asset/icon.svg'), true, '아이콘 원본은 남긴다');
  assert.equal(exists('src/index.html'), true, '소스는 남긴다');
  assert.equal(exists('src-tauri/src/lib.rs'), true, 'Rust 소스는 남긴다');

  fs.rmSync(room, { recursive: true, force: true });
});

test('문서가 npm 명령을 안내한다', () => {
  const readme = read('README.md');
  for (const command of ['npm start', 'npm test', 'npm run clean', 'npm run build:win']) {
    assert.ok(readme.includes(command), `README 에 ${command} 안내가 없다`);
  }
  // 문서가 옛 Electron 구조를 안내하지 않는다.
  for (const doc of ['README.md', 'Architecture.md', 'UsersGuide.md']) {
    const text = read(doc);
    assert.ok(!/electron\/main\.js|electron\/preload\.js|electron-builder/.test(text), `${doc} 에 Electron 판 안내가 남아 있다`);
  }
});

test('문서에 적힌 테마 수가 코드와 맞는다', () => {
  const { THEME_FAMILIES } = require('../src/js/data/themes');
  const count = THEME_FAMILIES.length;
  const readme = read('README.md');
  const guide = read('UsersGuide.md');

  assert.ok(readme.includes(`테마 ${count}색`), `README 의 테마 수가 ${count} 색과 다르다`);
  assert.ok(guide.includes(`${count}가지 색`), `UsersGuide 의 테마 수가 ${count} 가지와 다르다`);
});
