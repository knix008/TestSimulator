/**
 * 전체 AI 모델 카탈로그.
 *
 * runtime: 'onnx-web'   → onnxruntime-web (WebAssembly, 브라우저/Electron 렌더러에서 직접 실행)
 * runtime: 'python-api' → Flask/Python 서버 경유 (ONNX Runtime + CUDA 가능)
 */
export const MODEL_CATALOG = {

  /* ── ONNX-Web 모델 (브라우저 직접 실행, 인터넷 최초 다운로드 필요) ── */

  // Depth Anything V2 Small: DINOv2 기반, 518×518 입력, 99MB
  // onnx-community 공식 변환 — input: pixel_values [1,3,518,518], output: predicted_depth [1,518,518]
  'depth-anything-v2-small': {
    runtime: 'onnx-web',
    name:           'Depth Anything V2 Small',
    name_ko:        'Depth Anything V2 소형',
    description:    'DINOv2-based depth · 518 px input · 99 MB · runs in browser (WebAssembly)',
    description_ko: 'DINOv2 기반 깊이 맵 · 518 px 입력 · 99 MB · 브라우저 직접 실행 (WASM)',
    url:         'https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/main/onnx/model.onnx',
    size_mb:     99,
    task:        'depth',
    input_size:  [518, 518],
    mean:        [0.485, 0.456, 0.406],
    std:         [0.229, 0.224, 0.225],
    input_name:  'pixel_values',
    output_name: 'predicted_depth',
  },

  // MiDaS v2.1 Small: 256×256 입력, 66MB — Depth Anything 대비 소형/경량 대안
  // onnx-community 공식 변환 — input: pixel_values [1,3,256,256], output: predicted_depth [1,256,256]
  'midas-v21-small': {
    runtime: 'onnx-web',
    name:           'MiDaS v2.1 Small',
    name_ko:        'MiDaS v2.1 소형',
    description:    'Monocular depth · 256 px input · 66 MB · runs in browser (WebAssembly)',
    description_ko: '단안 깊이 추정 · 256 px 입력 · 66 MB · 브라우저 직접 실행 (WASM)',
    url:         'https://huggingface.co/onnx-community/MiDaS-small/resolve/main/onnx/model.onnx',
    size_mb:     66,
    task:        'depth',
    input_size:  [256, 256],
    mean:        [0.485, 0.456, 0.406],
    std:         [0.229, 0.224, 0.225],
    input_name:  'pixel_values',
    output_name: 'predicted_depth',
  },

  /* ── Python-API 모델 (Python 서버 경유, GPU 지원) ── */

  // Depth Anything V2 Base: 고정밀 버전, GPU 권장, Python 서버 필요
  'depth-anything-v2-base': {
    runtime: 'python-api',
    name:           'Depth Anything V2 Base',
    name_ko:        'Depth Anything V2 기본',
    description:    'Higher-accuracy depth · 390 MB · Python server required (CUDA GPU supported)',
    description_ko: '고정밀 깊이 맵 · 390 MB · Python 서버 필요 (CUDA GPU 지원)',
    size_mb:  390,
    task:     'depth',
  },
};

export const ONNX_WEB_MODELS   = Object.fromEntries(
  Object.entries(MODEL_CATALOG).filter(([, v]) => v.runtime === 'onnx-web'),
);
export const PYTHON_API_MODELS = Object.fromEntries(
  Object.entries(MODEL_CATALOG).filter(([, v]) => v.runtime === 'python-api'),
);
