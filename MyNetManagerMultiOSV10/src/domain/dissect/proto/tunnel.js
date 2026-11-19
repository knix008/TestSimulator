// Tunnels and encapsulations: MPLS, PPPoE (discovery/session), PPP (+LCP/IPCP/PAP/CHAP), GRE, VXLAN,
// GENEVE, IPsec ESP/AH, SCTP.
import { registerProtocol, u16, u24, u32, u32le, ip4, ip6, hexPad, hexStr, ascii, NULLNODE } from '../core.js';
import { ETHERTYPES, IP_PROTOS } from '../names.js';
import { ethertype } from './eth.js';

const BOOL_YN = ['Yes', 'No'];
const BOOL_TF = ['True', 'False'];

// --- MPLS ---------------------------------------------------------------------------------------
registerProtocol({
  abbrev: 'mpls', name: 'MultiProtocol Label Switching Header', short: 'MPLS',
  fields: [
    ['mpls.label', 'MPLS Label', 'uint32', { base: 'dec_hex', mask: 0xfffff000, bits: 32 }],
    ['mpls.exp', 'MPLS Experimental Bits', 'uint32', { mask: 0xe00, bits: 32 }],
    ['mpls.bottom', 'MPLS Bottom Of Label Stack', 'uint32', { mask: 0x100, bits: 32 }],
    ['mpls.ttl', 'MPLS TTL', 'uint32', { mask: 0xff, bits: 32 }],
  ],
  tables: { ethertype: [0x8847, 0x8848], 'ip.proto': [137], 'gre.proto': [0x8847], 'ppp.protocol': [0x0281] },
  dissect(ctx, off, end) {
    const d = ctx.d;
    let o = off;
    ctx.setProtocol('MPLS');
    for (;;) {
      ctx.need(o, 4, end);
      const w = u32(d, o);
      const label = w >>> 12, exp = (w >> 9) & 7, s = (w >> 8) & 1, ttl = w & 255;
      // Wireshark adds one protocol item per stack entry but lists 'mpls' once in frame.protocols
      const t = o === off ? ctx.proto('mpls', o, 4) : (ctx.tree ? ctx.text(null, '', o, 4) : NULLNODE);
      if (ctx.tree) {
        t.abbrev = 'mpls'; t.type = 'protocol';
        t.label = `MultiProtocol Label Switching Header, Label: ${label}, Exp: ${exp}, S: ${s}, TTL: ${ttl}`;
        ctx.bits(t, o, 4, w, ['mpls.label', 'mpls.exp', 'mpls.bottom', 'mpls.ttl']);
      }
      o += 4;
      if (s) break;
    }
    if (o >= end) return end - off;
    const nib = d[o] >> 4;
    if (nib === 4 || nib === 6) {
      // Wireshark does not list the IP layer carried directly over MPLS in frame.protocols.
      const n = ctx.layers.length;
      ctx.call(nib === 4 ? 'ip' : 'ipv6', o, end);
      if (ctx.layers[n] === (nib === 4 ? 'ip' : 'ipv6')) ctx.layers.splice(n, 1);
    } else {
      ctx.proto('pwethnocw', o, 0, 'Ethernet PW (no CW)');
      ctx.call('eth', o, end);
    }
    return end - off;
  },
});
registerProtocol({ abbrev: 'pwethnocw', name: 'Ethernet PW (no CW)', short: 'Ethernet PW (no CW)' });

// --- PPPoE ------------------------------------------------------------------------------------------
const PPPOE_CODES = { 0x00: 'Session Data', 0x09: 'Active Discovery Initiation (PADI)', 0x07: 'Active Discovery Offer (PADO)', 0x19: 'Active Discovery Request (PADR)', 0x65: 'Active Discovery Session-confirmation (PADS)', 0xa7: 'Active Discovery Terminate (PADT)' };
const PPPOE_TAGS = { 0x0000: 'End-Of-List', 0x0101: 'Service-Name', 0x0102: 'AC-Name', 0x0103: 'Host-Uniq', 0x0104: 'AC-Cookie', 0x0105: 'Vendor-Specific', 0x0110: 'Relay-Session-Id', 0x0120: 'PPP-Max-Payload', 0x0201: 'Service-Name-Error', 0x0202: 'AC-System-Error', 0x0203: 'Generic-Error' };
const PPPOE_TAG_FIELD = { 0x0101: 'pppoed.tags.service_name', 0x0102: 'pppoed.tags.ac_name', 0x0103: 'pppoed.tags.host_uniq', 0x0104: 'pppoed.tags.ac_cookie', 0x0110: 'pppoed.tags.relay_session_id', 0x0201: 'pppoed.tags.service_name_error', 0x0202: 'pppoed.tags.ac_system_error', 0x0203: 'pppoed.tags.generic_error' };
const STR_TAGS = new Set([0x0101, 0x0102, 0x0201, 0x0202, 0x0203]);
const PPPOE_HDR = [
  ['pppoe.version', 'Version', 'uint8', { mask: 0xf0 }],
  ['pppoe.type', 'Type', 'uint8', { mask: 0x0f }],
  ['pppoe.code', 'Code', 'uint8', { base: 'hex', strings: PPPOE_CODES }],
  ['pppoe.session_id', 'Session ID', 'uint16', { base: 'hex' }],
  ['pppoe.payload_length', 'Payload Length', 'uint16'],
];
registerProtocol({ abbrev: 'pppoe', name: 'PPP-over-Ethernet', short: 'PPPoE', fields: PPPOE_HDR });

function pppoeHeader(ctx, t, off) {
  const d = ctx.d;
  ctx.bits(t, off, 1, d[off], ['pppoe.version', 'pppoe.type']);
  ctx.add(t, 'pppoe.code', off + 1, 1, d[off + 1]);
  ctx.add(t, 'pppoe.session_id', off + 2, 2, u16(d, off + 2));
  ctx.add(t, 'pppoe.payload_length', off + 4, 2, u16(d, off + 4));
}

registerProtocol({
  abbrev: 'pppoed', name: 'PPP-over-Ethernet Discovery', short: 'PPPoED',
  fields: [
    ['pppoed.tags', 'PPPoE Tags', 'none'],
    ['pppoed.tag', 'Tag', 'uint16', { base: 'hex', strings: PPPOE_TAGS }],
    ['pppoed.tag_length', 'Tag Length', 'uint16'],
    ['pppoed.tag.unknown_data', 'Unknown Data', 'bytes'],
    ['pppoed.tags.service_name', 'Service-Name', 'string'],
    ['pppoed.tags.ac_name', 'AC-Name', 'string'],
    ['pppoed.tags.host_uniq', 'Host-Uniq', 'bytes'],
    ['pppoed.tags.ac_cookie', 'AC-Cookie', 'bytes'],
    ['pppoed.tags.relay_session_id', 'Relay-Session-Id', 'bytes'],
    ['pppoed.tags.service_name_error', 'Service-Name-Error', 'string'],
    ['pppoed.tags.ac_system_error', 'AC-System-Error', 'string'],
    ['pppoed.tags.generic_error', 'Generic-Error', 'string'],
  ],
  tables: { ethertype: [0x8863] },
  dissect(ctx, off, end) {
    const d = ctx.d;
    ctx.need(off, 6, end);
    const code = d[off + 1];
    const plen = u16(d, off + 4);
    ctx.setProtocol('PPPoED');
    let info = PPPOE_CODES[code] || `Unknown (0x${code.toString(16).padStart(2, '0')})`;
    const t = ctx.proto('pppoed', off, 6 + plen);
    pppoeHeader(ctx, t, off);
    const tend = Math.min(end, off + 6 + plen);
    let o = off + 6;
    if (o < tend) {
      const tags = ctx.add(t, 'pppoed.tags', o, tend - o, null);
      while (o + 4 <= tend) {
        const tag = u16(d, o), len = u16(d, o + 2);
        if (tag === 0) break;
        ctx.need(o + 4, len, tend);
        const v = o + 4;
        const f = PPPOE_TAG_FIELD[tag];
        if (tag === 0x0102) info += ` AC-Name='${ascii(d, v, len)}'`;
        if (len > 0) {
          if (f && STR_TAGS.has(tag)) ctx.add(tags, f, v, len, ascii(d, v, len));
          else if (f) ctx.add(tags, f, v, len, d.subarray(v, v + len));
          else {
            const n = ctx.add(tags, 'pppoed.tag', o, 2, tag);
            ctx.add(n, 'pppoed.tag_length', o + 2, 2, len);
            ctx.add(n, 'pppoed.tag.unknown_data', v, len, d.subarray(v, v + len));
          }
        }
        o = v + len;
      }
    }
    ctx.setInfo(info);
    return end - off;
  },
});

