// Between the main window and the analysis modules: turns statistics, follow-stream results,
// exports and small tools into the plain shapes the popups draw (popups-net.js):
//   table  { view: 'table', columns: [{ id, label, num?, fmt?, bar? }], rows: [{ id, cells, filter?, no?, severity? }], tabs?, tab?, note? }
//   tree   same as table, rows carry `depth` (pre-order)
//   props  { view: 'props', sections: [{ title, icon, rows: [[key, value]] }] }
//   text   { view: 'text', text, options?: [{ id, label }], option? }
//   packet { view: 'packet', lines: [{ depth, text }], hex }
//   chart  { view: 'chart', series: [{ name, color, style, points: [[x, y]] }], xLabel, yLabel, note? }
//   flow   { view: 'flow', nodes: [address], rows: [{ frame, time, from, to, label, comment, color }] }
//   follow { view: 'follow', segments: [{ dir, frame, text }], client, server, clientBytes, serverBytes, packets, streams, text }
import { FIELDS, PROTOCOLS } from './domain/dissect/index.js';
import { compileFilter } from './domain/filter/index.js';
import * as stats from './domain/analysis/stats.js';
import { followSegments, followStream } from './domain/analysis/follow.js';
import {
  exportCArrays, exportCsv, exportJson, exportObjects, exportPdml, exportPsml, exportSpecified, exportText, hexDump as exportHexDump, jsonLayers, selectFrames,
} from './domain/analysis/export.js';
import { displayValue, formatTime } from './domain/capture/doc.js';
import { parseRange } from './domain/analysis/ranges.js';
import { packetBytesView } from './packet-bytes.js';
import { btAttServer, btDevices, btHciSummary } from './stats-bluetooth.js';
import { packetDiagramView } from './packet-diagram.js';
import { dhcpStats, macBlocks, multicastStreams, rtpAnalysis, serviceResponseTime, sipStatistics, supportedProtocols } from './stats-more.js';

export const hexDump = (data) => exportHexDump(data);

// ───────────────────────── small helpers the app uses

const filterCache = new Map();
/** Does frame `index` of `doc` pass the display filter `text` (compiled once)? */
export function matchesFilter(doc, index, text) {
  let compiled = filterCache.get(text);
  if (!compiled) { compiled = compileFilter(text, { fields: FIELDS }); filterCache.set(text, compiled); if (filterCache.size > 50) filterCache.delete(filterCache.keys().next().value); }
  if (!compiled.ok) return false;
  try { return Boolean(compiled.test(doc.dissectOnce(index))); } catch { return false; }
}

