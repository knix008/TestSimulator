import { EXAMPLES } from '../domain/examples.js';
import { flag } from './flags.js';
import { getLanguage } from '../i18n.js';
import { savedLogin } from '../platform/data.js';
import { engineById, ENGINES } from '../domain/engines.js';
import { isWorkspaceAdmin } from '../domain/permissions.js';
import { gripIcon } from '../icons.js';
import { esc, icon, L } from './bits.js';
import { BACKGROUND_INTERVALS, BACKGROUNDS, knownBackground } from './background.js';

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
    parentKey: (ctx.ws.projects || []).find((item) => item.id === project.parentId)?.key || '',
    issues: (project.issues || []).length, archived: Boolean(project.archived),
  }));
}

function tile(action, glyph, title, tip, extra = '') {
  // The language tile shows the flag of the language it switches to.
  const mark = action === 'language' ? flag(getLanguage() === 'en' ? 'ko' : 'en') : icon(glyph);
  return `<button type="button" class="start-tile" data-action="${action}" ${extra}><span class="start-tile-icon">${mark}</span><b>${esc(title)}</b><small>${esc(tip)}</small></button>`;
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

/** Account kept on this computer, and whether the installed program opens at boot. */
export function startupFields(ctx) {
  const settings = ctx.settings || {};
  const saved = savedLogin() || {};
  const account = saved.account || ctx.ui?.loginAccount || '';
  return `<p class="muted">${L('부팅할 때 MyWorkForce와 대화방을 함께 열고, 저장한 계정으로 들어갑니다.', 'When the system starts, open MyWorkForce and Chatting together, and sign in with the saved account.')}</p>
    <label class="check"><input type="checkbox" data-setting="launchAtStartup" ${settings.launchAtStartup ? 'checked' : ''}>${L('부팅할 때 MyWorkForce와 대화방을 실행', 'Start MyWorkForce and Chatting when the system starts')}</label>
    <label class="check"><input type="checkbox" data-setting="autoLogin" ${settings.autoLogin ? 'checked' : ''}>${L('시작할 때 자동 로그인', 'Sign in when the program opens')}</label>
    <label class="form-row"><span>${L('계정', 'Account')}</span><input data-autologin="account" value="${esc(account)}" autocomplete="username"></label>
    <label class="form-row"><span>${L('암호', 'Password')}</span><input data-autologin="password" type="password" placeholder="${esc(saved.password ? L('저장됨', 'Saved') : '')}" autocomplete="new-password"></label>`;
}

export function startupOptions(ctx) {
  return `<section><h2>${icon('play')}<span>${L('이 컴퓨터', 'This computer')}</span></h2>${startupFields(ctx)}</section>`;
}

/** The tables in the connected database: what is there, what is missing, and the way to fix it. */
export function schemaPanel(ctx) {
  const ui = ctx.ui || {};
  if (!isWorkspaceAdmin(ctx.user)) return '';
  const schema = ui.schema;
  const busy = ui.schemaBusy ? 'disabled' : '';
  const error = ui.schemaError ? `<p class="danger-text">${icon('alert')}<span>${esc(ui.schemaError)}</span></p>` : '';
  let state = `<span class="schema-badge">${icon('clock')}${L('확인하지 않음', 'Not checked')}</span>`;
  let body = `<p class="muted">${L('"확인"을 누르면 연결된 데이터베이스의 표를 살펴봅니다.', 'Press Check to look at the tables in the connected database.')}</p>`;
  if (schema) {
    const ok = schema.ready;
    const label = schema.newer
      ? L('더 새 버전', 'Newer version')
      : ok ? L('최신', 'Up to date') : (schema.version ? L('올려야 함', 'Upgrade needed') : L('만들어야 함', 'Needs creating'));
    state = `<span class="schema-badge ${ok ? 'ok' : 'warn'}">${icon(ok ? 'check' : 'alert')}${esc(label)} · ${L('버전', 'Version')} ${esc(schema.version)} / ${esc(schema.expected)}</span>`;
    const rows = (schema.tables || []).map((table) => `<tr class="${table.exists ? '' : 'missing'}"><td>${icon('table')}<code>${esc(table.name)}</code></td><td>${table.exists ? `${icon('check')}${L('있음', 'Present')}` : `${icon('alert')}${L('없음', 'Missing')}`}</td><td class="num">${table.rows == null ? '—' : esc(table.rows)}</td></tr>`).join('');
    const pending = (schema.pending || []).length
      ? `<p class="schema-pending">${icon('layers')}<span>${L('남은 단계', 'Pending steps')}: ${(schema.pending || []).map((step) => `v${esc(step.version)} ${esc(L(step.ko, step.en))}`).join(', ')}</span></p>`
      : '';
    body = `<p class="muted">${icon('database')}<span>${esc(L(engineById(schema.engine).ko, engineById(schema.engine).en))} · ${esc(schema.database || '')}</span></p>
      ${pending}
      <div class="schema-table-wrap"><table class="schema-table"><thead><tr><th>${L('표', 'Table')}</th><th>${L('상태', 'State')}</th><th class="num">${L('행', 'Rows')}</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  const upgradeLabel = schema && !schema.version ? L('스키마 만들기', 'Create schema') : L('만들기 / 올리기', 'Create / upgrade');
  return `<section class="panel-card schema-card">
    <header><b>${icon('table')}${L('스키마', 'Schema')}</b>${state}</header>
    <p>${L('MyWorkForce가 쓰는 표와 색인입니다. 연결할 때 없는 표는 자동으로 만들고, 여기서 다시 확인하고 올릴 수 있습니다.', 'The tables and indexes MyWorkForce uses. Connecting creates missing tables; check and upgrade them again here.')}</p>
    ${error}${body}
    <div class="page-actions">
      <button type="button" class="button" data-action="schema-check" ${busy}>${icon('search')}<span>${L('확인', 'Check')}</span></button>
      <button type="button" class="button primary" data-action="schema-upgrade" ${busy || (schema?.ready ? 'disabled' : '')}>${icon('wrench')}<span>${upgradeLabel}</span></button>
      <button type="button" class="button" data-action="schema-sql" data-engine="${esc(schema?.engine || '')}">${icon('code')}<span>${L('SQL 스크립트', 'SQL script')}</span></button>
    </div>
  </section>`;
}

const KEY_STATES = {
  new: ['새 데이터베이스입니다. 처음 연결할 때 이 데이터 서비스의 키로 암호화합니다.', 'A new database. The first connection encrypts it with this data service\'s key.'],
  match: ['이 데이터 서비스의 키로 열립니다.', "It opens with this data service's key."],
  legacy: ['암호화 전에 저장된 데이터가 있습니다. 연결하면 이 키로 암호화합니다.', 'It holds data saved before encryption. Connecting encrypts it with this key.'],
  mismatch: ['다른 데이터 서비스의 키로 암호화되어 있습니다. 그 키를 "암호화 키"에 넣어야 연결할 수 있습니다.', 'It is encrypted with another data service\'s key. Put that key in "Encryption key" to connect.'],
};

/** What "Test connection" found, line by line. */
function testReport(report) {
  if (!report) return '';
  const line = (ok, text) => `<li class="${ok === true ? 'ok' : ok === false ? 'bad' : 'warn'}">${icon(ok === true ? 'check' : ok === false ? 'alert' : 'info')}<span>${esc(text)}</span></li>`;
  const rows = [];
  if (!report.ok) {
    const why = report.error === 'database-missing'
      ? L('데이터베이스가 없습니다. "없으면 데이터베이스 만들기"를 켜고 연결하면 만듭니다.', 'The database does not exist. Turn on "Create the database if it is missing" and connect to create it.')
      : report.error === 'driver-missing' ? L('그 데이터베이스 드라이버가 설치되어 있지 않습니다.', 'That database driver is not installed.')
        : report.error === 'tls-unsupported' ? L('DB 서버가 TLS를 지원하지 않습니다. 서버에서 TLS를 켜세요. 꼭 필요하면 "TLS로 암호화해 연결"을 끌 수 있습니다.', 'The database server does not support TLS. Turn TLS on at the server; only if you must, turn off "Encrypt the connection with TLS".')
        : report.error === 'tls-required' ? L('DB 서버가 암호화된 연결만 받습니다. "TLS로 암호화해 연결"을 켜세요.', 'The server accepts encrypted connections only. Turn on "Encrypt the connection with TLS".')
        : report.error === 'tls-certificate' ? L('서버 인증서를 확인하지 못했습니다. 자체 서명 인증서라면 "서버 인증서 확인"을 끄세요.', "The server's certificate could not be verified. For a self-signed one, turn off \"Verify the server's certificate\".")
        : report.error === 'key-invalid' ? L('암호화 키 형식이 맞지 않습니다 (32바이트 base64 또는 hex).', 'The encryption key is not valid (32 bytes, base64 or hex).')
          : L('연결하지 못했습니다.', 'Could not connect.');
    rows.push(line(report.error === 'database-missing' ? null : false, why));
    if (report.detail) rows.push(line(false, report.detail));
  } else {
    rows.push(line(true, L(`연결했습니다 (${report.ms} ms).`, `Connected (${report.ms} ms).`)));
    if (report.engine !== 'sqlite') {
      if (report.tls?.on) rows.push(line(true, L(`연결이 TLS로 암호화되어 있습니다${report.tls.cipher ? ` (${report.tls.cipher})` : ''}.`, `The connection is encrypted with TLS${report.tls.cipher ? ` (${report.tls.cipher})` : ''}.`)));
      else if (report.tls) rows.push(line(false, L('연결이 암호화되어 있지 않습니다. 서버에서 TLS를 켜고 "TLS로 암호화해 연결"을 켜세요.', 'The connection is not encrypted. Turn TLS on at the server and turn on "Encrypt the connection with TLS".')));
      else rows.push(line(null, L('연결 암호화 여부를 서버가 알려주지 않았습니다.', 'The server did not say whether the connection is encrypted.')));
    }
    const schema = report.schema || {};
    if (schema.newer) rows.push(line(false, L(`이 프로그램보다 새 스키마입니다 (버전 ${schema.version}). 프로그램을 업데이트하세요.`, `The schema is newer than this program (version ${schema.version}). Update the program.`)));
    else if (schema.ready) rows.push(line(true, L(`스키마가 최신입니다 (버전 ${schema.version}).`, `The schema is up to date (version ${schema.version}).`)));
    else if ((schema.missing || []).length) rows.push(line(null, L(`표가 ${schema.missing.length}개 없습니다. 연결하면 자동으로 만듭니다.`, `${schema.missing.length} tables are missing. Connecting creates them.`)));
    else rows.push(line(null, L(`스키마를 버전 ${schema.expected}(으)로 올려야 합니다. 연결하면 자동으로 올립니다.`, `The schema needs version ${schema.expected}. Connecting upgrades it.`)));
    const state = KEY_STATES[report.key?.state];
    if (state) rows.push(line(report.key.state === 'mismatch' ? false : true, `${L(state[0], state[1])} · ${L('키 지문', 'Key fingerprint')} ${report.key.fingerprint}`));
    if (report.current) rows.push(line(true, L('지금 쓰고 있는 데이터베이스입니다.', 'This is the database in use now.')));
  }
  return `<div class="db-test" role="status"><b>${icon('bolt')}${L('연결 시험 결과', 'Connection test')}</b><ul>${rows.join('')}</ul></div>`;
}

/** The key the stored data is encrypted with: its fingerprint, and for the administrator the key itself to carry to another data service. */
function encryptionPanel(ctx) {
  const ui = ctx.ui || {};
  const info = ui.status?.encryption;
  if (!info) return '';
  const admin = isWorkspaceAdmin(ctx.user);
  const shown = ui.encryptionKey
    ? `<div class="key-reveal"><code>${esc(ui.encryptionKey)}</code><button type="button" class="button" data-action="copy-encryption-key">${icon('copy')}<span>${L('복사', 'Copy')}</span></button><button type="button" class="button" data-action="hide-encryption-key">${icon('eye')}<span>${L('숨기기', 'Hide')}</span></button></div>`
    : '';
  return `<section class="panel-card encryption-card">
    <header><b>${icon('lock')}${L('저장 데이터 암호화', 'Encryption at rest')}</b><span class="schema-badge ok">${icon('check')}${esc(info.algorithm)}</span></header>
    <p>${L('과제, 문서, 페이지, 대화, 메일, 사람 정보는 데이터베이스에 넣기 전에 암호화합니다. SQLite, MySQL, MariaDB, PostgreSQL, SQL Server 모두 같습니다.', 'Projects, documents, pages, chat, mail and people are encrypted before they reach the database — the same for SQLite, MySQL, MariaDB, PostgreSQL and SQL Server.')}</p>
    <p class="muted">${icon('key')}<span>${L('키 지문', 'Key fingerprint')}: <code>${esc(info.fingerprint)}</code></span></p>
    <p class="muted">${L('데이터베이스를 별도 서버에 두고 데이터 서비스를 다시 설치하거나 하나 더 둘 때는, 이 키를 그 데이터 서비스의 "암호화 키"에 넣습니다. 키를 잃으면 데이터를 읽을 수 없으니 안전한 곳에 보관하세요.', 'When the database is on its own server and a data service is reinstalled or added, put this key in that service\'s "Encryption key". Without the key the data cannot be read, so keep it somewhere safe.')}</p>
    ${admin ? (shown || `<button type="button" class="button" data-action="show-encryption-key">${icon('key')}<span>${L('키 보기', 'Show the key')}</span></button>`) : ''}
  </section>`;
}

/** SQLite file and the server connection. Shown from Settings. */
export function databaseSettings(ctx) {
  const ui = ctx.ui || {};
  const status = ui.status;
  const saved = status?.saved;
  const draft = ui.dbDraft || {};
  const pick = (key, fallback) => (draft[key] != null ? draft[key] : fallback);
  const chosen = pick('engine', saved?.engine);
  const tlsOn = pick('tls', saved?.tls !== false);
  const tlsVerify = pick('tlsVerify', Boolean(saved?.tlsVerify));
  const engines = ENGINES.map((engine) => `<option value="${engine.id}" ${chosen === engine.id ? 'selected' : ''}>${esc(L(engine.ko, engine.en))}${engine.port ? ` · ${engine.port}` : ''}</option>`).join('');
  const error = ui.startError ? `<p class="danger-text">${esc(ui.startError)}</p>` : '';
  const offline = status?.listening === false ? `<p class="danger-text">${L('데이터 서비스에 연결하지 못했습니다. 주소와 실행 여부를 확인하세요.', 'The data service did not answer. Check the address and that it is running.')}</p>` : '';
  return `<section><h2>${icon('database')}<span>${L('데이터베이스', 'Database')}</span></h2>
    <p class="muted">${L('이 저장소에 회사의 모든 과제가 있습니다.', 'Every project in this company is kept in this store.')}</p>
    ${offline}${error}<div class="start-grid">
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
        <label class="form-row"><span>${L('호스트', 'Host')}</span><input name="host" value="${esc(pick('host', saved?.host || '127.0.0.1'))}"></label>
        <label class="form-row"><span>${L('포트', 'Port')}</span><input name="port" value="${esc(pick('port', saved?.port || ''))}" placeholder="${esc(String(engineById(chosen)?.port || 3306))}"></label>
        <label class="form-row"><span>${L('데이터베이스', 'Database')}</span><input name="database" value="${esc(pick('database', saved?.database || ''))}"></label>
        <label class="form-row"><span>${L('사용자', 'User')}</span><input name="user" value="${esc(pick('user', saved?.user || ''))}" autocomplete="off"></label>
        <label class="form-row"><span>${L('암호', 'Password')}</span><input name="password" type="password" value="${esc(draft.password || '')}" autocomplete="new-password" placeholder="${esc(saved?.user ? L('비우면 저장된 암호', 'Empty keeps the saved one') : '')}"></label>
        <label class="check"><input type="checkbox" name="tls" ${tlsOn ? 'checked' : ''}>${icon('lock')}<span>${L('TLS로 암호화해 연결 (권장)', 'Encrypt the connection with TLS (recommended)')}</span></label>
        <label class="check"><input type="checkbox" name="tlsVerify" ${tlsVerify ? 'checked' : ''}>${icon('check')}<span>${L('서버 인증서 확인 (공인 인증서일 때)', "Verify the server's certificate (when it is publicly signed)")}</span></label>
        <label class="form-row"><span>${L('암호화 키', 'Encryption key')}</span><input name="encryptionKey" type="password" value="${esc(draft.encryptionKey || '')}" autocomplete="off" spellcheck="false" placeholder="${esc(L('다른 데이터 서비스가 쓰던 DB일 때만', 'Only for a database another data service uses'))}"></label>
        <label class="form-row"><span>${L('작업 공간 암호', 'Workspace password')}</span><input name="unlock" type="password" placeholder="${esc(L('사람마다 암호가 있을 때만', 'Only when a person has a password'))}"></label>
        <label class="check"><input type="checkbox" name="createDatabase" checked>${icon('plus')}<span>${L('없으면 데이터베이스 만들기', 'Create the database if it is missing')}</span></label>
        <p class="muted">${L('연결하면 필요한 표를 만들고 스키마를 최신 버전으로 올립니다. 계정에 만들기 권한이 없으면 SQL 스크립트를 DBA에게 전달하세요.', 'Connecting creates the tables it needs and brings the schema up to date. If the account may not create tables, give the SQL script to your DBA.')}</p>
        <div class="page-actions">
          <button type="submit" class="button primary" ${ui.connecting ? 'disabled' : ''}>${icon('link')}<span>${L('연결', 'Connect')}</span></button>
          <button type="button" class="button" data-action="test-connection" ${ui.dbTesting ? 'disabled' : ''}>${icon(ui.dbTesting ? 'clock' : 'bolt')}<span>${ui.dbTesting ? L('시험 중…', 'Testing…') : L('연결 시험', 'Test connection')}</span></button>
          <button type="button" class="button" data-action="schema-sql">${icon('code')}<span>${L('SQL 스크립트', 'SQL script')}</span></button>
        </div>
        ${testReport(ui.dbTest)}
      </form>
      ${encryptionPanel(ctx)}
      ${schemaPanel(ctx)}
    </div></section>`;
}

/** The title section's account part: Sign in (opens the sign-in window), or who is signed in and Sign out. */
function heroAccount(ctx) {
  const ui = ctx.ui || {};
  if (!ui.loginUser) {
    return `<button type="button" class="button big hero-login" data-action="open-login" ${ui.connecting ? 'disabled' : ''}>${icon('login')}<span>${L('로그인', 'Sign in')}</span></button>`;
  }
  const who = ctx.user?.name || ui.loginAccount || '';
  return `<span class="hero-account" title="${esc(L('로그인한 사람', 'Signed in'))}">${icon('idCard')}<b>${esc(who)}</b></span>
    <button type="button" class="button big" data-action="sign-out">${icon('logout')}<span>${L('로그아웃', 'Sign out')}</span></button>`;
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
    const parent = project.parentKey ? `${project.parentKey} · ` : '';
    return `<button type="button" class="start-tile" data-action="open-project" data-id="${esc(project.id)}" ${ui.connecting ? 'disabled' : ''}><span class="start-tile-icon">${icon(kind[2])}</span><b>${esc(project.name)}</b><small>${esc(parent)}${esc(project.key)} · ${esc(L(kind[0], kind[1]))} · ${esc(state)}</small></button>`;
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
    ui.loginUser ? tile('connect-local', 'play', L('들어가기', 'Enter'), L('이 컴퓨터의 SQLite 파일로 들어갑니다.', 'Enter the SQLite file on this computer.')) : tile('shuffle-background', 'spark', L('다른 배경', 'Another background'), L('시작 화면 배경을 무작위로 바꿉니다.', 'Pick a random start page background.')),
    tile('show-welcome', 'spark', L('시작 안내 창', 'Welcome window'), L('처음 안내와 튜토리얼 시작을 다시 봅니다.', 'See the first-run welcome again.')),
    tile('shortcuts', 'key', L('단축키', 'Shortcuts'), L('자주 쓰는 키를 한눈에 봅니다.', 'Every keyboard shortcut at a glance.')),
    tile('language', 'globe', L('English', '한국어'), L('화면 언어를 영어로 바꿉니다.', 'Show the program in Korean.')),
    tile('about', 'info', L('프로그램 정보', 'About'), L('버전과 빌드 정보를 봅니다.', 'Version and build details.')),
  ].join('');
  return `<div class="start-page" data-tab="${esc(tab)}">
    <canvas class="start-bg" aria-hidden="true"></canvas>
    <div class="start-scroll">
      <div class="start-inner">
        <div class="start-tools">
          <label class="start-btn start-startup" title="${esc(L('프로그램을 열면 이 시작 화면을 먼저 보여 줍니다', 'Show this start page when the program opens'))}"><input type="checkbox" data-setting="showStartPage" ${settings.showStartPage !== false ? 'checked' : ''}><span>${L('시작할 때 시작 화면 표시', 'Show the start page at launch')}</span></label>
          <button type="button" class="start-btn" data-action="start-menu" data-id="start-settings" aria-haspopup="true" title="${esc(L('시작 화면에 보일 카드와 안내 창을 고릅니다', 'Choose the cards and the welcome window of the start page'))}">${icon('settings')}<span>${L('시작 화면 설정', 'Start page settings')}</span>${icon('chevronDown')}</button>
          <button type="button" class="start-btn" data-action="start-arrange" title="${esc(L('카드를 빈틈없이 다시 놓습니다', 'Lay the cards out again without gaps'))}">${icon('columns')}<span>${L('자동 정렬', 'Auto arrange')}</span></button>
        </div>
        <section class="start-card start-hero">
          <img class="start-icon" src="./icon.png" alt="">
          <div class="start-hero-text">
            <h1>MyWorkForce <small>v${esc(ctx.version || '1.0.0')}</small></h1>
            <p>${L('튜토리얼로 둘러보거나, 설명서를 읽거나, 예제를 열어 시작합니다.', 'Start with the tutorial, the user guide, or an example.')}</p>
          </div>
          <div class="start-hero-actions">
            ${heroAccount(ctx)}
            <button type="button" class="button big" data-action="open-guide" data-id="guide">${icon('book')}<span>${L('사용 설명서', 'User guide')}</span></button>
            <button type="button" class="button big" data-action="open-guide" data-id="tutorial">${icon('file')}<span>${L('튜토리얼 문서', 'Tutorial document')}</span></button>
            <button type="button" class="button big" data-action="start-menu" data-id="start-help" aria-haspopup="true" title="${esc(L('도움말: 시작 안내 창, 튜토리얼, 튜토리얼 문서, 사용 설명서, WQL 설명서, 단축키, 프로그램 정보', 'Help: welcome window, tutorial, tutorial document, user guide, WQL guide, shortcuts, about'))}">${icon('help')}<span>${L('도움말', 'Help')}</span>${icon('chevronDown')}</button>
            <button type="button" class="button big primary" data-action="start-tutorial" ${ui.connecting ? 'disabled' : ''}>${icon('play')}<span>${L('튜토리얼 시작', 'Start the tutorial')}</span></button>
          </div>
        </section>
        ${offline}${error}
        <div class="start-board">
        ${card('actions', 'spark', L('시작', 'Start'), `<div class="sample-tiles">${actions}</div>`)}
        ${settings.startShowProjects === false ? '' : card('projects', 'folder', L('과제', 'Projects'), projectTiles ? `<div class="sample-tiles">${projectTiles}</div>` : `<p class="muted">${L('만들어진 과제가 없습니다.', 'There are no projects yet.')}</p>`, '', `<span class="sample-count">${projects.length}</span>`)}
        ${settings.startShowExamples === false ? '' : card('examples', 'box', L('예제', 'Examples'), `<p>${L('카드를 누르면 그 작업 공간으로 바뀝니다. 이미 과제가 있으면 먼저 확인합니다.', 'A card replaces the workspace with that example. If you already have projects, it asks first.')}</p><label class="start-find"><span>${L('찾기', 'Find')}</span><input id="example-filter" value="${esc(ui.exampleFilter || '')}" placeholder="${esc(L('이름, 키, 설명', 'Name, key, or description'))}" autocomplete="off"></label><div class="sample-groups">${groups || `<p class="muted">${L('찾는 예제가 없습니다.', 'No example matches.')}</p>`}</div>`, show('examples'), `<span class="sample-count">${EXAMPLES.length}</span>`)}
        ${settings.startShowBackground === false ? '' : card('background', 'spark', L('배경', 'Background'), background, '', `<span class="sample-count">${BACKGROUNDS.length}</span>`)}
        </div>
        <footer class="start-foot">${icon('info')}<span class="grow">MyWorkForce v${esc(ctx.version || '1.0.0')}</span><span class="muted">© SHKWON (knix008@naver.com)</span></footer>
      </div>
    </div>
  </div>`;
}
