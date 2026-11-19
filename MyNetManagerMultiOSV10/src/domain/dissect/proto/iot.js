// Industrial / IoT protocols: Modbus/TCP, MQTT (3.1, 3.1.1, 5.0) and CoAP.
import { registerProtocol, getProtocol, u16, u32, hexPad, utf8, findLineEnd, printable } from '../core.js';

// ---------------------------------------------------------------------------------------------
// shared: Wireshark's "Line-based text data" layer (registered lazily if no other module did).
export function textLines(ctx, parent, off, end, mediaType) {
  if (!getProtocol('data-text-lines')) registerProtocol({ abbrev: 'data-text-lines', name: 'Line-based text data', short: 'Line-based text data' });
  const d = ctx.d;
  let n = 0;
  const lines = [];
  for (let o = off; o < end;) {
    const le = findLineEnd(d, o, end);
    const next = le ? le.next : end;
    if (ctx.tree) lines.push([o, next]);
    n++;
    o = next;
  }
  const t = parent ? ctx.subProto(parent, 'data-text-lines', off, end - off) : ctx.proto('data-text-lines', off, end - off);
  if (ctx.tree) {
    t.label = `Line-based text data: ${mediaType} (${n} lines)`;
    for (const [a, b] of lines) ctx.text(t, printable(utf8(d, a, b - a)), a, b - a);
  }
  ctx.appendInfo(` (${mediaType})`);
}

// ---------------------------------------------------------------------------------------------
// Modbus/TCP
const MB_FUNC = { 1: 'Read Coils', 2: 'Read Discrete Inputs', 3: 'Read Holding Registers', 4: 'Read Input Registers', 5: 'Write Single Coil', 6: 'Write Single Register', 7: 'Read Exception Status', 8: 'Diagnostics', 11: 'Get Comm. Event Counters', 12: 'Get Comm. Event Log', 15: 'Write Multiple Coils', 16: 'Write Multiple Registers', 17: 'Report Slave ID', 20: 'Read File Record', 21: 'Write File Record', 22: 'Mask Write Register', 23: 'Read Write Register', 24: 'Read FIFO Queue', 43: 'Encapsulated Interface Transport', 90: 'Unity (Schneider)' };
const MB_EXC = { 1: 'Illegal function', 2: 'Illegal data address', 3: 'Illegal data value', 4: 'Slave device failure', 5: 'Acknowledge', 6: 'Slave device busy', 8: 'Memory parity error', 10: 'Gateway path unavailable', 11: 'Gateway target device failed to respond' };

registerProtocol({
  abbrev: 'mbtcp', name: 'Modbus/TCP', short: 'Modbus/TCP',
  fields: [
    ['mbtcp.trans_id', 'Transaction Identifier', 'uint16'],
    ['mbtcp.prot_id', 'Protocol Identifier', 'uint16'],
    ['mbtcp.len', 'Length', 'uint16'],
    ['mbtcp.unit_id', 'Unit Identifier', 'uint8'],
  ],
  tables: { 'tcp.port': [502] },
  tcpPdu(ctx, off, end) {
    if (end - off < 6) return -1;
    return 6 + u16(ctx.d, off + 4);
  },
  dissect(ctx, off, end) {
    const d = ctx.d;
    ctx.need(off, 7, end);
    if (u16(d, off + 2) !== 0) return false;
    const tid = u16(d, off), len = u16(d, off + 4), unit = d[off + 6];
    ctx.setProtocol('Modbus/TCP');
    const again = ctx.vars.mbtcp;
    ctx.vars.mbtcp = true;
    const t = ctx.proto('mbtcp', off, 7, 'Modbus/TCP');
    if (again) ctx.layers.pop(); // Wireshark lists mbtcp once per frame, modbus per PDU
    ctx.add(t, 'mbtcp.trans_id', off, 2, tid);
    ctx.add(t, 'mbtcp.prot_id', off + 2, 2, 0);
    ctx.add(t, 'mbtcp.len', off + 4, 2, len);
    ctx.add(t, 'mbtcp.unit_id', off + 6, 1, unit);
    const pend = Math.min(end, off + 6 + len);
    // Requests go to the server port; anything from it is a response.
    const response = ctx.srcport === 502 || (ctx.dstport !== 502 && ctx.srcport < ctx.dstport);
    modbus(ctx, off + 7, pend, { tid, unit, response });
    return pend - off;
  },
});

registerProtocol({
  abbrev: 'modbus', name: 'Modbus', short: 'Modbus',
  fields: [
    ['modbus.exception', 'Exception', 'bool', { mask: 0x80, bits: 8, tfs: ['Yes', 'No'] }],
    ['modbus.func_code', 'Function Code', 'uint8', { mask: 0x7f, strings: MB_FUNC }],
    ['modbus.exception_code', 'Exception Code', 'uint8', { strings: MB_EXC }],
    ['modbus.reference_num', 'Reference Number', 'uint16'],
    ['modbus.word_cnt', 'Word Count', 'uint16'],
    ['modbus.byte_cnt', 'Byte Count', 'uint8'],
    ['modbus.bit_cnt', 'Bit Count', 'uint16'],
    ['modbus.bitnum', 'Bit Number', 'uint16'],
    ['modbus.bitval', 'Bit Value', 'bool'],
    ['modbus.regnum16', 'Register Number', 'uint16'],
    ['modbus.regval_uint16', 'Register Value (UINT16)', 'uint16'],
    ['modbus.data', 'Data', 'bytes'],
    ['modbus.padding', 'Padding', 'uint8', { base: 'hex' }],
    ['modbus.request_frame', 'Request Frame', 'framenum'],
    ['modbus.response_time', 'Time from request', 'rel_time'],
  ],
  experts: [['modbus.data_mismatch', 'warn', 'Malformed', 'Data length mismatch']],
});

