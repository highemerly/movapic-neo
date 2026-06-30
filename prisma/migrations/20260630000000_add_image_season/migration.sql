-- AlterTable: シーズン（期間限定）。null=通常投稿 / "tanabata-2026" 等のシーズンキー。
ALTER TABLE "images" ADD COLUMN "season" VARCHAR(40);
