// What the app can download by itself (CONTRACT: pure data). Everything comes verbatim from the
// authors' own GitHub releases — never re-hosted or modified — and is checked by size and SHA-256.
// The SHA-256 of TIGER v106 was taken from the official release file (GitHub publishes no digest
// for that asset); openvpi's vocoder digest is the one GitHub publishes for the release asset.
// Licences: the user reads and accepts them in Settings › Voice before the first download.

export const TIGER_ID = 'tiger';
export const PC_NSF_ID = 'pc_nsf_hifigan_44.1k_hop512_128bin_2025.02';
export const NSF_2024_ID = 'nsf_hifigan_44.1k_hop512_128bin_2024.02';

/** Downloadable items: banks and the vocoders banks name as dependencies. */
export const CATALOG = {
  [TIGER_ID]: {
    id: TIGER_ID,
    kind: 'bank',
    name: 'TIGER DS v106',
    author: 'tigermeat (neutrogic)',
    version: 'v106',
    url: 'https://github.com/spicytigermeat/tiger_diffsinger/releases/download/v106/TIGER_DS_v106_PACK.zip',
    size: 555302285,
    sha256: 'b19d498f46f05f58f049ec2ec0ee2b569a01a4fbda41667922d7c773f1196c19',
    page: 'https://github.com/spicytigermeat/tiger_diffsinger/releases/tag/v106',
    licenceUrl: 'https://github.com/spicytigermeat/tiger_diffsinger/blob/main/LICENSE.md',
    licence: 'CC BY-NC-ND 4.0 + Commons Clause',
    languages: ['en', 'es', 'fr', 'it', 'ja', 'ko', 'pt', 'zh'],
    installedSize: 595555629,
    /**
     * TIGER bundles its own vocoder (dsvocoder/tgm_hifigan.onnx), but that model casts to float64,
     * which onnxruntime-web cannot run ("Cast(13)" has no implementation): it sings through OpenVPI's
     * PC-NSF-HiFiGAN instead (same 44.1 kHz / hop 512 / 128 mel bins / 40–16000 Hz frame).
     */
    vocoder: PC_NSF_ID,
    /** The licence in short (the full text is the author's LICENSE.md and the bank's extra/LICENSE.md). */
    terms: {
      ko: [
        'TIGER DiffSinger 모델 © 2023 "tigermeat"/"neutrogic" — CC BY-NC-ND 4.0 + Commons Clause.',
        '비영리 용도로만 쓸 수 있습니다. 상업적 사용은 저작권자에게서 따로 라이선스를 사야 합니다 (tora@tora-ouji.com).',
        '모델을 고치거나 다시 배포할 수 없습니다. 이 프로그램은 공식 GitHub 릴리스에서 원본 그대로 내려받기만 합니다.',
        '사람에게 해를 끼치는 용도(허위 정보, 불법 행위, 혐오 표현 등)에는 쓸 수 없습니다.',
        '만든 노래에는 "TIGER (tigermeat)" 출처를 밝혀 주세요. 그림을 이미지 생성 AI 학습에 쓰는 것은 금지됩니다.',
      ],
      en: [
        'TIGER DiffSinger models © 2023 "tigermeat"/"neutrogic" — CC BY-NC-ND 4.0 + Commons Clause.',
        'Non-commercial use only. Commercial use needs a licence bought from the rights holder (tora@tora-ouji.com).',
        'The models may not be modified or redistributed. This app only downloads them, unchanged, from the official GitHub release.',
        'Not for uses that harm people (misinformation, illegal activity, hate speech, …).',
        'Credit "TIGER (tigermeat)" in songs you make. Using the images to train image-generation AI is prohibited.',
      ],
    },
  },
  [PC_NSF_ID]: {
    id: PC_NSF_ID,
    kind: 'vocoder',
    name: 'PC-NSF-HiFiGAN 44.1k hop512 128bin (2025.02)',
    author: 'OpenVPI',
    version: '2025.02',
    url: 'https://github.com/openvpi/vocoders/releases/download/pc-nsf-hifigan-44.1k-hop512-128bin-2025.02/pc_nsf_hifigan_44.1k_hop512_128bin_2025.02.oudep',
    size: 52760610,
    sha256: 'ba7d43142d41f6900c8264b5662ca7125a50feb8760bb8b9615c61a8f5e6902e',
    page: 'https://github.com/openvpi/vocoders/releases/tag/pc-nsf-hifigan-44.1k-hop512-128bin-2025.02',
    licenceUrl: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
    licence: 'CC BY-NC-SA 4.0',
    installedSize: 54000000,
    terms: {
      ko: [
        'OpenVPI PC-NSF-HiFiGAN 보코더 — CC BY-NC-SA 4.0 (저작자 표시 · 비영리 · 동일 조건 변경 허락).',
        '비영리 용도로만 쓸 수 있고, 만든 소리에 OpenVPI 출처를 밝혀야 합니다. 자세한 조건은 패키지의 NOTICE.txt를 보세요.',
      ],
      en: [
        'OpenVPI PC-NSF-HiFiGAN vocoder — CC BY-NC-SA 4.0 (attribution, non-commercial, share-alike).',
        'Non-commercial use only; credit OpenVPI. See NOTICE.txt in the package for the full terms.',
      ],
    },
  },
  [NSF_2024_ID]: {
    id: NSF_2024_ID,
    kind: 'vocoder',
    name: 'NSF-HiFiGAN 44.1k hop512 128bin (2024.02)',
    author: 'OpenVPI',
    version: '2024.02',
    url: 'https://github.com/openvpi/vocoders/releases/download/nsf-hifigan-44.1k-hop512-128bin-2024.02/nsf_hifigan_44.1k_hop512_128bin_2024.02.oudep',
    size: 52893206,
    sha256: '',
    page: 'https://github.com/openvpi/vocoders/releases/tag/nsf-hifigan-44.1k-hop512-128bin-2024.02',
    licenceUrl: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
    licence: 'CC BY-NC-SA 4.0',
    installedSize: 54000000,
    terms: {
      ko: ['OpenVPI NSF-HiFiGAN 보코더 — CC BY-NC-SA 4.0. 비영리 용도로만 쓸 수 있고 OpenVPI 출처를 밝혀야 합니다.'],
      en: ['OpenVPI NSF-HiFiGAN vocoder — CC BY-NC-SA 4.0. Non-commercial use only; credit OpenVPI.'],
    },
  },
};

