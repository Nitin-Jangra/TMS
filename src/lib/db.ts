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

// Cloudflare Workers forbid sharing I/O objects (database connections,
// pending promises) between requests: a request that touches something
// created by another request is cancelled with "The Workers runtime canceled
// this request because it detected that your Worker's code had hung", which
// surfaces as "Application error: a server-side exception has occurred".
// So on Workers there is one PrismaClient PER REQUEST, keyed by the request's
// ExecutionContext (also used by work scheduled with ctx.waitUntil after the
// response). In Node.js a single shared client is used as before.
const workerClients = new WeakMap<object, PrismaClient>();

function workerClient(): PrismaClient {
  const context = getCloudflareContext() as unknown as { env: { DB?: unknown }; ctx: object };
  if (!context.env?.DB) {
    throw new Error(
      "[fcms] D1 binding not found. Add d1_databases binding \"DB\" to wrangler.jsonc " +
      "and run `wrangler d1 execute fitclass --remote --file=cloudflare/d1/0001_schema.sql`."
    );
  }
  let client = workerClients.get(context.ctx);
  if (!client) {
    client = new PrismaClient({
      adapter: new PrismaD1(context.env.DB as ConstructorParameters<typeof PrismaD1>[0]),
      log: ["warn", "error"],
    });
    workerClients.set(context.ctx, client);
  }
  return client;
}

function nodeClient(): PrismaClient {
  if (!globalForPrisma.prisma) globalForPrisma.prisma = new PrismaClient({ log: ["warn", "error"] });
  return globalForPrisma.prisma;
}

/**
 * The database client. On Workers every property access resolves to the
 * current request's client, so existing `db.ticket.findMany(...)` code works
 * unchanged.
 */
export const db: PrismaClient = onCloudflareWorkers
  ? new Proxy({} as PrismaClient, {
      get(_target, prop) {
        const client = workerClient();
        const value = Reflect.get(client, prop, client);
        return typeof value === "function" ? value.bind(client) : value;
      },
    })
  : nodeClient();

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
