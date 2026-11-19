// TCP: header, options, Wireshark-style sequence analysis, stream tracking, PDU framing and reassembly.
import { registerProtocol, registerFields, getProtocol, u16, u32, hexPad, NULLNODE, formatRelTime } from '../core.js';
import { portLabel } from '../names.js';
import { pseudoChecksum, CKSUM_STATUS } from './ip.js';

// Analysis flags (bitmask stored per frame on the first pass)
const A = {
  RETRANSMISSION: 0x1, LOST_PACKET: 0x2, ACK_LOST_PACKET: 0x4, KEEP_ALIVE: 0x8, DUPLICATE_ACK: 0x10,
  ZERO_WINDOW: 0x20, ZERO_WINDOW_PROBE: 0x40, ZERO_WINDOW_PROBE_ACK: 0x80, KEEP_ALIVE_ACK: 0x100,
  OUT_OF_ORDER: 0x200, FAST_RETRANSMISSION: 0x400, WINDOW_UPDATE: 0x800, WINDOW_FULL: 0x1000,
  REUSED_PORTS: 0x2000, SPURIOUS_RETRANSMISSION: 0x4000,
};
export const TCP_ANALYSIS = A;

const FIN = 0x01, SYN = 0x02, RST = 0x04, PSH = 0x08, ACK = 0x10, URG = 0x20, ECE = 0x40, CWR = 0x80, AE = 0x100;
const FLAG_NAMES = [[FIN, 'FIN'], [SYN, 'SYN'], [RST, 'RST'], [PSH, 'PSH'], [ACK, 'ACK'], [URG, 'URG'], [ECE, 'ECE'], [CWR, 'CWR'], [AE, 'AE']];
const SET = ['Set', 'Not set'];

const GT = (a, b) => ((a - b) | 0) > 0;
const LT = (a, b) => ((a - b) | 0) < 0;
const LE = (a, b) => ((a - b) | 0) <= 0;

registerProtocol({
  abbrev: 'tcp', name: 'Transmission Control Protocol', short: 'TCP',
  fields: [
    ['tcp.srcport', 'Source Port', 'uint16'],
    ['tcp.dstport', 'Destination Port', 'uint16'],
    ['tcp.port', 'Source or Destination Port', 'uint16'],
    ['tcp.stream', 'Stream index', 'uint32'],
    ['tcp.stream.pnum', 'Stream Packet Number', 'uint32'],
    ['tcp.completeness', 'Conversation completeness', 'uint8'],
    ['tcp.completeness.rst', 'RST', 'bool', { mask: 0x20, bits: 8, tfs: ['Present', 'Absent'] }],
    ['tcp.completeness.fin', 'FIN', 'bool', { mask: 0x10, bits: 8, tfs: ['Present', 'Absent'] }],
    ['tcp.completeness.data', 'Data', 'bool', { mask: 0x08, bits: 8, tfs: ['Present', 'Absent'] }],
    ['tcp.completeness.ack', 'ACK', 'bool', { mask: 0x04, bits: 8, tfs: ['Present', 'Absent'] }],
    ['tcp.completeness.syn-ack', 'SYN-ACK', 'bool', { mask: 0x02, bits: 8, tfs: ['Present', 'Absent'] }],
    ['tcp.completeness.syn', 'SYN', 'bool', { mask: 0x01, bits: 8, tfs: ['Present', 'Absent'] }],
    ['tcp.completeness.str', 'Completeness Flags', 'string'],
    ['tcp.len', 'TCP Segment Len', 'uint32'],
    ['tcp.seq', 'Sequence Number', 'uint32'],
    ['tcp.seq_raw', 'Sequence Number (raw)', 'uint32'],
    ['tcp.nxtseq', 'Next Sequence Number', 'uint32'],
    ['tcp.ack', 'Acknowledgment Number', 'uint32'],
    ['tcp.ack_raw', 'Acknowledgment number (raw)', 'uint32'],
    ['tcp.hdr_len', 'Header Length', 'uint8'],
    ['tcp.flags', 'Flags', 'uint16', { base: 'hex', mask: 0xfff, bits: 12 }],
    ['tcp.flags.res', 'Reserved', 'bool', { mask: 0xe00, bits: 12, tfs: SET }],
    ['tcp.flags.ae', 'Accurate ECN', 'bool', { mask: 0x100, bits: 12, tfs: SET }],
    ['tcp.flags.cwr', 'Congestion Window Reduced', 'bool', { mask: 0x080, bits: 12, tfs: SET }],
    ['tcp.flags.ece', 'ECN-Echo', 'bool', { mask: 0x040, bits: 12, tfs: SET }],
    ['tcp.flags.urg', 'Urgent', 'bool', { mask: 0x020, bits: 12, tfs: SET }],
    ['tcp.flags.ack', 'Acknowledgment', 'bool', { mask: 0x010, bits: 12, tfs: SET }],
    ['tcp.flags.push', 'Push', 'bool', { mask: 0x008, bits: 12, tfs: SET }],
    ['tcp.flags.reset', 'Reset', 'bool', { mask: 0x004, bits: 12, tfs: SET }],
    ['tcp.flags.syn', 'Syn', 'bool', { mask: 0x002, bits: 12, tfs: SET }],
    ['tcp.flags.fin', 'Fin', 'bool', { mask: 0x001, bits: 12, tfs: SET }],
    ['tcp.flags.str', 'TCP Flags', 'string'],
    ['tcp.window_size_value', 'Window', 'uint16'],
    ['tcp.window_size', 'Calculated window size', 'uint32'],
    ['tcp.window_size_scalefactor', 'Window size scaling factor', 'int32'],
    ['tcp.checksum', 'Checksum', 'uint16', { base: 'hex' }],
    ['tcp.checksum.status', 'Checksum Status', 'uint8', { base: 'none', strings: CKSUM_STATUS }],
    ['tcp.checksum_calculated', 'Calculated Checksum', 'uint16', { base: 'hex' }],
    ['tcp.urgent_pointer', 'Urgent Pointer', 'uint16'],
    ['tcp.options', 'TCP Options', 'bytes'],
    ['tcp.option_kind', 'Kind', 'uint8', { strings: { 0: 'End of Option List', 1: 'No-Operation', 2: 'Maximum Segment Size', 3: 'Window Scale', 4: 'SACK Permitted', 5: 'SACK', 8: 'Time Stamp Option', 28: 'User Timeout', 29: 'TCP Authentication Option', 30: 'Multipath TCP', 34: 'TCP Fast Open Cookie' } }],
    ['tcp.option_len', 'Length', 'uint8'],
    ['tcp.options.mss_val', 'MSS Value', 'uint16'],
    ['tcp.options.wscale.shift', 'Shift count', 'uint8'],
    ['tcp.options.wscale.multiplier', 'Multiplier', 'uint16'],
    ['tcp.options.sack_le', 'TCP SACK Left Edge', 'uint32'],
    ['tcp.options.sack_re', 'TCP SACK Right Edge', 'uint32'],
    ['tcp.options.sack.count', 'TCP SACK Count', 'uint8'],
    ['tcp.options.timestamp.tsval', 'Timestamp value', 'uint32'],
    ['tcp.options.timestamp.tsecr', 'Timestamp echo reply', 'uint32'],
    ['tcp.options.unknown.payload', 'Payload', 'bytes'],
    ['tcp.analysis', 'SEQ/ACK analysis', 'none'],
    ['tcp.analysis.flags', 'TCP Analysis Flags', 'none'],
    ['tcp.analysis.duplicate_ack_num', 'Duplicate ACK #', 'uint32'],
    ['tcp.analysis.duplicate_ack_frame', 'Duplicate to the ACK in frame', 'framenum'],
    ['tcp.analysis.acks_frame', 'This is an ACK to the segment in frame', 'framenum'],
    ['tcp.analysis.bytes_in_flight', 'Bytes in flight', 'uint32'],
    ['tcp.analysis.push_bytes_sent', 'Bytes sent since last PSH flag', 'uint32'],
    ['tcp.analysis.ack_rtt', 'The RTT to ACK the segment was', 'rel_time'],
    ['tcp.analysis.initial_rtt', 'iRTT', 'rel_time'],
    ['tcp.analysis.rto', 'The RTO for this segment was', 'rel_time'],
    ['tcp.analysis.rto_frame', 'RTO based on delta from frame', 'framenum'],
    ['tcp.time_relative', 'Time since first frame in this TCP stream', 'rel_time'],
    ['tcp.time_delta', 'Time since previous frame in this TCP stream', 'rel_time'],
    ['tcp.payload', 'TCP payload', 'bytes'],
    ['tcp.segment_data', 'TCP segment data', 'bytes'],
    ['tcp.segment', 'TCP Segment', 'framenum'],
    ['tcp.segments', 'Reassembled TCP Segments', 'none'],
    ['tcp.segment.count', 'Segment count', 'uint32'],
    ['tcp.reassembled_in', 'Reassembled PDU in frame', 'framenum'],
    ['tcp.reassembled.length', 'Reassembled TCP length', 'uint32'],
    ['tcp.reassembled.data', 'Reassembled TCP Data', 'bytes'],
    ['tcp.pdu.size', 'PDU Size', 'uint32'],
  ],
  experts: [
    ['tcp.analysis.retransmission', 'note', 'Sequence', 'This frame is a (suspected) retransmission'],
    ['tcp.analysis.fast_retransmission', 'note', 'Sequence', 'This frame is a (suspected) fast retransmission'],
    ['tcp.analysis.spurious_retransmission', 'note', 'Sequence', 'This frame is a (suspected) spurious retransmission'],
    ['tcp.analysis.out_of_order', 'warn', 'Sequence', 'This frame is a (suspected) out-of-order segment'],
    ['tcp.analysis.reused_ports', 'note', 'Sequence', 'A new tcp session is started with the same ports as an earlier session in this trace'],
    ['tcp.analysis.lost_segment', 'warn', 'Sequence', 'Previous segment(s) not captured (common at capture start)'],
    ['tcp.analysis.ack_lost_segment', 'warn', 'Sequence', 'ACKed segment that wasn\'t captured (common at capture start)'],
    ['tcp.analysis.window_update', 'chat', 'Sequence', 'TCP window update'],
    ['tcp.analysis.window_full', 'warn', 'Sequence', 'TCP window specified by the receiver is now completely full'],
    ['tcp.analysis.keep_alive', 'note', 'Sequence', 'TCP keep-alive segment'],
    ['tcp.analysis.keep_alive_ack', 'note', 'Sequence', 'ACK to a TCP keep-alive segment'],
    ['tcp.analysis.duplicate_ack', 'note', 'Sequence', 'Duplicate ACK'],
    ['tcp.analysis.zero_window_probe', 'note', 'Sequence', 'TCP Zero Window Probe'],
    ['tcp.analysis.zero_window', 'warn', 'Sequence', 'TCP Zero Window segment'],
    ['tcp.analysis.zero_window_probe_ack', 'note', 'Sequence', 'ACK to a TCP Zero Window Probe'],
    ['tcp.connection.syn', 'chat', 'Sequence', 'Connection establish request (SYN)'],
    ['tcp.connection.synack', 'chat', 'Sequence', 'Connection establish acknowledge (SYN+ACK)'],
    ['tcp.connection.fin', 'chat', 'Sequence', 'Connection finish (FIN)'],
    ['tcp.connection.rst', 'warn', 'Sequence', 'Connection reset (RST)'],
    ['tcp.connection.fin_active', 'note', 'Sequence', 'This frame initiates the connection closing'],
    ['tcp.connection.fin_passive', 'note', 'Sequence', 'This frame undergoes the connection closing'],
    ['tcp.analysis.partial_ack', 'note', 'Sequence', 'Partial Acknowledgement of a segment'],
    ['tcp.analysis.ambiguous_ack', 'note', 'Sequence', 'Ambiguous ACK following Karn\'s definition'],
    ['tcp.checksum_bad.expert', 'error', 'Checksum', 'Bad checksum'],
    ['tcp.option.len.invalid', 'error', 'Protocol', 'Invalid length for option'],
    ['tcp.short_segment', 'warn', 'Malformed', 'Short segment'],
    ['tcp.bogus_header_length', 'error', 'Malformed', 'Bogus TCP Header length'],
  ],
  tables: { 'ip.proto': [6] },
  dissect: dissectTcp,
});
registerFields('tcp', [
  ['tcp.options.mss', 'TCP Option - Maximum segment size', 'none'],
  ['tcp.options.nop', 'TCP Option - No-Operation (NOP)', 'none'],
  ['tcp.options.eol', 'TCP Option - End of Option List (EOL)', 'none'],
  ['tcp.options.wscale', 'TCP Option - Window scale', 'none'],
  ['tcp.options.sack_perm', 'TCP Option - SACK permitted', 'none'],
  ['tcp.options.sack', 'TCP Option - SACK', 'none'],
  ['tcp.options.timestamp', 'TCP Option - Timestamps', 'none'],
  ['tcp.options.unknown', 'TCP Option - Unknown', 'none'],
]);

