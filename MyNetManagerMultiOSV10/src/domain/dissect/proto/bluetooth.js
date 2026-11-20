// Bluetooth on the host's HCI: LINKTYPE_BLUETOOTH_HCI_H4 (187) and ..._H4_WITH_PHDR (201) → H4 packet type →
// HCI Command / Event / ACL → L2CAP → ATT (with the GATT database Wireshark builds from discovery, so handles
// read "(Heart Rate: Heart Rate Measurement)"). Field names, column texts and value names follow Wireshark 4.6
// (packet-hci_h4.c, packet-bthci_cmd.c / _evt.c / _acl.c, packet-btl2cap.c, packet-btatt.c, packet-btcommon.c).
import { registerProtocol, u16le } from '../core.js';

const hex4 = (v) => `0x${v.toString(16).padStart(4, '0')}`;
const hex2 = (v) => `0x${v.toString(16).padStart(2, '0')}`;
/** A BD_ADDR (6 bytes, little-endian on the air) as aa:bb:cc:dd:ee:ff. */
const bdaddr = (d, o) => Array.from(d.subarray(o, o + 6)).reverse().map((b) => b.toString(16).padStart(2, '0')).join(':');

// ───────────────────────── value names

export const OGF = { 0x01: 'Link Control Commands', 0x02: 'Link Policy Commands', 0x03: 'Host Controller & Baseband Commands', 0x04: 'Informational Parameters', 0x05: 'Status Parameters', 0x06: 'Testing Commands', 0x08: 'LE Controller Commands', 0x3f: 'Vendor-Specific Commands' };
/** opcode → command name (Wireshark's bthci_cmd_opcode_vals). */
export const COMMANDS = {
  0x0401: 'Inquiry', 0x0402: 'Inquiry Cancel', 0x0405: 'Create Connection', 0x0406: 'Disconnect', 0x0408: 'Create Connection Cancel',
  0x0409: 'Accept Connection Request', 0x040b: 'Link Key Request Reply', 0x0411: 'Authentication Requested', 0x0413: 'Set Connection Encryption',
  0x0419: 'Remote Name Request', 0x041b: 'Read Remote Supported Features', 0x041d: 'Read Remote Version Information',
  0x0c01: 'Set Event Mask', 0x0c03: 'Reset', 0x0c05: 'Set Event Filter', 0x0c13: 'Change Local Name', 0x0c14: 'Read Local Name',
  0x0c1a: 'Write Scan Enable', 0x0c24: 'Write Class of Device', 0x0c45: 'Write Inquiry Mode', 0x0c52: 'Write Extended Inquiry Response',
  0x0c56: 'Write Simple Pairing Mode', 0x0c6d: 'Write LE Host Supported',
  0x1001: 'Read Local Version Information', 0x1002: 'Read Local Supported Commands', 0x1003: 'Read Local Supported Features',
  0x1005: 'Read Buffer Size', 0x1009: 'Read BD ADDR',
  0x1405: 'Read RSSI',
  0x2001: 'LE Set Event Mask', 0x2002: 'LE Read Buffer Size', 0x2003: 'LE Read Local Supported Features', 0x2005: 'LE Set Random Address',
  0x2006: 'LE Set Advertising Parameters', 0x2008: 'LE Set Advertising Data', 0x2009: 'LE Set Scan Response Data', 0x200a: 'LE Set Advertise Enable',
  0x200b: 'LE Set Scan Parameters', 0x200c: 'LE Set Scan Enable', 0x200d: 'LE Create Connection', 0x200e: 'LE Create Connection Cancel',
  0x200f: 'LE Read Filter Accept List Size', 0x2010: 'LE Clear Filter Accept List', 0x2011: 'LE Add Device to Filter Accept List',
  0x2013: 'LE Connection Update', 0x2016: 'LE Read Remote Features', 0x2018: 'LE Rand', 0x2019: 'LE Enable Encryption',
  0x2041: 'LE Set Extended Scan Parameters', 0x2042: 'LE Set Extended Scan Enable', 0x2043: 'LE Extended Create Connection',
};
export const EVENTS = {
  0x01: 'Inquiry Complete', 0x02: 'Inquiry Result', 0x03: 'Connect Complete', 0x04: 'Connect Request', 0x05: 'Disconnect Complete',
  0x06: 'Auth Complete', 0x07: 'Remote Name Req Complete', 0x08: 'Encrypt Change', 0x0b: 'Read Remote Supported Features',
  0x0c: 'Read Remote Ver Info Complete', 0x0e: 'Command Complete', 0x0f: 'Command Status', 0x10: 'Hardware Error', 0x13: 'Number of Completed Packets',
  0x22: 'Inquiry Result With RSSI', 0x2f: 'Extended Inquiry Result', 0x3e: 'LE Meta', 0xff: 'Vendor-Specific',
};
export const LE_SUBEVENTS = {
  0x01: 'LE Connection Complete', 0x02: 'LE Advertising Report', 0x03: 'LE Connection Update Complete', 0x04: 'LE Read Remote Features Complete',
  0x05: 'LE Long Term Key Request', 0x07: 'LE Data Length Change', 0x0a: 'LE Enhanced Connection Complete', 0x0c: 'LE PHY Update Complete',
  0x0d: 'LE Extended Advertising Report',
};
export const STATUS = {
  0x00: 'Success', 0x01: 'Unknown HCI Command', 0x02: 'Unknown Connection Identifier', 0x05: 'Authentication Failure', 0x06: 'PIN or Key Missing',
  0x07: 'Memory Capacity Exceeded', 0x08: 'Connection Timeout', 0x0c: 'Command Disallowed', 0x12: 'Invalid HCI Command Parameters',
  0x13: 'Remote User Terminated Connection', 0x14: 'Remote Device Terminated Connection due to Low Resources',
  0x15: 'Remote Device Terminated Connection due to Power Off', 0x16: 'Connection Terminated by Local Host', 0x1a: 'Unsupported Remote Feature',
  0x1f: 'Unspecified Error', 0x22: 'LL Response Timeout', 0x28: 'Instant Passed', 0x3b: 'Unacceptable Connection Parameters',
  0x3d: 'Connection Terminated due to MIC Failure', 0x3e: 'Connection Failed to be Established',
};
export const COMPANIES = { 0x0002: 'Intel Corp.', 0x0006: 'Microsoft', 0x000a: 'Qualcomm Technologies International, Ltd. (QTIL)', 0x000d: 'Texas Instruments Inc.', 0x000f: 'Broadcom Corporation', 0x001d: 'Qualcomm', 0x004c: 'Apple, Inc.', 0x0059: 'Nordic Semiconductor ASA', 0x005d: 'Realtek Semiconductor Corporation', 0x0075: 'Samsung Electronics Co. Ltd.', 0x00e0: 'Google' };
export const VERSIONS = { 0: '1.0b', 1: '1.1', 2: '1.2', 3: '2.0 + EDR', 4: '2.1 + EDR', 5: '3.0 + HS', 6: '4.0', 7: '4.1', 8: '4.2', 9: '5.0', 10: '5.1', 11: '5.2', 12: '5.3', 13: '5.4', 14: '6.0' };
const AD_TYPES = {
  0x01: 'Flags', 0x02: 'Incomplete List of 16-bit Service Class UUIDs', 0x03: '16-bit Service Class UUIDs', 0x06: 'Incomplete List of 128-bit Service Class UUIDs',
  0x07: '128-bit Service Class UUIDs', 0x08: 'Device Name (shortened)', 0x09: 'Device Name', 0x0a: 'Tx Power Level', 0x16: 'Service Data - 16 bit UUID',
  0x19: 'Appearance', 0xff: 'Manufacturer Specific',
};
const ADV_EVENT = { 0: 'Connectable Undirected Advertising', 1: 'Connectable Directed Advertising', 2: 'Scannable Undirected Advertising', 3: 'Non-Connectable Undirected Advertising', 4: 'Scan Response' };
const ADDR_TYPE = { 0: 'Public Device Address', 1: 'Random Device Address', 2: 'Public Identity Address', 3: 'Random (Static) Identity Address' };
export const ATT_OPCODES = {
  0x01: 'Error Response', 0x02: 'Exchange MTU Request', 0x03: 'Exchange MTU Response', 0x04: 'Find Information Request', 0x05: 'Find Information Response',
  0x06: 'Find By Type Value Request', 0x07: 'Find By Type Value Response', 0x08: 'Read By Type Request', 0x09: 'Read By Type Response',
  0x0a: 'Read Request', 0x0b: 'Read Response', 0x0c: 'Read Blob Request', 0x0d: 'Read Blob Response', 0x0e: 'Read Multiple Request',
  0x0f: 'Read Multiple Response', 0x10: 'Read By Group Type Request', 0x11: 'Read By Group Type Response', 0x12: 'Write Request',
  0x13: 'Write Response', 0x16: 'Prepare Write Request', 0x17: 'Prepare Write Response', 0x18: 'Execute Write Request', 0x19: 'Execute Write Response',
  0x1b: 'Handle Value Notification', 0x1d: 'Handle Value Indication', 0x1e: 'Handle Value Confirmation', 0x52: 'Write Command', 0xd2: 'Signed Write Command',
};
const ATT_ERRORS = {
  0x01: 'Invalid Handle', 0x02: 'Read Not Permitted', 0x03: 'Write Not Permitted', 0x04: 'Invalid PDU', 0x05: 'Insufficient Authentication',
  0x06: 'Request Not Supported', 0x07: 'Invalid Offset', 0x08: 'Insufficient Authorization', 0x09: 'Prepare Queue Full', 0x0a: 'Attribute Not Found',
  0x0b: 'Attribute Not Long', 0x0c: 'Insufficient Encryption Key Size', 0x0d: 'Invalid Attribute Value Length', 0x0e: 'Unlikely Error',
  0x0f: 'Insufficient Encryption', 0x10: 'Unsupported Group Type', 0x11: 'Insufficient Resources',
};
/** 16-bit UUIDs (Bluetooth SIG assigned numbers) as Wireshark names them. */
export const UUIDS = {
  0x1800: 'GAP', 0x1801: 'GATT', 0x180a: 'Device Information', 0x180d: 'Heart Rate', 0x180f: 'Battery', 0x1810: 'Blood Pressure', 0x1812: 'Human Interface Device',
  0x1816: 'Cycling Speed and Cadence', 0x181a: 'Environmental Sensing', 0x181c: 'User Data', 0x1809: 'Health Thermometer', 0x1805: 'Current Time',
  0x2800: 'Primary Service', 0x2801: 'Secondary Service', 0x2802: 'Include', 0x2803: 'Characteristic',
  0x2900: 'Characteristic Extended Properties', 0x2901: 'Characteristic User Description', 0x2902: 'Client Characteristic Configuration',
  0x2903: 'Server Characteristic Configuration', 0x2904: 'Characteristic Presentation Format',
  0x2a00: 'Device Name', 0x2a01: 'Appearance', 0x2a04: 'Peripheral Preferred Connection Parameters', 0x2a05: 'Service Changed', 0x2a19: 'Battery Level',
  0x2a23: 'System ID', 0x2a24: 'Model Number String', 0x2a25: 'Serial Number String', 0x2a26: 'Firmware Revision String', 0x2a27: 'Hardware Revision String',
  0x2a28: 'Software Revision String', 0x2a29: 'Manufacturer Name String', 0x2a37: 'Heart Rate Measurement', 0x2a38: 'Body Sensor Location',
  0x2a39: 'Heart Rate Control Point', 0x2a1c: 'Temperature Measurement', 0x2a6e: 'Temperature', 0x2a6f: 'Humidity', 0x2b29: 'Client Supported Features',
  0x2b2a: 'Database Hash',
};
const uuidName = (u) => UUIDS[u] ?? `Unknown (0x${u.toString(16).padStart(4, '0')})`;
const L2CAP_CIDS = { 0x0001: 'L2CAP Signaling Channel', 0x0002: 'Connectionless Channel', 0x0004: 'Attribute Protocol', 0x0005: 'Low Energy L2CAP Signaling Channel', 0x0006: 'Security Manager Protocol' };