function modbus(ctx, o, end, h) {
  const d = ctx.d;
  ctx.need(o, 1, end);
  const fcRaw = d[o], fc = fcRaw & 0x7f, exc = (fcRaw & 0x80) !== 0;
  const fname = MB_FUNC[fc] || `Unknown function (${fc})`;
  // request/response pairing by connection + transaction id
  const fd = ctx.fd;
  const key = `${ctx.tcpStream}#${h.tid}`;
  if (ctx.first) {
    const st = ctx.session.st('modbus', () => new Map());
    if (!h.response) st.set(key, { no: ctx.no, rel: fd.rel, fc, ref: o + 3 <= end ? u16(d, o + 1) : 0, cnt: o + 5 <= end ? u16(d, o + 3) : 0 });
    else {
      const r = st.get(key);
      if (r && (r.fc === fc)) fd.mbReq = { no: r.no, time: fd.rel - r.rel, ref: r.ref, cnt: r.cnt };
    }
  }
  const req = h.response ? fd.mbReq : null;
  ctx.setProtocol('Modbus/TCP');
  const kind = h.response ? 'Response' : 'Query';
  let info = `${kind.padStart(8)}: Trans: ${String(h.tid).padStart(5)}; Unit: ${String(h.unit).padStart(3)}, Func: ${String(fc).padStart(3)}: ${fname}`;
  if (exc) info += '. Exception returned ';
  ctx.setInfo(info); // each PDU replaces the column (Wireshark shows the last one)
  const t = ctx.proto('modbus', o, end - o, 'Modbus');
  ctx.add(t, 'modbus.exception', o, 1, exc);
  ctx.add(t, 'modbus.func_code', o, 1, fc);
  let p = o + 1;
  if (exc) {
    ctx.need(p, 1, end);
    const code = d[p];
    if (ctx.tree) t.label = `Function ${fc}:  ${fname}.  Exception: ${MB_EXC[code] || 'Unknown'}`;
    ctx.add(t, 'modbus.exception_code', p, 1, code);
    return;
  }
  if (req) {
    ctx.gen(t, 'modbus.request_frame', req.no, `Request Frame: ${req.no}`);
    ctx.gen(t, 'modbus.response_time', req.time);
  }
  const bitsItems = (q, nbytes, first, count) => {
    for (let i = 0; i < count && Math.floor(i / 8) < nbytes; i++) {
      const byte = d[q + (i >> 3)], b = i & 7, v = (byte >> b) & 1;
      const n = ctx.text(t, `Bit ${first + i} : ${v}`, q + (i >> 3), 1);
      ctx.gen(n, 'modbus.bitnum', first + i);
      let pat = '';
      for (let k = 7; k >= 0; k--) { pat += k === b ? String(v) : '.'; if (k === 4) pat += ' '; }
      ctx.add(n, 'modbus.bitval', q + (i >> 3), 1, v === 1, `${pat} = Bit Value: ${v ? 'True' : 'False'}`);
    }
  };
  const regItems = (q, n, first) => {
    for (let i = 0; i < n; i++) {
      const v = u16(d, q + 2 * i);
      const it = ctx.text(t, `Register ${first + i} (UINT16): ${v}`, q + 2 * i, 2);
      ctx.gen(it, 'modbus.regnum16', first + i);
      ctx.add(it, 'modbus.regval_uint16', q + 2 * i, 2, v);
    }
  };
  if (!ctx.tree) return;
  if (!h.response) {
    switch (fc) {
      case 1: case 2: case 3: case 4:
        ctx.need(p, 4, end);
        ctx.add(t, 'modbus.reference_num', p, 2, u16(d, p));
        ctx.add(t, fc <= 2 ? 'modbus.bit_cnt' : 'modbus.word_cnt', p + 2, 2, u16(d, p + 2));
        return;
      case 5:
        ctx.need(p, 4, end);
        ctx.add(t, 'modbus.reference_num', p, 2, u16(d, p));
        ctx.add(t, 'modbus.data', p + 2, 1, d.subarray(p + 2, p + 4), `Data: ${hexPad(u16(d, p + 2), 4).slice(2)}`);
        ctx.add(t, 'modbus.padding', p + 3, 1, d[p + 3]);
        return;
      case 6:
        ctx.need(p, 4, end);
        ctx.add(t, 'modbus.reference_num', p, 2, u16(d, p));
        regItems(p + 2, 1, u16(d, p));
        return;
      case 15: case 16: {
        ctx.need(p, 5, end);
        const ref = u16(d, p), cnt = u16(d, p + 2), bc = d[p + 4];
        ctx.add(t, 'modbus.reference_num', p, 2, ref);
        ctx.add(t, fc === 15 ? 'modbus.bit_cnt' : 'modbus.word_cnt', p + 2, 2, cnt);
        ctx.add(t, 'modbus.byte_cnt', p + 4, 1, bc);
        ctx.need(p + 5, bc, end);
        if (fc === 15) bitsItems(p + 5, bc, ref, cnt);
        else regItems(p + 5, Math.min(cnt, bc >> 1), ref);
        return;
      }
      default:
        if (p < end) ctx.add(t, 'modbus.data', p, end - p, d.subarray(p, end));
    }
    return;
  }
  switch (fc) {
    case 1: case 2: case 3: case 4: {
      ctx.need(p, 1, end);
      const bc = d[p];
      ctx.add(t, 'modbus.byte_cnt', p, 1, bc);
      ctx.need(p + 1, bc, end);
      if (fc <= 2) bitsItems(p + 1, bc, req ? req.ref : 0, req ? req.cnt : bc * 8);
      else regItems(p + 1, bc >> 1, req ? req.ref : 0);
      return;
    }
    case 5:
      ctx.need(p, 4, end);
      ctx.add(t, 'modbus.reference_num', p, 2, u16(d, p));
      ctx.add(t, 'modbus.data', p + 2, 1, d.subarray(p + 2, p + 4), `Data: ${hexPad(u16(d, p + 2), 4).slice(2)}`);
      ctx.add(t, 'modbus.padding', p + 3, 1, d[p + 3]);
      return;
    case 6:
      ctx.need(p, 4, end);
      ctx.add(t, 'modbus.reference_num', p, 2, u16(d, p));
      regItems(p + 2, 1, u16(d, p));
      return;
    case 15: case 16:
      ctx.need(p, 4, end);
      ctx.add(t, 'modbus.reference_num', p, 2, u16(d, p));
      ctx.add(t, fc === 15 ? 'modbus.bit_cnt' : 'modbus.word_cnt', p + 2, 2, u16(d, p + 2));
      return;
    default:
      if (p < end) ctx.add(t, 'modbus.data', p, end - p, d.subarray(p, end));
  }
}

