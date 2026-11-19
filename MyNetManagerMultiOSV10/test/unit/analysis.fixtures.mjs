// Hand-built packets and Dissection objects (ARCHITECTURE.md shapes) for the follow/export tests,
// independent of the real dissectors. Not a test file itself (no ".test." in the name).

const te = new TextEncoder();
export const bytes = (s) => (typeof s === 'string' ? te.encode(s) : Uint8Array.from(s));
const cat = (...parts) => { const n = parts.reduce((a, p) => a + p.length, 0); const o = new Uint8Array(n); let i = 0; for (const p of parts) { o.set(p, i); i += p.length; } return o; };
const be16 = (v) => [(v >> 8) & 255, v & 255];
const be32 = (v) => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
const ipb = (s) => s.split('.').map(Number);

export function ethIp(src, dst, proto, l4) {
  const ip = cat([0x45, 0, ...be16(20 + l4.length), 0, 0, 0, 0, 64, proto, 0, 0], ipb(src), ipb(dst), l4);
  return cat([0, 0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0, 0x11, 0x22, 0x33, 0x44, 0x55, 8, 0], ip);
}
export const tcpSeg = (sp, dp, seq, ack, flags, data = new Uint8Array(0)) =>
  cat([...be16(sp), ...be16(dp), ...be32(seq), ...be32(ack), 0x50, flags, 0xff, 0xff, 0, 0, 0, 0], bytes(data));
export const udpDgram = (sp, dp, data) => { const d = bytes(data); return cat([...be16(sp), ...be16(dp), ...be16(8 + d.length), 0, 0], d); };

let t = 1700000000;
export function makeFrame(no, data, dt = 1) {
  t += dt;
  return { no, sec: t, nsec: no * 1000, caplen: data.length, len: data.length, data, linktype: 1, iface: 0, comment: null };
}
export function resetClock(v = 1700000000) { t = v; }

const mac = (d, o) => Array.from(d.subarray(o, o + 6), (b) => b.toString(16).padStart(2, '0')).join(':');
const ip4 = (d, o) => `${d[o]}.${d[o + 1]}.${d[o + 2]}.${d[o + 3]}`;
const u16 = (d, o) => (d[o] << 8) | d[o + 1];
const u32 = (d, o) => ((d[o] << 24) | (d[o + 1] << 16) | (d[o + 2] << 8) | d[o + 3]) >>> 0;

function node(abbrev, label, value, type, start, length, children = null, extra = {}) {
  return { abbrev, label, value, type, start, length, source: 0, children, ...extra };
}

