import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';

const FEATURE_KEYS = ['featureRequirements', 'featureTestCases', 'featureReports'];

export default function LoginPage() {
  const { t, i18n } = useTranslation();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const changeLang = (lng) => {
    i18n.changeLanguage(lng);
    localStorage.setItem('language', lng);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await login(username, password);
      navigate(res.needsSetup ? '/setup' : '/');
    } catch (err) {
      setError(err.response?.data?.error || t('login.error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-shell">
        <aside className="login-brand">
          <div className="login-brand-top">
            <div className="login-lang-switch" role="group" aria-label={t('login.language')}>
              <button
                type="button"
                className={`login-lang-btn${i18n.language === 'ko' ? ' active' : ''}`}
                onClick={() => changeLang('ko')}
              >
                🇰🇷 한국어
              </button>
              <button
                type="button"
                className={`login-lang-btn${i18n.language === 'en' ? ' active' : ''}`}
                onClick={() => changeLang('en')}
              >
                🇺🇸 English
              </button>
            </div>
          </div>

          <div className="login-brand-body">
            <div className="login-logo" aria-hidden="true">{t('login.systemShort')}</div>
            <p className="login-eyebrow">{t('login.eyebrow')}</p>
            <h1 className="login-system-name">{t('login.systemName')}</h1>
            <p className="login-tagline">{t('login.tagline')}</p>
            <p className="login-description">{t('login.description')}</p>
            <ul className="login-features">
              {FEATURE_KEYS.map(key => (
                <li key={key}>{t(`login.${key}`)}</li>
              ))}
            </ul>
          </div>

          <p className="login-brand-footer">{t('login.footer')}</p>
        </aside>

        <main className="login-panel">
          <div className="login-panel-inner">
            <div className="login-panel-header">
              <h2>{t('login.title')}</h2>
              <p>{t('login.panelHint')}</p>
            </div>

            <form className="login-form" onSubmit={handleSubmit}>
              {error && <div className="login-error">{error}</div>}
              <div className="form-group">
                <label htmlFor="login-username">{t('login.username')}</label>
                <input
                  id="login-username"
                  className="form-control"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  autoComplete="username"
                  autoFocus
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="login-password">{t('login.password')}</label>
                <input
                  id="login-password"
                  className="form-control"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>
              <button className="btn btn-primary login-submit" type="submit" disabled={loading}>
                {loading ? t('common.loading') : t('login.submit')}
              </button>
            </form>

            <p className="login-hint">{t('login.hint')}</p>

            <div className="login-mobile-lang">
              <span>{t('login.language')}</span>
              <div className="login-lang-switch" role="group" aria-label={t('login.language')}>
                <button
                  type="button"
                  className={`login-lang-btn${i18n.language === 'ko' ? ' active' : ''}`}
                  onClick={() => changeLang('ko')}
                >
                  🇰🇷 KO
                </button>
                <button
                  type="button"
                  className={`login-lang-btn${i18n.language === 'en' ? ' active' : ''}`}
                  onClick={() => changeLang('en')}
                >
                  🇺🇸 EN
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
