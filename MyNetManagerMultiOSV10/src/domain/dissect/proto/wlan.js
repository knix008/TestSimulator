// IEEE 802.11 (LINKTYPE 105) and radiotap (LINKTYPE 127): MAC header, management frames with tagged
// parameters, control frames, data frames (QoS, LLC hand-off), protected frames as data.
import { registerProtocol, u16, u16le, u32le, u64le, mac, hexPad, hexStr, NULLNODE } from '../core.js';
import { resolveMac } from '../names.js';

const SUBTYPES = { 0: 'Association Request', 1: 'Association Response', 2: 'Reassociation Request', 3: 'Reassociation Response', 4: 'Probe Request', 5: 'Probe Response', 6: 'Measurement Pilot', 8: 'Beacon frame', 9: 'ATIM', 10: 'Disassociate', 11: 'Authentication', 12: 'Deauthentication', 13: 'Action', 14: 'Action No Ack', 18: 'Trigger', 20: 'Beamforming Report Poll', 21: 'VHT/HE/EHT/RANGING NDP Announcement', 23: 'Control Wrapper', 24: '802.11 Block Ack Req', 25: '802.11 Block Ack', 26: 'Power-Save poll', 27: 'Request-to-send', 28: 'Clear-to-send', 29: 'Acknowledgement', 30: 'CF-End (Control-frame)', 31: 'CF-End + CF-Ack (Control-frame)', 32: 'Data', 33: 'Data + CF-Ack', 34: 'Data + CF-Poll', 35: 'Data + CF-Ack + CF-Poll', 36: 'Null function (No data)', 37: 'Acknowledgement (No data)', 38: 'CF-Poll (No data)', 39: 'CF-Ack/Poll (No data)', 40: 'QoS Data', 41: 'QoS Data + CF-Acknowledgment', 42: 'QoS Data + CF-Poll', 43: 'QoS Data + CF-Ack + CF-Poll', 44: 'QoS Null function (No data)', 46: 'QoS CF-Poll (No Data)', 47: 'QoS CF-Ack + CF-Poll (No data)' };
const TYPES = { 0: 'Management frame', 1: 'Control frame', 2: 'Data frame', 3: 'Extension' };
const TAGS = { 0: 'SSID parameter set', 1: 'Supported Rates', 3: 'DS Parameter set', 5: 'Traffic Indication Map (TIM)', 7: 'Country Information', 11: 'QBSS Load Element', 32: 'Power Constraint', 33: 'Power Capability', 35: 'TPC Report', 36: 'Supported Channels', 42: 'ERP Information', 45: 'HT Capabilities (802.11n D1.10)', 46: 'QoS Capability', 48: 'RSN Information', 50: 'Extended Supported Rates', 54: 'Mobility Domain', 59: 'Supported Operating Classes', 61: 'HT Information (802.11n D1.10)', 70: 'RM Enabled Capabilities', 127: 'Extended Capabilities', 191: 'VHT Capabilities', 192: 'VHT Operation', 221: 'Vendor Specific', 255: 'Element ID Extension' };
const AUTH_ALG = { 0: 'Open System', 1: 'Shared key', 2: 'Fast BSS Transition', 3: 'Simultaneous Authentication of Equals (SAE)' };
const STATUS = { 0: 'Successful', 1: 'Unspecified failure', 10: 'Cannot support all requested capabilities in the Capability Information field', 17: 'Association denied because AP is unable to handle additional associated STAs' };
const REASON = { 1: 'Unspecified reason', 2: 'Previous authentication no longer valid', 3: 'Deauthenticated because sending STA is leaving (or has left) IBSS or ESS', 4: 'Disassociated due to inactivity', 5: 'Disassociated because AP is unable to handle all currently associated STAs', 6: 'Class 2 frame received from nonauthenticated STA', 7: 'Class 3 frame received from nonassociated STA', 8: 'Disassociated because sending STA is leaving (or has left) BSS', 15: '4-Way Handshake timeout' };
const CIPHER = { 1: 'WEP-40', 2: 'TKIP', 4: 'AES (CCM)', 5: 'WEP-104', 6: 'BIP (128)', 8: 'GCMP (128)', 9: 'GCMP (256)', 10: 'CCMP (256)' };
const AKM = { 1: 'WPA', 2: 'PSK', 3: 'FT over IEEE 802.1X', 4: 'FT using PSK', 5: 'WPA (SHA256)', 6: 'PSK (SHA256)', 8: 'SAE (SHA256)', 9: 'FT using SAE (SHA256)', 18: 'OWE' };
const VENDORS = { 0x0050f2: 'Microsoft Corp.', 0x001018: 'Broadcom', 0x00904c: 'Epigram, Inc.', 0x506f9a: 'Wi-Fi Alliance', 0x000c43: 'Ralink Technology, Corp.', 0x00037f: 'Atheros Communications, Inc.', 0x0017f2: 'Apple, Inc.' };

