// Start page (MyUMLMaker / My FTP Server layout): a moving background behind a
// board of translucent cards that can be moved and resized. The program title
// is a fixed banner above the board — it is not a card, so it cannot be
// dragged or resized.
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { COLS, ROW, GAP, cardsOf, rowsFor, layoutKey, layoutValue, place, compact, autoArrange, swapVertical } from '../lib/startLayout';
import { dragGhost } from '../lib/dragGhost';
import { t, useLanguage, getLanguage } from '../lib/i18n';
import { formatDate } from '../lib/format';
import { AnimatedBackground, ANIMATION_KINDS, ANIMATION_ICONS, DEFAULT_START_BACKGROUND, themeColors } from '../lib/startBackground';
import { Icon } from './Icons';
import { PROTOCOLS, defaultPort } from './ConnectionBar';
import { PathCrumbs } from './PathCrumbs';

export function startBackgroundOf(session) {
  return { ...DEFAULT_START_BACKGROUND, ...((session && session.startBackground) || {}) };
}

// The title banner is not in this list.
export const CARD_IDS = ['quick', 'recent', 'profiles', 'status', 'side'];
export const DEFAULT_SPAN = { quick: 3, recent: 3, profiles: 3, status: 3, side: 3 };

const GROUPS = [
  ['sp_g_connect', [
    ['connect', 'plug', 'sp_t_connect', 'sp_t_connect_d'],
    ['disconnect', 'unplug', 'sp_t_disconnect', 'sp_t_disconnect_d'],
    ['openClient', 'folderOpen', 'sp_t_open', 'sp_t_open_d'],
  ]],
  ['sp_g_work', [
    ['terminal', 'terminal', 'sp_t_terminal', 'sp_t_terminal_d'],
    ['saveProfile', 'save', 'sp_t_profile', 'sp_t_profile_d'],
    ['manual', 'book', 'sp_manual', 'sp_manual_tip'],
  ]],
  ['sp_g_look', [
    ['nextTheme', 'palette', 'sp_t_theme', 'sp_t_theme_d'],
    ['toggleLanguage', 'globe', 'sp_t_language', 'sp_t_language_d'],
    ['settings', 'settings', 'sp_t_settings', 'sp_t_settings_d'],
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

function BgKindGrid({ bg, onChange }) {
  const shuffling = (Number(bg.shuffleSec) || 0) > 0;
  return (
    <div className="bg-kinds" role="radiogroup" aria-label={t('sp_background')}>
      {ANIMATION_KINDS.map((k) => (
        <button key={k} type="button" role="radio" aria-checked={bg.kind === k} data-kind={k} className={`bg-kind ${bg.kind === k ? 'on' : ''}`} title={`${t(`anim_${k}`)} — ${t(`anim_${k}_d`)}`} onClick={() => onChange({ kind: k })}>
          <Icon name={ANIMATION_ICONS[k]} size={18} /><span>{t(`anim_${k}`)}</span>
        </button>
      ))}
      <button type="button" role="switch" aria-checked={shuffling} className={`bg-kind shuffle ${shuffling ? 'on' : ''}`} title={t('sp_shuffle_tip', { n: bg.shuffleSec || 20 })}
        onClick={() => onChange({ shuffleSec: shuffling ? 0 : 20 })}>
        <Icon name="dice" size={18} /><span>{t('sp_shuffle')}</span>
      </button>
    </div>
  );
}

function savedValue(form, profiles, profileName, history) {
  const named = (profiles || []).find((p) => p.name === profileName);
  if (named && named.protocol === form.protocol && named.host === form.host && named.user === form.user) return `p:${profileName}`;
  const hi = (history || []).findIndex((h) => h.protocol === form.protocol && h.host === form.host && String(h.port) === String(form.port) && h.user === form.user);
  return hi >= 0 ? `h:${hi}` : '';
}

/** Protocol, host, port, user and password, plus a dropdown of profiles and past connections. */
function ConnectionFields({ form, conn, connecting, profiles, profileName, history, localDir, serverPath, onFormChange, onPickProfile, onPickHistory, onJumpLocal, onJumpServer }) {
  const f = form || { protocol: 'FTP', host: '', port: '21', user: '', password: '' };
  const locked = !!conn || !!connecting;
  const set = (k, v) => onFormChange({ ...f, [k]: v });
  const onProtocol = (protocol) => {
    const wasDefault = !f.port || String(f.port) === defaultPort(f.protocol);
    onFormChange({ ...f, protocol, port: wasDefault ? defaultPort(protocol) : f.port });
  };
  const onSaved = (value) => {
    if (value.startsWith('p:')) onPickProfile(value.slice(2));
    else if (value.startsWith('h:')) onPickHistory(Number(value.slice(2)));
  };
  return (
    <div className="sp-status">
      <label className="sp-field sp-field-wide">
        <span>{t('sp_saved')}</span>
        <select value={savedValue(f, profiles, profileName, history)} aria-label={t('sp_saved')} disabled={locked} onChange={(e) => onSaved(e.target.value)}>
          <option value="">{t('sp_saved_ph')}</option>
          {(profiles || []).length > 0 && (
            <optgroup label={t('sp_group_profile')}>
              {profiles.map((p) => <option key={`p:${p.name}`} value={`p:${p.name}`}>{p.name} — {String(p.protocol || 'ftp').toLowerCase()}://{p.host}</option>)}
            </optgroup>
          )}
          {(history || []).length > 0 && (
            <optgroup label={t('sp_group_history')}>
              {history.map((h, i) => (
                <option key={`h:${i}`} value={`h:${i}`}>{String(h.protocol || 'ftp').toLowerCase()}://{h.user ? `${h.user}@` : ''}{h.host}:{h.port}</option>
              ))}
            </optgroup>
          )}
        </select>
      </label>
      <label className="sp-field">
        <span>{t('lbl_protocol')}</span>
        <select value={f.protocol || 'FTP'} aria-label={t('lbl_protocol')} disabled={locked} onChange={(e) => onProtocol(e.target.value)}>
          {PROTOCOLS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </label>
      <label className="sp-field">
        <span>{t('lbl_host')}</span>
        <input value={f.host || ''} aria-label={t('lbl_host')} disabled={locked} spellCheck={false} placeholder="ftp.example.com" onChange={(e) => set('host', e.target.value)} />
      </label>
      <label className="sp-field sp-field-port">
        <span>{t('lbl_port')}</span>
        <input value={f.port ?? ''} aria-label={t('lbl_port')} disabled={locked} inputMode="numeric" placeholder={defaultPort(f.protocol)} onChange={(e) => set('port', e.target.value.replace(/[^\d]/g, ''))} />
      </label>
      <label className="sp-field">
        <span>{t('lbl_user')}</span>
        <input value={f.user || ''} aria-label={t('lbl_user')} disabled={locked} spellCheck={false} onChange={(e) => set('user', e.target.value)} />
      </label>
      <label className="sp-field">
        <span>{t('lbl_password')}</span>
        <input type="password" value={f.password || ''} aria-label={t('lbl_password')} disabled={locked} onChange={(e) => set('password', e.target.value)} />
      </label>
      <div className="sp-proto">
        <span className="name">{t('sp_remote')}</span>
        {conn ? <PathCrumbs path={serverPath || '/'} onJump={onJumpServer} mark={false} /> : <span className="mono">—</span>}
      </div>
      <div className="sp-proto">
        <span className="name">{t('sp_local')}</span>
        {localDir ? <PathCrumbs path={localDir} onJump={onJumpLocal} mark={false} /> : <span>—</span>}
      </div>
    </div>
  );
}

export function StartPage({
  info, session, form, conn, connecting, profiles, profileName, history, localDir, serverPath,
  onAction, onPickProfile, onPickHistory, onClearHistory, onFormChange, onJumpLocal, onJumpServer, onBackground, showOnLaunch, onShowOnLaunch,
}) {
  useLanguage();
  const bg = startBackgroundOf(session);
  const canvas = useRef(null);
  const anim = useRef(null);
  const speed = useRef(bg.speed);
  speed.current = bg.speed;
  const board = useRef(null);
  const [drag, setDrag] = useState(null);

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
  useEffect(() => {
    const sec = Number(bg.shuffleSec) || 0;
    if (!sec) return undefined;
    const timer = setInterval(() => { if (anim.current) anim.current.shuffle(); }, sec * 1000);
    return () => clearInterval(timer);
  }, [bg.shuffleSec]);
  useEffect(() => { if (anim.current) anim.current.refreshColors(); }, [session && session.theme]);

  const save = (patch) => onBackground({ ...startBackgroundOf(session), ...patch });

  const [measured, setMeasured] = useState({});
  const burst = useRef({ at: 0, n: 0 });
  const saved = cardsOf(bg.layout, CARD_IDS, DEFAULT_SPAN, measured);
  const pending = drag && drag.target ? place(saved, drag.id, drag.target) : null;
  const shown = pending || saved;
  const saveLayout = (cards) => save({ layout: layoutValue(compact(cards)) });
  const arrange = () => saveLayout(autoArrange(CARD_IDS, DEFAULT_SPAN, measured));
  const ghost = useRef(null);
  useEffect(() => () => { if (ghost.current) ghost.current.destroy(); }, []);

  const measure = useCallback(() => {
    if (!board.current) return;
    const next = {};
    for (const el of board.current.querySelectorAll(':scope > .start-card.fit')) {
      const head = el.querySelector(':scope > h2');
      const body = el.querySelector(':scope > .card-body');
      const cs = getComputedStyle(el);
      const pad = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
      const hm = head ? getComputedStyle(head) : null;
      const headH = head ? head.offsetHeight + (parseFloat(hm.marginTop) || 0) + (parseFloat(hm.marginBottom) || 0) : 0;
      next[el.dataset.card] = rowsFor(pad + headH + (body ? body.scrollHeight : 0));
    }
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
  const card = (id, cls, icon, title, body, extra) => {
    const mine = drag && drag.id === id;
    const origin = mine && drag.mode === 'move';
    const c = mine ? saved[id] : shown[id];
    const fit = c.fit;
    return (
      <section key={id} data-card={id} className={`start-card ${cls} ${fit ? 'fit' : 'fixed-height'} ${origin ? 'drag-origin' : ''} ${mine && drag.mode === 'resize' ? 'resizing' : ''}`}
        style={{ ...cell(c), height: `${Math.max(ROW, c.h * ROW - GAP)}px` }}>
        <h2>
          {handle(id)}
          <span className="icon"><Icon name={icon} size={15} /></span><span>{title}</span><span className="grow" />{extra}
        </h2>
        <div className="card-body">{body}</div>
        <span className="card-resize" title={`${t('sp_resize_card')} (Alt+Shift+←↑↓→)`} onPointerDown={(e) => startResize(e, id)} onDoubleClick={() => fitCard(id)}>
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <g fill="currentColor">
              <circle cx="11.5" cy="11.5" r="1.2" /><circle cx="11.5" cy="7" r="1.2" /><circle cx="11.5" cy="2.5" r="1.2" />
              <circle cx="7" cy="11.5" r="1.2" /><circle cx="7" cy="7" r="1.2" />
              <circle cx="2.5" cy="11.5" r="1.2" />
            </g>
          </svg>
        </span>
      </section>
    );
  };
  const dropOutline = drag && drag.target ? <div key="drop-outline" className="card-drop-outline" aria-hidden="true" style={{ ...cell(shown[drag.id]), height: `${shown[drag.id].h * ROW - GAP}px` }} /> : null;

  const version = (info && info.version) || '';
  const state = connecting ? 'connecting' : conn ? 'connected' : 'idle';
  const endpoint = conn
    ? `${conn.protocol.toLowerCase()}://${conn.user ? `${conn.user}@` : ''}${conn.host}:${conn.port}`
    : (form && form.host ? `${(form.protocol || 'FTP').toLowerCase()}://${form.user ? `${form.user}@` : ''}${form.host}${form.port ? `:${form.port}` : ''}` : '');
  const langOther = getLanguage() === 'ko' ? 'English' : '한국어';

  const cards = {
    quick: card('quick', 'templates', 'plus', t('sp_quick'), (
      <div className="template-groups">
        {GROUPS.map(([g, items]) => (
          <div key={g} className="template-group">
            <p className="template-group-title">{t(g)}</p>
            {items.map(([action, icon, name, desc]) => {
              const off = (action === 'disconnect' && !conn) || (action === 'connect' && !!conn) || (action === 'connect' && connecting);
              const label = action === 'toggleLanguage' ? langOther : t(name);
              return (
                <button key={action} type="button" className="template-tile" data-action={action} title={t(desc)} disabled={off} onClick={() => onAction(action)}>
                  <span className="icon"><Icon name={icon} size={18} /></span><b>{label}</b><small>{t(desc)}</small>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    )),
    recent: card('recent', 'start-recent', 'history', t('sp_recent'), (
      <div className="start-list">
        {(!history || history.length === 0) && <div className="start-empty"><Icon name="info" size={13} /><span>{t('sp_recent_empty')}</span></div>}
        {(history || []).slice(0, 8).map((h, i) => (
          <div key={`${h.protocol}-${h.host}-${h.port}-${h.user}-${i}`} className="start-row">
            <button type="button" className="start-link" title={t('sp_recent_load')} disabled={!!conn || connecting} onClick={() => onPickHistory(i)}>
              <span className="icon"><Icon name={h.protocol === 'SFTP' ? 'server' : 'plug'} size={15} /></span>
              <span className="name">{h.protocol.toLowerCase()}://{h.host}:{h.port}</span>
              <span className="path">{h.user || '—'} · {formatDate(h.lastAt)} · {t('history_times', { n: h.count })}</span>
            </button>
          </div>
        ))}
      </div>
    ), history && history.length ? <button type="button" className="small-button" onClick={onClearHistory}><Icon name="eraser" size={12} /> {t('history_clear')}</button> : null),
    profiles: card('profiles', 'start-profiles', 'save', `${t('sp_profiles')} (${(profiles || []).length})`, (
      <div className="start-list">
        {(!profiles || profiles.length === 0) && <div className="start-empty"><Icon name="info" size={13} /><span>{t('sp_profiles_empty')}</span></div>}
        {(profiles || []).map((p) => (
          <div key={p.name} className="start-row">
            <button type="button" className={`start-link compact ${p.name === profileName ? 'current' : ''}`} disabled={!!conn || connecting} title={t('sp_profile_load', { name: p.name })} onClick={() => onPickProfile(p.name)}>
              <span className="icon"><Icon name={p.name === profileName ? 'check' : 'fileText'} size={15} /></span>
              <span className="name">{p.name}</span>
              <span className="path">{p.name === profileName ? t('sp_profile_current') : `${p.protocol.toLowerCase()}://${p.host}`}</span>
            </button>
          </div>
        ))}
      </div>
    ), <button type="button" className="small-button" title={t('tip_profile_save')} onClick={() => onAction('saveProfile')}><Icon name="save" size={12} /> {t('profile_save')}</button>),
    status: card('status', 'start-status', 'link', t('sp_status'), (
      <ConnectionFields form={form} conn={conn} connecting={connecting} profiles={profiles} profileName={profileName} history={history}
        localDir={localDir} serverPath={serverPath} onFormChange={onFormChange} onPickProfile={onPickProfile} onPickHistory={onPickHistory}
        onJumpLocal={onJumpLocal} onJumpServer={onJumpServer} />
    )),
    side: card('side', 'side', 'sparkle', t('sp_background'), (
      <div className="side-body">
        <BgKindGrid bg={bg} onChange={save} />
        <div className="side-controls">
          <div className="start-speed"><span className="icon"><Icon name="gauge" size={14} /></span><span>{t('sp_speed')}</span></div>
          <Range value={bg.speed} min={0} max={300} step={10} unit="%" label={t('sp_speed')} onChange={(v) => save({ speed: v })} />
          <div className="start-speed"><span className="icon"><Icon name="eye" size={14} /></span><span>{t('sp_transparency')}</span></div>
          <Range value={bg.transparency} min={0} max={100} step={5} unit="%" label={t('sp_transparency')} onChange={(v) => save({ transparency: v })} />
          <label className="start-speed start-shuffle">
            <span className="icon"><Icon name="dice" size={14} /></span><span>{t('sp_shuffle_every')}</span>
            <input className="sp-num" type="number" min={0} max={600} step={5} value={bg.shuffleSec || 0} aria-label={t('sp_shuffle_every')}
              onChange={(e) => save({ shuffleSec: Math.max(0, Math.min(600, Number(e.target.value) || 0)) })} />
            <span className="unit">{t('sp_seconds')}</span>
          </label>
          <label className="start-check"><input type="checkbox" checked={!!bg.random} onChange={(e) => save({ random: e.target.checked })} /><span>{t('sp_random')}</span></label>
        </div>
      </div>
    )),
  };

  return (
    <div className="start-page">
      <canvas ref={canvas} className="start-bg" aria-hidden="true" style={{ opacity: 1 - (bg.transparency || 0) / 100 }} />
      <div className="start-scroll">
        <div className="start-inner">
          <div className="start-tools">
            <Btn icon="grid" label={t('sp_auto_arrange')} title={t('sp_auto_arrange_tip')} onClick={arrange} />
            <Btn icon="folderOpen" label={t('sp_close')} title={t('sp_close_tip')} onClick={() => onAction('openClient')} />
          </div>
          <header className="start-hero start-hero-fixed" data-fixed-title="true">
            <img src="./icon.svg" alt="" className="start-icon" />
            <div className="start-hero-text">
              <h1><span className="start-title">{t('appTitle')}</span> {version && <small>v{version}</small>}</h1>
              <p>{t('sp_tagline')}</p>
              <p className={`start-state ${state}`}><span className="sb-dot" />{t(`sp_state_${state}`)}{endpoint ? ` · ${endpoint}` : ''}</p>
            </div>
            <div className="start-hero-actions">
              <div className="start-docs">
                <Btn icon="book" label={t('sp_manual')} title={t('sp_manual_tip')} onClick={() => onAction('manual')} />
                <Btn icon="settings" label={t('settings')} title={t('tip_settings')} onClick={() => onAction('settings')} />
                <Btn icon="info" label={t('menu_info')} title={t('tip_about')} onClick={() => onAction('about')} />
              </div>
              {conn
                ? <Btn icon="unplug" label={t('disconnect')} title={t('tip_disconnect')} danger onClick={() => onAction('disconnect')} />
                : <Btn icon="plug" label={connecting ? t('connecting') : t('connect')} title={t('tip_connect')} primary disabled={connecting} onClick={() => onAction('connect')} />}
              <Btn icon="folderOpen" label={t('sp_open_client')} title={t('sp_open_client_tip')} onClick={() => onAction('openClient')} />
            </div>
          </header>
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
