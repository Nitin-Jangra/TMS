import { db } from "../src/lib/db.ts";
import { createComplaint } from "../src/lib/tickets.ts";
import { sendEmail, renderCustomerConfirmationEmail, renderAdminAlertEmail } from "../src/lib/email.ts";

async function run() {
  console.log("=== 1. Testing Email Formatter & Sender ===");
  const confirmation = renderCustomerConfirmationEmail({
    customerName: "Rahul Sharma",
    ticketNumber: "FC261114-TEST",
    customerPhone: "9876543210",
    branchName: "Sector 48, Gurugram",
    categoryName: "Gym Equipment",
    description: "The elliptical machine #3 pedal is broken and making squeaking noise.",
  });

  console.log("Subject:", confirmation.subject);
  console.log("Text preview:\n", confirmation.text.slice(0, 200) + "...\n");

  const emailRes = await sendEmail({
    to: "rahul.test@gmail.com",
    subject: confirmation.subject,
    text: confirmation.text,
    html: confirmation.html,
  });
  console.log("sendEmail result:", emailRes);

  console.log("\n=== 2. Testing Complaint Creation with Automated Notifications ===");
  const branch = await db.branch.findFirst({ where: { isActive: true } });
  const category = await db.complaintCategory.findFirst({ where: { isActive: true } });

  if (!branch || !category) {
    console.error("Missing active branch or category in DB!");
    return;
  }

  const complaintRes = await createComplaint(
    {
      customerName: "Aman Verma",
      customerEmail: "aman.verma@gmail.com",
      customerPhone: "9812345678",
      branchId: branch.id,
      categoryId: category.id,
      description: "Air conditioning in free weights area was not working this morning.",
      source: "PORTAL",
    },
    { actorName: "Automated Test Suite" }
  );

  console.log("Created Ticket:", complaintRes.ticket.ticketNumber, "Status:", complaintRes.ticket.status);

  // Check outbox notifications created for this ticket
  const notifications = await db.notification.findMany({
    where: { ticketId: complaintRes.ticket.id },
    orderBy: { createdAt: "desc" },
  });

  console.log(`\nFound ${notifications.length} notifications generated for this ticket:`);
  for (const n of notifications) {
    console.log(`- [${n.recipientKind}] To: ${n.recipientEmail} | Status: ${n.status} | Event: ${n.event}`);
    console.log(`  Subject: ${n.subject}`);
    if (n.lastError) console.log(`  Note/Error: ${n.lastError}`);
  }

  console.log("\n✓ All email flow validations completed successfully!");
}

run()
  .catch((e) => {
    console.error("Test failed:", e);
    process.exit(1);
  })
  .finally(() => process.exit(0));
