// ICMP (IPv4): all common types, echo request/response matching, embedded headers of error messages.
import { registerProtocol, u16, u32, u32le, ip4, hexPad, NULLNODE } from '../core.js';
import { inetChecksum, CKSUM_STATUS } from './ip.js';

const TYPES = { 0: 'Echo (ping) reply', 3: 'Destination unreachable', 4: 'Source quench (flow control)', 5: 'Redirect', 6: 'Alternate host address', 8: 'Echo (ping) request', 9: 'Router advertisement', 10: 'Router solicitation', 11: 'Time-to-live exceeded', 12: 'Parameter problem', 13: 'Timestamp request', 14: 'Timestamp reply', 15: 'Information request', 16: 'Information reply', 17: 'Address mask request', 18: 'Address mask reply', 30: 'Traceroute', 42: 'Extended Echo request', 43: 'Extended Echo reply' };
const UNREACH = { 0: 'Network unreachable', 1: 'Host unreachable', 2: 'Protocol unreachable', 3: 'Port unreachable', 4: 'Fragmentation needed', 5: 'Source route failed', 6: 'Destination network unknown', 7: 'Destination host unknown', 8: 'Source host isolated', 9: 'Network administratively prohibited', 10: 'Host administratively prohibited', 11: 'Network unreachable for TOS', 12: 'Host unreachable for TOS', 13: 'Communication administratively filtered', 14: 'Host precedence violation', 15: 'Precedence cutoff in effect' };
const REDIRECT = { 0: 'Redirect for network', 1: 'Redirect for host', 2: 'Redirect for TOS and network', 3: 'Redirect for TOS and host' };
const TTL = { 0: 'Time to live exceeded in transit', 1: 'Fragment reassembly time exceeded' };
const PARAM = { 0: 'Pointer indicates the error', 1: 'Required option missing', 2: 'Bad length' };
const CODES = { 3: UNREACH, 5: REDIRECT, 11: TTL, 12: PARAM, 9: { 0: 'Normal router advertisement', 16: 'Does not route common traffic' } };

