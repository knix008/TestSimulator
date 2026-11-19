// File → Export Packet Dissections (plain text, CSV, JSON, PDML, PSML, C arrays), Export Objects,
// Export Packet Bytes and Export Specified Packets, producing what Wireshark/tshark produce.
//
// Inputs are explicit: frames (CaptureFile.frames), summaries (Summary[] parallel to frames, may have holes)
// and getDissection(frame) → Dissection, so the UI can pass its cache.

import { parseRange, inRange } from './ranges.js';

const CREATOR = 'wireshark/4.6.0';
const enc = new TextEncoder();

// ───────────────────────── shared helpers

const hex2 = (b) => (b < 16 ? '0' : '') + b.toString(16);
const printable = (b) => b >= 0x20 && b < 0x7f;
const nodesOf = (d, a) => d?.fields?.get(a) || [];
const firstNode = (d, a) => nodesOf(d, a)[0] || null;
const firstValue = (d, a) => { const n = firstNode(d, a); return n ? n.value : undefined; };
const num = (v) => (typeof v === 'bigint' ? Number(v) : v);

/** Bytes of a node in its data source (whole frame when node is null). */
export function exportPacketBytes(d, node = null) {
  if (!d?.sources?.length) return new Uint8Array(0);
  if (!node) return d.sources[0].data.slice();
  const src = d.sources[node.source || 0]?.data;
  if (!src) return new Uint8Array(0);
  return src.slice(node.start || 0, (node.start || 0) + (node.length || 0));
}

const frameTime = (f) => (f.sec || 0) + (f.nsec || 0) / 1e9;

// Time column like Wireshark's default "Seconds since beginning of capture" (6 decimals).
function relTimes(frames, reference) {
  if (!frames.length) return () => '';
  const ref = reference || frames[0];
  const t0s = ref.sec || 0;
  const t0n = ref.nsec || 0;
  return (f) => {
    let ds = (f.sec || 0) - t0s;
    let dn = (f.nsec || 0) - t0n;
    if (dn < 0) { dn += 1e9; ds -= 1; }
    const total = ds + dn / 1e9;
    return total.toFixed(6);
  };
}

function summaryOf(frame, i, summaries, getDissection) {
  const s = summaries?.[i];
  if (s) return s;
  const d = getDissection?.(frame);
  const c = d?.columns || {};
  return { no: frame.no, protocol: c.protocol ?? '', info: c.info ?? '', src: c.src ?? '', dst: c.dst ?? '', length: frame.len };
}

// Default packet-list columns.
export const DEFAULT_COLUMNS = [
  { id: 'no', title: 'No.' }, { id: 'time', title: 'Time' }, { id: 'src', title: 'Source' },
  { id: 'dst', title: 'Destination' }, { id: 'protocol', title: 'Protocol' }, { id: 'length', title: 'Length' },
  { id: 'info', title: 'Info' },
];

// Column spec: { id: 'no'|'time'|'src'|'dst'|'protocol'|'length'|'info', title } or { field: 'ip.ttl', title }
// or { title, get(frame, summary, dissection) }.
function columnValue(col, frame, sum, timeOf, getDissection) {
  if (col.get) return String(col.get(frame, sum, getDissection?.(frame)) ?? '');
  if (col.field) {
    const d = getDissection?.(frame);
    return nodesOf(d, col.field).map((n) => showValue(n, null, 'text')).join(',');
  }
  switch (col.id) {
    case 'no': return String(frame.no);
    case 'time': return timeOf(frame);
    case 'src': return String(sum.src ?? '');
    case 'dst': return String(sum.dst ?? '');
    case 'protocol': return String(sum.protocol ?? '');
    case 'length': return String(sum.length ?? frame.len);
    case 'info': return String(sum.info ?? '');
    default: return '';
  }
}

function selectIndices(frames, opts) {
  if (!opts?.only) return frames.map((_, i) => i);
  const set = opts.only instanceof Set ? opts.only : new Set(opts.only);
  const out = [];
  frames.forEach((f, i) => { if (set.has(f.no)) out.push(i); });
  return out;
}

