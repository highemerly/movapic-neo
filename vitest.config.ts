import { defineConfig, configDefaults } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    // ゴールデン画像テストは skia-canvas 実描画が要る＝本番同一の Docker 環境でのみ実行する。
    // 高速 CI（--ignore-scripts で skia ネイティブ無し）では走らせない。専用 config で別建て。
    exclude: [...configDefaults.exclude, "**/*.golden.test.ts"],

    // カバレッジは「unit テストで守る対象」を母数にする（--coverage 指定時のみ有効）。
    // include を指定すると未 import ファイルも 0% として可視化され、本当の穴を隠さない
    // （Vitest 4 では include 指定時これがデフォルト。旧 all:true は廃止）。
    // include にロジック層（lib）と API ルートを入れ、下記は意図的に除外する:
    //  - 実描画（overlay/stamp/neon/rotate/calendarCollage/format/fonts/seasons）は
    //    ゴールデン画像テスト（Docker）が担当＝unit 母数から外す。
    //  - IO/インフラ/薄いラッパ（db/compute/storage/queue/periodic/pwa/bot/fonts）は
    //    モックコストの割に得るものが少なく unit 対象外と割り切る。
    // ※ fediverse / stats / mention / achievements(集計) 等の「本当の穴」は除外せず可視に残す。
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts", "src/app/api/**/*.ts"],
      exclude: [
        "**/*.test.ts",
        "**/*.d.ts",
        // 実描画＝ゴールデン画像テスト担当
        "src/lib/image/overlay.ts",
        "src/lib/image/stamp.ts",
        "src/lib/image/neon.ts",
        "src/lib/image/rotate.ts",
        "src/lib/image/calendarCollage.ts",
        "src/lib/image/format.ts",
        "src/lib/image/fonts.ts",
        "src/lib/image/seasons/**",
        // IO/インフラ/薄いラッパ＝unit 対象外
        "src/lib/db/**",
        "src/lib/compute/**",
        "src/lib/storage/**",
        "src/lib/queue/**",
        "src/lib/periodic/**",
        "src/lib/pwa/**",
        "src/lib/bot/**",
        "src/lib/fonts/**",
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
