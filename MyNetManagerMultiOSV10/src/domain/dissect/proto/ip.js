// IPv4 and IPv6 (extension headers, fragment reassembly) plus the hand-off to transport protocols.
import { registerProtocol, u16, u32, ip4, ip6, hexPad, NULLNODE } from '../core.js';
import { IP_PROTOS } from '../names.js';

const DSCP_SHORT = { 0: 'CS0', 1: 'LE', 8: 'CS1', 10: 'AF11', 12: 'AF12', 14: 'AF13', 16: 'CS2', 18: 'AF21', 20: 'AF22', 22: 'AF23', 24: 'CS3', 26: 'AF31', 28: 'AF32', 30: 'AF33', 32: 'CS4', 34: 'AF41', 36: 'AF42', 38: 'AF43', 40: 'CS5', 44: 'VA', 46: 'EF', 48: 'CS6', 56: 'CS7' };
const DSCP = { 0: 'Default', 1: 'Lower Effort', 8: 'Class Selector 1', 10: 'Assured Forwarding 11', 12: 'Assured Forwarding 12', 14: 'Assured Forwarding 13', 16: 'Class Selector 2', 18: 'Assured Forwarding 21', 20: 'Assured Forwarding 22', 22: 'Assured Forwarding 23', 24: 'Class Selector 3', 26: 'Assured Forwarding 31', 28: 'Assured Forwarding 32', 30: 'Assured Forwarding 33', 32: 'Class Selector 4', 34: 'Assured Forwarding 41', 36: 'Assured Forwarding 42', 38: 'Assured Forwarding 43', 40: 'Class Selector 5', 44: 'Voice Admit', 46: 'Expedited Forwarding', 48: 'Class Selector 6', 56: 'Class Selector 7' };
const ECN = { 0: 'Not ECN-Capable Transport', 1: 'ECN-Capable Transport codepoint \'01\'', 2: 'ECN-Capable Transport codepoint \'10\'', 3: 'Congestion Experienced' };
const ECN_SHORT = { 0: 'Not-ECT', 1: 'ECT(1)', 2: 'ECT(0)', 3: 'CE' };
const CKSUM_STATUS = { 0: 'Bad', 1: 'Good', 2: 'Unverified', 3: 'Not present', 4: 'Illegal' };
export { CKSUM_STATUS };
const OPT_NAMES = { 0: 'End of Options List (EOL)', 1: 'No Operation (NOP)', 7: 'Record Route', 68: 'Time Stamp', 130: 'Security', 131: 'Loose Source Route', 133: 'Extended Security', 136: 'Stream ID', 137: 'Strict Source Route', 148: 'Router Alert', 82: 'Traceroute', 25: 'Quick-Start', 134: 'Commercial IP Security Option' };

// --- generic fragment reassembly ---------------------------------------------------------------
/**
 * Collects fragments per key on the first pass. add() returns the completed buffer + fragment list
 * when the datagram is whole, else null. Overlaps are resolved by first-seen data.
 */
export class Reassembler {
  constructor() { this.table = new Map(); }
  add(key, no, offset, data, more) {
    let e = this.table.get(key);
    if (!e) this.table.set(key, e = { frags: [], total: -1 });
    e.frags.push({ no, off: offset, len: data.length, data: data.slice() });
    if (!more) e.total = offset + data.length;
    if (e.total < 0) return null;
    e.frags.sort((a, b) => a.off - b.off);
    let have = 0;
    for (const f of e.frags) { if (f.off > have) return null; have = Math.max(have, f.off + f.len); }
    if (have < e.total) return null;
    const out = new Uint8Array(e.total);
    for (const f of e.frags) out.set(f.data.subarray(0, Math.max(0, Math.min(f.len, e.total - f.off))), f.off);
    this.table.delete(key);
    return { data: out, frags: e.frags.map((f) => ({ no: f.no, off: f.off, len: f.len })) };
  }
}

