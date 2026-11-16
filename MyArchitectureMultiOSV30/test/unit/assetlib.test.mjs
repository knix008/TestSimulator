// Unit tests for the asset library download (src/io/assetlib.js): what it is
// made of, the plan from Poly Haven's API, progress, files already there are
// skipped, a failed file is reported (not retried), Reinstall downloads all,
// a short download is refused. A fake Poly Haven and a fake store stand in for
// the network and the disk.
// Run: node --test test/unit/assetlib.test.mjs

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { wantedFiles, libraryStatus, planDownloads, installLibrary, megabytes, API, MAP_KEYS } from "../../src/io/assetlib.js";
import { TEXTURE_SETS } from "../../src/lib/libraryindex.js";
import { ENVIRONMENTS } from "../../src/view3d/environments.js";

/** A fake Poly Haven: the API lists every file; the CDN sends `size` bytes (or fails for `broken` names). */
function fakeHaven({ broken = new Set(), apiDown = new Set(), short = new Set() } = {}) {
  const calls = { api: 0, files: 0 };
  const sizeOf = (url) => 100 + (url.length % 50);
  const fetch = async (url) => {
    if (url.startsWith(`${API}/files/`)) {
      calls.api++;
      const id = url.slice(`${API}/files/`.length);
      if (apiDown.has(id)) return { ok: false, status: 503 };
      const meta = {};
      for (const key of Object.values(MAP_KEYS)) meta[key] = { "1k": { jpg: { url: `https://dl/${id}_${key}_1k.jpg`, size: sizeOf(`https://dl/${id}_${key}_1k.jpg`) } } };
      meta.hdri = { "1k": { hdr: { url: `https://dl/${id}_1k.hdr`, size: sizeOf(`https://dl/${id}_1k.hdr`) } }, "2k": { hdr: { url: `https://dl/${id}_2k.hdr`, size: sizeOf(`https://dl/${id}_2k.hdr`) } } };
      return { ok: true, json: async () => meta };
    }
    calls.files++;
    if ([...broken].some((b) => url.includes(b))) return { ok: false, status: 404 };
    const n = sizeOf(url) - ([...short].some((b) => url.includes(b)) ? 10 : 0);
    return { ok: true, arrayBuffer: async () => new Uint8Array(n).fill(7).buffer };
  };
  return { fetch, calls };
}
function fakeStore(initial = []) {
  const files = new Map(initial.map((r) => [r, new Uint8Array(1)]));
  return { files, list: async () => [...files.keys()], write: async (rel, bytes) => { files.set(rel, bytes); }, clear: async () => files.clear() };
}

describe("asset library download", () => {
  test("made of every texture set's maps (1k JPEG) and every HDRI (1k, 2k for the main ones)", () => {
    const w = wantedFiles();
    const maps = Object.values(TEXTURE_SETS).reduce((s, i) => s + i.maps.length, 0);
    const hdr = ENVIRONMENTS.length + ENVIRONMENTS.filter((e) => e.file2k).length;
    assert.equal(w.length, maps + hdr);
    assert.equal(new Set(w.map((x) => x.rel)).size, w.length, "each file once");
    assert.ok(w.every((x) => /^(textures\/[a-z0-9_]+\/(diff|nor|rough|ao)\.jpg|hdri\/[a-z0-9_]+\.hdr)$/.test(x.rel)), "safe library paths");
    const st = libraryStatus([w[0].rel, "other/file"]);
    assert.deepEqual([st.total, st.installed, st.missing.length, st.complete], [w.length, 1, w.length - 1, false]);
    assert.equal(libraryStatus(w.map((x) => x.rel)).complete, true);
    assert.equal(megabytes(150 * 1048576), "150 MB");
  });

  test("the plan: one API request per asset, a file the API lacks is reported", async () => {
    const files = wantedFiles().slice(0, 6);
    const ids = new Set(files.map((f) => f.id));
    let calls = 0;
    const { plan, failed } = await planDownloads(async (url) => { calls++; const id = url.split("/").pop(); return id === files[0].id ? { Diffuse: {} } : { Diffuse: { "1k": { jpg: { url: `u/${id}`, size: 5 } } }, nor_gl: { "1k": { jpg: { url: "n", size: 5 } } }, Rough: { "1k": { jpg: { url: "r", size: 5 } } }, AO: { "1k": { jpg: { url: "a", size: 5 } } } }; }, files);
    assert.equal(calls, ids.size);
    assert.ok(failed.every((f) => f.rel.includes(files[0].id)) && failed.length >= 1);
    assert.equal(plan.length + failed.length, files.length);
  });

  test("first install: everything downloaded with progress; a second run has nothing to do", async () => {
    const haven = fakeHaven();
    const store = fakeStore();
    const seen = [];
    const res = await installLibrary({ store, fetch: haven.fetch, onProgress: (p) => seen.push(p) });
    const n = wantedFiles().length;
    assert.equal(res.ok, true);
    assert.equal(res.downloaded, n);
    assert.equal(store.files.size, n);
    assert.equal(seen[0].done, 0);
    assert.equal(seen.at(-1).done, n);
    assert.equal(seen.at(-1).bytes, seen.at(-1).totalBytes, "the bar reaches its end");
    assert.ok(seen.every((p, i) => i === 0 || p.done >= seen[i - 1].done), "progress only goes forward");
    const again = await installLibrary({ store, fetch: haven.fetch });
    assert.deepEqual([again.ok, again.downloaded], [true, 0]);
  });

  test("only what is missing is downloaded; Reinstall (force) downloads all", async () => {
    const all = wantedFiles().map((w) => w.rel);
    const store = fakeStore(all.slice(5));
    const haven = fakeHaven();
    const res = await installLibrary({ store, fetch: haven.fetch });
    assert.equal(res.downloaded, 5);
    const forced = await installLibrary({ store, fetch: haven.fetch, force: true });
    assert.equal(forced.downloaded, all.length);
  });

  test("failures: reported (file and reason), not retried; the rest is still installed; a short file is refused", async () => {
    const victim = wantedFiles().find((w) => w.kind === "texture");
    const hdr = ENVIRONMENTS[0].id;
    const haven = fakeHaven({ broken: new Set([`${victim.id}_Diffuse`]), apiDown: new Set([hdr]), short: new Set([`${ENVIRONMENTS[1].id}_1k`]) });
    const store = fakeStore();
    const res = await installLibrary({ store, fetch: haven.fetch });
    assert.equal(res.ok, false);
    const bad = res.failed.map((f) => f.rel);
    assert.ok(bad.includes(victim.rel), "the 404 file");
    assert.ok(res.failed.find((f) => f.rel === victim.rel).error.includes("404"));
    assert.ok(bad.some((r) => r.includes(hdr)) && res.failed.find((f) => f.rel.includes(hdr)).error.includes("Poly Haven"), "the asset the API did not answer for");
    assert.ok(res.failed.some((f) => f.rel.includes(ENVIRONMENTS[1].id) && /incomplete/.test(f.error)), "a short download");
    assert.ok(!store.files.has(victim.rel), "a failed file is not stored");
    assert.equal(store.files.size, wantedFiles().length - res.failed.length, "everything else is there");
    // Retry (the user's choice) fetches just the missing ones.
    const fixed = await installLibrary({ store, fetch: fakeHaven().fetch });
    assert.deepEqual([fixed.ok, fixed.downloaded], [true, res.failed.length]);
  });
});
