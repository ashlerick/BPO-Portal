-- AlterTable
ALTER TABLE "weekly_reports" ADD COLUMN     "authorId" TEXT,
ADD COLUMN     "schemaKey" TEXT NOT NULL DEFAULT 'generic';
