/**
 * RUM（Real User Monitoring）ビーコンの配信（env 読み取りの単一集約点）。
 *
 * - RUM_ENABLED: "1" のときだけビーコン <script> を配信する。未設定なら RUM 自体を無効化する。
 *
 * ビーコンは自サイトと同じオリジンの `/_n-rum/` から配る。このパスは Next へ届かない —
 * Ingress が `/_n-rum/{beacon.js,web-vitals.js,rum-config.json,collect}` の4パスだけを
 * コレクタ（next-rum）へ回し、プレフィックスを剥がす（k8s/worker-front-deployment.yaml 末尾の例）。
 * 同一オリジンなので CSP は script-src / connect-src とも 'self' で足り、緩和は要らない。
 *
 * 有効/無効を NODE_ENV で決めないのは、Ingress にルートが無い環境（検証環境・ローカルの
 * `next start`）だと `/_n-rum/beacon.js` が Next へ落ちて全ページ表示で 404 を出すため。
 * ルートを張った環境でだけ RUM_ENABLED を立てること。
 */

/** Ingress がコレクタへ回すパスのプレフィックス。変えるときは Ingress 側のルールも直す。 */
const RUM_PATH_PREFIX = "/_n-rum";

/**
 * RUM が有効か。
 * "1" 以外の値は例外にする（サイレントに無効化すると「なぜか計測が来ない」で迷子になるため）。
 */
export function isRumEnabled(): boolean {
  const raw = process.env.RUM_ENABLED?.trim();
  if (!raw) return false;
  if (raw !== "1") {
    throw new Error(`RUM_ENABLED は "1" のみ指定できます（無効にするなら未設定にする）: "${raw}"`);
  }
  return true;
}

/**
 * ビーコンスクリプトの URL（同一オリジンのパス）。無効なら null。
 * web-vitals.js / rum-config.json / collect は beacon.js が自分の置き場所から相対で解決し、
 * service / path_group はコレクタ側の rum-config.json で解決するため、属性は付けない。
 */
export function getRumBeaconUrl(): string | null {
  return isRumEnabled() ? `${RUM_PATH_PREFIX}/beacon.js` : null;
}
