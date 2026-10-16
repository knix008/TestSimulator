// Finds a port nobody is using on either 127.0.0.1 or ::1. A server already listening on
// one of them (another project's dev server, often on ::1 only) would otherwise answer.
import net from "node:net";

function canBind(port, host) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", (error) => resolve(error.code === "EADDRNOTAVAIL" || error.code === "EAFNOSUPPORT"));
    server.listen({ port, host, exclusive: true }, () => server.close(() => resolve(true)));
  });
}

function answers(port, host) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host });
    socket.setTimeout(300);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => resolve(false));
  });
}

export async function freePort(start, count = 200) {
  for (let port = start; port < start + count; port += 1) {
    if (await answers(port, "127.0.0.1")) continue;
    if (await answers(port, "::1")) continue;
    if ((await canBind(port, "127.0.0.1")) && (await canBind(port, "::1"))) return port;
  }
  throw new Error(`No free port from ${start}`);
}
