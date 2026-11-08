// npm start — `tauri dev`, after making sure the dev server port (1472) is free.
// A Vite left over from an earlier run of this project is stopped; anything else on the port is reported.
import { execFileSync, spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = 1472;
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

async function servesUs() {
  try {
    const response = await fetch(`http://localhost:${PORT}/`, { signal: AbortSignal.timeout(2000) });
    return (await response.text()).includes('<title>MyTextMaster');
  } catch {
    return false;
  }
}

const holders = listeners().split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
  const [pid, ...rest] = line.split(/\s+/);
  return { pid: Number(pid), command: rest.join(' ') };
}).filter((holder) => holder.pid);

const ours = holders.length > 0 && (await servesUs());
for (const holder of holders) {
  if (!(/vite/i.test(holder.command) && (ours || holder.command.toLowerCase().includes(root.toLowerCase())))) {
    console.error(`포트 ${PORT} 을(를) 다른 프로그램이 쓰고 있습니다 (PID ${holder.pid}):\n  ${holder.command}\n그 프로그램을 끈 뒤 다시 실행하세요.`);
    process.exit(1);
  }
  console.log(`남아 있던 이 프로젝트의 Vite (PID ${holder.pid}) 를 종료합니다.`);
  try { process.kill(holder.pid); } catch { /* already gone */ }
}

// This workspace's terminals may carry ELECTRON_RUN_AS_NODE; it must not reach the app.
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(process.execPath, [path.join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js'), 'dev', ...process.argv.slice(2)], { cwd: root, stdio: 'inherit', env });
child.on('exit', (code) => process.exit(code ?? 0));
