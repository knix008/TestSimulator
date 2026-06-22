import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "../../../../lib/prisma";
import { requireRole, isErrorResponse } from "../../../../lib/apiAuth";

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

export async function PUT(request, { params }) {
  const session = await requireRole("ADMIN");
  if (isErrorResponse(session)) return session;

  const body = await request.json();
  const { name, role, isActive, password, email, company, department } = body;

  const data = {};
  if (name !== undefined) data.name = name;
  if (role !== undefined) data.role = role;
  if (isActive !== undefined) data.isActive = isActive;
  if (email !== undefined) data.email = email || null;
  if (company !== undefined) data.company = company || null;
  if (department !== undefined) data.department = department || null;
  if (password) data.passwordHash = await bcrypt.hash(password, 10);

  try {
    const user = await prisma.user.update({
      where: { id: Number(params.id) },
      data,
      select: USER_SELECT,
    });
    return NextResponse.json(user);
  } catch (err) {
    if (err.code === "P2025") {
      return NextResponse.json({ error: "사용자를 찾을 수 없습니다." }, { status: 404 });
    }
    throw err;
  }
}
