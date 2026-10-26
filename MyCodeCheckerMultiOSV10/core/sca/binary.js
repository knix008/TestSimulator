'use strict';

// Binary identification: find open-source components inside build outputs
// and shipped binaries, without running them.
//
//   identifyBinary(buffer, file)          -> { file, format, components, info }
//   discoverBinaries(root, options)       -> ['lib/a.jar', ...]
//   scanBinaries(rootOrList, options)     -> { binaries, components }
//
// Formats: Java archives (.jar/.war/.ear, nested jars, pom.properties and
// MANIFEST.MF), Python wheels / eggs (METADATA, PKG-INFO, top_level.txt),
// NuGet packages (.nupkg -> .nuspec), Windows PE (.dll/.exe version
// resource), ELF (.so: soname, needed, version definitions) and Mach-O
// (.dylib: LC_ID_DYLIB), plus version strings of well-known native libraries
// (OpenSSL, zlib, libpng, curl, expat, ...) in any native binary.

const fs = require('fs');
const path = require('path');
const { readZipEntries } = require('./osv');
const { toPurl } = require('./util');
const { normalizeLicenseId, normalizeExpression, detectLicenseText, isLicenseFile } = require('./license');
const { parseXml, childText, child, walk } = require('./xml');

const BINARY_RE = /\.(jar|war|ear|dll|exe|so(\.\d+)*|dylib|whl|egg|nupkg)$/i;
const BINARY_SKIP = new Set(['.git', '.hg', '.svn', 'node_modules', '.gradle', '.m2', '__pycache__', '.venv', 'venv', '.tox', '.idea', '.vscode']);

function isBinaryCandidate(file) {
  return BINARY_RE.test(String(file));
}

// Artifact id -> Maven group id, for jars that carry no pom.properties.
const ARTIFACT_GROUPS = {
  'log4j-core': 'org.apache.logging.log4j', 'log4j-api': 'org.apache.logging.log4j', log4j: 'log4j',
  'jackson-databind': 'com.fasterxml.jackson.core', 'jackson-core': 'com.fasterxml.jackson.core', 'jackson-annotations': 'com.fasterxml.jackson.core',
  'commons-text': 'org.apache.commons', 'commons-lang3': 'org.apache.commons', 'commons-collections4': 'org.apache.commons',
  'commons-collections': 'commons-collections', 'commons-io': 'commons-io', 'commons-fileupload': 'commons-fileupload',
  snakeyaml: 'org.yaml', guava: 'com.google.guava', gson: 'com.google.code.gson', 'spring-beans': 'org.springframework',
  'spring-core': 'org.springframework', 'spring-webmvc': 'org.springframework', 'spring-web': 'org.springframework',
  httpclient: 'org.apache.httpcomponents', xstream: 'com.thoughtworks.xstream',
};

// Version strings of native libraries -> ConanCenter package.
const NATIVE_PATTERNS = [
  { re: /\bOpenSSL (\d+\.\d+\.\d+[a-z]{0,2})\b/, name: 'openssl', title: 'OpenSSL' },
  { re: /\bLibreSSL (\d+\.\d+\.\d+)\b/, name: 'libressl', title: 'LibreSSL' },
  { re: /\b(?:deflate|inflate) (1\.\d+\.\d+(?:\.\d+)?) Copyright \d{4}/, name: 'zlib', title: 'zlib' },
  { re: /\blibpng version (\d+\.\d+\.\d+)\b/i, name: 'libpng', title: 'libpng' },
  { re: /\blibcurl\/(\d+\.\d+\.\d+)\b/, name: 'libcurl', title: 'libcurl' },
  { re: /\bexpat_(\d+\.\d+\.\d+)\b/, name: 'expat', title: 'Expat' },
  { re: /\blibjpeg-turbo version (\d+\.\d+\.\d+)\b/, name: 'libjpeg-turbo', title: 'libjpeg-turbo' },
  { re: /\blibxml2[- ](\d+\.\d+\.\d+)\b/, name: 'libxml2', title: 'libxml2' },
  { re: /\bFreeType (2\.\d+\.\d+)\b/, name: 'freetype', title: 'FreeType' },
];

// ------------------------------------------------------------ helpers ----

