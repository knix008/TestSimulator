// Architectural material presets that MATERIAL_PRESETS (materials.js) adds to its own list: flooring,
// tile, stone, wall finishes and carpet & rugs. Same shape as materials.js presets (id, category, ko, en,
// colour, roughness, metalness, physical extras, `repeat` m per tile, `textures` = a Poly Haven set
// fetched by `npm run assets` and tinted by the colour) plus `pattern` — a procedural layout drawn by
// engine/patterns.js (tiles with grout, parquet, terrazzo, wallpaper, rugs, marble veins …).
//
// Families are tables of real products and colourways (a Calacatta Viola, a zellige in teal, a Heriz rug),
// so each entry is a different material rather than a tint of one.
import { mixHex, shade } from './patterns.js';

const P = (id, category, ko, en, color, roughness, metalness = 0, extra = {}) => ({ id, category, ko, en, color, roughness, metalness, repeat: 1, ...extra });
const GLAZE = { clearcoat: 0.6, clearcoatRoughness: 0.12 };
const POLISH = { clearcoat: 0.45, clearcoatRoughness: 0.08 };

// ═════════════════════════ flooring

// Solid / engineered wood planks: species × finish. The set gives the plank layout and grain; the colour tints it.
const SPECIES = [
  ['white-oak', '화이트 오크', 'White oak', '#c9a77c', 'oak_wood_planks'],
  ['smoked-oak', '훈증 오크', 'Smoked oak', '#6f5038', 'oak_wood_planks'],
  ['limed-oak', '라임 워시 오크', 'Limed oak', '#d8cbb4', 'white_planks_clean'],
  ['grey-oak', '그레이 워시 오크', 'Grey-washed oak', '#a69c8f', 'white_planks_clean'],
  ['rustic-oak', '러스틱 오크', 'Rustic oak', '#9c7448', 'plank_flooring_02'],
  ['maple', '메이플', 'Maple', '#dcbf93', 'wood_floor'],
  ['ash', '애쉬', 'Ash', '#d6c09a', 'laminate_floor_02'],
  ['hickory', '히코리', 'Hickory', '#b98a5c', 'plank_flooring_02'],
  ['cherry', '체리', 'Cherry', '#9b5a3a', 'wood_floor'],
  ['teak', '티크', 'Teak', '#9a6a3c', 'oak_wood_planks'],
  ['jatoba', '자토바', 'Jatoba', '#8a4a2c', 'wood_floor'],
  ['merbau', '멀바우', 'Merbau', '#74402a', 'dark_wooden_planks'],
  ['wenge', '웬지', 'Wenge', '#3d2b20', 'dark_wooden_planks'],
  ['douglas-fir', '더글러스 퍼', 'Douglas fir', '#c9925e', 'plank_flooring_02'],
];
const FINISHES = [
  ['oil', '오일 마감', 'oiled', 0.62, {}],
  ['lacquer', '우레탄 코팅', 'lacquered', 0.38, { clearcoat: 0.25, clearcoatRoughness: 0.3 }],
];
const woodPlanks = SPECIES.flatMap(([key, ko, en, color, textures]) => FINISHES.map(([fk, fko, fen, rough, extra]) =>
  P(`floor-plank-${key}-${fk}`, 'floor', `${ko} 마루(${fko})`, `${en} planks, ${fen}`, fk === 'lacquer' ? shade(color, 0.95) : color, rough, 0, { textures, ...extra })));

// Parquet from photographed sets.
const parquetSets = [
  ['herringbone-oak-natural', '헤링본 오크 내추럴', 'Herringbone oak, natural', '#b8915f', 'herringbone_parquet'],
  ['herringbone-white-oak', '헤링본 화이트 오크', 'Herringbone white oak', '#d2bb98', 'herringbone_parquet'],
  ['herringbone-smoked', '헤링본 스모크 오크', 'Herringbone smoked oak', '#6b4d36', 'herringbone_parquet'],
  ['herringbone-walnut', '헤링본 월넛', 'Herringbone walnut', '#5e3f2b', 'herringbone_parquet'],
  ['herringbone-grey', '헤링본 그레이', 'Herringbone grey oak', '#958c80', 'herringbone_parquet'],
  ['diagonal-oak', '사선 쪽매 오크', 'Diagonal parquet, oak', '#ad8355', 'diagonal_parquet'],
  ['diagonal-cherry', '사선 쪽매 체리', 'Diagonal parquet, cherry', '#8e5236', 'diagonal_parquet'],
  ['diagonal-honey', '사선 쪽매 허니', 'Diagonal parquet, honey', '#c49255', 'diagonal_parquet'],
  ['rectangular-oak', '직사각 쪽매 오크', 'Ladder parquet, oak', '#b58c5c', 'rectangular_parquet'],
  ['rectangular-beech', '직사각 쪽매 너도밤나무', 'Ladder parquet, beech', '#cf9f70', 'rectangular_parquet'],
  ['rectangular-dark', '직사각 쪽매 다크', 'Ladder parquet, dark', '#4f3627', 'rectangular_parquet'],
].map(([key, ko, en, color, textures]) => P(`floor-parquet-${key}`, 'floor', ko, en, color, 0.5, 0, { textures }));

// Parquet layouts drawn procedurally (each slat its own shade).
const woodTone = (base) => [shade(base, 0.9), base, shade(base, 1.08), mixHex(base, '#c9a070', 0.15)];
const parquetPatterns = [
  ['chevron-oak', '쉐브론 오크', 'Chevron parquet, oak', '#b8905f', { kind: 'chevron', w: 0.09 * 1.4142, h: 0.09 * 1.4142 * 1.0, angle: 45 }],
  ['chevron-natural', '쉐브론 내추럴 애쉬', 'Chevron parquet, ash', '#d3bb94', { kind: 'chevron', w: 0.4, h: 0.1 }],
  ['chevron-walnut', '쉐브론 월넛', 'Chevron parquet, walnut', '#5f402c', { kind: 'chevron', w: 0.4, h: 0.1 }],
  ['chevron-smoked', '쉐브론 스모크 오크', 'Chevron parquet, smoked oak', '#6e5039', { kind: 'chevron', w: 0.45, h: 0.12 }],
  ['basket-oak', '바스켓위브 오크', 'Basket-weave parquet, oak', '#b48b5d', { kind: 'basketweave', w: 0.07, n: 4 }],
  ['basket-two-tone', '바스켓위브 투톤', 'Basket-weave parquet, two-tone', '#9c7a58', { kind: 'basketweave', w: 0.07, n: 3, colors: ['#c9a77c', '#6b4b33'] }],
  ['basket-walnut', '바스켓위브 월넛', 'Basket-weave parquet, walnut', '#634430', { kind: 'basketweave', w: 0.06, n: 4 }],
  ['herringbone-two-tone', '헤링본 투톤', 'Herringbone, two-tone', '#94735a', { kind: 'herringbone', w: 0.42, h: 0.07, checker: true, colors: ['#cdb08a', '#5d4130'] }],
  ['herringbone-wide', '와이드 헤링본 오크', 'Wide herringbone, oak', '#b28a5d', { kind: 'herringbone', w: 0.72, h: 0.12 }],
].map(([key, ko, en, color, pattern]) => P(`floor-parquet-${key}`, 'floor', ko, en, color, 0.5, 0, {
  pattern: { colors: woodTone(color), grout: shade(color, 0.55), groutWidth: 0.0012, variation: 0.06, grain: 0.18, cloud: 0.2, cloudScale: 0.1, bump: 0.6, ...pattern },
}));

// Korean floors: 강마루 (engineered, HPL top), 강화마루 (laminate), 장판 (vinyl sheet), 데코타일 (LVT).
const koreanFloors = [
  ['kang-oak', '강마루 오크', 'Kang-maru engineered oak', '#c1a079', 'laminate_floor_02', 0.4],
  ['kang-walnut', '강마루 월넛', 'Kang-maru engineered walnut', '#6a4834', 'laminate_floor', 0.4],
  ['kang-white', '강마루 화이트 워시', 'Kang-maru white wash', '#ddd2c2', 'laminate_floor_02', 0.4],
  ['kang-grey', '강마루 그레이', 'Kang-maru grey', '#a49d94', 'laminate_floor_03', 0.4],
  ['kang-natural', '강마루 내추럴 티크', 'Kang-maru natural teak', '#a77a4c', 'laminate_floor', 0.4],
  ['laminate-oak', '강화마루 오크', 'Laminate, oak', '#bc9a72', 'laminate_floor_02', 0.45],
  ['laminate-beige', '강화마루 베이지', 'Laminate, beige', '#cdb796', 'laminate_floor_03', 0.45],
  ['laminate-dark', '강화마루 다크 브라운', 'Laminate, dark brown', '#4f382a', 'laminate_floor', 0.45],
  ['laminate-ash-grey', '강화마루 애쉬 그레이', 'Laminate, ash grey', '#b5aea4', 'laminate_floor_03', 0.45],
  ['laminate-cherry', '강화마루 체리', 'Laminate, cherry', '#8f553a', 'laminate_floor', 0.45],
  ['jangpan-beige', '장판 베이지 우드', 'Vinyl sheet (jangpan), beige wood', '#d2b893', 'laminate_floor_02', 0.55],
  ['jangpan-grey', '장판 그레이 우드', 'Vinyl sheet (jangpan), grey wood', '#aaa39a', 'laminate_floor_03', 0.55],
  ['jangpan-white-oak', '장판 화이트 오크', 'Vinyl sheet (jangpan), white oak', '#ddcdb4', 'white_planks_clean', 0.55],
  ['jangpan-cushion', '장판 쿠션(펫 매트)', 'Cushioned vinyl (pet-friendly)', '#c7ad88', 'laminate_floor', 0.65],
].map(([key, ko, en, color, textures, rough]) => P(`floor-${key}`, 'floor', ko, en, color, rough, 0, { textures }));
const decoTiles = [
  ['oak', '데코타일 오크', 'LVT planks, oak', '#b99670'],
  ['grey', '데코타일 그레이 우드', 'LVT planks, grey wood', '#9e978e'],
  ['white', '데코타일 화이트 우드', 'LVT planks, white wood', '#dcd3c5'],
  ['walnut', '데코타일 월넛', 'LVT planks, walnut', '#68472f'],
  ['natural', '데코타일 내추럴', 'LVT planks, natural', '#c9a678'],
].map(([key, ko, en, color]) => P(`floor-lvt-${key}`, 'floor', ko, en, color, 0.5, 0, {
  pattern: { kind: 'brick', w: 0.92, h: 0.18, offset: 'random', colors: woodTone(color), grout: shade(color, 0.7), groutWidth: 0.0008, variation: 0.05, grain: 0.22, streak: 'x', cloud: 0.15, cloudScale: 0.15, bump: 0.4 },
}));

// Resilient floors.
const resilient = [
  ['linoleum-brown', '리놀륨 브라운', 'Linoleum, brown', '#7b5843', { textures: 'linoleum_brown' }, 0.5],
  ['linoleum-red', '리놀륨 레드', 'Linoleum, red', '#9b3f32', { textures: 'linoleum_brown' }, 0.5],
  ['linoleum-blue', '리놀륨 블루', 'Linoleum, blue', '#4a6584', { textures: 'linoleum_brown' }, 0.5],
  ['linoleum-green', '리놀륨 그린', 'Linoleum, green', '#5e7558', { textures: 'linoleum_brown' }, 0.5],
  ['linoleum-sand', '리놀륨 샌드', 'Linoleum, sand', '#c9b392', { textures: 'linoleum_brown' }, 0.5],
  ['linoleum-grey', '리놀륨 그레이', 'Linoleum, grey', '#8e8c88', { textures: 'linoleum_brown' }, 0.5],
  ['rubber-studded-black', '고무 바닥(돌기) 블랙', 'Studded rubber, black', '#2a2a2b', { pattern: { kind: 'dots', spacing: 0.025, r: 0.0065, base: '#2b2b2c', colors: ['#333334'], stagger: false, bump: 1.2 } }, 0.8],
  ['rubber-studded-grey', '고무 바닥(돌기) 그레이', 'Studded rubber, grey', '#77787a', { pattern: { kind: 'dots', spacing: 0.025, r: 0.0065, base: '#76777a', colors: ['#808184'], stagger: false, bump: 1.2 } }, 0.8],
  ['rubber-gym', '체육관 고무 매트', 'Gym rubber flooring', '#2d2d2e', { pattern: { kind: 'plain', base: '#2c2c2d', grain: 0.15, speckle: [['#8a8f96', 0.08, 0.003], ['#4d6a9b', 0.03, 0.003]], bump: 0.4 } }, 0.85],
  ['rubber-speckled-blue', '고무 바닥 블루 칩', 'Speckled rubber, blue', '#466283', { pattern: { kind: 'plain', base: '#456183', grain: 0.12, speckle: [['#e8e8e8', 0.06, 0.003], ['#22324a', 0.08, 0.003]], bump: 0.4 } }, 0.85],
  ['cork-natural', '코르크 내추럴', 'Cork, natural', '#b98d5e', { pattern: { kind: 'plain', base: '#b98d5e', grain: 0.35, cloud: 0.2, cloudScale: 0.05, speckle: [['#6e4a2b', 0.12, 0.0025], ['#d9b386', 0.1, 0.002]], bump: 0.8 } }, 0.75],
  ['cork-dark', '코르크 다크', 'Cork, dark roast', '#6a4b33', { pattern: { kind: 'plain', base: '#6a4b33', grain: 0.35, cloud: 0.2, cloudScale: 0.05, speckle: [['#3a281a', 0.14, 0.0025], ['#9a7553', 0.08, 0.002]], bump: 0.8 } }, 0.75],
  ['cork-white', '코르크 화이트 워시', 'Cork, white-washed', '#d8cbb7', { pattern: { kind: 'plain', base: '#d8cbb7', grain: 0.3, cloud: 0.15, cloudScale: 0.05, speckle: [['#a88c6a', 0.1, 0.0025]], bump: 0.8 } }, 0.75],
  ['bamboo-natural', '대나무 마루 내추럴', 'Bamboo flooring, natural', '#d4b67f', { pattern: { kind: 'brick', w: 0.96, h: 0.032, offset: 'random', colors: ['#d4b67f', '#cdae76', '#dcc08a'], grout: '#a58650', groutWidth: 0.0006, grain: 0.25, streak: 'x', variation: 0.04, bump: 0.3 } }, 0.45],
  ['bamboo-carbonized', '대나무 마루 탄화', 'Bamboo flooring, carbonized', '#9a6d40', { pattern: { kind: 'brick', w: 0.96, h: 0.032, offset: 'random', colors: ['#9a6d40', '#8e6338', '#a67748'], grout: '#6b4826', groutWidth: 0.0006, grain: 0.25, streak: 'x', variation: 0.04, bump: 0.3 } }, 0.45],
  ['bamboo-strand', '스트랜드 우븐 대나무', 'Strand-woven bamboo', '#8a6240', { pattern: { kind: 'brick', w: 0.92, h: 0.13, offset: 'random', colors: ['#8a6240', '#7a5435', '#9b704a'], grout: '#5a3d26', groutWidth: 0.0008, grain: 0.5, streak: 'x', cloud: 0.25, cloudScale: 0.04, bump: 0.5 } }, 0.4],
].map(([key, ko, en, color, extra, rough]) => P(`floor-${key}`, 'floor', ko, en, color, rough, 0, extra));

