import { useState, type FocusEvent, type KeyboardEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { DEFAULT_ADMIN_PASSWORD, DEFAULT_ADMIN_USERNAME } from '../config/defaults';
import './LoginPage.css';

function readCapsLock(event: KeyboardEvent | FocusEvent): boolean {
  if ('getModifierState' in event) {
    return event.getModifierState('CapsLock');
  }
  return false;
}

export function LoginPage() {
  const { login } = useAuth();
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
      setError(err instanceof Error ? err.message : '로그인에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-page-card">
        <div className="login-page-brand">
          <strong>MyProject Web</strong>
          <span>과제 일정 관리</span>
        </div>

        <h1>로그인</h1>
        <p className="login-page-desc">
          계정으로 로그인하여 프로젝트 일정을 확인하고 관리하세요.
        </p>
        <p className="login-page-default-account">
          최초 관리자 계정: <strong>{DEFAULT_ADMIN_USERNAME}</strong> /{' '}
          <strong>{DEFAULT_ADMIN_PASSWORD}</strong>
        </p>

        <form onSubmit={handleSubmit}>
          <label>
            사용자 이름
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
              disabled={submitting}
            />
          </label>
          <label>
            비밀번호
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
                aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
                aria-pressed={showPassword}
              >
                {showPassword ? '숨기기' : '보기'}
              </button>
            </div>
            {capsLockOn && (
              <span className="login-caps-lock" role="status">
                Caps Lock이 켜져 있습니다.
              </span>
            )}
          </label>

          {error && (
            <div className="login-page-error">
              {error}
              <p className="login-page-error-hint">
                DB 연결 전에는 <strong>admin / admin</strong>으로 로그인합니다. DB에 이미 다른
                비밀번호가 저장된 경우에도 동일하게 입력하면 복구됩니다. 서버를 재시작한 뒤 다시
                시도하세요.
              </p>
            </div>
          )}

          <button type="submit" className="login-page-submit" disabled={submitting}>
            {submitting ? '로그인 중…' : '로그인'}
          </button>
        </form>
      </div>
    </div>
  );
}
