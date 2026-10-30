// A free TCP port for the dev server: free on both 127.0.0.1 and ::1, so a
// server another program runs on the same port number is never reused or
// stopped. Starts at `from` (5189) and walks up.
import net from 'node:net';

function freeOn(port, host) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (err) => resolve(err.code === 'EADDRNOTAVAIL' || err.code === 'EAFNOSUPPORT'));
    server.listen({ port, host, exclusive: true }, () => server.close(() => resolve(true)));
  });
}

function connects(port, host) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host });
    socket.setTimeout(400);
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('timeout', () => { socket.destroy(); resolve(false); });
    socket.once('error', () => resolve(false));
  });
}

export async function freeDevPort(from = 5189, tries = 200) {
  for (let port = from; port < from + tries; port++) {
    if (await connects(port, '127.0.0.1') || await connects(port, '::1')) continue;
    if (await freeOn(port, '127.0.0.1') && await freeOn(port, '::1')) return port;
  }
  throw new Error(`No free port between ${from} and ${from + tries - 1}`);
}
