import { LanguageProvider } from '@web/i18n';
import { DesktopAuthProvider } from './context/DesktopAuthContext';
import { DesktopAppRouter } from './components/DesktopAppRouter';
import '@web/styles/panelButtons.css';
import './App.css';

export default function App() {
  return (
    <LanguageProvider>
      <DesktopAuthProvider>
        <div className="app desktop-app">
          <DesktopAppRouter />
        </div>
      </DesktopAuthProvider>
    </LanguageProvider>
  );
}
