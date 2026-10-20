import React from 'react';

// Short-lived confirmations ("Copied", "Saved"). Anything the user might need
// to act on goes through the error dialog instead, never a toast.
export default function Toasts({ toasts, onDismiss }) {
  if (!toasts.length) return null;
  return (
    <div className="toasts">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          className={`toast ${toast.kind || 'info'}`}
          onClick={() => onDismiss(toast.id)}
          title={toast.text}
        >
          {toast.text}
        </button>
      ))}
    </div>
  );
}
