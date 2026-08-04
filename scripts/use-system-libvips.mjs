// sharp の prebuilt バイナリ（@img/sharp-*）は HEVC コーデックを内蔵しておらず、
// HEIC（iPhone写真の大半）をデコードできない（HEVCのパテント問題で同梱不可）。
//
// そこで system libvips（libheif/libde265 付き）に対して sharp をソースビルドし、
// 成功したら prebuilt を取り除いてソースビルド版をランタイムで使わせる。
//   - 本番(Docker): apk の vips-dev/libheif-dev/libde265-dev（Alpine 3.24 で 8.18.2）
//   - ローカル(mac): brew install vips
//
// REQUIRE_SYSTEM_LIBVIPS=1（Dockerfile の deps ステージが設定）では、失敗を必ず
// 非ゼロ終了にしてイメージビルドを止める。未設定（ローカル mac 等）は警告のみで継続する
// （HEIC は読めないが他機能は動作する）。
//
//   pitfall: 以前はどの環境でも警告だけ出して継続していた。prebuilt が残っても sharp は
//   正常に起動しヘルスチェックも通るため、「HEIC 投稿だけが死んだイメージ」が無言で本番へ
//   出ていく。iPhone ユーザーの投稿が壊れて初めて気づくことになる。
//
//   なお prebuilt を最初から入れない（npm ci --omit=optional）という回避は採れない。
//   @next/swc-* / lightningcss-* / @tailwindcss/oxide-* などビルド必須のネイティブも
//   optional dependency のため、まとめて落ちて next build が失敗する。
//
// 詳細は CLAUDE.md「HEIC対応」セクション参照。postinstall から実行される。
import { readdirSync, rmSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";

const strict = process.env.REQUIRE_SYSTEM_LIBVIPS === "1";
const log = (msg) => console.log(`[use-system-libvips] ${msg}`);

/** strict なら中断、そうでなければ警告して継続する。 */
function bail(lines) {
  const body = lines.map((l) => `[use-system-libvips] ${l}`).join("\n");
  if (strict) {
    console.error(`\n${body}\n[use-system-libvips] REQUIRE_SYSTEM_LIBVIPS=1 のため中断します。\n`);
    process.exit(1);
  }
  console.warn(`\n${body}\n[use-system-libvips] prebuilt のまま続行します（HEIC は読めません）。\n`);
  process.exit(0);
}

/** system libvips（vips-dev / brew vips）のバージョン。取得できなければ null。 */
function systemVipsVersion() {
  try {
    return execSync("pkg-config --modversion vips", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

try {
  execSync("npm rebuild sharp --build-from-source", {
    stdio: "inherit",
    env: { ...process.env, SHARP_FORCE_GLOBAL_LIBVIPS: "1" },
  });
} catch {
  bail([
    "sharp を system libvips へソースビルドできませんでした。",
    "HEIC を扱うには system libvips が必要です（mac: brew install vips）。",
  ]);
}

// ソースビルド成功 → prebuilt の sharp ローダ/libvips を除去（@img/colour 等は残す）。
// sharp のローダは @img/sharp-<platform> があればそちらを優先するため、消さないと
// ソースビルド版は使われない。
const imgDir = "node_modules/@img";
if (existsSync(imgDir)) {
  for (const name of readdirSync(imgDir)) {
    if (name.startsWith("sharp-")) {
      rmSync(`${imgDir}/${name}`, { recursive: true, force: true });
    }
  }
}

// rebuild の終了コードだけでは「本当に system libvips を使えているか」は分からないので、
// 実際に読み込んで確かめる。prebuilt 除去後に評価する必要がある（除去前はローダが
// prebuilt を返してしまい、何を検査しても prebuilt の値になる）。
const sharp = (await import("sharp")).default;
const problems = [];

// prebuilt 除去（rmSync は失敗すれば例外を投げる）が効いていれば、ここで読めた sharp は
// ソースビルド版しかありえない。その上で runtime の libvips が system と一致するかを見て、
// 別バージョンの libvips に動的リンクされていないことまで確かめる
// （例: sharp 0.34.5 の prebuilt は 8.18.3 / Alpine 3.24 の apk は 8.18.2）。
const systemVips = systemVipsVersion();
if (!systemVips) {
  problems.push("pkg-config で system libvips のバージョンを取得できませんでした（pkgconf 未導入？）。");
} else if (sharp.versions.vips !== systemVips) {
  problems.push(
    `libvips が system(${systemVips}) と不一致(${sharp.versions.vips})＝prebuilt が使われています。`
  );
}

// HEIF ローダの有無。prebuilt も heif.input は true を返す（HEVC が引けないだけ）ので
// 単独では prebuilt を見分けられない。上のバージョン一致と組で意味を持つ。
if (!sharp.format.heif?.input?.buffer) {
  problems.push("libvips に HEIF ローダーがありません（libheif-dev 付きでビルドされていない）。");
}

if (problems.length > 0) bail(problems);

log(`sharp ${sharp.versions.sharp} / system libvips ${sharp.versions.vips} (HEIC enabled).`);
