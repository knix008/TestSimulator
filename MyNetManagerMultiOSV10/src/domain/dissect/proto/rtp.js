// RTP and RTCP (RFC 3550). Streams are normally set up by SDP (sip.js) through conversation
// bindings; the UDP heuristic exists but is off by default, as in Wireshark.
import { registerProtocol, u16, u32, ascii, NULLNODE } from '../core.js';

export const RTP_PT = {
  0: 'ITU-T G.711 PCMU', 1: 'USA Federal Standard FS-1016', 2: 'ITU-T G.721', 3: 'GSM 06.10', 4: 'ITU-T G.723',
  5: 'DVI4 8000 samples/s', 6: 'DVI4 16000 samples/s', 7: 'Experimental linear predictive encoding from Xerox PARC',
  8: 'ITU-T G.711 PCMA', 9: 'ITU-T G.722', 10: '16-bit uncompressed audio, stereo', 11: '16-bit uncompressed audio, monaural',
  12: 'Qualcomm Code Excited Linear Predictive coding', 13: 'Comfort noise', 14: 'MPEG-I/II Audio', 15: 'ITU-T G.728',
  16: 'DVI4 11025 samples/s', 17: 'DVI4 22050 samples/s', 18: 'ITU-T G.729', 19: 'Comfort noise (old)', 25: 'Sun CellB video encoding',
  26: 'JPEG-compressed video', 28: '\'nv\' program', 31: 'ITU-T H.261', 32: 'MPEG-I/II Video', 33: 'MPEG-II transport streams', 34: 'ITU-T H.263',
};
export function rtpPtName(pt) { return RTP_PT[pt] || (pt >= 96 && pt <= 127 ? `DynamicRTP-Type-${pt}` : `Unknown (${pt})`); }
const VERSION = { 0: 'Old VAT Version', 1: 'First Draft Version', 2: 'RFC 1889 Version' };
const FT = ['True', 'False'];

/** Called by SDP: remember who set up a media address so RTP/RTCP can show "[Stream setup by SDP (frame N)]". */
export function rtpSetup(session, addr, port, frame, callId, setupFrame = frame) {
  const st = session.st('rtpsetup', () => new Map());
  for (const [p, proto] of [[port, 'rtp'], [port + 1, 'rtcp']]) {
    const k = addr + ':' + p;
    let l = st.get(k);
    if (!l) st.set(k, l = []);
    l.push({ frame, setup: setupFrame, callId });
    session.setConversationProto('udp', addr, p, proto, frame);
  }
}
function setupFor(ctx) {
  const st = ctx.session.state.rtpsetup;
  if (!st || !ctx.net) return null;
  let best = null;
  for (const k of [ctx.net.dst + ':' + ctx.dstport, ctx.net.src + ':' + ctx.srcport]) {
    const l = st.get(k);
    if (!l) continue;
    for (const e of l) if (e.frame <= ctx.no && (!best || e.frame > best.frame)) best = e;
    if (best) break;
  }
  return best;
}
function setupTree(ctx, t, prefix, withCallId) {
  const s = setupFor(ctx);
  if (!s || !ctx.tree) return;
  const n = ctx.gen(t, `${prefix}.setup`, `SDP (frame ${s.setup})`, `Stream setup by SDP (frame ${s.setup})`);
  ctx.gen(n, `${prefix}.setup-frame`, s.setup, `Setup frame: ${s.setup}`);
  ctx.gen(n, `${prefix}.setup-method`, 'SDP');
  if (withCallId && s.callId) ctx.gen(n, 'sip.call_id_generated', s.callId);
}

