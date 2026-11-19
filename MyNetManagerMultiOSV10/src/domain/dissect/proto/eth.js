// Link layers: Ethernet II / 802.3 + LLC/SNAP, 802.1Q/802.1ad, Linux SLL/SLL2, NULL/LOOP, raw IP.
import { registerProtocol, addToTable, u16, u32, u32le, u24, mac, ip4, hexPad, NULLNODE } from '../core.js';
import { resolveMac, ouiVendor, ETHERTYPES } from '../names.js';
import { streamIndex } from './ip.js';

const LG_TFS = ['Locally administered address (this is NOT the factory default)', 'Globally unique address (factory default)'];
const IG_TFS = ['Group address (multicast/broadcast)', 'Individual address (unicast)'];

function addrLabel(ctx, m) { return ctx.resolve.mac ? `${resolveMac(m)} (${m})` : m; }

registerProtocol({
  abbrev: 'eth', name: 'Ethernet', short: 'Ethernet',
  fields: [
    ['eth.dst', 'Destination', 'ether'],
    ['eth.dst_resolved', 'Destination (resolved)', 'string'],
    ['eth.dst.oui', 'Destination OUI', 'uint24', { base: 'hex' }],
    ['eth.dst.oui_resolved', 'Destination OUI (resolved)', 'string'],
    ['eth.src', 'Source', 'ether'],
    ['eth.src_resolved', 'Source (resolved)', 'string'],
    ['eth.src.oui', 'Source OUI', 'uint24', { base: 'hex' }],
    ['eth.src.oui_resolved', 'Source OUI (resolved)', 'string'],
    ['eth.len', 'Length', 'uint16'],
    ['eth.type', 'Type', 'uint16', { base: 'hex', strings: ETHERTYPES }],
    ['eth.addr', 'Address', 'ether'],
    ['eth.addr_resolved', 'Address (resolved)', 'string'],
    ['eth.addr.oui', 'Address OUI', 'uint24', { base: 'hex' }],
    ['eth.addr.oui_resolved', 'Address OUI (resolved)', 'string'],
    ['eth.padding', 'Padding', 'bytes'],
    ['eth.trailer', 'Trailer', 'bytes'],
    ['eth.fcs', 'Frame check sequence', 'uint32', { base: 'hex' }],
    ['eth.dst.lg', 'LG bit', 'bool', { mask: 0x20000, bits: 24, tfs: LG_TFS }],
    ['eth.dst.ig', 'IG bit', 'bool', { mask: 0x10000, bits: 24, tfs: IG_TFS }],
    ['eth.src.lg', 'LG bit', 'bool', { mask: 0x20000, bits: 24, tfs: LG_TFS }],
    ['eth.src.ig', 'IG bit', 'bool', { mask: 0x10000, bits: 24, tfs: IG_TFS }],
    ['eth.lg', 'LG bit', 'bool', { mask: 0x20000, bits: 24, tfs: LG_TFS }],
    ['eth.ig', 'IG bit', 'bool', { mask: 0x10000, bits: 24, tfs: IG_TFS }],
    ['eth.stream', 'Stream index', 'uint32'],
  ],
  experts: [
    ['eth.len.past_end', 'warn', 'Malformed', 'Length field value goes past the end of the payload'],
    ['eth.src_not_group', 'warn', 'Protocol', 'Source MAC must not be a group address: IEEE 802.3-2002, Section 3.2.3(b)'],
  ],
  tables: { linktype: [1] },
  dissect(ctx, off, end) {
    const d = ctx.d;
    ctx.need(off, 14, end);
    const dst = mac(d, off), src = mac(d, off + 6);
    const type = u16(d, off + 12);
    ctx.setHw(src, dst);
    ctx.setProtocol(type <= 1500 ? '802.3' : 'Ethernet');  // overwritten by upper layers
    if (!ctx.info) ctx.setInfo('');
    const ii = type > 1500;
    const stream = streamIndex(ctx, src < dst ? src + dst : dst + src, 'ethStream');
    const t = ctx.proto('eth', off, 14,
      `${ii ? 'Ethernet II' : 'IEEE 802.3 Ethernet'}, Src: ${addrLabel(ctx, src)}, Dst: ${addrLabel(ctx, dst)}`);
    ctx.vars.ethNode = t;
    if (ctx.tree) {
      addAddr(ctx, t, 'dst', dst, off);
      addAddr(ctx, t, 'src', src, off + 6);
      if (d[off + 6] & 1) ctx.ei(t, 'eth.src_not_group', off + 6, 6);
    }
    if (!ii) {
      ctx.add(t, 'eth.len', off + 12, 2, type);
      ctx.gen(t, 'eth.stream', stream);
      let pend = off + 14 + type;
      if (pend > end) { ctx.ei(t, 'eth.len.past_end', off + 12, 2); pend = end; }
      // Novell raw 802.3 starts with 0xffff (IPX checksum); everything else is LLC.
      if (d[off + 14] === 0xff && d[off + 15] === 0xff) ctx.data(off + 14, pend);
      else ctx.call('llc', off + 14, pend);
      trailer(ctx, t, pend, end);
      return end - off;
    }
    ctx.add(t, 'eth.type', off + 12, 2, type);
    ctx.gen(t, 'eth.stream', stream);
    const used = ethertype(ctx, type, off + 14, end);
    trailer(ctx, t, used, end);
    return end - off;
  },
});

