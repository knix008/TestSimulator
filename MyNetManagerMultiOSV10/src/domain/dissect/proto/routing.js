// Routing and first-hop redundancy: OSPFv2, BGP-4, RIP v1/v2, VRRP v2/v3, HSRP v0/v1.
import { registerProtocol, u16, u24, u32, ip4, hexPad, ascii, NULLNODE } from '../core.js';
import { inetChecksum } from './ip.js';

const NOTSET = ['Set', 'Not set'];

// --- OSPFv2 ----------------------------------------------------------------------------------------
const OSPF_MSG = { 1: 'Hello Packet', 2: 'DB Description', 3: 'LS Request', 4: 'LS Update', 5: 'LS Acknowledge' };
const OSPF_AUTH = { 0: 'Null', 1: 'Simple password', 2: 'Cryptographic' };
const LSA_TYPES = { 1: 'Router-LSA', 2: 'Network-LSA', 3: 'Summary-LSA (IP network)', 4: 'Summary-LSA (ASBR)', 5: 'AS-External-LSA (ASBR)', 6: 'Group Membership LSA', 7: 'NSSA AS-External-LSA', 9: 'Opaque LSA, Link-local scope', 10: 'Opaque LSA, Area-local scope', 11: 'Opaque LSA, AS-wide scope' };
const LINK_TYPES = { 1: 'Point-to-point connection to another router', 2: 'Connection to a transit network', 3: 'Connection to a stub network', 4: 'Virtual link' };
const LINK_SHORT = { 1: 'PTP', 2: 'Transit', 3: 'Stub', 4: 'Virtual' };
const LINK_ID = { 1: 'Neighboring router\'s Router ID', 2: 'IP address of Designated Router', 3: 'IP network/subnet number', 4: 'Neighboring router\'s Router ID' };
const V2OPT = [['dn', 'DN', 0x80, NOTSET], ['o', '(O) Opaque', 0x40, NOTSET], ['dc', '(DC) Demand Circuits', 0x20, ['Supported', 'Not supported']], ['l', '(L) LLS Data block', 0x10, ['Present', 'Not Present']], ['n', '(N) NSSA', 0x08, ['Supported', 'Not supported']], ['mc', '(MC) Multicast', 0x04, ['Capable', 'Not capable']], ['e', '(E) External Routing', 0x02, ['Capable', 'Not capable']], ['mt', '(MT) Multi-Topology Routing', 0x01, ['Yes', 'No']]];
const DBD = [['r', '(R) OOBResync', 0x08, NOTSET], ['i', '(I) Init', 0x04, NOTSET], ['m', '(M) More', 0x02, NOTSET], ['ms', '(MS) Master', 0x01, ['Yes', 'No']]];
const RFLAGS = [['h', '(H) Host', 0x80], ['s', '(S) Shortcut-capable ABR', 0x20], ['n', '(N) NSSA translation', 0x10], ['w', '(W) Wild-card multicast receiver', 0x08], ['v', '(V) Virtual link endpoint', 0x04], ['e', '(E) AS boundary router', 0x02], ['b', '(B) Area border router', 0x01]];

