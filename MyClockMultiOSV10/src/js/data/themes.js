'use strict';

/**
 * 색상 테마 —
 *   · 아래 THEMES 블록 18가지: MyClockWinV10/Themes/*.xaml 에서 변환
 *     (각 브러시 키는 동일한 의미의 CSS 커스텀 속성으로 매핑된다)
 *   · 그 뒤 PALETTE_THEMES 12가지: 팔레트 몇 색만 정해 buildTheme 으로 생성
 *   · THEME_FAMILIES: 색마다 어두운 판과 밝은 판을 짝지어 둔 목록.
 *     손으로 고른 쪽은 그대로 두고 없는 쪽만 twinTheme 으로 만들어 채우므로
 *     두 판의 수는 늘 같다 (29색 × 2).
 *   · CustomTheme: 사용자가 고른 색으로 그때그때 생성 (setCustomTheme)
 */
const THEMES = {
  DarkTheme: {
    label: '다크',
    vars: {
      '--window-background': '#1E1E2E',
      '--panel-background': '#313244',
      '--foreground': '#CDD6F4',
      '--subtle-foreground': '#A6ADC8',
      '--accent': '#89B4FA',
      '--clock-face': '#181825',
      '--clock-border': '#89B4FA',
      '--hour-hand': '#CDD6F4',
      '--minute-hand': '#89B4FA',
      '--second-hand': '#F38BA8',
      '--tick-mark': '#45475A',
      '--hour-tick': '#CDD6F4',
      '--number': '#BAC2DE',
      '--tab-background': '#181825',
      '--tab-selected': '#1E1E2E',
      '--button-background': '#45475A',
      '--button-hover': '#585B70',
      '--button-foreground': '#CDD6F4',
      '--border': '#45475A',
      '--alarm-enabled': '#A6E3A1',
      '--alarm-disabled': '#45475A',
      '--danger': '#F38BA8',
      '--digital-text': '#89B4FA',
      '--center-dot': '#F38BA8',
      '--active-btn': '#89B4FA',
      '--active-btn-fg': '#1E1E2E',
      '--seg-dim': '#1A2040'
    }
  },
  LightTheme: {
    label: '라이트',
    vars: {
      '--window-background': '#EFF1F5',
      '--panel-background': '#DCE0E8',
      '--foreground': '#4C4F69',
      '--subtle-foreground': '#6C6F85',
      '--accent': '#1E66F5',
      '--clock-face': '#FFFFFF',
      '--clock-border': '#1E66F5',
      '--hour-hand': '#4C4F69',
      '--minute-hand': '#1E66F5',
      '--second-hand': '#D20F39',
      '--tick-mark': '#BCC0CC',
      '--hour-tick': '#4C4F69',
      '--number': '#4C4F69',
      '--tab-background': '#E6E9EF',
      '--tab-selected': '#EFF1F5',
      '--button-background': '#CCD0DA',
      '--button-hover': '#BCC0CC',
      '--button-foreground': '#4C4F69',
      '--border': '#BCC0CC',
      '--alarm-enabled': '#40A02B',
      '--alarm-disabled': '#BCC0CC',
      '--danger': '#D20F39',
      '--digital-text': '#1E66F5',
      '--center-dot': '#D20F39',
      '--active-btn': '#1E66F5',
      '--active-btn-fg': '#FFFFFF',
      '--seg-dim': '#D8DCE8'
    }
  },
  BlueTheme: {
    label: '미드나이트',
    vars: {
      '--window-background': '#0D1117',
      '--panel-background': '#161B22',
      '--foreground': '#E6EDF3',
      '--subtle-foreground': '#8B949E',
      '--accent': '#58A6FF',
      '--clock-face': '#0D1117',
      '--clock-border': '#1F6FEB',
      '--hour-hand': '#E6EDF3',
      '--minute-hand': '#58A6FF',
      '--second-hand': '#FF7B72',
      '--tick-mark': '#21262D',
      '--hour-tick': '#8B949E',
      '--number': '#8B949E',
      '--tab-background': '#010409',
      '--tab-selected': '#0D1117',
      '--button-background': '#21262D',
      '--button-hover': '#30363D',
      '--button-foreground': '#E6EDF3',
      '--border': '#30363D',
      '--alarm-enabled': '#3FB950',
      '--alarm-disabled': '#21262D',
      '--danger': '#FF7B72',
      '--digital-text': '#58A6FF',
      '--center-dot': '#FF7B72',
      '--active-btn': '#1F6FEB',
      '--active-btn-fg': '#E6EDF3',
      '--seg-dim': '#0A1520'
    }
  },
  OceanTheme: {
    label: '오션',
    vars: {
      '--window-background': '#0A1628',
      '--panel-background': '#112240',
      '--foreground': '#CCD6F6',
      '--subtle-foreground': '#8892B0',
      '--accent': '#64FFDA',
      '--clock-face': '#0A1628',
      '--clock-border': '#64FFDA',
      '--hour-hand': '#CCD6F6',
      '--minute-hand': '#64FFDA',
      '--second-hand': '#FF6B6B',
      '--tick-mark': '#1D3461',
      '--hour-tick': '#8892B0',
      '--number': '#8892B0',
      '--tab-background': '#050D1F',
      '--tab-selected': '#0A1628',
      '--button-background': '#1D3461',
      '--button-hover': '#2D5198',
      '--button-foreground': '#CCD6F6',
      '--border': '#1D3461',
      '--alarm-enabled': '#64FFDA',
      '--alarm-disabled': '#1D3461',
      '--danger': '#FF6B6B',
      '--digital-text': '#64FFDA',
      '--center-dot': '#FF6B6B',
      '--active-btn': '#64FFDA',
      '--active-btn-fg': '#0A1628',
      '--seg-dim': '#091830'
    }
  },
  RedTheme: {
    label: '루비',
    vars: {
      '--window-background': '#1A0000',
      '--panel-background': '#2D0A0A',
      '--foreground': '#FFD0D0',
      '--subtle-foreground': '#B08080',
      '--accent': '#FF4444',
      '--clock-face': '#120000',
      '--clock-border': '#CC2222',
      '--hour-hand': '#FFD0D0',
      '--minute-hand': '#FF4444',
      '--second-hand': '#FFAA00',
      '--tick-mark': '#3D1010',
      '--hour-tick': '#FF4444',
      '--number': '#CC8888',
      '--tab-background': '#0D0000',
      '--tab-selected': '#1A0000',
      '--button-background': '#3D1010',
      '--button-hover': '#551818',
      '--button-foreground': '#FFD0D0',
      '--border': '#3D1010',
      '--alarm-enabled': '#FF4444',
      '--alarm-disabled': '#3D1010',
      '--danger': '#FFAA00',
      '--digital-text': '#FF3333',
      '--center-dot': '#FFAA00',
      '--active-btn': '#FF4444',
      '--active-btn-fg': '#FFFFFF',
      '--seg-dim': '#250808'
    }
  },
  GreenTheme: {
    label: '에메랄드',
    vars: {
      '--window-background': '#001A08',
      '--panel-background': '#0A2D14',
      '--foreground': '#C8F5D8',
      '--subtle-foreground': '#70A880',
      '--accent': '#00E676',
      '--clock-face': '#001208',
      '--clock-border': '#00C853',
      '--hour-hand': '#C8F5D8',
      '--minute-hand': '#00E676',
      '--second-hand': '#FFEB3B',
      '--tick-mark': '#0F3D1E',
      '--hour-tick': '#00C853',
      '--number': '#70A880',
      '--tab-background': '#000D04',
      '--tab-selected': '#001A08',
      '--button-background': '#0F3D1E',
      '--button-hover': '#1A5528',
      '--button-foreground': '#C8F5D8',
      '--border': '#0F3D1E',
      '--alarm-enabled': '#00E676',
      '--alarm-disabled': '#0F3D1E',
      '--danger': '#FF5252',
      '--digital-text': '#00E676',
      '--center-dot': '#FFEB3B',
      '--active-btn': '#00C853',
      '--active-btn-fg': '#001208',
      '--seg-dim': '#041A08'
    }
  },
  PurpleTheme: {
    label: '퍼플',
    vars: {
      '--window-background': '#0F001A',
      '--panel-background': '#1E0D2D',
      '--foreground': '#E8D5FF',
      '--subtle-foreground': '#9070B0',
      '--accent': '#CC44FF',
      '--clock-face': '#0A0012',
      '--clock-border': '#AA22EE',
      '--hour-hand': '#E8D5FF',
      '--minute-hand': '#CC44FF',
      '--second-hand': '#FF66AA',
      '--tick-mark': '#2A103D',
      '--hour-tick': '#9060BB',
      '--number': '#9070B0',
      '--tab-background': '#07000F',
      '--tab-selected': '#0F001A',
      '--button-background': '#2A103D',
      '--button-hover': '#3D1A55',
      '--button-foreground': '#E8D5FF',
      '--border': '#2A103D',
      '--alarm-enabled': '#CC44FF',
      '--alarm-disabled': '#2A103D',
      '--danger': '#FF66AA',
      '--digital-text': '#CC44FF',
      '--center-dot': '#FF66AA',
      '--active-btn': '#AA22EE',
      '--active-btn-fg': '#FFFFFF',
      '--seg-dim': '#14041E'
    }
  },
  AmberTheme: {
    label: '앰버',
    vars: {
      '--window-background': '#1A0E00',
      '--panel-background': '#2D1E00',
      '--foreground': '#FFF0C0',
      '--subtle-foreground': '#B09060',
      '--accent': '#FFC107',
      '--clock-face': '#120A00',
      '--clock-border': '#FF9800',
      '--hour-hand': '#FFF0C0',
      '--minute-hand': '#FFC107',
      '--second-hand': '#FF5722',
      '--tick-mark': '#3D2800',
      '--hour-tick': '#FF9800',
      '--number': '#B09060',
      '--tab-background': '#0D0700',
      '--tab-selected': '#1A0E00',
      '--button-background': '#3D2800',
      '--button-hover': '#553800',
      '--button-foreground': '#FFF0C0',
      '--border': '#3D2800',
      '--alarm-enabled': '#FFC107',
      '--alarm-disabled': '#3D2800',
      '--danger': '#FF5722',
      '--digital-text': '#FFC107',
      '--center-dot': '#FF5722',
      '--active-btn': '#FFC107',
      '--active-btn-fg': '#1A0E00',
      '--seg-dim': '#221200'
    }
  },
  RoseTheme: {
    label: '로즈',
    vars: {
      '--window-background': '#2A1A2E',
      '--panel-background': '#3D2040',
      '--foreground': '#F5D4E8',
      '--subtle-foreground': '#C998C0',
      '--accent': '#FF80AB',
      '--clock-face': '#1A0A1E',
      '--clock-border': '#FF80AB',
      '--hour-hand': '#F5D4E8',
      '--minute-hand': '#FF80AB',
      '--second-hand': '#FF4081',
      '--tick-mark': '#5A3060',
      '--hour-tick': '#D4A0CC',
      '--number': '#E8C0D8',
      '--tab-background': '#1A0A1E',
      '--tab-selected': '#2A1A2E',
      '--button-background': '#5A3060',
      '--button-hover': '#6A4070',
      '--button-foreground': '#F5D4E8',
      '--border': '#5A3060',
      '--alarm-enabled': '#FF80AB',
      '--alarm-disabled': '#5A3060',
      '--danger': '#FF4081',
      '--digital-text': '#FF80AB',
      '--center-dot': '#FF4081',
      '--active-btn': '#FF80AB',
      '--active-btn-fg': '#1A0A1E',
      '--seg-dim': '#2A1030'
    }
  },
  MonoTheme: {
    label: '모노',
    vars: {
      '--window-background': '#121212',
      '--panel-background': '#1E1E1E',
      '--foreground': '#E0E0E0',
      '--subtle-foreground': '#9E9E9E',
      '--accent': '#BDBDBD',
      '--clock-face': '#0A0A0A',
      '--clock-border': '#757575',
      '--hour-hand': '#E0E0E0',
      '--minute-hand': '#BDBDBD',
      '--second-hand': '#FFFFFF',
      '--tick-mark': '#424242',
      '--hour-tick': '#9E9E9E',
      '--number': '#BDBDBD',
      '--tab-background': '#0A0A0A',
      '--tab-selected': '#121212',
      '--button-background': '#2C2C2C',
      '--button-hover': '#3C3C3C',
      '--button-foreground': '#E0E0E0',
      '--border': '#424242',
      '--alarm-enabled': '#9E9E9E',
      '--alarm-disabled': '#424242',
      '--danger': '#757575',
      '--digital-text': '#E0E0E0',
      '--center-dot': '#FFFFFF',
      '--active-btn': '#BDBDBD',
      '--active-btn-fg': '#121212',
      '--seg-dim': '#1A1A1A'
    }
  },
  SunsetTheme: {
    label: '선셋',
    vars: {
      '--window-background': '#1A0A00',
      '--panel-background': '#2E1500',
      '--foreground': '#FFD9B0',
      '--subtle-foreground': '#D4956A',
      '--accent': '#FF7043',
      '--clock-face': '#0F0500',
      '--clock-border': '#FF7043',
      '--hour-hand': '#FFD9B0',
      '--minute-hand': '#FF9800',
      '--second-hand': '#FF3D00',
      '--tick-mark': '#4A2A10',
      '--hour-tick': '#D4956A',
      '--number': '#FFCC80',
      '--tab-background': '#0F0500',
      '--tab-selected': '#1A0A00',
      '--button-background': '#4A2A10',
      '--button-hover': '#5A3A20',
      '--button-foreground': '#FFD9B0',
      '--border': '#4A2A10',
      '--alarm-enabled': '#FF9800',
      '--alarm-disabled': '#4A2A10',
      '--danger': '#FF3D00',
      '--digital-text': '#FF9800',
      '--center-dot': '#FF3D00',
      '--active-btn': '#FF7043',
      '--active-btn-fg': '#1A0A00',
      '--seg-dim': '#1E0D00'
    }
  },
  MintTheme: {
    label: '민트',
    vars: {
      '--window-background': '#0A1E1A',
      '--panel-background': '#122820',
      '--foreground': '#B2DFDB',
      '--subtle-foreground': '#80CBC4',
      '--accent': '#4DB6AC',
      '--clock-face': '#051210',
      '--clock-border': '#4DB6AC',
      '--hour-hand': '#B2DFDB',
      '--minute-hand': '#4DB6AC',
      '--second-hand': '#00BFA5',
      '--tick-mark': '#1A4A40',
      '--hour-tick': '#80CBC4',
      '--number': '#A7FFEB',
      '--tab-background': '#051210',
      '--tab-selected': '#0A1E1A',
      '--button-background': '#1A4A40',
      '--button-hover': '#2A5A50',
      '--button-foreground': '#B2DFDB',
      '--border': '#1A4A40',
      '--alarm-enabled': '#00BFA5',
      '--alarm-disabled': '#1A4A40',
      '--danger': '#00897B',
      '--digital-text': '#4DB6AC',
      '--center-dot': '#00BFA5',
      '--active-btn': '#4DB6AC',
      '--active-btn-fg': '#051210',
      '--seg-dim': '#0A1E18'
    }
  },
  CyberTheme: {
    label: '사이버',
    vars: {
      '--window-background': '#0D0221',
      '--panel-background': '#1A0533',
      '--foreground': '#E8D5FF',
      '--subtle-foreground': '#A78BFA',
      '--accent': '#00F5FF',
      '--clock-face': '#080118',
      '--clock-border': '#00F5FF',
      '--hour-hand': '#E8D5FF',
      '--minute-hand': '#00F5FF',
      '--second-hand': '#FF2D95',
      '--tick-mark': '#3B1F6E',
      '--hour-tick': '#C4B5FD',
      '--number': '#DDD6FE',
      '--tab-background': '#050110',
      '--tab-selected': '#0D0221',
      '--button-background': '#2D1B69',
      '--button-hover': '#4C2A9A',
      '--button-foreground': '#E8D5FF',
      '--border': '#3B1F6E',
      '--alarm-enabled': '#00F5FF',
      '--alarm-disabled': '#2D1B69',
      '--danger': '#FF2D95',
      '--digital-text': '#00F5FF',
      '--center-dot': '#FF2D95',
      '--active-btn': '#00F5FF',
      '--active-btn-fg': '#0D0221',
      '--seg-dim': '#120428'
    }
  },
  ForestTheme: {
    label: '포레스트',
    vars: {
      '--window-background': '#0F1A0F',
      '--panel-background': '#1A2E1A',
      '--foreground': '#D4E8C8',
      '--subtle-foreground': '#8FAF7E',
      '--accent': '#7CB342',
      '--clock-face': '#081008',
      '--clock-border': '#7CB342',
      '--hour-hand': '#D4E8C8',
      '--minute-hand': '#A5D66A',
      '--second-hand': '#FFAB40',
      '--tick-mark': '#2A4028',
      '--hour-tick': '#A5D66A',
      '--number': '#B8D4A8',
      '--tab-background': '#060C06',
      '--tab-selected': '#0F1A0F',
      '--button-background': '#2A4028',
      '--button-hover': '#3D5C38',
      '--button-foreground': '#D4E8C8',
      '--border': '#2A4028',
      '--alarm-enabled': '#7CB342',
      '--alarm-disabled': '#2A4028',
      '--danger': '#E57373',
      '--digital-text': '#A5D66A',
      '--center-dot': '#FFAB40',
      '--active-btn': '#7CB342',
      '--active-btn-fg': '#0F1A0F',
      '--seg-dim': '#0C180C'
    }
  },
  SakuraTheme: {
    label: '사쿠라',
    vars: {
      '--window-background': '#1F1218',
      '--panel-background': '#2E1A24',
      '--foreground': '#FFE4EC',
      '--subtle-foreground': '#D4A0B0',
      '--accent': '#FF8FAB',
      '--clock-face': '#140A10',
      '--clock-border': '#FF8FAB',
      '--hour-hand': '#FFE4EC',
      '--minute-hand': '#FFB3C6',
      '--second-hand': '#FF6B9D',
      '--tick-mark': '#4A2838',
      '--hour-tick': '#FFB3C6',
      '--number': '#FFD6E0',
      '--tab-background': '#10080C',
      '--tab-selected': '#1F1218',
      '--button-background': '#4A2838',
      '--button-hover': '#6A3850',
      '--button-foreground': '#FFE4EC',
      '--border': '#4A2838',
      '--alarm-enabled': '#FF8FAB',
      '--alarm-disabled': '#4A2838',
      '--danger': '#FF6B9D',
      '--digital-text': '#FFB3C6',
      '--center-dot': '#FF6B9D',
      '--active-btn': '#FF8FAB',
      '--active-btn-fg': '#1F1218',
      '--seg-dim': '#180C14'
    }
  },
  GoldTheme: {
    label: '골드',
    vars: {
      '--window-background': '#1A1408',
      '--panel-background': '#2E2410',
      '--foreground': '#F5E6C8',
      '--subtle-foreground': '#C4A86A',
      '--accent': '#D4AF37',
      '--clock-face': '#100C04',
      '--clock-border': '#D4AF37',
      '--hour-hand': '#F5E6C8',
      '--minute-hand': '#F0C040',
      '--second-hand': '#E8A030',
      '--tick-mark': '#4A3C18',
      '--hour-tick': '#E8C878',
      '--number': '#E8D090',
      '--tab-background': '#0C0804',
      '--tab-selected': '#1A1408',
      '--button-background': '#4A3C18',
      '--button-hover': '#6A5828',
      '--button-foreground': '#F5E6C8',
      '--border': '#4A3C18',
      '--alarm-enabled': '#D4AF37',
      '--alarm-disabled': '#4A3C18',
      '--danger': '#C45C2A',
      '--digital-text': '#F0C040',
      '--center-dot': '#E8A030',
      '--active-btn': '#D4AF37',
      '--active-btn-fg': '#1A1408',
      '--seg-dim': '#140E06'
    }
  },
  SlateTheme: {
    label: '슬레이트',
    vars: {
      '--window-background': '#1A1D23',
      '--panel-background': '#2A2F38',
      '--foreground': '#E2E8F0',
      '--subtle-foreground': '#94A3B8',
      '--accent': '#94A3B8',
      '--clock-face': '#12151A',
      '--clock-border': '#94A3B8',
      '--hour-hand': '#E2E8F0',
      '--minute-hand': '#CBD5E1',
      '--second-hand': '#F87171',
      '--tick-mark': '#3D4450',
      '--hour-tick': '#CBD5E1',
      '--number': '#CBD5E1',
      '--tab-background': '#0E1014',
      '--tab-selected': '#1A1D23',
      '--button-background': '#3D4450',
      '--button-hover': '#525C6E',
      '--button-foreground': '#E2E8F0',
      '--border': '#3D4450',
      '--alarm-enabled': '#86EFAC',
      '--alarm-disabled': '#3D4450',
      '--danger': '#F87171',
      '--digital-text': '#CBD5E1',
      '--center-dot': '#F87171',
      '--active-btn': '#94A3B8',
      '--active-btn-fg': '#1A1D23',
      '--seg-dim': '#161A22'
    }
  },
  LavenderTheme: {
    label: '라벤더',
    vars: {
      '--window-background': '#1A1528',
      '--panel-background': '#2A2240',
      '--foreground': '#EDE9FE',
      '--subtle-foreground': '#A78BFA',
      '--accent': '#B794F6',
      '--clock-face': '#100C1C',
      '--clock-border': '#B794F6',
      '--hour-hand': '#EDE9FE',
      '--minute-hand': '#C4B5FD',
      '--second-hand': '#F0ABFC',
      '--tick-mark': '#3D3260',
      '--hour-tick': '#C4B5FD',
      '--number': '#DDD6FE',
      '--tab-background': '#0C0814',
      '--tab-selected': '#1A1528',
      '--button-background': '#3D3260',
      '--button-hover': '#524880',
      '--button-foreground': '#EDE9FE',
      '--border': '#3D3260',
      '--alarm-enabled': '#B794F6',
      '--alarm-disabled': '#3D3260',
      '--danger': '#F0ABFC',
      '--digital-text': '#C4B5FD',
      '--center-dot': '#F0ABFC',
      '--active-btn': '#B794F6',
      '--active-btn-fg': '#1A1528',
      '--seg-dim': '#141020'
    }
  }
};

