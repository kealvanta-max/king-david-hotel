# King David Event and Guesthouse
## Architecture & Experience Brief

**Decision document · 11 November 2026**

> **Scope note.** This brief synthesizes the six supplied research packets. It distinguishes verified source-backed facts from design recommendations and hypotheses. Property-specific claims—coordinates, room count, capacity, rates, amenities, network quality, power/water reliability, reviews and current licensing status—must be verified before publication.

---

## 1. Executive summary

King David should be built as a **mobile-first, Ghana-ready guesthouse and events operating system**, not as a brochure site connected to a booking form. Its core commercial promise is one accountable journey from enquiry to stay or event: discover the place, check availability, receive a clear quote, pay a deposit, complete a rooming list, run the event from a function sheet, and close the folio with an accurate receipt.

The product should serve two connected businesses:

1. **Guesthouse:** direct room discovery, availability, booking, payment, pre-arrival communication, check-in, stay support and checkout.
2. **Events:** weddings, private celebrations, meetings, retreats and room-blocked group stays, with enquiry, quote, acceptance, deposits, space/resource allocation, catering/AV, operational run sheets and invoicing.

The recommended technical starting point is a **modular monolith with independently scalable processes**: Next.js and TypeScript for the public site, guest portal and operator console; NestJS and TypeScript for the API; PostgreSQL as the authoritative system of record; Redis and BullMQ for cache, coordination and asynchronous work; S3-compatible object storage plus CDN for media and documents; and OpenTelemetry for observability. This keeps contracts, types and queue work coherent while avoiding premature microservice sprawl. [1]

The operating model must have **one canonical inventory ledger** for rooms, function spaces and shared resources. A tentative enquiry must not silently consume sellable inventory. A confirmed event or room block must reserve inventory transactionally, support hold expiry and release rules, and prevent double allocation under concurrent edits. Room blocks need pickup, cutoff/release, deduct/non-deduct behavior and conversion to named reservations. Event quotes need versioning, taxes, deposit milestones, cancellation terms, digital acceptance and audit history. These are the control concepts documented across OPERA Cloud, Mews Events and RoomRaccoon, adapted here as acceptance criteria rather than claims that every vendor implements them identically. [2]

Ghana readiness is a launch gate, not a later enhancement. Price in GHS; support MTN MoMo, Telecel and AirtelTigo/AT Money where the selected gateway and merchant account support them; retain bank transfer and card options; and treat payment as asynchronous and verifiable. A current Ghana-focused option is Hubtel, subject to confirming webhook authentication, refund behavior, settlement terms and account eligibility. Paystack is a strong alternative with clearer public documentation for asynchronous Ghana MoMo authorization, signed success webhooks, verification and refunds. Flutterwave is relevant where international cards matter, but its documented network labels require current production confirmation. [3]

For tax and compliance, configure GRA’s documented **15% VAT + 2.5% NHIL + 2.5% GETFund Levy = 20% effective addition** for VAT-registered supplies, with separate invoice lines. The 1% COVID-19 Health Recovery Levy was abolished. Do not add a tourism levy until its current applicability, base and remittance process are confirmed in writing. Maintain GTA licensing/grading, DPC registration and privacy controls, processor contracts, breach procedures and the applicable PCI responsibility matrix. [3]

The experience should feel like **quiet coastal Ghanaian hospitality**: deep forest green, ivory, warm tan, restrained gold and natural daylight; editorial serif headlines with a practical neutral sans; real images of the property and Gomoa rather than generic luxury imagery; and generous space with clear booking paths. The supplied poster supports the visible cues of a warm tan two-storey building, dark pitched roof, landscaped green approach, comfortable rooms, white-canopy events, formal serif branding, crown motif, forest green/cream/gold palette and the line “Your Comfort • Our Priority.” It does not verify capacity, room count, site address or every pictured facility. [5][6]

Delivery should proceed in thin, testable slices: first establish the authoritative domain model and inventory/payment controls; then launch a fast, accessible marketing and enquiry experience; then add direct booking, event quoting, rooming lists, operator command center, guest portal and integrations. Reliability at the property—backup power, connectivity, offline contact/check-in procedures and reconciliation—matters as much as cloud architecture. National connectivity and mobile-money statistics support a mobile-first, MoMo-capable strategy but do not guarantee service quality at the site. [5]

---

## 2. Product thesis and operating principles

### 2.1 The product thesis

**Make every stay or event feel personally coordinated, while making every operational commitment explicit and auditable.**

King David should not present “luxury” as ornament. It should express premium value through calmness, truthful information, response reliability, clean handoffs and the confidence that a room, venue, resource, payment and promise will be there when expected.

### 2.2 Non-negotiable principles

- **One source of truth:** PostgreSQL and the PMS/EMS domain own inventory and financial state; Redis is never authoritative for bookings or money. [1]
- **One inventory ledger:** rooms, spaces, setup/teardown buffers and shared resources are checked together before confirmation.
- **Quote before commitment:** negotiated event rates and inclusions are versioned and frozen at acceptance; transient room pricing may remain dynamic until booking. [2]
- **Human approval at risk boundaries:** staff approve capacity exceptions, unusual discounts, negotiated rates, final space confirmation and financial overrides.
- **Mobile-first, low-friction, low-bandwidth:** English and GHS by default, thumb-reachable actions, compressed media, resilient forms and clear fallback contact channels. [4][5]
- **Truth over atmosphere:** publish only verified amenities, capacity, directions, policies, reviews and visual evidence.
- **Auditable by default:** actor, timestamp, prior value, new value and reason for changes to inventory, price, quote, payment, folio routing and permissions.
- **Privacy and least privilege:** collect only what is needed, restrict by tenant/property/role, redact sensitive telemetry and retain data according to an approved schedule. [1][3]

