// 요구사항 코드는 Category 글자 그대로를 접두사로 사용한다 (예: "UI" -> UI-01, UI-02).
// Category가 없으면 기본 접두사 "REQ"를 사용한다.
function sanitizePrefix(category) {
  const cleaned = (category || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return cleaned || "REQ";
}

// id 순서대로 훑으면서 Category별로 순번을 다시 매긴다.
// 생성/수정(카테고리 변경)/삭제 이후 항상 이 함수를 호출해 코드 상태를 정규화한다.
// 임시 코드로 한 번 옮긴 뒤 최종 코드를 부여해 unique 제약 충돌을 피한다.
export async function renumberRequirementCodes(prisma) {
  const all = await prisma.requirement.findMany({
    orderBy: { id: "asc" },
    select: { id: true, category: true },
  });

  await prisma.$transaction(
    all.map((r) => prisma.requirement.update({ where: { id: r.id }, data: { code: `__tmp_${r.id}` } }))
  );

  const counters = {};
  const updates = all.map((r) => {
    const prefix = sanitizePrefix(r.category);
    counters[prefix] = (counters[prefix] || 0) + 1;
    const code = `${prefix}-${String(counters[prefix]).padStart(2, "0")}`;
    return prisma.requirement.update({ where: { id: r.id }, data: { code } });
  });
  await prisma.$transaction(updates);
}

export function tempCode() {
  return `__tmp_new_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
