/**
 * Selectable monocular depth models for Transformers.js / ONNX.
 * @typedef {Object} DepthModelInfo
 * @property {string} id
 * @property {string} name
 * @property {string} shortName
 * @property {string} family
 * @property {'fast'|'balanced'|'quality'} tier
 * @property {string} sizeHint
 * @property {string} description
 * @property {string} homepage
 * @property {string} license
 * @property {'non-commercial'} usePolicy
 * @property {Array<'space'|'object'>} recommendedFor
 * @property {{ sample: string, latencyMs: number, edgeScore: number }} benchmark
 */

/** @type {DepthModelInfo[]} */
export const DEPTH_MODELS = [
  {
    id: 'onnx-community/depth-anything-v2-small',
    name: 'Depth Anything V2 Small',
    shortName: 'V2 Small',
    family: 'Depth Anything V2',
    tier: 'fast',
    sizeHint: '~100MB급',
    description:
      '가장 빠르고 가벼운 모델입니다. 미리보기·저사양 PC에 적합합니다. 공간감은 보통입니다.',
    homepage: 'https://huggingface.co/onnx-community/depth-anything-v2-small',
    license: 'CC-BY-NC-4.0',
    usePolicy: 'non-commercial',
    recommendedFor: ['space', 'object'],
    benchmark: { sample: 'sample-object-studio-1024', latencyMs: 860, edgeScore: 72 }
  },
  {
    id: 'onnx-community/depth-anything-v2-base',
    name: 'Depth Anything V2 Base',
    shortName: 'V2 Base',
    family: 'Depth Anything V2',
    tier: 'balanced',
    sizeHint: '~300MB급',
    description:
      '속도와 품질의 균형형입니다. 실내·거리 사진에서 공간 경계가 Small보다 또렷한 편입니다.',
    homepage: 'https://huggingface.co/onnx-community/depth-anything-v2-base',
    license: 'CC-BY-NC-4.0',
    usePolicy: 'non-commercial',
    recommendedFor: ['space', 'object'],
    benchmark: { sample: 'sample-object-studio-1024', latencyMs: 1220, edgeScore: 79 }
  },
  {
    id: 'onnx-community/depth-anything-v2-small-ONNX',
    name: 'Depth Anything V2 Small (ONNX 패키지)',
    shortName: 'V2 Small ONNX',
    family: 'Depth Anything V2',
    tier: 'fast',
    sizeHint: '~100MB급',
    description:
      'Transformers.js용으로 정리된 Small ONNX 배포본입니다. Small과 유사하며 호환용 옵션입니다.',
    homepage: 'https://huggingface.co/onnx-community/depth-anything-v2-small-ONNX',
    license: 'CC-BY-NC-4.0',
    usePolicy: 'non-commercial',
    recommendedFor: ['space', 'object'],
    benchmark: { sample: 'sample-object-studio-1024', latencyMs: 910, edgeScore: 73 }
  },
  {
    id: 'onnx-community/depth-anything-v2-base-ONNX',
    name: 'Depth Anything V2 Base (ONNX 패키지)',
    shortName: 'V2 Base ONNX',
    family: 'Depth Anything V2',
    tier: 'balanced',
    sizeHint: '~300MB급',
    description:
      'Base 모델의 ONNX 배포본입니다. 공간 구조 추정 품질을 우선할 때 선택하세요.',
    homepage: 'https://huggingface.co/onnx-community/depth-anything-v2-base-ONNX',
    license: 'CC-BY-NC-4.0',
    usePolicy: 'non-commercial',
    recommendedFor: ['space', 'object'],
    benchmark: { sample: 'sample-object-studio-1024', latencyMs: 1260, edgeScore: 80 }
  },
  {
    id: 'onnx-community/depth-anything-v2-large-ONNX',
    name: 'Depth Anything V2 Large (ONNX 패키지)',
    shortName: 'V2 Large',
    family: 'Depth Anything V2',
    tier: 'quality',
    sizeHint: '~1GB급',
    description:
      '가장 상세한 깊이 추정입니다. 느리고 메모리를 많이 쓰지만 입체감이 가장 좋아질 수 있습니다.',
    homepage: 'https://huggingface.co/onnx-community/depth-anything-v2-large-ONNX',
    license: 'CC-BY-NC-4.0',
    usePolicy: 'non-commercial',
    recommendedFor: ['space', 'object'],
    benchmark: { sample: 'sample-object-studio-1024', latencyMs: 2680, edgeScore: 88 }
  },
  {
    id: 'Xenova/depth-anything-small-hf',
    name: 'Depth Anything Small (Xenova)',
    shortName: 'DA Small',
    family: 'Depth Anything V1',
    tier: 'fast',
    sizeHint: '~100MB급',
    description:
      '이전 세대 Depth Anything Small입니다. 비교·호환용으로 남겨 두었습니다.',
    homepage: 'https://huggingface.co/Xenova/depth-anything-small-hf',
    license: 'CC-BY-NC-4.0',
    usePolicy: 'non-commercial',
    recommendedFor: ['object'],
    benchmark: { sample: 'sample-object-studio-1024', latencyMs: 930, edgeScore: 70 }
  },
  {
    id: 'Xenova/dpt-hybrid-midas',
    name: 'DPT Hybrid MiDaS',
    shortName: 'MiDaS Hybrid',
    family: 'DPT / MiDaS',
    tier: 'balanced',
    sizeHint: '~400MB급',
    description:
      'Intel DPT + MiDaS 계열입니다. 실내·야외 모두 안정적이고, Depth Anything과 깊이 느낌이 다를 수 있어 비교용으로 좋습니다.',
    homepage: 'https://huggingface.co/Xenova/dpt-hybrid-midas',
    license: 'CC-BY-NC-4.0 (원본/파생 카드 확인 필요)',
    usePolicy: 'non-commercial',
    recommendedFor: ['object'],
    benchmark: { sample: 'sample-object-studio-1024', latencyMs: 1720, edgeScore: 83 }
  },
  {
    id: 'Xenova/dpt-large',
    name: 'DPT Large',
    shortName: 'DPT Large',
    family: 'DPT / MiDaS',
    tier: 'quality',
    sizeHint: '~1GB급',
    description:
      '고해상도 밀집 깊이 추정에 강한 DPT Large입니다. 느리고 무겁지만 경계·평면이 또렷해질 수 있습니다.',
    homepage: 'https://huggingface.co/Xenova/dpt-large',
    license: 'CC-BY-NC-4.0 (원본/파생 카드 확인 필요)',
    usePolicy: 'non-commercial',
    recommendedFor: ['object'],
    benchmark: { sample: 'sample-object-studio-1024', latencyMs: 2840, edgeScore: 89 }
  },
  {
    id: 'Xenova/glpn-kitti',
    name: 'GLPN KITTI',
    shortName: 'GLPN KITTI',
    family: 'GLPN',
    tier: 'balanced',
    sizeHint: '~200MB급',
    description:
      '도로·야외(KITTI) 데이터에 맞춘 GLPN입니다. 거리·풍경 사진에서 원근감이 잘 나오는 편입니다.',
    homepage: 'https://huggingface.co/Xenova/glpn-kitti',
    license: 'CC-BY-NC-4.0 (원본/파생 카드 확인 필요)',
    usePolicy: 'non-commercial',
    recommendedFor: ['space'],
    benchmark: { sample: 'sample-outdoor-kitti-1024', latencyMs: 1350, edgeScore: 76 }
  },
  {
    id: 'Xenova/glpn-nyu',
    name: 'GLPN NYUv2',
    shortName: 'GLPN NYU',
    family: 'GLPN',
    tier: 'balanced',
    sizeHint: '~200MB급',
    description:
      '실내(NYUv2)에 맞춘 GLPN입니다. 방·복도처럼 실내 장면에서 바닥·벽 구분이 더 나을 수 있습니다.',
    homepage: 'https://huggingface.co/Xenova/glpn-nyu',
    license: 'CC-BY-NC-4.0 (원본/파생 카드 확인 필요)',
    usePolicy: 'non-commercial',
    recommendedFor: ['space'],
    benchmark: { sample: 'sample-indoor-nyu-1024', latencyMs: 1310, edgeScore: 78 }
  }
]

