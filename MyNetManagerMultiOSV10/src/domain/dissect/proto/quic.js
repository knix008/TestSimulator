// QUIC (RFC 9000/9001/9369): long and short headers, coalesced packets, connection tracking,
// Initial packet decryption (keys come from the client's DCID) and frames inside Initials.
import { registerProtocol, u16, u32, hexStr, NULLNODE } from '../core.js';
import { quicUnprotectInitial, isKnownVersion } from './quic-crypto.js';
import { handshakeMessages } from './tls.js';

const LONG_TYPES = { 0: 'Initial', 1: '0-RTT', 2: 'Handshake', 3: 'Retry' };
const LONG_TYPES_V2 = { 1: 'Initial', 2: '0-RTT', 3: 'Handshake', 0: 'Retry' };
const VERSIONS = { 0: 'Version Negotiation', 1: '1', 0x6b3343cf: '2', 0xff00001d: 'draft-29', 0xff00001c: 'draft-28', 0xff00001b: 'draft-27', 0x51303530: 'Google Q050', 0x51303436: 'Google Q046', 0x54303531: 'Google T051', 0xfaceb002: 'Facebook mvfst (draft-27)' };
const FRAME_TYPES = {
  0x00: 'PADDING', 0x01: 'PING', 0x02: 'ACK', 0x03: 'ACK', 0x04: 'RESET_STREAM', 0x05: 'STOP_SENDING', 0x06: 'CRYPTO', 0x07: 'NEW_TOKEN',
  0x08: 'STREAM', 0x09: 'STREAM', 0x0a: 'STREAM', 0x0b: 'STREAM', 0x0c: 'STREAM', 0x0d: 'STREAM', 0x0e: 'STREAM', 0x0f: 'STREAM',
  0x10: 'MAX_DATA', 0x11: 'MAX_STREAM_DATA', 0x12: 'MAX_STREAMS', 0x13: 'MAX_STREAMS', 0x14: 'DATA_BLOCKED', 0x15: 'STREAM_DATA_BLOCKED',
  0x16: 'STREAMS_BLOCKED', 0x17: 'STREAMS_BLOCKED', 0x18: 'NEW_CONNECTION_ID', 0x19: 'RETIRE_CONNECTION_ID', 0x1a: 'PATH_CHALLENGE',
  0x1b: 'PATH_RESPONSE', 0x1c: 'CONNECTION_CLOSE', 0x1d: 'CONNECTION_CLOSE', 0x1e: 'HANDSHAKE_DONE', 0x30: 'DATAGRAM', 0x31: 'DATAGRAM',
};
const PN_LEN = { 0: '1 bytes', 1: '2 bytes', 2: '3 bytes', 3: '4 bytes' };

