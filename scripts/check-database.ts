import { Pool } from 'pg';
import { migrate } from '../packages/db/src/migrate';
import { PostgresRepository } from '../packages/db/src/postgres';

async function main() {
  const runtimeUrl = process.env.DATABASE_URL;
  if (!runtimeUrl) throw new Error('DATABASE_URL (non-owner runtime role) is required.');
  const migrationUrl = process.env.MIGRATION_DATABASE_URL;
  if (migrationUrl) {
    const owner = new Pool({ connectionString: migrationUrl, max: 1 });
    try { console.log(await migrate(owner)); } finally { await owner.end(); }
  }
  const runtime = new Pool({ connectionString: runtimeUrl, max: 1 });
  try {
    const repo = new PostgresRepository(runtime);
    await repo.assertSafeRole();
    const migration = await runtime.query("SELECT version FROM schema_migrations WHERE version='001_domain'");
    if (!migration.rowCount) throw new Error('001_domain is not applied. Run db:migrate with the owner connection first.');
    const rls = await runtime.query(`SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('event_inquiries','inventory_allocations','payment_requests','quote_versions','audit_entries') AND c.relrowsecurity AND c.relforcerowsecurity`);
    if (rls.rows[0].n !== 5) throw new Error('Critical tables must ENABLE and FORCE row-level security.');
    const context = await runtime.query('SELECT count(*)::int AS n FROM event_inquiries');
    if (context.rows[0].n !== 0) throw new Error('A connection without tenant context must see zero enquiries.');
    console.log('PASS: migration present, critical RLS forced, runtime role least-privileged, missing context fails closed.');
  } finally { await runtime.end(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
