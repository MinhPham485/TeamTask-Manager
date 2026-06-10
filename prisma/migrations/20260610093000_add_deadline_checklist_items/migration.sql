CREATE TABLE "DeadlineChecklistItem" (
    "id" TEXT NOT NULL,
    "deadlineTaskId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeadlineChecklistItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DeadlineChecklistItem_deadlineTaskId_position_idx" ON "DeadlineChecklistItem"("deadlineTaskId", "position");

ALTER TABLE "DeadlineChecklistItem" ADD CONSTRAINT "DeadlineChecklistItem_deadlineTaskId_fkey" FOREIGN KEY ("deadlineTaskId") REFERENCES "DeadlineTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
