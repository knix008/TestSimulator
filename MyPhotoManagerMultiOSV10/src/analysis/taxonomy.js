// Image analysis → categories. Pure functions (no DOM, no models) so they are
// unit tested and run the same in the worker:
//   colorStats      brightness, saturation, colour areas, flat areas, edges of a
//                   small RGBA picture
//   imagenetIds     MobileNet's ImageNet class → scene / object categories
//   cocoIds         COCO-SSD's detected object → object category
//   classify        everything together → { cats: ['people/group', 'scene/beach',
//                   'object/animal/dog', …], people, … }
// Category ids are paths: a filter on 'object/animal' also finds 'object/animal/dog'.

/** The categories in the order the catalog pane lists them. */
export const CATEGORY_TREE = [
  ['people', ['portrait', 'one', 'two', 'group', 'crowd', 'none']],
  ['scene', ['beach', 'sea', 'mountain', 'nature', 'flower', 'sky', 'sunset', 'snow', 'city', 'indoor', 'night', 'food', 'document', 'bw']],
  ['object', [
    ['animal', ['dog', 'cat', 'bird', 'horse', 'fish', 'insect', 'farm', 'wild']],
    ['vehicle', ['car', 'bus', 'truck', 'motorcycle', 'bicycle', 'train', 'airplane', 'boat']],
    ['food', []], ['kitchen', []], ['furniture', []], ['plant', []], ['electronics', []], ['appliance', []],
    ['sports', []], ['accessory', []], ['street', []], ['book', []], ['household', []],
  ]],
];

/** Every category id in pane order (parents before their children). */
export function categoryIds() {
  const out = [];
  const walk = (prefix, nodes) => {
    for (const node of nodes) {
      const [name, children] = Array.isArray(node) ? node : [node, []];
      const id = prefix ? `${prefix}/${name}` : name;
      out.push(id);
      walk(id, children);
    }
  };
  walk('', CATEGORY_TREE);
  return out;
}

/** i18n key of a category: 'object/animal/dog' → 'analysis.object.animal.dog'. */
export const categoryKey = (id) => `analysis.${id.replace(/\//g, '.')}`;

// ───────── colour statistics

/**
 * Statistics of RGBA pixels (best on a small copy, e.g. 96 px): fractions of
 * the picture that are grey, white, dark, warm, green, blue in the top third /
 * bottom half, flat (a neighbour has the very same colour) and edges.
 */
