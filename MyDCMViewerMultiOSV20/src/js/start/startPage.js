// Start page: a moving 3D picture (medical scenes, startbg.js) behind a board of translucent
// cards. Cards sit in three columns, each with a drag handle and a resize corner, and a card's
// sections are separated and laid out across the card. Same board as MyUMLMakerMultiOSV10.
//
//   window.StartPage.mount(host, api)   api: { t, lang(), settings(), recent(), icon(name),
//                                              onAction(id), onSettings(patch) }
//   → { show(), hide(), refresh(), visible }
import { StartBackground } from './startbg.js';
import { startBoard } from './startboard.js';
import { CHANNEL_MAX, START_SCENE_IDS, START_SPEED_CHANNELS, startSceneId } from './startscenes.js';
import { SCENE_ICONS, SCENE_NAMES } from './sceneNames.js';
import { START_SAMPLES } from './sampleList.js';

const GRIP = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="20" cy="20" r="2"/><circle cx="14" cy="20" r="2"/><circle cx="20" cy="14" r="2"/><circle cx="8" cy="20" r="2"/><circle cx="14" cy="14" r="2"/><circle cx="20" cy="8" r="2"/></svg>';
const SAMPLE_GROUPS = [
  { id: 'image', icon: 'image', label: 'start.group.image', ids: ['ct', 'series', 'mrbrain', 'emri', 'echo', 'xa', 'cr', 'mr2', 'us', 'ect'] },
  { id: 'colour', icon: 'palette', label: 'start.group.colour', ids: ['overlay', 'palette', 'mlut', 'rtdose'] },
  { id: 'doc', icon: 'report', label: 'start.group.doc', ids: ['rtstruct', 'rtplan', 'sr', 'ecg', 'dicomdir'] },
  { id: 'video', icon: 'cine', label: 'start.group.video', ids: ['video', 'video-hevc', 'video-mpeg2'] },
];

export const TIP_COUNT = 8;
export const SPEED_DEFAULTS = { transparency: 80, motion: 20, cameraSpeed: 100, objectSpeed: 100, skySpeed: 100 };
// [action id, icon, label key, text key, primary]
export const BEGIN = [
  ['tour', 'tutorial', 'start.tutorial', 'start.tutorialText', false],
  ['help-window', 'help', 'help.window', 'start.helpText', false],
  ['open-file', 'open', 'file.open', 'start.openText', true],
  ['open-folder', 'folder-open', 'file.openFolder', 'start.folderText', false],
  ['open-dicomdir', 'dicomdir', 'start.dicomdir', 'start.dicomdirText', false],
  ['batch', 'batch', 'file.batch', 'start.batchText', false],
  ['settings', 'settings', 'view.settings', 'start.settingsText', false],
  ['shortcuts', 'keyboard', 'help.shortcuts', 'start.shortcutsText', false],
];

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const base = (p) => { const parts = String(p).split(/[\\/]/).filter(Boolean); return parts[parts.length - 1] || p; };

export function screenOf(settings) {
  return settings && settings.startScreen && typeof settings.startScreen === 'object' ? settings.startScreen : {};
}
function percent(value, fallback, max) {
  if (value == null || value === '') return fallback;
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.max(0, Math.min(max, n)) : fallback;
}

