// Wireless › Bluetooth windows (Wireshark's GUI dialogs), from the dissected HCI / ATT fields:
//   btDevices     Bluetooth Devices: every BD_ADDR seen, its vendor (OUI), name, and the local adapter's versions
//   btHciSummary  Bluetooth HCI Summary: commands by group, events (LE Meta by sub event), status and reason codes
//   btAttServer   Bluetooth ATT Server Attributes: the GATT database discovered over ATT (handle, UUID, name)
// `src` is { doc, frames, get(frame) → dissection }.
import { FIELDS } from './domain/dissect/index.js';
import { ouiVendor } from './domain/dissect/names.js';
import { COMMANDS, COMPANIES, EVENTS, LE_SUBEVENTS, OGF, STATUS, UUIDS, VERSIONS } from './domain/dissect/proto/bluetooth.js';

const all = (d, name) => (d?.fields?.get(name) ?? []).map((n) => n.value);
const first = (d, name) => d?.fields?.get(name)?.[0]?.value;
const hex4 = (v) => `0x${Number(v).toString(16).padStart(4, '0')}`;
const table = (columns, rows, extra = {}) => ({ view: 'table', columns, rows, ...extra });

export function btDevices(src, t) {
  const devices = new Map();
  let local = null;
  const dev = (addr) => {
    if (!addr || addr === '00:00:00:00:00:00') return null;
    let e = devices.get(addr);
    if (!e) { e = { addr, name: '', packets: 0, first: null, rssi: null, local: false }; devices.set(addr, e); }
    return e;
  };
  for (const frame of src.frames) {
    const d = src.get(frame);
    if (!d?.fields?.has('bluetooth')) continue;
    const opcode = first(d, 'bthci_evt.opcode');
    if (opcode === 0x1009) { const a = first(d, 'bthci_evt.bd_addr'); const e = dev(a); if (e) { e.local = true; local = e; e.first ??= frame.no; } }
    if (opcode === 0x1001 && first(d, 'bthci_evt.hci_vers_nr') != null) {
      local = local ?? { pendingVersion: true };
      local.version = { hci: first(d, 'bthci_evt.hci_vers_nr'), hciRev: first(d, 'bthci_evt.hci_revision'), lmp: first(d, 'bthci_evt.lmp_vers_nr'), lmpSub: first(d, 'bthci_evt.lmp_sub_vers_nr'), company: first(d, 'bthci_evt.comp_id') };
    }
    const names = all(d, 'btcommon.eir_ad.entry.device_name').concat(all(d, 'bthci_evt.device_name'));
    const rssi = first(d, 'bthci_evt.rssi');
    for (const a of new Set([...all(d, 'bthci_evt.bd_addr'), ...all(d, 'bthci_cmd.bd_addr'), ...all(d, 'bluetooth.src'), ...all(d, 'bluetooth.dst')])) {
      const e = dev(a);
      if (!e) continue;
      e.packets += 1;
      e.first ??= frame.no;
      if (names[0] && !e.local && all(d, 'bthci_evt.bd_addr').includes(a)) e.name ||= names[0];
      if (rssi != null && all(d, 'bthci_evt.bd_addr').includes(a)) e.rssi = rssi;
    }
  }
  const v = local?.version;
  const rows = [...devices.values()].sort((a, b) => Number(b.local) - Number(a.local) || a.first - b.first).map((e, i) => ({
    id: String(i), no: e.first, filter: `bluetooth.addr == ${e.addr} || bthci_evt.bd_addr == ${e.addr} || bthci_cmd.bd_addr == ${e.addr}`,
    cells: {
      addr: e.addr, oui: ouiVendor(e.addr) ?? (parseInt(e.addr.slice(0, 2), 16) & 2 ? t('macBlocks.local') : ''), name: e.name, rssi: e.rssi ?? '',
      local: e.local ? t('common.yes') : t('common.no'),
      hci: e.local && v ? VERSIONS[v.hci] ?? String(v.hci) : '', hciRev: e.local && v ? v.hciRev : '',
      lmp: e.local && v ? VERSIONS[v.lmp] ?? String(v.lmp) : '', lmpSub: e.local && v ? v.lmpSub : '',
      maker: e.local && v ? COMPANIES[v.company] ?? hex4(v.company) : '', packets: e.packets,
    },
  }));
  return table([
    { id: 'addr', label: 'BD_ADDR' }, { id: 'oui', label: 'OUI' }, { id: 'name', label: t('btDevices.name') }, { id: 'rssi', label: 'RSSI (dBm)', num: true },
    { id: 'local', label: t('btDevices.local') }, { id: 'hci', label: t('btDevices.hci') }, { id: 'hciRev', label: t('btDevices.hciRev'), num: true },
    { id: 'lmp', label: t('btDevices.lmp') }, { id: 'lmpSub', label: t('btDevices.lmpSub'), num: true }, { id: 'maker', label: t('btDevices.maker') },
    { id: 'packets', label: t('netmap.packets'), num: true },
  ], rows, { note: rows.length ? '' : t('stats.empty') });
}

