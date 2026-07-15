-- CreateTable
CREATE TABLE "mutes" (
    "id" TEXT NOT NULL,
    "muter_id" TEXT NOT NULL,
    "muted_user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mutes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mutes_muter_id_idx" ON "mutes"("muter_id");

-- CreateIndex
CREATE UNIQUE INDEX "mutes_muter_id_muted_user_id_key" ON "mutes"("muter_id", "muted_user_id");

-- AddForeignKey
ALTER TABLE "mutes" ADD CONSTRAINT "mutes_muter_id_fkey" FOREIGN KEY ("muter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mutes" ADD CONSTRAINT "mutes_muted_user_id_fkey" FOREIGN KEY ("muted_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
