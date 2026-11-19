// IGMP v1/v2/v3 (queries, reports, leave, v3 group records).
import { registerProtocol, u16, ip4, hexPad, NULLNODE } from '../core.js';
import { inetChecksum, CKSUM_STATUS } from './ip.js';

const TYPES = { 0x11: 'Membership Query', 0x12: 'Membership Report', 0x16: 'Membership Report', 0x17: 'Leave Group', 0x22: 'Membership Report', 0x13: 'DVMRP Protocol', 0x14: 'PIM Routing Message', 0x1e: 'Traceroute Response', 0x1f: 'Traceroute Query or Request' };
const REC = { 1: 'Mode Is Include', 2: 'Mode Is Exclude', 3: 'Change To Include Mode', 4: 'Change To Exclude Mode', 5: 'Allow New Sources', 6: 'Block Old Sources' };

registerProtocol({
  abbrev: 'igmp', name: 'Internet Group Management Protocol', short: 'IGMP',
  fields: [
    ['igmp.version', 'IGMP Version', 'uint8'],
    ['igmp.type', 'Type', 'uint8', { base: 'hex', strings: TYPES }],
    ['igmp.reserved', 'Reserved', 'bytes'],
    ['igmp.max_resp', 'Max Resp Time', 'uint8'],
    ['igmp.checksum', 'Checksum', 'uint16', { base: 'hex' }],
    ['igmp.checksum.status', 'Checksum Status', 'uint8', { base: 'none', strings: CKSUM_STATUS }],
    ['igmp.maddr', 'Multicast Address', 'ipv4'],
    ['igmp.s', 'S', 'bool', { mask: 0x08, bits: 8, tfs: ['Suppress router side processing', 'Do not suppress router side processing'] }],
    ['igmp.qrv', 'QRV', 'uint8', { mask: 0x07 }],
    ['igmp.qqic', 'QQIC', 'uint8'],
    ['igmp.num_src', 'Num Src', 'uint16'],
    ['igmp.saddr', 'Source Address', 'ipv4'],
    ['igmp.num_grp_recs', 'Num Group Records', 'uint16'],
    ['igmp.record_type', 'Record Type', 'uint8', { strings: REC }],
    ['igmp.aux_data_len', 'Aux Data Len', 'uint8'],
    ['igmp.aux_data', 'Aux Data', 'bytes'],
    ['igmp.unused', 'Unused', 'bytes'],
  ],
  experts: [['igmp.bad_checksum', 'warn', 'Checksum', 'Bad checksum']],
  tables: { 'ip.proto': [2] },
  dissect(ctx, off, end) {
    const d = ctx.d;
    ctx.need(off, 8, end);
    const type = d[off], mr = d[off + 1], ck = u16(d, off + 2);
    const len = end - off;
    let ver;
    if (type === 0x11) ver = len >= 12 ? 3 : mr === 0 ? 1 : 2;
    else if (type === 0x12) ver = 1;
    else if (type === 0x16 || type === 0x17) ver = 2;
    else if (type === 0x22) ver = 3;
    else ver = 0;
    ctx.setProtocol(ver ? `IGMPv${ver}` : 'IGMP');
    const t = ctx.proto('igmp', off, len);
    ctx.layers.push('igmp'); // Wireshark lists the version sub-dissector as a second 'igmp'
    ctx.gen(t, 'igmp.version', ver, `IGMP Version: ${ver}`);
    ctx.add(t, 'igmp.type', off, 1, type);
    if (ver === 3 && type === 0x22) ctx.add(t, 'igmp.reserved', off + 1, 1, d.subarray(off + 1, off + 2));
    else if (ver >= 2) ctx.add(t, 'igmp.max_resp', off + 1, 1, mr, `Max Resp Time: ${(maxResp(mr, ver) / 10).toFixed(1)} sec (${hexPad(mr, 2)})`);
    else ctx.add(t, 'igmp.unused', off + 1, 1, d.subarray(off + 1, off + 2));
    const full = !(ctx.source === 0 && ctx.frame.len > ctx.frame.caplen);
    const ok = full ? inetChecksum(d, off, len) === 0 : true;
    if (ctx.tree) {
      ctx.add(t, 'igmp.checksum', off + 2, 2, ck, `Checksum: ${hexPad(ck, 4)} [${full ? (ok ? 'correct' : 'incorrect') : 'unverified'}]`);
      ctx.gen(t, 'igmp.checksum.status', full ? (ok ? 1 : 0) : 2);
    }
    if (!ok) ctx.ei(t, 'igmp.bad_checksum', off + 2, 2);
    const name = TYPES[type] || `Unknown Type:0x${type.toString(16).padStart(2, '0')}`;
    let info = name;
    let o = off + 4;
    if (type === 0x22) {
      ctx.need(o, 4, end);
      ctx.add(t, 'igmp.reserved', o, 2, d.subarray(o, o + 2));
      const n = u16(d, o + 2);
      ctx.add(t, 'igmp.num_grp_recs', o + 2, 2, n);
      o += 4;
      for (let i = 0; i < n; i++) {
        ctx.need(o, 8, end);
        const rt = d[o], aux = d[o + 1], ns = u16(d, o + 2), g = ip4(d, o + 4);
        const rl = 8 + ns * 4 + aux * 4;
        ctx.need(o, rl, end);
        const r = ctx.text(t, `Group Record : ${g}  ${REC[rt] || 'Unknown'}`, o, rl);
        ctx.add(r, 'igmp.record_type', o, 1, rt);
        ctx.add(r, 'igmp.aux_data_len', o + 1, 1, aux);
        ctx.add(r, 'igmp.num_src', o + 2, 2, ns);
        ctx.add(r, 'igmp.maddr', o + 4, 4, g);
        const srcs = [];
        for (let k = 0; k < ns; k++) { const s = ip4(d, o + 8 + k * 4); srcs.push(s); ctx.add(r, 'igmp.saddr', o + 8 + k * 4, 4, s); }
        if (aux) ctx.add(r, 'igmp.aux_data', o + 8 + ns * 4, aux * 4, d.subarray(o + 8 + ns * 4, o + rl));
        if ((rt === 1 || rt === 3) && ns === 0) info += ` / Leave group ${g}`;
        else if ((rt === 2 || rt === 4) && ns === 0) info += ` / Join group ${g} for any sources`;
        else if (rt === 5) info += ` / Group ${g}, new source {${srcs.join(', ')}}`;
        else if (rt === 6) info += ` / Group ${g}, block source {${srcs.join(', ')}}`;
        else info += ` / Group ${g}, source {${srcs.join(', ')}}`;
        o += rl;
      }
      ctx.setInfo(info);
      return len;
    }
    const g = ip4(d, off + 4);
    ctx.add(t, 'igmp.maddr', off + 4, 4, g);
    if (type === 0x11) {
      if (g === '0.0.0.0') info += ', general';
      else info += `, specific for group ${g}`;
      if (ver === 3) {
        ctx.need(off + 8, 4, end);
        ctx.bits(t, off + 8, 1, d[off + 8], ['igmp.s', 'igmp.qrv']);
        ctx.add(t, 'igmp.qqic', off + 9, 1, d[off + 9]);
        const ns = u16(d, off + 10);
        ctx.add(t, 'igmp.num_src', off + 10, 2, ns);
        const srcs = [];
        for (let k = 0; k < ns; k++) { ctx.need(off + 12 + k * 4, 4, end); const s = ip4(d, off + 12 + k * 4); srcs.push(s); ctx.add(t, 'igmp.saddr', off + 12 + k * 4, 4, s); }
        if (srcs.length) info += `, source {${srcs.join(', ')}}`;
      }
    } else if (type === 0x16 || type === 0x17) info += ` ${type === 0x16 ? 'group ' : ''}${g}`;
    ctx.setInfo(info);
    void NULLNODE;
    return len;
  },
});

function maxResp(v, ver) {
  if (ver !== 3 || v < 128) return v;
  return ((v & 0x0f) | 0x10) << (((v >> 4) & 0x07) + 3);
}