registerProtocol({
  abbrev: 'icmp', name: 'Internet Control Message Protocol', short: 'ICMP',
  fields: [
    ['icmp.type', 'Type', 'uint8', { strings: TYPES }],
    ['icmp.code', 'Code', 'uint8'],
    ['icmp.checksum', 'Checksum', 'uint16', { base: 'hex' }],
    ['icmp.checksum.status', 'Checksum Status', 'uint8', { base: 'none', strings: CKSUM_STATUS }],
    ['icmp.unused', 'Unused', 'bytes'],
    ['icmp.ident', 'Identifier (BE)', 'uint16', { base: 'dec_hex' }],
    ['icmp.ident_le', 'Identifier (LE)', 'uint16', { base: 'dec_hex' }],
    ['icmp.seq', 'Sequence Number (BE)', 'uint16', { base: 'dec_hex' }],
    ['icmp.seq_le', 'Sequence Number (LE)', 'uint16', { base: 'dec_hex' }],
    ['icmp.mtu', 'MTU of next hop', 'uint16'],
    ['icmp.pointer', 'Pointer', 'uint32'],
    ['icmp.redir_gw', 'Gateway Address', 'ipv4'],
    ['icmp.num_addrs', 'Number of addresses', 'uint8'],
    ['icmp.addr_entry_size', 'Address entry size', 'uint8'],
    ['icmp.lifetime', 'Lifetime', 'uint16'],
    ['icmp.router_address', 'Router address', 'ipv4'],
    ['icmp.pref_level', 'Preference level', 'int32'],
    ['icmp.originate_timestamp', 'Originate Timestamp', 'uint32'],
    ['icmp.receive_timestamp', 'Receive Timestamp', 'uint32'],
    ['icmp.transmit_timestamp', 'Transmit Timestamp', 'uint32'],
    ['icmp.address_mask', 'Address Mask', 'ipv4'],
    ['icmp.length', 'Length', 'uint8'],
    ['icmp.resp_in', 'Response frame', 'framenum'],
    ['icmp.resp_to', 'Request frame', 'framenum'],
    ['icmp.resptime', 'Response time', 'double', { unit: ' ms' }],
    ['icmp.no_resp', 'No response seen', 'none'],
    ['icmp.data', 'ICMP Data', 'bytes'],
    ['icmp.data_time', 'Timestamp from icmp data', 'abs_time'],
    ['icmp.data_time_relative', 'Timestamp from icmp data (relative)', 'rel_time'],
  ],
  experts: [
    ['icmp.checksum_bad', 'warn', 'Checksum', 'Bad checksum'],
    ['icmp.resp_not_found', 'warn', 'Sequence', 'No response seen to ICMP request'],
  ],
  tables: { 'ip.proto': [1] },
  dissect(ctx, off, end) {
    const d = ctx.d;
    ctx.need(off, 4, end);
    const type = d[off], code = d[off + 1], ck = u16(d, off + 2);
    ctx.setProtocol('ICMP');
    const tname = TYPES[type] || 'Unknown ICMP (obsolete or malformed?)';
    const cmap = CODES[type];
    const cname = cmap ? cmap[code] : null;
    const t = ctx.proto('icmp', off, end - off);
    let info = tname;
    if (cname && type !== 9) info += ` (${cname})`;
    if (ctx.tree) {
      ctx.add(t, 'icmp.type', off, 1, type, `Type: ${tname} (${type})`);
      ctx.add(t, 'icmp.code', off + 1, 1, code, cname ? `Code: ${cname} (${code})` : `Code: ${code}`);
      // Wireshark always verifies ICMP checksums when the whole message was captured.
      if (ctx.source === 0 && ctx.frame.len > ctx.frame.caplen) {
        ctx.add(t, 'icmp.checksum', off + 2, 2, ck, `Checksum: ${hexPad(ck, 4)} [unverified]`);
        ctx.gen(t, 'icmp.checksum.status', 2);
      } else {
        const ok = inetChecksum(d, off, end - off) === 0;
        ctx.add(t, 'icmp.checksum', off + 2, 2, ck, `Checksum: ${hexPad(ck, 4)} [${ok ? 'correct' : 'incorrect'}]`);
        ctx.gen(t, 'icmp.checksum.status', ok ? 1 : 0);
        if (!ok) ctx.ei(t, 'icmp.checksum_bad', off + 2, 2);
      }
    } else if (!(ctx.source === 0 && ctx.frame.len > ctx.frame.caplen) && end - off >= 4 && inetChecksum(d, off, end - off) !== 0) {
      ctx.ei(NULLNODE, 'icmp.checksum_bad');
    }
    let o = off + 4;
    switch (type) {
      case 0: case 8: case 13: case 14: case 15: case 16: case 17: case 18: {
        ctx.need(o, 4, end);
        const id = u16(d, o), seq = u16(d, o + 2);
        const idle = ((id & 0xff) << 8) | (id >> 8), seqle = ((seq & 0xff) << 8) | (seq >> 8);
        if (ctx.tree) {
          ctx.add(t, 'icmp.ident', o, 2, id);
          ctx.add(t, 'icmp.ident_le', o, 2, idle);
          ctx.add(t, 'icmp.seq', o + 2, 2, seq);
          ctx.add(t, 'icmp.seq_le', o + 2, 2, seqle);
        }
        o += 4;
        const m = match(ctx, type, id, seq);
        info = `${tname.padEnd(20)} id=0x${id.toString(16).padStart(4, '0')}, seq=${seq}/${seqle}`;
        // Wireshark adds the TTL only when ICMP sits directly on IPv4 (not e.g. behind AH).
        if (ctx.net && ctx.layers[ctx.layers.length - 2] === 'ip') info += `, ttl=${ctx.net.ttl}`;
        if (m.in) { info += ` (reply in ${m.in})`; ctx.gen(t, 'icmp.resp_in', m.in, `Response frame: ${m.in}`); }
        else if (m.to) {
          info += ` (request in ${m.to})`;
          ctx.gen(t, 'icmp.resp_to', m.to, `Request frame: ${m.to}`);
          ctx.gen(t, 'icmp.resptime', m.time, `Response time: ${m.time.toFixed(3)} ms`);
        } else if (type === 8 || type === 13 || type === 15 || type === 17) {
          info += ' (no response found!)';
          if (ctx.tree) {
            const n = ctx.gen(t, 'icmp.no_resp', null, 'No response seen');
            ctx.ei(n, 'icmp.resp_not_found');
          } else ctx.ei(NULLNODE, 'icmp.resp_not_found');
        }
        if (type === 13 || type === 14) {
          ctx.need(o, 12, end);
          ctx.add(t, 'icmp.originate_timestamp', o, 4, u32(d, o), `Originate timestamp: ${u32(d, o)}`);
          ctx.add(t, 'icmp.receive_timestamp', o + 4, 4, u32(d, o + 4));
          ctx.add(t, 'icmp.transmit_timestamp', o + 8, 4, u32(d, o + 8));
          o += 12;
        } else if (type === 17 || type === 18) {
          ctx.need(o, 4, end);
          ctx.add(t, 'icmp.address_mask', o, 4, ip4(d, o));
          o += 4;
        } else if ((type === 0 || type === 8) && o < end) {
          // ICMP Data wraps the optional ping timestamp and the remaining bytes (a 'data' layer).
          const dn = ctx.add(t, 'icmp.data', o, end - o, d.subarray(o, end));
          const o2 = echoTimestamp(ctx, dn, o, end);
          ctx.setInfo(info);
          if (o2 < end) dataUnder(ctx, dn, o2, end);
          return end - off;
        }
        ctx.setInfo(info);
        if (o < end) ctx.data(o, end);
        return end - off;
      }
      case 3: case 4: case 5: case 11: case 12: {
        ctx.need(o, 4, end);
        if (type === 5) ctx.add(t, 'icmp.redir_gw', o, 4, ip4(d, o));
        else if (type === 12) ctx.add(t, 'icmp.pointer', o, 1, d[o]);
        else if (type === 3 && code === 4) {
          ctx.add(t, 'icmp.unused', o, 2, d.subarray(o, o + 2));
          ctx.add(t, 'icmp.mtu', o + 2, 2, u16(d, o + 2));
        } else ctx.add(t, 'icmp.unused', o, 4, d.subarray(o, o + 4));
        o += 4;
        ctx.setInfo(info);
        if (o < end) embedded(ctx, o, end);
        return end - off;
      }
      case 9: {
        ctx.need(o, 4, end);
        const n = d[o], sz = d[o + 1];
        ctx.add(t, 'icmp.num_addrs', o, 1, n);
        ctx.add(t, 'icmp.addr_entry_size', o + 1, 1, sz);
        ctx.add(t, 'icmp.lifetime', o + 2, 2, u16(d, o + 2), `Lifetime: ${u16(d, o + 2)}s`);
        o += 4;
        for (let i = 0; i < n && o + 8 <= end; i++, o += sz * 4) {
          ctx.add(t, 'icmp.router_address', o, 4, ip4(d, o));
          ctx.add(t, 'icmp.pref_level', o + 4, 4, u32(d, o + 4) | 0);
        }
        ctx.setInfo(info);
        return end - off;
      }
      case 10:
        ctx.add(t, 'icmp.unused', o, Math.min(4, end - o), d.subarray(o, Math.min(o + 4, end)));
        ctx.setInfo(info);
        return end - off;
      default:
        ctx.setInfo(info);
        if (o < end) ctx.data(o, end);
        return end - off;
    }
  },
});

