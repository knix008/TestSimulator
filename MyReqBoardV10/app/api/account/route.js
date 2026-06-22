import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "../../../lib/prisma";
import { requireRole, isErrorResponse } from "../../../lib/apiAuth";

const ACCOUNT_SELECT = {
  id: true,
  username: true,
  name: true,
  email: true,
  company: true,
  department: true,
  role: true,
};

export async function GET() {
  const session = await requireRole("VIEWER");
  if (isErrorResponse(session)) return session;

  const me = await prisma.user.findUnique({
    where: { id: Number(session.user.id) },
    select: ACCOUNT_SELECT,
  });
  return NextResponse.json(me);
}

export async function PUT(request) {
  const session = await requireRole("VIEWER");
  if (isErrorResponse(session)) return session;

  const body = await request.json();
  const { username, name, password, currentPassword, email, company, department } = body;

  if (!currentPassword) {
    return NextResponse.json({ error: "현재 비밀번호를 입력해야 합니다." }, { status: 400 });
  }

  const me = await prisma.user.findUnique({ where: { id: Number(session.user.id) } });
  const valid = await bcrypt.compare(currentPassword, me.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: "현재 비밀번호가 올바르지 않습니다." }, { status: 403 });
  }

  const data = {};
  if (username) data.username = username;
  if (name) data.name = name;
  if (email !== undefined) data.email = email || null;
  if (company !== undefined) data.company = company || null;
  if (department !== undefined) data.department = department || null;
  if (password) data.passwordHash = await bcrypt.hash(password, 10);

  try {
    const updated = await prisma.user.update({
      where: { id: Number(session.user.id) },
      data,
      select: ACCOUNT_SELECT,
    });
    return NextResponse.json(updated);
  } catch (err) {
    if (err.code === "P2002") {
      return NextResponse.json({ error: `아이디 "${username}"가 이미 존재합니다.` }, { status: 409 });
    }
    throw err;
  }
}
