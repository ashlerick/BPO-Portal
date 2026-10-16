-- AlterTable
ALTER TABLE "shifts" ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'Asia/Manila',
ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false;

-- The standard shift: 5:00 AM to 1:30 PM California time, Monday to Friday, 50 minutes of breaks, 10 minutes of grace.
-- That is 8:00 PM to 4:30 AM in the Philippines now, and 9:00 PM to 5:30 AM after California returns to standard time.
INSERT INTO "shifts" ("id", "name", "startTime", "endTime", "workDays", "breakMinutes", "graceMinutes", "timezone", "isDefault", "active", "createdAt")
VALUES ('5a1d6c42-0b8e-4c1f-9a53-7d2e0f4b1c10', 'Standard shift (California time)', '05:00', '13:30', ARRAY[1,2,3,4,5], 50, 10, 'America/Los_Angeles', true, true, CURRENT_TIMESTAMP);

-- Everyone who has no shift yet starts on it from Oct 16, 2026. Anyone HR already gave a shift keeps theirs.
INSERT INTO "shift_assignments" ("id", "employeeId", "shiftId", "effectiveFrom", "assignedBy", "createdAt")
SELECT gen_random_uuid()::text, e."id", '5a1d6c42-0b8e-4c1f-9a53-7d2e0f4b1c10', TIMESTAMP '2026-10-16 00:00:00', 'system', CURRENT_TIMESTAMP
FROM "employees" e
WHERE e."status" = 'active'
  AND NOT EXISTS (SELECT 1 FROM "shift_assignments" sa WHERE sa."employeeId" = e."id");
