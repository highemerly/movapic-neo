/**
 * ブラウザストレージ（localStorage / sessionStorage / Cache Storage）のキーを一元管理する。
 *
 * なぜ集約するか: 以前はキー文字列を使用箇所ごとにベタ書きしており、同じキーが2〜4箇所に
 * 重複していた（`flash:loggedOut` は4箇所すべて生リテラル、`shamezo.lastServer` は同名定数を
 * 2ファイルで別々に定義）。片方だけ直すと無言で壊れる。命名も prefix（shamezo / movapic /
 * 無し）・区切り（`.` `:` `_` `-`）・記法（camel / kebab / snake）がバラバラだった。
 *
 * 規約: `shamezo:` + kebab-case。階層は `:` で区切る（例 `shamezo:timeline:public:all`）。
 *
 * 例外: テーマは next-themes が持つ `theme`（ライブラリ既定キー）。改名すると全ユーザーの
 * テーマ設定が飛ぶうえ next-themes の慣習からも外れるため、ここでは扱わない。
 */

const NS = "shamezo";

/** localStorage（端末に永続。ブラウザを閉じても残る） */
export const LOCAL_KEYS = {
  /** ログインフォームに補完する前回のサーバー */
  lastServer: `${NS}:last-server`,
  /** 写真一覧のレイアウト（grid / packed） */
  galleryLayout: `${NS}:gallery-layout`,
  /** リアクションピッカーの「よく使う」履歴 */
  recentReactions: `${NS}:recent-reactions`,
  /** PWA追加提案の表示頻度制御（断った回数・次回表示時刻） */
  pwaSuggest: `${NS}:pwa-suggest`,
} as const;

/** sessionStorage（タブを閉じるまで。遷移をまたぐ一時的な受け渡しに使う） */
export const SESSION_KEYS = {
  /** 投稿直後のお祝いモーダルへ渡す新規獲得実績 */
  newAchievements: `${NS}:new-achievements`,
  /** ユーザーページのスライド方向判定に使う「直前に見ていたタブ」 */
  userTab: `${NS}:user-tab`,
  /** 都道府県クリック→遷移先で写真一覧までスクロールさせる目印 */
  prefScroll: `${NS}:pref-scroll`,
  /** ログアウト後のトップ着地で一度だけ出すトースト */
  flashLoggedOut: `${NS}:flash:logged-out`,
} as const;

/**
 * タイムライン一覧のスナップショット（useTimelinePersistence）。
 * 一覧の内容が異なるので、ユーザー別・サーバー絞り込み別にキーを分ける。
 */
export const timelineKey = {
  user: (username: string) => `${NS}:timeline:user:${username}`,
  public: (filter: string) => `${NS}:timeline:public:${filter}`,
} as const;

/**
 * Cache Storage の名前。
 *
 * pitfall: Service Worker（public/sw.js）は ES import できないため同じ文字列を自前で持つ。
 * ここを変えたら sw.js の定数も必ず同時に直す（sw.js の activate は未知の名前のキャッシュを
 * 削除するので、片方だけ変えるとキャッシュが毎回捨てられ続ける）。
 */
export const CACHE_NAMES = {
  /** Web Share Target で受け取った共有画像の一時置き場 */
  sharedImage: `${NS}:shared-image`,
  /** 投稿画像の CacheFirst キャッシュ。`-v1` は保存形式を変えたいときの意図的なバスト用 */
  postImage: `${NS}:post-image-v1`,
} as const;

/** 共有画像を CACHE_NAMES.sharedImage 内に置くときのリクエストキー（sw.js と共有） */
export const SHARED_IMAGE_CACHE_KEY = "/__shared";

/**
 * 命名統一（2026-07）で改名した localStorage キーの移行表（[旧キー, 新キー]）。
 *
 * localStorage は明示削除するまで残るため、改名しただけだと旧キーが端末に永久に居座り、
 * さらに設定値（前回サーバー・レイアウト・PWA案内の猶予）も失われる。起動時に一度だけ
 * 値を新キーへ移して旧キーを消す（layout.tsx のインラインスクリプトが実行）。
 * sessionStorage の旧キーはタブを閉じれば消え、Cache Storage の旧名は sw.js の activate が
 * 掃除するので、ここでは扱わない。
 *
 * 全ユーザーが一度アクセスすれば役目を終える一時コード。2026年内を目安に、この定数と
 * layout.tsx の LEGACY_STORAGE_MIGRATION_SCRIPT ごと削除してよい。
 */
export const LEGACY_LOCAL_KEY_MIGRATIONS: ReadonlyArray<readonly [string, string]> = [
  ["shamezo.lastServer", LOCAL_KEYS.lastServer],
  ["gallery-layout", LOCAL_KEYS.galleryLayout],
  ["shamezo.pwa-suggest", LOCAL_KEYS.pwaSuggest],
];
