'use strict';

// npm start 로 앱을 띄운다.
//
// 편집기가 띄운 터미널은 ELECTRON_RUN_AS_NODE=1 을 물려주는 경우가 있다.
// 그대로 두면 Electron 이 그냥 Node 처럼 켜져서 창이 하나도 뜨지 않는다.
// 그래서 그 값을 걷어 내고 다시 띄운다.

const { spawn } = require('child_process');
const path = require('path');

// node 로 읽으면 electron 실행 파일의 경로가 나온다.
const electron = require('electron');

if (typeof electron !== 'string') {
  console.error('electron 을 찾지 못했습니다. npm install 을 먼저 해 주세요.');
  process.exit(1);
}

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const root = path.join(__dirname, '..');
const child = spawn(electron, [root, ...process.argv.slice(2)], { stdio: 'inherit', env });

child.on('error', (err) => {
  console.error('앱을 띄우지 못했습니다.', err.message);
  process.exit(1);
});

child.on('close', (code, signal) => {
  // Ctrl+C 로 끝낸 것은 잘못이 아니다.
  if (signal) process.exit(0);
  process.exit(code === null ? 0 : code);
});
