import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const icoPath = path.resolve(here, "..", "..", "Assets", "MyGit.ico");
const outDir = path.resolve(here, "..", "build");
const ico = fs.readFileSync(icoPath);
const count = ico.readUInt16LE(4);
let best = null;
for (let index = 0; index < count; index++) {
  const entry = 6 + index * 16;
  const width = ico[entry] || 256;
  const size = ico.readUInt32LE(entry + 8);
  const offset = ico.readUInt32LE(entry + 12);
  if (!best || width > best.width) best = { width, size, offset };
}
const png = ico.subarray(best.offset, best.offset + best.size);
if (png.readUInt32BE(0) !== 0x89504e47) {
  throw new Error("The largest image in Assets/MyGit.ico is not a PNG.");
}

fs.mkdirSync(outDir, { recursive: true });
fs.copyFileSync(icoPath, path.join(outDir, "icon.ico"));
fs.writeFileSync(path.join(outDir, "icon.png"), png);

const type = Buffer.from("ic08");
const chunkSize = 8 + png.length;
const total = 8 + chunkSize;
const icns = Buffer.alloc(total);
icns.write("icns", 0);
icns.writeUInt32BE(total, 4);
type.copy(icns, 8);
icns.writeUInt32BE(chunkSize, 12);
png.copy(icns, 16);
fs.writeFileSync(path.join(outDir, "icon.icns"), icns);
console.log(`Icons prepared from Assets/MyGit.ico (${best.width}px).`);
