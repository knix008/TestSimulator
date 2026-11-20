// Statistics menu (Wireshark "Statistics" dialogs). Pure functions; every entry point takes
// (frames, summaries, getDissection, opts) where
//   frames:      Frame[] in capture order (ARCHITECTURE.md)
//   summaries:   Summary[] parallel to frames (index i ↔ frames[i]); may also be indexed by frame number
//   getDissection(frame) → Dissection  (the UI caches; only called when a statistic needs the tree)
//   opts.filter: display filter text limiting the packets ("Display filter" box of the dialogs)
//   opts.only:   Set/array of frame numbers to use (e.g. the displayed packets)
//   opts.fields: FIELDS registry (for filters, value-string names); opts.protocols: PROTOCOLS (names)
//
// Return shapes (all plain data):
//
// captureProperties → { file: {name, format, size, encapsulation, snaplen},
//     time: {first, last, elapsed}  (first/last: {sec, nsec}, elapsed: seconds),
//     capture: {hardware, os, application, comment},
//     interfaces: [{index, name, description, filter, linktype, encapsulation, snaplen, packets, bytes}],
//     statistics: [{key, label, captured, displayed, displayedPercent, marked, markedPercent}]
//        keys: packets, timeSpan, avgPps, avgSize, bytes, avgBytesPerSec, avgBitsPerSec
//     comments: [{frame, comment}] }
// protocolHierarchy → root { abbrev:'frame', name, packets, bytes, percentPackets, percentBytes,
//     endPackets, endBytes, bps, children: [same] }   (sorted like Wireshark: first seen order)
// conversations → { kind, columns, rows: [{ addrA, portA, addrB, portB, packets, bytes, stream,
//     packetsAB, bytesAB, packetsBA, bytesBA, relStart, duration, bpsAB, bpsBA, filter }] }
// endpoints → { kind, columns, rows: [{ addr, port, packets, bytes, txPackets, txBytes, rxPackets, rxBytes, filter }] }
// ioGraph → { interval, start (abs seconds), buckets, times: [s from start], series: [{ name, calc, values: [] }] }
// packetLengths, httpPacketCounter, httpRequests, httpLoad, dnsStats, ipStats, portTypes →
//     stats tree { name, count, percent, rate, burstRate, burstStart, avg?, min?, max?, children: [...] }
//     (Wireshark stats_tree columns: Topic/Item, Count, Average, Min Val, Max Val, Rate (ms), Percent, Burst Rate, Burst Start)
// expertInfo → { items: [{ severity, group, protocol, summary, count, frames: [no] }], bySeverity: {error, warn, note, chat}, total }
// flowGraph → { nodes: [address], rows: [{ frame, time, src, dst, srcport, dstport, label, comment, protocol }] }
// tcpStreamGraph → { stream, type, direction: {src, srcport, dst, dstport}, xLabel, yLabel,
//     series: [{ name, kind: 'points'|'line'|'bars'|'segments', points: [{x, y, y2?, frame}] }] }
import { compileFilter } from '../filter/index.js';

// ------------------------------------------------------------------------------------------------
// helpers

const tsec = (f) => f.sec + f.nsec / 1e9;

function summaryAt(summaries, i, frame) {
  if (!summaries) return null;
  if (typeof summaries === 'function') return summaries(frame);
  const s = summaries[i];
  if (s && s.no === frame.no) return s;
  const t = summaries[frame.no];
  return t && t.no === frame.no ? t : s || null;
}

/**
 * Iterate the frames the statistic should use. Calls fn(frame, summary, getD) where getD() returns the
 * dissection lazily (cached for this frame).
 */
function each(frames, summaries, getDissection, opts, fn) {
  const only = opts && opts.only ? (opts.only instanceof Set ? opts.only : new Set(opts.only)) : null;
  let test = null;
  if (opts && opts.filter && String(opts.filter).trim()) {
    const c = compileFilter(opts.filter, { fields: opts.fields });
    if (!c.ok) throw new Error(c.error);
    test = c.test;
  }
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    if (only && !only.has(f.no)) continue;
    const s = summaryAt(summaries, i, f);
    let d;
    const getD = () => (d === undefined ? (d = getDissection ? getDissection(f) : null) : d);
    if (test && !test(getD())) continue;
    fn(f, s, getD);
  }
}

function firstTime(frames, opts) {
  if (opts && opts.firstTime != null) return opts.firstTime;
  return frames.length ? tsec(frames[0]) : 0;
}

function protoName(abbrev, opts) {
  const list = opts && opts.protocols;
  if (list) {
    const p = Array.isArray(list) ? list.find((x) => x.abbrev === abbrev) : list.get && list.get(abbrev);
    if (p) return p.name;
  }
  const f = opts && opts.fields && opts.fields.get(abbrev);
  return f && f.name ? f.name : abbrev;
}
function protoShort(abbrev, opts) {
  const list = opts && opts.protocols;
  if (list && Array.isArray(list)) {
    const p = list.find((x) => x.abbrev === abbrev);
    if (p) return p.short;
  }
  return abbrev.toUpperCase();
}

/**
 * Top-level protocol nodes in order, without 'frame'. Wireshark's taps and protocol hierarchy walk
 * these; the IP header quoted inside an ICMP error is not a layer of the packet (Wireshark nests it
 * under ICMP and does not tap it), so the chain stops after icmp/icmpv6.
 */
export function protocolChain(d) {
  const out = [];
  if (!d || !d.tree) return out;
  for (const n of d.tree) {
    if (n.type !== 'protocol' || !n.abbrev || n.abbrev === 'frame') continue;
    out.push(n);
    if (n.abbrev === 'icmp' || n.abbrev === 'icmpv6') break;
  }
  return out;
}
function topLayers(d, abbrev) {
  return protocolChain(d).filter((n) => n.abbrev === abbrev);
}
/** Find a field inside a protocol node without descending into nested protocols. */
function child(node, abbrev) {
  const kids = node.children;
  if (!kids) return undefined;
  for (const k of kids) if (k.abbrev === abbrev) return k;
  for (const k of kids) {
    if (k.type === 'protocol' || !k.children) continue;
    const r = child(k, abbrev);
    if (r) return r;
  }
  return undefined;
}
const childValue = (node, abbrev) => { const c = child(node, abbrev); return c ? c.value : undefined; };
function fieldValues(d, abbrev) {
  const ns = d && d.fields ? d.fields.get(abbrev) : undefined;
  return ns ? ns.map((n) => n.value) : [];
}
const first = (d, abbrev) => { const v = fieldValues(d, abbrev); return v.length ? v[0] : undefined; };

const LINKTYPES = {
  0: 'NULL/Loopback', 1: 'Ethernet', 9: 'PPP', 12: 'Raw IP', 101: 'Raw IP', 105: 'IEEE 802.11 Wireless LAN', 108: 'OpenBSD loopback',
  113: 'Linux cooked-mode capture v1', 127: 'IEEE 802.11 plus radiotap radio header', 228: 'Raw IPv4', 229: 'Raw IPv6',
  276: 'Linux cooked-mode capture v2', 50: 'PPP', 51: 'PPP',
};
export const linktypeName = (lt) => LINKTYPES[lt] || `Linktype ${lt}`;

