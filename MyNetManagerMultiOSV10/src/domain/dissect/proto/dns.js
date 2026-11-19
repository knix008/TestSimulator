// DNS (UDP/TCP), mDNS, LLMNR and NBNS.
import { registerProtocol, u16, u32, ip4, ip6, hexPad, ascii, utf8, printable, Malformed, Truncated, NULLNODE } from '../core.js';

// ---------------------------------------------------------------------------------------------
// tables
export const DNS_TYPES = { 0: 'Unused', 1: 'A', 2: 'NS', 3: 'MD', 4: 'MF', 5: 'CNAME', 6: 'SOA', 7: 'MB', 8: 'MG', 9: 'MR', 10: 'NULL', 11: 'WKS', 12: 'PTR', 13: 'HINFO', 14: 'MINFO', 15: 'MX', 16: 'TXT', 17: 'RP', 18: 'AFSDB', 19: 'X25', 20: 'ISDN', 21: 'RT', 22: 'NSAP', 23: 'NSAP-PTR', 24: 'SIG', 25: 'KEY', 26: 'PX', 27: 'GPOS', 28: 'AAAA', 29: 'LOC', 30: 'NXT', 31: 'EID', 32: 'NIMLOC', 33: 'SRV', 34: 'ATMA', 35: 'NAPTR', 36: 'KX', 37: 'CERT', 38: 'A6', 39: 'DNAME', 40: 'SINK', 41: 'OPT', 42: 'APL', 43: 'DS', 44: 'SSHFP', 45: 'IPSECKEY', 46: 'RRSIG', 47: 'NSEC', 48: 'DNSKEY', 49: 'DHCID', 50: 'NSEC3', 51: 'NSEC3PARAM', 52: 'TLSA', 55: 'HIP', 59: 'CDS', 60: 'CDNSKEY', 61: 'OPENPGPKEY', 62: 'CSYNC', 63: 'ZONEMD', 64: 'SVCB', 65: 'HTTPS', 99: 'SPF', 249: 'TKEY', 250: 'TSIG', 251: 'IXFR', 252: 'AXFR', 253: 'MAILB', 254: 'MAILA', 255: 'ANY', 256: 'URI', 257: 'CAA', 32768: 'TA', 32769: 'DLV' };
// Long descriptions Wireshark appends to the type label: "Type: A (1) (Host Address)"
const TYPE_LONG = { 1: 'Host Address', 2: 'authoritative Name Server', 5: 'Canonical NAME for an alias', 6: 'Start Of a zone of Authority', 12: 'domain name PoinTeR', 13: 'host information', 15: 'Mail eXchange', 16: 'Text strings', 28: 'IP6 Address', 33: 'Server Selection', 35: 'Naming Authority PoinTeR', 39: 'Delegation Name', 43: 'Delegation Signer', 46: 'Resource Record Signature', 47: 'Next Secured', 48: 'DNS Public Key', 50: 'Next Secured 3', 52: 'TLSA', 64: 'General Purpose Service Endpoints', 65: 'HTTPS Specific Service Endpoints', 255: 'A request for all records the server/cache has available', 257: 'Certification Authority Restriction', 252: 'transfer of an entire zone', 251: 'incremental transfer' };
const CLASSES = { 1: 'IN', 2: 'CS', 3: 'CH', 4: 'HS', 254: 'NONE', 255: 'ANY' };
const OPCODES = { 0: 'Standard query', 1: 'Inverse query', 2: 'Server status request', 4: 'Zone change notification', 5: 'Dynamic update', 6: 'DNS Stateful operations (DSO)' };
const RCODES = { 0: 'No error', 1: 'Format error', 2: 'Server failure', 3: 'No such name', 4: 'Not implemented', 5: 'Refused', 6: 'Name exists', 7: 'RRset exists', 8: 'RRset does not exist', 9: 'Not authoritative', 10: 'Name out of zone', 11: 'DSO-Type not implemented', 16: 'Bad OPT Version or TSIG Signature Failure', 17: 'Key not recognized', 18: 'Signature out of time window', 19: 'Bad TKEY Mode', 20: 'Duplicate key name', 21: 'Algorithm not supported', 22: 'Bad Truncation', 23: 'Bad/missing Server Cookie' };
const SVC_KEYS = { 0: 'mandatory', 1: 'alpn', 2: 'no-default-alpn', 3: 'port', 4: 'ipv4hint', 5: 'ech', 6: 'ipv6hint', 7: 'dohpath', 8: 'ohttp', 32769: 'odohconfig', 65535: 'key65535' };
const OPT_CODES = { 0: 'Reserved', 1: 'LLQ - Long-lived query', 2: 'UL - Update lease', 3: 'NSID - Name Server Identifier', 4: 'Owner (reserved)', 5: 'DAU - DNSSEC Algorithm Understood (RFC6975)', 6: 'DHU - DS Hash Understood (RFC6975)', 7: 'N3U - NSEC3 Hash Understood (RFC6975)', 8: 'CSUBNET - Client subnet', 9: 'EDNS EXPIRE (RFC7314)', 10: 'COOKIE', 11: 'EDNS TCP Keepalive', 12: 'PADDING', 13: 'CHAIN', 15: 'Extended DNS Error', 18: 'Report-Channel', 19: 'Zone Version' };
const ALGOS = { 1: 'RSA/MD5', 2: 'Diffie-Hellman', 3: 'DSA', 4: 'Elliptic curve crypto', 5: 'RSA/SHA1', 6: 'DSA + NSEC3/SHA1', 7: 'RSA/SHA1 + NSEC3/SHA1', 8: 'RSA/SHA-256', 10: 'RSA/SHA-512', 12: 'GOST R 34.10-2001', 13: 'ECDSA Curve P-256 with SHA-256', 14: 'ECDSA Curve P-384 with SHA-384', 15: 'Ed25519', 16: 'Ed448' };
const DIGESTS = { 0: 'Reserved digest', 1: 'SHA-1', 2: 'SHA-256', 3: 'GOST R 34.11-94', 4: 'SHA-384' };

const SET = ['Set', 'Not set'];

