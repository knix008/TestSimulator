// DHCP/BOOTP (RFC 2131/2132 options) and DHCPv6 (RFC 8415).
import { registerProtocol, u16, u32, ip4, ip6, mac, hexPad, hexStr, ascii, utf8, NULLNODE } from '../core.js';
import { secsStr, readName } from './dns.js';
import { resolveMac } from '../names.js';

const MSG = { 1: 'Discover', 2: 'Offer', 3: 'Request', 4: 'Decline', 5: 'ACK', 6: 'NAK', 7: 'Release', 8: 'Inform', 9: 'Force Renew', 10: 'Lease query', 11: 'Lease Unassigned', 12: 'Lease Unknown', 13: 'Lease Active', 14: 'Bulk Lease Query', 15: 'Lease Query Done', 16: 'Active LeaseQuery', 17: 'Lease Query Status', 18: 'TLS' };
const HWTYPES = { 1: 'Ethernet', 6: 'IEEE 802', 7: 'ARCNET', 15: 'Frame Relay DLCI', 16: 'ATM', 20: 'Serial Line', 32: 'InfiniBand' };
const NODE_TYPES = { 1: 'B-node', 2: 'P-node', 4: 'M-node', 8: 'H-node' };

// code -> [name, kind, field]
// kinds: ip1 (single address, shown in the option line), ips (address list), str, u8, u16, u32, time,
// bool, msg, prl, cid, bytes, search, classless, agent, fqdn, ipmask (pairs), node
const OPTS = {
  0: ['Padding', 'pad'],
  1: ['Subnet Mask', 'ip1', 'dhcp.option.subnet_mask'],
  2: ['Time Offset', 'i32', 'dhcp.option.time_offset'],
  3: ['Router', 'ips', 'dhcp.option.router'],
  4: ['Time Server', 'ips', 'dhcp.option.time_server'],
  5: ['Name Server', 'ips', 'dhcp.option.name_server'],
  6: ['Domain Name Server', 'ips', 'dhcp.option.domain_name_server'],
  7: ['Log Server', 'ips', 'dhcp.option.log_server'],
  9: ['LPR Server', 'ips', 'dhcp.option.lpr_server'],
  12: ['Host Name', 'str', 'dhcp.option.hostname'],
  13: ['Boot File Size', 'u16', 'dhcp.option.boot_file_size'],
  15: ['Domain Name', 'str', 'dhcp.option.domain_name'],
  16: ['Swap Server', 'ip1', 'dhcp.option.swap_server'],
  17: ['Root Path', 'str', 'dhcp.option.root_path'],
  19: ['IP Forwarding', 'bool', 'dhcp.option.ip_forwarding'],
  23: ['Default IP Time-to-Live', 'u8', 'dhcp.option.default_ip_ttl'],
  26: ['Interface MTU', 'u16', 'dhcp.option.interface_mtu'],
  28: ['Broadcast Address', 'ip1', 'dhcp.option.broadcast_address'],
  31: ['Perform Router Discover', 'bool', 'dhcp.option.perform_router_discover'],
  32: ['Router Solicitation Address', 'ip1', 'dhcp.option.router_solicitation_address'],
  33: ['Static Route', 'route'],
  35: ['ARP Cache Timeout', 'time', 'dhcp.option.arp_cache_timeout'],
  37: ['TCP Default TTL', 'u8', 'dhcp.option.tcp_default_ttl'],
  40: ['Network Information Service Domain', 'str', 'dhcp.option.nis_domain'],
  41: ['Network Information Service Servers', 'ips', 'dhcp.option.nis_server'],
  42: ['Network Time Protocol Servers', 'ips', 'dhcp.option.ntp_server'],
  43: ['Vendor-Specific Information', 'bytes'],
  44: ['NetBIOS over TCP/IP Name Server', 'ips', 'dhcp.option.netbios_over_tcpip_name_server'],
  45: ['NetBIOS over TCP/IP Datagram Distribution Name Server', 'ips', 'dhcp.option.netbios_over_tcpip_dd_name_server'],
  46: ['NetBIOS over TCP/IP Node Type', 'node', 'dhcp.option.netbios_over_tcpip_node_type'],
  47: ['NetBIOS over TCP/IP Scope', 'str', 'dhcp.option.netbios_over_tcpip_scope'],
  50: ['Requested IP Address', 'ip1', 'dhcp.option.requested_ip_address'],
  51: ['IP Address Lease Time', 'time', 'dhcp.option.ip_address_lease_time'],
  52: ['Option Overload', 'u8', 'dhcp.option.option_overload'],
  53: ['DHCP Message Type', 'msg', 'dhcp.option.dhcp'],
  54: ['DHCP Server Identifier', 'ip1', 'dhcp.option.dhcp_server_id'],
  55: ['Parameter Request List', 'prl', 'dhcp.option.request_list_item'],
  56: ['Message', 'str', 'dhcp.option.message'],
  57: ['Maximum DHCP Message Size', 'u16', 'dhcp.option.dhcp_max_message_size'],
  58: ['Renewal Time Value', 'time', 'dhcp.option.renewal_time_value'],
  59: ['Rebinding Time Value', 'time', 'dhcp.option.rebinding_time_value'],
  60: ['Vendor class identifier', 'str', 'dhcp.option.vendor_class_id'],
  61: ['Client identifier', 'cid'],
  66: ['TFTP Server Name', 'str', 'dhcp.option.tftp_server_name'],
  67: ['Bootfile name', 'str', 'dhcp.option.bootfile_name'],
  69: ['SMTP Server', 'ips', 'dhcp.option.smtp_server'],
  70: ['POP3 Server', 'ips', 'dhcp.option.pop3_server'],
  77: ['User Class Information', 'bytes'],
  80: ['Rapid Commit', 'bytes'],
  81: ['Client Fully Qualified Domain Name', 'fqdn'],
  82: ['Agent Information Option', 'agent'],
  93: ['Client System Architecture', 'u16', 'dhcp.option.client_system_architecture'],
  97: ['UUID/GUID-based Client Identifier', 'bytes'],
  100: ['PCode', 'str', 'dhcp.option.pcode'],
  101: ['TCode', 'str', 'dhcp.option.tcode'],
  108: ['IPv6-Only Preferred', 'u32', 'dhcp.option.ipv6_only_preferred'],
  114: ['DHCP Captive-Portal', 'str', 'dhcp.option.captive_portal'],
  116: ['DHCP Auto-Configuration', 'u8', 'dhcp.option.dhcp_auto_configuration'],
  119: ['Domain Search', 'search'],
  121: ['Classless Static Route', 'classless'],
  150: ['TFTP Server Address', 'ips', 'dhcp.option.tftp_server_address'],
  249: ['Private/Classless Static Route (Microsoft)', 'classless'],
  252: ['Private/Proxy autodiscovery', 'str', 'dhcp.option.proxy_auto_discovery'],
  255: ['End', 'end'],
};

