// Thermal analysis (DSC / TGA) window: import an instrument curve, set the
// sample mass and rate, pick the integration range, calibrate against a
// standard, read enthalpy / onset / peak / endset (DSC) or T5 / T50 / residue
// / DTG peak (TGA), and turn a DSC melting peak into a phase-change material.
// Also: glass transition (Tg), dy/dT overlay, linear or sigmoid baselines,
// several peaks, conversion α(T), multi-point temperature calibration, TGA
// mass-loss steps, reaction kinetics (Kissinger, Ozawa–Flynn–Wall) from runs at
// several heating rates, and cp(T) by the sapphire (ratio) method.
import { h, replace, numberField } from './dom.js';
import { t, getLanguage } from '../core/i18n.js';
import { formatValue } from '../core/colormap.js';
import { drawLineChart } from './charts.js';
import {
  parseCurveCsv, integratePeak, applyCalibration, calibration, analyseTga, pcmFromDsc, specificHeat, sampleDscCsv, sampleTgaCsv, DSC_STANDARDS,
  linearFit, derivative, glassTransition, sigmoidBaseline, conversion, kissinger, ozawaFlynnWall, tgaSteps, sapphireCpAt, sapphireCp,
  multiPointCalibration, sampleTgCurve, sampleKineticRuns,
} from '../core/thermalanalysis.js';

const STR = {
  ko: {
    kinetics: '반응 속도론', cpTab: 'cp (사파이어)',
    viewCurve: '곡선', viewAlpha: '전환율 α(T)', viewKissinger: 'Kissinger 그림', viewCurves: '모든 곡선', viewCp: 'cp(T)',
    derivative: 'dy/dT 겹치기', derivSeries: 'dy/dT (정규화)', dtgOverlay: 'DTG 겹치기',
    baseline: '기준선', linear: '직선', sigmoid: '시그모이드',
    peaks: '피크', peak: (n) => `피크 ${n}`, addPeak: '+ 피크 추가', remove: '삭제',
    colRange: '구간 °C', colH: 'ΔH J/g', colPeak: '피크 °C', colOnset: '개시 °C', colEndset: '종료 °C',
    tgTitle: '유리 전이 (Tg)', tgOn: 'Tg 분석', tgSample: 'Tg 예제 곡선', tgOnset: '개시', tgMid: '중간점 (Tg)', tgEnd: '종료', tgInfl: '변곡점',
    tgError: '구간에 점이 10개 이상 있어야 합니다', tanPre: '전 기준선', tanPost: '후 기준선', tanInfl: '변곡 접선',
    alphaSeries: (n) => `α 피크 ${n}`,
    calMode: '보정 방식', calSingle: '1점 (온도·엔탈피)', calMulti: '다점 (온도)', addStandard: '+ 표준 추가', fit: '맞추고 적용',
    measured: '측정 개시', slope: '기울기 a', offset: '오프셋 b', calApplied: 'T 값에 적용됨: T′ = a·T + b', calError: '보정할 수 없습니다',
    kinHint: '가열 속도가 다른 DSC 곡선을 두 개 이상 불러오고 피크 구간을 고르면 Kissinger와 Ozawa–Flynn–Wall 방법으로 활성화 에너지를 구합니다.',
    loadRun: '⇪ DSC 곡선 추가', sampleRuns: '예제 실행', clearRuns: '모두 지우기', runs: '실행', rate: 'β',
    peakWindow: '피크 구간', autoWindow: '자동 구간', alpha: 'OFW 전환율 α', tAlpha: (a) => `T(α=${a})`,
    kissinger: 'Kissinger', ofw: 'Ozawa–Flynn–Wall', needTwo: '실행이 두 개 이상 필요합니다', fitLine: '맞춤선', points: '실행',
    stepsTitle: '질량 감소 단계', colStart: '시작 °C', colEnd: '끝 °C', colLoss: 'Δm %', colDtg: 'DTG 피크 °C', colExt: '외삽 개시 °C', noSteps: '단계를 찾지 못했습니다',
    cpHint: '빈 팬, 사파이어, 시료 곡선을 같은 조건으로 측정해 불러오면 ASTM E1269 비율법으로 cp(T)를 구합니다.',
    blank: '빈 팬', sapphire: '사파이어', sample: '시료', load: '불러오기', notLoaded: '없음',
    massSapphire: '사파이어 질량', massSample: '시료 질량', cpSample: '예제 데이터', useCp: '재료 cp(T)로 사용', cpName: '이름',
    notSupported: '이 버전은 아직 cp(T) 표를 재료로 받지 못합니다', sent: 'cp(T) 표를 보냈습니다', cpMissing: '세 곡선(빈 팬·사파이어·시료)을 모두 불러오세요',
    cpRange: 'cp 범위', cpRows: 'cp(T) 표', cpRef: '사파이어 cp (참조)',
  },
  en: {
    kinetics: 'Kinetics', cpTab: 'cp (sapphire)',
    viewCurve: 'Curve', viewAlpha: 'Conversion α(T)', viewKissinger: 'Kissinger plot', viewCurves: 'All curves', viewCp: 'cp(T)',
    derivative: 'Overlay dy/dT', derivSeries: 'dy/dT (scaled)', dtgOverlay: 'Overlay DTG',
    baseline: 'Baseline', linear: 'Linear', sigmoid: 'Sigmoid',
    peaks: 'Peaks', peak: (n) => `Peak ${n}`, addPeak: '+ Add peak', remove: 'Remove',
    colRange: 'Range °C', colH: 'ΔH J/g', colPeak: 'Peak °C', colOnset: 'Onset °C', colEndset: 'Endset °C',
    tgTitle: 'Glass transition (Tg)', tgOn: 'Tg analysis', tgSample: 'Tg sample curve', tgOnset: 'Onset', tgMid: 'Midpoint (Tg)', tgEnd: 'Endset', tgInfl: 'Inflection',
    tgError: 'Need at least 10 points in the window', tanPre: 'Pre baseline', tanPost: 'Post baseline', tanInfl: 'Inflection tangent',
    alphaSeries: (n) => `α peak ${n}`,
    calMode: 'Method', calSingle: 'Single point (T, ΔH)', calMulti: 'Multi-point (T)', addStandard: '+ Add standard', fit: 'Fit and apply',
    measured: 'Measured onset', slope: 'Slope a', offset: 'Offset b', calApplied: 'Applied to T: T′ = a·T + b', calError: 'Cannot calibrate',
    kinHint: 'Load two or more DSC curves measured at different heating rates and pick the peak window: Kissinger and Ozawa–Flynn–Wall give the activation energy.',
    loadRun: '⇪ Add DSC curve', sampleRuns: 'Sample runs', clearRuns: 'Clear all', runs: 'Runs', rate: 'β',
    peakWindow: 'Peak window', autoWindow: 'Auto window', alpha: 'OFW conversion α', tAlpha: (a) => `T(α=${a})`,
    kissinger: 'Kissinger', ofw: 'Ozawa–Flynn–Wall', needTwo: 'Need at least two runs', fitLine: 'Fit', points: 'Runs',
    stepsTitle: 'Mass-loss steps', colStart: 'Start °C', colEnd: 'End °C', colLoss: 'Δm %', colDtg: 'DTG peak °C', colExt: 'Extrap. onset °C', noSteps: 'No steps found',
    cpHint: 'Load blank, sapphire and sample curves measured under the same programme: cp(T) by the ASTM E1269 ratio method.',
    blank: 'Blank', sapphire: 'Sapphire', sample: 'Sample', load: 'Load', notLoaded: 'none',
    massSapphire: 'Sapphire mass', massSample: 'Sample mass', cpSample: 'Sample data', useCp: 'Use as material cp(T)', cpName: 'Name',
    notSupported: 'This version cannot take a cp(T) table as a material yet', sent: 'cp(T) table sent', cpMissing: 'Load all three curves (blank, sapphire, sample)',
    cpRange: 'cp range', cpRows: 'cp(T) table', cpRef: 'Sapphire cp (reference)',
  },
};

