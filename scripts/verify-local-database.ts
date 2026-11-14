import EmbeddedPostgres from 'embedded-postgres';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Pool } from 'pg';
import { migrate } from '../packages/db/src/migrate';
import { PostgresRepository } from '../packages/db/src/postgres';

async function main() {
  const directory = await mkdtemp(join(tmpdir(), 'king-david-db-check-'));
  const cluster = new EmbeddedPostgres({ databaseDir: directory, user: 'postgres', password: 'local-test-only', port: 55441, persistent: false, autoRehydrateSymlinks: true });
  let owner: Pool | undefined; let runtime: Pool | undefined;
  try {
    await cluster.initialise(); await cluster.start(); await cluster.createDatabase('king_david_check');
    owner = new Pool({ connectionString: 'postgresql://postgres:local-test-only@127.0.0.1:55441/king_david_check', max: 1 });
    console.log(await migrate(owner));
    await owner.query("CREATE ROLE kd_check LOGIN PASSWORD 'local-test-only' NOSUPERUSER NOBYPASSRLS; GRANT king_david_runtime TO kd_check;");
    runtime = new Pool({ connectionString: 'postgresql://kd_check:local-test-only@127.0.0.1:55441/king_david_check', max: 1 });
    await new PostgresRepository(runtime).assertSafeRole();
    const r = await runtime.query('SELECT count(*)::int AS n FROM event_inquiries');
    if (r.rows[0].n !== 0) throw new Error('Unscoped runtime read was not empty.');
    console.log('PASS: disposable PostgreSQL migration + runtime safety check. No external database was changed.');
  } finally {
    await runtime?.end(); await owner?.end(); await cluster.stop(); await rm(directory, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
