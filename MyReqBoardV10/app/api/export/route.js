import ExcelJS from "exceljs";
import prisma from "../../../lib/prisma";
import { requireRole, isErrorResponse } from "../../../lib/apiAuth";

export async function GET(request) {
  const session = await requireRole("VIEWER");
  if (isErrorResponse(session)) return session;

  const { searchParams } = new URL(request.url);
  const idsParam = searchParams.get("ids");
  const where = idsParam
    ? { id: { in: idsParam.split(",").map(Number).filter((n) => !Number.isNaN(n)) } }
    : {};

  const requirements = await prisma.requirement.findMany({
    where,
    include: { createdBy: { select: { name: true } }, testCases: true },
    orderBy: { id: "asc" },
  });

  const workbook = new ExcelJS.Workbook();

  const reqSheet = workbook.addWorksheet("Requirements");
  reqSheet.columns = [
    { header: "code", key: "code", width: 14 },
    { header: "title", key: "title", width: 30 },
    { header: "description", key: "description", width: 40 },
    { header: "category", key: "category", width: 16 },
    { header: "priority", key: "priority", width: 12 },
    { header: "status", key: "status", width: 14 },
    { header: "createdBy", key: "createdBy", width: 16 },
    { header: "createdAt", key: "createdAt", width: 20 },
  ];
  requirements.forEach((r) => {
    reqSheet.addRow({
      code: r.code,
      title: r.title,
      description: r.description || "",
      category: r.category || "",
      priority: r.priority,
      status: r.status,
      createdBy: r.createdBy?.name || "",
      createdAt: r.createdAt.toISOString(),
    });
  });

  const tcSheet = workbook.addWorksheet("TestCases");
  tcSheet.columns = [
    { header: "requirementCode", key: "requirementCode", width: 16 },
    { header: "code", key: "code", width: 14 },
    { header: "title", key: "title", width: 30 },
    { header: "steps", key: "steps", width: 40 },
    { header: "expectedResult", key: "expectedResult", width: 30 },
    { header: "status", key: "status", width: 12 },
  ];
  requirements.forEach((r) => {
    r.testCases.forEach((tc) => {
      tcSheet.addRow({
        requirementCode: r.code,
        code: tc.code,
        title: tc.title,
        steps: tc.steps || "",
        expectedResult: tc.expectedResult || "",
        status: tc.status,
      });
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="requirements_export_${Date.now()}.xlsx"`,
    },
  });
}
