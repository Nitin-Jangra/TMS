# FitClass Complaint System — LMS Integration Guide

How the FitClass LMS (Leads Management System) talks to the complaint system (FC-CMS).
Everything the dashboard can do with a ticket is available over the REST API, and every
ticket event can be pushed back to the LMS as a signed webhook.

- Base URL: `https://<your-deployment>/api/v1`
- Machine-readable spec (OpenAPI 3.0): `GET /api/v1/openapi`
- Human-readable endpoint list: `/docs/api` on the deployment

## 1. Authentication

1. Sign in as Root Admin → **API Keys** → create a key named e.g. `FitClass LMS Production`.
2. Send it on every request, in either header:

```
x-api-key: <key>
Authorization: Bearer <key>
```

Scopes: `read` allows every `GET`; `write` allows `POST`, `PATCH` and `PUT`.
Check a key with `GET /integration/whoami`.

Every response uses the same envelope:

```json
{ "success": true, "data": { }, "correlationId": "9f2c…" }
{ "success": false, "error": { "code": "BRANCH_NOT_FOUND", "message": "…", "details": { } }, "correlationId": "9f2c…" }
```

Quote the `correlationId` when reporting a problem.

## 2. Referring to branches, categories and employees

You never need FC-CMS internal ids. Wherever a branch is expected you can send any of:

| What you send | Example |
|---|---|
| Branch code | `BR001` |
| Your LMS id for the branch (once stored, see §6) | `LMS-BR-17` |
| Branch name | `Sector 48` or `Sector 48, Gurugram` |
| FC-CMS id | `cmwenxd4z0000…` |

Categories are matched by name (`Equipment Issues`) or id. Employees are matched by email,
your LMS id, or FC-CMS id.

The 34 FitClass branches are listed by `GET /integration/branches`
(codes `BR001`, `BR002`, `BR005` … `BR036`).

## 3. Register a complaint

`POST /integration/complaints` (write)

```json
{
  "customerName": "Rahul Khanna",
  "customerPhone": "9123456701",
  "customerEmail": "rahul@example.com",
  "branchCode": "BR001",
  "category": "Equipment Issues",
  "description": "Treadmill 4 stops suddenly after 10 minutes.",
  "priority": "HIGH"
}
```

- Required: `customerName`, `customerPhone`, `description`, a branch and a category.
- `customerEmail` is optional. Without it the member gets no email updates.
- `priority`: `CRITICAL`, `HIGH`, `MEDIUM` (default) or `LOW`.
- Send an `Idempotency-Key` header (for example the LMS lead id). A repeat with the same
  key returns the original ticket with HTTP 200 and `"duplicate": true` instead of creating
  a second one.

Response (HTTP 201):

```json
{ "ticketNumber": "FC-2026-000123", "status": "NEW_COMPLAINT", "assigned": true, "duplicate": false,
  "branch": { "id": "…", "code": "BR001", "name": "Sector 48" },
  "category": { "id": "…", "name": "Equipment Issues" } }
```

Store `ticketNumber` against the lead — it is the key for every other call. The ticket is
assigned automatically to the next available support employee of that branch
(`"assigned": false` means the branch has nobody available; it waits in the unassigned queue).

## 4. Read tickets

`GET /integration/tickets` (read) — paginated list, newest first.

| Parameter | Meaning |
|---|---|
| `phone`, `email` | all tickets of one member |
| `status` | `NEW_COMPLAINT`, `IN_PROGRESS`, `ON_HOLD`, `RESOLVED`, `CLOSED`, or `OPEN` (any of the first three) |
| `branch` | branch code, LMS id or name |
| `priority`, `source` | `source` is `PORTAL`, `API_LMS` or `API_CRM` |
| `unassigned=true`, `overdue=true`, `escalated=true` | queues |
| `q` | keyword search — every word must appear in the ticket number, member name, phone, email, description, branch, category, assignee, status or priority |
| `ticketSearch`, `customerSearch`, `branchSearch`, `categorySearch`, `assigneeSearch` | keyword filter on one column (case-insensitive, partial match); `assigneeSearch=unassigned` returns unassigned tickets |
| `from`, `to` | created date range (`YYYY-MM-DD`) |
| `updatedSince` | ISO timestamp — only tickets changed since then (incremental sync) |
| `departmentId` | tickets of one department (`none` = without a department) |
| `sort`, `order` | sort by `ticketNumber`, `customer`, `branch`, `category`, `assignee`, `status` (lifecycle order), `priority` (Low → Critical) or `createdAt`; `order` is `asc` or `desc`. Default: newest first |
| `assignedToId` | tickets of one employee (staff id) |
| `page`, `pageSize` | `pageSize` max 100 |