// ---------------------------------------------------------------------------------------------
// field registration (shared by dns/mdns/llmnr: Wireshark uses dns.* fields for all three)
registerProtocol({
  abbrev: 'dns', name: 'Domain Name System', short: 'DNS',
  fields: [
    ['dns.length', 'Length', 'uint16'],
    ['dns.id', 'Transaction ID', 'uint16', { base: 'hex' }],
    ['dns.flags', 'Flags', 'uint16', { base: 'hex' }],
    ['dns.flags.response', 'Response', 'bool', { mask: 0x8000, bits: 16, tfs: ['Message is a response', 'Message is a query'] }],
    ['dns.flags.opcode', 'Opcode', 'uint16', { mask: 0x7800, bits: 16, strings: OPCODES }],
    ['dns.flags.authoritative', 'Authoritative', 'bool', { mask: 0x0400, bits: 16, tfs: ['Server is an authority for domain', 'Server is not an authority for domain'] }],
    ['dns.flags.conflict', 'Conflict', 'bool', { mask: 0x0400, bits: 16, tfs: ['The name is not considered unique', 'The name is considered unique'] }],
    ['dns.flags.truncated', 'Truncated', 'bool', { mask: 0x0200, bits: 16, tfs: ['Message is truncated', 'Message is not truncated'] }],
    ['dns.flags.recdesired', 'Recursion desired', 'bool', { mask: 0x0100, bits: 16, tfs: ['Do query recursively', 'Don\'t do query recursively'] }],
    ['dns.flags.tentative', 'Tentative', 'bool', { mask: 0x0100, bits: 16, tfs: ['Tentative', 'Not tentative'] }],
    ['dns.flags.recavail', 'Recursion available', 'bool', { mask: 0x0080, bits: 16, tfs: ['Server can do recursive queries', 'Server can\'t do recursive queries'] }],
    ['dns.flags.z', 'Z', 'bool', { mask: 0x0040, bits: 16, tfs: ['reserved (1)', 'reserved (0)'] }],
    ['dns.flags.authenticated', 'Answer authenticated', 'bool', { mask: 0x0020, bits: 16, tfs: ['Answer/authority portion was authenticated by the server', 'Answer/authority portion was not authenticated by the server'] }],
    ['dns.flags.ad', 'AD bit', 'bool', { mask: 0x0020, bits: 16, tfs: SET }],
    ['dns.flags.checkdisable', 'Non-authenticated data', 'bool', { mask: 0x0010, bits: 16, tfs: ['Acceptable', 'Unacceptable'] }],
    ['dns.flags.rcode', 'Reply code', 'uint16', { mask: 0x000f, bits: 16, strings: RCODES }],
    ['dns.count.queries', 'Questions', 'uint16'],
    ['dns.count.zones', 'Zones', 'uint16'],
    ['dns.count.answers', 'Answer RRs', 'uint16'],
    ['dns.count.prerequisites', 'Prerequisites', 'uint16'],
    ['dns.count.auth_rr', 'Authority RRs', 'uint16'],
    ['dns.count.updates', 'Updates', 'uint16'],
    ['dns.count.add_rr', 'Additional RRs', 'uint16'],
    ['dns.qry.name', 'Name', 'string'],
    ['dns.qry.name.len', 'Name Length', 'uint16'],
    ['dns.count.labels', 'Label Count', 'uint16'],
    ['dns.qry.type', 'Type', 'uint16', { strings: DNS_TYPES }],
    ['dns.qry.class', 'Class', 'uint16', { base: 'hex', strings: CLASSES }],
    ['dns.qry.qu', '"QU" question', 'bool', { mask: 0x8000, bits: 16 }],
    ['dns.resp.name', 'Name', 'string'],
    ['dns.resp.type', 'Type', 'uint16', { strings: DNS_TYPES }],
    ['dns.resp.class', 'Class', 'uint16', { base: 'hex', strings: CLASSES }],
    ['dns.resp.cache_flush', 'Cache flush', 'bool', { mask: 0x8000, bits: 16 }],
    ['dns.resp.ttl', 'Time to live', 'uint32'],
    ['dns.resp.len', 'Data length', 'uint16'],
    ['dns.resp.ext_rcode', 'Higher bits in extended RCODE', 'uint8', { base: 'hex' }],
    ['dns.resp.edns0_version', 'EDNS0 version', 'uint8'],
    ['dns.resp.z', 'Z', 'uint16', { base: 'hex' }],
    ['dns.resp.z.do', 'DO bit', 'bool', { mask: 0x8000, bits: 16, tfs: ['Accepts DNSSEC security RRs', 'Cannot handle DNSSEC security RRs'] }],
    ['dns.resp.z.reserved', 'Reserved', 'uint16', { base: 'hex', mask: 0x7fff, bits: 16 }],
    ['dns.rr.udp_payload_size', 'UDP payload size', 'uint16'],
    ['dns.a', 'Address', 'ipv4'],
    ['dns.aaaa', 'AAAA Address', 'ipv6'],
    ['dns.cname', 'CNAME', 'string'],
    ['dns.ns', 'Name Server', 'string'],
    ['dns.dname', 'Dname', 'string'],
    ['dns.ptr.domain_name', 'Domain Name', 'string'],
    ['dns.mx.preference', 'Preference', 'uint16'],
    ['dns.mx.mail_exchange', 'Mail Exchange', 'string'],
    ['dns.txt.length', 'TXT Length', 'uint8'],
    ['dns.txt', 'TXT', 'string'],
    ['dns.hinfo.cpu_length', 'CPU Length', 'uint8'],
    ['dns.hinfo.cpu', 'CPU', 'string'],
    ['dns.hinfo.os_length', 'OS Length', 'uint8'],
    ['dns.hinfo.os', 'OS', 'string'],
    ['dns.soa.mname', 'Primary name server', 'string'],
    ['dns.soa.rname', 'Responsible authority\'s mailbox', 'string'],
    ['dns.soa.rname.name', "Responsible authority's mailbox name", 'string'],
    ['dns.soa.serial_number', 'Serial Number', 'uint32'],
    ['dns.soa.refresh_interval', 'Refresh Interval', 'uint32'],
    ['dns.soa.retry_interval', 'Retry Interval', 'uint32'],
    ['dns.soa.expire_limit', 'Expire limit', 'uint32'],
    ['dns.soa.minimum_ttl', 'Minimum TTL', 'uint32'],
    ['dns.srv.instance', 'Instance', 'string'],
    ['dns.srv.service', 'Service', 'string'],
    ['dns.srv.proto', 'Protocol', 'string'],
    ['dns.srv.name', 'Name', 'string'],
    ['dns.srv.priority', 'Priority', 'uint16'],
    ['dns.srv.weight', 'Weight', 'uint16'],
    ['dns.srv.port', 'Port', 'uint16'],
    ['dns.srv.target', 'Target', 'string'],
    ['dns.naptr.order', 'Order', 'uint16'],
    ['dns.naptr.preference', 'Preference', 'uint16'],
    ['dns.naptr.flags_length', 'Flags Length', 'uint8'],
    ['dns.naptr.flags', 'Flags', 'string'],
    ['dns.naptr.service_length', 'Service Length', 'uint8'],
    ['dns.naptr.service', 'Service', 'string'],
    ['dns.naptr.regex_length', 'Regex Length', 'uint8'],
    ['dns.naptr.regex', 'Regex', 'string'],
    ['dns.naptr.replacement_length', 'Replacement Length', 'uint8'],
    ['dns.naptr.replacement', 'Replacement', 'string'],
    ['dns.caa.flags', 'CAA Flags', 'uint8', { base: 'hex' }],
    ['dns.caa.flags.issuer_critical', 'Issuer Critical', 'bool', { mask: 0x80, bits: 8, tfs: ['Critical for this domain', 'Not critical'] }],
    ['dns.caa.tag_length', 'Tag length', 'uint8'],
    ['dns.caa.tag', 'Tag', 'string'],
    ['dns.caa.value', 'Value', 'string'],
    ['dns.caa.issue', 'Issue', 'string'],
    ['dns.caa.issuewild', 'Issue Wildcard', 'string'],
    ['dns.caa.iodef', 'Report URL', 'string'],
    ['dns.ds.key_id', 'Key id', 'uint16', { base: 'hex' }],
    ['dns.ds.algorithm', 'Algorithm', 'uint8', { strings: ALGOS }],
    ['dns.ds.digest_type', 'Digest Type', 'uint8', { strings: DIGESTS }],
    ['dns.ds.digest', 'Digest', 'bytes'],
    ['dns.dnskey.flags', 'Flags', 'uint16', { base: 'hex' }],
    ['dns.dnskey.flags.zone_key', 'Zone Key', 'bool', { mask: 0x100, bits: 16, tfs: ['This is the zone key for specified zone', 'This is not a zone key'] }],
    ['dns.dnskey.flags.key_revoked', 'Key Revoked', 'bool', { mask: 0x80, bits: 16, tfs: ['Yes', 'No'] }],
    ['dns.dnskey.flags.secure_entry_point', 'Key Signing Key', 'bool', { mask: 0x1, bits: 16, tfs: ['Yes', 'No'] }],
    ['dns.dnskey.protocol', 'Protocol', 'uint8'],
    ['dns.dnskey.algorithm', 'Algorithm', 'uint8', { strings: ALGOS }],
    ['dns.dnskey.key_id', 'Key id', 'uint16'],
    ['dns.dnskey.public_key', 'Public Key', 'bytes'],
    ['dns.rrsig.type_covered', 'Type Covered', 'uint16', { strings: DNS_TYPES }],
    ['dns.rrsig.algorithm', 'Algorithm', 'uint8', { strings: ALGOS }],
    ['dns.rrsig.labels', 'Labels', 'uint8'],
    ['dns.rrsig.original_ttl', 'Original TTL', 'uint32'],
    ['dns.rrsig.signature_expiration', 'Signature Expiration', 'abs_time'],
    ['dns.rrsig.signature_inception', 'Signature Inception', 'abs_time'],
    ['dns.rrsig.key_tag', 'Key Tag', 'uint16'],
    ['dns.rrsig.signers_name', 'Signer\'s name', 'string'],
    ['dns.rrsig.signature', 'Signature', 'bytes'],
    ['dns.nsec.next_domain_name', 'Next Domain Name', 'string'],
    ['dns.svcb.svcpriority', 'SvcPriority', 'uint16'],
    ['dns.svcb.targetname', 'TargetName', 'string'],
    ['dns.svcb.svcparam', 'SvcParam', 'none'],
    ['dns.svcb.svcparam.key', 'SvcParamKey', 'uint16', { strings: SVC_KEYS }],
    ['dns.svcb.svcparam.value.length', 'SvcParamValue length', 'uint16'],
    ['dns.svcb.svcparam.value', 'SvcParamValue', 'bytes'],
    ['dns.svcb.svcparam.mandatory.key', 'Mandatory key', 'uint16', { strings: SVC_KEYS }],
    ['dns.svcb.svcparam.alpn.length', 'ALPN length', 'uint8'],
    ['dns.svcb.svcparam.alpn', 'ALPN', 'string'],
    ['dns.svcb.svcparam.port', 'Port', 'uint16'],
    ['dns.svcb.svcparam.ipv4hint.ip', 'IP', 'ipv4'],
    ['dns.svcb.svcparam.ipv6hint.ip', 'IP', 'ipv6'],
    ['dns.svcb.svcparam.dohpath', 'DoH path', 'string'],
    ['dns.opt', 'Option', 'none'],
    ['dns.opt.code', 'Option Code', 'uint16', { strings: OPT_CODES }],
    ['dns.opt.len', 'Option Length', 'uint16'],
    ['dns.opt.data', 'Option Data', 'bytes'],
    ['dns.opt.client.family', 'Family', 'uint16', { strings: { 1: 'IPv4', 2: 'IPv6' } }],
    ['dns.opt.client.netmask', 'Source Netmask', 'uint8'],
    ['dns.opt.client.scope', 'Scope Netmask', 'uint8'],
    ['dns.opt.client.addr', 'Client Subnet', 'bytes'],
    ['dns.opt.client.addr4', 'Client Subnet', 'ipv4'],
    ['dns.opt.client.addr6', 'Client Subnet', 'ipv6'],
    ['dns.opt.cookie.client', 'Client Cookie', 'bytes'],
    ['dns.opt.cookie.server', 'Server Cookie', 'bytes'],
    ['dns.opt.ext_error.info_code', 'Info Code', 'uint16'],
    ['dns.opt.ext_error.extra_text', 'Extra Text', 'string'],
    ['dns.data', 'Data', 'bytes'],
    ['dns.response_in', 'Response In', 'framenum'],
    ['dns.response_to', 'Request In', 'framenum'],
    ['dns.time', 'Time', 'rel_time'],
    ['dns.retransmission', 'Retransmission', 'bool'],
    ['dns.retransmit_request_in', 'Retransmitted request. Original request in', 'framenum'],
    ['dns.retransmit_response_in', 'Retransmitted response. Original response in', 'framenum'],
    ['dns.unsolicited', 'Unsolicited', 'bool'],
  ],
  experts: [
    ['dns.retransmit_request', 'warn', 'Protocol', 'DNS query retransmission'],
    ['dns.retransmit_response', 'warn', 'Protocol', 'DNS response retransmission'],
    ['dns.response_missing', 'warn', 'Protocol', 'DNS response missing'],
  ],
  tables: { 'udp.port': [53], 'tcp.port': [53] },
  dissect(ctx, off, end) {
    if (ctx.ptype === 'tcp') return dissectTcpDns(ctx, off, end);
    return dissectDns(ctx, off, end, 'dns');
  },
  tcpPdu(ctx, off, end) {
    if (end - off < 2) return -1;
    return 2 + u16(ctx.d, off);
  },
});
registerProtocol({
  abbrev: 'mdns', name: 'Multicast Domain Name System', short: 'MDNS',
  tables: { 'udp.port': [5353] },
  dissect(ctx, off, end) { return dissectDns(ctx, off, end, 'mdns'); },
});
registerProtocol({
  abbrev: 'llmnr', name: 'Link-local Multicast Name Resolution', short: 'LLMNR',
  tables: { 'udp.port': [5355], 'tcp.port': [5355] },
  dissect(ctx, off, end) { return dissectDns(ctx, off, end, 'llmnr'); },
});