const XAML_THEME_NAMES = ["DarkTheme","LightTheme","BlueTheme","OceanTheme","RedTheme","GreenTheme","PurpleTheme","AmberTheme","RoseTheme","MonoTheme","SunsetTheme","MintTheme","CyberTheme","ForestTheme","SakuraTheme","GoldTheme","SlateTheme","LavenderTheme"];

// ── 색 섞기 ─────────────────────────────────────────────────────────────
//
// 아래 테마들과 사용자 정의 테마는 손으로 30개 색을 고르지 않는다.
// 바탕·강조·초침 세 색만 정하고 나머지는 섞어서 만든다. 그래야 테마마다
// 톤이 어긋나지 않고, 사용자가 고른 색으로도 같은 규칙의 테마가 나온다.

const CUSTOM_THEME = 'CustomTheme';

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function toRgb(hex) {
  const text = String(hex).replace('#', '');
  const full = text.length === 3 ? text.replace(/./g, (c) => c + c) : text;
  return {
    r: parseInt(full.slice(0, 2), 16) || 0,
    g: parseInt(full.slice(2, 4), 16) || 0,
    b: parseInt(full.slice(4, 6), 16) || 0
  };
}

function toHex({ r, g, b }) {
  const part = (v) => clampByte(v).toString(16).padStart(2, '0').toUpperCase();
  return `#${part(r)}${part(g)}${part(b)}`;
}

