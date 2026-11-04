// A TCP port nobody is using, on both 127.0.0.1 and ::1. Another project's dev server
// on the same port would otherwise be what the window shows, so a busy port is skipped,
// never reused and never stopped.
import net from 'node:net'

function canBind(port, host) {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.unref()
    server.once('error', (error) => resolve(error.code === 'EADDRNOTAVAIL' || error.code === 'EAFNOSUPPORT'))
    server.listen({ port, host, exclusive: true }, () => server.close(() => resolve(true)))
  })
}

function nobodyAnswers(port, host) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host })
    const done = (free) => { socket.destroy(); resolve(free) }
    socket.setTimeout(300, () => done(true))
    socket.once('connect', () => done(false))
    socket.once('error', () => done(true))
  })
}

export async function isFree(port) {
  for (const host of ['127.0.0.1', '::1']) {
    if (!(await nobodyAnswers(port, host))) return false
    if (!(await canBind(port, host))) return false
  }
  return true
}

export async function freePort(start = 5173) {
  for (let port = start; port < start + 200; port += 1) {
    if (await isFree(port)) return port
  }
  throw new Error(`no free port in ${start}-${start + 199}`)
}