const FIELDS = [
  ['dhcp.type', 'Message type', 'uint8', { strings: { 1: 'Boot Request', 2: 'Boot Reply' } }],
  ['dhcp.hw.type', 'Hardware type', 'uint8', { base: 'hex', strings: HWTYPES }],
  ['dhcp.hw.len', 'Hardware address length', 'uint8'],
  ['dhcp.hops', 'Hops', 'uint8'],
  ['dhcp.id', 'Transaction ID', 'uint32', { base: 'hex' }],
  ['dhcp.secs', 'Seconds elapsed', 'uint16'],
  ['dhcp.flags', 'Bootp flags', 'uint16', { base: 'hex' }],
  ['dhcp.flags.bc', 'Broadcast flag', 'bool', { mask: 0x8000, bits: 16, tfs: ['Broadcast', 'Unicast'] }],
  ['dhcp.flags.reserved', 'Reserved flags', 'uint16', { base: 'hex', mask: 0x7fff, bits: 16 }],
  ['dhcp.ip.client', 'Client IP address', 'ipv4'],
  ['dhcp.ip.your', 'Your (client) IP address', 'ipv4'],
  ['dhcp.ip.server', 'Next server IP address', 'ipv4'],
  ['dhcp.ip.relay', 'Relay agent IP address', 'ipv4'],
  ['dhcp.hw.mac_addr', 'Client MAC address', 'ether'],
  ['dhcp.hw.addr', 'Client hardware address', 'bytes'],
  ['dhcp.hw.addr_padding', 'Client hardware address padding', 'bytes'],
  ['dhcp.server', 'Server host name', 'string'],
  ['dhcp.file', 'Boot file name', 'string'],
  ['dhcp.cookie', 'Magic cookie', 'ipv4'],
  ['dhcp.bootp', 'Frame is BOOTP', 'bool'],
  ['dhcp.option.type', 'Option', 'uint8'],
  ['dhcp.option.length', 'Length', 'uint8'],
  ['dhcp.option.value', 'Value', 'bytes'],
  ['dhcp.option.padding', 'Padding', 'bytes'],
  ['dhcp.option.end', 'Option End', 'uint8'],
  ['dhcp.option.static_route.ip', 'Destination IP Address', 'ipv4'],
  ['dhcp.option.static_route.router', 'Destination Router', 'ipv4'],
  ['dhcp.option.classless_static_route', 'Subnet/MaskWidth-Router', 'bytes'],
  ['dhcp.option.dhcp_dns_domain_search_list_fqdn', 'FQDN', 'string'],
  ['dhcp.client_id.type', 'Type', 'uint8'],
  ['dhcp.client_id', 'Identifier', 'bytes'],
  ['dhcp.fqdn.flags', 'Flags', 'uint8', { base: 'hex' }],
  ['dhcp.fqdn.rcode1', 'A-RR result', 'uint8'],
  ['dhcp.fqdn.rcode2', 'PTR-RR result', 'uint8'],
  ['dhcp.fqdn.name', 'Client name', 'string'],
  ['dhcp.option.agent_information_option.agent_circuit_id', 'Agent Circuit ID', 'bytes'],
  ['dhcp.option.agent_information_option.agent_remote_id', 'Agent Remote ID', 'bytes'],
  ['dhcp.option.agent_information_option.value', 'Value', 'bytes'],
];
const seen = new Set(FIELDS.map((f) => f[0]));
for (const [, [name, kind, f]] of Object.entries(OPTS)) {
  if (!f || seen.has(f)) continue;
  seen.add(f);
  const type = { ip1: 'ipv4', ips: 'ipv4', str: 'string', u8: 'uint8', u16: 'uint16', u32: 'uint32', time: 'uint32', i32: 'int32', bool: 'bool', msg: 'uint8', prl: 'uint8', node: 'uint8' }[kind];
  const opts = kind === 'msg' ? { strings: MSG } : kind === 'node' ? { base: 'hex', strings: NODE_TYPES } : kind === 'bool' ? { tfs: ['Enabled', 'Disabled'] } : undefined;
  FIELDS.push([f, kind === 'prl' ? 'Parameter Request List Item' : kind === 'msg' ? 'DHCP' : name, type, opts]);
}

