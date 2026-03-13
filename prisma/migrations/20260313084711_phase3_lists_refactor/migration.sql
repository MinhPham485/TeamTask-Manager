-- Add board cover image
ALTER TABLE "Group" ADD COLUMN "coverImage" TEXT;

-- Add new task fields in a data-safe way (listId starts nullable for backfill)
ALTER TABLE "Task"
ADD COLUMN "dueDate" TIMESTAMP(3),
ADD COLUMN "listId" TEXT;

-- Create new entities for list-based boards
CREATE TABLE "List" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "groupId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "List_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Label" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Label_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TaskLabel" (
    "taskId" TEXT NOT NULL,
    "labelId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskLabel_pkey" PRIMARY KEY ("taskId", "labelId")
);

CREATE TABLE "ChecklistItem" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "taskId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChecklistItem_pkey" PRIMARY KEY ("id")
);

-- Seed default lists for every existing group
INSERT INTO "List" ("id", "name", "position", "groupId", "createdAt")
SELECT md5(g."id" || '-todo'), 'To do', 0, g."id", CURRENT_TIMESTAMP
FROM "Group" g
UNION ALL
SELECT md5(g."id" || '-in-progress'), 'Doing', 1, g."id", CURRENT_TIMESTAMP
FROM "Group" g
UNION ALL
SELECT md5(g."id" || '-done'), 'Done', 2, g."id", CURRENT_TIMESTAMP
FROM "Group" g;

-- Map tasks from old status enum to new listId
UPDATE "Task" t
SET "listId" = CASE t."status"
    WHEN 'TODO' THEN md5(t."groupId" || '-todo')
    WHEN 'IN_PROGRESS' THEN md5(t."groupId" || '-in-progress')
    WHEN 'DONE' THEN md5(t."groupId" || '-done')
    ELSE md5(t."groupId" || '-todo')
END;

-- Enforce new required relation after backfill
ALTER TABLE "Task"
ALTER COLUMN "listId" SET NOT NULL;

-- Remove old status-based column and enum
ALTER TABLE "Task" DROP COLUMN "status";
DROP TYPE "TaskStatus";

-- Indexes
CREATE INDEX "List_groupId_position_idx" ON "List"("groupId", "position");
CREATE INDEX "Label_groupId_idx" ON "Label"("groupId");
CREATE INDEX "TaskLabel_labelId_idx" ON "TaskLabel"("labelId");
CREATE INDEX "ChecklistItem_taskId_position_idx" ON "ChecklistItem"("taskId", "position");
CREATE INDEX "Task_listId_position_idx" ON "Task"("listId", "position");

-- Foreign keys
ALTER TABLE "Task" ADD CONSTRAINT "Task_listId_fkey" FOREIGN KEY ("listId") REFERENCES "List"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "List" ADD CONSTRAINT "List_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Label" ADD CONSTRAINT "Label_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaskLabel" ADD CONSTRAINT "TaskLabel_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskLabel" ADD CONSTRAINT "TaskLabel_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "Label"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChecklistItem" ADD CONSTRAINT "ChecklistItem_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
