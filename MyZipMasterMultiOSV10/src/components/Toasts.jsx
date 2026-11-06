import React from 'react';
import { IconCheck, IconInfo, IconX } from './Icons';

const ICONS = { success: IconCheck, error: IconX, info: IconInfo };

// Stacked, auto-dismissing completion popups (bottom-right).
export default function Toasts({ toasts, onDismiss }) {
  if (!toasts.length) return null;
  return (
    <div className="toasts">
      {toasts.map((t) => {
        const Ico = ICONS[t.type] || IconInfo;
        return (
          <div key={t.id} className={`toast toast-${t.type}`} role="status">
            <span className="toast-icon"><Ico size={18} /></span>
            <div className="toast-body">
              <div className="toast-title">{t.title}</div>
              {t.message && <div className="toast-msg" title={t.message}>{t.message}</div>}
            </div>
            <button className="toast-close" onClick={() => onDismiss(t.id)} aria-label="close"><IconX size={14} /></button>
          </div>
        );
      })}
    </div>
  );
}