// ───────────────────────── value rendering ("show" strings as tshark prints them)

function hexPad(v, digits) {
  let s = (typeof v === 'bigint' ? v : Number(v) >>> 0).toString(16);
  while (s.length < digits) s = '0' + s;
  return '0x' + s;
}

const p2 = (n) => (n < 10 ? '0' : '') + n;
function isoTime(t) {
  const dt = new Date((t.sec || 0) * 1000);
  return `${dt.getUTCFullYear()}-${p2(dt.getUTCMonth() + 1)}-${p2(dt.getUTCDate())}T${p2(dt.getUTCHours())}:${p2(dt.getUTCMinutes())}:${p2(dt.getUTCSeconds())}.${String(t.nsec || 0).padStart(9, '0')}Z`;
}

const bytesColon = (b) => Array.from(b, hex2).join(':');
const bytesPlain = (b) => Array.from(b, hex2).join('');

/**
 * The value string tshark shows for a field.
 * mode 'json' (booleans 1/0), 'pdml' (booleans True/False), 'text'.
 * Integer fields use hex when the field registry says base hex, or when the label shows the value as 0x….
 */
export function showValue(node, fields, mode = 'json') {
  const v = node.value;
  switch (node.type) {
    case 'uint': case 'int': case 'uint64': case 'int64': case 'framenum': case 'char': {
      if (v === null || v === undefined) return '';
      const f = fields?.get?.(node.abbrev);
      // tshark pads hex to the field's byte width (a 12-bit tcp.flags prints as 0x0002). A label without
      // "0x" means the field is shown another way (OUI, severity names): tshark then prints decimal.
      if (f && (f.base === 'hex' || f.base === 'hex_dec') && (!node.label || node.label.includes('0x'))) {
        return hexPad(v, Math.max(2, Math.ceil((f.bits || 8) / 8) * 2));
      }
      if (!f && node.label) {
        const m = /0x([0-9a-fA-F]+)/.exec(node.label);
        // "80 (0x50)" is a decimal-first field; "IPv4 (0x0800)" / "0x0000 (0)" are hex-first
        if (m && BigInt('0x' + m[1]) === BigInt(v) && !node.label.includes(`${v} (0x`)) return '0x' + m[1].toLowerCase();
      }
      return String(v);
    }
    case 'bool': {
      const on = typeof v === 'boolean' ? v : !!Number(v);
      return mode === 'pdml' ? (on ? 'True' : 'False') : on ? '1' : '0';
    }
    case 'bytes': return v instanceof Uint8Array ? bytesColon(v) : String(v ?? '');
    case 'abs_time': return v && typeof v === 'object' ? isoTime(v) : String(v ?? '');
    case 'rel_time': return typeof v === 'number' ? v.toFixed(9) : String(v ?? '');
    case 'none': case 'protocol': return '';
    default: return v === null || v === undefined ? '' : String(v);
  }
}

// ───────────────────────── plain text

const PAD = { no: [7, 'r'], time: [14, 'l'], src: [21, 'l'], dst: [21, 'l'], protocol: [8, 'l'], length: [6, 'l'] };
function padCol(col, text, header) {
  const p = PAD[col.id];
  if (!p) return text;
  if (header) return text.padEnd(p[0]);
  return p[1] === 'r' ? text.padStart(p[0]) : text.padEnd(p[0]);
}
const joinRow = (cols, cells) => cells.join(' ').replace(/\s+$/, '');

/** Hex/ASCII dump as Wireshark prints packet bytes: "0000  00 11 … (16)   ascii". */
export function hexDump(data) {
  const lines = [];
  const w = data.length > 0xffff ? 8 : 4;
  for (let i = 0; i < data.length; i += 16) {
    const row = data.subarray(i, i + 16);
    const hex = Array.from(row, hex2).join(' ');
    let asc = '';
    for (const b of row) asc += printable(b) ? String.fromCharCode(b) : '.';
    lines.push(`${i.toString(16).padStart(w, '0')}  ${hex.padEnd(47)}   ${asc}`);
  }
  return lines.join('\n');
}

