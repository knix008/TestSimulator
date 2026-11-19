// Witness test: our display-filter engine, protocol hierarchy and conversations against Wireshark's
// tshark over the project's sample captures (samples/*.pcapng). Skips when tshark or the samples
// are missing. MYNETMANAGER_WITNESS_SAMPLES=<dir> points it at another folder of captures.
//
// All filters are evaluated by tshark in ONE pass per capture (a Lua tap per filter), so ~150
// filters × all samples take seconds instead of minutes. Without Lua it falls back to -Y per filter.
//
// Differences that come from the dissectors (a field they do not produce yet, a different tree
// shape), not from the filter engine, are listed in KNOWN with the reason; anything else fails.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TSHARK = [process.env.MYNETMANAGER_TSHARK, 'C:/Program Files/Wireshark/tshark.exe', '/usr/bin/tshark', '/usr/local/bin/tshark', '/opt/homebrew/bin/tshark', '/Applications/Wireshark.app/Contents/MacOS/tshark']
  .find((p) => p && fs.existsSync(p)) || null;
const SAMPLES = process.env.MYNETMANAGER_WITNESS_SAMPLES || path.join(ROOT, 'samples');
const files = fs.existsSync(SAMPLES) ? fs.readdirSync(SAMPLES).filter((f) => /\.pcapng?$/.test(f)).sort().map((f) => path.join(SAMPLES, f)) : [];
const skip = !TSHARK ? 'tshark (Wireshark) is not installed' : !files.length ? `no sample captures in ${SAMPLES}` : false;

