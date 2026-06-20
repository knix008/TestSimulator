import { useEffect, useState } from "react";
import { api } from "../api";
import PieChart from "../components/PieChart";
import { DashboardData } from "../types";

const PRIORITY_COLORS = ["#94a3b8", "#3b82f6", "#f59e0b", "#ef4444"];
const STATUS_COLORS = ["#94a3b8", "#3b82f6", "#8b5cf6", "#10b981", "#6b7280"];
const RUN_COLORS = ["#94a3b8", "#10b981", "#ef4444", "#f59e0b"];

function withColors(breakdown: { name: string; count: number }[], colors: string[]) {
  return breakdown.map((b, i) => ({ ...b, color: colors[i] ?? "#cbd5e1" }));
}

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
        <PieChart data={withColors(data.priorityBreakdown, PRIORITY_COLORS)} />
      </div>

      <div className="card chart-card">
        <h3>상태별 요구사항</h3>
        <PieChart data={withColors(data.statusBreakdown, STATUS_COLORS)} />
      </div>

      <div className="card chart-card">
        <h3>테스트 실행 결과 (최신 실행 기준)</h3>
        <PieChart data={withColors(data.runStatusBreakdown, RUN_COLORS)} />
      </div>
    </div>
  );
}
