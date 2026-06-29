import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDatabase, isDbInstalled, isDbReady, getDbInfo, getConnectionError } from './db.js';
import { requireDb } from './middleware/setup.js';
import authRoutes from './routes/auth.js';
import setupRoutes from './routes/setup.js';
import userRoutes from './routes/users.js';
import requirementRoutes from './routes/requirements.js';
import testCaseRoutes from './routes/testCases.js';
import dashboardRoutes from './routes/dashboard.js';
import reportRoutes from './routes/reports.js';
import excelRoutes from './routes/excel.js';
import settingsRoutes from './routes/settings.js';
import syncRoutes from './routes/sync.js';
import projectRoutes from './routes/projects.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.use('/api/setup', setupRoutes);
app.use('/api/auth', authRoutes);

app.get('/api/health', (req, res) => {
  const info = getDbInfo();
  res.json({
    status: 'ok',
    installed: isDbInstalled(),
    ready: isDbReady(),
    needsSetup: !isDbInstalled() || !isDbReady(),
    connectionError: getConnectionError(),
    db: info.type || null,
  });
});

app.use(requireDb);
app.use('/api/projects', projectRoutes);
app.use('/api/users', userRoutes);
app.use('/api/requirements', requirementRoutes);
app.use('/api/test-cases', testCaseRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/excel', excelRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/sync', syncRoutes);

const clientDist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(clientDist, 'index.html'));
    }
  });
}

async function start() {
  if (isDbInstalled()) {
    try {
      await initDatabase();
      const info = getDbInfo();
      app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
        console.log(`Database: ${info.type} (${info.database || info.filename})`);
      });
    } catch (err) {
      console.error('Database connection failed:', err.message);
      app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
        console.log('Database connection failed — login with admin/admin to reconfigure');
      });
    }
  } else {
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log('Database not configured — login with admin/admin to run setup');
    });
  }
}

start();
