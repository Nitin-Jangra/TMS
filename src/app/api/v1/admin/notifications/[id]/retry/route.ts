// Retry a failed/skipped notification (used after configuring a blank email).

import { fail, handleErrors, ok } from "@/lib/api-response";
import { requireRole } from "@/lib/auth";
import { retryNotification } from "@/lib/notifications";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleErrors(async () => {
    await requireRole(["ROOT_ADMIN", "CENTRAL_ADMIN"]);
    const { id } = await params;
    await retryNotification(id);
    return ok({ retried: true });
  });
}
