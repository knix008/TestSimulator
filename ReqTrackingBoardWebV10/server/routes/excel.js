import { Router } from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { query, queryOne, insert, execute, now } from '../db.js';
import { authMiddleware, editMiddleware } from '../middleware/auth.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/export', authMiddleware, async (req, res) => {
  try {
    const requirements = await query('SELECT * FROM requirements ORDER BY req_id');
    const testCases = await query(`
      SELECT tc.*, r.req_id FROM test_cases tc
      JOIN requirements r ON r.id = tc.requirement_id ORDER BY tc.tc_id
    `);

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
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=requirements_export.xlsx');
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/import', authMiddleware, editMiddleware, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  try {
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const stats = { requirements: 0, testCases: 0, errors: [] };

    const importReqs = wb.Sheets['Requirements'] || wb.Sheets[wb.SheetNames[0]];
    if (importReqs) {
      const rows = XLSX.utils.sheet_to_json(importReqs);
      for (const row of rows) {
        const reqId = row['Req ID'] || row['req_id'] || row['ReqID'];
        const title = row['Title'] || row['title'];
        if (!reqId || !title) continue;

        const existing = await queryOne('SELECT id FROM requirements WHERE req_id = ?', [reqId]);
        if (existing) {
          await execute(`
            UPDATE requirements SET title=?, description=?, category=?, priority=?, status=?, owner=?, version=?, updated_at=?
            WHERE req_id=?
          `, [
            title, row['Description'] || '', row['Category'] || 'General',
            row['Priority'] || 'Medium', row['Status'] || 'Draft',
            row['Owner'] || '', row['Version'] || '1.0', now(), reqId
          ]);
        } else {
          await insert(`
            INSERT INTO requirements (req_id, title, description, category, priority, status, owner, version, created_by, updated_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            reqId, title, row['Description'] || '', row['Category'] || 'General',
            row['Priority'] || 'Medium', row['Status'] || 'Draft',
            row['Owner'] || '', row['Version'] || '1.0', req.user.id, req.user.id
          ]);
        }
        stats.requirements++;
      }
    }

    const importTCs = wb.Sheets['TestCases'] || wb.Sheets[wb.SheetNames[1]];
    if (importTCs) {
      const rows = XLSX.utils.sheet_to_json(importTCs);
      for (const row of rows) {
        const tcId = row['TC ID'] || row['tc_id'] || row['TCID'];
        const reqId = row['Req ID'] || row['req_id'];
        const title = row['Title'] || row['title'];
        if (!tcId || !reqId || !title) continue;

        const reqRow = await queryOne('SELECT id FROM requirements WHERE req_id = ?', [reqId]);
        if (!reqRow) {
          stats.errors.push(`Requirement ${reqId} not found for TC ${tcId}`);
          continue;
        }

        const existing = await queryOne('SELECT id FROM test_cases WHERE tc_id = ?', [tcId]);
        if (existing) {
          await execute(`
            UPDATE test_cases SET requirement_id=?, title=?, description=?, steps=?, expected_result=?,
              status=?, result=?, executed_by=?, notes=?, updated_at=?
            WHERE tc_id=?
          `, [
            reqRow.id, title, row['Description'] || '', row['Steps'] || '',
            row['Expected Result'] || '', row['Status'] || 'Not Run',
            row['Result'] || '', row['Executed By'] || '', row['Notes'] || '', now(), tcId
          ]);
        } else {
          await insert(`
            INSERT INTO test_cases (tc_id, requirement_id, title, description, steps, expected_result, status, result, executed_by, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            tcId, reqRow.id, title, row['Description'] || '', row['Steps'] || '',
            row['Expected Result'] || '', row['Status'] || 'Not Run',
            row['Result'] || '', row['Executed By'] || '', row['Notes'] || ''
          ]);
        }
        stats.testCases++;
      }
    }

    res.json(stats);
  } catch (err) {
    res.status(400).json({ error: 'Failed to parse Excel file: ' + err.message });
  }
});

export default router;
