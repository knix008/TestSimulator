// Files and folders: dir ls isfile isfolder isdir mkdir rmdir delete copyfile
// movefile fileattrib fileparts fullfile filesep pathsep tempdir tempname,
// file dialogs (through ctx.host), system/dos/unix, environment variables,
// platform and version queries.
import {
  E, S, N, str, num, bool, tensor, cell, isTextArg, isText, isCell, isString, strList, absPath, normPath, baseName, dirName,
  fsExists, isDirPath, globRegExp, structArray, structScalar, cellRowOf, nameValues, stringArray,
} from './util.js';
import { empty } from '../../value.js';

export const APP_VERSION = '1.0.0';
export const APP_RELEASE = '2026b';
export const APP_DATE = 'October 27, 2026';
export const APP_NAME = 'MySimulationMath';

// ---------------------------------------------------------------- platform

/** 'win' | 'mac' | 'linux', from ctx.fs paths or the runtime. */
export function platformOf(ctx) {
  try { if (ctx.fs.platform) return ctx.fs.platform; } catch { /* ignore */ }
  const p = (globalThis.process && globalThis.process.platform) || '';
  const nav = (globalThis.navigator && (globalThis.navigator.userAgentData?.platform || globalThis.navigator.platform)) || '';
  if (ctx.fs.kind === 'memory') return 'linux';
  try { if (/^[A-Za-z]:\//.test(ctx.fs.cwd())) return 'win'; } catch { /* ignore */ }
  if (p === 'win32' || /win/i.test(nav)) return 'win';
  if (p === 'darwin' || /mac/i.test(nav)) return 'mac';
  return 'linux';
}

// ---------------------------------------------------------------- dates

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const p2 = (x) => String(x).padStart(2, '0');
/** 'dd-mmm-yyyy HH:MM:SS' local time. */
export function dateText(ms) {
  const d = new Date(ms || 0);
  return `${p2(d.getDate())}-${MON[d.getMonth()]}-${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
}
/** Serial date number (days from year 0) of a JS time, local time. */
export function datenumOf(ms) {
  const d = new Date(ms || 0);
  return (ms - d.getTimezoneOffset() * 60000) / 86400000 + 719529;
}

// ---------------------------------------------------------------- listing

/** Lists entries matching a name or pattern (supports *, ? and ** in folders). */
export function listEntries(ctx, pattern) {
  const pat = pattern === undefined || pattern === '' ? '.' : String(pattern).replace(/\\/g, '/');
  const path = absPath(ctx, pat);
  if (isDirPath(ctx, path) && !/[*?]/.test(pat)) {
    const ents = ctx.fs.list(path).map((e) => ({ ...e, folder: path }));
    return [{ name: '.', isDir: true, size: 0, mtimeMs: 0, folder: path }, { name: '..', isDir: true, size: 0, mtimeMs: 0, folder: path }, ...ents];
  }
  // pattern: split into the fixed prefix folder and the wildcard parts
  const parts = path.split('/');
  let base = '';
  let k = 0;
  const drive = /^[A-Za-z]:$/.test(parts[0]);
  if (drive) { base = parts[0] + '/'; k = 1; } else if (parts[0] === '') { base = '/'; k = 1; }
  while (k < parts.length - 1 && !/[*?]/.test(parts[k])) { base = normPath(base + '/' + parts[k]); k++; }
  const rest = parts.slice(k);
  const out = [];
  const walk = (folder, idx) => {
    if (idx >= rest.length) return;
    const seg = rest[idx];
    let ents;
    try { ents = ctx.fs.list(folder); } catch { return; }
    if (seg === '**') {
      walk(folder, idx + 1);
      for (const e of ents) if (e.isDir) walk(normPath(folder + '/' + e.name), idx);
      return;
    }
    const re = globRegExp(seg, platformOf(ctx) === 'win' ? 'i' : '');
    for (const e of ents) {
      if (!re.test(e.name)) continue;
      const full = normPath(folder + '/' + e.name);
      if (idx === rest.length - 1) out.push({ ...e, folder });
      else if (e.isDir) walk(full, idx + 1);
    }
  };
  if (!rest.length) return out;
  if (rest.length === 1 && !/[*?]/.test(rest[0])) {
    const full = normPath(base + '/' + rest[0]);
    if (fsExists(ctx, full)) { const st = ctx.fs.stat(full); out.push({ name: rest[0], isDir: st.isDir, size: st.size, mtimeMs: st.mtimeMs, folder: normPath(base) }); }
    return out;
  }
  walk(normPath(base), 0);
  return out;
}

function dirStruct(list) {
  return structArray(list.map((e) => ({
    name: str(e.name), folder: str(e.folder), date: str(dateText(e.mtimeMs)), bytes: num(e.isDir ? 0 : e.size),
    isdir: bool(e.isDir), datenum: num(datenumOf(e.mtimeMs)),
  })), ['name', 'folder', 'date', 'bytes', 'isdir', 'datenum']);
}

function columns(names, width = 80) {
  if (!names.length) return '';
  const w = Math.max(...names.map((n) => n.length)) + 2;
  const per = Math.max(1, Math.floor(width / w));
  let s = '';
  for (let i = 0; i < names.length; i += per) s += names.slice(i, i + per).map((n) => n.padEnd(w)).join('').trimEnd() + '\n';
  return s;
}

function dir(args, nargout, ctx) {
  const pat = args.length ? S(args[0], 'Name') : '.';
  const list = listEntries(ctx, pat);
  if (nargout > 0) return dirStruct(list);
  if (!list.length) { ctx.warning('io:dir:notFound', `'${pat}' not found.`); return undefined; }
  ctx.out('\n' + columns(list.map((e) => e.name)) + '\n');
  return undefined;
}
function ls(args, nargout, ctx) {
  const pat = args.length ? S(args[0], 'Name') : '.';
  const names = listEntries(ctx, pat).map((e) => e.name).filter((n) => n !== '.' && n !== '..');
  if (nargout > 0) {
    if (!names.length) return tensor('char', [0, 0]);
    const w = Math.max(...names.map((n) => n.length));
    const t = tensor('char', [names.length, w]); t.re.fill(32);
    names.forEach((n, i) => { for (let j = 0; j < n.length; j++) t.re[i + j * names.length] = n.charCodeAt(j); });
    return t;
  }
  ctx.out('\n' + columns(names) + '\n');
  return undefined;
}

// ---------------------------------------------------------------- tests

function mapText(v, fn) {
  if (isTextArg(v)) return bool(fn(S(v)));
  const list = strList(v);
  const d = isCell(v) || isString(v) ? v.dims : [1, list.length];
  return tensor('logical', d, list.map((s) => (fn(s) ? 1 : 0)));
}
const isFileP = (ctx, p) => { try { const a = absPath(ctx, p); return ctx.fs.exists(a) && !ctx.fs.stat(a).isDir; } catch { return false; } };
const isDirP = (ctx, p) => { try { return isDirPath(ctx, absPath(ctx, p)); } catch { return false; } };

// ---------------------------------------------------------------- folders and files

function statusResult(nargout, ok, msg, id, fname) {
  if (!ok && nargout === 0) throw E(id || `io:${fname}:failed`, msg);
  return [bool(ok), str(ok ? '' : msg), str(ok ? '' : id)];
}

function mkdirFn(args, nargout, ctx) {
  if (!args.length) throw E('io:mkdir:notEnoughInputs', 'Not enough input arguments.');
  const target = args.length >= 2 ? `${S(args[0])}/${S(args[1])}` : S(args[0], 'Folder name');
  const p = absPath(ctx, target);
  if (isDirPath(ctx, p)) {
    if (nargout === 0) ctx.warning('io:mkdir:DirectoryExists', 'Directory already exists.');
    return [bool(true), str('Directory already exists.'), str('io:mkdir:DirectoryExists')];
  }
  if (fsExists(ctx, p)) return statusResult(nargout, false, `Cannot create folder '${target}': a file with that name exists.`, 'io:mkdir:fileExists', 'mkdir');
  try { ctx.fs.mkdir(p); } catch (e) { return statusResult(nargout, false, `Cannot create folder '${target}': ${e.message}`, 'io:mkdir:failed', 'mkdir'); }
  return [bool(true), str(''), str('')];
}

function rmdirFn(args, nargout, ctx) {
  if (!args.length) throw E('io:rmdir:notEnoughInputs', 'Not enough input arguments.');
  const name = S(args[0], 'Folder name');
  const rec = args[1] !== undefined && S(args[1]).toLowerCase() === 's';
  const p = absPath(ctx, name);
  if (!isDirPath(ctx, p)) return statusResult(nargout, false, `'${name}' is not a folder or does not exist.`, 'io:rmdir:notFound', 'rmdir');
  try { ctx.fs.remove(p, { recursive: rec }); } catch (e) {
    return statusResult(nargout, false, e.code === 'ENOTEMPTY' || /not empty/i.test(e.message) ? `Folder '${name}' is not empty. Use rmdir(name, 's').` : `Cannot remove '${name}': ${e.message}`, 'io:rmdir:failed', 'rmdir');
  }
  return [bool(true), str(''), str('')];
}

function deleteFn(args, nargout, ctx) {
  for (const a of args) {
    if (!isText(a) && !isCell(a)) {
      // delete(h) of graphics / handle objects belongs to other areas
      if (ctx.registry && ctx.registry.builtins && ctx.registry.builtins.__graphics_delete__) return ctx.call('__graphics_delete__', args, nargout);
      throw E('io:delete:badArgument', 'File names must be text. Use delete on handles only where graphics are available.');
    }
    for (const name of strList(a)) {
      const list = /[*?]/.test(name) ? listEntries(ctx, name).filter((e) => !e.isDir) : (isFileP(ctx, name) ? [{ folder: dirName(absPath(ctx, name)), name: baseName(name) }] : []);
      if (!list.length) { ctx.warning('io:delete:FileNotFound', `File '${name}' not found.`); continue; }
      for (const e of list) ctx.fs.remove(normPath(e.folder + '/' + e.name));
    }
  }
  return undefined;
}

function copyTree(ctx, from, to) {
  if (isDirPath(ctx, from)) {
    ctx.fs.mkdir(to);
    for (const e of ctx.fs.list(from)) copyTree(ctx, normPath(from + '/' + e.name), normPath(to + '/' + e.name));
  } else ctx.fs.copy(from, to);
}

function copyOrMove(args, nargout, ctx, move) {
  const fname = move ? 'movefile' : 'copyfile';
  if (args.length < 1) throw E(`io:${fname}:notEnoughInputs`, 'Not enough input arguments.');
  const srcs = strList(args[0]);
  const dest = args[1] !== undefined ? absPath(ctx, S(args[1])) : ctx.fs.cwd();
  const force = args[2] !== undefined && S(args[2]).toLowerCase() === 'f';
  const items = [];
  for (const s of srcs) {
    if (/[*?]/.test(s)) for (const e of listEntries(ctx, s)) items.push(normPath(e.folder + '/' + e.name));
    else if (fsExists(ctx, absPath(ctx, s))) items.push(absPath(ctx, s));
    else return statusResult(nargout, false, `No matching files were found for '${s}'.`, `io:${fname}:noSource`, fname);
  }
  if (!items.length) return statusResult(nargout, false, 'No matching files were found.', `io:${fname}:noSource`, fname);
  const many = items.length > 1;
  try {
    if (many && !isDirPath(ctx, dest)) ctx.fs.mkdir(dest);
    for (const src of items) {
      let target = dest;
      if (isDirPath(ctx, dest) && (many || !isDirPath(ctx, src) || fsExists(ctx, dest))) target = isDirPath(ctx, src) && !many ? dest : normPath(dest + '/' + baseName(src));
      if (src === target) continue;
      if (!force && fsExists(ctx, target) && !isDirPath(ctx, target)) {
        try { ctx.fs.stat(target); } catch { /* ignore */ }
      }
      if (move) {
        if (isDirPath(ctx, src)) { copyTree(ctx, src, target); ctx.fs.remove(src, { recursive: true }); } else ctx.fs.rename(src, target);
      } else copyTree(ctx, src, target);
    }
  } catch (e) { return statusResult(nargout, false, e.message, `io:${fname}:failed`, fname); }
  return [bool(true), str(''), str('')];
}

function fileattrib(args, nargout, ctx) {
  const name = args.length ? S(args[0]) : '.';
  const p = absPath(ctx, name);
  if (!fsExists(ctx, p)) return statusResult(nargout, false, `'${name}' not found.`, 'io:fileattrib:notFound', 'fileattrib');
  const st = ctx.fs.stat(p);
  const s = structScalar({
    Name: str(p), archive: num(NaN), system: num(NaN), hidden: num(NaN), directory: bool(st.isDir),
    UserRead: bool(true), UserWrite: bool(true), UserExecute: bool(st.isDir),
    GroupRead: num(NaN), GroupWrite: num(NaN), GroupExecute: num(NaN), OtherRead: num(NaN), OtherWrite: num(NaN), OtherExecute: num(NaN),
  });
  if (nargout === 0) { ctx.out(`Name: ${p}\ndirectory: ${st.isDir ? 1 : 0}\n`); return undefined; }
  return [bool(true), s, str('')];
}

// ---------------------------------------------------------------- path text

/** [path, name, ext] of a file name (text only, no file-system access). */
export function splitFileParts(f) {
  const s = String(f);
  const k = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'));
  const dirPart = k < 0 ? '' : k === 0 ? s[0] : (/^[A-Za-z]:[\\/]$/.test(s.slice(0, k + 1)) ? s.slice(0, k + 1) : s.slice(0, k));
  const file = s.slice(k + 1);
  const d = file.lastIndexOf('.');
  if (d < 0 || file === '.' || file === '..') return [dirPart, file, ''];
  return [dirPart, file.slice(0, d), file.slice(d)];
}

function fileparts(args) {
  if (!args.length) throw E('io:fileparts:notEnoughInputs', 'Not enough input arguments.');
  const a = args[0];
  if (args[1] !== undefined) {
    const part = S(args[1]).toLowerCase();
    const r = splitFileParts(S(a));
    const k = { path: 0, name: 1, ext: 2 }[part];
    if (k === undefined) throw E('io:fileparts:badPart', "Part must be 'path', 'name' or 'ext'.");
    return isString(a) ? stringArray([1, 1], [r[k]]) : str(r[k]);
  }
  if (isString(a)) {
    const parts = a.data.map((s) => splitFileParts(s ?? ''));
    return [0, 1, 2].map((k) => stringArray(a.dims, parts.map((p) => p[k])));
  }
  const r = splitFileParts(S(a, 'File name'));
  return r.map((x) => (x.length ? str(x) : tensor('char', [1, 0])));
}

function fullfile(args, nargout, ctx) {
  const sep = platformOf(ctx) === 'win' ? '\\' : '/';
  const join = (parts) => {
    const nonEmpty = parts.filter((p) => p.length);
    if (!nonEmpty.length) return '';
    let s = nonEmpty.join(sep);
    // collapse repeated separators (keep a leading UNC double separator)
    const lead = /^[\\/]{2}/.test(s) && sep === '\\' ? sep : '';
    s = lead + s.slice(lead.length).replace(/[\\/]+/g, sep);
    s = s.replace(new RegExp(`\\${sep}\\.\\${sep}`, 'g'), sep);
    return s;
  };
  const multi = args.find((a) => isCell(a) || (isString(a) && a.data.length !== 1));
  if (!multi) {
    const out = join(args.map((a) => S(a)));
    return args.some((a) => isString(a)) ? stringArray([1, 1], [out]) : str(out);
  }
  const n = isCell(multi) ? multi.data.length : multi.data.length;
  const res = [];
  for (let i = 0; i < n; i++) res.push(join(args.map((a) => (isCell(a) || isString(a) && a.data.length !== 1 ? strList(a)[i] : S(a)))));
  if (isString(multi)) return stringArray(multi.dims, res);
  return cell(multi.dims, res.map((s) => str(s)));
}

let tempCounter = 0;
function tempname(args, nargout, ctx) {
  const folder = args.length ? S(args[0]) : ctx.fs.tempDir();
  const id = 'tp' + Date.now().toString(36) + (tempCounter++).toString(36) + Math.random().toString(36).slice(2, 10);
  const f = normPath(folder + '/' + id);
  return platformOf(ctx) === 'win' ? str(f.replace(/\//g, '\\')) : str(f);
}
function tempdir(args, nargout, ctx) {
  const t = ctx.fs.tempDir();
  const sep = platformOf(ctx) === 'win' ? '\\' : '/';
  const s = t.replace(/[\\/]/g, sep);
  return str(s.endsWith(sep) ? s : s + sep);
}

// ---------------------------------------------------------------- dialogs

function filterSpec(v) {
  if (v === undefined) return [{ pattern: '*.*', description: 'All Files (*.*)' }];
  if (isCell(v)) {
    const [m, n] = v.dims;
    const out = [];
    for (let i = 0; i < m; i++) {
      const pattern = S(v.data[i]);
      const description = n > 1 ? S(v.data[i + m]) : pattern;
      out.push({ pattern, description });
    }
    return out;
  }
  const s = S(v);
  return [{ pattern: s, description: s }];
}

function dialog(ctx, msg) {
  let reply = null;
  try { reply = ctx.host && ctx.host.request ? ctx.host.request(msg) : null; } catch { reply = null; }
  return reply;
}

function uigetfile(args, nargout, ctx) {
  const k = args.findIndex((x) => isTextArg(x) && /^multiselect$/i.test(S(x)));
  const pos = k < 0 ? args : args.slice(0, k);
  const o = k < 0 ? {} : nameValues(args, k);
  const filters = filterSpec(pos[0]);
  const title = pos[1] !== undefined ? S(pos[1]) : 'Select File to Open';
  const defName = pos[2] !== undefined ? S(pos[2]) : '';
  const multi = o.multiselect !== undefined && /^on$/i.test(S(o.multiselect));
  const r = dialog(ctx, { type: 'dialog.open', title, filters, defaultPath: defName, multiSelect: multi, cwd: ctx.fs.cwd() });
  const files = r == null ? [] : Array.isArray(r) ? r : Array.isArray(r.paths) ? r.paths : r.path ? [r.path] : typeof r === 'string' ? [r] : [];
  if (!files.length) return [num(0), num(0), num(0)];
  const norm = files.map((f) => String(f).replace(/\\/g, '/'));
  const folder = dirName(norm[0]);
  const sep = platformOf(ctx) === 'win' ? '\\' : '/';
  const pathOut = (folder.endsWith('/') ? folder : folder + '/').replace(/\//g, sep);
  const idx = r && r.filterIndex ? r.filterIndex : 1;
  if (multi && norm.length > 1) return [cellRowOf(norm.map((f) => str(baseName(f)))), str(pathOut), num(idx)];
  return [str(baseName(norm[0])), str(pathOut), num(idx)];
}
function uiputfile(args, nargout, ctx) {
  const filters = filterSpec(args[0]);
  const title = args[1] !== undefined ? S(args[1]) : 'Select File to Write';
  const defName = args[2] !== undefined ? S(args[2]) : '';
  const r = dialog(ctx, { type: 'dialog.save', title, filters, defaultPath: defName, cwd: ctx.fs.cwd() });
  const f = r == null ? null : typeof r === 'string' ? r : r.path || null;
  if (!f) return [num(0), num(0), num(0)];
  const n = String(f).replace(/\\/g, '/');
  const sep = platformOf(ctx) === 'win' ? '\\' : '/';
  const folder = dirName(n);
  return [str(baseName(n)), str((folder.endsWith('/') ? folder : folder + '/').replace(/\//g, sep)), num(r && r.filterIndex ? r.filterIndex : 1)];
}
function uigetdir(args, nargout, ctx) {
  const start = args[0] !== undefined ? S(args[0]) : ctx.fs.cwd();
  const title = args[1] !== undefined ? S(args[1]) : 'Select a Folder';
  const r = dialog(ctx, { type: 'dialog.folder', title, defaultPath: start, cwd: ctx.fs.cwd() });
  const f = r == null ? null : typeof r === 'string' ? r : r.path || null;
  if (!f) return num(0);
  return str(platformOf(ctx) === 'win' ? String(f).replace(/\//g, '\\') : String(f));
}

// ---------------------------------------------------------------- system

function runSystem(args, nargout, ctx, fname) {
  if (!args.length) throw E(`io:${fname}:notEnoughInputs`, 'Not enough input arguments.');
  const cmd = S(args[0], 'Command');
  const echo = args.slice(1).some((a) => isTextArg(a) && S(a) === '-echo');
  let r;
  try { r = ctx.fs.system(cmd); } catch (e) {
    throw E(`io:${fname}:unavailable`, `Cannot run operating system commands here: ${e.message}`);
  }
  const status = r && typeof r.status === 'number' ? r.status : 0;
  const output = r && r.output != null ? String(r.output) : '';
  if (nargout < 2 || echo) { if (output) ctx.out(output.endsWith('\n') ? output : output + '\n'); }
  return [num(status), str(output)];
}

// ---------------------------------------------------------------- environment

function envStore(ctx) {
  if (!ctx.state.env) {
    const base = Object.create(null);
    try { base.HOME = ctx.fs.homeDir(); } catch { /* ignore */ }
    try { base.TMP = base.TEMP = base.TMPDIR = ctx.fs.tempDir(); } catch { /* ignore */ }
    let host = null;
    try { host = ctx.fs.env ? ctx.fs.env() : null; } catch { host = null; }
    ctx.state.env = Object.assign(base, host || {});
  }
  return ctx.state.env;
}
function getenv(args, nargout, ctx) {
  const env = envStore(ctx);
  if (!args.length) {
    const keys = Object.keys(env).sort();
    // dictionary-like: return a struct-free two-column cell of names and values
    return cell([keys.length, 2], [...keys.map((k) => str(k)), ...keys.map((k) => str(env[k]))]);
  }
  const a = args[0];
  const look = (k) => {
    if (k in env) return env[k];
    if (platformOf(ctx) === 'win') { const kk = Object.keys(env).find((x) => x.toLowerCase() === k.toLowerCase()); if (kk) return env[kk]; }
    return '';
  };
  if (isTextArg(a)) { const v = look(S(a)); return isString(a) ? stringArray([1, 1], [v]) : (v.length ? str(v) : tensor('char', [0, 0])); }
  const names = strList(a);
  if (isString(a)) return stringArray(a.dims, names.map(look));
  return cell(a.dims, names.map((k) => str(look(k))));
}
function setenv(args, nargout, ctx) {
  if (!args.length) throw E('io:setenv:notEnoughInputs', 'Not enough input arguments.');
  const env = envStore(ctx);
  const names = strList(args[0]);
  const vals = args[1] !== undefined ? strList(args[1]) : names.map(() => '');
  names.forEach((n, i) => { if (!n || n.includes('=')) throw E('io:setenv:badName', `Invalid environment variable name '${n}'.`); env[n] = vals[i] ?? ''; });
  try { if (ctx.fs.setEnv) for (let i = 0; i < names.length; i++) ctx.fs.setEnv(names[i], vals[i] ?? ''); } catch { /* ignore */ }
  return undefined;
}
function unsetenv(args, nargout, ctx) {
  const env = envStore(ctx);
  for (const n of strList(args[0])) delete env[n];
  return undefined;
}

// ---------------------------------------------------------------- platform / version

function computer(args, nargout, ctx) {
  const p = platformOf(ctx);
  const arch = p === 'win' ? 'PCWIN64' : p === 'mac' ? 'MACA64' : 'GLNXA64';
  if (args.length && S(args[0]).toLowerCase() === 'arch') return str(p === 'win' ? 'win64' : p === 'mac' ? 'maca64' : 'glnxa64');
  return [str(arch), num(2 ** 48 - 1), str('L')];
}
const ispc = (a, n, ctx) => bool(platformOf(ctx) === 'win');
const isunix = (a, n, ctx) => bool(platformOf(ctx) !== 'win');
const ismac = (a, n, ctx) => bool(platformOf(ctx) === 'mac');
const islinux = (a, n, ctx) => bool(platformOf(ctx) === 'linux');

function version(args) {
  const full = `${APP_VERSION} (${APP_RELEASE})`;
  if (!args.length) return [str(full), str(APP_DATE)];
  const opt = S(args[0]).toLowerCase();
  if (opt === '-release') return str(APP_RELEASE);
  if (opt === '-date') return str(APP_DATE);
  if (opt === '-description') return str('');
  if (opt === '-java') return str('Java is not used');
  if (opt === '-blas' || opt === '-lapack') return str('JavaScript linear algebra (built in)');
  throw E('io:version:badOption', `Unknown option '${S(args[0])}'.`);
}
function ver(args, nargout, ctx) {
  const products = [{ Name: APP_NAME, Version: APP_VERSION.split('.').slice(0, 2).join('.'), Release: `(${APP_RELEASE})`, Date: '27-Oct-2026' }];
  if (args.length) {
    const want = S(args[0]).toLowerCase();
    const p = products.filter((x) => x.Name.toLowerCase() === want);
    if (nargout > 0) return structArray(p.map((x) => ({ Name: str(x.Name), Version: str(x.Version), Release: str(x.Release), Date: str(x.Date) })), ['Name', 'Version', 'Release', 'Date'], [1, p.length]);
  }
  if (nargout > 0) return structArray(products.map((x) => ({ Name: str(x.Name), Version: str(x.Version), Release: str(x.Release), Date: str(x.Date) })), ['Name', 'Version', 'Release', 'Date'], [1, products.length]);
  const line = '-'.repeat(88);
  const plat = platformOf(ctx);
  ctx.out(`${line}\n${APP_NAME} Version: ${APP_VERSION} (${APP_RELEASE})\nOperating System: ${plat === 'win' ? 'Microsoft Windows' : plat === 'mac' ? 'macOS' : 'Linux'}\n${line}\n` +
    products.map((x) => `${x.Name.padEnd(48)} Version ${x.Version.padEnd(10)} ${x.Release}`).join('\n') + '\n');
  return undefined;
}
function verLessThan(args) {
  if (args.length < 2) throw E('io:verLessThan:notEnoughInputs', 'Not enough input arguments.');
  const want = S(args[1]).split('.').map((x) => parseInt(x, 10) || 0);
  const have = APP_VERSION.split('.').map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(want.length, have.length); i++) {
    const a = have[i] || 0, b = want[i] || 0;
    if (a !== b) return bool(a < b);
  }
  return bool(false);
}

export const builtins = {
  dir, ls,
  isfile: (args, n, ctx) => mapText(args[0], (s) => isFileP(ctx, s)),
  isfolder: (args, n, ctx) => mapText(args[0], (s) => isDirP(ctx, s)),
  isdir: (args, n, ctx) => bool(isTextArg(args[0]) && isDirP(ctx, S(args[0]))),
  mkdir: mkdirFn, rmdir: rmdirFn, delete: deleteFn, __delete_files__: deleteFn,
  copyfile: (a, n, c) => copyOrMove(a, n, c, false),
  movefile: (a, n, c) => copyOrMove(a, n, c, true),
  fileattrib, fileparts, fullfile,
  filesep: (a, n, ctx) => str(platformOf(ctx) === 'win' ? '\\' : '/'),
  pathsep: (a, n, ctx) => str(platformOf(ctx) === 'win' ? ';' : ':'),
  tempdir, tempname,
  uigetfile, uiputfile, uigetdir,
  system: (a, n, c) => runSystem(a, n, c, 'system'),
  dos: (a, n, c) => runSystem(a, n, c, 'dos'),
  unix: (a, n, c) => runSystem(a, n, c, 'unix'),
  getenv, setenv, unsetenv,
  computer, ispc, isunix, ismac, islinux, version, ver, verLessThan,
};

const H = (en, ko, syntax) => ({ en, ko, syntax });
export const help = {
  dir: H('List folder contents.', '폴더 내용을 나열합니다.', ['dir', 'dir name', 'listing = dir(name)']),
  ls: H('List folder contents.', '폴더 내용을 나열합니다.', ['ls', 'ls name', 'list = ls(name)']),
  isfile: H('True for files.', '파일이면 참.', ['tf = isfile(filename)']),
  isfolder: H('True for folders.', '폴더이면 참.', ['tf = isfolder(folderName)']),
  isdir: H('True for a folder (prefer isfolder).', '폴더이면 참 (isfolder 권장).', ['tf = isdir(folderName)']),
  mkdir: H('Make a new folder.', '새 폴더를 만듭니다.', ['mkdir folderName', 'mkdir(parentFolder, folderName)', '[status, msg, msgID] = mkdir(___)']),
  rmdir: H('Remove a folder.', '폴더를 삭제합니다.', ['rmdir folderName', "rmdir(folderName, 's')", '[status, msg, msgID] = rmdir(___)']),
  delete: H('Delete files.', '파일을 삭제합니다.', ['delete filename', 'delete(filename1, ..., filenameN)']),
  __delete_files__: H('Internal: delete files (for areas that override delete).', '내부용: 파일 삭제 (delete를 재정의하는 영역용).', ['__delete_files__(filename1, ..., filenameN)']),
  copyfile: H('Copy files or folders.', '파일이나 폴더를 복사합니다.', ['copyfile source', 'copyfile(source, destination)', "copyfile(source, destination, 'f')", '[status, msg, msgID] = copyfile(___)']),
  movefile: H('Move or rename files or folders.', '파일이나 폴더를 옮기거나 이름을 바꿉니다.', ['movefile source', 'movefile(source, destination)', '[status, msg, msgID] = movefile(___)']),
  fileattrib: H('File or folder attributes.', '파일 또는 폴더의 속성.', ['fileattrib(name)', '[status, values] = fileattrib(name)']),
  fileparts: H('Parts of a file name.', '파일 이름의 구성 요소.', ['[filepath, name, ext] = fileparts(filename)', 'part = fileparts(filename, partType)']),
  fullfile: H('Build a full file name from parts.', '구성 요소로 전체 파일 이름을 만듭니다.', ['f = fullfile(filepart1, ..., filepartN)']),
  filesep: H('File separator of this platform.', '이 플랫폼의 파일 구분 문자.', ['c = filesep']),
  pathsep: H('Search path separator of this platform.', '이 플랫폼의 검색 경로 구분 문자.', ['c = pathsep']),
  tempdir: H('Folder for temporary files.', '임시 파일 폴더.', ['d = tempdir']),
  tempname: H('Unique name for a temporary file.', '임시 파일용 고유 이름.', ['f = tempname', 'f = tempname(folder)']),
  uigetfile: H('Open-file dialog.', '파일 열기 대화상자.', ['file = uigetfile', '[file, path] = uigetfile(filter, title, defname)', "[file, path, indx] = uigetfile(___, 'MultiSelect', 'on')"]),
  uiputfile: H('Save-file dialog.', '파일 저장 대화상자.', ['file = uiputfile', '[file, path, indx] = uiputfile(filter, title, defname)']),
  uigetdir: H('Folder selection dialog.', '폴더 선택 대화상자.', ['selpath = uigetdir', 'selpath = uigetdir(path, title)']),
  system: H('Run an operating system command.', '운영 체제 명령을 실행합니다.', ['status = system(command)', '[status, cmdout] = system(command)', "[status, cmdout] = system(command, '-echo')"]),
  dos: H('Run a command (Windows command shell).', '명령을 실행합니다 (Windows 명령 셸).', ['[status, cmdout] = dos(command)']),
  unix: H('Run a command (Unix shell).', '명령을 실행합니다 (Unix 셸).', ['[status, cmdout] = unix(command)']),
  getenv: H('Value of an environment variable.', '환경 변수의 값.', ['value = getenv(varname)', 'C = getenv']),
  setenv: H('Set an environment variable.', '환경 변수를 설정합니다.', ['setenv(varname, value)', 'setenv(varname)']),
  unsetenv: H('Remove an environment variable.', '환경 변수를 제거합니다.', ['unsetenv(varname)']),
  computer: H('Computer type the program runs on.', '프로그램이 실행 중인 컴퓨터 종류.', ['c = computer', '[c, maxsize, endian] = computer', "arch = computer('arch')"]),
  ispc: H('True on Windows.', 'Windows이면 참.', ['tf = ispc']),
  isunix: H('True on Linux and macOS.', 'Linux와 macOS에서 참.', ['tf = isunix']),
  ismac: H('True on macOS.', 'macOS이면 참.', ['tf = ismac']),
  islinux: H('True on Linux.', 'Linux이면 참.', ['tf = islinux']),
  version: H('Version of this program.', '이 프로그램의 버전.', ['v = version', "v = version('-release')", '[v, d] = version']),
  ver: H('Version information of the program and its toolboxes.', '프로그램과 툴박스의 버전 정보.', ['ver', 'v = ver', 'v = ver(product)']),
  verLessThan: H('True when the program version is older than the given one.', '프로그램 버전이 주어진 버전보다 낮으면 참.', ['tf = verLessThan(toolbox, version)']),
};
