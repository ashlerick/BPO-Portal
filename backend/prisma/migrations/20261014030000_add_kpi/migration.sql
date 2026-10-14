-- CreateTable
CREATE TABLE "kpi_criteria" (
    "id" TEXT NOT NULL,
    "coreValue" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kpi_criteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi_scores" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "criterionId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "scoredBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kpi_scores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "kpi_scores_employeeId_year_idx" ON "kpi_scores"("employeeId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "kpi_scores_employeeId_criterionId_year_month_key" ON "kpi_scores"("employeeId", "criterionId", "year", "month");

-- AddForeignKey
ALTER TABLE "kpi_scores" ADD CONSTRAINT "kpi_scores_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_scores" ADD CONSTRAINT "kpi_scores_criterionId_fkey" FOREIGN KEY ("criterionId") REFERENCES "kpi_criteria"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Starting criteria from the spreadsheet's KPI Metrics (HR can edit these in the portal).
INSERT INTO "kpi_criteria" ("id", "coreValue", "name", "weight", "sortOrder", "active") VALUES
  (gen_random_uuid()::text, 'Professionalism', 'Task Accuracy & Timeliness', 1, 1, true),
  (gen_random_uuid()::text, 'Professionalism', 'Client Satisfaction', 1, 2, true),
  (gen_random_uuid()::text, 'Honesty & Integrity', 'Ethical Compliance', 1, 3, true),
  (gen_random_uuid()::text, 'Honesty & Integrity', 'Issue Reporting Responsiveness', 1, 4, true),
  (gen_random_uuid()::text, 'Honesty & Integrity', 'Trust & Transparency', 1, 5, true),
  (gen_random_uuid()::text, 'Innovation', 'Process Improvement Adoption', 1, 6, true),
  (gen_random_uuid()::text, 'Innovation', 'Efficiency Gains', 1, 7, true),
  (gen_random_uuid()::text, 'Innovation', 'Idea Implementation Rate', 1, 8, true),
  (gen_random_uuid()::text, 'Leadership in Service', 'Project Delivery & Ownership', 1, 9, true),
  (gen_random_uuid()::text, 'Leadership in Service', 'Leadership Effectiveness', 1, 10, true),
  (gen_random_uuid()::text, 'Leadership in Service', 'Employee Mentorship & Development', 1, 11, true),
  (gen_random_uuid()::text, 'Unity & Collaboration', 'Collaborative Project Success', 1, 12, true),
  (gen_random_uuid()::text, 'Unity & Collaboration', 'Team Engagement & Participation', 1, 13, true),
  (gen_random_uuid()::text, 'Unity & Collaboration', 'Collaboration Initiatives', 1, 14, true),
  (gen_random_uuid()::text, 'Sustainability & Growth', 'Client Retention', 1, 15, true),
  (gen_random_uuid()::text, 'Sustainability & Growth', 'Employee Growth & Development', 1, 16, true),
  (gen_random_uuid()::text, 'Sustainability & Growth', 'Business Growth', 1, 17, true);
