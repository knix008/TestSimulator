// UDP management/utility protocols: NTP, SNMP v1/v2c (BER), Syslog, TFTP.
import { registerProtocol, u16, u32, ip4, hexStr, ascii, utf8, printable, formatAbsTime, Malformed, NULLNODE } from '../core.js';

// ---------------------------------------------------------------------------------------------
// NTP
const LI = { 0: 'no warning', 1: 'last minute of the day has 61 seconds', 2: 'last minute of the day has 59 seconds', 3: 'unknown (clock unsynchronized)' };
const MODES = { 0: 'reserved', 1: 'symmetric active', 2: 'symmetric passive', 3: 'client', 4: 'server', 5: 'broadcast', 6: 'reserved for NTP control message', 7: 'reserved for private use' };
const VERS = { 0: 'reserved', 1: 'NTP Version 1', 2: 'NTP Version 2', 3: 'NTP Version 3', 4: 'NTP Version 4', 5: 'reserved', 6: 'reserved', 7: 'reserved' };
const NTP_EPOCH = 2208988800;

registerProtocol({
  abbrev: 'ntp', name: 'Network Time Protocol', short: 'NTP',
  fields: [
    ['ntp.flags', 'Flags', 'uint8', { base: 'hex' }],
    ['ntp.flags.li', 'Leap Indicator', 'uint8', { mask: 0xc0, strings: LI }],
    ['ntp.flags.vn', 'Version number', 'uint8', { mask: 0x38, strings: VERS }],
    ['ntp.flags.mode', 'Mode', 'uint8', { mask: 0x07, strings: MODES }],
    ['ntp.stratum', 'Peer Clock Stratum', 'uint8'],
    ['ntp.ppoll', 'Peer Polling Interval', 'int8'],
    ['ntp.precision', 'Peer Clock Precision', 'int8'],
    ['ntp.rootdelay', 'Root Delay', 'uint32'],
    ['ntp.rootdispersion', 'Root Dispersion', 'uint32'],
    ['ntp.refid', 'Reference ID', 'bytes'],
    ['ntp.reftime', 'Reference Timestamp', 'abs_time'],
    ['ntp.org', 'Origin Timestamp', 'abs_time'],
    ['ntp.rec', 'Receive Timestamp', 'abs_time'],
    ['ntp.xmt', 'Transmit Timestamp', 'abs_time'],
    ['ntp.keyid', 'Key ID', 'bytes'],
    ['ntp.mac', 'Message Authentication Code', 'bytes'],
    ['ntp.response_in', 'Response In', 'framenum'],
    ['ntp.request_in', 'Request In', 'framenum'],
    ['ntp.delta_time', 'Delta Time', 'rel_time'],
    ['ntp.ctrl.flags2', 'Flags 2', 'uint8', { base: 'hex' }],
    ['ntp.ctrl.sequence', 'Sequence', 'uint16'],
    ['ntp.ctrl.status', 'Status', 'uint16', { base: 'hex' }],
  ],
  tables: { 'udp.port': [123] },
  dissect(ctx, off, end) {
    const d = ctx.d;
    ctx.need(off, 1, end);
    const fl = d[off];
    const mode = fl & 7, vn = (fl >> 3) & 7, li = fl >> 6;
    ctx.setProtocol('NTP');
    const desc = `${VERS[vn]}, ${MODES[mode]}`;
    ctx.setInfo(desc);
    const t = ctx.proto('ntp', off, end - off, `Network Time Protocol (${desc})`);
    if (ctx.tree) {
      const fn = ctx.add(t, 'ntp.flags', off, 1, fl, `Flags: 0x${fl.toString(16).padStart(2, '0')}, Leap Indicator: ${LI[li]}, Version number: ${VERS[vn]}, Mode: ${MODES[mode]}`);
      ctx.bits(fn, off, 1, fl, ['ntp.flags.li', 'ntp.flags.vn', 'ntp.flags.mode']);
    }
    if (mode === 6 || mode === 7) {
      if (end - off > 1) ctx.data(off + 1, end);
      return end - off;
    }
    ctx.need(off, 48, end);
    // request/response pairing: client (3) <-> server (4), keyed on the client's transmit time
    const fd = ctx.fd;
    if (ctx.first && ctx.net && !ctx.inError) {
      const st = ctx.session.st('ntp', () => new Map());
      if (mode === 3 || mode === 1) st.set(hexStr(d, off + 40, 8), { no: ctx.no, rel: fd.rel });
      else if (mode === 4 || mode === 2) {
        const r = st.get(hexStr(d, off + 24, 8));
        if (r && !r.resp) { r.resp = ctx.no; ctx.session._fd(r.no).ntpIn = ctx.no; fd.ntpReq = r.no; fd.ntpDelta = fd.rel - r.rel; }
      }
    }
    if (fd.ntpIn) ctx.gen(t, 'ntp.response_in', fd.ntpIn);
    if (fd.ntpReq) { ctx.gen(t, 'ntp.request_in', fd.ntpReq); ctx.gen(t, 'ntp.delta_time', fd.ntpDelta); }
    if (!ctx.tree) return end - off;
    const st = d[off + 1];
    ctx.add(t, 'ntp.stratum', off + 1, 1, st, `Peer Clock Stratum: ${stratumStr(st)} (${st})`);
    const poll = (d[off + 2] << 24) >> 24, prec = (d[off + 3] << 24) >> 24;
    ctx.add(t, 'ntp.ppoll', off + 2, 1, poll, `Peer Polling Interval: ${poll} (${poll >= 0 ? 2 ** poll : 0} seconds)`);
    ctx.add(t, 'ntp.precision', off + 3, 1, prec, `Peer Clock Precision: ${prec} (${(2 ** prec).toFixed(9)} seconds)`);
    const rd = u32(d, off + 4), rdisp = u32(d, off + 8);
    ctx.add(t, 'ntp.rootdelay', off + 4, 4, rd, `Root Delay: ${((rd | 0) / 65536).toFixed(6)} seconds`);
    ctx.add(t, 'ntp.rootdispersion', off + 8, 4, rdisp, `Root Dispersion: ${(rdisp / 65536).toFixed(6)} seconds`);
    let ref;
    if (st <= 1) {
      let s = ''; for (let i = 0; i < 4 && d[off + 12 + i]; i++) s += String.fromCharCode(d[off + 12 + i]);
      ref = s ? printable(s) : 'NULL';
    } else ref = ip4(d, off + 12);
    ctx.add(t, 'ntp.refid', off + 12, 4, d.subarray(off + 12, off + 16), `Reference ID: ${ref}`);
    ts(ctx, t, 'ntp.reftime', 'Reference Timestamp', off + 16);
    ts(ctx, t, 'ntp.org', 'Origin Timestamp', off + 24);
    ts(ctx, t, 'ntp.rec', 'Receive Timestamp', off + 32);
    ts(ctx, t, 'ntp.xmt', 'Transmit Timestamp', off + 40);
    let o = off + 48;
    if (end - o >= 20) {
      ctx.add(t, 'ntp.keyid', o, 4, d.subarray(o, o + 4));
      ctx.add(t, 'ntp.mac', o + 4, end - o - 4, d.subarray(o + 4, end));
    }
    return end - off;
  },
});
function stratumStr(s) {
  if (s === 0) return 'unspecified or invalid';
  if (s === 1) return 'primary reference';
  if (s <= 15) return 'secondary reference';
  if (s === 16) return 'unsynchronized';
  return 'reserved';
}
function ts(ctx, t, f, name, o) {
  const d = ctx.d;
  const s = u32(d, o), fr = u32(d, o + 4);
  if (s === 0 && fr === 0) { ctx.add(t, f, o, 8, { sec: 0, nsec: 0 }, `${name}: NULL`); return; }
  // Wireshark converts the fraction with 24 significant bits
  const v = { sec: s - NTP_EPOCH, nsec: Math.floor(((fr >>> 8) * 1e9) / 16777216) };
  if (s < 0x80000000 && s - NTP_EPOCH < 0) v.sec = s + 4294967296 - NTP_EPOCH; // era 1
  ctx.add(t, f, o, 8, v, `${name}: ${formatAbsTime(v, true)}`);
}

