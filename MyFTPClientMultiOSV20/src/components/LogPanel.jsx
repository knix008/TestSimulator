// Bottom dock: the transfer log plus any number of terminal tabs.
// "+" lists shells installed on this machine; the user picks one to open.
// When the browse connection is SFTP, the same menu also offers a remote SSH shell.
import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { t, useLanguage, getLanguage } from '../lib/i18n';
import { call, onTerminalExit } from '../lib/backend';
import { Icon } from './Icons';
import { ContextMenu } from './ContextMenu';
import { TerminalView } from './TerminalView';

const LOG_TAB = 'log';
const MAX_TABS = 8;
const REMOTE_ID = 'remote';

function shellLabel(sh) {
  if (!sh) return '';
  return getLanguage() === 'en' ? sh.label : (sh.labelKo || sh.label);
}

function uniqueTitle(tabs, base) {
  if (!tabs.some((tab) => tab.title === base)) return base;
  for (let n = 2; n < 100; n++) {
    const title = `${base} ${n}`;
    if (!tabs.some((tab) => tab.title === title)) return title;
  }
  return `${base} ${Date.now()}`;
}

export const LogPanel = forwardRef(function LogPanel({
  lines, onClear, onCopy, height, onResizeStart, onEnsureHeight,
  localDir, terminalStartDir, connection, remotePath, theme, fontSize, fontFamily, scrollback, onError,
  lastShell, onLastShell, onTerminalView,
}, ref) {
  useLanguage();
  const bodyRef = useRef(null);
  const addRef = useRef(null);
  const tabListRef = useRef(null);
  const [active, setActive] = useState(LOG_TAB);
  const [tabs, setTabs] = useState([]);
  const [shells, setShells] = useState([]);
  const [pickOpen, setPickOpen] = useState(false);

  useEffect(() => {
    const el = bodyRef.current;
    if (el && active === LOG_TAB) el.scrollTop = el.scrollHeight;
  }, [lines.length, active]);

  useEffect(() => {
    let cancelled = false;
    call('terminal.shells').then((r) => {
      if (!cancelled) setShells((r && r.shells) || []);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (connection) return;
    setTabs((cur) => {
      const gone = cur.filter((tab) => tab.kind === 'remote');
      if (!gone.length) return cur;
      for (const tab of gone) call('terminal.close', { id: tab.id }).catch(() => {});
      const next = cur.filter((tab) => tab.kind !== 'remote');
      setActive((a) => (gone.some((tab) => tab.id === a) ? LOG_TAB : a));
      return next;
    });
  }, [connection]);

  const tabIds = [LOG_TAB, ...tabs.map((tab) => tab.id)];
  const activeIndex = Math.max(0, tabIds.indexOf(active));

  useEffect(() => {
    if (onTerminalView) onTerminalView(active !== LOG_TAB);
  }, [active, onTerminalView]);

  useEffect(() => {
    const list = tabListRef.current;
    if (!list) return;
    const el = list.querySelector('.dock-tab.active');
    if (!el) return;
    const left = el.offsetLeft;
    const right = left + el.offsetWidth;
    if (left < list.scrollLeft) list.scrollLeft = left;
    else if (right > list.scrollLeft + list.clientWidth) list.scrollLeft = right - list.clientWidth;
  }, [active, tabs.length]);

  const shiftTab = (dir) => {
    const next = tabIds[activeIndex + dir];
    if (next !== undefined) setActive(next);
  };

  const isSftp = !!(connection && String(connection.protocol).toUpperCase() === 'SFTP');
  const preferredId = (lastShell && shells.some((s) => s.id === lastShell) ? lastShell : null)
    || (shells.find((s) => s.preferred) || shells[0] || {}).id;

  const openTerm = async (kind, shellId) => {
    if (tabs.length >= MAX_TABS) {
      if (onError) onError(t('term_max', { n: MAX_TABS }));
      return;
    }
    if (kind === 'remote' && !isSftp) {
      if (onError) onError(t('term_ftp_no_shell'));
      return;
    }
    try {
      const snap = await call('terminal.open', {
        kind,
        cwd: (kind === 'local' && terminalStartDir && String(terminalStartDir).trim()) || localDir,
        connId: connection && connection.id,
        remotePath,
        cols: 80,
        rows: 24,
        shellId: kind === 'local' ? shellId : undefined,
      });
      const sh = shells.find((s) => s.id === shellId);
      const base = kind === 'remote'
        ? (snap.title || t('term_remote', { user: (connection && connection.user) || '', host: (connection && connection.host) || '' }))
        : (shellLabel(sh) || snap.title || t('term'));
      setTabs((cur) => [...cur, { id: snap.id, kind, title: uniqueTitle(cur, base), shellId }]);
      setActive(snap.id);
      if (kind === 'local' && shellId && onLastShell) onLastShell(shellId);
      if (onEnsureHeight && height < 180) onEnsureHeight(220);
    } catch (err) {
      if (onError) onError(err);
    }
  };

  const closeTab = (id, ev) => {
    if (ev && typeof ev.stopPropagation === 'function') {
      ev.stopPropagation();
      ev.preventDefault();
    }
    call('terminal.close', { id }).catch(() => {});
    setTabs((cur) => {
      const next = cur.filter((tab) => tab.id !== id);
      setActive((a) => (a === id ? LOG_TAB : a));
      return next;
    });
  };

  useEffect(() => {
    const off = onTerminalExit((msg) => {
      if (msg && msg.id != null) closeTab(msg.id);
    });
    return off;
  }, []);

  const pickItems = [
    ...shells.map((s) => ({
      id: s.id,
      label: shellLabel(s),
      icon: 'terminal',
      checked: s.id === preferredId,
      meta: s.meta || '',
    })),
    ...(isSftp ? [
      { sep: true },
      {
        id: REMOTE_ID,
        label: t('term_new_remote'),
        icon: 'server',
        meta: connection ? `${connection.user || ''}@${connection.host}` : '',
      },
    ] : []),
  ];

  const onPick = (id) => {
    setPickOpen(false);
    if (id === REMOTE_ID) openTerm('remote');
    else openTerm('local', id);
  };

  const onAddClick = () => {
    if (!shells.length && !isSftp) {
      if (onError) onError(t('term_none'));
      return;
    }
    setPickOpen((v) => !v);
  };

  useImperativeHandle(ref, () => ({
    showTerminal() {
      if (onEnsureHeight) onEnsureHeight(220);
      if (tabs.length) {
        setActive(tabs[tabs.length - 1].id);
        return;
      }
      if (preferredId) openTerm('local', preferredId);
      else onAddClick();
    },
    hideTerminal() {
      setPickOpen(false);
      setActive(LOG_TAB);
    },
  }));

  return (
    <>
      <div className="h-splitter" onMouseDown={(e) => { if (e.button === 0) onResizeStart(e); }} />
      <div className="log-panel" style={{ height }}>
        <div className="log-head">
          <div className="dock-tabs">
            <div className="dock-tab-list" ref={tabListRef}>
              <div className={`dock-tab${active === LOG_TAB ? ' active' : ''}`} onClick={() => setActive(LOG_TAB)} role="tab" aria-selected={active === LOG_TAB}>
                <Icon name="fileText" size={12} />
                <span className="dock-tab-label">{t('log')}</span>
              </div>
              {tabs.map((tab) => (
                <div key={tab.id} className={`dock-tab${active === tab.id ? ' active' : ''}`}
                  onClick={() => setActive(tab.id)} onAuxClick={(e) => { if (e.button === 1) closeTab(tab.id, e); }}
                  title={tab.title} role="tab" aria-selected={active === tab.id}>
                  <Icon name={tab.kind === 'remote' ? 'server' : 'terminal'} size={12} />
                  <span className="dock-tab-label">{tab.title}</span>
                  <button type="button" className="dock-tab-close" title={t('term_close')} onClick={(e) => closeTab(tab.id, e)}>
                    <Icon name="close" size={10} />
                  </button>
                </div>
              ))}
            </div>
            {tabIds.length > 1 && (
              <span className="dock-tab-nav">
                <button type="button" className="dock-tab-add" title={t('term_tab_prev')} disabled={activeIndex <= 0} onClick={() => shiftTab(-1)}>
                  <Icon name="chevronLeft" size={12} />
                </button>
                <button type="button" className="dock-tab-add" title={t('term_tab_next')} disabled={activeIndex >= tabIds.length - 1} onClick={() => shiftTab(1)}>
                  <Icon name="chevronRight" size={12} />
                </button>
              </span>
            )}
            {active !== LOG_TAB && (
              <button type="button" className="dock-tab-add" ref={addRef} title={t('term_new_local')} onClick={onAddClick}>
                <Icon name="plus" size={12} />
              </button>
            )}
          </div>
          {active === LOG_TAB && (
            <>
              <span className="spacer" />
              <button className="icon-btn" title={t('log_copy')} onClick={onCopy}><Icon name="copy" size={14} /></button>
              <button className="icon-btn" title={t('log_clear')} onClick={onClear}><Icon name="eraser" size={14} /></button>
            </>
          )}
        </div>
        <div className="dock-body">
          <div className={`log-body mono${active === LOG_TAB ? '' : ' hidden'}`} ref={bodyRef}>
            {lines.map((l, i) => <div key={i} className={`log-line ${l.level || ''}`}>[{l.time}]&nbsp; {l.text}</div>)}
          </div>
          {tabs.map((tab) => (
            <div key={tab.id} className={`term-wrap${active === tab.id ? '' : ' hidden'}`}>
              <TerminalView sessionId={tab.id} active={active === tab.id} theme={theme} fontSize={fontSize} fontFamily={fontFamily} scrollback={scrollback} onExit={() => closeTab(tab.id)} />
            </div>
          ))}
        </div>
      </div>
      {pickOpen && active !== LOG_TAB && (
        <ContextMenu className="term-pick" anchorEl={addRef.current} x={0} y={0}
          items={pickItems.length ? pickItems : [{ id: 'none', label: t('term_none'), disabled: true }]}
          onClose={() => setPickOpen(false)} onPick={onPick} />
      )}
    </>
  );
});

export default LogPanel;
