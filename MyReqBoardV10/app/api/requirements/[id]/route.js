import { NextResponse } from "next/server";
import prisma from "../../../../lib/prisma";
import { requireRole, isErrorResponse } from "../../../../lib/apiAuth";
import { renumberRequirementCodes } from "../../../../lib/reqCode";

export async function GET(request, { params }) {
  const session = await requireRole("VIEWER");
  if (isErrorResponse(session)) return session;

  const requirement = await prisma.requirement.findUnique({
    where: { id: Number(params.id) },
    include: {
      createdBy: { select: { name: true } },
      testCases: { orderBy: { id: "asc" } },
    },
  });

  if (!requirement) {
    return NextResponse.json({ error: "요구사항을 찾을 수 없습니다." }, { status: 404 });
  }

  return NextResponse.json(requirement);
}

export async function PUT(request, { params }) {
  const session = await requireRole("EDITOR");
  if (isErrorResponse(session)) return session;

  const body = await request.json();
  const { title, description, category, priority, status } = body;

  const existing = await prisma.requirement.findUnique({ where: { id: Number(params.id) } });
  if (!existing) {
    return NextResponse.json({ error: "요구사항을 찾을 수 없습니다." }, { status: 404 });
  }

  // 코드는 Category로 자동 결정되므로 클라이언트가 보낸 code는 무시한다.
  await prisma.requirement.update({
    where: { id: Number(params.id) },
    data: { title, description, category, priority, status },
  });

  if (category !== existing.category) {
    await renumberRequirementCodes(prisma);
  }

  const requirement = await prisma.requirement.findUnique({ where: { id: Number(params.id) } });
  return NextResponse.json(requirement);
}

export async function DELETE(request, { params }) {
  const session = await requireRole("EDITOR");
  if (isErrorResponse(session)) return session;

  try {
    await prisma.requirement.delete({ where: { id: Number(params.id) } });
  } catch (err) {
    if (err.code === "P2025") {
      return NextResponse.json({ error: "요구사항을 찾을 수 없습니다." }, { status: 404 });
    }
    throw err;
  }

  await renumberRequirementCodes(prisma);

  return NextResponse.json({ ok: true });
}