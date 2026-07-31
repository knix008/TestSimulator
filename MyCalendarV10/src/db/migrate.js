/**
 * Schema migrations. Idempotent — safe to run on every startup.
 */
async function runMigrations(db) {
  // Calendars (local grouping / color; also maps to a Google calendarId)
  if (!(await db.schema.hasTable('calendars'))) {
    await db.schema.createTable('calendars', (t) => {
      t.increments('id').primary();
      t.string('name', 255).notNullable();
      t.string('color', 20).defaultTo('#3b82f6');
      t.string('google_calendar_id', 255).nullable(); // linked Google calendar
      t.boolean('is_default').defaultTo(false);
      t.boolean('visible').defaultTo(true);
      t.timestamps(true, true);
    });
    await db('calendars').insert({ name: '내 캘린더', color: '#3b82f6', is_default: true, visible: true });
  }

  // Events
  if (!(await db.schema.hasTable('events'))) {
    await db.schema.createTable('events', (t) => {
      t.increments('id').primary();
      t.string('uid', 100).notNullable().unique();       // stable id used for .ics / sync
      t.integer('calendar_id').unsigned().references('id').inTable('calendars').onDelete('CASCADE');
      t.string('title', 500).notNullable();
      t.text('description');
      t.string('location', 500);
      t.datetime('start_time').notNullable();
      t.datetime('end_time').notNullable();
      t.boolean('all_day').defaultTo(false);
      t.string('color', 20).nullable();
      t.string('recurrence', 500).nullable();            // RRULE string (optional)
      t.integer('reminder_minutes').nullable();          // minutes before start
      // Google sync bookkeeping
      t.string('google_event_id', 255).nullable();
      t.string('etag', 255).nullable();
      t.string('sync_status', 20).defaultTo('local');    // local | synced | dirty | deleted
      t.datetime('deleted_at').nullable();
      t.timestamps(true, true);
    });
    await db.schema.alterTable('events', (t) => {
      t.index(['start_time', 'end_time']);
      t.index('google_event_id');
    });
  }

  // ICS subscriptions (external calendars, e.g. Outlook "publish" links)
  if (!(await db.schema.hasTable('subscriptions'))) {
    await db.schema.createTable('subscriptions', (t) => {
      t.increments('id').primary();
      t.string('name', 255).notNullable();
      t.text('url').notNullable();
      t.integer('calendar_id').unsigned().references('id').inTable('calendars').onDelete('SET NULL');
      t.datetime('last_fetched').nullable();
      t.string('last_status', 20).defaultTo('pending'); // ok | error | pending
      t.timestamps(true, true);
    });
  }

  // Columns linking events to a subscription feed (for upsert/prune on refresh)
  if (await db.schema.hasTable('events')) {
    if (!(await db.schema.hasColumn('events', 'subscription_id'))) {
      await db.schema.alterTable('events', (t) => { t.integer('subscription_id').unsigned().nullable(); });
    }
    if (!(await db.schema.hasColumn('events', 'source_uid'))) {
      await db.schema.alterTable('events', (t) => { t.string('source_uid', 255).nullable(); });
    }
  }

  // Key/value settings (Google tokens, sync cursor, preferences)
  if (!(await db.schema.hasTable('settings'))) {
    await db.schema.createTable('settings', (t) => {
      t.string('key', 100).primary();
      t.text('value');
      t.timestamps(true, true);
    });
  }
}

module.exports = { runMigrations };
