import { useEffect, useState } from "react";
import { api } from "../api";
import { DashboardData } from "../types";

function Bar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total === 0 ? 0 : (count / total) * 100;
  return (
    <div className="bar-row">
      <span className="bar-label">{label}</span>
      <div className="bar-track">
        <div className="bar-fill" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="bar-count">{count}</span>
    </div>
  );
}

const PRIORITY_COLORS = ["#94a3b8", "#3b82f6", "#f59e0b", "#ef4444"];
const STATUS_COLORS = ["#94a3b8", "#3b82f6", "#8b5cf6", "#10b981", "#6b7280"];
const RUN_COLORS = ["#94a3b8", "#10b981", "#ef4444", "#f59e0b"];

export default function DashboardPage({ connected }: { connected: boolean }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      const result = await api.getDashboard();
      setData(result);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    if (connected) refresh();
  }, [connected]);

  if (!connected) {
    return (
      <div className="card">
        <p>먼저 "DB 연결" 메뉴에서 데이터베이스에 연결하세요.</p>
      </div>
    );
  }

  if (error) return <p className="msg-error">{error}</p>;
  if (!data) return <p>불러오는 중...</p>;

  return (
    <div className="dashboard-grid">
      <div className="card stat-card">
        <span className="stat-value">{data.totalRequirements}</span>
        <span className="stat-label">전체 요구사항</span>
      </div>
      <div className="card stat-card">
        <span className="stat-value">{data.totalTestCases}</span>
        <span className="stat-label">전체 테스트 케이스</span>
      </div>
      <div className="card stat-card">
        <span className="stat-value">{data.coveragePct.toFixed(0)}%</span>
        <span className="stat-label">테스트 커버리지</span>
      </div>
      <div className="card stat-card">
        <span className="stat-value">{data.passRatePct.toFixed(0)}%</span>
        <span className="stat-label">통과율</span>
      </div>

      <div className="card chart-card">
        <h3>우선순위별 요구사항</h3>
        {data.priorityBreakdown.map((p, i) => (
          <Bar key={p.name} label={p.name} count={p.count} total={data.totalRequirements} color={PRIORITY_COLORS[i]} />
        ))}
      </div>

      <div className="card chart-card">
        <h3>상태별 요구사항</h3>
        {data.statusBreakdown.map((s, i) => (
          <Bar key={s.name} label={s.name} count={s.count} total={data.totalRequirements} color={STATUS_COLORS[i]} />
        ))}
      </div>

      <div className="card chart-card">
        <h3>테스트 실행 결과 (최신 실행 기준)</h3>
        {data.runStatusBreakdown.map((r, i) => (
          <Bar key={r.name} label={r.name} count={r.count} total={data.totalTestCases} color={RUN_COLORS[i]} />
        ))}
      </div>
    </div>
  );
}
