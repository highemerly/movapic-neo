import { addDays, type PostDate } from "@/lib/dayClock";

// JSTの日付文字列 (YYYY-MM-DD) を返す
export function toJstDateString(d: Date): string {
  return new Date(d.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// JSTの時 (0-23) を返す
export function toJstHour(d: Date): number {
  return new Date(d.getTime() + 9 * 60 * 60 * 1000).getUTCHours();
}

/**
 * 記録日のリストから、anchor の日（今日、または投稿時の評価ならその投稿の記録日）で終わる連続投稿日数。
 * anchor に投稿が無ければ前日から数える（今日まだ投稿していなくても、昨日までの連続は途切れていない）。
 * 日は記録日（Image.postDate）で数える＝日付の区切りが遅い人の深夜の投稿も、その人の「前の日」になる。
 */
export function calculateStreak(postDates: Iterable<PostDate>, anchor: PostDate): number {
  const dateSet = new Set(postDates);
  let cursor = dateSet.has(anchor) ? anchor : addDays(anchor, -1);
  let streak = 0;
  while (dateSet.has(cursor)) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}