// ---------------------------------------------------------------------------------------------
// MQTT
const MQ_TYPE = { 0: 'Reserved', 1: 'Connect Command', 2: 'Connect Ack', 3: 'Publish Message', 4: 'Publish Ack', 5: 'Publish Received', 6: 'Publish Release', 7: 'Publish Complete', 8: 'Subscribe Request', 9: 'Subscribe Ack', 10: 'Unsubscribe Request', 11: 'Unsubscribe Ack', 12: 'Ping Request', 13: 'Ping Response', 14: 'Disconnect Req', 15: 'Authentication Exchange' };
const MQ_QOS = { 0: 'At most once delivery (Fire and Forget)', 1: 'At least once delivery (Acknowledged deliver)', 2: 'Exactly once delivery (Assured Delivery)', 3: 'Reserved' };
const MQ_CONACK = { 0: 'Connection Accepted', 1: 'Connection Refused: unacceptable protocol version', 2: 'Connection Refused: identifier rejected', 3: 'Connection Refused: server unavailable', 4: 'Connection Refused: bad user name or password', 5: 'Connection Refused: not authorized' };
const MQ_VER = { 3: 'MQTT v3.1', 4: 'MQTT v3.1.1', 5: 'MQTT v5.0' };
const MQ_PROP = { 1: 'Payload Format Indicator', 2: 'Publication Expiry Interval', 3: 'Content Type', 8: 'Response Topic', 9: 'Correlation Data', 11: 'Subscription Identifier', 17: 'Session Expiry Interval', 18: 'Assigned Client Identifier', 19: 'Server Keep Alive', 21: 'Authentication Method', 22: 'Authentication Data', 23: 'Request Problem Information', 24: 'Will Delay Interval', 25: 'Request Response Information', 26: 'Response Information', 28: 'Server Reference', 31: 'Reason String', 33: 'Receive Maximum', 34: 'Topic Alias Maximum', 35: 'Topic Alias', 36: 'Maximum QoS', 37: 'Retain Available', 38: 'User Property', 39: 'Maximum Packet Size', 40: 'Wildcard Subscription Available', 41: 'Subscription Identifier Available', 42: 'Shared Subscription Available' };
// property value kinds: b=byte, s=uint16, i=uint32, v=varint, u=utf8 string, d=binary, p=string pair
const MQ_PKIND = { 1: 'b', 2: 'i', 3: 'u', 8: 'u', 9: 'd', 11: 'v', 17: 'i', 18: 'u', 19: 's', 21: 'u', 22: 'd', 23: 'b', 24: 'i', 25: 'b', 26: 'u', 28: 'u', 31: 'u', 33: 's', 34: 's', 35: 's', 36: 'b', 37: 'b', 38: 'p', 39: 'i', 40: 'b', 41: 'b', 42: 'b' };
const MQ_RC = { 0: 'Success', 1: 'Granted QoS 1', 2: 'Granted QoS 2', 4: 'Disconnect with Will Message', 16: 'No matching subscribers', 17: 'No subscription existed', 24: 'Continue authentication', 25: 'Re-authenticate', 128: 'Unspecified error', 129: 'Malformed Packet', 130: 'Protocol Error', 131: 'Implementation specific error', 132: 'Unsupported Protocol Version', 133: 'Client Identifier not valid', 134: 'Bad User Name or Password', 135: 'Not authorized', 136: 'Server unavailable', 137: 'Server busy', 138: 'Banned', 139: 'Server shutting down', 140: 'Bad authentication method', 141: 'Keep Alive timeout', 142: 'Session taken over', 143: 'Topic Filter invalid', 144: 'Topic Name invalid', 145: 'Packet Identifier in use', 146: 'Packet Identifier not found', 147: 'Receive Maximum exceeded', 148: 'Topic Alias invalid', 149: 'Packet too large', 150: 'Message rate too high', 151: 'Quota exceeded', 152: 'Administrative action', 153: 'Payload format invalid', 154: 'Retain not supported', 155: 'QoS not supported', 156: 'Use another server', 157: 'Server moved', 158: 'Shared Subscriptions not supported', 159: 'Connection rate exceeded', 160: 'Maximum connect time', 161: 'Subscription Identifiers not supported', 162: 'Wildcard Subscriptions not supported' };

function varint(d, o, end) {
  let v = 0, mul = 1, n = 0;
  for (;;) {
    if (o + n >= end || n >= 4) return null;
    const b = d[o + n++];
    v += (b & 127) * mul;
    mul *= 128;
    if (!(b & 128)) return { v, n };
  }
}

