import { defineConfig, devices } from "@playwright/test";

// E2E スモークテスト。本番イメージを e2e/compose.yml で起動した状態で回す。
// 「開いて壊れていないか」だけを見る軽いテストに留める（画面操作は壊れやすいので入れない）。
// リトライはしない（落ちたら原因を見る）。
export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  // 既定は実行時のカレント（リポジトリ直下）に作られるため、e2e/ の下に固定する（.gitignore 済み）。
  outputDir: "test-results",
  // generate はIP単位で 10秒に2回までのため、並列にしない。
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]]
    : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3100",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
