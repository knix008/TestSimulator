// Renders the program artwork in 3D (scripts/art/art.js, three.js in a hidden
// Electron window) and writes every file the app and installers use:
//   assets/icon.png (512), assets/icons/<n>x<n>.png, assets/icon.ico, assets/icon.icns
//   assets/file-icon.png / .ico / .icns   (document icon)
//   assets/art/hero.png                   (start-page background fallback)
//   build/installerSidebar.bmp (164×314), build/installerHeader.bmp (150×57)
//
//   npm run build:art
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PNG } from "pngjs";
import pngToIco from "png-to-ico";

const root = path.resolve(import.meta.dirname, "..");
const exe = process.platform === "win32" ? path.join(root, "node_modules/electron/dist/electron.exe")
  : process.platform === "darwin" ? path.join(root, "node_modules/electron/dist/Electron.app/Contents/MacOS/Electron")
  : path.join(root, "node_modules/electron/dist/electron");
const tmp = path.join(os.tmpdir(), `myarch-art-${Date.now()}.json`);
const env = { ...process.env, MYARCH_ART_OUT: tmp };
delete env.ELECTRON_RUN_AS_NODE;
const r = spawnSync(exe, [path.join(root, "scripts/art/main.cjs"), `--user-data-dir=${path.join(os.tmpdir(), "myarch-art-profile")}`], { env, stdio: "inherit", timeout: 120000 });
if (!fs.existsSync(tmp)) {
  console.error(`render-art: renderer failed (exit ${r.status})`);
  process.exit(1);
}
const art = JSON.parse(fs.readFileSync(tmp, "utf8"));
fs.rmSync(tmp, { force: true });
if (!art.ok) {
  console.error(art.error);
  process.exit(1);
}

if (art.boxes) console.log("boxes", JSON.stringify(art.boxes));
const buf = (url) => Buffer.from(url.split(",")[1], "base64");
const write = (rel, data) => {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, data);
  return p;
};

// ICNS: PNG-based entries (macOS 10.7+).
function icns(entries) {
  const parts = entries.map(([type, png]) => {
    const head = Buffer.alloc(8);
    head.write(type, 0, "ascii");
    head.writeUInt32BE(png.length + 8, 4);
    return Buffer.concat([head, png]);
  });
  const body = Buffer.concat(parts);
  const head = Buffer.alloc(8);
  head.write("icns", 0, "ascii");
  head.writeUInt32BE(body.length + 8, 4);
  return Buffer.concat([head, body]);
}

// 24-bit BMP (what NSIS wants for its wizard images), box-filtered to size.
function bmpFromPng(pngBuf, w, h) {
  const src = PNG.sync.read(pngBuf);
  const out = Buffer.alloc(54 + w * h * 3 + h * ((4 - ((w * 3) % 4)) % 4));
  const rowPad = (4 - ((w * 3) % 4)) % 4;
  out.write("BM", 0, "ascii");
  out.writeUInt32LE(out.length, 2);
  out.writeUInt32LE(54, 10);
  out.writeUInt32LE(40, 14);
  out.writeInt32LE(w, 18);
  out.writeInt32LE(h, 22);
  out.writeUInt16LE(1, 26);
  out.writeUInt16LE(24, 28);
  out.writeUInt32LE(out.length - 54, 34);
  const sx = src.width / w;
  const sy = src.height / h;
  let o = 54;
  for (let y = h - 1; y >= 0; y--) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, n = 0;
      for (let yy = Math.floor(y * sy); yy < Math.floor((y + 1) * sy); yy++) {
        for (let xx = Math.floor(x * sx); xx < Math.floor((x + 1) * sx); xx++) {
          const i = (yy * src.width + xx) * 4;
          const a = src.data[i + 3] / 255;
          // Composite over the brand navy so transparent pixels look right.
          r += src.data[i] * a + 16 * (1 - a);
          g += src.data[i + 1] * a + 36 * (1 - a);
          b += src.data[i + 2] * a + 58 * (1 - a);
          n++;
        }
      }
      out[o++] = Math.round(b / n);
      out[o++] = Math.round(g / n);
      out[o++] = Math.round(r / n);
    }
    o += rowPad;
  }
  return out;
}

const icons = Object.fromEntries(Object.entries(art.icons).map(([k, v]) => [+k, buf(v)]));
const docs = Object.fromEntries(Object.entries(art.doc).map(([k, v]) => [+k, buf(v)]));
write("assets/icon.png", icons[512]);
for (const n of [16, 24, 32, 48, 64, 128, 256, 512]) write(`assets/icons/${n}x${n}.png`, icons[n]);
write("assets/icon.ico", await pngToIco([16, 24, 32, 48, 64, 128, 256].map((n) => icons[n])));
write("assets/icon.icns", icns([["icp4", icons[16]], ["icp5", icons[32]], ["icp6", icons[64]], ["ic07", icons[128]], ["ic08", icons[256]], ["ic09", icons[512]], ["ic10", icons[1024]]]));
write("assets/file-icon.png", docs[256]);
write("assets/file-icon.ico", await pngToIco([16, 24, 32, 48, 64, 128, 256].map((n) => docs[n])));
write("assets/file-icon.icns", icns([["icp4", docs[16]], ["icp5", docs[32]], ["icp6", docs[64]], ["ic07", docs[128]], ["ic08", docs[256]], ["ic09", docs[512]]]));
write("assets/art/hero.png", buf(art.hero));
write("build/installerSidebar.bmp", bmpFromPng(buf(art.sidebar), 164, 314));
write("build/installerHeader.bmp", bmpFromPng(buf(art.header), 150, 57));
console.log("render-art: icons, document icon, hero image and installer bitmaps written");
