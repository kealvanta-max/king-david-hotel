import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import EmbeddedPostgres from 'embedded-postgres';
import { Pool } from 'pg';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSeed, DEMO_SCOPE, DomainError, PostgresRepository, saveChanges, hash } from '@king-david/db';
import { migrate } from '../packages/db/src/migrate';
import type { Actor, Command, DomainState } from '@king-david/contracts';

let cluster: EmbeddedPostgres; let directory: string; let owner: Pool; let runtime: Pool; let repo: PostgresRepository;
const scope=DEMO_SCOPE;
const manager:Actor={id:'pg-manager',name:'PG manager',tenantId:scope.tenantId,propertyIds:[scope.propertyId],role:'manager',mfa:true};
const other:Actor={...manager,tenantId:'00000000-0000-4000-8000-000000000099'};
let seed:DomainState;let sequence=0;let shuttingDown=false;const poolErrors:unknown[]=[];
const command=(name:Command['name'],payload:Record<string,unknown>):Command=>({name,payload,reason:'Real PostgreSQL acceptance test',key:`pg-test-${++sequence}`});
const empty=():DomainState=>Object.fromEntries(Object.keys(createSeed()).map(k=>[k,[]])) as unknown as DomainState;
beforeAll(async()=>{
  directory=await mkdtemp(join(tmpdir(),'king-david-pg-'));
  cluster=new EmbeddedPostgres({databaseDir:directory,user:'postgres',password:'test-only',port:55439,persistent:false,autoRehydrateSymlinks:true});
  await cluster.initialise();await cluster.start();await cluster.createDatabase('king_david_test');
  owner=new Pool({connectionString:'postgresql://postgres:test-only@127.0.0.1:55439/king_david_test',max:8});
  owner.on('error',e=>{if(!shuttingDown)poolErrors.push(e);});
  await migrate(owner);
  await owner.query("CREATE ROLE kd_test LOGIN PASSWORD 'test-only' NOSUPERUSER NOBYPASSRLS; GRANT king_david_runtime TO kd_test;");
  runtime=new Pool({connectionString:'postgresql://kd_test:test-only@127.0.0.1:55439/king_david_test',max:8});runtime.on('error',e=>{if(!shuttingDown)poolErrors.push(e);});repo=new PostgresRepository(runtime);
  seed=createSeed();seed.allocations=[];seed.events=[];seed.sheets=[];seed.subEvents=[];seed.blocks=[];seed.rooming=[];seed.folios=[];seed.folioLines=[];seed.payments=[];seed.webhooks=[];seed.guests=[];seed.receipts=[];seed.audit=[];seed.tasks=[];seed.roomTypes[0].total=1;
  const client=await owner.connect();try{await client.query('BEGIN');await client.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.property_ids',$2,true)",[scope.tenantId,scope.propertyId]);await saveChanges(client,empty(),seed,scope);await client.query('COMMIT');}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
},60000);
afterAll(async()=>{shuttingDown=true;await runtime?.end();await owner?.end();await cluster?.stop();if(directory)await rm(directory,{recursive:true,force:true});expect(poolErrors).toEqual([]);},30000);

describe('real PostgreSQL controls',()=>{
  it('runtime is non-owner, nonsuperuser and NOBYPASSRLS',async()=>{await expect(repo.assertSafeRole()).resolves.toBeUndefined();const r=await runtime.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user');expect(r.rows[0]).toEqual({rolsuper:false,rolbypassrls:false});});
  it('missing tenant context fails closed even for a known record',async()=>{const r=await runtime.query('SELECT count(*)::int AS n FROM room_types');expect(r.rows[0].n).toBe(0);});
  it('cross-tenant actor cannot read or write',async()=>{await expect(repo.read(other,scope)).rejects.toThrow();await expect(repo.transact(other,scope,command('task.create',{title:'Unauthorized',owner:'Nobody',dueAt:new Date().toISOString()}))).rejects.toThrow();});
  it('RLS rejects a cross-property insert under a scoped connection',async()=>{const client=await runtime.connect();try{await client.query('BEGIN');await client.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.property_ids',$2,true)",[scope.tenantId,scope.propertyId]);await expect(client.query('INSERT INTO tasks(id,tenant_id,property_id,data) VALUES($1,$2,$3,$4)',[crypto.randomUUID(),scope.tenantId,'00000000-0000-4000-8000-000000000099',{}])).rejects.toThrow(/row-level security/);await client.query('ROLLBACK');}finally{client.release();}});
  it('two independent API transactions cannot overbook the last room',async()=>{
    const input={kind:'stay',eventType:'Stay',name:'Concurrent Guest',email:'concurrent@example.invalid',phone:'+233000000000',start:'2027-01-10',end:'2027-01-12',guests:2,rooms:1,roomTypeId:seed.roomTypes[0].id,resourceIds:[],notes:'',consent:true};
    const a=await repo.transact(manager,scope,command('enquiry.create',input));const b=await repo.transact(manager,scope,command('enquiry.create',input));
    const results=await Promise.allSettled([repo.transact(manager,scope,command('hold.create',{enquiryId:a.resultId,minutes:30})),repo.transact(manager,scope,command('hold.create',{enquiryId:b.resultId,minutes:30}))]);
    expect(results.filter(x=>x.status==='fulfilled')).toHaveLength(1);expect(results.filter(x=>x.status==='rejected')).toHaveLength(1);
    const client=await runtime.connect();try{await client.query('BEGIN READ ONLY');await client.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.property_ids',$2,true)",[scope.tenantId,scope.propertyId]);const r=await client.query("SELECT sum(quantity)::int AS n FROM inventory_allocations WHERE state='held'");expect(r.rows[0].n).toBe(1);await client.query('COMMIT');}finally{client.release();}
  });
  it('idempotency survives separate requests and changed-payload reuse fails',async()=>{const c=command('task.create',{title:'Idempotent task',owner:'Manager',dueAt:new Date().toISOString()});const a=await repo.transact(manager,scope,c);const b=await repo.transact(manager,scope,c);expect(a.resultId).toBe(b.resultId);expect(b.replayed).toBe(true);await expect(repo.transact(manager,scope,{...c,reason:'A changed request reason'})).rejects.toThrow(/different request/);});
  it('database exclusion rejects direct overlapping space allocation',async()=>{
    const make=(id:string,start:string,end:string)=>[id,scope.tenantId,scope.propertyId,{id,tenantId:scope.tenantId,propertyId:scope.propertyId,requestId:id,kind:'space',resourceId:seed.spaces[0].id,start,end,quantity:1,state:'confirmed'},'space',seed.spaces[0].id,id,start,end,1,'confirmed',null];
    const sql='INSERT INTO inventory_allocations(id,tenant_id,property_id,data,resource_kind,resource_id,request_id,during,quantity,state,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,tstzrange($8::timestamptz,$9::timestamptz),$10,$11,$12)';
    const client=await runtime.connect();try{await client.query('BEGIN');await client.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.property_ids',$2,true)",[scope.tenantId,scope.propertyId]);await client.query(sql,make(crypto.randomUUID(),'2027-02-01T10:00:00Z','2027-02-01T14:00:00Z'));await expect(client.query(sql,make(crypto.randomUUID(),'2027-02-01T12:00:00Z','2027-02-01T16:00:00Z'))).rejects.toThrow(/conflicting key value/);await client.query('ROLLBACK');}finally{client.release();}
  });
  it('accepted quote trigger blocks commercial changes but permits deposit fulfilment',async()=>{
    const client=await runtime.connect();const q=seed.quotes[0];
    try{await client.query('BEGIN');await client.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.property_ids',$2,true)",[scope.tenantId,scope.propertyId]);const e=seed.enquiries[0];const id=crypto.randomUUID();const accepted={...q,id,version:99,enquiryId:q.enquiryId,status:'accepted',acceptedBy:'Test',acceptedAt:new Date().toISOString(),contentHash:'test'};await client.query('INSERT INTO quote_versions(id,tenant_id,property_id,data) VALUES($1,$2,$3,$4)',[id,scope.tenantId,scope.propertyId,accepted]);await expect(client.query('UPDATE quote_versions SET data=jsonb_set(data,\'{totalPesewas}\',\'1\') WHERE id=$1',[id])).rejects.toThrow(/immutable/);await client.query('ROLLBACK');await client.query('BEGIN');await client.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.property_ids',$2,true)",[scope.tenantId,scope.propertyId]);await client.query('INSERT INTO quote_versions(id,tenant_id,property_id,data) VALUES($1,$2,$3,$4)',[id,scope.tenantId,scope.propertyId,accepted]);const fulfilled={...accepted,deposits:accepted.deposits.map(d=>({...d,state:'received',paymentRequestId:crypto.randomUUID()}))};await client.query('UPDATE quote_versions SET data=$1 WHERE id=$2',[fulfilled,id]);await expect(client.query("UPDATE quote_versions SET data=jsonb_set(data,'{deposits,0,amountPesewas}','1') WHERE id=$1",[id])).rejects.toThrow(/immutable/);await client.query('ROLLBACK');}finally{client.release();}
  });
  it('runtime cannot update or delete audit entries',async()=>{const client=await runtime.connect();try{await client.query('BEGIN');await client.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.property_ids',$2,true)",[scope.tenantId,scope.propertyId]);await expect(client.query('UPDATE audit_entries SET data=data')).rejects.toThrow();await client.query('ROLLBACK');}finally{client.release();}});
  it('portal capability resolves only its exact unexpired hash',async()=>{const token='a'.repeat(43);const enquiry=seed.enquiries[0];const client=await owner.connect();try{await client.query('BEGIN');await client.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.property_ids',$2,true)",[scope.tenantId,scope.propertyId]);await client.query("INSERT INTO portal_sessions(token_hash,tenant_id,property_id,enquiry_id,expires_at) VALUES($1,$2,$3,$4,now()+interval '1 hour')",[hash(token),scope.tenantId,scope.propertyId,enquiry.id]);await client.query('COMMIT');}finally{client.release();}const found=await repo.resolvePortal(hash(token));expect(found?.enquiry_id).toBe(enquiry.id);expect(await repo.resolvePortal(hash('different'))).toBeUndefined();});
  it('runtime owner/superuser safety check refuses migration credentials',async()=>{await expect(new PostgresRepository(owner).assertSafeRole()).rejects.toThrow(/Refusing runtime/);});
});
