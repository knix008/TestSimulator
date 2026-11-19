// LAN control protocols: LLDP, CDP, STP/RSTP/MSTP, LACP (slow protocols), EAPOL + EAP.
import { registerProtocol, u16, u24, u32, mac, ip4, ip6, hexPad, ascii, hexStr, NULLNODE } from '../core.js';

const SET_TFS = ['Set', 'Not set'];
const YESNO = ['Yes', 'No'];

// --- LLDP --------------------------------------------------------------------------------------------
const TLV_TYPES = { 0: 'End of LLDPDU', 1: 'Chassis Id', 2: 'Port Id', 3: 'Time to Live', 4: 'Port Description', 5: 'System Name', 6: 'System Description', 7: 'System Capabilities', 8: 'Management Address', 127: 'Organization Specific' };
const CHASSIS_SUB = { 1: 'Chassis component', 2: 'Interface alias', 3: 'Port component', 4: 'MAC address', 5: 'Network address', 6: 'Interface name', 7: 'Locally assigned' };
const PORT_SUB = { 1: 'Interface alias', 2: 'Port component', 3: 'MAC address', 4: 'Network address', 5: 'Interface name', 6: 'Agent circuit Id', 7: 'Locally assigned' };
const MGMT_AF = { 1: 'IPv4', 2: 'IPv6', 6: '802 (MAC)' };
const IF_SUB = { 1: 'Unknown', 2: 'ifIndex', 3: 'System port number' };
const CAPS = [['other', 'Other', 0x1], ['repeater', 'Repeater', 0x2], ['bridge', 'Bridge', 0x4], ['wlan_access_pt', 'WLAN access point', 0x8], ['router', 'Router', 0x10], ['telephone', 'Telephone', 0x20], ['docsis_cable_device', 'DOCSIS cable device', 0x40], ['station_only', 'Station only', 0x80], ['cvlan', 'C-VLAN component', 0x100], ['svlan', 'S-VLAN component', 0x200], ['tpmr', 'TPMR component', 0x400]];
const CAP_TFS = ['Capable', 'Not capable'];
const ORGS = { 0x0080c2: 'IEEE 802.1 Chair', 0x00120f: 'IEEE 802.3 Working Group', 0x0012bb: 'Telecommunications Industry Association TR-41 Committee', 0x00000c: 'Cisco Systems, Inc' };
const DOT1_SUB = { 1: 'Port VLAN ID', 2: 'Port and Protocol VLAN ID', 3: 'VLAN Name', 4: 'Protocol Identity', 7: 'Link Aggregation' };
const DOT3_SUB = { 1: 'MAC/PHY Configuration/Status', 2: 'Power Via MDI', 3: 'Link Aggregation', 4: 'Maximum Frame Size' };

