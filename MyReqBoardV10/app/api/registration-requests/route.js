import { NextResponse } from "next/server";
import prisma from "../../../lib/prisma";
import { requireRole, isErrorResponse } from "../../../lib/apiAuth";

export async function GET() {
  const session = await requireRole("ADMIN");
  if (isErrorResponse(session)) return session;

  const requests = await prisma.registrationRequest.findMany({
    orderBy: { id: "desc" },
  });
  return NextResponse.json(requests);
}
