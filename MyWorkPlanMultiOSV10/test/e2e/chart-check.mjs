// Runs in the main window: what the charts on screen show on their axes.
// Returns one entry per chart: { kind, yLabels, xLabels, grid, overlaps }.
//  - resource graph (.graph-svg): left ruler numbers, dated ticks, gridlines;
//  - report line charts (.line-chart): the same;
//  - report bar lists (.hbars): the ruler under the bars, gridlines in the tracks.
// overlaps: pairs of ruler labels whose boxes touch (must be none).
export const CHART_CHECK = `(() => {
  const box = (e) => e.getBoundingClientRect();
  const touching = (list) => { const out = []; const r = list.map(box); for (let i = 1; i < r.length; i++) if (r[i].left < r[i - 1].right - 0.5 && r[i].top < r[i - 1].bottom && r[i - 1].top < r[i].bottom) out.push(list[i - 1].textContent + '|' + list[i].textContent); return out; };
  // Only labels on screen: a ruler hides the ones that would not fit (their tick marks stay).
  const numeric = (list) => list.filter((e) => /\\d/.test(e.textContent) && getComputedStyle(e).visibility !== 'hidden');
  const charts = [];
  for (const svg of document.querySelectorAll('.graph-svg')) {
    const y = numeric([...svg.querySelectorAll('.g-ylabel')]);
    const x = numeric([...svg.querySelectorAll('.g-xlabel')]);
    charts.push({ kind: 'graph', yLabels: y.map((e) => e.textContent), xLabels: x.length, grid: svg.querySelectorAll('.g-grid').length, overlaps: [...touching(x), ...touching([...y].reverse())] });
  }
  for (const svg of document.querySelectorAll('.line-chart')) {
    const y = numeric([...svg.querySelectorAll('.axis-text.end')]);
    const x = numeric([...svg.querySelectorAll('.axis-text.middle')]);
    charts.push({ kind: 'line', yLabels: y.map((e) => e.textContent), xLabels: x.length, grid: svg.querySelectorAll('.grid-line').length, overlaps: touching(x) });
  }
  for (const bars of document.querySelectorAll('.hbars')) {
    if (!bars.querySelector('.hbar-row:not(.hbar-axis)')) continue;
    const labels = numeric([...bars.querySelectorAll('.hbar-scale b')]);
    charts.push({ kind: 'bars', yLabels: labels.map((e) => e.textContent), xLabels: labels.length, grid: bars.querySelectorAll('.hbar-grid').length, overlaps: touching(labels) });
  }
  return charts;
})()`;
