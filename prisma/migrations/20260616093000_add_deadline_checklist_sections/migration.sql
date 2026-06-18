CREATE TABLE "DeadlineChecklistSection" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "deadlineTaskId" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeadlineChecklistSection_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DeadlineChecklistSection_deadlineTaskId_position_idx" ON "DeadlineChecklistSection"("deadlineTaskId", "position");

ALTER TABLE "DeadlineChecklistSection"
ADD CONSTRAINT "DeadlineChecklistSection_deadlineTaskId_fkey"
FOREIGN KEY ("deadlineTaskId") REFERENCES "DeadlineTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DeadlineChecklistItem" ADD COLUMN "sectionId" TEXT;

INSERT INTO "DeadlineChecklistSection" ("id", "title", "position", "deadlineTaskId", "createdAt", "updatedAt")
SELECT
    gen_random_uuid()::text,
    'General',
    0,
    dci."deadlineTaskId",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM (
    SELECT DISTINCT "deadlineTaskId"
    FROM "DeadlineChecklistItem"
) AS dci;

UPDATE "DeadlineChecklistItem" AS dci
SET "sectionId" = dcs."id"
FROM "DeadlineChecklistSection" AS dcs
WHERE dci."deadlineTaskId" = dcs."deadlineTaskId"
  AND dcs."position" = 0
  AND dcs."title" = 'General'
  AND dci."sectionId" IS NULL;

ALTER TABLE "DeadlineChecklistItem"
ALTER COLUMN "sectionId" SET NOT NULL;

CREATE INDEX "DeadlineChecklistItem_sectionId_position_idx" ON "DeadlineChecklistItem"("sectionId", "position");

ALTER TABLE "DeadlineChecklistItem"
ADD CONSTRAINT "DeadlineChecklistItem_sectionId_fkey"
FOREIGN KEY ("sectionId") REFERENCES "DeadlineChecklistSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