function addAddr(ctx, t, dir, m, o) {
  const n = ctx.add(t, `eth.${dir}`, o, 6, m, `${dir === 'dst' ? 'Destination' : 'Source'}: ${addrLabel(ctx, m)}`);
  const r = resolveMac(m);
  const oui = u24(ctx.d, o);
  const vend = ouiVendor(m);
  ctx.hidden(n, `eth.${dir}_resolved`, o, 6, r);
  ctx.hidden(n, `eth.${dir}.oui`, o, 3, oui);
  if (vend) ctx.hidden(n, `eth.${dir}.oui_resolved`, o, 3, vend);
  ctx.hidden(n, 'eth.addr', o, 6, m);
  ctx.hidden(n, 'eth.addr_resolved', o, 6, r);
  ctx.hidden(n, 'eth.addr.oui', o, 3, oui);
  if (vend) ctx.hidden(n, 'eth.addr.oui_resolved', o, 3, vend);
  ctx.bits(n, o, 3, oui, [`eth.${dir}.lg`, `eth.${dir}.ig`]);
  ctx.hidden(n, 'eth.lg', o, 3, (oui & 0x20000) !== 0);
  ctx.hidden(n, 'eth.ig', o, 3, (oui & 0x10000) !== 0);
}

/** Trailing bytes after the upper layer's PDU: zero padding to 60 bytes, otherwise trailer. */
function trailer(ctx, t, used, end) {
  if (typeof used !== 'number' || used >= end || t === NULLNODE) return;
  const d = ctx.d;
  let zero = true;
  for (let i = used; i < end; i++) if (d[i]) { zero = false; break; }
  if (zero || ctx.frame.len <= 60) ctx.add(t, 'eth.padding', used, end - used, d.subarray(used, end));
  else ctx.add(t, 'eth.trailer', used, end - used, d.subarray(used, end));
}

/**
 * Dispatch through the ethertype table with Wireshark's 'ethertype' layer.
 * Returns the absolute end offset of what the upper layer consumed (for padding), or undefined.
 */
export function ethertype(ctx, type, off, end) {
  ctx.layers.push('ethertype');
  const p = ctx.lookup('ethertype', type);
  if (!p) {
    ctx.setProtocol(ctx.protocol || 'Ethernet');
    ctx.setInfo(`Ethernet II`);
    ctx.data(off, end);
    return end;
  }
  const r = ctx.call(p, off, end);
  if (r === false) { ctx.data(off, end); return end; }
  return typeof r === 'number' ? off + r : end;
}