// ---------------------------------------------------------------------------------------------
// SNMP (BER)
const PDU_NAMES = { 0: 'get-request', 1: 'get-next-request', 2: 'get-response', 3: 'set-request', 4: 'trap', 5: 'getBulkRequest', 6: 'informRequest', 7: 'snmpV2-trap', 8: 'report' };
const PDU_FIELD = { 0: 'snmp.get_request_element', 1: 'snmp.get_next_request_element', 2: 'snmp.get_response_element', 3: 'snmp.set_request_element', 4: 'snmp.trap_element', 5: 'snmp.getBulkRequest_element', 6: 'snmp.informRequest_element', 7: 'snmp.snmpV2_trap_element', 8: 'snmp.report_element' };
const ERR = { 0: 'noError', 1: 'tooBig', 2: 'noSuchName', 3: 'badValue', 4: 'readOnly', 5: 'genErr', 6: 'noAccess', 7: 'wrongType', 8: 'wrongLength', 9: 'wrongEncoding', 10: 'wrongValue', 11: 'noCreation', 12: 'inconsistentValue', 13: 'resourceUnavailable', 14: 'commitFailed', 15: 'undoFailed', 16: 'authorizationError', 17: 'notWritable', 18: 'inconsistentName' };
const GENERIC = { 0: 'coldStart', 1: 'warmStart', 2: 'linkDown', 3: 'linkUp', 4: 'authenticationFailure', 5: 'egpNeighborLoss', 6: 'enterpriseSpecific' };
const VERSIONS = { 0: 'version-1', 1: 'v2c', 2: 'v2u', 3: 'snmpv3' };
// MIB-II DisplayString objects for which Wireshark lists an extra 'snmp' layer in frame.protocols
const DISPLAY_OIDS = new Set(['1.3.6.1.2.1.1.1.0', '1.3.6.1.2.1.1.5.0']);

