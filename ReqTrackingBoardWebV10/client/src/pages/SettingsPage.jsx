import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../api';
import Layout from '../components/Layout';
import { useTheme } from '../context/ThemeContext';
import { useMenuLayout } from '../context/MenuLayoutContext';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import DbSetupForm from '../components/DbSetupForm';
import { themes } from '../themes';

const THEME_PREVIEWS = {
  default: ['#1e3a5f', '#3b82f6'],
  dark: ['#020617', '#60a5fa'],
  emerald: ['#064e3b', '#10b981'],
  sunset: ['#7c2d12', '#f97316'],
  purple: ['#4c1d95', '#8b5cf6'],
};

export default function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useTheme();
  const { menuLayout, setMenuLayout } = useMenuLayout();
  const { language, setLanguage } = useLanguage();
  const { user, updateAccount, isAdmin, finishReconfigure } = useAuth();
  const [dbInfo, setDbInfo] = useState(null);

  const [username, setUsername] = useState(user?.username || '');
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [email, setEmail] = useState(user?.email || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [passwordVerified, setPasswordVerified] = useState(false);
  const [verifyMsg, setVerifyMsg] = useState('');
  const [verifyErr, setVerifyErr] = useState('');
  const [sendingCode, setSendingCode] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [accountMsg, setAccountMsg] = useState('');
  const [accountErr, setAccountErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [verifiedEmail, setVerifiedEmail] = useState('');
  const [passwordVerificationRequired, setPasswordVerificationRequired] = useState(false);

  const resetPasswordVerification = useCallback(() => {
    setPasswordVerified(false);
    setVerifiedEmail('');
    setVerificationCode('');
    setNewPassword('');
    setVerifyMsg('');
    setVerifyErr('');
  }, []);

  const loadVerificationStatus = useCallback(async () => {
    try {
      const res = await api.get('/settings/password-verification/status');
      if (!res.data.required) {
        setPasswordVerificationRequired(false);
        setPasswordVerified(true);
        return;
      }
      setPasswordVerificationRequired(true);
      if (res.data.verified) {
        setPasswordVerified(true);
        setVerifiedEmail(res.data.email || email);
      }
    } catch {
      /* ignore */
    }
  }, [email]);

  useEffect(() => {
    api.get('/settings')
      .then(res => setPasswordVerificationRequired(!!res.data.passwordVerificationRequired))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (user) {
      setUsername(user.username || '');
      setDisplayName(user.displayName || '');
      setEmail(user.email || '');
    }
  }, [user?.id, user?.username, user?.displayName, user?.email]);

  useEffect(() => {
    loadVerificationStatus();
  }, [loadVerificationStatus]);

  const handleEmailChange = (e) => {
    const next = e.target.value;
    if (passwordVerificationRequired && passwordVerified && !normalizeCompare(next, verifiedEmail)) {
      resetPasswordVerification();
    }
    setEmail(next);
  };

  const canChangePassword = !passwordVerificationRequired || passwordVerified;

  useEffect(() => {
    if (isAdmin) {
      api.get('/setup/config').then(res => setDbInfo(res.data)).catch(() => {});
    }
  }, [isAdmin]);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setInterval(() => setCooldown(v => Math.max(0, v - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const changeLang = (lng) => {
    setLanguage(lng);
  };

  const showDefaultWarning = user?.username === 'admin';

  const handleSendVerificationCode = async () => {
    setVerifyErr('');
    setVerifyMsg('');
    if (!currentPassword) {
      setVerifyErr(t('settings.verifyNeedPassword'));
      return;
    }
    setSendingCode(true);
    try {
      const res = await api.post('/settings/password-verification/send', {
        currentPassword,
        email: email.trim(),
      });
      setCooldown(res.data.cooldownSeconds || 60);
      setVerifyMsg(t('settings.verifyCodeSent', { email: res.data.email }));
      setPasswordVerified(false);
      setVerifiedEmail('');
      setVerificationCode('');
      setNewPassword('');
    } catch (err) {
      const seconds = err.response?.data?.cooldownSeconds;
      if (seconds) setCooldown(seconds);
      setVerifyErr(err.response?.data?.error || t('settings.verifySendError'));
    } finally {
      setSendingCode(false);
    }
  };

  const handleVerifyCode = async () => {
    setVerifyErr('');
    setVerifyMsg('');
    setVerifyingCode(true);
    try {
      const res = await api.post('/settings/password-verification/verify', {
        code: verificationCode.trim(),
        email: email.trim(),
      });
      setPasswordVerified(true);
      setVerifiedEmail(res.data.email || email.trim());
      setVerifyMsg(t('settings.verifySuccess'));
    } catch (err) {
      setVerifyErr(err.response?.data?.error || t('settings.verifyError'));
    } finally {
      setVerifyingCode(false);
    }
  };

  const handleAccountSave = async (e) => {
    e.preventDefault();
    setAccountMsg('');
    setAccountErr('');
    if (newPassword && passwordVerificationRequired && !passwordVerified) {
      setAccountErr(t('settings.passwordChangeNeedsVerification'));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        currentPassword,
        username: username.trim(),
        displayName: displayName.trim(),
        email: email.trim(),
      };
      if (newPassword) payload.newPassword = newPassword;
      const res = await api.put('/settings/account', payload);
      updateAccount(res.data.token, res.data.user);
      setUsername(res.data.user.username);
      setDisplayName(res.data.user.displayName);
      setEmail(res.data.user.email || '');
      setCurrentPassword('');
      setNewPassword('');
      resetPasswordVerification();
      if (newPassword && res.data.passwordNotificationSent) {
        setAccountMsg(t('settings.accountSavedWithEmail'));
      } else {
        setAccountMsg(t('settings.accountSaved'));
      }
    } catch (err) {
      setAccountErr(err.response?.data?.error || t('settings.accountError'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout>
      <div className="page-header">
        <h2>{t('settings.title')}</h2>
      </div>

      <div className="settings-grid">
        <div className="card">
          <h3 style={{ marginBottom: 20 }}>{t('settings.account')}</h3>
          {showDefaultWarning && (
            <div className="login-error" style={{ background: '#fef3c7', color: '#b45309' }}>
              {t('settings.defaultCredWarning')}
            </div>
          )}
          <form onSubmit={handleAccountSave}>
            <div className="form-group">
              <label>{t('settings.username')}</label>
              <input className="form-control" value={username} onChange={e => setUsername(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>{t('settings.displayName')}</label>
              <input className="form-control" value={displayName} onChange={e => setDisplayName(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>{t('settings.email')}</label>
              <input className="form-control" type="email" value={email} onChange={handleEmailChange} required />
            </div>
            <div className="form-group">
              <label>{t('settings.currentPassword')} *</label>
              <input className="form-control" type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required />
            </div>

            <div className="password-verify-box">
              {passwordVerificationRequired ? (
                <>
                  <h4>{t('settings.passwordVerificationTitle')}</h4>
                  <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 12 }}>
                    {t('settings.passwordVerificationHint')}
                  </p>
                  <div className="form-row">
                    <div className="form-group" style={{ flex: 1 }}>
                      <label>{t('settings.verificationCode')}</label>
                      <input
                        className="form-control"
                        value={verificationCode}
                        onChange={e => setVerificationCode(e.target.value)}
                        placeholder="000000"
                        disabled={passwordVerified}
                      />
                    </div>
                    <div className="form-group settings-action-buttons">
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={handleSendVerificationCode}
                        disabled={sendingCode || cooldown > 0}
                      >
                        {sendingCode ? t('common.loading') : (cooldown > 0 ? `${cooldown}s` : t('settings.sendVerificationCode'))}
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={handleVerifyCode}
                        disabled={verifyingCode || passwordVerified || !verificationCode.trim()}
                      >
                        {verifyingCode ? t('common.loading') : t('settings.verifyCode')}
                      </button>
                    </div>
                  </div>
                  {passwordVerified && (
                    <div className="setup-success">{t('settings.passwordChangeEnabled')}</div>
                  )}
                  {verifyErr && <div className="login-error">{verifyErr}</div>}
                  {verifyMsg && !passwordVerified && <div className="setup-success">{verifyMsg}</div>}
                </>
              ) : (
                <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 0 }}>
                  {t('settings.passwordNoVerificationHint')}
                </p>
              )}
            </div>

            <div className="form-group">
              <label>{t('settings.newPassword')}</label>
              <input
                className="form-control"
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                disabled={!canChangePassword}
              />
              <small style={{ color: 'var(--text-secondary)', marginTop: 6, display: 'block' }}>
                {canChangePassword ? t('settings.newPasswordHint') : t('settings.newPasswordLockedHint')}
              </small>
            </div>

            {accountErr && <div className="login-error">{accountErr}</div>}
            {accountMsg && <div className="setup-success">{accountMsg}</div>}
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? t('common.loading') : t('common.save')}
            </button>
          </form>
        </div>

        <div className="card">
          <h3 style={{ marginBottom: 20 }}>{t('settings.theme')}</h3>
          <div className="theme-options">
            {Object.keys(themes).map(key => (
              <div
                key={key}
                className={`theme-option${theme === key ? ' active' : ''}`}
                onClick={() => setTheme(key)}
              >
                <div
                  className="theme-preview"
                  style={{ background: `linear-gradient(135deg, ${THEME_PREVIEWS[key][0]}, ${THEME_PREVIEWS[key][1]})` }}
                />
                {t(`settings.themes.${key}`)}
              </div>
            ))}
          </div>
        </div>

        {isAdmin && (
          <div className="card settings-db-card">
            <h3 style={{ marginBottom: 12 }}>{t('settings.database')}</h3>
            {dbInfo && (
              <p style={{ color: 'var(--text-secondary)', marginBottom: 16, fontSize: 13 }}>
                {t('settings.databaseCurrent', {
                  type: dbInfo.type,
                  target: dbInfo.type === 'sqlite3' ? dbInfo.filename : `${dbInfo.host}:${dbInfo.port}/${dbInfo.database}`,
                })}
              </p>
            )}
            <p style={{ color: 'var(--text-secondary)', marginBottom: 16, fontSize: 13 }}>
              {t('settings.databaseWarning')}
            </p>
            <DbSetupForm mode="reconfigure" onComplete={finishReconfigure} />
          </div>
        )}

        <div className="card">
          <h3 style={{ marginBottom: 20 }}>{t('settings.menuLayout')}</h3>
          <div className="layout-options">
            {['vertical', 'horizontal'].map(key => (
              <div
                key={key}
                className={`layout-option${menuLayout === key ? ' active' : ''}`}
                onClick={() => setMenuLayout(key)}
              >
                <div className={`layout-preview layout-preview-${key}`} />
                {t(`settings.menuLayouts.${key}`)}
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h3 style={{ marginBottom: 20 }}>{t('settings.language')}</h3>
          <div className="lang-options">
            <button
              className={`lang-btn${language === 'ko' ? ' active' : ''}`}
              onClick={() => changeLang('ko')}
            >
              🇰🇷 한국어
            </button>
            <button
              className={`lang-btn${language === 'en' ? ' active' : ''}`}
              onClick={() => changeLang('en')}
            >
              🇺🇸 English
            </button>
          </div>
        </div>
      </div>
    </Layout>
  );
}

function normalizeCompare(a, b) {
  return (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();
}
