// FTP connection objects: f = ftp(host, user, password) with the methods
// ascii, binary, cd, close, delete, dir, mget, mkdir, mput, rename, rmdir.
// Sockets live in the application host; the engine sends requests
//   ctx.host.request({ type: 'ftp', op, session, ... })
// with these operations and replies (any reply may be { error: 'message' }):
//   open   { host, port, user, password }        → { session, path }
//   close  { session }                             → { ok: true }
//   pwd    { session }                             → { path }
//   cd     { session, path }                       → { path }         (new working directory)
//   list   { session, path }                       → { entries: [{ name, isDir, size, mtimeMs }] }
//   get    { session, path, mode: 'binary'|'ascii' } → { bodyBase64 }  (or { bytes })
//   put    { session, path, bodyBase64, mode }     → { ok: true }
//   delete { session, path }   mkdir { session, path }   rmdir { session, path }
//   rename { session, from, to }                   → { ok: true }
// Without a host every call fails with 'io:ftp:noHost'.
import {
  E, S, str, num, bool, cell, isTextArg, absPath, baseName, dirName, fsExists, isDirPath, writeFileBytes, structArray, globRegExp,
} from './util.js';
import { object } from '../../value.js';
import { toBase64, fromBase64 } from './web.js';

let ftpSeq = 0;

function ftpRequest(ctx, p, op, extra = {}) {
  let reply = null;
  try { reply = ctx.host && typeof ctx.host.request === 'function' ? ctx.host.request({ type: 'ftp', op, session: p ? p.session : null, ...extra }) : null; } catch (e) {
    throw E('io:ftp:failed', `FTP ${op} failed: ${e.message}`);
  }
  if (reply == null) throw E('io:ftp:noHost', 'FTP is not available here (no application host to open network connections).');
  if (reply.error) throw E('io:ftp:failed', `FTP ${op} failed: ${reply.error}`);
  return reply;
}

const joinRemote = (dir, name) => (name.startsWith('/') ? name : `${String(dir || '/').replace(/\/+$/, '')}/${name}`);
const hasWild = (s) => /[*?]/.test(s);
const props = (o) => {
  if (!o || !o.isObject || o.cls !== 'ftp') throw E('io:ftp:badObject', 'The first argument must be an ftp object.');
  if (o.props.closed) throw E('io:ftp:closed', 'The FTP connection is closed.');
  return o.props;
};

function makeFtp(args, ctx) {
  if (!args.length) throw E('io:ftp:notEnoughInputs', 'ftp needs a host name.');
  let host = S(args[0]);
  let port = 21;
  const m = /^(?:ftp:\/\/)?([^/:]+)(?::(\d+))?\/?$/.exec(host);
  if (!m) throw E('io:ftp:badHost', `Invalid host name '${host}'.`);
  host = m[1]; if (m[2]) port = +m[2];
  const user = args[1] !== undefined ? S(args[1]) : 'anonymous';
  const password = args[2] !== undefined ? S(args[2]) : '';
  const p = { id: ++ftpSeq, host, port, user, session: null, mode: 'binary', path: '/', closed: false };
  const r = ftpRequest(ctx, null, 'open', { host, port, user, password });
  p.session = r.session ?? p.id;
  if (r.path) p.path = String(r.path);
  return object('ftp', p, { handle: true });
}

