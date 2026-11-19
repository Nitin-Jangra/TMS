// CSV export of the ticket list — same filters, sorting and access rules as
// GET /api/v1/support/tickets (opens directly in Excel). Max 5000 rows.

import { NextResponse } from "next/server";
import { handleErrors } from "@/lib/api-response";
import { requireUser } from "@/lib/auth";
import { getAccessPolicy } from "@/lib/tickets";
import { exportTickets, parseFilters, roleScope } from "@/lib/ticket-query";
import { PRIORITY_LABELS, STATUS_LABELS } from "@/lib/types";

const ist = (d: Date | null) =>
  d ? d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }) : "";

function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);
  // Prevent spreadsheet formula injection from member-entered text.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(request: Request) {
  return handleErrors(async () => {
    const user = await requireUser();
    const url = new URL(request.url);
    const filters = parseFilters(url.searchParams);
    if (filters.mine) filters.assignedToId = user.id;
    const scope = roleScope(user, { policy: await getAccessPolicy(), allBranches: url.searchParams.get("scope") === "all" });
    const { rows } = await exportTickets(filters, scope);

    const header = [
      "Ticket", "Created (IST)", "Status", "Priority", "Member", "Mobile", "Email", "Branch", "Category", "Department",
      "Assignee", "Source", "Resolution due (IST)", "Overdue", "Escalated", "Resolved (IST)", "Closed (IST)", "Reopens", "Rating", "Description",
    ];
    const now = Date.now();
    const lines = rows.map((t) => [
      t.ticketNumber,
      ist(t.createdAt),
      STATUS_LABELS[t.status] || t.status,
      PRIORITY_LABELS[t.priority] || t.priority,
      t.customerName,
      t.customerPhone,
      t.customerEmail,
      t.branch.name,
      t.category.name,
      t.department?.name || "",
      t.assignee?.name || "Unassigned",
      t.source,
      ist(t.slaResolutionDueAt),
      t.slaResolutionDueAt && !["RESOLVED", "CLOSED"].includes(t.status) && t.slaResolutionDueAt.getTime() < now ? "Yes" : "No",
      t.escalatedAt ? "Yes" : "No",
      ist(t.resolvedAt),
      ist(t.closedAt),
      t.reopenCount,
      t.feedback?.rating ?? "",
      t.description.replace(/\s+/g, " ").slice(0, 1000),
    ].map(csvCell).join(","));

    const csv = "﻿" + [header.join(","), ...lines].join("\r\n");
    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="fitclass-tickets-${stamp}.csv"`,
        "cache-control": "no-store",
      },
    });
  });
}
