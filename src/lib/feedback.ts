// Member satisfaction rating (CSAT), collected after a ticket is resolved.
//
// The member rates 1–5 stars (+ optional comment) either from the link in the
// "resolved" email (signed token, no login) or from the public tracking page
// (ticket number + registered mobile). One rating per ticket. Ratings of 2 or
// less alert the branch manager and central support so they can follow up.

import { createHmac, timingSafeEqual } from "crypto";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { queueNotification } from "@/lib/notifications";
import { getSettings } from "@/lib/settings";
import { normalizePhone } from "@/lib/types";
import { emitWebhook } from "@/lib/webhooks";

export class FeedbackError extends Error {
  constructor(message: string, public code = "FEEDBACK_ERROR", public status = 422) {
    super(message);
  }
}

function secret(): string {
  return process.env.SESSION_SECRET || process.env.DATABASE_URL || "fcms-dev-secret-fallback";
}

/** Signed, non-expiring token that lets a member rate one ticket. */
export function feedbackToken(ticketNumber: string): string {
  return createHmac("sha256", secret()).update(`feedback:${ticketNumber.toUpperCase()}`).digest("base64url").slice(0, 32);
}

function tokenMatches(ticketNumber: string, token: string): boolean {
  const expected = Buffer.from(feedbackToken(ticketNumber));
  const given = Buffer.from(String(token || ""));
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Public link for the rating page ("" when no public URL is known). */
export async function feedbackUrl(ticketNumber: string): Promise<string> {
  const settings = await getSettings();
  if (settings.feedback_enabled === "false") return "";
  const base = (settings.public_base_url || process.env.NEXT_PUBLIC_APP_URL || "").trim().replace(/\/+$/, "");
  if (!base) return "";
  return `${base}/feedback/${encodeURIComponent(ticketNumber)}?t=${feedbackToken(ticketNumber)}`;
}

const RATEABLE = ["RESOLVED", "CLOSED"];

async function findTicket(ticketNumber: string, auth: { token?: string; phone?: string }) {
  const tn = ticketNumber.trim().toUpperCase();
  const ticket = await db.ticket.findUnique({
    where: { ticketNumber: tn },
    include: { feedback: true, branch: { select: { name: true } } },
  });
  const byToken = !!auth.token && tokenMatches(tn, auth.token);
  const byPhone = !!auth.phone && !!ticket && normalizePhone(auth.phone) === ticket.customerPhone;
  if (!ticket || (!byToken && !byPhone)) {
    // Same answer for "not found" and "wrong credentials" — never leak which.
    throw new FeedbackError("We could not find that ticket. Please check the link or your details.", "NOT_FOUND", 404);
  }
  return ticket;
}

/** What the rating page needs to show. */
export async function getFeedbackState(ticketNumber: string, auth: { token?: string; phone?: string }) {
  const ticket = await findTicket(ticketNumber, auth);
  return {
    ticketNumber: ticket.ticketNumber,
    customerFirstName: ticket.customerName.split(/\s+/)[0] || "",
    branchName: ticket.branch.name,
    status: ticket.status,
    canRate: RATEABLE.includes(ticket.status) && !ticket.feedback,
    feedback: ticket.feedback ? { rating: ticket.feedback.rating, comment: ticket.feedback.comment, createdAt: ticket.feedback.createdAt } : null,
  };
}

export async function submitFeedback(input: { ticketNumber: string; rating: number; comment?: string; token?: string; phone?: string }) {
  const settings = await getSettings();
  if (settings.feedback_enabled === "false") throw new FeedbackError("Feedback is currently switched off.", "FEEDBACK_DISABLED", 403);

  const rating = Math.round(Number(input.rating));
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) throw new FeedbackError("Please choose a rating from 1 to 5 stars.", "VALIDATION_ERROR");
  const comment = String(input.comment || "").trim().slice(0, 1000);

  const ticket = await findTicket(input.ticketNumber, input);
  if (!RATEABLE.includes(ticket.status)) throw new FeedbackError("You can rate the support once your ticket is resolved.", "NOT_RESOLVED", 409);
  if (ticket.feedback) throw new FeedbackError("Thank you — this ticket has already been rated.", "ALREADY_RATED", 409);

  const feedback = await db.ticketFeedback.create({ data: { ticketId: ticket.id, rating, comment } });
  await logAudit({
    ticketId: ticket.id,
    actorRole: "CUSTOMER",
    actorName: ticket.customerName,
    action: "FEEDBACK_RECEIVED",
    newValue: `${rating}/5`,
    details: comment,
  });

  if (rating <= 2) {
    const full = await db.ticket.findUnique({
      where: { id: ticket.id },
      include: { branch: true, category: true, assignee: { select: { name: true, email: true } } },
    });
    const manager = await db.staffUser.findFirst({
      where: { branchId: ticket.branchId, role: "BRANCH_MANAGER", isActive: true },
      select: { email: true },
    });
    if (full) {
      const v = {
        ticketNumber: full.ticketNumber,
        customerName: full.customerName,
        customerPhone: full.customerPhone,
        customerEmail: full.customerEmail,
        description: full.description.slice(0, 500),
        priority: full.priority,
        status: full.status,
        branchName: full.branch.name,
        categoryName: full.category.name,
        assigneeName: full.assignee?.name || "",
        branchManagerEmail: manager?.email || "",
        rating: String(rating),
        comment,
      };
      await queueNotification({ ticketId: full.id, ticketNumber: full.ticketNumber, event: "LOW_RATING", recipientKind: "BRANCH_MANAGER", variables: v });
      await queueNotification({ ticketId: full.id, ticketNumber: full.ticketNumber, event: "LOW_RATING", recipientKind: "CENTRAL_SUPPORT", variables: v });
    }
  }
  await emitWebhook("ticket.feedback", ticket.id, { rating, comment });
  return { rating: feedback.rating, comment: feedback.comment, createdAt: feedback.createdAt };
}
