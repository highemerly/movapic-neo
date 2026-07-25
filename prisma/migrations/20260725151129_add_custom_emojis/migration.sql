-- CreateTable
CREATE TABLE "custom_emojis" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "image_url" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "category" VARCHAR(64),
    "aliases" TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_emojis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "custom_emojis_name_key" ON "custom_emojis"("name");

-- CreateIndex
CREATE INDEX "custom_emojis_enabled_category_idx" ON "custom_emojis"("enabled", "category");

-- AddForeignKey
ALTER TABLE "custom_emojis" ADD CONSTRAINT "custom_emojis_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
