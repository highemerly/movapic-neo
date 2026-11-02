import { readFileSync } from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";

// ブラウザで開くだけのページ。ログイン不要で、DB が空でも表示できるもの。
const PAGES = ["/", "/public", "/create"];

for (const pagePath of PAGES) {
  test(`${pagePath} が 200 で表示され、JS 例外と CSP 違反が出ない`, async ({ page }) => {
    // コンソールのエラー全般は無害なものでも落ちるので見ない。拾うのは未捕捉の例外と CSP 違反だけ
    // （nonce が付かなくなるとスクリプトが全部止まるが、HTTP の応答は 200 のままで気づけない）。
    const problems: string[] = [];
    page.on("pageerror", (err) => problems.push(`pageerror: ${err.message}`));
    page.on("console", (msg) => {
      if (msg.type() === "error" && msg.text().includes("Content Security Policy")) {
        problems.push(`csp: ${msg.text()}`);
      }
    });

    const res = await page.goto(pagePath, { waitUntil: "load" });
    expect(res?.status()).toBe(200);
    expect(problems).toEqual([]);
  });
}

test("/api/health が 200 を返す", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  expect((await res.json()).ok).toBe(true);
});

// プレビュー生成を API で直接呼ぶ（画面操作はしない）。本番イメージの sharp が HEIC を
// デコードできるか（system libvips へのソースビルドが効いているか）・skia の描画・compute 呼び出しを通しで見る。
const FIXTURES = [
  { name: "photo.jpg", mimeType: "image/jpeg" },
  { name: "photo.heic", mimeType: "image/heic" },
];

for (const fixture of FIXTURES) {
  test(`ゲストのプレビュー生成が ${fixture.name} で通る`, async ({ request }) => {
    const res = await request.post("/api/v1/generate", {
      multipart: {
        image: {
          name: fixture.name,
          mimeType: fixture.mimeType,
          buffer: readFileSync(path.join(__dirname, "fixtures", fixture.name)),
        },
        text: "E2E",
        position: "top",
        font: "hui-font",
        color: "white",
        size: "medium",
        // ゲストと同じ値（連携先が未確定）。
        output: "none",
        arrangement: "none",
      },
    });
    expect(res.status(), await res.text().catch(() => "")).toBe(200);
    expect(res.headers()["content-type"]).toMatch(/^image\//);
  });
}
