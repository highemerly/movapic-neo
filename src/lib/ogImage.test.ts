import { describe, it, expect, vi, afterEach } from "vitest";

// MEDIA_PROXY_BASE_URL はモジュール読込時に評価されるため、env を差し替えてから
// resetModules → 動的 import で読み直す。
async function load(proxyBase: string) {
  vi.resetModules();
  vi.stubEnv("MEDIA_PROXY_BASE_URL", proxyBase);
  return import("./ogImage");
}

const PROXY = "https://delivery.example.com";
const AVIF = "https://media.example.com/2026/07/09/abc.avif";
const JPEG = "https://media.example.com/2026/07/09/abc.jpg";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getOgImageUrl", () => {
  it("AVIF ＋ プロキシ設定あり → ogp モードの WebP プロキシURLに変換する", async () => {
    const { getOgImageUrl } = await load(PROXY);
    expect(getOgImageUrl(AVIF, "image/avif")).toBe(
      `${PROXY}/proxy/image.webp?url=${encodeURIComponent(AVIF)}&ogp=1&fallback`
    );
  });

  it("元URLは encodeURIComponent される（クエリ付きでも壊れない）", async () => {
    const { getOgImageUrl } = await load(PROXY);
    const withQuery = "https://media.example.com/a.avif?v=1&x=2";
    const out = getOgImageUrl(withQuery, "image/avif");
    // ネストした url= の中身は完全にエスケープされ、外側の &ogp=1&fallback と混ざらない
    expect(out).toBe(
      `${PROXY}/proxy/image.webp?url=${encodeURIComponent(withQuery)}&ogp=1&fallback`
    );
    expect(out).toContain("%3Fv%3D1%26x%3D2");
  });

  it("JPEG は X がそのまま表示できるので変換しない（元URLを返す）", async () => {
    const { getOgImageUrl } = await load(PROXY);
    expect(getOgImageUrl(JPEG, "image/jpeg")).toBe(JPEG);
  });

  it("AVIF でもプロキシ未設定なら元URLを返す（既存動線を壊さない）", async () => {
    const { getOgImageUrl } = await load("");
    expect(getOgImageUrl(AVIF, "image/avif")).toBe(AVIF);
  });
});

describe("buildOgImage", () => {
  it("AVIF ＋ プロキシあり → WebP プロキシURL・type=image/webp・寸法は付けない", async () => {
    const { buildOgImage } = await load(PROXY);
    const img = buildOgImage({
      url: AVIF,
      mimeType: "image/avif",
      alt: "説明",
      width: 2048,
      height: 1536,
    });
    expect(img).toEqual({
      url: `${PROXY}/proxy/image.webp?url=${encodeURIComponent(AVIF)}&ogp=1&fallback`,
      alt: "説明",
      type: "image/webp",
    });
    // サイズ決定はプロキシ側に委ねるため width/height は載せない
    expect(img).not.toHaveProperty("width");
    expect(img).not.toHaveProperty("height");
  });

  it("JPEG → 元URLそのまま・寸法と type を付ける", async () => {
    const { buildOgImage } = await load(PROXY);
    expect(
      buildOgImage({
        url: JPEG,
        mimeType: "image/jpeg",
        alt: "説明",
        width: 1200,
        height: 800,
      })
    ).toEqual({
      url: JPEG,
      width: 1200,
      height: 800,
      alt: "説明",
      type: "image/jpeg",
    });
  });

  it("AVIF でもプロキシ未設定なら元AVIFのまま寸法・type を付ける（変換フォールバック）", async () => {
    const { buildOgImage } = await load("");
    expect(
      buildOgImage({
        url: AVIF,
        mimeType: "image/avif",
        alt: "説明",
        width: 2048,
        height: 1536,
      })
    ).toEqual({
      url: AVIF,
      width: 2048,
      height: 1536,
      alt: "説明",
      type: "image/avif",
    });
  });

  it("width/height が未指定・0・null のときはキーを付けない", async () => {
    const { buildOgImage } = await load(PROXY);
    const noDims = buildOgImage({ url: JPEG, mimeType: "image/jpeg", alt: "a" });
    expect(noDims).not.toHaveProperty("width");
    expect(noDims).not.toHaveProperty("height");

    const zeroDims = buildOgImage({
      url: JPEG,
      mimeType: "image/jpeg",
      alt: "a",
      width: 0,
      height: 0,
    });
    expect(zeroDims).not.toHaveProperty("width");
    expect(zeroDims).not.toHaveProperty("height");
  });
});

describe("DEFAULT_OG_IMAGE", () => {
  it("public/og-image.png（1200×630）を指す", async () => {
    const { DEFAULT_OG_IMAGE } = await load(PROXY);
    expect(DEFAULT_OG_IMAGE).toEqual({
      url: "/og-image.png",
      width: 1200,
      height: 630,
      alt: "SHAMEZO",
    });
  });
});
