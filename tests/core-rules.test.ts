// Core business-rule tests for FC-CMS: round-robin assignment, status
// transitions, closed-ticket protection, tracking, reopening, auto-closure.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createComplaint, trackTicket, reopenTicket, applyStatusChange, TicketError } from "@/lib/tickets";
import { getEligibleEmployees, retryUnassignedTickets } from "@/lib/assignment";
import { runClosureSweep } from "@/lib/closure";

type AdminUser = Parameters<typeof applyStatusChange>[2];

const BRANCH_CODE = `TST-${Date.now()}`;
let branchId = "";
let employees: { id: string; name: string }[] = [];
const createdTickets: string[] = [];

async function mkEmployee(name: string, available = true, offsetHours = 0) {
  return db.staffUser.create({
    data: {
      name,
      email: `${name.toLowerCase().replace(/\s+/g, ".")}.${BRANCH_CODE.toLowerCase()}@test.fitclass.dev`,
      passwordHash: "scrypt:x:y",
      role: "SUPPORT_AGENT",
      branchId,
      availabilityEnabled: available,
      createdAt: new Date(Date.now() - (10 - employees.length) * 3600000 - offsetHours * 60000),
    },
  });
}

async function mkComplaint(name: string, phone: string) {
  const cat = await db.complaintCategory.findFirstOrThrow({ where: { isActive: true } });
  const res = await createComplaint(
    {
      customerName: name,
      customerPhone: phone,
      customerEmail: `${name.toLowerCase().replace(/\s+/g, "")}@test.example.com`,
      branchId,
      categoryId: cat.id,
      description: `Automated test complaint for ${name} covering assignment and lifecycle rules.`,
      source: "SEED",
    },
    { actorName: "vitest" },
  );
  createdTickets.push(res.ticket.id);
  return res;
}

/** Purge every ticket + child row belonging to a branch (FK-safe order). */
async function purgeBranchTickets(targetBranchId: string) {
  const tickets = await db.ticket.findMany({ where: { branchId: targetBranchId }, select: { id: true } });
  const ids = tickets.map((t) => t.id);
  if (ids.length) {
    await db.ticketClosureJob.deleteMany({ where: { ticketId: { in: ids } } });
    await db.ticketReopenHistory.deleteMany({ where: { ticketId: { in: ids } } });
    await db.slaTracking.deleteMany({ where: { ticketId: { in: ids } } });
    await db.ticketFeedback.deleteMany({ where: { ticketId: { in: ids } } });
    await db.notification.deleteMany({ where: { ticketId: { in: ids } } });
    await db.auditLog.deleteMany({ where: { ticketId: { in: ids } } });
    await db.ticketMessage.deleteMany({ where: { ticketId: { in: ids } } });
    await db.ticketAttachment.deleteMany({ where: { ticketId: { in: ids } } });
    await db.ticketAssignment.deleteMany({ where: { ticketId: { in: ids } } });
    await db.ticketStatusHistory.deleteMany({ where: { ticketId: { in: ids } } });
    await db.idempotencyKey.deleteMany({ where: { ticketId: { in: ids } } });
    await db.ticket.deleteMany({ where: { id: { in: ids } } });
  }
}

async function cleanup() {
  createdTickets.length = 0;
  if (branchId) {
    await purgeBranchTickets(branchId);
    await db.branchCursor.deleteMany({ where: { branchId } });
    await db.ticketAssignment.deleteMany({ where: { assignee: { branchId } } });
    await db.staffUser.deleteMany({ where: { branchId } });
    await db.branch.deleteMany({ where: { id: branchId } });
    branchId = "";
    employees = [];
  }
}

// These tests check the strict FIFO round-robin order, so pin that strategy
// (the product default is least-busy) and restore the setting afterwards.
let previousStrategy: string | null = null;
beforeAll(async () => {
  const row = await db.systemSetting.findUnique({ where: { key: "assignment_strategy" } });
  previousStrategy = row?.value ?? null;
  await db.systemSetting.upsert({ where: { key: "assignment_strategy" }, create: { key: "assignment_strategy", value: "round_robin" }, update: { value: "round_robin" } });
});

