// More of Wireshark's statistics windows, as popup views (see analysis-bridge.js for the shapes):
//   srt        Statistics › Service Response Time (DNS, HTTP, HTTP/2, SMB2, SNMP, IMAP, Modbus, CoAP)
//   multicast  Statistics › UDP Multicast Streams
//   dhcp       Statistics › DHCP (BOOTP) Statistics
//   sipStats   Telephony › SIP Statistics
//   rtpAnalysis Telephony › RTP › Stream Analysis (RFC 3550 jitter, lost, sequence errors)
//   macBlocks  Tools › MAC Address Blocks (the vendors of the addresses in the capture)
//   protocols  View › Internals › Supported Protocols
// `src` is { doc, frames, get(frame) → dissection }.
import { FIELDS, PROTOCOLS } from './domain/dissect/index.js';
import { ouiVendor } from './domain/dissect/names.js';

const first = (d, name) => d?.fields?.get(name)?.[0]?.value;
const all = (d, name) => (d?.fields?.get(name) ?? []).map((n) => n.value);
const time = (frame) => frame.sec + frame.nsec / 1e9;
const table = (columns, rows, extra = {}) => ({ view: 'table', columns, rows, ...extra });
const tree = (columns, rows, extra = {}) => ({ view: 'tree', columns, rows, ...extra });
/** A field value by its name in Wireshark's value strings ("Discover", "Query"), else the number. */
export function valueName(field, value) {
  const strings = FIELDS.get(field)?.strings;
  const name = strings && (strings[value] ?? strings[String(value)]);
  return name ? `${name}` : String(value);
}
const round = (n, digits = 3) => (Number.isFinite(n) ? Number(n.toFixed(digits)) : '');

// ───────────────────────── Service Response Time

/** Each protocol: its response-time field (seconds) and the field naming the procedure. */
export const SRT_PROTOCOLS = [
  { proto: 'DNS', time: 'dns.time', procedure: 'dns.qry.type', filter: 'dns.time' },
  { proto: 'HTTP', time: 'http.time', procedure: 'http.response.code', filter: 'http.time' },
  { proto: 'HTTP/2', time: 'http2.time', procedure: 'http2.type', filter: 'http2.time' },
  { proto: 'SMB2', time: 'smb2.time', procedure: 'smb2.cmd', filter: 'smb2.time' },
  { proto: 'SNMP', time: 'snmp.time', procedure: 'snmp.data', filter: 'snmp.time' },
  { proto: 'IMAP', time: 'imap.time', procedure: null, filter: 'imap.time' },
  { proto: 'Modbus/TCP', time: 'modbus.response_time', procedure: 'modbus.func_code', filter: 'modbus.response_time' },
  { proto: 'CoAP', time: 'coap.response_time', procedure: 'coap.code', filter: 'coap.response_time' },
];

/** → rows per protocol (depth 0) and procedure (depth 1): calls, min / max / avg / sum SRT in seconds. */
export function serviceResponseTime(src, t) {
  const groups = new Map();
  for (const frame of src.frames) {
    const d = src.get(frame);
    if (!d?.fields) continue;
    for (const p of SRT_PROTOCOLS) {
      const value = first(d, p.time);
      if (value == null) continue;
      const s = Number(value);
      if (!Number.isFinite(s)) continue;
      let g = groups.get(p.proto);
      if (!g) { g = { p, all: stat(), procs: new Map() }; groups.set(p.proto, g); }
      add(g.all, s);
      const proc = p.procedure ? first(d, p.procedure) : null;
      const key = proc == null ? '-' : String(proc);
      let ps = g.procs.get(key);
      if (!ps) { ps = { ...stat(), raw: proc, name: proc == null ? (p.proto) : valueName(p.procedure, proc) }; g.procs.set(key, ps); }
      add(ps, s);
    }
  }
  const rows = [];
  for (const g of groups.values()) {
    rows.push({ id: g.p.proto, depth: 0, filter: g.p.filter, cells: cellsOf(g.p.proto, g.all) });
    for (const [key, ps] of g.procs) {
      const filter = g.p.procedure && ps.raw != null ? `${g.p.filter} && ${g.p.procedure} == ${typeof ps.raw === 'string' ? JSON.stringify(ps.raw) : ps.raw}` : g.p.filter;
      rows.push({ id: `${g.p.proto}/${key}`, depth: 1, filter, cells: cellsOf(ps.name, ps) });
    }
  }
  return tree([
    { id: 'name', label: t('srt.procedure') }, { id: 'calls', label: t('srt.calls'), num: true },
    { id: 'min', label: t('srt.min'), num: true, fmt: 'float' }, { id: 'max', label: t('srt.max'), num: true, fmt: 'float' },
    { id: 'avg', label: t('srt.avg'), num: true, fmt: 'float' }, { id: 'sum', label: t('srt.sum'), num: true, fmt: 'float' },
  ], rows, { note: rows.length ? t('srt.note') : t('stats.empty') });
}
const stat = () => ({ calls: 0, min: Infinity, max: -Infinity, sum: 0 });
const add = (s, v) => { s.calls += 1; s.min = Math.min(s.min, v); s.max = Math.max(s.max, v); s.sum += v; };
const cellsOf = (name, s) => ({ name, calls: s.calls, min: round(s.min, 6), max: round(s.max, 6), avg: round(s.sum / s.calls, 6), sum: round(s.sum, 6) });

