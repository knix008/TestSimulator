// NetBIOS Session Service (TCP 139/445) and SMB2 (header + common commands); SMB1 header only.
import { registerProtocol, u16, u32, u16le, u32le, u64le, hexPad, hexStr } from '../core.js';

const NBSS_TYPE = { 0x00: 'Session message', 0x81: 'Session request', 0x82: 'Positive session response', 0x83: 'Negative session response', 0x84: 'Retarget session response', 0x85: 'Session keep-alive' };

registerProtocol({
  abbrev: 'nbss', name: 'NetBIOS Session Service', short: 'NBSS',
  fields: [
    ['nbss.type', 'Message Type', 'uint8', { base: 'hex', strings: NBSS_TYPE }],
    ['nbss.flags', 'Flags', 'uint8', { base: 'hex' }],
    ['nbss.length', 'Length', 'uint24'],
  ],
  tables: { 'tcp.port': [139, 445] },
  tcpPdu(ctx, off, end) {
    if (end - off < 4) return -1;
    const d = ctx.d;
    if (!(d[off] in NBSS_TYPE)) return 0;
    return 4 + (((d[off + 1] & 1) << 16) | u16(d, off + 2));
  },
  dissect(ctx, off, end) {
    const d = ctx.d;
    ctx.need(off, 4, end);
    const type = d[off];
    if (!(type in NBSS_TYPE)) return false;
    // Port 445 ("direct hosted") uses a 24-bit length; 139 uses 7 flag bits + 17-bit length.
    const direct = ctx.srcport === 445 || ctx.dstport === 445;
    const len = direct ? (d[off + 1] << 16) | u16(d, off + 2) : ((d[off + 1] & 1) << 16) | u16(d, off + 2);
    const pend = Math.min(end, off + 4 + len);
    ctx.setProtocol('NBSS');
    const t = ctx.proto('nbss', off, pend - off, 'NetBIOS Session Service');
    ctx.add(t, 'nbss.type', off, 1, type);
    if (!direct) ctx.add(t, 'nbss.flags', off + 1, 1, d[off + 1]);
    ctx.add(t, 'nbss.length', off + 1, 3, len);
    const p = off + 4;
    if (type !== 0) {
      ctx.setInfo(NBSS_TYPE[type]);
      if (pend > p) ctx.data(p, pend);
      return pend - off;
    }
    ctx.setInfo('Session message');
    if (pend - p >= 4 && d[p + 1] === 0x53 && d[p + 2] === 0x4d && d[p + 3] === 0x42) {
      if (d[p] === 0xfe) { ctx.call('smb2', p, pend); return pend - off; }
      if (d[p] === 0xff) { ctx.call('smb', p, pend); return pend - off; }
    }
    if (pend > p) ctx.data(p, pend);
    return pend - off;
  },
});

