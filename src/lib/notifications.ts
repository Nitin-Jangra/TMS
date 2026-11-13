// Email notification engine — transactional outbox with a development adapter.
// Every notification is persisted FIRST (outbox row), then "sent" by the dev
// adapter (marks SENT and renders the template). If a recipient email is blank
// (branch/central emails are blank by design until FitClass provides them),
// the row is marked SKIPPED with the reason and nothing crashes.
// Production replaces the adapter with a real provider via EMAIL_PROVIDER_API_KEY.

import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { STATUS_LABELS } from "@/lib/types";

export type NotificationEvent =
  | "COMPLAINT_REGISTERED"
  | "ASSIGNED"
  | "STATUS_UPDATED"
  | "ON_HOLD"
  | "RESOLVED"
  | "REOPENED"
  | "CLOSED"
  | "ESCALATED"
  | "ASSIGNMENT_FAILED"
  | "CLOSURE_SCHEDULED";

export type RecipientKind = "CUSTOMER" | "CENTRAL_SUPPORT" | "BRANCH" | "ASSIGNEE" | "BRANCH_MANAGER";

export interface NotificationInput {
  ticketId?: string | null;
  ticketNumber?: string;
  event: NotificationEvent;
  recipientKind: RecipientKind;
  recipientEmail?: string | null; // explicit recipient override
  variables?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Templates (Root Admin will later be able to customize via settings)
// ---------------------------------------------------------------------------

function renderSubject(event: NotificationEvent, v: Record<string, string>): string {
  const tn = v.ticketNumber || "";
  switch (event) {
    case "COMPLAINT_REGISTERED":
      return `FitClass Support: Complaint registered — ${tn}`;
    case "ASSIGNED":
      return `FitClass Support: New complaint assigned to you — ${tn}`;
    case "STATUS_UPDATED":
      return `FitClass Support: Ticket ${tn} status updated`;
    case "ON_HOLD":
      return `FitClass Support: Ticket ${tn} placed on hold`;
    case "RESOLVED":
      return `FitClass Support: Ticket ${tn} has been resolved`;
    case "REOPENED":
      return `FitClass Support: Ticket ${tn} has been reopened`;
    case "CLOSED":
      return `FitClass Support: Ticket ${tn} has been closed`;
    case "ESCALATED":
      return `FitClass Support: Ticket ${tn} escalated`;
    case "ASSIGNMENT_FAILED":
      return `FitClass Support: Action required — no support employee available for ${tn}`;
    case "CLOSURE_SCHEDULED":
      return `FitClass Support: Ticket ${tn} resolved — feedback window`;
    default:
      return `FitClass Support notification`;
  }
}

function renderBody(event: NotificationEvent, recipientKind: RecipientKind, v: Record<string, string>): string {
  const tn = v.ticketNumber || "";
  const branch = v.branchName || "";
  const customer = v.customerName || "";
  const category = v.categoryName || "";
  const status = v.status ? STATUS_LABELS[v.status] || v.status : "";
  const reason = v.reason || "";
  const resolution = v.resolution || "";
  const assignee = v.assigneeName || "";
  const reopenHours = v.reopenWindowHours || "";

  const ticketSummary = `
Ticket: ${tn}
Customer: ${customer}
Branch: ${branch}
Category: ${category}
Status: ${status}
Priority: ${v.priority || "Medium"}
Description: ${v.description || ""}
  `.trim();

  switch (event) {
    case "COMPLAINT_REGISTERED": {
      if (recipientKind === "CUSTOMER") {
        return `Dear ${customer},

We sincerely apologize for the inconvenience you have experienced. Your complaint has been successfully registered with FitClass. Our support team will review your concern and work towards resolving it as soon as possible.

${ticketSummary}

Track your complaint:
- Go to the FitClass support portal and choose "Track Complaint".
- Enter your Ticket ID ${tn} and your registered mobile number.

Thank you for your patience.

— FitClass Support Team`;
      }
      return `A new complaint has been registered.

${ticketSummary}

Registered via: ${v.source || "Customer Portal"}
Please review the ticket in the support dashboard.`;
    }
    case "ASSIGNED":
      return `Hello ${assignee},

A new complaint has been assigned to you via the branch round-robin queue.

${ticketSummary}

Please start working on the ticket from your support dashboard.

— FitClass CMS`;
    case "STATUS_UPDATED":
      return `Ticket ${tn} status has been updated to ${status}.

${ticketSummary}

— FitClass CMS`;
    case "ON_HOLD":
      return `Ticket ${tn} has been placed ON HOLD.

Reason: ${reason || "Not specified"}

Our team is waiting for additional information or action. The ticket will be resumed as soon as possible.

${ticketSummary}

— FitClass Support Team`;
    case "RESOLVED":
      return `Dear ${customer},

Good news! Your complaint ${tn} has been resolved.

Resolution: ${resolution || "See your ticket page for details."}

If you are not satisfied with the resolution, you can reopen this ticket within the next ${reopenHours} hours using your Ticket ID and registered mobile number. After this window the ticket will be closed automatically.

— FitClass Support Team`;
    case "CLOSURE_SCHEDULED":
      return `Ticket ${tn} for customer ${customer} has been resolved.

The automatic closure has been scheduled. The customer may reopen the ticket within ${reopenHours} hours; after that the ticket will be closed automatically.

— FitClass CMS`;
    case "REOPENED":
      return `Ticket ${tn} has been REOPENED by the customer.

Reason: ${reason}

${ticketSummary}

${assignee ? `The ticket remains assigned to ${assignee}.` : "The ticket will be re-assigned through the branch round-robin queue."}

— FitClass CMS`;
    case "CLOSED":
      if (recipientKind === "CUSTOMER") {
        return `Dear ${customer},

Your ticket ${tn} has been closed after the resolution window. We hope the issue was resolved to your satisfaction.

If you need further assistance, please submit a new complaint through the FitClass support portal.

— FitClass Support Team`;
      }
      return `Ticket ${tn} was automatically closed after the reopen window expired.

${ticketSummary}

— FitClass CMS`;
    case "ESCALATED":
      return `Ticket ${tn} has been escalated for priority attention.

${ticketSummary}

Escalation reason: ${reason || "SLA risk / manual escalation"}

— FitClass CMS`;
    case "ASSIGNMENT_FAILED":
      return `IMPORTANT: Ticket ${tn} could not be auto-assigned.

Branch: ${branch}
Reason: ${reason || "No eligible support employee is currently available in this branch."}

The ticket is in the unassigned queue with status New Complaint. Assign it manually from the dashboard, or make an employee available to retry the round-robin queue.

— FitClass CMS`;
    default:
      return ticketSummary;
  }
}

// ---------------------------------------------------------------------------
// Outbox writer + dev send adapter
// ---------------------------------------------------------------------------

export async function queueNotification(input: NotificationInput): Promise<void> {
  const settings = await getSettings();
  const v = input.variables || {};
  const subject = renderSubject(input.event, v);
  const body = renderBody(input.event, input.recipientKind, v);

  // Resolve recipient
  let recipientEmail = (input.recipientEmail || "").trim();
  let skipReason = "";

  if (!recipientEmail) {
    switch (input.recipientKind) {
      case "CUSTOMER":
        recipientEmail = v.customerEmail || "";
        break;
      case "CENTRAL_SUPPORT":
        recipientEmail = (settings.central_support_email || "").trim();
        if (!recipientEmail) {
          skipReason = "Central support email not configured yet (left blank by FitClass).";
        }
        break;
      case "BRANCH":
        recipientEmail = v.branchEmail || "";
        if (!recipientEmail) {
          skipReason = "Branch notification email not configured yet (left blank by FitClass).";
        }
        break;
      case "ASSIGNEE":
        recipientEmail = v.assigneeEmail || "";
        break;
      case "BRANCH_MANAGER":
        recipientEmail = v.branchManagerEmail || "";
        if (!recipientEmail) {
          skipReason = "Branch manager email not available.";
        }
        break;
    }
  }

  // Respect notification preferences
  const prefMap: Record<string, string> = {
    CUSTOMER: "notification_customer_enabled",
    BRANCH: "notification_branch_enabled",
    CENTRAL_SUPPORT: "notification_central_enabled",
  };
  const prefKey = prefMap[input.recipientKind];
  if (prefKey && settings[prefKey] === "false") {
    skipReason = skipReason || "Disabled by notification preferences.";
  }

  if (!recipientEmail) {
    skipReason = skipReason || "Recipient email address is not available.";
  }

  const row = await db.notification.create({
    data: {
      ticketId: input.ticketId ?? null,
      event: input.event,
      recipientKind: input.recipientKind,
      recipientEmail: recipientEmail || "",
      subject,
      body,
      status: skipReason ? "SKIPPED" : "PENDING",
      lastError: skipReason,
    },
  });

  if (!skipReason) {
    await devSend(row.id);
  }
}

/**
 * Development email adapter: renders + marks the outbox row as SENT.
 * No real email ever leaves the sandbox. Replace this single function with
 * a provider call (SendGrid/SES/SMTP) when production credentials exist.
 */
async function devSend(notificationId: string): Promise<void> {
  // Simulate delivery latency; idempotent and failure-safe.
  try {
    await db.notification.update({
      where: { id: notificationId },
      data: { status: "SENT", attempts: { increment: 1 }, sentAt: new Date() },
    });
  } catch (err) {
    await db.notification
      .update({
        where: { id: notificationId },
        data: { status: "FAILED", attempts: { increment: 1 }, lastError: "Dev adapter delivery error" },
      })
      .catch(() => undefined);
    console.error("[fcms] notification delivery failed:", err);
  }
}

export async function retryNotification(notificationId: string): Promise<void> {
  const row = await db.notification.findUnique({ where: { id: notificationId } });
  if (!row) return;
  if (!row.recipientEmail) {
    await db.notification.update({
      where: { id: notificationId },
      data: { attempts: { increment: 1 }, lastError: "Still no recipient email configured." },
    });
    return;
  }
  await db.notification.update({
    where: { id: notificationId },
    data: { status: "SENT", attempts: { increment: 1 }, sentAt: new Date(), lastError: "" },
  });
}
