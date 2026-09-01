// app.js — UI controller. Renders buttons from config, drives the device
// client, records results and exports CSV. Runs unchanged in Electron and Web.

import { DeviceClient, interpretResponse, ledColorCommand, isElectron } from './core/deviceClient.js';
import { ResultStore } from './core/store.js';

const $ = (sel) => document.querySelector(sel);

let config = null;
let client = null;
let store = null;

/* ---------- config loading (editable buttons.json) ---------- */
async function loadConfig() {
  if (isElectron) {
    try {
      const cfg = await window.vixapi.readConfig();
      if (cfg) return cfg;
    } catch { /* fall through to fetch */ }
  }
  const resp = await fetch('./config/buttons.json');
  return await resp.json();
}

/* ---------- logging ---------- */
function log(msg, cls = '') {
  const el = $('#log');
  const ts = new Date().toTimeString().slice(0, 8);
  const line = document.createElement('span');
  line.className = cls;
  line.textContent = `[${ts}] ${msg}\n`;
  el.appendChild(line);
  el.scrollTop = el.scrollHeight;
}

/* ---------- result box ---------- */
function setResult(state, text) {
  const box = $('#resultBox');
  box.className = `result ${state}`;
  $('#resultText').textContent = text;
}

/* ---------- rendering buttons from config ---------- */
function renderGroups() {
  const host = $('#groups');
  host.innerHTML = '';
  for (const group of config.groups) {
    const fs = document.createElement('fieldset');
    fs.className = 'group';
    const legend = document.createElement('legend');
    legend.textContent = group.title;
    fs.appendChild(legend);

    const grid = document.createElement('div');
    grid.className = 'grid';
    for (const btn of group.buttons) {
      const b = document.createElement('button');
      b.className = 'btn cmd-btn';
      b.dataset.id = btn.id;
      b.innerHTML = `${btn.label}<small>${btn.command}</small>`;
      b.addEventListener('click', () => runCommand(btn, b));
      grid.appendChild(b);
    }
    fs.appendChild(grid);
    host.appendChild(fs);
  }
}

function renderLedColor() {
  const cfg = config.ledColor;
  $('#ledColorTitle').textContent = cfg.title;
  $('#ledColorSet').textContent = cfg.label;
  const host = $('#ledChannels');
  host.innerHTML = '';
  for (const ch of cfg.channels) {
    const label = document.createElement('label');
    label.style.color = ch.color;
    label.innerHTML = `<input type="checkbox" data-ch="${ch.id}" /> ${ch.label}`;
    host.appendChild(label);
  }
  $('#ledColorSet').onclick = runLedColor;
}

function renderDeviceTypes() {
  const sel = $('#deviceType');
  sel.innerHTML = '';
  for (const t of config.connection.deviceTypes) {
    const o = document.createElement('option');
    o.value = t.value; o.textContent = t.label;
    sel.appendChild(o);
  }
}

/* ---------- connection ---------- */
function currentTarget() {
  return {
    ip: $('#ip').value.trim(),
    port: parseInt($('#port').value, 10) || config.connection.defaultPort,
    path: $('#path').value.trim() || config.connection.path,
    timeoutMs: config.connection.timeoutMs
  };
}

function refreshMeta() {
  const t = currentTarget();
  $('#metaTarget').textContent = `https://${t.ip}:${t.port}${t.path}`;
  $('#metaSession').textContent = store?.currentId ?? '-';
}

async function onConnect() {
  const btn = $('#connectBtn');
  client.update(currentTarget());
  refreshMeta();
  btn.disabled = true;
  try {
    log(`연결 시도: ${client.baseUrl}`);
    await client.connect(config.connection.handshake, (m) => log(m));
    setResult('connected', '연결됨');
    btn.classList.add('on');
    btn.textContent = '연결됨';
    log('연결 및 테스트 모드 진입 완료', 'ok');
  } catch (err) {
    client.disconnect();
    setResult('fail', '연결\n안됨');
    btn.classList.remove('on');
    btn.textContent = '연결...';
    log(`연결 실패: ${err.message}`, 'err');
  } finally {
    btn.disabled = false;
  }
}

