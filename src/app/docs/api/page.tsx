// Public API documentation page for the CRM/LMS integration teams.

import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { ArrowLeft, KeyRound } from "lucide-react";

const GROUPS: { title: string; note: string; rows: { method: string; path: string; desc: string }[] }[] = [
  {
    title: "Integration API — for the FitClass LMS",
    note: "Authenticate with the x-api-key header (or Authorization: Bearer <key>). Keys are managed in the Root Admin panel. Scopes: read (GET) and write (POST/PATCH/PUT). Branches can be referenced by id, code (BR001), your LMS id or name.",
    rows: [
      { method: "GET", path: "/api/v1/integration/whoami", desc: "Verify an API key and list its scopes" },
      { method: "POST", path: "/api/v1/integration/complaints", desc: "Register a complaint for a member (Idempotency-Key supported; email optional)" },
      { method: "GET", path: "/api/v1/integration/tickets", desc: "List tickets — filters: status, priority, source, branch, phone, email, escalated, overdue, unassigned, q, from, to, updatedSince, page, pageSize" },
      { method: "GET", path: "/api/v1/integration/tickets/{ticketNumber}", desc: "Full ticket: history, messages, assignments, attachments, SLA" },
      { method: "PATCH", path: "/api/v1/integration/tickets/{ticketNumber}", desc: "Change status — same transition rules as the dashboard" },
      { method: "GET", path: "/api/v1/integration/tickets/{ticketNumber}/messages", desc: "Ticket conversation" },
      { method: "POST", path: "/api/v1/integration/tickets/{ticketNumber}/messages", desc: "Add a member-facing reply (PUBLIC) or an internal note (INTERNAL)" },
      { method: "POST", path: "/api/v1/integration/tickets/{ticketNumber}/assign", desc: "Assign to an employee, or auto-assign through the branch round-robin" },
      { method: "POST", path: "/api/v1/integration/tickets/{ticketNumber}/transfer", desc: "Move the ticket to another branch" },
      { method: "POST", path: "/api/v1/integration/tickets/{ticketNumber}/escalate", desc: "Escalate for priority attention" },
      { method: "POST", path: "/api/v1/integration/tickets/{ticketNumber}/reopen", desc: "Reopen a resolved ticket inside the reopening window" },
      { method: "GET", path: "/api/v1/integration/branches", desc: "Branch master list (all FitClass branches)" },
      { method: "POST", path: "/api/v1/integration/branches", desc: "Create or update a branch from the LMS (matched by code or externalId)" },
      { method: "GET", path: "/api/v1/integration/employees", desc: "Branch staff + round-robin cursor state (who gets the next ticket)" },
      { method: "POST", path: "/api/v1/integration/employees", desc: "Create or update a support employee / branch manager (matched by email)" },
      { method: "GET", path: "/api/v1/integration/categories", desc: "Active complaint categories" },
      { method: "GET", path: "/api/v1/integration/stats", desc: "Aggregated branch × status matrix + SLA averages" },
      { method: "GET", path: "/api/v1/integration/webhook", desc: "Webhook configuration and the list of events" },
      { method: "PUT", path: "/api/v1/integration/webhook", desc: "Set the LMS endpoint + signing secret that receive ticket events" },
      { method: "POST", path: "/api/v1/integration/webhook/test", desc: "Send a signed test event to the configured endpoint" },
      { method: "POST", path: "/api/v1/integration/workers/run", desc: "Run auto-closure + assignment-retry sweeps (call from a scheduler)" },
      { method: "GET", path: "/api/v1/openapi", desc: "Machine-readable OpenAPI 3.0 specification" },
    ],
  },
  {
    title: "Webhooks — events pushed to the LMS",
    note: "Each event is a JSON POST { id, event, occurredAt, ticket, data } signed with X-FitClass-Signature: sha256=<HMAC-SHA256 of the raw body using your secret>. Reply with any 2xx status; a failed delivery is retried once.",
    rows: [
      { method: "POST", path: "ticket.created", desc: "A complaint was registered (portal, website widget or API)" },
      { method: "POST", path: "ticket.assigned", desc: "Assigned or reassigned to a support employee" },
      { method: "POST", path: "ticket.status_changed", desc: "Moved to In Progress or On Hold" },
      { method: "POST", path: "ticket.resolved", desc: "Resolved — the reopening window starts" },
      { method: "POST", path: "ticket.reopened", desc: "Reopened by the member" },
      { method: "POST", path: "ticket.closed", desc: "Closed automatically after the reopening window" },
      { method: "POST", path: "ticket.escalated", desc: "Escalated for priority attention" },
      { method: "POST", path: "ticket.transferred", desc: "Moved to another branch" },
      { method: "POST", path: "ticket.message_added", desc: "A reply or internal note was added" },
    ],
  },
  {
    title: "Public API — customer portal",
    note: "No authentication. Rate limited; tracking uses Ticket ID + registered mobile and returns generic errors on mismatch.",
    rows: [
      { method: "GET", path: "/api/v1/public/branches", desc: "Active branches for the complaint form" },
      { method: "GET", path: "/api/v1/public/categories", desc: "Active complaint categories" },
      { method: "POST", path: "/api/v1/public/complaints", desc: "Register a complaint (Idempotency-Key header recommended)" },
      { method: "POST", path: "/api/v1/public/tickets/track", desc: "Track a ticket — body: { ticketNumber, mobileNumber }" },
      { method: "POST", path: "/api/v1/public/tickets/{ticketId}/reopen", desc: "Reopen a resolved ticket within the window" },
    ],
  },
  {
    title: "Staff API — dashboards (session cookie)",
    note: "Cookie-authenticated (fcms_session) with role-based access control and resource-level checks.",
    rows: [
      { method: "GET", path: "/api/v1/support/dashboard/summary", desc: "Role-aware dashboard summary (employee / branch / central)" },
      { method: "GET", path: "/api/v1/support/tickets", desc: "Role-scoped ticket list with filters + pagination" },
      { method: "GET", path: "/api/v1/support/tickets/{ticketId}", desc: "Ticket detail (RBAC-checked)" },
      { method: "PATCH", path: "/api/v1/support/tickets/{ticketId}/status", desc: "Status transition (closed tickets rejected)" },
      { method: "POST", path: "/api/v1/support/tickets/{ticketId}/resolve", desc: "Resolve with mandatory resolution message" },
      { method: "POST", path: "/api/v1/support/tickets/{ticketId}/notes", desc: "Internal note (never emailed)" },
      { method: "POST", path: "/api/v1/support/tickets/{ticketId}/replies", desc: "Customer-facing reply" },
      { method: "GET", path: "/api/v1/support/tickets/{ticketId}/history", desc: "Status + assignment + reopen history" },
      { method: "POST", path: "/api/v1/support/tickets/{ticketId}/assign", desc: "Manual assign / reassign / branch transfer" },
      { method: "POST", path: "/api/v1/support/tickets/{ticketId}/escalate", desc: "Escalate a ticket" },
      { method: "GET", path: "/api/v1/support/assignment/unassigned", desc: "Unassigned queue" },
      { method: "GET", path: "/api/v1/support/assignment/eligible-employees/{branchId}", desc: "Round-robin eligible employees + cursor" },
      { method: "PATCH", path: "/api/v1/support/employees/{employeeId}/availability", desc: "Toggle availability (triggers queue retry)" },
      { method: "GET", path: "/api/v1/branch/dashboard", desc: "Branch manager dashboard" },
      { method: "GET", path: "/api/v1/branch/reports", desc: "Branch reports" },
      { method: "GET", path: "/api/v1/admin/overview", desc: "Master complaint panel data (Root/Central admin)" },
      { method: "PUT", path: "/api/v1/admin/settings", desc: "Update settings (audited)" },
      { method: "PUT", path: "/api/v1/admin/settings/closure-policy", desc: "Reopening window / auto-closure policy" },
      { method: "GET", path: "/api/v1/admin/audit-logs", desc: "Audit log viewer" },
      { method: "POST", path: "/api/v1/admin/workers/run", desc: "Trigger closure + assignment sweeps now" },
    ],
  },
];

