import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../api';

const DB_TYPE_LABELS = {
  mariadb: 'setup.dbTypes.mariadb',
  mysql: 'setup.dbTypes.mysql',
  postgresql: 'setup.dbTypes.postgresql',
  sqlite3: 'setup.dbTypes.sqlite3',
};

const DEFAULT_PORTS = { mariadb: 3306, mysql: 3306, postgresql: 5432 };

function applyDbConfig(setters, config) {
  const type = config.type || 'mariadb';
  setters.setType(type);
  setters.setHost(config.host || 'localhost');
  setters.setPort(String(config.port || DEFAULT_PORTS[type] || 3306));
  setters.setDbUser(config.user || 'root');
  setters.setPassword(config.password || '');
  setters.setDatabase(config.database || 'reqtracking');
  setters.setFilename(config.filename || './data/reqtracking.db');
}

export default function DbSetupForm({ mode = 'setup', onComplete }) {
  const { t } = useTranslation();
  const isReconfigure = mode === 'reconfigure';

  const [dbTypes, setDbTypes] = useState(['mariadb', 'mysql', 'postgresql', 'sqlite3']);
  const [type, setType] = useState('mariadb');
  const [host, setHost] = useState('localhost');
  const [port, setPort] = useState('3306');
  const [dbUser, setDbUser] = useState('root');
  const [password, setPassword] = useState('');
  const [database, setDatabase] = useState('reqtracking');
  const [filename, setFilename] = useState('./data/reqtracking.db');
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const setters = { setType, setHost, setPort, setDbUser, setPassword, setDatabase, setFilename };

  useEffect(() => {
    api.get('/setup/status')
      .then(res => {
        if (Array.isArray(res.data.supportedTypes) && res.data.supportedTypes.length) {
          setDbTypes(res.data.supportedTypes);
        }
        if (isReconfigure) {
          api.get('/setup/config')
            .then(cfg => applyDbConfig(setters, cfg.data))
            .catch(() => {});
        } else {
          const preset = res.data.current?.installed
            ? res.data.current
            : res.data.defaults || { type: res.data.defaultType || 'mariadb' };
          applyDbConfig(setters, { ...preset, type: res.data.defaultType || preset.type || 'mariadb' });
        }
      })
      .catch(() => {});
  }, [isReconfigure]);

  useEffect(() => {
    if (type === 'sqlite3') return;
    setPort(String(DEFAULT_PORTS[type] || 3306));
  }, [type]);

  const buildConfig = () => ({
    type,
    host,
    port: parseInt(port, 10) || DEFAULT_PORTS[type],
    user: dbUser,
    password,
    database,
    filename,
  });

  const handleTest = async () => {
    setError('');
    setMessage('');
    setTesting(true);
    try {
      const res = await api.post('/setup/test', buildConfig());
      setMessage(res.data.databaseCreated ? t('setup.testSuccessCreated') : t('setup.testSuccess'));
    } catch (err) {
      setError(err.response?.data?.error || t('setup.testError'));
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setError('');
    setMessage('');
    setSaving(true);
    try {
      if (isReconfigure) {
        await api.put('/setup/reconfigure', buildConfig());
        setMessage(t('setup.reconfigureSuccess'));
        onComplete?.();
      } else {
        const res = await api.post('/setup/complete', buildConfig());
        onComplete?.(res.data);
      }
    } catch (err) {
      setError(err.response?.data?.error || t('setup.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const isSqlite = type === 'sqlite3';

  return (
    <>
      {isReconfigure && (
        <p style={{ color: 'var(--text-secondary)', marginBottom: 16, fontSize: 13 }}>
          {t('setup.reconfigureHint')}
        </p>
      )}

      <div className="form-group">
        <label>{t('setup.dbType')}</label>
        <select className="form-control" value={type} onChange={e => setType(e.target.value)}>
          {dbTypes.map(id => (
            <option key={id} value={id}>{t(DB_TYPE_LABELS[id] || id)}</option>
          ))}
        </select>
        {type === 'mariadb' && (
          <small style={{ color: 'var(--text-secondary)', marginTop: 6, display: 'block' }}>
            {t('setup.mariadbDefaultHint')}
          </small>
        )}
      </div>

      {!isSqlite && (
        <>
          <div className="form-row">
            <div className="form-group">
              <label>{t('setup.host')}</label>
              <input className="form-control" value={host} onChange={e => setHost(e.target.value)} />
            </div>
            <div className="form-group">
              <label>{t('setup.port')}</label>
              <input className="form-control" type="number" value={port} onChange={e => setPort(e.target.value)} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>{t('setup.dbUser')}</label>
              <input className="form-control" value={dbUser} onChange={e => setDbUser(e.target.value)} />
            </div>
            <div className="form-group">
              <label>{t('setup.dbPassword')}</label>
              <input className="form-control" type="password" value={password} onChange={e => setPassword(e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label>{t('setup.database')}</label>
            <input className="form-control" value={database} onChange={e => setDatabase(e.target.value)} />
            <small style={{ color: 'var(--text-secondary)', marginTop: 6, display: 'block' }}>
              {t('setup.databaseAutoCreateHint')}
            </small>
          </div>
        </>
      )}

      {isSqlite && (
        <div className="form-group">
          <label>{t('setup.filename')}</label>
          <input className="form-control" value={filename} onChange={e => setFilename(e.target.value)} />
          <small style={{ color: 'var(--text-secondary)', marginTop: 6, display: 'block' }}>
            {t('setup.filenameHint')}
          </small>
        </div>
      )}

      {error && <div className="login-error">{error}</div>}
      {message && <div className="setup-success">{message}</div>}

      <div className="setup-actions">
        <button type="button" className="btn btn-secondary" onClick={handleTest} disabled={testing || saving}>
          {testing ? t('common.loading') : t('setup.testConnection')}
        </button>
        <button type="button" className="btn btn-primary" onClick={handleSave} disabled={testing || saving}>
          {saving ? t('common.loading') : (isReconfigure ? t('setup.saveReconfigure') : t('setup.saveAndContinue'))}
        </button>
      </div>
    </>
  );
}