/** The details tree as indented text lines. `expanded`: a Set of open node keys (null: everything). */
export function treeText(d, { all = true, expanded = null } = {}) {
  const lines = [];
  const walk = (nodes, depth) => {
    for (const node of nodes ?? []) {
      if (node.hidden) continue;
      const label = node.generated && !/^\[/.test(node.label) ? `[${node.label}]` : node.label;
      lines.push(`${'    '.repeat(depth)}${label}`);
      const key = node.abbrev ?? `text:${String(node.label).replace(/[\d.:]+/g, '#').slice(0, 40)}`;
      if (node.children?.length && (all || expanded?.has(key))) walk(node.children, depth + 1);
    }
  };
  walk(d?.tree, 0);
  return lines;
}

const summaryCellsOf = (doc, index, settings) => {
  const s = doc.summaries[index] ?? {};
  return [String(index + 1), formatTime(doc, index, doc.displayed.indexOf(index), settings.timeFormat, settings.timePrecision), s.src ?? '', s.dst ?? '', s.protocol ?? '', String(s.length ?? doc.frames[index].len), s.info ?? ''];
};
export const summaryLine = (doc, index, settings) => summaryCellsOf(doc, index, settings).join('\t');
export const summaryCsv = (doc, index, settings) => summaryCellsOf(doc, index, settings).map((c) => `"${c.replace(/"/g, '""')}"`).join(',');
export const jsonOf = (d) => ({ _source: { layers: jsonLayers(d, { fields: FIELDS }) } });

/** Protocols for the filter expression window and Enabled Protocols. */
export function protocolList() {
  return PROTOCOLS.map((p) => ({ abbrev: p.abbrev, name: p.name, short: p.short })).sort((a, b) => a.abbrev.localeCompare(b.abbrev));
}

/** Fields of one protocol: [{ abbrev, name, type, strings: [[value, label]] }]. */
export function fieldList(protocol) {
  if (!protocol) return null;
  const out = [];
  for (const f of FIELDS.values()) {
    if (f.abbrev === protocol || !(f.protocol === protocol || f.abbrev.startsWith(`${protocol}.`))) continue;
    if (f.type === 'protocol') continue;
    const strings = f.strings ? (f.strings instanceof Map ? [...f.strings.entries()] : Object.entries(f.strings)).slice(0, 400).map(([v, l]) => [String(v), String(l)]) : null;
    out.push({ abbrev: f.abbrev, name: f.name, type: f.type, strings });
  }
  return out.sort((a, b) => a.abbrev.localeCompare(b.abbrev));
}

// ───────────────────────── exports and printing

function chosenIndices(doc, opts) {
  const marked = [...doc.marked].map((i) => i + 1);
  if (opts.range === 'selected') return doc.selected >= 0 ? [doc.selected] : [];
  if (opts.range === 'marked') return [...doc.marked].sort((a, b) => a - b);
  const frames = selectFrames(doc.frames.slice(0, doc.passed), {
    range: opts.range === 'custom' ? 'range' : opts.range, rangeText: opts.custom,
    which: opts.range === 'displayed' ? 'displayed' : 'captured',
    displayed: doc.displayed.map((i) => i + 1), marked, ignored: [...doc.ignored].map((i) => i + 1), selected: doc.selected >= 0 ? doc.selected + 1 : null,
  });
  return frames.map((f) => (f.no ?? 1) - 1);
}

/** File › Export: returns { text | bytes, extension, mime }. */
export function exportDoc(doc, opts) {
  const indices = chosenIndices(doc, opts);
  const frames = indices.map((i) => doc.frames[i]);
  const summaries = indices.map((i) => doc.summaries[i]);
  const get = (frame) => doc.dissectOnce((frame.no ?? 1) - 1);
  const time = (frame) => formatTime(doc, frame.no - 1, doc.displayed.indexOf(frame.no - 1), opts.settings.timeFormat, opts.settings.timePrecision);
  const expanded = opts.expanded;
  const keyOf = (node) => node.abbrev ?? `text:${String(node.label).replace(/[\d.:]+/g, '#').slice(0, 40)}`;
  const common = { summary: opts.summary, header: opts.header, details: opts.details, bytes: opts.bytes, fields: FIELDS, time, expanded: (node) => Boolean(expanded?.has(keyOf(node))), fileName: doc.name };
  switch (opts.format) {
    case 'pcapng': case 'pcap': {
      const file = { ...doc.file, frames };
      return { bytes: exportSpecified(file, frames, { format: opts.fileType ?? 'pcapng' }), extension: opts.fileType ?? 'pcapng' };
    }
    case 'csv': return { text: `﻿${exportCsv(frames, summaries, get, common)}`, extension: 'csv', mime: 'text/csv' };
    case 'json': return { text: exportJson(frames, get, common), extension: 'json', mime: 'application/json' };
    case 'pdml': return { text: exportPdml(frames, get, common), extension: 'pdml', mime: 'application/xml' };
    case 'psml': return { text: exportPsml(frames, summaries, get, common), extension: 'psml', mime: 'application/xml' };
    case 'c': return { text: exportCArrays(frames, get, common), extension: 'c' };
    default: return { text: exportText(frames, summaries, get, common), extension: 'txt' };
  }
}

const esc = (value) => String(value ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/**
 * The lines to print, per packet (print/packets.js lays them on sheets): the summary line (with the
 * column headings above it), the details (none / collapsed / as displayed / all expanded) and the bytes.
 */
export function printModel(doc, opts) {
  const indices = chosenIndices(doc, { range: opts.range, custom: opts.custom });
  const settings = opts.settings;
  const widths = [6, 12, 22, 22, 10, 7];
  const pad = (text, width) => (String(text).length >= width ? `${String(text).slice(0, width - 1)} ` : String(text).padEnd(width));
  const heading = ['No.', 'Time', 'Source', 'Destination', 'Protocol', 'Length'].map((h, i) => pad(h, widths[i])).join('') + 'Info';
  const packets = indices.map((index) => {
    const lines = [];
    if (opts.summary !== false) {
      if (opts.columnHeader !== false) lines.push(heading);
      const cells = summaryCellsOf(doc, index, settings);
      lines.push(cells.slice(0, 6).map((c, i) => pad(c, widths[i])).join('') + cells[6]);
    }
    if (opts.details && opts.details !== 'none') {
      if (lines.length) lines.push('');
      const d = doc.dissectOnce(index);
      if (opts.details === 'collapsed') lines.push(...treeText(d, { all: false, expanded: new Set() }));
      else if (opts.details === 'displayed') lines.push(...treeText(d, { all: false, expanded: opts.expanded ?? new Set() }));
      else lines.push(...treeText(d, { all: true }));
    }
    if (opts.bytes) {
      if (lines.length) lines.push('');
      lines.push(...exportHexDump(doc.frames[index].data).replace(/\n$/, '').split('\n'));
    }
    return { no: index + 1, lines };
  });
  return { title: doc.name, packets };
}

/** The bytes of one exported object (Export Objects › Save). */
export function objectBytes(doc, data) {
  const list = objectsOf(doc, data.objectKind);
  return list[Number(data.id)]?.data ?? new Uint8Array(0);
}

const objectCache = new WeakMap();
function objectsOf(doc, kind) {
  let byKind = objectCache.get(doc);
  if (!byKind || byKind.count !== doc.passed) { byKind = { count: doc.passed }; objectCache.set(doc, byKind); }
  if (!byKind[kind]) {
    const frames = doc.frames.slice(0, doc.passed);
    byKind[kind] = exportObjects(kind, frames, doc.summaries, (frame) => doc.dissectOnce((frame.no ?? 1) - 1));
  }
  return byKind[kind];
}

// ───────────────────────── statistics

const first = (d, name) => d?.fields?.get(name)?.[0]?.value;
const all = (d, name) => (d?.fields?.get(name) ?? []).map((n) => n.value);
const v = (ip) => (String(ip).includes(':') ? 'ipv6' : 'ip');

/**
 * One statistics window's data. src: { doc, indices, frames, summaries, get(frame) }.
 * opts: the popup's options plus { settings, t, lang }.
 */
export function computeStat(kind, src, opts) {
  const { t } = opts;
  switch (kind) {
    case 'packet': return packetWindow(src.doc, opts.index ?? src.doc.selected);
    case 'firewall': return firewallRules(src.doc, opts.index ?? src.doc.selected, opts.product ?? 'iptables', t);
    case 'credentials': return credentials(src, t);
    case 'resolved': return resolvedAddresses(src, t);
    case 'sip': return sipFlows(src, t);
    case 'rtp': return rtpStreams(src, t);
    case 'wlan': return wlanTraffic(src, t);
    case 'srt': return serviceResponseTime(src, t);
    case 'multicast': return multicastStreams(src, t);
    case 'dhcp': return dhcpStats(src, t);
    case 'sipStats': return sipStatistics(src, t);
    case 'rtpAnalysis': return rtpAnalysis(src, t);
    case 'macBlocks': return macBlocks(src, t);
    case 'protocols': return supportedProtocols(src, t);
    case 'packetBytes': return packetBytesView(src.doc, opts, t);
    case 'btDevices': return btDevices(src, t);
    case 'btHciSummary': return btHciSummary(src, t);
    case 'btAttServer': return btAttServer(src, t);
    case 'packetDiagram': return packetDiagramView(src.doc, opts, t);
    case 'objects': return objectsTable(src.doc, opts.objectKind ?? 'http', t);
    case 'follow': return follow(src, opts);
    default: return statsTable(kind, src, opts);
  }
}

function packetWindow(doc, index) {
  if (index == null || index < 0) return { error: 'no packet' };
  const d = doc.dissection(index);
  const lines = [];
  const walk = (nodes, depth) => { for (const n of nodes ?? []) { if (n.hidden) continue; lines.push({ depth, text: n.generated && !/^\[/.test(n.label) ? `[${n.label}]` : n.label }); walk(n.children, depth + 1); } };
  walk(d.tree, 0);
  return { view: 'packet', lines, hex: exportHexDump(doc.frames[index].data) };
}

const FIREWALLS = [
  ['iptables', 'Netfilter (iptables)'], ['nftables', 'Netfilter (nftables)'], ['netsh', 'Windows Firewall (netsh)'], ['powershell', 'Windows Firewall (PowerShell)'],
  ['cisco', 'Cisco IOS (extended)'], ['ipfw', 'IPFirewall (ipfw)'], ['pf', 'Packet Filter (pf)'], ['ufw', 'Uncomplicated Firewall (ufw)'],
];

function firewallRules(doc, index, product, t) {
  if (index == null || index < 0) return { error: t('notice.selectPacket') };
  const d = doc.dissection(index);
  const src = first(d, 'ip.src') ?? first(d, 'ipv6.src');
  const dst = first(d, 'ip.dst') ?? first(d, 'ipv6.dst');
  const mac = first(d, 'eth.src');
  const tcp = first(d, 'tcp.dstport') != null;
  const proto = tcp ? 'tcp' : first(d, 'udp.dstport') != null ? 'udp' : null;
  const dport = first(d, `${proto}.dstport`);
  const sport = first(d, `${proto}.srcport`);
  const lines = [];
  const add = (comment, rule) => lines.push(`# ${comment}`, rule, '');
  const rule = {
    iptables: () => {
      if (mac) add('MAC source', `iptables -A INPUT -m mac --mac-source ${mac} -j DROP`);
      if (src) add('IP source', `iptables -A INPUT -s ${src} -j DROP`);
      if (dst) add('IP destination', `iptables -A INPUT -d ${dst} -j DROP`);
      if (proto) add(`${proto.toUpperCase()} destination port`, `iptables -A INPUT -p ${proto} --dport ${dport} -j DROP`);
      if (src && dst && proto) add('IP and port pair', `iptables -A INPUT -p ${proto} -s ${src} --sport ${sport} -d ${dst} --dport ${dport} -j DROP`);
    },
    nftables: () => {
      if (mac) add('MAC source', `nft add rule inet filter input ether saddr ${mac} drop`);
      if (src) add('IP source', `nft add rule inet filter input ${v(src)} saddr ${src} drop`);
      if (proto) add(`${proto.toUpperCase()} destination port`, `nft add rule inet filter input ${proto} dport ${dport} drop`);
      if (src && dst && proto) add('IP and port pair', `nft add rule inet filter input ${v(src)} saddr ${src} ${v(dst)} daddr ${dst} ${proto} sport ${sport} ${proto} dport ${dport} drop`);
    },
    netsh: () => {
      if (src) add('IP source', `netsh advfirewall firewall add rule name="MyNetManager ${src}" dir=in action=block remoteip=${src}`);
      if (proto) add(`${proto.toUpperCase()} destination port`, `netsh advfirewall firewall add rule name="MyNetManager ${proto} ${dport}" dir=in action=block protocol=${proto.toUpperCase()} localport=${dport}`);
      if (src && proto) add('IP and port pair', `netsh advfirewall firewall add rule name="MyNetManager ${src}:${sport}" dir=in action=block protocol=${proto.toUpperCase()} remoteip=${src} remoteport=${sport} localport=${dport}`);
    },
    powershell: () => {
      if (src) add('IP source', `New-NetFirewallRule -DisplayName "MyNetManager ${src}" -Direction Inbound -Action Block -RemoteAddress ${src}`);
      if (proto) add(`${proto.toUpperCase()} destination port`, `New-NetFirewallRule -DisplayName "MyNetManager ${proto} ${dport}" -Direction Inbound -Action Block -Protocol ${proto.toUpperCase()} -LocalPort ${dport}`);
    },
    cisco: () => {
      if (src) add('IP source', `access-list 101 deny ip host ${src} any`);
      if (dst) add('IP destination', `access-list 101 deny ip any host ${dst}`);
      if (proto) add(`${proto.toUpperCase()} destination port`, `access-list 101 deny ${proto} any any eq ${dport}`);
      if (src && dst && proto) add('IP and port pair', `access-list 101 deny ${proto} host ${src} eq ${sport} host ${dst} eq ${dport}`);
    },
    ipfw: () => {
      if (mac) add('MAC source', `add deny MAC any ${mac} in`);
      if (src) add('IP source', `add deny ip from ${src} to any in`);
      if (proto) add(`${proto.toUpperCase()} destination port`, `add deny ${proto} from any to any ${dport} in`);
    },
    pf: () => {
      if (src) add('IP source', `block in quick from ${src} to any`);
      if (proto) add(`${proto.toUpperCase()} destination port`, `block in quick proto ${proto} from any to any port ${dport}`);
      if (src && dst && proto) add('IP and port pair', `block in quick proto ${proto} from ${src} port ${sport} to ${dst} port ${dport}`);
    },
    ufw: () => {
      if (src) add('IP source', `ufw deny from ${src}`);
      if (proto) add(`${proto.toUpperCase()} destination port`, `ufw deny ${dport}/${proto}`);
      if (src && proto) add('IP and port pair', `ufw deny proto ${proto} from ${src} port ${sport} to ${dst ?? 'any'} port ${dport}`);
    },
  }[product] ?? (() => {});
  rule();
  return { view: 'text', text: lines.join('\n') || '# —', options: FIREWALLS.map(([id, label]) => ({ id, label })), option: product };
}

function tableOf(columns, rows, extra = {}) { return { view: 'table', columns, rows, ...extra }; }

function credentials(src, t) {
  const rows = [];
  src.frames.forEach((frame, i) => {
    const d = src.get(frame);
    if (!d?.fields) return;
    const no = frame.no;
    const push = (protocol, user, secret, kind) => rows.push({ id: `${no}-${rows.length}`, no, filter: `frame.number == ${no}`, cells: { no, protocol, user, secret, kind } });
    const basic = first(d, 'http.authbasic') ?? first(d, 'http.authorization');
    if (basic) {
      let text = String(basic);
      const m = /^Basic\s+([A-Za-z0-9+/=]+)/i.exec(text);
      if (m) { try { text = atob(m[1]); } catch { /* keep */ } }
      const [user, ...pass] = text.split(':');
      push('HTTP', user, pass.join(':') || text, 'Basic');
    }
    for (const proto of ['ftp', 'pop', 'imap', 'smtp']) {
      const cmd = String(first(d, `${proto}.request.command`) ?? '').toUpperCase();
      const arg = first(d, `${proto}.request.arg`) ?? first(d, `${proto}.request.parameter`);
      if (cmd === 'USER') push(proto.toUpperCase(), String(arg ?? ''), '', 'USER');
      else if (cmd === 'PASS') push(proto.toUpperCase(), '', String(arg ?? ''), 'PASS');
      else if (cmd === 'LOGIN' || cmd === 'AUTH') push(proto.toUpperCase(), String(arg ?? ''), '', cmd);
    }
    void i;
  });
  return tableOf([{ id: 'no', label: t('column.no'), num: true }, { id: 'protocol', label: t('column.protocol') }, { id: 'user', label: 'User' }, { id: 'secret', label: 'Password' }, { id: 'kind', label: 'Type' }], rows, { empty: t('stats.empty') });
}

function resolvedAddresses(src, t) {
  const hosts = new Map();
  const macs = new Map();
  for (const frame of src.frames) {
    const d = src.get(frame);
    if (!d?.fields) continue;
    if (first(d, 'dns.flags.response')) {
      const name = first(d, 'dns.qry.name');
      for (const a of [...all(d, 'dns.a'), ...all(d, 'dns.aaaa')]) if (name) hosts.set(String(a), String(name));
    }
    for (const side of ['src', 'dst']) {
      const mac = first(d, `eth.${side}`);
      const vendor = first(d, `eth.${side}.oui_resolved`) ?? first(d, `eth.${side}_resolved`);
      if (mac && vendor && !macs.has(mac)) macs.set(String(mac), String(vendor));
    }
  }
  const rows = [
    ...[...hosts].map(([ip, name], i) => ({ id: `h${i}`, filter: `${v(ip)}.addr == ${ip}`, cells: { address: ip, name, source: 'DNS' } })),
    ...[...macs].map(([mac, name], i) => ({ id: `m${i}`, filter: `eth.addr == ${mac}`, cells: { address: mac, name, source: 'OUI' } })),
  ];
  return tableOf([{ id: 'address', label: t('capopts.addresses') }, { id: 'name', label: t('netmap.name') }, { id: 'source', label: 'Source' }], rows);
}

function sipFlows(src, t) {
  const calls = new Map();
  for (const frame of src.frames) {
    const d = src.get(frame);
    const callId = first(d, 'sip.Call-ID');
    if (!callId) continue;
    let call = calls.get(callId);
    if (!call) { call = { callId, from: first(d, 'sip.from.addr') ?? first(d, 'sip.From') ?? '', to: first(d, 'sip.to.addr') ?? first(d, 'sip.To') ?? '', start: frame.sec + frame.nsec / 1e9, packets: 0, state: '', first: frame.no }; calls.set(callId, call); }
    call.packets += 1;
    call.end = frame.sec + frame.nsec / 1e9;
    const method = first(d, 'sip.Method');
    const status = first(d, 'sip.Status-Code');
    if (method === 'BYE') call.state = 'COMPLETED'; else if (status === 200 && call.state !== 'COMPLETED') call.state = 'IN CALL'; else if (method === 'INVITE' && !call.state) call.state = 'CALL SETUP';
  }
  const rows = [...calls.values()].map((c, i) => ({ id: String(i), no: c.first, filter: `sip.Call-ID == "${c.callId}"`, cells: { from: String(c.from), to: String(c.to), state: c.state, packets: c.packets, duration: Number(((c.end ?? c.start) - c.start).toFixed(3)), callId: String(c.callId) } }));
  return tableOf([{ id: 'from', label: 'From' }, { id: 'to', label: 'To' }, { id: 'state', label: 'State' }, { id: 'packets', label: t('netmap.packets'), num: true }, { id: 'duration', label: 'Duration (s)', num: true, fmt: 'float' }, { id: 'callId', label: 'Call-ID' }], rows);
}

function rtpStreams(src, t) {
  const streams = new Map();
  for (const frame of src.frames) {
    const d = src.get(frame);
    const ssrc = first(d, 'rtp.ssrc');
    if (ssrc == null) continue;
    const ipSrc = first(d, 'ip.src') ?? first(d, 'ipv6.src');
    const ipDst = first(d, 'ip.dst') ?? first(d, 'ipv6.dst');
    const key = `${ipSrc}|${ipDst}|${ssrc}`;
    let s = streams.get(key);
    const seq = Number(first(d, 'rtp.seq'));
    const time = frame.sec + frame.nsec / 1e9;
    if (!s) { s = { ipSrc, ipDst, sport: first(d, 'udp.srcport'), dport: first(d, 'udp.dstport'), ssrc, pt: first(d, 'rtp.p_type'), packets: 0, lost: 0, lastSeq: null, first: time, lastTime: time, maxDelta: 0, no: frame.no }; streams.set(key, s); }
    s.packets += 1;
    if (s.lastSeq != null && Number.isFinite(seq)) { const gap = (seq - s.lastSeq + 65536) % 65536; if (gap > 1 && gap < 1000) s.lost += gap - 1; }
    s.lastSeq = seq;
    s.maxDelta = Math.max(s.maxDelta, (time - s.lastTime) * 1000);
    s.lastTime = time;
  }
  const rows = [...streams.values()].map((s, i) => ({
    id: String(i), no: s.no, filter: `rtp.ssrc == 0x${Number(s.ssrc).toString(16).padStart(8, '0')}`,
    cells: { src: `${s.ipSrc}:${s.sport}`, dst: `${s.ipDst}:${s.dport}`, ssrc: `0x${Number(s.ssrc).toString(16).padStart(8, '0')}`, payload: s.pt ?? '', packets: s.packets, lost: s.lost, maxDelta: Number(s.maxDelta.toFixed(3)), duration: Number((s.lastTime - s.first).toFixed(3)) },
  }));
  return tableOf([{ id: 'src', label: t('column.src') }, { id: 'dst', label: t('column.dst') }, { id: 'ssrc', label: 'SSRC' }, { id: 'payload', label: 'Payload' }, { id: 'packets', label: t('netmap.packets'), num: true }, { id: 'lost', label: 'Lost', num: true }, { id: 'maxDelta', label: 'Max delta (ms)', num: true, fmt: 'float' }, { id: 'duration', label: 'Duration (s)', num: true, fmt: 'float' }], rows);
}

function wlanTraffic(src, t) {
  const nets = new Map();
  for (const frame of src.frames) {
    const d = src.get(frame);
    const bssid = first(d, 'wlan.bssid');
    if (!bssid) continue;
    let n = nets.get(bssid);
    if (!n) { n = { bssid, ssid: '', channel: '', packets: 0, beacons: 0, data: 0, no: frame.no }; nets.set(bssid, n); }
    n.packets += 1;
    const ssid = first(d, 'wlan.ssid');
    if (ssid) n.ssid = String(ssid);
    const ch = first(d, 'wlan_radio.channel') ?? first(d, 'radiotap.channel.freq');
    if (ch) n.channel = String(ch);
    const subtype = first(d, 'wlan.fc.type_subtype');
    if (subtype === 8) n.beacons += 1; else if (first(d, 'wlan.fc.type') === 2) n.data += 1;
  }
  const rows = [...nets.values()].map((n, i) => ({ id: String(i), no: n.no, filter: `wlan.bssid == ${n.bssid}`, cells: n }));
  return tableOf([{ id: 'bssid', label: 'BSSID' }, { id: 'ssid', label: 'SSID' }, { id: 'channel', label: 'Channel' }, { id: 'packets', label: t('netmap.packets'), num: true }, { id: 'beacons', label: 'Beacons', num: true }, { id: 'data', label: 'Data', num: true }], rows);
}

function objectsTable(doc, kind, t) {
  const list = objectsOf(doc, kind);
  const rows = list.map((o, i) => ({ id: String(i), no: o.frame, filter: `frame.number == ${o.frame}`, cells: { no: o.frame, hostname: o.hostname ?? '', contentType: o.contentType ?? '', size: o.size ?? o.data?.length ?? 0, filename: o.filename ?? '' } }));
  return { view: 'objects', columns: [{ id: 'no', label: t('column.no'), num: true }, { id: 'hostname', label: 'Hostname' }, { id: 'contentType', label: 'Content Type' }, { id: 'size', label: 'Size', num: true, fmt: 'bytes' }, { id: 'filename', label: 'Filename' }], rows };
}

function follow(src, opts) {
  const doc = src.doc;
  const frames = doc.frames.slice(0, doc.passed);
  const result = followStream(opts.kind ?? 'tcp', Number(opts.index ?? 0), frames, doc.summaries, (frame) => doc.dissectOnce((frame.no ?? 1) - 1), { sub: opts.sub });
  const segments = followSegments(result, opts.mode ?? 'ascii');
  const side = (p) => `${p.addr}${p.port != null ? `:${p.port}` : ''}`;
  return {
    view: 'follow', segments, client: side(result.client), server: side(result.server), clientBytes: result.client.bytes, serverBytes: result.server.bytes,
    packets: result.client.packets + result.server.packets, streams: result.streams, filter: result.filter, note: result.note, text: segments.map((s) => s.text).join(''),
  };
}

// The statistics module's results (domain/analysis/stats.js) adapted to tables, trees, charts and flows.
function statsTable(kind, src, opts) {
  const adapter = STAT_ADAPTERS[kind];
  if (!adapter) return { error: `unknown statistics "${kind}"` };
  return adapter(src, opts);
}

/** Filled in by the adapters below (they follow stats.js's documented return shapes). */
const STAT_ADAPTERS = {};
// ───────────────────────── statistics adapters (stats.js results → popup views)

const roundStat = (v) => (v == null || v === '' ? '-' : typeof v === 'number' && !Number.isInteger(v) ? v.toFixed(3) : String(v));
const KIND_LABEL = { eth: 'Ethernet', ipv4: 'IPv4', ipv6: 'IPv6', tcp: 'TCP', udp: 'UDP', sctp: 'SCTP', bluetooth: 'Bluetooth' };
const statOpts = (src, extra = {}) => ({ fields: FIELDS, protocols: PROTOCOLS, ...extra });
const absTime = (t) => (t && t.sec != null ? new Date(t.sec * 1000 + Math.floor((t.nsec ?? 0) / 1e6)).toLocaleString() : '-');
const bytesText = (n) => (n >= 1e9 ? `${(n / 1e9).toFixed(2)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(2)} MB` : n >= 1e3 ? `${(n / 1e3).toFixed(1)} kB` : `${n} B`);

/** A Wireshark stats tree ({ name, count, percent, rate, … children }) as tree rows. */
function statsTreeRows(tree, t, { filterOf = null } = {}) {
  const rows = [];
  const walk = (node, depth, path) => {
    const id = `${path}/${node.name}`;
    rows.push({ id, depth, filter: filterOf?.(node, depth) ?? null, cells: { name: node.name, count: node.count ?? 0, avg: node.avg ?? '', min: node.min ?? '', max: node.max ?? '', rate: node.rate ?? 0, percent: node.percent ?? '', burstRate: node.burstRate ?? 0, burstStart: node.burstStart ?? '' } });
    for (const c of node.children ?? []) walk(c, depth + 1, id);
  };
  if (Array.isArray(tree)) tree.forEach((n) => walk(n, 0, '')); else walk(tree, 0, '');
  const hasAvg = rows.some((r) => r.cells.avg !== '');
  return {
    view: 'tree', rows,
    columns: [
      { id: 'name', label: t('stats.topic') }, { id: 'count', label: t('stats.count'), num: true },
      ...(hasAvg ? [{ id: 'avg', label: t('stats.average'), num: true, fmt: 'float' }, { id: 'min', label: t('stats.min'), num: true }, { id: 'max', label: t('stats.max'), num: true }] : []),
      { id: 'rate', label: t('stats.rate'), num: true, fmt: 'float' }, { id: 'percent', label: t('stats.percent'), num: true, fmt: 'pct', bar: true },
      { id: 'burstRate', label: t('stats.burstRate'), num: true, fmt: 'float' }, { id: 'burstStart', label: t('stats.burstStart'), num: true, fmt: 'float' },
    ],
  };
}

const ADAPT = {
  properties(src, o, t) {
    const r = stats.captureProperties(src.frames, src.summaries, src.get, statOpts(src, { file: { ...src.doc.file, name: src.doc.name, size: src.doc.file.size }, displayed: src.doc.displayed.map((i) => i + 1), marked: [...src.doc.marked].map((i) => i + 1) }));
    const sections = [
      { title: t('props.file'), icon: 'captureProperties', rows: [[t('props.name'), r.file.name ?? src.doc.name], [t('props.format'), r.file.format ?? ''], [t('props.size'), r.file.size ? bytesText(r.file.size) : bytesText(src.doc.frames.reduce((n, f) => n + f.caplen + 32, 0))], [t('props.encapsulation'), r.file.encapsulation ?? ''], [t('props.snaplen'), String(r.file.snaplen ?? '')]] },
      { title: t('props.time'), icon: 'clock', rows: [[t('props.first'), absTime(r.time.first)], [t('props.last'), absTime(r.time.last)], [t('props.elapsed'), `${Number(r.time.elapsed ?? 0).toFixed(3)} s`]] },
      { title: t('props.capture'), icon: 'captureOptions', rows: [[t('props.hardware'), r.capture.hardware ?? '-'], [t('props.os'), r.capture.os ?? '-'], [t('props.application'), r.capture.application ?? '-'], [t('props.comment'), r.capture.comment ?? '-']] },
      ...r.interfaces.map((i) => ({ title: `${t('props.interface')} ${i.index}: ${i.name ?? ''}`, icon: 'interfaces', rows: [[t('props.description'), i.description ?? '-'], [t('props.filter'), i.filter ?? '-'], [t('props.encapsulation'), i.encapsulation ?? ''], [t('props.snaplen'), String(i.snaplen ?? '')], [t('report.packets'), String(i.packets ?? '')], [t('report.bytes'), bytesText(i.bytes ?? 0)]] })),
      { title: t('props.statistics'), icon: 'ioGraph', rows: r.statistics.map((x) => [x.label, `${roundStat(x.captured)}   |   ${t('props.displayed')}: ${roundStat(x.displayed)}${x.displayedPercent != null ? ` (${Number(x.displayedPercent).toFixed(1)}%)` : ''}   |   ${t('props.marked')}: ${roundStat(x.marked)}`]) },
      ...(r.comments?.length ? [{ title: t('props.comments'), icon: 'packetComment', rows: r.comments.map((x) => [`${t('column.no')} ${x.frame}`, x.comment]) }] : []),
    ];
    return { view: 'props', sections };
  },
  hierarchy(src, o, t) {
    const root = stats.protocolHierarchy(src.frames, src.summaries, src.get, statOpts(src));
    const rows = [];
    const walk = (n, depth, path) => {
      const id = `${path}/${n.abbrev}`;
      rows.push({ id, depth, filter: n.abbrev === 'frame' ? null : n.abbrev, cells: { name: n.name ?? n.abbrev, percentPackets: n.percentPackets ?? 0, packets: n.packets, percentBytes: n.percentBytes ?? 0, bytes: n.bytes, bps: n.bps ?? 0, endPackets: n.endPackets ?? 0, endBytes: n.endBytes ?? 0 } });
      for (const c of n.children ?? []) walk(c, depth + 1, id);
    };
    walk(root, 0, '');
    return {
      view: 'tree', rows,
      columns: [{ id: 'name', label: t('column.protocol') }, { id: 'percentPackets', label: t('stats.percentPackets'), num: true, fmt: 'pct', bar: true }, { id: 'packets', label: t('report.packets'), num: true }, { id: 'percentBytes', label: t('stats.percentBytes'), num: true, fmt: 'pct' }, { id: 'bytes', label: t('report.bytes'), num: true }, { id: 'bps', label: t('stats.bps'), num: true, fmt: 'bps' }, { id: 'endPackets', label: t('stats.endPackets'), num: true }, { id: 'endBytes', label: t('stats.endBytes'), num: true }],
    };
  },
  conversations(src, o, t) {
    const kinds = stats.CONVERSATION_KINDS;
    const counts = Object.fromEntries(kinds.map((k) => [k, stats.conversations(src.frames, src.summaries, src.get, statOpts(src, { kind: k })).rows.length]));
    const tab = kinds.includes(o.tab) ? o.tab : kinds.find((k) => counts[k] && k !== 'eth') ?? 'ipv4';
    const r = stats.conversations(src.frames, src.summaries, src.get, statOpts(src, { kind: tab }));
    const ports = tab === 'tcp' || tab === 'udp' || tab === 'sctp';
    const rows = r.rows.map((x, i) => ({ id: String(i), filter: x.filter, cells: { addrA: x.addrA, portA: x.portA ?? '', addrB: x.addrB, portB: x.portB ?? '', stream: x.stream ?? '', packets: x.packets, bytes: x.bytes, packetsAB: x.packetsAB, bytesAB: x.bytesAB, packetsBA: x.packetsBA, bytesBA: x.bytesBA, relStart: x.relStart, duration: x.duration, bpsAB: x.bpsAB, bpsBA: x.bpsBA } }));
    return {
      view: 'table', tab, rows, tabs: kinds.map((k) => ({ id: k, label: KIND_LABEL[k] ?? k, count: counts[k], icon: 'conversations' })),
      columns: [
        { id: 'addrA', label: t('stats.addrA') }, ...(ports ? [{ id: 'portA', label: t('stats.portA'), num: true }] : []), { id: 'addrB', label: t('stats.addrB') }, ...(ports ? [{ id: 'portB', label: t('stats.portB'), num: true }] : []),
        ...(ports ? [{ id: 'stream', label: t('column.stream'), num: true }] : []),
        { id: 'packets', label: t('report.packets'), num: true }, { id: 'bytes', label: t('report.bytes'), num: true, fmt: 'bytes' },
        { id: 'packetsAB', label: 'A → B', num: true }, { id: 'bytesAB', label: t('stats.bytesAB'), num: true, fmt: 'bytes' }, { id: 'packetsBA', label: 'B → A', num: true }, { id: 'bytesBA', label: t('stats.bytesBA'), num: true, fmt: 'bytes' },
        { id: 'relStart', label: t('stats.relStart'), num: true, fmt: 'time' }, { id: 'duration', label: t('stats.duration'), num: true, fmt: 'float' }, { id: 'bpsAB', label: t('stats.bpsAB'), num: true, fmt: 'bps' }, { id: 'bpsBA', label: t('stats.bpsBA'), num: true, fmt: 'bps' },
      ],
    };
  },
  endpoints(src, o, t) {
    const kinds = stats.CONVERSATION_KINDS;
    const counts = Object.fromEntries(kinds.map((k) => [k, stats.endpoints(src.frames, src.summaries, src.get, statOpts(src, { kind: k })).rows.length]));
    const tab = kinds.includes(o.tab) ? o.tab : kinds.find((k) => counts[k] && k !== 'eth') ?? 'ipv4';
    const r = stats.endpoints(src.frames, src.summaries, src.get, statOpts(src, { kind: tab }));
    const ports = tab === 'tcp' || tab === 'udp' || tab === 'sctp';
    return {
      view: 'table', tab, tabs: kinds.map((k) => ({ id: k, label: KIND_LABEL[k] ?? k, count: counts[k], icon: 'endpoints' })),
      rows: r.rows.map((x, i) => ({ id: String(i), filter: x.filter, cells: x })),
      columns: [{ id: 'addr', label: t('stats.address') }, ...(ports ? [{ id: 'port', label: t('stats.port'), num: true }] : []), { id: 'packets', label: t('report.packets'), num: true }, { id: 'bytes', label: t('report.bytes'), num: true, fmt: 'bytes' }, { id: 'txPackets', label: t('stats.txPackets'), num: true }, { id: 'txBytes', label: t('stats.txBytes'), num: true, fmt: 'bytes' }, { id: 'rxPackets', label: t('stats.rxPackets'), num: true }, { id: 'rxBytes', label: t('stats.rxBytes'), num: true, fmt: 'bytes' }],
    };
  },
  lengths: (src, o, t) => statsTreeRows(stats.packetLengths(src.frames, src.summaries, src.get, statOpts(src)), t),
  httpCounter: (src, o, t) => statsTreeRows(stats.httpPacketCounter(src.frames, src.summaries, src.get, statOpts(src)), t),
  httpRequests: (src, o, t) => statsTreeRows(stats.httpRequests(src.frames, src.summaries, src.get, statOpts(src)), t, { filterOf: (n, depth) => (depth === 1 ? `http.host == "${n.name}"` : null) }),
  httpLoad: (src, o, t) => statsTreeRows(stats.httpLoad(src.frames, src.summaries, src.get, statOpts(src)), t),
  dns: (src, o, t) => statsTreeRows(stats.dnsStats(src.frames, src.summaries, src.get, statOpts(src)), t),
  ipStats: (src, o, t) => statsTreeRows(stats.ipStats(src.frames, src.summaries, src.get, statOpts(src, { version: o.version === 6 ? 6 : 4 })), t, { filterOf: (n, depth) => (depth >= 1 && /^[\d.]+$|:/.test(n.name) ? `${o.version === 6 ? 'ipv6' : 'ip'}.addr == ${n.name}` : null) }),
  ports: (src, o, t) => statsTreeRows(stats.portTypes(src.frames, src.summaries, src.get, statOpts(src)), t),
  expert(src, o, t) {
    const r = stats.expertInfo(src.frames, src.summaries, src.get, statOpts(src));
    const order = { error: 0, warn: 1, note: 2, chat: 3 };
    const rows = [];
    const groups = [...r.items].sort((a, b) => order[a.severity] - order[b.severity] || b.count - a.count);
    groups.forEach((item, i) => {
      const id = `g${i}`;
      rows.push({ id, depth: 0, severity: item.severity, no: item.frames?.[0], filter: item.frames?.length ? `frame.number in {${item.frames.slice(0, 200).join(',')}}` : null, cells: { summary: item.summary, severity: t(`expert.${item.severity}`), group: item.group, protocol: item.protocol, count: item.count } });
      (item.frames ?? []).slice(0, 300).forEach((no) => rows.push({ id: `${id}-${no}`, depth: 1, severity: item.severity, no, filter: `frame.number == ${no}`, cells: { summary: `${t('column.no')} ${no}`, severity: '', group: '', protocol: '', count: '' } }));
    });
    return {
      view: 'tree', rows, note: t('stats.expertTotals', { error: r.bySeverity.error ?? 0, warn: r.bySeverity.warn ?? 0, note: r.bySeverity.note ?? 0, chat: r.bySeverity.chat ?? 0 }),
      columns: [{ id: 'summary', label: t('stats.summary') }, { id: 'severity', label: t('report.severity') }, { id: 'group', label: t('report.group') }, { id: 'protocol', label: t('column.protocol') }, { id: 'count', label: t('report.count'), num: true }],
    };
  },
  iograph(src, o, t) {
    const series = (o.series ?? []).map((s) => ({ name: s.name, filter: s.filter, calc: s.calc, field: s.field || undefined }));
    const r = stats.ioGraph(src.frames, src.summaries, src.get, statOpts(src, { interval: o.interval ?? 1, series }));
    const colors = (o.series ?? []).map((s) => s.color);
    return {
      view: 'chart', xLabel: t('chart.xTime'), yLabel: series.length === 1 ? t(`chart.calc.${series[0].calc}`) : t('chart.yValue'),
      series: r.series.map((s, i) => ({ name: s.name, color: colors[i] ?? '#1f77b4', style: o.series?.[i]?.style ?? 'line', points: r.times.map((x, k) => [x, Number(s.values[k] ?? 0)]) })),
    };
  },
  tcpgraph(src, o, t) {
    const type = o.graph === 'window' ? 'window' : o.graph ?? 'stevens';
    const r = stats.tcpStreamGraph(src.frames, src.summaries, src.get, statOpts(src, { stream: o.stream ?? 0, type, direction: o.reverse ? 1 : 'auto' }));
    const palette = ['#1f77b4', '#d62728', '#2ca02c', '#ff7f0e'];
    return {
      view: 'chart', xLabel: r.xLabel, yLabel: r.yLabel,
      note: r.direction ? `${r.direction.src}:${r.direction.srcport} → ${r.direction.dst}:${r.direction.dstport}` : '',
      series: r.series.map((s, i) => ({ name: s.name, color: palette[i % palette.length], style: s.kind === 'line' ? 'line' : s.kind === 'bars' ? 'bar' : 'dot', points: s.points.map((p) => [p.x, p.y]) })),
    };
  },
  flow(src, o, t) {
    const r = stats.flowGraph(src.frames, src.summaries, src.get, statOpts(src, { mode: o.flowType === 'tcp' ? 'tcp' : 'general', filter: o.filter || undefined, addresses: o.addresses }));
    const nodes = r.nodes;
    const index = new Map(nodes.map((n, i) => [n, i]));
    const PROTO_COLORS = {};
    let nextColor = 0;
    return {
      view: 'flow', nodes,
      rows: r.rows.map((x) => {
        PROTO_COLORS[x.protocol] ??= nextColor++;
        return { frame: x.frame, time: typeof x.time === 'number' ? x.time.toFixed(6) : String(x.time), from: index.get(x.src) ?? 0, to: index.get(x.dst) ?? 0, label: x.label, comment: x.comment ?? '', color: PROTO_COLORS[x.protocol] };
      }),
    };
  },
};
for (const [kind, fn] of Object.entries(ADAPT)) STAT_ADAPTERS[kind] = (src, opts) => fn(src, opts, opts.t);

export { STAT_ADAPTERS, stats, parseRange, displayValue };