registerProtocol({
  abbrev: 'lldp', name: 'Link Layer Discovery Protocol', short: 'LLDP',
  fields: [
    ['lldp.tlv.type', 'TLV Type', 'uint16', { mask: 0xfe00, bits: 16, strings: TLV_TYPES }],
    ['lldp.tlv.len', 'TLV Length', 'uint16', { mask: 0x01ff, bits: 16 }],
    ['lldp.chassis.subtype', 'Chassis Id Subtype', 'uint8', { strings: CHASSIS_SUB }],
    ['lldp.chassis.id', 'Chassis Id', 'bytes'],
    ['lldp.chassis.id.mac', 'Chassis Id', 'ether'],
    ['lldp.chassis.id.ip4', 'Chassis Id', 'ipv4'],
    ['lldp.chassis.id.ip6', 'Chassis Id', 'ipv6'],
    ['lldp.port.subtype', 'Port Id Subtype', 'uint8', { strings: PORT_SUB }],
    ['lldp.port.id', 'Port Id', 'string'],
    ['lldp.port.id.mac', 'Port Id', 'ether'],
    ['lldp.port.id.ip4', 'Port Id', 'ipv4'],
    ['lldp.port.desc', 'Port Description', 'string'],
    ['lldp.time_to_live', 'Seconds', 'uint16'],
    ['lldp.tlv.system.name', 'System Name', 'string'],
    ['lldp.tlv.system.desc', 'System Description', 'string'],
    ['lldp.tlv.system_cap', 'Capabilities', 'uint16', { base: 'hex' }],
    ...CAPS.map(([k, n, m]) => [`lldp.tlv.system_cap.${k}`, n, 'bool', { mask: m, bits: 16, tfs: CAP_TFS }]),
    ['lldp.tlv.enable_system_cap', 'Enabled Capabilities', 'uint16', { base: 'hex' }],
    ...CAPS.map(([k, n, m]) => [`lldp.tlv.enable_system_cap.${k}`, n, 'bool', { mask: m, bits: 16, tfs: CAP_TFS }]),
    ['lldp.mgn.address.len', 'Address String Length', 'uint8'],
    ['lldp.mgn.address.subtype', 'Address Subtype', 'uint8', { strings: MGMT_AF }],
    ['lldp.mgn.addr.ip4', 'Management Address', 'ipv4'],
    ['lldp.mgn.addr.ip6', 'Management Address', 'ipv6'],
    ['lldp.mgn.addr.hex', 'Management Address', 'bytes'],
    ['lldp.mgn.interface.subtype', 'Interface Subtype', 'uint8', { strings: IF_SUB }],
    ['lldp.mgn.interface.number', 'Interface Number', 'uint32'],
    ['lldp.mgn.obj.len', 'OID String Length', 'uint8'],
    ['lldp.orgtlv.oui', 'Organization Unique Code', 'uint24', { base: 'hex', strings: ORGS }],
    ['lldp.ieee.802_1.subtype', 'IEEE 802.1 Subtype', 'uint8', { base: 'hex', strings: DOT1_SUB }],
    ['lldp.ieee.802_1.port_vlan.id', 'Port VLAN Identifier', 'uint16', { base: 'dec_hex' }],
    ['lldp.ieee.802_1.vlan.id', 'VLAN Identifier', 'uint16', { base: 'dec_hex' }],
    ['lldp.ieee.802_1.vlan.name', 'VLAN Name', 'string'],
    ['lldp.ieee.802_3.subtype', 'IEEE 802.3 Subtype', 'uint8', { base: 'hex', strings: DOT3_SUB }],
    ['lldp.ieee.802_3.max_frame_size', 'Maximum Frame Size', 'uint16'],
    ['lldp.unknown_subtype.content', 'Unknown Subtype Content', 'bytes'],
    ['lldp.unknown_tlv', 'Unknown TLV', 'bytes'],
  ],
  tables: { ethertype: [0x88cc] },
  dissect(ctx, off, end) {
    const d = ctx.d;
    ctx.setProtocol('LLDP');
    const t = ctx.proto('lldp', off, end - off);
    let o = off;
    let info = '';
    while (o + 2 <= end) {
      const h = u16(d, o), type = h >> 9, len = h & 0x1ff;
      ctx.need(o + 2, len, end);
      const v = o + 2, tend = v + len;
      if (type === 0) {
        const n = ctx.text(t, 'End of LLDPDU', o, 2);
        tlvHead(ctx, n, o, h);
        o = tend;
        break;
      }
      let n = NULLNODE;
      switch (type) {
        case 1: case 2: {
          const sub = d[v];
          const isC = type === 1;
          const names = isC ? CHASSIS_SUB : PORT_SUB;
          let idStr;
          const macSub = isC ? 4 : 3, netSub = isC ? 5 : 4;
          if (sub === macSub && len === 7) idStr = mac(d, v + 1);
          else if (sub === netSub && len === 6 && d[v + 1] === 1) idStr = ip4(d, v + 2);
          else idStr = ascii(d, v + 1, len - 1);
          info += `${isC ? (sub === 4 ? 'MA/' : sub === 7 ? 'LA/' : sub === 6 ? 'IN/' : sub === 5 ? 'NA/' : 'CC/') : (sub === 3 ? 'MA/' : sub === 7 ? 'LA/' : sub === 5 ? 'IN/' : sub === 4 ? 'NA/' : sub === 1 ? 'IA/' : 'PC/')}${idStr} `;
          n = ctx.text(t, `${isC ? 'Chassis' : 'Port'} Subtype = ${names[sub] || 'Reserved'}, Id: ${idStr}`, o, 2 + len);
          tlvHead(ctx, n, o, h);
          const p = isC ? 'lldp.chassis' : 'lldp.port';
          ctx.add(n, `${p}.subtype`, v, 1, sub);
          if (sub === macSub && len === 7) ctx.add(n, `${p}.id.mac`, v + 1, 6, idStr);
          else if (sub === netSub && len === 6 && d[v + 1] === 1) ctx.add(n, `${p}.id.ip4`, v + 2, 4, idStr);
          else if (isC) ctx.add(n, 'lldp.chassis.id', v + 1, len - 1, d.subarray(v + 1, tend), `Chassis Id: ${idStr}`);
          else ctx.add(n, 'lldp.port.id', v + 1, len - 1, idStr);
          break;
        }
        case 3: {
          const ttl = u16(d, v);
          info += `${ttl} `;
          n = ctx.text(t, `Time To Live = ${ttl} sec`, o, 2 + len);
          if (ctx.tree) ctx.text(n, ttl === 0 ? '[Shutdown LLDPDU]' : '[Normal LLDPDU]').generated = true;
          tlvHead(ctx, n, o, h);
          ctx.add(n, 'lldp.time_to_live', v, 2, ttl);
          break;
        }
        case 4: case 5: case 6: {
          const s = ascii(d, v, len);
          const lbl = type === 4 ? 'Port Description' : type === 5 ? 'System Name' : 'System Description';
          if (type === 5) info += `SysN=${s} `;
          if (type === 6) info += `SysD=${s} `;
          n = ctx.text(t, `${lbl} = ${s}`, o, 2 + len);
          tlvHead(ctx, n, o, h);
          ctx.add(n, type === 4 ? 'lldp.port.desc' : type === 5 ? 'lldp.tlv.system.name' : 'lldp.tlv.system.desc', v, len, s);
          break;
        }
        case 7: {
          n = ctx.text(t, 'Capabilities', o, 2 + len);
          tlvHead(ctx, n, o, h);
          if (len >= 4) {
            const c = u16(d, v), e = u16(d, v + 2);
            const cn = ctx.add(n, 'lldp.tlv.system_cap', v, 2, c);
            ctx.bits(cn, v, 2, c, CAPS.map(([k]) => `lldp.tlv.system_cap.${k}`));
            const en = ctx.add(n, 'lldp.tlv.enable_system_cap', v + 2, 2, e);
            ctx.bits(en, v + 2, 2, e, CAPS.map(([k]) => `lldp.tlv.enable_system_cap.${k}`));
          }
          break;
        }
        case 8: {
          n = ctx.text(t, 'Management Address', o, 2 + len);
          tlvHead(ctx, n, o, h);
          const al = d[v], af = d[v + 1];
          ctx.add(n, 'lldp.mgn.address.len', v, 1, al);
          ctx.add(n, 'lldp.mgn.address.subtype', v + 1, 1, af);
          if (af === 1 && al === 5) ctx.add(n, 'lldp.mgn.addr.ip4', v + 2, 4, ip4(d, v + 2));
          else if (af === 2 && al === 17) ctx.add(n, 'lldp.mgn.addr.ip6', v + 2, 16, ip6(d, v + 2));
          else ctx.add(n, 'lldp.mgn.addr.hex', v + 2, al - 1, d.subarray(v + 2, v + 1 + al));
          let p = v + 1 + al;
          if (p + 6 <= tend) {
            ctx.add(n, 'lldp.mgn.interface.subtype', p, 1, d[p]);
            ctx.add(n, 'lldp.mgn.interface.number', p + 1, 4, u32(d, p + 1));
            ctx.add(n, 'lldp.mgn.obj.len', p + 5, 1, d[p + 5]);
          }
          break;
        }
        case 127: {
          const oui = u24(d, v), sub = d[v + 3];
          const org = ORGS[oui] || 'Unknown';
          const subs = oui === 0x0080c2 ? DOT1_SUB : oui === 0x00120f ? DOT3_SUB : {};
          n = ctx.text(t, `${org} - ${subs[sub] || 'Unknown'}`, o, 2 + len);
          tlvHead(ctx, n, o, h);
          ctx.add(n, 'lldp.orgtlv.oui', v, 3, oui, `Organization Unique Code: ${hexStr(d, v, 3, ':')} (${org})`);
          if (oui === 0x0080c2) {
            ctx.add(n, 'lldp.ieee.802_1.subtype', v + 3, 1, sub);
            if (sub === 1 && len >= 6) ctx.add(n, 'lldp.ieee.802_1.port_vlan.id', v + 4, 2, u16(d, v + 4));
            else if (sub === 3 && len >= 7) {
              ctx.add(n, 'lldp.ieee.802_1.vlan.id', v + 4, 2, u16(d, v + 4));
              ctx.add(n, 'lldp.ieee.802_1.vlan.name', v + 7, d[v + 6], ascii(d, v + 7, Math.min(d[v + 6], tend - v - 7)));
            } else if (len > 4) ctx.add(n, 'lldp.unknown_subtype.content', v + 4, len - 4, d.subarray(v + 4, tend));
          } else if (oui === 0x00120f) {
            ctx.add(n, 'lldp.ieee.802_3.subtype', v + 3, 1, sub);
            if (sub === 4 && len >= 6) ctx.add(n, 'lldp.ieee.802_3.max_frame_size', v + 4, 2, u16(d, v + 4));
            else if (len > 4) ctx.add(n, 'lldp.unknown_subtype.content', v + 4, len - 4, d.subarray(v + 4, tend));
          } else if (len > 4) ctx.add(n, 'lldp.unknown_subtype.content', v + 4, len - 4, d.subarray(v + 4, tend));
          break;
        }
        default:
          n = ctx.text(t, `Unknown TLV (${type})`, o, 2 + len);
          tlvHead(ctx, n, o, h);
          if (len) ctx.add(n, 'lldp.unknown_tlv', v, len, d.subarray(v, tend));
      }
      o = tend;
    }
    ctx.setInfo(info);
    return o - off;
  },
});
function tlvHead(ctx, n, o, h) {
  if (!ctx.tree) return;
  ctx.bits(n, o, 2, h, ['lldp.tlv.type', 'lldp.tlv.len']);
}