// Concrete, resin and terrazzo floors.
const concreteFloors = [
  ['concrete-light', '폴리싱 콘크리트 라이트', 'Polished concrete, light', '#bdbab3', 0.3],
  ['concrete-mid', '폴리싱 콘크리트 미디엄', 'Polished concrete, mid grey', '#8f8d88', 0.3],
  ['concrete-dark', '폴리싱 콘크리트 다크', 'Polished concrete, charcoal', '#57575a', 0.3],
  ['concrete-warm', '폴리싱 콘크리트 웜그레이', 'Polished concrete, warm grey', '#a69d90', 0.3],
  ['concrete-matte', '무광 콘크리트', 'Sealed concrete, matte', '#9d9b96', 0.65],
].map(([key, ko, en, color, rough]) => P(`floor-${key}`, 'floor', ko, en, color, rough, 0, { textures: 'smooth_concrete_floor', ...(rough < 0.4 ? { clearcoat: 0.3, clearcoatRoughness: 0.2 } : {}) }));
const epoxy = [
  ['grey', '에폭시 그레이', 'Epoxy, grey', '#8d9196'],
  ['white', '에폭시 화이트', 'Epoxy, white', '#e9e9e6'],
  ['beige', '에폭시 베이지', 'Epoxy, beige', '#cbbfa8'],
  ['green', '에폭시 그린', 'Epoxy, safety green', '#4f7a5a'],
  ['blue', '에폭시 블루', 'Epoxy, blue', '#3f6688'],
  ['flake', '에폭시 플레이크', 'Epoxy flake', '#9a9894'],
].map(([key, ko, en, color]) => P(`floor-epoxy-${key}`, 'floor', ko, en, color, 0.18, 0, {
  clearcoat: 0.8, clearcoatRoughness: 0.06,
  pattern: key === 'flake'
    ? { kind: 'terrazzo', base: '#8f8e8b', chips: [['#2d2d2e', 0.004, 0.008, 9000], ['#e4e2dc', 0.004, 0.008, 9000], ['#6b6965', 0.004, 0.008, 6000]], size: 0.3, bump: 0.1 }
    : { kind: 'plain', base: color, cloud: 0.06, cloudScale: 0.4, size: 1, bump: 0.05 },
}));
const microFloors = [
  P('floor-microcement-grey', 'floor', '마이크로시멘트 바닥 그레이', 'Microcement floor, grey', '#a3a19c', 0.55, 0, { pattern: { kind: 'plain', base: '#a3a19c', cloud: 0.18, cloudScale: 0.3, grain: 0.06, size: 1.2, bump: 0.2 } }),
  P('floor-microcement-sand', 'floor', '마이크로시멘트 바닥 샌드', 'Microcement floor, sand', '#c4b59d', 0.55, 0, { pattern: { kind: 'plain', base: '#c4b59d', cloud: 0.18, cloudScale: 0.3, grain: 0.06, size: 1.2, bump: 0.2 } }),
];
const terrazzoFloors = [
  ['venetian', '베네치안 테라조', 'Venetian terrazzo', '#e6e0d5', '#e6e0d5', [['#b9a089', 0.006, 0.02, 1500], ['#f5f2ec', 0.004, 0.012, 2500], ['#7d7a75', 0.004, 0.01, 1000]]],
  ['grey', '테라조 그레이', 'Terrazzo, grey', '#a8a6a2', '#a8a6a2', [['#e7e5e0', 0.004, 0.014, 2500], ['#3f3f41', 0.004, 0.012, 1600], ['#c9c2b6', 0.004, 0.01, 1200]]],
  ['pink', '테라조 핑크', 'Terrazzo, pink', '#e7cfc4', '#e9d3c9', [['#c47f6a', 0.006, 0.022, 900], ['#ffffff', 0.004, 0.012, 1800], ['#8e8b86', 0.004, 0.01, 700]]],
  ['black', '테라조 블랙', 'Terrazzo, black', '#3a3a3c', '#353537', [['#f0eee9', 0.004, 0.016, 2400], ['#a8a49c', 0.004, 0.012, 1200], ['#c69c6d', 0.004, 0.01, 500]]],
  ['green', '테라조 그린', 'Terrazzo, green', '#a8b7a3', '#adbba8', [['#3f5b47', 0.006, 0.02, 1300], ['#f3f1ec', 0.004, 0.012, 1600], ['#d4c4a4', 0.004, 0.01, 800]]],
  ['palladiana', '팔라디아나(대형 칩)', 'Palladiana (large chips)', '#d9d3c8', '#8e8a84', [['#ece8e1', 0.06, 0.14, 120], ['#c8beb0', 0.05, 0.12, 50], ['#545457', 0.04, 0.1, 25]]],
].map(([key, ko, en, color, base, chips]) => P(`floor-terrazzo-${key}`, 'floor', ko, en, color, 0.25, 0, { ...POLISH, pattern: { kind: 'terrazzo', base, chips, size: key === 'palladiana' ? 0.8 : 0.5, grain: 0.05, bump: 0.15 } }));
const otherFloors = [
  P('floor-brick-herringbone', 'floor', '헤링본 벽돌 바닥', 'Herringbone brick floor', '#9a5a42', 0.85, 0, { pattern: { kind: 'herringbone', w: 0.2, h: 0.1, colors: ['#9a5a42', '#8a4e3a', '#a96a4e', '#7e4734'], grout: '#b9b1a3', groutWidth: 0.008, variation: 0.08, grain: 0.2, cloud: 0.2, cloudScale: 0.05, bump: 1 } }),
  P('floor-brick-basket', 'floor', '바스켓위브 벽돌 바닥', 'Basket-weave brick floor', '#a46a4f', 0.85, 0, { pattern: { kind: 'basketweave', w: 0.1, n: 2, colors: ['#a46a4f', '#93593f', '#b47a5d'], grout: '#b9b1a3', groutWidth: 0.008, variation: 0.08, grain: 0.2, cloud: 0.2, cloudScale: 0.05, bump: 1 } }),
  P('floor-plywood', 'floor', '합판 바닥', 'Plywood floor', '#d2b48a', 0.55, 0, { pattern: { kind: 'grid', w: 1.22, h: 2.44, colors: ['#d2b48a', '#cdae83', '#d8bb92'], grout: '#8f7656', groutWidth: 0.002, grain: 0.2, streak: 'y', cloud: 0.35, cloudScale: 0.12, variation: 0.03, cover: 2.4, bump: 0.3 } }),
  P('floor-deck-teak', 'floor', '티크 데크', 'Teak decking', '#9b7048', 0.65, 0, { pattern: { kind: 'brick', w: 1.8, h: 0.14, offset: 'random', colors: ['#9b7048', '#8f6641', '#a77a51'], grout: '#2b241e', groutWidth: 0.006, grain: 0.3, streak: 'x', variation: 0.05, bump: 0.8 } }),
  P('floor-osb', 'floor', 'OSB 합판', 'OSB board', '#c8a873', 0.75, 0, { pattern: { kind: 'terrazzo', base: '#b8975f', chips: [['#d6b783', 0.02, 0.06, 900], ['#a5824c', 0.02, 0.06, 500], ['#c9a46a', 0.015, 0.05, 700]], size: 0.6, grain: 0.15, bump: 0.5 } }),
];

// ═════════════════════════ tile