const FLAG_BITS = [['tods', 'To DS', 0x01], ['fromds', 'From DS', 0x02], ['frag', 'More Fragments', 0x04], ['retry', 'Retry', 0x08], ['pwrmgt', 'PWR MGT', 0x10], ['moredata', 'More Data', 0x20], ['protected', 'Protected flag', 0x40], ['order', '+HTC/Order flag', 0x80]];

registerProtocol({
  abbrev: 'wlan', name: 'IEEE 802.11 wireless LAN', short: '802.11',
  fields: [
    ['wlan.fc.type_subtype', 'Type/Subtype', 'uint16', { base: 'hex', strings: SUBTYPES }],
    ['wlan.fc', 'Frame Control Field', 'uint16', { base: 'hex' }],
    ['wlan.fc.version', 'Version', 'uint8', { mask: 0x03 }],
    ['wlan.fc.type', 'Type', 'uint8', { mask: 0x0c, strings: TYPES }],
    ['wlan.fc.subtype', 'Subtype', 'uint8', { mask: 0xf0 }],
    ['wlan.flags', 'Flags', 'uint8', { base: 'hex' }],
    ['wlan.fc.ds', 'DS status', 'uint8', { base: 'hex', mask: 0x03, strings: { 0: 'Not leaving DS or network is operating in AD-HOC mode (To DS: 0 From DS: 0)', 1: 'Frame from STA to DS via an AP (To DS: 1 From DS: 0)', 2: 'Frame from DS to a STA via AP(To DS: 0 From DS: 1)', 3: 'WDS (AP to AP) or Mesh (MP to MP) Frame (To DS: 1 From DS: 1)' } }],
    ...FLAG_BITS.map(([k, n, m]) => [`wlan.fc.${k}`, n, 'bool', { mask: m, bits: 8 }]),
    ['wlan.duration', 'Duration', 'uint16', { mask: 0x7fff, bits: 16 }],
    ['wlan.ra', 'Receiver address', 'ether'],
    ['wlan.da', 'Destination address', 'ether'],
    ['wlan.ta', 'Transmitter address', 'ether'],
    ['wlan.sa', 'Source address', 'ether'],
    ['wlan.bssid', 'BSS Id', 'ether'],
    ['wlan.staa', 'STA address', 'ether'],
    ['wlan.addr', 'Hardware address', 'ether'],
    ['wlan.frag', 'Fragment number', 'uint16', { mask: 0x000f, bits: 16 }],
    ['wlan.seq', 'Sequence number', 'uint16', { mask: 0xfff0, bits: 16 }],
    ['wlan.flags.str', 'WLAN Flags', 'string'],
    ['wlan.qos', 'Qos Control', 'uint16', { base: 'hex' }],
    ['wlan.qos.tid', 'TID', 'uint16', { mask: 0x000f, bits: 16 }],
    ['wlan.qos.priority', 'Priority', 'uint16', { mask: 0x0007, bits: 16, strings: { 0: 'Best Effort (Best Effort)', 1: 'Background (Background)', 2: 'Spare (Background)', 3: 'Excellent Effort (Best Effort)', 4: 'Controlled Load (Video)', 5: 'Video (Video)', 6: 'Voice (Voice)', 7: 'Network Control (Voice)' } }],
    ['wlan.qos.ack', 'Ack Policy', 'uint16', { mask: 0x0060, bits: 16, strings: { 0: 'Normal Ack', 1: 'No Ack', 2: 'No explicit acknowledgment', 3: 'Block Ack' } }],
    ['wlan.qos.amsdupresent', 'Payload Type', 'bool', { mask: 0x0080, bits: 16, tfs: ['A-MSDU', 'MSDU'] }],
    ['wlan.ccmp.extiv', 'CCMP Ext. Initialization Vector', 'string'],
    ['wlan.wep.key', 'Key Index', 'uint8'],
    ['wlan.ba.control', 'Block Ack Control', 'uint16', { base: 'hex' }],
    ['wlan.bar.control', 'Block Ack Request Control', 'uint16', { base: 'hex' }],
    ['wlan.fixed.ssc', 'Block Ack Starting Sequence Control (SSC)', 'uint16', { base: 'hex' }],
    ['wlan.ba.bm', 'Block Ack Bitmap', 'bytes'],
  ],
  tables: { linktype: [105] },
  dissect: dissectWlan,
});
registerProtocol({
  abbrev: 'wlan.mgt', name: 'IEEE 802.11 Wireless Management', short: '802.11 MGT',
  fields: [
    ['wlan.fixed.all', 'Fixed parameters', 'none'],
    ['wlan.fixed.timestamp', 'Timestamp', 'uint64'],
    ['wlan.fixed.beacon', 'Beacon Interval', 'uint32'],
    ['wlan.fixed.capabilities', 'Capabilities Information', 'uint16', { base: 'hex' }],
    ['wlan.fixed.listen_ival', 'Listen Interval', 'uint16', { base: 'hex' }],
    ['wlan.fixed.status_code', 'Status code', 'uint16', { base: 'hex', strings: STATUS }],
    ['wlan.fixed.aid', 'Association ID', 'uint16', { base: 'hex', mask: 0x3fff, bits: 16 }],
    ['wlan.fixed.auth.alg', 'Authentication Algorithm', 'uint16', { strings: AUTH_ALG }],
    ['wlan.fixed.auth_seq', 'Authentication SEQ', 'uint16', { base: 'hex' }],
    ['wlan.fixed.reason_code', 'Reason code', 'uint16', { base: 'hex', strings: REASON }],
    ['wlan.fixed.current_ap', 'Current AP', 'ether'],
    ['wlan.tagged.all', 'Tagged parameters', 'none'],
    ['wlan.tag', 'Tag', 'none'],
    ['wlan.tag.number', 'Tag Number', 'uint8', { strings: TAGS }],
    ['wlan.tag.length', 'Tag length', 'uint32'],
    ['wlan.tag.data', 'Tag Data', 'bytes'],
    ['wlan.ssid', 'SSID', 'bytes'],
    ['wlan.supported_rates', 'Supported Rates', 'uint8', { base: 'hex' }],
    ['wlan.extended_supported_rates', 'Extended Supported Rates', 'uint8', { base: 'hex' }],
    ['wlan.ds.current_channel', 'Current Channel', 'uint8'],
    ['wlan.tim.dtim_count', 'DTIM count', 'uint8'],
    ['wlan.tim.dtim_period', 'DTIM period', 'uint8'],
    ['wlan.country_info.code', 'Code', 'string'],
    ['wlan.rsn.version', 'RSN Version', 'uint16'],
    ['wlan.rsn.gcs', 'Group Cipher Suite', 'uint32', { base: 'hex' }],
    ['wlan.rsn.gcs.type', 'Group Cipher Suite type', 'uint8', { strings: CIPHER }],
    ['wlan.rsn.pcs.count', 'Pairwise Cipher Suite Count', 'uint16'],
    ['wlan.rsn.pcs.type', 'Pairwise Cipher Suite type', 'uint8', { strings: CIPHER }],
    ['wlan.rsn.akms.count', 'Auth Key Management (AKM) Suite Count', 'uint16'],
    ['wlan.rsn.akms.type', 'Auth Key Management (AKM) type', 'uint8', { strings: AKM }],
    ['wlan.rsn.capabilities', 'RSN Capabilities', 'uint16', { base: 'hex' }],
    ['wlan.tag.oui', 'OUI', 'uint24', { base: 'hex', strings: VENDORS }],
    ['wlan.tag.vendor.oui.type', 'Vendor Specific OUI Type', 'uint8'],
    ['wlan.tag.vendor.data', 'Vendor Specific Data', 'bytes'],
  ],
});

