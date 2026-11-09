// Material presets: physically based (metalness / roughness) materials that every
// part of the app shares — library furniture, walls, floors, the paint bucket and
// imported models. Textures (Poly Haven CC0 sets in public/library/textures) are
// attached by `textures` (see library/assets.js); without them a preset still
// looks right from its colour, roughness and physical options.
import * as THREE from 'three';

export const MATERIAL_CATEGORIES = [
  { id: 'wood', ko: '나무', en: 'Wood' },
  { id: 'floor', ko: '바닥재', en: 'Flooring' },
  { id: 'fabric', ko: '패브릭', en: 'Fabric' },
  { id: 'leather', ko: '가죽', en: 'Leather' },
  { id: 'stone', ko: '석재', en: 'Stone' },
  { id: 'tile', ko: '타일', en: 'Tile' },
  { id: 'wall', ko: '벽 마감', en: 'Wall finish' },
  { id: 'metal', ko: '금속', en: 'Metal' },
  { id: 'glass', ko: '유리', en: 'Glass' },
  { id: 'paint', ko: '도장', en: 'Paint' },
  { id: 'plastic', ko: '플라스틱', en: 'Plastic' },
  { id: 'ceramic', ko: '도자기', en: 'Ceramic' },
  { id: 'carpet', ko: '카펫·러그', en: 'Carpet & rug' },
  { id: 'plant', ko: '식물', en: 'Plant' },
  { id: 'other', ko: '기타', en: 'Other' },
];

/**
 * id, category, names, base colour, roughness, metalness and optional physical extras:
 * sheen (fabric), clearcoat (lacquer, leather), transmission/ior/thickness (glass), emissive.
 * `repeat` = metres covered by one texture tile; `textures` = texture set id (library/assets.js).
 */
const P = (id, category, ko, en, color, roughness, metalness = 0, extra = {}) => ({ id, category, ko, en, color, roughness, metalness, repeat: 1, ...extra });