function dissectTcpDns(ctx, off, end) {
  const d = ctx.d;
  ctx.need(off, 2, end);
  const len = u16(d, off);
  // The length prefix is part of the DNS tree in Wireshark.
  return dissectDns(ctx, off + 2, Math.min(end, off + 2 + len), 'dns', off);
}

// ---------------------------------------------------------------------------------------------
// name decoding
const MAX_JUMPS = 64;
/**
 * Decode a (possibly compressed) domain name. base: start of the DNS message (pointer origin).
 * Returns { name, next, labels }; throws Malformed on loops / out-of-range pointers.
 */
export function readName(d, o, base, end) {
  let name = '';
  let labels = 0;
  let next = -1;
  let jumps = 0;
  let total = 0;
  for (;;) {
    if (o >= end) throw new Truncated(end + 1);
    const l = d[o];
    if (l === 0) { if (next < 0) next = o + 1; break; }
    if ((l & 0xc0) === 0xc0) {
      if (o + 1 >= end) throw new Truncated(end + 1);
      const p = base + (((l & 0x3f) << 8) | d[o + 1]);
      if (next < 0) next = o + 2;
      if (p >= end) throw new Truncated(p + 1);
      // Wireshark reports loops as a name instead of an exception
      if (++jumps > MAX_JUMPS) return { name: '<Name contains a pointer that loops>', next, labels: 1, len: 36 };
      o = p;
      continue;
    }
    if (l & 0xc0) throw new Malformed('Unknown DNS label type');
    if (o + 1 + l > end) throw new Truncated(o + 1 + l);
    let lab = '';
    for (let i = 0; i < l; i++) {
      const c = d[o + 1 + i];
      lab += c === 0x2e ? '\\.' : (c >= 0x20 && c < 0x7f ? String.fromCharCode(c) : '\\' + String(c).padStart(3, '0'));
    }
    name += (name ? '.' : '') + lab;
    labels++;
    total += l + 1;
    if (total > 255) throw new Malformed('DNS name too long');
    o += 1 + l;
  }
  return { name: name || '<Root>', next, labels, len: name.length };
}

/** "1 hour, 2 minutes, 3 seconds" as Wireshark's unsigned_time_secs_to_str. */
export function secsStr(v) {
  if (v === 0) return '0 seconds';
  const parts = [];
  const days = Math.floor(v / 86400); v %= 86400;
  const h = Math.floor(v / 3600); v %= 3600;
  const m = Math.floor(v / 60); const s = v % 60;
  if (days) parts.push(`${days} day${days === 1 ? '' : 's'}`);
  if (h) parts.push(`${h} hour${h === 1 ? '' : 's'}`);
  if (m) parts.push(`${m} minute${m === 1 ? '' : 's'}`);
  if (s) parts.push(`${s} second${s === 1 ? '' : 's'}`);
  return parts.join(', ');
}

const typeName = (t) => DNS_TYPES[t] || `Unknown (${t})`;
const className = (c) => CLASSES[c] || `Unknown (0x${c.toString(16).padStart(4, '0')})`;
function typeLabel(t) {
  const l = TYPE_LONG[t];
  return `Type: ${typeName(t)} (${t})${l ? ` (${l})` : ''}`;
}

