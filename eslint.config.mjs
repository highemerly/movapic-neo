import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// 日付の区切り（docs/features.md「日付の区切り」）の回帰防止。
// カレンダー・皆勤賞・連続投稿など、ユーザーの「日」「月」を扱うコードは記録日（Image.postDate と
// @/lib/dayClock の今日）で判定する。投稿時刻から JST の日付を計算し直すと、区切りを 0 時以外にした人の
// 深夜の投稿が別の日に数えられ、カレンダーと👑・穴埋めが食い違う。時計どおりに判定するもの
// （早起き・書き初め等）は dayClock の jstCalendarDateOf と streak の toJstHour を使う。
const DAY_SEMANTIC_FILES = [
  "src/lib/makeup/**",
  "src/lib/achievements/**",
  "src/lib/calendar/**",
  "src/lib/notifications/**",
  "src/lib/publish/**",
  "src/lib/stats/**",
  "src/lib/userStats.ts",
  "src/components/calendar/**",
  "src/components/achievements/**",
  "src/app/u/**",
  "src/app/dashboard/**",
  "src/app/settings/**",
  "src/app/api/v1/calendar/**",
  "src/app/api/v1/images/**",
  "src/app/api/v1/me/**",
  "src/app/api/v1/public/users/**",
  "scripts/backfill-achievements.ts",
];
const DAY_SEMANTIC_MESSAGE =
  "「日」「月」は記録日（Image.postDate と @/lib/dayClock）で判定する。JST の日付を計算し直さない（docs/features.md「日付の区切り」）。";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: DAY_SEMANTIC_FILES,
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/jst", "**/jst"],
              importNames: ["toJstYm", "jstDayOf", "jstMonthRange", "jstMonthRangeOfYm"],
              message: DAY_SEMANTIC_MESSAGE,
            },
            {
              group: ["@/lib/streak", "**/streak"],
              importNames: ["toJstDateString"],
              message: DAY_SEMANTIC_MESSAGE,
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // テストのカバレッジ出力（npm run test:coverage が生成・git 管理外）
    "coverage/**",
  ]),
]);

export default eslintConfig;
