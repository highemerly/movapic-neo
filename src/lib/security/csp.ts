/**
 * Content-Security-Policy の組み立て（純粋関数）。proxy.ts がリクエストごとに nonce を作って呼ぶ。
 *
 * script-src はインラインを nonce で許可する（'unsafe-inline' を使わない）:
 *  - Next.js はリクエストの CSP ヘッダから nonce を読み、自分のスクリプトに自動で付ける。
 *    自前のインライン（layout の standalone 判定など）と next-themes には layout が x-nonce を渡す。
 *  - nonce は全ページが動的描画であることが前提（静的ページには入らず壊れる）。現状は root layout が
 *    Cookie を読むため全ルートが動的（2026-10-18 の build で 92/92 が ƒ）。
 *  - 'strict-dynamic' は付けない: 付けると 'self' が無視され、Service Worker（sw.js）の登録など
 *    nonce を付けられない同一オリジンのスクリプトが通るか保証できないため。同一オリジンの外部スクリプト
 *    （Next のチャンク・RUM ビーコン）は 'self'、インラインは nonce で許可する。
 * pitfall: 以前は script-src 'unsafe-inline' で、XSS に対する多層防御としてほぼ効いていなかった。
 *
 * style-src は 'unsafe-inline' のまま（React の style 属性は nonce では許可できないため）。
 */
export function buildContentSecurityPolicy(params: {
  nonce: string;
  isDev: boolean;
  /** アバター等のメディアプロキシのオリジン（未設定なら空文字） */
  mediaProxyOrigin: string;
  /** 投稿画像の公開ストレージのオリジン（未設定なら空文字） */
  storagePublicOrigin: string;
}): string {
  const { nonce, isDev, mediaProxyOrigin, storagePublicOrigin } = params;
  const imgSources = ["'self'", "data:", "blob:", mediaProxyOrigin, storagePublicOrigin]
    .filter(Boolean)
    .join(" ");
  return [
    "default-src 'self'",
    // dev 時のみ React のデバッグ（サーバー側エラースタックの復元）に eval が要る
    `script-src 'self' 'nonce-${nonce}'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'", // Tailwind・React の style 属性
    `img-src ${imgSources}`, // 画像: アバターproxy・投稿画像
    "font-src 'self'",
    "connect-src 'self' https:", // Fediverseインスタンスは任意のため https: を維持
    "object-src 'none'", // <object>/<embed>/<applet> 系プラグイン埋め込みを封じる（default-srcより厳格に明示）
    "frame-ancestors 'none'", // iframe埋め込み禁止
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

/** CSP に載せる nonce を作る（リクエストごとに一意・推測不能）。 */
export function generateCspNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString("base64");
}