function treeLines(nodes, depth, expand, out, path) {
  for (const n of nodes || []) {
    if (n.hidden) continue;
    const label = n.generated ? `[${n.label}]` : n.label;
    out.push(' '.repeat(depth * 4) + label);
    const p = path ? `${path}/${n.abbrev || n.label}` : n.abbrev || n.label;
    if (n.children?.length && expand(n, p, depth)) treeLines(n.children, depth + 1, expand, out, p);
  }
}

/**
 * Plain text like "Export Packet Dissections → As Plain Text".
 * @param {Frame[]} frames
 * @param {Summary[]} summaries
 * @param {(f:Frame)=>Dissection} getDissection
 * @param {{ summary?: boolean, header?: boolean, details?: 'none'|'collapsed'|'expanded'|'displayed',
 *           expanded?: (node, path:string, depth:number) => boolean, bytes?: boolean, columns?: object[],
 *           only?: Set<number>|number[], time?: (frame)=>string, reference?: Frame }} [opts]
 *   Time column = seconds since `reference` (default: the first frame passed); pass all frames + `only` to keep capture times.
 *   details 'displayed' asks `expanded(node, path)` which subtrees are open in the UI.
 */
export function exportText(frames, summaries, getDissection, opts = {}) {
  const summary = opts.summary !== false;
  const header = opts.header !== false;
  const details = opts.details ?? 'expanded';
  const cols = opts.columns || DEFAULT_COLUMNS;
  const timeOf = opts.time || relTimes(frames, opts.reference);
  const expand = details === 'expanded' ? () => true : details === 'displayed' ? (opts.expanded || (() => false)) : () => false;
  const head = joinRow(cols, cols.map((c) => padCol(c, c.title, true)));
  const parts = [];
  const multi = details !== 'none' || opts.bytes;
  if (summary && header && !multi) parts.push(head);
  for (const i of selectIndices(frames, opts)) {
    const f = frames[i];
    const block = [];
    if (summary) {
      const s = summaryOf(f, i, summaries, getDissection);
      if (header && multi) block.push(head);
      block.push(joinRow(cols, cols.map((c) => padCol(c, columnValue(c, f, s, timeOf, getDissection)))));
    }
    if (multi) {
      const d = getDissection(f);
      if (summary) block.push('');
      if (details !== 'none') {
        const lines = [];
        treeLines(d.tree, 0, expand, lines, '');
        block.push(...lines);
        if (opts.bytes) block.push('');
      }
      if (opts.bytes) {
        const srcs = d.sources || [];
        srcs.forEach((s, k) => {
          if (srcs.length > 1) block.push(`${s.name || (k ? `Source ${k}` : `Frame (${s.data.length} bytes)`)}:`);
          block.push(hexDump(s.data));
          if (k < srcs.length - 1) block.push('');
        });
      }
      block.push('');
    }
    parts.push(block.join('\n'));
  }
  return parts.join('\n') + '\n';
}

// ───────────────────────── CSV

const csvQuote = (s) => `"${String(s).replace(/"/g, '""')}"`;

/** CSV of the packet-list columns ("Export Packet Dissections → As CSV"): every cell quoted. */
export function exportCsv(frames, summaries, getDissection, opts = {}) {
  const cols = opts.columns || DEFAULT_COLUMNS;
  const timeOf = opts.time || relTimes(frames, opts.reference);
  const lines = [cols.map((c) => csvQuote(c.title)).join(',')];
  for (const i of selectIndices(frames, opts)) {
    const f = frames[i];
    const s = summaryOf(f, i, summaries, getDissection);
    lines.push(cols.map((c) => csvQuote(columnValue(c, f, s, timeOf, getDissection))).join(','));
  }
  return lines.join('\n') + '\n';
}

// ───────────────────────── JSON (tshark -T json, duplicate keys merged into arrays)