registerProtocol({
  abbrev: 'dhcp', name: 'Dynamic Host Configuration Protocol', short: 'DHCP',
  fields: FIELDS,
  experts: [['dhcp.end_option_missing', 'error', 'Protocol', 'End option missing']],
  tables: { 'udp.port': [67, 68] },
  dissect(ctx, off, end) {
    const d = ctx.d;
    ctx.need(off, 34, end);
    const op = d[off], htype = d[off + 1], hlen = d[off + 2];
    // Columns first, so a truncated message still shows what it is (as Wireshark does)
    const cm = mac(d, off + 28);
    ctx.setProtocol('BOOTP');
    ctx.setInfo(`Boot ${op === 1 ? 'Request' : 'Reply'} from ${ctx.resolve.mac ? resolveMac(cm) : cm} (${cm})`);
    if (end - off < 236) {
      const t0 = ctx.proto('dhcp', off, end - off, 'Dynamic Host Configuration Protocol');
      ctx.add(t0, 'dhcp.type', off, 1, op);
      ctx.add(t0, 'dhcp.hw.type', off + 1, 1, htype);
      ctx.add(t0, 'dhcp.hw.len', off + 2, 1, hlen);
      ctx.add(t0, 'dhcp.hops', off + 3, 1, d[off + 3]);
      ctx.add(t0, 'dhcp.id', off + 4, 4, u32(d, off + 4));
      ctx.need(off, 236, end);
    }
    const xid = u32(d, off + 4), flags = u16(d, off + 10);
    // find the message type first: Info and the protocol label depend on it
    let msgType = 0;
    const cookie = off + 236 + 4 <= end && u32(d, off + 236) === 0x63825363;
    if (cookie) {
      for (let o = off + 240; o < end;) {
        const c = d[o];
        if (c === 255) break;
        if (c === 0) { o++; continue; }
        if (o + 1 >= end) break;
        if (c === 53 && d[o + 1] >= 1 && o + 2 < end) { msgType = d[o + 2]; break; }
        o += 2 + d[o + 1];
      }
    }
    const mname = msgType ? (MSG[msgType] || 'Unknown Message Type') : null;
    ctx.setProtocol(mname ? 'DHCP' : 'BOOTP');
    if (mname) ctx.setInfo(`DHCP ${mname.padEnd(8)} - Transaction ID 0x${xid.toString(16)}`);
    const t = ctx.proto('dhcp', off, end - off, `Dynamic Host Configuration Protocol${mname ? ` (${mname})` : ''}`);
    if (ctx.tree) {
      ctx.add(t, 'dhcp.type', off, 1, op);
      ctx.add(t, 'dhcp.hw.type', off + 1, 1, htype);
      ctx.add(t, 'dhcp.hw.len', off + 2, 1, hlen);
      ctx.add(t, 'dhcp.hops', off + 3, 1, d[off + 3]);
      ctx.add(t, 'dhcp.id', off + 4, 4, xid);
      ctx.add(t, 'dhcp.secs', off + 8, 2, u16(d, off + 8));
      const fn = ctx.add(t, 'dhcp.flags', off + 10, 2, flags, `Bootp flags: ${hexPad(flags, 4)} (${flags & 0x8000 ? 'Broadcast' : 'Unicast'})`);
      ctx.bits(fn, off + 10, 2, flags, ['dhcp.flags.bc', 'dhcp.flags.reserved']);
      ctx.add(t, 'dhcp.ip.client', off + 12, 4, ip4(d, off + 12));
      ctx.add(t, 'dhcp.ip.your', off + 16, 4, ip4(d, off + 16));
      ctx.add(t, 'dhcp.ip.server', off + 20, 4, ip4(d, off + 20));
      ctx.add(t, 'dhcp.ip.relay', off + 24, 4, ip4(d, off + 24));
      if (htype === 1 && hlen === 6) {
        ctx.add(t, 'dhcp.hw.mac_addr', off + 28, 6, mac(d, off + 28));
        ctx.add(t, 'dhcp.hw.addr_padding', off + 34, 10, d.subarray(off + 34, off + 44));
      } else ctx.add(t, 'dhcp.hw.addr', off + 28, 16, d.subarray(off + 28, off + 44));
      cstr(ctx, t, 'dhcp.server', off + 44, 64, 'Server host name not given');
      cstr(ctx, t, 'dhcp.file', off + 108, 128, 'Boot file name not given');
    }
    if (!cookie) {
      ctx.gen(t, 'dhcp.bootp', true);
      return end - off;
    }
    ctx.add(t, 'dhcp.cookie', off + 236, 4, '99.130.83.99', 'Magic cookie: DHCP');
    let o = off + 240, sawEnd = false;
    while (o < end) {
      const c = d[o];
      if (c === 0) {
        // run of pad bytes
        let q = o; while (q < end && d[q] === 0) q++;
        ctx.add(t, 'dhcp.option.padding', o, q - o, d.subarray(o, q));
        o = q; continue;
      }
      if (c === 255) {
        const n = ctx.add(t, 'dhcp.option.type', o, 1, 0, 'Option: (255) End'); // Wireshark stores 0 here
        ctx.add(n, 'dhcp.option.end', o, 1, 255);
        o++; sawEnd = true;
        if (o < end) ctx.add(t, 'dhcp.option.padding', o, end - o, d.subarray(o, end));
        break;
      }
      ctx.need(o, 2, end);
      const len = d[o + 1];
      ctx.need(o + 2, len, end);
      option(ctx, t, c, o, len);
      o += 2 + len;
    }
    if (!sawEnd) ctx.ei(t, 'dhcp.end_option_missing');
    return end - off;
  },
});