function component(ecosystem, name, version, extra = {}) {
  const eco = ecosystem;
  const purl = eco === 'generic' ? toPurl('generic', String(name), version || null) : toPurl(eco, String(name), version || null);
  return { ecosystem: eco, name: String(name), version: version ? String(version) : null, purl, ...extra };
}

function parseProperties(text) {
  const out = {};
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('!')) continue;
    const m = /^([^=:\s]+)\s*[=:]\s*(.*)$/.exec(line);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

// MANIFEST.MF: "Key: value" with continuation lines that start with one space.
function parseManifest(text) {
  const out = {};
  let key = null;
  for (const line of String(text).split(/\r?\n/)) {
    if (line.startsWith(' ') && key) { out[key] += line.slice(1); continue; }
    const m = /^([A-Za-z0-9_-]+):\s?(.*)$/.exec(line);
    if (m) { key = m[1]; out[key] = m[2]; } else key = null;
  }
  return out;
}

// RFC 822 style headers (wheel METADATA / PKG-INFO); repeated keys -> arrays.
function parseHeaders(text) {
  const out = {};
  let key = null;
  for (const line of String(text).split(/\r?\n/)) {
    if (!line.trim()) { if (key) break; continue; }
    if (/^\s/.test(line) && key) { const v = out[key]; if (Array.isArray(v)) v[v.length - 1] += `\n${line.trim()}`; continue; }
    const m = /^([A-Za-z0-9-]+):\s?(.*)$/.exec(line);
    if (!m) continue;
    key = m[1];
    (out[key] = out[key] || []).push(m[2]);
  }
  return out;
}

function firstLicense(...candidates) {
  for (const c of candidates) {
    if (!c) continue;
    const s = String(c).split(/,(?![^(]*\))/)[0].trim();
    const id = normalizeLicenseId(s) || normalizeExpression(s);
    if (id && !/\s/.test(id.replace(/ (AND|OR|WITH) /g, '-'))) return id;
  }
  return null;
}

function pythonLicense(h) {
  const expr = (h['License-Expression'] || [])[0];
  if (expr) return normalizeExpression(expr);
  const cls = (h.Classifier || []).filter((c) => /^License ::/.test(c)).map((c) => c.split('::').pop().trim());
  for (const c of cls) { const id = normalizeLicenseId(c); if (id) return id; }
  const lic = (h.License || [])[0];
  if (lic && lic.length < 80) return normalizeLicenseId(lic) || null;
  if (lic) return detectLicenseText(lic);
  return null;
}

// ------------------------------------------------------------ archives ---