registerProtocol({
  abbrev: 'pppoes', name: 'PPP-over-Ethernet Session', short: 'PPPoES',
  tables: { ethertype: [0x8864] },
  dissect(ctx, off, end) {
    const d = ctx.d;
    ctx.need(off, 6, end);
    const plen = u16(d, off + 4);
    ctx.setProtocol('PPPoES');
    ctx.setInfo('');
    const t = ctx.proto('pppoes', off, 6);
    pppoeHeader(ctx, t, off);
    ctx.call('ppp', off + 6, Math.min(end, off + 6 + plen));
    return Math.min(end, off + 6 + plen) - off;
  },
});

// --- PPP -----------------------------------------------------------------------------------------
const PPP_PROTOS = { 0x0021: 'Internet Protocol version 4', 0x0057: 'Internet Protocol version 6', 0x0281: 'MPLS Unicast', 0x8021: 'Internet Protocol Control Protocol', 0x8057: 'IPv6 Control Protocol', 0xc021: 'Link Control Protocol', 0xc023: 'Password Authentication Protocol', 0xc025: 'Link Quality Report', 0xc223: 'Challenge Handshake Authentication Protocol', 0x80fd: 'Compression Control Protocol', 0x00fd: 'Compressed datagram' };
registerProtocol({
  abbrev: 'ppp', name: 'Point-to-Point Protocol', short: 'PPP',
  fields: [
    ['ppp.address', 'Address', 'uint8', { base: 'hex' }],
    ['ppp.control', 'Control', 'uint8', { base: 'hex' }],
    ['ppp.protocol', 'Protocol', 'uint16', { base: 'hex', strings: PPP_PROTOS }],
    ['ppp.code', 'Code', 'uint8'],
    ['ppp.identifier', 'Identifier', 'uint8', { base: 'dec_hex' }],
    ['ppp.length', 'Length', 'uint16'],
    ['ppp.magic_number', 'Magic Number', 'uint32', { base: 'hex' }],
    ['ppp.data', 'Data', 'bytes'],
  ],
  tables: { linktype: [9, 50, 51], 'gre.proto': [0x880b] },
  dissect(ctx, off, end) {
    const d = ctx.d;
    let o = off;
    ctx.need(o, 2, end);
    ctx.setProtocol('PPP');
    const hasAC = d[o] === 0xff && d[o + 1] === 0x03;
    let proto;
    let hl;
    if (hasAC) { ctx.need(o, 4, end); proto = u16(d, o + 2); hl = 4; }
    else if (d[o] & 1) { proto = d[o]; hl = 1; } // protocol field compression
    else { proto = u16(d, o); hl = 2; }
    const t = ctx.proto('ppp', off, hl);
    if (hasAC) {
      ctx.add(t, 'ppp.address', o, 1, 0xff);
      ctx.add(t, 'ppp.control', o + 1, 1, 3);
    }
    ctx.add(t, 'ppp.protocol', o + hl - (hl === 1 ? 1 : 2), hl === 1 ? 1 : 2, proto);
    o += hl;
    if (!ctx.dispatch('ppp.protocol', proto, o, end)) {
      ctx.setInfo(`PPP ${PPP_PROTOS[proto] || 'Unknown'}`);
      ctx.data(o, end);
    }
    return end - off;
  },
});

const CP_CODES = { 1: 'Configuration Request', 2: 'Configuration Ack', 3: 'Configuration Nak', 4: 'Configuration Reject', 5: 'Termination Request', 6: 'Termination Ack', 7: 'Code Reject', 8: 'Protocol Reject', 9: 'Echo Request', 10: 'Echo Reply', 11: 'Discard Request', 12: 'Identification', 13: 'Time Remaining' };
const LCP_OPTS = { 1: 'Maximum Receive Unit', 2: 'Async Control Character Map', 3: 'Authentication Protocol', 4: 'Quality Protocol', 5: 'Magic Number', 7: 'Protocol Field Compression', 8: 'Address and Control Field Compression', 13: 'Callback', 17: 'Multilink MRRU', 19: 'Multilink Endpoint Discriminator' };
const IPCP_OPTS = { 1: 'IP Addresses', 2: 'IP Compression Protocol', 3: 'IP Address', 129: 'Primary DNS Server IP Address', 130: 'Primary NBNS Server IP Address', 131: 'Secondary DNS Server IP Address', 132: 'Secondary NBNS Server IP Address' };

/** LCP / IPCP: code, identifier, length, options (for Configure-*). */
function controlProtocol(abbrev, short, optNames, optHandler) {
  return function dissectCp(ctx, off, end) {
    const d = ctx.d;
    ctx.need(off, 4, end);
    const code = d[off], id = d[off + 1], len = u16(d, off + 2);
    ctx.setProtocol(short);
    ctx.setInfo(CP_CODES[code] || `Unknown (0x${code.toString(16).padStart(2, '0')})`);
    const pend = Math.min(end, off + len);
    const t = ctx.proto(abbrev, off, pend - off);
    ctx.add(t, 'ppp.code', off, 1, code, `Code: ${CP_CODES[code] || 'Unknown'} (${code})`);
    ctx.add(t, 'ppp.identifier', off + 1, 1, id);
    ctx.add(t, 'ppp.length', off + 2, 2, len);
    let o = off + 4;
    if (code >= 1 && code <= 4 && o < pend) {
      const names = [];
      const box = ctx.text(t, '', o, pend - o);
      while (o + 2 <= pend) {
        const ty = d[o], l = d[o + 1];
        if (l < 2 || o + l > pend) break;
        const nm = optNames[ty] || 'Unknown';
        names.push(nm);
        optHandler(ctx, box, ty, nm, o, l);
        o += l;
      }
      if (box !== NULLNODE) box.label = `Options: (${pend - off - 4} bytes), ${names.join(', ')}`;
    } else if ((code === 9 || code === 10 || code === 11) && o + 4 <= pend) {
      ctx.add(t, 'ppp.magic_number', o, 4, u32(d, o));
      if (o + 4 < pend) ctx.add(t, 'ppp.data', o + 4, pend - o - 4, d.subarray(o + 4, pend));
    } else if (o < pend) ctx.add(t, 'ppp.data', o, pend - o, d.subarray(o, pend));
    return end - off;
  };
}

