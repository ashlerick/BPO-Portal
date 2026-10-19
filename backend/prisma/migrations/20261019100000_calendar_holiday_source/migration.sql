-- Holidays imported from a free national list (source 'nager') can be switched off by HR without deleting them, so the
-- yearly import does not bring them back. externalKey makes the import safe to run twice.
ALTER TABLE "calendar_events" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'hr';
ALTER TABLE "calendar_events" ADD COLUMN "externalKey" TEXT;
ALTER TABLE "calendar_events" ADD COLUMN "disabled" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX "calendar_events_externalKey_key" ON "calendar_events"("externalKey");
