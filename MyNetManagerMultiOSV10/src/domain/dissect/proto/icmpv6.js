// ICMPv6: errors (with the offending packet), echo matching, Neighbor Discovery, MLDv1/v2.
import { registerProtocol, u16, u32, u32le, ip6, mac, hexPad, NULLNODE } from '../core.js';
import { pseudoChecksum, CKSUM_STATUS } from './ip.js';
import { embedded } from './icmp.js';

const TYPES = { 1: 'Destination Unreachable', 2: 'Packet Too Big', 3: 'Time Exceeded', 4: 'Parameter Problem', 128: 'Echo (ping) request', 129: 'Echo (ping) reply', 130: 'Multicast Listener Query', 131: 'Multicast Listener Report', 132: 'Multicast Listener Done', 133: 'Router Solicitation', 134: 'Router Advertisement', 135: 'Neighbor Solicitation', 136: 'Neighbor Advertisement', 137: 'Redirect', 138: 'Router Renumbering', 139: 'Node Information Query', 140: 'Node Information Reply', 141: 'Inverse Neighbor Discovery Solicitation', 142: 'Inverse Neighbor Discovery Advertisement', 143: 'Multicast Listener Report Message v2', 151: 'Multicast Router Advertisement', 152: 'Multicast Router Solicitation', 153: 'Multicast Router Termination', 155: 'RPL Control', 160: 'Extended Echo request', 161: 'Extended Echo reply' };
const CODES = {
  1: { 0: 'No route to destination', 1: 'Administratively prohibited', 2: 'Beyond scope of source address', 3: 'Address unreachable', 4: 'Port unreachable', 5: 'Source address failed ingress/egress policy', 6: 'Reject route to destination', 7: 'Error in Source Routing Header' },
  3: { 0: 'Hop limit exceeded in transit', 1: 'Fragment reassembly time exceeded' },
  4: { 0: 'Erroneous header field encountered', 1: 'Unrecognized Next Header type encountered', 2: 'Unrecognized IPv6 option encountered', 3: 'IPv6 First Fragment has incomplete IPv6 Header Chain' },
};
const OPT_TYPES = { 1: 'Source link-layer address', 2: 'Target link-layer address', 3: 'Prefix information', 4: 'Redirected header', 5: 'MTU', 6: 'NBMA Shortcut Limit Option', 7: 'Advertisement Interval', 8: 'Home Agent Information', 14: 'Nonce', 24: 'Route Information', 25: 'Recursive DNS Server', 26: 'RA Flags Extension', 31: 'DNS Search List Option', 37: 'DHCP Captive-Portal', 38: 'PREF64 Option' };
const PRF = { 0: 'Medium', 1: 'High', 2: 'Reserved', 3: 'Low' };
const MAR_TYPES = { 1: 'Include', 2: 'Exclude', 3: 'Changed to include', 4: 'Changed to exclude', 5: 'Allow new sources', 6: 'Block old sources' };
const SET = ['Set', 'Not set'];

