import ExcelJS from 'exceljs';
import { renumberRequirementCodes, tempCode, ensureRequirementCodes } from './reqCode.js';
import { renumberTestCaseCodes } from './tcCode.js';
import { createTestCaseAllocator, generateTestCasesForRequirement } from './testCaseGenerator.js';
import { tryRegisterTcCode, allocateNextTcCode } from './testCaseCodeAllocator.js';

const VALID_PRIORITY = new Set(['LOW', 'MEDIUM', 'HIGH']);
const VALID_STATUS = new Set(['DRAFT', 'APPROVED', 'IN_PROGRESS', 'DONE']);

const HEADER_ALIASES = {
  classification: [
    'srsid', 'rfpid', 'requirementid', 'requirementcode', 'reqid', 'reqcode',
    'requirementno', 'reqno', 'code',
    '코드', '요구사항코드', '요구사항id', '요구사항번호', '분류',
  ],
  title: [
    'title', 'name', 'reqtitle', 'requirementtitle', 'subject', 'summary',
    'srs명', '요구사항명', '요구사항명칭', '기능명',
    '제목', '요구사항', '요구사항제목', '기능', '항목',
  ],
  description: [
    'description', 'desc', 'detail', 'details', 'content', 'body', 'note', 'notes',
    '요구사항내용', '요구사항정의설명', '요구사항정의', '요구사항설명', '정의설명',
    '제안내용', '제안내용제약사항', '상세내용', '상세설명',
    '설명', '상세', '내용', '비고',
  ],
  descriptionExtra: [
    '제약사항', '제약', '제안내용제약사항', '제안내용', 'constraints', 'constraint',
  ],
  category: [
    'category', 'cat', 'group', 'module', 'area', 'domain', 'type', 'section', 'feature',
    '구분', '카테고리', '모듈', '영역', '기능분류', '그룹',
  ],
  majorCategory: ['대분류', 'major', 'majorcategory', 'majorcategoryname'],
  minorCategory: ['중분류', 'minor', 'minorcategory', 'subcategory', 'subcategoryname'],
  priority: ['priority', 'pri', 'importance', 'level', '우선순위', '중요도', '등급', '난이도'],
  status: ['status', 'state', 'progress', '수용여부', '상태', '진행상태', '진행', '상태값'],
};

const TC_HEADER_ALIASES = {
  requirementcode: [
    'requirementcode', 'reqcode', 'requirementid', 'reqid', 'parentcode', 'parent', 'linkedreq',
    '요구사항코드', '요구사항id', '연결요구사항', '요구사항',
  ],
  code: ['code', 'tcode', 'testcasecode', 'tcid', '코드', '테스트케이스코드', 'tc코드'],
  title: ['title', 'name', 'testcase', 'testcasetitle', 'casetitle', '제목', '테스트케이스', '케이스명'],
  description: ['description', 'desc', 'summary', 'detail', '설명', '개요', '상세설명'],
  steps: ['steps', 'step', 'procedure', 'action', 'teststeps', '단계', '절차', '수행절차', '테스트절차'],
  expectedresult: [
    'expectedresult', 'expected', 'result', 'outcome', 'verification',
    '기대결과', '예상결과', '결과', '기대값',
  ],
  status: ['status', 'state', 'resultstatus', '상태', '실행결과', '테스트상태'],
};

const REQ_SHEET_NAMES = [
  'Requirements', 'Requirement', 'Reqs', 'REQ', '요구사항', '요구사항목록',
  'SRS', 'RFP', 'Sheet1', 'Sheet 1', 'Data', '목록', 'List',
];

const EXCLUDED_REQ_SHEET_NAMES = [
  '표지', '개정이력', 'cover', 'revision', 'history', '목차', 'index', 'changelog', '변경이력',
];

const PREFERRED_REQ_SHEET_NAMES = ['srs', 'rfp', 'requirements', 'requirement', '요구사항', 'req'];

const TC_SHEET_NAMES = [
  'TestCases', 'Test Cases', 'TestCase', 'TC', '테스트케이스', '테스트 케이스', 'Test',
];

const PRIORITY_ALIASES = {
  LOW: 'LOW', L: 'LOW', 낮음: 'LOW',
  MEDIUM: 'MEDIUM', M: 'MEDIUM', MED: 'MEDIUM', 보통: 'MEDIUM',
  HIGH: 'HIGH', H: 'HIGH', 높음: 'HIGH',
};

