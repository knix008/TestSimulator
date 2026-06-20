import cors from "cors";
import express from "express";
import path from "path";
import { authMiddleware } from "./auth";
import { loadPersistedSettings } from "./configStore";
import { connect, settingsFromEnv } from "./db";
import adminRouter from "./routes/admin";
import authRouter from "./routes/auth";
import connectionRouter from "./routes/connection";
import consoleAuthRouter from "./routes/console";
import dashboardRouter from "./routes/dashboard";
import requirementsRouter from "./routes/requirements";
import testCasesRouter from "./routes/testcases";

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

app.use(cors());
app.use(express.json());

// Server's own admin console (DB connection setup + user management) — a separate, plain
// HTML/JS page served directly by this server, independent of the React client app. The
// static page itself is just UI code with no secrets, so it's served openly; the page shows
// its own in-page login form (not the browser's native Basic Auth prompt) and authenticates
// against /api/console/login before it can call any /api/admin/* endpoint.
app.use("/admin", express.static(path.join(process.cwd(), "public", "admin")));

app.get("/", (_req, res) => {
  res.json({
    status: "ok",
    message: "ReqTrace webapp API server. Admin console: /admin. Client UI: Vite dev server, default http://localhost:5173."
  });
});

app.use("/api/connection", connectionRouter);
app.use("/api/auth", authRouter);
app.use("/api/console", consoleAuthRouter);
// Auth is enforced per-route inside admin.ts: console token during bootstrap (no DB-backed
// JWT exists yet), DB-backed admin JWT once connected.
app.use("/api/admin", adminRouter);

// Everything else requires a logged-in user.
app.use("/api/requirements", authMiddleware, requirementsRouter);
app.use("/api/testcases", authMiddleware, testCasesRouter);
app.use("/api/dashboard", authMiddleware, dashboardRouter);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

async function start() {
  const settings = loadPersistedSettings() ?? settingsFromEnv();
  if (!settings) {
    console.warn(
      "[ReqTrace] No database configured yet. Open the admin console at /admin to set one up, " +
        "or set DB_PROVIDER (and related DB_* env vars) and restart — see Webapp/README.md."
    );
  } else {
    try {
      await connect(settings);
      console.log(`[ReqTrace] Connected to ${settings.provider} database.`);
    } catch (err) {
      console.error(`[ReqTrace] Failed to connect to the database: ${(err as Error).message}`);
    }
  }

  const server = app.listen(PORT, () => {
    console.log(`ReqTrace webapp server listening on http://localhost:${PORT}`);
    console.log(`[ReqTrace] Admin console: http://localhost:${PORT}/admin`);
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(
        `[ReqTrace] Port ${PORT} is already in use. Stop the other ReqTrace server process ` +
          `(or run: netstat -ano | findstr :${PORT} then taskkill /PID <pid> /F) and try again.`
      );
      process.exit(1);
    }
    console.error(`[ReqTrace] Failed to start server: ${err.message}`);
    process.exit(1);
  });
}

start();