registerProtocol({
  abbrev: 'lcp', name: 'PPP Link Control Protocol', short: 'PPP LCP',
  fields: [
    ['lcp.opt.type', 'Type', 'uint8', { strings: LCP_OPTS }],
    ['lcp.opt.length', 'Length', 'uint8'],
    ['lcp.opt.mru', 'Maximum Receive Unit', 'uint16'],
    ['lcp.opt.asyncmap', 'Async Control Character Map', 'uint32', { base: 'hex' }],
    ['lcp.opt.auth_protocol', 'Authentication Protocol', 'uint16', { base: 'hex', strings: PPP_PROTOS }],
    ['lcp.opt.magic_number', 'Magic Number', 'uint32', { base: 'hex' }],
    ['lcp.opt.data', 'Data', 'bytes'],
  ],
  tables: { 'ppp.protocol': [0xc021] },
  dissect: controlProtocol('lcp', 'PPP LCP', LCP_OPTS, (ctx, box, ty, nm, o, l) => {
    const d = ctx.d;
    let val = '';
    if (ty === 1 && l === 4) val = String(u16(d, o + 2));
    else if (ty === 5 && l === 6) val = hexPad(u32(d, o + 2), 8);
    else if (ty === 2 && l === 6) val = hexPad(u32(d, o + 2), 8);
    else if (ty === 3 && l >= 4) val = `${PPP_PROTOS[u16(d, o + 2)] || 'Unknown'} (${hexPad(u16(d, o + 2), 4)})`;
    const n = ctx.text(box, val ? `${nm}: ${val}` : nm, o, l);
    ctx.add(n, 'lcp.opt.type', o, 1, ty);
    ctx.add(n, 'lcp.opt.length', o + 1, 1, l);
    if (ty === 1 && l === 4) ctx.add(n, 'lcp.opt.mru', o + 2, 2, u16(d, o + 2));
    else if (ty === 5 && l === 6) ctx.add(n, 'lcp.opt.magic_number', o + 2, 4, u32(d, o + 2));
    else if (ty === 2 && l === 6) ctx.add(n, 'lcp.opt.asyncmap', o + 2, 4, u32(d, o + 2));
    else if (ty === 3 && l >= 4) ctx.add(n, 'lcp.opt.auth_protocol', o + 2, 2, u16(d, o + 2));
    else if (l > 2) ctx.add(n, 'lcp.opt.data', o + 2, l - 2, d.subarray(o + 2, o + l));
  }),
});
registerProtocol({
  abbrev: 'ipcp', name: 'PPP IP Control Protocol', short: 'PPP IPCP',
  fields: [
    ['ipcp.opt.type', 'Type', 'uint8', { strings: IPCP_OPTS }],
    ['ipcp.opt.length', 'Length', 'uint8'],
    ['ipcp.opt.ip_address', 'IP Address', 'ipv4'],
    ['ipcp.opt.pri_dns_address', 'Primary DNS Address', 'ipv4'],
    ['ipcp.opt.sec_dns_address', 'Secondary DNS Address', 'ipv4'],
    ['ipcp.data', 'Data', 'bytes'],
  ],
  tables: { 'ppp.protocol': [0x8021] },
  dissect: controlProtocol('ipcp', 'PPP IPCP', IPCP_OPTS, (ctx, box, ty, nm, o, l) => {
    const d = ctx.d;
    const f = ty === 3 ? 'ipcp.opt.ip_address' : ty === 129 ? 'ipcp.opt.pri_dns_address' : ty === 131 ? 'ipcp.opt.sec_dns_address' : null;
    const n = ctx.text(box, f && l === 6 ? `${nm}: ${ip4(d, o + 2)}` : nm, o, l);
    ctx.add(n, 'ipcp.opt.type', o, 1, ty);
    ctx.add(n, 'ipcp.opt.length', o + 1, 1, l);
    if (f && l === 6) ctx.add(n, f, o + 2, 4, ip4(d, o + 2));
    else if (l > 2) ctx.add(n, 'ipcp.data', o + 2, l - 2, d.subarray(o + 2, o + l));
  }),
});

const PAP_CODES = { 1: 'Authenticate-Request', 2: 'Authenticate-Ack', 3: 'Authenticate-Nak' };
registerProtocol({
  abbrev: 'pap', name: 'PPP Password Authentication Protocol', short: 'PPP PAP',
  fields: [
    ['pap.code', 'Code', 'uint8', { strings: PAP_CODES }],
    ['pap.identifier', 'Identifier', 'uint8'],
    ['pap.length', 'Length', 'uint16'],
    ['pap.data', 'Data', 'none'],
    ['pap.peer_id.length', 'Peer-ID-Length', 'uint8'],
    ['pap.peer_id', 'Peer-ID', 'string'],
    ['pap.password.length', 'Password-Length', 'uint8'],
    ['pap.password', 'Password', 'string'],
    ['pap.message.length', 'Message-Length', 'uint8'],
    ['pap.message', 'Message', 'string'],
  ],
  tables: { 'ppp.protocol': [0xc023] },
  dissect(ctx, off, end) {
    const d = ctx.d;
    ctx.need(off, 4, end);
    const code = d[off], len = u16(d, off + 2);
    ctx.setProtocol('PPP PAP');
    const t = ctx.proto('pap', off, Math.min(len, end - off));
    ctx.add(t, 'pap.code', off, 1, code);
    ctx.add(t, 'pap.identifier', off + 1, 1, d[off + 1]);
    ctx.add(t, 'pap.length', off + 2, 2, len);
    let info = PAP_CODES[code] || 'Unknown';
    let o = off + 4;
    if (o < end) {
      const dn = ctx.add(t, 'pap.data', o, Math.min(len, end - off) - 4, null);
      if (code === 1) {
        const pl = d[o]; ctx.need(o, 1 + pl + 1, end);
        const peer = ascii(d, o + 1, pl);
        const wl = d[o + 1 + pl]; ctx.need(o + 2 + pl, wl, end);
        const pw = ascii(d, o + 2 + pl, wl);
        ctx.add(dn, 'pap.peer_id.length', o, 1, pl);
        ctx.add(dn, 'pap.peer_id', o + 1, pl, peer);
        ctx.add(dn, 'pap.password.length', o + 1 + pl, 1, wl);
        ctx.add(dn, 'pap.password', o + 2 + pl, wl, pw);
        info += ` (Peer-ID='${peer}', Password='${pw}')`;
      } else {
        const ml = d[o]; ctx.need(o, 1 + ml, end);
        const msg = ascii(d, o + 1, ml);
        ctx.add(dn, 'pap.message.length', o, 1, ml);
        ctx.add(dn, 'pap.message', o + 1, ml, msg);
        info += ` (Message='${msg}')`;
      }
    }
    ctx.setInfo(info);
    return end - off;
  },
});