// ───────────────────────── session state

function btState(ctx) {
  return ctx.session.st('bluetooth', () => ({
    pendingCmd: new Map(), // opcode → command frame (waiting for its Command Complete / Status)
    cmdResp: new Map(),    // command frame → { response, status }
    respCmd: new Map(),    // response frame → command frame
    local: null,           // the adapter's BD_ADDR (Read BD ADDR)
    names: new Map(),      // BD_ADDR → device name (advertising data, Remote Name Request)
    conns: new Map(),      // connection handle → { peer, connect, disconnect, connectCmd }
    connByFrame: new Map(),
    gatt: { services: [], chars: [], attrs: new Map() }, // discovery results (ATT)
    attReq: new Map(),     // 'handle:dir' pending request → frame; frame → request info
    reqOf: new Map(),      // response frame → { frame, opcode, handle, uuid }
    respOf: new Map(),     // request frame → response frame
  }));
}

/** "(Service: Characteristic: Descriptor)" for an ATT handle, as Wireshark builds it from the discovered database. */
export function handleName(gatt, handle) {
  const svc = [...gatt.services].reverse().find((s) => s.start <= handle);
  if (!svc) return 'Unknown';
  const sname = UUIDS[svc.uuid] ?? hex4(svc.uuid);
  if (handle === svc.start) return sname;
  const chr = [...gatt.chars].reverse().find((c) => c.value <= handle && c.value >= svc.start && c.decl >= svc.start);
  const desc = gatt.attrs.get(handle);
  if (chr && handle === chr.value) return `${sname}: ${UUIDS[chr.uuid] ?? hex4(chr.uuid)}`;
  if (chr && desc != null && !gatt.chars.some((c) => c.decl === handle)) return `${sname}: ${UUIDS[chr.uuid] ?? hex4(chr.uuid)}: ${UUIDS[desc] ?? hex4(desc)}`;
  return `${sname}: Unknown`;
}

