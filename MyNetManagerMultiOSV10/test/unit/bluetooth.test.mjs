// Bluetooth (HCI H4 with direction pseudo-header → HCI command / event / ACL → L2CAP → ATT) and the Wireless ›
// Bluetooth windows, on the "bluetooth-le" sample. The tshark witness compares every frame with Wireshark.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SAMPLES } from '../../src/domain/capture/samples.js';
import { bluetoothCapture } from '../../src/domain/capture/build/bluetooth.js';
import { CaptureDoc } from '../../src/domain/capture/doc.js';
import { readCapture, writePcap, writePcapng } from '../../src/domain/capture/pcap.js';
import { handleName } from '../../src/domain/dissect/proto/bluetooth.js';
import { btAttServer, btDevices, btHciSummary } from '../../src/stats-bluetooth.js';

// The Bluetooth session alone (the "Wi-Fi and Bluetooth" sample appends it after the Wi-Fi frames).
const build = () => bluetoothCapture();
const t = (k) => k;
async function open(file = build()) {
  const doc = new CaptureDoc({ name: 'bt', file });
  await doc.firstPass();
  return doc;
}
const src = (doc) => ({ doc, frames: doc.frames, get: (f) => doc.dissectOnce(f.no - 1) });
const count = async (doc, filter) => (await doc.applyFilter(filter)).count;

test('bluetooth: the direction pseudo-header is frame metadata, and goes back on saving (pcap and pcapng)', async () => {
  const file = build();
  assert.ok(file.frames.every((f) => f.p2pDir === 0 || f.p2pDir === 1));
  assert.equal(file.frames[0].data[0], 0x01, 'the packet starts at the H4 type (HCI Command)');
  for (const write of [writePcapng, writePcap]) {
    const back = readCapture(write(file), 'bt.cap');
    assert.deepEqual(back.frames.map((f) => f.p2pDir), file.frames.map((f) => f.p2pDir));
    assert.deepEqual([...back.frames[21].data], [...file.frames[21].data]);
    assert.equal(back.frames[21].len, file.frames[21].len);
  }
});

test('bluetooth: columns, filters on HCI / ATT fields and the GATT names of handles', async () => {
  const doc = await open();
  const s = (no) => doc.summaries[no - 1];
  assert.equal(s(1).protocol, 'HCI_CMD');
  assert.equal(s(1).info, 'Sent Reset');
  assert.equal(s(2).info, 'Rcvd Command Complete (Reset)');
  assert.equal(s(22).protocol, 'ATT');
  assert.equal(doc.summary(50).info, 'Rcvd Write Response, Handle: 0x0013 (Heart Rate: Heart Rate Measurement: Client Characteristic Configuration)');
  assert.equal(await count(doc, 'bthci_cmd'), 9);
  assert.equal(await count(doc, 'bthci_evt.le_meta_subevent == 0x02'), 4, 'advertising reports');
  assert.equal(await count(doc, 'btcommon.eir_ad.entry.device_name == "HR Sensor"'), 2);
  assert.equal(await count(doc, 'btatt.opcode == 0x1b'), 4, 'notifications');
  assert.equal(await count(doc, 'btatt.heart_rate_measurement.value.8 > 73'), 2);
  assert.equal(await count(doc, 'bluetooth.addr == f4:5e:ab:12:34:56'), 24, 'ACL packets to and from the sensor');
  assert.equal(await count(doc, 'btatt.battery_level == 87'), 1);
  assert.equal(await count(doc, 'frame.p2p_dir == 1'), doc.frames.filter((f) => f.p2pDir === 1).length);
  const gatt = doc.session.state.bluetooth.gatt;
  assert.equal(handleName(gatt, 0x0010), 'Heart Rate');
  assert.equal(handleName(gatt, 0x0003), 'GAP: Device Name');
  assert.equal(handleName(gatt, 0x0017), 'Heart Rate: Unknown');
  assert.deepEqual(doc.session.bugs, []);
});

test('bluetooth windows: devices, HCI summary, ATT server attributes', async () => {
  const doc = await open();
  const devices = btDevices(src(doc), t).rows.map((r) => r.cells);
  assert.equal(devices.length, 3);
  assert.equal(devices[0].local, 'common.yes');
  assert.equal(devices[0].maker, 'Broadcom Corporation');
  assert.equal(devices[0].hci, '5.3');
  assert.deepEqual(devices.slice(1).map((d) => d.name), ['HR Sensor', 'Tag']);
  assert.equal(devices[1].oui, 'TexasInstrum');
  const hci = btHciSummary(src(doc), t).rows;
  const row = (name) => hci.find((r) => r.cells.name.startsWith(name))?.cells.count;
  assert.equal(row('btHci.commands'), 9);
  assert.equal(row('btHci.events'), 25);
  assert.equal(row('LE Advertising Report'), 4);
  assert.equal(row('Connection Terminated by Local Host'), 1);
  const attrs = btAttServer(src(doc), t).rows.map((r) => `${r.cells.handle} ${r.cells.name}`);
  assert.deepEqual(attrs.filter((a) => /Heart Rate|Client Characteristic|Body Sensor/.test(a)), ['0x0010 Heart Rate', '0x0012 Heart Rate Measurement', '0x0013 Client Characteristic Configuration', '0x0015 Body Sensor Location']);
  for (const view of [btDevices(src(doc), t), btHciSummary(src(doc), t), btAttServer(src(doc), t)]) {
    for (const r of view.rows) assert.ok((await doc.applyFilter(r.filter)).ok, r.filter);
  }
});

test('bluetooth: the wireless sample carries the session after its Wi-Fi frames, on a second interface', async () => {
  const file = SAMPLES.find((s) => s.id === 'wifi-80211').build();
  assert.deepEqual(file.interfaces.map((i) => i.linktype), [127, 201]);
  const doc = await open(file);
  assert.equal(await count(doc, 'bthci_cmd'), 9);
  assert.equal(await count(doc, 'wlan'), doc.frames.filter((f) => f.iface === 0).length);
  assert.deepEqual(doc.session.bugs, []);
});
