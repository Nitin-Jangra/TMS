// Public branch list — only active branches are selectable in the complaint form.

import { db } from "@/lib/db";
import { handleErrors, ok } from "@/lib/api-response";

export async function GET() {
  return handleErrors(async () => {
    const branches = await db.branch.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true, city: true, address: true },
    });
    return ok({ branches });
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, x-requested-with",
    },
  });
}