registerProtocol({
  abbrev: 'icmpv6', name: 'Internet Control Message Protocol v6', short: 'ICMPv6',
  fields: [
    ['icmpv6.type', 'Type', 'uint8', { strings: TYPES }],
    ['icmpv6.code', 'Code', 'uint8'],
    ['icmpv6.checksum', 'Checksum', 'uint16', { base: 'hex' }],
    ['icmpv6.checksum.status', 'Checksum Status', 'uint8', { base: 'none', strings: CKSUM_STATUS }],
    ['icmpv6.reserved', 'Reserved', 'bytes'],
    ['icmpv6.data', 'Data', 'bytes'],
    ['icmpv6.unknown_data', 'Unknown Data', 'bytes'],
    ['icmpv6.mtu', 'MTU', 'uint32'],
    ['icmpv6.pointer', 'Pointer', 'uint32'],
    ['icmpv6.echo.identifier', 'Identifier', 'uint16', { base: 'hex' }],
    ['icmpv6.echo.sequence_number', 'Sequence', 'uint16'],
    ['icmpv6.data_time', 'Timestamp from Echo data', 'abs_time'],
    ['icmpv6.data_time_relative', 'Timestamp from Echo data (relative)', 'rel_time'],
    ['icmpv6.resp_in', 'Response In', 'framenum'],
    ['icmpv6.resp_to', 'Response To', 'framenum'],
    ['icmpv6.resptime', 'Response Time', 'double', { unit: ' ms' }],
    ['icmpv6.no_resp', 'No response seen', 'none'],
    ['icmpv6.nd.ra.cur_hop_limit', 'Cur hop limit', 'uint8'],
    ['icmpv6.nd.ra.flag', 'Flags', 'uint8', { base: 'hex' }],
    ['icmpv6.nd.ra.flag.m', 'Managed address configuration', 'bool', { mask: 0x80, bits: 8, tfs: SET }],
    ['icmpv6.nd.ra.flag.o', 'Other configuration', 'bool', { mask: 0x40, bits: 8, tfs: SET }],
    ['icmpv6.nd.ra.flag.h', 'Home Agent', 'bool', { mask: 0x20, bits: 8, tfs: SET }],
    ['icmpv6.nd.ra.flag.prf', 'Prf (Default Router Preference)', 'uint8', { mask: 0x18, strings: PRF }],
    ['icmpv6.nd.ra.flag.p', 'ND Proxy', 'bool', { mask: 0x04, bits: 8, tfs: SET }],
    ['icmpv6.nd.ra.flag.s', 'SNAC Router', 'bool', { mask: 0x02, bits: 8, tfs: SET }],
    ['icmpv6.nd.ra.flag.rsv', 'Reserved', 'uint8', { mask: 0x01 }],
    ['icmpv6.nd.ra.router_lifetime', 'Router lifetime (s)', 'uint16'],
    ['icmpv6.nd.ra.reachable_time', 'Reachable time (ms)', 'uint32'],
    ['icmpv6.nd.ra.retrans_timer', 'Retrans timer (ms)', 'uint32'],
    ['icmpv6.nd.ns.target_address', 'Target Address', 'ipv6'],
    ['icmpv6.nd.na.flag', 'Flags', 'uint32', { base: 'hex' }],
    ['icmpv6.nd.na.flag.r', 'Router', 'bool', { mask: 0x80000000, bits: 32, tfs: SET }],
    ['icmpv6.nd.na.flag.s', 'Solicited', 'bool', { mask: 0x40000000, bits: 32, tfs: SET }],
    ['icmpv6.nd.na.flag.o', 'Override', 'bool', { mask: 0x20000000, bits: 32, tfs: SET }],
    ['icmpv6.nd.na.flag.rsv', 'Reserved', 'uint32', { mask: 0x1fffffff, bits: 32 }],
    ['icmpv6.nd.na.target_address', 'Target Address', 'ipv6'],
    ['icmpv6.nd.rd.target_address', 'Target Address', 'ipv6'],
    ['icmpv6.rd.na.destination_address', 'Destination Address', 'ipv6'],
    ['icmpv6.opt', 'ICMPv6 Option', 'none'],
    ['icmpv6.opt.type', 'Type', 'uint8', { strings: OPT_TYPES }],
    ['icmpv6.opt.length', 'Length', 'uint8'],
    ['icmpv6.opt.reserved', 'Reserved', 'none'],
    ['icmpv6.opt.padding', 'Padding', 'none'],
    ['icmpv6.opt.linkaddr', 'Link-layer address', 'bytes'],
    ['icmpv6.opt.src_linkaddr', 'Source Link-layer address', 'bytes'],
    ['icmpv6.opt.target_linkaddr', 'Target Link-layer address', 'bytes'],
    ['icmpv6.opt.prefix.length', 'Prefix Length', 'uint8'],
    ['icmpv6.opt.prefix.flag', 'Flag', 'uint8', { base: 'hex' }],
    ['icmpv6.opt.prefix.flag.l', 'On-link Flag (L)', 'bool', { mask: 0x80, bits: 8, tfs: SET }],
    ['icmpv6.opt.prefix.flag.a', 'Autonomous Address Configuration Flag (A)', 'bool', { mask: 0x40, bits: 8, tfs: SET }],
    ['icmpv6.opt.prefix.flag.r', 'Router Address Flag (R)', 'bool', { mask: 0x20, bits: 8, tfs: SET }],
    ['icmpv6.opt.prefix.flag.p', 'DHCPv6-PD Preferred Flag (P)', 'bool', { mask: 0x10, bits: 8, tfs: SET }],
    ['icmpv6.opt.prefix.flag.reserved', 'Reserved', 'uint8', { mask: 0x0f }],
    ['icmpv6.opt.prefix.valid_lifetime', 'Valid Lifetime', 'uint32'],
    ['icmpv6.opt.prefix.preferred_lifetime', 'Preferred Lifetime', 'uint32'],
    ['icmpv6.opt.prefix', 'Prefix', 'ipv6'],
    ['icmpv6.opt.mtu', 'MTU', 'uint32'],
    ['icmpv6.opt.route_info.flag', 'Flag', 'uint8', { base: 'hex' }],
    ['icmpv6.opt.route_info.flag.route_preference', 'Route Preference', 'uint8', { mask: 0x18, strings: PRF }],
    ['icmpv6.opt.route_info.flag.reserved', 'Reserved', 'uint8', { mask: 0xe7 }],
    ['icmpv6.opt.route_lifetime', 'Route Lifetime', 'uint32'],
    ['icmpv6.opt.rdnss.lifetime', 'Lifetime', 'uint32'],
    ['icmpv6.opt.rdnss', 'Recursive DNS Servers', 'ipv6'],
    ['icmpv6.opt.dnssl.lifetime', 'Lifetime', 'uint32'],
    ['icmpv6.opt.dnssl', 'Domain Names', 'string'],
    ['icmpv6.opt.advertisement_interval', 'Advertisement Interval', 'uint32'],
    ['icmpv6.mld.maximum_response_delay', 'Maximum Response Delay [ms]', 'uint16'],
    ['icmpv6.mld.maximum_response_code', 'Maximum Response Code', 'uint16'],
    ['icmpv6.mld.multicast_address', 'Multicast Address', 'ipv6'],
    ['icmpv6.mld.flag', 'Flags', 'uint8', { base: 'hex' }],
    ['icmpv6.mld.flag.s', 'Suppress Router-Side Processing', 'bool', { mask: 0x08, bits: 8 }],
    ['icmpv6.mld.flag.qrv', 'QRV (Querier\'s Robustness Variable)', 'uint8', { mask: 0x07 }],
    ['icmpv6.mld.flag.reserved', 'Reserved', 'uint8', { mask: 0xf0 }],
    ['icmpv6.mld.qqi', 'QQIC (Querier\'s Query Interval Code)', 'uint8'],
    ['icmpv6.mld.nb_sources', 'Number of Sources', 'uint16'],
    ['icmpv6.mld.source_address', 'Source Address', 'ipv6'],
    ['icmpv6.mldr.nb_mcast_records', 'Number of Multicast Address Records', 'uint16'],
    ['icmpv6.mldr.mar', 'Multicast Address Record', 'none'],
    ['icmpv6.mldr.mar.record_type', 'Record Type', 'uint8', { strings: MAR_TYPES }],
    ['icmpv6.mldr.mar.aux_data_len', 'Aux Data Len', 'uint8'],
    ['icmpv6.mldr.mar.nb_sources', 'Number of Sources', 'uint16'],
    ['icmpv6.mldr.mar.multicast_address', 'Multicast Address', 'ipv6'],
    ['icmpv6.mldr.mar.source_address', 'Source Address', 'ipv6'],
    ['icmpv6.mldr.mar.auxiliary_data', 'Auxiliary Data', 'bytes'],
  ],
  experts: [
    ['icmpv6.checksum_bad', 'error', 'Checksum', 'Bad checksum'],
    ['icmpv6.type.error', 'note', 'Response Code', 'Type indicates an error'],
    ['icmpv6.resp_not_found', 'warn', 'Sequence', 'No response seen to ICMPv6 request'],
    ['icmpv6.invalid_option_length', 'error', 'Malformed', 'Invalid Option Length'],
  ],
  tables: { 'ip.proto': [58] },
  dissect(ctx, off, end) {
    const d = ctx.d;
    ctx.need(off, 4, end);
    const type = d[off], code = d[off + 1], ck = u16(d, off + 2);
    ctx.setProtocol('ICMPv6');
    const tname = TYPES[type] || 'Unknown';
    const cname = CODES[type] ? CODES[type][code] : null;
    const t = ctx.proto('icmpv6', off, end - off);
    const net = ctx.net;
    if (ctx.tree) {
      const tn = ctx.add(t, 'icmpv6.type', off, 1, type);
      if (type < 128) ctx.ei(tn, 'icmpv6.type.error', off, 1);
      ctx.add(t, 'icmpv6.code', off + 1, 1, code, cname ? `Code: ${code} (${cname})` : `Code: ${code}`);
    } else if (type < 128) ctx.ei(NULLNODE, 'icmpv6.type.error');
    // checksum over the pseudo header (only verifiable when the whole message was captured)
    const full = !(ctx.source === 0 && ctx.frame.len > ctx.frame.caplen) && net && net.type === 'ipv6';
    const ok = full ? pseudoChecksum(net, 58, d, off, end - off) === 0 : true;
    if (ctx.tree) {
      ctx.add(t, 'icmpv6.checksum', off + 2, 2, ck, `Checksum: ${hexPad(ck, 4)} [${full ? (ok ? 'correct' : 'incorrect') : 'unverified'}]`);
      ctx.gen(t, 'icmpv6.checksum.status', full ? (ok ? 1 : 0) : 2);
    }
    if (!ok) ctx.ei(t, 'icmpv6.checksum_bad', off + 2, 2);
    let o = off + 4;
    let info = tname;
    switch (type) {
      case 1: case 2: case 3: case 4: {
        ctx.need(o, 4, end);
        if (type === 2) ctx.add(t, 'icmpv6.mtu', o, 4, u32(d, o));
        else if (type === 4) ctx.add(t, 'icmpv6.pointer', o, 4, u32(d, o));
        else ctx.add(t, 'icmpv6.reserved', o, 4, d.subarray(o, o + 4));
        if (cname) info += ` (${cname})`;
        ctx.setInfo(info);
        if (o + 4 < end) embedded(ctx, o + 4, end);
        return end - off;
      }
      case 128: case 129: {
        ctx.need(o, 4, end);
        const id = u16(d, o), seq = u16(d, o + 2);
        ctx.add(t, 'icmpv6.echo.identifier', o, 2, id);
        ctx.add(t, 'icmpv6.echo.sequence_number', o + 2, 2, seq);
        info += ` id=0x${id.toString(16).padStart(4, '0')}, seq=${seq}`;
        if (net) info += `, hop limit=${net.ttl}`;
        const m = match(ctx, type, id, seq);
        if (m.in) { info += ` (reply in ${m.in})`; ctx.gen(t, 'icmpv6.resp_in', m.in, `Response In: ${m.in}`); }
        else if (m.to) {
          info += ` (request in ${m.to})`;
          ctx.gen(t, 'icmpv6.resp_to', m.to, `Response To: ${m.to}`);
          ctx.gen(t, 'icmpv6.resptime', m.time, `Response Time: ${m.time.toFixed(3)} ms`);
        } else if (type === 128) {
          info += ' (no response found!)';
          const n = ctx.gen(t, 'icmpv6.no_resp', null, 'No response seen');
          ctx.ei(n, 'icmpv6.resp_not_found');
        }
        ctx.setInfo(info);
        o = echoTimestamp(ctx, t, o + 4, end);
        if (end - o >= 16 && looksLikeHiPerConTracer(ctx, o)) hiPerConTracer(ctx, o, end);
        else if (o < end) dataUnder(ctx, t, o, end);
        return end - off;
      }
      case 130: case 131: case 132: {
        ctx.need(o, 20, end);
        const v2 = type === 130 && end - off >= 28;
        if (v2) ctx.add(t, 'icmpv6.mld.maximum_response_code', o, 2, u16(d, o));
        else ctx.add(t, 'icmpv6.mld.maximum_response_delay', o, 2, u16(d, o));
        ctx.add(t, 'icmpv6.reserved', o + 2, 2, d.subarray(o + 2, o + 4));
        ctx.add(t, 'icmpv6.mld.multicast_address', o + 4, 16, ip6(d, o + 4));
        o += 20;
        if (v2) {
          ctx.need(o, 4, end);
          const fl = d[o];
          const fn = ctx.add(t, 'icmpv6.mld.flag', o, 1, fl);
          ctx.bits(fn, o, 1, fl, ['icmpv6.mld.flag.s', 'icmpv6.mld.flag.qrv', 'icmpv6.mld.flag.reserved']);
          ctx.add(t, 'icmpv6.mld.qqi', o + 1, 1, d[o + 1]);
          const ns = u16(d, o + 2);
          ctx.add(t, 'icmpv6.mld.nb_sources', o + 2, 2, ns);
          o += 4;
          for (let i = 0; i < ns; i++, o += 16) { ctx.need(o, 16, end); ctx.add(t, 'icmpv6.mld.source_address', o, 16, ip6(d, o)); }
        }
        ctx.setInfo(info);
        return end - off;
      }
      case 143: {
        ctx.need(o, 4, end);
        ctx.add(t, 'icmpv6.reserved', o, 2, d.subarray(o, o + 2));
        const n = u16(d, o + 2);
        ctx.add(t, 'icmpv6.mldr.nb_mcast_records', o + 2, 2, n);
        o += 4;
        for (let i = 0; i < n; i++) {
          ctx.need(o, 20, end);
          const rt = d[o], aux = d[o + 1], ns = u16(d, o + 2);
          const len = 20 + ns * 16 + aux * 4;
          const maddr = ip6(d, o + 4);
          const r = ctx.add(t, 'icmpv6.mldr.mar', o, len, null, `Multicast Address Record ${MAR_TYPES[rt] || 'Unknown'}: ${maddr}`);
          ctx.add(r, 'icmpv6.mldr.mar.record_type', o, 1, rt);
          ctx.add(r, 'icmpv6.mldr.mar.aux_data_len', o + 1, 1, aux);
          ctx.add(r, 'icmpv6.mldr.mar.nb_sources', o + 2, 2, ns);
          ctx.add(r, 'icmpv6.mldr.mar.multicast_address', o + 4, 16, maddr);
          let p = o + 20;
          for (let k = 0; k < ns; k++, p += 16) { ctx.need(p, 16, end); ctx.add(r, 'icmpv6.mldr.mar.source_address', p, 16, ip6(d, p)); }
          if (aux) { ctx.need(p, aux * 4, end); ctx.add(r, 'icmpv6.mldr.mar.auxiliary_data', p, aux * 4, d.subarray(p, p + aux * 4)); }
          o += len;
        }
        ctx.setInfo(info);
        return end - off;
      }
      case 133: {
        ctx.need(o, 4, end);
        ctx.add(t, 'icmpv6.reserved', o, 4, d.subarray(o, o + 4));
        const opts = options(ctx, t, o + 4, end);
        if (opts.src) info += ` from ${opts.src}`;
        ctx.setInfo(info);
        return end - off;
      }
      case 134: {
        ctx.need(o, 12, end);
        ctx.add(t, 'icmpv6.nd.ra.cur_hop_limit', o, 1, d[o]);
        const fl = d[o + 1];
        if (ctx.tree) {
          const names = [];
          if (fl & 0x80) names.push('Managed address configuration');
          if (fl & 0x40) names.push('Other configuration');
          if (fl & 0x20) names.push('Home Agent');
          names.push(`Prf (Default Router Preference): ${PRF[(fl >> 3) & 3]}`);
          if (fl & 0x04) names.push('ND Proxy');
          if (fl & 0x02) names.push('SNAC Router');
          const fn = ctx.add(t, 'icmpv6.nd.ra.flag', o + 1, 1, fl, `Flags: ${hexPad(fl, 2)}, ${names.join(', ')}`);
          ctx.bits(fn, o + 1, 1, fl, ['icmpv6.nd.ra.flag.m', 'icmpv6.nd.ra.flag.o', 'icmpv6.nd.ra.flag.h', 'icmpv6.nd.ra.flag.prf', 'icmpv6.nd.ra.flag.p', 'icmpv6.nd.ra.flag.s', 'icmpv6.nd.ra.flag.rsv']);
        }
        ctx.add(t, 'icmpv6.nd.ra.router_lifetime', o + 2, 2, u16(d, o + 2));
        ctx.add(t, 'icmpv6.nd.ra.reachable_time', o + 4, 4, u32(d, o + 4));
        ctx.add(t, 'icmpv6.nd.ra.retrans_timer', o + 8, 4, u32(d, o + 8));
        const opts = options(ctx, t, o + 12, end);
        if (opts.src) info += ` from ${opts.src}`;
        ctx.setInfo(info);
        return end - off;
      }
      case 135: {
        ctx.need(o, 20, end);
        ctx.add(t, 'icmpv6.reserved', o, 4, d.subarray(o, o + 4));
        const tgt = ip6(d, o + 4);
        ctx.add(t, 'icmpv6.nd.ns.target_address', o + 4, 16, tgt);
        const opts = options(ctx, t, o + 20, end);
        info += ` for ${tgt}`;
        if (opts.src) info += ` from ${opts.src}`;
        ctx.setInfo(info);
        return end - off;
      }
      case 136: {
        ctx.need(o, 20, end);
        const fl = u32(d, o);
        const tgt = ip6(d, o + 4);
        const fnames = [];
        if (fl & 0x80000000) fnames.push('rtr');
        if (fl & 0x40000000) fnames.push('sol');
        if (fl & 0x20000000) fnames.push('ovr');
        if (ctx.tree) {
          const long = [];
          if (fl & 0x80000000) long.push('Router');
          if (fl & 0x40000000) long.push('Solicited');
          if (fl & 0x20000000) long.push('Override');
          const fn = ctx.add(t, 'icmpv6.nd.na.flag', o, 4, fl, `Flags: ${hexPad(fl, 8)}${long.length ? ', ' + long.join(', ') : ''}`);
          ctx.bits(fn, o, 4, fl, ['icmpv6.nd.na.flag.r', 'icmpv6.nd.na.flag.s', 'icmpv6.nd.na.flag.o', 'icmpv6.nd.na.flag.rsv']);
        }
        ctx.add(t, 'icmpv6.nd.na.target_address', o + 4, 16, tgt);
        const opts = options(ctx, t, o + 20, end);
        info += ` ${tgt}`;
        if (fnames.length) info += ` (${fnames.join(', ')})`;
        if (opts.tgt) info += ` is at ${opts.tgt}`;
        ctx.setInfo(info);
        return end - off;
      }
      case 137: {
        ctx.need(o, 36, end);
        ctx.add(t, 'icmpv6.reserved', o, 4, d.subarray(o, o + 4));
        ctx.add(t, 'icmpv6.nd.rd.target_address', o + 4, 16, ip6(d, o + 4));
        ctx.add(t, 'icmpv6.rd.na.destination_address', o + 20, 16, ip6(d, o + 20));
        const opts = options(ctx, t, o + 36, end);
        if (opts.tgt) info += ` is at ${opts.tgt}`;
        ctx.setInfo(info);
        return end - off;
      }
      default:
        ctx.setInfo(info);
        if (o < end) ctx.add(t, 'icmpv6.unknown_data', o, end - o, d.subarray(o, end));
        return end - off;
    }
  },
});

