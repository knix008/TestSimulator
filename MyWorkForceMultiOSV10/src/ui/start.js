import { EXAMPLES } from '../domain/examples.js';
import { ENGINES } from '../domain/engines.js';
import { gripIcon } from '../icons.js';
import { esc, icon, L } from './bits.js';
import { BACKGROUND_INTERVALS, BACKGROUNDS, knownBackground } from './background.js';
import { loginForm } from './chrome.js';

const KIND = {
  software: ['소프트웨어', 'Software', 'board'],
  business: ['업무', 'Business', 'flag'],
  service: ['서비스', 'Service', 'request'],
};

function startProjects(ctx) {
  const listed = ctx.ui?.status?.projects;
  if (Array.isArray(listed)) return listed;
  return (ctx.ws?.projects || []).map((project) => ({
    id: project.id, key: project.key || '', name: project.name || '', type: project.type || 'software',
    issues: (project.issues || []).length, archived: Boolean(project.archived),
  }));
}

function tile(action, glyph, title, tip, extra = '') {
  return `<button type="button" class="start-tile" data-action="${action}" ${extra}><span class="start-tile-icon">${icon(glyph)}</span><b>${esc(title)}</b><small>${esc(tip)}</small></button>`;
}

function card(id, glyph, title, body, hidden = '', note = '') {
  const move = L('끌어서 이 섹션을 옮깁니다.', 'Drag to move this section.');
  const resize = L('끌어서 이 섹션의 크기를 바꿉니다. 두 번 누르면 내용에 맞춥니다.', 'Drag to resize this section. Double-click fits the content.');
  return `<section class="start-card start-section" data-card="${id}"${hidden}>
    <h2><button type="button" class="card-handle" data-card-handle="${id}" title="${esc(move)}" aria-label="${esc(move)}">${icon('move')}</button>${icon(glyph)}<span class="start-card-title">${title}</span>${note}</h2>
    <div class="card-body">${body}</div>
    <span class="card-resize" data-card-resize="${id}" title="${esc(resize)}" role="separator" aria-label="${esc(resize)}">${gripIcon()}</span>
  </section>`;
}

/** SQLite file and the server connection. Shown from Settings. */
export function databaseSettings(ctx) {
  const ui = ctx.ui || {};
  const status = ui.status;
  const saved = status?.saved;
  const engines = ENGINES.map((engine) => `<option value="${engine.id}" ${saved?.engine === engine.id ? 'selected' : ''}>${esc(L(engine.ko, engine.en))}${engine.port ? ` · ${engine.port}` : ''}</option>`).join('');
  const error = ui.startError ? `<p class="danger-text">${esc(ui.startError)}</p>` : '';
  const offline = status?.listening === false ? `<p class="danger-text">${L('데이터 서비스에 연결하지 못했습니다. 주소와 실행 여부를 확인하세요.', 'The data service did not answer. Check the address and that it is running.')}</p>` : '';
  return `<section><h2>${icon('database')}<span>${L('데이터베이스', 'Database')}</span></h2>${offline}${error}<div class="start-grid">
      <section class="panel-card">
        <header><b>${icon('database')}${L('이 컴퓨터', 'This computer')}</b></header>
        <p>${L('기본 저장소는 SQLite 파일입니다. 예제와 튜토리얼도 이 파일에 저장됩니다.', 'The default store is a SQLite file. Examples and the tutorial are saved there too.')}</p>
        <p class="muted">${esc(status?.database || 'data/myworkforce.sqlite')}</p>
        <label class="form-row"><span>${L('작업 공간 암호', 'Workspace password')}</span><input id="local-unlock" type="password" placeholder="${esc(L('암호가 있을 때만', 'Only if a password is set'))}"></label>
        <button type="button" class="button primary" data-action="connect-local" ${ui.connecting ? 'disabled' : ''}>${icon('play')}<span>${L('들어가기', 'Enter')}</span></button>
        ${ui.localBackup ? `<button type="button" class="button" data-action="import-local">${icon('download')}<span>${L('브라우저에 있던 작업 공간 가져오기', 'Import the workspace saved in this browser')}</span></button>` : ''}
      </section>
      <form class="panel-card" id="server-form">
        <header><b>${icon('globe')}${L('서버 데이터베이스', 'Server database')}</b></header>
        <label class="form-row"><span>${L('데이터 서비스', 'Data service')}</span><input name="service" value="${esc(ui.dataUrl || 'http://127.0.0.1:1481')}"></label>
        <label class="form-row"><span>${L('종류', 'Engine')}</span><select name="engine">${engines}</select></label>
        <label class="form-row"><span>${L('호스트', 'Host')}</span><input name="host" value="${esc(saved?.host || '127.0.0.1')}"></label>
        <label class="form-row"><span>${L('포트', 'Port')}</span><input name="port" value="${esc(saved?.port || '')}" placeholder="3306"></label>
        <label class="form-row"><span>${L('데이터베이스', 'Database')}</span><input name="database" value="${esc(saved?.database || '')}"></label>
        <label class="form-row"><span>${L('사용자', 'User')}</span><input name="user" value="${esc(saved?.user || '')}"></label>
        <label class="form-row"><span>${L('암호', 'Password')}</span><input name="password" type="password"></label>
        <label class="form-row"><span>${L('작업 공간 암호', 'Workspace password')}</span><input name="unlock" type="password" placeholder="${esc(L('사람마다 암호가 있을 때만', 'Only when a person has a password'))}"></label>
        <button type="submit" class="button primary" ${ui.connecting ? 'disabled' : ''}>${icon('check')}<span>${L('연결', 'Connect')}</span></button>
      </form>
    </div></section>`;
}

