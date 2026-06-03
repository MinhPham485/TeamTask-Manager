/*
  Warnings:

  - The values [owner] on the enum `TaskMemberRole` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `taskCommentId` on the `TaskMember` table. All the data in the column will be lost.
  - You are about to drop the column `taskLabelLabelId` on the `TaskMember` table. All the data in the column will be lost.
  - You are about to drop the column `taskLabelTaskId` on the `TaskMember` table. All the data in the column will be lost.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "TaskMemberRole_new" AS ENUM ('leader', 'member');
ALTER TABLE "TaskMember" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "TaskMember" ALTER COLUMN "role" TYPE "TaskMemberRole_new" USING ("role"::text::"TaskMemberRole_new");
ALTER TYPE "TaskMemberRole" RENAME TO "TaskMemberRole_old";
ALTER TYPE "TaskMemberRole_new" RENAME TO "TaskMemberRole";
DROP TYPE "TaskMemberRole_old";
ALTER TABLE "TaskMember" ALTER COLUMN "role" SET DEFAULT 'member';
COMMIT;

-- DropForeignKey
ALTER TABLE "TaskMember" DROP CONSTRAINT "TaskMember_taskCommentId_fkey";

-- DropForeignKey
ALTER TABLE "TaskMember" DROP CONSTRAINT "TaskMember_taskLabelTaskId_taskLabelLabelId_fkey";

-- AlterTable
ALTER TABLE "TaskMember" DROP COLUMN "taskCommentId",
DROP COLUMN "taskLabelLabelId",
DROP COLUMN "taskLabelTaskId";