registerProtocol({
  abbrev: 'ospf', name: 'Open Shortest Path First', short: 'OSPF',
  fields: [
    ['ospf.header', 'OSPF Header', 'none'],
    ['ospf.version', 'Version', 'uint8'],
    ['ospf.msg', 'Message Type', 'uint8', { strings: OSPF_MSG }],
    ['ospf.msg.hello', 'Hello', 'bool'],
    ['ospf.msg.dbdesc', 'Database Description', 'bool'],
    ['ospf.msg.lsreq', 'Link State Adv Request', 'bool'],
    ['ospf.msg.lsupdate', 'Link State Adv Update', 'bool'],
    ['ospf.msg.lsack', 'Link State Adv Acknowledgement', 'bool'],
    ['ospf.packet_length', 'Packet Length', 'uint16'],
    ['ospf.srcrouter', 'Source OSPF Router', 'ipv4'],
    ['ospf.area_id', 'Area ID', 'ipv4'],
    ['ospf.checksum', 'Checksum', 'uint16', { base: 'hex' }],
    ['ospf.auth.type', 'Auth Type', 'uint8', { strings: OSPF_AUTH }],
    ['ospf.auth.none', 'Auth Data (none)', 'bytes'],
    ['ospf.auth.simple', 'Auth Data (Simple)', 'string'],
    ['ospf.auth.crypt.key_id', 'Auth Crypt Key id', 'uint8'],
    ['ospf.auth.crypt.data_length', 'Auth Crypt Data Length', 'uint8'],
    ['ospf.auth.crypt.seq_nbr', 'Auth Crypt Sequence Number', 'uint32'],
    ['ospf.hello', 'OSPF Hello Packet', 'none'],
    ['ospf.hello.network_mask', 'Network Mask', 'ipv4'],
    ['ospf.hello.hello_interval', 'Hello Interval [sec]', 'uint32'],
    ['ospf.hello.router_priority', 'Router Priority', 'uint8'],
    ['ospf.hello.router_dead_interval', 'Router Dead Interval [sec]', 'uint32'],
    ['ospf.hello.designated_router', 'Designated Router', 'ipv4'],
    ['ospf.hello.backup_designated_router', 'Backup Designated Router', 'ipv4'],
    ['ospf.hello.active_neighbor', 'Active Neighbor', 'ipv4'],
    ['ospf.v2.options', 'Options', 'uint8', { base: 'hex' }],
    ...V2OPT.map(([k, n, m, tfs]) => [`ospf.v2.options.${k}`, n, 'bool', { mask: m, bits: 8, tfs }]),
    ['ospf.db.interface_mtu', 'Interface MTU', 'uint16'],
    ['ospf.dbd', 'DB Description', 'uint8', { base: 'hex' }],
    ...DBD.map(([k, n, m, tfs]) => [`ospf.dbd.${k}`, n, 'bool', { mask: m, bits: 8, tfs }]),
    ['ospf.db.dd_sequence', 'DD Sequence', 'uint32'],
    ['ospf.ls.number_of_lsas', 'Number of LSAs', 'uint32'],
    ['ospf.lsa', 'LS Type', 'uint32', { strings: LSA_TYPES }],
    ['ospf.lsa.age', 'LS Age (seconds)', 'uint16', { mask: 0x7fff, bits: 16 }],
    ['ospf.lsa.donotage', 'Do Not Age Flag', 'uint16', { mask: 0x8000, bits: 16 }],
    ['ospf.lsa.id', 'Link State ID', 'ipv4'],
    ['ospf.link_state_id', 'Link State ID', 'ipv4'],
    ['ospf.advrouter', 'Advertising Router', 'ipv4'],
    ['ospf.lsa.seqnum', 'Sequence Number', 'uint32', { base: 'hex' }],
    ['ospf.lsa.chksum', 'Checksum', 'uint16', { base: 'hex' }],
    ['ospf.lsa.length', 'Length', 'uint16'],
    ['ospf.lsa.router', 'Router LSA', 'bool'],
    ['ospf.lsa.network', 'Network LSA', 'bool'],
    ['ospf.lsa.summary', 'Summary LSA (IP Network)', 'bool'],
    ['ospf.lsa.asbr', 'Summary LSA (ASBR)', 'bool'],
    ['ospf.lsa.asext', 'AS-External LSA (ASBR)', 'bool'],
    ['ospf.v2.router.lsa.flags', 'Flags', 'uint8', { base: 'hex' }],
    ...RFLAGS.map(([k, n, m]) => [`ospf.v2.router.lsa.flags.${k}`, n, 'bool', { mask: m, bits: 8, tfs: ['Yes', 'No'] }]),
    ['ospf.lsa.number_of_links', 'Number of Links', 'uint16'],
    ['ospf.lsa.router.linkid', 'Link ID', 'ipv4'],
    ['ospf.lsa.router.linkdata', 'Link Data', 'ipv4'],
    ['ospf.lsa.router.linktype', 'Link Type', 'uint8', { strings: LINK_TYPES }],
    ['ospf.lsa.router.nummetrics', 'Number of Metrics', 'uint8'],
    ['ospf.lsa.router.metric0', '0 Metric', 'uint16'],
    ['ospf.lsa.network.netmask', 'Netmask', 'ipv4'],
    ['ospf.lsa.network.attchrtr', 'Attached Router', 'ipv4'],
    ['ospf.lsa.asext.netmask', 'Netmask', 'ipv4'],
    ['ospf.lsa.asext.fwdaddr', 'Forwarding Address', 'ipv4'],
    ['ospf.lsa.asext.extrttag', 'External Route Tag', 'uint32'],
    ['ospf.metric', 'Metric', 'uint32'],
  ],
  tables: { 'ip.proto': [89] },
  dissect(ctx, off, end) {
    const d = ctx.d;
    ctx.need(off, 24, end);
    const ver = d[off], type = d[off + 1], plen = u16(d, off + 2);
    const pend = Math.min(end, off + plen);
    ctx.setProtocol('OSPF');
    ctx.setInfo(OSPF_MSG[type] || `Unknown (${type})`);
    const t = ctx.proto('ospf', off, pend - off);
    if (ver !== 2) { ctx.add(t, 'ospf.version', off, 1, ver); return end - off; }
    if (ctx.tree) {
      const h = ctx.add(t, 'ospf.header', off, 24, null);
      ctx.add(h, 'ospf.version', off, 1, ver);
      ctx.add(h, 'ospf.msg', off + 1, 1, type);
      const mf = { 1: 'ospf.msg.hello', 2: 'ospf.msg.dbdesc', 3: 'ospf.msg.lsreq', 4: 'ospf.msg.lsupdate', 5: 'ospf.msg.lsack' }[type];
      if (mf) ctx.hidden(h, mf, off + 1, 1, true);
      ctx.add(h, 'ospf.packet_length', off + 2, 2, plen);
      ctx.add(h, 'ospf.srcrouter', off + 4, 4, ip4(d, off + 4));
      const area = ip4(d, off + 8);
      ctx.add(h, 'ospf.area_id', off + 8, 4, area, `Area ID: ${area}${area === '0.0.0.0' ? ' (Backbone)' : ''}`);
      const ck = u16(d, off + 12);
      // OSPF checksum excludes the 8-byte authentication field
      const tmp = d.slice(off, pend); tmp.fill(0, 16, 24);
      const ok = inetChecksum(tmp, 0, tmp.length) === 0;
      ctx.add(h, 'ospf.checksum', off + 12, 2, ck, `Checksum: ${hexPad(ck, 4)} [${ok ? 'correct' : 'incorrect'}]`);
      const at = u16(d, off + 14);
      ctx.add(h, 'ospf.auth.type', off + 14, 2, at);
      if (at === 0) ctx.add(h, 'ospf.auth.none', off + 16, 8, d.subarray(off + 16, off + 24));
      else if (at === 1) ctx.add(h, 'ospf.auth.simple', off + 16, 8, ascii(d, off + 16, 8).replace(/\0+$/, ''));
      else if (at === 2) {
        ctx.add(h, 'ospf.auth.crypt.key_id', off + 18, 1, d[off + 18]);
        ctx.add(h, 'ospf.auth.crypt.data_length', off + 19, 1, d[off + 19]);
        ctx.add(h, 'ospf.auth.crypt.seq_nbr', off + 20, 4, u32(d, off + 20));
      }
    }
    let o = off + 24;
    switch (type) {
      case 1: {
        ctx.need(o, 20, pend);
        const b = ctx.add(t, 'ospf.hello', o, pend - o, null);
        ctx.add(b, 'ospf.hello.network_mask', o, 4, ip4(d, o));
        ctx.add(b, 'ospf.hello.hello_interval', o + 4, 2, u16(d, o + 4));
        options(ctx, b, o + 6, d[o + 6]);
        ctx.add(b, 'ospf.hello.router_priority', o + 7, 1, d[o + 7]);
        ctx.add(b, 'ospf.hello.router_dead_interval', o + 8, 4, u32(d, o + 8));
        ctx.add(b, 'ospf.hello.designated_router', o + 12, 4, ip4(d, o + 12));
        ctx.add(b, 'ospf.hello.backup_designated_router', o + 16, 4, ip4(d, o + 16));
        for (let p = o + 20; p + 4 <= pend; p += 4) ctx.add(b, 'ospf.hello.active_neighbor', p, 4, ip4(d, p));
        break;
      }
      case 2: {
        ctx.need(o, 8, pend);
        const b = ctx.text(t, 'OSPF DB Description', o, pend - o);
        ctx.add(b, 'ospf.db.interface_mtu', o, 2, u16(d, o));
        options(ctx, b, o + 2, d[o + 2]);
        const f = d[o + 3];
        if (ctx.tree) {
          const names = DBD.filter((x) => f & x[2]).map((x) => x[1]);
          const fn = ctx.add(b, 'ospf.dbd', o + 3, 1, f, `DB Description: ${hexPad(f, 2)}${names.length ? ', ' + names.join(', ') : ''}`);
          ctx.bits(fn, o + 3, 1, f, DBD.map((x) => `ospf.dbd.${x[0]}`));
        }
        ctx.add(b, 'ospf.db.dd_sequence', o + 4, 4, u32(d, o + 4));
        for (let p = o + 8; p + 20 <= pend; p += 20) lsaHeader(ctx, b, p, false);
        break;
      }
      case 3: {
        const b = ctx.text(t, 'Link State Request', o, pend - o);
        for (let p = o; p + 12 <= pend; p += 12) {
          const ty = u32(d, p);
          const r = ctx.text(b, `LS Type: ${LSA_TYPES[ty] || 'Unknown'}`, p, 12);
          ctx.add(r, 'ospf.lsa', p, 4, ty);
          ctx.add(r, 'ospf.link_state_id', p + 4, 4, ip4(d, p + 4));
          ctx.add(r, 'ospf.advrouter', p + 8, 4, ip4(d, p + 8));
        }
        break;
      }
      case 4: {
        ctx.need(o, 4, pend);
        const n = u32(d, o);
        const b = ctx.text(t, 'LS Update Packet', o, pend - o);
        ctx.add(b, 'ospf.ls.number_of_lsas', o, 4, n);
        let p = o + 4;
        for (let i = 0; i < n && p + 20 <= pend; i++) {
          const len = u16(d, p + 18);
          if (len < 20) break;
          lsaHeader(ctx, b, p, true, Math.min(pend, p + len));
          p += len;
        }
        break;
      }
      case 5: {
        const b = ctx.text(t, 'LSA-type headers', o, pend - o);
        for (let p = o; p + 20 <= pend; p += 20) lsaHeader(ctx, b, p, false);
        break;
      }
    }
    return end - off;
  },
});

