import React, { useEffect, useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { subscribeUi } from '../lib/ui';
import { Dialog, Icon } from './Chrome';
import { Btn, BtnGroup, Confirm } from '../views/common';
import { InWindow } from './InWindow';

// Renders lib/ui.js: confirmations (the shared Confirm), error popups,
// multi-button questions (save on exit) and toasts. Mounted once in App.
export function UiHost() {
  useLanguage();
  const [ui, setUi] = useState({ asks: [], toasts: [] });
  useEffect(() => subscribeUi(setUi), []);
  const top = ui.asks[ui.asks.length - 1];
  useEffect(() => {
    if (!top) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      top.resolve(top.buttons ? 'cancel' : false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [top]);
  return (
    <>
      {/* On the desktop each question is a window of its own (InWindow); one key per question. */}
      {top && top.kind === 'error' && (
        <InWindow key={top.id} kind="error" width={480} height={180} payload={{ title: top.title, body: String(top.body || '') }} onResult={() => top.resolve(true)} onClose={() => top.resolve(true)}>
          <Dialog title={top.title} icon="alert" onClose={() => top.resolve(true)} className="ui-ask" dataTour="ui-error">
            <p className="error-line"><Icon name="xCircle" size={18} /><span>{top.body}</span></p>
            <div className="dialog-actions"><Btn icon="check" label={t('ok')} primary onClick={() => top.resolve(true)} /></div>
          </Dialog>
        </InWindow>
      )}
      {top && top.kind !== 'error' && top.buttons && (
        <InWindow key={top.id} kind="ask" width={520} height={200} payload={{ title: top.title, body: String(top.body || ''), icon: top.icon, buttons: top.buttons }}
          onResult={(answer) => top.resolve(answer)} onClose={() => top.resolve('cancel')}>
          <Dialog title={top.title} icon={top.icon || 'alert'} onClose={() => top.resolve('cancel')} className="ui-ask" dataTour="ui-ask">
            <p style={{ margin: '4px 0 8px', lineHeight: 1.5, whiteSpace: 'pre-line' }}>{top.body}</p>
            <div className="dialog-actions">
              <BtnGroup>
                {top.buttons.map((b) => <Btn key={b.id} icon={b.icon} label={b.label} primary={b.primary} danger={b.danger} onClick={() => top.resolve(b.id)} />)}
              </BtnGroup>
            </div>
          </Dialog>
        </InWindow>
      )}
      {top && top.kind !== 'error' && !top.buttons && (
        <Confirm key={top.id} title={top.title} body={top.body} okLabel={top.okLabel} danger={top.danger} onOk={() => top.resolve(true)} onCancel={() => top.resolve(false)} />
      )}
      {ui.toasts.length > 0 && (
        <div className="toasts" role="status" aria-live="polite">
          {ui.toasts.map((x) => (
            <div key={x.id} className={`toast ${x.kind}`}><Icon name={x.kind === 'bad' ? 'xCircle' : x.kind === 'warn' ? 'alert' : 'checkCircle'} size={14} /><span>{x.text}</span>{x.action && <button type="button" className="toast-act" onClick={() => x.action.run()}>{x.action.icon && <Icon name={x.action.icon} size={13} />}<span>{x.action.label}</span></button>}</div>
          ))}
        </div>
      )}
    </>
  );
}
