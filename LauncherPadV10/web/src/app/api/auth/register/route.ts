import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { z } from "zod"

const schema = z.object({
  name: z.string().min(2, "이름은 2자 이상이어야 합니다"),
  email: z.email("유효한 이메일을 입력해주세요"),
  password: z.string().min(8, "비밀번호는 8자 이상이어야 합니다"),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = schema.safeParse(body)

    if (!parsed.success) {
      const issues = (parsed.error as { issues?: { message: string }[] }).issues
        ?? (parsed.error as { errors?: { message: string }[] }).errors
      return NextResponse.json(
        { error: issues?.[0]?.message ?? "입력값이 올바르지 않습니다" },
        { status: 400 }
      )
    }

    const { name, email, password } = parsed.data

    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      return NextResponse.json(
        { error: "이미 사용 중인 이메일입니다" },
        { status: 409 }
      )
    }

    const hashed = await bcrypt.hash(password, 12)
    const user = await prisma.user.create({
      data: { name, email, password: hashed },
      select: { id: true, name: true, email: true },
    })

    return NextResponse.json({ user }, { status: 201 })
  } catch {
    return NextResponse.json({ error: "서버 오류가 발생했습니다" }, { status: 500 })
  }
}
