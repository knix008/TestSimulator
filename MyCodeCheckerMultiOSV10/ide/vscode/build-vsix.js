#!/usr/bin/env node
'use strict';

// Packs the extension into a .vsix (a zip in the Open Packaging layout that
// `code --install-extension` reads) with node:zlib only — no vsce, no deps.
//
//   node ide/vscode/build-vsix.js                 -> ide/vscode/dist/mycodechecker-<version>.vsix
//   node ide/vscode/build-vsix.js --out <dir>     -> other output folder
//   node ide/vscode/build-vsix.js --no-core       -> without the bundled core (set mycodechecker.corePath)
//
// Layout:
//   [Content_Types].xml
//   extension.vsixmanifest
//   extension/package.json, extension.js, rpc.js, README.md
//   extension/server/core/**     (copy of the repository's core/, the analysis engines + core/lsp)

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const EXT_DIR = __dirname;
const CORE_DIR = path.join(__dirname, '..', '..', 'core');
const EXTENSION_FILES = ['package.json', 'extension.js', 'rpc.js', 'README.md'];

// ── CRC-32 and zip writer ────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
  const d = date || new Date();
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const day = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, day };
}

// entries: [{ name, data: Buffer }] -> Buffer (zip)
function createZip(entries, date) {
  const { time, day } = dosDateTime(date);
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(String(entry.data), 'utf8');
    const crc = crc32(data);
    const deflated = zlib.deflateRawSync(data, { level: 9 });
    const stored = deflated.length >= data.length;
    const body = stored ? data : deflated;
    const method = stored ? 0 : 8;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, body);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(day, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += local.length + name.length + body.length;
  }
  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, ...centrals, end]);
}

// ── VSIX metadata ────────────────────────────────────────────
function xml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
}

function vsixManifest(pkg) {
  return `<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011" xmlns:d="http://schemas.microsoft.com/developer/vsx-schema-design/2011">
  <Metadata>
    <Identity Language="en-US" Id="${xml(pkg.name)}" Version="${xml(pkg.version)}" Publisher="${xml(pkg.publisher)}" />
    <DisplayName>${xml(pkg.displayName || pkg.name)}</DisplayName>
    <Description xml:space="preserve">${xml(pkg.description || '')}</Description>
    <Tags>${xml((pkg.keywords || []).join(','))}</Tags>
    <Categories>${xml((pkg.categories || []).join(','))}</Categories>
    <GalleryFlags>Public</GalleryFlags>
    <Properties>
      <Property Id="Microsoft.VisualStudio.Code.Engine" Value="${xml((pkg.engines && pkg.engines.vscode) || '*')}" />
      <Property Id="Microsoft.VisualStudio.Code.ExtensionDependencies" Value="" />
      <Property Id="Microsoft.VisualStudio.Code.ExtensionPack" Value="" />
      <Property Id="Microsoft.VisualStudio.Code.ExtensionKind" Value="workspace" />
      <Property Id="Microsoft.VisualStudio.Code.LocalizedLanguages" Value="" />
    </Properties>
  </Metadata>
  <Installation>
    <InstallationTarget Id="Microsoft.VisualStudio.Code" />
  </Installation>
  <Dependencies />
  <Assets>
    <Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true" />
    <Asset Type="Microsoft.VisualStudio.Services.Content.Details" Path="extension/README.md" Addressable="true" />
  </Assets>
</PackageManifest>
`;
}

const CONTENT_TYPES = {
  '.json': 'application/json',
  '.js': 'application/javascript',
  '.md': 'text/markdown',
  '.txt': 'text/plain',
  '.vsixmanifest': 'text/xml',
  '.xml': 'text/xml',
  '.png': 'image/png',
};

function contentTypesXml(names) {
  const exts = new Set(names.map((n) => path.extname(n).toLowerCase()).filter(Boolean));
  exts.add('.vsixmanifest');
  const rows = [...exts].sort().map((e) => `<Default Extension="${xml(e)}" ContentType="${xml(CONTENT_TYPES[e] || 'application/octet-stream')}" />`);
  return `<?xml version="1.0" encoding="utf-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${rows.join('')}</Types>\n`;
}

function listCore(dir, base = dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules' || ent.name.startsWith('.')) continue;
      listCore(full, base, out);
    } else if (ent.isFile() && /\.(js|json)$/i.test(ent.name)) {
      out.push(path.relative(base, full).replace(/\\/g, '/'));
    }
  }
  return out;
}

function buildVsix(options = {}) {
  const pkg = JSON.parse(fs.readFileSync(path.join(EXT_DIR, 'package.json'), 'utf8'));
  const files = [];
  for (const name of EXTENSION_FILES) files.push({ name: `extension/${name}`, data: fs.readFileSync(path.join(EXT_DIR, name)) });
  const bundleCore = options.bundleCore !== false;
  if (bundleCore) {
    const coreDir = options.coreDir || CORE_DIR;
    for (const rel of listCore(coreDir)) files.push({ name: `extension/server/core/${rel}`, data: fs.readFileSync(path.join(coreDir, rel)) });
  }
  const entries = [
    { name: '[Content_Types].xml', data: Buffer.from(contentTypesXml(files.map((f) => f.name)), 'utf8') },
    { name: 'extension.vsixmanifest', data: Buffer.from(vsixManifest(pkg), 'utf8') },
    ...files,
  ];
  const zip = createZip(entries);
  const outDir = options.outDir || path.join(EXT_DIR, 'dist');
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `${pkg.name}-${pkg.version}.vsix`);
  fs.writeFileSync(file, zip);
  return { file, bytes: zip.length, entries: entries.map((e) => e.name) };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf('--out');
  const result = buildVsix({
    outDir: outIdx >= 0 ? path.resolve(args[outIdx + 1]) : undefined,
    bundleCore: !args.includes('--no-core'),
  });
  process.stdout.write(`${result.file} (${result.entries.length} files, ${(result.bytes / 1024).toFixed(0)} KB)\n`);
}

module.exports = { buildVsix, createZip, crc32, vsixManifest, contentTypesXml };
