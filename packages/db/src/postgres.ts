import { Pool, type PoolClient } from 'pg';
import type { Actor, Command, DomainState, Owned, Scope, Allocation } from '@king-david/contracts';
import { assertScope } from '@king-david/policy';
import { canonical, DomainError, execute, find, hash, type ExecutionResult } from './engine';
import type { Repository } from './repository';

export const TABLES: Record<keyof DomainState, string> = {
  properties: 'properties', roomTypes: 'room_types', spaces: 'function_spaces', resources: 'resources', enquiries: 'event_inquiries',
  quotes: 'quote_versions', events: 'events', subEvents: 'sub_events', allocations: 'inventory_allocations', blocks: 'room_blocks',
  rooming: 'rooming_list_entries', guests: 'guest_profiles', companies: 'company_profiles', products: 'products', packages: 'packages',
  payments: 'payment_requests', webhooks: 'webhook_receipts', refunds: 'refunds', folios: 'folios', folioLines: 'folio_lines',
  invoices: 'invoices', sheets: 'function_sheets', tasks: 'tasks', messages: 'message_deliveries', audit: 'audit_entries', content: 'content_fields', receipts: 'idempotency_receipts',
};
const keys = Object.keys(TABLES) as (keyof DomainState)[];
export async function setDatabaseScope(client: PoolClient, actor: Actor, scope: Scope) {
  assertScope(actor, scope);
  await client.query("SELECT set_config('app.tenant_id', $1, true), set_config('app.property_ids', $2, true)", [scope.tenantId, scope.propertyId]);
}
async function loadState(client: PoolClient): Promise<DomainState> {
  const state = {} as DomainState;
  for (const key of keys) {
    const result = await client.query(`SELECT data FROM ${TABLES[key]} ORDER BY sequence_number`);
    state[key] = result.rows.map(r => r.data) as never;
  }
  return state;
}
export async function saveChanges(client: PoolClient, before: DomainState, after: DomainState, scope: Scope) {
  for (const key of keys) {
    const table = TABLES[key]; const old = before[key] as Owned[]; const oldById = new Map(old.map(row => [row.id, row]));
    for (const row of after[key] as Owned[]) {
      if (row.tenantId !== scope.tenantId || row.propertyId !== scope.propertyId) throw new DomainError('Cross-scope write refused.', 403);
      const previous = oldById.get(row.id);
      if (previous && canonical(previous) === canonical(row)) continue;
      if (key === 'audit') {
        if (previous) throw new DomainError('Audit records are append-only.', 403);
        await client.query(`INSERT INTO ${table} (id, tenant_id, property_id, data) VALUES ($1,$2,$3,$4)`, [row.id, row.tenantId, row.propertyId, row]);
      } else if (key === 'allocations') {
        const allocation = row as Allocation;
        await client.query(`INSERT INTO inventory_allocations (id,tenant_id,property_id,data,resource_kind,resource_id,request_id,during,quantity,state,expires_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,tstzrange($8::timestamptz,$9::timestamptz,'[)'),$10,$11,$12)
          ON CONFLICT (tenant_id,property_id,id) DO UPDATE SET data=EXCLUDED.data,resource_kind=EXCLUDED.resource_kind,resource_id=EXCLUDED.resource_id,request_id=EXCLUDED.request_id,during=EXCLUDED.during,quantity=EXCLUDED.quantity,state=EXCLUDED.state,expires_at=EXCLUDED.expires_at`,
        [allocation.id,allocation.tenantId,allocation.propertyId,allocation,allocation.kind,allocation.resourceId,allocation.requestId,allocation.start,allocation.end,allocation.quantity,allocation.state,allocation.expiresAt || null]);
      } else {
        await client.query(`INSERT INTO ${table} (id,tenant_id,property_id,data) VALUES ($1,$2,$3,$4) ON CONFLICT (tenant_id,property_id,id) DO UPDATE SET data=EXCLUDED.data`, [row.id,row.tenantId,row.propertyId,row]);
      }
    }
  }
}
/** PostgreSQL is authoritative. Redis/locks never replace this transaction.
 * Coarse property write serialization is deliberate for a single-property guesthouse.
 * Ledger constraints remain a second line of defence against non-adapter writes.
 */