// Glazed wall tile in common layouts.
const SUBWAY = [
  ['white', '화이트', 'white', '#f1efea'], ['cream', '크림', 'cream', '#ece2cc'], ['black', '블랙', 'black', '#232325'],
  ['sage', '세이지', 'sage', '#9daf95'], ['navy', '네이비', 'navy', '#28395a'], ['terracotta', '테라코타', 'terracotta', '#b8694a'],
  ['blush', '블러시 핑크', 'blush pink', '#e3c1b5'], ['grey', '그레이', 'grey', '#a9aaa8'], ['emerald', '에메랄드', 'emerald', '#1f5c4a'], ['cobalt', '코발트', 'cobalt', '#2a4e8f'],
];
const glazedGrout = (c) => (c === '#232325' || c === '#28395a' || c === '#1f5c4a' ? '#3d3d3f' : '#d9d6cf');
// 'tile-subway-white' already exists (materials.js, photo set): the drawn white one is the "classic".
const subway = SUBWAY.map(([key, ko, en, color]) => P(key === 'white' ? 'tile-subway-classic-white' : `tile-subway-${key}`, 'tile', `서브웨이 타일 ${ko}`, `Subway tile, ${en}`, color, 0.12, 0, {
  ...GLAZE, pattern: { kind: 'brick', w: 0.15, h: 0.075, colors: [color], grout: glazedGrout(color), groutWidth: 0.002, variation: 0.035, cloud: 0.06, cloudScale: 0.05, bump: 1 },
}));
const subwayLayouts = [
  ['herringbone-white', '헤링본 서브웨이 화이트', 'Herringbone subway, white', '#f1efea', { kind: 'herringbone', w: 0.15, h: 0.075 }],
  ['herringbone-green', '헤링본 서브웨이 그린', 'Herringbone subway, green', '#4f7a63', { kind: 'herringbone', w: 0.15, h: 0.075 }],
  ['herringbone-blue', '헤링본 서브웨이 블루', 'Herringbone subway, blue', '#5a7f9e', { kind: 'herringbone', w: 0.15, h: 0.075 }],
  ['herringbone-black', '헤링본 서브웨이 블랙', 'Herringbone subway, black', '#252527', { kind: 'herringbone', w: 0.15, h: 0.075 }],
  ['stack-white', '세로 스택 화이트', 'Vertical stack, white', '#f1efea', { kind: 'grid', w: 0.075, h: 0.3 }],
  ['stack-sage', '세로 스택 세이지', 'Vertical stack, sage', '#9daf95', { kind: 'grid', w: 0.075, h: 0.3 }],
  ['stack-pink', '세로 스택 핑크', 'Vertical stack, pink', '#e3c1b5', { kind: 'grid', w: 0.075, h: 0.3 }],
  ['stack-charcoal', '세로 스택 차콜', 'Vertical stack, charcoal', '#3b3c3e', { kind: 'grid', w: 0.075, h: 0.3 }],
].map(([key, ko, en, color, layout]) => P(`tile-${key}`, 'tile', ko, en, color, 0.12, 0, {
  ...GLAZE, pattern: { colors: [color], grout: color === '#252527' || color === '#3b3c3e' ? '#4a4a4c' : '#dcd9d2', groutWidth: 0.002, variation: 0.035, cloud: 0.06, cloudScale: 0.05, bump: 1, ...layout },
}));
// Handmade Moroccan zellige: uneven glaze, every tile its own shade.
const zellige = [
  ['white', '화이트', 'white', '#eeebe3'], ['green', '그린', 'green', '#3f6e55'], ['blue', '블루', 'blue', '#3d6a92'], ['pink', '핑크', 'pink', '#e0b0a5'],
  ['terracotta', '테라코타', 'terracotta', '#b9643f'], ['black', '블랙', 'black', '#262628'], ['sand', '샌드', 'sand', '#d8c3a0'], ['teal', '틸', 'teal', '#2e6f73'],
].map(([key, ko, en, color]) => P(`tile-zellige-${key}`, 'tile', `젤리주 타일 ${ko}`, `Zellige tile, ${en}`, color, 0.08, 0, {
  clearcoat: 0.8, clearcoatRoughness: 0.15,
  pattern: { kind: 'grid', w: 0.1, colors: [color, shade(color, 0.9), shade(color, 1.08)], grout: key === 'black' ? '#4b4a48' : '#d6d0c4', groutWidth: 0.0025, variation: 0.1, cloud: 0.25, cloudScale: 0.03, grain: 0.05, bump: 1.4 },
}));
const hexTiles = [
  ['small-white', '육각 모자이크 화이트', 'Small hexagon, white', '#efeee9', 0.05, '#cfccc5'],
  ['small-black', '육각 모자이크 블랙', 'Small hexagon, black', '#262628', 0.05, '#4a4a4c'],
  ['small-grey', '육각 모자이크 그레이', 'Small hexagon, grey', '#9fa09e', 0.05, '#d4d2cc'],
  ['cement-grey', '육각 시멘트 타일 그레이', 'Cement hexagon, grey', '#8f8e8a', 0.2, '#b3b0a9'],
  ['cement-white', '육각 시멘트 타일 화이트', 'Cement hexagon, white', '#e2dfd7', 0.2, '#c3bfb6'],
  ['terracotta', '육각 테라코타', 'Terracotta hexagon', '#b2603d', 0.2, '#cdbca8'],
  ['green', '육각 타일 그린', 'Hexagon tile, green', '#577d66', 0.12, '#d8d4cb'],
  ['blue', '육각 타일 블루', 'Hexagon tile, blue', '#5d82a6', 0.12, '#d8d4cb'],
].map(([key, ko, en, color, size, grout]) => P(`tile-hex-${key}`, 'tile', ko, en, color, key.startsWith('cement') || key === 'terracotta' ? 0.6 : 0.15, 0, {
  ...(key.startsWith('cement') || key === 'terracotta' ? {} : GLAZE),
  pattern: { kind: 'hexagon', size, colors: [color], grout, groutWidth: size < 0.1 ? 0.0018 : 0.003, variation: key === 'terracotta' ? 0.1 : 0.04, cloud: 0.12, cloudScale: 0.05, bump: 1 },
}));
const penny = [
  ['white', '화이트', 'white', ['#f0efea']], ['black', '블랙', 'black', ['#262628']], ['grey', '그레이', 'grey', ['#a3a4a2']],
  ['blue', '블루', 'blue', ['#3b6790']], ['green', '그린', 'green', ['#4f7a5f']], ['mix', '블루 믹스', 'blue mix', ['#3b6790', '#6e94b5', '#e9edf0', '#2b4c6e']],
].map(([key, ko, en, colors]) => P(`tile-penny-${key}`, 'tile', `페니 라운드 ${ko}`, `Penny round, ${en}`, colors[0], 0.15, 0, {
  ...GLAZE, pattern: { kind: 'penny', d: 0.019, colors, grout: key === 'black' ? '#4a4a4c' : '#d5d2cb', groutWidth: 0.003, variation: 0.05, bump: 1 },
}));
const fishscale = [
  ['white', '화이트', 'white', '#efede7'], ['mint', '민트', 'mint', '#a9cfbd'], ['blue', '블루', 'blue', '#4b78a3'],
  ['pink', '핑크', 'pink', '#e7b9ad'], ['navy', '네이비', 'navy', '#253756'], ['ochre', '오커', 'ochre', '#c99a3e'],
].map(([key, ko, en, color]) => P(`tile-fishscale-${key}`, 'tile', `피쉬스케일 타일 ${ko}`, `Fish-scale tile, ${en}`, color, 0.1, 0, {
  ...GLAZE, pattern: { kind: 'fishscale', r: 0.04, colors: [color, shade(color, 0.93), shade(color, 1.05)], grout: key === 'navy' ? '#4a4d55' : '#d8d4cc', groutWidth: 0.002, variation: 0.04, cloud: 0.12, cloudScale: 0.03, bump: 1 },
}));
// Encaustic cement tiles: motif × colourway.
const encaustic = [
  ['quatrefoil-blue', '쿼터포일 블루', 'quatrefoil, blue', 'quatrefoil', ['#ece6d8', '#2f5a8a', '#c9a24a']],
  ['quatrefoil-black', '쿼터포일 블랙', 'quatrefoil, black', 'quatrefoil', ['#ece6d8', '#2a2a2c', '#9c9a95']],
  ['flower-terracotta', '플라워 테라코타', 'flower, terracotta', 'flower', ['#efe7d6', '#b5603e', '#3b5f4a']],
  ['flower-green', '플라워 그린', 'flower, green', 'flower', ['#e9e4d6', '#3f6e55', '#d9a441']],
  ['star-navy', '스타 네이비', 'star, navy', 'star', ['#e9e3d4', '#273a5c', '#b8473a']],
  ['star-grey', '스타 그레이', 'star, grey', 'star', ['#dedbd3', '#6f6e6b', '#2c2c2e']],
  ['arcs-ochre', '아크 오커', 'arcs, ochre', 'arcs', ['#ece5d4', '#c58f3a', '#2c4a63']],
  ['arcs-pink', '아크 핑크', 'arcs, pink', 'arcs', ['#f0e6de', '#d39b8d', '#4c4a48']],
  ['diamond-black', '다이아몬드 블랙', 'diamond, black', 'diamond', ['#ebe6dc', '#2a2a2c', '#b9b5ac']],
  ['diamond-teal', '다이아몬드 틸', 'diamond, teal', 'diamond', ['#ece6d9', '#2e6f73', '#e0b45a']],
  ['cross-red', '크로스 레드', 'cross, red', 'cross', ['#ebe4d6', '#9e3a2f', '#2b2b2d']],
  ['cross-blue', '크로스 블루', 'cross, blue', 'cross', ['#e8e4dc', '#3c5f8c', '#e8e4dc']],
].map(([key, ko, en, motif, colors]) => P(`tile-encaustic-${key}`, 'tile', `엔카우스틱 시멘트 타일 ${ko}`, `Encaustic cement tile, ${en}`, mixHex(colors[0], colors[1], 0.35), 0.55, 0, {
  pattern: { kind: 'encaustic', w: 0.2, motif, colors, grout: '#c9c3b7', groutWidth: 0.0015, variation: 0.03, cloud: 0.12, cloudScale: 0.08, grain: 0.05, bump: 0.6 },
}));
const checkers = [
  ['black-white', '블랙 & 화이트', 'black & white', ['#efede8', '#232325'], 0.3],
  ['terracotta-cream', '테라코타 & 크림', 'terracotta & cream', ['#ece2cc', '#b5643f'], 0.3],
  ['green-white', '그린 & 화이트', 'green & white', ['#efede8', '#3f6b55'], 0.2],
  ['blue-white', '블루 & 화이트', 'blue & white', ['#efede8', '#355f8f'], 0.2],
  ['grey-white', '그레이 & 화이트', 'grey & white', ['#efede8', '#8f8f8d'], 0.45],
].map(([key, ko, en, colors, w]) => P(`tile-checker-${key}`, 'tile', `체커보드 ${ko}`, `Chequerboard, ${en}`, mixHex(colors[0], colors[1], 0.5), 0.2, 0, {
  clearcoat: 0.4, clearcoatRoughness: 0.15, pattern: { kind: 'grid', w, checker: true, colors, grout: '#bdb9b1', groutWidth: 0.002, variation: 0.03, cloud: 0.08, cloudScale: 0.1, bump: 0.8 },
}));
const terracottaTiles = [
  P('tile-terracotta-quarry', 'tile', '테라코타 쿼리 타일', 'Quarry tile', '#a65438', 0.65, 0, { pattern: { kind: 'grid', w: 0.15, colors: ['#a65438', '#9a4c33', '#b25d3e'], grout: '#b1a493', groutWidth: 0.005, variation: 0.08, cloud: 0.25, cloudScale: 0.04, grain: 0.12, bump: 1 } }),
  P('tile-terracotta-saltillo', 'tile', '살티요 테라코타', 'Saltillo terracotta', '#c1774a', 0.7, 0, { pattern: { kind: 'grid', w: 0.3, colors: ['#c1774a', '#b0663d', '#cf8a5a', '#a9603a'], grout: '#bfb3a3', groutWidth: 0.008, variation: 0.1, cloud: 0.35, cloudScale: 0.07, grain: 0.1, bump: 1 } }),
  P('tile-terracotta-cotto', 'tile', '코토 테라코타(직사각)', 'Cotto terracotta, rectangular', '#b86a45', 0.65, 0, { pattern: { kind: 'brick', w: 0.3, h: 0.15, colors: ['#b86a45', '#a95e3c', '#c47751'], grout: '#bcb0a0', groutWidth: 0.006, variation: 0.08, cloud: 0.3, cloudScale: 0.05, grain: 0.1, bump: 1 } }),
  P('tile-terracotta-rustic', 'tile', '러스틱 테라코타', 'Rustic terracotta', '#a85c3c', 0.7, 0, { repeat: 0.6, textures: 'terracotta_floor_tiles' }),
  P('tile-terracotta-pale', 'tile', '페일 테라코타', 'Pale terracotta', '#d19c7a', 0.7, 0, { repeat: 0.6, textures: 'terracotta_floor_tiles' }),
  P('tile-terracotta-red', 'tile', '레드 테라코타', 'Red terracotta', '#9b4430', 0.65, 0, { repeat: 0.6, textures: 'terracotta_floor_tiles' }),
];
// Large-format porcelain: plain body with a soft cloud, thin joints.
const porcelain = [
  ['white-60', '포세린 화이트 600×600', 'Porcelain 600×600, white', '#ecebe7', 0.6, 0.6, 0.3],
  ['ivory-60x120', '포세린 아이보리 600×1200', 'Porcelain 600×1200, ivory', '#e5ddcd', 1.2, 0.6, 0.3],
  ['concrete-60x120', '포세린 콘크리트 600×1200', 'Porcelain 600×1200, concrete look', '#a3a19c', 1.2, 0.6, 0.55],
  ['anthracite-60x120', '포세린 앤트러사이트 600×1200', 'Porcelain 600×1200, anthracite', '#3e3f42', 1.2, 0.6, 0.5],
  ['greige-80', '포세린 그레이지 800×800', 'Porcelain 800×800, greige', '#b9b1a5', 0.8, 0.8, 0.45],
  ['beige-60', '포세린 베이지 600×600', 'Porcelain 600×600, beige', '#d3c4a9', 0.6, 0.6, 0.4],
  ['polished-white-80', '폴리싱 포세린 화이트 800×800', 'Polished porcelain 800×800, white', '#f2f1ed', 0.8, 0.8, 0.08],
  ['slab-grey', '포세린 슬랩 그레이 1200×2400', 'Porcelain slab 1200×2400, grey', '#8e8c88', 2.4, 1.2, 0.4],
].map(([key, ko, en, color, w, h, rough]) => P(`tile-porcelain-${key}`, 'tile', ko, en, color, rough, 0, {
  ...(rough < 0.2 ? POLISH : {}),
  pattern: { kind: 'brick', w, h, offset: w === h ? 0 : 0.5, colors: [color], grout: shade(color, color < '#6' ? 1.25 : 0.82), groutWidth: 0.002, variation: 0.02, cloud: key.includes('concrete') ? 0.25 : 0.08, cloudScale: 0.3, grain: 0.04, cover: 2.4, bump: 0.6 },
}));
const glassMosaic = [
  ['pool-blue', '수영장 유리 모자이크 블루', 'Glass mosaic, pool blue', ['#2f7ba8', '#3d8fbe', '#2a6a96', '#5aa7cf']],
  ['aqua', '유리 모자이크 아쿠아', 'Glass mosaic, aqua', ['#5fb8b5', '#7ccac3', '#3f9f9d', '#a7ddd6']],
  ['green', '유리 모자이크 그린', 'Glass mosaic, green', ['#3d7a52', '#5a9468', '#2c6142', '#8fbf8e']],
  ['gold', '유리 모자이크 골드', 'Glass mosaic, gold', ['#c9a24a', '#b38c3a', '#dfbd6a', '#8f6f2c']],
  ['white', '유리 모자이크 화이트', 'Glass mosaic, white', ['#f2f2ef', '#e6e7e4', '#dadbd8', '#fafaf8']],
  ['black', '유리 모자이크 블랙', 'Glass mosaic, black', ['#1e1e20', '#2a2a2d', '#151517', '#3a3a3e']],
].map(([key, ko, en, colors]) => P(`tile-mosaic-${key}`, 'tile', ko, en, colors[0], 0.05, 0, {
  clearcoat: 1, clearcoatRoughness: 0.04, pattern: { kind: 'grid', w: 0.023, colors, grout: key === 'black' ? '#3c3c3e' : '#d7d5cf', groutWidth: 0.0018, variation: 0.06, bump: 1 },
}));
const otherTiles = [
  P('tile-mosaic-marble-white', 'tile', '대리석 모자이크 화이트', 'Marble mosaic, white', '#e5e2dc', 0.3, 0, { textures: 'marble_mosaic_tiles' }),
  P('tile-mosaic-marble-grey', 'tile', '대리석 모자이크 그레이', 'Marble mosaic, grey', '#a7a6a2', 0.3, 0, { textures: 'marble_mosaic_tiles' }),
  P('tile-harlequin-black-white', 'tile', '할리퀸 타일 블랙 & 화이트', 'Harlequin tile, black & white', '#8a8987', 0.2, 0, { clearcoat: 0.4, clearcoatRoughness: 0.15, pattern: { kind: 'diamond', w: 0.3, h: 0.3, checker: true, colors: ['#efede8', '#232325'], grout: '#bdb9b1', groutWidth: 0.002, variation: 0.02, bump: 0.8 } }),
  P('tile-harlequin-marble', 'tile', '할리퀸 대리석 타일', 'Harlequin marble tile', '#bdb6ab', 0.2, 0, { ...POLISH, pattern: { kind: 'diamond', w: 0.4, h: 0.4, checker: true, colors: ['#ebe7df', '#8c7d6c'], grout: '#d0cbc2', groutWidth: 0.0015, variation: 0.05, cloud: 0.2, cloudScale: 0.08, bump: 0.5 } }),
  P('tile-harlequin-green', 'tile', '할리퀸 타일 그린', 'Harlequin tile, green', '#7c9a84', 0.2, 0, { clearcoat: 0.4, clearcoatRoughness: 0.15, pattern: { kind: 'diamond', w: 0.25, h: 0.25, checker: true, colors: ['#e9e6dc', '#3f6b55'], grout: '#bdb9b1', groutWidth: 0.002, variation: 0.02, bump: 0.8 } }),
  P('tile-basketweave-marble', 'tile', '바스켓위브 대리석 모자이크', 'Basket-weave marble mosaic', '#d9d6cf', 0.25, 0, { ...POLISH, pattern: { kind: 'basketweave', w: 0.025, n: 2, colors: ['#ebe8e2', '#e2dfd8'], grout: '#cfcbc2', groutWidth: 0.0015, variation: 0.04, cloud: 0.15, cloudScale: 0.04, bump: 0.8 } }),
  P('tile-basketweave-dot', 'tile', '바스켓위브 블랙 도트', 'Basket-weave with black dots', '#c9c6bf', 0.25, 0, { ...POLISH, pattern: { kind: 'basketweave', w: 0.025, n: 2, colors: ['#ebe8e2'], grout: '#2a2a2c', groutWidth: 0.004, variation: 0.03, bump: 0.8 } }),
  P('tile-chevron-white', 'tile', '쉐브론 타일 화이트', 'Chevron tile, white', '#efede8', 0.12, 0, { ...GLAZE, pattern: { kind: 'chevron', w: 0.1, h: 0.05, colors: ['#efede8'], grout: '#d2cec6', groutWidth: 0.002, variation: 0.04, bump: 1 } }),
  P('tile-chevron-marble', 'tile', '쉐브론 대리석 타일', 'Chevron marble tile', '#d8d4cc', 0.2, 0, { ...POLISH, pattern: { kind: 'chevron', w: 0.15, h: 0.075, colors: ['#e9e6e0', '#dcd8d0', '#cfcac1'], grout: '#cbc6bd', groutWidth: 0.0015, variation: 0.03, cloud: 0.2, cloudScale: 0.05, bump: 0.6 } }),
  P('tile-chevron-terracotta', 'tile', '쉐브론 테라코타', 'Chevron terracotta', '#b8694a', 0.6, 0, { pattern: { kind: 'chevron', w: 0.15, h: 0.075, colors: ['#b8694a', '#a95c3f', '#c27756'], grout: '#c7bbaa', groutWidth: 0.004, variation: 0.07, cloud: 0.2, cloudScale: 0.05, bump: 1 } }),
  P('tile-woodlook-oak', 'tile', '우드 타일 오크', 'Wood-look porcelain, oak', '#b48e66', 0.5, 0, { pattern: { kind: 'brick', w: 1.2, h: 0.2, offset: 0.3333333333, colors: woodTone('#b48e66'), grout: '#8c7a66', groutWidth: 0.002, variation: 0.05, grain: 0.25, streak: 'x', cloud: 0.2, cloudScale: 0.15, cover: 2.4, bump: 0.5 } }),
  P('tile-woodlook-grey', 'tile', '우드 타일 그레이', 'Wood-look porcelain, grey', '#9d978f', 0.5, 0, { pattern: { kind: 'brick', w: 1.2, h: 0.2, offset: 0.3333333333, colors: woodTone('#9d978f'), grout: '#7d7972', groutWidth: 0.002, variation: 0.05, grain: 0.25, streak: 'x', cloud: 0.2, cloudScale: 0.15, cover: 2.4, bump: 0.5 } }),
  P('tile-blue-floor', 'tile', '블루 바닥 타일', 'Blue floor tile', '#5c7894', 0.35, 0, { textures: 'blue_floor_tiles_01' }),
  P('tile-blue-floor-green', 'tile', '그린 바닥 타일', 'Green floor tile', '#5d7f68', 0.35, 0, { textures: 'blue_floor_tiles_01' }),
  P('tile-rounded-white', 'tile', '라운드 엣지 타일 화이트', 'Rounded-edge tile, white', '#eeece7', 0.15, 0, { ...GLAZE, textures: 'rounded_square_tiled_wall' }),
  P('tile-rounded-mint', 'tile', '라운드 엣지 타일 민트', 'Rounded-edge tile, mint', '#b3d3c4', 0.15, 0, { ...GLAZE, textures: 'rounded_square_tiled_wall' }),
  P('tile-rounded-yellow', 'tile', '라운드 엣지 타일 옐로', 'Rounded-edge tile, yellow', '#e3c25e', 0.15, 0, { ...GLAZE, textures: 'rounded_square_tiled_wall' }),
  P('tile-interior-beige', 'tile', '실내 바닥 타일 베이지', 'Interior floor tile, beige', '#cdbfa6', 0.3, 0, { textures: 'interior_tiles' }),
  P('tile-interior-grey', 'tile', '실내 바닥 타일 그레이', 'Interior floor tile, grey', '#9c9b97', 0.3, 0, { textures: 'interior_tiles' }),
  P('tile-square-green', 'tile', '정사각 타일 그린', 'Square tile, green', '#4d7a5f', 0.2, 0, { repeat: 0.3, clearcoat: 0.5, textures: 'square_tiles' }),
  P('tile-square-white', 'tile', '정사각 타일 화이트', 'Square tile, white', '#ebeae6', 0.2, 0, { repeat: 0.3, clearcoat: 0.5, textures: 'square_tiles' }),
  P('tile-long-cream', 'tile', '롱 타일 크림', 'Long tile, cream', '#ebe1cb', 0.15, 0, { repeat: 0.6, clearcoat: 0.5, textures: 'long_white_tiles' }),
  P('tile-long-grey', 'tile', '롱 타일 그레이', 'Long tile, grey', '#b2b2af', 0.15, 0, { repeat: 0.6, clearcoat: 0.5, textures: 'long_white_tiles' }),
  P('tile-ceramic-beige', 'tile', '세라믹 타일 베이지', 'Ceramic tile, beige', '#c9b89c', 0.3, 0, { repeat: 0.9, textures: 'tiled_floor_001' }),
  P('tile-ceramic-dark', 'tile', '세라믹 타일 다크', 'Ceramic tile, dark grey', '#5d5d5f', 0.3, 0, { repeat: 0.9, textures: 'tiled_floor_001' }),
  P('tile-checker-pavement-warm', 'tile', '체크 바닥 타일 웜', 'Checkered floor tile, warm', '#cdbca3', 0.25, 0, { repeat: 0.6, textures: 'checkered_pavement_tiles' }),
  P('tile-slate-pattern', 'tile', '슬레이트 패턴 타일', 'Patterned slate tile', '#5d5f61', 0.6, 0, { textures: 'patterned_slate_tiles' }),
  P('tile-slate-pattern-green', 'tile', '슬레이트 패턴 타일 그린', 'Patterned slate tile, green', '#59665c', 0.6, 0, { textures: 'patterned_slate_tiles' }),
];

