// FC-CMS → Cloudflare D1 export tool.
//
// Produces ready-to-apply SQL files from the local development database:
//   cloudflare/d1/0001_schema.sql     full DDL from prisma/schema.prisma
//   cloudflare/d1/0002_seed_data.sql  INSERTs for every table (parents first)
//   cloudflare/d1/0003_reset_data.sql DELETEs in child-first order (re-seed helper)
//
// Why: Prisma Migrate does not manage D1; the documented workflow is
// `prisma migrate diff` for DDL + wrangler d1 execute for applying SQL.
//
// Test-account passwords are re-hashed with scrypt N=1024 (self-describing
// hash format) so sign-in stays inside the Workers free-plan 10 ms CPU
// budget. Other rows are copied byte-for-byte from the local SQLite file.
//
// Run after seeding locally:
//   bun prisma/seed.ts        (once)
//   bun scripts/d1-export.mjs
//
// Apply:
//   wrangler d1 execute fitclass --remote --file=cloudflare/d1/0001_schema.sql
//   wrangler d1 execute fitclass --remote --file=cloudflare/d1/0002_seed_data.sql

import { Database } from "bun:sqlite";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { scryptSync, randomBytes } from "node:crypto";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "..");
const OUT_DIR = path.join(ROOT, "cloudflare", "d1");

// ---------------------------------------------------------------------------
// Locate the local SQLite database (.env DATABASE_URL)
// ---------------------------------------------------------------------------

