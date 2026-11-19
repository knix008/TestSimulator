// Sample charts (start page, File › Samples, `npm run samples` writes them to samples/*.mychart) and the starter
// data a new chart of each type opens with. Data is made up but plausible; random parts are seeded so a sample
// looks the same every time.
import { createTable } from '../data/table.js';
import { baseType, CHART_TYPES } from './types.js';
import { STARTERS } from './starters.js';

const rng = (seed) => {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
};
const round = (v, d = 0) => Math.round(v * 10 ** d) / 10 ** d;
/** Normally distributed values (Box–Muller), seeded. */
const normal = (seed, n, mean, sd, d = 1) => {
  const r = rng(seed);
  return Array.from({ length: n }, () => round(mean + sd * Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r()), d));
};

const MONTHS = { ko: ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'], en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] };
const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'];

/** [id, group, type, ko [name, description], en [name, description], (lang) => { columns, rows, title, subtitle, options, mapping }] */
const LIST = [
  ['monthly-sales', 'business', 'column', ['월별 매출', '세 제품군의 월별 매출 비교'], ['Monthly sales', 'Three product lines month by month'], (l) => ({
    title: l === 'ko' ? '2025년 월별 매출' : 'Monthly sales 2025', subtitle: l === 'ko' ? '단위: 백만 원' : 'Million KRW',
    columns: [l === 'ko' ? '월' : 'Month', l === 'ko' ? '가전' : 'Appliances', l === 'ko' ? '모바일' : 'Mobile', l === 'ko' ? '액세서리' : 'Accessories'],
    rows: MONTHS[l].map((m, i) => [m, round(120 + i * 6 + Math.sin(i) * 18), round(90 + i * 9 + Math.cos(i * 1.3) * 22), round(35 + i * 2 + Math.sin(i * 2) * 8)]),
  })],
  ['market-share', 'business', 'pie', ['시장 점유율', '스마트폰 제조사 점유율'], ['Market share', 'Smartphone makers'], (l) => ({
    title: l === 'ko' ? '스마트폰 시장 점유율' : 'Smartphone market share', options: { dataLabels: true, legend: 'right' },
    columns: [l === 'ko' ? '제조사' : 'Maker', l === 'ko' ? '점유율(%)' : 'Share (%)'],
    rows: [['Alpha', 28.4], ['Bravo', 23.1], ['Charlie', 13.7], ['Delta', 9.8], ['Echo', 8.2], [l === 'ko' ? '기타' : 'Others', 16.8]],
  })],
  ['budget-donut', 'business', 'donut', ['예산 구성', '부서별 연간 예산'], ['Budget split', 'Annual budget by department'], (l) => ({
    title: l === 'ko' ? '부서별 예산' : 'Budget by department', options: { dataLabels: true, legend: 'right' },
    columns: [l === 'ko' ? '부서' : 'Department', l === 'ko' ? '예산(억 원)' : 'Budget (bn KRW)'],
    rows: l === 'ko' ? [['연구개발', 42], ['영업', 28], ['마케팅', 19], ['생산', 35], ['관리', 12]] : [['R&D', 42], ['Sales', 28], ['Marketing', 19], ['Production', 35], ['Admin', 12]],
  })],
  ['regional-bars', 'business', 'bar', ['지역별 실적', '긴 지역 이름을 가로 막대로'], ['Sales by region', 'Long names on horizontal bars'], (l) => ({
    title: l === 'ko' ? '지역별 매출 순위' : 'Sales by region', options: { sort: 'desc', dataLabels: true, legend: 'none' },
    columns: [l === 'ko' ? '지역' : 'Region', l === 'ko' ? '매출' : 'Sales'],
    rows: (l === 'ko' ? ['서울특별시', '경기도', '부산광역시', '인천광역시', '대구광역시', '대전광역시', '광주광역시', '울산광역시', '세종특별자치시', '제주특별자치도'] : ['Seoul', 'Gyeonggi', 'Busan', 'Incheon', 'Daegu', 'Daejeon', 'Gwangju', 'Ulsan', 'Sejong', 'Jeju']).map((n, i) => [n, round(980 / (i + 1.2) + 40)]),
  })],
  ['quarterly-stacked', 'business', 'stackedColumn', ['분기별 채널 매출', '분기마다 판매 채널 구성'], ['Quarterly channels', 'Sales channels per quarter'], (l) => ({
    title: l === 'ko' ? '분기별 판매 채널' : 'Sales by channel', options: { dataLabels: true },
    columns: [l === 'ko' ? '분기' : 'Quarter', l === 'ko' ? '온라인' : 'Online', l === 'ko' ? '매장' : 'Stores', l === 'ko' ? '도매' : 'Wholesale'],
    rows: QUARTERS.map((q, i) => [q, 120 + i * 25, 210 - i * 12, 80 + (i % 2) * 15]),
  })],
  ['survey-percent', 'business', 'percentBar', ['설문 응답 비율', '문항별 만족도 100% 누적'], ['Survey answers', 'Satisfaction per question, 100% stacked'], (l) => ({
    title: l === 'ko' ? '고객 만족도 조사' : 'Customer survey', options: { dataLabels: true, palette: 'sunset' },
    columns: [l === 'ko' ? '문항' : 'Question', l === 'ko' ? '매우 불만' : 'Very unhappy', l === 'ko' ? '불만' : 'Unhappy', l === 'ko' ? '보통' : 'Neutral', l === 'ko' ? '만족' : 'Happy', l === 'ko' ? '매우 만족' : 'Very happy'],
    rows: (l === 'ko' ? ['가격', '품질', '배송', '상담', '앱 사용성'] : ['Price', 'Quality', 'Delivery', 'Support', 'App']).map((q, i) => [q, 5 + i, 12 + (i % 3) * 3, 25 - i, 38 + i * 2, 20 - i]),
  })],
  ['revenue-profit-combo', 'business', 'combo', ['매출과 이익률', '막대(매출)와 선(이익률), 보조 축'], ['Revenue and margin', 'Bars and a line on a second axis'], (l) => ({
    title: l === 'ko' ? '매출과 영업이익률' : 'Revenue and operating margin', options: { secondAxis: true, yTitle: l === 'ko' ? '매출(억 원)' : 'Revenue', y2Title: l === 'ko' ? '이익률(%)' : 'Margin (%)' },
    columns: [l === 'ko' ? '연도' : 'Year', l === 'ko' ? '매출' : 'Revenue', l === 'ko' ? '이익률' : 'Margin'],
    rows: [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025].map((y, i) => [String(y), round(320 + i * 48 + (i === 2 ? -60 : 0)), round(8 + i * 0.9 + (i === 2 ? -4 : 0), 1)]),
  })],
  ['profit-waterfall', 'business', 'waterfall', ['손익 브리지', '매출에서 순이익까지'], ['Profit bridge', 'From revenue to net income'], (l) => ({
    title: l === 'ko' ? '손익 구조 (억 원)' : 'Profit bridge (bn KRW)', options: { dataLabels: true },
    columns: [l === 'ko' ? '항목' : 'Item', l === 'ko' ? '금액' : 'Amount'],
    rows: l === 'ko' ? [['매출', 500], ['매출원가', -280], ['판관비', -95], ['기타수익', 18], ['이자비용', -12], ['법인세', -30]] : [['Revenue', 500], ['Cost of sales', -280], ['SG&A', -95], ['Other income', 18], ['Interest', -12], ['Tax', -30]],
  })],
  ['sales-funnel', 'business', 'funnel', ['영업 깔때기', '방문에서 구매까지'], ['Sales funnel', 'From visit to purchase'], (l) => ({
    title: l === 'ko' ? '구매 전환 깔때기' : 'Conversion funnel', options: { legend: 'none' },
    columns: [l === 'ko' ? '단계' : 'Stage', l === 'ko' ? '사용자 수' : 'Users'],
    rows: l === 'ko' ? [['방문', 12000], ['상품 조회', 7400], ['장바구니', 3100], ['결제 시작', 1800], ['구매 완료', 1240]] : [['Visit', 12000], ['Product view', 7400], ['Cart', 3100], ['Checkout', 1800], ['Purchase', 1240]],
  })],
  ['kpi-gauge', 'business', 'gauge', ['목표 달성률', '올해 목표 대비 실적'], ['Goal progress', 'This year against the target'], (l) => ({
    title: l === 'ko' ? '연간 목표 달성률' : 'Annual goal', options: { gaugeMin: 0, gaugeMax: 100, suffix: '%', legend: 'none' },
    columns: [l === 'ko' ? '지표' : 'Measure', l === 'ko' ? '달성률' : 'Progress'],
    rows: [[l === 'ko' ? '달성률' : 'Progress', 72.5]],
  })],
  ['temperature-line', 'science', 'line', ['도시별 기온', '세 도시의 월평균 기온'], ['City temperatures', 'Monthly mean temperature in three cities'], (l) => ({
    title: l === 'ko' ? '월평균 기온 (°C)' : 'Mean temperature (°C)', options: { suffix: '°', beginAtZero: false },
    columns: [l === 'ko' ? '월' : 'Month', l === 'ko' ? '서울' : 'Seoul', l === 'ko' ? '부산' : 'Busan', l === 'ko' ? '제주' : 'Jeju'],
    rows: MONTHS[l].map((m, i) => { const s = Math.sin(((i - 3) / 12) * Math.PI * 2); return [m, round(12.5 + 14 * s, 1), round(15 + 10.5 * s, 1), round(16.5 + 9 * s, 1)]; }),
  })],
  ['population-area', 'society', 'stackedArea', ['연령대 인구', '연도별 연령대 구성'], ['Population by age', 'Age groups over the years'], (l) => ({
    title: l === 'ko' ? '연령대별 인구 (백만 명)' : 'Population by age (millions)',
    columns: [l === 'ko' ? '연도' : 'Year', l === 'ko' ? '0–14세' : '0–14', l === 'ko' ? '15–64세' : '15–64', l === 'ko' ? '65세 이상' : '65+'],
    rows: [1990, 1995, 2000, 2005, 2010, 2015, 2020, 2025].map((y, i) => [String(y), round(10.9 - i * 0.62, 1), round(29.7 + i * 0.95 - (i > 5 ? (i - 5) * 1.4 : 0), 1), round(2.2 + i * 0.75 + (i > 4 ? (i - 4) * 0.55 : 0), 1)]),
  })],
  ['energy-mix', 'science', 'percentArea', ['발전원 구성', '에너지원별 발전 비중 변화'], ['Energy mix', 'Share of each power source'], (l) => ({
    title: l === 'ko' ? '발전원별 비중' : 'Power generation mix', options: { palette: 'earth' },
    columns: [l === 'ko' ? '연도' : 'Year', l === 'ko' ? '석탄' : 'Coal', l === 'ko' ? '가스' : 'Gas', l === 'ko' ? '원자력' : 'Nuclear', l === 'ko' ? '재생에너지' : 'Renewables'],
    rows: [2010, 2013, 2016, 2019, 2022, 2025].map((y, i) => [String(y), 44 - i * 3.5, 22 + i * 0.8, 30 - i * 0.5, 4 + i * 3.4]),
  })],
  ['website-traffic', 'business', 'spline', ['웹 방문자', '주간 방문자 추세'], ['Website visits', 'Weekly visitors'], (l) => {
    const r = rng(7);
    return {
      title: l === 'ko' ? '주간 방문자 수' : 'Weekly visitors', options: { markers: false, trendline: true },
      columns: [l === 'ko' ? '주' : 'Week', l === 'ko' ? '방문자' : 'Visitors'],
      rows: Array.from({ length: 26 }, (_, i) => [`W${i + 1}`, round(4200 + i * 95 + r() * 900)]),
    };
  }],
  ['interest-steps', 'finance', 'stepLine', ['기준금리', '기준금리 변동'], ['Policy rate', 'Changes of the policy rate'], (l) => ({
    title: l === 'ko' ? '기준금리 (%)' : 'Policy rate (%)', options: { suffix: '%', beginAtZero: true, markers: false },
    columns: [l === 'ko' ? '날짜' : 'Date', l === 'ko' ? '금리' : 'Rate'],
    rows: [['2021-01', 0.5], ['2021-08', 0.75], ['2021-11', 1], ['2022-01', 1.25], ['2022-04', 1.5], ['2022-07', 2.25], ['2022-10', 3], ['2023-01', 3.5], ['2024-10', 3.25], ['2024-11', 3], ['2025-02', 2.75], ['2025-05', 2.5]],
  })],
  ['stock-candles', 'finance', 'candlestick', ['주가 차트', '30일 시가·고가·저가·종가'], ['Stock prices', '30 days of open, high, low, close'], () => {
    const r = rng(42);
    let price = 52000;
    const rows = [];
    for (let i = 0; i < 30; i++) {
      const open = price;
      const close = round(open * (1 + (r() - 0.48) * 0.05), -2);
      const high = round(Math.max(open, close) * (1 + r() * 0.02), -2);
      const low = round(Math.min(open, close) * (1 - r() * 0.02), -2);
      const day = new Date(Date.UTC(2025, 8, 1 + i));
      rows.push([day.toISOString().slice(5, 10), open, high, low, close]);
      price = close;
    }
    return { title: 'ACME Corp.', options: { legend: 'none', numberFormat: 'auto' }, columns: ['Date', 'Open', 'High', 'Low', 'Close'], rows };
  }],
  ['portfolio-treemap', 'finance', 'treemap', ['포트폴리오', '자산군과 종목 비중'], ['Portfolio', 'Asset classes and holdings'], (l) => ({
    title: l === 'ko' ? '투자 포트폴리오' : 'Investment portfolio', options: { legend: 'none' },
    columns: [l === 'ko' ? '자산군' : 'Class', l === 'ko' ? '종목' : 'Holding', l === 'ko' ? '평가액' : 'Value'],
    rows: l === 'ko'
      ? [['주식', '반도체', 320], ['주식', '자동차', 140], ['주식', '바이오', 90], ['주식', '인터넷', 110], ['채권', '국채', 260], ['채권', '회사채', 120], ['대체투자', '리츠', 80], ['대체투자', '금', 60], ['현금', '예금', 70]]
      : [['Stocks', 'Chips', 320], ['Stocks', 'Autos', 140], ['Stocks', 'Biotech', 90], ['Stocks', 'Internet', 110], ['Bonds', 'Government', 260], ['Bonds', 'Corporate', 120], ['Alternatives', 'REITs', 80], ['Alternatives', 'Gold', 60], ['Cash', 'Deposits', 70]],
  })],
  ['expense-sunburst', 'finance', 'sunburst', ['가계 지출', '분류와 세부 항목'], ['Household spending', 'Categories and items'], (l) => ({
    title: l === 'ko' ? '월 가계 지출 (만 원)' : 'Monthly spending', options: { legend: 'none' },
    columns: [l === 'ko' ? '분류' : 'Category', l === 'ko' ? '항목' : 'Item', l === 'ko' ? '금액' : 'Amount'],
    rows: l === 'ko'
      ? [['주거', '월세', 80], ['주거', '관리비', 22], ['식비', '장보기', 45], ['식비', '외식', 30], ['교통', '대중교통', 8], ['교통', '연료', 15], ['여가', '여행', 20], ['여가', '구독', 6], ['교육', '학원', 35]]
      : [['Housing', 'Rent', 80], ['Housing', 'Utilities', 22], ['Food', 'Groceries', 45], ['Food', 'Eating out', 30], ['Transport', 'Transit', 8], ['Transport', 'Fuel', 15], ['Leisure', 'Travel', 20], ['Leisure', 'Subscriptions', 6], ['Education', 'Tutoring', 35]],
  })],
  ['height-weight', 'science', 'scatter', ['키와 몸무게', '두 변수의 관계와 추세선'], ['Height and weight', 'Two variables and a trend line'], (l) => {
    const h = normal(11, 60, 170, 8);
    const r = rng(12);
    return {
      title: l === 'ko' ? '키와 몸무게의 관계' : 'Height vs. weight', options: { trendline: true, xTitle: l === 'ko' ? '키 (cm)' : 'Height (cm)', yTitle: l === 'ko' ? '몸무게 (kg)' : 'Weight (kg)', beginAtZero: false, legend: 'none' },
      columns: [l === 'ko' ? '키' : 'Height', l === 'ko' ? '몸무게' : 'Weight'],
      rows: h.map((x) => [x, round(x * 0.9 - 88 + (r() - 0.5) * 14, 1)]),
    };
  }],
  ['countries-bubble', 'society', 'bubble', ['국가별 소득과 수명', '인구를 거품 크기로'], ['Income and life expectancy', 'Population as bubble size'], (l) => ({
    title: l === 'ko' ? '1인당 소득과 기대수명' : 'Income vs. life expectancy', options: { dataLabels: true, xTitle: l === 'ko' ? '1인당 소득 (천 달러)' : 'Income per person (k$)', yTitle: l === 'ko' ? '기대수명 (세)' : 'Life expectancy' },
    columns: [l === 'ko' ? '국가' : 'Country', l === 'ko' ? '대륙' : 'Continent', l === 'ko' ? '소득' : 'Income', l === 'ko' ? '수명' : 'Life', l === 'ko' ? '인구' : 'Population'],
    rows: [['A-land', 'Asia', 34, 83.5, 52], ['B-land', 'Asia', 12, 76.1, 140], ['C-land', 'Europe', 46, 81.2, 83], ['D-land', 'Europe', 39, 82.4, 67], ['E-land', 'Americas', 63, 78.5, 330], ['F-land', 'Americas', 9, 75.3, 210], ['G-land', 'Africa', 3, 64.2, 110], ['H-land', 'Africa', 6.5, 69.8, 60], ['I-land', 'Oceania', 55, 83.1, 26], ['J-land', 'Asia', 2.3, 70.6, 1400]],
    mapping: { x: 2, y: 3, size: 4, label: 0, group: 1 },
  })],
  ['exam-histogram', 'science', 'histogram', ['시험 점수 분포', '200명의 점수 분포'], ['Exam scores', 'How 200 scores spread'], (l) => ({
    title: l === 'ko' ? '기말고사 점수 분포' : 'Final exam scores', options: { bins: 12, dataLabels: true, xTitle: l === 'ko' ? '점수' : 'Score' },
    columns: [l === 'ko' ? '점수' : 'Score'],
    rows: normal(21, 200, 72, 11, 0).map((v) => [Math.max(20, Math.min(100, v))]),
  })],
  ['salary-boxplot', 'society', 'boxplot', ['부서별 연봉', '분포와 이상값'], ['Salaries by team', 'Spread and outliers'], (l) => {
    const a = normal(31, 40, 5200, 600, 0);
    const b = normal(32, 40, 6100, 900, 0);
    const c = normal(33, 40, 4600, 450, 0);
    const d = normal(34, 40, 7300, 1300, 0);
    a[3] = 8900; c[7] = 2800;
    return {
      title: l === 'ko' ? '부서별 연봉 분포 (만 원)' : 'Salaries by team', options: { legend: 'none' },
      columns: l === 'ko' ? ['개발', '영업', '지원', '연구'] : ['Engineering', 'Sales', 'Support', 'Research'],
      rows: a.map((v, i) => [v, b[i], c[i], d[i]]),
    };
  }],
  ['weekly-heatmap', 'society', 'heatmap', ['요일·시간대 방문', '방문이 몰리는 시간'], ['Visits by day and hour', 'When people come'], (l) => {
    const days = l === 'ko' ? ['월', '화', '수', '목', '금', '토', '일'] : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const hours = ['08', '10', '12', '14', '16', '18', '20', '22'];
    const r = rng(5);
    return {
      title: l === 'ko' ? '요일·시간대별 방문자' : 'Visitors by day and hour', options: { ramp: 'heat', legend: 'none' },
      columns: [l === 'ko' ? '요일' : 'Day', ...hours.map((h) => `${h}${l === 'ko' ? '시' : 'h'}`)],
      rows: days.map((d, i) => [d, ...hours.map((h, k) => round(20 + 60 * Math.exp(-((k - (i >= 5 ? 3 : 5)) ** 2) / 4) + r() * 15 + (i >= 5 ? 20 : 0)))]),
    };
  }],
  ['skills-radar', 'society', 'radar', ['역량 비교', '두 지원자의 역량'], ['Skill profile', 'Two candidates compared'], (l) => ({
    title: l === 'ko' ? '지원자 역량 평가' : 'Candidate skills', options: { yMin: 0, yMax: 10 },
    columns: [l === 'ko' ? '역량' : 'Skill', l === 'ko' ? '지원자 A' : 'Candidate A', l === 'ko' ? '지원자 B' : 'Candidate B'],
    rows: (l === 'ko' ? ['기술', '소통', '리더십', '창의성', '문제 해결', '협업'] : ['Technical', 'Communication', 'Leadership', 'Creativity', 'Problem solving', 'Teamwork']).map((s, i) => [s, [9, 6, 5, 8, 9, 7][i], [6, 9, 8, 6, 7, 9][i]]),
  })],
  ['wind-polar', 'science', 'polarArea', ['풍향 빈도', '방위별 바람 빈도'], ['Wind directions', 'How often wind blows from each side'], (l) => ({
    title: l === 'ko' ? '풍향별 빈도 (일)' : 'Wind direction (days)', options: { legend: 'none' },
    columns: [l === 'ko' ? '방위' : 'Direction', l === 'ko' ? '일수' : 'Days'],
    rows: (l === 'ko' ? ['북', '북동', '동', '남동', '남', '남서', '서', '북서'] : ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']).map((d, i) => [d, [62, 30, 18, 25, 41, 55, 78, 56][i]]),
  })],
  ['energy-sankey', 'science', 'sankey', ['에너지 흐름', '에너지원에서 쓰임새까지'], ['Energy flow', 'From sources to uses'], (l) => ({
    title: l === 'ko' ? '에너지 흐름 (단위: PJ)' : 'Energy flow (PJ)', options: { legend: 'none', dataLabels: true },
    columns: [l === 'ko' ? '출발' : 'Source', l === 'ko' ? '도착' : 'Target', l === 'ko' ? '양' : 'Amount'],
    rows: l === 'ko'
      ? [['석유', '수송', 140], ['석유', '산업', 60], ['가스', '발전', 70], ['가스', '가정', 50], ['석탄', '발전', 90], ['원자력', '발전', 80], ['재생', '발전', 40], ['발전', '산업', 120], ['발전', '가정', 90], ['발전', '손실', 70]]
      : [['Oil', 'Transport', 140], ['Oil', 'Industry', 60], ['Gas', 'Power', 70], ['Gas', 'Homes', 50], ['Coal', 'Power', 90], ['Nuclear', 'Power', 80], ['Renewables', 'Power', 40], ['Power', 'Industry', 120], ['Power', 'Homes', 90], ['Power', 'Losses', 70]],
  })],
  ['project-lollipop', 'business', 'lollipop', ['팀 생산성', '팀별 완료 작업 수'], ['Team throughput', 'Tasks finished per team'], (l) => ({
    title: l === 'ko' ? '팀별 완료 작업' : 'Tasks finished', options: { sort: 'desc', dataLabels: true, legend: 'none' },
    columns: [l === 'ko' ? '팀' : 'Team', l === 'ko' ? '작업' : 'Tasks'],
    rows: (l === 'ko' ? ['플랫폼', '모바일', '웹', '데이터', 'QA', '보안', '인프라', '디자인'] : ['Platform', 'Mobile', 'Web', 'Data', 'QA', 'Security', 'Infra', 'Design']).map((t, i) => [t, [48, 61, 55, 39, 70, 22, 34, 44][i]]),
  })],
  ['usage-halfdonut', 'society', 'halfDonut', ['브라우저 사용률', '반원 도넛으로 본 비율'], ['Browser usage', 'Shares on a half ring'], (l) => ({
    title: l === 'ko' ? '브라우저 사용 비율' : 'Browser usage', options: { dataLabels: true, labelPosition: 'inside' },
    columns: ['Browser', l === 'ko' ? '비율' : 'Share'],
    rows: [['Orbit', 64.2], ['Sail', 18.6], ['Edge-ish', 5.4], ['Fox', 3.3], [l === 'ko' ? '기타' : 'Other', 8.5]],
  })],
  ['co2-area', 'science', 'area', ['이산화탄소 농도', '대기 CO₂ 농도 변화'], ['CO₂ concentration', 'Atmospheric CO₂ over the years'], (l) => ({
    title: l === 'ko' ? '대기 중 CO₂ 농도 (ppm)' : 'Atmospheric CO₂ (ppm)', options: { beginAtZero: false, legend: 'none', markers: false },
    columns: [l === 'ko' ? '연도' : 'Year', 'CO₂'],
    rows: Array.from({ length: 14 }, (_, i) => [String(1960 + i * 5), round(317 + i * 5.2 + i * i * 0.32, 1)]),
  })],
  ['grades-percent-column', 'society', 'percentColumn', ['학년별 성적 분포', '학년마다 등급 비율'], ['Grades by year', 'Share of grades in each year'], (l) => ({
    title: l === 'ko' ? '학년별 성적 등급' : 'Grades by school year', options: { dataLabels: true, palette: 'cool' },
    columns: [l === 'ko' ? '학년' : 'Year', 'A', 'B', 'C', 'D'],
    rows: (l === 'ko' ? ['1학년', '2학년', '3학년'] : ['Year 1', 'Year 2', 'Year 3']).map((y, i) => [y, 22 + i * 3, 38 - i, 28 - i, 12 - i]),
  })],
  ['inventory-stacked-bar', 'business', 'stackedBar', ['창고별 재고', '창고마다 품목 구성'], ['Stock by warehouse', 'Items in each warehouse'], (l) => ({
    title: l === 'ko' ? '창고별 재고 (팔레트)' : 'Stock by warehouse (pallets)',
    columns: [l === 'ko' ? '창고' : 'Warehouse', l === 'ko' ? '원자재' : 'Raw', l === 'ko' ? '반제품' : 'Semi', l === 'ko' ? '완제품' : 'Finished'],
    rows: (l === 'ko' ? ['평택', '천안', '구미', '광양', '김해'] : ['Pyeongtaek', 'Cheonan', 'Gumi', 'Gwangyang', 'Gimhae']).map((w, i) => [w, 120 - i * 10, 60 + i * 12, 90 + (i % 2) * 40]),
  })],
];

/** Sample groups, in display order. */
export const SAMPLE_GROUPS = [
  { id: 'business', ko: '비즈니스', en: 'Business' },
  { id: 'finance', ko: '금융', en: 'Finance' },
  { id: 'science', ko: '과학·환경', en: 'Science' },
  { id: 'society', ko: '사회·교육', en: 'Society' },
];

export const SAMPLES = LIST.map(([id, group, type, ko, en, make]) => ({
  id, group, type, ko, en, icon: CHART_TYPES.find((c) => c.id === type)?.icon ?? 'chartColumn',
  /** { name, table, chart } in the language. */
  build: (language = 'ko') => {
    const l = language === 'en' ? 'en' : 'ko';
    const spec = make(l);
    return {
      name: `${(l === 'ko' ? ko : en)[0]}.mychart`,
      table: createTable(spec.columns, spec.rows),
      chart: { type, title: spec.title ?? '', subtitle: spec.subtitle ?? '', options: spec.options ?? {}, mapping: spec.mapping ?? null },
    };
  },
}));

/** Starter data for a new chart of a type: the first sample of that type, else a small generic table. */
export function starterFor(type, language = 'ko') {
  const l = language === 'en' ? 'en' : 'ko';
  const own = SAMPLES.find((x) => x.type === type);
  if (own) return own.build(l);
  const base = baseType(type);
  const make = STARTERS[type] ?? STARTERS[base];
  const sample = make ? null : SAMPLES.find((x) => x.type === base);
  if (sample) { const built = sample.build(l); return { ...built, chart: { ...built.chart, type } }; }
  const spec = make ? make(l) : null;
  return {
    name: `${l === 'ko' ? '새 차트' : 'New chart'}.mychart`,
    table: spec ? createTable(spec.columns, spec.rows) : createTable([l === 'ko' ? '항목' : 'Item', l === 'ko' ? '값 1' : 'Value 1', l === 'ko' ? '값 2' : 'Value 2'], [['A', 12, 8], ['B', 19, 14], ['C', 9, 11], ['D', 15, 6], ['E', 22, 17]]),
    chart: { type, title: spec?.title ?? '', subtitle: spec?.subtitle ?? '', options: spec?.options ?? {}, mapping: spec?.mapping ?? null },
  };
}

/** An empty grid to type into. */
export function blankTable(language = 'ko') {
  const l = language === 'en' ? 'en' : 'ko';
  return createTable([l === 'ko' ? '항목' : 'Item', { name: l === 'ko' ? '값' : 'Value', type: 'number' }], Array.from({ length: 6 }, () => [null, null]));
}
