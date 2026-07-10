const bcrypt = require('bcryptjs');

async function seedDefaultAdmin(db) {
  const adminExists = await db('users').where({ username: 'admin' }).first();
  if (!adminExists) {
    const hash = await bcrypt.hash('admin', 10);
    await db('users').insert({
      username: 'admin',
      password: hash,
      display_name: '관리자',
      email: 'admin@local',
      role: 'admin',
      status: 'active'
    });
  }
}

async function runMigrations(db) {
  if (!(await db.schema.hasTable('users'))) {
    await db.schema.createTable('users', (t) => {
      t.increments('id').primary();
      t.string('username', 100).unique().notNullable();
      t.string('password', 255).notNullable();
      t.string('email', 255);
      t.string('display_name', 100);
      t.enu('role', ['admin', 'user']).defaultTo('user');
      t.enu('status', ['active', 'pending', 'inactive']).defaultTo('active');
      t.timestamps(true, true);
    });
  }

  if (!(await db.schema.hasTable('boards'))) {
    await db.schema.createTable('boards', (t) => {
      t.increments('id').primary();
      t.string('title', 255).notNullable();
      t.text('description');
      t.string('bg_color', 20).nullable();
      t.integer('owner_id').unsigned().references('id').inTable('users').onDelete('SET NULL');
      t.timestamps(true, true);
    });
  } else {
    if (!(await db.schema.hasColumn('boards', 'bg_color'))) {
      await db.schema.table('boards', t => { t.string('bg_color', 20).nullable(); });
    }
  }

  if (!(await db.schema.hasTable('board_members'))) {
    await db.schema.createTable('board_members', (t) => {
      t.integer('board_id').unsigned().references('id').inTable('boards').onDelete('CASCADE');
      t.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
      t.string('role', 20).notNullable().defaultTo('editor'); // admin | editor | viewer
      t.primary(['board_id', 'user_id']);
    });
  } else {
    // Add role column if upgrading from older schema
    if (!(await db.schema.hasColumn('board_members', 'role'))) {
      await db.schema.table('board_members', (t) => {
        t.string('role', 20).notNullable().defaultTo('editor');
      });
    }
  }

  if (!(await db.schema.hasTable('columns'))) {
    await db.schema.createTable('columns', (t) => {
      t.increments('id').primary();
      t.integer('board_id').unsigned().references('id').inTable('boards').onDelete('CASCADE');
      t.string('title', 255).notNullable();
      t.integer('position').defaultTo(0);
      t.string('bg_color', 20).nullable();
      t.string('type', 20).defaultTo('normal');
      t.timestamp('created_at').defaultTo(db.fn.now());
    });
  } else {
    if (!(await db.schema.hasColumn('columns', 'bg_color'))) {
      await db.schema.table('columns', t => { t.string('bg_color', 20).nullable(); });
    }
    if (!(await db.schema.hasColumn('columns', 'type'))) {
      await db.schema.table('columns', t => { t.string('type', 20).defaultTo('normal'); });
    }
  }

  if (!(await db.schema.hasTable('cards'))) {
    await db.schema.createTable('cards', (t) => {
      t.increments('id').primary();
      t.integer('column_id').unsigned().references('id').inTable('columns').onDelete('CASCADE');
      t.string('title', 255).notNullable();
      t.text('description');
      t.integer('assignee_id').unsigned().references('id').inTable('users').onDelete('SET NULL');
      t.date('due_date');
      t.string('color', 20).nullable();
      t.string('bg_color', 20).nullable();
      t.string('stripe_color', 20).nullable();
      t.integer('position').defaultTo(0);
      t.timestamps(true, true);
    });
  } else {
    if (!(await db.schema.hasColumn('cards', 'assignee_id'))) {
      await db.schema.table('cards', t => {
        t.integer('assignee_id').unsigned().references('id').inTable('users').onDelete('SET NULL');
      });
    }
    if (!(await db.schema.hasColumn('cards', 'due_date'))) {
      await db.schema.table('cards', t => { t.date('due_date'); });
    }
    if (!(await db.schema.hasColumn('cards', 'color'))) {
      await db.schema.table('cards', t => { t.string('color', 20).nullable(); });
    }
    if (!(await db.schema.hasColumn('cards', 'bg_color'))) {
      await db.schema.table('cards', t => { t.string('bg_color', 20).nullable(); });
    }
    if (!(await db.schema.hasColumn('cards', 'stripe_color'))) {
      await db.schema.table('cards', t => { t.string('stripe_color', 20).nullable(); });
    }
    const legacyColored = await db('cards').whereNotNull('color').whereNull('stripe_color').select('id', 'color');
    for (const row of legacyColored) {
      await db('cards').where({ id: row.id }).update({ stripe_color: row.color });
    }
  }

  if (!(await db.schema.hasTable('attachments'))) {
    await db.schema.createTable('attachments', (t) => {
      t.increments('id').primary();
      t.integer('card_id').unsigned().references('id').inTable('cards').onDelete('CASCADE');
      t.string('filename', 255).notNullable();
      t.string('original_name', 255).notNullable();
      t.integer('size');
      t.string('mimetype', 100);
      t.timestamp('created_at').defaultTo(db.fn.now());
    });
  }

  if (!(await db.schema.hasTable('comments'))) {
    await db.schema.createTable('comments', (t) => {
      t.increments('id').primary();
      t.integer('card_id').unsigned().references('id').inTable('cards').onDelete('CASCADE').notNullable();
      t.integer('parent_id').unsigned().nullable();
      t.integer('user_id').unsigned().references('id').inTable('users').onDelete('SET NULL').nullable();
      t.text('content').notNullable();
      t.boolean('deleted').defaultTo(false);
      t.timestamps(true, true);
    });
  } else {
    if (!(await db.schema.hasColumn('comments', 'deleted'))) {
      await db.schema.table('comments', t => { t.boolean('deleted').defaultTo(false); });
    }
  }

  if (!(await db.schema.hasTable('comment_attachments'))) {
    await db.schema.createTable('comment_attachments', (t) => {
      t.increments('id').primary();
      t.integer('comment_id').unsigned().references('id').inTable('comments').onDelete('CASCADE').notNullable();
      t.string('filename', 255).notNullable();
      t.string('original_name', 255).notNullable();
      t.integer('size');
      t.string('mimetype', 100);
      t.timestamp('created_at').defaultTo(db.fn.now());
    });
  }

  await seedDefaultAdmin(db);
}

module.exports = { runMigrations, seedDefaultAdmin };
