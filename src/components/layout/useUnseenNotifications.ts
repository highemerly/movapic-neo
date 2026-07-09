"use client";

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { markNotificationsSeen } from "@/app/actions/notifications";

const COOKIE_NAME = "not";

export type FavoriteFeedData = {
  count: number;
  favoriters: {
    acct: string;
    displayName: string | null;
    avatarUrl: string | null;
    profileUrl: string | null;
  }[];
};

export type NotificationItem = {
  id: string;
  type: string;
  achievementKey: string | null;
  createdAt: string;
  image: { id: string; pageUrl: string; thumbnailUrl: string } | null;
  favorite: FavoriteFeedData | null;
  recipientUsername: string;
};

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(^| )${name}=([^;]+)`));
  return match ? decodeURIComponent(match[2]) : null;
}

type NotificationsValue = {
  notifications: NotificationItem[];
  hasUnseen: boolean;
  markSeen: () => void;
  loaded: boolean;
};

const EMPTY: NotificationsValue = {
  notifications: [],
  hasUnseen: false,
  markSeen: () => {},
  loaded: false,
};

const NotificationsContext = createContext<NotificationsValue | null>(null);

/**
 * 通知の未読状態をアプリ全体で「1回だけ」取得して共有するプロバイダ。
 *
 * ヘッダーのベル（NotificationBell・md未満）と PC レール（AppRail・md+）は同時にマウント
 * されるため、以前はそれぞれが /api/v1/notifications を叩いて同じデータを二重取得していた。
 * ここで1回だけ fetch して両者へ配ることで、ページごとの通知取得を1回に集約する。
 * markSeen も共有状態を更新するので、ベルとレールの赤ドットが常に同期する。
 *
 * layout で MenuProvider ごと包む。enabled=ログイン中のみ fetch（未ログインは 401 になるだけ）。
 * Cookie `not`（最後に確認した時刻）より新しい通知があれば未読＝赤ドット。未設定なら now で
 * 初期化し、リリース時点の既存通知では光らせない。
 */
export function NotificationsProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [seenAt, setSeenAt] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // setState は fetch のコールバック内でのみ行う（effect 本体での同期 setState を避ける）。
  useEffect(() => {
    if (!enabled) return;

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
  }, [enabled]);

  const hasUnseen =
    loaded &&
    seenAt != null &&
    notifications.some(
      (n) => new Date(n.createdAt).getTime() > new Date(seenAt).getTime(),
    );

  /** 確認済みにする（Cookie を now に更新し、赤ドットを消す）。 */
  const markSeen = useCallback(() => {
    const now = new Date().toISOString();
    setSeenAt(now);
    markNotificationsSeen(now).catch(() => {});
  }, []);

  return createElement(
    NotificationsContext.Provider,
    { value: { notifications, hasUnseen, markSeen, loaded } },
    children,
  );
}

/**
 * 通知の未読判定を読むフック（NotificationsProvider から供給・全ページ共有）。
 * ヘッダーのベル・PCレール・ダッシュボードの通知ボタンで共用する。
 * Provider 外（未ログインで未マウント等）では安全なデフォルトを返す。
 */
export function useUnseenNotifications(): NotificationsValue {
  return useContext(NotificationsContext) ?? EMPTY;
}
