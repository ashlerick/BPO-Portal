-- AlterTable
ALTER TABLE "inventory_items" ADD COLUMN "condition" TEXT,
ADD COLUMN "conditionCheckedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "inventory_checks" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "condition" TEXT NOT NULL,
    "note" TEXT,
    "checkedBy" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_checks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inventory_checks_itemId_month_key" ON "inventory_checks"("itemId", "month");

-- AddForeignKey
ALTER TABLE "inventory_checks" ADD CONSTRAINT "inventory_checks_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