// ───────────────────────── H4

function dissectBluetooth(ctx, off, end) {
  const d = ctx.d;
  let o = off;
  // LINKTYPE 201: the reader took the 4-byte direction pseudo-header off (frame.p2pDir), as Wireshark does.
  const dir = ctx.frame.p2pDir !== undefined ? (ctx.frame.p2pDir ? 1 : 0) : null;
  const top = ctx.proto('bluetooth', off, end - off, 'Bluetooth');
  const h4 = ctx.proto('hci_h4', o, Math.min(1, end - o), 'Bluetooth HCI H4');
  if (dir != null) ctx.gen(h4, 'hci_h4.direction', dir);
  ctx.need(o, 1, end);
  const type = d[o];
  ctx.add(h4, 'hci_h4.type', o, 1, type);
  ctx.vars.btDir = dir ?? (type === 1 ? 0 : type === 4 ? 1 : 0);
  ctx.vars.btTop = top;
  ctx.setInfo('');
  const prefix = ctx.vars.btDir ? 'Rcvd ' : 'Sent ';
  ctx.vars.btPrefix = prefix;
  o += 1;
  switch (type) {
    case 1: setEnds(ctx, top, 'host', 'controller'); return hciCommand(ctx, o, end) + (o - off);
    case 4: setEnds(ctx, top, 'controller', 'host'); return hciEvent(ctx, o, end) + (o - off);
    case 2: return hciAcl(ctx, o, end) + (o - off);
    default:
      ctx.setProtocol('HCI_H4');
      ctx.setInfo(`${prefix}${type === 3 ? 'SCO Data' : 'Unknown'}`);
      ctx.data(o, end);
      return end - off;
  }
}

function setEnds(ctx, top, src, dst) {
  ctx.setHw(src, dst);
  ctx.gen(top, 'bluetooth.src_str', src, `[Source: ${src}]`);
  ctx.gen(top, 'bluetooth.dst_str', dst, `[Destination: ${dst}]`);
  ctx.hidden(top, 'bluetooth.addr_str', 0, 0, src);
  ctx.hidden(top, 'bluetooth.addr_str', 0, 0, dst);
}

// ───────────────────────── HCI commands

function hciCommand(ctx, o, end) {
  const d = ctx.d;
  ctx.need(o, 3, end);
  const opcode = u16le(d, o);
  const plen = d[o + 2];
  const name = COMMANDS[opcode] ?? (opcode >> 10 === 0x3f ? 'Vendor Command' : `Unknown 0x${opcode.toString(16).padStart(4, '0')}`);
  ctx.setProtocol('HCI_CMD');
  const t = ctx.proto('bthci_cmd', o, end - o, `Bluetooth HCI Command - ${name}`);
  const on = ctx.add(t, 'bthci_cmd.opcode', o, 2, opcode, `Command Opcode: ${name} (${hex4(opcode)})`);
  ctx.add(on, 'bthci_cmd.opcode.ogf', o, 2, opcode >> 10);
  ctx.add(on, 'bthci_cmd.opcode.ocf', o, 2, opcode & 0x3ff);
  ctx.add(t, 'bthci_cmd.param_length', o + 2, 1, plen);
  const p = o + 3;
  const st = btState(ctx);
  if (ctx.first) st.pendingCmd.set(opcode, ctx.no);
  // A few parameters worth showing (and filtering on).
  switch (opcode) {
    case 0x0406: ctx.add(t, 'bthci_cmd.connection_handle', p, 2, u16le(d, p) & 0x0fff); ctx.add(t, 'bthci_cmd.reason', p + 2, 1, d[p + 2]); break;
    case 0x0c13: { let n = 0; while (n < plen && d[p + n]) n++; ctx.add(t, 'bthci_cmd.device_name', p, plen, new TextDecoder().decode(d.subarray(p, p + n))); break; }
    case 0x200b: ctx.add(t, 'bthci_cmd.le_scan_type', p, 1, d[p]); break;
    case 0x200c: ctx.add(t, 'bthci_cmd.le_scan_enable', p, 1, d[p]); break;
    case 0x200d: if (plen >= 12) { ctx.add(t, 'bthci_cmd.le_peer_address_type', p + 5, 1, d[p + 5]); ctx.add(t, 'bthci_cmd.bd_addr', p + 6, 6, bdaddr(d, p + 6)); if (ctx.first) st.lastCreate = { frame: ctx.no, peer: bdaddr(d, p + 6) }; } break;
    case 0x0405: case 0x0419: if (plen >= 6) ctx.add(t, 'bthci_cmd.bd_addr', p, 6, bdaddr(d, p)); break;
    default: break;
  }
  const resp = st.cmdResp.get(ctx.no);
  if (resp) ctx.gen(t, 'bthci_cmd.response_in_frame', resp.frame);
  ctx.setInfo(`${ctx.vars.btPrefix}${name}`);
  return end - o;
}

// ───────────────────────── HCI events

