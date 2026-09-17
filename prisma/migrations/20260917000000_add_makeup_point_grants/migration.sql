-- 穴埋めポイントの付与台帳（2026-10 分から）。1pt = 1日ぶんの穴埋め。
-- month はこのポイントが使える対象月（JST の "YYYY-MM"）。
-- 消費数はカラムで持たず images.makeup_target_day から導出する（残高を二重管理しない）。
-- (user_id, month, reason) 一意 = 月×理由で1回だけ ＝ 30分ごとの定期ジョブでも冪等。
-- users.auto_makeup の削除はここに含めない（2026年9月中は自動穴埋め設定を残すため。
-- 削除は docs/cleanup-2026-10.md のクリーンアップリリースで別マイグレーションにする）。

-- CreateTable
CREATE TABLE "makeup_point_grants" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "month" VARCHAR(7) NOT NULL,
    "reason" VARCHAR(64) NOT NULL,
    "amount" INTEGER NOT NULL,
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "makeup_point_grants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "makeup_point_grants_user_id_month_idx" ON "makeup_point_grants"("user_id", "month");

-- CreateIndex
CREATE UNIQUE INDEX "makeup_point_grants_user_id_month_reason_key" ON "makeup_point_grants"("user_id", "month", "reason");

-- AddForeignKey
ALTER TABLE "makeup_point_grants" ADD CONSTRAINT "makeup_point_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
