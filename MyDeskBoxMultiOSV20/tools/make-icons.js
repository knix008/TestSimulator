'use strict';

// assets 디렉터리의 그림을 모두 새로 만든다.
//   node tools/make-icons.js

const fs = require('fs');
const path = require('path');
const { canvas } = require('./lib/draw');
const { encodePng } = require('./lib/png');
const { encodeIco, encodeIcns } = require('./lib/ico');
const { icons, swatch, level, themeChip, cornerChip } = require('./icons');
const { THEMES, OPACITIES, CORNERS } = require('../src/main/themes');

const ASSETS = path.join(__dirname, '..', 'assets');
const MENU = path.join(ASSETS, 'menu');


function render(paint, size) {
  const c = canvas(size);
  paint(c);
  return encodePng(c.rgba, size, size);
}

function write(file, buffer) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buffer);
  return `${path.relative(path.join(__dirname, '..'), file).replace(/\\/g, '/')} (${buffer.length}B)`;
}

function main() {
  fs.rmSync(ASSETS, { recursive: true, force: true });
  const made = [];

  // 앱 아이콘: 여러 크기를 ico / icns / png 로
  const appSizes = [16, 24, 32, 48, 64, 128, 256, 512];
  const appPngs = appSizes.map((size) => ({ size, png: render(icons.app, size) }));
  made.push(write(path.join(ASSETS, 'icon.png'), appPngs.find((e) => e.size === 256).png));
  made.push(write(path.join(ASSETS, 'icon.ico'), encodeIco(appPngs.filter((e) => e.size <= 256))));
  made.push(write(path.join(ASSETS, 'icon.icns'), encodeIcns(appPngs)));

  // 트레이: 기본과 고해상도
  made.push(write(path.join(ASSETS, 'tray.png'), render(icons.tray, 16)));
  made.push(write(path.join(ASSETS, 'tray@2x.png'), render(icons.tray, 32)));

  // 메뉴 그림. 16 과 32 를 함께 두어 배율이 높은 화면에서도 또렷하다.
  const menuNames = Object.keys(icons).filter((name) => name !== 'app' && name !== 'tray');
  for (const name of menuNames) {
    made.push(write(path.join(MENU, `${name}.png`), render(icons[name], 16)));
    made.push(write(path.join(MENU, `${name}@2x.png`), render(icons[name], 32)));
  }

  for (const theme of THEMES) {
    const key = `theme-${theme.id}`;
    made.push(write(path.join(MENU, `${key}.png`), render(themeChip(theme), 16)));
    made.push(write(path.join(MENU, `${key}@2x.png`), render(themeChip(theme), 32)));
    // 색 하나만 보여 주는 조각도 함께 둔다.
    made.push(write(path.join(MENU, `color-${theme.id}.png`), render(swatch(theme.bg), 16)));
    made.push(write(path.join(MENU, `color-${theme.id}@2x.png`), render(swatch(theme.bg), 32)));
  }

  for (const corner of CORNERS) {
    // 16px 그림에서의 둥근 정도로 바꿔 둔다.
    const radius = Math.min(0.28, corner.radius / 64);
    const key = `corner-${corner.id}`;
    made.push(write(path.join(MENU, `${key}.png`), render(cornerChip(radius), 16)));
    made.push(write(path.join(MENU, `${key}@2x.png`), render(cornerChip(radius), 32)));
  }

  for (const value of OPACITIES) {
    const key = `opacity-${Math.round(value * 100)}`;
    made.push(write(path.join(MENU, `${key}.png`), render(level(value), 16)));
    made.push(write(path.join(MENU, `${key}@2x.png`), render(level(value), 32)));
  }

  console.log(made.join('\n'));
  console.log(`\n${made.length}개 파일을 만들었습니다.`);
}

main();