function flagStr(f) {
  let s = '';
  for (const [b, n] of FLAG_NAMES) if (f & b) s += (s ? ', ' : '') + n;
  return s || '<None>';
}
function flagLetters(f) {
  const L = ['R', 'R', 'R', 'A', 'C', 'E', 'U', 'A', 'P', 'R', 'S', 'F'];
  let s = '';
  for (let i = 0; i < 12; i++) s += (f >> (11 - i)) & 1 ? L[i] : '·';
  return s;
}

function newFlow(addr, port) {
  return {
    addr, port, baseSet: false, base: 0, nextseq: 0, nextseqframe: 0, nextseqtime: 0,
    maxseqtobeacked: 0, lastack: 0, lastacktime: 0, lastacklen: 0, lastnondupack: 0, dupacknum: 0, window: -1,
    winScale: -1, isFirstAck: false, lastsegflags: 0, segments: [], validBif: false, pushBytes: 0, pushSetLast: false,
    sack: null, closing: false, pending: null, heur: null,
  };
}

const C_SYN = 0x01, C_SYNACK = 0x02, C_ACK = 0x04, C_DATA = 0x08, C_FIN = 0x10, C_RST = 0x20;

/** Find or create the conversation; a SYN with a new ISN (or after FIN/RST) starts a new one ("ports reused"). */
function getStream(ctx, src, sp, dst, dp, seq, flags) {
  const st = ctx.session.st('tcp', () => ({ convs: new Map(), count: 0 }));
  const ka = src + ':' + sp, kb = dst + ':' + dp;
  const key = ka < kb ? ka + '-' + kb : kb + '-' + ka;
  let c = st.convs.get(key);
  let reused = false;
  if (c && (flags & (SYN | ACK)) === SYN) {
    const f = c.flows[0].addr === src && c.flows[0].port === sp ? c.flows[0] : c.flows[1];
    if (f.baseSet && (seq !== f.base || (c.completeness & (C_RST | C_FIN)))) { reused = true; c = null; }
  }
  const isNew = !c;
  if (!c) {
    c = {
      index: st.count++, flows: [newFlow(src, sp), newFlow(dst, dp)], first: ctx.fd.rel, last: ctx.fd.rel, pnum: 0,
      synTime: -1, irtt: 0, completeness: 0, server: null,
    };
    st.convs.set(key, c);
  }
  return { c, reused, isNew };
}

function completenessLabel(v) {
  const L = (s) => `${s} (${v})`;
  switch (v) {
    case 1: return L('Incomplete, SYN_SENT');
    case 3: return L('Incomplete, CLIENT_ESTABLISHED');
    case 7: return L('Incomplete, ESTABLISHED');
    case 15: return L('Incomplete, DATA');
    case 31: case 47: case 63: return L('Complete, WITH_DATA');
    case 23: case 39: case 55: return L('Complete, NO_DATA');
    default: return L('Incomplete');
  }
}
function completenessLetters(v) {
  return (v & C_RST ? 'R' : '·') + (v & C_FIN ? 'F' : '·') + (v & C_DATA ? 'D' : '·') + (v & C_ACK ? 'A' : '·') + (v & C_SYNACK ? 'S' : '·') + (v & C_SYN ? 'S' : '·');
}

