-- リアクションを最後に Fediverse へ送った時刻。null = 送っていない（local 投稿の時代に付いたもの）。
-- オーナー側の取り消し検知は送った行だけを対象にする（送っていない行は再投稿後に「取り消し」と誤検知され消えていた）。
-- nullable 追加のため、適用後〜新コードのデプロイまでに古いコードが作った行は null（判定対象外＝安全側）になる。

-- AlterTable
ALTER TABLE "reactions" ADD COLUMN "federated_at" TIMESTAMP(3);

-- Backfill: 連合済みの画像への既存リアクションは「送った」とみなす。最後に送ったのは最後に更新した時刻
-- （PUT は絵文字の付け替えでも毎回送るため）。local／未投稿の画像の行は null のまま＝今後の再投稿で守られる。
-- 限界: すでに再投稿済みの画像に残る local 時代の行は見分けられない（再投稿の時刻を記録していない）。
UPDATE "reactions" r
SET "federated_at" = r."updated_at"
FROM "images" i
WHERE i."id" = r."image_id" AND i."post_id" IS NOT NULL;
