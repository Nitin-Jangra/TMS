-- Child-first wipe so 0002_seed_data.sql can be re-applied safely.
-- Usage: wrangler d1 execute fitclass --remote --file=cloudflare/d1/0003_reset_data.sql
--        wrangler d1 execute fitclass --remote --file=cloudflare/d1/0002_seed_data.sql

DELETE FROM "ApiClient";
DELETE FROM "CustomerAccessLog";
DELETE FROM "IdempotencyKey";
DELETE FROM "SlaTracking";
DELETE FROM "SlaPolicy";
DELETE FROM "TicketReopenHistory";
DELETE FROM "TicketClosureJob";
DELETE FROM "BranchCursor";
DELETE FROM "ConfigAudit";
DELETE FROM "SystemSetting";
DELETE FROM "AuditLog";
DELETE FROM "Notification";
DELETE FROM "AttachmentData";
DELETE FROM "TicketAttachment";
DELETE FROM "TicketMessage";
DELETE FROM "TicketAssignment";
DELETE FROM "TicketStatusHistory";
DELETE FROM "Ticket";
DELETE FROM "StaffUser";
DELETE FROM "TicketSequence";
DELETE FROM "ComplaintCategory";
DELETE FROM "Branch";
