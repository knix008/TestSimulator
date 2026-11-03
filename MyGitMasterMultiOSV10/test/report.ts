import fs from "node:fs";
import path from "node:path";

export type TestResult = {
  group: string;
  name: string;
  ok: boolean;
  ms: number;
  error: string;
};

export function formatMs(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export function writeHtmlReport(results: TestResult[], totalMs: number, file: string): void {
  const passed = results.filter((item) => item.ok).length;
  const failed = results.length - passed;
  const slowest = Math.max(1, ...results.map((item) => item.ms));
  const rows = results.map((item) => {
    const width = Math.max(4, Math.round((item.ms / slowest) * 100));
    const color = item.ok ? "#16a34a" : "#dc2626";
    return `<tr class="${item.ok ? "ok" : "bad"}">
      <td><span class="pill" style="background:${color}">${item.ok ? "PASS" : "FAIL"}</span></td>
      <td>${escapeHtml(item.group)}</td>
      <td>${escapeHtml(item.name)}${item.error ? `<pre>${escapeHtml(item.error)}</pre>` : ""}</td>
      <td class="time"><div class="bar" style="width:${width}%;background:${color}"></div><span>${formatMs(item.ms)}</span></td>
    </tr>`;
  }).join("\n");
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>My Git Master test summary</title>
  <style>
    :root { color-scheme: light; }
    body { margin: 0; font-family: "Segoe UI", "Malgun Gothic", sans-serif; background: linear-gradient(160deg, #0f172a, #1e3a8a 42%, #0f766e); color: #0f172a; }
    main { max-width: 1100px; margin: 28px auto; background: #f8fafc; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 50px rgba(0,0,0,.28); }
    header { padding: 28px 32px 20px; background: linear-gradient(90deg, #1d4ed8, #7c3aed 55%, #db2777); color: white; }
    header h1 { margin: 0 0 6px; font-size: 28px; }
    header p { margin: 0; opacity: .9; }
    .cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; padding: 20px 32px 0; }
    .card { border-radius: 12px; padding: 14px 16px; color: white; }
    .card b { display: block; font-size: 28px; }
    .card span { opacity: .9; font-size: 13px; }
    .all { background: #0369a1; }
    .pass { background: #15803d; }
    .fail { background: ${failed ? "#b91c1c" : "#64748b"}; }
    .time { background: #c2410c; }
    h2 { margin: 22px 32px 8px; color: #6d28d9; }
    table { width: calc(100% - 64px); margin: 0 32px 28px; border-collapse: collapse; background: white; border-radius: 12px; overflow: hidden; }
    th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
    th { background: #eef2ff; color: #312e81; }
    .pill { color: white; font-weight: 700; border-radius: 999px; padding: 2px 8px; font-size: 12px; }
    td.time { background: transparent; color: #9a3412; font-variant-numeric: tabular-nums; min-width: 180px; }
    .bar { height: 8px; border-radius: 99px; margin-bottom: 4px; }
    tr.bad { background: #fef2f2; }
    pre { white-space: pre-wrap; color: #991b1b; background: #fee2e2; padding: 8px; border-radius: 8px; }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>My Git Master test results</h1>
      <p>Execution time and summary for each test</p>
    </header>
    <section class="cards">
      <div class="card all"><b>${results.length}</b><span>Total</span></div>
      <div class="card pass"><b>${passed}</b><span>Passed</span></div>
      <div class="card fail"><b>${failed}</b><span>Failed</span></div>
      <div class="card time"><b>${formatMs(totalMs)}</b><span>Time</span></div>
    </section>
    <h2>Summary</h2>
    <table>
      <thead><tr><th>Result</th><th>Group</th><th>Test</th><th>Time</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </main>
</body>
</html>`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html, "utf8");
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