registerProtocol({
  abbrev: 'mqtt', name: 'MQ Telemetry Transport Protocol', short: 'MQTT',
  fields: [
    ['mqtt.hdrflags', 'Header Flags', 'uint8', { base: 'hex' }],
    ['mqtt.msgtype', 'Message Type', 'uint8', { mask: 0xf0, strings: MQ_TYPE }],
    ['mqtt.hdr_reserved', 'Reserved', 'uint8', { mask: 0x0f }],
    ['mqtt.dupflag', 'DUP Flag', 'bool', { mask: 0x08, bits: 8, tfs: ['Set', 'Not set'] }],
    ['mqtt.qos', 'QoS Level', 'uint8', { mask: 0x06, strings: MQ_QOS }],
    ['mqtt.retain', 'Retain', 'bool', { mask: 0x01, bits: 8, tfs: ['Set', 'Not set'] }],
    ['mqtt.len', 'Msg Len', 'uint64'],
    ['mqtt.proto_len', 'Protocol Name Length', 'uint16'],
    ['mqtt.protoname', 'Protocol Name', 'string'],
    ['mqtt.ver', 'Version', 'uint8', { strings: MQ_VER }],
    ['mqtt.conflags', 'Connect Flags', 'uint8', { base: 'hex' }],
    ['mqtt.conflag.uname', 'User Name Flag', 'bool', { mask: 0x80, bits: 8, tfs: ['Set', 'Not set'] }],
    ['mqtt.conflag.passwd', 'Password Flag', 'bool', { mask: 0x40, bits: 8, tfs: ['Set', 'Not set'] }],
    ['mqtt.conflag.retain', 'Will Retain', 'bool', { mask: 0x20, bits: 8, tfs: ['Set', 'Not set'] }],
    ['mqtt.conflag.qos', 'QoS Level', 'uint8', { mask: 0x18, strings: MQ_QOS }],
    ['mqtt.conflag.willflag', 'Will Flag', 'bool', { mask: 0x04, bits: 8, tfs: ['Set', 'Not set'] }],
    ['mqtt.conflag.cleansess', 'Clean Session Flag', 'bool', { mask: 0x02, bits: 8, tfs: ['Set', 'Not set'] }],
    ['mqtt.conflag.reserved', '(Reserved)', 'bool', { mask: 0x01, bits: 8, tfs: ['Set', 'Not set'] }],
    ['mqtt.kalive', 'Keep Alive', 'uint16'],
    ['mqtt.clientid_len', 'Client ID Length', 'uint16'],
    ['mqtt.clientid', 'Client ID', 'string'],
    ['mqtt.willtopic_len', 'Will Topic Length', 'uint16'],
    ['mqtt.willtopic', 'Will Topic', 'string'],
    ['mqtt.willmsg_len', 'Will Message Length', 'uint16'],
    ['mqtt.willmsg', 'Will Message', 'bytes'],
    ['mqtt.username_len', 'User Name Length', 'uint16'],
    ['mqtt.username', 'User Name', 'string'],
    ['mqtt.passwd_len', 'Password Length', 'uint16'],
    ['mqtt.passwd', 'Password', 'string'],
    ['mqtt.conack.flags', 'Acknowledge Flags', 'uint8', { base: 'hex' }],
    ['mqtt.conack.flags.reserved', 'Reserved', 'bool', { mask: 0xfe, bits: 8, tfs: ['Set', 'Not set'] }],
    ['mqtt.conack.flags.sp', 'Session Present', 'bool', { mask: 0x01, bits: 8, tfs: ['Set', 'Not set'] }],
    ['mqtt.conack.val', 'Return Code', 'uint8', { strings: MQ_CONACK }],
    ['mqtt.msgid', 'Message Identifier', 'uint16'],
    ['mqtt.topic_len', 'Topic Length', 'uint16'],
    ['mqtt.topic', 'Topic', 'string'],
    ['mqtt.msg', 'Message', 'bytes'],
    ['mqtt.sub.qos', 'Requested QoS', 'uint8', { strings: MQ_QOS }],
    ['mqtt.suback.qos', 'Granted QoS', 'uint8', { strings: MQ_QOS }],
    ['mqtt.subscription_options', 'Subscription Options', 'uint8', { base: 'hex' }],
    ['mqtt.connack.reason_code', 'Reason Code', 'uint8', { strings: MQ_RC }],
    ['mqtt.puback.reason_code', 'Reason Code', 'uint8', { strings: MQ_RC }],
    ['mqtt.pubrec.reason_code', 'Reason Code', 'uint8', { strings: MQ_RC }],
    ['mqtt.pubrel.reason_code', 'Reason Code', 'uint8', { strings: MQ_RC }],
    ['mqtt.pubcomp.reason_code', 'Reason Code', 'uint8', { strings: MQ_RC }],
    ['mqtt.suback.reason_code', 'Reason Code', 'uint8', { strings: MQ_RC }],
    ['mqtt.unsuback.reason_code', 'Reason Code', 'uint8', { strings: MQ_RC }],
    ['mqtt.disconnect.reason_code', 'Reason Code', 'uint8', { strings: MQ_RC }],
    ['mqtt.auth.reason_code', 'Reason Code', 'uint8', { strings: MQ_RC }],
    ['mqtt.properties', 'Properties', 'none'],
    ['mqtt.will_properties', 'Will Properties', 'none'],
    ['mqtt.property_len', 'Total Length', 'uint64'],
    ['mqtt.property_id', 'ID', 'uint8', { base: 'hex', strings: MQ_PROP }],
    ['mqtt.prop_number', 'Value', 'uint32'],
    ['mqtt.prop_string', 'Value', 'string'],
    ['mqtt.prop_key', 'Key', 'string'],
    ['mqtt.prop_value', 'Value', 'string'],
  ],
  experts: [['mqtt.illegal_topic_length', 'warn', 'Malformed', 'Length cannot be 0']],
  tables: { 'tcp.port': [1883] },
  tcpPdu(ctx, off, end) {
    const v = varint(ctx.d, off + 1, end);
    if (!v) return end - off >= 5 ? 0 : -1;
    return 1 + v.n + v.v;
  },
  dissect: dissectMqtt,
});

function mqStr(ctx, t, p, end, lenAbbrev, abbrev) {
  const d = ctx.d;
  ctx.need(p, 2, end);
  const l = u16(d, p);
  ctx.need(p + 2, l, end);
  const s = utf8(d, p + 2, l);
  ctx.add(t, lenAbbrev, p, 2, l);
  ctx.add(t, abbrev, p + 2, l, s);
  return { s, next: p + 2 + l };
}

