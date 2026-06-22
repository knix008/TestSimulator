import { NextResponse } from "next/server";
import prisma from "../../../lib/prisma";
import { requireRole, isErrorResponse } from "../../../lib/apiAuth";
import { renumberRequirementCodes, tempCode } from "../../../lib/reqCode";

export async function GET(request) {
  const session = await requireRole("VIEWER");
  if (isErrorResponse(session)) return session;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const priority = searchParams.get("priority");
  const q = searchParams.get("q");

  const where = {};
  if (status) where.status = status;
  if (priority) where.priority = priority;
  if (q) {
    where.OR = [
      { code: { contains: q } },
      { title: { contains: q } },
      { category: { contains: q } },
    ];
  }

  const requirements = await prisma.requirement.findMany({
    where,
    include: { createdBy: { select: { name: true } }, _count: { select: { testCases: true } } },
    orderBy: { id: "desc" },
  });

  return NextResponse.json(requirements);
}

export async function POST(request) {
  const session = await requireRole("EDITOR");
  if (isErrorResponse(session)) return session;

  const body = await request.json();
  const { title, description, category, priority, status } = body;

  if (!title) {
    return NextResponse.json({ error: "title은 필수입니다." }, { status: 400 });
  }

  // 코드는 Category 기준으로 자동 부여된다 (예: UI-01). 임시 코드로 생성한 뒤 전체를 재정렬한다.
  const created = await prisma.requirement.create({
    data: {
      code: tempCode(),
      title,
      description,
      category,
      priority: priority || "MEDIUM",
      status: status || "DRAFT",
      createdById: Number(session.user.id),
    },
  });

  await renumberRequirementCodes(prisma);

  const requirement = await prisma.requirement.findUnique({ where: { id: created.id } });
  return NextResponse.json(requirement, { status: 201 });
}

// 선택된 요구사항 여러 건을 한 번에 삭제한다 (연결된 테스트케이스도 cascade로 함께 삭제됨).
export async function DELETE(request) {
  const session = await requireRole("EDITOR");
  if (isErrorResponse(session)) return session;

  const body = await request.json();
  const ids = Array.isArray(body?.ids) ? body.ids.map(Number).filter((n) => !Number.isNaN(n)) : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "삭제할 요구사항을 선택하세요." }, { status: 400 });
  }

  const { count } = await prisma.requirement.deleteMany({ where: { id: { in: ids } } });
  await renumberRequirementCodes(prisma);

  return NextResponse.json({ ok: true, count });
}
