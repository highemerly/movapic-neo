/**
 * リアクション機能で共有するデータ形状。
 *
 * リアクションの情報源は2系統ある:
 *  - オーナーインスタンス（Fediverse）のキャッシュ … Image.fediverseCount /
 *    reactionTotalsCache / favoritersCache
 *  - SHAMEZO の Reaction テーブル … このサービス上で押されたリアクションの正データ
 *
 * 表示は常に両者をマージした結果（src/lib/reactions/merge.ts）を使う。
 */

/** リアクションしたユーザー1人分の表示情報 */
export interface ReactionUser {
  acct: string;
  displayName: string | null;
  avatarUrl: string | null;
  profileUrl: string | null;
}

/**
 * オーナーインスタンスのリアクション一覧キャッシュ1件分（Image.favoritersCache の要素）。
 *
 * emoji はリアクションの正規化キー。Mastodonオーナーの favourite は種別を持たないため null、
 * また リアクション機能導入前に書かれた行にはフィールド自体が無い。どちらも「種別不明」として
 * FAVOURITE_KEY(❤) 扱いで読む。
 */
export interface CachedFavoriter extends ReactionUser {
  emoji?: string | null;
  emojiImageUrl?: string | null;
}

/**
 * 絵文字別カウントのキャッシュ（Image.reactionTotalsCache）。
 *
 * Misskeyオーナー: notes/show の reactions を正規化キーに直したもの。上位40件の一覧と違い
 * 全リアクションを数えた値なので、チップの件数はこちらが正確。
 * Mastodonオーナー: { totals: { "❤": count } }。
 */
export interface ReactionTotalsCache {
  totals: Record<string, number>;
  /** カスタム絵文字キー → 表示用画像URL */
  emojiUrls?: Record<string, string>;
}

/** SHAMEZO の Reaction テーブル1行（acct とユーザー表示情報を解決済み） */
export interface StoredReaction extends ReactionUser {
  emoji: string;
  emojiImageUrl: string | null;
}

/** 画像詳細に並べるリアクションチップ1個 */
export interface ReactionChip {
  emoji: string;
  /** カスタム絵文字の画像URL（未解決・Unicode絵文字は null） */
  imageUrl: string | null;
  count: number;
  reactedByViewer: boolean;
}

/** マージ結果 */
export interface MergedReactions {
  /** 合計リアクション数（= チップ件数の総和） */
  total: number;
  /** 件数降順 */
  chips: ReactionChip[];
  /** 絵文字キー → リアクションしたユーザー（チップをタップしたときに出す一覧） */
  usersByEmoji: Record<string, ReactionUser[]>;
  /** 閲覧者が押しているリアクション。未ログイン・未リアクションは null */
  viewerEmoji: string | null;
}
