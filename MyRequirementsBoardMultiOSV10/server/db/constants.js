export const DB_PROVIDERS = ['mariadb', 'mysql', 'postgresql', 'mssql'];

export const DEFAULT_PORTS = {
  mariadb: 3306,
  mysql: 3306,
  postgresql: 5432,
  mssql: 1433,
};

export const DEFAULT_DB_CONFIG = {
  enabled: false,
  provider: 'mariadb',
  server: 'localhost',
  port: DEFAULT_PORTS.mariadb,
  database: '',
  username: '',
  password: '',
};

export function defaultPortFor(provider) {
  return DEFAULT_PORTS[provider] ?? DEFAULT_PORTS.mariadb;
}

export function sanitizeConfigForClient(config) {
  if (!config) return null;
  return {
    enabled: Boolean(config.enabled),
    provider: config.provider,
    server: config.server,
    port: config.port,
    database: config.database,
    username: config.username,
    hasPassword: Boolean(config.password),
  };
}
