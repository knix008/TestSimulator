// Frees the dev-server port before Vite tries to bind it.
//
// A previous `npm start` that was killed abruptly (or an Electron window closed
// while Vite kept running) leaves the port held, and Vite — configured with
// strictPort — then refuses to start at all. This finds whatever is listening
// and stops it, so a restart always works.
//
// Usage: node scripts/free-port.mjs [port]
import { execSync } from 'node:child_process';

const port = Number(process.argv[2]) || 5187;

function listenersWindows() {
  // Rows look like:  TCP    [::1]:5179   [::]:0   LISTENING   1234
  // `-p tcp` is rejected by netstat on some localised Windows builds, so the
  // protocol is filtered here instead of on the command line.
  let out = '';
  try {
    out = execSync('netstat -ano', { stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 8 << 20 }).toString();
  } catch {
    return [];
  }
  const pids = new Set();
  for (const line of out.split(/\r?\n/)) {
    if (!/LISTENING/i.test(line)) continue;
    const cols = line.trim().split(/\s+/);
    if (cols.length < 5 || !/^TCP$/i.test(cols[0])) continue;
    // The local address is the second column; match the port at its very end.
    if (!new RegExp(`[:.]${port}$`).test(cols[1])) continue;
    const pid = Number(cols[cols.length - 1]);
    if (pid > 4) pids.add(pid);   // 0 and 4 are system pseudo-processes
  }
  return [...pids];
}

function listenersUnix() {
  try {
    const out = execSync(`lsof -ti tcp:${port} -sTCP:LISTEN`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    return out.split(/\s+/).map(Number).filter((p) => p > 1);
  } catch {
    return [];   // lsof exits non-zero when nothing matches
  }
}

function kill(pid) {
  try {
    if (process.platform === 'win32') execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' });
    else process.kill(pid, 'SIGKILL');
    return true;
  } catch {
    return false;
  }
}

const pids = process.platform === 'win32' ? listenersWindows() : listenersUnix();

if (!pids.length) {
  console.log(`[free-port] Port ${port} is free.`);
} else {
  const stopped = pids.filter(kill);
  console.log(stopped.length
    ? `[free-port] Stopped process ${stopped.join(', ')} holding port ${port}.`
    : `[free-port] Port ${port} is held by ${pids.join(', ')} but could not be stopped — close it manually.`);
}
