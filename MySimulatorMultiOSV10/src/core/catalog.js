// The node catalogue: every node type the engine runs (engine/sim-core/src/nodes),
// with its category, icon, names and help in both languages, its input ports and
// the parameters the property panel edits. Presets fill several parameters at once
// (an ODE system, a transfer function, a Monte Carlo model …).

/** Categories (node colours, palette groups). */
export const CATEGORIES = {
  source: { icon: '◉', ko: '소스', en: 'Sources', color: '#4fb3ff' },
  data: { icon: '▤', ko: '데이터 처리', en: 'Data', color: '#8fd16a' },
  signal: { icon: '∿', ko: '신호 처리', en: 'Signal', color: '#f5b94a' },
  dynamics: { icon: '⟳', ko: '동역학·제어', en: 'Dynamics & control', color: '#ff7a59' },
  physics: { icon: '⚡', ko: '회로·물리', en: 'Circuits & physics', color: '#e8d44d' },
  robotics: { icon: '🤖', ko: '로봇·다물체', en: 'Robots & multibody', color: '#7ee0a0' },
  cad: { icon: '📐', ko: 'CAD·형상', en: 'CAD & geometry', color: '#9ec5ff' },
  analysis: { icon: '∑', ko: '통계·ML', en: 'Statistics & ML', color: '#c58cff' },
  montecarlo: { icon: '🎲', ko: '몬테카를로·최적화', en: 'Monte Carlo & optimisation', color: '#4fd1c5' },
  integration: { icon: '⇄', ko: '연동', en: 'Integration', color: '#ff5fa2' },
  output: { icon: '▣', ko: '출력', en: 'Output', color: '#a0aec0' },
};

const P = (key, type, def, ko, en, extra = {}) => ({ key, type, def, ko, en, ...extra });
const opt = (value, ko, en = ko) => [value, ko, en];
const IN = [{ port: 'in', ko: '입력', en: 'Input' }];

const WINDOWS = [opt('hann', 'Hann'), opt('hamming', 'Hamming'), opt('blackman', 'Blackman'), opt('flattop', 'Flat top'), opt('bartlett', 'Bartlett'), opt('rect', '사각(없음)', 'Rectangular (none)')];
const METHODS = [opt('rk45', 'RK45 (적응형)', 'RK45 (adaptive)'), opt('rk4', 'RK4 (고정 간격)', 'RK4 (fixed step)'), opt('euler', '오일러', 'Euler')];
const AGGREGATES = ['last', 'max', 'min', 'mean', 'rms', 'std', 'absmax', 'range', 'median', 'sum', 'first', 'count', 'p5', 'p95'].map((v) => opt(v, v));
const TABLE = P('table', 'table', '', '입력 표', 'Input table', { help: ['비우면 첫 번째 표', 'Empty = the first table'] });

