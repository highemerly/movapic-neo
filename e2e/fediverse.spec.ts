import { readFileSync } from "node:fs";
import path from "node:path";
import { test, expect, type Page } from "@playwright/test";

// 偽 Fediverse サーバー（fakeverse/server.mjs）相手に、ログイン → 投稿 → 届いた中身を確かめる。
// 画面操作はしない（ページ内の fetch と page.goto だけ）。ログインの Cookie は本番イメージでは
// Secure 付きになるので、localhost を安全な接続として扱うブラウザに Cookie を任せる。

const FAKEVERSE_ADMIN = "http://localhost:58080";
// 投稿ページは先に /api/v1/generate で文字入れ済みの AVIF を作り、それを /api/v1/post に送る
// （投稿 API は受け取った画像をそのまま保存する）。generated.avif はその生成結果（photo.jpg から作成）。
// ここで generate を呼ばないのは、IP 単位の回数制限（10秒に2回）を smoke.spec.ts と取り合うため。
const IMAGE = readFileSync(path.join(__dirname, "fixtures", "generated.avif")).toString("base64");

type Received = {
  host: string;
  method: string;
  path: string;
  authorization: string | null;
  json?: Record<string, unknown>;
  fields?: Record<string, string>;
  files?: Record<string, { type: string; size: number; name: string }>;
};

const PLATFORMS = [
  {
    name: "Mastodon",
    host: "mastodon.test",
    output: "mastodon",
    // 認可画面は通さず、認可 URL の redirect_uri と state からコールバックを直接開く
    // （偽サーバーの token エンドポイントは任意の code を受け付ける）。
    callbackUrl: (authUrl: URL) => {
      const callback = new URL(authUrl.searchParams.get("redirect_uri")!);
      callback.searchParams.set("code", "e2e-code");
      callback.searchParams.set("state", authUrl.searchParams.get("state")!);
      return callback.toString();
    },
    mediaPath: "/api/v2/media",
    postPath: "/api/v1/statuses",
    // 保存は AVIF だが Mastodon へは JPEG に変換して送る（docs/posting.md「出力形式」）。
    mediaType: "image/jpeg",
    visibility: "unlisted",
    token: (r: Received) => r.authorization,
    expectedToken: "Bearer e2e-mastodon-token",
  },
  {
    name: "Misskey",
    host: "misskey.test",
    output: "misskey",
    // MiAuth は callback パラメーターにセッション ID と署名入りのコールバック URL がそのまま入っている。
    callbackUrl: (authUrl: URL) => authUrl.searchParams.get("callback")!,
    mediaPath: "/api/drive/files/create",
    postPath: "/api/notes/create",
    mediaType: "image/avif",
    // SHAMEZO の unlisted は Misskey では home。
    visibility: "home",
    token: (r: Received) => r.fields?.i ?? null,
    expectedToken: "e2e-misskey-token",
  },
] as const;

/** ページ内から same-origin の fetch を呼ぶ（Cookie はブラウザが扱う）。 */
async function fetchInPage(page: Page, url: string, init: { method: string; json?: unknown; form?: Record<string, string>; imageBase64?: string }) {
  return page.evaluate(async ({ url, init }) => {
    let body: BodyInit | undefined;
    const headers: Record<string, string> = {};
    if (init.json !== undefined) {
      body = JSON.stringify(init.json);
      headers["Content-Type"] = "application/json";
    } else if (init.form) {
      const form = new FormData();
      for (const [k, v] of Object.entries(init.form)) form.append(k, v);
      if (init.imageBase64) {
        const bytes = Uint8Array.from(atob(init.imageBase64), (c) => c.charCodeAt(0));
        // 投稿ページと同じく、ファイル名を付けない Blob で送る。
        form.append("image", new Blob([bytes], { type: "image/avif" }));
      }
      body = form;
    }
    const res = await fetch(url, { method: init.method, headers, body });
    return { status: res.status, body: await res.json().catch(() => null) };
  }, { url, init });
}

