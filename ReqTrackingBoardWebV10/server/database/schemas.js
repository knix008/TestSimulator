export function convertPlaceholders(sql, params, dialect) {
  if (dialect !== 'postgresql') return { sql, params };
  let index = 0;
  const converted = sql.replace(/\?/g, () => `$${++index}`);
  return { sql: converted, params };
}

export function mysqlSchema(database) {
  return [
    `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(100) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      display_name VARCHAR(200) NOT NULL,
      email VARCHAR(255) NOT NULL DEFAULT '',
      role VARCHAR(50) NOT NULL DEFAULT 'user',
      permission VARCHAR(50) NOT NULL DEFAULT 'view',
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      theme VARCHAR(50) NOT NULL DEFAULT 'default',
      menu_layout VARCHAR(50) NOT NULL DEFAULT 'vertical',
      language VARCHAR(10) NOT NULL DEFAULT 'ko',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS requirements (
      id INT AUTO_INCREMENT PRIMARY KEY,
      req_id VARCHAR(100) UNIQUE NOT NULL,
      title VARCHAR(500) NOT NULL,
      description TEXT,
      category VARCHAR(100) DEFAULT 'General',
      priority VARCHAR(50) DEFAULT 'Medium',
      status VARCHAR(50) DEFAULT 'Draft',
      owner VARCHAR(200) DEFAULT '',
      version VARCHAR(50) DEFAULT '1.0',
      created_by INT,
      updated_by INT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS test_cases (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tc_id VARCHAR(100) UNIQUE NOT NULL,
      requirement_id INT NOT NULL,
      title VARCHAR(500) NOT NULL,
      description TEXT,
      steps TEXT,
      expected_result TEXT,
      status VARCHAR(50) DEFAULT 'Not Run',
      result TEXT,
      executed_by VARCHAR(200) DEFAULT '',
      executed_at DATETIME NULL,
      notes TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (requirement_id) REFERENCES requirements(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS requirement_history (
      id INT AUTO_INCREMENT PRIMARY KEY,
      requirement_id INT NULL,
      req_id VARCHAR(100) NOT NULL,
      action VARCHAR(20) NOT NULL,
      changes TEXT,
      note VARCHAR(100) NULL,
      changed_by INT NULL,
      changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  ];
}

export function postgresSchema() {
  return [
    `CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(100) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      display_name VARCHAR(200) NOT NULL,
      email VARCHAR(255) NOT NULL DEFAULT '',
      role VARCHAR(50) NOT NULL DEFAULT 'user',
      permission VARCHAR(50) NOT NULL DEFAULT 'view',
      is_active BOOLEAN NOT NULL DEFAULT true,
      theme VARCHAR(50) NOT NULL DEFAULT 'default',
      menu_layout VARCHAR(50) NOT NULL DEFAULT 'vertical',
      language VARCHAR(10) NOT NULL DEFAULT 'ko',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS requirements (
      id SERIAL PRIMARY KEY,
      req_id VARCHAR(100) UNIQUE NOT NULL,
      title VARCHAR(500) NOT NULL,
      description TEXT,
      category VARCHAR(100) DEFAULT 'General',
      priority VARCHAR(50) DEFAULT 'Medium',
      status VARCHAR(50) DEFAULT 'Draft',
      owner VARCHAR(200) DEFAULT '',
      version VARCHAR(50) DEFAULT '1.0',
      created_by INT REFERENCES users(id) ON DELETE SET NULL,
      updated_by INT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS test_cases (
      id SERIAL PRIMARY KEY,
      tc_id VARCHAR(100) UNIQUE NOT NULL,
      requirement_id INT NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
      title VARCHAR(500) NOT NULL,
      description TEXT,
      steps TEXT,
      expected_result TEXT,
      status VARCHAR(50) DEFAULT 'Not Run',
      result TEXT,
      executed_by VARCHAR(200) DEFAULT '',
      executed_at TIMESTAMP NULL,
      notes TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS requirement_history (
      id SERIAL PRIMARY KEY,
      requirement_id INT NULL,
      req_id VARCHAR(100) NOT NULL,
      action VARCHAR(20) NOT NULL,
      changes TEXT,
      note VARCHAR(100) NULL,
      changed_by INT REFERENCES users(id) ON DELETE SET NULL,
      changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
  ];
}

export function sqliteSchema() {
  return [
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      display_name TEXT NOT NULL,
      email TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT 'user',
      permission TEXT NOT NULL DEFAULT 'view',
      is_active INTEGER NOT NULL DEFAULT 1,
      theme TEXT NOT NULL DEFAULT 'default',
      menu_layout TEXT NOT NULL DEFAULT 'vertical',
      language TEXT NOT NULL DEFAULT 'ko',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS requirements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      req_id TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      category TEXT DEFAULT 'General',
      priority TEXT DEFAULT 'Medium',
      status TEXT DEFAULT 'Draft',
      owner TEXT DEFAULT '',
      version TEXT DEFAULT '1.0',
      created_by INTEGER,
      updated_by INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
    )`,
    `CREATE TABLE IF NOT EXISTS test_cases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tc_id TEXT UNIQUE NOT NULL,
      requirement_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      steps TEXT DEFAULT '',
      expected_result TEXT DEFAULT '',
      status TEXT DEFAULT 'Not Run',
      result TEXT DEFAULT '',
      executed_by TEXT DEFAULT '',
      executed_at TEXT,
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (requirement_id) REFERENCES requirements(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS requirement_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      requirement_id INTEGER,
      req_id TEXT NOT NULL,
      action TEXT NOT NULL,
      changes TEXT,
      note TEXT,
      changed_by INTEGER,
      changed_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL
    )`,
  ];
}

export async function ensureAdminUser(adapter, bcrypt) {
  const admin = await adapter.queryOne('SELECT id FROM users WHERE username = ?', ['admin']);
  if (!admin) {
    const hash = bcrypt.hashSync('admin', 10);
    await adapter.insert(
      'INSERT INTO users (username, password, display_name, email, role, permission) VALUES (?, ?, ?, ?, ?, ?)',
      ['admin', hash, 'Administrator', 'admin@localhost', 'admin', 'edit']
    );
  }
}

export async function migrateEmailColumn(adapter, dialect) {
  if (dialect === 'sqlite3') {
    try {
      await adapter.execute(`ALTER TABLE users ADD COLUMN email TEXT NOT NULL DEFAULT ''`);
    } catch (err) {
      if (!String(err.message).includes('duplicate column')) throw err;
    }
    await adapter.execute(
      `UPDATE users SET email = 'admin@localhost' WHERE username = 'admin' AND (email IS NULL OR email = '')`
    ).catch(() => {});
    return;
  }
  if (dialect === 'postgresql') {
    try {
      await adapter.execute(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255) NOT NULL DEFAULT ''`);
      await adapter.execute(
        `UPDATE users SET email = 'admin@localhost' WHERE username = 'admin' AND (email IS NULL OR email = '')`
      );
    } catch { /* ignore */ }
    return;
  }
  try {
    await adapter.execute(`ALTER TABLE users ADD COLUMN email VARCHAR(255) NOT NULL DEFAULT ''`);
  } catch (err) {
    if (err.code !== 'ER_DUP_FIELDNAME') throw err;
  }
  await adapter.execute(
    `UPDATE users SET email = 'admin@localhost' WHERE username = 'admin' AND (email IS NULL OR email = '')`
  ).catch(() => {});
}