export function btHciSummary(src, t) {
  const cmds = new Map(); // ogf → Map(opcode → count)
  const events = new Map(); // code → { count, subs: Map }
  const status = new Map();
  const reasons = new Map();
  let nCmd = 0, nEvt = 0, nAcl = 0;
  for (const frame of src.frames) {
    const d = src.get(frame);
    if (!d?.fields?.has('hci_h4')) continue;
    const op = first(d, 'bthci_cmd.opcode');
    if (op != null) {
      nCmd += 1;
      const ogf = op >> 10;
      if (!cmds.has(ogf)) cmds.set(ogf, new Map());
      cmds.get(ogf).set(op, (cmds.get(ogf).get(op) ?? 0) + 1);
    }
    const code = first(d, 'bthci_evt.code');
    if (code != null) {
      nEvt += 1;
      let e = events.get(code);
      if (!e) { e = { count: 0, subs: new Map() }; events.set(code, e); }
      e.count += 1;
      const sub = first(d, 'bthci_evt.le_meta_subevent');
      if (sub != null) e.subs.set(sub, (e.subs.get(sub) ?? 0) + 1);
      const st = first(d, 'bthci_evt.status');
      if (st != null) status.set(st, (status.get(st) ?? 0) + 1);
      const r = first(d, 'bthci_evt.reason');
      if (r != null) reasons.set(r, (reasons.get(r) ?? 0) + 1);
    }
    if (d.fields.has('bthci_acl')) nAcl += 1;
  }
  const rows = [];
  rows.push({ id: 'cmd', depth: 0, filter: 'bthci_cmd', cells: { name: t('btHci.commands'), count: nCmd } });
  for (const [ogf, ops] of [...cmds].sort((a, b) => a[0] - b[0])) {
    rows.push({ id: `cmd/${ogf}`, depth: 1, filter: `bthci_cmd.opcode.ogf == ${ogf}`, cells: { name: OGF[ogf] ?? `OGF ${ogf}`, count: [...ops.values()].reduce((a, b) => a + b, 0) } });
    for (const [op, n] of [...ops].sort((a, b) => a[0] - b[0])) rows.push({ id: `cmd/${ogf}/${op}`, depth: 2, filter: `bthci_cmd.opcode == ${hex4(op)}`, cells: { name: `${COMMANDS[op] ?? 'Unknown'} (${hex4(op)})`, count: n } });
  }
  rows.push({ id: 'evt', depth: 0, filter: 'bthci_evt', cells: { name: t('btHci.events'), count: nEvt } });
  for (const [code, e] of [...events].sort((a, b) => a[0] - b[0])) {
    rows.push({ id: `evt/${code}`, depth: 1, filter: `bthci_evt.code == 0x${code.toString(16).padStart(2, '0')}`, cells: { name: EVENTS[code] ?? `Unknown (0x${code.toString(16)})`, count: e.count } });
    for (const [sub, n] of [...e.subs].sort((a, b) => a[0] - b[0])) rows.push({ id: `evt/${code}/${sub}`, depth: 2, filter: `bthci_evt.le_meta_subevent == 0x${sub.toString(16).padStart(2, '0')}`, cells: { name: LE_SUBEVENTS[sub] ?? `Unknown (0x${sub.toString(16)})`, count: n } });
  }
  rows.push({ id: 'status', depth: 0, filter: 'bthci_evt.status', cells: { name: t('btHci.status'), count: [...status.values()].reduce((a, b) => a + b, 0) } });
  for (const [st, n] of [...status].sort((a, b) => a[0] - b[0])) rows.push({ id: `status/${st}`, depth: 1, filter: `bthci_evt.status == 0x${st.toString(16).padStart(2, '0')}`, cells: { name: STATUS[st] ?? `0x${st.toString(16)}`, count: n } });
  if (reasons.size) {
    rows.push({ id: 'reason', depth: 0, filter: 'bthci_evt.reason', cells: { name: t('btHci.reasons'), count: [...reasons.values()].reduce((a, b) => a + b, 0) } });
    for (const [r, n] of reasons) rows.push({ id: `reason/${r}`, depth: 1, filter: `bthci_evt.reason == 0x${r.toString(16).padStart(2, '0')}`, cells: { name: STATUS[r] ?? `0x${r.toString(16)}`, count: n } });
  }
  rows.push({ id: 'acl', depth: 0, filter: 'bthci_acl', cells: { name: t('btHci.acl'), count: nAcl } });
  return { view: 'tree', rows, columns: [{ id: 'name', label: t('stats.topic') }, { id: 'count', label: t('stats.count'), num: true }], note: nCmd + nEvt + nAcl ? '' : t('stats.empty') };
}

