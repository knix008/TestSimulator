// 임베디드 환경에서 사용 가능한 ONNX 기반 TTS 모델 카탈로그
// 모든 레포는 HuggingFace 공개 레포이며 인증 없이 다운로드 가능
const defaultCatalog = [
  {
    id: 'ko-supertonic-int8',
    // Supertonic 3 vocoder needs ORT ai.onnx.ml opset 5; sherpa-onnx-node 1.13.x
    // aborts the process on load. Use Supertonic 2 until a newer sherpa ships.
    label: 'Supertonic 2 INT8',
    language: 'ko-KR',
    sizeHint: '~100 MB',
    runtime: 'sherpa-onnx',
    description: 'Supertonic 2 · INT8 · 한국어 · 31언어',
    source: {
      type: 'repo',
      repoId: 'csukuangfj2/sherpa-onnx-supertonic-tts-int8-2026-03-06',
      packageId: 'supertonic2-2026-03-06',
    },
    preferredOnFirstRun: true
  },
  {
    id: 'ko-piper-kss',
    label: 'Piper KSS',
    language: 'ko-KR',
    sizeHint: '64 MB',
    runtime: 'piper-onnx',
    description: '경량 임베디드 최적 모델 (VITS 기반)',
    source: {
      type: 'repo',
      repoId: 'neurlang/piper-onnx-kss-korean',
      // Pin LFS sha256 — size-only checks miss same-length corrupt downloads.
      packageId: 'piper-kss-sha-v1',
      preferOnnx: [
        'piper-kss-korean.onnx',
      ],
      fileHashes: {
        'piper-kss-korean.onnx':
          '5f8cb6d040294ec2b6a359f644b11f0723413fdfb404e6ba548e63d8862bc887',
      },
    },
    preferredOnFirstRun: false
  },
  {
    id: 'ko-mms-tts',
    label: 'MMS TTS',
    language: 'ko-KR',
    sizeHint: '~38 MB',
    runtime: 'transformers-js',
    description: 'Meta MMS · quantized ONNX',
    source: {
      type: 'repo',
      repoId: 'Xenova/mms-tts-kor',
      // Full/fp16 ONNX from this repo fail ORT protobuf parse; ship quantized only.
      packageId: 'quantized-v1',
      preferOnnx: [
        'onnx/model_quantized.onnx',
      ],
    }
  },
  {
    id: 'en-kokoro',
    label: 'Kokoro 82M',
    language: 'en-US',
    sizeHint: '~82 MB',
    runtime: 'onnx',
    description: '영어 고품질 TTS (ONNX q8f16, 임베디드용)',
    source: {
      type: 'repo',
      repoId: 'onnx-community/Kokoro-82M-v1.0-ONNX',
      // Embedded: q8f16 graph (~82MB) + default voice only (~0.5MB).
      packageId: 'q8f16-af-heart-v1',
      preferOnnx: [
        'onnx/model_q8f16.onnx',
      ],
      preferVoices: [
        'af_heart',
      ],
    },
  },
  {
    id: 'ko-en-melotts',
    label: 'MeloTTS KR/EN',
    language: 'ko-KR',
    sizeHint: '~55 MB',
    runtime: 'melotts',
    description: 'MeloTTS · 한국어/영어 · INT8 ONNX · 44.1 kHz',
    source: {
      type: 'repo',
      repoId: 'gnyong/melotts-kr-onnx',
      packageId: 'int8-v1',
      preferOnnx: [
        'melotts_kr_int8.onnx',
      ],
      fileHashes: {
        'melotts_kr_int8.onnx': '421b94ce7e803fdd0126c7d39d90192b64878794619668cf3ec12611fc860f88',
      },
    },
  },
  {
    id: 'ko-en-kokoro',
    label: 'Kokoro 82M KO/EN',
    language: 'ko-KR',
    sizeHint: '~84 MB',
    runtime: 'onnx',
    description: 'Kokoro 82M · 한국어(로마자 변환)/영어 · 다중 음성 (ONNX q8f16)',
    source: {
      type: 'repo',
      repoId: 'onnx-community/Kokoro-82M-v1.0-ONNX',
      packageId: 'q8f16-multi-voice-v1',
      preferOnnx: [
        'onnx/model_q8f16.onnx',
      ],
      preferVoices: [
        'af_heart', 'af_bella', 'am_michael', 'am_adam',
      ],
      fileHashes: {
        'onnx/model_q8f16.onnx': '04c658aec1b6008857c2ad10f8c589d4180d0ec427e7e6118ceb487e215c3cd0',
      },
    },
  },
];

export function getPreferredModelId(language) {
  return (
    defaultCatalog.find((m) => m.language === language && m.preferredOnFirstRun)?.id
    || defaultCatalog.find((m) => m.language === language)?.id
    || defaultCatalog[0]?.id
    || null
  );
}

export function getInitialModelId() {
  return getPreferredModelId('ko-KR');
}

export function getModelCatalog() {
  return defaultCatalog;
}

export function getDefaultCacheDirectory() {
  if (typeof process !== 'undefined' && process.platform) {
    const home = process.env.APPDATA || process.env.HOME || process.env.USERPROFILE || '.';
    return `${home}/TTSMultiOSV10/models`;
  }
  return 'tts-models';
}

export async function ensureModelCatalog() {
  return defaultCatalog;
}
