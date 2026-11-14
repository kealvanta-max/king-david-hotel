import 'reflect-metadata';
import { startTelemetry } from './instrumentation';
const telemetry = startTelemetry();
import { Module, Controller, Get, Post, Body, Headers, Param, Req, UnauthorizedException, ForbiddenException, BadRequestException, NotFoundException, HttpException, Injectable, type CanActivate, type ExecutionContext, UseGuards, SetMetadata } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ThrottlerModule, ThrottlerGuard, Throttle } from '@nestjs/throttler';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { Pool } from 'pg';
import { randomBytes } from 'node:crypto';
import { parseServerConfig } from '@king-david/config';
import { commandSchema, enquirySchema, type Actor, type Command, type Role, type Scope } from '@king-david/contracts';
import { PostgresRepository, hash, DomainError } from '@king-david/db';
import { paymentAdapter } from './payments';

const config = parseServerConfig(process.env);
const pool = new Pool({ connectionString: config.DATABASE_URL, max: 10, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000, statement_timeout: 15000 });
const repository = new PostgresRepository(pool);
const jwks = createRemoteJWKSet(new URL(config.AUTH_JWKS_URL), { timeoutDuration: 5000, cooldownDuration: 30000 });
const publicScope: Scope = { tenantId: process.env.PUBLIC_TENANT_ID || '', propertyId: process.env.PUBLIC_PROPERTY_ID || '' };
const publicActor: Actor = { id: 'public-enquiry', name: 'Public enquiry channel', tenantId: publicScope.tenantId, propertyIds: [publicScope.propertyId], role: 'readonly' };
const systemActor: Actor = { ...publicActor, id: 'payment-webhook', name: 'Verified payment adapter', role: 'finance' };
const staffCommands = new Set(['enquiry.status','hold.create','hold.release','quote.create','quote.submit','quote.approve','quote.accept','event.confirm','event.progress','event.cancel','block.create','block.release','rooming.save','rooming.checkin','payment.create','payment.reconcile','folio.create','folio.post','folio.route','folio.invoice','sheet.revise','sheet.acknowledge','task.create','task.status','content.save','message.queue']);

