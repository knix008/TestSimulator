// A small FTP server for tests (node:net, in-memory file tree). Enough of
// RFC 959 / 2428 / 3659 for server/ftp-client.js and src-tauri/src/host.rs:
// USER PASS SYST FEAT OPTS PWD CWD CDUP TYPE PASV EPSV LIST NLST MLSD RETR
// STOR DELE MKD RMD RNFR RNTO SIZE NOOP QUIT.
//
//   const srv = await startFtpServer({ user, password, mlsd, listStyle: 'unix'|'windows', noPasv, noEpsv })
//   srv.port, srv.files (Map path → { dir, data: Buffer, mtime }), srv.log (commands), await srv.close()
import net from 'node:net';

const norm = (p) => {
  const out = [];
  for (const s of String(p).split('/')) { if (!s || s === '.') continue; if (s === '..') out.pop(); else out.push(s); }
  return '/' + out.join('/');
};
const parentOf = (p) => (p === '/' ? '/' : norm(p.slice(0, p.lastIndexOf('/')) || '/'));
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const p2 = (n) => String(n).padStart(2, '0');

export async function startFtpServer({ user = 'user', password = 'pw', mlsd = true, listStyle = 'unix', noPasv = false, noEpsv = false } = {}) {
  const files = new Map([['/', { dir: true, mtime: Date.UTC(2024, 0, 2, 3, 4, 5) }]]);
  const log = [];
  const sockets = new Set();
  const childrenOf = (dir) => [...files.keys()].filter((k) => k !== '/' && parentOf(k) === dir).sort();

  const listLine = (path) => {
    const f = files.get(path);
    const name = path.slice(path.lastIndexOf('/') + 1);
    const d = new Date(f.mtime);
    if (listStyle === 'windows') {
      let h = d.getHours(); const ampm = h >= 12 ? 'PM' : 'AM'; h %= 12; if (h === 0) h = 12;
      const date = `${p2(d.getMonth() + 1)}-${p2(d.getDate())}-${String(d.getFullYear()).slice(2)}  ${p2(h)}:${p2(d.getMinutes())}${ampm}`;
      return `${date}       ${f.dir ? '<DIR>         ' : String(f.data.length).padStart(14)} ${name}`;
    }
    const when = `${MON[d.getMonth()]} ${String(d.getDate()).padStart(2)}  ${d.getFullYear()}`;
    return `${f.dir ? 'd' : '-'}rw-r--r--   1 owner    group ${String(f.dir ? 4096 : f.data.length).padStart(8)} ${when} ${name}`;
  };
  const mlsdLine = (path) => {
    const f = files.get(path);
    const d = new Date(f.mtime);
    const modify = `${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}${p2(d.getUTCSeconds())}`;
    return `type=${f.dir ? 'dir' : 'file'};${f.dir ? '' : `size=${f.data.length};`}modify=${modify}; ${path.slice(path.lastIndexOf('/') + 1)}`;
  };

  const server = net.createServer((ctl) => {
    sockets.add(ctl);
    ctl.on('close', () => sockets.delete(ctl));
    ctl.on('error', () => {});
    let cwd = '/';
    let authed = false;
    let pendingUser = null;
    let renameFrom = null;
    let pasv = null; // { server, socket: Promise<net.Socket> }
    const say = (line) => { if (!ctl.destroyed) ctl.write(`${line}\r\n`); };
    const abs = (p) => norm(p && p.startsWith('/') ? p : `${cwd}/${p || ''}`);

    const openPassive = () => new Promise((resolve) => {
      if (pasv) { pasv.server.close(); }
      const srv = net.createServer();
      let got;
      const socket = new Promise((r) => { got = r; });
      srv.on('connection', (s) => { s.on('error', () => {}); sockets.add(s); s.on('close', () => sockets.delete(s)); got(s); srv.close(); });
      srv.listen(0, '127.0.0.1', () => { pasv = { server: srv, socket }; resolve(srv.address().port); });
    });
    const withData = async (fn) => {
      if (!pasv) { say('425 Use PASV or EPSV first.'); return; }
      const { socket } = pasv;
      pasv = null;
      const s = await socket;
      await fn(s);
    };
    const send = (text) => withData(async (s) => { say('150 Opening data connection.'); s.end(text); await new Promise((r) => s.on('close', r)); say('226 Transfer complete.'); });

    const handlers = {
      USER(arg) { pendingUser = arg; say('331 Password required.'); },
      PASS(arg) { if (pendingUser === user && arg === password) { authed = true; say('230 Logged in.'); } else say('530 Login incorrect.'); },
      SYST() { say('215 UNIX Type: L8'); },
      FEAT() { say('211-Features:'); if (mlsd) say(' MLST type*;size*;modify*;'); say(' EPSV'); say(' PASV'); say(' UTF8'); say('211 End'); },
      OPTS() { say('200 OK.'); },
      NOOP() { say('200 OK.'); },
      PWD() { say(`257 "${cwd.replace(/"/g, '""')}" is the current directory.`); },
      CWD(arg) { const p = abs(arg); if (files.get(p)?.dir) { cwd = p; say('250 OK.'); } else say('550 No such directory.'); },
      CDUP() { cwd = parentOf(cwd); say('250 OK.'); },
      TYPE(arg) { if (/^[AI]/i.test(arg)) say(`200 Type set to ${arg}.`); else say('504 Unsupported type.'); },
      async PASV() {
        if (noPasv) { say('502 PASV not implemented.'); return; }
        const port = await openPassive();
        say(`227 Entering Passive Mode (127,0,0,1,${port >> 8},${port & 255}).`);
      },
      async EPSV() {
        if (noEpsv) { say('502 EPSV not implemented.'); return; }
        const port = await openPassive();
        say(`229 Entering Extended Passive Mode (|||${port}|)`);
      },
      async LIST(arg) {
        const p = abs((arg || '').replace(/^-\S+\s*/, ''));
        const f = files.get(p);
        if (!f) { if (pasv) { pasv.server.close(); pasv = null; } say('550 No such file or directory.'); return; }
        const lines = f.dir ? childrenOf(p).map(listLine) : [listLine(p)];
        await send(lines.map((l) => `${l}\r\n`).join(''));
      },
      async NLST(arg) { const p = abs(arg); await send(childrenOf(p).map((k) => `${k.slice(k.lastIndexOf('/') + 1)}\r\n`).join('')); },
      async MLSD(arg) {
        if (!mlsd) { say('500 Unknown command.'); return; }
        const p = abs(arg);
        if (!files.get(p)?.dir) { if (pasv) { pasv.server.close(); pasv = null; } say('550 Not a directory.'); return; }
        await send([`type=cdir;modify=20240102030405; .`, ...childrenOf(p).map(mlsdLine)].map((l) => `${l}\r\n`).join(''));
      },
      async RETR(arg) {
        const f = files.get(abs(arg));
        if (!f || f.dir) { if (pasv) { pasv.server.close(); pasv = null; } say('550 No such file.'); return; }
        await send(f.data);
      },
      async STOR(arg) {
        const p = abs(arg);
        if (!files.get(parentOf(p))?.dir) { if (pasv) { pasv.server.close(); pasv = null; } say('553 No such directory.'); return; }
        await withData(async (s) => {
          say('150 Ok to send data.');
          const chunks = [];
          s.on('data', (c) => chunks.push(c));
          await new Promise((r) => s.on('close', r));
          files.set(p, { dir: false, data: Buffer.concat(chunks), mtime: Date.now() });
          say('226 Transfer complete.');
        });
      },
      SIZE(arg) { const f = files.get(abs(arg)); if (f && !f.dir) say(`213 ${f.data.length}`); else say('550 No such file.'); },
      DELE(arg) { const p = abs(arg); const f = files.get(p); if (f && !f.dir) { files.delete(p); say('250 Deleted.'); } else say('550 No such file.'); },
      MKD(arg) {
        const p = abs(arg);
        if (files.has(p)) say('550 Already exists.');
        else if (!files.get(parentOf(p))?.dir) say('550 No such directory.');
        else { files.set(p, { dir: true, mtime: Date.now() }); say(`257 "${p}" created.`); }
      },
      RMD(arg) {
        const p = abs(arg);
        if (!files.get(p)?.dir || p === '/') say('550 No such directory.');
        else if (childrenOf(p).length) say('550 Directory not empty.');
        else { files.delete(p); say('250 Removed.'); }
      },
      RNFR(arg) { const p = abs(arg); if (files.has(p)) { renameFrom = p; say('350 Ready for RNTO.'); } else say('550 No such file.'); },
      RNTO(arg) {
        if (!renameFrom) { say('503 RNFR first.'); return; }
        const to = abs(arg);
        for (const k of [...files.keys()]) {
          if (k === renameFrom || k.startsWith(`${renameFrom}/`)) { files.set(to + k.slice(renameFrom.length), files.get(k)); files.delete(k); }
        }
        renameFrom = null;
        say('250 Renamed.');
      },
      QUIT() { say('221 Bye.'); ctl.end(); },
    };

    let buf = '';
    let chain = Promise.resolve();
    ctl.on('data', (d) => {
      buf += d.toString('utf8');
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).replace(/\r$/, '');
        buf = buf.slice(nl + 1);
        const sp = line.indexOf(' ');
        const verb = (sp < 0 ? line : line.slice(0, sp)).toUpperCase();
        const arg = sp < 0 ? '' : line.slice(sp + 1);
        log.push(verb === 'PASS' ? 'PASS ***' : line);
        chain = chain.then(async () => {
          const h = handlers[verb];
          if (!h) { say('502 Command not implemented.'); return; }
          if (!authed && !['USER', 'PASS', 'QUIT', 'FEAT', 'SYST'].includes(verb)) { say('530 Please login.'); return; }
          await h(arg);
        }).catch(() => say('451 Local error.'));
      }
    });
    say('220 Test FTP server ready.');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return {
    port: server.address().port,
    files,
    log,
    addFile(path, data, mtime = Date.UTC(2024, 0, 2, 3, 4, 5)) { files.set(norm(path), { dir: false, data: Buffer.from(data), mtime }); },
    addDir(path) { files.set(norm(path), { dir: true, mtime: Date.UTC(2024, 0, 2, 3, 4, 5) }); },
    close() {
      for (const s of sockets) s.destroy();
      return new Promise((r) => server.close(() => r()));
    },
  };
}
