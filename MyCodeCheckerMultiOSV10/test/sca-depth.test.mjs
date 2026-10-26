import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const sca = require('../core/sca/index.js');
const reach = require('../core/sca/reachability.js');
const snippets = require('../core/sca/snippets/index.js');
const binary = require('../core/sca/binary.js');
const license = require('../core/sca/license.js');

const here = path.dirname(fileURLToPath(import.meta.url));

// Every fixture lives in a temp dir created by the test.
function project(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcc-sca-depth-'));
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  return dir;
}
const cleanup = (dir) => fs.rmSync(dir, { recursive: true, force: true });
const vuln = (r, id) => r.vulnerabilities.find((v) => v.id === id);
const byPkg = (r, name) => r.vulnerabilities.filter((v) => v.package === name);

// ------------------------------------------------------------ zip / PE --

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

function makeZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  entries.forEach(([name, content], n) => {
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content);
    const method = n % 2 ? 0 : 8;
    const comp = method === 8 ? zlib.deflateRawSync(data) : data;
    const nameBuf = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc32(data), 14); local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBuf.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc32(data), 16); central.writeUInt32LE(comp.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(nameBuf.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, comp);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + comp.length;
  });
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

const utf16z = (s) => Buffer.from(`${s}\0`, 'utf16le');
const pad4 = (b) => (b.length % 4 ? Buffer.concat([b, Buffer.alloc(4 - (b.length % 4))]) : b);

// VS_VERSIONINFO-style block: header, key, padding, value, padded children.
function vblock(key, value, valueLen, type, children = []) {
  const head = Buffer.alloc(6);
  let body = pad4(Buffer.concat([head, utf16z(key)]));
  if (value) body = Buffer.concat([body, value]);
  for (const c of children) body = Buffer.concat([pad4(body), c]);
  body.writeUInt16LE(body.length, 0);
  body.writeUInt16LE(valueLen, 2);
  body.writeUInt16LE(type, 4);
  return body;
}

function versionInfo(strings, [a, b, c, d]) {
  const fixed = Buffer.alloc(52);
  fixed.writeUInt32LE(0xfeef04bd, 0); fixed.writeUInt32LE(0x10000, 4);
  fixed.writeUInt32LE(((a << 16) | b) >>> 0, 8); fixed.writeUInt32LE(((c << 16) | d) >>> 0, 12);
  fixed.writeUInt32LE(((a << 16) | b) >>> 0, 16); fixed.writeUInt32LE(((c << 16) | d) >>> 0, 20);
  const strs = Object.entries(strings).map(([k, v]) => vblock(k, utf16z(v), v.length + 1, 1));
  const table = vblock('040904B0', null, 0, 1, strs);
  const sfi = vblock('StringFileInfo', null, 0, 1, [table]);
  return vblock('VS_VERSION_INFO', fixed, 52, 0, [sfi]);
}

// Minimal PE32 image with one .rsrc section holding RT_VERSION.
function makePe(strings, version) {
  const vi = versionInfo(strings, version);
  const rsrc = Buffer.alloc(0x58 + vi.length);
  const dirAt = (off, id, target) => { rsrc.writeUInt16LE(1, off + 14); rsrc.writeUInt32LE(id, off + 16); rsrc.writeUInt32LE(target >>> 0, off + 20); };
  dirAt(0x00, 16, 0x80000000 | 0x18);
  dirAt(0x18, 1, 0x80000000 | 0x30);
  dirAt(0x30, 0x409, 0x48);
  rsrc.writeUInt32LE(0x1000 + 0x58, 0x48); rsrc.writeUInt32LE(vi.length, 0x4c);
  vi.copy(rsrc, 0x58);
  const raw = pad4(rsrc);
  const head = Buffer.alloc(0x200);
  head.write('MZ', 0, 'latin1'); head.writeUInt32LE(0x40, 0x3c);
  head.write('PE\0\0', 0x40, 'latin1');
  head.writeUInt16LE(0x14c, 0x44); head.writeUInt16LE(1, 0x46); head.writeUInt16LE(224, 0x54); head.writeUInt16LE(0x2102, 0x56);
  const opt = 0x58;
  head.writeUInt16LE(0x10b, opt); head.writeUInt32LE(16, opt + 92);
  head.writeUInt32LE(0x1000, opt + 96 + 16); head.writeUInt32LE(raw.length, opt + 96 + 20);
  const sec = opt + 224;
  head.write('.rsrc', sec, 'latin1'); head.writeUInt32LE(raw.length, sec + 8); head.writeUInt32LE(0x1000, sec + 12);
  head.writeUInt32LE(raw.length, sec + 16); head.writeUInt32LE(0x200, sec + 20);
  return Buffer.concat([head, raw]);
}