// ---------------------------------------------------------------------------------------------
// message
function dissectDns(ctx, off, end, kind, lenOff) {
  const d = ctx.d;
  ctx.need(off, 12, end);
  const id = u16(d, off), flags = u16(d, off + 2);
  const qd = u16(d, off + 4), an = u16(d, off + 6), ns = u16(d, off + 8), ar = u16(d, off + 10);
  const isResp = (flags & 0x8000) !== 0;
  const opcode = (flags >> 11) & 15, rcode = flags & 15;
  const short = kind === 'mdns' ? 'MDNS' : kind === 'llmnr' ? 'LLMNR' : 'DNS';
  ctx.setProtocol(short);
  const start = lenOff !== undefined ? lenOff : off;
  const t = ctx.proto(kind, start, end - start);
  const update = opcode === 5;
  const opStr = OPCODES[opcode] || `Unknown operation (${opcode})`;
  let info = opStr + (isResp ? ' response' : '') + ' ' + hexPad(id, 4);
  if (isResp && rcode) info += ' ' + (RCODES[rcode] || `Unknown error (${rcode})`);
  let idNode = NULLNODE;
  if (ctx.tree) {
    t.label = `${FIELD_NAME[kind]} (${isResp ? 'response' : 'query'})`;
    if (lenOff !== undefined) ctx.add(t, 'dns.length', lenOff, 2, end - off);
    idNode = ctx.add(t, 'dns.id', off, 2, id);
    let fl = `Flags: ${hexPad(flags, 4)} ${opStr}${isResp ? ' response' : ''}`;
    if (isResp) fl += ', ' + (RCODES[rcode] || 'Unknown error');
    const fn = ctx.add(t, 'dns.flags', off + 2, 2, flags, fl);
    const bits = ['dns.flags.response', 'dns.flags.opcode'];
    if (kind === 'llmnr') {
      if (isResp) bits.push('dns.flags.conflict');
      else { ctx.bits(fn, off + 2, 2, flags, bits); bits.length = 0; ctx.add(fn, 'dns.flags.conflict', off + 2, 2, (flags & 0x400) !== 0, `.... .${(flags >> 10) & 1}.. .... .... = Conflict: ${flags & 0x400 ? 'The sender received multiple responses' : 'None'}`); }
      bits.push('dns.flags.truncated', 'dns.flags.tentative');
      if (isResp) bits.push('dns.flags.rcode');
    } else {
      if (isResp) bits.push('dns.flags.authoritative');
      bits.push('dns.flags.truncated', 'dns.flags.recdesired');
      if (isResp) bits.push('dns.flags.recavail');
      bits.push('dns.flags.z');
      if (isResp) bits.push('dns.flags.authenticated');
      bits.push('dns.flags.checkdisable');
      if (isResp) bits.push('dns.flags.rcode');
    }
    ctx.bits(fn, off + 2, 2, flags, bits);
    ctx.add(t, update ? 'dns.count.zones' : 'dns.count.queries', off + 4, 2, qd);
    ctx.add(t, update ? 'dns.count.prerequisites' : 'dns.count.answers', off + 6, 2, an);
    ctx.add(t, update ? 'dns.count.updates' : 'dns.count.auth_rr', off + 8, 2, ns);
    ctx.add(t, 'dns.count.add_rr', off + 10, 2, ar);
  }
  let o = off + 12;
  const st = { info: '', kind, base: off, end };
  // Info is updated as sections are parsed, so a malformed tail keeps what was decoded (as Wireshark)
  ctx.setInfo(info);
  if (qd) {
    const box = ctx.text(t, update ? 'Zone' : 'Queries', o, 0);
    const s = o;
    for (let i = 0; i < qd; i++) { o = question(ctx, box, o, st); ctx.setInfo(info + st.info); }
    if (box !== NULLNODE) box.length = o - s;
  }
  // Answers (and authority/additional) are added to Info like Wireshark's dissect_answer_records.
  const secs = [[an, update ? 'Prerequisites' : 'Answers', true], [ns, update ? 'Updates' : 'Authoritative nameservers', true], [ar, 'Additional records', true]];
  for (const [n, title, addInfo] of secs) {
    if (!n) continue;
    const box = ctx.text(t, title, o, 0);
    const s = o;
    for (let i = 0; i < n; i++) { o = record(ctx, box, o, st, addInfo); ctx.setInfo(info + st.info); }
    if (box !== NULLNODE) box.length = o - s;
  }
  ctx.setInfo(info + st.info);
  match(ctx, t, kind, id, isResp, idNode);
  return end - start;
}
const FIELD_NAME = { dns: 'Domain Name System', mdns: 'Multicast Domain Name System', llmnr: 'Link-local Multicast Name Resolution' };

function question(ctx, box, o, st) {
  const d = ctx.d;
  const nm = readName(d, o, st.base, st.end);
  const p = nm.next;
  ctx.need(p, 4, st.end);
  const type = u16(d, p), cls = u16(d, p + 2);
  const mdns = st.kind === 'mdns';
  const qu = mdns && (cls & 0x8000) !== 0;
  const c = mdns ? cls & 0x7fff : cls;
  st.info += ` ${typeName(type)} ${nm.name}` + (mdns ? `, "${qu ? 'QU' : 'QM'}" question` : '');
  if (ctx.tree) {
    const q = ctx.text(box, `${nm.name}: type ${typeName(type)}, class ${className(c)}` + (mdns ? `, "${qu ? 'QU' : 'QM'}" question` : ''), o, p + 4 - o);
    ctx.add(q, 'dns.qry.name', o, p - o, nm.name);
    ctx.gen(q, 'dns.qry.name.len', nm.len === 6 && nm.name === '<Root>' ? 0 : nm.len);
    ctx.gen(q, 'dns.count.labels', nm.labels);
    ctx.add(q, 'dns.qry.type', p, 2, type, typeLabel(type));
    if (mdns) {
      ctx.add(q, 'dns.qry.class', p + 2, 2, c, `.${bin15(c)} = Class: ${className(c)} (${hexPad(c, 4)})`);
      ctx.add(q, 'dns.qry.qu', p + 2, 2, qu);
    } else ctx.add(q, 'dns.qry.class', p + 2, 2, c, `Class: ${className(c)} (${hexPad(c, 4)})`);
  }
  return p + 4;
}

function bin15(v) {
  let s = '';
  for (let i = 14; i >= 0; i--) { s += (v >> i) & 1; if (i % 4 === 0 && i) s += ' '; }
  return s;
}

