-- CreateTable
CREATE TABLE "achievements" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "category" VARCHAR(40) NOT NULL,
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "achievements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "achievements_user_id_granted_at_idx" ON "achievements"("user_id", "granted_at");

-- CreateIndex
CREATE UNIQUE INDEX "achievements_user_id_key_key" ON "achievements"("user_id", "key");

-- AddForeignKey
ALTER TABLE "achievements" ADD CONSTRAINT "achievements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
