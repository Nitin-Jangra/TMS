// Email notification engine — transactional outbox + SMTP delivery.
// Every notification is persisted FIRST (outbox row), then delivered through
// the Gmail SMTP account configured in SMTP_USER / SMTP_PASS (src/lib/smtp.ts).
// Delivery never throws: the row ends up SENT, FAILED (with the reason) or
// SKIPPED, and the complaint itself is never affected by an email problem.
//
// - Central support mail goes to the "central_support_email" setting, falling
//   back to the sending mailbox (SMTP_USER) while that setting is blank.
// - Without SMTP credentials (local dev / tests) nothing leaves the machine:
//   rows are marked SENT with a note, exactly like the old dev adapter.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { db, onCloudflare } from "@/lib/db";
import { getSmtpConfig, sendMail } from "@/lib/smtp";
import { sendEmail } from "@/lib/email";
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
  | "CLOSURE_SCHEDULED"
  | "SLA_WARNING"
  | "SLA_BREACHED"
  | "SLA_CRITICAL"
  | "LOW_RATING"
  | "DAILY_DIGEST";

export type RecipientKind = "CUSTOMER" | "CENTRAL_SUPPORT" | "BRANCH" | "ASSIGNEE" | "BRANCH_MANAGER" | "DEPARTMENT";

export interface NotificationInput {
  ticketId?: string | null;
  ticketNumber?: string;
  event: NotificationEvent;
  recipientKind: RecipientKind;
  recipientEmail?: string | null; // explicit recipient override
  variables?: Record<string, string>;
  /** Ready-made subject/body (e.g. the daily digest) instead of a template. */
  subject?: string;
  body?: string;
}

// ---------------------------------------------------------------------------
// Templates (Root Admin will later be able to customize via settings)
// ---------------------------------------------------------------------------