// ═════════════════════════ stone

// Marbles: base colour + vein families [colour, width m, count per slab, opacity]. Polished and honed.
const MARBLES = [
  ['carrara', '카라라', 'Carrara', '#e8e7e4', [['#9b9ea3', 0.002, 14, 0.55], ['#b8bbbe', 0.001, 20, 0.5]], 25, 0.25],
  ['calacatta-gold', '칼라카타 골드', 'Calacatta Gold', '#f1eee8', [['#9a8a72', 0.005, 5, 0.85], ['#c4ab7c', 0.002, 8, 0.7]], 55, 0.15],
  ['calacatta-viola', '칼라카타 비올라', 'Calacatta Viola', '#eeeae6', [['#6e4a5a', 0.009, 6, 0.85], ['#9b7a87', 0.003, 10, 0.7]], 40, 0.2],
  ['statuario', '스타투아리오', 'Statuario', '#f3f2ef', [['#6f7276', 0.006, 4, 0.85], ['#a3a6aa', 0.0015, 10, 0.6]], 60, 0.15],
  ['arabescato', '아라베스카토', 'Arabescato', '#efeeeb', [['#5f6266', 0.004, 12, 0.85], ['#8d9094', 0.002, 16, 0.6]], 15, 0.5],
  ['nero-marquina', '네로 마르퀴나', 'Nero Marquina', '#1d1d1f', [['#efefea', 0.0015, 12, 0.85], ['#c9c9c4', 0.0008, 18, 0.6]], 35, 0.4],
  ['emperador-dark', '엠페라도르 다크', 'Emperador Dark', '#4a3527', [['#c9ad8c', 0.0015, 22, 0.75], ['#2b1d15', 0.004, 10, 0.5]], 70, 0.6],
  ['emperador-light', '엠페라도르 라이트', 'Emperador Light', '#a78a6c', [['#e6d6bf', 0.0015, 22, 0.75], ['#6f5642', 0.003, 10, 0.5]], 70, 0.6],
  ['verde-guatemala', '베르데 과테말라', 'Verde Guatemala', '#24443a', [['#d9e3dc', 0.0015, 18, 0.8], ['#4e7a68', 0.004, 14, 0.6]], 20, 0.6],
  ['rosso-levanto', '로소 레반토', 'Rosso Levanto', '#5e2a28', [['#e2d4c9', 0.0015, 18, 0.8], ['#3b5148', 0.004, 8, 0.55]], 30, 0.6],
  ['rosa-portogallo', '로사 포르투갈로', 'Rosa Portogallo', '#e2c3b4', [['#c39484', 0.003, 10, 0.6], ['#f2e5dc', 0.002, 12, 0.6]], 10, 0.4],
  ['crema-marfil', '크레마 마필', 'Crema Marfil', '#e0d1b5', [['#c8b48f', 0.0015, 12, 0.55], ['#f0e7d4', 0.001, 12, 0.5]], 30, 0.5],
  ['botticino', '보티치노', 'Botticino', '#e3d8c4', [['#b8a68a', 0.001, 16, 0.5], ['#f3ede2', 0.0015, 10, 0.55]], 50, 0.45],
  ['grigio-carnico', '그리지오 카르니코', 'Grigio Carnico', '#4b4d50', [['#e9e9e5', 0.0012, 26, 0.8]], 60, 0.5],
  ['bardiglio', '바르딜리오', 'Bardiglio', '#8a8f95', [['#5e6369', 0.006, 8, 0.6], ['#c3c7cb', 0.002, 10, 0.55]], 10, 0.5],
  ['panda-white', '판다 화이트', 'Panda White', '#f0efec', [['#2c2d2f', 0.012, 4, 0.9], ['#5c5e61', 0.003, 6, 0.75]], 50, 0.25],
  ['thassos', '타소스 화이트', 'Thassos White', '#f6f6f3', [['#d9dad8', 0.0015, 4, 0.35]], 20, 0.3],
  ['sahara-noir', '사하라 누아르', 'Sahara Noir', '#1f1d1c', [['#c5a46a', 0.0015, 14, 0.85], ['#e8e3d8', 0.001, 12, 0.7]], 45, 0.5],
  ['calacatta-borghini', '칼라카타 보르기니', 'Calacatta Borghini', '#f0ede6', [['#8a7a64', 0.008, 6, 0.8], ['#b3a283', 0.0025, 10, 0.65]], 35, 0.35],
  ['volakas', '볼라카스', 'Volakas', '#ecebe8', [['#8e9298', 0.002, 20, 0.6]], 75, 0.3],
  ['breccia-oniciata', '브레치아 오니치아타', 'Breccia Oniciata', '#d9c29d', [['#8b6a45', 0.003, 22, 0.7], ['#f0e3c8', 0.004, 12, 0.6]], 0, 1.4],
  ['portoro', '포르토로', 'Portoro', '#141415', [['#d6b067', 0.002, 16, 0.9], ['#f1e7cf', 0.001, 10, 0.6]], 30, 0.45],
];
// The vein counts are per catalogue look; 60 % of them reads as stone at room scale (more looks like hair).
const marbleSpec = ([, , , base, veins, angle], honed) => ({ kind: 'marble', base, veins: veins.map(([c, w, n, a]) => [c, w, Math.max(1, Math.round(n * 0.6)), honed ? a * 0.8 : a]), angle, size: 1.4, cloud: 0.12, cloudScale: 0.35, grain: 0.03, bump: 0.08 });
const marbles = MARBLES.map((m) => P(`stone-marble-${m[0]}`, 'stone', `${m[1]} 대리석`, `${m[2]} marble`, m[3], 0.12, 0, { ...POLISH, pattern: marbleSpec(m, false) }));
const HONED = ['carrara', 'calacatta-gold', 'nero-marquina', 'emperador-dark', 'crema-marfil', 'statuario', 'bardiglio', 'verde-guatemala', 'arabescato', 'botticino'];
const honedMarbles = MARBLES.filter((m) => HONED.includes(m[0])).map((m) => P(`stone-marble-${m[0]}-honed`, 'stone', `${m[1]} 대리석(혼드)`, `${m[2]} marble, honed`, m[3], 0.45, 0, { pattern: marbleSpec(m, true) }));
const photoMarble = [
  P('stone-marble-photo-white', 'stone', '대리석 슬랩 화이트', 'Marble slab, white', '#e6e3dd', 0.15, 0, { ...POLISH, textures: 'marble_01' }),
  P('stone-marble-photo-grey', 'stone', '대리석 슬랩 그레이', 'Marble slab, grey', '#a5a4a1', 0.15, 0, { ...POLISH, textures: 'marble_01' }),
];
// Granites: crystals as speckles [colour, share, crystal size m].
const GRANITES = [
  ['absolute-black', '앱솔루트 블랙', 'Absolute Black', '#161617', [['#2b2b2d', 0.25, 0.002]]],
  ['black-galaxy', '블랙 갤럭시', 'Black Galaxy', '#121214', [['#c9a45c', 0.05, 0.0018], ['#2d2d30', 0.2, 0.002]]],
  ['kashmir-white', '카슈미르 화이트', 'Kashmir White', '#e1ddd6', [['#8b8a88', 0.12, 0.003], ['#8b3b33', 0.03, 0.0025], ['#c9c5bd', 0.2, 0.004]]],
  ['steel-grey', '스틸 그레이', 'Steel Grey', '#5b5d61', [['#2a2b2d', 0.25, 0.003], ['#9a9ca0', 0.15, 0.003]]],
  ['tan-brown', '탄 브라운', 'Tan Brown', '#4a2f26', [['#1e1514', 0.3, 0.005], ['#8a5a44', 0.2, 0.004]]],
  ['baltic-brown', '발틱 브라운', 'Baltic Brown', '#6b4a33', [['#2a2019', 0.25, 0.006], ['#a1764e', 0.2, 0.008]]],
  ['blue-pearl', '블루 펄', 'Blue Pearl', '#4b5563', [['#8fa3bb', 0.18, 0.006], ['#22262d', 0.25, 0.004]]],
  ['ubatuba', '우바투바', 'Ubatuba', '#1f2620', [['#5c6b4a', 0.15, 0.005], ['#0e110e', 0.3, 0.004]]],
  ['giallo-ornamental', '지알로 오르나멘탈', 'Giallo Ornamental', '#cbb48e', [['#5a4a3a', 0.1, 0.004], ['#e6d8bd', 0.25, 0.005], ['#a6835c', 0.12, 0.004]]],
  ['imperial-red', '임페리얼 레드', 'Imperial Red', '#8a3a2e', [['#2a1c1a', 0.2, 0.004], ['#b75a48', 0.2, 0.005]]],
  ['rosa-beta', '로사 베타', 'Rosa Beta', '#b9a39a', [['#5a5352', 0.15, 0.004], ['#d6b6aa', 0.25, 0.005]]],
  ['bianco-sardo', '비앙코 사르도', 'Bianco Sardo', '#bdb8b0', [['#4e4d4c', 0.14, 0.003], ['#e2ded6', 0.25, 0.004]]],
  ['colonial-white', '콜로니얼 화이트', 'Colonial White', '#ddd8cf', [['#6a6461', 0.1, 0.004], ['#a8473f', 0.03, 0.003], ['#ece8e1', 0.25, 0.005]]],
  ['kashmir-gold', '카슈미르 골드', 'Kashmir Gold', '#d2bc93', [['#6b5643', 0.1, 0.004], ['#8a3a30', 0.03, 0.003], ['#ebdcbc', 0.25, 0.005]]],
  ['paradiso', '파라디소', 'Paradiso', '#5d4a52', [['#2b2226', 0.25, 0.005], ['#a38994', 0.2, 0.006]]],
  ['pocheon', '포천석', 'Pocheon granite', '#a9a7a2', [['#3c3b3b', 0.12, 0.003], ['#d7d4ce', 0.25, 0.004]]],
  ['macheon', '마천석', 'Macheon black granite', '#2b2c2e', [['#47484b', 0.25, 0.002], ['#121213', 0.2, 0.002]]],
];
const granites = GRANITES.map(([key, ko, en, base, speckle]) => P(`stone-granite-${key}`, 'stone', `${ko}${/석$/.test(ko) ? '' : ' 화강암'}`, `${en}${/granite/.test(en) ? '' : ' granite'}`, base, 0.2, 0, { ...POLISH, pattern: { kind: 'plain', base, speckle, cloud: 0.1, cloudScale: 0.2, grain: 0.06, size: 0.4, bump: 0.05 } }));
const granitePhoto = [
  P('stone-granite-tile-grey', 'stone', '화강석 판재 그레이', 'Granite slab, grey', '#8d8b88', 0.4, 0, { textures: 'granite_tile' }),
  P('stone-granite-tile-flamed', 'stone', '화강석 버너 마감', 'Granite, flamed finish', '#a29c94', 0.8, 0, { textures: 'granite_tile' }),
];
const veined = (key, ko, en, base, veins, angle, extra = {}) => P(`stone-${key}`, 'stone', ko, en, base, extra.rough ?? 0.15, 0, { ...(extra.rough > 0.35 ? {} : POLISH), pattern: { kind: 'marble', base, veins, angle, size: 1.4, cloud: extra.cloud ?? 0.12, cloudScale: extra.cloudScale ?? 0.35, grain: 0.03, streak: extra.streak, speckle: extra.speckle, bump: 0.1 } });
const quartzite = [
  veined('quartzite-taj-mahal', '타지마할 규암', 'Taj Mahal quartzite', '#e6dccb', [['#bfa983', 0.004, 8, 0.6], ['#f4ede1', 0.003, 10, 0.6]], 20),
  veined('quartzite-super-white', '슈퍼 화이트 규암', 'Super White quartzite', '#dfe0df', [['#8e9399', 0.005, 10, 0.6], ['#f2f3f2', 0.004, 8, 0.6]], 15),
  veined('quartzite-fantasy-brown', '판타지 브라운 규암', 'Fantasy Brown quartzite', '#c6bcae', [['#6e5b4a', 0.006, 14, 0.65], ['#ece6dc', 0.004, 12, 0.6]], 5),
  veined('quartzite-mont-blanc', '몽블랑 규암', 'Mont Blanc quartzite', '#d8d8d4', [['#9da0a3', 0.003, 16, 0.55]], 10),
  veined('quartzite-patagonia', '파타고니아 규암', 'Patagonia quartzite', '#ddd4c2', [['#7a5a3c', 0.012, 10, 0.7], ['#3f3a36', 0.004, 8, 0.6]], 70, { cloud: 0.35, cloudScale: 0.12 }),
  veined('quartzite-blue-roma', '블루 로마 규암', 'Blue Roma quartzite', '#bcc6cf', [['#4f6d8c', 0.008, 10, 0.75], ['#e7d3a8', 0.003, 8, 0.6]], 35),
];
const travertine = [
  ['classic', '클래식 트래버틴', 'Classic travertine', '#d8c7a6'], ['silver', '실버 트래버틴', 'Silver travertine', '#b9b4aa'],
  ['noce', '노체 트래버틴', 'Noce travertine', '#a5805c'], ['ivory', '아이보리 트래버틴', 'Ivory travertine', '#e6dcc8'],
  ['romano-filled', '로마노 트래버틴(필링)', 'Travertino Romano, filled', '#d6c3a0'],
].map(([key, ko, en, base]) => P(`stone-travertine-${key}`, 'stone', ko, en, base, key.includes('filled') ? 0.3 : 0.55, 0, {
  pattern: { kind: 'marble', base, veins: [[shade(base, 0.82), 0.003, 26, 0.5], [shade(base, 1.08), 0.006, 16, 0.6]], angle: 0, size: 1.2, grain: 0.18, streak: 'x', cloud: 0.15, cloudScale: 0.2, speckle: key.includes('filled') ? [] : [[shade(base, 0.62), 0.03, 0.003]], bump: 0.5 },
}));
const limestone = [
  P('stone-limestone-jura', 'stone', '쥐라 석회암 베이지', 'Jura limestone, beige', '#d6c8ab', 0.45, 0, { pattern: { kind: 'plain', base: '#d6c8ab', cloud: 0.15, cloudScale: 0.15, grain: 0.06, speckle: [['#a99576', 0.025, 0.004], ['#8a8072', 0.01, 0.003]], size: 0.8, bump: 0.2 } }),
  P('stone-limestone-portland', 'stone', '포틀랜드 석회암', 'Portland limestone', '#e3dccd', 0.6, 0, { pattern: { kind: 'plain', base: '#e3dccd', cloud: 0.12, cloudScale: 0.1, grain: 0.12, speckle: [['#cfc5b1', 0.12, 0.002]], size: 0.8, bump: 0.3 } }),
  P('stone-limestone-moleanos', 'stone', '몰레아노스 석회암', 'Moleanos limestone', '#d9cfb9', 0.45, 0, { pattern: { kind: 'marble', base: '#d9cfb9', veins: [['#c2b496', 0.004, 18, 0.45]], angle: 0, size: 1.2, cloud: 0.12, cloudScale: 0.15, grain: 0.1, streak: 'x', bump: 0.2 } }),
  P('stone-limestone-blue', 'stone', '블루스톤(벨기에)', 'Belgian bluestone', '#4f5459', 0.5, 0, { pattern: { kind: 'plain', base: '#4f5459', cloud: 0.12, cloudScale: 0.2, grain: 0.08, speckle: [['#6d7378', 0.04, 0.003], ['#e2e2df', 0.006, 0.002]], size: 0.8, bump: 0.2 } }),
  P('stone-limestone-grey', 'stone', '그레이 석회암', 'Grey limestone', '#a6a39b', 0.5, 0, { pattern: { kind: 'plain', base: '#a6a39b', cloud: 0.18, cloudScale: 0.18, grain: 0.08, speckle: [['#87837a', 0.04, 0.003]], size: 0.8, bump: 0.2 } }),
];
const slate = [
  ['charcoal', '차콜', 'charcoal', '#3d3f42'], ['green', '그린', 'green', '#4b5a50'], ['rust', '러스트', 'rust', '#6f5446'],
  ['grey', '그레이', 'grey', '#6c6e70'], ['purple', '퍼플', 'purple', '#4f4552'],
].map(([key, ko, en, color]) => P(`stone-slate-${key}`, 'stone', `슬레이트 ${ko}`, `Slate, ${en}`, color, 0.7, 0, { textures: 'slate_floor' }));
const onyx = [
  veined('onyx-honey', '허니 오닉스', 'Honey onyx', '#d39a4e', [['#f1d39a', 0.01, 16, 0.6], ['#8f5a26', 0.004, 14, 0.6]], 5, { cloud: 0.3, cloudScale: 0.12 }),
  veined('onyx-white', '화이트 오닉스', 'White onyx', '#efeadf', [['#d6c9ad', 0.008, 18, 0.5], ['#ffffff', 0.006, 12, 0.6]], 0, { cloud: 0.25, cloudScale: 0.12 }),
  veined('onyx-green', '그린 오닉스', 'Green onyx', '#9db58a', [['#e4eccd', 0.008, 16, 0.55], ['#4f6b3d', 0.005, 12, 0.6]], 10, { cloud: 0.3, cloudScale: 0.12 }),
  veined('onyx-pink', '핑크 오닉스', 'Pink onyx', '#e4b9aa', [['#f6e2d8', 0.009, 16, 0.55], ['#b47766', 0.004, 12, 0.55]], 0, { cloud: 0.3, cloudScale: 0.12 }),
  veined('onyx-black', '블랙 오닉스', 'Black onyx', '#26221f', [['#7a6a5b', 0.008, 14, 0.55], ['#cdbfae', 0.002, 10, 0.5]], 15, { cloud: 0.3, cloudScale: 0.12 }),
  veined('onyx-blue', '블루 오닉스', 'Blue onyx', '#8fb1c3', [['#e3eff4', 0.008, 16, 0.55], ['#3e6880', 0.004, 12, 0.55]], 5, { cloud: 0.3, cloudScale: 0.12 }),
];
const plainStone = (key, ko, en, base, rough, extra) => P(`stone-${key}`, 'stone', ko, en, base, rough, 0, { pattern: { kind: 'plain', base, size: 0.6, bump: 0.3, ...extra } });
const otherStone = [
  plainStone('basalt-honed', '현무암(혼드)', 'Basalt, honed', '#3b3c3e', 0.45, { cloud: 0.08, grain: 0.08, speckle: [['#4c4e51', 0.15, 0.0015]] }),
  plainStone('basalt-jeju', '제주 현무암(다공질)', 'Jeju basalt, porous', '#46474a', 0.9, { cloud: 0.12, grain: 0.2, speckle: [['#1b1b1c', 0.12, 0.004], ['#5c5e61', 0.1, 0.002]], bump: 1.2 }),
  plainStone('sandstone-yellow', '샌드스톤 옐로', 'Sandstone, yellow', '#cdb07e', 0.85, { cloud: 0.15, cloudScale: 0.2, grain: 0.2, streak: 'x', speckle: [['#b39463', 0.08, 0.0015]] }),
  plainStone('sandstone-red', '샌드스톤 레드', 'Sandstone, red', '#a0583e', 0.85, { cloud: 0.15, cloudScale: 0.2, grain: 0.2, streak: 'x', speckle: [['#80412d', 0.08, 0.0015]] }),
  plainStone('sandstone-grey', '샌드스톤 그레이', 'Sandstone, grey', '#a19c90', 0.85, { cloud: 0.15, cloudScale: 0.2, grain: 0.2, streak: 'x', speckle: [['#837e72', 0.08, 0.0015]] }),
  P('stone-sandstone-blocks', 'stone', '샌드스톤 블록', 'Sandstone blocks', '#d8c7a5', 0.85, 0, { textures: 'white_sandstone_bricks' }),
  P('stone-sandstone-blocks-warm', 'stone', '샌드스톤 블록 웜', 'Sandstone blocks, warm', '#c9a274', 0.85, 0, { textures: 'white_sandstone_bricks' }),
  plainStone('soapstone', '동석(소프스톤)', 'Soapstone', '#4e5553', 0.55, { cloud: 0.2, cloudScale: 0.2, grain: 0.05 }),
  P('stone-soapstone-veined', 'stone', '동석 베인', 'Soapstone, veined', '#4b524f', 0.55, 0, { pattern: { kind: 'marble', base: '#4b524f', veins: [['#8b9590', 0.0015, 18, 0.6]], angle: 50, size: 1.2, cloud: 0.15, cloudScale: 0.2, bump: 0.1 } }),
  plainStone('lava-stone', '라바 스톤(유약)', 'Glazed lava stone', '#2f5966', 0.15, { cloud: 0.25, cloudScale: 0.08, speckle: [['#21424d', 0.06, 0.003]], bump: 0.1 }),
  plainStone('pietra-serena', '피에트라 세레나', 'Pietra Serena', '#8c9096', 0.6, { cloud: 0.12, cloudScale: 0.2, grain: 0.1, speckle: [['#767a80', 0.1, 0.0015]] }),
  veined('pietra-grey', '피에트라 그레이', 'Pietra Grey', '#4c4d50', [['#d9d9d5', 0.0008, 30, 0.75]], 25),
  P('stone-stacked-grey', 'stone', '적층 석재 그레이', 'Stacked stone, grey', '#8f8d88', 0.85, 0, { textures: 'stacked_stone_wall' }),
  P('stone-stacked-beige', 'stone', '적층 석재 베이지', 'Stacked stone, beige', '#bba98e', 0.85, 0, { textures: 'stacked_stone_wall' }),
  P('stone-stacked-dark', 'stone', '적층 석재 다크', 'Stacked stone, dark', '#4c4b49', 0.85, 0, { textures: 'stacked_stone_wall' }),
];
const QUARTZ = [
  ['white-sparkle', '화이트 스파클', 'white sparkle', '#f0efec', [['#ffffff', 0.04, 0.0012], ['#cfcfcd', 0.06, 0.0015]]],
  ['grey', '그레이', 'grey', '#9b9a97', [['#7c7b78', 0.15, 0.0015], ['#c3c2bf', 0.12, 0.0015]]],
  ['black', '블랙', 'black', '#1f1f21', [['#3a3a3c', 0.12, 0.0015], ['#c8c8c4', 0.02, 0.0012]]],
  ['beige', '베이지', 'beige', '#d9cdb7', [['#bba987', 0.12, 0.0015], ['#ebe3d2', 0.12, 0.0015]]],
  ['concrete', '콘크리트 룩', 'concrete look', '#a6a39d', [['#8e8b85', 0.1, 0.002]]],
];
const quartz = [
  ...QUARTZ.map(([key, ko, en, base, speckle]) => P(`stone-quartz-${key}`, 'stone', `엔지니어드 스톤 ${ko}`, `Engineered quartz, ${en}`, base, 0.15, 0, { ...POLISH, pattern: { kind: 'plain', base, speckle, cloud: key === 'concrete' ? 0.25 : 0.05, cloudScale: 0.25, size: 0.4, bump: 0.03 } })),
  veined('quartz-calacatta', '엔지니어드 스톤 칼라카타', 'Engineered quartz, Calacatta look', '#f2f1ee', [['#9b917f', 0.006, 4, 0.8], ['#b9b1a1', 0.002, 6, 0.6]], 50, { cloud: 0.04 }),
  veined('quartz-carrara', '엔지니어드 스톤 카라라', 'Engineered quartz, Carrara look', '#eeeeec', [['#a8abaf', 0.0015, 18, 0.5]], 25, { cloud: 0.04 }),
  veined('quartz-statuario', '엔지니어드 스톤 스타투아리오', 'Engineered quartz, Statuario look', '#f4f4f2', [['#6f7276', 0.005, 3, 0.8]], 60, { cloud: 0.04 }),
];
const terrazzoStone = [
  ['white', '테라조 화이트', 'Terrazzo, white', '#ece9e3', [['#bdb7ad', 0.003, 0.009, 3000], ['#7e7a74', 0.003, 0.008, 1000], ['#ddb69a', 0.003, 0.008, 600]]],
  ['ochre', '테라조 오커', 'Terrazzo, ochre', '#d9c193', [['#a87b3c', 0.005, 0.016, 1500], ['#f2ebdc', 0.004, 0.012, 1500], ['#3f3d3a', 0.003, 0.008, 600]]],
  ['blue', '테라조 블루', 'Terrazzo, blue', '#b9c6d1', [['#355f8a', 0.005, 0.016, 1300], ['#f2f1ee', 0.004, 0.012, 1600], ['#e1a690', 0.003, 0.01, 500]]],
].map(([key, ko, en, base, chips]) => P(`stone-terrazzo-${key}`, 'stone', ko, en, base, 0.3, 0, { ...POLISH, pattern: { kind: 'terrazzo', base, chips, size: 0.5, grain: 0.04, bump: 0.12 } }));

