import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import ToolWindow from './ToolWindow';
import MenuPopup from './MenuPopup';
import { windowKind } from './lib/backend';
import { watchTitlebarArea } from './lib/titlebar';
import './styles.css';

// ?win=<kind> → this page is one of the separate tool windows (viewer, editor, …);
// ?win=menu is the frameless window every menu is drawn in (see MenuPopup.jsx).
const page = windowKind === 'menu' ? <MenuPopup /> : windowKind ? <ToolWindow /> : <App />;
// Where the page draws the window's title bar itself, keep the native window controls' space free
// (the menu popup has no title bar at all — it is frameless).
if (windowKind !== 'menu') watchTitlebarArea();
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {page}
  </React.StrictMode>,
);
