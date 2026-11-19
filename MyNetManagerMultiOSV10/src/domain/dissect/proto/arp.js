// ARP / RARP.
import { registerProtocol, u16, mac, ip4, hexStr } from '../core.js';
import { ETHERTYPES } from '../names.js';

const OPCODES = { 0: 'reserved', 1: 'request', 2: 'reply', 3: 'reverse request', 4: 'reverse reply', 5: 'drarp request', 6: 'drarp reply', 7: 'drarp error', 8: 'inverse request', 9: 'inverse reply', 10: 'arp nak' };
const HWTYPES = { 1: 'Ethernet', 6: 'IEEE 802', 7: 'ARCNET', 15: 'Frame Relay DLCI', 16: 'ATM', 17: 'HDLC', 18: 'Fibre Channel', 19: 'ATM (RFC 2225)', 20: 'Serial Line', 24: 'IEEE 1394.1995', 27: 'EUI-64', 32: 'InfiniBand' };

registerProtocol({
  abbrev: 'arp', name: 'Address Resolution Protocol', short: 'ARP',
  fields: [
    ['arp.hw.type', 'Hardware type', 'uint16', { strings: HWTYPES }],
    ['arp.proto.type', 'Protocol type', 'uint16', { base: 'hex', strings: ETHERTYPES }],
    ['arp.hw.size', 'Hardware size', 'uint8'],
    ['arp.proto.size', 'Protocol size', 'uint8'],
    ['arp.opcode', 'Opcode', 'uint16', { strings: OPCODES }],
    ['arp.isgratuitous', 'Is gratuitous', 'bool'],
    ['arp.isprobe', 'Is probe', 'bool'],
    ['arp.isannouncement', 'Is announcement', 'bool'],
    ['arp.src.hw', 'Sender hardware address', 'bytes'],
    ['arp.src.hw_mac', 'Sender MAC address', 'ether'],
    ['arp.src.proto', 'Sender protocol address', 'bytes'],
    ['arp.src.proto_ipv4', 'Sender IP address', 'ipv4'],
    ['arp.dst.hw', 'Target hardware address', 'bytes'],
    ['arp.dst.hw_mac', 'Target MAC address', 'ether'],
    ['arp.dst.proto', 'Target protocol address', 'bytes'],
    ['arp.dst.proto_ipv4', 'Target IP address', 'ipv4'],
    ['arp.duplicate-address-frame', 'Frame showing earlier use of IP address', 'framenum'],
    ['arp.seconds-since-duplicate-address-frame', 'Seconds since earlier frame seen', 'uint32'],
  ],
  experts: [
    ['arp.duplicate-address-detected', 'warn', 'Sequence', 'Duplicate IP address configured'],
  ],
  tables: { ethertype: [0x0806, 0x8035] },
  dissect(ctx, off, end) {
    const d = ctx.d;
    ctx.need(off, 8, end);
    const htype = u16(d, off), ptype = u16(d, off + 2), hlen = d[off + 4], plen = d[off + 5], op = u16(d, off + 6);
    const rarp = op === 3 || op === 4;
    const tot = 8 + 2 * hlen + 2 * plen;
    ctx.need(off, tot, end);
    const sha = off + 8, spa = sha + hlen, tha = spa + plen, tpa = tha + hlen;
    const isEth = hlen === 6 && (htype === 1 || htype === 6);
    const isIp = plen === 4 && ptype === 0x0800;
    const sMac = isEth ? mac(d, sha) : hexStr(d, sha, hlen, ':');
    const tMac = isEth ? mac(d, tha) : hexStr(d, tha, hlen, ':');
    const sIp = isIp ? ip4(d, spa) : hexStr(d, spa, plen, ':');
    const tIp = isIp ? ip4(d, tpa) : hexStr(d, tpa, plen, ':');
    const proto = rarp ? 'RARP' : 'ARP';
    ctx.setProtocol(proto);
    // Gratuitous / probe / announcement (RFC 5227)
    const grat = isIp && sIp === tIp && sIp !== '0.0.0.0';
    const probe = isIp && op === 1 && sIp === '0.0.0.0' && tMac === '00:00:00:00:00:00';
    const announce = grat && op === 1 && tMac === '00:00:00:00:00:00';
    let info, kind = OPCODES[op] || 'unknown';
    switch (op) {
      case 1:
        if (probe) info = `Who has ${tIp}? (ARP Probe)`;
        else if (announce) info = `ARP Announcement for ${sIp}`;
        else if (grat) info = `Gratuitous ARP for ${sIp} (Request)`;
        else info = `Who has ${tIp}? Tell ${sIp}`;
        break;
      case 2:
        info = grat ? `Gratuitous ARP for ${sIp} (Reply)` : `${sIp} is at ${sMac}`;
        break;
      case 3: info = `Who is ${tMac}? Tell ${sMac}`; break;
      case 4: info = `${tMac} is at ${tIp}`; break;
      case 8: info = `Who is ${tMac}? Tell ${sMac}`; break;
      case 9: info = `${sMac} is at ${sIp}`; break;
      default: info = `Unknown ARP opcode 0x${op.toString(16).padStart(4, '0')}`;
    }
    ctx.setInfo(info);
    let label = rarp ? 'Reverse Address Resolution Protocol' : 'Address Resolution Protocol';
    label += ` (${grat && op === 1 && !announce ? 'request/gratuitous ARP' : grat && op === 2 ? 'reply/gratuitous ARP' : probe ? 'ARP Probe' : announce ? 'ARP Announcement' : kind})`;
    const t = ctx.proto('arp', off, tot, label);
    // duplicate address detection: same IP claimed by a different MAC
    let dup = ctx.fd.arpDup;
    if (ctx.first && isIp && isEth) {
      // Like Wireshark: the first MAC seen for an IP (as sender or target) is kept; a later different
      // MAC is a duplicate. A plain reply flagged via its sender gets no Info suffix.
      const st = ctx.session.st('arp', () => new Map());
      const valid = (m, ip) => ip !== '0.0.0.0' && m !== '00:00:00:00:00:00' && !(parseInt(m.slice(0, 2), 16) & 1);
      const check = (m, ip, viaSender) => {
        if (!valid(m, ip)) return false;
        const prev = st.get(ip);
        if (!prev) { st.set(ip, { mac: m, frame: ctx.no, sec: ctx.frame.sec }); return false; }
        if (prev.mac === m) { prev.frame = ctx.no; prev.sec = ctx.frame.sec; return false; }
        ctx.fd.arpDup = dup = { ip, smac: m, frame: prev.frame, mac: prev.mac, secs: ctx.frame.sec - prev.sec, info: !(viaSender && op === 2 && !grat) };
        return true;
      };
      if (!check(sMac, sIp, true)) check(tMac, tIp, false);
    }
    if (ctx.tree) {
      ctx.add(t, 'arp.hw.type', off, 2, htype);
      ctx.add(t, 'arp.proto.type', off + 2, 2, ptype);
      ctx.add(t, 'arp.hw.size', off + 4, 1, hlen);
      ctx.add(t, 'arp.proto.size', off + 5, 1, plen);
      ctx.add(t, 'arp.opcode', off + 6, 2, op);
      if (grat || probe || announce) {
        ctx.gen(t, 'arp.isgratuitous', grat);
        ctx.gen(t, 'arp.isprobe', probe);
        ctx.gen(t, 'arp.isannouncement', announce);
      }
      if (isEth) ctx.add(t, 'arp.src.hw_mac', sha, 6, sMac, `Sender MAC address: ${ctx.resolve.mac ? `${macRes(sMac)} (${sMac})` : sMac}`);
      else ctx.add(t, 'arp.src.hw', sha, hlen, d.subarray(sha, sha + hlen));
      if (isIp) ctx.add(t, 'arp.src.proto_ipv4', spa, 4, sIp);
      else ctx.add(t, 'arp.src.proto', spa, plen, d.subarray(spa, spa + plen));
      if (isEth) ctx.add(t, 'arp.dst.hw_mac', tha, 6, tMac, `Target MAC address: ${ctx.resolve.mac ? `${macRes(tMac)} (${tMac})` : tMac}`);
      else ctx.add(t, 'arp.dst.hw', tha, hlen, d.subarray(tha, tha + hlen));
      if (isIp) ctx.add(t, 'arp.dst.proto_ipv4', tpa, 4, tIp);
      else ctx.add(t, 'arp.dst.proto', tpa, plen, d.subarray(tpa, tpa + plen));
    }
    if (dup) {
      const box = ctx.text(t, `[Duplicate IP address detected for ${dup.ip} (${dup.smac}) - also in use by ${dup.mac} (frame ${dup.frame})]`);
      ctx.gen(box, 'arp.duplicate-address-frame', dup.frame);
      ctx.gen(box, 'arp.seconds-since-duplicate-address-frame', dup.secs);
      ctx.ei(box, 'arp.duplicate-address-detected', 0, 0, `Duplicate IP address configured (${dup.ip})`);
      if (dup.info) ctx.appendInfo(` (duplicate use of ${dup.ip} detected!)`);
    }
    return tot;
  },
});

import { resolveMac as macRes } from '../names.js';
