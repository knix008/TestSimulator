// Every chart this program draws (108 types): its group in the gallery, its icon, its names, and which data roles
// it uses. Roles name table columns: `category` (labels / x), `values` (one or more number series), and the special
// roles of some charts (x / y / size for bubbles, open / high / low / close for candles, low / high for ranges,
// start / end for Gantt bars, source / target for flows, group for hierarchies, goal for bullets).
//
// A type is drawn either by its own renderer (render.js, render-extra.js) or as a variant of another type:
// `base` is the renderer it borrows and `preset` the options that make it that variant (forced when drawing).
import { numberColumns, textColumns } from '../data/table.js';

export const CHART_GROUPS = [
  { id: 'bar', ko: '막대', en: 'Bars', icon: 'groupBasic' },
  { id: 'barPlus', ko: '막대 변형', en: 'Bar variants', icon: 'groupCompare' },
  { id: 'line', ko: '선·시간', en: 'Lines & time', icon: 'groupTrend' },
  { id: 'area', ko: '영역', en: 'Areas', icon: 'groupArea' },
  { id: 'part', ko: '구성 비율', en: 'Part of whole', icon: 'groupPart' },
  { id: 'hierarchy', ko: '계층·흐름', en: 'Hierarchies & flows', icon: 'groupHierarchy' },
  { id: 'distribution', ko: '분포', en: 'Distribution', icon: 'groupDistribution' },
  { id: 'correlation', ko: '상관·비교', en: 'Correlation & comparison', icon: 'groupCorrelation' },
  { id: 'finance', ko: '재무·일정·지표', en: 'Finance, plans & KPIs', icon: 'groupFinance' },
];

