// `npm run samples`: builds samples/ — pictures to convert and 3D files in
// every format the app saves, all made here from three.js primitives
// (scripts/sample-scenes.js), plus two conversions done by the engine.
//
//   samples/images/*.png        transparent "photos" of the objects (1024 px);
//                               the example pictures in PHOTOS (.webp/.png)
//                               come from `npm run samples:photos` instead
//   samples/models/*            robot.glb, shapes.gltf, mug.obj (+ .mtl),
//                               pawn.stl, tree.ply, toy-car.usdz
//   samples/results/*.glb       mug converted with Stable Fast 3D,
//                               robot converted with TripoSR
//   samples/index.json          what the app lists (start screen, tutorial)
//
// Needs the dev server (`npm run dev`); the results also need a ready engine
// (ENGINE_URL, default http://127.0.0.1:57660) and are skipped without one.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, hasBrowser } from '../test/e2e/cdp.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(root, 'samples');
const APP = process.env.APP_URL || 'http://localhost:5196/';
const ENGINE = process.env.ENGINE_URL || 'http://127.0.0.1:57660';

const IMAGES = ['robot', 'mug', 'pawn', 'tree', 'toy-car'];
const MODELS = [
  { scene: 'robot', format: 'glb' },
  { scene: 'shapes', format: 'gltf' },
  { scene: 'mug', format: 'obj' },
  { scene: 'pawn', format: 'stl' },
  { scene: 'tree', format: 'ply' },
  { scene: 'toy-car', format: 'usdz' },
];
// Pictures to convert are at least this many pixels on a side.
export const PHOTO_SIZE = 1024;