// ───────────────────────── UDP multicast streams

export const isMulticast = (ip) => {
  if (!ip) return false;
  const s = String(ip).toLowerCase();
  if (s.includes(':')) return s.startsWith('ff');
  const a = Number(s.split('.')[0]);
  return a >= 224 && a <= 239;
};

/**
 * One row per (source address:port → multicast group:port): packets, packets per second, average and
 * maximum bandwidth (Mbit/s, the maximum over a 100 ms burst window like Wireshark's default) and max burst.
 */
export function multicastStreams(src, t, { burstMs = 100 } = {}) {
  const streams = new Map();
  for (const frame of src.frames) {
    const d = src.get(frame);
    const dst = first(d, 'ip.dst') ?? first(d, 'ipv6.dst');
    const dport = first(d, 'udp.dstport');
    if (dport == null || !isMulticast(dst)) continue;
    const srcIp = first(d, 'ip.src') ?? first(d, 'ipv6.src');
    const sport = first(d, 'udp.srcport');
    const key = `${srcIp}:${sport}>${dst}:${dport}`;
    let s = streams.get(key);
    const at = time(frame);
    if (!s) { s = { srcIp, sport, dst, dport, packets: 0, bytes: 0, start: at, end: at, window: [], maxBurst: 0, maxBurstBytes: 0, no: frame.no }; streams.set(key, s); }
    s.packets += 1;
    s.bytes += frame.len;
    s.end = at;
    s.window.push([at, frame.len]);
    while (s.window.length && at - s.window[0][0] >= burstMs / 1000) s.window.shift();
    s.maxBurst = Math.max(s.maxBurst, s.window.length);
    s.maxBurstBytes = Math.max(s.maxBurstBytes, s.window.reduce((n, [, len]) => n + len, 0));
  }
  const rows = [...streams.values()].map((s, i) => {
    const span = s.end - s.start;
    const v6 = String(s.dst).includes(':');
    return {
      id: String(i), no: s.no, filter: `${v6 ? 'ipv6' : 'ip'}.src == ${s.srcIp} && udp.srcport == ${s.sport} && ${v6 ? 'ipv6' : 'ip'}.dst == ${s.dst} && udp.dstport == ${s.dport}`,
      cells: {
        src: String(s.srcIp), sport: s.sport, dst: String(s.dst), dport: s.dport, packets: s.packets,
        pps: round(span > 0 ? s.packets / span : s.packets, 2), avgBw: round(span > 0 ? (s.bytes * 8) / span / 1e6 : 0, 4),
        maxBw: round((s.maxBurstBytes * 8) / (burstMs / 1000) / 1e6, 4), maxBurst: s.maxBurst,
      },
    };
  });
  return table([
    { id: 'src', label: t('mcast.src') }, { id: 'sport', label: t('mcast.sport'), num: true }, { id: 'dst', label: t('mcast.dst') }, { id: 'dport', label: t('mcast.dport'), num: true },
    { id: 'packets', label: t('netmap.packets'), num: true }, { id: 'pps', label: t('mcast.pps'), num: true, fmt: 'float' },
    { id: 'avgBw', label: t('mcast.avgBw'), num: true, fmt: 'float' }, { id: 'maxBw', label: t('mcast.maxBw'), num: true, fmt: 'float' }, { id: 'maxBurst', label: t('mcast.maxBurst', { ms: burstMs }), num: true },
  ], rows, { note: rows.length ? '' : t('stats.empty') });
}

