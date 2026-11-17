// Generates cloudflare/d1/0004_fitclass_branches.sql from prisma/fitclass-branches.json.
// The SQL is idempotent (upsert by branch code), so it is safe to re-apply.
// Run: node scripts/gen-branch-migration.mjs
import { readFileSync, writeFileSync } from "node:fs";

const branches = JSON.parse(readFileSync("prisma/fitclass-branches.json", "utf8"));
const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
const now = "strftime('%Y-%m-%dT%H:%M:%f+00:00','now')";

const lines = [
  "-- FitClass real branch list (source: fitclass.in branch pages). Idempotent: upserts by code.",
  "-- Usage: wrangler d1 execute fitclass --remote --file=cloudflare/d1/0004_fitclass_branches.sql",
  "",
  ...branches.map(
    (b) =>
      `INSERT INTO "Branch" ("id", "code", "name", "city", "address", "notificationEmail", "isActive", "createdAt", "updatedAt", "crmExternalId") ` +
      `VALUES (${q(`fc-branch-${b.code.toLowerCase()}`)}, ${q(b.code)}, ${q(b.name)}, ${q(b.city)}, ${q(b.address)}, '', 1, ${now}, ${now}, '') ` +
      `ON CONFLICT("code") DO UPDATE SET "name" = excluded."name", "city" = excluded."city", "address" = excluded."address", "isActive" = 1, "updatedAt" = excluded."updatedAt";`,
  ),
  "",
  "-- Retire the two placeholder demo branches (kept, not deleted: old tickets and staff still reference them).",
  `UPDATE "Branch" SET "isActive" = 0, "updatedAt" = ${now} WHERE "code" IN ('BR003', 'BR004') AND "name" IN ('Gurugram Central', 'Sohna Road');`,
  "",
  "-- New tickets are numbered FC-YYYY-NNNNNN again.",
  `UPDATE "SystemSetting" SET "value" = 'FC' WHERE "key" = 'ticket_id_prefix';`,
  "",
];
writeFileSync("cloudflare/d1/0004_fitclass_branches.sql", lines.join("\n"));
console.log(`Wrote ${branches.length} branches.`);
