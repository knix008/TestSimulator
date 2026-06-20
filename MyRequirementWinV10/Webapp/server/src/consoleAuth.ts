import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { BOOTSTRAP_TOKEN_SECRET as TOKEN_SECRET } from "./secrets";

// Bootstrap-only gate for the admin console: before any database is connected there is no
// `users` table to authenticate against, so a fixed bootstrap login ("admin"/"admin" by
// default) grants just enough access to configure the DB connection. Once a database
// connects, the real admin account lives in the `users` table (seeded automatically — see
// db.ts) and all administration goes through the normal DB-backed login (/api/auth/login).
// This bootstrap token becomes irrelevant at that point.
export const BOOTSTRAP_USERNAME = process.env.ADMIN_CONSOLE_USERNAME ?? "admin";
export const BOOTSTRAP_PASSWORD = process.env.ADMIN_CONSOLE_PASSWORD ?? "admin";

const TOKEN_TTL = "2h";

export function verifyBootstrapCredentials(username: string, password: string): boolean {
  return username === BOOTSTRAP_USERNAME && password === BOOTSTRAP_PASSWORD;
}

export function signBootstrapToken(): string {
  return jwt.sign({ scope: "bootstrap" }, TOKEN_SECRET, { expiresIn: TOKEN_TTL });
}

export function requireConsoleAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.headers["x-console-token"];
  if (typeof token === "string") {
    try {
      jwt.verify(token, TOKEN_SECRET);
      next();
      return;
    } catch {
      // fall through to 401 below
    }
  }
  res.status(401).json({ error: "Bootstrap authentication required." });
}
