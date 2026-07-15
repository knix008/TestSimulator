// 임베디드 환경에서 사용 가능한 ONNX 기반 TTS 모델 카탈로그
// 모든 레포는 HuggingFace 공개 레포이며 인증 없이 다운로드 가능
const defaultCatalog = [
  {
    id: 'ko-piper-kss',
    label: 'Piper KSS',
    language: 'ko-KR',
    sizeHint: '64 MB',
    runtime: 'piper-onnx',
    description: '경량 임베디드 최적 모델 (VITS 기반)',
    source: {
      type: 'repo',
      repoId: 'neurlang/piper-onnx-kss-korean'
    },
    preferredOnFirstRun: true
  },
  {
    id: 'ko-supertonic-int8',
    label: 'Supertonic 3 INT8',
    language: 'ko-KR',
    sizeHint: '~140 MB',
    runtime: 'sherpa-onnx',
    description: 'Supertonic 3 · INT8 · 한국어 안정성 개선(단어 skip 감소) · 31언어',
    source: {
      type: 'repo',
      repoId: 'csukuangfj2/sherpa-onnx-supertonic-3-tts-int8-2026-05-11'
    }
  },
  {
    id: 'ko-mms-tts',
    label: 'MMS TTS',
    language: 'ko-KR',
    sizeHint: '140 MB',
    runtime: 'transformers-js',
    description: 'Meta MMS · Transformers.js 호환',
    source: {
      type: 'repo',
      repoId: 'Xenova/mms-tts-kor'
    }
  },
  {
    id: 'en-kokoro',
    label: 'Kokoro 82M',
    language: 'en-US',
    sizeHint: '~310 MB',
    runtime: 'onnx',
    description: '영어 고품질 TTS (ONNX)',
    source: {
      type: 'repo',
      repoId: 'onnx-community/Kokoro-82M-v1.0-ONNX'
    }
  }
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
