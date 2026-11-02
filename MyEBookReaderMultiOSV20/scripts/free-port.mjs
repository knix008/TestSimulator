// Frees the dev-server port before Vite tries to bind it.
//
// A previous `npm start` that was killed abruptly (or an Electron window closed
// while Vite kept running) leaves the port held, and Vite — configured with
// strictPort — then refuses to start at all. This finds whatever is listening
// and stops it, so a restart always works.
//
// Usage: node scripts/free-port.mjs [port]
import { execSync } from 'node:child_process';
import net from 'node:net';

const port = Number(process.argv[2]) || 5191;

function listenersWindows() {
  // Rows look like:  TCP    [::1]:5191   [::]:0   LISTENING   1234
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
    const cols = line.trim().split(/\s+/);
    if (cols.length < 5 || !/^TCP$/i.test(cols[0])) continue;
    // A listening socket has no peer ([::]:0 / 0.0.0.0:0). Some Windows builds
    // print its state as CLOSED rather than LISTENING, and going by the state
    // word alone missed the old Vite now and then — "Port 5191 is already in use".
    if (!/LISTENING/i.test(cols[3]) && !/:0$/.test(cols[2])) continue;
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

const listeners = () => (process.platform === 'win32' ? listenersWindows() : listenersUnix());
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

const pids = listeners();

if (!pids.length) {
  console.log(`[free-port] Port ${port} is free.`);
} else {
  const stopped = pids.filter(kill);
  if (stopped.length) console.log(`[free-port] Stopped process ${stopped.join(', ')} holding port ${port}.`);
  // taskkill returns before Windows has closed the dying process's socket, so
  // Vite started straight after could still find the port taken. Wait until
  // nothing listens on it (killing anything that took it meanwhile).
  let left = listeners();
  for (let i = 0; left.length && i < 50; i += 1) {
    if (i % 10 === 9) left.forEach(kill);
    sleep(100);
    left = listeners();
  }
  if (left.length) {
    console.error(`[free-port] Port ${port} is still held by process ${left.join(', ')} and could not be freed — close it (or run as the user that started it) and try again.`);
    process.exit(1);
  }
}

// The last word goes to binding the port the way Vite will (localhost is ::1
// or 127.0.0.1), so a holder netstat did not show is reported here, plainly.
const canBind = (host) => new Promise((resolve) => {
  const srv = net.createServer();
  srv.once('error', (err) => resolve(err.code !== 'EADDRINUSE'));
  srv.listen(port, host, () => srv.close(() => resolve(true)));
});
for (let i = 0; i < 20; i += 1) {
  if ((await canBind('::1')) && (await canBind('127.0.0.1'))) process.exit(0);
  sleep(100);
}
console.error(`[free-port] Port ${port} is in use by a process netstat does not list — close the other dev server (another \`npm start\` / \`npm run web\`) and try again.`);
process.exit(1);
