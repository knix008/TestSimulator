import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import ToolWindow from './ToolWindow';
import MenuPopup from './MenuPopup';
import { windowKind } from './lib/backend';
import './styles.css';

// ?win=<kind> → this page is one of the separate tool windows (viewer, editor, …);
// ?win=menu is the frameless window every menu is drawn in (see MenuPopup.jsx).
const page = windowKind === 'menu' ? <MenuPopup /> : windowKind ? <ToolWindow /> : <App />;
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {page}
  </React.StrictMode>,
);
