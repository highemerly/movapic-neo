import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// 境界（セッション・管理者判定のenv・DB・ストレージ・カタログのメモ）をモックする。
// 管理者ゲートの組み立て（shared.ts）と parse 系・emojiKey は純粋なので本物を通す。
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/auth/admin", () => ({ isAdmin: vi.fn() }));
vi.mock("@/lib/db", () => ({
  default: {
    customEmoji: { update: vi.fn(), findUnique: vi.fn(), delete: vi.fn() },
    reaction: { count: vi.fn() },
  },
}));
vi.mock("@/lib/storage/storage", () => ({ deleteImage: vi.fn() }));
vi.mock("@/lib/reactions/customEmoji", () => ({
  invalidateShamezoEmojiCatalog: vi.fn(),
  // shared.ts が読むため、モックでも実体と同じものを持たせる。
  EMOJI_NAME_PATTERN: /^[a-zA-Z0-9_+-]{1,64}$/,
}));

import { PATCH, DELETE } from "./route";
import { getCurrentUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/admin";
import { deleteImage } from "@/lib/storage/storage";
import { invalidateShamezoEmojiCatalog } from "@/lib/reactions/customEmoji";
import { shamezoEmojiKey } from "@/lib/reactions/emojiKey";
import prisma from "@/lib/db";

const mockGetUser = vi.mocked(getCurrentUser);
const mockIsAdmin = vi.mocked(isAdmin);
const mockUpdate = vi.mocked(prisma.customEmoji.update);
const mockFindUnique = vi.mocked(prisma.customEmoji.findUnique);
const mockDelete = vi.mocked(prisma.customEmoji.delete);
const mockReactionCount = vi.mocked(prisma.reaction.count);
const mockDeleteImage = vi.mocked(deleteImage);
const mockInvalidate = vi.mocked(invalidateShamezoEmojiCatalog);

type SessionUser = Awaited<ReturnType<typeof getCurrentUser>>;
const ADMIN = {
  id: "u1",
  username: "root",
  instance: { domain: "handon.club" },
} as unknown as SessionUser;

const params = (id = "e1") => ({ params: Promise.resolve({ id }) });

function patchReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/v1/admin/emojis/e1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function deleteReq(): NextRequest {
  return new NextRequest("http://localhost/api/v1/admin/emojis/e1", { method: "DELETE" });
}

/** PATCH が実際に prisma へ渡した data を取り出す。 */
function updatedData(): Record<string, unknown> {
  return (mockUpdate.mock.calls[0][0] as { data: Record<string, unknown> }).data;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue(ADMIN);
  mockIsAdmin.mockReturnValue(true);
  mockUpdate.mockResolvedValue({ id: "e1" } as never);
  mockFindUnique.mockResolvedValue({ name: "neko", storageKey: "emoji/neko.png" } as never);
  mockDelete.mockResolvedValue({} as never);
  mockReactionCount.mockResolvedValue(0);
  mockDeleteImage.mockResolvedValue(undefined as never);
});

