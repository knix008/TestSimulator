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
  const lib = readSource('src-tauri/src/lib.rs');
  const clock = readSource('src/js/clock.js');

  // 패널은 only=settings 로 뜬다.
  assert.match(lib, /page: "panel\.html\?only=settings"\.into\(\)/);
  // 분리한 기능 창은 tool=1 로 구분한다 (닫기 동작이 다르다).
  assert.match(lib, /format!\("panel\.html\?only=\{tab\}&tool=1"\)/);
  assert.match(panel, /const isToolWindow = params\.get\('tool'\) === '1'/);
  assert.match(panel, /selectTab\(onlyTab\)/, '창 하나가 한 가지만 보여 준다');

  // 시계 창 메뉴에서 기능 창들을 연다.
  for (const tab of ['world', 'alarm', 'timer', 'stopwatch', 'calendar']) {
    assert.ok(clock.includes(`api.tools.open('${tab}')`), `메뉴에 ${tab} 창을 여는 길이 없다`);
  }
  // 트레이 메뉴에도 같은 길이 있다.
  assert.match(lib, /\["world", "alarm", "timer", "stopwatch", "calendar"\]/, '트레이 메뉴의 기능 창 목록');
  assert.match(lib, /strip_prefix\("tool:"\)[\s\S]{0,40}open_tool_window\(app, tab\)/);
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

