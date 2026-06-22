import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "../../../lib/prisma";
import { isDbConnected } from "../../../lib/dbRuntime";

const ALLOWED_ROLES = ["EDITOR", "VIEWER"];

export async function POST(request) {
  if (!isDbConnected()) {
    return NextResponse.json({ error: "DB에 연결되어 있지 않습니다." }, { status: 503 });
  }

  const body = await request.json();
  const { username, password, name, email, company, department, requestedRole } = body;

  if (!username || !password || !name) {
    return NextResponse.json({ error: "username, password, name은 필수입니다." }, { status: 400 });
  }
  if (requestedRole && !ALLOWED_ROLES.includes(requestedRole)) {
    return NextResponse.json({ error: "요청 권한은 EDITOR 또는 VIEWER만 선택할 수 있습니다." }, { status: 400 });
  }

  const existingUser = await prisma.user.findUnique({ where: { username } });
  if (existingUser) {
    return NextResponse.json({ error: `아이디 "${username}"는 이미 사용 중입니다.` }, { status: 409 });
  }
  const existingRequest = await prisma.registrationRequest.findFirst({
    where: { username, status: "PENDING" },
  });
  if (existingRequest) {
    return NextResponse.json({ error: `아이디 "${username}"로 이미 등록 요청이 대기 중입니다.` }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.registrationRequest.create({
    data: {
      username,
      passwordHash,
      name,
      email: email || null,
      company: company || null,
      department: department || null,
      requestedRole: requestedRole || "VIEWER",
    },
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}
