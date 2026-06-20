import { Router } from "express";
import { v4 as uuid } from "uuid";
import { asyncHandler } from "../asyncHandler";
import { authMiddleware, hashPassword, requireAdmin, signToken, verifyPassword } from "../auth";
import { getKnex } from "../db";
import { AppUser, UserRole } from "../types";

const router = Router();
const VALID_ROLES: UserRole[] = ["admin", "editor", "viewer"];

function rowToUser(row: any): AppUser {
  return { id: row.id, username: row.username, role: row.role, createdUtc: row.createdUtc };
}

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { username, password } = req.body as { username?: string; password?: string };
    if (!username || !password) {
      res.status(400).json({ error: "username and password are required." });
      return;
    }
    const db = getKnex();
    const row = await db("users").where({ username }).first();
    if (!row || !(await verifyPassword(password, row.passwordHash))) {
      res.status(401).json({ error: "Invalid username or password." });
      return;
    }
    const user = rowToUser(row);
    const token = signToken({ id: user.id, username: user.username, role: user.role });
    res.json({ token, user });
  })
);

router.get(
  "/me",
  authMiddleware,
  asyncHandler(async (req, res) => {
    res.json(req.user);
  })
);

router.get(
  "/users",
  authMiddleware,
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const db = getKnex();
    const rows = await db("users").select("*").orderBy("username");
    res.json(rows.map(rowToUser));
  })
);

router.post(
  "/users",
  authMiddleware,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { username, password, role } = req.body as { username?: string; password?: string; role?: UserRole };
    if (!username || !username.trim() || !password) {
      res.status(400).json({ error: "username and password are required." });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: "Password must be at least 6 characters." });
      return;
    }
    if (role && !VALID_ROLES.includes(role)) {
      res.status(400).json({ error: `Invalid role. Must be one of: ${VALID_ROLES.join(", ")}.` });
      return;
    }
    const db = getKnex();
    const existing = await db("users").where({ username }).first();
    if (existing) {
      res.status(409).json({ error: `Username '${username}' is already taken.` });
      return;
    }
    const row = {
      id: uuid(),
      username: username.trim(),
      passwordHash: await hashPassword(password),
      role: role ?? "viewer",
      createdUtc: new Date().toISOString()
    };
    await db("users").insert(row);
    res.status(201).json(rowToUser(row));
  })
);

router.put(
  "/users/:id/password",
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (req.user!.role !== "admin" && req.user!.id !== id) {
      res.status(403).json({ error: "You can only change your own password." });
      return;
    }
    const { password } = req.body as { password?: string };
    if (!password || password.length < 6) {
      res.status(400).json({ error: "Password must be at least 6 characters." });
      return;
    }
    const db = getKnex();
    const existing = await db("users").where({ id }).first();
    if (!existing) {
      res.status(404).json({ error: "User not found." });
      return;
    }
    await db("users").where({ id }).update({ passwordHash: await hashPassword(password) });
    res.status(204).send();
  })
);

router.put(
  "/users/:id/username",
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (req.user!.role !== "admin" && req.user!.id !== id) {
      res.status(403).json({ error: "You can only change your own username." });
      return;
    }
    const { username } = req.body as { username?: string };
    if (!username || !username.trim()) {
      res.status(400).json({ error: "username is required." });
      return;
    }
    const db = getKnex();
    const existing = await db("users").where({ id }).first();
    if (!existing) {
      res.status(404).json({ error: "User not found." });
      return;
    }
    const trimmed = username.trim();
    const taken = await db("users").where({ username: trimmed }).whereNot({ id }).first();
    if (taken) {
      res.status(409).json({ error: `Username '${trimmed}' is already taken.` });
      return;
    }
    await db("users").where({ id }).update({ username: trimmed });
    res.json(rowToUser({ ...existing, username: trimmed }));
  })
);

router.put(
  "/users/:id/role",
  authMiddleware,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { role } = req.body as { role?: UserRole };
    if (!role || !VALID_ROLES.includes(role)) {
      res.status(400).json({ error: `Invalid role. Must be one of: ${VALID_ROLES.join(", ")}.` });
      return;
    }
    if (req.user!.id === id && role !== "admin") {
      res.status(400).json({ error: "You cannot remove your own admin role." });
      return;
    }
    const db = getKnex();
    const existing = await db("users").where({ id }).first();
    if (!existing) {
      res.status(404).json({ error: "User not found." });
      return;
    }
    await db("users").where({ id }).update({ role });
    res.json(rowToUser({ ...existing, role }));
  })
);

router.delete(
  "/users/:id",
  authMiddleware,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (req.user!.id === id) {
      res.status(400).json({ error: "You cannot delete your own account." });
      return;
    }
    const db = getKnex();
    await db("users").where({ id }).delete();
    res.status(204).send();
  })
);

export default router;
