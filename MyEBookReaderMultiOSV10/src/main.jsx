import React from 'react';
import ReactDOM from 'react-dom/client';
import './i18n.js';
import App from './App.jsx';
import MenuHost from './components/MenuHost.jsx';
import DialogHost from './components/DialogHost.jsx';
import './App.css';

// The bundle is three things: the reader, a menu popup, or a dialog popup.
// Which one is decided by the query the window was opened with (see
// electron/childwindows.js). A popup carries no name in its URL — pooled windows
// are handed their identity over IPC — so the route only says which host to run.
const params = new URLSearchParams(window.location.search);
const popup = params.get('popup');

// StrictMode is deliberately not used: its double-invoked effects cancel and
// restart every pdf.js render pass, which makes page rendering flicker and
// wastes work on large documents.
const root = ReactDOM.createRoot(document.getElementById('root'));
if (popup === 'menu') root.render(<MenuHost />);
else if (popup === 'dialog') root.render(<DialogHost />);
else root.render(<App />);
