// The 'frame' pseudo-protocol: metadata line, timestamps, link-type dispatch, packet comments.
import { registerProtocol, setFrameDissector, NULLNODE, protocolsString } from '../core.js';

const ENCAP = { // LINKTYPE -> [WTAP encap number, name]
  187: [41, 'Bluetooth H4'], 201: [99, 'Bluetooth H4 with linux header'],
  0: [15, 'NULL/Loopback'], 1: [1, 'Ethernet'], 9: [4, 'PPP'], 12: [7, 'Raw IP'], 14: [7, 'Raw IP'], 101: [7, 'Raw IP'],
  105: [20, 'IEEE 802.11 Wireless LAN'], 108: [15, 'NULL/Loopback'], 113: [25, 'Linux cooked-mode capture v1'],
  127: [23, 'IEEE 802.11 plus radiotap radio header'], 228: [129, 'Raw IPv4'], 229: [130, 'Raw IPv6'],
  276: [210, 'Linux cooked-mode capture v2'], 50: [4, 'PPP'], 51: [4, 'PPP'],
};
const FLAG_DIR = { 0: 'Unknown', 1: 'Inbound', 2: 'Outbound' };

registerProtocol({
  abbrev: 'frame', name: 'Frame', short: 'Frame',
  fields: [
    ['frame.section_number', 'Section number', 'uint32'],
    ['frame.interface_id', 'Interface id', 'uint32'],
    ['frame.interface_name', 'Interface name', 'string'],
    ['frame.interface_description', 'Interface description', 'string'],
    ['frame.packet_flags', 'Packet flags', 'uint32', { base: 'hex' }],
    ['frame.packet_flags_direction', 'Direction', 'uint32', { base: 'hex', mask: 0x3, strings: FLAG_DIR, bits: 32 }],
    ['frame.encap_type', 'Encapsulation type', 'int16'],
    ['frame.p2p_dir', 'Point-to-Point Direction', 'int8', { strings: { 0: 'Sent', 1: 'Received' } }],
    ['frame.time', 'Arrival Time', 'abs_time'],
    ['frame.time_utc', 'UTC Arrival Time', 'abs_time'],
    ['frame.time_epoch', 'Epoch Arrival Time', 'abs_time'],
    ['frame.offset_shift', 'Time shift for this packet', 'rel_time'],
    ['frame.time_delta', 'Time delta from previous captured frame', 'rel_time'],
    ['frame.time_delta_displayed', 'Time delta from previous displayed frame', 'rel_time'],
    ['frame.time_relative', 'Time since reference or first frame', 'rel_time'],
    ['frame.number', 'Frame Number', 'uint32'],
    ['frame.len', 'Frame Length', 'uint32'],
    ['frame.cap_len', 'Capture Length', 'uint32'],
    ['frame.marked', 'Frame is marked', 'bool'],
    ['frame.ignored', 'Frame is ignored', 'bool'],
    ['frame.protocols', 'Protocols in frame', 'string'],
    ['frame.comment', 'Comment', 'string'],
    ['frame.drop_count', 'Drop Count', 'uint64'],
    ['frame.packet_id', 'Packet id', 'uint64'],
  ],
  experts: [
    ['frame.comment.expert', 'chat', 'Comment', 'Formatted comment'],
  ],
});
registerProtocol({ abbrev: 'pkt_comment', name: 'Packet comments', short: 'Comment' });