function options(ctx, parent, o, v) {
  if (!ctx.tree) return;
  const names = V2OPT.filter((x) => v & x[2]).map((x) => x[1]);
  const n = ctx.add(parent, 'ospf.v2.options', o, 1, v, `Options: ${hexPad(v, 2)}${names.length ? ', ' + names.join(', ') : ''}`);
  ctx.bits(n, o, 1, v, V2OPT.map((x) => `ospf.v2.options.${x[0]}`));
}

function lsaHeader(ctx, parent, p, body, lend) {
  const d = ctx.d;
  const age = u16(d, p), type = d[p + 3], len = u16(d, p + 18);
  const n = ctx.text(parent, `LSA-type ${type} (${LSA_TYPES[type] || 'Unknown'}), len ${len}`, p, body ? len : 20);
  if (!ctx.tree) return;
  ctx.add(n, 'ospf.lsa.age', p, 2, age & 0x7fff);
  ctx.add(n, 'ospf.lsa.donotage', p, 2, age >> 15);
  options(ctx, n, p + 2, d[p + 2]);
  ctx.add(n, 'ospf.lsa', p + 3, 1, type);
  ctx.add(n, 'ospf.lsa.id', p + 4, 4, ip4(d, p + 4));
  ctx.add(n, 'ospf.advrouter', p + 8, 4, ip4(d, p + 8));
  ctx.add(n, 'ospf.lsa.seqnum', p + 12, 4, u32(d, p + 12));
  ctx.add(n, 'ospf.lsa.chksum', p + 16, 2, u16(d, p + 16));
  ctx.add(n, 'ospf.lsa.length', p + 18, 2, len);
  const flag = { 1: 'ospf.lsa.router', 2: 'ospf.lsa.network', 3: 'ospf.lsa.summary', 4: 'ospf.lsa.asbr', 5: 'ospf.lsa.asext' }[type];
  if (flag) ctx.hidden(n, flag, p + 3, 1, true);
  if (!body) return;
  let o = p + 20;
  if (type === 1 && o + 4 <= lend) {
    const f = d[o];
    const fn = ctx.add(n, 'ospf.v2.router.lsa.flags', o, 1, f);
    ctx.bits(fn, o, 1, f, RFLAGS.map((x) => `ospf.v2.router.lsa.flags.${x[0]}`));
    const nl = u16(d, o + 2);
    ctx.add(n, 'ospf.lsa.number_of_links', o + 2, 2, nl);
    o += 4;
    for (let i = 0; i < nl && o + 12 <= lend; i++) {
      const id = ip4(d, o), data = ip4(d, o + 4), lt = d[o + 8], ntos = d[o + 9], m = u16(d, o + 10);
      const ln = ctx.text(n, `Type: ${(LINK_SHORT[lt] || 'Unknown').padEnd(8)} ID: ${id.padEnd(15)} Data: ${data.padEnd(15)} Metric: ${m}`, o, 12 + ntos * 4);
      ctx.add(ln, 'ospf.lsa.router.linkid', o, 4, id, `Link ID: ${id} - ${LINK_ID[lt] || 'Unknown'}`);
      ctx.add(ln, 'ospf.lsa.router.linkdata', o + 4, 4, data);
      ctx.add(ln, 'ospf.lsa.router.linktype', o + 8, 1, lt, `Link Type: ${lt} - ${LINK_TYPES[lt] || 'Unknown'}`);
      ctx.add(ln, 'ospf.lsa.router.nummetrics', o + 9, 1, ntos, `Number of Metrics: ${ntos} - TOS`);
      ctx.add(ln, 'ospf.lsa.router.metric0', o + 10, 2, m);
      o += 12 + ntos * 4;
    }
  } else if (type === 2 && o + 4 <= lend) {
    ctx.add(n, 'ospf.lsa.network.netmask', o, 4, ip4(d, o));
    for (let q = o + 4; q + 4 <= lend; q += 4) ctx.add(n, 'ospf.lsa.network.attchrtr', q, 4, ip4(d, q));
  } else if ((type === 3 || type === 4) && o + 8 <= lend) {
    ctx.add(n, 'ospf.lsa.network.netmask', o, 4, ip4(d, o));
    ctx.add(n, 'ospf.metric', o + 5, 3, u24(d, o + 5));
  } else if ((type === 5 || type === 7) && o + 16 <= lend) {
    ctx.add(n, 'ospf.lsa.asext.netmask', o, 4, ip4(d, o));
    ctx.add(n, 'ospf.metric', o + 5, 3, u24(d, o + 5));
    ctx.add(n, 'ospf.lsa.asext.fwdaddr', o + 8, 4, ip4(d, o + 8));
    ctx.add(n, 'ospf.lsa.asext.extrttag', o + 12, 4, u32(d, o + 12));
  }
}