// Minimal 64-bit little-endian ELF shared object: .dynstr, .dynamic, .rodata.
function makeElf(soname, needed, rodata) {
  const dynstr = Buffer.from(`\0${soname}\0${needed}\0`, 'latin1');
  const dynamic = Buffer.alloc(48);
  dynamic.writeBigUInt64LE(14n, 0); dynamic.writeBigUInt64LE(1n, 8);
  dynamic.writeBigUInt64LE(1n, 16); dynamic.writeBigUInt64LE(BigInt(soname.length + 2), 24);
  const ro = Buffer.from(rodata, 'latin1');
  const shstr = Buffer.from('\0.dynstr\0.dynamic\0.rodata\0.shstrtab\0', 'latin1');
  const parts = [dynstr, dynamic, ro, shstr];
  const offs = [];
  let off = 64;
  for (const p of parts) { offs.push(off); off += p.length; }
  const shoff = off + ((8 - (off % 8)) % 8);
  const head = Buffer.alloc(64);
  head.writeUInt32BE(0x7f454c46, 0); head[4] = 2; head[5] = 1; head[6] = 1;
  head.writeUInt16LE(3, 16); head.writeUInt16LE(62, 18); head.writeUInt32LE(1, 20);
  head.writeBigUInt64LE(BigInt(shoff), 0x28); head.writeUInt16LE(64, 0x34); head.writeUInt16LE(64, 0x3a); head.writeUInt16LE(5, 0x3c); head.writeUInt16LE(4, 0x3e);
  const sh = (name, type, o, size, link) => { const b = Buffer.alloc(64); b.writeUInt32LE(name, 0); b.writeUInt32LE(type, 4); b.writeBigUInt64LE(BigInt(o), 24); b.writeBigUInt64LE(BigInt(size), 32); b.writeUInt32LE(link, 40); return b; };
  const headers = [Buffer.alloc(64), sh(1, 3, offs[0], dynstr.length, 0), sh(9, 6, offs[1], dynamic.length, 1), sh(18, 1, offs[2], ro.length, 0), sh(26, 3, offs[3], shstr.length, 0)];
  return Buffer.concat([head, ...parts, Buffer.alloc(shoff - off), ...headers]);
}

function makeMachO(installName, [a, b, c]) {
  const name = Buffer.from(`${installName}\0`, 'latin1');
  const cmdSize = 24 + name.length + ((8 - ((24 + name.length) % 8)) % 8);
  const cmd = Buffer.alloc(cmdSize);
  cmd.writeUInt32LE(0xd, 0); cmd.writeUInt32LE(cmdSize, 4); cmd.writeUInt32LE(24, 8); cmd.writeUInt32LE((a << 16) | (b << 8) | c, 16);
  name.copy(cmd, 24);
  const head = Buffer.alloc(32);
  head.writeUInt32LE(0xfeedfacf, 0); head.writeUInt32LE(0x01000007, 4); head.writeUInt32LE(6, 12); head.writeUInt32LE(1, 16); head.writeUInt32LE(cmdSize, 20);
  return Buffer.concat([head, cmd]);
}

// ---------------------------------------------------------- reachability --

test('reachability (JS): reachable via member and named imports, imported, not-imported, comments ignored', () => {
  const dir = project({
    'package.json': JSON.stringify({ name: 'js-app', dependencies: { lodash: '4.17.11', minimist: '1.2.0' } }, null, 2),
    'src/index.js': "const _ = require('lodash');\n// const minimist = require('minimist');\nmodule.exports = (s) => _.template(s)();\n",
    'src/esm.mjs': "import { defaultsDeep as dd } from 'lodash';\nexport const merged = dd({}, { a: 1 });\n",
  });
  try {
    const r = sca.scanDependencies(dir);
    const tpl = vuln(r, 'GHSA-35jh-r3h4-6jhm');
    assert.equal(tpl.reachability, 'reachable');
    assert.ok(tpl.reachabilityEvidence.some((e) => e.file === 'src/index.js' && e.line === 3 && /_\.template/.test(e.text)));
    assert.deepEqual(tpl.reachabilitySymbols, ['template']);
    const deep = vuln(r, 'GHSA-jf85-cpcp-j695');
    assert.equal(deep.reachability, 'reachable');
    assert.ok(deep.reachabilityEvidence.some((e) => e.file === 'src/esm.mjs' && e.line === 2));
    assert.equal(vuln(r, 'GHSA-p6mc-m468-83gw').reachability, 'imported');
    assert.equal(vuln(r, 'GHSA-p6mc-m468-83gw').reachabilityReason, 'symbols-not-referenced');
    for (const v of byPkg(r, 'minimist')) assert.equal(v.reachability, 'not-imported');
    assert.deepEqual(r.summary.reachability, { reachable: 2, imported: 1, notImported: byPkg(r, 'minimist').length, unknown: 0 });

    const f = r.findings.find((x) => x.rule === 'sca:vulnerable-dependency' && x.sca.advisory === 'GHSA-35jh-r3h4-6jhm');
    assert.equal(f.sca.reachability, 'reachable');
    assert.match(f.message.en, /Reachable: the project code uses an affected symbol \(src\/index\.js:3\)/);
    assert.match(f.message.ko, /도달 가능/);
    assert.ok(f.events.some((e) => e.tag === 'call' && e.file === 'src/index.js' && e.line === 3));
    const mini = r.findings.find((x) => x.rule === 'sca:vulnerable-dependency' && x.function === 'minimist');
    assert.equal(mini.sca.reachability, 'not-imported');
    assert.ok(mini.originalSeverity && mini.sca.originalSeverity === mini.originalSeverity);
    const order = ['INFO', 'MINOR', 'MAJOR', 'CRITICAL', 'BLOCKER'];
    assert.equal(order.indexOf(mini.severity), order.indexOf(mini.originalSeverity) - 1);
    assert.match(mini.message.en, /does not import the package/);

    const off = sca.scanDependencies(dir, { reachability: false });
    assert.ok(off.vulnerabilities.every((v) => !('reachability' in v)));
    assert.ok(off.findings.filter((x) => x.rule === 'sca:vulnerable-dependency').every((x) => !('reachability' in x.sca) && !x.originalSeverity));
    assert.equal(off.summary.reachability, undefined);
  } finally { cleanup(dir); }
});

