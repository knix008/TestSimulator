// Microsoft SQL Server through `mssql` (tedious).
import { Db } from '../base.js';

/**
 * @param {object} options { host, port, database, user, password, ssl?, options? }
 * @returns {Promise<Db>}
 */
export async function openMssql(options = {}) {
  const sql = (await import('mssql')).default;
  const pool = new sql.ConnectionPool({
    server: options.host || 'localhost', port: Number(options.port) || 1433, database: options.database,
    user: options.user, password: options.password,
    pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
    options: { encrypt: !!options.ssl, trustServerCertificate: true, ...(options.options || {}) },
  });
  await pool.connect();

  /** Bind @p1..@pn by JS type (mssql infers Int/BigInt/Float/NVarChar/VarBinary). */
  const exec = async (target, text, params) => {
    const req = target.request();
    params.forEach((v, i) => {
      if (v === null) req.input('p' + (i + 1), sql.NVarChar, null);
      else if (Buffer.isBuffer(v)) req.input('p' + (i + 1), sql.VarBinary(sql.MAX), v);
      else if (typeof v === 'number' && Number.isInteger(v)) req.input('p' + (i + 1), Math.abs(v) > 2147483647 ? sql.BigInt : sql.Int, v);
      else if (typeof v === 'number') req.input('p' + (i + 1), sql.Float, v);
      else req.input('p' + (i + 1), sql.NVarChar(sql.MAX), String(v));
    });
    const r = await req.query(text);
    const rs = r.recordset || [];
    // tedious returns BIGINT as string
    const cols = rs.columns ? Object.values(rs.columns).filter((c) => c.type === sql.BigInt || c.type?.declaration === 'bigint').map((c) => c.name) : [];
    if (cols.length) for (const row of rs) for (const c of cols) if (row[c] != null) row[c] = Number(row[c]);
    return { rows: rs, changes: (r.rowsAffected || []).reduce((a, b) => a + b, 0) };
  };
  const driver = {
    exec: (text, params) => exec(pool, text, params),
    async begin() {
      const tx = new sql.Transaction(pool);
      await tx.begin();
      let open = true;
      return {
        exec: (text, params) => exec(tx, text, params),
        commit: async () => { if (open) { open = false; await tx.commit(); } },
        rollback: async () => { if (open) { open = false; await tx.rollback(); } },
      };
    },
    close: () => pool.close(),
  };
  return new Db('mssql', driver, { type: 'mssql', label: `SQL Server ${options.host || 'localhost'}/${options.database || ''}` });
}
