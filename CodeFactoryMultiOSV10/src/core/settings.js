// Analysis settings: which inspections run, and the quality thresholds that
// decide what counts as a warning. Ported from the Windows build's
// UserAnalysisSettings + MetricInspectionThresholdCatalog, with the same
// default values so both builds flag the same code.

import { LANGUAGES } from './languages.js';

/** Every inspection, with its threshold spec where it has one. */
export const INSPECTIONS = [
  // --- tabs ---------------------------------------------------------------
  { id: 'showFilesTab', group: 'view', label: '파일 탭 표시', labelEn: 'Files tab' },
  { id: 'showFunctionsTab', group: 'view', label: '함수 탭 표시', labelEn: 'Functions tab' },
  { id: 'showTypesTab', group: 'view', label: '타입 탭 표시', labelEn: 'Types tab' },
  { id: 'showPackagesTab', group: 'view', label: '패키지 탭 표시', labelEn: 'Packages tab' },
  { id: 'showArchitectureTab', group: 'view', label: '아키텍처 탭 표시', labelEn: 'Architecture tab' },
  { id: 'showSecurityTab', group: 'view', label: '정보 보호 및 보안 탭 표시', labelEn: 'Security tab' },

  // --- function-level metrics --------------------------------------------
  {
    id: 'cyclomaticComplexity',
    group: 'function',
    label: '순환 복잡도',
    labelEn: 'Cyclomatic complexity',
    threshold: { key: 'warnCyclomaticComplexity', compare: 'gte', min: 1, max: 200, def: 15, decimals: 0 },
    tip: '함수의 분기 경로 수입니다. 이 값 이상이면 경고합니다. 테스트해야 할 경로 수의 하한이기도 합니다.',
  },
  {
    id: 'cognitiveComplexity',
    group: 'function',
    label: '인지 복잡도',
    labelEn: 'Cognitive complexity',
    threshold: { key: 'warnCognitiveComplexity', compare: 'gte', min: 1, max: 200, def: 15, decimals: 0 },
    tip: '중첩 깊이에 가중치를 둔 복잡도입니다. 사람이 읽기 어려운 정도에 가깝습니다.',
  },
  {
    id: 'nestingDepth',
    group: 'function',
    label: '중첩 깊이',
    labelEn: 'Nesting depth',
    threshold: { key: 'warnMaxNestingDepth', compare: 'gte', min: 1, max: 50, def: 4, decimals: 0 },
    tip: '블록이 몇 겹까지 중첩되는지입니다. 깊을수록 조기 반환·함수 추출이 필요합니다.',
  },
  {
    id: 'parameterCount',
    group: 'function',
    label: '매개변수 수',
    labelEn: 'Parameter count',
    threshold: { key: 'warnParameterCount', compare: 'gte', min: 1, max: 50, def: 6, decimals: 0 },
    tip: '매개변수가 많으면 호출부에서 순서를 틀리기 쉽습니다. 파라미터 객체 도입을 검토하세요.',
  },
  {
    id: 'returnCount',
    group: 'function',
    label: 'return 수',
    labelEn: 'Return count',
    threshold: { key: 'warnReturnCount', compare: 'gte', min: 1, max: 50, def: 5, decimals: 0 },
    tip: '종료 지점이 많으면 정리 코드가 누락되기 쉽습니다.',
  },
  {
    id: 'magicNumbers',
    group: 'function',
    label: '매직 넘버',
    labelEn: 'Magic numbers',
    threshold: { key: 'warnMagicNumbers', compare: 'gte', min: 1, max: 100, def: 5, decimals: 0 },
    tip: '0·1·-1을 제외한 숫자 리터럴 개수입니다. 이름 있는 상수로 바꾸면 의도가 드러납니다.',
  },
  {
    id: 'fanOut',
    group: 'function',
    label: 'Fan-out',
    labelEn: 'Fan-out',
    threshold: { key: 'warnFanOut', compare: 'gte', min: 1, max: 500, def: 10, decimals: 0 },
    tip: '이 함수가 직접 호출하는 함수 수입니다. 높으면 조정자(orchestrator) 역할이 과합니다.',
  },
  {
    id: 'maintenanceIndex',
    group: 'function',
    label: '유지보수 지수(MI)',
    labelEn: 'Maintainability index',
    threshold: { key: 'warnMaintenanceIndex', compare: 'lt', min: 0, max: 171, def: 65, decimals: 0 },
    tip: '0~171 척도이며 이 값 미만이면 경고합니다. 낮을수록 손대기 어려운 코드입니다.',
  },
  {
    id: 'statementCount',
    group: 'function',
    label: '문장 수',
    labelEn: 'Statement count',
    threshold: { key: 'warnStatementCount', compare: 'gte', min: 10, max: 500, def: 50, decimals: 0 },
    tip: '함수 문장 수가 이 값 이상이면 경고합니다.',
  },
  {
    id: 'switchCaseCount',
    group: 'function',
    label: 'switch/case 수',
    labelEn: 'Switch case count',
    threshold: { key: 'warnSwitchCaseCount', compare: 'gte', min: 3, max: 200, def: 10, decimals: 0 },
    tip: 'case 분기가 많으면 다형성·조회 테이블로 대체할 여지가 큽니다.',
  },
  { id: 'catchQuality', group: 'function', label: '예외 처리 품질', labelEn: 'Catch quality', tip: '빈 catch·광범위 catch를 검사합니다.' },
  { id: 'asyncVoid', group: 'function', label: 'async void', labelEn: 'async void', tip: '예외가 호출자로 전파되지 않는 async void 메서드를 검사합니다.' },
  { id: 'possiblyUnusedCode', group: 'function', label: '미사용 가능 코드', labelEn: 'Possibly unused code', tip: '호출 그래프에서 아무도 호출하지 않는 함수를 표시합니다.' },
  { id: 'halsteadMetrics', group: 'function', label: 'Halstead 지표', labelEn: 'Halstead metrics', tip: 'Halstead 볼륨(어휘·토큰 기반 규모)을 계산합니다.' },

  // --- file-level ---------------------------------------------------------
  {
    id: 'todoDensity',
    group: 'file',
    label: 'TODO 밀도',
    labelEn: 'TODO density',
    threshold: { key: 'warnTodoDensityPer100Lines', compare: 'gte', min: 0, max: 100, def: 3, decimals: 1 },
    tip: '100줄당 TODO/FIXME 개수입니다.',
  },
  {
    id: 'godFile',
    group: 'file',
    label: 'God 파일',
    labelEn: 'God file',
    threshold: { key: 'warnGodFileCodeLines', compare: 'gte', min: 100, max: 50000, def: 800, decimals: 0 },
    tip: '코드 줄 수가 이 값 이상인 파일을 표시합니다.',
  },
  {
    id: 'lowCommentRatio',
    group: 'file',
    label: '낮은 주석 비율',
    labelEn: 'Low comment ratio',
    threshold: { key: 'warnMinCommentPercent', compare: 'lt', min: 0, max: 100, def: 10, decimals: 0 },
    tip: '코드 100줄당 주석 줄 수가 이 값 미만이면 경고합니다.',
  },
  {
    id: 'publicApiDensity',
    group: 'file',
    label: 'public API 수',
    labelEn: 'Public API count',
    threshold: { key: 'warnPublicApiCount', compare: 'gte', min: 5, max: 500, def: 30, decimals: 0 },
    tip: '파일이 외부에 노출하는 public 멤버 수입니다.',
  },
  {
    id: 'testCodeRatio',
    group: 'file',
    label: '테스트 코드 비율',
    labelEn: 'Test code ratio',
    threshold: { key: 'warnMinTestCodePercent', compare: 'lt', min: 0, max: 100, def: 10, decimals: 0 },
    tip: '테스트 코드 LOC 비율(근사)이 이 값 미만이면 경고합니다.',
  },
  {
    id: 'gitHotspot',
    group: 'file',
    label: 'Git 변경 핫스팟',
    labelEn: 'Git hotspot',
    threshold: { key: 'warnGitChangeLines', compare: 'gte', min: 50, max: 1000000, def: 500, decimals: 0 },
    tip: '최근 1년간 변경 줄 수가 이 값 이상인 파일입니다. 복잡도까지 높으면 최우선 리팩터링 대상입니다.',
  },
  { id: 'fileDuplicateLines', group: 'file', label: '파일별 중복 줄', labelEn: 'Duplicate lines per file', tip: '파일 단위로 중복 코드 줄 수를 집계합니다.' },
  {
    id: 'securitySmells',
    group: 'file',
    label: '보안 smell',
    labelEn: 'Security smells',
    threshold: { key: 'warnSecuritySmellCount', compare: 'gte', min: 1, max: 100, def: 1, decimals: 0 },
    tip: '언어별 보안 규칙에 걸린 개수가 이 값 이상이면 경고합니다.',
  },

  // --- type / package -----------------------------------------------------
  {
    id: 'godType',
    group: 'type',
    label: 'God 타입',
    labelEn: 'God type',
    threshold: { key: 'warnGodTypeMemberCount', compare: 'gte', min: 5, max: 500, def: 20, decimals: 0 },
    tip: '멤버 수가 이 값 이상인 타입을 표시합니다.',
  },
  {
    id: 'typeCohesion',
    group: 'type',
    label: '타입 응집도 부족(LCOM)',
    labelEn: 'Lack of cohesion',
    threshold: { key: 'warnLackOfCohesion', compare: 'gte', min: 0, max: 1, def: 0.6, decimals: 2 },
    tip: 'LCOM이 이 값 이상이면 타입이 여러 책임을 겸하고 있을 가능성이 큽니다.',
  },
  {
    id: 'inheritanceDepth',
    group: 'type',
    label: '상속 깊이(DIT)',
    labelEn: 'Inheritance depth',
    threshold: { key: 'warnInheritanceDepth', compare: 'gte', min: 2, max: 20, def: 5, decimals: 0 },
    tip: '상속 트리 깊이가 이 값 이상이면 경고합니다.',
  },
  { id: 'typeStructure', group: 'type', label: '타입 구조 분석', labelEn: 'Type structure', tip: '클래스·인터페이스 구조와 상속 관계를 수집합니다.' },
  {
    id: 'packageInstability',
    group: 'package',
    label: '패키지 불안정성(I)',
    labelEn: 'Package instability',
    threshold: { key: 'warnInstability', compare: 'gte', min: 0, max: 1, def: 0.7, decimals: 2 },
    tip: 'I = Ce / (Ca + Ce). 이 값 이상이면 외부 의존이 많아 변경에 취약합니다.',
  },
  { id: 'layerViolation', group: 'package', label: '계층 위반', labelEn: 'Layer violation', tip: '상위 계층을 거꾸로 호출하는 의존을 찾습니다.' },

  // --- graph / project-wide ----------------------------------------------
  { id: 'circularCalls', group: 'architecture', label: '순환 호출', labelEn: 'Circular calls', tip: '호출 그래프의 순환(재귀 포함)을 찾습니다.' },
  { id: 'fileCoupling', group: 'architecture', label: '파일 결합도', labelEn: 'File coupling', tip: '파일 간 호출 관계를 집계합니다.' },
  { id: 'directoryCoupling', group: 'architecture', label: '디렉터리 결합도', labelEn: 'Directory coupling', tip: '디렉터리 간 호출 관계를 집계합니다.' },
  { id: 'fanOutHub', group: 'architecture', label: 'Fan-out 허브', labelEn: 'Fan-out hub', tip: '지나치게 많은 함수를 호출하는 함수입니다.' },
  { id: 'fanInHub', group: 'architecture', label: 'Fan-in 허브', labelEn: 'Fan-in hub', tip: '지나치게 많은 곳에서 호출되는 함수입니다.' },
  { id: 'isolatedFunctions', group: 'architecture', label: '고립 함수', labelEn: 'Isolated functions', tip: '호출하지도, 호출되지도 않는 함수입니다.' },
  { id: 'globalVariables', group: 'architecture', label: '전역 변수', labelEn: 'Global variables', tip: '전역·모듈·정적 변수와 접근 함수를 수집합니다.' },
  { id: 'databaseSchema', group: 'architecture', label: 'DB 스키마', labelEn: 'Database schema', tip: '끄면 ERD·테이블 접근·DB 인스턴스 분석을 생략합니다.' },
  {
    id: 'duplicateCodeGroups',
    group: 'architecture',
    label: '중복 코드',
    labelEn: 'Duplicate code',
    threshold: {
      key: 'minDuplicateLines',
      compare: 'gte',
      min: 2,
      max: 200,
      def: 10,
      decimals: 0,
      label: '중복 최소 줄 수',
    },
    tip: '이 줄 수 이상 연속으로 같은 코드를 중복으로 봅니다.',
  },
  { id: 'bugRisk', group: 'architecture', label: '버그 위험 분석', labelEn: 'Bug risk', tip: '빈 catch·항상 참인 조건·도달 불가 코드 등을 검사합니다.' },
];