function mqProps(ctx, t, p, end, abbrev = 'mqtt.properties') {
  const d = ctx.d;
  const v = varint(d, p, end);
  if (!v) { ctx.need(p, 5, end); return end; }
  const pe = p + v.n + v.v;
  ctx.need(p, v.n + v.v, end);
  const n = ctx.add(t, abbrev, p, v.n + v.v, null);
  ctx.add(n, 'mqtt.property_len', p, v.n, BigInt(v.v));
  let q = p + v.n;
  while (q < pe) {
    const id = d[q];
    const kind = MQ_PKIND[id];
    ctx.add(n, 'mqtt.property_id', q, 1, id);
    q++;
    switch (kind) {
      case 'b': ctx.add(n, 'mqtt.prop_number', q, 1, d[q]); q += 1; break;
      case 's': ctx.add(n, 'mqtt.prop_number', q, 2, u16(d, q)); q += 2; break;
      case 'i': ctx.add(n, 'mqtt.prop_number', q, 4, u32(d, q)); q += 4; break;
      case 'v': { const x = varint(d, q, pe); if (!x) return pe; ctx.add(n, 'mqtt.prop_number', q, x.n, x.v); q += x.n; break; }
      case 'u': case 'd': { const l = u16(d, q); ctx.add(n, 'mqtt.prop_string', q, 2 + l, utf8(d, q + 2, l)); q += 2 + l; break; }
      case 'p': {
        const kl = u16(d, q);
        ctx.add(n, 'mqtt.prop_key', q, 2 + kl, utf8(d, q + 2, kl)); q += 2 + kl;
        const vl = u16(d, q);
        ctx.add(n, 'mqtt.prop_value', q, 2 + vl, utf8(d, q + 2, vl)); q += 2 + vl;
        break;
      }
      default: return pe; // unknown id: rest cannot be parsed
    }
  }
  return pe;
}

function dissectMqtt(ctx, off, end) {
  const d = ctx.d;
  ctx.need(off, 2, end);
  const hf = d[off], type = hf >> 4;
  const lv = varint(d, off + 1, end);
  if (!lv) { ctx.need(off, 5, end); return false; }
  const hl = 1 + lv.n;
  const pend = Math.min(end, off + hl + lv.v);
  const tname = MQ_TYPE[type] || 'Unknown';
  // protocol version of this connection (from CONNECT) decides v5 properties
  const st = ctx.session.st('mqtt', () => new Map());
  const conn = ctx.tcpStream;
  let ver = ctx.fd.mqttVer;
  if (ctx.first) {
    if (type === 1 && off + hl + 7 <= end) {
      const pl = u16(d, off + hl);
      if (off + hl + 2 + pl < end) st.set(conn, d[off + hl + 2 + pl]);
    }
    ver = st.get(conn) || 4;
    ctx.fd.mqttVer = ver;
  }
  const v5 = ver === 5;
  ctx.setProtocol('MQTT');
  const t = ctx.proto('mqtt', off, pend - off, `MQ Telemetry Transport Protocol, ${tname}`);
  const qos = (hf >> 1) & 3;
  const hn = ctx.add(t, 'mqtt.hdrflags', off, 1, hf,
    `Header Flags: ${hexPad(hf, 2)}, Message Type: ${tname}${type === 3 ? `, QoS Level: ${MQ_QOS[qos]}` : ''}`);
  if (type === 3) ctx.bits(hn, off, 1, hf, ['mqtt.msgtype', 'mqtt.dupflag', 'mqtt.qos', 'mqtt.retain']);
  else ctx.bits(hn, off, 1, hf, ['mqtt.msgtype', 'mqtt.hdr_reserved']);
  ctx.add(t, 'mqtt.len', off + 1, lv.n, BigInt(lv.v));
  let p = off + hl;
  let info = tname;
  switch (type) {
    case 1: { // CONNECT
      const pn = mqStr(ctx, t, p, pend, 'mqtt.proto_len', 'mqtt.protoname'); p = pn.next;
      ctx.need(p, 4, pend);
      const v = d[p], cf = d[p + 1];
      ctx.add(t, 'mqtt.ver', p, 1, v);
      const fl = [];
      if (cf & 0x80) fl.push('User Name Flag');
      if (cf & 0x40) fl.push('Password Flag');
      if (cf & 0x20) fl.push('Will Retain');
      fl.unshift(`QoS Level: ${MQ_QOS[(cf >> 3) & 3]}`);
      if (cf & 0x04) fl.push('Will Flag');
      if (cf & 0x02) fl.push('Clean Session Flag');
      const cn = ctx.add(t, 'mqtt.conflags', p + 1, 1, cf, `Connect Flags: ${hexPad(cf, 2)}, ${fl.join(', ')}`);
      ctx.bits(cn, p + 1, 1, cf, ['mqtt.conflag.uname', 'mqtt.conflag.passwd', 'mqtt.conflag.retain', 'mqtt.conflag.qos', 'mqtt.conflag.willflag', 'mqtt.conflag.cleansess', 'mqtt.conflag.reserved']);
      ctx.add(t, 'mqtt.kalive', p + 2, 2, u16(d, p + 2));
      p += 4;
      if (v === 5) p = mqProps(ctx, t, p, pend);
      p = mqStr(ctx, t, p, pend, 'mqtt.clientid_len', 'mqtt.clientid').next;
      if (cf & 0x04) {
        if (v === 5) p = mqProps(ctx, t, p, pend, 'mqtt.will_properties');
        p = mqStr(ctx, t, p, pend, 'mqtt.willtopic_len', 'mqtt.willtopic').next;
        ctx.need(p, 2, pend);
        const l = u16(d, p);
        ctx.add(t, 'mqtt.willmsg_len', p, 2, l);
        ctx.add(t, 'mqtt.willmsg', p + 2, l, d.subarray(p + 2, p + 2 + l));
        p += 2 + l;
      }
      if (cf & 0x80) p = mqStr(ctx, t, p, pend, 'mqtt.username_len', 'mqtt.username').next;
      if (cf & 0x40) p = mqStr(ctx, t, p, pend, 'mqtt.passwd_len', 'mqtt.passwd').next;
      break;
    }
    case 2: { // CONNACK
      ctx.need(p, 2, pend);
      const af = ctx.add(t, 'mqtt.conack.flags', p, 1, d[p]);
      ctx.bits(af, p, 1, d[p], ['mqtt.conack.flags.reserved', 'mqtt.conack.flags.sp']);
      ctx.add(t, v5 ? 'mqtt.connack.reason_code' : 'mqtt.conack.val', p + 1, 1, d[p + 1]);
      p += 2;
      if (v5 && p < pend) mqProps(ctx, t, p, pend);
      break;
    }
    case 3: { // PUBLISH
      const tp = mqStr(ctx, t, p, pend, 'mqtt.topic_len', 'mqtt.topic'); p = tp.next;
      let id = null;
      if (qos) { ctx.need(p, 2, pend); id = u16(d, p); ctx.add(t, 'mqtt.msgid', p, 2, id); p += 2; }
      if (v5) p = mqProps(ctx, t, p, pend);
      if (p < pend) ctx.add(t, 'mqtt.msg', p, pend - p, d.subarray(p, pend));
      info = `${tname}${id !== null ? ` (id=${id})` : ''} [${tp.s}]`;
      break;
    }
    case 4: case 5: case 6: case 7: { // PUBACK/PUBREC/PUBREL/PUBCOMP
      ctx.need(p, 2, pend);
      const id = u16(d, p);
      ctx.add(t, 'mqtt.msgid', p, 2, id);
      p += 2;
      if (v5 && p < pend) {
        ctx.add(t, ['mqtt.puback.reason_code', 'mqtt.pubrec.reason_code', 'mqtt.pubrel.reason_code', 'mqtt.pubcomp.reason_code'][type - 4], p, 1, d[p]);
        p++;
        if (p < pend) mqProps(ctx, t, p, pend);
      }
      info = `${tname} (id=${id})`;
      break;
    }
    case 8: case 10: { // SUBSCRIBE / UNSUBSCRIBE
      ctx.need(p, 2, pend);
      const id = u16(d, p);
      ctx.add(t, 'mqtt.msgid', p, 2, id);
      p += 2;
      if (v5) p = mqProps(ctx, t, p, pend);
      const topics = [];
      while (p < pend) {
        const tp = mqStr(ctx, t, p, pend, 'mqtt.topic_len', 'mqtt.topic'); p = tp.next;
        topics.push(tp.s);
        if (type === 8) {
          ctx.need(p, 1, pend);
          if (v5) ctx.add(t, 'mqtt.subscription_options', p, 1, d[p]);
          else ctx.add(t, 'mqtt.sub.qos', p, 1, d[p]);
          p++;
        }
      }
      info = `${tname} (id=${id}) [${topics.join(', ')}]`;
      break;
    }
    case 9: case 11: { // SUBACK / UNSUBACK
      ctx.need(p, 2, pend);
      const id = u16(d, p);
      ctx.add(t, 'mqtt.msgid', p, 2, id);
      p += 2;
      if (v5) p = mqProps(ctx, t, p, pend);
      while (p < pend) {
        if (type === 9) ctx.add(t, v5 ? 'mqtt.suback.reason_code' : 'mqtt.suback.qos', p, 1, d[p]);
        else if (v5) ctx.add(t, 'mqtt.unsuback.reason_code', p, 1, d[p]);
        p++;
      }
      info = `${tname} (id=${id})`;
      break;
    }
    case 14: case 15: // DISCONNECT / AUTH (v5 carry a reason code and properties)
      if (v5 && p < pend) {
        ctx.add(t, type === 14 ? 'mqtt.disconnect.reason_code' : 'mqtt.auth.reason_code', p, 1, d[p]);
        if (p + 1 < pend) mqProps(ctx, t, p + 1, pend);
      }
      break;
    default: break;
  }
  ctx.pduInfo('mqtt', info, ', ');
  return pend - off;
}

