// Side and bottom panels: a title bar with the panel's icon and title on the
// left and a fold button on the right; folded, a panel shrinks to a slim bar
// that still shows its icon and title (upright text for the side panels), and a
// click on that bar opens it again. Splitters between the panels and the canvas
// resize them.
import { useCallback, type ReactNode } from 'react';
import { useT } from '../i18n';
import { Icons } from './Icons';

export type PanelSide = 'left' | 'right' | 'bottom';

interface PanelProps {
  side: PanelSide;
  id: string;
  icon: ReactNode;
  title: string;
  open: boolean;
  onToggle: () => void;
  /** Width (side panels) or height (bottom panel) in px while open. */
  size: number;
  /** Buttons in the title bar, before the fold button. */
  actions?: ReactNode;
  children: ReactNode;
}

/**
 * The fold button shows the panel itself — a window with its side (or bottom)
 * strip — the same picture as the toolbar toggle. Open, the strip is filled in
 * the panel colour; folded, it is an empty outline.
 */
function FoldIcon({ side, open }: { side: PanelSide; open: boolean }) {
  const strip =
    side === 'bottom'
      ? { x: 4, y: 14, w: 16, h: 5 }
      : side === 'right'
        ? { x: 14, y: 5, w: 6, h: 14 }
        : { x: 4, y: 5, w: 6, h: 14 };
  return (
    <svg className={`ic fold-ic fold-ic-${side}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <rect x={strip.x} y={strip.y} width={strip.w} height={strip.h} rx="1" fill={open ? 'currentColor' : 'none'} stroke="none" opacity={open ? 0.85 : 0} />
      {side === 'bottom' ? <path d="M3 14h18" /> : side === 'right' ? <path d="M14 4v16" /> : <path d="M10 4v16" />}
    </svg>
  );
}

export function Panel({ side, id, icon, title, open, onToggle, size, actions, children }: PanelProps) {
  const t = useT();
  const foldLabel = open ? t('PanelFold') : t('PanelUnfold');
  const style = open
    ? side === 'bottom'
      ? { height: size }
      : { width: size }
    : undefined;
  return (
    <section className={`panel panel-${side} ${open ? 'open' : 'folded'}`} data-panel={id} style={style}>
      <header
        className="panel-bar"
        onClick={open ? undefined : onToggle}
        title={open ? undefined : `${title} — ${foldLabel}`}
      >
        <span className="panel-title-icon">{icon}</span>
        <span className="panel-title-text">{title}</span>
        {open && actions}
        <button
          type="button"
          className="panel-fold"
          data-action={`fold-${id}`}
          title={`${title} — ${foldLabel}`}
          aria-label={`${title} — ${foldLabel}`}
          aria-expanded={open}
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
        >
          <FoldIcon side={side} open={open} />
        </button>
      </header>
      {open && <div className="panel-content">{children}</div>}
    </section>
  );
}

interface SplitterProps {
  /** 'x' resizes a width (side panels), 'y' a height (bottom panel). */
  axis: 'x' | 'y';
  /** +1 when dragging right / down makes the panel bigger, -1 when it makes it smaller. */
  direction: 1 | -1;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  onCommit?: (value: number) => void;
  label: string;
}

/** A drag handle between a panel and the canvas. Double click restores nothing: it is a plain divider. */
export function Splitter({ axis, direction, value, min, max, onChange, onCommit, label }: SplitterProps) {
  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      const start = axis === 'x' ? e.clientX : e.clientY;
      const startValue = value;
      let current = value;
      const el = e.currentTarget;
      el.setPointerCapture(e.pointerId);
      el.classList.add('dragging');
      const move = (ev: PointerEvent) => {
        const delta = ((axis === 'x' ? ev.clientX : ev.clientY) - start) * direction;
        current = Math.round(Math.min(max, Math.max(min, startValue + delta)));
        onChange(current);
      };
      const up = () => {
        el.classList.remove('dragging');
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        el.removeEventListener('pointercancel', up);
        onCommit?.(current);
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    },
    [axis, direction, value, min, max, onChange, onCommit],
  );
  return (
    <div
      className={`splitter splitter-${axis}`}
      role="separator"
      aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'}
      aria-label={label}
      title={label}
      onPointerDown={onPointerDown}
    />
  );
}

// ── The bottom panel's contents ──────────────────────────────────────────────

export type LogLevel = 'info' | 'error';

export interface LogEntry {
  time: Date;
  level: LogLevel;
  text: string;
}

export interface ProblemRow {
  severity: 'Error' | 'Warning' | 'Info';
  where: string;
  message: string;
  onSelect: () => void;
}

export type BottomTab = 'problems' | 'log' | 'info';

const pad = (n: number) => String(n).padStart(2, '0');
export const timeOf = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

export function BottomPanelBody({
  tab,
  onTab,
  problems,
  log,
  info,
  onClearLog,
  onCopy,
}: {
  tab: BottomTab;
  onTab: (tab: BottomTab) => void;
  problems: ProblemRow[];
  log: LogEntry[];
  info: [string, string][];
  onClearLog: () => void;
  onCopy: (text: string) => void;
}) {
  const t = useT();
  const errors = log.filter((l) => l.level === 'error').length;
  const asText = () => {
    if (tab === 'problems') return problems.map((p) => `[${p.severity}] ${p.where}: ${p.message}`).join('\n');
    if (tab === 'log') return log.map((l) => `${timeOf(l.time)} ${l.level === 'error' ? 'ERROR ' : ''}${l.text}`).join('\n');
    return info.map(([k, v]) => `${k}: ${v}`).join('\n');
  };
  const tabs: [BottomTab, ReactNode, string, number | null][] = [
    ['problems', <Icons.Warning key="p" />, t('BottomProblems'), problems.length],
    ['log', <Icons.Doc key="l" />, t('BottomLog'), errors || null],
    ['info', <Icons.About key="i" />, t('BottomInfo'), null],
  ];
  return (
    <div className="bottom-body">
      <div className="bottom-tabs" role="tablist">
        {tabs.map(([id, icon, label, count]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            data-bottom-tab={id}
            className={tab === id ? 'active' : ''}
            onClick={() => onTab(id)}
          >
            {icon}
            <span>{label}</span>
            {count !== null && <span className={`bottom-count ${id === 'log' ? 'error' : ''}`}>{count}</span>}
          </button>
        ))}
        <span className="spacer" />
        <button type="button" className="btn btn-icon" data-action="bottom-copy" title={t('BottomCopy')} onClick={() => onCopy(asText())}>
          <Icons.Doc />
          <span>{t('BottomCopy')}</span>
        </button>
        {tab === 'log' && (
          <button type="button" className="btn btn-icon" data-action="bottom-clear" title={t('BottomClear')} onClick={onClearLog}>
            <Icons.Delete />
            <span>{t('BottomClear')}</span>
          </button>
        )}
      </div>
      <div className="bottom-list">
        {tab === 'problems' &&
          (problems.length === 0 ? (
            <p className="bottom-empty">{t('BottomNoProblems')}</p>
          ) : (
            problems.map((p, i) => (
              <button key={i} type="button" className={`bottom-row sev-${p.severity}`} onClick={p.onSelect}>
                <span className="bottom-sev">{p.severity === 'Error' ? '⛔' : p.severity === 'Warning' ? '⚠' : 'ℹ'}</span>
                <span className="bottom-where">{p.where}</span>
                <span className="bottom-msg">{p.message}</span>
              </button>
            ))
          ))}
        {tab === 'log' &&
          (log.length === 0 ? (
            <p className="bottom-empty">{t('BottomNoLog')}</p>
          ) : (
            [...log].reverse().map((l, i) => (
              <div key={i} className={`bottom-row log-${l.level}`}>
                <span className="bottom-time">{timeOf(l.time)}</span>
                <span className="bottom-msg">{l.text}</span>
              </div>
            ))
          ))}
        {tab === 'info' && (
          <dl className="bottom-info">
            {info.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </div>
  );
}