`GET /integration/tickets/{ticketNumber}` (read) — the full record: status history, messages,
assignment history, attachments, SLA tracking, plus `allowedTransitions` for the current status.

`GET /integration/stats` (read) — branch × status matrix and SLA averages for dashboards.

## 5. Work on a ticket

All of these need the `write` scope. Add `"actorName": "Priya (LMS)"` to record which LMS
user did it; it appears in the ticket history.

| Action | Call | Body |
|---|---|---|
| Change status | `PATCH /integration/tickets/{n}` | `{ "toStatus": "IN_PROGRESS" }` |
| Put on hold | `PATCH /integration/tickets/{n}` | `{ "toStatus": "ON_HOLD", "reason": "Waiting for spare part" }` |
| Resolve | `PATCH /integration/tickets/{n}` | `{ "toStatus": "RESOLVED", "resolution": "Belt replaced" }` |
| Reply to the member (emailed) | `POST /integration/tickets/{n}/messages` | `{ "body": "…", "visibility": "PUBLIC" }` |
| Internal note (never emailed) | `POST /integration/tickets/{n}/messages` | `{ "body": "…" }` |
| Assign to a person | `POST /integration/tickets/{n}/assign` | `{ "employee": "asha@fitclass.in" }` |
| Auto-assign (round-robin) | `POST /integration/tickets/{n}/assign` | `{ "auto": true }` |
| Move to another branch | `POST /integration/tickets/{n}/transfer` | `{ "branch": "BR002" }` |
| Escalate | `POST /integration/tickets/{n}/escalate` | `{ "reason": "Member may cancel" }` |
| Reopen a resolved ticket | `POST /integration/tickets/{n}/reopen` | `{ "reason": "Still not fixed" }` |

Status rules (same as the dashboard; anything else returns HTTP 409 `INVALID_TRANSITION`):

```
NEW_COMPLAINT → IN_PROGRESS → ON_HOLD ⇄ IN_PROGRESS → RESOLVED → CLOSED (automatic)
                                                       RESOLVED → IN_PROGRESS (reopen, inside the window)
```

A resolved ticket closes by itself after the reopening window (72 hours by default).
Closed tickets are read-only for everyone, including the API (`TICKET_CLOSED`).

## 6. Keep branches and staff in sync

`POST /integration/branches` (write) — create or update a branch. Matched by `code`, or by
`externalId` when no code is sent. Only the fields you send are changed.

```json
{ "code": "BR001", "externalId": "LMS-BR-17", "notificationEmail": "sector48@fitclass.in" }
{ "code": "BR037", "name": "Sector 15", "city": "Gurugram", "address": "…", "externalId": "LMS-BR-40" }
```

Setting `externalId` once lets you use your own branch id everywhere afterwards.
`"isActive": false` hides a branch from the complaint form without deleting its history.

`POST /integration/employees` (write) — create or update branch staff. Matched by `email`.

```json
{ "email": "asha@fitclass.in", "name": "Asha Rawat", "branch": "BR030",
  "role": "SUPPORT_AGENT", "externalId": "LMS-EMP-77" }
```

- `role`: `SUPPORT_AGENT` (receives tickets through round-robin) or `BRANCH_MANAGER`.
- If no `password` is sent for a new employee, the response contains a one-time
  `temporaryPassword` to hand over.
- `"availabilityEnabled": false` takes someone out of the rotation (leave, day off);
  `"isActive": false` disables the login.
- Administrator accounts cannot be created or changed through the API.

`GET /integration/employees?branch=BR001` also returns the round-robin cursor, i.e. who was
assigned last in each branch.

## 7. Webhooks — get told when something happens

Instead of polling, give FC-CMS an HTTPS endpoint in the LMS:

```
PUT /integration/webhook
{ "url": "https://lms.fitclass.in/hooks/complaints", "secret": "<random string, 16+ characters>" }
```

(Also editable in Root Admin → Settings → General. Send `"url": ""` to switch it off.)
`POST /integration/webhook/test` sends a `webhook.test` event and reports whether your
endpoint accepted it.

Each event is one `POST` with a JSON body:

