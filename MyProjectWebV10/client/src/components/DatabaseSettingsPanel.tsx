import { useEffect, useState } from 'react';
import {
  getAdminDatabaseSettings,
  saveAdminDatabaseSettings,
  testAdminDatabaseSettings,
} from '../api/client';
import type { AdminDatabaseSettings, DatabaseSettingsInput, DbProviderId } from '../types/project';
import './DatabaseSettingsPanel.css';

interface DatabaseSettingsPanelProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

const emptyForm: DatabaseSettingsInput = {
  provider: 'mariadb',
  host: 'localhost',
  port: 3306,
  database: 'myproject',
  user: 'root',
  password: '',
};

export function DatabaseSettingsPanel({ open, onClose, onSaved }: DatabaseSettingsPanelProps) {
  const [settings, setSettings] = useState<AdminDatabaseSettings | null>(null);
  const [form, setForm] = useState<DatabaseSettingsInput>(emptyForm);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    getAdminDatabaseSettings()
      .then((data) => {
        setSettings(data);
        setForm({
          provider: data.provider as DbProviderId,
          host: data.host,
          port: data.port,
          database: data.database,
          user: data.user,
          password: '',
          file: data.file,
        });
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load settings'))
      .finally(() => setLoading(false));
  }, [open]);

  if (!open) return null;

  const isSqlite = form.provider === 'sqlite';
  const isNetworkDb = !isSqlite;

  const handleProviderChange = (provider: DbProviderId) => {
    const defaultPort =
      settings?.supportedProviders.find((item) => item.id === provider)?.defaultPort ?? 3306;
    setForm((current) => ({
      ...current,
      provider,
      port: defaultPort,
      host: provider === 'sqlite' ? '' : current.host || 'localhost',
      user:
        provider === 'sqlite'
          ? ''
          : provider === 'postgresql'
            ? 'postgres'
            : provider === 'sqlserver'
              ? 'sa'
              : 'root',
      file: provider === 'sqlite' ? current.file ?? './data/myproject.db' : undefined,
    }));
  };

  const handleTest = async () => {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const result = await testAdminDatabaseSettings(form);
      setMessage(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection test failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const result = await saveAdminDatabaseSettings(form);
      setMessage(result.message);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="db-settings-backdrop">
      <div className="db-settings-panel">
        <header>
          <h2>DB 서버 연결 설정</h2>
          <button type="button" className="panel-close-button" onClick={onClose}>
            닫기
          </button>
        </header>

        {settings && !settings.connected && settings.connectionError && (
          <div className="db-settings-warning">
            현재 DB에 연결되지 않았습니다: {settings.connectionError}
          </div>
        )}

        <div className="db-settings-form">
          <label>
            DB 종류
            <select
              value={form.provider}
              onChange={(e) => handleProviderChange(e.target.value as DbProviderId)}
              disabled={loading}
            >
              {settings?.supportedProviders.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name}
                </option>
              ))}
            </select>
          </label>

          {isNetworkDb && (
            <>
              <label>
                서버
                <input
                  value={form.host ?? ''}
                  onChange={(e) => setForm({ ...form, host: e.target.value })}
                  disabled={loading}
                />
              </label>
              <label>
                포트
                <input
                  type="number"
                  value={form.port ?? 0}
                  onChange={(e) => setForm({ ...form, port: Number(e.target.value) })}
                  disabled={loading}
                />
              </label>
              <label>
                사용자
                <input
                  value={form.user ?? ''}
                  onChange={(e) => setForm({ ...form, user: e.target.value })}
                  disabled={loading}
                />
              </label>
              <label>
                비밀번호
                <input
                  type="password"
                  value={form.password ?? ''}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder={settings?.hasPassword ? '변경하지 않으면 기존 비밀번호 유지' : ''}
                  disabled={loading}
                />
              </label>
            </>
          )}

          <label>
            데이터베이스 이름
            <input
              value={form.database}
              onChange={(e) => setForm({ ...form, database: e.target.value })}
              disabled={loading}
            />
          </label>

          {isSqlite && (
            <label>
              파일 경로
              <input
                value={form.file ?? ''}
                onChange={(e) => setForm({ ...form, file: e.target.value })}
                disabled={loading}
              />
            </label>
          )}

          <p className="db-settings-note">
            연결 테스트는 기존 DB에 연결을 확인합니다. DB가 없으면 저장 및 적용 시{' '}
            <strong>{form.database}</strong> DB를 생성하고 테이블 스키마를 적용합니다. 이미 DB가
            있으면 기존 데이터를 유지한 채 연결합니다.
          </p>
        </div>

        {message && <div className="db-settings-message">{message}</div>}
        {error && <div className="db-settings-error">{error}</div>}

        <footer>
          <button type="button" className="panel-footer-button" onClick={handleTest} disabled={loading}>
            연결 테스트
          </button>
          <button type="button" className="panel-footer-button primary" onClick={handleSave} disabled={loading}>
            저장 및 적용
          </button>
        </footer>
      </div>
    </div>
  );
}
