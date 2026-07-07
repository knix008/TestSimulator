import { parseProjectUiSettings, serializeProjectUiSettings } from './projectUiSettings.js';
import { tryRegisterTcCode, allocateNextTcCode } from './testCaseCodeAllocator.js';
import { renumberRequirementCodes } from './reqCode.js';
import { addUserToProject, getProjectMembership } from './projectMembers.js';

const VALID_PRIORITY = new Set(['LOW', 'MEDIUM', 'HIGH']);
const VALID_STATUS = new Set(['DRAFT', 'APPROVED', 'IN_PROGRESS', 'DONE']);
const VALID_TC_STATUS = new Set(['NOT_RUN', 'PASS', 'FAIL', 'BLOCKED']);

function normalizePriority(raw) {
  if (!raw) return 'MEDIUM';
  const key = String(raw).trim().toUpperCase();
  if (VALID_PRIORITY.has(key)) return key;
  return null;
}

function normalizeStatus(raw) {
  if (!raw) return 'DRAFT';
  const key = String(raw).trim().toUpperCase().replace(/\s+/g, '_');
  if (VALID_STATUS.has(key)) return key;
  return null;
}

function normalizeTcStatus(raw) {
  if (!raw) return 'NOT_RUN';
  const key = String(raw).trim().toUpperCase().replace(/\s+/g, '_');
  if (VALID_TC_STATUS.has(key)) return key;
  return null;
}

function toFileCase(value) {
  return String(value || '').toLowerCase();
}

function toIso(value) {
  if (!value) return new Date().toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function validateReqtprojPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('프로젝트 파일 형식이 올바르지 않습니다.');
  }
  if (!Array.isArray(payload.requirements)) {
    throw new Error('requirements 배열이 필요합니다.');
  }
  return payload;
}

function deriveProjectCode(projectName) {
  const base = String(projectName || 'PROJECT')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 12) || 'PROJECT';
  return base;
}

async function ensureUniqueProjectCode(db, baseCode) {
  let code = baseCode;
  let suffix = 1;
  while (true) {
    const existing = await db.prepare('SELECT id FROM projects WHERE code = ?').get(code);
    if (!existing) return code;
    suffix += 1;
    code = `${baseCode.slice(0, 10)}${suffix}`;
  }
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
}

export async function exportProjectToReqtproj(db, projectId) {
  const project = await db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (!project) throw new Error('프로젝트를 찾을 수 없습니다.');

  const requirements = await db.prepare(
    'SELECT * FROM requirements WHERE project_id = ? ORDER BY id ASC',
  ).all(projectId);

  const now = new Date().toISOString();
  const mappedRequirements = [];

  for (const req of requirements) {
    const testCases = await db.prepare(
      'SELECT * FROM test_cases WHERE requirement_id = ? ORDER BY id ASC',
    ).all(req.id);

    mappedRequirements.push({
      id: `req-${req.id}`,
      code: req.code,
      classification: req.classification || '',
      title: req.title,
      description: req.description || '',
      category: req.category || '',
      priority: toFileCase(req.priority),
      status: toFileCase(req.status),
      source: 'MyRequirementsBoard',
      parentId: null,
      createdUtc: toIso(req.created_at),
      modifiedUtc: toIso(req.updated_at),
      testCases: testCases.map((tc) => ({
        code: tc.code,
        title: tc.title,
        steps: tc.steps || '',
        expectedResult: tc.expected_result || '',
        status: toFileCase(tc.status),
      })),
    });
  }

  return {
    projectName: project.name,
    schemaVersion: '1.0',
    createdUtc: toIso(project.created_at),
    lastModifiedUtc: now,
    uiSettings: parseProjectUiSettings(project.ui_settings),
    requirements: mappedRequirements,
  };
}

