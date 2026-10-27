// The start page in the MyHeatManager layout (its src/ui/startpage.js and
// start.css, ported to React): a full-window animated background behind a
// hero card (icon, name, version, documents, tutorial), a first-run banner
// and a board of movable / resizable cards — 새로 분석 (tiles by category),
// 최근 프로젝트 + 도움말, 배경 (kind, shuffle, speed, transparency) and the
// 샘플·예제 gallery. Background and card layout are kept in
// settings.startBackground (also edited in Settings › 시작 화면).
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { COLS, ROW, GAP, cardsOf, resolve, rowsFor, layoutKey, layoutValue, place, compact, autoArrange, swapVertical } from '../lib/startLayout';
import { dragGhost } from '../lib/dragGhost';
import { tutorialOf } from '../lib/tutorialSettings';
import { call } from '../lib/backend';
import { t, useLanguage } from '../lib/i18n';
import { Icon, CloseButton } from '../components/Chrome';
import { useTabActive } from '../components/DocTabs';
import { Btn, IconSelect, Stepper, RangeStepper, Confirm, emitAction } from './common';
import { openDoc, docExists } from '../lib/docs';
import { SampleArt, projectScene } from '../components/SampleArt';
import { AnimatedBackground, ANIMATION_KINDS, ANIMATION_ICONS, DEFAULT_START_BACKGROUND, themeColors } from '../lib/startBackground';

export function startBackgroundOf(settings) {
  return { ...DEFAULT_START_BACKGROUND, ...((settings && settings.startBackground) || {}) };
}

export function startTutorial() {
  const hook = window.__mcc && window.__mcc.tutorial && window.__mcc.tutorial.start;
  if (typeof hook === 'function') hook();
  else openGuide('tutorial');
}

/** The in-app document window (UserGuide); a browser tab / window without it. */
export function openGuide(id) {
  const fn = window.__mcc && window.__mcc.openGuide;
  if (typeof fn === 'function') fn(id);
  else openDoc(id);
}

const CARD_TOUR = { hero: 'start-hero', banner: 'start-banner', templates: 'start-new', recent: 'start-recent', side: 'start-background', help: 'start-help', samples: 'start-samples' };
export const CARD_IDS = ['hero', 'banner', 'templates', 'recent', 'side', 'help', 'samples'];
export const DEFAULT_SPAN = { hero: 3, banner: 3, templates: 3, recent: 2, side: 1, help: 2, samples: 3 };
const LANG_COLORS = { cpp: '#f34b7d', c: '#a8b9cc', js: '#f1e05a', ts: '#3178c6', java: '#b07219', py: '#3572a5', cs: '#178600', go: '#00add8', rs: '#dea584', rb: '#cc342d', sql: '#e38c00', sh: '#89e051', html: '#e34c26', json: '#8a8a8a', yaml: '#cb171e', tf: '#7b42bc', docker: '#2496ed', kt: '#a97bff', php: '#4f5d95' };

