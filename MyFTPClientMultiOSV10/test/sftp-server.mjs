// A small SFTP server (ssh2's server API) for the tests — serves one folder
// on disk over loopback with password authentication. Implements what the
// client uses: OPEN / READ / WRITE / CLOSE, OPENDIR / READDIR, STAT / LSTAT /
// FSTAT / REALPATH, MKDIR / RMDIR / REMOVE / RENAME. Not for production use.
import { createRequire } from 'node:module';
import { generateKeyPairSync } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const ssh2 = require('ssh2');
const { Server, utils } = ssh2;
const { STATUS_CODE, OPEN_MODE, flagsToString } = utils.sftp;

function attrsOf(st) {
  return { mode: st.mode, uid: 0, gid: 0, size: st.size, atime: Math.floor(st.atimeMs / 1000), mtime: Math.floor(st.mtimeMs / 1000) };
}

export function startSftpServer({ root, user = 'test', password = 'secret', host = '127.0.0.1', port = 0 } = {}) {
  root = path.resolve(root);
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs1', format: 'pem' }, publicKeyEncoding: { type: 'pkcs1', format: 'pem' } });

  const toDisk = (p) => {
    const norm = path.posix.normalize(p.startsWith('/') ? p : `/${p}`).replace(/\/+$/, '') || '/';
    const disk = path.join(root, norm.split('/').filter(Boolean).join(path.sep));
    if (!disk.startsWith(root)) throw new Error('outside root');
    return { virtual: norm, disk };
  };

  const clients = new Set();
  const server = new Server({ hostKeys: [privateKey] }, (client) => {
    clients.add(client);
    client.on('error', () => {});
    client.on('close', () => clients.delete(client));
    client.on('authentication', (ctx) => {
      if (ctx.method === 'password' && ctx.username === user && ctx.password === password) ctx.accept();
      else ctx.reject(['password']);
    });
    client.on('ready', () => {
      client.on('session', (accept) => {
        const session = accept();
        session.on('sftp', (acceptSftp) => {
          const sftp = acceptSftp();
          const handles = new Map();   // handle id → { fd } | { entries, pos }
          let nextHandle = 1;
          const mk = (obj) => { const id = nextHandle++; handles.set(id, obj); const b = Buffer.alloc(4); b.writeUInt32BE(id); return b; };
          const get = (h) => handles.get(h.readUInt32BE(0));
          const fail = (reqid, err) => sftp.status(reqid, err && err.code === 'ENOENT' ? STATUS_CODE.NO_SUCH_FILE : STATUS_CODE.FAILURE, err && err.message);

          sftp.on('OPEN', (reqid, filename, flags) => {
            try {
              const { disk } = toDisk(filename);
              const fd = fs.openSync(disk, flagsToString(flags) || 'r');
              sftp.handle(reqid, mk({ fd }));
            } catch (err) { fail(reqid, err); }
          });
          sftp.on('READ', (reqid, handle, offset, length) => {
            const h = get(handle);
            if (!h || h.fd === undefined) return sftp.status(reqid, STATUS_CODE.FAILURE);
            const buf = Buffer.alloc(length);
            fs.read(h.fd, buf, 0, length, Number(offset), (err, n) => {
              if (err) return fail(reqid, err);
              if (n === 0) return sftp.status(reqid, STATUS_CODE.EOF);
              sftp.data(reqid, n < length ? buf.subarray(0, n) : buf);
            });
          });
          sftp.on('WRITE', (reqid, handle, offset, data) => {
            const h = get(handle);
            if (!h || h.fd === undefined) return sftp.status(reqid, STATUS_CODE.FAILURE);
            fs.write(h.fd, data, 0, data.length, Number(offset), (err) => (err ? fail(reqid, err) : sftp.status(reqid, STATUS_CODE.OK)));
          });
          sftp.on('FSTAT', (reqid, handle) => {
            const h = get(handle);
            if (!h || h.fd === undefined) return sftp.status(reqid, STATUS_CODE.FAILURE);
            try { sftp.attrs(reqid, attrsOf(fs.fstatSync(h.fd))); } catch (err) { fail(reqid, err); }
          });
          sftp.on('CLOSE', (reqid, handle) => {
            const h = get(handle);
            if (h && h.fd !== undefined) { try { fs.closeSync(h.fd); } catch { /* ignore */ } }
            handles.delete(handle.readUInt32BE(0));
            sftp.status(reqid, STATUS_CODE.OK);
          });
          sftp.on('OPENDIR', (reqid, p) => {
            try {
              const { disk } = toDisk(p);
              if (!fs.statSync(disk).isDirectory()) return sftp.status(reqid, STATUS_CODE.NO_SUCH_FILE);
              const entries = fs.readdirSync(disk).map((name) => {
                const st = fs.statSync(path.join(disk, name));
                const longname = `${st.isDirectory() ? 'd' : '-'}rw-r--r--   1 test test ${String(st.size).padStart(10)} Jan  1 00:00 ${name}`;
                return { filename: name, longname, attrs: attrsOf(st) };
              });
              sftp.handle(reqid, mk({ entries, pos: 0 }));
            } catch (err) { fail(reqid, err); }
          });
          sftp.on('READDIR', (reqid, handle) => {
            const h = get(handle);
            if (!h || !h.entries) return sftp.status(reqid, STATUS_CODE.FAILURE);
            if (h.pos >= h.entries.length) return sftp.status(reqid, STATUS_CODE.EOF);
            const chunk = h.entries.slice(h.pos, h.pos + 50);
            h.pos += chunk.length;
            sftp.name(reqid, chunk);
          });
          const stat = (reqid, p) => { try { sftp.attrs(reqid, attrsOf(fs.statSync(toDisk(p).disk))); } catch (err) { fail(reqid, err); } };
          sftp.on('STAT', stat);
          sftp.on('LSTAT', stat);
          sftp.on('REALPATH', (reqid, p) => {
            try { const { virtual } = toDisk(p || '.'); sftp.name(reqid, [{ filename: virtual, longname: virtual, attrs: {} }]); } catch (err) { fail(reqid, err); }
          });
          sftp.on('MKDIR', (reqid, p) => { try { fs.mkdirSync(toDisk(p).disk); sftp.status(reqid, STATUS_CODE.OK); } catch (err) { fail(reqid, err); } });
          sftp.on('RMDIR', (reqid, p) => { try { fs.rmdirSync(toDisk(p).disk); sftp.status(reqid, STATUS_CODE.OK); } catch (err) { fail(reqid, err); } });
          sftp.on('REMOVE', (reqid, p) => { try { fs.unlinkSync(toDisk(p).disk); sftp.status(reqid, STATUS_CODE.OK); } catch (err) { fail(reqid, err); } });
          sftp.on('RENAME', (reqid, from, to) => { try { fs.renameSync(toDisk(from).disk, toDisk(to).disk); sftp.status(reqid, STATUS_CODE.OK); } catch (err) { fail(reqid, err); } });
        });
      });
    });
  });

  return new Promise((resolve) => {
    server.listen(port, host, () => {
      resolve({
        port: server.address().port,
        host,
        user,
        password,
        root,
        close: () => new Promise((r) => { for (const c of clients) { try { c.end(); } catch { /* ignore */ } } server.close(() => r()); }),
      });
    });
  });
}

void OPEN_MODE;
