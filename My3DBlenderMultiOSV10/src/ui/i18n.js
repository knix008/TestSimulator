// Two languages, written side by side where the text is used: t('Add', '추가'). No key table can go stale this way.
let language = 'ko';

export const setLanguage = (value) => { language = value === 'en' ? 'en' : 'ko'; };
export const getLanguage = () => language;
export const t = (en, ko) => (language === 'en' ? en : ko ?? en);
/** The name of anything that has `en` and `ko` (operators, modifiers, nodes, …). */
export const nameOf = (item) => (language === 'en' ? item.en : item.ko ?? item.en);

/** Korean names of the enum values shown in drop-downs; anything else is shown as its English title case. */
const ENUM_KO = {
  LENNARDJ: '레너드-존스',
  CHARGE: '전하', GUIDE: '커브 가이드',
  PHILLIPS: '필립스', PIERSON_MOSKOWITZ: '피어슨-모스코위츠', JONSWAP: 'JONSWAP', TEXEL_MARSEN_ARSLOE: 'TMA (얕은 물)', MATERIAL: '재질', ASSET: '애셋', QUADRATIC: '2차', INVERSE_QUADRATIC: '역 2차',
  SELECT: '선택', DESELECT: '선택 해제', INVERT: '반전', VERT: '꼭짓점', EDGE: '엣지', FACE: '면', ONLY_FACE: '면만', NONE: '없음', INNER: '안쪽', OUTER: '바깥쪽', CENTER: '중심', CURSOR: '커서', FIRST: '처음', LAST: '마지막',
  NOTHING: '없음', NGON: 'N각형', FAN: '삼각 부채', POINT: '포인트', SUN: '태양', SPOT: '스폿', AREA: '영역', BEZIER: '베지어', CIRCLE: '원', PATH: '경로', PLAIN_AXES: '축', ARROWS: '화살표', CUBE: '큐브', SPHERE: '구',
  WIND: '바람', FORCE: '힘', VORTEX: '소용돌이', DRAG: '항력', OBJECT: '오브젝트', EDIT: '편집', SCULPT: '스컬프트', VERTEX_PAINT: '꼭짓점 페인트', WEIGHT_PAINT: '웨이트 페인트', TEXTURE_PAINT: '텍스처 페인트', POSE: '포즈', PAINT_GPENCIL: '그리스 펜슬 그리기',
  ORIGIN_GEOMETRY: '원점을 지오메트리로', ORIGIN_CURSOR: '원점을 커서로', GEOMETRY_ORIGIN: '지오메트리를 원점으로', ARMATURE_AUTO: '아마추어(자동 가중치)', ACTIVE: '활성', PASSIVE: '수동', EMITTER: '방출기', HAIR: '헤어',
  DIFFERENCE: '차집합', UNION: '합집합', INTERSECT: '교집합', TWIST: '비틀기', BEND: '구부리기', TAPER: '테이퍼', STRETCH: '늘이기',
  CONSTANT: '상수', LINEAR: '선형', SINE: '사인', QUAD: '2차', CUBIC: '3차', QUART: '4차', QUINT: '5차', EXPO: '지수', CIRC: '원형', BACK: '되돌아오기', BOUNCE: '튕김', ELASTIC: '탄성', IN: '가속', OUT: '감속', IN_OUT: '가감속',
  MIX: '혼합', ADD: '더하기', SUBTRACT: '빼기', MULTIPLY: '곱하기', DIVIDE: '나누기', SCREEN: '스크린', OVERLAY: '오버레이', DARKEN: '어둡게', LIGHTEN: '밝게', POWER: '거듭제곱', MINIMUM: '최소', MAXIMUM: '최대', SINE_: '사인', COSINE: '코사인', ABSOLUTE: '절댓값', SQRT: '제곱근', ROUND: '반올림', FLOOR: '내림', MODULO: '나머지', GREATER_THAN: '보다 큼', LESS_THAN: '보다 작음',
  PATCH: '패치', CYLINDER: '원기둥', TORUS: '토러스', NOISE: '노이즈', SMOKE: '연기', FIRE: '불', BOTH: '둘 다', GEOMETRY: '지오메트리', INFLOW: '유입', ALPHA: '알파', VERTS: '꼭짓점', FACES: '면', CANVAS: '캔버스', BRUSH: '브러시', EMPTY: '빈 장면', COPY: '복사', ERASE: '지우개',
  CROSS: '외적', DOT: '내적', NORMALIZE: '정규화', LENGTH: '길이', SCALE: '크기', LocRotScale: '위치·회전·크기', Location: '위치', Rotation: '회전', Scale: '크기',
  PATH_: '경로 추적', REALTIME: '실시간', FILMIC: '필믹', STANDARD: '표준', PERSP: '원근', ORTHO: '직교', BOX: '상자', METRIC: '미터법', IMPERIAL: '야드파운드법', LEFT: '왼쪽', RIGHT: '오른쪽', REPLACE: '대체', SUB: '빼기', MUL: '곱하기',
};
const title = (value) => String(value).replace(/_/g, ' ').toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());

export function enumName(value) {
  if (value == null) return '';
  if (/^[A-Z]$/.test(String(value))) return value;
  if (language === 'ko') return ENUM_KO[value] ?? title(value);
  return /^[A-Z_0-9]+$/.test(value) ? title(value) : value;
}

/** Names of property keys that come straight from tables (modifier and node settings). */
const PROP_KO = {
  aero: '공기 저항', ballSize: '공 크기', sewingForce: '재봉 힘', charge: '전하', curve: '커브', guideMinDistance: '최소 거리', guideFree: '자유도', pressure: '압력',
  resolution: '해상도', waveScale: '파도 배율', windSpeed: '풍속', windAngle: '바람 방향', choppiness: '물결 날카로움', useFoam: '거품 사용', foamCoverage: '거품 범위', spectrum: '스펙트럼', fetch: '페치', sharpenPeak: '피크 뾰족함', depth: '깊이', useSpray: '물보라 사용', invertSpray: '물보라 반전', source: '대상', matteId: '매트 이름',
  levels: '레벨', x: 'X', y: 'Y', z: 'Z', merge: '병합', mergeDistance: '병합 거리', count: '개수', offsetX: '오프셋 X', offsetY: '오프셋 Y', offsetZ: '오프셋 Z', thickness: '두께', width: '폭', angle: '각도', ratio: '비율', operation: '연산',
  object: '오브젝트', steps: '단계', height: '높이', axis: '축', distance: '거리', start: '시작', length: '길이', group: '그룹', invert: '반전', strength: '강도', scale: '크기', midlevel: '중간값', speed: '속도', factor: '계수', iterations: '반복', mode: '방식', radius: '반지름', offset: '오프셋',
  target: '대상', influence: '영향력', minX: '최소 X', maxX: '최대 X', minY: '최소 Y', maxY: '최대 Y', minZ: '최소 Z', maxZ: '최대 Z', value: '값', color: '색', blend: '혼합 방식', image: '이미지',
  mass: '질량', restitution: '탄성', friction: '마찰', shape: '모양', damping: '감쇠', stiffness: '강성', pinGroup: '고정 그룹', gravityScale: '중력 배율', goal: '목표 강도', kind: '종류', falloff: '감쇠 지수', frameStart: '시작 프레임', frameEnd: '끝 프레임', lifetime: '수명', velocity: '속도', randomVelocity: '임의 속도', gravity: '중력', size: '크기', seed: '시드', hairLength: '헤어 길이', hairSegments: '헤어 세그먼트',
};
export const propName = (key) => (language === 'ko' ? PROP_KO[key] ?? key : key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()));
