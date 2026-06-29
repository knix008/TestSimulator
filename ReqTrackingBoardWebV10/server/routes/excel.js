import { Router } from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { query, queryOne, insert, execute, now } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { resolveTcIdForCreate } from '../utils/tcId.js';
import { canAccessProject, canEditProjectContent, parseProjectId, getProjectById } from '../utils/projectAccess.js';
import { buildExportFilename, sanitizeExportPrefix } from '../utils/exportPrefix.js';
import { resolveRequirementOwnerForImport } from '../utils/requirementOwner.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

function normalizeImportRow(row) {
  const normalized = {};
  for (const [key, value] of Object.entries(row)) {
    normalized[String(key).trim()] = value;
  }
  return normalized;
}

function cellText(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function pickCell(row, ...keys) {
  for (const key of keys) {
    const text = cellText(row[key]);
    if (text) return text;
  }
  return '';
}

function findRequirementsSheet(wb) {
  const preferred = wb.SheetNames.find((name) => name.trim().toLowerCase() === 'requirements');
  return wb.Sheets[preferred] || wb.Sheets['Requirements'] || wb.Sheets[wb.SheetNames[0]];
}

function findTestCasesSheet(wb) {
  const preferred = wb.SheetNames.find((name) => name.trim().toLowerCase() === 'testcases');
  return wb.Sheets[preferred] || wb.Sheets['TestCases'] || wb.Sheets[wb.SheetNames[1]];
}

router.get('/export', authMiddleware, async (req, res) => {
  try {
    const projectId = parseProjectId(req.query.projectId);
    if (!projectId) return res.status(400).json({ error: 'projectId required' });
    if (!(await canAccessProject(req.user, projectId))) {
      return res.status(403).json({ error: 'Project access denied' });
    }

    const project = await getProjectById(projectId);
    const prefix = sanitizeExportPrefix(req.query.prefix) || sanitizeExportPrefix(project?.name);

    const requirements = await query(
      'SELECT * FROM requirements WHERE project_id = ? ORDER BY req_id',
      [projectId]
    );
    const testCases = await query(`
      SELECT tc.*, r.req_id FROM test_cases tc
      JOIN requirements r ON r.id = tc.requirement_id
      WHERE tc.project_id = ?
      ORDER BY tc.tc_id
    `, [projectId]);

    const reqSheet = requirements.map(r => ({
      'Req ID': r.req_id,
      'Title': r.title,
      'Description': r.description,
      'Category': r.category,
      'Priority': r.priority,
      'Status': r.status,
      'Owner': r.owner,
      'Version': r.version,
    }));

    const tcSheet = testCases.map(tc => ({
      'TC ID': tc.tc_id,
      'Req ID': tc.req_id,
      'Title': tc.title,
      'Description': tc.description,
      'Steps': tc.steps,
      'Expected Result': tc.expected_result,
      'Status': tc.status,
      'Result': tc.result,
      'Executed By': tc.executed_by,
      'Executed At': tc.executed_at,
      'Notes': tc.notes,
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(reqSheet), 'Requirements');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tcSheet), 'TestCases');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const filename = buildExportFilename(prefix, 'requirements_export', 'xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/import', authMiddleware, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const projectId = parseProjectId(req.query.projectId);
  if (!projectId) return res.status(400).json({ error: 'projectId required' });
  if (!(await canEditProjectContent(req.user, projectId))) {
    return res.status(403).json({ error: 'Project edit permission required' });
  }

  try {
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const stats = { requirements: 0, testCases: 0, errors: [], warnings: [] };

    const importReqs = findRequirementsSheet(wb);
    if (importReqs) {
      const rows = XLSX.utils.sheet_to_json(importReqs).map(normalizeImportRow);
      for (const row of rows) {
        const reqId = pickCell(row, 'Req ID', 'req_id', 'ReqID', 'Req Id', '요구사항 ID');
        const title = pickCell(row, 'Title', 'title', '제목');
        if (!reqId || !title) continue;

        const { owner: resolvedOwner, warning } = await resolveRequirementOwnerForImport(
          pickCell(row, 'Owner', 'owner', '담당자'),
          projectId
        );
        if (warning) stats.warnings.push(`${reqId}: ${warning}`);

        const existing = await queryOne(
          'SELECT id FROM requirements WHERE req_id = ? AND project_id = ?',
          [reqId, projectId]
        );
        const fields = [
          title,
          pickCell(row, 'Description', 'description', '설명'),
          pickCell(row, 'Category', 'category', '카테고리') || 'General',
          pickCell(row, 'Priority', 'priority', '우선순위') || 'Medium',
          pickCell(row, 'Status', 'status', '상태') || 'Draft',
          resolvedOwner,
          pickCell(row, 'Version', 'version', '버전') || '1.0',
          now(),
          reqId,
          projectId,
        ];

        if (existing) {
          await execute(`
            UPDATE requirements SET title=?, description=?, category=?, priority=?, status=?, owner=?, version=?, updated_at=?
            WHERE req_id=? AND project_id=?
          `, fields);
        } else {
          await insert(`
            INSERT INTO requirements (project_id, req_id, title, description, category, priority, status, owner, version, created_by, updated_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            projectId, reqId, title, fields[1], fields[2], fields[3], fields[4],
            resolvedOwner, fields[6], req.user.id, req.user.id,
          ]);
        }
        stats.requirements++;
      }
    }

    const importTCs = findTestCasesSheet(wb);
    if (importTCs) {
      const rows = XLSX.utils.sheet_to_json(importTCs).map(normalizeImportRow);
      for (const row of rows) {
        const tcId = pickCell(row, 'TC ID', 'tc_id', 'TCID', 'TC Id');
        const reqId = pickCell(row, 'Req ID', 'req_id', 'ReqID', 'Req Id', '요구사항 ID');
        const title = pickCell(row, 'Title', 'title', '제목');
        if (!tcId || !reqId || !title) continue;

        const reqRow = await queryOne(
          'SELECT id FROM requirements WHERE req_id = ? AND project_id = ?',
          [reqId, projectId]
        );
        if (!reqRow) {
          stats.errors.push(`Requirement ${reqId} not found for TC ${tcId}`);
          continue;
        }

        const existing = await queryOne(
          'SELECT id FROM test_cases WHERE tc_id = ? AND project_id = ?',
          [tcId, projectId]
        );
        if (existing) {
          await execute(`
            UPDATE test_cases SET requirement_id=?, title=?, description=?, steps=?, expected_result=?,
              status=?, result=?, executed_by=?, notes=?, updated_at=?
            WHERE tc_id=? AND project_id=?
          `, [
            reqRow.id, title,
            pickCell(row, 'Description', 'description', '설명'),
            pickCell(row, 'Steps', 'steps', '단계'),
            pickCell(row, 'Expected Result', 'expected_result', 'ExpectedResult', '기대 결과'),
            pickCell(row, 'Status', 'status', '상태') || 'Not Run',
            pickCell(row, 'Result', 'result', '결과'),
            pickCell(row, 'Executed By', 'executed_by', 'ExecutedBy', '실행자'),
            pickCell(row, 'Notes', 'notes', '비고'),
            now(), tcId, projectId,
          ]);
        } else {
          let resolvedTcId;
          try {
            ({ tcId: resolvedTcId } = await resolveTcIdForCreate(tcId, projectId));
          } catch (err) {
            if (err.status === 409) {
              stats.errors.push(`TC ID ${tcId} already exists (non-standard ID)`);
              continue;
            }
            throw err;
          }
          await insert(`
            INSERT INTO test_cases (project_id, tc_id, requirement_id, title, description, steps, expected_result, status, result, executed_by, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            projectId, resolvedTcId, reqRow.id, title,
            pickCell(row, 'Description', 'description', '설명'),
            pickCell(row, 'Steps', 'steps', '단계'),
            pickCell(row, 'Expected Result', 'expected_result', 'ExpectedResult', '기대 결과'),
            pickCell(row, 'Status', 'status', '상태') || 'Not Run',
            pickCell(row, 'Result', 'result', '결과'),
            pickCell(row, 'Executed By', 'executed_by', 'ExecutedBy', '실행자'),
            pickCell(row, 'Notes', 'notes', '비고'),
          ]);
        }
        stats.testCases++;
      }
    }

    if (stats.requirements === 0 && stats.testCases === 0 && stats.errors.length === 0) {
      stats.errors.push('No valid rows found. Check sheet names (Requirements, TestCases) and column headers.');
    }

    res.json(stats);
  } catch (err) {
    res.status(400).json({ error: 'Failed to parse Excel file: ' + err.message });
  }
});

export default router;
