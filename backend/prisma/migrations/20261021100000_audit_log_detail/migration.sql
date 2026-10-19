-- What the entry was about, in words (who it affected, what changed), and an index for looking up a date range.
ALTER TABLE "audit_logs" ADD COLUMN "detail" TEXT;
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");
