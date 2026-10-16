-- CreateTable
CREATE TABLE "announcement_reactions" (
    "id" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "announcement_reactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcement_acks" (
    "id" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ackedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "announcement_acks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "announcement_reactions_userId_idx" ON "announcement_reactions"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "announcement_reactions_announcementId_userId_key" ON "announcement_reactions"("announcementId", "userId");

-- CreateIndex
CREATE INDEX "announcement_acks_userId_idx" ON "announcement_acks"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "announcement_acks_announcementId_userId_key" ON "announcement_acks"("announcementId", "userId");

-- AddForeignKey
ALTER TABLE "announcement_reactions" ADD CONSTRAINT "announcement_reactions_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_reactions" ADD CONSTRAINT "announcement_reactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_acks" ADD CONSTRAINT "announcement_acks_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_acks" ADD CONSTRAINT "announcement_acks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