export function btAttServer(src, t) {
  const attrs = new Map(); // `${device}|${handle}` → { device, handle, uuid, first }
  const put = (device, handle, uuid, no) => {
    const key = `${device}|${handle}`;
    if (!attrs.has(key)) attrs.set(key, { device, handle, uuid, no });
  };
  for (const frame of src.frames) {
    const d = src.get(frame);
    const op = first(d, 'btatt.opcode');
    if (op == null) continue;
    const device = first(d, 'bluetooth.src') ?? '';
    const handles = all(d, 'btatt.handle');
    const uuids = all(d, 'btatt.uuid16');
    if (op === 0x11) handles.forEach((h, i) => put(device, h, uuids[i] ?? null, frame.no)); // services (the 0x2800 UUID is not in the list)
    else if (op === 0x09) {
      const values = all(d, 'btatt.characteristic_value_handle');
      handles.forEach((h, i) => { if (values[i] != null) { put(device, h, 0x2803, frame.no); put(device, values[i], uuids[i] ?? null, frame.no); } });
    } else if (op === 0x05) handles.forEach((h, i) => put(device, h, uuids[i] ?? null, frame.no));
  }
  const svcNames = new Set([0x1800, 0x1801, 0x180a, 0x180d, 0x180f, 0x1810, 0x1812, 0x1816, 0x181a, 0x181c, 0x1809, 0x1805]);
  const rows = [...attrs.values()].sort((a, b) => a.device.localeCompare(b.device) || a.handle - b.handle).map((a, i) => ({
    id: String(i), no: a.no, filter: `btatt.handle == ${hex4(a.handle)}`,
    cells: {
      handle: hex4(a.handle), uuid: a.uuid != null ? hex4(a.uuid) : '', name: a.uuid != null ? UUIDS[a.uuid] ?? FIELDS.get('btatt.uuid16')?.strings?.[a.uuid] ?? t('btAtt.unknown') : '',
      kind: a.uuid == null ? '' : svcNames.has(a.uuid) ? t('btAtt.service') : a.uuid === 0x2803 ? t('btAtt.declaration') : a.uuid >= 0x2900 && a.uuid < 0x2a00 ? t('btAtt.descriptor') : t('btAtt.characteristic'),
      device: a.device,
    },
  }));
  return table([
    { id: 'handle', label: 'Handle' }, { id: 'uuid', label: 'UUID' }, { id: 'name', label: t('btAtt.name') }, { id: 'kind', label: t('btAtt.kind') }, { id: 'device', label: t('btAtt.device') },
  ], rows, { note: rows.length ? '' : t('stats.empty') });
}
