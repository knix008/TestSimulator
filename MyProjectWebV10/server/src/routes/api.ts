import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import {
  createProject,
  deleteProject,
  getProjectById,
  listProjects,
  ScheduleVersionConflictError,
  updateProjectSchedule,
} from '../services/projectService.js';
import {
  getProviderDisplayName,
  SUPPORTED_DB_PROVIDERS,
} from '../config/database.js';
import { getDatabaseConnectionInfo } from '../services/databaseManager.js';
import { requireDatabase } from '../lib/prisma.js';
import { requireModify, requireRead } from '../services/authService.js';
import {
  getUserProjectViewSettings,
  normalizeGanttViewSettings,
  saveUserProjectViewSettings,
} from '../services/userProjectViewSettingsService.js';
import { ExcelImportError, parseExcelImport } from '../services/reports/excelReport.js';
import { isExportFormat, sendProjectExport } from '../services/reports/projectExportService.js';

const excelUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const name = file.originalname.toLowerCase();
    if (
      name.endsWith('.xlsx') ||
      file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ) {
      cb(null, true);
      return;
    }
    cb(new Error('Excel (.xlsx) 파일만 업로드할 수 있습니다.'));
  },
});

export const apiRouter = Router();

apiRouter.get('/health', (_req, res) => {
  const db = getDatabaseConnectionInfo();
  res.json({
    status: 'ok',
    databaseConnected: db.connected,
    connectionError: db.connectionError,
  });
});

apiRouter.get('/config/database', (_req, res) => {
  const config = getDatabaseConnectionInfo();
  res.json({
    provider: config.provider,
    providerDisplayName: getProviderDisplayName(config.provider),
    database: config.database,
    connected: config.connected,
    connectionError: config.connectionError,
    requiresAdminSetup: !config.connected,
    supportedProviders: SUPPORTED_DB_PROVIDERS.map((p) => ({
      id: p,
      name: getProviderDisplayName(p),
    })),
  });
});

apiRouter.use(requireDatabase);

apiRouter.get('/projects', requireRead, async (_req, res, next) => {
  try {
    const projects = await listProjects();
    res.json(projects);
  } catch (error) {
    next(error);
  }
});

apiRouter.get('/projects/:id', requireRead, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const project = await getProjectById(id);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    res.json(project);
  } catch (error) {
    next(error);
  }
});

const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(256).optional(),
});

apiRouter.post('/projects', requireModify, async (req, res, next) => {
  try {
    const body = createProjectSchema.parse(req.body ?? {});
    const project = await createProject(body.name);
    res.status(201).json(project);
  } catch (error) {
    next(error);
  }
});

const updateScheduleSchema = z.object({
  expectedVersion: z.string().optional(),
  name: z.string().trim().min(1).max(256).optional(),
  projectStart: z.string().datetime().optional(),
  workingDaysJson: z.string().optional(),
  tasks: z
    .array(
      z.object({
        taskId: z.number().int().positive(),
        parentId: z.number().int(),
        name: z.string().min(1).max(512),
        startDate: z.string().datetime(),
        durationDays: z.number().int().min(0),
        progress: z.number().min(0).max(100),
        taskType: z.enum(['Normal', 'Milestone', 'Summary']),
        indentLevel: z.number().int().min(0),
        isExpanded: z.boolean(),
        assignedTo: z.string(),
        notes: z.string(),
        autoSchedule: z.boolean(),
        deliverable: z.string(),
        isCritical: z.boolean(),
      }),
    )
    .optional(),
  dependencies: z
    .array(
      z.object({
        predecessorId: z.number().int().positive(),
        successorId: z.number().int().positive(),
        type: z.enum(['FS', 'FF', 'SS', 'SF']),
        lagDays: z.number().int(),
        startLineEnd: z.enum(['None', 'Arrow', 'OpenArrow', 'Dot', 'Square']).nullable().optional(),
        endLineEnd: z.enum(['None', 'Arrow', 'OpenArrow', 'Dot', 'Square']).nullable().optional(),
      }),
    )
    .optional(),
  assignments: z
    .array(
      z.object({
        taskId: z.number().int().positive(),
        resourceName: z.string().max(256),
        allocationPercent: z.number().min(0),
      }),
    )
    .optional(),
  ganttNotes: z
    .array(
      z.object({
        noteId: z.number().int().positive(),
        title: z.string().max(256),
        body: z.string(),
        bodyRtf: z.string(),
        taskId: z.number().int(),
        offsetDays: z.number().int(),
        anchorDate: z.string().datetime(),
        contentY: z.number().int(),
        contentX: z.number().int(),
      }),
    )
    .optional(),
});