export const NODES = [
  // ───────────────────────── sources
  {
    type: 'source.signal', cat: 'source', icon: '∿', ko: '신호 발생기', en: 'Signal generator',
    help: ['정현파·구형파·삼각파·톱니파·처프·펄스·계단·임펄스·잡음 신호를 만듭니다. 성분(주파수:진폭)과 백색 잡음을 더할 수 있습니다.', 'Makes sine, square, triangle, sawtooth, chirp, pulse, step, impulse or noise signals. Extra components (frequency:amplitude) and white noise can be added.'],
    inputs: [],
    params: [
      P('waveform', 'select', 'sine', '파형', 'Waveform', { options: [opt('sine', '정현파', 'Sine'), opt('cosine', '코사인', 'Cosine'), opt('square', '구형파', 'Square'), opt('triangle', '삼각파', 'Triangle'), opt('sawtooth', '톱니파', 'Sawtooth'), opt('chirp', '처프(주파수 스윕)', 'Chirp (sweep)'), opt('pulse', '펄스', 'Pulse'), opt('step', '계단', 'Step'), opt('impulse', '임펄스', 'Impulse'), opt('noise', '가우스 잡음', 'Gaussian noise'), opt('dc', '직류(상수)', 'DC (constant)')] }),
      P('frequency', 'number', 5, '주파수', 'Frequency', { unit: 'Hz', step: 1 }),
      P('frequency2', 'number', 50, '끝 주파수(처프)', 'End frequency (chirp)', { unit: 'Hz', show: (p) => p.waveform === 'chirp' }),
      P('amplitude', 'number', 1, '진폭', 'Amplitude', { step: 0.1 }),
      P('offset', 'number', 0, '오프셋', 'Offset', { step: 0.1 }),
      P('phase', 'number', 0, '위상', 'Phase', { unit: '°', step: 15 }),
      P('duty', 'number', 0.5, '듀티비', 'Duty cycle', { min: 0, max: 1, step: 0.05, show: (p) => ['square', 'pulse'].includes(p.waveform) }),
      P('delay', 'number', 0, '지연', 'Delay', { unit: 's', step: 0.1 }),
      P('fs', 'number', 1000, '샘플링 주파수', 'Sample rate', { unit: 'Hz', min: 1e-6, step: 100 }),
      P('duration', 'number', 1, '길이', 'Duration', { unit: 's', min: 1e-9, step: 0.5 }),
      P('components', 'text', '', '추가 성분', 'Extra components', { placeholder: '120:0.5, 300:0.2', help: ['주파수:진폭 목록 (정현파로 더함)', 'frequency:amplitude list (added as sines)'] }),
      P('noise', 'number', 0, '잡음 표준편차', 'Noise (std dev)', { min: 0, step: 0.05 }),
      P('seed', 'int', 1, '난수 시드', 'Random seed', { min: 0 }),
      P('column', 'text', 'y', '열 이름', 'Column name'),
      P('unit', 'text', '', '단위', 'Unit'),
    ],
  },
  {
    type: 'source.table', cat: 'source', icon: '▦', ko: '데이터 표 (CSV)', en: 'Data table (CSV)',
    help: ['CSV/TSV 데이터를 붙여넣거나 파일에서 가져옵니다. 첫 줄이 숫자가 아니면 머리글, "t (s)" 처럼 괄호 안은 단위입니다.', 'Paste or import CSV/TSV data. A first row with text is the header; "t (s)" puts the unit in brackets.'],
    inputs: [],
    params: [
      P('data', 'csv', 't,y\n0,0\n1,1\n2,4\n3,9\n', '데이터', 'Data', { rows: 10 }),
      P('x', 'column', '', 'x 축 열', 'x-axis column', { help: ['비우면 증가하는 첫 열', 'Empty = the first increasing column'], own: true }),
      P('tableName', 'text', 'data', '표 이름', 'Table name'),
    ],
  },
  {
    type: 'source.file', cat: 'source', icon: '📎', ko: '파일 데이터 (Excel·WAV·STL·MAT·PNG)', en: 'File data (Excel, WAV, STL, MAT, PNG)',
    help: ['파일을 파이프라인 안에 담아 읽습니다(웹·데스크톱). Excel(.xlsx, 시트 선택), WAV 소리(채널별 열, 표본율), STL 메시(삼각형 표 → CAD 노드), MATLAB .mat(v5, 압축 포함: 스칼라는 결과 값, 벡터는 열, 행렬은 표와 격자), PNG 그림(밝기·RGB 격자), CSV·TSV·JSON.', 'Keeps a file inside the pipeline and reads it (web and desktop): Excel (.xlsx, choose the sheet), WAV sound (a column per channel, the sample rate), STL meshes (a triangle table for the CAD node), MATLAB .mat (v5, compressed too: scalars become values, vectors columns, matrices tables and grids), PNG images (brightness and RGB grids), CSV, TSV and JSON.'],
    inputs: [],
    params: [
      P('content', 'blob', '', '파일', 'File'),
      P('sheet', 'text', '', 'Excel 시트 (비우면 첫 시트)', 'Excel sheet (empty = the first)'),
      P('x', 'text', '', 'x 축 열', 'x-axis column'),
    ],
  },
  {
    type: 'source.random', cat: 'source', icon: '⁂', ko: '난수 표본', en: 'Random samples',
    help: ['분포에서 난수 표본을 뽑습니다. 열을 여러 개 만들 수 있습니다.', 'Draws random samples from a distribution, in one or more columns.'],
    inputs: [],
    params: [
      P('distribution', 'select', 'normal', '분포', 'Distribution', { options: [opt('normal', '정규 (평균, 표준편차)', 'Normal (mean, std)'), opt('uniform', '균등 (하한, 상한)', 'Uniform (low, high)'), opt('triangular', '삼각 (하한, 최빈, 상한)', 'Triangular (low, mode, high)'), opt('lognormal', '로그정규 (μ, σ)', 'Log-normal (μ, σ)'), opt('exponential', '지수 (비율)', 'Exponential (rate)'), opt('weibull', '와이블 (형상, 척도)', 'Weibull (shape, scale)'), opt('gamma', '감마 (형상, 척도)', 'Gamma (shape, scale)'), opt('beta', '베타 (α, β)', 'Beta (α, β)'), opt('poisson', '포아송 (λ)', 'Poisson (λ)'), opt('bernoulli', '베르누이 (p)', 'Bernoulli (p)')] }),
      P('p1', 'number', 0, '매개변수 1', 'Parameter 1', { step: 0.1 }),
      P('p2', 'number', 1, '매개변수 2', 'Parameter 2', { step: 0.1 }),
      P('p3', 'number', 1, '매개변수 3', 'Parameter 3', { step: 0.1, show: (p) => ['triangular', 'tri'].includes(p.distribution) }),
      P('count', 'int', 1000, '표본 수', 'Samples', { min: 1, step: 100 }),
      P('columns', 'int', 1, '열 수', 'Columns', { min: 1, max: 64 }),
      P('prefix', 'text', 'x', '열 이름', 'Column name'),
      P('seed', 'int', 1, '난수 시드', 'Random seed', { min: 0 }),
    ],
  },
  {
    type: 'source.function', cat: 'source', icon: 'ƒ', ko: '함수 표본', en: 'Function samples',
    help: ['y = f(x) 를 구간에서 표본화합니다. 줄마다 "이름 = 식" 으로 여러 열을 만듭니다. 앞에서 만든 열을 뒤에서 쓸 수 있습니다.', 'Samples y = f(x) on an interval. One "name = expression" per line makes several columns; later lines may use earlier ones.'],
    inputs: [],
    params: [
      P('expression', 'code', 'y = sin(x)', '식', 'Expressions', { rows: 4 }),
      P('variable', 'text', 'x', '변수', 'Variable'),
      P('from', 'number', 0, '시작', 'From', { step: 1 }),
      P('to', 'number', 10, '끝', 'To', { step: 1 }),
      P('points', 'int', 201, '점 수', 'Points', { min: 2, step: 50 }),
      P('constants', 'text', '', '상수', 'Constants', { placeholder: 'a = 2, b = 0.5' }),
      P('xUnit', 'text', '', 'x 단위', 'x unit'),
    ],
  },
  // ───────────────────────── data
  {
    type: 'data.expression', cat: 'data', icon: '𝑓', ko: '계산 열', en: 'Computed columns',
    help: ['"이름 = 식" 으로 새 열을 만들거나 바꿉니다. 열 이름, i(행 번호), n(행 수), 열_mean/_std/_min/_max 를 쓸 수 있습니다.', '"name = expression" adds or replaces a column. Use column names, i (row), n (rows) and column_mean/_std/_min/_max.'],
    inputs: IN,
    params: [P('expressions', 'code', 'z = y * 2', '식', 'Expressions', { rows: 5 }), P('constants', 'text', '', '상수', 'Constants', { placeholder: 'k = 9.81' }), TABLE],
  },
  {
    type: 'data.filter', cat: 'data', icon: '⏚', ko: '행 거르기', en: 'Filter rows',
    help: ['조건이 참인 행만 남깁니다. 예: y > 0 && t < 5', 'Keeps the rows where the condition holds, e.g. y > 0 && t < 5'],
    inputs: IN,
    params: [P('condition', 'code', 'y > 0', '조건', 'Condition', { rows: 2 }), P('constants', 'text', '', '상수', 'Constants'), TABLE],
  },
  {
    type: 'data.select', cat: 'data', icon: '☷', ko: '열 선택·정렬', en: 'Select & sort',
    help: ['열을 고르고, 열 하나로 정렬하고, 행 범위를 자릅니다.', 'Picks columns, sorts by one and keeps a range of rows.'],
    inputs: IN,
    params: [P('columns', 'columns', '', '열', 'Columns', { help: ['비우면 모두', 'Empty = all'] }), P('sortBy', 'column', '', '정렬 기준', 'Sort by'), P('descending', 'bool', false, '내림차순', 'Descending'), P('skip', 'int', 0, '건너뛸 행', 'Skip rows', { min: 0 }), P('limit', 'int', 0, '최대 행 (0 = 모두)', 'Max rows (0 = all)', { min: 0 }), P('x', 'column', '', 'x 축 열', 'x-axis column'), TABLE],
  },
  {
    type: 'data.merge', cat: 'data', icon: '⧉', ko: '표 합치기', en: 'Merge tables',
    help: ['두 표를 옆으로(열), 아래로(행) 붙이거나 b 를 a 의 x 축에 보간해 붙입니다.', 'Joins two tables side by side (columns), one after the other (rows), or b interpolated onto a\'s x axis.'],
    inputs: [{ port: 'a', ko: 'a', en: 'a' }, { port: 'b', ko: 'b', en: 'b' }],
    params: [P('mode', 'select', 'columns', '방식', 'Mode', { options: [opt('columns', '열 붙이기', 'Columns'), opt('rows', '행 붙이기', 'Rows'), opt('interpolate', 'x 축 보간', 'Interpolate on x')] })],
  },
  {
    type: 'data.resample', cat: 'data', icon: '⋯', ko: '재표본화', en: 'Resample',
    help: ['x 축을 고른 간격으로 다시 나누고 값을 보간합니다.', 'Re-grids the x axis evenly and interpolates the values.'],
    inputs: IN,
    params: [P('points', 'int', 200, '점 수', 'Points', { min: 2 }), P('rate', 'number', 0, '샘플링 주파수 (0 = 점 수 사용)', 'Sample rate (0 = use points)', { min: 0 }), P('method', 'select', 'linear', '보간', 'Interpolation', { options: [opt('linear', '선형', 'Linear'), opt('cubic', '3차 (Catmull–Rom)', 'Cubic (Catmull–Rom)')] }), P('x', 'column', '', 'x 열', 'x column'), TABLE],
  },
  {
    type: 'data.calculus', cat: 'data', icon: '∂', ko: '미분·적분', en: 'Derivative & integral',
    help: ['x 에 대한 미분(중앙 차분) 또는 누적 적분(사다리꼴)을 열로 더합니다.', 'Adds the derivative (central differences) or the running integral (trapezoid) against x.'],
    inputs: IN,
    params: [P('operation', 'select', 'derivative', '연산', 'Operation', { options: [opt('derivative', '미분', 'Derivative'), opt('integral', '적분', 'Integral')] }), P('columns', 'columns', '', '열', 'Columns'), P('x', 'column', '', 'x 열', 'x column'), TABLE],
  },
  // ───────────────────────── signal
  {
    type: 'signal.fft', cat: 'signal', icon: '▥', ko: '스펙트럼 (FFT)', en: 'Spectrum (FFT)',
    help: ['한쪽 진폭 스펙트럼, dB, 위상을 계산합니다. 주 주파수, THD, RMS 를 결과로 냅니다.', 'Single-sided amplitude spectrum, dB and phase, with the dominant frequency, THD and RMS.'],
    inputs: IN,
    params: [P('column', 'column', '', '신호 열', 'Signal column'), P('window', 'select', 'hann', '창 함수', 'Window', { options: WINDOWS }), P('removeMean', 'bool', true, '평균 제거', 'Remove mean'), P('zeroPad', 'bool', false, '0 채우기 (해상도 ↑)', 'Zero padding (finer)'), P('fs', 'number', 0, '샘플링 주파수 (0 = x 열에서)', 'Sample rate (0 = from x)', { unit: 'Hz', min: 0 }), P('x', 'column', '', 'x(시간) 열', 'x (time) column'), TABLE],
  },
  {
    type: 'signal.psd', cat: 'signal', icon: '▤', ko: '전력 스펙트럼 밀도', en: 'Power spectral density',
    help: ['Welch 방법(구간 평균)으로 PSD 를 구합니다.', 'PSD by Welch\'s method (averaged segments).'],
    inputs: IN,
    params: [P('column', 'column', '', '신호 열', 'Signal column'), P('segment', 'int', 256, '구간 길이', 'Segment length', { min: 8, step: 64 }), P('overlap', 'number', 50, '겹침', 'Overlap', { unit: '%', min: 0, max: 95, step: 5 }), P('window', 'select', 'hann', '창 함수', 'Window', { options: WINDOWS }), P('fs', 'number', 0, '샘플링 주파수 (0 = x 열에서)', 'Sample rate (0 = from x)', { unit: 'Hz', min: 0 }), TABLE],
  },
  {
    type: 'signal.filter', cat: 'signal', icon: '⫶', ko: '필터', en: 'Filter',
    help: ['버터워스 IIR(영위상 가능), 창 FIR, 이동 평균, 중앙값, 지수 평활 필터. 주파수 응답 표도 냅니다.', 'Butterworth IIR (optionally zero-phase), windowed FIR, moving average, median and exponential smoothing; also the frequency response.'],
    inputs: IN,
    params: [
      P('design', 'select', 'butterworth', '설계', 'Design', { options: [opt('butterworth', '버터워스 IIR', 'Butterworth IIR'), opt('fir', 'FIR (창 sinc)', 'FIR (windowed sinc)'), opt('movingAverage', '이동 평균', 'Moving average'), opt('median', '중앙값', 'Median'), opt('exponential', '지수 평활', 'Exponential smoothing')] }),
      P('type', 'select', 'lowpass', '종류', 'Type', { options: [opt('lowpass', '저역 통과', 'Low pass'), opt('highpass', '고역 통과', 'High pass'), opt('bandpass', '대역 통과', 'Band pass'), opt('bandstop', '대역 저지', 'Band stop')], show: (p) => ['butterworth', 'fir'].includes(p.design ?? 'butterworth') }),
      P('cutoff', 'number', 10, '차단 주파수', 'Cut-off', { unit: 'Hz', min: 0, show: (p) => !['movingAverage', 'median'].includes(p.design) }),
      P('cutoff2', 'number', 50, '위 차단 주파수', 'Upper cut-off', { unit: 'Hz', min: 0, show: (p) => ['bandpass', 'bandstop'].includes(p.type) && ['butterworth', 'fir', undefined].includes(p.design) }),
      P('order', 'int', 4, '차수', 'Order', { min: 1, max: 12, show: (p) => (p.design ?? 'butterworth') === 'butterworth' }),
      P('taps', 'int', 101, '탭 수', 'Taps', { min: 3, max: 4001, step: 10, show: (p) => p.design === 'fir' }),
      P('width', 'int', 9, '창 폭 (표본)', 'Window (samples)', { min: 1, show: (p) => ['movingAverage', 'median'].includes(p.design) }),
      P('zeroPhase', 'bool', true, '영위상 (앞뒤로)', 'Zero phase (forward-backward)', { show: (p) => (p.design ?? 'butterworth') === 'butterworth' }),
      P('column', 'column', '', '신호 열', 'Signal column'),
      P('fs', 'number', 0, '샘플링 주파수 (0 = x 열에서)', 'Sample rate (0 = from x)', { unit: 'Hz', min: 0 }),
      TABLE,
    ],
  },
  {
    type: 'signal.spectrogram', cat: 'signal', icon: '▨', ko: '스펙트로그램', en: 'Spectrogram',
    help: ['단시간 푸리에 변환(STFT)으로 시간-주파수 지도를 만듭니다.', 'A time–frequency map by the short-time Fourier transform.'],
    inputs: IN,
    params: [P('column', 'column', '', '신호 열', 'Signal column'), P('segment', 'int', 256, '구간 길이', 'Segment length', { min: 8, step: 64 }), P('overlap', 'number', 75, '겹침', 'Overlap', { unit: '%', min: 0, max: 95 }), P('window', 'select', 'hann', '창 함수', 'Window', { options: WINDOWS }), P('fs', 'number', 0, '샘플링 주파수', 'Sample rate', { unit: 'Hz', min: 0 }), TABLE],
  },
  {
    type: 'signal.peaks', cat: 'signal', icon: '⋀', ko: '피크 찾기', en: 'Find peaks',
    help: ['봉우리(또는 골)를 높이·돌출도·간격 조건으로 찾습니다. 감쇠 진동이면 대수 감쇠율로 감쇠비를 냅니다.', 'Finds peaks (or valleys) by height, prominence and spacing; for a decaying oscillation also the damping ratio from the log decrement.'],
    inputs: IN,
    params: [P('column', 'column', '', '신호 열', 'Signal column'), P('minHeight', 'number', '', '최소 높이', 'Min height'), P('minProminence', 'number', 0, '최소 돌출도', 'Min prominence', { min: 0 }), P('minDistance', 'number', 0, '최소 간격 (x 단위)', 'Min spacing (x units)', { min: 0 }), P('maxCount', 'int', 50, '최대 개수', 'Max count', { min: 1 }), P('valleys', 'bool', false, '골 찾기', 'Find valleys'), TABLE],
  },
  {
    type: 'signal.correlate', cat: 'signal', icon: '⋈', ko: '상관 (교차·자기)', en: 'Correlation (cross/auto)',
    help: ['a 와 b 의 정규화 교차상관 (b 가 없으면 자기상관). 최대 상관의 지연을 냅니다.', 'Normalised cross-correlation of a and b (auto-correlation without b) and the lag of the best match.'],
    inputs: [{ port: 'a', ko: 'a', en: 'a' }, { port: 'b', ko: 'b (선택)', en: 'b (optional)', optional: true }],
    params: [P('column', 'column', '', 'a 열', 'a column', { port: 'a' }), P('columnB', 'column', '', 'b 열', 'b column', { port: 'b' }), P('maxLag', 'int', 0, '최대 지연 (표본, 0 = 전체)', 'Max lag (samples, 0 = all)', { min: 0 })],
  },
  {
    type: 'signal.envelope', cat: 'signal', icon: '⌒', ko: '포락선 (힐베르트)', en: 'Envelope (Hilbert)',
    help: ['힐베르트 변환으로 포락선과 순간 주파수를 구합니다 (진동 진단, AM 복조).', 'Envelope and instantaneous frequency by the Hilbert transform (vibration diagnostics, AM demodulation).'],
    inputs: IN,
    params: [P('column', 'column', '', '신호 열', 'Signal column'), P('fs', 'number', 0, '샘플링 주파수', 'Sample rate', { unit: 'Hz', min: 0 }), TABLE],
  },
  // ───────────────────────── dynamics and control
  {
    type: 'dyn.ode', cat: 'dynamics', icon: '⟳', ko: '미분방정식 (ODE)', en: 'Differential equations (ODE)',
    help: ['"x\' = 식" 으로 상태 방정식을 씁니다. \' 가 없는 줄은 보조 값(출력 열)입니다. 입력 u 를 연결하면 식에서 u 로 씁니다.', 'Write the state equations as "x\' = expression". Lines without \' are helper values (also output). Connect u to use an input signal as u.'],
    inputs: [{ port: 'u', ko: '입력 u (선택)', en: 'Input u (optional)', optional: true }],
    presets: [
      { id: 'msd', ko: '질량-스프링-댐퍼', en: 'Mass–spring–damper', params: { equations: "x' = v\nv' = (F*sin(w*t) - c*v - k*x)/m\nE = 0.5*m*v^2 + 0.5*k*x^2", constants: 'm = 1, c = 0.4, k = 4, F = 0, w = 2', initial: 'x = 1, v = 0', tEnd: 20, dt: 0.01 } },
      { id: 'pendulum', ko: '진자 (비선형)', en: 'Pendulum (nonlinear)', params: { equations: "th' = om\nom' = -g/L*sin(th) - b*om\nx = L*sin(th)\ny = -L*cos(th)", constants: 'g = 9.81, L = 1, b = 0.1', initial: 'th = 2.5, om = 0', tEnd: 20, dt: 0.01 } },
      { id: 'vdp', ko: '반데르폴 진동자', en: 'Van der Pol oscillator', params: { equations: "x' = y\ny' = mu*(1 - x^2)*y - x", constants: 'mu = 2', initial: 'x = 0.5, y = 0', tEnd: 40, dt: 0.01 } },
      { id: 'lorenz', ko: '로렌츠 끌개', en: 'Lorenz attractor', params: { equations: "x' = s*(y - x)\ny' = x*(r - z) - y\nz' = x*y - b*z", constants: 's = 10, r = 28, b = 8/3', initial: 'x = 1, y = 1, z = 1', tEnd: 40, dt: 0.005 } },
      { id: 'lotka', ko: '포식자-피식자', en: 'Predator–prey', params: { equations: "prey' = a*prey - b*prey*pred\npred' = d*prey*pred - c*pred", constants: 'a = 1.1, b = 0.4, c = 0.4, d = 0.1', initial: 'prey = 10, pred = 10', tEnd: 60, dt: 0.02 } },
      { id: 'sir', ko: '감염병 SIR', en: 'Epidemic SIR', params: { equations: "S' = -beta*S*I/N\nI' = beta*S*I/N - gamma*I\nR' = gamma*I", constants: 'beta = 0.3, gamma = 0.1, N = 1000', initial: 'S = 999, I = 1, R = 0', tEnd: 160, dt: 0.5 } },
      { id: 'duffing', ko: '더핑 진동자 (혼돈)', en: 'Duffing oscillator (chaos)', params: { equations: "x' = v\nv' = -d*v - a*x - b*x^3 + g*cos(w*t)", constants: 'd = 0.3, a = -1, b = 1, g = 0.5, w = 1.2', initial: 'x = 1, v = 0', tEnd: 200, dt: 0.02 } },
      { id: 'rlc', ko: 'RLC 회로 (입력 u)', en: 'RLC circuit (input u)', params: { equations: "q' = i\ni' = (u - R*i - q/C)/L\nvC = q/C", constants: 'R = 2, L = 0.5, C = 0.05', initial: 'q = 0, i = 0', tEnd: 5, dt: 0.001 } },
      { id: 'tank', ko: '물탱크 수위', en: 'Tank level', params: { equations: "h' = (qin - k*sqrt(max(h, 0)))/A\nqout = k*sqrt(max(h, 0))", constants: 'A = 2, k = 0.5, qin = 0.4', initial: 'h = 0', tEnd: 60, dt: 0.1 } },
      { id: 'projectile', ko: '공기 저항 포물선', en: 'Projectile with drag', params: { equations: "x' = vx\ny' = vy\nvx' = -k*vx*sqrt(vx^2 + vy^2)\nvy' = -g - k*vy*sqrt(vx^2 + vy^2)", constants: 'g = 9.81, k = 0.02', initial: 'x = 0, y = 0, vx = 30, vy = 30', tEnd: 5, dt: 0.01 } },
    ],
    params: [
      P('equations', 'code', "x' = v\nv' = -k/m*x - c/m*v", '방정식', 'Equations', { rows: 6 }),
      P('constants', 'text', 'm = 1, c = 0.4, k = 4', '상수', 'Constants'),
      P('initial', 'text', 'x = 1, v = 0', '초기값', 'Initial values'),
      P('tStart', 'number', 0, '시작 시간', 'Start time', { unit: 's' }),
      P('tEnd', 'number', 20, '끝 시간', 'End time', { unit: 's', min: 0 }),
      P('dt', 'number', 0.01, '출력 간격', 'Output step', { unit: 's', min: 1e-9 }),
      P('method', 'select', 'rk45', '적분법', 'Method', { options: METHODS }),
      P('tolerance', 'number', 1e-6, '허용 오차 (RK45)', 'Tolerance (RK45)', { min: 1e-14, show: (p) => (p.method ?? 'rk45') === 'rk45' }),
      P('substeps', 'int', 10, '내부 단계 (고정 간격)', 'Sub-steps (fixed step)', { min: 1, show: (p) => ['rk4', 'euler'].includes(p.method) }),
      P('uColumn', 'column', '', '입력 u 열', 'Input u column', { port: 'u' }),
    ],
  },
  {
    type: 'ctrl.step', cat: 'dynamics', icon: '⎍', ko: '전달함수 응답', en: 'Transfer function response',
    help: ['G(s) = num/den 의 계단·임펄스·램프 응답과 극점·영점. 상승 시간·오버슈트·정착 시간을 냅니다. 계수는 높은 차수부터.', 'Step, impulse or ramp response of G(s) = num/den with poles and zeros; rise time, overshoot and settling time. Coefficients from the highest power.'],
    inputs: [],
    presets: TF_PRESETS(),
    params: [P('num', 'text', '1', '분자 계수', 'Numerator', { placeholder: '1' }), P('den', 'text', '1, 0.6, 1', '분모 계수', 'Denominator', { placeholder: '1, 0.6, 1' }), P('input', 'select', 'step', '입력', 'Input', { options: [opt('step', '계단', 'Step'), opt('impulse', '임펄스', 'Impulse'), opt('ramp', '램프', 'Ramp')] }), P('amplitude', 'number', 1, '입력 크기', 'Input size'), P('tEnd', 'number', 20, '끝 시간', 'End time', { unit: 's' }), P('dt', 'number', 0.01, '간격', 'Step', { unit: 's' })],
  },
  {
    type: 'ctrl.bode', cat: 'dynamics', icon: '⌇', ko: '보드·나이퀴스트', en: 'Bode & Nyquist',
    help: ['개루프 G(s) 의 크기·위상, 나이퀴스트 곡선, 이득·위상 여유, 폐루프 극점, 지글러-니콜스 PID 제안값.', 'Magnitude and phase of the open loop G(s), the Nyquist curve, gain and phase margins, closed-loop poles and Ziegler–Nichols PID values.'],
    inputs: [],
    presets: TF_PRESETS(),
    params: [P('num', 'text', '1', '분자 계수', 'Numerator'), P('den', 'text', '1, 3, 3, 1', '분모 계수', 'Denominator'), P('gain', 'number', 1, '루프 이득 K', 'Loop gain K'), P('delay', 'number', 0, '시간 지연', 'Time delay', { unit: 's', min: 0 }), P('from', 'number', 0.01, '시작 주파수', 'From', { min: 1e-9 }), P('to', 'number', 100, '끝 주파수', 'To', { min: 1e-9 }), P('units', 'select', 'rad/s', '단위', 'Units', { options: [opt('rad/s', 'rad/s'), opt('Hz', 'Hz')] }), P('points', 'int', 500, '점 수', 'Points', { min: 10 })],
  },
  {
    type: 'ctrl.pid', cat: 'dynamics', icon: '⊛', ko: 'PID 제어 루프', en: 'PID control loop',
    help: ['디지털 PID 가 플랜트 num/den 을 제어하는 폐루프를 시뮬레이션합니다. 포화·적분 와인드업 방지·외란·측정 잡음 포함. 기준 r 을 연결할 수 있습니다.', 'Simulates a digital PID controlling the plant num/den: saturation, anti-windup, disturbance and measurement noise. A reference r can be connected.'],
    inputs: [{ port: 'r', ko: '기준 r (선택)', en: 'Reference r (optional)', optional: true }],
    presets: TF_PRESETS(),
    params: [
      P('num', 'text', '1', '플랜트 분자', 'Plant numerator'), P('den', 'text', '1, 2, 1', '플랜트 분모', 'Plant denominator'),
      P('kp', 'number', 2, 'Kp', 'Kp', { step: 0.1 }), P('ki', 'number', 1, 'Ki', 'Ki', { step: 0.1 }), P('kd', 'number', 0.5, 'Kd', 'Kd', { step: 0.1 }),
      P('tf', 'number', 0.05, '미분 필터 시정수', 'Derivative filter', { unit: 's', min: 0 }),
      P('derivativeOnMeasurement', 'bool', true, '미분을 측정값에 (킥 방지)', 'Derivative on measurement (no kick)'),
      P('setpoint', 'number', 1, '목표값', 'Setpoint'), P('stepTime', 'number', 0, '목표 변경 시각', 'Setpoint time', { unit: 's' }),
      P('disturbance', 'number', 0, '입력 외란', 'Input disturbance'), P('disturbanceTime', 'number', 10, '외란 시각', 'Disturbance time', { unit: 's' }),
      P('noise', 'number', 0, '측정 잡음 (표준편차)', 'Measurement noise (std)', { min: 0 }),
      P('uMin', 'number', '', '출력 하한', 'Output min'), P('uMax', 'number', '', '출력 상한', 'Output max'),
      P('tEnd', 'number', 20, '끝 시간', 'End time', { unit: 's' }), P('dt', 'number', 0.01, '제어 주기', 'Sample time', { unit: 's', min: 1e-6 }),
      P('rColumn', 'column', '', '기준 r 열', 'Reference r column', { port: 'r' }),
      P('seed', 'int', 1, '난수 시드', 'Random seed', { min: 0, show: (p) => Number(p.noise) > 0 }),
    ],
  },
  {
    type: 'ctrl.statespace', cat: 'dynamics', icon: '⊞', ko: '상태공간 모델', en: 'State-space model',
    help: ['x\' = Ax + Bu, y = Cx + Du. 행렬은 행을 ; 또는 줄바꿈, 원소를 공백·쉼표로. 고유값, 안정성, 가제어·가관측 계수를 냅니다.', 'x\' = Ax + Bu, y = Cx + Du. Matrices: rows by ; or new lines, entries by spaces or commas. Eigenvalues, stability, controllability and observability ranks.'],
    inputs: [{ port: 'u', ko: '입력 u (선택)', en: 'Input u (optional)', optional: true }],
    presets: [
      { id: 'second', ko: '2차 시스템', en: 'Second-order system', params: { A: '0 1; -2 -3', B: '0; 1', C: '1 0', D: '' } },
      { id: 'motor', ko: 'DC 모터 (전류·속도)', en: 'DC motor (current, speed)', params: { A: '-100 -5; 50 -1', B: '100; 0', C: '0 1', D: '', tEnd: 2, dt: 0.001 } },
      { id: 'quarterCar', ko: '1/4 차량 현가', en: 'Quarter-car suspension', params: { A: '0 1 0 0; -20 -2 20 2; 0 0 0 1; 200 20 -2200 -20', B: '0; 0; 0; 2000', C: '1 0 0 0', D: '', tEnd: 5, dt: 0.002 } },
    ],
    params: [P('A', 'code', '0 1; -2 -3', 'A', 'A', { rows: 3 }), P('B', 'code', '0; 1', 'B', 'B', { rows: 2 }), P('C', 'code', '1 0', 'C', 'C', { rows: 2 }), P('D', 'text', '', 'D (비우면 0)', 'D (empty = 0)'), P('x0', 'text', '', '초기 상태', 'Initial state', { placeholder: '0, 0' }), P('input', 'select', 'step', '입력', 'Input', { options: [opt('step', '계단', 'Step'), opt('impulse', '임펄스', 'Impulse'), opt('sine', '정현파', 'Sine'), opt('zero', '없음 (자유 응답)', 'None (free response)')] }), P('amplitude', 'number', 1, '입력 크기', 'Input size'), P('frequency', 'number', 1, '정현파 주파수', 'Sine frequency', { unit: 'Hz', show: (p) => p.input === 'sine' }), P('channel', 'int', 1, '입력 채널', 'Input channel', { min: 1 }), P('tEnd', 'number', 10, '끝 시간', 'End time', { unit: 's' }), P('dt', 'number', 0.01, '출력 간격', 'Output step', { unit: 's' }), P('method', 'select', 'rk45', '적분법', 'Method', { options: METHODS }), P('uColumn', 'column', '', '입력 u 열', 'Input u column', { port: 'u' })],
  },
  {
    type: 'dyn.blocks', cat: 'dynamics', icon: '⧈', ko: '블록 다이어그램 (Simulink 형)', en: 'Block diagram (Simulink-style)',
    help: ['신호마다 한 줄: "이름 = 식"(이득·합·곱) 또는 "이름 = 블록(입력, 설정 = 값)". 피드백 루프를 그대로 쓰고 매 시간 단계에 함께 풉니다. 블록: integrator, tf, pid, delay, unitdelay, zoh, derivative, ratelimit, relay, saturation, deadzone, lookup, step, sine, square, pulse, ramp, noise, input. 적분기·전달함수·지연이 없는 루프(대수 루프)는 알려 줍니다.', 'One line per signal: "name = expression" (gains, sums, products) or "name = block(input, setting = value)". Feedback loops are written as they are and solved together at every time step. Blocks: integrator, tf, pid, delay, unitdelay, zoh, derivative, ratelimit, relay, saturation, deadzone, lookup, step, sine, square, pulse, ramp, noise, input. A loop without an integrator, transfer function or delay (an algebraic loop) is reported.'],
    inputs: [{ port: 'u', ko: '입력 표 (선택)', en: 'Input table (optional)', optional: true }],
    presets: [
      { id: 'pidLoop', ko: 'PID 폐루프 (포화)', en: 'PID loop with saturation', params: { diagram: 'r = step(t0 = 1)\ne = r - y\nu = pid(e, kp = 4, ki = 2, kd = 0.8, umin = -3, umax = 3)\ny = tf(u, num = [1], den = [1, 3, 3, 1])', tEnd: 20, dt: 0.01, measure: 'y' } },
      { id: 'cruise', ko: '자동차 정속 주행', en: 'Cruise control', params: { diagram: 'v_ref = step(t0 = 2, a = 25, before = 20)\nhill = step(t0 = 30, a = -400)\nforce = pid(v_ref - v, kp = 800, ki = 40, umin = -2000, umax = 3000)\nacc = (force + hill - 0.5*1.2*0.32*2.2*v^2 - 150) / m\nv = integrator(acc, x0 = 20)', constants: 'm = 1200', tEnd: 60, dt: 0.02, measure: '' } },
      { id: 'thermostat', ko: '온도 조절기 (릴레이)', en: 'Thermostat (relay)', params: { diagram: 'setp = 21\nheater = relay(setp - T, on = 0.5, off = -0.5, high = 2000, low = 0)\nT = integrator((heater - k*(T - T_out)) / C, x0 = 15)', constants: 'C = 2e5, k = 60, T_out = 5', tEnd: 7200, dt: 5, substeps: 5, measure: '' } },
      { id: 'motor', ko: 'DC 모터 속도 루프 (기울기 제한)', en: 'DC motor speed loop (rate limit)', params: { diagram: 'cmd = step(t0 = 0.2, a = 100)\nref = ratelimit(cmd, rise = 200)\nvolt = pid(ref - w, kp = 0.5, ki = 5, umin = -24, umax = 24)\ni = integrator((volt - R*i - K*w)/L)\nw = integrator((K*i - b*w - load)/J)\nload = step(t0 = 1.2, a = 0.05)', constants: 'R = 1, L = 0.5e-3, K = 0.05, J = 1e-4, b = 1e-5', tEnd: 2, dt: 0.0005, substeps: 4, measure: '' } },
      { id: 'digital', ko: '디지털 제어기 (샘플·홀드)', en: 'Digital controller (sample and hold)', params: { diagram: 'r = step(t0 = 0.5)\nym = zoh(y, ts = 0.1)\ne = r - ym\nacc = unitdelay(acc + 0.1*e, ts = 0.1)\nu = zoh(1.2*e + 0.8*acc, ts = 0.1)\ny = tf(u, num = [1], den = [1, 1])', tEnd: 10, dt: 0.01, measure: '' } },
      { id: 'deadtime', ko: '시간 지연 공정', en: 'Process with dead time', params: { diagram: 'r = step(t0 = 1)\nu = pid(r - y, kp = 0.6, ki = 0.25)\nyd = delay(u, t = 2)\ny = tf(yd, num = [1], den = [5, 1])', tEnd: 60, dt: 0.05, measure: 'y' } },
    ],
    params: [
      P('diagram', 'code', 'r = step(t0 = 1)\ne = r - y\nu = pid(e, kp = 4, ki = 2, kd = 0.8)\ny = tf(u, num = [1], den = [1, 3, 3, 1])', '다이어그램', 'Diagram', { rows: 8 }),
      P('constants', 'text', '', '상수', 'Constants', { placeholder: 'm = 1200, g = 9.81' }),
      P('tEnd', 'number', 20, '끝 시간', 'End time', { unit: 's', min: 0 }),
      P('dt', 'number', 0.01, '출력 간격', 'Output step', { unit: 's', min: 1e-9 }),
      P('substeps', 'int', 10, '내부 단계 (RK4)', 'Sub-steps (RK4)', { min: 1 }),
      P('measure', 'column', '', '응답 지표를 낼 신호', 'Signal for step metrics', { own: true }),
      P('seed', 'int', 1, '난수 시드 (noise)', 'Random seed (noise)', { min: 0 }),
    ],
  },
  // ───────────────────────── statistics and ML
  {
    type: 'circuit.spice', cat: 'physics', icon: '⚡', ko: '회로 해석 (SPICE·LTspice 형)', en: 'Circuit analysis (SPICE/LTspice-style)',
    help: ['SPICE 넷리스트를 수정 절점 해석(MNA)과 뉴턴-랩슨으로 풉니다. 소자: R, C (IC=), L, V·I (DC, AC, SIN, PULSE, PWL, INPUT(열)), D (IS, N, RS, BV), Q (BJT NPN·PNP), M (MOSFET NMOS·PMOS), B (V=식·I=식), E·G·F·H (제어 전원), S (스위치 RON ROFF VT), X (부회로). 카드: .model, .subckt/.ends, .param ({식}). LTspice·MyCircuit 에서 내보낸 넷리스트, MyCircuit 프로젝트(.mycircuit)를 그대로 엽니다. 해석: .op, .dc 전원 시작 끝 간격, .ac dec 점수 f1 f2, .tran 간격 끝 [UIC]. 접지는 0 또는 gnd, 값 접미사 f p n u m k meg g. INPUT(열) 은 입력 표의 열을 파형으로 씁니다.', 'Solves a SPICE netlist by modified nodal analysis with Newton–Raphson. Elements: R, C (IC=), L, V and I (DC, AC, SIN, PULSE, PWL, INPUT(column)), D (IS, N, RS, BV), Q (BJT NPN/PNP), M (MOSFET NMOS/PMOS), B (V=expr, I=expr), E, G, F, H (controlled sources), S (switch RON ROFF VT), X (subcircuits). Cards: .model, .subckt/.ends, .param ({expr}). Netlists exported from LTspice or MyCircuit and MyCircuit projects (.mycircuit) open as they are. Analyses: .op, .dc source from to step, .ac dec points f1 f2, .tran step stop [UIC]. Ground is 0 or gnd; values take f p n u m k meg g. INPUT(column) uses a column of the input table as the waveform.'],
    inputs: [{ port: 'in', ko: '입력 파형 (선택)', en: 'Input waveform (optional)', optional: true }],
    presets: [
      { id: 'rc', ko: 'RC 저역 통과 (과도·주파수)', en: 'RC low-pass (transient, AC)', params: { netlist: '* RC low-pass filter\nV1 in 0 PULSE(0 1 0 1n 1n 2m 4m) AC 1\nR1 in out 1k\nC1 out 0 1u\n.tran 5u 8m\n.ac dec 40 10 100k', probes: '' } },
      { id: 'rlc', ko: 'RLC 공진', en: 'RLC resonance', params: { netlist: '* Series RLC, resonance at 1.59 kHz\nV1 in 0 AC 1\nR1 in a 10\nL1 a b 10m\nC1 b 0 1u\n.ac dec 100 100 100k', probes: 'b' } },
      { id: 'rectifier', ko: '반파 정류 (다이오드·평활)', en: 'Half-wave rectifier (diode, smoothing)', params: { netlist: '* Half-wave rectifier with a smoothing capacitor\nV1 in 0 SIN(0 10 50)\nD1 in out IS=1e-14 N=1.8\nC1 out 0 100u\nR1 out 0 1k\n.tran 50u 100m', probes: 'in, out' } },
      { id: 'opamp', ko: '반전 증폭기 (연산 증폭기)', en: 'Inverting amplifier (op-amp)', params: { netlist: '* Inverting amplifier, gain -10\nVin in 0 SIN(0 0.2 1k) AC 1\nR1 in m 1k\nR2 m out 10k\nE1 out 0 0 m 1e6\n.tran 5u 3m\n.ac dec 20 10 1meg', probes: 'in, out' } },
      { id: 'lc', ko: 'LC 탱크 진동', en: 'LC tank oscillation', params: { netlist: '* LC tank released from 1 V\nL1 a 0 1m\nC1 a 0 1u IC=1\nR1 a 0 1k\n.tran 1u 2m UIC', probes: '' } },
      { id: 'divider', ko: '분압기·다이오드 특성 (.op .dc)', en: 'Divider and diode curve (.op, .dc)', params: { netlist: '* Diode I-V curve\nV1 a 0 5\nR1 a k 1k\nD1 k 0 IS=1e-14\n.op\n.dc V1 0 5 0.05', probes: '' } },
      { id: 'buck', ko: '벅 컨버터 (스위칭)', en: 'Buck converter (switching)', params: { netlist: '* Buck converter, 50 % duty at 20 kHz\nVin vin 0 12\nVg g 0 PULSE(0 5 0 100n 100n 25u 50u)\nS1 vin sw g 0 RON=0.05 ROFF=1meg VT=2.5\nD1 0 sw IS=1e-12\nL1 sw out 100u\nC1 out 0 100u\nR1 out 0 5\n.tran 1u 5m', probes: 'sw, out' } },
      { id: 'bjt', ko: 'BJT 공통 이미터 증폭기', en: 'BJT common-emitter amplifier', params: { netlist: '* Common-emitter amplifier with emitter degeneration\nVcc vcc 0 12\nVin in 0 SIN(0 10m 1k) AC 1\nC1 in b 10u\nR1 vcc b 47k\nR2 b 0 10k\nRc vcc c 3.3k\nRe e 0 470\nCe e 0 100u\nQ1 c b e Qn\n.model Qn NPN(IS=1e-14 BF=200 BR=2)\n.op\n.tran 10u 5m\n.ac dec 20 10 1meg', probes: 'in, c' } },
      { id: 'cmos', ko: 'CMOS 인버터 (DC 전달)', en: 'CMOS inverter (DC transfer)', params: { netlist: '* CMOS inverter transfer curve\nVdd vdd 0 5\nVin in 0 0\nM1 out in 0 0 Nch W=2u L=1u\nM2 out in vdd vdd Pch W=4u L=1u\n.model Nch NMOS(LEVEL=1 VTO=1 KP=100u LAMBDA=0.01)\n.model Pch PMOS(LEVEL=1 VTO=-1 KP=50u LAMBDA=0.01)\n.dc Vin 0 5 0.05', probes: 'in, out' } },
      { id: 'subckt', ko: '부회로 연산 증폭기 (B 소스)', en: 'Subcircuit op-amp (B source)', params: { netlist: 'Non-inverting amplifier, gain 11 (LTspice style)\nVp vp 0 12\nVn vn 0 -12\nVin in 0 SIN(0 0.5 1k)\nXU1 in fb out vp vn OPAMP\nR2 fb out 100k\nR3 fb 0 10k\nRl out 0 10k\n.subckt OPAMP inp inn out vp vn\nB1 out 0 V=max(min(1e5*(V(inp)-V(inn)), V(vp)), V(vn))\n.ends\n.tran 2u 3m\n.end', probes: 'in, out' } },
      { id: 'driven', ko: '입력 표로 구동 (INPUT)', en: 'Driven by the input table (INPUT)', params: { netlist: '* Connect a table with t and y columns\nV1 in 0 INPUT(y)\nR1 in out 1k\nC1 out 0 10u\n.tran 100u 1', probes: '' } },
    ],
    params: [
      P('netlist', 'code', '* RC low-pass filter\nV1 in 0 PULSE(0 1 0 1n 1n 2m 4m) AC 1\nR1 in out 1k\nC1 out 0 1u\n.tran 5u 8m\n.ac dec 40 10 100k', '넷리스트', 'Netlist', { rows: 10, language: 'spice' }),
      P('probes', 'text', '', '보일 절점 (비우면 전부)', 'Nodes shown (empty = all)', { placeholder: 'in, out' }),
      P('x', 'column', '', 'INPUT 의 시간 열', 'Time column for INPUT', { help: ['비우면 입력 표의 x 열', 'Empty = the input table\'s x column'] }),
      TABLE,
    ],
  },
  {
    type: 'circuit.logic', cat: 'physics', icon: '⏚', ko: '디지털 논리 (Proteus 형)', en: 'Digital logic (Proteus-style)',
    help: ['게이트 수준 사건 구동 디지털 시뮬레이션: 전파 지연, 플립플롭, 카운터, 시프트 레지스터, 타이밍도, 버스 값, 진리표. 줄마다 "clock clk: period = 10", "input a: 0110, step = 10" (또는 1@0, 0@25 / random / INPUT(열)), "inputs a b c: binary" (모든 조합), "y = a & ~b | c ^ d, delay = 2", "q, qn = dff(d, clk, reset)", "jkff(j, k, clk)", "tff(t, clk)", "latch(d, en)", "srlatch(s, r)", "c[4] = counter(clk, reset)", "s[8] = shift(din, clk)", "bus n = c", 마이크로컨트롤러 "mcu u1: period = 1, out = 핀…, in = 핀…" 과 펌웨어 "program u1:" … "end" (ldi mov add sub and or xor inc dec lsl lsr cp jmp jz jnz jc jnc call ret out in sbi cbi tgl sbis sbic lds sts delay halt). 연산자 ~ ! & * ^ | + 와 and() or() xor() nand() nor() xnor() mux(sel, a, b).', 'Gate-level event-driven digital simulation: propagation delays, flip-flops, counters, shift registers, timing diagram, bus values and truth table. One line each: "clock clk: period = 10", "input a: 0110, step = 10" (or 1@0, 0@25 / random / INPUT(column)), "inputs a b c: binary" (all combinations), "y = a & ~b | c ^ d, delay = 2", "q, qn = dff(d, clk, reset)", "jkff(j, k, clk)", "tff(t, clk)", "latch(d, en)", "srlatch(s, r)", "c[4] = counter(clk, reset)", "s[8] = shift(din, clk)", "bus n = c", a microcontroller "mcu u1: period = 1, out = pins…, in = pins…" with firmware "program u1:" … "end" (ldi mov add sub and or xor inc dec lsl lsr cp jmp jz jnz jc jnc call ret out in sbi cbi tgl sbis sbic lds sts delay halt). Operators ~ ! & * ^ | + and and() or() xor() nand() nor() xnor() mux(sel, a, b).'],
    inputs: [{ port: 'in', ko: '입력 신호 (선택)', en: 'Input signals (optional)', optional: true }],
    presets: [
      { id: 'adder', ko: '전가산기 진리표', en: 'Full adder truth table', params: { mode: 'truth', circuit: '# Full adder\ninputs a b cin: binary\nsum = a ^ b ^ cin\ncout = a & b | cin & (a ^ b)\nbus total = cout sum' } },
      { id: 'counter', ko: '4비트 카운터와 분주기', en: '4-bit counter and divider', params: { mode: 'timing', circuit: '# 4-bit binary counter with reset\nclock clk: period = 10\ninput reset: 1@0, 0@12\nc[4] = counter(clk, reset)\nbus count = c\ndiv2 = tff(1, clk, reset)\ncarry = c0 & c1 & c2 & c3', tEnd: 200, delay: 1 } },
      { id: 'shift', ko: '시프트 레지스터 (직렬→병렬)', en: 'Shift register (serial to parallel)', params: { mode: 'timing', circuit: '# 8-bit serial-in, parallel-out\nclock clk: period = 10, delay = 5\ninput din: 10110011, step = 10\ns[8] = shift(din, clk)\nbus value = s', tEnd: 90, delay: 0 } },
      { id: 'glitch', ko: '해저드 (글리치) 찾기', en: 'Finding a hazard (glitch)', params: { mode: 'timing', circuit: '# Static-1 hazard: y = a & b | ~a & c with b = c = 1\ninputs a: 0101, step = 20\ninput b: 1@0\ninput c: 1@0\nna = ~a, delay = 3\nt1 = a & b\nt2 = na & c\ny = t1 | t2', tEnd: 80, delay: 1, glitch: 4 } },
      { id: 'traffic', ko: '신호등 상태 기계', en: 'Traffic-light state machine', params: { mode: 'timing', circuit: '# Two-bit state machine: green → yellow → red → green\nclock clk: period = 10\ninput reset: 1@0, 0@5\ns[2] = counter(clk, reset), modulo = 3\ngreen = ~s1 & ~s0\nyellow = ~s1 & s0\nred = s1 & ~s0\nbus state = s', tEnd: 120, delay: 0 } },
      { id: 'mcuBlink', ko: 'MCU: LED 깜빡이', en: 'MCU: LED blinker', params: { mode: 'timing', circuit: '# Firmware toggles an LED every 10 cycles (one instruction per time unit)\nmcu u1: period = 1, out = led\nprogram u1:\nloop: tgl 0      ; LED on/off\n  delay 10\n  jmp loop\nend', tEnd: 200, delay: 0 } },
      { id: 'mcuButton', ko: 'MCU: 버튼과 카운터', en: 'MCU: a button and a counter', params: { mode: 'timing', circuit: '# Counts on four pins; a button (polled) lights a lamp\ninput btn: 0@0, 1@60, 0@140\nmcu u1: period = 1, out = q0 q1 q2 q3 lamp, in = btn\nbus count = q3 q2 q1 q0\nprogram u1:\n  ldi r1, 0\nloop: inc r1\n  mov r2, r1\n  and r2, 15\n  sbis 0        ; skip when the button is up\n  jmp show\n  or r2, 16     ; lamp bit\nshow: out r2\n  delay 4\n  jmp loop\nend', tEnd: 200, delay: 0 } },
      { id: 'mcuTraffic', ko: 'MCU: 보행자 버튼 신호등', en: 'MCU: traffic light with a crossing button', params: { mode: 'timing', circuit: '# Green until the crossing button is pressed, then yellow, red and back\ninput walk: 0@0, 1@40, 0@45, 1@160, 0@165\nmcu u1: period = 1, out = green yellow red, in = walk\nprogram u1:\ngo: ldi r1, 1\n  out r1         ; green\nwait: sbic 0     ; skip unless pressed\n  jmp wait\n  ldi r1, 2\n  out r1         ; yellow\n  delay 10\n  ldi r1, 4\n  out r1         ; red\n  delay 30\n  jmp go\nend', tEnd: 260, delay: 0 } },
      { id: 'mcuPwm', ko: 'MCU: PWM 밝기 조절', en: 'MCU: PWM dimming', params: { mode: 'timing', circuit: '# Software PWM: the duty rises 0 → 15 out of 16 and repeats\nmcu u1: period = 1, out = pwm\nprogram u1:\n  ldi r1, 0      ; duty\nframe: ldi r2, 0 ; position in the 16-step period\nstep: cp r2, r1\n  jc high\n  cbi 0\n  jmp next\nhigh: sbi 0\nnext: inc r2\n  cp r2, 16\n  jnz step\n  inc r1\n  and r1, 15\n  jmp frame\nend', tEnd: 2000, delay: 0, maxRows: 40000 } },
      { id: 'jk', ko: 'JK 플립플롭 리플 카운터', en: 'JK flip-flop ripple counter', params: { mode: 'timing', circuit: '# Ripple counter from JK flip-flops (each stage clocked by the inverted output before it)\nclock clk: period = 10\ninput rst: 1@0, 0@5\nq0 = jkff(1, 1, clk, rst)\nn0 = ~q0\nq1 = jkff(1, 1, n0, rst)\nn1 = ~q1\nq2 = jkff(1, 1, n1, rst)\nbus count = q2 q1 q0', tEnd: 160, delay: 1 } },
    ],
    params: [
      P('circuit', 'code', '# 4-bit binary counter with reset\nclock clk: period = 10\ninput reset: 1@0, 0@12\nc[4] = counter(clk, reset)\nbus count = c\ndiv2 = tff(1, clk, reset)\ncarry = c0 & c1 & c2 & c3', '회로', 'Circuit', { rows: 10 }),
      P('mode', 'select', 'timing', '해석', 'Analysis', { options: [opt('timing', '타이밍 (시간 시뮬레이션)', 'Timing (simulation over time)'), opt('truth', '진리표 (조합 논리)', 'Truth table (combinational)')] }),
      P('tEnd', 'number', 200, '끝 시간', 'End time', { min: 0, show: (p) => p.mode !== 'truth' }),
      P('delay', 'number', 1, '기본 게이트 지연', 'Default gate delay', { min: 0, show: (p) => p.mode !== 'truth' }),
      P('unit', 'text', 'ns', '시간 단위', 'Time unit', { show: (p) => p.mode !== 'truth' }),
      P('show', 'text', '', '보일 신호 (비우면 전부)', 'Signals shown (empty = all)', { placeholder: 'clk, c, carry', show: (p) => p.mode !== 'truth' }),
      P('glitch', 'number', 0, '글리치 기준 폭 (0 = 끔)', 'Glitch width (0 = off)', { min: 0, show: (p) => p.mode !== 'truth' }),
      P('maxRows', 'int', 20000, '최대 기록 수', 'Max rows kept', { min: 10, show: (p) => p.mode !== 'truth' }),
      P('x', 'column', '', 'INPUT 의 시간 열', 'Time column for INPUT'),
      P('seed', 'int', 1, '난수 시드 (random)', 'Random seed (random)', { min: 0 }),
      TABLE,
    ],
  },
  {
    type: 'fem.field', cat: 'physics', icon: '▦', ko: '유한요소 해석 2D (Ansys·COMSOL 형)', en: '2D finite elements (Ansys/COMSOL-style)',
    help: ['직사각형 영역을 2차 삼각형 요소로 나눠 열전도(정상·과도), 정전기장, 평면 응력 탄성을 풉니다. 줄마다 "domain: width = 1, height = 0.4, nx = 40, ny = 16", "material: k = 45, E = 210e9, nu = 0.3, rho = 7850, c = 460", "region 이름: rect x0 y0 x1 y1 (또는 circle cx cy r, polygon …), k = 200", "source 이름: rect …, q = 1e5", "hole 이름: circle …", 경계 "left/right/top/bottom/구멍이름: T = 100 | flux = 500 | convection h = 25, Tinf = 20 | V = 5 | fixed | ux = 0 | uy = 0 | traction tx = , ty = | pressure p = ", "probe 이름: x, y". 결과: 온도·전위·응력·변위 분포(열 지도), 중앙선, 경계별 열 흐름·전하·반력, 정전 용량, 최대 응력.', 'Meshes a rectangle with quadratic triangles and solves heat conduction (steady or transient), electrostatics or plane-stress elasticity. One line each: "domain: width = 1, height = 0.4, nx = 40, ny = 16", "material: k = 45, E = 210e9, nu = 0.3, rho = 7850, c = 460", "region name: rect x0 y0 x1 y1 (or circle cx cy r, polygon …), k = 200", "source name: rect …, q = 1e5", "hole name: circle …", boundaries "left/right/top/bottom/hole name: T = 100 | flux = 500 | convection h = 25, Tinf = 20 | V = 5 | fixed | ux = 0 | uy = 0 | traction tx = , ty = | pressure p = ", "probe name: x, y". Results: temperature, potential, stress and displacement maps (heat maps), the middle line, heat flow, charge or reactions per boundary, capacitance and peak stress.'],
    inputs: [],
    presets: [
      { id: 'plate', ko: '열: 구멍 난 판 (가열·대류)', en: 'Heat: plate with a bore (heated, convection)', params: { physics: 'heat', model: '# Steel plate heated on the left, cooled by air on the right and by water in the bore\ndomain: width = 0.4, height = 0.2, nx = 40, ny = 20\nmaterial: k = 45\nhole bore: circle 0.26 0.1 0.04\nleft: T = 150\nright: convection h = 25, Tinf = 20\nbore: convection h = 800, Tinf = 15\nprobe centre: 0.15, 0.1' } },
      { id: 'chip', ko: '열: 기판 위 칩 (발열 영역)', en: 'Heat: chip on a board (heat source)', params: { physics: 'heat', model: '# FR-4 board with a copper spreader and a 2 W/mm-depth chip\ndomain: width = 0.08, height = 0.02, nx = 48, ny = 16\nmaterial: k = 0.3\nregion copper: rect 0 0.016 0.08 0.018, k = 390\nsource chip: rect 0.035 0.018 0.045 0.02, q = 2e6, k = 150\nbottom: convection h = 10, Tinf = 25\ntop: convection h = 15, Tinf = 25\nprobe chip: 0.04, 0.019\nprobe edge: 0.002, 0.01' } },
      { id: 'warmup', ko: '열 과도: 막대 가열', en: 'Transient heat: warming a bar', params: { physics: 'transient', tEnd: 600, steps: 120, T0: 20, model: '# Aluminium bar, one end suddenly at 200 °C\ndomain: width = 0.3, height = 0.03, nx = 30, ny = 3\nmaterial: k = 205, rho = 2700, c = 900\nleft: T = 200\nright: convection h = 15, Tinf = 20\nprobe near: 0.05, 0.015\nprobe middle: 0.15, 0.015\nprobe end: 0.3, 0.015' } },
      { id: 'capacitor', ko: '정전기: 유전체 콘덴서', en: 'Electrostatics: capacitor with a dielectric', params: { physics: 'electrostatics', model: '# Parallel plates, half filled with a dielectric (εr = 4)\ndomain: width = 0.02, height = 0.004, nx = 40, ny = 16\nmaterial: epsr = 1\nregion dielectric: rect 0 0 0.01 0.004, epsr = 4\nbottom: V = 0\ntop: V = 100' } },
      { id: 'cantilever', ko: '구조: 외팔보 (끝 하중)', en: 'Structure: cantilever (end load)', params: { physics: 'elasticity', yield: 250e6, model: '# Steel cantilever 1 m × 0.1 m, 10 mm thick, 1 kN at the tip\ndomain: width = 1, height = 0.1, nx = 40, ny = 4\nmaterial: E = 200e9, nu = 0.3, t = 0.01\nleft: fixed\nright: traction ty = -1e6\nprobe tip: 1, 0.05' } },
      { id: 'hole', ko: '구조: 구멍 난 판 인장 (응력 집중)', en: 'Structure: plate with a hole in tension (stress concentration)', params: { physics: 'elasticity', yield: 250e6, model: '# Kirsch problem: the hole edge sees about 3 × the far-field stress\ndomain: width = 1, height = 0.5, nx = 80, ny = 40\nmaterial: E = 200e9, nu = 0.3\nhole bore: circle 0.5 0.25 0.05\nleft: ux = 0\nbottom: uy = 0\nright: traction tx = 50e6\nprobe edge: 0.5, 0.3' } },
      { id: 'bracket', ko: '구조: 자중과 압력을 받는 브래킷', en: 'Structure: bracket under its weight and pressure', params: { physics: 'elasticity', yield: 275e6, model: '# Bracket bolted on the left, pressure on top, gravity\ndomain: width = 0.3, height = 0.15, nx = 30, ny = 15\nmaterial: E = 210e9, nu = 0.3, rho = 7850, gy = -9.81, t = 0.02\nhole bolt: circle 0.22 0.075 0.03\nleft: fixed\ntop: pressure p = 2e6' } },
    ],
    params: [
      P('physics', 'select', 'heat', '물리', 'Physics', { options: [opt('heat', '열전도 (정상 상태)', 'Heat conduction (steady)'), opt('transient', '열전도 (과도)', 'Heat conduction (transient)'), opt('electrostatics', '정전기장', 'Electrostatics'), opt('elasticity', '평면 응력 탄성', 'Plane-stress elasticity')] }),
      P('model', 'code', '# Steel plate heated on the left, cooled by air on the right and by water in the bore\ndomain: width = 0.4, height = 0.2, nx = 40, ny = 20\nmaterial: k = 45\nhole bore: circle 0.26 0.1 0.04\nleft: T = 150\nright: convection h = 25, Tinf = 20\nbore: convection h = 800, Tinf = 15\nprobe centre: 0.15, 0.1', '모델', 'Model', { rows: 11 }),
      P('tEnd', 'number', 100, '끝 시간', 'End time', { unit: 's', min: 0, show: (p) => p.physics === 'transient' }),
      P('steps', 'int', 100, '시간 단계 수', 'Time steps', { min: 1, show: (p) => p.physics === 'transient' }),
      P('T0', 'number', 20, '초기 온도', 'Initial temperature', { unit: '°C', show: (p) => p.physics === 'transient' }),
      P('yield', 'number', '', '항복 강도 (안전율)', 'Yield strength (safety factor)', { unit: 'Pa', show: (p) => p.physics === 'elasticity' }),
      P('constants', 'text', '', '상수', 'Constants', { placeholder: 'L = 0.4, r = 0.04' }),
    ],
  },
  {
    type: 'robot.mobile', cat: 'robotics', icon: '🚗', ko: '이동 로봇 (Gazebo·Webots 형)', en: 'Mobile robot (Gazebo/Webots-style)',
    help: ['2D 세계에서 차동 구동 로봇을 센서와 제어기로 움직입니다. 세계: "arena: width = 10, height = 8", "box: x0 y0 x1 y1", "circle: cx cy r", "wall: x1 y1 x2 y2 …", "goal: x y" 또는 "waypoints: x1 y1, x2 y2", "robot: x = 1, y = 1, heading = 0, radius = 0.2, vmax = 1, wmax = 3, accel = 2", "lidar: rays = 9, fov = 180, range = 4, noise = 0.01, clear = 1", "odometry: noise = 0.02". 제어기는 매 단계 v(m/s)·w(rad/s) 를 정합니다. 쓸 수 있는 값: t, dt, x, y, th, v, w, goal_dist, goal_angle, d0…(라이다, 오른쪽→왼쪽), front, left, right, bump, nearest, nearest_angle, gap_angle(로봇 폭을 고려해 목표에 가장 가까운 빈 방향). 제어기가 만든 다른 이름은 다음 단계까지 값이 남습니다(적분, 상태).', 'Drives a differential-drive robot with sensors and a controller in a 2D world. World: "arena: width = 10, height = 8", "box: x0 y0 x1 y1", "circle: cx cy r", "wall: x1 y1 x2 y2 …", "goal: x y" or "waypoints: x1 y1, x2 y2", "robot: x = 1, y = 1, heading = 0, radius = 0.2, vmax = 1, wmax = 3, accel = 2", "lidar: rays = 9, fov = 180, range = 4, noise = 0.01, clear = 1", "odometry: noise = 0.02". The controller sets v (m/s) and w (rad/s) every step from t, dt, x, y, th, v, w, goal_dist, goal_angle, d0… (lidar, right to left), front, left, right, bump, nearest, nearest_angle and gap_angle (the open direction nearest the goal, allowing for the width of the robot); any other name it sets keeps its value to the next step (integrals, states).'],
    inputs: [],
    presets: [
      { id: 'goal', ko: '목표로 가기', en: 'Go to a goal', params: { world: '# An empty room\narena: width = 10, height = 8\ngoal: 8.5 6.5\nrobot: x = 1, y = 1, heading = 0\nlidar: rays = 9, fov = 180, range = 4', controller: '# Proportional steering towards the goal\nv = min(vmax, 0.8*goal_dist)\nw = 3*goal_angle', tEnd: 30 } },
      { id: 'avoid', ko: '장애물 피해 목표로', en: 'Avoid obstacles on the way', params: { world: '# Obstacles between the start and the goal\narena: width = 10, height = 8\nbox: 3.5 2 4.5 6\ncircle: 6.5 4.5 0.7\nwall: 7 1 7 3\ngoal: 9 6.5\nrobot: x = 1, y = 2, heading = 0, wmax = 3\nlidar: rays = 31, fov = 240, range = 3, noise = 0.01, clear = 1.2', controller: '# Steer into the open direction nearest the goal (follow the gap)\nw = clamp(3*gap_angle, -wmax, wmax)\nv = min(0.8, goal_dist) * clamp((nearest - 0.15)/0.6, 0.1, 1) * clamp(1 - abs(gap_angle)/2, 0.2, 1)', tEnd: 60 } },
      { id: 'wall', ko: '벽 따라가기', en: 'Wall following', params: { world: '# Follow the right-hand wall around the room\narena: width = 8, height = 6\nbox: 3 2 5 4\nrobot: x = 1, y = 0.6, heading = 0\nlidar: rays = 13, fov = 240, range = 3', controller: '# Keep 0.5 m from the wall on the right (PD on the distance)\nerr = 0.5 - right\nderr = (err - last)/dt\nlast = err\nw = clamp(2.5*err + 0.6*derr + if(front < 0.7, 2.5, 0), -wmax, wmax)\nv = if(front < 0.4, 0.05, 0.5)', tEnd: 60 } },
      { id: 'patrol', ko: '경유점 순찰 (오도메트리 오차)', en: 'Waypoint patrol (odometry drift)', params: { world: '# Visit four corners; odometry drifts, the GPS does not\narena: width = 10, height = 10\nwaypoints: 8 2, 8 8, 2 8, 2 2\nrobot: x = 2, y = 2, heading = 0\nodometry: noise = 0.03', controller: 'v = min(vmax, goal_dist)\nw = 3*goal_angle', tEnd: 80 } },
      { id: 'wander', ko: '돌아다니기 (브라이텐베르크)', en: 'Wandering (Braitenberg)', params: { world: '# A cluttered room without a goal\narena: width = 10, height = 8\ncircle: 3 3 0.6\ncircle: 7 5 0.8\nbox: 4.5 5.5 5.5 7\nbox: 6 1 8 2\nrobot: x = 1, y = 6, heading = -30\nlidar: rays = 13, fov = 200, range = 2.5', controller: '# Braitenberg vehicle: turn towards the more open side, slow down near things\nw = clamp(1.5*(left - right) + if(front < 0.8, if(left > right, 2.5, -2.5), 0), -wmax, wmax)\nv = 0.6*clamp((front - 0.35)/0.8, 0, 1)', tEnd: 60 } },
    ],
    params: [
      P('world', 'code', '# An empty room\narena: width = 10, height = 8\ngoal: 8.5 6.5\nrobot: x = 1, y = 1, heading = 0\nlidar: rays = 9, fov = 180, range = 4', '세계', 'World', { rows: 8 }),
      P('controller', 'code', '# Proportional steering towards the goal\nv = min(vmax, 0.8*goal_dist)\nw = 3*goal_angle', '제어기', 'Controller', { rows: 7 }),
      P('tEnd', 'number', 30, '시간', 'Run time', { unit: 's', min: 0 }),
      P('dt', 'number', 0.05, '제어 주기', 'Control period', { unit: 's', min: 1e-4 }),
      P('stopAtGoal', 'bool', true, '목표에서 멈춤', 'Stop at the goal'),
      P('constants', 'text', '', '상수 (제어기 변수 초기값)', 'Constants (controller start values)'),
      P('seed', 'int', 1, '난수 시드 (잡음)', 'Random seed (noise)', { min: 0 }),
    ],
  },
  {
    type: 'robot.arm', cat: 'robotics', icon: '🦾', ko: '로봇 팔 다물체 동역학', en: 'Robot arm multibody dynamics',
    help: ['평면 직렬 로봇 팔(막대 링크 1–8개와 끝 하중)의 운동 방정식 M(q)q̈ + C(q, q̇) + G(q) = τ 를 RK4 로 풉니다. 관절각은 +x 축에서 잽니다(아래로 늘어지면 −90°). 자유 운동(진자·이중 진자), 관절 목표 추종(PID + 중력 보상), 끝점 경로 추종(역기구학). 관절각·속도·토크, 끝점 경로, 에너지, 자세 그림.', 'Solves the equations of motion M(q)q̈ + C(q, q̇) + G(q) = τ of a planar serial arm (1–8 rod links and a payload) with RK4. Joint angles are measured from the +x axis (hanging down is −90°). Free motion (pendulum, double pendulum), joint targets (PID with gravity compensation) or a tip path (inverse kinematics). Joint angles, speeds and torques, the tip path, energy and the poses.'],
    inputs: [],
    presets: [
      { id: 'double', ko: '이중 진자 (혼돈)', en: 'Double pendulum (chaos)', params: { arm: 'link: length = 1, mass = 1\nlink: length = 1, mass = 1', mode: 'free', q0: '90, 30', tEnd: 10, dt: 0.0005, damping: 0 } },
      { id: 'pendulum', ko: '막대 진자', en: 'Rod pendulum', params: { arm: 'link: length = 1, mass = 1', mode: 'free', q0: '-30', tEnd: 6, dt: 0.001, damping: 0.02 } },
      { id: 'pick', ko: '2관절 팔 관절 이동', en: 'Two-joint arm, joint moves', params: { arm: 'link: length = 0.5, mass = 3\nlink: length = 0.4, mass = 2\npayload: mass = 1', mode: 'joint', q0: '-90, 0', targets: '# Smooth moves between poses (degrees)\nq1 = -90 + 120*(1 - cos(pi*min(t, 2)/2))/2\nq2 = 70*(1 - cos(pi*min(t, 2)/2))/2', kp: '300, 150', kd: '40, 20', tmax: '60, 30', tEnd: 4, dt: 0.001 } },
      { id: 'circle', ko: '끝점으로 원 그리기 (역기구학)', en: 'Drawing a circle with the tip (IK)', params: { arm: 'link: length = 0.6, mass = 2\nlink: length = 0.5, mass = 1\npayload: mass = 0.5', mode: 'cartesian', q0: '20, 60', targets: 'x = 0.6 + 0.15*cos(2*t)\ny = 0.4 + 0.15*sin(2*t)', kp: '400', kd: '60', tEnd: 6, dt: 0.001 } },
      { id: 'three', ko: '3관절 팔 직선 경로', en: 'Three-joint arm, straight path', params: { arm: 'link: length = 0.4, mass = 2\nlink: length = 0.35, mass = 1.5\nlink: length = 0.2, mass = 0.5', mode: 'cartesian', q0: '60, -30, -30', targets: 'x = 0.3 + 0.4*(1 - cos(pi*min(t, 3)/3))/2\ny = 0.6 - 0.5*(1 - cos(pi*min(t, 3)/3))/2', kp: '500, 250, 40', kd: '50, 20, 2', tEnd: 4, dt: 0.0005 } },
    ],
    params: [
      P('arm', 'code', 'link: length = 1, mass = 1\nlink: length = 1, mass = 1', '팔 (링크·하중)', 'Arm (links, payload)', { rows: 4 }),
      P('mode', 'select', 'free', '운동', 'Motion', { options: [opt('free', '자유 운동', 'Free motion'), opt('joint', '관절 목표 (PID)', 'Joint targets (PID)'), opt('cartesian', '끝점 경로 (역기구학)', 'Tip path (inverse kinematics)')] }),
      P('q0', 'text', '90, 30', '초기 관절각 (°)', 'Start angles (°)'),
      P('targets', 'code', '', '목표 (q1 = … ° 또는 x = …, y = …)', 'Targets (q1 = … ° or x = …, y = …)', { rows: 3, show: (p) => p.mode !== 'free' }),
      P('kp', 'text', '100', 'Kp (관절마다)', 'Kp (per joint)', { show: (p) => p.mode !== 'free' }),
      P('kd', 'text', '20', 'Kd', 'Kd', { show: (p) => p.mode !== 'free' }),
      P('ki', 'text', '0', 'Ki', 'Ki', { show: (p) => p.mode !== 'free' }),
      P('tmax', 'text', '', '토크 한계 (N·m)', 'Torque limits (N·m)', { show: (p) => p.mode !== 'free' }),
      P('gravityComp', 'bool', true, '중력 보상', 'Gravity compensation', { show: (p) => p.mode !== 'free' }),
      P('gravity', 'number', 9.81, '중력', 'Gravity', { unit: 'm/s²' }),
      P('damping', 'number', 0, '관절 감쇠', 'Joint damping', { unit: 'N·m·s' }),
      P('tEnd', 'number', 10, '시간', 'Run time', { unit: 's', min: 0 }),
      P('dt', 'number', 0.0005, '시간 간격', 'Time step', { unit: 's', min: 1e-6 }),
    ],
  },
  {
    type: 'physics.rigid', cat: 'robotics', icon: '🧊', ko: '3D 강체 물리 엔진', en: '3D rigid-body physics engine',
    help: ['구·상자·캡슐 강체를 중력 아래에서 움직입니다: 충돌(마찰·반발), 볼·힌지(모터)·거리 조인트, 스프링, 시간에 따른 힘. 순차 충격량 해법과 위치 보정, z 가 위쪽. 줄마다 "gravity: 0 0 -9.81", "ground: friction = 0.6, restitution = 0.3", "body 이름: sphere r = 0.1 | box size = 0.4 0.3 0.2 | capsule r = 0.05, length = 0.5, mass = 1, pos = x y z, vel = …, angvel = …, rot = 각x 각y 각z (도), friction = , restitution = , damping = , color = red", "static 이름: box …(고정)", "joint 이름: ball | hinge | distance, a = 물체, b = world|물체, at = x y z, axis = 0 1 0, motor = 식(t), torque = 5, to = …, length = …", "spring 이름: a = , b = , at = , to = , k = , c = , rest = ", "force 이름: body = , f = fx fy fz (t 의 식)". 3D 보기에서 장면을 재생합니다.', 'Moves rigid spheres, boxes and capsules under gravity: contacts (friction, restitution), ball, hinge (motor) and distance joints, springs and forces over time. Sequential impulses with position correction; z is up. One line each: "gravity: 0 0 -9.81", "ground: friction = 0.6, restitution = 0.3", "body name: sphere r = 0.1 | box size = 0.4 0.3 0.2 | capsule r = 0.05, length = 0.5, mass = 1, pos = x y z, vel = …, angvel = …, rot = rx ry rz (degrees), friction = , restitution = , damping = , color = red", "static name: box … (fixed)", "joint name: ball | hinge | distance, a = body, b = world|body, at = x y z, axis = 0 1 0, motor = expression of t, torque = 5, to = …, length = …", "spring name: a = , b = , at = , to = , k = , c = , rest = ", "force name: body = , f = fx fy fz (expressions of t)". The 3D view plays the scene back.'],
    inputs: [],
    presets: [
      { id: 'bounce', ko: '튀는 공 (반발 계수)', en: 'Bouncing balls (restitution)', params: { world: '# Three balls with restitution 0.9, 0.6 and 0.3\nground: friction = 0.4, restitution = 0\nbody hi: sphere r = 0.1, mass = 1, pos = -0.5 0 2, restitution = 0.9, color = green\nbody mid: sphere r = 0.1, mass = 1, pos = 0 0 2, restitution = 0.6, color = yellow\nbody lo: sphere r = 0.1, mass = 1, pos = 0.5 0 2, restitution = 0.3, color = red', tEnd: 5, dt: 1 / 480 } },
      { id: 'cradle', ko: '뉴턴의 요람', en: 'Newton\'s cradle', params: { world: '# Newton\'s cradle: five steel balls on ropes, the first released from 45°\ngravity: 0 0 -9.81\nbody b1: sphere r = 0.05, mass = 1, pos = -0.553553 0 0.646447, restitution = 1, friction = 0, color = grey\nbody b2: sphere r = 0.05, mass = 1, pos = -0.100000 0 0.500000, restitution = 1, friction = 0, color = grey\nbody b3: sphere r = 0.05, mass = 1, pos = 0.000000 0 0.500000, restitution = 1, friction = 0, color = grey\nbody b4: sphere r = 0.05, mass = 1, pos = 0.100000 0 0.500000, restitution = 1, friction = 0, color = grey\nbody b5: sphere r = 0.05, mass = 1, pos = 0.200000 0 0.500000, restitution = 1, friction = 0, color = grey\njoint r1: distance a = b1, b = world, to = -0.2 0 1, length = 0.5\njoint r2: distance a = b2, b = world, to = -0.1 0 1, length = 0.5\njoint r3: distance a = b3, b = world, to = 0.0 0 1, length = 0.5\njoint r4: distance a = b4, b = world, to = 0.1 0 1, length = 0.5\njoint r5: distance a = b5, b = world, to = 0.2 0 1, length = 0.5', tEnd: 4, dt: 1 / 2000, iterations: 60 } },
      { id: 'dominoes', ko: '도미노', en: 'Dominoes', params: { world: '# A row of dominoes knocked over by a rolling ball\nground: friction = 0.6, restitution = 0.1\nbody d1: box size = 0.02 0.1 0.2, mass = 0.05, pos = 0.30 0 0.1, friction = 0.5, restitution = 0.05, color = yellow\nbody d2: box size = 0.02 0.1 0.2, mass = 0.05, pos = 0.42 0 0.1, friction = 0.5, restitution = 0.05, color = blue\nbody d3: box size = 0.02 0.1 0.2, mass = 0.05, pos = 0.54 0 0.1, friction = 0.5, restitution = 0.05, color = yellow\nbody d4: box size = 0.02 0.1 0.2, mass = 0.05, pos = 0.66 0 0.1, friction = 0.5, restitution = 0.05, color = blue\nbody d5: box size = 0.02 0.1 0.2, mass = 0.05, pos = 0.78 0 0.1, friction = 0.5, restitution = 0.05, color = yellow\nbody d6: box size = 0.02 0.1 0.2, mass = 0.05, pos = 0.90 0 0.1, friction = 0.5, restitution = 0.05, color = blue\nbody d7: box size = 0.02 0.1 0.2, mass = 0.05, pos = 1.02 0 0.1, friction = 0.5, restitution = 0.05, color = yellow\nbody d8: box size = 0.02 0.1 0.2, mass = 0.05, pos = 1.14 0 0.1, friction = 0.5, restitution = 0.05, color = blue\nbody d9: box size = 0.02 0.1 0.2, mass = 0.05, pos = 1.26 0 0.1, friction = 0.5, restitution = 0.05, color = yellow\nbody d10: box size = 0.02 0.1 0.2, mass = 0.05, pos = 1.38 0 0.1, friction = 0.5, restitution = 0.05, color = blue\nbody ball: sphere r = 0.04, mass = 0.2, pos = 0 0 0.05, vel = 1.5 0 0, color = red', tEnd: 3, dt: 1 / 480, iterations: 30 } },
      { id: 'tower', ko: '상자 탑과 쇠공', en: 'A box tower hit by a ball', params: { world: '# A tower of boxes hit by a heavy ball\nground: friction = 0.7, restitution = 0.1\nbody box00: box size = 0.3 0.3 0.3, mass = 1, pos = 0 -0.32 0.15, friction = 0.6, restitution = 0.05\nbody box01: box size = 0.3 0.3 0.3, mass = 1, pos = 0 0.00 0.15, friction = 0.6, restitution = 0.05\nbody box02: box size = 0.3 0.3 0.3, mass = 1, pos = 0 0.32 0.15, friction = 0.6, restitution = 0.05\nbody box10: box size = 0.3 0.3 0.3, mass = 1, pos = 0 -0.16 0.45, friction = 0.6, restitution = 0.05\nbody box11: box size = 0.3 0.3 0.3, mass = 1, pos = 0 0.16 0.45, friction = 0.6, restitution = 0.05\nbody box20: box size = 0.3 0.3 0.3, mass = 1, pos = 0 -0.32 0.75, friction = 0.6, restitution = 0.05\nbody box21: box size = 0.3 0.3 0.3, mass = 1, pos = 0 0.00 0.75, friction = 0.6, restitution = 0.05\nbody box22: box size = 0.3 0.3 0.3, mass = 1, pos = 0 0.32 0.75, friction = 0.6, restitution = 0.05\nbody box30: box size = 0.3 0.3 0.3, mass = 1, pos = 0 -0.16 1.05, friction = 0.6, restitution = 0.05\nbody box31: box size = 0.3 0.3 0.3, mass = 1, pos = 0 0.16 1.05, friction = 0.6, restitution = 0.05\nbody box40: box size = 0.3 0.3 0.3, mass = 1, pos = 0 -0.32 1.35, friction = 0.6, restitution = 0.05\nbody box41: box size = 0.3 0.3 0.3, mass = 1, pos = 0 0.00 1.35, friction = 0.6, restitution = 0.05\nbody box42: box size = 0.3 0.3 0.3, mass = 1, pos = 0 0.32 1.35, friction = 0.6, restitution = 0.05\nbody ball: sphere r = 0.2, mass = 8, pos = -3 0 0.6, vel = 7 0 1.5, restitution = 0.2, color = red', tEnd: 4, dt: 1 / 360, iterations: 30 } },
      { id: 'car', ko: '모터 바퀴 차량 (경사로)', en: 'Motor-driven vehicle (ramp)', params: { world: '# A four-wheel vehicle: wheels on hinge motors, driving onto a ramp\nground: friction = 0.9, restitution = 0\nbody chassis: box size = 0.8 0.4 0.12, mass = 4, pos = 0 0 0.25, color = blue\nbody fl: sphere r = 0.12, mass = 0.4, pos = 0.3 0.28 0.12, friction = 1, restitution = 0, color = black\nbody fr: sphere r = 0.12, mass = 0.4, pos = 0.3 -0.28 0.12, friction = 1, restitution = 0, color = black\nbody rl: sphere r = 0.12, mass = 0.4, pos = -0.3 0.28 0.12, friction = 1, restitution = 0, color = black\nbody rr: sphere r = 0.12, mass = 0.4, pos = -0.3 -0.28 0.12, friction = 1, restitution = 0, color = black\nstatic ramp: box size = 1.5 2 0.1, pos = 3 0 0.18, rot = 0 -12 0, color = grey\njoint h1: hinge a = fl, b = chassis, at = 0.3 0.28 0.12, axis = 0 1 0, motor = 12*min(t, 1), torque = 4\njoint h2: hinge a = fr, b = chassis, at = 0.3 -0.28 0.12, axis = 0 1 0, motor = 12*min(t, 1), torque = 4\njoint h3: hinge a = rl, b = chassis, at = -0.3 0.28 0.12, axis = 0 1 0, motor = 12*min(t, 1), torque = 4\njoint h4: hinge a = rr, b = chassis, at = -0.3 -0.28 0.12, axis = 0 1 0, motor = 12*min(t, 1), torque = 4', tEnd: 5, dt: 1 / 480, iterations: 40 } },
      { id: 'chain', ko: '사슬 진자 (다물체)', en: 'Chain pendulum (multibody)', params: { world: '# A chain of five links swinging from a pivot (multibody pendulum)\nbody l1: capsule r = 0.03, length = 0.24, mass = 0.3, pos = 0.15 0 1.5, rot = 0 90 0, color = purple\nbody l2: capsule r = 0.03, length = 0.24, mass = 0.3, pos = 0.45 0 1.5, rot = 0 90 0, color = orange\nbody l3: capsule r = 0.03, length = 0.24, mass = 0.3, pos = 0.75 0 1.5, rot = 0 90 0, color = purple\nbody l4: capsule r = 0.03, length = 0.24, mass = 0.3, pos = 1.05 0 1.5, rot = 0 90 0, color = orange\nbody l5: capsule r = 0.03, length = 0.24, mass = 0.3, pos = 1.35 0 1.5, rot = 0 90 0, color = purple\njoint p0: ball a = l1, b = world, at = 0 0 1.5\njoint p1: ball a = l2, b = l1, at = 0.30 0 1.5\njoint p2: ball a = l3, b = l2, at = 0.60 0 1.5\njoint p3: ball a = l4, b = l3, at = 0.90 0 1.5\njoint p4: ball a = l5, b = l4, at = 1.20 0 1.5', tEnd: 6, dt: 1 / 960, iterations: 40 } },
      { id: 'spring', ko: '스프링에 매달린 상자', en: 'A box on a spring', params: { world: '# A box hanging on a spring, released from the unstretched length\nbody box: box size = 0.2 0.2 0.2, mass = 2, pos = 0 0 1, color = orange\nspring s: a = box, b = world, at = 0 0 1.1, to = 0 0 2, k = 80, c = 0.5, rest = 0.9', tEnd: 6, dt: 1 / 480 } },
    ],
    params: [
      P('world', 'code', '# Three balls with restitution 0.9, 0.6 and 0.3\nground: friction = 0.4, restitution = 0\nbody hi: sphere r = 0.1, mass = 1, pos = -0.5 0 2, restitution = 0.9, color = green\nbody mid: sphere r = 0.1, mass = 1, pos = 0 0 2, restitution = 0.6, color = yellow\nbody lo: sphere r = 0.1, mass = 1, pos = 0.5 0 2, restitution = 0.3, color = red', '세계', 'World', { rows: 12 }),
      P('tEnd', 'number', 5, '시간', 'Run time', { unit: 's', min: 0 }),
      P('dt', 'number', 1 / 240, '시간 간격', 'Time step', { unit: 's', min: 1e-6 }),
      P('iterations', 'int', 20, '해법 반복', 'Solver iterations', { min: 1, max: 500 }),
      P('fps', 'number', 60, '기록 프레임', 'Frames recorded', { unit: '1/s', min: 1 }),
    ],
  },
  {
    type: 'cad.part', cat: 'cad', icon: '📐', ko: '부품 형상·질량 특성 (SolidWorks 형)', en: 'Part and mass properties (SolidWorks-style)',
    help: ['특징 트리로 부품을 만들고(더하기·빼기·교차, 선형·원형 패턴, 대칭) 부피, 질량, 무게중심, 관성 텐서, 주관성 모멘트를 구합니다. 줄마다 "units: mm", "material: steel (aluminium, titanium, copper, brass, abs, pla … 또는 density = 7850)", "base 이름: box x0 y0 z0 x1 y1 z1", "add 이름: cylinder z cx cy z0 h r", "cut 이름: cylinder x x0 cy cz 길이 r", "cone z cx cy z0 h r0 r1", "sphere cx cy cz r", "torus cx cy cz R r". 옵션: angle = 도 (z 축 회전), repeat = n, dx = …, dy = … (선형 패턴; repeat2·dx2·dy2 로 두 번째 방향), around = cx cy, count = n (원형 패턴), mirror = x 50 (대칭). 입력에 STL 삼각형 표(파일 읽기)를 연결하면 그 메시의 정확한 질량 특성을 계산합니다. 3D 보기에서 표면 점으로 형상을 봅니다.', 'Builds a part from a feature tree (add, cut, intersect, linear and circular patterns, mirrors) and computes volume, mass, centre of gravity, the inertia tensor and principal moments. One line each: "units: mm", "material: steel (aluminium, titanium, copper, brass, abs, pla … or density = 7850)", "base name: box x0 y0 z0 x1 y1 z1", "add name: cylinder z cx cy z0 h r", "cut name: cylinder x x0 cy cz length r", "cone z cx cy z0 h r0 r1", "sphere cx cy cz r", "torus cx cy cz R r". Options: angle = degrees (about z), repeat = n, dx = …, dy = … (linear pattern; repeat2, dx2, dy2 for a second direction), around = cx cy, count = n (circular pattern), mirror = x 50. With an STL triangle table on the input (Read file) it gives the exact mass properties of that mesh. The 3D view shows the shape as surface points.'],
    inputs: [{ port: 'in', ko: 'STL 삼각형 (선택)', en: 'STL triangles (optional)', optional: true }],
    presets: [
      { id: 'flange', ko: '플랜지 (볼트 구멍 8개)', en: 'Flange (8 bolt holes)', params: { part: 'units: mm\nmaterial: steel\nbase disc: cylinder z 0 0 0 12 60\nadd hub: cylinder z 0 0 12 30 30\ncut bore: cylinder z 0 0 -1 50 15\ncut bolts: cylinder z 45 0 -1 14 6, around = 0 0, count = 8\ncut chamfer: cone z 0 0 34 9 15 24' } },
      { id: 'bracket', ko: 'L 브래킷 (구멍·보강대)', en: 'L bracket (holes, gussets)', params: { part: 'units: mm\nmaterial: aluminium\nbase foot: box 0 0 0 80 60 8\nadd wall: box 0 0 8 8 60 70\ncut foot holes: cylinder z 55 15 -1 10 5, repeat2 = 2, dy2 = 30\ncut wall holes: cylinder x -1 30 45 10 6\nadd gusset: box 8 4 8 30 10 30, mirror = y 30\ncut relief: cylinder y 30 -1 30 62 18' } },
      { id: 'shaft', ko: '계단 축 (키 홈)', en: 'Stepped shaft (keyway)', params: { part: 'units: mm\nmaterial: steel\nbase main: cylinder x 0 0 0 120 20\nadd journal: cylinder x 0 0 120 40 12\nadd collar: cylinder x 0 0 30 10 26\ncut keyway: box 60 -5 15 100 5 21\ncut centre hole: cone x 0 0 -1 8 4 0' } },
      { id: 'tee', ko: '파이프 티 (교차 관)', en: 'Pipe tee (crossing pipes)', params: { part: 'units: mm\nmaterial: brass\nbase run: cylinder x 0 0 -60 120 25\nadd branch: cylinder y 0 0 0 60 25\ncut run bore: cylinder x 0 0 -61 122 20\ncut branch bore: cylinder y 0 0 0 61 20' } },
      { id: 'wheel', ko: '스포크 휠 (원형 패턴)', en: 'Spoked wheel (circular pattern)', params: { part: 'units: mm\nmaterial: aluminium\nbase rim: cylinder z 0 0 0 20 100\ncut inside: cylinder z 0 0 -1 22 88\nadd hub: cylinder z 0 0 0 20 20\ncut axle: cylinder z 0 0 -1 22 8\nadd spokes: box 18 -4 4 90 4 16, around = 0 0, count = 5' } },
      { id: 'mesh', ko: 'STL 메시 (입력 연결)', en: 'STL mesh (connect an input)', input: 'triangles', params: { part: '# Connect Read file (an .stl) to the input\nunits: mm\nmaterial: pla' } },
    ],
    params: [
      P('part', 'code', 'units: mm\nmaterial: steel\nbase disc: cylinder z 0 0 0 12 60\nadd hub: cylinder z 0 0 12 30 30\ncut bore: cylinder z 0 0 -1 50 15\ncut bolts: cylinder z 45 0 -1 14 6, around = 0 0, count = 8\ncut chamfer: cone z 0 0 34 9 15 24', '특징 트리', 'Feature tree', { rows: 10 }),
      P('resolution', 'int', 300, '적분 격자 (N × N)', 'Integration grid (N × N)', { min: 20, max: 2000, step: 50 }),
      P('points', 'int', 30000, '표면 점 수 (3D)', 'Surface points (3D)', { min: 1000, step: 5000 }),
      TABLE,
    ],
  },
  {
    type: 'fem.solid', cat: 'physics', icon: '🧱', ko: '유한요소 해석 3D (부품)', en: '3D finite elements (parts)',
    help: ['CAD 노드와 같은 특징 트리로 만든 부품을 같은 크기의 육면체 요소로 나눠 선형 탄성(비적합 모드: 굽힘이 잠기지 않음) 또는 정상 열전도를 풉니다. 특징 줄(units, material, base/add/cut …) 아래에 "mesh: n = 40"(가장 긴 변의 칸 수), "fix: x- | x+ | y- | y+ | z- | z+ | box x0 y0 z0 x1 y1 z1, dir = xyz", "load: 선택, f = fx fy fz (N, 면에 고르게)", "gravity: 0 0 -9.81", 열은 "temperature: 선택, T = 100", "convection: 선택|all, h = 15, Tinf = 20", "flux: 선택, q = W/m²", "source: box …, q = W/m³ 또는 power = W", "probe 이름: x y z". 결과: 3D 보기의 표면 점(변형 과장, 값으로 색칠), 가운데 단면 열 지도, 최대 변위·von Mises·반력·안전율 또는 최고·최저 온도와 열 흐름.', 'Meshes a part made with the CAD node\'s feature tree into equal hexahedra and solves linear elasticity (incompatible modes: no locking in bending) or steady heat conduction. Below the feature lines (units, material, base/add/cut …): "mesh: n = 40" (cells along the longest side), "fix: x- | x+ | y- | y+ | z- | z+ | box x0 y0 z0 x1 y1 z1, dir = xyz", "load: selection, f = fx fy fz (N, spread over the face)", "gravity: 0 0 -9.81", for heat "temperature: selection, T = 100", "convection: selection|all, h = 15, Tinf = 20", "flux: selection, q = W/m²", "source: box …, q = W/m³ or power = W", "probe name: x y z". Results: surface points in the 3D view (exaggerated deformation, coloured by the value), a heat map of the middle slice, the largest displacement, von Mises stress, reactions and safety factor, or the temperature range and heat flows.'],
    inputs: [],
    presets: [
      { id: 'cantilever', ko: '외팔보 (끝 하중)', en: 'Cantilever (tip load)', params: { physics: 'elasticity', yield: 250e6, part: '# Aluminium beam 300 × 30 × 20 mm, clamped at x = 0, 400 N down at the tip\nunits: mm\nmaterial: aluminium\nbase beam: box 0 0 0 300 30 20\nmesh: n = 60\nfix: x-\nload: x+, f = 0 0 -400\nprobe tip: 300 15 10' } },
      { id: 'hole', ko: '구멍 난 판 인장', en: 'Plate with a hole in tension', params: { physics: 'elasticity', yield: 250e6, part: '# Steel plate 200 × 100 × 10 mm with a 30 mm hole, pulled with 50 kN\nunits: mm\nmaterial: steel\nbase plate: box 0 0 0 200 100 10\ncut hole: cylinder z 100 50 -1 12 15\nmesh: n = 60\nfix: x-, dir = x\nfix: y-, dir = y\nfix: z-, dir = z\nload: x+, f = 50000 0 0' } },
      { id: 'bracket', ko: 'L 브래킷 (볼트 면 고정)', en: 'L bracket (bolted face)', params: { physics: 'elasticity', yield: 275e6, part: '# Steel L bracket bolted to a wall (x = 0), 1.5 kN down on the end of the foot\nunits: mm\nmaterial: steel\nbase foot: box 0 0 0 120 60 10\nadd wall: box 0 0 10 10 60 80\ncut slot: cylinder z 80 30 -1 12 8\nmesh: n = 50\nfix: x-\nload: box 100 0 10 120 60 10, f = 0 0 -1500\nprobe end: 120 30 10' } },
      { id: 'heatsink', ko: '방열판 (칩 발열·대류)', en: 'Heat sink (chip, convection)', params: { physics: 'heat', part: '# Aluminium heat sink: a base with eight fins, a 10 W chip under it, air all round\nunits: mm\nmaterial: aluminium\nbase plate: box 0 0 0 80 60 5\nadd fins: box 2 0 5 6 60 35, repeat = 8, dx = 10\nmesh: n = 60\nsource: box 30 20 0 50 40 2, power = 10\nconvection: all, h = 12, Tinf = 25\nprobe chip: 40 30 0\nprobe fin: 7 30 35' } },
      { id: 'block', ko: '한쪽을 데운 블록', en: 'A block heated on one side', params: { physics: 'heat', part: '# A steel block, 150 °C on one face, cooled by air elsewhere\nunits: mm\nmaterial: steel\nbase block: box 0 0 0 100 50 50\ncut bore: cylinder y 60 -1 25 52 12\nmesh: n = 40\ntemperature: x-, T = 150\nconvection: all, h = 25, Tinf = 20\nprobe far: 100 25 25' } },
    ],
    params: [
      P('physics', 'select', 'elasticity', '물리', 'Physics', { options: [opt('elasticity', '선형 탄성 (응력·변위)', 'Linear elasticity (stress, displacement)'), opt('heat', '열전도 (정상)', 'Heat conduction (steady)')] }),
      P('part', 'code', '# Aluminium beam 300 × 30 × 20 mm, clamped at x = 0, 400 N down at the tip\nunits: mm\nmaterial: aluminium\nbase beam: box 0 0 0 300 30 20\nmesh: n = 60\nfix: x-\nload: x+, f = 0 0 -400\nprobe tip: 300 15 10', '부품·조건', 'Part and conditions', { rows: 12 }),
      P('yield', 'number', '', '항복 강도 (안전율)', 'Yield strength (safety factor)', { unit: 'Pa', show: (p) => p.physics !== 'heat' }),
      P('deform', 'number', 1, '변형 과장 배율', 'Deformation exaggeration', { min: 0, show: (p) => p.physics !== 'heat' }),
    ],
  },
  {
    type: 'stat.describe', cat: 'analysis', icon: 'Σ', ko: '기술 통계', en: 'Descriptive statistics',
    help: ['열마다 개수·평균·표준편차·사분위·왜도·첨도.', 'Count, mean, standard deviation, quartiles, skewness and kurtosis of every column.'],
    inputs: IN,
    params: [P('columns', 'columns', '', '열', 'Columns'), TABLE],
  },
  {
    type: 'stat.histogram', cat: 'analysis', icon: '▆', ko: '히스토그램', en: 'Histogram',
    help: ['도수·밀도·누적 분포와 정규 분포 맞춤, KS 거리.', 'Counts, density and cumulative distribution with a normal fit and the KS distance.'],
    inputs: IN,
    params: [P('column', 'column', '', '열', 'Column'), P('bins', 'int', 0, '구간 수 (0 = 자동)', 'Bins (0 = auto)', { min: 0 }), P('from', 'number', '', '하한', 'From'), P('to', 'number', '', '상한', 'To'), TABLE],
  },
  {
    type: 'stat.regression', cat: 'analysis', icon: '⟋', ko: '회귀 분석', en: 'Regression',
    help: ['선형·다항·지수·거듭제곱·로그·다중 선형 회귀. 계수, 표준오차, R², 잔차와 맞춤 곡선.', 'Linear, polynomial, exponential, power, logarithmic and multiple linear regression: coefficients, standard errors, R², residuals and the fitted curve.'],
    inputs: IN,
    params: [P('model', 'select', 'polynomial', '모델', 'Model', { options: [opt('linear', '선형', 'Linear'), opt('polynomial', '다항식', 'Polynomial'), opt('exponential', '지수 y = a·e^(bx)', 'Exponential y = a·e^(bx)'), opt('power', '거듭제곱 y = a·x^b', 'Power y = a·x^b'), opt('logarithmic', '로그 y = a + b·ln x', 'Logarithmic y = a + b·ln x'), opt('multiple', '다중 선형', 'Multiple linear')] }), P('degree', 'int', 2, '차수', 'Degree', { min: 0, max: 12, show: (p) => (p.model ?? 'polynomial') === 'polynomial' }), P('x', 'columns', '', 'x 열 (다중: 여러 개)', 'x column(s)'), P('y', 'column', '', 'y 열', 'y column'), TABLE],
  },
  {
    type: 'stat.correlation', cat: 'analysis', icon: '▦', ko: '상관 행렬', en: 'Correlation matrix',
    help: ['피어슨 또는 스피어먼 상관 행렬 (열 지도).', 'Pearson or Spearman correlation matrix (heat map).'],
    inputs: IN,
    params: [P('columns', 'columns', '', '열', 'Columns'), P('method', 'select', 'pearson', '방법', 'Method', { options: [opt('pearson', '피어슨', 'Pearson'), opt('spearman', '스피어먼 (순위)', 'Spearman (rank)')] }), TABLE],
  },
  {
    type: 'ml.kmeans', cat: 'analysis', icon: '⁘', ko: 'k-평균 군집', en: 'k-means clustering',
    help: ['k-means++ 초기화, 여러 번 재시작. 군집 번호 열, 중심, 관성, 실루엣 점수.', 'k-means++ seeding with restarts: a cluster column, centroids, inertia and the silhouette score.'],
    inputs: IN,
    params: [P('columns', 'columns', '', '특징 열', 'Feature columns'), P('k', 'int', 3, '군집 수 k', 'Clusters k', { min: 1, max: 100 }), P('standardize', 'bool', true, '표준화', 'Standardize'), P('iterations', 'int', 100, '최대 반복', 'Max iterations', { min: 1 }), P('restarts', 'int', 5, '재시작', 'Restarts', { min: 1 }), P('seed', 'int', 1, '난수 시드', 'Random seed', { min: 0 }), TABLE],
  },
  {
    type: 'ml.pca', cat: 'analysis', icon: '⤢', ko: '주성분 분석 (PCA)', en: 'Principal components (PCA)',
    help: ['점수, 적재값, 설명 분산(스크리 도표).', 'Scores, loadings and explained variance (scree).'],
    inputs: IN,
    params: [P('columns', 'columns', '', '열', 'Columns'), P('components', 'int', 2, '주성분 수', 'Components', { min: 1 }), P('standardize', 'bool', true, '표준화 (상관 행렬)', 'Standardize (correlation)'), TABLE],
  },
  {
    type: 'ml.mlp', cat: 'analysis', icon: '🧠', ko: '신경망 (MLP)', en: 'Neural network (MLP)',
    help: ['다층 퍼셉트론을 Adam 으로 학습해 회귀 또는 분류합니다. 학습/검증 손실, 예측 열, 정확도 또는 R², 2특징이면 예측 지도.', 'Trains a multilayer perceptron with Adam for regression or classification: train/test loss, a prediction column, accuracy or R², and a prediction map for two features.'],
    inputs: IN,
    params: [P('features', 'columns', '', '특징 열', 'Feature columns'), P('target', 'column', '', '목표 열', 'Target column'), P('task', 'select', 'regression', '작업', 'Task', { options: [opt('regression', '회귀', 'Regression'), opt('classification', '분류', 'Classification')] }), P('hidden', 'text', '16, 16', '은닉층 크기', 'Hidden layers'), P('activation', 'select', 'tanh', '활성 함수', 'Activation', { options: [opt('tanh', 'tanh'), opt('relu', 'ReLU'), opt('sigmoid', 'sigmoid')] }), P('epochs', 'int', 300, '에포크', 'Epochs', { min: 1, step: 50 }), P('learningRate', 'number', 0.01, '학습률', 'Learning rate', { min: 1e-6, step: 0.001 }), P('batch', 'int', 32, '배치 크기', 'Batch size', { min: 1 }), P('l2', 'number', 0, 'L2 규제', 'L2 penalty', { min: 0 }), P('testFraction', 'number', 0.2, '검증 비율', 'Test fraction', { min: 0, max: 0.9, step: 0.05 }), P('seed', 'int', 1, '난수 시드', 'Random seed', { min: 0 }), TABLE],
  },
  // ───────────────────────── Monte Carlo and optimisation
  {
    type: 'mc.simulate', cat: 'montecarlo', icon: '🎲', ko: '몬테카를로 시뮬레이션', en: 'Monte Carlo simulation',
    help: ['입력은 "이름 ~ 분포(…)", 출력은 "이름 = 식". 통계, 민감도(순위 상관), 수렴, 조건 확률(신뢰 구간).', 'Inputs as "name ~ distribution(…)", outputs as "name = expression": statistics, sensitivity (rank correlation), convergence and the probability of a condition with its interval.'],
    inputs: [],
    presets: [
      { id: 'stack', ko: '공차 누적 (조립 간극)', en: 'Tolerance stack-up (gap)', params: { model: 'housing ~ normal(50.0, 0.05)\npartA ~ normal(20.0, 0.04)\npartB ~ normal(29.8, 0.04)\nshim ~ uniform(-0.02, 0.02)\ngap = housing - partA - partB + shim', condition: 'gap < 0.05' } },
      { id: 'beam', ko: '외팔보 처짐', en: 'Cantilever deflection', params: { model: 'F ~ normal(1000, 100)\nL ~ normal(2.0, 0.01)\nE ~ lognormal(ln(200e9), 0.05)\nI ~ normal(8e-6, 2e-7)\ndefl = F*L^3/(3*E*I)*1000', condition: 'defl > 1.9' } },
      { id: 'cost', ko: '프로젝트 비용·일정', en: 'Project cost & schedule', params: { model: 'design ~ tri(20, 30, 50)\nbuild ~ tri(40, 60, 100)\ntest ~ tri(10, 15, 30)\nrate ~ uniform(90, 110)\ndays = design + build + test\ncost = days*rate/1000', condition: 'days > 120' } },
      { id: 'pi', ko: '원주율 추정', en: 'Estimating π', params: { model: 'x ~ uniform(-1, 1)\ny ~ uniform(-1, 1)\ninside = (x^2 + y^2 <= 1)*4', condition: '' } },
      { id: 'reliability', ko: '하중-강도 간섭', en: 'Stress–strength interference', params: { model: 'strength ~ weibull(12, 420)\nload ~ normal(300, 30)\nmargin = strength - load', condition: 'margin < 0' } },
    ],
    params: [P('model', 'code', 'a ~ normal(10, 0.5)\nb ~ uniform(4, 6)\ny = a * b', '모델', 'Model', { rows: 7 }), P('samples', 'int', 10000, '표본 수', 'Samples', { min: 10, step: 1000 }), P('sampling', 'select', 'random', '표본 추출', 'Sampling', { options: [opt('random', '무작위', 'Random'), opt('lhs', '라틴 하이퍼큐브', 'Latin hypercube')] }), P('condition', 'text', '', '확률을 셀 조건', 'Condition to count', { placeholder: 'y > 60' }), P('constants', 'text', '', '상수', 'Constants'), P('keepRows', 'int', 20000, '표에 남길 표본', 'Rows kept in the table', { min: 100 }), P('seed', 'int', 1, '난수 시드', 'Random seed', { min: 0 })],
  },
  {
    type: 'mc.process', cat: 'montecarlo', icon: '⫽', ko: '확률 과정', en: 'Stochastic process',
    help: ['기하 브라운 운동(주가), 랜덤 워크, 오른슈타인-울렌벡(평균 회귀) 경로와 분위수 띠, 낙폭, VaR.', 'Paths of geometric Brownian motion (prices), random walks or Ornstein–Uhlenbeck (mean reversion) with quantile bands, drawdowns and VaR.'],
    inputs: [],
    params: [P('process', 'select', 'gbm', '과정', 'Process', { options: [opt('gbm', '기하 브라운 운동', 'Geometric Brownian motion'), opt('walk', '랜덤 워크 (드리프트)', 'Random walk (drift)'), opt('ou', '오른슈타인-울렌벡', 'Ornstein–Uhlenbeck')] }), P('x0', 'number', 100, '시작값', 'Start value'), P('mu', 'number', 0.05, 'μ (드리프트 / 평균)', 'μ (drift / mean)', { step: 0.01 }), P('sigma', 'number', 0.2, 'σ (변동성)', 'σ (volatility)', { min: 0, step: 0.01 }), P('theta', 'number', 1, 'θ (회귀 속도)', 'θ (reversion rate)', { show: (p) => p.process === 'ou' }), P('jumpRate', 'number', 0, '점프 빈도', 'Jump rate', { min: 0 }), P('jumpSize', 'number', 0, '점프 크기', 'Jump size'), P('horizon', 'number', 1, '기간', 'Horizon', { min: 1e-9 }), P('steps', 'int', 250, '단계 수', 'Steps', { min: 1 }), P('paths', 'int', 500, '경로 수', 'Paths', { min: 1, step: 100 }), P('showPaths', 'int', 10, '표시할 경로', 'Paths shown', { min: 0, max: 100 }), P('seed', 'int', 1, '난수 시드', 'Random seed', { min: 0 })],
  },
  {
    type: 'des.process', cat: 'montecarlo', icon: '🏭', ko: '이산 사건 공정 (AnyLogic·FlexSim 형)', en: 'Discrete-event process (AnyLogic/FlexSim-style)',
    help: ['개체가 소스에서 생겨 대기열을 지나 작업장(서버 n대)에서 처리되고, 확률로 경로를 바꿔 싱크에서 끝납니다. 줄마다: "source 이름: interval = exponential(평균), count = n", "station 이름: servers = 2, time = 분포, capacity = 10", "delay 이름: time = 분포", "sink 이름", "route a -> b 0.9, c 0.1". 작업장별 대기 시간·대기열 길이·가동률, 처리량, 시스템 체류 시간, 시간에 따른 대기열.', 'Entities come from sources, wait in queues, are served at stations (n servers), are routed on by probability and end at sinks. One line each: "source name: interval = exponential(mean), count = n", "station name: servers = 2, time = distribution, capacity = 10", "delay name: time = distribution", "sink name", "route a -> b 0.9, c 0.1". Waiting time, queue length and utilisation per station, throughput, time in system and the queues over time.'],
    inputs: [],
    presets: [
      { id: 'mm1', ko: 'M/M/1 대기열', en: 'M/M/1 queue', params: { model: 'source customers: interval = exponential(1.25)\nstation counter: servers = 1, time = exponential(1)\nsink served\nroute customers -> counter\nroute counter -> served', tEnd: 10000, warmup: 100 } },
      { id: 'factory', ko: '생산 라인 (검사·재작업)', en: 'Production line (inspection, rework)', params: { model: 'source orders: interval = exponential(2)\nstation cutting: servers = 2, time = triangular(2.5, 3, 4)\nstation welding: servers = 1, time = normal(1.6, 0.2)\nstation inspection: servers = 1, time = uniform(0.5, 1)\nstation rework: servers = 1, time = exponential(3)\nsink shipped\nsink scrap\nroute orders -> cutting\nroute cutting -> welding\nroute welding -> inspection\nroute inspection -> shipped 0.85, rework 0.12, scrap 0.03\nroute rework -> inspection', tEnd: 2400, warmup: 120 } },
      { id: 'bank', ko: '은행 창구 (3명, 대기 공간 10)', en: 'Bank tellers (3, 10 places)', params: { model: 'source clients: interval = exponential(0.9)\nstation tellers: servers = 3, time = exponential(2.4), capacity = 10\nsink done\nroute clients -> tellers\nroute tellers -> done', tEnd: 480, warmup: 30 } },
      { id: 'clinic', ko: '병원 외래 (접수·진료·검사)', en: 'Clinic (registration, doctor, lab)', params: { model: 'source patients: interval = exponential(4)\nstation registration: servers = 1, time = uniform(1, 3)\nstation doctor: servers = 2, time = triangular(5, 8, 15)\nstation lab: servers = 1, time = exponential(6)\ndelay walk: time = uniform(1, 2)\nsink home\nroute patients -> registration\nroute registration -> doctor\nroute doctor -> home 0.6, walk 0.4\nroute walk -> lab\nroute lab -> home', tEnd: 600, warmup: 60 } },
    ],
    params: [
      P('model', 'code', 'source orders: interval = exponential(2)\nstation machine: servers = 1, time = exponential(1.6)\nsink done\nroute orders -> machine\nroute machine -> done', '모델', 'Model', { rows: 9 }),
      P('tEnd', 'number', 480, '모의 시간', 'Run length', { min: 0, step: 60 }),
      P('warmup', 'number', 0, '준비 시간 (처리량에서 뺌)', 'Warm-up (left out of throughput)', { min: 0 }),
      P('points', 'int', 400, '시계열 점 수', 'Timeline points', { min: 10 }),
      P('constants', 'text', '', '상수', 'Constants'),
      P('seed', 'int', 1, '난수 시드', 'Random seed', { min: 0 }),
    ],
  },
  {
    type: 'opt.minimize', cat: 'montecarlo', icon: '⥥', ko: '최적화', en: 'Optimisation',
    help: ['목적 함수를 최소화(최대화)합니다. 변수 "x: 하한 .. 상한 = 시작값", 제약 "g(x) <= 0". 넬더-미드, 차분 진화(전역), BFGS.', 'Minimises (or maximises) an objective. Variables "x: low .. high = start", constraints "g(x) <= 0". Nelder–Mead, differential evolution (global) or BFGS.'],
    inputs: [],
    presets: [
      { id: 'rosen', ko: '로젠브록 함수', en: 'Rosenbrock function', params: { variables: 'x: -2 .. 2 = -1.2\ny: -1 .. 3 = 1', objective: '(1 - x)^2 + 100*(y - x^2)^2', constraints: '', method: 'nelderMead', goal: 'minimize' } },
      { id: 'himmel', ko: '힘멜블라우 (여러 최솟값)', en: 'Himmelblau (several minima)', params: { variables: 'x: -5 .. 5 = 0\ny: -5 .. 5 = 0', objective: '(x^2 + y - 11)^2 + (x + y^2 - 7)^2', constraints: '', method: 'nelderMead', goal: 'minimize' } },
      { id: 'rastrigin', ko: '라스트리긴 (전역 탐색)', en: 'Rastrigin (global search)', params: { variables: 'x: -5.12 .. 5.12\ny: -5.12 .. 5.12', objective: '20 + x^2 - 10*cos(2*pi*x) + y^2 - 10*cos(2*pi*y)', constraints: '', method: 'de', goal: 'minimize' } },
      { id: 'can', ko: '캔 설계 (부피 제약)', en: 'Can design (volume constraint)', params: { variables: 'r: 1 .. 10 = 3\nh: 1 .. 30 = 10', objective: '2*pi*r^2 + 2*pi*r*h', constraints: 'pi*r^2*h = 330', method: 'nelderMead', goal: 'minimize' } },
      { id: 'profit', ko: '이익 최대화', en: 'Profit maximisation', params: { variables: 'p: 1 .. 50 = 10\nq: 0 .. 1000 = 100', objective: '(p - 4)*q - 0.01*q^2', constraints: 'q <= 800 - 15*p', method: 'de', goal: 'maximize' } },
    ],
    params: [P('objective', 'code', '(1 - x)^2 + 100*(y - x^2)^2', '목적 함수', 'Objective', { rows: 3 }), P('variables', 'code', 'x: -5 .. 5 = 1\ny: -5 .. 5 = 1', '변수 (하한 .. 상한 = 시작)', 'Variables (low .. high = start)', { rows: 3 }), P('constraints', 'code', '', '제약 조건', 'Constraints', { rows: 2, placeholder: 'x + y <= 1' }), P('goal', 'select', 'minimize', '목표', 'Goal', { options: [opt('minimize', '최소화', 'Minimise'), opt('maximize', '최대화', 'Maximise')] }), P('method', 'select', 'nelderMead', '방법', 'Method', { options: [opt('nelderMead', '넬더-미드', 'Nelder–Mead'), opt('de', '차분 진화 (전역)', 'Differential evolution (global)'), opt('bfgs', 'BFGS (기울기)', 'BFGS (gradient)')] }), P('maxIterations', 'int', 2000, '최대 반복', 'Max iterations', { min: 1 }), P('tolerance', 'number', 1e-10, '허용 오차', 'Tolerance', { min: 1e-16 }), P('constants', 'text', '', '상수', 'Constants'), P('logMap', 'bool', true, '목적 지도 로그 눈금', 'Log scale objective map'), P('seed', 'int', 1, '난수 시드', 'Random seed', { min: 0, show: (p) => p.method === 'de' })],
  },
  {
    type: 'opt.fit', cat: 'montecarlo', icon: '≈', ko: '곡선 맞춤 (비선형)', en: 'Curve fit (nonlinear)',
    help: ['임의의 모델식 y = f(x; 매개변수) 를 레벤버그-마쿼트로 데이터에 맞춥니다. 매개변수 값, 표준오차, 95% 구간, R².', 'Fits any model y = f(x; parameters) to the data by Levenberg–Marquardt: values, standard errors, 95 % intervals and R².'],
    inputs: IN,
    presets: [
      { id: 'decay', ko: '지수 감쇠', en: 'Exponential decay', params: { model: 'a*exp(-b*x) + c', parameters: 'a = 1, b = 1, c = 0' } },
      { id: 'logistic', ko: '로지스틱 성장', en: 'Logistic growth', params: { model: 'K/(1 + exp(-r*(x - x0)))', parameters: 'K = 1, r = 1, x0 = 0' } },
      { id: 'gauss', ko: '가우스 피크', en: 'Gaussian peak', params: { model: 'A*exp(-(x - mu)^2/(2*s^2)) + c', parameters: 'A = 1, mu = 0, s = 1, c = 0' } },
      { id: 'sine', ko: '감쇠 정현파', en: 'Damped sine', params: { model: 'A*exp(-z*x)*sin(w*x + p)', parameters: 'A = 1, z = 0.1, w = 1, p = 0' } },
      { id: 'michaelis', ko: '미카엘리스-멘텐', en: 'Michaelis–Menten', params: { model: 'Vmax*x/(Km + x)', parameters: 'Vmax = 1, Km = 1' } },
    ],
    params: [P('model', 'code', 'a*exp(-b*x)', '모델식', 'Model', { rows: 2 }), P('parameters', 'text', 'a = 1, b = 1', '매개변수 (시작값)', 'Parameters (start)'), P('x', 'column', '', 'x 열', 'x column'), P('y', 'column', '', 'y 열', 'y column'), P('variable', 'text', 'x', '식의 x 이름', 'Name of x in the model'), P('maxIterations', 'int', 200, '최대 반복', 'Max iterations', { min: 1 }), TABLE],
  },
  {
    type: 'opt.sweep', cat: 'montecarlo', icon: '⇶', ko: '매개변수 스윕', en: 'Parameter sweep',
    help: ['다른 노드의 매개변수를 바꿔 가며 파이프라인을 다시 실행하고, 측정 노드의 결과 값(또는 열의 집계)을 모읍니다. 두 매개변수면 지도가 됩니다.', 'Re-runs the pipeline with another node\'s parameter set to each value and collects a result value (or a column aggregate) of a metric node. Two parameters give a map.'],
    inputs: [],
    params: [P('node', 'node', '', '바꿀 노드', 'Node to vary'), P('param', 'param', '', '매개변수', 'Parameter', { nodeKey: 'node' }), P('from', 'number', 0, '시작', 'From'), P('to', 'number', 1, '끝', 'To'), P('steps', 'int', 11, '단계 수', 'Steps', { min: 1 }), P('log', 'bool', false, '로그 간격', 'Log spacing'), P('values', 'text', '', '값 목록 (쓰면 우선)', 'Value list (overrides)', { placeholder: '0.1, 0.2, 0.5' }),
      P('node2', 'node', '', '두 번째 노드 (선택)', 'Second node (optional)'), P('param2', 'param', '', '두 번째 매개변수', 'Second parameter', { nodeKey: 'node2', show: (p) => Boolean(p.node2) }), P('2from', 'number', 0, '두 번째 시작', 'Second from', { show: (p) => Boolean(p.node2) }), P('2to', 'number', 1, '두 번째 끝', 'Second to', { show: (p) => Boolean(p.node2) }), P('2steps', 'int', 5, '두 번째 단계 수', 'Second steps', { min: 1, show: (p) => Boolean(p.node2) }), P('2values', 'text', '', '두 번째 값 목록', 'Second value list', { show: (p) => Boolean(p.node2) }),
      P('metricNode', 'node', '', '측정 노드', 'Metric node'), P('metric', 'metric', '', '측정 값 또는 열', 'Metric value or column', { nodeKey: 'metricNode' }), P('aggregate', 'select', 'max', '열 집계', 'Column aggregate', { options: AGGREGATES })],
  },
  // ───────────────────────── integration
  {
    type: 'io.python', cat: 'integration', icon: '🐍', ko: 'Python 스크립트', en: 'Python script',
    help: ['설치된 Python 으로 코드를 실행합니다 (데스크톱). 입력 표는 data (열 이름 → 목록), 결과는 out 에 넣고, 값 하나는 result("이름", 값). NumPy·SciPy·PyTorch·pandas 도 설치돼 있으면 쓸 수 있습니다.', 'Runs code with the installed Python (desktop). The input table is data (column → list); put the output in out and single values with result("name", value). NumPy, SciPy, PyTorch or pandas work when installed.'],
    inputs: [{ port: 'in', ko: '입력 (선택)', en: 'Input (optional)', optional: true }],
    desktopOnly: true,
    presets: [
      { id: 'scale', ko: '열 변환 (순수 Python)', en: 'Transform a column (plain Python)', params: { code: "import math\nout['t'] = data['t']\nout['y2'] = [v * 2 + math.sin(v) for v in data['y']]\nresult('mean', sum(out['y2']) / len(out['y2']))" } },
      { id: 'numpy', ko: 'NumPy 이동 평균', en: 'NumPy moving average', params: { code: "import numpy as np\ny = np.array(data['y'])\nk = np.ones(25) / 25\nout['t'] = data['t']\nout['smooth'] = np.convolve(y, k, mode='same')\nresult('max', out['smooth'].max())" } },
      { id: 'scipy', ko: 'SciPy 최적화', en: 'SciPy optimisation', params: { code: "from scipy.optimize import minimize\nr = minimize(lambda p: (p[0] - 3)**2 + (p[1] + 1)**2, [0, 0])\nout['parameter'] = ['x', 'y']\nout['value'] = list(r.x)\nresult('fun', r.fun)" } },
      { id: 'pandas', ko: 'pandas 요약', en: 'pandas summary', params: { code: "import pandas as pd\ndf = pd.DataFrame(data)\nout = df.describe().reset_index()" } },
      { id: 'torch', ko: 'PyTorch 추론', en: 'PyTorch inference', params: { code: "import torch\nx = torch.tensor(data['t'], dtype=torch.float32).unsqueeze(1)\nmodel = torch.nn.Sequential(torch.nn.Linear(1, 8), torch.nn.Tanh(), torch.nn.Linear(8, 1))\nwith torch.no_grad():\n    y = model(x).squeeze(1)\nout['t'] = data['t']\nout['prediction'] = y.tolist()" } },
    ],
    params: [P('code', 'code', "out['t'] = data.get('t', [])\nout['y2'] = [v * 2 for v in data.get('y', [])]", '코드', 'Code', { rows: 10, language: 'python' }), P('interpreter', 'text', '', 'Python 경로 (비우면 자동)', 'Python path (empty = find)', { placeholder: 'python / py -3 / C:\\…\\python.exe' }), P('timeout', 'number', 60, '시간 제한', 'Time limit', { unit: 's', min: 1 }), TABLE],
  },
  {
    type: 'io.command', cat: 'integration', icon: '⌨', ko: '외부 프로그램', en: 'External program',
    help: ['명령줄 도구(상용 솔버의 배치 실행, 사내 도구)를 실행합니다 (데스크톱). 인자의 {in} 은 입력 CSV, {out} 은 결과 CSV 경로, {dir} 은 작업 폴더. {out} 이 없으면 표준 출력이 결과 표입니다.', 'Runs a command-line tool (a solver\'s batch mode, an in-house program) on the desktop. {in} in the arguments is the input CSV, {out} the result CSV, {dir} the work folder. Without {out} the standard output is the result table.'],
    inputs: [{ port: 'in', ko: '입력 (선택)', en: 'Input (optional)', optional: true }],
    desktopOnly: true,
    params: [P('program', 'file', '', '프로그램', 'Program'), P('arguments', 'text', '{in} {out}', '인자', 'Arguments'), P('timeout', 'number', 60, '시간 제한', 'Time limit', { unit: 's', min: 1 }), P('passThrough', 'bool', false, '결과 없으면 입력 전달', 'Pass the input on when there is no output'), P('tableName', 'text', 'output', '결과 표 이름', 'Result table name'), TABLE],
  },
  {
    type: 'io.readFile', cat: 'integration', icon: '📥', ko: '파일 읽기', en: 'Read file',
    help: ['CSV·TSV·JSON·Excel·WAV·STL·MAT·PNG 파일을 실행할 때마다 디스크에서 읽습니다 (데스크톱). 상대 경로는 파이프라인 파일 폴더 기준.', 'Reads a CSV, TSV, JSON, Excel, WAV, STL, MAT or PNG file from disk at every run (desktop). Relative paths start at the pipeline file\'s folder.'],
    inputs: [],
    desktopOnly: true,
    params: [P('path', 'file', '', '파일', 'File', { filters: ['csv', 'tsv', 'txt', 'json', 'xlsx', 'wav', 'stl', 'mat', 'png'] }), P('sheet', 'text', '', 'Excel 시트 (비우면 첫 시트)', 'Excel sheet (empty = the first)'), P('x', 'text', '', 'x 축 열', 'x-axis column')],
  },
  {
    type: 'io.writeFile', cat: 'integration', icon: '📤', ko: '파일 쓰기', en: 'Write file',
    help: ['입력 표를 CSV 또는 JSON 으로 저장하고 그대로 전달합니다 (데스크톱).', 'Saves the input table as CSV or JSON and passes it on (desktop).'],
    inputs: IN,
    desktopOnly: true,
    params: [P('path', 'file', 'output.csv', '파일', 'File', { save: true, filters: ['csv', 'json'] }), TABLE],
  },
  {
    type: 'io.myheat', cat: 'integration', icon: '🔥', ko: 'MyHeatManager 열 해석 (내장 엔진)', en: 'MyHeatManager heat study (built-in engine)',
    help: ['MyHeatManager 의 해석 엔진이 들어 있어, 다른 프로그램 없이 .myheat 모델(전도·대류 유동·상변화·열응력·전기 가열 …)을 풉니다(웹·데스크톱). 모델은 노드 안에 담거나(파일 고르기, .myheat 열기) 데스크톱에서는 경로로 읽습니다. 결과 필드(온도 T, 응력 vonMises, 유속 speed …)는 표와 열 지도로, 최고·최저 온도, 탐침 값, 에너지 수지, 물체·경계별 값은 결과 값과 표로 나옵니다.', 'MyHeatManager\'s solver is built in, so .myheat models (conduction, convective flow, phase change, thermal stress, electric heating …) run without any other program (web and desktop). Keep the model in the node (choose a file, or open a .myheat) or read it from a path on the desktop. The result field (temperature T, stress vonMises, flow speed …) comes back as a table and a heat map; the temperature range, probe values, energy balance and per-body and per-boundary values as results and tables.'],
    inputs: [],
    params: [
      P('content', 'blob', '', '모델 (.myheat, 노드에 담음)', 'Model (.myheat, kept in the node)'),
      P('model', 'file', '', '또는 모델 경로 (데스크톱)', 'Or a model path (desktop)', { filters: ['myheat'] }),
      P('field', 'select', 'T', '필드', 'Field', { options: [opt('T', '온도 T', 'Temperature T'), opt('vonMises', 'von Mises 응력', 'von Mises stress'), opt('speed', '유속', 'Flow speed'), opt('u', '유속 u', 'Velocity u'), opt('v', '유속 v', 'Velocity v'), opt('p', '압력', 'Pressure'), opt('qx', '열유속 qx', 'Heat flux qx'), opt('qy', '열유속 qy', 'Heat flux qy'), opt('liquid', '액상 분율', 'Liquid fraction')] }),
      P('frame', 'text', '', '프레임 (과도, 비우면 마지막)', 'Frame (transient, empty = last)'),
    ],
  },
  // ───────────────────────── output
  {
    type: 'out.plot', cat: 'output', icon: '📈', ko: '차트', en: 'Chart',
    help: ['대시보드에 보일 차트입니다. 종류, x·y 열, 로그 축, 제목을 정합니다.', 'A chart on the dashboard: type, x and y columns, log axes and title.'],
    inputs: IN,
    params: [P('title', 'text', '', '제목', 'Title'), P('chart', 'select', 'line', '종류', 'Type', { options: [opt('line', '선', 'Line'), opt('scatter', '산점도', 'Scatter'), opt('bar', '막대', 'Bar'), opt('area', '면적', 'Area'), opt('step', '계단', 'Step'), opt('heatmap', '열 지도 (격자)', 'Heat map (grid)'), opt('xy', 'x–y 궤적 (위상)', 'x–y trajectory (phase)'), opt('table', '표', 'Table')] }), P('x', 'column', '', 'x 열', 'x column'), P('y', 'columns', '', 'y 열 (여러 개)', 'y columns'), P('color', 'column', '', '색 구분 열 (산점도)', 'Colour-by column (scatter)', { show: (p) => p.chart === 'scatter' }), P('logX', 'bool', false, 'x 로그 눈금', 'Log x'), P('logY', 'bool', false, 'y 로그 눈금', 'Log y'), P('equal', 'bool', false, '같은 축 비율 (지도·도형)', 'Equal axis scales (maps, shapes)'), P('span', 'select', '1', '대시보드 폭', 'Dashboard width', { options: [opt('1', '1칸', '1 column'), opt('2', '2칸', '2 columns'), opt('3', '3칸 (전체)', '3 columns (full)')] }), TABLE],
  },
  {
    type: 'out.kpi', cat: 'output', icon: '🎯', ko: 'KPI 값', en: 'KPI value',
    help: ['결과 값 하나(또는 열의 집계)를 대시보드 타일로 보입니다. 범위를 벗어나면 경고 색.', 'Shows one result value (or a column aggregate) as a dashboard tile; out of range it turns to the alarm colour.'],
    inputs: IN,
    params: [P('label', 'text', 'KPI', '이름', 'Label'), P('source', 'metric', '', '결과 값 또는 열', 'Result value or column', { upstream: true }), P('aggregate', 'select', 'last', '열 집계', 'Column aggregate', { options: AGGREGATES }), P('scale', 'number', 1, '배율', 'Scale'), P('unit', 'text', '', '단위', 'Unit'), P('low', 'number', '', '하한 (경보)', 'Low limit (alarm)'), P('high', 'number', '', '상한 (경보)', 'High limit (alarm)'), TABLE],
  },
];

