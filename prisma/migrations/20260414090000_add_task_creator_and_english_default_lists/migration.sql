-- Add task creator linkage
ALTER TABLE "Task"
ADD COLUMN "createdBy" TEXT;

ALTER TABLE "Task"
ADD CONSTRAINT "Task_createdBy_fkey"
FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Task_createdBy_idx" ON "Task"("createdBy");

-- Rename old default list names to English for existing data
UPDATE "List" SET "name" = 'To Do' WHERE "name" = 'Can lam';
UPDATE "List" SET "name" = 'In Progress' WHERE "name" = 'Dang lam';
UPDATE "List" SET "name" = 'Done' WHERE "name" = 'Da xong';
