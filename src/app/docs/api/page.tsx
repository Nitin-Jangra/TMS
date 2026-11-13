// Public API documentation page for the CRM/LMS integration teams.

import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { ArrowLeft, KeyRound } from "lucide-react";

const GROUPS: { title: string; note: string; rows: { method: string; path: string; desc: string }[] }[] = [
  {
    title: "Integration API — for CRM / LMS systems",
    note: "Authenticate with the x-api-key header. Keys are managed in the Root Admin panel. Scopes: read (GET) and write (POST/PATCH).",
    rows: [
      { method: "GET", path: "/api/v1/integration/whoami", desc: "Verify an API key and list its scopes" },
      { method: "GET", path: "/api/v1/integration/branches", desc: "Active branches (sync branch masters into CRM)" },
      { method: "GET", path: "/api/v1/integration/categories", desc: "Active complaint categories" },
      { method: "GET", path: "/api/v1/integration/employees", desc: "Support employees + round-robin cursor state (who is assigned to whom)" },
      { method: "GET", path: "/api/v1/integration/tickets", desc: "List tickets — filters: status, branchId, assignedToId, categoryId, priority, unassigned, overdue, q, page, pageSize" },
      { method: "GET", path: "/api/v1/integration/tickets/{ticketNumber}", desc: "Single ticket with full history" },
      { method: "PATCH", path: "/api/v1/integration/tickets/{ticketNumber}", desc: "Status update (write scope) — same transition rules as the dashboard" },
      { method: "POST", path: "/api/v1/integration/complaints", desc: "Create a complaint on behalf of a customer (write scope; source recorded as API_CRM/API_LMS)" },
      { method: "GET", path: "/api/v1/integration/stats", desc: "Aggregated branch × status matrix + SLA averages" },
      { method: "GET", path: "/api/v1/openapi", desc: "Machine-readable OpenAPI 3.0 specification" },
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

const SAMPLE = `# Verify the dev key
curl -H "x-api-key: fc_dev_crm_lms_2026_a1b2c3d4e5f6g7h8" \\
  https://<your-deployment>/api/v1/integration/whoami

# List open tickets for one branch
curl -H "x-api-key: $FC_CMS_KEY" \\
  "https://<your-deployment>/api/v1/integration/tickets?status=IN_PROGRESS&pageSize=50"

# Register a complaint from the CRM
curl -X POST -H "x-api-key: $FC_CMS_KEY" -H "content-type: application/json" \\
  -H "idempotency-key: crm-lead-9931" \\
  -d '{
    "customerName": "Rahul Khanna",
    "customerPhone": "9123456701",
    "customerEmail": "rahul.khanna@example.com",
    "branchId": "<branch id from /integration/branches>",
    "categoryId": "<category id from /integration/categories>",
    "description": "Treadmill 4 stops suddenly after 10 minutes."
  }' \\
  https://<your-deployment>/api/v1/integration/complaints`;

export default function ApiDocsPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-[#0a2350]">FitClass CMS — REST API v1</h1>
          <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-slate-500">
            The complete system is accessible over its REST API so the FitClass CRM and LMS can consume
            complaint data, create complaints on behalf of members, and pull assignment/statistics without
            touching the dashboard. All endpoints return a consistent envelope:
            <span className="font-mono text-xs"> {`{ success, data | error, correlationId }`}</span>.
          </p>
        </div>

        {GROUPS.map((g) => (
          <section key={g.title} className="brand-ring mb-5 rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 p-4">
              <h2 className="text-sm font-semibold text-[#0a2350]">{g.title}</h2>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">{g.note}</p>
            </div>
            <ul className="divide-y divide-slate-100">
              {g.rows.map((r) => (
                <li key={`${r.method}-${r.path}`} className="flex flex-col gap-1 px-4 py-2.5 sm:flex-row sm:items-center sm:gap-3">
                  <span className={`w-14 shrink-0 rounded px-2 py-0.5 text-center text-[11px] font-bold ${METHOD_CLS[r.method]}`}>{r.method}</span>
                  <code className="min-w-0 flex-1 break-all font-mono text-xs text-[#0a2350]">{r.path}</code>
                  <span className="text-xs text-slate-500 sm:max-w-[46%]">{r.desc}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}

        <section className="brand-ring mb-5 rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 p-4">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-[#0a2350]">
              <KeyRound className="h-4 w-4 text-[#2c6bdf]" aria-hidden />Quickstart (development key)
            </h2>
          </div>
          <pre className="thin-scroll overflow-x-auto p-4 font-mono text-[12px] leading-relaxed text-slate-700">{SAMPLE}</pre>
        </section>

        <Link href="/" className="inline-flex items-center text-sm text-[#2c6bdf] hover:underline">
          <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden />Back to support portal
        </Link>
      </main>
      <SiteFooter />
    </div>
  );
}
