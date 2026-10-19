-- Two applicants that HR said are NOT the same person, so the "possible duplicate" flag stops showing for that pair.
-- CreateTable
CREATE TABLE "applicant_not_same" (
    "id" TEXT NOT NULL,
    "applicantAId" TEXT NOT NULL,
    "applicantBId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "applicant_not_same_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "applicant_not_same_applicantAId_applicantBId_key" ON "applicant_not_same"("applicantAId", "applicantBId");
