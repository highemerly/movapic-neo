import { Globe, Server, User, type LucideIcon } from "lucide-react";

/**
 * 主要動線（みんな／同じサーバー／あなた）の定義を1箇所に集約する。
 *
 * href と「現在地（active）判定」を1箇所に集約するのが目的。現状の消費側は
 * BottomNav（PWA下部ナビ）で、そこから必要な項目だけを取り出して使う。
 * 見た目（ラベル表示有無・アイコン差し替え・並び順）は各UI側の責務とし、
 * ここでは「どこへ・現在地か」だけを持つ。
 *
 * AppMenu の網羅メニュー（規約・実績・ログアウト等を含む長い一覧）は別概念のため
 * ここには含めない。
 */

export type PrimaryNavKey = "public" | "instance" | "mypage";

export type PrimaryNavItem = {
  key: PrimaryNavKey;
  href: string;
  /** 既定ラベル。アイコンのみ表示のUIでも aria-label/title に使う。 */
  label: string;
  Icon: LucideIcon;
  /**
   * 現在地判定。pathname と「instances クエリの有無」を渡す
   * （みんな=全体 と サーバー=同インスタンス は同じ /public で param のみ異なるため）。
   */
  isActive: (pathname: string, hasInstancesParam: boolean) => boolean;
};

export type PrimaryNavContext = {
  isLoggedIn: boolean;
  /** ログインユーザーの /u/ パスセグメント（未ログイン or 不明は null） */
  selfSegment?: string | null;
  /** ログインユーザーの所属サーバードメイン（未ログイン or 不明は null） */
  instanceDomain?: string | null;
};

/**
 * 表示すべき主要動線を、ログイン状態に応じて絞り込んで返す。
 * - みんな: 常に表示
 * - 同じサーバー: ログイン＋所属ドメインあり
 * - あなた（マイページ）: ログイン＋selfSegmentあり
 *
 * 現在地判定は「そのページちょうど」の完全一致。下部ナビの「あなた」タブは
 * ユーザーページ配下（カレンダー/地図/実績）も含むセクション全体を表すため、
 * そちら側で別途 startsWith 判定する。
 */
export function getPrimaryNavItems({
  isLoggedIn,
  selfSegment,
  instanceDomain,
}: PrimaryNavContext): PrimaryNavItem[] {
  const items: PrimaryNavItem[] = [
    {
      key: "public",
      href: "/public",
      label: "みんな",
      Icon: Globe,
      isActive: (pathname, hasInstances) =>
        pathname === "/public" && !hasInstances,
    },
  ];

  if (isLoggedIn && instanceDomain) {
    items.push({
      key: "instance",
      href: `/public?instances=${encodeURIComponent(instanceDomain)}`,
      label: "同じサーバー",
      Icon: Server,
      isActive: (pathname, hasInstances) =>
        pathname === "/public" && hasInstances,
    });
  }

  if (isLoggedIn && selfSegment) {
    const base = `/u/${selfSegment}`;
    items.push({
      key: "mypage",
      href: base,
      label: "あなた",
      Icon: User,
      isActive: (pathname) => pathname === base,
    });
  }

  return items;
}