test('reachability (Python): module aliases, from-imports, metadata names and commented imports', () => {
  const dir = project({
    'requirements.txt': 'pyyaml==5.3\npillow==10.1.0\nrequests==2.19.0\n',
    'app/main.py': 'import yaml as y\nfrom PIL import ImageMath\n# import requests\n"""\nimport requests\n"""\n\ndef run(data):\n    cfg = y.load(data)\n    return ImageMath.eval("a+b", a=1, b=2), cfg\n',
  });
  const safe = project({ 'requirements.txt': 'pyyaml==5.3\n', 'tool.py': 'import yaml\n\nprint(yaml.safe_dump({}))\n' });
  try {
    const r = sca.scanDependencies(dir);
    for (const v of byPkg(r, 'pyyaml')) {
      assert.equal(v.reachability, 'reachable', v.id);
      assert.ok(v.reachabilityEvidence.some((e) => e.line === 9 && /y\.load/.test(e.text)));
    }
    const pil = vuln(r, 'GHSA-3f63-hfp8-52jq');
    assert.equal(pil.reachability, 'reachable');
    assert.ok(pil.reachabilityEvidence.some((e) => e.line === 10));
    for (const v of byPkg(r, 'requests')) assert.equal(v.reachability, 'not-imported');
    const s = sca.scanDependencies(safe);
    for (const v of byPkg(s, 'pyyaml')) {
      assert.equal(v.reachability, 'imported');
      assert.deepEqual(v.reachabilityEvidence, [{ file: 'tool.py', line: 1, text: 'import yaml', kind: 'import' }]);
    }
    const custom = sca.scanDependencies([{ path: 'requirements.txt', text: 'pyyaml==5.3\n' }, { path: 'x.py', text: 'import yaml\n' }], { pythonModules: { pyyaml: ['ruamel_like'] } });
    for (const v of byPkg(custom, 'pyyaml')) assert.equal(v.reachability, 'not-imported', 'user module map overrides the built-in names');
  } finally { cleanup(dir); cleanup(safe); }
});

test('reachability (Java): Type.method calls, type references and group-derived packages', () => {
  const pom = `<?xml version="1.0"?>
<project>
  <modelVersion>4.0.0</modelVersion>
  <groupId>t</groupId><artifactId>app</artifactId><version>1</version>
  <dependencies>
    <dependency><groupId>com.fasterxml.jackson.core</groupId><artifactId>jackson-databind</artifactId><version>2.8.5</version></dependency>
    <dependency><groupId>org.apache.logging.log4j</groupId><artifactId>log4j-core</artifactId><version>2.14.1</version></dependency>
    <dependency><groupId>org.apache.commons</groupId><artifactId>commons-text</artifactId><version>1.9</version></dependency>
  </dependencies>
</project>
`;
  const java = `package app;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.commons.text.StringSubstitutor;

public class App {
    public static void main(String[] args) throws Exception {
        ObjectMapper mapper = new ObjectMapper();
        mapper.enableDefaultTyping();
        // StringSubstitutor.createInterpolator() would be reachable here
        System.out.println(StringSubstitutor.createInterpolator().replace(args[0]));
    }
}
`;
  const dir = project({ 'pom.xml': pom, 'src/main/java/app/App.java': java });
  try {
    const r = sca.scanDependencies(dir);
    const poly = vuln(r, 'GHSA-qxxx-2pp7-5hmx');
    assert.equal(poly.reachability, 'reachable');
    assert.ok(poly.reachabilityEvidence.some((e) => e.line === 9 && /enableDefaultTyping/.test(e.text)));
    assert.equal(vuln(r, 'GHSA-57j2-w4cx-62h2').reachability, 'imported', 'readValue is never called');
    const text = vuln(r, 'GHSA-599f-7c49-w659');
    assert.equal(text.reachability, 'reachable');
    assert.ok(text.reachabilityEvidence.some((e) => e.line === 11), 'the commented line does not count');
    for (const v of byPkg(r, 'org.apache.logging.log4j:log4j-core')) assert.equal(v.reachability, 'not-imported');
  } finally { cleanup(dir); }
});

test('reachability (Go): OSV import paths and symbols, built-in groups and not-imported modules', () => {
  const goMod = 'module example.com/app\n\ngo 1.21\n\nrequire (\n\tgolang.org/x/net v0.7.0\n\tgolang.org/x/text v0.3.7\n\texample.com/lib v1.0.0\n)\n';
  const main = 'package main\n\nimport (\n\t"net/http"\n\n\t"golang.org/x/net/http2"\n\tlib "example.com/lib"\n)\n\nfunc main() {\n\tsrv := &http.Server{}\n\thttp2.ConfigureServer(srv, nil)\n\tlib.Open()\n}\n';
  const advisory = {
    id: 'TEST-GO-0001', modified: '2026-01-01T00:00:00Z', summary: 'test advisory with symbols',
    affected: [{ package: { ecosystem: 'Go', name: 'example.com/lib' }, ranges: [{ type: 'SEMVER', events: [{ introduced: '0' }, { fixed: '1.1.0' }] }], ecosystem_specific: { imports: [{ path: 'example.com/lib/parser', symbols: ['Parse'] }] } }],
  };
  const advisory2 = {
    id: 'TEST-GO-0002', modified: '2026-01-01T00:00:00Z', summary: 'second test advisory',
    affected: [{ package: { ecosystem: 'Go', name: 'example.com/lib' }, ranges: [{ type: 'SEMVER', events: [{ introduced: '0' }, { fixed: '1.1.0' }] }], ecosystem_specific: { imports: [{ path: 'example.com/lib', symbols: ['Open'] }] } }],
  };
  const dir = project({ 'go.mod': goMod, 'main.go': main });
  try {
    const r = sca.scanDependencies(dir, { advisories: [advisory, advisory2] });
    const rapid = vuln(r, 'GO-2023-2102');
    assert.equal(rapid.reachability, 'reachable');
    assert.ok(rapid.reachabilityEvidence.some((e) => e.line === 12 && /http2\.ConfigureServer/.test(e.text)));
    assert.equal(vuln(r, 'GO-2022-1059').reachability, 'not-imported');
    const t1 = vuln(r, 'TEST-GO-0001');
    assert.equal(t1.reachability, 'imported');
    assert.equal(t1.reachabilityReason, 'affected-package-not-imported');
    assert.deepEqual(t1.reachabilitySymbols, ['example.com/lib/parser:Parse']);
    assert.equal(vuln(r, 'TEST-GO-0002').reachability, 'reachable');
  } finally { cleanup(dir); }
});

