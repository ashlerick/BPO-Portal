-- An announcement can ask people to DO something by a date: each person then gets a to-do tied to it.
ALTER TABLE "announcements" ADD COLUMN "needsAction" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "announcements" ADD COLUMN "actionDueAt" TIMESTAMP(3);
ALTER TABLE "todos" ADD COLUMN "announcementId" TEXT;
CREATE INDEX "todos_announcementId_idx" ON "todos"("announcementId");
