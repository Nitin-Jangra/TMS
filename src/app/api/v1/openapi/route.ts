// OpenAPI 3.0 specification for the FC-CMS REST API (served at /api/v1/openapi).

import { NextResponse } from "next/server";

const spec = {
  openapi: "3.0.3",
  info: {
    title: "FitClass Complaint Management System API",
    version: "1.1.0",
    description:
      "Complete REST API for the FitClass Complaint Management System (FC-CMS). " +
      "Public endpoints power the client portal; staff endpoints use session cookies; " +
      "integration endpoints authenticate with an x-api-key header for the FitClass LMS and other external systems, which can also receive signed webhooks for every ticket event.",
  },
  servers: [{ url: "/api/v1" }],
  tags: [
    { name: "Auth", description: "Staff authentication (session cookie)" },
    { name: "Public", description: "Customer portal endpoints (no account required)" },
    { name: "Support", description: "Staff dashboards and ticket operations" },
    { name: "Branch", description: "Branch manager operations" },
    { name: "Admin", description: "Root Admin configuration and monitoring" },
    { name: "Integration", description: "CRM / LMS integration (x-api-key)" },
  ],
  paths: {
    "/auth/login": {
      post: {
        tags: ["Auth"], summary: "Staff login",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["email", "password"], properties: { email: { type: "string" }, password: { type: "string" } } } } } },
        responses: { "200": { description: "Session cookie set" }, "401": { description: "Invalid credentials" }, "429": { description: "Rate limited" } },
      },
    },
    "/auth/logout": { post: { tags: ["Auth"], summary: "Sign out", responses: { "200": { description: "OK" } } } },
    "/auth/me": { get: { tags: ["Auth"], summary: "Current staff user", responses: { "200": { description: "OK" } } } },
    "/public/branches": { get: { tags: ["Public"], summary: "Active branches", responses: { "200": { description: "OK" } } } },
    "/public/categories": { get: { tags: ["Public"], summary: "Active complaint categories", responses: { "200": { description: "OK" } } } },
    "/public/complaints": {
      post: {
        tags: ["Public"], summary: "Register a complaint",
        parameters: [{ name: "Idempotency-Key", in: "header", schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["customerName", "customerPhone", "customerEmail", "branchId", "categoryId", "description", "privacyConsent"],
                properties: {
                  customerName: { type: "string" }, customerPhone: { type: "string" }, customerEmail: { type: "string" },
                  branchId: { type: "string" }, categoryId: { type: "string" }, description: { type: "string" },
                  privacyConsent: { type: "boolean", enum: [true] },
                },
              },
            },
          },
        },
        responses: { "201": { description: "Ticket created (FC-YYYY-NNNNNN)" }, "200": { description: "Idempotent duplicate" }, "422": { description: "Validation error" } },
      },
    },
    "/public/tickets/track": {
      post: {
        tags: ["Public"], summary: "Track a ticket (Ticket ID + registered mobile)",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["ticketNumber", "mobileNumber"], properties: { ticketNumber: { type: "string", example: "FC-2026-000001" }, mobileNumber: { type: "string", example: "9123456701" } } } } } },
        responses: { "200": { description: "Customer-visible ticket projection" }, "404": { description: "Generic not-found (no existence leaks)" } },
      },
    },
    "/public/tickets/{ticketId}/reopen": {
      post: {
        tags: ["Public"], summary: "Reopen a resolved ticket within the window",
        parameters: [{ name: "ticketId", in: "path", required: true, schema: { type: "string" } }],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["mobileNumber", "reason"], properties: { mobileNumber: { type: "string" }, reason: { type: "string" } } } } } },
        responses: { "200": { description: "Reopened" }, "404": { description: "Ticket/mobile mismatch" }, "409": { description: "Closed / window expired / invalid state" } },
      },
    },
    "/public/tickets/attachments": {
      post: {
        tags: ["Public"], summary: "Upload an attachment to a ticket (private storage)",
        requestBody: { required: true, content: { "multipart/form-data": { schema: { type: "object", properties: { ticketNumber: { type: "string" }, mobileNumber: { type: "string" }, file: { type: "string", format: "binary" } }, required: ["ticketNumber", "mobileNumber", "file"] } } } },
        responses: { "201": { description: "Stored" }, "422": { description: "Type/size rejected" } },
      },
    },
    "/support/dashboard/summary": { get: { tags: ["Support"], summary: "Role-aware dashboard summary", responses: { "200": { description: "OK" } } } },
    "/support/tickets": {
      get: {
        tags: ["Support"], summary: "Role-scoped ticket list",
        parameters: [
          { name: "status", in: "query", schema: { type: "string", enum: ["IN_PROGRESS", "ON_HOLD", "RESOLVED", "CLOSED"] } },
          { name: "branchId", in: "query", schema: { type: "string" } },
          { name: "assignedToId", in: "query", schema: { type: "string" } },
          { name: "categoryId", in: "query", schema: { type: "string" } },
          { name: "priority", in: "query", schema: { type: "string", enum: ["CRITICAL", "HIGH", "MEDIUM", "LOW"] } },
          { name: "unassigned", in: "query", schema: { type: "string", enum: ["true"] } },
          { name: "overdue", in: "query", schema: { type: "string", enum: ["true"] } },
          { name: "q", in: "query", schema: { type: "string" }, description: "Ticket number / customer name / phone" },
          { name: "page", in: "query", schema: { type: "integer" } },
          { name: "pageSize", in: "query", schema: { type: "integer" } },
        ],
        responses: { "200": { description: "OK" } },
      },
    },
    "/support/tickets/{ticketId}": { get: { tags: ["Support"], summary: "Ticket detail (RBAC-checked)", parameters: [{ name: "ticketId", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "OK" }, "403": { description: "No access" } } } },
    "/support/tickets/{ticketId}/status": { patch: { tags: ["Support"], summary: "Status transition (validated; closed tickets rejected)", parameters: [{ name: "ticketId", in: "path", required: true, schema: { type: "string" } }], requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { toStatus: { type: "string" }, note: { type: "string" }, reason: { type: "string" }, resolution: { type: "string" } } } } } }, responses: { "200": { description: "OK" }, "409": { description: "Closed / invalid transition" } } } },
    "/support/tickets/{ticketId}/resolve": { post: { tags: ["Support"], summary: "Resolve with mandatory resolution message", parameters: [{ name: "ticketId", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "OK" } } } },
    "/support/tickets/{ticketId}/notes": { post: { tags: ["Support"], summary: "Add internal note (never emailed)", parameters: [{ name: "ticketId", in: "path", required: true, schema: { type: "string" } }], responses: { "201": { description: "OK" } } } },
    "/support/tickets/{ticketId}/replies": { post: { tags: ["Support"], summary: "Send customer-facing reply", parameters: [{ name: "ticketId", in: "path", required: true, schema: { type: "string" } }], responses: { "201": { description: "OK" } } } },
    "/support/tickets/{ticketId}/history": { get: { tags: ["Support"], summary: "Status + assignment + reopen history", parameters: [{ name: "ticketId", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "OK" } } } },
    "/support/tickets/{ticketId}/assign": { post: { tags: ["Support"], summary: "Manual assign / reassign / transfer branch", parameters: [{ name: "ticketId", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "OK" } } } },
    "/support/tickets/{ticketId}/escalate": { post: { tags: ["Support"], summary: "Escalate ticket", parameters: [{ name: "ticketId", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "OK" } } } },
    "/support/assignment/unassigned": { get: { tags: ["Support"], summary: "Unassigned queue", responses: { "200": { description: "OK" } } } },
    "/support/assignment/eligible-employees/{branchId}": { get: { tags: ["Support"], summary: "Round-robin eligible employees + cursor", parameters: [{ name: "branchId", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "OK" } } } },
    "/support/employees": { get: { tags: ["Support"], summary: "Employee directory (availability management)", responses: { "200": { description: "OK" } } } },
    "/support/employees/{employeeId}/availability": { patch: { tags: ["Support"], summary: "Toggle availability (triggers unassigned retry)", parameters: [{ name: "employeeId", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "OK" } } } },
    "/branch/dashboard": { get: { tags: ["Branch"], summary: "Branch dashboard", responses: { "200": { description: "OK" } } } },
    "/branch/tickets": { get: { tags: ["Branch"], summary: "Branch tickets", responses: { "200": { description: "OK" } } } },
    "/branch/employees": { get: { tags: ["Branch"], summary: "Branch employees", responses: { "200": { description: "OK" } } } },
    "/branch/reports": { get: { tags: ["Branch"], summary: "Branch reports", responses: { "200": { description: "OK" } } } },
    "/admin/overview": { get: { tags: ["Admin"], summary: "Master complaint panel (branch x status matrix + assignments)", responses: { "200": { description: "OK" } } } },
    "/admin/settings": { get: { tags: ["Admin"], summary: "System settings", responses: { "200": { description: "OK" } } }, put: { tags: ["Admin"], summary: "Update settings (audited)", responses: { "200": { description: "OK" } } } },
    "/admin/settings/closure-policy": { get: { tags: ["Admin"], summary: "Closure/reopen policy", responses: { "200": { description: "OK" } } }, put: { tags: ["Admin"], summary: "Update closure policy", responses: { "200": { description: "OK" } } } },
    "/admin/audit-logs": { get: { tags: ["Admin"], summary: "Audit log viewer", responses: { "200": { description: "OK" } } } },
    "/admin/reports": { get: { tags: ["Admin"], summary: "Analytics and SLA reports", responses: { "200": { description: "OK" } } } },
    "/admin/notifications": { get: { tags: ["Admin"], summary: "Notification outbox (dev mailbox)", responses: { "200": { description: "OK" } } } },
    "/admin/notifications/{id}/retry": { post: { tags: ["Admin"], summary: "Retry a notification", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "OK" } } } },
    "/admin/api-keys": { get: { tags: ["Admin"], summary: "Integration API clients", responses: { "200": { description: "OK" } } }, post: { tags: ["Admin"], summary: "Create API key", responses: { "201": { description: "OK" } } } },
    "/admin/categories": { post: { tags: ["Admin"], summary: "Create category", responses: { "201": { description: "OK" } } }, patch: { tags: ["Admin"], summary: "Enable/disable category", responses: { "200": { description: "OK" } } } },
    "/admin/sla": { get: { tags: ["Admin"], summary: "SLA policies", responses: { "200": { description: "OK" } } }, put: { tags: ["Admin"], summary: "Update SLA policies", responses: { "200": { description: "OK" } } } },
    "/admin/branches": { get: { tags: ["Admin"], summary: "All branches", responses: { "200": { description: "OK" } } }, patch: { tags: ["Admin"], summary: "Update branch email / active flag", responses: { "200": { description: "OK" } } } },
    "/admin/workers/run": { post: { tags: ["Admin"], summary: "Trigger closure + assignment sweeps now", responses: { "200": { description: "OK" } } } },
    "/integration/whoami": { get: { tags: ["Integration"], summary: "Verify API key and list its scopes", responses: { "200": { description: "OK" } } } },
    "/integration/branches": {
      get: { tags: ["Integration"], summary: "Branches (active only unless includeInactive=true)", parameters: [{ name: "includeInactive", in: "query", schema: { type: "string", enum: ["true"] } }], responses: { "200": { description: "OK" } } },
      post: { tags: ["Integration"], summary: "Create or update a branch (matched by code, else externalId)", requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/BranchUpsert" } } } }, responses: { "201": { description: "Created" }, "200": { description: "Updated" }, "422": { description: "Validation error" } } },
    },
    "/integration/categories": { get: { tags: ["Integration"], summary: "Active complaint categories", responses: { "200": { description: "OK" } } } },
    "/integration/employees": {
      get: { tags: ["Integration"], summary: "Branch staff + round-robin cursors", parameters: [{ name: "branch", in: "query", schema: { type: "string" }, description: "Branch id, code, external id or name" }], responses: { "200": { description: "OK" } } },
      post: { tags: ["Integration"], summary: "Create or update a branch staff member (matched by email)", requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/EmployeeUpsert" } } } }, responses: { "201": { description: "Created (temporaryPassword returned once when no password was sent)" }, "200": { description: "Updated" }, "403": { description: "Administrative accounts cannot be changed through the API" } } },
    },
    "/integration/complaints": {
      post: {
        tags: ["Integration"], summary: "Register a complaint on behalf of a member",
        parameters: [{ name: "Idempotency-Key", in: "header", schema: { type: "string" }, description: "Repeat-safe key, e.g. the LMS lead id" }],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/ComplaintCreate" } } } },
        responses: { "201": { description: "Ticket created (FC-YYYY-NNNNNN)" }, "200": { description: "Idempotent duplicate" }, "422": { description: "Validation error / BRANCH_NOT_FOUND / CATEGORY_NOT_FOUND" } },
      },
    },
    "/integration/tickets": {
      get: {
        tags: ["Integration"], summary: "List tickets",
        parameters: [
          { name: "status", in: "query", schema: { type: "string", enum: ["IN_PROGRESS", "ON_HOLD", "RESOLVED", "CLOSED"] } },
          { name: "priority", in: "query", schema: { type: "string", enum: ["CRITICAL", "HIGH", "MEDIUM", "LOW"] } },
          { name: "source", in: "query", schema: { type: "string", enum: ["PORTAL", "API_LMS", "API_CRM"] } },
          { name: "branch", in: "query", schema: { type: "string" }, description: "Branch id, code, external id or name" },
          { name: "categoryId", in: "query", schema: { type: "string" } },
          { name: "assignedToId", in: "query", schema: { type: "string" } },
          { name: "unassigned", in: "query", schema: { type: "string", enum: ["true"] } },
          { name: "overdue", in: "query", schema: { type: "string", enum: ["true"] } },
          { name: "escalated", in: "query", schema: { type: "string", enum: ["true"] } },
          { name: "phone", in: "query", schema: { type: "string" }, description: "Member mobile number (exact)" },
          { name: "email", in: "query", schema: { type: "string" }, description: "Member email (exact)" },
          { name: "q", in: "query", schema: { type: "string" }, description: "Ticket number / member name / phone" },
          { name: "from", in: "query", schema: { type: "string", format: "date" } },
          { name: "to", in: "query", schema: { type: "string", format: "date" } },
          { name: "updatedSince", in: "query", schema: { type: "string", format: "date-time" }, description: "Incremental sync: only tickets changed since this time" },
          { name: "page", in: "query", schema: { type: "integer" } },
          { name: "pageSize", in: "query", schema: { type: "integer", maximum: 100 } },
        ],
        responses: { "200": { description: "OK" } },
      },
    },
    "/integration/tickets/{ticketNumber}": {
      parameters: [{ name: "ticketNumber", in: "path", required: true, schema: { type: "string", example: "FC-2026-000123" } }],
      get: { tags: ["Integration"], summary: "Full ticket: history, messages, assignments, attachments, SLA", responses: { "200": { description: "OK" }, "404": { description: "Not found" } } },
      patch: { tags: ["Integration"], summary: "Change status (same transition rules as the dashboard)", requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/StatusChange" } } } }, responses: { "200": { description: "OK" }, "409": { description: "TICKET_CLOSED / INVALID_TRANSITION" }, "422": { description: "RESOLUTION_REQUIRED / HOLD_REASON_REQUIRED" } } },
    },
    "/integration/tickets/{ticketNumber}/messages": {
      parameters: [{ name: "ticketNumber", in: "path", required: true, schema: { type: "string" } }],
      get: { tags: ["Integration"], summary: "Ticket conversation", responses: { "200": { description: "OK" } } },
      post: { tags: ["Integration"], summary: "Add a member-facing reply (PUBLIC) or internal note (INTERNAL)", requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["body"], properties: { body: { type: "string" }, visibility: { type: "string", enum: ["PUBLIC", "INTERNAL"], default: "INTERNAL" }, authorName: { type: "string" } } } } } }, responses: { "201": { description: "Added" }, "409": { description: "TICKET_CLOSED" } } },
    },
    "/integration/tickets/{ticketNumber}/assign": {
      parameters: [{ name: "ticketNumber", in: "path", required: true, schema: { type: "string" } }],
      post: { tags: ["Integration"], summary: "Assign to an employee, or auto-assign via round-robin", requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { employee: { type: "string", description: "Employee id, email or external id" }, auto: { type: "boolean" }, note: { type: "string" } } } } } }, responses: { "200": { description: "OK" }, "422": { description: "ASSIGNMENT_ERROR / EMPLOYEE_NOT_FOUND" } } },
    },
    "/integration/tickets/{ticketNumber}/transfer": {
      parameters: [{ name: "ticketNumber", in: "path", required: true, schema: { type: "string" } }],
      post: { tags: ["Integration"], summary: "Move the ticket to another branch", requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["branch"], properties: { branch: { type: "string", description: "Branch id, code, external id or name" } } } } } }, responses: { "200": { description: "OK" }, "422": { description: "TRANSFER_ERROR / BRANCH_NOT_FOUND" } } },
    },
    "/integration/tickets/{ticketNumber}/escalate": {
      parameters: [{ name: "ticketNumber", in: "path", required: true, schema: { type: "string" } }],
      post: { tags: ["Integration"], summary: "Escalate the ticket", requestBody: { content: { "application/json": { schema: { type: "object", properties: { reason: { type: "string" } } } } } }, responses: { "200": { description: "OK" }, "409": { description: "ALREADY_ESCALATED / TICKET_CLOSED" } } },
    },
    "/integration/tickets/{ticketNumber}/reopen": {
      parameters: [{ name: "ticketNumber", in: "path", required: true, schema: { type: "string" } }],
      post: { tags: ["Integration"], summary: "Reopen a resolved ticket inside the reopening window", requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["reason"], properties: { reason: { type: "string" } } } } } }, responses: { "200": { description: "OK" }, "409": { description: "INVALID_REOPEN_STATE / REOPEN_WINDOW_EXPIRED / TICKET_CLOSED" } } },
    },
    "/integration/webhook": {
      get: { tags: ["Integration"], summary: "Webhook configuration and event list", responses: { "200": { description: "OK" } } },
      put: { tags: ["Integration"], summary: "Set the webhook endpoint and signing secret", requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { url: { type: "string", description: "https:// endpoint; empty string disables webhooks" }, secret: { type: "string", minLength: 16 } } } } } }, responses: { "200": { description: "OK" } } },
    },
    "/integration/webhook/test": { post: { tags: ["Integration"], summary: "Send a signed webhook.test event", responses: { "200": { description: "{ delivered, error? }" } } } },
    "/integration/stats": { get: { tags: ["Integration"], summary: "Branch x status matrix + SLA averages", responses: { "200": { description: "OK" } } } },
    "/integration/workers/run": { post: { tags: ["Integration"], summary: "Run the auto-closure and assignment-retry sweeps (call from a scheduler)", responses: { "200": { description: "OK" } } } },
    "/openapi": { get: { tags: ["Integration"], summary: "This specification", responses: { "200": { description: "OK" } } } },
  },
  components: {
    securitySchemes: {
      SessionCookie: { type: "apiKey", in: "cookie", name: "fcms_session" },
      ApiKeyAuth: { type: "apiKey", in: "header", name: "x-api-key", description: "Also accepted as Authorization: Bearer <key>" },
    },
    schemas: {
      ComplaintCreate: {
        type: "object",
        required: ["customerName", "customerPhone", "description"],
        description: "Give the branch as branchId, branchCode, branchExternalId or branch (name); the category as categoryId or category (name).",
        properties: {
          customerName: { type: "string" }, customerPhone: { type: "string" }, customerEmail: { type: "string", description: "Optional" },
          branchId: { type: "string" }, branchCode: { type: "string", example: "BR001" }, branchExternalId: { type: "string" }, branch: { type: "string", example: "Sector 48" },
          categoryId: { type: "string" }, category: { type: "string", example: "Equipment Issues" },
          description: { type: "string" },
          priority: { type: "string", enum: ["CRITICAL", "HIGH", "MEDIUM", "LOW"] },
          source: { type: "string", enum: ["LMS", "CRM"] },
        },
      },
      StatusChange: {
        type: "object", required: ["toStatus"],
        properties: {
          toStatus: { type: "string", enum: ["IN_PROGRESS", "ON_HOLD", "RESOLVED"] },
          note: { type: "string" }, reason: { type: "string", description: "Required for ON_HOLD" }, resolution: { type: "string", description: "Required for RESOLVED" },
          actorName: { type: "string", description: "LMS user shown in the ticket history" },
        },
      },
      BranchUpsert: {
        type: "object",
        properties: { code: { type: "string", example: "BR037" }, externalId: { type: "string" }, name: { type: "string" }, city: { type: "string" }, address: { type: "string" }, notificationEmail: { type: "string" }, isActive: { type: "boolean" } },
      },
      EmployeeUpsert: {
        type: "object", required: ["email"],
        properties: { email: { type: "string" }, name: { type: "string" }, phone: { type: "string" }, designation: { type: "string" }, role: { type: "string", enum: ["SUPPORT_AGENT", "BRANCH_MANAGER"] }, branch: { type: "string" }, password: { type: "string", minLength: 8 }, isActive: { type: "boolean" }, availabilityEnabled: { type: "boolean" }, externalId: { type: "string" } },
      },
      WebhookDelivery: {
        type: "object",
        description: "Body POSTed to the configured webhook URL. Headers: X-FitClass-Event, X-FitClass-Delivery, X-FitClass-Signature (sha256=<hex HMAC-SHA256 of the raw body>).",
        properties: {
          id: { type: "string" },
          event: { type: "string", enum: ["ticket.created", "ticket.assigned", "ticket.status_changed", "ticket.resolved", "ticket.reopened", "ticket.closed", "ticket.escalated", "ticket.transferred", "ticket.message_added", "webhook.test"] },
          occurredAt: { type: "string", format: "date-time" },
          ticket: { type: "object", nullable: true },
          data: { type: "object" },
        },
      },
    },
  },
  security: [{ ApiKeyAuth: [] }],
};

export async function GET() {
  return NextResponse.json(spec, { headers: { "cache-control": "public, max-age=3600" } });
}
