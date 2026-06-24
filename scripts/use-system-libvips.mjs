// sharp の prebuilt バイナリ（@img/sharp-*）は HEVC コーデックを内蔵しておらず、
// HEIC（iPhone写真の大半）をデコードできない（HEVCのパテント問題で同梱不可）。
//
// そこで system libvips（libheif/libde265 付き）に対して sharp をソースビルドし、
// 成功したら prebuilt を取り除いてソースビルド版をランタイムで使わせる。
//
// system libvips が無い/古い（< 8.17.3）環境ではビルドに失敗するが、その場合は
// prebuilt のままインストールを継続する（HEIC は読めないが他機能は動作する）。
//   - 本番(Docker): apk の vips-dev/libheif-dev/libde265-dev（Alpine 3.24 で 8.18.2）
//   - ローカル(mac): brew install vips
//
// 詳細は CLAUDE.md「HEIC対応」セクション参照。postinstall から実行される。
import { readdirSync, rmSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";

try {
  execSync("npm rebuild sharp --build-from-source", {
    stdio: "inherit",
    env: { ...process.env, SHARP_FORCE_GLOBAL_LIBVIPS: "1" },
  });
} catch {
  console.warn(
    "\n[use-system-libvips] sharp を system libvips へソースビルドできませんでした。" +
      "\n[use-system-libvips] HEIC を扱うには system libvips が必要です（mac: brew install vips）。" +
      "\n[use-system-libvips] prebuilt のまま続行します（HEIC は読めません）。\n"
  );
  process.exit(0);
}

// ソースビルド成功 → prebuilt の sharp ローダ/libvips を除去（@img/colour 等は残す）
const imgDir = "node_modules/@img";
if (existsSync(imgDir)) {
  for (const name of readdirSync(imgDir)) {
    if (name.startsWith("sharp-")) {
      rmSync(`${imgDir}/${name}`, { recursive: true, force: true });
    }
  }
}
console.log("[use-system-libvips] sharp is now using system libvips (HEIC enabled).");