function putKey(obj, key, value) {
  if (Object.prototype.hasOwnProperty.call(obj, key)) {
    const cur = obj[key];
    if (Array.isArray(cur) && cur.__dup) cur.push(value);
    else { const arr = [cur, value]; Object.defineProperty(arr, '__dup', { value: true }); obj[key] = arr; }
  } else obj[key] = value;
}

function jsonChildren(nodes, fields, opts) {
  const obj = {};
  for (const n of nodes || []) {
    const key = n.abbrev || n.label;
    const kids = n.children?.length ? jsonChildren(n.children, fields, opts) : null;
    if (!n.abbrev || n.type === 'protocol' || n.type === 'none') {
      putKey(obj, key, kids || '');
    } else {
      putKey(obj, key, showValue(n, fields, 'json'));
      if (kids) putKey(obj, key + '_tree', kids);
    }
    if (opts.raw && n.abbrev && n.length) putKey(obj, key + '_raw', rawTuple(n));
  }
  return obj;
}

const rawTuple = (n) => [n.__bytesHex || '', n.start || 0, n.length || 0, 0, typeOrdinal(n.type)];
const typeOrdinal = (t) => ({ none: 0, protocol: 1, bool: 2, uint: 6, int: 13, string: 26, bytes: 29, ether: 30, ipv4: 34, ipv6: 35 }[t] ?? 0);

