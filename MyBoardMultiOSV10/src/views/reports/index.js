// The reports view and dashboards: registers itself as 'reports' (views/registry.js). See view.js.
import { registerView } from '../registry.js';
import { ReportsView } from './view.js';
import { createReportsSidebar } from './sidebar.js';
import './texts.js';
import '../backlog/backlog.css';
import './reports.css';

let current = null;
// The report and dashboard pickers: the lower part of the left panel (sidebar.js), same instance.
const side = createReportsSidebar(() => current);

registerView('reports', {
  mount(host, ctx) { current?.destroy(); current = new ReportsView(host, ctx, { onSideChange: side.refresh }); side.refresh(); },
  update(ctx) { current?.update(ctx); },
  unmount() { current?.destroy(); current = null; side.refresh(); },
  sidebar: side.sidebar,
  commands: {
    // Edit › Find: the breakdown report's JQL box, when it shows.
    find: { icon: 'search', label: 'action.find', run: () => current?.jql?.focus() },
  },
});

export const reportsView = () => current;
