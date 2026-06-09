CREATE TABLE "ChecklistSection" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "taskId" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChecklistSection_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ChecklistSection_taskId_position_idx" ON "ChecklistSection"("taskId", "position");

ALTER TABLE "ChecklistSection" ADD CONSTRAINT "ChecklistSection_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChecklistItem" ADD COLUMN "sectionId" TEXT;
ALTER TABLE "ChecklistItem" ADD COLUMN "createdBy" TEXT;
ALTER TABLE "ChecklistItem" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

INSERT INTO "ChecklistSection" ("id", "title", "position", "taskId", "createdAt", "updatedAt")
SELECT 'legacy-section-' || "Task"."id", 'General', 0, "Task"."id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Task"
WHERE EXISTS (
    SELECT 1
    FROM "ChecklistItem"
    WHERE "ChecklistItem"."taskId" = "Task"."id"
);

UPDATE "ChecklistItem"
SET "sectionId" = 'legacy-section-' || "taskId"
WHERE "sectionId" IS NULL;

ALTER TABLE "ChecklistItem" ALTER COLUMN "sectionId" SET NOT NULL;

CREATE INDEX "ChecklistItem_sectionId_position_idx" ON "ChecklistItem"("sectionId", "position");

ALTER TABLE "ChecklistItem" ADD CONSTRAINT "ChecklistItem_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "ChecklistSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
