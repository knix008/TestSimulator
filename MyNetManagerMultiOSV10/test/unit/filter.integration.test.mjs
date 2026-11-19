// Filters and colouring over the real dissectors and sample captures, plus evaluation speed.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileFilter } from '../../src/domain/filter/index.js';
import { COLORING_RULES, compileRules, matchColor } from '../../src/domain/filter/coloring.js';
import { FIELDS as FIX, tcpPacket, udpDnsPacket, arpPacket, httpGet } from './filter.fixtures.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function loadSamples() {
  try {
    const dis = await import('../../src/domain/dissect/index.js');
    const { readCapture } = await import('../../src/domain/capture/pcap.js');
    const dir = path.join(ROOT, 'samples');
    if (!fs.existsSync(dir)) return null;
    const caps = [];
    for (const name of fs.readdirSync(dir).filter((f) => /\.pcapng?$/.test(f)).sort()) {
      const cap = readCapture(new Uint8Array(fs.readFileSync(path.join(dir, name))), name);
      const s = dis.createSession(cap);
      for (const f of cap.frames) s.firstPass(f);
      caps.push({ name, frames: cap.frames, ds: cap.frames.map((f) => dis.dissect(s, f)) });
    }
    return caps.length ? { caps, FIELDS: dis.FIELDS } : null;
  } catch { return null; }
}
const real = await loadSamples();
const noReal = !real && 'no samples/ or dissectors yet';

const FILTERS = ['tcp', 'udp && !dns', 'ip.addr == 192.168.0.0/16', 'tcp.flags.syn == 1 && tcp.flags.ack == 0', 'dns.qry.type == AAAA',
  'http.request.method == "GET"', 'frame contains "HTTP"', 'eth.dst[0] & 1', 'tcp.port in {80, 443, 8080}', 'ip.ttl < 64 || ipv6.hlim < 64',
  'tls.handshake.type == 1', 'frame.len > 1000', 'tcp.analysis.flags', 'count(ip) == 2', 'string(tcp.dstport) matches "^4"', 'udp.stream == 0'];

test('real samples: every test filter evaluates over every packet without throwing', { skip: noReal }, () => {
  let evaluated = 0;
  for (const f of FILTERS) {
    const c = compileFilter(f, { fields: real.FIELDS });
    assert.ok(c.ok, `${f}: ${c.error}`);
    for (const { ds } of real.caps) for (const d of ds) { c.test(d); evaluated++; }
  }
  assert.ok(evaluated > 1000);
});

test('real samples: default colouring rules compile and colour most packets', { skip: noReal }, () => {
  const rules = compileRules(COLORING_RULES, { fields: real.FIELDS });
  for (const r of rules) assert.equal(r.error, null, `${r.name}: ${r.error}`);
  let total = 0, coloured = 0;
  const seen = new Set();
  for (const { ds } of real.caps) for (const d of ds) {
    total++;
    const m = matchColor(rules, d);
    if (m) { coloured++; seen.add(m.name); }
  }
  assert.ok(coloured / total > 0.8, `${coloured}/${total} coloured`);
  for (const name of ['TCP', 'UDP', 'ARP', 'HTTP', 'TCP SYN/FIN']) assert.ok(seen.has(name), `rule ${name} matched somewhere`);
});

test('real samples: a filter built from every node selects its own packet', { skip: noReal }, async () => {
  const { filterForNode } = await import('../../src/domain/filter/index.js');
  let checked = 0;
  const bad = [];
  for (const { name, ds } of real.caps.slice(0, 12)) {
    for (const d of ds.slice(0, 15)) {
      for (const nodes of d.fields.values()) {
        const nd = nodes[0];
        const f = filterForNode(nd, { fields: real.FIELDS });
        if (!f) continue;
        const c = compileFilter(f, { fields: real.FIELDS });
        checked++;
        if (!c.ok || !c.test(d)) bad.push(`${name}: ${f}${c.ok ? '' : ' → ' + c.error}`);
      }
    }
  }
  assert.ok(checked > 500);
  assert.deepEqual(bad.slice(0, 20), []);
});

test('speed: 100k dissections are filtered well under a second', () => {
  const pool = real ? real.caps.flatMap((c) => c.ds) : [tcpPacket(), udpDnsPacket(), arpPacket(), httpGet()];
  const fields = real ? real.FIELDS : FIX;
  const list = Array.from({ length: 100000 }, (_, i) => pool[i % pool.length]);
  for (const f of ['ip.addr == 192.168.0.10 && tcp.port == 80', 'tcp.flags.syn == 1 || udp.port in {53, 67, 123}', 'frame.len > 100 && !arp', 'http.request.method == "GET"']) {
    const c = compileFilter(f, { fields });
    assert.ok(c.ok, c.error);
    let hits = 0;
    const t0 = performance.now();
    for (const d of list) if (c.test(d)) hits++;
    const ms = performance.now() - t0;
    assert.ok(ms < 700, `${f}: ${ms.toFixed(0)} ms for 100k`);
    void hits;
  }
});