/* ---------- run a command ---------- */
async function runCommand(btn, el) {
  if (!client.connected) {
    log('먼저 [연결...] 버튼으로 장치에 연결하세요.', 'err');
    setResult('fail', '연결\n안됨');
    return;
  }
  let command = btn.command;
  if (btn.kind === 'write') {
    const value = window.prompt(btn.prompt || '값 입력', '');
    if (value == null) return;
    command = command.replace('{value}', value);
  }
  el?.classList.remove('pass', 'fail');
  const ip = currentTarget().ip;
  try {
    log(`[${btn.label}] 전송: ${command}`);
    const resp = await client.send(command);
    log(`서버 응답: ${resp}`);
    const r = interpretResponse(btn.kind, resp);

    if (btn.column === 'SERIAL' && r.ok && btn.kind === 'read') {
      store.onSerial(r.value, ip);
    }
    await store.record(ip, btn.column, r.value, r.ok ? '' : resp);
    refreshMeta();

    if (r.verdict === 'data') { setResult('data', r.value); el?.classList.add('pass'); }
    else if (r.ok) { setResult('pass', '성공'); el?.classList.add('pass'); log(`[${btn.label}] 성공`, 'ok'); }
    else { setResult('fail', '실패'); el?.classList.add('fail'); log(`[${btn.label}] 실패`, 'err'); }
  } catch (err) {
    setResult('fail', '실패');
    el?.classList.add('fail');
    log(`[${btn.label}] 오류: ${err.message}`, 'err');
    await store.record(ip, btn.column, 'ERROR', err.message);
  }
}

async function runLedColor() {
  if (!client.connected) { log('먼저 장치에 연결하세요.', 'err'); return; }
  const state = {};
  document.querySelectorAll('#ledChannels input[data-ch]').forEach((c) => { state[c.dataset.ch] = c.checked; });
  const command = ledColorCommand(config.ledColor, state);
  const ip = currentTarget().ip;
  try {
    log(`[LED 색상] 전송: ${command}`);
    const resp = await client.send(command);
    log(`서버 응답: ${resp}`);
    const r = interpretResponse('test', resp);
    await store.record(ip, config.ledColor.column, r.ok ? command : resp, r.ok ? '' : resp);
    setResult(r.ok ? 'pass' : 'fail', r.ok ? '성공' : '실패');
  } catch (err) {
    setResult('fail', '실패');
    log(`[LED 색상] 오류: ${err.message}`, 'err');
  }
}

/* ---------- report ---------- */
function openReport() { $('#reportModal').classList.remove('hidden'); }
function closeReport() { $('#reportModal').classList.add('hidden'); }
async function confirmReport() {
  const start = $('#startDate').value || null;
  const end = $('#endDate').value || null;
  try {
    const res = await store.exportCsv(start, end);
    if (res && res.ok) log(`보고서 저장됨: ${res.path} (${res.count ?? ''}건)`, 'ok');
    else if (res && res.canceled) log('보고서 저장이 취소되었습니다.');
    else log('보고서 생성 실패', 'err');
  } catch (err) {
    log(`보고서 오류: ${err.message}`, 'err');
  }
  closeReport();
}

/* ---------- init ---------- */
async function init() {
  config = await loadConfig();

  // seed inputs from config
  $('#appTitle').textContent = config.app.title;
  $('#appSubtitle').textContent = `${config.app.subtitle} · v${config.app.version} · ${isElectron ? 'Desktop' : 'Web'}`;
  document.title = config.app.title;
  $('#ip').value = config.connection.defaultIp;
  $('#port').value = config.connection.defaultPort;
  $('#path').value = config.connection.path;

  client = new DeviceClient(currentTarget());
  store = new ResultStore(config.resultColumns);
  await store.load();

  renderDeviceTypes();
  renderGroups();
  renderLedColor();
  refreshMeta();

  $('#connectBtn').addEventListener('click', onConnect);
  $('#reportBtn').addEventListener('click', openReport);
  $('#reportCancel').addEventListener('click', closeReport);
  $('#reportConfirm').addEventListener('click', confirmReport);
  $('#clearLog').addEventListener('click', () => { $('#log').textContent = ''; });
  ['ip', 'port', 'path'].forEach((id) => $('#' + id).addEventListener('change', () => {
    client.update(currentTarget()); refreshMeta();
  }));

  log(`${config.app.title} 시작 (${isElectron ? 'Electron' : 'Web'})`);
  log(`기본 통신 인터페이스: Ethernet (HTTPS)`);
  log(`기본 대상: ${client.baseUrl}`);
  setResult('ready', '준비');
}

init().catch((e) => {
  document.body.insertAdjacentHTML('beforeend', `<pre style="color:red">초기화 실패: ${e.message}\n${e.stack}</pre>`);
});