const STATUS_ALIASES = {
  DRAFT: 'DRAFT', 초안: 'DRAFT',
  APPROVED: 'APPROVED', 승인: 'APPROVED', 수용: 'APPROVED', Y: 'APPROVED', YES: 'APPROVED', 예: 'APPROVED',
  '○': 'APPROVED', O: 'APPROVED', '◯': 'APPROVED',
  IN_PROGRESS: 'IN_PROGRESS', 'IN PROGRESS': 'IN_PROGRESS', 진행중: 'IN_PROGRESS', 진행: 'IN_PROGRESS',
  DONE: 'DONE', 완료: 'DONE',
};

const TC_STATUS_ALIASES = {
  NOT_RUN: 'NOT_RUN', 'NOT RUN': 'NOT_RUN', 미실행: 'NOT_RUN',
  PASS: 'PASS', 통과: 'PASS',
  FAIL: 'FAIL', 실패: 'FAIL',
  BLOCKED: 'BLOCKED', 차단: 'BLOCKED',
};

/** UI/API column mapping field ids (skip = exclude column) */
export const REQUIREMENT_IMPORT_FIELDS = [
  'classification',
  'title',
  'description',
  'descriptionExtra',
  'majorCategory',
  'minorCategory',
  'category',
  'priority',
  'status',
];

function columnToLetter(colNumber) {
  let n = colNumber;
  let result = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

function suggestFieldForHeader(headerText) {
  const key = normalizeHeader(headerText);
  if (!key) return 'skip';

  const classificationCandidates = [];
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    if (field === 'classification') {
      for (const alias of aliases) {
        if (headerMatchesAlias(key, alias)) classificationCandidates.push(alias);
      }
      continue;
    }
    if (aliases.some((alias) => headerMatchesAlias(key, alias))) {
      return field;
    }
  }

  if (classificationCandidates.length > 0) {
    const priority = HEADER_ALIASES.classification || [];
    classificationCandidates.sort((a, b) => {
      const aIdx = priority.indexOf(a);
      const bIdx = priority.indexOf(b);
      return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
    });
    return 'classification';
  }

  return 'skip';
}

function normalizeHeader(value) {
  return String(value || '')
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_\-./,():;[\]{}]+/g, '');
}

function headerMatchesAlias(key, alias) {
  if (!key || !alias) return false;
  if (key === alias) return true;
  if (alias.length >= 4 && key.includes(alias)) return true;
  if (key.length >= 4 && alias.includes(key)) return true;
  return false;
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

function mapHeaderColumnsFromRow(sheet, rowNumber, aliasMap) {
  const row = sheet.getRow(rowNumber);
  const colIndex = {};
  const classificationCandidates = [];

  row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const key = normalizeHeader(cellText(cell.value));
    if (!key) return;

    for (const [field, aliases] of Object.entries(aliasMap)) {
      if (field === 'classification') {
        for (const alias of aliases) {
          if (headerMatchesAlias(key, alias)) {
            classificationCandidates.push({ colNumber, alias });
          }
        }
        continue;
      }
      if (colIndex[field] != null) continue;
      if (aliases.some((alias) => headerMatchesAlias(key, alias))) {
        colIndex[field] = colNumber;
      }
    }
  });

  if (classificationCandidates.length > 0) {
    const priority = aliasMap.classification || [];
    classificationCandidates.sort((a, b) => {
      const aIdx = priority.indexOf(a.alias);
      const bIdx = priority.indexOf(b.alias);
      return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
    });
    colIndex._classificationColumns = classificationCandidates.map((candidate) => candidate.colNumber);
  }

  return colIndex;
}