/** Linux ping6 puts a struct timeval first; Wireshark shows it when it is close to the capture time. */
function echoTimestamp(ctx, t, o, end) {
  const d = ctx.d, fs = ctx.frame.sec;
  let len = 0, sec = 0, us = 0;
  if (end - o >= 16 && u32le(d, o + 4) === 0 && u32le(d, o + 12) === 0 && u32le(d, o + 8) < 1000000 && Math.abs(u32le(d, o) - fs) <= 86400) { len = 16; sec = u32le(d, o); us = u32le(d, o + 8); }
  else if (end - o >= 8 && u32le(d, o + 4) < 1000000 && Math.abs(u32le(d, o) - fs) <= 86400) { len = 8; sec = u32le(d, o); us = u32le(d, o + 4); }
  if (!len) return o;
  ctx.add(t, 'icmpv6.data_time', o, len, { sec, nsec: us * 1000 });
  ctx.gen(t, 'icmpv6.data_time_relative', (ctx.frame.sec - sec) + (ctx.frame.nsec - us * 1000) / 1e9);
  return o + len;
}

/**
 * HiPerConTracer (Wireshark's heuristic on ICMPv6 echo data, not on ICMPv4): 16 bytes or more after the ping
 * timestamp are read as its trace header — magic, send TTL, round, checksum tweak, then the send time in
 * nanoseconds since 1976-09-29 (big-endian). It takes the rest of the payload, as Wireshark does.
 */
