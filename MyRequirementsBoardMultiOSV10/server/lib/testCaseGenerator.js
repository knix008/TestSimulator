import { allocateNextTcCode } from './testCaseCodeAllocator.js';

function splitDescriptionSentences(description) {
  return String(description || '')
    .split(/[.\n;。]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4);
}

export function formatStepsText(steps) {
  if (!steps?.length) return '';
  return steps
    .map((step, index) => {
      const order = step.order ?? index + 1;
      const outcome = step.expectedOutcome ? `\n   기대: ${step.expectedOutcome}` : '';
      return `${order}. ${step.action}${outcome}`;
    })
    .join('\n');
}

function buildStepsFromDescription(requirement) {
  const sentences = splitDescriptionSentences(requirement.description);
  if (sentences.length === 0) {
    return formatStepsText([{
      order: 1,
      action: `요구사항 "${requirement.title}"의 정상 시나리오를 수행합니다.`,
      expectedOutcome: '요구사항에 정의된 동작이 정상적으로 수행됩니다.',
    }]);
  }
  return formatStepsText(
    sentences.map((sentence, index) => ({
      order: index + 1,
      action: sentence,
      expectedOutcome: '요구사항에 정의된 대로 동작합니다.',
    })),
  );
}

function buildPositiveCase(requirement, allocator) {
  const code = allocateNextTcCode(allocator.usedCodes, allocator.nextSequenceRef);
  return {
    code,
    title: `정상: ${requirement.title}`,
    description: requirement.description?.trim() || '',
    steps: buildStepsFromDescription(requirement),
    expectedResult: requirement.description?.trim()
      || `시스템이 "${requirement.title}" 요구사항을 정상적으로 충족합니다.`,
    status: 'NOT_RUN',
  };
}

function buildNegativeCase(requirement, allocator) {
  const code = allocateNextTcCode(allocator.usedCodes, allocator.nextSequenceRef);
  return {
    code,
    title: `오류: ${requirement.title}`,
    description: '',
    steps: formatStepsText([{
      order: 1,
      action: `"${requirement.title}" 요구사항에 대해 잘못된 입력 또는 예외 조건을 적용합니다.`,
      expectedOutcome: '시스템이 오류를 적절히 처리하고 허용되지 않은 동작을 방지합니다.',
    }]),
    expectedResult: '잘못된 입력 또는 예외 조건에서 시스템이 안전하게 거부·처리합니다.',
    status: 'NOT_RUN',
  };
}

function buildBoundaryCase(requirement, allocator) {
  const code = allocateNextTcCode(allocator.usedCodes, allocator.nextSequenceRef);
  return {
    code,
    title: `경계: ${requirement.title}`,
    description: '',
    steps: formatStepsText([{
      order: 1,
      action: `"${requirement.title}" 요구사항의 경계값·한계 조건을 검증합니다.`,
      expectedOutcome: '경계 조건에서도 요구사항이 일관되게 동작합니다.',
    }]),
    expectedResult: '경계 조건에서 요구사항이 정의된 대로 동작합니다.',
    status: 'NOT_RUN',
  };
}

export function generateTestCasesForRequirement(requirement, allocator) {
  const cases = [
    buildPositiveCase(requirement, allocator),
    buildNegativeCase(requirement, allocator),
  ];
  if (requirement.priority === 'HIGH') {
    cases.push(buildBoundaryCase(requirement, allocator));
  }
  return cases;
}

export function createTestCaseAllocator(existingCodes = []) {
  const usedCodes = new Set();
  let nextSequence = 1;
  const nextSequenceRef = { current: nextSequence };
  for (const code of existingCodes) {
    const normalized = String(code || '').trim();
    if (!normalized) continue;
    usedCodes.add(normalized);
    const match = /^TC-(\d+)$/i.exec(normalized);
    if (match) {
      const number = Number(match[1]);
      if (!Number.isNaN(number)) nextSequenceRef.current = Math.max(nextSequenceRef.current, number + 1);
    }
  }
  return { usedCodes, nextSequenceRef };
}
