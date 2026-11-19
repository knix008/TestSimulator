// Follow Stream (Analyze → Follow → TCP/UDP/HTTP/TLS/HTTP2/QUIC Stream) and the output modes of
// Wireshark's Follow dialog / `tshark -z follow,…`.
//
// followStream() gathers the payload of one stream as ordered chunks; formatFollow() turns them into
// the text the dialog shows. Everything works on Dissection objects (see ARCHITECTURE.md) obtained
// through the caller's getDissection(frame), so the UI's cache is reused.

const KINDS = ['tcp', 'udp', 'http', 'tls', 'http2', 'quic'];
export const FOLLOW_KINDS = KINDS;
export const FOLLOW_MODES = ['ascii', 'ebcdic', 'hexdump', 'carrays', 'raw', 'yaml', 'utf8'];

// ───────────────────────── small helpers over Dissection

const nodesOf = (d, abbrev) => d?.fields?.get(abbrev) || [];
const firstNode = (d, abbrev) => nodesOf(d, abbrev)[0] || null;
const firstValue = (d, abbrev) => { const n = firstNode(d, abbrev); return n ? n.value : undefined; };
const num = (v) => (typeof v === 'bigint' ? Number(v) : typeof v === 'boolean' ? (v ? 1 : 0) : v);

/** Bytes a node covers in its data source. */
export function nodeBytes(d, node) {
  if (!node || !d?.sources) return new Uint8Array(0);
  const src = d.sources[node.source || 0];
  if (!src?.data) return new Uint8Array(0);
  const start = node.start || 0;
  return src.data.subarray(start, start + (node.length || 0));
}

const frameTime = (f) => (f ? (f.sec || 0) + (f.nsec || 0) / 1e9 : 0);

function addrOf(d) {
  return firstValue(d, 'ip.src') !== undefined
    ? { src: firstValue(d, 'ip.src'), dst: firstValue(d, 'ip.dst') }
    : firstValue(d, 'ipv6.src') !== undefined
      ? { src: firstValue(d, 'ipv6.src'), dst: firstValue(d, 'ipv6.dst') }
      : { src: firstValue(d, 'eth.src') ?? d?.columns?.src ?? '', dst: firstValue(d, 'eth.dst') ?? d?.columns?.dst ?? '' };
}

// TCP payload: prefer the dissector's tcp.payload node, else derive it from tcp.hdr_len/tcp.len.
function tcpPayload(d) {
  const p = firstNode(d, 'tcp.payload');
  if (p) return nodeBytes(d, p);
  const tcp = firstNode(d, 'tcp');
  const len = num(firstValue(d, 'tcp.len')) || 0;
  if (!tcp || !len) return new Uint8Array(0);
  const hdr = num(firstValue(d, 'tcp.hdr_len')) || 20;
  const src = d.sources[tcp.source || 0].data;
  return src.subarray(tcp.start + hdr, tcp.start + hdr + len);
}

function udpPayload(d) {
  const p = firstNode(d, 'udp.payload');
  if (p) return nodeBytes(d, p);
  const udp = firstNode(d, 'udp');
  if (!udp) return new Uint8Array(0);
  const src = d.sources[udp.source || 0].data;
  const len = num(firstValue(d, 'udp.length'));
  const end = len ? udp.start + len : src.length;
  return src.subarray(udp.start + 8, Math.min(end, src.length));
}

// Index of the stream for a frame, using the Summary when it has it (no dissection needed).
function streamOf(kind, summary, d) {
  if (kind === 'udp') {
    if (summary && summary.udpStream !== undefined && !d) return summary.udpStream;
    return num(firstValue(d, 'udp.stream'));
  }
  if (kind === 'quic') return num(firstValue(d, 'quic.connection.number'));
  if (summary && summary.tcpStream !== undefined && !d) return summary.tcpStream;
  return num(firstValue(d, 'tcp.stream'));
}

/** Display filter for a stream ('tcp.stream eq 3'); sub = HTTP/2 or QUIC stream id. */
export function followFilter(kind, index, sub) {
  switch (kind) {
    case 'udp': return `udp.stream eq ${index}`;
    case 'quic': return sub === undefined || sub === null ? `quic.connection.number eq ${index}` : `quic.connection.number eq ${index} and quic.stream.stream_id eq ${sub}`;
    case 'http2': return sub === undefined || sub === null ? `tcp.stream eq ${index}` : `tcp.stream eq ${index} and http2.streamid eq ${sub}`;
    default: return `tcp.stream eq ${index}`;
  }
}

