'use strict';

/** 프로그램 정보 창 — 아이콘·버전·빌드 정보·제작자. */

const api = window.myclock;
const $ = (id) => document.getElementById(id);

function row(list, name, value) {
  if (!value) return;
  const dt = document.createElement('dt');
  dt.textContent = name;
  const dd = document.createElement('dd');
  dd.textContent = value;
  list.append(dt, dd);
}

function formatBuildDate(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad2 = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function render(info) {
  $('aboutName').textContent = info.name;
  $('aboutVersion').textContent = `버전 ${info.version}`;

  // 아이콘은 앱이 쓰는 그림 그대로 (asset/icon.svg) — 메인 프로세스가 읽어 보내 준다.
  if (info.iconSvg) $('aboutIcon').innerHTML = info.iconSvg;

  const build = $('aboutBuild');
  build.innerHTML = '';
  row(build, '빌드', info.packaged ? '설치본' : '개발 실행');
  row(build, '빌드 시각', formatBuildDate(info.buildDate));
  row(build, 'Electron', info.electron);
  row(build, 'Chromium', info.chrome);
  row(build, 'Node.js', info.node);
  row(build, '플랫폼', info.platform);

  $('aboutAuthor').textContent = info.author;
  $('aboutLicense').textContent = info.license;

  const mail = $('aboutEmail');
  mail.textContent = info.email;
  mail.addEventListener('click', (event) => {
    event.preventDefault();
    api.app.openExternal(`mailto:${info.email}`);
  });

  $('aboutCopyright').textContent = `© ${new Date().getFullYear()} ${info.author}. All rights reserved.`;
}

async function init() {
  const settings = await api.settings.load();
  setCustomTheme(settings.customThemeColor, settings.customThemeLight);
  applyTheme(settings.theme);

  render(await api.app.info());

  $('aboutCloseBtn').addEventListener('click', () => api.window.closeSelf());
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' || event.key === 'Enter') api.window.closeSelf();
  });
}

init();
