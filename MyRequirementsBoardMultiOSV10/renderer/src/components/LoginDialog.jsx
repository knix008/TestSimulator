import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, LogIn, UserPlus } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { api } from '../api/client.js';
import { IconButton } from '../components/IconButton.jsx';
import { getLastUsername } from '../lib/lastUsername.js';
import { ROUTES } from '../lib/routes.js';

const appIconUrl = `${import.meta.env.BASE_URL}icon.png`;

export default function LoginDialog({ open }) {
  const { login } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({
    username: '',
    password: '',
    name: '',
    email: '',
  });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm((prev) => ({
      ...prev,
      username: getLastUsername(),
      password: '',
    }));
    setError('');
    setMessage('');
    setMode('login');
  }, [open]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(form.username, form.password);
      navigate(ROUTES.home, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      const res = await api.register(form);
      setMessage(res.message);
      setMode('login');
    } catch (err) {
      setError(err.message);
    }
  };

  const switchToLogin = () => {
    setMode('login');
    setForm((prev) => ({
      ...prev,
      username: getLastUsername() || prev.username,
      password: '',
    }));
  };

  if (!open) return null;

  return (
    <div className="login-screen__panel">
      <div
        className="modal-dialog login-dialog"
        role="dialog"
        aria-labelledby="login-dialog-title"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="login-dialog__header">
          <div className="login-dialog__brand">
            <img
              src={appIconUrl}
              alt=""
              className="login-dialog__icon"
              width={48}
              height={48}
            />
            <div>
              <h2 id="login-dialog-title">MyRequirementsBoard <span className="login-dialog__version">v{__APP_VERSION__}</span></h2>
              <p className="muted login-dialog__subtitle">{t('login.subtitle')}</p>
            </div>
          </div>
        </header>

        <div className="login-dialog__body">
          <p className="muted login-dialog__hint">{t('login.defaultAccount')}</p>

          {error && <p className="error">{error}</p>}
          {message && <p className="success">{message}</p>}

          {mode === 'login' ? (
            <form onSubmit={handleLogin}>
              <div className="form-row">
                <label>{t('common.id')}</label>
                <input
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  autoComplete="username"
                  autoFocus
                  required
                />
              </div>
              <div className="form-row">
                <label>{t('common.password')}</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  autoComplete="current-password"
                  required
                />
              </div>
              <div className="form-actions login-dialog__actions">
                <IconButton icon={LogIn} className="btn-primary" type="submit" tooltip={t('login.tipLogin')} disabled={submitting}>
                  {submitting ? t('common.loading') : t('login.login')}
                </IconButton>
                <IconButton icon={UserPlus} className="btn-secondary" type="button" onClick={() => setMode('register')} tooltip={t('login.tipRegister')} disabled={submitting}>
                  {t('login.registerRequest')}
                </IconButton>
              </div>
            </form>
          ) : (
            <form onSubmit={handleRegister}>
              <div className="form-row">
                <label>{t('common.id')}</label>
                <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
              </div>
              <div className="form-row">
                <label>{t('common.password')}</label>
                <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
              </div>
              <div className="form-row">
                <label>{t('common.name')}</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div className="form-row">
                <label>{t('common.email')}</label>
                <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="form-actions login-dialog__actions">
                <IconButton icon={UserPlus} className="btn-primary" type="submit" tooltip={t('login.tipSubmitRegister')}>
                  {t('login.registerRequest')}
                </IconButton>
                <IconButton icon={ArrowLeft} className="btn-secondary" type="button" onClick={switchToLogin} tooltip={t('login.tipBackLogin')}>
                  {t('login.backToLogin')}
                </IconButton>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