export const INSPECTION_GROUPS = [
  { id: 'view', label: '표시할 탭', labelEn: 'Tabs' },
  { id: 'function', label: '함수 검사', labelEn: 'Function inspections' },
  { id: 'file', label: '파일 검사', labelEn: 'File inspections' },
  { id: 'type', label: '타입 검사', labelEn: 'Type inspections' },
  { id: 'package', label: '패키지 검사', labelEn: 'Package inspections' },
  { id: 'architecture', label: '아키텍처·프로젝트 검사', labelEn: 'Architecture inspections' },
];

export const ALL_INSPECTION_IDS = INSPECTIONS.map((i) => i.id);

const THRESHOLD_SPECS = new Map();
for (const inspection of INSPECTIONS) {
  if (inspection.threshold) THRESHOLD_SPECS.set(inspection.threshold.key, inspection.threshold);
}

/** Default settings — the values a fresh install analyzes with. */
export function defaultSettings() {
  const thresholds = {};
  for (const [key, spec] of THRESHOLD_SPECS) thresholds[key] = spec.def;

  return {
    schemaVersion: 1,
    lastRootDirectory: '',
    // Every language until a directory scan says which ones are actually there.
    languageIds: LANGUAGES.map((language) => language.id),
    languageSelectionCustomized: false,
    includedDirectories: [],
    excludedDirectories: [],
    enabledInspections: [...ALL_INSPECTION_IDS],
    // An opaque theme id — core/ stays free of UI knowledge, and themes.js
    // falls back to its own default if the stored id is no longer known.
    theme: 'midnight',
    uiLanguage: 'ko',
    ...thresholds,
  };
}