/** t=0 이면 a, t=1 이면 b. */
function mix(a, b, t) {
  const x = toRgb(a);
  const y = toRgb(b);
  return toHex({
    r: x.r + (y.r - x.r) * t,
    g: x.g + (y.g - x.g) * t,
    b: x.b + (y.b - x.b) * t
  });
}

const shade = (hex, t) => mix(hex, '#000000', t);
const tint = (hex, t) => mix(hex, '#FFFFFF', t);

/** 0(검정) ~ 1(흰색). 밝은 색 위에는 어두운 글자를 올리려고 쓴다. */
function luminance(hex) {
  const { r, g, b } = toRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function readableOn(hex) {
  return luminance(hex) > 0.55 ? '#14161C' : '#FFFFFF';
}

/**
 * 바탕 위에 글자·바늘로 올려도 읽히도록 색을 조인다.
 * 네온 민트 같은 밝은 강조색은 흰 바탕에서 거의 보이지 않으므로, 밝기 차이가
 * 모자라면 밝은 테마에서는 어둡게, 어두운 테마에서는 밝게 당긴다.
 * 차이가 이미 넉넉하면(어두운 테마 대부분) 고른 색 그대로 둔다.
 */
function readableInk(color, background, light) {
  // 밝은 바탕에 올리는 색은 더 넉넉한 차이가 필요하다. 어두운 바탕에서는 색이
  // 선명해 보이므로 기준을 낮춰, 고른 색을 되도록 그대로 쓴다.
  // 손으로 고른 라이트 테마(--accent #1E66F5, 밝기 0.33)만큼은 진해야 흰 바탕에서
  // 가는 획이 읽힌다. 어두운 바탕에서는 색이 선명해 보이므로 기준을 낮춘다.
  const need = light === true ? 0.45 : 0.25;
  const target = luminance(background);
  let ink = color;
  for (let i = 0; i < 12 && Math.abs(luminance(ink) - target) < need; i++) {
    ink = light === true ? shade(ink, 0.12) : tint(ink, 0.12);
  }
  return ink;
}

/** 색상환을 돌려 강조색과 구분되는 초침 색을 얻는다. */
function hueShift(hex, degrees) {
  const { r, g, b } = toRgb(hex);
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));

  let h = 0;
  if (d !== 0) {
    const rn = r / 255;
    const gn = g / 255;
    const bn = b / 255;
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
  }
  h = (((h + degrees) % 360) + 360) % 360;

  // 초침은 눈에 띄어야 하니 채도·밝기에 하한을 둔다.
  const sat = Math.max(0.55, s);
  const light = Math.min(0.72, Math.max(0.55, l));
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = light - c / 2;
  const table = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x]
  ][Math.floor(h / 60) % 6];
  return toHex({ r: (table[0] + m) * 255, g: (table[1] + m) * 255, b: (table[2] + m) * 255 });
}