function dissectTcp(ctx, off, end) {
  const d = ctx.d;
  if (ctx.inError && end - off < 20) {
    // ICMP errors quote only 8 bytes of the transport header.
    ctx.need(off, 8, end);
    const t = ctx.proto('tcp', off, end - off);
    const sp = u16(d, off), dp = u16(d, off + 2);
    if (ctx.tree) {
      t.label = `Transmission Control Protocol, Src Port: ${sp}, Dst Port: ${dp}, Seq: ${u32(d, off + 4)}`;
      ctx.add(t, 'tcp.srcport', off, 2, sp);
      ctx.add(t, 'tcp.dstport', off + 2, 2, dp);
      ctx.hidden(t, 'tcp.port', off, 2, sp);
      ctx.hidden(t, 'tcp.port', off + 2, 2, dp);
      ctx.add(t, 'tcp.seq_raw', off + 4, 4, u32(d, off + 4));
    }
    return end - off;
  }
  ctx.need(off, 20, end);
  const sp = u16(d, off), dp = u16(d, off + 2);
  const seqRaw = u32(d, off + 4), ackRaw = u32(d, off + 8);
  const hl = (d[off + 12] >> 4) * 4;
  const flags = u16(d, off + 12) & 0xfff;
  const win = u16(d, off + 14), ck = u16(d, off + 16), urg = u16(d, off + 18);
  const inErr = ctx.inError;
  ctx.setProtocol('TCP');
  if (!inErr) { ctx.ptype = 'tcp'; ctx.srcport = sp; ctx.dstport = dp; }
  const t = ctx.proto('tcp', off, Math.min(hl < 20 ? 20 : hl, end - off));
  const res = ctx.resolve;
  if (ctx.tree) {
    ctx.add(t, 'tcp.srcport', off, 2, sp, 'Source Port: ' + portLabel(sp, 'tcp', res));
    ctx.add(t, 'tcp.dstport', off + 2, 2, dp, 'Destination Port: ' + portLabel(dp, 'tcp', res));
    ctx.hidden(t, 'tcp.port', off, 2, sp);
    ctx.hidden(t, 'tcp.port', off + 2, 2, dp);
  }
  if (hl < 20) {
    ctx.add(t, 'tcp.hdr_len', off + 12, 1, hl, `${(hl / 4).toString(2).padStart(4, '0')} .... = Header Length: ${hl} bytes (${hl / 4})`);
    ctx.ei(t, 'tcp.bogus_header_length', off + 12, 1, `Bogus TCP header length (${hl}, must be at least 20)`);
    ctx.setInfo(`${sp} → ${dp} [${flagStr(flags)}] [Bogus TCP header length (${hl}, must be at least 20)]`);
    return end - off;
  }
  ctx.need(off, hl, end);
  const plen = end - off - hl;
  const poff = off + hl;
  const net = ctx.net;
  const src = net ? net.src : '', dst = net ? net.dst : '';

  // ---- first pass: stream + sequence analysis
  const fd = ctx.fd;
  let a = inErr ? null : fd.tcp;
  if (ctx.first && !inErr) {
    a = fd.tcp = analyze(ctx, src, sp, dst, dp, seqRaw, ackRaw, flags, win, plen, d, off + 20, off + hl);
  }
  if (inErr || !a) a = { stream: undefined, rseq: seqRaw, rack: ackRaw, nxt: (seqRaw + plen) >>> 0, calcWin: win, scale: -1, flags: 0, conv: null };
  if (!inErr) ctx.tcpStream = a.stream;
  const seglen = plen;
  const rseq = ctx.session.prefs.tcp.relativeSeq ? a.rseq : seqRaw;
  const rack = ctx.session.prefs.tcp.relativeSeq ? a.rack : ackRaw;
  const nxt = ctx.session.prefs.tcp.relativeSeq ? a.nxt : (seqRaw + seglen + ((flags & (SYN | FIN)) ? 1 : 0)) >>> 0;

  // ---- tree
  if (ctx.tree) {
    t.label = `Transmission Control Protocol, Src Port: ${portLabel(sp, 'tcp', res)}, Dst Port: ${portLabel(dp, 'tcp', res)}, Seq: ${rseq}` +
      (flags & ACK ? `, Ack: ${rack}` : '') + `, Len: ${seglen}`;
    if (a.stream !== undefined) {
      ctx.gen(t, 'tcp.stream', a.stream);
      ctx.gen(t, 'tcp.stream.pnum', a.pnum);
      if (a.conv) {
        const v = a.conv.completeness;
        const cn = ctx.gen(t, 'tcp.completeness', v, 'Conversation completeness: ' + completenessLabel(v));
        ctx.bits(cn, 0, 0, v, ['tcp.completeness.rst', 'tcp.completeness.fin', 'tcp.completeness.data', 'tcp.completeness.ack', 'tcp.completeness.syn-ack', 'tcp.completeness.syn']);
        ctx.gen(cn, 'tcp.completeness.str', completenessLetters(v), 'Completeness Flags: ' + completenessLetters(v));
      }
    }
    ctx.gen(t, 'tcp.len', seglen);
    const rel = ctx.session.prefs.tcp.relativeSeq && !inErr;
    ctx.add(t, 'tcp.seq', off + 4, 4, rseq, `Sequence Number: ${rseq}${rel ? '    (relative sequence number)' : ''}`);
    ctx.add(t, 'tcp.seq_raw', off + 4, 4, seqRaw);
    ctx.gen(t, 'tcp.nxtseq', nxt, `Next Sequence Number: ${nxt}${rel ? '    (relative sequence number)' : ''}`);
    if (flags & ACK) {
      ctx.add(t, 'tcp.ack', off + 8, 4, rack, `Acknowledgment Number: ${rack}${rel ? '    (relative ack number)' : ''}`);
      ctx.add(t, 'tcp.ack_raw', off + 8, 4, ackRaw);
    } else {
      ctx.add(t, 'tcp.ack_raw', off + 8, 4, ackRaw, `Acknowledgment number: ${ackRaw}`);
    }
    ctx.add(t, 'tcp.hdr_len', off + 12, 1, hl, `${(hl / 4).toString(2).padStart(4, '0')} .... = Header Length: ${hl} bytes (${hl / 4})`);
    const fn = ctx.add(t, 'tcp.flags', off + 12, 2, flags, `Flags: ${hexPad(flags, 3)} (${flagStr(flags)})`);
    ctx.bits(fn, off + 12, 2, flags, ['tcp.flags.res', 'tcp.flags.ae', 'tcp.flags.cwr', 'tcp.flags.ece', 'tcp.flags.urg', 'tcp.flags.ack', 'tcp.flags.push', 'tcp.flags.reset']);
    const synN = ctx.add(fn, 'tcp.flags.syn', off + 12, 2, (flags & SYN) !== 0);
    if (flags & SYN) {
      if (flags & ACK) ctx.ei(synN, 'tcp.connection.synack', off + 12, 2, `Connection establish acknowledge (SYN+ACK): server port ${sp}`);
      else ctx.ei(synN, 'tcp.connection.syn', off + 12, 2, `Connection establish request (SYN): server port ${dp}`);
    }
    const finN = ctx.add(fn, 'tcp.flags.fin', off + 12, 2, (flags & FIN) !== 0);
    if (flags & FIN) {
      ctx.ei(finN, 'tcp.connection.fin', off + 12, 2);
      if (a.finActive === 1) ctx.ei(finN, 'tcp.connection.fin_active', off + 12, 2);
      else if (a.finActive === 2) ctx.ei(finN, 'tcp.connection.fin_passive', off + 12, 2);
    }
    if (flags & RST) {
      const rn = fn.children ? fn.children.find((n) => n.abbrev === 'tcp.flags.reset') : fn;
      ctx.ei(rn || fn, 'tcp.connection.rst', off + 12, 2);
    }
    ctx.gen(fn, 'tcp.flags.str', flagLetters(flags), `TCP Flags: ${flagLetters(flags)}`);
    ctx.add(t, 'tcp.window_size_value', off + 14, 2, win);
    ctx.gen(t, 'tcp.window_size', a.calcWin);
    // SYN windows are never scaled, so Wireshark shows no scaling factor there
    if (!(flags & SYN)) ctx.gen(t, 'tcp.window_size_scalefactor', a.scale,
      `Window size scaling factor: ${a.scale === -1 ? '-1 (unknown)' : a.scale === -2 ? '-2 (no window scaling used)' : a.scale}`);
    if (ctx.session.prefs.tcp.checksum && net && !inErr && ctx.source === 0 && ctx.frame.len === ctx.frame.caplen) {
      const c = pseudoChecksum(net, 6, d, off, end - off);
      ctx.add(t, 'tcp.checksum', off + 16, 2, ck, `Checksum: ${hexPad(ck, 4)} [${c === 0 ? 'correct' : 'incorrect'}]`);
      ctx.gen(t, 'tcp.checksum.status', c === 0 ? 1 : 0);
      if (c !== 0) ctx.ei(t, 'tcp.checksum_bad.expert', off + 16, 2);
    } else {
      ctx.add(t, 'tcp.checksum', off + 16, 2, ck, `Checksum: ${hexPad(ck, 4)} [unverified]`);
      ctx.gen(t, 'tcp.checksum.status', 2);
    }
    ctx.add(t, 'tcp.urgent_pointer', off + 18, 2, urg);
  }
  let optInfo = '';
  if (hl > 20) optInfo = options(ctx, t, off + 20, off + hl, a);
  if (ctx.tree && a.stream !== undefined) {
    const ts = ctx.text(t, '[Timestamps]');
    ctx.gen(ts, 'tcp.time_relative', a.timeRel);
    ctx.gen(ts, 'tcp.time_delta', a.timeDelta);
  }
  if (!inErr) analysisTree(ctx, t, a, seglen);

  // ---- Info
  let info = `${sp} → ${dp} [${flagStr(flags)}] Seq=${rseq}` + (flags & ACK ? ` Ack=${rack}` : '') + ` Win=${a.calcWin} Len=${seglen}` + optInfo;
  if (flags & URG) info += ` Urg=${urg}`;
  ctx.setInfo(analysisInfo(a) + info);
  ctx.infoOwner = 'tcp';

  if (plen > 0) {
    if (ctx.tree) ctx.add(t, 'tcp.payload', poff, plen, d.subarray(poff, end), `TCP payload (${plen} byte${plen === 1 ? '' : 's'})`);
    if (inErr) {
      // Inner header of an ICMP error: no state, only the bytes we have.
      return end - off;
    }
    payload(ctx, t, a, src, sp, dst, dp, seqRaw, poff, end, flags);
  }
  return end - off;
}

