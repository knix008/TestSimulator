// npm start — `tauri dev`, after making sure the dev server port is free.
//
// Tauri starts Vite on the fixed port 1450 (tauri.conf.json → devUrl). A Vite
// left over from an earlier run of this project (a crashed `tauri dev`, a test
// run) keeps that port and the start fails with "Port 1450 is already in use".
// Such a leftover is stopped here; anything else on the port is reported.
//
// Several copies may run at once; a later copy skips the session restore and
// opens its window offset. The development build is not counted against an
// installed MyUMLMaker that is open (MYUMLMAKER_MULTI=1, as the tests do): it
// always acts as the first copy.
import { execFileSync, spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = 1450;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function listeners() {
  try {
    if (process.platform === 'win32') {
      const script = `Get-NetTCPConnection -LocalPort ${PORT} -State Listen -ErrorAction SilentlyContinue | ForEach-Object { $p = Get-CimInstance Win32_Process -Filter "ProcessId=$($_.OwningProcess)"; "$($p.ProcessId)\`t$($p.CommandLine)" }`;
      return execFileSync('powershell.exe', ['-NoProfile', '-Command', script]).toString();
    }
    return execFileSync('sh', ['-c', `lsof -nP -iTCP:${PORT} -sTCP:LISTEN -t | xargs -r ps -o pid=,args= -p`]).toString();
  } catch {
    return '';
  }
}

const holders = listeners().split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
  const [pid, ...rest] = line.split(/\s+/);
  return { pid: Number(pid), command: rest.join(' ') };
}).filter((holder) => holder.pid);

/** Does the server on the port serve MyUMLMaker's own page? (Works whatever its command line looks like.) */
async function servesMyUMLMaker() {
  try {
    const response = await fetch(`http://localhost:${PORT}/`, { signal: AbortSignal.timeout(2000) });
    return (await response.text()).includes('<title>MyUMLMaker');
  } catch {
    return false;
  }
}

const servedByUs = holders.length > 0 && (await servesMyUMLMaker());
for (const holder of holders) {
  const ours = /vite/i.test(holder.command) && (servedByUs || holder.command.toLowerCase().includes(root.toLowerCase()));
  if (!ours) {
    console.error(`포트 ${PORT} 을(를) 다른 프로그램이 쓰고 있습니다 (PID ${holder.pid}):\n  ${holder.command}\n그 프로그램을 끈 뒤 다시 실행하세요.`);
    process.exit(1);
  }
  console.log(`남아 있던 이 프로젝트의 Vite (PID ${holder.pid}) 를 종료합니다.`);
  try { process.kill(holder.pid); } catch { /* already gone */ }
}

const child = spawn(process.execPath, [path.join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js'), 'dev', ...process.argv.slice(2)], { cwd: root, stdio: 'inherit', env: { ...process.env, MYUMLMAKER_MULTI: '1' } });
child.on('exit', (code) => process.exit(code ?? 0));