test('reachability (PHP / Ruby / C#): PSR-4 namespaces from composer.lock, require, using', () => {
  const lock = JSON.stringify({ packages: [{ name: 'guzzlehttp/guzzle', version: '7.4.2', autoload: { 'psr-4': { 'GuzzleHttp\\': 'src/' } } }] }, null, 2);
  const gemLock = 'GEM\n  remote: https://rubygems.org/\n  specs:\n    nokogiri (1.13.3)\n\nPLATFORMS\n  ruby\n\nDEPENDENCIES\n  nokogiri\n';
  const csproj = '<Project Sdk="Microsoft.NET.Sdk">\n  <ItemGroup>\n    <PackageReference Include="Newtonsoft.Json" Version="12.0.3" />\n  </ItemGroup>\n</Project>\n';
  const r = sca.scanDependencies([
    { path: 'php/composer.lock', text: lock },
    { path: 'php/src/Client.php', text: '<?php\nuse GuzzleHttp\\Client;\nuse GuzzleHttp\\Cookie\\CookieJar;\n\n$jar = new CookieJar();\n' },
    { path: 'rb/Gemfile.lock', text: gemLock },
    { path: 'rb/app.rb', text: "require 'nokogiri'\n\ndoc = Nokogiri::HTML(html)\n" },
    { path: 'cs/App.csproj', text: csproj },
    { path: 'cs/Program.cs', text: 'using Newtonsoft.Json;\n\nvar o = JsonConvert.DeserializeObject<Foo>(s);\n' },
  ]);
  const g = vuln(r, 'GHSA-cwmx-hcrq-mhc3');
  assert.equal(g.reachability, 'reachable');
  assert.ok(g.reachabilityEvidence.some((e) => e.file === 'php/src/Client.php' && e.line === 5));
  const n = vuln(r, 'GHSA-crjr-9rc5-ghw8');
  assert.equal(n.reachability, 'reachable');
  assert.ok(n.reachabilityEvidence.some((e) => e.file === 'rb/app.rb' && e.line === 3));
  const j = vuln(r, 'GHSA-5crp-9r3c-p9vr');
  assert.equal(j.reachability, 'reachable');
  assert.ok(j.reachabilityEvidence.some((e) => e.file === 'cs/Program.cs' && e.line === 3));
});

test('reachability is unknown without sources and reported through analyze()', () => {
  const pkg = JSON.stringify({ name: 'contract', dependencies: { lodash: '4.17.11' } }, null, 2);
  const none = sca.scanDependencies([{ path: 'package.json', text: pkg }]);
  assert.ok(none.vulnerabilities.every((v) => v.reachability === 'unknown' && v.reachabilityReason === 'no-source'));
  const files = [
    { path: 'package.json', text: pkg, lang: 'json' },
    { path: 'src/t.js', text: "import _ from 'lodash';\nexport default (s) => _.template(s);\n", lang: 'js' },
  ];
  const found = sca.analyze(files, { inactive: new Set(), root: null, options: {} });
  const f = found.find((x) => x.rule === 'sca:vulnerable-dependency' && x.sca.advisory === 'GHSA-35jh-r3h4-6jhm');
  assert.equal(f.sca.reachability, 'reachable');
  assert.ok(f.events.some((e) => e.tag === 'call' && e.file === 'src/t.js' && e.line === 2));
  const off = sca.analyze(files, { inactive: new Set(), root: null, options: { sca: { reachability: false } } });
  assert.ok(off.filter((x) => x.rule === 'sca:vulnerable-dependency').every((x) => x.sca.reachability === undefined));
});

test('import extraction and comment masking per language', () => {
  const imports = (file, text) => reach.prepareSources([{ path: file, text }]).files[0].imports.map((i) => i.module);
  assert.deepEqual(imports('a.ts', "import type { X } from 'types-only';\nimport a, { b as c } from 'pkg-a';\nexport * from 'pkg-b';\nconst d = require('pkg-c/sub');\nimport('pkg-d');\n/* import 'gone' */\n").sort(), ['pkg-a', 'pkg-b', 'pkg-c/sub', 'pkg-d']);
  assert.deepEqual(imports('a.py', 'import os, json as j\nfrom a.b import (c,\n    d)\nfrom . import local\n'), ['os', 'json', 'a.b']);
  assert.deepEqual(imports('A.java', 'import java.util.List;\nimport static org.x.Y.z;\nimport org.w.*;\n'), ['java.util.List', 'org.x.Y.z', 'org.w']);
  assert.deepEqual(imports('m.go', 'import "fmt"\nimport (\n\tx "golang.org/x/a"\n\t_ "b/c"\n)\n').sort(), ['b/c', 'fmt', 'golang.org/x/a']);
  assert.deepEqual(imports('P.cs', 'using System;\nusing J = Newtonsoft.Json;\nusing (var s = Open()) {}\n'), ['System', 'Newtonsoft.Json']);
  assert.deepEqual(imports('m.c', '#include <zlib.h>\n#include "local.h"\n// #include <openssl/ssl.h>\n'), ['zlib.h', 'local.h']);
  const masked = reach.maskComments("const s = 'http://x'; // tail\n/* a\nb */ x", 'js');
  assert.ok(masked.includes("'http://x'") && !masked.includes('tail') && masked.split('\n').length === 3);
});