// ---- options
function options(ctx, t, o, end, a) {
  const d = ctx.d;
  const tree = ctx.tree;
  const box = tree ? ctx.add(t, 'tcp.options', o, end - o, d.subarray(o, end), '') : NULLNODE;
  const names = [];
  let info = '';
  const first = ctx.first && a.opts == null;
  while (o < end) {
    const kind = d[o];
    if (kind === 0) {
      names.push('End of Option List (EOL)');
      if (tree) { const n = ctx.add(box, 'tcp.options.eol', o, 1, null, 'TCP Option - End of Option List (EOL)'); ctx.add(n, 'tcp.option_kind', o, 1, 0); }
      break;
    }
    if (kind === 1) {
      names.push('No-Operation (NOP)');
      if (tree) { const n = ctx.add(box, 'tcp.options.nop', o, 1, null, 'TCP Option - No-Operation (NOP)'); ctx.add(n, 'tcp.option_kind', o, 1, 1); }
      o++; continue;
    }
    if (o + 1 >= end) break;
    const len = d[o + 1];
    if (len < 2 || o + len > end) {
      if (tree) ctx.ei(box, 'tcp.option.len.invalid', o, end - o);
      break;
    }
    let n = NULLNODE;
    switch (kind) {
      case 2: {
        const v = len >= 4 ? u16(d, o + 2) : 0;
        names.push('Maximum segment size');
        info += ` MSS=${v}`;
        if (tree) { n = ctx.add(box, 'tcp.options.mss', o, len, null, `TCP Option - Maximum segment size: ${v} bytes`); }
        if (tree) { ctx.add(n, 'tcp.option_kind', o, 1, kind); ctx.add(n, 'tcp.option_len', o + 1, 1, len); ctx.add(n, 'tcp.options.mss_val', o + 2, 2, v); }
        break;
      }
      case 3: {
        const sh = d[o + 2];
        names.push('Window scale');
        info += ` WS=${2 ** Math.min(sh, 14)}`;
        if (tree) {
          n = ctx.add(box, 'tcp.options.wscale', o, len, null, `TCP Option - Window scale: ${sh} (multiply by ${2 ** Math.min(sh, 14)})`);
          ctx.add(n, 'tcp.option_kind', o, 1, kind); ctx.add(n, 'tcp.option_len', o + 1, 1, len);
          ctx.add(n, 'tcp.options.wscale.shift', o + 2, 1, sh);
          ctx.gen(n, 'tcp.options.wscale.multiplier', 2 ** Math.min(sh, 14));
        }
        break;
      }
      case 4:
        names.push('SACK permitted');
        info += ' SACK_PERM';
        if (tree) { n = ctx.add(box, 'tcp.options.sack_perm', o, len, null, 'TCP Option - SACK permitted'); ctx.add(n, 'tcp.option_kind', o, 1, kind); ctx.add(n, 'tcp.option_len', o + 1, 1, len); }
        break;
      case 5: {
        names.push('SACK');
        const base = a.sackBase ?? 0;
        const edges = [];
        for (let p = o + 2; p + 8 <= o + len; p += 8) edges.push([(u32(d, p) - base) >>> 0, (u32(d, p + 4) - base) >>> 0, p]);
        for (const [l, r] of edges) info += ` SLE=${l} SRE=${r}`;
        if (tree) {
          n = ctx.add(box, 'tcp.options.sack', o, len, null, `TCP Option - SACK ${edges.map(([l, r]) => `${l}-${r}`).join(' ')}`);
          ctx.add(n, 'tcp.option_kind', o, 1, kind); ctx.add(n, 'tcp.option_len', o + 1, 1, len);
          for (const [l, r, p] of edges) {
            ctx.add(n, 'tcp.options.sack_le', p, 4, l, `left edge = ${l} (relative)`);
            ctx.add(n, 'tcp.options.sack_re', p + 4, 4, r, `right edge = ${r} (relative)`);
          }
          ctx.gen(n, 'tcp.options.sack.count', edges.length);
        }
        break;
      }
      case 8: {
        const tsval = len >= 10 ? u32(d, o + 2) : 0, tsecr = len >= 10 ? u32(d, o + 6) : 0;
        names.push('Timestamps');
        info += ` TSval=${tsval} TSecr=${tsecr}`;
        if (tree) {
          n = ctx.add(box, 'tcp.options.timestamp', o, len, null, `TCP Option - Timestamps: TSval ${tsval}, TSecr ${tsecr}`);
          ctx.add(n, 'tcp.option_kind', o, 1, kind); ctx.add(n, 'tcp.option_len', o + 1, 1, len);
          ctx.add(n, 'tcp.options.timestamp.tsval', o + 2, 4, tsval);
          ctx.add(n, 'tcp.options.timestamp.tsecr', o + 6, 4, tsecr);
        }
        break;
      }
      default:
        names.push(`Unknown (${kind})`);
        if (tree) {
          n = ctx.add(box, 'tcp.options.unknown', o, len, null, `TCP Option - Unknown (${kind})`);
          ctx.add(n, 'tcp.option_kind', o, 1, kind); ctx.add(n, 'tcp.option_len', o + 1, 1, len);
          if (len > 2) ctx.add(n, 'tcp.options.unknown.payload', o + 2, len - 2, d.subarray(o + 2, o + len));
        }
    }
    o += len;
  }
  if (box !== NULLNODE) box.label = `Options: (${box.length} bytes), ${names.join(', ')}`;
  void first;
  return info;
}