function hciEvent(ctx, o, end) {
  const d = ctx.d;
  ctx.need(o, 2, end);
  const code = d[o];
  const plen = d[o + 1];
  const name = EVENTS[code] ?? `Unknown 0x${code.toString(16).padStart(2, '0')}`;
  ctx.setProtocol('HCI_EVT');
  const t = ctx.proto('bthci_evt', o, end - o, `Bluetooth HCI Event - ${name}`);
  ctx.add(t, 'bthci_evt.code', o, 1, code);
  ctx.add(t, 'bthci_evt.param_length', o + 1, 1, plen);
  const p = o + 2;
  const st = btState(ctx);
  let info = name;
  const cmdLink = (opcode, status) => {
    if (ctx.first) {
      const cmdFrame = st.pendingCmd.get(opcode);
      if (cmdFrame != null) { st.respCmd.set(ctx.no, cmdFrame); if (!st.cmdResp.has(cmdFrame) || code === 0x0e) st.cmdResp.set(cmdFrame, { frame: ctx.no, status }); }
    }
    const cmdFrame = st.respCmd.get(ctx.no);
    if (cmdFrame != null) ctx.gen(t, 'bthci_evt.command_in_frame', cmdFrame);
  };
  switch (code) {
    case 0x0e: { // Command Complete
      const opcode = u16le(d, p + 1);
      const cname = COMMANDS[opcode] ?? `Unknown 0x${opcode.toString(16).padStart(4, '0')}`;
      ctx.add(t, 'bthci_evt.num_command_packets', p, 1, d[p]);
      ctx.add(t, 'bthci_evt.opcode', p + 1, 2, opcode, `Command Opcode: ${cname} (${hex4(opcode)})`);
      info = `${name} (${cname})`;
      const r = p + 3;
      if (plen > 3) ctx.add(t, 'bthci_evt.status', r, 1, d[r]);
      if (opcode === 0x1009 && plen >= 10) {
        const addr = bdaddr(d, r + 1);
        ctx.add(t, 'bthci_evt.bd_addr', r + 1, 6, addr);
        if (ctx.first) st.local = addr;
      } else if (opcode === 0x1001 && plen >= 12) {
        ctx.add(t, 'bthci_evt.hci_vers_nr', r + 1, 1, d[r + 1]);
        ctx.add(t, 'bthci_evt.hci_revision', r + 2, 2, u16le(d, r + 2));
        ctx.add(t, 'bthci_evt.lmp_vers_nr', r + 4, 1, d[r + 4]);
        ctx.add(t, 'bthci_evt.comp_id', r + 5, 2, u16le(d, r + 5));
        ctx.add(t, 'bthci_evt.lmp_sub_vers_nr', r + 7, 2, u16le(d, r + 7));
        if (ctx.first) st.localVersion = { hci: d[r + 1], hciRev: u16le(d, r + 2), lmp: d[r + 4], company: u16le(d, r + 5), lmpSub: u16le(d, r + 7) };
      }
      cmdLink(opcode, d[r]);
      break;
    }
    case 0x0f: { // Command Status
      const opcode = u16le(d, p + 2);
      const cname = COMMANDS[opcode] ?? `Unknown 0x${opcode.toString(16).padStart(4, '0')}`;
      ctx.add(t, 'bthci_evt.status', p, 1, d[p]);
      ctx.add(t, 'bthci_evt.num_command_packets', p + 1, 1, d[p + 1]);
      ctx.add(t, 'bthci_evt.opcode', p + 2, 2, opcode, `Command Opcode: ${cname} (${hex4(opcode)})`);
      info = `${name} (${cname})`;
      cmdLink(opcode, d[p]);
      break;
    }
    case 0x13: { // Number of Completed Packets
      const n = d[p];
      ctx.add(t, 'bthci_evt.num_handles', p, 1, n);
      for (let i = 0; i < n; i++) {
        ctx.add(t, 'bthci_evt.connection_handle', p + 1 + i * 4, 2, u16le(d, p + 1 + i * 4) & 0x0fff, `Connection Handle: ${hex4(u16le(d, p + 1 + i * 4) & 0x0fff)}`);
        ctx.add(t, 'bthci_evt.num_compl_packets', p + 3 + i * 4, 2, u16le(d, p + 3 + i * 4));
      }
      break;
    }
    case 0x05: { // Disconnect Complete
      const handle = u16le(d, p + 1) & 0x0fff;
      ctx.add(t, 'bthci_evt.status', p, 1, d[p]);
      ctx.add(t, 'bthci_evt.connection_handle', p + 1, 2, handle, `Connection Handle: ${hex4(handle)}`);
      ctx.add(t, 'bthci_evt.reason', p + 3, 1, d[p + 3]);
      if (ctx.first) { const c = st.conns.get(handle); if (c && !c.disconnect) c.disconnect = ctx.no; }
      break;
    }
    case 0x03: { // Connect Complete (BR/EDR)
      const handle = u16le(d, p + 1) & 0x0fff;
      ctx.add(t, 'bthci_evt.status', p, 1, d[p]);
      ctx.add(t, 'bthci_evt.connection_handle', p + 1, 2, handle, `Connection Handle: ${hex4(handle)}`);
      ctx.add(t, 'bthci_evt.bd_addr', p + 3, 6, bdaddr(d, p + 3));
      if (ctx.first && d[p] === 0) st.conns.set(handle, { peer: bdaddr(d, p + 3), connect: ctx.no });
      break;
    }
    case 0x07: { // Remote Name Request Complete
      ctx.add(t, 'bthci_evt.status', p, 1, d[p]);
      ctx.add(t, 'bthci_evt.bd_addr', p + 1, 6, bdaddr(d, p + 1));
      let n = 0; while (n < 248 && p + 7 + n < end && d[p + 7 + n]) n++;
      const devName = new TextDecoder().decode(d.subarray(p + 7, p + 7 + n));
      ctx.add(t, 'bthci_evt.device_name', p + 7, Math.min(248, end - p - 7), devName);
      if (ctx.first && devName) st.names.set(bdaddr(d, p + 1), devName);
      break;
    }
    case 0x3e: { // LE Meta
      const sub = d[p];
      ctx.add(t, 'bthci_evt.le_meta_subevent', p, 1, sub);
      info = `${name} (${LE_SUBEVENTS[sub] ?? `Unknown 0x${sub.toString(16).padStart(2, '0')}`})`;
      if (sub === 0x02) leAdvertisingReport(ctx, t, p + 1, end);
      else if (sub === 0x01 || sub === 0x0a) {
        const handle = u16le(d, p + 2) & 0x0fff;
        ctx.add(t, 'bthci_evt.status', p + 1, 1, d[p + 1]);
        ctx.add(t, 'bthci_evt.connection_handle', p + 2, 2, handle, `Connection Handle: ${hex4(handle)}`);
        ctx.add(t, 'bthci_evt.role', p + 4, 1, d[p + 4]);
        ctx.add(t, 'bthci_evt.le_peer_address_type', p + 5, 1, d[p + 5]);
        const peer = bdaddr(d, p + 6);
        ctx.add(t, 'bthci_evt.bd_addr', p + 6, 6, peer);
        if (ctx.first && d[p + 1] === 0) st.conns.set(handle, { peer, connect: ctx.no, central: d[p + 4] === 0 });
        if (ctx.first && st.lastCreate) { st.respCmd.set(ctx.no, st.lastCreate.frame); }
        const cmdFrame = st.respCmd.get(ctx.no);
        if (cmdFrame != null) ctx.gen(t, 'bthci_evt.command_in_frame', cmdFrame);
      }
      break;
    }
    default: break;
  }
  ctx.setInfo(`${ctx.vars.btPrefix}${info}`);
  return end - o;
}

function leAdvertisingReport(ctx, t, p, end) {
  const d = ctx.d;
  const st = btState(ctx);
  const n = d[p];
  ctx.add(t, 'bthci_evt.num_reports', p, 1, n);
  let o = p + 1;
  for (let i = 0; i < n && o + 9 <= end; i++) {
    ctx.add(t, 'bthci_evt.le_advts_event_type', o, 1, d[o]);
    ctx.add(t, 'bthci_evt.le_peer_address_type', o + 1, 1, d[o + 1]);
    const addr = bdaddr(d, o + 2);
    ctx.add(t, 'bthci_evt.bd_addr', o + 2, 6, addr);
    const len = d[o + 8];
    ctx.add(t, 'bthci_evt.data_length', o + 8, 1, len);
    const name = advertisingData(ctx, t, o + 9, Math.min(end, o + 9 + len));
    if (ctx.first && name && !st.names.has(addr)) st.names.set(addr, name);
    o += 9 + len;
    if (o < end) { ctx.add(t, 'bthci_evt.rssi', o, 1, (d[o] << 24) >> 24, `RSSI: ${(d[o] << 24) >> 24} dBm`); o += 1; }
  }
}

