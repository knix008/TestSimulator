const PRIORITY_KEYS = ['LOW', 'MEDIUM', 'HIGH'];
const STATUS_KEYS = ['DRAFT', 'APPROVED', 'IN_PROGRESS', 'DONE'];
const TC_STATUS_KEYS = ['NOT_RUN', 'PASS', 'FAIL', 'BLOCKED'];

const PLACEHOLDER_VALUES = new Set(['—', '-', '–', 'null', 'undefined', 'n/a', 'na', 'none']);

export function isBlank(value) {
  const text = String(value ?? '').trim();
  if (!text) return true;
  return PLACEHOLDER_VALUES.has(text.toLowerCase());
}

function isShortText(value, minLength = 8) {
  return String(value ?? '').trim().length < minLength;
}

function pickTextField(current, refined, { improveShort = false } = {}) {
  const cur = String(current ?? '').trim();
  const next = String(refined ?? '').trim();
  if (!next) return cur || next;
  if (isBlank(cur)) return next;
  if (improveShort && isShortText(cur) && next.length > cur.length) return next;
  return cur;
}

/** Fill empty/placeholder fields; improve very short text fields. */
function pickFillGapField(current, refined, { improveShort = false } = {}) {
  const cur = String(current ?? '').trim();
  const next = String(refined ?? '').trim();
  if (!next) return cur;
  if (isBlank(cur)) return next;
  if (improveShort && isShortText(cur) && next.length > cur.length) return next;
  return cur;
}

function pickEnumFillGap(current, refined, allowed) {
  const cur = String(current ?? '').trim();
  const next = String(refined ?? '').trim();
  if ((!cur || !allowed.includes(cur)) && next && allowed.includes(next)) return next;
  if (cur && allowed.includes(cur)) return cur;
  return next && allowed.includes(next) ? next : (cur || allowed[0]);
}

export function normalizeRequirementRefined(raw) {
  if (!raw || typeof raw !== 'object') return {};
  return {
    title: raw.title ?? raw.Title ?? '',
    description: raw.description ?? raw.desc ?? raw.Description ?? '',
    category: raw.category ?? raw.Category ?? '',
    classification: raw.classification ?? raw.class ?? raw.Classification ?? '',
    priority: raw.priority ?? raw.Priority ?? '',
    status: raw.status ?? raw.Status ?? '',
  };
}

export function normalizeTestCaseRefined(raw) {
  if (!raw || typeof raw !== 'object') return {};
  return {
    title: raw.title ?? raw.Title ?? '',
    description: raw.description ?? raw.desc ?? raw.Description ?? '',
    steps: raw.steps ?? raw.Steps ?? raw.procedure ?? '',
    expectedResult: raw.expectedResult ?? raw.expected_result ?? raw.expected ?? raw.ExpectedResult ?? '',
    status: raw.status ?? raw.Status ?? '',
  };
}

export function mergeRequirementRefined(item, refinedRaw) {
  const refined = normalizeRequirementRefined(refinedRaw);
  return {
    title: pickFillGapField(item.title, refined.title),
    description: pickFillGapField(item.description, refined.description, { improveShort: true }),
    category: pickFillGapField(item.category, refined.category),
    classification: pickFillGapField(item.classification, refined.classification),
    priority: pickEnumFillGap(item.priority, refined.priority, PRIORITY_KEYS),
    status: pickEnumFillGap(item.status, refined.status, STATUS_KEYS),
    assigneeUserId: item.assigneeUserId ?? null,
  };
}

export function mergeTestCaseRefined(item, refinedRaw) {
  const refined = normalizeTestCaseRefined(refinedRaw);
  return {
    title: pickFillGapField(item.title, refined.title),
    description: pickFillGapField(item.description, refined.description, { improveShort: true }),
    steps: pickFillGapField(item.steps, refined.steps, { improveShort: true }),
    expectedResult: pickFillGapField(item.expectedResult, refined.expectedResult, { improveShort: true }),
    status: pickEnumFillGap(item.status, refined.status, TC_STATUS_KEYS),
  };
}

/** Form editor: keep existing text unless empty (original conservative merge). */
export function mergeRequirementRefinedConservative(item, refinedRaw) {
  const refined = normalizeRequirementRefined(refinedRaw);
  return {
    title: pickTextField(item.title, refined.title),
    description: pickTextField(item.description, refined.description, { improveShort: true }),
    category: pickTextField(item.category, refined.category),
    classification: pickFillGapField(item.classification, refined.classification),
    priority: pickEnumFillGap(item.priority, refined.priority, PRIORITY_KEYS),
    status: pickEnumFillGap(item.status, refined.status, STATUS_KEYS),
    assigneeUserId: item.assigneeUserId ?? null,
  };
}

export function requirementRefineChanged(before, after) {
  return JSON.stringify(before) !== JSON.stringify(after);
}

export function testCaseRefineChanged(before, after) {
  return JSON.stringify(before) !== JSON.stringify(after);
}

export function listBlankRequirementFields(item) {
  return ['title', 'description', 'category', 'classification']
    .filter((key) => isBlank(item?.[key]));
}

export function listBlankTestCaseFields(item) {
  return ['title', 'description', 'steps', 'expectedResult']
    .filter((key) => isBlank(item?.[key]));
}