// -------------------------------------------------------------- snippets --

const GPL_SAMPLE = `// Sample library for the snippet test.
function ringBuffer(capacity) {
  const items = new Array(capacity);
  let head = 0;
  let size = 0;
  return {
    push(value) {
      items[(head + size) % capacity] = value;
      if (size < capacity) size++;
      else head = (head + 1) % capacity;
    },
    shift() {
      if (size === 0) return undefined;
      const value = items[head];
      items[head] = undefined;
      head = (head + 1) % capacity;
      size--;
      return value;
    },
    toArray() {
      const out = [];
      for (let i = 0; i < size; i++) out.push(items[(head + i) % capacity]);
      return out;
    },
  };
}
module.exports = ringBuffer;
`;

test('snippet index: build, save, load and match renamed copies with similarity and line ranges', () => {
  const lib = project({ 'src/ring.js': GPL_SAMPLE, 'README.md': 'not code' });
  const app = project({
    'package.json': JSON.stringify({ name: 'snip-app' }),
    'src/queue.js': `'use strict';\nconst unrelated = 42;\n\n${GPL_SAMPLE.replace(/ringBuffer/g, 'makeQueue').replace(/items/g, 'slots').replace(/head/g, 'start')}`,
    'src/other.js': "module.exports = function add(a, b) { return a + b; };\n",
  });
  try {
    const out = path.join(lib, 'ring.index.json');
    const idx = snippets.buildSnippetIndex(path.join(lib, 'src'), { name: 'ring-buffer', version: '2.0.0', license: 'GPL-3.0-only', purl: 'pkg:npm/ring-buffer@2.0.0' }, { out });
    assert.equal(idx.format, 'mcc-snippet-index');
    assert.equal(idx.components[0].files.length, 1);
    assert.ok(idx.components[0].files[0].fp.length >= 8);
    assert.deepEqual(snippets.loadSnippetIndex(out), JSON.parse(JSON.stringify(idx)));
    const r = sca.scanDependencies(app, { snippetIndex: out });
    assert.equal(r.snippets.length, 1);
    const m = r.snippets[0];
    assert.equal(m.file, 'src/queue.js');
    assert.equal(m.component, 'ring-buffer');
    assert.ok(m.similarity >= 90, `similarity ${m.similarity}`);
    assert.ok(m.ranges[0].start >= 4 && m.ranges[0].end >= 25, JSON.stringify(m.ranges));
    const f = r.findings.find((x) => x.rule === 'sca:snippet-match');
    assert.equal(f.file, 'src/queue.js');
    assert.equal(f.severity, 'MAJOR', 'strong copyleft snippet');
    assert.equal(f.line, m.ranges[0].start);
    assert.match(f.message.en, /match ring-buffer@2\.0\.0 \(ring\.js, license GPL-3\.0-only\) with \d+(\.\d)?% similarity/);
    assert.ok(f.sca.obligations.includes('disclose-source'));
    assert.equal(r.summary.snippets, 1);
    const strict = sca.scanDependencies(app, { snippetIndex: out, snippetThreshold: 1.01 });
    assert.equal(strict.snippets.length, 0, 'threshold above 100% matches nothing');
    const bom = sca.toCycloneDx(r, { timestamp: '2026-10-22T00:00:00Z', serialNumber: '3e671687-395b-41f5-a30f-a58921a69b79' });
    const sc = bom.components.find((c) => c.name === 'ring-buffer');
    assert.ok(sc.evidence.occurrences.some((o) => /^src\/queue\.js#L\d+-L\d+$/.test(o.location)));
    const bad = sca.scanDependencies(app, { snippetIndex: path.join(lib, 'README.md') });
    assert.equal(bad.errors.length, 1);
  } finally { cleanup(lib); cleanup(app); }
});

test('bundled snippet corpus matches a copied sample and nothing in the engine itself', () => {
  const corpus = path.join(here, '..', 'core', 'sca', 'snippets', 'corpus');
  const sample = fs.readFileSync(path.join(corpus, 'lru-cache.py.snippet'), 'utf8').replace(/LruCache/g, 'Cache').replace(/capacity/g, 'limit');
  const own = ['index.js', 'osv.js', 'license.js', 'reachability.js', 'binary.js'].map((n) => ({ path: `core/sca/${n}`, text: fs.readFileSync(path.join(here, '..', 'core', 'sca', n), 'utf8') }));
  const matches = snippets.matchSnippets([{ path: 'lib/cache.py', text: sample }, ...own], [snippets.bundledSnippetIndex()]);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].component, 'mcc-samples/lru-cache');
  assert.equal(matches[0].license, 'BSD-3-Clause');
  assert.ok(snippets.bundledSnippetIndex().components.length >= 4);
  // Winnowing keeps at least one fingerprint per window.
  const fp = snippets.fingerprint(sample, 'x.py', { k: 5, w: 4 });
  const toks = snippets.tokenize(sample, 'x.py');
  assert.ok(fp.length >= Math.floor((toks.length - 5 + 1) / 4));
  assert.ok(snippets.tokenize('a = b + 1 # c', 'x.py').map((t) => t.t).join(' ') === 'I = I + N');
});

