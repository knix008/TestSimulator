import { useEffect, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { api } from '../api/client.js';
import { useLanguage } from '../context/LanguageContext.jsx';
import { IconButton } from '../components/IconButton.jsx';
import ErrorDialog from '../components/ErrorDialog.jsx';

export default function OllamaPage() {
  const { t, language } = useLanguage();
  const [status, setStatus] = useState(null);
  const [input, setInput] = useState({
    title: '',
    description: '',
    category: '',
    priority: 'MEDIUM',
    status: 'DRAFT',
  });
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.ollamaStatus().then(setStatus).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    setInput((prev) => ({
      ...prev,
      title: t('ollama.sampleTitle'),
      description: t('ollama.sampleDesc'),
      category: t('ollama.sampleCategory'),
    }));
  }, [language, t]);

  const handleRefine = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const data = await api.refineRequirement(input);
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <h1>{t('ollama.title')}</h1>
      <p className="muted">{t('ollama.subtitle')}</p>

      {status && (
        <div className="card">
          <p>{status.available ? t('ollama.connected') : t('ollama.disconnected')}</p>
          <p>{t('ollama.url')} {status.baseUrl}</p>
          <p>{t('ollama.model')} {status.model || t('ollama.auto')}</p>
          {status.models?.length > 0 && (
            <p>{t('ollama.installedModels')} {status.models.join(', ')}</p>
          )}
        </div>
      )}

      <ErrorDialog message={error} onClose={() => setError('')} />

      <form onSubmit={handleRefine} className="card">
        <div className="form-row">
          <label>{t('common.title')}</label>
          <input value={input.title} onChange={(e) => setInput({ ...input, title: e.target.value })} />
        </div>
        <div className="form-row">
          <label>{t('common.description')}</label>
          <textarea value={input.description} onChange={(e) => setInput({ ...input, description: e.target.value })} />
        </div>
        <div className="form-row">
          <label>{t('common.category')}</label>
          <input value={input.category} onChange={(e) => setInput({ ...input, category: e.target.value })} />
        </div>
        <IconButton
          icon={loading ? Loader2 : Sparkles}
          className="btn-primary"
          type="submit"
          disabled={loading || !status?.available}
          iconClassName={loading ? 'icon-spin' : ''}
          tooltip={t('ollama.tipRefine')}
        >
          {loading ? t('ollama.refining') : t('ollama.refine')}
        </IconButton>
      </form>

      {result && (
        <div className="card">
          <h2>{t('ollama.result', { model: result.model })}</h2>
          <pre style={{ whiteSpace: 'pre-wrap', background: '#f9fafb', padding: 12, borderRadius: 4 }}>
            {JSON.stringify(result.refined, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
