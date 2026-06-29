import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { CHART_COLORS } from '../constants/chartColors';
import { buildReportChartData } from '../utils/reportChartData';

function EmptyChart({ message }) {
  return (
    <div className="report-chart-empty">{message}</div>
  );
}

function StatusPieChart({ data, emptyMessage }) {
  if (!data.length) return <EmptyChart message={emptyMessage} />;
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          outerRadius={90}
          label
          isAnimationActive={false}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}

function CountBarChart({ data, emptyMessage, color }) {
  if (!data.length) return <EmptyChart message={emptyMessage} />;
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data}>
        <XAxis dataKey="name" />
        <YAxis allowDecimals={false} />
        <Tooltip />
        <Bar dataKey="count" fill={color} radius={[6, 6, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export default function ReportCharts({ report, labels }) {
  const { reqStatusData, tcStatusData, priorityData, categoryData } = buildReportChartData(report);
  const noData = labels.noChartData;

  return (
    <div className="chart-grid report-charts">
      <div className="card chart-card" data-report-chart="reqByStatus">
        <h3>{labels.reqByStatus}</h3>
        <StatusPieChart data={reqStatusData} emptyMessage={noData} />
      </div>
      <div className="card chart-card" data-report-chart="tcByStatus">
        <h3>{labels.tcByStatus}</h3>
        <StatusPieChart data={tcStatusData} emptyMessage={noData} />
      </div>
      <div className="card chart-card" data-report-chart="reqByPriority">
        <h3>{labels.reqByPriority}</h3>
        <CountBarChart data={priorityData} emptyMessage={noData} color="#3b82f6" />
      </div>
      <div className="card chart-card" data-report-chart="reqByCategory">
        <h3>{labels.reqByCategory}</h3>
        <CountBarChart data={categoryData} emptyMessage={noData} color="#10b981" />
      </div>
    </div>
  );
}