// ───────────────────────── DHCP (BOOTP) statistics

/** Counts of DHCP message types (option 53), like Wireshark's DHCP (BOOTP) Statistics. */
export function dhcpStats(src, t) {
  const counts = new Map();
  let total = 0;
  for (const frame of src.frames) {
    const d = src.get(frame);
    const type = first(d, 'dhcp.option.dhcp');
    if (type == null) continue;
    total += 1;
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  const rows = [...counts.entries()].sort((a, b) => Number(a[0]) - Number(b[0])).map(([type, count]) => ({
    id: String(type), filter: `dhcp.option.dhcp == ${type}`, cells: { type: valueName('dhcp.option.dhcp', type), count, percent: round((count / total) * 100, 2) },
  }));
  return table([{ id: 'type', label: t('dhcpStats.type') }, { id: 'count', label: t('stats.count'), num: true }, { id: 'percent', label: t('stats.percent'), num: true, fmt: 'pct', bar: true }], rows, { note: rows.length ? '' : t('stats.empty') });
}

// ───────────────────────── SIP statistics

/** Requests by method, responses by status code (grouped by class), resent packets, like Telephony › SIP Statistics. */
export function sipStatistics(src, t) {
  const methods = new Map();
  const codes = new Map();
  let resent = 0;
  let requests = 0;
  let responses = 0;
  for (const frame of src.frames) {
    const d = src.get(frame);
    if (!d?.fields?.has('sip')) continue;
    if (first(d, 'sip.resend')) resent += 1;
    const method = first(d, 'sip.Method');
    const code = first(d, 'sip.Status-Code');
    if (method != null) { requests += 1; methods.set(method, (methods.get(method) ?? 0) + 1); }
    if (code != null) { responses += 1; codes.set(Number(code), (codes.get(Number(code)) ?? 0) + 1); }
  }
  const CLASS = { 1: 'Informational (1xx)', 2: 'Success (2xx)', 3: 'Redirection (3xx)', 4: 'Client Error (4xx)', 5: 'Server Error (5xx)', 6: 'Global Failure (6xx)' };
  const rows = [{ id: 'req', depth: 0, filter: 'sip.Method', cells: { name: t('sipStats.requests'), count: requests } }];
  for (const [m, n] of [...methods].sort((a, b) => b[1] - a[1])) rows.push({ id: `req/${m}`, depth: 1, filter: `sip.Method == "${m}"`, cells: { name: m, count: n } });
  rows.push({ id: 'resp', depth: 0, filter: 'sip.Status-Code', cells: { name: t('sipStats.responses'), count: responses } });
  const classes = new Map();
  for (const [code, n] of codes) { const c = Math.floor(code / 100); if (!classes.has(c)) classes.set(c, []); classes.get(c).push([code, n]); }
  for (const [c, list] of [...classes].sort((a, b) => a[0] - b[0])) {
    rows.push({ id: `resp/${c}`, depth: 1, filter: `sip.Status-Code >= ${c * 100} && sip.Status-Code < ${c * 100 + 100}`, cells: { name: CLASS[c] ?? `${c}xx`, count: list.reduce((s, [, n]) => s + n, 0) } });
    for (const [code, n] of list.sort((a, b) => a[0] - b[0])) rows.push({ id: `resp/${c}/${code}`, depth: 2, filter: `sip.Status-Code == ${code}`, cells: { name: String(code), count: n } });
  }
  rows.push({ id: 'resent', depth: 0, filter: 'sip.resend == 1', cells: { name: t('sipStats.resent'), count: resent } });
  return tree([{ id: 'name', label: t('stats.topic') }, { id: 'count', label: t('stats.count'), num: true }], rows, { note: requests + responses ? '' : t('stats.empty') });
}

// ───────────────────────── RTP stream analysis

/** RTP clock rates of the static payload types (RFC 3551); dynamic ones default to 8000. */
const CLOCK = { 0: 8000, 3: 8000, 4: 8000, 5: 8000, 6: 16000, 7: 8000, 8: 8000, 9: 8000, 10: 44100, 11: 44100, 12: 8000, 13: 8000, 14: 90000, 15: 8000, 16: 11025, 17: 22050, 18: 8000, 25: 90000, 26: 90000, 28: 90000, 31: 90000, 32: 90000, 33: 90000, 34: 90000 };
const PT_NAME = { 0: 'g711U', 3: 'GSM', 4: 'G723', 8: 'g711A', 9: 'g722', 13: 'CN', 18: 'g729', 26: 'JPEG', 31: 'H261', 34: 'H263' };

/**
 * Per stream: packets, expected, lost (and %), sequence errors, max delta (ms), max / mean jitter (ms,
 * RFC 3550 J += (|D| − J) / 16), max skew (ms), like RTP Stream Analysis.
 */
export function rtpAnalysis(src, t) {
  const streams = new Map();
  for (const frame of src.frames) {
    const d = src.get(frame);
    const ssrc = first(d, 'rtp.ssrc');
    if (ssrc == null) continue;
    const ipSrc = first(d, 'ip.src') ?? first(d, 'ipv6.src');
    const ipDst = first(d, 'ip.dst') ?? first(d, 'ipv6.dst');
    const key = `${ipSrc}|${first(d, 'udp.srcport')}|${ipDst}|${first(d, 'udp.dstport')}|${ssrc}`;
    const seq = Number(first(d, 'rtp.seq'));
    const ts = Number(first(d, 'rtp.timestamp'));
    const pt = Number(first(d, 'rtp.p_type'));
    const at = time(frame);
    let s = streams.get(key);
    if (!s) {
      s = { ipSrc, ipDst, sport: first(d, 'udp.srcport'), dport: first(d, 'udp.dstport'), ssrc, pt, clock: CLOCK[pt] ?? 8000, packets: 0, seqErrors: 0, firstSeq: seq, lastSeq: null, cycles: 0, start: at, lastAt: null, lastTs: null, maxDelta: 0, jitter: 0, maxJitter: 0, jitterSum: 0, firstTs: ts, maxSkew: 0, no: frame.no };
      streams.set(key, s);
    }
    s.packets += 1;
    if (s.lastSeq != null) {
      const step = (seq - s.lastSeq + 65536) % 65536;
      if (step !== 1) s.seqErrors += 1;
      if (seq < s.lastSeq && s.lastSeq - seq > 32768) s.cycles += 1;
      s.maxDelta = Math.max(s.maxDelta, (at - s.lastAt) * 1000);
      // Transit difference in timestamp units, then the RFC 3550 running jitter.
      let dts = ts - s.lastTs; // 32-bit timestamps wrap
      if (dts > 2 ** 31) dts -= 2 ** 32; else if (dts < -(2 ** 31)) dts += 2 ** 32;
      const D = (at - s.lastAt) * s.clock - dts;
      s.jitter += (Math.abs(D) - s.jitter) / 16;
      const ms = (s.jitter / s.clock) * 1000;
      s.maxJitter = Math.max(s.maxJitter, ms);
      s.jitterSum += ms;
      const skew = ((((ts - s.firstTs) + 2 ** 32) % 2 ** 32) / s.clock - (at - s.start)) * 1000;
      if (Math.abs(skew) > Math.abs(s.maxSkew)) s.maxSkew = skew;
    }
    s.lastSeq = seq;
    s.lastAt = at;
    s.lastTs = ts;
  }
  const hex = (n) => `0x${Number(n).toString(16).padStart(8, '0')}`;
  const rows = [...streams.values()].map((s, i) => {
    const expected = s.cycles * 65536 + s.lastSeq - s.firstSeq + 1;
    const lost = Math.max(0, expected - s.packets);
    return {
      id: String(i), no: s.no, filter: `rtp.ssrc == ${hex(s.ssrc)}`,
      cells: {
        src: `${s.ipSrc}:${s.sport}`, dst: `${s.ipDst}:${s.dport}`, ssrc: hex(s.ssrc), payload: PT_NAME[s.pt] ?? String(s.pt), packets: s.packets, expected, lost,
        lostPct: round(expected ? (lost / expected) * 100 : 0, 2), seqErrors: s.seqErrors, maxDelta: round(s.maxDelta), maxJitter: round(s.maxJitter),
        meanJitter: round(s.packets > 1 ? s.jitterSum / (s.packets - 1) : 0), maxSkew: round(s.maxSkew), status: lost || s.seqErrors ? t('rtpAnalysis.problems') : 'OK',
      },
      severity: lost || s.seqErrors ? 'warn' : undefined,
    };
  });
  return table([
    { id: 'src', label: t('column.src') }, { id: 'dst', label: t('column.dst') }, { id: 'ssrc', label: 'SSRC' }, { id: 'payload', label: 'Payload' },
    { id: 'packets', label: t('netmap.packets'), num: true }, { id: 'expected', label: t('rtpAnalysis.expected'), num: true }, { id: 'lost', label: t('rtpAnalysis.lost'), num: true },
    { id: 'lostPct', label: t('rtpAnalysis.lostPct'), num: true, fmt: 'float' }, { id: 'seqErrors', label: t('rtpAnalysis.seqErrors'), num: true },
    { id: 'maxDelta', label: t('rtpAnalysis.maxDelta'), num: true, fmt: 'float' }, { id: 'maxJitter', label: t('rtpAnalysis.maxJitter'), num: true, fmt: 'float' },
    { id: 'meanJitter', label: t('rtpAnalysis.meanJitter'), num: true, fmt: 'float' }, { id: 'maxSkew', label: t('rtpAnalysis.maxSkew'), num: true, fmt: 'float' }, { id: 'status', label: t('rtpAnalysis.status') },
  ], rows, { note: rows.length ? '' : t('stats.empty') });
}

// ───────────────────────── MAC address blocks

/** The hardware addresses in the capture with their vendor block (OUI), packets and whether they are local / group addresses. */
export function macBlocks(src, t) {
  const macs = new Map();
  for (const frame of src.frames) {
    const d = src.get(frame);
    for (const name of ['eth.src', 'eth.dst', 'wlan.sa', 'wlan.da', 'wlan.ta', 'wlan.ra']) {
      for (const mac of all(d, name)) {
        if (!mac || !/^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/i.test(mac)) continue;
        const m = mac.toLowerCase();
        let e = macs.get(m);
        if (!e) { e = { mac: m, packets: 0, frames: new Set() }; macs.set(m, e); }
        if (!e.frames.has(frame.no)) { e.frames.add(frame.no); e.packets += 1; }
      }
    }
  }
  const rows = [...macs.values()].sort((a, b) => b.packets - a.packets).map((e, i) => {
    const octet = parseInt(e.mac.slice(0, 2), 16);
    const group = (octet & 1) === 1;
    const local = (octet & 2) === 2;
    const vendor = e.mac === 'ff:ff:ff:ff:ff:ff' ? 'Broadcast' : ouiVendor(e.mac) ?? (local ? t('macBlocks.local') : t('macBlocks.unknown'));
    return { id: String(i), filter: `eth.addr == ${e.mac}`, cells: { mac: e.mac, block: e.mac.slice(0, 8).toUpperCase(), vendor, kind: group ? t('macBlocks.group') : t('macBlocks.individual'), admin: local ? t('macBlocks.localAdmin') : t('macBlocks.universal'), packets: e.packets } };
  });
  return table([
    { id: 'mac', label: t('macBlocks.address') }, { id: 'block', label: t('macBlocks.block') }, { id: 'vendor', label: t('macBlocks.vendor') },
    { id: 'kind', label: t('macBlocks.kind') }, { id: 'admin', label: t('macBlocks.admin') }, { id: 'packets', label: t('netmap.packets'), num: true },
  ], rows, { note: rows.length ? '' : t('stats.empty') });
}

// ───────────────────────── supported protocols

/** Every protocol the dissectors know with its filter name and number of fields (View › Internals › Supported Protocols). */
export function supportedProtocols(src, t) {
  const counts = new Map();
  for (const name of FIELDS.keys()) {
    const proto = name.split('.')[0];
    counts.set(proto, (counts.get(proto) ?? 0) + 1);
  }
  const list = Array.isArray(PROTOCOLS) ? PROTOCOLS : [...(PROTOCOLS?.values?.() ?? [])];
  const rows = list.filter((p) => p?.abbrev && !p.abbrev.startsWith('_ws')).sort((a, b) => a.abbrev.localeCompare(b.abbrev)).map((p) => ({
    id: p.abbrev, filter: p.abbrev, cells: { name: p.name ?? p.abbrev, short: p.short ?? '', abbrev: p.abbrev, fields: Math.max(0, (counts.get(p.abbrev) ?? 1) - 1), enabled: p.enabled === false ? t('common.no') : t('common.yes') },
  }));
  return table([
    { id: 'name', label: t('protocols.name') }, { id: 'short', label: t('protocols.short') }, { id: 'abbrev', label: t('protocols.filter') },
    { id: 'fields', label: t('protocols.fields'), num: true }, { id: 'enabled', label: t('protocols.enabled') },
  ], rows, { note: t('protocols.note', { protocols: rows.length, fields: FIELDS.size }) });
}