registerProtocol({
  abbrev: 'rtp', name: 'Real-Time Transport Protocol', short: 'RTP',
  fields: [
    ['rtp.setup', 'Stream setup', 'string'],
    ['rtp.setup-frame', 'Setup frame', 'framenum'],
    ['rtp.setup-method', 'Setup Method', 'string'],
    ['rtp.version', 'Version', 'uint8', { mask: 0xc0, strings: VERSION }],
    ['rtp.padding', 'Padding', 'bool', { mask: 0x20, bits: 8, tfs: FT }],
    ['rtp.ext', 'Extension', 'bool', { mask: 0x10, bits: 8, tfs: FT }],
    ['rtp.cc', 'Contributing source identifiers count', 'uint8', { mask: 0x0f }],
    ['rtp.marker', 'Marker', 'bool', { mask: 0x80, bits: 8, tfs: FT }],
    ['rtp.p_type', 'Payload type', 'uint8', { mask: 0x7f, strings: RTP_PT }],
    ['rtp.seq', 'Sequence number', 'uint16'],
    ['rtp.extseq', 'Extended sequence number', 'uint32'],
    ['rtp.timestamp', 'Timestamp', 'uint32'],
    ['rtp.timestamp_ext', 'Extended timestamp', 'uint64'],
    ['rtp.ssrc', 'Synchronization Source identifier', 'uint32', { base: 'hex_dec' }],
    ['rtp.csrc.items', 'Contributing Source identifiers', 'none'],
    ['rtp.csrc.item', 'CSRC item', 'uint32', { base: 'hex_dec' }],
    ['rtp.ext.profile', 'Defined by profile', 'uint16', { base: 'hex_dec' }],
    ['rtp.ext.len', 'Extension length', 'uint16'],
    ['rtp.hdr_ext', 'Header extension', 'uint32', { base: 'hex' }],
    ['rtp.payload', 'Payload', 'bytes'],
    ['rtp.padding.data', 'Padding data', 'bytes'],
    ['rtp.padding.count', 'Padding count', 'uint8'],
  ],
  experts: [['rtp.padding_bogus', 'warn', 'Malformed', 'Frame has padding length value greater than payload length']],
  heuristics: { udp: rtpHeur },
  heurEnabled: { udp: false },
  dissect: dissectRtp,
});

function rtpHeur(ctx, off, end) {
  const d = ctx.d;
  if (end - off < 12) return false;
  if ((d[off] >> 6) !== 2) return false;
  const pt = d[off + 1] & 0x7f;
  if (pt >= 72 && pt <= 76) return false; // RTCP range
  return (ctx.srcport & 1) === 0 || (ctx.dstport & 1) === 0;
}

function dissectRtp(ctx, off, end) {
  const d = ctx.d;
  ctx.need(off, 12, end);
  const b0 = d[off], b1 = d[off + 1];
  const ver = b0 >> 6;
  if (ver !== 2) return false;
  const pad = (b0 & 0x20) !== 0, ext = (b0 & 0x10) !== 0, cc = b0 & 15;
  const marker = (b1 & 0x80) !== 0, pt = b1 & 0x7f;
  const seq = u16(d, off + 2), ts = u32(d, off + 4), ssrc = u32(d, off + 8);
  ctx.setProtocol('RTP');
  // extended sequence/timestamp per SSRC: first cycle starts at 65536 / 2^32 like Wireshark
  const fd = ctx.fd;
  if (ctx.first) {
    const st = ctx.session.st('rtp', () => new Map());
    let s = st.get(ssrc);
    if (!s) st.set(ssrc, s = { cyc: 1, last: seq, tcyc: 1, lastTs: ts });
    if (seq < s.last && s.last - seq > 0x8000) s.cyc++;
    if (ts < s.lastTs && s.lastTs - ts > 0x80000000) s.tcyc++;
    s.last = seq; s.lastTs = ts;
    fd.rtp = { extseq: s.cyc * 65536 + seq, extts: BigInt(s.tcyc) * 4294967296n + BigInt(ts) };
  }
  const x = fd.rtp || { extseq: 65536 + seq, extts: 4294967296n + BigInt(ts) };
  let info = `PT=${rtpPtName(pt)}, SSRC=0x${ssrc.toString(16).toUpperCase().padStart(8, '0')}, Seq=${seq}, Time=${ts}`;
  if (marker) info += ', Mark';
  ctx.setInfo(info);
  const t = ctx.proto('rtp', off, end - off, 'Real-Time Transport Protocol');
  setupTree(ctx, t, 'rtp', true);
  ctx.bits(t, off, 1, b0, ['rtp.version', 'rtp.padding', 'rtp.ext', 'rtp.cc']);
  ctx.add(t, 'rtp.marker', off + 1, 1, marker);
  ctx.add(t, 'rtp.p_type', off + 1, 1, pt, `Payload type: ${rtpPtName(pt)} (${pt})`);
  ctx.add(t, 'rtp.seq', off + 2, 2, seq);
  ctx.gen(t, 'rtp.extseq', x.extseq);
  ctx.add(t, 'rtp.timestamp', off + 4, 4, ts);
  ctx.gen(t, 'rtp.timestamp_ext', x.extts);
  ctx.add(t, 'rtp.ssrc', off + 8, 4, ssrc);
  let p = off + 12;
  if (cc) {
    ctx.need(p, cc * 4, end);
    const cn = ctx.add(t, 'rtp.csrc.items', p, cc * 4, null);
    for (let i = 0; i < cc; i++) ctx.add(cn, 'rtp.csrc.item', p + 4 * i, 4, u32(d, p + 4 * i));
    p += cc * 4;
  }
  if (ext) {
    ctx.need(p, 4, end);
    const elen = u16(d, p + 2);
    ctx.add(t, 'rtp.ext.profile', p, 2, u16(d, p));
    ctx.add(t, 'rtp.ext.len', p + 2, 2, elen);
    ctx.need(p + 4, elen * 4, end);
    for (let i = 0; i < elen; i++) ctx.add(t, 'rtp.hdr_ext', p + 4 + 4 * i, 4, u32(d, p + 4 + 4 * i));
    p += 4 + elen * 4;
  }
  let pend = end;
  if (pad && end > p) {
    const pc = d[end - 1];
    if (pc > end - p) ctx.ei(t, 'rtp.padding_bogus', end - 1, 1);
    else pend = end - pc;
  }
  if (pend > p) ctx.add(t, 'rtp.payload', p, pend - p, d.subarray(p, pend));
  if (pad && pend < end) {
    if (end - 1 > pend) ctx.add(t, 'rtp.padding.data', pend, end - 1 - pend, d.subarray(pend, end - 1));
    ctx.add(t, 'rtp.padding.count', end - 1, 1, d[end - 1]);
  }
  return end - off;
}

