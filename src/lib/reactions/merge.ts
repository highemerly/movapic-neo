/**
 * オーナーインスタンスのキャッシュと SHAMEZO の Reaction テーブルをマージして表示用の
 * リアクション（チップ・ユーザー一覧・閲覧者の状態）を組み立てる純粋ロジック。
 *
 * API レスポンス・画像詳細のSSR初期値・同期時の favoriteCount 再計算がこの1本を共有する
 * （表示とDBの件数がズレないようにするため）。
 */

import { FAVOURITE_KEY } from "./emojiKey";
import type {
  CachedFavoriter,
  MergedReactions,
  ReactionChip,
  ReactionTotalsCache,
  ReactionUser,
  StoredReaction,
} from "./types";

export interface MergeReactionsInput {
  /** オーナーインスタンス上の生の合計（Image.fediverseCount） */
  fediverseCount: number;
  /** 絵文字別カウントキャッシュ。null=リアクション機能導入前の画像 */
  totalsCache: ReactionTotalsCache | null;
  /** オーナーインスタンス由来の上位40件（Image.favoritersCache） */
  cachedFavoriters: CachedFavoriter[];
  /** SHAMEZO 上で押されたリアクション */
  storedReactions: StoredReaction[];
  /** 閲覧者の acct（未ログインは null） */
  viewerAcct: string | null;
}

function decrement(counts: Map<string, number>, key: string): void {
  const current = counts.get(key);
  if (current === undefined) return;
  if (current <= 1) counts.delete(key);
  else counts.set(key, current - 1);
}

function pushUser(
  users: Map<string, ReactionUser[]>,
  key: string,
  user: ReactionUser
): void {
  const list = users.get(key);
  if (list) list.push(user);
  else users.set(key, [user]);
}

function removeUser(
  users: Map<string, ReactionUser[]>,
  key: string,
  acct: string
): void {
  const list = users.get(key);
  if (!list) return;
  const index = list.findIndex((u) => u.acct === acct);
  if (index >= 0) list.splice(index, 1);
}

export function mergeReactions(input: MergeReactionsInput): MergedReactions {
  const { fediverseCount, totalsCache, cachedFavoriters, storedReactions, viewerAcct } =
    input;

  const counts = new Map<string, number>();
  const urls = new Map<string, string>();

  // 1. オーナーサーバー側の絵文字別カウント。キャッシュを持たない旧画像は種別が分からないため
  //    ❤ 1チップに寄せる（Mastodonオーナーは常にこの形になる）。
  if (totalsCache) {
    for (const [key, count] of Object.entries(totalsCache.totals)) {
      if (count > 0) counts.set(key, count);
    }
    for (const [key, url] of Object.entries(totalsCache.emojiUrls ?? {})) {
      urls.set(key, url);
    }
  } else if (fediverseCount > 0) {
    counts.set(FAVOURITE_KEY, fediverseCount);
  }

  // 2. 上位40件のキャッシュからユーザー一覧を組む
  const users = new Map<string, ReactionUser[]>();
  const cachedEmojiByAcct = new Map<string, string>();
  for (const favoriter of cachedFavoriters) {
    const key = favoriter.emoji ?? FAVOURITE_KEY;
    cachedEmojiByAcct.set(favoriter.acct, key);
    pushUser(users, key, {
      acct: favoriter.acct,
      displayName: favoriter.displayName,
      avatarUrl: favoriter.avatarUrl,
      profileUrl: favoriter.profileUrl,
    });
    if (favoriter.emojiImageUrl && !urls.has(key)) urls.set(key, favoriter.emojiImageUrl);
  }

  // 3. SHAMEZO 上のリアクションを重ねる。同じ人が両方に居たらこちらを正とする。
  //    Mastodonユーザーが👍を選んでも連合には favourite としてしか届かず、キャッシュ側では
  //    ❤（お気に入り）に見えている。押した本人の意図どおり👍で表示するための載せ替え。
  for (const reaction of storedReactions) {
    const cachedKey = cachedEmojiByAcct.get(reaction.acct);
    if (cachedKey !== undefined) {
      decrement(counts, cachedKey);
      removeUser(users, cachedKey, reaction.acct);
    }
    counts.set(reaction.emoji, (counts.get(reaction.emoji) ?? 0) + 1);
    pushUser(users, reaction.emoji, {
      acct: reaction.acct,
      displayName: reaction.displayName,
      avatarUrl: reaction.avatarUrl,
      profileUrl: reaction.profileUrl,
    });
    if (reaction.emojiImageUrl && !urls.has(reaction.emoji)) {
      urls.set(reaction.emoji, reaction.emojiImageUrl);
    }
  }

  const viewerStored =
    viewerAcct === null ? undefined : storedReactions.find((r) => r.acct === viewerAcct);
  const viewerEmoji =
    viewerAcct === null
      ? null
      : (viewerStored?.emoji ?? cachedEmojiByAcct.get(viewerAcct) ?? null);

  // 4. 件数降順のチップに整える。同数はキャッシュ→DBの登場順（Mapの挿入順）を保つ。
  const ordered = [...counts.entries()].map(([emoji, count], index) => ({
    emoji,
    count,
    index,
  }));
  ordered.sort((a, b) => b.count - a.count || a.index - b.index);

  const chips: ReactionChip[] = ordered.map(({ emoji, count }) => ({
    emoji,
    imageUrl: urls.get(emoji) ?? null,
    count,
    reactedByViewer: emoji === viewerEmoji,
  }));

  const usersByEmoji: Record<string, ReactionUser[]> = {};
  for (const chip of chips) {
    usersByEmoji[chip.emoji] = users.get(chip.emoji) ?? [];
  }

  // 合計はチップの総和にする。fediverseCount + 新規DB分でも同じ値になるが、キャッシュが
  // 古くて内訳と合計が食い違うとき、一覧の「＋N」と詳細のチップが食い違って見えるのを避ける。
  const total = chips.reduce((sum, chip) => sum + chip.count, 0);

  return { total, chips, usersByEmoji, viewerEmoji };
}

/**
 * マージ結果を「リアクションした人」のフラットな一覧に直す。
 * 通知の差分計算（誰が新しくリアクションしたか）は連合キャッシュだけでは足りず、
 * SHAMEZO 上のリアクションも含めた集合で見る必要があるため。
 */
export function toMergedFavoriters(merged: MergedReactions): CachedFavoriter[] {
  return merged.chips.flatMap((chip) =>
    (merged.usersByEmoji[chip.emoji] ?? []).map((user) => ({
      ...user,
      emoji: chip.emoji,
      emojiImageUrl: chip.imageUrl,
    }))
  );
}
