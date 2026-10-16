-- AlterTable
ALTER TABLE "attendance_records" ADD COLUMN "breaks" JSONB NOT NULL DEFAULT '[]';
