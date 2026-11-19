// Starter data for the chart types that have no sample of their own: each table has the shape the type needs
// (low/high columns, source/target/value flows, start/end tasks, dates, raw measurements …) so a new chart of any
// of the 100 types draws something meaningful at once. Made-up but plausible; random parts are seeded.

const rng = (seed) => {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
};
const round = (v, d = 0) => Math.round(v * 10 ** d) / 10 ** d;
const normal = (seed, n, mean, sd, d = 1) => {
  const r = rng(seed);
  return Array.from({ length: n }, () => round(mean + sd * Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r()), d));
};
const K = (l, ko, en) => (l === 'ko' ? ko : en);
const MONTHS = { ko: ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'], en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] };
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const day = 86400000;

/** Columns of measurements (one column per group), e.g. for violin, strip, density and ECDF. */
const measurements = (l) => {
  const a = normal(11, 40, 172, 6);
  const b = normal(12, 40, 160, 5.5);
  const c = normal(13, 40, 166, 8);
  return { columns: [K(l, '1반', 'Class 1'), K(l, '2반', 'Class 2'), K(l, '3반', 'Class 3')], rows: a.map((v, i) => [v, b[i], c[i]]), title: K(l, '반별 키 분포 (cm)', 'Height by class (cm)') };
};
const flows = (l) => ({
  title: K(l, '부서 간 협업 건수', 'Collaboration between teams'),
  columns: [K(l, '출발', 'From'), K(l, '도착', 'To'), K(l, '건수', 'Count')],
  rows: (l === 'ko'
    ? [['기획', '개발', 42], ['기획', '디자인', 25], ['디자인', '개발', 31], ['개발', 'QA', 38], ['QA', '개발', 17], ['영업', '기획', 22], ['영업', '지원', 14], ['지원', '개발', 9], ['개발', '운영', 26], ['운영', '지원', 12]]
    : [['Planning', 'Dev', 42], ['Planning', 'Design', 25], ['Design', 'Dev', 31], ['Dev', 'QA', 38], ['QA', 'Dev', 17], ['Sales', 'Planning', 22], ['Sales', 'Support', 14], ['Support', 'Dev', 9], ['Dev', 'Ops', 26], ['Ops', 'Support', 12]]),
});
const hierarchyTable = (l) => ({
  title: K(l, '사업부별 매출 구성', 'Revenue by division'),
  columns: [K(l, '사업부', 'Division'), K(l, '제품', 'Product'), K(l, '매출', 'Revenue')],
  rows: (l === 'ko'
    ? [['가전', 'TV', 48], ['가전', '냉장고', 36], ['가전', '세탁기', 22], ['모바일', '스마트폰', 64], ['모바일', '태블릿', 18], ['모바일', '워치', 11], ['부품', '디스플레이', 29], ['부품', '배터리', 17]]
    : [['Home', 'TV', 48], ['Home', 'Fridge', 36], ['Home', 'Washer', 22], ['Mobile', 'Phone', 64], ['Mobile', 'Tablet', 18], ['Mobile', 'Watch', 11], ['Parts', 'Display', 29], ['Parts', 'Battery', 17]]),
});
const prices = (n = 30) => {
  const r = rng(7);
  let p = 100;
  return Array.from({ length: n }, (_, i) => {
    const open = p;
    const close = round(open * (1 + (r() - 0.48) * 0.05), 2);
    const high = round(Math.max(open, close) * (1 + r() * 0.02), 2);
    const low = round(Math.min(open, close) * (1 - r() * 0.02), 2);
    p = close;
    return [iso(Date.UTC(2025, 2, 3) + i * day), round(open, 2), high, low, close];
  });
};
const shares = (l) => ({
  columns: [K(l, '항목', 'Item'), K(l, '값', 'Value')],
  rows: (l === 'ko' ? [['A안', 38], ['B안', 27], ['C안', 18], ['D안', 11], ['기타', 6]] : [['Plan A', 38], ['Plan B', 27], ['Plan C', 18], ['Plan D', 11], ['Other', 6]]),
});
const kpis = (l) => ({
  title: K(l, '이번 달 핵심 지표', 'Key figures this month'),
  columns: [K(l, '지표', 'Measure'), K(l, '값', 'Value')],
  rows: (l === 'ko' ? [['방문자', 48210], ['가입자', 3120], ['주문', 1874], ['매출(만 원)', 9320], ['반품', 61], ['만족도', 87]] : [['Visitors', 48210], ['Sign-ups', 3120], ['Orders', 1874], ['Revenue (k)', 9320], ['Returns', 61], ['Satisfaction', 87]]),
});
const percents = (l) => ({
  title: K(l, '목표 달성률 (%)', 'Goal completion (%)'),
  columns: [K(l, '목표', 'Goal'), K(l, '달성률', 'Done')],
  rows: (l === 'ko' ? [['매출', 86], ['신규 고객', 72], ['재구매', 58], ['교육 이수', 94]] : [['Revenue', 86], ['New customers', 72], ['Repeat buys', 58], ['Training', 94]]),
  options: { gaugeMax: 100 },
});

/** type id → (language) => { columns, rows, title?, subtitle?, options?, mapping? } */
export const STARTERS = {
  dumbbell: (l) => ({ title: K(l, '지역별 만족도 변화', 'Satisfaction by region'), columns: [K(l, '지역', 'Region'), '2024', '2025'], rows: (l === 'ko' ? ['서울', '부산', '대구', '인천', '광주', '대전'] : ['Seoul', 'Busan', 'Daegu', 'Incheon', 'Gwangju', 'Daejeon']).map((r, i) => [r, 62 + i * 3, 70 + ((i * 7) % 11)]) }),
  rangeColumn: (l) => ({ title: K(l, '월별 기온 범위 (°C)', 'Monthly temperature range (°C)'), columns: [K(l, '월', 'Month'), K(l, '최저', 'Low'), K(l, '최고', 'High')], rows: MONTHS[l].map((m, i) => { const t = 12 - 13 * Math.cos(((i + 0.5) / 12) * Math.PI * 2); return [m, round(t - 6), round(t + 5)]; }), options: { suffix: '°' } }),
  bullet: (l) => ({ title: K(l, '분기 실적 대비 목표 (억 원)', 'Results against targets (bn)'), columns: [K(l, '사업부', 'Division'), K(l, '실적', 'Actual'), K(l, '목표', 'Target')], rows: (l === 'ko' ? [['가전', 270, 250], ['모바일', 210, 240], ['부품', 150, 160], ['서비스', 95, 80]] : [['Home', 270, 250], ['Mobile', 210, 240], ['Parts', 150, 160], ['Services', 95, 80]]) }),
  roundedColumn: (l) => ({ title: K(l, '분기별 신규 고객', 'New customers by quarter'), columns: [K(l, '분기', 'Quarter'), K(l, '신규 고객', 'New customers')], rows: [['Q1', 1240], ['Q2', 1580], ['Q3', 1420], ['Q4', 1910]], options: { legend: 'none', dataLabels: true } }),
  connectedScatter: (l) => ({ title: K(l, '실업률과 물가 상승률 (2012–2025)', 'Unemployment and inflation 2012–2025'), columns: [K(l, '실업률(%)', 'Unemployment (%)'), K(l, '물가 상승률(%)', 'Inflation (%)'), K(l, '연도', 'Year')], rows: [[3.2, 2.2], [3.1, 1.3], [3.5, 1.3], [3.6, 0.7], [3.7, 1.0], [3.7, 1.9], [3.8, 1.5], [3.8, 0.4], [4.0, 0.5], [3.7, 2.5], [2.9, 5.1], [2.7, 3.6], [2.8, 2.3], [2.6, 1.9]].map((r, i) => [...r, String(2012 + i)]), options: { beginAtZero: false, markers: true, dataLabels: true } }),
  scatterMatrix: (l) => STARTERS.correlation(l),
  progressBars: (l) => ({ ...percents(l), title: K(l, '프로젝트 진행률', 'Project progress') }),
  butterfly: (l) => ({ title: K(l, '연령별 인구 (천 명)', 'Population by age (thousands)'), columns: [K(l, '연령', 'Age'), K(l, '남성', 'Men'), K(l, '여성', 'Women')], rows: ['0–9', '10–19', '20–29', '30–39', '40–49', '50–59', '60–69', '70+'].map((a, i) => [a, round(180 + i * 40 - i * i * 6), round(170 + i * 42 - i * i * 5.2)]) }),
  pareto: (l) => ({ title: K(l, '불량 원인 분석', 'Causes of defects'), columns: [K(l, '원인', 'Cause'), K(l, '건수', 'Count')], rows: (l === 'ko' ? [['치수 불량', 86], ['긁힘', 54], ['오염', 31], ['조립 누락', 18], ['색상', 9], ['기타', 6]] : [['Size', 86], ['Scratch', 54], ['Dirt', 31], ['Missing part', 18], ['Colour', 9], ['Other', 6]]) }),
  marimekko: (l) => ({ title: K(l, '시장별 제품 구성', 'Products in each market'), columns: [K(l, '시장', 'Market'), K(l, '저가', 'Budget'), K(l, '중가', 'Mid'), K(l, '고가', 'Premium')], rows: (l === 'ko' ? ['국내', '북미', '유럽', '아시아'] : ['Home', 'Americas', 'Europe', 'Asia']).map((m, i) => [m, 30 + i * 8, 40 - i * 3, 20 + (i % 2) * 15]) }),
  radialBar: (l) => ({ ...percents(l), title: K(l, '부서별 목표 달성률', 'Goal completion by team') }),
  radialColumn: (l) => ({ title: K(l, '월별 판매량', 'Units sold by month'), columns: [K(l, '월', 'Month'), K(l, '온라인', 'Online'), K(l, '매장', 'Store')], rows: MONTHS[l].map((m, i) => [m, round(40 + 20 * Math.sin(i / 2)), round(30 + 12 * Math.cos(i / 3))]) }),
  smallMultiples: (l) => ({ title: K(l, '지점별 월 매출', 'Monthly sales by branch'), columns: [K(l, '월', 'Month'), K(l, '강남', 'North'), K(l, '종로', 'South'), K(l, '분당', 'East'), K(l, '일산', 'West')], rows: MONTHS[l].slice(0, 8).map((m, i) => [m, 40 + i * 4, 55 - i * 2, 30 + (i % 3) * 8, 45 + Math.round(Math.sin(i) * 9)]) }),
  meanError: (l) => ({ ...measurements(l), title: K(l, '반별 평균 키 ± 표준편차', 'Mean height ± SD by class'), options: { beginAtZero: false } }),
  streamgraph: (l) => ({ title: K(l, '장르별 스트리밍 비중', 'Streams by genre'), columns: [K(l, '월', 'Month'), K(l, '팝', 'Pop'), K(l, '힙합', 'Hip-hop'), K(l, '록', 'Rock'), K(l, '재즈', 'Jazz')], rows: MONTHS[l].map((m, i) => [m, round(40 + 15 * Math.sin(i / 2)), round(30 + 12 * Math.cos(i / 3)), round(25 - i), round(8 + (i % 4) * 2)]) }),
  rangeArea: (l) => ({ ...STARTERS.rangeColumn(l) }),
  slope: (l) => ({ title: K(l, '정당 지지율 변화 (%)', 'Party support (%)'), columns: [K(l, '정당', 'Party'), K(l, '작년', 'Last year'), K(l, '올해', 'This year')], rows: (l === 'ko' ? [['가당', 34], ['나당', 29], ['다당', 12], ['라당', 8], ['무당층', 17]] : [['Party A', 34], ['Party B', 29], ['Party C', 12], ['Party D', 8], ['Undecided', 17]]).map(([p, v], i) => [p, v, v + [-4, 5, 2, -1, -2][i]]) }),
  bump: (l) => ({ title: K(l, '브랜드 순위 변화', 'Brand rankings'), columns: [K(l, '연도', 'Year'), 'Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo'], rows: ['2020', '2021', '2022', '2023', '2024', '2025'].map((y, i) => [y, 50 - i * 3, 40 + i * 2, 45 + ((i * 7) % 9) - 4, 30 + i * 4, 35 - (i % 3) * 3]) }),
  sparklines: (l) => ({ title: K(l, '종목별 주가 추이', 'Share prices'), columns: [K(l, '일', 'Day'), 'Alpha', 'Bravo', 'Charlie', 'Delta'], rows: Array.from({ length: 20 }, (_, i) => [String(i + 1), round(100 + i * 1.2 + Math.sin(i) * 4, 1), round(80 - i * 0.6 + Math.cos(i / 2) * 5, 1), round(55 + Math.sin(i / 3) * 8, 1), round(120 + (i % 5) * 3 - i * 0.4, 1)]) }),
  nestedDonut: (l) => ({ title: K(l, '연도별 매출 구성', 'Revenue mix by year'), columns: [K(l, '제품', 'Product'), '2023', '2024', '2025'], rows: (l === 'ko' ? ['가전', '모바일', '부품', '서비스'] : ['Home', 'Mobile', 'Parts', 'Services']).map((p, i) => [p, 30 + i * 4, 28 + i * 6, 25 + i * 8]) }),
  icicle: hierarchyTable,
  packedCircles: hierarchyTable,
  tree: hierarchyTable,
  waffle: (l) => ({ ...shares(l), title: K(l, '선호도 조사 (%)', 'Preference poll (%)') }),
  parliament: (l) => ({ title: K(l, '의석 분포', 'Seats'), columns: [K(l, '정당', 'Party'), K(l, '의석', 'Seats')], rows: (l === 'ko' ? [['가당', 142], ['나당', 108], ['다당', 24], ['라당', 15], ['무소속', 11]] : [['Party A', 142], ['Party B', 108], ['Party C', 24], ['Party D', 15], ['Independent', 11]]) }),
  wordCloud: (l) => ({ title: K(l, '고객 의견 키워드', 'Words in customer feedback'), columns: [K(l, '단어', 'Word'), K(l, '빈도', 'Count')], rows: (l === 'ko' ? ['배송', '가격', '품질', '친절', '포장', '디자인', '색상', '크기', '교환', '환불', '재구매', '추천', '빠름', '튼튼', '가벼움', '편리', '소음', '배터리', '설명서', '할인'] : ['delivery', 'price', 'quality', 'friendly', 'packing', 'design', 'colour', 'size', 'exchange', 'refund', 'rebuy', 'recommend', 'fast', 'sturdy', 'light', 'handy', 'noise', 'battery', 'manual', 'discount']).map((w, i) => [w, Math.round(120 / (i + 1) + 6)]) }),
  activityRings: (l) => ({ title: K(l, '오늘의 활동', 'Today\'s activity'), columns: [K(l, '활동', 'Activity'), K(l, '달성률', 'Done (%)')], rows: (l === 'ko' ? [['움직이기', 82], ['운동하기', 64], ['일어서기', 100]] : [['Move', 82], ['Exercise', 64], ['Stand', 100]]), options: { gaugeMax: 100 } }),
  violin: measurements,
  ridgeline: (l) => { const cols = MONTHS[l].slice(0, 6); const data = cols.map((_, k) => normal(30 + k, 30, -2 + k * 4.5, 3 + (k % 3))); return { title: K(l, '월별 일 최고 기온 분포 (°C)', 'Daily highs by month (°C)'), columns: cols, rows: data[0].map((_, i) => data.map((d) => d[i])) }; },
  dotHistogram: (l) => { const m = measurements(l); return { ...m, title: K(l, '1반 키 분포 (cm)', 'Height in class 1 (cm)'), columns: [m.columns[0]], rows: m.rows.map((r) => [r[0]]) }; },
  stripPlot: measurements,
  density: measurements,
  ecdf: measurements,
  punchCard: (l) => ({ title: K(l, '요일·시간대별 주문', 'Orders by weekday and hour'), columns: [K(l, '요일', 'Day'), '9', '12', '15', '18', '21'], rows: (l === 'ko' ? ['월', '화', '수', '목', '금', '토', '일'] : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']).map((d, i) => [d, 10 + i * 2, 30 + (i % 3) * 8, 18 + i, 25 + (i > 4 ? 20 : 0), 12 + (i > 3 ? 15 : 3)]) }),
  correlation: (l) => {
    const r = rng(21);
    const rows = Array.from({ length: 40 }, () => { const study = round(1 + r() * 9, 1); const sleep = round(9 - study * 0.3 + r() * 2, 1); const score = round(40 + study * 5 + sleep * 1.5 + r() * 10); const phone = round(6 - study * 0.4 + r() * 2, 1); return [study, sleep, score, phone]; });
    return { title: K(l, '생활 습관과 점수의 상관', 'Habits and scores'), columns: [K(l, '공부(시간)', 'Study (h)'), K(l, '수면(시간)', 'Sleep (h)'), K(l, '점수', 'Score'), K(l, '휴대폰(시간)', 'Phone (h)')], rows };
  },
  calendarHeatmap: (l) => {
    const r = rng(5);
    const start = Date.UTC(2025, 0, 1);
    return { title: K(l, '일별 커밋 수', 'Commits per day'), columns: [K(l, '날짜', 'Date'), K(l, '커밋', 'Commits')], rows: Array.from({ length: 182 }, (_, i) => { const dow = new Date(start + i * day).getUTCDay(); return [iso(start + i * day), Math.round((dow === 0 || dow === 6 ? 1 : 6) * r() * (1 + Math.sin(i / 20)))]; }) };
  },
  chord: flows,
  arcDiagram: flows,
  network: flows,
  priceBand: (l) => ({ title: K(l, '일별 주가 범위', 'Daily price range'), columns: [K(l, '날짜', 'Date'), K(l, '시가', 'Open'), K(l, '고가', 'High'), K(l, '저가', 'Low'), K(l, '종가', 'Close')], rows: prices(), options: { beginAtZero: false } }),
  bollinger: (l) => ({ title: K(l, '볼린저 밴드 (5일)', 'Bollinger bands (5 days)'), columns: [K(l, '날짜', 'Date'), K(l, '종가', 'Close')], rows: prices(40).map((p) => [p[0], p[4]]), options: { beginAtZero: false, movingAverage: 5, legend: 'none' } }),
  gantt: (l) => {
    const s = Date.UTC(2025, 2, 3);
    const tasks = l === 'ko' ? [['요구 분석', 0, 8, '기획'], ['화면 설계', 6, 16, '디자인'], ['API 개발', 12, 30, '개발'], ['앱 개발', 16, 36, '개발'], ['테스트', 32, 44, 'QA'], ['출시', 44, 47, '운영']] : [['Requirements', 0, 8, 'Planning'], ['UI design', 6, 16, 'Design'], ['API', 12, 30, 'Dev'], ['App', 16, 36, 'Dev'], ['Testing', 32, 44, 'QA'], ['Launch', 44, 47, 'Ops']];
    return { title: K(l, '프로젝트 일정', 'Project schedule'), columns: [K(l, '작업', 'Task'), K(l, '시작', 'Start'), K(l, '끝', 'End'), K(l, '담당', 'Team')], rows: tasks.map(([t, a, b, g]) => [t, iso(s + a * day), iso(s + b * day), g]), options: { legend: 'none' } };
  },
  timeline: (l) => ({ title: K(l, '회사 연혁', 'Company history'), columns: [K(l, '날짜', 'Date'), K(l, '사건', 'Event')], rows: (l === 'ko' ? [['2015-03-01', '창업'], ['2017-06-15', '첫 제품 출시'], ['2019-11-20', '시리즈 A 투자'], ['2021-04-05', '해외 진출'], ['2023-09-12', '사용자 100만'], ['2025-02-28', '상장']] : [['2015-03-01', 'Founded'], ['2017-06-15', 'First product'], ['2019-11-20', 'Series A'], ['2021-04-05', 'Went abroad'], ['2023-09-12', '1M users'], ['2025-02-28', 'IPO']]) }),
  gaugeGrid: (l) => ({ ...percents(l), title: K(l, '설비 가동률 (%)', 'Machine utilisation (%)') }),
  linearGauge: (l) => ({ ...percents(l), title: K(l, '서버 자원 사용률 (%)', 'Server load (%)'), rows: (l === 'ko' ? [['CPU', 64], ['메모리', 78], ['디스크', 91]] : [['CPU', 64], ['Memory', 78], ['Disk', 91]]) }),
  bigNumber: kpis,
  iconArray: (l) => ({ ...shares(l), title: K(l, '100명 중 응답', 'Answers of 100 people') }),
  dotPlot: (l) => ({ title: K(l, '국가별 기대 수명', 'Life expectancy'), columns: [K(l, '국가', 'Country'), K(l, '기대 수명', 'Years')], rows: (l === 'ko' ? [['일본', 84.5], ['한국', 83.6], ['스페인', 83.2], ['호주', 83.0], ['프랑스', 82.5], ['독일', 81.0], ['미국', 77.5]] : [['Japan', 84.5], ['Korea', 83.6], ['Spain', 83.2], ['Australia', 83.0], ['France', 82.5], ['Germany', 81.0], ['USA', 77.5]]), options: { beginAtZero: false, legend: 'none' } }),
  divergingBar: (l) => ({ title: K(l, '부서별 예산 증감 (%)', 'Budget change by team (%)'), columns: [K(l, '부서', 'Team'), K(l, '증감', 'Change')], rows: (l === 'ko' ? [['연구', 12], ['영업', -6], ['마케팅', 8], ['생산', -11], ['관리', 3], ['지원', -2]] : [['R&D', 12], ['Sales', -6], ['Marketing', 8], ['Production', -11], ['Admin', 3], ['Support', -2]]), options: { legend: 'none', dataLabels: true } }),
  cumulativeLine: (l) => ({ title: K(l, '누적 가입자', 'Cumulative sign-ups'), columns: [K(l, '월', 'Month'), K(l, '가입', 'Sign-ups')], rows: MONTHS[l].map((m, i) => [m, 120 + i * 15 + Math.round(Math.sin(i) * 30)]) }),
  movingAverage: (l) => ({ title: K(l, '일별 방문자와 3일 이동 평균', 'Visitors and 3-day average'), columns: [K(l, '일', 'Day'), K(l, '방문자', 'Visitors')], rows: Array.from({ length: 21 }, (_, i) => [String(i + 1), Math.round(800 + i * 12 + Math.sin(i * 1.7) * 160)]) }),
};