// --- CDP ---------------------------------------------------------------------------------------------
const CDP_TLV = { 1: 'Device ID', 2: 'Addresses', 3: 'Port ID', 4: 'Capabilities', 5: 'Software version', 6: 'Platform', 9: 'VTP Management Domain', 10: 'Native VLAN', 11: 'Duplex', 14: 'VoIP VLAN Reply', 18: 'Trust Bitmap', 19: 'Untrusted Port CoS', 20: 'System Name', 22: 'Management Address', 0x0016: 'Management Address' };
const CDP_CAPS = [['router', 'Router', 0x1], ['trans_bridge', 'Transparent Bridge', 0x2], ['src_bridge', 'Source Route Bridge', 0x4], ['switch', 'Switch', 0x8], ['host', 'Host', 0x10], ['igmp_capable', 'IGMP capable', 0x20], ['repeater', 'Repeater', 0x40], ['voip_phone', 'VoIP Phone', 0x80], ['remote', 'Remotely Managed Device', 0x100], ['cvta', 'CVTA/STP Dispute Resolution/Cisco VT Camera', 0x200], ['mac_relay', 'Two Port Mac Relay', 0x400]];
registerProtocol({
  abbrev: 'cdp', name: 'Cisco Discovery Protocol', short: 'CDP',
  fields: [
    ['cdp.version', 'Version', 'uint8'],
    ['cdp.ttl', 'TTL', 'uint8'],
    ['cdp.checksum', 'Checksum', 'uint16', { base: 'hex' }],
    ['cdp.checksum.status', 'Checksum Status', 'uint8', { base: 'none', strings: { 0: 'Bad', 1: 'Good', 2: 'Unverified' } }],
    ['cdp.tlv.type', 'Type', 'uint16', { base: 'hex', strings: CDP_TLV }],
    ['cdp.tlv.len', 'Length', 'uint16'],
    ['cdp.deviceid', 'Device ID', 'string'],
    ['cdp.platform', 'Platform', 'string'],
    ['cdp.portid', 'Sent through Interface', 'string'],
    ['cdp.software_version', 'Software version', 'string'],
    ['cdp.capabilities', 'Capabilities', 'uint32', { base: 'hex' }],
    ...CDP_CAPS.map(([k, n, m]) => [`cdp.capabilities.${k}`, n, 'bool', { mask: m, bits: 32, tfs: YESNO }]),
    ['cdp.number_of_addresses', 'Number of addresses', 'uint32'],
    ['cdp.nrgyz.ip_address', 'IP Address', 'ipv4'],
    ['cdp.native_vlan', 'Native VLAN', 'uint16'],
    ['cdp.duplex', 'Duplex', 'bool', { tfs: ['Full', 'Half'] }],
    ['cdp.system_name', 'System Name', 'string'],
    ['cdp.vtp_management_domain', 'VTP Management Domain', 'string'],
    ['cdp.data', 'Data', 'bytes'],
  ],
  experts: [['cdp.checksum.bad', 'error', 'Checksum', 'Bad checksum']],
  tables: { 'llc.cisco_pid': [0x2000] },
  dissect(ctx, off, end) {
    const d = ctx.d;
    ctx.need(off, 4, end);
    ctx.setProtocol('CDP');
    const t = ctx.proto('cdp', off, end - off);
    const ck = u16(d, off + 2);
    ctx.add(t, 'cdp.version', off, 1, d[off]);
    ctx.add(t, 'cdp.ttl', off + 1, 1, d[off + 1], `TTL: ${d[off + 1]} seconds`);
    // Cisco's checksum pads an odd final byte at the low end of the last word.
    const calc = cdpChecksum(d, off, end - off);
    const ok = calc === 0;
    if (ctx.tree) {
      const should = ok ? ck : (() => { const c = d.slice(off, end); c[2] = 0; c[3] = 0; return cdpChecksum(c, 0, c.length); })();
      const cn = ctx.add(t, 'cdp.checksum', off + 2, 2, ck, ok ? `Checksum: ${hexPad(ck, 4)} [correct]` : `Checksum: ${hexPad(ck, 4)} incorrect, should be ${hexPad(should, 4)}`);
      if (!ok) ctx.ei(cn, 'cdp.checksum.bad', off + 2, 2, `Bad checksum [should be ${hexPad(should, 4)}]`);
      ctx.gen(t, 'cdp.checksum.status', ok ? 1 : 0);
    } else if (!ok) ctx.ei(NULLNODE, 'cdp.checksum.bad');
    let o = off + 4;
    let dev = '', port = '';
    while (o + 4 <= end) {
      const type = u16(d, o), len = u16(d, o + 2);
      if (len < 4) break;
      ctx.need(o, len, end);
      const v = o + 4, tend = o + len, vl = len - 4;
      const nm = CDP_TLV[type] || 'Unknown';
      let n;
      switch (type) {
        case 1: case 3: case 5: case 6: case 9: case 20: {
          const s = ascii(d, v, vl);
          if (type === 1) dev = s;
          if (type === 3) port = s;
          const f = { 1: 'cdp.deviceid', 3: 'cdp.portid', 5: 'cdp.software_version', 6: 'cdp.platform', 9: 'cdp.vtp_management_domain', 20: 'cdp.system_name' }[type];
          n = ctx.text(t, type === 5 ? 'Software Version' : `${nm}: ${s}`, o, len);
          tlv(ctx, n, o, type, len);
          ctx.add(n, f, v, vl, s);
          break;
        }
        case 2: case 22: {
          n = ctx.text(t, type === 2 ? 'Addresses' : 'Management Addresses', o, len);
          tlv(ctx, n, o, type, len);
          const cnt = u32(d, v);
          ctx.add(n, 'cdp.number_of_addresses', v, 4, cnt);
          let p = v + 4;
          for (let i = 0; i < cnt && p + 2 <= tend; i++) {
            const pl = d[p + 1];
            const al = u16(d, p + 2 + pl);
            if (pl === 1 && d[p + 2] === 0xcc && al === 4) {
              const a = ip4(d, p + 4 + pl);
              const an = ctx.text(n, `IP address: ${a}`, p, 4 + pl + al);
              ctx.add(an, 'cdp.nrgyz.ip_address', p + 4 + pl, 4, a, `IP Address: ${a}`);
            }
            p += 4 + pl + al;
          }
          break;
        }
        case 4: {
          n = ctx.text(t, 'Capabilities', o, len);
          tlv(ctx, n, o, type, len);
          const c = u32(d, v);
          const cn = ctx.add(n, 'cdp.capabilities', v, 4, c);
          ctx.bits(cn, v, 4, c, CDP_CAPS.map(([k]) => `cdp.capabilities.${k}`));
          break;
        }
        case 10: {
          const vl2 = u16(d, v);
          n = ctx.text(t, `Native VLAN: ${vl2}`, o, len);
          tlv(ctx, n, o, type, len);
          ctx.add(n, 'cdp.native_vlan', v, 2, vl2);
          break;
        }
        case 11: {
          const full = d[v] !== 0;
          n = ctx.text(t, `Duplex: ${full ? 'Full' : 'Half'}`, o, len);
          tlv(ctx, n, o, type, len);
          ctx.add(n, 'cdp.duplex', v, 1, full);
          break;
        }
        default:
          n = ctx.text(t, `Type: ${nm}`, o, len);
          tlv(ctx, n, o, type, len);
          if (vl) ctx.add(n, 'cdp.data', v, vl, d.subarray(v, tend));
      }
      o = tend;
    }
    ctx.setInfo(`Device ID: ${dev}  Port ID: ${port}  `);
    return end - off;
  },
});
function tlv(ctx, n, o, type, len) {
  if (!ctx.tree) return;
  ctx.add(n, 'cdp.tlv.type', o, 2, type);
  ctx.add(n, 'cdp.tlv.len', o + 2, 2, len);
}
function cdpChecksum(d, off, len) {
  let s = 0, i = 0;
  for (; i + 1 < len; i += 2) s += (d[off + i] << 8) | d[off + i + 1];
  if (i < len) {
    // Cisco sign-extends the odd byte into the last word
    const b = d[off + i];
    s += b & 0x80 ? 0xff00 | b : b;
  }
  while (s > 0xffff) s = (s & 0xffff) + Math.floor(s / 65536);
  return (~s) & 0xffff;
}
export { cdpChecksum };

