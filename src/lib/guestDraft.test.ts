import { describe, it, expect } from "vitest";
import { GUEST_DRAFT_TTL_MS, isGuestDraftExpired } from "./guestDraft";

// IndexedDB を触る保存/読み出し自体は unit 対象外（環境モックのコスト過多）。
// TTL 判定だけは純粋関数に切り出してあるのでここで押さえる。
describe("isGuestDraftExpired", () => {
  const NOW = 1_700_000_000_000;

  it("退避直後は期限内", () => {
    expect(isGuestDraftExpired(NOW, NOW)).toBe(false);
  });

  it("TTL ちょうどはまだ期限内（境界は超過してから捨てる）", () => {
    expect(isGuestDraftExpired(NOW - GUEST_DRAFT_TTL_MS, NOW)).toBe(false);
  });

  it("TTL を1msでも超えたら期限切れ", () => {
    expect(isGuestDraftExpired(NOW - GUEST_DRAFT_TTL_MS - 1, NOW)).toBe(true);
  });

  it("ログイン往復の上限（10分）より長く保つ＝モーダル滞在ぶんの余裕がある", () => {
    expect(isGuestDraftExpired(NOW - 10 * 60 * 1000, NOW)).toBe(false);
  });

  it("savedAt が無い（TTL導入前のレコード）は期限切れ扱い", () => {
    expect(isGuestDraftExpired(undefined, NOW)).toBe(true);
    expect(isGuestDraftExpired(null, NOW)).toBe(true);
  });

  it("savedAt が数値でない・不正な値も期限切れ扱い", () => {
    expect(isGuestDraftExpired("2026-07-28", NOW)).toBe(true);
    expect(isGuestDraftExpired(NaN, NOW)).toBe(true);
    expect(isGuestDraftExpired(Infinity, NOW)).toBe(true);
  });

  it("端末時計が巻き戻って savedAt が未来でも期限内として扱う（誤って捨てない）", () => {
    expect(isGuestDraftExpired(NOW + 60 * 60 * 1000, NOW)).toBe(false);
  });
});
