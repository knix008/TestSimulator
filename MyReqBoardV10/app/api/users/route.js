import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "../../../lib/prisma";
import { requireRole, isErrorResponse } from "../../../lib/apiAuth";

const USER_SELECT = {
  id: true,
  username: true,
  name: true,
  email: true,
  company: true,
  department: true,
  role: true,
  isActive: true,
  createdAt: true,
};

export async function GET() {
  const session = await requireRole("ADMIN");
  if (isErrorResponse(session)) return session;

  const users = await prisma.user.findMany({
    select: USER_SELECT,
    orderBy: { id: "asc" },
  });
  return NextResponse.json(users);
}

export async function POST(request) {
  const session = await requireRole("ADMIN");
  if (isErrorResponse(session)) return session;

  const body = await request.json();
  const { username, password, name, role, email, company, department } = body;

  if (!username || !password || !name) {
    return NextResponse.json({ error: "username, password, name은 필수입니다." }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  try {
    const user = await prisma.user.create({
      data: {
        username,
        passwordHash,
        name,
        role: role || "VIEWER",
        email: email || null,
        company: company || null,
        department: department || null,
      },
      select: USER_SELECT,
    });
    return NextResponse.json(user, { status: 201 });
  } catch (err) {
    if (err.code === "P2002") {
      return NextResponse.json({ error: `아이디 "${username}"가 이미 존재합니다.` }, { status: 409 });
    }
    throw err;
  }
}
