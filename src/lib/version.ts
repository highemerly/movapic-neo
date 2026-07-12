/**
 * ランタイムのソフトウェアバージョン（アプリ / Next.js / Node.js）。
 *
 * 全 tier（web / worker-front / compute）は同一 Docker イメージだが、各 pod が
 * 自分のプロセスから返すことで、ローリング更新中の tier 間バージョンずれ
 * （スキュー）を検知できる。/api/health・/api/health/stream の両レスポンスに載せ、
 * /admin/stats のヘルスカードで表示する。
 */
import pkg from "../../package.json";
import nextPkg from "next/package.json";

export interface RuntimeVersions {
  app: string;
  next: string;
  node: string;
}

export function runtimeVersions(): RuntimeVersions {
  return {
    app: pkg.version,
    next: nextPkg.version,
    node: process.version.replace(/^v/, ""),
  };
}
