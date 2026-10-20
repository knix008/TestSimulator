// First: platform.js reads window.desktopAPI when it is evaluated.
import './lib/desktop-bridge.js';
import React from 'react';
import ReactDOM from 'react-dom/client';
import './i18n.js';
import App from './App.jsx';
import ThemePopup from './components/ThemePopup.jsx';
import './App.css';

// The host opens the theme popup with its kind and current theme set by an
// init script; the query string is the same thing for a plain browser.
const params = new URLSearchParams(window.location.search);
const hosted = window.__MYPDF_POPUP__ || {};
const popup = hosted.kind || params.get('popup');
const current = hosted.current || params.get('current') || 'dark';

// StrictMode is deliberately not used: its double-invoked effects cancel and
// restart every pdf.js render pass, which makes page rendering flicker and
// wastes work on large documents.
const root = ReactDOM.createRoot(document.getElementById('root'));
if (popup === 'theme') {
  root.render(<ThemePopup current={current} />);
} else {
  root.render(<App />);
  // The desktop window is built hidden; show it once the first frame is up.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    window.desktopAPI?.ready?.().catch(() => {});
  }));
}
