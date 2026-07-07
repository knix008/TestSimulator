const DEFAULT_PROJECT_CODE = 'DEFAULT';
const DEFAULT_PROJECT_NAMES = new Set(['기본 프로젝트', 'Default Project']);
const DEFAULT_ADMIN_USERNAMES = new Set(['admin']);
const DEFAULT_ADMIN_NAMES = new Set(['관리자', 'Administrator', 'Admin']);

export function isDefaultProject(project) {
  if (!project) return false;
  if (project.isSystemDefault) return true;
  return project.code === DEFAULT_PROJECT_CODE;
}

export function usesDefaultProjectLabel(project) {
  if (!project) return false;
  return isDefaultProject(project) && DEFAULT_PROJECT_NAMES.has(String(project.name || '').trim());
}

export function getDisplayProjectName(project, t) {
  if (!project) return '';
  if (usesDefaultProjectLabel(project)) {
    return t('defaults.projectName');
  }
  return project.name;
}

export function getDisplayProjectDescription(project, t) {
  if (!project) return '';
  if (usesDefaultProjectLabel(project)) {
    return t('defaults.projectDescription');
  }
  return project.description || '';
}

export function getDisplayUserName(user, t) {
  if (!user) return '';
  if (DEFAULT_ADMIN_USERNAMES.has(String(user.username || '').toLowerCase())) {
    return t('defaults.adminName');
  }
  if (DEFAULT_ADMIN_NAMES.has(user.name)) {
    return t('defaults.adminName');
  }
  return user.name;
}

export function getDisplayRoleLabel(role, t) {
  if (!role) return '';
  return t(`role.global.${role}`) || role;
}
