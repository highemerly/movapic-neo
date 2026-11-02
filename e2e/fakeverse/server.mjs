// E2E 用の偽 Fediverse サーバー（Mastodon / Misskey）。
// SHAMEZO がログインと投稿で呼ぶエンドポイントだけを、Host ヘッダーで振り分けて返す。
// 受けたリクエストは記録し、テストは管理用の HTTP（:8080）から取り出して中身を確かめる。
//
// SHAMEZO はサーバーを https:// 固定・ポートなしで呼ぶので、443 で TLS を張る
// （証明書は gen-certs.sh が作り、アプリ側は NODE_EXTRA_CA_CERTS で CA を信頼する）。
// 依存を増やさないため Node 標準だけで書く（multipart は Request#formData で読む）。
import { createServer as createHttpsServer } from "node:https";
import { createServer as createHttpServer } from "node:http";
import { readFileSync } from "node:fs";

const MASTODON_HOST = "mastodon.test";
const MISSKEY_HOST = "misskey.test";
const ACCOUNT = { id: "100", username: "e2e", name: "E2E User" };

/** @type {Array<Record<string, unknown>>} */
const received = [];
let seq = 0;

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

// 記録用にボディを要約する（ファイルは種類・サイズ・名前だけ残す）。
async function summarizeBody(req, body) {
  const type = req.headers["content-type"] ?? "";
  if (type.startsWith("application/json")) return { json: JSON.parse(body.toString() || "{}") };
  if (type.startsWith("application/x-www-form-urlencoded")) {
    return { form: Object.fromEntries(new URLSearchParams(body.toString())) };
  }
  if (type.startsWith("multipart/form-data")) {
    const form = await new Request("http://local/", { method: "POST", headers: { "content-type": type }, body }).formData();
    const fields = {};
    const files = {};
    for (const [key, value] of form.entries()) {
      if (typeof value === "string") fields[key] = value;
      else files[key] = { type: value.type, size: value.size, name: value.name };
    }
    return { fields, files };
  }
  return {};
}

function send(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(payload));
}

function mastodon(method, path, body) {
  if (method === "GET" && path === "/api/v1/instance") return [200, { title: "Fake Mastodon", version: "4.4.0" }];
  if (method === "POST" && path === "/api/v1/apps") {
    return [200, { id: "1", name: "SHAMEZO", client_id: "e2e-client-id", client_secret: "e2e-client-secret" }];
  }
  if (method === "POST" && path === "/oauth/token") {
    return [200, { access_token: "e2e-mastodon-token", token_type: "Bearer", scope: "read write", created_at: 0 }];
  }
  if (method === "GET" && path === "/api/v1/accounts/verify_credentials") {
    return [200, { id: ACCOUNT.id, username: ACCOUNT.username, display_name: ACCOUNT.name, avatar: "" }];
  }
  // url を返す＝処理済み（200）。SHAMEZO は url が無いときだけ GET /api/v1/media/:id をポーリングする。
  if (method === "POST" && path === "/api/v2/media") {
    const id = `media-${++seq}`;
    return [200, { id, type: "image", url: `https://${MASTODON_HOST}/media/${id}` }];
  }
  if (method === "POST" && path === "/api/v1/statuses") {
    const id = `status-${++seq}`;
    return [200, { id, url: `https://${MASTODON_HOST}/@${ACCOUNT.username}/${id}`, visibility: body.json?.visibility }];
  }
  // 画像の詳細ページを開くとリアクション同期が走る。404 を返すと「連合先で消えた」扱いになるので、0件で返す。
  if (method === "GET" && /^\/api\/v1\/statuses\/[^/]+$/.test(path)) return [200, { id: path.split("/").pop(), favourites_count: 0 }];
  if (method === "GET" && /^\/api\/v1\/statuses\/[^/]+\/favourited_by$/.test(path)) return [200, []];
  return null;
}

function misskey(method, path, body) {
  // Mastodon 判定（GET /api/v1/instance）に 404 を返すと、SHAMEZO は Misskey 判定へ進む。
  if (method === "POST" && path === "/api/meta") return [200, { name: "Fake Misskey", version: "2025.10.0" }];
  if (method === "POST" && /^\/api\/miauth\/[^/]+\/check$/.test(path)) {
    return [200, { ok: true, token: "e2e-misskey-token", user: { id: ACCOUNT.id, username: ACCOUNT.username, name: ACCOUNT.name, avatarUrl: null } }];
  }
  if (method === "POST" && path === "/api/drive/files/create") return [200, { id: `file-${++seq}` }];
  if (method === "POST" && path === "/api/notes/create") {
    return [200, { createdNote: { id: `note-${++seq}`, text: body.json?.text, visibility: body.json?.visibility } }];
  }
  // リアクション同期（Mastodon 側のコメント参照）。
  if (method === "POST" && path === "/api/notes/show") return [200, { id: body.json?.noteId, reactions: {}, reactionEmojis: {} }];
  if (method === "POST" && path === "/api/notes/reactions") return [200, []];
  return null;
}

const tlsOptions = {
  key: readFileSync(process.env.TLS_KEY ?? "/certs/server-key.pem"),
  cert: readFileSync(process.env.TLS_CERT ?? "/certs/server.pem"),
};

createHttpsServer(tlsOptions, async (req, res) => {
  const host = (req.headers.host ?? "").split(":")[0];
  const url = new URL(req.url ?? "/", `https://${host}`);
  const body = await summarizeBody(req, await readBody(req));
  received.push({ host, method: req.method, path: url.pathname, authorization: req.headers.authorization ?? null, ...body });

  const handler = host === MASTODON_HOST ? mastodon : host === MISSKEY_HOST ? misskey : null;
  const result = handler?.(req.method, url.pathname, body);
  // 想定外の呼び出しは 404 にする（記録には残るので、テストの失敗時に何が呼ばれたか分かる）。
  if (!result) return send(res, 404, { error: "not implemented in fakeverse" });
  send(res, result[0], result[1]);
}).listen(443);

// テスト用の管理口（TLS なし・コンテナ外へ公開する）。
createHttpServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://local");
  if (url.pathname === "/health") return send(res, 200, { ok: true });
  if (url.pathname === "/__e2e/received") {
    const host = url.searchParams.get("host");
    return send(res, 200, host ? received.filter((r) => r.host === host) : received);
  }
  send(res, 404, {});
}).listen(8080);

console.log("[fakeverse] listening on :443 (TLS) and :8080 (admin)");
