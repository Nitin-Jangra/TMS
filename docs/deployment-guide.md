# Deployment & Integration Guide

Everything you need to (1) run FC-CMS on your machine, (2) host it for testing with
**GitHub + Netlify + Supabase**, and (3) drive it from **another app (CRM / LMS / mobile)
through its API**.

```
Browser / Android app ──HTTPS──▶ Netlify (Next.js SSR + API routes)
                                     │
                                     ▼ prisma client (TCP 6543, pooled)
                                  Supabase PostgreSQL
```

---

## Part 1 — Run locally

**Prerequisites:** [Node.js 20+](https://nodejs.org) and [Bun](https://bun.sh)
(`curl -fsSL https://bun.sh/install | bash`). Bun makes the seed and TypeScript scripts one-liners;
npm works too.

```bash
git clone https://github.com/<you>/<your-repo>.git fc-cms
cd fc-cms
bun install            # or: npm install  (postinstall auto-runs `prisma generate`)

cp .env.example .env   # defaults already point to the local SQLite file
bunx prisma db push    # create db/custom.db from prisma/schema.prisma
bun prisma/seed.ts     # load dummy data + test accounts
bun run dev            # http://localhost:3000
```

Verify the install: `bunx vitest run` (11 core business-rule tests) and `bun run lint`.

Sign in at `/login` — e.g. Root Admin `admin@fitclass.dev / Admin@123`, support
`support.b001.a@fitclass.dev / Support@123`. The integration dev API key is
`fc_dev_crm_lms_2026_a1b2c3d4e5f6g7h8` (header `x-api-key`).

**Useful commands**

| Command | What it does |
|---|---|
| `bun run dev` | dev server on :3000 |
| `bunx prisma db push` | apply `prisma/schema.prisma` to the database |
| `bun prisma/seed.ts` | reset dummy data |
| `bash scripts/use-postgres.sh postgres \| sqlite` | flip the Prisma provider between SQLite (local) and PostgreSQL (Supabase) |

---

## Part 2 — Push to GitHub

The repo ships with a `.gitignore` that excludes `.env`, `db/`, `node_modules/`, `.next/` —
secrets and local data never get committed.

```bash
git init                       # skip if .git already exists
git add -A
git commit -m "FC-CMS: complaint management system"
git branch -M main
git remote add origin https://github.com/<you>/fc-cms.git
git push -u origin main
```

Optional but recommended: keep local and Supabase codebases identical. The only file that differs
is the Prisma provider line — commit it as **sqlite** and let the deploy pipeline (or
`scripts/use-postgres.sh`) flip it, as shown below.

---

## Part 3 — Supabase (testing database)

1. **Create the project.** [supabase.com](https://supabase.com) → New project → pick a region near
   you → set the database password. Testing tier is fine.

2. **Get the two connection strings** (Supabase → Project Settings → Database → Connection string):

   | Use | String | Where |
   |---|---|---|
   | Migration / seed (from your machine) | URI, port **5432** (Session pooler / Direct) | one-off commands |
   | Netlify runtime | URI, port **6543** (Transaction pooler) + `?pgbouncer=true&connection_limit=1` | Netlify env var |

   They look like:
   ```
   postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
   postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1
   ```

3. **Apply the schema + seed (from your machine):**

   ```bash
   bash scripts/use-postgres.sh postgres
   DATABASE_URL="postgresql://...:5432/postgres" bunx prisma db push
   DATABASE_URL="postgresql://...:5432/postgres" bun prisma/seed.ts   # dummy branches, test accounts, 11 demo tickets
   bash scripts/use-postgres.sh sqlite   # back to local SQLite for everyday dev
   ```

   The schema is PostgreSQL-ready already (string-modelled enums, no JSON columns), so `db push`
   is all it takes. RLS can stay default — the app talks to Postgres over a privileged pooled
   connection from the Next.js server only; the Supabase anon key is not used by FC-CMS.

4. **Rotation habit:** whenever you want fresh demo data, re-run the seed command. For a clean
   test DB: `DATABASE_URL="postgresql://...:5432/postgres" bunx prisma db push --accept-data-loss`.

---

## Part 4 — Netlify (testing host)

Everything needed is already in the repo: `netlify.toml` (Next.js runtime + Node 20 +
`DISABLE_BACKGROUND_WORKERS=1`), a scheduled function `netlify/functions/fcms-workers.mjs`
(closure + round-robin sweeps every 15 min), and `postinstall: prisma generate`.

1. **Import the site.** Netlify → Add new site → Import an existing project → GitHub → pick the
   repo. `netlify.toml` is picked up automatically (build command `npx next build`, plugin
   `@netlify/plugin-nextjs`).

2. **Set environment variables** (Site configuration → Environment variables):

   | Key | Value |
   |---|---|
   | `DATABASE_URL` | Supabase **6543** pooled URL with `?pgbouncer=true&connection_limit=1` |
   | `SESSION_SECRET` | `openssl rand -hex 32` output (used to sign login cookies) |
   | `DISABLE_BACKGROUND_WORKERS` | `1` (already defaulted in netlify.toml — belt & braces) |
   | `FCMS_BASE_URL` | your final site URL, e.g. `https://fc-cms.netlify.app` (set after first deploy) |
   | `FCMS_API_KEY` | an integration key with **write** scope — create it in the app: Root Admin → Integration API Keys (dev key `fc_dev_crm_lms_2026_…` works for testing) |

   The last two feed the scheduled function that pings
   `POST /api/v1/integration/workers/run` every 15 minutes — that is what makes **auto-closure**
   and **round-robin retries** work on serverless, where in-process timers can't run.

3. **Deploy** → Site overview shows `https://<name>.netlify.app`. Open it, log in with the test
   accounts, and register a complaint end-to-end to confirm Supabase connectivity.

4. **Smoke test the deployment:**
   ```bash
   BASE="https://<name>.netlify.app"
   curl -s "$BASE/api/v1/public/branches" | head -c 300
   curl -s "$BASE/api/v1/integration/whoami" -H "x-api-key: <key>"
   curl -s -X POST "$BASE/api/v1/integration/workers/run" -H "x-api-key: <key>" -H 'content-type: application/json' -d '{}'
   ```

**Notes & limits (testing tier)**

- Emails: notifications land in the in-app **Notification Mailbox** (dev adapter) until you wire
  a real SMTP/SendGrid provider in `src/lib/notifications.ts`. Branch/central emails are blank
  by design until you set them in Root Admin → Settings.
- Attachments: stored privately server-side on Netlify's ephemeral filesystem — for a long-lived
  test, point storage at a Supabase Storage bucket (see `docs/migration-guide.md`).
- Every admin visit to the Master Complaint Panel also runs the sweeps on demand, so even without
  the scheduled function the demo flows work.

---

## Part 5 — Drive FC-CMS from another app through the API

FC-CMS exposes a complete REST surface under `/api/v1`. Full spec: `GET /api/v1/openapi` or
`docs/api-specification.md`. From your other app (Android APK, CRM, LMS, scheduler), you talk
**backend-to-backend with an API key**.

### Authentication

```
x-api-key: <your key>          # create in Root Admin → Integration API Keys
```

Scopes: `read` (GET endpoints), `write` (create complaints / change status / trigger workers).
Create **one key per consumer** (CRM key, LMS key, mobile-proxy key) and rotate freely — the hash
is stored, plaintext is shown once. Keep keys in your server or CI env, never inside an APK
bundle; if a mobile app must talk to FC-CMS directly, proxy through your own backend so the key
stays server-side.

### Envelope

Every response is `{ success, data?, error?: { code, message, details? }, correlationId }`.
Errors to handle: `VALIDATION_ERROR` (422), `API_KEY_INVALID` (401), `SCOPE_DENIED` (403),
`TICKET_CLOSED` / `INVALID_TRANSITION` (409/422), `RATE_LIMITED` (429).

### The endpoints you will actually use (x-api-key)

| Method | Path | Scope | Purpose |
|---|---|---|---|
| GET | `/api/v1/integration/whoami` | read | verify a key works |
| GET | `/api/v1/integration/branches` | read | branch list (+ IDs for complaint creation) |
| GET | `/api/v1/integration/categories` | read | complaint categories |
| POST | `/api/v1/integration/complaints` | write | **create a complaint on behalf of a member** |
| GET | `/api/v1/integration/tickets?status=&branchId=&page=` | read | filtered ticket list |
| GET | `/api/v1/integration/tickets/{ticketNumber}` | read | full ticket (status, assignee, history) |
| PATCH | `/api/v1/integration/tickets/{ticketNumber}` | write | status transition from your app |
| GET | `/api/v1/integration/stats` | read | branch × status matrix + SLA averages |
| POST | `/api/v1/integration/workers/run` | write | run closure + assignment sweeps now |

Public (keyless, rate-limited) endpoints also exist if your app wants to offer customer flows:
`GET /api/v1/public/branches`, `GET /api/v1/public/categories`, `POST /api/v1/public/complaints`,
`POST /api/v1/public/tickets/track` (Ticket ID + mobile), `POST /api/v1/public/tickets/{id}/reopen`.

### Register a complaint from the other app

```bash
curl -X POST "https://<site>.netlify.app/api/v1/integration/complaints" \
  -H "x-api-key: $FCMS_API_KEY" \
  -H "content-type: application/json" \
  -H "Idempotency-Key: crm-member-4821-complaint" \
  -d '{
    "customerName": "Riya Sharma",
    "customerPhone": "9876543210",
    "customerEmail": "riya@example.com",
    "branchId": "<branch id from GET /integration/branches>",
    "categoryId": "<category id from GET /integration/categories>",
    "description": "Treadmill 4 in cardio deck stopped mid-run and belt slipped.",
    "priority": "HIGH"
  }'
```

Response `201`:
```json
{ "success": true, "data": { "ticketNumber": "FC-2026-000015", "status": "NEW_COMPLAINT", "assigned": true } }
```

`assigned: true` means round-robin already picked the branch's next support lead. Send the same
`Idempotency-Key` again and you get the original ticket back instead of a duplicate (200).

### JavaScript (Node / React Native / CRM webhook handler)

```js
const BASE = process.env.FCMS_BASE_URL;
const KEY  = process.env.FCMS_API_KEY;

const res = await fetch(`${BASE}/api/v1/integration/tickets/FC-2026-000015`, {
  headers: { "x-api-key": KEY },
});
const { success, data, error } = await res.json();
if (!success) throw new Error(`${error.code}: ${error.message}`);

await fetch(`${BASE}/api/v1/integration/tickets/FC-2026-000015`, {
  method: "PATCH",
  headers: { "x-api-key": KEY, "content-type": "application/json" },
  body: JSON.stringify({ toStatus: "IN_PROGRESS", note: "Technician dispatched from CRM" }),
});
```

### Python (LMS job / batch sync)

```python
import os, requests

BASE = os.environ["FCMS_BASE_URL"]
H = {"x-api-key": os.environ["FCMS_API_KEY"]}

stats = requests.get(f"{BASE}/api/v1/integration/stats", headers=H).json()["data"]
for branch in stats["branches"]:
    print(branch["branchName"], branch["counts"], "unassigned:", branch["unassigned"])
```

### Recommended integration pattern

1. Sync branches + categories once into your app's config (refresh on change).
2. Create complaints with an `Idempotency-Key` derived from your own record ID.
3. Poll `GET /integration/tickets/{ticketNumber}` or `GET /integration/stats` on your schedule —
   or store the `ticketNumber` in the CRM/LMS record and let support staff work it inside FC-CMS.
4. Transition statuses from your app only where it makes sense; the state machine
   (`NEW_COMPLAINT → IN_PROGRESS → ON_HOLD/RESOLVED → CLOSED`) and the closed-forever rule are
   enforced at the API layer regardless of caller.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Netlify build: "Prisma client did not initialize" | `postinstall: prisma generate` exists — verify the Netlify build log ran npm install, not a cached copy |
| `P1001: can't reach database` on Netlify | using the 5432 URL or missing `?pgbouncer=true&connection_limit=1` on 6543 |
| Tickets stuck in NEW_COMPLAINT / RESOLVED not closing | set `FCMS_BASE_URL` + `FCMS_API_KEY` so the scheduled function can fire, or hit `POST /api/v1/integration/workers/run` once |
| 401 on integration calls | wrong/rotated key, or the `x-api-key` header missing |
| 429s from your app | you hit the rate limiter — back off, or raise limits via env (`RATE_LIMIT_*`) when you move to Redis-backed limits |
| Local SQLite resets oddly | the DB file is `db/custom.db`; `bun prisma/seed.ts` re-seeds deterministically |