/** The default bank of the AI voice. */
export const DEFAULT_BANK = TIGER_ID;

/** Banks the user can get with one click (the others are imported .zip files). */
export const DOWNLOADABLE_BANKS = [TIGER_ID];

/**
 * The installed vocoder id to use for a bank that names `dependency` in its dsconfig: the same id
 * when it is in the catalog, else OpenVPI's PC-NSF-HiFiGAN (OpenUtau falls back the same way).
 */
export function vocoderFor(dependency) {
  if (dependency && CATALOG[dependency]?.kind === 'vocoder') return dependency;
  return PC_NSF_ID;
}

/**
 * The external vocoder a bank sings through, or null for its own bundled one: catalog banks that
 * name one, banks whose bundled vocoder failed to load here (meta.vocoderUnsupported), and banks
 * that ship none.
 */
export function externalVocoder(id, layout, meta = null) {
  if (CATALOG[id]?.vocoder) return CATALOG[id].vocoder;
  if (layout?.vocoder?.bundled && !meta?.vocoderUnsupported) return null;
  return vocoderFor(layout?.vocoder?.dependency);
}

/** Banks people often import (shown as hints; the user downloads them from the author). */
export const IMPORT_HINTS = [
  { name: 'Hanami Hoshino (호시노 하나미)', language: 'ko' },
];
