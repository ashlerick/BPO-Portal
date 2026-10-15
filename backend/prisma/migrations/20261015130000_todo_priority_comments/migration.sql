-- AlterTable
ALTER TABLE "todos" ADD COLUMN "completedBy" TEXT,
ADD COLUMN "priority" TEXT NOT NULL DEFAULT 'normal',
ADD COLUMN "deletedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "todo_comments" (
    "id" TEXT NOT NULL,
    "todoId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "todo_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "todos_createdBy_idx" ON "todos"("createdBy");

-- CreateIndex
CREATE INDEX "todo_comments_todoId_idx" ON "todo_comments"("todoId");

-- AddForeignKey
ALTER TABLE "todo_comments" ADD CONSTRAINT "todo_comments_todoId_fkey" FOREIGN KEY ("todoId") REFERENCES "todos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
