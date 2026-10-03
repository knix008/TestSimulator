'use strict';

/**
 * 창과 코드의 연결 검사 — 창을 띄우지 않고 소스끼리 맞춰 본다.
 *
 * 렌더러 코드는 id 로 요소를 찾고 채널 이름으로 메인 프로세스와 말한다.
 * 한쪽만 고치면 그 기능이 조용히 죽는다 (오류도 안 난다). 그 어긋남을 잡는다.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { readSource, htmlIds, lookedUpIds } = require('./helpers/fakes');

const PAIRS = [
  ['src/js/panel.js', 'src/panel.html'],
  ['src/js/clock.js', 'src/index.html'],
  ['src/js/fullscreen.js', 'src/fullscreen.html'],
  ['src/js/alarm.js', 'src/alarm.html'],
  ['src/js/menu.js', 'src/menu.html']
];

test('코드가 찾는 요소가 창 문서에 모두 있다', () => {
  for (const [js, html] of PAIRS) {
    const have = htmlIds(html);
    for (const id of lookedUpIds(js)) {
      assert.ok(have.has(id), `${html} 에 #${id} 가 없다 (${js} 가 찾는다)`);
    }
  }
});

test('창 문서가 읽어 들이는 스크립트·스타일 파일이 실제로 있다', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.join(__dirname, '..');

  for (const [, html] of PAIRS) {
    const text = readSource(html);
    const refs = [
      ...[...text.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]),
      ...[...text.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((m) => m[1])
    ];
    assert.ok(refs.length > 0, `${html}: 읽어 들이는 파일이 없다`);
    for (const ref of refs) {
      const at = path.join(root, 'src', ref);
      assert.ok(fs.existsSync(at), `${html} 가 없는 파일을 읽는다: ${ref}`);
    }
  }
});

test('패널 탭 — 탭 단추와 탭 내용이 짝을 이룬다', () => {
  const html = readSource('src/panel.html');
  const tabs = [...html.matchAll(/class="tab" data-tab="([^"]+)"/g)].map((m) => m[1]);
  const pages = [...html.matchAll(/class="tab-page" data-page="([^"]+)"/g)].map((m) => m[1]);

  assert.deepEqual(tabs, ['world', 'alarm', 'timer', 'stopwatch', 'calendar', 'settings']);
  assert.deepEqual(tabs.slice().sort(), pages.slice().sort(), '단추와 내용이 어긋난다');
});

test('설정 패널은 설정만 맡고, 나머지는 저마다 창이다', () => {
  const panel = readSource('src/js/panel.js');
  const main = readSource('electron/main.js');
  const clock = readSource('src/js/clock.js');

  // 패널은 only=settings 로 뜬다.
  assert.match(main, /panel\.html'\), \{ query: \{ only: 'settings' \} \}/);
  // 분리한 기능 창은 tool=1 로 구분한다 (닫기 동작이 다르다).
  assert.match(main, /query: \{ only: tab, tool: '1' \}/);
  assert.match(panel, /const isToolWindow = params\.get\('tool'\) === '1'/);
  assert.match(panel, /selectTab\(onlyTab\)/, '창 하나가 한 가지만 보여 준다');

  // 시계 창 메뉴에서 기능 창들을 연다.
  for (const tab of ['world', 'alarm', 'timer', 'stopwatch', 'calendar']) {
    assert.ok(clock.includes(`api.tools.open('${tab}')`), `메뉴에 ${tab} 창을 여는 길이 없다`);
  }
  // 트레이 메뉴에도 같은 길이 있다.
  for (const tab of ['world', 'alarm', 'timer', 'stopwatch', 'calendar']) {
    assert.ok(main.includes(`openToolWindow('${tab}')`), `트레이 메뉴에 ${tab} 가 없다`);
  }
});

test('설정 단추와 컨텍스트 메뉴가 설정 패널을 연다', () => {
  const clock = readSource('src/js/clock.js');
  assert.match(clock, /settings: \(\) => openPanelTab\('settings'\)/, '메뉴의 설정이 설정 패널을 열지 않는다');
  assert.match(clock, /settingsBtn\.addEventListener\('click',[\s\S]{0,120}openPanelTab\('settings'\)/);
  // 이미 보고 있으면 닫는다.
  assert.match(clock, /if \(panelOpen && panelTab === tab\) api\.panel\.close\(\)/);
});

test('디지털 시계는 "도시 오전/오후 날짜"를 숫자 바로 위 한 줄에 둔다', () => {
  for (const file of ['src/index.html', 'src/zoneclock.html']) {
    const html = readSource(file);
    const header = /<div class="digital-header">([\s\S]*?)<\/div>/.exec(html);
    assert.ok(header, `${file}: 머리글 줄이 없다`);
    assert.ok(header[1].includes('id="amPmText"'), `${file}: 오전/오후가 머리글에 없다`);
    assert.ok(header[1].includes('id="headerDate"'), `${file}: 날짜가 머리글에 없다`);
    // 머리글은 디지털 패널 안에 있어야 한다 (아날로그에서는 함께 사라지도록).
    const panelStart = html.indexOf('id="digitalPanel"');
    const bodyStart = html.indexOf('class="digital-body"');
    assert.ok(panelStart < html.indexOf('class="digital-header"'), `${file}: 머리글이 디지털 패널 밖에 있다`);
    assert.ok(html.indexOf('class="digital-header"') < bodyStart, `${file}: 머리글이 숫자 아래에 있다`);
  }
  // 추가 시계는 도시 이름도 같은 줄에 둔다.
  const zone = readSource('src/zoneclock.html');
  const header = /<div class="digital-header">([\s\S]*?)<\/div>/.exec(zone);
  assert.ok(header[1].includes('id="cityName"'), '도시 이름이 머리글에 없다');
});

test('아날로그에서는 바깥에 오전/오후·날짜를 적지 않는다', () => {
  const clock = readSource('src/js/clock.js');
  const zone = readSource('src/js/zoneclock.js');
  const analog = readSource('src/js/analog-clock.js');

  // 문자판 안에 오전/오후·날짜·도시를 그린다.
  assert.match(analog, /function drawAmPmAndDate\(g, date, color, label\)/);
  assert.match(analog, /function drawAnalogClock\(canvas, date, style, colors, label\)/);
  // 추가 시계는 도시 이름을 문자판 안으로 넘긴다.
  assert.match(zone, /drawAnalogClock\(el\.analogCanvas, local, config\.analogStyle, analogColorsFrom\(\), label\)/);
  // 바깥 상태 줄에는 시각을 적지 않는다.
  assert.ok(!/el\.clockStatus\.textContent = status/.test(clock), '아날로그가 바깥에 시각을 적는다');
  assert.ok(!zone.includes('clockStatus'), '추가 시계에 바깥 글자 줄이 남아 있다');
});

test('아날로그 시계에는 호버 배경(사각형)을 깔지 않는다', () => {
  const clock = readSource('src/js/clock.js');
  const css = readSource('src/styles/clock.css');

  // 배경을 보이게 하는 모든 자리에 "디지털일 때만" 조건이 붙어 있어야 한다.
  const shows = [...clock.matchAll(/show\(el\.chromeBackground,([^)]*)\)/g)].map((m) => m[1].trim());
  assert.ok(shows.length >= 2, `chromeBackground 를 다루는 곳: ${shows.length}`);
  for (const arg of shows) {
    assert.match(arg, /settings\.isDigital/, `조건에 디지털 여부가 없다: show(el.chromeBackground, ${arg})`);
  }

  // 배경이 없는 아날로그에서는 글자가 바탕화면 위에 놓이므로 그림자를 넣는다.
  assert.match(clock, /classList\.toggle\('analog-mode'/);
  assert.match(css, /\.analog-mode .*\{[\s\S]*?text-shadow/);
});

test('디지털 호버 배경은 바탕화면이 비칠 만큼 옅다', () => {
  const css = readSource('src/styles/clock.css');
  const block = /\.chrome-background\s*\{([^}]*)\}/.exec(css);
  assert.ok(block, '.chrome-background 규칙이 없다');
  const opacity = /opacity:\s*([0-9.]+)/.exec(block[1]);
  assert.ok(opacity, '불투명도가 정해져 있지 않다');
  assert.ok(Number(opacity[1]) <= 0.5, `너무 짙다: ${opacity[1]}`);
});

test('설정 패널의 사용자 정의 테마 칸이 제자리에 있다', () => {
  const html = readSource('src/panel.html');
  const panel = readSource('src/js/panel.js');

  for (const id of ['themeGrid', 'themeBaseGroup', 'customThemeColor', 'customThemeColorValue']) {
    assert.ok(htmlIds('src/panel.html').has(id), `#${id} 가 없다`);
  }
  assert.ok(html.indexOf('id="themeBaseGroup"') < html.indexOf('id="themeGrid"'), '바탕 선택은 목록 위에 둔다');
  assert.ok(html.indexOf('id="themeGrid"') < html.indexOf('id="customThemeColor"'), '사용자 색은 목록 아래에 둔다');
  assert.match(html, /id="themeBaseGroup"[\s\S]{0,260}data-value="light"/, '밝은 바탕 단추가 없다');
  assert.match(panel, /useCustomTheme/, '색을 고쳤을 때 테마를 갈아 끼우는 코드가 없다');
  assert.match(panel, /patchSettings\(\{ \.\.\.next, theme: CUSTOM_THEME \}\)/);
  assert.match(panel, /function setThemeBase/, '어두운/밝은 판을 바꾸는 코드가 없다');
  assert.match(panel, /themeVariant\(target\.theme, light\)/, '같은 색의 반대쪽 판으로 바꿔야 한다');
});

test('모든 창이 테마를 적용하기 전에 사용자 정의 색을 등록한다', () => {
  for (const file of ['src/js/clock.js', 'src/js/panel.js', 'src/js/menu.js', 'src/js/fullscreen.js', 'src/js/alarm.js']) {
    const text = readSource(file);
    assert.match(text, /setCustomTheme\(/, `${file}: 사용자 정의 테마를 등록하지 않는다`);
    const firstSet = text.indexOf('setCustomTheme(');
    const firstApply = text.indexOf('applyTheme(');
    assert.ok(firstSet < firstApply, `${file}: 등록보다 적용이 먼저다`);
  }
});

test('창 문서가 필요한 스크립트를 모두 읽어 들인다', () => {
  // themes.js 를 쓰는 창은 반드시 그것을 먼저 읽어야 한다 (setCustomTheme/applyTheme).
  const needs = {
    'src/index.html': ['js/data/themes.js', 'js/data/styles.js', 'js/analog-clock.js', 'js/clock.js'],
    'src/panel.html': ['js/data/themes.js', 'js/data/cities.js', 'js/tones.js', 'js/panel.js'],
    'src/menu.html': ['js/data/themes.js', 'js/menu.js'],
    'src/fullscreen.html': ['js/data/themes.js', 'js/fullscreen.js'],
    'src/alarm.html': ['js/data/themes.js', 'js/tones.js', 'js/alarm.js']
  };
  for (const [html, scripts] of Object.entries(needs)) {
    const text = readSource(html);
    for (const script of scripts) {
      assert.ok(text.includes(`src="${script}"`), `${html} 가 ${script} 를 읽지 않는다`);
    }
  }
});

test('preload 가 여는 통로마다 메인 프로세스에 받는 쪽이 있다', () => {
  const preload = readSource('electron/preload.js');
  const main = readSource('electron/main.js');

  const invokes = [...preload.matchAll(/ipcRenderer\.invoke\('([^']+)'/g)].map((m) => m[1]);
  const sends = [...preload.matchAll(/ipcRenderer\.send\('([^']+)'/g)].map((m) => m[1]);
  const handles = [...main.matchAll(/ipcMain\.handle\('([^']+)'/g)].map((m) => m[1]);
  const listens = [...main.matchAll(/ipcMain\.on\('([^']+)'/g)].map((m) => m[1]);

  assert.ok(invokes.length >= 10 && sends.length >= 10, '통로가 너무 적다');
  for (const channel of invokes) assert.ok(handles.includes(channel), `ipcMain.handle('${channel}') 이 없다`);
  for (const channel of sends) assert.ok(listens.includes(channel), `ipcMain.on('${channel}') 이 없다`);

  // 반대 방향 — 메인이 보내 주는 알림을 preload 가 받아 둔다.
  const received = [...preload.matchAll(/ipcRenderer\.on\('([^']+)'/g)].map((m) => m[1]);
  const pushed = [...main.matchAll(/\.send\('([^']+)'/g)].map((m) => m[1]);
  for (const channel of received) {
    assert.ok(pushed.includes(channel), `메인이 '${channel}' 을 보내지 않는다`);
  }
});

test('패널이 어느 탭으로 열릴지 메인 프로세스가 적어 둔다', () => {
  const main = readSource('electron/main.js');
  const preload = readSource('electron/preload.js');
  assert.match(main, /panelPendingTab = tab \|\| null/, '열어 달라고 한 탭을 적어 두지 않는다');
  assert.match(main, /ipcMain\.handle\('panel:pending-tab'/);
  assert.match(main, /panelPendingTab = null;\s*\n\s*return tab;/, '한 번 읽으면 지워야 한다');
  assert.match(preload, /pendingTab: \(\) => ipcRenderer\.invoke\('panel:pending-tab'\)/);
  // 트레이 메뉴의 "설정..." 도 설정 탭을 지정해 연다.
  assert.match(main, /togglePanel\('settings'\)/);
});

test('렌더러가 쓰는 preload API 가 모두 열려 있다', () => {
  const preload = readSource('electron/preload.js');
  for (const file of ['src/js/clock.js', 'src/js/panel.js', 'src/js/menu.js', 'src/js/fullscreen.js', 'src/js/alarm.js']) {
    const text = readSource(file);
    const used = new Set([...text.matchAll(/\bapi\.([a-zA-Z]+)\.([a-zA-Z]+)\(/g)].map((m) => `${m[1]}.${m[2]}`));
    for (const call of used) {
      const [group, method] = call.split('.');
      const block = new RegExp(`${group}:\\s*\\{[\\s\\S]*?\\n\\s{2}\\}`, 'm').exec(preload);
      assert.ok(block, `preload 에 ${group} 묶음이 없다 (${file})`);
      assert.ok(
        new RegExp(`\\b${method}:`).test(block[0]),
        `preload ${group} 에 ${method} 가 없다 (${file} 에서 부른다)`
      );
    }
  }
});

test('추가 시계 창이 찾는 요소가 문서에 모두 있다', () => {
  const have = htmlIds('src/zoneclock.html');
  for (const id of lookedUpIds('src/js/zoneclock.js')) {
    assert.ok(have.has(id), `src/zoneclock.html 에 #${id} 가 없다`);
  }
  assert.ok(have.has('cityName'), '도시 이름을 넣을 자리가 있어야 한다');
});

test('추가 시계 창이 필요한 스크립트를 읽어 들인다', () => {
  const html = readSource('src/zoneclock.html');
  for (const script of [
    'js/data/themes.js',
    'js/data/styles.js',
    'js/zone-time.js',
    'js/digital-display.js',
    'js/analog-clock.js',
    'js/zoneclock.js'
  ]) {
    assert.ok(html.includes(`src="${script}"`), `zoneclock.html 이 ${script} 를 읽지 않는다`);
  }
  // 시계 창은 앱 상태를 갖지 않는다 — 알람·타이머 코드는 읽지 않는다.
  assert.ok(!html.includes('js/timers.js'), '추가 시계는 타이머를 들지 않는다');
  assert.ok(!html.includes('js/clock.js'), '메인 시계 컨트롤러를 두 번 읽지 않는다');
});

test('설정만 시계별이다 — 추가 시계는 공용 기능을 건드리지 않는다', () => {
  const zone = readSource('src/js/zoneclock.js');
  for (const shared of ['alarms:set', 'events:set', 'timer:command', 'stopwatch:command', 'settings:patch']) {
    assert.ok(!zone.includes(shared), `추가 시계가 공용 기능(${shared})을 건드린다`);
  }
  // 자기 설정은 clocks.update 로만 고친다.
  assert.match(zone, /api\.clocks\.update\(config\.id, patch\)/);
});

test('패널의 시계별 설정과 공용 설정이 갈라져 있다', () => {
  const panel = readSource('src/js/panel.js');
  assert.match(panel, /function targetSettings/, '고치는 대상을 고르는 코드가 없다');
  assert.match(panel, /api\.clocks\.update\(next\.id, full\)/, '시계 설정은 clocks.update 로 간다');
  // 알람·타이머·스톱워치·일정 명령은 늘 메인 시계 창으로 간다.
  for (const shared of ['alarms:set', 'events:set', 'timer:command', 'stopwatch:command']) {
    assert.ok(panel.includes(`type: '${shared}'`), `${shared} 명령이 없어졌다`);
  }
});

test('분리한 탭 창 통로가 열려 있다', () => {
  const preload = readSource('electron/preload.js');
  const main = readSource('electron/main.js');
  assert.match(preload, /tools: \{[\s\S]*?open: \(tab\) => ipcRenderer\.send\('tools:open', tab\)/);
  assert.match(main, /ipcMain\.on\('tools:open'/);
  assert.match(main, /only: tab/, '분리한 창은 panel.html?only=<탭> 으로 연다');
  // 분리한 창도 같은 상태 스냅샷을 받아야 한다.
  assert.match(main, /for \(const win of \[\.\.\.toolWins\.values\(\), \.\.\.clockSettingsWins\.values\(\)\]\)[\s\S]{0,160}from-clock/);
});

test('창마다 자기 창을 움직인다 (시계가 여럿이므로)', () => {
  const main = readSource('electron/main.js');
  assert.match(main, /function senderWindow/, '보낸 쪽 창을 찾는 코드가 없다');
  for (const channel of ['window:drag-start', 'window:resize-start', 'window:set-size', 'window:set-min-size']) {
    const handler = new RegExp(`ipcMain\\.on\\('${channel}'[\\s\\S]{0,200}senderWindow`);
    assert.match(main, handler, `${channel} 가 보낸 쪽 창을 쓰지 않는다`);
  }
  // 컨텍스트 메뉴 결과도 연 창으로 돌아가야 한다.
  assert.match(main, /menuOpener = e\.sender/);
});

test('메뉴에서 시계를 추가할 수 있다', () => {
  const clock = readSource('src/js/clock.js');
  const main = readSource('electron/main.js');

  // 시계 창 메뉴: "시계 추가..." → 도시 목록 메뉴 → 고른 도시로 시계 열기
  assert.match(clock, /id: 'newclock'[\s\S]{0,60}시계 추가/);
  assert.match(clock, /function openAddClockMenu/);
  assert.match(clock, /id: `addclock:\$\{index\}`/);
  assert.match(clock, /api\.clocks\.add\(city\)/);
  // 목록이 길면 세계 시간 창으로 넘긴다.
  assert.match(clock, /label: '다른 도시 찾기\.\.\.'/);

  // 트레이 메뉴에도 "시계 추가" 하위 메뉴가 있다.
  assert.match(main, /label: '시계 추가', submenu: addSubmenu/);
  assert.match(main, /click: \(\) => addExtraClock\(city\)/);
  // 열어 둔 시계가 있으면 닫는 메뉴도 함께 보여 준다.
  assert.match(main, /label: '시계 닫기'/);
  // 메뉴는 열 때마다 다시 만든다 (도시·시계 목록이 바뀌므로).
  assert.match(main, /tray\.on\('right-click', \(\) => tray\.popUpContextMenu\(buildTrayMenu\(\)\)\)/);
});

test('전체 화면 시계도 배경이 투명하다', () => {
  const main = readSource('electron/main.js');
  const css = readSource('src/styles/fullscreen.css');

  // 창 자체가 투명해야 바탕화면이 비친다.
  const block = /fullWin = new BrowserWindow\(\{([\s\S]*?)\}\);/.exec(main);
  assert.ok(block, '전체 화면 창을 만드는 곳을 찾지 못했다');
  assert.match(block[1], /transparent: true/, '전체 화면 창이 투명하지 않다');
  assert.match(block[1], /backgroundColor: '#00000000'/, '배경색이 칠해져 있다');

  // 문서도 바탕을 칠하지 않는다.
  const body = /html,\s*body \{([\s\S]*?)\}/.exec(css);
  assert.ok(body, 'fullscreen.css 의 body 규칙을 찾지 못했다');
  assert.ok(
    !/background:\s*var\(--window-background/.test(body[1]),
    '전체 화면 문서가 테마 바탕색으로 칠해져 있다'
  );
  // 투명 위에서도 읽히도록 글자에 그림자를 넣는다.
  assert.match(css, /\.full-stage \{[\s\S]*?text-shadow/);
});

test('정보 창이 열리는 길이 메뉴와 트레이에 있다', () => {
  const main = readSource('electron/main.js');
  const clock = readSource('src/js/clock.js');
  const preload = readSource('electron/preload.js');

  assert.match(main, /function openAboutWindow/);
  assert.match(main, /ipcMain\.handle\('app:info'/);
  assert.match(main, /ipcMain\.on\('about:open'/);
  assert.match(main, /label: '프로그램 정보\.\.\.', click: \(\) => openAboutWindow\(\)/, '트레이 메뉴에 없다');
  assert.match(clock, /id: 'about'/, '시계 메뉴에 없다');
  assert.match(clock, /about: \(\) => api\.app\.about\(\)/);
  assert.match(preload, /info: \(\) => ipcRenderer\.invoke\('app:info'\)/);
});

test('정보 창이 찾는 요소가 문서에 모두 있다', () => {
  const have = htmlIds('src/about.html');
  for (const id of lookedUpIds('src/js/about.js')) {
    assert.ok(have.has(id), `src/about.html 에 #${id} 가 없다`);
  }
});

test('제목 줄이 있는 창에는 모두 아이콘이 있다', () => {
  // 설정·기능 창 (panel.html 의 탭이 곧 제목 줄이다)
  const panel = readSource('src/panel.html');
  for (const tab of ['world', 'alarm', 'timer', 'stopwatch', 'calendar', 'settings']) {
    const re = new RegExp(`data-tab="${tab}"[^>]*><span class="tab-icon">[^<]+</span>`);
    assert.match(panel, re, `${tab} 탭 제목에 아이콘이 없다`);
  }
  // 정보 창
  assert.match(readSource('src/about.html'), /<span class="tab-icon">[^<]+<\/span>/);
  // 알람 팝업
  assert.match(readSource('src/alarm.html'), /id="alarmIcon"/);
});

test('아날로그에서는 12/24시간 선택을 끈다', () => {
  const panel = readSource('src/js/panel.js');
  assert.match(panel, /const formatUsed = target\.isDigital/);
  assert.match(panel, /button\.disabled = !formatUsed/);
  assert.match(panel, /if \(button\.disabled\) return/, '꺼진 단추를 눌러도 아무 일이 없어야 한다');
});

test('설정 창은 내용에 맞춰 크기를 잡고, 화면 밖으로 나가지 않는다', () => {
  const main = readSource('electron/main.js');
  const panel = readSource('src/js/panel.js');
  const css = readSource('src/styles/panel.css');

  // 기본 크기는 넉넉히 잡되, 내용이 더 크면 패널이 재서 알려 준다.
  const width = /const PANEL_WIDTH = (\d+);/.exec(main);
  assert.ok(width && Number(width[1]) >= 360, `설정 창 폭: ${width && width[1]}`);
  assert.match(panel, /function fitSettingsWindow/);
  assert.match(panel, /api\.panel\.fit\(wanted\)/);
  assert.match(main, /ipcMain\.on\('panel:fit'/);
  assert.match(main, /Math\.max\(PANEL_WIDTH, panelFit\?\.width \|\| 0\)/);

  // 패널 자리를 작업 영역 안으로 당긴다.
  assert.match(main, /function panelBoundsFor[\s\S]{0,700}return clampToWorkArea/);

  // 테마 칸 너비는 가장 긴 이름에 맞춰 잡는다 — 글자가 잘리지 않도록.
  assert.match(panel, /function fitThemeTiles/);
  assert.match(panel, /--theme-tile/);
  assert.match(css, /minmax\(var\(--theme-tile, 104px\), 1fr\)/);
  // 테마는 네 칸씩 — 창이 그만큼만 넓으면 된다.
  assert.match(panel, /const THEME_COLUMNS = 4/);
});

test('설정 창은 시계마다 하나씩, 나머지 창은 하나씩만 뜬다', () => {
  const main = readSource('electron/main.js');
  const panel = readSource('src/js/panel.js');

  // 시계 설정 창은 시계 id 로 구분해 하나씩만 연다.
  assert.match(main, /const clockSettingsWins = new Map\(\)/);
  assert.match(main, /function openClockSettings\(id\)[\s\S]{0,400}existing\.focus\(\)/);
  assert.match(main, /query: \{ only: 'settings', tool: '1', clock: id \}/);
  // 시계를 닫으면 그 설정 창도 닫는다.
  assert.match(main, /function removeExtraClock\(id\) \{\s*closeClockSettings\(id\)/);

  // 기능 창(알람·타이머·…)은 탭마다 하나뿐이다.
  assert.match(main, /function openToolWindow\(tab\)[\s\S]{0,300}existing\.focus\(\)/);
  // 정보 창도 하나뿐이다.
  assert.match(main, /function openAboutWindow\(\)[\s\S]{0,200}aboutWin\.focus\(\)/);

  // 설정 창 안에는 시계 고르개가 없다 — 창이 곧 그 시계의 것이다.
  assert.ok(!panel.includes("getElementById('clockTarget')"), '시계 고르개가 남아 있다');
  assert.match(panel, /let clockTarget = params\.get\('clock'\) \|\| 'main'/);
});

test('시스템 설정은 트레이에서 다룬다', () => {
  const main = readSource('electron/main.js');
  const html = readSource('src/panel.html');

  // 설정 창에서는 빠졌다.
  assert.ok(!html.includes('id="alwaysOnTop"'), '항상 위에 표시가 설정 창에 남아 있다');
  assert.ok(!html.includes('id="startWithSystem"'), '자동 실행이 설정 창에 남아 있다');
  assert.ok(!html.includes('id="resetBtn"'), '초기화가 설정 창에 남아 있다');
  assert.ok(!html.includes('data-sub="system"'), '시스템 갈래가 남아 있다');

  // 트레이에 있다 — 켜고 끄는 항목으로.
  assert.match(main, /label: '시스템 설정', submenu: systemItems/);
  assert.match(main, /label: '항상 위에 표시',\s*type: 'checkbox'/);
  assert.match(main, /label: '시작 시 자동 실행',\s*type: 'checkbox'/);
  assert.match(main, /label: '기본값으로 초기화\.\.\.'/);
  // 되돌릴 수 없으니 한 번 묻는다.
  assert.match(main, /function confirmReset[\s\S]{0,400}dialog\.showMessageBox/);
  // 초기화해도 추가한 시계는 남긴다.
  assert.match(main, /fresh\.extraClocks = current\.extraClocks/);
});

test('메인 시계도 도시를 가질 수 있다', () => {
  const clock = readSource('src/js/clock.js');
  const store = readSource('electron/store.js');
  const html = readSource('src/index.html');

  assert.match(store, /zone: typeof src\.zone === 'string' && src\.zone \? src\.zone : null/);
  assert.match(clock, /function clockNow/, '도시 시각을 쓰는 코드가 없다');
  assert.match(clock, /settings\.zone \? zonedDate\(now, settings\.zone\) : now/);
  assert.match(clock, /function cityLabel/);
  // 디지털은 머리글 줄에, 아날로그는 문자판 안에.
  assert.ok(html.includes('id="cityName"'), '메인 시계 머리글에 도시 칸이 없다');
  assert.match(clock, /drawAnalogClock\(el\.analogCanvas, now, settings\.analogStyle, analogColorsFrom\(\), cityLabel\(\)\)/);
  assert.ok(html.includes('js/zone-time.js'), '시간대 변환을 읽어 들이지 않는다');
});

test('NodeList 를 배열처럼 쓰지 않는다 (브라우저에서만 터지는 실수)', () => {
  // document.querySelectorAll 은 NodeList 를 준다. forEach 말고는 배열 메서드가 없어서
  // 검사(작은 DOM)에서는 지나가고 진짜 창에서만 터진다.
  const bad = /querySelectorAll\([^)]*\)\s*\.\s*(some|find|filter|map|every|reduce|sort|slice|at|includes)/;
  for (const file of [
    'src/js/panel.js',
    'src/js/clock.js',
    'src/js/zoneclock.js',
    'src/js/about.js',
    'src/js/menu.js',
    'src/js/fullscreen.js',
    'src/js/alarm.js'
  ]) {
    const source = readSource(file);
    const hit = bad.exec(source);
    assert.ok(!hit, `${file}: NodeList 에 ${hit && hit[1]} 를 썼다 — [...]로 옮겨 담아야 한다`);
  }
});

test('끌기는 놓쳐도 저절로 끝난다 (창이 커서에 붙어 다니지 않도록)', () => {
  const main = readSource('electron/main.js');

  // 메인 프로세스 쪽 안전장치: 커서가 멈추면 끝, 오래 끌면 끝, 창이 포커스를 잃으면 끝.
  assert.match(main, /const GESTURE_IDLE_MS = \d+/);
  assert.match(main, /function watchGestureIdle/);
  assert.match(main, /if \(watchGestureIdle\(p\)\) return;/);
  assert.match(main, /win\.once\('blur', stopGesture\)/);

  // 렌더러 쪽 안전장치 — 시계 창과 추가 시계 창 모두.
  for (const file of ['src/js/clock.js', 'src/js/zoneclock.js']) {
    const source = readSource(file);
    assert.match(source, /if \(event\.buttons === 0\) endGesture\(\)/, `${file}: 버튼을 뗀 이동을 보지 않는다`);
    assert.match(source, /window\.addEventListener\('mouseup', endGesture\)/, `${file}: mouseup 안전장치가 없다`);
    assert.match(source, /window\.addEventListener\('blur', endGesture\)/, `${file}: blur 안전장치가 없다`);
  }
});

test('쓰고 있는 칸은 다시 그리지 않는다', () => {
  const panel = readSource('src/js/panel.js');
  assert.match(panel, /function isBeingUsed/);
  assert.match(panel, /document\.activeElement === node/);
  assert.match(panel, /function setValue/);
  // 창 크기 맞추기도 미룬다.
  assert.match(panel, /function fitSettingsWindow[\s\S]{0,260}document\.activeElement !== document\.body\) return/);
});

