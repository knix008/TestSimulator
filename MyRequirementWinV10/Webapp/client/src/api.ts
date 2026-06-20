import {
  ConnectionSettings,
  DashboardData,
  Requirement,
  TestCase,
  TestRun
} from "./types";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
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
  connect: (settings: ConnectionSettings) =>
    request<{ success: boolean; error?: string }>("/connection", {
      method: "POST",
      body: JSON.stringify(settings)
    }),

  listRequirements: () => request<Requirement[]>("/requirements"),
  createRequirement: (data: Partial<Requirement>) =>
    request<Requirement>("/requirements", { method: "POST", body: JSON.stringify(data) }),
  updateRequirement: (id: string, data: Partial<Requirement>) =>
    request<Requirement>(`/requirements/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteRequirement: (id: string) => request<void>(`/requirements/${id}`, { method: "DELETE" }),

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
