-- achievements.image_id・notifications.image_id にインデックスを張り、unique と重複するインデックスを外す。
--
-- image_id はどちらも images への外部キー（ON DELETE SET NULL）。インデックスが無いと、画像を1枚削除する
-- たびに Postgres が SET NULL の対象を探して表全体を走査する（アカウント削除では画像の枚数だけ繰り返す）。
-- achievements は画像詳細の「この投稿で獲得した実績」（where image_id = ?）でも閲覧のたびに走査していた。
--
-- mutes(muter_id) と makeup_point_grants(user_id, month) は、それぞれ unique の
-- (muter_id, muted_user_id)・(user_id, month, reason) の先頭の列と同じで、検索はそちらで引ける。
-- 書き込みのたびに更新する分だけ無駄なので外す。
--
-- CREATE INDEX は作り終わるまで、その表への書き込み（実績の付与・通知の作成）を待たせる。
-- 行数が少ないうちは一瞬で終わる。順序は通常どおり「コードのデプロイ前に適用」で、旧コードにも影響しない。

-- DropIndex
DROP INDEX "mutes_muter_id_idx";

-- DropIndex
DROP INDEX "makeup_point_grants_user_id_month_idx";

-- CreateIndex
CREATE INDEX "achievements_image_id_idx" ON "achievements"("image_id");

-- CreateIndex
CREATE INDEX "notifications_image_id_idx" ON "notifications"("image_id");
