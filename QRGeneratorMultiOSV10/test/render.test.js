import assert from "node:assert/strict";
import test from "node:test";
import { ECC_RECOVERY } from "../src/js/encoder.js";
import { alignmentCenters, buildPaths, clearedModules, contrastRatio, DEFAULT_DESIGN, designWarnings, EYE_BALL_STYLES, EYE_FRAME_STYLES, MODULE_STYLES, toSvg, visibleModules } from "../src/js/render.js";
import { decode, wasmEncoder } from "./support.js";

const LOGO = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

test("paths cover every style and keep the quiet zone", async () => {
  const qr = (await wasmEncoder())("https://example.com", { ecc: "M" });
  for (const moduleStyle of MODULE_STYLES) {
    for (const eyeFrame of EYE_FRAME_STYLES) {
      for (const eyeBall of EYE_BALL_STYLES) {
        const p = buildPaths(qr, { moduleStyle, eyeFrame, eyeBall, margin: 4 });
        assert.equal(p.total, qr.size + 8);
        assert.ok(p.body.length > 100, moduleStyle);
        assert.ok(!/NaN|undefined/.test(p.body + p.eyeFrame + p.eyeBall));
        assert.equal((p.eyeFrame.match(/z/g) || []).length, 6, eyeFrame); // 3 eyes × outer+inner
        assert.equal((p.eyeBall.match(/z/g) || []).length, 3, eyeBall);
      }
    }
  }
});

test("square modules merge into one run per row segment", async () => {
  const qr = (await wasmEncoder())("12345", { ecc: "L" });
  const p = buildPaths(qr, { moduleStyle: "square", margin: 0 });
  // Each sub-path is a rectangle of height 1 starting on a dark module.
  for (const [, x, y, w] of p.body.matchAll(/M(\d+) (\d+)h(\d+)v1/g)) {
    for (let i = 0; i < Number(w); i += 1) assert.equal(qr.modules[Number(y) * qr.size + Number(x) + i], 1);
  }
});

test("SVG is a self-contained document", async () => {
  const qr = (await wasmEncoder())("svg test", {});
  const svg = toSvg(qr, { ...DEFAULT_DESIGN, gradient: "radial", logo: LOGO }, 512);
  assert.match(svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 \d+ \d+" width="512" height="512"/);
  assert.match(svg, /<radialGradient id="qrfill"/);
  assert.match(svg, /<image href="data:image\/png;base64,/);
  assert.ok(svg.endsWith("</svg>"));
  assert.ok(!toSvg(qr, { transparent: true }).includes("<rect"));
  assert.ok(!toSvg(qr, { logo: "javascript:alert(1)" }).includes("<image"), "only data: images are embedded");
});

test("a 22% logo with cleared modules still scans at H and Q", async () => {
  const encode = await wasmEncoder();
  for (const ecc of ["H", "Q"]) {
    const qr = encode("https://github.com/knix008/TestSimulator", { ecc, boostEcc: false });
    const design = { ...DEFAULT_DESIGN, logo: LOGO, logoScale: 0.22, logoClear: true };
    const hidden = clearedModules(qr.size, design).reduce((a, b) => a + b, 0);
    assert.ok(hidden > 20, `logo hides ${hidden} modules`);
    const read = decode(visibleModules(qr, design), qr.size);
    assert.equal(read?.text, "https://github.com/knix008/TestSimulator", `ecc ${ecc}`);
    assert.deepEqual(designWarnings(qr, design, ECC_RECOVERY[ecc]), []);
  }
});

test("warnings catch low contrast, inverted colours, thin margins and oversized logos", async () => {
  const qr = (await wasmEncoder())("warn", { ecc: "L", boostEcc: false });
  assert.ok(contrastRatio("#000000", "#ffffff") > 20);
  assert.deepEqual(designWarnings(qr, DEFAULT_DESIGN, 7), []);
  assert.ok(designWarnings(qr, { fg: "#bbbbbb", bg: "#ffffff" }, 7).includes("warn.contrast"));
  assert.ok(designWarnings(qr, { fg: "#ffffff", bg: "#000000" }, 7).includes("warn.inverted"));
  assert.ok(designWarnings(qr, { margin: 1 }, 7).includes("warn.margin"));
  assert.ok(designWarnings(qr, { logo: LOGO, logoScale: 0.35 }, 7).includes("warn.logo"));
});

test("alignment centres match the patterns the Rust encoder draws", async () => {
  const encode = await wasmEncoder();
  assert.deepEqual(alignmentCenters(21), []);
  for (let version = 2; version <= 40; version += 1) {
    const qr = encode("a", { version, ecc: "L", boostEcc: false });
    const centers = alignmentCenters(qr.size);
    assert.equal(centers.length, version < 7 ? 1 : (Math.floor(version / 7) + 2) ** 2 - 3, `v${version}`);
    for (const [cx, cy] of centers) {
      for (let dy = -2; dy <= 2; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          const ring = Math.max(Math.abs(dx), Math.abs(dy));
          assert.equal(qr.modules[(cy + dy) * qr.size + cx + dx], ring === 1 ? 0 : 1, `v${version} (${cx},${cy})`);
        }
      }
    }
  }
});