const RATE = (r) => { const v = (r & 0x7f) / 2; return `${v}${r & 0x80 ? '(B)' : ''}`; };

function dissectWlan(ctx, off, end, arg) {
  const d = ctx.d;
  ctx.need(off, 2, end);
  const fc0 = d[off], fc1 = d[off + 1];
  const type = (fc0 >> 2) & 3, sub = fc0 >> 4;
  const ts = type === 3 ? 0x300 + sub : type * 16 + sub;
  const name = SUBTYPES[ts] || `Unrecognized (Reserved frame) (${hexPad(ts, 4)})`;
  ctx.setProtocol('802.11');
  const flagsStr = wlanFlags(fc1);
  // FCS trimmed by radiotap ('arg.fcs')
  const pend = arg && arg.fcs ? end - 4 : end;
  // header length depends on the frame type
  let hl;
  let addrs = [];
  const ds = fc1 & 3;
  if (type === 1) {
    if (sub === 12 || sub === 13) hl = 10; // CTS, ACK
    else if (sub === 8 || sub === 9 || sub === 10 || sub === 11 || sub === 14 || sub === 15 || sub === 4 || sub === 5) hl = 16;
    else hl = 10;
  } else {
    hl = 24;
    if (type === 2 && ds === 3) hl = 30;
  }
  ctx.need(off, Math.min(hl, 10), pend);
  const t = ctx.proto('wlan', off, Math.min(hl, pend - off), `IEEE 802.11 ${name}, Flags: ${flagsStr}`);
  const fcRaw = u16(d, off);
  const dur = u16le(d, off + 2);
  const a1 = off + 4 + 6 <= pend ? mac(d, off + 4) : null;
  const a2 = off + 16 <= pend && hl >= 16 ? mac(d, off + 10) : null;
  const a3 = hl >= 24 && off + 22 <= pend ? mac(d, off + 16) : null;
  const a4 = hl >= 30 && off + 30 <= pend ? mac(d, off + 24) : null;
  let ra = a1, ta = a2, da = null, sa = null, bssid = null;
  if (type === 0) { da = a1; sa = a2; bssid = a3; }
  else if (type === 2) {
    if (ds === 0) { da = a1; sa = a2; bssid = a3; }
    else if (ds === 1) { bssid = a1; sa = a2; da = a3; }
    else if (ds === 2) { da = a1; bssid = a2; sa = a3; }
    else { da = a3; sa = a4; }
  }
  addrs = [['wlan.ra', ra, 4], ['wlan.da', da, da === a1 ? 4 : 16], ['wlan.ta', ta, 10], ['wlan.sa', sa, sa === a2 ? 10 : sa === a4 ? 24 : 16], ['wlan.bssid', bssid, bssid === a1 ? 4 : bssid === a2 ? 10 : 16]];
  ctx.setHw(sa || ta || '', da || ra || '');
  let seqc = 0;
  if (ctx.tree) {
    ctx.add(t, 'wlan.fc.type_subtype', off, 1, ts);
    const fcn = ctx.add(t, 'wlan.fc', off, 2, fcRaw);
    ctx.bits(fcn, off, 1, fc0, ['wlan.fc.version', 'wlan.fc.type', 'wlan.fc.subtype']);
    const fln = ctx.add(fcn, 'wlan.flags', off + 1, 1, fc1);
    ctx.bits(fln, off + 1, 1, fc1, ['wlan.fc.ds', ...FLAG_BITS.slice(2).map(([k]) => `wlan.fc.${k}`)]);
    if (type !== 1 || sub !== 10) ctx.add(t, 'wlan.duration', off + 2, 2, dur & 0x7fff, `${bitsText(dur & 0x7fff, 0x7fff)} = Duration: ${dur & 0x7fff} microseconds`);
    for (const [f, v, o] of addrs) {
      if (!v) continue;
      ctx.add(t, f, off + o, 6, v, `${FIELD_LABEL[f]}: ${ctx.resolve.mac ? `${resolveMac(v)} (${v})` : v}`);
      ctx.hidden(t, 'wlan.addr', off + o, 6, v);
    }
  }
  if (hl >= 24 && off + 24 <= pend) {
    seqc = u16le(d, off + 22);
    if (ctx.tree) {
      ctx.add(t, 'wlan.frag', off + 22, 2, seqc & 15, `.... .... .... ${(seqc & 15).toString(2).padStart(4, '0')} = Fragment number: ${seqc & 15}`);
      ctx.add(t, 'wlan.seq', off + 22, 2, seqc >> 4, `${bitsText(seqc >> 4, 0xfff, 12)} .... = Sequence number: ${seqc >> 4}`);
    }
  }
  let info = name;
  if (type !== 1) info += `, SN=${seqc >> 4}, FN=${seqc & 15}`;
  info += `, Flags=${flagsStr}`;
  let o = off + hl;
  if (type === 1) {
    // Block Ack Request / Block Ack carry a control field and starting sequence
    if ((sub === 8 || sub === 9) && o + 4 <= pend && ctx.tree) {
      ctx.add(t, sub === 8 ? 'wlan.bar.control' : 'wlan.ba.control', o, 2, u16le(d, o));
      ctx.add(t, 'wlan.fixed.ssc', o + 2, 2, u16le(d, o + 2));
      if (sub === 9 && o + 4 < pend) ctx.add(t, 'wlan.ba.bm', o + 4, pend - o - 4, d.subarray(o + 4, pend));
    }
    ctx.gen(t, 'wlan.flags.str', flagsStr, `WLAN Flags: ${flagsStr}`);
    ctx.setInfo(info);
    return end - off;
  }
  ctx.need(off, hl, pend);
  // QoS control for QoS data subtypes
  if (type === 2 && (sub & 8)) {
    ctx.need(o, 2, pend);
    const q = u16le(d, o);
    if (ctx.tree) {
      const qn = ctx.add(t, 'wlan.qos', o, 2, q, `Qos Control: ${hexPad(q, 4)}`);
      ctx.bits(qn, o, 2, q, ['wlan.qos.tid', 'wlan.qos.priority', 'wlan.qos.amsdupresent', 'wlan.qos.ack']);
    }
    o += 2;
    if (fc1 & 0x80) o += 4; // HT control
    if (ctx.tree) t.length = o - off;
  }
  ctx.gen(t, 'wlan.flags.str', flagsStr, `WLAN Flags: ${flagsStr}`);
  if (type === 0) {
    if (fc1 & 0x40) { ctx.setInfo(info); ctx.data(o, pend); return end - off; }
    const extra = mgmt(ctx, sub, o, pend);
    ctx.setInfo(info + extra);
    return end - off;
  }
  // data frames
  ctx.setInfo(info);
  if (o >= pend) return end - off;
  if (fc1 & 0x40) {
    // Protected: CCMP/TKIP header then encrypted payload
    if (o + 8 <= pend && (d[o + 3] & 0x20)) {
      const pn = hexStr(Uint8Array.of(d[o + 7], d[o + 6], d[o + 5], d[o + 4], d[o + 1], d[o]), 0, 6);
      ctx.add(t, 'wlan.ccmp.extiv', o, 8, '0x' + pn.toUpperCase().replace(/^0X/, ''));
      ctx.add(t, 'wlan.wep.key', o + 3, 1, d[o + 3] >> 6);
      o += 8;
    }
    ctx.data(o, pend);
    return end - off;
  }
  if (sub === 4 || sub === 12) return end - off; // null function frames carry nothing
  ctx.call('llc', o, pend);
  return end - off;
}
const FIELD_LABEL = { 'wlan.ra': 'Receiver address', 'wlan.da': 'Destination address', 'wlan.ta': 'Transmitter address', 'wlan.sa': 'Source address', 'wlan.bssid': 'BSS Id' };

