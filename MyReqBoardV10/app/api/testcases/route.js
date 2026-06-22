import { NextResponse } from "next/server";
import prisma from "../../../lib/prisma";
import { requireRole, isErrorResponse } from "../../../lib/apiAuth";

export async function POST(request) {
  const session = await requireRole("EDITOR");
  if (isErrorResponse(session)) return session;

  const body = await request.json();
  const { code, title, steps, expectedResult, status, requirementId } = body;

  if (!code || !title || !requirementId) {
    return NextResponse.json(
      { error: "code, title, requirementId는 필수입니다." },
      { status: 400 }
    );
  }

  try {
    const testCase = await prisma.testCase.create({
      data: {
        code,
        title,
        steps,
        expectedResult,
        status: status || "NOT_RUN",
        requirementId: Number(requirementId),
        createdById: Number(session.user.id),
      },
    });
    return NextResponse.json(testCase, { status: 201 });
  } catch (err) {
    if (err.code === "P2002") {
      return NextResponse.json({ error: `code "${code}"가 이미 존재합니다.` }, { status: 409 });
    }
    throw err;
  }
}

// 선택된 테스트케이스 여러 건을 한 번에 삭제한다.
export async function DELETE(request) {
  const session = await requireRole("EDITOR");
  if (isErrorResponse(session)) return session;

  const body = await request.json();
  const ids = Array.isArray(body?.ids) ? body.ids.map(Number).filter((n) => !Number.isNaN(n)) : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "삭제할 테스트케이스를 선택하세요." }, { status: 400 });
  }

  const { count } = await prisma.testCase.deleteMany({ where: { id: { in: ids } } });
  return NextResponse.json({ ok: true, count });
}