/** 'data' layer whose tree hangs below a parent item instead of the top level. */
function dataUnder(ctx, parent, o, end) {
  const n = ctx.subProto(parent, 'data', o, end - o, `Data (${end - o} bytes)`);
  if (ctx.tree) {
    ctx.add(n, 'data.data', o, end - o, ctx.d.subarray(o, end));
    ctx.gen(n, 'data.len', end - o, `Length: ${end - o}`);
  }
}

/** Request/response pairing on the first pass (key: addresses, id, seq). */
function match(ctx, type, id, seq) {
  const fd = ctx.fd;
  if (ctx.first && !ctx.inError && ctx.net) {
    const st = ctx.session.st('icmp', () => new Map());
    const req = type === 8 || type === 13 || type === 15 || type === 17;
    const a = ctx.net.src, b = ctx.net.dst;
    const key = (req ? a + '>' + b : b + '>' + a) + '#' + id + '#' + seq + '#' + (req ? type : type === 0 ? 8 : type - 1);
    if (req) st.set(key, { no: ctx.no, rel: ctx.fd.rel, resp: 0 });
    else {
      const r = st.get(key);
      if (r && !r.resp) {
        r.resp = ctx.no;
        ctx.session._fd(r.no).icmpIn = ctx.no;
        fd.icmpTo = r.no;
        fd.icmpTime = (ctx.fd.rel - r.rel) * 1000;
      }
    }
  }
  return { in: fd.icmpIn || 0, to: fd.icmpTo || 0, time: fd.icmpTime || 0 };
}

/** Linux/BSD ping put a struct timeval at the start of the data; show it when it is plausible. */
function echoTimestamp(ctx, t, o, end) {
  const d = ctx.d;
  const fs = ctx.frame.sec;
  if (end - o >= 16) {
    const s = u32le(d, o), sh = u32le(d, o + 4), us = u32le(d, o + 8), ush = u32le(d, o + 12);
    if (sh === 0 && ush === 0 && us < 1000000 && Math.abs(s - fs) <= 86400) return tsItem(ctx, t, o, 16, s, us * 1000);
  }
  if (end - o >= 8) {
    const s = u32le(d, o), us = u32le(d, o + 4);
    if (us < 1000000 && Math.abs(s - fs) <= 86400) return tsItem(ctx, t, o, 8, s, us * 1000);
    const sb = u32(d, o), usb = u32(d, o + 4);
    if (usb < 1000000 && Math.abs(sb - fs) <= 86400) return tsItem(ctx, t, o, 8, sb, usb * 1000);
  }
  return o;
}
function tsItem(ctx, t, o, len, sec, nsec) {
  ctx.add(t, 'icmp.data_time', o, len, { sec, nsec });
  const rel = (ctx.frame.sec - sec) + (ctx.frame.nsec - nsec) / 1e9;
  ctx.gen(t, 'icmp.data_time_relative', rel);
  return o + len;
}

/** Dissect the IP header + start of the offending datagram without touching session state or columns. */
export function embedded(ctx, o, end) {
  const save = {
    protocol: ctx.protocol, info: ctx.info, infoOwner: ctx.infoOwner, netSrc: ctx.netSrc, netDst: ctx.netDst,
    srcport: ctx.srcport, dstport: ctx.dstport, ptype: ctx.ptype, net: ctx.net, inError: ctx.inError,
    tcpStream: ctx.tcpStream, udpStream: ctx.udpStream,
  };
  ctx.inError = true;
  try {
    const v = ctx.d[o] >> 4;
    if (v === 4) ctx.call('ip', o, end);
    else if (v === 6) ctx.call('ipv6', o, end);
    else ctx.data(o, end);
  } finally {
    Object.assign(ctx, save);
  }
}