beforeEach(async () => {
  await cleanup();
  const branch = await db.branch.create({
    data: { code: BRANCH_CODE, name: "Test Branch", city: "Testville", notificationEmail: "" },
  });
  branchId = branch.id;
});

afterAll(async () => {
  await cleanup().catch(() => undefined);
  if (previousStrategy === null) await db.systemSetting.deleteMany({ where: { key: "assignment_strategy" } }).catch(() => undefined);
  else await db.systemSetting.update({ where: { key: "assignment_strategy" }, data: { value: previousStrategy } }).catch(() => undefined);
  await db.$disconnect();
});

describe("Branch-wise round-robin assignment", () => {
  it("distributes 8 tickets equally across 4 employees (FIFO cycle)", async () => {
    employees = [await mkEmployee("Emp One"), await mkEmployee("Emp Two"), await mkEmployee("Emp Three"), await mkEmployee("Emp Four")];
    const counts = new Map<string, number>();
    for (let i = 1; i <= 8; i++) {
      const res = await mkComplaint(`Customer ${i}`, `912340000${i}`);
      expect(res.ticket.assignedToId).toBeTruthy();
      counts.set(res.ticket.assignedToId!, (counts.get(res.ticket.assignedToId!) || 0) + 1);
    }
    expect(counts.size).toBe(4);
    for (const c of counts.values()) expect(c).toBe(2);

    // Cursor persisted on the branch
    const cursor = await db.branchCursor.findUniqueOrThrow({ where: { branchId } });
    expect(employees.map((e) => e.id)).toContain(cursor.lastEmployeeId);
  });

  it("keeps queues independent per branch", async () => {
    employees = [await mkEmployee("Solo Agent")];
    const otherBranch = await db.branch.create({ data: { code: `${BRANCH_CODE}-B`, name: "Other Test Branch", notificationEmail: "" } });
    const otherEmp = await db.staffUser.create({
      data: { name: "Other Agent", email: `other.${BRANCH_CODE.toLowerCase()}@test.fitclass.dev`, passwordHash: "scrypt:x:y", role: "SUPPORT_AGENT", branchId: otherBranch.id },
    });

    const cat = await db.complaintCategory.findFirstOrThrow({ where: { isActive: true } });
    const t1 = await createComplaint({ customerName: "A", customerPhone: "9123400001", customerEmail: "a@test.example.com", branchId, categoryId: cat.id, description: "Branch one ticket for queue isolation testing.", source: "SEED" }, { actorName: "vitest" });
    createdTickets.push(t1.ticket.id);
    const t2 = await createComplaint({ customerName: "B", customerPhone: "9123400002", customerEmail: "b@test.example.com", branchId: otherBranch.id, categoryId: cat.id, description: "Branch two ticket for queue isolation testing.", source: "SEED" }, { actorName: "vitest" });
    createdTickets.push(t2.ticket.id);

    expect(t1.ticket.assignedToId).toBe(employees[0].id);
    expect(t2.ticket.assignedToId).toBe(otherEmp.id);

    await purgeBranchTickets(otherBranch.id);
    await db.branchCursor.deleteMany({ where: { branchId: otherBranch.id } });
    await db.staffUser.deleteMany({ where: { branchId: otherBranch.id } });
    await db.branch.delete({ where: { id: otherBranch.id } });
  });

  it("skips unavailable employees and re-enters them when reactivated", async () => {
    const available = await mkEmployee("Available Agent");
    await mkEmployee("Unavailable Agent", false);

    const res1 = await mkComplaint("Skip Test 1", "9123400011");
    expect(res1.ticket.assignedToId).toBe(available.id);

    // Eligibility list excludes unavailable
    const eligible = await getEligibleEmployees(branchId);
    expect(eligible).toHaveLength(1);

    // Reactivate → included again and unassigned tickets flow
    await db.staffUser.updateMany({ where: { branchId: branchId, name: "Unavailable Agent" }, data: { availabilityEnabled: true } });
    const eligible2 = await getEligibleEmployees(branchId);
    expect(eligible2).toHaveLength(2);
    const res2 = await mkComplaint("Skip Test 2", "9123400012");
    // cursor was on Available; next in rotation (by createdAt) is Unavailable Agent
    const resumed = await db.staffUser.findFirstOrThrow({ where: { branchId, name: "Unavailable Agent" } });
    expect(res2.ticket.assignedToId).toBe(resumed.id);
  });

  it("leaves ticket IN_PROGRESS + unassigned when nobody is eligible, then retry assigns", async () => {
    employees = [await mkEmployee("Gone Agent", false)];
    const res = await mkComplaint("Nobody Home", "9123400021");
    expect(res.ticket.status).toBe("IN_PROGRESS");
    expect(res.ticket.assignedToId).toBeNull();

    // Make someone available → retry sweep assigns
    await db.staffUser.updateMany({ where: { branchId }, data: { availabilityEnabled: true } });
    const result = await retryUnassignedTickets(branchId);
    expect(result.assigned).toBe(1);
    expect(result.remaining).toBe(0);
    const fresh = await db.ticket.findUniqueOrThrow({ where: { id: res.ticket.id } });
    expect(fresh.assignedToId).toBe(employees[0].id);
  });

  it("reopen retains the original assignee when still eligible", async () => {
    employees = [await mkEmployee("Retained Agent"), await mkEmployee("Second Agent")];
    const res = await mkComplaint("Reopen Me", "9123400031");
    const agent = await db.staffUser.findUniqueOrThrow({ where: { id: res.ticket.assignedToId! } });
    const admin = (await db.staffUser.findFirstOrThrow({ where: { role: "ROOT_ADMIN" } })) as unknown as AdminUser;

    // resolve then reopen
    await applyStatusChange(res.ticket.id, { toStatus: "RESOLVED", resolution: "Fixed during test." }, admin);
    await reopenTicket(res.ticket.ticketNumber, "9123400031", "Problem came back during testing.");

    const fresh = await db.ticket.findUniqueOrThrow({ where: { id: res.ticket.id } });
    expect(fresh.status).toBe("IN_PROGRESS");
    expect(fresh.assignedToId).toBe(agent.id);
    expect(fresh.reopenCount).toBe(1);
  });
});