export function colorStats(data, width, height) {
  const n = width * height;
  let luma = 0;
  let luma2 = 0;
  let sat = 0;
  const count = { gray: 0, white: 0, dark: 0, bright: 0, warmTop: 0, green: 0, blueTop: 0, blueBottom: 0, sandBottom: 0, flat: 0, edge: 0, skin: 0 };
  const topRows = Math.max(1, Math.round(height / 3));
  const bottomStart = Math.floor(height / 2);
  const colors = new Set();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = data[i] / 255;
      const g = data[i + 1] / 255;
      const b = data[i + 2] / 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const s = max === 0 ? 0 : (max - min) / max;
      let hue = 0;
      if (max !== min) {
        const d = max - min;
        hue = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
        hue = (hue * 60 + 360) % 360;
      }
      luma += l;
      luma2 += l * l;
      sat += s;
      if (s < 0.1) count.gray++;
      if (l > 0.85 && s < 0.12) count.white++;
      if (l < 0.18) count.dark++;
      if (l > 0.8) count.bright++;
      if (s > 0.18 && hue >= 70 && hue <= 170 && l > 0.08) count.green++;
      const blue = s > 0.15 && hue >= 185 && hue <= 250 && l > 0.25;
      if (y < topRows) {
        if (blue || (l > 0.6 && s < 0.12 && b >= r)) count.blueTop += blue ? 1 : 0.5; // pale or overcast sky counts half
        if (s > 0.3 && (hue <= 50 || hue >= 330) && l > 0.45) count.warmTop++; // a glowing sky, not autumn leaves
      }
      if (y >= bottomStart && blue) count.blueBottom++;
      if (y >= bottomStart && hue >= 22 && hue <= 55 && s > 0.1 && s < 0.5 && l > 0.5) count.sandBottom++;
      if (hue >= 5 && hue <= 35 && s > 0.2 && s < 0.65 && l > 0.25 && l < 0.85 && r > g && g > b) count.skin++;
      if (x > 0) {
        const j = i - 4;
        if (data[i] === data[j] && data[i + 1] === data[j + 1] && data[i + 2] === data[j + 2]) count.flat++;
        if (Math.abs(data[i] - data[j]) + Math.abs(data[i + 1] - data[j + 1]) + Math.abs(data[i + 2] - data[j + 2]) > 120) count.edge++;
      }
      if (colors.size < 4096) colors.add(((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3));
    }
  }
  const mean = luma / n;
  const top = topRows * width;
  const bottom = (height - bottomStart) * width;
  return {
    luma: mean,
    contrast: Math.sqrt(Math.max(0, luma2 / n - mean * mean)),
    saturation: sat / n,
    gray: count.gray / n,
    white: count.white / n,
    dark: count.dark / n,
    bright: count.bright / n,
    green: count.green / n,
    skin: count.skin / n,
    warmTop: count.warmTop / top,
    blueTop: count.blueTop / top,
    blueBottom: count.blueBottom / bottom,
    sandBottom: count.sandBottom / bottom,
    flat: count.flat / Math.max(1, n - height),
    edge: count.edge / Math.max(1, n - height),
    colors: colors.size,
  };
}

/** Scenes the colours alone suggest. */
export function scenesFromStats(s) {
  const out = new Set();
  // Text on paper or a screen grab: mostly white or flat, a few dark strokes, many sharp edges.
  const paper = s.white > 0.45 && s.gray > 0.8 && s.dark > 0.01 && s.edge > 0.04;
  const screen = s.flat > 0.55 && s.edge > 0.02 && s.colors < 1500;
  if (paper || screen) out.add('document');
  if (s.gray > 0.97 && !out.has('document')) out.add('bw');
  if (s.luma < 0.2 && s.dark > 0.6 && !out.has('bw')) out.add('night');
  // A warm, glowing upper part over a darker picture (warm lamps indoors are dropped in classify).
  if (s.warmTop > 0.45 && s.luma < 0.5 && s.saturation > 0.35 && s.dark > 0.15) out.add('sunset');
  if (s.blueTop > 0.4 && !out.has('night')) out.add('sky');
  if (s.green > 0.3) out.add('nature');
  if (s.white > 0.35 && !out.has('document') && s.edge < 0.05 && s.blueTop + s.white > 0.5) out.add('snow');
  if (s.blueBottom > 0.3 && s.blueTop > 0.25) out.add('sea');
  // Pale sand below, sky or sea above.
  if (s.sandBottom > 0.3 && (s.blueTop > 0.25 || s.blueBottom > 0.1)) out.add('beach');
  return out;
}

// ───────── ImageNet (MobileNet) classes

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const byIndex = new Map();
const put = (indexes, ids) => { for (const i of indexes) byIndex.set(i, [...(byIndex.get(i) ?? []), ...ids]); };
put(range(151, 268), ['object/animal/dog']);
put(range(281, 285), ['object/animal/cat']);
put([...range(7, 24), ...range(80, 100), ...range(127, 146)], ['object/animal/bird']);
put([...range(0, 6), ...range(389, 397)], ['object/animal/fish']);
put(range(300, 326), ['object/animal/insect']);
put([...range(25, 79), ...range(101, 126), ...range(147, 150), ...range(269, 280), ...range(286, 299), ...range(327, 338), ...range(340, 344), ...range(350, 388)], ['object/animal/wild']);
put([345, 346, 347, 348, 349], ['object/animal/farm']); // ox, water buffalo, bison, ram, bighorn
put([339], ['object/animal/horse']); // sorrel
put(range(924, 969), ['scene/food', 'object/food']);
put(range(936, 957), ['object/plant']);
put([985, 986], ['scene/flower', 'object/plant']);
put([984, 987, 988, 989, 990, 991, 992, 993, 994, 995, 996, 997, 998], ['scene/nature']);

