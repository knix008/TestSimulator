import React, { useLayoutEffect } from 'react';
import { THEMES } from '../lib/themes.js';
import { applyTheme } from '../lib/settings.js';

const electron = () => (typeof window !== 'undefined' ? window.electronAPI : undefined);

// Standalone theme list in a child window so the 20 swatches can sit
// outside the main frame with no inner scrollbar.
export default function ThemePopup({ current }) {
  useLayoutEffect(() => {
    applyTheme(current);
    document.documentElement.classList.add('theme-popup');
    document.body.classList.add('theme-popup');
    const el = document.querySelector('.theme-popup-menu');
    if (!el || !electron()?.win?.setPopupSize) return undefined;
    const fit = () => {
      const r = el.getBoundingClientRect();
      electron()?.win?.setPopupSize({
        width: Math.ceil(r.width),
        height: Math.ceil(r.height),
      });
    };
    fit();
    const id = requestAnimationFrame(fit);
    return () => cancelAnimationFrame(id);
  }, [current]);

  return (
    <div className="theme-popup-menu dropdown">
      <ul className="dd-list themes" role="listbox" aria-label="theme">
        {THEMES.map((th) => (
          <li key={th.id}>
            <button
              className={`dd-item${current === th.id ? ' active' : ''}`}
              onClick={() => electron()?.win?.pickTheme?.(th.id)}
              title={th.id}
              role="option"
              aria-selected={current === th.id}
            >
              <span className="theme-swatch small">
                {th.bars.map((c, i) => <i key={i} style={{ background: c }} />)}
              </span>
              <span className="dd-name wide">{th.id}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
