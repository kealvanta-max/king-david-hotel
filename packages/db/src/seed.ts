import type { DomainState, Owned, Scope, QuoteVersion, EventInquiry, Actor } from '@king-david/contracts';
import { quoteTotals } from '@king-david/contracts';
import { execute } from './engine';

// A property's canonical ID is also its property-scoping ID. The tenant has a separate ID.
export const DEMO_SCOPE: Scope = { tenantId: '00000000-0000-4000-8000-000000000001', propertyId: '10000000-0000-4000-8000-000000000001' };
export function dayOffset(offset: number, base = new Date()) { const d = new Date(base); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0, 10); }
export function createSeed(now = new Date()): DomainState {
  const s = DEMO_SCOPE;
  const id = (name: string): Owned => ({ ...s, id: `10000000-0000-4000-8000-${name.padStart(12, '0')}` });
  const today = now.toISOString().slice(0, 10);
  const state: DomainState = {
    properties: [{ ...id('1'), name: 'King David Event and Guesthouse', region: 'Gomoa, Ghana', address: 'Exact address and map pin awaiting property verification', verified: false, demo: true }],
    roomTypes: [
      { ...id('10'), name: 'Standard room · demo', description: 'An illustrative room category, not a published room claim. Bedding, amenities and accessibility need confirmation.', capacity: 2, total: 6, ratePesewas: 45000, verified: false, demo: true },
      { ...id('11'), name: 'Family room · demo', description: 'An illustrative group-stay option. Room layout, bedding and occupancy must be verified by the property.', capacity: 4, total: 2, ratePesewas: 70000, verified: false, demo: true },
    ],
    spaces: [
      { ...id('20'), name: 'Garden canopy · demo', description: 'Illustrative outdoor gathering space. Actual site, weather plan and capacity are unverified.', setups: [{ name: 'Ceremony', capacity: 120 }, { name: 'Banquet', capacity: 80 }, { name: 'Reception', capacity: 150 }], setupMinutes: 120, teardownMinutes: 60, comboOf: [], verified: false, demo: true },
      { ...id('21'), name: 'Meeting room · demo', description: 'Illustrative meeting setup. Connectivity, AV and room dimensions are unverified.', setups: [{ name: 'Boardroom', capacity: 20 }, { name: 'Classroom', capacity: 30 }, { name: 'Theatre', capacity: 50 }], setupMinutes: 60, teardownMinutes: 30, comboOf: [], verified: false, demo: true },
    ],
    resources: [{ ...id('30'), name: 'Shared projector · demo', quantity: 1, verified: false, demo: true }],
    enquiries: [], quotes: [], events: [], subEvents: [], allocations: [], blocks: [], rooming: [], guests: [], companies: [],
    products: [
      { ...id('40'), name: 'Room night · demo', category: 'accommodation', unitPesewas: 45000, description: 'Illustrative accounting product', demo: true },
      { ...id('41'), name: 'Venue hire · demo', category: 'venue', unitPesewas: 200000, description: 'Illustrative accounting product', demo: true },
      { ...id('42'), name: 'Catering per guest · demo', category: 'catering', unitPesewas: 8500, description: 'Illustrative accounting product', demo: true },
      { ...id('43'), name: 'AV package · demo', category: 'av', unitPesewas: 50000, description: 'Illustrative accounting product', demo: true },
    ],
    packages: [
      { ...id('50'), name: 'Venue only', description: 'Start with the space. Add services as your plans take shape.', productIds: [id('41').id], demo: true },
      { ...id('51'), name: 'Gather & dine', description: 'A coordinated venue and catering enquiry.', productIds: [id('41').id, id('42').id], demo: true },
      { ...id('52'), name: 'Celebrate & stay', description: 'An event and room-block enquiry, coordinated together.', productIds: [id('41').id, id('42').id, id('40').id], demo: true },
    ],
    payments: [], webhooks: [], refunds: [], folios: [], folioLines: [], invoices: [], sheets: [], tasks: [], messages: [], audit: [], receipts: [],
    content: [
      ['address', 'Exact address & map pin', 'Location', ''], ['phone', 'Public telephone', 'Contact', ''], ['whatsapp', 'Verified WhatsApp number', 'Contact', ''], ['email', 'Public email address', 'Contact', ''],
      ['response', 'Enquiry response commitment', 'Contact', ''], ['rooms', 'Room inventory, bedding & amenities', 'Property', ''], ['rates', 'Published GHS rates & inclusions', 'Property', ''], ['capacity', 'Space capacities by layout', 'Property', ''],
      ['access', 'Step-free access & accessible facilities', 'Operations', ''], ['parking', 'Parking arrangements', 'Operations', ''], ['power', 'Backup power & water plan', 'Operations', ''], ['network', 'Wi-Fi and mobile network tests', 'Operations', ''],
      ['rain', 'Weather / rain plan', 'Operations', ''], ['noise', 'Sound and noise curfew', 'Operations', ''], ['directions', 'Tested directions & drive times', 'Location', ''], ['photos', 'Approved property photography', 'Content', ''],
      ['reviews', 'Permissioned, verified guest reviews', 'Content', ''], ['policies', 'Cancellation, deposit & privacy policies', 'Policies', ''], ['tax', 'GRA registration & tax treatment', 'Finance', ''], ['license', 'GTA licence and grading', 'Compliance', ''],
      ['dpc', 'Data Protection Commission registration', 'Compliance', ''], ['payments', 'Merchant networks, settlement & webhook terms', 'Finance', ''],
    ].map(([key, label, group, value], i) => ({ ...id(`100${i}`), key, label, group, value, verified: false, evidence: '', updatedAt: now.toISOString() })),
  };
  const examples = [
    { name: 'Ama Mensah', type: 'Wedding', offset: 10, guests: 64, rooms: 4, space: '20', setup: 'Banquet', status: 'new' as const },
    { name: 'Kofi Asante', type: 'Family stay', offset: 1, guests: 2, rooms: 1, space: '', setup: '', status: 'new' as const },
    { name: 'Akosua Boateng', type: 'Team retreat', offset: 5, guests: 20, rooms: 3, space: '21', setup: 'Boardroom', status: 'reviewing' as const },
    { name: 'Yaw Owusu', type: 'Birthday', offset: 16, guests: 45, rooms: 0, space: '20', setup: 'Reception', status: 'quoted' as const },
  ];
  examples.forEach((x, i) => {
    const enquiry: EventInquiry = { ...id(`200${i}`), reference: `KD-DEMO-${101 + i}`, kind: x.space ? 'event' : 'stay', eventType: x.type, name: x.name, email: `guest${i + 1}@example.invalid`, phone: 'Not collected · demo', start: dayOffset(x.offset, now), end: dayOffset(x.offset + (x.space ? 0 : 2), now), startTime: '10:00', endTime: '16:00', guests: x.guests, rooms: x.rooms, roomTypeId: x.rooms ? id('10').id : undefined, spaceId: x.space ? id(x.space).id : undefined, setup: x.setup || undefined, resourceIds: x.space === '21' ? [id('30').id] : [], notes: 'Fictional example for workflow testing. No real guest information.', status: x.status, consent: true, createdAt: now.toISOString(), owner: i % 2 ? 'Front desk' : 'Events team', demo: true };
    state.enquiries.push(enquiry);
    state.tasks.push({ ...id(`300${i}`), title: [`Review wedding requirements`, 'Confirm arrival details', 'Check retreat setup', 'Follow up on proposal'][i], description: 'Illustrative staff task — not a real operational commitment.', owner: enquiry.owner, dueAt: `${today}T${10 + i}:00:00Z`, status: i === 2 ? 'in_progress' : 'open', priority: i === 0 ? 'high' : 'normal', enquiryId: enquiry.id, demo: true });
    if (x.status === 'quoted') {
      const lines = [{ id: id('4000').id, description: 'Venue hire · illustrative', category: 'venue' as const, quantity: 1, unitPesewas: 200000 }, { id: id('4001').id, description: 'Catering · illustrative', category: 'catering' as const, quantity: x.guests, unitPesewas: 8500 }];
      const totals = quoteTotals(lines);
      const qid = id('5000').id;
      const quote: QuoteVersion = { ...id('5000'), enquiryId: enquiry.id, version: 1, status: 'approved', lines, ...totals, inclusions: 'Illustrative venue and catering only. Not a real offer.', exclusions: 'Accommodation, transport and equipment not listed.', cancellationTerms: 'DEMO TERMS ONLY. The property must approve cancellation and refund terms before publication.', expiresAt: dayOffset(3, now) + 'T23:59:59Z', depositPercent: 30, deposits: [{ ...id('6000'), quoteId: qid, label: 'Initial deposit', amountPesewas: Math.round(totals.totalPesewas * .3), dueAt: dayOffset(2, now) + 'T17:00:00Z', state: 'due' }], createdAt: now.toISOString(), createdBy: 'Events team', approvedBy: 'Demo manager', demo: true };
      state.quotes.push(quote);
    }
  });
  state.tasks.push({ ...id('3100'), title: 'Verify property facts before launch', description: 'Collect evidence for every placeholder in Content studio. Do not publish unverified claims.', owner: 'General manager', dueAt: `${today}T17:00:00Z`, status: 'open', priority: 'high', demo: true });
  state.audit.push({ ...id('9000'), actorId: 'demo-seed', actorName: 'Demo initializer', action: 'demo.initialized', entityType: 'Property', entityId: state.properties[0].id, before: null, after: { label: 'Fictional demonstration records', verified: false }, reason: 'Initialize explicitly labeled sample workspace', at: now.toISOString() });
  // Build a complete, explicitly fictional confirmed example through the same guarded workflow.
  const actor: Actor = { id: 'demo-seed-manager', name: 'Demo manager', tenantId: s.tenantId, propertyIds: [s.propertyId], role: 'manager' as const };
  const finance = { ...actor, id: 'demo-seed-finance', name: 'Demo finance', role: 'finance' as const };
  let example: DomainState = state;
  let seedSequence = 0;
  const run = (name: Parameters<typeof execute>[3]['name'], payload: Record<string, unknown>, who = actor) => {
    const result = execute(example, who, s, { name, payload, reason: 'Initialize fictional end-to-end demonstration', key: `seed-${name}-${payload.enquiryId || payload.id || 'example'}` }, { demo: true, now: now.toISOString(), idFactory: () => `20000000-0001-4000-8000-${String(++seedSequence).padStart(12,'0')}` });
    example = result.state; return result.resultId;
  };
  const enquiryId = run('enquiry.create', { kind: 'event', eventType: 'Family celebration', name: 'Efua Addo', email: 'efua@example.invalid', phone: 'Fictional demo contact', start: dayOffset(2, now), end: dayOffset(4, now), startTime: '12:00', endTime: '18:00', guests: 30, rooms: 2, roomTypeId: id('10').id, spaceId: id('20').id, setup: 'Banquet', resourceIds: [], notes: 'Fictional confirmed workflow example. No real event or guest.', consent: true });
  run('hold.create', { enquiryId, minutes: 120 });
  const quoteId = run('quote.create', { enquiryId, lines: [{ description: 'Garden canopy hire · demo', category: 'venue', quantity: 1, unitPesewas: 200000 }, { description: 'Catering · demo', category: 'catering', quantity: 30, unitPesewas: 8500 }, { description: 'Room nights · demo', category: 'accommodation', quantity: 4, unitPesewas: 45000 }], inclusions: 'Fictional venue, catering and two rooms for two nights.', exclusions: 'No real services are included. Demo only.', cancellationTerms: 'DEMO ONLY — no real cancellation contract. Property terms require approval.', expiresAt: dayOffset(1, now) + 'T17:00:00Z', depositPercent: 30 });
  run('quote.submit', { id: quoteId }); run('quote.approve', { id: quoteId }); run('quote.accept', { id: quoteId, name: 'Efua Addo', consent: true });
  const deposit = example.quotes.find(q => q.id === quoteId)!.deposits[0];
  const paymentId = run('payment.create', { enquiryId, depositId: deposit.id, amountPesewas: deposit.amountPesewas, purpose: 'Initial demo deposit', provider: 'demo' }, finance);
  run('payment.simulate', { id: paymentId, outcome: 'success' }, finance);
  run('event.confirm', { enquiryId });
  const block = example.blocks.find(b => b.enquiryId === enquiryId)!;
  run('rooming.save', { enquiryId, blockId: block.id, name: 'Efua Addo', email: 'efua@example.invalid', arrivalTime: '11:00', notes: 'Fictional guest' });
  const failedId = run('payment.create', { enquiryId: state.enquiries[0].id, amountPesewas: 50000, purpose: 'Illustrative failed authorization', provider: 'demo' }, finance);
  run('payment.simulate', { id: failedId, outcome: 'failed' }, finance);
  example.audit.forEach(a => { if (a.actorId.startsWith('demo-seed')) a.reason = 'Fictional seed example — not a real operational action'; });
  return example;
}