const pduFields = Object.values(PDU_FIELD).map((f, i) => [f, PDU_NAMES[i], 'none']);
registerProtocol({
  abbrev: 'snmp', name: 'Simple Network Management Protocol', short: 'SNMP',
  fields: [
    ['snmp.version', 'version', 'int32', { strings: VERSIONS }],
    ['snmp.community', 'community', 'string'],
    ['snmp.data', 'data', 'uint32', { strings: PDU_NAMES }],
    ...pduFields,
    ['snmp.request_id', 'request-id', 'int32'],
    ['snmp.error_status', 'error-status', 'int32', { strings: ERR }],
    ['snmp.error_index', 'error-index', 'int32'],
    ['snmp.non_repeaters', 'non-repeaters', 'uint32'],
    ['snmp.max_repetitions', 'max-repetitions', 'uint32'],
    ['snmp.variable_bindings', 'variable-bindings', 'uint32'],
    ['snmp.VarBind_element', 'VarBind', 'none'],
    ['snmp.enterprise', 'enterprise', 'oid'],
    ['snmp.agent_addr', 'agent-addr', 'ipv4'],
    ['snmp.generic_trap', 'generic-trap', 'int32', { strings: GENERIC }],
    ['snmp.specific_trap', 'specific-trap', 'int32'],
    ['snmp.time_stamp', 'time-stamp', 'uint32'],
    ['snmp.name', 'Object Name', 'oid'],
    ['snmp.value.int', 'Value (Integer32)', 'int64'],
    ['snmp.value.octets', 'Value (OctetString)', 'bytes'],
    ['snmp.value.oid', 'Value (OID)', 'oid'],
    ['snmp.value.null', 'Value (Null)', 'none'],
    ['snmp.value.ipv4', 'Value (IpAddress)', 'ipv4'],
    ['snmp.value.addr', 'Value (IpAddress)', 'bytes'],
    ['snmp.value.u32', 'Value (Unsigned32)', 'int64'],
    ['snmp.value.g32', 'Value (Gauge32)', 'int64'],
    ['snmp.value.counter', 'Value (Counter32)', 'uint64'],
    ['snmp.value.timeticks', 'Value (Timeticks)', 'uint64'],
    ['snmp.value.opaque', 'Value (Opaque)', 'bytes'],
    ['snmp.value.unk', 'Value (Unknown)', 'bytes'],
    ['snmp.var-bind_str', 'Variable-binding-string', 'string'],
    ['snmp.noSuchObject', 'noSuchObject', 'none'],
    ['snmp.noSuchInstance', 'noSuchInstance', 'none'],
    ['snmp.endOfMibView', 'endOfMibView', 'none'],
    ['snmp.msgVersion', 'msgVersion', 'int32'],
    ['snmp.msgData', 'msgData', 'uint32'],
    ['snmp.encrypted', 'encrypted', 'bytes'],
    ['snmp.response_in', 'Response In', 'framenum'],
    ['snmp.response_to', 'Response To', 'framenum'],
    ['snmp.time', 'Time', 'rel_time'],
  ],
  experts: [
    ['snmp.varbind.response', 'note', 'Response', 'Response'],
  ],
  tables: { 'udp.port': [161, 162] },
  dissect: dissectSnmp,
});