/** btcommon advertising data (EIR / AD structures). Returns the device name it carries, if any. */
function advertisingData(ctx, parent, o, end) {
  const d = ctx.d;
  if (o >= end) return null;
  ctx.layers.push('btcommon');
  const ad = ctx.add(parent, 'btcommon.eir_ad.advertising_data', o, end - o, null, 'Advertising Data');
  let name = null;
  while (o < end) {
    const len = d[o];
    if (!len) break;
    const type = d[o + 1];
    const body = o + 2, bodyEnd = Math.min(end, o + 1 + len);
    const tname = AD_TYPES[type] ?? `Unknown (0x${type.toString(16).padStart(2, '0')})`;
    const nameText = type === 0x08 || type === 0x09 ? new TextDecoder().decode(d.subarray(body, bodyEnd)) : null;
    const e = ctx.add(ad, 'btcommon.eir_ad.entry', o, len + 1, null, nameText != null ? `Device Name: ${nameText}` : tname);
    ctx.add(e, 'btcommon.eir_ad.entry.length', o, 1, len);
    ctx.add(e, 'btcommon.eir_ad.entry.type', o + 1, 1, type);
    if (type === 0x08 || type === 0x09) {
      ctx.add(e, 'btcommon.eir_ad.entry.device_name', body, bodyEnd - body, nameText);
      name = nameText;
    } else if (type === 0x02 || type === 0x03) {
      for (let u = body; u + 2 <= bodyEnd; u += 2) ctx.add(e, 'btcommon.eir_ad.entry.uuid_16', u, 2, u16le(d, u));
    } else if (type === 0xff && bodyEnd - body >= 2) {
      ctx.add(e, 'btcommon.eir_ad.entry.company_id', body, 2, u16le(d, body));
      if (bodyEnd - body > 2) ctx.add(e, 'btcommon.eir_ad.entry.data', body + 2, bodyEnd - body - 2, d.slice(body + 2, bodyEnd));
    } else if (bodyEnd > body) {
      ctx.add(e, 'btcommon.eir_ad.entry.data', body, bodyEnd - body, d.slice(body, bodyEnd));
    }
    o += len + 1;
  }
  return name;
}

// ───────────────────────── ACL → L2CAP → ATT

function hciAcl(ctx, o, end) {
  const d = ctx.d;
  ctx.need(o, 4, end);
  const hf = u16le(d, o);
  const handle = hf & 0x0fff;
  const len = u16le(d, o + 2);
  ctx.setProtocol('HCI_ACL');
  const t = ctx.proto('bthci_acl', o, end - o, 'Bluetooth HCI ACL Packet');
  ctx.add(t, 'bthci_acl.chandle', o, 2, handle, `Connection Handle: 0x${handle.toString(16).padStart(3, '0')}`);
  ctx.add(t, 'bthci_acl.pb_flag', o, 2, (hf >> 12) & 3);
  ctx.add(t, 'bthci_acl.bc_flag', o, 2, (hf >> 14) & 3);
  ctx.add(t, 'bthci_acl.length', o + 2, 2, len);
  const st = btState(ctx);
  const conn = st.conns.get(handle);
  const sent = ctx.vars.btDir === 0;
  const local = st.local ?? '00:00:00:00:00:00';
  const peer = conn?.peer ?? '00:00:00:00:00:00';
  const [src, dst] = sent ? [local, peer] : [peer, local];
  ctx.setHw(src, dst);
  const top = ctx.vars.btTop;
  ctx.gen(top, 'bluetooth.src', src, `[Source: ${src}]`);
  ctx.gen(top, 'bluetooth.dst', dst, `[Destination: ${dst}]`);
  ctx.hidden(top, 'bluetooth.addr', 0, 0, src);
  ctx.hidden(top, 'bluetooth.addr', 0, 0, dst);
  if (conn) {
    ctx.gen(t, 'bthci_acl.connect_in', conn.connect);
    if (conn.disconnect) ctx.gen(t, 'bthci_acl.disconnect_in', conn.disconnect);
  }
  ctx.gen(t, 'bthci_acl.src.bd_addr', src);
  ctx.gen(t, 'bthci_acl.src.name', st.names.get(src) ?? '');
  ctx.gen(t, 'bthci_acl.dst.bd_addr', dst);
  ctx.gen(t, 'bthci_acl.dst.name', st.names.get(dst) ?? '');
  const p = o + 4;
  if (((hf >> 12) & 3) === 1) { ctx.setInfo(`${ctx.vars.btPrefix}Continuation fragment`); ctx.data(p, end); return end - o; }
  return l2cap(ctx, p, end, handle) + 4;
}

function l2cap(ctx, o, end, handle) {
  const d = ctx.d;
  ctx.need(o, 4, end);
  const len = u16le(d, o), cid = u16le(d, o + 2);
  ctx.setProtocol('L2CAP');
  const t = ctx.proto('btl2cap', o, end - o, 'Bluetooth L2CAP Protocol');
  ctx.add(t, 'btl2cap.length', o, 2, len);
  ctx.add(t, 'btl2cap.cid', o + 2, 2, cid, `CID: ${L2CAP_CIDS[cid] ?? 'Dynamically Allocated Channel'} (${hex4(cid)})`);
  const p = o + 4;
  if (cid === 0x0004) return att(ctx, p, Math.min(end, p + len), handle) + 4;
  ctx.setInfo(`${ctx.vars.btPrefix}${L2CAP_CIDS[cid] ?? 'Connection oriented channel'}`);
  if (p < end) ctx.add(t, 'btl2cap.payload', p, end - p, d.slice(p, end));
  return end - o;
}

