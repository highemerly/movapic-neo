-- AlterTable
ALTER TABLE "images" ADD COLUMN     "fediverse_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "reaction_totals_cache" JSONB;

-- AlterTable
ALTER TABLE "instances" ADD COLUMN     "emojis_cache" JSONB,
ADD COLUMN     "emojis_synced_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "reactions" (
    "id" TEXT NOT NULL,
    "image_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "emoji" VARCHAR(400) NOT NULL,
    "emoji_image_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reactions_user_id_created_at_idx" ON "reactions"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "reactions_image_id_user_id_key" ON "reactions"("image_id", "user_id");

-- AddForeignKey
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_image_id_fkey" FOREIGN KEY ("image_id") REFERENCES "images"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 既存画像のお気に入り数を「オーナーインスタンス上の生の合計」へ引き継ぐ。
-- favorite_count は今後「Reactionテーブルとマージ済みの表示用合計」に意味が変わるが、
-- マージの土台になるのは fediverse_count 側。投稿から16日を超えた画像は同期が恒久停止して
-- いて再取得されないため、ここで移しておかないと件数が0で表示されてしまう。
UPDATE "images" SET "fediverse_count" = "favorite_count";