// ------------------------------------------------------------------------------------------------
// Stats tree (Wireshark stats_tree: count, percent of parent, rate per ms, burst, avg/min/max)

const BURST_MS = 5; // Wireshark's default burst interval

class TreeNode {
  constructor(name) {
    this.name = name;
    this.count = 0;
    this.kids = new Map();
    this.times = [];
    this.sum = 0; this.min = Infinity; this.max = -Infinity; this.nvals = 0;
  }
  add(name, t, value) {
    let k = this.kids.get(name);
    if (!k) this.kids.set(name, k = new TreeNode(name));
    k.tick(t, value);
    return k;
  }
  tick(t, value) {
    this.count++;
    if (t !== undefined) this.times.push(t);
    if (value !== undefined && value !== null && !Number.isNaN(Number(value))) {
      const v = Number(value);
      this.sum += v; this.nvals++;
      if (v < this.min) this.min = v;
      if (v > this.max) this.max = v;
    }
    return this;
  }
  finish(parentCount, durationMs, t0, sortBy) {
    const out = { name: this.name, count: this.count };
    out.percent = parentCount ? (this.count / parentCount) * 100 : null;
    out.rate = durationMs > 0 ? this.count / durationMs : null;
    if (this.nvals) { out.avg = this.sum / this.nvals; out.min = this.min; out.max = this.max; }
    const b = burst(this.times);
    out.burstRate = b.rate;
    out.burstStart = b.start === null ? null : b.start - t0;
    let kids = [...this.kids.values()];
    if (sortBy === 'count') kids.sort((a, c) => c.count - a.count || (a.name < c.name ? -1 : 1));
    out.children = kids.map((k) => k.finish(this.count, durationMs, t0, sortBy));
    return out;
  }
}

function burst(times) {
  if (!times.length) return { rate: null, start: null };
  const ts = times.length > 1 && times.some((t, i) => i && t < times[i - 1]) ? [...times].sort((a, b) => a - b) : times;
  let best = 0, start = ts[0], j = 0;
  for (let i = 0; i < ts.length; i++) {
    while (ts[i] - ts[j] >= BURST_MS / 1000) j++;
    const n = i - j + 1;
    if (n > best) { best = n; start = ts[j]; }
  }
  return { rate: best / BURST_MS, start };
}

function finishTree(root, frames, opts, sortBy) {
  const t0 = firstTime(frames, opts);
  const dur = frames.length > 1 ? (tsec(frames[frames.length - 1]) - tsec(frames[0])) * 1000 : 0;
  return root.finish(0, dur, t0, sortBy);
}

// ------------------------------------------------------------------------------------------------
// Capture File Properties

export function captureProperties(frames, summaries, getDissection, opts = {}) {
  const file = opts.file || {};
  const ifaces = (file.interfaces || []).map((it, index) => ({
    index, name: it.name || '', description: it.description || '', filter: it.filter || '', os: it.os || '',
    linktype: it.linktype, encapsulation: linktypeName(it.linktype), snaplen: it.snaplen, packets: 0, bytes: 0,
    dropped: it.dropped ?? null,
  }));
  const displayed = opts.displayed ? (opts.displayed instanceof Set ? opts.displayed : new Set(opts.displayed)) : null;
  const marked = opts.marked ? (opts.marked instanceof Set ? opts.marked : new Set(opts.marked)) : null;
  const acc = () => ({ packets: 0, bytes: 0, first: null, last: null });
  const all = acc(), disp = acc(), mark = acc();
  const add = (a, f) => {
    a.packets++; a.bytes += f.len;
    const t = tsec(f);
    if (a.first === null || t < a.first) a.first = t;
    if (a.last === null || t > a.last) a.last = t;
  };
  const comments = [];
  let firstF = null, lastF = null;
  for (const f of frames) {
    add(all, f);
    if (!firstF || tsec(f) < tsec(firstF)) firstF = f;
    if (!lastF || tsec(f) > tsec(lastF)) lastF = f;
    if (displayed && displayed.has(f.no)) add(disp, f);
    if (marked && marked.has(f.no)) add(mark, f);
    const it = ifaces[f.iface || 0];
    if (it) { it.packets++; it.bytes += f.len; }
    if (f.comment) comments.push({ frame: f.no, comment: f.comment });
  }
  const derive = (a) => {
    const span = a.packets > 1 ? a.last - a.first : 0;
    return {
      packets: a.packets, timeSpan: a.packets ? span : null,
      avgPps: span > 0 ? a.packets / span : null,
      avgSize: a.packets ? a.bytes / a.packets : null,
      bytes: a.bytes,
      avgBytesPerSec: span > 0 ? a.bytes / span : null,
      avgBitsPerSec: span > 0 ? (a.bytes * 8) / span : null,
    };
  };
  const c = derive(all), d = displayed ? derive(disp) : null, m = marked ? derive(mark) : null;
  const LABELS = {
    packets: 'Packets', timeSpan: 'Time span, s', avgPps: 'Average pps', avgSize: 'Average packet size, B',
    bytes: 'Bytes', avgBytesPerSec: 'Average bytes/s', avgBitsPerSec: 'Average bits/s',
  };
  const pct = (x, y) => (x != null && y ? (x / y) * 100 : null);
  const statistics = Object.keys(LABELS).map((key) => ({
    key, label: LABELS[key], captured: c[key],
    displayed: d ? d[key] : null, displayedPercent: d && (key === 'packets' || key === 'bytes') ? pct(d[key], c[key]) : null,
    marked: m ? m[key] : null, markedPercent: m && (key === 'packets' || key === 'bytes') ? pct(m[key], c[key]) : null,
  }));
  const lts = new Set(frames.map((f) => f.linktype));
  const snaplens = (file.interfaces || []).map((i) => i.snaplen).filter((x) => x != null);
  return {
    file: {
      name: file.name || '', format: file.format === 'pcap' ? 'Wireshark/tcpdump/... - pcap' : file.format === 'pcapng' ? 'Wireshark/... - pcapng' : (file.format || ''),
      size: file.size ?? null,
      encapsulation: lts.size === 1 ? linktypeName([...lts][0]) : lts.size ? 'Per packet' : '',
      snaplen: snaplens.length ? Math.max(...snaplens) : null,
    },
    time: {
      first: firstF ? { sec: firstF.sec, nsec: firstF.nsec } : null,
      last: lastF ? { sec: lastF.sec, nsec: lastF.nsec } : null,
      elapsed: firstF ? tsec(lastF) - tsec(firstF) : null,
    },
    capture: {
      hardware: file.section?.hardware || '', os: file.section?.os || '', application: file.section?.application || '',
      comment: file.section?.comment || '',
    },
    interfaces: ifaces,
    statistics,
    comments,
  };
}

