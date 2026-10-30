// SFTP server on ssh2's server API — the SSH "sftp" subsystem only (no shell,
// no exec, no port forwarding), like the original's FxSsh-based
// SftpServerManager. Password authentication through core/auth.js; the
// "none" method logs anonymous in when anonymous access is allowed.
//
// Paths are the same virtual tree as FTP (core/vfs.js): "/" lists the share
// names, "/name/…" is a folder on disk. Read rights gate OPENDIR / READDIR /
// STAT / OPEN-for-read / READ, write rights gate everything that changes
// something.
'use strict';

const fs = require('fs');

const { EventEmitter } = require('events');
const { Server, utils } = require('ssh2');
const { normalizePath } = require('./vfs');
const { authenticate, permissionSummary } = require('./auth');
const { render } = require('./messages');
const { formatBytes } = require('./ftp-server');

const { STATUS_CODE, OPEN_MODE, flagsToString } = utils.sftp;
const READDIR_BATCH = 48;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function attrsOf(e) {
  return { mode: e.mode, uid: 0, gid: 0, size: e.size, atime: Math.floor(e.atime / 1000), mtime: Math.floor(e.mtime / 1000) };
}
function longName(e) {
  const d = new Date(e.mtime);
  const p = (n) => String(n).padStart(2, '0');
  return `${e.isDir ? 'drwxr-xr-x' : '-rw-r--r--'}   1 ftp      ftp      ${String(e.size).padStart(10)} ${MONTHS[d.getMonth()]} ${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())} ${e.name}`;
}
function peerOf(info) { return `${(info.ip || '').replace(/^::ffff:/, '')}:${info.port || 0}`; }

class SftpServer extends EventEmitter {
  constructor(opts) {
    super();
    this.proto = 'SFTP';
    this.port = opts.port;
    this.host = opts.host || '';
    this.vfs = opts.vfs;
    this.auth = opts.auth || { allowAnonymous: false, users: [] };
    this.hostKey = opts.hostKey;              // PEM
    this.maxConnections = Number(opts.maxConnections) || 0;
    this.log = opts.log;
    this.lang = opts.lang || 'ko';
    this.clients = new Set();
    this.server = null;
    this.totalConnections = 0;
  }

  get clientCount() { return this.clients.size; }

  start() {
    return new Promise((resolve, reject) => {
      this.server = new Server({ hostKeys: [this.hostKey], ident: 'SSH-2.0-MyFTPServer_1.0' }, (client, info) => this.accept(client, info));
      this.server.on('error', (err) => {
        const params = { proto: 'SFTP', port: this.port, msg: err.message };
        const key = err.code === 'EADDRINUSE' ? 'listen_in_use' : err.code === 'EACCES' ? 'listen_denied' : 'listen_error';
        const e = new Error(render(this.lang, key, params));
        e.code = err.code; e.port = this.port;
        this.server = null;
        reject(e);
      });
      this.server.listen(this.port, this.host || undefined, () => {
        this.port = this.server.address().port;
        this.log.ok('sftp_started', { port: this.port, mounts: this.vfs.virtualNames.join(', ') });
        this.server.on('error', (err) => this.log.error('listen_error', { proto: 'SFTP', port: this.port, msg: err.message }));
        resolve();
      });
    });
  }

  stop() {
    return new Promise((resolve) => {
      const server = this.server;
      this.server = null;
      for (const c of Array.from(this.clients)) { try { c.end(); } catch { /* ignore */ } }
      if (!server) return resolve();
      server.close(() => { this.log.info('sftp_stopped'); resolve(); });
      setTimeout(resolve, 1500).unref();
    });
  }