/** "Filter Out This Stream" text. */
export function followFilterOut(kind, index, sub) { return `!(${followFilter(kind, index, sub)})`; }

/** Number of TCP/UDP streams known from the summaries (highest index + 1). */
export function streamCount(kind, summaries) {
  let max = -1;
  const key = kind === 'udp' ? 'udpStream' : 'tcpStream';
  for (const s of summaries || []) if (s && typeof s[key] === 'number' && s[key] > max) max = s[key];
  return max + 1;
}

// ───────────────────────── TCP reassembly for display

// Per-direction in-order delivery: retransmitted / overlapping bytes are trimmed, segments that arrive
// ahead of a gap wait until the gap is filled (or are flushed in sequence order at the end).
class Direction {
  constructor() { this.next = null; this.pending = []; }
  // 32-bit sequence comparison
  static diff(a, b) { return (a - b) | 0; }
  push(seq, data, meta, emit) {
    if (this.next === null) this.next = seq;
    const d = Direction.diff(seq, this.next);
    if (d > 0) { this.pending.push({ seq, data, meta }); return; }
    const skip = -d;
    if (skip < data.length) {
      emit(data.subarray(skip), meta);
      this.next = (this.next + data.length - skip) >>> 0;
    }
    this.drain(emit);
  }
  drain(emit) {
    let progressed = true;
    while (progressed && this.pending.length) {
      progressed = false;
      for (let i = 0; i < this.pending.length; i++) {
        const p = this.pending[i];
        if (Direction.diff(p.seq, this.next) <= 0) {
          this.pending.splice(i, 1);
          const skip = -Direction.diff(p.seq, this.next);
          if (skip < p.data.length) { emit(p.data.subarray(skip), p.meta); this.next = (this.next + p.data.length - skip) >>> 0; }
          progressed = true;
          break;
        }
      }
    }
  }
  flush(emit) {
    this.pending.sort((a, b) => Direction.diff(a.seq, b.seq));
    for (const p of this.pending.splice(0)) {
      const skip = Math.max(0, -Direction.diff(p.seq, this.next));
      if (skip < p.data.length) { emit(p.data.subarray(skip), p.meta); this.next = (p.seq + p.data.length) >>> 0; }
    }
  }
}

// ───────────────────────── followStream

/**
 * Collect one stream.
 * @param {'tcp'|'udp'|'http'|'tls'|'http2'|'quic'} kind
 * @param {number} index  tcp.stream / udp.stream / quic.connection.number
 * @param {Frame[]} frames
 * @param {(Summary|undefined)[]} summaries  parallel to frames (may be empty: then every frame is dissected)
 * @param {(frame: Frame) => Dissection} getDissection
 * @param {{ sub?: number }} [opts]  HTTP/2 stream id or QUIC stream id
 * @returns {{ kind, index, sub, chunks: {dir:0|1, frame:number, data:Uint8Array, time:number}[],
 *   client: {addr, port, bytes, packets}, server: {addr, port, bytes, packets},
 *   filter: string, filterOut: string, streams: number, note: string|null }}
 *   dir 0 = client → server (the first sender), 1 = server → client.
 */
