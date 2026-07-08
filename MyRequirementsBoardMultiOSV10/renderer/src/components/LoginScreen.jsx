import LoginDialog from './LoginDialog.jsx';
import StatusBar from './StatusBar.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';

const appIconUrl = `${import.meta.env.BASE_URL}icon.png`;

export default function LoginScreen() {
  const { t } = useLanguage();

  return (
    <div className="login-screen app-shell">
      <header className="app-header login-screen__header">
        <div className="login-screen__titlebar">
          <img
            src={appIconUrl}
            alt=""
            className="login-screen__icon"
            width={32}
            height={32}
          />
          <div className="login-screen__brand">
            <div className="login-screen__app-name">MyRequirementsBoard <span className="login-screen__version">v{__APP_VERSION__}</span></div>
            <div className="login-screen__tagline">{t('login.subtitle')}</div>
          </div>
        </div>
      </header>
      <main className="login-screen__main app-main">
        <LoginDialog open />
      </main>
      <StatusBar />
    </div>
  );
}