---

## 3. Recommended stack and architecture

### 3.1 Baseline stack

| Layer | Recommendation | Role |
|---|---|---|
| Public web, guest portal, operator UI | Next.js + TypeScript | Server-rendered/public pages, authenticated workflows, accessible responsive UI |
| API and domain services | NestJS + TypeScript | Versioned REST/OpenAPI API, authorization, transactions, integration adapters |
| Background processing | BullMQ + Redis | Confirmations, reminders, media processing, reconciliation, reporting, webhook retries |
| System of record | Managed PostgreSQL | Tenant/property data, inventory, bookings, quotes, payments metadata, folios, users, audit records |
| Media/documents | S3-compatible object storage + CDN | Photos, signed quotes, invoices, function sheets; direct bounded upload/download via presigned URLs |
| Observability | OpenTelemetry + managed collector/backend | Traces, metrics and logs across requests, jobs, DB calls and payment operations |
| Packaging | pnpm/Turborepo-style monorepo | Shared types, UI, auth policy, OpenAPI client, schema/migrations |
| Runtime | Managed containers initially; Kubernetes when justified | Immutable deploys, health probes, horizontal scaling, isolation and controlled operations |

Next.js documents TypeScript support, the App Router setup and separate production build/start commands. NestJS documents BullMQ/Redis queues for smoothing peaks, moving heavy work out of user-facing processes and supporting distributed producers/consumers. [1]

### 3.2 Start as a modular monolith, not a microservice maze

Deploy these processes from one repository, with clear module boundaries and independent scaling:

- `apps/web`: public site, booking flow, guest portal and operator console.
- `apps/api`: identity, tenancy, inventory, rooms, events, quotes, payments, folios, content and reporting APIs.
- `apps/worker`: notifications, webhook processing, document generation, reconciliation, reminders and media jobs.
- `packages/db`: schema, migrations, transaction helpers and generated types.
- `packages/contracts`: versioned OpenAPI schemas and generated clients.
- `packages/ui`: small, accessible component library.
- `packages/policy`: role, tenant/property scope and authorization predicates.
- `packages/config`: validated environment and feature configuration.

Split a bounded service out only when measured load, isolation, Python-specific analytics/ML, a vendor constraint or team ownership makes the second runtime worth its cost. FastAPI is a reasonable bounded Python service when that condition is real; it should not be added as the primary API merely by preference. [1]

### 3.3 Data and tenancy controls

Every tenant-owned table carries `tenant_id`; property-owned records also carry `property_id` where relevant. Enforce authorization in the application and reinforce it with PostgreSQL Row-Level Security. PostgreSQL documents default-deny behavior when RLS is enabled without an applicable policy, but owners, superusers and `BYPASSRLS` roles can bypass policies; integration tests must exercise those cases and privileged roles must be narrowly designed. [1]

Use explicit PostgreSQL transactions, row locking and uniqueness/exclusion constraints for room, space and resource allocation. Require idempotency keys for booking, quote acceptance, payment initiation, refund and webhook mutation endpoints. Use an outbox or equivalent durable event publication pattern so a committed booking cannot silently lose its confirmation or downstream task.

Redis is for disposable cache, rate limiting, short-lived coordination and queue state. Its persistence documentation describes RDB snapshots, AOF, no-persistence cache use and associated loss tradeoffs; it must not replace PostgreSQL as booking or payment truth. [1]

### 3.4 Security and operational baseline

- TLS everywhere; hosted card collection or validated P2PE so raw PAN does not enter King David systems.
- Secret manager or sealed/external-secret workflow; never Git or container images.
- MFA for staff, least-privilege roles, short-lived sessions and device/session revocation.
- Kubernetes service accounts, Roles and RoleBindings only where Kubernetes is used; namespace and cluster scope must be explicit. [1]
- Network policies, non-root containers where feasible, dependency/image scanning and immutable builds.
- Correlation IDs and OpenTelemetry spans for API requests, DB calls, jobs and payment operations; redact tokens, payment data and unnecessary personal data. [1]
- Presigned object-storage URLs for bounded direct media transfer rather than routing large files through API pods. [1]
- Backups, restore tests, queue dead-letter handling, provider timeout/retry/circuit-breaker policies and staged/canary releases.

### 3.5 Minimum non-functional targets

Set final SLOs after discovery, but define these launch gates:

- No confirmed double booking in concurrency and failure-mode tests.
- Every money-changing mutation is idempotent and reconciliable.
- RPO/RTO documented, monitored and proven by restore drill.
- Payment webhook delay, duplicate, out-of-order and provider outage paths tested.
- Core Web Vitals field targets: LCP ≤ 2.5s, INP ≤ 200ms and CLS ≤ 0.1 at the 75th percentile. [4]
- Keyboard, screen-reader, focus, contrast, reduced-motion and mobile-network tests pass before launch.

---

## 4. Core PMS and event workflows

### 4.1 Canonical domain model

**Property** → room types → sellable room inventory → reservations/rooming-list entries.

**Property** → function spaces → capacities, setup styles, rental codes, location, combo/alternate spaces and buffers.

**Event inquiry/opportunity** → quote/proposal versions → acceptance/e-signature → event and sub-events → function sheet/run sheet.

**Room block/allotment** → dates, room types, allocation, pickup, cutoff/release, deduct/non-deduct status → named reservations.

