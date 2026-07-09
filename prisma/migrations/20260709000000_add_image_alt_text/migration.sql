-- AlterTable: 画像の代替テキスト（ALT）。null=未設定。
-- Fediverse へは Mastodon=description / Misskey=comment として送信し、
-- サービス側 <img alt> は altText を優先（未設定時は overlay_text にフォールバック）。
ALTER TABLE "images" ADD COLUMN "alt_text" VARCHAR(1500);