// ------------------------------------------------------------------------------------------------
// Protocol Hierarchy

// Pseudo-protocols that appear in frame.protocols but not as tree items in Wireshark's PHS.
const PHS_SKIP = new Set(['ethertype', 'frame']);

export function protocolHierarchy(frames, summaries, getDissection, opts = {}) {
  const mk = (abbrev) => ({ abbrev, packets: 0, bytes: 0, endPackets: 0, endBytes: 0, kids: new Map() });
  const root = mk('frame');
  let tFirst = null, tLast = null;
  each(frames, summaries, getDissection, opts, (f, s, getD) => {
    const t = tsec(f);
    if (tFirst === null || t < tFirst) tFirst = t;
    if (tLast === null || t > tLast) tLast = t;
    // Wireshark walks the top-level protocol items of the tree (frame.protocols also lists nested
    // ones such as x509 inside TLS); summaries are the fallback when no dissection is available.
    let layers;
    const d = getDissection && !opts.fast ? getD() : null;
    if (d && d.tree) layers = protocolChain(d).map((n) => n.abbrev);
    else if (s && s.layers != null) layers = String(s.layers).split(':');
    else layers = [];
    root.packets++; root.bytes += f.len;
    let node = root;
    for (const l of layers) {
      if (!l || PHS_SKIP.has(l)) continue;
      let k = node.kids.get(l);
      if (!k) node.kids.set(l, k = mk(l));
      k.packets++; k.bytes += f.len;
      node = k;
    }
    node.endPackets++; node.endBytes += f.len;
  });
  const span = tFirst !== null ? tLast - tFirst : 0;
  const total = root.packets, totalBytes = root.bytes;
  const fin = (n) => ({
    abbrev: n.abbrev, name: protoName(n.abbrev, opts),
    packets: n.packets, bytes: n.bytes,
    percentPackets: total ? (n.packets / total) * 100 : 0,
    percentBytes: totalBytes ? (n.bytes / totalBytes) * 100 : 0,
    endPackets: n.endPackets, endBytes: n.endBytes,
    bps: span > 0 ? (n.bytes * 8) / span : null,
    endBps: span > 0 ? (n.endBytes * 8) / span : null,
    children: [...n.kids.values()].map(fin),
  });
  return fin(root);
}

/** tshark -z io,phs text layout (for export and tests). */
export function formatProtocolHierarchy(tree, filter = '') {
  const lines = ['===================================================================', 'Protocol Hierarchy Statistics', `Filter: ${filter}`, ''];
  const walk = (n, depth) => {
    const name = '  '.repeat(depth) + n.abbrev;
    lines.push(`${name.padEnd(41)}frames:${n.packets} bytes:${n.bytes}`);
    for (const c of n.children) walk(c, depth + 1);
  };
  walk(tree, 0);
  lines.push('===================================================================');
  return lines.join('\n');
}

// ------------------------------------------------------------------------------------------------
// Conversations and endpoints

export const CONVERSATION_KINDS = ['eth', 'ipv4', 'ipv6', 'tcp', 'udp', 'sctp', 'bluetooth'];

/**
 * Address tuples a packet contributes to a conversation kind (one per protocol layer, like Wireshark's
 * taps): [{ src, dst, sport?, dport?, stream? }].
 */
function tuples(kind, f, s, getD) {
  const out = [];
  const d = getD();
  if (d && d.tree) {
    switch (kind) {
      case 'eth':
        for (const n of topLayers(d, 'eth')) {
          const a = childValue(n, 'eth.src'), b = childValue(n, 'eth.dst');
          if (a !== undefined && b !== undefined) out.push({ src: String(a), dst: String(b), stream: childValue(n, 'eth.stream') });
        }
        break;
      case 'bluetooth':
        // host ↔ controller for HCI commands and events, adapter ↔ device (BD_ADDR) for ACL data, as Wireshark's tap.
        for (const n of topLayers(d, 'bluetooth')) {
          const a = childValue(n, 'bluetooth.src') ?? childValue(n, 'bluetooth.src_str');
          const b = childValue(n, 'bluetooth.dst') ?? childValue(n, 'bluetooth.dst_str');
          if (a !== undefined && b !== undefined) out.push({ src: String(a), dst: String(b) });
        }
        break;
      case 'ipv4': case 'ipv6': {
        const p = kind === 'ipv4' ? 'ip' : 'ipv6';
        for (const n of topLayers(d, p)) {
          const a = childValue(n, p + '.src'), b = childValue(n, p + '.dst');
          if (a !== undefined && b !== undefined) out.push({ src: String(a), dst: String(b), stream: childValue(n, p + '.stream') });
        }
        break;
      }
      case 'tcp': case 'udp': case 'sctp': {
        // addresses: the closest IP layer before each transport layer
        let net = null;
        for (const n of protocolChain(d)) {
          if (n.abbrev === 'ip' || n.abbrev === 'ipv6') {
            const a = childValue(n, n.abbrev + '.src'), b = childValue(n, n.abbrev + '.dst');
            if (a !== undefined) net = [String(a), String(b)];
          } else if (n.abbrev === kind) {
            const sp = childValue(n, kind + '.srcport'), dp = childValue(n, kind + '.dstport');
            if (sp === undefined || dp === undefined) continue;
            const addr = net || [d.columns?.netSrc || d.columns?.src || '', d.columns?.netDst || d.columns?.dst || ''];
            out.push({ src: addr[0], dst: addr[1], sport: Number(sp), dport: Number(dp), stream: childValue(n, kind + '.stream') });
          }
        }
        break;
      }
    }
    return out;
  }
  // summary fallback (no dissection available)
  if (!s) return out;
  const layers = String(s.layers || '').split(':');
  if (kind === 'tcp' || kind === 'udp' || kind === 'sctp') {
    if (layers.includes(kind) && s.srcport != null) out.push({ src: s.src, dst: s.dst, sport: s.srcport, dport: s.dstport, stream: kind === 'tcp' ? s.tcpStream : kind === 'udp' ? s.udpStream : undefined });
  } else if (kind === 'ipv4' && layers.includes('ip')) out.push({ src: s.src, dst: s.dst });
  else if (kind === 'ipv6' && layers.includes('ipv6')) out.push({ src: s.src, dst: s.dst });
  return out;
}

const hasPorts = (kind) => kind === 'tcp' || kind === 'udp' || kind === 'sctp';
const addrField = { eth: 'eth.addr', ipv4: 'ip.addr', ipv6: 'ipv6.addr' };

function convFilter(kind, r) {
  if (kind === 'bluetooth') {
    const one = (a) => (/^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/i.test(a) ? `bluetooth.addr==${a}` : `bluetooth.addr_str=="${a}"`);
    return `${one(r.addrA)} && ${one(r.addrB)}`;
  }
  if (!hasPorts(kind)) return `${addrField[kind]}==${r.addrA} && ${addrField[kind]}==${r.addrB}`;
  const net = String(r.addrA).includes(':') ? 'ipv6' : 'ip';
  return `${net}.addr==${r.addrA} && ${kind}.port==${r.portA} && ${net}.addr==${r.addrB} && ${kind}.port==${r.portB}`;
}