/** [id, group, ko, en, ko description, en description, roles, extra { base, preset, legend }] */
const LIST = [
  // ── bar
  ['column', 'bar', '세로 막대', 'Column', '항목별 값을 세로 막대로 비교', 'Compare values across categories', 'cv'],
  ['bar', 'bar', '가로 막대', 'Bar', '긴 이름의 항목을 가로 막대로 비교', 'Compare categories with long names', 'cv'],
  ['stackedColumn', 'bar', '누적 세로 막대', 'Stacked column', '항목별 합계와 구성', 'Totals and their parts', 'cv'],
  ['stackedBar', 'bar', '누적 가로 막대', 'Stacked bar', '가로로 쌓은 구성', 'Parts stacked sideways', 'cv'],
  ['percentColumn', 'bar', '100% 누적 막대', '100% stacked column', '항목마다 구성 비율', 'Share within each category', 'cv'],
  ['percentBar', 'bar', '100% 누적 가로 막대', '100% stacked bar', '가로로 본 구성 비율', 'Shares, sideways', 'cv'],
  ['combo', 'bar', '막대+꺾은선', 'Combo', '첫 계열은 막대, 나머지는 선', 'First series as bars, the rest as lines', 'cv'],
  ['roundedColumn', 'bar', '둥근 세로 막대', 'Rounded column', '모서리를 둥글린 막대', 'Columns with round tops', 'cv', { base: 'column', preset: { barRadius: 10 } }],
  ['gradientColumn', 'bar', '그라데이션 막대', 'Gradient column', '위로 갈수록 진해지는 막대', 'Columns shaded top to bottom', 'cv', { base: 'column', preset: { gradient: true } }],
  ['divergingBar', 'bar', '양방향 막대', 'Diverging bar', '양수와 음수를 다른 색으로', 'Positive and negative in two colours', 'c1', { base: 'bar', preset: { colorBySign: true }, legend: 'none' }],
  ['butterfly', 'bar', '나비(인구 피라미드)', 'Butterfly (pyramid)', '두 계열을 좌우로 맞대어', 'Two series back to back', 'cv'],
  ['smallMultiples', 'bar', '작은 여러 차트', 'Small multiples', '계열마다 작은 막대 차트', 'One small chart per series', 'cv', { legend: 'none' }],
  // ── barPlus
  ['lollipop', 'barPlus', '롤리팝', 'Lollipop', '점과 선으로 그린 막대', 'Bars drawn as dots on sticks', 'cv'],
  ['lollipopBar', 'barPlus', '가로 롤리팝', 'Horizontal lollipop', '가로로 누운 롤리팝', 'Lollipops lying down', 'cv', { base: 'lollipop', preset: { horizontal: true } }],
  ['dotPlot', 'barPlus', '점 도표', 'Dot plot', '막대 대신 점만', 'Only the dots, no bars', 'cv', { base: 'lollipop', preset: { horizontal: true, stick: false } }],
  ['dumbbell', 'barPlus', '덤벨', 'Dumbbell', '두 값 사이의 차이를 선으로', 'The gap between two values', 'cv'],
  ['rangeColumn', 'barPlus', '범위 막대', 'Range column', '최솟값에서 최댓값까지', 'From a low to a high value', 'lh'],
  ['rangeBar', 'barPlus', '가로 범위 막대', 'Range bar', '가로로 그린 범위', 'Ranges sideways', 'lh', { base: 'rangeColumn', preset: { horizontal: true } }],
  ['bullet', 'barPlus', '불릿', 'Bullet', '실적과 목표, 구간', 'Actual against a target, with bands', 'cvt'],
  ['progressBars', 'barPlus', '진행 막대', 'Progress bars', '최댓값 대비 진행률', 'Progress toward a maximum', 'c1', { legend: 'none' }],
  ['radialBar', 'barPlus', '원형 막대', 'Radial bar', '동심원 고리로 그린 막대', 'Bars bent into rings', 'c1', { legend: 'none' }],
  ['radialColumn', 'barPlus', '방사형 막대', 'Radial column', '원 둘레에 선 막대', 'Columns around a circle', 'cv'],
  ['meanError', 'barPlus', '평균과 오차 막대', 'Mean with error bars', '열마다 평균 ± 표준편차', 'Mean ± standard deviation per column', 'v', { legend: 'none' }],
  ['pareto', 'barPlus', '파레토', 'Pareto', '큰 순서 막대와 누적 비율선', 'Sorted bars and a cumulative share', 'c1'],
  // ── line
  ['line', 'line', '꺾은선', 'Line', '시간에 따른 변화', 'Change over time', 'cv'],
  ['spline', 'line', '곡선', 'Smooth line', '부드럽게 이은 선', 'A smoothed line', 'cv'],
  ['stepLine', 'line', '계단선', 'Step line', '값이 바뀌는 시점을 계단으로', 'Changes as steps', 'cv'],
  ['dashedLine', 'line', '점선', 'Dashed line', '점선으로 그린 추세', 'Trends in dashes', 'cv', { base: 'line', preset: { dash: true } }],
  ['pointLine', 'line', '점 계열', 'Points only', '선 없이 점만', 'Points without lines', 'cv', { base: 'line', preset: { lineWidth: 0, markers: true, markerSize: 6 } }],
  ['stackedLine', 'line', '누적 꺾은선', 'Stacked line', '쌓아 올린 선', 'Lines stacked up', 'cv', { base: 'stackedArea', preset: { areaOpacity: 0 } }],
  ['slope', 'line', '기울기 차트', 'Slope chart', '두 시점 사이의 변화', 'Change between two points in time', 'cv'],
  ['bump', 'line', '순위 변화', 'Bump chart', '시간에 따른 순위', 'Rankings over time', 'cv'],
  ['sparklines', 'line', '스파크라인', 'Sparklines', '계열마다 한 줄 미니 차트', 'One mini line per series', 'cv', { legend: 'none' }],
  ['cumulativeLine', 'line', '누적 합계선', 'Cumulative line', '처음부터 쌓인 합계', 'Running totals', 'cv', { base: 'line', preset: { transform: 'cumulative' } }],
  ['movingAverage', 'line', '이동 평균', 'Moving average', '값과 이동 평균선', 'Values with a moving average', 'cv', { base: 'line', preset: { movingAverage: 3 } }],
  ['timeline', 'line', '타임라인', 'Timeline', '시간 순서의 사건', 'Events in time order', 'cl', { legend: 'none' }],
  // ── area
  ['area', 'area', '영역', 'Area', '변화와 양을 함께', 'Change and volume together', 'cv'],
  ['splineArea', 'area', '곡선 영역', 'Smooth area', '부드러운 영역', 'A smoothed area', 'cv', { base: 'area', preset: { smooth: true, markers: false } }],
  ['stepArea', 'area', '계단 영역', 'Step area', '계단 모양 영역', 'An area in steps', 'cv', { base: 'area', preset: { step: true, markers: false } }],
  ['overlapArea', 'area', '겹친 영역', 'Overlapping areas', '옅게 겹쳐 그린 영역과 점', 'Light areas drawn over each other, with points', 'cv', { base: 'area', preset: { areaOpacity: 0.16, markers: true, lineWidth: 2.5 } }],
  ['stackedArea', 'area', '누적 영역', 'Stacked area', '쌓아 올린 영역', 'Areas stacked up', 'cv'],
  ['smoothStackedArea', 'area', '곡선 누적 영역', 'Smooth stacked area', '부드럽게 쌓은 영역', 'Smoothed areas stacked up', 'cv', { base: 'stackedArea', preset: { smooth: true } }],
  ['stackedStepArea', 'area', '계단 누적 영역', 'Stacked step area', '계단 모양으로 쌓은 영역', 'Areas stacked in steps', 'cv', { base: 'stackedArea', preset: { step: true } }],
  ['percentArea', 'area', '100% 누적 영역', '100% stacked area', '시간에 따른 구성 비율', 'Shares over time', 'cv'],
  ['smoothPercentArea', 'area', '곡선 100% 영역', 'Smooth 100% area', '부드럽게 그린 구성 비율 영역', 'Smoothed shares of the whole', 'cv', { base: 'percentArea', preset: { smooth: true } }],
  ['cumulativeArea', 'area', '누적 합계 영역', 'Cumulative area', '처음부터 더해 간 값의 영역', 'Running totals as areas', 'cv', { base: 'area', preset: { transform: 'cumulative', markers: false } }],
  ['streamgraph', 'area', '스트림그래프', 'Streamgraph', '가운데를 중심으로 흐르는 누적 영역', 'Stacked areas around a centre', 'cv'],
  ['rangeArea', 'area', '범위 영역', 'Range area', '최솟값과 최댓값 사이의 띠', 'A band between low and high', 'lh'],
  // ── part
  ['pie', 'part', '원형', 'Pie', '전체에서 차지하는 비율', 'Share of a whole', 'c1'],
  ['donut', 'part', '도넛', 'Donut', '가운데에 합계를 둔 원형', 'Pie with the total in the middle', 'c1'],
  ['halfDonut', 'part', '반원 도넛', 'Half donut', '반원으로 그린 구성 비율', 'Shares on a half ring', 'c1'],
  ['semiPie', 'part', '반원 원형', 'Half pie', '반원으로 그린 원형', 'A pie cut in half', 'c1', { base: 'halfDonut', preset: { innerRadius: 0 } }],
  ['explodedPie', 'part', '분리 원형', 'Exploded pie', '조각을 떼어 놓은 원형', 'Slices pulled apart', 'c1', { base: 'pie', preset: { explode: 0.08 } }],
  ['nestedDonut', 'part', '다중 도넛', 'Nested donut', '계열마다 고리 하나', 'One ring per series', 'cv', { legend: 'rows' }],
  ['polarArea', 'part', '극좌표 영역', 'Polar area', '각도는 같고 반지름이 값', 'Equal angles, radius by value', 'c1'],
  ['funnel', 'part', '깔때기', 'Funnel', '단계마다 줄어드는 양', 'Stages that narrow', 'c1'],
  ['pyramid', 'part', '피라미드', 'Pyramid', '아래가 넓은 삼각형 단계', 'Stages widening downwards', 'c1', { base: 'funnel', preset: { pyramid: true } }],
  ['waffle', 'part', '와플', 'Waffle', '100칸으로 나타낸 비율', 'Shares in a 10 × 10 grid', 'c1', { legend: 'rows' }],
  ['iconArray', 'part', '점 배열', 'Dot array', '100개의 점으로 나타낸 비율', 'Shares as 100 dots', 'c1', { base: 'waffle', preset: { dots: true }, legend: 'rows' }],
  ['parliament', 'part', '의석 배치', 'Parliament', '반원에 늘어선 의석', 'Seats on a half circle', 'c1', { legend: 'rows' }],
  // ── hierarchy
  ['treemap', 'hierarchy', '트리맵', 'Treemap', '면적으로 나타낸 비율과 묶음', 'Areas by size, grouped', 'gv'],
  ['sunburst', 'hierarchy', '선버스트', 'Sunburst', '계층을 고리로', 'A hierarchy as rings', 'gv'],
  ['icicle', 'hierarchy', '고드름', 'Icicle', '계층을 층층이 쌓은 막대', 'A hierarchy as stacked layers', 'gv', { legend: 'none' }],
  ['packedCircles', 'hierarchy', '원 묶음', 'Packed circles', '크기대로 모은 원', 'Circles sized by value, packed', 'gv', { legend: 'none' }],
  ['tree', 'hierarchy', '트리', 'Tree', '묶음에서 항목으로 뻗는 가지', 'Branches from groups to items', 'gv', { legend: 'none' }],
  ['sankey', 'hierarchy', '생키', 'Sankey', '어디서 어디로 흐르는 양', 'Flows from sources to targets', 'stv'],
  ['chord', 'hierarchy', '코드 다이어그램', 'Chord diagram', '원 둘레를 잇는 흐름', 'Flows across a circle', 'stv', { legend: 'none' }],
  ['arcDiagram', 'hierarchy', '호 다이어그램', 'Arc diagram', '한 줄의 점을 잇는 호', 'Arcs between points on a line', 'stv', { legend: 'none' }],
  ['network', 'hierarchy', '네트워크', 'Network graph', '점과 연결선', 'Nodes and links', 'stv', { legend: 'none' }],
  ['marimekko', 'hierarchy', '마리메코', 'Marimekko', '폭은 합계, 높이는 비율', 'Width by total, height by share', 'cv'],
  ['wordCloud', 'hierarchy', '단어 구름', 'Word cloud', '값이 클수록 큰 글자', 'Bigger words for bigger values', 'c1', { legend: 'none' }],
  ['waterfall', 'hierarchy', '폭포', 'Waterfall', '증감이 누적되는 과정', 'How increases and decreases add up', 'c1'],
  // ── distribution
  ['histogram', 'distribution', '히스토그램', 'Histogram', '값의 분포 구간', 'How values spread', 'v'],
  ['cumulativeHistogram', 'distribution', '누적 히스토그램', 'Cumulative histogram', '구간 끝까지의 값 개수', 'Counts up to the end of each bin', 'v', { base: 'histogram', preset: { cumulativeBins: true } }],
  ['frequencyPolygon', 'distribution', '도수 다각형', 'Frequency polygon', '구간 개수를 선으로', 'Bin counts as a line', 'v', { base: 'histogram', preset: { polygon: true } }],
  ['dotHistogram', 'distribution', '점 히스토그램', 'Dot histogram', '구간마다 값을 점으로 쌓음', 'One dot per value, stacked in bins', 'v'],
  ['boxplot', 'distribution', '상자 수염', 'Box plot', '중앙값·사분위·이상값', 'Median, quartiles and outliers', 'v'],
  ['violin', 'distribution', '바이올린', 'Violin', '분포 모양을 좌우 대칭으로', 'The shape of each distribution', 'v', { legend: 'none' }],
  ['ridgeline', 'distribution', '능선 그림', 'Ridgeline', '계열마다 분포 곡선을 겹쳐 쌓음', 'Distribution curves stacked like ridges', 'v'],
  ['stripPlot', 'distribution', '띠 점 도표', 'Strip plot', '값마다 점 하나', 'One dot per value', 'v', { legend: 'none' }],
  ['beeswarm', 'distribution', '벌떼 도표', 'Beeswarm', '겹치지 않게 퍼진 점', 'Dots spread so they do not overlap', 'v', { base: 'stripPlot', preset: { swarm: true }, legend: 'none' }],
  ['rug', 'distribution', '러그 도표', 'Rug plot', '값마다 짧은 선', 'A short tick per value', 'v', { base: 'stripPlot', preset: { rug: true }, legend: 'none' }],
  ['density', 'distribution', '밀도', 'Density', '부드러운 분포 곡선', 'Smooth distribution curves', 'v'],
  ['ecdf', 'distribution', '누적 분포', 'Cumulative distribution', '값 이하인 비율', 'Share of values at or below', 'v'],
  // ── correlation
  ['scatter', 'correlation', '분산형', 'Scatter', '두 값의 관계', 'Relation of two values', 'xy'],
  ['connectedScatter', 'correlation', '연결 분산형', 'Connected scatter', '순서대로 이은 점', 'Points joined in order', 'xy', { base: 'scatter', preset: { connect: true } }],
  ['regressionScatter', 'correlation', '회귀 분산형', 'Regression scatter', '점과 회귀선', 'Points with a regression line', 'xy', { base: 'scatter', preset: { trendline: true } }],
  ['quadrant', 'correlation', '사분면', 'Quadrant', '평균선으로 나눈 네 영역', 'Four areas split at the means', 'xy', { base: 'scatter', preset: { quadrant: true } }],
  ['bubble', 'correlation', '거품형', 'Bubble', '세 번째 값을 크기로', 'A third value as size', 'xys'],
  ['heatmap', 'correlation', '히트맵', 'Heatmap', '색의 진하기로 보는 표', 'A table shaded by value', 'cv'],
  ['punchCard', 'correlation', '펀치 카드', 'Punch card', '크기로 보는 표', 'A table of sized dots', 'cv', { legend: 'none' }],
  ['calendarHeatmap', 'correlation', '달력 히트맵', 'Calendar heatmap', '날짜별 값을 달력 칸에', 'Daily values on a calendar', 'c1', { legend: 'none' }],
  ['correlation', 'correlation', '상관 행렬', 'Correlation matrix', '숫자 열끼리의 상관 계수', 'Correlation between number columns', 'v', { legend: 'none' }],
  ['scatterMatrix', 'correlation', '산점도 행렬', 'Scatter matrix', '숫자 열 두 개씩 짝지은 점', 'Every pair of number columns', 'v', { legend: 'none' }],
  ['radar', 'correlation', '방사형', 'Radar', '여러 지표를 한눈에', 'Several measures at a glance', 'cv'],
  ['radarLines', 'correlation', '방사형 선', 'Radar lines', '채우지 않은 방사형', 'Radar without fill', 'cv', { base: 'radar', preset: { areaOpacity: 0 } }],
  // ── finance
  ['candlestick', 'finance', '캔들스틱', 'Candlestick', '시가·고가·저가·종가', 'Open, high, low, close', 'ohlc'],
  ['ohlc', 'finance', 'OHLC 막대', 'OHLC bars', '좌우 눈금으로 그린 시세', 'Prices with open and close ticks', 'ohlc', { base: 'candlestick', preset: { ohlcBars: true } }],
  ['heikinAshi', 'finance', '하이킨아시', 'Heikin-Ashi', '평균으로 다듬은 캔들', 'Averaged candles', 'ohlc', { base: 'candlestick', preset: { heikinAshi: true } }],
  ['priceBand', 'finance', '가격 띠', 'Price band', '고가·저가 띠와 종가선', 'High-low band with the close', 'ohlc', { legend: 'none' }],
  ['bollinger', 'finance', '볼린저 밴드', 'Bollinger bands', '이동 평균 ± 2 표준편차', 'Moving average ± 2 standard deviations', 'c1', { legend: 'none' }],
  ['gantt', 'finance', '간트', 'Gantt', '작업의 시작과 끝', 'Tasks from start to end', 'gantt', { legend: 'none' }],
  ['gauge', 'finance', '게이지', 'Gauge', '목표 대비 현재 값', 'One value against its range', 'c1'],
  ['solidGauge', 'finance', '고리 게이지', 'Solid gauge', '바늘 없이 채워진 고리', 'A filled ring without a needle', 'c1', { base: 'gauge', preset: { solid: true } }],
  ['gaugeGrid', 'finance', '게이지 여러 개', 'Gauge grid', '행마다 게이지 하나', 'One gauge per row', 'c1', { legend: 'none' }],
  ['linearGauge', 'finance', '막대 게이지', 'Linear gauge', '온도계처럼 채워지는 막대', 'A bar that fills like a thermometer', 'c1', { legend: 'none' }],
  ['bigNumber', 'finance', '숫자 카드', 'KPI cards', '행마다 큰 숫자와 증감', 'A big number per row, with change', 'c1', { legend: 'none' }],
  ['activityRings', 'finance', '활동 고리', 'Activity rings', '목표 대비 달성 고리', 'Rings filled toward a goal', 'c1', { legend: 'rows' }],
];