**Event products** → venue, catering/F&B, AV, equipment, staffing and other services.

**Guest/booker/company profile** → reservations, event, consent and communications.

**Folio/posting master** → line items, revenue categories, split bills, group/consolidated statement, invoice/receipt.

**Payment request/deposit** → gateway transaction, status lifecycle, refund, reconciliation and exception queue.

**Operational trace/task** → owner, due time, status, escalation and audit history.

### 4.2 Inquiry to cash

1. **Enquiry:** capture dates, event type, estimated attendance, room need, contact, channel and consent.
2. **Availability check:** check rooms, spaces, setup/teardown buffers, shared equipment and conflicting events.
3. **Temporary hold:** create a time-bound hold that is visible but not yet a confirmed sale; expiry releases inventory automatically.
4. **Quote:** versioned event/room options, inclusions, exclusions, taxes, service-charge treatment if approved, cancellation terms, deposit schedule and expiry date.
5. **Approval:** human approval for exceptions, negotiated rates, unusual discounts, capacity or operational risk.
6. **Acceptance:** digital acceptance/e-signature creates an immutable accepted version and records actor/time.
7. **Deposit:** create a payment request; confirmation depends on verified provider state, not browser redirect.
8. **Confirmation:** reserve event space and room block; allocate products/resources; publish tasks and confirmation message.
9. **Rooming list:** send a self-fill link or import named reservations; pickup decrements the block before general house availability.
10. **Pre-arrival:** reminders, directions, arrival instructions, add-on confirmation, consent and delivery log.
11. **Operations:** generate function sheet from the confirmed event version; manage changes as controlled revisions.
12. **Event/stay:** post room, venue, catering, AV and other charges to correct folios; handle split bills and group master.
13. **Close:** issue itemized invoice/receipt, reconcile payment/gateway/bank records, collect feedback and generate post-event report.

### 4.3 Room inventory rules

- Room type, date range, rate plan, allocation, pickup, cutoff/release and deduct/non-deduct status are first-class fields.
- A room block is not merely a note; it changes availability according to its status and policy.
- Named reservations consume block pickup before general house inventory.
- Cancellation, loss, expiry and block release return inventory according to the recorded rule.
- Transient rate plans may use demand/occupancy controls, but accepted negotiated group/event rates are frozen or explicitly versioned.
- The availability calendar shows room type, block, pickup, remaining allocation, rate and exception status.

### 4.4 Event-space and resource rules

- Check overlapping event time plus setup and teardown buffers.
- Check capacity against selected layout, not merely a raw venue maximum.
- Model combo spaces, alternate/back-up spaces and shared resources such as AV, furniture and staff.
- Distinguish enquiry, hold, quoted, accepted, confirmed, in-progress, completed, cancelled and lost states.
- Produce a printable/mobile function sheet containing timing, space, setup, attendance, products, notes, owner and last approved version.
- Record production changes with actor, timestamp, reason and operational acknowledgement.

### 4.5 Folios, deposits and invoices

- Separate individual folios, room-only folios, event folios and group/posting master.
- Route each line to a revenue category: accommodation, venue hire, catering/F&B, AV/equipment, staffing, transfer or approved fee.
- Support deposits, instalments, due/received/overdue states, partial/full refunds and cancellation consequences.
- Show tax lines and payment status consistently in quote, checkout, folio and invoice.
- Never mark “paid” from a client-side redirect; use authenticated webhook or server-side verification and reconciliation.

### 4.6 Role-aware operational views

- **Front desk:** arrivals, departures, room status, payment exceptions, late arrivals and guest contact.
- **Events coordinator:** enquiry pipeline, quote expiry, approvals, room blocks, pickup, function diary and client communications.
- **Operations/F&B/AV:** today’s function sheets, setup/teardown, products, dietary/production notes and task ownership.
- **Finance:** deposits, instalments, overdue amounts, folios, refunds, gateway/bank reconciliation and tax exports.
- **General manager:** occupancy, event pipeline, revenue by category, incidents, service recovery and audit trail.
- **Administrator:** users, roles, property configuration, products, tax settings, templates and integration health.

---

## 5. Ghana payment, tax and compliance strategy

### 5.1 Recommended payment posture

Use a payment abstraction in the platform so gateway choice is configurable per property and transaction type. At launch, evaluate **Hubtel as the primary Ghana-local option** if its current contract confirms webhook authentication/signatures, refund semantics, settlement, reporting and account eligibility. Hubtel’s public material covers MTN Mobile Money, Telecel Cash, AT Money, cards, GHQR and BankPay and publishes example fees, but the reviewed sources do not establish all operational controls. [3]

Keep **Paystack** as the strongest documented alternative: its Ghana MoMo flow is asynchronous, may return `pay_offline`, gives the customer a limited authorization window, and requires reliance on a signed `charge.success` webhook plus verification if needed. It documents full/partial refunds and refund status webhooks, while public review did not establish Ghana settlement timing or pricing. [3]

Consider **Flutterwave** where international-card acceptance and its published Ghana settlement/refund windows matter. Require current written confirmation of Telecel and AirtelTigo/AT network codes because the API documentation reviewed used legacy labels such as VODAFONE and AIRTEL. A redirect URL is not proof of payment. [3]

### 5.2 Payment state machine

`created → pending_customer_authorization → provider_confirmed → reconciled → partially_refunded/refunded`.

Exceptional states: `expired`, `failed`, `verification_required`, `provider_timeout`, `duplicate_event`, `manual_review`, `chargeback/dispute`.

Persist: internal order/booking ID, provider name, provider transaction reference, amount, currency, requested purpose, status history, webhook receipt IDs, verification result, refund references and reconciliation batch. Never store raw card data.