describe("Status transitions and closed-ticket protection", () => {
  let admin: AdminUser;

  beforeEach(async () => {
    employees = [await mkEmployee("Flow Agent")];
    admin = (await db.staffUser.findFirstOrThrow({ where: { role: "ROOT_ADMIN" } })) as unknown as AdminUser;
  });

  it("allows the documented happy path: in_progress → on_hold → in_progress → resolved", async () => {
    const res = await mkComplaint("Flow Test", "9123400041");
    expect(res.ticket.status).toBe("IN_PROGRESS");
    await applyStatusChange(res.ticket.id, { toStatus: "ON_HOLD", reason: "waiting for part" }, admin);
    await applyStatusChange(res.ticket.id, { toStatus: "IN_PROGRESS", note: "resume" }, admin);
    await applyStatusChange(res.ticket.id, { toStatus: "RESOLVED", resolution: "Part replaced and verified." }, admin);
    const fresh = await db.ticket.findUniqueOrThrow({ where: { id: res.ticket.id } });
    expect(fresh.status).toBe("RESOLVED");
    expect(fresh.autoCloseAt).toBeTruthy();
    expect(fresh.resolvedAt).toBeTruthy();
  });

  it("rejects invalid transitions (in_progress → closed, on_hold → closed, resolved → resolved)", async () => {
    const res = await mkComplaint("Invalid Flow", "9123400042");
    await expect(applyStatusChange(res.ticket.id, { toStatus: "CLOSED" }, admin)).rejects.toThrow(TicketError);
    await applyStatusChange(res.ticket.id, { toStatus: "ON_HOLD", reason: "hold" }, admin);
    await expect(applyStatusChange(res.ticket.id, { toStatus: "CLOSED" }, admin)).rejects.toThrow(TicketError);
  });

  it("makes closed tickets permanently read-only for every role (incl. Root Admin)", async () => {
    const res = await mkComplaint("Readonly Test", "9123400043");
    await applyStatusChange(res.ticket.id, { toStatus: "RESOLVED", resolution: "Resolved for readonly test." }, admin);

    // force the deadline into the past and sweep
    await db.ticket.update({ where: { id: res.ticket.id }, data: { autoCloseAt: new Date(Date.now() - 1000) } });
    await db.ticketClosureJob.updateMany({ where: { ticketId: res.ticket.id }, data: { runAt: new Date(Date.now() - 1000) } });
    const sweep1 = await runClosureSweep();
    expect(sweep1.closed).toBeGreaterThanOrEqual(1);

    const closed = await db.ticket.findUniqueOrThrow({ where: { id: res.ticket.id } });
    expect(closed.status).toBe("CLOSED");

    await expect(applyStatusChange(res.ticket.id, { toStatus: "IN_PROGRESS", note: "hack attempt" }, admin)).rejects.toThrow(/read-only/);
    await expect(reopenTicket(res.ticket.ticketNumber, "9123400043", "Trying to reopen after closure.")).rejects.toThrow(/already been closed/);
  });

  it("closure sweep is idempotent and does not close reopened tickets", async () => {
    const res = await mkComplaint("Sweep Test", "9123400044");
    await applyStatusChange(res.ticket.id, { toStatus: "RESOLVED", resolution: "Resolved for sweep test." }, admin);
    await db.ticket.update({ where: { id: res.ticket.id }, data: { autoCloseAt: new Date(Date.now() - 1000) } });
    await db.ticketClosureJob.updateMany({ where: { ticketId: res.ticket.id }, data: { runAt: new Date(Date.now() - 1000) } });

    const first = await runClosureSweep();
    const second = await runClosureSweep();
    expect(first.closed).toBe(1);
    expect(second.closed).toBe(0);

    // Reopen deadline already past → customer reopen rejected
    await expect(reopenTicket(res.ticket.ticketNumber, "9123400044", "Too late to reopen this ticket.")).rejects.toThrow(TicketError);
  });
});