function mount(host, api) {
  const { t } = api;
  let bg = null;
  let board = null;
  let visible = false;
  let tipOpen = false;
  const screen = () => screenOf(api.settings());

  host.classList.add('start-page');
  host.innerHTML = '<div class="start-bg"></div><div class="start-scroll"><div class="start"></div></div>';
  const bgHost = host.querySelector('.start-bg');
  const root = host.querySelector('.start');

  function card(cls, attrs, icon, title, text) {
    return `<button type="button" class="${cls}" ${attrs} title="${esc(title)}"><span class="${cls === 'task-card' ? 'task' : 'action'}-icon">${api.icon(icon)}</span><span class="${cls === 'task-card' ? 'task' : 'action'}-text"><b>${esc(title)}</b><small>${esc(text)}</small></span></button>`;
  }

  function speedRows() {
    const s = screen();
    const rows = [
      ['transparency', t('start.transparency'), percent(s.transparency, 80, 100), 100, 5],
      ['motion', t('start.motion'), percent(s.motion, 20, 100), 100, 5],
      ...START_SPEED_CHANNELS.map((ch) => [ch.key, t(`start.speed.${ch.id}`), percent(s[ch.key], 100, CHANNEL_MAX), CHANNEL_MAX, 10]),
    ];
    return rows.map(([key, label, value, max, step]) => `<div class="start-speed" data-speed="${key}" data-max="${max}" data-step="${step}" data-value="${value}">
      <span class="start-speed-label">${esc(label)}</span>
      <div class="start-speed-control">
        <button type="button" class="start-speed-step" data-dir="-1" title="${esc(t('start.speedDown'))}"${value <= 0 ? ' disabled' : ''}>−</button>
        <div class="start-speed-track" role="slider" tabindex="0" aria-label="${esc(label)}" aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="${value}">
          <span class="start-speed-fill" style="width:${(value / max) * 100}%"></span><span class="start-speed-thumb" style="left:${(value / max) * 100}%"></span><span class="start-speed-value">${value}%</span>
        </div>
        <button type="button" class="start-speed-step" data-dir="1" title="${esc(t('start.speedUp'))}"${value >= max ? ' disabled' : ''}>+</button>
      </div></div>`).join('');
  }

  function handleBtn(id) {
    const label = t('start.moveCard');
    return `<button type="button" class="card-handle" data-card-handle="${id}" title="${esc(label)}" aria-label="${esc(label)}">${api.icon('move')}</button>`;
  }
  function cardShell(id, glyph, title, body, { bare = false, extra = '' } = {}) {
    const resize = `<span class="card-resize" data-card-resize="${id}" title="${esc(t('start.resizeCard'))}" aria-label="${esc(t('start.resizeCard'))}">${GRIP}</span>`;
    const head = bare
      ? `<span class="card-handle-float">${handleBtn(id)}</span>`
      : `<h2>${handleBtn(id)}${glyph ? api.icon(glyph) : ''}<span class="start-card-title">${esc(title)}</span><span class="grow"></span>${extra}</h2>`;
    return `<section class="start-card${bare ? ' bare' : ''}" data-card="${id}" aria-label="${esc(title || id)}">${head}<div class="card-body">${body}</div>${resize}</section>`;
  }
  function sampleGroups(lang) {
    const placed = new Set();
    const groups = SAMPLE_GROUPS.map((g) => {
      const items = START_SAMPLES.filter((s) => g.ids.includes(s.id));
      items.forEach((s) => placed.add(s.id));
      return { ...g, items };
    }).filter((g) => g.items.length);
    const rest = START_SAMPLES.filter((s) => !placed.has(s.id));
    if (rest.length) groups.push({ id: 'other', icon: 'samples', label: 'start.samples', items: rest });
    return `<div class="sample-groups">${groups.map((g) => `<section class="sample-group" data-sample-group="${g.id}">
      <h3>${api.icon(g.icon)}<span>${esc(t(g.label))}</span><span class="sample-count">${g.items.length}</span></h3>
      <div class="sample-tiles">${g.items.map((s) => card('task-card', `data-sample="${s.id}"`, `sample-${s.icon}`, s[lang][0], s[lang][1])).join('')}</div>
    </section>`).join('')}</div>`;
  }

  function render() {
    if (board) { board.destroy(); board = null; }
    const lang = api.lang() === 'ko' ? 'ko' : 'en';
    const settings = api.settings();
    const scene = startSceneId(screen().scene);
    const { files, folders } = api.recent();
    const tip = Math.floor(Date.now() / 86400000) % TIP_COUNT;
    const info = api.info ? api.info() : {};
    const recentList = (items, attr, icon) => (items.length
      ? `<ul class="recent-list">${items.map((p) => `<li class="recent-item" ${attr}="${esc(p)}" title="${esc(p)}">${api.icon(icon)}<span class="recent-name">${esc(attr === 'data-recent-file' ? base(p) : p)}</span></li>`).join('')}</ul>`
      : `<p class="start-muted">${esc(t('start.noRecent'))}</p>`);
    const hero = `<span class="start-logo"><img src="assets/icon.png" alt="" width="42" height="42"></span><div class="start-hero-text"><h1>MyDCMViewer${info.version ? ` V${esc(info.version)}` : ''}</h1><p>${esc(t('start.lead'))}</p></div>`;
    const actions = `<div class="start-actions">${BEGIN.map(([id, icon, label, text, primary]) => card('action-card', `id="start-${id}" data-start="${id}"${primary ? ' data-primary=""' : ''}`, icon, t(label), t(text))).join('')}</div>`;
    const recent = `<h3 class="start-sub">${api.icon('history')}<span>${esc(t('start.recentFiles'))}</span></h3>${recentList(files.slice(0, 8), 'data-recent-file', 'file')}
      <h3 class="start-sub">${api.icon('folder')}<span>${esc(t('file.recent'))}</span></h3>${recentList(folders.slice(0, 6), 'data-recent-folder', 'folder')}
      <div class="start-tip"><button type="button" class="start-tip-toggle" aria-expanded="${tipOpen}">${api.icon('idea')}<span class="start-tip-text"><b>${esc(t('start.tip'))} </b>${esc(t(`start.tip${tip}`))}</span><span class="start-tip-more-label">${esc(t(tipOpen ? 'start.tipLess' : 'start.tipMore'))}</span></button>${tipOpen ? `<p class="start-tip-more">${esc(t(`start.tip${tip}More`))}</p>` : ''}</div>`;
    const scenes = `<div class="start-scenes">${START_SCENE_IDS.map((id) => `<button type="button" class="start-scene${scene === id ? ' on' : ''}" data-scene="${id}" aria-pressed="${scene === id}" title="${esc(SCENE_NAMES[id][lang])}">${SCENE_ICONS[id] || ''}<span>${esc(SCENE_NAMES[id][lang])}</span></button>`).join('')}</div>
      <h3 class="start-sub">${api.icon('settings')}<span>${esc(t('start.speedSection'))}</span></h3>
      <div class="start-speeds"><div class="start-speed-list">${speedRows()}</div><button type="button" class="start-speed-reset">${esc(t('start.speedReset'))}</button></div>`;
    root.innerHTML = `
      <div class="start-inner">
        <div class="start-tools">
          <label class="start-tool start-startup"><input type="checkbox" id="startAlways"${settings.showStartOnLaunch !== false ? ' checked' : ''}><span>${esc(t('start.always'))}</span></label>
          <button type="button" class="start-tool" data-arrange title="${esc(t('start.arrangeTip'))}">${api.icon('layers')}<span>${esc(t('start.arrange'))}</span></button>
        </div>
        <div class="start-board">
          ${cardShell('hero', '', 'MyDCMViewer', hero, { bare: true })}
          ${cardShell('actions', 'play', t('start.begin'), actions)}
          ${cardShell('recent', 'history', t('start.recentFiles'), recent)}
          ${cardShell('samples', 'samples', t('start.samples'), sampleGroups(lang), { extra: `<span class="start-card-note">${esc(t('start.samplesHint', { n: START_SAMPLES.length }))}</span>` })}
          ${cardShell('background', 'image', t('start.background'), scenes)}
        </div>
      </div>`;
    const host = root.querySelector('.start-board');
    board = startBoard(host, {
      saved: settings.startLayout,
      reduced: !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches),
      onSave: (layout) => api.onSettings({ startLayout: layout }),
    });
  }

  function setScreen(patch) {
    api.onSettings({ startScreen: { ...screen(), ...patch } });
    const list = root.querySelector('.start-speed-list');
    if (list) list.innerHTML = speedRows();
    root.querySelectorAll('.start-scene').forEach((b) => { const on = b.dataset.scene === startSceneId(screen().scene); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    if (bg) bg.refresh();
  }

  root.addEventListener('click', (e) => {
    const el = e.target.closest('[data-arrange],[data-start],[data-sample],[data-recent-file],[data-recent-folder],[data-scene],.start-speed-step,.start-speed-reset,.start-tip-toggle');
    if (!el) return;
    if (el.hasAttribute('data-arrange')) { if (board) board.arrange(); }
    else if (el.dataset.start) api.onAction(el.dataset.start);
    else if (el.dataset.sample) api.onAction(`sample:${el.dataset.sample}`);
    else if (el.dataset.recentFile) api.onAction(`recent-file:${el.dataset.recentFile}`);
    else if (el.dataset.recentFolder) api.onAction(`recent-folder:${el.dataset.recentFolder}`);
    else if (el.dataset.scene) setScreen({ scene: el.dataset.scene });
    else if (el.classList.contains('start-speed-reset')) setScreen({ ...SPEED_DEFAULTS });
    else if (el.classList.contains('start-tip-toggle')) { tipOpen = !tipOpen; render(); }
    else {
      const row = el.closest('.start-speed');
      const v = Math.max(0, Math.min(+row.dataset.max, +row.dataset.value + (+el.dataset.dir) * +row.dataset.step));
      setScreen({ [row.dataset.speed]: v });
    }
  });
  root.addEventListener('change', (e) => { if (e.target.id === 'startAlways') api.onSettings({ showStartOnLaunch: e.target.checked }); });
  // slider tracks: drag or arrow keys
  const fromTrack = (track, clientX) => {
    const row = track.closest('.start-speed');
    const r = track.getBoundingClientRect();
    const max = +row.dataset.max, step = +row.dataset.step;
    const raw = Math.max(0, Math.min(1, (clientX - r.left) / (r.width || 1))) * max;
    setScreen({ [row.dataset.speed]: Math.round(raw / step) * step });
  };
  root.addEventListener('pointerdown', (e) => {
    const track = e.target.closest('.start-speed-track');
    if (!track) return;
    const key = track.closest('.start-speed').dataset.speed;
    fromTrack(track, e.clientX);
    const move = (ev) => { const now = root.querySelector(`.start-speed[data-speed="${key}"] .start-speed-track`); if (now) fromTrack(now, ev.clientX); };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });
  root.addEventListener('keydown', (e) => {
    const track = e.target.closest('.start-speed-track');
    if (!track) return;
    const row = track.closest('.start-speed');
    const max = +row.dataset.max, step = +row.dataset.step, v = +row.dataset.value;
    const next = { ArrowLeft: v - step, ArrowDown: v - step, ArrowRight: v + step, ArrowUp: v + step, Home: 0, End: max }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    const key = row.dataset.speed;
    setScreen({ [key]: Math.max(0, Math.min(max, next)) });
    const again = root.querySelector(`.start-speed[data-speed="${key}"] .start-speed-track`);
    if (again) again.focus();
  });

  return {
    get visible() { return visible; },
    show() {
      render();
      host.hidden = false;
      visible = true;
      document.body.classList.add('start-open');
      if (!bg) bg = new StartBackground(bgHost, () => screen());
      bg.show();
    },
    hide() {
      if (!visible) return;
      visible = false;
      host.hidden = true;
      document.body.classList.remove('start-open');
      if (bg) bg.hide();
    },
    refresh() { if (visible) { render(); if (bg) bg.refresh(); } },
  };
}

// SCENES / SPEED_DEFAULTS: the background choices for Settings › Start screen (the popup has no modules)
window.StartPage = { mount, SAMPLES: START_SAMPLES, BEGIN, TIP_COUNT, SPEED_DEFAULTS, SCENES: START_SCENE_IDS.map((id) => ({ id, ...SCENE_NAMES[id] })) };
