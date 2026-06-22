import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, hasRole } from "../../../../lib/auth";
import { connectDb, isDbConnected, getDbConfig, hasSchema } from "../../../../lib/dbRuntime";
import { describeDbError } from "../../../../lib/dbErrorMessage";

// 부트스트랩(아직 아무 DB에도 연결되지 않은 상태)에서는 누구나 접속을 시도할 수 있다.
// 이미 연결된 뒤에는 관리자만 다른 DB로 재접속할 수 있다.
export async function GET() {
  const connected = isDbConnected();
  const schemaReady = connected ? await hasSchema() : false;
  return NextResponse.json({ connected, schemaReady, config: getDbConfig() });
}

export async function POST(request) {
  if (isDbConnected()) {
    const session = await getServerSession(authOptions);
    if (!session?.user || !hasRole(session.user.role, "ADMIN")) {
      return NextResponse.json({ error: "DB 재접속은 관리자만 할 수 있습니다." }, { status: 403 });
    }
  }

  const body = await request.json();
  const { host, port, database, user, password } = body;
  if (!host || !database || !user) {
    return NextResponse.json({ error: "host, database, user는 필수입니다." }, { status: 400 });
  }

  try {
    await connectDb({ host, port, database, user, password });
  } catch (err) {
    return NextResponse.json({ error: `DB 접속에 실패했습니다: ${describeDbError(err)}` }, { status: 400 });
  }

  const schemaReady = await hasSchema();
  return NextResponse.json({ ok: true, schemaReady });
}
