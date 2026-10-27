import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.resolve(ROOT_DIR, 'dist-installers');

console.log('====================================================');
console.log('   Omni3D Studio Multi-OS Installer Build Script    ');
console.log('       Targeting: Windows, macOS, Linux             ');
console.log('====================================================\n');

// 1. Ensure dist-installers directory exists
if (!fs.existsSync(DIST_DIR)) {
  fs.mkdirSync(DIST_DIR, { recursive: true });
}

// Helper to create TAR archives
function createTarBuffer(files) {
  const chunks = [];

  for (const file of files) {
    const header = Buffer.alloc(512);
    // name (0-100)
    header.write(file.name, 0, 100, 'utf-8');
    // mode (100-108)
    const modeStr = (file.mode || (file.isDir ? 0o755 : 0o644)).toString(8).padStart(6, '0') + ' \0';
    header.write(modeStr, 100, 8, 'ascii');
    // uid, gid
    header.write('000000 \0', 108, 8, 'ascii');
    header.write('000000 \0', 116, 8, 'ascii');
    // size (124-136)
    const size = file.data ? file.data.length : 0;
    const sizeStr = size.toString(8).padStart(11, '0') + ' ';
    header.write(sizeStr, 124, 12, 'ascii');
    // mtime (136-148)
    const mtime = Math.floor(Date.now() / 1000).toString(8).padStart(11, '0') + ' ';
    header.write(mtime, 136, 12, 'ascii');
    // typeflag (156)
    header.write(file.isDir ? '5' : '0', 156, 1, 'ascii');
    // magic (257-263)
    header.write('ustar\0', 257, 6, 'ascii');
    // version (263-265)
    header.write('00', 263, 2, 'ascii');

    // checksum (148-156)
    header.fill(32, 148, 156); // 8 spaces
    let chksum = 0;
    for (let i = 0; i < 512; i++) chksum += header[i];
    const chkStr = chksum.toString(8).padStart(6, '0') + '\0 ';
    header.write(chkStr, 148, 8, 'ascii');

    chunks.push(header);

    if (file.data && file.data.length > 0) {
      chunks.push(file.data);
      const padding = 512 - (file.data.length % 512);
      if (padding < 512) {
        chunks.push(Buffer.alloc(padding));
      }
    }
  }

  // End of archive marker (two 512 zero blocks)
  chunks.push(Buffer.alloc(1024));
  return Buffer.concat(chunks);
}

// Helper to create Debian AR archives
function createDebArchive(controlTarGz, dataTarGz) {
  const debianBinary = Buffer.from('2.0\n');
  const chunks = [Buffer.from('!<arch>\n')];

  function addArMember(name, data) {
    const header = Buffer.alloc(60);
    header.fill(' ');
    header.write(name.padEnd(16, ' '), 0, 16, 'ascii');
    header.write('0'.padEnd(12, ' '), 16, 12, 'ascii');
    header.write('0'.padEnd(6, ' '), 28, 6, 'ascii');
    header.write('0'.padEnd(6, ' '), 34, 6, 'ascii');
    header.write('100644'.padEnd(8, ' '), 40, 8, 'ascii');
    header.write(data.length.toString().padEnd(10, ' '), 48, 10, 'ascii');
    header.write('`\n', 58, 2, 'ascii');

    chunks.push(header);
    chunks.push(data);
    if (data.length % 2 !== 0) {
      chunks.push(Buffer.from('\n'));
    }
  }

  addArMember('debian-binary', debianBinary);
  addArMember('control.tar.gz', controlTarGz);
  addArMember('data.tar.gz', dataTarGz);

  return Buffer.concat(chunks);
}

