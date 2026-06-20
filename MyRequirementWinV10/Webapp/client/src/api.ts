import { getStoredToken } from "./auth";
import { AdminInfo, AppUser, DashboardData, Requirement, TestCase, TestRun, UserRole } from "./types";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getStoredToken();
  const res = await fetch(`/api${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    ...options
  });
  if (res.status === 401) {
    window.dispatchEvent(new Event("reqtrace:unauthorized"));
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as unknown as T;
  return res.json();
}

export const api = {
  getConnectionStatus: () =>
    request<{ connected: boolean; provider: string | null; database: string | null }>("/connection/status"),

  login: (username: string, password: string) =>
    request<{ token: string; user: AppUser }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password })
    }),
  me: () => request<AppUser>("/auth/me"),
  listUsers: () => request<AppUser[]>("/auth/users"),
  createUser: (username: string, password: string, role: UserRole) =>
    request<AppUser>("/auth/users", { method: "POST", body: JSON.stringify({ username, password, role }) }),
  deleteUser: (id: string) => request<void>(`/auth/users/${id}`, { method: "DELETE" }),
  changePassword: (id: string, password: string) =>
    request<void>(`/auth/users/${id}/password`, { method: "PUT", body: JSON.stringify({ password }) }),
  changeRole: (id: string, role: UserRole) =>
    request<AppUser>(`/auth/users/${id}/role`, { method: "PUT", body: JSON.stringify({ role }) }),
  changeUsername: (id: string, username: string) =>
    request<AppUser>(`/auth/users/${id}/username`, { method: "PUT", body: JSON.stringify({ username }) }),

  getAdminInfo: () => request<AdminInfo>("/admin/info"),

  listRequirements: () => request<Requirement[]>("/requirements"),
  createRequirement: (data: Partial<Requirement>) =>
    request<Requirement>("/requirements", { method: "POST", body: JSON.stringify(data) }),
  updateRequirement: (id: string, data: Partial<Requirement>) =>
    request<Requirement>(`/requirements/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteRequirement: (id: string) => request<void>(`/requirements/${id}`, { method: "DELETE" }),
  generateTestCases: (id: string) =>
    request<{ createdCount: number }>(`/requirements/${id}/generate-testcases`, { method: "POST" }),

  listTestCases: (requirementId: string) => request<TestCase[]>(`/testcases?requirementId=${requirementId}`),
  createTestCase: (data: Partial<TestCase>) =>
    request<TestCase>("/testcases", { method: "POST", body: JSON.stringify(data) }),
  updateTestCase: (id: string, data: Partial<TestCase>) =>
    request<TestCase>(`/testcases/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteTestCase: (id: string) => request<void>(`/testcases/${id}`, { method: "DELETE" }),
  addTestRun: (id: string, data: Partial<TestRun>) =>
    request<TestCase>(`/testcases/${id}/runs`, { method: "POST", body: JSON.stringify(data) }),

  getDashboard: () => request<DashboardData>("/dashboard")
};
