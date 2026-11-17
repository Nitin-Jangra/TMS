# FitClass Complaint Management System (FC-CMS)

A complete, production-ready Complaint & Ticket Management System for FitClass Gym, built to the
master development specification with a dummy development database (no real customer records).

**Stack:** Next.js 16 (App Router) + TypeScript · Tailwind CSS 4 + shadcn/ui · Prisma ORM (SQLite
dev sandbox, PostgreSQL/Supabase-ready schema) · REST API under `/api/v1` · scrypt password
hashing + HMAC session cookies · transactional outbox notifications · branch-wise round-robin
assignment · SLA tracking · background closure worker · audit logging.

---

## Quick start

The dev server runs automatically on port 3000. The SQLite database is already seeded with dummy data.

```bash
bun prisma/seed.ts     # re-seed dummy data (optional)
bunx vitest run        # run the 11 core business-rule tests
bun run lint           # ESLint
```

**Hosting & integration:** two free paths are documented:

- `docs/deploy-cloudflare.md` — **Cloudflare Workers + D1 (all-Cloudflare, free tier)**: one
  account, `bun run cf:deploy`, workers.dev URL in minutes, plus the APK/CRM API walkthrough.
- `docs/deployment-guide.md` — **GitHub → Supabase (Postgres) → Netlify**, including the
  scheduled-worker function and how to drive FC-CMS from another app (CRM / LMS / mobile) through
  its API.

## Role-based dashboards (who sees what)

| Persona | Login? | Entry | Visibility |
|---|---|---|---|
| **Customer (user)** | **No login** | Click **Complaint** on the home page / header → exactly two options: **Register a complaint** or **Track a complaint** | Own tickets only, via Ticket ID + registered mobile at `/track` |
| **Root Admin** | Yes (`/login`) | Auto-redirected to `/admin` — Master Complaint Panel | **All tickets across the whole tenant**: per-branch counts, status matrix, which lead is assigned to whom, SLA averages, worker triggers |
| Central Support Admin / Agent | Yes | `/staff` — Central Support Overview | All branches (tenant-wide) with branch snapshot + branch filter on the tickets list |
| Branch Manager | Yes | `/staff` — Branch Overview | **Only complaints raised in their own branch** + team availability + assignment queue |
| **Customer Support (Support Agent)** | Yes (`/login`) | `/staff` — Branch Dashboard (their branch) | **Only complaints raised in their own branch** (every status, every assignee). "Assigned to me" card + `mine=true` filter isolate their personal work queue |

Round-robin assignment runs per branch and is unchanged; support agents can open and interact with
any complaint in their branch (reply, internal note, start, hold, resolve), while closed tickets
remain read-only for every role.

## Test login accounts (development only)

| Role | Email | Password |
|---|---|---|
| **Root Admin** (master panel + settings) | `admin@fitclass.dev` | `Admin@123` |
| Central Support Admin | `central.admin@fitclass.dev` | `Central@123` |
| Central Support Agent | `central.agent1@fitclass.dev` | `Agent@123` |
| Central Support Agent 2 | `central.agent2@fitclass.dev` | `Agent@123` |
| Manager — Sector 48 | `manager.b001@fitclass.dev` | `Manager@123` |
| **Support — Sector 48 (A)** | `support.b001.a@fitclass.dev` | `Support@123` |
| **Support — Sector 48 (B)** | `support.b001.b@fitclass.dev` | `Support@123` |
| **Support — Sector 48 (C)** | `support.b001.c@fitclass.dev` | `Support@123` |
| Manager — Sector 49 | `manager.b002@fitclass.dev` | `Manager@123` |
| **Support — Sector 49 (A)** | `support.b002.a@fitclass.dev` | `Support@123` |
| Support — Sector 49 (B, availability OFF) | `support.b002.b@fitclass.dev` | `Support@123` |
| Manager — Gurugram Central | `manager.b003@fitclass.dev` | `Manager@123` |
| **Support — Gurugram Central** | `support.b003.a@fitclass.dev` | `Support@123` |
| Manager — Sohna Road (no agents) | `manager.b004@fitclass.dev` | `Manager@123` |

Support login-test profiles exist **only in 3 branches** (Sector 48 ×3, Sector 49 ×2, Gurugram
Central ×1) as requested. Sohna Road intentionally has no support agents so you can watch a
complaint land in the **unassigned queue** and get auto-assigned when someone becomes available.

**Branch + central notification emails are blank** (per FitClass instruction) — set them in
`Root Admin → System Settings → Branch emails / General`. Until then those notifications are
recorded as SKIPPED in the mailbox; customer + assignee emails still work.