// ---- sequence analysis (first pass only). Mirrors packet-tcp.c tcp_analyze_sequence_number().
function parseWs(d, o, end) {
  let ws = -1;
  while (o < end) {
    const k = d[o];
    if (k === 0) break;
    if (k === 1) { o++; continue; }
    const l = d[o + 1];
    if (l < 2 || o + l > end) break;
    if (k === 3 && l === 3) ws = Math.min(d[o + 2], 14);
    o += l;
  }
  return ws;
}

function parseSack(d, o, end) {
  let out = null;
  while (o < end) {
    const k = d[o];
    if (k === 0) break;
    if (k === 1) { o++; continue; }
    const l = d[o + 1];
    if (l < 2 || o + l > end) break;
    if (k === 5) { out = []; for (let p = o + 2; p + 8 <= o + l; p += 8) out.push(u32(d, p), u32(d, p + 4)); }
    o += l;
  }
  return out;
}

/**
 * Sequence analysis on the first pass. A port of packet-tcp.c tcp_analyze_sequence_number() (Wireshark 4.6)
 * plus the stream, base sequence, window scaling, iRTT and completeness bookkeeping around it.
 */
function analyze(ctx, src, sp, dst, dp, seq, ack, flags, win, seglen, d, oo, oend) {
  const now = ctx.fd.rel;
  const { c, reused, isNew } = getStream(ctx, src, sp, dst, dp, seq, flags);
  const fwdIdx = c.flows[0].addr === src && c.flows[0].port === sp ? 0 : 1;
  const fwd = c.flows[fwdIdx], rev = c.flows[1 - fwdIdx];
  c.pnum++;
  const r = {
    stream: c.index, pnum: c.pnum, rseq: 0, rack: 0, nxt: 0, calcWin: win, scale: -1, flags: 0,
    timeRel: now - c.first, timeDelta: now - c.last, finActive: 0, sackBase: 0,
    dupNum: 0, dupFrame: 0, acksFrame: 0, ackRtt: 0, partialAck: false, karn: false, bif: 0, push: 0, rto: 0, rtoFrame: 0,
    conv: c, fwdIdx,
  };
  c.last = now;
  let fl = reused ? A.REUSED_PORTS : 0;

  // completeness (conversation level; dissect() shows the final value, like Wireshark's second pass)
  if (isNew && (flags & (SYN | ACK)) === SYN) { c.completeness |= C_SYN; if (seglen > 0) c.completeness |= C_DATA; }
  if ((flags & (SYN | ACK)) === (SYN | ACK)) c.completeness |= C_SYNACK;
  if ((flags & (SYN | ACK)) === ACK) c.completeness |= seglen > 0 ? C_DATA : C_ACK;
  if ((flags & (FIN | ACK)) === (FIN | ACK)) c.completeness |= C_FIN;
  if (flags & RST) c.completeness |= C_RST;

  // base sequence numbers (relative numbering starts at 1 when the SYN was not seen)
  if (!fwd.baseSet) { fwd.base = (flags & SYN) ? seq : (seq - 1) >>> 0; fwd.baseSet = true; }
  if (!rev.baseSet && (flags & ACK)) { rev.base = (ack - 1) >>> 0; rev.baseSet = true; }

  // window scaling: each side's shift comes from its own SYN; missing on either side disables it
  if (flags & SYN) {
    fwd.winScale = parseWs(d, oo, oend);
    if (fwd.winScale === -1) { fwd.winScale = -2; rev.winScale = -2; }
    else if ((flags & ACK) && rev.winScale === -2) fwd.winScale = -2;
    fwd.isFirstAck = true;
    if (flags & ACK) { if (c.server === null) c.server = sp; }
    else { c.synTime = now; if (c.server === null) c.server = dp; }
  }

  const sackRev = rev.sack;               // SACK blocks of the last segment in the other direction
  if (ctx.session.prefs.tcp.analyze) {
    if (flags & ACK) rev.validBif = true;
    const plain = !(flags & (SYN | FIN | RST));
    let skipFwd = false;
    // ZERO WINDOW PROBE
    if (seglen === 1 && seq === fwd.nextseq && rev.window === 0) { fl |= A.ZERO_WINDOW_PROBE; skipFwd = true; }
    if (!skipFwd) {
      if (win === 0 && plain) fl |= A.ZERO_WINDOW;
      if (fwd.nextseq && GT(seq, fwd.nextseq) && !(flags & RST)) { fl |= A.LOST_PACKET; fwd.validBif = false; }
      if ((seglen === 0 || seglen === 1) && seq === ((fwd.nextseq - 1) >>> 0) && plain) fl |= A.KEEP_ALIVE;
      if (seglen === 0 && win && win !== fwd.window && seq === fwd.nextseq && ack === fwd.lastack && plain) fl |= A.WINDOW_UPDATE;
      if (seglen > 0 && rev.winScale !== -1 && plain && rev.window >= 0) {
        const sh = rev.isFirstAck ? 0 : (rev.winScale === -2 ? 0 : rev.winScale);
        if (((seq + seglen) >>> 0) === ((rev.lastack + rev.window * 2 ** sh) >>> 0)) fl |= A.WINDOW_FULL;
      }
      if (seglen === 0 && win && win === fwd.window && seq === fwd.nextseq && ack === fwd.lastack && (rev.lastsegflags & A.KEEP_ALIVE) && plain) {
        fl |= A.KEEP_ALIVE_ACK; skipFwd = true;
      }
    }
    if (!skipFwd && seglen === 0 && win === 0 && win === fwd.window && seq === fwd.nextseq &&
      (ack === fwd.lastack || ack === ((fwd.lastack + 1) >>> 0)) && (rev.lastsegflags & A.ZERO_WINDOW_PROBE) && plain) {
      fl |= A.ZERO_WINDOW_PROBE_ACK;
      if (ack === ((fwd.lastack + 1) >>> 0)) { rev.nextseq = ack; rev.maxseqtobeacked = ack; }
      skipFwd = true;
    }
    if (!skipFwd && seglen === 0 && win && win === fwd.window && seq === fwd.nextseq && ack === fwd.lastack && plain) {
      fwd.dupacknum++;
      fl |= A.DUPLICATE_ACK;
      r.dupNum = fwd.dupacknum;
      r.dupFrame = fwd.lastnondupack;
    }
    // finished_fwd
    if (ack !== fwd.lastack) { fwd.lastnondupack = ctx.no; fwd.dupacknum = 0; }
    // ACKED LOST PACKET
    if (rev.maxseqtobeacked && GT(ack, rev.maxseqtobeacked) && (flags & ACK)) {
      if (ack === ((fwd.lastack + 1) >>> 0) && seq === fwd.nextseq && (rev.lastsegflags & A.ZERO_WINDOW_PROBE)) {
        rev.nextseq = ack; rev.maxseqtobeacked = ack;
        fl |= A.WINDOW_UPDATE;
      } else {
        // push maxseqtobeacked past a contiguous tail of unacked segments above this ACK
        let le = 0, re = 0;
        for (let i = rev.segments.length - 1; i >= 0; i--) {   // list order: newest first, as in Wireshark
          const u = rev.segments[i];
          if (le === re) { le = u.seq; re = u.nextseq; }
          if (!LT(u.seq, ack)) {
            if (u.nextseq === le) le = u.seq;
            else { le = u.seq; re = u.nextseq; }
          }
        }
        rev.maxseqtobeacked = le === ack && GT(re, ack) ? re : ack;
        fl |= A.ACK_LOST_PACKET;
      }
    }
    // RETRANSMISSION / FAST RETRANSMISSION / OUT-OF-ORDER / SPURIOUS
    let notAdv = fwd.nextseq !== 0 && LT(seq, fwd.nextseq);
    if ((seglen > 0 || (flags & (SYN | FIN))) && !(fl & A.KEEP_ALIVE)) {
      if (seglen > 1 && ((fwd.nextseq - 1) >>> 0) === seq) notAdv = false;
      if (seglen > 0 && rev.lastack && LE((seq + seglen) >>> 0, rev.lastack)) {
        fl |= A.SPURIOUS_RETRANSMISSION;
      } else if (notAdv) {
        const nextseq = (seq + seglen) >>> 0;
        const t = Math.max(0, now - rev.lastacktime);
        let kind = 0;
        // fast retransmission takes precedence (tcp_fastrt_precedence)
        if (t < 0.02 && rev.dupacknum >= 2 && rev.lastack === seq) kind = A.FAST_RETRANSMISSION;
        else if (t < 0.02 && rev.dupacknum >= 2 && sackRev && sackRev.length) {
          let sacked = false;
          for (let k = 0; k < sackRev.length && !sacked; k += 2) sacked = seq >= sackRev[k] && nextseq <= sackRev[k + 1];
          if (!sacked) kind = A.FAST_RETRANSMISSION;
        }
        if (!kind) {
          const thres = c.irtt ? c.irtt : 0.003;
          let seen = false;
          for (let i = fwd.segments.length - 1; i >= 0; i--) {
            const u = fwd.segments[i];
            if (!LT(seq, u.seq) && LE((seq + seglen) >>> 0, u.nextseq)) { seen = true; u.karn = true; break; }
          }
          if (t < thres && !seen) {
            if (fwd.nextseq !== ((seq + seglen + ((flags & (SYN | FIN)) ? 1 : 0)) >>> 0)) kind = A.OUT_OF_ORDER;
            else if (fwd.lastacklen === 0) kind = A.OUT_OF_ORDER;
          }
        }
        if (!kind) {
          kind = A.RETRANSMISSION;
          r.rto = now - fwd.nextseqtime;
          r.rtoFrame = fwd.nextseqframe;
          // prefer the eldest unacked segment at or above this sequence number
          for (let i = fwd.segments.length - 1; i >= 0; i--) {
            const u = fwd.segments[i];
            if (!LT(u.seq, seq)) { r.rto = now - u.ts; r.rtoFrame = u.frame; }
          }
        }
        fl |= kind;
      }
    }
  }
  // record this segment as unacked
  let nextseq = (seq + seglen) >>> 0;
  if (seglen || (flags & (SYN | FIN))) {
    if (flags & (SYN | FIN)) nextseq = (nextseq + 1) >>> 0;
    if (fwd.segments.length < 10000) {
      fwd.segments.push({ frame: ctx.no, seq, nextseq, ts: now,
        karn: (fl & (A.RETRANSMISSION | A.FAST_RETRANSMISSION | A.SPURIOUS_RETRANSMISSION)) !== 0 });
    }
  }
  if (!fwd.nextseq || GT(nextseq, (fwd.nextseq + ((flags & (SYN | FIN)) ? 1 : 0)) >>> 0)) fwd.lastacklen = seglen;
  if (GT(nextseq, fwd.nextseq) || !fwd.nextseq) {
    if (!(fl & A.ZERO_WINDOW_PROBE)) { fwd.nextseq = nextseq; fwd.nextseqframe = ctx.no; fwd.nextseqtime = now; }
  }
  if (seq === fwd.maxseqtobeacked || !fwd.maxseqtobeacked) {
    if (!(fl & A.ZERO_WINDOW_PROBE)) fwd.maxseqtobeacked = fwd.nextseq;
  }
  fwd.window = win;
  fwd.lastack = ack;
  fwd.lastacktime = now;
  fwd.lastsegflags = fl;
  // segments acknowledged by this ACK (exact or partial match gives the ACK frame and RTT)
  {
    const segs = rev.segments;
    const keep = [];
    for (let i = segs.length - 1; i >= 0; i--) {       // newest first
      const u = segs[i];
      if (ack === u.nextseq) {
        r.acksFrame = u.frame; r.ackRtt = now - u.ts; r.partialAck = false; r.karn = u.karn;
        continue;
      }
      if (GT(ack, u.seq) && LE(ack, u.nextseq)) {
        u.seq = ack;
        r.acksFrame = u.frame; r.ackRtt = now - u.ts; r.partialAck = true; r.karn = u.karn;
        keep.push(u);
        continue;
      }
      if (GT(u.nextseq, ack)) { keep.push(u); continue; }
    }
    keep.reverse();
    rev.segments = keep;
  }
  // bytes in flight (unacked range of this direction minus what the peer has SACKed)
  if (seglen !== 0 && fwd.segments.length && fwd.validBif) {
    const segs = fwd.segments;
    let first = (segs[segs.length - 1].seq - fwd.base) >>> 0, last = (segs[segs.length - 1].nextseq - fwd.base) >>> 0;
    for (const s of segs) {
      const a1 = (s.seq - fwd.base) >>> 0, b1 = (s.nextseq - fwd.base) >>> 0;
      if (b1 > last) last = b1;
      if (a1 < first) first = a1;
    }
    let inflight = last - first;
    if (sackRev) for (let k = 0; k < sackRev.length; k += 2) inflight -= (sackRev[k + 1] - sackRev[k]) >>> 0;
    if (inflight > 0 && inflight < 2000000000) r.bif = inflight - ((flags & (SYN | FIN)) ? 1 : 0);
    if ((flags & PSH) && !fwd.pushSetLast) { fwd.pushBytes += seglen; fwd.pushSetLast = true; }
    else if ((flags & PSH) && fwd.pushSetLast) fwd.pushBytes = seglen;
    else if (fwd.pushSetLast) { fwd.pushBytes = seglen; fwd.pushSetLast = false; }
    else fwd.pushBytes += seglen;
    r.push = fwd.pushBytes;
  }
  // this segment's SACK blocks are what the other direction sees next
  fwd.sack = parseSack(d, oo, oend);

  // closing initiator
  if (flags & FIN) {
    if (!rev.closing) { fwd.closing = true; r.finActive = 1; } else r.finActive = 2;
  }
  // iRTT: SYN to the first pure ACK
  if ((flags & (SYN | ACK)) === ACK && c.synTime >= 0 && !c.irtt) c.irtt = now - c.synTime;
  if ((flags & (SYN | ACK)) === ACK && fwd.isFirstAck) fwd.isFirstAck = false;

  r.flags = fl;
  r.rseq = (seq - fwd.base) >>> 0;
  r.rack = (flags & ACK) ? (ack - rev.base) >>> 0 : ack;
  r.nxt = (nextseq - fwd.base) >>> 0;
  r.sackBase = rev.base;
  if (flags & SYN) { r.scale = -1; r.calcWin = win; }
  else if (fwd.winScale >= 0) { r.scale = 2 ** fwd.winScale; r.calcWin = win * r.scale; }
  else { r.scale = fwd.winScale; r.calcWin = win; }
  return r;
}

