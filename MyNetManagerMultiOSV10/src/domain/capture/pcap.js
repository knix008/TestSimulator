// Capture file reader/writer: libpcap (all magics, both byte orders, modified pcap) and pcapng.
// Frames keep subarrays of the input buffer, so reading a large file does not copy packet bytes.

const PCAP_US = 0xa1b2c3d4;
const PCAP_NS = 0xa1b23c4d;
const PCAP_KUZ = 0xa1b2cd34;       // "modified" pcap (Alexey Kuznetzov): 8 extra bytes per record
const NG_SHB = 0x0a0d0d0a;
const NG_MAGIC = 0x1a2b3c4d;

const MAX_PACKET = 256 * 1024 * 1024;

/** 'pcap' | 'pcapng' | null (gzip input reports null; use readCaptureAsync). */
export function detectFormat(bytes) {
  if (!bytes || bytes.length < 4) return null;
  const be = ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
  const le = ((bytes[3] << 24) | (bytes[2] << 16) | (bytes[1] << 8) | bytes[0]) >>> 0;
  if (be === NG_SHB) return 'pcapng';
  for (const m of [PCAP_US, PCAP_NS, PCAP_KUZ]) if (be === m || le === m) return 'pcap';
  return null;
}

export function isGzip(bytes) { return bytes && bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b; }

/** Like readCapture, but also accepts gzip-compressed files (when DecompressionStream exists). */
export async function readCaptureAsync(bytes, name) {
  if (isGzip(bytes)) {
    if (typeof DecompressionStream !== 'function') throw new Error('This file is gzip-compressed and this environment cannot decompress it.');
    const ds = new DecompressionStream('gzip');
    const stream = new Blob([bytes]).stream().pipeThrough(ds);
    const out = new Uint8Array(await new Response(stream).arrayBuffer());
    const f = readCapture(out, name);
    f.compressed = 'gzip';
    f.size = bytes.length;
    return f;
  }
  return readCapture(bytes, name);
}

/** Parse a capture file. Throws Error with a readable message when nothing usable is found. */
export function readCapture(bytes, name = '') {
  if (!(bytes instanceof Uint8Array)) bytes = new Uint8Array(bytes);
  if (isGzip(bytes)) throw new Error('This file is gzip-compressed; open it with readCaptureAsync.');
  const fmt = detectFormat(bytes);
  if (fmt === 'pcap') return readPcap(bytes, name);
  if (fmt === 'pcapng') return readPcapng(bytes, name);
  if (bytes.length < 4) throw new Error('The file is too short to be a capture file.');
  throw new Error("The file isn't a capture file in a format MyNetManager understands (pcap or pcapng).");
}

function newFile(format, name, size) {
  return { format, name, size, interfaces: [], frames: [], section: {}, truncated: false, error: null };
}

// ---------------------------------------------------------------------------------------------
// pcap

