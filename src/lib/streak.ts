// JSTの日付文字列 (YYYY-MM-DD) を返す
function toJstDateString(d: Date): string {
  return new Date(d.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// 投稿日のリストから現在の連続投稿日数を計算（JST基準）
// 今日または昨日に投稿があれば、そこから過去に向かって連続している日数を返す
export function calculateStreak(dates: Date[]): number {
  if (dates.length === 0) return 0;
  const dateSet = new Set(dates.map(toJstDateString));
  const todayStr = toJstDateString(new Date());
  let cursor: Date;
  if (dateSet.has(todayStr)) {
    cursor = new Date();
  } else {
    cursor = new Date(Date.now() - 24 * 60 * 60 * 1000);
    if (!dateSet.has(toJstDateString(cursor))) return 0;
  }
  let streak = 0;
  while (dateSet.has(toJstDateString(cursor))) {
    streak++;
    cursor = new Date(cursor.getTime() - 24 * 60 * 60 * 1000);
  }
  return streak;
}
