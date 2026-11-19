// Witness test: our dissector against Wireshark's tshark on every capture in samples/.
// Skips cleanly when tshark is not installed. Runs tshark only on files in samples/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { readCapture } from '../../src/domain/capture/pcap.js';
import { createSession, dissect, FIELDS } from '../../src/domain/dissect/index.js';

const root = path.join(import.meta.dirname, '..', '..');
const samplesDir = path.join(root, 'samples');

function findTshark() {
  const candidates = [];
  if (process.env.TSHARK) candidates.push(process.env.TSHARK);
  if (process.platform === 'win32') candidates.push('C:\\Program Files\\Wireshark\\tshark.exe');
  candidates.push('tshark');
  for (const c of candidates) {
    const r = spawnSync(c, ['--version'], { encoding: 'utf8' });
    if (r.status === 0 && /TShark/.test(r.stdout)) return { exe: c, version: r.stdout.split(/\r?\n/)[0] };
  }
  return null;
}
const TSHARK = findTshark();
const files = fs.existsSync(samplesDir) ? fs.readdirSync(samplesDir).filter((f) => f.endsWith('.pcapng')).sort() : [];
const skip = !TSHARK ? 'tshark not found (install Wireshark or set TSHARK)' : files.length ? false : 'no samples (npm run samples)';

// Compared per frame: protocols, the Protocol/Info columns and these fields (all occurrences).
const FIELD_LIST = [
  'eth.src', 'eth.dst', 'eth.type', 'eth.stream', 'vlan.id', 'arp.opcode', 'arp.src.proto_ipv4', 'arp.dst.proto_ipv4',
  'ip.src', 'ip.dst', 'ip.proto', 'ip.ttl', 'ip.id', 'ip.len', 'ip.stream', 'ipv6.src', 'ipv6.dst', 'ipv6.nxt', 'ipv6.stream',
  'icmp.type', 'icmp.code', 'icmp.resp_in', 'icmp.resp_to', 'icmpv6.type', 'icmpv6.code',
  'udp.srcport', 'udp.dstport', 'udp.length', 'udp.stream',
  'tcp.srcport', 'tcp.dstport', 'tcp.stream', 'tcp.len', 'tcp.seq', 'tcp.ack', 'tcp.nxtseq', 'tcp.flags', 'tcp.window_size',
  'tcp.window_size_scalefactor', 'tcp.completeness', 'tcp.analysis.acks_frame', 'tcp.analysis.ack_rtt', 'tcp.analysis.initial_rtt',
  'tcp.analysis.bytes_in_flight', 'tcp.analysis.push_bytes_sent', 'tcp.analysis.duplicate_ack_num', 'tcp.analysis.duplicate_ack_frame',
  'tcp.analysis.rto_frame', 'tcp.reassembled_in', 'tcp.segment', 'tcp.options.mss_val', 'tcp.options.wscale.shift',
  'dns.id', 'dns.qry.name', 'dns.qry.type', 'dns.a', 'dns.aaaa', 'dns.cname', 'dns.response_in', 'dns.response_to',
  'dhcp.option.dhcp', 'dhcp.ip.your', 'ntp.mode', 'snmp.name', 'syslog.msg', 'tftp.opcode',
  'http.request.method', 'http.request.uri', 'http.host', 'http.response.code', 'http.content_type', 'http.content_length', 'http.response_in', 'http.request_in',
  'tls.record.content_type', 'tls.handshake.type', 'tls.handshake.extensions_server_name', 'tls.handshake.ciphersuite', 'tls.handshake.ja3',
  'quic.long.packet_type', 'quic.version', 'ssh.protocol', 'ftp.request.command', 'ftp.response.code', 'smtp.req.command', 'smtp.response.code',
  'sip.Method', 'sip.Status-Code', 'sip.Call-ID', 'rtp.ssrc', 'rtp.seq', 'rtp.p_type', 'rtcp.pt', 'mqtt.msgtype', 'mqtt.topic',
  'mbtcp.trans_id', 'modbus.func_code', 'coap.code', 'coap.mid', 'smb2.cmd', 'smb2.msg_id',
  'ospf.msg', 'bgp.type', 'rip.command', 'stp.type', 'lldp.tlv.type', 'wlan.fc.type_subtype', 'wlan.ssid', 'gre.proto', 'vxlan.vni',
  'data.len',
];

// Differences we keep on purpose: [file, frame number, column/field, reason].
const KEPT = [
  ['mixed-office-lan.pcapng', '*', '_ws.col.info',
    'Wireshark artifact: when a fast retransmission completes a reassembled TLS PDU, TLS appends ", Application Data" with a separator after the fenced "[TCP Fast Retransmission] " prefix'],
  ['*', '*', 'wlan.ssid', 'Empty SSID: tshark prints "<MISSING>", we keep an empty byte string'],
];
function kept(file, no, field) {
  return KEPT.some(([f, n, k]) => (f === '*' || f === file) && (n === '*' || n === no) && k === field);
}