// ---------------------------------------------------------------------------------------------
// SMB2
const CMD = { 0: 'Negotiate Protocol', 1: 'Session Setup', 2: 'Session Logoff', 3: 'Tree Connect', 4: 'Tree Disconnect', 5: 'Create', 6: 'Close', 7: 'Flush', 8: 'Read', 9: 'Write', 10: 'Lock', 11: 'Ioctl', 12: 'Cancel', 13: 'KeepAlive', 14: 'Find', 15: 'Notify', 16: 'GetInfo', 17: 'SetInfo', 18: 'Break', 19: 'Server notification' };
export const NT_STATUS = {
  0x00000000: 'STATUS_SUCCESS', 0x00000103: 'STATUS_PENDING', 0x0000010b: 'STATUS_NOTIFY_CLEANUP', 0x0000010c: 'STATUS_NOTIFY_ENUM_DIR',
  0x80000005: 'STATUS_BUFFER_OVERFLOW', 0x80000006: 'STATUS_NO_MORE_FILES', 0xc0000001: 'STATUS_UNSUCCESSFUL', 0xc0000002: 'STATUS_NOT_IMPLEMENTED',
  0xc0000003: 'STATUS_INVALID_INFO_CLASS', 0xc0000008: 'STATUS_INVALID_HANDLE', 0xc000000d: 'STATUS_INVALID_PARAMETER', 0xc000000f: 'STATUS_NO_SUCH_FILE',
  0xc0000010: 'STATUS_INVALID_DEVICE_REQUEST', 0xc0000011: 'STATUS_END_OF_FILE', 0xc0000016: 'STATUS_MORE_PROCESSING_REQUIRED', 0xc0000022: 'STATUS_ACCESS_DENIED',
  0xc0000023: 'STATUS_BUFFER_TOO_SMALL', 0xc0000033: 'STATUS_OBJECT_NAME_INVALID', 0xc0000034: 'STATUS_OBJECT_NAME_NOT_FOUND', 0xc0000035: 'STATUS_OBJECT_NAME_COLLISION',
  0xc000003a: 'STATUS_OBJECT_PATH_NOT_FOUND', 0xc0000043: 'STATUS_SHARING_VIOLATION', 0xc0000054: 'STATUS_FILE_LOCK_CONFLICT', 0xc0000055: 'STATUS_LOCK_NOT_GRANTED',
  0xc000005f: 'STATUS_NO_SUCH_LOGON_SESSION', 0xc0000064: 'STATUS_NO_SUCH_USER', 0xc000006a: 'STATUS_WRONG_PASSWORD', 0xc000006d: 'STATUS_LOGON_FAILURE',
  0xc0000071: 'STATUS_PASSWORD_EXPIRED', 0xc0000072: 'STATUS_ACCOUNT_DISABLED', 0xc000007f: 'STATUS_DISK_FULL', 0xc000009a: 'STATUS_INSUFFICIENT_RESOURCES',
  0xc00000ba: 'STATUS_FILE_IS_A_DIRECTORY', 0xc00000bb: 'STATUS_NOT_SUPPORTED', 0xc00000c9: 'STATUS_NETWORK_NAME_DELETED', 0xc00000cc: 'STATUS_BAD_NETWORK_NAME',
  0xc0000101: 'STATUS_DIRECTORY_NOT_EMPTY', 0xc0000103: 'STATUS_NOT_A_DIRECTORY', 0xc0000120: 'STATUS_CANCELLED', 0xc0000128: 'STATUS_FILE_CLOSED',
  0xc0000203: 'STATUS_USER_SESSION_DELETED', 0xc0000225: 'STATUS_NOT_FOUND', 0xc0000257: 'STATUS_PATH_NOT_COVERED', 0xc000035c: 'STATUS_NETWORK_SESSION_EXPIRED',
};
const DIALECTS = { 0x0202: 'SMB 2.0.2', 0x0210: 'SMB 2.1', 0x0222: 'SMB2.2', 0x0224: 'SMB3.0 (Win8 Beta)', 0x0300: 'SMB 3.0', 0x0302: 'SMB 3.0.2', 0x0310: 'SMB3.1', 0x0311: 'SMB 3.1.1', 0x02ff: 'SMB2 wildcard' };
const DISPOSITION = { 0: 'Supersede (supersede existing file (if it exists))', 1: 'Open (if file exists open it, else fail)', 2: 'Create (if file exists fail, else create it)', 3: 'Open If (if file exists open it, else create it)', 4: 'Overwrite (if file exists overwrite, else fail)', 5: 'Overwrite If (if file exists overwrite, else create it)' };
const CREATE_ACTION = { 0: 'No action taken?', 1: 'The file existed and was opened', 2: 'The file did not exist but was created', 3: 'The file existed and was truncated' };
const OPLOCK = { 0: 'No oplock', 1: 'Level2 oplock', 8: 'Exclusive oplock', 9: 'Batch oplock', 255: 'Lease' };
const IMPERSONATION = { 0: 'Anonymous', 1: 'Identification', 2: 'Impersonation', 3: 'Delegation' };
const SHARE_TYPE = { 1: 'Physical disk', 2: 'Named pipe', 3: 'Printer' };