function bitsText(v, mask, width = 16) {
  let s = '';
  for (let i = width - 1; i >= 0; i--) { s += (mask >> i) & 1 ? ((v >> i) & 1 ? '1' : '0') : '.'; if (i % 4 === 0 && i) s += ' '; }
  return s;
}
function wlanFlags(f) {
  const L = 'opmPRMFT';
  let s = '';
  for (let i = 0; i < 8; i++) s += f & (0x80 >> i) ? L[i] : '.';
  return s;
}

/** Management frame body: fixed fields + tagged parameters. Returns Info suffix. */
function mgmt(ctx, sub, o, end) {
  const d = ctx.d;
  const n0 = ctx.layers.length;
  const t = ctx.proto('wlan.mgt', o, end - o, 'IEEE 802.11 Wireless Management');
  ctx.layers.length = n0; // not listed in frame.protocols
  let fixedLen = { 0: 4, 1: 6, 2: 10, 3: 6, 4: 0, 5: 12, 8: 12, 10: 2, 11: 6, 12: 2 }[sub] ?? 0;
  if (sub === 13 || sub === 14) fixedLen = 0;
  let extra = '';
  if (fixedLen) {
    ctx.need(o, fixedLen, end);
    const fx = ctx.add(t, 'wlan.fixed.all', o, fixedLen, null, `Fixed parameters (${fixedLen} bytes)`);
    if (sub === 8 || sub === 5) {
      ctx.add(fx, 'wlan.fixed.timestamp', o, 8, u64le(d, o));
      const bi = u16le(d, o + 8);
      ctx.add(fx, 'wlan.fixed.beacon', o + 8, 2, bi, `Beacon Interval: ${(bi * 0.001024).toFixed(6)} [Seconds]`);
      ctx.add(fx, 'wlan.fixed.capabilities', o + 10, 2, u16le(d, o + 10));
      extra += `, BI=${bi}`;
    } else if (sub === 0 || sub === 2) {
      ctx.add(fx, 'wlan.fixed.capabilities', o, 2, u16le(d, o));
      ctx.add(fx, 'wlan.fixed.listen_ival', o + 2, 2, u16le(d, o + 2));
      if (sub === 2) ctx.add(fx, 'wlan.fixed.current_ap', o + 4, 6, mac(d, o + 4));
    } else if (sub === 1 || sub === 3) {
      ctx.add(fx, 'wlan.fixed.capabilities', o, 2, u16le(d, o));
      ctx.add(fx, 'wlan.fixed.status_code', o + 2, 2, u16le(d, o + 2));
      ctx.add(fx, 'wlan.fixed.aid', o + 4, 2, u16le(d, o + 4) & 0x3fff);
    } else if (sub === 11) {
      ctx.add(fx, 'wlan.fixed.auth.alg', o, 2, u16le(d, o));
      ctx.add(fx, 'wlan.fixed.auth_seq', o + 2, 2, u16le(d, o + 2));
      ctx.add(fx, 'wlan.fixed.status_code', o + 4, 2, u16le(d, o + 4));
    } else if (sub === 10 || sub === 12) {
      ctx.add(fx, 'wlan.fixed.reason_code', o, 2, u16le(d, o));
    }
  }
  o += fixedLen;
  if (o + 2 <= end && sub !== 10 && sub !== 12) {
    const tg = ctx.add(t, 'wlan.tagged.all', o, end - o, null, `Tagged parameters (${end - o} bytes)`);
    while (o + 2 <= end) {
      const id = d[o], len = d[o + 1];
      ctx.need(o + 2, len, end);
      const v = o + 2;
      const r = tag(ctx, tg, id, v, len);
      if (id === 0 && (sub === 8 || sub === 5 || sub === 4 || sub === 0 || sub === 2)) extra += `, SSID=${r}`;
      o = v + len;
    }
  }
  return extra;
}

