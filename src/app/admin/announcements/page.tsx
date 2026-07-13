/**
 * 管理ページ: お知らせ管理（/admin/announcements）
 *
 * 従来の静的ファイル（src/data/announcements.ts）を廃止し、DB を正として Web から編集する。
 * 取得は unstable_cache で抑え、作成/編集/削除の各 API が revalidateTag("announcements") で
 * 即時反映する（詳細は @/lib/announcements）。管理者ガードは admin/layout.tsx に集約。
 */

import { getAllAnnouncementsForAdmin } from "@/lib/announcements.server";
import { AnnouncementsManager } from "./AnnouncementsManager";

export const dynamic = "force-dynamic";

/** サーバー現在時刻（epoch ms）。掲載状況バッジ判定用。 */
function serverNowMs(): number {
  return Date.now();
}

export default async function AdminAnnouncementsPage() {
  const announcements = await getAllAnnouncementsForAdmin();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">お知らせ</h1>
      </div>
      <AnnouncementsManager initial={announcements} nowMs={serverNowMs()} />
    </div>
  );
}