  accept(client, info) {
    const peer = peerOf(info);
    if (this.maxConnections > 0 && this.clients.size >= this.maxConnections) {
      this.log.warn('client_limit', { proto: 'SFTP', max: this.maxConnections, peer });
      try { client.end(); } catch { /* ignore */ }
      return;
    }
    this.clients.add(client);
    this.totalConnections++;
    this.emit('clients', this.clients.size);
    this.log.info('client_connected', { proto: 'SFTP', peer });
    let perm = null;

    client.on('error', (err) => { if (!/ECONNRESET|closed/i.test(err.message)) this.log.warn('client_error', { proto: 'SFTP', peer, msg: err.message }); });
    client.on('close', () => {
      this.clients.delete(client);
      this.emit('clients', this.clients.size);
      this.log.info('client_closed', { proto: 'SFTP', peer });
    });

    client.on('authentication', (ctx) => {
      if (ctx.method === 'none') {
        // Anonymous needs no password; everyone else is asked for one.
        const p = ctx.username.toLowerCase() === 'anonymous' ? authenticate(ctx.username, '', this.auth) : null;
        if (p) { perm = p; this.log.ok('login_ok', { proto: 'SFTP', user: p.user, perm: permissionSummary(p, this.lang), peer }); return ctx.accept(); }
        return ctx.reject(['password']);
      }
      if (ctx.method === 'password') {
        const p = authenticate(ctx.username, ctx.password, this.auth);
        if (p) { perm = p; this.log.ok('login_ok', { proto: 'SFTP', user: p.user, perm: permissionSummary(p, this.lang), peer }); return ctx.accept(); }
        this.log.warn('login_failed', { proto: 'SFTP', user: ctx.username, peer });
        return ctx.reject(['password']);
      }
      return ctx.reject(['password']);
    });

    client.on('ready', () => {
      client.on('session', (acceptSession) => {
        const session = acceptSession();
        const refuse = (what) => (_accept, reject) => { this.log.warn('sftp_rejected', { what, peer }); if (reject) reject(); };
        session.on('shell', refuse('shell'));
        session.on('exec', refuse('exec'));
        session.on('pty', refuse('pty'));
        session.on('subsystem', (acceptSub, rejectSub, subInfo) => refuse(subInfo.name)(acceptSub, rejectSub));
        session.on('sftp', (acceptSftp) => {
          const sftp = acceptSftp();
          this.log.info('sftp_subsystem', { user: perm.user, peer });
          new SftpSession(this, sftp, perm, peer);
        });
      });
      client.on('request', (accept, reject) => { if (reject) reject(); });
    });
  }
}

// ── one SFTP subsystem channel ──
class SftpSession {
  constructor(server, sftp, perm, peer) {
    this.server = server;
    this.vfs = server.vfs;
    this.log = server.log;
    this.sftp = sftp;
    this.perm = perm;
    this.peer = peer;
    this.handles = new Map();     // id → { fd, vpath, read, written } | { entries, pos }
    this.next = 1;
    this.bind();
    sftp.on('end', () => this.closeAll());
    sftp.on('close', () => this.closeAll());
    sftp.on('error', () => this.closeAll());
  }

  get user() { return this.perm.user; }

  mk(obj) {
    const id = this.next++;
    this.handles.set(id, obj);
    const b = Buffer.alloc(4);
    b.writeUInt32BE(id);
    return b;
  }
  get(h) { return h && h.length >= 4 ? this.handles.get(h.readUInt32BE(0)) : undefined; }
  drop(h) { if (h && h.length >= 4) this.handles.delete(h.readUInt32BE(0)); }

  closeAll() {
    for (const [, h] of this.handles) if (h.fd !== undefined) { try { fs.closeSync(h.fd); } catch { /* ignore */ } }
    this.handles.clear();
  }

  status(reqid, code, msg) { try { this.sftp.status(reqid, code, msg); } catch { /* channel gone */ } }
  fail(reqid, err) {
    const code = err && err.code === 'ENOENT' ? STATUS_CODE.NO_SUCH_FILE : err && (err.code === 'EACCES' || err.code === 'EPERM') ? STATUS_CODE.PERMISSION_DENIED : STATUS_CODE.FAILURE;
    this.status(reqid, code, err && err.message);
  }
  denyRead(reqid, vpath) { this.log.warn('denied_read', { path: vpath, user: this.user }); this.status(reqid, STATUS_CODE.PERMISSION_DENIED, 'Read not allowed'); }
  denyWrite(reqid, vpath) { this.log.warn('denied_write', { path: vpath, user: this.user }); this.status(reqid, STATUS_CODE.PERMISSION_DENIED, 'Write not allowed'); }

  // Physical path of a virtual one; a share root / "/" is a folder without a
  // file on disk in multi-mount mode.
  disk(p) {
    const vpath = normalizePath(p || '/');
    return { vpath, physical: this.vfs.resolve(vpath) };
  }