function tag(ctx, parent, id, v, len) {
  const d = ctx.d;
  const nm = TAGS[id] || 'Reserved';
  let label = `Tag: ${nm}`;
  let ret = '';
  if (id === 0) {
    const s = len ? new TextDecoder().decode(d.subarray(v, v + len)) : '';
    ret = len ? `"${s}"` : 'Wildcard (Broadcast)';
    label = `Tag: SSID parameter set: ${ret}`;
  } else if (id === 1 || id === 50) {
    const rates = [];
    for (let i = 0; i < len; i++) rates.push(RATE(d[v + i]));
    label = `Tag: ${nm} ${rates.join(', ')}, [Mbit/sec]`;
  } else if (id === 3 && len >= 1) label = `Tag: DS Parameter set: Current Channel: ${d[v]}`;
  else if (id === 221 && len >= 3) label = `Tag: Vendor Specific: ${VENDORS[(d[v] << 16) | (d[v + 1] << 8) | d[v + 2]] || hexStr(d, v, 3, ':')}`;
  if (!ctx.tree) return ret;
  const n = ctx.add(parent, 'wlan.tag', v - 2, len + 2, null, label);
  ctx.add(n, 'wlan.tag.number', v - 2, 1, id);
  ctx.add(n, 'wlan.tag.length', v - 1, 1, len);
  switch (id) {
    case 0:
      ctx.add(n, 'wlan.ssid', v, len, d.subarray(v, v + len), `SSID: ${ret}`);
      break;
    case 1: case 50:
      for (let i = 0; i < len; i++) ctx.add(n, id === 1 ? 'wlan.supported_rates' : 'wlan.extended_supported_rates', v + i, 1, d[v + i], `${id === 1 ? 'Supported' : 'Extended Supported'} Rates: ${RATE(d[v + i])} (${hexPad(d[v + i], 2)})`);
      break;
    case 3:
      if (len >= 1) ctx.add(n, 'wlan.ds.current_channel', v, 1, d[v]);
      break;
    case 5:
      if (len >= 2) { ctx.add(n, 'wlan.tim.dtim_count', v, 1, d[v]); ctx.add(n, 'wlan.tim.dtim_period', v + 1, 1, d[v + 1]); }
      break;
    case 7:
      if (len >= 2) ctx.add(n, 'wlan.country_info.code', v, 2, String.fromCharCode(d[v], d[v + 1]));
      break;
    case 48: {
      if (len < 2) break;
      ctx.add(n, 'wlan.rsn.version', v, 2, u16le(d, v));
      let p = v + 2;
      const e = v + len;
      if (p + 4 <= e) {
        const g = ctx.add(n, 'wlan.rsn.gcs', p, 4, ((d[p] << 24) | (d[p + 1] << 16) | (d[p + 2] << 8) | d[p + 3]) >>> 0, `Group Cipher Suite: ${hexStr(d, p, 3, ':')} ${CIPHER[d[p + 3]] || 'Unknown'}`);
        ctx.add(g, 'wlan.rsn.gcs.type', p + 3, 1, d[p + 3]);
        p += 4;
      }
      for (const [cf, tf] of [['wlan.rsn.pcs.count', 'wlan.rsn.pcs.type'], ['wlan.rsn.akms.count', 'wlan.rsn.akms.type']]) {
        if (p + 2 > e) break;
        const c = u16le(d, p);
        ctx.add(n, cf, p, 2, c);
        p += 2;
        for (let i = 0; i < c && p + 4 <= e; i++, p += 4) ctx.add(n, tf, p + 3, 1, d[p + 3]);
      }
      if (p + 2 <= e) ctx.add(n, 'wlan.rsn.capabilities', p, 2, u16le(d, p));
      break;
    }
    case 221:
      if (len >= 4) {
        ctx.add(n, 'wlan.tag.oui', v, 3, (d[v] << 16) | (d[v + 1] << 8) | d[v + 2], `OUI: ${hexStr(d, v, 3, ':')} (${VENDORS[(d[v] << 16) | (d[v + 1] << 8) | d[v + 2]] || 'Unknown'})`);
        ctx.add(n, 'wlan.tag.vendor.oui.type', v + 3, 1, d[v + 3]);
        if (len > 4) ctx.add(n, 'wlan.tag.vendor.data', v + 4, len - 4, d.subarray(v + 4, v + len));
      }
      break;
    default:
      if (len) ctx.add(n, 'wlan.tag.data', v, len, d.subarray(v, v + len));
  }
  return ret;
}