function readPcap(b, name) {
  if (b.length < 24) throw new Error('The capture file is cut short in the middle of the file header.');
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const raw = dv.getUint32(0, false);
  let le = !(raw === PCAP_US || raw === PCAP_NS || raw === PCAP_KUZ);
  const magic = dv.getUint32(0, le);
  const ns = magic === PCAP_NS;
  const kuz = magic === PCAP_KUZ;
  const vmaj = dv.getUint16(4, le), vmin = dv.getUint16(6, le);
  const snaplen = dv.getUint32(16, le);
  const linktype = dv.getUint32(20, le) & 0xffff;
  const f = newFile('pcap', name, b.length);
  f.version = `${vmaj}.${vmin}`;
  f.byteOrder = le ? 'little' : 'big';
  f.interfaces.push({ name: 'unknown', description: '', linktype, snaplen, tsresol: ns ? 9 : 6 });
  const hdr = kuz ? 24 : 16;
  let o = 24;
  const frames = f.frames;
  while (o < b.length) {
    if (o + hdr > b.length) { trunc(f, `The capture file appears to have been cut short in the middle of a packet header (frame ${frames.length + 1}).`); break; }
    const sec = dv.getUint32(o, le), frac = dv.getUint32(o + 4, le);
    const caplen = dv.getUint32(o + 8, le), len = dv.getUint32(o + 12, le);
    if (caplen > MAX_PACKET || (snaplen > 0 && caplen > Math.max(snaplen, 262144))) {
      trunc(f, `The capture file appears to be damaged or corrupt: packet ${frames.length + 1} is ${caplen} bytes, bigger than the maximum of ${Math.max(snaplen, 262144)}.`);
      break;
    }
    o += hdr;
    if (o + caplen > b.length) { trunc(f, `The capture file appears to have been cut short in the middle of a packet (frame ${frames.length + 1}).`); break; }
    const nsec = ns ? frac : frac * 1000;
    if (nsec > 999999999) { trunc(f, `The capture file appears to be damaged or corrupt: invalid timestamp in packet ${frames.length + 1}.`); break; }
    frames.push({
      no: frames.length + 1, sec, nsec, caplen, len: Math.max(len, caplen),
      data: b.subarray(o, o + caplen), linktype, iface: 0, comment: null,
    });
    o += caplen;
  }
  return f;
}

function trunc(f, msg) { f.truncated = true; f.error = msg; }

