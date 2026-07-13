-- お知らせの「全文リンクURL」機能を廃止（詳細ページ detail への導線のみに一本化）。
ALTER TABLE "announcements" DROP COLUMN "link";
