import { getCurrentUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/admin";
import { EMOJI_NAME_PATTERN } from "@/lib/reactions/customEmoji";

/** 現在のログインユーザーが管理者かを返す（非管理者には存在を隠す＝404用）。 */
export async function isRequestAdmin(): Promise<boolean> {
  const currentUser = await getCurrentUser();
  const acct = currentUser
    ? `${currentUser.username}@${currentUser.instance.domain}`
    : null;
  return isAdmin(acct);
}

/** name を検証（Reaction キーの charset と一致）。不正なら理由を返す。 */
export function validateEmojiName(raw: unknown): { name: string } | { error: string } {
  if (typeof raw !== "string") return { error: "名前を指定してください" };
  const name = raw.trim();
  if (!EMOJI_NAME_PATTERN.test(name)) {
    return { error: "名前は英数字・_ + - のみ、64文字以内で指定してください" };
  }
  return { name };
}

/** カンマ/空白区切りのエイリアス文字列を配列に正規化する（空要素は落とす）。 */
export function parseAliases(raw: unknown): string[] {
  if (typeof raw !== "string") return [];
  return raw
    .split(/[,\s]+/)
    .map((a) => a.trim())
    .filter(Boolean)
    .slice(0, 20);
}

/** category を trim し、空なら null。 */
export function parseCategory(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const c = raw.trim().slice(0, 64);
  return c === "" ? null : c;
}

/** ライセンス表記（自由記述の任意メモ）を trim し、空なら null。 */
export function parseLicense(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const c = raw.trim().slice(0, 500);
  return c === "" ? null : c;
}