Run live-value tests on MTN, Telecel and AirtelTigo/AT Money where available: timeout, duplicate webhook, out-of-order webhook, delayed success, failed authorization, partial refund, full refund and settlement matching.

### 5.3 VAT, invoices and tourism levy caveat

For VAT-registered supplies under the cited 2026 GRA guidance, configure:

- VAT: 15%
- NHIL: 2.5%
- GETFund Levy: 2.5%
- Effective addition on the same supply value: 20%

Issue separate lines as required; hotel/restaurant receipts are expressly included in the cited guidance. The former 1% COVID-19 Health Recovery Levy was abolished. GRA’s E-VAT supports online/offline electronic receipts with QR code, timestamp and serial/machine information. Returns/payment are due by the last working day of the following month. Registration status and threshold treatment for mixed accommodation, events and food must be confirmed with GRA/accountant; do not assume one threshold applies to every supply. [3]

Do **not** add a “tourism levy” line based solely on the older 1% Tourism Development Fund reference. The reviewed material did not establish a current 2026 rate, base, remittance process or applicability to this property. Obtain written GTA/GRA/counsel confirmation first. A service charge is not established as a tax by the sources; if used, label it separately, disclose whether optional/mandatory and how it is distributed, then obtain tax/payroll advice. [3]

### 5.4 Privacy, licensing and PCI

- Maintain GTA accommodation licensing/grading; guest houses and budget facilities are included in GTA’s licensing/grading framework. [3][5]
- Register with Ghana’s Data Protection Commission as applicable; use purpose limitation, retention/deletion rules, role-based access, processor contracts/DPAs and a breach-response register. The cited Act 843 materials require reasonable technical and organizational safeguards and prompt notification of suspected unauthorized access/acquisition. [3]
- Publish a plain-language privacy notice covering guest, attendee, staff, payment metadata, communications and vendors.
- Use hosted checkout/tokenized gateway or validated P2PE; prohibit staff from recording card numbers; segment POS/admin systems; complete the gateway/acquirer’s applicable SAQ and responsibility matrix. Hosted collection reduces exposure but does not automatically eliminate PCI obligations. [3]

---

## 6. Website, admin command center and guest portal

### 6.1 Public website requirements

**Primary navigation:** Rooms/Stay · Events · Experiences · Location · Contact · persistent Book/Check availability.

**Homepage first screen must answer:** What is King David? Where is it? What can guests/events do here? How do I check dates or enquire?

Required sections:

- Clear positioning for stay, wedding/private event and corporate/retreat use cases.
- Real rooms, grounds, event setup and people photography; no unverified amenities or capacities.
- Room cards with occupancy, inclusions, photos, rate basis, availability action and policy summary.
- Event packages with venue-only, venue + catering and full event + room-block tiers, but only with verified inclusions and capacities.
- Weather/rain plan, power/connectivity plan, washrooms, parking, sound/noise rules and access details once verified.
- Location with verified Google Maps pin, landmark directions, arrival photos, recommended vehicle type and realistic drive-time ranges only after route testing.
- Visible phone/WhatsApp/email, response expectation, secure-payment explanation, policies and review/testimonial proof.
- GHS pricing or clear “request a quote”; tax/fees/inclusions disclosed before commitment.
- Accessible, fast, responsive media: `srcset/sizes`, modern formats, reserved dimensions, poster images, lazy loading below fold, preload only the true hero and minimal third-party scripts. [4]

### 6.2 Booking and enquiry UX

- Compact date/guest selector; guest checkout; preserve entered data.
- Keep a visible summary through confirmation.
- Show currency, taxes/fees, inclusions, cancellation/deposit terms and payment methods before commitment.
- Make phone/WhatsApp enquiry a real fallback, not a decorative icon.
- Clear field labels, inline errors, keyboard flow and no surprise account creation.
- Mobile primary action remains thumb-reachable without covering content.
- Confirmation includes reference, payment state, next step, contact route and downloadable receipt/quote where applicable.

### 6.3 Admin command center

The home screen should answer: **What needs attention today, what is at risk, and who owns the next action?**

Widgets and work queues:

- Today/tomorrow arrivals, departures, room status and late arrivals.
- Event diary by space, setup, teardown, team and status.
- Enquiries awaiting response; quote expiry; deposit due/overdue; rooming-list completion.
- Availability and conflict alerts across rooms, spaces and shared resources.
- Payment exceptions: pending MoMo, failed, verification-required, refund, unmatched settlement.
- Function-sheet changes awaiting acknowledgement.
- Tasks by owner, due time, escalation and incident state.
- Revenue/occupancy/event pipeline with filters by date, channel, segment and category.
- Audit viewer for changes to inventory, rates, quotes, payments, folios and permissions.

Design for poor connectivity: optimistic local draft state where safe, explicit sync status, retryable actions, printable/exportable function sheets and a manual fallback procedure. Never fake success when the server state is unknown.

### 6.4 Guest portal

For a confirmed reservation/event:

- Booking/quote summary and current payment status.
- Deposit/instalment requests and receipts.
- Rooming-list self-fill or named reservation management.
- Arrival directions, contact, check-in details and late-arrival instructions.
- Add-ons: catering selections, room upgrades, AV or transfers, subject to availability and approval.
- Event schedule, guest-facing logistics and downloadable documents.
- Update contact/consent details; show privacy and cancellation terms.
- Secure, expiring links or authenticated account; never expose another guest’s data.

---

## 7. Quiet-luxury visual and content language

