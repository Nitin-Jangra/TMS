import { POST } from "../src/app/api/v1/inbound/email/route.ts";
import { db } from "../src/lib/db.ts";

async function run() {
  console.log("=== Testing Inbound Email Webhook ===");

  const fakeIncomingEmail = {
    from: "Pooja Verma <pooja.v@gmail.com>",
    to: "nitin98175@gmail.com",
    subject: "Treadmill issue in Sector 48 gym",
    body: "Hi team, I am a member at Sector 48 branch. The belt on treadmill #2 was slipping today during my run. Please check it. My phone is 9876543210.",
  };

  const req = new Request("http://localhost:3000/api/v1/inbound/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fakeIncomingEmail),
  });

  const response = await POST(req);
  const data = await response.json();

  console.log("Response status:", response.status);
  console.log("Response body:", data);

  if (!data.success) {
    throw new Error("Failed to process inbound email: " + JSON.stringify(data));
  }

  // Verify the created ticket in DB
  const ticket = await db.ticket.findUnique({
    where: { ticketNumber: data.ticketNumber },
    include: { branch: true, category: true },
  });

  console.log("\nVerified Ticket in DB:");
  console.log("- Ticket #:", ticket.ticketNumber);
  console.log("- Customer:", ticket.customerName, `(${ticket.customerEmail} | ${ticket.customerPhone})`);
  console.log("- Detected Branch:", ticket.branch.name);
  console.log("- Detected Category:", ticket.category.name);
  console.log("- Source:", ticket.source);

  // Check generated notifications
  const notifications = await db.notification.findMany({
    where: { ticketId: ticket.id },
  });

  console.log(`\nGenerated ${notifications.length} notifications:`);
  for (const n of notifications) {
    console.log(`- [${n.recipientKind}] To: ${n.recipientEmail} | Status: ${n.status}`);
    console.log(`  Subject: ${n.subject}`);
  }

  console.log("\n✓ Inbound email-to-ticket conversion passed with 100% success!");
}

run()
  .catch((e) => {
    console.error("Test failed:", e);
    process.exit(1);
  })
  .finally(() => process.exit(0));
