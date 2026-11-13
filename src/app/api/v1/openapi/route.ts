// OpenAPI 3.0 specification for the FC-CMS REST API (served at /api/v1/openapi).

import { NextResponse } from "next/server";

const spec = {
  openapi: "3.0.3",
  info: {
    title: "FitClass Complaint Management System API",
    version: "1.0.0",
    description:
      "Complete REST API for the FitClass Complaint Management System (FC-CMS). " +
      "Public endpoints power the customer portal; staff endpoints use session cookies; " +
      "integration endpoints authenticate with an x-api-key header for CRM and LMS systems.",
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
          { name: "status", in: "query", schema: { type: "string", enum: ["NEW_COMPLAINT", "IN_PROGRESS", "ON_HOLD", "RESOLVED", "CLOSED"] } },
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
    "/integration/whoami": { get: { tags: ["Integration"], summary: "Verify API key", responses: { "200": { description: "OK" } } } },
    "/integration/branches": { get: { tags: ["Integration"], summary: "Active branches", responses: { "200": { description: "OK" } } } },
    "/integration/categories": { get: { tags: ["Integration"], summary: "Active categories", responses: { "200": { description: "OK" } } } },
    "/integration/employees": { get: { tags: ["Integration"], summary: "Employees + round-robin cursors", responses: { "200": { description: "OK" } } } },
    "/integration/tickets": { get: { tags: ["Integration"], summary: "List tickets (filters)", responses: { "200": { description: "OK" } } } },
    "/integration/tickets/{ticketNumber}": { get: { tags: ["Integration"], summary: "Ticket by number", parameters: [{ name: "ticketNumber", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "OK" } } }, patch: { tags: ["Integration"], summary: "Status update (write scope)", parameters: [{ name: "ticketNumber", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "OK" } } } },
    "/integration/complaints": { post: { tags: ["Integration"], summary: "Create complaint on behalf of customer", responses: { "201": { description: "Created" } } } },
    "/integration/stats": { get: { tags: ["Integration"], summary: "Aggregated stats", responses: { "200": { description: "OK" } } } },
    "/openapi": { get: { tags: ["Integration"], summary: "This specification", responses: { "200": { description: "OK" } } } },
  },
  components: {
    securitySchemes: {
      SessionCookie: { type: "apiKey", in: "cookie", name: "fcms_session" },
      ApiKeyAuth: { type: "apiKey", in: "header", name: "x-api-key" },
    },
  },
  security: [{ ApiKeyAuth: [] }],
};

export async function GET() {
  return NextResponse.json(spec, { headers: { "cache-control": "public, max-age=3600" } });
}
