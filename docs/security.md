# FC-CMS Security

Security is enforced in depth: frontend hints never gate real permissions; every API request is
authenticated/authorized server-side; the schema, services and error surfaces follow least
disclosure.

## Authentication

- Passwords hashed with scrypt (per-user salt, 64-byte derived key); never stored or logged in plaintext.
- Sessions: HMAC-SHA256 signed httpOnly, SameSite=Lax cookies, 12-hour expiry; `secure` flag in
  production. Payload = userId + issuedAt + expiresAt; constant-time signature comparison.
- Login rate limiting (10 attempts / 5 min / IP) with generic "Invalid email or password." errors
  (no account-existence leaks). Auth failures and successes are audited.
- Root Admin / privileged production accounts: the production CRM auth adapter is the single swap
  point (`verifyPassword` + user resolution in `src/lib/auth.ts`); MFA hooks in at the same seam.
- Customers are unauthenticated by design: portal + tracking + reopen need no account. This path
  is fully separated from staff auth.

## Authorization (RBAC, deny-by-default)

Every protected route calls `requireUser()` (session) or `requireApiKey()` (x-api-key) and then a
resource-level check:

| Role | Ticket scope | Can assign | Availability | Settings | Audit |
|---|---|---|---|---|---|
| ROOT_ADMIN | all | yes | manage | yes | view |
| CENTRAL_ADMIN | all | yes | manage | no | view |
| CENTRAL_AGENT | all | yes | no | no | no |
| BRANCH_MANAGER | own branch | own branch | own branch | no | no |
| SUPPORT_AGENT | only assigned to them | no | no | no | no |

`canAccessTicket(user, ticket)` guards ticket detail/mutation/attachment endpoints. Changing the
ticket ID in the URL cannot leak another employee's or branch's ticket (verified by tests).
API keys carry scopes (`read`, `write`) enforced per endpoint.

## Closed-ticket protection (unmodifiable by any role)

Once CLOSED, a ticket rejects status changes, notes, replies, assignment, transfer and reopening —
including from the Root Admin and the integration API (409 `TICKET_CLOSED`). The check runs in the
service layer before every mutation, and the closure sweep re-verifies status + deadline inside its
transaction (defense against the reopen/closure race). Tests cover Root Admin modification
attempts and post-closure reopen attempts.

## PostgreSQL Row Level Security (production)

The Supabase migration applies RLS on all sensitive tables. Suggested policy skeleton (service
role used by the backend only; anon role has zero direct table access):

- `complaint_tickets`: SELECT/UPDATE restricted by staff JWT claims (`branch_id`, role, employee id).
- `ticket_messages`: staff-only rows; `visibility = 'INTERNAL'` never exposed to any public path.
- `ticket_assignments`, `ticket_status_history`, `ticket_reopen_history`: staff-only read.
- `ticket_attachments`: staff-only; storage bucket stays private with signed URLs.
- `system_settings`, `config_audit`, `notification`, `audit_log`: service-role only.
- Public complaint submission and tracking always go through the backend service — anonymous
  clients never hold table grants.

## API security

- HTTPS-only in production; strict CORS allowlist; request body size limits; Zod/manual input
  validation on every endpoint; parameterized Prisma queries (SQL-injection safe).
- Rate limits: complaint submissions (8/10 min), tracking (20/10 min + progressive throttle after
  6 failures), reopen (6/15 min), uploads, login. Redis-backed store replaces the in-memory map in
  production (`RATE_LIMIT_WINDOW` / `RATE_LIMIT_MAX`).
- Secure error envelope: `{ success, error: { code, message } }` — never stack traces, SQL, or
  internal identifiers. Correlation IDs tie client-visible errors to server logs.
- Idempotency keys prevent duplicate ticket creation; phone numbers never travel in URLs
  (tracking is POST-only); phone numbers are masked in any UI that does not need the full number.

## Tracking security

Ticket ID + registered mobile must both match; mismatch (including unknown tickets and malformed
IDs) returns one generic message so ticket existence is never revealed. Progressive throttling and
access logs cover enumeration abuse; only customer-visible fields are projected (no internal
notes, no employee emails, no database IDs, no storage paths). OTP verification can be layered on
top of the same verification function later without changing the ticket model.

## File upload security

Private storage (`db/uploads`, outside `/public`), server-generated UUID filenames (path-traversal
proof), MIME-type allowlist from settings, size limit from settings, staff-session downloads with
RBAC, short-lived signed URLs planned for the production object storage. Malware scanning is a
production deployment step (hook point: the upload route).

## Operational security

- Secrets live in environment variables; service-role keys are backend-only and never shipped to
  the client; dev and production Supabase projects are separate.
- Audit logs are append-only through the application (no update/delete endpoints exist).
- Migrations are version-controlled; seed data is separate from migrations and never migrates to
  production.
- No credentials appear in client code or logs; the dev API key is printed only to the admin panel
  for convenience and is rotated for production.
