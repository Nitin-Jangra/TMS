// FC-CMS development seed — dummy data only (spec section 25).
// Never used in production migrations: production synchronizes real branches
// and employees from the FitClass CRM, and never copies dummy records.
//
// All 34 real FitClass branches are created (prisma/fitclass-branches.json).
// Staff profiles for login testing exist ONLY in Sector 48, Sector 49 and
// Sector 7. Sector 37C intentionally has a manager but NO support employees
// to demonstrate the unassigned-queue flow.
//
// Run: bun prisma/seed.ts

import { PrismaClient } from "@prisma/client";
import fitclassBranches from "./fitclass-branches.json";
import { scryptSync, randomBytes, createHmac, randomUUID } from "crypto";

const db = new PrismaClient();

function hashPassword(password: string): string {
  // Same self-describing format as src/lib/auth.ts (scrypt$N$r:salt:hash).
  // Set FCMS_SCRYPT_N=1024 to pre-hash for the Cloudflare Workers free plan
  // (10 ms CPU limit) — normally left at the default for local development.
  const n = Math.max(1024, Number(process.env.FCMS_SCRYPT_N || 16384));
  const r = Math.max(1, Number(process.env.FCMS_SCRYPT_R || 8));
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64, { N: n, r, p: 1 }).toString("hex");
  return `scrypt$${n}$${r}:${salt}:${hash}`;
}

function hashApiKey(key: string): string {
  return createHmac("sha256", "fcms-api-key").update(key).digest("hex");
}

const now = Date.now();
const daysAgo = (d: number, h = 0) => new Date(now - d * 86400000 - h * 3600000);
const hoursAhead = (h: number) => new Date(now + h * 3600000);

