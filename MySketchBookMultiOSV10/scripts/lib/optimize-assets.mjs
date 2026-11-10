// Smaller asset library files, the same look (scripts/fetch-assets.mjs uses this after each download,
// scripts/optimize-assets.mjs on a library fetched before):
//   models   — the textures inside each GLB as WebP (EXT_texture_webp) instead of JPEG/PNG, and the geometry quantised
//              and meshopt-compressed (EXT_meshopt_compression; the app's GLTFLoader has the decoder). A model is
//              rewritten only when the result is smaller and its bounds stay the same.
//   textures — the material sets' maps as WebP (index.json records `ext: 'webp'`; library/assets.js reads it).
// Lossy WebP, at qualities chosen per map: colour 82, normals 92 (their small angles show as lighting), the rest 80.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { Logger, NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt, prune, textureCompress } from '@gltf-transform/functions';

export const QUALITY = { diff: 82, nor: 92, rough: 80, ao: 80, arm: 80, disp: 80, other: 80 };

let ioPromise = null;
/** A glTF reader/writer with every extension and the meshopt codec. */
export async function gltfIO() {
  ioPromise ??= (async () => {
    await MeshoptDecoder.ready; await MeshoptEncoder.ready;
    return new NodeIO().setLogger(new Logger(Logger.Verbosity.WARN)).registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
  })();
  return ioPromise;
}

/** Whether a GLB file has been optimised already (meshopt + WebP). */
export function isOptimisedGlb(bytes) {
  const len = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + len).toString('utf8'));
  const used = json.extensionsUsed ?? [];
  return used.includes('EXT_meshopt_compression') && (!(json.images?.length) || used.includes('EXT_texture_webp'));
}

/**
 * Optimises one GLB in place. Returns { before, after, kept } (bytes; `kept`: the original stayed, because the result
 * was not smaller or its bounds moved).
 */
export async function optimiseGlb(file) {
  const before = fs.statSync(file).size;
  const original = fs.readFileSync(file);
  if (isOptimisedGlb(original)) return { before, after: before, kept: true, skipped: true };
  const io = await gltfIO();
  const doc = await io.readBinary(new Uint8Array(original));
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  const bounds0 = getBounds(scene);
  // WebP: the normal maps first (at a higher quality), then every other JPEG / PNG (a WebP is never encoded twice).
  const source = /^image\/(jpeg|png)$/;
  await doc.transform(textureCompress({ encoder: sharp, targetFormat: 'webp', quality: QUALITY.nor, slots: /normalTexture/, formats: source }));
  await doc.transform(textureCompress({ encoder: sharp, targetFormat: 'webp', quality: QUALITY.diff, formats: source }));
  await doc.transform(prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const bytes = Buffer.from(await io.writeBinary(doc));
  // The same place and size (quantisation moves vertices by far less than a millimetre).
  const check = await io.readBinary(new Uint8Array(bytes));
  const b1 = getBounds(check.getRoot().getDefaultScene() ?? check.getRoot().listScenes()[0]);
  const moved = Math.max(...[0, 1, 2].flatMap((i) => [Math.abs(b1.min[i] - bounds0.min[i]), Math.abs(b1.max[i] - bounds0.max[i])]));
  if (bytes.length >= before || moved > 0.002) return { before, after: before, kept: true, moved };
  fs.writeFileSync(`${file}.part`, bytes);
  fs.renameSync(`${file}.part`, file);
  return { before, after: bytes.length, kept: false, moved };
}

/** Converts a texture set's JPEG / PNG maps to WebP. Returns { before, after } (bytes) and the extension now used. */
export async function optimiseTextureSet(dir, maps) {
  let before = 0; let after = 0;
  for (const map of maps) {
    const src = ['jpg', 'jpeg', 'png'].map((ext) => path.join(dir, `${map}.${ext}`)).find((f) => fs.existsSync(f));
    const out = path.join(dir, `${map}.webp`);
    if (!src) { if (fs.existsSync(out)) { const s = fs.statSync(out).size; before += s; after += s; } continue; }
    const size = fs.statSync(src).size;
    const webp = await sharp(src).webp({ quality: QUALITY[map] ?? QUALITY.other, effort: 6, smartSubsample: true }).toBuffer();
    before += size;
    if (webp.length < size) { fs.writeFileSync(out, webp); fs.rmSync(src); after += webp.length; } else {
      // Keep the smaller file, but in one format for the whole set: WebP at a higher quality.
      const hq = await sharp(src).webp({ quality: 95, effort: 6 }).toBuffer();
      fs.writeFileSync(out, hq); fs.rmSync(src); after += hq.length;
    }
  }
  return { before, after, ext: 'webp' };
}