registerProtocol({
  abbrev: 'quic', name: 'QUIC IETF', short: 'QUIC',
  fields: [
    ['quic.connection.number', 'Connection Number', 'uint32'],
    ['quic.packet_length', 'Packet Length', 'uint32'],
    ['quic.header_form', 'Header Form', 'uint8', { mask: 0x80, strings: { 0: 'Short Header', 1: 'Long Header' } }],
    ['quic.fixed_bit', 'Fixed Bit', 'bool', { mask: 0x40, bits: 8 }],
    ['quic.spin_bit', 'Spin Bit', 'bool', { mask: 0x20, bits: 8 }],
    ['quic.long.packet_type', 'Packet Type', 'uint8', { mask: 0x30, strings: LONG_TYPES }],
    ['quic.long.packet_type_v2', 'Packet Type', 'uint8', { mask: 0x30, strings: LONG_TYPES_V2 }],
    ['quic.long.reserved', 'Reserved', 'uint8', { mask: 0x0c }],
    ['quic.packet_number_length', 'Packet Number Length', 'uint8', { mask: 0x03, strings: PN_LEN }],
    ['quic.version', 'Version', 'uint32', { base: 'hex', strings: VERSIONS }],
    ['quic.supported_version', 'Supported Version', 'uint32', { base: 'hex', strings: VERSIONS }],
    ['quic.vn.unused', 'Unused', 'uint8', { base: 'hex', mask: 0x7f }],
    ['quic.dcil', 'Destination Connection ID Length', 'uint8'],
    ['quic.dcid', 'Destination Connection ID', 'bytes'],
    ['quic.scil', 'Source Connection ID Length', 'uint8'],
    ['quic.scid', 'Source Connection ID', 'bytes'],
    ['quic.token_length', 'Token Length', 'uint64'],
    ['quic.token', 'Token', 'bytes'],
    ['quic.length', 'Length', 'uint64'],
    ['quic.packet_number', 'Packet Number', 'uint64'],
    ['quic.short', 'QUIC Short Header', 'none'],
    ['quic.payload', 'Payload', 'bytes'],
    ['quic.protected_payload', 'Protected Payload', 'bytes'],
    ['quic.remaining_payload', 'Remaining Payload', 'bytes'],
    ['quic.retry_token', 'Retry Token', 'bytes'],
    ['quic.retry_integrity_tag', 'Retry Integrity Tag', 'bytes'],
    ['quic.frame', 'Frame', 'none'],
    ['quic.frame_type', 'Frame Type', 'uint64', { base: 'hex', strings: FRAME_TYPES }],
    ['quic.padding_length', 'Padding Length', 'uint32'],
    ['quic.ack.largest_acknowledged', 'Largest Acknowledged', 'uint64'],
    ['quic.ack.ack_delay', 'ACK Delay', 'uint64'],
    ['quic.ack.ack_range_count', 'ACK Range Count', 'uint64'],
    ['quic.ack.first_ack_range', 'First ACK Range', 'uint64'],
    ['quic.ack.gap', 'Gap', 'uint64'],
    ['quic.ack.ack_range', 'ACK Range', 'uint64'],
    ['quic.crypto.offset', 'Offset', 'uint64'],
    ['quic.crypto.length', 'Length', 'uint64'],
    ['quic.crypto.crypto_data', 'Crypto Data', 'none'],
    ['quic.nt.length', '(Token) Length', 'uint64'],
    ['quic.nt.token', 'Token', 'bytes'],
    ['quic.stream.stream_id', 'Stream ID', 'uint64'],
    ['quic.stream.offset', 'Offset', 'uint64'],
    ['quic.stream.length', 'Length', 'uint64'],
    ['quic.stream_data', 'Stream Data', 'bytes'],
    ['quic.cc.error_code', 'Error code', 'uint64'],
    ['quic.cc.frame_type', 'Frame Type', 'uint64'],
    ['quic.cc.reason_phrase.length', 'Reason phrase Length', 'uint64'],
    ['quic.cc.reason_phrase', 'Reason phrase', 'string'],
  ],
  experts: [
    ['quic.decryption_failed', 'warn', 'Decryption', 'Failed to decrypt handshake'],
    ['quic.connection.unknown', 'note', 'Protocol', 'Unknown QUIC connection. Missing Initial Packet or migrated connection?'],
    ['quic.ft.unknown', 'note', 'Undecoded', 'Unknown Frame Type'],
  ],
  tables: { 'udp.port': [443] },
  heuristics: { udp: (ctx, off, end) => looksLikeQuic(ctx, off, end) },
  dissect: dissectQuic,
});

function varint(d, o) {
  const l = 1 << (d[o] >> 6);
  let v = d[o] & 0x3f;
  for (let i = 1; i < l; i++) v = v * 256 + d[o + i];
  return [v, l];
}

function state(ctx) {
  return ctx.session.st('quic', () => ({ conns: [], byCid: new Map(), cidLens: new Set() }));
}
const cidKey = (d, o, n) => n + ':' + hexStr(d, o, n);

function looksLikeQuic(ctx, off, end) {
  const d = ctx.d;
  if (end - off < 7) return false;
  const b = d[off];
  if (b & 0x80) {
    const v = u32(d, off + 1);
    if (v === 0) return (b & 0x40) !== 0 || true;
    if (!(b & 0x40) || !VERSIONS[v]) return false;
    const dl = d[off + 5];
    return dl <= 20 && off + 6 + dl < end;
  }
  if (!(b & 0x40)) return false;
  return findShortConn(ctx, state(ctx), off + 1, end) !== null;
}
function findShortConn(ctx, st, o, end) {
  const d = ctx.d;
  for (const n of st.cidLens) {
    if (o + n > end) continue;
    const c = st.byCid.get(cidKey(d, o, n));
    if (c) return { conn: c, len: n };
  }
  return null;
}