function record(ctx, box, o, st, addInfo) {
  const d = ctx.d;
  const nm = readName(d, o, st.base, st.end);
  const p = nm.next;
  ctx.need(p, 10, st.end);
  const type = u16(d, p), cls = u16(d, p + 2), ttl = u32(d, p + 4), rdlen = u16(d, p + 8);
  const r = p + 10;
  ctx.need(r, rdlen, st.end);
  const rend = r + rdlen;
  const mdns = st.kind === 'mdns';
  const flush = mdns && type !== 41 && (cls & 0x8000) !== 0;
  const c = mdns && type !== 41 ? cls & 0x7fff : cls;
  // summary text used for both the tree label and Info
  let summary = '';
  let infoTail = '';
  let rr = NULLNODE;
  const tree = ctx.tree;
  if (tree) {
    rr = ctx.text(box, '', o, rend - o);
    const labs = type === 33 ? nm.name.split('.') : null;
      if (labs && labs.length >= 2 && labs[0][0] === '_' && labs[1][0] === '_') {
      // Wireshark splits SRV owner names instead of adding dns.resp.name
      ctx.add(rr, 'dns.srv.service', o, p - o, labs[0]);
      ctx.add(rr, 'dns.srv.proto', o, p - o, labs[1]);
      ctx.add(rr, 'dns.srv.name', o, p - o, labs.slice(2).join('.'));
    } else if (labs && labs.length >= 3 && labs[0][0] !== '_' && labs[1][0] === '_' && labs[2][0] === '_') {
      ctx.add(rr, 'dns.srv.instance', o, p - o, labs[0]);
      ctx.add(rr, 'dns.srv.service', o, p - o, labs[1]);
      ctx.add(rr, 'dns.srv.proto', o, p - o, labs[2]);
      ctx.add(rr, 'dns.srv.name', o, p - o, labs.slice(3).join('.'));
    } else ctx.add(rr, 'dns.resp.name', o, p - o, nm.name);
    ctx.add(rr, 'dns.resp.type', p, 2, type, typeLabel(type));
  }
  if (type === 41) {
    if (tree) {
      ctx.add(rr, 'dns.rr.udp_payload_size', p + 2, 2, cls);
      ctx.add(rr, 'dns.resp.ext_rcode', p + 4, 1, d[p + 4]);
      ctx.add(rr, 'dns.resp.edns0_version', p + 5, 1, d[p + 5]);
      const z = u16(d, p + 6);
      const zn = ctx.add(rr, 'dns.resp.z', p + 6, 2, z);
      ctx.bits(zn, p + 6, 2, z, ['dns.resp.z.do', 'dns.resp.z.reserved']);
      ctx.add(rr, 'dns.resp.len', p + 8, 2, rdlen);
      ednsOptions(ctx, rr, r, rend);
      rr.label = `${nm.name}: type OPT`;
    }
    if (addInfo) st.info += ' OPT';
    return rend;
  }
  if (tree) {
    if (mdns) {
      ctx.add(rr, 'dns.resp.class', p + 2, 2, c, `.${bin15(c)} = Class: ${className(c)} (${hexPad(c, 4)})`);
      ctx.add(rr, 'dns.resp.cache_flush', p + 2, 2, flush);
    } else ctx.add(rr, 'dns.resp.class', p + 2, 2, c, `Class: ${className(c)} (${hexPad(c, 4)})`);
    ctx.add(rr, 'dns.resp.ttl', p + 4, 4, ttl, `Time to live: ${ttl} (${secsStr(ttl)})`);
    ctx.add(rr, 'dns.resp.len', p + 8, 2, rdlen);
  }
  const N = (q) => readName(d, q, st.base, st.end);
  switch (type) {
    case 1:
      if (rdlen === 4) { const a = ip4(d, r); summary = `addr ${a}`; infoTail = a; ctx.add(rr, 'dns.a', r, 4, a); }
      break;
    case 28:
      if (rdlen === 16) { const a = ip6(d, r); summary = `addr ${a}`; infoTail = a; ctx.add(rr, 'dns.aaaa', r, 16, a); }
      break;
    case 5: case 2: case 12: case 39: {
      const n = N(r).name;
      const f = type === 5 ? 'dns.cname' : type === 2 ? 'dns.ns' : type === 12 ? 'dns.ptr.domain_name' : 'dns.dname';
      summary = (type === 5 ? 'cname ' : type === 2 ? 'ns ' : type === 39 ? 'dname ' : '') + n;
      infoTail = n;
      ctx.add(rr, f, r, rdlen, n);
      break;
    }
    case 15: {
      const pref = u16(d, r), n = N(r + 2).name;
      summary = `preference ${pref}, mx ${n}`;
      infoTail = `${pref} ${n}`;
      ctx.add(rr, 'dns.mx.preference', r, 2, pref);
      ctx.add(rr, 'dns.mx.mail_exchange', r + 2, rdlen - 2, n);
      break;
    }
    case 6: {
      const m = N(r), rn = N(m.next);
      let q = rn.next;
      ctx.need(q, 20, rend);
      summary = `mname ${m.name}`;
      infoTail = m.name;
      if (tree) {
        ctx.add(rr, 'dns.soa.mname', r, m.next - r, m.name);
        const rnn = ctx.add(rr, 'dns.soa.rname', m.next, rn.next - m.next, rn.name);
        const dot = rn.name.indexOf('.');
        if (dot > 0) ctx.gen(rr, 'dns.soa.rname.name', rn.name.slice(0, dot) + '@' + rn.name.slice(dot + 1));
        ctx.add(rr, 'dns.soa.serial_number', q, 4, u32(d, q));
        const iv = (f, at, lab) => { const v = u32(d, at); ctx.add(rr, f, at, 4, v, `${lab}: ${v} (${secsStr(v)})`); };
        iv('dns.soa.refresh_interval', q + 4, 'Refresh Interval');
        iv('dns.soa.retry_interval', q + 8, 'Retry Interval');
        iv('dns.soa.expire_limit', q + 12, 'Expire limit');
        iv('dns.soa.minimum_ttl', q + 16, 'Minimum TTL');
      }
      break;
    }
    case 16: case 99: {
      let q = r;
      const parts = [];
      while (q < rend) {
        const l = d[q];
        ctx.need(q + 1, l, rend);
        const s = utf8(d, q + 1, l);
        parts.push(s);
        ctx.add(rr, 'dns.txt.length', q, 1, l);
        ctx.add(rr, 'dns.txt', q + 1, l, s);
        q += 1 + l;
      }
      break;
    }
    case 13: {
      const cl = d[r];
      const cpu = ascii(d, r + 1, cl);
      const ol = d[r + 1 + cl];
      const os = ascii(d, r + 2 + cl, ol);
      ctx.add(rr, 'dns.hinfo.cpu_length', r, 1, cl);
      ctx.add(rr, 'dns.hinfo.cpu', r + 1, cl, cpu);
      ctx.add(rr, 'dns.hinfo.os_length', r + 1 + cl, 1, ol);
      ctx.add(rr, 'dns.hinfo.os', r + 2 + cl, ol, os);
      break;
    }
    case 33: {
      ctx.need(r, 6, rend);
      const pr = u16(d, r), w = u16(d, r + 2), port = u16(d, r + 4), tg = N(r + 6).name;
      summary = `priority ${pr}, weight ${w}, port ${port}, target ${tg}`;
      infoTail = `${pr} ${w} ${port} ${tg}`;
      if (tree) {
        ctx.add(rr, 'dns.srv.priority', r, 2, pr);
        ctx.add(rr, 'dns.srv.weight', r + 2, 2, w);
        ctx.add(rr, 'dns.srv.port', r + 4, 2, port);
        ctx.add(rr, 'dns.srv.target', r + 6, rdlen - 6, tg);
      }
      break;
    }
    case 35: {
      ctx.need(r, 4, rend);
      const ord = u16(d, r), pref = u16(d, r + 2);
      let q = r + 4;
      const str = (fl, fs) => { const l = d[q]; const s = ascii(d, q + 1, l); ctx.add(rr, fl, q, 1, l); ctx.add(rr, fs, q + 1, l, s); q += 1 + l; return s; };
      ctx.add(rr, 'dns.naptr.order', r, 2, ord);
      ctx.add(rr, 'dns.naptr.preference', r + 2, 2, pref);
      const fl = str('dns.naptr.flags_length', 'dns.naptr.flags');
      const sv = str('dns.naptr.service_length', 'dns.naptr.service');
      str('dns.naptr.regex_length', 'dns.naptr.regex');
      const rp = N(q);
      ctx.gen(rr, 'dns.naptr.replacement_length', rp.len);
      ctx.add(rr, 'dns.naptr.replacement', q, rend - q, rp.name);
      summary = `order ${ord}, preference ${pref}, flags ${fl}`;
      infoTail = `${ord} ${pref} ${fl}`;
      break;
    }
    case 257: {
      const fl = d[r], tl = d[r + 1];
      const tag = ascii(d, r + 2, tl);
      const val = ascii(d, r + 2 + tl, rend - (r + 2 + tl));
      if (tree) {
        const fn = ctx.add(rr, 'dns.caa.flags', r, 1, fl);
        ctx.bits(fn, r, 1, fl, ['dns.caa.flags.issuer_critical']);
        // Wireshark groups tag and value under an item named after the tag
        const vf = tag === 'issue' ? 'dns.caa.issue' : tag === 'issuewild' ? 'dns.caa.issuewild' : tag === 'iodef' ? 'dns.caa.iodef' : 'dns.caa.value';
        const tn = vf === 'dns.caa.value' ? ctx.text(rr, `${tag}: ${val}`, r + 1, rend - r - 1) : ctx.add(rr, vf, r + 1, rend - r - 1, val);
        ctx.add(tn, 'dns.caa.tag_length', r + 1, 1, tl);
        ctx.add(tn, 'dns.caa.tag', r + 2, tl, tag);
        ctx.add(tn, 'dns.caa.value', r + 2 + tl, rend - r - 2 - tl, val);
      }
      break;
    }
    case 43: {
      ctx.need(r, 4, rend);
      ctx.add(rr, 'dns.ds.key_id', r, 2, u16(d, r));
      ctx.add(rr, 'dns.ds.algorithm', r + 2, 1, d[r + 2]);
      ctx.add(rr, 'dns.ds.digest_type', r + 3, 1, d[r + 3]);
      ctx.add(rr, 'dns.ds.digest', r + 4, rdlen - 4, d.subarray(r + 4, rend));
      break;
    }
    case 48: {
      ctx.need(r, 4, rend);
      const fl = u16(d, r);
      if (tree) {
        const fn = ctx.add(rr, 'dns.dnskey.flags', r, 2, fl);
        ctx.bits(fn, r, 2, fl, ['dns.dnskey.flags.zone_key', 'dns.dnskey.flags.key_revoked', 'dns.dnskey.flags.secure_entry_point']);
        ctx.add(rr, 'dns.dnskey.protocol', r + 2, 1, d[r + 2]);
        ctx.add(rr, 'dns.dnskey.algorithm', r + 3, 1, d[r + 3]);
        ctx.gen(rr, 'dns.dnskey.key_id', keyTag(d, r, rdlen));
        ctx.add(rr, 'dns.dnskey.public_key', r + 4, rdlen - 4, d.subarray(r + 4, rend));
      }
      break;
    }
    case 46: {
      ctx.need(r, 18, rend);
      if (tree) {
        ctx.add(rr, 'dns.rrsig.type_covered', r, 2, u16(d, r), `Type Covered: ${typeName(u16(d, r))} (${u16(d, r)})`);
        ctx.add(rr, 'dns.rrsig.algorithm', r + 2, 1, d[r + 2]);
        ctx.add(rr, 'dns.rrsig.labels', r + 3, 1, d[r + 3]);
        const ot = u32(d, r + 4);
        ctx.add(rr, 'dns.rrsig.original_ttl', r + 4, 4, ot, `Original TTL: ${ot} (${secsStr(ot)})`);
        ctx.add(rr, 'dns.rrsig.signature_expiration', r + 8, 4, { sec: u32(d, r + 8), nsec: 0 });
        ctx.add(rr, 'dns.rrsig.signature_inception', r + 12, 4, { sec: u32(d, r + 12), nsec: 0 });
        ctx.add(rr, 'dns.rrsig.key_tag', r + 16, 2, u16(d, r + 16));
        const sn = N(r + 18);
        ctx.add(rr, 'dns.rrsig.signers_name', r + 18, sn.next - r - 18, sn.name);
        ctx.add(rr, 'dns.rrsig.signature', sn.next, rend - sn.next, d.subarray(sn.next, rend));
      }
      break;
    }
    case 47: {
      const nx = N(r);
      ctx.add(rr, 'dns.nsec.next_domain_name', r, nx.next - r, nx.name);
      if (tree && nx.next < rend) ctx.add(rr, 'dns.data', nx.next, rend - nx.next, d.subarray(nx.next, rend));
      infoTail = nx.name;
      break;
    }
    case 64: case 65: {
      ctx.need(r, 2, rend);
      const pr = u16(d, r);
      const tg = N(r + 2);
      ctx.add(rr, 'dns.svcb.svcpriority', r, 2, pr);
      ctx.add(rr, 'dns.svcb.targetname', r + 2, tg.next - r - 2, tg.name);
      if (tree) svcParams(ctx, rr, tg.next, rend);
      infoTail = '';
      summary = '';
      break;
    }
    default:
      if (tree && rdlen) ctx.add(rr, 'dns.data', r, rdlen, d.subarray(r, rend));
  }
  if (addInfo) {
    st.info += ` ${typeName(type)}` + (flush ? ', cache flush' : '') + (infoTail ? ' ' + infoTail : '');
  }
  if (rr !== NULLNODE) {
    rr.label = `${nm.name}: type ${typeName(type)}, class ${className(c)}` + (flush ? ', cache flush' : '') + (summary ? ', ' + summary : '');
  }
  return rend;
}