// Info prefixes are prepended in this order, so the last one ends up first (col_prepend_fence_fstr).
const INFO_ORDER = [
  [A.REUSED_PORTS, '[TCP Port numbers reused] '],
  [A.RETRANSMISSION, '[TCP Retransmission] '],
  [A.FAST_RETRANSMISSION, '[TCP Fast Retransmission] '],
  [A.SPURIOUS_RETRANSMISSION, '[TCP Spurious Retransmission] '],
  [A.OUT_OF_ORDER, '[TCP Out-Of-Order] '],
  [A.LOST_PACKET, '[TCP Previous segment not captured] '],
  [A.ACK_LOST_PACKET, '[TCP ACKed unseen segment] '],
  [A.WINDOW_UPDATE, '[TCP Window Update] '],
  [A.WINDOW_FULL, '[TCP Window Full] '],
  [A.KEEP_ALIVE, '[TCP Keep-Alive] '],
  [A.KEEP_ALIVE_ACK, '[TCP Keep-Alive ACK] '],
  [A.DUPLICATE_ACK, null],
  [A.ZERO_WINDOW_PROBE, '[TCP ZeroWindowProbe] '],
  [A.ZERO_WINDOW, '[TCP ZeroWindow] '],
  [A.ZERO_WINDOW_PROBE_ACK, '[TCP ZeroWindowProbeAck] '],
];
function analysisInfo(a) {
  if (!a.flags) return '';
  let s = '';
  for (const [b, txt] of INFO_ORDER) if (a.flags & b) s = (txt || `[TCP Dup ACK ${a.dupFrame}#${a.dupNum}] `) + s;
  return s;
}

