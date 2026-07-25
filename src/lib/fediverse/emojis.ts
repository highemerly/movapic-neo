/**
 * Misskey インスタンスのカスタム絵文字カタログ。
 *
 * 用途は3つ:
 *  - リアクションピッカーの候補（Misskeyユーザーは自サーバーの絵文字を押せる）
 *  - リアクション設定時の実在検証（任意の文字列を保存させない）
 *  - リアクション同期時のローカル絵文字URL解決
 *    （notes/show の reactionEmojis はリモート絵文字のURLしか載せないため、
 *     ":name@ownerDomain:" のURLはオーナーインスタンスのこの一覧からしか引けない）
 *
 * 大規模インスタンスでは巨大になる（misskey.io で13,000件・3MB）ため、
 * DBキャッシュ（Instance.emojisCache）の上にプロセス内メモ化を重ねている。
 * sharp/skia には触れないため worker-front から呼んでも安全。
 */

import { Prisma } from "@prisma/client";
import prisma from "@/lib/db";
import { USER_AGENT } from "@/lib/userAgent";
import { parseCustomEmojiKey } from "@/lib/reactions/emojiKey";

/** カタログ1件分（/api/emojis の要素から必要なフィールドだけ残したもの） */
export interface CustomEmoji {
  name: string;
  url: string;
  category: string | null;
  aliases: string[];
}

export interface EmojiCatalog {
  emojis: CustomEmoji[];
  byName: Map<string, CustomEmoji>;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
// 数MBのレスポンスを受け切る必要があるため、他のFediverse呼び出し（4秒）より長く取る
const FETCH_TIMEOUT_MS = 20000;

interface RawEmoji {
  name?: string;
  url?: string;
  category?: string | null;
  aliases?: string[];
}

/**
 * インスタンスのカスタム絵文字一覧を取得する。
 * Misskey の /api/emojis は未認証GETで読める（レスポンスは { emojis: [...] }）。
 */
export async function fetchMisskeyEmojis(domain: string): Promise<CustomEmoji[]> {
  const response = await fetch(`https://${domain}/api/emojis`, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`failed to fetch emojis from ${domain}: ${response.status}`);
  }
  const data = (await response.json()) as { emojis?: RawEmoji[] };
  const emojis: CustomEmoji[] = [];
  for (const raw of data.emojis ?? []) {
    if (!raw.name || !raw.url) continue;
    emojis.push({
      name: raw.name,
      url: raw.url,
      category: raw.category || null,
      // 空文字だけの aliases を返すインスタンスがあるため、検索の邪魔にならないよう落とす
      aliases: (raw.aliases ?? []).filter((a) => a.trim() !== ""),
    });
  }
  return emojis;
}

function buildCatalog(emojis: CustomEmoji[]): EmojiCatalog {
  const byName = new Map<string, CustomEmoji>();
  for (const emoji of emojis) byName.set(emoji.name, emoji);
  return { emojis, byName };
}

// プロセス内メモ化。DBに入っている JSON をリクエストのたびにパースし直すと、
// 大規模インスタンスでは数十msから百ms規模の無駄になる。最終同期時刻が同じなら中身も同じ。
const memo = new Map<string, { key: string; catalog: EmojiCatalog }>();

function memoKey(syncedAt: Date | null): string {
  return syncedAt?.toISOString() ?? "none";
}

async function persist(instanceId: string, emojis: CustomEmoji[]): Promise<void> {
  await prisma.instance.update({
    where: { id: instanceId },
    data: {
      emojisCache: emojis as unknown as Prisma.InputJsonValue,
      emojisSyncedAt: new Date(),
    },
  });
}

/**
 * ドメインの絵文字カタログを返す。Misskey以外・未登録インスタンスは null。
 *
 * TTL（24時間）切れなら取得し直してDBへ保存する。取得に失敗しても手元にキャッシュがあれば
 * それを返す（絵文字一覧が一時的に古いことより、ピッカーや同期が止まるほうが困るため）。
 */