test('bridge 가 부르는 명령마다 Rust 쪽에 받는 명령이 있다', () => {
  const bridge = readSource('src/js/bridge.js');
  const lib = readSource('src-tauri/src/lib.rs');

  const called = new Set([...bridge.matchAll(/\b(?:invoke|send)\('([a-z_]+)'/g)].map((m) => m[1]));
  const commands = new Set([...lib.matchAll(/#\[tauri::command\]\s*\n(?:async )?fn ([a-z_]+)/g)].map((m) => m[1]));
  const handlerBlock = /generate_handler!\[([\s\S]*?)\]/.exec(lib);
  assert.ok(handlerBlock, 'generate_handler! 가 없다');
  const handled = new Set(handlerBlock[1].split(',').map((s) => s.trim()).filter(Boolean));

  assert.ok(called.size >= 40, `통로가 너무 적다: ${called.size}`);
  for (const name of called) {
    assert.ok(commands.has(name), `#[tauri::command] fn ${name} 이 없다`);
    assert.ok(handled.has(name), `generate_handler! 에 ${name} 이 없다`);
  }
  // 등록만 하고 아무도 부르지 않는 명령도 없다.
  for (const name of commands) assert.ok(called.has(name), `${name} 은 bridge 에서 부르지 않는다`);

  // 반대 방향 — 메인이 보내는 알림(post)을 bridge 가 받아 둔다.
  const received = [...bridge.matchAll(/\bon\('([^']+)'\)/g)].map((m) => m[1]);
  assert.ok(received.length >= 12, `알림이 너무 적다: ${received.length}`);
  for (const event of received) {
    assert.ok(lib.includes(`"${event}"`), `메인이 '${event}' 을 보내지 않는다`);
  }
});

test('모든 창 문서가 bridge 를 먼저 읽고, IPC 를 막지 않는다', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const htmls = fs.readdirSync(path.join(__dirname, '..', 'src')).filter((name) => name.endsWith('.html'));
  assert.ok(htmls.length >= 7);
  for (const html of htmls) {
    const text = readSource(`src/${html}`);
    const first = /<script src="([^"]+)"/.exec(text);
    assert.equal(first && first[1], 'js/bridge.js', `${html}: bridge.js 가 맨 먼저 읽히지 않는다`);
    assert.match(text, /connect-src ipc: http:\/\/ipc\.localhost/, `${html}: CSP 가 IPC 를 막는다`);
  }
});

test('창 이름마다 이벤트를 들을 권한이 있다', () => {
  const lib = readSource('src-tauri/src/lib.rs');
  const capability = JSON.parse(readSource('src-tauri/capabilities/default.json'));
  const prefixes = new Set([...lib.matchAll(/next_label\(app, "([a-z]+)"\)/g)].map((m) => m[1]));
  prefixes.delete('t'); // 미룬 일의 이름표 — 창이 아니다.
  assert.ok(prefixes.size >= 8, `창 종류: ${[...prefixes]}`);
  assert.ok(capability.windows.includes('clock'));
  for (const prefix of prefixes) {
    assert.ok(capability.windows.includes(`${prefix}-*`), `capabilities 에 ${prefix}-* 가 없다`);
  }
  assert.ok(capability.permissions.includes('core:event:default'));
});

test('패널이 어느 탭으로 열릴지 메인 프로세스가 적어 둔다', () => {
  const lib = readSource('src-tauri/src/lib.rs');
  const bridge = readSource('src/js/bridge.js');
  assert.match(lib, /s\.panel_pending_tab = tab;/, '열어 달라고 한 탭을 적어 두지 않는다');
  assert.match(lib, /fn panel_pending_tab\(app: AppHandle\) -> Option<String> \{\s*st\(&app\)\.panel_pending_tab\.take\(\)/, '한 번 읽으면 지워야 한다');
  assert.match(bridge, /pendingTab: \(\) => invoke\('panel_pending_tab'\)/);
  // 트레이 메뉴의 "설정..." 도 설정 탭을 지정해 연다.
  assert.match(lib, /toggle_panel\(app, Some\("settings"\.into\(\)\)\)/);
});

test('렌더러가 쓰는 bridge API 가 모두 열려 있다', () => {
  const bridge = readSource('src/js/bridge.js');
  for (const file of [
    'src/js/clock.js',
    'src/js/zoneclock.js',
    'src/js/panel.js',
    'src/js/menu.js',
    'src/js/fullscreen.js',
    'src/js/alarm.js',
    'src/js/about.js',
    'src/js/surface.js'
  ]) {
    const text = readSource(file);
    const used = new Set([...text.matchAll(/\bapi\.([a-zA-Z]+)\.([a-zA-Z]+)\(/g)].map((m) => `${m[1]}.${m[2]}`));
    for (const call of used) {
      const [group, method] = call.split('.');
      const block = new RegExp(`\\n {4}${group}:\\s*\\{[\\s\\S]*?\\n {4}\\}`, 'm').exec(bridge);
      assert.ok(block, `bridge 에 ${group} 묶음이 없다 (${file})`);
      assert.ok(new RegExp(`\\b${method}:`).test(block[0]), `bridge ${group} 에 ${method} 가 없다 (${file} 에서 부른다)`);
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
  const bridge = readSource('src/js/bridge.js');
  const lib = readSource('src-tauri/src/lib.rs');
  assert.match(bridge, /open: \(tab\) => send\('tools_open', \{ tab: String\(tab\) \}\)/);
  assert.match(lib, /async fn tools_open\(app: AppHandle, tab: String\)/);
  assert.match(lib, /only=\{tab\}/, '분리한 창은 panel.html?only=<탭> 으로 연다');
  // 분리한 창도 같은 상태 스냅샷을 받아야 한다.
  assert.match(lib, /fn relay_to_panel[\s\S]{0,500}s\.tools\.values\(\)[\s\S]{0,80}s\.clock_settings\.values\(\)[\s\S]{0,200}"from-clock"/);
});

test('창마다 자기 창을 움직인다 (시계가 여럿이므로)', () => {
  const lib = readSource('src-tauri/src/lib.rs');
  for (const command of ['window_drag_start', 'window_resize_start', 'window_set_size', 'window_set_min_size']) {
    assert.match(lib, new RegExp(`fn ${command}\\(app: AppHandle, window: WebviewWindow`), `${command} 가 보낸 쪽 창을 쓰지 않는다`);
  }
  // 컨텍스트 메뉴 결과도 연 창으로 돌아가야 한다.
  assert.match(lib, /open_menu_window\(&app, window\.label\(\), payload\)/);
  assert.match(lib, /s\.menu_opener = Some\(opener\.to_string\(\)\)/);
  assert.match(lib, /fn menu_choose[\s\S]{0,300}"menu:action"/);
});

test('메뉴에서 시계를 추가할 수 있다', () => {
  const clock = readSource('src/js/clock.js');
  const lib = readSource('src-tauri/src/lib.rs');

  // 시계 창 메뉴: "시계 추가..." → 도시 목록 메뉴 → 고른 도시로 시계 열기
  assert.match(clock, /id: 'newclock'[\s\S]{0,60}시계 추가/);
  assert.match(clock, /function openAddClockMenu/);
  assert.match(clock, /id: `addclock:\$\{index\}`/);
  assert.match(clock, /api\.clocks\.add\(city\)/);
  // 목록이 길면 세계 시간 창으로 넘긴다.
  assert.match(clock, /label: '다른 도시 찾기\.\.\.'/);

  // 트레이 메뉴에도 "시계 추가" 하위 메뉴가 있다.
  assert.match(lib, /submenu\(app, "add", "시계 추가", "add"/);
  assert.match(lib, /strip_prefix\("add-city:"\)[\s\S]{0,200}add_extra_clock\(app, &city\)/);
  // 열어 둔 시계가 있으면 닫는 메뉴도 함께 보여 준다.
  assert.match(lib, /submenu\(app, "close", "시계 닫기", "close"/);
  // 도시·시계 목록이 바뀌면 메뉴를 다시 만든다.
  assert.match(lib, /fn save_extra_clocks[\s\S]{0,300}refresh_tray_menu\(app\)/);
  assert.match(lib, /\["worldCities", "alwaysOnTop", "extraClocks", "startWithSystem"\][\s\S]{0,120}refresh_tray_menu/);
});

test('전체 화면 시계도 배경이 투명하다', () => {
  const lib = readSource('src-tauri/src/lib.rs');
  const css = readSource('src/styles/fullscreen.css');

  // 창 자체가 투명해야 바탕화면이 비친다.
  const block = /fn open_fullscreen_clock[\s\S]*?page: "fullscreen\.html"\.into\(\),([\s\S]*?)\}/.exec(lib);
  assert.ok(block, '전체 화면 창을 만드는 곳을 찾지 못했다');
  assert.match(block[1], /transparent: true/, '전체 화면 창이 투명하지 않다');
  assert.match(lib, /if !spec\.transparent \{\s*builder = builder\.background_color/, '투명 창에 배경색을 칠한다');

  // 문서도 바탕을 칠하지 않는다.
  const body = /html,\s*body \{([\s\S]*?)\}/.exec(css);
  assert.ok(body, 'fullscreen.css 의 body 규칙을 찾지 못했다');
  assert.ok(!/background:\s*var\(--window-background/.test(body[1]), '전체 화면 문서가 테마 바탕색으로 칠해져 있다');
  // 투명 위에서도 읽히도록 글자에 그림자를 넣는다.
  assert.match(css, /\.full-stage \{[\s\S]*?text-shadow/);

  // 투명 창을 OS 의 전체 화면 모드로 열면 바로 풀린다 — 작업 영역만 한 창을 맨 위에 둔다.
  assert.ok(!/set_fullscreen\(true\)|\.fullscreen\(true\)/.test(lib), '투명 창을 fullscreen 모드로 열면 바로 풀린다');
  assert.match(lib, /fn pin_fullscreen[\s\S]{0,400}set_always_on_top\(true\)/);
  assert.match(lib, /fn fullscreen_display_area/);

  // 마우스로는 닫지 않는다. ESC 와 설정 메뉴로만 원래 시계로 돌아온다.
  const page = readSource('src/js/fullscreen.js');
  assert.ok(!page.includes('mousemove'), '마우스 움직임으로 전체 화면이 닫힌다');
  assert.match(page, /event\.key !== 'Escape'/);
  assert.match(page, /api\.fullscreen\.close\(\)/);
  assert.match(page, /api\.fullscreen\.fit\(/);

  assert.match(lib, /fn hide_clocks_for_fullscreen/);
  assert.match(lib, /fn show_clocks_after_fullscreen/);
  assert.match(lib, /fn restore_overlays_after_fullscreen/);
  assert.match(lib, /fn fullscreen_clock_bounds/);
  assert.match(lib, /on_shortcut\("Escape"/);
  assert.match(lib, /set_ignore_cursor_events\(true\)/);
  assert.match(lib, /fn fullscreen_fit\(app: AppHandle, window: WebviewWindow, rect: Value\)/);
  assert.match(readSource('src/js/bridge.js'), /fit: \(rect\) => send\('fullscreen_fit', \{ rect: rect \|\| \{\} \}\)/);
  assert.match(readSource('src/fullscreen.html'), /class="full-clock"/);
  assert.ok(!/background:\s*rgba\(0,\s*0,\s*0/.test(css), '전체 화면 바탕이 마우스를 받는 색으로 칠해져 있다');
});

test('트레이 메뉴 항목마다 아이콘이 있고, 설정에서 원래 크기로 돌아간다', () => {
  const lib = readSource('src-tauri/src/lib.rs');
  const icons = readSource('src-tauri/src/menu_icons.rs');
  const names = /pub const ICON_NAMES: \[&str; \d+\] = \[([\s\S]*?)\];/.exec(icons);
  assert.ok(names, 'ICON_NAMES 가 없다');
  const iconNames = [...names[1].matchAll(/"([a-z]+)"/g)].map((m) => m[1]);

  for (const name of [
    'open', 'settings', 'add', 'clock', 'world', 'close', 'system',
    'restore', 'reset', 'alarm', 'timer', 'stopwatch', 'calendar', 'info', 'quit'
  ]) {
    assert.ok(iconNames.includes(name), `아이콘이 없다: ${name}`);
    assert.ok(icons.includes(`"${name}" =>`), `${name} 을 그리는 코드가 없다`);
    assert.ok(lib.includes(`"${name}"`), `트레이에서 ${name} 아이콘을 쓰지 않는다`);
  }
  // 켜고 끄는 항목(항상 위·자동 실행)은 아이콘 대신 운영체제의 체크 표시를 쓴다.
  assert.match(lib, /CheckMenuItem::with_id\(app, "toggle-top"/);
  assert.match(lib, /CheckMenuItem::with_id\(app, "toggle-startup"/);
  // 16px 그림, 고해상도 화면에서는 두 배로.
  assert.match(icons, /pub const SIZE: usize = 16;/);
  assert.match(lib, /if scale >= 1\.5 \{[\s\S]{0,200}menu_icons::scale\(&rgba, 2\)/);

  assert.match(lib, /"restore-size", "원래 크기로 돌아가기", "restore", is_fullscreen_open\(app\)/);
  assert.match(lib, /"restore-size" => close_fullscreen_clock\(app\)/);
  assert.match(readSource('src/panel.html'), /id="restoreSizeBtn"/);
  assert.match(readSource('src/js/panel.js'), /\$\('restoreSizeBtn'\)[\s\S]{0,80}fullscreen\.close/);
  assert.match(readSource('src/fullscreen.html'), /원래 크기로 돌아가기/);
});

test('정보 창이 열리는 길이 메뉴와 트레이에 있다', () => {
  const lib = readSource('src-tauri/src/lib.rs');
  const clock = readSource('src/js/clock.js');
  const bridge = readSource('src/js/bridge.js');

  assert.match(lib, /fn open_about_window/);
  assert.match(lib, /fn app_info\(app: AppHandle\) -> Value/);
  assert.match(lib, /async fn about_open/);
  assert.match(lib, /item\(app, "about", "프로그램 정보\.\.\.", "info", true\)/, '트레이 메뉴에 없다');
  assert.match(lib, /"about" => open_about_window\(app\)/);
  assert.match(clock, /id: 'about'/, '시계 메뉴에 없다');
  assert.match(clock, /about: \(\) => api\.app\.about\(\)/);
  assert.match(bridge, /info: \(\) => invoke\('app_info'\)/);
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
  const lib = readSource('src-tauri/src/lib.rs');
  const geometry = readSource('src-tauri/src/geometry.rs');
  const panel = readSource('src/js/panel.js');
  const css = readSource('src/styles/panel.css');

  // 기본 크기는 넉넉히 잡되, 내용이 더 크면 패널이 재서 알려 준다.
  const width = /const PANEL_WIDTH: f64 = (\d+)/.exec(lib);
  assert.ok(width && Number(width[1]) >= 360, `설정 창 폭: ${width && width[1]}`);
  assert.match(panel, /function fitSettingsWindow/);
  assert.match(panel, /api\.panel\.fit\(wanted\)/);
  assert.match(lib, /fn panel_fit\(app: AppHandle, size: Value\)/);
  assert.match(geometry, /let width = base\.0\.max\(fit_w\)/);

  // 패널 자리를 작업 영역 안으로 당긴다.
  assert.match(geometry, /pub fn panel_bounds_for[\s\S]{0,900}clamp_to_work_area\(displays/);

  // 테마 칸 너비는 가장 긴 이름에 맞춰 잡는다 — 글자가 잘리지 않도록.
  assert.match(panel, /function fitThemeTiles/);
  assert.match(panel, /--theme-tile/);
  assert.match(css, /minmax\(var\(--theme-tile, 104px\), 1fr\)/);
  // 테마는 네 칸씩 — 창이 그만큼만 넓으면 된다.
  assert.match(panel, /const THEME_COLUMNS = 4/);
});

test('설정 창은 시계마다 하나씩, 나머지 창은 하나씩만 뜬다', () => {
  const lib = readSource('src-tauri/src/lib.rs');
  const panel = readSource('src/js/panel.js');

  // 시계 설정 창은 시계 id 로 구분해 하나씩만 연다.
  assert.match(lib, /clock_settings: HashMap<String, String>/);
  assert.match(lib, /fn open_clock_settings\(app: &AppHandle, id: &str\) \{[\s\S]{0,300}show\(&w, true\);\s*return;/);
  assert.match(lib, /panel\.html\?only=settings&tool=1&clock=/);
  // 시계를 닫으면 그 설정 창도 닫는다.
  assert.match(lib, /fn remove_extra_clock\(app: &AppHandle, id: &str\) \{\s*close_clock_settings\(app, id\)/);

  // 기능 창(알람·타이머·…)은 탭마다 하나뿐이다.
  assert.match(lib, /fn open_tool_window\(app: &AppHandle, tab: &str\) \{[\s\S]{0,300}show\(&w, true\);\s*return;/);
  // 정보 창도 하나뿐이다.
  assert.match(lib, /fn open_about_window\(app: &AppHandle\) \{[\s\S]{0,200}show\(&w, true\);\s*return;/);

  // 설정 창 안에는 시계 고르개가 없다 — 창이 곧 그 시계의 것이다.
  assert.ok(!panel.includes("getElementById('clockTarget')"), '시계 고르개가 남아 있다');
  assert.match(panel, /let clockTarget = params\.get\('clock'\) \|\| 'main'/);
});

test('시스템 설정은 트레이에서 다룬다', () => {
  const lib = readSource('src-tauri/src/lib.rs');
  const store = readSource('src-tauri/src/store.rs');
  const html = readSource('src/panel.html');

  // 설정 창에서는 빠졌다.
  assert.ok(!html.includes('id="alwaysOnTop"'), '항상 위에 표시가 설정 창에 남아 있다');
  assert.ok(!html.includes('id="startWithSystem"'), '자동 실행이 설정 창에 남아 있다');
  assert.ok(!html.includes('id="resetBtn"'), '초기화가 설정 창에 남아 있다');
  assert.ok(!html.includes('data-sub="system"'), '시스템 갈래가 남아 있다');

  // 트레이에 있다 — 켜고 끄는 항목으로.
  assert.match(lib, /submenu\(app, "system", "시스템 설정", "system"/);
  assert.match(lib, /CheckMenuItem::with_id\(app, "toggle-top", "항상 위에 표시"/);
  assert.match(lib, /CheckMenuItem::with_id\(app, "toggle-startup", "시작 시 자동 실행"/);
  assert.match(lib, /"기본값으로 초기화\.\.\."/);
  // 되돌릴 수 없으니 한 번 묻는다.
  assert.match(lib, /fn confirm_reset[\s\S]{0,700}OkCancelCustom\("초기화"/);
  // 초기화해도 추가한 시계는 남긴다.
  assert.match(store, /fresh\["extraClocks"\] = current\["extraClocks"\]\.clone\(\)/);
});

test('표시 우선순위는 시계마다 따로 걸린다', () => {
  const lib = readSource('src-tauri/src/lib.rs');
  const clock = readSource('src/js/clock.js');

  // 트레이 스위치와 시계 창의 저장 모두 같은 길로 창마다 다시 건다.
  assert.match(lib, /fn set_always_on_top\(app: &AppHandle, on_top: bool\) \{[\s\S]{0,200}apply_display_priority\(app\)/);
  assert.match(lib, /fn window_set_always_on_top\(app: AppHandle\) \{\s*bg\(&app, apply_display_priority\)/);
  assert.match(lib, /patch\.get\("displayPriority"\)\.is_some\(\) \{\s*apply_display_priority\(app\)/, '추가 시계의 우선순위가 바로 걸리지 않는다');
  assert.match(clock, /'displayPriority' in patch/, '메인 시계의 우선순위가 바로 걸리지 않는다');
  // 시계 창은 처음부터 자기 우선순위로 뜬다.
  assert.match(lib, /let on_top = priority_on_top\(s_str\(&settings, "displayPriority"\)/);
  assert.match(lib, /on_top: priority_on_top\(&priority, global_top\)/);
});

test('메인 시계도 도시를 가질 수 있다', () => {
  const clock = readSource('src/js/clock.js');
  const store = readSource('src-tauri/src/store.rs');
  const html = readSource('src/index.html');

  assert.match(store, /"zone": nonempty\(src\.get\("zone"\)\)\.map\(Value::String\)\.unwrap_or\(Value::Null\)/);
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
  const lib = readSource('src-tauri/src/lib.rs');

  // 셸 쪽 안전장치: 버튼을 떼면 끝, 커서가 멈추면 끝, 오래 끌면 끝, 창이 포커스를 잃으면 끝.
  assert.match(lib, /const GESTURE_IDLE: Duration = /);
  assert.match(lib, /last_move\.elapsed\(\) >= GESTURE_IDLE/);
  assert.match(lib, /began\.elapsed\(\) > GESTURE_MAX \|\| !primary_button_down\(\)/);
  assert.match(lib, /WindowEvent::Focused\(false\) => \{[\s\S]{0,200}stop_gesture\(app\)/);

  // 렌더러 쪽 안전장치 — 시계 창과 추가 시계 창 모두.
  for (const file of ['src/js/clock.js', 'src/js/zoneclock.js']) {
    const source = readSource(file);
    assert.match(source, /if \(event\.buttons === 0\) endGesture\(\)/, `${file}: 버튼을 뗀 이동을 보지 않는다`);
    assert.match(source, /window\.addEventListener\('mouseup', endGesture\)/, `${file}: mouseup 안전장치가 없다`);
    assert.match(source, /window\.addEventListener\('blur', endGesture\)/, `${file}: blur 안전장치가 없다`);
  }
});

test('다시 시작하면 저장해 둔 추가 시계를 모두 연다', () => {
  const lib = readSource('src-tauri/src/lib.rs');
  assert.match(lib, /fn present_saved_extra_clocks/);
  assert.match(lib, /create_clock_window\(&handle\)\?;\s*present_saved_extra_clocks\(&handle\);/);
  // 화면이 돌아와도 목록에 있는 시계가 빠지지 않는다.
  assert.match(lib, /fn ensure_clocks_shown\(app: &AppHandle\) \{[\s\S]{0,500}present_saved_extra_clocks\(app\)/);
  // 위치를 옮기다 끝내도 시계 목록이 지워지지 않게 종료 전에 저장한다.
  assert.match(lib, /fn flush_extra_clock_saves/);
  assert.match(lib, /fn before_exit\(app: &AppHandle\) \{[\s\S]{0,200}flush_extra_clock_saves\(app\)/);
  // 시계 창은 창 이름으로 자기가 어느 시계인지 안다.
  assert.match(lib, /fn clock_self[\s\S]{0,200}clock_of_zone\.get\(window\.label\(\)\)/);
});

test('시계는 부팅·화면 전환·잠자기 뒤에도 다시 그려진다', () => {
  const lib = readSource('src-tauri/src/lib.rs');
  const bridge = readSource('src/js/bridge.js');

  assert.match(lib, /CalculateNativeWinOcclusion/, '가려진 시계가 프레임을 버리지 않아야 한다');
  // 트레이로 숨긴 동안에도 알람·타이머가 늦지 않게 타이머를 늦추지 않는다.
  assert.match(lib, /IntensiveWakeUpThrottling/);
  assert.match(lib, /--disable-background-timer-throttling/);
  assert.match(lib, /fn refresh_visible_clock_surfaces/);
  assert.match(lib, /fn ensure_clocks_shown/);
  assert.match(lib, /fn arm_boot_surface_refresh/);
  // 화면 구성이 바뀌거나 잠자기에서 깨어나면 다시 자리를 잡는다.
  assert.match(lib, /fn monitor_signature/);
  assert.match(lib, /next != signature[\s\S]{0,120}schedule_clock_recover\(&app, Recover \{ remount: true/);
  assert.match(lib, /gap > Duration::from_secs\(10\)[\s\S]{0,700}schedule_clock_recover/);
  assert.match(lib, /fn show_clocks_after_fullscreen[\s\S]{0,900}"surface:refresh"/);
  assert.match(lib, /fn surface_request_refresh/);
  assert.match(bridge, /onSurfaceRefresh: on\('surface:refresh'\)/);
  assert.match(bridge, /requestSurfaceRefresh: \(\) => send\('surface_request_refresh'\)/);
  assert.match(readSource('src/js/surface.js'), /contextlost/);
  assert.match(readSource('src/js/surface.js'), /visibilitychange/);
  for (const html of ['src/index.html', 'src/zoneclock.html', 'src/fullscreen.html']) {
    assert.ok(readSource(html).includes('src="js/surface.js"'), `${html} 가 표면 복구를 읽지 않는다`);
  }
});

test('프로그램은 언제나 하나만 실행된다 (시계 창은 여러 개)', () => {
  const lib = readSource('src-tauri/src/lib.rs');
  // 단일 실행 플러그인을 조건 없이 맨 먼저 건다 — 개발 실행에도 예외가 없다.
  assert.match(lib, /tauri::Builder::default\(\)\s*\.plugin\(tauri_plugin_single_instance::init\(/);
  assert.ok(!/allow_multiple|MYCLOCK_MULTI|"--multi"/.test(lib), '여러 개를 띄우는 예외 길이 남아 있다');
  // 두 번째 실행은 이미 떠 있는 시계를 트레이에서 꺼낸다.
  assert.match(lib, /single_instance::init\(\|app, _args, _cwd\| bg\(app, restore_from_tray\)\)/);
});

test('상태 잠금을 한 식 안에서 두 번 잡지 않는다 (교착)', () => {
  const lib = readSource('src-tauri/src/lib.rs');
  // `st(app).a || f(app)` 처럼 잠금 임시값이 살아 있는 채 다른 함수를 부르면 같은 스레드에서 멈춘다.
  for (const [index, line] of lib.split('\n').entries()) {
    if (/^\s*\/\//.test(line)) continue;
    assert.ok(!/st\(&?\w+\)\.[^;]*(\|\||&&)[^;]*\(&?(app|handle)\b/.test(line), `lib.rs:${index + 1}: ${line.trim()}`);
    assert.ok(!/(if let|while let|match) .*= st\(&?\w+\)\.[^;]*\{$/.test(line) || /fake_startup|webview_dir/.test(line), `lib.rs:${index + 1}: if let 의 잠금이 본문 끝까지 산다`);
  }
  // 개발 빌드는 다시 잡으면 곧바로 알린다.
  assert.match(lib, /static HOLDING/);
  assert.match(lib, /debug_assert!\(false, "MyClock: State 잠금을 같은 스레드에서 다시 잡았다/);
});

test('알람 창은 내용에 맞춰 늘어나 아래가 잘리지 않는다', () => {
  const alarm = readSource('src/js/alarm.js');
  const css = readSource('src/styles/alarm.css');
  assert.match(alarm, /function fitToContent/);
  assert.match(alarm, /requestAnimationFrame\(fitToContent\)/);
  assert.match(alarm, /if \(needed > window\.innerHeight\) api\.window\.setSize/);
  // 바깥 여백까지 창 안에 들어간다.
  assert.match(css, /\.alarm-card \{[\s\S]*?height: calc\(100% - 4px\);[\s\S]*?margin: 2px;/);
});

test('쓰고 있는 칸은 다시 그리지 않는다', () => {
  const panel = readSource('src/js/panel.js');
  assert.match(panel, /function isBeingUsed/);
  assert.match(panel, /document\.activeElement === node/);
  assert.match(panel, /function setValue/);
  // 창 크기 맞추기도 미룬다.
  assert.match(panel, /function fitSettingsWindow[\s\S]{0,260}document\.activeElement !== document\.body\) return/);
});