// --- BGP -------------------------------------------------------------------------------------------
const BGP_TYPES = { 1: 'OPEN Message', 2: 'UPDATE Message', 3: 'NOTIFICATION Message', 4: 'KEEPALIVE Message', 5: 'ROUTE-REFRESH Message', 6: 'CAPABILITY Message' };
const CAPS = { 1: 'Multiprotocol extensions capability', 2: 'Route refresh capability', 3: 'Outbound Route Filtering', 5: 'Extended Next Hop Encoding', 6: 'BGP Extended Message', 9: 'BGP Role', 64: 'Graceful Restart capability', 65: 'Support for 4-octet AS number capability', 67: 'Support for Dynamic capability', 69: 'Support for Additional Paths', 70: 'Enhanced route refresh capability', 71: 'Long-Lived Graceful Restart (LLGR) Capability', 73: 'FQDN Capability', 128: 'Route refresh capability (Cisco)' };
const AFI = { 1: 'IPv4', 2: 'IPv6', 25: 'Layer-2 VPN', 16388: 'BGP-LS' };
const SAFI = { 1: 'Unicast', 2: 'Multicast', 4: 'Labeled Unicast', 5: 'MCAST-VPN', 65: 'VPLS', 70: 'EVPN', 71: 'BGP-LS', 128: 'Labeled VPN Unicast', 133: 'Flow Spec Filter' };
const ATTRS = { 1: 'ORIGIN', 2: 'AS_PATH', 3: 'NEXT_HOP', 4: 'MULTI_EXIT_DISC', 5: 'LOCAL_PREF', 6: 'ATOMIC_AGGREGATE', 7: 'AGGREGATOR', 8: 'COMMUNITIES', 9: 'ORIGINATOR_ID', 10: 'CLUSTER_LIST', 14: 'MP_REACH_NLRI', 15: 'MP_UNREACH_NLRI', 16: 'EXTENDED_COMMUNITIES', 17: 'AS4_PATH', 18: 'AS4_AGGREGATOR', 32: 'LARGE_COMMUNITY' };
const ORIGIN = { 0: 'IGP', 1: 'EGP', 2: 'INCOMPLETE' };
const SEG = { 1: 'AS_SET', 2: 'AS_SEQUENCE', 3: 'AS_CONFED_SEQUENCE', 4: 'AS_CONFED_SET' };
const MAJOR = { 1: 'Message Header Error', 2: 'OPEN Message Error', 3: 'UPDATE Message Error', 4: 'Hold Timer Expired', 5: 'Finite State Machine Error', 6: 'Cease', 7: 'ROUTE-REFRESH Message Error' };
const MINOR = {
  1: ['bgp.notify.minor_error', 'Message Header', { 1: 'Connection Not Synchronized', 2: 'Bad Message Length', 3: 'Bad Message Type' }],
  2: ['bgp.notify.minor_error_open', 'Open Message', { 1: 'Unsupported Version Number', 2: 'Bad Peer AS', 3: 'Bad BGP Identifier', 4: 'Unsupported Optional Parameter', 5: 'Authentication Failure', 6: 'Unacceptable Hold Time', 7: 'Unsupported Capability' }],
  3: ['bgp.notify.minor_error_update', 'Update Message', { 1: 'Malformed Attribute List', 2: 'Unrecognized Well-known Attribute', 3: 'Missing Well-known Attribute', 4: 'Attribute Flags Error', 5: 'Attribute Length Error', 6: 'Invalid ORIGIN Attribute', 7: 'AS Routing Loop', 8: 'Invalid NEXT_HOP Attribute', 9: 'Optional Attribute Error', 10: 'Invalid Network Field', 11: 'Malformed AS_PATH' }],
  4: ['bgp.notify.minor_error_expired', 'Hold Timer Expired', {}],
  5: ['bgp.notify.minor_error_state', 'State Machine', {}],
  6: ['bgp.notify.minor_error_cease', 'Cease', { 1: 'Maximum Number of Prefixes Reached', 2: 'Administratively Shutdown', 3: 'Peer De-configured', 4: 'Administratively Reset', 5: 'Connection Rejected', 6: 'Other Configuration Change', 7: 'Connection Collision Resolution', 8: 'Out of Resources', 9: 'Hard Reset', 10: 'BFD Down' }],
  7: ['bgp.notify.minor_error_route_refresh', 'Route-Refresh message', { 1: 'Invalid Message Length' }],
};
const PFLAGS = [['optional', 'Optional', 0x80], ['transitive', 'Transitive', 0x40], ['partial', 'Partial', 0x20], ['extended_length', 'Extended-Length', 0x10]];