function keyTag(d, o, len) {
  let ac = 0;
  for (let i = 0; i < len; i++) ac += i & 1 ? d[o + i] : d[o + i] << 8;
  ac += (ac >> 16) & 0xffff;
  return ac & 0xffff;
}

function svcParams(ctx, rr, o, end) {
  const d = ctx.d;
  while (o + 4 <= end) {
    const key = u16(d, o), len = u16(d, o + 2);
    const v = o + 4, ve = Math.min(v + len, end);
    const kn = SVC_KEYS[key] || `key${key}`;
    const n = ctx.add(rr, 'dns.svcb.svcparam', o, 4 + len, null, `SvcParam: ${kn}`);
    ctx.add(n, 'dns.svcb.svcparam.key', o, 2, key);
    ctx.add(n, 'dns.svcb.svcparam.value.length', o + 2, 2, len);
    const vals = [];
    switch (key) {
      case 0: for (let q = v; q + 2 <= ve; q += 2) { ctx.add(n, 'dns.svcb.svcparam.mandatory.key', q, 2, u16(d, q)); vals.push(SVC_KEYS[u16(d, q)] || u16(d, q)); } break;
      case 1: for (let q = v; q < ve;) { const l = d[q]; const s = ascii(d, q + 1, l); ctx.add(n, 'dns.svcb.svcparam.alpn.length', q, 1, l); ctx.add(n, 'dns.svcb.svcparam.alpn', q + 1, l, s); vals.push(s); q += 1 + l; } break;
      case 3: if (len === 2) { ctx.add(n, 'dns.svcb.svcparam.port', v, 2, u16(d, v)); vals.push(u16(d, v)); } break;
      case 4: for (let q = v; q + 4 <= ve; q += 4) { ctx.add(n, 'dns.svcb.svcparam.ipv4hint.ip', q, 4, ip4(d, q)); vals.push(ip4(d, q)); } break;
      case 6: for (let q = v; q + 16 <= ve; q += 16) { ctx.add(n, 'dns.svcb.svcparam.ipv6hint.ip', q, 16, ip6(d, q)); vals.push(ip6(d, q)); } break;
      case 7: { const s = ascii(d, v, len); ctx.add(n, 'dns.svcb.svcparam.dohpath', v, len, s); vals.push(s); break; }
      case 2: break;
      default: if (len) ctx.add(n, 'dns.svcb.svcparam.value', v, len, d.subarray(v, ve));
    }
    if (vals.length) n.label += '=' + vals.join(',');
    o = v + len;
  }
}

function ednsOptions(ctx, rr, o, end) {
  const d = ctx.d;
  while (o + 4 <= end) {
    const code = u16(d, o), len = u16(d, o + 2);
    const v = o + 4;
    const n = ctx.add(rr, 'dns.opt', o, 4 + len, null, `Option: ${OPT_CODES[code] || 'Unknown'}`);
    ctx.add(n, 'dns.opt.code', o, 2, code);
    ctx.add(n, 'dns.opt.len', o + 2, 2, len);
    if (len) ctx.add(n, 'dns.opt.data', v, Math.min(len, end - v), d.subarray(v, Math.min(v + len, end)));
    if (code === 8 && len >= 4) {
      const fam = u16(d, v);
      ctx.add(n, 'dns.opt.client.family', v, 2, fam);
      ctx.add(n, 'dns.opt.client.netmask', v + 2, 1, d[v + 2]);
      ctx.add(n, 'dns.opt.client.scope', v + 3, 1, d[v + 3]);
      const al = len - 4;
      if (fam === 1 && al <= 4) { const b = new Uint8Array(4); b.set(d.subarray(v + 4, v + 4 + al)); ctx.add(n, 'dns.opt.client.addr4', v + 4, al, ip4(b, 0)); }
      else if (fam === 2 && al <= 16) { const b = new Uint8Array(16); b.set(d.subarray(v + 4, v + 4 + al)); ctx.add(n, 'dns.opt.client.addr6', v + 4, al, ip6(b, 0)); }
      else ctx.add(n, 'dns.opt.client.addr', v + 4, al, d.subarray(v + 4, v + len));
    } else if (code === 10 && len >= 8) {
      ctx.add(n, 'dns.opt.cookie.client', v, 8, d.subarray(v, v + 8));
      if (len > 8) ctx.add(n, 'dns.opt.cookie.server', v + 8, len - 8, d.subarray(v + 8, v + len));
    } else if (code === 15 && len >= 2) {
      ctx.add(n, 'dns.opt.ext_error.info_code', v, 2, u16(d, v));
      if (len > 2) ctx.add(n, 'dns.opt.ext_error.extra_text', v + 2, len - 2, utf8(d, v + 2, len - 2));
    }
    o = v + len;
  }
}