function cstr(ctx, t, f, o, n, empty) {
  const d = ctx.d;
  if (d[o] === 0) { ctx.text(t, empty, o, n); return; }
  let l = 0; while (l < n && d[o + l]) l++;
  ctx.add(t, f, o, n, ascii(d, o, l));
}

function option(ctx, t, c, o, len) {
  const d = ctx.d;
  const def = OPTS[c] || [`Unknown`, 'bytes'];
  const [name, kind, f] = def;
  const v = o + 2, ve = v + len;
  if (!ctx.tree) return;
  let label = `Option: (${c}) ${name}`;
  if (kind === 'ip1' && len === 4) label += ` (${ip4(d, v)})`;
  if (kind === 'msg' && len >= 1) label += ` (${MSG[d[v]] || 'Unknown'})`;
  const n = ctx.add(t, 'dhcp.option.type', o, 2 + len, c, label);
  ctx.add(n, 'dhcp.option.length', o + 1, 1, len);
  switch (kind) {
    case 'ip1': case 'ips':
      for (let q = v; q + 4 <= ve; q += 4) ctx.add(n, f, q, 4, ip4(d, q));
      break;
    case 'str': ctx.add(n, f, v, len, utf8(d, v, len).replace(/\0+$/, '')); break;
    case 'u8': ctx.add(n, f, v, 1, d[v]); break;
    case 'node': ctx.add(n, f, v, 1, d[v]); break;
    case 'u16': ctx.add(n, f, v, 2, u16(d, v)); break;
    case 'u32': ctx.add(n, f, v, 4, u32(d, v)); break;
    case 'i32': ctx.add(n, f, v, 4, u32(d, v) | 0); break;
    case 'bool': ctx.add(n, f, v, 1, d[v] !== 0); break;
    case 'time': { const s = u32(d, v); ctx.add(n, f, v, 4, s, `${name}: ${s === 0xffffffff ? 'infinity' : secsStr(s)} (${s})`); break; }
    case 'msg': ctx.add(n, f, v, 1, d[v]); break;
    case 'prl':
      for (let q = v; q < ve; q++) ctx.add(n, f, q, 1, d[q], `Parameter Request List Item: (${d[q]}) ${(OPTS[d[q]] || ['Unknown'])[0]}`);
      break;
    case 'cid':
      if (len === 7 && d[v] === 1) {
        ctx.add(n, 'dhcp.hw.type', v, 1, 1);
        ctx.add(n, 'dhcp.hw.mac_addr', v + 1, 6, mac(d, v + 1));
      } else {
        ctx.add(n, 'dhcp.client_id.type', v, 1, d[v]);
        ctx.add(n, 'dhcp.client_id', v + 1, len - 1, d.subarray(v + 1, ve));
      }
      break;
    case 'route':
      for (let q = v; q + 8 <= ve; q += 8) {
        ctx.add(n, 'dhcp.option.static_route.ip', q, 4, ip4(d, q));
        ctx.add(n, 'dhcp.option.static_route.router', q + 4, 4, ip4(d, q + 4));
      }
      break;
    case 'classless':
      for (let q = v; q < ve;) {
        const w = d[q];
        const nb = (w + 7) >> 3;
        if (w > 32 || q + 1 + nb + 4 > ve) break;
        const net = [0, 0, 0, 0];
        for (let i = 0; i < nb; i++) net[i] = d[q + 1 + i];
        const gw = ip4(d, q + 1 + nb);
        ctx.add(n, 'dhcp.option.classless_static_route', q, 1 + nb + 4, d.subarray(q, q + 1 + nb + 4),
          `Subnet/MaskWidth-Router: ${w === 0 ? 'default' : `${net.join('.')}/${w}`}-${gw}`);
        q += 1 + nb + 4;
      }
      break;
    case 'search': {
      let q = v;
      while (q < ve) {
        try {
          const r = readName(d, q, v, ve);
          ctx.add(n, 'dhcp.option.dhcp_dns_domain_search_list_fqdn', q, r.next - q, r.name);
          q = r.next;
        } catch { break; }
      }
      break;
    }
    case 'fqdn': {
      if (len < 3) break;
      ctx.add(n, 'dhcp.fqdn.flags', v, 1, d[v]);
      ctx.add(n, 'dhcp.fqdn.rcode1', v + 1, 1, d[v + 1]);
      ctx.add(n, 'dhcp.fqdn.rcode2', v + 2, 1, d[v + 2]);
      let nm = '';
      if (d[v] & 4) { try { nm = readName(d, v + 3, v + 3, ve).name; } catch { nm = ''; } } else nm = ascii(d, v + 3, len - 3);
      ctx.add(n, 'dhcp.fqdn.name', v + 3, len - 3, nm);
      break;
    }
    case 'agent':
      for (let q = v; q + 2 <= ve;) {
        const sc = d[q], sl = d[q + 1];
        const f2 = sc === 1 ? 'dhcp.option.agent_information_option.agent_circuit_id' : sc === 2 ? 'dhcp.option.agent_information_option.agent_remote_id' : 'dhcp.option.agent_information_option.value';
        ctx.add(n, f2, q + 2, sl, d.subarray(q + 2, Math.min(q + 2 + sl, ve)));
        q += 2 + sl;
      }
      break;
    default:
      if (len) ctx.add(n, 'dhcp.option.value', v, len, d.subarray(v, ve));
  }
}

