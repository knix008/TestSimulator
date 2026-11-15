export const ENGINES = [
  { id: 'sqlite', port: '', ko: 'SQLite', en: 'SQLite' },
  { id: 'mysql', port: 3306, ko: 'MySQL', en: 'MySQL' },
  { id: 'mariadb', port: 3306, ko: 'MariaDB', en: 'MariaDB' },
  { id: 'mssql', port: 1433, ko: 'SQL Server', en: 'SQL Server' },
  { id: 'postgres', port: 5432, ko: 'PostgreSQL', en: 'PostgreSQL' },
];

export const engineById = (id) => ENGINES.find((engine) => engine.id === id) || ENGINES[0];
