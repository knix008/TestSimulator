// Furniture of other programs → the library item that fits it best: by the words of its name,
// catalogue id and category (English, Korean and the languages Sweet Home 3D / IFC files are
// often written in) and by its size. Pure: the caller passes the catalogue items.

/** Words of other languages and catalogue spellings → the English word the library uses. */
const SYNONYMS = {
  lit: 'bed', bett: 'bed', cama: 'bed', letto: 'bed', bunk: 'bed', 침대: 'bed',
  canape: 'sofa', canapé: 'sofa', couch: 'sofa', settee: 'sofa', sofá: 'sofa', divano: 'sofa', 소파: 'sofa',
  fauteuil: 'armchair', sessel: 'armchair', poltrona: 'armchair', sillón: 'armchair', 안락의자: 'armchair',
  chaise: 'chair', stuhl: 'chair', silla: 'chair', sedia: 'chair', 의자: 'chair', seat: 'chair',
  tabouret: 'stool', hocker: 'stool', 스툴: 'stool',
  tisch: 'table', mesa: 'table', tavolo: 'table', 테이블: 'table', 식탁: 'table',
  bureau: 'desk', schreibtisch: 'desk', escritorio: 'desk', scrivania: 'desk', 책상: 'desk',
  armoire: 'wardrobe', placard: 'wardrobe', closet: 'wardrobe', schrank: 'wardrobe', kleiderschrank: 'wardrobe', armario: 'wardrobe', 옷장: 'wardrobe', cupboard: 'cabinet',
  bibliotheque: 'bookshelf', bibliothèque: 'bookshelf', bookcase: 'bookshelf', regal: 'bookshelf', estanteria: 'bookshelf', 책장: 'bookshelf', etagere: 'shelf', étagère: 'shelf',
  commode: 'dresser', chest: 'dresser', drawers: 'dresser', kommode: 'dresser', 서랍장: 'dresser',
  nightstand: 'nightstand', bedside: 'nightstand', chevet: 'nightstand', nachttisch: 'nightstand', 협탁: 'nightstand',
  baignoire: 'bathtub', bath: 'bathtub', bathtub: 'bathtub', badewanne: 'bathtub', bañera: 'bathtub', 욕조: 'bathtub', tub: 'bathtub',
  douche: 'shower', dusche: 'shower', ducha: 'shower', 샤워: 'shower',
  wc: 'toilet', toilette: 'toilet', toilettes: 'toilet', 변기: 'toilet', lavatory: 'toilet',
  lavabo: 'washbasin', washbasin: 'washbasin', basin: 'washbasin', waschbecken: 'washbasin', 세면대: 'washbasin',
  evier: 'sink', évier: 'sink', spüle: 'sink', fregadero: 'sink', 싱크대: 'sink',
  fridge: 'refrigerator', frigo: 'refrigerator', refrigerateur: 'refrigerator', réfrigérateur: 'refrigerator', kühlschrank: 'refrigerator', 냉장고: 'refrigerator',
  cooker: 'cooktop', stove: 'cooktop', cuisiniere: 'cooktop', cuisinière: 'cooktop', herd: 'cooktop', hob: 'cooktop', 가스레인지: 'cooktop', four: 'oven', 오븐: 'oven',
  lave: 'washing', washer: 'washing', waschmaschine: 'washing', 세탁기: 'washing', dishwasher: 'dishwasher', 식기세척기: 'dishwasher',
  television: 'tv', téléviseur: 'tv', fernseher: 'tv', 텔레비전: 'tv', 티비: 'tv',
  lampe: 'lamp', lampara: 'lamp', light: 'lamp', luminaire: 'lamp', lustre: 'chandelier', 조명: 'lamp', 램프: 'lamp',
  plante: 'plant', pflanze: 'plant', planta: 'plant', 화분: 'plant', 식물: 'plant',
  tapis: 'rug', teppich: 'rug', carpet: 'rug', alfombra: 'rug', 러그: 'rug',
  miroir: 'mirror', spiegel: 'mirror', espejo: 'mirror', 거울: 'mirror',
  rideau: 'curtains', curtain: 'curtains', vorhang: 'curtains', 커튼: 'curtains',
  piano: 'piano', escalier: 'stairs', staircase: 'stairs', stair: 'stairs', treppe: 'stairs', 계단: 'stairs',
  cuisine: 'kitchen', küche: 'kitchen', 주방: 'kitchen', 부엌: 'kitchen',
  crib: 'crib', cot: 'crib', berceau: 'crib', 아기침대: 'crib',
};
const STOP = new Set(['eteks', 'scopia', 'contributions', 'katorlegaz', 'the', 'a', 'an', 'and', 'with', 'of', 'de', 'du', 'la', 'le', 'les', 'des', 'et', 'en', 'x', 'cm', 'mm', 'model', 'object', 'piece', 'furniture', 'ifc', 'element', 'furnishing', 'type', 'mesh', 'default', 'standard', 'generic', 'copy', 'new', 'item', 'large', 'small', 'big', 'modern', 'simple']);

