// One-off cleanup: remove orphaned vitest test branches and their data.
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

async function purgeBranch(branchId: string) {
  const tickets = await db.ticket.findMany({ where: { branchId }, select: { id: true } });
  const ids = tickets.map((t) => t.id);
  if (ids.length) {
    await db.ticketClosureJob.deleteMany({ where: { ticketId: { in: ids } } });
    await db.ticketReopenHistory.deleteMany({ where: { ticketId: { in: ids } } });
    await db.slaTracking.deleteMany({ where: { ticketId: { in: ids } } });
    await db.notification.deleteMany({ where: { ticketId: { in: ids } } });
    await db.auditLog.deleteMany({ where: { ticketId: { in: ids } } });
    await db.ticketMessage.deleteMany({ where: { ticketId: { in: ids } } });
    await db.ticketAttachment.deleteMany({ where: { ticketId: { in: ids } } });
    await db.ticketAssignment.deleteMany({ where: { ticketId: { in: ids } } });
    await db.ticketStatusHistory.deleteMany({ where: { ticketId: { in: ids } } });
    await db.idempotencyKey.deleteMany({ where: { ticketId: { in: ids } } });
    await db.ticket.deleteMany({ where: { id: { in: ids } } });
  }
  await db.branchCursor.deleteMany({ where: { branchId } });
  await db.ticketAssignment.deleteMany({ where: { assignee: { branchId } } });
  await db.staffUser.deleteMany({ where: { branchId } });
  await db.branch.deleteMany({ where: { id: branchId } });
}

async function main() {
  const orphans = await db.branch.findMany({ where: { code: { startsWith: "TST-" } } });
  console.log(`Purging ${orphans.length} orphaned test branches...`);
  for (const b of orphans) {
    await purgeBranch(b.id);
    console.log(`  removed ${b.code}`);
  }
  const left = await db.branch.findMany({ select: { code: true, name: true } });
  console.log("Remaining branches:", left.map((b) => `${b.code} ${b.name}`).join(", "));
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
