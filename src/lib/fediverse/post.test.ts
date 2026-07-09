/**
 * postToMastodon / postToMisskey の代替テキスト（ALT）配管のユニットテスト。
 *
 * 実 Fediverse には出さず global.fetch をモックし、メディアアップロード時の FormData に
 * ALT が正しく載るかを検証する。設計上の不変条件:
 *   - Mastodon: メディアの `description` に無加工で載せる（上限 ~1500 字・切り詰めない）。
 *   - Misskey:  ドライブの `comment` に載せるが 512 字で切り詰める。
 *   - どちらも未設定（undefined / 空文字）なら送らない。
 * この配管が全経路（web/email/mention）の投稿で効くため、ここで一括検証する。
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { postToMastodon, postToMisskey } from "@/lib/fediverse/post";

function jsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
  } as unknown as Response;
}

/**
 * URL ごとにモック応答を返し、メディアアップロード（v2/media・drive/files/create）の
 * FormData を捕捉する fetch を global に差し込む。
 * Mastodon の v2/media は status=200 かつ url ありにして完了ポーリングを飛ばす。
 */
function installFetch() {
  const captured: { mediaForm?: FormData } = {};
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/api/v2/media")) {
      captured.mediaForm = init!.body as FormData;
      return jsonResponse({ id: "media-1", url: "https://cdn.example/x.avif" }, 200);
    }
    if (url.includes("/api/v1/statuses")) {
      return jsonResponse({ id: "status-1", url: "https://mastodon.example/@u/1" }, 200);
    }
    if (url.includes("/api/drive/files/create")) {
      captured.mediaForm = init!.body as FormData;
      return jsonResponse({ id: "file-1" }, 200);
    }
    if (url.includes("/api/notes/create")) {
      return jsonResponse({ createdNote: { id: "note-1" } }, 200);
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return captured;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const IMG = Buffer.from("fake-image-bytes");

function callMastodon(altText?: string) {
  return postToMastodon(
    "mastodon.example",
    "token",
    IMG,
    "image/avif",
    "x.avif",
    "本文",
    "",
    "public",
    altText
  );
}

function callMisskey(altText?: string) {
  return postToMisskey(
    "misskey.example",
    "token",
    IMG,
    "image/avif",
    "x.avif",
    "本文",
    "",
    "home",
    altText
  );
}

describe("postToMastodon の ALT (description)", () => {
  it("altText をそのまま description に載せる", async () => {
    const cap = installFetch();
    const result = await callMastodon("公園のベンチに座る茶色い猫");
    expect(result.success).toBe(true);
    expect(cap.mediaForm?.get("description")).toBe("公園のベンチに座る茶色い猫");
  });

  it("512字を超えても切り詰めない（Mastodonは~1500字許容）", async () => {
    const cap = installFetch();
    const alt = "あ".repeat(2000);
    await callMastodon(alt);
    const desc = cap.mediaForm?.get("description") as string;
    expect(desc).toBe(alt);
    expect(desc.length).toBe(2000);
  });

  it("未設定（undefined）なら description を送らない", async () => {
    const cap = installFetch();
    await callMastodon(undefined);
    expect(cap.mediaForm?.get("description")).toBeNull();
  });

  it("空文字なら description を送らない", async () => {
    const cap = installFetch();
    await callMastodon("");
    expect(cap.mediaForm?.get("description")).toBeNull();
  });
});

describe("postToMisskey の ALT (comment)", () => {
  it("altText を comment に載せる（512字以内はそのまま）", async () => {
    const cap = installFetch();
    const result = await callMisskey("公園のベンチに座る茶色い猫");
    expect(result.success).toBe(true);
    expect(cap.mediaForm?.get("comment")).toBe("公園のベンチに座る茶色い猫");
  });

  it("512字を超えたら先頭512字に切り詰める", async () => {
    const cap = installFetch();
    // 先頭512字=P、以降=Q。切り詰め後にQが残っていなければ「先頭512字」であることが保証される。
    const alt = "P".repeat(512) + "Q".repeat(200);
    await callMisskey(alt);
    const comment = cap.mediaForm?.get("comment") as string;
    expect(comment.length).toBe(512);
    expect(comment).toBe("P".repeat(512));
    expect(comment.includes("Q")).toBe(false);
  });

  it("ちょうど512字はそのまま", async () => {
    const cap = installFetch();
    const alt = "x".repeat(512);
    await callMisskey(alt);
    expect((cap.mediaForm?.get("comment") as string).length).toBe(512);
  });

  it("未設定（undefined）なら comment を送らない", async () => {
    const cap = installFetch();
    await callMisskey(undefined);
    expect(cap.mediaForm?.get("comment")).toBeNull();
  });

  it("空文字なら comment を送らない", async () => {
    const cap = installFetch();
    await callMisskey("");
    expect(cap.mediaForm?.get("comment")).toBeNull();
  });
});
