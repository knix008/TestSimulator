import React from 'react';
import ReactDOM from 'react-dom/client';
import i18n from './i18n';
import { seedSettingsFromDisk } from './lib/platform';
import './App.css';

// Settings / About must not download the editor (CodeMirror) or the main App.
// Each window loads this file, then we import only the page it needs.
const route = (window.location.hash || '').replace('#', '').split('?')[0];

async function loadPage() {
  if (route === 'settings') return (await import('./components/SettingsPage.jsx')).default;
  if (route === 'about') return (await import('./components/AboutPage.jsx')).default;
  return (await import('./App.jsx')).default;
}

async function boot() {
  // Restore persisted settings (Electron) before first render so the saved
  // theme/language/export options apply immediately.
  await seedSettingsFromDisk();
  const savedLang = localStorage.getItem('mmm-lang');
  if (savedLang && savedLang !== i18n.language) {
    try { await i18n.changeLanguage(savedLang); } catch { /* ignore */ }
  }
  const Page = await loadPage();
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <Page />
    </React.StrictMode>
  );
}

boot();
