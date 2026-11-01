#!/usr/bin/env node
// `npm run samples`: builds samples/ — pictures to convert and 3D files in
// every format the app saves, all made here from three.js primitives
// (scripts/sample-scenes.js), plus two conversions done by the engine.
//
//   samples/images/*.png        transparent "photos" of the objects
//   samples/models/*            robot.glb, shapes.gltf, mug.obj (+ .mtl),
//                               pawn.stl, tree.ply, toy-car.usdz
//   samples/results/*.glb       mug converted with Stable Fast 3D,
//                               robot converted with TripoSR
//   samples/index.json          what the app lists (start screen, tutorial)
//
// Needs the dev server (`npm run dev`); the results also need a ready engine
// (ENGINE_URL, default http://127.0.0.1:57650) and are skipped without one.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, hasBrowser } from '../test/e2e/cdp.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(root, 'samples');
const APP = process.env.APP_URL || 'http://localhost:5195/';
const ENGINE = process.env.ENGINE_URL || 'http://127.0.0.1:57650';

const IMAGES = ['robot', 'mug', 'pawn', 'tree', 'toy-car'];
const MODELS = [
  { scene: 'robot', format: 'glb' },
  { scene: 'shapes', format: 'gltf' },
  { scene: 'mug', format: 'obj' },
  { scene: 'pawn', format: 'stl' },
  { scene: 'tree', format: 'ply' },
  { scene: 'toy-car', format: 'usdz' },
];
const RESULTS = [
  { image: 'mug', model: 'sf3d', name: 'mug-sf3d.glb' },
  { image: 'robot', model: 'triposr', name: 'robot-triposr.glb' },
];

const NAMES = {
  robot: ['로봇', 'Robot'], mug: ['머그컵', 'Mug'], pawn: ['체스 폰', 'Chess pawn'], tree: ['나무', 'Tree'],
  'toy-car': ['장난감 자동차', 'Toy car'], shapes: ['도형 모음', 'Shapes'],
};

const write = (rel, data) => {
  const p = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, data);
  console.log(`[samples] ${rel} (${(fs.statSync(p).size / 1024).toFixed(0)} KB)`);
};
const fromB64 = (b64) => Buffer.from(b64, 'base64');

// An MTL for an OBJ written by OBJExporter (which writes no materials):
// one material per mesh, with the mesh's colour.
function mtlFor(colors) {
  return colors.map((c, i) => `newmtl m${i}\nKd ${c.map((n) => n.toFixed(4)).join(' ')}\nKa 0 0 0\nKs 0.1 0.1 0.1\nNs 30\n`).join('\n');
}

async function convert(image, model) {
  const data = fs.readFileSync(path.join(OUT, 'images', `${image}.png`));
  const r = await fetch(`${ENGINE}/api/jobs?model=${model}&name=${image}.png`, { method: 'POST', body: data });
  const { id } = await r.json();
  for (;;) {
    await new Promise((res) => { setTimeout(res, 1000); });
    const j = await (await fetch(`${ENGINE}/api/jobs/${id}`)).json();
    if (j.state === 'done') return Buffer.from(await (await fetch(`${ENGINE}/api/jobs/${id}/result.glb`)).arrayBuffer());
    if (j.state === 'failed' || j.state === 'cancelled') throw new Error(`${model}: ${j.error || j.state}`);
  }
}

async function main() {
  if (!hasBrowser()) throw new Error('No Edge / Chrome found (set CHROME_PATH).');
  const b = await launch({ port: 9591 });
  const index = { images: [], models: [], results: [] };
  try {
    await b.goto(APP);
    for (const name of IMAGES) {
      const url = await b.eval(`(async () => {
        const { SCENES, renderPhoto } = await import('/scripts/sample-scenes.js');
        return renderPhoto(SCENES[${JSON.stringify(name)}]());
      })()`);
      write(`images/${name}.png`, fromB64(url.split(',')[1]));
      index.images.push({ file: `images/${name}.png`, ko: NAMES[name][0], en: NAMES[name][1] });
    }
    for (const { scene, format } of MODELS) {
      const res = await b.eval(`(async () => {
        const { SCENES } = await import('/scripts/sample-scenes.js');
        const f = await import('/src/lib/formats.js');
        const obj = SCENES[${JSON.stringify(scene)}]();
        obj.updateMatrixWorld(true);
        let bytes = await f.exportModel(obj, ${JSON.stringify(format)});
        let colors = [];
        if (${JSON.stringify(format)} === 'obj') {
          // OBJExporter writes plain geometry; add mtllib / usemtl per mesh.
          let text = new TextDecoder().decode(bytes);
          let i = 0;
          obj.traverse((o) => { if (o.isMesh) colors.push(o.material.color.toArray()); });
          text = 'mtllib ${scene}.mtl\\n' + text.replace(/^o (.*)$/gm, (m) => m + '\\nusemtl m' + (i++));
          bytes = new TextEncoder().encode(text);
        }
        let s = ''; for (let k = 0; k < bytes.length; k += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(k, k + 0x8000));
        return { b64: btoa(s), colors };
      })()`);
      const file = `models/${scene}.${format}`;
      write(file, fromB64(res.b64));
      const entry = { file, ko: NAMES[scene][0], en: NAMES[scene][1], format };
      if (format === 'obj') {
        write(`models/${scene}.mtl`, mtlFor(res.colors));
        entry.files = [`models/${scene}.mtl`];
      }
      index.models.push(entry);
    }
  } finally {
    b.close();
  }

  let engineUp = false;
  try { engineUp = (await (await fetch(`${ENGINE}/api/health`)).json()).state === 'ready'; } catch { /* no engine */ }
  if (engineUp) {
    for (const r of RESULTS) {
      try {
        write(`results/${r.name}`, await convert(r.image, r.model));
        index.results.push({ file: `results/${r.name}`, ko: `${NAMES[r.image][0]} (${r.model === 'sf3d' ? 'Stable Fast 3D' : 'TripoSR'})`, en: `${NAMES[r.image][1]} (${r.model === 'sf3d' ? 'Stable Fast 3D' : 'TripoSR'})`, format: 'glb' });
      } catch (err) {
        console.log(`[samples] ${r.name} skipped: ${err.message}`);
      }
    }
  } else {
    console.log(`[samples] No ready engine at ${ENGINE}: conversion results kept as they are.`);
    const old = (() => { try { return JSON.parse(fs.readFileSync(path.join(OUT, 'index.json'), 'utf8')); } catch { return null; } })();
    index.results = (old?.results || []).filter((r) => fs.existsSync(path.join(OUT, r.file)));
  }
  write('index.json', `${JSON.stringify(index, null, 2)}\n`);
}

main().catch((err) => { console.error(`[samples] ${err.message}`); process.exit(1); });