registerProtocol({
  abbrev: 'smb2', name: 'SMB2 (Server Message Block Protocol version 2)', short: 'SMB2',
  fields: [
    ['smb2.protocol_id', 'ProtocolId', 'uint32', { base: 'hex' }],
    ['smb2.header_len', 'Header Length', 'uint16'],
    ['smb2.credit.charge', 'Credit Charge', 'uint16'],
    ['smb2.channel_sequence', 'Channel Sequence', 'uint16'],
    ['smb2.header_reserved', 'Reserved', 'bytes'],
    ['smb2.nt_status', 'NT Status', 'uint32', { base: 'hex', strings: NT_STATUS }],
    ['smb2.cmd', 'Command', 'uint16', { strings: CMD }],
    ['smb2.credits.requested', 'Credits requested', 'uint16'],
    ['smb2.credits.granted', 'Credits granted', 'uint16'],
    ['smb2.flags', 'Flags', 'uint32', { base: 'hex' }],
    ['smb2.flags.response', 'Response', 'bool', { mask: 0x1, bits: 32, tfs: ['This is a RESPONSE', 'This is a REQUEST'] }],
    ['smb2.flags.async', 'Async command', 'bool', { mask: 0x2, bits: 32, tfs: ['This is an ASYNC command', 'This is a SYNC command'] }],
    ['smb2.flags.chained', 'Chained', 'bool', { mask: 0x4, bits: 32, tfs: ['This pdu is a chained command', 'This pdu is NOT a chained command'] }],
    ['smb2.flags.signature', 'Signing', 'bool', { mask: 0x8, bits: 32, tfs: ['This pdu is signed', 'This pdu is NOT signed'] }],
    ['smb2.flags.dfs', 'DFS operation', 'bool', { mask: 0x10000000, bits: 32, tfs: ['This is a DFS OPERATION', 'This is a normal operation'] }],
    ['smb2.chain_offset', 'Chain Offset', 'uint32', { base: 'hex' }],
    ['smb2.msg_id', 'Message ID', 'uint64'],
    ['smb2.pid', 'Process Id', 'uint32', { base: 'hex' }],
    ['smb2.aid', 'Async Id', 'uint64', { base: 'hex' }],
    ['smb2.tid', 'Tree Id', 'uint32', { base: 'hex' }],
    ['smb2.sesid', 'Session Id', 'uint64', { base: 'hex' }],
    ['smb2.auth_frame', 'Authenticated in Frame', 'uint32'],
    ['smb2.signature', 'Signature', 'bytes'],
    ['smb2.response_in', 'Response in', 'framenum'],
    ['smb2.response_to', 'Response to', 'framenum'],
    ['smb2.time', 'Time to response', 'rel_time'],
    ['smb2.buffer_code', 'StructureSize', 'uint16', { base: 'hex' }],
    ['smb2.dialect_count', 'Dialect count', 'uint16'],
    ['smb2.dialect', 'Dialect', 'uint16', { base: 'hex', strings: DIALECTS }],
    ['smb2.sec_mode', 'Security mode', 'uint8', { base: 'hex' }],
    ['smb2.capabilities', 'Capabilities', 'uint32', { base: 'hex' }],
    ['smb2.client_guid', 'Client Guid', 'guid'],
    ['smb2.server_guid', 'Server Guid', 'guid'],
    ['smb2.max_trans_size', 'Max Transaction Size', 'uint32'],
    ['smb2.max_read_size', 'Max Read Size', 'uint32'],
    ['smb2.max_write_size', 'Max Write Size', 'uint32'],
    ['smb2.security_blob', 'Security Blob', 'bytes'],
    ['smb2.olb.offset', 'Blob Offset', 'uint32', { base: 'hex' }],
    ['smb2.olb.length', 'Blob Length', 'uint32'],
    ['smb2.previous_sesid', 'Previous Session Id', 'uint64', { base: 'hex' }],
    ['smb2.session_flags', 'Session Flags', 'uint16', { base: 'hex' }],
    ['smb2.tree', 'Tree', 'string'],
    ['smb2.share_type', 'Share Type', 'uint8', { base: 'hex', strings: SHARE_TYPE }],
    ['smb2.create.oplock', 'Oplock', 'uint8', { base: 'hex', strings: OPLOCK }],
    ['smb2.impersonation.level', 'Impersonation level', 'uint32', { strings: IMPERSONATION }],
    ['smb2.access_mask', 'Access Mask', 'uint32', { base: 'hex' }],
    ['smb2.file_attribute', 'File Attributes', 'uint32', { base: 'hex' }],
    ['smb2.share_access', 'Share Access', 'uint32', { base: 'hex' }],
    ['smb2.create.disposition', 'Disposition', 'uint32', { strings: DISPOSITION }],
    ['smb2.create_options', 'Create Options', 'uint32', { base: 'hex' }],
    ['smb2.create.action', 'Create Action', 'uint32', { strings: CREATE_ACTION }],
    ['smb2.filename', 'Filename', 'string'],
    ['smb2.fid', 'File Id', 'guid'],
    ['smb2.allocation_size', 'Allocation Size', 'uint64'],
    ['smb2.eof', 'End Of File', 'uint64'],
    ['smb2.read_length', 'Read Length', 'uint32'],
    ['smb2.file_offset', 'File Offset', 'uint64'],
    ['smb2.read_data', 'Read Data', 'bytes'],
    ['smb2.write_length', 'Write Length', 'uint32'],
    ['smb2.write.count', 'Write Count', 'uint32'],
    ['smb2.write_data', 'Write Data', 'bytes'],
    ['smb2.data_offset', 'Data Offset', 'uint16', { base: 'hex' }],
    ['smb2.close.flags', 'Close Flags', 'uint16', { base: 'hex' }],
    ['smb2.find.pattern', 'Search Pattern', 'string'],
    ['smb2.ioctl.function', 'Function', 'uint32', { base: 'hex' }],
    ['smb2.error.context_count', 'Error Context Count', 'uint8'],
    ['smb2.error.byte_count', 'Byte Count', 'uint32'],
    ['smb2.error.data', 'Error Data', 'bytes'],
  ],
  experts: [['smb2.status.error', 'note', 'Response Code', 'SMB2 error status']],
  dissect: dissectSmb2,
});

