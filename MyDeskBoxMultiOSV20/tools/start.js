'use strict';

// npm start 로 앱을 띄운다 (tauri dev: 디버그로 빌드해 바로 실행).
//   npm start                 → 앱을 띄운다
//   npm start -- --restore-desktop  → 뒤의 인자는 앱에 넘긴다
//
// 편집기가 띄운 터미널은 ELECTRON_RUN_AS_NODE=1 을 물려주는 경우가 있다. 이 앱은 Electron 이 아니지만
// 여기서 띄운 앱이 다시 띄우는 프로그램까지 그 값을 물려받으므로 걷어 낸다.

const { spawn } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');

// 검사에서는 가짜 CLI 를 넣을 수 있다.
const cli = process.env.MYDESKBOX_TAURI_CLI || require.resolve('@tauri-apps/cli/tauri.js', { paths: [root] });

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
delete env.MYDESKBOX_TAURI_CLI;

const extra = process.argv.slice(2);
// tauri dev -- <cargo 인자> -- <앱 인자>
const args = [cli, 'dev', ...(extra.length ? ['--', '--', ...extra] : [])];

// 빌드 도구는 UTF-8 로 쓰는데 한국어 Windows 터미널은 CP949 로 읽어 글이 깨진다.
// 받아서 글로 풀어 다시 쓰면 Node 가 터미널에 맞게 내보낸다.
const child = spawn(process.execPath, args, { cwd: root, stdio: ['inherit', 'pipe', 'pipe'], env });
child.stdout.setEncoding('utf8');
child.stderr.setEncoding('utf8');
child.stdout.on('data', (text) => process.stdout.write(text));
child.stderr.on('data', (text) => process.stderr.write(text));

child.on('error', (err) => {
  console.error('앱을 띄우지 못했습니다.', err.message);
  process.exit(1);
});

child.on('close', (code, signal) => {
  // Ctrl+C 로 끝낸 것은 잘못이 아니다.
  if (signal) process.exit(0);
  process.exit(code === null ? 0 : code);
});
