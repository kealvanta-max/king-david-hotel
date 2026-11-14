import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Pool } from 'pg';

export async function migrate(pool: Pool) {
  const sql = await readFile(resolve(process.cwd(), 'packages/db/migrations/001_domain.sql'), 'utf8');
  const exists = await pool.query("SELECT to_regclass('public.schema_migrations') AS name");
  if (exists.rows[0].name) {
    const applied = await pool.query("SELECT version FROM schema_migrations WHERE version='001_domain'");
    if (applied.rowCount) return 'already applied';
  }
  await pool.query(sql); return '001_domain applied';
}
if (process.argv[1]?.endsWith('migrate.ts')) {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required. Use a migration-owner connection, not the runtime role.');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  migrate(pool).then(console.log).catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => pool.end());
}