const METHOD_CLS: Record<string, string> = {
  GET: "bg-sky-100 text-sky-800",
  POST: "bg-emerald-100 text-emerald-800",
  PATCH: "bg-amber-100 text-amber-800",
  PUT: "bg-purple-100 text-purple-800",
  DELETE: "bg-red-100 text-red-800",
};

const SAMPLE = `# Verify your key
curl -H "x-api-key: $FC_CMS_KEY" https://<your-deployment>/api/v1/integration/whoami

# Register a complaint from the LMS (branch by code or name, category by name)
curl -X POST -H "x-api-key: $FC_CMS_KEY" -H "content-type: application/json" \\
  -H "idempotency-key: lms-lead-9931" \\
  -d '{
    "customerName": "Rahul Khanna",
    "customerPhone": "9123456701",
    "branchCode": "BR001",
    "category": "Equipment Issues",
    "description": "Treadmill 4 stops suddenly after 10 minutes.",
    "priority": "HIGH"
  }' \\
  https://<your-deployment>/api/v1/integration/complaints

# All tickets of one member, then everything changed in the last hour
curl -H "x-api-key: $FC_CMS_KEY" "https://<your-deployment>/api/v1/integration/tickets?phone=9123456701"
curl -H "x-api-key: $FC_CMS_KEY" "https://<your-deployment>/api/v1/integration/tickets?updatedSince=2026-11-17T09:00:00Z"

# Update a ticket from the LMS
curl -X PATCH -H "x-api-key: $FC_CMS_KEY" -H "content-type: application/json" \\
  -d '{ "toStatus": "IN_PROGRESS", "actorName": "Priya (LMS)" }' \\
  https://<your-deployment>/api/v1/integration/tickets/FC-2026-000123

# Receive ticket events in the LMS
curl -X PUT -H "x-api-key: $FC_CMS_KEY" -H "content-type: application/json" \\
  -d '{ "url": "https://lms.fitclass.in/hooks/complaints", "secret": "<at least 16 characters>" }' \\
  https://<your-deployment>/api/v1/integration/webhook`;