/** Query/response matching on the first pass, keyed by conversation + transaction ID. */
function match(ctx, t, kind, id, isResp, idNode) {
  const fd = ctx.fd;
  if (ctx.first && !ctx.inError && ctx.net) {
    const st = ctx.session.st('dns', () => new Map());
    const a = ctx.net.src + '/' + ctx.srcport, b = ctx.net.dst + '/' + ctx.dstport;
    // Match on the querier (responses to multicast queries come from another address) or on the
    // conversation (mDNS answers sent back to the group).
    const kc = (isResp ? b : a) + '#' + id + '#' + ctx.ptype + kind;
    const kv = (a < b ? a + '|' + b : b + '|' + a) + '#' + id + '#' + kind;
    {
      let e = st.get(kc) || st.get(kv);
      const key = kc;
      if (!isResp) {
        if (e && !e.resp) { fd.dnsRetrans = e.req; }
        else { e = { req: ctx.no, rel: ctx.fd.rel, resp: 0 }; st.set(kc, e); st.set(kv, e); }
      } else if (e) {
        if (!e.resp) {
          e.resp = ctx.no;
          ctx.session._fd(e.req).dnsIn = ctx.no;
          fd.dnsTo = e.req;
          fd.dnsTime = ctx.fd.rel - e.rel;
        } else fd.dnsRespRetrans = e.resp;
      } else fd.dnsUnsolicited = true;
    }
  }
  if (fd.dnsIn) ctx.gen(t, 'dns.response_in', fd.dnsIn);
  if (fd.dnsTo) {
    ctx.gen(t, 'dns.response_to', fd.dnsTo);
    ctx.gen(t, 'dns.time', fd.dnsTime);
  }
  if (fd.dnsRetrans) {
    ctx.gen(t, 'dns.retransmission', true);
    ctx.gen(t, 'dns.retransmit_request_in', fd.dnsRetrans);
    ctx.ei(idNode, 'dns.retransmit_request', 0, 0, `DNS query retransmission. Original request in frame ${fd.dnsRetrans}`);
  }
  if (fd.dnsRespRetrans) {
    ctx.gen(t, 'dns.retransmission', true);
    ctx.gen(t, 'dns.retransmit_response_in', fd.dnsRespRetrans);
    ctx.ei(idNode, 'dns.retransmit_response', 0, 0, `DNS response retransmission. Original response in frame ${fd.dnsRespRetrans}`);
  }
  if (fd.dnsUnsolicited) ctx.gen(t, 'dns.unsolicited', true);
  if (!isResp && !fd.dnsIn && !fd.dnsRetrans && !ctx.inError) ctx.ei(idNode, 'dns.response_missing');
}

// ---------------------------------------------------------------------------------------------
// NBNS (NetBIOS Name Service)
const NB_OPCODES = { 0: 'Name query', 5: 'Registration', 6: 'Release', 7: 'Wait for acknowledgment', 8: 'Refresh', 9: 'Refresh (alternate opcode)', 15: 'Multi-homed registration' };
const NB_RCODES = { 0: 'No error', 1: 'Request was invalidly formatted', 2: 'Server failure', 3: 'Requested name does not exist', 4: 'Request is not implemented', 5: 'Request was refused', 6: 'Name is owned by another node', 7: 'Name is in conflict' };
const NB_TYPES = { 32: 'NB', 33: 'NBSTAT' };
const NB_SUFFIX = { 0x00: 'Workstation/Redirector', 0x01: 'Browser', 0x03: 'Messenger service/Main name', 0x06: 'RAS Server service', 0x1b: 'Domain Master Browser', 0x1c: 'Domain Controllers', 0x1d: 'Master Browser', 0x1e: 'Browser Election Service', 0x1f: 'NetDDE service', 0x20: 'Server service', 0x21: 'RAS client service' };
const ONT = { 0: 'B-node', 1: 'P-node', 2: 'M-node', 3: 'H-node' };

