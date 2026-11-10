// First: platform.js reads window.desktopAPI when it is evaluated.
import './lib/desktop-bridge.js';
import React from 'react';
import ReactDOM from 'react-dom/client';
import './i18n.js';
import App from './App.jsx';
import ThemePopup from './components/ThemePopup.jsx';
import './App.css';
import './app3d.css';
import { openExternal } from './lib/platform.js';

// Any web link in the page opens in the system's web browser, never inside
// the app's own window (which would replace the program with the site).
document.addEventListener('click', (e) => {
  const a = e.target?.closest?.('a[href]');
  if (!a || e.defaultPrevented || !/^https?:/i.test(a.getAttribute('href') || '')) return;
  e.preventDefault();
  Promise.resolve(openExternal(a.href)).catch(() => {});
});

// The host opens the theme popup with its kind and current theme set by an
// init script; the query string is the same thing for a plain browser.
const params = new URLSearchParams(window.location.search);
const hosted = window.__MY3DOBJECTS_POPUP__ || {};
const popup = hosted.kind || params.get('popup');
const current = hosted.current || params.get('current') || 'dark';

// StrictMode is deliberately not used: its double-invoked effects would
// create and dispose the WebGL view twice on every mount.
// The desktop window is built hidden; App shows it once its first frame is up.
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(popup === 'theme' ? <ThemePopup current={current} /> : <App />);
