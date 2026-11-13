// API client management for CRM/LMS integration keys.

import { handleErrors, ok } from "@/lib/api-response";
import { requireRole, generateApiKey } from "@/lib/auth";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";

export async function GET() {
  return handleErrors(async () => {
    await requireRole(["ROOT_ADMIN"]);
    const clients = await db.apiClient.findMany({ orderBy: { createdAt: "desc" } });
    return ok({ clients });
  });
}

export async function POST(request: Request) {
  return handleErrors(async () => {
    const user = await requireRole(["ROOT_ADMIN"]);
    const body = await request.json().catch(() => null);
    const name = String((body as { name?: string })?.name || "").trim() || "Integration client";
    const scopes = String((body as { scopes?: string })?.scopes || "read,write") === "read" ? "read" : "read,write";

    const { key, prefix, hash } = generateApiKey();
    const client = await db.apiClient.create({
      data: { name, keyPrefix: prefix, apiKey: key, apiKeyHash: hash, scopes },
    });
    await logAudit({ actor: user, action: "API_KEY_CREATED", newValue: name, details: `scopes=${scopes}` });
    return ok({ client }, { status: 201 });
  });
}