/**
 * 팔레트에서 테마 하나를 만든다.
 * spec: { base 창 바탕, accent 강조, second 초침(생략 시 보색), light 밝은 바탕, fg 글자색 }
 */
function buildTheme(label, spec) {
  const light = spec.light === true;
  const base = spec.base;
  const accent = spec.accent;
  const fg = spec.fg || (light ? mix('#2B2F3A', accent, 0.18) : mix('#F2F4FA', accent, 0.12));
  const second = spec.second || hueShift(accent, 150);
  const lift = (t) => (light ? shade(base, t) : tint(base, t));
  const face = light ? tint(base, 0.8) : shade(base, 0.4);

  // 네온 민트 같은 밝은 색은 흰 바탕·흰 문자판 위에서 보이지 않는다.
  // 창 바탕 위(글자)와 문자판 위(바늘)에 쓸 색을 각각 읽히게 조인다.
  const accentInk = readableInk(accent, base, light);
  const faceInk = readableInk(accent, face, light);
  const secondInk = readableInk(second, face, light);

  return {
    label,
    vars: {
      '--window-background': base,
      '--panel-background': lift(0.08),
      '--foreground': fg,
      '--subtle-foreground': mix(fg, base, 0.38),
      '--accent': accentInk,
      '--clock-face': face,
      '--clock-border': faceInk,
      '--hour-hand': fg,
      '--minute-hand': faceInk,
      '--second-hand': secondInk,
      '--tick-mark': lift(0.22),
      '--hour-tick': mix(fg, base, 0.12),
      '--number': mix(fg, base, 0.18),
      '--tab-background': shade(base, light ? 0.05 : 0.35),
      '--tab-selected': base,
      '--button-background': lift(0.16),
      '--button-hover': lift(0.26),
      '--button-foreground': fg,
      '--border': lift(0.2),
      '--alarm-enabled': spec.enabled || (light ? '#2F9E44' : '#A6E3A1'),
      '--alarm-disabled': lift(0.2),
      '--danger': light ? shade(secondInk, 0.1) : secondInk,
      // 디지털 숫자는 창 바탕(투명 창에서는 호버 배경) 위에 놓인다.
      '--digital-text': spec.digital || accentInk,
      '--center-dot': secondInk,
      '--active-btn': accentInk,
      '--active-btn-fg': readableOn(accentInk),
      '--seg-dim': mix(base, accentInk, light ? 0.12 : 0.18)
    }
  };
}