const HPCT_EPOCH = 212803200n; // 1976-09-29 00:00:00 UTC in seconds since 1970
/**
 * A trace header carries its own send time (within a day of the capture time) and a TTL of at least 1; the usual ping fill
 * bytes (10 11 12 … after the timestamp) decode to a time centuries away, and Wireshark shows them as data.
 */
function looksLikeHiPerConTracer(ctx, o) {
  const d = ctx.d;
  if (d[o + 4] === 0) return false;
  const ns = (BigInt(u32(d, o + 8)) << 32n) | BigInt(u32(d, o + 12));
  const sec = Number(ns / 1000000000n + HPCT_EPOCH);
  return Math.abs(sec - ctx.frame.sec) <= 86400;
}
function hiPerConTracer(ctx, o, end) {
  const d = ctx.d;
  const ttl = d[o + 4];
  const round = d[o + 5];
  const ns = (BigInt(u32(d, o + 8)) << 32n) | BigInt(u32(d, o + 12));
  const sec = ns / 1000000000n + HPCT_EPOCH;
  const t = ctx.proto('hipercontracer', o, end - o, 'HiPerConTracer Trace Service');
  ctx.add(t, 'hipercontracer.magic_number', o, 4, u32(d, o));
  ctx.add(t, 'hipercontracer.send_ttl', o + 4, 1, ttl);
  ctx.add(t, 'hipercontracer.round', o + 5, 1, round);
  ctx.add(t, 'hipercontracer.checksum_tweak', o + 6, 2, u16(d, o + 6));
  ctx.add(t, 'hipercontracer.send_timestamp', o + 8, 8, { sec: Number(sec), nsec: Number(ns % 1000000000n) });
  ctx.setProtocol(`${ctx.protocol}, HiPerConTracer`);
  ctx.appendInfo(` (SendTTL=${ttl}, Round=${round})`);
}