describe("Customer tracking security", () => {
  beforeEach(async () => {
    employees = [await mkEmployee("Track Agent")];
  });

  it("matches ticket + registered mobile and never leaks on mismatch", async () => {
    const res = await mkComplaint("Track Me", "9123400051");

    const ok = await trackTicket(res.ticket.ticketNumber, "9123400051");
    expect(ok.ticketNumber).toBe(res.ticket.ticketNumber);
    expect(ok.timeline.length).toBeGreaterThanOrEqual(1);

    // Wrong mobile → generic error, no existence leak
    await expect(trackTicket(res.ticket.ticketNumber, "9999999999")).rejects.toThrow(/could not find a ticket/);
    // Unknown ticket → same generic error
    await expect(trackTicket("FC-2026-999999", "9123400051")).rejects.toThrow(/could not find a ticket/);
    // Malformed ticket ID → generic error
    await expect(trackTicket("DROP TABLE", "9123400051")).rejects.toThrow(/could not find a ticket/);
  });

  it("customer-visible projection hides internal data", async () => {
    const res = await mkComplaint("Projection Test", "9123400052");
    const view = await trackTicket(res.ticket.ticketNumber, "9123400052");
    expect(view.timeline.every((h) => h.to !== "INTERNAL")).toBe(true);
    expect(JSON.stringify(view)).not.toContain("customerPhone");
    expect(JSON.stringify(view)).not.toContain("@test.example.com".toUpperCase());
  });
});
