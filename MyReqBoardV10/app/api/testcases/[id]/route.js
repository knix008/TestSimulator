import { NextResponse } from "next/server";
import prisma from "../../../../lib/prisma";
import { requireRole, isErrorResponse } from "../../../../lib/apiAuth";

export async function GET(request, { params }) {
  const session = await requireRole("VIEWER");
  if (isErrorResponse(session)) return session;

  const testCase = await prisma.testCase.findUnique({
    where: { id: Number(params.id) },
    include: { requirement: { select: { id: true, code: true, title: true } } },
  });

  if (!testCase) {
    return NextResponse.json({ error: "테스트케이스를 찾을 수 없습니다." }, { status: 404 });
  }

  return NextResponse.json(testCase);
}

export async function PUT(request, { params }) {
  const session = await requireRole("EDITOR");
  if (isErrorResponse(session)) return session;

  const body = await request.json();
  const { code, title, steps, expectedResult, status } = body;

  try {
    const testCase = await prisma.testCase.update({
      where: { id: Number(params.id) },
      data: { code, title, steps, expectedResult, status },
    });
    return NextResponse.json(testCase);
  } catch (err) {
    if (err.code === "P2002") {
      return NextResponse.json({ error: `code "${code}"가 이미 존재합니다.` }, { status: 409 });
    }
    if (err.code === "P2025") {
      return NextResponse.json({ error: "테스트케이스를 찾을 수 없습니다." }, { status: 404 });
    }
    throw err;
  }
}

export async function DELETE(request, { params }) {
  const session = await requireRole("EDITOR");
  if (isErrorResponse(session)) return session;

  try {
    await prisma.testCase.delete({ where: { id: Number(params.id) } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err.code === "P2025") {
      return NextResponse.json({ error: "테스트케이스를 찾을 수 없습니다." }, { status: 404 });
    }
    throw err;
  }
}
