"use client";

import { useEffect, useState } from "react";
import { markNotificationsSeen } from "@/app/actions/notifications";

const COOKIE_NAME = "not";

export type NotificationItem = {
  id: string;
  type: string;
  achievementKey: string | null;
  createdAt: string;
  image: { id: string; pageUrl: string; thumbnailUrl: string } | null;
};

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(^| )${name}=([^;]+)`));
  return match ? decodeURIComponent(match[2]) : null;
}

/**
 * 通知の未読判定を共通化するフック（ヘッダーのベル・ダッシュボードの通知ボタンで共用）。
 *
 * Cookie `not`（最後に確認した時刻）より新しい通知があれば未読＝赤ドット表示。
 * Cookie 未設定なら初回 now で初期化し、リリース時点の既存通知では光らせない。
 */
export function useUnseenNotifications() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [seenAt, setSeenAt] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // setState は fetch のコールバック内でのみ行う（effect 本体での同期 setState を避ける）。
  useEffect(() => {
    let seen = getCookie(COOKIE_NAME);
    if (!seen) {
      seen = new Date().toISOString();
      markNotificationsSeen(seen).catch(() => {});
    }
    const seenValue = seen;

    fetch("/api/v1/notifications?limit=5")
      .then((r) => (r.ok ? r.json() : { notifications: [] }))
      .then((data: { notifications?: NotificationItem[] }) => {
        setSeenAt(seenValue);
        setNotifications(data.notifications ?? []);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const hasUnseen =
    loaded &&
    seenAt != null &&
    notifications.some((n) => new Date(n.createdAt).getTime() > new Date(seenAt).getTime());

  /** 確認済みにする（Cookie を now に更新し、赤ドットを消す）。 */
  const markSeen = () => {
    const now = new Date().toISOString();
    setSeenAt(now);
    markNotificationsSeen(now).catch(() => {});
  };

  return { notifications, hasUnseen, markSeen, loaded };
}