const ROLES = {
  cv: [{ id: 'category', kind: 'any' }, { id: 'values', kind: 'number', multi: true }],
  c1: [{ id: 'category', kind: 'any' }, { id: 'values', kind: 'number', multi: false }],
  v: [{ id: 'values', kind: 'number', multi: true }],
  xy: [{ id: 'x', kind: 'number' }, { id: 'values', kind: 'number', multi: true }, { id: 'label', kind: 'any', optional: true }],
  xys: [{ id: 'x', kind: 'number' }, { id: 'y', kind: 'number' }, { id: 'size', kind: 'number' }, { id: 'label', kind: 'any', optional: true }, { id: 'group', kind: 'any', optional: true }],
  ohlc: [{ id: 'category', kind: 'any' }, { id: 'open', kind: 'number' }, { id: 'high', kind: 'number' }, { id: 'low', kind: 'number' }, { id: 'close', kind: 'number' }],
  gv: [{ id: 'group', kind: 'any', optional: true }, { id: 'category', kind: 'any' }, { id: 'values', kind: 'number', multi: false }],
  stv: [{ id: 'source', kind: 'any' }, { id: 'target', kind: 'any' }, { id: 'values', kind: 'number', multi: false }],
  lh: [{ id: 'category', kind: 'any' }, { id: 'low', kind: 'number' }, { id: 'high', kind: 'number' }],
  cvt: [{ id: 'category', kind: 'any' }, { id: 'values', kind: 'number', multi: false }, { id: 'goal', kind: 'number', optional: true }],
  gantt: [{ id: 'category', kind: 'any' }, { id: 'start', kind: 'any' }, { id: 'end', kind: 'any' }, { id: 'group', kind: 'any', optional: true }],
  cl: [{ id: 'category', kind: 'any' }, { id: 'label', kind: 'any' }],
};

