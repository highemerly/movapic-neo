import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/avatar", () => ({ getEmojiImageUrl: vi.fn((u: string | null) => (u ? `proxy:${u}` : null)) }));
vi.mock("@/lib/fediverse/emojis", async (orig) => {
  const actual = await orig<typeof import("@/lib/fediverse/emojis")>();
  // グルーピング・検索は純ロジックなので本物を使い、カタログ取得だけ遮断する
  return { ...actual, getInstanceEmojiCatalog: vi.fn() };
});

import { GET } from "./route";
import { getCurrentUser } from "@/lib/auth/session";
import { getInstanceEmojiCatalog, type CustomEmoji } from "@/lib/fediverse/emojis";

const mockGetUser = vi.mocked(getCurrentUser);
const mockCatalog = vi.mocked(getInstanceEmojiCatalog);

type Viewer = Awaited<ReturnType<typeof getCurrentUser>>;
const viewerOf = (type: "mastodon" | "misskey") =>
  ({
    username: "bob",
    instance: { type, domain: "viewer.example" },
  }) as unknown as Viewer;

const emoji = (name: string, category: string | null, aliases: string[] = []): CustomEmoji => ({
  name,
  url: `https://viewer.example/emoji/${name}.webp`,
  category,
  aliases,
});

function catalogOf(emojis: CustomEmoji[]) {
  return { emojis, byName: new Map(emojis.map((e) => [e.name, e])) };
}

const req = (query = "") =>
  new NextRequest(`http://localhost/api/v1/reactions/palette${query}`);

async function json(res: Response): Promise<Record<string, unknown>> {
  return res.json();
}

type Section = { id: string; label: string; icon: string | null; iconUrl: string | null; emojis: { key: string }[] };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/reactions/palette - 初期表示（全セクション）", () => {
  it("未ログインは 401", async () => {
    mockGetUser.mockResolvedValue(null);
    expect((await GET(req())).status).toBe(401);
  });

  it("Mastodonユーザーには Unicode 9セクションを返す（カスタムなし）", async () => {
    mockGetUser.mockResolvedValue(viewerOf("mastodon"));
    const res = await GET(req());
    // env変更やカスタム追加が届くよう短いキャッシュにしている
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=60");
    const body = await json(res);
    const sections = body.sections as Section[];
    expect(sections).toHaveLength(9);
    expect(sections.every((s) => s.id.startsWith("unicode:"))).toBe(true);
    // 各Unicodeセクションはジャンプ用の代表絵文字を持つ
    expect(sections[0].icon).toBeTruthy();
    expect(mockCatalog).not.toHaveBeenCalled();
  });

  it("Misskeyユーザーはカスタムセクションを先頭に、続けて Unicode セクションを返す", async () => {
    mockGetUser.mockResolvedValue(viewerOf("misskey"));
    mockCatalog.mockResolvedValue(
      catalogOf([emoji("ai", "キャラ"), emoji("blobcat", "動物"), emoji("noraneko", null)])
    );

    const sections = (await json(await GET(req()))).sections as Section[];
    // カスタムカテゴリ（名前順、未分類は「その他」で末尾）→ Unicode の順
    expect(sections[0]).toMatchObject({ id: "custom:キャラ", label: "キャラ" });
    // カスタムのジャンプアイコンは画像URL
    expect(sections[0].iconUrl).toBe("proxy:https://viewer.example/emoji/ai.webp");
    const customSections = sections.filter((s) => s.id.startsWith("custom:"));
    expect(customSections.map((s) => s.label)).toEqual(["キャラ", "動物", "その他"]);
    expect(sections.filter((s) => s.id.startsWith("unicode:"))).toHaveLength(9);
  });

  it("カスタム絵文字のキーはドメイン付き完全修飾で返す", async () => {
    mockGetUser.mockResolvedValue(viewerOf("misskey"));
    mockCatalog.mockResolvedValue(catalogOf([emoji("ai", "キャラ")]));
    const sections = (await json(await GET(req()))).sections as Section[];
    expect(sections[0].emojis[0].key).toBe(":ai@viewer.example:");
  });
});

describe("GET /api/v1/reactions/palette - 横断検索", () => {
  it("日本語で Unicode 絵文字を検索できる", async () => {
    mockGetUser.mockResolvedValue(viewerOf("mastodon"));
    const body = await json(await GET(req("?q=猫")));
    const emojis = body.emojis as { key: string }[];
    expect(emojis.some((e) => e.key.includes("🐱") || e.key.includes("🐈"))).toBe(true);
  });

  it("Misskeyユーザーの検索はカスタム絵文字を先頭に、Unicode も混ぜて返す", async () => {
    mockGetUser.mockResolvedValue(viewerOf("misskey"));
    mockCatalog.mockResolvedValue(catalogOf([emoji("neko", null, ["猫"])]));

    const body = await json(await GET(req("?q=猫")));
    const emojis = body.emojis as { key: string; imageUrl: string | null }[];
    expect(emojis[0].key).toBe(":neko@viewer.example:");
    expect(emojis.some((e) => e.imageUrl === null)).toBe(true);
  });
});