// ---------------------------------------------------------------------------------------------
// CoAP
const COAP_TYPE = { 0: 'Confirmable', 1: 'Non-Confirmable', 2: 'Acknowledgement', 3: 'Reset' };
const COAP_TYPE_SHORT = { 0: 'CON', 1: 'NON', 2: 'ACK', 3: 'RST' };
const COAP_CODE = { 0: 'Empty Message', 1: 'GET', 2: 'POST', 3: 'PUT', 4: 'DELETE', 5: 'FETCH', 6: 'PATCH', 7: 'iPATCH', 65: '2.01 Created', 66: '2.02 Deleted', 67: '2.03 Valid', 68: '2.04 Changed', 69: '2.05 Content', 95: '2.31 Continue', 128: '4.00 Bad Request', 129: '4.01 Unauthorized', 130: '4.02 Bad Option', 131: '4.03 Forbidden', 132: '4.04 Not Found', 133: '4.05 Method Not Allowed', 134: '4.06 Not Acceptable', 136: '4.08 Request Entity Incomplete', 137: '4.09 Conflict', 140: '4.12 Precondition Failed', 141: '4.13 Request Entity Too Large', 143: '4.15 Unsupported Content-Format', 150: '4.22 Unprocessable Entity', 157: '4.29 Too Many Requests', 160: '5.00 Internal Server Error', 161: '5.01 Not Implemented', 162: '5.02 Bad Gateway', 163: '5.03 Service Unavailable', 164: '5.04 Gateway Timeout', 165: '5.05 Proxying Not Supported', 168: '5.08 Hop Limit Reached', 225: '7.01 CSM', 226: '7.02 Ping', 227: '7.03 Pong', 228: '7.04 Release', 229: '7.05 Abort' };
const COAP_OPT = { 1: 'If-Match', 3: 'Uri-Host', 4: 'Etag', 5: 'If-None-Match', 6: 'Observe', 7: 'Uri-Port', 8: 'Location-Path', 9: 'OSCORE', 11: 'Uri-Path', 12: 'Content-Format', 14: 'Max-age', 15: 'Uri-Query', 17: 'Accept', 20: 'Location-Query', 23: 'Block2', 27: 'Block1', 28: 'Size2', 35: 'Proxy-Uri', 39: 'Proxy-Scheme', 60: 'Size1', 252: 'Echo', 258: 'No-Response', 292: 'Request-Tag' };
const COAP_CF = { 0: 'text/plain; charset=utf-8', 16: 'application/cose; cose-type="cose-encrypt0"', 40: 'application/link-format', 41: 'application/xml', 42: 'application/octet-stream', 47: 'application/exi', 50: 'application/json', 51: 'application/json-patch+json', 52: 'application/merge-patch+json', 60: 'application/cbor', 61: 'application/cwt', 110: 'application/senml+json', 112: 'application/senml+cbor', 11542: 'application/vnd.oma.lwm2m+tlv', 11543: 'application/vnd.oma.lwm2m+json' };
// option number -> [field abbrev, kind] (s=string, u=uint, b=bytes, c=content-format)
const COAP_OPT_FIELD = { 1: ['coap.opt.if_match', 'b'], 3: ['coap.opt.uri_host', 's'], 4: ['coap.opt.etag', 'b'], 6: ['coap.opt.observe', 'u'], 7: ['coap.opt.uri_port', 'u'], 8: ['coap.opt.location_path', 's'], 11: ['coap.opt.uri_path', 's'], 12: ['coap.opt.ctype', 'c'], 14: ['coap.opt.max_age', 'u'], 15: ['coap.opt.uri_query', 's'], 17: ['coap.opt.accept', 'c'], 20: ['coap.opt.location_query', 's'] };