// --------------------------------------------------------------- binaries --

test('binary identification: jar pom.properties, MANIFEST fallback, nested war jars', () => {
  const log4j = makeZip([
    ['META-INF/MANIFEST.MF', 'Manifest-Version: 1.0\r\nBundle-License: https://www.apache.org/licenses/LICENSE-2.0.txt\r\nBundle-SymbolicName: org.apache.logging.log4j.c\r\n ore\r\n'],
    ['META-INF/maven/org.apache.logging.log4j/log4j-core/pom.properties', '#Generated\nversion=2.14.1\ngroupId=org.apache.logging.log4j\nartifactId=log4j-core\n'],
    ['org/apache/logging/log4j/core/lookup/JndiLookup.class', Buffer.from([0xca, 0xfe, 0xba, 0xbe])],
  ]);
  const id = binary.identifyBinary(log4j, 'lib/log4j-core-2.14.1.jar');
  assert.equal(id.format, 'jar');
  assert.deepEqual(id.components.map((c) => [c.ecosystem, c.name, c.version, c.license, c.purl]), [['Maven', 'org.apache.logging.log4j:log4j-core', '2.14.1', 'Apache-2.0', 'pkg:maven/org.apache.logging.log4j/log4j-core@2.14.1']]);
  assert.equal(id.info.manifest['Bundle-SymbolicName'], 'org.apache.logging.log4j.core');
  const manifestOnly = makeZip([['META-INF/MANIFEST.MF', 'Manifest-Version: 1.0\nImplementation-Version: 1.9\nBundle-SymbolicName: org.apache.commons.commons-text\n']]);
  const war = makeZip([['WEB-INF/web.xml', '<web-app/>'], ['WEB-INF/lib/commons-text-1.9.jar', manifestOnly], ['WEB-INF/lib/log4j-core.jar', log4j]]);
  const w = binary.identifyBinary(war, 'shop.war');
  assert.deepEqual(w.components.map((c) => `${c.name}@${c.version} ${c.inner}`).sort(), ['org.apache.commons:commons-text@1.9 WEB-INF/lib/commons-text-1.9.jar', 'org.apache.logging.log4j:log4j-core@2.14.1 WEB-INF/lib/log4j-core.jar']);
  assert.equal(binary.identifyBinary(Buffer.from('not a zip'), 'broken.jar').error, 'Not a zip archive');
});

test('binary identification: PE version resource, ELF soname and version strings, Mach-O LC_ID_DYLIB', () => {
  const pe = makePe({ CompanyName: 'Newtonsoft', ProductName: 'Json.NET', FileVersion: '12.0.3.23909', ProductVersion: '12.0.3+7c3d7f8da7e35dde8fa74188b0decff70f8f10e3', OriginalFilename: 'Newtonsoft.Json.dll', InternalName: 'Newtonsoft.Json.dll' }, [12, 0, 3, 23909]);
  const p = binary.identifyBinary(pe, 'bin/Newtonsoft.Json.dll');
  assert.equal(p.format, 'pe');
  assert.equal(p.info.version.fileVersion, '12.0.3.23909');
  assert.equal(p.info.version.strings.CompanyName, 'Newtonsoft');
  assert.deepEqual(p.components.map((c) => [c.ecosystem, c.name, c.version]), [['NuGet', 'Newtonsoft.Json', '12.0.3']]);
  const tool = binary.identifyBinary(makePe({ CompanyName: 'Example Corp', ProductName: 'Example Tool', FileVersion: '3.1.0.7' }, [3, 1, 0, 7]), 'tool.exe');
  assert.deepEqual(tool.components.map((c) => [c.ecosystem, c.name, c.version]), [['generic', 'Example Tool', '3.1.0.7']]);

  const elf = binary.identifyBinary(makeElf('libz.so.1', 'libc.so.6', '\0 deflate 1.2.11 Copyright 1995-2017 Jean-loup Gailly and Mark Adler \0'), 'lib/libz.so.1.2.11');
  assert.equal(elf.format, 'elf');
  assert.equal(elf.info.soname, 'libz.so.1');
  assert.deepEqual(elf.info.needed, ['libc.so.6']);
  assert.deepEqual(elf.components.map((c) => [c.ecosystem, c.name, c.version]), [['ConanCenter', 'zlib', '1.2.11']]);
  const plain = binary.identifyBinary(makeElf('libfoo.so.2', 'libc.so.6', 'nothing'), 'libfoo.so.2');
  assert.deepEqual(plain.components.map((c) => [c.name, c.evidence]), [['foo', 'DT_SONAME']]);
  const ssl = binary.identifyBinary(Buffer.concat([Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1]), Buffer.alloc(80), Buffer.from('OpenSSL 1.1.1k  25 Mar 2021')]), 'libcrypto.so.1.1');
  assert.deepEqual(ssl.components.map((c) => `${c.name}@${c.version}`), ['openssl@1.1.1k']);

  const mach = binary.identifyBinary(makeMachO('@rpath/libfoo.dylib', [1, 2, 3]), 'Frameworks/libfoo.dylib');
  assert.equal(mach.format, 'macho');
  assert.equal(mach.info.installName, '@rpath/libfoo.dylib');
  assert.deepEqual(mach.components.map((c) => [c.name, c.version]), [['foo', '1.2.3']]);
});

