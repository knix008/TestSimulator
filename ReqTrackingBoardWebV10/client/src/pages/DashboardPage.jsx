import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import api from '../api';
import Layout from '../components/Layout';
import { useAutoRefresh } from '../hooks/useAutoRefresh';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'];

export default function DashboardPage() {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    api.get('/dashboard')
      .then(res => setData(res.data))
      .finally(() => setLoading(false));
  }, []);

  useAutoRefresh(load);

  if (loading) return <Layout><div className="empty-state">{t('common.loading')}</div></Layout>;
  if (!data) return <Layout><div className="empty-state">{t('common.error')}</div></Layout>;

  const reqStatusData = data.requirements.byStatus.map(s => ({ name: s.status, value: s.count }));
  const tcStatusData = data.testCases.byStatus.map(s => ({ name: s.status, value: s.count }));
  const priorityData = data.requirements.byPriority.map(s => ({ name: s.priority, count: s.count }));
  const categoryData = data.requirements.byCategory.map(s => ({ name: s.category, count: s.count }));

  return (
    <Layout>
      <div className="page-header">
        <h2>{t('dashboard.title')}</h2>
      </div>

      <div className="card-grid">
        <div className="stat-card">
          <div className="label">{t('dashboard.totalRequirements')}</div>
          <div className="value accent">{data.requirements.total}</div>
        </div>
        <div className="stat-card">
          <div className="label">{t('dashboard.totalTestCases')}</div>
          <div className="value">{data.testCases.total}</div>
        </div>
        <div className="stat-card">
          <div className="label">{t('dashboard.passRate')}</div>
          <div className="value success">{data.passRate}%</div>
        </div>
        <div className="stat-card">
          <div className="label">{t('dashboard.coverageRate')}</div>
          <div className="value warning">{data.coverage.coverageRate}%</div>
        </div>
      </div>

      <div className="chart-grid">
        <div className="card chart-card">
          <h3>{t('dashboard.reqByStatus')}</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={reqStatusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                {reqStatusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="card chart-card">
          <h3>{t('dashboard.tcByStatus')}</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={tcStatusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                {tcStatusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="card chart-card">
          <h3>{t('dashboard.reqByPriority')}</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={priorityData}>
              <XAxis dataKey="name" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" fill="var(--accent)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card chart-card">
          <h3>{t('dashboard.reqByCategory')}</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={categoryData}>
              <XAxis dataKey="name" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" fill="var(--success)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {data.recentActivity.length > 0 && (
        <div className="card">
          <h3 style={{ marginBottom: 16, color: 'var(--text-secondary)' }}>{t('dashboard.recentActivity')}</h3>
          <div className="table-container" style={{ border: 'none', boxShadow: 'none' }}>
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>{t('requirements.reqTitle')}</th>
                  <th>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {data.recentActivity.map((a, i) => (
                  <tr key={i}>
                    <td>{a.ref_id}</td>
                    <td>{a.title}</td>
                    <td>{new Date(a.updated_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Layout>
  );
}
