const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cors({ origin: true, credentials: true }));

app.use(express.static(path.join(__dirname, 'src/renderer')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// API routes (loaded lazily so the DB is initialized first)
app.use('/api/events', (req, res, next) => require('./src/api/events')(req, res, next));
app.use('/api/settings', (req, res, next) => require('./src/api/settings')(req, res, next));
app.use('/api/google', (req, res, next) => require('./src/api/google')(req, res, next));
app.use('/api/app-info', (req, res, next) => require('./src/api/app-info')(req, res, next));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'src/renderer/index.html'));
});

// Global JSON error handler — must be last and have 4 parameters
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[Server Error]', err);
  if (res.headersSent) return;
  res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

async function startServer(preferredPort = 3400) {
  const { loadDbConfig, getDb } = require('./src/db/connection');
  const { runMigrations } = require('./src/db/migrate');

  await loadDbConfig();
  await runMigrations(getDb());

  return new Promise((resolve, reject) => {
    const tryPort = (port, attemptsLeft) => {
      const server = app.listen(port, '127.0.0.1', () => {
        console.log(`MyCalendar running at http://127.0.0.1:${port}`);
        resolve(port);
      });
      server.on('error', (err) => {
        if (err.code === 'EADDRINUSE' && attemptsLeft > 0) {
          tryPort(port + 1, attemptsLeft - 1);
        } else {
          reject(err);
        }
      });
    };
    tryPort(preferredPort, 20);
  });
}

module.exports = { startServer, app };

// Allow running as a standalone web server: `npm run start:web`
if (require.main === module) {
  const port = parseInt(process.env.PORT, 10) || 3400;
  startServer(port).catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}
