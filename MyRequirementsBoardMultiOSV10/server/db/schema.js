import { hashPassword } from '../auth/password.js';

export async function ensureSchema(knex) {
  const hasUsers = await knex.schema.hasTable('users');
  if (!hasUsers) {
    await knex.schema.createTable('users', (t) => {
      t.increments('id').primary();
      t.string('username', 128).notNullable().unique();
      t.string('password_hash', 255).notNullable();
      t.string('name', 255).notNullable().defaultTo('');
      t.string('email', 255).defaultTo('');
      t.string('company', 255).defaultTo('');
      t.string('department', 255).defaultTo('');
      t.string('role', 16).notNullable().defaultTo('VIEWER');
      t.integer('is_active').notNullable().defaultTo(1);
      t.timestamp('created_at').defaultTo(knex.fn.now());
    });
  }

  if (!(await knex.schema.hasTable('registration_requests'))) {
    await knex.schema.createTable('registration_requests', (t) => {
      t.increments('id').primary();
      t.string('username', 128).notNullable();
      t.string('password_hash', 255).notNullable();
      t.string('name', 255).notNullable();
      t.string('email', 255).defaultTo('');
      t.string('company', 255).defaultTo('');
      t.string('department', 255).defaultTo('');
      t.string('requested_role', 16).notNullable().defaultTo('VIEWER');
      t.string('status', 16).notNullable().defaultTo('PENDING');
      t.timestamp('created_at').defaultTo(knex.fn.now());
      t.timestamp('reviewed_at').nullable();
    });
  }

  if (!(await knex.schema.hasTable('projects'))) {
    await knex.schema.createTable('projects', (t) => {
      t.increments('id').primary();
      t.string('code', 64).notNullable().unique();
      t.string('name', 255).notNullable();
      t.text('description').defaultTo('');
      t.integer('is_active').notNullable().defaultTo(1);
      t.integer('created_by_id').unsigned().nullable();
      t.timestamp('created_at').defaultTo(knex.fn.now());
      t.timestamp('updated_at').defaultTo(knex.fn.now());
    });
  }

  if (!(await knex.schema.hasTable('requirements'))) {
    await knex.schema.createTable('requirements', (t) => {
      t.increments('id').primary();
      t.integer('project_id').unsigned().notNullable();
      t.string('code', 64).notNullable();
      t.string('classification', 255).defaultTo('');
      t.string('title', 512).notNullable();
      t.text('description').defaultTo('');
      t.string('category', 255).defaultTo('');
      t.string('priority', 16).notNullable().defaultTo('MEDIUM');
      t.string('status', 16).notNullable().defaultTo('DRAFT');
      t.integer('created_by_id').unsigned().nullable();
      t.timestamp('created_at').defaultTo(knex.fn.now());
      t.timestamp('updated_at').defaultTo(knex.fn.now());
      t.unique(['project_id', 'code']);
      t.foreign('project_id').references('projects.id').onDelete('CASCADE');
    });
  } else if (!(await knex.schema.hasColumn('requirements', 'classification'))) {
    await knex.schema.alterTable('requirements', (t) => {
      t.string('classification', 255).defaultTo('');
    });
  }

  if (!(await knex.schema.hasTable('test_cases'))) {
    await knex.schema.createTable('test_cases', (t) => {
      t.increments('id').primary();
      t.string('code', 64).notNullable().unique();
      t.string('title', 512).notNullable();
      t.text('steps').defaultTo('');
      t.text('expected_result').defaultTo('');
      t.string('status', 16).notNullable().defaultTo('NOT_RUN');
      t.integer('requirement_id').unsigned().notNullable();
      t.integer('created_by_id').unsigned().nullable();
      t.timestamp('created_at').defaultTo(knex.fn.now());
      t.timestamp('updated_at').defaultTo(knex.fn.now());
      t.foreign('requirement_id').references('requirements.id').onDelete('CASCADE');
    });
  }

  if (!(await knex.schema.hasTable('app_settings'))) {
    await knex.schema.createTable('app_settings', (t) => {
      t.string('setting_key', 128).primary();
      t.text('value').notNullable().defaultTo('');
    });
  } else if (!(await knex.schema.hasColumn('app_settings', 'setting_key'))
    && (await knex.schema.hasColumn('app_settings', 'key'))) {
    await knex.schema.renameColumn('app_settings', 'key', 'setting_key');
  }

  if (!(await knex.schema.hasTable('project_members'))) {
    await knex.schema.createTable('project_members', (t) => {
      t.increments('id').primary();
      t.integer('project_id').unsigned().notNullable();
      t.integer('user_id').unsigned().notNullable();
      t.string('member_role', 16).notNullable().defaultTo('VIEWER');
      t.timestamp('assigned_at').defaultTo(knex.fn.now());
      t.unique(['project_id', 'user_id']);
      t.foreign('project_id').references('projects.id').onDelete('CASCADE');
      t.foreign('user_id').references('users.id').onDelete('CASCADE');
    });
  } else if (!(await knex.schema.hasColumn('project_members', 'member_role'))) {
    await knex.schema.alterTable('project_members', (t) => {
      t.string('member_role', 16).notNullable().defaultTo('EDITOR');
    });
  }
}

export async function ensureSeedData(knex) {
  const admin = await knex('users').whereRaw('LOWER(username) = ?', ['admin']).first();
  if (!admin) {
    await knex('users').insert({
      username: 'admin',
      password_hash: hashPassword('admin'),
      name: '관리자',
      role: 'ADMIN',
      is_active: 1,
    });
  } else if (!admin.is_active) {
    await knex('users').where({ id: admin.id }).update({ is_active: 1, role: 'ADMIN' });
  }

  const projectCount = Number((await knex('projects').count('* as count').first())?.count ?? 0);
  if (projectCount === 0) {
    await knex('projects').insert({
      code: 'DEFAULT',
      name: '기본 프로젝트',
      description: '시스템 기본 프로젝트',
    });
  }

  const memberCount = Number((await knex('project_members').count('* as count').first())?.count ?? 0);
  if (memberCount === 0) {
    const defaultProject = await knex('projects').where({ code: 'DEFAULT' }).first();
    if (defaultProject) {
      const users = await knex('users').whereNot({ role: 'ADMIN' }).select('id');
      if (users.length > 0) {
        await knex('project_members').insert(
          users.map((u) => ({ project_id: defaultProject.id, user_id: u.id, member_role: 'EDITOR' })),
        );
      }
    }
  }
}

export async function hasSchema(knex) {
  return knex.schema.hasTable('users');
}
