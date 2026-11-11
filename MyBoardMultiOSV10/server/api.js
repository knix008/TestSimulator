// REST routes → services (ARCHITECTURE §5). Mounted by desktop.js and web.js, which supply authentication
// (`makeCtx`) and the host-specific routes (info, login cookies, database config).
import { Raw } from './router.js';
import { AppError, ValidationError } from '../core/errors.js';
import { createSamples } from '../core/samples.js';

/**
 * @param {ReturnType<import('./router.js').createRouter>} r
 * @param {object} core
 * @param {{ info: (ctx, req) => Promise<object>, onLogin?: Function, onLogout?: Function, dbConfig?: Function,
 *           afterDbSwitch?: Function, allowSetup?: boolean }} host
 */
export function registerApi(r, core, host) {
  const S = () => core.services;
  const pub = { public: true };

  // ---- info / auth --------------------------------------------------------------------------------------------
  r.get('/api/info', ({ ctx, req }) => host.info(ctx, req), pub);
  r.post('/api/auth/login', async ({ body, res, req }) => {
    const out = await S().users.login(body || {});
    if (host.onLogin) host.onLogin(res, out, req);
    return out;
  }, pub);
  r.post('/api/auth/logout', async ({ ctx, res, req }) => {
    await S().users.logout(ctx.sessionToken);
    if (host.onLogout) host.onLogout(res, req);
    return { ok: true };
  }, pub);
  r.get('/api/auth/me', ({ ctx }) => {
    if (!ctx.user) throw new AppError('UNAUTHORIZED', 'Login required', 401);
    return S().users.get(ctx, ctx.user.id);
  });
  r.post('/api/auth/password', ({ ctx, body }) => S().users.setPassword(ctx, body || {}));
  /** First run (no users yet): create the administrator and log in. */
  r.post('/api/auth/setup', async ({ body, res, req }) => {
    if (!host.allowSetup || (await S().users.count()) > 0) throw new AppError('SETUP_DONE', 'The administrator already exists', 409);
    await S().users.create({ system: true }, { ...body, role: 'admin' }, { bootstrap: true });
    const out = await S().users.login({ username: body.username, password: body.password });
    if (host.onLogin) host.onLogin(res, out, req);
    return out;
  }, pub);

  // ---- database (desktop settings / web admin) ----------------------------------------------------------------
  r.get('/api/db/config', ({ ctx }) => host.dbConfig(ctx));
  r.post('/api/db/test', ({ ctx, body }) => core.testDb(ctx, body));
  r.post('/api/db/switch', async ({ ctx, body }) => {
    const info = await core.switchDb(ctx, body);
    if (host.afterDbSwitch) await host.afterDbSwitch(body, ctx);
    return info;
  });
  r.post('/api/db/copy', ({ ctx, body }) => core.copyDb(ctx, body?.target || body, { overwrite: !!body?.overwrite }));

  // ---- users / icons / settings -------------------------------------------------------------------------------
  r.get('/api/users', ({ ctx, query }) => S().users.list(ctx, { all: query.all === '1' || query.all === 'true' }));
  r.post('/api/users', ({ ctx, body }) => S().users.create(ctx, body));
  r.get('/api/users/:id', ({ ctx, params }) => S().users.get(ctx, params.id));
  r.patch('/api/users/:id', ({ ctx, params, body }) => S().users.update(ctx, params.id, body));
  r.delete('/api/users/:id', ({ ctx, params }) => S().users.remove(ctx, params.id));

  r.get('/api/icons', ({ ctx }) => S().icons.list(ctx));
  r.post('/api/icons', ({ ctx, body }) => S().icons.create(ctx, body));
  r.get('/api/icons/:id', async ({ params }) => {
    const ic = await S().icons.bytes(params.id);
    return new Raw(ic.data, { 'Content-Type': ic.mime, 'Cache-Control': 'private, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" });
  }, pub);
  r.delete('/api/icons/:id', ({ ctx, params }) => S().icons.remove(ctx, params.id));

  r.get('/api/settings', ({ ctx }) => S().settings.get(ctx));
  r.patch('/api/settings', ({ ctx, body }) => S().settings.set(ctx, body));

  // ---- projects -----------------------------------------------------------------------------------------------
  r.get('/api/projects', ({ ctx, query }) => S().projects.list(ctx, { archived: query.archived === '1' || query.archived === 'true' }));
  r.post('/api/projects', ({ ctx, body }) => S().projects.create(ctx, body));
  r.get('/api/projects/:id', ({ ctx, params }) => S().projects.get(ctx, params.id));
  r.patch('/api/projects/:id', ({ ctx, params, body }) => S().projects.update(ctx, params.id, body));
  r.delete('/api/projects/:id', ({ ctx, params }) => S().projects.remove(ctx, params.id));
  r.get('/api/projects/:id/config', ({ ctx, params }) => S().projects.config(ctx, params.id));
  r.get('/api/projects/:id/members', ({ ctx, params }) => S().projects.members(ctx, params.id));
  r.post('/api/projects/:id/members', ({ ctx, params, body }) => S().projects.setMember(ctx, params.id, body));
  r.patch('/api/projects/:id/members/:userId', ({ ctx, params, body }) => S().projects.setMember(ctx, params.id, { ...body, userId: params.userId }));
  r.delete('/api/projects/:id/members/:userId', ({ ctx, params }) => S().projects.removeMember(ctx, params.id, params.userId));

  const pid = async (ctx, idOrKey) => (await S().projects.load(idOrKey)).id;
  /** Child collections of a project. */
  for (const [path, svc] of [['types', 'types'], ['statuses', 'statuses'], ['workflows', 'workflows'], ['components', 'components'], ['versions', 'versions'], ['fields', 'fields']]) {
    r.get(`/api/projects/:id/${path}`, async ({ ctx, params }) => S()[svc].list(ctx, await pid(ctx, params.id)));
    r.post(`/api/projects/:id/${path}`, async ({ ctx, params, body }) => S()[svc].create(ctx, await pid(ctx, params.id), body));
    r.post(`/api/projects/:id/${path}/order`, async ({ ctx, params, body }) => S()[svc].reorder(ctx, await pid(ctx, params.id), body?.ids));
    r.get(`/api/projects/:id/${path}/:itemId`, ({ ctx, params }) => S()[svc].get(ctx, params.itemId));
    r.patch(`/api/projects/:id/${path}/:itemId`, ({ ctx, params, body }) => S()[svc].update(ctx, params.itemId, body));
    r.delete(`/api/projects/:id/${path}/:itemId`, ({ ctx, params, query, body }) => S()[svc].remove(ctx, params.itemId, { replaceWith: body?.replaceWith || query.replaceWith }));
  }
  r.post('/api/projects/:id/versions/:itemId/release', ({ ctx, params, body }) => S().versions.release(ctx, params.itemId, body || {}));
  // transitions (of the project's workflows)
  r.get('/api/projects/:id/transitions', async ({ ctx, params, query }) => {
    const p = await pid(ctx, params.id);
    const wfs = query.workflowId ? [{ id: query.workflowId }] : await S().workflows.list(ctx, p);
    const out = [];
    for (const wf of wfs) out.push(...(await S().transitions.list(ctx, wf.id)));
    return out;
  });
  r.post('/api/projects/:id/transitions', ({ ctx, body }) => {
    if (!body?.workflowId) throw new ValidationError('REQUIRED', 'workflowId is required', { field: 'workflowId' });
    return S().transitions.create(ctx, body.workflowId, body);
  });
  r.patch('/api/projects/:id/transitions/:itemId', ({ ctx, params, body }) => S().transitions.update(ctx, params.itemId, body));
  r.delete('/api/projects/:id/transitions/:itemId', ({ ctx, params }) => S().transitions.remove(ctx, params.itemId));
  // automation
  r.get('/api/projects/:id/automation', async ({ ctx, params }) => S().automation.list(ctx, await pid(ctx, params.id)));
  r.post('/api/projects/:id/automation', async ({ ctx, params, body }) => S().automation.create(ctx, await pid(ctx, params.id), body));
  r.get('/api/projects/:id/automation/:ruleId', ({ ctx, params }) => S().automation.get(ctx, params.ruleId));
  r.patch('/api/projects/:id/automation/:ruleId', ({ ctx, params, body }) => S().automation.update(ctx, params.ruleId, body));
  r.delete('/api/projects/:id/automation/:ruleId', ({ ctx, params }) => S().automation.remove(ctx, params.ruleId));
  r.post('/api/projects/:id/automation/:ruleId/run', ({ ctx, params }) => S().automation.run(ctx, params.ruleId));
  // export
  r.get('/api/projects/:id/export', async ({ ctx, params }) => {
    const data = await S().exchange.exportProject(ctx, params.id);
    return new Raw(JSON.stringify(data), { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="${data.project.key}.myboard"` });
  });

  // ---- global lists -------------------------------------------------------------------------------------------
  for (const g of ['priorities', 'resolutions']) {
    r.get(`/api/${g}`, ({ ctx }) => S()[g].list(ctx));
    r.post(`/api/${g}`, ({ ctx, body }) => S()[g].create(ctx, null, body));
    r.post(`/api/${g}/order`, ({ ctx, body }) => S()[g].reorder(ctx, null, body?.ids));
    r.patch(`/api/${g}/:id`, ({ ctx, params, body }) => S()[g].update(ctx, params.id, body));
    r.delete(`/api/${g}/:id`, ({ ctx, params, query, body }) => S()[g].remove(ctx, params.id, { replaceWith: body?.replaceWith || query.replaceWith }));
  }

  // ---- issues -------------------------------------------------------------------------------------------------
  r.get('/api/issues', ({ ctx, query }) => S().issues.search(ctx, query));
  r.post('/api/issues/search', ({ ctx, body }) => S().issues.search(ctx, body || {}));
  r.post('/api/issues', ({ ctx, body }) => S().issues.create(ctx, body));
  r.post('/api/issues/bulk', ({ ctx, body }) => S().issues.bulk(ctx, body));
  r.get('/api/issues/:id', ({ ctx, params }) => S().issues.get(ctx, params.id));
  r.patch('/api/issues/:id', ({ ctx, params, body }) => S().issues.update(ctx, params.id, body));
  r.delete('/api/issues/:id', ({ ctx, params }) => S().issues.remove(ctx, params.id));
  r.get('/api/issues/:id/transitions', ({ ctx, params }) => S().issues.transitions(ctx, params.id));
  r.post('/api/issues/:id/transition', ({ ctx, params, body }) => S().issues.transition(ctx, params.id, body));
  r.post('/api/issues/:id/move', ({ ctx, params, body }) => S().issues.move(ctx, params.id, body));
  r.post('/api/issues/:id/clone', ({ ctx, params, body }) => S().issues.clone(ctx, params.id, body || {}));

  // issue parts
  r.get('/api/issues/:id/comments', ({ ctx, params }) => S().comments.list(ctx, params.id));
  r.post('/api/issues/:id/comments', ({ ctx, params, body }) => S().comments.add(ctx, params.id, body));
  r.patch('/api/comments/:id', ({ ctx, params, body }) => S().comments.update(ctx, params.id, body));
  r.delete('/api/comments/:id', ({ ctx, params }) => S().comments.remove(ctx, params.id));

  r.get('/api/issues/:id/attachments', ({ ctx, params }) => S().attachments.list(ctx, params.id));
  /** JSON { fileName, mime, data: base64 } or raw bytes with X-File-Name (URI-encoded) + Content-Type. */
  r.post('/api/issues/:id/attachments', ({ ctx, params, body, req }) => {
    if (Buffer.isBuffer(body)) {
      return S().attachments.add(ctx, params.id, { fileName: decodeURIComponent(String(req.headers['x-file-name'] || 'file')), mime: req.headers['content-type'], buffer: body });
    }
    return S().attachments.add(ctx, params.id, body);
  }, { rawBody: true });
  r.get('/api/attachments/:id', async ({ ctx, params, query }) => {
    const a = await S().attachments.download(ctx, params.id);
    const inline = query.inline === '1' && /^image\/(png|jpeg|gif|webp|bmp|avif)$/.test(a.mime);
    return new Raw(a.data, {
      'Content-Type': inline ? a.mime : a.mime || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(a.fileName)}`,
      'Content-Security-Policy': "default-src 'none'", 'Cache-Control': 'private, max-age=3600',
    });
  });
  r.delete('/api/attachments/:id', ({ ctx, params }) => S().attachments.remove(ctx, params.id));

  r.get('/api/issues/:id/worklogs', ({ ctx, params }) => S().worklogs.list(ctx, params.id));
  r.post('/api/issues/:id/worklogs', ({ ctx, params, body }) => S().worklogs.add(ctx, params.id, body));
  r.patch('/api/worklogs/:id', ({ ctx, params, body }) => S().worklogs.update(ctx, params.id, body));
  r.delete('/api/worklogs/:id', ({ ctx, params }) => S().worklogs.remove(ctx, params.id));

  r.get('/api/issues/:id/links', ({ ctx, params }) => S().links.list(ctx, params.id));
  r.post('/api/issues/:id/links', ({ ctx, params, body }) => S().links.add(ctx, params.id, body));
  r.delete('/api/links/:id', ({ ctx, params }) => S().links.remove(ctx, params.id));

  r.get('/api/issues/:id/checklist', ({ ctx, params }) => S().checklist.list(ctx, params.id));
  r.post('/api/issues/:id/checklist', ({ ctx, params, body }) => S().checklist.add(ctx, params.id, body));
  r.patch('/api/checklist/:id', ({ ctx, params, body }) => S().checklist.update(ctx, params.id, body));
  r.delete('/api/checklist/:id', ({ ctx, params }) => S().checklist.remove(ctx, params.id));

  r.get('/api/issues/:id/watchers', ({ ctx, params }) => S().watchers.list(ctx, params.id));
  r.post('/api/issues/:id/watchers', ({ ctx, params, body }) => S().watchers.add(ctx, params.id, body || {}));
  r.delete('/api/issues/:id/watchers', ({ ctx, params }) => S().watchers.remove(ctx, params.id, null));
  r.delete('/api/issues/:id/watchers/:userId', ({ ctx, params }) => S().watchers.remove(ctx, params.id, params.userId));

  r.get('/api/issues/:id/votes', ({ ctx, params }) => S().votes.list(ctx, params.id));
  r.post('/api/issues/:id/votes', ({ ctx, params }) => S().votes.vote(ctx, params.id));
  r.delete('/api/issues/:id/votes', ({ ctx, params }) => S().votes.unvote(ctx, params.id));

  r.get('/api/issues/:id/history', ({ ctx, params }) => S().history.list(ctx, params.id));

  // ---- boards -------------------------------------------------------------------------------------------------
  r.get('/api/boards', ({ ctx, query }) => S().boards.list(ctx, query));
  r.post('/api/boards', ({ ctx, body }) => S().boards.create(ctx, body));
  r.get('/api/boards/:id', ({ ctx, params }) => S().boards.get(ctx, params.id));
  r.patch('/api/boards/:id', ({ ctx, params, body }) => S().boards.update(ctx, params.id, body));
  r.delete('/api/boards/:id', ({ ctx, params }) => S().boards.remove(ctx, params.id));
  r.get('/api/boards/:id/data', ({ ctx, params, query }) => S().boards.data(ctx, params.id, { ...query, includeAllDone: query.includeAllDone === '1' || query.includeAllDone === 'true' }));
  for (const [path, svc] of [['columns', 'columns'], ['swimlanes', 'swimlanes'], ['quickfilters', 'quickFilters'], ['cardcolors', 'cardColors']]) {
    r.get(`/api/boards/:id/${path}`, ({ ctx, params }) => S().boards[svc].list(ctx, params.id));
    r.post(`/api/boards/:id/${path}`, ({ ctx, params, body }) => S().boards[svc].create(ctx, params.id, body));
    r.post(`/api/boards/:id/${path}/order`, ({ ctx, params, body }) => S().boards[svc].reorder(ctx, params.id, body?.ids));
    r.patch(`/api/boards/:id/${path}/:itemId`, ({ ctx, params, body }) => S().boards[svc].update(ctx, params.itemId, body));
    r.delete(`/api/boards/:id/${path}/:itemId`, ({ ctx, params }) => S().boards[svc].remove(ctx, params.itemId));
  }

  // ---- search / filters ---------------------------------------------------------------------------------------
  r.post('/api/jql/validate', ({ ctx, body }) => S().search.validate(ctx, body?.jql || ''));
  r.get('/api/jql/suggest', ({ ctx, query }) => S().search.suggest(ctx, query.text || '', query.caret));
  r.get('/api/jql/fields', () => S().search.fields().map((f) => ({ name: f.name, aliases: f.aliases, operators: f.ops, order: !!f.order, detail: f.detail, valueType: f.valueType })));
  for (const [path, svc] of [['filters', 'filters'], ['dashboards', 'dashboards']]) {
    r.get(`/api/${path}`, ({ ctx }) => S()[svc].list(ctx));
    r.post(`/api/${path}`, ({ ctx, body }) => S()[svc].create(ctx, body));
    r.get(`/api/${path}/:id`, ({ ctx, params }) => S()[svc].get(ctx, params.id));
    r.patch(`/api/${path}/:id`, ({ ctx, params, body }) => S()[svc].update(ctx, params.id, body));
    r.delete(`/api/${path}/:id`, ({ ctx, params }) => S()[svc].remove(ctx, params.id));
  }

  // ---- reports ------------------------------------------------------------------------------------------------
  r.get('/api/reports/cfd', ({ ctx, query }) => S().reports.cfd(ctx, query));
  r.get('/api/reports/control', ({ ctx, query }) => S().reports.control(ctx, query));
  r.get('/api/reports/throughput', ({ ctx, query }) => S().reports.throughput(ctx, query));
  r.get('/api/reports/created-resolved', ({ ctx, query }) => S().reports.createdResolved(ctx, query));
  r.get('/api/reports/workload', ({ ctx, query }) => S().reports.workload(ctx, query));
  r.get('/api/reports/breakdown', ({ ctx, query }) => S().reports.breakdown(ctx, query));
  r.get('/api/reports/version/:id', ({ ctx, params }) => S().reports.version(ctx, params.id));

  // ---- notifications ------------------------------------------------------------------------------------------
  r.get('/api/notifications', ({ ctx, query }) => S().notifications.list(ctx, { ...query, unread: query.unread === '1' || query.unread === 'true' }));
  r.post('/api/notifications/read', ({ ctx, body }) => S().notifications.markRead(ctx, body || {}));

  // ---- exchange -----------------------------------------------------------------------------------------------
  r.post('/api/import/myboard', ({ ctx, body }) => S().exchange.importMyboard(ctx, body?.file ?? body, { key: body?.key, name: body?.name }));
  r.post('/api/import/csv', ({ ctx, body }) => S().exchange.importCsv(ctx, body));
  r.post('/api/import/trello', ({ ctx, body }) => S().exchange.importBoardJson(ctx, body?.board ?? body, { key: body?.key, name: body?.name }));
  r.get('/api/export/csv', async ({ ctx, query }) => new Raw(await S().exchange.exportCsv(ctx, query), { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="issues.csv"' }));

  // ---- samples ------------------------------------------------------------------------------------------------
  r.post('/api/samples', async ({ ctx, body }) => {
    if (!ctx.user || ctx.user.role !== 'admin') throw new AppError('ADMIN_REQUIRED', 'Administrator rights are required', 403);
    return createSamples(core, { language: body?.language === 'ko' ? 'ko' : 'en', user: ctx.user });
  });
}