// --- 802.1Q / 802.1ad ---------------------------------------------------------------------
const VLAN_PRI = { 0: 'Best Effort (default)', 1: 'Background', 2: 'Excellent Effort', 3: 'Critical Applications', 4: 'Video, < 100ms latency and jitter', 5: 'Voice, < 10ms latency and jitter', 6: 'Internetwork Control', 7: 'Network Control' };
registerProtocol({
  abbrev: 'vlan', name: '802.1Q Virtual LAN', short: '802.1Q',
  fields: [
    ['vlan.priority', 'Priority', 'uint16', { mask: 0xe000, strings: VLAN_PRI, bits: 16 }],
    ['vlan.dei', 'DEI', 'bool', { mask: 0x1000, bits: 16, tfs: ['Eligible', 'Ineligible'] }],
    ['vlan.id', 'ID', 'uint16', { mask: 0x0fff, bits: 16 }],
    ['vlan.etype', 'Type', 'uint16', { base: 'hex', strings: ETHERTYPES }],
    ['vlan.len', 'Length', 'uint16'],
    ['vlan.trailer', 'Trailer', 'bytes'],
  ],
  experts: [['vlan.too_many_tags', 'warn', 'Undecoded', 'Too many nested VLAN tags']],
  tables: { ethertype: [0x8100, 0x9100] },
  dissect(ctx, off, end) {
    const d = ctx.d;
    ctx.need(off, 4, end);
    const tci = u16(d, off), type = u16(d, off + 2);
    const id = tci & 0xfff, pri = tci >> 13, dei = (tci >> 12) & 1;
    ctx.setProtocol('802.1Q');
    ctx.setInfo(`PRI: ${pri}  DEI: ${dei}  ID: ${id}`);
    const t = ctx.proto('vlan', off, 4, `802.1Q Virtual LAN, PRI: ${pri}, DEI: ${dei}, ID: ${id}`);
    ctx.bits(t, off, 2, tci, ['vlan.priority', 'vlan.dei', 'vlan.id']);
    ctx.vars.vlan = id;
    if (type <= 1500) {
      ctx.add(t, 'vlan.len', off + 2, 2, type);
      ctx.call('llc', off + 4, Math.min(end, off + 4 + type));
      return end - off;
    }
    ctx.add(t, 'vlan.etype', off + 2, 2, type);
    const used = ethertype(ctx, type, off + 4, end);
    return used - off;
  },
});
registerProtocol({
  abbrev: 'ieee8021ad', name: 'IEEE 802.1ad', short: '802.1ad',
  fields: [
    ['ieee8021ad.priority', 'Priority', 'uint16', { mask: 0xe000, bits: 16 }],
    ['ieee8021ad.dei', 'DEI', 'uint16', { mask: 0x1000, bits: 16 }],
    ['ieee8021ad.id', 'ID', 'uint16', { mask: 0x0fff, bits: 16 }],
  ],
  tables: { ethertype: [0x88a8] },
  dissect(ctx, off, end) {
    const d = ctx.d;
    ctx.need(off, 4, end);
    const tci = u16(d, off), type = u16(d, off + 2);
    ctx.setProtocol('802.1ad');
    const t = ctx.proto('ieee8021ad', off, 4, `IEEE 802.1ad, ID: ${tci & 0xfff}`);
    ctx.bits(t, off, 2, tci, ['ieee8021ad.priority', 'ieee8021ad.dei', 'ieee8021ad.id']);
    ctx.add(t, 'vlan.etype', off + 2, 2, type);
    const used = ethertype(ctx, type, off + 4, end);
    return used - off;
  },
});