export class PostgresRepository implements Repository {
  constructor(public readonly pool: Pool) {}
  async assertSafeRole() {
    const r = await this.pool.query(`SELECT current_user AS name, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole,
      EXISTS (SELECT 1 FROM pg_roles r WHERE pg_has_role(current_user, r.oid, 'MEMBER') AND (r.rolsuper OR r.rolbypassrls OR EXISTS (
        SELECT 1 FROM pg_class c WHERE c.relowner=r.oid AND c.relnamespace='public'::regnamespace AND c.relkind IN ('r','p')
      ))) AS privileged_membership
      FROM pg_roles WHERE rolname=current_user`);
    const row = r.rows[0];
    if (!row || row.rolsuper || row.rolbypassrls || row.rolcreatedb || row.rolcreaterole || row.privileged_membership) throw new Error('Refusing runtime database role: use a non-owner, NOSUPERUSER, NOBYPASSRLS login without privileged role membership.');
  }
  private async transaction<T>(actor: Actor, scope: Scope, work: (client: PoolClient) => Promise<T>, write = false): Promise<T> {
    assertScope(actor, scope); const client = await this.pool.connect();
    try {
      await client.query(write ? 'BEGIN ISOLATION LEVEL READ COMMITTED' : 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      await setDatabaseScope(client, actor, scope);
      if (write) await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`${scope.tenantId}:${scope.propertyId}`]);
      const result = await work(client); await client.query('COMMIT'); return result;
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
  async read(actor: Actor, scope: Scope) { return this.transaction(actor, scope, loadState); }
  async transact(actor: Actor, scope: Scope, command: Command, options: { portalAccess?: { hash: string; expiresAt: string } } = {}): Promise<ExecutionResult> {
    return this.transaction(actor, scope, async client => {
      const before = await loadState(client);
      const result = execute(before, actor, scope, command, { demo: false });
      if (options.portalAccess && command.name === 'enquiry.create' && !result.replayed) {
        const e = find(result.state.enquiries, result.resultId, scope);
        e.portalTokenHash = options.portalAccess.hash; e.portalExpiresAt = options.portalAccess.expiresAt;
        await client.query('INSERT INTO portal_sessions (token_hash,tenant_id,property_id,enquiry_id,expires_at) VALUES ($1,$2,$3,$4,$5)', [options.portalAccess.hash,scope.tenantId,scope.propertyId,e.id,options.portalAccess.expiresAt]);
      }
      await saveChanges(client, before, result.state, scope);
      return result;
    }, true);
  }
  async resolvePortal(tokenHash: string) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN READ ONLY');
      await client.query("SELECT set_config('app.portal_token_hash',$1,true)", [tokenHash]);
      const result = await client.query('SELECT tenant_id,property_id,enquiry_id,expires_at FROM portal_sessions WHERE token_hash=$1 AND expires_at>statement_timestamp() AND revoked_at IS NULL', [tokenHash]);
      await client.query('COMMIT'); return result.rows[0] as { tenant_id: string; property_id: string; enquiry_id: string; expires_at: Date } | undefined;
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
  async verifiedPayment(actor: Actor, scope: Scope, event: Parameters<typeof import('./engine')['receiveVerifiedEvent']>[2]) {
    return this.transaction(actor, scope, async client => {
      const before = await loadState(client); const after = structuredClone(before);
      const { receiveVerifiedEvent } = await import('./engine');
      const result = receiveVerifiedEvent(after, scope, event);
      const payment = find(after.payments, result.paymentId, scope);
      after.audit.push({ ...scope, id: crypto.randomUUID(), actorId: `provider:${event.provider}`, actorName: `${event.provider} verified adapter`, action: 'payment.webhook', entityType: 'payments', entityId: payment.id, before: { status: before.payments.find(p => p.id === payment.id)?.status }, after: { status: payment.status, eventId: event.id, duplicate: result.duplicate }, reason: 'Authenticated webhook and authoritative provider verification', at: new Date().toISOString() });
      await saveChanges(client, before, after, scope); return result;
    }, true);
  }
  async attachCheckout(actor: Actor, scope: Scope, id: string, checkoutUrl: string, providerReference?: string) {
    return this.transaction(actor, scope, async client => {
      const before = await loadState(client); const after = structuredClone(before); const p = find(after.payments,id,scope);
      if (!['created','pending_customer_authorization','provider_timeout'].includes(p.status)) throw new DomainError('Checkout cannot be attached after financial confirmation.');
      const url = new URL(checkoutUrl); if (url.protocol !== 'https:') throw new DomainError('Hosted checkout must use HTTPS.',400);
      p.checkoutUrl = checkoutUrl; p.providerReference = providerReference || p.providerReference;
      p.history.push({ status: p.status, at: new Date().toISOString(), reason: 'Hosted checkout initialized with idempotent internal reference' });
      after.audit.push({ ...scope, id: crypto.randomUUID(), actorId: actor.id, actorName: actor.name, action: 'payment.checkout', entityType: 'payments', entityId: id, before: { checkout: false }, after: { checkout: true }, reason: 'Provider initialization completed; no payment confirmed', at: new Date().toISOString() });
      await saveChanges(client,before,after,scope);
    }, true);
  }
  async sweep(actor: Actor, scope: Scope) {
    return this.transaction(actor, scope, async client => {
      const before = await loadState(client); const after = structuredClone(before); const { expireInventory } = await import('./engine'); expireInventory(after,scope,new Date().toISOString());
      if (canonical(before) !== canonical(after)) after.audit.push({ ...scope,id:crypto.randomUUID(),actorId:actor.id,actorName:actor.name,action:'inventory.sweep',entityType:'properties',entityId:scope.propertyId,before:null,after:{swept:true},reason:'Scheduled expiry/cutoff reconciliation',at:new Date().toISOString() });
      await saveChanges(client,before,after,scope); return after;
    }, true);
  }
}