// --- radiotap ----------------------------------------------------------------------------------------
// [bit, size, alignment]
const RT_FIELDS = [[0, 8, 8], [1, 1, 1], [2, 1, 1], [3, 4, 2], [4, 2, 1], [5, 1, 1], [6, 1, 1], [7, 2, 2], [8, 2, 2], [9, 2, 2], [10, 1, 1], [11, 1, 1], [12, 1, 1], [13, 1, 1], [14, 2, 2], [15, 2, 2], [16, 1, 1], [17, 1, 1], [18, 8, 4], [19, 3, 1], [20, 8, 4], [21, 12, 2], [22, 12, 8], [23, 12, 2]];
registerProtocol({
  abbrev: 'radiotap', name: 'Radiotap Header', short: 'Radiotap',
  fields: [
    ['radiotap.version', 'Header revision', 'uint8'],
    ['radiotap.pad', 'Header pad', 'uint8'],
    ['radiotap.length', 'Header length', 'uint16'],
    ['radiotap.present.word', 'Present flags word', 'uint32', { base: 'hex' }],
    ['radiotap.mactime', 'MAC timestamp', 'uint64'],
    ['radiotap.flags', 'Flags', 'uint8', { base: 'hex' }],
    ['radiotap.flags.fcs', 'FCS at end', 'bool', { mask: 0x10, bits: 8 }],
    ['radiotap.flags.shortpre', 'Preamble', 'bool', { mask: 0x02, bits: 8, tfs: ['Short', 'Long'] }],
    ['radiotap.datarate', 'Data rate (Mb/s)', 'float'],
    ['radiotap.channel.freq', 'Channel frequency', 'uint32'],
    ['radiotap.channel.flags', 'Channel flags', 'uint16', { base: 'hex' }],
    ['radiotap.dbm_antsignal', 'Antenna signal', 'int8'],
    ['radiotap.dbm_antnoise', 'Antenna noise', 'int8'],
    ['radiotap.antenna', 'Antenna', 'uint8'],
    ['radiotap.mcs.index', 'MCS index', 'uint8'],
  ],
  tables: { linktype: [127] },
  dissect(ctx, off, end) {
    const d = ctx.d;
    ctx.need(off, 8, end);
    const ver = d[off], len = u16le(d, off + 2);
    ctx.need(off, len, end);
    const t = ctx.proto('radiotap', off, len, `Radiotap Header v${ver}, Length ${len}`);
    ctx.add(t, 'radiotap.version', off, 1, ver);
    ctx.add(t, 'radiotap.pad', off + 1, 1, d[off + 1]);
    ctx.add(t, 'radiotap.length', off + 2, 2, len);
    // present words (bit 31 chains another word)
    const words = [];
    let p = off + 4;
    for (;;) { const w = u32le(d, p); words.push(w); p += 4; if (!(w & 0x80000000) || p + 4 > off + len) break; }
    const pf = ctx.text(t, 'Present flags', off + 4, p - off - 4);
    for (let i = 0; i < words.length; i++) ctx.add(pf, 'radiotap.present.word', off + 4 + i * 4, 4, words[i]);
    const r = { flags: 0, rate: null, freq: null, chflags: 0, signal: null, antenna: null, mcs: null };
    const w0 = words[0];
    for (const [bit, size, align] of RT_FIELDS) {
      if (!(w0 & (1 << bit))) continue;
      const rel = p - off;
      if (rel % align) p += align - (rel % align);
      if (p + size > off + len) break;
      switch (bit) {
        case 0: ctx.add(t, 'radiotap.mactime', p, 8, u64le(d, p)); break;
        case 1: {
          r.flags = d[p];
          const fn = ctx.add(t, 'radiotap.flags', p, 1, d[p]);
          ctx.bits(fn, p, 1, d[p], ['radiotap.flags.shortpre', 'radiotap.flags.fcs']);
          break;
        }
        case 2: r.rate = d[p] / 2; ctx.add(t, 'radiotap.datarate', p, 1, r.rate, `Data Rate: ${r.rate.toFixed(1)} Mb/s`); break;
        case 3: {
          r.freq = u16le(d, p); r.chflags = u16le(d, p + 2);
          ctx.add(t, 'radiotap.channel.freq', p, 2, r.freq, `Channel frequency: ${r.freq} [${r.freq < 3000 ? '2.4' : '5'} GHz ${chan(r.freq)}]`);
          ctx.add(t, 'radiotap.channel.flags', p + 2, 2, r.chflags, `Channel flags: ${hexPad(r.chflags, 4)}${chFlagText(r.chflags)}`);
          break;
        }
        case 5: r.signal = (d[p] << 24) >> 24; ctx.add(t, 'radiotap.dbm_antsignal', p, 1, r.signal, `Antenna signal: ${r.signal} dBm`); break;
        case 6: ctx.add(t, 'radiotap.dbm_antnoise', p, 1, (d[p] << 24) >> 24, `Antenna noise: ${(d[p] << 24) >> 24} dBm`); break;
        case 11: r.antenna = d[p]; ctx.add(t, 'radiotap.antenna', p, 1, d[p]); break;
        case 19: r.mcs = d[p + 2]; ctx.add(t, 'radiotap.mcs.index', p + 2, 1, d[p + 2]); break;
      }
      p += size;
    }
    radioInfo(ctx, r, off, len);
    const fcs = (r.flags & 0x10) !== 0;
    ctx.call('wlan', off + len, end, { fcs });
    return end - off;
  },
});
function chan(f) {
  if (f === 2484) return 14;
  if (f >= 2412 && f < 2484) return (f - 2407) / 5;
  if (f >= 5000) return (f - 5000) / 5;
  return 0;
}
function chFlagText(f) {
  const parts = [];
  if (f & 0x10) parts.push('Turbo');
  if (f & 0x20) parts.push('Complementary Code Keying (CCK)');
  if (f & 0x40) parts.push('Orthogonal Frequency-Division Multiplexing (OFDM)');
  if (f & 0x80) parts.push('2 GHz spectrum');
  if (f & 0x100) parts.push('5 GHz spectrum');
  if (f & 0x400) parts.push('Dynamic CCK-OFDM');
  return parts.length ? ', ' + parts.join(', ') : '';
}

