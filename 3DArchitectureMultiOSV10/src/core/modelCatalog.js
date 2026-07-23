/**
 * 전체 AI 모델 카탈로그.
 *
 * runtime: 'onnx-web'   → onnxruntime-web (WebAssembly, 브라우저/Electron 렌더러에서 직접 실행)
 * runtime: 'python-api' → Flask/Python 서버 경유 (ONNX Runtime + CUDA 가능)
 */
export const MODEL_CATALOG = {

  /* ── ONNX-Web 모델 (브라우저 직접 실행) ── */
  'depth-anything-v2-small': {
    runtime: 'onnx-web',
    name:           'Depth Anything V2 Small',
    name_ko:        'Depth Anything V2 소형',
    description:    'Depth map from 2D image · lightweight · runs in browser (WebAssembly)',
    description_ko: '2D 이미지 → 깊이 맵 · 경량 · 브라우저 직접 실행 (WASM)',
    url:      'https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/main/onnx/model.onnx',
    size_mb:  99,
    task:     'depth',
    input_size:  [518, 518],
    mean: [0.485, 0.456, 0.406],
    std:  [0.229, 0.224, 0.225],
    input_name:  'pixel_values',
    output_name: 'predicted_depth',
  },

  'midas-v21-small': {
    runtime: 'onnx-web',
    name:           'MiDaS v2.1 Small',
    name_ko:        'MiDaS v2.1 소형',
    description:    'Monocular depth estimation · lightweight · runs in browser (WebAssembly)',
    description_ko: '단안 깊이 추정 · 경량 · 브라우저 직접 실행 (WASM)',
    url:      'https://huggingface.co/Heliosoph/midas-small-onnx/resolve/main/midas_v21_small_256.onnx',
    size_mb:  66,
    task:     'depth',
    input_size:  [256, 256],
    mean: [0.485, 0.456, 0.406],
    std:  [0.229, 0.224, 0.225],
    input_name:  'input',
    output_name: null, // auto-detect
  },

  /* ── Python-API 모델 (서버 경유, GPU 지원) ── */
  'depth-anything-v2-base': {
    runtime: 'python-api',
    name:           'Depth Anything V2 Base',
    name_ko:        'Depth Anything V2 기본',
    description:    'Higher-accuracy depth map · runs on Python server (CUDA GPU supported)',
    description_ko: '고정밀 깊이 맵 · Python 서버 실행 (CUDA GPU 지원)',
    size_mb:  390,
    task:     'depth',
  },

  'depth-anything-v2-large': {
    runtime: 'python-api',
    name:           'Depth Anything V2 Large',
    name_ko:        'Depth Anything V2 대형',
    description:    'Highest-accuracy depth map · Python server + GPU required',
    description_ko: '최고 정밀도 깊이 맵 · Python 서버 + GPU 필요',
    size_mb:  1340,
    task:     'depth',
  },
};

export const ONNX_WEB_MODELS   = Object.fromEntries(
  Object.entries(MODEL_CATALOG).filter(([, v]) => v.runtime === 'onnx-web'),
);
export const PYTHON_API_MODELS = Object.fromEntries(
  Object.entries(MODEL_CATALOG).filter(([, v]) => v.runtime === 'python-api'),
);
