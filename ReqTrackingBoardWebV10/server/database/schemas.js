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