export const CHART_TYPES = LIST.map(([id, group, ko, en, koDesc, enDesc, roles, extra = {}]) => ({
  id, group, ko, en, koDesc, enDesc, roles: ROLES[roles], roleSet: roles, icon: `chart${id[0].toUpperCase()}${id.slice(1)}`,
  base: extra.base ?? null, preset: extra.preset ?? null, legend: extra.legend ?? null,
}));
export const CHART_IDS = CHART_TYPES.map((c) => c.id);
const BY_ID = new Map(CHART_TYPES.map((c) => [c.id, c]));
export const chartType = (id) => BY_ID.get(id) ?? CHART_TYPES[0];
export const chartName = (id, language = 'ko') => chartType(id)[language === 'en' ? 'en' : 'ko'];
/** The renderer a type uses (its own id, or the type it is a variant of). */
export const baseType = (id) => chartType(id).base ?? chartType(id).id;

/** Kinds of axes: the cartesian charts draw axes and grid lines (by renderer id). */
export const CARTESIAN = new Set(['column', 'bar', 'line', 'area', 'stackedColumn', 'stackedBar', 'percentColumn', 'percentBar', 'combo', 'lollipop', 'spline', 'stepLine', 'stackedArea', 'percentArea', 'candlestick', 'waterfall', 'scatter', 'bubble', 'histogram', 'boxplot',
  'dumbbell', 'rangeColumn', 'pareto', 'meanError', 'streamgraph', 'rangeArea', 'density', 'ecdf', 'stripPlot', 'violin', 'priceBand', 'bollinger', 'dotHistogram']);