test('binary identification: wheel METADATA, nupkg nuspec, and scan results match advisories', () => {
  const wheel = makeZip([
    ['yaml/__init__.py', ''],
    ['PyYAML-5.3.dist-info/METADATA', 'Metadata-Version: 2.1\nName: PyYAML\nVersion: 5.3\nClassifier: License :: OSI Approved :: MIT License\n\nYAML parser\n'],
    ['PyYAML-5.3.dist-info/top_level.txt', '_yaml\nyaml\n'],
  ]);
  const w = binary.identifyBinary(wheel, 'wheels/PyYAML-5.3-cp38-cp38-win_amd64.whl');
  assert.deepEqual(w.components.map((c) => [c.ecosystem, c.name, c.version, c.license]), [['PyPI', 'pyyaml', '5.3', 'MIT']]);
  assert.deepEqual(w.components[0].topLevel, ['_yaml', 'yaml']);
  const nupkg = makeZip([['Newtonsoft.Json.nuspec', '<?xml version="1.0"?><package xmlns="http://schemas.microsoft.com/packaging/2013/05/nuspec.xsd"><metadata><id>Newtonsoft.Json</id><version>12.0.3</version><license type="expression">MIT</license></metadata></package>']]);
  assert.deepEqual(binary.identifyBinary(nupkg, 'pkgs/newtonsoft.json.12.0.3.nupkg').components.map((c) => [c.ecosystem, c.name, c.version, c.license]), [['NuGet', 'Newtonsoft.Json', '12.0.3', 'MIT']]);

  const dir = project({ 'scripts/load.py': 'import yaml\n\nyaml.load(open("c.yml"))\n' });
  try {
    fs.mkdirSync(path.join(dir, 'lib'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'native'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'lib', 'PyYAML-5.3-py3-none-any.whl'), wheel);
    fs.writeFileSync(path.join(dir, 'native', 'libz.so.1'), makeElf('libz.so.1', 'libc.so.6', ' inflate 1.2.11 Copyright 1995-2017 Mark Adler '));
    const r = sca.scanDependencies(dir);
    assert.deepEqual(r.binaries.map((b) => [b.file, b.format]), [['lib/PyYAML-5.3-py3-none-any.whl', 'wheel'], ['native/libz.so.1', 'elf']]);
    const z = r.dependencies.find((d) => d.name === 'zlib');
    assert.equal(z.source, 'binary');
    assert.equal(z.purl, 'pkg:conan/zlib@1.2.11');
    const zf = r.findings.find((f) => f.rule === 'sca:vulnerable-dependency' && f.function === 'zlib');
    assert.equal(zf.file, 'native/libz.so.1');
    assert.equal(zf.sca.source, 'binary');
    assert.match(zf.message.en, /Identified in binary native\/libz\.so\.1 from version string/);
    const y = byPkg(r, 'pyyaml');
    assert.ok(y.length >= 1 && y.every((v) => v.reachability === 'reachable'), 'wheel top_level.txt feeds reachability');
    assert.ok(r.graph.roots.some((g) => g.id === 'project:binaries'));
    assert.equal(r.licenses.find((l) => l.name === 'pyyaml').expression, 'MIT');
    const bom = sca.toCycloneDx(r, { timestamp: '2026-10-22T00:00:00Z', serialNumber: '3e671687-395b-41f5-a30f-a58921a69b79' });
    const zc = bom.components.find((c) => c.name === 'zlib');
    assert.ok(zc.properties.some((p) => p.name === 'mcc:source' && p.value === 'binary'));
    assert.deepEqual(zc.evidence.occurrences, [{ location: 'native/libz.so.1' }]);
    assert.equal(sca.scanDependencies(dir, { binaries: false }).binaries.length, 0);
  } finally { cleanup(dir); }
});

// ---------------------------------------------------------------- license --

test('license text template matching, notices and SPDX fallback', () => {
  const mit = 'Copyright (c) 2026 Someone\n\nPermission is hereby granted, free of charge, to any person\nobtaining a copy of this software ... to deal in the Software without restriction ...\nThe above copyright notice and this permission notice shall be\nincluded in all copies. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.';
  assert.equal(license.identifyLicenseText(mit).id, 'MIT');
  const bsd = 'Redistribution and use in source and binary forms, with or without\nmodification, are permitted provided that ...\n1. Redistributions of source code must retain the above copyright notice ...\n2. Redistributions in binary form must reproduce the above copyright notice ...\nTHIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"';
  assert.equal(license.identifyLicenseText(bsd).id, 'BSD-2-Clause');
  assert.equal(license.identifyLicenseText(`${bsd}\n3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products derived from this software`).id, 'BSD-3-Clause');
  const gplNotice = '/*\n * This program is free software: you can redistribute it and/or modify\n * it under the terms of the GNU General Public License as published by\n * the Free Software Foundation, either version 3 of the License, or\n * (at your option) any later version.\n */';
  const g = license.identifyLicenseText(gplNotice);
  assert.deepEqual([g.id, g.method], ['GPL-3.0-or-later', 'notice']);
  assert.equal(license.identifyLicenseText('# This library is free software; you can redistribute it and/or modify it under the terms of the GNU Lesser General Public License as published by the Free Software Foundation; either version 2.1 of the License.').id, 'LGPL-2.1-only');
  assert.equal(license.identifyLicenseText('This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one').id, 'MPL-2.0');
  assert.equal(license.identifyLicenseText('GNU AFFERO GENERAL PUBLIC LICENSE Version 3, 19 November 2007 ... The GNU Affero General Public License is a free, copyleft license ... remote network interaction').id, 'AGPL-3.0-only');
  assert.equal(license.identifyLicenseText('Eclipse Public License - v 2.0 ... THE ACCOMPANYING PROGRAM IS PROVIDED UNDER THE TERMS OF THIS ECLIPSE PUBLIC LICENSE ... "Secondary License"').id, 'EPL-2.0');
  assert.equal(license.identifyLicenseText('Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.').id, 'ISC');
  assert.equal(license.identifyLicenseText('Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.').id, 'Apache-2.0');
  assert.equal(license.identifyLicenseText('GNU GENERAL PUBLIC LICENSE Version 2, June 1991 Everyone is permitted to copy and distribute verbatim copies ... The licenses for most software are designed to take away your freedom to share and change it.').id, 'GPL-2.0-only');
  assert.equal(license.identifyLicenseText('hello world'), null);
  // detectLicenseText keeps its rules and falls back to templates.
  assert.equal(license.detectLicenseText('This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file'), 'MPL-2.0');
  assert.equal(license.detectLicenseText('random text'), null);
});

