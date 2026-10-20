-- Overtime HR gives a person for a shift day (minutes); it counts as given.
-- CreateTable
CREATE TABLE "overtime_allotments" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "minutes" INTEGER NOT NULL,
    "note" TEXT,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "overtime_allotments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "overtime_allotments_employeeId_date_idx" ON "overtime_allotments"("employeeId", "date");

-- CreateIndex
CREATE INDEX "overtime_allotments_date_idx" ON "overtime_allotments"("date");

-- AddForeignKey
ALTER TABLE "overtime_allotments" ADD CONSTRAINT "overtime_allotments_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