// 새로 분석: [action, icon, name key, description key]
const GROUPS = [
  ['sp_g_basic', [
    ['newProject', 'plus', 'sp_t_new', 'sp_t_new_d'],
    ['openFolder', 'folder', 'sp_t_open', 'sp_t_open_d'],
    ['openSample', 'play', 'sp_t_sample', 'sp_t_sample_d'],
  ]],
  ['sp_g_quality', [
    ['openFolderLang:java', 'code', 'sp_t_java', 'sp_t_java_d'],
    ['openFolderLang:js', 'code', 'sp_t_js', 'sp_t_js_d'],
    ['openFolderLang:py', 'code', 'sp_t_py', 'sp_t_py_d'],
    ['openFolderLang:cs', 'code', 'sp_t_cs', 'sp_t_cs_d'],
  ]],
  ['sp_g_security', [
    ['view:compliance:mois2021', 'lock', 'sp_t_mois', 'sp_t_mois_d'],
    ['view:misra:misraC2012', 'shieldCheck', 'sp_t_misra', 'sp_t_misra_d'],
    ['view:compliance:certC', 'shield', 'sp_t_cert', 'sp_t_cert_d'],
    ['view:misra:misraCpp2023', 'cpu', 'sp_t_autosar', 'sp_t_autosar_d'],
  ]],
  ['sp_g_defects', [
    ['view:defects', 'alert', 'sp_t_cov', 'sp_t_cov_d'],
    ['desktop', 'eye', 'sp_t_desktop', 'sp_t_desktop_d'],
  ]],
  ['sp_g_web', [
    ['view:dast', 'globe', 'sp_t_dast', 'sp_t_dast_d'],
    ['view:dependencies', 'package', 'sp_t_sca', 'sp_t_sca_d'],
  ]],
  ['sp_g_server', [
    ['adminTab:security', 'upload', 'sp_t_server', 'sp_t_server_d'],
    ['adminTab:schedules', 'calendar', 'sp_t_schedule', 'sp_t_schedule_d'],
  ]],
];

// 샘플·예제: the files of samples/demo, one card each (opens the sample at that file).
const SAMPLES = [
  { id: 'all', file: '', lang: 'Demo', color: '#4cc9f0', tags: ['19 files', 'Code quality', 'Defect Analysis'] },
  { id: 'java', file: 'src/App.java', lang: 'Java', color: '#f89820', tags: ['Java', 'OWASP'] },
  { id: 'js', file: 'src/app.js', lang: 'JavaScript', color: '#f7df1e', tags: ['JS', 'XSS'] },
  { id: 'py', file: 'src/app.py', lang: 'Python', color: '#3776ab', tags: ['Python', 'CWE'] },
  { id: 'cs', file: 'src/Program.cs', lang: 'C#', color: '#9b4f96', tags: ['C#', '.NET'] },
  { id: 'c', file: 'src/native.c', lang: 'C', color: '#a8b9cc', tags: ['C', 'MISRA', 'HIS'] },
  { id: 'go', file: 'src/main.go', lang: 'Go', color: '#00add8', tags: ['Go'] },
  { id: 'rs', file: 'src/lib.rs', lang: 'Rust', color: '#dea584', tags: ['Rust', 'unsafe'] },
  { id: 'rb', file: 'src/app.rb', lang: 'Ruby', color: '#cc342d', tags: ['Ruby'] },
  { id: 'sql', file: 'src/query.sql', lang: 'SQL', color: '#e38c00', tags: ['SQL'] },
  { id: 'sh', file: 'src/run.sh', lang: 'Shell', color: '#89e051', tags: ['Shell'] },
  { id: 'html', file: 'web/index.html', lang: 'HTML', color: '#e34c26', tags: ['HTML', 'XSS'] },
  { id: 'docker', file: 'Dockerfile', lang: 'Docker', color: '#2496ed', tags: ['IaC', 'Docker'] },
  { id: 'k8s', file: 'k8s/deploy.yaml', lang: 'Kubernetes', color: '#326ce5', tags: ['IaC', 'YAML'] },
  { id: 'tf', file: 'main.tf', lang: 'Terraform', color: '#7b42bc', tags: ['IaC', 'Terraform'] },
  { id: 'npm', file: 'package.json', lang: 'npm', color: '#cb3837', tags: ['SCA', 'SBOM'] },
  { id: 'dup', file: 'dup/a.js', lang: 'JavaScript', color: '#f7df1e', tags: ['JS', 'Duplication'] },
];

/**
 * All background kinds as equal toggle buttons (icon + short name, the full
 * description on hover) and 섞기 as a toggle at the end: on = a new kind every
 * shuffleSec seconds (20 by default).
 */