function analysisTree(ctx, t, a, seglen) {
  if (!ctx.tree || a.stream === undefined) return;
  // Wireshark shows the analysis only for segments that have analysis data ("ta")
  if (!(a.acksFrame || a.flags || a.bif)) return;
  const an = ctx.text(t, 'SEQ/ACK analysis');
  an.abbrev = 'tcp.analysis';
  an.generated = true;
  if (a.acksFrame) {
    const n = ctx.gen(an, 'tcp.analysis.acks_frame', a.acksFrame, `This is an ACK to the segment in frame: ${a.acksFrame}`);
    if (a.partialAck) ctx.ei(n, 'tcp.analysis.partial_ack');
    if (a.karn) ctx.ei(n, 'tcp.analysis.ambiguous_ack');
    if (a.ackRtt) ctx.gen(an, 'tcp.analysis.ack_rtt', a.ackRtt);
  }
  // iRTT of the conversation as known after the whole file (two-pass view)
  const irtt = a.conv ? a.conv.irtt : a.irtt;
  if (irtt) ctx.gen(an, 'tcp.analysis.initial_rtt', irtt, `iRTT: ${formatRelTime(irtt)}`);
  if (a.bif) {
    ctx.gen(an, 'tcp.analysis.bytes_in_flight', a.bif);
    ctx.gen(an, 'tcp.analysis.push_bytes_sent', a.push);
  }
  if (!a.flags) return;
  const ft = ctx.gen(an, 'tcp.analysis.flags', null, 'TCP Analysis Flags');
  const F = a.flags;
  if (F & A.REUSED_PORTS) ctx.ei(ft, 'tcp.analysis.reused_ports');
  if (F & A.RETRANSMISSION) {
    ctx.ei(ft, 'tcp.analysis.retransmission');
    if (a.rto) {
      ctx.gen(ft, 'tcp.analysis.rto', a.rto);
      ctx.gen(ft, 'tcp.analysis.rto_frame', a.rtoFrame, `RTO based on delta from frame: ${a.rtoFrame}`);
    }
  }
  if (F & A.FAST_RETRANSMISSION) { ctx.ei(ft, 'tcp.analysis.fast_retransmission'); ctx.ei(ft, 'tcp.analysis.retransmission'); }
  if (F & A.SPURIOUS_RETRANSMISSION) { ctx.ei(ft, 'tcp.analysis.spurious_retransmission'); ctx.ei(ft, 'tcp.analysis.retransmission'); }
  if (F & A.OUT_OF_ORDER) ctx.ei(ft, 'tcp.analysis.out_of_order');
  if (F & A.LOST_PACKET) ctx.ei(ft, 'tcp.analysis.lost_segment');
  if (F & A.ACK_LOST_PACKET) ctx.ei(ft, 'tcp.analysis.ack_lost_segment');
  if (F & A.WINDOW_UPDATE) ctx.ei(ft, 'tcp.analysis.window_update');
  if (F & A.WINDOW_FULL) ctx.ei(ft, 'tcp.analysis.window_full');
  if (F & A.KEEP_ALIVE) ctx.ei(ft, 'tcp.analysis.keep_alive');
  if (F & A.KEEP_ALIVE_ACK) ctx.ei(ft, 'tcp.analysis.keep_alive_ack');
  if (a.dupNum) {
    const dn = ctx.gen(an, 'tcp.analysis.duplicate_ack_num', a.dupNum);
    void dn;
    const df = ctx.gen(an, 'tcp.analysis.duplicate_ack_frame', a.dupFrame, `Duplicate to the ACK in frame: ${a.dupFrame}`);
    ctx.ei(df, 'tcp.analysis.duplicate_ack', 0, 0, `Duplicate ACK (#${a.dupNum})`);
  }
  if (F & A.ZERO_WINDOW_PROBE) ctx.ei(ft, 'tcp.analysis.zero_window_probe');
  if (F & A.ZERO_WINDOW) ctx.ei(ft, 'tcp.analysis.zero_window');
  if (F & A.ZERO_WINDOW_PROBE_ACK) ctx.ei(ft, 'tcp.analysis.zero_window_probe_ack');
  void seglen;
}

// ---- payload: protocol choice, PDU framing, reassembly
/** Pick the protocol for this stream's payload: conversation binding, ports (low first), heuristics. */
function chooseProto(ctx, src, sp, dst, dp, poff, end, fwd) {
  const s = ctx.session;
  let p = s.conversationProto('tcp', dst, dp, ctx.no) || s.conversationProto('tcp', src, sp, ctx.no);
  if (p) return getProtocol(p);
  const lo = sp < dp ? sp : dp, hi = sp < dp ? dp : sp;
  let r = ctx.lookup('tcp.port', lo);
  if (r) return r;
  r = ctx.lookup('tcp.port', hi);
  if (r) return r;
  if (fwd && fwd.heur) return fwd.heur;
  return null;
}

function heurProto(ctx, off, end) { return ctx.heuristic('tcp', off, end); }

function pduLen(ctx, p, data, off, end) {
  const pd = ctx.d;
  ctx.d = data;
  try { return p.tcpPdu(ctx, off, end); } catch { return 0; } finally { ctx.d = pd; }
}

