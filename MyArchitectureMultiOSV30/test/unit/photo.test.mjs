// Unit tests for the photo render (src/view3d/photo.js): the vendored path
// tracer (src/vendor/pathtracer) loads against this app's three.js and finds
// every name it imports; the sky it lights the scene with is an
// equirectangular gradient (bright horizon, blue above, darker ground).
// The render itself needs WebGL and is checked in the real app.
// Run: node --test test/unit/photo.test.mjs

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as THREE from "../../src/vendor/three/three.module.js";
import { skyTexture, PHOTO_QUALITY } from "../../src/view3d/photo.js";

const vendor = path.resolve(import.meta.dirname, "..", "..", "src", "vendor", "pathtracer");

describe("photo render", () => {
  test("the vendored path tracer imports only this app's three.js, and finds every name in it", async () => {
    for (const f of ["three-gpu-pathtracer.module.js", "three-mesh-bvh.module.js", "Pass.js"]) {
      const s = fs.readFileSync(path.join(vendor, f), "utf8");
      const specs = [...s.matchAll(/^(?:import|export)[^;]*?from\s*'([^']+)'/gm)].map((m) => m[1]);
      assert.ok(specs.length > 0, f);
      for (const sp of specs) assert.ok(sp.startsWith("./") || sp.startsWith("../three/"), `${f} imports ${sp}`);
      const m = s.match(/import \{([^}]*)\}\s*from '\.\.\/three\/three\.module\.js'/);
      const names = m[1].split(",").map((x) => x.trim()).filter(Boolean);
      assert.deepEqual(names.filter((n) => !(n in THREE)), [], `${f}: names missing from three r${THREE.REVISION}`);
    }
    const P = await import("../../src/vendor/pathtracer/three-gpu-pathtracer.module.js");
    assert.equal(typeof P.WebGLPathTracer, "function");
    for (const f of ["LICENSE-three-gpu-pathtracer", "LICENSE-three-mesh-bvh"]) assert.ok(fs.existsSync(path.join(vendor, f)), f);
  });

  test("the sky: equirectangular, float, blue above, bright horizon, darker ground; night is dark", () => {
    const sky = skyTexture();
    assert.equal(sky.mapping, THREE.EquirectangularReflectionMapping);
    assert.equal(sky.type, THREE.FloatType);
    const { data, width, height } = sky.image;
    const at = (row) => { const i = row * width * 4; return [data[i], data[i + 1], data[i + 2]]; };
    const top = at(0), horizon = at(Math.floor(height / 2) - 1), ground = at(height - 1);
    assert.ok(top[2] > top[0], "blue above");
    assert.ok(horizon[0] + horizon[1] + horizon[2] > top[0] + top[1] + top[2], "the horizon is the brightest");
    assert.ok(ground[0] + ground[1] + ground[2] < (horizon[0] + horizon[1] + horizon[2]) / 2, "the ground is darker");
    const night = skyTexture({ night: true }).image.data;
    assert.ok(night.reduce((m, v, i) => (i % 4 === 3 ? m : Math.max(m, v)), 0) < 0.3, "night sky");
    sky.dispose();
  });

  test("quality presets grow", () => {
    assert.ok(PHOTO_QUALITY.draft < PHOTO_QUALITY.good && PHOTO_QUALITY.good < PHOTO_QUALITY.best);
  });
});
