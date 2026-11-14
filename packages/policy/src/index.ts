import type { Actor, CommandName, Role, Scope } from '@king-david/contracts';

const allStaff: Role[] = ['admin', 'manager', 'front_desk', 'events', 'operations', 'finance'];
const permissions: Record<CommandName, Role[]> = {
  'enquiry.create': [...allStaff, 'readonly'],
  'enquiry.status': ['admin', 'manager', 'front_desk', 'events'],
  'hold.create': ['admin', 'manager', 'front_desk', 'events'],
  'hold.release': ['admin', 'manager', 'front_desk', 'events'],
  'quote.create': ['admin', 'manager', 'events'], 'quote.submit': ['admin', 'manager', 'events'],
  'quote.approve': ['admin', 'manager'], 'quote.accept': ['admin', 'manager', 'events'],
  'event.confirm': ['admin', 'manager', 'events'], 'event.progress': ['admin', 'manager', 'events', 'operations'], 'event.cancel': ['admin', 'manager'],
  'block.create': ['admin', 'manager', 'events', 'front_desk'], 'block.release': ['admin', 'manager', 'events'],
  'rooming.save': ['admin', 'manager', 'events', 'front_desk', 'readonly'], 'rooming.checkin': ['admin', 'manager', 'front_desk'],
  'payment.create': ['admin', 'manager', 'finance', 'front_desk', 'events', 'readonly'],
  'payment.simulate': ['admin', 'finance'], 'payment.verify': ['admin', 'finance'], 'payment.refund': ['admin', 'finance'], 'payment.reconcile': ['admin', 'finance'],
  'folio.create': ['admin', 'manager', 'finance', 'front_desk'], 'folio.post': ['admin', 'manager', 'finance', 'front_desk'], 'folio.route': ['admin', 'finance'], 'folio.invoice': ['admin', 'finance'],
  'sheet.revise': ['admin', 'manager', 'events', 'operations'], 'sheet.acknowledge': [...allStaff],
  'task.create': [...allStaff], 'task.status': [...allStaff], 'content.save': ['admin', 'manager'],
  'message.queue': ['admin', 'manager', 'front_desk', 'events'],
};
const portalCommands: CommandName[] = ['rooming.save', 'payment.create', 'quote.accept'];
export class AccessError extends Error { status = 403; constructor(message = 'You do not have permission for this action.') { super(message); } }
export function assertScope(actor: Actor, scope: Scope) {
  if (!actor.tenantId || actor.tenantId !== scope.tenantId || !actor.propertyIds.includes(scope.propertyId)) throw new AccessError('This record is outside your property scope.');
}
export function can(actor: Actor, command: CommandName) {
  if (actor.portalEnquiryId) return portalCommands.includes(command);
  return permissions[command].includes(actor.role);
}
export function assertCommand(actor: Actor, command: CommandName, scope: Scope) {
  assertScope(actor, scope);
  if (!can(actor, command)) throw new AccessError();
}
export function redactAudit(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(redactAudit);
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, ['email', 'phone', 'notes', 'portalTokenHash', 'checkoutUrl', 'providerReference'].includes(k) ? '[redacted]' : redactAudit(v)]));
}