/**
 * Conversations (Statistics → Conversations). kind: 'eth'|'ipv4'|'ipv6'|'tcp'|'udp'|'sctp'.
 * Address A is the source of the first packet seen; bytes are frame lengths.
 */
export function conversations(frames, summaries, getDissection, opts = {}) {
  if (typeof opts === 'string') opts = { kind: opts };
  const kind = normKind(opts.kind || 'ipv4');
  const t0 = firstTime(frames, opts);
  const map = new Map();
  const rows = [];
  each(frames, summaries, getDissection, opts, (f, s, getD) => {
    const t = tsec(f);
    for (const u of tuples(kind, f, s, getD)) {
      const fwd = hasPorts(kind) ? `${u.src}|${u.sport}|${u.dst}|${u.dport}` : `${u.src}|${u.dst}`;
      const rev = hasPorts(kind) ? `${u.dst}|${u.dport}|${u.src}|${u.sport}` : `${u.dst}|${u.src}`;
      let r = map.get(fwd);
      let ab = true;
      if (!r) { r = map.get(rev); if (r) ab = false; }
      if (!r) {
        r = {
          addrA: u.src, portA: hasPorts(kind) ? u.sport : null, addrB: u.dst, portB: hasPorts(kind) ? u.dport : null,
          packets: 0, bytes: 0, stream: u.stream ?? null, packetsAB: 0, bytesAB: 0, packetsBA: 0, bytesBA: 0,
          start: t, end: t,
        };
        map.set(fwd, r);
        rows.push(r);
      }
      r.packets++; r.bytes += f.len;
      if (ab) { r.packetsAB++; r.bytesAB += f.len; } else { r.packetsBA++; r.bytesBA += f.len; }
      if (t < r.start) r.start = t;
      if (t > r.end) r.end = t;
    }
  });
  const out = rows.map((r) => {
    const duration = r.end - r.start;
    const row = {
      addrA: r.addrA, portA: r.portA, addrB: r.addrB, portB: r.portB, packets: r.packets, bytes: r.bytes, stream: r.stream,
      packetsAB: r.packetsAB, bytesAB: r.bytesAB, packetsBA: r.packetsBA, bytesBA: r.bytesBA,
      relStart: r.start - t0, duration,
      bpsAB: duration > 0 ? (r.bytesAB * 8) / duration : null,
      bpsBA: duration > 0 ? (r.bytesBA * 8) / duration : null,
    };
    row.filter = convFilter(kind, row);
    return row;
  });
  const columns = ['Address A', ...(hasPorts(kind) ? ['Port A'] : []), 'Address B', ...(hasPorts(kind) ? ['Port B'] : []),
    'Packets', 'Bytes', ...(kind === 'tcp' || kind === 'udp' ? ['Stream ID'] : []), 'Packets A → B', 'Bytes A → B',
    'Packets B → A', 'Bytes B → A', 'Rel Start', 'Duration', 'Bits/s A → B', 'Bits/s B → A'];
  return { kind, columns, rows: out };
}

/** Endpoints (Statistics → Endpoints). Tx = sent by the endpoint, Rx = received. */
export function endpoints(frames, summaries, getDissection, opts = {}) {
  if (typeof opts === 'string') opts = { kind: opts };
  const kind = normKind(opts.kind || 'ipv4');
  const map = new Map();
  const rows = [];
  const get = (addr, port) => {
    const k = hasPorts(kind) ? `${addr}|${port}` : addr;
    let r = map.get(k);
    if (!r) {
      r = { addr, port: hasPorts(kind) ? port : null, packets: 0, bytes: 0, txPackets: 0, txBytes: 0, rxPackets: 0, rxBytes: 0 };
      map.set(k, r);
      rows.push(r);
    }
    return r;
  };
  each(frames, summaries, getDissection, opts, (f, s, getD) => {
    for (const u of tuples(kind, f, s, getD)) {
      const a = get(u.src, u.sport), b = get(u.dst, u.dport);
      a.packets++; a.bytes += f.len; a.txPackets++; a.txBytes += f.len;
      if (b !== a) { b.packets++; b.bytes += f.len; }
      b.rxPackets++; b.rxBytes += f.len;
    }
  });
  for (const r of rows) {
    r.filter = hasPorts(kind)
      ? `${String(r.addr).includes(':') ? 'ipv6' : 'ip'}.addr==${r.addr} && ${kind}.port==${r.port}`
      : `${addrField[kind]}==${r.addr}`;
  }
  const columns = ['Address', ...(hasPorts(kind) ? ['Port'] : []), 'Packets', 'Bytes', 'Tx Packets', 'Tx Bytes', 'Rx Packets', 'Rx Bytes'];
  return { kind, columns, rows };
}

function normKind(k) {
  if (k === 'ip' || k === 'ipv4') return 'ipv4';
  if (!CONVERSATION_KINDS.includes(k)) throw new Error(`unknown conversation type "${k}"`);
  return k;
}

// ------------------------------------------------------------------------------------------------
// I/O Graph

/**
 * opts: { interval: seconds (default 1), start?: abs seconds (default first frame), end?,
 *         series: [{ name?, filter?, calc: 'packets'|'bytes'|'bits'|'sum'|'count'|'min'|'max'|'avg'|'load', field? }] }
 * 'count' counts field occurrences (Wireshark COUNT FIELDS); sum/min/max/avg use every occurrence of `field`;
 * 'load' is Wireshark's LOAD (sum of a relative-time field per interval / interval).
 */