async function main() {
  console.log("Seeding FC-CMS development database (dummy data)...");

  await db.$transaction([
    db.customerAccessLog.deleteMany(),
    db.idempotencyKey.deleteMany(),
    db.apiClient.deleteMany(),
    db.configAudit.deleteMany(),
    db.systemSetting.deleteMany(),
    db.slaTracking.deleteMany(),
    db.ticketFeedback.deleteMany(),
    db.savedView.deleteMany(),
    db.cannedResponse.deleteMany(),
    db.slaPolicy.deleteMany(),
    db.ticketReopenHistory.deleteMany(),
    db.ticketClosureJob.deleteMany(),
    db.branchCursor.deleteMany(),
    db.notification.deleteMany(),
    db.auditLog.deleteMany(),
    db.ticketMessage.deleteMany(),
    db.ticketAttachment.deleteMany(),
    db.ticketAssignment.deleteMany(),
    db.ticketStatusHistory.deleteMany(),
    db.ticket.deleteMany(),
    db.complaintCategory.deleteMany(),
    db.department.deleteMany(),
    db.ticketSequence.deleteMany(),
    db.staffUser.deleteMany(),
    db.branch.deleteMany(),
  ]);

  // ------------------------------------------------------------------ branches
  // The real FitClass branch list (prisma/fitclass-branches.json, from fitclass.in).
  // Demo staff + tickets are attached to the first four of them.
  const branchByCode = new Map<string, { id: string; name: string }>();
  for (const [i, b] of fitclassBranches.entries()) {
    const row = await db.branch.create({
      data: { code: b.code, name: b.name, city: b.city, address: b.address, notificationEmail: "", createdAt: daysAgo(30, i) },
    });
    branchByCode.set(b.code, row);
  }
  const br48 = branchByCode.get("BR001")!; // Sector 48
  const br49 = branchByCode.get("BR002")!; // Sector 49
  const brGC = branchByCode.get("BR005")!; // Sector 7
  const brSR = branchByCode.get("BR006")!; // Sector 37C — manager only, no support employees

  // ------------------------------------------------------------------ categories
  const categoryNames = [
    "Equipment Issues", "Membership Issues", "Billing and Payments", "Trainer Complaints",
    "Cleanliness", "Locker Issues", "Staff Behaviour", "Facility Maintenance",
    "General Feedback", "Other",
  ];
  const categories: Record<string, { id: string; name: string }> = {};
  for (let i = 0; i < categoryNames.length; i++) {
    const c = await db.complaintCategory.create({ data: { name: categoryNames[i], sortOrder: i } });
    categories[categoryNames[i]] = c;
  }

  // ------------------------------------------------------------------ departments + routing
  // Same defaults as cloudflare/d1/0005_service_features.sql.
  const departmentDefs: { id: string; name: string; description: string; categories: string[] }[] = [
    { id: "fc-dept-frontdesk", name: "Front Desk & Membership", description: "Membership, renewals, freezes, lockers, guest passes", categories: ["Membership Issues", "Locker Issues"] },
    { id: "fc-dept-accounts", name: "Accounts & Billing", description: "Payments, refunds, invoices, EMI", categories: ["Billing and Payments"] },
    { id: "fc-dept-maintenance", name: "Maintenance & Facilities", description: "Equipment, AC, showers, electrical, repairs", categories: ["Equipment Issues", "Facility Maintenance"] },
    { id: "fc-dept-fitness", name: "Fitness & Trainers", description: "Trainers, PT sessions, group classes, diet plans", categories: ["Trainer Complaints"] },
    { id: "fc-dept-housekeeping", name: "Housekeeping", description: "Cleanliness, washrooms, changing rooms", categories: ["Cleanliness"] },
    { id: "fc-dept-management", name: "Management", description: "Staff behaviour, serious complaints, escalations", categories: ["Staff Behaviour"] },
  ];
  for (let i = 0; i < departmentDefs.length; i++) {
    const d = departmentDefs[i];
    await db.department.create({ data: { id: d.id, name: d.name, description: d.description, sortOrder: i } });
    for (const name of d.categories) {
      if (categories[name]) await db.complaintCategory.update({ where: { id: categories[name].id }, data: { departmentId: d.id } });
    }
  }
  const starterTemplates = [
    { title: "Acknowledge — looking into it", body: "Hi {{customerName}}, thank you for letting us know. We are looking into your complaint ({{ticketNumber}}) at FitClass {{branchName}} and will update you shortly. — {{agentName}}" },
    { title: "Equipment under repair", body: "Hi {{customerName}}, the equipment you reported at FitClass {{branchName}} has been marked out of order and our maintenance team is repairing it. We expect it back in service within 48 hours. Sorry for the inconvenience. — {{agentName}}" },
    { title: "Refund initiated", body: "Hi {{customerName}}, your refund for ticket {{ticketNumber}} has been initiated. It usually reaches your account within 5–7 working days. — {{agentName}}, FitClass Accounts" },
    { title: "Cleaning done", body: "Hi {{customerName}}, thank you for flagging this. The area has been cleaned and our housekeeping schedule at FitClass {{branchName}} has been tightened. — {{agentName}}" },
    { title: "Need more details", body: "Hi {{customerName}}, to resolve ticket {{ticketNumber}} quickly, could you share a few more details (date, time and anything else you noticed)? You can simply reply to this message. — {{agentName}}" },
  ];
  for (const t of starterTemplates) await db.cannedResponse.create({ data: { ...t, isShared: true } });

  // ------------------------------------------------------------------ staff
  // Central team
  const rootAdmin = await db.staffUser.create({
    data: { name: "Arjun Mehta", email: "admin@fitclass.dev", phone: "9899000001", passwordHash: hashPassword("Admin@123"), role: "ROOT_ADMIN", designation: "Root Administrator", createdAt: daysAgo(26) },
  });
  const centralAdmin = await db.staffUser.create({
    data: { name: "Priya Sharma", email: "central.admin@fitclass.dev", phone: "9899000002", passwordHash: hashPassword("Central@123"), role: "CENTRAL_ADMIN", designation: "Central Support Admin", createdAt: daysAgo(26) },
  });
  const centralAgent1 = await db.staffUser.create({
    data: { name: "Rohit Verma", email: "central.agent1@fitclass.dev", phone: "9899000003", passwordHash: hashPassword("Agent@123"), role: "CENTRAL_AGENT", designation: "Central Support Agent", createdAt: daysAgo(26) },
  });
  const centralAgent2 = await db.staffUser.create({
    data: { name: "Neha Gupta", email: "central.agent2@fitclass.dev", phone: "9899000004", passwordHash: hashPassword("Agent@123"), role: "CENTRAL_AGENT", designation: "Central Support Agent", createdAt: daysAgo(26) },
  });

  // Branch managers (one per branch)
  const mgr48 = await db.staffUser.create({
    data: { name: "Karan Singh", email: "manager.b001@fitclass.dev", phone: "9899000011", passwordHash: hashPassword("Manager@123"), role: "BRANCH_MANAGER", branchId: br48.id, designation: "Branch Manager", createdAt: daysAgo(25) },
  });
  const mgr49 = await db.staffUser.create({
    data: { name: "Divya Kapoor", email: "manager.b002@fitclass.dev", phone: "9899000012", passwordHash: hashPassword("Manager@123"), role: "BRANCH_MANAGER", branchId: br49.id, designation: "Branch Manager", createdAt: daysAgo(25) },
  });
  const mgrGC = await db.staffUser.create({
    data: { name: "Sameer Khan", email: "manager.b003@fitclass.dev", phone: "9899000013", passwordHash: hashPassword("Manager@123"), role: "BRANCH_MANAGER", branchId: brGC.id, designation: "Branch Manager", createdAt: daysAgo(25) },
  });
  const mgrSR = await db.staffUser.create({
    data: { name: "Ritu Malhotra", email: "manager.b004@fitclass.dev", phone: "9899000014", passwordHash: hashPassword("Manager@123"), role: "BRANCH_MANAGER", branchId: brSR.id, designation: "Branch Manager", createdAt: daysAgo(25) },
  });

  // Support employee profiles ONLY in 3 branches (login testing per FitClass request).
  // Sector 48: 3 agents, Sector 49: 2 agents (1 unavailable), Gurugram Central: 1 agent.
  // Sohna Road: none — demonstrates the unassigned queue + assignment-failure flow.
  const empA = await db.staffUser.create({
    data: { name: "Vikas Yadav", email: "support.b001.a@fitclass.dev", phone: "9899000021", passwordHash: hashPassword("Support@123"), role: "SUPPORT_AGENT", branchId: br48.id, designation: "Support Executive", createdAt: daysAgo(24, 1) },
  });
  const empB = await db.staffUser.create({
    data: { name: "Anita Desai", email: "support.b001.b@fitclass.dev", phone: "9899000022", passwordHash: hashPassword("Support@123"), role: "SUPPORT_AGENT", branchId: br48.id, designation: "Support Executive", createdAt: daysAgo(24, 2) },
  });
  const empC = await db.staffUser.create({
    data: { name: "Farhan Ali", email: "support.b001.c@fitclass.dev", phone: "9899000023", passwordHash: hashPassword("Support@123"), role: "SUPPORT_AGENT", branchId: br48.id, designation: "Support Executive", createdAt: daysAgo(24, 3) },
  });
  const empD = await db.staffUser.create({
    data: { name: "Sneha Iyer", email: "support.b002.a@fitclass.dev", phone: "9899000031", passwordHash: hashPassword("Support@123"), role: "SUPPORT_AGENT", branchId: br49.id, designation: "Support Executive", createdAt: daysAgo(24, 4) },
  });
  const empE = await db.staffUser.create({
    data: { name: "Manish Raj", email: "support.b002.b@fitclass.dev", phone: "9899000032", passwordHash: hashPassword("Support@123"), role: "SUPPORT_AGENT", branchId: br49.id, designation: "Support Executive", availabilityEnabled: false, createdAt: daysAgo(24, 5) },
  });
  const empF = await db.staffUser.create({
    data: { name: "Pooja Nair", email: "support.b003.a@fitclass.dev", phone: "9899000041", passwordHash: hashPassword("Support@123"), role: "SUPPORT_AGENT", branchId: brGC.id, designation: "Support Executive", createdAt: daysAgo(24, 6) },
  });

  // ------------------------------------------------------------------ SLA policies (dummy development values, Root Admin configurable)
  for (const p of [
    { priority: "CRITICAL", responseTargetMinutes: 15, resolutionTargetMinutes: 240 },
    { priority: "HIGH", responseTargetMinutes: 60, resolutionTargetMinutes: 1440 },
    { priority: "MEDIUM", responseTargetMinutes: 240, resolutionTargetMinutes: 2880 },
    { priority: "LOW", responseTargetMinutes: 480, resolutionTargetMinutes: 4320 },
  ]) {
    await db.slaPolicy.create({ data: p });
  }

  // ------------------------------------------------------------------ settings
  // Branch + central notification emails intentionally BLANK until FitClass
  // updates them. All other defaults live here explicitly for auditability.
  const settings = [
    { key: "central_support_email", value: "" },
    { key: "ticket_id_prefix", value: "FC" },
    { key: "reopen_window_hours", value: "72" },
    { key: "auto_closure_enabled", value: "true" },
    { key: "maintenance_mode", value: "false" },
    { key: "max_upload_mb", value: "10" },
    { key: "allowed_upload_types", value: "image/png,image/jpeg,image/webp,application/pdf" },
    { key: "notification_customer_enabled", value: "true" },
    { key: "notification_branch_enabled", value: "true" },
    { key: "notification_central_enabled", value: "true" },
    { key: "staff_cross_branch_access", value: "false" },
  ];
  for (const s of settings) await db.systemSetting.create({ data: s });

  // ------------------------------------------------------------------ API client for CRM/LMS integration
  const apiKey = "fc_dev_crm_lms_2026_a1b2c3d4e5f6g7h8";
  await db.apiClient.create({
    data: {
      name: "FitClass LMS Integration (dev)",
      keyPrefix: apiKey.slice(0, 12),
      apiKey, // dev-mode: visible in Root Admin panel; production stores hash only
      apiKeyHash: hashApiKey(apiKey),
      scopes: "read,write",
    },
  });

  // ------------------------------------------------------------------ ticket sequence
  // 11 dummy tickets were created above (FC-2026-000001 .. 000011); the
  // sequence continues from the highest used number.
  await db.ticketSequence.create({ data: { prefix: "FC", year: 2026, lastNumber: 11 } });

  // ------------------------------------------------------------------ dummy tickets (all five statuses, with histories)
  const mk = async (opts: {
    n: number;
    branch: { id: string; name: string };
    category: string;
    customer: string;
    phone: string;
    email: string;
    description: string;
    status: "IN_PROGRESS" | "ON_HOLD" | "RESOLVED" | "CLOSED";
    priority?: string;
    assignee?: { id: string; name: string } | null;
    createdAt: Date;
    notes?: { visibility: "INTERNAL" | "PUBLIC"; authorId: string | null; authorName: string; body: string; at: Date }[];
    resolution?: string;
    reopened?: boolean;
  }) => {
    const ticketNumber = `FC-2026-${String(opts.n).padStart(6, "0")}`;
    const assigned = opts.assignee || null;
    const createdAt = opts.createdAt;
    const resolvedAt = opts.status === "RESOLVED" || opts.status === "CLOSED" ? new Date(createdAt.getTime() + 8 * 3600000) : null;
    const autoCloseAt = resolvedAt ? new Date(resolvedAt.getTime() + 72 * 3600000) : null;
    const closedAt = opts.status === "CLOSED" ? new Date((resolvedAt || createdAt).getTime() + 72 * 3600000) : null;

    const ticket = await db.ticket.create({
      data: {
        ticketNumber,
        customerName: opts.customer,
        customerPhone: opts.phone,
        customerEmail: opts.email,
        branchId: opts.branch.id,
        categoryId: categories[opts.category].id,
        description: opts.description,
        status: opts.status,
        priority: opts.priority || "MEDIUM",
        source: "PORTAL",
        assignedToId: assigned?.id || null,
        assignedAt: assigned ? new Date(createdAt.getTime() + 5 * 60000) : null,
        firstResponseAt: opts.notes?.length || opts.status !== "IN_PROGRESS" ? new Date(createdAt.getTime() + 40 * 60000) : null,
        resolvedAt,
        autoCloseAt: opts.status === "RESOLVED" ? autoCloseAt : opts.status === "CLOSED" ? null : null,
        closedAt,
        reopenCount: opts.reopened ? 1 : 0,
        createdAt,
        updatedAt: closedAt || resolvedAt || createdAt,
      },
    });

    const history: { fromStatus: string | null; toStatus: string; note: string; at: Date; by: string }[] = [
      { fromStatus: null, toStatus: "IN_PROGRESS", note: "Complaint registered (In Progress)", at: createdAt, by: "System" },
    ];
    if (opts.status === "ON_HOLD") {
      history.push({ fromStatus: "IN_PROGRESS", toStatus: "ON_HOLD", note: "Waiting for replacement part from vendor", at: new Date(createdAt.getTime() + 4 * 3600000), by: assigned?.name || "Support" });
    }
    if (opts.status === "RESOLVED" || opts.status === "CLOSED") {
      const from = opts.reopened ? "IN_PROGRESS" : opts.status === "CLOSED" ? "ON_HOLD" : "IN_PROGRESS";
      if (opts.reopened) {
        history.push({ fromStatus: "IN_PROGRESS", toStatus: "RESOLVED", note: "Resolved once", at: new Date(createdAt.getTime() + 20 * 3600000), by: assigned?.name || "Support" });
        history.push({ fromStatus: "RESOLVED", toStatus: "IN_PROGRESS", note: "Reopened by customer: issue reappeared after a day", at: new Date(createdAt.getTime() + 40 * 3600000), by: "Customer" });
      }
      history.push({ fromStatus: from, toStatus: "RESOLVED", note: opts.resolution || "Issue fixed.", at: resolvedAt!, by: assigned?.name || "Support" });
    }
    if (opts.status === "CLOSED") {
      history.push({ fromStatus: "RESOLVED", toStatus: "CLOSED", note: "Automatically closed after the reopening window expired", at: closedAt!, by: "System (auto-closure)" });
    }
    for (const h of history) {
      await db.ticketStatusHistory.create({
        data: { ticketId: ticket.id, fromStatus: h.fromStatus, toStatus: h.toStatus, changedByName: h.by, note: h.note, createdAt: h.at },
      });
    }

    if (assigned) {
      await db.ticketAssignment.create({
        data: { ticketId: ticket.id, assignedToId: assigned.id, method: "ROUND_ROBIN", isCurrent: true, createdAt: new Date(createdAt.getTime() + 5 * 60000) },
      });
    }

    if (opts.status === "RESOLVED" || opts.status === "CLOSED") {
      await db.slaTracking.create({
        data: {
          ticketId: ticket.id,
          priority: opts.priority || "MEDIUM",
          responseTargetMinutes: 240,
          resolutionTargetMinutes: 2880,
          firstResponseMetAt: new Date(createdAt.getTime() + 40 * 60000),
        },
      });
    }

    if (opts.status === "RESOLVED") {
      await db.ticketClosureJob.create({ data: { ticketId: ticket.id, runAt: autoCloseAt!, status: "SCHEDULED" } });
    } else if (opts.status === "CLOSED") {
      await db.ticketClosureJob.create({ data: { ticketId: ticket.id, runAt: closedAt!, status: "COMPLETED", executedAt: closedAt! } });
    }
    if (opts.reopened) {
      await db.ticketReopenHistory.create({ data: { ticketId: ticket.id, reason: "Issue reappeared after a day", previousStatus: "RESOLVED", reopenedAt: new Date(createdAt.getTime() + 40 * 3600000), assignedTo: assigned?.id } });
    }

    for (const note of opts.notes || []) {
      await db.ticketMessage.create({
        data: { ticketId: ticket.id, authorType: note.authorId ? "SUPPORT" : "SYSTEM", visibility: note.visibility, authorId: note.authorId, authorName: note.authorName, body: note.body, createdAt: note.at },
      });
    }

    await db.notification.create({
      data: { ticketId: ticket.id, event: "COMPLAINT_REGISTERED", recipientKind: "CUSTOMER", recipientEmail: opts.email, subject: `FitClass Support: Complaint registered — ${ticketNumber}`, body: "Dear customer, your complaint has been registered.", status: "SENT", attempts: 1, sentAt: createdAt },
    });
    await db.notification.create({
      data: { ticketId: ticket.id, event: "COMPLAINT_REGISTERED", recipientKind: "BRANCH", recipientEmail: "", subject: `FitClass Support: Complaint registered — ${ticketNumber}`, body: "New complaint at " + opts.branch.name, status: "SKIPPED", lastError: "Branch notification email not configured yet (left blank by FitClass).", createdAt },
    });
    await db.auditLog.create({
      data: { ticketId: ticket.id, actorRole: "CUSTOMER", actorName: opts.customer, action: "TICKET_CREATED", newValue: ticketNumber, details: `Complaint registered at ${opts.branch.name}`, createdAt },
    });
    if (assigned) {
      await db.auditLog.create({
        data: { ticketId: ticket.id, actorRole: "SYSTEM", actorName: "System", action: "TICKET_ASSIGNED", newValue: assigned.name, details: "Assigned via branch round-robin queue", createdAt: new Date(createdAt.getTime() + 5 * 60000) },
      });
    }
    return ticket;
  };

  // --- Sector 48 rotation demo: T1 -> Vikas, T2 -> Anita, T3 -> Farhan, T4 -> Vikas
  await mk({
    n: 1, branch: br48, category: "Equipment Issues",
    customer: "Rahul Khanna", phone: "9123456701", email: "rahul.khanna@example.com",
    description: "Treadmill 4 in the cardio section stops suddenly after 10 minutes of use. The display flashes an error code.",
    status: "IN_PROGRESS", priority: "HIGH", assignee: { id: empA.id, name: empA.name },
    createdAt: daysAgo(3),
    notes: [
      { visibility: "PUBLIC", authorId: empA.id, authorName: empA.name, body: "We have inspected the treadmill and ordered the controller board. Estimated repair time: 2 days. We apologize for the inconvenience.", at: daysAgo(2) },
      { visibility: "INTERNAL", authorId: empA.id, authorName: empA.name, body: "Vendor confirmed shipment of the controller board. Follow up tomorrow morning.", at: daysAgo(2, -1) },
    ],
  });
  await mk({
    n: 2, branch: br48, category: "Locker Issues",
    customer: "Sana Sheikh", phone: "9123456702", email: "sana.sheikh@example.com",
    description: "My locker key is stuck in the changing room locker number 22. Staff could not open it either.",
    status: "IN_PROGRESS", assignee: { id: empB.id, name: empB.name },
    createdAt: daysAgo(2, 6),
    notes: [{ visibility: "PUBLIC", authorId: empB.id, authorName: empB.name, body: "A locksmith visit is scheduled for tomorrow morning. We will update you right after.", at: daysAgo(2) }],
  });
  await mk({
    n: 3, branch: br48, category: "Cleanliness",
    customer: "Rohit Bansal", phone: "9123456703", email: "rohit.bansal@example.com",
    description: "The group class studio has not been cleaned between evening batches for the past week. Mats are sticky.",
    status: "ON_HOLD", assignee: { id: empC.id, name: empC.name },
    createdAt: daysAgo(2),
    notes: [
      { visibility: "PUBLIC", authorId: empC.id, authorName: empC.name, body: "We have raised this with the housekeeping contractor. A revised cleaning schedule is being finalized.", at: daysAgo(1) },
      { visibility: "INTERNAL", authorId: empC.id, authorName: empC.name, body: "Housekeeping vendor contract renewal is pending. Hold until the new schedule is signed.", at: daysAgo(1, -2) },
    ],
  });
  await mk({
    n: 4, branch: br48, category: "Billing and Payments",
    customer: "Meera Joshi", phone: "9123456704", email: "meera.joshi@example.com",
    description: "I was charged twice for my monthly membership on the 5th. The amount has not been refunded yet.",
    status: "RESOLVED", priority: "HIGH", assignee: { id: empA.id, name: empA.name },
    createdAt: daysAgo(6),
    resolution: "The duplicate payment of Rs. 2,499 has been refunded to your card. It reflects within 5-7 working days.",
    notes: [{ visibility: "INTERNAL", authorId: empA.id, authorName: empA.name, body: "Confirmed duplicate transaction with the payment gateway. Refund initiated.", at: daysAgo(5) }],
  });
  await mk({
    n: 5, branch: br48, category: "Trainer Complaints",
    customer: "Aditya Rao", phone: "9123456705", email: "aditya.rao@example.com",
    description: "The floor trainer was on the phone throughout my session and did not correct my form even after asking twice.",
    status: "CLOSED", assignee: { id: empB.id, name: empB.name },
    createdAt: daysAgo(12),
    resolution: "We discussed the session conduct with the trainer and re-emphasized floor protocols. Additional supervision has been added in evening hours.",
  });

  // --- Sector 49 rotation demo: T6 -> Sneha, T7 -> unavailable Manish queue goes to Sneha
  await mk({
    n: 6, branch: br49, category: "Membership Issues",
    customer: "Kavita Menon", phone: "9123456706", email: "kavita.menon@example.com",
    description: "My membership freeze request submitted 10 days ago has not been processed yet. I am travelling next week.",
    status: "IN_PROGRESS", assignee: { id: empD.id, name: empD.name },
    createdAt: daysAgo(1, 12),
    notes: [{ visibility: "PUBLIC", authorId: empD.id, authorName: empD.name, body: "Your freeze request has been approved and applied from next Monday. Confirmation email will follow.", at: daysAgo(1) }],
  });
  await mk({
    n: 7, branch: br49, category: "Staff Behaviour",
    customer: "Deepak Chawla", phone: "9123456707", email: "deepak.chawla@example.com",
    description: "The front desk staff was rude when I asked about guest passes and refused to escalate to a manager.",
    status: "IN_PROGRESS", priority: "HIGH", assignee: { id: empD.id, name: empD.name },
    createdAt: daysAgo(0, 5),
  });
  await mk({
    n: 8, branch: br49, category: "Facility Maintenance",
    customer: "Ishita Bose", phone: "9123456708", email: "ishita.bose@example.com",
    description: "The steam room in the ladies changing area has been out of order for three days with no update displayed.",
    status: "IN_PROGRESS", assignee: null, // unassigned queue demo
    createdAt: daysAgo(0, 3),
  });

  // --- Gurugram Central
  await mk({
    n: 9, branch: brGC, category: "Equipment Issues",
    customer: "Nikhil Suri", phone: "9123456709", email: "nikhil.suri@example.com",
    description: "Two of the four squat racks have a loose safety bar. It slides down under load and feels unsafe.",
    status: "RESOLVED", priority: "CRITICAL", assignee: { id: empF.id, name: empF.name },
    createdAt: daysAgo(4),
    resolution: "Both racks were re-fitted with new locking pins and inspected by the facilities team. Please report again if the bar shifts.",
    reopened: true,
  });
  await mk({
    n: 10, branch: brGC, category: "General Feedback",
    customer: "Tanvi Arora", phone: "9123456710", email: "tanvi.arora@example.com",
    description: "The water cooler near the studio is often empty in the mornings. Please increase refill frequency.",
    status: "CLOSED", assignee: { id: empF.id, name: empF.name },
    createdAt: daysAgo(10),
    resolution: "Refill schedule increased to three times daily during peak hours. Thanks for the suggestion.",
  });

  // --- Sohna Road (no support employees -> stays unassigned)
  await mk({
    n: 11, branch: brSR, category: "Other",
    customer: "Gaurav Pillai", phone: "9123456711", email: "gaurav.pillai@example.com",
    description: "Visitors are parking in member slots and there is no attendant after 8 PM.",
    status: "IN_PROGRESS", assignee: null,
    createdAt: daysAgo(0, 8),
  });

  // ------------------------------------------------------------------ branch cursors (round-robin state)
  // Sector 48: last assigned Vikas (A) — next goes to Anita (B).
  await db.branchCursor.create({ data: { branchId: br48.id, lastEmployeeId: empA.id, lastAssignedAt: daysAgo(6) } });
  // Sector 49: last assigned Sneha (D).
  await db.branchCursor.create({ data: { branchId: br49.id, lastEmployeeId: empD.id, lastAssignedAt: daysAgo(0, 5) } });
  // Gurugram Central: last assigned Pooja (F).
  await db.branchCursor.create({ data: { branchId: brGC.id, lastEmployeeId: empF.id, lastAssignedAt: daysAgo(10) } });
  // Sohna Road: no cursor — never had an eligible employee.

  console.log("Seed complete.");
  console.log("----------------------------------------------------------------");
  console.log("TEST LOGIN ACCOUNTS (development only):");
  console.log("  Root Admin            admin@fitclass.dev           / Admin@123");
  console.log("  Central Admin         central.admin@fitclass.dev   / Central@123");
  console.log("  Central Agent         central.agent1@fitclass.dev  / Agent@123");
  console.log("  Manager Sector 48     manager.b001@fitclass.dev    / Manager@123");
  console.log("  Support Sector 48 (A) support.b001.a@fitclass.dev  / Support@123");
  console.log("  Support Sector 48 (B) support.b001.b@fitclass.dev  / Support@123");
  console.log("  Support Sector 48 (C) support.b001.c@fitclass.dev  / Support@123");
  console.log("  Manager Sector 49     manager.b002@fitclass.dev    / Manager@123");
  console.log("  Support Sector 49 (A) support.b002.a@fitclass.dev  / Support@123");
  console.log("  Support Sector 49 (B) support.b002.b@fitclass.dev  / Support@123  (availability OFF)");
  console.log("  Manager GC            manager.b003@fitclass.dev    / Manager@123");
  console.log("  Support GC            support.b003.a@fitclass.dev  / Support@123");
  console.log("  Manager Sohna Road    manager.b004@fitclass.dev    / Manager@123");
  console.log("----------------------------------------------------------------");
  console.log("CRM/LMS integration API key (dev): " + apiKey);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