// --- LLC / SNAP ------------------------------------------------------------------------------
const DSAP = { 0: 'NULL LSAP', 2: 'LLC Sub-Layer Management', 6: 'TCP/IP', 66: 'Spanning Tree BPDU', 152: 'ARP', 170: 'SNAP', 224: 'NetWare', 240: 'NetBIOS', 254: 'ISO Network Layer', 255: 'Global LSAP' };
const OUI_NAMES = { 0: 'Encapsulated Ethernet', 0x00000c: 'Cisco Systems, Inc', 0x0080c2: 'IEEE 802.1 Registration Authority', 0x00e02b: 'Extreme Networks' };
registerProtocol({
  abbrev: 'llc', name: 'Logical-Link Control', short: 'LLC',
  fields: [
    ['llc.dsap', 'DSAP', 'uint8', { base: 'hex', strings: DSAP }],
    ['llc.dsap.sap', 'SAP', 'uint8', { base: 'hex', mask: 0xfe, strings: DSAP }],
    ['llc.dsap.ig', 'IG Bit', 'bool', { mask: 0x01, bits: 8, tfs: ['Group', 'Individual'] }],
    ['llc.ssap', 'SSAP', 'uint8', { base: 'hex', strings: DSAP }],
    ['llc.ssap.sap', 'SAP', 'uint8', { base: 'hex', mask: 0xfe, strings: DSAP }],
    ['llc.ssap.cr', 'CR Bit', 'bool', { mask: 0x01, bits: 8, tfs: ['Response', 'Command'] }],
    ['llc.control', 'Control', 'uint16', { base: 'hex' }],
    ['llc.control.ftype', 'Frame type', 'uint16', { base: 'hex', mask: 0x3, bits: 8, strings: { 0: 'Information frame', 1: 'Supervisory frame', 2: 'Information frame', 3: 'Unnumbered frame' } }],
    ['llc.type', 'Type', 'uint16', { base: 'hex', strings: ETHERTYPES }],
    ['llc.oui', 'Organization Code', 'uint24', { base: 'hex', strings: OUI_NAMES }],
    ['llc.pid', 'Protocol ID', 'uint16', { base: 'hex' }],
    ['llc.cisco_pid', 'PID', 'uint16', { base: 'hex', strings: { 0x2000: 'CDP', 0x2003: 'VTP', 0x2004: 'DTP', 0x010b: 'PVSTP+', 0x0111: 'UDLD' } }],
  ],
  dissect(ctx, off, end) {
    const d = ctx.d;
    ctx.need(off, 3, end);
    const dsap = d[off], ssap = d[off + 1];
    let ctl = d[off + 2], clen = 1;
    if ((ctl & 3) !== 3) { ctx.need(off, 4, end); ctl = u16(d, off + 2); clen = 2; }
    const snap = dsap === 0xaa && ssap === 0xaa;
    ctx.setProtocol('LLC');
    const hl = 2 + clen + (snap ? 5 : 0);
    const t = ctx.proto('llc', off, hl, 'Logical-Link Control');
    if (ctx.tree) {
      const a = ctx.add(t, 'llc.dsap', off, 1, dsap);
      ctx.bits(a, off, 1, dsap, ['llc.dsap.sap', 'llc.dsap.ig']);
      const b = ctx.add(t, 'llc.ssap', off + 1, 1, ssap);
      ctx.bits(b, off + 1, 1, ssap, ['llc.ssap.sap', 'llc.ssap.cr']);
      const c = ctx.add(t, 'llc.control', off + 2, clen, ctl,
        clen === 1 && ctl === 3 ? 'Control field: U, func=UI (0x03)' : `Control field: ${hexPad(ctl, clen * 2)}`);
      ctx.add(c, 'llc.control.ftype', off + 2, clen, ctl & 3);
    }
    let p = off + 2 + clen;
    if (snap) {
      ctx.need(p, 5, end);
      const oui = u24(d, p), pid = u16(d, p + 3);
      ctx.add(t, 'llc.oui', p, 3, oui);
      if (oui === 0) {
        ctx.add(t, 'llc.type', p + 3, 2, pid);
        if (!ctx.dispatch('ethertype', pid, p + 5, end)) ctx.data(p + 5, end);
        return end - off;
      }
      if (oui === 0x00000c) {
        ctx.add(t, 'llc.cisco_pid', p + 3, 2, pid);
        if (!ctx.dispatch('llc.cisco_pid', pid, p + 5, end)) ctx.data(p + 5, end);
        return end - off;
      }
      ctx.add(t, 'llc.pid', p + 3, 2, pid);
      if (!ctx.dispatch(`llc.oui.${oui}`, pid, p + 5, end)) ctx.data(p + 5, end);
      return end - off;
    }
    if (!ctx.dispatch('llc.dsap', dsap & 0xfe, p, end)) ctx.data(p, end);
    return end - off;
  },
});

