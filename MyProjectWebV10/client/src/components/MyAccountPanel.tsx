import { useEffect, useState } from 'react';
import { getMyProfile, updateMyProfile } from '../api/client';
import type { UpdateOwnProfileInput, UserProfile } from '../types/project';
import './MyAccountPanel.css';

interface MyAccountPanelProps {
  open: boolean;
  onClose: () => void;
  onUpdated: () => void;
}

export function MyAccountPanel({ open, onClose, onUpdated }: MyAccountPanelProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [form, setForm] = useState<UpdateOwnProfileInput>({
    currentPassword: '',
    username: '',
    password: '',
    displayName: '',
    email: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    getMyProfile()
      .then((data) => {
        setProfile(data);
        setForm({
          currentPassword: '',
          username: data.username,
          password: '',
          displayName: data.displayName,
          email: data.email,
        });
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load profile'))
      .finally(() => setLoading(false));
  }, [open]);

  if (!open) return null;

  const handleSave = async () => {
    if (!form.currentPassword) {
      setError('현재 비밀번호를 입력하세요.');
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const payload: UpdateOwnProfileInput = {
        currentPassword: form.currentPassword,
        username: form.username?.trim() || undefined,
        displayName: form.displayName?.trim() || undefined,
        email: form.email?.trim() || undefined,
      };
      if (form.password) {
        payload.password = form.password;
      }

      await updateMyProfile(payload);
      setMessage('계정 정보가 DB에 저장되었습니다.');
      setForm((current) => ({ ...current, currentPassword: '', password: '' }));
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="my-account-backdrop">
      <div className="my-account-panel">
        <header>
          <h2>내 계정</h2>
          <button type="button" className="panel-close-button" onClick={onClose}>
            닫기
          </button>
        </header>

        {profile?.bootstrap && (
          <div className="my-account-warning">
            DB 연결 전 임시 관리자 세션입니다. ID/비밀번호 변경은 DB 연결 후 `mp_users`에
            저장된 계정으로 로그인해야 가능합니다.
          </div>
        )}

        {profile?.storedInDatabase && (
          <p className="my-account-note">계정 정보는 DB 테이블(mp_users)에 저장됩니다.</p>
        )}

        <div className="my-account-form">
          <label>
            사용자 ID
            <input
              value={form.username ?? ''}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              disabled={loading || profile?.bootstrap}
            />
          </label>
          <label>
            표시 이름
            <input
              value={form.displayName ?? ''}
              onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              disabled={loading || profile?.bootstrap}
            />
          </label>
          <label>
            이메일
            <input
              type="email"
              value={form.email ?? ''}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              disabled={loading || profile?.bootstrap}
            />
          </label>
          <label>
            새 비밀번호
            <input
              type="password"
              value={form.password ?? ''}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="변경하지 않으면 비워 두세요"
              disabled={loading || profile?.bootstrap}
            />
          </label>
          <label>
            현재 비밀번호
            <input
              type="password"
              value={form.currentPassword}
              onChange={(e) => setForm({ ...form, currentPassword: e.target.value })}
              disabled={loading || profile?.bootstrap}
            />
          </label>
        </div>

        {message && <div className="my-account-message">{message}</div>}
        {error && <div className="my-account-error">{error}</div>}

        <footer>
          <button type="button" className="panel-footer-button" onClick={onClose} disabled={loading}>
            취소
          </button>
          <button
            type="button"
            className="panel-footer-button primary"
            onClick={() => void handleSave()}
            disabled={loading || profile?.bootstrap}
          >
            저장
          </button>
        </footer>
      </div>
    </div>
  );
}