/** Words of a name / id: camelCase and digits split, lower case, synonyms applied, stop words dropped. */
export function nameWords(text = '') {
  const raw = String(text)
    .replace(/[\w.-]+#/g, ' ') // catalogue prefixes: "eTeks#bed140x190" → "bed140x190"
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[#_\-./:,;()[\]{}'"+*=|\\]+/g, ' ')
    .replace(/(\p{L})(\d)/gu, '$1 $2').replace(/(\d)(\p{L})/gu, '$1 $2')
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w && !/^\d+$/.test(w));
  const out = [];
  for (const w of raw) {
    const s = SYNONYMS[w] || SYNONYMS[w.normalize('NFD').replace(/[̀-ͯ]/g, '')] || (w.endsWith('s') && w.length > 3 && SYNONYMS[w.slice(0, -1)]) || w;
    if (!STOP.has(s) && s.length > 1) out.push(s);
  }
  return [...new Set(out)];
}

const itemWordCache = new WeakMap();
function itemWords(item) {
  let w = itemWordCache.get(item);
  if (!w) {
    w = { id: nameWords(item.id), en: nameWords(item.en ?? ''), tags: new Set((item.tags ?? []).flatMap((t) => nameWords(t))) };
    itemWordCache.set(item, w);
  }
  return w;
}

/**
 * The best library item for a piece: `piece` = { name, hints (catalogue id, category, type …), size: [w, h, d] (m) };
 * `items` = catalogue items. Doors, windows and user items are left out. Returns { item, score } or null.
 */
export function matchLibraryItem(piece, items, { minScore = 2 } = {}) {
  const words = nameWords(`${piece.name ?? ''} ${piece.hints ?? ''}`);
  if (!words.length) return null;
  const outdoor = words.some((w) => /outdoor|garden|patio|terrace|jardin|garten|balcon|야외|정원/.test(w));
  let best = null;
  for (const item of items) {
    if (!item || item.placement === 'opening' || item.kind === 'user' || item.category === 'doors' || item.category === 'windows') continue;
    const iw = itemWords(item);
    let score = 0;
    for (const w of words) {
      if (iw.id.includes(w)) score += 3;
      else if (iw.en.includes(w)) score += 2;
      else if (iw.tags.has(w)) score += 1;
    }
    if (score <= 0) continue;
    // Plain items first ('bed' before 'bed-canopy'), then the closest size.
    score -= Math.max(0, iw.id.length - 1) * 0.35;
    if (item.category === 'outdoor' && !outdoor) score -= 1;
    if (piece.size?.every((v) => v > 0) && item.size) {
      const miss = [0, 1, 2].reduce((s, i) => s + Math.min(1, Math.abs(Math.log(piece.size[i] / Math.max(0.01, item.size[i])))), 0);
      score -= miss * 0.5;
    }
    if (!best || score > best.score) best = { item, score };
  }
  return best && best.score >= minScore - 1e-9 ? best : null;
}
