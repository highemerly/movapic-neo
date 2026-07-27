-- リアクション起点の実績から「きっかけ写真」を外す（スキーマ変更なしのデータ移行）。
--
-- 画像詳細ページの「この投稿で獲得した実績」は achievements.image_id だけで引くため、
-- リアクション起点の実績に image_id が入っていると「その写真を投稿したから獲得した実績」
-- ではないもの（例: はじめてのリアクション）が投稿の実績として並んでしまう。
-- 付与側（evaluateAndGrantReaction）は常に null を書くよう修正済みなので、それ以前に
-- 獲得リアクションの更新経路で紐づいてしまった既存行をここで戻す。
UPDATE "achievements"
SET "image_id" = NULL
WHERE "image_id" IS NOT NULL
  AND "category" IN ('first-reaction', 'reaction-custom', 'reaction-received');