// ═════════════════════════ wall finishes

const WALL_PAINTS = [
  ['greige', '그레이지', 'Greige', '#c4bbad'], ['mushroom', '머쉬룸', 'Mushroom', '#a99a8a'], ['olive', '올리브', 'Olive', '#7d7a55'],
  ['navy', '네이비', 'Navy', '#2f3d55'], ['charcoal', '차콜', 'Charcoal', '#45474a'], ['blush', '블러시 핑크', 'Blush pink', '#e2c4ba'],
  ['ochre', '오커', 'Ochre', '#c99a4a'], ['forest', '포레스트 그린', 'Forest green', '#34503f'], ['sky', '스카이 블루', 'Sky blue', '#b5cbdc'],
  ['lavender', '라벤더', 'Lavender', '#bfb6cf'], ['cream', '크림', 'Cream', '#efe6cf'], ['butter', '버터 옐로', 'Butter yellow', '#f0dc9e'],
].map(([key, ko, en, color]) => P(`wall-paint-${key}`, 'wall', `벽 페인트 ${ko}`, `Wall paint, ${en.toLowerCase()}`, color, 0.88));
const plaster = (key, ko, en, base, rough, pattern, extra = {}) => P(`wall-${key}`, 'wall', ko, en, base, rough, 0, { ...extra, pattern: { kind: 'plain', base, size: 1.2, ...pattern } });
const plasters = [
  // Venetian plaster: burnished, low-contrast marbling.
  ...[['white', '화이트', 'white', '#ece8e1'], ['grey', '그레이', 'grey', '#a9a7a3'], ['terracotta', '테라코타', 'terracotta', '#b77457'], ['green', '그린', 'green', '#7f8f7a'], ['black', '블랙', 'black', '#2e2e30']]
    .map(([key, ko, en, base]) => P(`wall-venetian-${key}`, 'wall', `베네치안 플라스터 ${ko}`, `Venetian plaster, ${en}`, base, 0.25, 0, { clearcoat: 0.35, clearcoatRoughness: 0.25, pattern: { kind: 'marble', base, veins: [[shade(base, 1.12), 0.03, 10, 0.25], [shade(base, 0.88), 0.02, 10, 0.25]], angle: 20, size: 1.4, cloud: 0.3, cloudScale: 0.15, bump: 0.05 } })),
  // Lime wash: strong, brushy mottling.
  ...[['white', '화이트', 'white', '#e9e3d6'], ['stone', '스톤', 'stone', '#c7bba7'], ['terracotta', '테라코타', 'terracotta', '#c48463'], ['sage', '세이지', 'sage', '#a3ad95'], ['blue', '블루', 'blue', '#8ea3b4'], ['ochre', '오커', 'ochre', '#cfa565']]
    .map(([key, ko, en, base]) => plaster(`limewash-${key}`, `라임 워시 ${ko}`, `Lime wash, ${en}`, base, 0.95, { cloud: 0.45, cloudScale: 0.18, grain: 0.06, bump: 0.15 })),
  ...[['grey', '그레이', 'grey', '#a3a19d'], ['white', '화이트', 'white', '#dcd8d0'], ['sand', '샌드', 'sand', '#c8b89f'], ['anthracite', '앤트러사이트', 'anthracite', '#4d4e50'], ['clay', '클레이', 'clay', '#b58e72']]
    .map(([key, ko, en, base]) => plaster(`microcement-${key}`, `마이크로시멘트 ${ko}`, `Microcement, ${en}`, base, 0.6, { cloud: 0.22, cloudScale: 0.25, grain: 0.08, speckle: [[shade(base, 0.85), 0.03, 0.0015]], bump: 0.2 })),
  ...[['white', '화이트', 'white', '#ebe6dc'], ['rose', '로즈', 'rose', '#d1a597'], ['moss', '모스', 'moss', '#7b8466']]
    .map(([key, ko, en, base]) => P(`wall-tadelakt-${key}`, 'wall', `타데락트 ${ko}`, `Tadelakt, ${en}`, base, 0.3, 0, { clearcoat: 0.5, clearcoatRoughness: 0.2, pattern: { kind: 'plain', base, size: 1.2, cloud: 0.3, cloudScale: 0.1, bump: 0.15 } })),
  P('wall-clay-plaster-natural', 'wall', '황토 미장', 'Clay plaster (hwangto)', '#bf9468', 0.95, 0, { textures: 'clay_plaster' }),
  P('wall-clay-plaster-white', 'wall', '백토 미장', 'White clay plaster', '#ddd2c0', 0.95, 0, { textures: 'clay_plaster' }),
  P('wall-clay-plaster-grey', 'wall', '회색 점토 미장', 'Grey clay plaster', '#a19c93', 0.95, 0, { textures: 'clay_plaster' }),
  P('wall-stucco-white', 'wall', '스투코 화이트', 'Stucco, white', '#ece9e2', 0.95, 0, { textures: 'white_stucco' }),
  P('wall-stucco-sand', 'wall', '스투코 샌드', 'Stucco, sand', '#d6c6aa', 0.95, 0, { textures: 'white_stucco' }),
  P('wall-stucco-grey', 'wall', '스투코 그레이', 'Stucco, grey', '#b2afa9', 0.95, 0, { textures: 'white_stucco' }),
  P('wall-painted-plaster-white', 'wall', '도장 미장벽 화이트', 'Painted plaster, white', '#ebe8e2', 0.9, 0, { textures: 'painted_plaster_wall' }),
  P('wall-painted-plaster-warm', 'wall', '도장 미장벽 웜그레이', 'Painted plaster, warm grey', '#bdb3a6', 0.9, 0, { textures: 'painted_plaster_wall' }),
  P('wall-painted-plaster-blue', 'wall', '도장 미장벽 블루', 'Painted plaster, blue', '#7f97ab', 0.9, 0, { textures: 'painted_plaster_wall' }),
];
const paper = (key, ko, en, color, pattern, rough = 0.85) => P(`wallpaper-${key}`, 'wall', ko, en, color, rough, 0, { pattern: { grain: 0.04, bump: 0.15, ...pattern } });
const wallpapers = [
  paper('pinstripe-navy', '핀스트라이프 벽지 네이비', 'Pinstripe wallpaper, navy', '#2f3d58', { kind: 'stripes', widths: [0.022, 0.002], colors: ['#2f3d58', '#c9c3b4'] }),
  paper('regency-sage', '리젠시 스트라이프 벽지 세이지', 'Regency stripe wallpaper, sage', '#b4bfa6', { kind: 'stripes', widths: [0.05, 0.008, 0.012, 0.008], colors: ['#c6cfb9', '#8f9e83', '#c6cfb9', '#8f9e83'] }),
  paper('ticking-blue', '티킹 스트라이프 벽지 블루', 'Ticking stripe wallpaper, blue', '#c9d1d8', { kind: 'stripes', widths: [0.03, 0.004, 0.004, 0.004], colors: ['#ecebe5', '#3f5f86', '#ecebe5', '#3f5f86'], grain: 0.1, streak: 'y' }),
  paper('candy-pink', '캔디 스트라이프 벽지 핑크', 'Candy stripe wallpaper, pink', '#ecd2cc', { kind: 'stripes', widths: [0.025, 0.025], colors: ['#f4ece6', '#e3b7ad'] }),
  paper('awning-green', '와이드 스트라이프 벽지 그린', 'Wide awning stripe wallpaper, green', '#8aa38e', { kind: 'stripes', widths: [0.1, 0.1], colors: ['#ece9df', '#3f6b52'] }),
  paper('stripe-ochre', '투톤 스트라이프 벽지 오커', 'Two-tone stripe wallpaper, ochre', '#d6b77a', { kind: 'stripes', widths: [0.06, 0.06], colors: ['#dcc08a', '#cfac6a'] }),
  paper('damask-gold', '다마스크 벽지 골드', 'Damask wallpaper, gold', '#d8c9a5', { kind: 'damask', w: 0.26, h: 0.4, base: '#e3d7bb', ink: '#c2a668', bump: 0.3 }, 0.6),
  paper('damask-grey', '다마스크 벽지 그레이', 'Damask wallpaper, grey', '#b9b8b5', { kind: 'damask', w: 0.26, h: 0.4, base: '#c9c8c5', ink: '#9a9995', bump: 0.3 }, 0.6),
  paper('damask-burgundy', '다마스크 벽지 버건디', 'Damask wallpaper, burgundy', '#6a2a2e', { kind: 'damask', w: 0.26, h: 0.4, base: '#6e2a2f', ink: '#8e4448', bump: 0.3 }, 0.6),
  paper('damask-navy', '다마스크 벽지 네이비', 'Damask wallpaper, navy', '#2d3a55', { kind: 'damask', w: 0.26, h: 0.4, base: '#2c3954', ink: '#b59a5e', bump: 0.3 }, 0.6),
  paper('damask-white', '다마스크 벽지 화이트', 'Damask wallpaper, white on white', '#ecebe6', { kind: 'damask', w: 0.26, h: 0.4, base: '#eeede8', ink: '#e1e0da', bump: 0.6 }, 0.6),
  paper('botanical-green', '보태니컬 벽지 그린', 'Botanical wallpaper, green leaves', '#c9d1bf', { kind: 'botanical', base: '#ebe9e0', colors: ['#4f7a52', '#6d9466', '#3b5f42'], leaf: 0.1, density: 90 }),
  paper('botanical-dark', '보태니컬 벽지 다크', 'Botanical wallpaper, dark jungle', '#2c3b31', { kind: 'botanical', base: '#1f2b25', colors: ['#3f6b4c', '#5a8a5c', '#2f5040', '#c69c58'], leaf: 0.12, density: 140 }),
  paper('botanical-blush', '보태니컬 벽지 블러시', 'Botanical wallpaper, blush', '#e7d3cb', { kind: 'botanical', base: '#f1e4de', colors: ['#c99486', '#d9ab9c', '#a77b6e'], leaf: 0.08, density: 80 }),
  paper('botanical-blue', '보태니컬 벽지 블루', 'Botanical wallpaper, blue toile', '#d9dde3', { kind: 'botanical', base: '#eef0f2', colors: ['#3f5f86', '#5a7aa0'], leaf: 0.07, density: 70 }),
  paper('botanical-ochre', '보태니컬 벽지 오커', 'Botanical wallpaper, ochre', '#d8b76f', { kind: 'botanical', base: '#d7b46a', colors: ['#f2e7cf', '#8e6a2d'], leaf: 0.09, density: 70 }),
  paper('trellis-green', '트렐리스 벽지 그린', 'Trellis wallpaper, green', '#cfd7c6', { kind: 'diamond', w: 0.12, h: 0.18, colors: ['#ecebe3'], grout: '#5d7f62', groutWidth: 0.004 }),
  paper('trellis-grey', '트렐리스 벽지 그레이', 'Trellis wallpaper, grey', '#d6d5d1', { kind: 'diamond', w: 0.12, h: 0.18, colors: ['#ecebe7'], grout: '#8c8b88', groutWidth: 0.003 }),
  paper('harlequin', '할리퀸 벽지', 'Harlequin wallpaper', '#b9b0c3', { kind: 'diamond', w: 0.12, h: 0.2, checker: true, colors: ['#d7cfe0', '#9c91a9'], groutWidth: 0 }),
  paper('dots-black', '도트 벽지 블랙', 'Polka-dot wallpaper, black', '#e2e0db', { kind: 'dots', spacing: 0.06, r: 0.008, base: '#efede8', colors: ['#2a2a2c'] }),
  paper('dots-gold', '도트 벽지 골드', 'Polka-dot wallpaper, gold', '#2d3a4e', { kind: 'dots', spacing: 0.05, r: 0.005, base: '#2c394d', colors: ['#c8a85c'] }),
  paper('hexagon-geo', '헥사곤 기하학 벽지', 'Geometric hexagon wallpaper', '#d6d2c9', { kind: 'hexagon', size: 0.1, colors: ['#e9e5dc', '#d8d2c6', '#c3bcae'], grout: '#8b8478', groutWidth: 0.002 }),
  paper('grasscloth-natural', '그라스클로스 내추럴', 'Grasscloth, natural', '#c8b48e', { kind: 'stripes', widths: [0.91], colors: ['#c8b48e'], grain: 0.35, streak: 'x', cloud: 0.15, cloudScale: 0.06, bump: 0.5 }, 0.95),
  paper('grasscloth-grey', '그라스클로스 그레이', 'Grasscloth, grey', '#a7a39b', { kind: 'stripes', widths: [0.91], colors: ['#a7a39b'], grain: 0.35, streak: 'x', cloud: 0.15, cloudScale: 0.06, bump: 0.5 }, 0.95),
  paper('grasscloth-navy', '그라스클로스 네이비', 'Grasscloth, navy', '#33405a', { kind: 'stripes', widths: [0.91], colors: ['#33405a'], grain: 0.35, streak: 'x', cloud: 0.15, cloudScale: 0.06, bump: 0.5 }, 0.95),
  paper('grasscloth-gold', '그라스클로스 골드', 'Grasscloth, gold', '#c9a95e', { kind: 'stripes', widths: [0.91], colors: ['#c9a95e'], grain: 0.35, streak: 'x', cloud: 0.15, cloudScale: 0.06, bump: 0.5 }, 0.7),
  paper('hanji-white', '한지 벽지 백색', 'Hanji wallpaper, white', '#efeadf', { kind: 'plain', base: '#efeadf', grain: 0.12, cloud: 0.12, cloudScale: 0.05, speckle: [['#d9cfbd', 0.04, 0.002]], size: 0.6, bump: 0.4 }, 0.95),
  paper('hanji-ivory', '한지 벽지 미색', 'Hanji wallpaper, ivory', '#e9dcc2', { kind: 'plain', base: '#e9dcc2', grain: 0.12, cloud: 0.15, cloudScale: 0.05, speckle: [['#cdb995', 0.05, 0.002]], size: 0.6, bump: 0.4 }, 0.95),
  paper('hanji-pattern', '한지 벽지 꽃문양', 'Hanji wallpaper, floral', '#e5dac6', { kind: 'damask', w: 0.2, h: 0.2, base: '#ece2cf', ink: '#ddcfb5', grain: 0.12, bump: 0.5 }, 0.95),
];
const brickWalls = [
  P('wall-brick-dark', 'wall', '다크 벽돌', 'Dark brick', '#4a3a33', 0.85, 0, { textures: 'dark_brick_wall' }),
  P('wall-brick-charcoal', 'wall', '차콜 벽돌', 'Charcoal brick', '#33302f', 0.85, 0, { textures: 'dark_brick_wall' }),
  P('wall-brick-white-clean', 'wall', '화이트 벽돌(깨끗한)', 'White brick, clean', '#e9e6df', 0.85, 0, { textures: 'white_bricks' }),
  P('wall-brick-cream', 'wall', '크림 벽돌', 'Cream brick', '#ddd0b5', 0.85, 0, { textures: 'white_bricks' }),
  P('wall-brick-london', 'wall', '런던 스톡 벽돌', 'London stock brick', '#b59a6c', 0.85, 0, { repeat: 1.2, textures: 'red_brick' }),
  P('wall-brick-brown', 'wall', '브라운 벽돌', 'Brown brick', '#6e4a36', 0.85, 0, { repeat: 1.2, textures: 'red_brick' }),
  P('wall-brick-orange', 'wall', '오렌지 벽돌', 'Orange brick', '#b2623f', 0.85, 0, { repeat: 1.2, textures: 'red_brick' }),
  P('wall-brick-grey-wash', 'wall', '그레이 워시 벽돌', 'Grey-washed brick', '#a7a39c', 0.85, 0, { repeat: 1.2, textures: 'whitewashed_brick' }),
  P('wall-brick-painted-black', 'wall', '블랙 도장 벽돌', 'Painted brick, black', '#2c2c2d', 0.8, 0, { repeat: 1.2, textures: 'whitewashed_brick' }),
  ...[['white', '화이트', 'white', '#eeece6', '#cfcac0'], ['green', '그린', 'green', '#3f6b55', '#d2cdc2'], ['blue', '블루', 'blue', '#3e5f86', '#d2cdc2'], ['ochre', '오커', 'ochre', '#c99a3e', '#d9d3c7']]
    .map(([key, ko, en, color, grout]) => P(`wall-brick-glazed-${key}`, 'wall', `유약 벽돌 ${ko}`, `Glazed brick, ${en}`, color, 0.15, 0, { ...GLAZE, pattern: { kind: 'brick', w: 0.215, h: 0.065, colors: [color], grout, groutWidth: 0.01, variation: 0.06, cloud: 0.15, cloudScale: 0.04, bump: 1.2 } })),
  P('wall-brick-thin-red', 'wall', '전벽돌 레드', 'Brick slips, red', '#9b4b36', 0.85, 0, { pattern: { kind: 'brick', w: 0.19, h: 0.057, colors: ['#9b4b36', '#8a4230', '#a8563d', '#7e3c2b'], grout: '#c3bba9', groutWidth: 0.01, variation: 0.1, grain: 0.18, cloud: 0.25, cloudScale: 0.04, bump: 1.2 } }),
  P('wall-brick-stack-grey', 'wall', '스택 본드 벽돌 그레이', 'Stack-bond brick, grey', '#8e8b86', 0.8, 0, { pattern: { kind: 'grid', w: 0.29, h: 0.05, colors: ['#8e8b86', '#7f7c77', '#9a9792'], grout: '#bcb8b0', groutWidth: 0.008, variation: 0.06, grain: 0.15, cloud: 0.2, cloudScale: 0.05, bump: 1.2 } }),
];
const slats = (key, ko, en, color, gap) => P(`wall-slat-${key}`, 'wall', ko, en, color, 0.55, 0, { pattern: { kind: 'stripes', widths: [0.027, gap], heights: [1, 0], colors: [color, '#1f1f20'], variation: 0.05, grain: 0.2, streak: 'y', cloud: 0.15, cloudScale: 0.08, bump: 1.5 } });
const panelling = [
  P('wall-planks-natural', 'wall', '원목 판재 벽 내추럴', 'Plank wall, natural', '#b58d63', 0.65, 0, { textures: 'wood_plank_wall' }),
  P('wall-planks-white', 'wall', '원목 판재 벽 화이트 워시', 'Plank wall, white-washed', '#ddd5c7', 0.65, 0, { textures: 'wood_plank_wall' }),
  P('wall-planks-dark', 'wall', '원목 판재 벽 다크', 'Plank wall, dark', '#5a4232', 0.6, 0, { textures: 'wood_plank_wall' }),
  P('wall-wood-panel-oak', 'wall', '나무 패널 오크', 'Wood panelling, oak', '#bf9a6e', 0.6, 0, { repeat: 1.5, textures: 'wooden_panels' }),
  P('wall-wood-panel-painted', 'wall', '나무 패널 도장 그린', 'Wood panelling, painted green', '#5b6f5d', 0.55, 0, { repeat: 1.5, textures: 'wooden_panels' }),
  slats('oak', '오크 루버(흡음) 패널', 'Oak slat acoustic panel', '#b88f62', 0.013),
  slats('walnut', '월넛 루버(흡음) 패널', 'Walnut slat acoustic panel', '#5f412e', 0.013),
  slats('ash', '애쉬 루버 패널', 'Ash slat panel', '#d6c29e', 0.02),
  slats('black', '블랙 루버 패널', 'Black slat panel', '#2b2a29', 0.02),
  P('wall-beadboard', 'wall', '비드보드 화이트', 'Beadboard, white', '#ecebe6', 0.55, 0, { pattern: { kind: 'stripes', widths: [0.1, 0.004], heights: [1, 0.2], colors: ['#ecebe6', '#c9c7c1'], bump: 1 } }),
  P('wall-bamboo', 'wall', '대나무 벽', 'Bamboo wall', '#c3a56c', 0.6, 0, { textures: 'bamboo_wall' }),
];
const concreteWalls = [
  P('wall-concrete-formwork', 'wall', '노출 콘크리트(송판)', 'Board-formed concrete', '#9e9b95', 0.8, 0, { pattern: { kind: 'brick', w: 2.4, h: 0.15, offset: 0.37, colors: ['#9e9b95', '#a6a39d', '#96938d'], grout: '#8c8984', groutWidth: 0.002, variation: 0.04, grain: 0.3, streak: 'x', cloud: 0.25, cloudScale: 0.3, cover: 2.4, bump: 0.6 } }),
  P('wall-concrete-panel', 'wall', '노출 콘크리트 패널(타이홀)', 'Concrete panels with tie holes', '#a3a09a', 0.75, 0, { pattern: { kind: 'dots', spacing: 0.6, r: 0.012, base: '#a3a09a', colors: ['#6f6c67'], stagger: false, cloud: 0.25, cloudScale: 0.4, grain: 0.08, bump: 0.6 } }),
  P('wall-concrete-light', 'wall', '노출 콘크리트 라이트', 'Exposed concrete, light', '#bcb9b3', 0.8, 0, { textures: 'concrete_wall_004' }),
];
const feltWalls = [
  ...[['grey', '그레이', 'grey', '#8a8a8a'], ['charcoal', '차콜', 'charcoal', '#3e3f41'], ['blue', '블루', 'blue', '#4c6283'], ['terracotta', '테라코타', 'terracotta', '#b0674a']]
    .map(([key, ko, en, base]) => P(`wall-felt-${key}`, 'wall', `흡음 펠트 ${ko}`, `Acoustic felt, ${en}`, base, 1, 0, { sheen: 0.4, pattern: { kind: 'plain', base, grain: 0.18, cloud: 0.08, cloudScale: 0.05, size: 0.4, bump: 0.5 } })),
  P('wall-cork', 'wall', '코르크 보드 벽', 'Cork wall', '#b48a5c', 0.85, 0, { pattern: { kind: 'plain', base: '#b48a5c', grain: 0.35, cloud: 0.2, cloudScale: 0.05, speckle: [['#6e4a2b', 0.12, 0.0025], ['#d9b386', 0.1, 0.002]], size: 0.5, bump: 0.8 } }),
  P('wall-fabric-panel', 'wall', '패브릭 벽 패널', 'Upholstered wall panels', '#c9bba6', 0.95, 0, { sheen: 0.5, pattern: { kind: 'grid', w: 0.6, h: 1.2, colors: ['#c9bba6'], grout: '#9a8e7d', groutWidth: 0.006, grain: 0.15, bump: 1.5 } }),
];

