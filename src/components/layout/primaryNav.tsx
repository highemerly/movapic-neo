import {
  Globe,
  Server,
  User,
  Calendar,
  Trophy,
  type LucideIcon,
} from "lucide-react";

/**
 * 主要動線（みんな／サーバー／お気に入り／マイページ）の定義を1箇所に集約する。
 *
 * これまで href と「現在地（active）判定」が BottomNav（PWA下部ナビ）と
 * SiteHeader（PC幅インライン）で重複しがちだったため、両者が同じ定義を共有する。
 * 見た目（ラベル表示有無・アイコン差し替え・並び順）は各UI側の責務とし、
 * ここでは「どこへ・現在地か」だけを持つ。
 *
 * AppMenu の網羅メニュー（規約・実績・ログアウト等を含む長い一覧）は別概念のため
 * ここには含めない。
 */

export type PrimaryNavKey =
  | "public"
  | "instance"
  | "mypage"
  | "calendar"
  | "achievements";

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
 * - サーバー: ログイン＋所属ドメインあり
 * - マイページ／カレンダー／実績: ログイン＋selfSegmentあり
 *
 * 現在地判定は各項目とも「そのページちょうど」の完全一致にしている。
 * マイページ配下（カレンダー/実績）を独立項目として並べるため、マイページを
 * startsWith にすると二重ハイライトになるのを避ける狙い。
 * （下部ナビの「あなた」タブはセクション全体を表すので、そちら側で別途
 *  startsWith 判定する。）
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
      label: "サーバー",
      Icon: Server,
      isActive: (pathname, hasInstances) =>
        pathname === "/public" && hasInstances,
    });
  }

  if (isLoggedIn && selfSegment) {
    const base = `/u/${selfSegment}`;
    items.push(
      {
        key: "mypage",
        href: base,
        label: "マイページ",
        Icon: User,
        isActive: (pathname) => pathname === base,
      },
      {
        key: "calendar",
        href: `${base}/calendar`,
        label: "カレンダー",
        Icon: Calendar,
        isActive: (pathname) => pathname === `${base}/calendar`,
      },
      {
        key: "achievements",
        href: `${base}/achievements`,
        label: "実績",
        Icon: Trophy,
        isActive: (pathname) => pathname === `${base}/achievements`,
      }
    );
  }

  return items;
}
