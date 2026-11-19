-- FitClass CMS — service-desk features (departments & routing, canned replies,
-- saved views, escalation ladder, member feedback).
-- Additive only: new tables + new nullable/defaulted columns. Existing data is
-- untouched. Safe to run once on the live database:
--   npx wrangler d1 execute fitclass --remote --file=cloudflare/d1/0005_service_features.sql

CREATE TABLE IF NOT EXISTS "Department" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "Department_name_key" ON "Department"("name");

CREATE TABLE IF NOT EXISTS "TicketFeedback" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticketId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TicketFeedback_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "TicketFeedback_ticketId_key" ON "TicketFeedback"("ticketId");

CREATE TABLE IF NOT EXISTS "CannedResponse" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "categoryId" TEXT,
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "ownerId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CannedResponse_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "StaffUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "CannedResponse_ownerId_idx" ON "CannedResponse"("ownerId");

CREATE TABLE IF NOT EXISTS "SavedView" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SavedView_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "StaffUser" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "SavedView_ownerId_idx" ON "SavedView"("ownerId");

-- New columns (SQLite ADD COLUMN; no table rebuild).
ALTER TABLE "StaffUser" ADD COLUMN "departmentId" TEXT REFERENCES "Department" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ComplaintCategory" ADD COLUMN "departmentId" TEXT REFERENCES "Department" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Ticket" ADD COLUMN "departmentId" TEXT REFERENCES "Department" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Ticket" ADD COLUMN "slaAlertLevel" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS "Ticket_departmentId_idx" ON "Ticket"("departmentId");

-- Default departments (rename / add / switch off in Root Admin → Settings → Departments).
INSERT OR IGNORE INTO "Department" ("id", "name", "description", "email", "isActive", "sortOrder", "createdAt", "updatedAt") VALUES
  ('fc-dept-frontdesk',   'Front Desk & Membership',  'Membership, renewals, freezes, lockers, guest passes', '', 1, 0, strftime('%Y-%m-%dT%H:%M:%f+00:00','now'), strftime('%Y-%m-%dT%H:%M:%f+00:00','now')),
  ('fc-dept-accounts',    'Accounts & Billing',       'Payments, refunds, invoices, EMI',                       '', 1, 1, strftime('%Y-%m-%dT%H:%M:%f+00:00','now'), strftime('%Y-%m-%dT%H:%M:%f+00:00','now')),
  ('fc-dept-maintenance', 'Maintenance & Facilities', 'Equipment, AC, showers, electrical, repairs',            '', 1, 2, strftime('%Y-%m-%dT%H:%M:%f+00:00','now'), strftime('%Y-%m-%dT%H:%M:%f+00:00','now')),
  ('fc-dept-fitness',     'Fitness & Trainers',       'Trainers, PT sessions, group classes, diet plans',       '', 1, 3, strftime('%Y-%m-%dT%H:%M:%f+00:00','now'), strftime('%Y-%m-%dT%H:%M:%f+00:00','now')),
  ('fc-dept-housekeeping','Housekeeping',             'Cleanliness, washrooms, changing rooms',                 '', 1, 4, strftime('%Y-%m-%dT%H:%M:%f+00:00','now'), strftime('%Y-%m-%dT%H:%M:%f+00:00','now')),
  ('fc-dept-management',  'Management',               'Staff behaviour, serious complaints, escalations',       '', 1, 5, strftime('%Y-%m-%dT%H:%M:%f+00:00','now'), strftime('%Y-%m-%dT%H:%M:%f+00:00','now'));

-- Default routing rules: category → department (only where not set yet).
UPDATE "ComplaintCategory" SET "departmentId" = 'fc-dept-maintenance'  WHERE "departmentId" IS NULL AND "name" IN ('Equipment Issues', 'Facility Maintenance');
UPDATE "ComplaintCategory" SET "departmentId" = 'fc-dept-frontdesk'    WHERE "departmentId" IS NULL AND "name" IN ('Membership Issues', 'Locker Issues');
UPDATE "ComplaintCategory" SET "departmentId" = 'fc-dept-accounts'     WHERE "departmentId" IS NULL AND "name" IN ('Billing and Payments');
UPDATE "ComplaintCategory" SET "departmentId" = 'fc-dept-fitness'      WHERE "departmentId" IS NULL AND "name" IN ('Trainer Complaints');
UPDATE "ComplaintCategory" SET "departmentId" = 'fc-dept-housekeeping' WHERE "departmentId" IS NULL AND "name" IN ('Cleanliness');
UPDATE "ComplaintCategory" SET "departmentId" = 'fc-dept-management'   WHERE "departmentId" IS NULL AND "name" IN ('Staff Behaviour');

-- Existing open tickets inherit their category's department.
UPDATE "Ticket" SET "departmentId" = (SELECT c."departmentId" FROM "ComplaintCategory" c WHERE c."id" = "Ticket"."categoryId")
  WHERE "departmentId" IS NULL;

-- Starter reply templates (shared with every agent).
INSERT OR IGNORE INTO "CannedResponse" ("id", "title", "body", "categoryId", "isShared", "ownerId", "createdAt", "updatedAt") VALUES
  ('fc-canned-ack', 'Acknowledge — looking into it', 'Hi {{customerName}}, thank you for letting us know. We are looking into your complaint ({{ticketNumber}}) at FitClass {{branchName}} and will update you shortly. — {{agentName}}', NULL, 1, NULL, strftime('%Y-%m-%dT%H:%M:%f+00:00','now'), strftime('%Y-%m-%dT%H:%M:%f+00:00','now')),
  ('fc-canned-equipment', 'Equipment under repair', 'Hi {{customerName}}, the equipment you reported at FitClass {{branchName}} has been marked out of order and our maintenance team is repairing it. We expect it back in service within 48 hours. Sorry for the inconvenience. — {{agentName}}', NULL, 1, NULL, strftime('%Y-%m-%dT%H:%M:%f+00:00','now'), strftime('%Y-%m-%dT%H:%M:%f+00:00','now')),
  ('fc-canned-refund', 'Refund initiated', 'Hi {{customerName}}, your refund for ticket {{ticketNumber}} has been initiated. It usually reaches your account within 5–7 working days. — {{agentName}}, FitClass Accounts', NULL, 1, NULL, strftime('%Y-%m-%dT%H:%M:%f+00:00','now'), strftime('%Y-%m-%dT%H:%M:%f+00:00','now')),
  ('fc-canned-cleaning', 'Cleaning done', 'Hi {{customerName}}, thank you for flagging this. The area has been cleaned and our housekeeping schedule at FitClass {{branchName}} has been tightened. — {{agentName}}', NULL, 1, NULL, strftime('%Y-%m-%dT%H:%M:%f+00:00','now'), strftime('%Y-%m-%dT%H:%M:%f+00:00','now')),
  ('fc-canned-moreinfo', 'Need more details', 'Hi {{customerName}}, to resolve ticket {{ticketNumber}} quickly, could you share a few more details (date, time and anything else you noticed)? You can simply reply to this message. — {{agentName}}', NULL, 1, NULL, strftime('%Y-%m-%dT%H:%M:%f+00:00','now'), strftime('%Y-%m-%dT%H:%M:%f+00:00','now'));
