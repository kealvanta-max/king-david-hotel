# King David Event & Guesthouse

A quiet, mobile-first hospitality website and operations workspace for a Gomoa, Ghana property. **This repository currently ships an explicitly fictional, browser-local preview plus a separately deployable API/worker and PostgreSQL domain.** It is not a live booking engine and must not be used for real guest data or money until the launch gates below are closed.

## Explore the preview

```bash
npm ci
NEXT_PUBLIC_DEMO_MODE=true npm run dev
```

Open `http://localhost:3000`. The staff workspace is `/admin`; its role selector simulates permissions and is **not authentication**. Demo records live in this browser's local storage under `king-david-demo-v2`. Use fictional contact details. Reset/export controls are in **Settings & launch**.

- Public pages: stays, events, experiences, location, contact, policies, enquiry and booking-review flows.
- Guest preview: reference lookup, versioned proposals, acceptance, deposit requests, rooming and schedules.
- Staff workspace: enquiries, unified inventory calendar, quote approval, event operations, room blocks, folios/payments, tasks/outbox, content evidence, audit and launch gates.
- Every enquiry explicitly reserves nothing. Confirmation requires an accepted quote and a verified demo deposit. Payment simulation is available only to the simulated admin/finance roles.

## Repository map

| Path | Responsibility |
|---|---|
| `apps/web` | Next.js 16 public site, guest preview and operator UI |
| `apps/api` | NestJS REST API, OIDC/MFA staff guard, scoped commands, portal capabilities, payment webhook boundary |
| `apps/worker` | BullMQ inventory expiry/cutoff sweep and consent-aware DB outbox processing |
| `packages/contracts` | Shared domain types, Zod input contracts, GHS money and illustrative tax calculations |
| `packages/db` | Pure guarded domain engine, demo repository, PostgreSQL adapter and migration |
| `packages/policy` | Tenant/property scope, command permissions and audit redaction |
| `packages/config` | Fail-closed server environment validation |
| `tests` | Domain, real embedded PostgreSQL and Chromium journey/accessibility tests |
| `docs` | Architecture brief, deployment and operational runbooks |

## Verify

```bash
npm run typecheck
npm test                       # domain + real PostgreSQL, disposable local cluster
npm run db:check:local          # migration + runtime-role/RLS safety probe
npm run test:e2e                # starts/reuses web server; Chromium journey + axe checks
npm run build                  # production web build
npm run build -w @king-david/api
npm run build -w @king-david/worker
npm audit
```

The E2E runner uses a normal Playwright browser when installed. On restricted Linux environments it can use the installed `@sparticuz/chromium` package without downloading a browser. For CI, install the matching browser with `npx playwright install --with-deps chromium` when network policy permits.

The PostgreSQL tests intentionally log expected constraint/RLS errors while asserting rejection. A successful run exits zero. They cover tenant/property isolation, concurrent last-room holds, idempotency, space exclusion, accepted-quote immutability, append-only audit and exact portal-token lookup.

## Live-service configuration (not connected to the preview)

Copy `.env.example` into the **server process environment**, not into browser code. The web preview only reads `NEXT_PUBLIC_DEMO_MODE`; never put database, identity or payment secrets in `NEXT_PUBLIC_*` variables.

1. Provision managed PostgreSQL and Redis. Run `npm run db:migrate` using a short-lived migration-owner connection.
2. Create a dedicated login role with `NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`, grant `king_david_runtime`, and use it for `DATABASE_URL`. The API/worker refuse privileged runtime roles.
3. Set `PUBLIC_TENANT_ID`, `PUBLIC_PROPERTY_ID`, HTTPS origins and an OIDC issuer/JWKS. Provision `staff_identities` through an approved administrative process; tokens need `sub`, `jti`, `amr: [mfa]`, recent `auth_time` and a non-revoked `iat`.
4. Keep `PAYMENT_PROVIDER=disabled` until merchant acceptance tests pass. Hubtel/Flutterwave adapters fail closed. The Paystack adapter is a reference integration, not evidence of Ghana merchant/network activation.
5. Start API with `npm run start -w @king-david/api` and worker with `npm run start -w @king-david/worker` after building. Both bind explicit configured services; the API listens on `0.0.0.0:$PORT`.
6. Run `npm run db:check` against the runtime connection. Optionally supply `MIGRATION_DATABASE_URL` only to the migration/check job.

See [deployment](docs/deployment.md), [operations and recovery](docs/operations-runbook.md), [security/privacy](docs/security-and-privacy.md) and [verification status](docs/verification.md).

## Truth and launch gates

The brief deliberately forbids invented property facts. The artwork is a labelled botanical illustration, **not property photography**. Room counts, rates, capacities, amenities, taxes, directions, contact details, policies and provider availability are demo values or empty evidence fields. The Content studio tracks 22 verification fields; marking a demo field verified does not publish it to a live site.

Before accepting real bookings: verify the property and photography; approve tax/legal/privacy/cancellation terms; configure identity/MFA and least-privilege DB access; complete payment sandbox + production reconciliation/refund tests; execute backup restore and provider-outage drills; test on-site power/water/connectivity; complete manual screen-reader/keyboard and field performance tests; wire the live web client to the API and remove demo affordances. The current web build does not silently fall back to local storage when the API is unavailable.