export async function migrateMenuLayoutColumn(adapter, dialect) {
  if (dialect === 'sqlite3') {
    try {
      await adapter.execute(`ALTER TABLE users ADD COLUMN menu_layout TEXT NOT NULL DEFAULT 'vertical'`);
    } catch (err) {
      if (!String(err.message).includes('duplicate column')) throw err;
    }
    return;
  }
  if (dialect === 'postgresql') {
    try {
      await adapter.execute(`ALTER TABLE users ADD COLUMN IF NOT EXISTS menu_layout VARCHAR(50) NOT NULL DEFAULT 'vertical'`);
    } catch { /* ignore */ }
    return;
  }
  try {
    await adapter.execute(`ALTER TABLE users ADD COLUMN menu_layout VARCHAR(50) NOT NULL DEFAULT 'vertical'`);
  } catch (err) {
    if (err.code !== 'ER_DUP_FIELDNAME') throw err;
  }
}

export async function migrateLanguageColumn(adapter, dialect) {
  if (dialect === 'sqlite3') {
    try {
      await adapter.execute(`ALTER TABLE users ADD COLUMN language TEXT NOT NULL DEFAULT 'ko'`);
    } catch (err) {
      if (!String(err.message).includes('duplicate column')) throw err;
    }
    return;
  }
  if (dialect === 'postgresql') {
    try {
      await adapter.execute(`ALTER TABLE users ADD COLUMN IF NOT EXISTS language VARCHAR(10) NOT NULL DEFAULT 'ko'`);
    } catch { /* ignore */ }
    return;
  }
  try {
    await adapter.execute(`ALTER TABLE users ADD COLUMN language VARCHAR(10) NOT NULL DEFAULT 'ko'`);
  } catch (err) {
    if (err.code !== 'ER_DUP_FIELDNAME') throw err;
  }
}