// --- STP ---------------------------------------------------------------------------------------------
const STP_VER = { 0: 'Spanning Tree', 2: 'Rapid Spanning Tree', 3: 'Multiple Spanning Tree', 4: 'Shortest Path Tree' };
const BPDU_TYPE = { 0x00: 'Configuration', 0x02: 'Rapid/Multiple Spanning Tree', 0x80: 'Topology Change Notification' };
const ROLE = { 0: 'Unknown', 1: 'Alternate or Backup', 2: 'Root', 3: 'Designated' };
registerProtocol({
  abbrev: 'stp', name: 'Spanning Tree Protocol', short: 'STP',
  fields: [
    ['stp.protocol', 'Protocol Identifier', 'uint16', { base: 'hex', strings: { 0: 'Spanning Tree Protocol' } }],
    ['stp.version', 'Protocol Version Identifier', 'uint8', { strings: STP_VER }],
    ['stp.type', 'BPDU Type', 'uint8', { base: 'hex', strings: BPDU_TYPE }],
    ['stp.flags', 'BPDU flags', 'uint8', { base: 'hex' }],
    ['stp.flags.tcack', 'Topology Change Acknowledgment', 'bool', { mask: 0x80, bits: 8, tfs: YESNO }],
    ['stp.flags.agreement', 'Agreement', 'bool', { mask: 0x40, bits: 8, tfs: YESNO }],
    ['stp.flags.forwarding', 'Forwarding', 'bool', { mask: 0x20, bits: 8, tfs: YESNO }],
    ['stp.flags.learning', 'Learning', 'bool', { mask: 0x10, bits: 8, tfs: YESNO }],
    ['stp.flags.port_role', 'Port Role', 'uint8', { mask: 0x0c, strings: ROLE }],
    ['stp.flags.proposal', 'Proposal', 'bool', { mask: 0x02, bits: 8, tfs: YESNO }],
    ['stp.flags.tc', 'Topology Change', 'bool', { mask: 0x01, bits: 8, tfs: YESNO }],
    ['stp.root.prio', 'Root Bridge Priority', 'uint16'],
    ['stp.root.ext', 'Root Bridge System ID Extension', 'uint16'],
    ['stp.root.hw', 'Root Bridge System ID', 'ether'],
    ['stp.root.cost', 'Root Path Cost', 'uint32'],
    ['stp.bridge.prio', 'Bridge Priority', 'uint16'],
    ['stp.bridge.ext', 'Bridge System ID Extension', 'uint16'],
    ['stp.bridge.hw', 'Bridge System ID', 'ether'],
    ['stp.port', 'Port identifier', 'uint16', { base: 'hex' }],
    ['stp.msg_age', 'Message Age', 'double'],
    ['stp.max_age', 'Max Age', 'double'],
    ['stp.hello', 'Hello Time', 'double'],
    ['stp.forward', 'Forward Delay', 'double'],
    ['stp.version_1_length', 'Version 1 Length', 'uint8'],
    ['mstp.version_3_length', 'Version 3 Length', 'uint16'],
    ['mstp.config_name', 'MST Config name', 'string'],
    ['mstp.config_revision_level', 'MST Config revision', 'uint16'],
    ['mstp.config_digest', 'MST Config digest', 'bytes'],
    ['mstp.cist_internal_root_path_cost', 'CIST Internal Root Path Cost', 'uint32'],
    ['mstp.cist_remaining_hops', 'CIST Remaining hops', 'uint8'],
  ],
  tables: { 'llc.dsap': [0x42] },
  dissect(ctx, off, end) {
    const d = ctx.d;
    ctx.need(off, 4, end);
    const ver = d[off + 2], type = d[off + 3];
    ctx.setProtocol(ver === 3 ? 'MSTP' : ver === 2 ? 'STP' : 'STP');
    const t = ctx.proto('stp', off, end - off);
    ctx.add(t, 'stp.protocol', off, 2, u16(d, off));
    ctx.add(t, 'stp.version', off + 2, 1, ver);
    ctx.add(t, 'stp.type', off + 3, 1, type);
    if (type === 0x80) { ctx.setInfo('Topology Change Notification'); return end - off; }
    ctx.need(off, 35, end);
    const fl = d[off + 4];
    if (ctx.tree) {
      const names = [];
      if (fl & 0x80) names.push('Topology Change Acknowledgment');
      if (fl & 0x40) names.push('Agreement');
      if (fl & 0x20) names.push('Forwarding');
      if (fl & 0x10) names.push('Learning');
      if (ver >= 2) names.push(`Port Role: ${ROLE[(fl >> 2) & 3]}`);
      if (fl & 0x02) names.push('Proposal');
      if (fl & 0x01) names.push('Topology Change');
      const fn = ctx.add(t, 'stp.flags', off + 4, 1, fl, `BPDU flags: ${hexPad(fl, 2)}${names.length ? ', ' + names.join(', ') : ''}`);
      ctx.bits(fn, off + 4, 1, fl, ver >= 2
        ? ['stp.flags.tcack', 'stp.flags.agreement', 'stp.flags.forwarding', 'stp.flags.learning', 'stp.flags.port_role', 'stp.flags.proposal', 'stp.flags.tc']
        : ['stp.flags.tcack', 'stp.flags.tc']);
    }
    const rp = u16(d, off + 5), rm = mac(d, off + 7), cost = u32(d, off + 13), bp = u16(d, off + 17), bm = mac(d, off + 19), port = u16(d, off + 25);
    bridgeId(ctx, t, off + 5, 'Root Identifier', 'stp.root', rp, rm);
    ctx.add(t, 'stp.root.cost', off + 13, 4, cost);
    bridgeId(ctx, t, off + 17, 'Bridge Identifier', 'stp.bridge', bp, bm);
    ctx.add(t, 'stp.port', off + 25, 2, port);
    for (const [f, n, i] of [['stp.msg_age', 'Message Age', 27], ['stp.max_age', 'Max Age', 29], ['stp.hello', 'Hello Time', 31], ['stp.forward', 'Forward Delay', 33]]) {
      const v = u16(d, off + i) / 256;
      ctx.add(t, f, off + i, 2, v, `${n}: ${v}`);
    }
    if (ver >= 2 && off + 36 <= end) ctx.add(t, 'stp.version_1_length', off + 35, 1, d[off + 35]);
    if (ver >= 3 && off + 38 <= end) {
      ctx.add(t, 'mstp.version_3_length', off + 36, 2, u16(d, off + 36));
      if (off + 102 <= end) {
        ctx.add(t, 'mstp.config_name', off + 39, 32, ascii(d, off + 39, 32).replace(/\0+$/, ''));
        ctx.add(t, 'mstp.config_revision_level', off + 71, 2, u16(d, off + 71));
        ctx.add(t, 'mstp.config_digest', off + 73, 16, d.subarray(off + 73, off + 89));
        ctx.add(t, 'mstp.cist_internal_root_path_cost', off + 89, 4, u32(d, off + 89));
        ctx.add(t, 'mstp.cist_remaining_hops', off + 101, 1, d[off + 101]);
      }
    }
    const kind = ver === 3 ? 'MST' : ver === 2 ? 'RST' : 'Conf';
    ctx.setInfo(`${kind}. ${fl & 1 ? 'TC + ' : ''}Root = ${rp & 0xf000}/${rp & 0xfff}/${rm}  Cost = ${cost}  Port = ${hexPad(port, 4)}`);
    return end - off;
  },
});
function bridgeId(ctx, t, o, label, p, prio, m) {
  const n = ctx.text(t, `${label}: ${prio & 0xf000} / ${prio & 0xfff} / ${m}`, o, 8);
  ctx.add(n, `${p}.prio`, o, 2, prio & 0xf000);
  ctx.add(n, `${p}.ext`, o, 2, prio & 0xfff);
  ctx.add(n, `${p}.hw`, o + 2, 6, m);
}