function databasePath() {
  const envFile = path.join(ROOT, ".env");
  const env = existsSync(envFile) ? readFileSync(envFile, "utf8") : "";
  const match = /DATABASE_URL\s*=\s*file:(.+)/.exec(env);
  const raw = (match?.[1] || "db/custom.db").trim();
  return path.resolve(ROOT, raw.replace(/["']/g, ""));
}

// ---------------------------------------------------------------------------
// Test-account password re-hashing (Workers free plan: 10 ms CPU / request)
// ---------------------------------------------------------------------------

const TEST_ACCOUNT_PASSWORDS = {
  "admin@fitclass.dev": "Admin@123",
  "central.admin@fitclass.dev": "Central@123",
  "central.agent1@fitclass.dev": "Agent@123",
  "central.agent2@fitclass.dev": "Agent@123",
  "manager.b001@fitclass.dev": "Manager@123",
  "manager.b002@fitclass.dev": "Manager@123",
  "manager.b003@fitclass.dev": "Manager@123",
  "manager.b004@fitclass.dev": "Manager@123",
  "support.b001.a@fitclass.dev": "Support@123",
  "support.b001.b@fitclass.dev": "Support@123",
  "support.b001.c@fitclass.dev": "Support@123",
  "support.b002.a@fitclass.dev": "Support@123",
  "support.b002.b@fitclass.dev": "Support@123",
  "support.b003.a@fitclass.dev": "Support@123",
};

// Free-plan-friendly cost (≈4-6 ms CPU). Same verify code parses the cost
// from the hash itself, so local N=16384 hashes keep working untouched.
const CF_SCRYPT_N = 1024;
const CF_SCRYPT_R = 8;

function cfPasswordHash(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64, { N: CF_SCRYPT_N, r: CF_SCRYPT_R, p: 1 }).toString("hex");
  return `scrypt$${CF_SCRYPT_N}$${CF_SCRYPT_R}:${salt}:${hash}`;
}

// ---------------------------------------------------------------------------
// FK-safe table order (parents before children)
// ---------------------------------------------------------------------------

const INSERT_ORDER = [
  "Branch",
  "ComplaintCategory",
  "TicketSequence",
  "StaffUser",
  "Ticket",
  "TicketStatusHistory",
  "TicketAssignment",
  "TicketMessage",
  "TicketAttachment",
  "AttachmentData",
  "Notification",
  "AuditLog",
  "SystemSetting",
  "ConfigAudit",
  "BranchCursor",
  "TicketClosureJob",
  "TicketReopenHistory",
  "SlaPolicy",
  "SlaTracking",
  "IdempotencyKey",
  "CustomerAccessLog",
  "ApiClient",
];

// ---------------------------------------------------------------------------
// SQL literal helpers
// ---------------------------------------------------------------------------

function sqlValue(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (typeof value === "bigint") return String(value);
  if (value instanceof Uint8Array) {
    // BLOB literal: X'hex'
    return `X'${Buffer.from(value).toString("hex")}'`;
  }
  if (typeof value === "string") return `'${value.replace(/'/g, "''")}'`;
  // Date objects (bun:sqlite does not return these for TEXT columns, but be safe)
  return `'${String(value instanceof Date ? value.toISOString() : value).replace(/'/g, "''")}'`;
}

// ---------------------------------------------------------------------------
// DateTime normalization
//
// The classic Prisma engine stores SQLite DateTime values as INTEGER epoch
// milliseconds, while Prisma's D1 driver adapter stores and reads TEXT
// ISO-8601 ("2026-11-13T11:22:48.734+00:00"). Mixing both in one column makes
// adapter reads fail with "Inconsistent column data". Every DATETIME column
// is therefore normalized to the adapter's TEXT format during export.
// ---------------------------------------------------------------------------

function toAdapterDateTime(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return value;
  return new Date(value).toISOString().replace("Z", "+00:00");
}

function datetimeColumns(sqlite, table) {
  return sqlite
    .query(`SELECT name FROM pragma_table_info('${table}') WHERE upper(type) = 'DATETIME'`)
    .all()
    .map((c) => c.name);
}

// ---------------------------------------------------------------------------
// 1) Schema via prisma migrate diff
// ---------------------------------------------------------------------------

async function exportSchema() {
  const proc = Bun.spawnSync({
    cmd: ["bunx", "prisma", "migrate", "diff", "--from-empty", "--to-schema-datamodel", "prisma/schema.prisma", "--script"],
    cwd: ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });
  if (proc.exitCode !== 0) {
    console.error(new TextDecoder().decode(proc.stderr));
    throw new Error("prisma migrate diff failed");
  }
  const sql = new TextDecoder().decode(proc.stdout);
  writeFileSync(path.join(OUT_DIR, "0001_schema.sql"), sql);
  return sql;
}

// ---------------------------------------------------------------------------
// 2) Data dump
// ---------------------------------------------------------------------------

function exportData(sqlite) {
  const existing = sqlite
    .query("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all()
    .map((r) => r.name);

  // Inserts go parents-first; deletes go child-first (FK-safe both ways).
  const inserts = [];
  const deletes = [...INSERT_ORDER].reverse();
  const summary = [];

  for (const table of INSERT_ORDER) {
    if (!existing.includes(table)) continue;
    const cols = sqlite.query(`PRAGMA table_info('${table}')`).all().map((c) => c.name);
    if (cols.length === 0) continue;
    const rows = sqlite.query(`SELECT * FROM "${table}"`).all();

    if (rows.length === 0) {
      summary.push(`  ${table}: 0 rows`);
      continue;
    }
    const colList = cols.map((c) => `"${c}"`).join(", ");
    const dtCols = new Set(datetimeColumns(sqlite, table));
    let rehashed = 0;
    let normalized = 0;
    for (const row of rows) {
      // Re-hash known test-account passwords for the Workers free plan.
      if (table === "StaffUser" && TEST_ACCOUNT_PASSWORDS[row.email]) {
        row.passwordHash = cfPasswordHash(TEST_ACCOUNT_PASSWORDS[row.email]);
        rehashed += 1;
      }
      // Normalize epoch-ms datetimes to the D1 adapter's TEXT ISO format.
      for (const c of dtCols) {
        if (typeof row[c] === "number") {
          row[c] = toAdapterDateTime(row[c]);
          normalized += 1;
        }
      }
      const values = cols.map((c) => sqlValue(row[c])).join(", ");
      inserts.push(`INSERT INTO "${table}" (${colList}) VALUES (${values});`);
    }
    const extras = [
      rehashed > 0 ? `${rehashed} passwords re-hashed N=${CF_SCRYPT_N}` : null,
      normalized > 0 ? `${normalized} datetimes normalized` : null,
    ].filter(Boolean);
    summary.push(`  ${table}: ${rows.length} rows${extras.length ? ` (${extras.join(", ")})` : ""}`);
  }

  // Tables that exist locally but are not in the known order (safety net).
  for (const table of existing) {
    if (table.startsWith("sqlite_") || table.startsWith("_prisma_") || INSERT_ORDER.includes(table)) continue;
    console.warn(`  [warn] table "${table}" is not in the known insert order — skipped`);
  }

  writeFileSync(
    path.join(OUT_DIR, "0002_seed_data.sql"),
    [
      "-- FC-CMS dummy data dump (generated by scripts/d1-export.mjs).",
      "-- Test-account passwords are re-hashed with scrypt N=1024 for the",
      "-- Workers free-plan 10 ms CPU budget; all other rows are exact copies",
      "-- of the local development database.",
      "",
      "PRAGMA foreign_keys = OFF;",
      "",
      ...inserts,
      "",
      "PRAGMA foreign_keys = ON;",
      "",
    ].join("\n"),
  );

  writeFileSync(
    path.join(OUT_DIR, "0003_reset_data.sql"),
    [
      "-- Child-first wipe so 0002_seed_data.sql can be re-applied safely.",
      "-- Usage: wrangler d1 execute fitclass --remote --file=cloudflare/d1/0003_reset_data.sql",
      "--        wrangler d1 execute fitclass --remote --file=cloudflare/d1/0002_seed_data.sql",
      "",
      ...deletes.map((t) => `DELETE FROM "${t}";`),
      "",
    ].join("\n"),
  );

  return summary;
}

// ---------------------------------------------------------------------------

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const dbPath = databasePath();
  if (!existsSync(dbPath)) {
    console.error(`No local database found at ${dbPath}.`);
    console.error("Run `bunx prisma db push && bun prisma/seed.ts` first, then re-run this script.");
    process.exit(1);
  }

  console.log(`Exporting FC-CMS schema + data for Cloudflare D1`);
  console.log(`  source: ${dbPath}`);
  await exportSchema();
  console.log(`  wrote cloudflare/d1/0001_schema.sql`);

  const sqlite = new Database(dbPath, { readonly: true });
  const summary = exportData(sqlite);
  sqlite.close();
  console.log(`  wrote cloudflare/d1/0002_seed_data.sql`);
  console.log(`  wrote cloudflare/d1/0003_reset_data.sql`);
  console.log(`Row counts:`);
  console.log(summary.join("\n"));

  const rehashed = Object.keys(TEST_ACCOUNT_PASSWORDS).length;
  console.log(
    `Re-hashed ${rehashed} test passwords with scrypt N=${CF_SCRYPT_N} (free-plan CPU budget).`
  );
  console.log(`\nApply remotely:`);
  console.log(`  bunx wrangler d1 execute fitclass --remote --file=cloudflare/d1/0001_schema.sql`);
  console.log(`  bunx wrangler d1 execute fitclass --remote --file=cloudflare/d1/0002_seed_data.sql`);
}

await main();
