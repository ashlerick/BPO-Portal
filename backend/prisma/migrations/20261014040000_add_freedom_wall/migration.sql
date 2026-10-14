-- CreateTable
CREATE TABLE "freedom_posts" (
    "id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "freedom_posts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "freedom_posts_createdAt_idx" ON "freedom_posts"("createdAt");
