import { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../api';
import Layout from '../components/Layout';
import ReportCharts from '../components/ReportCharts';
import { StatusBadge } from '../components/Badge';
import { formatDate } from '../utils/helpers';
import { captureReportCharts } from '../utils/reportChartCapture';
import { exportReportMarkdown, exportReportWord, exportReportPdf } from '../utils/reportExport';
import { sanitizeExportPrefix } from '../utils/exportPrefix';
import { statusOverviewEntries } from '../utils/reportChartData';
import { useDataSync } from '../context/DataSyncContext';
import { useProject } from '../context/ProjectContext';

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
  const { refreshToken } = useDataSync();
  const { activeProjectId, activeProject } = useProject();
  const [report, setReport] = useState(loadStoredReport);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportPrefix, setExportPrefix] = useState('');
  const chartsRef = useRef(null);

  useEffect(() => {
    setExportPrefix(activeProject?.name ?? '');
  }, [activeProjectId, activeProject?.name]);

  const generateReport = useCallback(async ({ silent = false } = {}) => {
    if (!activeProjectId) return;
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await api.get('/reports/summary', { params: { projectId: activeProjectId } });
      setReport(res.data);
      saveStoredReport(res.data);
    } catch (err) {
      setReport(null);
      alert(err.response?.data?.error || t('common.error'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeProjectId, t]);

  useEffect(() => {
    if (!activeProjectId) {
      setReport(null);
      return;
    }
    const stored = loadStoredReport();
    if (stored?.projectId !== activeProjectId) {
      setReport(null);
    }
    generateReport({ silent: stored?.projectId === activeProjectId });
  }, [activeProjectId, generateReport]);

  useEffect(() => {
    if (refreshToken === 0) return undefined;
    generateReport({ silent: true });
    return undefined;
  }, [refreshToken, generateReport]);

  const exportLabels = () => {
    const prefix = sanitizeExportPrefix(exportPrefix);
    const baseTitle = t('reports.title');
    return {
      title: prefix ? `${prefix} — ${baseTitle}` : baseTitle,
      filePrefix: prefix,
      generatedAt: t('reports.generatedAt'),
    overview: t('reports.overview'),
    charts: t('reports.charts'),
    reqSummary: t('reports.reqSummary'),
    tcSummary: t('reports.tcSummary'),
    totalRequirements: t('dashboard.totalRequirements'),
    totalTestCases: t('dashboard.totalTestCases'),
    reqByStatus: t('dashboard.reqByStatus'),
    tcByStatus: t('dashboard.tcByStatus'),
    reqByPriority: t('dashboard.reqByPriority'),
    reqByCategory: t('dashboard.reqByCategory'),
    noChartData: t('reports.noChartData'),
    reqId: t('requirements.reqId'),
    reqTitle: t('requirements.reqTitle'),
    status: t('requirements.status'),
    priority: t('requirements.priority'),
    testCases: t('requirements.testCases'),
    passed: t('requirements.passed'),
    failed: t('requirements.failed'),
    tcId: t('testCases.tcId'),
    requirement: t('testCases.requirement'),
    tcTitle: t('testCases.tcTitle'),
    result: t('testCases.result'),
    executedBy: t('testCases.executedBy'),
    chartTitles: {
      reqByStatus: t('dashboard.reqByStatus'),
      tcByStatus: t('dashboard.tcByStatus'),
      reqByPriority: t('dashboard.reqByPriority'),
      reqByCategory: t('dashboard.reqByCategory'),
    },
    };
  };

  const requireReport = () => {
    if (!report) {
      alert(t('reports.exportNoReport'));
      return false;
    }
    return true;
  };

  const runExport = async (exporter) => {
    if (!requireReport()) return;
    setExporting(true);
    try {
      const chartImages = await captureReportCharts(chartsRef.current);
      await exporter(report, exportLabels(), chartImages);
    } catch (err) {
      alert(err.message || t('common.error'));
    } finally {
      setExporting(false);
    }
  };

  const exportMarkdown = () => runExport(exportReportMarkdown);
  const exportWord = () => runExport(exportReportWord);
  const exportPdf = () => runExport(exportReportPdf);

  const labels = exportLabels();

  return (
    <Layout>
      {!activeProjectId ? (
        <div className="empty-state">{t('projects.selectProject')}</div>
      ) : (
      <>
      <div className="page-header">
        <h2>{t('reports.title')}{activeProject ? ` — ${activeProject.name}` : ''}</h2>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button
            className="btn btn-primary"
            onClick={() => generateReport({ silent: !!report })}
            disabled={loading || exporting || refreshing}
          >
            <span className="btn-icon" aria-hidden="true">🔄</span>
            {loading || refreshing ? t('common.loading') : t('reports.refresh')}
          </button>
          <button className="btn btn-secondary" onClick={exportWord} disabled={!report || exporting}>
            <span className="btn-icon" aria-hidden="true">📘</span>
            {exporting ? t('common.loading') : t('reports.exportWord')}
          </button>
          <button className="btn btn-secondary" onClick={exportMarkdown} disabled={!report || exporting}>
            <span className="btn-icon" aria-hidden="true">📝</span>
            {exporting ? t('common.loading') : t('reports.exportMarkdown')}
          </button>
          <button className="btn btn-secondary" onClick={exportPdf} disabled={!report || exporting}>
            <span className="btn-icon" aria-hidden="true">📕</span>
            {exporting ? t('common.loading') : t('reports.exportPdf')}
          </button>
        </div>
      </div>

      <div className="toolbar" style={{ marginBottom: 16 }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span>{t('common.exportPrefix')}</span>
          <input
            className="form-control"
            style={{ maxWidth: 240 }}
            value={exportPrefix}
            onChange={e => setExportPrefix(e.target.value)}
            placeholder={activeProject?.name ?? ''}
          />
        </label>
      </div>

      {report && (
        <>
          {refreshing && (
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
              {statusOverviewEntries(report.reqByStatus).map(([k, v]) => (
                <div className="report-stat" key={k}>
                  <div className="num">{v}</div>
                  <div className="lbl">Req: {k}</div>
                </div>
              ))}
              {statusOverviewEntries(report.tcByStatus).map(([k, v]) => (
                <div className="report-stat" key={'tc-' + k}>
                  <div className="num">{v}</div>
                  <div className="lbl">TC: {k}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="report-section" ref={chartsRef}>
            <h3>{t('reports.charts')}</h3>
            <ReportCharts report={report} labels={labels} />
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

      {!report && loading && (
        <div className="empty-state">{t('common.loading')}</div>
      )}

      {!report && !loading && (
        <div className="empty-state">{t('reports.emptyHint')}</div>
      )}
      </>
      )}
    </Layout>
  );
}
