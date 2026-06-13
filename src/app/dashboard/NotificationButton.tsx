"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUnseenNotifications } from "@/components/layout/useUnseenNotifications";

/** ダッシュボードの通知ボタン。ヘッダーのベルと同じく未読があれば右肩に赤ドット。 */
export function NotificationButton() {
  const { hasUnseen, markSeen } = useUnseenNotifications();
  return (
    <Link href="/dashboard/notifications" onClick={markSeen}>
      <Button
        variant="outline"
        className="relative w-full h-auto py-2"
        aria-label="通知"
        title="通知"
      >
        <Bell className="h-5 w-5" />
        {hasUnseen && (
          <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-red-500" />
        )}
      </Button>
    </Link>
  );
}