// ── 팔레트로 만든 추가 테마 ─────────────────────────────────────────────
// (위쪽 THEMES 블록은 WPF 판 xaml 에서 변환한 것이고, 여기부터는 이 앱에서 더한 것)

const PALETTE_THEMES = {
  TealTheme: buildTheme('티얼', { base: '#0F1F1E', accent: '#2DD4BF' }),
  IndigoTheme: buildTheme('인디고', { base: '#141A33', accent: '#818CF8' }),
  CoralTheme: buildTheme('코랄', { base: '#241519', accent: '#FF7A6B' }),
  LimeTheme: buildTheme('라임', { base: '#14200F', accent: '#A3E635' }),
  BronzeTheme: buildTheme('브론즈', { base: '#201711', accent: '#D9A06B' }),
  NordTheme: buildTheme('노르드', { base: '#2E3440', accent: '#88C0D0', second: '#BF616A', fg: '#ECEFF4' }),
  DraculaTheme: buildTheme('드라큘라', { base: '#282A36', accent: '#BD93F9', second: '#FF79C6', fg: '#F8F8F2' }),
  SolarizedTheme: buildTheme('솔라라이즈', { base: '#002B36', accent: '#B58900', second: '#DC322F', fg: '#EEE8D5' }),
  SepiaTheme: buildTheme('세피아', { base: '#F4ECD8', accent: '#A1662F', light: true }),
  IceTheme: buildTheme('아이스', { base: '#EAF4FB', accent: '#0A7EA4', light: true }),
  SkyTheme: buildTheme('스카이', { base: '#E8F1FF', accent: '#2563EB', light: true }),
  MatchaTheme: buildTheme('말차', { base: '#EDF3E6', accent: '#4F7942', light: true })
};

