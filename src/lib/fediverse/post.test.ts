/**
 * postToMastodon / postToMisskey の代替テキスト（ALT）とリプライ先の配管のユニットテスト。
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

// 実装は往復ログのために headers / clone() も読むため、モックにも持たせる。
function jsonResponse(data: unknown, status = 200): Response {
  const res = {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => data,
    text: async () => JSON.stringify(data),
    clone: () => res,
  };
  return res as unknown as Response;
}

/**
 * URL ごとにモック応答を返し、メディアアップロード（v2/media・drive/files/create）の
 * FormData と、status / note 作成の JSON body（送信順）を捕捉する fetch を global に差し込む。
 * Mastodon の v2/media は status=200 かつ url ありにして完了ポーリングを飛ばす。
 * createResponses を渡すと、status / note 作成の応答を呼び出し順に差し替える（足りない分は成功）。
 */
function installFetch(createResponses: Response[] = []) {
  const captured: { mediaForm?: FormData; createBodies: Record<string, unknown>[] } = {
    createBodies: [],
  };
  const queue = [...createResponses];
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/api/v2/media")) {
      captured.mediaForm = init!.body as FormData;
      return jsonResponse({ id: "media-1", url: "https://cdn.example/x.avif" }, 200);
    }
    if (url.includes("/api/v1/statuses")) {
      captured.createBodies.push(JSON.parse(init!.body as string));
      return queue.shift() ?? jsonResponse({ id: "status-1", url: "https://mastodon.example/@u/1" }, 200);
    }
    if (url.includes("/api/drive/files/create")) {
      captured.mediaForm = init!.body as FormData;
      return jsonResponse({ id: "file-1" }, 200);
    }
    if (url.includes("/api/notes/create")) {
      captured.createBodies.push(JSON.parse(init!.body as string));
      return queue.shift() ?? jsonResponse({ createdNote: { id: "note-1" } }, 200);
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

function callMastodon(altText?: string, replyToId?: string | null) {
  return postToMastodon({
    server: "mastodon.example",
    accessToken: "token",
    imageBuffer: IMG,
    mimeType: "image/avif",
    filename: "x.avif",
    statusText: "本文",
    imageUrl: "",
    visibility: "public",
    altText,
    replyToId,
  });
}

function callMisskey(altText?: string, replyToId?: string | null) {
  return postToMisskey({
    server: "misskey.example",
    accessToken: "token",
    imageBuffer: IMG,
    mimeType: "image/avif",
    filename: "x.avif",
    statusText: "本文",
    imageUrl: "",
    visibility: "home",
    altText,
    replyToId,
  });
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

describe("postToMastodon のリプライ先 (in_reply_to_id)", () => {
  it("replyToId を in_reply_to_id として送る", async () => {
    const cap = installFetch();
    const result = await callMastodon(undefined, "parent-1");
    expect(result.success).toBe(true);
    expect(result.replyDropped).toBeUndefined();
    expect(cap.createBodies).toHaveLength(1);
    expect(cap.createBodies[0].in_reply_to_id).toBe("parent-1");
  });

  it("未指定なら in_reply_to_id キー自体を載せない", async () => {
    const cap = installFetch();
    await callMastodon(undefined, null);
    expect(cap.createBodies[0]).not.toHaveProperty("in_reply_to_id");
  });

  it("返信先が無い(404)なら同じメディアで返信なしに1回だけ送り直し replyDropped を返す", async () => {
    const cap = installFetch([jsonResponse({ error: "Record not found" }, 404)]);
    const result = await callMastodon(undefined, "gone-1");
    expect(result.success).toBe(true);
    expect(result.replyDropped).toBe(true);
    expect(cap.createBodies).toHaveLength(2);
    expect(cap.createBodies[1]).not.toHaveProperty("in_reply_to_id");
    expect(cap.createBodies[1].media_ids).toEqual(cap.createBodies[0].media_ids);
  });

  it("返信先と無関係な失敗(422)では送り直さない", async () => {
    const cap = installFetch([jsonResponse({ error: "Validation failed" }, 422)]);
    const result = await callMastodon(undefined, "parent-1");
    expect(result.success).toBe(false);
    expect(result.statusCode).toBe(422);
    expect(cap.createBodies).toHaveLength(1);
  });

  it("返信先なしの 404 は送り直さない", async () => {
    const cap = installFetch([jsonResponse({ error: "not found" }, 404)]);
    const result = await callMastodon(undefined, null);
    expect(result.success).toBe(false);
    expect(cap.createBodies).toHaveLength(1);
  });
});

describe("postToMisskey のリプライ先 (replyId)", () => {
  it("replyToId を replyId として送る", async () => {
    const cap = installFetch();
    const result = await callMisskey(undefined, "note-parent");
    expect(result.success).toBe(true);
    expect(cap.createBodies[0].replyId).toBe("note-parent");
  });

  it("未指定なら replyId キー自体を載せない", async () => {
    const cap = installFetch();
    await callMisskey(undefined, undefined);
    expect(cap.createBodies[0]).not.toHaveProperty("replyId");
  });

  it.each(["NO_SUCH_REPLY_TARGET", "CANNOT_REPLY_TO_AN_INVISIBLE_NOTE", "YOU_HAVE_BEEN_BLOCKED"])(
    "返信先が原因の %s なら返信なしで1回だけ送り直し replyDropped を返す",
    async (code) => {
      const cap = installFetch([jsonResponse({ error: { code } }, 400)]);
      const result = await callMisskey(undefined, "note-parent");
      expect(result.success).toBe(true);
      expect(result.replyDropped).toBe(true);
      expect(cap.createBodies).toHaveLength(2);
      expect(cap.createBodies[1]).not.toHaveProperty("replyId");
      expect(cap.createBodies[1].fileIds).toEqual(["file-1"]);
    }
  );

  it("返信先と無関係な 400 では送り直さない", async () => {
    const cap = installFetch([jsonResponse({ error: { code: "INVALID_PARAM" } }, 400)]);
    const result = await callMisskey(undefined, "note-parent");
    expect(result.success).toBe(false);
    expect(cap.createBodies).toHaveLength(1);
  });
});
