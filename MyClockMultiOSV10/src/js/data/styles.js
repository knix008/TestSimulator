'use strict';

/** 시계 스타일 / 알람음 카탈로그 — legacy-wpf/Models/ClockStyle.cs, AlarmSoundCatalog.cs 이식. */

const DIGITAL_STYLES = [
  { id: 'SevenSegment', label: '7-세그먼트' },
  { id: 'LcdText', label: 'LCD' },
  { id: 'Minimal', label: '미니멀' },
  { id: 'Retro', label: '레트로' },
  { id: 'Neon', label: '네온' },
  { id: 'DotMatrix', label: '도트' },
  { id: 'Korean', label: '한글' },
  { id: 'Matrix', label: '매트릭스' },
  { id: 'Vintage', label: '빈티지' },
  { id: 'Thin', label: '씬' }
];

const ANALOG_STYLES = [
  { id: 'Classic', label: '클래식' },
  { id: 'Minimal', label: '미니멀' },
  { id: 'Roman', label: '로마 숫자' },
  { id: 'Indices', label: '인덱스' },
  { id: 'Railroad', label: '철도' },
  { id: 'Bauhaus', label: '바우하우스' },
  { id: 'Dots', label: '도트' },
  { id: 'Aviator', label: '파일럿' },
  { id: 'Nautical', label: '항해' },
  { id: 'Modern', label: '모던' },
  { id: 'Steampunk', label: '스팀펑크' }
];

const ALARM_SOUNDS = [
  { id: 'Marimba', label: '마림바' },
  { id: 'Radar', label: '레이더' },
  { id: 'Beacon', label: '비콘' },
  { id: 'Circuit', label: '서킷' },
  { id: 'Crystals', label: '크리스탈' },
  { id: 'Hillside', label: '힐사이드' },
  { id: 'Sencha', label: '센차' },
  { id: 'Silk', label: '실크' },
  { id: 'SlowRise', label: '슬로 라이즈' },
  { id: 'Stargaze', label: '스타게이즈' },
  { id: 'Summit', label: '서밋' },
  { id: 'Dawn', label: '새벽' },
  { id: 'Galaxy', label: '갤럭시' },
  { id: 'Orbit', label: '오르빗' },
  { id: 'Ripple', label: '리플' },
  { id: 'Classic', label: '클래식' },
  { id: 'Chime', label: '차임' },
  { id: 'Bell', label: '벨' },
  { id: 'Digital', label: '디지털' },
  { id: 'Piano', label: '피아노' },
  { id: 'Harp', label: '하프' },
  { id: 'Fanfare', label: '팬파레' },
  { id: 'Ladder', label: '래더' },
  { id: 'Echo', label: '에코' },
  { id: 'Wave', label: '웨이브' },
  { id: 'Gentle', label: '부드러운' },
  { id: 'Pulse', label: '펄스' },
  { id: 'Bird', label: '새소리' },
  { id: 'Clock', label: '시계' },
  { id: 'Breeze', label: '브리즈' },
  { id: 'Siren', label: '사이렌' },
  { id: 'Urgent', label: '긴급' }
];

/** 캔버스로 그리는 디지털 스타일 (7세그먼트·도트) — 나머지는 텍스트로 그린다. */
function usesCanvasDigital(style) {
  return style === 'SevenSegment' || style === 'DotMatrix';
}

/** 텍스트 디지털 스타일별 글꼴·굵기·기준 크기·발광 효과. */
const TEXT_DIGITAL_FONTS = {
  Minimal: { family: "'Segoe UI', 'Noto Sans KR', sans-serif", weight: 300, size: 72, glow: 0 },
  Retro: { family: "'Courier New', monospace", weight: 400, size: 56, glow: 0 },
  Neon: { family: "Consolas, 'DejaVu Sans Mono', monospace", weight: 700, size: 64, glow: 18 },
  Korean: { family: "'Malgun Gothic', '맑은 고딕', 'Noto Sans KR', serif", weight: 600, size: 36, glow: 0 },
  Matrix: { family: "Consolas, 'DejaVu Sans Mono', monospace", weight: 700, size: 58, glow: 10 },
  Vintage: { family: "Georgia, 'Times New Roman', serif", weight: 400, size: 54, glow: 0 },
  Thin: { family: "'Segoe UI', 'Noto Sans KR', sans-serif", weight: 200, size: 76, glow: 0 },
  LcdText: { family: "Consolas, 'DejaVu Sans Mono', monospace", weight: 700, size: 60, glow: 0 }
};

function textDigitalFont(style) {
  return TEXT_DIGITAL_FONTS[style] || TEXT_DIGITAL_FONTS.LcdText;
}

if (typeof module !== 'undefined') {
  module.exports = {
    DIGITAL_STYLES,
    ANALOG_STYLES,
    ALARM_SOUNDS,
    usesCanvasDigital,
    textDigitalFont
  };
}