function concat(chunks, total) {
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

function payload(ctx, t, a, src, sp, dst, dp, seq, poff, end, flags) {
  const fd = ctx.fd;
  if (ctx.first) fd.tcpPlan = plan(ctx, a, src, sp, dst, dp, seq, poff, end, flags);
  const pl = fd.tcpPlan;
  if (!pl) { ctx.data(poff, end); return; }
  for (const it of pl) {
    if (it.k === 'pdu') {
      const p = getProtocol(it.p);
      callPdu(ctx, p, it.off, it.off + it.len, it.retrans);
    } else if (it.k === 'seg') {
      if (it.in) ctx.gen(t, 'tcp.reassembled_in', it.in, `Reassembled PDU in frame: ${it.in}`);
      const sp = pl[0] !== it && it.p ? getProtocol(it.p) : null;
      // A protocol may show the start of its next PDU itself (e.g. 'TLS segment data' inside the TLS tree).
      if (sp && sp.segmentData) sp.segmentData(ctx, it.off, end);
      else if (ctx.tree) ctx.add(t, 'tcp.segment_data', it.off, end - it.off, ctx.d.subarray(it.off, end), `TCP segment data (${end - it.off} byte${end - it.off === 1 ? '' : 's'})`);
      // Only a segment carrying nothing but the start/middle of a PDU is labelled as TCP; a trailing
      // partial PDU after complete ones keeps the upper layer's columns (as Wireshark does).
      if (pl[0] === it) {
        ctx.info += it.in ? ` [TCP PDU reassembled in ${it.in}]` : ' [TCP segment of a reassembled PDU]';
        ctx.setProtocol('TCP');
      }
    } else if (it.k === 'reasm') {
      const p = getProtocol(it.p);
      const data = it.data;
      if (ctx.tree) {
        const mine = it.frames.find((f) => f.no === ctx.no);
        const last = mine ? mine.len : end - poff;
        ctx.add(t, 'tcp.segment_data', poff, last, ctx.d.subarray(poff, poff + last), `TCP segment data (${last} byte${last === 1 ? '' : 's'})`);
        // Wireshark shows the reassembly summary as a top-level item between TCP and the PDU.
        const n = ctx.add(null, 'tcp.segments', 0, 0, null,
          `[${it.frames.length} Reassembled TCP Segments (${data.length} bytes): ${it.frames.map((f) => `#${f.no}(${f.len})`).join(', ')}]`);
        let o = 0;
        for (const f of it.frames) {
          const s = ctx.add(n, 'tcp.segment', 0, 0, f.no, `Frame: ${f.no}, payload: ${o}-${o + f.len - 1} (${f.len} bytes)`);
          s.generated = true;
          o += f.len;
        }
        ctx.gen(n, 'tcp.segment.count', it.frames.length);
        ctx.gen(n, 'tcp.reassembled.length', data.length);
        ctx.withSource(`Reassembled TCP (${data.length} bytes)`, data, () => ctx.add(n, 'tcp.reassembled.data', 0, data.length, data, `Reassembled TCP Data: ${previewHex(data)}`));
      }
      ctx.withSource(`Reassembled TCP (${data.length} bytes)`, data, () => callPdu(ctx, p, 0, data.length, false));
      // PDUs that follow in this segment are a separate dissector call, so their layers are listed again.
      ctx.vars.tcpPduLayers = null;
      if (p) ctx.vars[p.abbrev + 'Top'] = null; // protocols that merge PDUs into one tree per call (tls) start a new one
    } else if (it.k === 'rtx') {
      if (ctx.tree) ctx.add(t, 'tcp.segment_data', it.off, it.len, ctx.d.subarray(it.off, it.off + it.len), `Retransmitted TCP segment data (${it.len} byte${it.len === 1 ? '' : 's'})`);
    } else if (it.k === 'data') {
      ctx.data(it.off, it.off + it.len);
    }
  }
  // The analysis notes are fenced in Wireshark's Info column: upper layers write after them.
  const pre = analysisInfo(a);
  if (pre && !ctx.info.startsWith(pre)) ctx.info = pre + ctx.info;
}
function previewHex(d) { let s = ''; for (let i = 0; i < Math.min(d.length, 24); i++) s += d[i].toString(16).padStart(2, '0'); return d.length > 24 ? s + '…' : s; }

function callPdu(ctx, p, off, end, retrans) {
  if (!p) { ctx.data(off, end); return; }
  void retrans;
  const L = ctx.layers, before = L.length;
  const r = ctx.call(p, off, end);
  if (r === false) ctx.data(off, end);
  // Wireshark lists a protocol once when one segment carries several PDUs of it (frame.protocols),
  // so drop a layer run that repeats the run of the previous PDU.
  const n = L.length - before;
  const prev = ctx.vars.tcpPduLayers;
  if (prev && prev.end === before && n > 0) {
    // remove the longest common prefix of this run that equals the previous run's start
    let k = 0;
    while (k < n && k < prev.n && L[prev.start + k] === L[before + k]) k++;
    if (k) L.splice(before, k);
    // a longer run extends the previous one
    ctx.vars.tcpPduLayers = { start: prev.start, end: L.length, n: Math.max(prev.n, L.length - prev.start) };
    return;
  }
  ctx.vars.tcpPduLayers = { start: before, end: L.length, n };
}

/** Decide how this segment's payload is dissected (first pass). Returns a list of plan items. */
function plan(ctx, a, src, sp, dst, dp, seq, poff, end, flags) {
  const items = [];
  const c = a.conv;
  if (!c) return [{ k: 'data', off: poff, len: end - poff }];
  const fwd = c.flows[a.fwdIdx];
  let p = chooseProto(ctx, src, sp, dst, dp, poff, end, fwd);
  if (!p) {
    const h = heurProto(ctx, poff, end);
    if (h) { p = h; fwd.heur = h; c.flows[1 - a.fwdIdx].heur = h; }
  }
  const plen = end - poff;
  const retrans = (a.flags & (A.RETRANSMISSION | A.FAST_RETRANSMISSION | A.SPURIOUS_RETRANSMISSION)) !== 0;
  // A segment at or after the start of an open reassembly (in order, after a gap, or a
  // retransmission filling the gap) belongs to that PDU, as in Wireshark's reassembly.
  const open = fwd.pending;
  if (open && p && open.p === p) {
    const rel = (seq - open.start) >>> 0;
    if (rel < 0x10000000) return continueReasm(ctx, items, fwd, open, p, rel, seq, poff, end);
  }
  if (retrans) { items.push({ k: 'rtx', off: poff, len: plen }); return items; }
  if (!p) { items.push({ k: 'data', off: poff, len: plen }); fwd.pending = null; return items; }
  const reasm = ctx.session.prefs.tcp.reassemble && p.tcpPdu;
  if (!reasm) { items.push({ k: 'pdu', p: p.abbrev, off: poff, len: plen, retrans }); return items; }
  if (retrans) {
    // Wireshark does not hand retransmitted data to the upper layer again.
    items.push({ k: 'rtx', off: poff, len: plen });
    return items;
  }
  if (open) fwd.pending = null; // a different protocol took over: give up on the partial PDU
  framePdus(ctx, items, fwd, p, seq, poff, poff, end);
  return items;
}

/** Split [o, end) into PDUs; an incomplete last PDU opens a reassembly. */
function framePdus(ctx, items, fwd, p, seq, poff, o, end) {
  while (o < end) {
    let l = pduLen(ctx, p, ctx.d, o, end);
    if (l === 0) l = end - o;
    if (l > 0 && o + l <= end) { items.push({ k: 'pdu', p: p.abbrev, off: o, len: l }); o += l; continue; }
    // PDU continues in later segments
    fwd.pending = { p, need: l, start: (seq + (o - poff)) >>> 0, chunks: [{ off: 0, data: ctx.d.slice(o, end), no: ctx.no }] };
    items.push({ k: 'seg', off: o, in: 0, p: p.abbrev });
    break;
  }
}

/** Contiguous bytes from offset 0 of a reassembly. */
function contiguous(pend) {
  const cs = pend.chunks.slice().sort((x, y) => x.off - y.off);
  let have = 0;
  for (const c of cs) { if (c.off > have) break; have = Math.max(have, c.off + c.data.length); }
  return have;
}
function assemble(pend, n) {
  const out = new Uint8Array(n);
  for (const c of pend.chunks) {
    if (c.off >= n) continue;
    out.set(c.data.subarray(0, Math.min(c.data.length, n - c.off)), c.off);
  }
  return out;
}

/** Add this segment (at relative offset rel) to an open reassembly; complete it when possible. */
function continueReasm(ctx, items, fwd, pend, p, rel, seq, poff, end) {
  const len = end - poff;
  // already have all of these bytes (a plain retransmission)
  let dup = false;
  for (const c of pend.chunks) if (c.off <= rel && c.off + c.data.length >= rel + len) { dup = true; break; }
  if (dup) { items.push({ k: 'rtx', off: poff, len }); return items; }
  pend.chunks.push({ off: rel, data: ctx.d.slice(poff, end), no: ctx.no });
  const have = contiguous(pend);
  let need = pend.need;
  if (need < 0 && have > 0) {
    const l = pduLen(ctx, p, assemble(pend, have), 0, have);
    need = l === 0 ? have : l;
  }
  if (!(need > 0 && have >= need)) {
    pend.need = need > 0 ? need : -1;
    if (pend.chunks.length > 4096) fwd.pending = null; // never completed: stop buffering
    items.push({ k: 'seg', off: poff, in: 0, p: p.abbrev });
    return items;
  }
  const data = assemble(pend, need);
  const frames = [];
  let covered = 0;
  for (const c of pend.chunks.slice().sort((x, y) => x.off - y.off)) {
    const s = Math.max(c.off, covered), e = Math.min(c.off + c.data.length, need);
    if (e > s) { frames.push({ no: c.no, len: e - s }); covered = e; }
  }
  items.push({ k: 'reasm', p: p.abbrev, data, frames });
  for (const c of pend.chunks) {
    if (c.no === ctx.no) continue;
    const it = ctx.session._fd(c.no).tcpPlan?.find((x) => x.k === 'seg' && !x.in);
    if (it) it.in = ctx.no;
  }
  fwd.pending = null;
  // bytes of this segment after the PDU start new PDUs
  if (rel + len > need && rel < need) framePdus(ctx, items, fwd, p, seq, poff, poff + (need - rel), end);
  return items;
}