const CHAP_CODES = { 1: 'Challenge', 2: 'Response', 3: 'Success', 4: 'Failure' };
registerProtocol({
  abbrev: 'chap', name: 'PPP Challenge Handshake Authentication Protocol', short: 'PPP CHAP',
  fields: [
    ['chap.code', 'Code', 'uint8', { strings: CHAP_CODES }],
    ['chap.identifier', 'Identifier', 'uint8'],
    ['chap.length', 'Length', 'uint16'],
    ['chap.data', 'Data', 'none'],
    ['chap.value_size', 'Value Size', 'uint8'],
    ['chap.value', 'Value', 'bytes'],
    ['chap.name', 'Name', 'string'],
    ['chap.message', 'Message', 'string'],
  ],
  tables: { 'ppp.protocol': [0xc223] },
  dissect(ctx, off, end) {
    const d = ctx.d;
    ctx.need(off, 4, end);
    const code = d[off], len = u16(d, off + 2);
    const pend = Math.min(end, off + len);
    ctx.setProtocol('PPP CHAP');
    const t = ctx.proto('chap', off, pend - off);
    ctx.add(t, 'chap.code', off, 1, code);
    ctx.add(t, 'chap.identifier', off + 1, 1, d[off + 1]);
    ctx.add(t, 'chap.length', off + 2, 2, len);
    let info = CHAP_CODES[code] || 'Unknown';
    const o = off + 4;
    if (o < pend) {
      const dn = ctx.add(t, 'chap.data', o, pend - o, null);
      if (code === 1 || code === 2) {
        const vs = d[o];
        ctx.need(o, 1 + vs, pend);
        ctx.add(dn, 'chap.value_size', o, 1, vs);
        ctx.add(dn, 'chap.value', o + 1, vs, d.subarray(o + 1, o + 1 + vs));
        const name = ascii(d, o + 1 + vs, pend - o - 1 - vs);
        ctx.add(dn, 'chap.name', o + 1 + vs, pend - o - 1 - vs, name);
        info += ` (NAME='${name}', VALUE=0x${hexStr(d, o + 1, vs)})`;
      } else {
        const msg = ascii(d, o, pend - o);
        ctx.add(dn, 'chap.message', o, pend - o, msg);
        info += ` (MESSAGE='${msg}')`;
      }
    }
    ctx.setInfo(info);
    return end - off;
  },
});

// --- GRE -------------------------------------------------------------------------------------------
const GRE_PROTOS = { 0x0800: 'IP', 0x86dd: 'IPv6', 0x6558: 'Transparent Ethernet bridging', 0x880b: 'PPP', 0x8847: 'MPLS label switched packet', 0x0806: 'ARP', 0x88be: 'ERSPAN', 0x22eb: 'ERSPAN III', 0x8881: 'CDMA2000 A10 Unstructured byte stream' };
registerProtocol({
  abbrev: 'gre', name: 'Generic Routing Encapsulation', short: 'GRE',
  fields: [
    ['gre.flags_and_version', 'Flags and Version', 'uint16', { base: 'hex' }],
    ['gre.flags.checksum', 'Checksum Bit', 'bool', { mask: 0x8000, bits: 16, tfs: BOOL_YN }],
    ['gre.flags.routing', 'Routing Bit', 'bool', { mask: 0x4000, bits: 16, tfs: BOOL_YN }],
    ['gre.flags.key', 'Key Bit', 'bool', { mask: 0x2000, bits: 16, tfs: BOOL_YN }],
    ['gre.flags.sequence_number', 'Sequence Number Bit', 'bool', { mask: 0x1000, bits: 16, tfs: BOOL_YN }],
    ['gre.flags.strict_source_route', 'Strict Source Route Bit', 'bool', { mask: 0x0800, bits: 16, tfs: BOOL_YN }],
    ['gre.flags.recursion_control', 'Recursion control', 'uint16', { mask: 0x0700, bits: 16 }],
    ['gre.flags.ack', 'Acknowledgment', 'bool', { mask: 0x0080, bits: 16, tfs: BOOL_YN }],
    ['gre.flags.reserved', 'Flags (Reserved)', 'uint16', { mask: 0x00f8, bits: 16 }],
    ['gre.flags.version', 'Version', 'uint16', { mask: 0x0007, bits: 16, strings: { 0: 'GRE', 1: 'Enhanced GRE' } }],
    ['gre.proto', 'Protocol Type', 'uint16', { base: 'hex', strings: GRE_PROTOS }],
    ['gre.checksum', 'Checksum', 'uint16', { base: 'hex' }],
    ['gre.offset', 'Offset', 'uint16'],
    ['gre.key', 'Key', 'uint32', { base: 'hex' }],
    ['gre.key.payload_length', 'Payload Length', 'uint16'],
    ['gre.key.call_id', 'Call ID', 'uint16'],
    ['gre.sequence_number', 'Sequence Number', 'uint32'],
    ['gre.ack_number', 'Acknowledgment Number', 'uint32'],
  ],
  tables: { 'ip.proto': [47] },
  dissect(ctx, off, end) {
    const d = ctx.d;
    ctx.need(off, 4, end);
    const fv = u16(d, off), proto = u16(d, off + 2);
    const ver = fv & 7;
    let hl = 4;
    if (fv & 0xc000) hl += 4;
    if (fv & 0x2000) hl += 4;
    if (fv & 0x1000) hl += 4;
    if (ver === 1 && (fv & 0x0080)) hl += 4;
    ctx.need(off, hl, end);
    ctx.setProtocol('GRE');
    ctx.setInfo(`Encapsulated ${GRE_PROTOS[proto] || hexPad(proto, 4)}`);
    const t = ctx.proto('gre', off, hl, `Generic Routing Encapsulation (${GRE_PROTOS[proto] || 'Unknown'})`);
    if (ctx.tree) {
      const fn = ctx.add(t, 'gre.flags_and_version', off, 2, fv);
      ctx.bits(fn, off, 2, fv, ['gre.flags.checksum', 'gre.flags.routing', 'gre.flags.key', 'gre.flags.sequence_number', 'gre.flags.strict_source_route', 'gre.flags.recursion_control', 'gre.flags.ack', 'gre.flags.reserved', 'gre.flags.version']);
      ctx.add(t, 'gre.proto', off + 2, 2, proto);
      let o = off + 4;
      if (fv & 0xc000) { ctx.add(t, 'gre.checksum', o, 2, u16(d, o)); ctx.add(t, 'gre.offset', o + 2, 2, u16(d, o + 2)); o += 4; }
      if (fv & 0x2000) {
        if (ver === 1) {
          const kn = ctx.add(t, 'gre.key', o, 4, u32(d, o));
          ctx.add(kn, 'gre.key.payload_length', o, 2, u16(d, o));
          ctx.add(kn, 'gre.key.call_id', o + 2, 2, u16(d, o + 2));
        } else ctx.add(t, 'gre.key', o, 4, u32(d, o));
        o += 4;
      }
      if (fv & 0x1000) { ctx.add(t, 'gre.sequence_number', o, 4, u32(d, o)); o += 4; }
      if (ver === 1 && (fv & 0x0080)) ctx.add(t, 'gre.ack_number', o, 4, u32(d, o));
    }
    const p = off + hl;
    if (p >= end) return end - off;
    if (proto === 0x6558) ctx.call('eth', p, end);
    else if (!ctx.dispatch('gre.proto', proto, p, end)) ctx.data(p, end);
    return end - off;
  },
});

