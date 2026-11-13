# Production Migration Guide (Development → Supabase Production)

FC-CMS was built so the development sandbox can be replaced by a production Supabase project
through configuration + migrations, without rewriting business logic.

## What moves, what never moves

**Migrates:** schema (version-controlled), business logic, configuration values set by the Root
Admin, notification templates.
**Never migrates:** dummy branches' test complaints, dummy employees/customers, dev API keys, dev
test accounts. Production branches/employees come from the FitClass CRM.

## Steps

1. **Create the production Supabase project.** Copy the connection strings; keep the service-role
   key backend-only.
2. **Apply the schema.** The Prisma schema is PostgreSQL-compatible (no SQLite-only types).
   Generate a migration baseline:
   ```bash
   DATABASE_URL="postgresql://…" bunx prisma migrate dev --name init
   DATABASE_URL="postgresql://…" bunx prisma migrate deploy
   ```
3. **RLS.** Enable RLS on all tables; the anon role gets zero direct grants. Public flows
   (complaint submission, tracking, reopen) go through the backend with the service role. See
   `docs/security.md` for the policy skeleton per table.
4. **Database functions/triggers.** The ticket-number sequence, cursor update and closure checks
   are transaction-safe in application code. Optionally mirror `ticket_sequences` as a Postgres
   sequence and add `updated_at` triggers; keep the cursor row under
   `SELECT … FOR UPDATE` (the Prisma interactive transaction already serializes the read+update —
   add the explicit lock when moving to PG):
   ```sql
   SELECT last_employee_id FROM branch_cursors WHERE branch_id = $1 FOR UPDATE;
   ```
5. **Authentication.** Two supported options:
   - Keep local credential auth and provision real staff accounts (rotate all passwords).
   - Implement the CRM auth adapter: replace `verifyPassword`/user lookup in `src/lib/auth.ts`
     with a CRM token check; sessions, RBAC and auditing stay unchanged. Enable MFA for
     ROOT_ADMIN.
6. **Sync branches and employees** from the FitClass CRM using the integration API in reverse
   (`POST /api/v1/integration/branches`-style sync or direct SQL), filling `crmExternalId` on
   `branch` and `staff_user`. Deactivate rows instead of deleting (history integrity).
7. **Emails.** Configure the official support mailbox:
   - Root Admin → Settings → General → `central_support_email`
   - Settings → Branch emails → per-branch address
   - Replace `devSend()` in `src/lib/notifications.ts` with the production provider adapter
     (SMTP/SendGrid/SES) using `EMAIL_PROVIDER_API_KEY`; the outbox/retry model is unchanged.
8. **Storage.** Point attachment storage at Supabase Storage (private bucket, signed URLs,
   malware-scan hook in the upload route).
9. **API keys.** Create production keys in the Root Admin panel (hash-only storage); deliver the
   plaintext to the CRM/LMS teams over a secure channel; disable dev keys.
10. **Environment configuration.** Set `SUPABASE_URL`, `DATABASE_URL`, `SESSION_SECRET` (new
    random value), `CRM_BASE_URL`, `CRM_API_KEY`, `CENTRAL_SUPPORT_EMAIL`,
    `EMAIL_PROVIDER_API_KEY`, `PUBLIC_APP_URL`, `ADMIN_APP_URL`, `REDIS_URL`,
    `RATE_LIMIT_WINDOW`, `RATE_LIMIT_MAX`. The production deployment must never reference
    development credentials.
11. **Background workers.** `src/instrumentation.ts` runs in the Node server process. For
    multi-instance production, replace the interval trigger with a single scheduled worker
    (Supabase cron / Cloud scheduler) calling `POST /api/v1/admin/workers/run` or invoking
    `runClosureSweep` directly — the sweep is idempotent, so overlap is harmless.
12. **Smoke tests.** Register a complaint end-to-end, verify assignment + emails, reopen within
    the window, force a closure sweep, confirm closed tickets are read-only for the Root Admin,
    and run the integration API contract checks from the CRM/LMS side.

## Configuration reference (backend)

```env
NODE_ENV=production
PORT=5000
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=
CRM_BASE_URL=
CRM_API_KEY=
CENTRAL_SUPPORT_EMAIL=
EMAIL_PROVIDER_API_KEY=
PUBLIC_APP_URL=
ADMIN_APP_URL=
REDIS_URL=
RATE_LIMIT_WINDOW=
RATE_LIMIT_MAX=
SESSION_SECRET=
```

## Adapters (single swap points)

| Concern | Dev (sandbox) | Production |
|---|---|---|
| Email delivery | `devSend()` outbox adapter | provider SDK / SMTP |
| Staff auth | local scrypt credentials | FitClass CRM adapter + MFA |
| Rate limiting store | in-memory Map | Redis |
| Attachment storage | local private directory | Supabase Storage bucket |
| Worker trigger | in-process interval | scheduler → `POST /admin/workers/run` |