export function followStream(kind, index, frames, summaries, getDissection, opts = {}) {
  if (!KINDS.includes(kind)) throw new Error(`Unknown follow kind "${kind}"`);
  const sub = opts.sub;
  const baseKind = kind === 'udp' ? 'udp' : kind === 'quic' ? 'quic' : 'tcp';
  const result = {
    kind, index, sub: sub ?? null, chunks: [],
    client: { addr: '', port: null, bytes: 0, packets: 0 },
    server: { addr: '', port: null, bytes: 0, packets: 0 },
    filter: followFilter(kind, index, sub), filterOut: followFilterOut(kind, index, sub),
    streams: baseKind === 'quic' ? 0 : streamCount(baseKind, summaries), note: null,
  };
  const dirs = [new Direction(), new Direction()];
  let client = null; // {src, port}
  let sawDecrypted = false;
  let quicMax = -1;

  const dirOf = (d, port) => {
    const a = addrOf(d);
    if (!client) {
      client = { addr: a.src, port };
      result.client.addr = a.src; result.client.port = port ?? null;
      result.server.addr = a.dst;
    }
    return a.src === client.addr && (port === undefined || port === client.port) ? 0 : 1;
  };
  const emitter = (f) => (data, meta) => {
    if (!data.length) return;
    const last = result.chunks[result.chunks.length - 1];
    // a frame can deliver bytes twice (drained pending data); keep one chunk per frame+direction
    if (last && last.frame === meta.frame && last.dir === meta.dir) {
      const merged = new Uint8Array(last.data.length + data.length);
      merged.set(last.data); merged.set(data, last.data.length);
      last.data = merged;
    } else result.chunks.push({ dir: meta.dir, frame: meta.frame, data: data.slice(), time: meta.time });
  };

  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    const s = summaries?.[i];
    // cheap pre-filter on the summary when it carries the stream index
    if (baseKind === 'tcp' && s && s.tcpStream !== undefined && s.tcpStream !== index) continue;
    if (baseKind === 'udp' && s && s.udpStream !== undefined && s.udpStream !== index) continue;
    if (baseKind === 'tcp' && s && s.tcpStream === undefined && s.layers && !/(^|:)tcp(:|$)/.test(s.layers)) continue;
    if (baseKind === 'udp' && s && s.udpStream === undefined && s.layers && !/(^|:)udp(:|$)/.test(s.layers)) continue;
    // a TCP/UDP header quoted inside an ICMP error is not part of the stream (Wireshark does not follow it)
    if (s && s.layers && /(^|:)icmp(v6)?:.*\b(tcp|udp)\b/.test(s.layers)) continue;
    const d = getDissection(f);
    if (!d) continue;
    if (baseKind === 'quic') {
      const c = num(firstValue(d, 'quic.connection.number'));
      if (typeof c === 'number' && c > quicMax) quicMax = c;
    }
    if (streamOf(baseKind, null, d) !== index) continue;
    const time = frameTime(f);
    const no = f.no;

    if (baseKind === 'tcp') {
      const port = num(firstValue(d, 'tcp.srcport'));
      const dir = dirOf(d, port);
      const side = dir === 0 ? result.client : result.server;
      side.packets++;
      if (dir === 1 && result.server.port === null) result.server.port = port;
      if (dir === 0 && result.server.port === null) result.server.port = num(firstValue(d, 'tcp.dstport'));
      const meta = { dir, frame: no, time };
      if (kind === 'tls') {
        const dec = (d.sources || []).slice(1).filter((x) => /decrypt/i.test(x.name || ''));
        for (const src of dec) { sawDecrypted = true; emitter(f)(src.data, meta); }
        continue;
      }
      if (kind === 'http2') {
        for (const n of nodesOf(d, 'http2.data.data')) {
          if (sub !== undefined && sub !== null && !streamIdMatches(d, n, 'http2.streamid', sub)) continue;
          emitter(f)(nodeBytes(d, n), meta);
        }
        continue;
      }
      const payload = tcpPayload(d);
      const flags = num(firstValue(d, 'tcp.flags')) || 0;
      const seqRaw = firstValue(d, 'tcp.seq_raw');
      const seq = num(seqRaw !== undefined ? seqRaw : firstValue(d, 'tcp.seq')) >>> 0;
      const dd = dirs[dir];
      if (flags & 0x02) { if (dd.next === null) dd.next = (seq + 1) >>> 0; }
      if (payload.length) dd.push(seq, payload, meta, emitter(f));
      continue;
    }

    if (baseKind === 'udp') {
      const port = num(firstValue(d, 'udp.srcport'));
      const dir = dirOf(d, port);
      const side = dir === 0 ? result.client : result.server;
      side.packets++;
      if (dir === 0 && result.server.port === null) result.server.port = num(firstValue(d, 'udp.dstport'));
      emitter(f)(udpPayload(d), { dir, frame: no, time });
      continue;
    }

    // QUIC: decrypted STREAM frame data only (needs keys in the dissector)
    const port = num(firstValue(d, 'udp.srcport'));
    const dir = dirOf(d, port);
    (dir === 0 ? result.client : result.server).packets++;
    if (dir === 0 && result.server.port === null) result.server.port = num(firstValue(d, 'udp.dstport'));
    for (const n of nodesOf(d, 'quic.stream_data')) {
      if (sub !== undefined && sub !== null && !streamIdMatches(d, n, 'quic.stream.stream_id', sub)) continue;
      emitter(f)(nodeBytes(d, n), { dir, frame: no, time });
    }
  }
  for (const dir of [0, 1]) dirs[dir].flush((data, meta) => emitter(null)(data, meta));
  // Chunks stay in delivery (sequence) order, as Wireshark shows held-back segments once the gap fills.
  for (const c of result.chunks) (c.dir === 0 ? result.client : result.server).bytes += c.data.length;
  if (baseKind === 'quic') result.streams = quicMax + 1;
  if (kind === 'tls' && !sawDecrypted) result.note = 'no-decrypted-data';
  if ((kind === 'http2' || kind === 'quic') && !result.chunks.length && result.client.packets) result.note = 'no-stream-data';
  return result;
}