/** Read one BER TLV header. Returns { tag, cls, cons, len, vo (value offset), next }. */
export function berTlv(d, o, end) {
  if (o + 2 > end) throw new Malformed('BER: truncated TLV');
  let tag = d[o];
  const cls = tag >> 6, cons = (tag & 0x20) !== 0;
  let p = o + 1;
  if ((tag & 0x1f) === 0x1f) {
    let t = 0;
    do { if (p >= end) throw new Malformed('BER: truncated tag'); t = t * 128 + (d[p] & 0x7f); } while (d[p++] & 0x80);
    tag = (tag & 0xe0) | 0x1f; void t;
  }
  if (p >= end) throw new Malformed('BER: truncated length');
  let len = d[p++];
  if (len & 0x80) {
    const n = len & 0x7f;
    if (n === 0 || n > 4 || p + n > end) throw new Malformed('BER: unsupported length');
    len = 0;
    for (let i = 0; i < n; i++) len = len * 256 + d[p++];
  }
  if (p + len > end) throw new Malformed('BER: value runs past the end');
  return { tag, cls, cons, len, vo: p, next: p + len };
}
export function berInt(d, o, len) {
  if (len === 0) return 0;
  if (len <= 6) {
    let v = (d[o] & 0x80) ? -1 : 0;
    for (let i = 0; i < len; i++) v = v * 256 + d[o + i] - ((i === 0 && d[o] & 0x80) ? 0 : 0);
    // two's complement for negatives
    if (d[o] & 0x80) { let u = 0; for (let i = 0; i < len; i++) u = u * 256 + d[o + i]; return u - 2 ** (8 * len); }
    let u = 0; for (let i = 0; i < len; i++) u = u * 256 + d[o + i];
    return u;
  }
  let v = 0n;
  for (let i = 0; i < len; i++) v = (v << 8n) | BigInt(d[o + i]);
  if (d[o] & 0x80) v -= 1n << BigInt(8 * len);
  return v;
}
function berBig(d, o, len) {
  let v = 0n;
  for (let i = 0; i < len; i++) v = (v << 8n) | BigInt(d[o + i]);
  return v;
}
export function berOidStr(d, o, len) {
  if (!len) return '';
  const parts = [];
  let v = 0, first = true;
  for (let i = 0; i < len; i++) {
    v = v * 128 + (d[o + i] & 0x7f);
    if (!(d[o + i] & 0x80)) {
      if (first) { const a = v < 40 ? 0 : v < 80 ? 1 : 2; parts.push(a, v - a * 40); first = false; }
      else parts.push(v);
      v = 0;
    }
  }
  return parts.join('.');
}
const isoOid = (s) => (s.startsWith('1.') ? 'iso.' + s.slice(2) : s);
function isPrintable(d, o, len) {
  for (let i = 0; i < len; i++) { const c = d[o + i]; if ((c < 0x20 || c > 0x7e) && c !== 9 && c !== 10 && c !== 13) return false; }
  return true;
}

function dissectSnmp(ctx, off, end) {
  const d = ctx.d;
  // Not a well-formed BER message: let UDP show it as data (as Wireshark does)
  let msg;
  try { msg = berTlv(d, off, end); berTlv(d, msg.vo, msg.next); } catch { return false; }
  if (msg.tag !== 0x30) return false;
  ctx.setProtocol('SNMP');
  const t = ctx.proto('snmp', off, msg.next - off, 'Simple Network Management Protocol');
  let o = msg.vo;
  const mend = msg.next;
  const ver = berTlv(d, o, mend);
  const version = berInt(d, ver.vo, ver.len);
  ctx.add(t, 'snmp.version', o, ver.next - o, version);
  o = ver.next;
  if (version === 3) {
    ctx.add(t, 'snmp.msgVersion', o, 0, version);
    ctx.setInfo('encryptedPDU: privKey Unknown');
    if (o < mend) ctx.add(t, 'snmp.encrypted', o, mend - o, d.subarray(o, mend));
    return mend - off;
  }
  const com = berTlv(d, o, mend);
  ctx.add(t, 'snmp.community', o, com.next - o, utf8(d, com.vo, com.len));
  o = com.next;
  const pdu = berTlv(d, o, mend);
  const ptype = pdu.tag & 0x1f;
  const pname = PDU_NAMES[ptype] || 'unknown';
  const dn = ctx.add(t, 'snmp.data', o, pdu.next - o, ptype);
  const pn = PDU_FIELD[ptype] ? ctx.add(dn, PDU_FIELD[ptype], o, pdu.next - o, null, pname) : dn;
  let p = pdu.vo;
  const pend = pdu.next;
  let info = pname;
  let reqId = null;
  if (ptype === 4) {
    const ent = berTlv(d, p, pend);
    const eoid = berOidStr(d, ent.vo, ent.len);
    ctx.add(pn, 'snmp.enterprise', p, ent.next - p, eoid, `enterprise: ${eoid} (${isoOid(eoid)})`);
    info += ' ' + isoOid(eoid);
    p = ent.next;
    const ag = berTlv(d, p, pend);
    ctx.add(pn, 'snmp.agent_addr', p, ag.next - p, ag.len === 4 ? ip4(d, ag.vo) : '0.0.0.0');
    p = ag.next;
    const gt = berTlv(d, p, pend); ctx.add(pn, 'snmp.generic_trap', p, gt.next - p, berInt(d, gt.vo, gt.len)); p = gt.next;
    const sp = berTlv(d, p, pend); ctx.add(pn, 'snmp.specific_trap', p, sp.next - p, berInt(d, sp.vo, sp.len)); p = sp.next;
    const tm = berTlv(d, p, pend); ctx.add(pn, 'snmp.time_stamp', p, tm.next - p, berInt(d, tm.vo, tm.len)); p = tm.next;
  } else {
    const rid = berTlv(d, p, pend);
    reqId = berInt(d, rid.vo, rid.len);
    ctx.add(pn, 'snmp.request_id', p, rid.next - p, reqId);
    p = rid.next;
    const es = berTlv(d, p, pend);
    const ei = berTlv(d, es.next, pend);
    if (ptype === 5) {
      ctx.add(pn, 'snmp.non_repeaters', p, es.next - p, berInt(d, es.vo, es.len));
      ctx.add(pn, 'snmp.max_repetitions', es.next, ei.next - es.next, berInt(d, ei.vo, ei.len));
    } else {
      ctx.add(pn, 'snmp.error_status', p, es.next - p, berInt(d, es.vo, es.len));
      ctx.add(pn, 'snmp.error_index', es.next, ei.next - es.next, berInt(d, ei.vo, ei.len));
    }
    p = ei.next;
  }
  // variable bindings
  const vbl = berTlv(d, p, pend);
  let count = 0;
  for (let q = vbl.vo; q < vbl.next; q = berTlv(d, q, vbl.next).next) count++;
  const vn = ctx.add(pn, 'snmp.variable_bindings', p, vbl.next - p, count, `variable-bindings: ${count} item${count === 1 ? '' : 's'}`);
  for (let q = vbl.vo; q < vbl.next;) {
    const vb = berTlv(d, q, vbl.next);
    const nm = berTlv(d, vb.vo, vb.next);
    const oid = berOidStr(d, nm.vo, nm.len);
    info += ' ' + oid;
    varbind(ctx, vn, q, vb, nm, oid);
    q = vb.next;
  }
  ctx.setInfo(info);
  // request/response matching on request-id + conversation
  if (reqId !== null) {
    const fd = ctx.fd;
    if (ctx.first && ctx.net && !ctx.inError) {
      const st = ctx.session.st('snmp', () => new Map());
      const a = ctx.net.src + '/' + ctx.srcport, b = ctx.net.dst + '/' + ctx.dstport;
      if (ptype === 2 || ptype === 8) {
        const r = st.get(b + '>' + a + '#' + reqId);
        if (r && !r.resp) { r.resp = ctx.no; ctx.session._fd(r.no).snmpIn = ctx.no; fd.snmpTo = r.no; fd.snmpTime = fd.rel - r.rel; }
      } else if (ptype !== 7) st.set(a + '>' + b + '#' + reqId, { no: ctx.no, rel: fd.rel, resp: 0 });
    }
    if (fd.snmpIn) ctx.gen(t, 'snmp.response_in', fd.snmpIn);
    if (fd.snmpTo) { ctx.gen(t, 'snmp.response_to', fd.snmpTo); ctx.gen(t, 'snmp.time', fd.snmpTime); }
  }
  return mend - off;
}

