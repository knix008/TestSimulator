async function request(path, options = {}) {
  const res = await fetch(path, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `요청 실패 (${res.status})`);
  }
  return data;
}

async function downloadBlob(path) {
  const res = await fetch(path, { credentials: 'include' });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `다운로드 실패 (${res.status})`);
  }
  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="?([^"]+)"?/i);
  const fileName = match?.[1] || 'requirements.xlsx';
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function downloadExcelExport(projectId, ids = null) {
  const qs = ids?.length ? `?ids=${ids.join(',')}` : '';
  return downloadBlob(`/api/projects/${projectId}/excel/export${qs}`);
}

export function downloadExcelSample(projectId) {
  return downloadBlob(`/api/projects/${projectId}/excel/sample`);
}

export const api = {
  health: () => request('/api/health'),
  appInfo: () => request('/api/app/info'),
  login: (username, password) => request('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  session: () => request('/api/auth/session'),
  register: (payload) => request('/api/auth/register', { method: 'POST', body: JSON.stringify(payload) }),
  profile: () => request('/api/auth/profile'),
  updateProfile: (payload) => request('/api/auth/profile', { method: 'PUT', body: JSON.stringify(payload) }),
  getUserPreferences: () => request('/api/auth/preferences'),
  patchUserPreferences: (payload) => request('/api/auth/preferences', { method: 'PATCH', body: JSON.stringify(payload) }),

  listProjects: (manage = false) => request(`/api/projects${manage ? '?manage=1' : ''}`),
  getProject: (id) => request(`/api/projects/${id}`),
  createProject: (payload) => request('/api/projects', { method: 'POST', body: JSON.stringify(payload) }),
  updateProject: (id, payload) => request(`/api/projects/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  patchProjectUiSettings: (id, uiSettings) => request(`/api/projects/${id}/ui-settings`, {
    method: 'PATCH',
    body: JSON.stringify(uiSettings),
  }),
  deleteProject: (id) => request(`/api/projects/${id}`, { method: 'DELETE' }),
  listProjectMembers: (projectId) => request(`/api/projects/${projectId}/members`),
  setProjectMembers: (projectId, members) => request(`/api/projects/${projectId}/members`, { method: 'PUT', body: JSON.stringify({ members }) }),

  listRequirements: (projectId, params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/api/projects/${projectId}/requirements${qs ? `?${qs}` : ''}`);
  },
  listTestCases: (projectId, params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/api/projects/${projectId}/testcases${qs ? `?${qs}` : ''}`);
  },
  getRequirement: (projectId, id) => request(`/api/projects/${projectId}/requirements/${id}`),
  createRequirement: (projectId, payload) => request(`/api/projects/${projectId}/requirements`, { method: 'POST', body: JSON.stringify(payload) }),
  updateRequirement: (projectId, id, payload) => request(`/api/projects/${projectId}/requirements/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteRequirement: (projectId, id) => request(`/api/projects/${projectId}/requirements/${id}`, { method: 'DELETE' }),
  bulkDeleteRequirements: (projectId, ids) => request(`/api/projects/${projectId}/requirements`, { method: 'DELETE', body: JSON.stringify({ ids }) }),
  renumberRequirements: (projectId) => request(`/api/projects/${projectId}/requirements/renumber`, { method: 'POST' }),

  importExcel: async (projectId, file, {
    generateTestCases = true,
    columnMapping = null,
  } = {}) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('generateTestCases', generateTestCases ? 'true' : 'false');
    if (columnMapping) {
      formData.append('columnMapping', JSON.stringify(columnMapping));
    }
    const res = await fetch(`/api/projects/${projectId}/excel/import`, {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `요청 실패 (${res.status})`);
    return data;
  },

  previewExcelImport: async (projectId, file, { sheetName } = {}) => {
    const previewPaths = [
      `/api/projects/${projectId}/excel/preview`,
      `/api/projects/${projectId}/excel/import/preview`,
    ];

    let lastError = null;
    for (const path of previewPaths) {
      const formData = new FormData();
      formData.append('file', file);
      if (sheetName) formData.append('sheetName', sheetName);

      const res = await fetch(path, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) return data;
      lastError = new Error(data.error || `요청 실패 (${res.status})`);
      if (res.status !== 404) throw lastError;
    }
    throw lastError || new Error('요청 실패 (404)');
  },

  createTestCase: (requirementId, payload) => request(`/api/requirements/${requirementId}/testcases`, { method: 'POST', body: JSON.stringify(payload) }),
  renumberTestCases: (requirementId) => request(`/api/requirements/${requirementId}/testcases/renumber`, { method: 'POST' }),
  updateTestCase: (requirementId, id, payload) => request(`/api/requirements/${requirementId}/testcases/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteTestCase: (requirementId, id) => request(`/api/requirements/${requirementId}/testcases/${id}`, { method: 'DELETE' }),

  listUsers: () => request('/api/users'),
  listAssignableUsers: () => request('/api/users/assignable'),
  createUser: (payload) => request('/api/users', { method: 'POST', body: JSON.stringify(payload) }),
  updateUser: (id, payload) => request(`/api/users/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  changeUserPassword: (id, password) => request(`/api/users/${id}/password`, { method: 'PUT', body: JSON.stringify({ password }) }),
  getUserProjects: (id) => request(`/api/users/${id}/projects`),
  setUserProjects: (id, projectAssignments) => request(`/api/users/${id}/projects`, { method: 'PUT', body: JSON.stringify({ projectAssignments }) }),
  listRegistrationRequests: () => request('/api/users/registration-requests'),
  approveRegistration: (id, payload = {}) => request(`/api/users/registration-requests/${id}/approve`, { method: 'POST', body: JSON.stringify(payload) }),
  rejectRegistration: (id) => request(`/api/users/registration-requests/${id}/reject`, { method: 'POST' }),

  ollamaStatus: () => request('/api/ollama/status'),
  ollamaSettings: () => request('/api/ollama/settings'),
  updateOllamaSettings: (payload) => request('/api/ollama/settings', { method: 'PUT', body: JSON.stringify(payload) }),
  refineRequirement: (payload) => request('/api/ollama/refine', { method: 'POST', body: JSON.stringify(payload) }),

  dbStatus: () => request('/api/settings/db'),
  dbDefaults: () => request('/api/settings/db/defaults'),
  connectDb: (payload) => request('/api/settings/db/connect', { method: 'POST', body: JSON.stringify(payload) }),
  disconnectDb: () => request('/api/settings/db/disconnect', { method: 'POST' }),
  initDbSchema: () => request('/api/settings/db/init', { method: 'POST' }),

  exportReqtproj: (projectId) => request(`/api/projects/${projectId}/reqtproj`),
  openReqtproj: (payload) => request('/api/projects/open-reqtproj', { method: 'POST', body: JSON.stringify(payload) }),
  importReqtproj: (projectId, payload) => request(`/api/projects/${projectId}/reqtproj`, { method: 'POST', body: JSON.stringify(payload) }),
};
