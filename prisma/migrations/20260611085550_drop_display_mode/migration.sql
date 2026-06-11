-- テーマは localStorage 一本化したため display_mode カラムは不要（コード参照は全除去済み）。
-- DropColumn
ALTER TABLE "users" DROP COLUMN "display_mode";