/** First name of an ImageNet label ("seashore, coast, …" → "seashore"). */
const first = (name) => String(name ?? '').split(',')[0].trim().toLowerCase();
const NAMED = {
  'scene/beach': ['seashore', 'sandbar', 'promontory', 'bikini', 'maillot', 'swimming trunks', 'sarong'],
  'scene/sea': ['lakeside', 'coral reef', 'dock', 'pier', 'boathouse', 'liner', 'schooner', 'yawl', 'catamaran', 'trimaran', 'speedboat', 'canoe', 'paddle', 'snorkel', 'scuba diver', 'breakwater', 'fireboat', 'container ship', 'lifeboat', 'submarine', 'gondola'],
  'scene/mountain': ['alp', 'valley', 'volcano', 'cliff', 'mountain tent', 'ski', 'dogsled', 'cliff dwelling'],
  'scene/nature': ['geyser', 'hay', 'rapeseed', 'mushroom', 'worm fence', 'maze', 'bubble'],
  'scene/sky': ['parachute', 'kite', 'balloon', 'airship', 'airliner', 'warplane', 'wing'],
  'scene/snow': ['ski', 'snowmobile', 'dogsled', 'snowplow', 'bobsled', 'igloo'],
  'scene/city': ['church', 'mosque', 'palace', 'monastery', 'castle', 'stupa', 'triumphal arch', 'library', 'dome', 'bell cote', 'prison', 'planetarium', 'cinema', 'restaurant', 'grocery store', 'bakery', 'barbershop', 'bookshop', 'butcher shop', 'confectionery', 'shoe shop', 'tobacco shop', 'toyshop', 'steel arch bridge', 'suspension bridge', 'viaduct', 'dam', 'fountain', 'obelisk', 'water tower', 'street sign', 'traffic light', 'tile roof', 'thatch', 'patio', 'parking meter', 'trolleybus', 'cab', 'streetcar', 'police van', 'garbage truck', 'school bus', 'traffic light', 'mailbox', 'triumphal arch', 'altar', 'pedestal', 'brass', 'cinema', 'scoreboard', 'chain link fence', 'picket fence', 'sliding door', 'tobacco shop', 'apiary', 'barn', 'greenhouse', 'boathouse', 'yurt', 'mobile home', 'home theater'],
  'scene/indoor': ['barber chair', 'bookcase', 'chest', 'china cabinet', 'cradle', 'crib', 'desk', 'dining table', 'entertainment center', 'file', 'folding chair', 'four-poster', 'rocking chair', 'studio couch', 'throne', 'wardrobe', 'table lamp', 'washbasin', 'toilet seat', 'bathtub', 'tub', 'shower curtain', 'shoji', 'window shade', 'window screen', 'quilt', 'pillow', 'home theater', 'library', 'restaurant', 'medicine chest', 'refrigerator', 'microwave', 'dishwasher', 'stove', 'wok', 'frying pan', 'espresso maker', 'vacuum', 'lampshade', 'radiator', 'chiffonier', 'plate rack', 'shower cap', 'dumbbell', 'barbell'],
  'scene/document': ['book jacket', 'web site', 'comic book', 'crossword puzzle', 'menu', 'binder', 'envelope', 'notebook', 'packet', 'carton', 'scoreboard', 'slide rule', 'rule'],
  'object/vehicle/car': ['ambulance', 'beach wagon', 'cab', 'convertible', 'jeep', 'limousine', 'minivan', 'model t', 'racer', 'sports car', 'go-kart', 'golfcart', 'police van'],
  'object/vehicle/truck': ['pickup', 'tow truck', 'trailer truck', 'moving van', 'garbage truck', 'fire engine', 'tractor', 'snowplow', 'forklift', 'half track', 'tank'],
  'object/vehicle/bus': ['school bus', 'trolleybus', 'minibus', 'passenger car'],
  'object/vehicle/train': ['bullet train', 'electric locomotive', 'freight car', 'steam locomotive', 'streetcar', 'passenger car'],
  'object/vehicle/bicycle': ['bicycle-built-for-two', 'mountain bike', 'tricycle', 'unicycle'],
  'object/vehicle/motorcycle': ['motor scooter', 'moped'],
  'object/vehicle/airplane': ['airliner', 'warplane', 'airship', 'wing'],
  'object/vehicle/boat': ['canoe', 'catamaran', 'fireboat', 'gondola', 'lifeboat', 'liner', 'pirate', 'schooner', 'speedboat', 'submarine', 'trimaran', 'yawl', 'container ship', 'aircraft carrier', 'paddlewheel'],
  'object/electronics': ['computer keyboard', 'desktop computer', 'hand-held computer', 'laptop', 'monitor', 'screen', 'television', 'mouse', 'cellular telephone', 'dial telephone', 'reflex camera', 'polaroid camera', 'cassette player', 'tape player', 'radio', 'loudspeaker', 'modem', 'ipod', 'remote control', 'joystick', 'projector', 'printer', 'cd player', 'hard disc', 'digital clock', 'digital watch', 'switch', 'oscilloscope'],
  'object/furniture': ['barber chair', 'bookcase', 'chest', 'china cabinet', 'cradle', 'crib', 'desk', 'dining table', 'entertainment center', 'folding chair', 'four-poster', 'rocking chair', 'studio couch', 'throne', 'wardrobe', 'park bench', 'chiffonier'],
  'object/kitchen': ['wok', 'frying pan', 'caldron', 'coffeepot', 'teapot', 'mixing bowl', 'soup bowl', 'measuring cup', 'water bottle', 'wine bottle', 'beer bottle', 'beer glass', 'goblet', 'cup', 'coffee mug', 'pitcher', 'plate', 'spatula', 'ladle', 'wooden spoon', 'corkscrew', 'can opener', 'cleaver', 'crock pot', 'dutch oven', 'pop bottle', 'water jug', 'whiskey jug'],
  'object/appliance': ['refrigerator', 'microwave', 'dishwasher', 'stove', 'toaster', 'espresso maker', 'washer', 'vacuum', 'iron', 'electric fan', 'space heater', 'hair spray'],
  'object/sports': ['ballplayer', 'basketball', 'croquet ball', 'golf ball', 'ping-pong ball', 'rugby ball', 'soccer ball', 'tennis ball', 'volleyball', 'baseball', 'football helmet', 'racket', 'ski', 'snowmobile', 'bobsled', 'surfboard', 'puck', 'dumbbell', 'barbell', 'balance beam', 'horizontal bar', 'parallel bars', 'golfcart'],
  'object/accessory': ['backpack', 'umbrella', 'purse', 'wallet', 'sunglasses', 'sunglass', 'bow tie', 'windsor tie', 'suit', 'mailbag', 'sombrero', 'cowboy hat', 'bonnet', 'necklace', 'wig'],
  'object/book': ['book jacket', 'comic book', 'binder', 'notebook', 'menu'],
  'object/household': ['vase', 'teddy', 'wall clock', 'analog clock', 'scissors', 'hair slide', 'toothbrush', 'candle', 'lampshade', 'table lamp', 'pillow', 'quilt', 'umbrella', 'pot', 'flowerpot', 'plunger', 'broom', 'bucket', 'mop'],
  'object/plant': ['pot', 'daisy', "yellow lady's slipper", 'greenhouse'],
  'object/street': ['street sign', 'traffic light', 'parking meter', 'mailbox', 'fire hydrant', 'manhole cover', 'park bench'],
};
const byName = new Map();
for (const [id, names] of Object.entries(NAMED)) for (const name of names) byName.set(name, [...(byName.get(name) ?? []), id]);

