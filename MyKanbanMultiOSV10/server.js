const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cors({ origin: true, credentials: true }));

app.use(session({
  secret: 'kanban-secret-2024-xK9mP',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, httpOnly: true, maxAge: 24 * 60 * 60 * 1000 }
}));

app.use(express.static(path.join(__dirname, 'src/renderer')));

const uploadsDir = path.join(__dirname, 'uploads');
app.use('/uploads', express.static(uploadsDir));

// Routes (loaded lazily so DB is initialized first)
app.use('/api/auth', (req, res, next) => require('./src/api/auth')(req, res, next));
app.use('/api/users', (req, res, next) => require('./src/api/users')(req, res, next));
app.use('/api/boards', (req, res, next) => require('./src/api/boards')(req, res, next));
app.use('/api/settings', (req, res, next) => require('./src/api/settings')(req, res, next));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'src/renderer/index.html'));
});

async function startServer(preferredPort = 3000) {
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

  const { loadDbConfig, getDb } = require('./src/db/connection');
  const { runMigrations } = require('./src/db/migrate');

  await loadDbConfig();
  await runMigrations(getDb());

  return new Promise((resolve, reject) => {
    const tryPort = (port) => {
      const server = app.listen(port, '127.0.0.1', () => {
        console.log(`MyKanban running at http://127.0.0.1:${port}`);
        resolve(port);
      });
      server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') tryPort(port + 1);
        else reject(err);
      });
    };
    tryPort(preferredPort);
  });
}

if (require.main === module) {
  startServer(3000).then(port => {
    console.log(`Open http://127.0.0.1:${port} in your browser`);
  }).catch(console.error);
}

module.exports = { startServer, app };