export const FILTERS = [
  // protocols
  'tcp', 'udp', 'ip', 'ipv6', 'arp', 'http', 'tls', 'mbtcp', 'modbus', 'ftp-data', 'ssdp', 'nbns', 'llmnr', 'mdns', 'syslog', 'tftp', 'dtls', 'rtcp', 'slow', 'lacp', 'eap', 'pim', 'ppp', 'pppoed', 'ah', 'icmp', 'icmpv6', 'dns', 'eth', 'frame', 'data', 'vlan', 'llc', 'stp', 'lldp', 'cdp',
  'ospf', 'bgp', 'rip', 'vrrp', 'hsrp', 'igmp', 'gre', 'vxlan', 'esp', 'mpls', 'pppoes', 'lcp', 'eapol', 'radiotap', 'wlan',
  'dhcp', 'ntp', 'snmp', 'sip', 'rtp', 'sdp', 'mqtt', 'coap', 'smb2', 'quic', 'ssh', 'ftp', 'smtp', 'imf', 'websocket', 'http2',
  // logic
  '!tcp', 'tcp || udp', 'tcp && !http', 'not tcp and not udp', '!(tcp || udp || arp)', 'tcp xor udp', 'tcp ^^ ip',
  '(tcp.port == 80 || tcp.port == 443) && tcp.len > 0', 'tcp.port == 80 && !(tcp.flags.ack == 1)',
  // TCP
  'tcp.port == 80', 'tcp.port != 80', 'tcp.port == 443 || udp.port == 53', 'tcp.srcport == 80', 'tcp.dstport >= 1024',
  'tcp.dstport < 1024', 'tcp.flags.syn == 1', 'tcp.flags.syn == 1 && tcp.flags.ack == 0', 'tcp.flags.syn == 1 and tcp.flags.ack == 1',
  'tcp.flags.fin == 1', 'tcp.flags.reset == 1', 'tcp.flags.push == 1', 'tcp.flags == 0x012', 'tcp.flags & 0x02', 'tcp.flags & 0x11 == 0x11',
  'tcp.len > 0', 'tcp.len == 0', 'tcp.window_size_value > 1000', 'tcp.stream == 0', 'tcp.stream in {0, 1}', 'tcp.analysis.flags',
  'tcp.analysis.retransmission', 'tcp.analysis.duplicate_ack', 'tcp.seq == 1', 'tcp.ack == 1', 'tcp.hdr_len == 32',
  'tcp.options.mss_val == 1460', 'tcp.payload contains "HTTP"', 'tcp contains "GET"', 'tcp.port not in {80, 443}',
  'tcp.flags.syn == True', 'tcp.flags.syn == false', '@tcp.srcport == 00:50', '.tcp.port == 80',
  // UDP
  'udp.port == 53', 'udp.stream == 0', 'udp.stream == 1', 'ip.hdr_len == 20', 'ipv6.src == ::', 'frame.time_delta > 0.1', 'dns.qry.name == "www.example.com"', 'dns.a', 'dns.aaaa', 'http.request.full_uri contains "http://"', 'http.file_data contains "html"', 'tcp.analysis.ack_rtt > 0.01', 'tcp.time_delta > 0.5', 'ip.src_host contains "192"', 'eth.ig == 1', 'eth.lg == 0', 'udp.length > 100', 'udp.srcport in {53, 67, 68, 123, 161}', 'udp.dstport in {1024..65535}',
  // IPv4 / IPv6
  'ip.addr == 192.168.0.10', 'ip.src == 192.168.0.10', 'ip.dst == 192.168.0.10', 'ip.addr == 192.168.0.0/24',
  'ip.addr != 192.168.0.10', '!(ip.addr == 192.168.0.10)', 'ip.src == 192.168.0.0/16 && ip.dst != 192.168.0.0/16',
  'ip.dst == 224.0.0.0/4', 'ip.ttl < 64', 'ip.ttl == 64', 'ip.ttl in {1, 2, 3}', 'ip.proto == 6', 'ip.proto == 17', 'ip.proto == 1',
  'ip.flags.df == 1', 'ip.flags.mf == 1', 'ip.len > 500', 'ip.id == 0', 'ip.version == 4', 'ip.dsfield.dscp == 46',
  'ip.checksum.status == "Unverified"', 'ip.src > 10.0.0.0', 'ip.src#1 == 192.168.0.10', 'ip.addr#2', 'ip#2', 'count(ip) == 2',
  'count(ip.addr) > 2', 'any ip.addr == 192.168.0.10', 'all ip.addr == 192.168.0.10', 'ip.addr === 192.168.0.10',
  'ip.addr !== 192.168.0.10', 'ip.addr in {192.168.0.10, 192.168.0.1}', 'ip.addr in {192.168.0.0/24}', 'ip.src == ip.dst',
  'ipv6.addr == fe80::/10', 'ipv6.dst == ff02::1', 'ipv6.nxt == 58', 'ipv6.hlim == 255', 'icmpv6.type == 135', 'icmpv6.type in {133..137}',
  'icmp.type == 8', 'icmp.type == 0', 'icmp.type in {3..5, 11}', 'icmp.code == 0',
  // Ethernet / ARP
  'eth.addr == ff:ff:ff:ff:ff:ff', 'eth.dst == ff:ff:ff:ff:ff:ff', 'eth.dst[0] & 1', 'eth.src[0:3] == a4:83:e7', 'eth.src[0:3] == a4-83-e7',
  'eth.type == 0x0800', 'eth.type == 0x86dd', 'eth.type == 0x0806', 'eth.addr == a4.83.e7.12.34.56', 'vlan.id == 10',
  'arp.opcode == 1', 'arp.opcode == request', 'arp.opcode == 2', 'arp.dst.hw_mac == 00:00:00:00:00:00',
  // DNS
  'dns.flags.response == 0', 'dns.flags.response == 1', 'dns.flags.rcode == 3', 'dns.flags.rcode != 0', 'dns.qry.type == A',
  'dns.qry.type == AAAA', 'dns.qry.type == 28', 'dns.qry.type in {1, 28}', 'dns.qry.name contains "example"',
  'dns.qry.name matches "^www\\\\."', 'dns.qry.name matches "(?i)EXAMPLE"', 'dns.count.answers > 1', 'dns.resp.ttl > 3600',
  'lower(dns.qry.name) contains "google"', 'upper(dns.qry.name) contains "COM"', 'len(dns.qry.name) > 15',
  // HTTP / TLS / applications
  'http.request', 'http.response', 'http.request.method == "GET"', 'http.request.method == GET', 'http.request.method in {"GET", "POST"}',
  'http.request.method != "GET"', 'http.response.code == 200', 'http.response.code >= 400', 'http.response.code in {200..299}',
  'http.host contains "example"', 'http.request.uri contains ".png"', 'http.request.uri matches "\\\\.(css|js)$"',
  'http.content_type contains "image"', 'http.user_agent contains "Mozilla"', 'http.content_length > 1000', 'http.server',
  'tls.handshake.type == 1', 'tls.handshake.type == 2', 'tls.handshake.extensions_server_name contains "example"',
  'tls.record.content_type == 23', 'tls.record.version == 0x0303', 'tls.handshake.ciphersuite == 0x1301',
  'dhcp.option.dhcp == 1', 'dhcp.option.dhcp == 5', 'sip.Method == "INVITE"', 'rtp.p_type == 0', 'rtp.marker == 1', 'mqtt.msgtype == 3',
  'ftp.request.command == "USER"', 'smtp.req.command == "EHLO"', 'http2.type == 1', 'wlan.fc.type == 0', 'wlan.fc.type_subtype == 8',
  // frame, slices, functions, arithmetic
  'frame.len > 1000', 'frame.len <= 60', 'frame.len >= 54 && frame.len <= 100', 'frame.number <= 10', 'frame.number in {1, 3, 5}',
  'frame.protocols contains "tcp:http"', 'frame.cap_len == frame.len', 'frame.time_relative > 1', 'frame.time_relative <= 0.5',
  'frame.time_epoch > 1700000000', 'frame[0] == 0xff', 'frame[0:6] == ff:ff:ff:ff:ff:ff', 'frame[12:2] == 08:00', 'frame[-4:] != 00:00:00:00',
  'frame contains "example"', 'frame matches "(?i)host:"', 'frame contains 47:45:54', 'len(frame) > 100', 'len(tcp.payload) > 100',
  'frame.len == len(frame)', 'data.len > 10', 'tcp.srcport + tcp.dstport > 50000', 'tcp.srcport - 1 == 79', 'tcp.srcport * 2 == 160',
  'tcp.dstport % 2 == 0', '-tcp.srcport < -1000', 'abs(-tcp.srcport) == 80', 'max(tcp.srcport, tcp.dstport) == 443',
  'min(tcp.srcport, tcp.dstport) == 80', 'string(tcp.srcport) == "80"', 'string(ip.src) matches "^192\\\\.168"',
  'tcp.srcport < tcp.dstport', 'udp.srcport == udp.dstport', '_ws.expert', '_ws.malformed',
];

