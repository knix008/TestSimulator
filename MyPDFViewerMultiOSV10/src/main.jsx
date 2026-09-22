import React from 'react';
import ReactDOM from 'react-dom/client';
import './i18n.js';
import App from './App.jsx';
import ThemePopup from './components/ThemePopup.jsx';
import './App.css';

const params = new URLSearchParams(window.location.search);
const popup = params.get('popup');

// StrictMode is deliberately not used: its double-invoked effects cancel and
// restart every pdf.js render pass, which makes page rendering flicker and
// wastes work on large documents.
const root = ReactDOM.createRoot(document.getElementById('root'));
if (popup === 'theme') {
  root.render(<ThemePopup current={params.get('current') || 'dark'} />);
} else {
  root.render(<App />);
}
