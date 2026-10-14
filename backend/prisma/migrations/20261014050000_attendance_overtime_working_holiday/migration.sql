-- AlterTable
ALTER TABLE "attendance_records" ADD COLUMN "overtimeHours" DECIMAL(4,2),
ADD COLUMN "workingHoliday" BOOLEAN NOT NULL DEFAULT false;
