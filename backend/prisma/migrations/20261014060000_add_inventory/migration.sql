-- CreateTable
CREATE TABLE "inventory_items" (
    "id" TEXT NOT NULL,
    "assetTag" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "serialNumber" TEXT,
    "status" TEXT NOT NULL DEFAULT 'available',
    "notes" TEXT,
    "assignedToId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_assignments" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedBy" TEXT NOT NULL,
    "returnedAt" TIMESTAMP(3),
    "returnNote" TEXT,

    CONSTRAINT "inventory_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inventory_items_assetTag_key" ON "inventory_items"("assetTag");

-- CreateIndex
CREATE INDEX "inventory_items_assignedToId_idx" ON "inventory_items"("assignedToId");

-- CreateIndex
CREATE INDEX "inventory_assignments_itemId_idx" ON "inventory_assignments"("itemId");

-- CreateIndex
CREATE INDEX "inventory_assignments_employeeId_idx" ON "inventory_assignments"("employeeId");

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_assignments" ADD CONSTRAINT "inventory_assignments_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