### 7.1 Positioning

Name the system **Quiet Coastal Ghanaian Hospitality**. It should feel composed, tactile and local: a place of shade, garden, warm walls, clean rooms, white-canopy celebration and dependable hosting. The Gomoa context supports a calm, green, locally rooted retreat hypothesis; it does not itself establish visitor demand or specific site features. [5]

### 7.2 Palette and type

- **Deep forest green:** primary brand/nav/anchor color, drawn from the supplied visual.
- **Warm ivory/cream:** page surfaces and quiet space.
- **Warm tan/earth neutral:** architecture and material cue.
- **Restrained antique gold:** rules, small labels, icons and active states—not body text or low-contrast text.
- **Sky blue:** supporting image-derived accent only.
- **Near-black charcoal:** readable text and navigation contrast.

Pair one editorial serif for short place-led headlines with a neutral sans for navigation, prices, labels and body copy. Reserve italic/script for brief celebratory phrases only; never use it for instructions or dense content. Validate every pairing against WCAG 2.2 contrast requirements: 4.5:1 normal text, 3:1 large text, keyboard focus and at least 24×24 CSS-pixel targets at Level AA, with comfortable larger targets in practice. [4]

### 7.3 Layout, photography and motion

Use a simple header, generous whitespace, alternating image/text/space sections and a restrained editorial rhythm. Let one verified hero image establish mood; do not force a full-screen video before the value proposition. Use horizontal galleries and short muted video only when they add evidence or orientation.

The supplied poster visibly supports: warm tan/peach two-storey building, dark pitched roof, palms/hedges, paved approach, green lawn, warm interior vignette, white event canopies, formal serif wordmark, crown marker, “Stay. Relax. Celebrate.” and visible service cues including comfortable rooms, free Wi-Fi, secure parking and event space/hall. Treat these as visual/source observations, not a verified inventory or capacity statement. [6]

Commission or capture a coherent set: arrival, grounds, rooms, food, ceremony/reception setup, people at human scale, details, night lighting and practical access. Avoid stock sunsets, AI-generated people or architecture, repetitive hero images and generic adjectives such as “world-class” unless independently substantiated.

Motion is limited to fades, crossfades and subtle orientation reveals. No autoplay audio, scroll-jacking, heavy parallax or animation on every card. Honor `prefers-reduced-motion`; non-essential interaction animation must be disableable. [4]

### 7.4 Content voice

Warm, specific and calm. Say what is known, what is included, where it is, how to arrive, when a response will come and what happens next. Replace “unforgettable luxury” with concrete proof: a named room type, a confirmed package inclusion, a verified route, a response time or an itemized invoice.

---

## 8. Security, reliability and delivery priorities

### P0 — before any real booking or payment

1. Verify property facts: exact address/coordinates, rooms, room types, venue capacities, layouts, facilities, rates, policies, power/water, connectivity, parking and licensing.
2. Establish tenant/property authorization and cross-tenant test suite.
3. Implement transactional inventory ledger and concurrency tests.
4. Implement payment abstraction, webhook authentication, idempotency, verification and reconciliation.
5. Configure GHS, GRA tax lines and invoice data model; obtain accountant/legal confirmation.
6. Adopt hosted card checkout/P2PE posture and privacy/processor documentation.
7. Set backup, restore, incident, breach and provider-outage procedures.
8. Test site-level MTN/Telecel/AT connectivity, Wi-Fi, backup power, water and offline check-in/contact process.

### P1 — operational launch

1. Public site, enquiry pipeline, admin calendar and quote/deposit workflow.
2. Room blocks, rooming-list link, pickup/cutoff/release and function sheets.
3. Guest portal with arrival instructions, payment status and receipts.
4. Automated confirmations/reminders with consent and delivery logs.
5. Role-based dashboards, audit history, reconciliation queue and exports.
6. Performance/accessibility/mobile-network acceptance testing.

### P2 — optimization

1. Direct room inventory sync with selected PMS/channel systems where justified.
2. Reporting projections/read replicas only after measurement.
3. Revenue-management controls for transient inventory, kept separate from accepted event contracts.
4. CRM/WhatsApp/SMS enhancements after consent and delivery reliability are proven.
5. Advanced analytics, segmentation and experimentation.

### Delivery sequence

**Weeks 1–2: discovery and verification.** Site audit, stakeholder interviews, competitor mystery shopping, vendor/payment procurement tests, content inventory and data/privacy decisions.

**Weeks 3–5: domain and control plane.** Schema, tenancy/RLS, inventory transactions, roles, audit, payment abstraction, webhook handling, tax model and observability.

**Weeks 6–8: first operational slice.** Public site, enquiry, admin pipeline, room/space calendar, quote versions, deposits and confirmation.

**Weeks 9–11: stay/event operations.** Rooming lists, folios, function sheets, guest portal, reminders, reconciliation and exports.

**Weeks 12+: hardening and optimization.** Restore drill, concurrency/failure tests, accessibility/performance field testing, staff training, content verification and staged launch.

---

## 9. Validation plan and decision gates

Before finalizing capex, package design or published claims:

- Interview 8–12 recent wedding organizers/couples, 5–8 corporate/NGO/church administrators, 5 transport providers and relevant local tourism/assembly contacts.
- Mystery-shop comparable venues for deposit, weekday/weekend demand, package structure, rain plan, room blocks and arrival experience.
- Test actual drive times from major origin markets; publish only observed ranges.
- Test mobile networks, Wi-Fi, power backup, payment rails and POS/ATM assumptions on-site.
- Obtain written gateway terms, refund behavior, settlement SLA, webhook security and network eligibility.
- Obtain accountant/GRA/GTA/DPC/PCI guidance appropriate to the final legal and payment setup.
- Run procurement acceptance scenarios: simultaneous edits, hold expiry, cancellation release, block pickup, signed quote immutability, deposit failure, overdue reminders, split/group folios, add-on posting, printable function sheet and poor-connectivity recovery.

