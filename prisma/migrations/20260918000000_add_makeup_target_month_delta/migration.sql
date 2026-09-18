-- 穴埋め割当の対象月オフセット。0 = この投稿と同じ月の穴 / -1 = 前月の穴。
-- 前月の穴埋めは締切（翌月10日）まで可能なので、翌月1〜10日の投稿も donor になれる
-- （「月末日を忘れると後日が無く埋まらない」という非対称を無くすため）。
-- 既存行は 0（同月）＝これまでと同じ意味なので、過去月の割当・皆勤賞は一切変わらない。
-- NOT NULL DEFAULT 0 で追加するため、バックフィルは不要。

-- AlterTable
ALTER TABLE "images" ADD COLUMN "makeup_target_month_delta" INTEGER NOT NULL DEFAULT 0;