// ---------------------------------------------------------------------------------------------
// DHCPv6
const V6MSG = { 1: 'Solicit', 2: 'Advertise', 3: 'Request', 4: 'Confirm', 5: 'Renew', 6: 'Rebind', 7: 'Reply', 8: 'Release', 9: 'Decline', 10: 'Reconfigure', 11: 'Information-request', 12: 'Relay-forw', 13: 'Relay-reply', 14: 'Leasequery', 15: 'Leasequery-reply' };
const V6OPT = { 1: 'Client Identifier', 2: 'Server Identifier', 3: 'Identity Association for Non-temporary Address', 4: 'Identity Association for Temporary Address', 5: 'IA Address', 6: 'Option Request', 7: 'Preference', 8: 'Elapsed time', 9: 'Relay Message', 11: 'Authentication', 12: 'Server unicast', 13: 'Status code', 14: 'Rapid Commit', 15: 'User Class', 16: 'Vendor Class', 17: 'Vendor-specific Information', 18: 'Interface-Id', 19: 'Reconfigure Message', 20: 'Reconfigure Accept', 21: 'SIP Server Domain Name List', 22: 'SIP Servers IPv6 Address List', 23: 'DNS recursive name server', 24: 'Domain Search List', 25: 'Identity Association for Prefix Delegation', 26: 'IA Prefix', 31: 'Simple Network Time Protocol Server', 32: 'Lifetime', 39: 'Client Fully Qualified Domain Name', 56: 'NTP Server', 82: 'SOL_MAX_RT', 83: 'INF_MAX_RT' };
const DUID = { 1: 'link-layer address plus time', 2: 'assigned by vendor based on Enterprise number', 3: 'link-layer address', 4: 'Universally Unique IDentifier (UUID)' };
const STATUS = { 0: 'Success', 1: 'UnspecFail', 2: 'NoAddrsAvail', 3: 'NoBinding', 4: 'NotOnLink', 5: 'UseMulticast (obsolete)', 6: 'NoPrefixAvail' };