describe("PATCH /api/v1/admin/emojis/[id]", () => {
  it("非管理者には404を返して存在を隠す", async () => {
    mockIsAdmin.mockReturnValue(false);

    const res = await PATCH(patchReq({ enabled: false }), params());

    expect(res.status).toBe(404);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("未ログインも404", async () => {
    mockGetUser.mockResolvedValue(null as unknown as SessionUser);
    mockIsAdmin.mockReturnValue(false);

    const res = await PATCH(patchReq({ enabled: false }), params());

    expect(res.status).toBe(404);
    // acct を組み立てられないので null で判定される
    expect(mockIsAdmin).toHaveBeenCalledWith(null);
  });

  it("管理者判定には username@domain を渡す", async () => {
    await PATCH(patchReq({ enabled: false }), params());

    expect(mockIsAdmin).toHaveBeenCalledWith("root@handon.club");
  });

  it("壊れたJSONは400", async () => {
    const res = await PATCH(patchReq("{壊れている"), params());

    expect(res.status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("更新項目が無ければ400", async () => {
    const res = await PATCH(patchReq({}), params());

    expect(res.status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("enabled が真偽値でなければ400", async () => {
    const res = await PATCH(patchReq({ enabled: "false" }), params());

    expect(res.status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("enabled=false で無効化できる（soft-disable）", async () => {
    const res = await PATCH(patchReq({ enabled: false }), params());

    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "e1" }, data: { enabled: false } })
    );
  });

  it("送られたキーだけを部分更新する（未指定は触らない）", async () => {
    await PATCH(patchReq({ category: "動物" }), params());

    expect(updatedData()).toEqual({ category: "動物" });
  });

  it("category は trim され、空文字なら null になる", async () => {
    await PATCH(patchReq({ category: "   " }), params());

    expect(updatedData()).toEqual({ category: null });
  });

  it("aliases はカンマ・空白区切りで配列になる", async () => {
    await PATCH(patchReq({ aliases: "cat, kitty  neko" }), params());

    expect(updatedData()).toEqual({ aliases: ["cat", "kitty", "neko"] });
  });

  it("aliases が文字列でなければ空配列にする", async () => {
    await PATCH(patchReq({ aliases: ["cat"] }), params());

    expect(updatedData()).toEqual({ aliases: [] });
  });

  it("license を後から編集できる", async () => {
    await PATCH(patchReq({ license: "  CC BY 4.0  " }), params());

    expect(updatedData()).toEqual({ license: "CC BY 4.0" });
  });

  it("複数フィールドを同時に更新できる", async () => {
    await PATCH(patchReq({ enabled: true, category: "動物", license: "" }), params());

    expect(updatedData()).toEqual({ enabled: true, category: "動物", license: null });
  });

  it("対象が存在しなければ404（更新が失敗しても500にしない）", async () => {
    mockUpdate.mockRejectedValue(new Error("record not found"));

    const res = await PATCH(patchReq({ enabled: false }), params());

    expect(res.status).toBe(404);
    expect(mockInvalidate).not.toHaveBeenCalled();
  });

  it("更新に成功したらカタログのメモを捨てる", async () => {
    await PATCH(patchReq({ enabled: false }), params());

    expect(mockInvalidate).toHaveBeenCalled();
  });
});

describe("DELETE /api/v1/admin/emojis/[id]", () => {
  it("非管理者には404を返して存在を隠す", async () => {
    mockIsAdmin.mockReturnValue(false);

    const res = await DELETE(deleteReq(), params());

    expect(res.status).toBe(404);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("対象が存在しなければ404", async () => {
    mockFindUnique.mockResolvedValue(null as never);

    const res = await DELETE(deleteReq(), params());

    expect(res.status).toBe(404);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("使用中かどうかは SHAMEZO のキー形式で数える", async () => {
    await DELETE(deleteReq(), params());

    expect(mockReactionCount).toHaveBeenCalledWith({
      where: { emoji: shamezoEmojiKey("neko") },
    });
  });

  it("既にリアクションで使われていたら削除せず400（チップが壊れるため）", async () => {
    mockReactionCount.mockResolvedValue(3);

    const res = await DELETE(deleteReq(), params());

    expect(res.status).toBe(400);
    expect(mockDelete).not.toHaveBeenCalled();
    expect(mockDeleteImage).not.toHaveBeenCalled();
  });

  it("未使用なら DB を消してからストレージ実体を消す", async () => {
    const order: string[] = [];
    // Prisma のメソッド型は Prisma__Client を要求するため、実装は never で通す。
    mockDelete.mockImplementation((async () => {
      order.push("db");
      return {};
    }) as never);
    mockDeleteImage.mockImplementation(async () => {
      order.push("storage");
    });

    const res = await DELETE(deleteReq(), params());

    expect(res.status).toBe(200);
    expect(order).toEqual(["db", "storage"]);
    expect(mockDeleteImage).toHaveBeenCalledWith("emoji/neko.png");
    expect(mockInvalidate).toHaveBeenCalled();
  });

  it("ストレージ削除に失敗しても成功として返す（DBを正とする）", async () => {
    mockDeleteImage.mockRejectedValue(new Error("s3 down"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await DELETE(deleteReq(), params());

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true });
    errorSpy.mockRestore();
  });

  it("DB削除が失敗したら500（ストレージは触らない）", async () => {
    mockDelete.mockRejectedValue(new Error("db down"));

    const res = await DELETE(deleteReq(), params());

    expect(res.status).toBe(500);
    expect(mockDeleteImage).not.toHaveBeenCalled();
  });
});