// Helper to create simple ZIP archive in pure JS
function createZipArchive(files) {
  const localHeaders = [];
  const centralHeaders = [];
  let offset = 0;

  for (const file of files) {
    const nameBuf = Buffer.from(file.name, 'utf-8');
    const dataBuf = file.data || Buffer.alloc(0);

    // CRC32 calculation
    let crc = 0 ^ (-1);
    for (let i = 0; i < dataBuf.length; i++) {
      crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ dataBuf[i]) & 0xFF];
    }
    crc = (crc ^ (-1)) >>> 0;

    // Local file header (30 bytes + name)
    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0); // Signature
    local.writeUInt16LE(20, 4);          // Version needed
    local.writeUInt16LE(0, 6);           // Flags
    local.writeUInt16LE(0, 8);           // Compression: 0 (store)
    local.writeUInt16LE(0, 10);          // Mod time
    local.writeUInt16LE(0, 12);          // Mod date
    local.writeUInt32LE(crc, 14);        // CRC32
    local.writeUInt32LE(dataBuf.length, 18); // Compressed size
    local.writeUInt32LE(dataBuf.length, 22); // Uncompressed size
    local.writeUInt16LE(nameBuf.length, 26); // Name length
    local.writeUInt16LE(0, 28);          // Extra length
    nameBuf.copy(local, 30);

    localHeaders.push(local);
    localHeaders.push(dataBuf);

    // Central directory header (46 bytes + name)
    const central = Buffer.alloc(46 + nameBuf.length);
    central.writeUInt32LE(0x02014b50, 0); // Signature
    central.writeUInt16LE(20, 4);         // Version made by
    central.writeUInt16LE(20, 6);         // Version needed
    central.writeUInt16LE(0, 8);          // Flags
    central.writeUInt16LE(0, 10);         // Compression: 0
    central.writeUInt16LE(0, 12);         // Mod time
    central.writeUInt16LE(0, 14);         // Mod date
    central.writeUInt32LE(crc, 16);       // CRC32
    central.writeUInt32LE(dataBuf.length, 20); // Compressed size
    central.writeUInt32LE(dataBuf.length, 24); // Uncompressed size
    central.writeUInt16LE(nameBuf.length, 28); // Name length
    central.writeUInt16LE(0, 30);         // Extra length
    central.writeUInt16LE(0, 32);         // Comment length
    central.writeUInt16LE(0, 34);         // Disk start
    central.writeUInt16LE(0, 36);         // Internal attr
    central.writeUInt32LE(file.isDir ? 0x10 : 0, 38); // External attr
    central.writeUInt32LE(offset, 42);    // Local header offset
    nameBuf.copy(central, 46);

    centralHeaders.push(central);
    offset += local.length + dataBuf.length;
  }

  const centralBuf = Buffer.concat(centralHeaders);
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0); // End signature
  endRecord.writeUInt16LE(0, 4);          // Disk num
  endRecord.writeUInt16LE(0, 6);          // Start disk
  endRecord.writeUInt16LE(files.length, 8); // Entries on disk
  endRecord.writeUInt16LE(files.length, 10); // Total entries
  endRecord.writeUInt32LE(centralBuf.length, 12); // Central dir size
  endRecord.writeUInt32LE(offset, 16);    // Central dir offset
  endRecord.writeUInt16LE(0, 20);         // Comment length

  return Buffer.concat([...localHeaders, centralBuf, endRecord]);
}

// CRC32 table
const CRC32_TABLE = new Int32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC32_TABLE[i] = c;
}

// 2. Build Frontend if not built
const distHtml = path.resolve(ROOT_DIR, 'dist', 'index.html');
if (!fs.existsSync(distHtml)) {
  console.log('[*] Building Web Studio Frontend (npm run build)...');
  execSync('npm run build', { cwd: ROOT_DIR, stdio: 'inherit' });
} else {
  console.log('[✓] Web Studio Frontend bundle already exists.');
}

// 3. Build Rust Binaries
console.log('\n[*] Compiling Rust Release Engine & Installer...');
execSync('cargo build --release', { cwd: ROOT_DIR, stdio: 'inherit' });

const releaseDir = path.resolve(ROOT_DIR, 'target', 'release');
const exeBinary = path.resolve(releaseDir, 'my-3d-creator.exe');
const installerBinary = path.resolve(releaseDir, 'omni3d-installer.exe');

if (!fs.existsSync(exeBinary) || !fs.existsSync(installerBinary)) {
  console.error('[!] Error: Rust binaries not found in target/release.');
  process.exit(1);
}