export async function migrateRequirementHistoryTable(adapter, dialect) {
  const ddl = dialect === 'sqlite3'
    ? `CREATE TABLE IF NOT EXISTS requirement_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      requirement_id INTEGER,
      req_id TEXT NOT NULL,
      action TEXT NOT NULL,
      changes TEXT,
      note TEXT,
      changed_by INTEGER,
      changed_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL
    )`
    : dialect === 'postgresql'
      ? `CREATE TABLE IF NOT EXISTS requirement_history (
        id SERIAL PRIMARY KEY,
        requirement_id INT NULL,
        req_id VARCHAR(100) NOT NULL,
        action VARCHAR(20) NOT NULL,
        changes TEXT,
        note VARCHAR(100) NULL,
        changed_by INT REFERENCES users(id) ON DELETE SET NULL,
        changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`
      : `CREATE TABLE IF NOT EXISTS requirement_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        requirement_id INT NULL,
        req_id VARCHAR(100) NOT NULL,
        action VARCHAR(20) NOT NULL,
        changes TEXT,
        note VARCHAR(100) NULL,
        changed_by INT NULL,
        changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`;
  await adapter.execute(ddl);
}

export async function migrateThemeColumn(adapter, dialect) {
  if (dialect === 'sqlite3') {
    try {
      await adapter.execute(`ALTER TABLE users ADD COLUMN theme TEXT NOT NULL DEFAULT 'default'`);
    } catch (err) {
      if (!String(err.message).includes('duplicate column')) throw err;
    }
    return;
  }
  if (dialect === 'postgresql') {
    try {
      await adapter.execute(`ALTER TABLE users ADD COLUMN IF NOT EXISTS theme VARCHAR(50) NOT NULL DEFAULT 'default'`);
    } catch { /* ignore */ }
    return;
  }
  try {
    await adapter.execute(`ALTER TABLE users ADD COLUMN theme VARCHAR(50) NOT NULL DEFAULT 'default'`);
  } catch (err) {
    if (err.code !== 'ER_DUP_FIELDNAME') throw err;
  }
}

