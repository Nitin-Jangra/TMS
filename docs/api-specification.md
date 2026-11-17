# FC-CMS API Specification

Machine-readable OpenAPI 3.0 spec: **GET `/api/v1/openapi`** (also linked from `/docs/api`).
All endpoints return the envelope `{ success: boolean, data?: T, error?: { code, message, details? }, correlationId: string }`
and an `x-correlation-id` response header.

## Authentication

| Surface | Mechanism |
|---|---|
| Public (`/api/v1/public/*`) | none — rate limited |
| Support / Branch / Admin (`/api/v1/{support,branch,admin}/*`) | session cookie `fcms_session` (staff login) |
| Integration (`/api/v1/integration/*`) | header `x-api-key` with scopes `read`, `write` |

## Endpoint map

### Public
| Method | Path | Notes |
|---|---|---|
| GET | `/api/v1/public/branches` | active branches |
| GET | `/api/v1/public/categories` | active categories |
| POST | `/api/v1/public/complaints` | create complaint; `Idempotency-Key` header supported; 201 created / 200 duplicate / 422 validation |
| POST | `/api/v1/public/tickets/track` | `{ ticketNumber, mobileNumber }`; generic 404 on mismatch |
| POST | `/api/v1/public/tickets/{ticketId}/reopen` | `{ mobileNumber, reason }`; window + state validated |
| POST | `/api/v1/public/tickets/attachments` | multipart upload; ticket+mobile verified; MIME/size limited |

### Support (session)
| Method | Path | Notes |
|---|---|---|
| GET | `/api/v1/support/dashboard/summary` | role-aware (EMPLOYEE / BRANCH / CENTRAL) |
| GET | `/api/v1/support/tickets` | filters: status, branchId, categoryId, priority, unassigned, overdue, q, page, pageSize |
| GET | `/api/v1/support/tickets/{id}` | detail incl. messages/history/assignments/attachments (RBAC) |
| PATCH | `/api/v1/support/tickets/{id}/status` | `{ toStatus, note?, reason?, resolution? }`; closed → 409 |
| POST | `/api/v1/support/tickets/{id}/resolve` | `{ resolution }` mandatory |
| POST | `/api/v1/support/tickets/{id}/notes` | internal note (never emailed) |
| POST | `/api/v1/support/tickets/{id}/replies` | customer-facing reply |
| GET | `/api/v1/support/tickets/{id}/history` | status + assignment + reopen history |
| POST | `/api/v1/support/tickets/{id}/assign` | `{ employeeId }` or `{ transferBranchId }` |
| POST | `/api/v1/support/tickets/{id}/escalate` | `{ reason? }` |
| GET | `/api/v1/support/assignment/unassigned` | NEW_COMPLAINT without assignee (role-scoped) |
| GET | `/api/v1/support/assignment/eligible-employees/{branchId}` | rotation candidates + cursor |
| GET | `/api/v1/support/employees` | directory (availability managers) |
| PATCH | `/api/v1/support/employees/{id}/availability` | `{ availabilityEnabled }`; triggers retry |

### Branch (session)
| Method | Path | Notes |
|---|---|---|
| GET | `/api/v1/branch/dashboard` | branch summary + team |
| GET | `/api/v1/branch/tickets` | branch-scoped list |
| GET | `/api/v1/branch/employees` | branch employees |
| GET | `/api/v1/branch/reports` | categories / employees / SLA breaches |

