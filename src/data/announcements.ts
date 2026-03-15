export type AnnouncementType = "warning" | "info";

export type Announcement = {
  id: number;
  type: AnnouncementType;
  message: string;
  link?: string; // リンクURL（設定すると全文がリンクになる）
  createdAt: string; // YYYY-MM-DD
};

// お知らせを追加するときはIDを増やす（新しいものほど大きいID）
// 例:
//   { id: 1, type: "info", message: "サービスを開始しました", createdAt: "2024-01-15" }
//   { id: 2, type: "warning", message: "メンテナンスのお知らせ →", link: "/maintenance", createdAt: "2024-01-16" }
export const announcements: Announcement[] = [
  { id: 1, type: "info", message: "カレンダー機能をリリースしました！", link: "/self/calendar", createdAt: "2026-03-14" }
];

// お知らせの有効期間（日数）
export const ANNOUNCEMENT_EXPIRY_DAYS = 30;