// The stream id that owns a data node: the nearest preceding id node in tree order.
function streamIdMatches(d, dataNode, idAbbrev, sub) {
  const ids = nodesOf(d, idAbbrev);
  let owner;
  for (const n of ids) {
    if ((n.source || 0) === (dataNode.source || 0) && n.start <= dataNode.start) owner = n;
  }
  return owner ? num(owner.value) === sub : ids.length === 0;
}

// ───────────────────────── formatting

const printable = (b) => b >= 0x20 && b < 0x7f;

function asciiText(data, keepControls = true) {
  let s = '';
  for (const b of data) s += printable(b) || (keepControls && (b === 0x0a || b === 0x0d || b === 0x09)) ? String.fromCharCode(b) : '.';
  return s;
}

// IBM code page 037 → ASCII (unmappable bytes become '.'), as Wireshark's EBCDIC view.
const EBCDIC = (() => {
  const t = new Uint8Array(256).fill(0x2e);
  const set = (code, chars) => { for (let i = 0; i < chars.length; i++) t[code + i] = chars.charCodeAt(i); };
  t[0x05] = 0x09; t[0x0d] = 0x0d; t[0x15] = 0x0a; t[0x25] = 0x0a; t[0x40] = 0x20;
  set(0x4b, '.<(+|&'); set(0x5a, '!$*);'); set(0x60, '-/'); set(0x6b, ',%_>?');
  set(0x79, '`:#@\'="'); set(0x81, 'abcdefghi'); set(0x91, 'jklmnopqr'); set(0xa1, '~stuvwxyz');
  t[0xb0] = 0x5e; t[0xba] = 0x5b; t[0xbb] = 0x5d; t[0xc0] = 0x7b; set(0xc1, 'ABCDEFGHI'); t[0xd0] = 0x7d;
  set(0xd1, 'JKLMNOPQR'); t[0xe0] = 0x5c; set(0xe2, 'STUVWXYZ'); set(0xf0, '0123456789');
  return t;
})();

export function ebcdicToAscii(data) {
  const out = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) out[i] = EBCDIC[data[i]];
  return out;
}

const hex2 = (b) => (b < 16 ? '0' : '') + b.toString(16);

/** Hex dump lines as Wireshark's follow view: offset, 16 bytes in two groups of 8, ASCII in two groups. */
export function hexDumpLines(data, offset = 0) {
  const lines = [];
  for (let i = 0; i < data.length; i += 16) {
    const row = data.subarray(i, i + 16);
    let hex = '';
    let asc = '';
    for (let j = 0; j < row.length; j++) {
      hex += hex2(row[j]) + ' ';
      if (j === 7) hex += ' ';
      asc += printable(row[j]) ? String.fromCharCode(row[j]) : '.';
      if (j === 7 && row.length > 8) asc += ' ';
    }
    // offsets are upper-case hex like tshark's follow output (%08X)
    lines.push(`${(offset + i).toString(16).toUpperCase().padStart(8, '0')}  ${hex.padEnd(50, ' ')}${asc}`);
  }
  return lines;
}

const base64 = (data) => {
  if (typeof Buffer !== 'undefined') return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('base64');
  let s = '';
  for (const b of data) s += String.fromCharCode(b);
  return btoa(s);
};

const timestamp = (t, frame) => {
  if (frame && Number.isFinite(frame.sec)) return `${frame.sec}.${String(frame.nsec || 0).padStart(9, '0')}`;
  return t.toFixed(9);
};

/**
 * Per-chunk texts (so the UI can colour client/server differently). Joining the texts gives formatFollow().
 * @param {ReturnType<typeof followStream>} result
 * @param {'ascii'|'ebcdic'|'hexdump'|'carrays'|'raw'|'yaml'|'utf8'} mode
 * @param {{dir?: 'both'|0|1, style?: 'gui'|'tshark', frames?: Map<number, Frame>}} [opts]
 *   style 'gui' (default) = the Follow dialog: server hex dump indented 4 spaces;
 *   'tshark' = `tshark -q -z follow,…` body: chunk lengths, server lines prefixed by a tab.
 * @returns {{dir:0|1|null, frame:number|null, text:string}[]}
 */
