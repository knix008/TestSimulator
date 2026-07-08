export function buildRefineSystemPrompt(locale = 'ko') {
  if (locale === 'en') {
    return `You are a requirements engineering expert. Refine the given requirement into a clear, testable form.
Return ONLY JSON in this shape: {"title":"...","description":"...","category":"...","classification":"...","priority":"LOW|MEDIUM|HIGH","status":"DRAFT|APPROVED|IN_PROGRESS|DONE"}
No markdown or commentary.`;
  }
  return `당신은 요구사항 정제 전문가입니다. 주어진 요구사항을 명확하고 검증 가능한 형태로 정제하세요.
반드시 아래 JSON 형식만 출력하세요: {"title":"...","description":"...","category":"...","classification":"...","priority":"LOW|MEDIUM|HIGH","status":"DRAFT|APPROVED|IN_PROGRESS|DONE"}
마크다운·설명 문장은 금지합니다.`;
}

function emptyFieldsHint(emptyFields, locale) {
  if (!emptyFields?.length) return '';
  if (locale === 'en') {
    return `\nThe following fields are EMPTY and MUST be filled with meaningful content: ${emptyFields.join(', ')}\nDo not leave these fields as empty strings.\n`;
  }
  return `\n다음 필드는 비어 있습니다. 반드시 의미 있는 내용으로 채우세요: ${emptyFields.join(', ')}\n이 필드들을 빈 문자열로 두지 마세요.\n`;
}

export function buildRefineUserPrompt(requirement, locale = 'ko', options = {}) {
  const { fillGaps = false, emptyFields = [] } = options;
  const payload = JSON.stringify({
    title: requirement.title || '',
    description: requirement.description || '',
    category: requirement.category || '',
    classification: requirement.classification || '',
    priority: requirement.priority || 'MEDIUM',
    status: requirement.status || 'DRAFT',
  }, null, 2);

  if (locale === 'en') {
    if (fillGaps) {
      return `Fill missing or clearly insufficient fields in this requirement. Keep adequate existing text unchanged. Return complete JSON with all fields.${emptyFieldsHint(emptyFields, locale)}

Input:
${payload}`;
    }
    return `Refine this requirement. Improve title clarity, write a detailed testable description, suggest category hierarchy with ' / ', and normalize priority/status enums.

Input:
${payload}`;
  }

  if (fillGaps) {
    return `아래 요구사항에서 비어 있거나 명확히 부족한 필드만 보완하세요. 이미 충분한 내용은 가능한 한 유지하세요. 모든 필드를 포함한 JSON을 반환하세요.${emptyFieldsHint(emptyFields, locale)}

입력:
${payload}`;
  }

  return `아래 요구사항을 정제하세요. title을 명확하게 다듬고, description에는 검증 가능한 상세 설명을 작성하며, category는 ' / '로 계층 경로를 제안하고, priority/status enum을 정규화하세요.

입력:
${payload}`;
}

export function buildRefineTestCaseSystemPrompt(locale = 'ko') {
  if (locale === 'en') {
    return `You are a QA engineer. Refine the given test case into a clear, executable form.
Return ONLY JSON: {"title":"...","description":"...","steps":"...","expectedResult":"...","status":"NOT_RUN|PASS|FAIL|BLOCKED"}
No markdown or commentary.`;
  }
  return `당신은 QA 엔지니어입니다. 주어진 테스트 케이스를 명확하고 실행 가능한 형태로 정제하세요.
반드시 아래 JSON 형식만 출력하세요: {"title":"...","description":"...","steps":"...","expectedResult":"...","status":"NOT_RUN|PASS|FAIL|BLOCKED"}
마크다운·설명 문장은 금지합니다.`;
}

export function buildRefineTestCaseUserPrompt(testCase, locale = 'ko', options = {}) {
  const { fillGaps = false, requirementTitle = '', requirementDescription = '', emptyFields = [] } = options;
  const payload = JSON.stringify({
    title: testCase.title || '',
    description: testCase.description || '',
    steps: testCase.steps || '',
    expectedResult: testCase.expectedResult || '',
    status: testCase.status || 'NOT_RUN',
  }, null, 2);

  const context = requirementTitle
    ? (locale === 'en'
      ? `\nRelated requirement:\nTitle: ${requirementTitle}\nDescription: ${requirementDescription || '(none)'}\n`
      : `\n관련 요구사항:\n제목: ${requirementTitle}\n설명: ${requirementDescription || '(없음)'}\n`)
    : '';

  if (locale === 'en') {
    if (fillGaps) {
      return `Fill missing or clearly insufficient fields in this test case. Keep adequate existing text unchanged. Write numbered steps and a concrete expected result when missing.${context}${emptyFieldsHint(emptyFields, locale)}

Input:
${payload}`;
    }
    return `Refine this test case with clear title, description, numbered steps, and expected result.${context}

Input:
${payload}`;
  }

  if (fillGaps) {
    return `아래 테스트 케이스에서 비어 있거나 명확히 부족한 필드만 보완하세요. 이미 충분한 내용은 가능한 한 유지하세요. steps는 번호 목록으로, expectedResult는 구체적으로 작성하세요.${context}${emptyFieldsHint(emptyFields, locale)}

입력:
${payload}`;
  }

  return `아래 테스트 케이스를 정제하세요. title, description, 번호가 있는 steps, expectedResult를 명확히 작성하세요.${context}

입력:
${payload}`;
}

export const REFINE_RETRY_PROMPT_KO = '이전 응답을 파싱할 수 없었습니다. JSON만 다시 출력하세요.';
export const REFINE_RETRY_PROMPT_EN = 'The previous response could not be parsed. Return JSON only.';

const PLACEHOLDER_VALUES = new Set(['—', '-', '–', 'null', 'undefined', 'n/a', 'na', 'none']);

function isFieldEmpty(value) {
  const text = String(value ?? '').trim();
  if (!text) return true;
  return PLACEHOLDER_VALUES.has(text.toLowerCase());
}

export function listEmptyFields(record, keys) {
  return keys.filter((key) => isFieldEmpty(record?.[key]));
}