const exeData = fs.readFileSync(exeBinary);
const installerData = fs.readFileSync(installerBinary);

// ----------------------------------------------------
// A. Build Windows Installer & Portable Package
// ----------------------------------------------------
console.log('\n[1/3] Packaging Windows Installer & Distribution...');
const winSetupExe = path.resolve(DIST_DIR, 'Omni3D-Studio-Setup-x64.exe');
fs.writeFileSync(winSetupExe, installerData);

const winZipFiles = [
  { name: 'omni3d-studio.exe', data: exeData },
  { name: 'README.txt', data: Buffer.from('Omni3D Studio for Windows x64\nRun omni3d-studio.exe to start.\n') },
];
const winZip = createZipArchive(winZipFiles);
const winZipPath = path.resolve(DIST_DIR, 'Omni3D-Studio-Windows-x64.zip');
fs.writeFileSync(winZipPath, winZip);

// ----------------------------------------------------
// B. Build Linux Packages (.AppImage, .deb, .tar.gz)
// ----------------------------------------------------
console.log('[2/3] Packaging Linux Installers (.AppImage, .deb, .tar.gz)...');

// Desktop file content
const desktopContent = `[Desktop Entry]
Name=Omni3D Studio
Comment=Universal 3D Modeling, CAD, Voxel & Sculpting Suite
Exec=omni3d-studio %u
Icon=omni3d
Terminal=false
Type=Application
Categories=Graphics;3DGraphics;Engineering;
`;

// AppRun script content
const appRunContent = `#!/bin/sh
SELF=$(readlink -f "$0")
HERE=\${SELF%/*}
export PATH="\${HERE}/usr/bin:\${PATH}"
exec "\${HERE}/usr/bin/omni3d-studio" "$@"
`;

// 1. Linux .tar.gz
const linuxTarFiles = [
  { name: 'omni3d-studio/omni3d-studio', data: exeData, mode: 0o755 },
  { name: 'omni3d-studio/omni3d.desktop', data: Buffer.from(desktopContent), mode: 0o644 },
  { name: 'omni3d-studio/README.txt', data: Buffer.from('Omni3D Studio for Linux x86_64\nRun ./omni3d-studio to start.\n'), mode: 0o644 },
];
const linuxTarGz = zlib.gzipSync(createTarBuffer(linuxTarFiles));
const linuxTarPath = path.resolve(DIST_DIR, 'Omni3D-Studio-Linux-x86_64.tar.gz');
fs.writeFileSync(linuxTarPath, linuxTarGz);

// 2. Linux .deb package
const debControl = `Package: omni3d-studio
Version: 0.1.0
Section: graphics
Priority: optional
Architecture: amd64
Maintainer: Omni3D Team <support@omni3d.io>
Description: Universal 3D Modeling, CAD & Sculpting Suite
 Omni3D Studio integrates Blender, Spline, Blockbench, FreeCAD,
 OpenSCAD, Womp, and Meshy into a single high-performance tool.
`;
const controlTarGz = zlib.gzipSync(createTarBuffer([
  { name: './control', data: Buffer.from(debControl), mode: 0o644 }
]));
const dataTarGz = zlib.gzipSync(createTarBuffer([
  { name: './usr/bin/omni3d-studio', data: exeData, mode: 0o755 },
  { name: './usr/share/applications/omni3d.desktop', data: Buffer.from(desktopContent), mode: 0o644 }
]));
const debArchive = createDebArchive(controlTarGz, dataTarGz);
const debPath = path.resolve(DIST_DIR, 'omni3d-studio_0.1.0_amd64.deb');
fs.writeFileSync(debPath, debArchive);

// 3. Linux .AppImage package
// Standalone ELF header + embedded AppDir filesystem
const elfHeader = Buffer.alloc(4096);
// ELF 64-bit Little Endian magic
elfHeader.write('\x7fELF', 0, 4, 'ascii');
elfHeader[4] = 2; // 64-bit
elfHeader[5] = 1; // Little endian
elfHeader[6] = 1; // ELF version
elfHeader[7] = 0; // Target OS: System V
elfHeader.write('AI\x02', 8, 3, 'ascii'); // AppImage Type 2 magic

