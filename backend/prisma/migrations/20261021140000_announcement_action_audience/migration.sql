-- Who a "needs action" announcement is for: chosen teams and people. Empty (null) means everyone.
ALTER TABLE "announcements" ADD COLUMN "actionAudience" JSONB;
