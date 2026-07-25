/**
 * リアクションキーの正規化。
 *
 * SHAMEZO 内部では、リアクションを次のいずれかの文字列（キー）で表す:
 *  - Unicode絵文字 … そのまま（例 "👍"）。ただし異体字セレクタ U+FE0F は除去する。
 *  - カスタム絵文字 … ":name@host:" の完全修飾（例 ":ai_acid@misskey.io:"）
 *
 * Why 完全修飾:
 *   Misskey は自サーバーのカスタム絵文字を ":name@.:"、リモートのものを ":name@host:" と
 *   表記する。"@." のままだと「どのサーバーの絵文字か」が読み手の文脈次第になり、
 *   viewer基準で保存した Reaction テーブルの値とオーナーサーバー由来のキャッシュを
 *   突き合わせられない。取得元ドメインでホストを埋めておけば単純な文字列比較で一致する。
 *
 * Why 異体字セレクタ除去:
 *   Misskey はリアクションを保存する際に U+FE0F を落とす（misskey.io の notes/show で確認。
 *   "❤️"→"❤"、"⁉️"→"⁉"）。除去しないと、ピッカーで選んだ "❤️" と同期で戻ってくる "❤" が
 *   別チップに割れてしまう。テキスト表示になってしまう絵文字には toDisplayEmoji で補い直す。
 */

import { countGraphemes, isEmojiGrapheme } from "@/lib/text/grapheme";

/**
 * 絵文字の種別を持たない Fediverse の favourite を表す内部キー。
 * Mastodon はお気に入りに絵文字を持てず、リアクション機能導入前のキャッシュも種別を持たないため、
 * それらを1つのチップにまとめる受け皿として使う。
 *
 * 値は ❤（U+2764・異体字セレクタなし）。Misskey では Mastodon からの favourite が実際に ❤ の
 * リアクションとして現れるため、Mastodonオーナーの favourite もこのキーに寄せると、
 * プラットフォームをまたいで「お気に入り／❤リアクション」が1つのチップに統一される。
 * ピッカーで ❤ を選んだリアクションとも同じキーになる（いずれも「いいね」的な意味で合流させる）。
 */
export const FAVOURITE_KEY = "❤";

const VARIATION_SELECTOR_16 = "\u{FE0F}";

// Misskeyのカスタム絵文字名は英数字と _ + - のみ。host 省略・"@." はローカル絵文字を指す。
const CUSTOM_EMOJI_PATTERN = /^:([a-zA-Z0-9_+-]+)(?:@([a-zA-Z0-9.\-_]+))?:$/;

/** ":name@host:" 形式なら name/host を返す。Unicode絵文字なら null。 */
export function parseCustomEmojiKey(key: string): { name: string; host: string } | null {
  const matched = CUSTOM_EMOJI_PATTERN.exec(key);
  if (!matched) return null;
  const host = matched[2];
  // ホスト未解決（":name:" / ":name@.:"）は完全修飾キーではないため呼び出し側で正規化させる
  if (!host || host === ".") return null;
  return { name: matched[1], host };
}

/** 完全修飾されたカスタム絵文字キーか */
export function isCustomEmojiKey(key: string): boolean {
  return parseCustomEmojiKey(key) !== null;
}

/** Unicode絵文字を内部キーに正規化する（異体字セレクタ除去） */
export function normalizeUnicodeEmoji(emoji: string): string {
  return emoji.replaceAll(VARIATION_SELECTOR_16, "");
}

/**
 * 生のリアクション表記を内部キーに正規化する。
 *
 * @param raw          Misskey の reactions キー / notes/reactions の type / ピッカーの選択値
 * @param serverDomain raw の取得元ドメイン（オーナー or viewer）。":name:" / ":name@.:" の
 *                     ホスト解決に使う
 */
export function normalizeReactionKey(raw: string, serverDomain: string): string {
  const trimmed = raw.trim();
  const matched = CUSTOM_EMOJI_PATTERN.exec(trimmed);
  if (matched) {
    const host = matched[2];
    const resolved = !host || host === "." ? serverDomain.toLowerCase() : host.toLowerCase();
    return `:${matched[1]}@${resolved}:`;
  }
  return normalizeUnicodeEmoji(trimmed);
}

/**
 * 内部キーを Misskey へ送るリアクション表記に戻す。
 * 自サーバーのカスタム絵文字は ":name:" でしか受け付けられないため、ホストを落とす。
 */
export function toMisskeyReaction(key: string, viewerDomain: string): string {
  const parsed = parseCustomEmojiKey(key);
  if (!parsed) return key;
  if (parsed.host === viewerDomain.toLowerCase()) return `:${parsed.name}:`;
  return `:${parsed.name}@${parsed.host}:`;
}

/** notes/show の reactionEmojis のキー（"name@host"）を内部キーに直す */
export function reactionEmojisKeyToInternal(key: string, serverDomain: string): string {
  return normalizeReactionKey(`:${key}:`, serverDomain);
}

// 既定でテキスト表示になる絵文字（❤ / ⁉ / ☺ など）は、異体字セレクタが無いと
// 環境によってモノクロの記号として描かれる。Extended_Pictographic かつ
// Emoji_Presentation でない単一コードポイントがそれにあたる。
const SINGLE_PICTOGRAPH = /^\p{Extended_Pictographic}$/u;
const EMOJI_PRESENTATION = /^\p{Emoji_Presentation}$/u;

/** 表示用の文字列に直す（正規化で落とした異体字セレクタを必要なぶんだけ補う） */
export function toDisplayEmoji(key: string): string {
  if (isCustomEmojiKey(key)) return key;
  // FAVOURITE_KEY(❤) もこの分岐で ❤️ に補われる（単体では記号表示になる絵文字のため）
  if (SINGLE_PICTOGRAPH.test(key) && !EMOJI_PRESENTATION.test(key)) {
    return key + VARIATION_SELECTOR_16;
  }
  return key;
}

/**
 * ユーザーが選択できる Unicode 絵文字か（絵文字1個ちょうどであること）。
 */
export function isSelectableUnicodeEmoji(value: string): boolean {
  if (CUSTOM_EMOJI_PATTERN.test(value)) return false;
  if (countGraphemes(value) !== 1) return false;
  return isEmojiGrapheme(value);
}
