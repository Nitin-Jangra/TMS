// Integration API: assign / reassign a ticket (write scope).
// Body: { "employee": "<id | email | LMS external id>" } for a specific person
//       (must belong to the ticket's branch), or { "auto": true } to send an
//       unassigned ticket through the branch round-robin queue.

import { fail, handleErrors, ok } from "@/lib/api-response";
import { assertScope, requireApiKey } from "@/lib/auth";
import { AssignmentError, assignTicketRoundRobin, manuallyAssignTicket } from "@/lib/assignment";
import { apiActor, findTicketByNumber, pick, readBody, resolveEmployee } from "@/lib/integration";

export async function POST(request: Request, { params }: { params: Promise<{ ticketNumber: string }> }) {
  return handleErrors(async () => {
    const client = await requireApiKey(request);
    assertScope(client, "write");
    const { ticketNumber } = await params;
    const body = await readBody(request);
    const employeeRef = pick(body, "employee", "employeeId", "employeeEmail", "employeeExternalId");
    const auto = body.auto === true || body.auto === "true";
    if (!employeeRef && !auto) return fail("VALIDATION_ERROR", 'Send "employee" (id, email or external id) or "auto": true.', 422);

    const ticket = await findTicketByNumber(ticketNumber);
    if (!ticket) return fail("NOT_FOUND", "Ticket not found.", 404);
    const actor = apiActor(client, pick(body, "actorName"));

    try {
      if (employeeRef) {
        const employee = await resolveEmployee(employeeRef);
        if (!employee) return fail("EMPLOYEE_NOT_FOUND", `No employee matches "${employeeRef}".`, 422);
        await manuallyAssignTicket(ticket.id, employee.id, actor, pick(body, "note"));
        return ok({ ticketNumber: ticket.ticketNumber, assigned: true, assignee: { id: employee.id, name: employee.name, email: employee.email } });
      }
      const assignee = await assignTicketRoundRobin(ticket.id, actor, "ROUND_ROBIN");
      return ok({
        ticketNumber: ticket.ticketNumber,
        assigned: !!assignee,
        assignee,
        ...(assignee ? {} : { reason: "No available support employee in this branch; the ticket stays in the unassigned queue." }),
      });
    } catch (err) {
      if (err instanceof AssignmentError) return fail("ASSIGNMENT_ERROR", err.message, 422);
      throw err;
    }
  });
}