registerProtocol({
  abbrev: 'bgp', name: 'Border Gateway Protocol', short: 'BGP',
  fields: [
    ['bgp.marker', 'Marker', 'bytes'],
    ['bgp.length', 'Length', 'uint16'],
    ['bgp.type', 'Type', 'uint8', { strings: BGP_TYPES }],
    ['bgp.open.version', 'Version', 'uint8'],
    ['bgp.open.myas', 'My AS', 'uint16'],
    ['bgp.open.holdtime', 'Hold Time', 'uint16'],
    ['bgp.open.identifier', 'BGP Identifier', 'ipv4'],
    ['bgp.open.opt.len', 'Optional Parameters Length', 'uint8'],
    ['bgp.open.opt', 'Optional Parameters', 'none'],
    ['bgp.open.opt.param', 'Optional Parameter', 'none'],
    ['bgp.open.opt.param.type', 'Parameter Type', 'uint8', { strings: { 1: 'Authentication (deprecated)', 2: 'Capability' } }],
    ['bgp.open.opt.param.len', 'Parameter Length', 'uint8'],
    ['bgp.cap', 'Capability', 'none'],
    ['bgp.cap.type', 'Type', 'uint8', { strings: CAPS }],
    ['bgp.cap.length', 'Length', 'uint8'],
    ['bgp.cap.mp.afi', 'AFI', 'uint16', { strings: AFI }],
    ['bgp.cap.reserved', 'Reserved', 'bytes'],
    ['bgp.cap.mp.safi', 'SAFI', 'uint8', { strings: SAFI }],
    ['bgp.cap.4as', 'AS Number', 'uint32'],
    ['bgp.cap.unknown', 'Unknown', 'bytes'],
    ['bgp.update.withdrawn_routes.length', 'Withdrawn Routes Length', 'uint16'],
    ['bgp.update.withdrawn_routes', 'Withdrawn Routes', 'none'],
    ['bgp.withdrawn_prefix', 'Withdrawn prefix', 'ipv4'],
    ['bgp.prefix_length', 'Prefix Length', 'uint8'],
    ['bgp.update.path_attributes.length', 'Total Path Attribute Length', 'uint16'],
    ['bgp.update.path_attributes', 'Path attributes', 'none'],
    ['bgp.update.path_attribute', 'Path Attribute', 'none'],
    ['bgp.update.path_attribute.flags', 'Flags', 'uint8', { base: 'hex' }],
    ...PFLAGS.map(([k, n, m]) => [`bgp.update.path_attribute.flags.${k}`, n, 'bool', { mask: m, bits: 8, tfs: NOTSET }]),
    ['bgp.update.path_attribute.type_code', 'Type Code', 'uint8', { strings: ATTRS }],
    ['bgp.update.path_attribute.length', 'Length', 'uint16'],
    ['bgp.update.path_attribute.origin', 'Origin', 'uint8', { strings: ORIGIN }],
    ['bgp.update.path_attribute.as_path_segment', 'AS Path segment', 'none'],
    ['bgp.update.path_attribute.as_path_segment.type', 'Segment type', 'uint8', { strings: SEG }],
    ['bgp.update.path_attribute.as_path_segment.length', 'Segment length (number of ASN)', 'uint8'],
    ['bgp.update.path_attribute.as_path_segment.as2', 'AS2', 'uint16'],
    ['bgp.update.path_attribute.as_path_segment.as4', 'AS4', 'uint32'],
    ['bgp.update.path_attribute.next_hop', 'Next hop', 'ipv4'],
    ['bgp.update.path_attribute.multi_exit_disc', 'Multiple exit discriminator', 'uint32'],
    ['bgp.update.path_attribute.local_pref', 'Local preference', 'uint32'],
    ['bgp.update.path_attribute.aggregator_as', 'Aggregator AS', 'uint32'],
    ['bgp.update.path_attribute.aggregator_origin', 'Aggregator origin', 'ipv4'],
    ['bgp.update.path_attribute.community_as', 'Community AS', 'uint16'],
    ['bgp.update.path_attribute.community_value', 'Community value', 'uint16'],
    ['bgp.update.path_attribute.originator_id', 'Originator identifier', 'ipv4'],
    ['bgp.update.path_attribute.value', 'Value', 'bytes'],
    ['bgp.update.nlri', 'Network Layer Reachability Information (NLRI)', 'none'],
    ['bgp.nlri_prefix', 'NLRI prefix', 'ipv4'],
    ['bgp.notify.major_error', 'Major error Code', 'uint8', { strings: MAJOR }],
    ...Object.values(MINOR).map(([f, n, s]) => [f, `Minor error Code (${n})`, 'uint8', { strings: s }]),
    ['bgp.notify.minor_data', 'Data', 'bytes'],
    ['bgp.route_refresh.afi', 'Address family identifier (AFI)', 'uint16', { strings: AFI }],
    ['bgp.route_refresh.subtype', 'Subtype', 'uint8', { strings: { 0: 'Normal route refresh request [RFC2918] with/without ORF [RFC5291]', 1: 'Demarcation of the beginning of a route refresh', 2: 'Demarcation of the ending of a route refresh' } }],
    ['bgp.route_refresh.safi', 'Subsequent address family identifier (SAFI)', 'uint8', { strings: SAFI }],
  ],
  tables: { 'tcp.port': [179] },
  tcpPdu(ctx, off, end) {
    if (end - off < 19) return -1;
    const l = u16(ctx.d, off + 16);
    return l >= 19 ? l : 0;
  },
  dissect(ctx, off, end) {
    const d = ctx.d;
    ctx.need(off, 19, end);
    const len = u16(d, off + 16), type = d[off + 18];
    const pend = Math.min(end, off + len);
    ctx.setProtocol('BGP');
    const name = BGP_TYPES[type] || `Unknown Message (${type})`;
    ctx.pduInfo('bgp', name);
    const t = ctx.proto('bgp', off, pend - off, `Border Gateway Protocol - ${name}`);
    ctx.add(t, 'bgp.marker', off, 16, d.subarray(off, off + 16));
    ctx.add(t, 'bgp.length', off + 16, 2, len);
    ctx.add(t, 'bgp.type', off + 18, 1, type);
    const o = off + 19;
    if (!ctx.tree) return pend - off;
    switch (type) {
      case 1: {
        ctx.need(o, 10, pend);
        ctx.add(t, 'bgp.open.version', o, 1, d[o]);
        ctx.add(t, 'bgp.open.myas', o + 1, 2, u16(d, o + 1));
        ctx.add(t, 'bgp.open.holdtime', o + 3, 2, u16(d, o + 3));
        ctx.add(t, 'bgp.open.identifier', o + 5, 4, ip4(d, o + 5));
        const ol = d[o + 9];
        ctx.add(t, 'bgp.open.opt.len', o + 9, 1, ol);
        if (ol) {
          const on = ctx.add(t, 'bgp.open.opt', o + 10, ol, null);
          let p = o + 10;
          const oe = Math.min(pend, o + 10 + ol);
          while (p + 2 <= oe) {
            const pt = d[p], pl = d[p + 1];
            const pn = ctx.add(on, 'bgp.open.opt.param', p, 2 + pl, null, `Optional Parameter: ${pt === 2 ? 'Capability' : 'Unknown'}`);
            ctx.add(pn, 'bgp.open.opt.param.type', p, 1, pt);
            ctx.add(pn, 'bgp.open.opt.param.len', p + 1, 1, pl);
            if (pt === 2) {
              let c = p + 2;
              while (c + 2 <= p + 2 + pl) {
                const ct = d[c], cl = d[c + 1];
                const cn = ctx.add(pn, 'bgp.cap', c, 2 + cl, null, `Capability: ${CAPS[ct] || 'Unknown capability'}`);
                ctx.add(cn, 'bgp.cap.type', c, 1, ct);
                ctx.add(cn, 'bgp.cap.length', c + 1, 1, cl);
                if (ct === 1 && cl === 4) {
                  ctx.add(cn, 'bgp.cap.mp.afi', c + 2, 2, u16(d, c + 2));
                  ctx.add(cn, 'bgp.cap.reserved', c + 4, 1, d.subarray(c + 4, c + 5));
                  ctx.add(cn, 'bgp.cap.mp.safi', c + 5, 1, d[c + 5]);
                } else if (ct === 65 && cl === 4) ctx.add(cn, 'bgp.cap.4as', c + 2, 4, u32(d, c + 2));
                else if (cl) ctx.add(cn, 'bgp.cap.unknown', c + 2, cl, d.subarray(c + 2, c + 2 + cl));
                c += 2 + cl;
              }
            }
            p += 2 + pl;
          }
        }
        break;
      }
      case 2: {
        ctx.need(o, 2, pend);
        const wl = u16(d, o);
        ctx.add(t, 'bgp.update.withdrawn_routes.length', o, 2, wl);
        let p = o + 2;
        if (wl) {
          const wn = ctx.add(t, 'bgp.update.withdrawn_routes', p, wl, null);
          prefixes(ctx, wn, p, Math.min(pend, p + wl), 'bgp.withdrawn_prefix', 'Withdrawn route prefix length', 'Withdrawn prefix');
        }
        p += wl;
        ctx.need(p, 2, pend);
        const al = u16(d, p);
        ctx.add(t, 'bgp.update.path_attributes.length', p, 2, al);
        p += 2;
        const ae = Math.min(pend, p + al);
        if (al) {
          const an = ctx.add(t, 'bgp.update.path_attributes', p, al, null);
          while (p + 3 <= ae) {
            const fl = d[p], tc = d[p + 1];
            const ext = fl & 0x10;
            const alen = ext ? u16(d, p + 2) : d[p + 2];
            const v = p + (ext ? 4 : 3);
            const ve = Math.min(ae, v + alen);
            const aname = ATTRS[tc] || 'Unknown';
            let summary = '';
            if (tc === 1) summary = `: ${ORIGIN[d[v]] || 'Unknown'}`;
            else if (tc === 2) summary = `: ${asPathText(d, v, ve)} `;
            else if (tc === 3 && alen === 4) summary = `: ${ip4(d, v)} `;
            else if ((tc === 4 || tc === 5) && alen === 4) summary = `: ${u32(d, v)}`;
            const pa = ctx.add(an, 'bgp.update.path_attribute', p, ve - p, null, `Path Attribute - ${aname}${summary}`);
            const fdesc = [fl & 0x80 ? 'Optional' : null, fl & 0x40 ? 'Transitive' : (fl & 0x80 ? 'Non-transitive' : null), fl & 0x80 ? null : 'Well-known', fl & 0x20 ? 'Partial' : 'Complete', fl & 0x10 ? 'Extended Length' : null].filter(Boolean);
            const fn = ctx.add(pa, 'bgp.update.path_attribute.flags', p, 1, fl, `Flags: ${hexPad(fl, 2)}, ${fdesc.join(', ')}`);
            ctx.bits(fn, p, 1, fl, PFLAGS.map((x) => `bgp.update.path_attribute.flags.${x[0]}`));
            ctx.add(pa, 'bgp.update.path_attribute.type_code', p + 1, 1, tc);
            ctx.add(pa, 'bgp.update.path_attribute.length', p + 2, ext ? 2 : 1, alen);
            if (tc === 1) ctx.add(pa, 'bgp.update.path_attribute.origin', v, 1, d[v]);
            else if (tc === 2) {
              let q = v;
              while (q + 2 <= ve) {
                const st = d[q], sl = d[q + 1];
                const as4 = (ve - v) % 4 === 2 || sl * 4 + 2 === ve - q; // 4-octet AS when the lengths fit
                const w = as4 ? 4 : 2;
                const ases = [];
                for (let k = 0; k < sl && q + 2 + (k + 1) * w <= ve; k++) ases.push(w === 4 ? u32(d, q + 2 + k * 4) : u16(d, q + 2 + k * 2));
                const sn = ctx.add(pa, 'bgp.update.path_attribute.as_path_segment', q, 2 + sl * w, null, `AS Path segment: ${st === 1 ? '{' + ases.join(' ') + '}' : ases.join(' ')}`);
                ctx.add(sn, 'bgp.update.path_attribute.as_path_segment.type', q, 1, st);
                ctx.add(sn, 'bgp.update.path_attribute.as_path_segment.length', q + 1, 1, sl);
                ases.forEach((a, k) => ctx.add(sn, w === 4 ? 'bgp.update.path_attribute.as_path_segment.as4' : 'bgp.update.path_attribute.as_path_segment.as2', q + 2 + k * w, w, a));
                q += 2 + sl * w;
              }
            } else if (tc === 3 && alen === 4) ctx.add(pa, 'bgp.update.path_attribute.next_hop', v, 4, ip4(d, v));
            else if (tc === 4 && alen === 4) ctx.add(pa, 'bgp.update.path_attribute.multi_exit_disc', v, 4, u32(d, v));
            else if (tc === 5 && alen === 4) ctx.add(pa, 'bgp.update.path_attribute.local_pref', v, 4, u32(d, v));
            else if (tc === 7 && alen === 8) { ctx.add(pa, 'bgp.update.path_attribute.aggregator_as', v, 4, u32(d, v)); ctx.add(pa, 'bgp.update.path_attribute.aggregator_origin', v + 4, 4, ip4(d, v + 4)); }
            else if (tc === 8) for (let q = v; q + 4 <= ve; q += 4) { ctx.add(pa, 'bgp.update.path_attribute.community_as', q, 2, u16(d, q)); ctx.add(pa, 'bgp.update.path_attribute.community_value', q + 2, 2, u16(d, q + 2)); }
            else if (tc === 9 && alen === 4) ctx.add(pa, 'bgp.update.path_attribute.originator_id', v, 4, ip4(d, v));
            else if (alen) ctx.add(pa, 'bgp.update.path_attribute.value', v, ve - v, d.subarray(v, ve));
            p = v + alen;
          }
        }
        p = ae;
        if (p < pend) {
          const nn = ctx.add(t, 'bgp.update.nlri', p, pend - p, null);
          prefixes(ctx, nn, p, pend, 'bgp.nlri_prefix', 'NLRI prefix length', 'NLRI prefix');
        }
        break;
      }
      case 3: {
        ctx.need(o, 2, pend);
        const ma = d[o], mi = d[o + 1];
        ctx.add(t, 'bgp.notify.major_error', o, 1, ma);
        const m = MINOR[ma];
        if (m) ctx.add(t, m[0], o + 1, 1, mi);
        if (o + 2 < pend) ctx.add(t, 'bgp.notify.minor_data', o + 2, pend - o - 2, d.subarray(o + 2, pend));
        break;
      }
      case 5: {
        ctx.need(o, 4, pend);
        ctx.add(t, 'bgp.route_refresh.afi', o, 2, u16(d, o));
        ctx.add(t, 'bgp.route_refresh.subtype', o + 2, 1, d[o + 2]);
        ctx.add(t, 'bgp.route_refresh.safi', o + 3, 1, d[o + 3]);
        break;
      }
    }
    return pend - off;
  },
});