export function ioGraph(frames, summaries, getDissection, opts = {}) {
  const interval = opts.interval > 0 ? opts.interval : 1;
  const series = (opts.series && opts.series.length ? opts.series : [{ name: 'All Packets', calc: 'packets' }]).map((sp, i) => {
    const c = sp.filter && String(sp.filter).trim() ? compileFilter(sp.filter, { fields: opts.fields }) : null;
    if (c && !c.ok) throw new Error(`${sp.name || 'Series ' + (i + 1)}: ${c.error}`);
    const calc = sp.calc || 'packets';
    if (['sum', 'min', 'max', 'avg', 'load', 'count'].includes(calc) && !sp.field) throw new Error(`${calc} needs a field`);
    return { name: sp.name || sp.filter || 'All Packets', calc, field: sp.field || null, test: c ? c.test : null, acc: [] };
  });
  const start = opts.start != null ? opts.start : firstTime(frames, opts);
  let maxIdx = -1;
  each(frames, summaries, getDissection, { ...opts, filter: opts.filter }, (f, s, getD) => {
    const t = tsec(f);
    if (opts.end != null && t > opts.end) return;
    const idx = Math.floor((t - start) / interval + 1e-9);
    if (idx < 0) return;
    if (idx > maxIdx) maxIdx = idx;
    for (const sp of series) {
      if (sp.test && !sp.test(getD())) continue;
      let a = sp.acc[idx];
      if (!a) sp.acc[idx] = a = { n: 0, bytes: 0, sum: 0, min: Infinity, max: -Infinity, cnt: 0, occ: 0 };
      a.n++; a.bytes += f.len;
      if (sp.field) {
        const d = getD();
        const ns = d && d.fields.get(sp.field);
        if (ns) for (const node of ns) {
          a.occ++; // COUNT FIELDS counts occurrences of any type
          const v = numeric(node.value);
          if (v === null) continue;
          a.cnt++; a.sum += v;
          if (v < a.min) a.min = v;
          if (v > a.max) a.max = v;
        }
      }
    }
  });
  const buckets = maxIdx + 1;
  const times = Array.from({ length: buckets }, (_, i) => i * interval);
  return {
    interval, start, buckets, times,
    series: series.map((sp) => ({
      name: sp.name, calc: sp.calc, field: sp.field,
      values: Array.from({ length: buckets }, (_, i) => {
        const a = sp.acc[i];
        switch (sp.calc) {
          case 'packets': return a ? a.n : 0;
          case 'bytes': return a ? a.bytes : 0;
          case 'bits': return a ? a.bytes * 8 : 0;
          case 'count': return a ? a.occ : 0;
          case 'sum': return a ? a.sum : 0;
          case 'min': return a && a.cnt ? a.min : null;
          case 'max': return a && a.cnt ? a.max : null;
          case 'avg': return a && a.cnt ? a.sum / a.cnt : null;
          case 'load': return a ? a.sum / interval : 0;
          default: return null;
        }
      }),
    })),
  };
}

function numeric(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v && typeof v === 'object' && 'sec' in v) return v.sec + (v.nsec || 0) / 1e9;
  return null;
}

// ------------------------------------------------------------------------------------------------
// Packet Lengths (Wireshark's plen bins)

export const PACKET_LENGTH_BINS = [[0, 19], [20, 39], [40, 79], [80, 159], [160, 319], [320, 639], [640, 1279], [1280, 2559], [2560, 5119], [5120, Infinity]];

export function packetLengths(frames, summaries, getDissection, opts = {}) {
  const root = new TreeNode('Packet Lengths');
  const bins = PACKET_LENGTH_BINS.map(([lo, hi]) => {
    const n = new TreeNode(hi === Infinity ? `${lo} and greater` : `${lo}-${hi}`);
    root.kids.set(n.name, n);
    return n;
  });
  each(frames, summaries, getDissection, opts, (f) => {
    const t = tsec(f);
    root.tick(t, f.len);
    const i = PACKET_LENGTH_BINS.findIndex(([lo, hi]) => f.len >= lo && f.len <= hi);
    bins[i].tick(t, f.len);
  });
  return finishTree(root, frames, opts);
}

// ------------------------------------------------------------------------------------------------
// HTTP

const HTTP_CLASS = { 1: '1xx: Informational', 2: '2xx: Success', 3: '3xx: Redirection', 4: '4xx: Client Error', 5: '5xx: Server Error' };

export function httpPacketCounter(frames, summaries, getDissection, opts = {}) {
  const root = new TreeNode('Total HTTP Packets');
  const req = new TreeNode('HTTP Request Packets');
  const resp = new TreeNode('HTTP Response Packets');
  const other = new TreeNode('Other HTTP Packets');
  root.kids.set(req.name, req); root.kids.set(resp.name, resp); root.kids.set(other.name, other);
  eachLayer(frames, summaries, getDissection, opts, 'http', (f, d, t) => {
    root.tick(t);
    const methods = fieldValues(d, 'http.request.method');
    const codes = fieldValues(d, 'http.response.code');
    if (methods.length) { req.tick(t); for (const m of methods) req.add(String(m), t); }
    else if (codes.length) {
      resp.tick(t);
      const phrases = fieldValues(d, 'http.response.phrase');
      codes.forEach((c, i) => {
        const cls = HTTP_CLASS[Math.floor(Number(c) / 100)] || '???: broken';
        resp.add(cls, t).add(`${c} ${phrases[i] ?? ''}`.trim(), t);
      });
    } else other.tick(t);
  });
  return finishTree(root, frames, opts);
}

export function httpRequests(frames, summaries, getDissection, opts = {}) {
  const root = new TreeNode('HTTP Requests by HTTP Host');
  eachLayer(frames, summaries, getDissection, opts, 'http', (f, d, t) => {
    const uris = fieldValues(d, 'http.request.uri');
    if (!uris.length) return;
    const hosts = fieldValues(d, 'http.host');
    uris.forEach((u, i) => {
      root.tick(t);
      root.add(String(hosts[i] ?? hosts[0] ?? ''), t).add(String(u), t);
    });
  });
  return finishTree(root, frames, opts, 'count');
}

export function httpLoad(frames, summaries, getDissection, opts = {}) {
  const root = new TreeNode('HTTP Load Distribution');
  const bySrv = root.add('HTTP Requests by Server', undefined); bySrv.count = 0;
  const byAddr = bySrv.add('HTTP Requests by Server Address', undefined); byAddr.count = 0;
  const byHost = bySrv.add('HTTP Requests by HTTP Host', undefined); byHost.count = 0;
  const respAddr = root.add('HTTP Responses by Server Address', undefined); respAddr.count = 0;
  eachLayer(frames, summaries, getDissection, opts, 'http', (f, d, t, s) => {
    const methods = fieldValues(d, 'http.request.method');
    const codes = fieldValues(d, 'http.response.code');
    const dst = d.columns?.netDst || s?.dst || '';
    const src = d.columns?.netSrc || s?.src || '';
    const hosts = fieldValues(d, 'http.host');
    for (let i = 0; i < methods.length; i++) {
      root.tick(t); bySrv.tick(t);
      byAddr.tick(t); byAddr.add(dst, t).add(String(hosts[i] ?? hosts[0] ?? ''), t);
      byHost.tick(t); byHost.add(String(hosts[i] ?? hosts[0] ?? ''), t).add(dst, t);
    }
    for (const c of codes) {
      root.tick(t); respAddr.tick(t);
      respAddr.add(src, t).add(HTTP_CLASS[Math.floor(Number(c) / 100)] || '???: broken', t);
    }
  });
  return finishTree(root, frames, opts, 'count');
}

function eachLayer(frames, summaries, getDissection, opts, proto, fn) {
  each(frames, summaries, getDissection, opts, (f, s, getD) => {
    if (s && s.layers != null && !String(s.layers).split(':').includes(proto)) return;
    const d = getD();
    if (!d || !(d.layers || []).includes(proto)) return;
    fn(f, d, tsec(f), s);
  });
}

// ------------------------------------------------------------------------------------------------
// DNS

