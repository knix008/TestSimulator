/**
 * onnxruntime-web을 사용하여 브라우저/Electron 렌더러에서 ONNX 추론을 실행합니다.
 * Python 서버 없이 WebAssembly로 CPU 추론합니다.
 */
import * as ort from 'onnxruntime-web';

// WASM 파일을 CDN에서 로드 (인터넷 필요 — 모델 다운로드와 동일 조건)
ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0/dist/';
ort.env.wasm.numThreads = Math.max(1, (navigator.hardwareConcurrency ?? 4) - 1);

// 로드된 세션 캐시
const sessions = {};

/**
 * IndexedDB에서 모델을 로드해 InferenceSession을 생성합니다.
 * @param {string} id  모델 ID
 * @param {ArrayBuffer} buffer  모델 파일 ArrayBuffer
 */
export async function createSession(id, buffer) {
  if (sessions[id]) return sessions[id];
  const sess = await ort.InferenceSession.create(buffer, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  });
  sessions[id] = sess;
  return sess;
}

/** 세션을 캐시에서 제거합니다. */
export function releaseSession(id) {
  delete sessions[id];
}

/**
 * 이미지 DataURL을 받아 깊이 맵 DataURL을 반환합니다.
 * @param {string}      id           모델 ID
 * @param {ArrayBuffer} buffer       모델 파일 ArrayBuffer
 * @param {string}      imageDataUrl 입력 이미지 (base64 data URL)
 * @param {object}      info         modelCatalog 항목
 * @returns {{ depth_map: string, width: number, height: number }}
 */
export async function runDepthInference(id, buffer, imageDataUrl, info) {
  const sess = await createSession(id, buffer);

  // 이미지 로드
  const img = await loadImage(imageDataUrl);
  const origW = img.naturalWidth;
  const origH = img.naturalHeight;

  const [inH, inW] = info.input_size;
  const mean = info.mean ?? [0.485, 0.456, 0.406];
  const std  = info.std  ?? [0.229, 0.224, 0.225];

  // 전처리: 입력 크기로 리사이즈 → 정규화 → NCHW Float32
  const canvas = document.createElement('canvas');
  canvas.width  = inW;
  canvas.height = inH;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, inW, inH);
  const pixels = ctx.getImageData(0, 0, inW, inH).data;

  const float32 = new Float32Array(3 * inH * inW);
  for (let i = 0; i < inH * inW; i++) {
    float32[0 * inH * inW + i] = (pixels[i * 4]     / 255 - mean[0]) / std[0];
    float32[1 * inH * inW + i] = (pixels[i * 4 + 1] / 255 - mean[1]) / std[1];
    float32[2 * inH * inW + i] = (pixels[i * 4 + 2] / 255 - mean[2]) / std[2];
  }

  const inputName  = info.input_name  || sess.inputNames[0];
  const outputName = info.output_name || sess.outputNames[0];
  const inputTensor = new ort.Tensor('float32', float32, [1, 3, inH, inW]);

  // 추론
  const results = await sess.run({ [inputName]: inputTensor });
  const out     = results[outputName] ?? results[sess.outputNames[0]];
  let   depth   = Array.from(out.data); // Float32Array → Array

  // 출력 shape 정규화: 마지막 inH×inW 블록만 사용
  const pixCount = inH * inW;
  if (depth.length > pixCount) depth = depth.slice(depth.length - pixCount);

  // 정규화 → 0–255 grayscale
  let dMin = Infinity, dMax = -Infinity;
  for (const v of depth) { if (v < dMin) dMin = v; if (v > dMax) dMax = v; }
  const range = dMax - dMin || 1;

  // 원본 해상도로 리사이즈
  const depthCanvas = document.createElement('canvas');
  depthCanvas.width  = origW;
  depthCanvas.height = origH;
  const dCtx  = depthCanvas.getContext('2d');
  const small = document.createElement('canvas');
  small.width  = inW;
  small.height = inH;
  const sCtx = small.getContext('2d');
  const imgData = sCtx.createImageData(inW, inH);
  for (let i = 0; i < pixCount; i++) {
    const v = Math.round(((depth[i] - dMin) / range) * 255);
    imgData.data[i * 4]     = v;
    imgData.data[i * 4 + 1] = v;
    imgData.data[i * 4 + 2] = v;
    imgData.data[i * 4 + 3] = 255;
  }
  sCtx.putImageData(imgData, 0, 0);
  dCtx.drawImage(small, 0, 0, origW, origH);

  return {
    depth_map: depthCanvas.toDataURL('image/png'),
    width:  origW,
    height: origH,
  };
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = () => reject(new Error('이미지를 불러올 수 없습니다.'));
    img.src = src;
  });
}