const PALETTE_THEME_NAMES = Object.keys(PALETTE_THEMES);
Object.assign(THEMES, PALETTE_THEMES);

// ── 어두운 판 / 밝은 판 ─────────────────────────────────────────────────
//
// 테마는 "색 한 가지"마다 어두운 판과 밝은 판을 짝으로 갖는다. 그래야 설정에서
// 바탕 밝기를 바꿔도 고른 색을 그대로 쓸 수 있고, 두 쪽 수가 늘 같다.
// 손으로 고른 쪽(위 THEMES/PALETTE_THEMES)은 그대로 두고, 없는 쪽만 만들어 채운다.

/** 강조색에 맞춘 바탕색 — 사용자 정의 테마와 같은 규칙. */
function autoBase(accent, light) {
  return light === true
    ? tint(mix('#FFFFFF', accent, 0.1), 0.2)
    : shade(mix('#15151F', accent, 0.14), 0.05);
}

/** 어떤 테마의 반대쪽 판을 만든다 (색은 그대로, 바탕만 뒤집는다). */
function twinTheme(theme, label, light) {
  const accent = theme.vars['--accent'];
  return buildTheme(label, {
    base: autoBase(accent, light),
    accent,
    second: theme.vars['--second-hand'],
    light
  });
}

const THEME_FAMILY_SPECS = [
  // 다크 / 라이트는 둘 다 WPF 판에서 손으로 고른 색이다.
  { label: '기본', dark: 'DarkTheme', light: 'LightTheme' },
  { label: '미드나이트', dark: 'BlueTheme' },
  { label: '오션', dark: 'OceanTheme' },
  { label: '루비', dark: 'RedTheme' },
  { label: '에메랄드', dark: 'GreenTheme' },
  { label: '퍼플', dark: 'PurpleTheme' },
  { label: '앰버', dark: 'AmberTheme' },
  { label: '로즈', dark: 'RoseTheme' },
  { label: '모노', dark: 'MonoTheme' },
  { label: '선셋', dark: 'SunsetTheme' },
  { label: '민트', dark: 'MintTheme' },
  { label: '사이버', dark: 'CyberTheme' },
  { label: '포레스트', dark: 'ForestTheme' },
  { label: '사쿠라', dark: 'SakuraTheme' },
  { label: '골드', dark: 'GoldTheme' },
  { label: '슬레이트', dark: 'SlateTheme' },
  { label: '라벤더', dark: 'LavenderTheme' },
  { label: '티얼', dark: 'TealTheme' },
  { label: '인디고', dark: 'IndigoTheme' },
  { label: '코랄', dark: 'CoralTheme' },
  { label: '라임', dark: 'LimeTheme' },
  { label: '브론즈', dark: 'BronzeTheme' },
  { label: '노르드', dark: 'NordTheme' },
  { label: '드라큘라', dark: 'DraculaTheme' },
  { label: '솔라라이즈', dark: 'SolarizedTheme' },
  { label: '세피아', light: 'SepiaTheme' },
  { label: '아이스', light: 'IceTheme' },
  { label: '스카이', light: 'SkyTheme' },
  { label: '말차', light: 'MatchaTheme' }
];

