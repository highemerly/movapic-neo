-- リプライ（スレッド）先の画像。null = 単独投稿。
-- 親が削除されたら SET NULL で痕跡なく単独投稿に戻す（仕様: 削除されたリプライ先は何も表示しない）。
-- 退会時も User→Image の CASCADE で消えた親を指す他人の子は SET NULL になる。
-- nullable 追加のため、バックフィルは不要。

-- AlterTable
ALTER TABLE "images" ADD COLUMN "reply_to_id" TEXT;

-- CreateIndex
CREATE INDEX "images_reply_to_id_idx" ON "images"("reply_to_id");

-- AddForeignKey
ALTER TABLE "images" ADD CONSTRAINT "images_reply_to_id_fkey" FOREIGN KEY ("reply_to_id") REFERENCES "images"("id") ON DELETE SET NULL ON UPDATE CASCADE;
