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
    homepage: 'https://huggingface.co/onnx-community/depth-anything-v2-small'
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
    homepage: 'https://huggingface.co/onnx-community/depth-anything-v2-base'
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
    homepage: 'https://huggingface.co/onnx-community/depth-anything-v2-small-ONNX'
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
    homepage: 'https://huggingface.co/onnx-community/depth-anything-v2-base-ONNX'
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
    homepage: 'https://huggingface.co/onnx-community/depth-anything-v2-large-ONNX'
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
    homepage: 'https://huggingface.co/Xenova/depth-anything-small-hf'
  }
]

export const DEFAULT_MODEL_ID = 'onnx-community/depth-anything-v2-base-ONNX'

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