function identifyJar(buf, file, depth = 0) {
  const entries = readZipEntries(buf);
  const components = [];
  const info = { entries: entries.length, nested: [] };
  const byName = new Map(entries.map((e) => [e.name, e]));
  const poms = entries.filter((e) => /^META-INF\/maven\/[^/]+\/[^/]+\/pom\.properties$/.test(e.name));
  let manifest = {};
  const mf = byName.get('META-INF/MANIFEST.MF');
  if (mf) { try { manifest = parseManifest(mf.read().toString('utf8')); } catch { manifest = {}; } }
  info.manifest = Object.fromEntries(['Implementation-Title', 'Implementation-Version', 'Implementation-Vendor', 'Implementation-Vendor-Id', 'Bundle-SymbolicName', 'Bundle-Version', 'Bundle-License', 'Automatic-Module-Name'].filter((k) => manifest[k]).map((k) => [k, manifest[k]]));
  let license = firstLicense(manifest['Bundle-License']);
  if (!license) {
    const licEntry = entries.find((e) => /^META-INF\/[^/]+$/.test(e.name) && isLicenseFile(e.name.split('/').pop()));
    if (licEntry) { try { license = detectLicenseText(licEntry.read().toString('utf8')); } catch { license = null; } }
  }
  for (const e of poms) {
    let p;
    try { p = parseProperties(e.read().toString('utf8')); } catch { continue; }
    if (!p.groupId || !p.artifactId) continue;
    components.push(component('Maven', `${p.groupId}:${p.artifactId}`, p.version || null, { evidence: e.name, license: poms.length === 1 ? license : null }));
  }
  if (!components.length) {
    const base = path.basename(String(file).split('!/').pop()).replace(/\.(jar|war|ear)$/i, '');
    const fm = /^(.+?)-(\d[\w.+-]*)$/.exec(base);
    const bsn = (manifest['Bundle-SymbolicName'] || '').split(';')[0].trim();
    const artifact = fm ? fm[1] : (manifest['Implementation-Title'] && !/\s/.test(manifest['Implementation-Title']) ? manifest['Implementation-Title'] : base);
    const version = manifest['Implementation-Version'] || manifest['Bundle-Version'] || (fm ? fm[2] : null);
    let group = ARTIFACT_GROUPS[artifact] || null;
    if (!group && bsn && bsn.endsWith(`.${artifact}`)) group = bsn.slice(0, -artifact.length - 1);
    if (!group && manifest['Implementation-Vendor-Id'] && /^[\w.-]+$/.test(manifest['Implementation-Vendor-Id'])) group = manifest['Implementation-Vendor-Id'];
    if (group) components.push(component('Maven', `${group}:${artifact}`, version, { evidence: mf ? 'META-INF/MANIFEST.MF' : 'file name', license }));
    else if (version || mf) components.push(component('generic', artifact, version, { evidence: mf ? 'META-INF/MANIFEST.MF' : 'file name', license }));
  }
  if (depth < 2) {
    for (const e of entries) {
      if (!/\.jar$/i.test(e.name) || e.name.endsWith('/')) continue;
      try {
        const inner = identifyJar(e.read(), `${file}!/${e.name}`, depth + 1);
        info.nested.push(e.name);
        for (const c of inner.components) components.push({ ...c, inner: c.inner ? `${e.name}!/${c.inner}` : e.name });
      } catch { /* not a readable jar */ }
    }
  }
  return { format: 'jar', components, info };
}

function identifyWheel(buf, file) {
  const entries = readZipEntries(buf);
  const meta = entries.find((e) => /^[^/]+\.dist-info\/METADATA$/.test(e.name)) || entries.find((e) => /^EGG-INFO\/PKG-INFO$/.test(e.name)) || entries.find((e) => /(^|\/)PKG-INFO$/.test(e.name));
  const topEntry = entries.find((e) => /^[^/]+\.dist-info\/top_level\.txt$/.test(e.name)) || entries.find((e) => /^EGG-INFO\/top_level\.txt$/.test(e.name));
  const format = /\.egg$/i.test(file) ? 'egg' : 'wheel';
  if (!meta) return { format, components: [], info: { entries: entries.length } };
  const h = parseHeaders(meta.read().toString('utf8'));
  const name = (h.Name || [])[0];
  const version = (h.Version || [])[0];
  let topLevel = [];
  if (topEntry) { try { topLevel = topEntry.read().toString('utf8').split(/\r?\n/).map((x) => x.trim()).filter(Boolean); } catch { topLevel = []; } }
  if (!topLevel.length) {
    const tops = new Set();
    for (const e of entries) {
      const m = /^([A-Za-z_]\w*)\/__init__\.py$/.exec(e.name) || /^([A-Za-z_]\w*)\.py$/.exec(e.name);
      if (m) tops.add(m[1]);
    }
    topLevel = [...tops].sort();
  }
  if (!name) return { format, components: [], info: { entries: entries.length } };
  return { format, components: [component('PyPI', String(name).toLowerCase().replace(/[-_.]+/g, '-'), version || null, { evidence: meta.name, license: pythonLicense(h), topLevel })], info: { entries: entries.length, topLevel } };
}

function identifyNupkg(buf) {
  const entries = readZipEntries(buf);
  const spec = entries.find((e) => /^[^/]+\.nuspec$/i.test(e.name));
  if (!spec) return { format: 'nupkg', components: [], info: { entries: entries.length } };
  const doc = parseXml(spec.read().toString('utf8').replace(/^﻿/, ''));
  let md = null;
  walk(doc, (el) => { if (!md && el.local === 'metadata') md = el; });
  const id = childText(md, 'id');
  const version = childText(md, 'version');
  const licEl = child(md, 'license');
  const lic = licEl && (licEl.attrs || {}).type === 'expression' ? normalizeExpression(childText(md, 'license')) : firstLicense(childText(md, 'licenseUrl'));
  if (!id) return { format: 'nupkg', components: [], info: { entries: entries.length } };
  return { format: 'nupkg', components: [component('NuGet', id, version || null, { evidence: spec.name, license: lic || null })], info: { entries: entries.length } };
}

