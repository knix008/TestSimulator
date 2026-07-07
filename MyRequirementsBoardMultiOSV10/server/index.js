import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs';
import express from 'express';
import session from 'express-session';
import cors from 'cors';
import {
  initDatabase,
  getDatabaseInfo,
  isDatabaseReady,
  setDataDir,
} from './db/index.js';
import authRoutes from './routes/auth.js';
import projectRoutes from './routes/projects.js';
import requirementRoutes from './routes/requirements.js';
import testCaseRoutes from './routes/testcases.js';
import userRoutes from './routes/users.js';
import ollamaRoutes from './routes/ollama.js';
import dbSettingsRoutes from './routes/dbSettings.js';
import appRoutes from './routes/app.js';
import excelRoutes from './routes/excel.js';
import { requireProjectAccess } from './auth/middleware.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3847;
const isProd = process.env.NODE_ENV === 'production';

let dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

export function setServerDataDir(dir) {
  dataDir = dir;
  setDataDir(dir);
}

export async function createApp() {
  if (!isDatabaseReady()) {
    await initDatabase(dataDir);
  }

  const app = express();
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: '10mb' }));
  app.use(session({
    secret: process.env.SESSION_SECRET || 'my-requirements-board-dev-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false,
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  }));

  app.get('/api/health', (_req, res) => {
    const dbInfo = getDatabaseInfo();
    res.json({
      ok: true,
      db: dbInfo,
      dbPath: dbInfo.path || `${dbInfo.provider}://${dbInfo.server}:${dbInfo.port}/${dbInfo.database}`,
      mode: process.env.RUN_MODE || 'standalone',
    });
  });

  app.use('/api/settings/db', dbSettingsRoutes);
  app.use('/api/projects/:projectId/excel', requireProjectAccess(), excelRoutes);
  app.use('/api/app', appRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/projects', projectRoutes);
  app.use('/api/projects/:projectId/requirements', requireProjectAccess(), requirementRoutes);
  app.use('/api/requirements/:requirementId/testcases', testCaseRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/ollama', ollamaRoutes);

  if (isProd) {
    const staticDir = path.join(__dirname, '..', 'dist-renderer');
    if (fs.existsSync(staticDir)) {
      app.use(express.static(staticDir));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(staticDir, 'index.html'));
      });
    }
  }

  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: err.message || '서버 오류가 발생했습니다.' });
  });

  return app;
}

export async function startServer() {
  const app = await createApp();
  const dbInfo = getDatabaseInfo();
  const dbLabel = dbInfo.mode === 'external'
    ? `${dbInfo.provider}://${dbInfo.server}:${dbInfo.port}/${dbInfo.database}`
    : dbInfo.path;

  return new Promise((resolve, reject) => {
    const server = app.listen(PORT, '127.0.0.1', () => {
      console.log(`[server] http://127.0.0.1:${PORT} (db: ${dbLabel})`);
      resolve(server);
    });
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`[server] 포트 ${PORT}이(가) 이미 사용 중입니다.`);
        console.error('[server] npm run stop:dev 실행 후 다시 시도하세요.');
      } else {
        console.error('[server]', err.message);
      }
      reject(err);
    });
  });
}

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  startServer().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
