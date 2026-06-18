/**
 * 管理者（運営者）判定
 *
 * 管理者専用UIをDBフラグではなく環境変数で管理する（マイグレーション不要・誤付与防止）。
 * ADMIN_ACCTS にカンマ区切りで acct（username@domain）を列挙する。
 * 例: ADMIN_ACCTS=alice@handon.club,bob@example.com
 */

/** acct を正規化（前後空白・先頭@を除去し小文字化）。大文字小文字を無視して照合する。 */
function normalizeAcct(acct: string): string {
  return acct.trim().replace(/^@/, "").toLowerCase();
}

/** ADMIN_ACCTS をパースして管理者 acct の集合を返す */
function getAdminAcctSet(): Set<string> {
  const raw = process.env.ADMIN_ACCTS ?? "";
  return new Set(
    raw
      .split(",")
      .map(normalizeAcct)
      .filter(Boolean)
  );
}

/** 指定 acct（username@domain）が管理者か */
export function isAdmin(acct: string | null | undefined): boolean {
  if (!acct) return false;
  return getAdminAcctSet().has(normalizeAcct(acct));
}

/**
 * 管理者 acct の一覧（Bot通知の宛先用）。
 * 設定された値をそのまま DM 宛先（@username@domain）に使える。
 */
export function getAdminAccts(): string[] {
  return [...getAdminAcctSet()];
}
