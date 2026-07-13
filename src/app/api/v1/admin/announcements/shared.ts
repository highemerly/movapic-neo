import { getCurrentUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/admin";
import { ANNOUNCEMENT_TYPES, type AnnouncementType } from "@/lib/announcements";

/** 現在のログインユーザーが管理者かを返す（非管理者には存在を隠す＝404用）。 */
export async function isRequestAdmin(): Promise<boolean> {
  const currentUser = await getCurrentUser();
  const acct = currentUser
    ? `${currentUser.username}@${currentUser.instance.domain}`
    : null;
  return isAdmin(acct);
}

export type AnnouncementInput = {
  type: AnnouncementType;
  message: string;
  detail: string | null;
  publishAt: Date;
  pinnedUntil: Date | null;
};

/** 任意文字列を trim し、空なら null にする。 */
function toNullableString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

/** ISO 文字列等を Date にパースし、不正なら null。 */
function toDate(v: unknown): Date | null {
  if (typeof v !== "string" || v.trim() === "") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Admin フォーム/API の入力を検証して正規化する。
 * 不正時は { error } を返す（呼び出し側で 400 を返す）。
 */
export function parseAnnouncementInput(
  body: unknown
): { data: AnnouncementInput } | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>;

  const type = b.type;
  if (
    typeof type !== "string" ||
    !(ANNOUNCEMENT_TYPES as string[]).includes(type)
  ) {
    return { error: "type は warning / info / low のいずれかを指定してください" };
  }

  const message = toNullableString(b.message);
  if (!message) {
    return { error: "message は必須です" };
  }

  const publishAt = toDate(b.publishAt);
  if (!publishAt) {
    return { error: "publishAt（公開予定日時）が不正です" };
  }

  // pinnedUntil は任意。指定があれば妥当な日時であること。
  let pinnedUntil: Date | null = null;
  if (b.pinnedUntil != null && b.pinnedUntil !== "") {
    pinnedUntil = toDate(b.pinnedUntil);
    if (!pinnedUntil) {
      return { error: "pinnedUntil（バナー掲載終了日時）が不正です" };
    }
  }

  return {
    data: {
      type: type as AnnouncementType,
      message,
      detail: toNullableString(b.detail),
      publishAt,
      pinnedUntil,
    },
  };
}
