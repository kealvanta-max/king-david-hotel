# Deployment and release gates

## What can be deployed now

The Next.js web app can be deployed as a **labelled demonstration**. Set `NEXT_PUBLIC_DEMO_MODE=true` in the hosting environment. No database, Redis, identity provider or payment merchant is required for this mode. Records are local to each browser; there is no cross-device synchronisation or delivery to the property.

Settings for this npm-workspaces repository are committed in `vercel.json` so the host does not have to guess where the nested app builds:

- Framework: Next.js
- Root directory: repository root
- Install: `npm ci`
- Build: `npm run build` (delegates to `apps/web`)
- Output directory: `apps/web/.next` (required; the default `.next` at the repo root does not exist)
- Node: `22.x`, pinned in `package.json` `engines` to match the verified toolchain
- Environment: `NEXT_PUBLIC_DEMO_MODE=true`

The production build sends `X-Frame-Options: SAMEORIGIN`; the header is intentionally omitted in development so the Arena live preview can embed the app.

### Current deployment and access

- Project: `king-david-hotel` (`prj_hQZ73PilBiH7G5UlLTdAmi4IwLhG`), team `patienceboatemaah6-9752`.
- Production URL: `https://king-david-hotel-patienceboatemaah6-9752.vercel.app` — build `READY`, promoted.
- **Vercel Authentication is on for this account** (`ssoProtection: all_except_custom_domains`), so anonymous visitors currently get a Vercel login page instead of the site. To share the demo publicly, open Project → Settings → Deployment Protection and disable Vercel Authentication (or attach a custom domain, which is exempt). The available connector cannot change that setting.
- The first build failed with `NEXT_OUTPUT_DIR_MISSING` because the host looked for `.next` at the repository root; the committed `vercel.json` output directory fixes it. Keep that file when changing hosting settings.

The API and worker are long-running Node services and are **not** deployed by the web build. Use managed containers or a Node host with process supervision, TLS termination, health checks and secret injection. Build each workspace before `npm run start -w ...`. Redis is required by the worker; PostgreSQL is required by both.

## Production is a separate, gated release

Do not turn off demo mode and assume the site becomes live. The current public web flows intentionally use the demo adapter; live API client wiring, authenticated staff session exchange, secure portal-token handling and production content publication remain launch work. With demo mode off, enquiry/portal/workspace surfaces close rather than pretending to save to a server.

### Required environment separation

- Web: only public feature flags. No secrets in `NEXT_PUBLIC_*`.
- API: runtime DB URL, Redis URL, exact HTTPS web/API origins, OIDC issuer/audience/JWKS, public tenant/property IDs, payment secrets only when enabled.
- Worker: runtime DB URL, Redis URL and the same property scope. No payment simulation permission.
- Migration job: owner credentials supplied just-in-time, never shared with the web/API runtime.

### Release sequence

1. Run typecheck, domain/PostgreSQL tests, E2E/accessibility checks, production builds and `npm audit`.
2. Apply migrations with the owner role; run `npm run db:check` with the runtime role.
3. Restore a backup into an isolated database and verify counts, ledger balances and RLS before promotion.
4. Deploy API/worker in a staging environment with payments disabled. Verify OIDC MFA, revocation, property headers, idempotent retries and webhook signature rejection.
5. Complete merchant sandbox tests: success, failure, pending, timeout, duplicate, delayed/out-of-order event, amount/currency mismatch, partial/full refund and settlement mismatch.
6. Verify all property content and legal/tax/privacy approvals. Replace the botanical placeholder with approved property photography.
7. Deploy a canary, observe error/latency/payment-exception signals, then promote. Keep a rollback image and database-compatible migration plan.

## Health and observability

- API: `GET /v1/health` is a process-health endpoint, not a database-readiness guarantee. Add deployment probes that exercise a scoped, read-only DB check.
- API docs: `/v1/docs` (protect or disable at the edge for production).
- Worker: structured `job.completed`, `job.failed`, `redis.error` logs; alert on repeated failures and queue age.
- OTel: set `OTEL_EXPORTER_OTLP_ENDPOINT` only on server processes. Do not export SQL values, guest contact details, payment bodies, tokens or authorization headers.
- The edge must overwrite forwarded headers; the API throttler is per process and needs an edge/shared limiter for multi-instance production.