const DEFAULTS = {
  mode: 'dsc', curve: null, name: '', mass: 8, rate: 10, T1: null, T2: null, standard: 'indium', cal: null, calOnset: 156.2, calEnthalpy: 27.9,
  view: 'curve', deriv: false, baselineKind: 'linear', extraPeaks: [], tg: false, tgT1: null, tgT2: null, dtg: true,
  calMode: 'single', mstd: [{ id: 'indium', measured: 157.4 }, { id: 'tin', measured: 233.1 }], mcal: null,
  kin: null, cpw: null,
};

/** Peak integration over any baseline (the sigmoid one): same rules as integratePeak. */
function integrateOver(curve, base, { T1, T2, mass, rate = 10 }) {
  const { T, y } = curve;
  const lo = Math.min(T1, T2); const hi = Math.max(T1, T2);
  let area = 0; let peakI = -1; let height = 0;
  for (let i = 1; i < T.length; i++) {
    if (T[i] < lo || T[i] > hi) continue;
    const d0 = y[i - 1] - base[i - 1];
    const d1 = y[i] - base[i];
    const dt = curve.time ? (curve.time[i] - curve.time[i - 1]) * (curve.time[curve.time.length - 1] > 300 ? 1 : 60) : ((T[i] - T[i - 1]) / rate) * 60;
    area += ((d0 + d1) / 2) * dt;
    if (d1 > height) { height = d1; peakI = i; }
  }
  if (peakI < 0) return { enthalpy: 0, onset: NaN, peak: NaN, endset: NaN, height: 0, baseline: base };
  const tangentCross = (from, to, step) => {
    let best = -1; let slopeBest = 0;
    for (let i = from; i !== to; i += step) {
      const j = i + step;
      if (j < 0 || j >= T.length) break;
      const s = ((y[j] - base[j]) - (y[i] - base[i])) / (T[j] - T[i] || 1e-12);
      if (Math.abs(s) > Math.abs(slopeBest)) { slopeBest = s; best = i; }
    }
    if (best < 0 || slopeBest === 0) return NaN;
    return T[best] - (y[best] - base[best]) / slopeBest;
  };
  const first = T.findIndex((v) => v >= lo);
  let last = T.length - 1;
  while (last > 0 && T[last] > hi) last--;
  return { enthalpy: area / 1000 / (mass / 1000), onset: tangentCross(first, peakI, 1), peak: T[peakI], endset: tangentCross(last, peakI, -1), height, baseline: base };
}

/** Temperature where a conversion list [{ T, alpha }] first reaches α (linear interpolation). */
function tAtAlpha(list, a) {
  for (let i = 1; i < list.length; i++) {
    if (list[i].alpha >= a) {
      const p = list[i - 1]; const q = list[i];
      return q.alpha === p.alpha ? q.T : p.T + ((a - p.alpha) / (q.alpha - p.alpha)) * (q.T - p.T);
    }
  }
  return NaN;
}

/** Heating rate guessed from a file name ("run-5Kmin.csv", "20 K per min") or 10 K/min. */
function rateFromName(name) {
  const m = /(\d+(?:\.\d+)?)\s*k\s*(?:\/|_|-|per)?\s*min/i.exec(String(name));
  return m ? Number(m[1]) : 10;
}

