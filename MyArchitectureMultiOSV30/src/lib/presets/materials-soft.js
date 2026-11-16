// "Soft" material presets that MATERIAL_PRESETS (materials.js) adds to its own list: wood, fabric,
// leather, paint and plastic. Same shape as materials.js presets: id, category, ko, en, colour,
// roughness, metalness, repeat (m per tile) plus physical extras (sheen, clearcoat, transmission …)
// and `textures` (a Poly Haven set fetched by `npm run assets`; the colour tints it, see library/assets.js).
//
// Families are written as tables (species × finish, leather type × colourway …) so each entry is a
// real product: a white oak that is limed, a nubuck in olive, an eggshell sage — not tints of one thing.

const P = (id, category, ko, en, color, roughness, metalness = 0, extra = {}) => ({ id, category, ko, en, color, roughness, metalness, repeat: 1, ...extra });

// ───────────────────────── colour helpers (hex in, hex out)

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const hex = (c) => `#${c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
/** a → b by t (0..1). */
const mix = (a, b, t) => { const x = rgb(a), y = rgb(b); return hex(x.map((v, i) => v + (y[i] - v) * t)); };
/** Darker (k < 1) or lighter (k > 1) at the same hue. */
const shade = (a, k) => hex(rgb(a).map((v) => v * k));

// ───────────────────────── wood: species × finish

/** Finish → how it changes a species' colour and surface. */
const WOOD_FINISH = {
  oil: { ko: '오일 마감', en: 'oiled', r: 0.55 },
  natural: { ko: '내추럴', en: 'natural', r: 0.55 },
  matte: { ko: '무광 우레탄', en: 'matte lacquer', r: 0.45, cc: 0.25, ccr: 0.55 },
  satin: { ko: '반광 래커', en: 'satin lacquer', r: 0.38, cc: 0.5, ccr: 0.3 },
  gloss: { ko: '유광 래커', en: 'high-gloss lacquer', r: 0.3, cc: 1, ccr: 0.06 },
  smoked: { ko: '스모크 착색', en: 'smoked', r: 0.55, color: (c) => mix(shade(c, 0.55), '#3a2a20', 0.25) },
  fumed: { ko: '훈증 마감', en: 'fumed', r: 0.55, color: (c) => mix(shade(c, 0.7), '#5a3c24', 0.35) },
  carbon: { ko: '카보나이즈드', en: 'carbonised', r: 0.5, color: (c) => mix(c, '#7a4e2c', 0.6) },
  limed: { ko: '라임 워시', en: 'limed', r: 0.6, color: (c) => mix(c, '#e6e0d2', 0.45) },
  white: { ko: '화이트워시', en: 'whitewashed', r: 0.6, color: (c) => mix(c, '#efe9de', 0.65) },
  grey: { ko: '그레이 스테인', en: 'grey stain', r: 0.55, color: (c) => mix(c, '#8a8580', 0.55) },
  honey: { ko: '허니 스테인', en: 'honey stain', r: 0.45, cc: 0.3, ccr: 0.45, color: (c) => mix(c, '#c08a3e', 0.4) },
  ebon: { ko: '흑색 착색(에보나이즈)', en: 'ebonised', r: 0.45, color: (c) => mix(c, '#1c1714', 0.85) },
  dist: { ko: '빈티지 가공', en: 'distressed', r: 0.75, color: (c) => mix(shade(c, 0.85), '#8a7a66', 0.2) },
  burnt: { ko: '탄화 마감(낙동법)', en: 'charred (shou sugi ban)', r: 0.88, color: () => '#2a221d' },
};

/** [id, ko, en, colour, texture set, finishes] */
const WOOD_SPECIES = [
  ['white-oak', '화이트 오크', 'White oak', '#c9a77c', 'white_oak_veneer', ['oil', 'matte', 'satin', 'smoked', 'fumed', 'limed', 'white', 'grey', 'ebon', 'dist', 'burnt']],
  ['red-oak', '레드 오크', 'Red oak', '#b07a55', 'red_oak_veneer', ['oil', 'satin', 'honey', 'dist']],
  ['am-walnut', '아메리칸 월넛', 'American walnut', '#6e4a32', 'american_walnut_veneer', ['oil', 'matte', 'satin', 'gloss']],
  ['maple', '메이플', 'Maple', '#e0c49a', 'white_maple_veneer', ['oil', 'matte', 'gloss', 'honey']],
  ['cherry', '체리', 'Cherry', '#9c5a3a', 'cherry_veneer', ['oil', 'satin', 'gloss']],
  ['beech', '너도밤나무(비치)', 'Beech', '#d4a77a', 'white_maple_veneer', ['oil', 'matte']],
  ['birch', '자작나무', 'Birch', '#e3cfa8', 'white_maple_veneer', ['oil', 'matte', 'white']],
  ['mahogany', '마호가니', 'Mahogany', '#7a3b26', 'sapele_veneer_02', ['oil', 'satin', 'gloss']],
  ['sapele', '사펠리', 'Sapele', '#8a4b2e', 'sapele_veneer_02', ['oil', 'satin']],
  ['wenge', '웬지', 'Wenge', '#3b2a20', 'walnut_veneer', ['oil', 'matte']],
  ['zebrano', '제브라노', 'Zebrano', '#c3a275', 'olive_veneer', ['oil', 'gloss']],
  ['ebony', '흑단', 'Ebony', '#241a15', 'rosewood_veneer_02', ['oil', 'gloss']],
  ['acacia', '아카시아', 'Acacia', '#9a6a3e', 'teak_veneer', ['oil', 'matte', 'dist']],
  ['bamboo', '대나무', 'Bamboo', '#d3b07a', 'bamboo_veneer', ['natural', 'carbon', 'matte']],
  ['pine', '소나무', 'Pine', '#d9b07a', 'coated_pine', ['oil', 'white', 'honey', 'dist']],
  ['cedar', '시더(적삼목)', 'Cedar', '#b06e48', 'coated_pine', ['oil', 'burnt']],
  ['elm', '느릅나무', 'Elm', '#a87b55', 'oak_veneer_01', ['oil', 'smoked', 'dist']],
  ['olive', '올리브나무', 'Olive wood', '#b49468', 'olive_veneer', ['oil', 'satin']],
  ['rosewood', '로즈우드', 'Rosewood', '#5b2e22', 'rosewood_veneer_02', ['oil', 'gloss']],
  ['iroko', '이로코', 'Iroko', '#9b7444', 'teak_veneer', ['oil']],
  ['zelkova', '느티나무', 'Zelkova (keyaki)', '#a8774c', 'red_oak_veneer', ['oil', 'satin']],
  ['paulownia', '오동나무', 'Paulownia', '#d8c3a0', 'ash_veneer', ['oil', 'burnt']],
  ['teak', '티크', 'Teak', '#9a6a3c', 'teak_veneer', ['matte', 'dist']],
  ['ash', '애쉬', 'Ash', '#d8c3a0', 'ash_veneer', ['smoked', 'white', 'ebon']],
];

function woodSpecies() {
  const out = [];
  for (const [id, ko, en, color, textures, finishes] of WOOD_SPECIES) {
    for (const key of finishes) {
      const f = WOOD_FINISH[key];
      const extra = { textures };
      if (f.cc) Object.assign(extra, { clearcoat: f.cc, clearcoatRoughness: f.ccr });
      out.push(P(`wood-${id}-${key}`, 'wood', `${ko} ${f.ko}`, `${en}, ${f.en}`, f.color ? f.color(color) : color, f.r, 0, extra));
    }
  }
  return out;
}

/** A woven-fibre pattern (patterns.js basketweave): strand colour, gap colour, strand width (m), strands per block, fibres per strand. */
const weave = (color, gap, w, n, fibres) => ({ kind: 'basketweave', w, n, fibres, colors: [color], grout: gap, groutWidth: 0.0007, variation: 0.08, cover: 0.25, bump: 1.5 });

const WOOD_BOARDS = [
  // engineered boards
  P('wood-mdf-raw', 'wood', 'MDF(원판)', 'MDF (raw)', '#b89a72', 0.8),
  P('wood-mdf-primed', 'wood', 'MDF 하도 도장', 'MDF (primed)', '#ecebe6', 0.75),
  P('wood-particle-board', 'wood', '파티클보드', 'Particle board', '#c4a57a', 0.85, 0, { pattern: { kind: 'plain', base: '#c6a77c', size: 0.3, grain: 0.2, speckle: [['#8f6e45', 0.22, 0.003], ['#e0c79c', 0.2, 0.004], ['#a8885a', 0.2, 0.002]] } }),
  P('wood-osb', 'wood', 'OSB 합판', 'OSB board', '#c09a62', 0.75, 0, { textures: 'oriented_strand_board' }),
  P('wood-osb-lacquered', 'wood', 'OSB 투명 코팅', 'OSB (clear lacquered)', '#b48c55', 0.45, 0, { clearcoat: 0.5, clearcoatRoughness: 0.3, textures: 'oriented_strand_board' }),
  P('wood-osb-white', 'wood', 'OSB 화이트 도장', 'OSB (white painted)', '#e6e1d6', 0.7, 0, { textures: 'oriented_strand_board' }),
  P('wood-birch-plywood', 'wood', '자작 합판', 'Birch plywood', '#e1c9a0', 0.6, 0, { textures: 'plywood' }),
  P('wood-plywood-lacquered', 'wood', '합판 투명 래커', 'Plywood (clear lacquered)', '#d2b182', 0.4, 0, { clearcoat: 0.5, clearcoatRoughness: 0.3, textures: 'plywood' }),
  P('wood-plywood-white', 'wood', '합판 화이트 스테인', 'Plywood (white stained)', '#ece4d4', 0.6, 0, { textures: 'plywood' }),
  // melamine (low-pressure laminate) on chipboard — kitchen carcasses, office desks
  P('wood-melamine-white', 'wood', '멜라민 화이트', 'Melamine white', '#f2f1ed', 0.4),
  P('wood-melamine-light-grey', 'wood', '멜라민 라이트 그레이', 'Melamine light grey', '#c9c8c4', 0.42),
  P('wood-melamine-cashmere', 'wood', '멜라민 캐시미어', 'Melamine cashmere', '#c9bba6', 0.42),
  P('wood-melamine-anthracite', 'wood', '멜라민 앤트러사이트', 'Melamine anthracite', '#3a3b3d', 0.42),
  P('wood-melamine-black', 'wood', '멜라민 블랙', 'Melamine black', '#1b1b1c', 0.4),
  P('wood-melamine-oak', 'wood', '멜라민 오크 무늬', 'Melamine oak effect', '#c4a072', 0.42, 0, { clearcoat: 0.2, clearcoatRoughness: 0.5, textures: 'oak_veneer_01' }),
  P('wood-melamine-walnut', 'wood', '멜라민 월넛 무늬', 'Melamine walnut effect', '#6a4a35', 0.42, 0, { clearcoat: 0.2, clearcoatRoughness: 0.5, textures: 'walnut_veneer' }),
  P('wood-melamine-white-oak', 'wood', '멜라민 화이트 오크 무늬', 'Melamine white oak effect', '#d9c3a2', 0.42, 0, { clearcoat: 0.2, clearcoatRoughness: 0.5, textures: 'white_oak_veneer' }),
  // high-pressure laminate with a wood print
  P('wood-hpl-oak-gloss', 'wood', 'HPL 오크 무늬 유광', 'HPL oak effect, gloss', '#bf9a6c', 0.2, 0, { clearcoat: 0.9, clearcoatRoughness: 0.08, textures: 'oak_veneer_01' }),
  P('wood-hpl-walnut-matte', 'wood', 'HPL 월넛 무늬 무광', 'HPL walnut effect, matte', '#5f4231', 0.5, 0, { clearcoat: 0.2, clearcoatRoughness: 0.6, textures: 'american_walnut_veneer' }),
  // painted timber (the grain shows through the paint)
  P('wood-painted-sage', 'wood', '세이지 도장 원목', 'Painted wood, sage', '#9fae95', 0.5, 0, { textures: 'oak_veneer_01' }),
  P('wood-painted-navy', 'wood', '네이비 도장 원목', 'Painted wood, navy', '#2c3a52', 0.45, 0, { textures: 'oak_veneer_01' }),
  P('wood-painted-grey-blue', 'wood', '그레이 블루 도장 원목', 'Painted wood, grey blue', '#7f8f9c', 0.5, 0, { textures: 'oak_veneer_01' }),
  P('wood-painted-cream', 'wood', '크림 도장 원목', 'Painted wood, cream', '#ece2cc', 0.5, 0, { textures: 'oak_veneer_01' }),
  P('wood-painted-black', 'wood', '블랙 도장 원목(결 보임)', 'Painted wood, black (grain showing)', '#26231f', 0.45, 0, { textures: 'oak_veneer_01' }),
  // cork
  P('wood-cork', 'wood', '코르크', 'Cork', '#b08a5e', 0.9, 0, { pattern: { kind: 'plain', base: '#b48e60', size: 0.3, grain: 0.25, cloud: 0.25, cloudScale: 0.08, speckle: [['#7a5a38', 0.3, 0.0025], ['#d4b080', 0.2, 0.003]] } }),
  P('wood-cork-dark', 'wood', '다크 코르크', 'Cork, dark (baked)', '#5d4330', 0.9, 0, { pattern: { kind: 'plain', base: '#5f4532', size: 0.3, grain: 0.25, cloud: 0.25, cloudScale: 0.08, speckle: [['#3a291d', 0.3, 0.0025], ['#80603f', 0.2, 0.003]] } }),
  // woven natural fibres (basket weave of strands with fibres; dark gaps between them)
  P('wood-rattan-honey', 'wood', '라탄 허니', 'Rattan, honey', '#b07c3e', 0.7, 0, { pattern: weave('#b8823f', '#4a3018', 0.008, 3, 2) }),
  P('wood-rattan-dark', 'wood', '라탄 다크 브라운', 'Rattan, dark brown', '#5d3f26', 0.65, 0, { pattern: weave('#62422a', '#22170f', 0.008, 3, 2) }),
  P('wood-rattan-white', 'wood', '라탄 화이트 도장', 'Rattan, white painted', '#ece5d6', 0.65, 0, { pattern: weave('#efe8da', '#9c9284', 0.008, 3, 2) }),
  P('wood-cane-webbing', 'wood', '등나무 케인 웨빙', 'Cane webbing', '#b8996a', 0.6, 0, { pattern: { kind: 'diamond', w: 0.014, h: 0.014, colors: ['#2e241b'], grout: '#d6b67e', groutWidth: 0.0028, grain: 0.15, cover: 0.3, bump: 1.5 } }),
  P('wood-wicker-grey', 'wood', '위커 그레이', 'Wicker, grey', '#9a9188', 0.75, 0, { pattern: weave('#a0978d', '#433e38', 0.006, 4, 3) }),
  P('wood-seagrass', 'wood', '해초(시그라스) 짜임', 'Seagrass weave', '#a8a070', 0.8, 0, { pattern: weave('#aca474', '#4f4a2e', 0.01, 2, 3) }),
  P('wood-water-hyacinth', 'wood', '부레옥잠 짜임', 'Water hyacinth weave', '#8f7350', 0.85, 0, { pattern: weave('#957852', '#3a2c1c', 0.02, 2, 4) }),
  P('wood-bamboo-pole', 'wood', '대나무 줄기', 'Bamboo cane (pole)', '#c9b16d', 0.4, 0, { clearcoat: 0.4, clearcoatRoughness: 0.3 }),
];

// ───────────────────────── fabric: weave × colourway

/** [family id, ko, en, texture set, roughness, sheen, extras, [[colour id, ko, en, hex], …]] */
const FABRICS = [
  ['linen', '린넨', 'Linen', 'rough_linen', 0.9, 0.55, {}, [
    ['flax', '플랙스', 'flax', '#b9a88a'], ['oatmeal', '오트밀', 'oatmeal', '#cfc2a6'], ['sand', '샌드', 'sand', '#c8b490'], ['stone', '스톤', 'stone', '#a59c8e'],
    ['charcoal', '차콜', 'charcoal', '#4a4846'], ['sage', '세이지', 'sage', '#9aa58c'], ['dusty-blue', '더스티 블루', 'dusty blue', '#8fa1b3'], ['terracotta', '테라코타', 'terracotta', '#b8704e'],
    ['olive', '올리브', 'olive', '#6f6b45'], ['blush', '블러시 핑크', 'blush', '#d8b3a8']]],
  ['cotton', '면 포플린', 'Cotton poplin', 'stretch_poplin', 0.85, 0.4, {}, [
    ['navy', '네이비', 'navy', '#28344d'], ['sage', '세이지', 'sage', '#a3b09a'], ['sky', '스카이 블루', 'sky blue', '#a9c4dc'], ['blush', '블러시', 'blush', '#e5c3ba'],
    ['black', '블랙', 'black', '#1f1f21'], ['yellow', '버터 옐로', 'butter yellow', '#ecd88e']]],
  ['canvas', '캔버스(면 덕)', 'Cotton canvas', 'rough_linen', 0.92, 0.3, { textureSize: 0.16 }, [
    ['ecru', '에크루', 'ecru', '#e3d8c0'], ['olive', '올리브', 'olive', '#626346'], ['navy', '네이비', 'navy', '#2b3550'], ['black', '블랙', 'black', '#222223']]],
  ['burlap', '황마(버랩)', 'Burlap (jute)', 'hessian_230', 0.95, 0.2, {}, [
    ['natural', '내추럴', 'natural', '#a88a5c'], ['bleached', '표백', 'bleached', '#d8cbb0']]],
  ['wool', '울 플란넬', 'Wool flannel', 'caban', 0.95, 0.65, {}, [
    ['camel', '카멜', 'camel', '#b88d5e'], ['oatmeal', '오트밀', 'oatmeal', '#d2c4aa'], ['grey', '그레이 멜란지', 'grey melange', '#8e8c89'], ['burgundy', '버건디', 'burgundy', '#6b2430'],
    ['forest', '포레스트 그린', 'forest green', '#2f4a38'], ['ochre', '오커', 'ochre', '#b98a36']]],
  ['tweed', '울 헤링본·트위드', 'Wool herringbone tweed', 'poly_wool_herringbone', 0.95, 0.6, {}, [
    ['grey', '그레이', 'grey', '#8d8b88'], ['brown', '브라운', 'brown', '#7a5c44'], ['navy', '네이비', 'navy', '#2f3b55'], ['green', '그린', 'green', '#55614a'], ['oatmeal', '오트밀', 'oatmeal', '#c9bca2']]],
  ['boucle', '부클레', 'Bouclé', 'curly_teddy_natural', 1, 0.8, { textureSize: 0.18 }, [
    ['cream', '크림', 'cream', '#ece4d4'], ['oatmeal', '오트밀', 'oatmeal', '#d2c4aa'], ['grey', '그레이', 'grey', '#a9a6a1'], ['caramel', '캐러멜', 'caramel', '#b88a5c'],
    ['chocolate', '초콜릿', 'chocolate', '#5a3e2f'], ['sage', '세이지', 'sage', '#a5ae94']]],
  // wool_boucle is a checked blanket weave: a plaid, not a plain bouclé
  ['wool-check', '울 체크(플래드)', 'Wool check (plaid)', 'wool_boucle', 0.95, 0.7, {}, [
    ['cream', '크림', 'cream', '#d9cfbf'], ['grey', '그레이', 'grey', '#8f8c88'], ['caramel', '캐러멜', 'caramel', '#a87c52'], ['forest', '포레스트', 'forest', '#3c5544']]],
  ['sherpa', '셰르파(테디)', 'Sherpa (teddy)', 'curly_teddy_natural', 1, 0.85, {}, [
    ['white', '화이트', 'white', '#f1ede4'], ['camel', '카멜', 'camel', '#c39a6c']]],
  ['velvet', '벨벳', 'Velvet', 'velour_velvet', 0.75, 1, {}, [
    ['mustard', '머스터드', 'mustard', '#b98a26'], ['burgundy', '버건디', 'burgundy', '#5e1f2a'], ['plum', '플럼', 'plum', '#4f2a45'], ['teal', '틸', 'teal', '#1f5a5c'],
    ['charcoal', '차콜', 'charcoal', '#38383b'], ['blush', '블러시 핑크', 'blush pink', '#d6a9a3'], ['rust', '러스트', 'rust', '#9a4a2a'], ['olive', '올리브', 'olive', '#5d5c34'],
    ['champagne', '샴페인', 'champagne', '#d8c6a3'], ['black', '블랙', 'black', '#161617'], ['petrol', '페트롤 블루', 'petrol blue', '#1e4652']]],
  ['chenille', '셔닐', 'Chenille', 'velour_velvet', 0.85, 0.7, { textureSize: 0.45 }, [
    ['ivory', '아이보리', 'ivory', '#e9e1cf'], ['taupe', '토프', 'taupe', '#8f8273'], ['grey', '그레이', 'grey', '#9a9895'], ['blue', '스틸 블루', 'steel blue', '#5f7387']]],
  ['knit', '청키 니트', 'Chunky knit', 'knitted_fleece', 1, 0.6, {}, [
    ['cream', '크림', 'cream', '#e8e0cf'], ['grey', '그레이', 'grey', '#9d9b97'], ['mustard', '머스터드', 'mustard', '#c39a3c']]],
  ['corduroy', '코듀로이', 'Corduroy', 'ribbed_corduroy', 0.85, 0.8, {}, [
    ['tan', '탄', 'tan', '#b48a5c'], ['olive', '올리브', 'olive', '#626038'], ['rust', '러스트', 'rust', '#99502e'], ['navy', '네이비', 'navy', '#26324a'],
    ['cream', '크림', 'cream', '#e3d9c4'], ['brown', '브라운', 'brown', '#5c4130']]],
  ['denim', '데님', 'Denim', 'denim_fabric_03', 0.9, 0.3, {}, [
    ['indigo', '인디고', 'indigo', '#2c3d5e'], ['light', '라이트 워시', 'light wash', '#7f97b5'], ['black', '블랙', 'black', '#2a2b2e'], ['raw', '로(생지)', 'raw', '#1f2a40']]],
  ['satin', '실크 새틴', 'Silk satin', 'crepe_satin', 0.35, 1, {}, [
    ['champagne', '샴페인', 'champagne', '#e2cfa8'], ['ivory', '아이보리', 'ivory', '#efe7d5'], ['emerald', '에메랄드', 'emerald', '#1f5c45'], ['navy', '네이비', 'navy', '#1f2b48'],
    ['blush', '블러시', 'blush', '#e4bdb3'], ['gold', '골드', 'gold', '#c9a14a'], ['silver', '실버 그레이', 'silver grey', '#b7b8ba']]],
  ['jacquard', '자카드 다마스크', 'Jacquard damask', 'floral_jacquard', 0.75, 0.8, {}, [
    ['gold', '골드', 'gold', '#a88a4c'], ['blue', '블루', 'blue', '#34466e'], ['red', '레드', 'red', '#7a2a2a']]],
  ['faux-fur', '인조 모피', 'Faux fur', 'faux_fur_geometric', 1, 1, {}, [
    ['white', '화이트', 'white', '#efebe4'], ['grey', '그레이', 'grey', '#9c9a97'], ['mink', '밍크 브라운', 'mink brown', '#6b5546']]],
  ['sheepskin', '양털(시프스킨)', 'Sheepskin', 'curly_teddy_natural', 1, 0.9, { textureSize: 0.22 }, [
    ['natural', '내추럴', 'natural', '#e9dfc9'], ['grey', '그레이', 'grey', '#a8a49d']]],
  ['outdoor', '아웃도어 아크릴', 'Outdoor acrylic canvas', 'rough_linen', 0.85, 0.3, { textureSize: 0.2 }, [
    ['white', '화이트', 'white', '#eeece6'], ['navy', '네이비', 'navy', '#263450'], ['charcoal', '차콜', 'charcoal', '#46484b'], ['taupe', '토프', 'taupe', '#9a8e7e']]],
  ['felt', '울 펠트', 'Wool felt', 'polar_fleece', 1, 0.4, {}, [
    ['grey', '그레이', 'grey', '#8f8f8f'], ['charcoal', '차콜', 'charcoal', '#3d3e40'], ['red', '레드', 'red', '#a3302c'], ['natural', '내추럴', 'natural', '#d9cfbd']]],
];

/** Woven patterns drawn by patterns.js (colour = their average, used until the pattern is drawn). */
const cloth = { grain: 0.12, streak: 'x', bump: 0.6 };
const FABRIC_PATTERNS = [
  // stripes
  P('fabric-stripe-ticking', 'fabric', '티킹 스트라이프', 'Ticking stripe', '#b9b8b2', 0.9, 0, { sheen: 0.4, pattern: { kind: 'stripes', widths: [0.004, 0.016], colors: ['#2b3a55', '#ece6d6'], ...cloth } }),
  P('fabric-stripe-breton', 'fabric', '브르통 스트라이프', 'Breton stripe', '#a3a8b4', 0.88, 0, { sheen: 0.4, pattern: { kind: 'stripes', widths: [0.01, 0.02], colors: ['#26324e', '#f2f0ea'], dir: 'h', ...cloth } }),
  P('fabric-stripe-awning-green', 'fabric', '어닝 스트라이프 그린', 'Awning stripe, green', '#8faa98', 0.85, 0, { sheen: 0.3, pattern: { kind: 'stripes', widths: [0.06, 0.06], colors: ['#2f6a4f', '#eeece4'], ...cloth } }),
  P('fabric-stripe-awning-terracotta', 'fabric', '어닝 스트라이프 테라코타', 'Awning stripe, terracotta', '#d6a58e', 0.85, 0, { sheen: 0.3, pattern: { kind: 'stripes', widths: [0.06, 0.06], colors: ['#bd6a45', '#eeece4'], ...cloth } }),
  P('fabric-pinstripe-charcoal', 'fabric', '핀스트라이프 차콜', 'Pinstripe, charcoal', '#46474a', 0.92, 0, { sheen: 0.6, pattern: { kind: 'stripes', widths: [0.0015, 0.012], colors: ['#b9b9b6', '#3a3b3e'], ...cloth } }),
  // checks
  P('fabric-check-buffalo-red', 'fabric', '버펄로 체크 레드', 'Buffalo check, red', '#5f201d', 0.95, 0, { sheen: 0.6, pattern: { kind: 'grid', w: 0.05, checker: true, colors: ['#a3241f', '#1c1a1a'], ...cloth } }),
  P('fabric-check-buffalo-green', 'fabric', '버펄로 체크 그린', 'Buffalo check, green', '#26332a', 0.95, 0, { sheen: 0.6, pattern: { kind: 'grid', w: 0.05, checker: true, colors: ['#2f4a38', '#1c1c1c'], ...cloth } }),
  P('fabric-check-gingham-blue', 'fabric', '깅엄 체크 블루', 'Gingham, blue', '#b8c7da', 0.85, 0, { sheen: 0.4, pattern: { kind: 'grid', w: 0.008, checker: true, colors: ['#7d9cc4', '#f2f2ee'], ...cloth } }),
  P('fabric-check-gingham-red', 'fabric', '깅엄 체크 레드', 'Gingham, red', '#e0a3a0', 0.85, 0, { sheen: 0.4, pattern: { kind: 'grid', w: 0.008, checker: true, colors: ['#cc4b45', '#f2f0ec'], ...cloth } }),
  // prints & weaves
  P('fabric-polka-dot-navy', 'fabric', '폴카 도트 네이비', 'Polka dot, navy', '#3c4862', 0.85, 0, { sheen: 0.4, pattern: { kind: 'dots', spacing: 0.03, r: 0.005, base: '#26324e', colors: ['#f2f0ea'], grain: 0.08 } }),
  P('fabric-damask-cream', 'fabric', '다마스크 크림(톤온톤)', 'Damask, cream tone-on-tone', '#ddd2bb', 0.7, 0, { sheen: 0.8, pattern: { kind: 'damask', w: 0.22, h: 0.32, base: '#e6dcc6', ink: '#c9b994', grain: 0.06, bump: 0.4 } }),
  P('fabric-damask-teal', 'fabric', '다마스크 틸', 'Damask, teal', '#25575c', 0.7, 0, { sheen: 0.8, pattern: { kind: 'damask', w: 0.22, h: 0.32, base: '#1f4f55', ink: '#3a7a7f', grain: 0.06, bump: 0.4 } }),
  // open meshes (office chairs): dark holes in a strand lattice
  P('fabric-mesh-black', 'fabric', '메쉬 블랙(의자 등판)', 'Mesh, black (chair back)', '#1e1f21', 0.7, 0, { sheen: 0.3, pattern: { kind: 'grid', w: 0.003, colors: ['#0c0c0d'], grout: '#2c2d30', groutWidth: 0.0009, cover: 0.12, bump: 1.2 } }),
  P('fabric-mesh-grey', 'fabric', '메쉬 그레이', 'Mesh, grey', '#7c7e81', 0.7, 0, { sheen: 0.3, pattern: { kind: 'grid', w: 0.003, colors: ['#3a3b3d'], grout: '#9a9c9f', groutWidth: 0.0009, cover: 0.12, bump: 1.2 } }),
];

function fabrics() {
  const out = [];
  for (const [family, ko, en, textures, roughness, sheen, extra, colours] of FABRICS) {
    for (const [cid, cko, cen, color] of colours) {
      out.push(P(`fabric-${family}-${cid}`, 'fabric', `${ko} ${cko}`, `${en}, ${cen}`, color, roughness, 0, { sheen, textures, ...extra }));
    }
  }
  out.push(...FABRIC_PATTERNS);
  return out;
}

// ───────────────────────── leather: type × colourway

const LEATHER_COLOURS = {
  cognac: ['코냑', 'cognac', '#9a5a2e'], tan: ['탄', 'tan', '#b07a4a'], chestnut: ['체스트넛', 'chestnut', '#7a4128'], chocolate: ['초콜릿', 'chocolate', '#3f2a1f'],
  caramel: ['캐러멜', 'caramel', '#b6814a'], honey: ['허니', 'honey', '#c48b3f'], oxblood: ['옥스블러드', 'oxblood', '#5a1e1e'], olive: ['올리브', 'olive', '#5d5a3a'],
  navy: ['네이비', 'navy', '#23304a'], black: ['블랙', 'black', '#1b1a19'], white: ['화이트', 'white', '#e8e3da'], ivory: ['아이보리', 'ivory', '#ece4d4'],
  grey: ['그레이', 'grey', '#8a8885'], stone: ['스톤 그레이', 'stone grey', '#b5b0a6'], taupe: ['토프', 'taupe', '#8b7b6b'], sand: ['샌드', 'sand', '#cbb291'],
  burgundy: ['버건디', 'burgundy', '#6b2430'], forest: ['포레스트 그린', 'forest green', '#2f4a38'], mustard: ['머스터드', 'mustard', '#b8862e'], rust: ['러스트', 'rust', '#9a4a2a'],
  blush: ['블러시', 'blush', '#d3a79a'], teal: ['틸', 'teal', '#2d5b5e'], red: ['레드', 'red', '#9c2a24'], brown: ['브라운', 'brown', '#6a3f26'], natural: ['내추럴(베지터블)', 'natural veg-tan', '#c9965e'],
};

/** [type id, ko, en, texture set, roughness, extras, colour ids] */
const LEATHERS = [
  ['aniline', '아닐린 풀그레인', 'Full-grain aniline', 'brown_leather', 0.5, { clearcoat: 0.15, clearcoatRoughness: 0.6 },
    ['cognac', 'tan', 'chestnut', 'chocolate', 'caramel', 'honey', 'oxblood', 'olive', 'navy', 'black', 'rust', 'teal', 'burgundy']],
  ['semi-aniline', '세미 아닐린', 'Semi-aniline', 'fabric_leather_02', 0.45, { clearcoat: 0.3, clearcoatRoughness: 0.5 },
    ['cognac', 'chestnut', 'black', 'grey', 'taupe', 'burgundy', 'forest', 'navy', 'sand', 'ivory', 'mustard', 'rust']],
  ['topgrain', '탑그레인(안료 마감)', 'Top-grain, pigmented', 'leather_white', 0.4, { clearcoat: 0.4, clearcoatRoughness: 0.4 },
    ['white', 'ivory', 'black', 'grey', 'stone', 'red', 'navy', 'taupe', 'mustard', 'blush', 'teal']],
  ['nubuck', '누벅', 'Nubuck', 'scuba_suede', 0.9, { sheen: 0.5, textureSize: 0.5 },
    ['tan', 'grey', 'sand', 'navy', 'olive', 'chocolate', 'black', 'rust', 'taupe', 'burgundy']],
  ['suede', '스웨이드', 'Suede', 'scuba_suede', 0.95, { sheen: 0.75 },
    ['tan', 'caramel', 'grey', 'olive', 'navy', 'blush', 'rust', 'chocolate', 'black', 'sand', 'mustard', 'forest', 'burgundy', 'ivory']],
  ['patent', '에나멜(페이턴트)', 'Patent', 'leather_white', 0.08, { clearcoat: 1, clearcoatRoughness: 0.03 },
    ['black', 'white', 'red', 'burgundy', 'navy']],
  ['saddle', '새들 레더', 'Saddle leather', 'brown_leather', 0.35, { clearcoat: 0.5, clearcoatRoughness: 0.35 },
    ['tan', 'chestnut', 'natural', 'black', 'chocolate', 'honey']],
  ['pullup', '풀업(왁스) 레더', 'Pull-up (waxed) leather', 'fabric_leather_01', 0.4, { clearcoat: 0.35, clearcoatRoughness: 0.4 },
    ['cognac', 'chestnut', 'chocolate', 'olive', 'black', 'oxblood']],
  ['vintage', '빈티지 디스트레스', 'Distressed vintage', 'brown_leather', 0.62, { clearcoat: 0.1, clearcoatRoughness: 0.7, textureSize: 0.3 },
    ['cognac', 'brown', 'black', 'tan']],
  ['pebbled', '페블 그레인(엠보)', 'Pebbled grain', 'fabric_leather_01', 0.5, { clearcoat: 0.25, clearcoatRoughness: 0.5, textureSize: 0.3 },
    ['black', 'grey', 'navy', 'tan', 'white', 'red', 'olive']],
  // croc: random-bond scales with deep creases between them (patterns.js), no texture set
  ['croc', '크로커다일 엠보', 'Croc-embossed', null, 0.3, { clearcoat: 0.7, clearcoatRoughness: 0.2 },
    ['black', 'cognac', 'burgundy', 'white', 'forest']],
  ['faux', '인조가죽(PU)', 'Faux leather (PU)', 'fabric_leather_02', 0.35, { clearcoat: 0.5, clearcoatRoughness: 0.25 },
    ['black', 'white', 'grey', 'cognac', 'brown', 'navy', 'red', 'sand', 'olive', 'burgundy', 'taupe', 'chocolate']],
  ['vegan', '비건 레더(식물성)', 'Vegan leather (plant-based)', 'fabric_leather_02', 0.55, { clearcoat: 0.15, clearcoatRoughness: 0.6 },
    ['black', 'sand', 'olive']],
];

function leathers() {
  const out = [];
  for (const [type, ko, en, textures, roughness, extra, colours] of LEATHERS) {
    for (const c of colours) {
      const [cko, cen, color] = LEATHER_COLOURS[c];
      const surface = textures ? { textures } : { pattern: { kind: 'brick', w: 0.032, h: 0.024, offset: 'random', colors: [color], variation: 0.1, grout: shade(color, 0.55), groutWidth: 0.0016, grain: 0.05, cover: 0.4, bump: 1.6 } };
      out.push(P(`leather-${type}-${c}`, 'leather', `${ko} ${cko}`, `${en}, ${cen}`, color, roughness, 0, { ...surface, ...extra }));
    }
  }
  return out;
}

// ───────────────────────── paint: named colour × sheen

/** Sheen levels as paint makers sell them. */
const SHEEN = {
  flat: { ko: '완전 무광', en: 'flat', r: 0.92 },
  matte: { ko: '무광', en: 'matte', r: 0.8 },
  eggshell: { ko: '에그쉘', en: 'eggshell', r: 0.62 },
  satin: { ko: '반광(새틴)', en: 'satin', r: 0.45, cc: 0.2, ccr: 0.4 },
  semi: { ko: '반유광', en: 'semi-gloss', r: 0.3, cc: 0.45, ccr: 0.2 },
  gloss: { ko: '고광택 래커', en: 'high-gloss lacquer', r: 0.12, cc: 0.9, ccr: 0.05 },
};

/** [id, ko, en, hex, sheens] — descriptive names only (no paint-brand names). */
const PAINTS = [
  // whites
  ['pure-white', '퓨어 화이트', 'Pure white', '#f6f6f3', ['flat', 'semi']],
  ['warm-white', '웜 화이트', 'Warm white', '#f1ebdf', ['eggshell', 'satin']],
  ['chalk-white', '초크 화이트', 'Chalk white', '#efece4', ['matte']],
  ['cream', '크림', 'Cream', '#efe4cc', ['matte', 'gloss']],
  ['ivory', '아이보리', 'Ivory', '#f2ead6', ['eggshell']],
  ['cool-white', '쿨 화이트', 'Cool white', '#eef1f2', ['matte']],
  ['linen-white', '린넨 화이트', 'Linen white', '#ece4d6', ['matte']],
  ['alabaster', '알라바스터', 'Alabaster', '#ede7da', ['eggshell', 'semi']],
  // greys
  ['pale-grey', '페일 그레이', 'Pale grey', '#d9d9d6', ['matte']],
  ['dove-grey', '도브 그레이', 'Dove grey', '#bfbdb8', ['eggshell']],
  ['cool-grey', '쿨 그레이', 'Cool grey', '#a7adb1', ['matte']],
  ['warm-grey', '웜 그레이', 'Warm grey', '#a9a39a', ['matte']],
  ['pebble', '페블', 'Pebble', '#c2bcb2', ['eggshell']],
  ['slate-grey', '슬레이트 그레이', 'Slate grey', '#6b7177', ['matte', 'satin']],
  ['graphite', '그래파이트', 'Graphite', '#4a4a4c', ['matte', 'gloss']],
  ['charcoal', '차콜', 'Charcoal', '#3a3c3f', ['eggshell']],
  // greiges & beiges
  ['greige', '그레이지', 'Greige', '#b9b0a3', ['matte', 'eggshell']],
  ['mushroom', '머시룸', 'Mushroom', '#a99c8c', ['matte']],
  ['taupe', '토프', 'Taupe', '#8b7f73', ['eggshell']],
  ['stone', '스톤', 'Stone', '#c8beae', ['matte']],
  ['putty', '퍼티', 'Putty', '#c9bda4', ['eggshell']],
  ['sand', '샌드', 'Sand', '#d6c3a0', ['matte']],
  ['oatmeal', '오트밀', 'Oatmeal', '#ddd0b7', ['matte']],
  ['biscuit', '비스킷', 'Biscuit', '#d2b892', ['eggshell']],
  ['camel', '카멜', 'Camel', '#b8916a', ['satin']],
  // blues
  ['powder-blue', '파우더 블루', 'Powder blue', '#bdd0de', ['matte']],
  ['duck-egg', '덕에그 블루', 'Duck egg blue', '#b9cfc8', ['eggshell']],
  ['sky-blue', '스카이 블루', 'Sky blue', '#9fc0dc', ['matte']],
  ['denim-blue', '데님 블루', 'Denim blue', '#5b7a9a', ['eggshell']],
  ['slate-blue', '슬레이트 블루', 'Slate blue', '#6d7f93', ['matte']],
  ['navy', '네이비', 'Navy', '#22314a', ['matte', 'satin', 'gloss']],
  ['midnight', '미드나이트 블루', 'Midnight blue', '#1b2333', ['matte']],
  ['cobalt', '코발트', 'Cobalt', '#2f4f9a', ['satin']],
  ['teal', '틸', 'Teal', '#2f6f73', ['eggshell']],
  ['petrol', '페트롤 블루', 'Petrol blue', '#24505a', ['matte', 'gloss']],
  // greens
  ['mint', '민트', 'Mint', '#c4dfcf', ['matte']],
  ['eucalyptus', '유칼립투스', 'Eucalyptus', '#95ad9e', ['eggshell']],
  ['pistachio', '피스타치오', 'Pistachio', '#c7d3a3', ['matte']],
  ['olive', '올리브', 'Olive', '#6f6c45', ['matte', 'satin']],
  ['moss', '모스 그린', 'Moss green', '#5b6a3c', ['matte']],
  ['forest', '포레스트 그린', 'Forest green', '#2f4a38', ['eggshell', 'gloss']],
  ['emerald', '에메랄드', 'Emerald', '#1f6a4f', ['satin']],
  ['bottle-green', '보틀 그린', 'Bottle green', '#1e3b2e', ['matte']],
  // yellows
  ['pale-lemon', '페일 레몬', 'Pale lemon', '#f3eab0', ['matte']],
  ['buttercup', '버터컵 옐로', 'Buttercup yellow', '#f1d97a', ['eggshell']],
  ['ochre', '오커', 'Ochre', '#c9962e', ['matte']],
  ['mustard', '머스터드', 'Mustard', '#b88a2b', ['satin', 'gloss']],
  // terracottas, oranges
  ['peach', '피치', 'Peach', '#f0c3a3', ['matte']],
  ['apricot', '애프리콧', 'Apricot', '#e9a874', ['eggshell']],
  ['terracotta', '테라코타', 'Terracotta', '#c0694a', ['matte']],
  ['clay', '클레이', 'Clay', '#b98a6e', ['matte']],
  ['burnt-orange', '번트 오렌지', 'Burnt orange', '#c25a2a', ['eggshell']],
  ['rust', '러스트', 'Rust', '#9a4a2a', ['matte']],
  // pinks, reds
  ['blush', '블러시', 'Blush', '#e8c4bb', ['matte']],
  ['plaster-pink', '플라스터 핑크', 'Plaster pink', '#e6c2b2', ['flat']],
  ['dusty-pink', '더스티 핑크', 'Dusty pink', '#d3a5a0', ['eggshell']],
  ['rose', '로즈', 'Rose', '#c47a84', ['matte']],
  ['coral', '코럴', 'Coral', '#e57a64', ['satin']],
  ['cherry-red', '체리 레드', 'Cherry red', '#b52a2a', ['satin', 'gloss']],
  ['brick-red', '브릭 레드', 'Brick red', '#8f3a2c', ['matte']],
  ['oxblood', '옥스블러드', 'Oxblood', '#5a1e1e', ['eggshell', 'gloss']],
  // purples
  ['lavender', '라벤더', 'Lavender', '#c7bed8', ['matte']],
  ['lilac', '라일락', 'Lilac', '#b9a3c4', ['eggshell']],
  ['mauve', '모브', 'Mauve', '#a68a9a', ['matte']],
  ['aubergine', '오버진(가지색)', 'Aubergine', '#4a2a3a', ['matte', 'gloss']],
  // darks
  ['off-black', '오프 블랙', 'Off-black', '#222222', ['flat', 'semi', 'gloss']],
  ['deep-brown', '딥 브라운', 'Deep brown', '#3d2c24', ['eggshell']],
];

function paints() {
  const out = [];
  for (const [id, ko, en, color, sheens] of PAINTS) {
    for (const s of sheens) {
      const f = SHEEN[s];
      const extra = f.cc ? { clearcoat: f.cc, clearcoatRoughness: f.ccr } : {};
      out.push(P(`paint-${id}-${s}`, 'paint', `${ko} ${f.ko}`, `${en}, ${f.en}`, color, f.r, 0, extra));
    }
  }
  return out;
}

const PAINT_SPECIALTY = [
  // chalk paint (furniture upcycling): very flat, powdery
  P('paint-chalk-white', 'paint', '초크 페인트 화이트', 'Chalk paint, white', '#efebe2', 0.97),
  P('paint-chalk-duck-egg', 'paint', '초크 페인트 덕에그', 'Chalk paint, duck egg', '#a9c4bc', 0.97),
  P('paint-chalk-grey', 'paint', '초크 페인트 그레이', 'Chalk paint, grey', '#a3a19b', 0.97),
  P('paint-chalk-sage', 'paint', '초크 페인트 세이지', 'Chalk paint, sage', '#a4ad91', 0.97),
  P('paint-chalk-black', 'paint', '초크 페인트 블랙', 'Chalk paint, black', '#2b2a29', 0.97),
  // metallic paint
  P('paint-metallic-gold', 'paint', '메탈릭 페인트 골드', 'Metallic paint, gold', '#c6a35a', 0.4, 0.7, { clearcoat: 0.3, clearcoatRoughness: 0.3 }),
  P('paint-metallic-silver', 'paint', '메탈릭 페인트 실버', 'Metallic paint, silver', '#b9bbbd', 0.4, 0.7, { clearcoat: 0.3, clearcoatRoughness: 0.3 }),
  P('paint-metallic-bronze', 'paint', '메탈릭 페인트 브론즈', 'Metallic paint, bronze', '#8c6a43', 0.4, 0.7, { clearcoat: 0.3, clearcoatRoughness: 0.3 }),
  P('paint-metallic-copper', 'paint', '메탈릭 페인트 코퍼', 'Metallic paint, copper', '#b0704a', 0.4, 0.7, { clearcoat: 0.3, clearcoatRoughness: 0.3 }),
  P('paint-pearl-white', 'paint', '펄 화이트', 'Pearl white', '#f1eee8', 0.3, 0.25, { clearcoat: 0.8, clearcoatRoughness: 0.1, sheen: 0.4, sheenColor: '#e6e9f5' }),
  P('paint-car-metallic-grey', 'paint', '자동차 메탈릭 그레이', 'Automotive metallic grey', '#6a6d71', 0.35, 0.6, { clearcoat: 1, clearcoatRoughness: 0.04 }),
  // functional coatings
  P('paint-chalkboard-black', 'paint', '칠판 페인트 블랙', 'Chalkboard paint, black', '#2a2c2c', 0.95),
  P('paint-chalkboard-green', 'paint', '칠판 페인트 그린', 'Chalkboard paint, green', '#2f4a3c', 0.95),
  P('paint-magnetic', 'paint', '자석 페인트(하도)', 'Magnetic primer', '#55575a', 0.85),
  P('paint-whiteboard', 'paint', '화이트보드 페인트', 'Whiteboard (dry-erase) paint', '#f6f6f4', 0.1, 0, { clearcoat: 1, clearcoatRoughness: 0.05 }),
  // textured
  P('paint-textured-sand', 'paint', '샌드 텍스처 페인트', 'Sand-textured paint', '#ddd3c2', 0.95, 0, { textures: 'plastered_wall', textureSize: 0.8 }),
  P('paint-textured-white', 'paint', '텍스처 페인트 화이트', 'Textured paint, white', '#efede7', 0.95, 0, { textures: 'plastered_wall', textureSize: 0.8 }),
  P('paint-textured-grey', 'paint', '텍스처 페인트 그레이', 'Textured paint, grey', '#b3b0aa', 0.95, 0, { textures: 'plastered_wall', textureSize: 0.8 }),
  P('paint-hammered-black', 'paint', '해머톤 블랙', 'Hammered finish, black', '#2a2b2d', 0.45, 0.4, { textures: 'grey_plaster_02', textureSize: 0.3 }),
];

// ───────────────────────── plastic

const glossy = (cc = 0.3) => ({ clearcoat: cc, clearcoatRoughness: 0.15 });
const clear = (opacity = 0.3, extra = {}) => ({ transmission: 1, ior: 1.49, thickness: 0.006, opacity, transparent: true, ...extra });

const PLASTICS = [
  // ABS, glossy (appliances, toys, housings)
  ...[['white', '화이트', 'white', '#f3f3f1'], ['black', '블랙', 'black', '#161617'], ['red', '레드', 'red', '#c22a26'], ['yellow', '옐로', 'yellow', '#f0c419'],
    ['blue', '블루', 'blue', '#1f5bb4'], ['green', '그린', 'green', '#2e8b4e'], ['orange', '오렌지', 'orange', '#e8721f'], ['grey', '그레이', 'grey', '#9a9c9f'],
    ['pink', '핑크', 'pink', '#ef9fb5'], ['mint', '민트', 'mint', '#a9dcc6'], ['sky', '스카이 블루', 'sky blue', '#8fc0e6'], ['purple', '퍼플', 'purple', '#6a4a9c']]
    .map(([id, ko, en, c]) => P(`plastic-abs-gloss-${id}`, 'plastic', `ABS 유광 ${ko}`, `ABS gloss, ${en}`, c, 0.25, 0, glossy())),
  // ABS, matte textured
  ...[['white', '화이트', 'white', '#ecebe7'], ['black', '블랙', 'black', '#1e1e1f'], ['grey', '그레이', 'grey', '#8c8e91'], ['beige', '베이지', 'beige', '#d8cdb8'], ['anthracite', '앤트러사이트', 'anthracite', '#3b3d40']]
    .map(([id, ko, en, c]) => P(`plastic-abs-matte-${id}`, 'plastic', `ABS 무광(엠보) ${ko}`, `ABS matte textured, ${en}`, c, 0.6)),
  // polypropylene (stacking chairs, storage boxes)
  ...[['white', '화이트', 'white', '#f1f0ec'], ['black', '블랙', 'black', '#1d1d1e'], ['sage', '세이지', 'sage', '#a3b09a'], ['terracotta', '테라코타', 'terracotta', '#c0694a'],
    ['mustard', '머스터드', 'mustard', '#c99a2e'], ['light-grey', '라이트 그레이', 'light grey', '#c6c6c3'], ['navy', '네이비', 'navy', '#26324a'], ['pink', '파우더 핑크', 'powder pink', '#e8bfbf'],
    ['dusty-blue', '더스티 블루', 'dusty blue', '#8ea2b5'], ['olive', '올리브', 'olive', '#6f6c45'], ['red', '레드', 'red', '#b52a2a']]
    .map(([id, ko, en, c]) => P(`plastic-pp-${id}`, 'plastic', `폴리프로필렌(PP) ${ko}`, `Polypropylene, ${en}`, c, 0.45)),
  // polyethylene (rotomoulded outdoor furniture, planters)
  ...[['white', '화이트', 'white', '#efeeea'], ['sand', '샌드', 'sand', '#cdbd9e'], ['anthracite', '앤트러사이트', 'anthracite', '#3a3c3e'], ['olive', '올리브', 'olive', '#62623e'], ['orange', '오렌지', 'orange', '#e0702a']]
    .map(([id, ko, en, c]) => P(`plastic-pe-${id}`, 'plastic', `폴리에틸렌(PE) ${ko}`, `Polyethylene (rotomoulded), ${en}`, c, 0.65)),
  P('plastic-hdpe-board', 'plastic', 'HDPE 도마(화이트)', 'HDPE cutting board, white', '#f3f3ef', 0.55),
  // acrylic (PMMA)
  P('plastic-acrylic-clear', 'plastic', '투명 아크릴', 'Acrylic, clear', '#ffffff', 0.02, 0, clear(0.22)),
  P('plastic-acrylic-frosted', 'plastic', '반투명 아크릴(프로스트)', 'Acrylic, frosted', '#f3f5f6', 0.4, 0, clear(0.6, { transmission: 0.85 })),
  P('plastic-acrylic-smoke', 'plastic', '스모크 아크릴', 'Acrylic, smoke', '#4f5356', 0.03, 0, clear(0.5, { transmission: 0.8 })),
  P('plastic-acrylic-bronze', 'plastic', '브론즈 아크릴', 'Acrylic, bronze tint', '#8a6a4a', 0.03, 0, clear(0.45, { transmission: 0.85 })),
  P('plastic-acrylic-blue', 'plastic', '블루 틴트 아크릴', 'Acrylic, blue tint', '#6f9fd0', 0.03, 0, clear(0.4, { transmission: 0.9 })),
  P('plastic-acrylic-pink', 'plastic', '핑크 틴트 아크릴', 'Acrylic, pink tint', '#e9a2bd', 0.03, 0, clear(0.4, { transmission: 0.9 })),
  P('plastic-acrylic-amber', 'plastic', '앰버 아크릴', 'Acrylic, amber', '#d9922e', 0.03, 0, clear(0.45, { transmission: 0.88 })),
  P('plastic-acrylic-opal', 'plastic', '유백 아크릴(조명 확산판)', 'Acrylic, opal (light diffuser)', '#f6f5f2', 0.3, 0, clear(0.85, { transmission: 0.45 })),
  P('plastic-acrylic-mirror-silver', 'plastic', '미러 아크릴 실버', 'Mirror acrylic, silver', '#e6e8ea', 0.05, 1),
  P('plastic-acrylic-mirror-gold', 'plastic', '미러 아크릴 골드', 'Mirror acrylic, gold', '#e0be6a', 0.05, 1),
  P('plastic-acrylic-red', 'plastic', '아크릴 레드(불투명)', 'Acrylic, opaque red', '#b8201e', 0.06, 0, { clearcoat: 1, clearcoatRoughness: 0.03 }),
  P('plastic-acrylic-black', 'plastic', '아크릴 블랙(불투명)', 'Acrylic, opaque black', '#0f0f10', 0.05, 0, { clearcoat: 1, clearcoatRoughness: 0.03 }),
  P('plastic-acrylic-white', 'plastic', '아크릴 화이트(불투명)', 'Acrylic, opaque white', '#f7f7f5', 0.06, 0, { clearcoat: 1, clearcoatRoughness: 0.03 }),
  // polycarbonate
  P('plastic-pc-clear', 'plastic', '폴리카보네이트 투명', 'Polycarbonate, clear', '#fbfcfc', 0.04, 0, clear(0.25, { ior: 1.58 })),
  P('plastic-pc-twinwall', 'plastic', '폴리카보네이트 복층판', 'Polycarbonate twin-wall sheet', '#eef1f2', 0.35, 0, clear(0.65, { transmission: 0.7, ior: 1.58 })),
  P('plastic-pc-smoke', 'plastic', '폴리카보네이트 스모크', 'Polycarbonate, smoke', '#5a5f62', 0.05, 0, clear(0.5, { transmission: 0.75, ior: 1.58 })),
  P('plastic-pc-bronze', 'plastic', '폴리카보네이트 브론즈', 'Polycarbonate, bronze', '#86684a', 0.05, 0, clear(0.5, { transmission: 0.75, ior: 1.58 })),
  // PVC
  P('plastic-pvc-white', 'plastic', 'PVC 화이트(창틀)', 'PVC white (window frame)', '#f2f2ef', 0.4, 0, glossy(0.15)),
  P('plastic-pvc-anthracite', 'plastic', 'PVC 앤트러사이트(창틀)', 'PVC anthracite (window frame)', '#383a3d', 0.5),
  P('plastic-pvc-pipe', 'plastic', 'PVC 배관 그레이', 'PVC pipe, grey', '#8f9399', 0.45),
  P('plastic-pvc-clear', 'plastic', '투명 연질 PVC', 'Clear soft PVC', '#f4f7f6', 0.1, 0, clear(0.35, { transmission: 0.8, ior: 1.54 })),
  // nylon
  P('plastic-nylon-natural', 'plastic', '나일론 내추럴', 'Nylon, natural', '#ece8dc', 0.5),
  P('plastic-nylon-black', 'plastic', '나일론 블랙', 'Nylon, black', '#1c1c1d', 0.5),
  P('plastic-nylon-grey', 'plastic', '나일론 그레이(유리섬유 강화)', 'Nylon, grey (glass-filled)', '#7d7f82', 0.55),
  // silicone & rubber
  ...[['white', '화이트', 'white', '#efeeeb'], ['grey', '그레이', 'grey', '#a6a7a8'], ['sage', '세이지', 'sage', '#a5b39d'], ['pink', '핑크', 'pink', '#e5b3b8'], ['black', '블랙', 'black', '#232324']]
    .map(([id, ko, en, c]) => P(`plastic-silicone-${id}`, 'plastic', `실리콘 ${ko}`, `Silicone, ${en}`, c, 0.6, 0, { sheen: 0.3 })),
  P('plastic-silicone-clear', 'plastic', '투명 실리콘', 'Silicone, translucent', '#f2f2ee', 0.3, 0, clear(0.55, { transmission: 0.75, ior: 1.42 })),
  P('plastic-rubber-gum', 'plastic', '생고무(검 러버)', 'Gum rubber', '#b7864c', 0.85),
  P('plastic-rubber-red', 'plastic', '고무 레드', 'Rubber, red', '#a3302c', 0.85),
  P('plastic-rubber-grey', 'plastic', '고무 그레이', 'Rubber, grey', '#8a8b8c', 0.88),
  P('plastic-rubber-dark-grey', 'plastic', '고무 다크 그레이', 'Rubber, dark grey', '#45474a', 0.88),
  P('plastic-rubber-green', 'plastic', '고무 그린', 'Rubber, green', '#3f6a45', 0.85),
  P('plastic-rubber-blue', 'plastic', '고무 블루', 'Rubber, blue', '#2f5a8a', 0.85),
  P('plastic-neoprene-black', 'plastic', '네오프렌 블랙', 'Neoprene, black', '#1f2022', 0.9, 0, { sheen: 0.3, textures: 'scuba_suede' }),
  P('plastic-neoprene-navy', 'plastic', '네오프렌 네이비', 'Neoprene, navy', '#23304a', 0.9, 0, { sheen: 0.3, textures: 'scuba_suede' }),
  // resin
  P('plastic-epoxy-clear', 'plastic', '에폭시 레진 투명', 'Epoxy resin, clear', '#fbfaf5', 0.03, 0, clear(0.3, { ior: 1.55, thickness: 0.02 })),
  P('plastic-epoxy-amber', 'plastic', '에폭시 레진 앰버', 'Epoxy resin, amber', '#c47a2a', 0.03, 0, clear(0.55, { transmission: 0.85, ior: 1.55, thickness: 0.02 })),
  P('plastic-epoxy-blue', 'plastic', '에폭시 레진 블루(리버 테이블)', 'Epoxy resin, blue (river table)', '#2f7aa8', 0.03, 0, clear(0.6, { transmission: 0.8, ior: 1.55, thickness: 0.02 })),
  P('plastic-resin-terrazzo', 'plastic', '레진 테라조', 'Resin terrazzo', '#e2d9cf', 0.15, 0, { clearcoat: 0.6, clearcoatRoughness: 0.1, pattern: { kind: 'terrazzo', base: '#efece6', size: 0.5, chips: [['#e07a5f', 0.01, 0.03, 300], ['#3d405b', 0.008, 0.02, 300], ['#f2cc8f', 0.01, 0.025, 200]] } }),
  P('plastic-resin-black', 'plastic', '레진 블랙', 'Cast resin, black', '#121213', 0.1, 0, { clearcoat: 0.9, clearcoatRoughness: 0.05 }),
  P('plastic-resin-white', 'plastic', '레진 화이트', 'Cast resin, white', '#f2f1ec', 0.12, 0, { clearcoat: 0.9, clearcoatRoughness: 0.05 }),
  P('plastic-resin-jade', 'plastic', '레진 제이드', 'Cast resin, jade', '#7fae95', 0.08, 0, clear(0.75, { transmission: 0.5, ior: 1.55, thickness: 0.03 })),
  // high-pressure laminate, solid colours
  ...[['white', '화이트', 'white', '#f3f2ee'], ['black', '블랙', 'black', '#1b1b1c'], ['anthracite', '앤트러사이트', 'anthracite', '#3a3c3f'], ['light-grey', '라이트 그레이', 'light grey', '#c8c8c5'],
    ['red', '레드', 'red', '#a52a26'], ['yellow', '옐로', 'yellow', '#e3b524'], ['petrol', '페트롤', 'petrol', '#24505a'], ['olive', '올리브', 'olive', '#6a6a45']]
    .map(([id, ko, en, c]) => P(`plastic-hpl-${id}`, 'plastic', `HPL 무광 ${ko}`, `HPL matte, ${en}`, c, 0.45, 0, { clearcoat: 0.1, clearcoatRoughness: 0.6 })),
  P('plastic-hpl-gloss-white', 'plastic', 'HPL 유광 화이트', 'HPL gloss, white', '#f5f5f2', 0.15, 0, { clearcoat: 0.9, clearcoatRoughness: 0.06 }),
  P('plastic-hpl-gloss-black', 'plastic', 'HPL 유광 블랙', 'HPL gloss, black', '#151516', 0.15, 0, { clearcoat: 0.9, clearcoatRoughness: 0.06 }),
  // solid surface (acrylic-based countertops)
  P('plastic-solid-surface-glacier', 'plastic', '인조대리석 글레이셔 화이트', 'Solid surface, glacier white', '#f4f4f1', 0.25, 0, { clearcoat: 0.3, clearcoatRoughness: 0.2 }),
  P('plastic-solid-surface-cameo', 'plastic', '인조대리석 카메오 화이트', 'Solid surface, cameo white', '#f0ebe1', 0.25, 0, { clearcoat: 0.3, clearcoatRoughness: 0.2 }),
  P('plastic-solid-surface-grey', 'plastic', '인조대리석 그레이', 'Solid surface, grey', '#a8a8a5', 0.25, 0, { clearcoat: 0.3, clearcoatRoughness: 0.2 }),
  P('plastic-solid-surface-black', 'plastic', '인조대리석 딥 블랙', 'Solid surface, deep black', '#1c1c1d', 0.25, 0, { clearcoat: 0.3, clearcoatRoughness: 0.2 }),
  P('plastic-solid-surface-speckled', 'plastic', '인조대리석 스페클', 'Solid surface, speckled', '#e2ded6', 0.25, 0, { clearcoat: 0.3, clearcoatRoughness: 0.2, pattern: { kind: 'plain', base: '#e9e6df', size: 0.4, cloud: 0.05, speckle: [['#9a958c', 0.08, 0.0015], ['#5a5650', 0.04, 0.0015]] } }),
  // recycled plastic sheet (speckled)
  P('plastic-recycled-confetti', 'plastic', '재생 플라스틱 컨페티', 'Recycled plastic, confetti', '#d9d3c8', 0.5, 0, { pattern: { kind: 'plain', base: '#e6e1d8', size: 0.4, speckle: [['#d9473a', 0.05, 0.007], ['#2f6fb0', 0.05, 0.007], ['#f0c419', 0.04, 0.007], ['#3a9a5a', 0.04, 0.007]] } }),
  P('plastic-recycled-black-white', 'plastic', '재생 플라스틱 블랙·화이트', 'Recycled plastic, black & white', '#5a5a59', 0.5, 0, { pattern: { kind: 'plain', base: '#1d1d1d', size: 0.4, speckle: [['#f2f2f0', 0.2, 0.006], ['#9a9a98', 0.1, 0.004]] } }),
  P('plastic-recycled-ocean', 'plastic', '재생 플라스틱 오션 블루', 'Recycled plastic, ocean blue', '#4f7fa0', 0.5, 0, { pattern: { kind: 'plain', base: '#2f5f86', size: 0.4, speckle: [['#9fd0e6', 0.14, 0.006], ['#ffffff', 0.07, 0.005], ['#14324a', 0.14, 0.006]] } }),
  P('plastic-recycled-green', 'plastic', '재생 플라스틱 그린', 'Recycled plastic, green', '#6f9a6a', 0.5, 0, { pattern: { kind: 'plain', base: '#5f8a5c', size: 0.4, speckle: [['#b9d6a0', 0.14, 0.006], ['#f2f0e6', 0.06, 0.005], ['#2f4a30', 0.14, 0.006]] } }),
  // others
  P('plastic-fibreglass-white', 'plastic', 'FRP(유리섬유) 화이트', 'Fibreglass (GRP), white', '#f1f0eb', 0.2, 0, { clearcoat: 0.8, clearcoatRoughness: 0.08 }),
  P('plastic-fibreglass-grey', 'plastic', 'FRP(유리섬유) 그레이', 'Fibreglass (GRP), grey', '#9ea0a1', 0.3, 0, { clearcoat: 0.6, clearcoatRoughness: 0.12 }),
  P('plastic-bakelite-brown', 'plastic', '베이클라이트 브라운', 'Bakelite, brown', '#4a2a1a', 0.2, 0, { clearcoat: 0.7, clearcoatRoughness: 0.1 }),
  P('plastic-bakelite-black', 'plastic', '베이클라이트 블랙', 'Bakelite, black', '#141212', 0.2, 0, { clearcoat: 0.7, clearcoatRoughness: 0.1 }),
  P('plastic-pu-foam', 'plastic', '폴리우레탄 폼', 'Polyurethane foam', '#d9cfae', 1),
  P('plastic-pet-blue', 'plastic', 'PET 투명 블루', 'PET, clear blue', '#a9cde6', 0.03, 0, clear(0.35, { ior: 1.57 })),
  P('plastic-pla-white', 'plastic', 'PLA(3D 프린팅) 화이트', 'PLA (3D print), white', '#f0efea', 0.5),
  P('plastic-pla-orange', 'plastic', 'PLA(3D 프린팅) 오렌지', 'PLA (3D print), orange', '#ea7a24', 0.5),
  P('plastic-pla-grey', 'plastic', 'PLA(3D 프린팅) 그레이', 'PLA (3D print), grey', '#8c8f92', 0.5),
];

/** All soft presets (MATERIAL_PRESETS spreads these after its own). */
export const SOFT_MATERIAL_PRESETS = [
  ...woodSpecies(), ...WOOD_BOARDS,
  ...fabrics(),
  ...leathers(),
  ...paints(), ...PAINT_SPECIALTY,
  ...PLASTICS,
];