export const MATERIAL_PRESETS = [
  // wood (furniture)
  P('wood-oak', 'wood', '오크', 'Oak', '#b88a5a', 0.55, 0, { repeat: 1, textures: 'oak_veneer_01' }),
  P('wood-walnut', 'wood', '월넛', 'Walnut', '#6b4630', 0.5, 0, { textures: 'walnut_veneer' }),
  P('wood-ash', 'wood', '애쉬(밝은 나무)', 'Ash (light)', '#d8c3a0', 0.55, 0, { textures: 'ash_veneer' }),
  P('wood-pine', 'wood', '소나무', 'Pine', '#d9b07a', 0.6, 0, { textures: 'coated_pine' }),
  P('wood-teak', 'wood', '티크', 'Teak', '#9a6a3c', 0.5, 0, { textures: 'teak_veneer' }),
  P('wood-dark', 'wood', '짙은 나무', 'Dark wood', '#3e2a1e', 0.45, 0, { textures: 'walnut_veneer' }),
  P('wood-white', 'wood', '흰색 도장 나무', 'White painted wood', '#f1eee8', 0.45),
  P('wood-black', 'wood', '검은색 도장 나무', 'Black painted wood', '#1d1c1b', 0.4),
  P('plywood', 'wood', '합판', 'Plywood', '#d6b98c', 0.65, 0, { textures: 'plywood' }),
  P('rattan', 'wood', '라탄', 'Rattan', '#c79a5b', 0.7),
  // flooring
  P('floor-oak', 'floor', '오크 원목 마루', 'Oak planks', '#b38657', 0.5, 0, { repeat: 2, textures: 'wood_floor' }),
  P('floor-walnut', 'floor', '월넛 마루', 'Walnut planks', '#6e4a33', 0.45, 0, { repeat: 2, textures: 'laminate_floor' }),
  P('floor-herringbone', 'floor', '헤링본 마루', 'Herringbone parquet', '#a87b4f', 0.5, 0, { repeat: 1.5, textures: 'herringbone_parquet' }),
  P('floor-light', 'floor', '밝은 마루', 'Light planks', '#d9c2a0', 0.5, 0, { repeat: 2, textures: 'laminate_floor_02' }),
  P('floor-grey', 'floor', '회색 마루', 'Grey planks', '#9a948c', 0.55, 0, { repeat: 2, textures: 'laminate_floor_03' }),
  P('floor-concrete', 'floor', '콘크리트 바닥', 'Polished concrete', '#a3a19c', 0.35, 0, { repeat: 3, textures: 'grey_plaster_02' }),
  P('floor-tile-large', 'floor', '대형 포세린 타일', 'Large porcelain tile', '#d9d6cf', 0.25, 0, { repeat: 1.2, textures: 'interior_tiles' }),
  P('floor-vinyl', 'floor', '장판', 'Vinyl', '#c9b28f', 0.6, 0, { repeat: 2, textures: 'laminate_floor' }),
  // fabric
  P('fabric-linen-beige', 'fabric', '린넨 베이지', 'Linen beige', '#cbb89d', 0.9, 0, { sheen: 0.6, textures: 'rough_linen' }),
  P('fabric-linen-grey', 'fabric', '린넨 그레이', 'Linen grey', '#8d8a86', 0.9, 0, { sheen: 0.6, textures: 'rough_linen' }),
  P('fabric-linen-white', 'fabric', '린넨 화이트', 'Linen white', '#e9e5dc', 0.9, 0, { sheen: 0.5, textures: 'rough_linen' }),
  P('fabric-wool-charcoal', 'fabric', '울 차콜', 'Wool charcoal', '#3d3e41', 0.95, 0, { sheen: 0.7, textures: 'poly_wool_herringbone' }),
  P('fabric-boucle', 'fabric', '부클레 아이보리', 'Bouclé ivory', '#ece6da', 1, 0, { sheen: 0.8, textures: 'curly_teddy_natural' }),
  P('fabric-velvet-green', 'fabric', '벨벳 그린', 'Velvet green', '#2f5a45', 0.75, 0, { sheen: 1, sheenColor: '#7fb39a', textures: 'velour_velvet' }),
  P('fabric-velvet-blue', 'fabric', '벨벳 블루', 'Velvet blue', '#2c3f6b', 0.75, 0, { sheen: 1, sheenColor: '#8aa0d6', textures: 'velour_velvet' }),
  P('fabric-velvet-rose', 'fabric', '벨벳 로즈', 'Velvet rose', '#b7787a', 0.75, 0, { sheen: 1, sheenColor: '#f0b8b6', textures: 'velour_velvet' }),
  P('fabric-mustard', 'fabric', '머스터드', 'Mustard', '#c9962e', 0.9, 0, { sheen: 0.6, textures: 'caban' }),
  P('fabric-terracotta', 'fabric', '테라코타', 'Terracotta', '#b5643f', 0.9, 0, { sheen: 0.6, textures: 'caban' }),
  P('fabric-navy', 'fabric', '네이비', 'Navy', '#23304a', 0.9, 0, { sheen: 0.6, textures: 'caban' }),
  P('fabric-cotton-white', 'fabric', '면 화이트(침구)', 'Cotton white (bedding)', '#f4f2ee', 0.85, 0, { sheen: 0.4, textures: 'stretch_poplin' }),
  P('fabric-cotton-grey', 'fabric', '면 그레이(침구)', 'Cotton grey (bedding)', '#b9b8b5', 0.85, 0, { sheen: 0.4, textures: 'stretch_poplin' }),
  // leather
  P('leather-brown', 'leather', '브라운 가죽', 'Brown leather', '#6a3f26', 0.45, 0, { clearcoat: 0.3, clearcoatRoughness: 0.5, textures: 'brown_leather' }),
  P('leather-cognac', 'leather', '코냑 가죽', 'Cognac leather', '#9a5a2e', 0.45, 0, { clearcoat: 0.3, clearcoatRoughness: 0.5, textures: 'brown_leather' }),
  P('leather-black', 'leather', '블랙 가죽', 'Black leather', '#1b1a19', 0.4, 0, { clearcoat: 0.35, clearcoatRoughness: 0.45, textures: 'brown_leather' }),
  P('leather-white', 'leather', '화이트 가죽', 'White leather', '#e8e3da', 0.45, 0, { clearcoat: 0.3, clearcoatRoughness: 0.5, textures: 'leather_white' }),
  // stone
  P('marble-white', 'stone', '화이트 대리석', 'White marble', '#eceae6', 0.15, 0, { clearcoat: 0.4, clearcoatRoughness: 0.1 }),
  P('marble-black', 'stone', '블랙 대리석', 'Black marble', '#1e1e20', 0.15, 0, { clearcoat: 0.4, clearcoatRoughness: 0.1 }),
  P('marble-green', 'stone', '그린 대리석', 'Green marble', '#2e4a3e', 0.15, 0, { clearcoat: 0.4, clearcoatRoughness: 0.1 }),
  P('granite-grey', 'stone', '화강암', 'Granite', '#77777a', 0.35),
  P('travertine', 'stone', '트래버틴', 'Travertine', '#d8c9ad', 0.5),
  P('terrazzo', 'stone', '테라조', 'Terrazzo', '#dedad3', 0.3, 0, { textures: 'terrazzo_tiles' }),
  P('concrete', 'stone', '노출 콘크리트', 'Exposed concrete', '#9c9a95', 0.8, 0, { textures: 'concrete_wall_004' }),
  P('quartz-white', 'stone', '엔지니어드 스톤(화이트)', 'Quartz (white)', '#f2f1ee', 0.2, 0, { clearcoat: 0.3 }),
  // tile
  P('tile-subway-white', 'tile', '서브웨이 타일', 'White subway tile', '#f3f2ef', 0.15, 0, { repeat: 0.6, clearcoat: 0.5, textures: 'long_white_tiles' }),
  P('tile-hexagon', 'tile', '육각 타일', 'Hexagon tile', '#e8e6e1', 0.2, 0, { repeat: 0.5, clearcoat: 0.4 }),
  P('tile-grey', 'tile', '회색 세라믹 타일', 'Grey ceramic tile', '#a9a8a4', 0.3, 0, { repeat: 0.9, textures: 'tiled_floor_001' }),
  P('tile-checker', 'tile', '체크 타일', 'Checker tile', '#dcdcdc', 0.2, 0, { repeat: 0.6, textures: 'checkered_pavement_tiles' }),
  P('tile-terracotta', 'tile', '테라코타 타일', 'Terracotta tile', '#b4643f', 0.6, 0, { repeat: 0.6, textures: 'terracotta_floor_tiles' }),
  P('tile-mosaic-blue', 'tile', '블루 모자이크', 'Blue mosaic', '#3c6e8f', 0.2, 0, { repeat: 0.3, clearcoat: 0.5, textures: 'square_tiles' }),
  // wall finishes
  P('wall-paint-white', 'wall', '흰색 페인트', 'White paint', '#f2f0eb', 0.9),
  P('wall-paint-warm', 'wall', '웜 화이트', 'Warm white', '#ece3d3', 0.9),
  P('wall-paint-grey', 'wall', '그레이 페인트', 'Grey paint', '#b8b6b1', 0.9),
  P('wall-paint-sage', 'wall', '세이지 그린', 'Sage green', '#a9b49a', 0.9),
  P('wall-paint-blue', 'wall', '더스티 블루', 'Dusty blue', '#8ea2b5', 0.9),
  P('wall-paint-terracotta', 'wall', '테라코타 페인트', 'Terracotta paint', '#c47a5a', 0.9),
  P('wall-plaster', 'wall', '석고 미장', 'Plaster', '#e6e0d6', 0.95, 0, { repeat: 2, textures: 'plastered_wall' }),
  P('wall-brick-red', 'wall', '붉은 벽돌', 'Red brick', '#9a4a36', 0.85, 0, { repeat: 1.2, textures: 'red_brick' }),
  P('wall-brick-white', 'wall', '흰 벽돌', 'White brick', '#e4e0d8', 0.85, 0, { repeat: 1.2, textures: 'whitewashed_brick' }),
  P('wall-wood-panel', 'wall', '나무 패널', 'Wood panelling', '#a77c52', 0.6, 0, { repeat: 1.5, textures: 'wooden_panels' }),
  P('wallpaper-linen', 'wall', '린넨 벽지', 'Linen wallpaper', '#ddd5c6', 0.9, 0, { repeat: 1, textures: 'rough_linen' }),
  // metal
  P('metal-steel', 'metal', '브러시드 스틸', 'Brushed steel', '#b9bcbf', 0.35, 1),
  P('metal-chrome', 'metal', '크롬', 'Chrome', '#e8eaec', 0.06, 1),
  P('metal-black', 'metal', '블랙 메탈', 'Black metal', '#232325', 0.45, 0.8),
  P('metal-brass', 'metal', '브라스', 'Brass', '#c9a24a', 0.3, 1),
  P('metal-gold', 'metal', '골드', 'Gold', '#e1b94f', 0.2, 1),
  P('metal-copper', 'metal', '구리', 'Copper', '#c27a4b', 0.3, 1),
  P('metal-aluminium', 'metal', '알루미늄', 'Aluminium', '#cfd2d4', 0.4, 1),
  P('metal-white', 'metal', '화이트 도장 금속', 'White powder-coated metal', '#ecebe8', 0.4, 0.3),
  // glass
  P('glass-clear', 'glass', '투명 유리', 'Clear glass', '#ffffff', 0.02, 0, { transmission: 1, ior: 1.5, thickness: 0.01, opacity: 0.25, transparent: true }),
  P('glass-frosted', 'glass', '불투명 유리', 'Frosted glass', '#f4f6f6', 0.45, 0, { transmission: 0.9, ior: 1.5, thickness: 0.01, opacity: 0.6, transparent: true }),
  P('glass-tinted', 'glass', '스모크 유리', 'Smoked glass', '#5d6264', 0.05, 0, { transmission: 0.8, ior: 1.5, thickness: 0.01, opacity: 0.45, transparent: true }),
  P('mirror', 'glass', '거울', 'Mirror', '#ffffff', 0.02, 1),
  // paint / plastic / ceramic
  P('paint-white-gloss', 'paint', '흰색 유광 도장', 'White gloss lacquer', '#f5f4f1', 0.2, 0, { clearcoat: 0.8, clearcoatRoughness: 0.1 }),
  P('paint-white-matte', 'paint', '흰색 무광 도장', 'White matte', '#efede8', 0.7),
  P('paint-grey-matte', 'paint', '회색 무광 도장', 'Grey matte', '#8b8d8f', 0.7),
  P('paint-black-matte', 'paint', '검은색 무광 도장', 'Black matte', '#1f1f20', 0.65),
  P('paint-green-matte', 'paint', '그린 무광 도장', 'Green matte', '#5c6e5a', 0.7),
  P('paint-blue-matte', 'paint', '블루 무광 도장', 'Blue matte', '#3f5872', 0.7),
  P('plastic-white', 'plastic', '흰색 플라스틱', 'White plastic', '#f0f0ee', 0.35),
  P('plastic-black', 'plastic', '검은색 플라스틱', 'Black plastic', '#1a1a1b', 0.4),
  P('plastic-grey', 'plastic', '회색 플라스틱', 'Grey plastic', '#8f9194', 0.45),
  P('rubber-black', 'plastic', '고무', 'Rubber', '#141414', 0.9),
  P('ceramic-white', 'ceramic', '흰색 도기(위생도기)', 'White ceramic (sanitary)', '#fbfbfa', 0.08, 0, { clearcoat: 1, clearcoatRoughness: 0.05 }),
  P('ceramic-matte', 'ceramic', '무광 도자기', 'Matte ceramic', '#e2ddd3', 0.6),
  P('ceramic-terracotta', 'ceramic', '테라코타 화분', 'Terracotta pot', '#b0603d', 0.75),
  // carpet & rug
  P('carpet-grey', 'carpet', '회색 카펫', 'Grey carpet', '#8c8a86', 1, 0, { sheen: 0.8, repeat: 1, textures: 'polar_fleece' }),
  P('carpet-beige', 'carpet', '베이지 카펫', 'Beige carpet', '#c8b89c', 1, 0, { sheen: 0.8, repeat: 1, textures: 'polar_fleece' }),
  P('rug-wool-cream', 'carpet', '크림 울 러그', 'Cream wool rug', '#e6dccb', 1, 0, { sheen: 0.9, textures: 'curly_teddy_natural' }),
  P('rug-pattern', 'carpet', '패턴 러그', 'Patterned rug', '#8a5a4a', 1, 0, { sheen: 0.8, textures: 'faux_fur_geometric' }),
  // plants
  P('plant-leaf', 'plant', '잎', 'Leaf', '#3f6b35', 0.6, 0, { side: 'double' }),
  P('plant-leaf-light', 'plant', '연두 잎', 'Light leaf', '#6f9a45', 0.6, 0, { side: 'double' }),
  P('plant-stem', 'plant', '줄기', 'Stem', '#5a4a2e', 0.8),
  P('soil', 'plant', '흙', 'Soil', '#3a2a1e', 1),
  // other
  P('light-warm', 'other', '조명(따뜻한 빛)', 'Light (warm)', '#fff3d6', 0.4, 0, { emissive: '#ffe2a8', emissiveIntensity: 2.5 }),
  P('light-cool', 'other', '조명(차가운 빛)', 'Light (cool)', '#f2f7ff', 0.4, 0, { emissive: '#e4efff', emissiveIntensity: 2.5 }),
  P('lampshade', 'other', '램프 갓(패브릭)', 'Lampshade (fabric)', '#f1e9da', 0.9, 0, { transmission: 0.3, thickness: 0.002, side: 'double' }),
  P('screen-black', 'other', '화면(꺼짐)', 'Screen (off)', '#0b0c0e', 0.1, 0, { clearcoat: 1, clearcoatRoughness: 0.02 }),
  P('paper', 'other', '종이', 'Paper', '#f5f2ea', 0.9, 0, { side: 'double' }),
  P('book-red', 'other', '책(빨강)', 'Book (red)', '#8e3b32', 0.7),
  P('book-blue', 'other', '책(파랑)', 'Book (blue)', '#2f4b6e', 0.7),
  P('book-green', 'other', '책(초록)', 'Book (green)', '#3e5a43', 0.7),
  P('book-cream', 'other', '책(크림)', 'Book (cream)', '#e2d6bc', 0.7),
  P('water', 'other', '물', 'Water', '#a8c8d8', 0.02, 0, { transmission: 0.95, ior: 1.33, transparent: true, opacity: 0.5 }),
  P('default', 'other', '기본', 'Default', '#d9d6d0', 0.8),
  P('back-face', 'other', '뒷면', 'Back face', '#a7b4c6', 0.9),
];