const DNS_RCODE = { 0: 'No error', 1: 'Format error', 2: 'Server failure', 3: 'No such name', 4: 'Not implemented', 5: 'Refused', 6: 'Name exists', 7: 'RRset exists', 8: 'RRset does not exist', 9: 'Not authoritative', 10: 'Name out of zone' };
const DNS_OPCODE = { 0: 'Standard query', 1: 'Inverse query', 2: 'Server status request', 4: 'Zone change notification', 5: 'Dynamic update' };

function vsName(opts, abbrev, v, fallback) {
  const f = opts.fields && opts.fields.get(abbrev);
  if (f && f.strings && f.strings[v] !== undefined) return String(f.strings[v]);
  return fallback && fallback[v] !== undefined ? fallback[v] : `Unknown (${v})`;
}

export function dnsStats(frames, summaries, getDissection, opts = {}) {
  const root = new TreeNode('Total Packets');
  const rcode = root.add('rcode'); rcode.count = 0;
  const opc = root.add('opcodes'); opc.count = 0;
  const qr = root.add('Query/Response'); qr.count = 0;
  const qtype = root.add('Query Type'); qtype.count = 0;
  const qclass = root.add('Class'); qclass.count = 0;
  const payload = root.add('Payload size'); payload.count = 0;
  const qstats = root.add('Query Stats'); qstats.count = 0;
  const rstats = root.add('Response Stats'); rstats.count = 0;
  const svc = root.add('Service Stats'); svc.count = 0;
  const rrt = svc.add('request-response time (msec)'); rrt.count = 0;
  const unsol = svc.add('no. of unsolicited responses'); unsol.count = 0;
  const retr = svc.add('no. of retransmissions'); retr.count = 0;
  const DNS_LAYERS = ['dns', 'mdns', 'llmnr'];
  each(frames, summaries, getDissection, opts, (f, s, getD) => {
    if (s && s.layers != null && !String(s.layers).split(':').some((l) => DNS_LAYERS.includes(l))) return;
    const d = getD();
    if (!d || !d.fields.has('dns.flags.response')) return;
    const t = tsec(f);
    root.tick(t);
    const isResp = !!first(d, 'dns.flags.response');
    const rc = first(d, 'dns.flags.rcode');
    if (rc !== undefined) { rcode.tick(t); rcode.add(vsName(opts, 'dns.flags.rcode', rc, DNS_RCODE), t); }
    const op = first(d, 'dns.flags.opcode');
    if (op !== undefined) { opc.tick(t); opc.add(vsName(opts, 'dns.flags.opcode', op, DNS_OPCODE), t); }
    qr.tick(t); qr.add(isResp ? 'Response' : 'Query', t);
    for (const ty of fieldValues(d, 'dns.qry.type')) { qtype.tick(t); qtype.add(vsName(opts, 'dns.qry.type', ty), t); }
    for (const c of fieldValues(d, 'dns.qry.class')) { qclass.tick(t); qclass.add(vsName(opts, 'dns.qry.class', c, { 1: 'IN', 3: 'CH', 4: 'HS', 255: 'ANY' }), t); }
    const dnsNode = (d.fields.get('dns') || d.fields.get('mdns') || d.fields.get('llmnr') || [])[0];
    if (dnsNode) payload.tick(t, dnsNode.length);
    if (!isResp) {
      qstats.tick(t);
      for (const n of fieldValues(d, 'dns.qry.name')) {
        qstats.add('Qname Len', t, String(n).length);
        qstats.add('Label Stats', t, n ? String(n).split('.').filter(Boolean).length : 0);
      }
    } else {
      rstats.tick(t);
      rstats.add('no. of questions', t, first(d, 'dns.count.queries') ?? 0);
      rstats.add('no. of authorities', t, first(d, 'dns.count.auth_rr') ?? 0);
      rstats.add('no. of answers', t, first(d, 'dns.count.answers') ?? 0);
      rstats.add('no. of additionals', t, first(d, 'dns.count.add_rr') ?? 0);
      const rt = first(d, 'dns.time');
      if (rt !== undefined) { svc.tick(t); rrt.tick(t, Number(rt) * 1000); }
      if (d.fields.has('dns.unsolicited')) { svc.tick(t); unsol.tick(t); }
    }
    if (d.fields.has('dns.retransmission') || d.fields.has('dns.retransmit_request') || d.fields.has('dns.retransmit_response')) { svc.tick(t); retr.tick(t); }
  });
  return finishTree(root, frames, opts);
}

// ------------------------------------------------------------------------------------------------
// IPv4 / IPv6 statistics, port types

const IP_PROTO = { 1: 'ICMP', 2: 'IGMP', 4: 'IPIP', 6: 'TCP', 17: 'UDP', 41: 'IPv6', 47: 'GRE', 50: 'ESP', 51: 'AH', 58: 'ICMPv6', 89: 'OSPF', 103: 'PIM', 112: 'VRRP', 132: 'SCTP' };

/**
 * IPv4/IPv6 Statistics. opts.version: 4 (default) | 6.
 * → { allAddresses, sourceAndDestination, protocolTypes, destinationsAndPorts, ttl } (stats trees)
 */
export function ipStats(frames, summaries, getDissection, opts = {}) {
  const v6 = opts.version === 6 || opts.version === 'ipv6';
  const p = v6 ? 'ipv6' : 'ip';
  const all = new TreeNode('All Addresses');
  const sd = new TreeNode('Source and Destination Addresses');
  const src = sd.add('Source IPv' + (v6 ? '6' : '4') + ' Addresses'); src.count = 0;
  const dst = sd.add('Destination IPv' + (v6 ? '6' : '4') + ' Addresses'); dst.count = 0;
  const types = new TreeNode('IP Protocol Types');
  const dports = new TreeNode('Destinations and Ports');
  const ttl = new TreeNode(v6 ? 'Hop Limit' : 'TTL');
  each(frames, summaries, getDissection, opts, (f, s, getD) => {
    if (s && s.layers != null && !String(s.layers).split(':').includes(p)) return;
    const d = getD();
    if (!d) return;
    const t = tsec(f);
    for (const n of topLayers(d, p)) {
      const a = childValue(n, p + '.src'), b = childValue(n, p + '.dst');
      if (a === undefined) continue;
      all.tick(t); all.add(String(a), t); all.add(String(b), t);
      sd.tick(t); src.tick(t); src.add(String(a), t); dst.tick(t); dst.add(String(b), t);
      const proto = v6 ? childValue(n, 'ipv6.nxt') : childValue(n, 'ip.proto');
      const name = proto === undefined ? 'Unknown' : vsName(opts, v6 ? 'ipv6.nxt' : 'ip.proto', proto, IP_PROTO);
      types.tick(t); types.add(name, t);
      const h = v6 ? childValue(n, 'ipv6.hlim') : childValue(n, 'ip.ttl');
      if (h !== undefined) { ttl.tick(t, h); ttl.add(String(h), t); }
      // ports of the transport layer that follows this IP layer
      const chain = protocolChain(d);
      const tr = chain.slice(chain.indexOf(n) + 1).find((x) => x.type === 'protocol' && (x.abbrev === 'tcp' || x.abbrev === 'udp' || x.abbrev === 'sctp'));
      dports.tick(t);
      const dn = dports.add(String(b), t);
      if (tr) dn.add(tr.abbrev.toUpperCase(), t).add(String(childValue(tr, tr.abbrev + '.dstport')), t);
    }
  });
  return {
    allAddresses: finishTree(all, frames, opts, 'count'),
    sourceAndDestination: finishTree(sd, frames, opts, 'count'),
    protocolTypes: finishTree(types, frames, opts, 'count'),
    destinationsAndPorts: finishTree(dports, frames, opts, 'count'),
    ttl: finishTree(ttl, frames, opts),
  };
}