function dissectFrame(ctx) {
  const fr = ctx.frame;
  const s = ctx.session;
  const fd = ctx.fd;
  if (ctx.first) {
    const t = fr.sec + fr.nsec / 1e9;
    if (s.firstTime === null) s.firstTime = { sec: fr.sec, nsec: fr.nsec };
    const prev = s.prevTime;
    fd.delta = prev ? (fr.sec - prev.sec) + (fr.nsec - prev.nsec) / 1e9 : 0;
    fd.rel = (fr.sec - s.firstTime.sec) + (fr.nsec - s.firstTime.nsec) / 1e9;
    s.prevTime = { sec: fr.sec, nsec: fr.nsec };
    s.lastNo = fr.no;
    void t;
  }
  const caplen = fr.data.length;
  const iface = s.file && s.file.interfaces ? s.file.interfaces[fr.iface || 0] : null;
  const ifname = iface ? (iface.name || iface.description || '') : '';
  if (fr.comment && ctx.tree) {
    const c = ctx.proto('pkt_comment', 0, 0, 'Packet comments');
    ctx.layers.pop(); // not a protocol layer in frame.protocols
    for (const line of String(fr.comment).split('\n')) {
      const n = ctx.add(c, 'frame.comment', 0, 0, line, line);
      ctx.ei(n, 'frame.comment.expert', 0, 0, line);
    }
  } else if (fr.comment) {
    ctx.ei(NULLNODE, 'frame.comment.expert', 0, 0, String(fr.comment));
  }
  const top = ctx.proto('frame', 0, caplen,
    `Frame ${fr.no}: Packet, ${fr.len} bytes on wire (${fr.len * 8} bits), ${caplen} bytes captured (${caplen * 8} bits)` +
    (iface ? ` on interface ${ifname || 'unknown'}, id ${fr.iface || 0}` : ''));
  let protoNode = NULLNODE;
  if (ctx.tree) {
    if (s.file && s.file.format === 'pcapng') ctx.add(top, 'frame.section_number', 0, 0, (fr.section || 0) + 1);
    if (iface) {
      const n = ctx.add(top, 'frame.interface_id', 0, 0, fr.iface || 0, `Interface id: ${fr.iface || 0}${ifname ? ` (${ifname})` : ''}`);
      if (iface.name) ctx.add(n, 'frame.interface_name', 0, 0, iface.name);
      if (iface.description) ctx.add(n, 'frame.interface_description', 0, 0, iface.description);
    }
    if (fr.flags != null) {
      const n = ctx.add(top, 'frame.packet_flags', 0, 0, fr.flags, `Packet flags: 0x${(fr.flags >>> 0).toString(16).padStart(8, '0')}`);
      ctx.bits(n, 0, 0, fr.flags, ['frame.packet_flags_direction']);
    }
    const enc = ENCAP[fr.linktype] || [-1, `Unknown (LINKTYPE ${fr.linktype})`];
    ctx.add(top, 'frame.encap_type', 0, 0, enc[0], `Encapsulation type: ${enc[1]} (${enc[0]})`);
    if (fr.p2pDir !== undefined) ctx.add(top, 'frame.p2p_dir', 0, 0, fr.p2pDir);
    const t = { sec: fr.sec, nsec: fr.nsec };
    ctx.add(top, 'frame.time', 0, 0, t);
    ctx.add(top, 'frame.time_utc', 0, 0, t);
    ctx.add(top, 'frame.time_epoch', 0, 0, t, `Epoch Arrival Time: ${fr.sec}.${String(fr.nsec).padStart(9, '0')}`);
    ctx.gen(top, 'frame.offset_shift', 0);
    ctx.gen(top, 'frame.time_delta', fd.delta);
    ctx.gen(top, 'frame.time_delta_displayed', fd.delta);
    ctx.gen(top, 'frame.time_relative', fd.rel);
    ctx.add(top, 'frame.number', 0, 0, fr.no);
    ctx.add(top, 'frame.len', 0, 0, fr.len, `Frame Length: ${fr.len} bytes (${fr.len * 8} bits)`);
    ctx.add(top, 'frame.cap_len', 0, 0, caplen, `Capture Length: ${caplen} bytes (${caplen * 8} bits)`);
    if (fr.dropCount != null) ctx.add(top, 'frame.drop_count', 0, 0, BigInt(fr.dropCount));
    // marked/ignored are UI state; filled with the protocols line after dissection.
    protoNode = ctx.gen(top, 'frame.protocols', '', '');
  }
  if (!ctx.dispatch('linktype', fr.linktype, 0, caplen)) ctx.data(0, caplen);
  if (ctx.tree) {
    const p = protocolsString(ctx.layers);
    protoNode.value = p;
    protoNode.label = 'Protocols in frame: ' + p;
  }
}

setFrameDissector(dissectFrame);
