-- AlterTable: 一覧のBlurプレースホルダ用 ThumbHash（base64・~25バイト）。
-- null=未生成（旧画像。灰色プレースホルダにフォールバック）。
ALTER TABLE "images" ADD COLUMN "thumbhash" VARCHAR(40);
