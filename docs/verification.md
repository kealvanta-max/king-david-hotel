# Verification record

## Automated checks executed in this workspace

| Check | Result |
|---|---|
| Root + all workspace TypeScript | PASS |
| Domain/repository suite | 36 PASS |
| Real embedded PostgreSQL 18.6 suite | 11 PASS, clean exit |
| Disposable migration/runtime safety script | PASS |
| Chromium E2E suite | 7 PASS |
| Axe WCAG A/AA tags across 20 public/staff routes | 0 violations |
| Production web build | PASS, 22 routes |
| API and worker builds | PASS |
| `npm audit` | 0 vulnerabilities after dependency updates/overrides |
| Vercel production build | READY / promoted (`dpl_4UCEH58jU4r5TD42FZtTxnzA7RJF`, commit `47a052b`) |
| Anonymous fetch of the deployed URL | Blocked by account-level Vercel Authentication (login page), not an app error |
| Post-upgrade browser smoke (home, finance, mobile) | No page errors; layout intact |

The E2E suite exercises the full stay path: enquiry → hold → itemised quote → manager approval → guest acceptance → deposit request → explicit simulated provider success → inventory confirmation → named guest. It also checks event capacity validation, route hydration/overflow, mobile navigation, keyboard dialog dismissal, reduced motion, storage failure and simulated read-only restrictions.

The PostgreSQL suite exercises a non-owner runtime role, missing-context default deny, cross-tenant read/write rejection, cross-property insert rejection, two independent concurrent hold transactions, idempotent replay/changed-payload rejection, direct overlapping-space exclusion, accepted-quote/deposit immutability, append-only audit and exact portal capability lookup.

## Manual/field work still open

- Real screen-reader walkthrough (NVDA/VoiceOver), 200% zoom, touch-target ergonomics and mid-range Android device testing.
- Field LCP/INP/CLS at the 75th percentile on Ghana mobile networks; automated axe checks are not a substitute.
- Managed-database backup restore/PITR drill with measured RPO/RTO.
- Live OIDC/MFA/revocation, merchant sandbox/production acceptance, settlement/refund reconciliation and provider-outage drill.
- Property truth: photography, address/pin, contacts, rooms/rates/amenities, layout capacities, access, power/water/network, rain/noise plans, policies, reviews, GRA/GTA/DPC and payment merchant evidence.
- Production web-to-API integration, authenticated staff UI, secure portal-token delivery, object storage/documents, retention/erasure and live messaging delivery.

No live Supabase database was provisioned or modified. The connected Supabase app is off for this conversation; enable it before requesting managed database operations. Vercel deployment, if present, is a demo web deployment only.