registerProtocol({
  abbrev: 'coap', name: 'Constrained Application Protocol', short: 'CoAP',
  fields: [
    ['coap.version', 'Version', 'uint8', { mask: 0xc0 }],
    ['coap.type', 'Type', 'uint8', { mask: 0x30, strings: COAP_TYPE }],
    ['coap.token_len', 'Token Length', 'uint8', { mask: 0x0f }],
    ['coap.code', 'Code', 'uint8', { strings: COAP_CODE }],
    ['coap.mid', 'Message ID', 'uint16'],
    ['coap.token', 'Token', 'bytes'],
    ['coap.opt.name', 'Opt Name', 'string'],
    ['coap.opt.desc', 'Opt Desc', 'string'],
    ['coap.opt.delta', 'Opt Delta', 'uint8', { mask: 0xf0 }],
    ['coap.opt.delta_ext', 'Opt Delta extended', 'uint16'],
    ['coap.opt.length', 'Opt Length', 'uint8', { mask: 0x0f }],
    ['coap.opt.length_ext', 'Opt Length extended', 'uint16'],
    ['coap.opt.end_marker', 'End of options marker', 'uint8'],
    ['coap.opt.ctype', 'Content-type', 'string'],
    ['coap.opt.accept', 'Accept', 'string'],
    ['coap.opt.max_age', 'Max-age', 'uint32'],
    ['coap.opt.etag', 'Etag', 'bytes'],
    ['coap.opt.if_match', 'If-Match', 'bytes'],
    ['coap.opt.uri_host', 'Uri-Host', 'string'],
    ['coap.opt.uri_port', 'Uri-Port', 'uint16'],
    ['coap.opt.uri_path', 'Uri-Path', 'string'],
    ['coap.opt.uri_path_recon', 'Uri-Path', 'string'],
    ['coap.opt.uri_query', 'Uri-Query', 'string'],
    ['coap.opt.location_path', 'Location-Path', 'string'],
    ['coap.opt.location_query', 'Location-Query', 'string'],
    ['coap.opt.observe', 'Observe', 'uint32'],
    ['coap.opt.unknown', 'Unknown', 'bytes'],
    ['coap.payload', 'Payload', 'string'],
    ['coap.payload_desc', 'Payload Desc', 'string'],
    ['coap.payload_length', 'Payload Length', 'uint32'],
    ['coap.response_in', 'Response In', 'framenum'],
    ['coap.response_to', 'Request In', 'framenum'],
    ['coap.response_time', 'Response Time', 'rel_time'],
  ],
  experts: [
    ['coap.option_length_bad', 'warn', 'Malformed', 'Option length bad'],
    ['coap.unknown_option_number', 'warn', 'Malformed', 'Unknown Option Number'],
  ],
  tables: { 'udp.port': [5683] },
  dissect: dissectCoap,
});

function coapUint(d, o, n) { let v = 0; for (let i = 0; i < n; i++) v = v * 256 + d[o + i]; return v; }