// --- Slow protocols / LACP ------------------------------------------------------------------------
const LACP_STATE = [['activity', 'LACP Activity', 0x01, ['Active', 'Passive']], ['timeout', 'LACP Timeout', 0x02, ['Short Timeout', 'Long Timeout']], ['aggregation', 'Aggregation', 0x04, ['Aggregatable', 'Individual']], ['synchronization', 'Synchronization', 0x08, ['In Sync', 'Out of Sync']], ['collecting', 'Collecting', 0x10, ['Enabled', 'Disabled']], ['distributing', 'Distributing', 0x20, ['Enabled', 'Disabled']], ['defaulted', 'Defaulted', 0x40, ['Yes', 'No']], ['expired', 'Expired', 0x80, ['Yes', 'No']]];
const LACP_TLV = { 0: 'Terminator', 1: 'Actor Information', 2: 'Partner Information', 3: 'Collector Information' };
registerProtocol({
  abbrev: 'slow', name: 'Slow Protocols', short: 'Slow Protocols',
  fields: [['slow.subtype', 'Slow Protocols subtype', 'uint8', { base: 'hex', strings: { 1: 'LACP', 2: 'Marker Protocol', 3: 'OAM', 10: 'ESMC' } }]],
  tables: { ethertype: [0x8809] },
  dissect(ctx, off, end) {
    ctx.need(off, 1, end);
    const sub = ctx.d[off];
    ctx.layers.push('slow'); // Wireshark has no tree item for the subtype dispatcher
    ctx.setProtocol('Slow Protocols');
    if (sub === 1) return ctx.call('lacp', off + 1, end), end - off;
    ctx.setInfo(`Subtype = ${sub}`);
    ctx.data(off + 1, end);
    return end - off;
  },
});
registerProtocol({
  abbrev: 'lacp', name: 'Link Aggregation Control Protocol', short: 'LACP',
  fields: [
    ['lacp.version', 'LACP Version', 'uint8', { base: 'hex' }],
    ['lacp.tlv_type', 'TLV Type', 'uint8', { base: 'hex', strings: LACP_TLV }],
    ['lacp.tlv_length', 'TLV Length', 'uint8', { base: 'hex' }],
    ...['actor', 'partner'].flatMap((w) => {
      const W = w === 'actor' ? 'Actor' : 'Partner';
      return [
        [`lacp.${w}.sys_priority`, `${W} System Priority`, 'uint16'],
        [`lacp.${w}.sysid`, w === 'actor' ? 'Actor System ID' : 'Partner System', 'ether'],
        [`lacp.${w}.key`, `${W} Key`, 'uint16'],
        [`lacp.${w}.port_priority`, `${W} Port Priority`, 'uint16'],
        [`lacp.${w}.port`, `${W} Port`, 'uint16'],
        [`lacp.${w}.state`, `${W} State`, 'uint8', { base: 'hex' }],
        [`lacp.${w}.state_str`, `${W} State Flags`, 'string'],
        ...LACP_STATE.map(([k, n, m, tfs]) => [`lacp.${w}.state.${k}`, n, 'bool', { mask: m, bits: 8, tfs }]),
        [`lacp.${w}.reserved`, 'Reserved', 'bytes'],
      ];
    }),
    ['lacp.collector.max_delay', 'Collector Max Delay', 'uint16'],
    ['lacp.coll_reserved', 'Reserved', 'bytes'],
    ['lacp.pad', 'Pad', 'bytes'],
  ],
  dissect(ctx, off, end) {
    const d = ctx.d;
    ctx.need(off, 1, end);
    ctx.setProtocol('LACP');
    const t = ctx.proto('lacp', off, end - off);
    const ver = d[off];
    ctx.add(t, 'lacp.version', off, 1, ver);
    let o = off + 1;
    let info = `v${ver}`;
    while (o + 2 <= end) {
      const ty = d[o], len = d[o + 1];
      ctx.add(t, 'lacp.tlv_type', o, 1, ty);
      ctx.add(t, 'lacp.tlv_length', o + 1, 1, len);
      if (ty === 0) {
        if (o + 2 < end) ctx.add(t, 'lacp.pad', o + 2, end - o - 2, d.subarray(o + 2, end));
        o = end;
        break;
      }
      if (len < 2) break;
      ctx.need(o, len, end);
      if ((ty === 1 || ty === 2) && len >= 20) {
        const w = ty === 1 ? 'actor' : 'partner';
        const v = o + 2;
        const sys = mac(d, v + 2), key = u16(d, v + 8), port = u16(d, v + 12), st = d[v + 14];
        ctx.add(t, `lacp.${w}.sys_priority`, v, 2, u16(d, v));
        ctx.add(t, `lacp.${w}.sysid`, v + 2, 6, sys);
        ctx.add(t, `lacp.${w}.key`, v + 8, 2, key);
        ctx.add(t, `lacp.${w}.port_priority`, v + 10, 2, u16(d, v + 10));
        ctx.add(t, `lacp.${w}.port`, v + 12, 2, port);
        const flags = stateStr(st);
        if (ctx.tree) {
          const names = LACP_STATE.filter((s) => st & s[2]).map((s) => s[1]);
          const sn = ctx.add(t, `lacp.${w}.state`, v + 14, 1, st, `${w === 'actor' ? 'Actor' : 'Partner'} State: ${hexPad(st, 2)}${names.length ? ', ' + names.join(', ') : ''}`);
          ctx.bits(sn, v + 14, 1, st, LACP_STATE.map(([k]) => `lacp.${w}.state.${k}`));
          ctx.gen(t, `lacp.${w}.state_str`, flags, `${w === 'actor' ? 'Actor' : 'Partner'} State Flags: ${flags}`);
          ctx.add(t, `lacp.${w}.reserved`, v + 15, 3, d.subarray(v + 15, v + 18));
        }
        info += ` ${w.toUpperCase()} ${sys} P: ${port} K: ${key} ${flags}`;
      } else if (ty === 3 && len >= 4) {
        ctx.add(t, 'lacp.collector.max_delay', o + 2, 2, u16(d, o + 2));
        if (len > 4) ctx.add(t, 'lacp.coll_reserved', o + 4, len - 4, d.subarray(o + 4, o + len));
      }
      o += len;
    }
    ctx.setInfo(info);
    return end - off;
  },
});
function stateStr(st) {
  // Wireshark order: Expired Defaulted Distributing Collecting Synchronization Aggregation Timeout Activity
  const L = ['E', 'F', 'D', 'C', 'S', 'G', 'S', 'A'];
  let s = '';
  for (let i = 7; i >= 0; i--) s += st & (1 << i) ? L[7 - i] : '*';
  return s;
}

