import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions, hasRole } from "./auth";
import { isDbConnected } from "./dbRuntime";

// API 라우트에서 호출: DB 미연결/세션 없음/권한 부족이면 NextResponse를 반환하고,
// 통과하면 session 객체를 반환한다. 호출부에서 반환값이 NextResponse인지 확인해야 한다.
export async function requireRole(minRole) {
  if (!isDbConnected()) {
    return NextResponse.json({ error: "DB에 연결되어 있지 않습니다." }, { status: 503 });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  if (!hasRole(session.user.role, minRole)) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }
  return session;
}

export function isErrorResponse(value) {
  return value instanceof NextResponse;
}
