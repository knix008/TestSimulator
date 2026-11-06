import React from 'react';
import { createRoot } from 'react-dom/client';
import './App.css';
import './lib/themes';
import './i18n';
import ErrorBoundary from './components/ErrorBoundary';
import { isDesktop } from './lib/host';
import { restoreFromDisk } from './lib/settings';

document.documentElement.dataset.host = isDesktop ? 'desktop' : 'web';

async function start() {
  await restoreFromDisk();
  // i18n reads its language at import, before the disk copy is back.
  const saved = localStorage.getItem('zm-lang');
  if (saved) {
    const i18n = (await import('./i18n')).default;
    if (i18n.language !== saved) await i18n.changeLanguage(saved);
  }
  const route = window.location.hash.slice(1);
  const pages = {
    settings: () => import('./components/SettingsPage'),
    about: () => import('./components/AboutPage'),
    guide: () => import('./components/GuidePage'),
    thememenu: () => import('./components/ThemeMenuPage'),
  };
  const { default: Page } = await (pages[route] ?? (() => import('./App')))();
  createRoot(document.getElementById('root')).render(<ErrorBoundary><Page /></ErrorBoundary>);
}

start();