function asPathText(d, v, ve) {
  const out = [];
  let q = v;
  while (q + 2 <= ve) {
    const st = d[q], sl = d[q + 1];
    const w = sl * 4 + 2 === ve - q || (ve - v) % 4 === 2 ? 4 : 2;
    const ases = [];
    for (let k = 0; k < sl && q + 2 + (k + 1) * w <= ve; k++) ases.push(w === 4 ? u32(d, q + 2 + k * 4) : u16(d, q + 2 + k * 2));
    out.push(st === 1 ? '{' + ases.join(' ') + '}' : ases.join(' '));
    q += 2 + sl * w;
  }
  return out.join(' ');
}

function prefixes(ctx, parent, p, end, field, lenLabel, pfxLabel) {
  const d = ctx.d;
  while (p < end) {
    const pl = d[p], nb = Math.ceil(pl / 8);
    if (p + 1 + nb > end || pl > 32) break;
    const b = new Uint8Array(4);
    b.set(d.subarray(p + 1, p + 1 + nb));
    const a = ip4(b, 0);
    const n = ctx.text(parent, `${a}/${pl}`, p, 1 + nb);
    ctx.add(n, 'bgp.prefix_length', p, 1, pl, `${lenLabel}: ${pl}`);
    ctx.add(n, field, p + 1, nb, a, `${pfxLabel}: ${a}`);
    p += 1 + nb;
  }
}

