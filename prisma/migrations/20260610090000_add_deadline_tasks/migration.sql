CREATE TABLE "DeadlineTask" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "groupId" TEXT NOT NULL,
    "createdBy" TEXT,
    "dueDate" TIMESTAMP(3),
    "progress" INTEGER NOT NULL DEFAULT 0,
    "priority" TEXT NOT NULL DEFAULT 'Low',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeadlineTask_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DeadlineTaskMember" (
    "id" TEXT NOT NULL,
    "deadlineTaskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "TaskMemberRole" NOT NULL DEFAULT 'member',
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeadlineTaskMember_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DeadlineTask_groupId_dueDate_idx" ON "DeadlineTask"("groupId", "dueDate");

CREATE INDEX "DeadlineTask_createdBy_idx" ON "DeadlineTask"("createdBy");

CREATE INDEX "DeadlineTaskMember_deadlineTaskId_idx" ON "DeadlineTaskMember"("deadlineTaskId");

CREATE INDEX "DeadlineTaskMember_userId_idx" ON "DeadlineTaskMember"("userId");

CREATE UNIQUE INDEX "DeadlineTaskMember_deadlineTaskId_userId_key" ON "DeadlineTaskMember"("deadlineTaskId", "userId");

ALTER TABLE "DeadlineTask" ADD CONSTRAINT "DeadlineTask_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DeadlineTask" ADD CONSTRAINT "DeadlineTask_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DeadlineTaskMember" ADD CONSTRAINT "DeadlineTaskMember_deadlineTaskId_fkey" FOREIGN KEY ("deadlineTaskId") REFERENCES "DeadlineTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DeadlineTaskMember" ADD CONSTRAINT "DeadlineTaskMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
