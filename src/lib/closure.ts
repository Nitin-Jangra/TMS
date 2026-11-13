// Automatic Ticket Closure Engine + background worker.
// Durable: closure deadlines are stored on the ticket (autoCloseAt) and in
// ticket_closure_jobs. The sweep is idempotent and re-verifies status +
// deadline inside the transaction with row locking semantics. JavaScript
// timers only TRIGGER the sweep; they never hold schedule state.

import { db, runInTransaction } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { queueNotification } from "@/lib/notifications";

/**
 * Sweep all due closure jobs. Safe to call concurrently and repeatedly:
 * each ticket row is re-verified (status === RESOLVED, deadline reached)
 * inside the transaction before closing.
 */
export async function runClosureSweep(): Promise<{ closed: number; checked: number }> {
  const now = new Date();
  const dueJobs = await db.ticketClosureJob.findMany({
    where: { status: "SCHEDULED", runAt: { lte: now } },
    orderBy: { runAt: "asc" },
    take: 50,
    select: { id: true, ticketId: true },
  });

  let closed = 0;
  for (const job of dueJobs) {
    try {
      const didClose = await runInTransaction(async (tx) => {
        const ticket = await tx.ticket.findUnique({ where: { id: job.ticketId } });
        if (!ticket) {
          await tx.ticketClosureJob.update({ where: { id: job.id }, data: { status: "CANCELLED", executedAt: new Date(), lastError: "Ticket not found" } });
          return false;
        }
        if (ticket.status !== "RESOLVED") {
          // Customer reopened or state changed meanwhile — invalidate the job.
          await tx.ticketClosureJob.update({ where: { id: job.id }, data: { status: "CANCELLED", executedAt: new Date(), lastError: `Status no longer RESOLVED (${ticket.status})` } });
          return false;
        }
        if (!ticket.autoCloseAt || ticket.autoCloseAt.getTime() > Date.now()) {
          await tx.ticketClosureJob.update({ where: { id: job.id }, data: { status: "CANCELLED", executedAt: new Date(), lastError: "Deadline moved; job invalidated" } });
          return false;
        }
        await tx.ticket.update({
          where: { id: ticket.id },
          data: { status: "CLOSED", closedAt: new Date(), autoCloseAt: null },
        });
        await tx.ticketStatusHistory.create({
          data: { ticketId: ticket.id, fromStatus: "RESOLVED", toStatus: "CLOSED", changedByName: "System (auto-closure)", note: "Automatically closed after the reopening window expired" },
        });
        await tx.ticketClosureJob.update({ where: { id: job.id }, data: { status: "COMPLETED", executedAt: new Date(), attempts: { increment: 1 } } });
        return true;
      });

      if (didClose) {
        closed += 1;
        const ticket = await db.ticket.findUnique({
          where: { id: job.ticketId },
          include: { branch: true, category: true, assignee: { select: { name: true, email: true } } },
        });
        if (ticket) {
          const v = {
            ticketNumber: ticket.ticketNumber,
            customerName: ticket.customerName,
            customerEmail: ticket.customerEmail,
            branchName: ticket.branch.name,
            branchEmail: ticket.branch.notificationEmail,
            categoryName: ticket.category.name,
            assigneeName: ticket.assignee?.name || "",
            assigneeEmail: ticket.assignee?.email || "",
          };
          await logAudit({
            ticketId: ticket.id,
            actorName: "System (auto-closure)",
            actorRole: "SYSTEM",
            action: "AUTO_CLOSED",
            previousValue: "RESOLVED",
            newValue: "CLOSED",
            details: "Automatic closure after reopen window expired",
          });
          await queueNotification({ ticketId: ticket.id, ticketNumber: ticket.ticketNumber, event: "CLOSED", recipientKind: "CUSTOMER", variables: v });
          await queueNotification({ ticketId: ticket.id, ticketNumber: ticket.ticketNumber, event: "CLOSED", recipientKind: "BRANCH", variables: v });
          await queueNotification({ ticketId: ticket.id, ticketNumber: ticket.ticketNumber, event: "CLOSED", recipientKind: "CENTRAL_SUPPORT", variables: v });
        }
      }
    } catch (err) {
      await db.ticketClosureJob
        .update({
          where: { id: job.id },
          data: { attempts: { increment: 1 }, lastError: err instanceof Error ? err.message.slice(0, 200) : "Unknown error" },
        })
        .catch(() => undefined);
    }
  }
  return { closed, checked: dueJobs.length };
}

/**
 * Retry unassigned NEW_COMPLAINT tickets (runs periodically and whenever an
 * employee's availability is turned back on).
 */
export async function runAssignmentRetrySweep(): Promise<{ assigned: number; remaining: number }> {
  const { retryUnassignedTickets } = await import("@/lib/assignment");
  return retryUnassignedTickets();
}