// ═════════════════════════ carpet & rugs

const CUT_PILE = [
  ['charcoal', '차콜', 'charcoal', '#46474a'], ['taupe', '토프', 'taupe', '#8f8273'], ['navy', '네이비', 'navy', '#2c3850'], ['oatmeal', '오트밀', 'oatmeal', '#cbbda4'],
  ['sage', '세이지', 'sage', '#8e9a82'], ['burgundy', '버건디', 'burgundy', '#6b2a30'], ['ivory', '아이보리', 'ivory', '#e7e0d0'], ['teal', '틸', 'teal', '#2f6467'],
  ['rust', '러스트', 'rust', '#9a5333'], ['silver', '실버', 'silver', '#b3b3b1'],
];
const pile = (id, ko, en, color, extra) => P(id, 'carpet', ko, en, color, 1, 0, { sheen: 0.8, ...extra });
const carpets = [
  ...CUT_PILE.map(([key, ko, en, color]) => pile(`carpet-cut-${key}`, `컷 파일 카펫 ${ko}`, `Cut-pile carpet, ${en}`, color, { textures: 'polar_fleece' })),
  ...[['grey', '그레이', 'grey', '#8f8e8b'], ['beige', '베이지', 'beige', '#c7b89e'], ['oatmeal', '오트밀', 'oatmeal', '#d2c6b0'], ['charcoal', '차콜', 'charcoal', '#4a4b4d'],
    ['blue', '블루', 'blue', '#56698a'], ['green', '그린', 'green', '#5f6e57'], ['brown', '브라운', 'brown', '#6b5442'], ['flint', '플린트', 'flint', '#77746f']]
    .map(([key, ko, en, color]) => pile(`carpet-berber-${key}`, `베르베르 루프 카펫 ${ko}`, `Berber loop carpet, ${en}`, color, { sheen: 0.5, pattern: { kind: 'plain', base: color, size: 0.3, grain: 0.35, speckle: [[shade(color, 0.72), 0.12, 0.003], [shade(color, 1.18), 0.1, 0.003]], bump: 1.5 } })),
  ...[['grey', '그레이', 'grey', '#8b8985'], ['beige', '베이지', 'beige', '#c3b293'], ['blue', '블루', 'blue', '#5a6c88'], ['mocha', '모카', 'mocha', '#6f5a4a']]
    .map(([key, ko, en, color]) => pile(`carpet-frieze-${key}`, `프리즈(트위스트) 카펫 ${ko}`, `Frieze twist carpet, ${en}`, color, { sheen: 0.9, pattern: { kind: 'plain', base: color, size: 0.3, grain: 0.45, cloud: 0.12, cloudScale: 0.02, speckle: [[shade(color, 0.8), 0.15, 0.002]], bump: 1.8 } })),
  ...[['cream', '크림', 'cream', '#e5dccb'], ['grey', '그레이', 'grey', '#9a9895'], ['blush', '블러시', 'blush', '#d8b8ae'], ['champagne', '샴페인', 'champagne', '#d6c3a0']]
    .map(([key, ko, en, color]) => pile(`carpet-saxony-${key}`, `색소니 플러시 카펫 ${ko}`, `Saxony plush carpet, ${en}`, color, { sheen: 1, textures: 'polar_fleece' })),
  ...[['white', '화이트', 'white', '#ece7dc'], ['grey', '그레이', 'grey', '#9e9b96'], ['charcoal', '차콜', 'charcoal', '#4b4b4d'], ['pink', '핑크', 'pink', '#e1b9b3'], ['mustard', '머스터드', 'mustard', '#c99a3b']]
    .map(([key, ko, en, color]) => pile(`carpet-shag-${key}`, `샤기 카펫 ${ko}`, `Shag rug, ${en}`, color, { sheen: 1, textures: 'curly_teddy_natural' })),
];
const fibre = (key, ko, en, color, w, n, fibres, colors) => P(`carpet-${key}`, 'carpet', ko, en, color, 0.95, 0, { sheen: 0.3, pattern: { kind: 'basketweave', w, n, fibres, colors, grout: shade(color, 0.55), groutWidth: w * 0.08, variation: 0.06, grain: 0.15, bump: 2 } });
const naturals = [
  fibre('sisal-natural', '사이잘 내추럴', 'Sisal, natural', '#c7ac7d', 0.008, 3, 3, ['#c7ac7d', '#bb9f70', '#d2b98b']),
  fibre('sisal-grey', '사이잘 그레이', 'Sisal, grey', '#9c968b', 0.008, 3, 3, ['#9c968b', '#8f897e', '#a8a296']),
  fibre('sisal-herringbone', '사이잘 헤링본', 'Sisal, herringbone weave', '#bfa275', 0.006, 4, 2, ['#bfa275', '#b0915f']),
  fibre('sisal-boucle', '사이잘 부클레', 'Sisal, bouclé', '#d1bc95', 0.005, 2, 2, ['#d1bc95', '#c3ab80']),
  fibre('jute-chunky', '청키 황마', 'Chunky jute', '#b8955f', 0.02, 3, 4, ['#b8955f', '#a8854f', '#c6a46c']),
  fibre('jute-natural', '황마 내추럴', 'Jute, natural', '#bf9f6c', 0.012, 3, 3, ['#bf9f6c', '#b09060']),
  fibre('jute-bleached', '황마 표백', 'Jute, bleached', '#dccbab', 0.012, 3, 3, ['#dccbab', '#cfbd9b']),
  fibre('seagrass', '씨그라스', 'Seagrass', '#a7a072', 0.01, 4, 3, ['#a7a072', '#9a9466', '#b4ad7f']),
  fibre('seagrass-herringbone', '씨그라스 헤링본', 'Seagrass herringbone', '#9f9a6c', 0.008, 2, 3, ['#9f9a6c', '#8f8a5d']),
  P('carpet-wool-loop', 'carpet', '울 루프 카펫', 'Wool loop carpet', '#d9cfbd', 1, 0, { sheen: 0.6, pattern: { kind: 'dots', spacing: 0.006, r: 0.0026, base: '#c2b7a4', colors: ['#d9cfbd', '#e1d8c8', '#d1c6b3'], grain: 0.15, bump: 2 } }),
  P('carpet-wool-loop-grey', 'carpet', '울 루프 카펫 그레이', 'Wool loop carpet, grey', '#a4a29e', 1, 0, { sheen: 0.6, pattern: { kind: 'dots', spacing: 0.006, r: 0.0026, base: '#8a8884', colors: ['#a4a29e', '#aeaca8', '#9a9894'], grain: 0.15, bump: 2 } }),
];
const carpetTile = (key, ko, en, colors, pattern) => P(`carpet-tile-${key}`, 'carpet', ko, en, colors[0], 1, 0, { sheen: 0.5, pattern: { colors, grout: shade(colors[0], 0.8), groutWidth: 0.0015, variation: 0.06, grain: 0.35, streak: 'x', bump: 1.2, ...pattern } });
const carpetTiles = [
  ...[['grey', '그레이', 'grey', ['#7d7d7b', '#878784']], ['charcoal', '차콜', 'charcoal', ['#3f4042', '#47484a']], ['blue', '블루', 'blue', ['#3f5371', '#475d7d']], ['beige', '베이지', 'beige', ['#b5a68c', '#bfb197']],
    ['green', '그린', 'green', ['#56644f', '#5f6e58']], ['graphite-mix', '그래파이트 믹스', 'graphite mix', ['#3f4042', '#5c5d5f', '#77787a']], ['red-accent', '레드 포인트', 'red accent', ['#5a5b5d', '#5a5b5d', '#5a5b5d', '#8e3a33']], ['ocean-mix', '오션 믹스', 'ocean mix', ['#2f4d63', '#3f6a7c', '#5a8792']]]
    .map(([key, ko, en, colors]) => carpetTile(key, `카펫 타일 ${ko}`, `Carpet tiles, ${en}`, colors, { kind: 'grid', w: 0.5 })),
  ...[['grey', '그레이', 'grey', ['#77777a', '#828285', '#6c6c6f']], ['brown', '브라운', 'brown', ['#6c5a4b', '#77655a', '#5f4e41']], ['blue', '블루', 'blue', ['#3d4f69', '#465a76', '#34445c']], ['sand', '샌드', 'sand', ['#b9ab90', '#c3b69c', '#ad9f84']]]
    .map(([key, ko, en, colors]) => carpetTile(`plank-${key}`, `플랭크 카펫 타일 ${ko}`, `Carpet planks, ${en}`, colors, { kind: 'brick', w: 1, h: 0.25, offset: 'random', cover: 2 })),
];
// Rugs: one repeat = one rug (UV metres), so a rug object shows the whole design.
const rug = (key, ko, en, color, pattern) => P(`rug-${key}`, 'carpet', ko, en, color, 1, 0, { sheen: 0.7, pattern: { grain: 0.25, bump: 0.8, ...pattern } });
const persian = (key, ko, en, field, borders, medallion, motif) => rug(key, ko, en, field, { kind: 'rug', w: 1.6, h: 2.3, field, borders, medallion, motif });
const rugs = [
  persian('persian-tabriz', '페르시안 러그 타브리즈', 'Persian rug, Tabriz', '#8e2b2a', [['#1f2b47', 0.07], ['#d8c49a', 0.02], ['#7a2324', 0.09], ['#d8c49a', 0.015]], ['#1f2b47', 0.7, '#d8c49a'], ['#c9a35a', 0.16, 0.05]),
  persian('persian-kashan', '페르시안 러그 카샨', 'Persian rug, Kashan', '#22335a', [['#8e2b2a', 0.08], ['#e0cfa8', 0.02], ['#2a3d66', 0.08]], ['#8e2b2a', 0.75, '#e0cfa8'], ['#a8463a', 0.14, 0.045]),
  persian('persian-isfahan', '페르시안 러그 이스파한', 'Persian rug, Isfahan', '#e6dcc6', [['#2c4a6e', 0.06], ['#a13a35', 0.02], ['#e6dcc6', 0.08], ['#2c4a6e', 0.015]], ['#2c4a6e', 0.72, '#a13a35'], ['#7f9bb5', 0.15, 0.04]),
  persian('persian-heriz', '페르시안 러그 헤리즈', 'Persian rug, Heriz', '#a6482f', [['#1f2840', 0.09], ['#e3d4b4', 0.02], ['#9b3f29', 0.07]], ['#1f2840', 0.85, '#e3d4b4'], ['#e3d4b4', 0.2, 0.06]),
  persian('persian-kerman', '페르시안 러그 케르만', 'Persian rug, Kerman', '#e3c8bd', [['#6f8a7a', 0.06], ['#efe3d5', 0.02], ['#c48d82', 0.06]], ['#c48d82', 0.65, '#efe3d5'], ['#9fb3a5', 0.15, 0.045]),
  persian('persian-qashqai', '페르시안 러그 카슈카이', 'Persian rug, Qashqai', '#7a2a2c', [['#e3d2a6', 0.03], ['#1f3d5c', 0.08], ['#e3d2a6', 0.02]], ['#1f3d5c', 0.55, '#d79b3a'], ['#d79b3a', 0.12, 0.05]),
  persian('oushak-sage', '오샥 러그 세이지', 'Oushak rug, sage', '#cfc6ac', [['#a7ae92', 0.08], ['#e6d6b6', 0.02]], ['#a7ae92', 0.7, '#d9b59a'], ['#d9b59a', 0.22, 0.05]),
  persian('oushak-apricot', '오샥 러그 살구', 'Oushak rug, apricot', '#e2c9a8', [['#c98f6a', 0.08], ['#efe2c9', 0.02]], ['#c98f6a', 0.7, '#9bab9b'], ['#9bab9b', 0.22, 0.05]),
  persian('vintage-overdyed-blue', '빈티지 오버다이 블루', 'Vintage overdyed rug, blue', '#3f5f86', [['#33507a', 0.06]], ['#2c4568', 0.7, '#4c6d96'], ['#4f6f98', 0.18, 0.05]),
  persian('vintage-overdyed-pink', '빈티지 오버다이 핑크', 'Vintage overdyed rug, pink', '#b86e7c', [['#a45d6b', 0.06]], ['#9a5363', 0.7, '#c67f8c'], ['#c88591', 0.18, 0.05]),
  ...[
    ['kilim-red', '킬림 러그 레드', 'Kilim rug, red', '#9b3a2e', [['s', 0.12, '#9b3a2e'], ['z', 0.08, '#e2cfa3', '#1f3550', 0.08], ['s', 0.03, '#1f3550'], ['d', 0.14, '#9b3a2e', '#d89a3c', 0.14], ['s', 0.03, '#1f3550'], ['z', 0.08, '#e2cfa3', '#1f3550', 0.08]]],
    ['kilim-blue', '킬림 러그 블루', 'Kilim rug, blue', '#2f4c70', [['s', 0.1, '#2f4c70'], ['d', 0.12, '#e6d6b2', '#a6402f', 0.12], ['s', 0.04, '#a6402f'], ['z', 0.08, '#2f4c70', '#e6d6b2', 0.08], ['s', 0.04, '#d39a42']]],
    ['kilim-neutral', '킬림 러그 뉴트럴', 'Kilim rug, neutral', '#d6c7a8', [['s', 0.1, '#d6c7a8'], ['z', 0.07, '#d6c7a8', '#4a4038', 0.07], ['s', 0.02, '#4a4038'], ['d', 0.12, '#e8dcc3', '#8f7a5f', 0.12], ['s', 0.02, '#4a4038']]],
    ['kilim-orange', '킬림 러그 오렌지', 'Kilim rug, orange', '#c4683a', [['s', 0.09, '#c4683a'], ['d', 0.1, '#ead7ae', '#2b5e5a', 0.1], ['s', 0.03, '#2b5e5a'], ['z', 0.09, '#c4683a', '#ead7ae', 0.09], ['s', 0.03, '#5e2f2a']]],
    ['kilim-green', '킬림 러그 그린', 'Kilim rug, green', '#4b6b4f', [['s', 0.1, '#4b6b4f'], ['z', 0.08, '#e3d6b8', '#8e3a30', 0.08], ['s', 0.03, '#e3d6b8'], ['d', 0.12, '#4b6b4f', '#e0b24f', 0.12]]],
    ['kilim-pastel', '킬림 러그 파스텔', 'Kilim rug, pastel', '#d9bdb4', [['s', 0.1, '#d9bdb4'], ['d', 0.1, '#ece4d6', '#9fb6b0', 0.1], ['s', 0.03, '#c9a46b'], ['z', 0.08, '#d9bdb4', '#ece4d6', 0.08]]],
  ].map(([key, ko, en, color, bands]) => rug(key, ko, en, color, { kind: 'kilim', w: 0.48, bands, grain: 0.3, streak: 'x', bump: 1 })),
  ...[
    ['beni-ourain', '베니 우라린 러그', 'Beni Ourain rug', '#ebe4d4', '#2a2725', 0.25, 0.35, 0.006],
    ['beni-ourain-grey', '베니 우라린 러그 그레이', 'Beni Ourain rug, grey lines', '#e8e3d8', '#7b7771', 0.3, 0.4, 0.005],
    ['moroccan-trellis-charcoal', '모로칸 트렐리스 러그 차콜', 'Moroccan trellis rug, charcoal', '#4b4b4d', '#e3ddd1', 0.2, 0.2, 0.012],
    ['moroccan-trellis-blue', '모로칸 트렐리스 러그 블루', 'Moroccan trellis rug, blue', '#e9e5db', '#355a85', 0.18, 0.24, 0.014],
  ].map(([key, ko, en, field, line, w, h, lw]) => rug(key, ko, en, field, { kind: 'diamond', w, h, colors: [field], grout: line, groutWidth: lw, grain: 0.45, cloud: 0.12, cloudScale: 0.05, bump: 1.6 })),
  ...[
    ['dhurrie-stripe-blue', '두리 스트라이프 러그 블루', 'Dhurrie stripe rug, blue', '#9fb0c4', [0.08, 0.02, 0.08, 0.04], ['#eae5d9', '#2f4c70', '#eae5d9', '#7f9bb8']],
    ['dhurrie-stripe-grey', '두리 스트라이프 러그 그레이', 'Dhurrie stripe rug, grey', '#b5b3ae', [0.1, 0.03, 0.02, 0.03], ['#e4e1da', '#6f6d69', '#e4e1da', '#9c9a95']],
    ['stripe-terracotta', '스트라이프 러그 테라코타', 'Striped rug, terracotta', '#c7896a', [0.06, 0.06], ['#e7d9c4', '#b5603e']],
    ['stripe-black-white', '스트라이프 러그 블랙 & 화이트', 'Striped rug, black & white', '#8a8986', [0.05, 0.05], ['#ece9e2', '#2a2a2c']],
    ['rag-multi', '래그 러그 멀티', 'Rag rug, multicolour', '#9a8a7c', [0.02, 0.015, 0.025, 0.012, 0.02, 0.018], ['#b5603e', '#e3d6b8', '#3f5f86', '#d9a441', '#6b8a6a', '#8e3a33']],
    ['rag-denim', '래그 러그 데님', 'Rag rug, denim', '#5a7090', [0.018, 0.012, 0.02, 0.014], ['#3f5778', '#7f97b5', '#2b3d57', '#e3e3de']],
    ['braided-natural', '브레이디드 러그 내추럴', 'Braided rug, natural', '#bba98a', [0.012, 0.012, 0.012], ['#c9b797', '#a99777', '#d9cbb0']],
  ].map(([key, ko, en, color, widths, colors]) => rug(key, ko, en, color, { kind: 'stripes', dir: 'h', widths, colors, grain: 0.35, streak: 'x', bump: 1.2 })),
  rug('checker-black-white', '체커 러그 블랙 & 화이트', 'Checker rug, black & white', '#8b8a87', { kind: 'grid', w: 0.2, checker: true, colors: ['#ece9e2', '#2a2a2c'], groutWidth: 0, grain: 0.35, bump: 0.8 }),
  rug('checker-pastel', '체커 러그 파스텔', 'Checker rug, pastel', '#c9c0d6', { kind: 'grid', w: 0.15, checker: true, colors: ['#e8d8e6', '#b4c9d9'], groutWidth: 0, grain: 0.35, bump: 0.8 }),
  rug('dots-cream', '도트 러그 크림', 'Dotted rug, cream', '#e2dccd', { kind: 'dots', spacing: 0.12, r: 0.025, base: '#e8e2d4', colors: ['#c9a35a', '#3f5f86', '#b5603e'], grain: 0.35, bump: 1 }),
  rug('dots-charcoal', '도트 러그 차콜', 'Dotted rug, charcoal', '#46474a', { kind: 'dots', spacing: 0.1, r: 0.02, base: '#3f4042', colors: ['#d9d4c9'], grain: 0.35, bump: 1 }),
  rug('diamond-navy', '다이아몬드 러그 네이비', 'Diamond rug, navy', '#3b4c6a', { kind: 'diamond', w: 0.2, h: 0.28, checker: true, colors: ['#2c3a55', '#e0d7c3'], groutWidth: 0, grain: 0.35, bump: 0.8 }),
  rug('diamond-ochre', '다이아몬드 러그 오커', 'Diamond rug, ochre', '#c9a35a', { kind: 'diamond', w: 0.24, h: 0.32, checker: true, colors: ['#c9a35a', '#efe6d2'], groutWidth: 0, grain: 0.35, bump: 0.8 }),
  rug('diamond-outline', '다이아몬드 라인 러그', 'Diamond outline rug', '#d8d2c4', { kind: 'diamond', w: 0.3, h: 0.3, colors: ['#ddd7c9'], grout: '#5c5853', groutWidth: 0.015, grain: 0.35, bump: 1.2 }),
  rug('chevron-grey', '쉐브론 러그 그레이', 'Chevron rug, grey', '#a3a19c', { kind: 'chevron', w: 0.15, h: 0.08, colors: ['#d9d6cf', '#6e6c68'], groutWidth: 0, grain: 0.35, bump: 0.8 }),
  rug('chevron-mustard', '쉐브론 러그 머스터드', 'Chevron rug, mustard', '#d2b06a', { kind: 'chevron', w: 0.15, h: 0.08, colors: ['#ece4d2', '#c99a3b'], groutWidth: 0, grain: 0.35, bump: 0.8 }),
  rug('hex-modern', '모던 헥사곤 러그', 'Modern hexagon rug', '#9fa3a6', { kind: 'hexagon', size: 0.2, colors: ['#9fa3a6', '#c9ccce', '#6d7174', '#e1e3e4'], grout: '#56595c', groutWidth: 0.008, grain: 0.35, bump: 1.2 }),
  rug('overdyed-grey', '빈티지 러그 그레이(무지)', 'Vintage rug, faded grey', '#8d8b88', { kind: 'plain', base: '#8d8b88', size: 1, cloud: 0.4, cloudScale: 0.25, grain: 0.35, streak: 'x' }),
  rug('overdyed-green', '빈티지 러그 그린(무지)', 'Vintage rug, faded green', '#5f7a62', { kind: 'plain', base: '#5f7a62', size: 1, cloud: 0.4, cloudScale: 0.25, grain: 0.35, streak: 'x' }),
  rug('overdyed-rust', '빈티지 러그 러스트(무지)', 'Vintage rug, faded rust', '#9e5a3c', { kind: 'plain', base: '#9e5a3c', size: 1, cloud: 0.4, cloudScale: 0.25, grain: 0.35, streak: 'x' }),
  rug('overdyed-indigo', '빈티지 러그 인디고(무지)', 'Vintage rug, faded indigo', '#3a4a6e', { kind: 'plain', base: '#3a4a6e', size: 1, cloud: 0.4, cloudScale: 0.25, grain: 0.35, streak: 'x' }),
  P('rug-sheepskin-white', 'carpet', '양털 러그 화이트', 'Sheepskin rug, white', '#efeae0', 1, 0, { sheen: 1, textures: 'curly_teddy_natural' }),
  P('rug-sheepskin-grey', 'carpet', '양털 러그 그레이', 'Sheepskin rug, grey', '#8f8c87', 1, 0, { sheen: 1, textures: 'curly_teddy_natural' }),
  P('rug-faux-fur-taupe', 'carpet', '인조 퍼 러그 토프', 'Faux-fur rug, taupe', '#9a8a7a', 1, 0, { sheen: 0.8, textures: 'faux_fur_geometric' }),
  P('rug-faux-fur-ivory', 'carpet', '인조 퍼 러그 아이보리', 'Faux-fur rug, ivory', '#e6dfd1', 1, 0, { sheen: 0.8, textures: 'faux_fur_geometric' }),
];
const asianMats = [
  P('carpet-tatami', 'carpet', '다다미', 'Tatami', '#c8bd8a', 0.85, 0, { textures: 'tatami_mat' }),
  P('carpet-tatami-aged', 'carpet', '다다미(햇볕에 바랜)', 'Tatami, sun-aged', '#c9b27c', 0.85, 0, { textures: 'tatami_mat' }),
  P('carpet-tatami-grey', 'carpet', '다다미 그레이(류큐)', 'Tatami, grey (Ryukyu)', '#a7a28f', 0.85, 0, { textures: 'tatami_mat' }),
  P('carpet-tatami-border', 'carpet', '다다미 테두리(헤리)', 'Tatami with border (heri)', '#c3b783', 0.85, 0, { pattern: { kind: 'stripes', widths: [0.035, 0.83, 0.035], colors: ['#2b2f2a', '#c3b783', '#2b2f2a'], heights: [0.6, 1, 0.6], grain: 0.45, streak: 'y', bump: 1.2 } }),
  P('carpet-hwamunseok', 'carpet', '화문석', 'Hwamunseok (flower-patterned sedge mat)', '#d2c08f', 0.85, 0, { pattern: { kind: 'damask', w: 0.3, h: 0.3, base: '#d6c594', ink: '#8e3a2f', grain: 0.45, streak: 'x', bump: 0.8 } }),
  P('carpet-hwamunseok-blue', 'carpet', '화문석 청색 문양', 'Hwamunseok, blue motif', '#cfc093', 0.85, 0, { pattern: { kind: 'damask', w: 0.3, h: 0.3, base: '#d6c594', ink: '#2f4c70', grain: 0.45, streak: 'x', bump: 0.8 } }),
  P('carpet-wanggol', 'carpet', '왕골 돗자리', 'Wanggol sedge mat', '#cdbb85', 0.85, 0, { pattern: { kind: 'stripes', widths: [0.4, 0.008], colors: ['#cdbb85', '#8e7a4c'], grain: 0.5, streak: 'x', bump: 1 } }),
  P('carpet-bamboo-mat', 'carpet', '대나무 자리', 'Bamboo mat', '#c9ad73', 0.6, 0, { pattern: { kind: 'stripes', dir: 'h', widths: [0.016, 0.002], heights: [1, 0], colors: ['#c9ad73', '#6e5a35'], variation: 0.05, grain: 0.25, streak: 'x', bump: 1.5 } }),
  P('carpet-play-mat', 'carpet', '놀이 매트(층간소음)', 'Play mat (foam)', '#e3ded4', 0.7, 0, { pattern: { kind: 'grid', w: 0.6, colors: ['#e3ded4'], grout: '#c9c3b8', groutWidth: 0.003, grain: 0.05, bump: 1 } }),
  P('carpet-play-mat-pastel', 'carpet', '놀이 매트 파스텔', 'Play mat, pastel tiles', '#d8cbd5', 0.7, 0, { pattern: { kind: 'grid', w: 0.3, colors: ['#e9c9c9', '#c9dbe9', '#e9e3c4', '#cfe3cf'], grout: '#bdb7ae', groutWidth: 0.003, grain: 0.05, bump: 1 } }),
];

export const ARCH_MATERIAL_PRESETS = [
  ...woodPlanks, ...parquetSets, ...parquetPatterns, ...koreanFloors, ...decoTiles, ...resilient, ...concreteFloors, ...epoxy, ...microFloors, ...terrazzoFloors, ...otherFloors,
  ...subway, ...subwayLayouts, ...zellige, ...hexTiles, ...penny, ...fishscale, ...encaustic, ...checkers, ...terracottaTiles, ...porcelain, ...glassMosaic, ...otherTiles,
  ...marbles, ...honedMarbles, ...photoMarble, ...granites, ...granitePhoto, ...quartzite, ...travertine, ...limestone, ...slate, ...onyx, ...otherStone, ...quartz, ...terrazzoStone,
  ...WALL_PAINTS, ...plasters, ...wallpapers, ...brickWalls, ...panelling, ...concreteWalls, ...feltWalls,
  ...carpets, ...naturals, ...carpetTiles, ...rugs, ...asianMats,
];
