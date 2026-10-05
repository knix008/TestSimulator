'use strict';
/**
 * One-off: convert MyClockWinV10/Themes/*.xaml into src/js/data/themes.js CSS variables.
 *
 * 주의: themes.js 에는 이 변환본 뒤로 손으로 더한 부분(buildTheme 팔레트 테마,
 * CustomTheme, 색 섞기 helper)이 있다. 이 스크립트를 다시 돌리면 그 부분이 지워진다.
 * 다시 돌릴 일이 있으면 기존 파일의 "색 섞기" 주석 아래쪽을 따로 떼어 두고 붙여야 한다.
 */
const fs = require('fs');
const path = require('path');

const LABELS = {
  DarkTheme: '다크', LightTheme: '라이트', BlueTheme: '미드나이트', OceanTheme: '오션',
  RedTheme: '루비', GreenTheme: '에메랄드', PurpleTheme: '퍼플', AmberTheme: '앰버',
  RoseTheme: '로즈', MonoTheme: '모노', SunsetTheme: '선셋', MintTheme: '민트',
  CyberTheme: '사이버', ForestTheme: '포레스트', SakuraTheme: '사쿠라', GoldTheme: '골드',
  SlateTheme: '슬레이트', LavenderTheme: '라벤더'
};
const ORDER = Object.keys(LABELS);

function cssVar(brushKey) {
  // WindowBackgroundBrush → --window-background
  return '--' + brushKey.replace(/Brush$/, '').replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

const dir = path.join(__dirname, '..', '..', 'MyClockWinV10', 'Themes');
const themes = {};
for (const name of ORDER) {
  const xml = fs.readFileSync(path.join(dir, `${name}.xaml`), 'utf8');
  const re = /x:Key="([A-Za-z]+)"\s+Color="(#[0-9A-Fa-f]{6,8})"/g;
  const vars = {};
  let m;
  while ((m = re.exec(xml)) !== null) vars[cssVar(m[1])] = m[2].toUpperCase();
  themes[name] = vars;
}

const entries = ORDER.map((name) => {
  const vars = Object.entries(themes[name])
    .map(([k, v]) => `      '${k}': '${v}'`)
    .join(',\n');
  return `  ${name}: {\n    label: '${LABELS[name]}',\n    vars: {\n${vars}\n    }\n  }`;
}).join(',\n');

const out = `'use strict';

/**
 * 18가지 색상 테마 — MyClockWinV10/Themes/*.xaml 에서 변환.
 * 각 브러시 키는 동일한 의미의 CSS 커스텀 속성으로 매핑된다.
 */
const THEMES = {
${entries}
};

const THEME_NAMES = ${JSON.stringify(ORDER)};

/** 테마의 CSS 변수를 문서 루트에 적용한다. */
function applyTheme(name, root = document.documentElement) {
  const theme = THEMES[name] || THEMES.DarkTheme;
  for (const [key, value] of Object.entries(theme.vars)) root.style.setProperty(key, value);
  root.dataset.theme = THEMES[name] ? name : 'DarkTheme';
  return theme;
}

if (typeof module !== 'undefined') module.exports = { THEMES, THEME_NAMES, applyTheme };
`;

fs.writeFileSync(path.join(__dirname, '..', 'src', 'js', 'data', 'themes.js'), out, 'utf8');
console.log(`wrote src/js/data/themes.js — ${ORDER.length} themes`);
