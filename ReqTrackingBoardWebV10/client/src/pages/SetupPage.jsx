import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import DbSetupForm from '../components/DbSetupForm';
import api from '../api';

export default function SetupPage() {
  const { t } = useTranslation();
  const { user, needsSetup, completeSetup } = useAuth();
  const navigate = useNavigate();
  const [connectionError, setConnectionError] = useState('');

  useEffect(() => {
    if (!user) navigate('/login', { replace: true });
  }, [user, navigate]);

  useEffect(() => {
    api.get('/setup/status')
      .then(res => {
        if (res.data.connectionError) setConnectionError(res.data.connectionError);
      })
      .catch(() => {});
  }, []);

  const handleComplete = (data) => {
    completeSetup(data.token, data.user);
    navigate('/projects', { replace: true });
  };

  if (!user || !needsSetup) return null;

  return (
    <div className="login-page">
      <div className="login-card setup-card">
        <h1>{t('setup.title')}</h1>
        <p className="subtitle">{t('setup.subtitle')}</p>
        {connectionError && (
          <div className="login-error" style={{ marginBottom: 16 }}>
            {connectionError}
          </div>
        )}
        <DbSetupForm mode="setup" onComplete={handleComplete} />
      </div>
    </div>
  );
}