function dissectQuic(ctx, off, end) {
  const d = ctx.d;
  ctx.setProtocol('QUIC');
  const st = state(ctx);
  const fd = ctx.fd;
  let pk = fd.quic;
  if (ctx.first && !pk) pk = fd.quic = [];
  if (!pk) pk = [];
  let o = off, idx = 0, firstNode = true;
  let info = '';
  const layerAt = ctx.layers.length;
  while (o < end) {
    const b = d[o];
    let top;
    if (firstNode) top = ctx.proto('quic', o, end - o, 'QUIC IETF');
    else { top = ctx.proto('quic', o, end - o, 'QUIC IETF'); ctx.layers.splice(ctx.layers.lastIndexOf('quic'), 1); }
    const rec = pk[idx] || (ctx.first ? (pk[idx] = {}) : {});
    let used;
    if (b & 0x80) {
      if (end - o < 7) { remaining(ctx, top, o, end); break; }
      used = longPacket(ctx, top, o, end, st, rec, firstNode);
    } else {
      used = shortPacket(ctx, top, o, end, st, rec, firstNode);
    }
    info = used.info;
    if (top !== NULLNODE) top.length = used.len;
    o += used.len;
    idx++;
    firstNode = false;
    if (used.len <= 0) break;
  }
  void layerAt;
  ctx.setInfo(info);
  ctx.infoOwner = 'quic';
  return end - off;
}

function connInfo(ctx, top, c) {
  if (!c || top === NULLNODE) return;
  const ci = ctx.text(top, 'QUIC Connection information');
  ctx.gen(ci, 'quic.connection.number', c.number);
}

function hdrBits(ctx, top, o, first, v2) {
  ctx.bits(top, o, 1, first, ['quic.header_form', 'quic.fixed_bit', v2 ? 'quic.long.packet_type_v2' : 'quic.long.packet_type']);
}

