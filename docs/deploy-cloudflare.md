# Deploy & Test FC-CMS on Cloudflare — Free Tier

Everything you need to (1) host FC-CMS for free on **Cloudflare Workers + D1**, (2) wire it up to
**GitHub** for automatic deploys, and (3) point **another app (CRM / LMS / Android APK)** at its
REST API. The Supabase/Netlify path stays available in `docs/deployment-guide.md`; this guide is
the all-Cloudflare alternative — one account, one bill: ₹0.

```
Browser / Android app ──HTTPS──▶ Cloudflare Worker (Next.js via OpenNext)
                                     │
                                     ├─▶ D1 database  (SQLite at the edge, free)
                                     └─▶ Workers Assets (static files)
```

**What "free" covers (per day/month, current Cloudflare public limits):**

| Resource | Free allowance | FC-CMS test usage |
|---|---|---|
| Worker requests | **100,000 / day** | hundreds–thousands during testing |
| Worker CPU time | **10 ms / request** | handled — see "CPU budget" below |
| Worker bundle size | **3 MiB compressed** | FC-CMS builds to ≈ **2.25 MiB** gzip |
| D1 rows read | **5,000,000 / day** | each page load = a handful of queries |
| D1 rows written | **100,000 / day** | each complaint ≈ 10 rows |
| D1 storage | **5 GB total, 500 MB per DB** | seed + hundreds of tickets ≈ < 10 MB |
| Images (next/image) | 5,000 unique transformations / month | logo + UI images only |

---

## Part 0 — What was already wired up in the repo

You don't need to write any of this; it is committed and validated:

| File | Purpose |
|---|---|
| `wrangler.jsonc` | Worker config: D1 binding `DB`, nodejs_compat, assets, images |
| `open-next.config.ts` | OpenNext Cloudflare adapter config |
| `src/lib/db.ts` | Dual-mode Prisma client: engine+SQLite on Node, **D1 driver adapter on Workers** |
| `src/lib/db.ts` → `runInTransaction` | Interactive transactions on Node; sequential execution on D1 (D1 has none) |
| `src/lib/attachment-store.ts` | Attachment bytes: `db/uploads/` locally, **D1 blob rows** on Workers |
| `src/lib/auth.ts` | scrypt hashes carry their cost (`scrypt$1024$8:…`) so Workers stay under 10 ms CPU |
| `scripts/d1-export.mjs` | Exports local SQLite → `cloudflare/d1/*.sql` (schema + seed + reset) |
| `cloudflare/d1/0001_schema.sql` | Full DDL from `prisma/schema.prisma` |
| `cloudflare/d1/0002_seed_data.sql` | All dummy data; test passwords re-hashed for the CPU budget |
| `cloudflare/d1/0003_reset_data.sql` | Child-first wipe for clean re-seeding |
| `scripts/verify-cloudflare.sh` | 10-check hosted smoke test (login, scoping, API, lifecycle) |
| `.github/workflows/deploy-cloudflare.yml` | Optional push-to-deploy via GitHub Actions |
| package.json scripts | `cf:build`, `cf:preview`, `cf:deploy`, `d1:export` |

Runtime modes, both tested end-to-end:
- **`bun run dev`** — unchanged: Prisma engine + local SQLite file (`db/custom.db`).
- **`bun run cf:preview`** — the real Cloudflare workerd runtime on your machine with a local D1.
- **`bun run cf:deploy`** — the same bundle pushed to your free Cloudflare account.

---

## Part 1 — Prerequisites

1. Node.js 20+ and Bun (`curl -fsSL https://bun.sh/install | bash`).
2. A free **Cloudflare account** — [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up)
   (email + password only; no card needed for Workers, D1, and Images).
3. A **GitHub** account for automatic deploys (optional; CLI deploy works without it).

Install dependencies once:

```bash
bun install        # adds @opennextjs/cloudflare, @prisma/adapter-d1, wrangler
```

---

## Part 2 — Log in to Cloudflare from the CLI

```bash
bunx wrangler login          # opens the browser; accept the permissions prompt
bunx wrangler whoami         # should print your account
```

---

## Part 3 — Create the D1 database

```bash
bunx wrangler d1 create fitclass
```

Output contains your **database_id**. Paste it into `wrangler.jsonc`:

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "fitclass",
    "database_id": "REPLACE_WITH_YOUR_D1_DATABASE_ID"   // ← paste yours
  }
]
```

---

## Part 4 — Load schema + dummy data into D1

The export script reads your local seeded SQLite database and emits SQL the D1 adapter accepts
(epoch datetimes normalized to the adapter's TEXT format; test-account passwords re-hashed with
scrypt N=1024 so login fits the 10 ms CPU budget).

```bash
# 0. Make sure local data exists (skip if db/custom.db is already seeded)
bunx prisma db push && bun prisma/seed.ts

# 1. Export → cloudflare/d1/*.sql
bun run d1:export