@Injectable() class StaffGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const authorization = req.headers.authorization;
    if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) throw new UnauthorizedException('Staff identity required.');
    try {
      const { payload } = await jwtVerify(authorization.slice(7), jwks, { issuer: config.AUTH_ISSUER, audience: config.AUTH_AUDIENCE, algorithms: ['RS256', 'ES256'] });
      if (!payload.sub || !payload.jti || !Array.isArray(payload.amr) || !payload.amr.includes('mfa')) throw new Error('MFA and revocable session identifier required.');
      if (typeof payload.auth_time !== 'number' || payload.auth_time < Date.now()/1000 - 8*3600) throw new Error('Refresh staff authentication.');
      const client = await pool.connect(); let identity;
      try {
        await client.query('BEGIN READ ONLY');
        await client.query("SELECT set_config('app.auth_subject',$1,true),set_config('app.auth_issuer',$2,true)", [payload.sub,config.AUTH_ISSUER]);
        const result = await client.query('SELECT tenant_id,property_ids,role,display_name,sessions_valid_after FROM staff_identities WHERE issuer=$1 AND subject=$2 AND NOT disabled', [config.AUTH_ISSUER,payload.sub]);
        identity = result.rows[0]; await client.query('COMMIT');
      } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
      if (!identity || payload.iat! * 1000 < new Date(identity.sessions_valid_after).getTime()) throw new Error('Staff session revoked or identity disabled.');
      req.actor = { id: payload.sub, name: identity.display_name, tenantId: identity.tenant_id, propertyIds: identity.property_ids, role: identity.role as Role, mfa: true } satisfies Actor;
      req.scope = { tenantId: identity.tenant_id, propertyId: req.headers['x-property-id'] };
      if (!req.actor.propertyIds.includes(req.scope.propertyId)) throw new Error('Property access denied.');
      return true;
    } catch { throw new UnauthorizedException('Valid MFA-authenticated, non-revoked staff session and property scope required.'); }
  }
}
function publicRequest(req: { headers: Record<string, string | string[] | undefined>; ip?: string }) {
  const origin = req.headers.origin;
  if (origin && origin !== config.WEB_ORIGIN) throw new ForbiddenException('Origin not allowed.');
  // The deployment must overwrite forwarded headers at its trusted edge.
  return req.ip || 'unknown';
}
@Controller('v1') class ApiController {
  @Get('health') health() { return { status: 'ok', service: 'king-david-api', mode: 'live', payments: config.PAYMENT_PROVIDER }; }
  @Get('public/property') async property(@Req() req: never) {
    publicRequest(req); const state = await repository.read(publicActor,publicScope);
    return { property: state.properties[0], roomTypes: state.roomTypes.filter(r => r.verified), spaces: state.spaces.filter(s => s.verified), content: state.content.filter(c => c.verified).map(c => ({ key:c.key,value:c.value })), paymentsEnabled: config.PAYMENT_PROVIDER !== 'disabled', notice: 'Only administrator-verified property facts are returned.' };
  }
  @Post('public/enquiries') @Throttle({ default: { limit: 5, ttl: 60000 } }) async createEnquiry(@Body() body: unknown, @Req() req: never, @Headers('idempotency-key') key?: string) {
    publicRequest(req); const input = enquirySchema.safeParse(body); if (!input.success) throw new BadRequestException(input.error.flatten());
    if (!key || key.length < 8 || key.length > 150) throw new BadRequestException('Idempotency-Key header required.');
    const token = randomBytes(32).toString('base64url'); const expiresAt = new Date(Date.now()+7*86400000).toISOString();
    const result = await repository.transact(publicActor,publicScope,{ name:'enquiry.create',payload:input.data,reason:'Public guest enquiry; no inventory consumed',key:`public:${key}` },{ portalAccess:{ hash:hash(token),expiresAt } });
    const enquiry = result.state.enquiries.find(e => e.id === result.resultId)!;
    return { reference: enquiry.reference, id: enquiry.id, status: enquiry.status, reserved: false, ...(result.replayed ? {} : { portalUrl: `${config.WEB_ORIGIN}/guest?token=${token}`, portalExpiresAt: expiresAt }) };
  }
  @Get('staff/snapshot') @UseGuards(StaffGuard) async snapshot(@Req() req: { actor: Actor; scope: Scope }) { return repository.read(req.actor,req.scope); }
  @Post('staff/commands') @UseGuards(StaffGuard) async command(@Body() body: unknown, @Req() req: { actor: Actor; scope: Scope }, @Headers('idempotency-key') key?: string) {
    const parsed = commandSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const command: Command = { ...parsed.data, key: key || parsed.data.key };
    if (!staffCommands.has(command.name)) throw new ForbiddenException('This command is not available to the staff console.');
    const result = await repository.transact(req.actor,req.scope,command);
    if (command.name === 'payment.create') {
      const payment = result.state.payments.find(p => p.id === result.resultId)!;
      if (payment.provider !== 'bank_transfer') {
        if (payment.provider !== config.PAYMENT_PROVIDER) throw new BadRequestException('Provider does not match the configured merchant account.');
        const enquiry = result.state.enquiries.find(e => e.id === payment.enquiryId)!;
        const adapter = paymentAdapter(payment.provider,config.PAYMENT_SECRET_KEY,config.PAYMENT_WEBHOOK_SECRET,`${config.WEB_ORIGIN}/guest`);
        try { const checkout = await adapter.initialize(payment,enquiry.email); await repository.attachCheckout(req.actor,req.scope,payment.id,checkout.checkoutUrl,checkout.providerReference); return { id:payment.id, status:'pending_checkout', checkoutUrl:checkout.checkoutUrl, paid:false }; }
        catch { throw new HttpException('Payment request saved, but provider initialization failed. Retry safely with the same reference; no payment is confirmed.',503); }
      }
    }
    return { id:result.resultId,replayed:result.replayed,paid:false,notice:'Read the authoritative snapshot for resulting status.' };
  }
  @Get('portal/:token') async portal(@Param('token') token: string) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new UnauthorizedException('Invalid or expired link.');
    const session = await repository.resolvePortal(hash(token)); if (!session) throw new UnauthorizedException('Invalid or expired link.');
    const scope = { tenantId:session.tenant_id,propertyId:session.property_id }; const actor = { ...publicActor, tenantId:scope.tenantId,propertyIds:[scope.propertyId],portalEnquiryId:session.enquiry_id };
    const state = await repository.read(actor,scope); const enquiry = state.enquiries.find(e => e.id === session.enquiry_id); if (!enquiry) throw new NotFoundException();
    const quotes = state.quotes.filter(q => q.enquiryId === enquiry.id); const events = state.events.filter(e => e.enquiryId === enquiry.id);
    return { enquiry:{ id:enquiry.id,reference:enquiry.reference,name:enquiry.name,kind:enquiry.kind,eventType:enquiry.eventType,start:enquiry.start,end:enquiry.end,guests:enquiry.guests,rooms:enquiry.rooms,status:enquiry.status }, quotes,events,payments:state.payments.filter(p => p.enquiryId === enquiry.id).map(p => ({ reference:p.reference,status:p.status,amountPesewas:p.amountPesewas,currency:p.currency,purpose:p.purpose,checkoutUrl:p.checkoutUrl,refundedPesewas:p.refundedPesewas })),rooming:state.rooming.filter(r => r.enquiryId === enquiry.id),sheets:state.sheets.filter(s => events.some(e => e.id === s.eventId)),expiresAt:session.expires_at };
  }
  @Post('portal/:token/rooming') @Throttle({ default: { limit: 20, ttl: 60000 } }) async portalRooming(@Param('token') token: string,@Body() body: Record<string,unknown>,@Headers('idempotency-key') key?: string) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new UnauthorizedException();
    const session = await repository.resolvePortal(hash(token)); if (!session) throw new UnauthorizedException();
    const scope={tenantId:session.tenant_id,propertyId:session.property_id}; const actor={...publicActor,tenantId:scope.tenantId,propertyIds:[scope.propertyId],portalEnquiryId:session.enquiry_id};
    const result=await repository.transact(actor,scope,{name:'rooming.save',payload:{...body,enquiryId:session.enquiry_id},reason:'Booker updated the rooming list through an expiring capability link',key:key || crypto.randomUUID()}); return {id:result.resultId};
  }
  @Post('payments/webhooks/:provider') async webhook(@Param('provider') provider: string,@Req() req: { rawBody?: Buffer; headers: Record<string,string|string[]|undefined> }) {
    if (provider !== config.PAYMENT_PROVIDER || provider === 'disabled') throw new NotFoundException('Provider not enabled.');
    if (!req.rawBody || req.rawBody.length > 262144) throw new BadRequestException('Bounded raw body required.');
    const adapter=paymentAdapter(provider,config.PAYMENT_SECRET_KEY,config.PAYMENT_WEBHOOK_SECRET,`${config.WEB_ORIGIN}/guest`);
    if (!adapter.authenticate(req.rawBody,req.headers)) throw new UnauthorizedException('Invalid webhook signature.');
    let event; try { event=adapter.parse(req.rawBody); } catch { throw new BadRequestException('Invalid JSON.'); }
    if (!event) return {received:true,ignored:true};
    if (event.type !== 'charge.success') return {received:true,ignored:true,reason:'Only verified charge success advances payment state in this reference adapter.'};
    const verified=await adapter.verify(event.reference);
    const result=await repository.verifiedPayment(systemActor,publicScope,{...verified,id:event.id}); return {received:true,duplicate:result.duplicate};
  }
}
@Module({ imports:[ThrottlerModule.forRoot([{ttl:60000,limit:120}])],controllers:[ApiController],providers:[StaffGuard,{provide:'APP_GUARD',useClass:ThrottlerGuard}] }) class AppModule {}
async function bootstrap() {
  await repository.assertSafeRole();
  if (!publicScope.tenantId || !publicScope.propertyId) throw new Error('PUBLIC_TENANT_ID and PUBLIC_PROPERTY_ID are required.');
  const app=await NestFactory.create<NestExpressApplication>(AppModule,{rawBody:true,bufferLogs:false});
  app.useBodyParser('json',{limit:'256kb'});
  app.enableCors({origin:config.WEB_ORIGIN,methods:['GET','POST'],allowedHeaders:['Content-Type','Authorization','Idempotency-Key','X-Property-Id'],credentials:false});
  app.use((req: {headers:Record<string,string|string[]|undefined>},res: {setHeader:(k:string,v:string)=>void},next:()=>void)=>{req.headers['x-request-id']=crypto.randomUUID();res.setHeader('X-Request-Id',req.headers['x-request-id'] as string);res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');next();});
  app.useGlobalFilters({ catch(error:unknown,response:{status:(n:number)=>{json:(b:unknown)=>void}}){const status=error instanceof HttpException?error.getStatus():error instanceof DomainError?error.status:typeof error==='object'&&error&&'status'in error?Number(error.status)||500:500;response.status(status).json({error:status===500?'The operation could not be verified. Retry with the same idempotency key.':error instanceof Error?error.message:'Request failed',statusCode:status});}} as never);
  const openapi=new DocumentBuilder().setTitle('King David hospitality API').setVersion('1.0.0').setDescription('Authenticated property-scoped operations. Public preview is browser-local; live payment providers require merchant acceptance testing.').addBearerAuth().build();
  SwaggerModule.setup('v1/docs',app,SwaggerModule.createDocument(app,openapi));
  await app.listen(Number(process.env.PORT || 3001),'0.0.0.0');
  const shutdown=async()=>{await app.close();await pool.end();await telemetry?.shutdown();process.exit(0);};process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
}
bootstrap().catch(error=>{console.error('API startup refused:',error.message);process.exit(1);});