/** A tiny dissector: frame / eth / ip / tcp|udp / http|tftp|data, with tcp.stream & udp.stream indices. */
export function makeDissector() {
  const streams = new Map();
  const ids = { tcp: 0, udp: 0 };
  const cache = new Map();
  const streamIndex = (kind, a, b) => {
    const key = kind + [a, b].sort().join('|');
    if (!streams.has(key)) streams.set(key, ids[kind]++);
    return streams.get(key);
  };
  const summaries = [];
  const dissect = (f) => {
    if (cache.has(f)) return cache.get(f);
    const d = f.data;
    const fields = new Map();
    const add = (n) => { if (n.abbrev) { if (!fields.has(n.abbrev)) fields.set(n.abbrev, []); fields.get(n.abbrev).push(n); } for (const c of n.children || []) add(c); return n; };
    const layers = ['frame', 'eth', 'ethertype', 'ip'];
    const tree = [
      node('frame', `Frame ${f.no}: ${f.len} bytes on wire (${f.len * 8} bits), ${f.caplen} bytes captured (${f.caplen * 8} bits)`, null, 'protocol', 0, d.length, [
        node('frame.number', `Frame Number: ${f.no}`, f.no, 'framenum', 0, 0),
        node('frame.len', `Frame Length: ${f.len} bytes (${f.len * 8} bits)`, f.len, 'uint', 0, 0),
        node('frame.time_relative', 'Time since reference or first frame: 0.000000000 seconds', 0, 'rel_time', 0, 0, null, { generated: true }),
      ]),
      node('eth', `Ethernet II, Src: ${mac(d, 6)}, Dst: ${mac(d, 0)}`, null, 'protocol', 0, 14, [
        node('eth.dst', `Destination: ${mac(d, 0)}`, mac(d, 0), 'ether', 0, 6, [node('eth.addr', `Address: ${mac(d, 0)}`, mac(d, 0), 'ether', 0, 6, null, { hidden: true })]),
        node('eth.src', `Source: ${mac(d, 6)}`, mac(d, 6), 'ether', 6, 6),
        node('eth.type', 'Type: IPv4 (0x0800)', 0x800, 'uint', 12, 2),
      ]),
    ];
    const ihl = (d[14] & 15) * 4;
    const src = ip4(d, 26), dst = ip4(d, 30), proto = d[23];
    tree.push(node('ip', `Internet Protocol Version 4, Src: ${src}, Dst: ${dst}`, null, 'protocol', 14, ihl, [
      node('ip.ttl', `Time to Live: ${d[22]}`, d[22], 'uint', 22, 1),
      node('ip.src', `Source Address: ${src}`, src, 'ipv4', 26, 4),
      node('ip.dst', `Destination Address: ${dst}`, dst, 'ipv4', 30, 4),
    ]));
    const l4 = 14 + ihl;
    let sum;
    let payloadOff = d.length, payloadLen = 0, sp, dp;
    if (proto === 6) {
      layers.push('tcp');
      sp = u16(d, l4); dp = u16(d, l4 + 2);
      const hdr = (d[l4 + 12] >> 4) * 4;
      payloadOff = l4 + hdr; payloadLen = d.length - payloadOff;
      const stream = streamIndex('tcp', `${src}:${sp}`, `${dst}:${dp}`);
      const kids = [
        node('tcp.srcport', `Source Port: ${sp}`, sp, 'uint', l4, 2),
        node('tcp.dstport', `Destination Port: ${dp}`, dp, 'uint', l4 + 2, 2),
        node('tcp.stream', `Stream index: ${stream}`, stream, 'uint', 0, 0, null, { generated: true }),
        node('tcp.len', `TCP Segment Len: ${payloadLen}`, payloadLen, 'uint', 0, 0, null, { generated: true }),
        node('tcp.seq_raw', `Sequence Number (raw): ${u32(d, l4 + 4)}`, u32(d, l4 + 4), 'uint', l4 + 4, 4),
        node('tcp.hdr_len', `Header Length: ${hdr} bytes`, hdr, 'uint', l4 + 12, 1),
        node('tcp.flags', `Flags: 0x${d[l4 + 13].toString(16).padStart(3, '0')}`, d[l4 + 13], 'uint', l4 + 12, 2, [
          node('tcp.flags.syn', `.... .... ..${d[l4 + 13] & 2 ? 1 : 0}. = Syn: ${d[l4 + 13] & 2 ? 'Set' : 'Not set'}`, !!(d[l4 + 13] & 2), 'bool', l4 + 13, 1),
        ]),
      ];
      if (payloadLen) kids.push(node('tcp.payload', `TCP payload (${payloadLen} bytes)`, d.subarray(payloadOff), 'bytes', payloadOff, payloadLen));
      tree.push(node('tcp', `Transmission Control Protocol, Src Port: ${sp}, Dst Port: ${dp}, Len: ${payloadLen}`, null, 'protocol', l4, d.length - l4, kids));
      sum = { tcpStream: stream };
    } else if (proto === 17) {
      layers.push('udp');
      sp = u16(d, l4); dp = u16(d, l4 + 2);
      payloadOff = l4 + 8; payloadLen = d.length - payloadOff;
      const stream = streamIndex('udp', `${src}:${sp}`, `${dst}:${dp}`);
      tree.push(node('udp', `User Datagram Protocol, Src Port: ${sp}, Dst Port: ${dp}`, null, 'protocol', l4, 8, [
        node('udp.srcport', `Source Port: ${sp}`, sp, 'uint', l4, 2),
        node('udp.dstport', `Destination Port: ${dp}`, dp, 'uint', l4 + 2, 2),
        node('udp.length', `Length: ${u16(d, l4 + 4)}`, u16(d, l4 + 4), 'uint', l4 + 4, 2),
        node('udp.stream', `Stream index: ${stream}`, stream, 'uint', 0, 0, null, { generated: true }),
      ]));
      sum = { udpStream: stream };
    }
    let protocol = proto === 6 ? 'TCP' : 'UDP';
    let info = `${sp} → ${dp} Len=${payloadLen}`;
    const text = new TextDecoder('latin1').decode(d.subarray(payloadOff));
    if (payloadLen && /^(GET|POST|HTTP\/1\.1)/.test(text)) {
      layers.push('http'); protocol = 'HTTP';
      const headEnd = text.indexOf('\r\n\r\n') + 4;
      const lines = text.slice(0, headEnd - 4).split('\r\n');
      const kids = [];
      if (/^HTTP/.test(lines[0])) {
        kids.push(node('http.response', '', null, 'none', payloadOff, 0, null, { hidden: true }));
        kids.push(node('http.response.code', `Status Code: ${lines[0].split(' ')[1]}`, Number(lines[0].split(' ')[1]), 'uint', payloadOff + 9, 3));
      } else {
        const [m, uri] = lines[0].split(' ');
        kids.push(node('http.request', '', null, 'none', payloadOff, 0, null, { hidden: true }));
        kids.push(node('http.request.method', `Request Method: ${m}`, m, 'string', payloadOff, m.length));
        kids.push(node('http.request.uri', `Request URI: ${uri}`, uri, 'string', payloadOff + m.length + 1, uri.length));
      }
      for (const l of lines.slice(1)) {
        const [k, v] = l.split(': ');
        if (k === 'Host') kids.push(node('http.host', `Host: ${v}`, v, 'string', payloadOff, 0));
        if (k === 'Content-Type') kids.push(node('http.content_type', `Content-Type: ${v}`, v, 'string', payloadOff, 0));
      }
      if (headEnd < payloadLen) kids.push(node('http.file_data', `File Data: ${payloadLen - headEnd} bytes`, d.subarray(payloadOff + headEnd), 'bytes', payloadOff + headEnd, payloadLen - headEnd));
      tree.push(node('http', 'Hypertext Transfer Protocol', null, 'protocol', payloadOff, payloadLen, kids));
      info = lines[0];
    } else if (proto === 17 && (sp === 69 || dp === 69 || layersTftp(d, payloadOff))) {
      layers.push('tftp'); protocol = 'TFTP';
      const op = u16(d, payloadOff);
      const kids = [node('tftp.opcode', `Opcode: ${op}`, op, 'uint', payloadOff, 2)];
      if (op === 1 || op === 2) {
        const name = text.slice(2).split('\0')[0];
        kids.push(node(op === 1 ? 'tftp.source_file' : 'tftp.destination_file', `File: ${name}`, name, 'string', payloadOff + 2, name.length));
      } else if (op === 3) {
        kids.push(node('tftp.block', `Block: ${u16(d, payloadOff + 2)}`, u16(d, payloadOff + 2), 'uint', payloadOff + 2, 2));
        kids.push(node('data.data', 'Data', d.subarray(payloadOff + 4), 'bytes', payloadOff + 4, payloadLen - 4));
      }
      tree.push(node('tftp', 'Trivial File Transfer Protocol', null, 'protocol', payloadOff, payloadLen, kids));
    }
    for (const n of tree) add(n);
    const out = {
      tree, fields, layers, expert: [], sources: [{ name: `Frame (${d.length} bytes)`, data: d }],
      columns: { protocol, info, src, dst, srcport: sp, dstport: dp },
    };
    summaries[f.no - 1] = { no: f.no, protocol, info, src, dst, length: f.len, layers: layers.join(':'), expert: null, ...sum, srcport: sp, dstport: dp };
    cache.set(f, out);
    return out;
  };
  return { dissect, summaries };
}
// TFTP data/ack from ephemeral ports: opcode 3/4 with a small payload
const layersTftp = (d, o) => d.length - o >= 4 && d[o] === 0 && (d[o + 1] === 3 || d[o + 1] === 4) && d.length - o <= 516;

