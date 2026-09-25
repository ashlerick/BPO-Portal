-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