// ----------------------------------------------------------------- PE ----

function utf16z(buf, off, end) {
  let s = '';
  let p = off;
  while (p + 1 < end) {
    const c = buf.readUInt16LE(p);
    p += 2;
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return { s, next: p };
}

const align4 = (base, off) => base + (((off - base) + 3) & ~3);

// Parse one VS_VERSIONINFO-style block: { key, value, children, end }.
function versionBlock(buf, off, base, limit) {
  if (off + 6 > limit) return null;
  const len = buf.readUInt16LE(off);
  const valueLen = buf.readUInt16LE(off + 2);
  const type = buf.readUInt16LE(off + 4);
  if (len < 6) return null;
  const end = Math.min(off + len, limit);
  const k = utf16z(buf, off + 6, end);
  let p = align4(base, k.next);
  let value = null;
  if (valueLen) {
    if (type === 1) {
      const v = utf16z(buf, p, Math.min(end, p + valueLen * 2 + 2));
      value = v.s;
      p = align4(base, Math.min(end, p + valueLen * 2));
    } else {
      value = buf.subarray(p, Math.min(end, p + valueLen));
      p = align4(base, p + valueLen);
    }
  }
  const children = [];
  while (p + 6 <= end) {
    const c = versionBlock(buf, p, base, end);
    if (!c) break;
    children.push(c);
    if (c.end <= p) break;
    p = align4(base, c.end);
  }
  return { key: k.s, value, type, children, end };
}

function parseVersionInfo(buf, off, size) {
  const root = versionBlock(buf, off, off, Math.min(buf.length, off + size));
  if (!root || root.key !== 'VS_VERSION_INFO') return null;
  const out = { strings: {} };
  if (root.value && root.value.length >= 52 && root.value.readUInt32LE(0) === 0xfeef04bd) {
    const v = root.value;
    const ver = (ms, ls) => `${ms >>> 16}.${ms & 0xffff}.${ls >>> 16}.${ls & 0xffff}`;
    out.fileVersion = ver(v.readUInt32LE(8), v.readUInt32LE(12));
    out.productVersion = ver(v.readUInt32LE(16), v.readUInt32LE(20));
  }
  for (const c of root.children) {
    if (c.key !== 'StringFileInfo') continue;
    for (const table of c.children) for (const s of table.children) if (s.key && typeof s.value === 'string') out.strings[s.key] = s.value;
  }
  return out;
}

function parsePe(buf) {
  if (buf.length < 64 || buf.readUInt16LE(0) !== 0x5a4d) return null;
  const pe = buf.readUInt32LE(0x3c);
  if (pe + 24 > buf.length || buf.readUInt32LE(pe) !== 0x00004550) return null;
  const machine = buf.readUInt16LE(pe + 4);
  const nsec = buf.readUInt16LE(pe + 6);
  const optSize = buf.readUInt16LE(pe + 20);
  const opt = pe + 24;
  const magic = buf.readUInt16LE(opt);
  const ddOff = magic === 0x20b ? opt + 112 : opt + 96;
  const ndd = buf.readUInt32LE(ddOff - 4);
  const sections = [];
  const secOff = opt + optSize;
  for (let k = 0; k < nsec; k++) {
    const s = secOff + k * 40;
    if (s + 40 > buf.length) break;
    sections.push({
      name: buf.toString('latin1', s, s + 8).replace(/\0+$/, ''),
      vsize: buf.readUInt32LE(s + 8), va: buf.readUInt32LE(s + 12), rawSize: buf.readUInt32LE(s + 16), raw: buf.readUInt32LE(s + 20),
    });
  }
  const rvaToOff = (rva) => {
    for (const s of sections) if (rva >= s.va && rva < s.va + Math.max(s.vsize, s.rawSize)) return s.raw + (rva - s.va);
    return -1;
  };
  const info = { format: 'pe', machine, pe32plus: magic === 0x20b, sections: sections.map((s) => s.name), dotnet: false };
  if (ndd > 14 && ddOff + 15 * 8 <= buf.length) info.dotnet = buf.readUInt32LE(ddOff + 14 * 8) !== 0;
  if (ndd > 2 && ddOff + 3 * 8 <= buf.length) {
    const rva = buf.readUInt32LE(ddOff + 16);
    const base = rva ? rvaToOff(rva) : -1;
    if (base >= 0) {
      const dir = (off) => {
        const named = buf.readUInt16LE(off + 12);
        const ids = buf.readUInt16LE(off + 14);
        const list = [];
        for (let k = 0; k < named + ids; k++) {
          const e = off + 16 + k * 8;
          if (e + 8 > buf.length) break;
          list.push({ id: buf.readUInt32LE(e), off: buf.readUInt32LE(e + 4) });
        }
        return list;
      };
      try {
        const ver = dir(base).find((e) => e.id === 16 && (e.off & 0x80000000));
        if (ver) {
          const l2 = dir(base + (ver.off & 0x7fffffff))[0];
          let node = l2;
          let guard = 0;
          while (node && (node.off & 0x80000000) && guard++ < 3) node = dir(base + (node.off & 0x7fffffff))[0];
          if (node) {
            const de = base + node.off;
            const dataRva = buf.readUInt32LE(de);
            const size = buf.readUInt32LE(de + 4);
            const off = rvaToOff(dataRva);
            if (off >= 0) info.version = parseVersionInfo(buf, off, size);
          }
        }
      } catch { /* malformed resources */ }
    }
  }
  return info;
}

function cleanVersion(v) {
  if (!v) return null;
  const s = String(v).trim().replace(/\+.*$/, '').replace(/,\s*/g, '.').replace(/\s.*$/, '');
  return /\d/.test(s) ? s : null;
}

function peComponents(info, file) {
  const out = [];
  const vi = info.version;
  if (!vi) return out;
  const st = vi.strings;
  const base = String(st.OriginalFilename || st.InternalName || path.basename(file)).replace(/\.(dll|exe|mui)$/i, '');
  const product = st.ProductName || '';
  const version = cleanVersion(st.ProductVersion) || cleanVersion(st.FileVersion) || (vi.productVersion !== '0.0.0.0' ? vi.productVersion : null);
  const company = st.CompanyName || '';
  const evidence = 'VS_VERSIONINFO';
  const native = NATIVE_PATTERNS.find((p) => new RegExp(`^${p.title}$`, 'i').test(product.trim()) || new RegExp(`^lib?${p.name}$`, 'i').test(base));
  if (/\.dll$/i.test(file) && /^[A-Za-z][\w]*(\.[A-Za-z0-9][\w]*)+$/.test(base) && !/^Microsoft. Windows/i.test(product)) {
    let v = version;
    const parts = v ? v.split('.') : [];
    if (parts.length === 4 && parts.every((x) => /^\d+$/.test(x))) v = parts.slice(0, 3).join('.');
    out.push(component('NuGet', base, v, { evidence, product, company }));
  } else if (native) {
    out.push(component('ConanCenter', native.name, version ? version.split('.').slice(0, 3).join('.') : null, { evidence, product, company }));
  } else if (product || base) {
    out.push(component('generic', product || base, version, { evidence, product, company }));
  }
  return out;
}

// --------------------------------------------------------- ELF / Mach-O --

function cstr(buf, off) {
  if (off < 0 || off >= buf.length) return '';
  let end = off;
  while (end < buf.length && buf[end] !== 0) end++;
  return buf.toString('latin1', off, end);
}

function parseElf(buf) {
  if (buf.length < 52 || buf.readUInt32BE(0) !== 0x7f454c46) return null;
  const is64 = buf[4] === 2;
  const le = buf[5] !== 2;
  const u16 = (o) => (le ? buf.readUInt16LE(o) : buf.readUInt16BE(o));
  const u32 = (o) => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
  const uN = (o) => (is64 ? Number(le ? buf.readBigUInt64LE(o) : buf.readBigUInt64BE(o)) : u32(o));
  const info = { format: 'elf', bits: is64 ? 64 : 32, endian: le ? 'little' : 'big', soname: null, needed: [], versionDefinitions: [] };
  try {
    const shoff = uN(is64 ? 0x28 : 0x20);
    const shentsize = u16(is64 ? 0x3a : 0x2e);
    const shnum = u16(is64 ? 0x3c : 0x30);
    const shstrndx = u16(is64 ? 0x3e : 0x32);
    if (!shoff || shoff + shnum * shentsize > buf.length) return info;
    const sec = [];
    for (let k = 0; k < shnum; k++) {
      const s = shoff + k * shentsize;
      sec.push(is64
        ? { name: u32(s), type: u32(s + 4), offset: uN(s + 24), size: uN(s + 32), link: u32(s + 40), info: u32(s + 44), entsize: uN(s + 56) }
        : { name: u32(s), type: u32(s + 4), offset: u32(s + 16), size: u32(s + 20), link: u32(s + 24), info: u32(s + 28), entsize: u32(s + 36) });
    }
    const names = sec[shstrndx];
    for (const s of sec) s.label = names ? cstr(buf, names.offset + s.name) : '';
    info.sections = sec.map((s) => s.label).filter(Boolean);
    const dyn = sec.find((s) => s.type === 6);
    if (dyn) {
      const strtab = sec[dyn.link];
      const ent = is64 ? 16 : 8;
      for (let p = dyn.offset; p + ent <= dyn.offset + dyn.size && p + ent <= buf.length; p += ent) {
        const tag = uN(p);
        const val = uN(p + (is64 ? 8 : 4));
        if (tag === 0) break;
        if (tag === 1 && strtab) info.needed.push(cstr(buf, strtab.offset + val));
        if (tag === 14 && strtab) info.soname = cstr(buf, strtab.offset + val);
      }
    }
    const verdef = sec.find((s) => s.type === 0x6ffffffd);
    if (verdef) {
      const strtab = sec[verdef.link];
      let p = verdef.offset;
      for (let n = 0; n < Math.max(1, verdef.info || 64) && p + 20 <= buf.length; n++) {
        const cnt = u16(p + 6);
        const aux = u32(p + 12);
        const next = u32(p + 16);
        if (cnt && strtab) info.versionDefinitions.push(cstr(buf, strtab.offset + u32(p + aux)));
        if (!next) break;
        p += next;
      }
    }
  } catch { /* truncated headers: keep what was read */ }
  return info;
}

function parseMachO(buf) {
  if (buf.length < 28) return null;
  let off = 0;
  if (buf.readUInt32BE(0) === 0xcafebabe && buf.readUInt32BE(4) < 32) {
    if (buf.length < 28) return null;
    off = buf.readUInt32BE(16);
  }
  const magic = buf.readUInt32LE(off);
  if (magic !== 0xfeedface && magic !== 0xfeedfacf) return null;
  const is64 = magic === 0xfeedfacf;
  const ncmds = buf.readUInt32LE(off + 16);
  const info = { format: 'macho', bits: is64 ? 64 : 32, installName: null, currentVersion: null, needed: [] };
  let p = off + (is64 ? 32 : 28);
  for (let k = 0; k < ncmds && p + 8 <= buf.length; k++) {
    const cmd = buf.readUInt32LE(p);
    const size = buf.readUInt32LE(p + 4);
    if (size < 8) break;
    if (cmd === 0xd || cmd === 0xc) {
      const name = cstr(buf, p + buf.readUInt32LE(p + 8));
      if (cmd === 0xd) {
        info.installName = name;
        const v = buf.readUInt32LE(p + 16);
        info.currentVersion = `${v >>> 16}.${(v >>> 8) & 0xff}.${v & 0xff}`;
      } else info.needed.push(name);
    }
    p += size;
  }
  return info;
}

function nativeStringComponents(buf) {
  const text = buf.toString('latin1', 0, Math.min(buf.length, 64 * 1024 * 1024));
  const out = [];
  for (const p of NATIVE_PATTERNS) {
    const m = p.re.exec(text);
    if (!m) continue;
    if (out.some((c) => c.name === p.name)) continue;
    out.push(component('ConanCenter', p.name, m[1], { evidence: `version string "${m[0].slice(0, 60)}"` }));
  }
  return out;
}

// ------------------------------------------------------------- public ----

function identifyBinary(buf, file) {
  const f = String(file);
  const result = { file: f, format: 'unknown', components: [], info: {} };
  if (!Buffer.isBuffer(buf) || !buf.length) return result;
  try {
    if (/\.(jar|war|ear)$/i.test(f)) Object.assign(result, identifyJar(buf, f));
    else if (/\.(whl|egg)$/i.test(f)) Object.assign(result, identifyWheel(buf, f));
    else if (/\.nupkg$/i.test(f)) Object.assign(result, identifyNupkg(buf, f));
    else {
      const pe = parsePe(buf);
      const elf = pe ? null : parseElf(buf);
      const macho = pe || elf ? null : parseMachO(buf);
      const native = nativeStringComponents(buf);
      if (pe) { result.format = 'pe'; result.info = pe; result.components.push(...peComponents(pe, f)); }
      else if (elf) {
        result.format = 'elf';
        result.info = elf;
      } else if (macho) { result.format = 'macho'; result.info = macho; }
      for (const c of native) if (!result.components.some((x) => x.ecosystem === c.ecosystem && x.name === c.name)) result.components.push(c);
      if ((elf || macho) && !native.length) {
        const so = elf ? elf.soname : macho.installName && path.basename(macho.installName);
        const label = so || path.basename(f);
        const m = /^(?:lib)?([A-Za-z][\w+-]*?)(?:[.-]\d.*)?\.(?:so|dylib)(?:\.([\d.]+))?$/.exec(label) || /^(?:lib)?([A-Za-z][\w+-]*?)\.(?:so|dylib)/.exec(label);
        const version = (macho && macho.currentVersion !== '0.0.0' && macho.currentVersion) || (m && m[2]) || null;
        if (m) result.components.push(component('generic', m[1], version, { evidence: so ? (elf ? 'DT_SONAME' : 'LC_ID_DYLIB') : 'file name' }));
      }
    }
  } catch (err) {
    result.error = err.message;
  }
  return result;
}

function discoverBinaries(root, options = {}) {
  const out = [];
  if (!root) return out;
  const max = options.maxBinaryFiles || 500;
  const walkDir = (dir, rel, depth) => {
    if (depth > (options.maxDepth || 12) || out.length >= max) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const e of entries) {
      if (out.length >= max) return;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (BINARY_SKIP.has(e.name) || e.name.startsWith('.') || (options.skipDirs || []).includes(e.name)) continue;
        walkDir(path.join(dir, e.name), r, depth + 1);
      } else if (e.isFile() && isBinaryCandidate(e.name)) out.push(r);
    }
  };
  walkDir(root, '', 0);
  return out;
}