// ---------------------------------------------------------------------------------------------
const RTCP_PT = { 192: 'Full Intra-frame Request (H.261)', 193: 'Negative Acknowledgement (H.261)', 194: 'SMPTE time-code mapping', 195: 'Extended inter-arrival jitter report', 200: 'Sender Report', 201: 'Receiver Report', 202: 'Source description', 203: 'Goodbye', 204: 'Application specific', 205: 'Generic RTP Feedback', 206: 'Payload-specific Feedback', 207: 'Extended report (RFC 3611)', 208: 'AVB RTCP packet (IEEE1733)', 209: 'Receiver Summary Information', 210: 'Port Mapping' };
const SDES = { 0: 'END', 1: 'CNAME (user and domain)', 2: 'NAME (common name)', 3: 'EMAIL (e-mail address)', 4: 'PHONE (phone number)', 5: 'LOC (geographic location)', 6: 'TOOL (name/version of source app)', 7: 'NOTE (note about source)', 8: 'PRIV (private extensions)', 9: 'H323-CADDR (H.323 callable address)', 10: 'Application Specific Identifier' };
const NTP_EPOCH = 2208988800;

registerProtocol({
  abbrev: 'rtcp', name: 'Real-time Transport Control Protocol', short: 'RTCP',
  fields: [
    ['rtcp.setup', 'Stream setup', 'string'],
    ['rtcp.setup-frame', 'Setup frame', 'framenum'],
    ['rtcp.setup-method', 'Setup Method', 'string'],
    ['rtcp.version', 'Version', 'uint8', { mask: 0xc0, strings: VERSION }],
    ['rtcp.padding', 'Padding', 'bool', { mask: 0x20, bits: 8, tfs: FT }],
    ['rtcp.rc', 'Reception report count', 'uint8', { mask: 0x1f }],
    ['rtcp.sc', 'Source count', 'uint8', { mask: 0x1f }],
    ['rtcp.app.subtype', 'Subtype', 'uint8', { mask: 0x1f }],
    ['rtcp.pt', 'Packet type', 'uint8', { strings: RTCP_PT }],
    ['rtcp.length', 'Length', 'uint16'],
    ['rtcp.senderssrc', 'Sender SSRC', 'uint32', { base: 'hex_dec' }],
    ['rtcp.timestamp.ntp.msw', 'Timestamp, MSW', 'uint32', { base: 'dec_hex' }],
    ['rtcp.timestamp.ntp.lsw', 'Timestamp, LSW', 'uint32', { base: 'dec_hex' }],
    ['rtcp.timestamp.ntp', 'MSW and LSW as NTP timestamp', 'abs_time'],
    ['rtcp.timestamp.rtp', 'RTP timestamp', 'uint32'],
    ['rtcp.sender.packetcount', 'Sender\'s packet count', 'uint32'],
    ['rtcp.sender.octetcount', 'Sender\'s octet count', 'uint32'],
    ['rtcp.ssrc.identifier', 'Identifier', 'uint32', { base: 'hex_dec' }],
    ['rtcp.ssrc.fraction', 'Fraction lost', 'uint8'],
    ['rtcp.ssrc.cum_nr', 'Cumulative number of packets lost', 'int24'],
    ['rtcp.ssrc.ext_high', 'Extended highest sequence number received', 'uint32'],
    ['rtcp.ssrc.high_seq', 'Highest sequence number received', 'uint16'],
    ['rtcp.ssrc.high_cycles', 'Sequence number cycles count', 'uint16'],
    ['rtcp.ssrc.jitter', 'Interarrival jitter', 'uint32'],
    ['rtcp.ssrc.lsr', 'Last SR timestamp', 'uint32', { base: 'dec_hex' }],
    ['rtcp.ssrc.dlsr', 'Delay since last SR timestamp', 'uint32'],
    ['rtcp.sdes.type', 'Type', 'uint8', { strings: SDES }],
    ['rtcp.sdes.length', 'Length', 'uint32'],
    ['rtcp.sdes.text', 'Text', 'string'],
    ['rtcp.app.name', 'Name (ASCII)', 'string'],
    ['rtcp.app.data', 'Application specific data', 'bytes'],
    ['rtcp.length_check', 'RTCP frame length check', 'bool'],
  ],
  experts: [['rtcp.length_check.bad', 'warn', 'Malformed', 'Incorrect RTCP packet length information']],
  dissect: dissectRtcp,
});

