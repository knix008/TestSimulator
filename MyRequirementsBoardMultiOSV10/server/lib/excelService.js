import ExcelJS from 'exceljs';
import { renumberRequirementCodes } from './reqCode.js';
import { createTestCaseAllocator, generateTestCasesForRequirement } from './testCaseGenerator.js';
import { tryRegisterTcCode, allocateNextTcCode } from './testCaseCodeAllocator.js';

const VALID_PRIORITY = new Set(['LOW', 'MEDIUM', 'HIGH']);
const VALID_STATUS = new Set(['DRAFT', 'APPROVED', 'IN_PROGRESS', 'DONE']);
const REQUIREMENT_HEADERS = ['code', 'title', 'description', 'category', 'priority', 'status'];
const TEST_CASE_HEADERS = ['requirementcode', 'code', 'title', 'steps', 'expectedresult', 'status'];

const PRIORITY_ALIASES = {
  LOW: 'LOW', L: 'LOW', 낮음: 'LOW',
  MEDIUM: 'MEDIUM', M: 'MEDIUM', MED: 'MEDIUM', 보통: 'MEDIUM',
  HIGH: 'HIGH', H: 'HIGH', 높음: 'HIGH',
};

const STATUS_ALIASES = {
  DRAFT: 'DRAFT', 초안: 'DRAFT',
  APPROVED: 'APPROVED', 승인: 'APPROVED',
  IN_PROGRESS: 'IN_PROGRESS', 'IN PROGRESS': 'IN_PROGRESS', 진행중: 'IN_PROGRESS', 진행: 'IN_PROGRESS',
  DONE: 'DONE', 완료: 'DONE',
};

const TC_STATUS_ALIASES = {
  NOT_RUN: 'NOT_RUN', 'NOT RUN': 'NOT_RUN', 미실행: 'NOT_RUN',
  PASS: 'PASS', 통과: 'PASS',
  FAIL: 'FAIL', 실패: 'FAIL',
  BLOCKED: 'BLOCKED', 차단: 'BLOCKED',
};

function normalizeHeader(value) {
  return String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
}

function cellText(value) {
  if (value == null) return '';
  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text || '').join('').trim();
    }
    if (value.text != null) return String(value.text).trim();
    if (value.result != null) return cellText(value.result);
    if (value.hyperlink) return String(value.text || value.hyperlink).trim();
  }
  return String(value).trim();
}

function normalizePriority(raw) {
  if (!raw) return 'MEDIUM';
  const key = String(raw).trim().toUpperCase();
  const alias = PRIORITY_ALIASES[key] || PRIORITY_ALIASES[String(raw).trim()];
  return alias && VALID_PRIORITY.has(alias) ? alias : null;
}

function normalizeStatus(raw) {
  if (!raw) return 'DRAFT';
  const trimmed = String(raw).trim();
  const upper = trimmed.toUpperCase();
  const alias = STATUS_ALIASES[upper] || STATUS_ALIASES[trimmed];
  return alias && VALID_STATUS.has(alias) ? alias : null;
}

function normalizeTcStatus(raw) {
  if (!raw) return 'NOT_RUN';
  const trimmed = String(raw).trim();
  const upper = trimmed.toUpperCase();
  const alias = TC_STATUS_ALIASES[upper] || TC_STATUS_ALIASES[trimmed];
  return alias || null;
}

function findSheet(workbook, preferredNames) {
  for (const name of preferredNames) {
    const sheet = workbook.getWorksheet(name);
    if (sheet) return sheet;
  }
  return workbook.worksheets[0] || null;
}

function mapHeaderColumns(sheet, expectedHeaders) {
  const headerRow = sheet.getRow(1);
  const colIndex = {};
  headerRow.eachCell((cell, colNumber) => {
    const key = normalizeHeader(cellText(cell.value));
    if (expectedHeaders.includes(key)) colIndex[key] = colNumber;
  });
  return colIndex;
}

