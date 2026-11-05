/**
 * アプリの版と、ランタイムのソフトウェアバージョン（アプリ / Next.js / Node.js）。
 *
 * 全 tier（web / worker-front / compute）は同一 Docker イメージだが、各 pod が
 * 自分のプロセスから返すことで、ローリング更新中の tier 間バージョンずれ
 * （スキュー）を検知できる。/api/health・/api/health/stream の両レスポンスに載せ、
 * /admin/stats のヘルスカードで表示する。
 */
import nextPkg from "next/package.json";

/**
 * アプリの版。next.config.ts がビルド時に埋め込む（タグのビルドは "1.5.5"、それ以外は "dev.YYYYMMDDHHMMSS"）。
 * Next を通らない実行（vitest・tsx のスクリプト）では埋め込まれないので "unknown"。
 */
export const APP_VERSION = process.env.APP_VERSION ?? "unknown";

/** 画面に出す表記。リリースの版だけ "v" を付ける（"vdev.…" にしない）。 */
export const APP_VERSION_LABEL = /^\d/.test(APP_VERSION) ? `v${APP_VERSION}` : APP_VERSION;

export interface RuntimeVersions {
  app: string;
  next: string;
  node: string;
}

export function runtimeVersions(): RuntimeVersions {
  return {
    app: APP_VERSION,
    next: nextPkg.version,
    node: process.version.replace(/^v/, ""),
  };
}
