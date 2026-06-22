import { NextResponse } from "next/server";
import prisma from "../../../../lib/prisma";
import { requireRole, isErrorResponse } from "../../../../lib/apiAuth";

export async function PUT(request, { params }) {
  const session = await requireRole("ADMIN");
  if (isErrorResponse(session)) return session;

  const body = await request.json();
  const { action } = body;

  const reqRow = await prisma.registrationRequest.findUnique({ where: { id: Number(params.id) } });
  if (!reqRow) {
    return NextResponse.json({ error: "요청을 찾을 수 없습니다." }, { status: 404 });
  }
  if (reqRow.status !== "PENDING") {
    return NextResponse.json({ error: "이미 처리된 요청입니다." }, { status: 409 });
  }

  if (action === "reject") {
    const updated = await prisma.registrationRequest.update({
      where: { id: reqRow.id },
      data: { status: "REJECTED", reviewedAt: new Date() },
    });
    return NextResponse.json(updated);
  }

  if (action === "approve") {
    const existingUser = await prisma.user.findUnique({ where: { username: reqRow.username } });
    if (existingUser) {
      return NextResponse.json(
        { error: `아이디 "${reqRow.username}"가 이미 사용자 목록에 존재합니다.` },
        { status: 409 }
      );
    }

    await prisma.user.create({
      data: {
        username: reqRow.username,
        passwordHash: reqRow.passwordHash,
        name: reqRow.name,
        email: reqRow.email,
        company: reqRow.company,
        department: reqRow.department,
        role: reqRow.requestedRole,
      },
    });

    const updated = await prisma.registrationRequest.update({
      where: { id: reqRow.id },
      data: { status: "APPROVED", reviewedAt: new Date() },
    });
    return NextResponse.json(updated);
  }

  return NextResponse.json({ error: "action은 approve 또는 reject여야 합니다." }, { status: 400 });
}