function readRequirementRows(sheet) {
  const colIndex = mapHeaderColumns(sheet, REQUIREMENT_HEADERS);
  if (!colIndex.title) {
    throw new Error('Requirements 시트에 title 컬럼이 필요합니다.');
  }

  const rows = [];
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const title = colIndex.title ? cellText(row.getCell(colIndex.title).value) : '';
    const code = colIndex.code ? cellText(row.getCell(colIndex.code).value) : '';
    if (!title && !code) continue;

    rows.push({
      rowNumber,
      code,
      title,
      description: colIndex.description ? cellText(row.getCell(colIndex.description).value) : '',
      category: colIndex.category ? cellText(row.getCell(colIndex.category).value) : '',
      priority: colIndex.priority ? cellText(row.getCell(colIndex.priority).value) : '',
      status: colIndex.status ? cellText(row.getCell(colIndex.status).value) : '',
    });
  }
  return rows;
}

function readTestCaseRows(sheet) {
  const colIndex = mapHeaderColumns(sheet, TEST_CASE_HEADERS);
  if (!colIndex.requirementcode || !colIndex.title) return [];

  const rows = [];
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const requirementCode = cellText(row.getCell(colIndex.requirementcode).value);
    const title = cellText(row.getCell(colIndex.title).value);
    if (!requirementCode || !title) continue;
    rows.push({
      rowNumber,
      requirementCode,
      code: colIndex.code ? cellText(row.getCell(colIndex.code).value) : '',
      title,
      steps: colIndex.steps ? cellText(row.getCell(colIndex.steps).value) : '',
      expectedResult: colIndex.expectedresult ? cellText(row.getCell(colIndex.expectedresult).value) : '',
      status: colIndex.status ? cellText(row.getCell(colIndex.status).value) : '',
    });
  }
  return rows;
}

