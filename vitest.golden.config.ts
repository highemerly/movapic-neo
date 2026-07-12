import { defineConfig } from "vitest/config";
import path from "path";

// ゴールデン画像テスト専用の設定。skia-canvas の実描画を伴うため、
// フォント・skia ネイティブが揃った本番同一の Docker 環境（Dockerfile の golden-test ステージ）で実行する。
// 正解 PNG の更新も同じ環境で: GOLDEN_UPDATE=1 npm run test:golden
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["**/*.golden.test.ts"],
    // 描画1件あたりは速いが、フォント初期化ぶんの余裕を持たせる。
    testTimeout: 30000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
