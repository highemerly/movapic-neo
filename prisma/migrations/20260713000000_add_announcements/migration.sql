-- CreateTable: 運営からのお知らせ。従来の静的ファイル(src/data/announcements.ts)を廃止しDB管理へ移行。
-- 取得は unstable_cache で抑え、Admin編集時に revalidateTag("announcements") で即時破棄する。
CREATE TABLE "announcements" (
    "id" SERIAL NOT NULL,
    "type" VARCHAR(20) NOT NULL DEFAULT 'info',
    "message" TEXT NOT NULL,
    "link" TEXT,
    "detail" TEXT,
    "publish_at" TIMESTAMP(3) NOT NULL,
    "pinned_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "announcements_publish_at_idx" ON "announcements"("publish_at");

-- Seed: 既存の静的お知らせ4件を移行。いずれも過去分のため pinned_until は NULL（上部バナー非掲載・一覧のみ）。
-- publish_at は元の createdAt（JST）を採用する。
INSERT INTO "announcements" ("type", "message", "detail", "publish_at", "pinned_until", "created_at", "updated_at") VALUES
('info', 'カレンダー機能をリリースしました！', E'ユーザーページにカレンダー機能を実装しました。月ごとに投稿した写真を一覧でみることができます。皆勤賞を目指してみてください！\n\n[マイカレンダーを見る](/self/calendar)', '2026-03-14 00:00:00+09', NULL, '2026-03-14 00:00:00+09', CURRENT_TIMESTAMP),
('info', 'お気に入り機能をリニューアルしました！', E'お気に入り機能を抜本的にリニューアルしました。\n\nMastodonサーバーでのお気に入りとSHAMEZOのお気に入りが同期するようになりました。たとえば、Mastodonサーバー上でSHAMEZOから投稿した画像をお気に入り登録すると、SHAMEZOでもお気に入りとして表示されます。逆に、SHAMEZO上でお気に入り登録すると、Mastodonサーバー上でもお気に入り登録されます。なお、過去のお気に入りデータは申し訳ありませんが削除させていただいているのでご容赦ください。', '2026-05-31 00:00:00+09', NULL, '2026-05-31 00:00:00+09', CURRENT_TIMESTAMP),
('warning', '利用規約・プライバシーポリシーを改訂しました', E'より安心して便利にご利用いただくため、利用規約・プライバシーポリシーを本日付で改定しました。\n\n利用規約は、禁止されている投稿の明記と、ユーザーの投稿した画像の著作権がユーザーにあることの明記などを行いました。詳細は[利用規約](/terms)からご確認ください。\n\nプライバシーポリシーは、収集する個人情報をより明確にし、「など」のような曖昧な表記をなくしました。また、ユーザーが明確にオプトインした場合に限り、カメラの機種情報や位置情報（市町村レベルまで）を取得することで、新機能の提供を可能としました。詳細は[プライバシーポリシー](/privacy)からご確認ください。', '2026-06-02 00:00:00+09', NULL, '2026-06-02 00:00:00+09', CURRENT_TIMESTAMP),
('info', '期間限定の「七夕」デコレーションはいかがですか？', E'楽しいおしらせです。今後不定期で、期間限定の特別なデコレーションをお楽しみいただけるイベントを開催します。1枚でも投稿すれば、期間限定の実績も獲得できます。\n\n第一弾は「七夕」。短冊に願いを書いて、投稿してみませんか？2026年7月12日までの期間限定です！さっそく[投稿画面](/create?season=tanabata-2026)から投稿してみましょう！', '2026-07-01 00:00:00+09', NULL, '2026-07-01 00:00:00+09', CURRENT_TIMESTAMP);
