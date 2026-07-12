import { defineConfig, configDefaults } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    // ゴールデン画像テストは skia-canvas 実描画が要る＝本番同一の Docker 環境でのみ実行する。
    // 高速 CI（--ignore-scripts で skia ネイティブ無し）では走らせない。専用 config で別建て。
    exclude: [...configDefaults.exclude, "**/*.golden.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