# 2. Apply to the REMOTE D1 (schema once, then seed)
bunx wrangler d1 execute fitclass --remote --file=cloudflare/d1/0001_schema.sql
bunx wrangler d1 execute fitclass --remote --file=cloudflare/d1/0002_seed_data.sql
```

Re-seed later (e.g. after changing seed data): `bun run d1:export`, then apply
`0003_reset_data.sql` **before** `0002_seed_data.sql` again.

Want to rehearse locally first? The same commands with `--local` fill the local D1 that
`bun run cf:preview` uses:

```bash
bunx wrangler d1 execute DB --local --file=cloudflare/d1/0001_schema.sql
bunx wrangler d1 execute DB --local --file=cloudflare/d1/0002_seed_data.sql
bun run cf:build && bunx opennextjs-cloudflare preview   # workerd on http://localhost:8787
```

---

## Part 5 — Set the session secret and deploy

```bash
bunx wrangler secret put SESSION_SECRET     # paste any long random string when asked
bun run cf:deploy
```

`cf:deploy` = `opennextjs-cloudflare build && opennextjs-cloudflare deploy`. First deploy prints
your public URL:

```
https://fitclass-complaints.<your-subdomain>.workers.dev
```

That URL is HTTPS out of the box, serves the whole app (customer portal, staff dashboards,
`/api/v1`), and is what you give to testers and to the APK.

Non-secret env vars already live in `wrangler.jsonc` (`DISABLE_BACKGROUND_WORKERS=1` — Workers
isolates are ephemeral, so the in-process 60 s sweeps are off; see Part 8 for the replacement).

---

## Part 6 — Test the hosted deployment

```bash
BASE_URL=https://fitclass-complaints.<your-subdomain>.workers.dev bash scripts/verify-cloudflare.sh
```

10 checks: landing page, admin login, tenant-wide list, branch isolation, API-key complaint
creation + round-robin, tracking, status flow with mandatory resolution, sweep endpoint,
401 rejection.

Browser walkthrough with the seeded accounts (same as local):

| Persona | Email | Password | Lands on |
|---|---|---|---|
| Root Admin | `admin@fitclass.dev` | `Admin@123` | `/admin` master panel (all branches) |
| Central Admin | `central.admin@fitclass.dev` | `Central@123` | `/staff` |
| Sector 48 agent | `support.b001.a@fitclass.dev` | `Support@123` | `/staff` branch dashboard |
| Gurugram Central agent | `support.b003.a@fitclass.dev` | `Support@123` | `/staff` |

Also click **Complaint** on the home page → *Register a complaint* → submit → copy the ticket ID →
*Track a complaint* with ID + mobile.

Caveats that are **expected** on the free Cloudflare path:

- **Attachments** cap at ≈1.8 MB (stored as a D1 blob row; hard 2 MB D1 row limit). Locally the
  10 MB admin-configured limit still applies.
- **Multi-step writes are not atomic** on D1 (no interactive transactions). At test traffic this
  is invisible; a collision on the unique ticket number simply returns a 500 that the customer
  can retry.
- **Background sweeps don't run on a timer** — see Part 8.

---

## Part 7 — GitHub: automatic deploys

**Option A (recommended, no YAML): Workers Builds**

1. Push the repo:
   ```bash
   git init && git add -A && git commit -m "FC-CMS with Cloudflare deployment"
   git remote add origin https://github.com/<you>/fc-cms.git
   git push -u origin main
   ```
2. Cloudflare dashboard → **Workers & Pages → Create → Workers → Connect to Git** → pick the repo.
3. Build settings are auto-detected for Next.js:
   - Build command: `npx opennextjs-cloudflare build`
   - Deploy command: `npx opennextjs-cloudflare deploy`
   - Add a **build variable** `DATABASE_URL = file:./db/custom.db` (build-time only; runtime uses D1).
4. **Variables and Secrets** section: add `SESSION_SECRET` (secret). The first build deploys;
   every push to `main` redeploys. Non-main branches get separate preview URLs — perfect for
   testing features before merging.

**Option B (GitHub Actions):** add the repo secrets `CLOUDFLARE_API_TOKEN` (template: account →
*Workers Scripts:Edit*, *D1:Edit*, *Account Settings:Read*) and `CLOUDFLARE_ACCOUNT_ID`. The
committed `.github/workflows/deploy-cloudflare.yml` then rebuilds + re-seeds + deploys on every
push to `main`. Delete the file if you pick Option A.

---

## Part 8 — The background sweeps on Workers (closure + assignment retry)

Two sweeps normally run every 60 s inside the server. Workers isolates are ephemeral, so instead:

- **Manual:** Root Admin panel → **Run workers now** button (calls
  `POST /api/v1/admin/workers/run`).
- **Scheduled (free):** any external cron — e.g. [cron-job.org](https://cron-job.org) every
  15 minutes:
  ```
  POST {BASE_URL}/api/v1/integration/workers/run
  x-api-key: fc_dev_crm_lms_2026_a1b2c3d4e5f6g7h8
  ```
- **From the APK/CRM:** call the same endpoint after any write, or on app start.

Auto-closure after the reopen window and unassigned-ticket retries then keep working unchanged.

---

## Part 9 — Point another app (APK / CRM / LMS) at the hosted API

Base URL for every request: `https://fitclass-complaints.<your-subdomain>.workers.dev/api/v1`
Authenticate with the header `x-api-key: fc_dev_crm_lms_2026_a1b2c3d4e5f6g7h8` (the seeded dev
key; rotate it from Root Admin → API Keys when you go live).