function dataUnder(ctx, parent, o, end) {
  const n = ctx.subProto(parent, 'data', o, end - o, `Data (${end - o} bytes)`);
  if (ctx.tree) {
    ctx.add(n, 'data.data', o, end - o, ctx.d.subarray(o, end));
    ctx.gen(n, 'data.len', end - o, `Length: ${end - o}`);
  }
}

/** Duration text like Wireshark's unsigned_time_secs_to_str ("30 days", "1 hour, 30 minutes"). */
export function secsText(v) {
  if (v === 0xffffffff) return 'Infinity';
  if (v === 0) return '0 seconds';
  const parts = [];
  const u = [[86400, 'day'], [3600, 'hour'], [60, 'minute'], [1, 'second']];
  for (const [s, n] of u) {
    const q = Math.floor(v / s);
    if (q) { parts.push(`${q} ${n}${q === 1 ? '' : 's'}`); v -= q * s; }
  }
  return parts.join(', ');
}

function dnsName(d, o, end) {
  const names = [];
  let cur = [];
  while (o < end) {
    const l = d[o];
    if (l === 0) { if (cur.length) names.push(cur.join('.')); cur = []; o++; continue; }
    if (o + 1 + l > end) break;
    let s = '';
    for (let i = 0; i < l; i++) s += String.fromCharCode(d[o + 1 + i]);
    cur.push(s);
    o += 1 + l;
  }
  if (cur.length) names.push(cur.join('.'));
  return names;
}