export const DEFAULT_MODEL_ID = 'onnx-community/depth-anything-v2-base-ONNX'
export const DEFAULT_OBJECT_MODEL_ID = 'onnx-community/depth-anything-v2-base-ONNX'

export const NON_COMMERCIAL_MODEL_IDS = new Set(DEPTH_MODELS.map((m) => m.id))

export const SPACE_MODEL_IDS = new Set([
  'onnx-community/depth-anything-v2-small',
  'onnx-community/depth-anything-v2-base',
  'onnx-community/depth-anything-v2-small-ONNX',
  'onnx-community/depth-anything-v2-base-ONNX',
  'onnx-community/depth-anything-v2-large-ONNX',
  'Xenova/glpn-kitti',
  'Xenova/glpn-nyu'
])

export const OBJECT_MODEL_IDS = new Set([
  'onnx-community/depth-anything-v2-small',
  'onnx-community/depth-anything-v2-base',
  'onnx-community/depth-anything-v2-small-ONNX',
  'onnx-community/depth-anything-v2-base-ONNX',
  'onnx-community/depth-anything-v2-large-ONNX',
  'Xenova/dpt-hybrid-midas',
  'Xenova/dpt-large',
  'Xenova/depth-anything-small-hf'
])

/**
 * @param {'space'|'object'|string} mode
 */
export function getModelsByMode(mode) {
  const ids = mode === 'object' ? OBJECT_MODEL_IDS : SPACE_MODEL_IDS
  return DEPTH_MODELS.filter((m) => ids.has(m.id) && NON_COMMERCIAL_MODEL_IDS.has(m.id))
}

/**
 * @param {'space'|'object'|string} mode
 */
export function getDefaultModelIdByMode(mode) {
  return mode === 'object' ? DEFAULT_OBJECT_MODEL_ID : DEFAULT_MODEL_ID
}

/**
 * @param {string} id
 * @returns {DepthModelInfo}
 */
export function getModelById(id) {
  return DEPTH_MODELS.find((m) => m.id === id) || DEPTH_MODELS[0]
}

/**
 * @param {DepthModelInfo} model
 */
export function formatModelSummary(model) {
  return `${model.name} · ${model.tier} · ${model.sizeHint}`
}
