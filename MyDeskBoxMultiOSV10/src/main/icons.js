'use strict';

// assets 디렉터리의 그림을 읽어 준다. 같은 그림을 여러 번 읽지 않는다.
// 파일은 tools/make-icons.js 로 다시 만들 수 있다.

const path = require('path');
const { nativeImage } = require('electron');
const themes = require('./themes');
const i18n = require('../shared/i18n');

const ROOT = path.join(__dirname, '..', '..', 'assets');
const cache = new Map();

function load(...parts) {
  const key = parts.join('/');
  if (cache.has(key)) return cache.get(key);
  let image;
  try {
    // 배율이 높은 화면에서는 같은 이름의 @2x 파일을 함께 쓴다.
    image = nativeImage.createFromPath(path.join(ROOT, ...parts));
  } catch (_err) {
    image = nativeImage.createEmpty();
  }
  cache.set(key, image);
  return image;
}

function menu(name) {
  return load('menu', `${name}.png`);
}

function themeChip(id) {
  return menu(`theme-${themes.themeOf(id).id}`);
}

function flag(lang) {
  return menu(`lang-${i18n.langOf(lang)}`);
}

function corner(value) {
  return menu(`corner-${themes.cornerName(value)}`);
}

function colorSwatch(id) {
  return menu(`color-${id}`);
}

function opacityLevel(value) {
  const near = themes.OPACITIES.reduce(
    (best, step) => (Math.abs(step - value) < Math.abs(best - value) ? step : best),
    themes.OPACITIES[0]
  );
  return menu(`opacity-${Math.round(near * 100)}`);
}

module.exports = {
  ROOT,
  load,
  menu,
  themeChip,
  corner,
  flag,
  colorSwatch,
  opacityLevel,
  tray: () => load('tray.png'),
  app: () => load('icon.png'),
  appIcoPath: () => path.join(ROOT, 'icon.ico'),
};
