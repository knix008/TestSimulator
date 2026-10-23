'use strict';

/**
 * `npm start` — 개발 실행 (tauri dev).
 *
 * src/ 를 그대로 띄우는 Tauri 의 정적 서버는 기본으로 1430 번 포트를 쓴다. 이 컴퓨터의 다른
 * 프로젝트도 같은 포트를 쓰므로, 비어 있는 포트를 찾아 넘긴다.
 * 그 밖의 인자는 tauri dev 에 그대로 넘긴다 (예: npm start -- -- --multi).
 */

const net = require('net');
const path = require('path');
const { spawn } = require('child_process');

const root = path.join(__dirname, '..');

function isFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, '127.0.0.1');
  });
}

async function freePort(from) {
  for (let port = from; port < from + 200; port += 1) {
    if (await isFree(port)) return port;
  }
  throw new Error(`비어 있는 포트를 찾지 못했습니다 (${from}~${from + 199})`);
}

async function main() {
  const port = await freePort(1490);
  console.log(`MyMemoPad dev server: http://127.0.0.1:${port}`);
  const cli = path.join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js');
  const child = spawn(process.execPath, [cli, 'dev', '--port', String(port), ...process.argv.slice(2)], {
    cwd: root,
    stdio: 'inherit'
  });
  child.on('exit', (code) => process.exit(code ?? 0));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
