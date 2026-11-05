// The start page (the sibling apps' layout): a full-window animated
// background behind a hero card (icon, name, version, ▶ start / ■ stop) and a
// board of movable / resizable cards — 서버 상태, 빠른 작업, 공유 폴더, 접속
// 주소, 프로파일, 도움말 and 배경 (kind, shuffle, speed, transparency).
// Background and card layout are kept in session.startBackground; the page
// opens at launch unless "시작할 때 표시" is unticked.
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { COLS, ROW, GAP, cardsOf, rowsFor, layoutKey, layoutValue, place, compact, autoArrange, swapVertical } from '../lib/startLayout';
import { dragGhost } from '../lib/dragGhost';
import { t, useLanguage } from '../lib/i18n';
import { formatSize, formatUptime } from '../lib/format';
import { AnimatedBackground, ANIMATION_KINDS, ANIMATION_ICONS, DEFAULT_START_BACKGROUND, themeColors } from '../lib/startBackground';
import { addressRows } from './AddressesPanel';
import { Icon } from './Icons';
import { NumberField } from './NumberField';

export function startBackgroundOf(session) {
  return { ...DEFAULT_START_BACKGROUND, ...((session && session.startBackground) || {}) };
}

export const CARD_IDS = ['hero', 'status', 'quick', 'addresses', 'shares', 'profiles', 'help', 'side'];
export const DEFAULT_SPAN = { hero: 3, status: 1, quick: 2, shares: 1, addresses: 2, profiles: 1, help: 1, side: 1 };

// 빠른 작업: [action, icon, name key, description key, needs the server stopped]
const GROUPS = [
  ['sp_g_share', [
    ['addShare', 'folderNew', 'sp_t_share', 'sp_t_share_d', true],
    ['addUser', 'userPlus', 'sp_t_user', 'sp_t_user_d', true],
    ['open', 'server', 'sp_t_open', 'sp_t_open_d', false],
  ]],
  ['sp_g_security', [
    ['generateCert', 'shield', 'sp_t_cert', 'sp_t_cert_d', true],
    ['generateHostKey', 'key', 'sp_t_hostkey', 'sp_t_hostkey_d', true],
    ['openKeyFolder', 'folderOpen', 'sp_t_keyfolder', 'sp_t_keyfolder_d', false],
  ]],
  ['sp_g_data', [
    ['saveLog', 'save', 'sp_t_savelog', 'sp_t_savelog_d', false],
    ['copyLog', 'copy', 'sp_t_copylog', 'sp_t_copylog_d', false],
    ['openConfig', 'folder', 'sp_t_config', 'sp_t_config_d', false],
  ]],
];

function Btn({ icon, label, title, onClick, primary, danger, disabled }) {
  return (
    <button type="button" className={`sp-btn ${primary ? 'primary' : ''} ${danger ? 'danger' : ''}`} title={title || label} onClick={onClick} disabled={disabled}>
      {icon && <Icon name={icon} size={15} />}<span>{label}</span>
    </button>
  );
}

function Range({ value, min, max, step, unit, label, onChange }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <div className="sp-range">
      <input type="range" min={min} max={max} step={step} value={draft} aria-label={label}
        onChange={(e) => setDraft(Number(e.target.value))} onPointerUp={() => onChange(draft)} onKeyUp={() => onChange(draft)} onBlur={() => { if (draft !== value) onChange(draft); }} />
      <span className="mono">{draft}{unit}</span>
    </div>
  );
}

