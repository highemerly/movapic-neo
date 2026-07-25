/**
 * リアクションピッカーの候補
 * GET /api/v1/reactions/palette          … 全絵文字をカテゴリ区切りのセクションで返す
 * GET /api/v1/reactions/palette?q=<query> … 名前・タグ横断検索（絞り込み結果を1つのリストで）
 *
 * 絵文字は2系統:
 *  - Misskeyカスタム絵文字（自サーバーの /api/emojis・Misskeyユーザーのみ・先に並べる）
 *  - Unicode絵文字（emojibaseの日本語カタログ・全ユーザー共通）
 * ピッカーは1画面スクロールで、セクション見出しと左のジャンプナビに sections を使う。
 * 大規模インスタンス対策としてカスタム絵文字は全体で上限を掛け、打ち切りは truncated で伝える。
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getEmojiImageUrl } from "@/lib/avatar";
import { ErrorCodes, errorResponse, handleUnknownError } from "@/lib/errors";
import {
  getInstanceEmojiCatalog,
  groupEmojisByCategory,
  searchEmojis,
  type CustomEmoji,
  type EmojiCatalog,
} from "@/lib/fediverse/emojis";
import {
  groupShamezoEmojisByCategory,
  listShamezoEmojis,
  searchShamezoEmojis,
  type ShamezoEmoji,
} from "@/lib/reactions/customEmoji";
import { shamezoEmojiKey } from "@/lib/reactions/emojiKey";
import {
  listUnicodeSections,
  searchUnicodeEmojis,
} from "@/lib/reactions/unicodeCatalog";

// 検索結果の最大件数
const SEARCH_LIMIT = 80;
// カスタム絵文字を1画面に載せる上限（超過分は検索に誘導）
const CUSTOM_SECTION_LIMIT = 1500;

const CUSTOM_PREFIX = "custom:";
const SHAMEZO_PREFIX = "shamezo:";

interface PaletteItem {
  key: string;
  imageUrl: string | null;
  label: string;
}

interface PaletteSection {
  id: string;
  label: string;
  /** ジャンプナビのアイコン。Unicodeは絵文字、カスタムは画像URL */
  icon: string | null;
  iconUrl: string | null;
  emojis: PaletteItem[];
}

function toUnicodeItem(entry: { key: string; label: string }): PaletteItem {
  return { key: entry.key, imageUrl: null, label: entry.label };
}

function customItem(emoji: CustomEmoji, host: string): PaletteItem {
  return {
    key: `:${emoji.name}@${host}:`,
    imageUrl: getEmojiImageUrl(emoji.url),
    label: emoji.name,
  };
}

// SHAMEZO 独自絵文字は自前ストレージ配信＝プロキシを通さず imageUrl をそのまま渡す
function shamezoItem(emoji: ShamezoEmoji): PaletteItem {
  return {
    key: shamezoEmojiKey(emoji.name),
    imageUrl: emoji.imageUrl,
    label: emoji.name,
  };
}

export async function GET(request: NextRequest) {
  try {
    const viewer = await getCurrentUser();
    if (!viewer) {
      return errorResponse(ErrorCodes.AUTH_REQUIRED, "認証が必要です", 401, {
        suggestion: "ログインしてください",
      });
    }

    // env 変更やカスタム絵文字の追加が届かないと混乱するため、キャッシュは短くする。
    const headers = { "Cache-Control": "private, max-age=60" };

    const isMisskey = viewer.instance.type === "misskey";
    const host = viewer.instance.domain.toLowerCase();
    const catalog: EmojiCatalog | null = isMisskey
      ? await getInstanceEmojiCatalog(viewer.instance.domain)
      : null;
    // SHAMEZO 独自絵文字は Mastodon ユーザー向け（Misskey は自サーバー絵文字を連合送信できるが
    // SHAMEZO 絵文字は連合に送れないため対象外。favorite.ts / docs/favorite.md 参照）。
    const shamezoEmojis: ShamezoEmoji[] = isMisskey ? [] : await listShamezoEmojis();

    // ── 検索: SHAMEZO→(Misskeyカスタム)→Unicode の順に、1つのリストで返す ──
    const query = request.nextUrl.searchParams.get("q")?.trim();
    if (query) {
      const items: PaletteItem[] = [];
      let total = 0;
      if (shamezoEmojis.length > 0) {
        const shamezo = searchShamezoEmojis(shamezoEmojis, query, SEARCH_LIMIT);
        items.push(...shamezo.emojis.map(shamezoItem));
        total += shamezo.total;
      }
      if (catalog) {
        const custom = searchEmojis(catalog, { query, limit: SEARCH_LIMIT });
        items.push(...custom.emojis.map((emoji) => customItem(emoji, host)));
        total += custom.total;
      }
      const unicode = searchUnicodeEmojis({ query, limit: SEARCH_LIMIT });
      items.push(...unicode.emojis.map(toUnicodeItem));
      total += unicode.total;
      return NextResponse.json(
        {
          success: true,
          platform: viewer.instance.type,
          emojis: items.slice(0, SEARCH_LIMIT),
          total,
        },
        { headers }
      );
    }

    // ── 初期表示: 全絵文字をセクションで返す ──
    const sections: PaletteSection[] = [];
    let truncated = false;
    // SHAMEZO 独自絵文字を先頭に（Mastodon ユーザーのみ・自前登録なので巨大化せず打ち切り不要）
    for (const section of groupShamezoEmojisByCategory(shamezoEmojis)) {
      sections.push({
        id: `${SHAMEZO_PREFIX}${section.category}`,
        label: section.category,
        icon: null,
        iconUrl: section.emojis[0]?.imageUrl ?? null,
        emojis: section.emojis.map(shamezoItem),
      });
    }
    if (catalog) {
      const grouped = groupEmojisByCategory(catalog, CUSTOM_SECTION_LIMIT);
      truncated = grouped.truncated;
      for (const section of grouped.sections) {
        sections.push({
          id: `${CUSTOM_PREFIX}${section.category}`,
          label: section.category,
          icon: null,
          iconUrl: getEmojiImageUrl(section.emojis[0]?.url ?? null),
          emojis: section.emojis.map((emoji) => customItem(emoji, host)),
        });
      }
    }
    for (const section of listUnicodeSections()) {
      sections.push({
        id: section.id,
        label: section.label,
        icon: section.icon,
        iconUrl: null,
        emojis: section.emojis.map(toUnicodeItem),
      });
    }

    return NextResponse.json(
      { success: true, platform: viewer.instance.type, sections, truncated },
      { headers }
    );
  } catch (error) {
    return handleUnknownError(error);
  }
}
