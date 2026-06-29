import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../api';
import Layout from '../components/Layout';
import { StatusBadge } from '../components/Badge';
import { useAuth } from '../context/AuthContext';
import { formatDate } from '../utils/helpers';

const REPORT_STORAGE_KEY = 'reqtracking_report_summary';

function loadStoredReport() {
  try {
    const stored = sessionStorage.getItem(REPORT_STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

function saveStoredReport(data) {
  sessionStorage.setItem(REPORT_STORAGE_KEY, JSON.stringify(data));
}

export function clearStoredReport() {
  sessionStorage.removeItem(REPORT_STORAGE_KEY);
}

export default function ReportsPage() {
  const { t } = useTranslation();
  const { canEdit } = useAuth();
  const [report, setReport] = useState(loadStoredReport);
  const [loading, setLoading] = useState(false);
  const [importMsg, setImportMsg] = useState('');
  const fileRef = useRef();

  const generateReport = async () => {
    setLoading(true);
    try {
      const res = await api.get('/reports/summary');
      setReport(res.data);
      saveStoredReport(res.data);
    } finally {
      setLoading(false);
    }
  };

  const exportExcel = async () => {
    const res = await api.get('/excel/export', { responseType: 'blob' });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'requirements_export.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  };

  const importExcel = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await api.post('/excel/import', formData);
      setImportMsg(`${t('reports.importSuccess')}: ${res.data.requirements} reqs, ${res.data.testCases} TCs`);
      if (res.data.errors?.length) setImportMsg(prev => prev + ' (' + res.data.errors.join(', ') + ')');
    } catch (err) {
      setImportMsg(t('reports.importError') + ': ' + (err.response?.data?.error || err.message));
    }
    fileRef.current.value = '';
  };

  return (
    <Layout>
      <div className="page-header">
        <h2>{t('reports.title')}</h2>
        <div style={{ display: 'flex', gap: 12 }}>
          <button className="btn btn-primary" onClick={generateReport} disabled={loading}>
            {loading ? t('common.loading') : t('reports.generate')}
          </button>
          <button className="btn btn-secondary" onClick={exportExcel}>{t('reports.export')}</button>
          {canEdit && (
            <>
              <button className="btn btn-secondary" onClick={() => fileRef.current?.click()}>{t('reports.import')}</button>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={importExcel} />
            </>
          )}
        </div>
      </div>

      {importMsg && (
        <div className="card" style={{ marginBottom: 20, background: 'var(--accent-light)' }}>{importMsg}</div>
      )}

      {report && (
        <>
          {loading && (
            <div className="card" style={{ marginBottom: 16, padding: '10px 16px', fontSize: 13, color: 'var(--text-secondary)' }}>
              {t('reports.refreshing')}
            </div>
          )}
          <div className="report-section">
            <h3>{t('reports.overview')}</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
              {t('reports.generatedAt')}: {formatDate(report.generatedAt)}
            </p>
            <div className="report-overview">
              <div className="report-stat">
                <div className="num">{report.totalRequirements}</div>
                <div className="lbl">{t('dashboard.totalRequirements')}</div>
              </div>
              <div className="report-stat">
                <div className="num">{report.totalTestCases}</div>
                <div className="lbl">{t('dashboard.totalTestCases')}</div>
              </div>
              {Object.entries(report.reqByStatus).map(([k, v]) => (
                <div className="report-stat" key={k}>
                  <div className="num">{v}</div>
                  <div className="lbl">Req: {k}</div>
                </div>
              ))}
              {Object.entries(report.tcByStatus).map(([k, v]) => (
                <div className="report-stat" key={'tc-' + k}>
                  <div className="num">{v}</div>
                  <div className="lbl">TC: {k}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="report-section">
            <h3>{t('reports.reqSummary')}</h3>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>{t('requirements.reqId')}</th>
                    <th>{t('requirements.reqTitle')}</th>
                    <th>{t('requirements.status')}</th>
                    <th>{t('requirements.priority')}</th>
                    <th>{t('requirements.testCases')}</th>
                    <th>{t('requirements.passed')}</th>
                    <th>{t('requirements.failed')}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.requirements.map(r => (
                    <tr key={r.reqId}>
                      <td><strong>{r.reqId}</strong></td>
                      <td>{r.title}</td>
                      <td><StatusBadge status={r.status} /></td>
                      <td>{r.priority}</td>
                      <td>{r.testCount}</td>
                      <td style={{ color: 'var(--success)' }}>{r.passed}</td>
                      <td style={{ color: 'var(--danger)' }}>{r.failed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="report-section">
            <h3>{t('reports.tcSummary')}</h3>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>{t('testCases.tcId')}</th>
                    <th>{t('testCases.requirement')}</th>
                    <th>{t('testCases.tcTitle')}</th>
                    <th>{t('requirements.status')}</th>
                    <th>{t('testCases.result')}</th>
                    <th>{t('testCases.executedBy')}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.testCases.map(tc => (
                    <tr key={tc.tcId}>
                      <td><strong>{tc.tcId}</strong></td>
                      <td>{tc.reqId}</td>
                      <td>{tc.title}</td>
                      <td><StatusBadge status={tc.status} /></td>
                      <td>{tc.result || '-'}</td>
                      <td>{tc.executedBy || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {!report && !loading && (
        <div className="empty-state">{t('reports.emptyHint')}</div>
      )}
    </Layout>
  );
}