```json
{
  "id": "5f0c2a9e41b7d3c8a1e6f902",
  "event": "ticket.resolved",
  "occurredAt": "2026-11-17T10:42:11.000Z",
  "ticket": {
    "ticketNumber": "FC-2026-000123", "status": "RESOLVED", "priority": "HIGH", "source": "API_LMS",
    "customerName": "Rahul Khanna", "customerPhone": "9123456701", "customerEmail": "rahul@example.com",
    "description": "…",
    "branch": { "id": "…", "code": "BR001", "name": "Sector 48", "city": "Gurugram", "crmExternalId": "LMS-BR-17" },
    "category": { "id": "…", "name": "Equipment Issues" },
    "assignee": { "id": "…", "name": "Vikas Yadav", "email": "…", "crmExternalId": "" },
    "escalated": false, "reopenCount": 0,
    "createdAt": "…", "updatedAt": "…", "assignedAt": "…", "resolvedAt": "…", "autoCloseAt": "…", "closedAt": null,
    "slaResponseDueAt": "…", "slaResolutionDueAt": "…"
  },
  "data": { "fromStatus": "IN_PROGRESS", "toStatus": "RESOLVED", "note": "Belt replaced", "changedBy": "Priya (LMS)" }
}
```

| Event | When | `data` |
|---|---|---|
| `ticket.created` | complaint registered (portal, website widget or API) | — |
| `ticket.assigned` | assigned or reassigned | `method`, `assignedBy` |
| `ticket.status_changed` | moved to In Progress / On Hold | `fromStatus`, `toStatus`, `note`, `changedBy` |
| `ticket.resolved` | resolved | same as above |
| `ticket.reopened` | reopened by the member | `reason` |
| `ticket.closed` | closed automatically after the reopening window | `reason` |
| `ticket.escalated` | escalated | `reason`, `escalatedBy` |
| `ticket.transferred` | moved to another branch | `toBranch`, `transferredBy` |
| `ticket.message_added` | reply or internal note added | `visibility`, `body`, `author` |
| `ticket.feedback` | member rated the support (1–5) | `rating`, `comment` |
| `ticket.sla_warning` | most of the resolution time is used | `percentUsed` |
| `ticket.sla_breached` | resolution deadline missed (level 2) or far past it (level 3) | `percentUsed`, `level` |

Headers on every delivery:

```
X-FitClass-Event: ticket.resolved
X-FitClass-Delivery: 5f0c2a9e41b7d3c8a1e6f902
X-FitClass-Signature: sha256=<hex HMAC-SHA256 of the raw request body, keyed with your secret>
```

**Verify the signature** before trusting a delivery (Node.js example):

```js
import { createHmac, timingSafeEqual } from "node:crypto";

function isFromFitClass(rawBody, signatureHeader, secret) {
  const expected = "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected), b = Buffer.from(signatureHeader || "");
  return a.length === b.length && timingSafeEqual(a, b);
}
```

Delivery rules:

- Answer with any 2xx status within 8 seconds. Do slow work after responding.
- A failed delivery is retried once immediately, then dropped and recorded in the FC-CMS
  audit log (`WEBHOOK_FAILED`). There is no long-term retry queue, so for guaranteed
  consistency also run a periodic catch-up with `GET /integration/tickets?updatedSince=…`.
- The same event can occasionally arrive twice; use `id` to de-duplicate.
- Events caused by your own API calls are delivered too (compare `data.changedBy` / `source`
  if you need to ignore your own changes).

## 8. Scheduled job

Auto-closure of resolved tickets, retry of unassigned tickets, the SLA escalation ladder and
the daily digest run when this endpoint is called. Call it from any scheduler every 10–15 minutes:

```
POST /integration/workers/run      (write scope)
```

## 9. Error codes

| HTTP | Codes |
|---|---|
| 401 | `API_KEY_REQUIRED`, `API_KEY_INVALID` |
| 403 | `SCOPE_DENIED`, `FORBIDDEN` |
| 404 | `NOT_FOUND` |
| 409 | `INVALID_TRANSITION`, `TICKET_CLOSED`, `ALREADY_ESCALATED`, `INVALID_REOPEN_STATE`, `REOPEN_WINDOW_EXPIRED` |
| 422 | `VALIDATION_ERROR` (see `error.details`), `BRANCH_NOT_FOUND`, `CATEGORY_NOT_FOUND`, `EMPLOYEE_NOT_FOUND`, `ASSIGNMENT_ERROR`, `TRANSFER_ERROR`, `RESOLUTION_REQUIRED`, `HOLD_REASON_REQUIRED` |
| 500 | `INTERNAL_ERROR` |