// --- VXLAN / GENEVE ------------------------------------------------------------------------------
registerProtocol({
  abbrev: 'vxlan', name: 'Virtual eXtensible Local Area Network', short: 'VXLAN',
  fields: [
    ['vxlan.flags', 'Flags', 'uint16', { base: 'hex' }],
    ['vxlan.flag_g', 'GBP Extension', 'bool', { mask: 0x8000, bits: 16, tfs: ['Defined', 'Not defined'] }],
    ['vxlan.flag_i', 'VXLAN Network ID (VNI)', 'bool', { mask: 0x0800, bits: 16, tfs: BOOL_TF }],
    ['vxlan.flag_d', 'Don\'t Learn', 'bool', { mask: 0x0040, bits: 16, tfs: BOOL_TF }],
    ['vxlan.flag_a', 'Policy Applied', 'bool', { mask: 0x0008, bits: 16, tfs: BOOL_TF }],
    ['vxlan.flags_reserved', 'Reserved(R)', 'uint16', { base: 'hex', mask: 0x77b7, bits: 16 }],
    ['vxlan.gbp', 'Group Policy ID', 'uint16'],
    ['vxlan.vni', 'VXLAN Network Identifier (VNI)', 'uint24'],
    ['vxlan.reserved8', 'Reserved', 'uint8'],
  ],
  tables: { 'udp.port': [4789] },
  dissect(ctx, off, end) {
    const d = ctx.d;
    ctx.need(off, 8, end);
    const fl = u16(d, off);
    ctx.setProtocol('VXLAN');
    const t = ctx.proto('vxlan', off, 8);
    if (ctx.tree) {
      const names = [];
      if (fl & 0x8000) names.push('GBP Extension');
      if (fl & 0x0800) names.push('VXLAN Network ID (VNI)');
      if (fl & 0x0040) names.push('Don\'t Learn');
      if (fl & 0x0008) names.push('Policy Applied');
      const fn = ctx.add(t, 'vxlan.flags', off, 2, fl, `Flags: ${hexPad(fl, 4)}${names.length ? ', ' + names.join(', ') : ''}`);
      ctx.bits(fn, off, 2, fl, ['vxlan.flag_g', 'vxlan.flag_i', 'vxlan.flag_d', 'vxlan.flag_a']);
      ctx.add(fn, 'vxlan.flags_reserved', off, 2, (fl & 0x77b7) >>> 0, `${reservedBits(fl, 0x77b7)} = Reserved(R): ${hexPad(fl & 0x77b7, 4)}`);
      ctx.add(t, 'vxlan.gbp', off + 2, 2, u16(d, off + 2));
      ctx.add(t, 'vxlan.vni', off + 4, 3, u24(d, off + 4));
      ctx.add(t, 'vxlan.reserved8', off + 7, 1, d[off + 7]);
    }
    if (off + 8 < end) ctx.call('eth', off + 8, end);
    return end - off;
  },
});
function reservedBits(v, mask) {
  let s = '';
  for (let i = 15; i >= 0; i--) { s += (mask >> i) & 1 ? ((v >> i) & 1 ? '1' : '0') : '.'; if (i % 4 === 0 && i) s += ' '; }
  return s;
}

const GENEVE_CLASSES = { 0x0100: 'Linux', 0x0101: 'Open vSwitch (OVS)', 0x0102: 'Open Virtual Networking (OVN)', 0x0103: 'In-band Network Telemetry (INT)', 0x0104: 'VMware, Inc.', 0x0105: 'Amazon.com, Inc.', 0x0106: 'Cisco Systems, Inc.', 0x0107: 'Oracle Corporation', 0x0110: 'Amazon.com, Inc.', 0x0118: 'IBM', 0x0128: 'Ericsson', 0xfeff: 'Unassigned', 0xffff: 'Experimental' };
registerProtocol({
  abbrev: 'geneve', name: 'Generic Network Virtualization Encapsulation', short: 'Geneve',
  fields: [
    ['geneve.version', 'Version', 'uint8'],
    ['geneve.flags', 'Flags', 'uint8', { base: 'hex' }],
    ['geneve.flags.oam', 'Operations, Administration and Management Frame', 'bool', { mask: 0x80, bits: 8, tfs: BOOL_TF }],
    ['geneve.flags.critical', 'Critical Options Present', 'bool', { mask: 0x40, bits: 8, tfs: BOOL_TF }],
    ['geneve.flags.reserved', 'Reserved', 'bool', { mask: 0x3f, bits: 8, tfs: BOOL_TF }],
    ['geneve.proto_type', 'Protocol Type', 'uint16', { base: 'hex', strings: ETHERTYPES }],
    ['geneve.vni', 'Virtual Network Identifier (VNI)', 'uint24', { base: 'hex_dec' }],
    ['geneve.reserved', 'Reserved', 'uint8', { base: 'hex' }],
    ['geneve.options', 'Geneve Options', 'bytes'],
    ['geneve.option', 'Option', 'bytes'],
    ['geneve.option.class', 'Class', 'uint16', { base: 'hex', strings: GENEVE_CLASSES }],
    ['geneve.option.type', 'Type', 'uint8', { base: 'hex' }],
    ['geneve.option.flags', 'Flags', 'uint8', { base: 'hex' }],
    ['geneve.option.length', 'Length', 'uint8'],
    ['geneve.option.unknown.data', 'Unknown Option Data', 'bytes'],
  ],
  tables: { 'udp.port': [6081] },
  dissect(ctx, off, end) {
    const d = ctx.d;
    ctx.need(off, 8, end);
    const ver = d[off] >> 6, olen = (d[off] & 0x3f) * 4, fl = d[off + 1], proto = u16(d, off + 2), vni = u24(d, off + 4);
    ctx.need(off, 8 + olen, end);
    ctx.setProtocol('Geneve');
    const vh = vni.toString(16).padStart(6, '0');
    const t = ctx.proto('geneve', off, 8 + olen, `Generic Network Virtualization Encapsulation, VNI: 0x${vh}`);
    if (ctx.tree) {
      ctx.add(t, 'geneve.version', off, 1, ver);
      ctx.text(t, `Length: ${8 + olen} bytes`, off, 1);
      const fn = ctx.add(t, 'geneve.flags', off + 1, 1, fl);
      ctx.bits(fn, off + 1, 1, fl, ['geneve.flags.oam', 'geneve.flags.critical', 'geneve.flags.reserved']);
      ctx.add(t, 'geneve.proto_type', off + 2, 2, proto);
      ctx.add(t, 'geneve.vni', off + 4, 3, vni);
      ctx.add(t, 'geneve.reserved', off + 7, 1, d[off + 7]);
      if (olen) {
        const on = ctx.add(t, 'geneve.options', off + 8, olen, d.subarray(off + 8, off + 8 + olen), `Options: (${olen} bytes)`);
        let o = off + 8;
        while (o + 4 <= off + 8 + olen) {
          const cls = u16(d, o), ty = d[o + 2], ln = (d[o + 3] & 0x1f) * 4;
          const cn = GENEVE_CLASSES[cls] || 'Unknown';
          const crit = ty & 0x80 ? ' (Critical)' : '';
          const n = ctx.add(on, 'geneve.option', o, 4 + ln, d.subarray(o, o + 4 + ln), `Unknown, Class: ${cn} (${hexPad(cls, 4)}) Type: ${hexPad(ty, 2)}${crit}`);
          ctx.add(n, 'geneve.option.class', o, 2, cls);
          ctx.add(n, 'geneve.option.type', o + 2, 1, ty, `Type: ${hexPad(ty, 2)}${crit}`);
          ctx.add(n, 'geneve.option.length', o + 3, 1, 4 + ln, `Length: ${4 + ln} bytes`);
          if (ln) ctx.add(n, 'geneve.option.unknown.data', o + 4, ln, d.subarray(o + 4, o + 4 + ln));
          o += 4 + ln;
        }
      }
    }
    const p = off + 8 + olen;
    if (p < end) {
      if (proto === 0x6558) ctx.call('eth', p, end);
      else if (!ctx.dispatch('ethertype', proto, p, end)) ctx.data(p, end);
    }
    return end - off;
  },
});

