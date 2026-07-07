import { Router } from 'express';
import multer from 'multer';
import { getDatabase } from '../db/index.js';
import { requireProjectEdit, requireRole } from '../auth/middleware.js';
import {
  createSampleWorkbookBuffer,
  exportProjectToBuffer,
  importExcelBuffer,
  previewExcelImport,
} from '../lib/excelService.js';

const router = Router({ mergeParams: true });
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const name = String(file.originalname || '').toLowerCase();
    if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
      cb(null, true);
      return;
    }
    cb(new Error('Excel 파일(.xlsx)만 업로드할 수 있습니다.'));
  },
});

function parseIdsParam(raw) {
  if (!raw) return null;
  const ids = String(raw)
    .split(',')
    .map((v) => Number(v.trim()))
    .filter((n) => !Number.isNaN(n) && n > 0);
  return ids.length ? ids : null;
}

router.get('/sample', requireRole('EDITOR'), async (_req, res, next) => {
  try {
    const buffer = await createSampleWorkbookBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="requirements_import_sample.xlsx"');
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

router.get('/export', requireRole('VIEWER'), async (req, res, next) => {
  try {
    const projectId = Number(req.params.projectId);
    const ids = parseIdsParam(req.query.ids);
    const db = getDatabase();
    const buffer = await exportProjectToBuffer(db, projectId, ids);
    const suffix = ids?.length ? `selected_${ids.length}` : 'all';
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="requirements_export_${suffix}_${Date.now()}.xlsx"`);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

function parseColumnMapping(raw) {
  if (!raw) return null;
  try {
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!data?.columns?.length) return null;
    return {
      sheetName: data.sheetName ? String(data.sheetName) : undefined,
      headerRow: Number(data.headerRow),
      columns: data.columns.map((column) => ({
        index: Number(column.index),
        field: column.field ? String(column.field) : 'skip',
        included: column.included !== false && column.field !== 'skip',
      })).filter((column) => column.index > 0),
    };
  } catch {
    return null;
  }
}

const previewUpload = [
  requireRole('VIEWER'),
  requireProjectEdit(),
  (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message || '파일 업로드에 실패했습니다.' });
      return next();
    });
  },
  async (req, res, next) => {
    try {
      if (!req.file?.buffer) {
        return res.status(400).json({ error: '업로드할 Excel 파일이 없습니다.' });
      }

      const sheetName = req.body?.sheetName ? String(req.body.sheetName) : undefined;
      const preview = await previewExcelImport(req.file.buffer, { sheetName });
      res.json(preview);
    } catch (err) {
      next(err);
    }
  },
];

router.post('/preview', ...previewUpload);
router.post('/import/preview', ...previewUpload);

router.post('/import', requireRole('VIEWER'), requireProjectEdit(), (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || '파일 업로드에 실패했습니다.' });
    return next();
  });
}, async (req, res, next) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ error: '업로드할 Excel 파일이 없습니다.' });
    }

    const projectId = Number(req.params.projectId);
    const generateTestCases = req.body?.generateTestCases !== 'false'
      && req.body?.generateTestCases !== false;
    const columnMapping = parseColumnMapping(req.body?.columnMapping);

    const db = getDatabase();
    const result = await importExcelBuffer(
      db,
      projectId,
      req.session.user.id,
      req.file.buffer,
      { generateTestCases, columnMapping },
    );

    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
