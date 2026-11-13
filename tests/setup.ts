// Test setup: point Prisma at the development database before any imports.
process.env.DATABASE_URL ??= "file:/home/z/my-project/db/custom.db";
process.env.SESSION_SECRET ??= "test-secret";