function varbind(ctx, parent, q, vb, nm, oid) {
  const d = ctx.d;
  const val = berTlv(d, nm.next, vb.next);
  let disp;
  const tree = ctx.tree;
  const n = tree ? ctx.text(parent, '', q, vb.next - q) : NULLNODE;
  if (tree) ctx.add(n, 'snmp.name', vb.vo, nm.next - vb.vo, oid, `Object Name: ${oid} (${isoOid(oid)})`);
  const vo = val.vo, vl = val.len, vs = nm.next, ve = val.next;
  switch (val.tag) {
    case 0x02: { const v = berInt(d, vo, vl); disp = String(v); ctx.add(n, 'snmp.value.int', vs, ve - vs, BigInt(v), `Value (Integer32): ${v}`); break; }
    case 0x04: {
      if (isPrintable(d, vo, vl)) {
        const s = utf8(d, vo, vl);
        disp = `"${s}"`;
        const vn = ctx.add(n, 'snmp.value.octets', vs, ve - vs, d.subarray(vo, ve), `Value (OctetString): "${printable(s)}"`);
        // Wireshark decodes known DisplayString objects again (and lists another 'snmp' layer)
        if (DISPLAY_OIDS.has(oid)) { ctx.add(vn, 'snmp.var-bind_str', vo, vl, s); ctx.layers.push('snmp'); }
      } else {
        disp = hexStr(d, vo, vl);
        ctx.add(n, 'snmp.value.octets', vs, ve - vs, d.subarray(vo, ve), `Value (OctetString): ${disp}`);
      }
      break;
    }
    case 0x05: disp = 'Value (Null)'; ctx.add(n, 'snmp.value.null', vs, ve - vs, null); break;
    case 0x06: { const s = berOidStr(d, vo, vl); disp = `${s} (${isoOid(s)})`; ctx.add(n, 'snmp.value.oid', vs, ve - vs, s, `Value (OID): ${disp}`); break; }
    case 0x40:
      if (vl === 4) { disp = ip4(d, vo); ctx.add(n, 'snmp.value.ipv4', vs, ve - vs, disp, `Value (IpAddress): ${disp}`); }
      else { disp = hexStr(d, vo, vl); ctx.add(n, 'snmp.value.addr', vs, ve - vs, d.subarray(vo, ve)); }
      break;
    case 0x41: { const v = berBig(d, vo, vl); disp = String(v); ctx.add(n, 'snmp.value.counter', vs, ve - vs, v, `Value (Counter32): ${v}`); break; }
    case 0x42: { const v = berBig(d, vo, vl); disp = String(v); ctx.add(n, 'snmp.value.g32', vs, ve - vs, v, `Value (Gauge32): ${v}`); break; }
    case 0x43: { const v = berBig(d, vo, vl); disp = String(v); ctx.add(n, 'snmp.value.timeticks', vs, ve - vs, v, `Value (Timeticks): ${v}`); break; }
    case 0x44: disp = hexStr(d, vo, vl); ctx.add(n, 'snmp.value.opaque', vs, ve - vs, d.subarray(vo, ve)); break;
    case 0x46: { const v = berBig(d, vo, vl); disp = String(v); ctx.add(n, 'snmp.value.counter', vs, ve - vs, v, `Value (Counter64): ${v}`); break; }
    case 0x47: { const v = berBig(d, vo, vl); disp = String(v); ctx.add(n, 'snmp.value.u32', vs, ve - vs, v, `Value (Unsigned32): ${v}`); break; }
    case 0x80: case 0x81: case 0x82: {
      const nmx = val.tag === 0x80 ? 'noSuchObject' : val.tag === 0x81 ? 'noSuchInstance' : 'endOfMibView';
      disp = nmx;
      const en = ctx.add(n, `snmp.${nmx}`, vs, ve - vs, null, nmx);
      ctx.ei(en, 'snmp.varbind.response', vs, ve - vs, nmx);
      break;
    }
    default: disp = hexStr(d, vo, vl); ctx.add(n, 'snmp.value.unk', vs, ve - vs, d.subarray(vo, ve));
  }
  if (n !== NULLNODE) n.label = `${oid}: ${disp}`;
}

