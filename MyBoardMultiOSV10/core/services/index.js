// Assemble all services for a core. Every service method takes `ctx` first (see common.js Ctx) and reads the
// database through `core.db`, so switching databases at runtime swaps it for every service at once.
import { createUsers } from './users.js';
import { createProjects } from './projects.js';
import { createConfig } from './config.js';
import { createIssues } from './issues.js';
import { createParts, parseTimeSpent } from './parts.js';
import { createBoards } from './boards.js';
import { createPersonal } from './personal.js';
import { createIcons } from './icons.js';
import { createReports } from './reports.js';
import { createAutomation } from './automation.js';
import { createExchange } from './exchange.js';
import { createSearch } from './search.js';
import { createMoves, createLabels } from './relocation.js';

export function createServices(core) {
  const config = createConfig(core);
  const parts = createParts(core);
  const personal = createPersonal(core);
  const services = {
    users: createUsers(core),
    projects: createProjects(core),
    types: config.types,
    statuses: config.statuses,
    workflows: config.workflows,
    transitions: config.transitions,
    components: config.components,
    versions: config.versions,
    fields: config.fields,
    priorities: config.priorities,
    resolutions: config.resolutions,
    issues: createIssues(core),
    ...parts,
    boards: createBoards(core),
    filters: personal.filters,
    dashboards: personal.dashboards,
    notifications: personal.notifications,
    settings: personal.settings,
    icons: createIcons(core),
    reports: createReports(core),
    automation: createAutomation(core),
    exchange: createExchange(core),
    parseTimeSpent,
    moves: createMoves(core),
    labels: createLabels(core),
  };
  services.search = createSearch(core);
  return services;
}