/** ND options; returns resolved source/target link-layer addresses for the Info column. */
function options(ctx, t, o, end) {
  const d = ctx.d;
  const res = { src: null, tgt: null };
  while (o + 2 <= end) {
    const type = d[o], len8 = d[o + 1], len = len8 * 8;
    if (len === 0 || o + len > end) {
      const n = ctx.add(t, 'icmpv6.opt', o, end - o, null, `ICMPv6 Option (${OPT_TYPES[type] || 'Unknown'})`);
      ctx.ei(n, 'icmpv6.invalid_option_length', o + 1, 1);
      break;
    }
    const name = OPT_TYPES[type] || 'Unknown';
    let label = name;
    let n = NULLNODE;
    const v = o + 2;
    if ((type === 1 || type === 2) && len >= 8) {
      const m = mac(d, v);
      if (type === 1) res.src = m; else res.tgt = m;
      label = `${name} : ${m}`;
      n = ctx.add(t, 'icmpv6.opt', o, len, null, `ICMPv6 Option (${label})`);
      head(ctx, n, o, len8);
      ctx.add(n, 'icmpv6.opt.linkaddr', v, 6, d.subarray(v, v + 6), `Link-layer address: ${m}`);
      ctx.hidden(n, type === 1 ? 'icmpv6.opt.src_linkaddr' : 'icmpv6.opt.target_linkaddr', v, 6, d.subarray(v, v + 6));
    } else if (type === 3 && len >= 32) {
      const plen = d[v], fl = d[v + 1];
      const pfx = ip6(d, o + 16);
      n = ctx.add(t, 'icmpv6.opt', o, len, null, `ICMPv6 Option (${name} : ${pfx}/${plen})`);
      if (ctx.tree) {
        head(ctx, n, o, len8);
        ctx.add(n, 'icmpv6.opt.prefix.length', v, 1, plen);
        const fnames = [];
        if (fl & 0x80) fnames.push('On-link Flag (L)');
        if (fl & 0x40) fnames.push('Autonomous Address Configuration Flag (A)');
        if (fl & 0x20) fnames.push('Router Address Flag (R)');
        if (fl & 0x10) fnames.push('DHCPv6-PD Preferred Flag (P)');
        const fn = ctx.add(n, 'icmpv6.opt.prefix.flag', v + 1, 1, fl, `Flag: ${hexPad(fl, 2)}${fnames.length ? ', ' + fnames.join(', ') : ''}`);
        ctx.bits(fn, v + 1, 1, fl, ['icmpv6.opt.prefix.flag.l', 'icmpv6.opt.prefix.flag.a', 'icmpv6.opt.prefix.flag.r', 'icmpv6.opt.prefix.flag.p', 'icmpv6.opt.prefix.flag.reserved']);
        const vl = u32(d, o + 4), pl = u32(d, o + 8);
        ctx.add(n, 'icmpv6.opt.prefix.valid_lifetime', o + 4, 4, vl, `Valid Lifetime: ${vl} (${secsText(vl)})`);
        ctx.add(n, 'icmpv6.opt.prefix.preferred_lifetime', o + 8, 4, pl, `Preferred Lifetime: ${pl} (${secsText(pl)})`);
        ctx.add(n, 'icmpv6.opt.reserved', o + 12, 4, null);
        ctx.add(n, 'icmpv6.opt.prefix', o + 16, 16, pfx);
      }
    } else if (type === 5 && len >= 8) {
      const mtu = u32(d, o + 4);
      n = ctx.add(t, 'icmpv6.opt', o, len, null, `ICMPv6 Option (${name} : ${mtu})`);
      head(ctx, n, o, len8);
      ctx.add(n, 'icmpv6.opt.reserved', v, 2, null);
      ctx.add(n, 'icmpv6.opt.mtu', o + 4, 4, mtu);
    } else if (type === 25 && len >= 24) {
      const lt = u32(d, o + 4);
      const addrs = [];
      for (let p = o + 8; p + 16 <= o + len; p += 16) addrs.push([p, ip6(d, p)]);
      n = ctx.add(t, 'icmpv6.opt', o, len, null, `ICMPv6 Option (${name} ${addrs.map((a) => a[1]).join(' ')})`);
      head(ctx, n, o, len8);
      ctx.add(n, 'icmpv6.opt.reserved', v, 2, null);
      ctx.add(n, 'icmpv6.opt.rdnss.lifetime', o + 4, 4, lt, `Lifetime: ${lt} (${secsText(lt)})`);
      for (const [p, a] of addrs) ctx.add(n, 'icmpv6.opt.rdnss', p, 16, a);
    } else if (type === 31 && len >= 8) {
      const lt = u32(d, o + 4);
      const names = dnsName(d, o + 8, o + len);
      n = ctx.add(t, 'icmpv6.opt', o, len, null, `ICMPv6 Option (${name} ${names.join(' ')})`);
      head(ctx, n, o, len8);
      ctx.add(n, 'icmpv6.opt.reserved', v, 2, null);
      ctx.add(n, 'icmpv6.opt.dnssl.lifetime', o + 4, 4, lt, `Lifetime: ${lt} (${secsText(lt)})`);
      for (const nm of names) ctx.add(n, 'icmpv6.opt.dnssl', o + 8, len - 8, nm);
      ctx.add(n, 'icmpv6.opt.padding', o + 8, len - 8, null);
    } else if (type === 24 && len >= 8) {
      const plen = d[v], fl = d[v + 1];
      const lt = u32(d, o + 4);
      const pb = new Uint8Array(16);
      pb.set(d.subarray(o + 8, Math.min(o + len, o + 24)));
      const pfx = ip6(pb, 0);
      const pr = PRF[(fl >> 3) & 3];
      n = ctx.add(t, 'icmpv6.opt', o, len, null, `ICMPv6 Option (${name} : ${pr} ${pfx}/${plen})`);
      if (ctx.tree) {
        head(ctx, n, o, len8);
        ctx.add(n, 'icmpv6.opt.prefix.length', v, 1, plen);
        const fn = ctx.add(n, 'icmpv6.opt.route_info.flag', v + 1, 1, fl, `Flag: ${hexPad(fl, 2)}, Route Preference: ${pr}`);
        ctx.bits(fn, v + 1, 1, fl, ['icmpv6.opt.route_info.flag.route_preference', 'icmpv6.opt.route_info.flag.reserved']);
        ctx.add(n, 'icmpv6.opt.route_lifetime', o + 4, 4, lt, `Route Lifetime: ${lt} (${secsText(lt)})`);
        if (len > 8) ctx.add(n, 'icmpv6.opt.prefix', o + 8, len - 8, pfx);
      }
    } else if (type === 7 && len >= 8) {
      n = ctx.add(t, 'icmpv6.opt', o, len, null, `ICMPv6 Option (${name})`);
      head(ctx, n, o, len8);
      ctx.add(n, 'icmpv6.opt.reserved', v, 2, null);
      ctx.add(n, 'icmpv6.opt.advertisement_interval', o + 4, 4, u32(d, o + 4));
    } else {
      n = ctx.add(t, 'icmpv6.opt', o, len, null, `ICMPv6 Option (${name})`);
      head(ctx, n, o, len8);
      if (len > 2) ctx.add(n, 'icmpv6.data', v, len - 2, d.subarray(v, o + len));
    }
    o += len;
  }
  return res;
}
function head(ctx, n, o, len8) {
  if (!ctx.tree) return;
  ctx.add(n, 'icmpv6.opt.type', o, 1, ctx.d[o]);
  ctx.add(n, 'icmpv6.opt.length', o + 1, 1, len8, `Length: ${len8} (${len8 * 8} bytes)`);
}