// filter → reason (or { files: [...], reason }) for differences caused by the dissectors.
export const KNOWN = {
  'ip.hdr_len == 20': 'dissector: ip.hdr_len holds the header length in 32-bit words (5); Wireshark stores bytes (20)',
  http: { files: ['websocket-http2.pcapng'], reason: 'dissector: WebSocket frames after the upgrade carry an http tree item; Wireshark shows them as websocket only' },
  'tcp && !http': { files: ['websocket-http2.pcapng'], reason: 'same as http: WebSocket frames have an http item' },
  tls: 'dissector: TLS records split over TCP segments are reassembled in a different frame than Wireshark',
  'http.request': { files: ['mixed-office-lan.pcapng'], reason: 'dissector: SSDP NOTIFY messages get http.request (Wireshark has no http.request on SSDP)' },
  '_ws.expert': 'dissector: expert items differ (missing ICMP/routing experts, extra QUIC/name-service ones)',
};

const LUA = `
local filters = {}
for line in io.lines(os.getenv("MNM_FILTERS")) do filters[#filters + 1] = line end
local out = io.open(os.getenv("MNM_OUT"), "w")
for i, f in ipairs(filters) do
  local ok, tap = pcall(Listener.new, nil, f)
  if ok and tap then
    tap.packet = function(pinfo) out:write(i, "\\t", pinfo.number, "\\n") end
  else
    out:write(i, "\\tERR\\n")
  end
end
local done = Listener.new(nil, nil)
done.draw = function() out:flush() end
`;

