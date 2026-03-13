-- CreateEnum
CREATE TYPE "MentionStatus" AS ENUM ('pending', 'success', 'failed');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "mention_visibility" VARCHAR(20) NOT NULL DEFAULT 'public';

-- CreateTable
CREATE TABLE "bot_state" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "last_notification_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bot_state_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processed_mentions" (
    "status_id" TEXT NOT NULL,
    "status" "MentionStatus" NOT NULL DEFAULT 'pending',
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "error_code" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "processed_mentions_pkey" PRIMARY KEY ("status_id")
);

-- CreateIndex
CREATE INDEX "processed_mentions_created_at_idx" ON "processed_mentions"("created_at");
