// Bluetooth LE sample: what a host sees on its HCI (LINKTYPE_BLUETOOTH_HCI_H4_WITH_PHDR, 201) — adapter setup,
// a scan with advertising reports, a connection, GATT discovery over ATT (services, characteristics,
// descriptors), reads, a write, notifications and the disconnect.
import { Capture } from '../packet.js';
import { stripPseudoHeader } from '../pcap.js';

const LT_H4_PHDR = 201;
const SENT = 0, RCVD = 1;
const u8 = (...b) => Uint8Array.from(b);
const le16 = (v) => u8(v & 0xff, (v >> 8) & 0xff);
const cat = (...parts) => { const n = parts.reduce((s, p) => s + p.length, 0); const o = new Uint8Array(n); let at = 0; for (const p of parts) { o.set(p, at); at += p.length; } return o; };
const bdaddr = (s) => Uint8Array.from(s.split(':').map((h) => parseInt(h, 16)).reverse()); // little-endian on the air
const text = (s) => new TextEncoder().encode(s);

const ADAPTER = '00:1a:7d:da:71:13';
const SENSOR = 'f4:5e:ab:12:34:56';    // the heart-rate sensor we connect to (public address)
const TAG = 'd8:a0:1d:40:aa:01';       // another device that only advertises

/** H4 with the 4-byte direction header. */
const h4 = (dir, type, body) => cat(u8(0, 0, 0, dir), u8(type), body);
const cmd = (ogf, ocf, params = new Uint8Array(0)) => h4(SENT, 1, cat(le16((ogf << 10) | ocf), u8(params.length), params));
const evt = (code, params) => h4(RCVD, 4, cat(u8(code, params.length), params));
const cmdComplete = (ogf, ocf, ret = u8(0)) => evt(0x0e, cat(u8(1), le16((ogf << 10) | ocf), ret));
const cmdStatus = (ogf, ocf, status = 0) => evt(0x0f, cat(u8(status, 1), le16((ogf << 10) | ocf)));
const HANDLE = 0x0040;
const acl = (dir, l2cap) => h4(dir, 2, cat(le16(HANDLE | (2 << 12)), le16(l2cap.length), l2cap));
const att = (dir, pdu) => acl(dir, cat(le16(pdu.length), le16(0x0004), pdu));
const completed = (n = 1) => evt(0x13, cat(u8(1), le16(HANDLE), le16(n)));

function adReport(addr, rssi, ad, eventType = 0, addrType = 0) {
  return evt(0x3e, cat(u8(0x02, 1, eventType, addrType), bdaddr(addr), u8(ad.length), ad, u8(rssi & 0xff)));
}
const adStruct = (type, data) => cat(u8(data.length + 1, type), data);