/** The HTTP conversation used by several tests (same as the tshark witness capture). */
export function httpConversation() {
  resetClock();
  const A = '10.0.0.1', B = '10.0.0.2';
  const req = 'GET /dir/a.txt?x=1 HTTP/1.1\r\nHost: example.com\r\n\r\n';
  const resp = 'HTTP/1.1 200 OK\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: 5\r\n\r\nhello';
  const pk = [
    ethIp(A, B, 6, tcpSeg(1234, 80, 100, 0, 0x02)),
    ethIp(B, A, 6, tcpSeg(80, 1234, 500, 101, 0x12)),
    ethIp(A, B, 6, tcpSeg(1234, 80, 101, 501, 0x10)),
    ethIp(A, B, 6, tcpSeg(1234, 80, 101, 501, 0x18, req)),
    ethIp(B, A, 6, tcpSeg(80, 1234, 501, 101 + req.length, 0x18, resp)),
    ethIp(B, A, 6, tcpSeg(80, 1234, 501, 101 + req.length, 0x18, resp)), // retransmission
    ethIp(A, B, 6, tcpSeg(1234, 80, 101 + req.length, 501 + resp.length, 0x11)),
  ];
  const frames = pk.map((p, i) => makeFrame(i + 1, p));
  const ds = makeDissector();
  frames.forEach((f) => ds.dissect(f));
  return { frames, summaries: ds.summaries, getDissection: ds.dissect, req, resp };
}

// ───────────────────────── real samples (when the dissector agent's modules and samples/ exist)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const TSHARK = ['C:/Program Files/Wireshark/tshark.exe', '/usr/bin/tshark', '/usr/local/bin/tshark', '/opt/homebrew/bin/tshark', '/Applications/Wireshark.app/Contents/MacOS/tshark'].find((p) => fs.existsSync(p)) || null;

/** [{ name, path, file, frames, summaries, getDissection }] for samples/*.pcapng, or [] when unavailable. */
export async function loadRealSamples(limit = Infinity) {
  const dir = path.join(ROOT, 'samples');
  let dissect, pcap;
  try {
    dissect = await import(pathToFileURL(path.join(ROOT, 'src/domain/dissect/index.js')).href);
    pcap = await import(pathToFileURL(path.join(ROOT, 'src/domain/capture/pcap.js')).href);
  } catch { return []; }
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const name of fs.readdirSync(dir).filter((n) => /\.pcapng?$/.test(n)).sort().slice(0, limit)) {
    const p = path.join(dir, name);
    const file = pcap.readCapture(new Uint8Array(fs.readFileSync(p)), name);
    const session = dissect.createSession(file);
    const summaries = file.frames.map((f) => session.firstPass(f));
    const cache = new Map();
    const getDissection = (f) => { let d = cache.get(f); if (!d) cache.set(f, d = dissect.dissect(session, f, { tree: true })); return d; };
    out.push({ name, path: p, file, frames: file.frames, summaries, getDissection, FIELDS: dissect.FIELDS });
  }
  return out;
}