async function insertTestCase(db, requirementId, userId, testCase, allocator) {
  let code = testCase.code
    ? tryRegisterTcCode(testCase.code, allocator.usedCodes, allocator.nextSequenceRef)
    : null;
  if (!code) code = allocateNextTcCode(allocator.usedCodes, allocator.nextSequenceRef);

  await db.prepare(
    `INSERT INTO test_cases (code, title, steps, expected_result, status, requirement_id, created_by_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    code,
    testCase.title,
    testCase.steps || '',
    testCase.expectedResult || '',
    testCase.status || 'NOT_RUN',
    requirementId,
    userId,
  );
  return code;
}

export async function importExcelBuffer(db, projectId, userId, buffer, options = {}) {
  const { generateTestCases = true } = options;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const reqSheet = findSheet(workbook, ['Requirements', '요구사항', 'Sheet1']);
  if (!reqSheet) throw new Error('요구사항 시트를 찾을 수 없습니다.');

  const requirementRows = readRequirementRows(reqSheet);
  const tcSheet = findSheet(workbook, ['TestCases', 'Test Cases', '테스트케이스']);
  const explicitTestCases = tcSheet ? readTestCaseRows(tcSheet) : [];

  const existingTcCodes = (await db.prepare('SELECT code FROM test_cases').all()).map((r) => r.code);
  const allocator = createTestCaseAllocator(existingTcCodes);

  const codeToRequirementId = new Map();
  const pendingGenerated = [];
  const result = {
    created: 0,
    updated: 0,
    testCasesCreated: 0,
    errors: [],
    warnings: [],
  };

  for (const row of requirementRows) {
    if (!row.title) {
      result.errors.push(`${row.rowNumber}행: title이 비어 있습니다.`);
      continue;
    }

    const priority = normalizePriority(row.priority);
    if (row.priority && !priority) {
      result.errors.push(`${row.rowNumber}행: priority 값이 올바르지 않습니다 (${row.priority}).`);
      continue;
    }
    const status = normalizeStatus(row.status);
    if (row.status && !status) {
      result.errors.push(`${row.rowNumber}행: status 값이 올바르지 않습니다 (${row.status}).`);
      continue;
    }

    const data = {
      title: row.title,
      description: row.description || '',
      category: row.category || '',
      priority: priority || 'MEDIUM',
      status: status || 'DRAFT',
    };

    try {
      let requirementId;
      let isNew = false;
      const lookupCode = row.code || null;

      if (lookupCode) {
        const existing = await db.prepare(
          'SELECT id FROM requirements WHERE project_id = ? AND code = ?',
        ).get(projectId, lookupCode);

        if (existing) {
          await db.prepare(
            `UPDATE requirements SET title = ?, description = ?, category = ?, priority = ?, status = ?, updated_at = datetime('now')
             WHERE id = ?`,
          ).run(data.title, data.description, data.category, data.priority, data.status, existing.id);
          requirementId = existing.id;
          result.updated += 1;
        } else {
          const insert = await db.prepare(
            `INSERT INTO requirements (project_id, code, title, description, category, priority, status, created_by_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          ).run(projectId, lookupCode, data.title, data.description, data.category, data.priority, data.status, userId);
          requirementId = insert.lastInsertRowid;
          isNew = true;
          result.created += 1;
        }
        codeToRequirementId.set(lookupCode, requirementId);
      } else {
        const tempCode = `__import_${Date.now()}_${row.rowNumber}`;
        const insert = await db.prepare(
          `INSERT INTO requirements (project_id, code, title, description, category, priority, status, created_by_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(projectId, tempCode, data.title, data.description, data.category, data.priority, data.status, userId);
        requirementId = insert.lastInsertRowid;
        isNew = true;
        result.created += 1;
        result.warnings.push(`${row.rowNumber}행: code가 없어 카테고리 기준 코드가 자동 부여됩니다.`);
      }

      const tcCountRow = await db.prepare(
        'SELECT COUNT(*) AS count FROM test_cases WHERE requirement_id = ?',
      ).get(requirementId);
      const existingTcCount = Number(tcCountRow?.count ?? 0);

      const sheetCases = lookupCode
        ? explicitTestCases.filter((tc) => tc.requirementCode === lookupCode)
        : [];

      if (sheetCases.length === 0 && generateTestCases && (isNew || existingTcCount === 0)) {
        pendingGenerated.push({ requirementId, data });
      }
    } catch (err) {
      result.errors.push(`${row.rowNumber}행${row.code ? ` (${row.code})` : ''}: ${err.message}`);
    }
  }

  for (const tcRow of explicitTestCases) {
    const requirementId = codeToRequirementId.get(tcRow.requirementCode);
    if (!requirementId) {
      result.warnings.push(`TestCases ${tcRow.rowNumber}행: 요구사항 코드 ${tcRow.requirementCode}를 찾을 수 없습니다.`);
      continue;
    }
    try {
      const tcStatus = normalizeTcStatus(tcRow.status);
      if (tcRow.status && !tcStatus) {
        result.warnings.push(`TestCases ${tcRow.rowNumber}행: status 무시 (${tcRow.status})`);
      }
      await insertTestCase(db, requirementId, userId, {
        code: tcRow.code,
        title: tcRow.title,
        steps: tcRow.steps,
        expectedResult: tcRow.expectedResult,
        status: tcStatus || 'NOT_RUN',
      }, allocator);
      result.testCasesCreated += 1;
    } catch (err) {
      result.errors.push(`TestCases ${tcRow.rowNumber}행 (${tcRow.requirementCode}): ${err.message}`);
    }
  }

  const requirementsWithSheetCases = new Set(
    explicitTestCases.map((tc) => tc.requirementCode),
  );

  for (const pending of pendingGenerated) {
    const reqCode = [...codeToRequirementId.entries()].find(([, id]) => id === pending.requirementId)?.[0];
    if (reqCode && requirementsWithSheetCases.has(reqCode)) continue;

    try {
      const generated = generateTestCasesForRequirement(pending.data, allocator);
      for (const testCase of generated) {
        await insertTestCase(db, pending.requirementId, userId, testCase, allocator);
        result.testCasesCreated += 1;
      }
    } catch (err) {
      result.errors.push(`테스트 케이스 자동 생성 실패 (요구사항 ID ${pending.requirementId}): ${err.message}`);
    }
  }

  const needsRenumber = requirementRows.some((row) => !row.code);
  if (needsRenumber) {
    await renumberRequirementCodes(db, projectId);
  }

  return result;
}

export async function exportProjectToWorkbook(db, projectId, requirementIds = null) {
  let sql = `
    SELECT r.*, u.name AS created_by_name
    FROM requirements r
    LEFT JOIN users u ON u.id = r.created_by_id
    WHERE r.project_id = ?
  `;
  const params = [projectId];
  if (requirementIds?.length) {
    sql += ` AND r.id IN (${requirementIds.map(() => '?').join(',')})`;
    params.push(...requirementIds);
  }
  sql += ' ORDER BY r.id ASC';

  const requirements = await db.prepare(sql).all(...params);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'MyRequirementsBoard';
  workbook.created = new Date();

  const reqSheet = workbook.addWorksheet('Requirements');
  reqSheet.columns = [
    { header: 'code', key: 'code', width: 14 },
    { header: 'title', key: 'title', width: 32 },
    { header: 'description', key: 'description', width: 48 },
    { header: 'category', key: 'category', width: 18 },
    { header: 'priority', key: 'priority', width: 12 },
    { header: 'status', key: 'status', width: 14 },
    { header: 'createdBy', key: 'createdBy', width: 16 },
    { header: 'createdAt', key: 'createdAt', width: 22 },
  ];
  reqSheet.getRow(1).font = { bold: true };

  const tcSheet = workbook.addWorksheet('TestCases');
  tcSheet.columns = [
    { header: 'requirementCode', key: 'requirementCode', width: 16 },
    { header: 'code', key: 'code', width: 14 },
    { header: 'title', key: 'title', width: 32 },
    { header: 'steps', key: 'steps', width: 48 },
    { header: 'expectedResult', key: 'expectedResult', width: 36 },
    { header: 'status', key: 'status', width: 12 },
  ];
  tcSheet.getRow(1).font = { bold: true };

  for (const req of requirements) {
    reqSheet.addRow({
      code: req.code,
      title: req.title,
      description: req.description || '',
      category: req.category || '',
      priority: req.priority,
      status: req.status,
      createdBy: req.created_by_name || '',
      createdAt: req.created_at || '',
    });

    const testCases = await db.prepare(
      'SELECT * FROM test_cases WHERE requirement_id = ? ORDER BY id',
    ).all(req.id);

    for (const tc of testCases) {
      tcSheet.addRow({
        requirementCode: req.code,
        code: tc.code,
        title: tc.title,
        steps: tc.steps || '',
        expectedResult: tc.expected_result || '',
        status: tc.status,
      });
    }
  }

  return workbook;
}

export async function exportProjectToBuffer(db, projectId, requirementIds = null) {
  const workbook = await exportProjectToWorkbook(db, projectId, requirementIds);
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function createSampleWorkbookBuffer() {
  const workbook = new ExcelJS.Workbook();
  const reqSheet = workbook.addWorksheet('Requirements');
  reqSheet.columns = [
    { header: 'code', key: 'code', width: 14 },
    { header: 'title', key: 'title', width: 32 },
    { header: 'description', key: 'description', width: 48 },
    { header: 'category', key: 'category', width: 18 },
    { header: 'priority', key: 'priority', width: 12 },
    { header: 'status', key: 'status', width: 14 },
  ];
  reqSheet.getRow(1).font = { bold: true };
  reqSheet.addRow({
    code: 'AUTH-01',
    title: '사용자 로그인',
    description: '등록된 사용자는 아이디와 비밀번호로 로그인할 수 있어야 한다.',
    category: '인증',
    priority: 'HIGH',
    status: 'DRAFT',
  });
  reqSheet.addRow({
    code: 'AUTH-02',
    title: '비밀번호 재설정',
    description: '사용자는 이메일을 통해 비밀번호를 재설정할 수 있어야 한다.',
    category: '인증',
    priority: 'MEDIUM',
    status: 'DRAFT',
  });

  const tcSheet = workbook.addWorksheet('TestCases');
  tcSheet.columns = [
    { header: 'requirementCode', key: 'requirementCode', width: 16 },
    { header: 'code', key: 'code', width: 14 },
    { header: 'title', key: 'title', width: 32 },
    { header: 'steps', key: 'steps', width: 48 },
    { header: 'expectedResult', key: 'expectedResult', width: 36 },
    { header: 'status', key: 'status', width: 12 },
  ];
  tcSheet.getRow(1).font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