  bind() {
    const { sftp } = this;

    sftp.on('REALPATH', (reqid, p) => {
      const { vpath } = this.disk(p === '.' || !p ? '/' : p);
      const st = this.vfs.stat(vpath);
      sftp.name(reqid, [{ filename: vpath, longname: vpath, attrs: st ? attrsOf(st) : {} }]);
    });

    const stat = (reqid, p) => {
      const { vpath } = this.disk(p);
      if (!this.perm.canRead) return this.denyRead(reqid, vpath);
      const st = this.vfs.stat(vpath);
      if (!st) return this.status(reqid, STATUS_CODE.NO_SUCH_FILE, 'No such file or directory');
      return sftp.attrs(reqid, attrsOf(st));
    };
    sftp.on('STAT', stat);
    sftp.on('LSTAT', stat);

    sftp.on('OPENDIR', (reqid, p) => {
      const { vpath } = this.disk(p);
      if (!this.perm.canRead) return this.denyRead(reqid, vpath);
      let entries;
      try { entries = this.vfs.list(vpath); } catch (err) { return this.fail(reqid, err); }
      if (!this.vfs.directoryExists(vpath)) return this.status(reqid, STATUS_CODE.NO_SUCH_FILE, 'No such folder');
      this.log.trace(`SFTP ${this.peer} OPENDIR ${vpath} (${entries.length})`);
      return sftp.handle(reqid, this.mk({ entries, pos: 0 }));
    });

    sftp.on('READDIR', (reqid, handle) => {
      const h = this.get(handle);
      if (!h || !h.entries) return this.status(reqid, STATUS_CODE.FAILURE, 'Bad handle');
      if (h.pos >= h.entries.length) return this.status(reqid, STATUS_CODE.EOF);
      const chunk = h.entries.slice(h.pos, h.pos + READDIR_BATCH);
      h.pos += chunk.length;
      return sftp.name(reqid, chunk.map((e) => ({ filename: e.name, longname: longName(e), attrs: attrsOf(e) })));
    });

    sftp.on('OPEN', (reqid, filename, flags) => {
      const { vpath, physical } = this.disk(filename);
      const wantsWrite = (flags & (OPEN_MODE.WRITE | OPEN_MODE.APPEND | OPEN_MODE.CREAT | OPEN_MODE.TRUNC)) !== 0;
      const wantsRead = (flags & OPEN_MODE.READ) !== 0;
      if (wantsRead && !this.perm.canRead) return this.denyRead(reqid, vpath);
      if (wantsWrite && !this.perm.canWrite) return this.denyWrite(reqid, vpath);
      if (!physical || this.vfs.isRoot(vpath)) return this.status(reqid, STATUS_CODE.NO_SUCH_FILE, 'Not a file');
      try {
        if (fs.existsSync(physical) && fs.statSync(physical).isDirectory()) return this.status(reqid, STATUS_CODE.FAILURE, 'Is a directory');
        const fd = fs.openSync(physical, flagsToString(flags) || 'r');
        return sftp.handle(reqid, this.mk({ fd, vpath, read: 0, written: 0 }));
      } catch (err) { return this.fail(reqid, err); }
    });

    sftp.on('READ', (reqid, handle, offset, length) => {
      const h = this.get(handle);
      if (!h || h.fd === undefined) return this.status(reqid, STATUS_CODE.FAILURE, 'Bad handle');
      if (!this.perm.canRead) return this.denyRead(reqid, h.vpath);
      const buf = Buffer.alloc(length);
      return fs.read(h.fd, buf, 0, length, Number(offset), (err, n) => {
        if (err) return this.fail(reqid, err);
        if (n === 0) return this.status(reqid, STATUS_CODE.EOF);
        h.read += n;
        return sftp.data(reqid, n < length ? buf.subarray(0, n) : buf);
      });
    });

    sftp.on('WRITE', (reqid, handle, offset, data) => {
      const h = this.get(handle);
      if (!h || h.fd === undefined) return this.status(reqid, STATUS_CODE.FAILURE, 'Bad handle');
      if (!this.perm.canWrite) return this.denyWrite(reqid, h.vpath);
      return fs.write(h.fd, data, 0, data.length, Number(offset), (err) => {
        if (err) return this.fail(reqid, err);
        h.written += data.length;
        return this.status(reqid, STATUS_CODE.OK);
      });
    });

    sftp.on('FSTAT', (reqid, handle) => {
      const h = this.get(handle);
      if (!h) return this.status(reqid, STATUS_CODE.FAILURE, 'Bad handle');
      if (h.fd === undefined) return sftp.attrs(reqid, attrsOf({ mode: 0o40755, size: 0, atime: Date.now(), mtime: Date.now() }));
      try { const st = fs.fstatSync(h.fd); return sftp.attrs(reqid, attrsOf({ mode: st.isDirectory() ? 0o40755 : 0o100644, size: st.size, atime: st.atimeMs, mtime: st.mtimeMs })); }
      catch (err) { return this.fail(reqid, err); }
    });

    const setstat = (reqid, physical, attrs) => {
      try {
        if (physical && attrs && attrs.mtime !== undefined) fs.utimesSync(physical, attrs.atime !== undefined ? attrs.atime : attrs.mtime, attrs.mtime);
        this.status(reqid, STATUS_CODE.OK);
      } catch (err) { this.fail(reqid, err); }
    };
    sftp.on('SETSTAT', (reqid, p, attrs) => {
      const { vpath, physical } = this.disk(p);
      if (!this.perm.canWrite) return this.denyWrite(reqid, vpath);
      return setstat(reqid, physical, attrs);
    });
    sftp.on('FSETSTAT', (reqid, handle, attrs) => {
      const h = this.get(handle);
      if (!h) return this.status(reqid, STATUS_CODE.FAILURE, 'Bad handle');
      if (!this.perm.canWrite) return this.denyWrite(reqid, h.vpath || '/');
      if (h.fd === undefined) return this.status(reqid, STATUS_CODE.OK);
      try { if (attrs && attrs.mtime !== undefined) fs.futimesSync(h.fd, attrs.atime !== undefined ? attrs.atime : attrs.mtime, attrs.mtime); return this.status(reqid, STATUS_CODE.OK); }
      catch (err) { return this.fail(reqid, err); }
    });

    sftp.on('CLOSE', (reqid, handle) => {
      const h = this.get(handle);
      if (h && h.fd !== undefined) {
        try { fs.closeSync(h.fd); } catch { /* ignore */ }
        if (h.written > 0) { this.log.ok('upload_done', { name: h.vpath, size: formatBytes(h.written), user: this.user, peer: this.peer }); this.server.emit('transfer', { dir: 'up', name: h.vpath, bytes: h.written, user: this.user, peer: this.peer }); }
        if (h.read > 0 && !h.written) { this.log.ok('download_done', { name: h.vpath, size: formatBytes(h.read), user: this.user, peer: this.peer }); this.server.emit('transfer', { dir: 'down', name: h.vpath, bytes: h.read, user: this.user, peer: this.peer }); }
      }
      this.drop(handle);
      this.status(reqid, STATUS_CODE.OK);
    });

    sftp.on('REMOVE', (reqid, p) => {
      const { vpath, physical } = this.disk(p);
      if (!this.perm.canWrite) return this.denyWrite(reqid, vpath);
      if (!physical) return this.status(reqid, STATUS_CODE.NO_SUCH_FILE, 'No such file');
      try { fs.unlinkSync(physical); this.log.info('file_deleted', { path: vpath, user: this.user }); return this.status(reqid, STATUS_CODE.OK); }
      catch (err) { return this.fail(reqid, err); }
    });

    sftp.on('MKDIR', (reqid, p) => {
      const { vpath, physical } = this.disk(p);
      if (!this.perm.canWrite) return this.denyWrite(reqid, vpath);
      if (!physical || this.vfs.isRoot(vpath)) return this.status(reqid, STATUS_CODE.PERMISSION_DENIED, 'Cannot create a folder here');
      try { fs.mkdirSync(physical); this.log.info('dir_created', { path: vpath, user: this.user }); return this.status(reqid, STATUS_CODE.OK); }
      catch (err) { return this.fail(reqid, err); }
    });

    sftp.on('RMDIR', (reqid, p) => {
      const { vpath, physical } = this.disk(p);
      if (!this.perm.canWrite) return this.denyWrite(reqid, vpath);
      const hit = this.vfs.mountOf(vpath);
      if (!physical || !hit || !hit.rest || hit.rest === '/') return this.status(reqid, STATUS_CODE.PERMISSION_DENIED, 'Cannot remove a share root');
      try { fs.rmdirSync(physical); this.log.info('dir_deleted', { path: vpath, user: this.user }); return this.status(reqid, STATUS_CODE.OK); }
      catch (err) { return this.fail(reqid, err); }
    });

    sftp.on('RENAME', (reqid, from, to) => {
      const a = this.disk(from);
      const b = this.disk(to);
      if (!this.perm.canWrite) return this.denyWrite(reqid, a.vpath);
      if (!a.physical || !b.physical || this.vfs.isRoot(a.vpath) || this.vfs.isRoot(b.vpath)) return this.status(reqid, STATUS_CODE.NO_SUCH_FILE, 'Path not found');
      try { fs.renameSync(a.physical, b.physical); this.log.info('renamed', { from: a.vpath, to: b.vpath, user: this.user }); return this.status(reqid, STATUS_CODE.OK); }
      catch (err) { return this.fail(reqid, err); }
    });

    sftp.on('READLINK', (reqid) => this.status(reqid, STATUS_CODE.OP_UNSUPPORTED));
    sftp.on('SYMLINK', (reqid) => this.status(reqid, STATUS_CODE.OP_UNSUPPORTED));
  }
}

module.exports = { SftpServer };