function att(ctx, o, end, chandle) {
  const d = ctx.d;
  ctx.need(o, 1, end);
  const op = d[o];
  const name = ATT_OPCODES[op] ?? `Unknown (0x${op.toString(16).padStart(2, '0')})`;
  ctx.setProtocol('ATT');
  const t = ctx.proto('btatt', o, end - o, 'Bluetooth Attribute Protocol');
  const on = ctx.add(t, 'btatt.opcode', o, 1, op, `Opcode: ${name} (${hex2(op)})`);
  ctx.add(on, 'btatt.opcode.authentication_signature', o, 1, (op & 0x80) !== 0);
  ctx.add(on, 'btatt.opcode.command', o, 1, (op & 0x40) !== 0);
  ctx.add(on, 'btatt.opcode.method', o, 1, op & 0x3f, `Method: ${name} (${hex2(op)})`);
  const st = btState(ctx);
  const g = st.gatt;
  const p = o + 1;
  const sent = ctx.vars.btDir === 0;
  const named = (h) => `${hex4(h)} (${handleName(g, h)})`;
  const handleItem = (at, h) => ctx.add(t, 'btatt.handle', at, 2, h, `Handle: ${named(h)}`);
  // Requests remember what they asked for, so the response shows the same handle / UUID.
  const reqKey = `${chandle}:${sent ? 'c' : 's'}`;
  const remember = (info) => { if (ctx.first) st.attReq.set(reqKey, { frame: ctx.no, op, ...info }); };
  const answer = () => {
    if (ctx.first) {
      const q = st.attReq.get(`${chandle}:${sent ? 's' : 'c'}`);
      if (q) { st.reqOf.set(ctx.no, q); st.respOf.set(q.frame, ctx.no); st.attReq.delete(`${chandle}:${sent ? 's' : 'c'}`); }
    }
    return st.reqOf.get(ctx.no) ?? null;
  };
  let info = name;
  switch (op) {
    case 0x01: { // Error Response
      const reqOp = d[p], h = u16le(d, p + 1), err = d[p + 3];
      ctx.add(t, 'btatt.req_opcode_in_error', p, 1, reqOp);
      ctx.add(t, 'btatt.handle_in_error', p + 1, 2, h, `Handle in Error: ${named(h)}`);
      ctx.add(t, 'btatt.error_code', p + 3, 1, err);
      answer();
      info = `${name} - ${ATT_ERRORS[err] ?? 'Unknown'}, Handle: ${named(h)}`;
      break;
    }
    case 0x02: ctx.add(t, 'btatt.client_rx_mtu', p, 2, u16le(d, p)); info = `${name}, Client Rx MTU: ${u16le(d, p)}`; remember({}); break;
    case 0x03: ctx.add(t, 'btatt.server_rx_mtu', p, 2, u16le(d, p)); info = `${name}, Server Rx MTU: ${u16le(d, p)}`; answer(); break;
    case 0x04: case 0x08: case 0x10: { // Find Information / Read By Type / Read By Group Type Request
      const s = u16le(d, p), e = u16le(d, p + 2);
      ctx.add(t, 'btatt.starting_handle', p, 2, s);
      ctx.add(t, 'btatt.ending_handle', p + 2, 2, e);
      let uuid = null;
      if (op !== 0x04 && end - p >= 6) { uuid = u16le(d, p + 4); ctx.add(t, 'btatt.uuid16', p + 4, 2, uuid); }
      info = uuid != null ? `${name}, ${uuidName(uuid)}, Handles: ${hex4(s)}..${hex4(e)}` : `${name}, Handles: ${hex4(s)}..${hex4(e)}`;
      remember({ uuid, start: s });
      break;
    }
    case 0x11: { // Read By Group Type Response: services
      const len = d[p];
      ctx.add(t, 'btatt.length', p, 1, len);
      const q = answer();
      const names = [];
      for (let a = p + 1; a + len <= end && len >= 6; a += len) {
        const h = u16le(d, a), ge = u16le(d, a + 2), uuid = len === 6 ? u16le(d, a + 4) : null;
        if (ctx.first && uuid != null && q?.uuid === 0x2800 || ctx.first && uuid != null && q?.uuid === 0x2801) { if (!g.services.some((x) => x.start === h)) g.services.push({ start: h, end: ge, uuid, primary: q.uuid === 0x2800 }); g.services.sort((x, y) => x.start - y.start); g.attrs.set(h, q.uuid); }
        const un = uuid != null ? uuidName(uuid) : 'UUID128';
        const ad = ctx.add(t, 'btatt.attribute_data', a, len, null, `Attribute Data, Handle: ${hex4(h)}, Group End Handle: ${hex4(ge)}, UUID: ${un}`);
        ctx.add(ad, 'btatt.handle', a, 2, h, `Handle: ${hex4(h)} (${un})`);
        ctx.add(ad, 'btatt.group_end_handle', a + 2, 2, ge);
        if (uuid != null) ctx.add(ad, 'btatt.uuid16', a + 4, 2, uuid);
        names.push(un);
      }
      info = `${name}, Attribute List Length: ${names.length}${names.length ? ', ' + names.join(', ') : ''}`;
      break;
    }
    case 0x09: { // Read By Type Response: characteristic declarations (or values)
      const len = d[p];
      ctx.add(t, 'btatt.length', p, 1, len);
      const q = answer();
      const names = [];
      for (let a = p + 1; a + len <= end && len >= 2; a += len) {
        const h = u16le(d, a);
        const ad = ctx.add(t, 'btatt.attribute_data', a, len, null, `Attribute Data, Handle: ${hex4(h)}`);
        ctx.add(ad, 'btatt.handle', a, 2, h, `Handle: ${hex4(h)}`);
        if (q?.uuid === 0x2803 && len === 7) {
          const props = d[a + 2], value = u16le(d, a + 3), uuid = u16le(d, a + 5);
          ctx.add(ad, 'btatt.characteristic_properties', a + 2, 1, props);
          ctx.add(ad, 'btatt.characteristic_value_handle', a + 3, 2, value);
          ctx.add(ad, 'btatt.uuid16', a + 5, 2, uuid);
          if (ctx.first && !g.chars.some((c) => c.decl === h)) { g.chars.push({ decl: h, value, uuid, props }); g.chars.sort((x, y) => x.decl - y.decl); g.attrs.set(h, 0x2803); g.attrs.set(value, uuid); }
          names.push(uuidName(uuid));
        } else {
          ctx.add(ad, 'btatt.value', a + 2, len - 2, d.slice(a + 2, a + len));
        }
      }
      info = `${name}, Attribute List Length: ${(end - p - 1) / Math.max(1, len) | 0}${names.length ? ', ' + names.join(', ') : ''}`;
      break;
    }
    case 0x05: { // Find Information Response: descriptors
      const fmt = d[p];
      ctx.add(t, 'btatt.information_data.format', p, 1, fmt);
      answer();
      const step = fmt === 1 ? 4 : 18;
      const handles = [];
      for (let a = p + 1; a + step <= end; a += step) {
        const h = u16le(d, a);
        const uuid = fmt === 1 ? u16le(d, a + 2) : null;
        if (ctx.first && uuid != null && !g.attrs.has(h)) g.attrs.set(h, uuid);
        handles.push(h);
      }
      for (let a = p + 1, i = 0; a + step <= end; a += step, i++) {
        const h = handles[i];
        const idn = ctx.add(t, 'btatt.information_data', a, step, null, `Information Data, Handle: ${named(h)}`);
        ctx.add(idn, 'btatt.handle', a, 2, h, `Handle: ${named(h)}`);
        if (fmt === 1) ctx.add(idn, 'btatt.uuid16', a + 2, 2, u16le(d, a + 2));
      }
      info = `${name}${handles.map((h) => `, Handle: ${named(h)}`).join('')}`;
      break;
    }
    case 0x0a: case 0x0c: { // Read / Read Blob Request
      const h = u16le(d, p);
      handleItem(p, h);
      remember({ handle: h });
      info = `${name}, Handle: ${named(h)}`;
      break;
    }
    case 0x0b: case 0x0d: { // Read / Read Blob Response
      const q = answer();
      const h = q?.handle;
      if (h != null) ctx.gen(t, 'btatt.handle', h, `[Handle: ${named(h)}]`);
      attValue(ctx, t, h != null ? g.attrs.get(h) : null, p, end);
      info = h != null ? `${name}, Handle: ${named(h)}` : name;
      break;
    }
    case 0x12: case 0x52: case 0x16: { // Write Request / Write Command / Prepare Write
      const h = u16le(d, p);
      handleItem(p, h);
      ctx.add(t, 'btatt.value', p + 2, end - p - 2, d.slice(p + 2, end));
      if (op !== 0x52) remember({ handle: h });
      info = `${name}, Handle: ${named(h)}`;
      break;
    }
    case 0x13: case 0x17: { // Write / Prepare Write Response
      const q = answer();
      if (q?.handle != null) { ctx.gen(t, 'btatt.handle', q.handle, `[Handle: ${named(q.handle)}]`); info = `${name}, Handle: ${named(q.handle)}`; }
      break;
    }
    case 0x1b: case 0x1d: { // Notification / Indication
      const h = u16le(d, p);
      handleItem(p, h);
      attValue(ctx, t, g.attrs.get(h), p + 2, end);
      info = `${name}, Handle: ${named(h)}`;
      break;
    }
    default:
      if (p < end) ctx.add(t, 'btatt.value', p, end - p, d.slice(p, end));
  }
  const resp = st.respOf.get(ctx.no);
  if (resp) ctx.gen(t, 'btatt.response_in_frame', resp);
  const req = st.reqOf.get(ctx.no);
  if (req) ctx.gen(t, 'btatt.request_in_frame', req.frame);
  ctx.setInfo(`${ctx.vars.btPrefix}${info}`);
  return end - o;
}