function guid(d, o) {
  const h = (i) => d[o + i].toString(16).padStart(2, '0');
  return h(3) + h(2) + h(1) + h(0) + '-' + h(5) + h(4) + '-' + h(7) + h(6) + '-' + h(8) + h(9) + '-' + h(10) + h(11) + h(12) + h(13) + h(14) + h(15);
}
function utf16(d, o, n) {
  let s = '';
  for (let i = 0; i + 1 < n; i += 2) s += String.fromCharCode(d[o + i] | (d[o + i + 1] << 8));
  return s;
}
function statusName(s) { return NT_STATUS[s] || `Unknown (${hexPad(s, 8)})`; }

function dissectSmb2(ctx, off, end) {
  const d = ctx.d;
  ctx.need(off, 64, end);
  if (u32(d, off) !== 0xfe534d42) return false;
  const status = u32le(d, off + 8), cmd = u16le(d, off + 12), flags = u32le(d, off + 16);
  const chain = u32le(d, off + 20);
  const msgId = u64le(d, off + 24);
  const resp = (flags & 1) !== 0, async = (flags & 2) !== 0;
  const tid = async ? 0 : u32le(d, off + 36);
  const sesid = u64le(d, off + 40);
  const pend = chain ? Math.min(end, off + chain) : end;
  const cname = CMD[cmd] || `Unknown command (${cmd})`;
  ctx.setProtocol('SMB2');
  // session state: request/response pairing, tree names, file names
  const st = ctx.session.st('smb2', () => ({ reqs: new Map(), trees: new Map(), files: new Map(), pendingTree: new Map(), pendingFile: new Map(), auth: new Map() }));
  const conn = ctx.tcpStream;
  const fd = ctx.fd;
  const key = `${conn}#${msgId}#${cmd}`;
  const b = off + 64;
  const fidAt = fidOffset(cmd, resp, status);
  if (ctx.first) {
    const m = (fd.smb2 ||= []);
    const rec = {};
    if (!resp) {
      st.reqs.set(key, { no: ctx.no, rel: fd.rel, rec });
      if (cmd === 3 && b + 8 <= pend) { const po = u16le(d, b + 4), pl = u16le(d, b + 6); if (off + po + pl <= pend) st.pendingTree.set(`${conn}#${msgId}`, utf16(d, off + po, pl)); }
      if (cmd === 5 && b + 48 <= pend) { const no = u16le(d, b + 44), nl = u16le(d, b + 46); if (off + no + nl <= pend) st.pendingFile.set(`${conn}#${msgId}`, utf16(d, off + no, nl)); }
    } else {
      const q = st.reqs.get(key);
      if (q) { rec.to = q.no; rec.time = fd.rel - q.rel; q.rec.in = ctx.no; q.rec.time = rec.time; }
      if (cmd === 3 && status === 0) { const n = st.pendingTree.get(`${conn}#${msgId}`); if (n !== undefined) st.trees.set(`${conn}#${tid}`, n); }
      if (cmd === 5 && status === 0 && b + 80 <= pend) {
        const g = guid(d, b + 64), n = st.pendingFile.get(`${conn}#${msgId}`);
        if (n !== undefined) st.files.set(`${conn}#${g}`, n);
        if (q) q.rec.fid = g; // the request shows the handle it produced
      }
      if (cmd === 1 && status === 0) st.auth.set(`${conn}#${sesid}`, ctx.no);
      if (cmd === 3) rec.tree = st.pendingTree.get(`${conn}#${msgId}`);
      if (cmd === 5) rec.file = st.pendingFile.get(`${conn}#${msgId}`);
    }
    if (cmd !== 3) rec.tree = rec.tree ?? st.trees.get(`${conn}#${tid}`);
    if (cmd === 3 && !resp) rec.tree = st.pendingTree.get(`${conn}#${msgId}`);
    if (cmd === 5 && !resp) rec.file = st.pendingFile.get(`${conn}#${msgId}`);
    if (fidAt >= 0 && b + fidAt + 16 <= pend) { rec.fid = guid(d, b + fidAt); rec.file = st.files.get(`${conn}#${rec.fid}`); }
    if (resp && status === 0 && rec.to && rec.file === undefined) {
      // responses name the file of their request
      const q = st.reqs.get(key);
      if (q && q.rec.fid) { rec.fid = q.rec.fid; rec.file = q.rec.file; }
    }
    if (cmd === 5 && resp && status !== 0) rec.file = undefined;
    rec.sesKey = `${conn}#${sesid}`;
    m.push(rec);
  }
  const idx = ctx.vars.smb2Idx = (ctx.vars.smb2Idx || 0) + 1;
  const rec = (fd.smb2 && fd.smb2[idx - 1]) || {};
  // Info like Wireshark: "Create Request, File: x", "Create Response, Error: STATUS_..."
  let info = `${cname} ${resp ? 'Response' : 'Request'}`;
  if (cmd === 8 && !resp && b + 16 <= pend) info += ` Len:${u32le(d, b + 4)} Off:${u64le(d, b + 8)}`;
  if (cmd === 9 && !resp && b + 16 <= pend) info += ` Len:${u32le(d, b + 4)} Off:${u64le(d, b + 8)}`;
  if (resp && status !== 0 && status !== 0x103 && !(cmd === 1 && status === 0xc0000016)) info += `, Error: ${statusName(status)}`;
  else if (cmd === 3 && rec.tree !== undefined) info += `, Tree: '${rec.tree}'`;
  else if (rec.file !== undefined) info += `, File: ${rec.file}`;
  ctx.pduInfo('smb2', info, '; ');
  const t = ctx.proto('smb2', off, pend - off,
    `SMB2 (Server Message Block Protocol version 2), ${resp && status ? statusName(status) + ', ' : ''}${cname} ${resp ? 'Response' : 'Request'}${idx > 1 ? '' : ''}, MessageId ${msgId}`);
  if (ctx.tree) {
    const h = ctx.text(t, 'SMB2 Header', off, 64);
    ctx.add(h, 'smb2.protocol_id', off, 4, 0xfe534d42);
    ctx.add(h, 'smb2.header_len', off + 4, 2, u16le(d, off + 4));
    ctx.add(h, 'smb2.credit.charge', off + 6, 2, u16le(d, off + 6));
    if (resp) ctx.add(h, 'smb2.nt_status', off + 8, 4, status, `NT Status: ${statusName(status)} (${hexPad(status, 8)})`);
    else {
      ctx.add(h, 'smb2.channel_sequence', off + 8, 2, u16le(d, off + 8));
      ctx.add(h, 'smb2.header_reserved', off + 10, 2, d.subarray(off + 10, off + 12));
    }
    ctx.add(h, 'smb2.cmd', off + 12, 2, cmd);
    ctx.add(h, resp ? 'smb2.credits.granted' : 'smb2.credits.requested', off + 14, 2, u16le(d, off + 14));
    const fn = ctx.add(h, 'smb2.flags', off + 16, 4, flags, `Flags: ${hexPad(flags, 8)}${resp ? ', Response' : ''}`);
    ctx.bits(fn, off + 16, 4, flags, ['smb2.flags.response', 'smb2.flags.async', 'smb2.flags.chained', 'smb2.flags.signature', 'smb2.flags.dfs']);
    ctx.add(h, 'smb2.chain_offset', off + 20, 4, chain);
    ctx.add(h, 'smb2.msg_id', off + 24, 8, msgId);
    if (async) ctx.add(h, 'smb2.aid', off + 32, 8, u64le(d, off + 32));
    else {
      ctx.add(h, 'smb2.pid', off + 32, 4, u32le(d, off + 32), `Reserved: ${hexPad(u32le(d, off + 32), 8)}`);
      const tn = ctx.add(h, 'smb2.tid', off + 36, 4, tid);
      if (rec.tree !== undefined && cmd !== 3) ctx.gen(tn, 'smb2.tree', rec.tree);
    }
    const sn = ctx.add(h, 'smb2.sesid', off + 40, 8, sesid);
    // looked up after the first pass, so earlier frames of the session show it too (as Wireshark does)
    const auth = st.auth.get(rec.sesKey);
    if (auth) ctx.gen(sn, 'smb2.auth_frame', auth, `Authenticated in Frame: ${auth}`);
    ctx.add(h, 'smb2.signature', off + 48, 16, d.subarray(off + 48, off + 64));
    if (rec.in) { ctx.gen(h, 'smb2.response_in', rec.in, `Response in: ${rec.in}`); ctx.gen(h, 'smb2.time', rec.time); }
    if (rec.to) { ctx.gen(h, 'smb2.response_to', rec.to, `Response to: ${rec.to}`); ctx.gen(h, 'smb2.time', rec.time, `Time from request: ${fmtMs(rec.time)}`); }
  }
  if (pend > b) {
    const bn = ctx.text(t, `${cname} ${resp ? 'Response' : 'Request'} (${hexPad(cmd, 2)})`, b, pend - b);
    body(ctx, bn, off, b, pend, cmd, resp, status, rec);
  }
  if (chain && off + chain < end) ctx.call('smb2', off + chain, end);
  return end - off;
}
function fmtMs(v) { return (v * 1e3).toFixed(6) + ' milliseconds'; }