### Admin (session; Root unless noted)
| Method | Path | Notes |
|---|---|---|
| GET | `/api/v1/admin/overview` | master complaint panel (Root + Central admin) |
| GET / PUT | `/api/v1/admin/settings` | all settings; PUT is audited |
| GET / PUT | `/api/v1/admin/settings/closure-policy` | reopen window; `applyToExisting` recompute |
| GET | `/api/v1/admin/audit-logs` | filters: action, q; read-only |
| GET | `/api/v1/admin/reports` | analytics + SLA breaches |
| GET | `/api/v1/admin/notifications` | outbox viewer (Root + Central admin) |
| POST | `/api/v1/admin/notifications/{id}/retry` | re-deliver |
| GET / POST | `/api/v1/admin/api-keys` | integration key management |
| POST / PATCH | `/api/v1/admin/categories` | create / toggle |
| GET / PUT | `/api/v1/admin/sla` | SLA policies (minutes) |
| GET / PATCH | `/api/v1/admin/branches` | branch emails / active flag |
| POST | `/api/v1/admin/workers/run` | trigger closure + assignment sweeps now |

### Integration (x-api-key, or `Authorization: Bearer <key>`)

Full guide for the LMS team: [lms-integration.md](lms-integration.md).

| Method | Path | Scope | Notes |
|---|---|---|---|
| GET | `/api/v1/integration/whoami` | read | key verification |
| POST | `/api/v1/integration/complaints` | write | create on behalf of a member; branch by id / code / external id / name; email optional; `Idempotency-Key` supported |
| GET | `/api/v1/integration/tickets` | read | filters: status, priority, source, branch, phone, email, escalated, overdue, unassigned, q, from, to, updatedSince + pagination |
| GET | `/api/v1/integration/tickets/{ticketNumber}` | read | full ticket (history, messages, assignments, attachments, SLA) |
| PATCH | `/api/v1/integration/tickets/{ticketNumber}` | write | status transition (closed rejected) |
| GET / POST | `/api/v1/integration/tickets/{ticketNumber}/messages` | read / write | conversation; POST adds a PUBLIC reply or INTERNAL note |
| POST | `/api/v1/integration/tickets/{ticketNumber}/assign` | write | `{ employee }` or `{ auto: true }` |
| POST | `/api/v1/integration/tickets/{ticketNumber}/transfer` | write | `{ branch }` |
| POST | `/api/v1/integration/tickets/{ticketNumber}/escalate` | write | `{ reason? }` |
| POST | `/api/v1/integration/tickets/{ticketNumber}/reopen` | write | `{ reason }`; window + state validated |
| GET / POST | `/api/v1/integration/branches` | read / write | branch master; POST upserts by code or externalId |
| GET / POST | `/api/v1/integration/employees` | read / write | branch staff + round-robin cursors; POST upserts by email (branch roles only) |
| GET | `/api/v1/integration/categories` | read | active categories |
| GET | `/api/v1/integration/stats` | read | branch × status matrix + SLA averages |
| GET / PUT | `/api/v1/integration/webhook` | read / write | outbound webhook endpoint + signing secret |
| POST | `/api/v1/integration/webhook/test` | write | send a signed `webhook.test` event |
| POST | `/api/v1/integration/workers/run` | write | trigger closure + assignment sweeps (call from a scheduler) |

## Error codes

`VALIDATION_ERROR` (422) · `RATE_LIMITED` / `TEMPORARILY_BLOCKED` (429) · `UNAUTHORIZED` /
`API_KEY_REQUIRED` / `API_KEY_INVALID` (401) · `FORBIDDEN` / `SCOPE_DENIED` (403) · `NOT_FOUND`
(404) · `TRACK_NOT_FOUND` (404, generic) · `INVALID_TRANSITION`, `TICKET_CLOSED`, `INVALID_REOPEN_STATE`,
`REOPEN_WINDOW_EXPIRED`, `RESOLUTION_REQUIRED`, `HOLD_REASON_REQUIRED`, `ASSIGNMENT_ERROR`,
`ALREADY_ESCALATED`, `BRANCH_NOT_FOUND`, `CATEGORY_NOT_FOUND`, `EMPLOYEE_NOT_FOUND`, `TRANSFER_ERROR`, `BRANCH_INACTIVE`, `CATEGORY_INACTIVE`, `FILE_TOO_LARGE`,
`FILE_TYPE_NOT_ALLOWED` (409/422) · `INTERNAL_ERROR` (500).