/** An attribute value, decoded for the characteristics we know. */
function attValue(ctx, t, uuid, o, end) {
  const d = ctx.d;
  if (o >= end) return;
  switch (uuid) {
    case 0x2a00: ctx.add(t, 'btatt.device_name', o, end - o, new TextDecoder().decode(d.subarray(o, end))); break;
    case 0x2a19: ctx.add(t, 'btatt.battery_level', o, 1, d[o], `Battery Level: ${d[o]}%`); break;
    case 0x2a37: {
      const flags = d[o];
      const bpm = flags & 1 ? u16le(d, o + 1) : d[o + 1];
      ctx.add(t, 'btatt.heart_rate_measurement.flags', o, 1, flags);
      ctx.add(t, flags & 1 ? 'btatt.heart_rate_measurement.value.16' : 'btatt.heart_rate_measurement.value.8', o + 1, flags & 1 ? 2 : 1, bpm);
      break;
    }
    case 0x2a38: ctx.add(t, 'btatt.body_sensor_location', o, 1, d[o]); break;
    default: ctx.add(t, 'btatt.value', o, end - o, d.slice(o, end));
  }
}

// ───────────────────────── registration

registerProtocol({
  abbrev: 'bluetooth', name: 'Bluetooth', short: 'Bluetooth',
  fields: [
    ['bluetooth.src', 'Source', 'ether'], ['bluetooth.dst', 'Destination', 'ether'],
    ['bluetooth.src_str', 'Source', 'string'], ['bluetooth.dst_str', 'Destination', 'string'],
    ['bluetooth.addr', 'Source or Destination', 'ether'], ['bluetooth.addr_str', 'Source or Destination', 'string'],
  ],
  tables: { linktype: [187, 201] },
  dissect(ctx, off, end) { return dissectBluetooth(ctx, off, end); },
});
registerProtocol({
  abbrev: 'hci_h4', name: 'Bluetooth HCI H4', short: 'HCI_H4',
  fields: [
    ['hci_h4.direction', 'Direction', 'uint8', { strings: { 0: 'Sent', 1: 'Rcvd' }, base: 'hex' }],
    ['hci_h4.type', 'HCI Packet Type', 'uint8', { strings: { 1: 'HCI Command', 2: 'ACL Data', 3: 'SCO Data', 4: 'HCI Event', 5: 'ISO Data' }, base: 'hex' }],
  ],
});
registerProtocol({
  abbrev: 'bthci_cmd', name: 'Bluetooth HCI Command', short: 'HCI_CMD',
  fields: [
    ['bthci_cmd.opcode', 'Command Opcode', 'uint16', { strings: COMMANDS, base: 'hex' }],
    ['bthci_cmd.opcode.ogf', 'Opcode Group Field', 'uint16', { strings: OGF, base: 'hex' }],
    ['bthci_cmd.opcode.ocf', 'Opcode Command Field', 'uint16', { base: 'hex' }],
    ['bthci_cmd.param_length', 'Parameter Total Length', 'uint8'],
    ['bthci_cmd.connection_handle', 'Connection Handle', 'uint16', { base: 'hex' }],
    ['bthci_cmd.reason', 'Reason', 'uint8', { strings: STATUS, base: 'hex' }],
    ['bthci_cmd.device_name', 'Device Name', 'string'],
    ['bthci_cmd.bd_addr', 'BD_ADDR', 'ether'],
    ['bthci_cmd.le_peer_address_type', 'Peer Address Type', 'uint8', { strings: ADDR_TYPE, base: 'hex' }],
    ['bthci_cmd.le_scan_type', 'Scan Type', 'uint8', { strings: { 0: 'Passive', 1: 'Active' }, base: 'hex' }],
    ['bthci_cmd.le_scan_enable', 'Scan Enable', 'uint8', { strings: { 0: 'false', 1: 'true' }, base: 'hex' }],
    ['bthci_cmd.response_in_frame', 'Response in frame', 'framenum'],
  ],
});
registerProtocol({
  abbrev: 'bthci_evt', name: 'Bluetooth HCI Event', short: 'HCI_EVT',
  fields: [
    ['bthci_evt.code', 'Event Code', 'uint8', { strings: EVENTS, base: 'hex' }],
    ['bthci_evt.param_length', 'Parameter Total Length', 'uint8'],
    ['bthci_evt.num_command_packets', 'Number of Allowed Command Packets', 'uint8'],
    ['bthci_evt.opcode', 'Command Opcode', 'uint16', { strings: COMMANDS, base: 'hex' }],
    ['bthci_evt.status', 'Status', 'uint8', { strings: STATUS, base: 'hex' }],
    ['bthci_evt.bd_addr', 'BD_ADDR', 'ether'],
    ['bthci_evt.hci_vers_nr', 'HCI Version', 'uint8', { strings: VERSIONS, base: 'hex' }],
    ['bthci_evt.hci_revision', 'HCI Revision', 'uint16'],
    ['bthci_evt.lmp_vers_nr', 'LMP Version', 'uint8', { strings: VERSIONS, base: 'hex' }],
    ['bthci_evt.comp_id', 'Manufacturer Name', 'uint16', { strings: COMPANIES, base: 'hex' }],
    ['bthci_evt.lmp_sub_vers_nr', 'LMP Subversion', 'uint16'],
    ['bthci_evt.num_handles', 'Number of Connection Handles', 'uint8'],
    ['bthci_evt.connection_handle', 'Connection Handle', 'uint16', { base: 'hex' }],
    ['bthci_evt.num_compl_packets', 'Number of Completed Packets', 'uint16'],
    ['bthci_evt.reason', 'Reason', 'uint8', { strings: STATUS, base: 'hex' }],
    ['bthci_evt.device_name', 'Device Name', 'string'],
    ['bthci_evt.le_meta_subevent', 'Sub Event', 'uint8', { strings: LE_SUBEVENTS, base: 'hex' }],
    ['bthci_evt.role', 'Role', 'uint8', { strings: { 0: 'Currently the Central for specified BD_ADDR', 1: 'Currently the Peripheral for specified BD_ADDR' }, base: 'hex' }],
    ['bthci_evt.le_peer_address_type', 'Peer Address Type', 'uint8', { strings: ADDR_TYPE, base: 'hex' }],
    ['bthci_evt.num_reports', 'Num Reports', 'uint8'],
    ['bthci_evt.le_advts_event_type', 'Event Type', 'uint8', { strings: ADV_EVENT, base: 'hex' }],
    ['bthci_evt.data_length', 'Data Length', 'uint8'],
    ['bthci_evt.rssi', 'RSSI', 'int8'],
    ['bthci_evt.command_in_frame', 'Command in frame', 'framenum'],
  ],
});
registerProtocol({
  abbrev: 'btcommon', name: 'Bluetooth Common', short: 'BT Common',
  fields: [
    ['btcommon.eir_ad.advertising_data', 'Advertising Data', 'none'],
    ['btcommon.eir_ad.entry', 'Entry', 'none'],
    ['btcommon.eir_ad.entry.length', 'Length', 'uint8'],
    ['btcommon.eir_ad.entry.type', 'Type', 'uint8', { strings: AD_TYPES, base: 'hex' }],
    ['btcommon.eir_ad.entry.device_name', 'Device Name', 'string'],
    ['btcommon.eir_ad.entry.uuid_16', 'UUID 16', 'uint16', { strings: UUIDS, base: 'hex' }],
    ['btcommon.eir_ad.entry.company_id', 'Company ID', 'uint16', { strings: COMPANIES, base: 'hex' }],
    ['btcommon.eir_ad.entry.data', 'Data', 'bytes'],
  ],
});
registerProtocol({
  abbrev: 'bthci_acl', name: 'Bluetooth HCI ACL Packet', short: 'HCI_ACL',
  fields: [
    ['bthci_acl.chandle', 'Connection Handle', 'uint16', { base: 'hex' }],
    ['bthci_acl.pb_flag', 'PB Flag', 'uint16', { strings: { 0: 'First Non-automatically Flushable Packet', 1: 'Continuing Fragment', 2: 'First Automatically Flushable Packet' } }],
    ['bthci_acl.bc_flag', 'BC Flag', 'uint16', { strings: { 0: 'Point-To-Point', 1: 'Active Broadcast', 2: 'Piconet Broadcast' } }],
    ['bthci_acl.length', 'Data Total Length', 'uint16'],
    ['bthci_acl.connect_in', 'Connect in frame', 'framenum'],
    ['bthci_acl.disconnect_in', 'Disconnect in frame', 'framenum'],
    ['bthci_acl.src.bd_addr', 'Source BD_ADDR', 'ether'], ['bthci_acl.src.name', 'Source Device Name', 'string'],
    ['bthci_acl.dst.bd_addr', 'Destination BD_ADDR', 'ether'], ['bthci_acl.dst.name', 'Destination Device Name', 'string'],
  ],
});
registerProtocol({
  abbrev: 'btl2cap', name: 'Bluetooth L2CAP Protocol', short: 'L2CAP',
  fields: [['btl2cap.length', 'Length', 'uint16'], ['btl2cap.cid', 'CID', 'uint16', { strings: L2CAP_CIDS, base: 'hex' }], ['btl2cap.payload', 'Payload', 'bytes']],
});
registerProtocol({
  abbrev: 'btatt', name: 'Bluetooth Attribute Protocol', short: 'ATT',
  fields: [
    ['btatt.opcode', 'Opcode', 'uint8', { strings: ATT_OPCODES, base: 'hex' }],
    ['btatt.opcode.authentication_signature', 'Authentication Signature', 'bool'],
    ['btatt.opcode.command', 'Command', 'bool'],
    ['btatt.opcode.method', 'Method', 'uint8', { strings: ATT_OPCODES, base: 'hex' }],
    ['btatt.handle', 'Handle', 'uint16', { base: 'hex' }],
    ['btatt.starting_handle', 'Starting Handle', 'uint16', { base: 'hex' }],
    ['btatt.ending_handle', 'Ending Handle', 'uint16', { base: 'hex' }],
    ['btatt.group_end_handle', 'Group End Handle', 'uint16', { base: 'hex' }],
    ['btatt.uuid16', 'UUID', 'uint16', { strings: UUIDS, base: 'hex' }],
    ['btatt.length', 'Length', 'uint8'],
    ['btatt.attribute_data', 'Attribute Data', 'none'],
    ['btatt.information_data', 'Information Data', 'none'],
    ['btatt.information_data.format', 'Format', 'uint8', { strings: { 1: '16-bit UUIDs', 2: '128-bit UUIDs' }, base: 'hex' }],
    ['btatt.characteristic_properties', 'Characteristic Properties', 'uint8', { base: 'hex' }],
    ['btatt.characteristic_value_handle', 'Characteristic Value Handle', 'uint16', { base: 'hex' }],
    ['btatt.value', 'Value', 'bytes'],
    ['btatt.req_opcode_in_error', 'Request Opcode in Error', 'uint8', { strings: ATT_OPCODES, base: 'hex' }],
    ['btatt.handle_in_error', 'Handle in Error', 'uint16', { base: 'hex' }],
    ['btatt.error_code', 'Error Code', 'uint8', { strings: ATT_ERRORS, base: 'hex' }],
    ['btatt.client_rx_mtu', 'Client Rx MTU', 'uint16'],
    ['btatt.server_rx_mtu', 'Server Rx MTU', 'uint16'],
    ['btatt.device_name', 'Device Name', 'string'],
    ['btatt.battery_level', 'Battery Level', 'uint8'],
    ['btatt.heart_rate_measurement.flags', 'Flags', 'uint8', { base: 'hex' }],
    ['btatt.heart_rate_measurement.value.8', 'Value', 'uint8'],
    ['btatt.heart_rate_measurement.value.16', 'Value', 'uint16'],
    ['btatt.body_sensor_location', 'Body Sensor Location', 'uint8', { strings: { 0: 'Other', 1: 'Chest', 2: 'Wrist', 3: 'Finger', 4: 'Hand', 5: 'Ear Lobe', 6: 'Foot' }, base: 'hex' }],
    ['btatt.request_in_frame', 'Request in Frame', 'framenum'],
    ['btatt.response_in_frame', 'Response in Frame', 'framenum'],
  ],
});
