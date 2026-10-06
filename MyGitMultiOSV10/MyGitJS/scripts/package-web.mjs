import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(here, "..");
const releaseDir = path.join(projectDir, "release");
const pkg = JSON.parse(fs.readFileSync(path.join(projectDir, "package.json"), "utf8"));
const folder = `MyGitJS-Web-${pkg.version}`;
const archiveName = `${folder}.zip`;

const files = [];
addTree(path.join(projectDir, "dist"), `${folder}/dist`);
addTree(path.join(projectDir, "dist-server"), `${folder}/dist-server`);
addTree(path.join(projectDir, "node_modules", "node-pty"), `${folder}/node_modules/node-pty`);
files.push({
  name: `${folder}/package.json`,
  data: Buffer.from(JSON.stringify({
    name: "mygit-web",
    version: pkg.version,
    private: true,
    type: "module",
    scripts: { start: "node dist-server/cli.cjs" },
  }, null, 2) + "\n"),
});

fs.mkdirSync(releaseDir, { recursive: true });
const destination = path.join(releaseDir, archiveName);
writeZip(files, destination);
console.log(`Web package: ${destination}`);

function addTree(source, prefix) {
  if (!fs.existsSync(source)) throw new Error(`Missing ${source}`);
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (entry.name === ".cache") continue;
    const abs = path.join(source, entry.name);
    const rel = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) addTree(abs, rel);
    else if (entry.isFile()) files.push({ name: rel, data: fs.readFileSync(abs) });
  }
}

function writeZip(entries, destination) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name.replaceAll("\\", "/"), "utf8");
    const compressed = zlib.deflateRawSync(entry.data);
    const crc = zlib.crc32(entry.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    parts.push(local, name, compressed);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(8, 10);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(compressed.length, 20);
    cen.writeUInt32LE(entry.data.length, 24);
    cen.writeUInt16LE(name.length, 28);
    cen.writeUInt32LE(offset, 42);
    central.push(cen, name);
    offset += local.length + name.length + compressed.length;
  }
  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  fs.writeFileSync(destination, Buffer.concat([...parts, centralBuf, end]));
}
