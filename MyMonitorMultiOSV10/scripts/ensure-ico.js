"use strict";

const fs = require("fs");
const path = require("path");

function pngSize(buf) {
  if (buf.length < 24 || buf.toString("ascii", 1, 4) !== "PNG") {
    return { width: 0, height: 0 };
  }
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function pngToIco(png) {
  const { width, height } = pngSize(png);
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  const dir = Buffer.alloc(16);
  dir[0] = width >= 256 ? 0 : width;
  dir[1] = height >= 256 ? 0 : height;
  dir.writeUInt16LE(1, 4);
  dir.writeUInt16LE(32, 6);
  dir.writeUInt32LE(png.length, 8);
  dir.writeUInt32LE(22, 12);
  return Buffer.concat([header, dir, png]);
}

function ensureIco(pngPath, icoPath) {
  const src = pngPath || path.join(__dirname, "..", "app", "assets", "icon.png");
  const dest = icoPath || path.join(__dirname, "..", "app", "assets", "icon.ico");
  if (!fs.existsSync(src)) {
    throw new Error(`missing icon: ${src}`);
  }
  if (fs.existsSync(dest) && fs.statSync(dest).mtimeMs >= fs.statSync(src).mtimeMs) {
    return dest;
  }
  fs.writeFileSync(dest, pngToIco(fs.readFileSync(src)));
  return dest;
}

if (require.main === module) {
  const dest = ensureIco();
  console.log(`[ensure-ico] ${path.relative(path.join(__dirname, ".."), dest)}`);
}

module.exports = { ensureIco, pngToIco };
