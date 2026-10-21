// Export formats: vector files are rendered by Ghostscript (WebAssembly build) and must scan;
// raster files come from qrimage.wasm and must carry the right signature and size.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import jsQR from "jsqr";
import { FORMATS, loadWasmImageEncoder } from "../src/js/exporters.js";
import { DEFAULT_DESIGN } from "../src/js/render.js";
import { arcToCubics, pathSegments, toEps, toPdf } from "../src/js/vector.js";
import { rasterize, root, wasmEncoder } from "./support.js";

const PAYLOAD = "https://github.com/knix008/TestSimulator";

/** A 32×32 orange disc with transparent corners, standing in for a user's logo. */
function sampleLogo() {
  const size = 32;
  const rgba = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const inside = (x - 15.5) ** 2 + (y - 15.5) ** 2 < 15.5 ** 2;
      rgba.set(inside ? [249, 115, 22, 255] : [0, 0, 0, 0], (y * size + x) * 4);
    }
  }
  return { width: size, height: size, rgba };
}

let gsModule;
async function ghostscript(input, name, extra = []) {
  if (!gsModule) {
    const { default: create } = await import("@jspawn/ghostscript-wasm");
    gsModule = { create, wasm: fs.readFileSync(path.join(root, "node_modules", "@jspawn", "ghostscript-wasm", "gs.wasm")) };
  }
  const mod = await gsModule.create({
    instantiateWasm: (imports, done) => {
      WebAssembly.instantiate(gsModule.wasm, imports).then((r) => done(r.instance));
      return {};
    },
    print: () => {},
    printErr: () => {},
  });
  mod.FS.writeFile(`/${name}`, input);
  const captured = [];
  const out = process.stdout.write.bind(process.stdout);
  const err = process.stderr.write.bind(process.stderr);
  process.stdout.write = (c) => captured.push(String(c)) > 0;
  process.stderr.write = (c) => captured.push(String(c)) > 0;
  let code;
  try {
    code = mod.callMain(["-q", "-dNOPAUSE", "-dBATCH", "-dSAFER", "-sDEVICE=ppmraw", "-r200", ...extra, "-sOutputFile=/out.ppm", `/${name}`]);
  } finally {
    process.stdout.write = out;
    process.stderr.write = err;
  }
  assert.equal(code, 0, captured.join(""));
  assert.ok(!/error/i.test(captured.join("")), captured.join(""));
  return mod.FS.readFile("/out.ppm");
}

/** PPM (P6) → RGBA for jsQR. */
function ppmToRgba(ppm) {
  const head = new TextDecoder("latin1").decode(ppm.subarray(0, 200));
  const m = /^P6\s+(?:#[^\n]*\n\s*)*(\d+)\s+(\d+)\s+255\s/.exec(head);
  assert.ok(m, `PPM header ${JSON.stringify(head.slice(0, 16))}`);
  const [w, h] = [Number(m[1]), Number(m[2])];
  const start = m[0].length;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i += 1) {
    data.set(ppm.subarray(start + i * 3, start + i * 3 + 3), i * 4);
    data[i * 4 + 3] = 255;
  }
  return { data, width: w, height: h };
}

function scans(img, what) {
  const found = jsQR(img.data, img.width, img.height);
  assert.ok(found, `${what}: did not scan`);
  assert.equal(found.data, PAYLOAD, what);
}

test("arcs become cubics that stay on the circle", () => {
  const curves = arcToCubics(2, 1, 1, 1, 0, 1, 0, 0, 1); // half circle around (1,1)
  assert.equal(curves.length, 2);
  const at = (c, t) => [0, 1].map((k) => (1 - t) ** 3 * c.p0[k] + 3 * (1 - t) ** 2 * t * c[1 + k] + 3 * (1 - t) * t * t * c[3 + k] + t ** 3 * c[5 + k]);
  let p0 = [2, 1];
  for (const c of curves) {
    c.p0 = p0;
    for (const t of [0.25, 0.5, 0.75]) {
      const [x, y] = at(c, t);
      assert.ok(Math.abs(Math.hypot(x - 1, y - 1) - 1) < 0.002, `${x},${y}`);
    }
    p0 = [c[5], c[6]];
  }
  assert.deepEqual(p0, [0, 1]);
  assert.deepEqual(pathSegments("M1 2h3v4h-3z"), [["M", 1, 2], ["L", 4, 2], ["L", 4, 6], ["L", 1, 6], ["Z"]]);
});

test("PDF and EPS render in Ghostscript and scan, for every style", { timeout: 300000 }, async () => {
  const qr = (await wasmEncoder())(PAYLOAD, { ecc: "H" });
  const designs = [
    { ...DEFAULT_DESIGN },
    { ...DEFAULT_DESIGN, moduleStyle: "rounded", eyeFrame: "rounded", eyeBall: "circle", gradient: "diagonal", fg: "#1e3a8a", fg2: "#7c3aed", eyeColor: "#be123c", logo: "x", logoScale: 0.22 },
    { ...DEFAULT_DESIGN, moduleStyle: "dots", eyeFrame: "circle", eyeBall: "circle", gradient: "radial", fg2: "#0f766e" },
    { ...DEFAULT_DESIGN, moduleStyle: "bars", transparent: true },
  ];
  for (const design of designs) {
    const logo = design.logo ? sampleLogo() : null;
    const label = `${design.moduleStyle}/${design.gradient}${logo ? "/logo" : ""}`;
    const pdf = await toPdf(qr, design, { sizeMm: 50, logo });
    assert.match(new TextDecoder("latin1").decode(pdf.subarray(0, 8)), /^%PDF-1\.4/);
    scans(ppmToRgba(await ghostscript(pdf, "in.pdf")), `PDF ${label}`);
    const eps = toEps(qr, design, { sizeMm: 50, logo });
    scans(ppmToRgba(await ghostscript(eps, "in.eps", ["-dEPSCrop"])), `EPS ${label}`);
  }
});

test("PDF page size follows the print size", async () => {
  const qr = (await wasmEncoder())(PAYLOAD, {});
  const text = new TextDecoder("latin1").decode(await toPdf(qr, DEFAULT_DESIGN, { sizeMm: 25.4 }));
  assert.match(text, /\/MediaBox \[0 0 72 72\]/);
  // The xref offsets point at the objects.
  const pdf = text;
  const start = Number(/startxref\n(\d+)/.exec(pdf)[1]);
  assert.ok(pdf.startsWith("xref", start));
  const offsets = [...pdf.slice(start).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
  offsets.forEach((o, i) => assert.ok(pdf.startsWith(`${i + 1} 0 obj`, o), `object ${i + 1}`));
});

test("raster formats come out of qrimage.wasm with the right signature", async () => {
  const encode = await loadWasmImageEncoder(fs.readFileSync(path.join(root, "src", "wasm", "qrimage.wasm")));
  const qr = (await wasmEncoder())(PAYLOAD, {});
  const img = rasterize(qr.modules, qr.size, { scale: 6 });
  const magic = { png: "89504e47", jpeg: "ffd8ff", webp: "52494646", gif: "47494638", bmp: "424d", tiff: "49492a00", ico: "00000100" };
  for (const f of FORMATS.filter((x) => x.kind === "raster")) {
    const bytes = encode(new Uint8Array(img.data.buffer), img.width, img.height, f.id, 90, 0xffffff);
    const hex = Buffer.from(bytes.subarray(0, 4)).toString("hex");
    assert.ok(hex.startsWith(magic[f.id]), `${f.id}: ${hex}`);
  }
  assert.throws(() => encode(new Uint8Array(8), 4, 4, "png"), /expected 4×4/);
});
