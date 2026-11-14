import { Queue, Worker, type JobsOptions } from 'bullmq';
import IORedis from 'ioredis';
import { Pool } from 'pg';
import { parseServerConfig } from '@king-david/config';
import { PostgresRepository } from '@king-david/db';
import type { Actor } from '@king-david/contracts';

const config = parseServerConfig(process.env);
const pool = new Pool({ connectionString: config.DATABASE_URL, max: 3, statement_timeout: 15000 });
const repository = new PostgresRepository(pool);
const connection = new IORedis(config.REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: true });
const queue = new Queue('king-david-operations', { connection });
const jobOptions: JobsOptions = { attempts: 5, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: { age: 86400, count: 1000 }, removeOnFail: { age: 7*86400 } };
const scope = { tenantId: process.env.PUBLIC_TENANT_ID || '', propertyId: process.env.PUBLIC_PROPERTY_ID || '' };
const actor: Actor = { id: 'operations-worker', name: 'Operations worker', tenantId: scope.tenantId, propertyIds: [scope.propertyId], role: 'manager' };
const worker = new Worker('king-david-operations', async job => {
  if (job.name === 'inventory.sweep') {
    const state = await repository.sweep(actor,scope);
    // Queue only DB-backed outbox records. Redis is not the source of delivery truth.
    for (const message of state.messages.filter(m => m.status === 'queued')) await queue.add('message.delivery', { messageId: message.id }, { ...jobOptions, jobId: `delivery-${message.id}` });
    return { swept: true };
  }
  if (job.name === 'message.delivery') {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.property_ids',$2,true)",[scope.tenantId,scope.propertyId]);
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`${scope.tenantId}:${scope.propertyId}`]);
      const result = await client.query('SELECT data FROM message_deliveries WHERE id=$1 FOR UPDATE',[job.data.messageId]);
      const message = result.rows[0]?.data;
      if (!message || message.status !== 'queued') { await client.query('COMMIT'); return { skipped: true }; }
      const enquiryResult = await client.query('SELECT data FROM event_inquiries WHERE id=$1',[message.enquiryId]);
      const enquiry = enquiryResult.rows[0]?.data;
      const status = enquiry?.consent ? 'failed' : 'suppressed_no_consent';
      const error = enquiry?.consent ? 'No delivery provider configured. Explicit failure; not sent.' : 'No contact consent recorded.';
      const next = { ...message,status,error,consentAt:enquiry?.consent ? enquiry.createdAt : undefined };
      await client.query('UPDATE message_deliveries SET data=$1 WHERE id=$2',[next,message.id]);
      const auditId=crypto.randomUUID();
      await client.query('INSERT INTO audit_entries(id,tenant_id,property_id,data) VALUES($1,$2,$3,$4)',[auditId,scope.tenantId,scope.propertyId,{id:auditId,tenantId:scope.tenantId,propertyId:scope.propertyId,actorId:actor.id,actorName:actor.name,action:'message.delivery',entityType:'messages',entityId:message.id,before:{status:message.status},after:{status,error},reason:'Worker checked consent and provider availability; no success fabricated',at:new Date().toISOString()}]);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
    return { deliveryProviderConfigured: false };
  }
  throw new Error(`Unknown job ${job.name}`);
}, { connection, concurrency: 2 });
worker.on('failed',(job,error)=>console.error(JSON.stringify({event:'job.failed',jobId:job?.id,name:job?.name,attempt:job?.attemptsMade,message:error.message})));
worker.on('completed',job=>console.log(JSON.stringify({event:'job.completed',jobId:job.id,name:job.name})));
connection.on('error',()=>console.error(JSON.stringify({event:'redis.error',message:'Queue connection unavailable; PostgreSQL remains authoritative.'})));
async function start() {
  if (!scope.tenantId || !scope.propertyId) throw new Error('PUBLIC_TENANT_ID and PUBLIC_PROPERTY_ID are required.');
  await repository.assertSafeRole();
  await queue.add('inventory.sweep',{}, { ...jobOptions, repeat: { pattern: '*/1 * * * *' }, jobId:'inventory-sweep-minute' });
  console.log('King David worker ready: inventory expiry/cutoff + consent-aware outbox. No delivery provider configured.');
}
async function shutdown() { await worker.close(); await queue.close(); await connection.quit(); await pool.end(); process.exit(0); }
process.on('SIGTERM',shutdown); process.on('SIGINT',shutdown);
start().catch(error=>{console.error('Worker startup refused:',error.message);process.exit(1);});
