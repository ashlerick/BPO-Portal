-- AlterTable
ALTER TABLE "job_openings" ADD COLUMN "bannerKey" TEXT;

-- AlterTable
ALTER TABLE "applicants" ADD COLUMN "hiredUserId" TEXT,
ADD COLUMN "resumeLink" TEXT,
ADD COLUMN "source" TEXT NOT NULL DEFAULT 'internal';
