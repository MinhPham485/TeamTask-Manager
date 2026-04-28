-- DropIndex
DROP INDEX "Task_createdBy_idx";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "passwordResetAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "passwordResetCodeHash" TEXT,
ADD COLUMN     "passwordResetConsumedAt" TIMESTAMP(3),
ADD COLUMN     "passwordResetExpiresAt" TIMESTAMP(3),
ADD COLUMN     "passwordResetResendAt" TIMESTAMP(3);
