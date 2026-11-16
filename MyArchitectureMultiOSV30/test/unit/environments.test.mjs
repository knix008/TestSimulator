// Unit tests for the HDRI environments (src/view3d/environments.js, the
// project style's environment / envBackground in src/core/skmodel.js): the
// eight places and their files in the downloaded library (src/io/assetlib.js
// fetches them), their credits, the HDR reader on a small Radiance picture, and
// the style keeping only valid choices.
// Run: node --test test/unit/environments.test.mjs

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { ENVIRONMENTS, environmentById } from "../../src/view3d/environments.js";
import { HDRI_SOURCES } from "../../src/lib/libraryindex.js";
import { wantedFiles } from "../../src/io/assetlib.js";
import { HDRLoader } from "../../src/vendor/three/addons/HDRLoader.js";
import { newProject, parseProject } from "../../src/core/project.js";
import { STYLE_DEFAULTS } from "../../src/core/skmodel.js";

/** A flat (not run-length coded) Radiance HDR picture of w × h, every pixel the same RGBE. */
function radiance(w, h, rgbe = [128, 64, 32, 129]) {
  const head = new TextEncoder().encode(`#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${h} +X ${w}\n`);
  const out = new Uint8Array(head.length + w * h * 4);
  out.set(head);
  for (let i = 0; i < w * h; i++) out.set(rgbe, head.length + i * 4);
  return out;
}

describe("HDRI environments", () => {
  test("eight places, ids unique, outdoor, indoor and studio, a sharper file for the main ones, all credited", () => {
    assert.equal(ENVIRONMENTS.length, 8);
    assert.equal(new Set(ENVIRONMENTS.map((e) => e.id)).size, 8);
    assert.deepEqual([...new Set(ENVIRONMENTS.map((e) => e.kind))].sort(), ["exterior", "interior", "studio"]);
    for (const e of ENVIRONMENTS) {
      assert.match(e.file, /^hdri\/[a-z0-9_]+\.hdr$/);
      if (e.main) assert.match(e.file2k, /^hdri\/[a-z0-9_]+_2k\.hdr$/);
      assert.ok(e.intensity > 0 && e.name);
      assert.ok(HDRI_SOURCES[e.id]?.author && HDRI_SOURCES[e.id]?.url, `${e.id} credited`);
    }
    assert.equal(environmentById("venice_sunset").name, "Sunset");
    assert.equal(environmentById("nowhere"), null);
  });

  test("every HDRI file is in the library's download list (1k, and 2k for the main ones)", () => {
    const want = wantedFiles().filter((w) => w.kind === "hdri");
    for (const e of ENVIRONMENTS) {
      assert.ok(want.some((w) => w.rel === e.file && w.res === "1k" && w.id === e.id), e.file);
      if (e.file2k) assert.ok(want.some((w) => w.rel === e.file2k && w.res === "2k"), e.file2k);
    }
    assert.equal(want.length, ENVIRONMENTS.length + ENVIRONMENTS.filter((e) => e.file2k).length);
  });

  test("the HDR reader decodes a Radiance picture (as the downloaded skies are)", () => {
    const bytes = radiance(16, 8);
    const data = new HDRLoader().parse(bytes.buffer);
    assert.deepEqual([data.width, data.height], [16, 8]);
    assert.ok(data.data.length >= 16 * 8 * 3);
  });

  test("the project's 3D style keeps a valid environment; the background needs one", () => {
    assert.equal(STYLE_DEFAULTS.environment, "");
    assert.equal(STYLE_DEFAULTS.envBackground, false);
    const load = (style3d) => parseProject(JSON.stringify({ ...newProject("E"), style3d })).style3d;
    assert.deepEqual([load({ environment: "venice_sunset", envBackground: true }).environment, load({ environment: "venice_sunset", envBackground: true }).envBackground], ["venice_sunset", true]);
    assert.equal(load({ environment: "../../etc", envBackground: true }).environment, "");
    assert.equal(load({ environment: "", envBackground: true }).envBackground, false);
    assert.equal(load({}).environment, "");
  });
});
