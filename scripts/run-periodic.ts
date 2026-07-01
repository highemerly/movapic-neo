/**
 * 定期ジョブ（periodic）を手動実行するスクリプト。
 *
 * 本番では worker-front が graphile-worker の crontab で30分ごとに回すが、動作確認や
 * バックログ消化のために手元から1回だけ叩きたいときに使う。
 *
 * 使用方法（env は .env.local → .env の順に自動ロード。シェルの環境変数が最優先）:
 *   # 全ジョブ（mention-poll / tmp-cleanup / favorite-sync）
 *   npx tsx scripts/run-periodic.ts
 *
 *   # 特定ジョブだけ（スペース/カンマ区切りで複数可）
 *   npx tsx scripts/run-periodic.ts favorite-sync
 *
 *   # 別DBを指定したいときはシェル変数で上書き
 *   DATABASE_URL="postgresql://..." npx tsx scripts/run-periodic.ts favorite-sync
 *
 * 注意:
 * - favorite-sync はオーナーインスタンスへ未認証 GET する（連携先へ実アクセスが飛ぶ）。
 * - mention-poll は MASTODON_BOT_* env が必要（未設定だとそのジョブだけ失敗ログを出す）。
 * - tmp-cleanup はオブジェクトストレージの tmp/ を実際に掃除する（storage env が必要）。
 * - 各ジョブは runPeriodicJobs 内で try/catch 隔離されるため、1つ失敗しても他は続行する。
 */

import dotenv from "dotenv";
// `dotenv/config` は .env しか読まないが、このプロジェクトの env は Next.js 規約の .env.local。
// .env.local を先に読み（既存の環境変数は上書きしない＝シェル指定が最優先）、.env をフォールバック。
dotenv.config({ path: ".env.local" });
dotenv.config();

import { runPeriodicJobs, PERIODIC_JOB_NAMES } from "@/lib/periodic";

async function main(): Promise<void> {
  // 引数（スペース/カンマ区切り）で実行ジョブを絞る。未指定なら全実行。
  const requested = process.argv
    .slice(2)
    .flatMap((a) => a.split(","))
    .map((s) => s.trim())
    .filter(Boolean);

  const unknown = requested.filter((n) => !PERIODIC_JOB_NAMES.includes(n));
  if (unknown.length > 0) {
    console.error(`不明なジョブ名: ${unknown.join(", ")}`);
    console.error(`利用可能: ${PERIODIC_JOB_NAMES.join(", ")}`);
    process.exit(1);
  }

  const target = requested.length > 0 ? requested : PERIODIC_JOB_NAMES;
  console.log(`[run-periodic] 実行: ${target.join(", ")}`);
  const start = Date.now();
  await runPeriodicJobs(requested.length > 0 ? requested : undefined);
  console.log(`[run-periodic] 完了 (${Date.now() - start}ms)`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[run-periodic] 失敗:", err);
    process.exit(1);
  });
