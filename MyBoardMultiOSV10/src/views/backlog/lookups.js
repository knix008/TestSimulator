// Names and pictures behind the ids an issue row carries (types, statuses, priorities, users, epics,
// versions, projects). The current board's data gives the current project's; other projects' come from
// GET /projects/:id/config the first time a row of theirs is shown.

export class Lookups {
  constructor(api) {
    this.api = api;
    this.types = new Map();
    this.statuses = new Map();
    this.priorities = new Map();
    this.resolutions = new Map();
    this.users = new Map();
    this.projects = new Map();
    this.epics = new Map();
    this.versions = new Map();
    this.components = new Map();
    this.loadedProjects = new Set();
    this.pending = new Map();
    this.usersLoaded = false;
  }

  /** Fills from GET /boards/:id/data (or a project config). */
  absorb(data) {
    if (!data) return;
    for (const x of data.types ?? []) this.types.set(x.id, x);
    for (const x of data.statuses ?? []) this.statuses.set(x.id, x);
    for (const x of data.priorities ?? []) this.priorities.set(x.id, x);
    for (const x of data.resolutions ?? []) this.resolutions.set(x.id, x);
    for (const x of data.users ?? []) this.users.set(x.id, x);
    for (const x of data.members ?? []) if (x.user) this.users.set(x.user.id, x.user);
    for (const x of data.projects ?? []) this.projects.set(x.id, x);
    if (data.project) this.projects.set(data.project.id, data.project);
    for (const x of data.epics ?? []) this.epics.set(x.id, x);
    for (const x of data.versions ?? []) this.versions.set(x.id, x);
    for (const x of data.components ?? []) this.components.set(x.id, x);
  }

  async project(projectId) {
    if (!projectId || this.loadedProjects.has(projectId)) return;
    if (this.pending.has(projectId)) return this.pending.get(projectId);
    const job = this.api.get(`/projects/${encodeURIComponent(projectId)}/config`).then((config) => {
      this.absorb(config);
      this.loadedProjects.add(projectId);
    }).catch(() => { this.loadedProjects.add(projectId); }).finally(() => this.pending.delete(projectId));
    this.pending.set(projectId, job);
    return job;
  }

  async ensureUsers() {
    if (this.usersLoaded) return;
    this.usersLoaded = true;
    try {
      const list = await this.api.users({ limit: 500 });
      for (const u of Array.isArray(list) ? list : list?.items ?? []) this.users.set(u.id, u);
    } catch { /* a user without rights to the list sees the board's users only */ }
  }

  async ensureProjects() {
    if (this.projectsLoaded) return;
    this.projectsLoaded = true;
    try {
      const list = await this.api.projects({ limit: 500 });
      for (const p of Array.isArray(list) ? list : list?.items ?? []) this.projects.set(p.id, p);
    } catch { /* none */ }
  }

  /** Loads every project the rows belong to (once each). */
  async forRows(rows) {
    const ids = [...new Set(rows.map((r) => r.projectId).filter((id) => id && !this.loadedProjects.has(id)))];
    await Promise.all(ids.map((id) => this.project(id)));
  }

  userName(id) { const u = this.users.get(id); return u ? u.displayName ?? u.display_name ?? u.username : ''; }
  epicOf(id) { return this.epics.get(id) ?? null; }
  statusesOf(projectId) { return [...this.statuses.values()].filter((s) => s.projectId === projectId).sort((a, b) => a.position - b.position); }
  typesOf(projectId) { return [...this.types.values()].filter((s) => s.projectId === projectId).sort((a, b) => a.position - b.position); }
  versionsOf(projectId) { return [...this.versions.values()].filter((s) => s.projectId === projectId && !s.archived).sort((a, b) => a.position - b.position); }
  prioritiesList() { return [...this.priorities.values()].sort((a, b) => a.position - b.position); }
  usersList() { return [...this.users.values()].filter((u) => u.active !== false).sort((a, b) => this.userName(a.id).localeCompare(this.userName(b.id))); }
}