let fieldNames = null;
function wsFields() {
  if (!fieldNames) {
    const out = execFileSync(TSHARK.exe, ['-G', 'fields'], { maxBuffer: 1 << 29, encoding: 'utf8' });
    fieldNames = new Map();
    for (const l of out.split(/\r?\n/)) { const c = l.split('\t'); if (c[0] === 'F' || c[0] === 'P') fieldNames.set(c[2], c[1]); }
  }
  return fieldNames;
}

/** tshark -T fields escapes backslashes and control characters; undo it to compare raw strings. */
function unescapeTshark(s) {
  return s.replace(/\\(\\|n|r|t|x[0-9a-fA-F]{2})/g, (m, c) => (c === '\\' ? '\\' : c === 'n' ? '\n' : c === 'r' ? '\r' : c === 't' ? '\t' : String.fromCharCode(parseInt(c.slice(1), 16))));
}
function ours(n) {
  const v = n.value;
  if (v == null) return '';
  if (v instanceof Uint8Array) return Array.from(v, (b) => b.toString(16).padStart(2, '0')).join('');
  if (typeof v === 'boolean') return v ? 'True' : 'False';
  if (n.type === 'rel_time') return v.toFixed(9);
  if (typeof v === 'object') return '';
  if (n.type === 'uint' && FIELDS.get(n.abbrev)?.base === 'hex') return '0x' + v.toString(16).padStart((FIELDS.get(n.abbrev).bits || 8) / 4, '0');
  return String(v);
}
function same(a, b) {
  if (a === b) return true;
  const x = a.split(','), y = b.split(',');
  if (x.length !== y.length) return false;
  return x.every((p, i) => p === y[i] || (p !== '' && !isNaN(+p) && Math.abs(+p - +y[i]) < 2e-6) || (/^0x/.test(p) && +p === +y[i]));
}

test('tshark is available for the witness comparison', { skip }, () => {
  assert.match(TSHARK.version, /TShark/);
});

test('field names that Wireshark also has use Wireshark\'s names', { skip }, () => {
  const ws = wsFields();
  // Ours differ on purpose: the details-pane label uses the Wireshark text, the registry name is shorter or plural.
  const allowed = new Set(['sll', 'slow', 'radiotap', 'icmp.resp_not_found', 'icmpv6.resp_not_found', 'dhcp.option.nis_server', 'dhcp.option.ntp_server',
    'dhcp.option.captive_portal', 'tls.quic.parameter.active_connection_id_limit', 'tls.quic.parameter.initial_source_connection_id', 'tls.quic.parameter.retry_source_connection_id']);
  const wrong = [];
  let known = 0;
  for (const [a, f] of FIELDS) {
    if (!ws.has(a)) continue;
    known++;
    if (ws.get(a) !== f.name && !allowed.has(a)) wrong.push(`${a}: Wireshark "${ws.get(a)}", ours "${f.name}"`);
  }
  assert.ok(known > FIELDS.size * 0.95, `${known} of ${FIELDS.size} fields exist in Wireshark`);
  assert.deepEqual(wrong, []);
});

for (const file of files) {
  test(`witness: ${file} matches tshark (protocols, columns, key fields)`, { skip }, () => {
    const ws = wsFields();
    const fields = ['frame.protocols', '_ws.col.protocol', '_ws.col.info', ...FIELD_LIST.filter((f) => ws.has(f))];
    const args = ['-n', '-2', '-r', path.join(samplesDir, file), '-T', 'fields', '-E', 'occurrence=a', '-E', 'separator=\t', '-E', 'aggregator=,'];
    for (const f of fields) args.push('-e', f);
    const lines = execFileSync(TSHARK.exe, args, { maxBuffer: 1 << 28, encoding: 'utf8' }).split(/\r?\n/).filter((l) => l.length);
    const cf = readCapture(new Uint8Array(fs.readFileSync(path.join(samplesDir, file))), file);
    assert.equal(lines.length, cf.frames.length, 'frame count');
    const s = createSession(cf, { resolve: { mac: false, transport: false, network: false } });
    for (const fr of cf.frames) s.firstPass(fr);
    const diffs = [];
    for (let i = 0; i < cf.frames.length; i++) {
      const w = lines[i].split('\t');
      const d = dissect(s, cf.frames[i]);
      const mine = [d.layers.slice(1).join(':'), d.columns.protocol, d.columns.info,
        ...fields.slice(3).map((f) => (d.fields.get(f) || []).map(ours).join(','))];
      for (let k = 0; k < fields.length; k++) {
        const a = unescapeTshark(w[k] ?? ''), b = mine[k] ?? '';
        if (same(a, b) || kept(file, i + 1, fields[k])) continue;
        diffs.push(`#${i + 1} ${fields[k]}\n    tshark: ${a}\n    ours:   ${b}`);
      }
    }
    assert.deepEqual(s.bugs, []);
    assert.ok(diffs.length === 0, `${diffs.length} differences:\n${diffs.slice(0, 25).join('\n')}`);
  });
}
