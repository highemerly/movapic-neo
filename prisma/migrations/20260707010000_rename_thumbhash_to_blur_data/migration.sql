-- Blurプレースホルダを ThumbHash(base64) から 極小WebPの data URI(LQIP) に変更。
-- 旧値（ThumbHash文字列）は無効になるため NULL に戻し、backfill で入れ直す。
ALTER TABLE "images" RENAME COLUMN "thumbhash" TO "blur_data_url";
ALTER TABLE "images" ALTER COLUMN "blur_data_url" TYPE TEXT;
UPDATE "images" SET "blur_data_url" = NULL;