const THEME_FAMILIES = THEME_FAMILY_SPECS.map((spec) => {
  const family = { label: spec.label, dark: spec.dark, light: spec.light };

  if (!family.light) {
    family.light = `${family.dark.replace(/Theme$/, '')}LightTheme`;
    THEMES[family.light] = twinTheme(THEMES[family.dark], spec.label, true);
  }
  if (!family.dark) {
    family.dark = `${family.light.replace(/Theme$/, '')}DarkTheme`;
    THEMES[family.dark] = twinTheme(THEMES[family.light], spec.label, false);
  }
  return family;
});

const DARK_THEME_NAMES = THEME_FAMILIES.map((family) => family.dark);
const LIGHT_THEME_NAMES = THEME_FAMILIES.map((family) => family.light);

/** 테마 이름 → 그 색이 속한 짝. 모르는 이름이면 null. */
function themeFamilyOf(name) {
  return THEME_FAMILIES.find((family) => family.dark === name || family.light === name) || null;
}

/** 밝은 바탕 테마인가. 사용자 색은 지금 등록된 것으로 판단한다. */
function isLightTheme(name) {
  const family = themeFamilyOf(name);
  if (family) return family.light === name;
  const theme = THEMES[name];
  return !!theme && luminance(theme.vars['--window-background']) > 0.5;
}

