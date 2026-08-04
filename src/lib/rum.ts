/**
 * RUM（Real User Monitoring）ビーコンの配信元（env 読み取りの単一集約点）。
 *
 * - RUM_ORIGIN: コレクタのオリジン（例: https://rum.piyo.me）。未設定なら RUM 自体を無効化する。
 *
 * ビーコンの <script>（layout.tsx）と CSP の script-src（proxy.ts）の両方で同じ値が要る。
 * 片方だけ直すと「読み込もうとして CSP で落ちる」状態になるため、必ずここを経由する。
 *
 * 有効/無効は RUM_ORIGIN の有無だけで決める（NODE_ENV では見ない）。ローカル開発で撃つと
 * service="unknown" として本番メトリクスに混ざるので、dev では設定しないこと。
 */

/**
 * コレクタのオリジン。未設定なら null（＝RUM 無効）。
 * URL として不正なら例外にする（サイレントに無効化すると「なぜか計測が来ない」で迷子になるため）。
 */
export function getRumOrigin(): string | null {
  const raw = process.env.RUM_ORIGIN?.trim();
  if (!raw) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`RUM_ORIGIN が URL として不正です: "${raw}"（例: https://rum.piyo.me）`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`RUM_ORIGIN は http/https のみ指定できます: "${raw}"`);
  }
  // パスやクエリが付いていても CSP のソース表現に使えるオリジンだけを採用する
  return url.origin;
}

/**
 * ビーコンスクリプトの URL。未設定なら null。
 * service / path_group はコレクタ側の rum-config.json で解決するため、属性は付けない。
 */
export function getRumBeaconUrl(): string | null {
  const origin = getRumOrigin();
  return origin === null ? null : `${origin}/beacon.js`;
}
