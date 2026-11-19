// Tests for the service-desk features: department routing, least-busy
// assignment, leave handover, SLA escalation ladder, member feedback.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { applyStatusChange, createComplaint } from "@/lib/tickets";
import { handoverOpenTickets } from "@/lib/assignment";
import { runEscalationSweep } from "@/lib/escalation";
import { feedbackToken, submitFeedback, FeedbackError } from "@/lib/feedback";

type Actor = Parameters<typeof applyStatusChange>[2];

const TAG = `SVC-${Date.now()}`;
let branchId = "";
let deptA = "";
let deptB = "";
let categoryA = "";
let categoryPlain = "";
const ticketIds: string[] = [];
const staffIds: string[] = [];
let previousStrategy: string | null = null;

const admin: Actor = { id: "", name: "vitest", email: "", role: "ROOT_ADMIN", branchId: null };

async function mkAgent(name: string, departmentId: string | null, offset: number) {
  const s = await db.staffUser.create({
    data: {
      name,
      email: `${name.toLowerCase().replace(/\s+/g, ".")}.${TAG.toLowerCase()}@test.fitclass.dev`,
      passwordHash: "scrypt:x:y",
      role: "SUPPORT_AGENT",
      branchId,
      departmentId,
      createdAt: new Date(Date.now() - (100 - offset) * 60000),
    },
  });
  staffIds.push(s.id);
  return s;
}

async function mkTicket(categoryId: string, phone: string) {
  const res = await createComplaint(
    {
      customerName: "Svc Tester",
      customerPhone: phone,
      customerEmail: "svc.tester@test.example.com",
      branchId,
      categoryId,
      description: "Automated service-feature test complaint with enough detail for validation.",
      source: "SEED",
    },
    { actorName: "vitest" },
  );
  ticketIds.push(res.ticket.id);
  return db.ticket.findUniqueOrThrow({ where: { id: res.ticket.id } });
}

async function setStrategy(value: string) {
  await db.systemSetting.upsert({ where: { key: "assignment_strategy" }, create: { key: "assignment_strategy", value }, update: { value } });
}

beforeAll(async () => {
  previousStrategy = (await db.systemSetting.findUnique({ where: { key: "assignment_strategy" } }))?.value ?? null;
  branchId = (await db.branch.create({ data: { code: TAG, name: `Svc Branch ${TAG}`, notificationEmail: "" } })).id;
  deptA = (await db.department.create({ data: { name: `Dept A ${TAG}`, updatedAt: new Date() } })).id;
  deptB = (await db.department.create({ data: { name: `Dept B ${TAG}`, updatedAt: new Date() } })).id;
  categoryA = (await db.complaintCategory.create({ data: { name: `Cat A ${TAG}`, departmentId: deptA } })).id;
  categoryPlain = (await db.complaintCategory.create({ data: { name: `Cat Plain ${TAG}` } })).id;
});

afterAll(async () => {
  const ids = ticketIds;
  await db.ticketFeedback.deleteMany({ where: { ticketId: { in: ids } } });
  await db.ticketClosureJob.deleteMany({ where: { ticketId: { in: ids } } });
  await db.slaTracking.deleteMany({ where: { ticketId: { in: ids } } });
  await db.notification.deleteMany({ where: { ticketId: { in: ids } } });
  await db.auditLog.deleteMany({ where: { ticketId: { in: ids } } });
  await db.ticketMessage.deleteMany({ where: { ticketId: { in: ids } } });
  await db.ticketAssignment.deleteMany({ where: { ticketId: { in: ids } } });
  await db.ticketStatusHistory.deleteMany({ where: { ticketId: { in: ids } } });
  await db.idempotencyKey.deleteMany({ where: { ticketId: { in: ids } } });
  await db.ticket.deleteMany({ where: { id: { in: ids } } });
  await db.branchCursor.deleteMany({ where: { branchId } });
  await db.staffUser.deleteMany({ where: { id: { in: staffIds } } });
  await db.complaintCategory.deleteMany({ where: { id: { in: [categoryA, categoryPlain] } } });
  await db.department.deleteMany({ where: { id: { in: [deptA, deptB] } } });
  await db.branch.deleteMany({ where: { id: branchId } });
  if (previousStrategy === null) await db.systemSetting.deleteMany({ where: { key: "assignment_strategy" } });
  else await db.systemSetting.update({ where: { key: "assignment_strategy" }, data: { value: previousStrategy } });
  await db.$disconnect();
});

