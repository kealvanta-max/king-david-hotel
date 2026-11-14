import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';
import { z } from 'zod';
import { COMMAND_NAMES, quoteTotals, calculateTaxes, enquirySchema, quoteInputSchema, holdInputSchema, blockInputSchema, paymentInputSchema, postingSchema } from '@king-david/contracts';
import type { Actor, Allocation, Command, DomainState, EventInquiry, Folio, Owned, PaymentRequest, QuoteVersion, ResourceKind, Scope, WebhookReceipt } from '@king-david/contracts';
import { assertCommand, assertScope, redactAudit } from '@king-david/policy';

export class DomainError extends Error { constructor(message: string, public status = 409, public code = 'DOMAIN_CONFLICT') { super(message); } }
export const hash = (value: unknown) => bytesToHex(sha256(utf8ToBytes(typeof value === 'string' ? value : canonical(value))));
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
export const newId = () => crypto.randomUUID();
export function find<T extends Owned>(items: T[], id: string, scope: Scope, label = 'Record'): T {
  const item = items.find(x => x.id === id && x.tenantId === scope.tenantId && x.propertyId === scope.propertyId);
  if (!item) throw new DomainError(`${label} not found in this property.`, 404, 'NOT_FOUND');
  return item;
}
export function eventInterval(e: Pick<EventInquiry, 'start' | 'end' | 'kind' | 'startTime' | 'endTime'>, setup = 0, teardown = 0) {
  const start = e.kind === 'event' ? `${e.start}T${e.startTime || '00:00'}:00Z` : `${e.start}T00:00:00Z`;
  const end = e.kind === 'event' ? `${e.end}T${e.endTime || '23:59'}:00Z` : `${e.end}T00:00:00Z`;
  return { start: new Date(Date.parse(start) - setup * 60000).toISOString(), end: new Date(Date.parse(end) + teardown * 60000).toISOString() };
}
export function overlaps(a: { start: string; end: string }, b: { start: string; end: string }) { return a.start < b.end && b.start < a.end; }
export const active = (a: Allocation, now: string) => (a.state === 'confirmed' || (a.state === 'held' && a.expiresAt !== undefined && a.expiresAt > now));
export function requirements(s: DomainState, e: EventInquiry, scope: Scope): Omit<Allocation, 'id' | 'requestId' | 'state' | 'expiresAt'>[] {
  const result: Omit<Allocation, 'id' | 'requestId' | 'state' | 'expiresAt'>[] = [];
  if (e.rooms > 0) {
    if (!e.roomTypeId) throw new DomainError('Choose a room type for the requested rooms.', 400);
    find(s.roomTypes, e.roomTypeId, scope, 'Room type');
    result.push({ ...scope, kind: 'room_type', resourceId: e.roomTypeId, start: `${e.start}T00:00:00Z`, end: `${e.end}T00:00:00Z`, quantity: e.rooms });
  }
  if (e.kind === 'event') {
    if (!e.spaceId) throw new DomainError('An event needs a function space.', 400);
    const space = find(s.spaces, e.spaceId, scope, 'Function space');
    const setup = space.setups.find(x => x.name === e.setup);
    if (!setup) throw new DomainError('Choose a valid setup style.', 400);
    if (e.guests > setup.capacity) throw new DomainError(`Attendance exceeds the ${setup.name} layout capacity (${setup.capacity} in demo). Reduce attendance or request another layout.`);
    const visited = new Set<string>();
    const expand = (id: string) => {
      if (visited.has(id)) throw new DomainError('Circular space combination.');
      visited.add(id);
      const sp = find(s.spaces, id, scope, 'Function space');
      if (sp.comboOf.length) sp.comboOf.forEach(expand);
      else result.push({ ...scope, kind: 'space', resourceId: id, ...eventInterval(e, sp.setupMinutes, sp.teardownMinutes), quantity: 1 });
    };
    expand(e.spaceId);
    for (const id of new Set(e.resourceIds)) { find(s.resources, id, scope, 'Resource'); result.push({ ...scope, kind: 'resource', resourceId: id, ...eventInterval(e), quantity: 1 }); }
  }
  return result;
}
export function availability(s: DomainState, scope: Scope, kind: ResourceKind, resourceId: string, interval: { start: string; end: string }, now = new Date().toISOString(), excludeRequest?: string) {
  const capacity = kind === 'room_type' ? find(s.roomTypes, resourceId, scope).total : kind === 'resource' ? find(s.resources, resourceId, scope).quantity : 1;
  const used = s.allocations.filter(a => a.tenantId === scope.tenantId && a.propertyId === scope.propertyId && a.kind === kind && a.resourceId === resourceId && a.requestId !== excludeRequest && active(a, now) && overlaps(a, interval)).reduce((n, a) => n + a.quantity, 0);
  return { capacity, used, remaining: Math.max(0, capacity - used), demo: true };
}
export function expireInventory(s: DomainState, scope: Scope, now: string) {
  for (const a of s.allocations) {
    if (a.tenantId === scope.tenantId && a.propertyId === scope.propertyId && a.state === 'held' && a.expiresAt && a.expiresAt <= now) { a.state = 'expired'; a.reason = 'Hold expiry'; }
  }
  for (const b of s.blocks) {
    if (b.tenantId !== scope.tenantId || b.propertyId !== scope.propertyId || b.state !== 'active' || b.cutoff > now) continue;
    const unused = b.allocation - b.pickup;
    if (b.deduct && unused > 0) {
      const allocation = s.allocations.find(a => a.requestId === b.id && a.state === 'confirmed' && a.propertyId === scope.propertyId);
      if (allocation) { allocation.quantity -= unused; if (!allocation.quantity) allocation.state = 'released'; }
    }
    b.allocation = b.pickup; b.state = 'released';
  }
  for (const q of s.quotes) if (q.tenantId === scope.tenantId && q.propertyId === scope.propertyId && ['draft', 'pending_approval', 'approved'].includes(q.status) && q.expiresAt <= now) q.status = 'expired';
  for (const q of s.quotes) for (const d of q.deposits) if (d.state === 'due' && d.dueAt <= now) d.state = 'overdue';
}
function addAllocation(s: DomainState, req: Omit<Allocation, 'id' | 'state'>, state: 'held' | 'confirmed', now: string, idFactory: () => string = newId) {
  const interval = { start: req.start, end: req.end };
  for (const resource of [req]) {
    const av = availability(s, req, resource.kind, resource.resourceId, interval, now, req.requestId);
    if (resource.quantity > av.remaining) throw new DomainError(`Not enough ${resource.kind === 'room_type' ? 'rooms' : resource.kind === 'space' ? 'space time (including setup buffers)' : 'shared resources'} for these dates. No inventory was changed.`);
  }
  const existing = s.allocations.find(a => a.requestId === req.requestId && a.kind === req.kind && a.resourceId === req.resourceId && a.state === state && a.start === req.start && a.end === req.end && a.propertyId === req.propertyId);
  if (existing) existing.quantity += req.quantity;
  else s.allocations.push({ ...req, id: idFactory(), state });
}
function releaseRequest(s: DomainState, requestId: string, state: 'released' | 'cancelled', reason: string, now = new Date().toISOString()) { for (const a of s.allocations.filter(a => a.requestId === requestId && active(a, now))) { a.state = state; a.reason = reason; } }
function parse<T>(schema: z.ZodType<T>, value: unknown): T { const r = schema.safeParse(value); if (!r.success) throw new DomainError(r.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; '), 400, 'VALIDATION_ERROR'); return r.data; }
const idPayload = z.object({ id: z.string().uuid() });
const enquiryId = z.object({ enquiryId: z.string().uuid() });
function getEnquiry(s: DomainState, p: Record<string, unknown>, scope: Scope) { return find(s.enquiries, parse(enquiryId, p).enquiryId, scope, 'Enquiry'); }
function latestQuote(s: DomainState, enquiryId: string) { return s.quotes.filter(q => q.enquiryId === enquiryId).sort((a, b) => b.version - a.version)[0]; }
function transitionPayment(p: PaymentRequest, status: PaymentRequest['status'], at: string, reason: string) { p.status = status; p.history.push({ status, at, reason }); }

/** Called only AFTER signature authentication and authoritative server-side provider verification. */
export function receiveVerifiedEvent(s: DomainState, scope: Scope, event: { id: string; provider: string; reference: string; providerReference: string; status: 'success' | 'failed' | 'expired' | 'pending'; amountPesewas: number; currency: string; verifiedAt: string }, now = new Date().toISOString(), idFactory: () => string = newId) {
  const p = s.payments.find(x => x.reference === event.reference && x.tenantId === scope.tenantId && x.propertyId === scope.propertyId);
  if (!p) throw new DomainError('Unknown payment reference.', 404);
  const previous = s.webhooks.find(w => w.provider === event.provider && w.eventId === event.id && w.tenantId === scope.tenantId && w.propertyId === scope.propertyId);
  const eventIdentityHash = hash({ ...event, status: undefined, verifiedAt: undefined });
  if (previous) {
    if (previous.payloadHash !== eventIdentityHash) { transitionPayment(p, 'manual_review', now, 'Conflicting immutable payload for a provider event ID'); previous.outcome = 'manual_review'; return { duplicate: true, paymentId: p.id }; }
    // A signed success notification may arrive before the provider settles/authorizes it.
    // Re-verification of that same event may advance pending -> success, but never credit twice.
    const mayAdvance = previous.verifiedStatus === 'pending' && event.status !== 'pending' && ['created', 'pending_customer_authorization', 'provider_timeout'].includes(p.status);
    if (!mayAdvance) { p.history.push({ status: p.status, at: now, reason: 'Duplicate provider event ignored; no second credit' }); return { duplicate: true, paymentId: p.id }; }
    previous.verifiedStatus = event.status; previous.outcome = 'processed';
  }
  const receipt: WebhookReceipt = { ...scope, id: idFactory(), provider: event.provider, eventId: event.id, paymentReference: event.reference, receivedAt: now, payloadHash: eventIdentityHash, verifiedStatus: event.status, outcome: 'processed' };
  s.webhooks.push(receipt);
  if (p.amountPesewas !== event.amountPesewas || p.currency !== event.currency || p.provider !== event.provider) {
    transitionPayment(p, 'manual_review', now, 'Provider amount, currency or provider mismatch'); receipt.outcome = 'manual_review'; return { duplicate: false, paymentId: p.id };
  }
  const terminal = ['provider_confirmed', 'reconciled', 'refunded', 'partially_refunded', 'failed', 'expired'];
  if (terminal.includes(p.status)) { receipt.outcome = 'ignored_out_of_order'; p.history.push({ status: p.status, at: now, reason: 'Out-of-order provider event ignored after terminal financial state' }); return { duplicate: false, paymentId: p.id }; }
  if (event.status === 'pending') { if (p.status === 'created') transitionPayment(p, 'pending_customer_authorization', now, 'Provider awaiting customer authorization'); else receipt.outcome = 'ignored_out_of_order'; return { duplicate: false, paymentId: p.id }; }
  if (event.status === 'success') {
    p.providerReference = event.providerReference;
    p.verification = { verifiedAt: event.verifiedAt, amountPesewas: event.amountPesewas, currency: event.currency, reference: event.providerReference };
    transitionPayment(p, 'provider_confirmed', now, 'Signature authenticated and provider transaction verified');
    if (p.depositId) for (const q of s.quotes) { const d = q.deposits.find(d => d.id === p.depositId); if (d && d.state !== 'received') d.state = 'received'; }
  } else { transitionPayment(p, event.status === 'failed' ? 'failed' : 'expired', now, 'Verified provider outcome'); receipt.outcome = 'processed'; }
  return { duplicate: false, paymentId: p.id };
}

export interface ExecutionResult { state: DomainState; resultId: string; replayed: boolean }
/** Pure transactional domain transition. The Postgres adapter runs this under a property write lock + RLS. */
export function execute(state: DomainState, actor: Actor, scope: Scope, command: Command, options: { demo?: boolean; now?: string; idFactory?: () => string } = {}): ExecutionResult {
  const newId = options.idFactory || (() => crypto.randomUUID());
  const now = options.now || new Date().toISOString();
  assertScope(actor, scope);
  if (!COMMAND_NAMES.includes(command.name)) throw new DomainError('Unknown command.', 400);
  assertCommand(actor, command.name, scope);
  if (command.key.length < 8 || command.reason.trim().length < 3) throw new DomainError('An idempotency key and change reason are required.', 400);
  if (!options.demo && ['payment.simulate', 'payment.verify', 'payment.refund'].includes(command.name)) throw new DomainError('Manual payment simulation/verification is disabled outside the demo.', 403);
  const s: DomainState = structuredClone(state);
  expireInventory(s, scope, now);
  const commandHash = hash({ name: command.name, payload: command.payload, reason: command.reason });
  const receipt = s.receipts.find(r => r.key === command.key && r.tenantId === scope.tenantId && r.propertyId === scope.propertyId);
  if (receipt) { if (receipt.hash !== commandHash) throw new DomainError('This idempotency key was used for a different request.'); return { state: s, resultId: receipt.resultId, replayed: true }; }
  const p = command.payload;
  const own = () => ({ ...scope, id: newId() });
  let resultId = '';
  const auditStart = s.audit.length;
  switch (command.name) {
    case 'enquiry.create': {
      const input = parse(enquirySchema, p);
      if (input.start < now.slice(0, 10)) throw new DomainError('Choose today or a future date.', 400);
      if ((Date.parse(input.end) - Date.parse(input.start)) / 86400000 > 60) throw new DomainError('For stays longer than 60 days, please contact the property.', 400);
      requirements(s, input as unknown as EventInquiry, scope);
      if (input.roomTypeId) find(s.roomTypes, input.roomTypeId, scope);
      const e: EventInquiry = { ...own(), ...input, reference: `KD-${options.demo ? 'DEMO-' : ''}${newId().slice(0, 8).toUpperCase()}`, status: 'new', createdAt: now, owner: input.kind === 'event' ? 'Events team' : 'Front desk', demo: !!options.demo };
      s.enquiries.push(e); resultId = e.id;
      s.guests.push({ ...own(), name: input.name, email: input.email, phone: input.phone, consent: input.consent, consentAt: now });
      s.tasks.push({ ...own(), title: `Respond to ${input.name.split(' ')[0]}'s ${input.kind} enquiry`, description: `${e.reference} · ${input.eventType}. Review requirements before offering a hold or quote.`, owner: e.owner, dueAt: new Date(Date.parse(now) + 86400000).toISOString(), status: 'open', priority: 'normal', enquiryId: e.id, demo: !!options.demo });
      break;
    }
    case 'enquiry.status': {
      const e = find(s.enquiries, parse(idPayload.extend({ status: z.enum(['new', 'reviewing', 'quoted', 'confirmed', 'lost']) }), p).id, scope, 'Enquiry');
      const status = (p as { status: EventInquiry['status'] }).status;
      if (e.status === 'confirmed') throw new DomainError('Cancel the confirmed event/stay through its controlled workflow, not by changing the enquiry label.', 400);
      if (['confirmed', 'quoted'].includes(status)) throw new DomainError('Quoted and confirmed states are set by the quote/confirmation workflow.', 400);
      if (status === 'lost') { releaseRequest(s, e.id, 'released', command.reason, now); s.blocks.filter(b => b.enquiryId === e.id && b.state === 'active').forEach(b => { b.state = 'cancelled'; }); }
      e.status = status; resultId = e.id; break;
    }
    case 'hold.create': {
      const input = parse(holdInputSchema, p); const e = getEnquiry(s, p, scope);
      if (['lost', 'confirmed'].includes(e.status)) throw new DomainError('This enquiry cannot create a new hold.');
      if (s.allocations.some(a => a.requestId === e.id && a.state === 'held' && active(a, now))) throw new DomainError('An active hold already exists. Release it before extending.');
      for (const req of requirements(s, e, scope)) addAllocation(s, { ...req, requestId: e.id, expiresAt: new Date(Date.parse(now) + input.minutes * 60000).toISOString() }, 'held', now, newId);
      e.status = 'reviewing'; resultId = e.id; break;
    }
    case 'hold.release': { const e = getEnquiry(s, p, scope); releaseRequest(s, e.id, 'released', command.reason, now); resultId = e.id; break; }
    case 'quote.create': {
      const input = parse(quoteInputSchema, p); const e = getEnquiry(s, p, scope);
      if (input.expiresAt <= now || input.expiresAt > `${e.start}T23:59:59Z`) throw new DomainError('Quote expiry must be in the future and no later than the arrival/event date.', 400);
      if (e.status === 'lost') throw new DomainError('Reopen the enquiry before quoting.');
      const previous = latestQuote(s, e.id);
      if (previous?.status === 'accepted' && s.events.some(ev => ev.enquiryId === e.id && ev.state !== 'cancelled')) throw new DomainError('This enquiry has a confirmed contract. Use a controlled event revision instead.');
      for (const q of s.quotes.filter(q => q.enquiryId === e.id && q.status !== 'accepted')) q.status = 'superseded';
      const totals = quoteTotals(input.lines);
      const q: QuoteVersion = { ...own(), ...input, lines: input.lines.map(l => ({ ...l, id: l.id || newId() })), ...totals, enquiryId: e.id, version: (previous?.version || 0) + 1, status: 'draft', deposits: [], createdAt: now, createdBy: actor.id, demo: !!options.demo };
      q.deposits = [{ ...own(), quoteId: q.id, label: 'Initial deposit', amountPesewas: Math.round(q.totalPesewas * input.depositPercent / 100), dueAt: new Date(Math.min(Date.parse(input.expiresAt), Date.parse(now) + 3 * 86400000)).toISOString(), state: 'due' }];
      s.quotes.push(q); resultId = q.id; break;
    }
    case 'quote.submit': case 'quote.approve': case 'quote.accept': {
      const q = find(s.quotes, parse(idPayload, p).id, scope, 'Quote'); const e = find(s.enquiries, q.enquiryId, scope);
      if (q.expiresAt <= now) { q.status = 'expired'; throw new DomainError('This quote has expired. Create a new version.'); }
      if (command.name === 'quote.submit') {
        if (q.status !== 'draft') throw new DomainError('Only a draft can be submitted.');
        q.status = 'pending_approval'; e.status = 'quoted';
      } else if (command.name === 'quote.approve') {
        if (q.status !== 'pending_approval') throw new DomainError('Submit the quote for approval first.');
        if (q.createdBy === actor.id && !options.demo) throw new DomainError('A different manager must approve this quote.', 403);
        q.status = 'approved'; q.approvedBy = actor.id;
      } else {
        if (q.status !== 'approved') throw new DomainError('Only a manager-approved quote can be accepted.');
        const name = parse(z.object({ name: z.string().trim().min(2).max(120), consent: z.literal(true) }), p).name;
        if (actor.portalEnquiryId && (actor.portalEnquiryId !== e.id || name.toLowerCase() !== e.name.toLowerCase())) throw new DomainError('The booker must accept their own quote.', 403);
        q.status = 'accepted'; q.acceptedBy = name; q.acceptedAt = now;
        // Fulfilment metadata on deposits may change; all commercial terms are frozen.
        q.contentHash = hash({ ...q, status: undefined, acceptedBy: undefined, acceptedAt: undefined, contentHash: undefined, deposits: q.deposits.map(d => ({ ...d, state: undefined, paymentRequestId: undefined })) });
      }
      resultId = q.id; break;
    }
    case 'event.confirm': {
      const e = getEnquiry(s, p, scope); const q = latestQuote(s, e.id);
      if (!q || q.status !== 'accepted') throw new DomainError('Accept an approved, unexpired quote before confirmation.');
      const deposit = q.deposits[0];
      const verified = s.payments.filter(x => x.enquiryId === e.id && x.depositId === deposit.id && ['provider_confirmed', 'reconciled', 'partially_refunded', 'refunded'].includes(x.status)).reduce((n, x) => n + x.amountPesewas - x.refundedPesewas, 0);
      if (verified < deposit.amountPesewas) throw new DomainError('The deposit is not server-verified. A browser redirect is not payment confirmation.');
      if (s.events.some(x => x.enquiryId === e.id && x.state !== 'cancelled')) throw new DomainError('This enquiry already has a confirmed event/stay.');
      releaseRequest(s, e.id, 'released', 'Converted to confirmed reservation', now);
      const roomQuote = q.lines.find(l => l.category === 'accommodation');
      const block = e.rooms > 0 && e.roomTypeId ? { ...own(), enquiryId: e.id, roomTypeId: e.roomTypeId, start: `${e.start}T00:00:00Z`, end: `${e.end}T00:00:00Z`, allocation: e.rooms, pickup: 0, cutoff: `${e.start}T00:00:00Z`, deduct: true, state: 'active' as const, ratePesewas: roomQuote?.unitPesewas || 0, demo: !!options.demo } : undefined;
      for (const req of requirements(s, e, scope)) addAllocation(s, { ...req, requestId: req.kind === 'room_type' && block ? block.id : e.id }, 'confirmed', now, newId);
      const ev = { ...own(), enquiryId: e.id, quoteId: q.id, name: `${e.eventType} · ${e.name}`, state: 'confirmed' as const, ...eventInterval(e), attendance: e.guests, spaceId: e.spaceId || '', setup: e.setup || '', owner: e.owner, demo: !!options.demo };
      s.events.push(ev); e.status = 'confirmed';
      if (block) s.blocks.push(block);
      const folio: Folio = { ...own(), enquiryId: e.id, name: `${e.reference} · ${e.kind === 'event' ? 'Event master' : 'Room folio'}`, type: e.kind === 'event' ? 'group_master' : 'room', state: 'open', demo: !!options.demo };
      s.folios.push(folio);
      for (const l of q.lines) s.folioLines.push({ ...own(), folioId: folio.id, description: l.description, category: l.category, amountPesewas: l.quantity * l.unitPesewas, taxes: calculateTaxes(l.quantity * l.unitPesewas), createdAt: now, postedBy: actor.id });
      const schedule = e.kind === 'event' ? [{ ...own(), eventId: ev.id, name: e.eventType, start: ev.start, end: ev.end, spaceId: ev.spaceId, notes: 'Demo schedule. Confirm production requirements with the client.', owner: e.owner }] : [];
      s.subEvents.push(...schedule);
      s.sheets.push({ ...own(), eventId: ev.id, version: 1, quoteId: q.id, notes: 'Illustrative function sheet. All operational details require property confirmation.', schedule, acknowledgements: [], createdAt: now, demo: !!options.demo });
      resultId = ev.id; break;
    }
    case 'event.progress': {
      const ev = find(s.events, parse(idPayload, p).id, scope, 'Event');
      const next = parse(z.object({ state: z.enum(['in_progress', 'completed']) }), p).state;
      if (ev.state === 'cancelled' || ev.state === 'completed' || (ev.state === 'confirmed' && next !== 'in_progress')) throw new DomainError('Invalid event lifecycle transition.');
      ev.state = next; resultId = ev.id; break;
    }
    case 'event.cancel': {
      const ev = find(s.events, parse(idPayload, p).id, scope, 'Event'); if (ev.state === 'completed') throw new DomainError('A completed event cannot be cancelled.');
      ev.state = 'cancelled'; releaseRequest(s, ev.enquiryId, 'cancelled', command.reason, now);
      for (const b of s.blocks.filter(b => b.enquiryId === ev.enquiryId)) { b.state = 'cancelled'; releaseRequest(s, b.id, 'cancelled', command.reason, now); }
      s.rooming.filter(r => r.enquiryId === ev.enquiryId).forEach(r => { r.state = 'cancelled'; releaseRequest(s, r.id, 'cancelled', command.reason, now); });
      find(s.enquiries, ev.enquiryId, scope).status = 'lost'; resultId = ev.id; break;
    }
    case 'block.create': {
      const input = parse(blockInputSchema, p); const e = getEnquiry(s, p, scope);
      if (!s.events.some(ev => ev.enquiryId === e.id && ev.state !== 'cancelled')) throw new DomainError('Confirm the event/stay and verified deposit before creating an additional block.');
      if (input.cutoff <= now || input.cutoff > `${e.start}T23:59:59Z`) throw new DomainError('Cutoff must be future and no later than arrival.', 400);
      const b = { ...own(), ...input, start: `${e.start}T00:00:00Z`, end: `${e.end}T00:00:00Z`, pickup: 0, state: 'active' as const, demo: !!options.demo };
      if (b.deduct) addAllocation(s, { ...scope, requestId: b.id, kind: 'room_type', resourceId: b.roomTypeId, start: b.start, end: b.end, quantity: b.allocation }, 'confirmed', now, newId);
      s.blocks.push(b); resultId = b.id; break;
    }
    case 'block.release': {
      const b = find(s.blocks, parse(idPayload, p).id, scope, 'Room block'); if (b.state !== 'active') throw new DomainError('Block is already released.');
      const unused = b.allocation - b.pickup;
      if (b.deduct && unused) { const a = s.allocations.find(a => a.requestId === b.id && a.state === 'confirmed'); if (a) { a.quantity -= unused; if (!a.quantity) a.state = 'released'; } }
      b.allocation = b.pickup; b.state = 'released'; resultId = b.id; break;
    }
    case 'rooming.save': {
      const input = parse(z.object({ id: z.string().uuid().optional(), enquiryId: z.string().uuid(), blockId: z.string().uuid().optional(), name: z.string().trim().min(2).max(120), email: z.string().email().max(254), arrivalTime: z.string().max(10).default(''), notes: z.string().max(1000).default('') }), p);
      const e = find(s.enquiries, input.enquiryId, scope, 'Enquiry');
      if (actor.portalEnquiryId && actor.portalEnquiryId !== e.id) throw new DomainError('Cannot edit another booking.', 403);
      if (!e.consent) throw new DomainError('Contact consent is required.');
      if (e.status !== 'confirmed') throw new DomainError('A confirmed reservation is required for a rooming list.');
      if (!input.blockId) throw new DomainError('Choose an active room block. Named guests must pick up from the block before general inventory.', 400);
      const block = find(s.blocks, input.blockId, scope, 'Room block');
      if (block.enquiryId !== e.id || block.state !== 'active' || block.cutoff <= now) throw new DomainError('This block is not open for pickup.');
      const existing = input.id ? find(s.rooming, input.id, scope, 'Guest') : undefined;
      if (existing && (existing.enquiryId !== e.id || existing.state === 'cancelled')) throw new DomainError('This guest cannot be changed.');
      if (existing && existing.blockId !== block.id) throw new DomainError('Release the previous rooming entry before changing its block.');
      if (!existing && block.pickup >= block.allocation) throw new DomainError('The room block is fully picked up.');
      const roomTypeId = block.roomTypeId;
      const r = existing || { ...own(), enquiryId: e.id, blockId: block.id, roomTypeId, name: '', email: '', arrivalTime: '', notes: '', start: `${e.start}T00:00:00Z`, end: `${e.end}T00:00:00Z`, state: 'named' as const, demo: !!options.demo };
      Object.assign(r, { name: input.name, email: input.email, arrivalTime: input.arrivalTime, notes: input.notes });
      if (!existing) { s.rooming.push(r); block.pickup++; if (!block.deduct) addAllocation(s, { ...scope, requestId: r.id, kind: 'room_type', resourceId: roomTypeId, start: r.start, end: r.end, quantity: 1 }, 'confirmed', now, newId); }
      resultId = r.id; break;
    }
    case 'rooming.checkin': {
      const input = parse(idPayload.extend({ state: z.enum(['checked_in', 'checked_out', 'cancelled']) }), p); const r = find(s.rooming, input.id, scope, 'Guest');
      if (input.state === 'checked_in' && (r.state !== 'named' || r.start.slice(0, 10) > now.slice(0, 10))) throw new DomainError('Check-in is available for named guests on or after arrival.');
      if (input.state === 'checked_out' && r.state !== 'checked_in') throw new DomainError('Check the guest in first.');
      if (input.state === 'cancelled') {
        if (!['named', 'checked_in'].includes(r.state)) throw new DomainError('This guest cannot be cancelled.');
        const b = r.blockId ? find(s.blocks, r.blockId, scope) : undefined;
        if (b) { b.pickup = Math.max(0, b.pickup - 1); if (!b.deduct) releaseRequest(s, r.id, 'cancelled', command.reason, now); else if (b.state !== 'active') { const a = s.allocations.find(a => a.requestId === b.id && a.state === 'confirmed'); if (a) { a.quantity--; if (!a.quantity) a.state = 'released'; } } }
        else releaseRequest(s, r.id, 'cancelled', command.reason, now);
      }
      r.state = input.state; resultId = r.id; break;
    }
    case 'payment.create': {
      const input = parse(paymentInputSchema, p); const e = getEnquiry(s, p, scope);
      if (actor.portalEnquiryId && actor.portalEnquiryId !== e.id) throw new DomainError('Cannot pay another booking.', 403);
      if (!options.demo && input.provider === 'demo') throw new DomainError('Demo payments are disabled.', 400);
      if (options.demo && input.provider !== 'demo') throw new DomainError('The preview supports only explicitly simulated payments.', 400);
      if (input.depositId) {
        const q = s.quotes.find(q => q.id === latestQuote(s, e.id)?.id && q.deposits.some(d => d.id === input.depositId));
        if (!q || !['approved', 'accepted'].includes(q.status)) throw new DomainError('Choose a current approved deposit.');
        const d = q.deposits.find(d => d.id === input.depositId)!;
        if (d.amountPesewas !== input.amountPesewas) throw new DomainError('Deposit amount does not match the quote.');
        if (s.payments.some(x => x.depositId === d.id && ['created', 'pending_customer_authorization', 'provider_confirmed', 'reconciled'].includes(x.status))) throw new DomainError('A payment request already exists for this deposit.');
      }
      const payment: PaymentRequest = { ...own(), ...input, enquiryId: e.id, quoteId: latestQuote(s, e.id)?.id, currency: 'GHS', status: 'created', reference: `PAY-${newId()}`, refundedPesewas: 0, history: [{ status: 'created', at: now, reason: command.reason }], demo: !!options.demo };
      s.payments.push(payment); resultId = payment.id; break;
    }
    case 'payment.simulate': {
      if (!options.demo) throw new DomainError('Simulation is demo-only.', 403);
      const input = parse(idPayload.extend({ outcome: z.enum(['success', 'failed', 'expired', 'pending', 'timeout', 'duplicate']), eventId: z.string().optional() }), p); const payment = find(s.payments, input.id, scope, 'Payment');
      if (payment.provider !== 'demo') throw new DomainError('Only demo transactions may be simulated.');
      if (input.outcome === 'timeout') { transitionPayment(payment, 'provider_timeout', now, 'Demo provider timeout — verification required'); resultId = payment.id; break; }
      const outcome = input.outcome === 'duplicate' ? 'success' : input.outcome;
      const result = receiveVerifiedEvent(s, scope, { id: input.eventId || `demo-${payment.id}-success`, provider: 'demo', reference: payment.reference, providerReference: `DEMO-${payment.id}`, status: outcome, amountPesewas: payment.amountPesewas, currency: 'GHS', verifiedAt: now }, now, newId);
      resultId = result.paymentId; break;
    }
    case 'payment.verify': {
      const payment = find(s.payments, parse(idPayload, p).id, scope, 'Payment');
      if (!options.demo || payment.provider !== 'demo') throw new DomainError('Live verification must use the provider adapter, not a staff button.', 403);
      if (!payment.verification) throw new DomainError('No verified provider transaction is available.');
      transitionPayment(payment, 'verification_required', now, 'Demo re-verification requested'); transitionPayment(payment, 'provider_confirmed', now, 'Demo verification matched amount, currency and reference'); resultId = payment.id; break;
    }
    case 'payment.refund': {
      const input = parse(idPayload.extend({ amountPesewas: z.number().int().positive() }), p); const payment = find(s.payments, input.id, scope, 'Payment');
      if (!options.demo || !payment.verification || !['provider_confirmed', 'reconciled', 'partially_refunded'].includes(payment.status)) throw new DomainError('Only a verified demo payment can be refunded here.');
      if (input.amountPesewas > payment.amountPesewas - payment.refundedPesewas) throw new DomainError('Refund exceeds the remaining captured amount.');
      payment.refundedPesewas += input.amountPesewas; transitionPayment(payment, payment.refundedPesewas === payment.amountPesewas ? 'refunded' : 'partially_refunded', now, command.reason);
      s.refunds.push({ ...own(), paymentRequestId: payment.id, amountPesewas: input.amountPesewas, reference: `DEMO-REF-${newId()}`, status: 'confirmed', reason: command.reason, createdAt: now }); resultId = payment.id; break;
    }
    case 'payment.reconcile': {
      const input = parse(idPayload.extend({ batch: z.string().min(3).max(100), settlementPesewas: z.number().int().nonnegative() }), p); const payment = find(s.payments, input.id, scope, 'Payment');
      if (!payment.verification || !['provider_confirmed', 'manual_review'].includes(payment.status)) throw new DomainError('Payment needs verification and an eligible state.');
      if (input.settlementPesewas !== payment.amountPesewas) { transitionPayment(payment, 'manual_review', now, 'Reconciliation amount mismatch'); resultId = payment.id; break; }
      payment.reconciliationBatch = input.batch; transitionPayment(payment, 'reconciled', now, `Matched settlement batch ${input.batch}`); resultId = payment.id; break;
    }
    case 'folio.create': {
      const input = parse(enquiryId.extend({ name: z.string().min(2).max(120), type: z.enum(['room', 'event', 'individual', 'group_master']), guestName: z.string().max(120).optional() }), p); getEnquiry(s, p, scope);
      const f: Folio = { ...own(), ...input, state: 'open', demo: !!options.demo }; s.folios.push(f); resultId = f.id; break;
    }
    case 'folio.post': {
      const input = parse(postingSchema, p); const f = find(s.folios, input.folioId, scope, 'Folio'); if (f.state !== 'open') throw new DomainError('This folio is closed.');
      const line = { ...own(), folioId: f.id, description: input.description, category: input.category, amountPesewas: input.amountPesewas, taxes: calculateTaxes(input.amountPesewas), createdAt: now, postedBy: actor.id }; s.folioLines.push(line); resultId = line.id; break;
    }
    case 'folio.route': {
      const input = parse(idPayload.extend({ targetFolioId: z.string().uuid() }), p); const line = find(s.folioLines, input.id, scope, 'Posting'); const target = find(s.folios, input.targetFolioId, scope, 'Folio'); const source = find(s.folios, line.folioId, scope);
      if (source.enquiryId !== target.enquiryId || source.state !== 'open' || target.state !== 'open') throw new DomainError('Routing requires open folios on the same booking.');
      if (s.invoices.some(i => i.folioId === source.id && i.status === 'issued')) throw new DomainError('An invoiced posting cannot be silently routed.');
      line.routedFrom = line.folioId; line.folioId = target.id; resultId = line.id; break;
    }
    case 'folio.invoice': {
      const f = find(s.folios, parse(idPayload, p).id, scope, 'Folio'); const lines = s.folioLines.filter(l => l.folioId === f.id); if (!lines.length) throw new DomainError('Cannot invoice an empty folio.');
      if (s.invoices.some(i => i.folioId === f.id && i.status === 'issued')) throw new DomainError('An issued invoice already exists. Issue a controlled credit/rebill in production.');
      const subtotalPesewas = lines.reduce((n, l) => n + l.amountPesewas, 0);
      const taxes = calculateTaxes(0).map(t => ({ ...t, basisPesewas: subtotalPesewas, amountPesewas: lines.reduce((n, l) => n + (l.taxes.find(x => x.label === t.label)?.amountPesewas || 0), 0) }));
      const invoice = { ...own(), folioId: f.id, number: `DEMO-INV-${newId().slice(0, 8).toUpperCase()}`, issuedAt: now, snapshot: { lines: structuredClone(lines), subtotalPesewas, taxes, totalPesewas: subtotalPesewas + taxes.reduce((n, t) => n + t.amountPesewas, 0) }, status: 'issued' as const, fiscalStatus: 'not_submitted' as const, demo: !!options.demo };
      s.invoices.push(invoice); f.state = 'closed'; resultId = invoice.id; break;
    }
    case 'sheet.revise': {
      const input = parse(idPayload.extend({ notes: z.string().min(3).max(5000) }), p); const sheet = find(s.sheets, input.id, scope, 'Function sheet'); const ev = find(s.events, sheet.eventId, scope);
      if (ev.state === 'cancelled' || ev.state === 'completed') throw new DomainError('This event no longer accepts production revisions.');
      sheet.version++; sheet.notes = input.notes; sheet.createdAt = now; sheet.acknowledgements = []; resultId = sheet.id; break;
    }
    case 'sheet.acknowledge': {
      const sheet = find(s.sheets, parse(idPayload, p).id, scope, 'Function sheet');
      if (!sheet.acknowledgements.some(a => a.actorId === actor.id && a.version === sheet.version)) sheet.acknowledgements.push({ actorId: actor.id, name: actor.name, at: now, version: sheet.version }); resultId = sheet.id; break;
    }
    case 'task.create': {
      const input = parse(z.object({ title: z.string().min(3).max(180), description: z.string().max(2000).default(''), owner: z.string().min(1).max(100), dueAt: z.string().datetime(), priority: z.enum(['normal', 'high']).default('normal'), enquiryId: z.string().uuid().optional() }), p);
      if (input.enquiryId) find(s.enquiries, input.enquiryId, scope);
      const task = { ...own(), ...input, status: 'open' as const, demo: !!options.demo }; s.tasks.push(task); resultId = task.id; break;
    }
    case 'task.status': {
      const input = parse(idPayload.extend({ status: z.enum(['open', 'in_progress', 'done']) }), p); const t = find(s.tasks, input.id, scope, 'Task'); t.status = input.status; resultId = t.id; break;
    }
    case 'content.save': {
      const input = parse(idPayload.extend({ value: z.string().max(5000), evidence: z.string().max(2000).default(''), verified: z.boolean() }), p); const field = find(s.content, input.id, scope, 'Content field');
      if (input.verified && !input.evidence.trim()) throw new DomainError('Record the evidence before marking a property fact verified.', 400);
      if (input.verified && actor.role !== 'admin') throw new DomainError('Only an administrator can publish a verified fact.', 403);
      Object.assign(field, input, { updatedAt: now }); resultId = field.id; break;
    }
    case 'message.queue': {
      const input = parse(enquiryId.extend({ channel: z.enum(['email', 'sms', 'whatsapp']), purpose: z.string().min(3).max(300) }), p); const e = getEnquiry(s, p, scope);
      const message = { ...own(), ...input, status: e.consent ? 'queued' as const : 'suppressed_no_consent' as const, consentAt: e.consent ? e.createdAt : undefined, createdAt: now }; s.messages.push(message); resultId = message.id; break;
    }
  }
  // Append a redacted before/after trace for every changed record, not just the primary result.
  for (const key of Object.keys(s) as (keyof DomainState)[]) {
    if (key === 'audit' || key === 'receipts') continue;
    const oldRows = state[key] as Owned[]; const newRows = s[key] as Owned[];
    for (const row of newRows) {
      if (row.tenantId !== scope.tenantId || row.propertyId !== scope.propertyId) continue;
      const old = oldRows.find(x => x.id === row.id);
      if (old && canonical(old) === canonical(row)) continue;
      s.audit.push({ ...scope, id: newId(), actorId: actor.id, actorName: actor.name, action: command.name, entityType: key, entityId: row.id, before: old ? redactAudit(old) : null, after: redactAudit(row), reason: command.reason, at: now });
    }
  }
  if (s.audit.length === auditStart) throw new DomainError('This action did not change any state.', 400);
  s.receipts.push({ ...scope, id: newId(), key: command.key, hash: commandHash, resultId, createdAt: now });
  return { state: s, resultId, replayed: false };
}
