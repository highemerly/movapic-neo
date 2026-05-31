export type AnnouncementType = "warning" | "info";

export type Announcement = {
  id: number;
  type: AnnouncementType;
  message: string;
  link?: string; // リンクURL（設定すると全文がリンクになる。detailより優先）
  detail?: string; // 詳細本文（設定すると /announcements/[id] へ自動リンク。改行はそのまま反映）
  createdAt: string; // YYYY-MM-DD
};

// お知らせを追加するときはIDを増やす（新しいものほど大きいID）
// 例:
//   { id: 1, type: "info", message: "サービスを開始しました", createdAt: "2024-01-15" }
//   { id: 2, type: "warning", message: "メンテナンスのお知らせ →", link: "/maintenance", createdAt: "2024-01-16" }
//   { id: 3, type: "info", message: "新機能をリリースしました", detail: "詳しくは...\n\n本文がそのまま表示されます", createdAt: "2024-02-01" }
export const announcements: Announcement[] = [
  { id: 1, type: "info", message: "カレンダー機能をリリースしました！", createdAt: "2026-03-14" , detail: "ユーザーページにカレンダー機能を実装しました。月ごとに投稿した写真を一覧でみることができます。皆勤賞を目指してみてください！\n\n[マイカレンダーを見る](/self/calendar)"},
  { id: 2, type: "info", message: "お気に入り機能をリニューアルしました！", createdAt: "2026-05-31", detail: "お気に入り機能を抜本的にリニューアルしました。\n\nMastodonサーバーでのお気に入りとSHAMEZOのお気に入りが同期するようになりました。たとえば、Mastodonサーバー上でSHAMEZOから投稿した画像をお気に入り登録すると、SHAMEZOでもお気に入りとして表示されます。逆に、SHAMEZO上でお気に入り登録すると、Mastodonサーバー上でもお気に入り登録されます。なお、過去のお気に入りデータは申し訳ありませんが削除させていただいているのでご容赦ください。" },

];

// お知らせの有効期間（日数）
export const ANNOUNCEMENT_EXPIRY_DAYS = 30;
