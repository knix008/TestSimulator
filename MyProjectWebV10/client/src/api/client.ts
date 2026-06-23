import type {
  AdminDatabaseSettings,
  AppUser,
  AuthSession,
  CreateUserInput,
  DatabaseApplyResult,
  DatabaseConfigInfo,
  DatabaseSettingsInput,
  DependencyItem,
  GanttViewSettings,
  ProjectDetail,
  ProjectSummary,
  TaskItem,
  UpdateOwnProfileInput,
  UpdateUserInput,
  UserProfile,
} from '../types/project';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
      ...init,
    });
  } catch {
    throw new Error(
      'API 서버에 연결할 수 없습니다. npm run dev 로 서버(포트 3001)가 실행 중인지 확인하세요.',
    );
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
      details?: { issues?: Array<{ message?: string; path?: Array<string | number> }> };
    };
    const zodIssue = body.details?.issues?.[0];
    if (zodIssue?.message) {
      const path = zodIssue.path?.length ? ` (${zodIssue.path.join('.')})` : '';
      throw new Error(`${zodIssue.message}${path}`);
    }
    throw new Error(body.error ?? `Request failed (${response.status})`);
  }

  return response.json() as Promise<T>;
}

export function getAuthSession() {
  return request<AuthSession>('/api/auth/me');
}

export function loginAdmin(username: string, password: string) {
  return request<{ username: string; role: string }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export function logoutAdmin() {
  return request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' });
}

export function getMyProfile() {
  return request<UserProfile>('/api/auth/profile');
}

export function updateMyProfile(input: UpdateOwnProfileInput) {
  return request<UserProfile>('/api/auth/profile', {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export function getDatabaseConfig() {
  return request<DatabaseConfigInfo>('/api/config/database');
}

export function getAdminDatabaseSettings() {
  return request<AdminDatabaseSettings>('/api/admin/database');
}

export function testAdminDatabaseSettings(input: DatabaseSettingsInput) {
  return request<DatabaseApplyResult>('/api/admin/database/test', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function saveAdminDatabaseSettings(input: DatabaseSettingsInput) {
  return request<DatabaseApplyResult>('/api/admin/database', {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export function listUsers() {
  return request<AppUser[]>('/api/admin/users');
}

export function createUser(input: CreateUserInput) {
  return request<AppUser>('/api/admin/users', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateUser(id: number, input: UpdateUserInput) {
  return request<AppUser>(`/api/admin/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export function deleteUser(id: number) {
  return request<{ ok: boolean }>(`/api/admin/users/${id}`, {
    method: 'DELETE',
  });
}

export function listProjects() {
  return request<ProjectSummary[]>('/api/projects');
}

export function getProject(id: number) {
  return request<ProjectDetail>(`/api/projects/${id}`);
}

export function createProject(name?: string) {
  return request<ProjectDetail>('/api/projects', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export function updateProject(
  id: number,
  data: {
    expectedVersion?: string;
    name?: string;
    projectStart?: string;
    workingDaysJson?: string;
    tasks?: Omit<TaskItem, 'endDate'>[];
    dependencies?: DependencyItem[];
  },
) {
  return request<ProjectDetail>(`/api/projects/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function getProjectViewSettings(projectId: number) {
  return request<GanttViewSettings>(`/api/projects/${projectId}/view-settings`);
}

export function saveProjectViewSettings(projectId: number, settings: GanttViewSettings) {
  return request<GanttViewSettings>(`/api/projects/${projectId}/view-settings`, {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
}