// --- IPsec -----------------------------------------------------------------------------------------
registerProtocol({
  abbrev: 'esp', name: 'Encapsulating Security Payload', short: 'ESP',
  fields: [
    ['esp.spi', 'ESP SPI', 'uint32', { base: 'hex_dec' }],
    ['esp.sequence', 'ESP Sequence', 'uint32'],
    ['esp.contained_data', 'ESP Contained Data', 'bytes'],
  ],
  tables: { 'ip.proto': [50] },
  dissect(ctx, off, end) {
    const d = ctx.d;
    ctx.need(off, 8, end);
    const spi = u32(d, off), seq = u32(d, off + 4);
    ctx.setProtocol('ESP');
    ctx.setInfo(`ESP (SPI=${hexPad(spi, 8)})`);
    const t = ctx.proto('esp', off, end - off);
    ctx.add(t, 'esp.spi', off, 4, spi);
    ctx.add(t, 'esp.sequence', off + 4, 4, seq);
    return end - off;
  },
});
registerProtocol({
  abbrev: 'ah', name: 'Authentication Header', short: 'AH',
  fields: [
    ['ah.next_header', 'Next header', 'uint8', { strings: IP_PROTOS }],
    ['ah.length', 'Length', 'uint8'],
    ['ah.reserved', 'Reserved', 'bytes'],
    ['ah.spi', 'AH SPI', 'uint32', { base: 'hex' }],
    ['ah.sequence', 'AH Sequence', 'uint32'],
    ['ah.icv', 'AH ICV', 'bytes'],
  ],
  tables: { 'ip.proto': [51] },
  dissect(ctx, off, end) {
    const d = ctx.d;
    ctx.need(off, 12, end);
    const nxt = d[off], plen = d[off + 1], len = (plen + 2) * 4;
    ctx.need(off, len, end);
    const spi = u32(d, off + 4);
    ctx.setProtocol('AH');
    ctx.setInfo(`AH (SPI=${hexPad(spi, 8)})`);
    const t = ctx.proto('ah', off, len);
    ctx.add(t, 'ah.next_header', off, 1, nxt);
    ctx.add(t, 'ah.length', off + 1, 1, plen, `Length: ${plen} (${len} bytes)`);
    ctx.add(t, 'ah.reserved', off + 2, 2, d.subarray(off + 2, off + 4));
    ctx.add(t, 'ah.spi', off + 4, 4, spi);
    ctx.add(t, 'ah.sequence', off + 8, 4, u32(d, off + 8));
    if (len > 12) ctx.add(t, 'ah.icv', off + 12, len - 12, d.subarray(off + 12, off + len));
    if (off + len < end && !ctx.dispatch('ip.proto', nxt, off + len, end)) ctx.data(off + len, end);
    return end - off;
  },
});

