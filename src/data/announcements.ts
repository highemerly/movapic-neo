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
  { id: 3, type: "warning", message: "利用規約・プライバシーポリシーを改訂しました", createdAt: "2026-06-02", detail: "より安心して便利にご利用いただくため、利用規約・プライバシーポリシーを本日付で改定しました。\n\n利用規約は、禁止されている投稿の明記と、ユーザーの投稿した画像の著作権がユーザーにあることの明記などを行いました。詳細は[利用規約](/terms)からご確認ください。\n\nプライバシーポリシーは、収集する個人情報をより明確にし、「など」のような曖昧な表記をなくしました。また、ユーザーが明確にオプトインした場合に限り、カメラの機種情報や位置情報（市町村レベルまで）を取得することで、新機能の提供を可能としました。詳細は[プライバシーポリシー](/privacy)からご確認ください。" },
  { id: 4, type: "info", message: "期間限定の「七夕」デコレーションはいかがですか？", createdAt: "2026-07-01", detail: "楽しいおしらせです。今後不定期で、期間限定の特別なデコレーションをお楽しみいただけるイベントを開催します。1枚でも投稿すれば、期間限定の実績も獲得できます。\n\n第一弾は「七夕」。短冊に願いを書いて、投稿してみませんか？2026年7月12日までの期間限定です！さっそく[投稿画面](/create?season=tanabata-2026)から投稿してみましょう！" },
];

// お知らせの有効期間（日数）
export const ANNOUNCEMENT_EXPIRY_DAYS = 10;