/** All background kinds as toggle buttons (icon + name) and 섞기 at the end. */
function BgKindGrid({ bg, onChange }) {
  const shuffling = (Number(bg.shuffleSec) || 0) > 0;
  return (
    <div className="bg-kinds" role="radiogroup" aria-label={t('sp_background')}>
      {ANIMATION_KINDS.map((k) => (
        <button key={k} type="button" role="radio" aria-checked={bg.kind === k} data-kind={k} className={`bg-kind ${bg.kind === k ? 'on' : ''}`} title={`${t(`anim_${k}`)} — ${t(`anim_${k}_d`)}`} onClick={() => onChange({ kind: k })}>
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

export function StartPage({ info, session, settings, server, stats, profiles, profileName, missing, locked, onAction, onLoadProfile, onCopy, onBackground, showOnLaunch, onShowOnLaunch }) {
  useLanguage();
  const bg = startBackgroundOf(session);
  const canvas = useRef(null);
  const anim = useRef(null);
  const speed = useRef(bg.speed);
  speed.current = bg.speed;
  const board = useRef(null);
  const [drag, setDrag] = useState(null);
  const [copied, setCopied] = useState('');
  const [, tick] = useState(0);
  const running = server.running;
  const state = server.starting ? 'starting' : running ? 'running' : 'stopped';

  useEffect(() => {
    if (!server.startedAt) return undefined;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [server.startedAt]);

  useEffect(() => {
    const first = bg.random ? ANIMATION_KINDS[Math.floor(Math.random() * ANIMATION_KINDS.length)] : bg.kind;
    const a = new AnimatedBackground(canvas.current, { kind: first, speed: () => (speed.current || 0) / 100, colors: themeColors });
    anim.current = a;
    a.start();
    window.__mfsStartBg = a;   // smoke: the running engine
    const observer = new MutationObserver(() => a.refreshColors());
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class', 'data-theme'] });
    return () => { observer.disconnect(); a.destroy(); if (window.__mfsStartBg === a) window.__mfsStartBg = null; };
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
  useEffect(() => { if (anim.current) anim.current.refreshColors(); }, [session && session.theme]);

  const save = (patch) => onBackground({ ...startBackgroundOf(session), ...patch });

  // Card layout: explicit cells on a 3-column grid of 20 px rows (lib/startLayout).
  const [measured, setMeasured] = useState({});
  const burst = useRef({ at: 0, n: 0 });
  const saved = cardsOf(bg.layout, CARD_IDS, DEFAULT_SPAN, measured);
  const pending = drag && drag.target ? place(saved, drag.id, drag.target) : null;
  const shown = pending || saved;
  const saveLayout = (cards) => save({ layout: layoutValue(compact(cards)) });
  const arrange = () => saveLayout(autoArrange(CARD_IDS, DEFAULT_SPAN, measured));
  const ghost = useRef(null);
  useEffect(() => () => { if (ghost.current) ghost.current.destroy(); }, []);

  // Fit cards: the height follows the content (measured, in rows).
  const measure = useCallback(() => {
    if (!board.current) return;
    const next = {};
    for (const el of board.current.querySelectorAll(':scope > .start-card.fit')) next[el.dataset.card] = rowsFor(el.offsetHeight);
    // Growing always applies; shrinking by one row is ignored (no flip-flop), and a run-away stops after a burst.
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
    const mine = drag && drag.id === id;
    const origin = mine && drag.mode === 'move';
    const c = mine ? saved[id] : shown[id];
    const fit = c.fit;
    return (
      <section key={id} data-card={id} className={`start-card ${cls} ${bare ? 'bare' : ''} ${fit ? 'fit' : 'fixed-height'} ${origin ? 'drag-origin' : ''} ${mine && drag.mode === 'resize' ? 'resizing' : ''}`}
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

  const copy = (key, text) => { onCopy(text); setCopied(key); setTimeout(() => setCopied(''), 1500); };
  const p = settings.protocols;
  const protoRows = [['FTP', p.enableFtp, p.ftpPort], ['FTPS', p.enableFtps, p.ftpsPort], ['SFTP', p.enableSftp, p.sftpPort]];
  const live = new Set((server.protocols || []).map((x) => String(x.proto).toUpperCase()));
  const hidden = new Set(session.hiddenAddresses || []);
  const urls = addressRows(settings, info.addresses || []).filter((r) => !hidden.has(r.url));
  const version = info.version || (info.buildInfo && info.buildInfo.version) || '';

  const cards = {
    hero: card('hero', 'start-hero', 'home', '', (
      <>
        <img src="./icon.svg" alt="" className="start-icon" />
        <div>
          <h1>My FTP Server {version && <small>v{version}</small>}</h1>
          <p>{t('sp_tagline')}</p>
          <p className={`start-state ${state}`}><span className="sb-dot" />{t(`state_${state}`)}{running && server.startedAt ? ` · ${t('uptime', { time: formatUptime(server.startedAt) })}` : ''}</p>
        </div>
        <div className="start-hero-actions">
          <div className="start-docs">
            <Btn icon="book" label={t('sp_manual')} title={t('sp_manual_tip')} onClick={() => onAction('manual')} />
            <Btn icon="settings" label={t('settings')} title={t('tip_settings')} onClick={() => onAction('settings')} />
            <Btn icon="info" label={t('menu_info')} title={t('tip_about')} onClick={() => onAction('about')} />
            <Btn icon="server" label={t('sp_open_server')} title={t('sp_open_server_tip')} onClick={() => onAction('open')} />
          </div>
          {running || server.starting
            ? <Btn icon="stop" label={t('stop')} title={t('tip_stop')} danger disabled={server.starting} onClick={() => onAction('stop')} />
            : <Btn icon="play" label={t('sp_start_server')} title={t('tip_start')} primary onClick={() => onAction('start')} />}
        </div>
      </>
    ), null, true),
    status: card('status', 'start-status', 'gauge', t('sp_status'), (
      <div className="sp-status">
        {protoRows.map(([name, on, port]) => (
          <div key={name} className={`sp-proto ${on ? 'on' : 'off'} ${live.has(name) ? 'live' : ''}`}>
            <span className={`proto-tag ${name.toLowerCase()}`}>{name}</span>
            <span className="mono">{on ? `:${port}` : '—'}</span>
            <span className="grow" />
            <span className="small">{live.has(name) ? t('sp_listening') : on ? t('sp_ready') : t('sp_off')}</span>
          </div>
        ))}
        <div className="sp-counters">
          <div><b>{stats.clients}</b><small>{t('stat_clients')}</small></div>
          <div><b>{stats.totalClients}</b><small>{t('stat_total')}</small></div>
          <div><b>{stats.uploads}</b><small>{t('stat_up')} · {formatSize(stats.uploadBytes)}</small></div>
          <div><b>{stats.downloads}</b><small>{t('stat_down')} · {formatSize(stats.downloadBytes)}</small></div>
        </div>
      </div>
    )),
    quick: card('quick', 'templates', 'plus', t('sp_quick'), (
      <div className="template-groups">
        {GROUPS.map(([g, items]) => (
          <div key={g} className="template-group">
            <p className="template-group-title">{t(g)}</p>
            {items.map(([action, icon, name, desc, needsStop]) => {
              const off = needsStop && locked;
              return (
                <button key={name} type="button" className="template-tile" data-action={action} title={off ? t('locked_hint') : t(desc)} disabled={off} onClick={() => onAction(action)}>
                  <span className="icon"><Icon name={icon} size={18} /></span><b>{t(name)}</b><small>{t(desc)}</small>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    )),
    shares: card('shares', 'start-shares', 'folder', `${t('sp_shares')} (${settings.sharedFolders.length})`, (
      <div className="start-list">
        {settings.sharedFolders.length === 0 && <div className="start-empty"><Icon name="info" size={13} /><span>{t('sp_shares_empty')}</span></div>}
        {settings.sharedFolders.map((f, i) => (
          <div key={`${f.virtualName}-${i}`} className="start-row">
            <button type="button" className="start-link" title={missing.has(i) ? t('sp_share_missing') : f.physicalPath} onClick={() => onAction(`reveal:${f.physicalPath}`)}>
              <span className="icon"><Icon name={missing.has(i) ? 'warning' : 'folder'} size={15} /></span>
              <span className="name">/{f.virtualName}</span>
              <span className="path">{f.physicalPath}</span>
            </button>
          </div>
        ))}
      </div>
    ), <button type="button" className="small-button" disabled={locked} title={locked ? t('locked_hint') : t('sp_t_share_d')} onClick={() => onAction('addShare')}><Icon name="plus" size={12} /> {t('sp_add')}</button>),
    addresses: card('addresses', 'start-addresses', 'link', t('sp_addresses'), (
      <div className="start-list">
        {urls.length === 0 && <div className="start-empty"><Icon name="info" size={13} /><span>{t('addr_none')}</span></div>}
        {urls.map((r) => (
          <div key={r.url} className="start-row">
            <span className={`proto-tag ${r.proto.toLowerCase()}`}>{r.proto}</span>
            <code className="sp-url" title={r.url}>{r.url}</code>
            <span className="path muted small">{r.iface}</span>
            <button type="button" className="icon-btn" title={t('copy')} aria-label={t('copy')} onClick={() => copy(r.url, r.url)}><Icon name={copied === r.url ? 'check' : 'copy'} size={13} /></button>
          </div>
        ))}
      </div>
    ), urls.length ? <button type="button" className="small-button" onClick={() => copy('*', urls.map((r) => r.url).join('\n'))}><Icon name={copied === '*' ? 'check' : 'copy'} size={12} /> {t('addr_copy_all')}</button> : null),
    profiles: card('profiles', 'start-profiles', 'history', `${t('sp_profiles')} (${profiles.length})`, (
      <div className="start-list">
        {profiles.length === 0 && <div className="start-empty"><Icon name="info" size={13} /><span>{t('sp_profiles_empty')}</span></div>}
        {profiles.map((name) => (
          <div key={name} className="start-row">
            <button type="button" className={`start-link compact ${name === profileName ? 'current' : ''}`} disabled={locked} title={locked ? t('locked_hint') : t('sp_profile_load', { name })} onClick={() => onLoadProfile(name)}>
              <span className="icon"><Icon name={name === profileName ? 'check' : 'fileText'} size={15} /></span>
              <span className="name">{name}</span>
              <span className="path">{name === profileName ? t('sp_profile_current') : ''}</span>
            </button>
          </div>
        ))}
      </div>
    ), <button type="button" className="small-button" disabled={locked} title={t('tip_profile_save')} onClick={() => onAction('saveProfile')}><Icon name="save" size={12} /> {t('profile_save')}</button>),
    help: card('help', 'help', 'help', t('sp_help'), (
      <div className="start-help">
        <ol className="sp-steps">
          {['sp_step1', 'sp_step2', 'sp_step3', 'sp_step4'].map((k) => <li key={k}>{t(k)}</li>)}
        </ol>
        <div className="sp-keys small muted"><Icon name="keyboard" size={13} /><span>{t('sp_keys')}</span></div>
        {[['manual', 'book', 'sp_manual'], ['nextTheme', 'palette', 'sp_h_theme'],['toggleLanguage', 'globe', 'sp_h_language'], ['settings', 'settings', 'settings'], ['about', 'star', 'menu_info']].map(([action, icon, label]) => (
          <button key={label} type="button" className="start-link compact" title={t(label)} onClick={() => onAction(action)}><span className="icon"><Icon name={icon} size={15} /></span><span className="name">{t(label)}</span><span /></button>
        ))}
      </div>
    )),
    side: card('side', 'side', 'sparkle', t('sp_background'), (
      <>
        <BgKindGrid bg={bg} onChange={save} />
        <div className="start-speed"><span className="icon"><Icon name="gauge" size={14} /></span><span>{t('sp_speed')}</span></div>
        <Range value={bg.speed} min={0} max={300} step={10} unit="%" label={t('sp_speed')} onChange={(v) => save({ speed: v })} />
        <div className="start-speed"><span className="icon"><Icon name="eye" size={14} /></span><span>{t('sp_transparency')}</span></div>
        <Range value={bg.transparency} min={0} max={100} step={5} unit="%" label={t('sp_transparency')} onChange={(v) => save({ transparency: v })} />
        <div className="start-speed start-shuffle"><span className="icon"><Icon name="dice" size={14} /></span><span>{t('sp_shuffle_every')}</span>
          <NumberField className="sp-num" value={bg.shuffleSec || 0} min={0} max={600} step={5} unit={t('sp_seconds')} mono={false} label={t('sp_shuffle_every')}
            onChange={(v) => save({ shuffleSec: v })} />
        </div>
        <label className="start-check"><input type="checkbox" checked={!!bg.random} onChange={(e) => save({ random: e.target.checked })} /><span>{t('sp_random')}</span></label>
      </>
    )),
  };

  return (
    <div className="start-page">
      <canvas ref={canvas} className="start-bg" aria-hidden="true" style={{ opacity: 1 - (bg.transparency || 0) / 100 }} />
      <div className="start-scroll">
        <div className="start-inner">
          <div className="start-tools">
            <Btn icon="grid" label={t('sp_auto_arrange')} title={t('sp_auto_arrange_tip')} onClick={arrange} />
            <Btn icon="close" label={t('sp_close')} title={t('sp_close_tip')} onClick={() => onAction('open')} />
          </div>
          <div className="start-grid start-board" ref={board}>{CARD_IDS.map((id) => cards[id])}{dropOutline}</div>
          <footer className="start-foot">
            <label className="start-check"><input type="checkbox" checked={showOnLaunch} onChange={(e) => onShowOnLaunch(e.target.checked)} /><span>{t('sp_show')}</span></label>
            <span className="grow" />
            <span className="muted">© 2026 SHKWON (knix008@naver.com)</span>
          </footer>
        </div>
      </div>
    </div>
  );
}

export default StartPage;