| Task | Method + path |
|---|---|
| Discover branches / categories | `GET /branches`, `GET /categories` |
| Register a complaint from the APK | `POST /integration/complaints` |
| Ticket lookup by number | `GET /integration/tickets/{ticketNumber}` |
| Ticket queue with filters | `GET /integration/tickets?branchCode=BR001&status=NEW_COMPLAINT` |
| Tenant stats | `GET /integration/stats` |
| Trigger sweeps | `POST /integration/workers/run` |
| Who am I (key check) | `GET /integration/whoami` |

Register a complaint from an Android app (`OkHttp`):

```kotlin
val body = mapOf(
    "customerName" to "Ravi Kumar",
    "customerPhone" to "9812345678",
    "customerEmail" to "ravi@example.com",
    "branchId" to "<id from GET /branches>",
    "categoryId" to "<id from GET /categories>",
    "description" to "Treadmill belt slipping",
    "priority" to "HIGH",
    "idempotencyKey" to UUID.randomUUID().toString()  // safe retries
)
val json = OkHttpClient()
    .newCall(Request.Builder()
        .url("https://fitclass-complaints.<subdomain>.workers.dev/api/v1/integration/complaints")
        .header("x-api-key", "fc_dev_crm_lms_2026_a1b2c3d4e5f6g7h8")
        .post("""{"customerName":"Ravi Kumar", ...}""".toRequestBody("application/json".toMediaType()))
        .build())
    .execute().use { it.body!!.string() }
```

Response:

```json
{ "success": true,
  "data": { "ticketNumber": "FC-2026-000077", "status": "NEW_COMPLAINT", "assigned": true } }
```

Full endpoint list with payload schemas: the deployed app itself publishes an OpenAPI document at
`/api/v1/openapi` and a human-readable reference page at `/docs/api`.

---

## Part 10 — Troubleshooting

| Symptom | Cause → Fix |
|---|---|
| `Error 1102` on `/login` | CPU over 10 ms — only possible if seeded hashes were generated with default scrypt N. Re-run `bun run d1:export` (re-hashes to N=1024) and re-apply `0002_seed_data.sql`. |
| Deploy error: `could not get D1 database_id` | Placeholder still in `wrangler.jsonc` → paste the id from `wrangler d1 create fitclass`. |
| Runtime: `[fcms] D1 binding not found` | Worker deployed without the D1 binding → deploy from the repo root with `wrangler.jsonc` present (Workers Builds users: re-run the build). |
| `Inconsistent column data: expected a string in column …` | Rows were inserted with epoch-integer datetimes (pre-normalization export) → re-run `bun run d1:export` and apply `0003_reset_data.sql` then `0002_seed_data.sql`. |
| `UNIQUE constraint failed: Branch.code` while seeding | Old rows still present → apply `0003_reset_data.sql` first, then `0002_seed_data.sql`. |
| `FOREIGN KEY constraint failed` while resetting | Older `0003_reset_data.sql` deleted parents first → re-run `bun run d1:export` (deletes are child-first now). |
| `Transition NEW_COMPLAINT → RESOLVED is not allowed` | Business rule, not a bug: the API requires `PATCH …/status` → `IN_PROGRESS` before `POST …/resolve`. |
| Worker size error at deploy (>3 MiB) | Shouldn't happen (≈2.25 MiB); if dependencies push it over, run `bun run cf:build` and check `wrangler deploy --dry-run` output, then trim unused imports. |
| Login works locally, fails hosted | Hosted DB has different hashes than the runtime expects → re-export + re-seed (Part 4). |

---

## Part 11 — Going beyond testing

When this graduates from a test host to production:

1. **Database:** keep D1 (it scales with Workers) or move to Supabase PostgreSQL with the
   Supabase path in `docs/deployment-guide.md`; the Prisma schema is portable to both.
2. **Real emails:** swap the outbox writer in `src/lib/notifications.ts` to Resend/SES and drain
   `Notification` rows from the sweep endpoint.
3. **API keys:** stop storing plaintext `apiKey` (production mode stores hash only) and rotate the
   dev key from Root Admin → API Keys.
4. **Custom domain:** Workers → your worker → Domains & Routes → add `support.fitclass.in`
   (free, includes TLS).
5. **Cron:** upgrade to Workers Paid ($5/month) to attach native Cron Triggers and lift the 10 ms
   CPU limit if you outgrow the free tier.
