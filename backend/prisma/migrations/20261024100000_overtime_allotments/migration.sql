-- Overtime HR allots to a person for a shift day; the person clocks in for it on the BPO Time panel.
-- CreateEnum
CREATE TYPE "OvertimeStatus" AS ENUM ('not_started', 'running', 'done', 'cancelled');

-- CreateTable
CREATE TABLE "overtime_allotments" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "allottedMinutes" INTEGER NOT NULL,
    "note" TEXT,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "countedMinutes" INTEGER,
    "countedByHr" BOOLEAN NOT NULL DEFAULT false,
    "status" "OvertimeStatus" NOT NULL DEFAULT 'not_started',
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
