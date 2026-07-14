/**
 * ログイン時に要求する権限（scope / permission）の定義。
 *
 * この定義はログイン画面の権限説明モーダル（PermissionInfoDialog）と
 * ドキュメント（/docs）の「要求する権限」セクションの両方で共有される。
 * 二重管理による齟齬を避けるため、権限の文言は必ずここへ集約すること。
 *
 * 要求スコープは src/lib/auth/fediverse.ts の実装と一致させること。
 * - Mastodon: read write:statuses write:media write:favourites
 * - Misskey:  read:account,write:notes,write:drive,write:reactions
 */

export interface PermissionItem {
  scope: string;
  label: string;
  usage: string;
}

// Mastodon: read write:statuses write:media write:favourites
export const MASTODON_PERMISSIONS: PermissionItem[] = [
  {
    scope: "read",
    label: "アカウント情報の読み取り",
    usage: "ログインのほか、ユーザー名・アイコンの取得、重複投稿有無確認に必要。",
  },
  {
    scope: "write:statuses",
    label: "ポストの投稿・削除",
    usage: "ポストの投稿や削除に必要。",
  },
  {
    scope: "write:media",
    label: "画像のアップロード",
    usage: "画像投稿に必要。",
  },
  {
    scope: "write:favourites",
    label: "お気に入りの追加・削除",
    usage: "Web上でのお気に入り操作に必要。",
  },
];

// Misskey: read:account,write:notes,write:drive,write:reactions
export const MISSKEY_PERMISSIONS: PermissionItem[] = [
  {
    scope: "read:account",
    label: "アカウント情報の読み取り",
    usage: "ログインのほか、ユーザー名・アイコンの取得に必要。",
  },
  {
    scope: "write:notes",
    label: "ノートの作成・削除",
    usage: "ノートの作成や削除に必要。",
  },
  {
    scope: "write:drive",
    label: "ドライブへの画像アップロード",
    usage: "画像つきノートの投稿時、あなたのドライブへ画像をアップロードするために必要。",
  },
  {
    scope: "write:reactions",
    label: "リアクションの追加・削除",
    usage: "Web上でのリアクション操作に必要。",
  },
];

// 技術的には可能だが、方針として行わない操作。
// read / write:statuses 等の広い権限で技術的には可能なため CANNOT_DO には入れられない。
// 「お気に入り／リアクション」の語はインスタンス種別で使い分ける。
export const MASTODON_WONT_DO: string[] = [
  "タイムラインの読み取り",
  "あなたの操作によらない投稿・お気に入りの操作",
];
export const MISSKEY_WONT_DO: string[] = [
  "タイムラインの読み取り",
  "あなたの操作によらない投稿・リアクションの操作",
];

// 要求スコープに含まれないため、技術的（トークンの権限）に不可能な操作（Mastodon / Misskey 共通）。
// ※フォロー閲覧・DM送受信は要求スコープ(read / write:statuses等)で技術的に可能なため含めない。
export const CANNOT_DO: string[] = [
  "フォローする・フォロー解除する・ブロックする・ミュートする",
  "プロフィールを変更する",
  "パスワードをみる",
];