export function bluetoothCapture() {
  const cap = new Capture(1763470000.0, { linktype: LT_H4_PHDR, ifname: 'bluetooth0', comment: 'Bluetooth LE: scan, connect, GATT discovery, read / write / notify (HCI H4)' });
  const add = (frame, dt = 0.002) => { cap.wait(dt); cap.add(frame); };
  // Adapter setup.
  add(cmd(0x03, 0x0003));                                   // Reset
  add(cmdComplete(0x03, 0x0003));
  add(cmd(0x04, 0x0009));                                   // Read BD ADDR
  add(cmdComplete(0x04, 0x0009, cat(u8(0), bdaddr(ADAPTER))));
  add(cmd(0x04, 0x0001));                                   // Read Local Version Information
  add(cmdComplete(0x04, 0x0001, cat(u8(0, 0x0c), le16(0x1234), u8(0x0c), le16(0x000f), le16(0x5678)))); // BT 5.3, Broadcom
  add(cmd(0x03, 0x0013, cat(text('MyNetManager-host'), new Uint8Array(248 - 17)))); // Write Local Name
  add(cmdComplete(0x03, 0x0013));
  // Scan.
  add(cmd(0x08, 0x000b, cat(u8(1), le16(0x0060), le16(0x0030), u8(0, 0))));   // LE Set Scan Parameters (active)
  add(cmdComplete(0x08, 0x000b));
  add(cmd(0x08, 0x000c, u8(1, 1)));                          // LE Set Scan Enable
  add(cmdComplete(0x08, 0x000c), 0.003);
  const sensorAd = cat(adStruct(0x01, u8(0x06)), adStruct(0x03, cat(le16(0x180d), le16(0x180f))), adStruct(0x09, text('HR Sensor')));
  const tagAd = cat(adStruct(0x01, u8(0x06)), adStruct(0xff, cat(le16(0x004c), u8(0x02, 0x15, 1, 2, 3, 4))), adStruct(0x08, text('Tag')));
  add(adReport(SENSOR, -58, sensorAd), 0.12);
  add(adReport(TAG, -77, tagAd), 0.08);
  add(adReport(SENSOR, -60, adStruct(0x09, text('HR Sensor')), 4), 0.002); // scan response
  add(adReport(TAG, -79, tagAd), 0.21);
  add(cmd(0x08, 0x000c, u8(0, 0)), 0.05);                    // scan off
  add(cmdComplete(0x08, 0x000c));
  // Connect.
  add(cmd(0x08, 0x000d, cat(le16(0x0060), le16(0x0030), u8(0, 0), bdaddr(SENSOR), u8(0), le16(0x0018), le16(0x0028), le16(0), le16(0x002a), le16(0), le16(0))));
  add(cmdStatus(0x08, 0x000d));
  add(evt(0x3e, cat(u8(0x01, 0), le16(HANDLE), u8(0, 0), bdaddr(SENSOR), le16(0x0027), le16(0), le16(0x002a), u8(0))), 0.03); // LE Connection Complete
  // ATT: MTU, services, characteristics, descriptors.
  const req = (pdu, resp, dt = 0.008) => { add(att(SENT, pdu)); add(completed(), 0.001); add(att(RCVD, resp), dt); };
  req(u8(0x02, ...le16(247)), u8(0x03, ...le16(185)));                                         // Exchange MTU
  const svc = (s, e, uuid) => cat(le16(s), le16(e), le16(uuid));
  req(cat(u8(0x10), le16(0x0001), le16(0xffff), le16(0x2800)), cat(u8(0x11, 6), svc(1, 7, 0x1800), svc(8, 11, 0x1801), svc(12, 15, 0x180f), svc(16, 22, 0x180d)));
  req(cat(u8(0x10), le16(0x0017), le16(0xffff), le16(0x2800)), cat(u8(0x01, 0x10), le16(0x0017), u8(0x0a)));          // Error: Attribute Not Found
  const chr = (decl, props, value, uuid) => cat(le16(decl), u8(props), le16(value), le16(uuid));
  req(cat(u8(0x08), le16(0x0001), le16(0xffff), le16(0x2803)), cat(u8(0x09, 7), chr(2, 0x02, 3, 0x2a00), chr(9, 0x20, 10, 0x2a05), chr(13, 0x12, 14, 0x2a19), chr(17, 0x10, 18, 0x2a37)));
  req(cat(u8(0x08), le16(0x0013), le16(0xffff), le16(0x2803)), cat(u8(0x09, 7), chr(20, 0x02, 21, 0x2a38)));
  req(cat(u8(0x04), le16(0x0013), le16(0x0013)), cat(u8(0x05, 1), le16(0x0013), le16(0x2902)));                  // Find Information
  // Reads, a write and notifications.
  req(cat(u8(0x0a), le16(0x0003)), cat(u8(0x0b), text('HR Sensor')));
  req(cat(u8(0x0a), le16(0x000e)), u8(0x0b, 87));                                                            // battery 87 %
  req(cat(u8(0x0a), le16(0x0015)), u8(0x0b, 1));                                                             // body sensor: chest
  req(cat(u8(0x12), le16(0x0013), le16(0x0001)), u8(0x13));                                                  // enable notifications
  for (const [i, bpm] of [72, 74, 75, 73].entries()) add(att(RCVD, cat(u8(0x1b), le16(0x0012), u8(0x00, bpm))), i ? 1.0 : 0.6);
  // Disconnect.
  add(cmd(0x01, 0x0006, cat(le16(HANDLE), u8(0x13))), 0.4);
  add(cmdStatus(0x01, 0x0006));
  add(evt(0x05, cat(u8(0), le16(HANDLE), u8(0x16))), 0.05);
  const file = cap.file('bluetooth-le.pcapng');
  // Frames as a reader returns them: the direction header becomes frame.p2pDir.
  file.frames.forEach(stripPseudoHeader);
  return file;
}

/**
 * The Bluetooth session appended to another capture as a second interface (pcapng keeps a link type per
 * interface): the wireless sample shows Wi-Fi and Bluetooth together. Frame numbers of `file` stay.
 */
export function appendBluetooth(file, gap = 1.5) {
  const bt = bluetoothCapture();
  const iface = file.interfaces.length;
  file.interfaces.push({ ...bt.interfaces[0] });
  const last = file.frames[file.frames.length - 1];
  const start = last ? last.sec + last.nsec / 1e9 + gap : 0;
  const shift = start - (bt.frames[0].sec + bt.frames[0].nsec / 1e9);
  for (const fr of bt.frames) {
    const t = fr.sec + fr.nsec / 1e9 + shift;
    let sec = Math.floor(t), nsec = Math.round((t - sec) * 1e6) * 1000;
    if (nsec >= 1e9) { sec += 1; nsec -= 1e9; }
    file.frames.push({ ...fr, no: file.frames.length + 1, sec, nsec, iface });
  }
  if (bt.section?.comment) file.section = { ...file.section, comment: [file.section?.comment, bt.section.comment].filter(Boolean).join('\n') };
  return file;
}