// --- Linux cooked capture ---------------------------------------------------------------------
const SLL_PKTTYPE = { 0: 'Unicast to us', 1: 'Broadcast', 2: 'Multicast', 3: 'Unicast to another host', 4: 'Sent by us' };
const SLL_HATYPE = { 1: 'Ethernet', 24: 'IEEE 1394.1995', 772: 'Loopback', 776: 'IPv6-in-IPv4', 778: 'IP GRE', 512: 'PPP', 65534: 'None', 768: 'IPIP tunnel', 801: 'IEEE 802.11', 803: 'IEEE 802.11 + radiotap header' };
const SLL_LTYPE = { 1: 'Novell 802.3', 2: '802.2 LLC', 3: 'Ethernet', 4: '802.2 LLC', 0x0c: 'CAN', 0x0d: 'CAN FD', 0x10: 'Netlink' };
registerProtocol({
  abbrev: 'sll', name: 'Linux cooked-mode capture', short: 'SLL',
  fields: [
    ['sll.pkttype', 'Packet type', 'uint16', { strings: SLL_PKTTYPE }],
    ['sll.hatype', 'Link-layer address type', 'uint16', { strings: SLL_HATYPE }],
    ['sll.halen', 'Link-layer address length', 'uint16'],
    ['sll.src.eth', 'Source', 'ether'],
    ['sll.src.ipv4', 'Source', 'ipv4'],
    ['sll.src.other', 'Source', 'bytes'],
    ['sll.unused', 'Unused', 'bytes'],
    ['sll.ltype', 'Protocol', 'uint16', { base: 'hex', strings: SLL_LTYPE }],
    ['sll.etype', 'Protocol', 'uint16', { base: 'hex', strings: ETHERTYPES }],
    ['sll.ifindex', 'Interface index', 'uint32'],
    ['sll.reserved', 'Reserved', 'bytes'],
    ['sll.trailer', 'Trailer', 'bytes'],
  ],
  tables: { linktype: [113, 276] },
  dissect(ctx, off, end) {
    const d = ctx.d;
    const v2 = ctx.frame.linktype === 276;
    const hl = v2 ? 20 : 16;
    ctx.need(off, hl, end);
    let pkttype, hatype, halen, proto, ifindex, ao;
    if (v2) {
      proto = u16(d, off); ifindex = u32(d, off + 4); hatype = u16(d, off + 8); pkttype = d[off + 10]; halen = d[off + 11]; ao = off + 12;
    } else {
      pkttype = u16(d, off); hatype = u16(d, off + 2); halen = u16(d, off + 4); ao = off + 6; proto = u16(d, off + 14);
    }
    const t = ctx.proto('sll', off, hl, v2 ? 'Linux cooked capture v2' : 'Linux cooked capture v1');
    let src = '';
    if (halen === 6 && hatype !== 772) src = mac(d, ao);
    ctx.setProtocol('SLL');
    if (src) ctx.setHw(src, '');
    if (ctx.tree) {
      if (v2) {
        ctx.add(t, 'sll.etype', off, 2, proto);
        ctx.add(t, 'sll.reserved', off + 2, 2, d.subarray(off + 2, off + 4));
        ctx.add(t, 'sll.ifindex', off + 4, 4, ifindex);
        ctx.add(t, 'sll.hatype', off + 8, 2, hatype);
        ctx.add(t, 'sll.pkttype', off + 10, 1, pkttype);
        ctx.add(t, 'sll.halen', off + 11, 1, halen);
      } else {
        ctx.add(t, 'sll.pkttype', off, 2, pkttype);
        ctx.add(t, 'sll.hatype', off + 2, 2, hatype);
        ctx.add(t, 'sll.halen', off + 4, 2, halen);
      }
      if (src) ctx.add(t, 'sll.src.eth', ao, 6, src);
      else if (halen === 4) ctx.add(t, 'sll.src.ipv4', ao, 4, ip4(d, ao));
      else if (halen > 0 && halen <= 8) ctx.add(t, 'sll.src.other', ao, halen, d.subarray(ao, ao + halen));
      const ul = 8 - Math.min(halen, 8);
      if (ul > 0) ctx.add(t, 'sll.unused', ao + 8 - ul, ul, d.subarray(ao + 8 - ul, ao + 8));
      if (!v2) {
        if (proto <= 1500) ctx.add(t, 'sll.ltype', off + 14, 2, proto);
        else ctx.add(t, 'sll.etype', off + 14, 2, proto);
      }
    }
    const p = off + hl;
    if (proto <= 1500) {
      if (proto === 4 || proto === 2) ctx.call('llc', p, end);
      else ctx.data(p, end);
      return end - off;
    }
    if (hatype === 778 || hatype === 768) { // GRE/IPIP tunnels carry raw protocol numbers
      if (!ctx.dispatch('ethertype', proto, p, end)) ctx.data(p, end);
      return end - off;
    }
    ethertype(ctx, proto, p, end);
    return end - off;
  },
});