function renderSubject(event: NotificationEvent, recipientKind: RecipientKind, v: Record<string, string>): string {
  const tn = v.ticketNumber || "";
  switch (event) {
    case "COMPLAINT_REGISTERED":
      if (recipientKind === "CUSTOMER") {
        return `FitClass: We are working on your request (Ticket #${tn})`;
      }
      return `[NEW TICKET ALERT] Member Complaint Registered — ${tn}`;
    case "ASSIGNED":
      return `[ASSIGNMENT] New complaint assigned to you — ${tn}`;
    case "STATUS_UPDATED":
      if (recipientKind === "CUSTOMER") {
        return `FitClass Support: Ticket ${tn} status updated`;
      }
      return `[STATUS UPDATE] Ticket ${tn} status updated`;
    case "ON_HOLD":
      return `FitClass Support: Ticket ${tn} placed on hold`;
    case "RESOLVED":
      return `FitClass: Your ticket ${tn} has been resolved`;
    case "REOPENED":
      return `[TICKET REOPENED] Ticket ${tn} has been reopened`;
    case "CLOSED":
      return `FitClass Support: Ticket ${tn} has been closed`;
    case "ESCALATED":
      return `[ESCALATION ALERT] Ticket ${tn} escalated`;
    case "ASSIGNMENT_FAILED":
      return `[ACTION REQUIRED] No support employee available for ${tn}`;
    case "CLOSURE_SCHEDULED":
      return `FitClass: Ticket ${tn} resolved — feedback window`;
    case "SLA_WARNING":
      return `[SLA REMINDER] ${tn} is due ${v.dueIn || "soon"}`;
    case "SLA_BREACHED":
      return `[SLA BREACHED] ${tn} is past its resolution deadline`;
    case "SLA_CRITICAL":
      return `[CRITICAL] ${tn} is far past its deadline — action needed`;
    case "LOW_RATING":
      return `[LOW RATING] Member rated ${tn} ${v.rating || "?"}/5`;
    case "DAILY_DIGEST":
      return `FitClass daily ticket summary`;
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
Member: ${customer}
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

Thank you for reaching out to FitClass Support. We have received your complaint and our member care team is actively working on your request.

Your Request Details:
- Ticket Reference Number: ${tn}
- Registered Contact: ${v.customerPhone || "As submitted"}
- Service Branch / Office: ${branch}
- Category: ${category}
- Details: ${v.description || ""}

Track Your Request Live:
You can check real-time progress and updates on your ticket anytime by visiting the FitClass portal or widget with Ticket Number "${tn}" and your registered mobile number.

Our team has been notified and will follow up with you promptly.

Warm regards,
FitClass Member Care Team
Email: ${getSmtpConfig()?.user || "info@fitclass.in"}`;
      }
      return `A new member complaint has been registered.

Ticket Reference: ${tn}
Member Name: ${customer}
Member Email: ${v.customerEmail || "Not specified"}
Member Mobile: ${v.customerPhone || "Not specified"}
Branch: ${branch}
Category: ${category}
Priority: ${v.priority || "Medium"}

Complaint Details:
${v.description || ""}

Registered via: ${v.source || "Member Portal"}
Please review the ticket in the operations dashboard.`;
    }
    case "ASSIGNED":
      return `Hello ${assignee},

A new complaint has been assigned to you via the operations queue.

${ticketSummary}

Please start working on the ticket from your staff dashboard.

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

If you are not satisfied with the resolution, you can reopen this ticket within the next ${reopenHours} hours using your Ticket ID and registered contact number. After this window the ticket will be closed automatically.
${v.feedbackUrl ? `
How did we do? Please rate our support (takes 10 seconds):
${v.feedbackUrl}
` : ""}

— FitClass Support Team`;
    case "CLOSURE_SCHEDULED":
      return `Ticket ${tn} for member ${customer} has been resolved.

The automatic closure has been scheduled. The member may reopen the ticket within ${reopenHours} hours; after that the ticket will be closed automatically.

— FitClass CMS`;
    case "REOPENED":
      return `Ticket ${tn} has been REOPENED by the client.

Reason: ${reason}

${ticketSummary}

${assignee ? `The ticket remains assigned to ${assignee}.` : "The ticket will be re-assigned through the operations queue."}

— FitClass CMS`;
    case "CLOSED":
      if (recipientKind === "CUSTOMER") {
        return `Dear ${customer},

Your ticket ${tn} has been closed after the resolution window. We hope the issue was resolved to your satisfaction.

If you need further assistance, please submit a new complaint through the FitClass member portal.

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
    case "SLA_WARNING":
      return `Hello ${assignee || "team"},

Reminder: ticket ${tn} has used ${v.percentUsed || "most"}% of its resolution time and is due ${v.dueIn || "soon"} (${v.dueAt || ""}).

${ticketSummary}

Please update or resolve it before the deadline.

— FitClass CMS`;
    case "SLA_BREACHED":
      return `Ticket ${tn} has missed its resolution deadline (${v.dueAt || ""}).

Assigned to: ${assignee || "nobody (unassigned)"}

${ticketSummary}

The ticket has been marked as escalated. Please follow up with the assignee or reassign it.

— FitClass CMS`;
    case "SLA_CRITICAL":
      return `CRITICAL: ticket ${tn} is far past its resolution deadline (${v.dueAt || ""}, ${v.percentUsed || ""}% of the allowed time used).

Assigned to: ${assignee || "nobody (unassigned)"}
Department: ${v.departmentName || "—"}

${ticketSummary}

Immediate action is required.

— FitClass CMS`;
    case "LOW_RATING":
      return `Member ${customer} rated the support for ticket ${tn} ${v.rating}/5.

Comment: ${v.comment || "(none)"}
Handled by: ${assignee || "—"}

${ticketSummary}

Consider calling the member to recover the experience.

— FitClass CMS`;
    case "ASSIGNMENT_FAILED":
      return `IMPORTANT: Ticket ${tn} could not be auto-assigned.

Branch: ${branch}
Reason: ${reason || "No eligible support employee is currently available in this branch."}

The ticket is in the unassigned queue with status In Progress. Assign it manually from the dashboard, or make an employee available to retry the round-robin queue.

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
  const subject = input.subject || renderSubject(input.event, input.recipientKind, v);
  const body = input.body || renderBody(input.event, input.recipientKind, v);

  // Resolve recipient
  let recipientEmail = (input.recipientEmail || "").trim();
  let skipReason = "";

  if (!recipientEmail) {
    switch (input.recipientKind) {
      case "CUSTOMER":
        recipientEmail = v.customerEmail || "";
        break;
      case "CENTRAL_SUPPORT":
        // Central support alert inbox (falls back to SUPPORT_NOTIFICATION_EMAIL or nitin98175@gmail.com)
        recipientEmail =
          (settings.central_support_email || "").trim() ||
          process.env.SUPPORT_NOTIFICATION_EMAIL?.trim() ||
          (getSmtpConfig()?.user ?? "") ||
          "nitin98175@gmail.com";
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
      case "DEPARTMENT":
        recipientEmail = v.departmentEmail || "";
        if (!recipientEmail) {
          skipReason = "Department mailbox not configured.";
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

  if (skipReason) return;

  const delivery = deliver(row);
  if (onCloudflare) {
    // Finish sending after the HTTP response so the customer is not kept waiting.
    try {
      getCloudflareContext().ctx.waitUntil(delivery);
      return;
    } catch {
      // No request context (should not happen) — fall through and wait inline.
    }
  }
  await delivery;
}

// Seed/demo accounts use these domains; mailing them would only produce bounces.
const PLACEHOLDER_DOMAINS = ["example.com", "example.org", "example.net", "fitclass.dev"];

function isPlaceholderAddress(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase() || "";
  return PLACEHOLDER_DOMAINS.includes(domain);
}

/** Delivers one outbox row and records the outcome. Never throws. */
async function deliver(row: { id: string; recipientEmail: string; subject: string; body: string }): Promise<void> {
  const mark = (data: { status: string; lastError: string; sentAt?: Date }) =>
    db.notification.update({ where: { id: row.id }, data: { ...data, attempts: { increment: 1 } } });

  try {
    if (isPlaceholderAddress(row.recipientEmail)) {
      await mark({ status: "SKIPPED", lastError: "Placeholder (demo) email address — not delivered." });
      return;
    }

    // Attempt delivery via universal email module (Resend or Nodemailer SMTP)
    const res = await sendEmail({
      to: row.recipientEmail,
      subject: row.subject,
      text: row.body,
    });

    if (res.success && !res.simulated) {
      await mark({ status: "SENT", sentAt: new Date(), lastError: "" });
      return;
    }

    // Try custom TLS / socket SMTP if configured
    const smtp = getSmtpConfig();
    if (smtp) {
      await sendMail({ to: row.recipientEmail, subject: row.subject, text: row.body }, smtp);
      await mark({ status: "SENT", sentAt: new Date(), lastError: "" });
      return;
    }

    // If simulated (credentials not provided yet)
    await mark({
      status: "SENT",
      sentAt: new Date(),
      lastError: "Real delivery simulated (configure SMTP_USER & SMTP_PASS in .env for live dispatch).",
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Unknown delivery error";
    console.error("[fcms] notification delivery failed:", reason);
    await mark({ status: "FAILED", lastError: reason.slice(0, 500) }).catch(() => undefined);
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
  await deliver(row);
}
