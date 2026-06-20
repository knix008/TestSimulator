import bcrypt from "bcryptjs";
import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { getKnex } from "./db";
import { JWT_SECRET } from "./secrets";

const TOKEN_TTL = "12h";

export type UserRole = "admin" | "editor" | "viewer";

export interface AuthUser {
  id: string;
  username: string;
  role: UserRole;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function signToken(user: AuthUser): string {
  return jwt.sign(user, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

export function canEditRole(role: UserRole | undefined): boolean {
  return role === "admin" || role === "editor";
}

async function refreshUserRole(req: Request): Promise<AuthUser | null> {
  if (!req.user) return null;
  const row = await getKnex()("users").where({ id: req.user.id }).first();
  if (!row) return null;
  req.user = { id: row.id, username: row.username, role: row.role as UserRole };
  return req.user;
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }
  try {
    req.user = jwt.verify(token, JWT_SECRET) as AuthUser;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired session. Please log in again." });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.role !== "admin") {
    res.status(403).json({ error: "Administrator privileges required." });
    return;
  }
  next();
}

/** Requirements/test cases can be changed by admins and editors; viewers are read-only. */
export async function requireEditor(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await refreshUserRole(req);
    if (!user) {
      res.status(401).json({ error: "User no longer exists." });
      return;
    }
    if (!canEditRole(user.role)) {
      res.status(403).json({ error: "조회 권한만 있습니다. 변경하려면 편집자 또는 관리자 권한이 필요합니다." });
      return;
    }
    next();
  } catch (err) {
    next(err);
  }
}
