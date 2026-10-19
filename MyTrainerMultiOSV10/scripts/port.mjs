// The dev server port: always one nobody is using, so the app never loads
// another program's page (other projects' Vite servers sit on 1420–1440, and
// some listen on IPv6 only — checking 127.0.0.1 alone misses them).
import net from 'node:net';

export const BASE_PORT = 1470;

/** Something answers on the port, on IPv4 or IPv6. */
function answers(port, host) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host });
    socket.setTimeout(1000, () => { socket.destroy(); resolve(false); });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
  });
}

/** The port can be listened on (on the given host). */
function bindable(port, host) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (error) => resolve(error.code === 'EAFNOSUPPORT' || error.code === 'EADDRNOTAVAIL'));
    server.listen({ port, host, exclusive: true }, () => server.close(() => resolve(true)));
  });
}

export async function portInUse(port) {
  for (const host of ['127.0.0.1', '::1']) if (await answers(port, host)) return true;
  for (const host of ['127.0.0.1', '::1']) if (!(await bindable(port, host))) return true;
  return false;
}

/** The first port from BASE_PORT that nothing uses. */
export async function freeDevPort(from = BASE_PORT) {
  for (let port = from; port < from + 200; port++) if (!(await portInUse(port))) return port;
  throw new Error(`${from}–${from + 199} 사이에 빈 포트가 없습니다`);
}

/** tauri --config / TAURI_CONFIG: the app loads its UI from that port, and Vite is started on it. */
export const devConfig = (port) => ({ build: { devUrl: `http://localhost:${port}`, beforeDevCommand: `npm run dev -- --port ${port} --strictPort` } });
