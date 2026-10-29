// Vendors McNeel's rhino3dm (openNURBS compiled to WebAssembly, MIT) into
// src/vendor/rhino3dm for the Rhino .3dm importer (src/io/rhino3dm.js).
//
//   node scripts/vendor-rhino3dm.mjs
//
// Downloads the pinned npm tarball straight from the registry, checks it
// against the pinned sha512 integrity (and the one the registry publishes
// now), and copies rhino3dm.module.js + rhino3dm.wasm. The npm package ships
// no LICENSE file, so the MIT text of the rhino3dm repository (tag v8.32.0,
// github.com/mcneel/rhino3dm/blob/v8.32.0/LICENSE) is written next to them.
// Bump VERSION and INTEGRITY together.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const VERSION = "8.32.2";
const INTEGRITY = "sha512-Q3/5iHIKJeoE5doXrRy7C1vJer4F8uMYe8K6B8VQHqhGj5BCS1L3EkqNpKyUTERoHyKh7rMmiiZpw9iEUkCnPQ==";
const FILES = ["rhino3dm.module.js", "rhino3dm.wasm"];

const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "src", "vendor", "rhino3dm");

const LICENSE = `MIT License

Copyright (c) 2023 Robert McNeel & Associates

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;

const sri = (buf) => `sha512-${crypto.createHash("sha512").update(buf).digest("base64")}`;

async function fetchBytes(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// Minimal ustar reader: { "package/x": Buffer }.
function untar(buf) {
  const files = {};
  for (let off = 0; off + 512 <= buf.length;) {
    const head = buf.subarray(off, off + 512);
    if (head.every((b) => b === 0)) break;
    const str = (a, b) => head.subarray(a, b).toString("utf8").replace(/\0.*$/s, "");
    const name = (str(345, 500) ? `${str(345, 500)}/` : "") + str(0, 100);
    const size = parseInt(str(124, 136).trim() || "0", 8);
    const type = String.fromCharCode(head[156] || 48);
    if (type === "0" || type === "\0") files[name] = buf.subarray(off + 512, off + 512 + size);
    off += 512 + Math.ceil(size / 512) * 512;
  }
  return files;
}

const meta = JSON.parse((await fetchBytes("https://registry.npmjs.org/rhino3dm")).toString("utf8"));
const v = meta.versions && meta.versions[VERSION];
if (!v) throw new Error(`rhino3dm ${VERSION} is not on the registry`);
if (v.dist.integrity !== INTEGRITY) throw new Error(`registry integrity ${v.dist.integrity} differs from the pinned ${INTEGRITY}`);
if (v.license !== "MIT") throw new Error(`rhino3dm ${VERSION} license is ${v.license}, not MIT`);
const tgz = await fetchBytes(v.dist.tarball);
const got = sri(tgz);
if (got !== INTEGRITY) throw new Error(`tarball integrity ${got} does not match ${INTEGRITY}`);
const files = untar(zlib.gunzipSync(tgz));

fs.mkdirSync(out, { recursive: true });
let bytes = 0;
for (const f of FILES) {
  const data = files[`package/${f}`];
  if (!data) throw new Error(`package/${f} missing from the tarball`);
  fs.writeFileSync(path.join(out, f), data);
  bytes += data.length;
}
fs.writeFileSync(path.join(out, "LICENSE"), LICENSE);
fs.writeFileSync(path.join(out, "VERSION"), `rhino3dm ${VERSION} (npm, ${INTEGRITY})\n`);
console.log(`vendor: rhino3dm ${VERSION} (${(bytes / 1048576).toFixed(2)} MB) -> src/vendor/rhino3dm`);