/** Categories of one ImageNet class (index 0…999, `name` its label). */
export function imagenetIds(index, name) {
  return [...new Set([...(byIndex.get(index) ?? []), ...(byName.get(first(name)) ?? [])])];
}

// ───────── COCO-SSD objects

const COCO = {
  bicycle: 'object/vehicle/bicycle', car: 'object/vehicle/car', motorcycle: 'object/vehicle/motorcycle', airplane: 'object/vehicle/airplane',
  bus: 'object/vehicle/bus', train: 'object/vehicle/train', truck: 'object/vehicle/truck', boat: 'object/vehicle/boat',
  'traffic light': 'object/street', 'fire hydrant': 'object/street', 'stop sign': 'object/street', 'parking meter': 'object/street', bench: 'object/street',
  bird: 'object/animal/bird', cat: 'object/animal/cat', dog: 'object/animal/dog', horse: 'object/animal/horse',
  sheep: 'object/animal/farm', cow: 'object/animal/farm', elephant: 'object/animal/wild', bear: 'object/animal/wild', zebra: 'object/animal/wild', giraffe: 'object/animal/wild',
  backpack: 'object/accessory', umbrella: 'object/accessory', handbag: 'object/accessory', tie: 'object/accessory', suitcase: 'object/accessory',
  frisbee: 'object/sports', skis: 'object/sports', snowboard: 'object/sports', 'sports ball': 'object/sports', kite: 'object/sports', 'baseball bat': 'object/sports',
  'baseball glove': 'object/sports', skateboard: 'object/sports', surfboard: 'object/sports', 'tennis racket': 'object/sports',
  bottle: 'object/kitchen', 'wine glass': 'object/kitchen', cup: 'object/kitchen', fork: 'object/kitchen', knife: 'object/kitchen', spoon: 'object/kitchen', bowl: 'object/kitchen',
  banana: 'object/food', apple: 'object/food', sandwich: 'object/food', orange: 'object/food', broccoli: 'object/food', carrot: 'object/food', 'hot dog': 'object/food', pizza: 'object/food', donut: 'object/food', cake: 'object/food',
  chair: 'object/furniture', couch: 'object/furniture', bed: 'object/furniture', 'dining table': 'object/furniture', toilet: 'object/furniture', 'potted plant': 'object/plant',
  tv: 'object/electronics', laptop: 'object/electronics', mouse: 'object/electronics', remote: 'object/electronics', keyboard: 'object/electronics', 'cell phone': 'object/electronics',
  microwave: 'object/appliance', oven: 'object/appliance', toaster: 'object/appliance', sink: 'object/appliance', refrigerator: 'object/appliance',
  book: 'object/book', clock: 'object/household', vase: 'object/household', scissors: 'object/household', 'teddy bear': 'object/household', 'hair drier': 'object/household', toothbrush: 'object/household',
};
/** Scene hints from detected objects. */
const COCO_SCENE = {
  'scene/indoor': ['chair', 'couch', 'bed', 'dining table', 'toilet', 'tv', 'laptop', 'microwave', 'oven', 'toaster', 'sink', 'refrigerator', 'keyboard', 'mouse', 'remote'],
  'scene/city': ['traffic light', 'fire hydrant', 'stop sign', 'parking meter', 'bus', 'truck'],
  'scene/food': ['sandwich', 'hot dog', 'pizza', 'donut', 'cake', 'broccoli', 'carrot'],
  'scene/sea': ['boat', 'surfboard'],
  'scene/snow': ['skis', 'snowboard'],
  'scene/sky': ['airplane', 'kite'],
};