test('license obligations, compatibility hints, incompatible-license findings and SBOM obligations', () => {
  assert.deepEqual(license.licenseObligations('MIT').map((o) => o.id), ['include-copyright', 'include-license']);
  assert.ok(license.licenseObligations('Apache-2.0').some((o) => o.id === 'include-notice' && o.text.en && o.text.ko));
  assert.deepEqual(license.licenseObligations('MIT OR GPL-3.0-only').map((o) => o.id), ['include-copyright', 'include-license'], 'OR picks the lighter option');
  assert.ok(license.licenseObligations('MIT AND AGPL-3.0-only').some((o) => o.id === 'network-use-disclose'), 'AND unions');
  assert.deepEqual(license.licenseObligations('Unlicense'), []);
  const h = (p, d) => license.compatibilityHints(p, d).map((x) => `${x.level}:${x.code}`);
  assert.deepEqual(h('LicenseRef-Proprietary', 'GPL-3.0-only'), ['conflict:copyleft-in-proprietary']);
  assert.deepEqual(h(null, 'GPL-3.0-only'), ['warning:copyleft-in-proprietary']);
  assert.deepEqual(h('proprietary', 'AGPL-3.0-only'), ['conflict:network-copyleft-in-proprietary']);
  assert.deepEqual(h('proprietary', 'LGPL-2.1-only'), ['warning:weak-copyleft-conditions']);
  assert.deepEqual(h('Apache-2.0', 'GPL-2.0-only'), ['warning:copyleft-relicenses-project', 'conflict:apache-gpl2-incompatible']);
  assert.deepEqual(h('GPL-2.0-only', 'GPL-3.0-or-later'), ['conflict:gpl2-gpl3-incompatible']);
  assert.deepEqual(h('MIT', 'Apache-2.0'), []);

  const dir = project({
    'package.json': JSON.stringify({ name: 'closed', license: 'UNLICENSED', dependencies: { 'gpl-lib': '1.0.0', 'mit-lib': '1.0.0' } }, null, 2),
    'node_modules/gpl-lib/package.json': JSON.stringify({ name: 'gpl-lib', license: 'GPL-3.0-only' }),
    'node_modules/mit-lib/package.json': JSON.stringify({ name: 'mit-lib', license: 'MIT' }),
  });
  try {
    const r = sca.scanDependencies(dir);
    const inc = r.findings.filter((f) => f.rule === 'sca:license-incompatible');
    assert.equal(inc.length, 1);
    assert.match(inc[0].message.en, /^gpl-lib@1\.0\.0: GPL-3\.0-only is strong copyleft/);
    assert.equal(inc[0].sca.code, 'copyleft-in-proprietary');
    assert.deepEqual(r.licenseHints.map((x) => [x.name, x.level, x.code]), [['gpl-lib', 'conflict', 'copyleft-in-proprietary']]);
    assert.deepEqual(r.licenses.find((l) => l.name === 'mit-lib').obligations, ['include-copyright', 'include-license']);
    assert.ok(r.licenses.find((l) => l.name === 'gpl-lib').compatibility.length === 1);
    const bom = sca.toCycloneDx(r, { timestamp: '2026-10-22T00:00:00Z', serialNumber: '3e671687-395b-41f5-a30f-a58921a69b79' });
    assert.ok(bom.components.find((c) => c.name === 'gpl-lib').properties.some((p) => p.name === 'mcc:license:obligations' && /disclose-source/.test(p.value)));
    const spdx = sca.toSpdx(r, { timestamp: '2026-10-22T00:00:00Z', namespace: 'https://example.test/spdx/closed' });
    assert.match(spdx.packages.find((p) => p.name === 'mit-lib').comment, /^License obligations: include-copyright, include-license$/);
    assert.match(sca.toSpdxTagValue(r, { timestamp: '2026-10-22T00:00:00Z', namespace: 'https://example.test/spdx/closed' }), /PackageComment: <text>License obligations: include-copyright, include-license<\/text>/);
    const quiet = sca.scanDependencies(dir, { inactive: ['sca:license-incompatible'] });
    assert.equal(quiet.findings.filter((f) => f.rule === 'sca:license-incompatible').length, 0);
  } finally { cleanup(dir); }
});

test('new rules follow the engine contract', () => {
  const keys = sca.catalog().map((r) => r.key);
  for (const k of ['sca:snippet-match', 'sca:license-incompatible']) assert.ok(keys.includes(k), k);
});
