-- A highlight can end by itself. NULL with highlighted = true means "until HR removes it" (how every existing highlight behaves).
ALTER TABLE "announcements" ADD COLUMN "highlightUntil" TIMESTAMP(3);
