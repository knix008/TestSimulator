import { useEffect, useMemo, useState } from 'react';
import {
  Database,
  Loader2,
  Plug,
  Save,
  Sparkles,
  Table,
} from 'lucide-react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import { IconButton } from '../components/IconButton.jsx';

const DEFAULT_PORTS = { mariadb: 3306, mysql: 3306, postgresql: 5432, mssql: 1433 };

export default function SettingsPage() {
  const { user } = useAuth();
  const { t, language, setLanguage } = useLanguage();
  const { theme, setTheme } = useTheme();
  const [health, setHealth] = useState(null);
  const [dbStatus, setDbStatus] = useState(null);
  const [profile, setProfile] = useState({ name: '', email: '', company: '', department: '' });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '' });
  const [ollama, setOllama] = useState({ baseUrl: '', model: '', models: [], available: false });
  const [dbForm, setDbForm] = useState({
    provider: 'mariadb',
    server: 'localhost',
    port: '3306',
    database: '',
    username: '',
    password: '',
  });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [dbBusy, setDbBusy] = useState(false);

  const providers = useMemo(() => [
    { value: 'mariadb', label: t('settings.providerMaria') },
    { value: 'mysql', label: t('settings.providerMysql') },
    { value: 'postgresql', label: t('settings.providerPg') },
    { value: 'mssql', label: t('settings.providerMssql') },
  ], [t]);

  const load = async () => {
    const [h, p, o, db] = await Promise.all([
      api.health(),
      api.profile(),
      api.ollamaStatus(),
      api.dbStatus(),
    ]);
    setHealth(h);
    setProfile({ name: p.name, email: p.email || '', company: p.company || '', department: p.department || '' });
    setOllama({ baseUrl: o.baseUrl, model: o.model, models: o.models || [], available: o.available });
    setDbStatus(db);
    if (db.config) {
      setDbForm((prev) => ({
        ...prev,
        provider: db.config.provider || 'mariadb',
        server: db.config.server || 'localhost',
        port: String(db.config.port || DEFAULT_PORTS[db.config.provider] || 3306),
        database: db.config.database || '',
        username: db.config.username || '',
        password: '',
      }));
    }
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  const saveProfile = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      await api.updateProfile({ ...profile, ...passwordForm });
      setPasswordForm({ currentPassword: '', newPassword: '' });
      setMessage(t('settings.profileSaved'));
    } catch (err) {
      setError(err.message);
    }
  };

  const saveOllama = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      await api.updateOllamaSettings({ baseUrl: ollama.baseUrl, model: ollama.model });
      const status = await api.ollamaStatus();
      setOllama((prev) => ({ ...prev, models: status.models, available: status.available }));
      setMessage(t('settings.ollamaSaved'));
    } catch (err) {
      setError(err.message);
    }
  };

  const handleProviderChange = (provider) => {
    setDbForm((prev) => ({
      ...prev,
      provider,
      port: String(DEFAULT_PORTS[provider] || 3306),
    }));
  };

  const handleDbConnect = async (e) => {
    e.preventDefault();
    setDbBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await api.connectDb({
        ...dbForm,
        port: Number(dbForm.port),
      });
      setMessage(result.schemaReady
        ? t('settings.connectedWithSchema')
        : t('settings.connectedNeedSchema'));
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setDbBusy(false);
    }
  };

  const handleDbInit = async () => {
    setDbBusy(true);
    setError('');
    try {
      await api.initDbSchema();
      setMessage(t('settings.schemaCreated'));
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setDbBusy(false);
    }
  };

  const handleDbDisconnect = async () => {
    if (!window.confirm(t('settings.disconnectConfirm'))) return;
    setDbBusy(true);
    setError('');
    try {
      await api.disconnectDb();
      setMessage(t('settings.switchedSqlite'));
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setDbBusy(false);
    }
  };

  const dbInfo = health?.db;
  const roleLabel = user?.role ? t(`role.global.${user.role}`) : user?.role;

  return (
    <div className="container">
      <h1>{t('settings.title')}</h1>
      {error && <p className="error">{error}</p>}
      {message && <p className="success">{message}</p>}

      <div className="card">
        <h2>{t('settings.language')}</h2>
        <p className="muted">{t('settings.languageHint')}</p>
        <div className="form-row">
          <label htmlFor="language-select">{t('settings.language')}</label>
          <select
            id="language-select"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          >
            <option value="ko">{t('settings.korean')}</option>
            <option value="en">{t('settings.english')}</option>
          </select>
        </div>
      </div>

      <div className="card">
        <h2>{t('settings.theme')}</h2>
        <p className="muted">{t('settings.themeHint')}</p>
        <div className="form-row">
          <label htmlFor="theme-select">{t('settings.theme')}</label>
          <select
            id="theme-select"
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
          >
            <option value="light">{t('settings.themeLight')}</option>
            <option value="dark">{t('settings.themeDark')}</option>
          </select>
        </div>
      </div>

      <div className="card">
        <h2>{t('settings.systemInfo')}</h2>
        <p>{t('settings.loggedInAs', { username: user?.username, role: roleLabel })}</p>
        {dbInfo && (
          <>
            <p>{dbInfo.mode === 'external'
              ? t('settings.dbModeExternal', { provider: dbInfo.provider })
              : t('settings.dbModeSqlite')}</p>
            {dbInfo.mode === 'external' ? (
              <p>{t('settings.dbConnection', { server: dbInfo.server, port: dbInfo.port, database: dbInfo.database })}</p>
            ) : (
              <p>{t('settings.dbFile')} <code>{dbInfo.path}</code></p>
            )}
          </>
        )}
        {window.electronAPI?.isElectron && (
          <p>{t('settings.platform', { platform: window.electronAPI.platform })}</p>
        )}
      </div>

      {user?.role === 'ADMIN' && (
        <div className="card">
          <h2>{t('settings.dbSettings')}</h2>
          <p className="muted">{t('settings.dbIntro')}</p>
          {dbStatus?.mode === 'external' && dbStatus.connected ? (
            <div>
              <p className="success">{t('settings.dbConnected', { provider: dbStatus.config?.provider, database: dbStatus.config?.database })}</p>
              <IconButton
                icon={Database}
                className="btn-secondary"
                type="button"
                onClick={handleDbDisconnect}
                disabled={dbBusy}
                tooltip={t('settings.tipDisconnect')}
              >
                {t('settings.switchSqlite')}
              </IconButton>
            </div>
          ) : (
            <form onSubmit={handleDbConnect}>
              <div className="form-row">
                <label>{t('settings.dbType')}</label>
                <select value={dbForm.provider} onChange={(e) => handleProviderChange(e.target.value)}>
                  {providers.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              <div className="form-row">
                <label>{t('settings.server')}</label>
                <input value={dbForm.server} onChange={(e) => setDbForm({ ...dbForm, server: e.target.value })} required />
              </div>
              <div className="form-row">
                <label>{t('settings.port')}</label>
                <input value={dbForm.port} onChange={(e) => setDbForm({ ...dbForm, port: e.target.value })} required />
              </div>
              <div className="form-row">
                <label>{t('settings.database')}</label>
                <input value={dbForm.database} onChange={(e) => setDbForm({ ...dbForm, database: e.target.value })} required />
              </div>
              <div className="form-row">
                <label>{t('settings.dbUser')}</label>
                <input value={dbForm.username} onChange={(e) => setDbForm({ ...dbForm, username: e.target.value })} required />
              </div>
              <div className="form-row">
                <label>{t('common.password')}</label>
                <input type="password" value={dbForm.password} onChange={(e) => setDbForm({ ...dbForm, password: e.target.value })} />
              </div>
              <div className="form-actions">
                <IconButton
                  icon={dbBusy ? Loader2 : Plug}
                  className="btn-primary"
                  type="submit"
                  disabled={dbBusy}
                  iconClassName={dbBusy ? 'icon-spin' : ''}
                  tooltip={t('settings.tipConnect')}
                >
                  {dbBusy ? t('settings.connecting') : t('settings.connectExternal')}
                </IconButton>
                {dbStatus?.mode === 'external' && !dbStatus.schemaReady && (
                  <IconButton icon={Table} className="btn-secondary" type="button" onClick={handleDbInit} disabled={dbBusy} tooltip={t('settings.tipInitSchema')}>
                    {t('settings.createTables')}
                  </IconButton>
                )}
              </div>
            </form>
          )}
        </div>
      )}

      <div className="card">
        <h2>{t('settings.profile')}</h2>
        <form onSubmit={saveProfile}>
          <div className="form-row">
            <label>{t('common.name')}</label>
            <input value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
          </div>
          <div className="form-row">
            <label>{t('common.email')}</label>
            <input value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} />
          </div>
          <div className="form-row">
            <label>{t('settings.company')}</label>
            <input value={profile.company} onChange={(e) => setProfile({ ...profile, company: e.target.value })} />
          </div>
          <div className="form-row">
            <label>{t('settings.department')}</label>
            <input value={profile.department} onChange={(e) => setProfile({ ...profile, department: e.target.value })} />
          </div>
          <div className="form-row">
            <label>{t('settings.currentPassword')}</label>
            <input type="password" value={passwordForm.currentPassword} onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })} />
          </div>
          <div className="form-row">
            <label>{t('settings.newPassword')}</label>
            <input type="password" value={passwordForm.newPassword} onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })} />
          </div>
          <IconButton icon={Save} className="btn-primary" type="submit" tooltip={t('settings.tipSaveProfile')}>{t('common.save')}</IconButton>
        </form>
      </div>

      {user?.role === 'ADMIN' && (
        <div className="card">
          <h2>{t('settings.ollamaSettings')}</h2>
          <p className={ollama.available ? 'success' : 'error'}>
            {ollama.available ? t('settings.ollamaOk') : t('settings.ollamaFail')}
          </p>
          <form onSubmit={saveOllama}>
            <div className="form-row">
              <label>{t('settings.baseUrl')}</label>
              <input value={ollama.baseUrl} onChange={(e) => setOllama({ ...ollama, baseUrl: e.target.value })} />
            </div>
            <div className="form-row">
              <label>{t('settings.model')}</label>
              <select value={ollama.model} onChange={(e) => setOllama({ ...ollama, model: e.target.value })}>
                <option value="">{t('settings.autoSelect')}</option>
                {ollama.models.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <IconButton icon={Sparkles} className="btn-primary" type="submit" tooltip={t('settings.tipSaveOllama')}>{t('settings.saveOllama')}</IconButton>
          </form>
        </div>
      )}
    </div>
  );
}
