/**
 * 定期フォールバック sync の対象を DB 側で先に絞る WHERE 句。
 *
 * 条件の正は isFavoriteSyncDue()（favoritePolicy.ts・ユニットテスト済み）。これはそれを
 * SQL 側で先に絞る最適化で、次の2箇所で共有する（両者のズレを防ぐため1定義に集約）:
 *   - periodic ジョブ（対象抽出＋backlog COUNT）… src/lib/periodic/index.ts
 *   - /admin/stats（backlog 可視化）… src/lib/adminStats.ts
 *
 * 副作用なし（Prisma.sql を組むだけ）。worker 依存を芋づるで load しないよう、
 * periodic 本体からは切り離してこのファイルに置く。
 */

import { Prisma } from "@prisma/client";

// 対象選別の WHERE 句（id 抽出・件数 COUNT で共有し、両者のズレを防ぐ）。
export const FAVORITE_SYNC_WHERE = Prisma.sql`
  is_public = true
  AND is_disabled = false
  AND post_id IS NOT NULL
  AND created_at <= now() - interval '1 day'
  -- 16日超は恒久停止（成功/失敗を問わずリトライしない）
  AND created_at > now() - interval '16 days'
  -- 429以外の4xx（deleted/forbidden 等）は回復見込みが薄いので定期リトライしない
  AND NOT COALESCE(post_status >= 400 AND post_status < 500 AND post_status <> 429, false)
  AND (
    favorites_synced_at IS NULL
    -- バックオフ: 成功(200)/未syncは12時間、一時障害(429/5xx/0)は1日（isFavoriteSyncDue と一致）
    OR favorites_synced_at <= now() - (
      CASE WHEN post_status = 200 THEN interval '12 hours' ELSE interval '1 day' END
    )
  )
  AND (
    NOT COALESCE(
      post_status = 200 AND favorites_synced_at >= created_at + interval '1 day',
      false
    )
    OR (
      created_at <= now() - interval '14 days'
      AND NOT COALESCE(
        post_status = 200 AND favorites_synced_at >= created_at + interval '14 days',
        false
      )
    )
  )
`;
