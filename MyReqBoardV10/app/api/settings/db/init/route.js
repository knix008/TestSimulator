import { NextResponse } from "next/server";
import { exec } from "child_process";
import bcrypt from "bcryptjs";
import { getServerSession } from "next-auth";
import { authOptions, hasRole } from "../../../../../lib/auth";
import { connectDb, isDbConnected, getPrisma } from "../../../../../lib/dbRuntime";
import { describeDbError } from "../../../../../lib/dbErrorMessage";

// 현재 연결된 DB에 테이블이 없으면 prisma db push로 스키마를 생성한다.
// 이미 연결된 뒤에는 관리자만 실행할 수 있다.
export async function POST(request) {
  if (isDbConnected()) {
    const session = await getServerSession(authOptions);
    if (!session?.user || !hasRole(session.user.role, "ADMIN")) {
      return NextResponse.json({ error: "관리자만 실행할 수 있습니다." }, { status: 403 });
    }
  }

  const body = await request.json();
  const { host, port, database, user, password } = body;
  if (!host || !database || !user) {
    return NextResponse.json({ error: "host, database, user는 필수입니다." }, { status: 400 });
  }

  const url = `mysql://${encodeURIComponent(user)}:${encodeURIComponent(password || "")}@${host}:${port || 3306}/${database}`;

  const result = await new Promise((resolve) => {
    exec(
      "npx prisma db push --accept-data-loss --skip-generate",
      { cwd: process.cwd(), timeout: 60000, env: { ...process.env, DATABASE_URL: url } },
      (error, stdout, stderr) => {
        if (error) {
          resolve({ ok: false, detail: stderr || stdout || error.message });
        } else {
          resolve({ ok: true, log: stdout });
        }
      }
    );
  });

  if (!result.ok) {
    const friendly = describeDbError({ message: result.detail });
    return NextResponse.json(
      { error: `테이블 생성/동기화에 실패했습니다: ${friendly}`, detail: result.detail },
      { status: 500 }
    );
  }

  // 스키마 적용 후 동일 정보로 다시 연결해 최신 상태를 메모리에 반영한다.
  try {
    await connectDb({ host, port, database, user, password });
  } catch (err) {
    return NextResponse.json(
      { error: `스키마는 생성되었지만 재접속에 실패했습니다: ${describeDbError(err)}` },
      { status: 500 }
    );
  }

  // 사용자 테이블이 비어 있으면(최초 생성) 기본 admin 계정을 만들어 둔다.
  const client = getPrisma();
  const userCount = await client.user.count();
  if (userCount === 0) {
    const passwordHash = await bcrypt.hash("admin", 10);
    await client.user.create({
      data: { username: "admin", passwordHash, name: "관리자", role: "ADMIN" },
    });
  }

  return NextResponse.json({ ok: true, log: result.log });
}
