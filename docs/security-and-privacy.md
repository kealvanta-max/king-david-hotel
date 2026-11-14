# Security and privacy posture

## Current preview

- All guest-facing saves are browser-local demo actions. Use fictional details. There is no server submission, real reservation, message delivery or payment.
- The staff role selector is a simulation. It exercises the shared permission policy but provides no authentication.
- Local storage is not encrypted and is readable by anyone with access to the browser profile. Export/reset controls do not remove downloaded files.
- The reference lookup in the demo portal is a convenience, not secure guest authentication. Production portal access uses a 43-character random capability whose SHA-256 hash is stored with expiry/revocation and exact enquiry scope.
- The only artwork is a labelled botanical illustration. No real property photograph, review, coordinate, amenity or policy is invented.

## Server boundaries

- Staff: OIDC JWT verification against JWKS, RS256/ES256 only, issuer/audience checks, `sub`/`jti`, MFA `amr`, recent `auth_time`, allowlisted identity and session revocation timestamp. Property scope is checked against membership.
- Commands: explicit staff whitelist; simulation/manual verification/refund commands are excluded from the live staff API and rejected by the domain outside demo mode.
- Database: forced RLS, transaction-local tenant/property settings, non-owner runtime role safety check, no DELETE/TRUNCATE grants, append-only audit trigger, immutable accepted commercial quote terms, idempotency receipts and inventory exclusion/capacity constraints.
- Payments: hosted checkout only; raw card data never enters the app. Webhooks require bounded raw body, provider signature authentication and authoritative verification. Redirects never confirm payment.
- Public enquiries: exact origin check, rate limit and required idempotency key. The trusted edge must overwrite forwarded headers and add shared abuse controls.
- Audit: actor, time, before/after and reason; contact, notes, portal hash, checkout URL and provider reference are redacted.
- Telemetry: optional OTLP HTTP exporter; keep guest/payment/auth payloads out of spans and logs.

## Before real personal data

Approve a lawful basis and privacy notice, retention/deletion schedule, processor agreements, Ghana DPC registration/applicability, GRA tax treatment and GTA licensing. Complete a DPIA/threat model, penetration test, secret rotation, backup restore drill, staff access review and incident-response exercise. Confirm PCI responsibility with the merchant/acquirer; this code is not a PCI compliance certification.

Do not store identity documents, card PAN, PIN, OTP or unnecessary sensitive data in notes. The current schema/domain is a reference implementation and needs production retention, erasure, document storage, reporting and live-client integration work before launch.
