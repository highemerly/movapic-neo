import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getRecentNotifications } from "@/lib/achievements/notifications";
import { userPathSegment } from "@/lib/userHandle";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { getAvatarUrl } from "@/lib/avatar";
import { Footer } from "@/components/Footer";
import { NotificationsList } from "@/components/notifications/NotificationsList";
import { PageContainer } from "@/components/PageContainer";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    redirect("/?reason=login_required");
  }

  const items = await getRecentNotifications(currentUser.id);
  const selfSeg = userPathSegment(currentUser.username, currentUser.instance.domain);

  return (
    <>
      <SiteHeader
        user={{ username: currentUser.username, instanceDomain: currentUser.instance.domain, avatarUrl: getAvatarUrl(currentUser.avatarUrl) }}
      />
      <PageContainer width="xl">
        <div className="mb-3 flex items-baseline justify-between">
          <h1 className="text-base font-bold">通知</h1>
          <span className="text-[11px] text-muted-foreground">最近90日間の通知を新しい順に表示します</span>
        </div>

        <NotificationsList items={items} selfSeg={selfSeg} />

        <Footer />
      </PageContainer>
    </>
  );
}