/** Tree item listing fragments, as Wireshark does ("[3 IPv4 Fragments (3008 bytes): #1(1480), ...]"). */
export function fragmentTree(ctx, parent, prefix, kind, frags, total, data) {
  if (!ctx.tree) return;
  const t = ctx.add(parent, `${prefix}.fragments`, 0, total, kind === 'IPv6' ? null : data,
    `[${frags.length} ${kind} Fragments (${total} bytes): ${frags.map((f) => `#${f.no}(${f.len})`).join(', ')}]`);
  for (const f of frags) ctx.add(t, `${prefix}.fragment`, f.off, f.len, f.no, `Frame: ${f.no}, payload: ${f.off}-${f.off + f.len - 1} (${f.len} bytes)`);
  ctx.add(t, `${prefix}.fragment.count`, 0, 0, frags.length);
  ctx.add(t, kind === 'IPv6' ? 'ipv6.reassembled.in' : 'ip.reassembled_in', 0, 0, ctx.no);
  ctx.add(t, `${prefix}.reassembled.length`, 0, 0, total);
  ctx.add(t, `${prefix}.reassembled.data`, 0, total, data, `Reassembled ${kind} data: ${dataPreview(data)}`);
}
function dataPreview(d) { let s = ''; for (let i = 0; i < Math.min(d.length, 24); i++) s += d[i].toString(16).padStart(2, '0'); return d.length > 24 ? s + '…' : s; }

function protoName(p) { return IP_PROTOS[p] || 'Unknown'; }

/** Call the transport/next protocol; unknown protocols become data. */
function transport(ctx, proto, off, end) {
  if (!ctx.dispatch('ip.proto', proto, off, end)) {
    ctx.data(off, end);
  }
}

/**
 * Conversation index of an address pair (ip.stream / ipv6.stream / eth.stream). Stored per occurrence in
 * the packet, so tunnels and ICMP-quoted headers get their own value. Quoted headers only look up.
 */
export function streamIndex(ctx, key, kind) {
  const n = ctx.vars[kind + 'N'] = (ctx.vars[kind + 'N'] || 0) + 1;
  let arr = ctx.fd[kind];
  if (ctx.first) {
    if (!arr) arr = ctx.fd[kind] = [];
    const st = ctx.session.st(kind, () => new Map());
    let s = st.get(key);
    if (s === undefined && !ctx.inError) { s = st.size; st.set(key, s); }
    arr[n - 1] = s;
  }
  return arr ? arr[n - 1] : undefined;
}

// --- IPv4 -------------------------------------------------------------------------------------
registerProtocol({
  abbrev: 'ip', name: 'Internet Protocol Version 4', short: 'IPv4',
  fields: [
    ['ip.version', 'Version', 'uint8', { mask: 0xf0 }],
    ['ip.hdr_len', 'Header Length', 'uint8', { mask: 0x0f }],
    ['ip.dsfield', 'Differentiated Services Field', 'uint8', { base: 'hex' }],
    ['ip.dsfield.dscp', 'Differentiated Services Codepoint', 'uint8', { mask: 0xfc, strings: DSCP }],
    ['ip.dsfield.ecn', 'Explicit Congestion Notification', 'uint8', { mask: 0x03, strings: ECN }],
    ['ip.len', 'Total Length', 'uint16'],
    ['ip.id', 'Identification', 'uint16', { base: 'hex_dec' }],
    ['ip.flags', 'Flags', 'uint8', { base: 'hex', mask: 0xe0 }],
    ['ip.flags.rb', 'Reserved bit', 'bool', { mask: 0x80, bits: 8, tfs: ['Set', 'Not set'] }],
    ['ip.flags.df', 'Don\'t fragment', 'bool', { mask: 0x40, bits: 8, tfs: ['Set', 'Not set'] }],
    ['ip.flags.mf', 'More fragments', 'bool', { mask: 0x20, bits: 8, tfs: ['Set', 'Not set'] }],
    ['ip.frag_offset', 'Fragment Offset', 'uint16', { mask: 0x1fff, bits: 16 }],
    ['ip.ttl', 'Time to Live', 'uint8'],
    ['ip.proto', 'Protocol', 'uint8', { strings: IP_PROTOS }],
    ['ip.checksum', 'Header Checksum', 'uint16', { base: 'hex' }],
    ['ip.checksum_calculated', 'Calculated Checksum', 'uint16', { base: 'hex' }],
    ['ip.checksum.status', 'Header checksum status', 'uint8', { base: 'none', strings: CKSUM_STATUS }],
    ['ip.src', 'Source Address', 'ipv4'],
    ['ip.dst', 'Destination Address', 'ipv4'],
    ['ip.addr', 'Source or Destination Address', 'ipv4'],
    ['ip.src_host', 'Source Host', 'string'],
    ['ip.dst_host', 'Destination Host', 'string'],
    ['ip.host', 'Source or Destination Host', 'string'],
    ['ip.stream', 'Stream index', 'uint32'],
    ['ip.opt.type', 'Type', 'uint8', { strings: OPT_NAMES }],
    ['ip.opt.type.copy', 'Copy on fragmentation', 'bool', { mask: 0x80, bits: 8, tfs: ['Yes', 'No'] }],
    ['ip.opt.type.class', 'Class', 'uint8', { mask: 0x60, strings: { 0: 'Control', 1: 'Reserved for future use', 2: 'Debugging and measurement', 3: 'Reserved for future use' } }],
    ['ip.opt.type.number', 'Number', 'uint8', { mask: 0x1f }],
    ['ip.opt.len', 'Length', 'uint8'],
    ['ip.opt.ptr', 'Pointer', 'uint8'],
    ['ip.opt.ra', 'Router Alert', 'uint16', { strings: { 0: 'Router shall examine packet (0)' } }],
    ['ip.opt.data', 'Data', 'bytes'],
    ['ip.opt.padding', 'Padding', 'bytes'],
    ['ip.rec_rt', 'Recorded Route', 'ipv4'],
    ['ip.src_rt', 'Source Route', 'ipv4'],
    ['ip.empty_rt', 'Empty Route', 'ipv4'],
    ['ip.opt.time_stamp', 'Time stamp', 'uint32'],
    ['ip.fragments', 'IPv4 Fragments', 'bytes'],
    ['ip.fragment', 'IPv4 Fragment', 'framenum'],
    ['ip.fragment.count', 'Fragment count', 'uint32'],
    ['ip.reassembled_in', 'Reassembled IPv4 in frame', 'framenum'],
    ['ip.reassembled.length', 'Reassembled IPv4 length', 'uint32'],
    ['ip.reassembled.data', 'Reassembled IPv4 data', 'bytes'],
  ],
  experts: [
    ['ip.bogus_ip_version', 'error', 'Protocol', 'Bogus IP version'],
    ['ip.bogus_header_length', 'error', 'Protocol', 'Bogus IP header length'],
    ['ip.bogus_ip_length', 'error', 'Protocol', 'Bogus IP length'],
    ['ip.checksum_bad.expert', 'error', 'Checksum', 'Bad checksum'],
    ['ip.ttl.too_small', 'note', 'Sequence', 'Time To Live too small'],
  ],
  tables: { ethertype: [0x0800], 'ip.proto': [4], linktype: [228], 'ppp.protocol': [0x0021], 'gre.proto': [0x0800] },
  dissect(ctx, off, end) {
    const d = ctx.d;
    ctx.need(off, 20, end);
    const vh = d[off];
    const ver = vh >> 4, ihl = (vh & 15) * 4;
    const t = ctx.proto('ip', off, Math.max(ihl, 20));
    ctx.setProtocol('IPv4');
    if (ver !== 4) {
      ctx.add(t, 'ip.version', off, 1, ver);
      ctx.ei(t, 'ip.bogus_ip_version', off, 1, `Bogus IP version (${ver}, must be 4)`);
      ctx.setInfo(`Bogus IPv4 version (${ver}, must be 4)`);
      return end - off;
    }
    if (ihl < 20) {
      ctx.add(t, 'ip.hdr_len', off, 1, ihl / 4, `.... ${((ihl / 4) >>> 0).toString(2).padStart(4, '0')} = Header Length: ${ihl} bytes (${ihl / 4})`);
      ctx.ei(t, 'ip.bogus_header_length', off, 1, `Bogus IP header length (${ihl}, must be at least 20)`);
      ctx.setInfo(`Bogus IPv4 header length (${ihl}, must be at least 20)`);
      return end - off;
    }
    ctx.need(off, ihl, end);
    const tos = d[off + 1];
    let tlen = u16(d, off + 2);
    const id = u16(d, off + 4);
    const fl = u16(d, off + 6);
    const flags = fl >> 13, foff = (fl & 0x1fff) * 8;
    const ttl = d[off + 8], proto = d[off + 9], ck = u16(d, off + 10);
    const src = ip4(d, off + 12), dst = ip4(d, off + 16);
    let bogusLen = false;
    if (tlen === 0) tlen = end - off; // TSO: length 0, use the frame
    else if (tlen < ihl) bogusLen = true;
    if (ctx.tree) {
      t.label = `Internet Protocol Version 4, Src: ${src}, Dst: ${dst}`;
      ctx.add(t, 'ip.version', off, 1, 4, '0100 .... = Version: 4');
      ctx.add(t, 'ip.hdr_len', off, 1, ihl / 4, `.... ${(ihl / 4).toString(2).padStart(4, '0')} = Header Length: ${ihl} bytes (${ihl / 4})`);
      const ds = ctx.add(t, 'ip.dsfield', off + 1, 1, tos, `Differentiated Services Field: ${hexPad(tos, 2)} (DSCP: ${DSCP_SHORT[tos >> 2] || 'Unknown'}, ECN: ${ECN_SHORT[tos & 3]})`);
      ctx.bits(ds, off + 1, 1, tos, ['ip.dsfield.dscp', 'ip.dsfield.ecn']);
      ctx.add(t, 'ip.len', off + 2, 2, u16(d, off + 2));
      ctx.add(t, 'ip.id', off + 4, 2, id);
      const fdesc = flags & 2 ? ', Don\'t fragment' : flags & 1 ? ', More fragments' : '';
      const fn = ctx.add(t, 'ip.flags', off + 6, 1, flags, `${((flags << 1) >>> 0).toString(2).padStart(4, '0').slice(0, 3)}. .... = Flags: 0x${flags}${fdesc}`);
      ctx.bits(fn, off + 6, 1, d[off + 6], ['ip.flags.rb', 'ip.flags.df', 'ip.flags.mf']);
      ctx.add(t, 'ip.frag_offset', off + 6, 2, fl & 0x1fff, `...${binGroups(fl & 0x1fff, 13)} = Fragment Offset: ${foff}`);
      ctx.add(t, 'ip.ttl', off + 8, 1, ttl);
      ctx.add(t, 'ip.proto', off + 9, 1, proto);
    }
    if (bogusLen) {
      ctx.add(t, 'ip.len', off + 2, 2, tlen);
      ctx.ei(t, 'ip.bogus_ip_length', off + 2, 2, `Bogus IP length (${tlen}, less than header length ${ihl})`);
      ctx.setInfo(`Bogus IP length (${tlen}, less than header length ${ihl})`);
      return end - off;
    }
    const pend = Math.min(end, off + tlen);
    if (ctx.tree) {
      if (ctx.session.prefs.ip.checksum) {
        const calc = ipChecksum(d, off, ihl);
        const ok = calc === 0;
        ctx.add(t, 'ip.checksum', off + 10, 2, ck, `Header Checksum: ${hexPad(ck, 4)} [${ok ? 'correct' : 'incorrect, should be ' + hexPad(fold(d, off, ihl, ck), 4)}]`);
        ctx.gen(t, 'ip.checksum_calculated', ok ? ck : fold(d, off, ihl, ck));
        ctx.gen(t, 'ip.checksum.status', ok ? 1 : 0);
        if (!ok) ctx.ei(t, 'ip.checksum_bad.expert', off + 10, 2);
      } else {
        ctx.add(t, 'ip.checksum', off + 10, 2, ck, `Header Checksum: ${hexPad(ck, 4)} [validation disabled]`);
        ctx.gen(t, 'ip.checksum.status', 2);
      }
      ctx.add(t, 'ip.src', off + 12, 4, src);
      ctx.hidden(t, 'ip.addr', off + 12, 4, src);
      ctx.hidden(t, 'ip.src_host', off + 12, 4, src);
      ctx.hidden(t, 'ip.host', off + 12, 4, src);
      ctx.add(t, 'ip.dst', off + 16, 4, dst);
      ctx.hidden(t, 'ip.addr', off + 16, 4, dst);
      ctx.hidden(t, 'ip.dst_host', off + 16, 4, dst);
      ctx.hidden(t, 'ip.host', off + 16, 4, dst);
      if (ihl > 20) ipOptions(ctx, t, off + 20, off + ihl);
    }
    const stream = streamIndex(ctx, src < dst ? src + '-' + dst : dst + '-' + src, 'ipStream');
    if (stream !== undefined) ctx.gen(t, 'ip.stream', stream);
    if (!ctx.inError) {
      ctx.setNet(src, dst);
      ctx.net = { type: 'ipv4', src, dst, ttl, proto, pseudoSrc: d.subarray(off + 12, off + 16), pseudoDst: d.subarray(off + 16, off + 20) };
    } else {
      ctx.net = { type: 'ipv4', src, dst, ttl, proto, pseudoSrc: d.subarray(off + 12, off + 16), pseudoDst: d.subarray(off + 16, off + 20) };
    }
    const poff = off + ihl;
    const more = (flags & 1) !== 0;
    if (more || foff) {
      // Fragment: reassemble on the first pass; the frame completing the datagram dissects it.
      const fd = ctx.fd;
      if (ctx.first && !ctx.inError && ctx.session.prefs.ip.reassemble) {
        const st = ctx.session.st('ipfrag', () => ({ r: new Reassembler(), pending: new Map() }));
        const key = `${src}>${dst}#${id}#${proto}`;
        const res = st.r.add(key, ctx.no, foff, d.subarray(poff, pend), more);
        let list = st.pending.get(key);
        if (!list) st.pending.set(key, list = []);
        list.push(ctx.no);
        if (res) {
          fd.ipReasm = res;
          for (const n of list) if (n !== ctx.no) ctx.session._fd(n).ipReasmIn = ctx.no;
          st.pending.delete(key);
        }
      }
      if (fd.ipReasm && !ctx.inError) {
        const r = fd.ipReasm;
        const total = r.data.length;
        ctx.withSource(`Reassembled IPv4 (${total} bytes)`, r.data, () => {
          fragmentTree(ctx, t, 'ip', 'IPv4', r.frags, total, r.data);
          transport(ctx, proto, 0, total);
        });
        return pend - off;
      }
      ctx.setProtocol('IPv4');
      ctx.setInfo(`Fragmented IP protocol (proto=${protoName(proto)} ${proto}, off=${foff}, ID=${id.toString(16).padStart(4, '0')})` +
        (fd.ipReasmIn ? ` [Reassembled in #${fd.ipReasmIn}]` : ''));
      if (fd.ipReasmIn) ctx.gen(t, 'ip.reassembled_in', fd.ipReasmIn);
      ctx.data(poff, pend);
      return pend - off;
    }
    transport(ctx, proto, poff, pend);
    return pend - off;
  },
});

function binGroups(v, bits) {
  let s = '';
  for (let i = bits - 1; i >= 0; i--) { s += (v >> i) & 1; if (i % 4 === 0 && i) s += ' '; }
  return s;
}
function ipChecksum(d, off, len) {
  let s = 0;
  for (let i = 0; i < len; i += 2) s += (d[off + i] << 8) | d[off + i + 1];
  while (s > 0xffff) s = (s & 0xffff) + (s >>> 16);
  return (~s) & 0xffff;
}
function fold(d, off, len, ck) {
  // checksum the header with the checksum field zeroed
  let s = 0;
  for (let i = 0; i < len; i += 2) if (i !== 10) s += (d[off + i] << 8) | d[off + i + 1];
  while (s > 0xffff) s = (s & 0xffff) + (s >>> 16);
  void ck;
  return (~s) & 0xffff;
}

function ipOptions(ctx, t, o, end) {
  const d = ctx.d;
  const names = [];
  const box = ctx.text(t, '', o, end - o);
  while (o < end) {
    const type = d[o];
    const nm = OPT_NAMES[type] || `Unknown (0x${type.toString(16).padStart(2, '0')})`;
    if (type === 0 || type === 1) {
      const n = ctx.text(box, `IP Option - ${nm}`, o, 1);
      ctx.add(n, 'ip.opt.type', o, 1, type);
      names.push(type === 0 ? 'End of Options List (EOL)' : 'No Operation (NOP)');
      if (type === 0) { if (o + 1 < end) ctx.add(box, 'ip.opt.padding', o + 1, end - o - 1, d.subarray(o + 1, end)); break; }
      o++; continue;
    }
    if (o + 1 >= end) break;
    const len = d[o + 1];
    if (len < 2 || o + len > end) break;
    const n = ctx.text(box, `IP Option - ${nm} (${len} bytes)`, o, len);
    const ty = ctx.add(n, 'ip.opt.type', o, 1, type, `Type: ${type}`);
    ctx.bits(ty, o, 1, type, ['ip.opt.type.copy', 'ip.opt.type.class', 'ip.opt.type.number']);
    ctx.add(n, 'ip.opt.len', o + 1, 1, len);
    if (type === 148 && len === 4) {
      const v = u16(d, o + 2);
      ctx.add(n, 'ip.opt.ra', o + 2, 2, v, `Router Alert: ${v === 0 ? 'Router shall examine packet' : 'Reserved'} (${v})`);
    } else if (type === 7 || type === 131 || type === 137) {
      const ptr = d[o + 2];
      ctx.add(n, 'ip.opt.ptr', o + 2, 1, ptr, `Pointer: ${ptr}`);
      for (let a = o + 3; a + 4 <= o + len; a += 4) {
        const addr = ip4(d, a);
        ctx.add(n, type === 7 ? (a - o + 1 < ptr ? 'ip.rec_rt' : 'ip.empty_rt') : 'ip.src_rt', a, 4, addr);
      }
    } else if (type === 68) {
      ctx.add(n, 'ip.opt.ptr', o + 2, 1, d[o + 2]);
      for (let a = o + 4; a + 4 <= o + len; a += 4) ctx.add(n, 'ip.opt.time_stamp', a, 4, u32(d, a));
    } else if (len > 2) ctx.add(n, 'ip.opt.data', o + 2, len - 2, d.subarray(o + 2, o + len));
    names.push(nm);
    o += len;
  }
  if (box !== NULLNODE) box.label = `Options: (${end - (box.start)} bytes), ${names.join(', ')}`;
}

// --- IPv6 -------------------------------------------------------------------------------------
const EXT = { 0: 'ipv6.hopopts', 43: 'ipv6.routing', 44: 'ipv6.fraghdr', 60: 'ipv6.dstopts' };
const OPT6 = { 0: 'Pad1', 1: 'PadN', 5: 'Router Alert', 194: 'Jumbo Payload', 4: 'Tunnel Encapsulation Limit', 201: 'Home Address', 99: 'RPL Option', 38: 'Quick-Start' };
const RA6 = { 0: 'MLD', 1: 'RSVP', 2: 'Active Networks' };

registerProtocol({
  abbrev: 'ipv6', name: 'Internet Protocol Version 6', short: 'IPv6',
  fields: [
    ['ipv6.version', 'Version', 'uint8', { mask: 0xf0 }],
    ['ipv6.tclass', 'Traffic Class', 'uint32', { base: 'hex', mask: 0x0ff00000, bits: 32 }],
    ['ipv6.tclass.dscp', 'Differentiated Services Codepoint', 'uint32', { mask: 0x0fc00000, bits: 32, strings: DSCP }],
    ['ipv6.tclass.ecn', 'Explicit Congestion Notification', 'uint32', { mask: 0x00300000, bits: 32, strings: ECN }],
    ['ipv6.flow', 'Flow Label', 'uint32', { base: 'hex', mask: 0x000fffff, bits: 32 }],
    ['ipv6.plen', 'Payload Length', 'uint16'],
    ['ipv6.nxt', 'Next Header', 'uint8', { strings: IP_PROTOS }],
    ['ipv6.hlim', 'Hop Limit', 'uint8'],
    ['ipv6.src', 'Source Address', 'ipv6'],
    ['ipv6.dst', 'Destination Address', 'ipv6'],
    ['ipv6.addr', 'Source or Destination Address', 'ipv6'],
    ['ipv6.src_host', 'Source Host', 'string'],
    ['ipv6.dst_host', 'Destination Host', 'string'],
    ['ipv6.host', 'Source or Destination Host', 'string'],
    ['ipv6.stream', 'Stream index', 'uint32'],
    ['ipv6.opt', 'IPv6 Option', 'none'],
    ['ipv6.opt.type', 'Type', 'uint8', { base: 'hex', strings: OPT6 }],
    ['ipv6.opt.length', 'Length', 'uint8'],
    ['ipv6.opt.pad1', 'Pad1', 'none'],
    ['ipv6.opt.padn', 'PadN', 'bytes'],
    ['ipv6.opt.router_alert', 'Router Alert', 'uint16', { strings: RA6 }],
    ['ipv6.opt.jumbo', 'Payload Length', 'uint32'],
    ['ipv6.opt.tel', 'Tunnel Encapsulation Limit', 'uint8'],
    ['ipv6.opt_unknown_data', 'Unknown Data', 'bytes'],
    ['ipv6.fragment', 'IPv6 Fragment', 'framenum'],
    ['ipv6.fragment.count', 'Fragment count', 'uint32'],
    ['ipv6.fragments', 'IPv6 Fragments', 'none'],
    ['ipv6.reassembled.in', 'Reassembled IPv6 in frame', 'framenum'],
    ['ipv6.reassembled.length', 'Reassembled IPv6 length', 'uint32'],
    ['ipv6.reassembled.data', 'Reassembled IPv6 data', 'bytes'],
  ],
  experts: [
    ['ipv6.bogus_ipv6_version', 'error', 'Protocol', 'Bogus IP version'],
    ['ipv6.plen_exceeds_framing', 'warn', 'Protocol', 'IPv6 payload length does not match expected framing length'],
  ],
  tables: { ethertype: [0x86dd], 'ip.proto': [41], linktype: [229], 'ppp.protocol': [0x0057], 'gre.proto': [0x86dd] },
  dissect(ctx, off, end) {
    const d = ctx.d;
    ctx.need(off, 40, end);
    const w = u32(d, off);
    const ver = w >>> 28;
    const t = ctx.proto('ipv6', off, 40);
    ctx.setProtocol('IPv6');
    if (ver !== 6) {
      ctx.add(t, 'ipv6.version', off, 1, ver);
      ctx.ei(t, 'ipv6.bogus_ipv6_version', off, 1, `Bogus IP version (${ver})`);
      ctx.setInfo(`Bogus IPv6 version (${ver})`);
      return end - off;
    }
    const plen = u16(d, off + 4);
    let nxt = d[off + 6];
    const hlim = d[off + 7];
    const src = ip6(d, off + 8), dst = ip6(d, off + 24);
    const tc = (w >>> 20) & 0xff;
    if (ctx.tree) {
      t.label = `Internet Protocol Version 6, Src: ${src}, Dst: ${dst}`;
      ctx.add(t, 'ipv6.version', off, 1, 6, '0110 .... = Version: 6');
      const tn = ctx.add(t, 'ipv6.tclass', off, 4, tc, `.... ${binGroups(tc, 8)} .... .... .... .... .... = Traffic Class: ${hexPad(tc, 2)} (DSCP: ${DSCP_SHORT[tc >> 2] || 'Unknown'}, ECN: ${ECN_SHORT[tc & 3]})`);
      ctx.bits(tn, off, 4, w, ['ipv6.tclass.dscp', 'ipv6.tclass.ecn']);
      ctx.add(t, 'ipv6.flow', off + 1, 3, w & 0xfffff);
      ctx.add(t, 'ipv6.plen', off + 4, 2, plen);
      ctx.add(t, 'ipv6.nxt', off + 6, 1, nxt);
      ctx.add(t, 'ipv6.hlim', off + 7, 1, hlim);
      ctx.add(t, 'ipv6.src', off + 8, 16, src);
      ctx.hidden(t, 'ipv6.addr', off + 8, 16, src);
      ctx.hidden(t, 'ipv6.src_host', off + 8, 16, src);
      ctx.hidden(t, 'ipv6.host', off + 8, 16, src);
      ctx.add(t, 'ipv6.dst', off + 24, 16, dst);
      ctx.hidden(t, 'ipv6.addr', off + 24, 16, dst);
      ctx.hidden(t, 'ipv6.dst_host', off + 24, 16, dst);
      ctx.hidden(t, 'ipv6.host', off + 24, 16, dst);
    }
    const stream = streamIndex(ctx, src < dst ? src + '-' + dst : dst + '-' + src, 'ipv6Stream');
    if (stream !== undefined) ctx.gen(t, 'ipv6.stream', stream);
    let pend = plen === 0 ? end : Math.min(end, off + 40 + plen);
    if (off + 40 + plen > end && plen && ctx.frame.len === ctx.frame.caplen && ctx.source === 0) ctx.ei(t, 'ipv6.plen_exceeds_framing', off + 4, 2);
    const net = { type: 'ipv6', src, dst, ttl: hlim, proto: nxt, pseudoSrc: d.subarray(off + 8, off + 24), pseudoDst: d.subarray(off + 24, off + 40) };
    if (!ctx.inError) ctx.setNet(src, dst);
    ctx.net = net;
    let o = off + 40;
    // Extension headers
    while (EXT[nxt] && o < pend) {
      const abbrev = EXT[nxt];
      if (nxt === 44) {
        ctx.need(o, 8, pend);
        const fnxt = d[o], fo = u16(d, o + 2), ident = u32(d, o + 4);
        const foff = fo & 0xfff8, more = (fo & 1) === 1;
        const fh = ctx.subProto(t, 'ipv6.fraghdr', o, 8, `Fragment Header for IPv6`);
        ctx.add(fh, 'ipv6.fraghdr.nxt', o, 1, fnxt);
        ctx.add(fh, 'ipv6.fraghdr.reserved_octet', o + 1, 1, d[o + 1]);
        ctx.add(fh, 'ipv6.fraghdr.offset', o + 2, 2, foff >> 3, `${binGroups(foff >> 3, 13)} ... = Offset: ${foff >> 3} (${foff} bytes)`);
        ctx.add(fh, 'ipv6.fraghdr.more', o + 2, 2, more);
        ctx.add(fh, 'ipv6.fraghdr.ident', o + 4, 4, ident);
        net.proto = fnxt;
        const poff = o + 8;
        const fd = ctx.fd;
        if (ctx.first && !ctx.inError) {
          const st = ctx.session.st('ipv6frag', () => ({ r: new Reassembler(), pending: new Map() }));
          const key = `${src}>${dst}#${ident}`;
          const res = st.r.add(key, ctx.no, foff, d.subarray(poff, pend), more);
          let list = st.pending.get(key);
          if (!list) st.pending.set(key, list = []);
          list.push(ctx.no);
          if (res) {
            fd.ip6Reasm = res;
            fd.ip6Nxt = fnxt;
            for (const n of list) if (n !== ctx.no) ctx.session._fd(n).ip6ReasmIn = ctx.no;
            st.pending.delete(key);
          }
          if (foff === 0) st.firstNxt = fnxt;
        }
        if (fd.ip6Reasm && !ctx.inError) {
          const r = fd.ip6Reasm;
          ctx.withSource(`Reassembled IPv6 (${r.data.length} bytes)`, r.data, () => {
            fragmentTree(ctx, t, 'ipv6', 'IPv6', r.frags, r.data.length, r.data);
            transport(ctx, fnxt, 0, r.data.length);
          });
          return pend - off;
        }
        ctx.setProtocol('IPv6');
        ctx.setInfo(`IPv6 fragment (off=${foff} more=${more ? 'y' : 'n'} ident=${hexPad(ident, 8)} nxt=${fnxt})` +
          (fd.ip6ReasmIn ? ` [Reassembled in #${fd.ip6ReasmIn}]` : ''));
        if (fd.ip6ReasmIn) ctx.gen(t, 'ipv6.reassembled.in', fd.ip6ReasmIn);
        ctx.data(poff, pend);
        return pend - off;
      }
      ctx.need(o, 8, pend);
      const enxt = d[o], elen = (d[o + 1] + 1) * 8;
      ctx.need(o, elen, pend);
      const names = { 'ipv6.hopopts': 'IPv6 Hop-by-Hop Option', 'ipv6.routing': 'Routing Header for IPv6', 'ipv6.dstopts': 'Destination Options for IPv6' };
      const eh = ctx.subProto(t, abbrev, o, elen, names[abbrev]);
      ctx.add(eh, `${abbrev}.nxt`, o, 1, enxt);
      ctx.add(eh, `${abbrev}.len`, o + 1, 1, d[o + 1], `Length: ${d[o + 1]}`);
      ctx.gen(eh, `${abbrev}.len_oct`, elen, `Length: ${elen} bytes`);
      if (abbrev === 'ipv6.routing') {
        ctx.add(eh, 'ipv6.routing.type', o + 2, 1, d[o + 2]);
        ctx.add(eh, 'ipv6.routing.segleft', o + 3, 1, d[o + 3]);
        if (elen > 4) ctx.add(eh, 'ipv6.routing.unknown_data', o + 4, elen - 4, d.subarray(o + 4, o + elen));
      } else if (ctx.tree) {
        opts6(ctx, eh, o + 2, o + elen);
      }
      nxt = enxt;
      net.proto = nxt;
      o += elen;
    }
    if (nxt === 59) { // No Next Header
      if (o < pend) ctx.data(o, pend);
      return pend - off;
    }
    transport(ctx, nxt, o, pend);
    return pend - off;
  },
});

registerProtocol({ abbrev: 'ipv6.hopopts', name: 'IPv6 Hop-by-Hop Option', short: 'IPv6 Hop-by-Hop',
  fields: [['ipv6.hopopts.nxt', 'Next Header', 'uint8', { strings: IP_PROTOS }], ['ipv6.hopopts.len', 'Length', 'uint8'], ['ipv6.hopopts.len_oct', 'Length', 'uint16']] });
registerProtocol({ abbrev: 'ipv6.dstopts', name: 'Destination Options for IPv6', short: 'IPv6 Destination',
  fields: [['ipv6.dstopts.nxt', 'Next Header', 'uint8', { strings: IP_PROTOS }], ['ipv6.dstopts.len', 'Length', 'uint8'], ['ipv6.dstopts.len_oct', 'Length', 'uint16']] });
registerProtocol({ abbrev: 'ipv6.routing', name: 'Routing Header for IPv6', short: 'IPv6 Routing',
  fields: [['ipv6.routing.nxt', 'Next Header', 'uint8', { strings: IP_PROTOS }], ['ipv6.routing.len', 'Length', 'uint8'], ['ipv6.routing.len_oct', 'Length', 'uint16'],
    ['ipv6.routing.type', 'Type', 'uint8', { strings: { 0: 'Source Route', 2: 'Type 2 Routing', 3: 'RPL Source Route', 4: 'Segment Routing' } }], ['ipv6.routing.segleft', 'Segments Left', 'uint8'], ['ipv6.routing.unknown_data', 'Type-Specific Data', 'bytes']] });
registerProtocol({ abbrev: 'ipv6.fraghdr', name: 'Fragment Header for IPv6', short: 'IPv6 Fragment',
  fields: [['ipv6.fraghdr.nxt', 'Next header', 'uint8', { strings: IP_PROTOS }], ['ipv6.fraghdr.reserved_octet', 'Reserved octet', 'uint8', { base: 'hex' }],
    ['ipv6.fraghdr.offset', 'Offset', 'uint16', { mask: 0xfff8, bits: 16 }], ['ipv6.fraghdr.more', 'More Fragments', 'bool', { mask: 0x0001, bits: 16, tfs: ['Yes', 'No'] }],
    ['ipv6.fraghdr.ident', 'Identification', 'uint32', { base: 'hex' }]] });

function opts6(ctx, parent, o, end) {
  const d = ctx.d;
  while (o < end) {
    const type = d[o];
    if (type === 0) {
      const n = ctx.add(parent, 'ipv6.opt', o, 1, null, 'Pad1');
      ctx.add(n, 'ipv6.opt.type', o, 1, 0);
      ctx.add(n, 'ipv6.opt.pad1', o, 1, null);
      o++; continue;
    }
    if (o + 2 > end) break;
    const len = d[o + 1];
    const nm = OPT6[type] || 'Unknown IPv6 Option';
    const n = ctx.add(parent, 'ipv6.opt', o, 2 + len, null, nm);
    ctx.add(n, 'ipv6.opt.type', o, 1, type);
    ctx.add(n, 'ipv6.opt.length', o + 1, 1, len);
    if (type === 1) ctx.add(n, 'ipv6.opt.padn', o + 2, len, d.subarray(o + 2, o + 2 + len));
    else if (type === 5 && len === 2) ctx.add(n, 'ipv6.opt.router_alert', o + 2, 2, u16(d, o + 2));
    else if (type === 194 && len === 4) ctx.add(n, 'ipv6.opt.jumbo', o + 2, 4, u32(d, o + 2));
    else if (type === 4 && len === 1) ctx.add(n, 'ipv6.opt.tel', o + 2, 1, d[o + 2]);
    else if (len) ctx.add(n, 'ipv6.opt_unknown_data', o + 2, len, d.subarray(o + 2, o + 2 + len));
    o += 2 + len;
  }
}

/** Internet checksum over a pseudo header + data (TCP/UDP/ICMPv6). Returns the folded 16-bit sum. */
export function pseudoChecksum(net, proto, d, off, len) {
  let s = 0;
  const a = net.pseudoSrc, b = net.pseudoDst;
  for (let i = 0; i < a.length; i += 2) s += (a[i] << 8) | a[i + 1];
  for (let i = 0; i < b.length; i += 2) s += (b[i] << 8) | b[i + 1];
  s += proto + (net.type === 'ipv6' ? 0 : 0) + (len & 0xffff) + (len >>> 16);
  let i = 0;
  for (; i + 1 < len; i += 2) s += (d[off + i] << 8) | d[off + i + 1];
  if (i < len) s += d[off + i] << 8;
  while (s > 0xffff) s = (s & 0xffff) + Math.floor(s / 65536);
  return (~s) & 0xffff;
}
export function inetChecksum(d, off, len) {
  let s = 0, i = 0;
  for (; i + 1 < len; i += 2) s += (d[off + i] << 8) | d[off + i + 1];
  if (i < len) s += d[off + i] << 8;
  while (s > 0xffff) s = (s & 0xffff) + Math.floor(s / 65536);
  return (~s) & 0xffff;
}