/** Port Type statistics: transport types with their ports. Works from summaries alone. */
export function portTypes(frames, summaries, getDissection, opts = {}) {
  const root = new TreeNode('Port Type');
  each(frames, summaries, getDissection, opts, (f, s, getD) => {
    const t = tsec(f);
    let type = null, sp, dp;
    if (s && s.layers != null) {
      const ls = String(s.layers).split(':');
      type = ['tcp', 'udp', 'sctp', 'dccp'].find((x) => ls.includes(x)) || null;
      sp = s.srcport; dp = s.dstport;
    } else {
      const d = getD();
      type = ['tcp', 'udp', 'sctp', 'dccp'].find((x) => d && d.layers.includes(x)) || null;
      if (type) { sp = first(d, type + '.srcport'); dp = first(d, type + '.dstport'); }
    }
    root.tick(t);
    const n = root.add(type ? type.toUpperCase() : 'None', t);
    if (type && sp != null) { n.add('Source Port ' + sp, t); n.add('Destination Port ' + dp, t); }
  });
  return finishTree(root, frames, opts, 'count');
}

// ------------------------------------------------------------------------------------------------
// Expert Information

const SEV_ORDER = { error: 4, warn: 3, note: 2, chat: 1, comment: 0 };

export function expertInfo(frames, summaries, getDissection, opts = {}) {
  const map = new Map();
  const bySeverity = { error: 0, warn: 0, note: 0, chat: 0 };
  let total = 0;
  each(frames, summaries, getDissection, opts, (f, s, getD) => {
    if (s && s.expert === null && !f.comment) return; // nothing to report (cheap skip)
    const d = getD();
    if (!d) return;
    for (const e of d.expert || []) {
      const protocol = protoShort(expertProtocol(e.abbrev, opts), opts);
      const key = `${e.severity}|${e.group}|${protocol}|${e.message}`;
      let it = map.get(key);
      if (!it) map.set(key, it = { severity: e.severity, group: e.group, protocol, summary: e.message, count: 0, frames: [], abbrev: e.abbrev });
      it.count++;
      if (it.frames[it.frames.length - 1] !== f.no) it.frames.push(f.no);
      if (bySeverity[e.severity] !== undefined) bySeverity[e.severity]++;
      total++;
    }
  });
  const items = [...map.values()].sort((a, b) => (SEV_ORDER[b.severity] - SEV_ORDER[a.severity]) || (a.group < b.group ? -1 : a.group > b.group ? 1 : 0) || b.count - a.count);
  return { items, bySeverity, total };
}

function expertProtocol(abbrev, opts) {
  if (!abbrev) return 'unknown';
  const f = opts.fields && opts.fields.get(abbrev);
  if (f && f.protocol) return f.protocol;
  const dot = abbrev.indexOf('.');
  return dot < 0 ? abbrev : abbrev.slice(0, dot);
}

// ------------------------------------------------------------------------------------------------
// Flow Graph

const TCP_FLAG_NAMES = [[0x100, 'AE'], [0x80, 'CWR'], [0x40, 'ECE'], [0x20, 'URG'], [0x10, 'ACK'], [0x08, 'PSH'], [0x04, 'RST'], [0x02, 'SYN'], [0x01, 'FIN']];
function tcpFlagText(flags) {
  // Wireshark's flow label order: FIN, SYN, RST, PSH, ACK, URG, ECE, CWR, AE
  const order = [[0x01, 'FIN'], [0x02, 'SYN'], [0x04, 'RST'], [0x08, 'PSH'], [0x10, 'ACK'], [0x20, 'URG'], [0x40, 'ECE'], [0x80, 'CWR'], [0x100, 'AE']];
  void TCP_FLAG_NAMES;
  return order.filter(([m]) => flags & m).map(([, n]) => n).join(', ');
}

/**
 * Flow Graph. opts.mode: 'general' (every packet, label = Info) | 'tcp' (TCP flows: flags, Seq/Ack).
 * opts.addresses: 'network' (default) | 'any' (hardware addresses when there is no network layer).
 */
export function flowGraph(frames, summaries, getDissection, opts = {}) {
  const mode = opts.mode || 'general';
  const t0 = firstTime(frames, opts);
  const nodes = [];
  const seen = new Set();
  const rows = [];
  const node = (a) => { if (!seen.has(a)) { seen.add(a); nodes.push(a); } };
  each(frames, summaries, getDissection, opts, (f, s, getD) => {
    if (mode === 'tcp') {
      if (s && s.layers != null && !String(s.layers).split(':').includes('tcp')) return;
      const d = getD();
      if (!d || !d.fields.has('tcp.flags')) return;
      const flags = Number(first(d, 'tcp.flags'));
      const len = Number(first(d, 'tcp.len') || 0);
      const src = d.columns?.netSrc || d.columns?.src || s?.src || '';
      const dst = d.columns?.netDst || d.columns?.dst || s?.dst || '';
      node(src); node(dst);
      let label = tcpFlagText(flags);
      if (len > 0) label += ` - Len: ${len}`;
      rows.push({
        frame: f.no, time: tsec(f) - t0, src, dst,
        srcport: first(d, 'tcp.srcport') ?? null, dstport: first(d, 'tcp.dstport') ?? null,
        label, comment: `Seq = ${first(d, 'tcp.seq') ?? 0}${flags & 0x10 ? ` Ack = ${first(d, 'tcp.ack') ?? 0}` : ''}`,
        protocol: s?.protocol || d.columns?.protocol || 'TCP', stream: first(d, 'tcp.stream') ?? null,
      });
      return;
    }
    let src = s ? s.src : '', dst = s ? s.dst : '', info = s ? s.info : '', proto = s ? s.protocol : '';
    let srcport = s && s.srcport != null ? s.srcport : null, dstport = s && s.dstport != null ? s.dstport : null;
    if (!s) {
      const d = getD();
      if (d) ({ src, dst, info, protocol: proto, srcport, dstport } = { ...d.columns, protocol: d.columns.protocol });
    }
    if (opts.addresses === 'network' && s && !/[.:]/.test(src)) return;
    node(src); node(dst);
    rows.push({ frame: f.no, time: tsec(f) - t0, src, dst, srcport: srcport ?? null, dstport: dstport ?? null, label: info, comment: `${proto}: ${info}`, protocol: proto });
  });
  return { mode, nodes, rows };
}

