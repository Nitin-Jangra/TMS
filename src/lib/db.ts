import { PrismaClient } from "@prisma/client";
import { PrismaD1 } from "@prisma/adapter-d1";
import { getCloudflareContext } from "@opennextjs/cloudflare";

// FC-CMS database client — one import site (`@/lib/db`) for the whole app.
//
// Two runtime modes:
//   1. Node.js (local dev, classic `npm run dev`, vitest): standard Prisma
//      engine over the SQLite file in DATABASE_URL (db/custom.db).
//   2. Cloudflare Workers (opennextjs-cloudflare build/preview/deploy):
//      Prisma driver adapter over the D1 binding named "DB" in wrangler.jsonc.
//      Both environments share the same prisma/schema.prisma (SQLite dialect).
//
// Detection: workerd sets navigator.userAgent === "Cloudflare-Workers".
// During `next build` on a CI machine the context is absent, so the Node
// fallback is used for prerendering — set DATABASE_URL there too (any
// sqlite file URL works; no data is written unless a page prerenders queries).

const onCloudflareWorkers =
  typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  if (onCloudflareWorkers) {
    const env = (getCloudflareContext() as unknown as { env: { DB?: unknown } }).env;
    if (!env?.DB) {
      throw new Error(
        "[fcms] D1 binding not found. Add d1_databases binding \"DB\" to wrangler.jsonc " +
        "and run `wrangler d1 execute fitclass --remote --file=cloudflare/d1/0001_schema.sql`."
      );
    }
    return new PrismaClient({
      adapter: new PrismaD1(env.DB as Parameters<typeof PrismaD1>[0]),
      log: ["warn", "error"],
    });
  }
  return new PrismaClient({ log: ["warn", "error"] });
}

export const db =
  globalForPrisma.prisma ??
  createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

// ---------------------------------------------------------------------------
// Interactive transactions
//
// Cloudflare D1 has no interactive transactions: Prisma's D1 adapter throws
// on `db.$transaction(async (tx) => ...)` (array form `prisma.$transaction([])
// is allowed). Every multi-step write in this app goes through
// runInTransaction(), which:
//   - Node.js  → real atomic transaction (Prisma engine);
//   - D1 (CF)  → runs the same steps sequentially on the regular client.
//
// Caveat on Cloudflare: the steps are NOT atomic and concurrent writers can
// race (e.g. duplicate ticket numbers collide on the unique index and the
// loser gets a 500). Fine for hosted testing; production keeps a real DB.
// ---------------------------------------------------------------------------

type TxClient = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

export const onCloudflare = onCloudflareWorkers;

export async function runInTransaction<T>(fn: (tx: TxClient) => Promise<T>): Promise<T> {
  if (onCloudflareWorkers) {
    return fn(db as unknown as TxClient);
  }
  return db.$transaction(fn);
}