export function renderStart(ctx) {
  const ui = ctx.ui || {};
  const tab = ui.startTab || 'all';
  const error = ui.startError ? `<p class="danger-text">${esc(ui.startError)}</p>` : '';
  const offline = ui.status?.listening === false ? `<p class="danger-text">${L('데이터 서비스에 연결하지 못했습니다. 주소와 실행 여부를 확인하세요.', 'The data service did not answer. Check the address and that it is running.')}</p>` : '';
  const needle = String(ui.exampleFilter || '').trim().toLowerCase();
  const examples = EXAMPLES.filter((item) => !needle || `${item.ko} ${item.en} ${item.key} ${item.about.join(' ')}`.toLowerCase().includes(needle));
  const groups = ['software', 'business', 'service'].map((id) => {
    const kind = KIND[id];
    const items = examples.filter((item) => item.type === id);
    if (!items.length) return '';
    const tiles = items.map((item) => `<button type="button" class="start-tile example-card" data-action="open-example" data-id="${esc(item.id)}" ${ui.connecting ? 'disabled' : ''}><span class="start-tile-icon">${icon(kind[2])}</span><b>${esc(L(item.ko, item.en))}</b><small>${esc(item.key)} · ${esc(L(item.about[0], item.about[1]))}</small></button>`).join('');
    return `<section class="sample-group"><h3>${icon(kind[2])}<span>${L(kind[0], kind[1])}</span><span class="sample-count">${items.length}</span></h3><div class="sample-tiles">${tiles}</div></section>`;
  }).join('');
  const show = (id) => (tab === id || (tab === 'all' && id === 'examples') ? '' : ' hidden');
  const projects = startProjects(ctx);
  const projectTiles = projects.map((project) => {
    const kind = KIND[project.type] || KIND.software;
    const state = project.archived ? L('보관', 'Archived') : L(`${project.issues || 0}개 이슈`, `${project.issues || 0} issues`);
    return `<button type="button" class="start-tile" data-action="open-project" data-id="${esc(project.id)}" ${ui.connecting ? 'disabled' : ''}><span class="start-tile-icon">${icon(kind[2])}</span><b>${esc(project.name)}</b><small>${esc(project.key)} · ${esc(L(kind[0], kind[1]))} · ${esc(state)}</small></button>`;
  }).join('');
  const settings = ctx.settings || {};
  const currentBackground = knownBackground(settings.background);
  const speed = Number.isFinite(Number(settings.backgroundSpeed)) ? Number(settings.backgroundSpeed) : 100;
  const interval = BACKGROUND_INTERVALS.includes(Number(settings.backgroundInterval)) ? Number(settings.backgroundInterval) : 0;
  const intervalLabel = (seconds) => (seconds ? L(`${seconds}초`, `${seconds}s`) : L('끄기', 'Off'));
  const backgrounds = BACKGROUNDS.map((item) => {
    const on = item.id === currentBackground;
    return `<button type="button" class="bg-tile${on ? ' on' : ''}" data-action="pick-background" data-id="${item.id}" role="radio" aria-checked="${on ? 'true' : 'false'}">${icon(item.icon)}<span>${esc(L(item.ko, item.en))}</span></button>`;
  }).join('');
  const background = `<div class="bg-grid" role="radiogroup">${backgrounds}</div>
    <div class="start-controls">
      <button type="button" class="button" data-action="shuffle-background">${icon('spark')}<span>${L('다른 배경', 'Another background')}</span></button>
      <label class="start-speed">${icon('clock')}<span>${L('속도', 'Speed')}</span><input type="range" min="0" max="300" step="10" value="${speed}" data-bg="speed"><output>${speed}%</output></label>
      <label class="check">${icon('sun')}<input type="checkbox" data-bg="random" ${settings.backgroundRandom ? 'checked' : ''}>${L('시작할 때 무작위로', 'Random at start')}</label>
      <label class="start-speed">${icon('calendar')}<span>${L('자동으로 바꾸기', 'Change automatically')}</span><select data-bg="interval">${BACKGROUND_INTERVALS.map((seconds) => `<option value="${seconds}" ${interval === seconds ? 'selected' : ''}>${intervalLabel(seconds)}</option>`).join('')}</select></label>
    </div>`;
  const actions = [
    tile('start-tutorial', 'play', L('튜토리얼', 'Tutorial'), L('쇼핑몰 예제로 주요 화면을 둘러봅니다.', 'Walk the main screens with the shop example.')),
    tile('open-guide', 'play', L('튜토리얼 문서', 'Tutorial document'), L('각 단계와 화면을 별도의 창에서 봅니다.', 'Every step with its screen, in its own window.'), 'data-id="tutorial"'),
    tile('open-guide', 'book', L('사용 설명서', 'User guide'), L('메뉴, 이슈, 계획, 문서를 별도의 창에서 설명합니다.', 'Menus, issues, planning and documents, in their own window.'), 'data-id="guide"'),
    tile('open-guide', 'filter', L('WQL 설명서', 'WQL guide'), L('작업 질의 문법을 별도의 창에서 봅니다.', 'The query language, in its own window.'), 'data-id="wql"'),
    tile('start-tab', 'box', L('예제', 'Examples'), L(`${EXAMPLES.length}개의 작업 공간`, `${EXAMPLES.length} workspaces`), 'data-id="examples"'),
    tile('connect-local', 'play', L('들어가기', 'Enter'), L('이 컴퓨터의 SQLite 파일로 들어갑니다.', 'Enter the SQLite file on this computer.')),
  ].join('');
  return `<div class="start-page" data-tab="${esc(tab)}">
    <canvas class="start-bg" aria-hidden="true"></canvas>
    <div class="start-scroll">
      <div class="start-inner">
        <section class="start-card start-hero">
          <img class="start-icon" src="./icon.png" alt="">
          <div class="start-hero-text">
            <h1>MyWorkForce <small>v${esc(ctx.version || '1.0.0')}</small></h1>
            <p>${L('튜토리얼로 둘러보거나, 설명서를 읽거나, 예제를 열어 시작합니다.', 'Start with the tutorial, the user guide, or an example.')}</p>
          </div>
          <div class="start-hero-actions">
            <button type="button" class="button big" data-action="open-guide" data-id="guide">${icon('book')}<span>${L('사용 설명서', 'User guide')}</span></button>
            <button type="button" class="button big primary" data-action="start-tutorial" ${ui.connecting ? 'disabled' : ''}>${icon('play')}<span>${L('튜토리얼 시작', 'Start the tutorial')}</span></button>
          </div>
        </section>
        ${offline}${error}
        <div class="start-board">
        ${card('login', 'user', L('로그인', 'Sign in'), loginForm(ctx))}
        ${settings.startShowBanner === false ? '' : card('banner', 'info', L('개인용', 'Personal'), `<p>${L('지금은 개인용입니다. 이 컴퓨터의 데이터 서비스가 SQLite, MySQL, MariaDB, SQL Server, PostgreSQL 중 하나에 연결합니다. 관리 프로그램은 나중에 같은 데이터베이스를 엽니다.', 'This installation is personal for now. Its data service connects to SQLite, MySQL, MariaDB, SQL Server, or PostgreSQL. An administration app will open the same database later.')}</p>`)}
        ${card('actions', 'spark', L('시작', 'Start'), `<div class="sample-tiles">${actions}</div>`)}
        ${settings.startShowBackground === false ? '' : card('background', 'spark', L('배경', 'Background'), background, '', `<span class="sample-count">${BACKGROUNDS.length}</span>`)}
        ${settings.startShowProjects === false ? '' : card('projects', 'folder', L('과제', 'Projects'), projectTiles ? `<div class="sample-tiles">${projectTiles}</div>` : `<p class="muted">${L('만들어진 과제가 없습니다.', 'There are no projects yet.')}</p>`, '', `<span class="sample-count">${projects.length}</span>`)}
        ${settings.startShowExamples === false ? '' : card('examples', 'box', L('예제', 'Examples'), `<p>${L('카드를 누르면 그 작업 공간으로 바뀝니다. 이미 프로젝트가 있으면 먼저 확인합니다.', 'A card replaces the workspace with that example. If you already have projects, it asks first.')}</p><label class="start-find"><span>${L('찾기', 'Find')}</span><input id="example-filter" value="${esc(ui.exampleFilter || '')}" placeholder="${esc(L('이름, 키, 설명', 'Name, key, or description'))}" autocomplete="off"></label><div class="sample-groups">${groups || `<p class="muted">${L('찾는 예제가 없습니다.', 'No example matches.')}</p>`}</div>`, show('examples'), `<span class="sample-count">${EXAMPLES.length}</span>`)}
        </div>
        <footer class="start-foot">${icon('info')}<span class="grow">MyWorkForce v${esc(ctx.version || '1.0.0')}</span><span class="muted">© SHKWON (knix008@naver.com)</span></footer>
      </div>
    </div>
  </div>`;
}