// ------------------------------------------------------------------------------------------------
// TCP Stream Graphs

/**
 * opts: { stream (tcp.stream index), type: 'stevens'|'tcptrace'|'throughput'|'rtt'|'window',
 *         direction: 'auto' | 0 (client→server) | 1 (server→client), maWindow: seconds (throughput, default 1) }
 * Sequence numbers are the dissector's (relative) tcp.seq; x is time since the first frame of the capture.
 */
export function tcpStreamGraph(frames, summaries, getDissection, opts = {}) {
  const stream = Number(opts.stream ?? 0);
  const type = opts.type || 'stevens';
  const t0 = firstTime(frames, opts);
  const pk = [];
  each(frames, summaries, getDissection, opts, (f, s, getD) => {
    if (s && s.tcpStream !== undefined && s.tcpStream !== stream) return;
    if (s && s.layers != null && !String(s.layers).split(':').includes('tcp')) return;
    const d = getD();
    if (!d || first(d, 'tcp.stream') !== stream) return;
    const net = topLayers(d, 'ip')[0] || topLayers(d, 'ipv6')[0];
    const src = net ? String(childValue(net, net.abbrev + '.src')) : d.columns?.src;
    const dst = net ? String(childValue(net, net.abbrev + '.dst')) : d.columns?.dst;
    pk.push({
      frame: f.no, t: tsec(f) - t0, src, dst,
      sport: first(d, 'tcp.srcport'), dport: first(d, 'tcp.dstport'),
      seq: Number(first(d, 'tcp.seq') ?? 0), ack: Number(first(d, 'tcp.ack') ?? 0), len: Number(first(d, 'tcp.len') ?? 0),
      flags: Number(first(d, 'tcp.flags') ?? 0),
      win: Number(first(d, 'tcp.window_size') ?? first(d, 'tcp.window_size_value') ?? 0),
      rtt: first(d, 'tcp.analysis.ack_rtt'), bif: first(d, 'tcp.analysis.bytes_in_flight'),
      retrans: d.fields.has('tcp.analysis.retransmission') || d.fields.has('tcp.analysis.fast_retransmission') || d.fields.has('tcp.analysis.spurious_retransmission'),
      sackLe: fieldValues(d, 'tcp.options.sack_le').map(Number), sackRe: fieldValues(d, 'tcp.options.sack_re').map(Number),
      bytes: f.len,
    });
  });
  if (!pk.length) return { stream, type, direction: null, xLabel: '', yLabel: '', series: [] };
  const c = pk[0];
  const isFwd = (p) => p.src === c.src && p.sport === c.sport;
  let dir = opts.direction;
  if (dir === undefined || dir === 'auto') {
    let a = 0, b = 0;
    for (const p of pk) if (isFwd(p)) a += p.len; else b += p.len;
    dir = b > a ? 1 : 0;
  }
  const fwd = pk.filter((p) => (dir === 0 ? isFwd(p) : !isFwd(p)));
  const rev = pk.filter((p) => (dir === 0 ? !isFwd(p) : isFwd(p)));
  const d0 = fwd[0] || pk[0];
  const direction = { src: d0.src, srcport: d0.sport, dst: d0.dst, dstport: d0.dport };
  const pt = (x, y, frame, extra) => ({ x, y, frame, ...extra });
  let series = [], xLabel = 'Time (s)', yLabel = '';
  switch (type) {
    case 'stevens':
      yLabel = 'Sequence Number (B)';
      series = [{ name: 'Segments', kind: 'points', points: fwd.filter((p) => p.len > 0 || p.flags & 0x03).map((p) => pt(p.t, p.seq, p.frame)) }];
      break;
    case 'tcptrace':
      yLabel = 'Sequence Number (B)';
      series = [
        { name: 'Segments', kind: 'segments', points: fwd.filter((p) => p.len > 0 || p.flags & 0x03).map((p) => pt(p.t, p.seq, p.frame, { y2: p.seq + Math.max(p.len, 1) })) },
        { name: 'Acknowledged', kind: 'line', points: rev.filter((p) => p.flags & 0x10).map((p) => pt(p.t, p.ack, p.frame)) },
        { name: 'Receive window', kind: 'line', points: rev.filter((p) => p.flags & 0x10).map((p) => pt(p.t, p.ack + p.win, p.frame)) },
        { name: 'SACKs', kind: 'segments', points: rev.flatMap((p) => p.sackLe.map((le, i) => pt(p.t, le, p.frame, { y2: p.sackRe[i] }))) },
        { name: 'Retransmissions', kind: 'points', points: fwd.filter((p) => p.retrans).map((p) => pt(p.t, p.seq, p.frame)) },
      ];
      break;
    case 'throughput': {
      yLabel = 'Throughput (bits/s)';
      const ma = opts.maWindow > 0 ? opts.maWindow : 1;
      const mk = (good) => {
        const pts = [];
        let j = 0, sum = 0;
        const segs = fwd.filter((p) => p.len > 0 && (!good || !p.retrans));
        for (let i = 0; i < segs.length; i++) {
          sum += good ? segs[i].len : segs[i].bytes;
          while (segs[i].t - segs[j].t > ma) { sum -= good ? segs[j].len : segs[j].bytes; j++; }
          const span = segs[i].t - segs[j].t;
          pts.push(pt(segs[i].t, span > 0 ? (sum * 8) / span : null, segs[i].frame));
        }
        return pts.filter((p) => p.y !== null);
      };
      series = [
        { name: 'Segment length', kind: 'points', points: fwd.filter((p) => p.len > 0).map((p) => pt(p.t, p.len, p.frame)) },
        { name: 'Throughput', kind: 'line', points: mk(false) },
        { name: 'Goodput', kind: 'line', points: mk(true) },
      ];
      break;
    }
    case 'rtt':
      xLabel = 'Sequence Number (B)'; yLabel = 'RTT (ms)';
      series = [{ name: 'Round Trip Time', kind: 'line', points: rev.filter((p) => p.rtt !== undefined).map((p) => pt(p.ack, Number(p.rtt) * 1000, p.frame)) }];
      break;
    case 'window':
      yLabel = 'Size (B)';
      series = [
        { name: 'Bytes in flight', kind: 'points', points: fwd.filter((p) => p.bif !== undefined).map((p) => pt(p.t, Number(p.bif), p.frame)) },
        { name: 'Receive window', kind: 'line', points: rev.map((p) => pt(p.t, p.win, p.frame)) },
      ];
      break;
    default:
      throw new Error(`unknown TCP graph type "${type}"`);
  }
  return { stream, type, direction, xLabel, yLabel, series };
}