/** 偽サーバーのアカウントでログインする（認可画面は通さない）。 */
async function login(page: Page, p: (typeof PLATFORMS)[number]) {
  await page.goto("/");
  const reg = await fetchInPage(page, "/api/auth/fediverse/register", { method: "POST", json: { server: p.host } });
  expect(reg.status, JSON.stringify(reg.body)).toBe(200);
  expect(reg.body.platform).toBe(p.name.toLowerCase());
  await page.goto(p.callbackUrl(new URL(reg.body.url)));
  // 失敗時は /?error=... へ戻される
  expect(new URL(page.url()).searchParams.get("error")).toBeNull();
}

/** ページを開き、200 で表示され、未捕捉の JS 例外と CSP 違反が出ないことを確かめる（smoke.spec.ts と同じ基準）。 */
async function expectPageOk(page: Page, pagePath: string) {
  const problems: string[] = [];
  const onError = (err: Error) => problems.push(`pageerror: ${err.message}`);
  const onConsole = (msg: { type(): string; text(): string }) => {
    if (msg.type() === "error" && msg.text().includes("Content Security Policy")) {
      problems.push(`csp: ${msg.text()}`);
    }
  };
  page.on("pageerror", onError);
  page.on("console", onConsole);
  const res = await page.goto(pagePath, { waitUntil: "load" });
  page.off("pageerror", onError);
  page.off("console", onConsole);
  expect(res?.status(), pagePath).toBe(200);
  expect(problems, pagePath).toEqual([]);
}

for (const p of PLATFORMS) {
  test(`${p.name}: ログインして投稿すると、変換済みの画像と本文が届く`, async ({ page, request }) => {
    await login(page, p);

    const receivedNow = async (): Promise<Received[]> =>
      (await request.get(`${FAKEVERSE_ADMIN}/__e2e/received?host=${p.host}`)).json();
    // 偽サーバーの記録は手元で繰り返し回すと溜まるので、投稿前の件数から先だけを見る。
    const before = (await receivedNow()).length;

    // 投稿（ログインしていなければ 401 になる＝ログインの確認も兼ねる）
    const text = `E2E ${p.name} ${Date.now()}`;
    const post = await fetchInPage(page, "/api/v1/post", {
      method: "POST",
      form: {
        text,
        position: "top",
        font: "hui-font",
        color: "white",
        size: "medium",
        arrangement: "none",
        output: p.output,
        visibility: "unlisted",
      },
      imageBase64: IMAGE,
    });
    expect(post.status, JSON.stringify(post.body)).toBe(200);
    const imageId: string = post.body.imageId;
    expect(imageId).toBeTruthy();

    // 偽サーバーに届いたもの
    const received = (await receivedNow()).slice(before);
    const media = received.filter((r) => r.path === p.mediaPath);
    const posts = received.filter((r) => r.path === p.postPath);
    expect(media).toHaveLength(1);
    expect(media[0].files?.file.type).toBe(p.mediaType);
    expect(media[0].files?.file.size).toBeGreaterThan(0);
    // DB に暗号化して保存したトークンが、復号されてそのまま相手に渡っている
    expect(p.token(media[0])).toBe(p.expectedToken);
    expect(posts).toHaveLength(1);
    expect(String(posts[0].json?.text ?? posts[0].json?.status)).toContain(text);
    expect(posts[0].json?.visibility).toBe(p.visibility);

    // 投稿した画像の詳細ページ（ホームサーバー未設定なので username@domain）
    const detail = await page.goto(`/u/e2e@${p.host}/status/${imageId}`);
    expect(detail?.status()).toBe(200);
  });
}

// 日付の区切り（docs/features.md「日付の区切り」）。ログインが要るページと API を、投稿と同じ本番イメージで通す。
// 区切りの規則そのものは unit（dayClock.test.ts）で見ているので、ここは配線（マイグレーション済みの DB・
// 本人だけのページ）が本番イメージで動くかだけを見る。
test("日付の区切りを変えられ、設定とカレンダーのページが表示できる", async ({ page }) => {
  const p = PLATFORMS[0];
  await login(page, p);

  const res = await fetchInPage(page, "/api/v1/me/day-boundary", { method: "PUT", json: { hour: 2 } });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  // 変更は翌日から効く＝今日の区切りは変わらず、予約として返る（手元で繰り返し回しても最後の予約は 2 時）。
  expect(res.body.upcoming.at(-1)).toMatchObject({ hour: 2 });

  await expectPageOk(page, "/settings");
  await expectPageOk(page, `/u/e2e@${p.host}/calendar`);
});