const BY_ID = new Map(MATERIAL_PRESETS.map((p) => [p.id, p]));
export const presetOf = (id) => BY_ID.get(id) ?? BY_ID.get('default');
export const hasPreset = (id) => BY_ID.has(id);

/** Hooks a texture loader in (library/assets.js): (preset, material) → void. Set once by the app. */
let textureHook = null;
export function setTextureHook(hook) { textureHook = hook; }

const cache = new Map();

/** Users' own materials (document.materials) join the presets: id → spec of the same shape. */
const custom = new Map();
export function defineCustomMaterial(spec) { custom.set(spec.id, { category: 'other', repeat: 1, roughness: 0.8, metalness: 0, ...spec }); for (const key of cache.keys()) if (key.startsWith(`${spec.id}|`)) cache.delete(key); }
export const customMaterials = () => [...custom.values()];

/**
 * The shared material for a preset (or a custom material) and overrides (colour …).
 * Same arguments → the same instance, so meshes batch and the GPU keeps one program per kind.
 */
export function getMaterial(id, overrides = {}) {
  const key = `${id}|${JSON.stringify(overrides)}`;
  let material = cache.get(key);
  if (material) return material;
  const spec = { ...(custom.get(id) ?? presetOf(id)), ...overrides };
  const physical = spec.sheen || spec.clearcoat || spec.transmission;
  const Kind = physical ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
  material = new Kind({ color: new THREE.Color(spec.color), roughness: spec.roughness, metalness: spec.metalness });
  if (spec.emissive) { material.emissive = new THREE.Color(spec.emissive); material.emissiveIntensity = spec.emissiveIntensity ?? 1; }
  if (physical) {
    if (spec.sheen) { material.sheen = spec.sheen; material.sheenRoughness = 0.8; material.sheenColor = new THREE.Color(spec.sheenColor ?? spec.color).lerp(new THREE.Color('#ffffff'), spec.sheenColor ? 0 : 0.3); }
    if (spec.clearcoat) { material.clearcoat = spec.clearcoat; material.clearcoatRoughness = spec.clearcoatRoughness ?? 0.2; }
    if (spec.transmission) { material.transmission = spec.transmission; material.ior = spec.ior ?? 1.5; material.thickness = spec.thickness ?? 0.01; }
  }
  if (spec.transparent) { material.transparent = true; material.opacity = spec.opacity ?? 0.5; material.depthWrite = false; }
  if (spec.side === 'double') material.side = THREE.DoubleSide;
  material.name = id;
  material.userData.preset = id;
  material.userData.repeat = spec.repeat ?? 1;
  textureHook?.(spec, material);
  cache.set(key, material);
  return material;
}

/** Forgets cached materials (after textures arrive or quality changes); meshes keep theirs until rebuilt. */
export function clearMaterialCache() { cache.clear(); }
