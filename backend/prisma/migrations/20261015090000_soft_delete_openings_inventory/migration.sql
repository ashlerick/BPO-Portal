-- AlterTable
ALTER TABLE "job_openings" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "inventory_items" ADD COLUMN "deletedAt" TIMESTAMP(3);
