/*
 * run-electron.mjs - Electron 을 안전하게 띄우는 런처
 *
 * 어떤 셸에는 ELECTRON_RUN_AS_NODE=1 이 남아 있다. 그 값이 있으면 Electron 이
 * 창을 띄우지 않고 그냥 Node 로만 돌아서 `app` 이 undefined 가 된다.
 * 그래서 자식 프로세스로 넘기기 전에 그 변수를 지운다.
 *
 *   node scripts/run-electron.mjs                    앱 실행
 *   node scripts/run-electron.mjs scripts/smoke.cjs  다른 진입점으로 실행
 */
import { spawn } from 'node:child_process';
import electronPath from 'electron';

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const args = process.argv.slice(2);
if (args.length === 0) args.push('.');

const child = spawn(electronPath, args, { stdio: 'inherit', env, windowsHide: false });

child.on('close', (code, signal) => {
  process.exit(signal ? 1 : (code ?? 0));
});