function listRemote(ctx, p, path) {
  const r = ftpRequest(ctx, p, 'list', { path });
  return (Array.isArray(r.entries) ? r.entries : []).filter((e) => e && e.name !== '.' && e.name !== '..');
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function dateText(ms) {
  if (!Number.isFinite(ms)) return '';
  const d = new Date(ms);
  const p2 = (x) => String(x).padStart(2, '0');
  return `${p2(d.getDate())}-${MON[d.getMonth()]}-${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
}
const datenumOf = (ms) => (Number.isFinite(ms) ? (ms - new Date(ms).getTimezoneOffset() * 60000) / 86400000 + 719529 : NaN);

function remoteBytes(r) {
  if (r.bytes) return r.bytes instanceof Uint8Array ? r.bytes : Uint8Array.from(r.bytes);
  if (r.bodyBase64 != null) return fromBase64(r.bodyBase64);
  if (r.text != null) return new TextEncoder().encode(r.text);
  return new Uint8Array(0);
}

/** Downloads one remote path (file or directory, recursively) into localDir. */
function download(ctx, p, remote, localDir, out) {
  const parent = dirName(remote) === '.' ? p.path : dirName(remote);
  const name = baseName(remote);
  const entry = listRemote(ctx, p, parent).find((e) => e.name === name);
  if (entry && entry.isDir) {
    const dir = `${localDir}/${name}`;
    if (!fsExists(ctx, dir)) ctx.fs.mkdir(dir);
    for (const e of listRemote(ctx, p, remote)) download(ctx, p, joinRemote(remote, e.name), dir, out);
    return;
  }
  const r = ftpRequest(ctx, p, 'get', { path: remote, mode: p.mode });
  let bytes = remoteBytes(r);
  if (p.mode === 'ascii') bytes = new TextEncoder().encode(new TextDecoder().decode(bytes).replace(/\r\n/g, '\n'));
  const local = `${localDir}/${name}`;
  writeFileBytes(ctx, local, bytes);
  out.push(local);
}

/** Uploads one local path (file or directory, recursively) into the remote directory. */
function upload(ctx, p, local, remoteDir, out) {
  const name = baseName(local);
  const remote = joinRemote(remoteDir, name);
  if (isDirPath(ctx, local)) {
    try { ftpRequest(ctx, p, 'mkdir', { path: remote }); } catch { /* may exist already */ }
    for (const e of ctx.fs.list(local)) upload(ctx, p, `${local}/${e.name}`, remote, out);
    return;
  }
  let bytes = ctx.fs.readBytes(local);
  if (p.mode === 'ascii') bytes = new TextEncoder().encode(new TextDecoder().decode(bytes).replace(/\r?\n/g, '\r\n'));
  ftpRequest(ctx, p, 'put', { path: remote, bodyBase64: toBase64(bytes), mode: p.mode });
  out.push(remote);
}

const FTP_METHODS = {
  ascii(args) { props(args[0]).mode = 'ascii'; return undefined; },
  binary(args) { props(args[0]).mode = 'binary'; return undefined; },
  cd(args, nargout, ctx) {
    const p = props(args[0]);
    if (args[1] !== undefined) {
      const r = ftpRequest(ctx, p, 'cd', { path: joinRemote(p.path, S(args[1])) });
      p.path = String(r.path ?? joinRemote(p.path, S(args[1])));
    } else {
      const r = ftpRequest(ctx, p, 'pwd');
      if (r.path) p.path = String(r.path);
    }
    return str(p.path);
  },
  close(args, nargout, ctx) {
    const o = args[0];
    if (!o.props.closed) { try { ftpRequest(ctx, o.props, 'close'); } finally { o.props.closed = true; } }
    return undefined;
  },
  delete(args, nargout, ctx) {
    const p = props(args[0]);
    if (args[1] === undefined) throw E('io:ftp:notEnoughInputs', 'delete needs a remote file name.');
    const pat = S(args[1]);
    const names = hasWild(pat)
      ? listRemote(ctx, p, dirName(pat) === '.' ? p.path : joinRemote(p.path, dirName(pat))).filter((e) => !e.isDir && globRegExp(baseName(pat)).test(e.name)).map((e) => joinRemote(dirName(pat) === '.' ? p.path : joinRemote(p.path, dirName(pat)), e.name))
      : [joinRemote(p.path, pat)];
    for (const n of names) ftpRequest(ctx, p, 'delete', { path: n });
    return undefined;
  },
  dir(args, nargout, ctx) {
    const p = props(args[0]);
    const path = args[1] !== undefined ? joinRemote(p.path, S(args[1])) : p.path;
    let entries;
    if (args[1] !== undefined && hasWild(S(args[1]))) {
      const base = dirName(path);
      const re = globRegExp(baseName(path));
      entries = listRemote(ctx, p, base).filter((e) => re.test(e.name));
    } else entries = listRemote(ctx, p, path);
    if (nargout === 0) {
      ctx.out(entries.length ? entries.map((e) => e.name + (e.isDir ? '/' : '')).join('  ') + '\n\n' : '\n');
      return undefined;
    }
    return structArray(entries.map((e) => ({
      name: str(e.name), date: str(dateText(Number(e.mtimeMs))), bytes: num(Number(e.size) || 0), isdir: bool(!!e.isDir), datenum: num(datenumOf(Number(e.mtimeMs))),
    })), ['name', 'date', 'bytes', 'isdir', 'datenum'], [entries.length, 1]);
  },
  mget(args, nargout, ctx) {
    const p = props(args[0]);
    if (args[1] === undefined) throw E('io:ftp:notEnoughInputs', 'mget needs a remote file name.');
    const pat = S(args[1]);
    const target = absPath(ctx, args[2] !== undefined ? S(args[2]) : '.').replace(/\/+$/, '');
    if (!fsExists(ctx, target)) ctx.fs.mkdir(target);
    const out = [];
    if (hasWild(pat)) {
      const base = dirName(pat) === '.' ? p.path : joinRemote(p.path, dirName(pat));
      const re = globRegExp(baseName(pat));
      const hits = listRemote(ctx, p, base).filter((e) => re.test(e.name));
      if (!hits.length) throw E('io:ftp:noMatch', `No remote files match '${pat}'.`);
      for (const e of hits) download(ctx, p, joinRemote(base, e.name), target, out);
    } else download(ctx, p, joinRemote(p.path, pat), target, out);
    return nargout > 0 ? cell([out.length, 1], out.map((s) => str(s))) : undefined;
  },
  mkdir(args, nargout, ctx) {
    const p = props(args[0]);
    if (args[1] === undefined) throw E('io:ftp:notEnoughInputs', 'mkdir needs a directory name.');
    ftpRequest(ctx, p, 'mkdir', { path: joinRemote(p.path, S(args[1])) });
    return undefined;
  },
  mput(args, nargout, ctx) {
    const p = props(args[0]);
    if (args[1] === undefined) throw E('io:ftp:notEnoughInputs', 'mput needs a local file name.');
    const pat = S(args[1]);
    const full = absPath(ctx, pat);
    let locals;
    if (hasWild(baseName(full))) {
      const dir = dirName(full);
      const re = globRegExp(baseName(full));
      locals = ctx.fs.list(dir).filter((e) => re.test(e.name)).map((e) => `${dir}/${e.name}`);
      if (!locals.length) throw E('io:ftp:noMatch', `No local files match '${pat}'.`);
    } else {
      if (!fsExists(ctx, full)) throw E('io:ftp:fileNotFound', `Local file '${pat}' not found.`);
      locals = [full];
    }
    const out = [];
    for (const l of locals) upload(ctx, p, l, p.path, out);
    return nargout > 0 ? cell([out.length, 1], out.map((s) => str(s))) : undefined;
  },
  rename(args, nargout, ctx) {
    const p = props(args[0]);
    if (args.length < 3) throw E('io:ftp:notEnoughInputs', 'rename needs the old and the new name.');
    ftpRequest(ctx, p, 'rename', { from: joinRemote(p.path, S(args[1])), to: joinRemote(p.path, S(args[2])) });
    return undefined;
  },
  rmdir(args, nargout, ctx) {
    const p = props(args[0]);
    if (args[1] === undefined) throw E('io:ftp:notEnoughInputs', 'rmdir needs a directory name.');
    ftpRequest(ctx, p, 'rmdir', { path: joinRemote(p.path, S(args[1])) });
    return undefined;
  },
};

const FTP_CLASS = {
  handle: true,
  props: ['Host', 'Port', 'User', 'Mode', 'Folder'],
  construct(args, ctx) { return makeFtp(args, ctx); },
  subsref(obj, subs) {
    if (subs[0].type === '.') {
      const name = Array.isArray(subs[0].subs) ? S(subs[0].subs[0]) : String(subs[0].subs);
      const p = obj.props;
      const map = { host: str(p.host), port: num(p.port), user: str(p.user), mode: str(p.mode), folder: str(p.path) };
      const v = map[name.toLowerCase()];
      if (v) return [v];
      throw E('io:ftp:noProperty', `Unrecognized property '${name}' for class 'ftp'.`);
    }
    throw E('io:ftp:badIndex', 'ftp objects support only property access.');
  },
  methods: FTP_METHODS,
  display(obj) {
    const p = obj.props;
    return `  FTP Object\n     host: ${p.host}${p.port !== 21 ? ':' + p.port : ''}\n     user: ${p.user}\n      dir: ${p.path}\n     mode: ${p.mode}${p.closed ? '\n   (closed)' : ''}\n`;
  },
};

export const classes = { ftp: FTP_CLASS };

const fwd = (name) => (args, nargout, ctx) => {
  if (!args[0] || !args[0].isObject || args[0].cls !== 'ftp') throw E(`io:${name}:badArgument`, `${name}: the first argument must be an ftp object.`);
  return FTP_METHODS[name](args, nargout, ctx);
};

export const builtins = {
  ftp: (args, nargout, ctx) => makeFtp(args, ctx),
  ascii: fwd('ascii'), binary: fwd('binary'), mget: fwd('mget'), mput: fwd('mput'),
};
void isTextArg;

const H = (en, ko, syntax) => ({ en, ko, syntax });
export const help = {
  ftp: H('Connect to an FTP server (through the application host). Methods: ascii, binary, cd, close, delete, dir, mget, mkdir, mput, rename, rmdir.', 'FTP 서버에 연결합니다 (응용 프로그램 호스트를 통해). 메서드: ascii, binary, cd, close, delete, dir, mget, mkdir, mput, rename, rmdir.', ['f = ftp(host)', 'f = ftp(host, username, password)', 'f = ftp("host:port", ...)']),
  ascii: H('Use ASCII transfer mode (line endings converted) on an FTP connection.', 'FTP 연결을 ASCII 전송 모드(줄 끝 변환)로 바꿉니다.', ['ascii(f)']),
  binary: H('Use binary transfer mode (the default) on an FTP connection.', 'FTP 연결을 이진 전송 모드(기본값)로 바꿉니다.', ['binary(f)']),
  mget: H('Download files or folders (wildcards allowed) from an FTP server.', 'FTP 서버에서 파일이나 폴더(와일드카드 허용)를 내려받습니다.', ['mget(f, file)', 'mget(f, dir)', 'mget(f, ___, target)', 'files = mget(___)']),
  mput: H('Upload files or folders (wildcards allowed) to an FTP server.', 'FTP 서버로 파일이나 폴더(와일드카드 허용)를 올립니다.', ['mput(f, file)', 'files = mput(f, file)']),
};