The Gomoa district and national Ghana figures are context, not a property demand forecast. The 2023 national guesthouse occupancy figure and visitor/payment statistics should guide questions, not justify untested revenue assumptions. [5]

---

## 10. Ready-to-copy Arena AI build prompt

```text
Build King David Event and Guesthouse as a production-minded, mobile-first Ghanaian hospitality and events platform. Do not generate a generic “luxury hotel” template, fake metrics, invented amenities, invented room counts, invented capacities, invented reviews, invented coordinates, invented prices, stock people, AI-generated architecture, or vague marketing copy. If a property fact is unknown, render a clearly labeled placeholder and expose it in an admin content editor; never silently make it up.

PRODUCT OUTCOME
Create one coherent system for:
1. Guesthouse rooms and direct bookings.
2. Weddings, birthdays, private parties, conferences, meetings, retreats and linked room blocks.
3. Enquiry → availability check → time-bound hold → versioned quote → human approval → digital acceptance → verified deposit → confirmed event/room block → rooming list → pre-arrival messages → function sheet → event/stay charges → split or consolidated invoice → reconciliation.

TECHNICAL BASELINE
Use a TypeScript monorepo with:
- Next.js + TypeScript for public website, guest portal and authenticated operator console.
- NestJS + TypeScript for versioned REST/OpenAPI API.
- PostgreSQL as the only authoritative source for tenants, properties, rooms, inventory, function spaces, resources, inquiries, quotes, reservations, room blocks, folios, payment metadata, users, roles and audit records.
- Redis + BullMQ only for cache, rate limiting, short-lived coordination and asynchronous jobs. Never use Redis as booking or payment truth.
- S3-compatible object storage + CDN for media/documents, with presigned upload/download URLs.
- OpenTelemetry instrumentation for HTTP requests, database calls, queue jobs and external payment operations; scrub tokens, card/payment data and unnecessary personal data.
- Organize code as apps/web, apps/api, apps/worker plus packages/db, packages/contracts, packages/ui, packages/policy and packages/config.

TENANCY, AUTHORIZATION AND DATA SAFETY
- Every tenant-owned table has tenant_id; property-owned tables also have property_id.
- Enforce application authorization and PostgreSQL Row-Level Security with default-deny behavior where appropriate.
- Test owners, superusers and BYPASSRLS roles explicitly; do not assume RLS alone is sufficient.
- Roles: owner/admin, general manager, front desk, events coordinator, operations/F&B/AV, finance and read-only.
- Scope every role by tenant and property.
- MFA for staff, session revocation, least privilege, audit logs and secrets outside Git/images.
- Audit actor, timestamp, old value, new value and reason for inventory, rates, quotes, payments, folios, permissions and configuration changes.

INVENTORY AND BOOKING RULES
- Build one canonical ledger covering sellable rooms, room types, function spaces, setup/teardown buffers and shared resources.
- Use PostgreSQL transactions, locking, uniqueness/exclusion constraints and idempotency keys to prevent double allocation.
- A tentative enquiry does not consume sellable inventory until a configurable hold/quote state.
- Holds expire automatically and release inventory.
- Confirmed events reserve space, resources and any room block.
- Room blocks support room type, date range, allocation, pickup, cutoff/release, deduct/non-deduct status and conversion to named reservations.
- Pickup decrements the block before general house availability.
- Cancellation/loss/release returns inventory according to policy.
- Event conflicts check time, setup/teardown buffers, capacity by setup style, combo/alternate spaces and shared resources.
- Separate transient dynamic room rates from signed event/group rates. Accepted event rates are frozen or explicitly versioned.

EVENT AND PMS DOMAIN
Include models and usable screens for Property, RoomType, RoomInventory, FunctionSpace, SetupStyle, Resource, EventInquiry, QuoteVersion, Event, SubEvent, RoomBlock, RoomingListEntry, GuestProfile, CompanyProfile, Product, Package, Deposit, PaymentRequest, PaymentTransaction, Folio, FolioLine, Invoice, FunctionSheet, Task, MessageDelivery and AuditEntry.

Quote versions must include event details, room options, products, packages/add-ons, taxes, approved service-charge treatment if configured, cancellation terms, deposit/instalment schedule, expiry, acceptance/e-signature state and immutable accepted version.

Function sheets must be generated from the confirmed event version and show timing, space, setup, attendance, products, notes, responsible team, change history and last acknowledgement.

FOLIOS AND FINANCE
- Support individual folios, room-only folios, event folios, split bills and group/posting master/consolidated statements.
- Route line items to accommodation, venue hire, catering/F&B, AV/equipment, staffing, transfer and approved fee categories.
- Track due/received/overdue deposits and instalments.
- Support partial/full refunds and visible refund status.
- Do not mark paid from a browser redirect; use authenticated webhook or server-side verification, then reconcile gateway/bank records.

GHANA PAYMENT AND TAX IMPLEMENTATION
- Default currency: GHS/GH¢.
- Create a provider adapter interface and make provider configurable.
- Initial providers to support through adapters: Hubtel, Paystack and Flutterwave, but do not claim feature parity until verified in the current merchant account.
- Support MTN MoMo, Telecel and AirtelTigo/AT Money where the selected account/provider supports them, plus cards and bank transfer.
- Payment state machine: created, pending_customer_authorization, provider_confirmed, verification_required, reconciled, failed, expired, manual_review, partially_refunded, refunded.
- Persist internal order ID, provider transaction reference, amount, currency, status history, webhook receipt ID, verification result, refund reference and reconciliation batch.
- Webhooks must be authenticated, idempotent, retry-safe and tolerant of duplicates/out-of-order delivery.
- Configure GRA invoice lines for VAT 15%, NHIL 2.5% and GETFund Levy 2.5% for VAT-registered supplies, subject to accountant/GRA confirmation. Do not add a tourism levy until current applicability and rate are confirmed. Keep any service charge as a separate configurable line and do not call it a tax.
- Keep raw card data out of the platform; use hosted checkout/tokenization or validated P2PE.

PUBLIC WEBSITE
Create a restrained, editorial, fast website with navigation: Rooms/Stay, Events, Experiences, Location, Contact and persistent Book/Check availability.
The first screen must answer what King David is, where it is, what guests/events can do there and how to check dates or enquire.
Use only verified property content. Unknown facts must display as editable placeholders in the CMS, not fictional copy.
Include room pages, event packages, enquiry forms, location/access, policies, payment explanation, response expectation, contact methods and verified reviews/testimonials only.
Use GHS or clearly labeled quote-request pricing. Show taxes/fees, inclusions and cancellation/deposit terms before commitment.
Use responsive srcset/sizes, modern compressed formats, reserved image dimensions, lazy loading below fold, minimal third-party scripts and field monitoring for LCP ≤2.5s, INP ≤200ms and CLS ≤0.1 at the 75th percentile.

GUEST PORTAL
For a reservation/event, show booking/quote summary, payment status, receipts, deposit requests, rooming-list self-fill, arrival directions, late-arrival instructions, add-ons, event logistics, downloadable documents, contact/consent controls, privacy and cancellation terms. Use secure expiring links or authenticated access and never expose another guest’s data.

ADMIN COMMAND CENTER
Make the home screen answer: what needs attention today, what is at risk and who owns the next action.
Include arrivals/departures, room status, event diary, setup/teardown, enquiry pipeline, quote expiry, deposit overdue, rooming-list completion, availability conflicts, payment exceptions, function-sheet changes, tasks, revenue/occupancy/event pipeline and a searchable audit viewer.
Support export/print of function sheets and explicit sync/retry status for weak connectivity. Never show a successful state when server state is unknown.

VISUAL DIRECTION: QUIET COASTAL GHANAIAN HOSPITALITY
Do not use a generic beige-and-gold luxury template.
Ground the system in the supplied King David poster and Gomoa context without inventing site facts:
- Deep forest green as primary brand/nav color.
- Warm ivory/cream surfaces.
- Warm tan/earth neutrals reflecting the visible building.
- Restrained antique gold for rules, icons and small labels only.
- Sky blue only as a supporting image-derived accent.
- Near-black charcoal for readable text.
- Editorial serif for short headlines; neutral sans for all practical UI, prices and body copy.
- Crown/regal cue may appear as a small secondary marker, never as a decorative overload.
- Use real property photography: landscaped approach, rooms, event setup, people, details, access and day-to-night atmosphere. No AI-generated people/architecture, stock sunsets or repeated fake hero imagery.
- Use generous whitespace, calm editorial rhythm and clear proof. Avoid oversized all-caps, excessive script, gradients, glassmorphism, neon, parallax, scroll-jacking, autoplay audio, cursor gimmicks and animation on every card.
- Motion limited to subtle fades/crossfades/reveals; honor prefers-reduced-motion and allow non-essential animation to be disabled.
- WCAG 2.2: contrast 4.5:1 normal text and 3:1 large text, visible keyboard focus, semantic headings, alt text, captions/transcripts, language metadata, no color-only meaning and comfortable touch targets at least 44px where practical.

CONTENT VOICE
Write warm, precise, locally grounded English. Use specific evidence and practical details. Do not use “world-class,” “unforgettable luxury,” “seamless experience,” “hidden gem,” or other unsupported generic claims. Every section must answer a guest question and identify its proof. If proof is missing, create an admin content task rather than inventing it.

DEMO DATA AND PLACEHOLDERS
Use clearly marked demo data only. Label all unverified fields: exact coordinates, room inventory, rates, capacity, amenities, drive times, licensing, reviews, power/water/connectivity and payment-provider availability. Never present demo data as live availability or real prices.

ACCEPTANCE TESTS
Implement automated and manual tests for:
1. Concurrent staff edits cannot double-book a room, space or shared resource.
2. Hold expiry and cancellation release inventory correctly.
3. Room-block pickup/cutoff/release and deduct/non-deduct behavior work.
4. Accepted quote is immutable/versioned; later changes require a new version and audit entry.
5. Deposit failure, timeout, duplicate webhook, delayed webhook, partial refund and reconciliation exception are visible and recoverable.
6. Room-only, event-only, split-bill and group-master folios post correctly.
7. Catering/AV/add-ons use correct revenue categories.
8. Function sheets render printable/mobile and reflect the confirmed version.
9. Rooming-list completion and pre-arrival messages record consent and delivery state.
10. Cross-tenant access tests fail closed.
11. Keyboard, screen-reader, reduced-motion, contrast, mid-range phone and constrained-network tests pass.
12. Backup restore and provider-outage runbooks are executable.

BUILD ORDER
1. Data model, tenant/property scope, RLS, roles, audit and inventory transaction tests.
2. Payment abstraction, webhook/idempotency/reconciliation paths and GHS/tax configuration.
3. Public website, content placeholders, enquiry and admin pipeline.
4. Quotes, approvals, deposits, room blocks, rooming lists and function sheets.
5. Guest portal, folios, invoices, notifications and exports.
6. Performance/accessibility/security hardening and staged launch.

The final result should look like a real, quiet, locally grounded guesthouse and events operation with strong controls—not a generic AI hotel landing page.
```

