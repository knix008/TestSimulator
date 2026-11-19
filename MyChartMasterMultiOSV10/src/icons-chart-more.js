// Pictures of the chart types added after the first 31 (24×24 stroke, currentColor), one per type so no two
// chart types share an icon; merged into icons.js next to CHART_ICONS. Plus the gallery groups "relations"
// and "finance & time".
const F = 'fill="currentColor" fill-opacity=".35"';
const S = 'fill="currentColor" fill-opacity=".6"';
const D = (x, y, r = 1.4) => `<circle cx="${x}" cy="${y}" r="${r}" fill="currentColor"/>`;
const AX = '<path d="M3 21h18M3 21V3"/>';
const BASE = '<path d="M3 21h18"/>';

export const CHART_ICONS_MORE = {
  // ── bars
  chartRoundedColumn: `${BASE}<rect x="5" y="10" width="4" height="11" rx="2" ${F}/><rect x="10.5" y="5" width="4" height="16" rx="2" ${F}/><rect x="16" y="13" width="4" height="8" rx="2" ${F}/>`,
  chartGradientColumn: `${BASE}<defs><linearGradient id="icg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".9"/><stop offset="1" stop-color="currentColor" stop-opacity=".1"/></linearGradient></defs><rect x="5" y="9" width="4" height="12" fill="url(#icg)"/><rect x="10.5" y="4" width="4" height="17" fill="url(#icg)"/><rect x="16" y="12" width="4" height="9" fill="url(#icg)"/>`,
  chartLollipopBar: `<path d="M3 3v18M3 6h11M3 12h16M3 18h7"/>${D(14, 6, 2)}${D(19, 12, 2)}${D(10, 18, 2)}`,
  chartDotPlot: `<path d="M3 6h18M3 12h18M3 18h18" stroke-dasharray="1 2.5" opacity=".6"/>${D(16, 6, 2)}${D(10, 12, 2)}${D(19, 18, 2)}`,
  chartDumbbell: `<path d="M3 3v18M7 6h10M10 12h9M5 18h8"/>${D(7, 6, 2)}${D(17, 6, 2)}${D(10, 12, 2)}${D(19, 12, 2)}${D(5, 18, 2)}${D(13, 18, 2)}`,
  chartRangeColumn: `${BASE}<rect x="4.5" y="12" width="3.5" height="6" ${F}/><rect x="10.25" y="5" width="3.5" height="9" ${F}/><rect x="16" y="8" width="3.5" height="8" ${F}/>`,
  chartRangeBar: `<path d="M3 3v18"/><rect x="8" y="4.5" width="9" height="3.5" ${F}/><rect x="5" y="10.25" width="8" height="3.5" ${F}/><rect x="11" y="16" width="9" height="3.5" ${F}/>`,
  chartBullet: '<rect x="3" y="5" width="18" height="5" fill="currentColor" fill-opacity=".15"/><rect x="3" y="14" width="18" height="5" fill="currentColor" fill-opacity=".15"/><path d="M3 7.5h11M3 16.5h7" stroke-width="2.6"/><path d="M16 4v7M13 13v7" stroke-width="2"/>',
  chartProgressBars: '<rect x="3" y="4.5" width="18" height="3" rx="1.5"/><rect x="3" y="10.5" width="18" height="3" rx="1.5"/><rect x="3" y="16.5" width="18" height="3" rx="1.5"/><path d="M4.5 6h11M4.5 12h6M4.5 18h14" stroke-width="2.4"/>',
  chartDivergingBar: `<path d="M12 3v18"/><rect x="12" y="4" width="8" height="3.5" ${S}/><rect x="6" y="10.25" width="6" height="3.5" ${F}/><rect x="12" y="16.5" width="5" height="3.5" ${S}/>`,
  chartButterfly: `<path d="M12 3v18"/><rect x="5" y="4" width="6" height="3.5" ${S}/><rect x="13" y="4" width="5" height="3.5" ${F}/><rect x="3" y="10.25" width="8" height="3.5" ${S}/><rect x="13" y="10.25" width="8" height="3.5" ${F}/><rect x="6" y="16.5" width="5" height="3.5" ${S}/><rect x="13" y="16.5" width="6" height="3.5" ${F}/>`,
  chartPareto: `${BASE}<rect x="4" y="7" width="4" height="14" ${F}/><rect x="10" y="12" width="4" height="9" ${F}/><rect x="16" y="16" width="4" height="5" ${F}/><path d="M6 12l6-6 6-2.5"/>${D(6, 12, 1.2)}${D(12, 6, 1.2)}${D(18, 3.5, 1.2)}`,
  chartMarimekko: '<rect x="3" y="3" width="18" height="18"/><path d="M11 3v18M16 3v18"/><path d="M3 12h8M11 8h5M16 14h5"/><rect x="3" y="12" width="8" height="9" fill="currentColor" fill-opacity=".45"/><rect x="11" y="8" width="5" height="13" fill="currentColor" fill-opacity=".25"/><rect x="16" y="14" width="5" height="7" fill="currentColor" fill-opacity=".45"/>',
  chartRadialBar: '<path d="M12 3a9 9 0 1 1-9 9"/><path d="M12 6.5a5.5 5.5 0 1 1-5.5 5.5" stroke-width="2.4"/><path d="M12 10a2 2 0 1 1-2 2"/>',
  chartRadialColumn: `<circle cx="12" cy="12" r="2.5"/><path d="M12 9.5V3l3.5.8-2.6 5.9z" ${F}/><path d="M14.4 12.6l5.9 2.3-1.3 3.1-5.4-3.4z" ${F}/><path d="M10 13.6l-4.2 4.6-2.3-2.6 5.6-3z" ${F}/><path d="M9.6 11l-5-3.4 1.6-2.4 4.3 4.3z" ${F}/>`,
  chartSmallMultiples: '<rect x="3" y="3" width="8" height="8"/><rect x="13" y="3" width="8" height="8"/><rect x="3" y="13" width="8" height="8"/><rect x="13" y="13" width="8" height="8"/><path d="M5 9V7M7 9V5.5M9 9V6.5M15 9V6M17 9V7.5M19 9V5M5 19v-3M7 19v-1.5M9 19v-4M15 19v-1M17 19v-3.5M19 19v-2"/>',
  chartMeanError: `${BASE}<rect x="4.5" y="10" width="5" height="11" ${F}/><rect x="14.5" y="13" width="5" height="8" ${F}/><path d="M7 6v8M5.5 6h3M5.5 14h3M17 9v8M15.5 9h3M15.5 17h3"/>`,
  // ── lines and areas
  chartDashedLine: `${AX}<path d="M5 16l4-5 4 3 6-8" stroke-dasharray="2.5 2"/>`,
  chartPointLine: `${AX}${D(5, 17)}${D(8, 12)}${D(11, 14)}${D(14, 9)}${D(17, 10)}${D(20, 5)}`,
  chartSplineArea: `${BASE}<path d="M3 20c3-10 6-10 9-5s6 3 9-7v13H3z" ${F}/>`,
  chartStepArea: `${BASE}<path d="M3 21v-6h4v-4h5v3h4V7h5v14z" ${F}/>`,
  chartSmoothStackedArea: `${BASE}<path d="M3 21v-5c4-3 7 0 10-2s5-3 8-4v11z" fill="currentColor" fill-opacity=".55"/><path d="M3 16v-5c4-5 7-1 10-4s5-3 8-3v6"/>`,
  chartStackedLine: `${AX}<path d="M5 18l5-3 4 1 6-4"/><path d="M5 13l5-4 4 2 6-6"/>${D(10, 15, 1.1)}${D(10, 9, 1.1)}`,
  chartStreamgraph: '<path d="M2 12c4-6 7 0 10-3s6-4 10 0c-4 5-7 2-10 5s-6 5-10-2z" fill="currentColor" fill-opacity=".35"/><path d="M2 12c4-2 7 1 10 0s6-2 10 0"/>',
  chartRangeArea: `${AX}<path d="M4 12c4-7 8-7 16-6v7c-8-1-12 2-16 5z" ${F}/><path d="M4 15c4-5 8-5 16-5.5" stroke-dasharray="2 2"/>`,
  chartSlope: `<path d="M5 3v18M19 3v18"/><path d="M5 6l14 8M5 15l14-9M5 18l14 2"/>${D(5, 6)}${D(19, 14)}${D(5, 15)}${D(19, 6)}`,
  chartBump: `<path d="M4 6c4 0 4 12 8 12s4-6 8-6"/><path d="M4 12c4 0 4-6 8-6s4 12 8 12" opacity=".6"/>${D(4, 6, 1.8)}${D(12, 18, 1.8)}${D(20, 12, 1.8)}${D(4, 12, 1.8)}${D(12, 6, 1.8)}${D(20, 18, 1.8)}`,
  chartSparklines: `<path d="M3 6l3 1 3-3 3 2 3-1 3 2 3-3M3 13l3-2 3 2 3-1 3 2 3-3 3 1M3 19l3 1 3-2 3 1 3-3 3 2 3-1"/>${D(21, 4, 1.2)}${D(21, 12, 1.2)}${D(21, 19, 1.2)}`,
  chartCumulativeLine: `${AX}<path d="M5 19l3-1 3-3 3-2 3-4 3-6"/><path d="M5 19h3v-1h3v-3h3v-2h3V9h3" opacity=".45"/>`,
  chartMovingAverage: `${AX}<path d="M4 15l2-5 2 6 2-7 2 6 2-8 2 6 2-5 2 3" opacity=".5"/><path d="M4 14c4-1 8-3 12-5s3-2 4-2" stroke-width="2.4"/>`,
  // ── part of whole
  chartSemiPie: '<path d="M3 18a9 9 0 0 1 18 0z" fill="currentColor" fill-opacity=".2"/><path d="M12 18V9M12 18l6.4-6.4"/>',
  chartExplodedPie: `<path d="M11 11V3a8 8 0 0 0-8 8z" ${F}/><path d="M13.5 13.5h8a8 8 0 0 1-8 8z" ${F}/><path d="M11 13.5H3a8 8 0 0 0 8 8zM13.5 11V3a8 8 0 0 1 8 8z"/>`,
  chartNestedDonut: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="3"/><path d="M12 3a9 9 0 0 1 9 9h-3a6 6 0 0 0-6-6z" fill="currentColor" fill-opacity=".45"/><path d="M12 6a6 6 0 0 1 4.2 10.2l-2.1-2.1A3 3 0 0 0 12 9z" fill="currentColor" fill-opacity=".25"/>',
  chartIcicle: '<rect x="3" y="3" width="18" height="5" fill="currentColor" fill-opacity=".45"/><rect x="3" y="9.5" width="11" height="5"/><rect x="15" y="9.5" width="6" height="5"/><rect x="3" y="16" width="5" height="5" fill="currentColor" fill-opacity=".3"/><rect x="9" y="16" width="5" height="5"/><rect x="15" y="16" width="6" height="5" fill="currentColor" fill-opacity=".3"/>',
  chartPackedCircles: `<circle cx="10" cy="10" r="6" ${F}/><circle cx="18" cy="15" r="3.5"/><circle cx="9.5" cy="19" r="2.5" ${F}/><circle cx="18.5" cy="6.5" r="2.2"/>`,
  chartPyramid: `<path d="M12 3l3 5H9z" ${F}/><path d="M8.2 9.5h7.6l2.9 5H5.3z"/><path d="M4.4 16h15.2l2.4 5H2z" ${F}/>`,
  chartWaffle: [0, 1, 2, 3].flatMap((r) => [0, 1, 2, 3].map((c) => `<rect x="${3 + c * 4.75}" y="${3 + r * 4.75}" width="3.6" height="3.6" rx=".6"${r * 4 + c >= 6 ? ' fill="currentColor" fill-opacity=".55" stroke="none"' : ''}/>`)).join(''),
  chartIconArray: [0, 1, 2, 3].flatMap((r) => [0, 1, 2, 3].map((c) => `<circle cx="${4.8 + c * 4.8}" cy="${4.8 + r * 4.8}" r="1.7"${r * 4 + c >= 7 ? ' fill="currentColor"' : ''}/>`)).join(''),
  chartParliament: [[3.5, 19], [4.6, 14], [7.6, 9.8], [12, 8.2], [16.4, 9.8], [19.4, 14], [20.5, 19], [8, 18], [9.4, 14.3], [12, 12.9], [14.6, 14.3], [16, 18]].map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="1.4"${i < 7 && i % 2 === 0 ? ' fill="currentColor"' : i >= 7 ? ' fill="currentColor" fill-opacity=".45"' : ''}/>`).join(''),
  chartWordCloud: '<path d="M4 9h7" stroke-width="3"/><path d="M13 9h6M5 14h4M11 14h8M7 18h9M15 5h4M5 5h5" stroke-width="1.6"/>',
  chartActivityRings: '<path d="M12 3a9 9 0 1 1-8.5 6" stroke-width="2.2"/><path d="M12 6.5a5.5 5.5 0 1 1-4.3 2" stroke-width="2.2" opacity=".7"/><path d="M12 10a2 2 0 1 1-1.9 1.4" stroke-width="2.2" opacity=".45"/>',
  // ── distribution
  chartConnectedScatter: `${AX}<path d="M6 17l3-5 4 2 2-6 4-2"/>${D(6, 17)}${D(9, 12)}${D(13, 14)}${D(15, 8)}${D(19, 6)}`,
  chartRegressionScatter: `${AX}<path d="M5 18L20 5" stroke-dasharray="2.5 2"/>${D(6, 15)}${D(9, 15)}${D(10, 11)}${D(14, 12)}${D(15, 8)}${D(18, 8)}`,
  chartQuadrant: `<rect x="3" y="3" width="18" height="18"/><path d="M12 3v18M3 12h18"/><rect x="12" y="3" width="9" height="9" fill="currentColor" fill-opacity=".2" stroke="none"/>${D(7, 16)}${D(16, 7)}${D(17, 16)}${D(8, 8)}`,
  chartFrequencyPolygon: `${BASE}<path d="M3 20l4-5 3-8 4-2 3 6 4 9"/>${D(7, 15, 1.2)}${D(10, 7, 1.2)}${D(14, 5, 1.2)}${D(17, 11, 1.2)}`,
  chartViolin: `<path d="M7 3c-3 5 3 6 0 10s-2 7 0 8c2-1 3-4 0-8s3-5 0-10z" ${F}/><path d="M17 4c-4 4 4 7 0 11-2 3 0 5 0 5s2-2 0-5c-4-4 4-7 0-11z" ${F}/>`,
  chartStripPlot: `${D(6, 6, 1.2)}${D(7.5, 9, 1.2)}${D(5, 12, 1.2)}${D(7, 15, 1.2)}${D(5.5, 17, 1.2)}${D(16, 4, 1.2)}${D(18, 8, 1.2)}${D(17, 11, 1.2)}${D(15.5, 13, 1.2)}${D(18.5, 16, 1.2)}<path d="M3.5 11h6M14 11h6"/>`,
  chartBeeswarm: `${D(12, 4, 1.3)}${D(10.5, 7.5, 1.3)}${D(13.5, 7.5, 1.3)}${D(9, 11, 1.3)}${D(12, 11, 1.3)}${D(15, 11, 1.3)}${D(7.5, 14.5, 1.3)}${D(10.5, 14.5, 1.3)}${D(13.5, 14.5, 1.3)}${D(16.5, 14.5, 1.3)}${D(12, 18, 1.3)}${D(9, 18, 1.3)}${D(15, 18, 1.3)}`,
  chartRug: `${BASE}<path d="M3 17c4 0 5-10 9-10s5 10 9 10" opacity=".55"/><path d="M5 21v-3M7 21v-3M9 21v-3M10 21v-3M11.5 21v-3M12.5 21v-3M14 21v-3M15 21v-3M17 21v-3M19.5 21v-3"/>`,
  chartDensity: `${BASE}<path d="M3 20c3 0 4-12 7-12s3 7 5 7 3-6 6 5z" ${F}/>`,
  chartEcdf: `${AX}<path d="M4 20h3v-3h3v-4h3V9h3V6h3V4h2"/>`,
  chartPunchCard: `<path d="M3 6h18M3 12h18M3 18h18" opacity=".3"/>${D(5, 6, 1)}${D(10, 6, 2)}${D(16, 6, 1.4)}${D(5, 12, 2.2)}${D(10, 12, 1.2)}${D(16, 12, 2.6)}${D(5, 18, 1.4)}${D(10, 18, 2.5)}${D(16, 18, 1)}`,
  chartCorrelation: '<rect x="3" y="3" width="6" height="6" fill="currentColor" fill-opacity=".85"/><rect x="9" y="3" width="6" height="6" fill="currentColor" fill-opacity=".25"/><rect x="15" y="3" width="6" height="6" fill="currentColor" fill-opacity=".55"/><rect x="3" y="9" width="6" height="6" fill="currentColor" fill-opacity=".25"/><rect x="9" y="9" width="6" height="6" fill="currentColor" fill-opacity=".85"/><rect x="15" y="9" width="6" height="6" fill="currentColor" fill-opacity=".1"/><rect x="3" y="15" width="6" height="6" fill="currentColor" fill-opacity=".55"/><rect x="9" y="15" width="6" height="6" fill="currentColor" fill-opacity=".1"/><rect x="15" y="15" width="6" height="6" fill="currentColor" fill-opacity=".85"/><path d="M3 3l18 18" opacity=".5"/>',
  chartScatterMatrix: `<rect x="3" y="3" width="8" height="8"/><rect x="13" y="3" width="8" height="8"/><rect x="3" y="13" width="8" height="8"/><rect x="13" y="13" width="8" height="8"/><path d="M14.5 9.5l5-5M4.5 19.5l5-5" opacity=".5"/>${D(15.5, 7.5, 0.9)}${D(18, 6, 0.9)}${D(5.5, 17.5, 0.9)}${D(8.5, 15, 0.9)}`,
  chartCalendarHeatmap: [0, 1, 2, 3, 4].flatMap((c) => [0, 1, 2, 3].map((r) => `<rect x="${2.5 + c * 4}" y="${4 + r * 4}" width="3.2" height="3.2" rx=".5" stroke="none" fill="currentColor" fill-opacity="${[0.15, 0.4, 0.8, 0.25, 0.6, 0.9, 0.3, 0.5, 0.1, 0.7][(c * 3 + r * 7) % 10]}"/>`)).join(''),
  // ── relations and flows
  chartRadarLines: '<path d="M12 3l8.5 6.2-3.3 10H6.8L3.5 9.2z" opacity=".45"/><path d="M12 6l6 4.5-2.5 6.5h-7L6 10.5z"/><path d="M12 9l4 2.5-3 4.5-3.5-1-2-3z" stroke-dasharray="2 1.6"/>',
  chartChord: `<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6Q12 12 18.4 5.6M5 15.5Q12 12 15.5 20" ${F}/><path d="M12 3Q12 12 20.6 14.5"/>`,
  chartArcDiagram: `<path d="M3 18h18" opacity=".3"/><path d="M4 18a5 5 0 0 1 10 0M9 18a5.5 5.5 0 0 1 11 0M4 18a8 8 0 0 1 16 0" />${D(4, 18, 1.6)}${D(9, 18, 1.6)}${D(14, 18, 1.6)}${D(20, 18, 1.6)}`,
  chartNetwork: `<path d="M6 6l6 6 6-7M12 12l-6 7M12 12l7 6M18 5l1 13"/><circle cx="12" cy="12" r="2.6" ${S}/>${D(6, 6, 1.8)}${D(18, 5, 1.8)}${D(6, 19, 1.8)}${D(19, 18, 1.8)}`,
  chartTree: `<path d="M5 12c4 0 3-6 7-6M5 12c4 0 3 6 7 6M12 6c3 0 3-2 7-2M12 6c3 0 3 3 7 3M12 18c3 0 3-2 7-2M12 18c3 0 3 3 7 3"/>${D(5, 12, 1.8)}${D(12, 6, 1.5)}${D(12, 18, 1.5)}${D(19, 4, 1.1)}${D(19, 9, 1.1)}${D(19, 16, 1.1)}${D(19, 21, 1.1)}`,
  // ── finance and time
  chartOhlc: '<path d="M6 4v14M4 7h2M6 15h2M12 7v12M10 16h2M12 9h2M18 3v12M16 12h2M18 5h2"/>',
  chartHeikinAshi: '<path d="M6 4v3M6 16v4M12 8v2M12 17v3M18 5v2M18 14v3"/><rect x="4" y="7" width="4" height="9" fill="currentColor" fill-opacity=".45" rx="1"/><rect x="10" y="10" width="4" height="7" fill="currentColor" fill-opacity=".45" rx="1"/><rect x="16" y="7" width="4" height="7" rx="1"/>',
  chartPriceBand: `${AX}<path d="M4 13l4-4 4 2 4-5 4 1v5l-4-1-4 5-4-2-4 4z" ${F}/><path d="M4 15.5l4-3.5 4 2.5 4-5 4 2"/>`,
  chartBollinger: `${AX}<path d="M4 10c4-4 8-2 16-6M4 18c4-2 8-1 16-5" opacity=".6"/><path d="M4 14c4-3 8-1 16-5" stroke-dasharray="2 2"/><path d="M4 15l3-3 3 2 3-4 3 1 4-3"/>`,
  chartGantt: `<path d="M3 3v18"/><rect x="4" y="4" width="7" height="3.2" rx="1" ${S}/><rect x="8" y="9" width="8" height="3.2" rx="1" ${F}/><rect x="12" y="14" width="6" height="3.2" rx="1" ${S}/><rect x="17" y="18.5" width="4" height="2.5" rx="1" ${F}/>`,
  chartTimeline: `<path d="M2 12h20"/><path d="M5 12V6M11 12v6M17 12V5" opacity=".7"/>${D(5, 12, 1.8)}${D(11, 12, 1.8)}${D(17, 12, 1.8)}<path d="M3 5h4M9 19h4M15 4h4"/>`,
  // ── indicators
  chartSolidGauge: '<path d="M3 17a9 9 0 0 1 18 0h-4a5 5 0 0 0-10 0z"/><path d="M3 17a9 9 0 0 1 12.6-8.3L14 12.4A5 5 0 0 0 7 17z" fill="currentColor" fill-opacity=".55"/>',
  chartGaugeGrid: '<path d="M3 10a4 4 0 0 1 8 0M13 10a4 4 0 0 1 8 0M3 20a4 4 0 0 1 8 0M13 20a4 4 0 0 1 8 0"/><path d="M7 10l2-2.5M17 10l-2-2.5M7 20l2.5-1M17 20l0-3"/>',
  chartLinearGauge: '<rect x="3" y="9" width="18" height="5" rx="1"/><rect x="3" y="9" width="12" height="5" rx="1" fill="currentColor" fill-opacity=".5"/><path d="M15 5l-2-2h4zM3 17v2M7.5 17v2M12 17v2M16.5 17v2M21 17v2"/>',
  chartBigNumber: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M6 8h5" opacity=".5"/><path d="M7 16v-5l-1.5 1M10.5 11.5a1.5 1.5 0 0 1 3 0c0 1.5-3 2.5-3 4.5h3M16 11h2.5l-1.5 2a1.5 1.5 0 1 1-1.3 2.3"/>',
  // ── added with the nine groups of twelve
  chartOverlapArea: `${BASE}<path d="M3 20l5-9 5 5 8-10v15H3z" fill="currentColor" fill-opacity=".18"/><path d="M3 20l6-5 5 2 7-6v10H3z" fill="currentColor" fill-opacity=".18"/>${D(8, 11, 1.1)}${D(13, 16, 1.1)}${D(21, 6, 1.1)}`,
  chartStackedStepArea: `${BASE}<path d="M3 21v-4h5v-2h5v1h4v-3h4v8z" fill="currentColor" fill-opacity=".55"/><path d="M3 17v-5h5V8h5v3h4V5h4v8"/>`,
  chartSmoothPercentArea: '<rect x="3" y="4" width="18" height="17"/><path d="M3 21v-6c4-4 8 2 12-2s4-3 6-3v11z" fill="currentColor" fill-opacity=".45"/>',
  chartCumulativeArea: `${BASE}<path d="M3 21v-2l4-1 4-3 4-4 6-7v17z" ${F}/><path d="M3 19l4-1 4-3 4-4 6-7"/>`,
  chartCumulativeHistogram: `${BASE}<rect x="4" y="17" width="3.2" height="4" ${F}/><rect x="8.2" y="13" width="3.2" height="8" ${F}/><rect x="12.4" y="8" width="3.2" height="13" ${F}/><rect x="16.6" y="4" width="3.2" height="17" ${F}/>`,
  chartDotHistogram: `${BASE}${D(6, 19, 1.3)}${D(10, 19, 1.3)}${D(10, 15.5, 1.3)}${D(14, 19, 1.3)}${D(14, 15.5, 1.3)}${D(14, 12, 1.3)}${D(14, 8.5, 1.3)}${D(18, 19, 1.3)}${D(18, 15.5, 1.3)}`,
  chartRidgeline: '<path d="M2 9c3 0 4-5 7-5s3 5 5 5" fill="currentColor" fill-opacity=".25"/><path d="M2 14c4 0 4-5 8-5s4 5 6 5h6"/><path d="M2 19c5 0 6-4 9-4s4 4 11 4" fill="currentColor" fill-opacity=".4"/><path d="M2 9h12M2 14h20M2 19h20" opacity=".45"/>',
  // ── commands
  chartRange: '<rect x="3" y="3" width="18" height="18" rx="1.5"/><path d="M3 9h18M9 3v18" opacity=".45"/><rect x="9" y="9" width="9" height="9" fill="currentColor" fill-opacity=".35" stroke-dasharray="2 1.5"/><path d="M11 16v-2M13.5 16v-4M16 16v-3"/>',
  chartTheme: '<rect x="3" y="4" width="18" height="14" rx="2"/><path d="M6 15l3-4 3 2 4-5 2 2"/><circle cx="7" cy="20.5" r="1" fill="currentColor"/><circle cx="12" cy="20.5" r="1" fill="currentColor" fill-opacity=".6"/><circle cx="17" cy="20.5" r="1" fill="currentColor" fill-opacity=".3"/>',
  // ── gallery groups
  groupRelation: `<path d="M7 7l10 3M7 7l3 10M17 10l-7 7"/><circle cx="7" cy="7" r="3" ${F}/><circle cx="17" cy="10" r="2.5" ${F}/><circle cx="10" cy="17" r="2.5" ${F}/>`,
  groupArea: `${BASE}<path d="M3 20l5-8 4 4 5-7 4 3v8H3z" ${F}/><path d="M3 20l5-4 4 2 5-3 4 1" opacity=".6"/>`,
  groupHierarchy: `<rect x="9" y="3" width="6" height="4" rx="1" ${F}/><rect x="3" y="17" width="5" height="4" rx="1"/><rect x="9.5" y="17" width="5" height="4" rx="1"/><rect x="16" y="17" width="5" height="4" rx="1"/><path d="M12 7v5M5.5 17v-5h13v5M12 12v5"/>`,
  groupCorrelation: `${AX}<path d="M5 18L20 5" stroke-dasharray="2 2" opacity=".6"/><circle cx="8" cy="15" r="2" ${F}/><circle cx="13" cy="10" r="2.5" ${F}/><circle cx="18" cy="7" r="1.6" ${F}/>`,
  groupFinance: `<path d="M3 21h18"/><path d="M7 4v3M7 14v3M15 7v2M15 16v3"/><rect x="5" y="7" width="4" height="7" ${F}/><rect x="13" y="9" width="4" height="7"/>`,
};
