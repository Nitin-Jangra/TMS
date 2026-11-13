# FC-CMS Architecture

## Overview

FC-CMS is a complaint & ticket management system for FitClass with a customer portal, four
role-based staff experiences, a branch-wise round-robin assignment engine, an email notification
outbox, SLA tracking, audit logging and a full REST API for CRM/LMS integration.

The sandbox deliverable is a single Next.js 16 application (App Router, TypeScript). The logical
monorepo boundaries of the master spec map as follows and can be split into separate deployables
without touching business logic:

| Logical module | Location |
|---|---|
| Customer portal (React UI) | `src/app/page.tsx`, `src/app/complaint/*`, `src/app/track/*` |
| Support dashboards | `src/app/login`, `src/app/staff/*`, `src/app/admin/*` |
| REST API (`/api/v1`) | `src/app/api/v1/**` — public / support / branch / admin / integration |
| Shared domain types & RBAC | `src/lib/types.ts` |
| Ticket lifecycle engine | `src/lib/tickets.ts` (create, transitions, track, reopen, messages) |
| Assignment engine | `src/lib/assignment.ts` |
| Closure engine | `src/lib/closure.ts` + `src/instrumentation.ts` |
| Notification engine | `src/lib/notifications.ts` (transactional outbox + dev adapter) |
| SLA engine | `src/lib/sla.ts` |
| Settings + config audit | `src/lib/settings.ts` |
| Audit | `src/lib/audit.ts` |
| Auth (dev credentials + sessions + API keys) | `src/lib/auth.ts` |
| Rate limiting | `src/lib/rate-limit.ts` |
| Database schema | `prisma/schema.prisma` |
| Seed (dummy data) | `prisma/seed.ts` |

## Database model (23 tables)

Core: `Branch`, `StaffUser`, `ComplaintCategory`, `TicketSequence`, `Ticket`,
`TicketStatusHistory`, `TicketAssignment`, `TicketMessage`, `TicketAttachment`.
Notifications: `Notification` (transactional outbox).
Assignment: `BranchCursor` (one independent round-robin cursor per branch).
Closure/reopen: `TicketClosureJob`, `TicketReopenHistory`.
SLA: `SlaPolicy`, `SlaTracking`.
Config: `SystemSetting`, `ConfigAudit`.
Security/ops: `IdempotencyKey`, `CustomerAccessLog`, `ApiClient`.

Design rules:
- UUID/cuid primary keys; no hardcoded employee/branch IDs in logic.
- `Branch.crmExternalId` and `StaffUser.crmExternalId` reserve the CRM synchronization references.
- SQLite is the dev sandbox; the schema avoids SQLite-only types so the same schema migrates to
  Supabase PostgreSQL. The cursor row maps to `SELECT … FOR UPDATE` under PostgreSQL.

## Ticket lifecycle

```
NEW_COMPLAINT ──▶ IN_PROGRESS ──▶ ON_HOLD ──▶ IN_PROGRESS ──▶ RESOLVED ──▶ CLOSED (auto)
                     ▲                                            │
                     └──────────── customer reopen ◀──────────────┘
```

- Only the six transitions in `ALLOWED_TRANSITIONS` (src/lib/types.ts) are accepted.
- `RESOLVED` stores `resolvedAt` + computed `autoCloseAt` (from the configurable reopening
  window) and schedules a `TicketClosureJob`.
- `CLOSED` is terminal and read-only at every layer: service functions throw, APIs return 409,
  and the sweep re-verifies status inside its transaction before closing.
- Reopen keeps the original assignee when still eligible, otherwise re-enters the branch queue.

## Assignment engine

`assignTicketRoundRobin(ticketId, actor, method)` runs in one transaction:
1. Load ticket (reject closed tickets, skip if already assigned).
2. Load eligible employees for the ticket's branch only: role SUPPORT_AGENT, isActive,
   availabilityEnabled — ordered by createdAt (stable rotation order).
3. If none → leave NEW_COMPLAINT + unassigned, notify branch mailbox / central / branch manager
   (`ASSIGNMENT_FAILED`), keep in the unassigned queue.
4. Read the branch cursor, choose the next employee cyclically, upsert the cursor.
5. Write a `TicketAssignment` row (isCurrent, method ROUND_ROBIN/RETRY/REOPEN/MANUAL) and set
   `Ticket.assignedToId`.
6. After commit: audit `TICKET_ASSIGNED` + outbox `ASSIGNED` email to the assignee.

Availability toggles and branch reactivation trigger `retryUnassignedTickets(branchId)`, which
drains the unassigned queue in FIFO order.

## Notification engine (transactional outbox)

Every notification is written to the outbox BEFORE delivery, then the dev adapter marks it SENT.
Recipient resolution honours: customer email, assignee email, branch notification email (blank →
SKIPPED), central support email (blank → SKIPPED), branch manager email. Internal notes never
generate notifications. Duplicate protection relies on one outbox row per event+recipient; retries
increment attempts and never roll tickets back. Production swaps one function (`devSend`) for a
real provider adapter (SMTP/SendGrid/SES).

## Background workers

`src/instrumentation.ts` registers one interval (60 s) per server process that runs:
- `runClosureSweep()` — closes RESOLVED tickets whose stored `autoCloseAt` has passed
  (idempotent, re-verifies inside the transaction, invalidates jobs after reopen).
- `runAssignmentRetrySweep()` — retries unassigned NEW_COMPLAINT tickets.
Timers only trigger sweeps; all schedule state lives in the database, so restarts are safe.
The master panel and a dedicated admin endpoint can trigger sweeps on demand.

## API surface

- `/api/v1/public/*` — branches, categories, complaints (Idempotency-Key), track, reopen, attachments.
- `/api/v1/support/*` — role-scoped dashboards, ticket list/detail, status, resolve, notes, replies,
  history, assign, escalate, unassigned queue, eligible employees, availability.
- `/api/v1/branch/*` — branch manager dashboard/tickets/employees/reports.
- `/api/v1/admin/*` — overview (master panel), settings, closure policy, audit logs, reports,
  mailbox, retry, API keys, categories, SLA, branches, worker trigger.
- `/api/v1/integration/*` — x-api-key authenticated endpoints for CRM/LMS: whoami, branches,
  categories, employees+cursors, tickets (list/detail/PATCH status), complaints, stats.
- `/api/v1/openapi` — OpenAPI 3.0 spec; rendered docs at `/docs/api`.

All responses use `{ success, data | error{code,message,details}, correlationId }` with
`x-correlation-id` headers and safe error messages (no stack traces/DB errors).

## Security model

- Staff auth: scrypt password hashes, HMAC-signed httpOnly session cookie (12 h), login rate
  limiting, generic credential errors, audit on success/failure. Production swaps in the CRM auth
  adapter without touching session plumbing.
- API clients: SHA-256-hashed keys (dev seed also stores plaintext for the panel), scopes
  read/write, `lastUsedAt` tracking.
- Authorization: deny-by-default; every support/branch/admin route resolves the session and
  resource (`canAccessTicket`), agents see only their own tickets, managers only their branch.
- Public tracking: ticket+mobile must both match; in-memory progressive throttling after repeated
  failures; customer access logs; generic errors; minimum data projection.
- Attachments: private `db/uploads` with server-generated UUID filenames, MIME/size allowlist,
  staff-session downloads with RBAC; never exposed via `/public`.
- Audit: immutable rows with actor/role, previous/new values, correlation ID, IP.