function dissectRtcp(ctx, off, end) {
  const d = ctx.d;
  ctx.need(off, 4, end);
  if ((d[off] >> 6) !== 2) return false;
  ctx.setProtocol('RTCP');
  let p = off, info = '', first = true, last = NULLNODE, total = 0;
  while (p + 4 <= end) {
    const b0 = d[p], pt = d[p + 1], len = u16(d, p + 2), plen = (len + 1) * 4;
    const name = RTCP_PT[pt] || `Unknown (${pt})`;
    info += name + '   ';
    const t = ctx.proto('rtcp', p, Math.min(plen, end - p), `Real-time Transport Control Protocol (${name})`);
    if (!first) ctx.layers.pop(); // one 'rtcp' entry in frame.protocols for a compound packet
    first = false;
    last = t;
    setupTree(ctx, t, 'rtcp', false);
    const cnt = b0 & 31;
    ctx.bits(t, p, 1, b0, ['rtcp.version', 'rtcp.padding', pt === 204 ? 'rtcp.app.subtype' : pt === 200 || pt === 201 ? 'rtcp.rc' : 'rtcp.sc']);
    ctx.add(t, 'rtcp.pt', p + 1, 1, pt);
    ctx.add(t, 'rtcp.length', p + 2, 2, len, `Length: ${len} (${plen} bytes)`);
    ctx.need(p, plen, end);
    let q = p + 4;
    const pe = p + plen;
    if (ctx.tree) {
      if (pt === 200 || pt === 201) {
        ctx.add(t, 'rtcp.senderssrc', q, 4, u32(d, q)); q += 4;
        if (pt === 200) {
          const msw = u32(d, q), lsw = u32(d, q + 4);
          ctx.add(t, 'rtcp.timestamp.ntp.msw', q, 4, msw);
          ctx.add(t, 'rtcp.timestamp.ntp.lsw', q + 4, 4, lsw);
          const ntp = { sec: msw - NTP_EPOCH, nsec: Math.round(lsw / 4294967296 * 1e9) };
          ctx.gen(t, 'rtcp.timestamp.ntp', ntp, `MSW and LSW as NTP timestamp: ${ntpStr(ntp)}`, q, 8);
          ctx.add(t, 'rtcp.timestamp.rtp', q + 8, 4, u32(d, q + 8));
          ctx.add(t, 'rtcp.sender.packetcount', q + 12, 4, u32(d, q + 12));
          ctx.add(t, 'rtcp.sender.octetcount', q + 16, 4, u32(d, q + 16));
          q += 20;
        }
        for (let i = 0; i < cnt && q + 24 <= pe; i++, q += 24) {
          const id = u32(d, q);
          const s = ctx.text(t, `Source ${i + 1}`, q, 24);
          ctx.add(s, 'rtcp.ssrc.identifier', q, 4, id);
          ctx.add(s, 'rtcp.ssrc.fraction', q + 4, 1, d[q + 4], `Fraction lost: ${d[q + 4]} / 256`);
          const cum = (((d[q + 5] << 16) | (d[q + 6] << 8) | d[q + 7]) << 8) >> 8;
          ctx.add(s, 'rtcp.ssrc.cum_nr', q + 5, 3, cum);
          const eh = ctx.add(s, 'rtcp.ssrc.ext_high', q + 8, 4, u32(d, q + 8));
          ctx.add(eh, 'rtcp.ssrc.high_cycles', q + 8, 2, u16(d, q + 8));
          ctx.add(eh, 'rtcp.ssrc.high_seq', q + 10, 2, u16(d, q + 10));
          ctx.add(s, 'rtcp.ssrc.jitter', q + 12, 4, u32(d, q + 12));
          ctx.add(s, 'rtcp.ssrc.lsr', q + 16, 4, u32(d, q + 16));
          const dl = u32(d, q + 20);
          ctx.add(s, 'rtcp.ssrc.dlsr', q + 20, 4, dl, `Delay since last SR timestamp: ${dl} (${Math.round(dl / 65.536)} milliseconds)`);
        }
      } else if (pt === 202) {
        for (let i = 0; i < cnt && q + 4 <= pe; i++) {
          const id = u32(d, q);
          const ch = ctx.text(t, `Chunk ${i + 1}, SSRC/CSRC 0x${id.toString(16).toUpperCase().padStart(8, '0')}`, q, 0);
          const cs = q;
          ctx.add(ch, 'rtcp.ssrc.identifier', q, 4, id);
          q += 4;
          const items = ctx.text(ch, 'SDES items', q, 0);
          while (q < pe) {
            const ty = d[q];
            ctx.add(items, 'rtcp.sdes.type', q, 1, ty);
            if (ty === 0) { q++; while (q & 3 && q < pe) q++; break; }
            const l = d[q + 1];
            ctx.add(items, 'rtcp.sdes.length', q + 1, 1, l);
            ctx.add(items, 'rtcp.sdes.text', q + 2, l, ascii(d, q + 2, l));
            q += 2 + l;
          }
          ch.length = q - cs;
        }
      } else if (pt === 203) {
        for (let i = 0; i < cnt && q + 4 <= pe; i++, q += 4) ctx.add(t, 'rtcp.ssrc.identifier', q, 4, u32(d, q));
      } else if (pt === 204) {
        ctx.add(t, 'rtcp.senderssrc', q, 4, u32(d, q));
        ctx.add(t, 'rtcp.app.name', q + 4, 4, ascii(d, q + 4, 4));
        if (pe > q + 8) ctx.add(t, 'rtcp.app.data', q + 8, pe - q - 8, d.subarray(q + 8, pe));
      } else if (pe > q) {
        ctx.add(t, 'rtcp.senderssrc', q, 4, u32(d, q));
      }
    }
    total += plen;
    p = pe;
  }
  const ok = total === end - off;
  ctx.gen(last, 'rtcp.length_check', ok, `RTCP frame length check: ${ok ? 'OK' : 'Wrong'} - ${end - off} bytes`);
  if (!ok) ctx.ei(last, 'rtcp.length_check.bad');
  ctx.setInfo(info);
  return end - off;
}

function ntpStr(t) {
  const dt = new Date(t.sec * 1000);
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const p2 = (n) => String(n).padStart(2, '0');
  return `${M[dt.getUTCMonth()]} ${p2(dt.getUTCDate())}, ${dt.getUTCFullYear()} ${p2(dt.getUTCHours())}:${p2(dt.getUTCMinutes())}:${p2(dt.getUTCSeconds())}.${String(t.nsec).padStart(9, '0')} UTC`;
}
