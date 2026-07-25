/**
 * SHAMEZO 独自のカスタム絵文字カタログ（CustomEmoji テーブル）。
 *
 * 用途:
 *  - リアクションピッカーの候補（Mastodon ユーザー向け。Misskey ユーザーは自サーバーの絵文字を使う）
 *  - リアクション設定時の実在検証（任意の ":name@shamezo:" を保存させない）
 *
 * Mastodon はリアクションに favourite(❤) しか連合送信できず、選んだ絵文字は SHAMEZO の
 * Reaction テーブルにしか残らない。この性質を使い、Misskey ユーザーが自サーバーの
 * カスタム絵文字を押せるのと同等の体験を Mastodon ユーザーへ提供する（emojiKey.ts の
 * SHAMEZO_EMOJI_HOST 参照）。
 *
 * 画像は自前ストレージに置き、メディアプロキシを通さず直接配信する（プロキシの再エンコードで
 * アニメーション(APNG/GIF)が潰れるのを避けるため。B案=原本保存主体。docs/favorite.md 参照）。
 * sharp/skia には触れないため worker-front から呼んでも安全。
 */

import prisma from "@/lib/db";

/** カタログ1件分（ピッカー・検証で使うフィールドだけ） */
export interface ShamezoEmoji {
  name: string;
  imageUrl: string;
  category: string | null;
  aliases: string[];
}

// ── アップロード制約（B案: 原本をそのまま保存。表示高さは CSS で固定するため寸法は縛らない）──
// アニメーション(APNG/GIF)を保つため入力を再エンコードしない。SVG は XSS 回避のため許可しない。
export const ALLOWED_EMOJI_MIME_TYPES = [
  "image/png",
  "image/apng",
  "image/gif",
  "image/webp",
  "image/jpeg",
  "image/avif",
] as const;

// アニメーションを許容するため投稿画像より緩めだが、絵文字なので上限は設ける
export const MAX_EMOJI_FILE_SIZE = 3 * 1024 * 1024; // 3MB

// 名前は Reaction キー ":name@host:" の name 部分＝CUSTOM_EMOJI_PATTERN と同じ charset
export const EMOJI_NAME_PATTERN = /^[a-zA-Z0-9_+-]{1,64}$/;

/** MIME から保存用拡張子へ。APNG は png コンテナなので png 拡張子にする。 */
const MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/apng": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/avif": "avif",
};

export function isAllowedEmojiMimeType(mime: string): boolean {
  return (ALLOWED_EMOJI_MIME_TYPES as readonly string[]).includes(mime);
}

export function emojiExtensionFromMimeType(mime: string): string {
  return MIME_TO_EXT[mime] ?? "png";
}

// プロセス内メモ化。ピッカーを開くたびに全件を引かないための短命キャッシュ。
// 管理者が絵文字を追加/無効化したら bump() で捨てる（admin API から呼ぶ）。
const MEMO_TTL_MS = 60 * 1000;
let memo: { at: number; emojis: ShamezoEmoji[] } | null = null;

/** カタログのメモを破棄する（登録・更新・削除の後に呼ぶ） */
export function invalidateShamezoEmojiCatalog(): void {
  memo = null;
}

/** 有効な SHAMEZO 絵文字を全件返す（カテゴリ→名前順）。小さなテーブル前提で全件メモ化する。 */
export async function listShamezoEmojis(): Promise<ShamezoEmoji[]> {
  if (memo && Date.now() - memo.at < MEMO_TTL_MS) return memo.emojis;

  const rows = await prisma.customEmoji.findMany({
    where: { enabled: true },
    select: { name: true, imageUrl: true, category: true, aliases: true },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
  memo = { at: Date.now(), emojis: rows };
  return rows;
}

/** 名前で有効な SHAMEZO 絵文字を1件引く（リアクション設定時の実在検証用）。 */
export async function findShamezoEmoji(name: string): Promise<ShamezoEmoji | null> {
  const emojis = await listShamezoEmojis();
  return emojis.find((e) => e.name === name) ?? null;
}

/** 名前・エイリアスの部分一致で絞り込む（ピッカー検索用）。 */
export function searchShamezoEmojis(
  emojis: ShamezoEmoji[],
  query: string,
  limit: number
): { emojis: ShamezoEmoji[]; total: number } {
  const q = query.trim().toLowerCase();
  if (!q) return { emojis: emojis.slice(0, limit), total: emojis.length };
  const matched = emojis.filter(
    (e) =>
      e.name.toLowerCase().includes(q) ||
      e.aliases.some((a) => a.toLowerCase().includes(q))
  );
  return { emojis: matched.slice(0, limit), total: matched.length };
}

/**
 * カテゴリごとに区切る（1画面スクロール表示用）。カテゴリ未設定は「その他」にまとめ末尾へ。
 * 件数は小さい前提で打ち切りはしない（Misskey カタログと違い自前登録なので巨大化しない）。
 */
export function groupShamezoEmojisByCategory(
  emojis: ShamezoEmoji[]
): { category: string; emojis: ShamezoEmoji[] }[] {
  const OTHER = "その他";
  const byCategory = new Map<string, ShamezoEmoji[]>();
  for (const emoji of emojis) {
    const key = emoji.category || OTHER;
    const list = byCategory.get(key);
    if (list) list.push(emoji);
    else byCategory.set(key, [emoji]);
  }
  const names = [...byCategory.keys()].sort((a, b) => {
    if (a === OTHER) return 1;
    if (b === OTHER) return -1;
    return a.localeCompare(b, "ja");
  });
  return names.map((name) => ({ category: name, emojis: byCategory.get(name)! }));
}