function dissectCoap(ctx, off, end) {
  const d = ctx.d;
  ctx.need(off, 4, end);
  const b0 = d[off];
  if ((b0 >> 6) !== 1) return false;
  const type = (b0 >> 4) & 3, tkl = b0 & 15, code = d[off + 1], mid = u16(d, off + 2);
  ctx.setProtocol('CoAP');
  const cname = COAP_CODE[code] || `${code >> 5}.${String(code & 31).padStart(2, '0')}`;
  const t = ctx.proto('coap', off, end - off, `Constrained Application Protocol, ${COAP_TYPE[type]}, ${cname}, MID:${mid}`);
  ctx.bits(t, off, 1, b0, ['coap.version', 'coap.type', 'coap.token_len']);
  ctx.add(t, 'coap.code', off + 1, 1, code);
  ctx.add(t, 'coap.mid', off + 2, 2, mid);
  ctx.setInfo(`${COAP_TYPE_SHORT[type]}, MID:${mid}, ${cname}`);
  let p = off + 4;
  let token = null;
  if (tkl) {
    ctx.need(p, tkl, end);
    token = d.subarray(p, p + tkl);
    ctx.add(t, 'coap.token', p, tkl, token);
    p += tkl;
  }
  // options
  let num = 0, idx = 0, cf = -1;
  const path = [];
  while (p < end && d[p] !== 0xff) {
    const ob = d[p];
    let delta = ob >> 4, len = ob & 15;
    let q = p + 1;
    let dext = null, lext = null;
    if (delta === 13) { ctx.need(q, 1, end); dext = [q, 1]; delta = d[q] + 13; q++; } else if (delta === 14) { ctx.need(q, 2, end); dext = [q, 2]; delta = u16(d, q) + 269; q += 2; }
    if (len === 13) { ctx.need(q, 1, end); lext = [q, 1]; len = d[q] + 13; q++; } else if (len === 14) { ctx.need(q, 2, end); lext = [q, 2]; len = u16(d, q) + 269; q += 2; }
    if (delta === 15 || len === 15) { ctx.ei(t, 'coap.option_length_bad', p, 1); return end - off; }
    num += delta;
    ctx.need(q, len, end);
    idx++;
    const oname = COAP_OPT[num] || `Unknown Option (${num})`;
    const fdef = COAP_OPT_FIELD[num];
    let valStr;
    if (fdef && fdef[1] === 's') valStr = utf8(d, q, len);
    else if (fdef && (fdef[1] === 'u')) valStr = String(coapUint(d, q, len));
    else if (fdef && fdef[1] === 'c') { const v = coapUint(d, q, len); valStr = COAP_CF[v] || `Unknown Type ${v}`; if (num === 12) cf = v; }
    else valStr = Array.from(d.subarray(q, q + len), (x) => x.toString(16).padStart(2, '0')).join('');
    if (num === 11) path.push(valStr);
    const on = ctx.add(t, 'coap.opt.name', p, q + len - p, `#${idx}: ${oname}`, `Opt Name: #${idx}: ${oname}: ${valStr}`);
    if (ctx.tree) {
      ctx.add(on, 'coap.opt.desc', p, 0, `Type ${num}, ${num & 1 ? 'Critical' : 'Elective'}, ${num & 2 ? 'Unsafe' : 'Safe'}`);
      ctx.add(on, 'coap.opt.delta', p, 1, ob >> 4);
      ctx.add(on, 'coap.opt.length', p, 1, ob & 15);
      if (dext) ctx.add(on, 'coap.opt.delta_ext', dext[0], dext[1], delta);
      if (lext) ctx.add(on, 'coap.opt.length_ext', lext[0], lext[1], len);
      if (fdef) {
        const [abbrev, kind] = fdef;
        if (kind === 's' || kind === 'c') ctx.add(on, abbrev, q, len, valStr);
        else if (kind === 'b') ctx.add(on, abbrev, q, len, d.subarray(q, q + len));
        else {
          const v = coapUint(d, q, len);
          if (num === 6 && code >= 1 && code <= 31) ctx.add(on, abbrev, q, len, v, `Observe: ${v === 0 ? 'Register' : v === 1 ? 'Deregister' : 'Unknown'} (${v})`);
          else ctx.add(on, abbrev, q, len, v);
        }
      } else ctx.add(on, 'coap.opt.unknown', q, len, d.subarray(q, q + len));
    }
    p = q + len;
  }
  let payOff = -1;
  if (p < end && d[p] === 0xff) {
    ctx.add(t, 'coap.opt.end_marker', p, 1, 255);
    payOff = p + 1;
  }
  // request/response matching by token (and endpoints); responses inherit the request's URI
  const fd = ctx.fd;
  const isReq = code >= 1 && code <= 31;
  if (ctx.first) {
    const st = ctx.session.st('coap', () => new Map());
    const tk = token ? Array.from(token).join('.') : '';
    const a = ctx.net ? ctx.net.src + ':' + ctx.srcport : '', b = ctx.net ? ctx.net.dst + ':' + ctx.dstport : '';
    if (isReq && tk) {
      const r = { no: ctx.no, rel: fd.rel, uri: '/' + path.join('/'), resp: 0 };
      st.set(a + '>' + b + '#' + tk, r);
      fd.coap = { uri: r.uri };
    } else if (tk && code) {
      const r = st.get(b + '>' + a + '#' + tk);
      if (r) {
        // only the first response is paired (later Observe notifications just inherit the URI)
        if (!r.resp) { r.resp = ctx.no; ctx.session._fd(r.no).coap.in = ctx.no; fd.coap = { uri: r.uri, to: r.no, time: fd.rel - r.rel }; }
        else fd.coap = { uri: r.uri };
      }
    }
  }
  const cs = fd.coap;
  const uri = path.length ? '/' + path.join('/') : cs ? cs.uri : '';
  if (uri && ctx.tree) ctx.gen(t, 'coap.opt.uri_path_recon', uri, `Uri-Path: ${uri}`);
  if (cs && cs.in) ctx.gen(t, 'coap.response_in', cs.in, `Response In: ${cs.in}`);
  if (cs && cs.to) {
    ctx.gen(t, 'coap.response_to', cs.to, `Request In: ${cs.to}`);
    ctx.gen(t, 'coap.response_time', cs.time);
  }
  let info = `${COAP_TYPE_SHORT[type]}, MID:${mid}, ${cname}`;
  if (token) info += `, TKN:${Array.from(token, (x) => x.toString(16).padStart(2, '0')).join(' ')}`;
  if (uri) info += `, ${uri}`;
  ctx.setInfo(info);
  if (payOff >= 0 && payOff <= end) {
    const plen = end - payOff;
    const ctypeName = cf >= 0 ? (COAP_CF[cf] || `Unknown Type ${cf}`) : 'application/octet-stream';
    const pn = ctx.add(t, 'coap.payload', payOff, plen, `Payload Content-Format: ${ctypeName}, Length: ${plen}`,
      `Payload: Payload Content-Format: ${ctypeName}, Length: ${plen}`);
    if (ctx.tree) {
      ctx.add(pn, 'coap.payload_desc', payOff, plen, ctypeName);
      ctx.gen(pn, 'coap.payload_length', plen);
    }
    if (cf === 0 && plen > 0) textLines(ctx, null, payOff, end, 'text/plain');
  }
  return end - off;
}

