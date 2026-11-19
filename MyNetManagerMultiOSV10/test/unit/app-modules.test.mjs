// Unit tests of the app-side modules: settings, the network map topology, the automatic analysis and
// report, the print layout, the popup kinds (JS ↔ Rust) and the i18n dictionaries.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultSettings, loadSettings, normalizeColumns, normalizeSettings, pushRecentFilter, resetForNewInstall, STORAGE_KEY, zoomStep } from '../../src/domain/settings.js';
import { buildTopology, isLocalAddress, layoutTopology, subnetOf } from '../../src/domain/analysis/topology.js';
import { analyzeCapture, buildReport } from '../../src/domain/analysis/findings.js';
import { defaultPrintOptions, layoutPrint, pageMetrics, wrapLine } from '../../src/print/packets.js';
import { loadSavedFilters, storeSavedFilters } from '../../src/domain/filters-store.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** A fake dissection: fields from a plain object ({ 'ip.src': '10.0.0.1', ... }). */
function fake(values, { protocol = 'TCP', expert = [] } = {}) {
  const fields = new Map();
  for (const [k, v] of Object.entries(values)) fields.set(k, (Array.isArray(v) ? v : [v]).map((value) => ({ abbrev: k, value, label: `${k}: ${value}` })));
  return { fields, columns: { protocol }, expert, layers: ['frame'], tree: [], sources: [] };
}
const frame = (no, len = 100, sec = 1700000000 + no) => ({ no, sec, nsec: 0, len, caplen: len, data: new Uint8Array(len) });
const memoryStorage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), key: (i) => [...m.keys()][i], get length() { return m.size; } }; };

// ───────────────────────── settings

test('settings: defaults normalize to themselves and repair bad values', () => {
  const s = normalizeSettings({}, 'ko');
  assert.equal(s.language, 'ko');
  assert.equal(s.timeFormat, 'relative');
  assert.equal(s.showLeftPanel, true);
  assert.equal(s.showBottomPanel, true);
  const bad = normalizeSettings({ timeFormat: 'nope', textZoom: 9999, columns: 'x', leftWidth: 5, bottomTab: 'x', timePrecision: '6', decodeAs: [{ table: 'tcp.port', proto: 'http', value: 8080 }, { junk: 1 }] }, 'en');
  assert.equal(bad.timeFormat, 'relative');
  assert.equal(bad.textZoom, 250);
  assert.equal(bad.leftWidth, 180);
  assert.equal(bad.bottomTab, 'problems');
  assert.equal(bad.timePrecision, 6);
  assert.equal(bad.decodeAs.length, 1);
  assert.deepEqual(bad.columns.map((c) => c.kind), defaultSettings().columns.map((c) => c.kind));
});

test('settings: columns keep custom field columns and drop broken ones', () => {
  const cols = normalizeColumns([{ id: 'a', kind: 'no', width: 50 }, { kind: 'field', field: 'tcp.window_size', width: 120 }, { kind: 'field' }, { kind: 'nonsense' }]);
  assert.equal(cols.length, 2);
  assert.equal(cols[1].field, 'tcp.window_size');
});

test('settings: recent filters, zoom steps, install reset keeps user data', () => {
  assert.deepEqual(pushRecentFilter(['tcp', 'udp'], 'udp'), ['udp', 'tcp']);
  assert.equal(zoomStep(100, 1), 110);
  assert.equal(zoomStep(100, -1), 90);
  const storage = memoryStorage();
  storage.setItem(STORAGE_KEY, JSON.stringify({ theme: 'dark', recentDisplayFilters: ['dns'], captureInterface: 'eth0' }));
  storage.setItem('mynetmanager.recent.v1', '[{"path":"a.pcapng"}]');
  assert.equal(resetForNewInstall(storage, 'token-1'), true);
  const after = loadSettings(storage);
  assert.equal(after.theme, 'light');
  assert.deepEqual(after.recentDisplayFilters, ['dns']);
  assert.equal(after.captureInterface, 'eth0');
  assert.ok(storage.getItem('mynetmanager.recent.v1'));
  assert.equal(resetForNewInstall(storage, 'token-1'), false);
});

test('saved filters: defaults, round trip, cleaning', () => {
  const storage = memoryStorage();
  const saved = loadSavedFilters(storage);
  assert.ok(saved.display.length > 3 && saved.capture.length > 3);
  saved.display.push({ name: 'x', filter: '  ip  ', button: true }, { name: 'empty', filter: '' });
  storeSavedFilters(saved, storage);
  const again = loadSavedFilters(storage);
  assert.equal(again.display.at(-1).filter, 'ip');
  assert.equal(again.display.at(-1).button, true);
});

// ───────────────────────── network map

