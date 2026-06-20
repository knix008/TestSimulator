import { Priority, TestStep } from "./types";

export interface GeneratedTestCase {
  code: string;
  title: string;
  preconditions: string;
  expectedResult: string;
  steps: Omit<TestStep, "testCaseId">[];
}

const PRECONDITIONS = "시스템이 정상적으로 사용 가능한 상태이다.";
const STEP_EXPECTED = "요구사항에 기술된 대로 동작한다.";

/**
 * Derives a default set of test cases (positive / negative / boundary) from a
 * requirement's title and description, mirroring the desktop app's TestCaseGenerator.
 */
export function generateTestCases(requirement: { code: string; title: string; description: string; priority: Priority }): GeneratedTestCase[] {
  const cases = [buildPositiveCase(requirement), buildNegativeCase(requirement)];
  if (requirement.priority === "High" || requirement.priority === "Critical") {
    cases.push(buildBoundaryCase(requirement));
  }
  return cases;
}

function buildPositiveCase(req: { code: string; title: string; description: string }): GeneratedTestCase {
  return {
    code: `${req.code}-TC1`,
    title: `검증: ${req.title} (정상 시나리오)`,
    preconditions: PRECONDITIONS,
    expectedResult: req.description.trim() ? req.description : `${req.title}이(가) 명세대로 동작한다.`,
    steps: buildStepsFromDescription(req)
  };
}

function buildNegativeCase(req: { code: string; title: string }): GeneratedTestCase {
  return {
    code: `${req.code}-TC2`,
    title: `검증: ${req.title} (잘못된/경계 입력)`,
    preconditions: PRECONDITIONS,
    expectedResult: "잘못되거나 범위를 벗어난 입력은 거부되거나, 경계 경우가 오류나 충돌 없이 적절히 처리되어야 한다.",
    steps: [
      {
        order: 0,
        action: `"${req.title}" 시나리오를 잘못되거나 범위를 벗어난 입력으로 시도한다.`,
        expectedOutcome: "적절한 유효성 검사 메시지가 표시되고 시스템이 안정적으로 유지된다."
      }
    ]
  };
}

function buildBoundaryCase(req: { code: string; title: string }): GeneratedTestCase {
  return {
    code: `${req.code}-TC3`,
    title: `검증: ${req.title} (경계 조건)`,
    preconditions: PRECONDITIONS,
    expectedResult: "경계값이 오프-바이-원 또는 오버플로 오류 없이 올바르게 처리되어야 한다.",
    steps: [
      {
        order: 0,
        action: `"${req.title}"의 최소 및 최대 지원 한계에서 동작을 확인한다.`,
        expectedOutcome: "두 한계 모두 오류 없이 올바르게 처리된다."
      }
    ]
  };
}

function buildStepsFromDescription(req: { title: string; description: string }): Omit<TestStep, "testCaseId">[] {
  const steps: Omit<TestStep, "testCaseId">[] = [];

  if (req.description.trim()) {
    const sentences = req.description
      .split(/[.\n;。]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .slice(0, 4);

    sentences.forEach((sentence, idx) => {
      steps.push({ order: idx, action: sentence, expectedOutcome: STEP_EXPECTED });
    });
  }

  if (steps.length === 0) {
    steps.push({
      order: 0,
      action: `요구사항 "${req.title}"에 기술된 시나리오를 실행한다.`,
      expectedOutcome: "결과가 요구사항의 기대와 일치한다."
    });
  }

  return steps;
}