function longPacket(ctx, top, o, end, st, rec, firstNode) {
  const d = ctx.d;
  const first = d[o];
  const version = u32(d, o + 1);
  let p = o + 5;
  const dcl = d[p];
  ctx.need(p, 1 + dcl + 1, end);
  const dcid = d.subarray(p + 1, p + 1 + dcl);
  p += 1 + dcl;
  const scl = d[p];
  ctx.need(p, 1 + scl, end);
  const scid = d.subarray(p + 1, p + 1 + scl);
  p += 1 + scl;
  const dHex = hexStr(dcid, 0, dcl), sHex = hexStr(scid, 0, scl);
  if (version === 0) {
    // Version Negotiation: the rest of the datagram lists supported versions.
    if (ctx.tree) {
      ctx.gen(top, 'quic.packet_length', end - o);
      ctx.add(top, 'quic.header_form', o, 1, 1);
      ctx.add(top, 'quic.vn.unused', o, 1, first & 0x7f);
      ctx.add(top, 'quic.version', o + 1, 4, 0);
      ctx.add(top, 'quic.dcil', o + 5, 1, dcl);
      if (dcl) ctx.add(top, 'quic.dcid', o + 6, dcl, dcid);
      ctx.add(top, 'quic.scil', o + 6 + dcl, 1, scl);
      if (scl) ctx.add(top, 'quic.scid', o + 7 + dcl, scl, scid);
      for (let q = p; q + 4 <= end; q += 4) ctx.add(top, 'quic.supported_version', q, 4, u32(d, q));
    }
    return { len: end - o, info: `Version Negotiation, DCID=${dHex}, SCID=${sHex}` };
  }
  const v2 = version === 0x6b3343cf;
  const ltype = (first >> 4) & 3;
  // Reserved 0x?a?a?a?a versions force Version Negotiation (RFC 9000 15).
  const forcing = (version & 0x0f0f0f0f) === 0x0a0a0a0a;
  const name = forcing ? 'Forcing Version Negotiation' : (v2 ? LONG_TYPES_V2 : LONG_TYPES)[ltype];
  // connection tracking (first pass)
  if (ctx.first) {
    let c = st.byCid.get(cidKey(d, o + 6, dcl)) || (scl ? st.byCid.get(cidKey(scid, 0, scl)) : null);
    if (!c && name === 'Initial') {
      c = { number: st.conns.length, odcid: Uint8Array.from(dcid), client: ctx.netSrc + ':' + ctx.srcport, version };
      st.conns.push(c);
    }
    if (c) {
      if (dcl) { st.byCid.set(cidKey(dcid, 0, dcl), c); st.cidLens.add(dcl); }
      if (scl) { st.byCid.set(cidKey(scid, 0, scl), c); st.cidLens.add(scl); }
      rec.conn = c.number;
      rec.server = c.client !== ctx.netSrc + ':' + ctx.srcport;
      rec.odcid = c.odcid;
    }
  }
  const conn = rec.conn !== undefined ? st.conns[rec.conn] : null;
  if (firstNode) connInfo(ctx, top, conn);
  let info = `${name}, DCID=${dHex}`;
  if (scl || name !== 'Retry') info += `, SCID=${sHex}`;
  if (forcing) {
    if (ctx.tree) {
      ctx.gen(top, 'quic.packet_length', end - o);
      ctx.add(top, 'quic.header_form', o, 1, 1);
      ctx.add(top, 'quic.version', o + 1, 4, version);
      ctx.add(top, 'quic.dcil', o + 5, 1, dcl);
      if (dcl) ctx.add(top, 'quic.dcid', o + 6, dcl, dcid);
      ctx.add(top, 'quic.scil', o + 6 + dcl, 1, scl);
      if (scl) ctx.add(top, 'quic.scid', o + 7 + dcl, scl, scid);
      if (p < end) ctx.add(top, 'quic.remaining_payload', p, end - p, d.subarray(p, end));
    }
    return { len: end - o, info };
  }
  if (name === 'Retry') {
    const tagOff = end - 16;
    if (ctx.tree) {
      ctx.gen(top, 'quic.packet_length', end - o);
      hdrBits(ctx, top, o, first, v2);
      ctx.add(top, 'quic.version', o + 1, 4, version);
      ctx.add(top, 'quic.dcil', o + 5, 1, dcl);
      if (dcl) ctx.add(top, 'quic.dcid', o + 6, dcl, dcid);
      ctx.add(top, 'quic.scil', o + 6 + dcl, 1, scl);
      if (scl) ctx.add(top, 'quic.scid', o + 7 + dcl, scl, scid);
      if (tagOff > p) ctx.add(top, 'quic.retry_token', p, tagOff - p, d.subarray(p, tagOff));
      if (tagOff >= p) ctx.add(top, 'quic.retry_integrity_tag', tagOff, 16, d.subarray(tagOff, end));
    }
    return { len: end - o, info };
  }
  let tokLen = 0, tokOff = p;
  if (name === 'Initial') {
    const [tl, tll] = varint(d, p);
    tokLen = tl; tokOff = p + tll;
    p = tokOff + tl;
  }
  ctx.need(p, 1, end);
  const [len, ll] = varint(d, p);
  const lenOff = p;
  const pnOff = p + ll;
  const pend = Math.min(end, pnOff + len);
  const plen = pend - o;
  if (ctx.tree) {
    ctx.gen(top, 'quic.packet_length', plen);
    hdrBits(ctx, top, o, first, v2);
  }
  // Initial: decrypt with keys derived from the original DCID (both passes; deterministic).
  let dec = null;
  if (name === 'Initial' && rec.odcid && isKnownVersion(version)) {
    dec = rec.dec || quicUnprotectInitial(d.subarray(o, pend), pnOff - o, pend - o, rec.odcid, version, rec.server);
    if (ctx.first && dec) rec.dec = dec;
  }
  if (ctx.tree) {
    if (dec) {
      const f = dec.first;
      ctx.gen(top, 'quic.long.reserved', (f >> 2) & 3, `[.... ${((f >> 2) & 3).toString(2).padStart(2, '0')}.. = Reserved: ${(f >> 2) & 3}]`.slice(1, -1));
      ctx.gen(top, 'quic.packet_number_length', f & 3, `.... ..${(f & 3).toString(2).padStart(2, '0')} = Packet Number Length: ${PN_LEN[f & 3]} (${f & 3})`);
    }
    ctx.add(top, 'quic.version', o + 1, 4, version);
    ctx.add(top, 'quic.dcil', o + 5, 1, dcl);
    if (dcl) ctx.add(top, 'quic.dcid', o + 6, dcl, dcid);
    ctx.add(top, 'quic.scil', o + 6 + dcl, 1, scl);
    if (scl) ctx.add(top, 'quic.scid', o + 7 + dcl, scl, scid);
    if (name === 'Initial') {
      ctx.add(top, 'quic.token_length', tokOff - (tokOff - (o + 7 + dcl + scl)), tokOff - (o + 7 + dcl + scl), BigInt(tokLen));
      if (tokLen) ctx.add(top, 'quic.token', tokOff, tokLen, d.subarray(tokOff, tokOff + tokLen));
    }
    ctx.add(top, 'quic.length', lenOff, ll, BigInt(len));
  }
  if (dec) {
    ctx.gen(top, 'quic.packet_number', BigInt(dec.pn), undefined, pnOff, dec.pnLen);
    const payOff = pnOff + dec.pnLen;
    if (ctx.tree) ctx.add(top, 'quic.payload', payOff, pend - payOff, d.subarray(payOff, pend));
    const names = ctx.withSource(`Decrypted QUIC (${dec.payload.length} bytes)`, dec.payload, () => frames(ctx, top, 0, dec.payload.length, conn));
    info += `, PKN: ${dec.pn}`;
    if (names.length) info += ', ' + names.join(', ');
  } else {
    const msg = name === 'Initial' ? 'Failed to decrypt handshake' : 'Failed to create decryption context: Secrets are not available';
    ctx.ei(top, 'quic.decryption_failed', 0, 0, msg);
    if (ctx.tree) ctx.add(top, 'quic.remaining_payload', pnOff, pend - pnOff, d.subarray(pnOff, pend));
  }
  return { len: plen, info };
}