function tsharkMatches(file, filters, tmp) {
  const fl = path.join(tmp, 'filters.txt');
  const outFile = path.join(tmp, 'out.txt');
  fs.writeFileSync(fl, filters.join('\n') + '\n');
  fs.writeFileSync(path.join(tmp, 'multi.lua'), LUA);
  try { fs.rmSync(outFile); } catch { /* none */ }
  const res = filters.map(() => []);
  try {
    execFileSync(TSHARK, ['-r', file, '-q', '-X', 'lua_script:' + path.join(tmp, 'multi.lua')], {
      env: { ...process.env, MNM_FILTERS: fl, MNM_OUT: outFile }, stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000,
    });
    for (const line of fs.readFileSync(outFile, 'utf8').split('\n')) {
      if (!line) continue;
      const [i, v] = line.split('\t');
      if (v === 'ERR') res[i - 1] = 'ERR'; else if (res[i - 1] !== 'ERR') res[i - 1].push(Number(v));
    }
    return res;
  } catch {
    // no Lua: one -Y run per filter
    return filters.map((f) => {
      try {
        return execFileSync(TSHARK, ['-r', file, '-Y', f, '-T', 'fields', '-e', 'frame.number'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
          .split(/\s+/).filter(Boolean).map(Number);
      } catch { return 'ERR'; }
    });
  }
}

async function loadOurs(file) {
  const { createSession, dissect, FIELDS } = await import('../../src/domain/dissect/index.js');
  const { readCapture } = await import('../../src/domain/capture/pcap.js');
  const cap = readCapture(new Uint8Array(fs.readFileSync(file)), path.basename(file));
  const session = createSession(cap);
  const summaries = cap.frames.map((f) => session.firstPass(f));
  const cache = new Map();
  const getD = (f) => { let d = cache.get(f.no); if (!d) cache.set(f.no, d = dissect(session, f)); return d; };
  return { cap, summaries, getD, FIELDS };
}

const fmt = (a) => (a === 'ERR' ? 'ERR' : a.length > 25 ? a.slice(0, 25).join(' ') + ` … (${a.length})` : a.join(' '));

test('display filters match tshark on the sample captures', { skip, timeout: 900000 }, async () => {
  const { compileFilter } = await import('../../src/domain/filter/index.js');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mnm-witness-'));
  const unexplained = [];
  const explained = [];
  const errors = [];
  const unregistered = new Set();
  let compared = 0;
  try {
    for (const file of files) {
      const { cap, getD, FIELDS } = await loadOurs(file);
      const ds = cap.frames.map(getD);
      const theirs = tsharkMatches(file, FILTERS, tmp);
      FILTERS.forEach((f, i) => {
        const c = compileFilter(f, { fields: FIELDS });
        const t = theirs[i];
        if (t === 'ERR') {
          // tshark does not know the field/protocol at all; ours must not crash either way
          return;
        }
        compared++;
        if (!c.ok) {
          // a protocol/field the dissectors do not register yet is a dissector gap, not an engine error
          if (c.code === 'unknown-field') unregistered.add(c.args?.name || f); else errors.push(`${f}: ${c.error}`);
          return;
        }
        const ours = [];
        ds.forEach((d, k) => { if (c.test(d)) ours.push(cap.frames[k].no); });
        if (ours.join() === t.join()) return;
        const k = KNOWN[f];
        const why = k && (typeof k === 'string' ? k : (!k.files || k.files.includes(path.basename(file))) ? k.reason : null);
        const line = `${path.basename(file)}  ${f}\n      tshark: ${fmt(t)}\n      ours:   ${fmt(ours)}`;
        (why ? explained : unexplained).push(why ? `${line}\n      reason: ${why}` : line);
      });
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log(`compared ${compared} filter×capture results over ${files.length} captures; ${explained.length} known dissector differences, ${unexplained.length} unexplained`);
  if (unregistered.size) console.log(`fields/protocols tshark knows but our dissectors do not register: ${[...unregistered].join(', ')}`);
  if (explained.length && process.env.MYNETMANAGER_WITNESS_VERBOSE) console.log(explained.join('\n'));
  if (unexplained.length) console.log('UNEXPLAINED\n' + unexplained.join('\n'));
  assert.deepEqual([...new Set(errors)], [], 'filters tshark accepts must compile');
  assert.equal(unexplained.length, 0, `${unexplained.length} unexplained differences`);
});

// Protocol hierarchy (-z io,phs) and TCP/UDP/IP conversations (-z conv,…) on a few captures.
const STATS_FILES = ['http-page-load', 'dns-queries', 'tunnels', 'ftp-session', 'sip-call-rtp', 'ping-traceroute'];
// capture → reason when the dissectors' tree shape makes the hierarchy differ
export const KNOWN_STATS = {};

test('protocol hierarchy and conversations match tshark', { skip, timeout: 300000 }, async () => {
  const st = await import('../../src/domain/analysis/stats.js');
  const picked = files.filter((f) => STATS_FILES.some((s) => path.basename(f).startsWith(s)));
  const chosen = picked.length ? picked : files.slice(0, 4);
  const problems = [];
  for (const file of chosen) {
    const name = path.basename(file);
    const { cap, summaries, getD } = await loadOurs(file);
    const phs = st.formatProtocolHierarchy(st.protocolHierarchy(cap.frames, summaries, getD, {}));
    const tp = execFileSync(TSHARK, ['-r', file, '-q', '-z', 'io,phs'], { encoding: 'utf8' }).replace(/\r/g, '');
    const norm = (x) => x.split('\n').filter((l) => /frames:\d/.test(l)).map((l) => l.replace(/^(\s*)(\S+?)\s*frames:/, '$1$2 frames:').trimEnd()).join('\n');
    if (norm(phs) !== norm(tp) && !KNOWN_STATS[name]) problems.push(`${name} protocol hierarchy\n${norm(phs)}\n--- tshark\n${norm(tp)}`);
    for (const kind of ['tcp', 'udp', 'ip', 'eth']) {
      const ours = st.conversations(cap.frames, summaries, getD, { kind }).rows
        .map((r) => `${r.addrA}${r.portA != null ? ':' + r.portA : ''} ${r.addrB}${r.portB != null ? ':' + r.portB : ''} ${r.packetsBA} ${r.packetsAB} ${r.packets} ${r.bytes} ${r.relStart.toFixed(4)} ${r.duration.toFixed(4)}`).sort();
      const out = execFileSync(TSHARK, ['-r', file, '-q', '-z', `conv,${kind}`, '-N', 'n', '-o', 'nameres.mac_name:FALSE'], { encoding: 'utf8' }).replace(/\r/g, '');
      const re = /^(\S+)\s+<->\s+(\S+)\s+(\d+)\s+([\d.]+) (\S+)\s+(\d+)\s+([\d.]+) (\S+)\s+(\d+)\s+([\d.]+) (\S+)\s+([\d.]+)\s+([\d.]+)/;
      const tsRows = out.split('\n').filter((l) => l.includes('<->')).map((l) => re.exec(l.trim())).filter(Boolean);
      const theirs = tsRows.map((m) => `${m[1]} ${m[2]} ${m[3]} ${m[6]} ${m[9]} ${m[11] === 'bytes' ? m[10] : '~'} ${Number(m[12]).toFixed(4)} ${Number(m[13]).toFixed(4)}`).sort();
      // tshark prints large byte totals rounded ("12 kB"); compare those by packets only
      const oursCmp = ours.map((o, i) => (theirs[i] && theirs[i].split(' ')[5] === '~' ? o.split(' ').map((x, k) => (k === 5 ? '~' : x)).join(' ') : o));
      if (oursCmp.join('\n') !== theirs.join('\n') && !KNOWN_STATS[`${name}:${kind}`]) problems.push(`${name} conv,${kind}\nours:\n${oursCmp.join('\n')}\ntshark:\n${theirs.join('\n')}`);
    }
  }
  if (problems.length) console.log(problems.join('\n\n'));
  assert.equal(problems.length, 0, `${problems.length} statistics differ from tshark`);
});
