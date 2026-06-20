interface Slice {
  name: string;
  count: number;
  color: string;
}

export default function PieChart({ data, size = 140 }: { data: Slice[]; size?: number }) {
  const total = data.reduce((sum, d) => sum + d.count, 0);

  let cumulative = 0;
  const stops: string[] = [];
  for (const d of data) {
    const start = total === 0 ? 0 : (cumulative / total) * 360;
    cumulative += d.count;
    const end = total === 0 ? 0 : (cumulative / total) * 360;
    stops.push(`${d.color} ${start}deg ${end}deg`);
  }
  const background = total === 0 ? "#e5e7eb" : `conic-gradient(${stops.join(", ")})`;

  return (
    <div className="pie-chart-row">
      <div className="pie-chart" style={{ width: size, height: size, background }} />
      <ul className="pie-legend">
        {data.map((d) => (
          <li key={d.name}>
            <span className="legend-swatch" style={{ backgroundColor: d.color }} />
            {d.name}: {d.count}
            {total > 0 && <span className="legend-pct"> ({((d.count / total) * 100).toFixed(0)}%)</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