registerProtocol({
  abbrev: 'dhcpv6', name: 'DHCPv6', short: 'DHCPv6',
  fields: [
    ['dhcpv6.msgtype', 'Message type', 'uint8', { strings: V6MSG }],
    ['dhcpv6.xid', 'Transaction ID', 'uint24', { base: 'hex' }],
    ['dhcpv6.hopcount', 'Hopcount', 'uint8'],
    ['dhcpv6.linkaddr', 'Link address', 'ipv6'],
    ['dhcpv6.peeraddr', 'Peer address', 'ipv6'],
    ['dhcpv6.option.type', 'Option', 'uint16', { strings: V6OPT }],
    ['dhcpv6.option.length', 'Length', 'uint16'],
    ['dhcpv6.option.data', 'Data', 'bytes'],
    ['dhcpv6.duid.bytes', 'DUID', 'bytes'],
    ['dhcpv6.duid.type', 'DUID Type', 'uint16', { strings: DUID }],
    ['dhcpv6.duidllt.hwtype', 'Hardware type', 'uint16', { strings: HWTYPES }],
    ['dhcpv6.duidllt.time', 'DUID Time', 'abs_time'],
    ['dhcpv6.duidllt.link_layer_addr', 'Link-layer address', 'string'],
    ['dhcpv6.duidllt.link_layer_addr_ether', 'Link-layer address (Ethernet)', 'ether'],
    ['dhcpv6.duidll.hwtype', 'Hardware type', 'uint16', { strings: HWTYPES }],
    ['dhcpv6.duidll.link_layer_addr', 'Link-layer address', 'string'],
    ['dhcpv6.duidll.link_layer_addr_ether', 'Link-layer address (Ethernet)', 'ether'],
    ['dhcpv6.duiden.enterprise', 'Enterprise ID', 'uint32'],
    ['dhcpv6.duiden.identifier', 'Identifier', 'bytes'],
    ['dhcpv6.iaid', 'IAID', 'string'],
    ['dhcpv6.iaid.t1', 'T1', 'uint32'],
    ['dhcpv6.iaid.t2', 'T2', 'uint32'],
    ['dhcpv6.iata', 'IATA', 'string'],
    ['dhcpv6.iaaddr.ip', 'IPv6 address', 'ipv6'],
    ['dhcpv6.iaaddr.pref_lifetime', 'Preferred lifetime', 'uint32'],
    ['dhcpv6.iaaddr.valid_lifetime', 'Valid lifetime', 'uint32'],
    ['dhcpv6.iaprefix.pref_lifetime', 'Preferred lifetime', 'uint32'],
    ['dhcpv6.iaprefix.valid_lifetime', 'Valid lifetime', 'uint32'],
    ['dhcpv6.iaprefix.pref_len', 'Prefix length', 'uint8'],
    ['dhcpv6.iaprefix.pref_addr', 'Prefix address', 'ipv6'],
    ['dhcpv6.requested_option_code', 'Requested Option code', 'uint16', { strings: V6OPT }],
    ['dhcpv6.option_preference', 'Pref-value', 'uint8'],
    ['dhcpv6.elapsed_time', 'Elapsed time', 'uint16'],
    ['dhcpv6.status_code', 'Status Code', 'uint16', { strings: STATUS }],
    ['dhcpv6.status_msg', 'Status Message', 'string'],
    ['dhcpv6.dns_server', 'DNS server address', 'ipv6'],
    ['dhcpv6.sntp_server', 'SNTP server address', 'ipv6'],
    ['dhcpv6.search_list_entry', 'List entry', 'string'],
    ['dhcpv6.client_domain', 'Client Domain Name', 'string'],
    ['dhcpv6.interface_id', 'Interface-ID', 'bytes'],
  ],
  tables: { 'udp.port': [546, 547] },
  dissect(ctx, off, end) {
    ctx.need(off, 4, end);
    ctx.setProtocol('DHCPv6');
    const t = ctx.proto('dhcpv6', off, end - off, 'DHCPv6');
    const info = { cid: '', iaa: '' };
    const s = message(ctx, t, off, end, info);
    ctx.setInfo(s);
    return end - off;
  },
});

