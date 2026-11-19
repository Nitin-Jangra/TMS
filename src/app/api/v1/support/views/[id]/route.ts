// Delete a saved view (owner only).

import { fail, handleErrors, ok } from "@/lib/api-response";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleErrors(async () => {
    const { id } = await params;
    const user = await requireUser();
    const view = await db.savedView.findUnique({ where: { id } });
    if (!view) return fail("NOT_FOUND", "View not found.", 404);
    if (view.ownerId !== user.id) return fail("FORBIDDEN", "You can only delete your own views.", 403);
    await db.savedView.delete({ where: { id } });
    return ok({ deleted: true });
  });
}
