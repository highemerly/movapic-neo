/**
 * Unicode 絵文字のカタログ（リアクションピッカーの候補）。
 *
 * emojibase の日本語データ（ラベル・検索タグ付き）を土台に、カテゴリ分け＋日本語検索できる
 * 一覧を組み立てる。データは 750KB 超あるためプロセス内で1回だけ構築してメモ化する
 * （Misskeyカスタム絵文字カタログと同じ発想）。
 *
 * サーバー専用（API ルートとテストからのみ import）。データがクライアントバンドルに
 * 混ざらないよう、UI からは palette API 経由でしか触らないこと。
 */

import type { Emoji } from "emojibase";
import rawData from "emojibase-data/ja/data.json";
import { normalizeUnicodeEmoji } from "./emojiKey";

export interface UnicodeEmojiEntry {
  /** 内部キー（異体字セレクタ除去済み・Reaction テーブルと突合する形） */
  key: string;
  /** 表示・検索用の生の絵文字（異体字セレクタ付き） */
  display: string;
  label: string;
  tags: string[];
  /** emojibase の group 番号 */
  group: number;
}

// emojibase の group 番号 → 日本語カテゴリ名。
// group 2（component: 肌色修飾子など単体で使わないもの）と undefined（地域指標）は対象外。
// emojibase 同梱の訳語は一部不自然（activities→「有効化」等）なので自前で付ける。
const GROUP_LABELS: Record<number, string> = {
  0: "スマイリー・感情",
  1: "人・からだ",
  3: "動物・自然",
  4: "食べ物・飲み物",
  5: "旅行・場所",
  6: "アクティビティ",
  7: "もの",
  8: "記号",
  9: "旗",
};

/** カテゴリID（palette API で使う）。Unicode は "unicode:<group>"。 */
export function unicodeCategoryId(group: number): string {
  return `unicode:${group}`;
}

let catalogCache: UnicodeEmojiEntry[] | null = null;

function buildCatalog(): UnicodeEmojiEntry[] {
  const entries: UnicodeEmojiEntry[] = [];
  for (const emoji of rawData as Emoji[]) {
    if (emoji.group === undefined || GROUP_LABELS[emoji.group] === undefined) continue;
    entries.push({
      key: normalizeUnicodeEmoji(emoji.emoji),
      display: emoji.emoji,
      label: emoji.label,
      tags: emoji.tags ?? [],
      group: emoji.group,
    });
  }
  return entries;
}

function getCatalog(): UnicodeEmojiEntry[] {
  if (!catalogCache) catalogCache = buildCatalog();
  return catalogCache;
}

// 各カテゴリのジャンプボタンに使う代表絵文字。
const GROUP_ICONS: Record<number, string> = {
  0: "😀",
  1: "👋",
  3: "🐱",
  4: "🍔",
  5: "✈️",
  6: "⚽",
  7: "💡",
  8: "❤️",
  9: "🏁",
};

/** カテゴリ一覧（表示順）。ピッカーのタブ・ジャンプナビに使う。 */
export function listUnicodeCategories(): { id: string; label: string; icon: string }[] {
  return Object.entries(GROUP_LABELS)
    .map(([group, label]) => ({ group: Number(group), label }))
    .sort((a, b) => a.group - b.group)
    .map(({ group, label }) => ({
      id: unicodeCategoryId(group),
      label,
      icon: GROUP_ICONS[group],
    }));
}

/**
 * カテゴリごとに区切った全 Unicode 絵文字（1画面スクロール表示用）。
 * 全カテゴリ分を一度に返すが、1900件程度なので許容。
 */
export function listUnicodeSections(): {
  id: string;
  label: string;
  icon: string;
  emojis: { key: string; display: string; label: string }[];
}[] {
  const byGroup = new Map<number, { key: string; display: string; label: string }[]>();
  for (const entry of getCatalog()) {
    const list = byGroup.get(entry.group);
    const item = { key: entry.key, display: entry.display, label: entry.label };
    if (list) list.push(item);
    else byGroup.set(entry.group, [item]);
  }
  return listUnicodeCategories().map((category) => {
    const group = Number(category.id.slice("unicode:".length));
    return { ...category, emojis: byGroup.get(group) ?? [] };
  });
}

export interface UnicodeSearchParams {
  /** 名前・タグの部分一致（小文字化して比較） */
  query?: string;
  /** "unicode:<group>" 形式のカテゴリID */
  categoryId?: string;
  limit: number;
}

/**
 * Unicode 絵文字を絞り込む。全 1900 件超をそのまま返すとピッカーが重いので、
 * 検索・カテゴリで絞った limit 件だけを返す。
 */
export function searchUnicodeEmojis(
  params: UnicodeSearchParams
): { emojis: UnicodeEmojiEntry[]; total: number } {
  const query = params.query?.trim().toLowerCase();
  const group =
    params.categoryId && params.categoryId.startsWith("unicode:")
      ? Number(params.categoryId.slice("unicode:".length))
      : undefined;

  const matched: UnicodeEmojiEntry[] = [];
  for (const entry of getCatalog()) {
    if (group !== undefined && entry.group !== group) continue;
    if (query) {
      const hit =
        entry.label.toLowerCase().includes(query) ||
        entry.tags.some((tag) => tag.toLowerCase().includes(query)) ||
        entry.display.includes(query);
      if (!hit) continue;
    }
    matched.push(entry);
  }
  return { emojis: matched.slice(0, params.limit), total: matched.length };
}
