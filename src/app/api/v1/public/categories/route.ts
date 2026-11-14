// Public complaint category list — only active categories.

import { db } from "@/lib/db";
import { handleErrors, ok } from "@/lib/api-response";

export async function GET() {
  return handleErrors(async () => {
    const categories = await db.complaintCategory.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true },
    });
    return ok({ categories });
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
