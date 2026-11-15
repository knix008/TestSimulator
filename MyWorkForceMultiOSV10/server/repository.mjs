import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { describeMail, webhookPayload } from '../src/domain/services.js';
import { postNotice } from './chat.mjs';
import { openEngine } from './engine.mjs';

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(String(password), salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

export function checkPassword(password, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const next = scryptSync(String(password), salt, 32);
  const previous = Buffer.from(hash, 'hex');
  if (next.length !== previous.length) return false;
  return timingSafeEqual(next, previous);
}

function rowsOf(result) {
  return Array.isArray(result) ? result : [];
}

export class Repository {
  constructor(engine, config) {
    this.engine = engine;
    this.config = { ...config, password: undefined };
    this.cached = null;
    this.cursors = { activity: {}, notification: {} };
  }

  describe() {
    return {
      company: true,
      connected: true,
      engine: this.engine.engine,
      database: this.config.database || this.config.file || '',
      host: this.config.host || '',
    };
  }

  async prepare() {
    const rows = rowsOf(await this.engine.query('SELECT meta_value FROM app_meta WHERE meta_key = ?', ['cursors']));
    if (rows[0]?.meta_value) {
      try { this.cursors = JSON.parse(rows[0].meta_value); } catch { /* keep the empty cursor */ }
    }
    this.cached = await this.readWorkspace();
  }

  async readWorkspace() {
    const rows = rowsOf(await this.engine.query('SELECT body FROM workspace_document WHERE id = ?', ['main']));
    if (!rows[0]?.body) return null;
    return JSON.parse(rows[0].body);
  }

  async writeWorkspace(ws, expectedRevision = null) {
    const current = Number(this.cached?.revision) || 0;
    if (expectedRevision != null && Number(expectedRevision) !== current) {
      const error = new Error('conflict');
      error.revision = current;
      throw error;
    }
    ws.revision = current + 1;
    const previous = this.cached;
    for (const user of ws.users || []) {
      if (!user.passwordHash) {
        const older = previous?.users?.find((item) => item.id === user.id);
        if (older?.passwordHash) user.passwordHash = older.passwordHash;
      }
    }
    if (ws.mail && typeof ws.mail === 'object' && !ws.mail.password && previous?.mail?.password) {
      ws.mail.password = previous.mail.password;
    }
    ws.mailOutbox = Array.isArray(ws.mailOutbox) ? ws.mailOutbox : [];
    for (const message of previous?.mailOutbox || []) {
      if (!(ws.mailOutbox || []).some((item) => item.id === message.id)) ws.mailOutbox.unshift(message);
    }
    this.rememberFresh(ws);
    if (ws.modules?.mail !== false) {
      for (const item of this.pendingNotes || []) {
        const user = (ws.users || []).find((person) => person.id === item.entry.userId);
        if (!user?.email) continue;
        const id = `mail-${item.entry.id}`;
        if ((ws.mailOutbox || []).some((message) => message.id === id)) continue;
        ws.mailOutbox.unshift({
          id, to: user.email,
          subject: `[${item.entry.issueKey || item.project.key}] ${item.entry.kind || 'update'}`,
          body: `${item.entry.issueKey || ''} ${item.entry.kind || ''}`.trim(),
          state: 'queued', created: new Date().toISOString(),
        });
      }
    }
    await this.flushMail(ws);
    const savedAt = ws.savedAt || new Date().toISOString();
    await this.engine.transaction(async (query) => {
      await query('DELETE FROM workspace_document WHERE id = ?', ['main']);
      await query('INSERT INTO workspace_document (id, body, saved_at) VALUES (?, ?, ?)', ['main', JSON.stringify(ws), savedAt]);
      await query('DELETE FROM documents', []);
      for (const doc of ws.documents || []) {
        await query('INSERT INTO documents (id, project_id, template_id, title, body, author_id, visibility, issue_key, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [doc.id, doc.projectId || '', doc.templateId || '', doc.title || '', doc.body || '', doc.authorId || '', doc.visibility || 'private', doc.issueKey || '', doc.updated || savedAt]);
      }
      await query('DELETE FROM articles', []);
      for (const article of ws.articles || []) {
        await query('INSERT INTO articles (id, project_id, title, body, published, author_id, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [article.id, article.projectId || '', article.title || '', article.body || '', article.published === false ? 0 : 1, article.authorId || '', article.updated || savedAt]);
      }
      await query('DELETE FROM calendars', []);
      for (const calendar of ws.calendars || []) {
        await query('INSERT INTO calendars (id, name, timezone, week_json, holidays_json) VALUES (?, ?, ?, ?, ?)', [calendar.id, calendar.name || '', calendar.timezone || '', JSON.stringify(calendar.week || {}), JSON.stringify(calendar.holidays || [])]);
      }
      await query('DELETE FROM approvals', []);
      for (const approval of ws.approvals || []) {
        await query('INSERT INTO approvals (id, project_id, issue_id, status_id, requester_id, approver_id, state, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [approval.id, approval.projectId || '', approval.issueId || '', approval.statusId || '', approval.requesterId || '', approval.approverId || '', approval.state || '', approval.comment || '', approval.created || savedAt]);
      }
      await query('DELETE FROM webhooks', []);
      for (const hook of ws.webhooks || []) {
        await query('INSERT INTO webhooks (id, url, events, secret, enabled) VALUES (?, ?, ?, ?, ?)', [hook.id, hook.url || '', (hook.events || []).join(','), hook.secret || '', hook.enabled === false ? 0 : 1]);
      }
      await query('DELETE FROM mail_outbox', []);
      for (const message of ws.mailOutbox || []) {
        await query('INSERT INTO mail_outbox (id, to_addr, subject, body, state, created_at) VALUES (?, ?, ?, ?, ?, ?)', [message.id, message.to || '', message.subject || '', message.body || '', message.state || 'queued', message.created || savedAt]);
      }
      await query('DELETE FROM api_tokens', []);
      for (const token of ws.apiTokens || []) {
        await query('INSERT INTO api_tokens (id, name, token, created_at) VALUES (?, ?, ?, ?)', [token.id, token.name || '', token.token || '', token.created || savedAt]);
      }
      await query('DELETE FROM accounts', []);
      for (const user of ws.users || []) {
        await query('INSERT INTO accounts (id, name, email, password_hash, active) VALUES (?, ?, ?, ?, ?)', [user.id, user.name || '', user.email || '', user.passwordHash || '', user.active === false ? 0 : 1]);
      }
      await query('DELETE FROM issue_index', []);
      for (const project of ws.projects || []) {
        for (const issue of project.issues || []) {
          await query('INSERT INTO issue_index (id, project_id, issue_key, summary, type_id, status_id, assignee_id) VALUES (?, ?, ?, ?, ?, ?, ?)', [issue.id, project.id, issue.key || '', issue.summary || '', issue.typeId || '', issue.statusId || '', issue.assigneeId || '']);
        }
      }
      await query('DELETE FROM app_meta WHERE meta_key = ?', ['cursors']);
      await query('INSERT INTO app_meta (meta_key, meta_value) VALUES (?, ?)', ['cursors', JSON.stringify(this.cursors)]);
    });
    this.cached = ws;
    await this.deliver(ws);
    for (const item of this.pendingNotes || []) {
      const text = [item.project?.key, item.entry?.issueKey, item.entry?.kind].filter(Boolean).join(' · ');
      try { await postNotice(this.engine, item.entry?.userId, item.entry?.id, text || 'update'); }
      catch (error) { console.error(error); }
    }
  }

  rememberFresh(ws) {
    const activity = [];
    const notes = [];
    for (const project of ws.projects || []) {
      const seen = this.cursors.activity[project.id];
      if (!seen) this.cursors.activity[project.id] = project.activity?.[0]?.id || '';
      else {
        for (const entry of project.activity || []) {
          if (entry.id === seen) break;
          activity.push({ project, entry });
        }
        if (project.activity?.[0]) this.cursors.activity[project.id] = project.activity[0].id;
      }
      const noted = this.cursors.notification[project.id];
      if (!noted) this.cursors.notification[project.id] = project.notifications?.[0]?.id || '';
      else {
        for (const entry of project.notifications || []) {
          if (entry.id === noted) break;
          notes.push({ project, entry });
        }
        if (project.notifications?.[0]) this.cursors.notification[project.id] = project.notifications[0].id;
      }
    }
    this.pendingActivity = activity;
    this.pendingNotes = notes;
  }

  async deliver(ws) {
    const hooks = (ws.webhooks || []).filter((hook) => hook.enabled !== false && hook.url);
    for (const item of this.pendingActivity || []) {
      const issue = item.project.issues?.find((issue) => issue.id === item.entry.issueId);
      const body = webhookPayload(item.entry, issue, item.project);
      for (const hook of hooks) {
        if (hook.events?.length && !hook.events.includes(item.entry.kind)) continue;
        let status = 0;
        let detail = '';
        try {
          const signature = createHash('sha256').update(`${hook.secret || ''}.${JSON.stringify(body)}`).digest('hex');
          const response = await fetch(hook.url, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-myworkforce-signature': signature },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(4000),
          });
          status = response.status;
          detail = response.ok ? 'ok' : await response.text();
        } catch (error) {
          detail = error?.message || 'failed';
        }
        await this.engine.query('INSERT INTO webhook_log (id, webhook_id, event_name, status_code, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)', [`log-${randomBytes(6).toString('hex')}`, hook.id, item.entry.kind || '', status, String(detail).slice(0, 500), new Date().toISOString()]);
      }
    }
  }

  mailTransport(mail) {
    const spec = describeMail(mail);
    if (!spec.host) {
      const error = new Error('mail-host');
      throw error;
    }
    return spec;
  }

  async sendMail(mail, message) {
    const spec = this.mailTransport(mail);
    const from = String(mail?.from || mail?.user || '').trim();
    if (!from) {
      const error = new Error('mail-from');
      throw error;
    }
    let nodemailer;
    try {
      nodemailer = await import('nodemailer');
    } catch (error) {
      const wrapped = new Error('mail');
      wrapped.detail = error?.message || 'mail';
      throw wrapped;
    }
    const transport = nodemailer.createTransport({
      host: spec.host,
      port: spec.port,
      secure: spec.secure,
      requireTLS: spec.requireTLS,
      ignoreTLS: spec.ignoreTLS,
      auth: mail?.user ? { user: mail.user, pass: mail.password || '' } : undefined,
      tls: { minVersion: 'TLSv1.2', servername: spec.host },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000,
    });
    try {
      await transport.sendMail({ from, to: message.to, subject: message.subject, text: message.body });
    } catch (error) {
      const wrapped = new Error('mail');
      wrapped.detail = error?.message || 'mail';
      throw wrapped;
    }
  }

  async flushMail(ws) {
    const pending = (ws.mailOutbox || []).filter((message) => message.state === 'queued');
    if (!pending.length || !describeMail(ws.mail).host) return;
    for (const message of pending) {
      try {
        await this.sendMail(ws.mail, message);
        message.state = 'sent';
        message.error = '';
      } catch (error) {
        message.state = 'error';
        message.error = error?.detail || error?.message || 'mail';
      }
    }
  }

  unlock(userId, password) {
    const users = this.cached?.users || [];
    const user = users.find((item) => item.id === userId);
    if (user) return user.passwordHash ? checkPassword(password, user.passwordHash) : true;
    const locked = users.filter((item) => item.passwordHash);
    if (!locked.length) return true;
    return checkPassword(password, locked[0]?.passwordHash);
  }

  async close() { await this.engine.close(); }
}

export async function openRepository(config) {
  const engine = await openEngine(config);
  const repository = new Repository(engine, config);
  await repository.prepare();
  return repository;
}
