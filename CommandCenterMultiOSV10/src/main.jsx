import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import ToolWindow from './ToolWindow';
import { windowKind } from './lib/backend';
import './styles.css';

// ?win=<kind> → this page is one of the separate tool windows (viewer, editor, …).
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {windowKind ? <ToolWindow /> : <App />}
  </React.StrictMode>,
);
