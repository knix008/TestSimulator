import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../api';
import Layout from '../components/Layout';
import Modal from '../components/Modal';

const emptyForm = {
  username: '', password: '', displayName: '', email: '', role: 'user', permission: 'view', isActive: true,
};

export default function UsersPage() {
  const { t } = useTranslation();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [passwordVerified, setPasswordVerified] = useState(false);
  const [verifiedEmail, setVerifiedEmail] = useState('');
  const [verifyMsg, setVerifyMsg] = useState('');
  const [verifyErr, setVerifyErr] = useState('');
  const [sendingCode, setSendingCode] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const load = () => {
    api.get('/users').then(res => setUsers(res.data)).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setInterval(() => setCooldown(v => Math.max(0, v - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const resetVerification = () => {
    setPasswordVerified(false);
    setVerifiedEmail('');
    setVerificationCode('');
    setForm(f => ({ ...f, password: '' }));
    setVerifyMsg('');
    setVerifyErr('');
  };

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    resetVerification();
    setModalOpen(true);
  };

  const openEdit = async (user) => {
    setEditing(user);
    setForm({
      username: user.username, password: '', displayName: user.displayName, email: user.email || '',
      role: user.role, permission: user.permission, isActive: user.isActive,
    });
    resetVerification();
    setModalOpen(true);
    try {
      const res = await api.get(`/users/${user.id}/password-verification/status`);
      if (res.data.verified) {
        setPasswordVerified(true);
        setVerifiedEmail(res.data.email || user.email);
      }
    } catch { /* ignore */ }
  };

  const handleSendVerificationCode = async () => {
    if (!editing) return;
    setVerifyErr('');
    setVerifyMsg('');
    setSendingCode(true);
    try {
      const res = await api.post(`/users/${editing.id}/password-verification/send`, {
        email: form.email.trim(),
      });
      setCooldown(res.data.cooldownSeconds || 60);
      setVerifyMsg(t('users.verifyCodeSent', { email: res.data.email }));
      setPasswordVerified(false);
      setVerifiedEmail('');
      setVerificationCode('');
      setForm(f => ({ ...f, password: '' }));
    } catch (err) {
      const seconds = err.response?.data?.cooldownSeconds;
      if (seconds) setCooldown(seconds);
      setVerifyErr(err.response?.data?.error || t('users.verifySendError'));
    } finally {
      setSendingCode(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!editing) return;
    setVerifyErr('');
    setVerifyMsg('');
    setVerifyingCode(true);
    try {
      const res = await api.post(`/users/${editing.id}/password-verification/verify`, {
        code: verificationCode.trim(),
        email: form.email.trim(),
      });
      setPasswordVerified(true);
      setVerifiedEmail(res.data.email || form.email.trim());
      setVerifyMsg(t('users.verifySuccess'));
    } catch (err) {
      setVerifyErr(err.response?.data?.error || t('users.verifyError'));
    } finally {
      setVerifyingCode(false);
    }
  };

  const handleSave = async () => {
    if (editing && form.password && !passwordVerified) {
      alert(t('users.passwordChangeNeedsVerification'));
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        const payload = {
          displayName: form.displayName, email: form.email.trim(), role: form.role,
          permission: form.permission, isActive: form.isActive,
        };
        if (form.password) payload.password = form.password;
        const res = await api.put(`/users/${editing.id}`, payload);
        if (form.password && res.data.passwordNotificationSent) {
          alert(t('users.passwordNotificationSent', { email: form.email.trim() }));
        }
      } else {
        await api.post('/users', form);
      }
      setModalOpen(false);
      load();
    } catch (err) {
      alert(err.response?.data?.error || t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (user) => {
    if (!confirm(t('users.confirmDelete'))) return;
    try {
      await api.delete(`/users/${user.id}`);
      load();
    } catch (err) {
      alert(err.response?.data?.error || t('common.error'));
    }
  };

  const set = (field) => (e) => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    if (field === 'email' && passwordVerified && val.trim().toLowerCase() !== verifiedEmail.toLowerCase()) {
      resetVerification();
    }
    setForm(f => ({ ...f, [field]: val }));
  };

  return (
    <Layout>
      <div className="page-header">
        <h2>{t('users.title')}</h2>
        <button className="btn btn-primary" onClick={openAdd}>+ {t('users.add')}</button>
      </div>

      {loading ? (
        <div className="empty-state">{t('common.loading')}</div>
      ) : users.length === 0 ? (
        <div className="empty-state">{t('users.noData')}</div>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>{t('users.username')}</th>
                <th>{t('users.displayName')}</th>
                <th>{t('users.email')}</th>
                <th>{t('users.role')}</th>
                <th>{t('users.permission')}</th>
                <th>{t('users.isActive')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr key={user.id}>
                  <td><strong>{user.username}</strong></td>
                  <td>{user.displayName}</td>
                  <td>{user.email || '-'}</td>
                  <td>{user.role === 'admin' ? t('users.admin') : t('users.user')}</td>
                  <td>{user.permission === 'edit' ? t('users.editPerm') : t('users.view')}</td>
                  <td>{user.isActive ? '✅' : '❌'}</td>
                  <td className="actions-cell">
                    <button className="btn btn-sm btn-secondary" onClick={() => openEdit(user)}>{t('common.edit')}</button>
                    {user.username !== 'admin' && (
                      <button className="btn btn-sm btn-danger" onClick={() => handleDelete(user)}>{t('common.delete')}</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? t('users.edit') : t('users.add')}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>{t('common.cancel')}</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? t('common.loading') : t('common.save')}
            </button>
          </>
        }
      >
        {!editing && (
          <div className="form-group">
            <label>{t('users.username')} *</label>
            <input className="form-control" value={form.username} onChange={set('username')} required />
          </div>
        )}
        <div className="form-group">
          <label>{t('users.displayName')} *</label>
          <input className="form-control" value={form.displayName} onChange={set('displayName')} required />
        </div>
        <div className="form-group">
          <label>{t('users.email')} *</label>
          <input className="form-control" type="email" value={form.email} onChange={set('email')} required />
        </div>

        {editing && (
          <div className="password-verify-box">
            <h4>{t('users.passwordVerificationTitle')}</h4>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 12 }}>
              {t('users.passwordVerificationHint')}
            </p>
            <div className="form-row">
              <div className="form-group" style={{ flex: 1 }}>
                <label>{t('users.verificationCode')}</label>
                <input
                  className="form-control"
                  value={verificationCode}
                  onChange={e => setVerificationCode(e.target.value)}
                  placeholder="000000"
                  disabled={passwordVerified}
                />
              </div>
              <div className="form-group" style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleSendVerificationCode}
                  disabled={sendingCode || cooldown > 0}
                >
                  {sendingCode ? t('common.loading') : (cooldown > 0 ? `${cooldown}s` : t('users.sendVerificationCode'))}
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleVerifyCode}
                  disabled={verifyingCode || passwordVerified || !verificationCode.trim()}
                >
                  {verifyingCode ? t('common.loading') : t('users.verifyCode')}
                </button>
              </div>
            </div>
            {passwordVerified && <div className="setup-success">{t('users.passwordChangeEnabled')}</div>}
            {verifyErr && <div className="login-error">{verifyErr}</div>}
            {verifyMsg && !passwordVerified && <div className="setup-success">{verifyMsg}</div>}
          </div>
        )}

        <div className="form-group">
          <label>{t('users.password')}{editing ? ` (${t('users.passwordOptional')})` : ' *'}</label>
          <input
            className="form-control"
            type="password"
            value={form.password}
            onChange={set('password')}
            disabled={editing && !passwordVerified}
          />
          {editing && !passwordVerified && (
            <small style={{ color: 'var(--text-secondary)', marginTop: 6, display: 'block' }}>
              {t('users.passwordLockedHint')}
            </small>
          )}
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>{t('users.role')}</label>
            <select className="form-control" value={form.role} onChange={set('role')}>
              <option value="user">{t('users.user')}</option>
              <option value="admin">{t('users.admin')}</option>
            </select>
          </div>
          <div className="form-group">
            <label>{t('users.permission')}</label>
            <select className="form-control" value={form.permission} onChange={set('permission')}>
              <option value="view">{t('users.view')}</option>
              <option value="edit">{t('users.editPerm')}</option>
            </select>
          </div>
        </div>
        {editing && (
          <div className="form-group">
            <label>
              <input type="checkbox" checked={form.isActive} onChange={set('isActive')} style={{ marginRight: 8 }} />
              {t('users.isActive')}
            </label>
          </div>
        )}
      </Modal>
    </Layout>
  );
}
