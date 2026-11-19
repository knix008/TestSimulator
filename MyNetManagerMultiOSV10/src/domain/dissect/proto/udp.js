// UDP: header, checksum, stream index, port/conversation/heuristic dispatch.
import { registerProtocol, getProtocol, u16, hexPad } from '../core.js';
import { portLabel } from '../names.js';
import { pseudoChecksum, CKSUM_STATUS } from './ip.js';

registerProtocol({
  abbrev: 'udp', name: 'User Datagram Protocol', short: 'UDP',
  fields: [
    ['udp.srcport', 'Source Port', 'uint16'],
    ['udp.dstport', 'Destination Port', 'uint16'],
    ['udp.port', 'Source or Destination Port', 'uint16'],
    ['udp.length', 'Length', 'uint16'],
    ['udp.checksum', 'Checksum', 'uint16', { base: 'hex' }],
    ['udp.checksum_calculated', 'Calculated Checksum', 'uint16', { base: 'hex' }],
    ['udp.checksum.status', 'Checksum Status', 'uint8', { base: 'none', strings: CKSUM_STATUS }],
    ['udp.stream', 'Stream index', 'uint32'],
    ['udp.stream.pnum', 'Stream Packet Number', 'uint32'],
    ['udp.time_relative', 'Time since first frame', 'rel_time'],
    ['udp.time_delta', 'Time since previous frame', 'rel_time'],
    ['udp.payload', 'Payload', 'bytes'],
  ],
  experts: [
    ['udp.length.bad', 'error', 'Malformed', 'Bad length value'],
    ['udp.checksum.bad', 'error', 'Checksum', 'Bad checksum'],
    ['udp.checksum.zero', 'error', 'Protocol', 'Illegal checksum value (0)'],
    ['udp.possible_traceroute', 'chat', 'Sequence', 'Possible traceroute'],
  ],
  tables: { 'ip.proto': [17] },
  dissect(ctx, off, end) {
    const d = ctx.d;
    ctx.need(off, 8, end);
    const sp = u16(d, off), dp = u16(d, off + 2), ulen = u16(d, off + 4), ck = u16(d, off + 6);
    const inErr = ctx.inError;
    ctx.setProtocol('UDP');
    if (!inErr) { ctx.ptype = 'udp'; ctx.srcport = sp; ctx.dstport = dp; }
    const res = ctx.resolve;
    const t = ctx.proto('udp', off, 8, `User Datagram Protocol, Src Port: ${portLabel(sp, 'udp', res)}, Dst Port: ${portLabel(dp, 'udp', res)}`);
    const net = ctx.net;
    let st;
    if (!inErr) {
      st = ctx.fd.udp;
      if (ctx.first) {
        const S = ctx.session.st('udp', () => ({ convs: new Map(), count: 0 }));
        const a = (net ? net.src : '') + ':' + sp, b = (net ? net.dst : '') + ':' + dp;
        const key = a < b ? a + '-' + b : b + '-' + a;
        let c = S.convs.get(key);
        if (!c) S.convs.set(key, c = { index: S.count++, first: ctx.fd.rel, last: ctx.fd.rel, pnum: 0 });
        c.pnum++;
        st = ctx.fd.udp = { stream: c.index, pnum: c.pnum, rel: ctx.fd.rel - c.first, delta: ctx.fd.rel - c.last };
        c.last = ctx.fd.rel;
      }
      ctx.udpStream = st.stream;
    } else if (net) {
      // The datagram quoted in an ICMP error belongs to a known conversation: show its index (no new state).
      const S = ctx.session.st('udp', () => ({ convs: new Map(), count: 0 }));
      const a = net.src + ':' + sp, b = net.dst + ':' + dp;
      const c = S.convs.get(a < b ? a + '-' + b : b + '-' + a);
      if (c) st = { stream: c.index, pnum: 0, rel: 0, delta: 0, quoted: true };
    }
    let pend = end;
    let badLen = false;
    if (ulen < 8) badLen = true;
    else if (off + ulen <= end) pend = off + ulen;
    else if (!(ctx.source === 0 && ctx.frame.len > ctx.frame.caplen)) badLen = true; // longer than the IP payload
    if (ctx.tree) {
      ctx.add(t, 'udp.srcport', off, 2, sp, 'Source Port: ' + portLabel(sp, 'udp', res));
      ctx.add(t, 'udp.dstport', off + 2, 2, dp, 'Destination Port: ' + portLabel(dp, 'udp', res));
      ctx.hidden(t, 'udp.port', off, 2, sp);
      ctx.hidden(t, 'udp.port', off + 2, 2, dp);
      const ln = ctx.add(t, 'udp.length', off + 4, 2, ulen);
      if (badLen && !inErr) ctx.ei(ln, 'udp.length.bad', off + 4, 2, `Bad length value ${ulen} ${ulen < 8 ? '< 8' : `> IP payload length`}`);
      if (ck === 0) {
        ctx.add(t, 'udp.checksum', off + 6, 2, ck, `Checksum: 0x0000 [zero-value ignored]`);
        ctx.gen(t, 'udp.checksum.status', 3);
      } else if (ctx.session.prefs.udp.checksum && net && !inErr && ctx.frame.len === ctx.frame.caplen) {
        const c = pseudoChecksum(net, 17, d, off, pend - off);
        ctx.add(t, 'udp.checksum', off + 6, 2, ck, `Checksum: ${hexPad(ck, 4)} [${c === 0 ? 'correct' : 'incorrect'}]`);
        ctx.gen(t, 'udp.checksum.status', c === 0 ? 1 : 0);
        if (c !== 0) ctx.ei(t, 'udp.checksum.bad', off + 6, 2);
      } else {
        ctx.add(t, 'udp.checksum', off + 6, 2, ck, `Checksum: ${hexPad(ck, 4)} [unverified]`);
        ctx.gen(t, 'udp.checksum.status', 2);
      }
      if (st) {
        ctx.gen(t, 'udp.stream', st.stream);
        if (!st.quoted) {
          ctx.gen(t, 'udp.stream.pnum', st.pnum);
          const ts = ctx.text(t, '[Timestamps]');
          ctx.gen(ts, 'udp.time_relative', st.rel);
          ctx.gen(ts, 'udp.time_delta', st.delta);
        }
      }
    }
    const plen = pend - off - 8;
    ctx.setInfo(`${sp} → ${dp} Len=${plen < 0 ? 0 : plen}`);
    ctx.infoOwner = 'udp';
    if (badLen && ulen < 8) return end - off;
    if (plen > 0) {
      if (ctx.tree) ctx.add(t, 'udp.payload', off + 8, plen, d.subarray(off + 8, pend), `UDP payload (${plen} byte${plen === 1 ? '' : 's'})`);
      udpPayload(ctx, net, sp, dp, off + 8, pend);
    }
    return pend - off;
  },
});

/** Dispatch order as in Wireshark: conversation, lower port, higher port, heuristics, data. */
function udpPayload(ctx, net, sp, dp, off, end) {
  const s = ctx.session;
  if (net) {
    const cp = s.conversationProto('udp', net.dst, dp, ctx.no) || s.conversationProto('udp', net.src, sp, ctx.no);
    if (cp) { const p = getProtocol(cp); if (p && ctx.call(p, off, end) !== false) return; }
  }
  const lo = sp < dp ? sp : dp, hi = sp < dp ? dp : sp;
  if (ctx.dispatch('udp.port', lo, off, end)) return;
  if (hi !== lo && ctx.dispatch('udp.port', hi, off, end)) return;
  const h = ctx.heuristic('udp', off, end);
  if (h && ctx.call(h, off, end) !== false) return;
  ctx.data(off, end);
}