function shortPacket(ctx, top, o, end, st, rec, firstNode) {
  const d = ctx.d;
  const first = d[o];
  if (ctx.first) {
    const m = findShortConn(ctx, st, o + 1, end);
    if (m) { rec.conn = m.conn.number; rec.dcl = m.len; }
  }
  const conn = rec.conn !== undefined ? st.conns[rec.conn] : null;
  const dcl = rec.dcl ?? 0;
  if (firstNode) connInfo(ctx, top, conn);
  const dHex = hexStr(d, o + 1, dcl);
  if (ctx.tree) {
    ctx.gen(top, 'quic.packet_length', end - o);
    const sh = ctx.add(top, 'quic.short', o, 1 + dcl, null, `QUIC Short Header DCID=${dHex}`);
    ctx.bits(sh, o, 1, first, ['quic.header_form', 'quic.fixed_bit', 'quic.spin_bit']);
    if (dcl) ctx.add(sh, 'quic.dcid', o + 1, dcl, d.subarray(o + 1, o + 1 + dcl));
  }
  if (!conn) ctx.ei(top, 'quic.connection.unknown');
  ctx.ei(top, 'quic.decryption_failed', 0, 0, 'Failed to create decryption context: Secrets are not available');
  if (ctx.tree) ctx.add(top, 'quic.remaining_payload', o + 1 + dcl, end - o - 1 - dcl, d.subarray(o + 1 + dcl, end));
  // Header protection hides the key phase bit; Wireshark shows KP0 without keys.
  return { len: end - o, info: dcl ? `Protected Payload (KP0), DCID=${dHex}` : 'Protected Payload (KP0)' };
}

function remaining(ctx, top, o, end) {
  if (ctx.tree) ctx.add(top, 'quic.remaining_payload', o, end - o, ctx.d.subarray(o, end));
}

