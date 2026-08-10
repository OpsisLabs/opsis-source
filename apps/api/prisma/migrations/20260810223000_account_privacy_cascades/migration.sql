-- User-linked privacy records must never survive account deletion as
-- de-associated orphans, including under concurrent writes.
BEGIN;

ALTER TABLE "UsageEvent" DROP CONSTRAINT "UsageEvent_userId_fkey";
ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_userId_fkey";

ALTER TABLE "UsageEvent"
  ADD CONSTRAINT "UsageEvent_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AuditLog"
  ADD CONSTRAINT "AuditLog_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
