import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import prisma from "../../../lib/prisma";
import { requireRole, isErrorResponse } from "../../../lib/apiAuth";

const VALID_PRIORITY = ["LOW", "MEDIUM", "HIGH"];
const VALID_STATUS = ["DRAFT", "APPROVED", "IN_PROGRESS", "DONE"];
const EXPECTED_HEADERS = ["code", "title", "description", "category", "priority", "status"];

export async function POST(request) {
  const session = await requireRole("EDITOR");
  if (isErrorResponse(session)) return session;

  const formData = await request.formData();
  const file = formData.get("file");
  if (!file) {
    return NextResponse.json({ error: "업로드할 파일이 없습니다." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return NextResponse.json({ error: "시트를 찾을 수 없습니다." }, { status: 400 });
  }

  const headerRow = sheet.getRow(1).values; // 1-based, index 0 is empty
  const colIndex = {};
  headerRow.forEach((value, idx) => {
    if (!value) return;
    const key = String(value).trim().toLowerCase();
    if (EXPECTED_HEADERS.includes(key)) colIndex[key] = idx;
  });

  if (!colIndex.code || !colIndex.title) {
    return NextResponse.json(
      { error: "code, title 컬럼이 포함된 헤더 행이 필요합니다." },
      { status: 400 }
    );
  }

  let created = 0;
  let updated = 0;
  const errors = [];

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    const code = colIndex.code ? String(row.getCell(colIndex.code).value ?? "").trim() : "";
    if (!code) continue;

    const title = colIndex.title ? String(row.getCell(colIndex.title).value ?? "").trim() : "";
    const description = colIndex.description ? String(row.getCell(colIndex.description).value ?? "").trim() : "";
    const category = colIndex.category ? String(row.getCell(colIndex.category).value ?? "").trim() : "";
    const priorityRaw = colIndex.priority ? String(row.getCell(colIndex.priority).value ?? "").trim().toUpperCase() : "";
    const statusRaw = colIndex.status ? String(row.getCell(colIndex.status).value ?? "").trim().toUpperCase() : "";

    if (!title) {
      errors.push(`${rowNumber}행: title이 비어 있습니다.`);
      continue;
    }
    if (priorityRaw && !VALID_PRIORITY.includes(priorityRaw)) {
      errors.push(`${rowNumber}행: priority 값이 올바르지 않습니다 (${priorityRaw}).`);
      continue;
    }
    if (statusRaw && !VALID_STATUS.includes(statusRaw)) {
      errors.push(`${rowNumber}행: status 값이 올바르지 않습니다 (${statusRaw}).`);
      continue;
    }

    const data = {
      title,
      description: description || null,
      category: category || null,
      priority: priorityRaw || "MEDIUM",
      status: statusRaw || "DRAFT",
    };

    try {
      const existing = await prisma.requirement.findUnique({ where: { code } });
      if (existing) {
        await prisma.requirement.update({ where: { code }, data });
        updated++;
      } else {
        await prisma.requirement.create({
          data: { code, ...data, createdById: Number(session.user.id) },
        });
        created++;
      }
    } catch (err) {
      errors.push(`${rowNumber}행 (${code}): ${err.message}`);
    }
  }

  return NextResponse.json({ created, updated, errors });
}
