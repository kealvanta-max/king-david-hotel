# Operations, recovery and provider-outage runbook

These are executable checklists for the property/team. They are not claims that a managed backup, merchant account or live delivery provider has been provisioned.

## 1. Database backup and restore drill

**Owner:** engineering + finance. **Frequency:** automated daily backups plus a monthly restore drill and before every schema migration. Proposed targets pending approval: RPO ≤ 15 minutes, RTO ≤ 2 hours. Measure actual results; do not publish the targets as achieved.

1. Record primary UTC time, migration version, deployment SHA and backup ID.
2. Take a provider snapshot and WAL/PITR backup using the managed PostgreSQL console/CLI. Keep credentials outside Git.
3. Restore into a **new isolated database**, never over the live database.
4. Run `npm run db:check` with a non-owner runtime role against the restored database.
5. Reconcile: enquiry/quote/event counts; active inventory allocations by resource/date; captured minus refunded amounts by provider reference; issued invoice snapshots; audit entry count and latest timestamp.
6. Run the PostgreSQL acceptance suite against a disposable copy. Verify cross-tenant reads fail and concurrent last-room holds cannot overbook.
7. Record elapsed restore time, data-loss window, discrepancies, approver and corrective actions. Destroy the drill database according to retention policy.

A restore is not successful merely because the server starts. Financial and inventory reconciliation must pass.

## 2. Payment provider outage / unknown outcome

**Owner:** finance manager. **Never** mark a request paid from a redirect, screenshot, SMS text or guest statement alone.

1. Freeze new checkout initiation for the affected provider; keep existing payment references and audit history.
2. Preserve webhook receipts and provider event IDs. Check signature authentication and authoritative provider verification before any state advance.
3. For timeout/unknown outcomes, keep the internal request visible as `provider_timeout`/pending. Retry initialization only with the same internal reference/idempotency key.
4. On duplicate events, confirm one credit only. On delayed failure after success, do not undo confirmed funds; route to manual review.
5. On amount/currency mismatch or settlement mismatch, move to `manual_review`, record the reason and reconcile against the provider statement.
6. Refunds are separate explicit finance actions. A partial refund reduces the verified net deposit and can block confirmation until the required deposit is met.
7.Restore service only after sandbox/merchant acceptance checks and a small monitored canary. Communicate honestly with guests; offer an approved offline contact path, not an unverified bank account.

## 3. Redis / worker outage

1. PostgreSQL remains authoritative. Do not accept Redis queue state as proof of booking, payment or delivery.
2. Pause worker deployment changes; inspect queue age, failed jobs and dead-letter retention. The worker uses five attempts with exponential backoff.
3. Restore Redis connectivity. The minute sweep re-reads DB inventory and queues only DB-backed `queued` outbox records.
4. Verify expired holds/cutoffs release correctly and messages without consent remain suppressed. No delivery provider is configured in this release: consented messages fail explicitly rather than reporting sent.
5. Reconcile outbox status with provider receipts before retrying any future live delivery integration.

## 4. Property connectivity / power / water failure

1. Switch to the approved printed/latest-downloaded function sheets and rooming list; record version and time.
2. Use the property-approved backup power/water plan and verified guest contact channels. Do not collect card PAN/PIN/OTP offline.
3. Log arrivals, room changes, charges and incidents on the controlled offline form with actor/time/reason.
4. On reconnection, enter changes through the audited workspace/API with idempotency keys; reconcile inventory and folios before closing the incident.
5. Test actual Wi-Fi and MTN/Telecel/AT coverage on site. National statistics are not a substitute for a property test.

## 5. Security incident / suspected guest-data exposure

1. Revoke affected staff sessions (`sessions_valid_after`) and portal capabilities; disable compromised identities.
2. Rotate provider/identity/database secrets through the secret manager. Preserve audit and webhook evidence with access controls.
3. Scope impact by tenant/property and time. Do not export guest data into chat or tickets.
4. Follow approved Ghana Data Protection Commission/legal notification obligations and processor agreements.
5. Restore least privilege, verify RLS/runtime role safety, and record a post-incident review.