export function writePcap(file, frames) {
  frames = frames || file.frames;
  const lt = frames.length ? frames[0].linktype : (file.interfaces[0]?.linktype ?? 1);
  const ns = (file.interfaces[0]?.tsresol ?? 6) === 9 || frames.some((fr) => fr.nsec % 1000 !== 0);
  const use = frames.filter((fr) => fr.linktype === lt);
  let size = 24;
  for (const fr of use) size += 16 + fr.data.length;
  const out = new Uint8Array(size);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, ns ? PCAP_NS : PCAP_US, true);
  dv.setUint16(4, 2, true); dv.setUint16(6, 4, true);
  const snap = Math.max(file.interfaces[0]?.snaplen || 0, ...use.map((fr) => fr.data.length), 0) || 262144;
  dv.setUint32(16, snap, true);
  dv.setUint32(20, lt, true);
  let o = 24;
  for (const fr of use) {
    dv.setUint32(o, fr.sec >>> 0, true);
    dv.setUint32(o + 4, ns ? fr.nsec : Math.floor(fr.nsec / 1000), true);
    dv.setUint32(o + 8, fr.data.length, true);
    dv.setUint32(o + 12, Math.max(fr.len, fr.data.length), true);
    out.set(fr.data, o + 16);
    o += 16 + fr.data.length;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// pcapng

const TD = new TextDecoder('utf-8', { fatal: false });
const TE = new TextEncoder();

function readOptions(b, dv, o, end, le) {
  const opts = [];
  while (o + 4 <= end) {
    const code = dv.getUint16(o, le), len = dv.getUint16(o + 2, le);
    if (code === 0) break;
    if (o + 4 + len > end) break;
    opts.push({ code, o: o + 4, len });
    o += 4 + ((len + 3) & ~3);
  }
  return opts;
}
const str = (b, opt) => TD.decode(b.subarray(opt.o, opt.o + opt.len)).replace(/\0+$/, '');

function readPcapng(b, name) {
  const f = newFile('pcapng', name, b.length);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let le = true;
  let o = 0;
  let sectionBase = 0;    // index into f.interfaces of the current section's interface 0
  let sectionNo = 0;
  let ifaceInfo = [];     // per interface: { ups (BigInt units/sec), offset (sec) }
  f.names = [];
  f.interfaceStats = [];
  f.sections = [];
  const frames = f.frames;
  while (o < b.length) {
    if (o + 12 > b.length) { trunc(f, 'The capture file appears to have been cut short in the middle of a block header.'); break; }
    let type = dv.getUint32(o, le);
    if (dv.getUint32(o, false) === NG_SHB) {
      type = NG_SHB;
      const bom = dv.getUint32(o + 8, true);
      if (bom === NG_MAGIC) le = true;
      else if (dv.getUint32(o + 8, false) === NG_MAGIC) le = false;
      else { if (!frames.length) throw new Error('The file is not a valid pcapng file: bad byte-order magic.'); trunc(f, 'Bad section header block.'); break; }
    }
    const blen = dv.getUint32(o + 4, le);
    if (blen < 12 || blen % 4 !== 0) {
      if (o === 0) throw new Error('The file is not a valid pcapng file: bad first block length.');
      trunc(f, `The capture file appears to be damaged or corrupt: block at offset ${o} has invalid length ${blen}.`);
      break;
    }
    if (o + blen > b.length) {
      if (o === 0) throw new Error('The capture file is cut short in the middle of the section header.');
      trunc(f, `The capture file appears to have been cut short in the middle of a packet (after frame ${frames.length}).`);
      break;
    }
    if (dv.getUint32(o + blen - 4, le) !== blen) {
      trunc(f, `The capture file appears to be damaged or corrupt: block at offset ${o} has mismatched lengths.`);
      break;
    }
    const body = o + 8, end = o + blen - 4;
    try {
      switch (type) {
        case NG_SHB: {
          sectionNo = f.sections.length;
          sectionBase = f.interfaces.length;
          ifaceInfo = [];
          const sec = { major: dv.getUint16(body + 4, le), minor: dv.getUint16(body + 6, le) };
          for (const op of readOptions(b, dv, body + 16, end, le)) {
            if (op.code === 1) sec.comment = (sec.comment ? sec.comment + '\n' : '') + str(b, op);
            else if (op.code === 2) sec.hardware = str(b, op);
            else if (op.code === 3) sec.os = str(b, op);
            else if (op.code === 4) sec.application = str(b, op);
          }
          f.sections.push(sec);
          if (sectionNo === 0) {
            f.section = {};
            for (const k of ['comment', 'hardware', 'os', 'application']) if (sec[k] !== undefined) f.section[k] = sec[k];
            f.byteOrder = le ? 'little' : 'big';
            f.version = `${sec.major}.${sec.minor}`;
          }
          break;
        }
        case 1: { // IDB
          const iface = { name: '', description: '', linktype: dv.getUint16(body, le), snaplen: dv.getUint32(body + 4, le), tsresol: 6, section: sectionNo };
          let ups = 1000000n, offset = 0n;
          for (const op of readOptions(b, dv, body + 8, end, le)) {
            switch (op.code) {
              case 1: iface.comment = str(b, op); break;
              case 2: iface.name = str(b, op); break;
              case 3: iface.description = str(b, op); break;
              case 9: {
                const r = b[op.o];
                if (r & 0x80) { ups = 1n << BigInt(r & 0x7f); iface.tsresol = Math.ceil((r & 0x7f) * Math.log10(2)); iface.tsresolRaw = r; }
                else { ups = 10n ** BigInt(r); iface.tsresol = r; }
                break;
              }
              case 11: iface.filter = op.len > 1 ? str(b, { o: op.o + 1, len: op.len - 1 }) : ''; break;
              case 12: iface.os = str(b, op); break;
              case 13: iface.fcslen = b[op.o]; break;
              case 14: offset = dv.getBigInt64(op.o, le); iface.tsoffset = Number(offset); break;
              case 8: iface.speed = Number(dv.getBigUint64(op.o, le)); break;
              case 6: if (op.len === 6) iface.mac = Array.from(b.subarray(op.o, op.o + 6), (x) => x.toString(16).padStart(2, '0')).join(':'); break;
              case 4: if (op.len === 8) (iface.ipv4 ||= []).push(Array.from(b.subarray(op.o, op.o + 4)).join('.')); break;
              case 7: if (op.len === 8) iface.eui = Array.from(b.subarray(op.o, op.o + 8), (x) => x.toString(16).padStart(2, '0')).join(':'); break;
              case 10: iface.tzone = dv.getInt32(op.o, le); break;
              case 15: iface.hardware = str(b, op); break;
              case 16: iface.txspeed = Number(dv.getBigUint64(op.o, le)); break;
              case 17: iface.rxspeed = Number(dv.getBigUint64(op.o, le)); break;
            }
          }
          ifaceInfo.push({ ups, offset });
          f.interfaces.push(iface);
          break;
        }
        case 6: case 2: case 3: { // EPB, obsolete PB, SPB
          let id, tsh, tsl, caplen, len, dataOff, optOff, flags;
          if (type === 3) {
            id = 0; tsh = 0; tsl = 0;
            len = dv.getUint32(body, le);
            const snap = f.interfaces[sectionBase]?.snaplen || 0;
            caplen = Math.min(len, end - body - 4, snap > 0 ? snap : Infinity);
            dataOff = body + 4; optOff = end;
          } else if (type === 2) {
            id = dv.getUint16(body, le);
            tsh = dv.getUint32(body + 4, le); tsl = dv.getUint32(body + 8, le);
            caplen = dv.getUint32(body + 12, le); len = dv.getUint32(body + 16, le);
            dataOff = body + 20; optOff = dataOff + ((caplen + 3) & ~3);
          } else {
            id = dv.getUint32(body, le);
            tsh = dv.getUint32(body + 4, le); tsl = dv.getUint32(body + 8, le);
            caplen = dv.getUint32(body + 12, le); len = dv.getUint32(body + 16, le);
            dataOff = body + 20; optOff = dataOff + ((caplen + 3) & ~3);
          }
          if (dataOff + caplen > end) { trunc(f, `The capture file appears to be damaged or corrupt: packet ${frames.length + 1} is longer than its block.`); o = b.length; continue; }
          const gi = sectionBase + id;
          if (gi >= f.interfaces.length) { trunc(f, `The capture file appears to be damaged or corrupt: packet ${frames.length + 1} refers to unknown interface ${id}.`); o = b.length; continue; }
          const info = ifaceInfo[id];
          let sec = 0, nsec = 0;
          if (type !== 3) {
            const ts = (BigInt(tsh) << 32n) | BigInt(tsl);
            const s = ts / info.ups;
            sec = Number(s + info.offset);
            nsec = Number(((ts - s * info.ups) * 1000000000n) / info.ups);
          }
          const fr = {
            no: frames.length + 1, sec, nsec, caplen, len: Math.max(len, caplen),
            data: b.subarray(dataOff, dataOff + caplen),
            linktype: f.interfaces[gi].linktype, iface: gi, comment: null,
          };
          if (sectionNo) fr.section = sectionNo;
          for (const op of readOptions(b, dv, optOff, end, le)) {
            if (op.code === 1) fr.comment = fr.comment == null ? str(b, op) : fr.comment + '\n' + str(b, op);
            else if (op.code === 2 && op.len >= 4) { flags = dv.getUint32(op.o, le); fr.flags = flags; }
            else if (op.code === 4 && op.len === 8) fr.dropCount = Number(dv.getBigUint64(op.o, le));
            else if (op.code === 5 && op.len === 8) fr.packetId = dv.getBigUint64(op.o, le);
            else if (op.code === 6 && op.len === 4) fr.queue = dv.getUint32(op.o, le);
            else if (op.code === 3 && op.len > 1) fr.hash = { algo: b[op.o], value: b.slice(op.o + 1, op.o + op.len) };
          }
          frames.push(fr);
          break;
        }
        case 4: { // NRB
          let p = body;
          while (p + 4 <= end) {
            const rt = dv.getUint16(p, le), rl = dv.getUint16(p + 2, le);
            if (rt === 0) break;
            const v = p + 4;
            if (v + rl > end) break;
            const al = rt === 1 ? 4 : rt === 2 ? 16 : 0;
            if (al && rl > al) {
              const addr = rt === 1 ? Array.from(b.subarray(v, v + 4)).join('.') : ip6str(b, v);
              const names = TD.decode(b.subarray(v + al, v + rl)).split('\0').filter(Boolean);
              f.names.push({ addr, names });
            }
            p = v + ((rl + 3) & ~3);
          }
          break;
        }
        case 5: { // ISB
          const id = dv.getUint32(body, le);
          const st = { iface: sectionBase + id };
          for (const op of readOptions(b, dv, body + 12, end, le)) {
            const key = { 1: 'comment', 2: 'starttime', 3: 'endtime', 4: 'ifrecv', 5: 'ifdrop', 6: 'filteraccept', 7: 'osdrop', 8: 'usrdeliv' }[op.code];
            if (!key) continue;
            if (op.code === 1) st.comment = str(b, op);
            else if (op.code === 2 || op.code === 3) {
              const info = ifaceInfo[id];
              const ts = (BigInt(dv.getUint32(op.o, le)) << 32n) | BigInt(dv.getUint32(op.o + 4, le));
              st[key] = info ? Number(ts * 1000000n / info.ups) / 1e6 : 0;
            } else st[key] = Number(dv.getBigUint64(op.o, le));
          }
          f.interfaceStats.push(st);
          break;
        }
        default: break; // DSB, custom and unknown blocks are skipped
      }
    } catch (e) {
      if (!(e instanceof RangeError)) throw e;
      trunc(f, `The capture file appears to be damaged or corrupt: block at offset ${o} is malformed.`);
      break;
    }
    o += blen;
  }
  if (!f.sections.length) throw new Error('The file is not a valid pcapng file.');
  return f;
}

function ip6str(b, o) {
  const g = [];
  for (let i = 0; i < 8; i++) g.push(((b[o + 2 * i] << 8) | b[o + 2 * i + 1]).toString(16));
  return g.join(':').replace(/(^|:)0(:0)+(:|$)/, '::').replace(/:::+/, '::');
}

class Writer {
  constructor() { this.buf = new Uint8Array(1 << 16); this.dv = new DataView(this.buf.buffer); this.o = 0; }
  ensure(n) {
    if (this.o + n <= this.buf.length) return;
    let s = this.buf.length * 2;
    while (s < this.o + n) s *= 2;
    const nb = new Uint8Array(s); nb.set(this.buf.subarray(0, this.o));
    this.buf = nb; this.dv = new DataView(nb.buffer);
  }
  u16(v) { this.ensure(2); this.dv.setUint16(this.o, v, true); this.o += 2; }
  u32(v) { this.ensure(4); this.dv.setUint32(this.o, v >>> 0, true); this.o += 4; }
  bytes(a) { this.ensure(a.length + 3); this.buf.set(a, this.o); this.o += a.length; while (this.o & 3) this.buf[this.o++] = 0; }
  opt(code, data) { this.u16(code); this.u16(data.length); this.bytes(data); }
  optStr(code, s) { if (s != null && s !== '') this.opt(code, TE.encode(String(s))); }
  begin(type) { this.u32(type); const at = this.o; this.u32(0); return at - 4; }
  end(start) {
    const len = this.o - start + 4;
    this.dv.setUint32(start + 4, len, true);
    this.u32(len);
  }
  result() { return this.buf.slice(0, this.o); }
}

export function writePcapng(file, frames) {
  frames = frames || file.frames;
  const w = new Writer();
  // SHB
  let s = w.begin(NG_SHB);
  w.u32(NG_MAGIC); w.u16(1); w.u16(0); w.u32(0xffffffff); w.u32(0xffffffff);
  const sec = file.section || {};
  if (sec.comment) for (const c of String(sec.comment).split('\n')) w.optStr(1, c);
  w.optStr(2, sec.hardware); w.optStr(3, sec.os); w.optStr(4, sec.application || 'MyNetManager');
  w.u32(0); // opt_endofopt
  w.end(s);
  let ifaces = file.interfaces && file.interfaces.length ? file.interfaces : [];
  // Frames whose interface is missing (e.g. live/demo captures) get a synthetic interface per linktype.
  const ifMap = new Map();
  const extra = [];
  for (const fr of frames) {
    if (fr.iface != null && ifaces[fr.iface] && ifaces[fr.iface].linktype === fr.linktype) continue;
    if (!ifMap.has(fr.linktype)) { ifMap.set(fr.linktype, ifaces.length + extra.length); extra.push({ name: '', description: '', linktype: fr.linktype, snaplen: 262144, tsresol: 6 }); }
  }
  ifaces = ifaces.concat(extra);
  const res = [];
  for (const ifc of ifaces) {
    s = w.begin(1);
    w.u16(ifc.linktype); w.u16(0); w.u32(ifc.snaplen || 0);
    if (ifc.comment) w.optStr(1, ifc.comment);
    w.optStr(2, ifc.name); w.optStr(3, ifc.description);
    const r = ifc.tsresolRaw != null ? ifc.tsresolRaw : (ifc.tsresol === 9 ? 9 : 6);
    if (r !== 6) w.opt(9, new Uint8Array([r]));
    if (ifc.filter) { const fb = TE.encode(ifc.filter); const ob = new Uint8Array(fb.length + 1); ob.set(fb, 1); w.opt(11, ob); }
    w.optStr(12, ifc.os);
    if (ifc.fcslen != null) w.opt(13, new Uint8Array([ifc.fcslen]));
    if (ifc.tsoffset) { const ob = new Uint8Array(8); new DataView(ob.buffer).setBigInt64(0, BigInt(ifc.tsoffset), true); w.opt(14, ob); }
    w.u32(0);
    w.end(s);
    res.push(r & 0x80 ? 1n << BigInt(r & 0x7f) : 10n ** BigInt(r));
  }
  const offs = ifaces.map((i) => BigInt(i.tsoffset || 0));
  if (file.names && file.names.length) {
    s = w.begin(4);
    for (const n of file.names) {
      const v4 = /^\d+\.\d+\.\d+\.\d+$/.test(n.addr);
      if (!v4) continue; // IPv6 NRB entries are rare; keep the writer simple
      const nb = TE.encode(n.names.join('\0') + '\0');
      const rec = new Uint8Array(4 + nb.length);
      rec.set(n.addr.split('.').map(Number)); rec.set(nb, 4);
      w.u16(1); w.u16(rec.length); w.bytes(rec);
    }
    w.u32(0);
    w.end(s);
  }
  for (const fr of frames) {
    let id = fr.iface;
    if (id == null || !file.interfaces?.[id] || file.interfaces[id].linktype !== fr.linktype) id = ifMap.get(fr.linktype);
    const ups = res[id];
    const ts = (BigInt(fr.sec) - offs[id]) * ups + (BigInt(fr.nsec) * ups) / 1000000000n;
    s = w.begin(6);
    w.u32(id); w.u32(Number(ts >> 32n)); w.u32(Number(ts & 0xffffffffn));
    w.u32(fr.data.length); w.u32(Math.max(fr.len, fr.data.length));
    w.bytes(fr.data);
    let any = false;
    if (fr.comment) { for (const c of String(fr.comment).split('\n')) w.optStr(1, c); any = true; }
    if (fr.flags != null) { const ob = new Uint8Array(4); new DataView(ob.buffer).setUint32(0, fr.flags, true); w.opt(2, ob); any = true; }
    if (any) w.u32(0);
    w.end(s);
  }
  return w.result();
}