function projectsTableDdl(dialect) {
  if (dialect === 'sqlite3') {
    return [
      `CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        status TEXT NOT NULL DEFAULT 'active',
        created_by INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      )`,
      `CREATE TABLE IF NOT EXISTS project_members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        role TEXT NOT NULL DEFAULT 'member',
        permission TEXT NOT NULL DEFAULT 'view',
        joined_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(project_id, user_id),
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS project_join_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        message TEXT DEFAULT '',
        status TEXT NOT NULL DEFAULT 'pending',
        reviewed_by INTEGER,
        reviewed_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
      )`,
    ];
  }
  if (dialect === 'postgresql') {
    return [
      `CREATE TABLE IF NOT EXISTS projects (
        id SERIAL PRIMARY KEY,
        code VARCHAR(100) UNIQUE NOT NULL,
        name VARCHAR(300) NOT NULL,
        description TEXT DEFAULT '',
        status VARCHAR(50) NOT NULL DEFAULT 'active',
        created_by INT REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS project_members (
        id SERIAL PRIMARY KEY,
        project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role VARCHAR(50) NOT NULL DEFAULT 'member',
        permission VARCHAR(50) NOT NULL DEFAULT 'view',
        joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(project_id, user_id)
      )`,
      `CREATE TABLE IF NOT EXISTS project_join_requests (
        id SERIAL PRIMARY KEY,
        project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        message TEXT DEFAULT '',
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        reviewed_by INT REFERENCES users(id) ON DELETE SET NULL,
        reviewed_at TIMESTAMP NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    ];
  }
  return [
    `CREATE TABLE IF NOT EXISTS projects (
      id INT AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(100) UNIQUE NOT NULL,
      name VARCHAR(300) NOT NULL,
      description TEXT,
      status VARCHAR(50) NOT NULL DEFAULT 'active',
      created_by INT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS project_members (
      id INT AUTO_INCREMENT PRIMARY KEY,
      project_id INT NOT NULL,
      user_id INT NOT NULL,
      role VARCHAR(50) NOT NULL DEFAULT 'member',
      permission VARCHAR(50) NOT NULL DEFAULT 'view',
      joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_project_user (project_id, user_id),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS project_join_requests (
      id INT AUTO_INCREMENT PRIMARY KEY,
      project_id INT NOT NULL,
      user_id INT NOT NULL,
      message TEXT,
      status VARCHAR(50) NOT NULL DEFAULT 'pending',
      reviewed_by INT NULL,
      reviewed_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  ];
}

async function addColumnIfMissing(adapter, dialect, table, column, ddl) {
  if (dialect === 'sqlite3') {
    try {
      await adapter.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
    } catch (err) {
      if (!String(err.message).includes('duplicate column')) throw err;
    }
    return;
  }
  if (dialect === 'postgresql') {
    try {
      await adapter.execute(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${ddl}`);
    } catch { /* ignore */ }
    return;
  }
  try {
    await adapter.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  } catch (err) {
    if (err.code !== 'ER_DUP_FIELDNAME') throw err;
  }
}

export async function migrateProjectsSchema(adapter, dialect) {
  const d = dialect === 'mysql' ? 'mysql' : dialect;
  for (const ddl of projectsTableDdl(d)) {
    await adapter.execute(ddl);
  }

  const projectIdType = d === 'sqlite3' ? 'INTEGER NOT NULL DEFAULT 1' : 'INT NOT NULL DEFAULT 1';
  await addColumnIfMissing(adapter, d, 'requirements', 'project_id', projectIdType);
  await addColumnIfMissing(adapter, d, 'test_cases', 'project_id', projectIdType);

  let defaultProject = await adapter.queryOne('SELECT id FROM projects ORDER BY id LIMIT 1');
  if (!defaultProject) {
    const admin = await adapter.queryOne('SELECT id FROM users WHERE username = ?', ['admin']);
    const defaultId = await adapter.insert(
      'INSERT INTO projects (code, name, description, status, created_by) VALUES (?, ?, ?, ?, ?)',
      ['DEFAULT', 'Default Project', 'Migrated legacy data', 'active', admin?.id ?? null]
    );
    defaultProject = { id: defaultId };
    if (admin?.id) {
      await adapter.execute(
        'INSERT INTO project_members (project_id, user_id, role, permission) VALUES (?, ?, ?, ?)',
        [defaultId, admin.id, 'project_admin', 'edit']
      ).catch(() => {});
    }
  }

  const pid = defaultProject.id;
  await adapter.execute('UPDATE requirements SET project_id = ? WHERE project_id IS NULL OR project_id = 0', [pid]).catch(() => {});
  await adapter.execute(
    `UPDATE test_cases SET project_id = (
      SELECT project_id FROM requirements r WHERE r.id = test_cases.requirement_id
    ) WHERE project_id IS NULL OR project_id = 0`
  ).catch(() => {});
}

export async function migrateProjectHistoryTable(adapter, dialect) {
  const ddl = dialect === 'sqlite3'
    ? `CREATE TABLE IF NOT EXISTS project_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      project_code TEXT NOT NULL,
      action TEXT NOT NULL,
      changes TEXT,
      note TEXT,
      changed_by INTEGER,
      changed_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL
    )`
    : dialect === 'postgresql'
      ? `CREATE TABLE IF NOT EXISTS project_history (
        id SERIAL PRIMARY KEY,
        project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        project_code VARCHAR(100) NOT NULL,
        action VARCHAR(40) NOT NULL,
        changes TEXT,
        note VARCHAR(255) NULL,
        changed_by INT REFERENCES users(id) ON DELETE SET NULL,
        changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`
      : `CREATE TABLE IF NOT EXISTS project_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        project_id INT NOT NULL,
        project_code VARCHAR(100) NOT NULL,
        action VARCHAR(40) NOT NULL,
        changes TEXT,
        note VARCHAR(255) NULL,
        changed_by INT NULL,
        changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`;
  await adapter.execute(ddl);
}
