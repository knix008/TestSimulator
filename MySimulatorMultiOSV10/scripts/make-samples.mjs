// Writes every sample pipeline as a .mysim file: samples/<id>.mysim (Korean) and
// samples/en/<id>.mysim (English), plus small data files the integration samples
// read. The installer ships the folder; the batch mode and the tests use it.
//   node scripts/make-samples.mjs   (npm run samples)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SAMPLE_IDS, sampleModel } from '../src/core/samples.js';
import { serializeModel } from '../src/core/model.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'samples');
fs.mkdirSync(path.join(dir, 'en'), { recursive: true });
for (const file of fs.readdirSync(dir)) if (file.endsWith('.mysim')) fs.rmSync(path.join(dir, file));
for (const file of fs.readdirSync(path.join(dir, 'en'))) if (file.endsWith('.mysim')) fs.rmSync(path.join(dir, 'en', file));
fs.rmSync(path.join(dir, '.keep'), { force: true });
for (const id of SAMPLE_IDS) {
  fs.writeFileSync(path.join(dir, `${id}.mysim`), serializeModel(sampleModel(id, 'ko')));
  fs.writeFileSync(path.join(dir, 'en', `${id}.mysim`), serializeModel(sampleModel(id, 'en')));
}

// A data file and a pipeline that reads it from disk, filters it with Python and writes the result:
// the "data in → preprocessing → simulation → report" automation in one file (desktop).
const rows = ['t (s),load (kN)'];
for (let i = 0; i <= 400; i++) {
  const t = i * 0.05;
  rows.push(`${t.toFixed(2)},${(20 + 6 * Math.sin(0.9 * t) + 2.5 * Math.sin(7.3 * t) + ((i * 7919) % 101) / 101 - 0.5).toFixed(4)}`);
}
fs.writeFileSync(path.join(dir, 'load-measurement.csv'), `${rows.join('\n')}\n`);
const automation = (lang) => {
  const en = lang === 'en';
  return {
    format: 'mysim', version: 1,
    name: en ? 'Automation: file → Python → filter → report' : '자동화: 파일 → Python → 필터 → 보고서',
    description: en
      ? 'Reads load-measurement.csv from disk, removes the trend in Python, low-pass filters, finds the peaks and writes the cleaned data back to a CSV file. Run it in the desktop app or with MySimulator --batch.'
      : 'load-measurement.csv 를 디스크에서 읽어 Python 으로 추세를 빼고, 저역 통과 필터와 피크 찾기를 거쳐 정제한 데이터를 CSV 파일로 씁니다. 데스크톱 앱이나 MySimulator --batch 로 실행합니다.',
    nodes: [
      { id: 'read', type: 'io.readFile', name: en ? 'Measured load' : '측정 하중', x: 60, y: 190, params: { path: lang === 'en' ? '../load-measurement.csv' : 'load-measurement.csv' } },
      { id: 'py', type: 'io.python', name: en ? 'Detrend (Python)' : '추세 제거 (Python)', x: 320, y: 190, params: { code: "n = len(data['t'])\nt = data['t']\ny = data['load']\nmt = sum(t) / n\nmy = sum(y) / n\nb = sum((a - mt) * (c - my) for a, c in zip(t, y)) / sum((a - mt) ** 2 for a in t)\nout['t'] = t\nout['load'] = [c - (my + b * (a - mt)) for a, c in zip(t, y)]\nresult('trend slope', b)", timeout: 60 } },
      { id: 'lp', type: 'signal.filter', name: en ? 'Low pass 2 Hz' : '저역 통과 2 Hz', x: 580, y: 190, params: { design: 'butterworth', type: 'lowpass', cutoff: 2, order: 4, zeroPhase: true, column: 'load' } },
      { id: 'pk', type: 'signal.peaks', name: en ? 'Load peaks' : '하중 피크', x: 840, y: 330, params: { column: 'filtered', minProminence: 1 } },
      { id: 'write', type: 'io.writeFile', name: en ? 'Write cleaned data' : '정제 데이터 쓰기', x: 840, y: 50, params: { path: 'load-cleaned.csv' } },
      { id: 'plot', type: 'out.plot', name: en ? 'Chart' : '차트', x: 840, y: 190, params: { title: en ? 'Detrended and filtered' : '추세 제거·필터 결과', chart: 'line', y: 'load, filtered', span: '2' } },
      { id: 'kpi', type: 'out.kpi', name: en ? 'Peaks' : '피크 수', x: 1100, y: 330, params: { label: en ? 'Peaks' : '피크 수', source: 'peaks' } },
    ],
    links: [
      { id: 'l1', from: 'read', to: 'py' }, { id: 'l2', from: 'py', to: 'lp' }, { id: 'l3', from: 'lp', to: 'pk' },
      { id: 'l4', from: 'lp', to: 'write' }, { id: 'l5', from: 'lp', to: 'plot' }, { id: 'l6', from: 'pk', to: 'kpi' },
    ],
    settings: { seed: 1 },
  };
};
const ko = automation('ko');
ko.nodes[0].params.path = 'load-measurement.csv';
const en = automation('en');
en.nodes[0].params.path = '../load-measurement.csv';
fs.writeFileSync(path.join(dir, 'automation.mysim'), `${JSON.stringify(ko, null, 2)}\n`);
fs.writeFileSync(path.join(dir, 'en', 'automation.mysim'), `${JSON.stringify(en, null, 2)}\n`);
console.log(`${SAMPLE_IDS.length * 2 + 2} pipelines and 1 data file → samples/`);