function truncateTitle(text, maxLen = 512) {
  const trimmed = String(text || '').trim();
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen - 3)}...`;
}

function deriveRequirementTitle(row) {
  if (row.title?.trim()) return truncateTitle(row.title);
  if (row.description?.trim()) {
    const firstLine = row.description.trim().split(/\r?\n/)[0];
    return truncateTitle(firstLine);
  }
  if (row.classification?.trim()) return truncateTitle(row.classification);
  if (row.category?.trim()) return truncateTitle(`${row.category} (${row.rowNumber}행)`);
  return `요구사항 ${row.rowNumber}행`;
}

function deriveTestCaseTitle(row) {
  if (row.title?.trim()) return truncateTitle(row.title);
  if (row.description?.trim()) {
    const firstLine = row.description.trim().split(/\r?\n/)[0];
    return truncateTitle(firstLine);
  }
  if (row.steps?.trim()) {
    const firstLine = row.steps.trim().split(/\r?\n/)[0];
    return truncateTitle(firstLine);
  }
  if (row.code?.trim()) return truncateTitle(row.code);
  return `테스트 케이스 ${row.rowNumber}행`;
}

const REQ_DATA_FIELDS = ['code', 'title', 'description', 'category', 'priority', 'status'];
const MIN_REQ_HEADER_SCORE = 4;

function scoreRequirementHeader(colIndex) {
  let score = 0;
  if (colIndex.classification || colIndex._classificationColumns?.length) score += 2;
  if (colIndex.title) score += 2;
  if (colIndex.description) score += 2;
  if (colIndex.descriptionExtra) score += 1;
  if (colIndex.category || colIndex.majorCategory || colIndex.minorCategory) score += 1;
  if (colIndex.priority) score += 1;
  if (colIndex.status) score += 1;
  return score;
}

function isExcludedReqSheet(sheetName) {
  const normalized = normalizeHeader(sheetName);
  return EXCLUDED_REQ_SHEET_NAMES.some((name) => normalized.includes(normalizeHeader(name)));
}

function sheetNameBonus(sheetName) {
  const normalized = normalizeHeader(sheetName);
  for (let i = 0; i < PREFERRED_REQ_SHEET_NAMES.length; i += 1) {
    if (normalized.includes(normalizeHeader(PREFERRED_REQ_SHEET_NAMES[i]))) {
      return (PREFERRED_REQ_SHEET_NAMES.length - i) * 2;
    }
  }
  return 0;
}

function countRequirementDataRows(sheet, headerRow) {
  let count = 0;
  for (let rowNumber = headerRow + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    let hasData = false;
    row.eachCell({ includeEmpty: false }, (cell) => {
      if (cellText(cell.value)) hasData = true;
    });
    if (hasData) count += 1;
  }
  return count;
}

function detectRequirementHeaderRow(sheet, { minScore = MIN_REQ_HEADER_SCORE } = {}) {
  const maxScan = Math.min(sheet.rowCount || 0, 30);
  let bestMatch = null;
  let bestScore = 0;

  for (let rowNumber = 1; rowNumber <= maxScan; rowNumber += 1) {
    const colIndex = mapHeaderColumnsFromRow(sheet, rowNumber, HEADER_ALIASES);
    const score = scoreRequirementHeader(colIndex);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = { headerRow: rowNumber, colIndex };
    }
  }

  return bestScore >= minScore ? bestMatch : null;
}

function detectTestCaseHeaderRow(sheet) {
  const maxScan = Math.min(sheet.rowCount || 0, 20);
  for (let rowNumber = 1; rowNumber <= maxScan; rowNumber += 1) {
    const colIndex = mapHeaderColumnsFromRow(sheet, rowNumber, TC_HEADER_ALIASES);
    if (colIndex.requirementcode) {
      return { headerRow: rowNumber, colIndex };
    }
  }
  return null;
}

const NAMED_REQUIREMENT_SHEETS = [
  'Requirements', 'Requirement', 'Reqs', 'REQ', '요구사항', '요구사항목록',
];

function findRequirementsSheet(workbook) {
  let bestSheet = null;
  let bestRank = -1;

  const consider = (sheet) => {
    if (!sheet || isExcludedReqSheet(sheet.name)) return;
    const detected = detectRequirementHeaderRow(sheet);
    if (!detected) return;

    const headerScore = scoreRequirementHeader(detected.colIndex);
    const dataRows = countRequirementDataRows(sheet, detected.headerRow);
    const rank = headerScore + sheetNameBonus(sheet.name) + Math.min(dataRows / 20, 10);

    if (rank > bestRank) {
      bestRank = rank;
      bestSheet = sheet;
    }
  };

  for (const name of [...NAMED_REQUIREMENT_SHEETS, ...REQ_SHEET_NAMES]) {
    consider(workbook.getWorksheet(name));
  }
  for (const sheet of workbook.worksheets) {
    consider(sheet);
  }

  return bestSheet;
}

function findTestCasesSheet(workbook, reqSheet) {
  for (const name of TC_SHEET_NAMES) {
    const sheet = workbook.getWorksheet(name);
    if (sheet && sheet !== reqSheet) return sheet;
  }
  for (const sheet of workbook.worksheets) {
    if (sheet === reqSheet) continue;
    if (detectTestCaseHeaderRow(sheet)) return sheet;
  }
  return null;
}

function rowHasRequirementData(values) {
  return values.some((value) => Boolean(String(value || '').trim()));
}

function readCellText(row, colIndex, field) {
  const multiKey = `_${field}Columns`;
  if (colIndex[multiKey]?.length) {
    if (field === 'classification') {
      for (const col of colIndex[multiKey]) {
        const value = cellText(row.getCell(col).value);
        if (value) return value;
      }
      return '';
    }
    return colIndex[multiKey]
      .map((col) => cellText(row.getCell(col).value))
      .filter(Boolean)
      .join('\n\n');
  }
  if (!colIndex[field]) return '';
  return cellText(row.getCell(colIndex[field]).value);
}

function colIndexFromColumnMapping(columns) {
  const colIndex = {};

  for (const column of columns) {
    if (!column.included || column.field === 'skip' || !column.field) continue;
    const index = Number(column.index);
    if (!index) continue;

    if (column.field === 'description' || column.field === 'descriptionExtra' || column.field === 'classification') {
      const multiKey = `_${column.field}Columns`;
      if (!colIndex[multiKey]) colIndex[multiKey] = [];
      colIndex[multiKey].push(index);
      continue;
    }

    if (colIndex[column.field] == null) {
      colIndex[column.field] = index;
    }
  }

  return colIndex;
}

function colIndexToFieldByColumn(colIndex) {
  const fieldByColumn = {};
  for (const [field, colNumber] of Object.entries(colIndex)) {
    if (field.startsWith('_') || typeof colNumber !== 'number') continue;
    fieldByColumn[colNumber] = field;
  }
  for (const field of ['description', 'descriptionExtra', 'classification']) {
    const multiKey = `_${field}Columns`;
    if (colIndex[multiKey]) {
      for (const colNumber of colIndex[multiKey]) {
        fieldByColumn[colNumber] = field;
      }
    }
  }
  return fieldByColumn;
}

function extractSheetColumns(sheet, headerRow, autoColIndex = {}) {
  const row = sheet.getRow(headerRow);
  const fieldByColumn = colIndexToFieldByColumn(autoColIndex);
  const columns = [];

  row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const header = cellText(cell.value);
    const autoField = fieldByColumn[colNumber];
    const field = autoField || suggestFieldForHeader(header);
    columns.push({
      index: colNumber,
      letter: columnToLetter(colNumber),
      header,
      field,
      suggestedField: field,
      included: field !== 'skip',
    });
  });

  columns.sort((a, b) => a.index - b.index);
  return columns;
}

function listWorkbookSheets(workbook) {
  return workbook.worksheets.map((sheet) => {
    const excluded = isExcludedReqSheet(sheet.name);
    const detected = detectRequirementHeaderRow(sheet, { minScore: 2 });
    const headerScore = detected ? scoreRequirementHeader(detected.colIndex) : 0;
    const dataRowCount = detected ? countRequirementDataRows(sheet, detected.headerRow) : 0;
    const rank = detected
      ? headerScore + sheetNameBonus(sheet.name) + Math.min(dataRowCount / 20, 10)
      : -1;

    return {
      name: sheet.name,
      excluded,
      headerRow: detected?.headerRow ?? null,
      headerScore,
      dataRowCount,
      rank,
    };
  }).sort((a, b) => b.rank - a.rank);
}

function resolveRequirementsSheet(workbook, sheetName) {
  if (sheetName) {
    const sheet = workbook.getWorksheet(sheetName);
    if (!sheet) {
      throw new Error(`시트 "${sheetName}"을 찾을 수 없습니다.`);
    }
    return sheet;
  }

  const reqSheet = findRequirementsSheet(workbook);
  if (!reqSheet) {
    throw new Error('요구사항 시트를 찾을 수 없습니다. code, description, category 등 알려진 헤더가 포함된 시트가 필요합니다.');
  }
  return reqSheet;
}

function buildCategory(colIndex, row) {
  const parts = [];
  const seen = new Set();
  const add = (value) => {
    const trimmed = String(value || '').trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    parts.push(trimmed);
  };

  add(readCellText(row, colIndex, 'majorCategory'));
  add(readCellText(row, colIndex, 'minorCategory'));
  add(readCellText(row, colIndex, 'category'));
  return parts.join(' / ');
}

function readRequirementRows(sheet, columnMapping = null) {
  let headerRow;
  let colIndex;

  if (columnMapping?.columns?.length) {
    headerRow = Number(columnMapping.headerRow);
    if (!headerRow) {
      throw new Error('헤더 행이 지정되지 않았습니다.');
    }
    colIndex = colIndexFromColumnMapping(columnMapping.columns);
  } else {
    const detected = detectRequirementHeaderRow(sheet);
    if (!detected) {
      throw new Error('요구사항 시트를 인식할 수 없습니다. code, description, category 등 알려진 헤더가 있는지 확인하세요.');
    }
    headerRow = detected.headerRow;
    colIndex = detected.colIndex;
  }

  const rows = [];
  for (let rowNumber = headerRow + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const title = readCellText(row, colIndex, 'title');
    const classification = readCellText(row, colIndex, 'classification');
    const description = readCellText(row, colIndex, 'description');
    const descriptionExtra = readCellText(row, colIndex, 'descriptionExtra');
    const mergedDescription = [description, descriptionExtra].filter(Boolean).join('\n\n');
    const category = buildCategory(colIndex, row);
    const priority = readCellText(row, colIndex, 'priority');
    const status = readCellText(row, colIndex, 'status');

    if (!rowHasRequirementData([title, classification, mergedDescription, category, priority, status])) continue;

    rows.push({
      rowNumber,
      classification,
      title,
      description: mergedDescription,
      category,
      priority,
      status,
    });
  }
  return rows;
}

function readTestCaseRows(sheet) {
  const detected = detectTestCaseHeaderRow(sheet);
  if (!detected) return [];

  const { headerRow, colIndex } = detected;
  const rows = [];
  for (let rowNumber = headerRow + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const requirementCode = cellText(row.getCell(colIndex.requirementcode).value);
    if (!requirementCode) continue;

    const title = colIndex.title ? cellText(row.getCell(colIndex.title).value) : '';
    const code = colIndex.code ? cellText(row.getCell(colIndex.code).value) : '';
    const description = colIndex.description ? cellText(row.getCell(colIndex.description).value) : '';
    const steps = colIndex.steps ? cellText(row.getCell(colIndex.steps).value) : '';
    const expectedResult = colIndex.expectedresult ? cellText(row.getCell(colIndex.expectedresult).value) : '';
    const status = colIndex.status ? cellText(row.getCell(colIndex.status).value) : '';

    if (!rowHasRequirementData([title, code, description, steps, expectedResult, status])) continue;

    rows.push({
      rowNumber,
      requirementCode,
      code,
      title,
      description,
      steps,
      expectedResult,
      status,
    });
  }
  return rows;
}

function sortRequirementRows(rows) {
  return [...rows].sort((a, b) => a.rowNumber - b.rowNumber);
}

async function insertTestCase(db, requirementId, userId, testCase, allocator) {
  let code = testCase.code
    ? tryRegisterTcCode(testCase.code, allocator.usedCodes, allocator.nextSequenceRef)
    : null;
  if (!code) code = allocateNextTcCode(allocator.usedCodes, allocator.nextSequenceRef);

  await db.prepare(
    `INSERT INTO test_cases (code, title, description, steps, expected_result, status, requirement_id, created_by_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    code,
    testCase.title,
    testCase.description || '',
    testCase.steps || '',
    testCase.expectedResult || '',
    testCase.status || 'NOT_RUN',
    requirementId,
    userId,
  );
  return code;
}