function TF_PRESETS() {
  return [
    { id: 'first', ko: '1차 지연 1/(2s+1)', en: 'First order 1/(2s+1)', params: { num: '1', den: '2, 1' } },
    { id: 'second', ko: '2차 (ζ = 0.3)', en: 'Second order (ζ = 0.3)', params: { num: '1', den: '1, 0.6, 1' } },
    { id: 'third', ko: '3차 1/(s+1)³', en: 'Third order 1/(s+1)³', params: { num: '1', den: '1, 3, 3, 1' } },
    { id: 'motor', ko: 'DC 모터 속도', en: 'DC motor speed', params: { num: '0.01', den: '0.005, 0.06, 0.1001' } },
    { id: 'leadlag', ko: '영점 있는 2차', en: 'Second order with a zero', params: { num: '0.5, 1', den: '1, 1.4, 1' } },
    { id: 'integrator', ko: '적분기 포함', en: 'With an integrator', params: { num: '1', den: '1, 1, 0' } },
  ];
}

export const NODE_MAP = Object.fromEntries(NODES.map((n) => [n.type, n]));

export function nodeSpec(type) {
  return NODE_MAP[type] ?? null;
}

export function nodeName(spec, lang) {
  return lang === 'en' ? spec.en : spec.ko;
}

export function nodeHelp(spec, lang) {
  return spec.help?.[lang === 'en' ? 1 : 0] ?? '';
}

export function portsOf(spec) {
  return spec.inputs.map((p) => p.port);
}

/** Default parameters of a node type. */
export function defaultParams(type) {
  const spec = nodeSpec(type);
  if (!spec) return {};
  const out = {};
  for (const p of spec.params) if (p.def !== '' && p.def !== undefined) out[p.key] = p.def;
  return out;
}

export function categoryOf(type) {
  return CATEGORIES[nodeSpec(type)?.cat] ?? CATEGORIES.output;
}

/** The node types of a category, in catalogue order. */
export function nodesIn(cat) {
  return NODES.filter((n) => n.cat === cat);
}