/** Echo request/reply pairing on the first pass. */
function match(ctx, type, id, seq) {
  const fd = ctx.fd;
  if (ctx.first && !ctx.inError && ctx.net) {
    const st = ctx.session.st('icmpv6', () => new Map());
    const req = type === 128;
    const a = ctx.net.src, b = ctx.net.dst;
    const key = (req ? a + '>' + b : b + '>' + a) + '#' + id + '#' + seq;
    if (req) st.set(key, { no: ctx.no, rel: fd.rel, resp: 0 });
    else {
      const r = st.get(key);
      if (r && !r.resp) {
        r.resp = ctx.no;
        ctx.session._fd(r.no).icmp6In = ctx.no;
        fd.icmp6To = r.no;
        fd.icmp6Time = (fd.rel - r.rel) * 1000;
      }
    }
  }
  return { in: fd.icmp6In || 0, to: fd.icmp6To || 0, time: fd.icmp6Time || 0 };
}

registerProtocol({
  abbrev: 'hipercontracer', name: 'HiPerConTracer Trace Service', short: 'HiPerConTracer',
  fields: [
    ['hipercontracer.magic_number', 'Magic Number', 'uint32', { base: 'hex' }],
    ['hipercontracer.send_ttl', 'Send TTL', 'uint8'],
    ['hipercontracer.round', 'Round', 'uint8'],
    ['hipercontracer.checksum_tweak', 'Checksum Tweak', 'uint16', { base: 'hex' }],
    ['hipercontracer.seq_number', 'Sequence Number', 'uint16'],
    ['hipercontracer.send_timestamp', 'Send Time Stamp', 'abs_time'],
  ],
});
