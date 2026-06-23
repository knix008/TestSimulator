import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { apiRouter } from './routes/api.js';
import { authRouter } from './routes/auth.js';
import { adminRouter } from './routes/admin.js';

export function createApp() {
  const app = express();

  app.use(cors({
    origin: true,
    credentials: true,
  }));
  app.use(cookieParser());
  app.use(express.json({ limit: '2mb' }));

  app.use('/api/auth', authRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api', apiRouter);

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error(error);
    if (error && typeof error === 'object' && 'issues' in error) {
      res.status(400).json({ error: 'Invalid request', details: error });
      return;
    }
    const message = error instanceof Error ? error.message : 'Internal server error';
    res.status(500).json({ error: message });
  });

  return app;
}