/** 같은 색의 반대쪽 판 이름. 짝이 없으면 (사용자 색 등) 그대로 돌려준다. */
function themeVariant(name, light) {
  const family = themeFamilyOf(name);
  if (!family) return name;
  return light === true ? family.light : family.dark;
}

// ── 사용자 정의 테마 ────────────────────────────────────────────────────
//
// 고른 색 하나로 테마 전체를 만든다. 색이 바뀔 때마다 등록표를 갈아 끼우므로
// 창마다 applyTheme 앞에서 setCustomTheme 을 한 번 불러 주어야 한다.

const DEFAULT_CUSTOM_COLOR = '#89B4FA';

function customThemeFrom(color, light) {
  const accent = /^#[0-9a-f]{6}$/i.test(String(color || '')) ? String(color).toUpperCase() : DEFAULT_CUSTOM_COLOR;
  const base = light === true ? tint(mix('#FFFFFF', accent, 0.1), 0.2) : shade(mix('#15151F', accent, 0.14), 0.05);
  return buildTheme('사용자 색', { base, accent, light: light === true });
}

/** 사용자 정의 테마를 다시 만들어 등록한다. 지금 쓰는 테마면 바로 적용한다. */
function setCustomTheme(color, light, root) {
  THEMES[CUSTOM_THEME] = customThemeFrom(color, light);
  const target = root || (typeof document !== 'undefined' ? document.documentElement : null);
  if (target && target.dataset && target.dataset.theme === CUSTOM_THEME) applyTheme(CUSTOM_THEME, target);
  return THEMES[CUSTOM_THEME];
}

THEMES[CUSTOM_THEME] = customThemeFrom(DEFAULT_CUSTOM_COLOR, false);

// 어두운 판과 밝은 판을 같은 수로 늘어놓고, 마지막에 사용자 색을 둔다.
const THEME_NAMES = [...DARK_THEME_NAMES, ...LIGHT_THEME_NAMES, CUSTOM_THEME];

/** 테마의 CSS 변수를 문서 루트에 적용한다. */
function applyTheme(name, root = document.documentElement) {
  const theme = THEMES[name] || THEMES.DarkTheme;
  for (const [key, value] of Object.entries(theme.vars)) root.style.setProperty(key, value);
  root.dataset.theme = THEMES[name] ? name : 'DarkTheme';
  return theme;
}

if (typeof module !== 'undefined') {
  module.exports = {
    THEMES,
    THEME_NAMES,
    THEME_FAMILIES,
    DARK_THEME_NAMES,
    LIGHT_THEME_NAMES,
    XAML_THEME_NAMES,
    PALETTE_THEME_NAMES,
    CUSTOM_THEME,
    DEFAULT_CUSTOM_COLOR,
    applyTheme,
    themeFamilyOf,
    isLightTheme,
    themeVariant,
    buildTheme,
    customThemeFrom,
    setCustomTheme,
    mix,
    shade,
    tint,
    luminance,
    hueShift,
    readableOn
  };
}