function message(ctx, t, off, end, info) {
  const d = ctx.d;
  const mt = d[off];
  let s = `${V6MSG[mt] || 'Unknown'} `;
  ctx.add(t, 'dhcpv6.msgtype', off, 1, mt);
  let o;
  if (mt === 12 || mt === 13) {
    ctx.need(off, 34, end);
    ctx.add(t, 'dhcpv6.hopcount', off + 1, 1, d[off + 1]);
    ctx.add(t, 'dhcpv6.linkaddr', off + 2, 16, ip6(d, off + 2));
    ctx.add(t, 'dhcpv6.peeraddr', off + 18, 16, ip6(d, off + 18));
    s += `L: ${ip6(d, off + 2)} `;
    o = off + 34;
  } else {
    const xid = (d[off + 1] << 16) | (d[off + 2] << 8) | d[off + 3];
    ctx.add(t, 'dhcpv6.xid', off + 1, 3, xid);
    s += `XID: 0x${xid.toString(16)} `;
    o = off + 4;
  }
  options(ctx, t, o, end, info);
  if (info.cid) s += `CID: ${info.cid} `;
  if (info.iaa) s += `IAA: ${info.iaa} `;
  return s;
}

function options(ctx, t, o, end, info) {
  const d = ctx.d;
  while (o + 4 <= end) {
    const code = u16(d, o), len = u16(d, o + 2);
    const v = o + 4, ve = Math.min(v + len, end);
    ctx.need(v, len, end);
    const n = ctx.text(t, V6OPT[code] || 'Unknown', o, 4 + len);
    ctx.add(n, 'dhcpv6.option.type', o, 2, code);
    ctx.add(n, 'dhcpv6.option.length', o + 2, 2, len);
    switch (code) {
      case 1: case 2:
        if (code === 1 && !info.cid) info.cid = hexStr(d, v, len);
        duid(ctx, n, v, ve);
        break;
      case 3: case 25:
        if (len >= 12) {
          ctx.add(n, 'dhcpv6.iaid', v, 4, hexStr(d, v, 4));
          ctx.add(n, 'dhcpv6.iaid.t1', v + 4, 4, u32(d, v + 4));
          ctx.add(n, 'dhcpv6.iaid.t2', v + 8, 4, u32(d, v + 8));
          options(ctx, n, v + 12, ve, info);
        }
        break;
      case 4:
        ctx.add(n, 'dhcpv6.iata', v, 4, hexStr(d, v, 4));
        options(ctx, n, v + 4, ve, info);
        break;
      case 5:
        if (len >= 24) {
          const a = ip6(d, v);
          if (!info.iaa) info.iaa = a;
          ctx.add(n, 'dhcpv6.iaaddr.ip', v, 16, a);
          ctx.add(n, 'dhcpv6.iaaddr.pref_lifetime', v + 16, 4, u32(d, v + 16));
          ctx.add(n, 'dhcpv6.iaaddr.valid_lifetime', v + 20, 4, u32(d, v + 20));
          options(ctx, n, v + 24, ve, info);
        }
        break;
      case 26:
        if (len >= 25) {
          ctx.add(n, 'dhcpv6.iaprefix.pref_lifetime', v, 4, u32(d, v));
          ctx.add(n, 'dhcpv6.iaprefix.valid_lifetime', v + 4, 4, u32(d, v + 4));
          ctx.add(n, 'dhcpv6.iaprefix.pref_len', v + 8, 1, d[v + 8]);
          ctx.add(n, 'dhcpv6.iaprefix.pref_addr', v + 9, 16, ip6(d, v + 9));
          options(ctx, n, v + 25, ve, info);
        }
        break;
      case 6:
        for (let q = v; q + 2 <= ve; q += 2) ctx.add(n, 'dhcpv6.requested_option_code', q, 2, u16(d, q));
        break;
      case 7: ctx.add(n, 'dhcpv6.option_preference', v, 1, d[v]); break;
      case 8: { const e = u16(d, v); ctx.add(n, 'dhcpv6.elapsed_time', v, 2, e, `Elapsed time: ${e * 10}ms`); break; }
      case 13:
        ctx.add(n, 'dhcpv6.status_code', v, 2, u16(d, v));
        if (len > 2) ctx.add(n, 'dhcpv6.status_msg', v + 2, len - 2, utf8(d, v + 2, len - 2));
        break;
      case 23: case 31: {
        let i = 1;
        for (let q = v; q + 16 <= ve; q += 16, i++) {
          const a = ip6(d, q);
          ctx.add(n, code === 23 ? 'dhcpv6.dns_server' : 'dhcpv6.sntp_server', q, 16, a, ` ${i} ${code === 23 ? 'DNS server' : 'SNTP server'} address: ${a}`);
        }
        break;
      }
      case 24: {
        const box = ctx.text(n, 'Domain name suffix search list', v, len);
        let q = v;
        while (q < ve) {
          try { const r = readName(d, q, v, ve); ctx.add(box, 'dhcpv6.search_list_entry', q, r.next - q, r.name + '.', `List entry: ${r.name}.`); q = r.next; } catch { break; }
        }
        break;
      }
      case 9: {
        // relayed message
        const inner = ctx.text(n, 'DHCPv6', v, len);
        message(ctx, inner, v, ve, {});
        break;
      }
      case 18: ctx.add(n, 'dhcpv6.interface_id', v, len, d.subarray(v, ve)); break;
      default:
        if (len) ctx.add(n, 'dhcpv6.option.data', v, len, d.subarray(v, ve));
    }
    o = v + len;
  }
}

