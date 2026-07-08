-- カレンダー手動制御3機能: 代表サムネ指定 / 穴埋め割当の永続化 / 自動穴埋め設定
-- すべて nullable / default 付きで後方互換（既存挙動は autoMakeup=true で完全温存）。

-- ③ 自動穴埋め（User設定）
ALTER TABLE "users" ADD COLUMN "auto_makeup" BOOLEAN NOT NULL DEFAULT true;

-- ① その日のサムネイルにユーザーが手動指定した印（null=自動＝最古）
ALTER TABLE "images" ADD COLUMN "calendar_picked_at" TIMESTAMP(3);

-- ② 皆勤賞の穴埋め割当（この投稿が埋める空き日 1-31。null=穴埋めに使っていない）
ALTER TABLE "images" ADD COLUMN "makeup_target_day" INTEGER;
