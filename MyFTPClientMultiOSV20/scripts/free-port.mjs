// Finds a TCP port nobody is using, on both 127.0.0.1 and ::1. Another
// project's dev server on the same port would otherwise be what the window
// shows, so a busy port is skipped, never reused and never stopped.
//
//   import { freePort } from './free-port.mjs';  await freePort(5187)
//   node scripts/free-port.mjs [start]           prints the port
import net from 'node:net';
import { fileURLToPath } from 'node:url';

function canBind(port, host) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.unref();
    srv.once('error', (err) => resolve(err.code === 'EADDRNOTAVAIL' || err.code === 'EAFNOSUPPORT'));
    srv.listen({ port, host, exclusive: true }, () => srv.close(() => resolve(true)));
  });
}

function nobodyAnswers(port, host) {
  return new Promise((resolve) => {
    const sock = net.connect({ port, host });
    const done = (free) => { sock.destroy(); resolve(free); };
    sock.setTimeout(300, () => done(true));
    sock.once('connect', () => done(false));
    sock.once('error', () => done(true));
  });
}

export async function isFree(port) {
  for (const host of ['127.0.0.1', '::1']) {
    if (!(await nobodyAnswers(port, host))) return false;
    if (!(await canBind(port, host))) return false;
  }
  return true;
}

export async function freePort(start = 5187, skip = []) {
  for (let port = start; port < start + 200; port++) {
    if (skip.includes(port)) continue;
    if (await isFree(port)) return port;
  }
  throw new Error(`no free port in ${start}–${start + 199}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  console.log(await freePort(Number(process.argv[2]) || 5187));
}