registerProtocol({
  abbrev: 'nbns', name: 'NetBIOS Name Service', short: 'NBNS',
  fields: [
    ['nbns.id', 'Transaction ID', 'uint16', { base: 'hex' }],
    ['nbns.flags', 'Flags', 'uint16', { base: 'hex' }],
    ['nbns.flags.response', 'Response', 'bool', { mask: 0x8000, bits: 16, tfs: ['Message is a response', 'Message is a query'] }],
    ['nbns.flags.opcode', 'Opcode', 'uint16', { mask: 0x7800, bits: 16, strings: NB_OPCODES }],
    ['nbns.flags.authoritative', 'Authoritative', 'bool', { mask: 0x0400, bits: 16, tfs: ['Server is an authority for domain', 'Server is not an authority for domain'] }],
    ['nbns.flags.truncated', 'Truncated', 'bool', { mask: 0x0200, bits: 16, tfs: ['Message is truncated', 'Message is not truncated'] }],
    ['nbns.flags.recdesired', 'Recursion desired', 'bool', { mask: 0x0100, bits: 16, tfs: ['Do query recursively', 'Don\'t do query recursively'] }],
    ['nbns.flags.recavail', 'Recursion available', 'bool', { mask: 0x0080, bits: 16, tfs: ['Server can do recursive queries', 'Server can\'t do recursive queries'] }],
    ['nbns.flags.broadcast', 'Broadcast', 'bool', { mask: 0x0010, bits: 16, tfs: ['Broadcast packet', 'Not a broadcast packet'] }],
    ['nbns.flags.rcode', 'Reply code', 'uint16', { mask: 0x000f, bits: 16, strings: NB_RCODES }],
    ['nbns.count.queries', 'Questions', 'uint16'],
    ['nbns.count.answers', 'Answer RRs', 'uint16'],
    ['nbns.count.auth_rr', 'Authority RRs', 'uint16'],
    ['nbns.count.add_rr', 'Additional RRs', 'uint16'],
    ['nbns.name', 'Name', 'string'],
    ['nbns.type', 'Type', 'uint16', { strings: NB_TYPES }],
    ['nbns.class', 'Class', 'uint16', { strings: CLASSES }],
    ['nbns.ttl', 'Time to live', 'uint32'],
    ['nbns.data_length', 'Data length', 'uint16'],
    ['nbns.nb_flags', 'Name flags', 'uint16', { base: 'hex' }],
    ['nbns.nb_flags.group', 'Name type', 'bool', { mask: 0x8000, bits: 16, tfs: ['Group name', 'Unique name'] }],
    ['nbns.nb_flags.ont', 'ONT', 'uint16', { mask: 0x6000, bits: 16, strings: ONT }],
    ['nbns.addr', 'Addr', 'ipv4'],
    ['nbns.number_of_names', 'Number of names', 'uint8'],
    ['nbns.netbios_name', 'Name', 'string'],
    ['nbns.name_flags', 'Name flags', 'uint16', { base: 'hex' }],
    ['nbns.unit_id', 'Unit ID', 'ether'],
    ['nbns.data', 'Data', 'bytes'],
  ],
  tables: { 'udp.port': [137] },
  dissect(ctx, off, end) {
    const d = ctx.d;
    ctx.need(off, 12, end);
    const id = u16(d, off), flags = u16(d, off + 2);
    const qd = u16(d, off + 4), an = u16(d, off + 6), ns = u16(d, off + 8), ar = u16(d, off + 10);
    const isResp = (flags & 0x8000) !== 0;
    const opcode = (flags >> 11) & 15, rcode = flags & 15;
    ctx.setProtocol('NBNS');
    const t = ctx.proto('nbns', off, end - off, 'NetBIOS Name Service');
    const opStr = NB_OPCODES[opcode] || `Unknown operation (${opcode})`;
    let info = opStr + (isResp ? ' response' : '');
    if (isResp && rcode) info += ', ' + (NB_RCODES[rcode] || 'Unknown error');
    if (ctx.tree) {
      ctx.add(t, 'nbns.id', off, 2, id);
      const fl = [];
      if (isResp) fl.push('Response');
      fl.push('Opcode: ' + opStr);
      if (isResp && flags & 0x400) fl.push('Authoritative');
      if (flags & 0x200) fl.push('Truncated');
      if (flags & 0x100) fl.push('Recursion desired');
      if (isResp && flags & 0x80) fl.push('Recursion available');
      if (flags & 0x10) fl.push('Broadcast');
      if (isResp) fl.push('Reply code: ' + (NB_RCODES[rcode] || 'Unknown'));
      const fn = ctx.add(t, 'nbns.flags', off + 2, 2, flags, `Flags: ${hexPad(flags, 4)}, ${fl.join(', ')}`);
      const bits = ['nbns.flags.response', 'nbns.flags.opcode'];
      if (isResp) bits.push('nbns.flags.authoritative');
      bits.push('nbns.flags.truncated', 'nbns.flags.recdesired');
      if (isResp) bits.push('nbns.flags.recavail');
      bits.push('nbns.flags.broadcast');
      if (isResp) bits.push('nbns.flags.rcode');
      ctx.bits(fn, off + 2, 2, flags, bits);
      ctx.add(t, 'nbns.count.queries', off + 4, 2, qd);
      ctx.add(t, 'nbns.count.answers', off + 6, 2, an);
      ctx.add(t, 'nbns.count.auth_rr', off + 8, 2, ns);
      ctx.add(t, 'nbns.count.add_rr', off + 10, 2, ar);
    }
    let o = off + 12;
    let tail = '';
    if (qd) {
      const box = ctx.text(t, 'Queries', o);
      for (let i = 0; i < qd; i++) {
        const nm = nbName(d, o, off, end);
        ctx.need(nm.next, 4, end);
        const type = u16(d, nm.next), cls = u16(d, nm.next + 2);
        tail += ` ${NB_TYPES[type] || typeName(type)} ${nm.name}`;
        if (ctx.tree) {
          const q = ctx.text(box, `${nm.name}: type ${NB_TYPES[type] || typeName(type)}, class ${className(cls)}`, o, nm.next + 4 - o);
          ctx.add(q, 'nbns.name', o, nm.next - o, nm.name, `Name: ${nm.name} (${nm.desc})`);
          ctx.add(q, 'nbns.type', nm.next, 2, type);
          ctx.add(q, 'nbns.class', nm.next + 2, 2, cls);
        }
        o = nm.next + 4;
      }
    }
    const secs = [[an, 'Answers', true], [ns, 'Authoritative nameservers', false], [ar, 'Additional records', false]];
    for (const [n, title, addInfo] of secs) {
      if (!n) continue;
      const box = ctx.text(t, title, o);
      for (let i = 0; i < n; i++) {
        const nm = nbName(d, o, off, end);
        const p = nm.next;
        ctx.need(p, 10, end);
        const type = u16(d, p), cls = u16(d, p + 2), ttl = u32(d, p + 4), len = u16(d, p + 8);
        ctx.need(p + 10, len, end);
        const r = p + 10;
        const tn = NB_TYPES[type] || typeName(type);
        const rr = ctx.text(box, `${nm.name}: type ${tn}, class ${className(cls)}`, o, r + len - o);
        ctx.add(rr, 'nbns.name', o, p - o, `${nm.name} (${nm.desc})`, `Name: ${nm.name} (${nm.desc})`);
        ctx.add(rr, 'nbns.type', p, 2, type);
        ctx.add(rr, 'nbns.class', p + 2, 2, cls);
        ctx.add(rr, 'nbns.ttl', p + 4, 4, ttl, `Time to live: ${secsStr(ttl)}`);
        ctx.add(rr, 'nbns.data_length', p + 8, 2, len);
        if (type === 32) {
          const addrs = [];
          for (let q = r; q + 6 <= r + len; q += 6) {
            const nf = u16(d, q), a = ip4(d, q + 2);
            addrs.push(a);
            if (ctx.tree) {
              const fn = ctx.add(rr, 'nbns.nb_flags', q, 2, nf, `Name flags: ${hexPad(nf, 4)}, ONT: ${ONT[(nf >> 13) & 3]} (${ONT[(nf >> 13) & 3]}, ${nf & 0x8000 ? 'group' : 'unique'})`);
              ctx.bits(fn, q, 2, nf, ['nbns.nb_flags.group', 'nbns.nb_flags.ont']);
              ctx.add(rr, 'nbns.addr', q + 2, 4, a);
            }
          }
          if (addInfo) tail += ` ${tn} ${addrs.join(' ') || nm.name}`;
        } else if (type === 33) {
          const cnt = d[r];
          ctx.add(rr, 'nbns.number_of_names', r, 1, cnt);
          let q = r + 1;
          for (let k = 0; k < cnt && q + 18 <= r + len; k++, q += 18) {
            const raw = ascii(d, q, 15).replace(/ +$/, '');
            const nn = `${raw}<${d[q + 15].toString(16).padStart(2, '0')}>`;
            ctx.add(rr, 'nbns.netbios_name', q, 16, nn, `Name: ${nn}`);
            ctx.add(rr, 'nbns.name_flags', q + 16, 2, u16(d, q + 16));
          }
          if (q + 6 <= r + len) ctx.add(rr, 'nbns.unit_id', q, 6, macStr(d, q));
          if (addInfo) tail += ` ${tn}`;
        } else if (len) ctx.add(rr, 'nbns.data', r, len, d.subarray(r, r + len));
        o = r + len;
      }
    }
    ctx.setInfo(info + tail);
    return end - off;
  },
});

function macStr(d, o) {
  let s = '';
  for (let i = 0; i < 6; i++) s += (i ? ':' : '') + d[o + i].toString(16).padStart(2, '0');
  return s;
}

/** NetBIOS first-level encoded name: 32 half-ASCII chars → "NAME<1c>". */
function nbName(d, o, base, end) {
  let next = -1;
  if ((d[o] & 0xc0) === 0xc0) { next = o + 2; o = base + (((d[o] & 0x3f) << 8) | d[o + 1]); }
  const r0 = nbName1(d, o, base, end);
  if (next >= 0) r0.next = next;
  return r0;
}
function nbName1(d, o, base, end) {
  const l = d[o];
  if (l === 32 && o + 34 <= end) {
    let raw = '';
    for (let i = 0; i < 16; i++) {
      const hi = d[o + 1 + 2 * i] - 0x41, lo = d[o + 2 + 2 * i] - 0x41;
      raw += String.fromCharCode(((hi & 15) << 4) | (lo & 15));
    }
    const suffix = raw.charCodeAt(15);
    let name = raw.slice(0, 15).replace(/ +$/, '');
    name = printable(name);
    // scope id follows as ordinary labels
    let p = o + 33;
    let scope = '';
    if (d[p] !== 0) { const s = readName(d, p, base, end); scope = '.' + s.name; p = s.next; } else p++;
    const full = `${name}<${suffix.toString(16).padStart(2, '0')}>${scope}`;
    return { name: full, next: p, desc: NB_SUFFIX[suffix] || 'Unknown' };
  }
  const r = readName(d, o, base, end);
  return { name: r.name, next: r.next, desc: 'Unknown' };
}

