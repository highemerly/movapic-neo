import { describe, it, expect, vi, afterEach } from "vitest";

// MEDIA_PROXY_BASE_URL はモジュール読込時に評価されるため、env を差し替えてから
// resetModules → 動的 import で読み直す（ogImage.test.ts と同方針）。
async function load(proxyBase: string) {
  vi.resetModules();
  vi.stubEnv("MEDIA_PROXY_BASE_URL", proxyBase);
  return import("./avatar");
}

const PROXY = "https://delivery.example.com";
const FEDI_EMOJI = "https://misskey.io/emoji/ai.png";
const SHAMEZO_EMOJI = "https://s3.example.com/emoji/uuid.png";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getReactionEmojiImageUrl", () => {
  it("Fediverse インスタンスの絵文字はメディアプロキシ経由にする", async () => {
    const { getReactionEmojiImageUrl } = await load(PROXY);
    expect(getReactionEmojiImageUrl(":ai@misskey.io:", FEDI_EMOJI)).toBe(
      `${PROXY}/proxy/image.webp?url=${encodeURIComponent(FEDI_EMOJI)}&emoji=1&fallback`
    );
  });

  it("SHAMEZO 独自絵文字はプロキシを通さず URL をそのまま返す（アニメ保持）", async () => {
    const { getReactionEmojiImageUrl } = await load(PROXY);
    expect(getReactionEmojiImageUrl(":wktk@shamezo:", SHAMEZO_EMOJI)).toBe(SHAMEZO_EMOJI);
  });

  it("URL が無ければ null", async () => {
    const { getReactionEmojiImageUrl } = await load(PROXY);
    expect(getReactionEmojiImageUrl(":wktk@shamezo:", null)).toBeNull();
  });
});