const ganttViewSettingsSchema = z.object({
  defaultDependencyType: z.enum(['FS', 'FF', 'SS', 'SF']),
  lineColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  criticalLineColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  lineStyle: z.enum(['solid', 'dash', 'dot']),
  startLineEnd: z.enum(['None', 'Arrow', 'OpenArrow', 'Dot', 'Square']),
  endLineEnd: z.enum(['None', 'Arrow', 'OpenArrow', 'Dot', 'Square']),
  arrowCurve: z.number().int().min(0).max(20),
  pathStyle: z.enum(['curved', 'orthogonal']),
  showCriticalPath: z.boolean().optional(),
});

apiRouter.get('/projects/:id/view-settings', requireRead, async (req, res, next) => {
  try {
    const projectId = Number(req.params.id);
    const userId = req.user?.userId;
    if (!userId || userId <= 0) {
      res.json(normalizeGanttViewSettings(null));
      return;
    }

    const project = await getProjectById(projectId);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const settings = await getUserProjectViewSettings(userId, projectId);
    res.json(settings);
  } catch (error) {
    next(error);
  }
});

apiRouter.put('/projects/:id/view-settings', requireRead, async (req, res, next) => {
  try {
    const projectId = Number(req.params.id);
    const userId = req.user?.userId;
    if (!userId || userId <= 0) {
      res.status(400).json({ error: 'DB 연결 후 저장된 사용자로 로그인해야 설정을 저장할 수 있습니다.' });
      return;
    }

    const project = await getProjectById(projectId);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const body = ganttViewSettingsSchema.parse(req.body ?? {});
    const saved = await saveUserProjectViewSettings(userId, projectId, normalizeGanttViewSettings(body));
    res.json(saved);
  } catch (error) {
    next(error);
  }
});

apiRouter.get('/projects/:id/export/:format', requireRead, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const formatRaw = req.params.format;
    const format = (Array.isArray(formatRaw) ? formatRaw[0] : formatRaw) ?? '';
    if (!isExportFormat(format)) {
      res.status(400).json({ error: '지원하지 않는 내보내기 형식입니다. (excel, word, markdown, pdf)' });
      return;
    }

    const project = await getProjectById(id);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    await sendProjectExport(res, project, format);
  } catch (error) {
    next(error);
  }
});

apiRouter.post(
  '/projects/:id/import/excel',
  requireModify,
  excelUpload.single('file'),
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const project = await getProjectById(id);
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      if (!req.file) {
        res.status(400).json({ error: 'Excel 파일이 필요합니다.' });
        return;
      }

      const expectedVersion =
        typeof req.body?.expectedVersion === 'string' && req.body.expectedVersion.trim()
          ? req.body.expectedVersion.trim()
          : undefined;

      const parsed = await parseExcelImport(req.file.buffer, project.workingDaysJson);
      const editorName = req.user?.username?.trim();
      const updated = await updateProjectSchedule(id, {
        ...parsed,
        expectedVersion,
        updatedBy: editorName ? `web:${editorName}` : 'web',
      });

      if (!updated) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      res.json(updated);
    } catch (error) {
      if (error instanceof ExcelImportError) {
        res.status(400).json({ error: error.message });
        return;
      }
      if (error instanceof ScheduleVersionConflictError) {
        res.status(409).json({
          error: error.message,
          version: error.currentVersion,
          updatedUtc: error.updatedUtc,
          updatedBy: error.updatedBy,
        });
        return;
      }
      next(error);
    }
  },
);

apiRouter.put('/projects/:id', requireModify, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const body = updateScheduleSchema.parse(req.body ?? {});
    const editorName = req.user?.username?.trim();
    const project = await updateProjectSchedule(id, {
      ...body,
      updatedBy: editorName ? `web:${editorName}` : 'web',
    });
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    res.json(project);
  } catch (error) {
    if (error instanceof ScheduleVersionConflictError) {
      res.status(409).json({
        error: error.message,
        version: error.currentVersion,
        updatedUtc: error.updatedUtc,
        updatedBy: error.updatedBy,
      });
      return;
    }
    next(error);
  }
});

apiRouter.delete('/projects/:id', requireModify, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const deleted = await deleteProject(id);
    if (!deleted) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

apiRouter.delete('/projects/:id', requireModify, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const deleted = await deleteProject(id);
    if (!deleted) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});