// ---------------------------------------------------------------------------------------------
// Syslog
const FACILITY = { 0: 'KERN - kernel messages', 1: 'USER - random user-level messages', 2: 'MAIL - mail system', 3: 'DAEMON - system daemons', 4: 'AUTH - security/authorization messages', 5: 'SYSLOG - messages generated internally by syslogd', 6: 'LPR - line printer subsystem', 7: 'NEWS - network news subsystem', 8: 'UUCP - UUCP subsystem', 9: 'CRON - clock daemon (BSD, Linux)', 10: 'AUTHPRIV - security/authorization messages (private)', 11: 'FTP - ftp daemon', 12: 'NTP - ntp subsystem', 13: 'LOGAUDIT - log audit', 14: 'LOGALERT - log alert', 15: 'CRON - clock daemon (Solaris)', 16: 'LOCAL0 - reserved for local use', 17: 'LOCAL1 - reserved for local use', 18: 'LOCAL2 - reserved for local use', 19: 'LOCAL3 - reserved for local use', 20: 'LOCAL4 - reserved for local use', 21: 'LOCAL5 - reserved for local use', 22: 'LOCAL6 - reserved for local use', 23: 'LOCAL7 - reserved for local use' };
const LEVEL = { 0: 'EMERG - system is unusable', 1: 'ALERT - action must be taken immediately', 2: 'CRIT - critical conditions', 3: 'ERR - error conditions', 4: 'WARNING - warning conditions', 5: 'NOTICE - normal but significant condition', 6: 'INFO - informational', 7: 'DEBUG - debug-level messages' };
const short = (s) => s.split(' - ')[0];
const MONTHS = new Set(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']);

registerProtocol({
  abbrev: 'syslog', name: 'Syslog Message', short: 'Syslog',
  fields: [
    ['syslog.facility', 'Facility', 'uint16', { mask: 0x3f8, bits: 16, strings: FACILITY }],
    ['syslog.level', 'Level', 'uint16', { mask: 0x7, bits: 16, strings: LEVEL }],
    ['syslog.version', 'Version', 'string'],
    ['syslog.timestamp_rfc3164', 'Timestamp (RFC3164)', 'string'],
    ['syslog.timestamp', 'Timestamp', 'string'],
    ['syslog.hostname', 'Hostname', 'string'],
    ['syslog.appname', 'App Name', 'string'],
    ['syslog.procid', 'Process ID', 'string'],
    ['syslog.msgid', 'Message ID', 'string'],
    ['syslog.msg', 'Message', 'string'],
  ],
  experts: [['syslog.msg.nonconformant', 'note', 'Malformed', 'Message conforms to neither RFC 5424 nor RFC 3164; trailing data appended']],
  tables: { 'udp.port': [514] },
  dissect(ctx, off, end) {
    const d = ctx.d;
    let o = off, pri = -1;
    if (d[o] === 0x3c) {
      let q = o + 1, v = 0;
      while (q < end && q < o + 5 && d[q] >= 0x30 && d[q] <= 0x39) v = v * 10 + d[q++] - 0x30;
      if (q < end && d[q] === 0x3e && q > o + 1) { pri = v; o = q + 1; }
    }
    let mlen = end;
    while (mlen > o && (d[mlen - 1] === 0 || d[mlen - 1] === 10 || d[mlen - 1] === 13)) mlen--;
    const text = utf8(d, o, mlen - o);
    ctx.setProtocol('Syslog');
    const fac = pri >= 0 ? pri >> 3 : -1, lev = pri >= 0 ? pri & 7 : -1;
    const head = pri >= 0 ? `${short(FACILITY[fac] || 'UNKNOWN')}.${short(LEVEL[lev])}: ` : '';
    ctx.setInfo(head + printable(text));
    const t = ctx.proto('syslog', off, end - off, `Syslog message: ${head}${printable(text)}`);
    if (!ctx.tree) return end - off;
    if (pri >= 0) ctx.bits(t, off, o - off, pri, ['syslog.facility', 'syslog.level']);
    // RFC 5424: VERSION SP TIMESTAMP SP HOSTNAME SP APP-NAME SP PROCID SP MSGID SP SD [SP MSG]
    if (d[o] >= 0x31 && d[o] <= 0x39 && d[o + 1] === 0x20) {
      const parts = text.split(' ');
      let p = o;
      const tok = (f, s) => { if (s !== undefined) { if (s !== '-') ctx.add(t, f, p, s.length, s); p += s.length + 1; } };
      tok('syslog.version', parts[0]); tok('syslog.timestamp', parts[1]); tok('syslog.hostname', parts[2]);
      tok('syslog.appname', parts[3]); tok('syslog.procid', parts[4]); tok('syslog.msgid', parts[5]);
      // structured data '-' (nil) or [..] elements precede the message
      let rest = parts.slice(6).join(' ');
      if (rest.startsWith('- ')) { p += 2; rest = rest.slice(2); } else if (rest === '-') rest = '';
      if (rest) ctx.add(t, 'syslog.msg', p, mlen - p, rest);
      return end - off;
    }
    // RFC 3164: "Mmm dd hh:mm:ss host tag[pid]: msg"
    let p = o;
    if (mlen - p >= 16 && MONTHS.has(ascii(d, p, 3)) && d[p + 3] === 0x20 && d[p + 15] === 0x20) {
      ctx.add(t, 'syslog.timestamp_rfc3164', p, 15, ascii(d, p, 15));
      p += 16;
      let h = p; while (h < mlen && d[h] !== 0x20) h++;
      ctx.add(t, 'syslog.hostname', p, h - p, utf8(d, p, h - p));
      p = h + 1;
      // Like Wireshark: the tag is the leading alphanumeric run; one delimiter is skipped.
      let q = p;
      while (q < mlen && isAlnum(d[q])) q++;
      ctx.add(t, 'syslog.procid', p, q - p, ascii(d, p, q - p));
      const ms = Math.min(q + 1, mlen);
      ctx.add(t, 'syslog.msg', ms, mlen - ms, utf8(d, ms, mlen - ms));
    } else {
      ctx.add(t, 'syslog.msg', p, mlen - p, utf8(d, p, mlen - p));
      if (pri < 0) ctx.ei(t, 'syslog.msg.nonconformant', p, mlen - p);
    }
    return end - off;
  },
});
function isAlnum(c) { return (c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a); }

// ---------------------------------------------------------------------------------------------
// TFTP
const OPCODES = { 1: 'Read Request', 2: 'Write Request', 3: 'Data Packet', 4: 'Acknowledgement', 5: 'Error Code', 6: 'Option Acknowledgement' };
const ERRORS = { 0: 'Not defined', 1: 'File not found', 2: 'Access violation', 3: 'Disk full or allocation exceeded', 4: 'Illegal TFTP Operation', 5: 'Unknown transfer ID', 6: 'File already exists', 7: 'No such user', 8: 'Option negotiation failed' };

registerProtocol({
  abbrev: 'tftp', name: 'Trivial File Transfer Protocol', short: 'TFTP',
  fields: [
    ['tftp.opcode', 'Opcode', 'uint16', { strings: OPCODES }],
    ['tftp.source_file', 'Source File', 'string'],
    ['tftp.destination_file', 'Destination File', 'string'],
    ['tftp.request_frame', 'Request frame', 'framenum'],
    ['tftp.type', 'Type', 'string'],
    ['tftp.block', 'Block', 'uint16'],
    ['tftp.block.full', 'Full Block Number', 'uint32'],
    ['tftp.error.code', 'Error code', 'uint16', { strings: ERRORS }],
    ['tftp.error.message', 'Error message', 'string'],
    ['tftp.option.name', 'Option name', 'string'],
    ['tftp.option.value', 'Option value', 'string'],
  ],
  experts: [['tftp.error', 'warn', 'Response', 'TFTP ERROR packet']],
  tables: { 'udp.port': [69] },
  dissect(ctx, off, end) {
    const d = ctx.d;
    ctx.need(off, 2, end);
    const op = u16(d, off);
    if (!OPCODES[op]) return false;
    const fd = ctx.fd;
    const s = ctx.session;
    // Track transfers: the request binds the client's port so data on new server ports is TFTP.
    let tr = fd.tftp;
    if (ctx.first && ctx.net && !ctx.inError) {
      const st = s.st('tftp', () => new Map());
      if (op === 1 || op === 2) {
        tr = { req: ctx.no, file: '', op, client: ctx.net.src + '/' + ctx.srcport, blksize: 512 };
        st.set(tr.client, tr);
        s.setConversationProto('udp', ctx.net.src, ctx.srcport, 'tftp', ctx.no);
      } else {
        tr = st.get(ctx.net.dst + '/' + ctx.dstport) || st.get(ctx.net.src + '/' + ctx.srcport) || null;
      }
      fd.tftp = tr;
      // Wireshark keeps the client's ACKs/data to the server's new port as plain UDP data
      if (tr && op !== 1 && op !== 2 && ctx.net.src + '/' + ctx.srcport === tr.client) fd.tftpPlain = true;
    }
    if (fd.tftpPlain) return false;
    ctx.setProtocol('TFTP');
    const t = ctx.proto('tftp', off, end - off, 'Trivial File Transfer Protocol');
    ctx.add(t, 'tftp.opcode', off, 2, op);
    let o = off + 2;
    const cstr = () => { let q = o; while (q < end && d[q]) q++; const v = ascii(d, o, q - o); const r = { v, o, len: q - o }; o = Math.min(q + 1, end); return r; };
    let info = OPCODES[op];
    const opts = () => {
      const parts = [];
      while (o < end) {
        const n = cstr(); if (!n.len) break;
        const v = cstr();
        parts.push(`${n.v}=${v.v}`);
        const on = ctx.text(t, `Option: ${n.v} = ${v.v}`, n.o, v.o + v.len + 1 - n.o);
        ctx.add(on, 'tftp.option.name', n.o, n.len, n.v);
        ctx.add(on, 'tftp.option.value', v.o, v.len, v.v);
        if (n.v.toLowerCase() === 'blksize' && tr && ctx.first) tr.blksize = +v.v || 512;
      }
      return parts;
    };
    const fileRef = () => {
      if (tr && tr.file) {
        ctx.gen(t, tr.op === 1 ? 'tftp.destination_file' : 'tftp.source_file', tr.file);
        ctx.gen(t, 'tftp.request_frame', tr.req, `${tr.op === 1 ? 'Read' : 'Write'} Request in frame ${tr.req}`);
      }
    };
    switch (op) {
      case 1: case 2: {
        const f = cstr();
        if (tr && ctx.first) tr.file = f.v;
        ctx.add(t, op === 1 ? 'tftp.source_file' : 'tftp.destination_file', f.o, f.len + 1, f.v);
        const m = cstr();
        ctx.add(t, 'tftp.type', m.o, m.len + 1, m.v);
        info += `, File: ${f.v}, Transfer type: ${m.v}`;
        const p = opts();
        if (p.length) info += ', ' + p.join(', ');
        break;
      }
      case 3: {
        fileRef();
        ctx.need(o, 2, end);
        const b = u16(d, o);
        ctx.add(t, 'tftp.block', o, 2, b);
        ctx.gen(t, 'tftp.block.full', b);
        o += 2;
        const last = end - o < (tr ? tr.blksize : 512);
        info += `, Block: ${b}${last ? ' (last)' : ''}`;
        ctx.setInfo(info);
        if (o < end) ctx.data(o, end);
        return end - off;
      }
      case 4: {
        fileRef();
        ctx.need(o, 2, end);
        const b = u16(d, o);
        ctx.add(t, 'tftp.block', o, 2, b);
        ctx.gen(t, 'tftp.block.full', b);
        info += `, Block: ${b}`;
        break;
      }
      case 5: {
        fileRef();
        ctx.need(o, 2, end);
        const c = u16(d, o);
        ctx.add(t, 'tftp.error.code', o, 2, c);
        o += 2;
        const m = cstr();
        ctx.add(t, 'tftp.error.message', m.o, m.len + 1, m.v);
        info += `, Code: ${ERRORS[c] || 'Unknown'}, Message: ${m.v}`;
        ctx.ei(t, 'tftp.error');
        break;
      }
      case 6: {
        fileRef();
        const p = opts();
        if (p.length) info += ', ' + p.join(', ');
        break;
      }
    }
    ctx.setInfo(info);
    return end - off;
  },
});
