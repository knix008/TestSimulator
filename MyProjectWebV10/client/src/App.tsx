import { AuthProvider } from './context/AuthContext';
import { LanguageProvider } from './i18n';
import { AppRouter } from './components/AppRouter';
import './styles/panelButtons.css';
import './App.css';

export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <div className="app">
          <AppRouter />
        </div>
      </AuthProvider>
    </LanguageProvider>
  );
}
