// npm start — `tauri dev` on a dev server port nobody is using.
//
// tauri.conf.json names 1450, but another program (another project's Vite, a
// leftover of this one) may already hold it, and the app would then show that
// program's page. So a free port is picked every time and handed to Tauri with
// --config (devUrl + the Vite command).
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE_PORT, devConfig, freeDevPort } from './port.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = await freeDevPort();
if (port !== BASE_PORT) console.log(`포트 ${BASE_PORT} 은(는) 사용 중이라 ${port} 을(를) 씁니다.`);

const child = spawn(process.execPath, [path.join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js'), 'dev', '--config', JSON.stringify(devConfig(port)), ...process.argv.slice(2)], { cwd: root, stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 0));
