// Integration API: move a ticket to another branch (write scope). The ticket is
// re-queued into the new branch's round-robin.
// Body: { "branch": "<id | code | LMS external id | name>" }

import { fail, handleErrors, ok } from "@/lib/api-response";
import { assertScope, requireApiKey } from "@/lib/auth";
import { AssignmentError, transferTicketBranch } from "@/lib/assignment";
import { apiActor, findTicketByNumber, pick, readBody, resolveBranch } from "@/lib/integration";

export async function POST(request: Request, { params }: { params: Promise<{ ticketNumber: string }> }) {
  return handleErrors(async () => {
    const client = await requireApiKey(request);
    assertScope(client, "write");
    const { ticketNumber } = await params;
    const body = await readBody(request);
    const branchRef = pick(body, "branch", "branchId", "branchCode", "branchExternalId", "branchName");
    if (!branchRef) return fail("VALIDATION_ERROR", "branch is required (id, code, external id or name).", 422);

    const ticket = await findTicketByNumber(ticketNumber);
    if (!ticket) return fail("NOT_FOUND", "Ticket not found.", 404);
    const branch = await resolveBranch(branchRef);
    if (!branch) return fail("BRANCH_NOT_FOUND", `No active branch matches "${branchRef}".`, 422);

    try {
      await transferTicketBranch(ticket.id, branch.id, apiActor(client, pick(body, "actorName")));
      return ok({ ticketNumber: ticket.ticketNumber, transferred: true, branch: { id: branch.id, code: branch.code, name: branch.name } });
    } catch (err) {
      if (err instanceof AssignmentError) return fail("TRANSFER_ERROR", err.message, 422);
      throw err;
    }
  });
}