function duid(ctx, n, v, ve) {
  const d = ctx.d;
  if (ve - v < 2) return;
  ctx.add(n, 'dhcpv6.duid.bytes', v, ve - v, d.subarray(v, ve));
  const type = u16(d, v);
  ctx.add(n, 'dhcpv6.duid.type', v, 2, type);
  if (type === 1 && ve - v >= 8) {
    const hw = u16(d, v + 2);
    ctx.add(n, 'dhcpv6.duidllt.hwtype', v + 2, 2, hw);
    ctx.add(n, 'dhcpv6.duidllt.time', v + 4, 4, { sec: u32(d, v + 4) + 946684800, nsec: 0 });
    llAddr(ctx, n, 'dhcpv6.duidllt', v + 8, ve, hw);
  } else if (type === 3 && ve - v >= 4) {
    const hw = u16(d, v + 2);
    ctx.add(n, 'dhcpv6.duidll.hwtype', v + 2, 2, hw);
    llAddr(ctx, n, 'dhcpv6.duidll', v + 4, ve, hw);
  } else if (type === 2 && ve - v >= 6) {
    ctx.add(n, 'dhcpv6.duiden.enterprise', v + 2, 4, u32(d, v + 2));
    ctx.add(n, 'dhcpv6.duiden.identifier', v + 6, ve - v - 6, d.subarray(v + 6, ve));
  }
}
function llAddr(ctx, n, p, o, ve, hw) {
  const d = ctx.d;
  ctx.add(n, `${p}.link_layer_addr`, o, ve - o, hexStr(d, o, ve - o, ':'));
  if (hw === 1 && ve - o === 6) ctx.add(n, `${p}.link_layer_addr_ether`, o, 6, mac(d, o));
}

void NULLNODE;