async function importRequirementsIntoProject(db, projectId, userId, payload) {
  const data = validateReqtprojPayload(payload);
  const existingTcCodes = (await db.prepare('SELECT code FROM test_cases').all()).map((r) => r.code);
  const allocator = createTestCaseAllocator(existingTcCodes);

  const result = {
    requirementsCreated: 0,
    testCasesCreated: 0,
    errors: [],
    warnings: [],
  };

  for (const [index, req] of data.requirements.entries()) {
    const rowLabel = req.code || `#${index + 1}`;
    if (!req.title) {
      result.errors.push(`${rowLabel}: title이 비어 있습니다.`);
      continue;
    }

    const priority = normalizePriority(req.priority);
    if (req.priority && !priority) {
      result.errors.push(`${rowLabel}: priority 값이 올바르지 않습니다 (${req.priority}).`);
      continue;
    }
    const status = normalizeStatus(req.status);
    if (req.status && !status) {
      result.errors.push(`${rowLabel}: status 값이 올바르지 않습니다 (${req.status}).`);
      continue;
    }

    try {
      const classification = req.classification || req.code || '';
      const insert = await db.prepare(
        `INSERT INTO requirements (project_id, code, classification, title, description, category, priority, status, created_by_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        projectId,
        `__import_${Date.now()}_${index}`,
        classification,
        req.title,
        req.description || '',
        req.category || '',
        priority || 'MEDIUM',
        status || 'DRAFT',
        userId,
      );
      const requirementId = insert.lastInsertRowid;
      result.requirementsCreated += 1;

      const testCases = Array.isArray(req.testCases) ? req.testCases : [];
      for (const tc of testCases) {
        if (!tc?.title) continue;
        const tcStatus = normalizeTcStatus(tc.status);
        if (tc.status && !tcStatus) {
          result.warnings.push(`${rowLabel}: 테스트 케이스 status 무시 (${tc.status})`);
        }
        await insertTestCase(db, requirementId, userId, {
          code: tc.code,
          title: tc.title,
          steps: tc.steps,
          expectedResult: tc.expectedResult,
          status: tcStatus || 'NOT_RUN',
        }, allocator);
        result.testCasesCreated += 1;
      }
    } catch (err) {
      result.errors.push(`${rowLabel}: ${err.message}`);
    }
  }

  await renumberRequirementCodes(db, projectId);

  return result;
}

export async function importReqtprojAsNewProject(db, user, payload) {
  const data = validateReqtprojPayload(payload);
  const projectName = String(data.projectName || 'Imported Project').trim() || 'Imported Project';
  const baseCode = deriveProjectCode(projectName);
  const code = await ensureUniqueProjectCode(db, baseCode);

  const insert = await db.prepare(
    `INSERT INTO projects (code, name, description, ui_settings, created_by_id)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(
    code,
    projectName,
    '',
    serializeProjectUiSettings(data.uiSettings || {}),
    user.id,
  );

  const projectId = insert.lastInsertRowid;
  if (user.role !== 'ADMIN') {
    await addUserToProject(db, projectId, user.id, 'EDITOR');
  }

  const importResult = await importRequirementsIntoProject(db, projectId, user.id, data);
  const project = await db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  const membership = await getProjectMembership(db, user, projectId);

  return {
    project: {
      id: project.id,
      code: project.code,
      name: project.name,
      description: project.description,
      isActive: Boolean(project.is_active),
      createdById: project.created_by_id,
      createdAt: project.created_at,
      updatedAt: project.updated_at,
      requirementCount: importResult.requirementsCreated,
      memberRole: membership?.memberRole || 'EDITOR',
      canView: true,
      canEdit: true,
      canManage: true,
      isOwner: Number(project.created_by_id) === Number(user.id),
      uiSettings: parseProjectUiSettings(project.ui_settings),
    },
    importResult,
  };
}

export async function importReqtprojIntoProject(db, projectId, userId, payload) {
  validateReqtprojPayload(payload);
  return importRequirementsIntoProject(db, projectId, userId, payload);
}
