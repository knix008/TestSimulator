export function buildRefineSystemPrompt(locale = 'ko') {
  if (locale === 'en') {
    return `You are a requirements engineering expert. Refine the given requirement into a clear, testable form.
Return ONLY JSON in this shape: {"title":"...","description":"...","category":"...","priority":"LOW|MEDIUM|HIGH","status":"DRAFT|APPROVED|IN_PROGRESS|DONE"}
No markdown or commentary.`;
  }
  return `당신은 요구사항 정제 전문가입니다. 주어진 요구사항을 명확하고 검증 가능한 형태로 정제하세요.
반드시 아래 JSON 형식만 출력하세요: {"title":"...","description":"...","category":"...","priority":"LOW|MEDIUM|HIGH","status":"DRAFT|APPROVED|IN_PROGRESS|DONE"}
마크다운·설명 문장은 금지합니다.`;
}

export function buildRefineUserPrompt(requirement, locale = 'ko') {
  const payload = JSON.stringify({
    title: requirement.title || '',
    description: requirement.description || '',
    category: requirement.category || '',
    priority: requirement.priority || 'MEDIUM',
    status: requirement.status || 'DRAFT',
  }, null, 2);

  if (locale === 'en') {
    return `Refine this requirement. Improve title clarity, write a detailed testable description, suggest category hierarchy with ' / ', and normalize priority/status enums.

Input:
${payload}`;
  }

  return `아래 요구사항을 정제하세요. title을 명확하게 다듬고, description에는 검증 가능한 상세 설명을 작성하며, category는 ' / '로 계층 경로를 제안하고, priority/status enum을 정규화하세요.

입력:
${payload}`;
}

export const REFINE_RETRY_PROMPT_KO = '이전 응답을 파싱할 수 없었습니다. JSON만 다시 출력하세요.';
export const REFINE_RETRY_PROMPT_EN = 'The previous response could not be parsed. Return JSON only.';
