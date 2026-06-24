import { useState, type FocusEvent, type KeyboardEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { DEFAULT_ADMIN_PASSWORD, DEFAULT_ADMIN_USERNAME } from '../config/defaults';
import { useTranslation } from '../i18n';
import './LoginPage.css';

function readCapsLock(event: KeyboardEvent | FocusEvent): boolean {
  if ('getModifierState' in event) {
    return event.getModifierState('CapsLock');
  }
  return false;
}

export function LoginPage() {
  const { login } = useAuth();
  const t = useTranslation();
  const [username, setUsername] = useState(DEFAULT_ADMIN_USERNAME);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleCapsLockChange = (event: KeyboardEvent<HTMLInputElement> | FocusEvent<HTMLInputElement>) => {
    setCapsLockOn(readCapsLock(event));
  };

  const handlePasswordBlur = () => {
    setCapsLockOn(false);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(username, password);
      setPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('login.failed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-page-card">
        <div className="login-page-brand">
          <strong>MyProject Web</strong>
          <span>{t('app.subtitle')}</span>
        </div>

        <h1>{t('login.title')}</h1>
        <p className="login-page-desc">{t('login.desc')}</p>
        <p className="login-page-default-account">
          {t('login.defaultAccount')} <strong>{DEFAULT_ADMIN_USERNAME}</strong> /{' '}
          <strong>{DEFAULT_ADMIN_PASSWORD}</strong>
        </p>

        <form onSubmit={handleSubmit}>
          <label>
            {t('login.username')}
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
              disabled={submitting}
            />
          </label>
          <label>
            {t('login.password')}
            <div className="login-password-wrap">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={handleCapsLockChange}
                onKeyUp={handleCapsLockChange}
                onFocus={handleCapsLockChange}
                onBlur={handlePasswordBlur}
                autoComplete="current-password"
                disabled={submitting}
              />
              <button
                type="button"
                className="login-password-toggle"
                onClick={() => setShowPassword((current) => !current)}
                disabled={submitting}
                aria-label={showPassword ? t('login.hidePasswordAria') : t('login.showPasswordAria')}
                aria-pressed={showPassword}
              >
                {showPassword ? t('login.hidePassword') : t('login.showPassword')}
              </button>
            </div>
            {capsLockOn && (
              <span className="login-caps-lock" role="status">
                {t('login.capsLock')}
              </span>
            )}
          </label>

          {error && (
            <div className="login-page-error">
              {error}
            </div>
          )}

          <button type="submit" className="login-page-submit" disabled={submitting}>
            {submitting ? t('login.submitting') : t('login.submit')}
          </button>
        </form>
      </div>
    </div>
  );
}
