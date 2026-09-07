import React from 'react';
import ReactDOM from 'react-dom/client';
import './i18n.js';
import App from './App.jsx';
import './App.css';

// StrictMode is deliberately not used: its double-invoked effects cancel and
// restart every pdf.js render pass, which makes page rendering flicker and
// wastes work on large documents.
ReactDOM.createRoot(document.getElementById('root')).render(<App />);