/** Offset of the FileId within a command body (or -1). */
function fidOffset(cmd, resp, status) {
  if (resp && status !== 0) return -1;
  switch (cmd) {
    case 6: return resp ? -1 : 8;
    case 8: return resp ? -1 : 16;
    case 9: return resp ? -1 : 16;
    case 14: return resp ? -1 : 8;
    case 11: return resp ? 8 : 8;
    case 16: case 17: return resp ? -1 : 24;
    case 7: return resp ? -1 : 8;
    default: return -1;
  }
}

function body(ctx, t, base, b, end, cmd, resp, status, rec) {
  const d = ctx.d;
  if (!ctx.tree && !(cmd === 8 && resp) && !(cmd === 9 && !resp)) return;
  ctx.need(b, 2, end);
  const ss = u16le(d, b);
  ctx.add(t, 'smb2.buffer_code', b, 2, ss);
  if (resp && status !== 0 && ss === 9 && !(cmd === 1 && status === 0xc0000016)) {
    ctx.add(t, 'smb2.error.context_count', b + 2, 1, d[b + 2]);
    ctx.add(t, 'smb2.error.byte_count', b + 4, 4, u32le(d, b + 4));
    if (end > b + 8) ctx.add(t, 'smb2.error.data', b + 8, end - b - 8, d.subarray(b + 8, end));
    return;
  }
  const blob = (offAt, lenAt, abbrev) => {
    const o = u16le(d, b + offAt), l = lenAt >= 0 ? u16le(d, b + lenAt) : 0;
    ctx.add(t, 'smb2.olb.offset', b + offAt, 2, o);
    ctx.add(t, 'smb2.olb.length', b + lenAt, 2, l);
    if (l && base + o + l <= end) ctx.add(t, abbrev, base + o, l, d.subarray(base + o, base + o + l));
  };
  switch (cmd) {
    case 0: // NEGOTIATE
      if (!resp) {
        ctx.need(b, 36, end);
        const n = u16le(d, b + 2);
        ctx.add(t, 'smb2.dialect_count', b + 2, 2, n);
        ctx.add(t, 'smb2.sec_mode', b + 4, 1, d[b + 4]);
        ctx.add(t, 'smb2.capabilities', b + 8, 4, u32le(d, b + 8));
        ctx.add(t, 'smb2.client_guid', b + 12, 16, guid(d, b + 12));
        for (let i = 0; i < n && b + 36 + 2 * i + 2 <= end; i++) ctx.add(t, 'smb2.dialect', b + 36 + 2 * i, 2, u16le(d, b + 36 + 2 * i));
      } else {
        ctx.need(b, 64, end);
        ctx.add(t, 'smb2.sec_mode', b + 2, 1, d[b + 2]);
        ctx.add(t, 'smb2.dialect', b + 4, 2, u16le(d, b + 4));
        ctx.add(t, 'smb2.server_guid', b + 8, 16, guid(d, b + 8));
        ctx.add(t, 'smb2.capabilities', b + 24, 4, u32le(d, b + 24));
        ctx.add(t, 'smb2.max_trans_size', b + 28, 4, u32le(d, b + 28));
        ctx.add(t, 'smb2.max_read_size', b + 32, 4, u32le(d, b + 32));
        ctx.add(t, 'smb2.max_write_size', b + 36, 4, u32le(d, b + 36));
        blob(56, 58, 'smb2.security_blob');
      }
      return;
    case 1: // SESSION_SETUP
      if (!resp) { ctx.need(b, 24, end); ctx.add(t, 'smb2.sec_mode', b + 3, 1, d[b + 3]); ctx.add(t, 'smb2.capabilities', b + 4, 4, u32le(d, b + 4)); blob(12, 14, 'smb2.security_blob'); ctx.add(t, 'smb2.previous_sesid', b + 16, 8, u64le(d, b + 16)); }
      else { ctx.need(b, 8, end); ctx.add(t, 'smb2.session_flags', b + 2, 2, u16le(d, b + 2)); blob(4, 6, 'smb2.security_blob'); }
      return;
    case 3: // TREE_CONNECT
      if (!resp) {
        ctx.need(b, 8, end);
        const po = u16le(d, b + 4), pl = u16le(d, b + 6);
        ctx.add(t, 'smb2.olb.offset', b + 4, 2, po);
        ctx.add(t, 'smb2.olb.length', b + 6, 2, pl);
        if (base + po + pl <= end) ctx.add(t, 'smb2.tree', base + po, pl, utf16(d, base + po, pl));
      } else {
        ctx.need(b, 16, end);
        ctx.add(t, 'smb2.share_type', b + 2, 1, d[b + 2]);
        if (rec.tree !== undefined) ctx.gen(t, 'smb2.tree', rec.tree);
      }
      return;
    case 5: // CREATE
      if (!resp) {
        ctx.need(b, 56, end);
        ctx.add(t, 'smb2.create.oplock', b + 3, 1, d[b + 3]);
        ctx.add(t, 'smb2.impersonation.level', b + 4, 4, u32le(d, b + 4));
        ctx.add(t, 'smb2.access_mask', b + 24, 4, u32le(d, b + 24));
        ctx.add(t, 'smb2.file_attribute', b + 28, 4, u32le(d, b + 28));
        ctx.add(t, 'smb2.share_access', b + 32, 4, u32le(d, b + 32));
        ctx.add(t, 'smb2.create.disposition', b + 36, 4, u32le(d, b + 36));
        ctx.add(t, 'smb2.create_options', b + 40, 4, u32le(d, b + 40));
        const no = u16le(d, b + 44), nl = u16le(d, b + 46);
        if (rec.fid) ctx.gen(t, 'smb2.fid', rec.fid);
        if (base + no + nl <= end) ctx.add(t, 'smb2.filename', base + no, nl, utf16(d, base + no, nl));
      } else {
        ctx.need(b, 88, end);
        ctx.add(t, 'smb2.create.oplock', b + 2, 1, d[b + 2]);
        ctx.add(t, 'smb2.create.action', b + 4, 4, u32le(d, b + 4));
        ctx.add(t, 'smb2.allocation_size', b + 40, 8, u64le(d, b + 40));
        ctx.add(t, 'smb2.eof', b + 48, 8, u64le(d, b + 48));
        ctx.add(t, 'smb2.file_attribute', b + 56, 4, u32le(d, b + 56));
        const f = ctx.add(t, 'smb2.fid', b + 64, 16, guid(d, b + 64), `GUID handle${rec.file !== undefined ? ', File: ' + rec.file : ''}`);
        if (rec.file !== undefined) ctx.gen(f, 'smb2.filename', rec.file);
      }
      return;
    case 6: case 7: // CLOSE / FLUSH
      if (!resp) { ctx.need(b, 24, end); if (cmd === 6) ctx.add(t, 'smb2.close.flags', b + 2, 2, u16le(d, b + 2)); fidItem(ctx, t, b + 8, rec); }
      else if (cmd === 6) { ctx.need(b, 60, end); ctx.add(t, 'smb2.close.flags', b + 2, 2, u16le(d, b + 2)); respFile(ctx, t, rec); ctx.add(t, 'smb2.allocation_size', b + 40, 8, u64le(d, b + 40)); ctx.add(t, 'smb2.eof', b + 48, 8, u64le(d, b + 48)); ctx.add(t, 'smb2.file_attribute', b + 56, 4, u32le(d, b + 56)); }
      return;
    case 8: // READ
      if (!resp) {
        ctx.need(b, 48, end);
        ctx.add(t, 'smb2.read_length', b + 4, 4, u32le(d, b + 4));
        ctx.add(t, 'smb2.file_offset', b + 8, 8, u64le(d, b + 8));
        fidItem(ctx, t, b + 16, rec);
      } else {
        ctx.need(b, 16, end);
        const doff = d[b + 2], len = u32le(d, b + 4);
        respFile(ctx, t, rec);
        ctx.add(t, 'smb2.olb.offset', b + 2, 1, doff);
        ctx.add(t, 'smb2.olb.length', b + 4, 4, len);
        const s = base + doff, e = Math.min(end, s + len);
        if (e > s) { ctx.add(t, 'smb2.read_data', s, e - s, d.subarray(s, e)); ctx.data(s, e); }
      }
      return;
    case 9: // WRITE
      if (!resp) {
        ctx.need(b, 48, end);
        const doff = u16le(d, b + 2), len = u32le(d, b + 4);
        ctx.add(t, 'smb2.data_offset', b + 2, 2, doff);
        ctx.add(t, 'smb2.write_length', b + 4, 4, len);
        ctx.add(t, 'smb2.file_offset', b + 8, 8, u64le(d, b + 8));
        fidItem(ctx, t, b + 16, rec);
        const s = base + doff, e = Math.min(end, s + len);
        if (e > s) { ctx.add(t, 'smb2.write_data', s, e - s, d.subarray(s, e)); ctx.data(s, e); }
      } else {
        ctx.need(b, 8, end);
        ctx.add(t, 'smb2.write.count', b + 4, 4, u32le(d, b + 4));
        respFile(ctx, t, rec);
      }
      return;
    case 14: // QUERY_DIRECTORY
      if (!resp) {
        ctx.need(b, 32, end);
        fidItem(ctx, t, b + 8, rec);
        const po = u16le(d, b + 24), pl = u16le(d, b + 26);
        if (base + po + pl <= end) ctx.add(t, 'smb2.find.pattern', base + po, pl, utf16(d, base + po, pl));
      }
      return;
    case 11: // IOCTL
      ctx.need(b, 24, end);
      ctx.add(t, 'smb2.ioctl.function', b + 4, 4, u32le(d, b + 4));
      fidItem(ctx, t, b + 8, rec);
      return;
    default:
      return;
  }
}
/** Generated Filename + File Id on responses whose body has no handle. */
function respFile(ctx, t, rec) {
  if (rec.file === undefined) return;
  const f = ctx.gen(t, 'smb2.filename', rec.file);
  if (rec.fid) ctx.gen(f, 'smb2.fid', rec.fid);
}
function fidItem(ctx, t, o, rec) {
  const f = ctx.add(t, 'smb2.fid', o, 16, guid(ctx.d, o), `GUID handle${rec.file !== undefined ? ', File: ' + rec.file : ''}`);
  if (rec.file !== undefined) ctx.gen(f, 'smb2.filename', rec.file);
}