export function BgKindGrid({ bg, onChange, columns = 2 }) {
  useLanguage();
  const shuffling = (Number(bg.shuffleSec) || 0) > 0;
  return (
    <div className="bg-kinds" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }} role="radiogroup" aria-label={t('sp_background')}>
      {ANIMATION_KINDS.map((k) => (
        <button key={k} type="button" role="radio" aria-checked={bg.kind === k} className={`bg-kind ${bg.kind === k ? 'on' : ''}`} title={`${t(`anim_${k}`)} — ${t(`anim_${k}_d`)}`} onClick={() => onChange({ kind: k })}>
          <Icon name={ANIMATION_ICONS[k]} size={14} /><span>{t(`anim_${k}`)}</span>
        </button>
      ))}
      <button type="button" role="switch" aria-checked={shuffling} className={`bg-kind shuffle ${shuffling ? 'on' : ''}`} title={t('sp_shuffle_tip', { n: bg.shuffleSec || 20 })}
        onClick={() => onChange({ shuffleSec: shuffling ? 0 : 20 })}>
        <Icon name="dice" size={14} /><span>{t('sp_shuffle')}</span>
      </button>
    </div>
  );
}

export function StartPage({ settings, projects, recent = [], onRecentOpen, onRecentRemove, onRecentClear, onOpen, onSample, onRecent, showOnLaunch, onShowOnLaunch, onBackground }) {
  useLanguage();
  const [preview, setPreview] = useState(null);
  const bg = preview || startBackgroundOf(settings);
  const canvas = useRef(null);
  const anim = useRef(null);
  const speed = useRef(bg.speed);
  speed.current = bg.speed;
  const board = useRef(null);
  const [drag, setDrag] = useState(null);
  const [tutorialDoc, setTutorialDoc] = useState(true);
  const [confirmClear, setConfirmClear] = useState(false);
  const [samples, setSamples] = useState([]);
  const [version, setVersion] = useState('');
  useEffect(() => { call('app.info').then((i) => setVersion((i && i.version) || '')).catch(() => {}); }, []);
  useEffect(() => { call('samples.list').then((list) => setSamples(Array.isArray(list) ? list : [])).catch(() => setSamples([])); }, []);
  // The Home tab hidden behind another tab: the background pauses.
  const tabActive = useTabActive();
  useEffect(() => { if (!anim.current) return; if (tabActive) anim.current.start(); else anim.current.stop(); }, [tabActive]);
  useEffect(() => { docExists('tutorial').then(setTutorialDoc); }, []);

  useEffect(() => {
    const first = bg.random ? ANIMATION_KINDS[Math.floor(Math.random() * ANIMATION_KINDS.length)] : bg.kind;
    const a = new AnimatedBackground(canvas.current, { kind: first, speed: () => (speed.current || 0) / 100, colors: themeColors });
    anim.current = a;
    a.start();
    const observer = new MutationObserver(() => a.refreshColors());
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class', 'data-theme'] });
    return () => { observer.disconnect(); a.destroy(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (anim.current) anim.current.setKind(bg.kind); }, [bg.kind]);
  // 섞기: a different kind every N seconds (0 = off); not saved, the chosen kind stays.
  useEffect(() => {
    const sec = Number(bg.shuffleSec) || 0;
    if (!sec) return undefined;
    const timer = setInterval(() => { if (anim.current) anim.current.shuffle(); }, sec * 1000);
    return () => clearInterval(timer);
  }, [bg.shuffleSec]);
  useEffect(() => { if (anim.current) anim.current.refreshColors(); }, [settings && settings.theme]);
  // Settings › 시작 화면 previews its draft here (null: back to the saved one).
  useEffect(() => {
    const on = (e) => setPreview(e.detail ? { ...DEFAULT_START_BACKGROUND, ...e.detail } : null);
    window.addEventListener('mcc-start-bg-preview', on);
    const onArrange = () => arrangeRef.current();
    window.addEventListener('mcc-start-arrange', onArrange);
    return () => { window.removeEventListener('mcc-start-bg-preview', on); window.removeEventListener('mcc-start-arrange', onArrange); };
  }, []);

  const save = (patch) => onBackground({ ...startBackgroundOf(settings), ...patch });
  // Card layout: explicit cells on a 3-column grid of 20 px rows (lib/startLayout).
  const [measured, setMeasured] = useState({});
  const arrangeRef = useRef(() => {});
  const burst = useRef({ at: 0, n: 0 });
  const visibleIds = CARD_IDS.filter((id) => id !== 'banner' || !tutorialOf(settings).done);
  const saved = cardsOf(bg.layout, visibleIds, DEFAULT_SPAN, measured);
  // While dragging / resizing: where the card would land, and the others pushed down.
  const pending = drag && drag.target ? place(saved, drag.id, drag.target) : null;
  const shown = pending || saved;
  const saveLayout = (cards) => save({ layout: layoutValue(compact(cards)) });
  // 자동 정렬: masonry in reading order at the fit heights (undoable through the history).
  const arrange = () => saveLayout(autoArrange(visibleIds, DEFAULT_SPAN, measured));
  arrangeRef.current = arrange;
  const ghost = useRef(null);
  useEffect(() => () => { if (ghost.current) ghost.current.destroy(); }, []);

  // Fit cards: the height follows the content (measured, in rows).
  const measure = useCallback(() => {
    if (!board.current) return;
    const next = {};
    for (const el of board.current.querySelectorAll(':scope > .start-card.fit')) next[el.dataset.card] = rowsFor(el.offsetHeight);
    // Growing always applies; shrinking by a single row is ignored, so a card
    // whose height depends on its own span (compaction moves it) cannot flip
    // between two heights forever.
    // A run-away (a fit card stretched to its own span grows a row per pass)
    // stops after a burst of updates; the next resize measures again.
    const now = performance.now();
    if (now - burst.current.at > 1000) burst.current = { at: now, n: 0 };
    if (burst.current.n > 12) return;
    setMeasured((m) => {
      const changed = Object.keys(next).filter((k) => m[k] === undefined || next[k] > m[k] || m[k] - next[k] > 1);
      if (!changed.length) return m;
      burst.current.n += 1;
      return { ...m, ...Object.fromEntries(changed.map((k) => [k, next[k]])) };
    });
  }, []);
  useLayoutEffect(() => { measure(); });
  useEffect(() => {
    if (!board.current || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => measure());
    for (const el of board.current.querySelectorAll(':scope > .start-card')) ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  // Other cards slide to their new places (FLIP).
  const rects = useRef(new Map());
  const shownKey = layoutKey(shown);
  useLayoutEffect(() => {
    if (!board.current) return;
    const now = new Map();
    for (const el of board.current.querySelectorAll(':scope > .start-card')) {
      const r = el.getBoundingClientRect();
      now.set(el.dataset.card, r);
      const old = rects.current.get(el.dataset.card);
      if (!old || el.classList.contains('drag-origin') || !el.animate) continue;
      const dx = old.left - r.left;
      const dy = old.top - r.top;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }], { duration: 180, easing: 'ease-out' });
    }
    rects.current = now;
  }, [shownKey]);

  // The cell under the silhouette's top-left corner.
  const cellAt = (x, y, w) => {
    const r = board.current.getBoundingClientRect();
    const colW = (r.width - GAP * (COLS - 1)) / COLS;
    return { col: Math.max(0, Math.min(COLS - w, Math.round((x - r.left) / (colW + GAP)))), row: Math.max(0, Math.round((y - r.top) / ROW)) };
  };
  const autoScroll = (ev) => {
    const sc = board.current && board.current.closest('.start-scroll');
    if (!sc) return;
    const r = sc.getBoundingClientRect();
    if (ev.clientY > r.bottom - 36) sc.scrollTop += 14;
    else if (ev.clientY < r.top + 36) sc.scrollTop -= 14;
  };
  const focusHandle = (id) => setTimeout(() => { const h = board.current && board.current.querySelector(`[data-card="${id}"] .card-handle`); if (h) h.focus(); }, 30);
  // Keyboard on a card's ⠿ handle: Alt+arrows move one cell, Alt+Shift+arrows resize.
  const keyMove = (e, id) => {
    if (!e.altKey || !e.key.startsWith('Arrow')) return;
    e.preventDefault();
    const c = { ...saved[id] };
    const dx = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
    const dy = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
    if (e.shiftKey) {
      c.w = Math.max(1, Math.min(COLS - c.col, c.w + dx));
      if (dy) { c.h = Math.max(4, c.h + dy); c.fit = false; }
    } else if (dy) {
      // A plain move up / down would compact back: swap with the neighbour instead.
      saveLayout(swapVertical(saved, id, dy));
      focusHandle(id);
      return;
    } else {
      c.col = Math.max(0, Math.min(COLS - c.w, c.col + dx));
    }
    saveLayout(place(saved, id, c));
    focusHandle(id);
  };

  const startMove = (e, id) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    const el = e.currentTarget.closest('.start-card');
    const g = dragGhost(el, e, { container: board.current });
    ghost.current = g;
    const c = saved[id];
    setDrag({ id, mode: 'move', target: { col: c.col, row: c.row } });
    let target = { col: c.col, row: c.row };
    const move = (ev) => {
      g.move(ev);
      autoScroll(ev);
      const p = g.topLeft();
      const next = cellAt(p.x, p.y, c.w);
      if (next.col !== target.col || next.row !== target.row) { target = next; setDrag({ id, mode: 'move', target }); }
    };
    const up = (ev) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      g.destroy();
      ghost.current = null;
      setDrag(null);
      if (ev.type === 'pointerup' && (target.col !== c.col || target.row !== c.row)) saveLayout(place(saved, id, target));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };
  const startResize = (e, id) => {
    e.preventDefault();
    e.stopPropagation();
    const card = e.currentTarget.parentElement;
    const rect = card.getBoundingClientRect();
    const b = board.current.getBoundingClientRect();
    const colW = (b.width - GAP * (COLS - 1)) / COLS;
    const c = saved[id];
    let target = { w: c.w, h: c.h };
    setDrag({ id, mode: 'resize', target });
    const move = (ev) => {
      autoScroll(ev);
      const w = Math.max(1, Math.min(COLS - c.col, Math.round((rect.width + ev.clientX - e.clientX + GAP) / (colW + GAP))));
      const h = Math.max(4, Math.round((rect.height + ev.clientY - e.clientY + GAP) / ROW));
      if (w !== target.w || h !== target.h) { target = { w, h }; setDrag({ id, mode: 'resize', target: { ...target, fit: false } }); }
    };
    const up = (ev) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      setDrag(null);
      if (ev.type === 'pointerup' && (target.w !== c.w || target.h !== c.h)) saveLayout(place(saved, id, { ...target, fit: false }));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };
  const fitCard = (id) => saveLayout(place(saved, id, { fit: true }));

  const cell = (c) => ({ gridColumn: `${c.col + 1} / span ${c.w}`, gridRow: `${c.row + 1} / span ${c.h}` });
  const handle = (id) => (
    <button type="button" className="card-handle" title={`${t('sp_move_card')} (Alt+←↑↓→ · Alt+Shift: ${t('sp_resize_card')})`} aria-label={t('sp_move_card')} onPointerDown={(e) => startMove(e, id)}
      onKeyDown={(e) => keyMove(e, id)}>⠿</button>
  );
  const card = (id, cls, icon, title, body, extra, bare) => {
    // The dragged / resized card stays where it was (dimmed while moving) until the drop.
    const mine = drag && drag.id === id;
    const origin = mine && drag.mode === 'move';
    const c = mine ? saved[id] : shown[id];
    const fit = c.fit;
    return (
      <section key={id} data-card={id} data-tour={CARD_TOUR[id]} className={`start-card ${cls} ${bare ? 'bare' : ''} ${fit ? 'fit' : 'fixed-height'} ${origin ? 'drag-origin' : ''} ${drag && drag.id === id && drag.mode === 'resize' ? 'resizing' : ''}`}
        style={{ ...cell(c), height: fit ? undefined : `${c.h * ROW - GAP}px` }}>
        {bare ? <span className="card-handle-float">{handle(id)}</span> : (
          <h2>
            {handle(id)}
            <span className="icon"><Icon name={icon} size={15} /></span><span>{title}</span><span className="grow" />{extra}
          </h2>
        )}
        <div className="card-body">{body}</div>
        <span className="card-resize" title={`${t('sp_resize_card')} (Alt+Shift+←↑↓→)`} onPointerDown={(e) => startResize(e, id)} onDoubleClick={() => fitCard(id)} />
      </section>
    );
  };
  const dropOutline = drag && drag.target ? <div key="drop-outline" className="card-drop-outline" aria-hidden="true" style={{ ...cell(shown[drag.id]), height: `${shown[drag.id].h * ROW - GAP}px` }} /> : null;

  const act = (action) => (action === 'openFolder' ? onOpen() : action === 'openSample' ? onSample() : emitAction(action));
  const sampleProject = projects.find((p) => /[\\/]samples[\\/]demo$/i.test(String(p.path || '')));
  const sampleIssues = (file) => {
    const b = sampleProject && sampleProject.branches && sampleProject.branches[sampleProject.mainBranch || 'main'];
    const issues = (b && b.latest && b.latest.issues) || [];
    return file ? issues.filter((i) => i.file === file).length : issues.length;
  };

  const cards = {
    hero: card('hero', 'start-hero', 'home', '', (
      <>
        <img src="./icon.svg" alt="" className="start-icon" />
        <div>
          <h1>MyCodeChecker {version && <small>v{version}</small>}</h1>
          <p>{t('sp_tagline')}</p>
        </div>
        <div className="start-hero-actions" data-tour="start-hero-docs">
          <div className="start-docs">
            <Btn icon="book" label={t('sp_users_guide')} onClick={() => openGuide('guide')} />
            <Btn icon="report" label={t('sp_tutorial_doc')} title={tutorialDoc ? t('sp_tutorial_doc') : t('doc_not_built')} onClick={() => openGuide('tutorial')} />
          </div>
          <Btn icon="graduation" label={t('sp_tutorial_start')} primary onClick={startTutorial} />
        </div>
      </>
    ), null, true),
    banner: tutorialOf(settings).done ? null : card('banner', 'start-banner', 'lightbulb', '', (
      <>
        <span className="icon"><Icon name="lightbulb" size={16} /></span>
        <span>{t('sp_banner')}</span>
        <button type="button" className="small-button" onClick={startTutorial}><Icon name="play" size={11} /> {t('sp_banner_go')}</button>
      </>
    ), null, true),
    templates: card('templates', 'templates', 'plus', t('sp_new'), (
      <>
        <div className="start-actions start-actions-top" data-tour="start-actions">
          <Btn icon="plus" label={t('pj_menu_new')} onClick={() => emitAction('newProject')} />
          <Btn icon="folder" label={t('pj_menu_open')} onClick={() => emitAction('openProject')} />
          <Btn icon="folder" label={t('sp_open_btn')} onClick={onOpen} />
          <Btn icon="play" label={t('sp_from_sample')} onClick={onSample} />
          <Btn icon="upload" label={t('sp_import')} onClick={() => emitAction('adminTab:external')} />
        </div>
        <div className="template-groups">
          {GROUPS.map(([g, items]) => (
            <div key={g} className="template-group">
              <p className="template-group-title">{t(g)}</p>
              {items.map(([action, icon, name, desc]) => (
                <button key={name} type="button" className="template-tile" title={t(desc)} onClick={() => act(action)}>
                  <span className="icon"><Icon name={icon} size={18} /></span><b>{t(name)}</b><small>{t(desc)}</small>
                </button>
              ))}
            </div>
          ))}
        </div>
      </>
    )),
    recent: card('recent', 'recent', 'history', t('sp_recent'), (
      <div className="start-list">
        {recent.length === 0 && <div className="start-empty"><Icon name="info" size={13} /><span>{t('sp_recent_empty')}</span></div>}
        {recent.slice(0, 10).map((r, i) => {
          const p = r.projectId ? projects.find((x) => x.id === r.projectId) : null;
          const b = p && p.branches && p.branches[p.mainBranch || 'main'];
          const gate = b && b.latest && b.latest.qualityGate ? b.latest.qualityGate.status : '';
          return (
            <div key={`${r.kind}:${r.path}`} className={`start-row ${r.exists === false ? 'missing' : ''}`}>
              <button type="button" className="start-link" disabled={r.exists === false} title={r.exists === false ? `${r.path} — ${t('sp_not_found')}` : r.path} onClick={() => onRecentOpen(r)}>
                <span className="icon">{r.kind === 'file' ? <img src="./project-file.svg" alt="" width={16} height={16} /> : <Icon name="folder" size={15} />}</span>
                <span className="name">{i + 1}. {r.name || r.path.split(/[\\/]/).pop()}</span>
                <span className="path">{r.exists === false ? t('sp_not_found') : r.path}</span>
              </button>
              {gate && <span className={`status-pill tone-${gate === 'OK' ? 'ok' : 'bad'}`}><Icon name={gate === 'OK' ? 'checkCircle' : 'xCircle'} size={11} />{gate === 'OK' ? t('passed') : t('failed')}</span>}
              <CloseButton title={t('sp_recent_remove')} aria-label={t('sp_recent_remove')} onClick={() => onRecentRemove(r.path)} size={13} />
            </div>
          );
        })}
      </div>
    ), recent.length ? <button type="button" className="small-button danger" onClick={() => setConfirmClear(true)}><Icon name="trash" size={12} /> {t('sp_recent_clear')}</button> : null),
    help: card('help', 'help', 'book', t('sp_help'), (
      <div className="start-help">
        {[[startTutorial, 'graduation', 'sp_tutorial_start', false], [() => openGuide('tutorial'), 'report', 'sp_tutorial_doc', false], [() => openGuide('guide'), 'book', 'sp_users_guide', false],
          [() => openDoc('architecture'), 'flow', 'doc_architecture', false], [() => emitAction('shortcuts'), 'key', 'shortcuts', false], [() => emitAction('tools'), 'installBox', 'tl_menu', false]].map(([fn, icon, label, off]) => (
          <button key={label} type="button" className="start-link compact" disabled={off} title={off ? t('doc_not_built') : t(label)} onClick={fn}><span className="icon"><Icon name={icon} size={15} /></span><span className="name">{t(label)}</span><span /></button>
        ))}
      </div>
    )),
    side: card('side', 'side', 'sparkle', t('sp_background'), (
      <>
        <BgKindGrid bg={bg} columns={2} onChange={save} />
        <div className="start-speed"><span className="icon"><Icon name="gauge" size={14} /></span><span>{t('sp_speed')}</span></div>
        <RangeStepper value={bg.speed} min={0} max={300} step={10} unit="%" ariaLabel={t('sp_speed')} onChange={(v) => save({ speed: v })} />
        <div className="start-speed"><span className="icon"><Icon name="eye" size={14} /></span><span>{t('sp_transparency')}</span></div>
        <RangeStepper value={bg.transparency} min={0} max={100} step={5} unit="%" ariaLabel={t('sp_transparency')} onChange={(v) => save({ transparency: v })} />
        <div className="start-speed"><span className="icon"><Icon name="dice" size={14} /></span><span>{t('sp_shuffle_every')}</span><Stepper value={bg.shuffleSec || 0} min={0} max={600} step={5} width={52} ariaLabel={t('sp_shuffle_every')} onChange={(v) => save({ shuffleSec: v })} /><span className="unit">{t('ai_seconds')}</span></div>
        <label className="start-check"><input type="checkbox" checked={!!bg.random} onChange={(e) => save({ random: e.target.checked })} /><span>{t('sp_random')}</span></label>
      </>
    )),
    samples: card('samples', 'start-samples', 'grid', `${t('sp_samples')} (${samples.length + SAMPLES.length})`, (
      <div className="start-sample-grid">
        {samples.map((sm) => {
          const langs = Object.entries(sm.languages || {}).sort((a, b) => b[1] - a[1]);
          const total = langs.reduce((n, [, c]) => n + c, 0) || 1;
          return (
            <button key={`api-${sm.id}`} type="button" className="start-sample project" title={sm.description || sm.title} onClick={() => emitAction(`sampleOpen:${sm.id}`)}>
              <span className="lang-mix" aria-hidden="true">
                <SampleArt scene={projectScene(sm)} color={LANG_COLORS[(langs[0] || [])[0]] || 'var(--accent)'} />
                <span className="lang-bar" title={langs.map(([l, c]) => `${l} ${c}`).join(' · ')}>{langs.map(([l, c]) => <i key={l} style={{ width: `${(c / total) * 100}%`, background: LANG_COLORS[l] || 'var(--accent)' }} />)}</span>
                {sm.projectFile && <img src="./project-file.svg" alt="" width={18} height={18} className="lang-file" />}
              </span>
              <b>{sm.title || sm.id}</b>
              <span className="tags"><span className="tag">{t('sp_s_files', { n: sm.files || 0 })}</span>{langs.slice(0, 2).map(([l]) => <span key={l} className="tag">{l}</span>)}</span>
              <small>{sm.description || t('sp_s_all_d')}</small>
            </button>
          );
        })}
        {SAMPLES.map((s) => (
          <button key={s.id} type="button" className="start-sample" title={t(`sp_s_${s.id}_d`)} onClick={() => (s.file ? emitAction(`sampleFile:${s.file}`) : onSample())}>
            <SampleArt scene={s.id} color={s.color} issues={sampleIssues(s.file)} />
            <b>{t(`sp_s_${s.id}`)}</b>
            <span className="tags">{[s.lang, ...s.tags.filter((x) => x !== s.lang)].slice(0, 3).map((tag) => <span key={tag} className="tag">{tag}</span>)}</span>
            <small>{t(`sp_s_${s.id}_d`)}</small>
          </button>
        ))}
      </div>
    ), <Btn icon="play" label={t('sp_from_sample')} onClick={onSample} />),
  };

  return (
    <div className="start-page" data-tour="start-page">
      <canvas ref={canvas} className="start-bg" aria-hidden="true" style={{ opacity: 1 - (bg.transparency || 0) / 100 }} />
      <div className="start-scroll">
        <div className="start-inner">
          <div className="start-tools"><Btn icon="grid" label={t('sp_auto_arrange')} title={t('sp_auto_arrange_tip')} onClick={arrange} /></div>
          <div className="start-grid start-board" data-tour="start-board" ref={board}>{visibleIds.map((id) => cards[id]).filter(Boolean)}{dropOutline}</div>
          {confirmClear && <Confirm title={t('sp_recent_clear')} body={t('sp_recent_clear_confirm')} okLabel={t('sp_recent_clear')} danger onOk={() => { setConfirmClear(false); onRecentClear(); }} onCancel={() => setConfirmClear(false)} />}
          <footer className="start-foot">
            <label className="start-check" data-tour="start-show"><input type="checkbox" checked={showOnLaunch} onChange={(e) => onShowOnLaunch(e.target.checked)} /><span>{t('sp_show')}</span></label>
            <span className="grow" />
            <span className="muted">© SHKWON (knix008@naver.com)</span>
          </footer>
        </div>
      </div>
    </div>
  );
}