// --- RIP ---------------------------------------------------------------------------------------------
const RIP_CMD = { 1: 'Request', 2: 'Response', 3: 'Traceon', 4: 'Traceoff', 5: 'Vendor specific' };
registerProtocol({
  abbrev: 'rip', name: 'Routing Information Protocol', short: 'RIP',
  fields: [
    ['rip.command', 'Command', 'uint8', { strings: RIP_CMD }],
    ['rip.version', 'Version', 'uint8', { strings: { 1: 'RIPv1', 2: 'RIPv2' } }],
    ['rip.routing_domain', 'Routing Domain', 'uint16'],
    ['rip.family', 'Address Family', 'uint16', { strings: { 2: 'IP', 0xffff: 'Authentication' } }],
    ['rip.route_tag', 'Route Tag', 'uint16'],
    ['rip.ip', 'IP Address', 'ipv4'],
    ['rip.netmask', 'Netmask', 'ipv4'],
    ['rip.next_hop', 'Next Hop', 'ipv4'],
    ['rip.metric', 'Metric', 'uint16'],
    ['rip.auth.type', 'Authentication type', 'uint16'],
    ['rip.auth.passwd', 'Password', 'string'],
  ],
  tables: { 'udp.port': [520] },
  dissect(ctx, off, end) {
    const d = ctx.d;
    ctx.need(off, 4, end);
    const cmd = d[off], ver = d[off + 1];
    ctx.setProtocol(`RIPv${ver}`);
    ctx.setInfo(RIP_CMD[cmd] || `Unknown command (${cmd})`);
    const t = ctx.proto('rip', off, end - off);
    ctx.add(t, 'rip.command', off, 1, cmd);
    ctx.add(t, 'rip.version', off + 1, 1, ver);
    if (ver === 2) ctx.add(t, 'rip.routing_domain', off + 2, 2, u16(d, off + 2));
    for (let p = off + 4; p + 20 <= end; p += 20) {
      const fam = u16(d, p);
      if (fam === 0xffff) {
        const n = ctx.text(t, 'Authentication: ' + ascii(d, p + 4, 16).replace(/\0+$/, ''), p, 20);
        ctx.add(n, 'rip.auth.type', p + 2, 2, u16(d, p + 2));
        ctx.add(n, 'rip.auth.passwd', p + 4, 16, ascii(d, p + 4, 16).replace(/\0+$/, ''));
        continue;
      }
      const a = ip4(d, p + 4), m = u32(d, p + 16);
      const n = ctx.text(t, fam === 0 && cmd === 1 ? `Address not specified, Metric: ${m}` : `IP Address: ${a}, Metric: ${m}`, p, 20);
      ctx.add(n, 'rip.family', p, 2, fam, fam === 0 ? 'Address Family: Unspecified (0)' : undefined);
      if (ver === 2) ctx.add(n, 'rip.route_tag', p + 2, 2, u16(d, p + 2));
      if (fam !== 0) ctx.add(n, 'rip.ip', p + 4, 4, a);
      if (ver === 2) {
        ctx.add(n, 'rip.netmask', p + 8, 4, ip4(d, p + 8));
        ctx.add(n, 'rip.next_hop', p + 12, 4, ip4(d, p + 12));
      }
      ctx.add(n, 'rip.metric', p + 18, 2, m);
    }
    return end - off;
  },
});

