import { getDatabase } from '../db/index.js';
import { hasRole } from './auth.js';
import {
  userCanEditProject,
  userCanViewProject,
  userHasProjectAccess,
} from '../lib/projectMembers.js';

export function requireAuth(req, res, next) {
  if (!req.session?.user) {
    return res.status(401).json({ error: '로그인이 필요합니다.' });
  }
  next();
}

export function requireRole(minRole) {
  return (req, res, next) => {
    if (!req.session?.user) {
      return res.status(401).json({ error: '로그인이 필요합니다.' });
    }
    if (!hasRole(req.session.user.role, minRole)) {
      return res.status(403).json({ error: '권한이 없습니다.' });
    }
    next();
  };
}

export function requireProjectAccess() {
  return async (req, res, next) => {
    const projectId = Number(req.params.projectId);
    if (!projectId) {
      return res.status(400).json({ error: '프로젝트 ID가 필요합니다.' });
    }
    if (!req.session?.user) {
      return res.status(401).json({ error: '로그인이 필요합니다.' });
    }
    try {
      const db = getDatabase();
      const allowed = await userCanViewProject(db, req.session.user, projectId);
      if (!allowed) {
        return res.status(403).json({ error: '이 프로젝트를 볼 수 있는 권한이 없습니다.' });
      }
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

export function requireProjectEdit() {
  return async (req, res, next) => {
    const projectId = Number(req.params.projectId);
    if (!projectId) {
      return res.status(400).json({ error: '프로젝트 ID가 필요합니다.' });
    }
    if (!req.session?.user) {
      return res.status(401).json({ error: '로그인이 필요합니다.' });
    }
    try {
      const db = getDatabase();
      const allowed = await userCanEditProject(db, req.session.user, projectId);
      if (!allowed) {
        return res.status(403).json({ error: '이 프로젝트를 편집할 수 있는 권한이 없습니다.' });
      }
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

export function requireRequirementProjectEdit() {
  return async (req, res, next) => {
    const requirementId = Number(req.params.requirementId);
    if (!requirementId) {
      return res.status(400).json({ error: '요구사항 ID가 필요합니다.' });
    }
    if (!req.session?.user) {
      return res.status(401).json({ error: '로그인이 필요합니다.' });
    }
    try {
      const db = getDatabase();
      const row = await db.prepare('SELECT project_id FROM requirements WHERE id = ?').get(requirementId);
      if (!row) return res.status(404).json({ error: '요구사항을 찾을 수 없습니다.' });
      const allowed = await userCanEditProject(db, req.session.user, row.project_id);
      if (!allowed) {
        return res.status(403).json({ error: '이 프로젝트를 편집할 수 있는 권한이 없습니다.' });
      }
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

export function requireRequirementProjectAccess() {
  return async (req, res, next) => {
    const requirementId = Number(req.params.requirementId);
    if (!requirementId) {
      return res.status(400).json({ error: '요구사항 ID가 필요합니다.' });
    }
    if (!req.session?.user) {
      return res.status(401).json({ error: '로그인이 필요합니다.' });
    }
    try {
      const db = getDatabase();
      const row = await db.prepare('SELECT project_id FROM requirements WHERE id = ?').get(requirementId);
      if (!row) return res.status(404).json({ error: '요구사항을 찾을 수 없습니다.' });
      const allowed = await userCanViewProject(db, req.session.user, row.project_id);
      if (!allowed) {
        return res.status(403).json({ error: '이 프로젝트를 볼 수 있는 권한이 없습니다.' });
      }
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

// Backward-compatible alias
export { userHasProjectAccess };