/** Renderers that need at least two value series (two groups to compare, a matrix, a ranking). */
export const TWO_SERIES = new Set(['butterfly', 'slope', 'bump', 'correlation', 'scatterMatrix', 'dumbbell']);
/** Chart renderers whose series can each be drawn their own way (columns, lines, areas, points …) on shared axes. */
export const COMBINABLE = new Set(['column', 'line', 'spline', 'stepLine', 'area', 'combo', 'lollipop']);
/** The ways a series of a mixed chart can be drawn. */
export const SERIES_KINDS = ['column', 'line', 'spline', 'step', 'area', 'points', 'lollipop'];
/** Whether a chart type can mix ways of drawing (vertical, unstacked category charts). */
export const canMix = (id) => COMBINABLE.has(baseType(id)) && !chartType(id).preset?.horizontal;
export const HORIZONTAL = new Set(['bar', 'stackedBar', 'percentBar']);
export const STACKED = new Set(['stackedColumn', 'stackedBar', 'stackedArea']);
export const PERCENT = new Set(['percentColumn', 'percentBar', 'percentArea']);
/** Charts that draw every row's value as a slice / box of one series (the legend lists the rows). */
export const BY_ROW = new Set(['pie', 'donut', 'halfDonut', 'polarArea', 'funnel', 'treemap', 'sunburst', 'waterfall', 'gauge']);