// --- SCTP ------------------------------------------------------------------------------------------
const CHUNKS = { 0: 'DATA', 1: 'INIT', 2: 'INIT_ACK', 3: 'SACK', 4: 'HEARTBEAT', 5: 'HEARTBEAT_ACK', 6: 'ABORT', 7: 'SHUTDOWN', 8: 'SHUTDOWN_ACK', 9: 'ERROR', 10: 'COOKIE_ECHO', 11: 'COOKIE_ACK', 12: 'ECNE', 13: 'CWR', 14: 'SHUTDOWN_COMPLETE', 15: 'AUTH', 16: 'NR_SACK', 64: 'I_DATA', 128: 'ASCONF_ACK', 130: 'RE_CONFIG', 132: 'PAD', 192: 'FORWARD_TSN', 193: 'ASCONF' };
const PARAMS = { 1: 'Heartbeat info', 5: 'IPv4 address', 6: 'IPv6 address', 7: 'State cookie', 8: 'Unrecognized parameter', 9: 'Cookie preservative', 11: 'Hostname address', 12: 'Supported address types', 0x8000: 'ECN', 0x8008: 'Supported Extensions', 0xc000: 'Forward TSN supported', 0x8002: 'Random', 0x8003: 'Chunk list', 0x8004: 'Requested HMAC Algorithm' };
const PPI = { 0: 'not specified', 3: 'M3UA', 18: 'S1 Application Protocol (S1AP)', 46: 'Diameter', 47: 'Diameter DTLS', 51: 'WebRTC String', 53: 'WebRTC Binary', 60: 'NGAP' };
registerProtocol({
  abbrev: 'sctp', name: 'Stream Control Transmission Protocol', short: 'SCTP',
  fields: [
    ['sctp.srcport', 'Source port', 'uint16'],
    ['sctp.dstport', 'Destination port', 'uint16'],
    ['sctp.port', 'Port', 'uint16'],
    ['sctp.verification_tag', 'Verification tag', 'uint32', { base: 'hex' }],
    ['sctp.checksum', 'Checksum', 'uint32', { base: 'hex' }],
    ['sctp.checksum.status', 'Checksum Status', 'uint8', { base: 'none', strings: { 0: 'Bad', 1: 'Good', 2: 'Unverified' } }],
    ['sctp.chunk', 'Chunk', 'none'],
    ['sctp.chunk_type', 'Chunk type', 'uint8', { strings: CHUNKS }],
    ['sctp.chunk_bit_1', 'Bit', 'bool', { mask: 0x80, bits: 8, tfs: ['Skip chunk and continue processing of the packet', 'Stop processing of the packet'] }],
    ['sctp.chunk_bit_2', 'Bit', 'bool', { mask: 0x40, bits: 8, tfs: ['Do report', 'Do not report'] }],
    ['sctp.chunk_flags', 'Chunk flags', 'uint8', { base: 'hex' }],
    ['sctp.chunk_length', 'Chunk length', 'uint16'],
    ['sctp.chunk_padding', 'Chunk padding', 'bytes'],
    ['sctp.chunk_value', 'Chunk value', 'bytes'],
    ['sctp.cookie', 'Cookie', 'bytes'],
    ['sctp.init_initiate_tag', 'Initiate tag', 'uint32', { base: 'hex' }],
    ['sctp.init_credit', 'Advertised receiver window credit (a_rwnd)', 'uint32'],
    ['sctp.init_nr_out_streams', 'Number of outbound streams', 'uint16'],
    ['sctp.init_nr_in_streams', 'Number of inbound streams', 'uint16'],
    ['sctp.init_initial_tsn', 'Initial TSN', 'uint32'],
    ['sctp.initack_initiate_tag', 'Initiate tag', 'uint32', { base: 'hex' }],
    ['sctp.initack_credit', 'Advertised receiver window credit (a_rwnd)', 'uint32'],
    ['sctp.initack_nr_out_streams', 'Number of outbound streams', 'uint16'],
    ['sctp.initack_nr_in_streams', 'Number of inbound streams', 'uint16'],
    ['sctp.initack_initial_tsn', 'Initial TSN', 'uint32'],
    ['sctp.data_e_bit', 'E-Bit', 'bool', { mask: 0x01, bits: 8, tfs: ['Last segment', 'Not the last segment'] }],
    ['sctp.data_b_bit', 'B-Bit', 'bool', { mask: 0x02, bits: 8, tfs: ['First segment', 'Subsequent segment'] }],
    ['sctp.data_u_bit', 'U-Bit', 'bool', { mask: 0x04, bits: 8, tfs: ['Unordered delivery', 'Ordered delivery'] }],
    ['sctp.data_i_bit', 'I-Bit', 'bool', { mask: 0x08, bits: 8, tfs: ['Send SACK immediately', 'Possibly delay SACK'] }],
    ['sctp.data_tsn', 'Transmission sequence number (relative)', 'uint32'],
    ['sctp.data_tsn_raw', 'Transmission sequence number (absolute)', 'uint32'],
    ['sctp.data_sid', 'Stream identifier', 'uint16', { base: 'hex' }],
    ['sctp.data_ssn', 'Stream sequence number', 'uint16'],
    ['sctp.data_payload_proto_id', 'Payload protocol identifier', 'uint32', { strings: PPI }],
    ['sctp.sack_nonce_sum', 'Nonce sum', 'uint8', { mask: 0x01 }],
    ['sctp.sack_cumulative_tsn_ack', 'Cumulative TSN ACK (relative)', 'uint32'],
    ['sctp.sack_cumulative_tsn_ack_raw', 'Cumulative TSN ACK (absolute)', 'uint32'],
    ['sctp.sack_a_rwnd', 'Advertised receiver window credit (a_rwnd)', 'uint32'],
    ['sctp.sack_number_of_gap_blocks', 'Number of gap acknowledgement blocks', 'uint16'],
    ['sctp.sack_number_of_duplicated_tsns', 'Number of duplicated TSNs', 'uint16'],
    ['sctp.sack_gap_block_start', 'Start', 'uint16'],
    ['sctp.sack_gap_block_end', 'End', 'uint16'],
    ['sctp.sack_duplicate_tsn', 'Duplicate TSN', 'uint32'],
    ['sctp.shutdown_cumulative_tsn_ack', 'Cumulative TSN Ack', 'uint32'],
    ['sctp.abort_t_bit', 'T-Bit', 'bool', { mask: 0x01, bits: 8, tfs: ['Tag reflected', 'Tag not reflected'] }],
    ['sctp.shutdown_complete_t_bit', 'T-Bit', 'bool', { mask: 0x01, bits: 8, tfs: ['Tag reflected', 'Tag not reflected'] }],
    ['sctp.parameter_type', 'Parameter type', 'uint16', { base: 'hex', strings: PARAMS }],
    ['sctp.parameter_bit_1', 'Bit', 'bool', { mask: 0x8000, bits: 16, tfs: ['Skip parameter and continue processing of the chunk', 'Stop processing of chunk'] }],
    ['sctp.parameter_bit_2', 'Bit', 'bool', { mask: 0x4000, bits: 16, tfs: ['Do report', 'Do not report'] }],
    ['sctp.parameter_length', 'Parameter length', 'uint16'],
    ['sctp.parameter_value', 'Parameter value', 'bytes'],
    ['sctp.parameter_padding', 'Parameter padding', 'bytes'],
    ['sctp.parameter_ipv4_address', 'IP Version 4 address', 'ipv4'],
    ['sctp.parameter_ipv6_address', 'IP Version 6 address', 'ipv6'],
    ['sctp.parameter_heartbeat_information', 'Heartbeat information', 'bytes'],
    ['sctp.parameter_state_cookie', 'State cookie', 'bytes'],
  ],
  tables: { 'ip.proto': [132] },
  dissect(ctx, off, end) {
    const d = ctx.d;
    ctx.need(off, 12, end);
    const sp = u16(d, off), dp = u16(d, off + 2), vtag = u32(d, off + 4), ck = u32le(d, off + 8);
    ctx.setProtocol('SCTP');
    if (!ctx.inError) { ctx.ptype = 'sctp'; ctx.srcport = sp; ctx.dstport = dp; }
    const t = ctx.proto('sctp', off, 12, `Stream Control Transmission Protocol, Src Port: ${sp} (${sp}), Dst Port: ${dp} (${dp})`);
    if (ctx.tree) {
      ctx.add(t, 'sctp.srcport', off, 2, sp);
      ctx.add(t, 'sctp.dstport', off + 2, 2, dp);
      ctx.hidden(t, 'sctp.port', off, 2, sp);
      ctx.hidden(t, 'sctp.port', off + 2, 2, dp);
      ctx.add(t, 'sctp.verification_tag', off + 4, 4, vtag);
      ctx.add(t, 'sctp.checksum', off + 8, 4, u32(d, off + 8), `Checksum: ${hexPad(u32(d, off + 8), 8)} [unverified]`);
      ctx.gen(t, 'sctp.checksum.status', 2);
    }
    void ck;
    const net = ctx.net;
    const dirKey = (net ? net.src + ':' + sp + '>' + net.dst + ':' + dp : sp + '>' + dp);
    const revKey = (net ? net.dst + ':' + dp + '>' + net.src + ':' + sp : dp + '>' + sp);
    const st = ctx.session.st('sctp', () => new Map());
    let info = '';
    let o = off + 12;
    const dataChunks = [];
    while (o + 4 <= end) {
      const type = d[o], flags = d[o + 1], len = u16(d, o + 2);
      if (len < 4) { ctx.need(o, end - o + 1, end); break; }
      ctx.need(o, len, end);
      const padded = (len + 3) & ~3;
      const name = CHUNKS[type] || `UNKNOWN(${type})`;
      const v = o + 4, cend = o + len;
      const c = ctx.add(t, 'sctp.chunk', o, Math.min(padded, end - o), null, `${name} chunk`);
      if (ctx.tree) {
        const tn = ctx.add(c, 'sctp.chunk_type', o, 1, type);
        ctx.bits(tn, o, 1, type, ['sctp.chunk_bit_1', 'sctp.chunk_bit_2']);
        const fn = ctx.add(c, 'sctp.chunk_flags', o + 1, 1, flags);
        if (type === 0) ctx.bits(fn, o + 1, 1, flags, ['sctp.data_i_bit', 'sctp.data_u_bit', 'sctp.data_b_bit', 'sctp.data_e_bit']);
        else if (type === 3) ctx.bits(fn, o + 1, 1, flags, ['sctp.sack_nonce_sum']);
        else if (type === 6) ctx.bits(fn, o + 1, 1, flags, ['sctp.abort_t_bit']);
        else if (type === 14) ctx.bits(fn, o + 1, 1, flags, ['sctp.shutdown_complete_t_bit']);
        ctx.add(c, 'sctp.chunk_length', o + 2, 2, len);
      }
      info += name + ' ';
      switch (type) {
        case 0: {
          ctx.need(v, 12, cend);
          const tsn = u32(d, v), sid = u16(d, v + 4), ssn = u16(d, v + 6), ppi = u32(d, v + 8);
          const base = tsnBase(ctx, st, dirKey, tsn);
          const rel = (tsn - base) >>> 0;
          info += `(TSN=${rel}) `;
          if (ctx.tree) {
            const ord = flags & 4 ? 'unordered' : 'ordered';
            const seg = (flags & 3) === 3 ? 'complete segment' : flags & 2 ? 'first segment' : flags & 1 ? 'last segment' : 'middle segment';
            c.label = `DATA chunk (${ord}, ${seg}, TSN: ${rel}, SID: ${sid}, SSN: ${ssn}, PPID: ${ppi}, payload length: ${len - 16} bytes)`;
            ctx.add(c, 'sctp.data_tsn', v, 4, rel);
            ctx.add(c, 'sctp.data_tsn_raw', v, 4, tsn);
            ctx.add(c, 'sctp.data_sid', v + 4, 2, sid);
            ctx.add(c, 'sctp.data_ssn', v + 6, 2, ssn);
            ctx.add(c, 'sctp.data_payload_proto_id', v + 8, 4, ppi);
            if (padded > len && o + padded <= end) ctx.add(c, 'sctp.chunk_padding', cend, padded - len, d.subarray(cend, o + padded));
          }
          if (len > 16) dataChunks.push([ppi, v + 12, cend, sp, dp]);
          break;
        }
        case 1: case 2: {
          ctx.need(v, 16, cend);
          const p = type === 1 ? 'sctp.init_' : 'sctp.initack_';
          const tag = u32(d, v), credit = u32(d, v + 4), os = u16(d, v + 8), is = u16(d, v + 10), itsn = u32(d, v + 12);
          if (ctx.first) st.set(dirKey, itsn);
          if (ctx.tree) {
            c.label = `${name} chunk (Outbound streams: ${os}, inbound streams: ${is})`;
            ctx.add(c, p + 'initiate_tag', v, 4, tag);
            ctx.add(c, p + 'credit', v + 4, 4, credit);
            ctx.add(c, p + 'nr_out_streams', v + 8, 2, os);
            ctx.add(c, p + 'nr_in_streams', v + 10, 2, is);
            ctx.add(c, p + 'initial_tsn', v + 12, 4, itsn);
            params(ctx, c, v + 16, cend);
          }
          break;
        }
        case 3: {
          ctx.need(v, 12, cend);
          const cum = u32(d, v), rwnd = u32(d, v + 4), ng = u16(d, v + 8), nd = u16(d, v + 10);
          const base = st.has(revKey) ? st.get(revKey) : cum;
          const rel = (cum - base) >>> 0;
          info += `(Ack=${rel}, Arwnd=${rwnd}) `;
          if (ctx.tree) {
            c.label = `SACK chunk (Cumulative TSN: ${cum}, a_rwnd: ${rwnd}, gaps: ${ng}, duplicate TSNs: ${nd})`;
            ctx.add(c, 'sctp.sack_cumulative_tsn_ack', v, 4, rel);
            ctx.add(c, 'sctp.sack_cumulative_tsn_ack_raw', v, 4, cum);
            ctx.add(c, 'sctp.sack_a_rwnd', v + 4, 4, rwnd);
            ctx.add(c, 'sctp.sack_number_of_gap_blocks', v + 8, 2, ng);
            ctx.add(c, 'sctp.sack_number_of_duplicated_tsns', v + 10, 2, nd);
            let p = v + 12;
            for (let i = 0; i < ng && p + 4 <= cend; i++, p += 4) {
              const g = ctx.text(c, `Gap Acknowledgement for TSN ${cum + u16(d, p)} to ${cum + u16(d, p + 2)}`, p, 4);
              ctx.add(g, 'sctp.sack_gap_block_start', p, 2, u16(d, p));
              ctx.add(g, 'sctp.sack_gap_block_end', p + 2, 2, u16(d, p + 2));
            }
            for (let i = 0; i < nd && p + 4 <= cend; i++, p += 4) ctx.add(c, 'sctp.sack_duplicate_tsn', p, 4, u32(d, p));
          }
          break;
        }
        case 4: case 5:
          if (ctx.tree) { c.label = `${name} chunk (Information: ${len - 4} bytes)`; params(ctx, c, v, cend); }
          break;
        case 7:
          ctx.need(v, 4, cend);
          if (ctx.tree) { c.label = `SHUTDOWN chunk (Cumulative TSN ack: ${u32(d, v)})`; ctx.add(c, 'sctp.shutdown_cumulative_tsn_ack', v, 4, u32(d, v)); }
          break;
        case 10:
          if (ctx.tree) { c.label = `COOKIE_ECHO chunk (Cookie length: ${len - 4} bytes)`; if (len > 4) ctx.add(c, 'sctp.cookie', v, len - 4, d.subarray(v, cend)); }
          break;
        default:
          if (ctx.tree && len > 4) ctx.add(c, 'sctp.chunk_value', v, len - 4, d.subarray(v, cend));
      }
      o += padded;
    }
    ctx.setInfo(info);
    for (const [ppi, s, e, sport, dport] of dataChunks) {
      if (ctx.dispatch('sctp.ppi', ppi, s, e)) continue;
      const lo = sport < dport ? sport : dport, hi = sport < dport ? dport : sport;
      if (ctx.dispatch('sctp.port', lo, s, e) || ctx.dispatch('sctp.port', hi, s, e)) continue;
      ctx.data(s, e);
    }
    return end - off;
  },
});