function lanCapture() {
  // 192.168.0.10 and .20 on the LAN; the gateway 192.168.0.1 (MAC gw) carries traffic to two internet hosts.
  const gw = '00:11:22:33:44:01';
  const a = '00:11:22:33:44:10';
  const b = '00:11:22:33:44:20';
  const rows = [
    [{ 'eth.src': a, 'eth.dst': gw, 'ip.src': '192.168.0.10', 'ip.dst': '93.184.216.34', 'tcp.srcport': 50000, 'tcp.dstport': 443, 'tcp.flags.syn': true, 'tcp.flags.ack': false }],
    [{ 'eth.src': gw, 'eth.dst': a, 'ip.src': '93.184.216.34', 'ip.dst': '192.168.0.10', 'tcp.srcport': 443, 'tcp.dstport': 50000, 'tcp.flags.syn': true, 'tcp.flags.ack': true }],
    [{ 'eth.src': b, 'eth.dst': gw, 'ip.src': '192.168.0.20', 'ip.dst': '8.8.8.8', 'udp.srcport': 5353, 'udp.dstport': 53 }, 'DNS'],
    [{ 'eth.src': gw, 'eth.dst': b, 'ip.src': '8.8.8.8', 'ip.dst': '192.168.0.20', 'udp.srcport': 53, 'udp.dstport': 5353, 'dns.flags.response': true, 'dns.qry.name': 'dns.google', 'dns.a': '8.8.8.8' }, 'DNS'],
    [{ 'eth.src': a, 'eth.dst': b, 'ip.src': '192.168.0.10', 'ip.dst': '192.168.0.20', 'tcp.srcport': 51000, 'tcp.dstport': 445 }],
    [{ 'eth.src': gw, 'eth.dst': 'ff:ff:ff:ff:ff:ff', 'arp.src.hw_mac': gw, 'arp.src.proto_ipv4': '192.168.0.1' }, 'ARP'],
    [{ 'eth.src': a, 'eth.dst': gw, 'ip.src': '192.168.0.10', 'ip.dst': '1.1.1.1', 'tcp.srcport': 50001, 'tcp.dstport': 80, 'http.request': true, 'http.host': 'one.one.one.one' }, 'HTTP'],
  ];
  const frames = rows.map((_, i) => frame(i + 1));
  const dissections = rows.map(([values, proto]) => fake(values, { protocol: proto ?? 'TCP' }));
  const summaries = dissections.map((d, i) => ({ no: i + 1, protocol: d.columns.protocol }));
  return { frames, summaries, get: (i) => dissections[i], gw };
}

test('topology: local hosts, the gateway, external hosts, names and roles', () => {
  const { frames, summaries, get, gw } = lanCapture();
  const topo = buildTopology(frames, summaries, get);
  const ids = topo.nodes.map((n) => n.id);
  assert.ok(ids.includes(`router:${gw}`), 'gateway found');
  assert.ok(ids.includes('host:192.168.0.10'));
  assert.ok(ids.includes('host:192.168.0.20'));
  assert.ok(ids.includes('ext:93.184.216.34'));
  const router = topo.nodes.find((n) => n.kind === 'router');
  assert.deepEqual(router.ips, ['192.168.0.1']);
  assert.equal(router.filter, `eth.addr == ${gw}`);
  const ext = topo.nodes.find((n) => n.id === 'ext:93.184.216.34');
  assert.ok(ext.roles.includes('web'), 'SYN+ACK sender is a web server');
  assert.equal(topo.nodes.find((n) => n.id === 'ext:8.8.8.8').name, 'dns.google');
  assert.equal(topo.nodes.find((n) => n.id === 'ext:1.1.1.1').name, 'one.one.one.one');
  // Off-link traffic runs host — router — external; on-link host — host.
  const link = (x, y) => topo.links.find((l) => (l.source === x && l.target === y) || (l.source === y && l.target === x));
  assert.ok(link('host:192.168.0.10', `router:${gw}`));
  assert.ok(link(`router:${gw}`, 'ext:93.184.216.34'));
  assert.ok(link('host:192.168.0.10', 'host:192.168.0.20'));
  assert.equal(link('host:192.168.0.10', 'host:192.168.0.20').filter, 'ip.addr == 192.168.0.10 && ip.addr == 192.168.0.20');
  for (const node of topo.nodes) assert.ok(node.filter, `${node.id} has a filter`);
  assert.equal(topo.subnets.find((s) => s.id === '192.168.0.0/24')?.filter, 'ip.addr == 192.168.0.0/24');
});