**CRM/LMS integration API key (development):**
`fc_dev_crm_lms_2026_a1b2c3d4e5f6g7h8` — header `x-api-key`. Docs at `/docs/api`, spec at `/api/v1/openapi`.

## Seeded dummy data

- **Branches:** BR001 Sector 48, BR002 Sector 49, BR003 Gurugram Central, BR004 Sohna Road
- **Categories:** the 10 from the spec (Equipment Issues … Other)
- **Tickets:** FC-2026-000001 … 000011 covering all five statuses, with status/assignment/reopen
  histories, internal notes, customer replies, notifications and audit records
- **SLA policies:** Critical 15 min / 4 h · High 1 h / 24 h · Medium 4 h / 48 h · Low 8 h / 72 h
- **Reopening window:** 72 h (configurable in Admin → Closure policy)

## How to test round-robin (2 minutes)

1. Log in as `admin@fitclass.dev` → open the **Master Complaint Panel** — note the Sector 48 cursor.
2. Open the customer portal in another tab → **Register Complaint** → pick Sector 48 → submit.
3. The ticket is auto-assigned to the **next** support employee in rotation (cursor → next).
4. Register 2 more complaints — watch the rotation cycle equally across all available agents.
5. Log in as `support.b001.a@fitclass.dev` → **Branch Dashboard** shows every complaint raised in
   Sector 48; the **Assigned to me** card isolates your own queue → open a ticket → Start / Hold /
   Reply / Internal note / **Resolve** (mandatory message).
6. Track the ticket at `/track` with the ticket ID + registered mobile → **Reopen** within 72 h.
7. To test automatic closure: Admin → Closure policy → set window to 1 hour → resolve a ticket →
   "Run closure + assignment workers now" (or wait 60 s for the background sweep) → the ticket
   becomes CLOSED and is permanently read-only for every role.

## Project layout (sandbox-adapted monorepo)

| Spec item | Implementation |
|---|---|
| `apps/customer-portal` | `src/app/(page.tsx, complaint/*, track/*)` |
| `apps/support-dashboard` | `src/app/(login, staff/*, admin/*)` |
| `apps/api` | `src/app/api/v1/*` (public, support, branch, admin, integration) |
| `packages/shared-types` | `src/lib/types.ts` (statuses, roles, transitions, RBAC) |
| `services/assignment-worker` | `src/lib/assignment.ts` + retry sweep |
| `services/closure-worker` | `src/lib/closure.ts` + `src/instrumentation.ts` (60 s sweep) |
| `services/notification-worker` | `src/lib/notifications.ts` (transactional outbox + dev adapter) |
| `database/migrations` | `prisma/schema.prisma` (version-controlled, `bun run db:push`) |
| `database/seed` | `prisma/seed.ts` (kept separate from migrations) |
| Docs | `docs/architecture.md`, `docs/security.md`, `docs/api-specification.md`, `docs/lms-integration.md` (LMS API + webhooks), `docs/website-integration.md`, `docs/migration-guide.md` |

## Key guarantees

- **Ticket IDs:** `FC-2026-000001` … transaction-safe sequence, never reused.
- **Round robin:** FIFO, equal distribution, one independent queue + persistent cursor per branch,
  concurrency-safe (single transaction; maps to `SELECT … FOR UPDATE` on PostgreSQL).
- **Status machine:** only the 6 documented transitions are accepted; **CLOSED tickets are
  read-only for every role including Root Admin** (service + API layers, re-verified in DB
  transactions on Supabase).
- **Tracking:** Ticket ID + registered mobile, generic errors, rate limits + progressive throttle,
  no internal notes, no DB IDs, phone never in URLs.
- **Idempotency:** `Idempotency-Key` on complaint creation; closure sweep is idempotent.
- **Audit:** every action recorded (actor, previous/new value, correlation ID, IP); immutable.
- **Security:** scrypt hashes, signed httpOnly session cookie, deny-by-default RBAC with
  resource-level checks, private attachment storage with staff-only signed access, input
  validation, secure error envelopes, no secrets in client code.

## Production migration (Supabase)

See `docs/migration-guide.md`. Summary: create the production Supabase project → apply the
Prisma schema (`prisma migrate`) → switch `DATABASE_URL` → configure real SMTP/email provider in
`src/lib/notifications.ts` (single adapter function) → sync real branches/employees from CRM
(`crmExternalId` fields are ready) → rotate API keys → never copy dummy data.
