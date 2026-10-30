// A small FTP server for the tests and the smoke run — serves one folder on
// disk over loopback (passive mode only). Enough of RFC 959 / 3659 / 4217 for
// a client to log in, list (LIST + MLSD), change folders, up- and download,
// create / rename / delete — in the clear or, with `tls: true`, over explicit
// FTPS (AUTH TLS on the control connection, PROT P for data connections,
// self-signed certificate from test/certs/). Not for production use.
import net from 'node:net';
import tls from 'node:tls';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const certDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'certs');
export const TEST_TLS = { key: fs.readFileSync(path.join(certDir, 'test-key.pem')), cert: fs.readFileSync(path.join(certDir, 'test-cert.pem')) };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function mlsdTime(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

function listLine(name, st) {
  const d = st.mtime;
  const p = (n) => String(n).padStart(2, '0');
  const perms = st.isDirectory() ? 'drwxr-xr-x' : '-rw-r--r--';
  return `${perms} 1 ftp ftp ${String(st.size).padStart(12)} ${MONTHS[d.getMonth()]} ${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())} ${name}`;
}

export function startFtpServer({ root, user = 'test', password = 'secret', host = '127.0.0.1', port = 0, tls: useTls = false } = {}) {
  root = path.resolve(root);
  const server = net.createServer((sock) => new Session(sock));
  const sessions = new Set();

  class Session {
    constructor(sock) {
      this.sock = sock;
      this.cwd = '/';
      this.user = null;
      this.authed = false;
      this.type = 'I';
      this.pasv = null;      // { server, socketPromise }
      this.renameFrom = null;
      this.buf = '';
      this.secure = false;     // control connection upgraded by AUTH TLS
      this.prot = 'C';         // PROT C (clear) | P (private) for data connections
      sessions.add(this);
      this.listen(sock);
      sock.on('close', () => { this.closePasv(); sessions.delete(this); });
      this.reply(220, 'Test FTP server ready');
    }

    listen(sock) {
      this.sock = sock;
      sock.setEncoding('utf8');
      sock.on('data', (d) => this.onData(d));
      sock.on('error', () => {});
    }

    reply(code, text) { if (!this.sock.destroyed) this.sock.write(`${code} ${text}\r\n`); }

    resolve(p) {
      const abs = p && p.startsWith('/') ? p : path.posix.join(this.cwd, p || '');
      const norm = path.posix.normalize(abs).replace(/\/+$/, '') || '/';
      const disk = path.join(root, norm.split('/').filter(Boolean).join(path.sep));
      if (!disk.startsWith(root)) throw new Error('outside root');
      return { virtual: norm, disk };
    }

    onData(d) {
      this.buf += d;
      let i;
      while ((i = this.buf.indexOf('\n')) >= 0) {
        const line = this.buf.slice(0, i).replace(/\r$/, '');
        this.buf = this.buf.slice(i + 1);
        this.command(line).catch((err) => this.reply(550, err.message || 'Failed'));
      }
    }

    closePasv() {
      if (this.pasv) { try { this.pasv.server.close(); } catch { /* ignore */ } this.pasv = null; }
    }

    // Opens a passive listener and returns the "227 Entering Passive Mode" reply.
    async openPasv() {
      this.closePasv();
      const srv = net.createServer();
      await new Promise((resolve) => srv.listen(0, host, resolve));
      const socketPromise = new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('data connection timeout')), 10000);
        srv.once('connection', (s) => { clearTimeout(t); resolve(s); });
      });
      this.pasv = { server: srv, socketPromise };
      return srv.address().port;
    }

    // With PROT P the data connection is TLS too (the server side of the
    // handshake; the client connects and starts TLS).
    async dataSocket() {
      if (!this.pasv) throw new Error('Use PASV first');
      const raw = await this.pasv.socketPromise;
      this.closePasv();
      if (this.prot !== 'P') return raw;
      const s = new tls.TLSSocket(raw, { isServer: true, ...TEST_TLS });
      s.on('error', () => {});
      return s;
    }

    async command(line) {
      const sp = line.indexOf(' ');
      const cmd = (sp < 0 ? line : line.slice(0, sp)).toUpperCase();
      const arg = sp < 0 ? '' : line.slice(sp + 1);
      if (!this.authed && !['USER', 'PASS', 'QUIT', 'FEAT', 'SYST', 'OPTS', 'NOOP', 'AUTH', 'PBSZ', 'PROT'].includes(cmd)) return this.reply(530, 'Please login');
      switch (cmd) {
        case 'USER': this.user = arg; return this.reply(331, 'Password required');
        case 'PASS':
          if (this.user === user && arg === password) { this.authed = true; return this.reply(230, 'Logged in'); }
          return this.reply(530, 'Login incorrect');
        case 'AUTH': {
          if (!useTls) return this.reply(502, 'TLS not supported by this server');
          if (arg.toUpperCase() !== 'TLS' && arg.toUpperCase() !== 'SSL') return this.reply(504, 'Only AUTH TLS');
          if (this.secure) return this.reply(503, 'Already secure');
          this.reply(234, 'AUTH TLS OK, starting handshake');
          // The plain socket keeps its listeners; from here on the TLS socket is the control connection.
          const plain = this.sock;
          plain.removeAllListeners('data');
          const secure = new tls.TLSSocket(plain, { isServer: true, ...TEST_TLS });
          this.secure = true;
          this.listen(secure);
          return;
        }
        case 'PBSZ': return this.reply(200, 'PBSZ=0');
        case 'PROT': {
          const v = arg.toUpperCase();
          if (v !== 'C' && v !== 'P') return this.reply(504, 'Only PROT C or P');
          if (v === 'P' && !this.secure) return this.reply(503, 'AUTH TLS first');
          this.prot = v;
          return this.reply(200, `PROT ${v} OK`);
        }
        case 'SYST': return this.reply(215, 'UNIX Type: L8');
        case 'FEAT': this.sock.write(`211-Features:\r\n MLST type*;size*;modify*;\r\n MLSD\r\n SIZE\r\n UTF8\r\n EPSV\r\n${useTls ? ' AUTH TLS\r\n PBSZ\r\n PROT\r\n' : ''}211 End\r\n`); return;
        case 'OPTS': return this.reply(200, 'OK');
        case 'NOOP': return this.reply(200, 'OK');
        case 'TYPE': this.type = arg.toUpperCase(); return this.reply(200, `Type set to ${this.type}`);
        case 'PWD': return this.reply(257, `"${this.cwd}" is current directory`);
        case 'CWD': {
          const { virtual, disk } = this.resolve(arg);
          if (!fs.existsSync(disk) || !fs.statSync(disk).isDirectory()) return this.reply(550, 'No such directory');
          this.cwd = virtual;
          return this.reply(250, 'Directory changed');
        }
        case 'CDUP': this.cwd = path.posix.dirname(this.cwd); return this.reply(250, 'Directory changed');
        case 'PASV': {
          const p = await this.openPasv();
          return this.reply(227, `Entering Passive Mode (${host.split('.').join(',')},${p >> 8},${p & 255})`);
        }
        case 'EPSV': {
          const p = await this.openPasv();
          return this.reply(229, `Entering Extended Passive Mode (|||${p}|)`);
        }
        case 'LIST':
        case 'MLSD': {
          const target = arg.replace(/^-[a-zA-Z]+\s*/, '');
          const { disk } = this.resolve(target);
          if (!fs.existsSync(disk)) return this.reply(550, 'No such file or directory');
          this.reply(150, 'Opening data connection');
          const s = await this.dataSocket();
          const st = fs.statSync(disk);
          const names = st.isDirectory() ? fs.readdirSync(disk) : [path.basename(disk)];
          const dir = st.isDirectory() ? disk : path.dirname(disk);
          const lines = [];
          for (const n of names) {
            let est;
            try { est = fs.statSync(path.join(dir, n)); } catch { continue; }
            lines.push(cmd === 'MLSD'
              ? `type=${est.isDirectory() ? 'dir' : 'file'};size=${est.size};modify=${mlsdTime(est.mtime)}; ${n}`
              : listLine(n, est));
          }
          s.end(lines.length ? lines.join('\r\n') + '\r\n' : '');
          await new Promise((r) => s.on('close', r));
          return this.reply(226, 'Transfer complete');
        }
        case 'SIZE': {
          const { disk } = this.resolve(arg);
          if (!fs.existsSync(disk) || fs.statSync(disk).isDirectory()) return this.reply(550, 'Could not get file size');
          return this.reply(213, String(fs.statSync(disk).size));
        }
        case 'RETR': {
          const { disk } = this.resolve(arg);
          if (!fs.existsSync(disk) || fs.statSync(disk).isDirectory()) return this.reply(550, 'No such file');
          this.reply(150, 'Opening data connection');
          const s = await this.dataSocket();
          await new Promise((resolve) => { fs.createReadStream(disk).pipe(s); s.on('close', resolve); s.on('error', resolve); });
          return this.reply(226, 'Transfer complete');
        }
        case 'STOR': {
          const { disk } = this.resolve(arg);
          if (!fs.existsSync(path.dirname(disk))) return this.reply(550, 'No such directory');
          this.reply(150, 'Opening data connection');
          const s = await this.dataSocket();
          await new Promise((resolve) => { const w = fs.createWriteStream(disk); s.pipe(w); w.on('finish', resolve); s.on('error', resolve); });
          return this.reply(226, 'Transfer complete');
        }
        case 'MKD': {
          const { virtual, disk } = this.resolve(arg);
          if (fs.existsSync(disk)) return this.reply(550, 'Already exists');
          fs.mkdirSync(disk);
          return this.reply(257, `"${virtual}" created`);
        }
        case 'RMD': {
          const { disk } = this.resolve(arg);
          if (!fs.existsSync(disk)) return this.reply(550, 'No such directory');
          try { fs.rmdirSync(disk); } catch { return this.reply(550, 'Directory not empty'); }
          return this.reply(250, 'Directory removed');
        }
        case 'DELE': {
          const { disk } = this.resolve(arg);
          if (!fs.existsSync(disk)) return this.reply(550, 'No such file');
          fs.unlinkSync(disk);
          return this.reply(250, 'File deleted');
        }
        case 'RNFR': {
          const { disk } = this.resolve(arg);
          if (!fs.existsSync(disk)) return this.reply(550, 'No such file');
          this.renameFrom = disk;
          return this.reply(350, 'Ready for RNTO');
        }
        case 'RNTO': {
          if (!this.renameFrom) return this.reply(503, 'RNFR first');
          const { disk } = this.resolve(arg);
          fs.renameSync(this.renameFrom, disk);
          this.renameFrom = null;
          return this.reply(250, 'Renamed');
        }
        case 'QUIT': this.reply(221, 'Goodbye'); this.sock.end(); return;
        default: return this.reply(502, `Command not implemented: ${cmd}`);
      }
    }
  }

  return new Promise((resolve) => {
    server.listen(port, host, () => {
      const address = server.address();
      resolve({
        port: address.port,
        host,
        user,
        password,
        root,
        tls: !!useTls,
        close: () => new Promise((r) => { for (const s of sessions) { try { s.sock.destroy(); } catch { /* ignore */ } } server.close(() => r()); }),
      });
    });
  });
}

// `node test/ftp-server.mjs <root> [port]` runs it stand-alone (Ctrl+C to stop).
if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname.replace(/^\/([a-zA-Z]:)/, '$1').replace(/\//g, path.sep)) {
  const root = process.argv[2] || process.cwd();
  const port = Number(process.argv[3]) || 2121;
  const useTls = process.argv.includes('--tls');
  startFtpServer({ root, port, tls: useTls }).then((s) => console.log(`[ftp-server] ${useTls ? 'ftps' : 'ftp'}://test:secret@127.0.0.1:${s.port}/  root=${s.root}`));
}