test('topology: external hosts beyond the limit go into one Internet node', () => {
  const frames = [];
  const dissections = [];
  for (let i = 0; i < 30; i += 1) {
    frames.push(frame(i + 1));
    dissections.push(fake({ 'eth.src': '00:00:00:00:00:0a', 'eth.dst': '00:00:00:00:00:01', 'ip.src': '10.0.0.5', 'ip.dst': `203.0.113.${i + 1}` }));
  }
  const topo = buildTopology(frames, [], (i) => dissections[i], { maxExternal: 10 });
  assert.equal(topo.nodes.filter((n) => n.kind === 'external').length, 10);
  const internet = topo.nodes.find((n) => n.kind === 'internet');
  assert.equal(internet.count, 20);
  assert.match(internet.filter, /^ip\.addr in \{/);
});

test('topology: address helpers and every layout gives every node a place', () => {
  assert.equal(isLocalAddress('192.168.1.2'), true);
  assert.equal(isLocalAddress('8.8.8.8'), false);
  assert.equal(isLocalAddress('fe80::1'), true);
  assert.equal(subnetOf('10.1.2.3'), '10.1.2.0/24');
  assert.equal(subnetOf('2001:db8:1:2::5'), '2001:db8:1:2::/64');
  const { frames, summaries, get } = lanCapture();
  const topo = buildTopology(frames, summaries, get);
  for (const mode of ['subnet', 'force', 'radial']) {
    const pos = layoutTopology(topo, { width: 900, height: 600, mode, iterations: 50 });
    for (const n of topo.nodes) {
      const p = pos.get(n.id);
      assert.ok(p && Number.isFinite(p.x) && Number.isFinite(p.y), `${mode}: ${n.id}`);
    }
  }
});

// ───────────────────────── analysis and report

test('findings: TCP trouble, DNS/HTTP errors, old TLS, cleartext logins, IP conflicts, scans', () => {
  const rows = [];
  for (let i = 0; i < 10; i += 1) rows.push(fake({ tcp: true, 'ip.src': '10.0.0.1', 'ip.dst': '10.0.0.2', 'tcp.analysis.retransmission': i < 3 ? true : [] }));
  rows.push(fake({ dns: true, 'dns.flags.response': true, 'dns.flags.rcode': 3 }, { protocol: 'DNS' }));
  rows.push(fake({ http: true, 'http.response.code': 503 }, { protocol: 'HTTP' }));
  rows.push(fake({ tls: true, 'tls.handshake.type': 1, 'tls.handshake.version': 0x0301 }, { protocol: 'TLSv1' }));
  rows.push(fake({ ftp: true, 'ftp.request.command': 'PASS' }, { protocol: 'FTP' }));
  rows.push(fake({ 'arp.src.proto_ipv4': '10.0.0.9', 'arp.src.hw_mac': 'aa:aa:aa:aa:aa:aa' }, { protocol: 'ARP' }));
  rows.push(fake({ 'arp.src.proto_ipv4': '10.0.0.9', 'arp.src.hw_mac': 'bb:bb:bb:bb:bb:bb' }, { protocol: 'ARP' }));
  for (let port = 1; port <= 25; port += 1) rows.push(fake({ tcp: true, 'ip.src': '10.6.6.6', 'ip.dst': '10.0.0.2', 'tcp.flags.syn': true, 'tcp.flags.ack': false, 'tcp.dstport': port }));
  rows[0].expert.push({ severity: 'warn', group: 'Sequence', message: 'retransmission', abbrev: 'tcp.analysis.retransmission' });
  // Fields that hold [] mean "absent".
  for (const d of rows) for (const [k, v] of [...d.fields]) if (v.length === 1 && Array.isArray(v[0].value)) d.fields.delete(k);
  const frames = rows.map((_, i) => frame(i + 1));
  const result = analyzeCapture(frames, rows.map((d) => ({ protocol: d.columns.protocol })), (f) => rows[f.no - 1]);
  const keys = result.findings.map((f) => f.key);
  for (const key of ['retrans', 'dnsErrors', 'http5xx', 'oldTls', 'cleartextCredentials', 'duplicateIp', 'portScan']) assert.ok(keys.includes(key), key);
  assert.ok(!keys.includes('healthy'));
  assert.equal(result.problems.length, 1);
  assert.equal(result.findings[0].severity, 'error');
  assert.ok(result.findings.every((f) => f.key === 'cleartextProtocols' || f.filter || f.key === 'multipleDhcp'));
  assert.equal(result.overview.packets, rows.length);
});

test('findings: a clean capture says so; the report has every chosen section in three forms', () => {
  const rows = [fake({ 'ip.src': '10.0.0.1', 'ip.dst': '10.0.0.2', udp: true }, { protocol: 'UDP' })];
  const result = analyzeCapture([frame(1)], [{ protocol: 'UDP' }], () => rows[0]);
  assert.equal(result.findings[0].key, 'healthy');
  const t = (key, params) => `${key}${params ? JSON.stringify(params) : ''}`;
  const report = buildReport({ title: 'x.pcapng', analysis: result, log: [{ time: Date.now(), level: 'info', text: 'opened' }] }, new Set(['overview', 'findings', 'protocols', 'talkers', 'problems', 'log']), t);
  for (const key of ['report.overview', 'report.findings', 'report.protocols', 'report.talkers', 'report.problemList', 'report.log']) {
    assert.ok(report.html.includes(key) && report.markdown.includes(key) && report.lines.some((l) => l.includes(key)), key);
  }
  assert.match(report.html, /^<!doctype html>/);
  assert.ok(report.markdown.includes('| '));
});

// ───────────────────────── print layout

test('print: metrics follow paper, orientation, margin and font size', () => {
  const portrait = pageMetrics({ paper: 'A4', orientation: 'portrait', fontSize: 9 });
  const landscape = pageMetrics({ paper: 'A4', orientation: 'landscape', fontSize: 9 });
  assert.ok(landscape.chars > portrait.chars && landscape.lines < portrait.lines);
  assert.ok(pageMetrics({ fontSize: 12 }).lines < pageMetrics({ fontSize: 8 }).lines);
  assert.ok(pageMetrics({ margin: 'wide' }).chars < pageMetrics({ margin: 'narrow' }).chars);
  assert.deepEqual(wrapLine('    abcdefghij', 8), ['    abcd', '    efgh', '    ij']);
  assert.deepEqual(wrapLine('  abcdefghijklmn', 10), ['  abcdefgh', '    ijklmn']);
});

test('print: packets are laid on pages, a packet that fits is not split, new page per packet works', () => {
  const metrics = pageMetrics(defaultPrintOptions());
  const packet = (n, lines) => ({ no: n, lines: Array.from({ length: lines }, (_, i) => `packet ${n} line ${i}`) });
  const model = { title: 't', packets: [packet(1, metrics.lines - 5), packet(2, 10), packet(3, 3)] };
  const layout = layoutPrint(model, defaultPrintOptions(), { t: (k, p) => `${p?.n}/${p?.total}` });
  assert.equal(layout.count, 2);
  assert.ok(layout.pages[1].html.includes('packet 2 line 0'), 'packet 2 moved to page 2 whole');
  assert.ok(layout.pages[0].html.includes('1/2'));
  const each = layoutPrint(model, { ...defaultPrintOptions(), newPage: true });
  assert.equal(each.count, 3);
  assert.equal(layoutPrint({ packets: [] }, defaultPrintOptions()).count, 0);
  const huge = layoutPrint({ packets: [packet(1, metrics.lines * 2 + 1)] }, defaultPrintOptions());
  assert.equal(huge.count, 3);
});

// ───────────────────────── consistency checks

test('popup kinds: every kind the page opens is allowed by the Rust side', () => {
  const popups = fs.readFileSync(path.join(root, 'src', 'platform', 'popups.js'), 'utf8');
  const lib = fs.readFileSync(path.join(root, 'src-tauri', 'src', 'lib.rs'), 'utf8');
  const kinds = [...popups.slice(popups.indexOf('export const POPUPS'), popups.indexOf('};', popups.indexOf('export const POPUPS'))).matchAll(/^\s+(\w+): \{ width/gm)].map((m) => m[1]);
  const rust = lib.slice(lib.indexOf('POPUP_KINDS'), lib.indexOf('];', lib.indexOf('POPUP_KINDS')));
  assert.ok(kinds.length > 20);
  for (const kind of kinds) assert.ok(rust.includes(`"${kind}"`), `lib.rs POPUP_KINDS lacks "${kind}"`);
  const app = fs.readFileSync(path.join(root, 'src', 'app.js'), 'utf8');
  for (const m of app.matchAll(/popups\.open\('(\w+)'/g)) assert.ok(kinds.includes(m[1]), `POPUPS lacks "${m[1]}"`);
});

test('i18n: Korean and English have the same keys and every key the code uses', async () => {
  const load = async (name) => (await import(`../../src/i18n/${name}.js`)).default;
  const ko = { ...(await load('ko')), ...(await load('net-ko')) };
  const en = { ...(await load('en')), ...(await load('net-en')) };
  assert.deepEqual(Object.keys(ko).filter((k) => !(k in en)), []);
  assert.deepEqual(Object.keys(en).filter((k) => !(k in ko)), []);
  const used = new Set();
  const walk = (dir) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const f = path.join(dir, e.name); if (e.isDirectory()) { if (e.name !== 'i18n') walk(f); } else if (f.endsWith('.js')) for (const m of fs.readFileSync(f, 'utf8').matchAll(/\bt\(\s*'([A-Za-z0-9_.:-]+)'/g)) used.add(m[1]); } };
  walk(path.join(root, 'src'));
  const missing = [...used].filter((k) => !(k in ko) && k !== 'export.txt');
  assert.deepEqual(missing, []);
});
