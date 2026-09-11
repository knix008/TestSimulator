import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/global.css';
import { applyPaletteToDocument, DEFAULT_THEME_ID, isThemeId } from './render/theme';

// Paint the stored theme before React mounts so there is no light flash.
try {
  const raw = localStorage.getItem('dbtools.settings');
  const stored = raw ? (JSON.parse(raw).Theme as unknown) : null;
  applyPaletteToDocument(isThemeId(stored) ? stored : DEFAULT_THEME_ID);
} catch {
  applyPaletteToDocument(DEFAULT_THEME_ID);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