// --- VRRP ------------------------------------------------------------------------------------------
registerProtocol({
  abbrev: 'vrrp', name: 'Virtual Router Redundancy Protocol', short: 'VRRP',
  fields: [
    ['vrrp.typever', 'VRRP message version and type', 'uint8'],
    ['vrrp.version', 'VRRP protocol version', 'uint8', { mask: 0xf0 }],
    ['vrrp.type', 'VRRP packet type', 'uint8', { mask: 0x0f, strings: { 1: 'Advertisement' } }],
    ['vrrp.virt_rtr_id', 'Virtual Rtr ID', 'uint8'],
    ['vrrp.prio', 'Priority', 'uint8'],
    ['vrrp.addr_count', 'Addr Count', 'uint8'],
    ['vrrp.auth_type', 'Auth Type', 'uint8', { strings: { 0: 'No Authentication', 1: 'Simple Text Authentication [RFC 2338] / Reserved [RFC 3768]', 2: 'IP Authentication Header [RFC 2338] / Reserved [RFC 3768]' } }],
    ['vrrp.adver_int', 'Adver Int', 'uint8'],
    ['vrrp.reserved_mbz', 'Reserved', 'uint8', { mask: 0xf0 }],
    ['vrrp.short_adver_int', 'Adver Int', 'uint16', { mask: 0x0fff, bits: 16 }],
    ['vrrp.checksum', 'Checksum', 'uint16', { base: 'hex' }],
    ['vrrp.checksum.status', 'Checksum Status', 'uint8', { base: 'none', strings: { 0: 'Bad', 1: 'Good', 2: 'Unverified' } }],
    ['vrrp.ip_addr', 'IP Address', 'ipv4'],
    ['vrrp.auth_string', 'Authentication String', 'string'],
  ],
  tables: { 'ip.proto': [112] },
  dissect(ctx, off, end) {
    const d = ctx.d;
    ctx.need(off, 8, end);
    const tv = d[off], ver = tv >> 4, type = tv & 15, vrid = d[off + 1], prio = d[off + 2], cnt = d[off + 3];
    ctx.setProtocol('VRRP');
    ctx.setInfo(`${type === 1 ? 'Announcement' : 'Unknown'} (v${ver})`);
    const t = ctx.proto('vrrp', off, end - off);
    if (!ctx.tree) return end - off;
    const tn = ctx.add(t, 'vrrp.typever', off, 1, tv, `Version ${ver}, Packet type ${type} (${type === 1 ? 'Advertisement' : 'Unknown'})`);
    ctx.bits(tn, off, 1, tv, ['vrrp.version', 'vrrp.type']);
    ctx.add(t, 'vrrp.virt_rtr_id', off + 1, 1, vrid);
    const pd = prio === 0 ? 'Current Master has stopped participating in VRRP' : prio === 255 ? 'This VRRP router owns the virtual router\'s IP address(es)' : prio === 100 ? 'Default priority for a backup VRRP router' : 'Non-default backup priority';
    ctx.add(t, 'vrrp.prio', off + 2, 1, prio, `Priority: ${prio} (${pd})`);
    ctx.add(t, 'vrrp.addr_count', off + 3, 1, cnt);
    if (ver === 3) {
      ctx.add(t, 'vrrp.reserved_mbz', off + 4, 1, d[off + 4] >> 4);
      ctx.add(t, 'vrrp.short_adver_int', off + 4, 2, u16(d, off + 4) & 0xfff);
    } else {
      ctx.add(t, 'vrrp.auth_type', off + 4, 1, d[off + 4]);
      ctx.add(t, 'vrrp.adver_int', off + 5, 1, d[off + 5]);
    }
    const ck = u16(d, off + 6);
    const ok = inetChecksum(d, off, end - off) === 0;
    ctx.add(t, 'vrrp.checksum', off + 6, 2, ck, `Checksum: ${hexPad(ck, 4)} [${ok ? 'correct' : 'incorrect'}]`);
    ctx.gen(t, 'vrrp.checksum.status', ok ? 1 : 0);
    let p = off + 8;
    for (let i = 0; i < cnt && p + 4 <= end; i++, p += 4) ctx.add(t, 'vrrp.ip_addr', p, 4, ip4(d, p));
    if (ver === 2 && d[off + 4] === 1 && p + 8 <= end) ctx.add(t, 'vrrp.auth_string', p, 8, ascii(d, p, 8).replace(/\0+$/, ''));
    return end - off;
  },
});

// --- HSRP --------------------------------------------------------------------------------------------
const HSRP_OP = { 0: 'Hello', 1: 'Coup', 2: 'Resign', 3: 'Advertise' };
const HSRP_STATE = { 0: 'Initial', 1: 'Learn', 2: 'Listen', 4: 'Speak', 8: 'Standby', 16: 'Active' };
registerProtocol({
  abbrev: 'hsrp', name: 'Cisco Hot Standby Router Protocol', short: 'HSRP',
  fields: [
    ['hsrp.version', 'Version', 'uint8'],
    ['hsrp.opcode', 'Op Code', 'uint8', { strings: HSRP_OP }],
    ['hsrp.state', 'State', 'uint8', { strings: HSRP_STATE }],
    ['hsrp.hellotime', 'Hellotime', 'uint8'],
    ['hsrp.holdtime', 'Holdtime', 'uint8'],
    ['hsrp.priority', 'Priority', 'uint8'],
    ['hsrp.group', 'Group', 'uint8'],
    ['hsrp.reserved', 'Reserved', 'uint8'],
    ['hsrp.auth_data', 'Authentication Data', 'string'],
    ['hsrp.virt_ip', 'Virtual IP Address', 'ipv4'],
  ],
  tables: { 'udp.port': [1985] },
  dissect(ctx, off, end) {
    const d = ctx.d;
    ctx.need(off, 20, end);
    const ver = d[off], op = d[off + 1], st = d[off + 2];
    if (ver !== 0) return false; // HSRPv2 uses TLVs; leave it to the data dissector
    ctx.setProtocol('HSRP');
    ctx.setInfo(`${HSRP_OP[op] || 'Unknown'}${op === 0 ? ` (state ${HSRP_STATE[st] || 'Unknown'})` : ''}`);
    const t = ctx.proto('hsrp', off, 20);
    if (!ctx.tree) return 20;
    ctx.add(t, 'hsrp.version', off, 1, ver);
    ctx.add(t, 'hsrp.opcode', off + 1, 1, op);
    ctx.add(t, 'hsrp.state', off + 2, 1, st);
    const ht = d[off + 3], hd = d[off + 4];
    ctx.add(t, 'hsrp.hellotime', off + 3, 1, ht, `Hellotime: ${ht === 3 ? 'Default (3)' : ht + ' seconds'}`);
    ctx.add(t, 'hsrp.holdtime', off + 4, 1, hd, `Holdtime: ${hd === 10 ? 'Default (10)' : hd + ' seconds'}`);
    ctx.add(t, 'hsrp.priority', off + 5, 1, d[off + 5]);
    ctx.add(t, 'hsrp.group', off + 6, 1, d[off + 6]);
    ctx.add(t, 'hsrp.reserved', off + 7, 1, d[off + 7]);
    const auth = ascii(d, off + 8, 8).replace(/\0+$/, '');
    ctx.add(t, 'hsrp.auth_data', off + 8, 8, auth, `Authentication Data: ${auth === 'cisco' ? 'Default (cisco)' : auth}`);
    ctx.add(t, 'hsrp.virt_ip', off + 16, 4, ip4(d, off + 16));
    return 20;
  },
});

void NULLNODE;