export default function ApiDocsPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#0c0c10] text-[#f4f4f7] selection:bg-[#22618b]/30 selection:text-white">
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
        <div className="mb-6">
          <h1 className="text-2xl font-extrabold text-white">FitClass CMS — REST API v1</h1>
          <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-[#a1a1aa]">
            The complete system is accessible over its REST API, so the FitClass LMS can register complaints for
            members, read and update tickets, sync branches and staff, and receive every ticket event as a signed
            webhook — without touching the dashboard. All endpoints return a consistent envelope:
            <span className="font-mono text-xs text-[#72bdd0]"> {`{ success, data | error, correlationId }`}</span>.
          </p>
        </div>

        {GROUPS.map((g) => (
          <section key={g.title} className="mb-5 rounded-2xl border border-[#ffffff14] bg-[#13131a] shadow-lg">
            <div className="border-b border-[#ffffff14] p-4">
              <h2 className="text-sm font-bold text-white">{g.title}</h2>
              <p className="mt-1 text-xs leading-relaxed text-[#a1a1aa]">{g.note}</p>
            </div>
            <ul className="divide-y divide-[#ffffff0d]">
              {g.rows.map((r) => (
                <li key={`${r.method}-${r.path}`} className="flex flex-col gap-1 px-4 py-2.5 sm:flex-row sm:items-center sm:gap-3">
                  <span className={`w-14 shrink-0 rounded px-2 py-0.5 text-center text-[11px] font-bold ${METHOD_CLS[r.method]}`}>{r.method}</span>
                  <code className="min-w-0 flex-1 break-all font-mono text-xs text-[#72bdd0]">{r.path}</code>
                  <span className="text-xs text-[#a1a1aa] sm:max-w-[46%]">{r.desc}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}

        <section className="mb-5 rounded-2xl border border-[#ffffff14] bg-[#13131a] shadow-lg">
          <div className="border-b border-[#ffffff14] p-4">
            <h2 className="flex items-center gap-1.5 text-sm font-bold text-white">
              <KeyRound className="h-4 w-4 text-[#72bdd0]" aria-hidden />Quickstart
            </h2>
          </div>
          <pre className="thin-scroll overflow-x-auto p-4 font-mono text-[12px] leading-relaxed text-[#a1a1aa]">{SAMPLE}</pre>
        </section>

        <Link href="/" className="inline-flex items-center text-sm font-semibold text-[#72bdd0] hover:underline">
          <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden />Back to member portal
        </Link>
      </main>
      <SiteFooter />
    </div>
  );
}
