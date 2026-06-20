import cors from "cors";
import express from "express";
import connectionRouter from "./routes/connection";
import dashboardRouter from "./routes/dashboard";
import requirementsRouter from "./routes/requirements";
import testCasesRouter from "./routes/testcases";

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

app.use(cors());
app.use(express.json());

app.get("/", (_req, res) => {
  res.json({ status: "ok", message: "ReqTrace webapp API server. Use the client dev server (Vite, default http://localhost:5173) for the UI." });
});

app.use("/api/connection", connectionRouter);
app.use("/api/requirements", requirementsRouter);
app.use("/api/testcases", testCasesRouter);
app.use("/api/dashboard", dashboardRouter);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

app.listen(PORT, () => {
  console.log(`ReqTrace webapp server listening on http://localhost:${PORT}`);
});
