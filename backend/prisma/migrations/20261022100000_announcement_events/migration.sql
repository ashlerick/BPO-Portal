-- An announcement can be an event (a date, time and place, on the Calendar, with who is joining), and a "needs action" deadline can
-- carry a time of day.
ALTER TABLE "announcements" ADD COLUMN "isEvent" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "announcements" ADD COLUMN "eventDate" TIMESTAMP(3);
ALTER TABLE "announcements" ADD COLUMN "eventTime" TEXT;
ALTER TABLE "announcements" ADD COLUMN "eventZone" TEXT;
ALTER TABLE "announcements" ADD COLUMN "eventPlace" TEXT;
ALTER TABLE "announcements" ADD COLUMN "eventMandatory" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "announcements" ADD COLUMN "calendarEventId" TEXT;
ALTER TABLE "announcements" ADD COLUMN "actionDueTime" TEXT;
ALTER TABLE "announcements" ADD COLUMN "actionDueZone" TEXT;

-- CreateTable
CREATE TABLE "announcement_rsvps" (
    "id" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joining" BOOLEAN NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "announcement_rsvps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "announcement_rsvps_userId_idx" ON "announcement_rsvps"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "announcement_rsvps_announcementId_userId_key" ON "announcement_rsvps"("announcementId", "userId");

-- AddForeignKey
ALTER TABLE "announcement_rsvps" ADD CONSTRAINT "announcement_rsvps_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_rsvps" ADD CONSTRAINT "announcement_rsvps_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