// --- NULL / LOOP (BSD loopback) -----------------------------------------------------------------
const AF = { 2: 'IP', 7: 'OSI', 16: 'Appletalk', 23: 'Netware IPX/SPX', 24: 'IPv6', 28: 'IPv6', 30: 'IPv6' };
registerProtocol({
  abbrev: 'null', name: 'Null/Loopback', short: 'NULL',
  fields: [
    ['null.type', 'Type', 'uint16', { base: 'hex', strings: ETHERTYPES }],
    ['null.family', 'Family', 'uint32', { strings: AF }],
  ],
  tables: { linktype: [0, 108] },
  dissect(ctx, off, end) {
    const d = ctx.d;
    ctx.need(off, 4, end);
    // NULL uses host byte order; LOOP (108) is always network order.
    let fam = u32(d, off);
    if (ctx.frame.linktype === 0 && (fam & 0xffff) === 0 && fam !== 0) fam = u32le(d, off);
    const t = ctx.proto('null', off, 4, 'Null/Loopback');
    ctx.setProtocol('NULL');
    if (fam > 1500 && fam <= 0xffff) {
      ctx.add(t, 'null.type', off, 4, fam);
      ethertype(ctx, fam, off + 4, end);
      return end - off;
    }
    ctx.add(t, 'null.family', off, 4, fam);
    const p = off + 4;
    if (fam === 2) ctx.call('ip', p, end);
    else if (fam === 24 || fam === 28 || fam === 30) ctx.call('ipv6', p, end);
    else ctx.data(p, end);
    return end - off;
  },
});

// --- Raw IP --------------------------------------------------------------------------------------
registerProtocol({
  abbrev: 'raw', name: 'Raw packet data', short: 'Raw',
  tables: { linktype: [101, 12, 14] },
  dissect(ctx, off, end) {
    ctx.need(off, 1, end);
    ctx.proto('raw', off, end - off, 'Raw packet data');
    if (ctx.tree) ctx.text(ctx.roots[ctx.roots.length - 1], 'No link information available');
    const v = ctx.d[off] >> 4;
    if (v === 4) ctx.call('ip', off, end);
    else if (v === 6) ctx.call('ipv6', off, end);
    else ctx.data(off, end);
    return end - off;
  },
});
