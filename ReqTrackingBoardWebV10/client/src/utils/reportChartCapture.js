import html2canvas from 'html2canvas';
import { REPORT_CHART_IDS } from '../constants/chartColors';

export async function captureReportCharts(container) {
  if (!container) return {};

  await new Promise((resolve) => setTimeout(resolve, 150));
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  const images = {};
  for (const id of REPORT_CHART_IDS) {
    const el = container.querySelector(`[data-report-chart="${id}"]`);
    if (!el) continue;

    const width = el.offsetWidth;
    const height = el.offsetHeight;
    if (!width || !height) continue;

    const canvas = await html2canvas(el, {
      backgroundColor: '#ffffff',
      scale: 2,
      logging: false,
      useCORS: true,
      width,
      height,
      windowWidth: width,
      windowHeight: height,
    });
    images[id] = canvas.toDataURL('image/png');
  }
  return images;
}
