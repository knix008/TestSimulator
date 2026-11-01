// Frees the dev-server port before Vite tries to bind it.
//
// A previous `npm start` that was killed abruptly (or an Electron window closed
// while Vite kept running) leaves the port held, and Vite — configured with
// strictPort — then refuses to start at all. This finds whatever is listening
// and stops it, so a restart always works.
//
// Whether the port is free is decided by binding it, not by any listing:
// netstat on Windows reports a live Vite listener as LISTENING, as CLOSED, or
// not at all from one run to the next.
//
// Usage: node scripts/free-port.mjs [port]
import { execSync } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const port = Number(process.argv[2]) || 5195;
const root = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]+$/, '');

function powershell(script) {
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  try {
    return execSync(`powershell -NoProfile -NonInteractive -EncodedCommand ${encoded}`,
      { stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 8 << 20 }).toString();
  } catch {
    return '';
  }
}

const pidList = (out) => out.split(/\s+/).map(Number).filter((p) => p > 4);   // 0 and 4 are system pseudo-processes

function listenersWindows() {
  const pids = new Set();
  // Get-NetTCPConnection lists the listener even when netstat leaves it out,
  // though its state may read Closed: anything on the port with no remote end.
  for (const pid of pidList(powershell(
    `Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | Where-Object RemotePort -eq 0 | ForEach-Object OwningProcess`,
  ))) pids.add(pid);
  // Rows look like:  TCP    [::1]:5195   [::]:0   LISTENING   1234
  // `-p tcp` is rejected by netstat on some localised Windows builds, so the
  // protocol is filtered here instead of on the command line.
  let out = '';
  try {
    out = execSync('netstat -ano', { stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 8 << 20 }).toString();
  } catch { /* the PowerShell answer stands */ }
  for (const line of out.split(/\r?\n/)) {
    const cols = line.trim().split(/\s+/);
    if (cols.length < 5 || !/^TCP$/i.test(cols[0])) continue;
    // A listener has no remote end ([::]:0 or 0.0.0.0:0), whatever the state says.
    if (!/LISTENING/i.test(line) && !/:0$/.test(cols[2])) continue;
    // The local address is the second column; match the port at its very end.
    if (!new RegExp(`[:.]${port}$`).test(cols[1])) continue;
    for (const pid of pidList(cols[cols.length - 1])) pids.add(pid);
  }
  return [...pids];
}

// Last resort when the port is taken but no listing names its owner: this
// project's own Vite, found by its command line.
function ownViteWindows() {
  const dir = root.toLowerCase().replace(/'/g, "''");
  return pidList(powershell(
    `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $c = "$($_.CommandLine)".ToLower(); `
    + `$c.Contains('${dir}') -and $c.Contains('vite') -and $c -match '--port[= ]${port}\\b' } | ForEach-Object ProcessId`,
  ));
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

// Vite binds `localhost`, which resolves to ::1 or 127.0.0.1 depending on the
// machine, so both have to be free.
function canBind(host) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', (err) => resolve(err.code === 'EADDRNOTAVAIL' || err.code === 'EAFNOSUPPORT'));
    srv.listen({ port, host, exclusive: true }, () => srv.close(() => resolve(true)));
  });
}
const isFree = async () => (await canBind('::1')) && (await canBind('127.0.0.1'));

// The socket outlives the kill by a moment; wait for it, or Vite starts first.
async function waitFree(ms) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (await isFree()) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return isFree();
}

if (await isFree()) {
  console.log(`[free-port] Port ${port} is free.`);
} else {
  let pids = process.platform === 'win32' ? listenersWindows() : listenersUnix();
  if (!pids.length && process.platform === 'win32') pids = ownViteWindows();
  const stopped = pids.filter(kill);
  if (!pids.length) {
    console.log(`[free-port] Port ${port} is in use, but no process could be found holding it — close it manually.`);
  } else if (!stopped.length) {
    console.log(`[free-port] Port ${port} is held by ${pids.join(', ')} but could not be stopped — close it manually.`);
  } else if (await waitFree(5000)) {
    console.log(`[free-port] Stopped process ${stopped.join(', ')} holding port ${port}.`);
  } else {
    console.log(`[free-port] Stopped process ${stopped.join(', ')}, but port ${port} is still in use.`);
  }
}
