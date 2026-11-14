import { z } from 'zod';

export const ROLES = ['admin', 'manager', 'front_desk', 'events', 'operations', 'finance', 'readonly'] as const;
export type Role = typeof ROLES[number];
export interface Actor { id: string; name: string; tenantId: string; propertyIds: string[]; role: Role; mfa?: boolean; portalEnquiryId?: string }
export interface Scope { tenantId: string; propertyId: string }
export interface Owned extends Scope { id: string }
export type AllocationState = 'held' | 'confirmed' | 'released' | 'expired' | 'cancelled';
export type ResourceKind = 'room_type' | 'space' | 'resource';
export interface Allocation extends Owned { requestId: string; kind: ResourceKind; resourceId: string; start: string; end: string; quantity: number; state: AllocationState; expiresAt?: string; reason?: string }
export interface RoomType extends Owned { name: string; description: string; capacity: number; total: number; ratePesewas: number; verified: boolean; demo: boolean }
export interface SetupStyle { name: string; capacity: number }
export interface FunctionSpace extends Owned { name: string; description: string; setups: SetupStyle[]; setupMinutes: number; teardownMinutes: number; comboOf: string[]; verified: boolean; demo: boolean }
export interface Resource extends Owned { name: string; quantity: number; verified: boolean; demo: boolean }
export interface Property extends Owned { name: string; region: string; address: string; verified: boolean; demo: boolean }
export interface GuestProfile extends Owned { name: string; email: string; phone: string; consent: boolean; consentAt?: string }
export interface CompanyProfile extends Owned { name: string; contact: string; email: string }
export type EnquiryStatus = 'new' | 'reviewing' | 'quoted' | 'confirmed' | 'lost';
export interface EventInquiry extends Owned { reference: string; kind: 'stay' | 'event'; eventType: string; name: string; email: string; phone: string; start: string; end: string; startTime?: string; endTime?: string; guests: number; rooms: number; roomTypeId?: string; spaceId?: string; setup?: string; resourceIds: string[]; notes: string; status: EnquiryStatus; consent: boolean; createdAt: string; owner: string; portalTokenHash?: string; portalExpiresAt?: string; demo: boolean }
export type RevenueCategory = 'accommodation' | 'venue' | 'catering' | 'av' | 'staffing' | 'transfer' | 'fee';
export interface Product extends Owned { name: string; category: RevenueCategory; unitPesewas: number; description: string; demo: boolean }
export interface Package extends Owned { name: string; description: string; productIds: string[]; demo: boolean }
export interface QuoteLine { id: string; productId?: string; description: string; category: RevenueCategory; quantity: number; unitPesewas: number }
export interface TaxLine { label: string; basisPesewas: number; rateBps: number; amountPesewas: number }
export interface Deposit extends Owned { quoteId: string; label: string; amountPesewas: number; dueAt: string; state: 'due' | 'received' | 'overdue' | 'waived'; paymentRequestId?: string }
export interface QuoteVersion extends Owned { enquiryId: string; version: number; status: 'draft' | 'pending_approval' | 'approved' | 'accepted' | 'superseded' | 'expired'; lines: QuoteLine[]; taxes: TaxLine[]; subtotalPesewas: number; totalPesewas: number; inclusions: string; exclusions: string; cancellationTerms: string; expiresAt: string; depositPercent: number; deposits: Deposit[]; acceptedBy?: string; acceptedAt?: string; approvedBy?: string; contentHash?: string; createdAt: string; createdBy: string; demo: boolean }
export interface Event extends Owned { enquiryId: string; quoteId: string; name: string; state: 'confirmed' | 'in_progress' | 'completed' | 'cancelled'; start: string; end: string; attendance: number; spaceId: string; setup: string; owner: string; demo: boolean }
export interface SubEvent extends Owned { eventId: string; name: string; start: string; end: string; spaceId: string; notes: string; owner: string }
export interface RoomBlock extends Owned { enquiryId: string; roomTypeId: string; start: string; end: string; allocation: number; pickup: number; cutoff: string; deduct: boolean; state: 'active' | 'released' | 'cancelled'; ratePesewas: number; demo: boolean }
export interface RoomingListEntry extends Owned { blockId?: string; enquiryId: string; name: string; email: string; roomTypeId: string; start: string; end: string; arrivalTime: string; notes: string; state: 'named' | 'checked_in' | 'checked_out' | 'cancelled'; demo: boolean }
export type PaymentStatus = 'created' | 'pending_customer_authorization' | 'provider_confirmed' | 'verification_required' | 'reconciled' | 'failed' | 'expired' | 'provider_timeout' | 'manual_review' | 'partially_refunded' | 'refunded';
export interface PaymentRequest extends Owned { enquiryId: string; quoteId?: string; depositId?: string; provider: string; amountPesewas: number; currency: 'GHS'; purpose: string; status: PaymentStatus; reference: string; providerReference?: string; checkoutUrl?: string; refundedPesewas: number; history: { status: PaymentStatus; at: string; reason: string }[]; verification?: { verifiedAt: string; amountPesewas: number; currency: string; reference: string }; reconciliationBatch?: string; demo: boolean }
export interface WebhookReceipt extends Owned { provider: string; eventId: string; paymentReference: string; receivedAt: string; payloadHash: string; verifiedStatus?: 'success' | 'failed' | 'expired' | 'pending'; outcome: 'processed' | 'duplicate_event' | 'ignored_out_of_order' | 'manual_review' }
export interface Refund extends Owned { paymentRequestId: string; amountPesewas: number; reference: string; status: 'pending' | 'confirmed' | 'failed'; reason: string; createdAt: string }
export interface Folio extends Owned { enquiryId: string; name: string; type: 'room' | 'event' | 'individual' | 'group_master'; state: 'open' | 'closed'; guestName?: string; demo: boolean }
export interface FolioLine extends Owned { folioId: string; description: string; category: RevenueCategory; amountPesewas: number; taxes: TaxLine[]; createdAt: string; postedBy: string; routedFrom?: string }
export interface Invoice extends Owned { folioId: string; number: string; issuedAt: string; snapshot: { lines: FolioLine[]; subtotalPesewas: number; taxes: TaxLine[]; totalPesewas: number }; status: 'issued' | 'void'; fiscalStatus: 'not_submitted'; demo: boolean }
export interface FunctionSheet extends Owned { eventId: string; version: number; quoteId: string; notes: string; schedule: SubEvent[]; acknowledgements: { actorId: string; name: string; at: string; version: number }[]; createdAt: string; demo: boolean }
export interface Task extends Owned { title: string; description: string; owner: string; dueAt: string; status: 'open' | 'in_progress' | 'done'; priority: 'normal' | 'high'; enquiryId?: string; demo: boolean }
export interface MessageDelivery extends Owned { enquiryId: string; channel: 'email' | 'sms' | 'whatsapp'; purpose: string; consentAt?: string; status: 'queued' | 'sent' | 'delivered' | 'failed' | 'suppressed_no_consent'; providerReference?: string; createdAt: string; error?: string }
export interface AuditEntry extends Owned { actorId: string; actorName: string; action: string; entityType: string; entityId: string; before: unknown; after: unknown; reason: string; at: string; correlationId?: string }
export interface ContentField extends Owned { key: string; label: string; value: string; group: string; verified: boolean; evidence: string; updatedAt: string }
export interface CommandReceipt extends Owned { key: string; hash: string; resultId: string; createdAt: string }
export interface DomainState {
  properties: Property[]; roomTypes: RoomType[]; spaces: FunctionSpace[]; resources: Resource[];
  enquiries: EventInquiry[]; quotes: QuoteVersion[]; events: Event[]; subEvents: SubEvent[];
  allocations: Allocation[]; blocks: RoomBlock[]; rooming: RoomingListEntry[]; guests: GuestProfile[]; companies: CompanyProfile[];
  products: Product[]; packages: Package[]; payments: PaymentRequest[]; webhooks: WebhookReceipt[]; refunds: Refund[];
  folios: Folio[]; folioLines: FolioLine[]; invoices: Invoice[]; sheets: FunctionSheet[];
  tasks: Task[]; messages: MessageDelivery[]; audit: AuditEntry[]; content: ContentField[]; receipts: CommandReceipt[];
}
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v, 'Use a real calendar date');
export const enquirySchema = z.object({
  kind: z.enum(['stay', 'event']), eventType: z.string().trim().min(1).max(80), name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254), phone: z.string().trim().min(7).max(30),
  start: dateSchema, end: dateSchema, startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(), endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  guests: z.coerce.number().int().min(1).max(10000), rooms: z.coerce.number().int().min(0).max(500),
  roomTypeId: z.string().optional(), spaceId: z.string().optional(), setup: z.string().optional(), resourceIds: z.array(z.string()).default([]),
  notes: z.string().max(3000).default(''), consent: z.literal(true, { error: 'Please consent to being contacted about this enquiry.' }),
}).superRefine((v, ctx) => {
  if (v.end < v.start || (v.kind === 'stay' && v.end <= v.start)) ctx.addIssue({ code: 'custom', path: ['end'], message: 'Choose an end date after the start date.' });
  if (v.kind === 'event' && v.end === v.start && (!v.startTime || !v.endTime || v.endTime <= v.startTime)) ctx.addIssue({ code: 'custom', path: ['endTime'], message: 'The event must finish after it starts.' });
  if (v.kind === 'stay' && v.rooms < 1) ctx.addIssue({ code: 'custom', path: ['rooms'], message: 'Request at least one room.' });
  if (v.kind === 'event' && !v.spaceId) ctx.addIssue({ code: 'custom', path: ['spaceId'], message: 'Choose an illustrative space.' });
  if (v.kind === 'event' && !v.setup) ctx.addIssue({ code: 'custom', path: ['setup'], message: 'Choose a setup style.' });
});
export type EnquiryInput = z.infer<typeof enquirySchema>;
export const quoteLineSchema = z.object({ id: z.string().optional(), productId: z.string().optional(), description: z.string().trim().min(1).max(300), category: z.enum(['accommodation', 'venue', 'catering', 'av', 'staffing', 'transfer', 'fee']), quantity: z.number().int().min(1).max(10000), unitPesewas: z.number().int().min(0).max(100000000) });
export const quoteInputSchema = z.object({ enquiryId: z.string().uuid(), lines: z.array(quoteLineSchema).min(1).max(100), inclusions: z.string().max(3000).default('Demo inclusions only. Confirm before acceptance.'), exclusions: z.string().max(3000).default('Anything not explicitly listed is excluded.'), cancellationTerms: z.string().min(10).max(3000), expiresAt: z.string().datetime(), depositPercent: z.number().int().min(1).max(100).default(30) });
export type QuoteInput = z.infer<typeof quoteInputSchema>;
export const holdInputSchema = z.object({ enquiryId: z.string().uuid(), minutes: z.number().int().min(1).max(1440).default(30) });
export const blockInputSchema = z.object({ enquiryId: z.string().uuid(), roomTypeId: z.string(), allocation: z.number().int().min(1).max(500), cutoff: z.string().datetime(), deduct: z.boolean(), ratePesewas: z.number().int().min(0).max(100000000) });
export const paymentInputSchema = z.object({ enquiryId: z.string().uuid(), depositId: z.string().uuid().optional(), amountPesewas: z.number().int().min(1).max(1000000000), purpose: z.string().min(1).max(120), provider: z.enum(['demo', 'hubtel', 'paystack', 'flutterwave', 'bank_transfer']).default('demo') });
export const postingSchema = z.object({ folioId: z.string().uuid(), description: z.string().trim().min(1).max(300), category: z.enum(['accommodation', 'venue', 'catering', 'av', 'staffing', 'transfer', 'fee']), amountPesewas: z.number().int().min(0).max(1000000000), targetFolioId: z.string().uuid().optional() });
export const COMMAND_NAMES = ['enquiry.create', 'enquiry.status', 'hold.create', 'hold.release', 'quote.create', 'quote.submit', 'quote.approve', 'quote.accept', 'event.confirm', 'event.progress', 'event.cancel', 'block.create', 'block.release', 'rooming.save', 'rooming.checkin', 'payment.create', 'payment.simulate', 'payment.verify', 'payment.refund', 'payment.reconcile', 'folio.create', 'folio.post', 'folio.route', 'folio.invoice', 'sheet.revise', 'sheet.acknowledge', 'task.create', 'task.status', 'content.save', 'message.queue'] as const;
export type CommandName = typeof COMMAND_NAMES[number];
export interface Command { name: CommandName; payload: Record<string, unknown>; reason: string; key: string }
export const commandSchema = z.object({ name: z.enum(COMMAND_NAMES), payload: z.record(z.string(), z.unknown()), reason: z.string().trim().min(3).max(1000), key: z.string().min(8).max(150) });
export const CATEGORY_LABELS: Record<RevenueCategory, string> = { accommodation: 'Accommodation', venue: 'Venue hire', catering: 'Catering & F&B', av: 'AV & equipment', staffing: 'Staffing', transfer: 'Transfers', fee: 'Approved fees' };
export function money(pesewas: number, currency = 'GHS') { return new Intl.NumberFormat('en-GH', { style: 'currency', currency, minimumFractionDigits: 2 }).format(pesewas / 100); }
export function calculateTaxes(subtotal: number, registered = true): TaxLine[] {
  return registered ? [['VAT', 1500], ['NHIL', 250], ['GETFund Levy', 250]].map(([label, rate]) => ({ label: String(label), basisPesewas: subtotal, rateBps: Number(rate), amountPesewas: Math.round(subtotal * Number(rate) / 10000) })) : [];
}
export function quoteTotals(lines: Pick<QuoteLine, 'quantity' | 'unitPesewas'>[], registered = true) {
  const subtotalPesewas = lines.reduce((n, l) => n + l.quantity * l.unitPesewas, 0);
  const taxes = calculateTaxes(subtotalPesewas, registered);
  return { subtotalPesewas, taxes, totalPesewas: subtotalPesewas + taxes.reduce((n, t) => n + t.amountPesewas, 0) };
}