export function followSegments(result, mode = 'ascii', opts = {}) {
  const want = opts.dir === undefined || opts.dir === 'both' ? null : Number(opts.dir);
  const tshark = opts.style === 'tshark';
  const chunks = result.chunks.filter((c) => want === null || c.dir === want);
  const out = [];
  const offsets = [0, 0];
  const counters = [0, 0];
  if (mode === 'yaml') {
    const peers = [result.client, result.server];
    let head = 'peers:\n';
    peers.forEach((p, i) => { head += `  - peer: ${i}\n    host: ${p.addr}\n    port: ${p.port ?? 0}\n`; });
    out.push({ dir: null, frame: null, text: head + 'packets:\n' });
  }
  for (const c of chunks) {
    const pre = c.dir === 1 ? (tshark ? '\t' : '    ') : '';
    let text;
    switch (mode) {
      case 'ascii':
      case 'ebcdic':
      case 'utf8': {
        const bytes = mode === 'ebcdic' ? ebcdicToAscii(c.data) : c.data;
        const body = mode === 'utf8' ? new TextDecoder('utf-8').decode(bytes) : asciiText(bytes);
        text = tshark ? `${c.dir === 1 ? '\t' : ''}${c.data.length}\n${body}\n` : body;
        break;
      }
      case 'hexdump': {
        const lines = hexDumpLines(c.data, offsets[c.dir]);
        // tshark drops one trailing blank from each dump line (even a space byte in the ASCII column)
        text = lines.map((l) => pre + (tshark && l.endsWith(' ') ? l.slice(0, -1) : l)).join('\n') + '\n';
        break;
      }
      case 'raw': {
        let h = '';
        for (const b of c.data) h += hex2(b);
        text = (tshark ? pre : '') + h + '\n';
        break;
      }
      case 'carrays': {
        const name = `peer${c.dir}_${counters[c.dir]}`;
        const parts = [];
        for (let i = 0; i < c.data.length; i += 8) {
          parts.push(Array.from(c.data.subarray(i, i + 8), (b) => '0x' + hex2(b)).join(', '));
        }
        text = `char ${name}[] = { /* Packet ${c.frame} */\n${parts.join(', \n')} };\n`;
        break;
      }
      case 'yaml': {
        const b64 = base64(c.data);
        const lines = b64.match(/.{1,76}/g) || [''];
        const frame = opts.frames?.get?.(c.frame);
        text = `  - packet: ${c.frame}\n    peer: ${c.dir}\n    timestamp: ${timestamp(c.time, frame)}\n    data: !!binary |\n` +
          lines.map((l) => '      ' + l).join('\n') + '\n';
        break;
      }
      default: throw new Error(`Unknown follow mode "${mode}"`);
    }
    offsets[c.dir] += c.data.length;
    counters[c.dir]++;
    out.push({ dir: c.dir, frame: c.frame, text });
  }
  return out;
}

/** Text of the Follow view in one output mode (see followSegments for options). */
export function formatFollow(result, mode = 'ascii', opts = {}) {
  const body = followSegments(result, mode, opts).map((s) => s.text).join('');
  if (opts.style !== 'tshark' || mode === 'yaml') return body;
  // tshark's banner around the body
  const tsharkMode = { hexdump: 'hex', utf8: 'utf-8' }[mode] || mode;
  const bar = '='.repeat(67);
  const node = (p) => `${p.addr.includes(':') ? `[${p.addr}]` : p.addr}:${p.port ?? 0}`;
  return `\n${bar}\nFollow: ${result.kind},${tsharkMode}\nFilter: ${result.filter}\nNode 0: ${node(result.client)}\nNode 1: ${node(result.server)}\n${body}${bar}\n`;
}

/** Summary line under the Follow view: "Entire conversation (101 bytes)" / per side byte counts. */
export function followStats(result) {
  return {
    total: result.client.bytes + result.server.bytes,
    clientToServer: { label: `${result.client.addr}:${result.client.port ?? ''} → ${result.server.addr}:${result.server.port ?? ''}`, bytes: result.client.bytes },
    serverToClient: { label: `${result.server.addr}:${result.server.port ?? ''} → ${result.client.addr}:${result.client.port ?? ''}`, bytes: result.server.bytes },
    chunks: result.chunks.length,
  };
}