// Example pictures image-to-3D models are shown with: not drawn here but
// fetched from the repositories at a fixed commit (`file`) by
// `npm run samples:photos` (scripts/fetch-sample-photos.mjs) and kept byte
// for byte — only pictures whose original is PHOTO_SIZE or larger are
// listed (nothing is scaled up). Saved as images/<name>.<file's extension>.
// `source` is credited in samples/README.md and NOTICE.md.
export const PHOTO_SOURCES = {
  'TRELLIS.2': 'https://raw.githubusercontent.com/microsoft/TRELLIS.2/75fbf0183001ed9876c8dbb35de6b68552ee08bd/assets/example_image/',
  TripoSR: 'https://raw.githubusercontent.com/VAST-AI-Research/TripoSR/107cefdc244c39106fa830359024f6a2f1c78871/examples/',
};
const T2 = 'TRELLIS.2';
export const PHOTOS = [
  { name: 'scifi-tank', ko: 'SF 탱크', en: 'Sci-fi tank', source: T2, file: '0f168a4b1b6e96c72e9627c97a212c27a4572250ff58e25703b9d0c2bc74191a.webp' },
  { name: 'palm-tree', ko: '야자수', en: 'Palm tree', source: T2, file: '26717a7dad644a5cf7554e8e6d06cf82d3dd9bbae31620b36cc7eb38b8de7ac9.webp' },
  { name: 'knight-helmet', ko: '기사 투구', en: 'Knight helmet', source: T2, file: '290af2dd390c95db88a35b8062fdd2ac1a9c28edc6533bc6a26ab2c83c523c61.webp' },
  { name: 'scrap-robot', ko: '고철 로봇', en: 'Scrap robot', source: T2, file: '3903b87907a6b4947006e6fc7c0c64f40cd98932a02bf0ecf7d6dfae776f3a38.webp' },
  { name: 'steampunk-boy', ko: '스팀펑크 소년', en: 'Steampunk boy', source: T2, file: '454e7d8a30486c0635369936e7bec5677b78ae5f436d0e46af0d533738be859f.webp' },
  { name: 'hill-town', ko: '언덕 마을', en: 'Hill town', source: T2, file: '4bc7abe209c8673dd3766ee4fad14d40acbed02d118e7629f645c60fd77313f1.webp' },
  { name: 'angel-statue', ko: '천사 석상', en: 'Angel statue', source: T2, file: '52284bf45134c59a94be150a5b18b9cc3619ada4b30ded8d8d0288383b8c016f.webp' },
  { name: 'pineapple', ko: '파인애플', en: 'Pineapple', source: T2, file: '5a020584b95cf3db3b6420e9b09fb93e7c0f4046e61076e5b4c65c63dc1f5837.webp' },
  { name: 'backpack', ko: '등산 배낭', en: 'Hiking backpack', source: T2, file: '5a6c81d3b2afca4323e4b8b379e2cf06d18371a57fc8c5dc24b57e60e3216690.webp' },
  { name: 'alchemy-room', ko: '연금술사의 방', en: "Alchemist's room", source: T2, file: '799ab13a23fe319a6876b8bf48007d0374d514f5e7aa31210e9b2cecfbace082.webp' },
  { name: 'wanderer', ko: '두건 쓴 방랑자', en: 'Hooded wanderer', source: T2, file: '7b540da337f576ffce2adc36c7459b9bbbfd845ab2160a6abbe986f1f906f6cd.webp' },
  { name: 'goblin-bust', ko: '고블린 흉상', en: 'Goblin bust', source: T2, file: '7bd0521d20ee4805d1462a0ffb7d9aacc15180c2b741c9ac42a0d82ad3d340cb.webp' },
  { name: 'garden-trellis', ko: '덩굴 시렁', en: 'Garden trellis', source: T2, file: '7d6f4da4eafcc60243daf6ed210853df394a8bad7e701cadf551e21abcc77869.webp' },
  { name: 'mermaid', ko: '인어', en: 'Mermaid', source: T2, file: '8ce83f6a28910e755902de10918672e77dd23476f43f0f1521c48667de6cea84.webp' },
  { name: 'rusty-robot', ko: '녹슨 로봇', en: 'Rusty robot', source: T2, file: '8e12cf0977c0476396e7112f04b73d4d73569421173fcb553213d45030bddec3.webp' },
  { name: 'walking-tank', ko: '보행 전차', en: 'Walking tank', source: T2, file: '95db3c13622788ec311ae4dfa24dd88732c66ca5e340a0bf3465d2a528204037.webp' },
  { name: 'heavy-mech', ko: '중장갑 메카', en: 'Heavy mech', source: T2, file: 'a3d0c28c7d9c6f23adb941c4def2523572c903a94469abcaa7dd1398d28af8f1.webp' },
  { name: 'fairy-island', ko: '동화 마을 섬', en: 'Fairy-tale island', source: T2, file: 'a63d2595e10229067b19cb167fe2bdc152dabfd8b62ae45fc1655a4cf66509bc.webp' },
  { name: 'hourglass', ko: '모래시계', en: 'Hourglass', source: T2, file: 'ab3bb3e183991253ae66c06d44dc6105f3c113a1a1f819ab57a93c6f60b0d32b.webp' },
  { name: 'princess-doll', ko: '공주 인형', en: 'Princess doll', source: T2, file: 'be7deb26f4fdd2080d4288668af4c39e526564282c579559ff8a4126ca4ed6c1.webp' },
  { name: 'windmill', ko: '풍차', en: 'Windmill', source: T2, file: 'c2125d086c2529638841f38918ae1defbf33e6796d827253885b4c51e601034f.webp' },
  { name: 'dragon-armour', ko: '용 갑옷', en: 'Dragon armour', source: T2, file: 'cd3c309f17eee5ad6afe4e001765893ade20b653f611365c93d158286b4cee96.webp' },
  { name: 'orc-warrior', ko: '오크 전사', en: 'Orc warrior', source: T2, file: 'cdf996a6cc218918eeb90209891ce306a230e6d9cca2a3d9bbb37c6d7b6bd318.webp' },
  { name: 'rainbow-wings', ko: '무지개 날개', en: 'Rainbow wings', source: T2, file: 'd39c2bd426456bd686de33f924524d18eb47343a5f080826aa3cb8e77de5147b.webp' },
  { name: 'covered-wagon', ko: '포장마차', en: 'Covered wagon', source: T2, file: 'd64c94dffdadf82d46004d11412b5a3b2a17f1b4ddb428477a7ba38652adf973.webp' },
  { name: 'shield', ko: '방패', en: 'Shield', source: T2, file: 'e3c57169ce3d5ce10b3c10acef20b81ca774b54a17aabe74e8aca320c7b07b55.webp' },
  { name: 'courier-bike', ko: '배달 오토바이', en: 'Courier motorbike', source: T2, file: 'e4d6b2f3a18c3e0f5146a5b40cda6c95d7f69372b2e741c023e5ec9661deda2b.webp' },
  { name: 'gargoyle', ko: '가고일', en: 'Gargoyle', source: T2, file: 'ee8ecf658fde9c58830c021b2e30d0d5e7e492ef52febe7192a6c74fbf1b0472.webp' },
  { name: 'moss-golem', ko: '이끼 골렘', en: 'Mossy golem', source: T2, file: 'f351569ddc61116da4a7b929bccdab144d011f56b9603e6e72abea05236160f4.webp' },
  { name: 'throne-statue', ko: '왕좌 석상', en: 'Throne statue', source: T2, file: 'f5332118a0cda9cd13fe13d4be2b00437e702d1f9af51ebb6b75219a572a6ce9.webp' },
  { name: 'factory-town', ko: '공장 마을', en: 'Factory town', source: T2, file: 'f8920788b704531f7a7e875afd7c5c423d62e0a987e9495c63893c2cb4d2b5dc.webp' },
  { name: 'black-robot', ko: '검은 로봇', en: 'Black robot', source: T2, file: 'f8a7eafe26a4f3ebd26a9e7d0289e4a40b5a93e9234e94ec3e1071c352acc65a.webp' },
  { name: 'steam-machine', ko: '스팀펑크 기계', en: 'Steampunk machine', source: T2, file: 'T.png' },
  { name: 'fox', ko: '폴리곤 여우 (회색 배경)', en: 'Low-poly fox (grey background)', source: 'TripoSR', file: 'poly_fox.png' },
];

// samples/images/<name>.<ext> of a PHOTOS entry.
export const photoPath = (p) => `images/${p.name}${path.extname(p.file).toLowerCase()}`;

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
        return renderPhoto(SCENES[${JSON.stringify(name)}](), ${PHOTO_SIZE});
      })()`);
      write(`images/${name}.png`, fromB64(url.split(',')[1]));
      index.images.push({ file: `images/${name}.png`, ko: NAMES[name][0], en: NAMES[name][1] });
    }
    for (const p of PHOTOS) {
      const file = photoPath(p);
      if (fs.existsSync(path.join(OUT, file))) index.images.push({ file, ko: p.ko, en: p.en, source: p.source });
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

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => { console.error(`[samples] ${err.message}`); process.exit(1); });
}