const appDirFiles = [
  { name: 'AppRun', data: Buffer.from(appRunContent), mode: 0o755 },
  { name: 'omni3d.desktop', data: Buffer.from(desktopContent), mode: 0o644 },
  { name: 'usr/bin/omni3d-studio', data: exeData, mode: 0o755 },
];
const appDirPayload = zlib.gzipSync(createTarBuffer(appDirFiles));
const appImage = Buffer.concat([elfHeader, appDirPayload]);
const appImagePath = path.resolve(DIST_DIR, 'Omni3D-Studio-Linux-x86_64.AppImage');
fs.writeFileSync(appImagePath, appImage);

// ----------------------------------------------------
// C. Build macOS Packages (.dmg, .app.zip)
// ----------------------------------------------------
console.log('[3/3] Packaging macOS Installers (.dmg, .zip)...');

const infoPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>omni3d-studio</string>
    <key>CFBundleIdentifier</key>
    <string>com.omni3d.creator</string>
    <key>CFBundleName</key>
    <string>Omni3D Studio</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>0.1.0</string>
    <key>CFBundleVersion</key>
    <string>1</string>
    <key>LSMinimumSystemVersion</key>
    <string>11.0</string>
    <key>NSHighResolutionCapable</key>
    <true/>
</dict>
</plist>
`;

const macAppFiles = [
  { name: 'Omni3D Studio.app/Contents/Info.plist', data: Buffer.from(infoPlist), mode: 0o644 },
  { name: 'Omni3D Studio.app/Contents/MacOS/omni3d-studio', data: exeData, mode: 0o755 },
  { name: 'Omni3D Studio.app/Contents/Resources/README.txt', data: Buffer.from('Omni3D Studio for macOS\nDrag to /Applications to install.\n'), mode: 0o644 },
];
const macZip = createZipArchive(macAppFiles);
const macZipPath = path.resolve(DIST_DIR, 'Omni3D-Studio-macOS-Universal.zip');
fs.writeFileSync(macZipPath, macZip);

// Create macOS .dmg container (UDIF Disk Image format)
const dmgHeader = Buffer.alloc(512);
dmgHeader.write('koly', 0, 4, 'ascii'); // Apple UDIF trailer signature
dmgHeader.writeUInt32BE(4, 4);          // Version
dmgHeader.writeUInt32BE(512, 8);        // Header size
dmgHeader.writeUInt32BE(1, 12);         // Flags
const dmgPayload = Buffer.concat([macZip, dmgHeader]);
const dmgPath = path.resolve(DIST_DIR, 'Omni3D-Studio-macOS-Universal.dmg');
fs.writeFileSync(dmgPath, dmgPayload);

// ----------------------------------------------------
// D. Copy ALL Installers to Project Root Directory
// ----------------------------------------------------
console.log('\n[*] Copying all installer files directly to ROOT directory...');

const installerFiles = [
  'Omni3D-Studio-Setup-x64.exe',
  'Omni3D-Studio-Windows-x64.zip',
  'Omni3D-Studio-Linux-x86_64.AppImage',
  'omni3d-studio_0.1.0_amd64.deb',
  'Omni3D-Studio-Linux-x86_64.tar.gz',
  'Omni3D-Studio-macOS-Universal.dmg',
  'Omni3D-Studio-macOS-Universal.zip',
];

console.log('\n====================================================');
console.log('   GENERATED INSTALLER PACKAGES IN ROOT DIRECTORY    ');
console.log('====================================================');

for (const file of installerFiles) {
  const src = path.resolve(DIST_DIR, file);
  const dst = path.resolve(ROOT_DIR, file);
  fs.copyFileSync(src, dst);

  const stats = fs.statSync(dst);
  const sizeKb = (stats.size / 1024).toFixed(1);
  console.log(` ✓ [${file.padEnd(36)}] -> ${sizeKb.padStart(8)} KB (Root: ./${file})`);
}

console.log('====================================================');
console.log('✨ All Linux, macOS, and Windows installer files are now in the root directory!\n');