export async function getInstanceEmojiCatalog(
  domain: string
): Promise<EmojiCatalog | null> {
  // 先に軽い列だけ引いて鮮度を見る（emojisCache は数MBあり、無条件に読むと重い）
  const meta = await prisma.instance.findUnique({
    where: { domain },
    select: { id: true, type: true, emojisSyncedAt: true },
  });
  if (!meta || meta.type !== "misskey") return null;

  const fresh =
    meta.emojisSyncedAt !== null &&
    Date.now() - meta.emojisSyncedAt.getTime() < CACHE_TTL_MS;

  if (fresh) {
    const cached = memo.get(meta.id);
    const key = memoKey(meta.emojisSyncedAt);
    if (cached?.key === key) return cached.catalog;

    const row = await prisma.instance.findUnique({
      where: { id: meta.id },
      select: { emojisCache: true },
    });
    const emojis = (row?.emojisCache as unknown as CustomEmoji[] | null) ?? [];
    const catalog = buildCatalog(emojis);
    memo.set(meta.id, { key, catalog });
    return catalog;
  }

  try {
    const emojis = await fetchMisskeyEmojis(domain);
    await persist(meta.id, emojis);
    const catalog = buildCatalog(emojis);
    memo.set(meta.id, { key: memoKey(new Date()), catalog });
    return catalog;
  } catch (error) {
    console.error(`[emojis] fetch failed: domain=${domain}`, error);
    if (meta.emojisSyncedAt === null) return null;
    const row = await prisma.instance.findUnique({
      where: { id: meta.id },
      select: { emojisCache: true },
    });
    const emojis = (row?.emojisCache as unknown as CustomEmoji[] | null) ?? [];
    return buildCatalog(emojis);
  }
}

/**
 * オーナーインスタンスのローカルカスタム絵文字のURLを補う。
 *
 * notes/show の reactionEmojis に載るのはリモート絵文字だけなので、
 * ":name@ownerDomain:" のURLはここで解決する。他ホストの絵文字は reactionEmojis 側で
 * URLが付いているため、任意のサーバーへ問い合わせに行くことはしない。
 */
export async function resolveLocalEmojiUrls(
  keys: string[],
  ownerDomain: string
): Promise<Record<string, string>> {
  const localNames = new Map<string, string>(); // name → 内部キー
  for (const key of keys) {
    const parsed = parseCustomEmojiKey(key);
    if (parsed && parsed.host === ownerDomain.toLowerCase()) {
      localNames.set(parsed.name, key);
    }
  }
  if (localNames.size === 0) return {};

  const catalog = await getInstanceEmojiCatalog(ownerDomain);
  if (!catalog) return {};

  const urls: Record<string, string> = {};
  for (const [name, key] of localNames) {
    const emoji = catalog.byName.get(name);
    if (emoji) urls[key] = emoji.url;
  }
  return urls;
}

export interface EmojiSearchParams {
  /** 名前・エイリアスの部分一致（小文字化して比較） */
  query?: string;
  category?: string;
  limit: number;
}

/**
 * カタログを絞り込む。全件をクライアントへ配ると数MBになるため、
 * ピッカーへは必ずこの結果（数十件）だけを返す。
 */
export function searchEmojis(
  catalog: EmojiCatalog,
  params: EmojiSearchParams
): { emojis: CustomEmoji[]; total: number } {
  const query = params.query?.trim().toLowerCase();
  const matched: CustomEmoji[] = [];
  for (const emoji of catalog.emojis) {
    if (params.category !== undefined && emoji.category !== params.category) continue;
    if (query) {
      const hit =
        emoji.name.toLowerCase().includes(query) ||
        emoji.aliases.some((a) => a.toLowerCase().includes(query));
      if (!hit) continue;
    }
    matched.push(emoji);
  }
  return { emojis: matched.slice(0, params.limit), total: matched.length };
}

/** カテゴリ一覧（絵文字が1つ以上あるもの）。ピッカーのタブに使う。 */
export function listEmojiCategories(catalog: EmojiCatalog): string[] {
  const categories = new Set<string>();
  for (const emoji of catalog.emojis) {
    if (emoji.category) categories.add(emoji.category);
  }
  return [...categories].sort();
}

/**
 * カスタム絵文字をカテゴリごとに区切る（1画面スクロール表示用）。
 * カテゴリ未設定は「その他」にまとめる。件数が多いインスタンス対策として全体で limit を掛け、
 * 打ち切ったかどうかを truncated で返す（silent cap を避ける）。
 */
export function groupEmojisByCategory(
  catalog: EmojiCatalog,
  limit: number
): {
  sections: { category: string; emojis: CustomEmoji[] }[];
  truncated: boolean;
} {
  const OTHER = "その他";
  const byCategory = new Map<string, CustomEmoji[]>();
  for (const emoji of catalog.emojis) {
    const key = emoji.category || OTHER;
    const list = byCategory.get(key);
    if (list) list.push(emoji);
    else byCategory.set(key, [emoji]);
  }

  // カテゴリ名順（「その他」は末尾）
  const names = [...byCategory.keys()].sort((a, b) => {
    if (a === OTHER) return 1;
    if (b === OTHER) return -1;
    return a.localeCompare(b, "ja");
  });

  const sections: { category: string; emojis: CustomEmoji[] }[] = [];
  let remaining = limit;
  let truncated = false;
  for (const name of names) {
    if (remaining <= 0) {
      truncated = true;
      break;
    }
    const all = byCategory.get(name)!;
    const take = all.slice(0, remaining);
    if (take.length < all.length) truncated = true;
    sections.push({ category: name, emojis: take });
    remaining -= take.length;
  }
  return { sections, truncated };
}
