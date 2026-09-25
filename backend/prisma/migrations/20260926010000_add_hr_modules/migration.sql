-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "employeeCode" TEXT,
ADD COLUMN     "governmentRequirements" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "probationEndDate" TIMESTAMP(3),
ADD COLUMN     "regularizationDate" TIMESTAMP(3),
ADD COLUMN     "salary" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "benefits" ADD COLUMN     "provider" TEXT,
ADD COLUMN     "providerContact" TEXT;

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "employeeId" TEXT;

-- CreateTable
CREATE TABLE "dependents" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "birthDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dependents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employment_history" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "department" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employment_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hr_requests" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "details" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "resolution" TEXT,
    "handledBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hr_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "benefit_enrollments" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "benefitId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "effectiveDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "dependentIds" TEXT[],
    "notes" TEXT,
    "history" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "benefit_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklists" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "separationType" TEXT,
    "effectiveDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checklists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_tasks" (
    "id" TEXT NOT NULL,
    "checklistId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "doneAt" TIMESTAMP(3),
    "doneBy" TEXT,
    "note" TEXT,

    CONSTRAINT "checklist_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_openings" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "department" TEXT,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "job_openings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "applicants" (
    "id" TEXT NOT NULL,
    "jobOpeningId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "information" TEXT,
    "status" TEXT NOT NULL DEFAULT 'applied',
    "decisionNote" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "applicants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interviews" (
    "id" TEXT NOT NULL,
    "applicantId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "interviewer" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance_reviews" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'self_assessment',
    "selfAssessment" TEXT,
    "supervisorEvaluation" TEXT,
    "supervisorRating" INTEGER,
    "hrReview" TEXT,
    "finalRating" INTEGER,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "performance_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance_notes" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "details" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "dueDate" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "performance_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disciplinary_cases" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "incidentDate" TIMESTAMP(3) NOT NULL,
    "incidentReport" TEXT NOT NULL,
    "employeeExplanation" TEXT,
    "warningLevel" TEXT NOT NULL DEFAULT 'none',
    "correctiveAction" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "documents" JSONB NOT NULL DEFAULT '[]',
    "history" JSONB NOT NULL DEFAULT '[]',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "disciplinary_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_changes" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "previousSalary" DECIMAL(12,2),
    "newSalary" DECIMAL(12,2) NOT NULL,
    "reason" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "salary_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pay_items" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "recurring" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pay_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payslips" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "gross" DECIMAL(12,2) NOT NULL,
    "deductions" DECIMAL(12,2) NOT NULL,
    "net" DECIMAL(12,2) NOT NULL,
    "fileKey" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payslips_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dependents_employeeId_idx" ON "dependents"("employeeId");

-- CreateIndex
CREATE INDEX "employment_history_employeeId_idx" ON "employment_history"("employeeId");

-- CreateIndex
CREATE INDEX "hr_requests_employeeId_idx" ON "hr_requests"("employeeId");

-- CreateIndex
CREATE INDEX "hr_requests_status_idx" ON "hr_requests"("status");

-- CreateIndex
CREATE UNIQUE INDEX "benefit_enrollments_employeeId_benefitId_key" ON "benefit_enrollments"("employeeId", "benefitId");

-- CreateIndex
CREATE INDEX "checklists_employeeId_kind_idx" ON "checklists"("employeeId", "kind");

-- CreateIndex
CREATE INDEX "checklist_tasks_checklistId_idx" ON "checklist_tasks"("checklistId");

-- CreateIndex
CREATE INDEX "applicants_jobOpeningId_idx" ON "applicants"("jobOpeningId");

-- CreateIndex
CREATE INDEX "interviews_applicantId_idx" ON "interviews"("applicantId");

-- CreateIndex
CREATE INDEX "performance_reviews_employeeId_idx" ON "performance_reviews"("employeeId");

-- CreateIndex
CREATE INDEX "performance_notes_employeeId_idx" ON "performance_notes"("employeeId");

-- CreateIndex
CREATE INDEX "disciplinary_cases_employeeId_idx" ON "disciplinary_cases"("employeeId");

-- CreateIndex
CREATE INDEX "salary_changes_employeeId_idx" ON "salary_changes"("employeeId");

-- CreateIndex
CREATE INDEX "pay_items_employeeId_idx" ON "pay_items"("employeeId");

-- CreateIndex
CREATE INDEX "payslips_employeeId_idx" ON "payslips"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "employees_employeeCode_key" ON "employees"("employeeCode");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dependents" ADD CONSTRAINT "dependents_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employment_history" ADD CONSTRAINT "employment_history_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hr_requests" ADD CONSTRAINT "hr_requests_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "benefit_enrollments" ADD CONSTRAINT "benefit_enrollments_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "benefit_enrollments" ADD CONSTRAINT "benefit_enrollments_benefitId_fkey" FOREIGN KEY ("benefitId") REFERENCES "benefits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklists" ADD CONSTRAINT "checklists_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_tasks" ADD CONSTRAINT "checklist_tasks_checklistId_fkey" FOREIGN KEY ("checklistId") REFERENCES "checklists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applicants" ADD CONSTRAINT "applicants_jobOpeningId_fkey" FOREIGN KEY ("jobOpeningId") REFERENCES "job_openings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "applicants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_reviews" ADD CONSTRAINT "performance_reviews_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_notes" ADD CONSTRAINT "performance_notes_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disciplinary_cases" ADD CONSTRAINT "disciplinary_cases_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_changes" ADD CONSTRAINT "salary_changes_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pay_items" ADD CONSTRAINT "pay_items_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