describe("Departments, routing and workload", () => {
  it("routes a ticket to its category's department, generalists take the rest", async () => {
    await setStrategy("round_robin");
    const general = await mkAgent("Gen Eral", null, 1);
    const inA = await mkAgent("Dee Aye", deptA, 2);
    await mkAgent("Dee Bee", deptB, 3);

    const t1 = await mkTicket(categoryA, "9000000101");
    expect(t1.departmentId).toBe(deptA);
    expect(t1.assignedToId).toBe(inA.id);

    const t2 = await mkTicket(categoryPlain, "9000000102");
    expect(t2.departmentId).toBeNull();
    expect(staffIds).toContain(t2.assignedToId);

    // Department member unavailable → falls back to a generalist.
    await db.staffUser.update({ where: { id: inA.id }, data: { availabilityEnabled: false } });
    const t3 = await mkTicket(categoryA, "9000000103");
    expect(t3.assignedToId).toBe(general.id);
    await db.staffUser.update({ where: { id: inA.id }, data: { availabilityEnabled: true } });
  });

  it("least-busy picks the agent with the fewest open tickets", async () => {
    await setStrategy("least_busy");
    const counts = await db.ticket.groupBy({ by: ["assignedToId"], where: { branchId, status: { in: ["NEW_COMPLAINT", "IN_PROGRESS", "ON_HOLD"] } }, _count: { _all: true } });
    const load = new Map(counts.map((c) => [c.assignedToId, c._count._all]));
    const generalists = await db.staffUser.findMany({ where: { id: { in: staffIds }, departmentId: null, availabilityEnabled: true } });
    const fresh = await mkAgent("Fresh Gen", null, 4); // 0 open tickets
    const t = await mkTicket(categoryPlain, "9000000104");
    expect(t.assignedToId).toBe(fresh.id);
    expect(generalists.every((g) => (load.get(g.id) ?? 0) >= 0)).toBe(true);
  });

  it("leave handover moves open tickets to available colleagues", async () => {
    const busy = await db.ticket.findFirstOrThrow({ where: { id: { in: ticketIds }, assignedToId: { not: null } } });
    const away = busy.assignedToId!;
    await db.staffUser.update({ where: { id: away }, data: { availabilityEnabled: false } });
    const before = await db.ticket.count({ where: { assignedToId: away, status: { in: ["NEW_COMPLAINT", "IN_PROGRESS", "ON_HOLD"] } } });
    const result = await handoverOpenTickets(away, { ...admin, id: "" }, "test leave");
    expect(result.moved.length + result.kept.length).toBe(before);
    expect(result.moved.length).toBeGreaterThan(0);
    const after = await db.ticket.count({ where: { assignedToId: away, status: { in: ["NEW_COMPLAINT", "IN_PROGRESS", "ON_HOLD"] } } });
    expect(after).toBe(result.kept.length);
    const record = await db.ticketAssignment.findFirst({ where: { ticketId: { in: ticketIds }, method: "HANDOVER" } });
    expect(record?.note).toContain("test leave");
    await db.staffUser.update({ where: { id: away }, data: { availabilityEnabled: true } });
  });
});

describe("SLA escalation ladder", () => {
  it("fires warning, breach and critical once each", async () => {
    const t = await mkTicket(categoryPlain, "9000000201");
    const created = t.createdAt.getTime();
    const due = created + 10 * 3600_000; // pretend 10 h resolution SLA
    await db.ticket.update({ where: { id: t.id }, data: { slaResolutionDueAt: new Date(due), slaAlertLevel: 0, escalatedAt: null } });

    await runEscalationSweep(new Date(created + 8 * 3600_000)); // 80% → warning
    expect((await db.ticket.findUniqueOrThrow({ where: { id: t.id } })).slaAlertLevel).toBe(1);

    await runEscalationSweep(new Date(created + 8.5 * 3600_000)); // still level 1, nothing new
    expect(await db.auditLog.count({ where: { ticketId: t.id, action: "SLA_WARNING" } })).toBe(1);

    await runEscalationSweep(new Date(created + 11 * 3600_000)); // 110% → breached + escalated
    const breached = await db.ticket.findUniqueOrThrow({ where: { id: t.id } });
    expect(breached.slaAlertLevel).toBe(2);
    expect(breached.escalatedAt).not.toBeNull();

    await runEscalationSweep(new Date(created + 16 * 3600_000)); // 160% → critical
    expect((await db.ticket.findUniqueOrThrow({ where: { id: t.id } })).slaAlertLevel).toBe(3);
    expect(await db.notification.count({ where: { ticketId: t.id, event: "SLA_CRITICAL", recipientKind: "CENTRAL_SUPPORT" } })).toBe(1);
  });

  it("skips on-hold tickets", async () => {
    const t = await mkTicket(categoryPlain, "9000000202");
    await db.ticket.update({ where: { id: t.id }, data: { status: "ON_HOLD", slaResolutionDueAt: new Date(t.createdAt.getTime() + 3600_000) } });
    await runEscalationSweep(new Date(t.createdAt.getTime() + 5 * 3600_000));
    expect((await db.ticket.findUniqueOrThrow({ where: { id: t.id } })).slaAlertLevel).toBe(0);
  });
});

describe("Member feedback", () => {
  it("accepts one rating after resolution, by token or mobile, and alerts on low ratings", async () => {
    const t = await mkTicket(categoryPlain, "9000000301");
    await expect(submitFeedback({ ticketNumber: t.ticketNumber, rating: 5, token: feedbackToken(t.ticketNumber) })).rejects.toBeInstanceOf(FeedbackError);

    await applyStatusChange(t.id, { toStatus: "IN_PROGRESS" }, admin);
    await applyStatusChange(t.id, { toStatus: "RESOLVED", resolution: "Fixed during the test." }, admin);

    await expect(submitFeedback({ ticketNumber: t.ticketNumber, rating: 4, token: "wrong-token" })).rejects.toThrow(/could not find/);
    const saved = await submitFeedback({ ticketNumber: t.ticketNumber, rating: 2, comment: "Slow", phone: "9000000301" });
    expect(saved.rating).toBe(2);
    await expect(submitFeedback({ ticketNumber: t.ticketNumber, rating: 5, token: feedbackToken(t.ticketNumber) })).rejects.toThrow(/already been rated/);
    expect(await db.notification.count({ where: { ticketId: t.id, event: "LOW_RATING" } })).toBeGreaterThan(0);
  });
});