/** Clamps a stored settings object into a valid, complete one. */
export function normalizeSettings(source) {
  const defaults = defaultSettings();
  if (!source || typeof source !== 'object') return defaults;

  const out = { ...defaults, ...source };

  for (const [key, spec] of THRESHOLD_SPECS) {
    const raw = Number(source[key]);
    out[key] = Number.isFinite(raw) && raw > 0 ? clamp(raw, spec.min, spec.max) : spec.def;
  }

  const known = new Set(ALL_INSPECTION_IDS);
  out.enabledInspections = Array.isArray(source.enabledInspections)
    ? source.enabledInspections.filter((id) => known.has(id))
    : [...ALL_INSPECTION_IDS];
  if (out.enabledInspections.length === 0) out.enabledInspections = [...ALL_INSPECTION_IDS];

  // A stored empty list is only respected when the user chose it: otherwise it
  // is a missing value, and "no languages" would silently analyze nothing.
  out.languageIds = Array.isArray(source.languageIds) ? source.languageIds : defaults.languageIds;
  if (out.languageIds.length === 0 && !source.languageSelectionCustomized) {
    out.languageIds = defaults.languageIds;
  }
  out.includedDirectories = Array.isArray(source.includedDirectories) ? source.includedDirectories : [];
  out.excludedDirectories = Array.isArray(source.excludedDirectories) ? source.excludedDirectories : [];
  out.theme = typeof source.theme === 'string' && source.theme ? source.theme : defaults.theme;
  out.uiLanguage = source.uiLanguage === 'en' ? 'en' : 'ko';
  return out;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** Convenience view over `enabledInspections` used throughout the analyzers. */
export function inspectionSet(settings) {
  return new Set(settings.enabledInspections || ALL_INSPECTION_IDS);
}

/**
 * Severity of one measured value against its threshold.
 * `critical` is twice past a `gte` threshold, or half of a `lt` one — the same
 * two-band highlighting the Windows grid uses.
 */
export function warningLevel(inspectionId, value, settings) {
  const inspection = INSPECTIONS.find((i) => i.id === inspectionId);
  if (!inspection || !inspection.threshold || value === null || value === undefined) return 'none';

  const spec = inspection.threshold;
  const limit = Number(settings[spec.key]);
  if (!Number.isFinite(limit)) return 'none';

  if (spec.compare === 'lt') {
    if (value < limit / 2) return 'critical';
    if (value < limit) return 'warning';
    return 'none';
  }
  if (value >= limit * 2) return 'critical';
  if (value >= limit) return 'warning';
  return 'none';
}

export function thresholdOf(settings, key) {
  return Number(settings[key]);
}

export function getInspection(id) {
  return INSPECTIONS.find((i) => i.id === id) || null;
}