export async function previewExcelImport(buffer, { sheetName } = {}) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const sheets = listWorkbookSheets(workbook);
  let selectedSheetName = sheetName;
  if (!selectedSheetName) {
    const best = sheets.find((sheet) => !sheet.excluded && sheet.headerRow != null)
      || sheets.find((sheet) => sheet.headerRow != null)
      || sheets[0];
    selectedSheetName = best?.name ?? workbook.worksheets[0]?.name;
  }

  const sheet = workbook.getWorksheet(selectedSheetName);
  if (!sheet) {
    throw new Error(`시트 "${selectedSheetName}"을 찾을 수 없습니다.`);
  }

  const detected = detectRequirementHeaderRow(sheet, { minScore: 2 })
    || detectRequirementHeaderRow(sheet, { minScore: 0 });
  const headerRow = detected?.headerRow ?? 1;
  const columns = extractSheetColumns(sheet, headerRow, detected?.colIndex ?? {});

  return {
    sheets,
    selectedSheetName,
    headerRow,
    columns,
    dataRowCount: countRequirementDataRows(sheet, headerRow),
    fields: ['skip', ...REQUIREMENT_IMPORT_FIELDS],
  };
}

export async function importExcelBuffer(db, projectId, userId, buffer, options = {}) {
  const { generateTestCases = true, columnMapping = null } = options;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const reqSheet = resolveRequirementsSheet(workbook, columnMapping?.sheetName);
  const requirementRows = sortRequirementRows(readRequirementRows(reqSheet, columnMapping));
  const tcSheet = findTestCasesSheet(workbook, reqSheet);
  const explicitTestCases = tcSheet ? readTestCaseRows(tcSheet) : [];

  const existingTcCodes = (await db.prepare('SELECT code FROM test_cases').all()).map((r) => r.code);
  const allocator = createTestCaseAllocator(existingTcCodes);

  const classificationToRequirementId = new Map();
  const pendingGenerated = [];
  const result = {
    created: 0,
    updated: 0,
    testCasesCreated: 0,
    errors: [],
    warnings: [],
  };

  if (requirementRows.length === 0) {
    result.warnings.push('가져올 요구사항 행이 없습니다.');
    return result;
  }

  for (const row of requirementRows) {
    const priority = normalizePriority(row.priority);
    if (row.priority && !priority) {
      result.errors.push(`${row.rowNumber}행: priority 값이 올바르지 않습니다 (${row.priority}).`);
      continue;
    }
    const status = normalizeStatus(row.status);
    if (row.status && !status) {
      result.warnings.push(`${row.rowNumber}행: status 값을 인식하지 못해 DRAFT로 설정했습니다 (${row.status}).`);
    }

    const data = {
      title: deriveRequirementTitle(row),
      description: row.description || '',
      category: row.category || '',
      classification: row.classification || '',
      priority: priority || 'MEDIUM',
      status: status || 'DRAFT',
    };

    if (!row.title?.trim()) {
      result.warnings.push(`${row.rowNumber}행: title(제목)이 없어 "${data.title}"(으)로 자동 설정했습니다.`);
    }

    try {
      let requirementId;
      let isNew = false;
      const lookupClassification = row.classification?.trim() || null;

      if (lookupClassification) {
        const existing = await db.prepare(
          'SELECT id FROM requirements WHERE project_id = ? AND classification = ?',
        ).get(projectId, lookupClassification);

        if (existing) {
          await db.prepare(
            `UPDATE requirements SET title = ?, description = ?, category = ?, classification = ?, priority = ?, status = ?, updated_at = datetime('now')
             WHERE id = ?`,
          ).run(
            data.title,
            data.description,
            data.category,
            data.classification,
            data.priority,
            data.status,
            existing.id,
          );
          requirementId = existing.id;
          result.updated += 1;
        } else {
          const insert = await db.prepare(
            `INSERT INTO requirements (project_id, code, classification, title, description, category, priority, status, created_by_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ).run(
            projectId,
            tempCode(),
            data.classification,
            data.title,
            data.description,
            data.category,
            data.priority,
            data.status,
            userId,
          );
          requirementId = insert.lastInsertRowid;
          isNew = true;
          result.created += 1;
        }
        classificationToRequirementId.set(lookupClassification, requirementId);
      } else {
        const insert = await db.prepare(
          `INSERT INTO requirements (project_id, code, classification, title, description, category, priority, status, created_by_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          projectId,
          tempCode(),
          '',
          data.title,
          data.description,
          data.category,
          data.priority,
          data.status,
          userId,
        );
        requirementId = insert.lastInsertRowid;
        isNew = true;
        result.created += 1;
      }

      const tcCountRow = await db.prepare(
        'SELECT COUNT(*) AS count FROM test_cases WHERE requirement_id = ?',
      ).get(requirementId);
      const existingTcCount = Number(tcCountRow?.count ?? 0);

      const sheetCases = lookupClassification
        ? explicitTestCases.filter((tc) => tc.requirementCode === lookupClassification)
        : [];

      if (sheetCases.length === 0 && generateTestCases && (isNew || existingTcCount === 0)) {
        pendingGenerated.push({ requirementId, data });
      }
    } catch (err) {
      result.errors.push(`${row.rowNumber}행${row.classification ? ` (${row.classification})` : ''}: ${err.message}`);
    }
  }

  for (const tcRow of explicitTestCases) {
    const requirementId = classificationToRequirementId.get(tcRow.requirementCode);
    if (!requirementId) {
      result.warnings.push(`TestCases ${tcRow.rowNumber}행: 요구사항 분류 ${tcRow.requirementCode}를 찾을 수 없습니다.`);
      continue;
    }
    try {
      const tcStatus = normalizeTcStatus(tcRow.status);
      if (tcRow.status && !tcStatus) {
        result.warnings.push(`TestCases ${tcRow.rowNumber}행: status 무시 (${tcRow.status})`);
      }
      await insertTestCase(db, requirementId, userId, {
        code: tcRow.code,
        title: deriveTestCaseTitle(tcRow),
        description: tcRow.description,
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
    const classification = [...classificationToRequirementId.entries()]
      .find(([, id]) => id === pending.requirementId)?.[0];
    if (classification && requirementsWithSheetCases.has(classification)) continue;

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

  if (result.created > 0 || result.updated > 0) {
    await renumberRequirementCodes(db, projectId);
    result.warnings.push('요구사항 코드를 REQ-01 형식으로 자동 부여했습니다.');
  } else {
    await ensureRequirementCodes(db, projectId);
  }

  if (result.testCasesCreated > 0) {
    await renumberTestCaseCodes(db);
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
    { header: 'classification', key: 'classification', width: 18 },
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
    { header: 'description', key: 'description', width: 48 },
    { header: 'steps', key: 'steps', width: 48 },
    { header: 'expectedResult', key: 'expectedResult', width: 36 },
    { header: 'status', key: 'status', width: 12 },
  ];
  tcSheet.getRow(1).font = { bold: true };

  for (const req of requirements) {
    reqSheet.addRow({
      code: req.code,
      classification: req.classification || '',
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
        requirementCode: req.classification || req.code,
        code: tc.code,
        title: tc.title,
        description: tc.description || '',
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
    { header: 'classification', key: 'classification', width: 18 },
    { header: 'title', key: 'title', width: 32 },
    { header: 'description', key: 'description', width: 48 },
    { header: 'category', key: 'category', width: 18 },
    { header: 'priority', key: 'priority', width: 12 },
    { header: 'status', key: 'status', width: 14 },
  ];
  reqSheet.getRow(1).font = { bold: true };
  reqSheet.addRow({
    classification: 'AUTH-01',
    title: '사용자 로그인',
    description: '등록된 사용자는 아이디와 비밀번호로 로그인할 수 있어야 한다.',
    category: '인증',
    priority: 'HIGH',
    status: 'DRAFT',
  });
  reqSheet.addRow({
    classification: 'AUTH-02',
    title: '비밀번호 재설정',
    description: '사용자는 이메일을 통해 비밀번호를 재설정할 수 있어야 한다.',
    category: '인증',
    priority: 'MEDIUM',
    status: 'DRAFT',
  });
  reqSheet.addRow({
    title: '세션 만료',
    description: '일정 시간 동안 활동이 없으면 세션이 만료되어야 한다.',
    category: '인증',
    priority: 'MEDIUM',
    status: 'DRAFT',
  });

  const tcSheet = workbook.addWorksheet('TestCases');
  tcSheet.columns = [
    { header: 'requirementCode', key: 'requirementCode', width: 16 },
    { header: 'code', key: 'code', width: 14 },
    { header: 'title', key: 'title', width: 32 },
    { header: 'description', key: 'description', width: 48 },
    { header: 'steps', key: 'steps', width: 48 },
    { header: 'expectedResult', key: 'expectedResult', width: 36 },
    { header: 'status', key: 'status', width: 12 },
  ];
  tcSheet.getRow(1).font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