// ---------------------------------------------------------------------------------------------
// SMB1: header only (command name in Info)
const SMB1_CMD = { 0x72: 'Negotiate Protocol', 0x73: 'Session Setup AndX', 0x75: 'Tree Connect AndX', 0x71: 'Tree Disconnect', 0xa2: 'NT Create AndX', 0x04: 'Close', 0x2e: 'Read AndX', 0x2f: 'Write AndX', 0x25: 'Trans', 0x32: 'Trans2', 0xa0: 'NT Trans', 0x74: 'Logoff AndX', 0x2b: 'Echo' };
registerProtocol({
  abbrev: 'smb', name: 'SMB (Server Message Block Protocol)', short: 'SMB',
  fields: [
    ['smb.server_component', 'Server Component', 'bytes'],
    ['smb.cmd', 'SMB Command', 'uint8', { base: 'hex', strings: SMB1_CMD }],
    ['smb.nt_status', 'NT Status', 'uint32', { base: 'hex', strings: NT_STATUS }],
    ['smb.flags.response', 'Request/Response', 'bool', { mask: 0x80, bits: 8, tfs: ['Message is a response to the client/redirector', 'Message is a request to the server'] }],
    ['smb.tid', 'Tree ID', 'uint16'],
    ['smb.pid', 'Process ID', 'uint16'],
    ['smb.uid', 'User ID', 'uint16'],
    ['smb.mid', 'Multiplex ID', 'uint16'],
  ],
  dissect(ctx, off, end) {
    const d = ctx.d;
    ctx.need(off, 32, end);
    const cmd = d[off + 4], status = u32le(d, off + 5), resp = (d[off + 9] & 0x80) !== 0;
    const name = SMB1_CMD[cmd] || `Unknown (0x${cmd.toString(16).padStart(2, '0')})`;
    ctx.setProtocol('SMB');
    // Wireshark 4.6 appends to the NBSS column text here
    ctx.setInfo(`${ctx.info ? ctx.info + '; ' : ''}${name}${resp ? ' Response' : ''}${resp && status ? `, Error: ${statusName(status)}` : ''}`);
    const t = ctx.proto('smb', off, end - off, 'SMB (Server Message Block Protocol)');
    if (ctx.tree) {
      const h = ctx.text(t, 'SMB Header', off, 32);
      ctx.add(h, 'smb.server_component', off, 4, d.subarray(off, off + 4), 'Server Component: SMB');
      ctx.add(h, 'smb.cmd', off + 4, 1, cmd);
      ctx.add(h, 'smb.nt_status', off + 5, 4, status, `NT Status: ${statusName(status)} (${hexPad(status, 8)})`);
      ctx.add(h, 'smb.flags.response', off + 9, 1, resp);
      ctx.add(h, 'smb.tid', off + 24, 2, u16le(d, off + 24));
      ctx.add(h, 'smb.pid', off + 26, 2, u16le(d, off + 26));
      ctx.add(h, 'smb.uid', off + 28, 2, u16le(d, off + 28));
      ctx.add(h, 'smb.mid', off + 30, 2, u16le(d, off + 30));
      if (end > off + 32) ctx.text(t, `Parameters and data (${end - off - 32} bytes): ${hexStr(d, off + 32, Math.min(16, end - off - 32))}${end - off - 32 > 16 ? '…' : ''}`, off + 32, end - off - 32);
    }
    return end - off;
  },
});