---

## References

[1] Technology and architecture sources: [Next.js installation](https://nextjs.org/docs/app/getting-started/installation); [NestJS queues](https://docs.nestjs.com/techniques/queues); [PostgreSQL Row-Level Security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html); [Redis persistence](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/); [Kubernetes RBAC](https://kubernetes.io/docs/reference/access-authn-authz/rbac/); [OpenTelemetry](https://opentelemetry.io/docs/); [Stripe security guide](https://docs.stripe.com/security/guide); [AWS S3 presigned URLs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html).

[2] PMS/event workflow sources: [Oracle OPERA Cloud room blocks](https://docs.oracle.com/en/industries/hospitality/opera-cloud/26.2/ocsuh/ch_blocks_intro.htm); [Oracle OPERA Cloud function spaces](https://docs.oracle.com/en/industries/hospitality/opera-cloud/26.1/ocsuh/t_osem_configuring_function_spaces_new.htm); [Oracle OPERA Cloud events](https://docs.oracle.com/en/industries/hospitality/opera-cloud/21.5/ocsuh/ch_osem_events.htm); [Mews Events](https://help.mews.com/s/article/Mews-Events); [Mews quotes](https://help.mews.com/s/article/how-to-create-quote-in-mews-events?language=en_US); [RoomRaccoon events](https://roomraccoon.com/platform/events-management-software/); [HotelTechReport RoomRaccoon group booking](https://hoteltechreport.com/news/roomraccoon-group-booking-solution).

[3] Ghana payments, tax and compliance sources: [GRA VAT](https://gra.gov.gh/domestic-tax/tax-types/vat/); [GRA E-VAT](https://gra.gov.gh/e-services/e-vat/); [Ghana Tourism Authority accommodation](https://ghana.travel/accommodation/); [GTA tourism report](https://ghana.travel/wp-content/uploads/2023/03/2020-TOURISM-REPORT-Final-min.pdf); [Paystack payment channels](https://paystack.com/docs/payments/payment-channels/); [Paystack refunds](https://paystack.com/docs/payments/refunds/); [Hubtel service fees](https://explore.hubtel.com/legal/service-fees/); [Hubtel developers](https://developers.hubtel.com/); [Flutterwave Ghana MoMo API](https://developer.flutterwave.com/reference/charge-via-ghana-mobile-money); [Flutterwave Ghana support](https://flutterwave.com/ug/support/general/heres-all-you-need-to-know-about-operating-a-flutterwave-account-in-ghana); [Ghana Data Protection Act 2012 (Act 843)](https://dataprotection.org.gh/wp-content/uploads/2025/05/data-protection-act-2012-act-843.pdf); [PCI Security Standards Council merchants](https://www.pcisecuritystandards.org/merchants/).

[4] UX, accessibility and performance sources: [Blastness hotel website trends](https://www.blastness.com/en/insights-hotel-business-development/8-trends-hotel-website); [Gourmet Marketing hotel website guidance](https://www.gourmetmarketing.net/blog/hotel-website-design-trends-in-2025-what-guests-expect-and-how-to-stay-ahead); [Aman](https://www.aman.com/); [1 Hotels](https://www.1hotels.com/); [Baymard cart abandonment](https://baymard.com/lists/cart-abandonment-rate); [WCAG 2.2](https://www.w3.org/TR/WCAG22/); [W3C animation guidance](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html); [MDN prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion); [web.dev Core Web Vitals](https://web.dev/articles/vitals); [web.dev responsive images](https://web.dev/articles/serve-responsive-images).

[5] Gomoa and Ghana context sources: [Gomoa Central District Assembly 2026–2029 plan](https://ndpc.gov.gh/media/Gomoa_Central_District_Assembly_2026-2029_MTDP.pdf); [Ghana Tourism Authority accommodation](https://ghana.travel/accommodation/); [Ghana Tourism 2023 report](https://ghana.travel/wp-content/uploads/2024/04/2023-TOURISM-REPORT_1_compressed.pdf); [NCA Q2 2024 bulletin](https://nca.org.gh/wp-content/uploads/2025/05/Q2-2024-Quarterly-Statistical-Bulletin-Ver5.1.pdf); [Bank of Ghana 2025 payment report](https://www.bog.gov.gh/wp-content/uploads/2026/08/Payment-Systems-Annual-Report-2025-1.pdf); [Ghana Statistical Service](https://statsghana.gov.gh/data-statistics); [Accommodation and Catering Enterprises Regulations, 1979](https://www.brr.gov.gh/acc/registry/docs/ACCOMMODATION%20AND%20CATERING%20ENTERPRISES%20REGULATIONS,%201979%20(LI%201205)..pdf).

[6] Supplied King David visual references: [Google Photos album](https://photos.app.goo.gl/jXm7967UpyQp3NbC9); [Google Photos share](https://photos.google.com/share/AF1QipMvGcweb9WHuc_qCAqJMb1iJXSla1X9_UqkG9f3iM0KAtNcph_uoznYPZ7TAKRyEQ?key=Y1Q1cjhNTENMczJoS211d080QUZON3YzMFY2SWl3).
