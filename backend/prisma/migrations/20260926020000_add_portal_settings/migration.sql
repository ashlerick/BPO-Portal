-- CreateTable
CREATE TABLE "portal_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portal_settings_pkey" PRIMARY KEY ("key")
);
