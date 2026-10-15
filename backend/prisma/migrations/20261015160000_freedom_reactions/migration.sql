-- CreateTable
CREATE TABLE "freedom_reactions" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "reactorKey" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "freedom_reactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "freedom_reactions_postId_reactorKey_key" ON "freedom_reactions"("postId", "reactorKey");

-- AddForeignKey
ALTER TABLE "freedom_reactions" ADD CONSTRAINT "freedom_reactions_postId_fkey" FOREIGN KEY ("postId") REFERENCES "freedom_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