/**
 * A data mapping for a chart type from the table: the first text (or date) column as the category, the number
 * columns as the values — what a new chart and a change of type start from. `previous` keeps what still fits.
 */
export function autoMapping(table, typeId, previous = null) {
  const type = chartType(typeId);
  const nums = numberColumns(table);
  const texts = textColumns(table);
  const valid = (i) => Number.isInteger(i) && i >= 0 && i < table.columns.length;
  const isNum = (i) => valid(i) && table.columns[i].type === 'number';
  const prev = previous ?? {};
  const hasCategory = type.roles.some((r) => r.id === 'category');
  const category = !hasCategory ? null : valid(prev.category) ? prev.category : texts[0] ?? (nums.length > 1 ? nums[0] : null);
  const values = (Array.isArray(prev.values) ? prev.values.filter(isNum) : []).filter((i) => i !== category);
  const rest = nums.filter((i) => i !== category);
  const others = table.columns.map((_, i) => i).filter((i) => i !== category);
  const m = {};
  for (const role of type.roles) {
    if (role.id === 'category') m.category = category;
    else if (role.id === 'values') {
      // Types that compare two or more series take every number column back when a single-value type left one.
      const list = values.length >= (TWO_SERIES.has(baseType(type.id)) ? 2 : 1) ? values : rest;
      m.values = role.multi ? (list.length ? list : nums.slice(0, 1)) : (list.length ? list.slice(0, 1) : nums.slice(0, 1));
    } else if (role.id === 'x') m.x = isNum(prev.x) && (type.roleSet !== 'xy' || rest.length > 1) ? prev.x : type.roleSet === 'xy' && rest.length < 2 ? null : rest[0] ?? nums[0] ?? null; // one number column: it is Y, the rows give X
    else if (role.id === 'y') m.y = isNum(prev.y) ? prev.y : rest[1] ?? rest[0] ?? null;
    else if (role.id === 'size') m.size = isNum(prev.size) ? prev.size : rest[2] ?? rest[1] ?? null;
    else if (role.id === 'label') m.label = valid(prev.label) ? prev.label : type.roleSet === 'cl' ? texts.find((i) => i !== category) ?? others[0] ?? null : texts[0] ?? null;
    else if (role.id === 'group') m.group = valid(prev.group) ? prev.group : type.roleSet === 'gantt' ? texts.find((i) => i !== category) ?? null : texts.length > 1 ? texts[0] : null;
    else if (['open', 'high', 'low', 'close'].includes(role.id)) {
      const names = table.columns.map((c) => c.name.toLowerCase());
      const byName = names.findIndex((n) => n.startsWith(role.id) || n === { open: '시가', high: '고가', low: '저가', close: '종가' }[role.id] || (role.id === 'low' && /최저|최솟|min/.test(n)) || (role.id === 'high' && /최고|최댓|max/.test(n)));
      const fallback = type.roleSet === 'lh' ? rest[role.id === 'low' ? 0 : 1] : rest[['open', 'high', 'low', 'close'].indexOf(role.id)];
      m[role.id] = isNum(prev[role.id]) ? prev[role.id] : byName >= 0 && isNum(byName) ? byName : fallback ?? null;
    } else if (role.id === 'goal') m.goal = isNum(prev.goal) ? prev.goal : rest.find((i) => !(m.values ?? []).includes(i)) ?? null;
    else if (role.id === 'start') m.start = valid(prev.start) ? prev.start : others[0] ?? null;
    else if (role.id === 'end') m.end = valid(prev.end) ? prev.end : others[1] ?? null;
    else if (role.id === 'source') m.source = valid(prev.source) ? prev.source : texts[0] ?? 0;
    else if (role.id === 'target') m.target = valid(prev.target) ? prev.target : texts[1] ?? 1;
  }
  // Flows: source and target are text columns.
  if (type.roleSet === 'stv') { m.source = valid(prev.source) ? prev.source : texts[0] ?? 0; m.target = valid(prev.target) && prev.target !== m.source ? prev.target : texts[1] ?? 1; }
  // Hierarchies: with two text columns the first groups, the second names the boxes.
  if (type.roleSet === 'gv') {
    if (!valid(prev.group) && texts.length > 1 && (!valid(prev.category) || prev.category === texts[0])) { m.group = texts[0]; m.category = texts[1]; }
    if (m.group === m.category) m.group = null;
  }
  if (type.roleSet === 'gantt' && m.group === m.category) m.group = null;
  if (type.roleSet === 'xy' && m.x != null) m.values = m.values.filter((i) => i !== m.x).length ? m.values.filter((i) => i !== m.x) : rest.filter((i) => i !== m.x).slice(0, 1);
  return m;
}
