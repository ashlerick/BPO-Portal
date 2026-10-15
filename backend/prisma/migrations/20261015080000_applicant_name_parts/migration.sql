-- AlterTable
ALTER TABLE "applicants" ADD COLUMN "firstName" TEXT,
ADD COLUMN "middleName" TEXT,
ADD COLUMN "lastName" TEXT,
ADD COLUMN "birthDate" TIMESTAMP(3),
ADD COLUMN "gender" TEXT;

-- Existing applicants only have a full name: the last word becomes the last
-- name and everything before it the first name (HR can correct them).
UPDATE "applicants"
SET "firstName" = CASE WHEN position(' ' in btrim("name")) > 0
                       THEN regexp_replace(btrim("name"), '\s+\S+$', '')
                       ELSE btrim("name") END,
    "lastName"  = CASE WHEN position(' ' in btrim("name")) > 0
                       THEN substring(btrim("name") from '\S+$')
                       ELSE NULL END
WHERE "firstName" IS NULL;