function tsnBase(ctx, st, key, tsn) {
  let b = ctx.fd.sctpBase;
  if (b === undefined) {
    b = st.has(key) ? st.get(key) : tsn;
    if (!st.has(key) && ctx.first) st.set(key, tsn);
    if (ctx.first) ctx.fd.sctpBase = b;
  }
  return b;
}

function params(ctx, c, o, end) {
  const d = ctx.d;
  while (o + 4 <= end) {
    const type = u16(d, o), len = u16(d, o + 2);
    if (len < 4 || o + len > end) break;
    const v = o + 4, vl = len - 4;
    const name = PARAMS[type] || `Unknown (0x${type.toString(16).padStart(4, '0')})`;
    let label = `${name} parameter`;
    let f = null, val = null;
    if (type === 5 && vl === 4) { val = ip4(d, v); f = 'sctp.parameter_ipv4_address'; label += ` (Address: ${val})`; }
    else if (type === 6 && vl === 16) { val = ip6(d, v); f = 'sctp.parameter_ipv6_address'; label += ` (Address: ${val})`; }
    else if (type === 7) { val = d.subarray(v, v + vl); f = 'sctp.parameter_state_cookie'; label += ` (Cookie length: ${vl} bytes)`; }
    else if (type === 1) { val = d.subarray(v, v + vl); f = 'sctp.parameter_heartbeat_information'; label += ` (Information: ${vl} bytes)`; }
    const n = ctx.text(c, label, o, len);
    const tn = ctx.add(n, 'sctp.parameter_type', o, 2, type);
    ctx.bits(tn, o, 2, type, ['sctp.parameter_bit_1', 'sctp.parameter_bit_2']);
    ctx.add(n, 'sctp.parameter_length', o + 2, 2, len);
    if (f) ctx.add(n, f, v, vl, val);
    else if (vl) ctx.add(n, 'sctp.parameter_value', v, vl, d.subarray(v, v + vl));
    const padded = (len + 3) & ~3;
    if (padded > len && o + padded <= end) ctx.add(n, 'sctp.parameter_padding', o + len, padded - len, d.subarray(o + len, o + padded));
    o += padded;
  }
}

void ethertype;