function localDate(sec) {
  const d = new Date((sec || 0) * 1000);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

/** One packet's `layers` object as tshark -T json prints it. */
export function jsonLayers(d, opts = {}) {
  const layers = {};
  for (const top of d.tree || []) {
    const key = top.abbrev || top.label;
    if (opts.protocols && !opts.protocols.includes(key)) continue;
    if (opts.raw) {
      for (const n of walk([top])) if (n.abbrev && n.length) n.__bytesHex = bytesPlain(exportPacketBytes(d, n));
    }
    putKey(layers, key, top.children?.length ? jsonChildren(top.children, opts.fields, opts) : '');
    if (opts.raw && top.length) putKey(layers, key + '_raw', rawTuple(top));
  }
  return layers;
}

function* walk(nodes) {
  for (const n of nodes || []) { yield n; if (n.children) yield* walk(n.children); }
}

/**
 * tshark -T json (with --no-duplicate-keys semantics: repeated keys become arrays).
 * @param {{ fields?: Map, only?: Set<number>|number[], protocols?: string[], raw?: boolean, indent?: number, asObject?: boolean }} [opts]
 * @returns {string} JSON text (or the array itself when opts.asObject)
 */
export function exportJson(frames, getDissection, opts = {}) {
  const out = [];
  for (const i of selectIndices(frames, opts)) {
    const f = frames[i];
    const d = getDissection(f);
    out.push({ _index: `packets-${localDate(f.sec)}`, _type: opts.legacyType ? 'doc' : undefined, _score: null, _source: { layers: jsonLayers(d, opts) } });
  }
  for (const o of out) if (o._type === undefined) delete o._type;
  if (opts.asObject) return out;
  return JSON.stringify(out, null, opts.indent ?? 2) + '\n';
}

// ───────────────────────── PDML / PSML

const xmlEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

function pdmlField(n, d, fields, depth, out) {
  const ind = '  '.repeat(depth);
  const isProto = n.type === 'protocol';
  const tag = isProto && depth > 1 ? 'proto' : 'field';
  const attrs = [];
  attrs.push(`name="${xmlEsc(n.abbrev || '')}"`);
  attrs.push(`showname="${xmlEsc(n.generated ? `[${n.label}]` : n.label)}"`);
  if (n.hidden) attrs.push('hide="yes"');
  attrs.push(`size="${n.length || 0}"`, `pos="${n.start || 0}"`);
  if (n.abbrev && !isProto && n.type !== 'none') attrs.push(`show="${xmlEsc(showValue(n, fields, 'pdml'))}"`);
  else if (!n.abbrev) attrs.push(`show="${xmlEsc(n.label)}"`);
  if (n.abbrev && n.length && !isProto && n.type !== 'none' && (n.source || 0) === 0) attrs.push(`value="${bytesPlain(exportPacketBytes(d, n))}"`);
  if (n.children?.length) {
    out.push(`${ind}<${tag} ${attrs.join(' ')}>`);
    for (const c of n.children) pdmlField(c, d, fields, depth + 1, out);
    out.push(`${ind}</${tag}>`);
  } else out.push(`${ind}<${tag} ${attrs.join(' ')}/>`);
}

/** PDML (tshark -T pdml). */
export function exportPdml(frames, getDissection, opts = {}) {
  const out = ['<?xml version="1.0" encoding="utf-8"?>', '<?xml-stylesheet type="text/xsl" href="pdml2html.xsl"?>'];
  const when = opts.time || new Date().toString().replace(/ GMT.*$/, '');
  out.push(`<pdml version="0" creator="${CREATOR}" time="${xmlEsc(when)}" capture_file="${xmlEsc(opts.fileName || '')}">`);
  for (const i of selectIndices(frames, opts)) {
    const f = frames[i];
    const d = getDissection(f);
    out.push('<packet>');
    out.push(`  <proto name="geninfo" pos="0" showname="General information" size="${f.caplen}">`);
    out.push(`    <field name="num" pos="0" show="${f.no}" showname="Number" value="${f.no.toString(16)}" size="${f.caplen}"/>`);
    out.push(`    <field name="len" pos="0" show="${f.len}" showname="Frame Length" value="${f.len.toString(16)}" size="${f.caplen}"/>`);
    out.push(`    <field name="caplen" pos="0" show="${f.caplen}" showname="Captured Length" value="${f.caplen.toString(16)}" size="${f.caplen}"/>`);
    out.push(`    <field name="timestamp" pos="0" show="${xmlEsc(isoTime(f))}" showname="Captured Time" value="${f.sec}.${String(f.nsec || 0).padStart(9, '0')}" size="${f.caplen}"/>`);
    out.push('  </proto>');
    for (const top of d.tree || []) {
      const attrs = `name="${xmlEsc(top.abbrev || '')}" showname="${xmlEsc(top.label)}" size="${top.length || 0}" pos="${top.start || 0}"`;
      if (!top.children?.length) { out.push(`  <proto ${attrs}/>`); continue; }
      out.push(`  <proto ${attrs}>`);
      for (const c of top.children) pdmlField(c, d, opts.fields, 2, out);
      out.push('  </proto>');
    }
    out.push('</packet>', '');
  }
  out.push('</pdml>');
  return out.join('\n') + '\n';
}

/** PSML (tshark -T psml): the packet-list columns as XML. */
export function exportPsml(frames, summaries, getDissection, opts = {}) {
  const cols = opts.columns || DEFAULT_COLUMNS;
  const timeOf = opts.time || relTimes(frames, opts.reference);
  const out = ['<?xml version="1.0" encoding="utf-8"?>', `<psml version="0" creator="${CREATOR}">`, '<structure>'];
  for (const c of cols) out.push(`<section>${xmlEsc(c.title)}</section>`);
  out.push('</structure>', '');
  for (const i of selectIndices(frames, opts)) {
    const f = frames[i];
    const s = summaryOf(f, i, summaries, getDissection);
    out.push('<packet>');
    for (const c of cols) out.push(`<section>${xmlEsc(columnValue(c, f, s, timeOf, getDissection))}</section>`);
    out.push('</packet>', '');
  }
  out.push('</psml>');
  return out.join('\n') + '\n';
}

// ───────────────────────── C arrays

function cArray(name, data, title) {
  const lines = [`/* ${title} */`, `static const unsigned char ${name}[${data.length}] = {`];
  for (let i = 0; i < data.length; i += 8) {
    const row = data.subarray(i, i + 8);
    const last = i + 8 >= data.length;
    let asc = '';
    for (const b of row) asc += printable(b) && b !== 0x2a && b !== 0x2f ? String.fromCharCode(b) : '.';
    lines.push(`${Array.from(row, (b) => '0x' + hex2(b)).join(', ')}${last ? '' : ','} /* ${asc} */`);
  }
  lines.push('};');
  return lines.join('\n');
}

/** "Export Packet Dissections → As C Arrays": one array per packet (more per extra data source). */
export function exportCArrays(frames, getDissection, opts = {}) {
  const parts = [];
  for (const i of selectIndices(frames, opts)) {
    const f = frames[i];
    const d = getDissection ? getDissection(f) : null;
    const srcs = d?.sources?.length ? d.sources : [{ name: `Frame (${f.data.length} bytes)`, data: f.data }];
    srcs.forEach((s, k) => {
      const title = k === 0 ? `Frame (${s.data.length} bytes)` : `${(s.name || 'Data').replace(/\s*\(\d+ bytes\)$/, '')} (${s.data.length} bytes)`;
      parts.push(cArray(k === 0 ? `pkt${f.no}` : `pkt${f.no}_${k}`, s.data, title));
    });
    parts.push('');
  }
  return parts.filter(Boolean).join('\n\n') + '\n';
}

// ───────────────────────── Export Objects

// Wireshark's HTTP object filename: the last path segment of the request URI, query string included.
const basename = (uri) => {
  const p = String(uri || '').split('#')[0];
  const q = p.indexOf('?');
  const path = q < 0 ? p : p.slice(0, q);
  const parts = path.split('/');
  const last = parts[parts.length - 1] || parts[parts.length - 2] || '';
  return last + (q < 0 ? '' : p.slice(q));
};

// The HTTP body of a frame: http.file_data (often in a reassembled / de-chunked / decompressed source),
// else the bytes after the header block inside the http node.
function httpBody(d) {
  const fd = firstNode(d, 'http.file_data');
  if (fd && fd.length) return exportPacketBytes(d, fd);
  if (fd && typeof fd.value === 'string' && fd.value) return enc.encode(fd.value);
  for (const a of ['media', 'data', 'data-text-lines', 'json', 'xml', 'png', 'image-jfif', 'image-gif']) {
    const n = firstNode(d, a);
    if (n?.length) return exportPacketBytes(d, n);
  }
  const h = firstNode(d, 'http');
  if (!h?.length) return null;
  const bytes = exportPacketBytes(d, h);
  for (let i = 0; i + 3 < bytes.length; i++) {
    if (bytes[i] === 13 && bytes[i + 1] === 10 && bytes[i + 2] === 13 && bytes[i + 3] === 10) return bytes.subarray(i + 4);
  }
  return null;
}

const ctype = (d) => {
  const v = firstValue(d, 'http.content_type');
  return v === undefined ? '' : String(v).split(';')[0].trim();
};

function exportHttp(frames, summaries, getDissection) {
  const out = [];
  const byNo = new Map(frames.map((f) => [f.no, f]));
  const lastReq = new Map(); // tcp.stream → request info, for responses without http.request_in
  frames.forEach((f, i) => {
    const s = summaries?.[i];
    if (s?.layers && !/(^|:)http(:|$)/.test(s.layers)) return;
    const d = getDissection(f);
    if (!d || !firstNode(d, 'http')) return;
    const stream = num(firstValue(d, 'tcp.stream'));
    const isReq = firstNode(d, 'http.request') || firstValue(d, 'http.request.method') !== undefined;
    if (isReq) {
      const info = { host: String(firstValue(d, 'http.host') ?? ''), uri: String(firstValue(d, 'http.request.uri') ?? '') };
      lastReq.set(stream, info);
      const body = httpBody(d);
      if (body?.length) out.push({ frame: f.no, hostname: info.host, contentType: ctype(d), size: body.length, filename: basename(info.uri), data: body.slice() });
      return;
    }
    if (!(firstNode(d, 'http.response') || firstValue(d, 'http.response.code') !== undefined)) return;
    let info = lastReq.get(stream) || { host: '', uri: '' };
    const reqIn = num(firstValue(d, 'http.request_in'));
    if (reqIn && byNo.has(reqIn)) {
      const rd = getDissection(byNo.get(reqIn));
      info = { host: String(firstValue(rd, 'http.host') ?? info.host), uri: String(firstValue(rd, 'http.request.uri') ?? info.uri) };
    }
    const body = httpBody(d) || new Uint8Array(0);
    if (!body.length && !firstNode(d, 'http.content_length')) return;
    out.push({ frame: f.no, hostname: info.host, contentType: ctype(d), size: body.length, filename: basename(info.uri), data: body.slice() });
  });
  return out;
}

// TFTP: transfers keyed by the client's address:port (the server answers from a new port).
function exportTftp(frames, summaries, getDissection) {
  const transfers = new Map();
  const out = [];
  frames.forEach((f, i) => {
    const s = summaries?.[i];
    if (s?.layers && !/(^|:)tftp(:|$)/.test(s.layers)) return;
    const d = getDissection(f);
    if (!d || !firstNode(d, 'tftp')) return;
    const op = num(firstValue(d, 'tftp.opcode'));
    const src = `${firstValue(d, 'ip.src') ?? firstValue(d, 'ipv6.src')}:${firstValue(d, 'udp.srcport')}`;
    const dst = `${firstValue(d, 'ip.dst') ?? firstValue(d, 'ipv6.dst')}:${firstValue(d, 'udp.dstport')}`;
    if (op === 1 || op === 2) {
      const name = String(firstValue(d, 'tftp.source_file') ?? firstValue(d, 'tftp.destination_file') ?? '');
      const t = { frame: f.no, hostname: String(firstValue(d, 'ip.dst') ?? firstValue(d, 'ipv6.dst') ?? ''), filename: name, blocks: new Map() };
      transfers.set(src, t);
      out.push(t);
    } else if (op === 3) {
      const t = transfers.get(dst) || transfers.get(src);
      if (!t) return;
      const block = num(firstValue(d, 'tftp.block'));
      let data = null;
      const dn = firstNode(d, 'data.data') || firstNode(d, 'tftp.data') || firstNode(d, 'data');
      if (dn) data = exportPacketBytes(d, dn);
      else {
        const u = firstNode(d, 'udp');
        if (u) data = exportPacketBytes(d, u).subarray(12);
      }
      t.blocks.set(block, data || new Uint8Array(0));
      t.last = f.no;
    }
  });
  return out.map((t) => {
    const keys = [...t.blocks.keys()].sort((a, b) => a - b);
    const size = keys.reduce((a, k) => a + t.blocks.get(k).length, 0);
    const data = new Uint8Array(size);
    let o = 0;
    for (const k of keys) { data.set(t.blocks.get(k), o); o += t.blocks.get(k).length; }
    return { frame: t.last || t.frame, hostname: t.hostname, contentType: '', size, filename: t.filename, data };
  });
}

// IMF (SMTP/POP/IMAP mail): each imf layer becomes one .eml object.
function exportImf(frames, summaries, getDissection) {
  const out = [];
  frames.forEach((f, i) => {
    const s = summaries?.[i];
    if (s?.layers && !/(^|:)imf(:|$)/.test(s.layers)) return;
    const d = getDissection(f);
    for (const n of nodesOf(d, 'imf')) {
      const data = exportPacketBytes(d, n);
      const subject = String(firstValue(d, 'imf.subject') ?? '');
      out.push({ frame: f.no, hostname: '', contentType: 'EML file', size: data.length, filename: (subject || `message${f.no}`).replace(/[\\/:*?"<>|]/g, '_') + '.eml', data });
    }
  });
  return out;
}

/**
 * File → Export Objects.
 * @param {'http'|'tftp'|'imf'|'smb'|'dicom'} kind
 * @returns {{frame:number, hostname:string, contentType:string, size:number, filename:string, data:Uint8Array}[]}
 *   'smb' and 'dicom' return [] (no reassembly of those yet).
 */
export function exportObjects(kind, frames, summaries, getDissection) {
  switch (kind) {
    case 'http': return exportHttp(frames, summaries, getDissection);
    case 'tftp': return exportTftp(frames, summaries, getDissection);
    case 'imf': return exportImf(frames, summaries, getDissection);
    case 'smb': case 'dicom': return [];
    default: throw new Error(`Unknown export object kind "${kind}"`);
  }
}

// ───────────────────────── Export Specified Packets

const toSet = (x) => (x instanceof Set ? x : new Set(x || []));

/**
 * Which frames "Export Specified Packets" writes.
 * @param {Frame[]} frames
 * @param {{ range?: 'all'|'displayed'|'selected'|'marked'|'first-last'|'range', rangeText?: string,
 *           which?: 'captured'|'displayed', displayed?: Set<number>|number[], selected?: number|number[],
 *           marked?: Set<number>|number[], ignored?: Set<number>|number[], removeIgnored?: boolean }} opts
 *   range 'displayed' is shorthand for range 'all' + which 'displayed' (Wireshark's "All packets / Displayed").
 *   'first-last' = from the first to the last marked packet.
 * @returns {Frame[]} chosen frames, original objects in capture order
 */
export function selectFrames(frames, opts = {}) {
  let range = opts.range || 'all';
  let which = opts.which || 'captured';
  if (range === 'displayed') { range = 'all'; which = 'displayed'; }
  const displayed = opts.displayed ? toSet(opts.displayed) : null;
  const marked = toSet(opts.marked);
  const ignored = toSet(opts.ignored);
  const selected = toSet(Array.isArray(opts.selected) ? opts.selected : opts.selected !== undefined && opts.selected !== null ? [opts.selected] : []);
  let pass;
  if (range === 'all') pass = () => true;
  else if (range === 'selected') pass = (f) => selected.has(f.no);
  else if (range === 'marked') pass = (f) => marked.has(f.no);
  else if (range === 'first-last') {
    const m = [...marked].sort((a, b) => a - b);
    const lo = m[0] ?? Infinity;
    const hi = m[m.length - 1] ?? -Infinity;
    pass = (f) => f.no >= lo && f.no <= hi;
  } else if (range === 'range') {
    const parsed = parseRange(opts.rangeText || '', frames.length ? frames[frames.length - 1].no : 0);
    if (!parsed.ok) throw Object.assign(new Error(parsed.error), { code: parsed.code, at: parsed.at });
    pass = (f) => inRange(parsed, f.no);
  } else throw new Error(`Unknown range "${range}"`);
  return frames.filter((f) => pass(f)
    && (which !== 'displayed' || !displayed || displayed.has(f.no))
    && !(opts.removeIgnored && ignored.has(f.no)));
}

/**
 * Export Specified Packets: a new CaptureFile with the chosen frames.
 * Frames are copied and renumbered 1..n (as the saved file will be when reopened); `origNo` keeps the
 * number they had. Interfaces, section info and comments are kept (pass the result to writePcapng/writePcap).
 */
export function exportSpecified(file, frames, opts = {}) {
  const chosen = selectFrames(frames || file.frames, opts);
  const out = chosen.map((f, i) => ({ ...f, no: i + 1, origNo: f.no }));
  return { ...file, frames: out, size: undefined };
}

/** Counts shown in the Export Specified Packets dialog: { captured: {...}, displayed: {...} } per range kind. */
export function rangeCounts(frames, opts = {}) {
  const kinds = ['all', 'selected', 'marked', 'first-last'];
  if (opts.rangeText) kinds.push('range');
  const res = { captured: {}, displayed: {} };
  for (const k of kinds) {
    for (const which of ['captured', 'displayed']) {
      try { res[which][k] = selectFrames(frames, { ...opts, range: k, which }).length; } catch { res[which][k] = 0; }
    }
  }
  return res;
}