// --- EAPOL / EAP -------------------------------------------------------------------------------------
const EAPOL_TYPES = { 0: 'EAP Packet', 1: 'Start', 2: 'Logoff', 3: 'Key', 4: 'Encapsulated ASF Alert', 5: 'MKA' };
const EAPOL_VER = { 1: '802.1X-2001', 2: '802.1X-2004', 3: '802.1X-2010' };
const EAP_CODES = { 1: 'Request', 2: 'Response', 3: 'Success', 4: 'Failure', 5: 'Initiate', 6: 'Finish' };
const EAP_TYPES = { 1: 'Identity', 2: 'Notification', 3: 'Legacy Nak (Response Only)', 4: 'MD5-Challenge EAP (EAP-MD5-CHALLENGE)', 5: 'One-Time Password EAP (EAP-OTP)', 6: 'Generic Token Card EAP (EAP-GTC)', 13: 'TLS EAP (EAP-TLS)', 17: 'Cisco Wireless EAP / Lightweight EAP (EAP-LEAP)', 18: 'GSM Subscriber Identity Modules EAP (EAP-SIM)', 21: 'Tunneled TLS EAP (EAP-TTLS)', 23: 'UMTS Authentication and Key Agreement EAP (EAP-AKA)', 25: 'Protected EAP (EAP-PEAP)', 26: 'MS-Authentication EAP (EAP-MS-AUTH)', 29: 'MS-CHAP-v2 EAP (EAP-MS-CHAP-V2)', 43: 'Flexible Authentication via Secure Tunneling EAP (EAP-FAST)', 47: 'Pre-Shared Key EAP (EAP-PSK)', 49: 'Internet Key Exchange v2 EAP (EAP-IKEv2)', 52: 'Password EAP (EAP-pwd)', 254: 'Expanded Type' };
const KI = [['keydes_version', 'Key Descriptor Version', 0x0007], ['key_type', 'Key Type', 0x0008], ['key_index', 'Key Index', 0x0030], ['install', 'Install', 0x0040], ['key_ack', 'Key ACK', 0x0080], ['key_mic', 'Key MIC', 0x0100], ['secure', 'Secure', 0x0200], ['error', 'Error', 0x0400], ['request', 'Request', 0x0800], ['encrypted_key_data', 'Encrypted Key Data', 0x1000], ['smk_message', 'SMK Message', 0x2000]];
registerProtocol({
  abbrev: 'eapol', name: '802.1X Authentication', short: 'EAPOL',
  fields: [
    ['eapol.version', 'Version', 'uint8', { strings: EAPOL_VER }],
    ['eapol.type', 'Type', 'uint8', { strings: EAPOL_TYPES }],
    ['eapol.len', 'Length', 'uint16'],
    ['eapol.keydes.type', 'Key Descriptor Type', 'uint8', { strings: { 1: 'RC4 Descriptor', 2: 'EAPOL RSN Key', 254: 'EAPOL WPA Key' } }],
    ['eapol.keydes.key_len', 'Key Length', 'uint16'],
    ['eapol.keydes.replay_counter', 'Replay Counter', 'uint64'],
    ['eapol.keydes.key_iv', 'Key IV', 'bytes'],
    ['wlan_rsna_eapol.keydes.msgnr', 'Message number', 'uint8'],
    ['wlan_rsna_eapol.keydes.key_info', 'Key Information', 'uint16', { base: 'hex' }],
    ...KI.map(([k, n, m]) => [`wlan_rsna_eapol.keydes.key_info.${k}`, n, m === 0x7 || m === 0x30 ? 'uint16' : 'bool', { mask: m, bits: 16, tfs: SET_TFS }]),
    ['wlan_rsna_eapol.keydes.nonce', 'WPA Key Nonce', 'bytes'],
    ['wlan_rsna_eapol.keydes.rsc', 'WPA Key RSC', 'bytes'],
    ['wlan_rsna_eapol.keydes.id', 'WPA Key ID', 'bytes'],
    ['wlan_rsna_eapol.keydes.mic', 'WPA Key MIC', 'bytes'],
    ['wlan_rsna_eapol.keydes.data_len', 'WPA Key Data Length', 'uint16'],
    ['wlan_rsna_eapol.keydes.data', 'WPA Key Data', 'bytes'],
  ],
  tables: { ethertype: [0x888e] },
  dissect(ctx, off, end) {
    const d = ctx.d;
    ctx.need(off, 4, end);
    const ver = d[off], type = d[off + 1], len = u16(d, off + 2);
    const pend = Math.min(end, off + 4 + len);
    ctx.setProtocol('EAPOL');
    ctx.setInfo(EAPOL_TYPES[type] || 'Unknown');
    const t = ctx.proto('eapol', off, pend - off);
    ctx.add(t, 'eapol.version', off, 1, ver);
    ctx.add(t, 'eapol.type', off + 1, 1, type);
    ctx.add(t, 'eapol.len', off + 2, 2, len);
    const o = off + 4;
    if (type === 0 && o < pend) ctx.call('eap', o, pend);
    else if (type === 3 && o < pend) {
      ctx.need(o, 95, pend);
      const desc = d[o], ki = u16(d, o + 1), dl = u16(d, o + 93);
      ctx.add(t, 'eapol.keydes.type', o, 1, desc);
      let msg;
      const pairwise = (ki & 0x08) !== 0;
      if (ki & 0x80) msg = ki & 0x40 ? 3 : 1;
      else msg = (ki & 0x200) && dl === 0 ? 4 : 2;
      if (!pairwise) msg = ki & 0x80 ? 1 : 2;
      ctx.gen(t, 'wlan_rsna_eapol.keydes.msgnr', msg, `Message number: ${msg}`);
      if (ctx.tree) {
        const kn = ctx.add(t, 'wlan_rsna_eapol.keydes.key_info', o + 1, 2, ki);
        ctx.bits(kn, o + 1, 2, ki, KI.map(([k]) => `wlan_rsna_eapol.keydes.key_info.${k}`));
        ctx.add(t, 'eapol.keydes.key_len', o + 3, 2, u16(d, o + 3));
        ctx.add(t, 'eapol.keydes.replay_counter', o + 5, 8, (BigInt(u32(d, o + 5)) << 32n) | BigInt(u32(d, o + 9)));
        ctx.add(t, 'wlan_rsna_eapol.keydes.nonce', o + 13, 32, d.subarray(o + 13, o + 45));
        ctx.add(t, 'eapol.keydes.key_iv', o + 45, 16, d.subarray(o + 45, o + 61));
        ctx.add(t, 'wlan_rsna_eapol.keydes.rsc', o + 61, 8, d.subarray(o + 61, o + 69));
        ctx.add(t, 'wlan_rsna_eapol.keydes.id', o + 69, 8, d.subarray(o + 69, o + 77));
        ctx.add(t, 'wlan_rsna_eapol.keydes.mic', o + 77, 16, d.subarray(o + 77, o + 93));
        ctx.add(t, 'wlan_rsna_eapol.keydes.data_len', o + 93, 2, dl);
        if (dl && o + 95 + dl <= pend) ctx.add(t, 'wlan_rsna_eapol.keydes.data', o + 95, dl, d.subarray(o + 95, o + 95 + dl));
      }
      ctx.setInfo(pairwise ? `Key (Message ${msg} of 4)` : `Key (Group Message ${msg} of 2)`);
    }
    return pend - off;
  },
});
registerProtocol({
  abbrev: 'eap', name: 'Extensible Authentication Protocol', short: 'EAP',
  fields: [
    ['eap.code', 'Code', 'uint8', { strings: EAP_CODES }],
    ['eap.id', 'Id', 'uint8'],
    ['eap.len', 'Length', 'uint16'],
    ['eap.type', 'Type', 'uint8', { strings: EAP_TYPES }],
    ['eap.identity', 'Identity', 'string'],
    ['eap.notification', 'Notification', 'string'],
    ['eap.desired_type', 'Desired Auth Type', 'uint8', { strings: EAP_TYPES }],
    ['eap.data', 'EAP Data', 'bytes'],
  ],
  dissect(ctx, off, end) {
    const d = ctx.d;
    ctx.need(off, 4, end);
    const code = d[off], id = d[off + 1], len = u16(d, off + 2);
    const pend = Math.min(end, off + len);
    ctx.setProtocol('EAP');
    const n0 = ctx.layers.length;
    const t = ctx.proto('eap', off, pend - off);
    ctx.layers.length = n0; // Wireshark does not list 'eap' in frame.protocols here
    ctx.add(t, 'eap.code', off, 1, code);
    ctx.add(t, 'eap.id', off + 1, 1, id);
    ctx.add(t, 'eap.len', off + 2, 2, len);
    let info = EAP_CODES[code] || 'Unknown';
    if ((code === 1 || code === 2) && off + 4 < pend) {
      const ty = d[off + 4];
      ctx.add(t, 'eap.type', off + 4, 1, ty);
      info += `, ${EAP_TYPES[ty] || 'Unknown'}`;
      const v = off + 5;
      if (ty === 1 && v < pend) ctx.add(t, 'eap.identity', v, pend - v, ascii(d, v, pend - v));
      else if (ty === 2 && v < pend) ctx.add(t, 'eap.notification', v, pend - v, ascii(d, v, pend - v));
      else if (ty === 3 && v < pend) ctx.add(t, 'eap.desired_type', v, 1, d[v]);
      else if (v < pend) ctx.add(t, 'eap.data', v, pend - v, d.subarray(v, pend));
    }
    ctx.setInfo(info);
    return pend - off;
  },
});