const PHY = { 4: '802.11b (HR/DSSS)', 5: '802.11a (OFDM)', 6: '802.11g (ERP)', 7: '802.11n (HT)', 8: '802.11ac (VHT)' };
registerProtocol({
  abbrev: 'wlan_radio', name: '802.11 radio information', short: '802.11 Radio',
  fields: [
    ['wlan_radio.phy', 'PHY type', 'uint32', { strings: PHY }],
    ['wlan_radio.short_preamble', 'Short preamble', 'bool'],
    ['wlan_radio.data_rate', 'Data rate', 'float'],
    ['wlan_radio.channel', 'Channel', 'uint32'],
    ['wlan_radio.frequency', 'Frequency', 'uint16'],
    ['wlan_radio.signal_dbm', 'Signal strength (dBm)', 'int8'],
  ],
});
function radioInfo(ctx, r, off, len) {
  const t = ctx.proto('wlan_radio', off, len, '802.11 radio information');
  if (!ctx.tree) return;
  let phy = 0;
  if (r.mcs != null) phy = 7;
  else if (r.chflags & 0x20) phy = 4;
  else if (r.chflags & 0x40) phy = r.chflags & 0x100 ? 5 : 6;
  if (phy) ctx.add(t, 'wlan_radio.phy', off, 0, phy);
  if (phy === 4) ctx.add(t, 'wlan_radio.short_preamble', off, 0, (r.flags & 0x02) !== 0);
  if (r.rate != null) ctx.add(t, 'wlan_radio.data_rate', off, 0, r.rate, `Data rate: ${r.rate.toFixed(1)} Mb/s`);
  if (r.freq != null) {
    ctx.add(t, 'wlan_radio.channel', off, 0, chan(r.freq));
    ctx.add(t, 'wlan_radio.frequency', off, 0, r.freq, `Frequency: ${r.freq}MHz`);
  }
  if (r.signal != null) ctx.add(t, 'wlan_radio.signal_dbm', off, 0, r.signal, `Signal strength (dBm): ${r.signal} dBm`);
}

void NULLNODE; void u16;