// scanBinaries(root, options) or scanBinaries([{ path, buffer }], options)
function scanBinaries(input, options = {}) {
  const binaries = [];
  const maxSize = options.maxBinarySize || 100 * 1024 * 1024;
  let list = [];
  if (typeof input === 'string') {
    const root = path.resolve(input);
    list = discoverBinaries(root, options).map((rel) => ({ path: rel, abs: path.join(root, rel) }));
  } else list = (input || []).filter((x) => x && x.path);
  for (const item of list) {
    let buf = item.buffer || null;
    if (!buf && item.abs) {
      try {
        const st = fs.statSync(item.abs);
        if (st.size > maxSize) { binaries.push({ file: item.path, format: 'skipped', components: [], info: { size: st.size }, error: 'too large' }); continue; }
        buf = fs.readFileSync(item.abs);
      } catch (err) { binaries.push({ file: item.path, format: 'unknown', components: [], info: {}, error: err.message }); continue; }
    }
    const r = identifyBinary(buf, item.path);
    r.size = buf ? buf.length : 0;
    binaries.push(r);
  }
  const components = [];
  for (const b of binaries) for (const c of b.components) components.push({ ...c, file: b.file, format: b.format });
  return { binaries, components };
}

module.exports = {
  BINARY_RE, isBinaryCandidate, identifyBinary, discoverBinaries, scanBinaries,
  parsePe, parseElf, parseMachO, parseManifest, parseProperties, parseVersionInfo,
};
