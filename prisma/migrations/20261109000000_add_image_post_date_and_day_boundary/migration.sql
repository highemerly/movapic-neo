-- 日付の区切り（1日の始まりの時刻）をユーザーごとに選べるようにする。仕様は docs/features.md「日付の区切り」。
--
-- images.post_date: 記録日（この投稿が数えられる日）。保存時に確定し、以後書き換えない。
-- 既存行は created_at の JST 日付で埋める。これまでは全員 0 時区切りだったので、カレンダー・皆勤賞・
-- 穴埋めの割当（makeup_target_day / delta）・makeup_point_grants.month・実績のキーと完全に一致する。
--
-- 適用は「この列を読むコードをデプロイする前」（docs/architecture.md の通常の順序）。
-- 既定値は、適用からイメージ差し替えまでの間に旧コード（post_date を知らない）が保存する行を埋めるため。
-- この期間は全員 0 時区切りなので JST の今日で正しい。差し替え後の別マイグレーションで既定値を外す
-- （外すと保存経路で post_date の書き忘れが型エラーになる）。
--
-- 旧コードは created_at をアプリ側の時刻、post_date を DB の now() で埋めるため、JST の 0:00 を
-- ちょうどまたいだ行だけ日付がずれうる。差し替えが終わったら当日中に次で確かめ、0 件でなければ直す
-- （当日中なら区切りの変更はまだどの投稿にも効いていない＝変更は早くても翌日から）。
--   SELECT count(*) FROM images
--    WHERE post_date <> ((created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Tokyo')::date;
--   UPDATE images SET post_date = ((created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Tokyo')::date
--    WHERE post_date <> ((created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Tokyo')::date;
--
-- 既定値の式は Postgres が正規化して保存する形のまま書く（schema.prisma の dbgenerated と一致させ、
-- migrate diff に差分が出ないようにするため）。created_at は timestamp(3)（UTC の壁時計）なので、
-- いったん UTC として instant にしてから JST に直す（セッションの TimeZone に依存しない）。

-- AlterTable
ALTER TABLE "images" ADD COLUMN "post_date" DATE DEFAULT (timezone('Asia/Tokyo'::text, now()))::date;

-- Backfill
UPDATE "images" SET "post_date" = (("created_at" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Tokyo')::date;

-- AlterTable
ALTER TABLE "images" ALTER COLUMN "post_date" SET NOT NULL;

-- CreateIndex
CREATE INDEX "images_user_id_post_date_idx" ON "images"("user_id", "post_date");

-- day_boundary_settings: 区切りの履歴。from_date の記録日から hour 時区切り。行が無い日は 0 時区切り。
-- hour の CHECK は、記録日が「JST の日付かその前日」になり、時刻に対して単調になる前提を守るため
-- （Prisma は CHECK を表現できないので、ここにだけある）。5 時以上を許すときは src/lib/dayClock.ts の
-- DAY_BOUNDARY_HOURS のコメント（早起きの実績との食い違い）を確認してからこの制約を変える。

-- CreateTable
CREATE TABLE "day_boundary_settings" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "from_date" DATE NOT NULL,
    "hour" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "day_boundary_settings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "day_boundary_settings_hour_check" CHECK ("hour" BETWEEN 0 AND 4)
);

-- CreateIndex
CREATE UNIQUE INDEX "day_boundary_settings_user_id_from_date_key" ON "day_boundary_settings"("user_id", "from_date");

-- AddForeignKey
ALTER TABLE "day_boundary_settings" ADD CONSTRAINT "day_boundary_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
