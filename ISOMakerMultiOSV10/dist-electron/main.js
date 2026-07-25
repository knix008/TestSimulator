var Yt = Object.defineProperty;
var Jt = (e, t, n) => t in e ? Yt(e, t, { enumerable: !0, configurable: !0, writable: !0, value: n }) : e[t] = n;
var W = (e, t, n) => Jt(e, typeof t != "symbol" ? t + "" : t, n);
import { app as L, Menu as Vt, BrowserWindow as at, ipcMain as y, dialog as T, shell as Ht, nativeImage as $e } from "electron";
import l, { openAsBlob as ct } from "node:fs";
import u from "node:path";
import { fileURLToPath as Fe } from "node:url";
import X from "node:os";
import { Readable as Ue } from "node:stream";
import { pipeline as lt } from "node:stream/promises";
import { spawn as ut, execFileSync as Xe, execFile as Xt } from "node:child_process";
import { promisify as Zt } from "node:util";
const w = 2048;
async function J(e, t, n) {
  if (n <= 0) return new Uint8Array(0);
  const r = Math.min(e.size, t + n);
  if (t >= e.size)
    throw new Error(
      `ISO 읽기 범위 초과 (요청 offset ${t}, ISO 크기 ${e.size}). 파일이 잘렸거나 손상되었을 수 있습니다.`
    );
  const o = await e.slice(t, r).arrayBuffer();
  return new Uint8Array(o);
}
async function Qt(e, t) {
  return J(e, t * w, w);
}
function Me(e, t) {
  return e.getUint8(t);
}
function te(e, t, n) {
  const r = e.getUint32(t, !0), o = e.getUint32(t + 4, !1);
  if (r === o) return r;
  const i = n(r), s = n(o);
  return i && !s ? r : s && !i ? o : r;
}
function oe(e) {
  let t = "";
  for (let n = 0; n < e.length; n++) {
    const r = e[n];
    if (r === 0) break;
    t += String.fromCharCode(r);
  }
  return t.trimEnd();
}
function ft(e) {
  const t = e.length - e.length % 2, n = [];
  for (let r = 0; r < t; r += 2) {
    const o = e[r] << 8 | e[r + 1];
    if (o === 0) break;
    n.push(o);
  }
  return String.fromCharCode(...n).replace(/\0+$/g, "");
}
function Pt(e) {
  const t = e.indexOf(";");
  return t >= 0 ? e.slice(0, t) : e;
}
function fe(e, t, n) {
  e[t] = n & 255;
}
function dt(e, t, n) {
  e[t] = n & 255, e[t + 1] = n >>> 8 & 255;
}
function en(e, t, n) {
  e[t] = n >>> 8 & 255, e[t + 1] = n & 255;
}
function q(e, t, n) {
  dt(e, t, n), en(e, t + 2, n);
}
function tn(e, t, n) {
  e[t] = n & 255, e[t + 1] = n >>> 8 & 255, e[t + 2] = n >>> 16 & 255, e[t + 3] = n >>> 24 & 255;
}
function nn(e, t, n) {
  e[t] = n >>> 24 & 255, e[t + 1] = n >>> 16 & 255, e[t + 2] = n >>> 8 & 255, e[t + 3] = n & 255;
}
function V(e, t, n) {
  tn(e, t, n), nn(e, t + 4, n);
}
function mt(e, t, n = 32) {
  const r = new Uint8Array(t);
  r.fill(n);
  const o = e.toUpperCase();
  for (let i = 0; i < Math.min(o.length, t); i++)
    r[i] = o.charCodeAt(i) & 127;
  return r;
}
function ve(e) {
  const t = new Uint8Array(e.length * 2);
  for (let n = 0; n < e.length; n++) {
    const r = e.charCodeAt(n);
    t[n * 2] = r >>> 8 & 255, t[n * 2 + 1] = r & 255;
  }
  return t;
}
function Oe(e, t) {
  if (t) {
    const a = e.toUpperCase().replace(/[^A-Z0-9_]/g, "_").slice(0, 31);
    return mt(a, a.length, 0);
  }
  const n = e.toUpperCase().replace(/[^A-Z0-9_.]/g, "_"), r = n.lastIndexOf(".");
  let o = n, i = "";
  r > 0 && (o = n.slice(0, r), i = n.slice(r + 1)), o = o.slice(0, 8), i = i.slice(0, 3);
  const s = i ? `${o}.${i};1` : `${o}.;1`, c = new Uint8Array(s.length);
  for (let a = 0; a < s.length; a++) c[a] = s.charCodeAt(a);
  return c;
}
const rn = 4, on = 2, sn = 128;
async function pt(e) {
  if (e.size < w * 17)
    throw new Error("파일이 디스크 이미지로 보기에는 너무 작습니다.");
  const t = await an(e), n = t > 0 ? e.slice(t) : e, r = await ln(n), o = { kind: "dir", name: "", children: /* @__PURE__ */ new Map() }, i = [];
  let s = 0;
  return await ht(n, r, o, "", r.rootLba, r.rootSize, i, (c) => {
    s += c;
  }), i.sort((c, a) => c.path.localeCompare(a.path)), {
    volumeLabel: r.label || "ISO",
    root: o,
    entries: i,
    totalBytes: s
  };
}
async function an(e) {
  const t = 16 * w;
  if (e.size >= t + w) {
    const o = await J(e, t, w);
    if (o[0] === 1 && oe(o.subarray(1, 6)) === "CD001")
      return 0;
  }
  const n = Math.min(e.size, 64 * 1024 * 1024), r = 1024 * 1024;
  for (let o = 0; o < n; o += r) {
    const i = Math.min(r + w, n - o);
    if (i < w) break;
    const s = await J(e, o, i), c = s.length - w;
    for (let a = 0; a <= c; a += w) {
      if (s[a] !== 1 || oe(s.subarray(a + 1, a + 6)) !== "CD001") continue;
      const p = o + a - 16 * w;
      if (p >= 0) return p;
    }
  }
  return 0;
}
async function cn(e, t, n = w) {
  if (!t.length) return new Blob([]);
  if (t.length === 1) {
    const o = t[0], i = await J(e, o.lba * n, o.size), s = new Uint8Array(i.byteLength);
    return s.set(i), new Blob([s.buffer]);
  }
  const r = [];
  for (const o of t) {
    const i = await J(e, o.lba * n, o.size), s = new Uint8Array(i.byteLength);
    s.set(i), r.push(s.buffer.slice(s.byteOffset, s.byteOffset + s.byteLength));
  }
  return new Blob(r);
}
async function ln(e) {
  let t = null, n = null;
  for (let o = 16; o < 32; o++) {
    const i = await Qt(e, o), s = i[0];
    if (oe(i.subarray(1, 6)) !== "CD001") continue;
    if (s === 255) break;
    const a = new DataView(i.buffer, i.byteOffset, i.byteLength), f = Math.max(1, Math.floor(e.size / w)), p = te(a, 80, (k) => k > 16 && k <= f * 4), v = un(a, 128, (k) => k === 512 || k === 1024 || k === 2048) || w, d = oe(i.subarray(40, 72)), h = 156, m = Math.max(1, Math.floor(e.size / v)), g = te(
      a,
      h + 2,
      (k) => k > 0 && k < Math.max(p, m)
    ), A = Math.max(v, e.size - g * v), b = te(
      a,
      h + 10,
      (k) => k > 0 && k <= A
    ), $ = {
      label: d,
      rootLba: g,
      rootSize: b,
      joliet: !1,
      blockSize: v,
      volumeBlocks: Math.max(p, m)
    };
    if (s === 1)
      t = $;
    else if (s === 2) {
      const k = i.subarray(88, 91);
      k[0] === 37 && k[1] === 47 && (k[2] === 64 || k[2] === 67 || k[2] === 69) && (n = {
        ...$,
        label: fn(i.subarray(40, 72)) || d,
        joliet: !0
      });
    }
  }
  const r = n ?? t;
  if (!r)
    throw new Error("ISO9660 볼륨 디스크립터를 찾지 못했습니다. (ISO/IMG 형식이 아니거나 손상되었을 수 있습니다.)");
  return r;
}
function un(e, t, n) {
  const r = e.getUint16(t, !0), o = e.getUint16(t + 2, !1);
  if (r === o) return r;
  const i = n(r), s = n(o);
  return i && !s ? r : s && !i ? o : r;
}
function fn(e) {
  return ft(e).trim();
}
function Le(e, t, n, r, o) {
  if (t < 0) return !1;
  if (t === 0) return e >= 0;
  if (e <= 0 || e >= o) return !1;
  const i = e * r;
  return i >= n ? !1 : i + t <= n;
}
async function ht(e, t, n, r, o, i, s, c) {
  const { blockSize: a, volumeBlocks: f } = t;
  if (!Le(o, Math.min(i, a), e.size, a, f) && i > 0)
    return;
  const p = Math.max(0, e.size - o * a), v = Math.min(i, p);
  if (v <= 0) return;
  const d = await J(e, o * a, v);
  let h = 0, m = null;
  const g = () => {
    m && (Ze(n, r, m.name, m.extents, e, t, s, c), m = null);
  };
  for (; h < d.length; ) {
    const A = d[h] ?? 0;
    if (A === 0) {
      const $ = Math.ceil((h + 1) / a) * a;
      if ($ <= h || $ >= d.length) break;
      h = $;
      continue;
    }
    if (h + A > d.length) break;
    const b = dn(
      d.subarray(h, h + A),
      t.joliet,
      e.size,
      a,
      f
    );
    if (h += A, !(!b || b.name === "." || b.name === "..") && !b.associated) {
      if (b.isDir) {
        if (g(), !Le(b.lba, Math.min(b.size, a), e.size, a, f))
          continue;
        const $ = r ? `${r}/${b.name}` : b.name, k = { kind: "dir", name: b.name, children: /* @__PURE__ */ new Map() };
        n.children.set(I(b.name), k), s.push({ path: $, name: b.name, isDir: !0, size: 0 }), await ht(e, t, k, $, b.lba, b.size, s, c);
        continue;
      }
      if (m && m.name === b.name) {
        m.extents.push({ lba: b.lba, size: b.size }), b.multiExtent || g();
        continue;
      }
      g(), b.multiExtent ? m = { name: b.name, extents: [{ lba: b.lba, size: b.size }] } : Ze(
        n,
        r,
        b.name,
        [{ lba: b.lba, size: b.size }],
        e,
        t,
        s,
        c
      );
    }
  }
  g();
}
function Ze(e, t, n, r, o, i, s, c) {
  const a = t ? `${t}/${n}` : n, f = r.reduce((d, h) => d + h.size, 0), p = r.every(
    (d) => Le(d.lba, d.size, o.size, i.blockSize, i.volumeBlocks)
  ), v = p ? {
    kind: "file",
    name: n,
    size: f,
    source: {
      type: "iso",
      iso: o,
      extents: r,
      blockSize: i.blockSize
    }
  } : {
    kind: "file",
    name: n,
    size: f,
    source: {
      type: "unavailable",
      reason: `ISO 데이터가 잘렸거나 손상되어 읽을 수 없습니다: ${a}`
    }
  };
  e.children.set(I(n), v), s.push({ path: a, name: n, isDir: !1, size: f }), p && c(f);
}
function dn(e, t, n, r, o) {
  if (e.length < 34) return null;
  const i = new DataView(e.buffer, e.byteOffset, e.byteLength), s = Me(i, 0);
  if (s < 34) return null;
  const c = Math.max(1, Math.min(o, Math.floor(n / r) + 1)), a = te(i, 2, (g) => g < c), f = Math.max(0, n), p = te(i, 10, (g) => g <= f), v = Me(i, 25), d = Me(i, 32);
  if (33 + d > e.length) return null;
  const h = e.subarray(33, 33 + d);
  let m;
  return d === 1 && h[0] === 0 ? m = "." : d === 1 && h[0] === 1 ? m = ".." : m = Pt(t ? ft(h) : oe(h)), m ? {
    length: s,
    lba: a,
    size: p,
    flags: v,
    name: m,
    isDir: (v & on) !== 0,
    multiExtent: (v & sn) !== 0,
    associated: (v & rn) !== 0
  } : null;
}
function I(e) {
  return e.toLowerCase();
}
function z(e, t) {
  if (!t || t === "/") return e;
  const n = t.split("/").filter(Boolean);
  let r = e;
  for (const o of n) {
    if (r.kind !== "dir") return null;
    const i = r.children.get(I(o));
    if (!i) return null;
    r = i;
  }
  return r;
}
function mn(e, t) {
  const n = z(e, t);
  return !n || n.kind !== "dir" ? [] : [...n.children.values()].map((r) => ({
    path: t ? `${t}/${r.name}` : r.name,
    name: r.name,
    isDir: r.kind === "dir",
    size: r.kind === "file" ? r.size : 0
  })).sort((r, o) => Number(o.isDir) - Number(r.isDir) || r.name.localeCompare(o.name));
}
const Qe = Buffer.from("hsqs", "ascii"), pn = Buffer.from([127, 69, 76, 70]);
async function hn(e, t) {
  return t === "iso" || t === "img" || t === "appimage" || t === "docker" ? t : await wt(e) ? "appimage" : await yt(e) ? "docker" : "unknown";
}
async function wt(e) {
  try {
    const t = await l.promises.open(e, "r");
    try {
      const r = Buffer.alloc(4), { bytesRead: o } = await t.read(r, 0, 4, 0);
      if (o < 4 || !r.equals(pn)) return !1;
    } finally {
      await t.close();
    }
    return await Re(e) >= 0;
  } catch {
    return !1;
  }
}
async function yt(e) {
  try {
    const t = await l.promises.open(e, "r");
    try {
      const n = Buffer.alloc(512), { bytesRead: r } = await t.read(n, 0, 512, 0);
      return r < 265 ? !1 : n[0] === 31 && n[1] === 139 ? !0 : n.subarray(257, 262).toString("ascii") === "ustar";
    } finally {
      await t.close();
    }
  } catch {
    return !1;
  }
}
async function wn(e, t) {
  const n = await l.promises.mkdtemp(u.join(X.tmpdir(), "isomaker-extract-"));
  try {
    if (t === "appimage") {
      const { treeRoot: r, squashfsOffset: o } = await Sn(e, n);
      return { extractRoot: n, treeRoot: r, squashfsOffset: o };
    }
    return await kn(e, n), { extractRoot: n, treeRoot: n, squashfsOffset: null };
  } catch (r) {
    try {
      l.rmSync(n, { recursive: !0, force: !0 });
    } catch {
    }
    throw r;
  }
}
async function yn(e) {
  const t = { kind: "dir", name: "", children: /* @__PURE__ */ new Map() };
  return await bt(e, t), t;
}
function bn(e) {
  return (u.basename(e).replace(/\.tar\.gz$/i, "").replace(/\.(appimage|tar|tgz|docker|iso|img)$/i, "").replace(/[^A-Za-z0-9_.-]+/g, "_").replace(/^_+|_+$/g, "") || "IMAGE").slice(0, 32).toUpperCase();
}
async function bt(e, t) {
  let n;
  try {
    n = await l.promises.readdir(e);
  } catch {
    return;
  }
  n.sort((r, o) => r.localeCompare(o));
  for (const r of n) {
    if (r === "." || r === "..") continue;
    const o = u.join(e, r);
    let i;
    try {
      i = await l.promises.lstat(o);
    } catch {
      continue;
    }
    if (i.isSymbolicLink()) continue;
    if (i.isDirectory()) {
      const c = { kind: "dir", name: r, children: /* @__PURE__ */ new Map() };
      t.children.set(I(r), c), await bt(o, c);
      continue;
    }
    if (!i.isFile()) continue;
    const s = {
      kind: "file",
      name: r,
      size: i.size,
      source: { type: "path", absolutePath: o }
    };
    t.children.set(I(r), s);
  }
}
async function Sn(e, t) {
  const n = await Re(e);
  if (n < 0)
    throw new Error("AppImage에서 squashfs(hsqs) 시그니처를 찾지 못했습니다.");
  const r = kt("unsquashfs");
  if (r) {
    const o = u.join(t, "root");
    return await l.promises.mkdir(o, { recursive: !0 }), await ie(
      r,
      ["-f", "-o", String(n), "-d", o, e],
      u.dirname(r)
    ), { treeRoot: o, squashfsOffset: n };
  }
  if (process.platform === "linux") {
    try {
      await l.promises.chmod(e, 493);
    } catch {
    }
    await ie(e, ["--appimage-extract"], t);
    const o = u.join(t, "squashfs-root");
    if (l.existsSync(o))
      return { treeRoot: o, squashfsOffset: n };
  }
  throw new Error(
    "AppImage를 풀 수 없습니다. squashfs-tools(unsquashfs)를 설치한 뒤 다시 시도하세요.\nWindows: MSYS2에서 `pacman -S squashfs-tools`\nmacOS: `brew install squashfs`\nLinux: `sudo apt install squashfs-tools` (또는 AppImage 실행 권한)"
  );
}
async function kn(e, t) {
  const n = St();
  if (!n)
    throw new Error("tar 명령을 찾을 수 없습니다. Docker 저장본(.tar)을 열려면 OS tar가 필요합니다.");
  const o = vn(e) || /\.(tgz|tar\.gz)$/i.test(e) ? ["-xzf", e, "-C", t] : ["-xf", e, "-C", t];
  await ie(n, o, t);
}
function vn(e) {
  const t = l.openSync(e, "r");
  try {
    const n = Buffer.alloc(2);
    return l.readSync(t, n, 0, 2, 0) === 2 && n[0] === 31 && n[1] === 139;
  } finally {
    l.closeSync(t);
  }
}
async function Re(e) {
  const t = (await l.promises.stat(e)).size, n = 1024 * 1024, r = Qe.length - 1, o = Buffer.alloc(n), i = await l.promises.open(e, "r");
  try {
    let s = 0;
    for (; s < t; ) {
      const { bytesRead: c } = await i.read(o, 0, n, s);
      if (c <= 0) break;
      const a = o.subarray(0, c).indexOf(Qe);
      if (a >= 0) return s + a;
      if (c <= r) break;
      s += c - r;
    }
  } finally {
    await i.close();
  }
  return -1;
}
function gn() {
  return kt("mksquashfs");
}
function St() {
  if (process.platform === "win32") {
    const e = u.join(
      process.env.SystemRoot || "C:\\Windows",
      "System32",
      "tar.exe"
    );
    return l.existsSync(e) ? e : he("tar.exe") ?? he("tar");
  }
  return he("tar");
}
function ie(e, t, n) {
  return new Promise((r, o) => {
    var c;
    const i = ut(e, t, {
      cwd: n,
      windowsHide: !0,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let s = "";
    (c = i.stderr) == null || c.on("data", (a) => {
      s += a.toString("utf8");
    }), i.on("error", (a) => o(a)), i.on("close", (a) => {
      if (a === 0) {
        r();
        return;
      }
      const f = s.trim() || `exit ${a}`;
      o(new Error(`${u.basename(e)} 실패: ${f}`));
    });
  });
}
function kt(e) {
  const t = process.platform === "win32" ? [`${e}.exe`, e] : [e], n = [];
  if (process.platform === "win32")
    for (const r of [
      process.env.MSYS2_ROOT,
      "C:\\msys64",
      "C:\\msys32",
      process.env.CYGWIN_ROOT,
      "C:\\cygwin64"
    ].filter((o) => !!o))
      n.push(u.join(r, "usr", "bin", `${e}.exe`)), n.push(u.join(r, "bin", `${e}.exe`));
  for (const r of n)
    if (l.existsSync(r)) return r;
  for (const r of t) {
    const o = he(r);
    if (o) return o;
  }
  return null;
}
function he(e) {
  try {
    const t = process.platform === "win32" ? Xe("where", [e], { encoding: "utf8", windowsHide: !0 }) : Xe("which", [e], { encoding: "utf8" }), n = String(t).split(/\r?\n/).map((r) => r.trim()).find(Boolean);
    return n && l.existsSync(n) ? n : null;
  } catch {
    return null;
  }
}
async function vt(e, t, n, r) {
  M(r), await l.promises.mkdir(t, { recursive: !0 });
  const o = [];
  gt(e, "", o);
  let i = 0;
  await xt(e, "", t, async (s, c) => {
    M(r);
    const a = z(e, s);
    if (!a || a.kind !== "file") return;
    if (a.source.type === "path")
      await l.promises.copyFile(a.source.absolutePath, c);
    else if (a.source.type === "blob")
      await et(a.source.blob, c, r);
    else if (a.source.type === "iso") {
      const p = await zn(a.source);
      await et(p, c, r);
    } else
      throw new Error(a.source.reason);
    i += 1;
    const f = o.length ? Math.min(90, Math.round(i / o.length * 90)) : 90;
    n == null || n({
      phase: "save",
      percent: f,
      message: `파일 준비 중… (${i}/${o.length})`
    });
  });
}
async function xn(e, t, n, r, o) {
  M(o);
  const i = St();
  if (!i)
    throw new Error("tar 명령을 찾을 수 없습니다. Docker/tar로 저장하려면 OS tar가 필요합니다.");
  r == null || r({ phase: "save", percent: 92, message: n ? "tar.gz 작성 중…" : "tar 작성 중…" }), await ie(i, n ? ["-czf", t, "-C", e, "."] : ["-cf", t, "-C", e, "."], u.dirname(t)), M(o);
}
async function An(e, t, n, r, o) {
  if (M(o), !l.existsSync(n.runtimePath))
    throw new Error(
      `AppImage 런타임을 찾을 수 없습니다: ${n.runtimePath}
AppImage로 저장하려면 원본 AppImage를 연 뒤 저장하세요.`
    );
  let i = n.squashfsOffset;
  if (i <= 0 && (i = await Re(n.runtimePath)), i <= 0)
    throw new Error("AppImage 런타임(squashfs 오프셋)을 확인할 수 없습니다.");
  const s = gn();
  if (!s)
    throw new Error(
      "AppImage로 저장하려면 squashfs-tools(mksquashfs)가 필요합니다.\nWindows: MSYS2 `pacman -S squashfs-tools`\nmacOS: `brew install squashfs`\nLinux: `sudo apt install squashfs-tools`"
    );
  const c = await l.promises.mkdtemp(u.join(X.tmpdir(), "isomaker-appimage-")), a = u.join(c, "payload.squashfs");
  try {
    if (r == null || r({ phase: "save", percent: 92, message: "squashfs 작성 중…" }), await ie(
      s,
      [e, a, "-comp", "gzip", "-noappend", "-all-root"],
      c
    ), M(o), r == null || r({ phase: "save", percent: 96, message: "AppImage 결합 중…" }), await In(n.runtimePath, i, a, t, o), process.platform !== "win32")
      try {
        await l.promises.chmod(t, 493);
      } catch {
      }
  } finally {
    try {
      l.rmSync(c, { recursive: !0, force: !0 });
    } catch {
    }
  }
}
async function In(e, t, n, r, o) {
  M(o);
  const i = await l.promises.open(r, "w");
  try {
    const s = await l.promises.open(e, "r");
    try {
      await Pe(s, i, 0, t, o);
    } finally {
      await s.close();
    }
    const c = await l.promises.open(n, "r");
    try {
      const a = (await c.stat()).size;
      await Pe(c, i, 0, a, o);
    } finally {
      await c.close();
    }
  } finally {
    await i.close();
  }
}
async function Pe(e, t, n, r, o) {
  const s = Buffer.allocUnsafe(Math.min(8388608, Math.max(r, 1)));
  let c = n, a = r;
  for (; a > 0; ) {
    M(o);
    const f = Math.min(s.length, a), { bytesRead: p } = await e.read(s, 0, f, c);
    if (p <= 0) break;
    await t.write(s, 0, p), c += p, a -= p;
  }
}
function gt(e, t, n) {
  for (const r of e.children.values()) {
    const o = t ? `${t}/${r.name}` : r.name;
    r.kind === "dir" ? gt(r, o, n) : n.push(o);
  }
}
async function xt(e, t, n, r) {
  for (const o of e.children.values()) {
    const i = t ? `${t}/${o.name}` : o.name, s = u.join(n, o.name);
    o.kind === "dir" ? (await l.promises.mkdir(s, { recursive: !0 }), await xt(o, i, s, r)) : await r(i, s);
  }
}
async function zn(e) {
  const t = e.blockSize || 2048;
  if (e.extents.length === 1) {
    const r = e.extents[0];
    return e.iso.slice(r.lba * t, r.lba * t + r.size);
  }
  const n = [];
  for (const r of e.extents)
    n.push(e.iso.slice(r.lba * t, r.lba * t + r.size));
  return new Blob(n);
}
async function et(e, t, n) {
  if (M(n), e.size < 8 * 1024 * 1024) {
    const o = Buffer.from(await e.arrayBuffer());
    M(n), await l.promises.writeFile(t, o, { signal: n });
    return;
  }
  const r = e.stream();
  await lt(Ue.fromWeb(r), l.createWriteStream(t), { signal: n });
}
function M(e) {
  if (e != null && e.aborted) throw new Error("JOB_CANCELED");
}
async function En(e, t, n, r, o) {
  var Ve;
  K(r);
  const i = Bn(t), s = [], c = [];
  At(e, "", s, c), K(r);
  let a = 19;
  for (const x of s)
    x.lba = a, x.size = tt(x, !1), a += de(x.size);
  const f = 10, p = a;
  a += 1;
  const v = a;
  a += 1;
  const d = s.map((x) => ({
    path: x.path,
    node: x.node,
    lba: 0,
    size: tt(x, !0)
  }));
  for (const x of d)
    x.lba = a, a += de(x.size);
  const h = a;
  a += 1;
  const m = a;
  a += 1;
  for (const x of c)
    x.lba = a, a += de(Math.max(x.size, 1));
  const g = a, A = [];
  n == null || n({ phase: "write", percent: 5, message: "볼륨 헤더 작성…" }), K(r), A.push(U(new Uint8Array(16 * w)));
  const b = Ce();
  Mn(b, i, s[0], p, v, f, g), A.push(U(b));
  const $ = Ce();
  Cn($, i, d[0], h, m, f, g), A.push(U($));
  const k = Ce();
  k[0] = 255, R(k, 1, "CD001"), k[6] = 1, A.push(U(k));
  const O = 19, Wt = (((Ve = c[0]) == null ? void 0 : Ve.lba) ?? g) - O, F = new Uint8Array(Wt * w);
  me(F, p - O, s[0].lba, !1), me(F, v - O, s[0].lba, !0), me(F, h - O, d[0].lba, !1), me(F, m - O, d[0].lba, !0), nt(F, O, s, c, !1), nt(F, O, d, c, !0), A.push(U(F)), n == null || n({ phase: "write", percent: 20, message: "파일 데이터 연결…" }), K(r);
  const Kt = Math.max(c.length, 1);
  for (let x = 0; x < c.length; x++) {
    K(r);
    const ee = c[x];
    n == null || n({
      phase: "write",
      percent: 20 + Math.round(x / Kt * 75),
      message: `파일 포함: ${ee.path}`
    }), A.push(await $n(ee, o)), K(r);
    const He = de(Math.max(ee.size, 1)) * w - Math.max(ee.size, 1);
    ee.size === 0 ? A.push(U(new Uint8Array(w))) : He > 0 && A.push(U(new Uint8Array(He)));
  }
  return n == null || n({ phase: "write", percent: 100, message: "ISO 작성 완료" }), new Blob(A, { type: "application/x-iso9660-image" });
}
function K(e) {
  if (e != null && e.aborted) throw new Error("JOB_CANCELED");
}
async function $n(e, t) {
  if (e.size === 0) return new Blob([]);
  const n = e.node.source;
  if (n.type === "blob")
    return n.blob.slice(0, e.size);
  if (n.type === "unavailable")
    throw new Error(n.reason);
  if (n.type === "path") {
    if (!t)
      throw new Error(`경로 소스는 데스크톱에서만 저장할 수 있습니다: ${n.absolutePath}`);
    return (await t(n.absolutePath)).slice(0, e.size);
  }
  if (n.extents.length === 1) {
    const i = n.extents[0], s = n.blockSize || w;
    return n.iso.slice(i.lba * s, i.lba * s + i.size);
  }
  const r = [], o = n.blockSize || w;
  for (const i of n.extents)
    r.push(n.iso.slice(i.lba * o, i.lba * o + i.size));
  return new Blob(r);
}
function U(e) {
  const t = new Uint8Array(e.byteLength);
  return t.set(e), new Blob([t.buffer]);
}
function At(e, t, n, r) {
  n.push({ path: t, node: e, lba: 0, size: 0 });
  for (const o of je(e)) {
    const i = t ? `${t}/${o.name}` : o.name;
    o.kind === "dir" ? At(o, i, n, r) : r.push({ path: i, node: o, lba: 0, size: o.size });
  }
}
function je(e) {
  return [...e.children.values()].sort((t, n) => t.name.localeCompare(n.name));
}
function tt(e, t) {
  let n = 68;
  for (const r of je(e.node)) {
    let i = 33 + (t ? ve(r.name) : Oe(r.name, r.kind === "dir")).length;
    i % 2 === 1 && (i += 1), n += i;
  }
  return Math.max(w, Math.ceil(n / w) * w);
}
function de(e) {
  return Math.max(1, Math.ceil(e / w));
}
function Mn(e, t, n, r, o, i, s) {
  e[0] = 1, R(e, 1, "CD001"), e[6] = 1, R(e, 8, "ISOMAKER"), R(e, 40, t.padEnd(32).slice(0, 32)), V(e, 80, s), q(e, 120, 1), q(e, 124, 1), q(e, 128, w), V(e, 132, i), se(e, 140, r), se(e, 148, o), Te(e, 156, n.lba, n.size, 2, new Uint8Array([0])), R(e, 881, "ISOMAKER");
}
function Cn(e, t, n, r, o, i, s) {
  e[0] = 2, R(e, 1, "CD001"), e[6] = 1, R(e, 8, "ISOMAKER");
  const c = ve(t.slice(0, 16));
  e.set(c.subarray(0, Math.min(32, c.length)), 40), V(e, 80, s), e[88] = 37, e[89] = 47, e[90] = 64, q(e, 120, 1), q(e, 124, 1), q(e, 128, w), V(e, 132, i), se(e, 140, r), se(e, 148, o), Te(e, 156, n.lba, n.size, 2, new Uint8Array([0]));
}
function me(e, t, n, r) {
  const o = e.subarray(t * w, t * w + w);
  o[0] = 1, o[1] = 0, r ? (o[2] = n >>> 24 & 255, o[3] = n >>> 16 & 255, o[4] = n >>> 8 & 255, o[5] = n & 255, o[6] = 0, o[7] = 1) : (se(o, 2, n), dt(o, 6, 1)), o[8] = 0;
}
function nt(e, t, n, r, o) {
  const i = new Map(n.map((s) => [s.path, s]));
  for (const s of n) {
    const c = (s.lba - t) * w, a = e.subarray(c, c + s.size);
    let f = 0;
    const p = Dn(s.path), v = p === null ? s : i.get(p) ?? s;
    f = pe(a, f, s.lba, s.size, 2, new Uint8Array([0])), f = pe(a, f, v.lba, v.size, 2, new Uint8Array([1]));
    for (const d of je(s.node)) {
      const h = s.path ? `${s.path}/${d.name}` : d.name;
      if (d.kind === "dir") {
        const m = i.get(h);
        if (!m) continue;
        const g = o ? ve(d.name) : Oe(d.name, !0);
        f = pe(a, f, m.lba, m.size, 2, g);
      } else {
        const m = r.find((A) => A.path === h);
        if (!m) continue;
        const g = o ? ve(d.name) : Oe(d.name, !1);
        f = pe(a, f, m.lba, m.size, 0, g);
      }
    }
  }
}
function pe(e, t, n, r, o, i) {
  let s = 33 + i.length;
  return s % 2 === 1 && (s += 1), t + s > e.length ? t : (Te(e, t, n, r, o, i), t + s);
}
function Te(e, t, n, r, o, i) {
  let s = 33 + i.length;
  s % 2 === 1 && (s += 1), fe(e, t, s), fe(e, t + 1, 0), V(e, t + 2, n), V(e, t + 10, r), fe(e, t + 25, o), q(e, t + 28, 1), fe(e, t + 32, i.length), e.set(i, t + 33);
}
function Ce() {
  return new Uint8Array(w);
}
function R(e, t, n) {
  e.set(mt(n, n.length, 0), t);
}
function se(e, t, n) {
  e[t] = n & 255, e[t + 1] = n >>> 8 & 255, e[t + 2] = n >>> 16 & 255, e[t + 3] = n >>> 24 & 255;
}
function Bn(e) {
  return (e || "ISOMAKER").replace(/[^\w.-]+/g, "_").slice(0, 32);
}
function Dn(e) {
  if (!e) return null;
  const t = e.lastIndexOf("/");
  return t < 0 ? "" : e.slice(0, t);
}
class ae {
  constructor(t, n) {
    W(this, "original");
    W(this, "volumeLabel");
    W(this, "root");
    W(this, "dirty", !1);
    W(this, "entriesCache", []);
    this.original = t, this.volumeLabel = n.volumeLabel, this.root = zt(n.root), this.entriesCache = n.entries;
  }
  static async open(t) {
    const n = await pt(t);
    return new ae(t, n);
  }
  /** Build a session from an already-materialized directory tree (AppImage / Docker extract). */
  static fromDirectoryTree(t, n, r = new Blob([])) {
    const o = {
      volumeLabel: n,
      root: t,
      entries: [],
      totalBytes: 0
    }, i = new ae(r, o);
    return i.refreshEntries(), i;
  }
  get entries() {
    return this.entriesCache;
  }
  list(t) {
    return mn(this.root, t);
  }
  async readFile(t) {
    const n = z(this.root, t);
    if (!n || n.kind !== "file")
      throw new Error(`파일이 없습니다: ${t}`);
    if (n.source.type === "blob") return n.source.blob;
    if (n.source.type === "unavailable")
      throw new Error(n.source.reason);
    if (n.source.type === "path")
      throw new Error(
        `경로 소스는 데스크톱에서만 읽을 수 있습니다: ${n.source.absolutePath}`
      );
    return cn(n.source.iso, n.source.extents, n.source.blockSize);
  }
  remove(t) {
    const n = t.split("/").filter(Boolean);
    if (n.length === 0) throw new Error("루트는 삭제할 수 없습니다.");
    const r = n[n.length - 1], o = n.slice(0, -1).join("/"), i = z(this.root, o);
    if (!i || i.kind !== "dir") throw new Error(`경로가 없습니다: ${t}`);
    if (!i.children.delete(I(r)))
      throw new Error(`항목이 없습니다: ${t}`);
    this.dirty = !0, this.refreshEntries();
  }
  async addFiles(t, n) {
    const r = z(this.root, t);
    if (!r || r.kind !== "dir") throw new Error(`폴더가 없습니다: ${t || "/"}`);
    for (const o of Array.from(n)) {
      const i = o.name;
      r.children.set(I(i), {
        kind: "file",
        name: i,
        size: o.size,
        source: { type: "blob", blob: o }
      });
    }
    this.dirty = !0, this.refreshEntries();
  }
  /** Add a file by absolute disk path (desktop) without loading it into memory. */
  addFileFromPath(t, n, r, o) {
    const i = z(this.root, t);
    if (!i || i.kind !== "dir") throw new Error(`폴더가 없습니다: ${t || "/"}`);
    i.children.set(I(n), {
      kind: "file",
      name: n,
      size: o,
      source: { type: "path", absolutePath: r }
    }), this.dirty = !0, this.refreshEntries();
  }
  mkdir(t, n) {
    const r = z(this.root, t);
    if (!r || r.kind !== "dir") throw new Error(`폴더가 없습니다: ${t || "/"}`);
    if (r.children.has(I(n)))
      throw new Error(`이미 존재합니다: ${n}`);
    r.children.set(I(n), {
      kind: "dir",
      name: n,
      children: /* @__PURE__ */ new Map()
    }), this.dirty = !0, this.refreshEntries();
  }
  rename(t, n) {
    const r = t.split("/").filter(Boolean);
    if (r.length === 0) throw new Error("루트 이름은 변경할 수 없습니다.");
    const o = r[r.length - 1], i = r.slice(0, -1).join("/"), s = z(this.root, i);
    if (!s || s.kind !== "dir") throw new Error(`경로가 없습니다: ${t}`);
    const c = s.children.get(I(o));
    if (!c) throw new Error(`항목이 없습니다: ${t}`);
    if (s.children.has(I(n)))
      throw new Error(`이미 존재합니다: ${n}`);
    s.children.delete(I(o)), c.name = n, s.children.set(I(n), c), this.dirty = !0, this.refreshEntries();
  }
  async exportIso(t, n, r) {
    return En(this.root, this.volumeLabel, t, n, r);
  }
  refreshEntries() {
    const t = [];
    It(this.root, "", t), t.sort((n, r) => n.path.localeCompare(r.path)), this.entriesCache = t;
  }
}
function It(e, t, n) {
  for (const r of e.children.values()) {
    const o = t ? `${t}/${r.name}` : r.name;
    r.kind === "dir" ? (n.push({ path: o, name: r.name, isDir: !0, size: 0 }), It(r, o, n)) : n.push({ path: o, name: r.name, isDir: !1, size: r.size });
  }
}
function zt(e) {
  const t = { kind: "dir", name: e.name, children: /* @__PURE__ */ new Map() };
  for (const [n, r] of e.children)
    t.children.set(n, On(r));
  return t;
}
function On(e) {
  return e.kind === "dir" ? zt(e) : {
    kind: "file",
    name: e.name,
    size: e.size,
    source: e.source
  };
}
const Ln = ["iso", "img"];
function _n(e = "ko") {
  return [
    {
      name: e === "en" ? "Supported images (*.iso, *.img, *.AppImage, *.tar)" : "지원 이미지 (*.iso, *.img, *.AppImage, *.tar)",
      extensions: ["iso", "img", "AppImage", "appimage", "tar", "tgz", "docker"]
    },
    {
      name: "ISO / IMG",
      extensions: [...Ln]
    },
    {
      name: "AppImage",
      extensions: ["AppImage", "appimage"]
    },
    {
      name: e === "en" ? "Docker save / tar" : "Docker 저장본 / tar",
      extensions: ["tar", "tgz", "docker"]
    },
    {
      name: e === "en" ? "All files" : "모든 파일",
      extensions: ["*"]
    }
  ];
}
function Et(e = "ko", t) {
  const n = { name: "ISO", extensions: ["iso"] }, r = { name: "IMG", extensions: ["img"] }, o = {
    name: "AppImage",
    extensions: ["AppImage", "appimage"]
  }, i = {
    name: e === "en" ? "Docker save / tar" : "Docker 저장본 / tar",
    extensions: ["tar", "tgz", "docker"]
  }, s = {
    name: e === "en" ? "Compressed tar (.tgz)" : "압축 tar (.tgz)",
    extensions: ["tgz"]
  }, c = {
    name: e === "en" ? "All files" : "모든 파일",
    extensions: ["*"]
  };
  return [...t && t !== "unknown" ? {
    iso: [n, r, o, i, s],
    img: [r, n, o, i, s],
    appimage: [o, n, r, i, s],
    docker: [i, s, n, r, o]
  }[t] : [n, r, o, i, s], c];
}
function xe(e) {
  const t = e.replace(/^.*[/\\]/, "").toLowerCase();
  return t.endsWith(".appimage") ? "appimage" : t.endsWith(".iso") ? "iso" : t.endsWith(".img") ? "img" : t.endsWith(".tar.gz") || t.endsWith(".tgz") || t.endsWith(".tar") || t.endsWith(".docker") ? "docker" : "unknown";
}
function Fn(e) {
  return e === "appimage" || e === "docker";
}
function Un(e) {
  const t = e.replace(/^.*[/\\]/, "");
  if (/\.tar\.gz$/i.test(t))
    return `${t.replace(/\.tar\.gz$/i, "") || "image"}-edited.tar.gz`;
  const n = t.match(/^(.*)\.(iso|img|appimage|tar|tgz|docker)$/i);
  if (n) {
    const r = n[2], o = r.toLowerCase() === "appimage" ? "AppImage" : r.toLowerCase();
    return `${n[1]}-edited.${o}`;
  }
  return `${t || "image"}-edited.iso`;
}
function Rn(e) {
  const t = e.toLowerCase();
  return t.endsWith(".tgz") || t.endsWith(".tar.gz");
}
const jn = 64 * 1024 * 1024;
async function qe(e) {
  const t = l.statSync(e).size;
  try {
    const n = await ct(e);
    if (n.size === t) return n;
  } catch {
  }
  return $t(e, 0, t);
}
function $t(e, t, n) {
  const r = Math.max(0, n - t), o = {
    get size() {
      return r;
    },
    get type() {
      return "application/x-iso9660-image";
    },
    slice(i = 0, s = r, c) {
      const a = t + rt(i, r), f = t + rt(s, r);
      return $t(e, a, Math.max(a, f));
    },
    async arrayBuffer() {
      return Tn(e, t, r);
    },
    async bytes() {
      return new Uint8Array(await o.arrayBuffer());
    },
    async text() {
      return new TextDecoder().decode(await o.arrayBuffer());
    },
    stream() {
      const i = l.createReadStream(e, {
        start: t,
        end: Math.max(t, n - 1)
      });
      return Ue.toWeb(i);
    }
  };
  return o;
}
function rt(e, t) {
  if (!Number.isFinite(e)) return 0;
  let n = Math.trunc(e);
  return n < 0 && (n = Math.max(0, t + n)), Math.min(t, Math.max(0, n));
}
async function Tn(e, t, n) {
  if (n <= 0) return new ArrayBuffer(0);
  const r = await l.promises.open(e, "r");
  try {
    const o = Buffer.allocUnsafe(n);
    let i = 0;
    for (; i < n; ) {
      const c = Math.min(jn, n - i), { bytesRead: a } = await r.read(o, i, c, t + i);
      if (a <= 0) break;
      i += a;
    }
    const s = o.subarray(0, i);
    return s.buffer.slice(s.byteOffset, s.byteOffset + s.byteLength);
  } finally {
    await r.close();
  }
}
function Ne(e, t) {
  return [...e.children.values()].map((n) => qn(n, t)).sort((n, r) => Number(r.isDir) - Number(n.isDir) || n.name.localeCompare(r.name));
}
function qn(e, t) {
  const n = t ? `${t}/${e.name}` : e.name;
  return e.kind === "dir" ? {
    name: e.name,
    path: n,
    isDir: !0,
    size: 0,
    children: Ne(e, n)
  } : {
    name: e.name,
    path: n,
    isDir: !1,
    size: e.size
  };
}
let E = null, G = null, ce = "unknown", H = null, we = null;
const ne = /* @__PURE__ */ new Set(), C = /* @__PURE__ */ new Map(), ye = /* @__PURE__ */ new Map();
function Ge() {
  return !!(E != null && E.dirty);
}
function Nn() {
  return G;
}
async function Gn(e) {
  const t = u.resolve(e);
  if (!l.existsSync(t) || !l.statSync(t).isFile())
    throw new Error(`파일을 찾을 수 없습니다: ${t}`);
  _t(), Ft(), H = null, ce = "unknown";
  const n = xe(t), r = await hn(t, n);
  if (Fn(r))
    return Be(t, r);
  try {
    const o = await qe(t);
    return E = await ae.open(o), G = t, ce = r === "img" ? "img" : "iso", B();
  } catch (o) {
    if (await wt(t))
      return Be(t, "appimage");
    if (await yt(t))
      return Be(t, "docker");
    throw o;
  }
}
async function Be(e, t) {
  const { extractRoot: n, treeRoot: r, squashfsOffset: o } = await wn(
    e,
    t
  );
  we = n;
  const i = await yn(r), s = bn(e);
  return E = ae.fromDirectoryTree(i, s), G = e, ce = t, t === "appimage" && o != null && o > 0 && (H = { runtimePath: e, squashfsOffset: o }), B();
}
function We() {
  E = null, G = null, ce = "unknown", H = null, _t(), Ft();
}
function Mt() {
  return !E || !G ? null : B();
}
async function Wn(e, t) {
  const n = D(), r = z(n.root, e);
  if (!r || r.kind !== "dir")
    throw new Error(`폴더가 없습니다: ${e || "/"}`);
  for (const o of t) {
    const i = u.resolve(o);
    l.existsSync(i) && await Lt(n, e, i, u.basename(i));
  }
  return Ae(e), B();
}
function Kn(e) {
  return D().remove(e), Ae(e), B();
}
function Yn(e) {
  const t = D(), n = [...new Set(e)].sort(
    (r, o) => o.split("/").filter(Boolean).length - r.split("/").filter(Boolean).length
  );
  for (const r of n)
    try {
      t.remove(r), Ae(r);
    } catch {
    }
  return B();
}
function Jn(e, t) {
  return D().mkdir(e, t), B();
}
function Vn(e, t) {
  return D().rename(e, t), Ae(e), B();
}
async function Ct(e, t) {
  const n = D(), r = z(n.root, e);
  if (!r || r.kind !== "file")
    throw new Error(`파일이 없습니다: ${e}`);
  const o = u.resolve(t);
  if (l.mkdirSync(u.dirname(o), { recursive: !0 }), r.source.type === "path")
    await l.promises.copyFile(r.source.absolutePath, o);
  else {
    const i = await Ot(n, e);
    await Ke(i, o);
  }
  return { ok: !0, outputPath: o };
}
async function Hn(e, t) {
  const n = u.resolve(t);
  l.mkdirSync(n, { recursive: !0 });
  let r = 0;
  for (const o of e) {
    const i = D(), s = z(i.root, o);
    if (!s || s.kind !== "file") continue;
    const c = tr(n, s.name);
    await Ct(o, c), r += 1;
  }
  return { ok: !0, count: r, outputDir: n };
}
async function Xn(e) {
  const t = [], n = [];
  for (const r of e) {
    const o = await Bt(r);
    t.push(o.tempPath), n.push(o.name);
  }
  return { tempPaths: t, names: n };
}
async function Bt(e) {
  if (!E)
    return { tempPath: "", name: "" };
  const t = C.get(e);
  if (t && l.existsSync(t.tempPath))
    return { tempPath: t.tempPath, name: t.name };
  const n = ye.get(e);
  if (n) return n;
  const r = (async () => {
    if (!E)
      return { tempPath: "", name: "" };
    const o = E, i = z(o.root, e);
    if (!i || i.kind !== "file")
      throw new Error(`파일이 없습니다: ${e}`);
    const s = i.name;
    if (i.source.type === "path" && l.existsSync(i.source.absolutePath)) {
      const p = { tempPath: i.source.absolutePath, name: s, owned: !1 };
      return C.set(e, p), { tempPath: p.tempPath, name: p.name };
    }
    const c = await Ot(o, e);
    if (!E)
      return { tempPath: "", name: "" };
    const a = u.join(
      X.tmpdir(),
      `isomaker-drag-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${er(s)}`
    );
    if (await Ke(c, a), !l.existsSync(a))
      throw new Error(`임시 파일 생성 실패: ${s}`);
    const f = { tempPath: a, name: s, owned: !0 };
    return ne.add(a), C.set(e, f), { tempPath: a, name: s };
  })();
  ye.set(e, r);
  try {
    return await r;
  } finally {
    ye.delete(e);
  }
}
async function Dt(e, t, n) {
  const r = D(), o = u.resolve(e);
  l.mkdirSync(u.dirname(o), { recursive: !0 }), re(n);
  const i = xe(o), s = i === "unknown" ? "iso" : i;
  if (s === "iso" || s === "img") {
    t == null || t({ phase: "save", percent: 0, message: "ISO/IMG 작성 중…" });
    const c = await r.exportIso(
      (a) => {
        t == null || t({ phase: "save", percent: a.percent, message: a.message });
      },
      n,
      qe
    );
    re(n), await Ke(c, o, n);
  } else if (s === "docker")
    await Zn(r, o, Rn(o), t, n);
  else if (s === "appimage")
    await Qn(r, o, t, n);
  else
    throw new Error(`지원하지 않는 저장 형식: ${u.basename(o)}`);
  return re(n), r.dirty = !1, t == null || t({ phase: "save", percent: 100, message: "저장 완료" }), B();
}
async function Zn(e, t, n, r, o) {
  const i = await l.promises.mkdtemp(u.join(X.tmpdir(), "isomaker-save-tar-"));
  try {
    r == null || r({ phase: "save", percent: 0, message: "트리 준비 중…" }), await vt(e.root, i, r, o), await xn(i, t, n, r, o);
  } finally {
    try {
      l.rmSync(i, { recursive: !0, force: !0 });
    } catch {
    }
  }
}
async function Qn(e, t, n, r) {
  if (!H)
    throw new Error(
      `AppImage로 저장하려면 원본 AppImage를 연 상태에서 저장해야 합니다.
(런타임 ELF가 필요하며, ISO/IMG/tar에서 AppImage로 변환은 지원하지 않습니다.)
대신 .iso / .img / .tar 로 저장할 수 있습니다.`
    );
  const o = await l.promises.mkdtemp(u.join(X.tmpdir(), "isomaker-save-app-"));
  try {
    n == null || n({ phase: "save", percent: 0, message: "트리 준비 중…" }), await vt(e.root, o, n, r), await An(o, t, H, n, r);
  } finally {
    try {
      l.rmSync(o, { recursive: !0, force: !0 });
    } catch {
    }
  }
}
function re(e) {
  if (e != null && e.aborted) throw new Error("JOB_CANCELED");
}
async function Ot(e, t) {
  const n = z(e.root, t);
  return (n == null ? void 0 : n.kind) === "file" && n.source.type === "path" ? qe(n.source.absolutePath) : e.readFile(t);
}
function B() {
  const e = D();
  if (!G) throw new Error("No ISO session");
  let t = 0;
  for (const n of e.entries)
    n.isDir || (t += n.size);
  return {
    sourcePath: G,
    sourceKind: ce,
    dirty: e.dirty,
    canSaveAppImage: !!H,
    volumeLabel: e.volumeLabel,
    totalBytes: t,
    entryCount: e.entries.length,
    root: Ne(e.root, "")
  };
}
function D() {
  if (!E) throw new Error("열린 ISO가 없습니다.");
  return E;
}
async function Lt(e, t, n, r) {
  const o = await l.promises.stat(n);
  if (o.isDirectory()) {
    Pn(e, t, r);
    const i = t ? `${t}/${r}` : r, s = await l.promises.readdir(n);
    for (const c of s)
      await Lt(e, i, u.join(n, c), c);
    return;
  }
  e.addFileFromPath(t, r, n, o.size);
}
function Pn(e, t, n) {
  const r = z(e.root, t);
  if (!r || r.kind !== "dir")
    throw new Error(`폴더가 없습니다: ${t || "/"}`);
  if (r.children.has(I(n))) {
    const o = r.children.get(I(n));
    if ((o == null ? void 0 : o.kind) === "dir") return;
    throw new Error(`이미 파일이 있습니다: ${n}`);
  }
  e.mkdir(t, n);
}
async function Ke(e, t, n) {
  if (re(n), e.size < 8 * 1024 * 1024) {
    const o = Buffer.from(await e.arrayBuffer());
    re(n), await l.promises.writeFile(t, o, { signal: n });
    return;
  }
  const r = e.stream();
  await lt(Ue.fromWeb(r), l.createWriteStream(t), { signal: n });
}
function er(e) {
  return e.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/\.+$/g, "") || "file.bin";
}
function tr(e, t) {
  let n = u.join(e, t);
  if (!l.existsSync(n)) return n;
  const r = u.extname(t), o = u.basename(t, r);
  let i = 2;
  for (; l.existsSync(n); )
    n = u.join(e, `${o} (${i})${r}`), i += 1;
  return n;
}
function Ae(e) {
  const t = [...C.keys()];
  for (const n of t)
    if (!e || n === e || n.startsWith(e + "/")) {
      const r = C.get(n);
      if (C.delete(n), r != null && r.owned) {
        try {
          l.unlinkSync(r.tempPath);
        } catch {
        }
        ne.delete(r.tempPath);
      }
    }
}
function _t() {
  ye.clear();
  for (const [e, t] of C)
    if (C.delete(e), !!t.owned) {
      try {
        l.unlinkSync(t.tempPath);
      } catch {
      }
      ne.delete(t.tempPath);
    }
  C.clear();
  for (const e of ne)
    try {
      l.unlinkSync(e);
    } catch {
    }
  ne.clear();
}
function Ft() {
  if (!we) return;
  const e = we;
  we = null;
  try {
    l.rmSync(e, { recursive: !0, force: !0 });
  } catch {
  }
}
const ot = u.dirname(Fe(import.meta.url));
function Ut() {
  var t;
  const e = [];
  return (t = L) != null && t.isPackaged && process.resourcesPath && e.push(process.resourcesPath), e.push(process.cwd()), e.push(u.join(ot, "..")), e.push(u.join(ot, "..", "..")), [...new Set(e)];
}
function Ye(...e) {
  for (const t of Ut()) {
    const n = u.join(t, ...e);
    if (l.existsSync(n)) return n;
  }
  return null;
}
const it = u.dirname(Fe(import.meta.url));
function nr() {
  return process.platform === "win32" ? "xorriso.exe" : "xorriso";
}
function rr() {
  if (process.platform !== "win32") return [];
  const e = [
    process.env.MSYS2_ROOT,
    "C:\\msys64",
    "C:\\msys32",
    process.env.CYGWIN_ROOT,
    "C:\\cygwin64",
    "C:\\cygwin"
  ].filter((n) => !!n), t = [];
  for (const n of e)
    t.push(u.join(n, "usr", "bin", "xorriso.exe")), t.push(u.join(n, "bin", "xorriso.exe")), t.push(u.join(n, "mingw64", "bin", "xorriso.exe"));
  return t;
}
function Rt() {
  const e = ["vendor", "xorriso", process.platform, nr()], t = [
    // Prefer full installs (DLL path is next to the exe / on PATH)
    ...rr(),
    ...Ut().map((n) => u.join(n, ...e)),
    Ye(...e) ?? "",
    u.join(it, "..", "..", ...e),
    u.join(it, "..", "..", "..", ...e)
  ].filter(Boolean);
  for (const n of t)
    if (l.existsSync(n)) return n;
  return process.platform === "win32" ? "xorriso.exe" : "xorriso";
}
function or(e) {
  if (process.platform !== "win32" || !u.isAbsolute(e)) return !1;
  const t = e.replace(/\\/g, "/").toLowerCase();
  if (t.includes("/msys") || t.includes("/cygwin") || t.includes("/usr/bin/")) return !0;
  const n = u.dirname(e);
  return l.existsSync(u.join(n, "msys-2.0.dll")) || l.existsSync(u.join(n, "cygwin1.dll"));
}
function ir(e) {
  if (process.platform !== "win32") return e;
  let t = e;
  t.startsWith("\\\\?\\") && (t = t.slice(4));
  const n = u.resolve(t), r = /^([a-zA-Z]):[\\/](.*)$/.exec(n);
  if (!r) return n.replace(/\\/g, "/");
  const o = r[1].toLowerCase(), i = r[2].replace(/\\/g, "/");
  return i ? `/${o}/${i}` : `/${o}`;
}
function sr(e, t) {
  return or(e) ? t.map((n) => /^[a-zA-Z]:[\\/]/.test(n) || n.startsWith("\\\\?\\") ? ir(n) : n) : t;
}
function Ie(e, t, n) {
  const r = Rt();
  if (!r)
    return Promise.reject(new Error("xorriso binary not found"));
  if (n != null && n.aborted)
    return Promise.reject(De());
  const o = { ...process.env };
  if (process.platform === "win32" && u.isAbsolute(r)) {
    const s = u.dirname(r);
    o.PATH = `${s};${o.PATH ?? ""}`, o.MSYS2_ARG_CONV_EXCL = "*", o.MSYS_NO_PATHCONV = "1";
  }
  const i = sr(r, e);
  return new Promise((s, c) => {
    let a = !1;
    const f = ut(r, i, {
      windowsHide: !0,
      stdio: ["ignore", "pipe", "pipe"],
      env: o
    }), p = () => {
      a || f.kill();
    };
    n == null || n.addEventListener("abort", p, { once: !0 });
    let v = "", d = "";
    f.stdout.on("data", (h) => {
      const m = h.toString();
      v += m, t == null || t({
        phase: "running",
        percent: null,
        message: m.trim()
      });
    }), f.stderr.on("data", (h) => {
      const m = h.toString();
      d += m, t == null || t({
        phase: "running",
        percent: ar(m),
        message: m.trim()
      });
    }), f.on("error", (h) => {
      if (!a) {
        if (a = !0, n == null || n.removeEventListener("abort", p), n != null && n.aborted) {
          c(De());
          return;
        }
        c(
          new Error(
            `Failed to start xorriso (${r}): ${h.message}. Install xorriso or place a binary under vendor/xorriso/${process.platform}/`
          )
        );
      }
    }), f.on("close", (h) => {
      if (!a) {
        if (a = !0, n == null || n.removeEventListener("abort", p), n != null && n.aborted) {
          c(De());
          return;
        }
        s({ code: h ?? 1, stdout: v, stderr: d });
      }
    });
  });
}
function De() {
  return new Error("JOB_CANCELED");
}
function ar(e) {
  const t = e.match(/(\d+(?:\.\d+)?)\s*%/);
  return t ? Math.min(100, Math.max(0, Number(t[1]))) : null;
}
async function cr() {
  const e = Rt(), t = process.platform === "win32" ? "MSYS2: pacman -S xorriso  (또는 vendor/xorriso/win32/xorriso.exe 에 복사)" : process.platform === "darwin" ? "Install with: brew install xorriso — or copy binary to vendor/xorriso/darwin/" : "Install with: sudo apt install xorriso — or copy binary to vendor/xorriso/linux/";
  if (!e)
    return {
      available: !1,
      binaryPath: null,
      version: null,
      platform: process.platform,
      hint: t
    };
  const n = u.isAbsolute(e);
  try {
    const r = await Ie(["-version"]), o = `${r.stdout}
${r.stderr}`, i = o.match(/xorriso\s+version\s+([\d.]+)/i) || o.match(/GNU xorriso\s+([\d.]+)/i), s = r.code === 0 || /xorriso/i.test(o);
    return {
      available: s,
      binaryPath: e,
      version: (i == null ? void 0 : i[1]) ?? (s ? "unknown" : null),
      platform: process.platform,
      hint: s ? "xorriso ready" : t
    };
  } catch {
    return {
      available: !1,
      binaryPath: n ? e : null,
      version: null,
      platform: process.platform,
      hint: t
    };
  }
}
async function lr(e, t, n) {
  const r = u.resolve(e.isoPath), o = u.resolve(e.outputDir);
  be(r, "ISO file"), l.mkdirSync(o, { recursive: !0 }), t == null || t({ phase: "extract", percent: 0, message: "Extracting ISO…" });
  const i = process.platform === "win32" ? [
    "-abort_on",
    "NEVER",
    "-return_with",
    "FATAL",
    "32",
    "-error_behavior",
    "file_extraction",
    "best_effort",
    "-hardlinks",
    "discard_extract"
  ] : [], s = await Ie(
    [
      ...i,
      "-osirrox",
      "on",
      "-indev",
      r,
      "-extract",
      "/",
      o
    ],
    t,
    n
  );
  if (s.code !== 0)
    throw new Error(Je("extract", s.stderr || s.stdout));
  const c = ur(s.stderr || s.stdout);
  t == null || t({
    phase: "extract",
    percent: 100,
    message: c > 0 ? `Extraction complete (${c} symlink(s) skipped on Windows)` : "Extraction complete"
  });
}
function ur(e) {
  const t = e.match(/Cannot restore symbolic link/gi);
  return (t == null ? void 0 : t.length) ?? 0;
}
async function fr(e, t, n) {
  const r = u.resolve(e.sourceDir), o = u.resolve(e.outputIso);
  jt(r, "Source directory"), l.mkdirSync(u.dirname(o), { recursive: !0 });
  const i = Tt(e.volumeLabel ?? "ISOMAKER");
  t == null || t({ phase: "create", percent: 0, message: "Creating ISO…" });
  const s = await Ie(
    [
      "-as",
      "mkisofs",
      "-r",
      "-J",
      "-joliet-long",
      "-V",
      i,
      "-o",
      o,
      r
    ],
    t,
    n
  );
  if (s.code !== 0)
    throw new Error(Je("create", s.stderr || s.stdout));
  t == null || t({ phase: "create", percent: 100, message: "ISO created" });
}
async function dr(e, t, n) {
  const r = u.resolve(e.sourceDir), o = u.resolve(e.outputIso);
  if (jt(r, "Source directory"), l.mkdirSync(u.dirname(o), { recursive: !0 }), !e.biosBootImage && !e.efiBootImage)
    throw new Error("At least one of biosBootImage or efiBootImage is required for a bootable ISO");
  const s = ["-as", "mkisofs", "-r", "-J", "-joliet-long", "-V", Tt(e.volumeLabel ?? "BOOTISO")];
  if (e.isohybridMbr) {
    const a = u.join(r, e.isohybridMbr);
    be(a, "isohybrid MBR"), s.push("-isohybrid-mbr", a);
  }
  if (e.biosBootImage) {
    const a = u.join(r, e.biosBootImage);
    be(a, "BIOS boot image"), s.push(
      "-b",
      e.biosBootImage,
      "-c",
      "boot.catalog",
      "-no-emul-boot",
      "-boot-load-size",
      "4",
      "-boot-info-table"
    );
  }
  if (e.efiBootImage) {
    const a = u.join(r, e.efiBootImage);
    be(a, "EFI boot image"), s.push("-eltorito-alt-boot", "-e", e.efiBootImage, "-no-emul-boot"), e.isohybridMbr || s.push("-isohybrid-gpt-basdat");
  }
  s.push("-o", o, r), t == null || t({ phase: "bootable", percent: 0, message: "Creating bootable ISO…" });
  const c = await Ie(s, t, n);
  if (c.code !== 0)
    throw new Error(Je("bootable create", c.stderr || c.stdout));
  t == null || t({ phase: "bootable", percent: 100, message: "Bootable ISO created" });
}
function be(e, t) {
  if (!l.existsSync(e) || !l.statSync(e).isFile())
    throw new Error(`${t} not found: ${e}`);
}
function jt(e, t) {
  if (!l.existsSync(e) || !l.statSync(e).isDirectory())
    throw new Error(`${t} not found: ${e}`);
}
function Tt(e) {
  return e.replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 32) || "ISOMAKER";
}
function Je(e, t) {
  const n = t.trim().slice(-2e3);
  return `xorriso ${e} failed:
${n || "Unknown error"}`;
}
async function mr(e) {
  const t = u.resolve(e);
  if (!l.existsSync(t) || !l.statSync(t).isFile())
    throw new Error(`ISO file not found: ${t}`);
  const n = await ct(t), r = await pt(n), o = Ne(r.root, "");
  return {
    volumeLabel: r.volumeLabel,
    totalBytes: r.totalBytes,
    entryCount: r.entries.length,
    root: o
  };
}
function _e() {
  return u.join(L.getPath("userData"), "isomaker-paths.json");
}
function pr() {
  try {
    const e = l.readFileSync(_e(), "utf8"), t = JSON.parse(e);
    return {
      lastDirectory: typeof t.lastDirectory == "string" && t.lastDirectory ? t.lastDirectory : null
    };
  } catch {
    return { lastDirectory: null };
  }
}
function hr(e) {
  try {
    l.mkdirSync(u.dirname(_e()), { recursive: !0 }), l.writeFileSync(_e(), JSON.stringify(e, null, 2), "utf8");
  } catch {
  }
}
function wr() {
  const e = pr().lastDirectory;
  return e && l.existsSync(e) && l.statSync(e).isDirectory() ? e : null;
}
function Z(e) {
  try {
    const n = l.statSync(e).isDirectory() ? e : u.dirname(e);
    n && l.existsSync(n) && hr({ lastDirectory: n });
  } catch {
  }
}
function le(e, t) {
  const n = yr(e), r = wr(), o = n ?? r;
  return t ? o ? u.join(o, u.basename(t)) : t : o ?? void 0;
}
function yr(e) {
  if (!e) return null;
  try {
    if (l.existsSync(e)) {
      const r = l.statSync(e).isDirectory() ? e : u.dirname(e);
      return l.existsSync(r) ? r : null;
    }
    const t = u.dirname(e);
    if (t && t !== e && l.existsSync(t)) return t;
  } catch {
  }
  return null;
}
const _ = Zt(Xt);
async function br(e) {
  if (!l.existsSync(e))
    return { mounted: !1, message: `Image not found: ${e}` };
  switch (process.platform) {
    case "win32":
      return kr(e);
    case "darwin":
      return gr(e);
    case "linux":
      return Ar(e);
    default:
      return { mounted: !1, message: `Mount not supported on ${process.platform}` };
  }
}
async function Sr(e) {
  switch (process.platform) {
    case "win32":
      return vr(e);
    case "darwin":
      return xr(e);
    case "linux":
      return Ir(e);
    default:
      return { mounted: !1, message: `Unmount not supported on ${process.platform}` };
  }
}
async function kr(e) {
  const t = `
$ErrorActionPreference = 'Stop'
$img = Mount-DiskImage -ImagePath '${qt(e)}' -PassThru
$vol = $img | Get-Volume
if (-not $vol.DriveLetter) { throw 'No drive letter assigned' }
Write-Output ($vol.DriveLetter + ':\\')
`;
  try {
    const { stdout: n } = await _(
      "powershell.exe",
      ["-NoProfile", "-Command", t],
      { windowsHide: !0 }
    ), r = n.trim();
    return { mounted: !0, mountPoint: r, message: `Mounted at ${r}` };
  } catch (n) {
    return { mounted: !1, message: Q(n) };
  }
}
async function vr(e) {
  const t = `
$ErrorActionPreference = 'Stop'
Dismount-DiskImage -ImagePath '${qt(e)}'
`;
  try {
    return await _("powershell.exe", ["-NoProfile", "-Command", t], {
      windowsHide: !0
    }), { mounted: !1, message: "Unmounted" };
  } catch (n) {
    return { mounted: !0, message: Q(n) };
  }
}
async function gr(e) {
  try {
    const { stdout: t } = await _("hdiutil", ["attach", "-readonly", e]), n = t.trim().split(`
`), o = (n[n.length - 1] ?? "").split(/\s{2,}|\t+/).filter(Boolean), i = o.find((s) => s.startsWith("/Volumes/")) ?? o[o.length - 1];
    return {
      mounted: !0,
      mountPoint: i,
      message: i ? `Mounted at ${i}` : "Mounted"
    };
  } catch (t) {
    return { mounted: !1, message: Q(t) };
  }
}
async function xr(e) {
  try {
    return await _("hdiutil", ["detach", e]), { mounted: !1, message: "Unmounted" };
  } catch (t) {
    return { mounted: !0, message: Q(t) };
  }
}
async function Ar(e) {
  const t = u.join(X.tmpdir(), `isomaker-mnt-${Date.now()}`);
  l.mkdirSync(t, { recursive: !0 });
  try {
    return await _("mount", ["-o", "loop,ro", e, t]), { mounted: !0, mountPoint: t, message: `Mounted at ${t}` };
  } catch (n) {
    try {
      return await _("fuseiso", [e, t]), { mounted: !0, mountPoint: t, message: `Mounted via fuseiso at ${t}` };
    } catch {
      try {
        l.rmdirSync(t);
      } catch {
      }
      return {
        mounted: !1,
        message: `${Q(n)} (tip: run with privileges or install fuseiso)`
      };
    }
  }
}
async function Ir(e) {
  try {
    await _("umount", [e]);
    try {
      l.rmdirSync(e);
    } catch {
    }
    return { mounted: !1, message: "Unmounted" };
  } catch (t) {
    try {
      return await _("fusermount", ["-u", e]), { mounted: !1, message: "Unmounted (fuse)" };
    } catch {
      return { mounted: !0, message: Q(t) };
    }
  }
}
function qt(e) {
  return e.replace(/'/g, "''");
}
function Q(e) {
  if (e && typeof e == "object" && "stderr" in e) {
    const t = String(e.stderr ?? "");
    if (t.trim()) return t.trim();
  }
  return e instanceof Error ? e.message : String(e);
}
const Se = u.dirname(Fe(import.meta.url));
L.setAppUserModelId("com.shkwon.isomaker");
let S = null, ge = !1, ke = !1, N = null, Y = null, ze = "ko";
function ue() {
  return ze === "ko";
}
function zr() {
  const e = [
    // Dev: source file next to this repo (most reliable with "type": "module")
    u.join(process.cwd(), "electron", "preload.cjs"),
    // Packaged / built next to main or project electron/
    u.join(Se, "preload.cjs"),
    u.join(Se, "..", "electron", "preload.cjs"),
    u.join(Se, "preload.js")
  ];
  for (const t of e)
    if (l.existsSync(t)) return t;
  return e[0];
}
function Er() {
  const e = process.platform === "win32" ? "icon.ico" : (process.platform === "darwin", "icon.png");
  return Ye("assets", e) ?? void 0;
}
function st() {
  const e = zr(), t = Er();
  ge = !1, S = new at({
    width: 1480,
    height: 900,
    minWidth: 1480,
    minHeight: 700,
    title: "ISO Maker",
    autoHideMenuBar: !0,
    ...t ? { icon: t } : {},
    webPreferences: {
      preload: e,
      contextIsolation: !0,
      nodeIntegration: !1,
      sandbox: !1,
      devTools: !1
    }
  }), S.webContents.closeDevTools(), S.webContents.on("devtools-opened", () => {
    S == null || S.webContents.closeDevTools();
  }), S.webContents.on("did-fail-load", (r, o, i, s) => {
    console.error("[iso-maker] did-fail-load", { code: o, desc: i, url: s });
  }), S.webContents.on("preload-error", (r, o, i) => {
    console.error("[iso-maker] preload-error", o, i);
  }), S.on("close", (r) => {
    if (ge || !Ge()) {
      j(), We();
      return;
    }
    r.preventDefault(), Nt();
  });
  const n = process.env.VITE_DEV_SERVER_URL;
  n ? S.loadURL(n) : S.loadFile(u.join(Se, "../dist/index.html"));
}
function j() {
  ke = !1, N && (clearTimeout(N), N = null);
}
function Nt() {
  !S || ke || (ke = !0, S.webContents.send("app:close-request"), N = setTimeout(() => {
    ke && $r();
  }, 1500));
}
function Gt() {
  j(), ge = !0, We(), S == null || S.close();
}
async function $r() {
  if (!S) {
    j();
    return;
  }
  const e = ue(), t = await T.showMessageBox(S, {
    type: "question",
    buttons: e ? ["저장 후 종료", "저장 안 함", "취소"] : ["Save & quit", "Don't save", "Cancel"],
    defaultId: 0,
    cancelId: 2,
    title: e ? "저장하지 않은 변경" : "Unsaved changes",
    message: e ? "내용이 변경되었습니다. 종료하기 전에 저장할까요?" : "Contents have been modified. Save before quitting?",
    detail: e ? "저장 형식(ISO/IMG/AppImage/tar)을 선택할 수 있습니다." : "You can choose the save format (ISO/IMG/AppImage/tar)."
  });
  if (t.response === 2) {
    j();
    return;
  }
  if (t.response === 0) {
    const n = Nn(), r = n ? Un(n) : "edited.iso", o = n ? xe(n) : "iso", i = await T.showSaveDialog(S, {
      title: e ? "변경 내용 저장" : "Save changes",
      defaultPath: le(n ?? void 0, r),
      filters: Et(e ? "ko" : "en", o)
    });
    if (i.canceled || !i.filePath) {
      j();
      return;
    }
    try {
      await Dt(i.filePath, P), Z(i.filePath), S.webContents.send("session:updated", Mt());
    } catch (s) {
      const c = s instanceof Error ? s.message : String(s);
      await T.showMessageBox(S, {
        type: "error",
        message: e ? "저장 실패" : "Save failed",
        detail: c
      }), j();
      return;
    }
  }
  Gt();
}
function P(e) {
  S == null || S.webContents.send("job:progress", e);
}
async function Ee(e) {
  if (Y) throw new Error("A job is already running");
  const t = new AbortController();
  Y = t;
  try {
    return await e(t.signal);
  } finally {
    Y === t && (Y = null);
  }
}
L.whenReady().then(() => {
  Vt.setApplicationMenu(null), st(), L.on("activate", () => {
    at.getAllWindows().length === 0 && st();
  });
});
L.on("before-quit", (e) => {
  ge || !Ge() || (e.preventDefault(), S && !S.isDestroyed() ? S.close() : Nt());
});
L.on("window-all-closed", () => {
  process.platform !== "darwin" && L.quit();
});
y.handle("app:close-ack", async () => (N && (clearTimeout(N), N = null), { ok: !0 }));
y.handle("app:close-decision", async (e, t) => t === "cancel" ? (j(), { ok: !0 }) : (Gt(), { ok: !0 }));
y.handle("engine:info", async () => cr());
y.handle(
  "dialog:openFile",
  async (e, t, n, r) => {
    const o = await T.showOpenDialog({
      title: r || (ue() ? "이미지 열기" : "Open image"),
      properties: ["openFile"],
      filters: t ?? _n(ze),
      defaultPath: le(n)
    }), i = o.canceled ? null : o.filePaths[0] ?? null;
    return i && Z(i), i;
  }
);
y.handle(
  "dialog:openFiles",
  async (e, t, n, r) => {
    const o = await T.showOpenDialog({
      title: r || (ue() ? "파일 선택" : "Select files"),
      properties: ["openFile", "multiSelections"],
      ...t != null && t.length ? { filters: t } : {},
      defaultPath: le(n)
    });
    return o.canceled || !o.filePaths.length ? [] : (Z(o.filePaths[0]), o.filePaths);
  }
);
y.handle(
  "dialog:openDirectory",
  async (e, t, n) => {
    const r = await T.showOpenDialog({
      title: n || (ue() ? "디렉터리 선택" : "Select directory"),
      properties: ["openDirectory", "createDirectory"],
      defaultPath: le(t)
    }), o = r.canceled ? null : r.filePaths[0] ?? null;
    return o && Z(o), o;
  }
);
y.handle(
  "dialog:saveFile",
  async (e, t, n, r, o) => {
    const i = t || "output.iso", s = xe(i), c = await T.showSaveDialog({
      title: r || (ue() ? "이미지 저장" : "Save image"),
      defaultPath: le(n ?? t, i),
      filters: o != null && o.length ? o : Et(ze, s)
    }), a = c.canceled ? null : c.filePath ?? null;
    return a && Z(a), a;
  }
);
y.handle("shell:openPath", async (e, t) => Ht.openPath(t));
y.handle("iso:extract", async (e, t) => (await Ee((n) => lr(t, P, n)), { ok: !0 }));
y.handle("iso:create", async (e, t) => (await Ee((n) => fr(t, P, n)), { ok: !0 }));
y.handle("iso:createBootable", async (e, t) => (await Ee((n) => dr(t, P, n)), { ok: !0 }));
y.handle("iso:cancel", async () => Y ? (Y.abort(), P({ phase: "cancel", percent: null, message: "Canceling job…" }), { ok: !0, canceled: !0 }) : { ok: !0, canceled: !1 });
y.handle("iso:mount", async (e, t) => br(t));
y.handle("iso:unmount", async (e, t) => Sr(t));
y.handle("iso:listTree", async (e, t) => mr(t));
y.handle("session:open", async (e, t) => await Gn(t));
y.handle("session:get", async () => Mt());
y.handle("session:close", async () => (We(), { ok: !0 }));
y.handle("session:addPaths", async (e, t, n) => Wn(t, n));
y.handle("session:remove", async (e, t) => Kn(t));
y.handle("session:removeMany", async (e, t) => Yn(t));
y.handle("session:mkdir", async (e, t, n) => Jn(t, n));
y.handle("session:rename", async (e, t, n) => Vn(t, n));
y.handle(
  "session:exportFile",
  async (e, t, n) => Ct(t, n)
);
y.handle(
  "session:exportFilesToDir",
  async (e, t, n) => Hn(t, n)
);
y.handle("session:prepareDragOut", async (e, t) => Bt(t));
y.handle("session:prepareDragOutMany", async (e, t) => Xn(t));
y.handle("session:save", async (e, t) => {
  const n = await Ee((r) => Dt(t, P, r));
  return Z(t), n;
});
y.handle("session:isDirty", async () => ({ dirty: Ge() }));
y.on("ondragstart", (e, t) => {
  const n = (Array.isArray(t) ? t : [t]).filter(
    (i) => typeof i == "string" && l.existsSync(i)
  );
  if (!n.length) return;
  const r = Ye("assets", "icon-32.png");
  let o = r ? $e.createFromPath(r) : $e.createEmpty();
  o.isEmpty() && (o = $e.createFromDataURL(
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAKElEQVQ4T2NkYGD4z0ABYBzVMKoBBkYGBgYGRkZGRgYGBgYGBgYGAAB/QAGH0b6bUQAAAABJRU5ErkJggg=="
  ));
  try {
    e.sender.startDrag({
      file: n[0],
      files: n.length > 1 ? n : void 0,
      icon: o
    });
  } catch (i) {
    console.error("[iso-maker] startDrag failed", n, i);
  }
});
y.handle("prefs:setLocale", async (e, t) => ((t === "ko" || t === "en") && (ze = t), { ok: !0 }));