/** Category of a COCO-SSD label, or null (a person is counted, not filed as an object). */
export const cocoIds = (label) => (COCO[label] ? [COCO[label]] : []);

// ───────── everything together

/**
 * predictions: MobileNet top classes [{ index, name, p }]
 * detections:  COCO-SSD [{ label, score, box: { x, y, w, h } as fractions }]
 * stats:       colorStats(), faces: number of faces found (or null)
 * → { cats: ['people/…', 'scene/…', 'object/…'], people, labels: ['seashore', 'dog', …] }
 */
export function classify({ predictions = [], detections = [], stats = null, faces = null }) {
  const cats = new Set();
  const persons = detections.filter((d) => d.label === 'person' && d.score >= 0.5);
  const people = Math.max(persons.length, faces ?? 0);
  const largest = persons.reduce((m, d) => Math.max(m, d.box.w * d.box.h), 0);
  cats.add(people === 0 ? 'people/none'
    : people === 1 ? (largest > 0.2 || (faces === 1 && !persons.length) ? 'people/portrait' : 'people/one')
      : people === 2 ? 'people/two' : people <= 5 ? 'people/group' : 'people/crowd');

  // Objects: confident detections, then strong ImageNet guesses.
  const labels = [];
  for (const d of detections) {
    if (d.score < 0.5 || d.label === 'person') continue;
    for (const id of cocoIds(d.label)) cats.add(id);
    for (const [scene, names] of Object.entries(COCO_SCENE)) if (names.includes(d.label)) cats.add(scene);
    labels.push(d.label);
  }
  // Scenes and objects from the classifier: the summed probability per category.
  const score = new Map();
  for (const p of predictions) {
    for (const id of imagenetIds(p.index, p.name)) score.set(id, (score.get(id) ?? 0) + p.p);
  }
  for (const [id, p] of score) {
    if (p >= (id.startsWith('scene/') ? 0.2 : 0.35)) cats.add(id);
  }
  if (predictions[0] && predictions[0].p >= 0.2) labels.unshift(first(predictions[0].name));

  if (stats) {
    for (const scene of scenesFromStats(stats)) cats.add(`scene/${scene}`);
    // Night / dark, or a picture of something: drop colour-only guesses the content contradicts.
    if (cats.has('scene/indoor')) { cats.delete('scene/sky'); cats.delete('scene/sea'); cats.delete('scene/snow'); cats.delete('scene/sunset'); }
    if (cats.has('scene/document')) { cats.delete('scene/snow'); cats.delete('scene/sky'); cats.delete('scene/nature'); }
  }
  return { cats: [...cats].sort(), people, labels: [...new Set(labels)].slice(0, 6) };
}

/** Does a record's analysis belong to category `id` (a parent covers its children)? */
export const inCategory = (analysis, id) => (analysis?.cats ?? []).some((c) => c === id || c.startsWith(`${id}/`));

/** { id: count } for every category (parents count each picture once). */
export function categoryCounts(analyses) {
  const out = {};
  for (const analysis of analyses) {
    const seen = new Set();
    for (const c of analysis?.cats ?? []) {
      const parts = c.split('/');
      for (let i = 1; i <= parts.length; i++) seen.add(parts.slice(0, i).join('/'));
    }
    for (const id of seen) out[id] = (out[id] ?? 0) + 1;
  }
  return out;
}

let ORDER = null;
/** The one category of `kind` ('people' | 'scene' | 'object') a picture is filed under, or null. */
export function primaryCategory(analysis, kind) {
  ORDER ??= categoryIds();
  const cats = (analysis?.cats ?? []).filter((c) => c.startsWith(`${kind}/`));
  if (!cats.length) return null;
  // Objects are filed by their group (animal, vehicle …); the earliest in the pane's order wins.
  const ids = cats.map((c) => (kind === 'object' ? c.split('/').slice(0, 2).join('/') : c));
  return ids.sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b))[0];
}