/** Frames of a decrypted packet. Returns frame names for Info (consecutive duplicates merged). */
function frames(ctx, top, o, end, conn) {
  const d = ctx.d;
  const names = [];
  const tree = ctx.tree;
  while (o < end) {
    const [ft, fl] = varint(d, o);
    const fname = FRAME_TYPES[ft];
    const start = o;
    if (!fname) {
      ctx.ei(top, 'quic.ft.unknown', o, fl);
      break;
    }
    if (names[names.length - 1] !== fname) names.push(fname);
    if (ft === 0) {
      let q = o;
      while (q < end && d[q] === 0) q++;
      if (tree) {
        const n = ctx.add(top, 'quic.frame', o, q - o, null, `PADDING Length: ${q - o}`);
        ctx.add(n, 'quic.frame_type', o, 1, 0n);
        ctx.gen(n, 'quic.padding_length', q - o);
      }
      o = q;
      continue;
    }
    const n = tree ? ctx.add(top, 'quic.frame', o, 0, null, fname) : NULLNODE;
    ctx.add(n, 'quic.frame_type', o, fl, BigInt(ft));
    o += fl;
    const vi = (abbrev) => { const [v, l] = varint(d, o); ctx.add(n, abbrev, o, l, BigInt(v)); o += l; return v; };
    switch (ft) {
      case 0x01: case 0x1e: break;
      case 0x02: case 0x03: {
        vi('quic.ack.largest_acknowledged');
        vi('quic.ack.ack_delay');
        const cnt = vi('quic.ack.ack_range_count');
        vi('quic.ack.first_ack_range');
        for (let i = 0; i < cnt; i++) { vi('quic.ack.gap'); vi('quic.ack.ack_range'); }
        if (ft === 0x03) { o += varint(d, o)[1]; o += varint(d, o)[1]; o += varint(d, o)[1]; }
        break;
      }
      case 0x06: {
        const off = vi('quic.crypto.offset');
        const len = vi('quic.crypto.length');
        const cd = ctx.add(n, 'quic.crypto.crypto_data', o, len, null);
        void cd;
        if (off === 0 && o + 4 <= end) cryptoTls(ctx, n, o, Math.min(end, o + len), conn);
        o += len;
        break;
      }
      case 0x07: { const l = vi('quic.nt.length'); ctx.add(n, 'quic.nt.token', o, l, d.subarray(o, o + l)); o += l; break; }
      case 0x08: case 0x09: case 0x0a: case 0x0b: case 0x0c: case 0x0d: case 0x0e: case 0x0f: {
        vi('quic.stream.stream_id');
        if (ft & 4) vi('quic.stream.offset');
        let l = end - o;
        if (ft & 2) l = vi('quic.stream.length');
        ctx.add(n, 'quic.stream_data', o, l, d.subarray(o, o + l));
        o += l;
        break;
      }
      case 0x1c: case 0x1d: {
        vi('quic.cc.error_code');
        if (ft === 0x1c) vi('quic.cc.frame_type');
        const l = vi('quic.cc.reason_phrase.length');
        ctx.add(n, 'quic.cc.reason_phrase', o, l, new TextDecoder().decode(d.subarray(o, o + l)));
        o += l;
        break;
      }
      case 0x18: { o += varint(d, o)[1]; o += varint(d, o)[1]; const l = d[o]; o += 1 + l + 16; break; }
      case 0x1a: case 0x1b: o += 8; break;
      case 0x04: o += varint(d, o)[1]; o += varint(d, o)[1]; o += varint(d, o)[1]; break;
      case 0x11: case 0x15: o += varint(d, o)[1]; o += varint(d, o)[1]; break;
      default: o += varint(d, o)[1]; break; // single-varint frames
    }
    if (n !== NULLNODE) n.length = o - start;
  }
  return names;
}

/** TLS handshake messages carried in a CRYPTO frame (TLS 1.3 inside QUIC). */
function cryptoTls(ctx, parent, o, end, conn) {
  const d = ctx.d;
  if (end - o < 4 || o + 4 + ((d[o + 1] << 16) | u16(d, o + 2)) > end) return; // fragment of a larger message
  const c = quicTlsState(ctx, conn);
  const saved = { info: ctx.info, owner: ctx.infoOwner, protocol: ctx.protocol };
  const rn = ctx.subProto(parent, 'tls', o, end - o, '');
  const desc = handshakeMessages(ctx, rn, o, end, c, false, true);
  if (rn !== NULLNODE) rn.label = `TLSv1.3 Record Layer: ${desc}`;
  ctx.info = saved.info; ctx.infoOwner = saved.owner; ctx.protocol = saved.protocol;
}
function quicTlsState(ctx, conn) {
  const st = ctx.session.st('quic-tls', () => new Map());
  const k = conn ? conn.number : -1;
  let c = st.get(k);
  if (!c) st.set(k, c = { index: 0, version: 0x0304, legacyVersion: 0x0303, cipher: -1, alpn: null, client: null, ccs: [false, false], serverPort: 0 });
  return c;
}