/** Synthetic sapphire-method curves (10 K/min): blank = offset, sapphire / sample = blank + β·m·cp. */
function sampleCpCurves(massSapphire, massSample) {
  const beta = 10 / 60;
  const T = []; const blank = []; const sapph = []; const sample = [];
  for (let v = 20; v <= 300; v += 2) {
    const b = 0.3 + 0.0006 * v + 0.01 * Math.sin(v / 9);
    T.push(v);
    blank.push(b);
    sapph.push(b + beta * massSapphire * sapphireCpAt(v));
    sample.push(b + beta * massSample * (1.25 + 0.0022 * v)); // a polymer-like cp, J/gK
  }
  const curve = (y) => ({ T: [...T], y, time: null });
  return { blank: curve(blank), sapphire: curve(sapph), sample: curve(sample) };
}

export function showThermalAnalysis(app, popup) {
  const st = app.state.thermal ??= {};
  for (const [key, value] of Object.entries(DEFAULTS)) if (!(key in st)) st[key] = Array.isArray(value) ? value.map((v) => ({ ...v })) : value;
  st.kin ??= { runs: [], T1: null, T2: null, alpha: 0.5, view: 'kissinger' };
  st.cpw ??= { blank: null, sapphire: null, sample: null, names: {}, mSapphire: 25, mSample: 10, view: 'cp', name: 'cp(T) sapphire', message: '' };
  const S = () => STR[getLanguage() === 'en' ? 'en' : 'ko'];

  const canvas = h('canvas', { style: { position: 'absolute', left: '6px', top: '6px', width: 'calc(100% - 12px)', height: 'calc(100% - 12px)', display: 'block' }, dataset: { testid: 'thermal-chart' } });
  const viewRow = h('div', { className: 'thermal-views' });
  const side = h('div', { className: 'heatmap-side thermal-side' });
  const row = (label, control) => h('div', { className: 'row' }, h('span', null, label), control);
  const btn = (label, testid, onClick, extra = {}) => h('button', { type: 'button', dataset: testid ? { testid } : undefined, onClick, ...extra }, label);
  const check = (label, value, testid, onChange) => h('label', { className: 'thermal-check' },
    h('input', { type: 'checkbox', checked: value, dataset: { testid }, onChange: (e) => onChange(e.target.checked) }), h('span', null, label));
  const table = (rows) => h('table', { className: 'data-table' }, h('tbody', null, ...rows.map(([a, b]) => h('tr', null, h('td', null, a), h('td', { className: 'num' }, b)))));
  const grid = (head, rows, testid) => h('div', { className: 'thermal-table-wrap', dataset: testid ? { testid } : undefined },
    h('table', { className: 'data-table' }, h('thead', null, h('tr', null, ...head.map((c) => h('th', null, c)))),
      h('tbody', null, ...rows.map((r) => h('tr', null, ...r.map((c, i) => h('td', { className: i ? 'num' : null }, c)))))));
  const fmt = (v, digits) => formatValue(v, digits);

  // ── DSC / TGA working curve: the loaded curve with the multi-point temperature calibration applied to T.
  const work = () => {
    if (!st.curve) return null;
    if (!st.mcal) return st.curve;
    return { ...st.curve, T: st.curve.T.map((v) => st.mcal.slope * v + st.mcal.offset) };
  };
  const at = (curve, frac) => curve.T[Math.min(curve.T.length - 1, Math.floor(curve.T.length * frac))];
  const setCurve = (curve, name) => {
    st.curve = curve;
    st.name = name;
    st.T1 = at(curve, 0.25);
    st.T2 = at(curve, 0.75);
    st.tgT1 = at(curve, 0.2);
    st.tgT2 = at(curve, 0.8);
    st.extraPeaks = [];
    render();
  };
  const load = (text, name) => setCurve(parseCurveCsv(text), name);
  const peakOf = (curve, range) => {
    const opts = { T1: range.T1, T2: range.T2, mass: st.mass, rate: st.rate };
    const raw = st.baselineKind === 'sigmoid' ? integrateOver(curve, sigmoidBaseline(curve, range.T1, range.T2), opts) : integratePeak(curve, opts);
    return applyCalibration(raw, st.cal);
  };
  const allRanges = () => [{ T1: st.T1, T2: st.T2 }, ...st.extraPeaks];
  const tgResult = (curve) => {
    if (!st.tg || !curve) return null;
    try { return glassTransition(curve, st.tgT1, st.tgT2, { rate: st.rate, mass: st.mass }); } catch (error) { return { error: error.message }; }
  };
  const results = (curve = work()) => {
    if (!curve) return null;
    if (st.mode === 'tga') return analyseTga(curve);
    return peakOf(curve, { T1: st.T1, T2: st.T2 });
  };

  // ── kinetics
  const kinAnalysis = () => {
    const k = st.kin;
    if (!k.runs.length || !Number.isFinite(k.T1) || !Number.isFinite(k.T2)) return { rows: [] };
    const rows = k.runs.map((run) => {
      const r = integratePeak(run.curve, { T1: k.T1, T2: k.T2, mass: run.curve.mass ?? 1, rate: run.rate });
      const conv = conversion(run.curve, k.T1, k.T2, 'linear');
      return { Tp: r.peak, Ta: tAtAlpha(conv, k.alpha) };
    });
    const out = { rows };
    const kRuns = k.runs.map((run, i) => ({ rate: run.rate, Tp: rows[i].Tp })).filter((r) => Number.isFinite(r.Tp) && r.rate > 0);
    const oRuns = k.runs.map((run, i) => ({ rate: run.rate, T: rows[i].Ta })).filter((r) => Number.isFinite(r.T) && r.rate > 0);
    try { out.kis = kissinger(kRuns); } catch { out.kis = null; }
    try { out.ofw = ozawaFlynnWall(oRuns); } catch { out.ofw = null; }
    return out;
  };
  const autoKinWindow = () => {
    const k = st.kin;
    let lo = Infinity; let hi = -Infinity;
    for (const run of k.runs) {
      const { T, y } = run.curve;
      const top = Math.max(...y); const bottom = Math.min(...y);
      const limit = bottom + (top - bottom) * 0.01;
      T.forEach((v, i) => { if (y[i] > limit) { lo = Math.min(lo, v); hi = Math.max(hi, v); } });
    }
    if (Number.isFinite(lo) && hi > lo) {
      const pad = (hi - lo) * 0.05;
      k.T1 = Math.round((lo - pad) * 10) / 10;
      k.T2 = Math.round((hi + pad) * 10) / 10;
    }
  };

  // ── cp by the sapphire method
  const cpAnalysis = () => {
    const c = st.cpw;
    if (!c.blank || !c.sapphire || !c.sample) return null;
    try { return sapphireCp({ blank: c.blank, sapphire: c.sapphire, sample: c.sample, massSapphire: c.mSapphire, massSample: c.mSample }); } catch (error) { return { error: error.message, points: [], cpT: [] }; }
  };

  // ── chart
  const paint = () => {
    const s = S();
    const blank = () => canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    if (st.mode === 'kinetics') {
      const k = st.kin;
      if (!k.runs.length) { blank(); return; }
      if (k.view === 'curves') {
        drawLineChart(canvas, k.runs.map((run) => ({ name: `${formatValue(run.rate)} K/min`, points: run.curve.T.map((v, i) => [v, run.curve.y[i]]) })), { xLabel: 'T (°C)', yLabel: 'mW' });
        return;
      }
      const a = kinAnalysis();
      if (!a.kis) { blank(); return; }
      const pts = a.kis.points.map((p) => [1000 * p.x, p.y]).sort((p, q) => p[0] - q[0]);
      const fit = linearFit(pts.map((p) => p[0]), pts.map((p) => p[1]));
      const x0 = pts[0][0]; const x1 = pts[pts.length - 1][0]; const pad = (x1 - x0) * 0.08 || 0.01;
      const line = [x0 - pad, x1 + pad].map((x) => [x, fit.intercept + fit.slope * x]);
      // The runs as dots only: NaN gaps between them break the polyline (the chart draws dots under 40 points).
      const dots = pts.flatMap((p, i) => (i ? [[NaN, NaN], p] : [p]));
      drawLineChart(canvas, [{ name: s.points, points: dots, color: '#3ec1ff' },{ name: s.fitLine, points: line, color: '#ff7a59' }], { xLabel: '1000/Tp (1/K)', yLabel: 'ln(β/Tp²)' });
      return;
    }
    if (st.mode === 'cp') {
      const c = st.cpw;
      if (c.view === 'curves') {
        const series = [['blank', s.blank, '#a0aec0'], ['sapphire', s.sapphire, '#3ec1ff'], ['sample', s.sample, '#ff7a59']]
          .filter(([key]) => c[key]).map(([key, name, color]) => ({ name, color, points: c[key].T.map((v, i) => [v, c[key].y[i]]) }));
        if (!series.length) { blank(); return; }
        drawLineChart(canvas, series, { xLabel: 'T (°C)', yLabel: 'mW' });
        return;
      }
      const r = cpAnalysis();
      if (!r?.points?.length) { blank(); return; }
      drawLineChart(canvas, [
        { name: 'cp', points: r.points.map((p) => [p.T, p.cp]), color: '#7ddc6a' },
        { name: s.cpRef, points: r.points.map((p) => [p.T, sapphireCpAt(p.T)]), color: '#a0aec0' },
      ], { xLabel: 'T (°C)', yLabel: 'cp (J/g·K)' });
      return;
    }
    const curve = work();
    if (!curve) { blank(); return; }
    const r = results(curve);
    if (st.mode === 'dsc' && st.view === 'alpha') {
      const series = allRanges().map((range, n) => ({ name: s.alphaSeries(n + 1), points: conversion(curve, range.T1, range.T2, st.baselineKind).map((p) => [p.T, p.alpha]) }));
      drawLineChart(canvas, series, { xLabel: 'T (°C)', yLabel: 'α' });
      return;
    }
    const pts = curve.T.map((v, i) => [v, curve.y[i]]);
    const series = [{ name: st.mode === 'tga' ? t('tgaMass') : t('dscHeatFlow'), points: pts }];
    let marker = st.mode === 'dsc' ? r?.peak : r?.dtgPeak;
    if (st.mode === 'dsc') {
      allRanges().forEach((range, n) => {
        const base = n === 0 && r?.baseline ? r.baseline : peakOf(curve, range).baseline;
        const lo = Math.min(range.T1, range.T2); const hi = Math.max(range.T1, range.T2);
        series.push({ name: n === 0 ? t('baseline') : `${t('baseline')} ${n + 1}`, points: curve.T.map((v, i) => [v, base[i]]).filter(([v]) => v >= lo && v <= hi), color: '#f5c542' });
      });
      const tg = tgResult(curve);
      if (tg && !tg.error) {
        const lo = Math.min(st.tgT1, st.tgT2); const hi = Math.max(st.tgT1, st.tgT2);
        const line = (fn, a, b) => [[a, fn(a)], [b, fn(b)]];
        const w = Number.isFinite(tg.endset - tg.onset) ? Math.max(1, tg.endset - tg.onset) : (hi - lo) * 0.2;
        const end = Number.isFinite(tg.endset) ? Math.min(hi, tg.endset + w * 0.3) : hi;
        const start = Number.isFinite(tg.onset) ? Math.max(lo, tg.onset - w * 0.3) : lo;
        series.push({ name: s.tanPre, points: line((v) => tg.pre.intercept + tg.pre.slope * v, lo, end), color: '#c58cff' });
        series.push({ name: s.tanPost, points: line((v) => tg.post.intercept + tg.post.slope * v, start, hi), color: '#4fd1c5' });
        series.push({ name: s.tanInfl, points: line((v) => tg.tangent.y + tg.tangent.slope * (v - tg.tangent.T), start, end), color: '#ff5fa2' });
        if (Number.isFinite(tg.midpoint)) marker = tg.midpoint;
      }
      if (st.deriv) {
        // dy/dT is drawn normalised onto the heat-flow range (one y axis): its shape and zero crossings, not its scale.
        const d = derivative(curve, 9).map((p) => p.y);
        const ys = curve.y;
        const ylo = Math.min(...ys); const yhi = Math.max(...ys);
        const dlo = Math.min(...d); const dhi = Math.max(...d);
        series.push({ name: s.derivSeries, points: curve.T.map((v, i) => [v, ylo + ((d[i] - dlo) / (dhi - dlo || 1)) * (yhi - ylo)]), color: '#ffa94d' });
      }
    }
    if (st.mode === 'tga' && st.dtg && r?.dtg) {
      const max = Math.max(...r.dtg);
      series.push({ name: 'DTG', points: curve.T.map((v, i) => [v, 100 * (r.dtg[i] / (max || 1))]), color: '#ff7a59' });
    }
    drawLineChart(canvas, series, { xLabel: 'T (°C)', yLabel: st.mode === 'tga' ? '%' : 'mW', marker });
  };

  // ── side panels
  const modeTabs = () => h('div', { className: 'row thermal-tabs' }, ...[['dsc', 'DSC'], ['tga', 'TGA'], ['kinetics', S().kinetics], ['cp', S().cpTab]].map(([m, label]) => h('button', {
    type: 'button', className: st.mode === m ? 'on' : null, dataset: { testid: `thermal-${m}` },
    onClick: () => { if (m === 'dsc' || m === 'tga') st.curve = null; st.mode = m; render(); },
  }, label)));

  const views = () => {
    const s = S();
    const opts = st.mode === 'dsc' ? [['curve', s.viewCurve], ['alpha', s.viewAlpha]]
      : st.mode === 'kinetics' ? [['kissinger', s.viewKissinger], ['curves', s.viewCurves]]
        : st.mode === 'cp' ? [['cp', s.viewCp], ['curves', s.viewCurves]] : [];
    const current = st.mode === 'kinetics' ? st.kin.view : st.mode === 'cp' ? st.cpw.view : st.view;
    const set = (v) => { if (st.mode === 'kinetics') st.kin.view = v; else if (st.mode === 'cp') st.cpw.view = v; else st.view = v; render(); };
    const toggles = [];
    if (st.mode === 'dsc' && st.curve) toggles.push(check(s.derivative, st.deriv, 'thermal-deriv', (v) => { st.deriv = v; render(); }));
    if (st.mode === 'tga' && st.curve) toggles.push(check(s.dtgOverlay, st.dtg, 'thermal-dtg', (v) => { st.dtg = v; render(); }));
    return [...opts.map(([v, label]) => h('button', { type: 'button', className: current === v ? 'on' : null, dataset: { testid: `thermal-view-${v}` }, onClick: () => set(v) }, label)), ...toggles];
  };

  const calibrationPanel = () => {
    const s = S();
    const stdOptions = (selected) => Object.entries(DSC_STANDARDS).map(([id, std]) => h('option', { value: id, selected: id === selected }, `${std.name} (${std.onset} °C, ${std.enthalpy} J/g)`));
    const parts = [h('legend', null, t('calibrationTitle')),
      row(s.calMode, h('select', { dataset: { testid: 'thermal-cal-mode' }, onChange: (e) => { st.calMode = e.target.value; render(); } },
        h('option', { value: 'single', selected: st.calMode === 'single' }, s.calSingle), h('option', { value: 'multi', selected: st.calMode === 'multi' }, s.calMulti)))];
    if (st.calMode === 'single') {
      parts.push(
        row(t('standard'), h('select', { dataset: { testid: 'thermal-standard' }, onChange: (e) => { st.standard = e.target.value; render(); } }, ...stdOptions(st.standard))),
        row(t('measuredOnset'), numberField({ value: st.calOnset, step: 0.1, suffix: '°C', testid: 'thermal-cal-onset', onChange: (v) => { st.calOnset = v; } })),
        row(t('measuredEnthalpy'), numberField({ value: st.calEnthalpy, step: 0.1, suffix: 'J/g', testid: 'thermal-cal-enthalpy', onChange: (v) => { st.calEnthalpy = v; } })),
        h('div', { className: 'row' },
          btn(t('applyCalibration'), 'thermal-calibrate', () => { st.cal = calibration(st.standard, st.calOnset, st.calEnthalpy); render(); }),
          st.cal ? btn(t('reset'), 'thermal-cal-clear', () => { st.cal = null; render(); }) : null),
        st.cal ? h('p', { className: 'part-help' }, `ΔT ${formatValue(st.cal.offset)} K · ×${formatValue(st.cal.factor)}`) : null);
    } else {
      st.mstd.forEach((item, i) => {
        parts.push(h('div', { className: 'thermal-std' },
          h('div', { className: 'row' }, h('span', null, `${t('standard')} ${i + 1}`),
            h('select', { dataset: { testid: `thermal-cal-std-${i}` }, onChange: (e) => { item.id = e.target.value; render(); } }, ...stdOptions(item.id))),
          h('div', { className: 'row' }, h('span', null, s.measured),
            h('span', { className: 'thermal-inline' }, numberField({ value: item.measured, step: 0.1, suffix: '°C', testid: `thermal-cal-measured-${i}`, onChange: (v) => { item.measured = v; } }),
              st.mstd.length > 1 ? btn('✕', `thermal-cal-remove-${i}`, () => { st.mstd.splice(i, 1); render(); }, { title: s.remove, className: 'ghost' }) : null))));
      });
      parts.push(h('div', { className: 'row thermal-buttons' },
        st.mstd.length < 3 ? btn(s.addStandard, 'thermal-cal-add', () => {
          const used = new Set(st.mstd.map((m) => m.id));
          const id = Object.keys(DSC_STANDARDS).find((k) => !used.has(k)) ?? 'indium';
          st.mstd.push({ id, measured: DSC_STANDARDS[id].onset });
          render();
        }) : null,
        btn(s.fit, 'thermal-cal-fit', () => {
          try {
            const fit = multiPointCalibration(st.mstd.map((m) => ({ name: DSC_STANDARDS[m.id]?.name, measured: m.measured, reference: DSC_STANDARDS[m.id]?.onset })));
            st.mcal = { slope: fit.slope, offset: fit.offset, r2: fit.r2 };
          } catch { st.mcal = { error: true }; }
          if (st.mcal.error) st.mcal = null;
          render();
        }),
        st.mcal ? btn(t('reset'), 'thermal-cal-reset', () => { st.mcal = null; render(); }) : null));
    }
    if (st.mcal) {
      parts.push(h('p', { className: 'part-help' }, s.calApplied),
        h('div', { dataset: { testid: 'thermal-cal-result' } }, table([[s.slope, fmt(st.mcal.slope, 6)], [s.offset, `${fmt(st.mcal.offset, 5)} °C`], ['R²', fmt(st.mcal.r2, 6)]])));
    }
    return h('fieldset', { className: 'field-group' }, ...parts);
  };

  const dscPanel = (curve, r) => {
    const s = S();
    const tg = tgResult(curve);
    const peakRows = st.extraPeaks.length ? allRanges().map((range, n) => {
      const p = n === 0 ? r : peakOf(curve, range);
      return [`${n + 1}`, `${fmt(Math.min(range.T1, range.T2), 4)}–${fmt(Math.max(range.T1, range.T2), 4)}`, fmt(p.enthalpy), fmt(p.peak), fmt(p.onset), fmt(p.endset)];
    }) : null;
    return [
      row(t('sampleMass'), numberField({ value: st.mass, min: 0.01, step: 0.5, suffix: 'mg', testid: 'thermal-mass', onChange: (v) => { st.mass = v; render(); } })),
      row(t('heatingRate'), numberField({ value: st.rate, min: 0.1, step: 1, suffix: 'K/min', testid: 'thermal-rate', onChange: (v) => { st.rate = v; render(); } })),
      h('fieldset', { className: 'field-group' }, h('legend', null, s.peaks),
        row(s.baseline, h('select', { dataset: { testid: 'thermal-baseline' }, onChange: (e) => { st.baselineKind = e.target.value; render(); } },
          h('option', { value: 'linear', selected: st.baselineKind === 'linear' }, s.linear), h('option', { value: 'sigmoid', selected: st.baselineKind === 'sigmoid' }, s.sigmoid))),
        st.extraPeaks.length ? h('div', { className: 'thermal-subhead' }, s.peak(1)) : null,
        row(t('rangeFrom'), numberField({ value: st.T1, step: 1, suffix: '°C', testid: 'thermal-t1', onChange: (v) => { st.T1 = v; render(); } })),
        row(t('rangeTo'), numberField({ value: st.T2, step: 1, suffix: '°C', testid: 'thermal-t2', onChange: (v) => { st.T2 = v; render(); } })),
        ...st.extraPeaks.map((range, i) => h('div', { className: 'thermal-peak', dataset: { testid: `thermal-peak-${i + 2}` } },
          h('div', { className: 'thermal-subhead' }, h('span', null, s.peak(i + 2)), btn('✕', `thermal-peak-remove-${i + 2}`, () => { st.extraPeaks.splice(i, 1); render(); }, { title: s.remove, className: 'ghost' })),
          row(t('rangeFrom'), numberField({ value: range.T1, step: 1, suffix: '°C', testid: `thermal-peak-t1-${i + 2}`, onChange: (v) => { range.T1 = v; render(); } })),
          row(t('rangeTo'), numberField({ value: range.T2, step: 1, suffix: '°C', testid: `thermal-peak-t2-${i + 2}`, onChange: (v) => { range.T2 = v; render(); } })))),
        h('div', { className: 'row thermal-buttons' }, btn(s.addPeak, 'thermal-peak-add', () => {
          const ranges = allRanges();
          const last = Math.max(...ranges.map((x) => Math.max(x.T1, x.T2)));
          const width = Math.max(1, Math.abs(st.T2 - st.T1) / 2);
          const top = Math.max(...curve.T);
          const T1 = Math.min(last, top - width);
          st.extraPeaks.push({ T1: Math.round(T1 * 10) / 10, T2: Math.round(Math.min(top, T1 + width) * 10) / 10 });
          render();
        })),
        peakRows ? grid(['#', s.colRange, s.colH, s.colPeak, s.colOnset, s.colEndset], peakRows, 'thermal-peaks-table') : null),
      h('fieldset', { className: 'field-group' }, h('legend', null, s.tgTitle),
        h('div', { className: 'row thermal-buttons' },
          check(s.tgOn, st.tg, 'thermal-tg-toggle', (v) => { st.tg = v; render(); }),
          btn(s.tgSample, 'thermal-tg-sample', () => { st.mass = 10; st.rate = 10; st.tg = true; setCurve(sampleTgCurve({ noise: 0.002 }), 'tg-sample.csv'); })),
        st.tg ? [
          row('T1', numberField({ value: st.tgT1, step: 1, suffix: '°C', testid: 'thermal-tg-t1', onChange: (v) => { st.tgT1 = v; render(); } })),
          row('T2', numberField({ value: st.tgT2, step: 1, suffix: '°C', testid: 'thermal-tg-t2', onChange: (v) => { st.tgT2 = v; render(); } })),
          tg?.error ? h('p', { className: 'part-help' }, s.tgError)
            : tg ? h('div', { dataset: { testid: 'thermal-tg-result' } }, table([[s.tgOnset, `${fmt(tg.onset)} °C`], [s.tgMid, `${fmt(tg.midpoint)} °C`], [s.tgEnd, `${fmt(tg.endset)} °C`], [s.tgInfl, `${fmt(tg.inflection)} °C`],
              ['ΔCp', `${fmt(tg.deltaCp)} ${tg.deltaCpUnit === 'J/gK' ? 'J/g·K' : tg.deltaCpUnit}`]])) : null,
        ] : null),
      calibrationPanel(),
      r ? h('div', { dataset: { testid: 'thermal-dsc-result' } }, table([[t('enthalpyResult'), `${fmt(r.enthalpy)} J/g`], [t('onsetT'), `${fmt(r.onset)} °C`], [t('peakT'), `${fmt(r.peak)} °C`], [t('endsetT'), `${fmt(r.endset)} °C`],
        [t('cpApparent'), `${fmt(specificHeat(Math.abs(curve.y[0]), st.mass, st.rate))} J/g·K`]])) : null,
      h('button', { type: 'button', className: 'primary', dataset: { testid: 'thermal-material' }, onClick: () => {
        const material = pcmFromDsc(r, {}, `DSC · ${st.name}`);
        app.addMaterial(material);
      } }, `🧱 ${t('makeMaterial')}`),
    ];
  };

  const tgaPanel = (curve, r) => {
    const s = S();
    let steps = [];
    try { steps = tgaSteps(curve); } catch { steps = []; }
    return [
      table([['T5 %', `${fmt(r.T5)} °C`], ['T10 %', `${fmt(r.T10)} °C`], ['T50 %', `${fmt(r.T50)} °C`], [t('dtgPeak'), `${fmt(r.dtgPeak)} °C`], [t('residue'), `${fmt(r.residue)} %`], [t('steps'), r.steps.map((v) => `${fmt(v)} °C`).join(', ')]]),
      h('strong', null, s.stepsTitle),
      steps.length ? grid(['#', s.colStart, s.colEnd, s.colLoss, s.colDtg, s.colExt], steps.map((p, i) => [`${i + 1}`, fmt(p.Tstart), fmt(p.Tend), fmt(p.massLossPct), fmt(p.dtgPeakT), fmt(p.extrapolatedOnset)]), 'thermal-tga-steps')
        : h('p', { className: 'part-help' }, s.noSteps),
    ];
  };

  const kineticsPanel = () => {
    const s = S();
    const k = st.kin;
    const a = kinAnalysis();
    const addRun = (curve, name, rate) => {
      k.runs.push({ name, rate, curve });
      if (!Number.isFinite(k.T1) || !Number.isFinite(k.T2) || k.runs.length === 1) autoKinWindow();
      render();
    };
    return [
      h('p', { className: 'part-help' }, s.kinHint),
      h('div', { className: 'row thermal-buttons' },
        btn(s.loadRun, 'thermal-kin-load', () => app.openCurve((text, name) => { try { addRun(parseCurveCsv(text), name, rateFromName(name)); } catch { /* not a curve */ } })),
        btn(s.sampleRuns, 'thermal-kin-sample', () => {
          k.runs = sampleKineticRuns().map((run) => ({ name: `kinetic-${run.rate}Kmin.csv`, rate: run.rate, curve: run.curve }));
          autoKinWindow();
          render();
        }),
        k.runs.length ? btn(s.clearRuns, 'thermal-kin-clear', () => { k.runs = []; render(); }) : null),
      k.runs.length ? [
        h('strong', null, s.runs),
        ...k.runs.map((run, i) => h('div', { className: 'thermal-run', dataset: { testid: `thermal-kin-run-${i}` } },
          h('div', { className: 'thermal-subhead' }, h('span', { title: run.name }, run.name), btn('✕', `thermal-kin-remove-${i}`, () => { k.runs.splice(i, 1); render(); }, { title: s.remove, className: 'ghost' })),
          row(s.rate, numberField({ value: run.rate, min: 0.01, step: 1, suffix: 'K/min', testid: `thermal-kin-rate-${i}`, onChange: (v) => { run.rate = v; render(); } })),
          h('p', { className: 'part-help' }, `Tp ${fmt(a.rows[i]?.Tp)} °C · ${s.tAlpha(fmt(k.alpha, 3))} ${fmt(a.rows[i]?.Ta)} °C`))),
        h('fieldset', { className: 'field-group' }, h('legend', null, s.peakWindow),
          row(t('rangeFrom'), numberField({ value: k.T1, step: 1, suffix: '°C', testid: 'thermal-kin-t1', onChange: (v) => { k.T1 = v; render(); } })),
          row(t('rangeTo'), numberField({ value: k.T2, step: 1, suffix: '°C', testid: 'thermal-kin-t2', onChange: (v) => { k.T2 = v; render(); } })),
          h('div', { className: 'row thermal-buttons' }, btn(s.autoWindow, 'thermal-kin-auto', () => { autoKinWindow(); render(); })),
          row(s.alpha, numberField({ value: k.alpha, min: 0.01, max: 0.99, step: 0.05, digits: 3, testid: 'thermal-kin-alpha', onChange: (v) => { k.alpha = v; render(); } }))),
        h('div', { dataset: { testid: 'thermal-kin-result' } },
          h('strong', null, s.kissinger),
          a.kis ? table([['Ea', `${fmt(a.kis.Ea_kJ)} kJ/mol`], ['A', `${a.kis.A.toExponential(3)} 1/s`], ['R²', fmt(a.kis.r2, 5)]]) : h('p', { className: 'part-help' }, s.needTwo),
          h('strong', null, `${s.ofw} (α = ${fmt(k.alpha, 3)})`),
          a.ofw ? table([['Ea', `${fmt(a.ofw.Ea_kJ)} kJ/mol`], ['R²', fmt(a.ofw.r2, 5)]]) : h('p', { className: 'part-help' }, s.needTwo)),
      ] : null,
    ];
  };

  const cpPanel = () => {
    const s = S();
    const c = st.cpw;
    const r = cpAnalysis();
    const loader = (key, label) => h('div', { className: 'row' }, h('span', null, label),
      h('span', { className: 'thermal-inline' },
        btn(`⇪ ${s.load}`, `thermal-cp-load-${key}`, () => app.openCurve((text, name) => { try { c[key] = parseCurveCsv(text); c.names[key] = name; c.message = ''; render(); } catch { /* not a curve */ } })),
        h('span', { className: 'thermal-file', title: c.names[key] ?? '' }, c[key] ? (c.names[key] ?? '✓') : s.notLoaded)));
    const rows = r?.cpT?.length ? r.cpT.filter((_, i, all) => i % Math.max(1, Math.ceil(all.length / 8)) === 0 || i === all.length - 1) : [];
    return [
      h('p', { className: 'part-help' }, s.cpHint),
      loader('blank', s.blank), loader('sapphire', s.sapphire), loader('sample', s.sample),
      row(s.massSapphire, numberField({ value: c.mSapphire, min: 0.01, step: 1, suffix: 'mg', testid: 'thermal-cp-mass-sapphire', onChange: (v) => { c.mSapphire = v; render(); } })),
      row(s.massSample, numberField({ value: c.mSample, min: 0.01, step: 1, suffix: 'mg', testid: 'thermal-cp-mass-sample', onChange: (v) => { c.mSample = v; render(); } })),
      h('div', { className: 'row thermal-buttons' }, btn(s.cpSample, 'thermal-cp-sample', () => {
        const curves = sampleCpCurves(c.mSapphire, c.mSample);
        Object.assign(c, curves);
        c.names = { blank: 'blank.csv', sapphire: 'sapphire.csv', sample: 'sample.csv' };
        c.message = '';
        render();
      })),
      !r ? h('p', { className: 'part-help' }, s.cpMissing) : null,
      r?.points?.length ? [
        h('div', { dataset: { testid: 'thermal-cp-result' } },
          table([[s.cpRange, `${fmt(Math.min(...r.points.map((p) => p.cp)))} – ${fmt(Math.max(...r.points.map((p) => p.cp)))} J/g·K`]]),
          grid(['T °C', 'cp J/kg·K'], rows.map(([T, cp]) => [fmt(T), fmt(cp, 5)]))),
        row(s.cpName, h('input', { type: 'text', value: c.name, dataset: { testid: 'thermal-cp-name' }, onChange: (e) => { c.name = e.target.value; } })),
        h('button', { type: 'button', className: 'primary', dataset: { testid: 'thermal-cp-use' }, onClick: () => {
          if (typeof app.addMaterialCpT !== 'function') { c.message = s.notSupported; render(); return; }
          app.addMaterialCpT?.(r.cpT.map((p) => [...p]), c.name || 'cp(T)');
          c.message = s.sent;
          render();
        } }, `🧱 ${s.useCp}`),
        c.message ? h('p', { className: 'part-help', dataset: { testid: 'thermal-cp-message' } }, c.message) : null,
      ] : null,
    ];
  };

  function render() {
    const curve = work();
    const r = st.mode === 'dsc' || st.mode === 'tga' ? results(curve) : null;
    replace(viewRow, ...views());
    let body = null;
    if (st.mode === 'dsc' || st.mode === 'tga') {
      body = [
        h('p', { className: 'part-help' }, st.mode === 'dsc' ? t('dscHint') : t('tgaHint')),
        h('div', { className: 'row' },
          btn(`⇪ ${t('importCurve')}`, 'thermal-import', () => app.openCurve((text, name) => load(text, name))),
          btn(t('heatmapSample'), 'thermal-sample', () => load(st.mode === 'dsc' ? sampleDscCsv() : sampleTgaCsv(), st.mode === 'dsc' ? 'paraffin-dsc.csv' : 'polymer-tga.csv'))),
        st.curve ? h('strong', null, st.name) : null,
        st.curve && st.mode === 'dsc' ? dscPanel(curve, r) : null,
        st.curve && st.mode === 'tga' && r ? [st.mcal ? h('p', { className: 'part-help' }, `${S().calApplied} (a ${fmt(st.mcal.slope, 5)}, b ${fmt(st.mcal.offset, 4)})`) : null, tgaPanel(curve, r)] : null,
      ];
    } else if (st.mode === 'kinetics') body = kineticsPanel();
    else body = cpPanel();
    replace(side, modeTabs(), body);
    requestAnimationFrame(paint);
  }
  render();
  popup({
    id: 'thermal', title: t('thermalTitle'), icon: '🔬', width: 1100, height: 740,
    body: h('div', { className: 'heatmap-layout thermal-layout' },
      h('div', { className: 'thermal-main' }, viewRow, h('div', { className: 'heatmap-canvas thermal-canvas' }, canvas)), side),
    actions: [{ label: t('close'), primary: true }],
  });
}
